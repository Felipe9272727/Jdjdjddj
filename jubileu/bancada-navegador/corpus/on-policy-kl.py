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

# ── FRAGMENTAÇÃO É O QUE MATA UM TREINO LONGO PELA METADE ────────────────
#
# O pico medido foi 63,5 GiB de 79, com enunciados que calharam curtos. O teto
# de prompt é 512 tokens, então um lote com quatro longos sobe isso — e o que
# derruba não costuma ser a falta de memória total, é ela estar picotada em
# pedaços pequenos demais para o próximo tensor de logits, que é grande e
# contíguo. Segmentos expansíveis existem exatamente para esse caso, e não
# custam nada quando não são necessários.
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

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

# ── SALVAR FORA DA MÁQUINA, DURANTE O TREINO ─────────────────────────────
#
# O Colab derruba a sessão, e quando derruba leva o disco junto. Um treino de
# duas horas de A100 que salva só no fim é um treino que se perde inteiro na
# primeira desconexão — e desconexão em sessão longa não é acidente raro, é o
# comportamento normal do serviço.
#
# Por isso o checkpoint vai para o Hugging Face a cada `SALVA_CADA` passos, e
# não só para o disco local. Custa segundos e é a diferença entre retomar do
# passo 400 e recomeçar do zero.
REPO_HF = os.environ.get('REPO_HF', '')          # ex.: usuario/nilo-revisor-08b
HF_TOKEN = os.environ.get('HF_TOKEN', '')
SALVA_CADA = int(os.environ.get('SALVA_CADA', 100))

print(f'  professor {MESTRE} em {BITS} bits · aluno {ALUNO}', flush=True)
assert torch.cuda.is_available(), 'isto precisa de GPU'

# ── QUE PRECISÃO A PLACA TEM, E ONDE CADA MODELO MORA ────────────────────
#
# bf16 é instrução de Ampere (sm_80) para cima. A T4 do Kaggle é Turing
# (sm_75) e NÃO tem: pedir bf16 lá dá erro ou cai para emulação lenta. Como o
# plano B do dono do jogo é justamente o Kaggle, isto precisa ser decidido pela
# placa e não pelo que a A100 aceitava.
#
# E com DUAS placas de 16 GiB a divisão certa não é espalhar o professor pelas
# duas: é dar uma placa inteira para cada um. Professor de 27,78B em 4 bits são
# ~15 GiB e cabem numa T4 sozinha; o aluno inteiro com otimizador de 8 bits são
# ~9 GiB e cabem na outra. Espalhar o professor deixaria as duas pela metade e
# o aluno sem casa.
CAP = torch.cuda.get_device_capability(0)
TEM_BF16 = torch.cuda.is_bf16_supported()
DTIPO = torch.bfloat16 if TEM_BF16 else torch.float16
N_GPU = torch.cuda.device_count()
GPU_MESTRE = int(os.environ.get('GPU_MESTRE', 0))
GPU_ALUNO = int(os.environ.get('GPU_ALUNO', 1 if N_GPU > 1 else 0))
for i in range(N_GPU):
    t = torch.cuda.get_device_properties(i).total_memory / 2**30
    print(f'  GPU{i}: {torch.cuda.get_device_name(i)} · {t:.0f} GiB', flush=True)
print(f'  capability {CAP[0]}.{CAP[1]} · precisão {"bf16" if TEM_BF16 else "fp16"}'
      f' · professor na GPU{GPU_MESTRE}, aluno na GPU{GPU_ALUNO}', flush=True)

# ── UM TOKENIZADOR SÓ, E ISTO É CONDIÇÃO, NÃO DETALHE ────────────────────
#
# KL de logits compara vetor com vetor posição a posição. Se os vocabulários
# diferirem em um único token, a comparação é entre coisas diferentes e o treino
# aprende ruído com convicção. Foi por causa disto que o aluno é um Qwen3.5 e
# não o SmolLM3: 248.077 contra 128.256, e nenhuma ponte honesta entre os dois.
tok = AutoTokenizer.from_pretrained(BASE_ALUNO)
tok_mestre = AutoTokenizer.from_pretrained(MESTRE)

