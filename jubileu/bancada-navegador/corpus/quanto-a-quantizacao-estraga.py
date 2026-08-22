# ── QUANTO A QUANTIZAÇÃO ESTRAGA O PROFESSOR, MEDIDO ─────────────────────
#
# Pergunta do dono do jogo, e ela está certa: "tem qualidades e qualidades,
# não adianta nada a gente treinar com um qwen 27b bem nerfado".
#
# ── POR QUE O CONSENSO SOBRE 4 BITS NÃO SERVE AQUI ───────────────────────
#
# Os relatos de que NF4 é indolor medem ACERTO DE TAREFA, e acerto de tarefa
# depende do argmax. O primeiro colocado é robusto: o ruído da quantização quase
# nunca troca quem ganha. Só que a destilação por KL a T=2 treina exatamente o
# contrário disso — ela manda o aluno reproduzir a CAUDA, a ordem e a magnitude
# dos tokens que o professor considerou e descartou. É onde o erro relativo da
# quantização é maior. O caso de uso escolhido é o pior caso para 4 bits, então
# o consenso não licencia nada e a medida tem que ser feita.
#
# ── A MEDIDA ─────────────────────────────────────────────────────────────
#
# Uma referência e uma candidata veem as MESMAS sequências, e a saída é:
#
#   KL(referência ‖ candidata) por token, a T=1 e a T=2
#       O quanto a quantização move a distribuição. É a mesma grandeza que o
#       treino minimiza, então dá para comparar maçã com maçã.
#   concordância do topo-1
#       A métrica enganosa, impressa de propósito ao lado das outras: ela vai
#       dar 99% e não quer dizer nada para este uso.
#   concordância de ordem no topo-50
#       A métrica que importa: se a ordem da cauda embaralha, o sinal de estilo
#       embaralha junto.
#
# ── O CRITÉRIO, ESCRITO ANTES DE VER O RESULTADO ─────────────────────────
#
# O que decide não é o KL da quantização sozinho, é a razão dele para o KL que
# o ALUNO tem no começo — que é o sinal que o treino vai gastar 600 passos
# encolhendo. O script mede os dois e imprime a razão:
#
#   abaixo de 2%    ruído irrelevante, pode usar
#   entre 2% e 10%  usável, mas o teto do aluno fica visivelmente mais baixo
#   acima de 10%    nerfado: uma parte grande do que ele aprenderia é artefato
#
#   MESTRE=Qwen/Qwen3.8-27B REF=8 CAND=4 POSICOES=200 \
#     python3 corpus/quanto-a-quantizacao-estraga.py
#
# REF=16 usa bf16 com descarga para a RAM do sistema: é a referência de
# verdade, e é lenta. Com poucas posições ela cabe em minutos, e é o único jeito
# de responder "e se as DUAS estiverem erradas juntas?".
import json, os, gc
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

AQUI = Path(__file__).resolve().parent
MESTRE = os.environ.get('MESTRE', 'Qwen/Qwen3.8-27B')
ALUNO = os.environ.get('ALUNO', 'Qwen/Qwen3.5-0.8B')
CORPUS = Path(os.environ.get('CORPUS', AQUI / 'destilado.jsonl'))
REF = os.environ.get('REF', '8')
CAND = os.environ.get('CAND', '4')
POSICOES = int(os.environ.get('POSICOES', 200))
GUARDA = Path(os.environ.get('GUARDA', '/content/logits-ref.pt'))

tok = AutoTokenizer.from_pretrained(ALUNO)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token


def sequencias():
    """Trechos reais do corpus: enunciado + a resposta que o professor deu.

    Medir em texto genérico responderia sobre texto genérico. A pergunta é sobre
    ESTE domínio, então as posições avaliadas são as que o treino vai ver.
    """
    fora = []
    for linha in CORPUS.read_text().splitlines():
        if not linha.strip():
            continue
        msgs = json.loads(linha)['messages']
        texto = tok.apply_chat_template(msgs, tokenize=False)
        ids = tok(texto, add_special_tokens=False)['input_ids'][:384]
        if len(ids) > 32:
            fora.append(ids)
        if sum(len(x) for x in fora) > POSICOES * 4:
            break
    return fora


