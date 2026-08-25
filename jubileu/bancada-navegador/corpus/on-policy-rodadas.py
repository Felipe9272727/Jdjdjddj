# ── ON-POLICY EM FASES, PARA CABER NUMA PLACA SÓ ─────────────────────────
#
# O `on-policy-kl.py` põe professor e aluno na mesma GPU ao mesmo tempo. Numa
# A100 de 80 GiB isso rodou. Numa L4 de 22 não roda, e a conta diz por quê sem
# mistério: professor de 27,78B em 4 bits ocupa ~15,5 GiB e o aluno INTEIRO com
# gradientes e Adam de 8 bits ocupa ~5,25. São 20,75 de 22, e o que sobra não
# paga os logits de um vocabulário de 248 mil. Baixar o lote comprou quatro
# passos em vez de um; não é caminho, é adiamento.
#
# Aqui os dois nunca se encontram:
#
#   FASE=gerar     o aluno sozinho escreve as tentativas dele        ~3 GiB
#   FASE=pontuar   o professor sozinho diz o que teria previsto      ~17 GiB
#   FASE=treinar   o aluno sozinho aprende com o que foi salvo       ~8 GiB
#
# E isso devolve o que a L4 tinha tirado: sem o professor na memória, o treino
# INTEIRO cabe de novo — os 752M com a cabeça de saída, que é o que o dono do
# jogo pediu desde o começo e que o LoRA não entrega.
#
# ── O QUE SE PERDE, DITO NA CARA ─────────────────────────────────────────
#
# Duas coisas, e nenhuma é fatal:
#
#   1. TOP-K EM VEZ DO VOCABULÁRIO INTEIRO. Guardar 248.320 logits por posição
#      custaria meio giga por amostra. Guardamos os K maiores mais o logsumexp
#      da linha inteira — com isso a probabilidade exata dos K é reconstruível,
#      e a massa que sobrou é conhecida. O KL usa os K termos exatos mais UM
#      termo agregado para todo o resto. A cauda não some; ela vira um bloco.
#
#   2. ON-POLICY POR RODADA, NÃO POR PASSO. As amostras vêm do aluno de uma
#      rodada atrás, não do passo anterior. É a versão que os relatos de
#      destilação forte-para-fraca de fato usam, e a diferença entre "a cada
#      passo" e "a cada rodada" é de grau — as amostras continuam sendo do
#      aluno, que é o que separa on-policy de off-policy.
#
#   FASE=gerar   ALUNO=corpus/revisor-v2 AMOSTRAS=300 python3 corpus/on-policy-rodadas.py
#   FASE=pontuar MESTRE=Qwen/Qwen3.8-27B                python3 corpus/on-policy-rodadas.py
#   FASE=treinar ALUNO=corpus/revisor-v2 INTEIRO=1      python3 corpus/on-policy-rodadas.py
import json, os, time
from pathlib import Path

os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

AQUI = Path(__file__).resolve().parent
FASE = os.environ.get('FASE', '')
MESTRE = os.environ.get('MESTRE', 'Qwen/Qwen3.8-27B')
BASE_ALUNO = os.environ.get('BASE_ALUNO', 'Qwen/Qwen3.5-0.8B')
ALUNO = os.environ.get('ALUNO', str(AQUI / 'revisor-v2'))
SAIDA = Path(os.environ.get('SAIDA', AQUI / 'revisor-v3b'))
CORPUS = Path(os.environ.get('CORPUS', AQUI / 'destilado.jsonl'))
TRABALHO = Path(os.environ.get('TRABALHO', '/content/rodada'))

AMOSTRAS = int(os.environ.get('AMOSTRAS', 300))
LOTE = int(os.environ.get('LOTE', 8))
GERA_TOKENS = int(os.environ.get('GERA_TOKENS', 96))
TETO_PROMPT = int(os.environ.get('TETO_PROMPT', 384))
TEMPERATURA = float(os.environ.get('TEMPERATURA', 1.0))
TOPK = int(os.environ.get('TOPK', 128))
T_KL = float(os.environ.get('T_KL', 2.0))
EPOCAS = float(os.environ.get('EPOCAS', 1))
LR = float(os.environ.get('LR', 1.5e-5))
INTEIRO = os.environ.get('INTEIRO', '1') == '1'
BITS = os.environ.get('BITS', '4')
REPO_HF = os.environ.get('REPO_HF', '')
HF_TOKEN = os.environ.get('HF_TOKEN', '')
PASTA_HF = os.environ.get('PASTA_HF', '') or None

COMO_PENSAR = os.environ.get('COMO_PENSAR', '''

Answer in exactly two lines, with these labels and nothing else:
WHY: one short sentence naming what the wrong line got wrong
LINE: one sentence in Nilo's voice, no quotes, no label after it''')

TRABALHO.mkdir(parents=True, exist_ok=True)
AMOSTRAS_ARQ = TRABALHO / 'amostras.pt'
LOGITS_ARQ = TRABALHO / 'logits-do-professor.pt'