# ── COMPARAR OS VOCABULÁRIOS DE VERDADE, NÃO O TAMANHO ───────────────────
#
# Comparar `len()` é errado nos dois sentidos, e a primeira versão disto
# abortava um par que funciona. Medido nestes dois modelos:
#
#   vocabulário base   248.044 tokens, ids IDÊNTICOS, merges idênticos
#   especiais          33 no professor, 26 no aluno
#
# Os 7 sobrando são <|audio_start|>, <tts_pad> e companhia, nos ids
# 248070–248076: cauda de áudio que o professor tem porque também fala, e que o
# aluno não tem. Nada disso desloca um único id do texto — mas `len()` difere em
# 7 e o script morria no segundo 1 por alarme falso.
#
# O que importa não é o tamanho: é se cada token de texto significa a MESMA
# coisa nos dois. Isso se confere token a token, e é o que se faz aqui.
vocab_aluno = tok.get_vocab()
vocab_mestre = tok_mestre.get_vocab()
divergentes = [t for t, i in vocab_aluno.items() if vocab_mestre.get(t, i) != i]
if divergentes:
    raise SystemExit(
        f'  {len(divergentes)} tokens têm id diferente nos dois modelos '
        f'(ex.: {divergentes[:3]}).\n'
        '  KL de logits compara vetor com vetor posição a posição: com os ids\n'
        '  deslocados, a comparação é entre coisas diferentes e o treino aprende\n'
        '  ruído com convicção. Use a destilação por sequência (MODO=on do\n'
        '  destilar.mjs), que não compara logits.')

# ── AS COLUNAS QUE SÓ O PROFESSOR TEM SAEM DO KL ─────────────────────────
#
# Ele pode botar probabilidade num token de áudio; o aluno não tem esse token, e
# a coluna correspondente nos logits dele é peso nunca treinado. Pedir que ele
# case aquilo é pedir que aprenda ruído. Em texto a massa ali é praticamente
# zero, então isto quase não muda o número — mas "quase zero" a gente mascara em
# vez de torcer.
SO_DO_MESTRE = sorted(i for t, i in vocab_mestre.items() if t not in vocab_aluno)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
print(f'  vocabulário conferido token a token: {len(vocab_aluno)} do aluno, '
      f'{len(vocab_mestre)} do professor, {len(SO_DO_MESTRE)} mascarados', flush=True)

# ── AWQ: QUANTIZAÇÃO CALIBRADA, NÃO ARREDONDAMENTO ───────────────────────
#
# `BITS=awq` carrega um checkpoint já quantizado (cyankiwi/Qwen3.8-27B-AWQ-INT4)
# em vez de quantizar na hora. A diferença importa exatamente pelo motivo que o
# dono do jogo levantou: NF4 arredonda cego, AWQ mede quais pesos importam com
# um conjunto de calibração e protege esses. Como a destilação a T=2 treina a
# CAUDA da distribuição, que é onde o arredondamento cego erra mais, a versão
# calibrada é a escolha certa quando 4 bits são inevitáveis.
#
# Nada é quantizado aqui: o checkpoint já vem assim e o transformers lê a
# configuração de dentro dele.
quant = None
if BITS == 'awq':
    pass
elif BITS == '4':
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                               bnb_4bit_compute_dtype=DTIPO,
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
    MESTRE, quantization_config=quant, dtype=DTIPO, device_map=f'cuda:{GPU_MESTRE}')
professor.eval()
professor.config.use_cache = False
for p in professor.parameters():
    p.requires_grad_(False)

