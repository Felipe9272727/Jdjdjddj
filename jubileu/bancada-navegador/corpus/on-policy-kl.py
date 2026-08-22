# ── ON-POLICY DE VERDADE: KL DE LOGITS, PROFESSOR RESIDENTE ──────────────
#
# Decisão do dono do jogo, nas palavras dele: "quero que o 0,8 pegue a
# essência 100% do 27, inclusive a forma de pensar, e o jeito de responder".
#
# A versão por sequência (o professor reescreve a tentativa do aluno e o aluno
# treina no texto) copia O QUE o professor respondeu. Esta aqui copia a
# DISTRIBUIÇÃO dele: em cada posição, o quanto ele achou de cada um dos 248 mil
# tokens possíveis. É a diferença entre decorar a resposta e herdar o critério —
# e é onde mora "a forma de pensar", porque o formato do raciocínio está nas
# probabilidades dos tokens dentro do bloco <think>, não só no texto final.
#
# ── O QUE FAZ SER "ON-POLICY" ────────────────────────────────────────────
#
# As sequências pontuadas são geradas PELO ALUNO, com os pesos do passo atual,
# e regeneradas a cada `FRESCOR` passos. Isso importa porque o erro que um
# modelo de 0,8B comete não está no caminho que o professor percorreria: treinar
# só em caminhos perfeitos ensina o trajeto certo a partir de estados que o
# aluno nunca visita. É o defeito que hoje faz o revisor encostar na resposta
# decorada mais parecida quando a entrada não bate com nenhuma que ele viu.
#
# ── O ALVO, NAS PALAVRAS DO DONO DO JOGO ─────────────────────────────────
#
# "eu quero que ele pense como o 27b, e que ele tenha uma forma de falar do
# 27b, eu não quero que ele tenha todas as capacidades do 27b, quero que ele
# consiga usar ao máximo tudo o que ele tem ao favor".
#
# Isso não é uma versão modesta do objetivo, é um objetivo DIFERENTE, e ele
# muda o treino em três pontos concretos:
#
#   1. NÃO É LoRA. LoRA prende a mudança a um subespaço de posto baixo — ótimo
#      para ensinar uma tarefa a um modelo que já sabe se comportar, péssimo
#      para REFAZER o comportamento. Quem quer usar ao máximo os 873M treina os
#      873M. Cabe: pesos 1,75 GB + gradientes 1,75 GB + Adam de 8 bits 1,75 GB,
#      contra o professor em 4 bits ocupando 16 GB na A100 de 40.
#
#   2. A TEMPERATURA DA DESTILAÇÃO SOBE. Com T=1 o KL é dominado pelo token
#      mais provável, e o aluno copia a ESCOLHA. O jeito de falar não está na
#      escolha, está na ordem dos que ele NÃO escolheu — o que o professor
#      considerou e descartou. T=2 achata a distribuição e faz esse sinal pesar,
#      que é literalmente o que se quer transferir aqui.
#
#   3. A CABEÇA DE SAÍDA ENTRA NO TREINO. Com LoRA ela fica de fora por padrão,
#      e ela é a camada que decide a palavra. Treinar estilo sem treinar a
#      cabeça é pedir sotaque novo proibindo mexer na boca.
#
# O que continua fora do alcance é conhecimento do mundo, e isso não é limite
# deste treino, é o que ele NÃO está tentando fazer.
#
# ── MEMÓRIA, NA A100 DE 40 GB ────────────────────────────────────────────
#
#   professor 27,78B em 4 bits NF4  ~16 GB     cabe com folga
#   professor 27,78B em int8        ~28 GB     cabe raspando
#   professor 27,78B em FP8 oficial ~28 GB     cabe, MAS precisa de Ada/Hopper
#   professor 27,78B em bf16        ~56 GB     não cabe
#
# ── SOBRE "USAR A QUANTIZAÇÃO OFICIAL" ───────────────────────────────────
#
# A Qwen publica UMA quantização oficial e ela é FP8 (Qwen/Qwen3.8-27B-FP8),
# não 4 bits. Não existe 4 bits oficial da Qwen, e não é oversight: o "4 bits"
# daqui é NF4 do bitsandbytes, calculado NA HORA DA CARGA a partir dos pesos
# bf16, na máquina de quem roda. Ninguém publica esse arquivo, então não há
# versão oficial dele para preferir — a escolha é usar ou não usar.
#
# E o FP8 oficial tem um porém de hardware, não de qualidade: FP8 é instrução
# de Ada (L4, 4090) e Hopper (H100). A A100 é Ampere e não tem. Carregar o FP8
# nela obriga a desfazer a quantização para bf16, e aí são 56 GB de novo, que é
# o que a gente estava evitando. O L4 tem FP8 e tem 24 GB, e 28 não cabe em 24.
#
# Ou seja, no hardware do Colab a escada real é NF4 ou int8, e é por isso que
# `quanto-a-quantizacao-estraga.py` existe: cinco minutos de medida em vez de
# uma escolha por fé.
#   aluno 0,8B bf16 + LoRA + otim   ~5 GB
#   logits de um lote                 <1 GB    (fatiado por posição, ver abaixo)
#
# Os logits são o detalhe que estoura sem aviso: 248.077 × posições × lote, em
# bf16, DUAS vezes (professor e aluno) mais o float32 do softmax. Um lote de 2 ×
# 384 posições já são 381 MB por tensor. Por isso o KL é calculado em FATIAS de
# posições, e a fatia é parâmetro.
#
#   MESTRE=Qwen/Qwen3.8-27B ALUNO=corpus/revisor-v2 PASSOS=600 \
#     python3 corpus/on-policy-kl.py
import json, math, os, time
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, PeftModel, get_peft_model

