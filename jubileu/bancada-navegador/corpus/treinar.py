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


# O caminho do corpus é parâmetro desde que o treino passou a ter versões: a
# v1 sai do corpus escrito à mão, a v2 soma o destilado, a v3 soma o on-policy.
treino = Remendos(Path(os.environ.get('TREINO', AQUI / 'treino.jsonl')))

# ── A AFERIÇÃO TEM QUE FALAR A LÍNGUA DO TREINO ──────────────────────────
#
# Os 24 alvos de `afericao.jsonl` são só a frase, sem bloco de pensamento —
# foram escritos antes de existir destilação. Quando o corpus passa a ter
# <think>…</think>, o modelo aprende a escrever o bloco e a perda de aferição
# SOBE por isso, não por decorar. Medido na primeira v2: treino de 1,05 para
# 0,30 e aferição de 3,60 para 4,85, com o modelo melhorando.
#
# Um instrumento que sobe quando a coisa melhora é pior que instrumento
# nenhum, porque parece que está funcionando. Então quando os formatos
# divergem, a aferição sai de uma FATIA SEPARADA do próprio corpus — mesma
# língua, e aí a subida volta a significar decorar.
def _tem_bloco(caminho):
    import json as _j
    for linha in Path(caminho).read_text().splitlines():
        if linha.strip():
            return _j.loads(linha)['messages'][-1]['content'].startswith('<think>')
    return False


_arq_treino = Path(os.environ.get('TREINO', AQUI / 'treino.jsonl'))
_arq_afere = Path(os.environ.get('AFERE', AQUI / 'afericao.jsonl'))
if _tem_bloco(_arq_treino) != _tem_bloco(_arq_afere):
    corte = max(8, int(0.06 * len(treino.itens)))
    afere = Remendos.__new__(Remendos)
    afere.itens = treino.itens[-corte:]
    treino.itens = treino.itens[:-corte]
    print(f'  aferição: {corte} linhas separadas do próprio corpus '
          f'(o arquivo de aferição está noutro formato e mediria errado)', flush=True)
else:
    afere = Remendos(_arq_afere)
print(f'  {len(treino)} linhas de treino · {len(afere)} de aferição · modelo {MODELO}', flush=True)

# ── CPU E GPU NA MESMA RECEITA ───────────────────────────────────────────
# Na CPU só float32 treina de verdade; numa T4 o que existe é fp16, e da L4 em
# diante bf16, que é o único dos três que não pede escalonamento de perda.
NA_GPU = torch.cuda.is_available()
# ── bf16 NA CPU TAMBÉM, QUANDO A MÁQUINA TEM A INSTRUÇÃO ─────────────────
#
# A linha antiga só considerava bf16 na GPU e caía em float32 na CPU. Medido
# nesta máquina, um Xeon com avx512_bf16, treinando o SmolLM2-135M:
#
#   float32    5,89 s por 1024 tokens   174 tok/s
#   bfloat16   1,78 s por 1024 tokens   576 tok/s
#
# São 3,3 vezes, de graça, numa linha. A conta de quanto custaria um treino
# aqui estava três vezes pessimista por causa disso, e isso quase fez a gente
# desistir de um experimento que cabe numa tarde.
#
# `avx512_bf16` é o que importa: sem ele o PyTorch emula bf16 e fica MAIS lento
# que float32, então a checagem é pela instrução e não pelo desejo.
def _cpu_tem_bf16():
    try:
        return 'avx512_bf16' in Path('/proc/cpuinfo').read_text()
    except OSError:
        return False


BF16 = (NA_GPU and torch.cuda.is_bf16_supported()) or (not NA_GPU and _cpu_tem_bf16())
if BF16 and not NA_GPU:
    print('  CPU com avx512_bf16: treinando em bf16 (3,3x mais rápido que float32)', flush=True)
modelo = AutoModelForCausalLM.from_pretrained(
    MODELO, dtype=torch.bfloat16 if BF16 else torch.float32)