# O mesmo despachante do peft que derruba o treino da v2 derruba a CARGA do
# adaptador dela aqui. Se o torchao velho ainda estiver instalado, é melhor
# dizer isso agora do que depois de o professor de 56 GB estar na memória.
try:
    import torchao, importlib.metadata as _md
    from packaging import version as _v
    if _v.parse(_md.version('torchao')) < _v.parse('0.16.0'):
        raise SystemExit(
            f'  torchao {_md.version("torchao")} instalado, e o peft exige >= 0.16.\n'
            '  A checagem dele levanta ImportError em vez de responder "não" e\n'
            '  derruba a carga do adaptador. Nada aqui usa torchao:\n\n'
            '      pip uninstall -y torchao\n')
except ImportError:
    pass

aluno = carregar(BASE_ALUNO, dtype=DTIPO).to(f'cuda:{GPU_ALUNO}')
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

# ── RECALCULAR ATIVAÇÕES SÓ SE FALTAR MEMÓRIA ────────────────────────────
#
# `gradient_checkpointing` troca memória por tempo: joga as ativações fora e
# recalcula no backward. Numa GPU apertada é o que viabiliza o treino; numa de
# 80 GiB, onde o pico medido foi 54 GiB, é só imposto.
#
# E ele cobra duas vezes, porque o transformers desliga o cache de atenção junto
# — a geração passa a reprocessar a sequência inteira a cada token novo, o que a
# torna quadrática. Com 120 tokens gerados por amostra, é a maior fatia do passo.
RECALCULA = os.environ.get('RECALCULA', 'auto')
if RECALCULA == 'auto':
    RECALCULA = 'sim' if (torch.cuda.mem_get_info()[0] / 2**30) < 18 else 'nao'

if INTEIRO:
    for p_ in aluno.parameters():
        p_.requires_grad_(True)
    if RECALCULA == 'sim':
        aluno.gradient_checkpointing_enable()
    n_treina = sum(p_.numel() for p_ in aluno.parameters() if p_.requires_grad)
    print(f'  treino INTEIRO: {n_treina / 1e6:.0f}M parâmetros, cabeça de saída incluída'
          f' · recalcular ativações: {RECALCULA}', flush=True)
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


# ── O PROFESSOR PRECISA SER PEDIDO NO MESMO FORMATO ──────────────────────
#
# Isto custou uma corrida inteira de A100 e só apareceu quando o modelo pronto
# foi testado numa pergunta: ele saiu SEM bloco de pensamento, depois de 423
# exemplos de treino em que 100% dos alvos tinham um.
#
# A causa: o sistema do corpus é só a persona, e o bloco vive no ALVO. A SFT
# aprende "dada a persona, escreva <think>". Mas no on-policy o professor
# recebia essa mesma persona sem instrução nenhuma de formato — e um modelo
# grande, nessa situação, responde a frase direto. O KL então passou trezentos
# passos ensinando o aluno a PARAR de pensar. O treino funcionou; ele só estava
# copiando a coisa errada.
#
# O conserto é dar ao professor a instrução que o corpus deu a ele quando
# gerou os alvos. Os dois passam a ver prompts DIFERENTES, e isso não quebra o
# KL: o que precisa casar são os tokens gerados, que são os mesmos, e cada
# modelo os pontua condicionado ao próprio enunciado. É justamente o que se
# quer perguntar — "o que o professor, bem instruído, preveria aqui?".
COMO_PENSAR = os.environ.get('COMO_PENSAR', '''

Answer in exactly two parts:
<think>one short sentence naming what the wrong line got wrong</think>
ONE sentence in Nilo's voice. One sentence only, no label, no quotes.''')


def prompt_ids(msgs, extra=''):
    if extra:
        msgs = [{**m, 'content': m['content'] + extra} if m['role'] == 'system' else m
                for m in msgs]
    texto = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    return tok(texto, add_special_tokens=False)['input_ids'][-TETO_PROMPT:]


def empacotar(listas, preenche):
    largura = max(len(x) for x in listas)
    d = f'cuda:{GPU_ALUNO}'
    ids = torch.tensor([[preenche] * (largura - len(x)) + x for x in listas]).to(d)
    at = torch.tensor([[0] * (largura - len(x)) + [1] * len(x) for x in listas]).to(d)
    return ids, at, largura