AQUI = Path(__file__).resolve().parent
MESTRE = os.environ.get('MESTRE', 'Qwen/Qwen3.8-27B')
ALUNO = os.environ.get('ALUNO', str(AQUI / 'revisor-v2'))
BASE_ALUNO = os.environ.get('BASE_ALUNO', 'Qwen/Qwen3.5-0.8B')
SAIDA = Path(os.environ.get('SAIDA', AQUI / 'revisor-v3'))
CORPUS = Path(os.environ.get('CORPUS', AQUI / 'destilado.jsonl'))

PASSOS = int(os.environ.get('PASSOS', 600))
LOTE = int(os.environ.get('LOTE', 2))
FRESCOR = int(os.environ.get('FRESCOR', 1))       # a cada quantos passos regerar
GERA_TOKENS = int(os.environ.get('GERA_TOKENS', 120))
TEMPERATURA = float(os.environ.get('TEMPERATURA', 1.0))
FATIA = int(os.environ.get('FATIA', 64))          # posições por fatia no KL
# T=2 por padrão, e o motivo está na seção do alvo: o jeito de falar mora na
# cauda da distribuição, não no argmax. O termo T² na perda compensa o encolhi-
# mento dos gradientes que a temperatura causa — sem ele, subir T é o mesmo que
# baixar a taxa de aprendizado sem querer.
T_KL = float(os.environ.get('T_KL', 2.0))         # temperatura da destilação
ALFA_CE = float(os.environ.get('ALFA_CE', 0.0))   # peso de uma CE auxiliar
BITS = os.environ.get('BITS', '4')                # 4 | 8 | 16
INTEIRO = os.environ.get('INTEIRO', '1') == '1'   # treinar os 873M, não só LoRA
# ── A TAXA MUDA COM O MODO, E MUITO ──────────────────────────────────────
#
# 1e-4 é taxa de LoRA: ali só uma fatia de posto baixo se move, e o resto do
# modelo segura o passo largo. Aplicada aos 873M inteiros, ela desmancha o
# modelo nos primeiros passos — e num treino on-policy o estrago se realimenta,
# porque as amostras do passo seguinte saem do modelo já estragado. Ajuste fino
# completo trabalha uma ordem de grandeza abaixo.
LR = float(os.environ.get('LR', 1.5e-5 if INTEIRO else 1e-4))
TETO_PROMPT = int(os.environ.get('TETO_PROMPT', 512))

print(f'  professor {MESTRE} em {BITS} bits · aluno {ALUNO}', flush=True)
assert torch.cuda.is_available(), 'isto precisa de GPU'
livre, total = torch.cuda.mem_get_info()
print(f'  GPU: {torch.cuda.get_device_name(0)} · {total / 2**30:.0f} GiB', flush=True)

