# ── TREINAR O REVISOR ─────────────────────────────────────────────────────
#
# Um LoRA em cima de um modelo pequeno que já sabe inglês. NÃO é treino do
# zero: um modelo de 50M treinado do zero precisa de bilhões de tokens só para
# aprender inglês, e isso é orçamento de laboratório. O que a gente precisa
# ensinar não é a língua — é a TAREFA e o CÂNONE, e isso cabe em milhares de
# exemplos.
#
# DUAS DECISÕES QUE MUDAM O RESULTADO:
#
# 1. A PERDA SÓ CONTA NA RESPOSTA. Sem máscara, o modelo gasta capacidade
#    aprendendo a prever o enunciado — que ele nunca vai precisar escrever. Os
#    tokens do prompt vão com -100.
# 2. LoRA, E NÃO AFINAÇÃO INTEIRA. Com 192 linhas, mexer em todos os pesos
#    apaga o inglês que a gente veio buscar. O LoRA move pouco e volta atrás.
#
# Uso:
#   MODELO=HuggingFaceTB/SmolLM2-360M-Instruct EPOCAS=6 python3 corpus/treinar.py
import json, os, sys, time
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
from peft import LoraConfig, get_peft_model

AQUI = Path(__file__).parent
MODELO = os.environ.get('MODELO', 'HuggingFaceTB/SmolLM2-360M-Instruct')
SAIDA = Path(os.environ.get('SAIDA', AQUI / 'revisor-treinado'))
EPOCAS = float(os.environ.get('EPOCAS', 8))
LR = float(os.environ.get('LR', 2e-4))
TETO = int(os.environ.get('TETO', 384))          # tokens por exemplo
torch.set_num_threads(int(os.environ.get('NUCLEOS', os.cpu_count() or 4)))

tok = AutoTokenizer.from_pretrained(MODELO)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token


class Remendos(Dataset):
    """Cada linha vira (entrada inteira, alvo mascarado até a resposta)."""

    def __init__(self, caminho):
        self.itens = []
        for linha in Path(caminho).read_text(encoding='utf-8').splitlines():
            if not linha.strip():
                continue
            msgs = json.loads(linha)['messages']
            # O prompt é tudo menos a resposta, montado pelo template do
            # próprio modelo — é assim que o jogo vai pedir, então é assim que
            # o treino tem que ver.
            prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
            inteiro = prompt + msgs[-1]['content'] + (tok.eos_token or '')
            ids_prompt = tok(prompt, add_special_tokens=False)['input_ids']
            ids = tok(inteiro, add_special_tokens=False)['input_ids'][:TETO]
            alvo = list(ids)
            for i in range(min(len(ids_prompt), len(alvo))):
                alvo[i] = -100
            if all(a == -100 for a in alvo):
                continue
            self.itens.append({'input_ids': ids, 'labels': alvo})

    def __len__(self):
        return len(self.itens)

    def __getitem__(self, i):
        return self.itens[i]


def juntar(lote):
    largura = max(len(x['input_ids']) for x in lote)
    pad = tok.pad_token_id
    return {
        'input_ids': torch.tensor([x['input_ids'] + [pad] * (largura - len(x['input_ids'])) for x in lote]),
        'labels': torch.tensor([x['labels'] + [-100] * (largura - len(x['labels'])) for x in lote]),
        'attention_mask': torch.tensor([[1] * len(x['input_ids']) + [0] * (largura - len(x['input_ids'])) for x in lote]),
    }


treino = Remendos(AQUI / 'treino.jsonl')
afere = Remendos(AQUI / 'afericao.jsonl')
print(f'  {len(treino)} linhas de treino · {len(afere)} de aferição · modelo {MODELO}', flush=True)

# ── CPU E GPU NA MESMA RECEITA ───────────────────────────────────────────
# Na CPU só float32 treina de verdade; numa T4 o que existe é fp16, e da L4 em
# diante bf16, que é o único dos três que não pede escalonamento de perda.
NA_GPU = torch.cuda.is_available()
BF16 = NA_GPU and torch.cuda.is_bf16_supported()
modelo = AutoModelForCausalLM.from_pretrained(
    MODELO, dtype=torch.bfloat16 if BF16 else torch.float32)
if NA_GPU:
    modelo.cuda()
    print(f'  GPU: {torch.cuda.get_device_name(0)} · {"bf16" if BF16 else "fp16"}', flush=True)
modelo.config.use_cache = False
alvos = [n for n, _ in modelo.named_modules() if n.endswith(('q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'))]
sufixos = sorted({n.split('.')[-1] for n in alvos})
print(f'  LoRA em {sufixos}', flush=True)
modelo = get_peft_model(modelo, LoraConfig(
    r=32, lora_alpha=64, lora_dropout=0.05, bias='none', task_type='CAUSAL_LM',
    target_modules=sufixos,
))
modelo.print_trainable_parameters()

t0 = time.time()
Trainer(
    model=modelo,
    args=TrainingArguments(
        output_dir=str(SAIDA / 'passos'), num_train_epochs=EPOCAS,
        per_device_train_batch_size=int(os.environ.get('LOTE', 4)),
        gradient_accumulation_steps=int(os.environ.get('ACUMULA', 2)),
        learning_rate=LR, lr_scheduler_type='cosine',
        # `warmup_ratio` saiu do TrainingArguments nesta versão; o que restou é
        # `warmup_steps`, e 10% dos passos é a mesma coisa dita em passos.
        warmup_steps=max(2, int(0.1 * EPOCAS * len(treino) / (int(os.environ.get('LOTE', 4)) * int(os.environ.get('ACUMULA', 2))))),
        logging_steps=5, save_strategy='no', report_to=[], use_cpu=not NA_GPU,
        bf16=BF16, fp16=NA_GPU and not BF16,
        eval_strategy='epoch' if len(afere) else 'no',
    ),
    train_dataset=treino, eval_dataset=afere if len(afere) else None,
    data_collator=juntar,
).train()

# Sai MESCLADO: o gguf não carrega adaptador solto, e o jogo carrega gguf.
print('\n  mesclando o LoRA nos pesos…', flush=True)
inteiro = modelo.merge_and_unload()
inteiro.config.use_cache = True
if NA_GPU:
    # O gguf sai de pesos em CPU; e float32 na conversão evita uma segunda
    # perda de precisão antes do q8_0.
    inteiro = inteiro.to(torch.float32).cpu()
inteiro.save_pretrained(SAIDA)
tok.save_pretrained(SAIDA)
print(f'  pronto em {(time.time() - t0) / 60:.1f} min → {SAIDA}', flush=True)