def um_lote(indices):
    """O aluno gera com os pesos DE AGORA. É isso que faz ser on-policy."""
    # Preenchimento à ESQUERDA: com preenchimento à direita o modelo geraria a
    # partir de um token de enchimento e a amostra sairia do nada.
    entrada, atencao, largura = empacotar(
        [prompt_ids(enunciados[i]) for i in indices], tok.pad_token_id)
    mestre_p = [prompt_ids(enunciados[i], COMO_PENSAR) for i in indices]
    aluno.eval()
    # O cache vale mesmo quando o recálculo está ligado: aqui não há backward,
    # então desligar o checkpointing durante a geração não custa memória de
    # gradiente nenhuma, e devolve a geração linear.
    if RECALCULA == 'sim':
        aluno.gradient_checkpointing_disable()
    aluno.config.use_cache = True
    with torch.no_grad():
        saida = aluno.generate(
            input_ids=entrada, attention_mask=atencao,
            max_new_tokens=GERA_TOKENS, do_sample=True, temperature=TEMPERATURA,
            top_p=0.95, pad_token_id=tok.pad_token_id, use_cache=True)
    aluno.config.use_cache = False
    if RECALCULA == 'sim':
        aluno.gradient_checkpointing_enable()
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
    # A mesma continuação, atrás do enunciado do PROFESSOR, que é mais longo.
    m_ids, m_at, m_largura = empacotar(mestre_p, tok.pad_token_id)
    m_inteiro = torch.cat([m_ids, gerado], dim=1)
    m_at_inteiro = torch.cat([m_at, mascara.long()], dim=1)
    return (inteiro, at_inteiro, largura,
            m_inteiro, m_at_inteiro, m_largura, mascara)


def kl_em_fatias(ids, atencao, inicio, m_ids, m_at, m_inicio, mascara):
    """KL(professor ‖ aluno) só nas posições geradas, fatiado por posição.

    Fatiar não é economia opcional: com 248 mil de vocabulário, os logits de um
    lote inteiro passam de meio giga POR MODELO, e o softmax em float32 dobra.
    """
    with torch.no_grad():
        dm = f'cuda:{GPU_MESTRE}'
        lg_mestre = professor(input_ids=m_ids.to(dm), attention_mask=m_at.to(dm)).logits
    lg_aluno = aluno(input_ids=ids, attention_mask=atencao).logits
    # O logit da posição t prevê o token t+1, então o alvo começa um antes. Os
    # dois enunciados têm comprimentos diferentes, então cada um tem seu próprio
    # deslocamento — o que casa são as posições GERADAS, que são as mesmas.
    p0, p1 = inicio - 1, ids.shape[1] - 1
    desloca = (m_inicio - 1) - p0
    perda, n = 0.0, 0
    for a in range(p0, p1, FATIA):
        b = min(a + FATIA, p1)
        m = mascara[:, a - p0:b - p0]
        if not m.any():
            continue
        # A fatia atravessa de uma placa para a outra: só a fatia, nunca o
        # tensor inteiro de 248 mil colunas × todas as posições.
        fatia_m = lg_mestre[:, a + desloca:b + desloca].to(lg_aluno.device).float()
        if SO_DO_MESTRE:
            # -inf antes do softmax: a massa dessas colunas é redistribuída
            # entre os tokens que os dois modelos têm, em vez de virar alvo.
            fatia_m[..., SO_DO_MESTRE] = float('-inf')
        alvo = F.log_softmax(fatia_m / T_KL, dim=-1)
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

escalador = None if TEM_BF16 else torch.amp.GradScaler('cuda')
if escalador is not None:
    print('  fp16: escalonamento de perda ligado', flush=True)