# ── UM TOKENIZADOR SÓ, E ISTO É CONDIÇÃO, NÃO DETALHE ────────────────────
#
# KL de logits compara vetor com vetor posição a posição. Se os vocabulários
# diferirem em um único token, a comparação é entre coisas diferentes e o treino
# aprende ruído com convicção. Foi por causa disto que o aluno é um Qwen3.5 e
# não o SmolLM3: 248.077 contra 128.256, e nenhuma ponte honesta entre os dois.
tok = AutoTokenizer.from_pretrained(BASE_ALUNO)
tok_mestre = AutoTokenizer.from_pretrained(MESTRE)
if len(tok) != len(tok_mestre):
    raise SystemExit(
        f'  vocabulários diferentes: aluno {len(tok)} · professor {len(tok_mestre)}.\n'
        '  KL de logits exige o mesmo tokenizador. Troque o aluno por um da mesma\n'
        '  família do professor, ou use a destilação por sequência (MODO=on do\n'
        '  destilar.mjs), que não compara logits.')
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
print(f'  vocabulário casado: {len(tok)} tokens', flush=True)

quant = None
if BITS == '4':
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                               bnb_4bit_compute_dtype=torch.bfloat16,
                               bnb_4bit_use_double_quant=True)
elif BITS == '8':
    quant = BitsAndBytesConfig(load_in_8bit=True)

# ── OS DOIS SÃO MULTIMODAIS NO CARTÃO DO HUB ─────────────────────────────
#
# `qwen3_5` se declara como image-text-to-text e a classe do cartão é
# `AutoModelForMultimodalLM`. Carregar com `AutoModelForCausalLM` funciona nas
# versões de transformers que registram o alias, e explode nas que não —
# descobrir isso na primeira célula do Colab, depois de baixar 56 GB, seria o
# jeito mais caro possível de aprender. Então tenta e cai para a outra.
def carregar(nome, **kw):
    try:
        return AutoModelForCausalLM.from_pretrained(nome, **kw)
    except (ValueError, KeyError) as e:
        import transformers
        classe = getattr(transformers, 'AutoModelForMultimodalLM', None)
        if classe is None:
            raise SystemExit(
                f'  {nome} nao carrega como CausalLM ({e}) e esta versao de\n'
                '  transformers nao tem AutoModelForMultimodalLM. Atualize:\n'
                '    pip install -U transformers')
        print(f'  {nome}: caiu para AutoModelForMultimodalLM', flush=True)
        return classe.from_pretrained(nome, **kw)


professor = carregar(
    MESTRE, quantization_config=quant, dtype=torch.bfloat16, device_map='cuda:0')
professor.eval()
professor.config.use_cache = False
for p in professor.parameters():
    p.requires_grad_(False)

aluno = carregar(BASE_ALUNO, dtype=torch.bfloat16).cuda()
if Path(ALUNO).exists():
    # A v2 sai da SFT como adaptador. Aqui ela é ABSORVIDA nos pesos antes de
    # continuar: manter o LoRA por cima limitaria o resto do treino ao mesmo
    # subespaço de posto baixo, que é justamente o que se quer soltar.
    aluno = PeftModel.from_pretrained(aluno, ALUNO, is_trainable=not INTEIRO)
    if INTEIRO:
        aluno = aluno.merge_and_unload()
        print(f'  v2 de {ALUNO} mesclada nos pesos', flush=True)
    else:
        print(f'  aluno continua de {ALUNO} como adaptador', flush=True)
elif not INTEIRO:
    import torch.nn as nn
    sufixos = sorted({n.split('.')[-1] for n, m in aluno.named_modules()
                      if isinstance(m, nn.Linear) and not n.endswith('lm_head')})
    print(f'  aluno do zero · LoRA em {sufixos}', flush=True)
    aluno = get_peft_model(aluno, LoraConfig(
        r=32, lora_alpha=64, lora_dropout=0.05, bias='none',
        task_type='CAUSAL_LM', target_modules=sufixos))

if INTEIRO:
    for p_ in aluno.parameters():
        p_.requires_grad_(True)
    aluno.gradient_checkpointing_enable()
    n_treina = sum(p_.numel() for p_ in aluno.parameters() if p_.requires_grad)
    print(f'  treino INTEIRO: {n_treina / 1e6:.0f}M parâmetros, cabeça de saída incluída', flush=True)