def carregar(modo, nome):
    kw = {'dtype': torch.bfloat16}
    if modo == '4':
        kw['quantization_config'] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type='nf4',
            bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
        kw['device_map'] = 'cuda:0'
    elif modo == '8':
        kw['quantization_config'] = BitsAndBytesConfig(load_in_8bit=True)
        kw['device_map'] = 'cuda:0'
    else:
        # bf16 não cabe em 40 GB: parte fica na RAM do sistema e o transformers
        # traz camada por camada. Lento e exato — que é o papel da referência.
        kw['device_map'] = 'auto'
        kw['max_memory'] = {0: '36GiB', 'cpu': '70GiB'}
    m = AutoModelForCausalLM.from_pretrained(nome, **kw)
    m.eval()
    m.config.use_cache = False
    return m


@torch.no_grad()
def colher(modelo, seqs, limite):
    """Devolve os logits das primeiras `limite` posições, em float16, na CPU."""
    saida, contados = [], 0
    for ids in seqs:
        if contados >= limite:
            break
        t = torch.tensor([ids]).to(modelo.device if hasattr(modelo, 'device') else 'cuda')
        lg = modelo(input_ids=t).logits[0].float().cpu()
        pega = min(len(ids), limite - contados)
        saida.append(lg[:pega].half())
        contados += pega
    return torch.cat(saida, dim=0)


def comparar(a, b, T):
    """KL(a ‖ b) média por posição, com a e b em logits crus."""
    la = F.log_softmax(a.float() / T, dim=-1)
    lb = F.log_softmax(b.float() / T, dim=-1)
    return float((la.exp() * (la - lb)).sum(-1).mean())


seqs = sequencias()
print(f'  {len(seqs)} sequências · {POSICOES} posições avaliadas', flush=True)

print(f'\n  ── referência: {MESTRE} em {REF} bits', flush=True)
ref = carregar(REF, MESTRE)
lg_ref = colher(ref, seqs, POSICOES)
del ref
gc.collect(); torch.cuda.empty_cache()
torch.save(lg_ref, GUARDA)

print(f'  ── candidata: {MESTRE} em {CAND} bits', flush=True)
cand = carregar(CAND, MESTRE)
lg_cand = colher(cand, seqs, POSICOES)
del cand
gc.collect(); torch.cuda.empty_cache()

print(f'  ── o aluno de partida: {ALUNO}', flush=True)
al = AutoModelForCausalLM.from_pretrained(ALUNO, dtype=torch.bfloat16).cuda().eval()
lg_aluno = colher(al, seqs, POSICOES)
del al
gc.collect(); torch.cuda.empty_cache()

print(f'\n{"═" * 74}')
for T in (1.0, 2.0):
    kl_q = comparar(lg_ref, lg_cand, T)
    kl_a = comparar(lg_ref, lg_aluno, T)
    razao = 100 * kl_q / kl_a if kl_a > 0 else float('inf')
    veredito = ('ruído irrelevante' if razao < 2
                else 'usável, teto mais baixo' if razao < 10
                else 'NERFADO')
    print(f'  T={T}  KL(ref‖{CAND}bits) {kl_q:.4f}   KL(ref‖aluno) {kl_a:.4f}   '
          f'razão {razao:.1f}%  → {veredito}')

topo1 = (lg_ref.argmax(-1) == lg_cand.argmax(-1)).float().mean()
k = 50
_, i_ref = lg_ref.topk(k, dim=-1)
_, i_cand = lg_cand.topk(k, dim=-1)
mesmo_conjunto = torch.tensor([
    len(set(a.tolist()) & set(b.tolist())) / k for a, b in zip(i_ref, i_cand)]).mean()
mesma_ordem = (i_ref == i_cand).float().mean()
print(f'\n  concordância topo-1      {100 * topo1:.1f}%   ← a métrica enganosa')
print(f'  mesmo conjunto no topo-50 {100 * mesmo_conjunto:.1f}%')
print(f'  MESMA ORDEM no topo-50    {100 * mesma_ordem:.1f}%   ← a que importa a T=2')
print(f'\n  Se a razão a T=2 passar de 10%, suba a candidata de bits antes de\n'
      f'  gastar A100: em int8 o professor de 27,78B ocupa ~28 GB e cabe em 40.')