SAIDA.mkdir(parents=True, exist_ok=True)
if REPO_HF and HF_TOKEN:
    # Criado agora, e não no primeiro checkpoint: se o token estiver errado, é
    # melhor descobrir no segundo 1 do que no passo 100.
    from huggingface_hub import HfApi
    HfApi().create_repo(REPO_HF, token=HF_TOKEN, exist_ok=True)
    print(f'  checkpoints vão para https://huggingface.co/{REPO_HF}', flush=True)
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
    ids, atencao, inicio, m_ids, m_at, m_inicio, mascara = guardado
    perda = kl_em_fatias(ids, atencao, inicio, m_ids, m_at, m_inicio, mascara)
    if perda is None:
        guardado = None
        continue
    if ALFA_CE > 0:
        # CE auxiliar contra o token que o PROFESSOR escolheria: âncora barata
        # que segura o treino quando o KL fica ruidoso no começo.
        with torch.no_grad():
            dm = f'cuda:{GPU_MESTRE}'
            escolha = professor(input_ids=m_ids.to(dm), attention_mask=m_at.to(dm)).logits.argmax(-1).to(ids.device)
            escolha = escolha[:, m_inicio - inicio:] if m_inicio >= inicio else escolha
        lg = aluno(input_ids=ids, attention_mask=atencao).logits
        p0 = inicio - 1
        ce = F.cross_entropy(
            lg[:, p0:-1].reshape(-1, lg.shape[-1]).float(),
            escolha[:, p0:-1].reshape(-1), reduction='none')
        ce = (ce.view(mascara.shape) * mascara).sum() / mascara.sum().clamp(min=1)
        perda = perda + ALFA_CE * ce
    # ── fp16 PRECISA DE ESCALONAMENTO, bf16 NÃO ─────────────────────────
    #
    # Em fp16 o menor número normal é ~6e-5: gradientes menores que isso viram
    # zero e o treino para de andar sem dar erro nenhum — a perda fica parada e
    # parece que o modelo convergiu. O escalonador multiplica a perda antes do
    # backward e desfaz antes do passo, e desiste do passo quando estourar.
    # bf16 tem o mesmo expoente do fp32 e não precisa disso.
    if escalador is not None:
        escalador.scale(perda).backward()
        escalador.unscale_(otim)
        torch.nn.utils.clip_grad_norm_(treinaveis, 1.0)
        escalador.step(otim)
        escalador.update()
    else:
        perda.backward()
        torch.nn.utils.clip_grad_norm_(treinaveis, 1.0)
        otim.step()
    agenda.step()
    otim.zero_grad(set_to_none=True)
    if passo <= 5 or passo % 10 == 0:
        gasto = time.time() - t0
        pico = torch.cuda.max_memory_allocated() / 2**30
        print(f'  passo {passo}/{passos_totais} · KL {perda.item():.4f} · '
              f'{gasto / passo:.1f}s/passo · pico {pico:.1f} GiB', flush=True)
    if passo % SALVA_CADA == 0:
        aluno.save_pretrained(str(SAIDA))
        tok.save_pretrained(str(SAIDA))
        print(f'  salvo em {SAIDA}', flush=True)
        if REPO_HF and HF_TOKEN:
            try:
                from huggingface_hub import HfApi
                HfApi().upload_folder(
                    folder_path=str(SAIDA), repo_id=REPO_HF, token=HF_TOKEN,
                    commit_message=f'passo {passo}/{passos_totais} · KL {perda.item():.4f}')
                print(f'  enviado para {REPO_HF}', flush=True)
            except Exception as e:
                # Falha de rede não pode derrubar o treino: o disco local já tem
                # o checkpoint, e a próxima janela de salvamento tenta de novo.
                print(f'  ‹envio falhou, treino segue› {str(e)[:120]}', flush=True)

aluno.save_pretrained(str(SAIDA))
tok.save_pretrained(str(SAIDA))
if REPO_HF and HF_TOKEN:
    from huggingface_hub import HfApi
    HfApi().create_repo(REPO_HF, token=HF_TOKEN, exist_ok=True)
    HfApi().upload_folder(folder_path=str(SAIDA), repo_id=REPO_HF, token=HF_TOKEN,
                          commit_message='treino terminado')
    print(f'  enviado para https://huggingface.co/{REPO_HF}', flush=True)
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