else:
    aluno.print_trainable_parameters()

# ── OS ENUNCIADOS VÊM DO CORPUS, AS RESPOSTAS NÃO ────────────────────────
#
# Do jsonl destilado a gente aproveita SÓ o lado do enunciado: pergunta, frase
# errada e motivo. A resposta do professor que está lá é off-policy por
# definição — usá-la aqui seria repetir a etapa anterior com nome novo.
enunciados = []
for linha in CORPUS.read_text().splitlines():
    if not linha.strip():
        continue
    msgs = json.loads(linha)['messages']
    enunciados.append([m for m in msgs if m['role'] != 'assistant'])
if not enunciados:
    raise SystemExit(f'  corpus vazio: {CORPUS}')
print(f'  {len(enunciados)} enunciados', flush=True)


def prompt_ids(msgs):
    texto = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    return tok(texto, add_special_tokens=False)['input_ids'][-TETO_PROMPT:]


def um_lote(indices):
    """O aluno gera com os pesos DE AGORA. É isso que faz ser on-policy."""
    prompts = [prompt_ids(enunciados[i]) for i in indices]
    largura = max(len(p) for p in prompts)
    # Preenchimento à ESQUERDA: com preenchimento à direita o modelo geraria a
    # partir de um token de enchimento e a amostra sairia do nada.
    entrada = torch.tensor([[tok.pad_token_id] * (largura - len(p)) + p for p in prompts]).cuda()
    atencao = torch.tensor([[0] * (largura - len(p)) + [1] * len(p) for p in prompts]).cuda()
    aluno.eval()
    with torch.no_grad():
        saida = aluno.generate(
            input_ids=entrada, attention_mask=atencao,
            max_new_tokens=GERA_TOKENS, do_sample=True, temperature=TEMPERATURA,
            top_p=0.95, pad_token_id=tok.pad_token_id, use_cache=True)
    aluno.train()
    gerado = saida[:, largura:]
    # A perda só vale nas posições que o ALUNO escreveu: o enunciado é contexto
    # comum aos dois modelos e não tem nada a ensinar.
    mascara = torch.ones_like(gerado, dtype=torch.bool)
    if tok.eos_token_id is not None:
        depois_do_fim = (gerado == tok.eos_token_id).cumsum(dim=1) > 0
        mascara &= ~(depois_do_fim & (gerado != tok.eos_token_id))
    inteiro = torch.cat([entrada, gerado], dim=1)
    at_inteiro = torch.cat([atencao, mascara.long()], dim=1)
    return inteiro, at_inteiro, largura, mascara


def kl_em_fatias(ids, atencao, inicio, mascara):
    """KL(professor ‖ aluno) só nas posições geradas, fatiado por posição.

    Fatiar não é economia opcional: com 248 mil de vocabulário, os logits de um
    lote inteiro passam de meio giga POR MODELO, e o softmax em float32 dobra.
    """
    with torch.no_grad():
        lg_mestre = professor(input_ids=ids, attention_mask=atencao).logits
    lg_aluno = aluno(input_ids=ids, attention_mask=atencao).logits
    # O logit da posição t prevê o token t+1, então o alvo começa um antes.
    p0, p1 = inicio - 1, ids.shape[1] - 1
    perda, n = 0.0, 0
    for a in range(p0, p1, FATIA):
        b = min(a + FATIA, p1)
        m = mascara[:, a - p0:b - p0]
        if not m.any():
            continue
        alvo = F.log_softmax(lg_mestre[:, a:b].float() / T_KL, dim=-1)
        meu = F.log_softmax(lg_aluno[:, a:b].float() / T_KL, dim=-1)
        # KL direta, com o professor como alvo: o aluno é obrigado a cobrir tudo
        # que o professor considera possível, em vez de escolher um modo só —
        # que é justamente o colapso de repertório que este treino existe para
        # desfazer.
        kl = (alvo.exp() * (alvo - meu)).sum(-1)
        perda = perda + (kl * m).sum()
        n += int(m.sum())
    if n == 0:
        return None
    return (perda / n) * (T_KL ** 2)