if NA_GPU:
    modelo.cuda()
    print(f'  GPU: {torch.cuda.get_device_name(0)} · {"bf16" if BF16 else "fp16"}', flush=True)
modelo.config.use_cache = False
# ── OS ALVOS DO LoRA SE DESCOBREM, NÃO SE ADIVINHAM ──────────────────────
#
# A lista fixa (q_proj, k_proj, …) era do SmolLM2, um transformer comum. O
# Qwen3.5-0.8B é HÍBRIDO: 18 das 24 camadas são Gated DeltaNet, e as lineares
# delas se chamam in_proj_qkv, in_proj_z, in_proj_b, in_proj_a e out_proj. Com a
# lista fixa, TRÊS QUARTOS das camadas não receberiam adaptação nenhuma — e o
# treino "funcionaria", só que aprendendo com um quarto do modelo.
#
# Descobrir pelas camadas lineares de verdade serve qualquer arquitetura, que é
# o que este script precisa agora que o aluno mudou de família.
import torch.nn as nn
sufixos = sorted({
    nome.split('.')[-1]
    for nome, mod in modelo.named_modules()
    if isinstance(mod, nn.Linear) and not nome.endswith('lm_head')
})
print(f'  LoRA em {sufixos}', flush=True)
# ── O DESPACHANTE DO peft PODE EXPLODIR ANTES DE COMEÇAR ─────────────────
#
# `get_peft_model` percorre uma lista de despachantes para decidir que tipo de
# camada LoRA criar, e um deles pergunta se o torchao está disponível. Essa
# pergunta LEVANTA ImportError quando o torchao existe numa versão velha, em
# vez de responder "não" — e o Colab traz a 0.10.0 pré-instalada, enquanto o
# peft exige 0.16. O treino morria antes do primeiro passo, com um erro que não
# fala de LoRA nem de treino.
#
# A mensagem aqui existe porque o traceback do peft não diz o que fazer.
try:
    modelo = get_peft_model(modelo, LoraConfig(
        r=32, lora_alpha=64, lora_dropout=0.05, bias='none',
        task_type='CAUSAL_LM', target_modules=sufixos,
    ))
except ImportError as e:
    if 'torchao' not in str(e):
        raise
    raise SystemExit(
        f'  {e}\n\n'
        '  Isto não é o treino: é o despachante do peft perguntando pelo torchao\n'
        '  e recebendo uma exceção em vez de um "não". Nada aqui usa torchao.\n'
        '  Tire ele da frente e rode de novo:\n\n'
        '      pip uninstall -y torchao\n')
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
# ── MESCLAR É OPCIONAL, E AQUI O DISCO MANDA ─────────────────────────────
#
# O aluno de 0,8B mesclado ocupa ~1,5 GB em bf16, e esta caixa tem menos que
# isso livre. Para GERAR (que é o que o on-policy precisa em seguida) o adaptador
# basta: o PEFT carrega base + LoRA e responde igual. A mesclagem só é obrigatória
# para converter em gguf, e aí dá para liberar espaço antes.
if os.environ.get('MESCLAR', '1') != '1':
    modelo.save_pretrained(SAIDA)
    tok.save_pretrained(SAIDA)
    print(f'\n  adaptador salvo (sem mesclar) em {SAIDA}', flush=True)
    print(f'  pronto em {(time.time() - t0) / 60:.1f} min', flush=True)
    raise SystemExit(0)

inteiro = modelo.merge_and_unload()
# bf16 e não fp32: 752M em fp32 são 3 GB, e este disco não comporta.
inteiro = inteiro.to(torch.bfloat16)
inteiro.config.use_cache = True
if NA_GPU:
    # O gguf sai de pesos em CPU; e float32 na conversão evita uma segunda
    # perda de precisão antes do q8_0.
    inteiro = inteiro.to(torch.float32).cpu()
inteiro.save_pretrained(SAIDA)
tok.save_pretrained(SAIDA)
print(f'  pronto em {(time.time() - t0) / 60:.1f} min → {SAIDA}', flush=True)