tok = AutoTokenizer.from_pretrained(BASE_ALUNO)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
DTIPO = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16


def carregar(nome, **kw):
    try:
        return AutoModelForCausalLM.from_pretrained(nome, **kw)
    except (ValueError, KeyError):
        import transformers
        return getattr(transformers, 'AutoModelForMultimodalLM').from_pretrained(nome, **kw)


def enunciados():
    fora = []
    for linha in CORPUS.read_text().splitlines():
        if linha.strip():
            fora.append([m for m in json.loads(linha)['messages'] if m['role'] != 'assistant'])
    return fora


def ids_do_prompt(msgs, extra=''):
    if extra:
        msgs = [{**m, 'content': m['content'] + extra} if m['role'] == 'system' else m for m in msgs]
    t = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    return tok(t, add_special_tokens=False)['input_ids'][-TETO_PROMPT:]


# ══ FASE 1: O ALUNO ESCREVE ══════════════════════════════════════════════
if FASE == 'gerar':
    todos = enunciados()
    aluno = carregar(BASE_ALUNO, dtype=DTIPO)
    if Path(ALUNO).exists() and (Path(ALUNO) / 'adapter_config.json').exists():
        aluno = PeftModel.from_pretrained(aluno, ALUNO).merge_and_unload()
    elif Path(ALUNO).exists():
        aluno = carregar(ALUNO, dtype=DTIPO)
    aluno = aluno.cuda().eval()
    aluno.config.use_cache = True

    guardadas, t0 = [], time.time()
    ordem = torch.randperm(len(todos)).tolist()
    for inicio in range(0, min(AMOSTRAS, len(ordem)), LOTE):
        pedaco = ordem[inicio:inicio + LOTE]
        prompts = [ids_do_prompt(todos[i]) for i in pedaco]
        largura = max(len(p) for p in prompts)
        # Preenchimento à ESQUERDA: à direita o modelo geraria a partir de um
        # token de enchimento e a amostra sairia do nada.
        ent = torch.tensor([[tok.pad_token_id] * (largura - len(p)) + p for p in prompts]).cuda()
        at = torch.tensor([[0] * (largura - len(p)) + [1] * len(p) for p in prompts]).cuda()
        with torch.no_grad():
            saida = aluno.generate(input_ids=ent, attention_mask=at, max_new_tokens=GERA_TOKENS,
                                   do_sample=True, temperature=TEMPERATURA, top_p=0.95,
                                   pad_token_id=tok.pad_token_id)
        gerado = saida[:, largura:].cpu()
        for k, i in enumerate(pedaco):
            g = gerado[k].tolist()
            # Corta no fim de sequência: treinar no que veio depois é treinar em
            # enchimento, e é lá que um modelo aprende a nunca parar.
            if tok.eos_token_id in g:
                g = g[:g.index(tok.eos_token_id) + 1]
            if len(g) >= 4:
                guardadas.append({'caso': i, 'gerado': g})
        print(f'  {len(guardadas)} amostras · {time.time() - t0:.0f}s', flush=True)
    torch.save(guardadas, AMOSTRAS_ARQ)
    print(f'\n  {len(guardadas)} amostras em {AMOSTRAS_ARQ}', flush=True)

# ══ FASE 2: O PROFESSOR PONTUA ═══════════════════════════════════════════
elif FASE == 'pontuar':
    todos = enunciados()
    amostras = torch.load(AMOSTRAS_ARQ)
    quant = None
    if BITS == '4':
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                                   bnb_4bit_compute_dtype=DTIPO, bnb_4bit_use_double_quant=True)
    elif BITS == '8':
        quant = BitsAndBytesConfig(load_in_8bit=True)
    prof = carregar(MESTRE, quantization_config=quant, dtype=DTIPO, device_map='cuda:0')
    prof.eval(); prof.config.use_cache = False

    fora, t0 = [], time.time()
    for n, a in enumerate(amostras, 1):
        # O professor vê o enunciado COM a instrução de formato — foi a falta
        # disso que treinou o aluno a parar de pensar na primeira tentativa.
        p = ids_do_prompt(todos[a['caso']], COMO_PENSAR)
        ids = torch.tensor([p + a['gerado']]).cuda()
        with torch.no_grad():
            lg = prof(input_ids=ids).logits[0, len(p) - 1:-1].float()
        # Guardar os K maiores MAIS o logsumexp da linha inteira: com os dois, a
        # probabilidade exata de cada um dos K é reconstruível e a massa que
        # ficou de fora é conhecida. Renormalizar só o top-K perderia isso.
        lse = torch.logsumexp(lg, dim=-1)
        v, i = lg.topk(TOPK, dim=-1)
        fora.append({'caso': a['caso'], 'gerado': a['gerado'],
                     'v': v.half().cpu(), 'i': i.int().cpu(), 'lse': lse.cpu()})
        if n % 25 == 0:
            print(f'  {n}/{len(amostras)} · {time.time() - t0:.0f}s', flush=True)
    torch.save(fora, LOGITS_ARQ)
    mb = LOGITS_ARQ.stat().st_size / 2**20
    print(f'\n  {len(fora)} pontuadas · {mb:.0f} MB em {LOGITS_ARQ}', flush=True)