# ── ADAM DE 8 BITS QUANDO TREINA INTEIRO ─────────────────────────────────
#
# AdamW comum guarda dois estados em float32 por parâmetro: 873M × 8 bytes = 7
# GB, que somados ao professor de 16 GB apertam a A100 sem necessidade. O Adam
# de 8 bits guarda os mesmos dois estados quantizados: 1,75 GB. A diferença de
# qualidade em ajuste fino é pequena e conhecida; a de memória é 5 GB.
treinaveis = [p_ for p_ in aluno.parameters() if p_.requires_grad]
otim = None
if INTEIRO:
    try:
        import bitsandbytes as bnb
        otim = bnb.optim.AdamW8bit(treinaveis, lr=LR)
        print('  otimizador: AdamW de 8 bits', flush=True)
    except ImportError:
        print('  bitsandbytes ausente — AdamW comum, ~5 GB a mais', flush=True)
if otim is None:
    otim = torch.optim.AdamW(treinaveis, lr=LR)
passos_totais = PASSOS
agenda = torch.optim.lr_scheduler.OneCycleLR(
    otim, max_lr=LR, total_steps=passos_totais, pct_start=0.1)

SAIDA.mkdir(parents=True, exist_ok=True)
ordem = torch.randperm(len(enunciados)).tolist()
cursor = 0
t0 = time.time()
guardado = None
for passo in range(1, passos_totais + 1):
    if guardado is None or passo % FRESCOR == 0:
        if cursor + LOTE > len(ordem):
            ordem = torch.randperm(len(enunciados)).tolist()
            cursor = 0
        guardado = um_lote(ordem[cursor:cursor + LOTE])
        cursor += LOTE
    ids, atencao, inicio, mascara = guardado
    perda = kl_em_fatias(ids, atencao, inicio, mascara)
    if perda is None:
        guardado = None
        continue
    if ALFA_CE > 0:
        # CE auxiliar contra o token que o PROFESSOR escolheria: âncora barata
        # que segura o treino quando o KL fica ruidoso no começo.
        with torch.no_grad():
            escolha = professor(input_ids=ids, attention_mask=atencao).logits.argmax(-1)
        lg = aluno(input_ids=ids, attention_mask=atencao).logits
        p0 = inicio - 1
        ce = F.cross_entropy(
            lg[:, p0:-1].reshape(-1, lg.shape[-1]).float(),
            escolha[:, p0:-1].reshape(-1), reduction='none')
        ce = (ce.view(mascara.shape) * mascara).sum() / mascara.sum().clamp(min=1)
        perda = perda + ALFA_CE * ce
    perda.backward()
    torch.nn.utils.clip_grad_norm_(treinaveis, 1.0)
    otim.step()
    agenda.step()
    otim.zero_grad(set_to_none=True)
    if passo % 10 == 0 or passo == 1:
        gasto = time.time() - t0
        pico = torch.cuda.max_memory_allocated() / 2**30
        print(f'  passo {passo}/{passos_totais} · KL {perda.item():.4f} · '
              f'{gasto / passo:.1f}s/passo · pico {pico:.1f} GiB', flush=True)
    if passo % 100 == 0:
        aluno.save_pretrained(str(SAIDA))
        print(f'  salvo em {SAIDA}', flush=True)

aluno.save_pretrained(str(SAIDA))
tok.save_pretrained(str(SAIDA))
print(f'\n  pronto em {(time.time() - t0) / 60:.1f} min · em {SAIDA}', flush=True)
if INTEIRO:
    print('  são os pesos completos: dá para converter para gguf direto.', flush=True)
    # ── O PRÓXIMO CORTE, E ELE É DESTE MESMO PEDIDO ──────────────────────
    #
    # "usar ao máximo tudo o que ele tem": 254M dos 873M são tabela de
    # embeddings de um vocabulário de 248 mil tokens. O Nilo fala inglês e
    # emite algumas centenas de padrões. Podar o vocabulário depois da
    # destilação devolve quase um terço do arquivo sem tocar em uma única
    # camada que computa — e tem que ser DEPOIS, porque o KL exige o
    # vocabulário casado com o do professor.
    print('  próximo passo: podar o vocabulário (o KL já terminou, pode cortar).', flush=True)
else:
    print('  é só o adaptador: para o gguf, mescle com a base antes de converter.', flush=True)