# ══ FASE 3: O ALUNO APRENDE ══════════════════════════════════════════════
elif FASE == 'treinar':
    todos = enunciados()
    salvas = torch.load(LOGITS_ARQ)
    aluno = carregar(BASE_ALUNO, dtype=DTIPO)
    if Path(ALUNO).exists() and (Path(ALUNO) / 'adapter_config.json').exists():
        aluno = PeftModel.from_pretrained(aluno, ALUNO).merge_and_unload()
    elif Path(ALUNO).exists():
        aluno = carregar(ALUNO, dtype=DTIPO)
    aluno = aluno.cuda()
    aluno.config.use_cache = False
    for p_ in aluno.parameters():
        p_.requires_grad_(INTEIRO)
    if not INTEIRO:
        raise SystemExit('  esta fase existe para treinar INTEIRO; use INTEIRO=1')
    n_tr = sum(p_.numel() for p_ in aluno.parameters() if p_.requires_grad)
    print(f'  treino INTEIRO: {n_tr / 1e6:.0f}M parâmetros, cabeça de saída incluída', flush=True)
    aluno.train()

    treinaveis = [p_ for p_ in aluno.parameters() if p_.requires_grad]
    try:
        import bitsandbytes as bnb
        otim = bnb.optim.AdamW8bit(treinaveis, lr=LR)
        print('  otimizador: AdamW de 8 bits', flush=True)
    except ImportError:
        otim = torch.optim.AdamW(treinaveis, lr=LR)
    passos = max(1, int(len(salvas) * EPOCAS))
    agenda = torch.optim.lr_scheduler.OneCycleLR(otim, max_lr=LR, total_steps=passos + 1, pct_start=0.1)
    escalador = None if torch.cuda.is_bf16_supported() else torch.amp.GradScaler('cuda')

    t0, feitos = time.time(), 0
    for volta in range(int(EPOCAS) + 1):
        for a in salvas:
            if feitos >= passos:
                break
            p = ids_do_prompt(todos[a['caso']])
            ids = torch.tensor([p + a['gerado']]).cuda()
            lg = aluno(input_ids=ids).logits[0, len(p) - 1:-1].float()
            idx = a['i'].long().cuda()
            v = a['v'].float().cuda()
            lse = a['lse'].float().cuda()
            # Probabilidade exata do professor nos K, e a massa que sobrou.
            p_topk = torch.exp((v - lse.unsqueeze(-1)) / T_KL)
            p_topk = p_topk / p_topk.sum(-1, keepdim=True).clamp(min=1e-9) * \
                torch.exp((torch.logsumexp(v / T_KL, -1) - lse / T_KL)).unsqueeze(-1).clamp(max=1.0)
            resto_p = (1 - p_topk.sum(-1)).clamp(min=1e-6)
            lq = F.log_softmax(lg / T_KL, dim=-1)
            lq_topk = lq.gather(-1, idx)
            resto_q = (1 - lq_topk.exp().sum(-1)).clamp(min=1e-6)
            # KL: os K termos exatos, mais UM termo para todo o resto junto.
            kl = (p_topk * (p_topk.clamp(min=1e-9).log() - lq_topk)).sum(-1) \
                + resto_p * (resto_p.log() - resto_q.log())
            perda = kl.mean() * (T_KL ** 2)
            if escalador is not None:
                escalador.scale(perda).backward()
                escalador.unscale_(otim)
                torch.nn.utils.clip_grad_norm_(treinaveis, 1.0)
                escalador.step(otim); escalador.update()
            else:
                perda.backward()
                torch.nn.utils.clip_grad_norm_(treinaveis, 1.0)
                otim.step()
            agenda.step(); otim.zero_grad(set_to_none=True)
            feitos += 1
            if feitos <= 5 or feitos % 25 == 0:
                print(f'  passo {feitos}/{passos} · KL {perda.item():.4f} · '
                      f'{(time.time() - t0) / feitos:.1f}s/passo · '
                      f'pico {torch.cuda.max_memory_allocated() / 2**30:.1f} GiB', flush=True)
    SAIDA.mkdir(parents=True, exist_ok=True)
    aluno.save_pretrained(str(SAIDA)); tok.save_pretrained(str(SAIDA))
    if REPO_HF and HF_TOKEN:
        from huggingface_hub import HfApi
        HfApi().create_repo(REPO_HF, token=HF_TOKEN, exist_ok=True)
        HfApi().upload_folder(folder_path=str(SAIDA), repo_id=REPO_HF, token=HF_TOKEN,
                              path_in_repo=PASTA_HF, commit_message='on-policy por rodadas')
    print(f'\n  pronto em {(time.time() - t0) / 60:.1f} min · {SAIDA}', flush=True)
else:
    raise SystemExit('  FASE tem que ser gerar, pontuar ou treinar')
