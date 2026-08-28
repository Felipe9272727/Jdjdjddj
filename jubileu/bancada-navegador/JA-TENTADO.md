# O que já foi tentado no Andar 10 — e morreu

Este arquivo existe porque eu propus WebGPU de novo em agosto de 2026, depois de
ela já ter sido reprovada três vezes no aparelho do dono do jogo. Ele mandou eu
ler os commits antes de propor qualquer coisa, e tinha razão. Três varreduras do
histórico (GPU, velocidade, modelos) viraram este índice.

**Regra de uso:** antes de propor uma técnica ou um modelo, procure aqui. Se
estiver nesta lista, ou traga uma medição nova no aparelho de quem joga, ou não
proponha. `VELOCIDADE.md` continua sendo o dossiê com as tabelas completas; este
é o índice do que está fechado.

---

## AS TRÊS LEIS DESTE PROJETO

Não são opinião: cada uma foi medida entre cinco e oito vezes, com o número
escrito no commit.

### 1ª — Medição na minha caixa não prevê o celular dele

O padrão se repetiu cinco vezes, sempre na mesma direção:

| o que a bancada disse | o que o Snapdragon 7s Gen 2 disse |
|---|---|
| kernels SIMD de WASM: **+51%** (`14f7c334`) | injogável; travamento voltou (`01a43e07`) |
| 8 threads ganham, medido de 1 a 8 (`6c768173`) | **15× mais lento** (`cc17feac`) |
| n-grama: **1,43×** (`e53ec760`) | −10% na conversa, −38% de fábrica (`16739338`) |
| WebGPU: 4–17 tok/s no paper (`cd88097f`) | `(ABORT)`, lixo binário, e **mais lenta** (`329d78a0`) |
| MoE granite: **2,7×** (`9fdcc382`) | quebra o personagem em PT-BR |

E o caso que fecha o argumento: `3fb146d5` descobriu que a própria bancada rodava
com `n_threads: 8` numa caixa de 4 núcleos — *"TODO número de velocidade que saiu
desta bancada até agora mediu essa disputa"*.

**Consequência prática:** nenhuma técnica vira padrão sem uma passada no aparelho
real. Foi assim que os +51% e as 8 threads entraram e tiveram que sair.

### 2ª — Abaixo de ~1B, o modelo colapsa numa resposta só

Medido oito vezes, em três papéis diferentes:

| modelo | papel | colapso |
|---|---|---|
| SmolLM2-135M | motor | `stay \| self` para **qualquer** pensamento |
| LFM2.5-230M | motor | 2 alvos dos 12 · `to-my-left` 6/7 |
| Granite 4.0 350M | motor | 1/7 · `player` em quatro casos |
| LFM2.5-350M | vontade | assina 5/5 e responde `observe-player` em 4/5 |
| LFM2.5-350M | desempate | **ecoa o vetor** — devolve o 1º da lista |
| granite-3.1-1b-a400m | vontade | 0/5, nenhuma rodada assinou `CHOICE:` |
| LFM2-700M | motor | 0/7 · `player` em 4 |
| MiniCPM5-1B | motor | `west-side` **7/7**, sob gramática |

**Assinar o formato não é escolher bem** (`659cdc62`). Um "5/5 de assinatura"
lido sozinho aprova um modelo cego — sempre peça as escolhas ao lado.

E o corolário, de `754d3602`: trocar Q4 por Q8 no 135M **não mudou nada**
(10/30 verbos nos dois) — *"o gargalo era TAMANHO, não precisão"*.

### 3ª — Quantização: o salto está entre Q6 e Q8, não entre Q4 e Q6

Llama 3.2 1B na vontade, mesmo prompt, 5 cenários × 3 seeds (`754d3602`):

```
Q4_K_M   808 MB    assina 5/15    1ª pessoa 3     5,0 s/rodada
Q6_K    1,02 GB    assina 7/15    1ª pessoa 8     7,9 s/rodada
Q8_0    1,32 GB    assina 14/15   1ª pessoa 11    7,3 s/rodada
```

Por isso o LFM2.5-2.6B medido em Q4 contra dois Q8 (`659cdc62`) é um teste
**confundido**: o 0/5 dele pode ser da quantização, não do tamanho.

---

## O TETO QUE DECIDE TUDO: 2 GiB por GGUF

`ftell()` preso em `MAX_LONG` no HeapFS da wllama. Nenhum arquivo acima de
**2.147.483.648 bytes** carrega — em máquina nenhuma, nem com 16 GB de RAM.

```
granite-4.0-h-tiny Q4_K_M (4,25 GB)  → 'blk.19.ffn_down_exps.weight' not within file bounds
SmolLM3-Q8_0      (3,27 GB, DENSO)   → 'blk.21.ffn_up.weight' not within file bounds
```

O segundo fecha o caso: mesmo modelo, só a quantização muda, e falha igual.
**O SmolLM3-Q4_K_M está a 89% do teto.** Enquanto ele existir, não há modelo
maior de tipo nenhum — nem MoE, nem denso, nem o mesmo Smol em Q8.

---

## O CEMITÉRIO, POR CATEGORIA

### GPU — quatro eras, três reprovações no aparelho real
Ver a seção **"O VEREDITO DA GPU"** em `VELOCIDADE.md`. Resumo:
a causa do travamento **não é memória**, é fila de submissão saturada
(`d9fc9af4`) — então encolher camadas não resolve. E a GPU nunca foi mais
rápida nem quando funcionou: CPU×8 em 242,5 s contra WebGPU×2 em 257,1 s.
Padrão hoje: **0 camadas**, atrás do botão do `?bancada`.

### Velocidade
| tentativa | veredito |
|---|---|
| binário próprio com kernels SIMD | +51% no x86, **injogável no ARM dele** (`01a43e07`) |
| n-grama especulativo | −10% na conversa; e com `n_max=1` era **peso morto**: 0 rascunhados, 0 aceitos em 6 rodadas (`b6e2e52a`) |
| rascunhador por MODELO (par especulativo) | vocabulários incompatíveis: SmolLM3 **128256** vs SmolLM2-360M **49152** |
| Medusa | 263M parâmetros por cabeça, e o llama.cpp não tem `draft-medusa` |
| Relaxed SIMD (PR #19590) | 2–4× no papel; varri o `wllama.wasm` e **não há um opcode** |
| `flash_attn` explícito | 0,99× nesta build |
| `n_batch` 128 vs 512 | prefill 3,1 tok/s nos dois — "o prefill não espera lote" |
| IQ4_XS / Q4_0-ARM | i-quants custam mais no WASM; o repack `Q4_0_4_4` é código ARM que não existe lá |
| reordenar o prompt (voláteis no fim) | **B leu 43% A MAIS** que A (`967de42e`) |
| Colibri / AirLLM | dependem de NVMe; WASM não tem `mmap`; 0,05–2 tok/s |
| sparse upcycling / MoEfication | roteador nasce aleatório; SwiGLU não é esparso; e passaria dos 2 GiB |
| hipótese "disco é mais lento que RAM" | morta — reabrir custa ~18 s nos dois (`b622ec14`) |
| hipótese do binário compat (wasm32 sem JSPI) | inocente — 3,58 vs 3,67 tok/s |

### Modelos — ~40 testados em 5 papéis
Titulares de hoje: **fala** SmolLM3-3B Q4_K_M · **vontade** LFM2.5-1.2B Q8_0 ·
**motor** embeddinggemma-300M (vetor, sem LLM) · **memória** embeddinggemma-300M ·
**reflexo** SmolLM2-135M int8 (ONNX).

Reprovações que valem lembrar, com a frase que decidiu:

- **Qwen2.5-7B** — *"o 7B/5GB estourava a aba"*
- **Qwen3.5-2B** — *"não sei se as paredes são reais ou se o teto está cortando meu ombro"*
- **Llama-3.2-3B** — *"nega o próprio nome ('Nilo Azevedo... eu acho')"*
- **Phi-4-mini** — *"vira assistente ('como posso te ajudar hoje?')"*
- **Gemma-4-E2B** — gasta a resposta inteira pensando em inglês
- **granite-3.1-3b-a800m** (MoE, 2,7× mais rápido) — *"Mais rápido e menos Nilo"*
- **LFM2.5-1.2B-Thinking** — 0/5, o traço de raciocínio come os 320 tokens
- **multilingual-e5-small** — `ggml_abort` ao gerar o vetor; consertada a metadata, o tokenizador SPM estoura em texto com acento
- **Gemma 3 1B** — ganhou na planilha (16/16) e **perdeu no jogo**: *"repete a mesma abertura e usa 4 das 8 metas"*

**Lição de método de `66ff226c`, que vale mais que o placar:** um modelo pode
vencer a bancada e perder o jogo. Quem joga vê o que a planilha não mostra.

### Arquitetura de dois cérebros — cinco tentativas
| tentativa | veredito |
|---|---|
| especulativa com modelo rascunhador | vocabulário incompatível; e não existe draft público para esta família |
| n-grama (auto-especulação) | ligado, limitado, e removido do padrão |
| EAGLE-3 | **proposto, nunca treinado** — ver bloqueio abaixo |
| cascata vetor + LLM no motor (A/B/C) | ligada em `b4203574`, desligada em `af12df49`: o Qwen comprava 1 caso em 7 por 639 MB |
| rascunhador + revisor | protocolo de um passo **reprovou 3 de 3** (`7b8a2889`) |

Dois achados de `7b8a2889` que valem para qualquer trabalho futuro com gramática:
**gramática inválida é ignorada em silêncio** (`root ::= (((` não lança nada), e
uma gramática válida mas frouxa (`frase ::= [^\n]+`) **permite o lixo** que você
pensou estar barrando.

---

## O QUE CONTINUA VIVO, E QUANTO VALE

| técnica | ganho medido |
|---|---|
| `cache_prompt` + prefixo estável | 376 de ~380 tokens reaproveitados; no aparelho, "515 reaproveitados · 285 lidos" |
| `prewarmPersona` | **447 → 177 tokens lidos; espera 187 s → 87 s** |
| encolher o prompt (curador condicional) | "oi" casual: **587 → 256 tokens (−56%)** |
| KV em q8_0 | **+15%** na fala, sem mudar o texto |
| threads = metade dos núcleos | evita a perda de 15× |
| teto de 56 tokens (era 96) | até **40 s** que a fala não usava |
| runtime no Cache Storage | 2ª carga em diante: zero HTTP |

---

## O QUE CONTINUA ABERTO, EM ORDEM

### 1. Descarregar um cérebro devolve 0% da RAM — nunca foi confirmado
`90e504ae` mediu: `com a fala 4,48 GB → descarregada 4,48 GB → devolveu 0%`.
Se o número estiver certo, as **~18 s de releitura por visita ao chat** estão
sendo pagas em troca de nada, e o roteamento inteiro está sobre uma premissa
falsa. O commit termina em *"não altero mais nada em cima disso até saber qual
das três é"* e **nenhum commit posterior respondeu**. É medição, não construção,
e é o maior retorno pelo menor custo que sobrou.

### 2. Por que o nosso binário castiga o ARM
Os +51% são reais e estão desligados desde `01a43e07`. Ninguém diagnosticou a
regressão. `?wllamaespec` existe exatamente para isso.

**E isto bloqueia o item 3:** toda a decodificação especulativa — n-grama *e*
EAGLE-3 — só funciona no `public/wllama-espec/`. O wllama do CDN preenche
`params.speculative.draft.*` e **nunca `params.speculative.types`**, e é de
`types` que o `common_speculative_init()` decide tudo. Sem consertar o binário,
um EAGLE-3 treinado não tem onde rodar no aparelho dele.

### 3. EAGLE-3 (depois do 2)
Caminho verificado nas três pontas (`7245de67`): o binário aceita
`draft-eagle3`, existe conversor para GGUF, e `spec_draft_model` é a porta.
~50M parâmetros, expectativa **1,8×–2,5× sem mudar uma palavra**. Precisa de
GPU externa: 2–4 h numa L4 com ~10k diálogos **no estilo do jogo**. Não dá para
treinar no contêiner (sem GPU; só gerar os estados ocultos de 1M tokens levaria
~11 h).

### 4. O botão de 1 camada de GPU, nunca apertado
`dde144b0` montou o botão para separar "estourou o buffer" de "o backend não
roda aqui". O teste **nunca foi executado no celular do Felipe**. Com a causa
sendo fila de submissão, a expectativa é que engasgue igual — mas é a única
pergunta aberta sobre GPU, e custa um toque.

### 5. O protocolo de dois passos do remendo, nunca medido de verdade
Depois que o de um passo reprovou 3/3, o conserto (veredito + reescrita, 8
tokens no passo 1) foi construído e **nunca medido de ponta a ponta com o
SmolLM3 real no aparelho**. A conta de "1 token / 12 tokens / 40 tokens" é
aritmética de desenho, não medição.

---

## MEDIDAS QUE NÃO EXISTEM — para ninguém citar de memória

- **compressor de contexto** (`18454f38`): nenhum ganho medido em tokens ou tok/s.
- **LFM2-1.2B-Tool** e **Granite 4.0 1B**: anunciados como candidatos do motor em
  `8e4cdf48`, resultado nunca registrado.
- **Huihui-MoE**: citado uma vez como colapso, sem tabela e sem commit de medição.
- **Granite-3.1-Earthen-v0.3-3B-A800M**: sugerido em `9fdcc382`, nunca testado.
  Ressalva que não estava escrita: os datasets dele são **todos em inglês**
  (visual novels, legendas, AP News), e o granite base já escrevia português de
  Portugal — pode piorar o PT-BR em vez de consertar.
- **llama32-horror**: no catálogo com nota explícita "NÃO medido na vontade".
- **`27ddded7`** (max_tokens 220 → 64) e **`f324d71b`** (`cache_prompt` de volta
  para `true`): corpos de commit vazios, motivo não escrito.

---

## O QUE O DONO DO JOGO JÁ DECIDIU

Não são sugestões; são decisões tomadas e registradas.

- *"todos llms que estão aqui, foram escolhidos a dedo"* (`cef0ba93`)
- *"não aceito a proposta pra trocar de modelo"* (`floor10Brains.ts:62`)
- *"Deixe o lfm como principal, e fds o llama"* (`7bc536a6`)
- *"vamo tacar o vetor sozinho"* (`af12df49`)
- *"a vontade tem que ser mais RÁPIDA que a mente"* (`floor10SmallBrain.ts:133`)
- e duas trocas ele fez com as próprias mãos: SmolLM3 na fala (`0f48d173`) e o
  córtex motor (`ed0b7b90`).

Existe teste travando `SMALL_BRAIN_DEFAULT` (`floor10Brains.test.ts:33`) — posto
lá *"para que a próxima boa medição também não vire uma troca silenciosa"*.

---

## A DECODIFICAÇÃO ESPECULATIVA: OITO PAREDES, E O QUE SOBROU

Este arquivo registrava o caminho como fechado em duas linhas:

> *"rascunhador por MODELO (par especulativo): vocabulários incompatíveis —
> SmolLM3 **128256** vs SmolLM2-360M **49152**"*
> *"não existe draft público para esta família"*

As duas estavam erradas, e a segunda por um engano de nome: o SmolLM3 **não usa
o tokenizador dos SmolLM menores**. Ele usa o do **Llama 3.2** — `<|begin_of_text|>`
em 128000, `<|start_header_id|>` em 128006, os ids exatos da Meta. Draft público
para essa família existe aos montes.

### Os oito degraus, cada um derrubando algo dado como definitivo

| # | parede | o que era de verdade |
|---|---|---|
| 1 | "vocabulários incompatíveis" | o par testado era da família errada |
| 2 | `failed to load draft model` | `spec_draft_model` é caminho de ARQUIVO; passei URL |
| 3 | blob junto do alvo vira shard | `prepareBlobs` renomeia tudo para `model-0000N-of-M`; o draft entra só em `modelFiles.all`, nunca em `llm` |
| 4 | `bos must match: add 0 - 1` | MESMO id (128000-128000); só a flag diferia |
| 5 | a flag vem do pré-tokenizador | `llama-bpe` liga `add_bos`, `smaug-bpe` não — e o llama.cpp comenta a regex do SMAUG como *"same as llama3"*, idêntica |
| 6 | dois tokens diferentes | eram **dez**: `<think>`, `</think>`, `<\|im_start\|>`, `<\|im_end\|>`, tool e code — todos `reserved_special_token_N` no Llama |
| 7 | "`types` nunca preenchido" | confirmado: o esquema tipado da ponte tem sete `spec_draft_*` e nenhum `speculative`. **Só `draft-simple` é alcançável**; os outros cinco exigem recompilar |
| 8 | escrita truncando em silêncio | disco cheio corta o gguf sem erro; o sintoma é `(ABORT)` sem texto, igual a incompatibilidade |

### A parede 7 NÃO caiu — e eu virei a casaca duas vezes antes de medir

Achei o string `speculative.types` dentro do wasm e concluí que o campo existia
e que eu só estava mandando ele solto em vez de aninhado. **Errado.** Aquele
string vem do código do PRÓPRIO llama.cpp compilado junto (o parser de
argumentos e o servidor), e não da ponte do wllama.

A ponte serializa por um ESQUEMA TIPADO, e o esquema é a lei:

    grep '"name"' index.js  →  spec_draft_model, spec_draft_ngl, spec_draft_n_max,
                               spec_draft_n_min, spec_draft_p_min,
                               spec_draft_threads, spec_draft_threads_batch

Sete campos, e nenhum `speculative`. O que não está no esquema não atravessa.
Medido, com `TIPOS=ngram-cache` e sem draft:

    common_speculative_init: no implementations specified for speculative decoding

Tentei então pelo TURNO, que não passa pelo esquema (`data_json:
JSON.stringify({...options})`, JSON livre). Também não: o
`common_speculative_init` roda UMA vez, na carga, e não por pedido — não sai
log novo no turno, e o relógio confirma (8,4 s com os tipos contra 7,2 s sem,
os dois quentes).

**Então vale o que estava escrito na parede 7 desde o começo:** só
`draft-simple` é alcançável, e mesmo ele por tabela — o wllama o escolhe
sozinho quando `spec_draft_model` está preenchido. Os outros cinco exigem
recompilar o wasm expondo o campo.

O que MUDA em relação ao registro antigo é o inventário: são **seis**
implementações compiladas neste wasm, não três.

    draft-simple ..... alcançável hoje (auto-selecionado)
    draft-mtp ........ compilado, inalcançável   ← a cabeça do PRÓPRIO revisor v2
    draft-eagle3 ..... compilado, inalcançável
    ngram-cache ...... compilado, inalcançável   ← o único que GANHOU do base
    ngram-mod ........ compilado, inalcançável
    ngram-simple ..... compilado, inalcançável

E `draft-mtp` estar aí é a parte cara do engano: em agosto eu escrevi `--no-mtp`
como padrão do conversor chamando a cabeça de MTP de "peso morto". Ela é peça de
VELOCIDADE, e o binário sabe usá-la.

### E o resultado, medido DE VERDADE

Com a especulativa realmente ligada, no navegador:

    desligada (draft só ocupando RAM) ... 2,58 tok/s
    ligada, com 90% de aceite .......... 2,46–2,89 tok/s
    base, sem draft .................... 5,19–5,48 tok/s

Corrigir o campo **não mudou o veredito**. E nativo, na pergunta real do Nilo
(64 tokens, `--ignore-eos`, semente fixa, CPU só para isto):

| rascunhador | rascunhados | aceite | total |
|---|---|---|---|
| — (base, `ngram-mod` rascunha 0) | 0 | — | **9 921 ms** |
| Llama-3.2-200M · `p_min 0,4` | 72 | 33,3% | 12 328 ms |
| Llama-3.2-200M · `p_min 0,75` | 25 | 48,0% | 12 402 ms |
| Llama-3.2-200M · `n_max 8, p_min 0,6` | 37 | 51,4% | 12 150 ms |
| Llama-3.2-1B Q4 · `p_min 0,75` | 29 | 89,7% | 14 339 ms |
| Llama-3.2-1B Q4 · `p_min 0,90` | 18 | **100,0%** | 14 940 ms |

**O aceite nunca foi o gargalo.** Cheguei a 100% e ficou 43% mais lento. Quanto
mais apertado o `p_min`, menos tokens são rascunhados — mas toda posição
continua pagando uma passada do draft para descobrir que não há o que oferecer.
O custo é a PRESENÇA do draft, não a qualidade dele.

### A CAUSA DO 1,5×: O tinyBLAS NÃO TEM KERNEL PARA WASM

O dono do jogo insistiu que faltava informação, e faltava mesmo. Aqui está.

O build do wasm liga `GGML_LLAMAFILE:BOOL=ON`. Com isso, todo
`ggml_compute_forward_mul_mat` tenta primeiro o `llamafile_sgemm()` — o tinyBLAS
do llamafile, que é quem faz multiplicação de matriz RÁPIDA, com blocagem e
tiling de registrador. Se não houver kernel para a arquitetura, ele devolve
false e a conta cai no laço genérico de produto escalar, linha a linha.

    grep arquiteturas em ggml-cpu/llamafile/sgemm.cpp:
      __AVX__  __AVX2__  __AVX512F__  __AVX512VL__  __AVX512VNNI__
      __AVX512BF16__  __AVXVNNI__  __SSE__  __FMA__  __VXE__
      __ARM_NEON  (21 ocorrências)
      wasm ....... ZERO

**x86 tem. ARM tem. wasm não tem.** O build PEDE tinyBLAS e nunca recebe.

É essa a causa do número que eu tratei como lei da física:

    eficiência de lote, nativo (com tinyBLAS) .... 6,3×
    eficiência de lote, wasm  (sem tinyBLAS) ..... 1,5×

E isso reordena tudo, porque **o prefill é ~75% do turno no aparelho** e prefill
é exatamente a operação que vive de matmul em lote. Um kernel wasm SIMD para o
tinyBLAS atacaria a maior fatia do custo — e de quebra tornaria a especulativa
possível, já que a verificação usa a mesma operação.

### A especulativa no teste limpo que faltava

Duas medições minhas estavam furadas e o dono do jogo desconfiou com razão:
o teste de "só geração" usava prompt de história ABERTA (aceite 12–15%), e o
teste com o prompt do Nilo (aceite 33–51%) media turnos curtos onde o prefill
dobrado dominava. **Nunca juntei aceite alto com medição limpa**, e ainda rodei
tudo com `-t 4 -td 4` numa máquina de 4 núcleos — dois pools brigando.

Refeito: prompt do Nilo, 192 tokens de saída, `-td 2`.

    base (ngram-mod, rascunha 0) ..... 21 432 ms
    200M p_min 0,4 ................... 31 375 ms   25,5% de aceite
    200M p_min 0,6 ................... 27 802 ms   52,4% de aceite
    200M n_max 2 ..................... 28 576 ms   40,2% de aceite

**Perde de novo, e no melhor caso (52% de aceite) ainda é 30% mais lenta.**
A conclusão sobrevive ao teste mais limpo — mas agora sabendo que ela é medida
EM CIMA DO CAMINHO LENTO. Uma review de 2026 diz que CPU deveria ser o caso
FAVORÁVEL ("a CPU is extremely starved for memory bandwidth, so the slow
per-step generation gives speculation plenty of headroom"). As duas coisas só
se conciliam se o gargalo for o matmul — que é o que o tinyBLAS ausente explica.

**Condição de reabertura:** se um kernel wasm do tinyBLAS existir, remedir a
especulativa ANTES de descartá-la de novo.

### WEBGPU: NÃO É ALAVANCA, É ARMADILHA — E JÁ ESTAVA ESCRITO

Eu propus WebGPU como "a maior alavanca não testada". Foi testada pelo menos
cinco vezes, e o registro está em `src/npc/floor10Gpu.ts`:

> *"O Felipe tentou WebGPU antes do WASM e travava o celular dele. A causa não
> era o que eu supunha (memória): é que o jogo é Three.js e desenha na MESMA
> GPU. O trabalho da LLM entope a fila de submissão e o render não fecha o
> quadro no prazo."*

Falhou com 3 de 36 camadas — `(ABORT)` na fala, depois `loadModel() is not yet
called`. Não é lentidão: é a geração morrendo. Por isso
`FLOOR10_GPU_START_LAYERS = 0`.

**Antes de propor uma frente, procurar no branch se ela já foi andada.**

### O CACHE DE PREFILL AGUENTA A CAUDA MUDANDO (medido)

Eu tinha dito "2,8×" medindo a MESMA pergunta quatro vezes, o que não é o jogo.
Refeito com persona fixa e pergunta nova a cada turno:

    IGUAL (mesma pergunta) ...... 10,2 s
    MUDANDO (o jogo) ............ 12,6 s
    SEM CACHE (piso) ............ 41,9 s

**3,31× no padrão real, aproveitando 92% do ideal.** O `cache_prompt` reaproveita
a persona inteira e só reprocessa a cauda. Este é o maior ganho JÁ DISPONÍVEL, e
o pipeline já o usa: `revisorCabeJuntoDoRascunhador()` evita a troca quando
granite (822 MB) + revisor v2 (541 MB) = 1,36 GB cabem no teto de 1,92 GB.

### O 1,5× DO WASM NÃO É LEI DA FÍSICA — É O BUILD

Eu tratei a razão lote/token do wasm (1,5×, contra 6,3× no nativo) como
propriedade do hardware e fechei a especulativa em cima disso. O dono do jogo
cobrou pesquisa em vez de dedução, e estava certo: o número depende de QUAIS
INSTRUÇÕES o build usa.

**O que parecia faltar: `-mrelaxed-simd`.** A PR #19590 do llama.cpp implementa
`wasm_i32x4_relaxed_dot_i8x16_i7x16_add`, que funde extend+multiply+add numa
instrução só. Ganhos que ela reporta (M2 MacBook Air, Chrome v144):

    Q8_0 ....... 1,00–1,05×
    Q4_0 ....... 1,28–1,53×
    Q4_K_M ..... 1,75–2,18×   ← a do SmolLM3 e a do revisor v2
    Q5_K_L ..... 1,52–2,02×

Apliquei, recompilei o `build-simd` (que é o que gera o wasm publicado) e medi.
**NÃO SERVE, e o motivo é de arquitetura.**

    velho ... 12,2s · 5,26 tok/s · "Nilo: Hi, my name's Nilo, and I think we're
              here because the elevator is malfunctioning..."
    novo .... 10,9s · 5,89 tok/s · "'#/]'# gec\"\"/]jumbotron.fi;; jumbotron&s
              [at[at'#;; .fi pymysql'#.fi&s gec/] pymysql pymysql..."

Não é "a fala mudou": é aritmética errada cuspindo lixo. E o ganho aparente de
1,12× não vale nada, porque a conta estava errada.

**O mecanismo, e ele é definitivo.** A spec do relaxed-simd restringe um dos
operandos a 7 bits, [0, 127], JUSTAMENTE para que as duas arquiteturas
concordem:

    x86 ..... PMADDUBSW   com sinal × SEM sinal
    ARM ..... SDOT        com sinal × com sinal

Os valores q8 do llama.cpp são int8 de faixa cheia (−128..127) e **violam a
restrição i7**. Em ARM (o M2 do autor, e um celular) sai SDOT e a conta fecha —
daí os 1,75–2,18× dele. Em x86 sai PMADDUBSW, que lê um lado como sem sinal, e
o resultado é lixo.

O patch não está quebrado: está **certo só em ARM**. Para um jogo de navegador
isso é pior que inútil — rodaria no celular e cuspiria `jumbotron pymysql` em
qualquer desktop. Revertido, e o wasm publicado continua intocado (md5 confere).

**Existe conserto, e não é barato:** a saída é decompor os valores com sinal
para caber na restrição de 7 bits (o backend WASM do NumKong faz assim). Isso é
reescrever o kernel, não aplicar um patch. E antes de gastar esse trabalho, vale
lembrar que o ganho medido aqui não valida nada — só uma bancada ARM diria
quanto sobra depois da decomposição.

**A lição, de novo, e agora ela salvou o jogo:** se eu tivesse aceitado o
relógio (1,12× mais rápido!) sem comparar as SAÍDAS, teria implantado um wasm
que faz o Nilo falar `pymysql`. Medir velocidade sem medir correção não é medir.

**A outra frente que eu ignorava: WebGPU.** A literatura põe 25–40 tok/s no
WebGPU contra 2–6 tok/s no WASM, e já existe um `build-gpu` nesta árvore, de 4
de agosto, que NUNCA foi implantado no jogo. Cobertura ~70–75% em celular. É a
tarefa 11, e ela vale mais do que tudo que esta caça da especulativa rendeu.

Ordenando as frentes pelo que valem:

| frente | ganho | estado |
|---|---|---|
| especulativa | **0** | morta, medida por todos os caminhos |
| relaxed SIMD | **0 como está** | certo só em ARM; conserto = reescrever o kernel |
| cache de prefill (#10) | ~2,8× | medido no A/B frio/quente |
| WebGPU (#11) | 5–10× (?) | build existe, nunca testado |

Sobram o cache de prefill (~2,8×, medido) e o WebGPU (não medido). O relaxed
SIMD saiu da conta ao ser testado — ver acima.

**A lição, e ela é a mais cara deste arquivo:** eu passei o dia medindo com
precisão dentro de uma caixa que eu nunca questionei. Medir bem não substitui
perguntar se a caixa é a certa.

### FIM DA LINHA: o wasm não ganha nada com lote, e é disso que a técnica vive

Duas correções minhas, as duas medidas:

**1. O seletor de tipos JÁ funciona — não precisa recompilar.** Eu escrevi duas
vezes que exigia rebuild. O próprio `wllama-context.h` desta árvore já tem o
patch que sobrecarrega o `spec_draft_model`:

    spec_draft_model = "types:ngram-cache"   → escolhe a implementação
    spec_draft_model = "models/draft.gguf"   → modelo, como antes

E o wasm publicado foi construído COM ele (`strings wllama.wasm | grep
WLLAMA_PATCH_TNE` acha as duas linhas). Prova por A/B: sem os tipos sai
`no implementations specified`; com `types:ngram-cache` a mensagem some.

**2. E não adiantou.** Medido no navegador, determinístico (temp 0,
`ignore_eos`, 64 tokens fixos, tarefa de revisor):

    base .......... 12,4s  12,5s  12,8s   → 5,08 tok/s
    ngram-cache ... 17,0s  16,1s  14,7s   → 4,03 tok/s   21% MAIS LENTO

O mesmo `ngram-cache` que GANHOU no nativo (9 325 contra 9 952 ms) perde no
wasm. E a razão fecha a tesoura:

    eficiência de lote, nativo ..... 6,3×  (pp64 73,0 contra pp1 11,6 tok/s)
    eficiência de lote, WASM ....... 1,5×  (prefill 7,8 contra geração 5,2)

Com 1,5×, conferir 6 tokens custa 6 ÷ 1,5 = **4 tokens**. Seria preciso aceitar
4 de cada 6 rascunhados só para EMPATAR — e com o rascunho de graça. O
`ngram-cache` acerta 33%; o draft de 200M, 33–51%. Ninguém chega aos 67%.

**A especulativa está morta no wasm, por qualquer caminho.** Não é rascunhador
ruim nem implementação faltando: o wasm não ganha quase nada processando em
lote, e é só disso que a técnica vive. Não reabrir sem antes medir de novo a
razão prefill/geração — se um dia ela subir (SIMD melhor, WebGPU), a conta muda.

### Onde a velocidade está, medida no mesmo teste

    fria .... 34,9s     carga + prefill de ~300 tokens
    quente .. 12,5s     cache_prompt reaproveitando o prefixo

2,8×, e já existe hoje. É o que explica o "200 s, raramente 70 s" do aparelho:
os 70 s são as vezes em que o cache pegou. O prefixo estável é a persona (~230
dos 273 tokens), então o turno quente real fica ~18 s nesta bancada — ~70–80 s
no aparelho. Com a conta de custo do dono do jogo:

    granite ....  25 s + 3 frases marcadas × 21 s  =  88 s
    SmolLM3 ....  75 s + 0 frases marcadas         =  75 s

O SmolLM3 não vence por ser rápido: vence por não dar trabalho ao revisor.

### O A/B DA ESPECULATIVA NO ARM — E POR QUE ELE AINDA NÃO VALE

Duas rodadas no aparelho do dono do jogo, pela sala `?velocidade`:

    COM especulativa ... carga 118,6 s · 474 ms/tok · 2,11 tok/s · lote 3,17×
    SEM especulativa ... carga  22,0 s · 264 ms/tok · 3,79 tok/s · lote 1,88×

Parece fechado — 44% mais lenta com a especulativa. **NÃO ESTÁ**, e por dois
motivos que são defeitos meus, não do aparelho.

**1. A sala nunca descarregava o motor anterior.** Ela guarda a instância viva
para a caixa de perguntas, e ao clicar "medir" de novo criava uma SEGUNDA
instância com o modelo inteiro enquanto a primeira continuava de pé. Num
celular são ~4 GB disputando RAM. A segunda medição de qualquer sessão estava
contaminada, e as duas linhas acima são da mesma sessão. Corrigido: agora o
motor anterior sai antes.

**2. O "ganho do lote" não mede lote quando a especulativa está ligada.** O
termo de geração carrega o custo do draft, e a razão vira lixo. Foi em cima do
3,17× — que é esse lixo — que eu anunciei, por uma mensagem, que a especulativa
tinha reaberto no ARM. Não tinha: eu estava comparando a rodada COM especulativa
do aparelho contra a rodada SEM da minha bancada. A sala agora se recusa a
mostrar esse número quando ele não vale.

**O que dá para dizer com honestidade hoje:** o ganho de lote do ARM medido
limpo é **1,88×**, contra 1,50× do x86 — melhor, mas na mesma ordem. Com 1,88×
o ponto de equilíbrio pede 52% de aceite, e o medido vai de 33% a 52%: em cima
da linha. A especulativa continua sem margem, mas o A/B que decidiria isso
**ainda precisa ser refeito**, agora que a sala não empilha mais dois motores.

O que MUDOU de verdade no aparelho, e é grande, não tem nada a ver com
especulativa: o turno caiu de ~140 s (o piso dele, "nunca menos") para 8–27 s na
sala. Isso é prompt curto mais `cache_prompt` quente entre perguntas — a
alavanca do prefill, que continua sendo a maior de todas.

### A TESOURA: por que o aceite de 100% ainda perde

O negócio da especulativa é: o rascunho chuta *k* tokens barato, e o alvo
confere os *k* NUMA PASSADA. Ela ganha quando

    k passadas do rascunho + 1 conferência de k tokens  <  k passadas do alvo

Isso pressupõe que conferir k custe ~1. Numa GPU custa: a geração é limitada por
banda de memória e os pesos são lidos uma vez, seja qual for o lote. **A técnica
foi desenhada para uma máquina onde o lote é de graça.**

Na CPU o lote NÃO é de graça. Medido (`llama-bench`, SmolLM3-3B Q4_K_M, 4 fios):

    pp1  ....  11,62 tok/s     lote de 1 (= geração, tg128 = 11,69 ✓)
    pp4  ....  38,57 tok/s     3,3× mais eficiente
    pp8  ....  46,90 tok/s     4,0×
    pp16 ....  67,85 tok/s     5,8×
    pp64 ....  73,00 tok/s     6,3×  ← o teto

Com `n_max 5` o alvo confere lotes de 6, e no lote 6 a eficiência é ~3,6×, contra um teto de 6,3×. **Dos 6 tokens que
você esperava pagar pelo preço de 1, você paga 1,7.** A margem encolhe 70% antes
de contar o custo do rascunho.

E não dá para fugir aumentando o lote, porque a outra ponta fecha:

    n_max 3  ....  35,2% de aceite
    n_max 8  ....  30,6%
    n_max 12 ....  24,7%

**Lote pequeno → eficiência de lote ruim. Lote grande → o aceite desaba.** As
duas pontas se fecham no meio, e é no meio que a especulativa precisa viver.

É por isso que o rascunho de 100% de aceite ainda ficou 43% mais lento, e é por
isso que NENHUM ajuste salva a especulativa com segundo modelo aqui. Não é
falta de rascunhador bom: é a premissa da técnica que não vale nesta máquina.

O que continua de pé são as implementações SEM segundo modelo — `ngram-cache` e
`draft-mtp`. Elas ainda pagam a tesoura, mas param de pagar o rascunho por cima
dela, e é essa segunda parcela que afundava todas as medições.

### O piso de 215 MB: por que a família inteira não serve

    draft-1b.gguf     tensores 799,9 MB · embeddings 215,5 MB = 27%
    draft-1b-q2.gguf  tensores 573,0 MB · embeddings 215,5 MB = 38%

**A tabela de embeddings não encolhe com quantização** — 128256 × 2048 dá os
mesmos 215,5 MB em Q4 e em Q2, byte por byte. Isso põe um piso de ~450 MB em
qualquer Llama-3.2-1B contra um alvo de 1,78 GiB: só 3× menor, quando a regra
prática pede 5–20×.

Daí sai a especificação que faltava à busca: **vocabulário 128256 e hidden bem
abaixo de 2048**. Quem atende é `k-l-lambda/Llama-3.2-200M` (hidden 1024, 8
camadas) — 198 MB depois de convertido, quantizado e alinhado, e treinado de
verdade (33–51% de aceite; aleatório daria ~0%). O autor mantém uma oficina de
drafts: `Llama-3.2-40M`, `100M`, `200M`, `Llama-3.2-1B-vocab32k` e cabeças EAGLE.
**Mesmo ele perde**, como mostra a tabela.

### Duas armadilhas de medição que me custaram rodadas

1. **`prompt eval time` está poluído** quando há draft: ele reportou *259 tokens
   para um prompt de 18*, porque conta as passadas do draft. Subtrair prefill do
   total para "isolar geração" dá lixo — cheguei a anunciar um ganho de 34% que
   as outras linhas desmentiam. Para medir geração, use prompt CURTO e leia o
   total.
2. **Rodar qualquer outra coisa na mesma CPU invalida a linha.** Três medições
   minhas foram para o lixo assim; numa delas o prefill caiu de 43 para 16,7
   tok/s porque deixei um `llama-bench` por cima.

### O que fica de aproveitável

- **`espec-nativa.sh`** mede fora do navegador, com `n_drafted`/`n_accept` que o
  console do Chromium não devolve. A base honesta é `ngram-mod`, que nesta
  pergunta rascunha zero: mesmo binário, mesmo caminho, zero especulação.
- **`alinhar-draft.py`** alinha vocabulário E as flags `add_bos`/`add_eos`. A
  parede 4 voltou pelo 200M porque a chave explícita `add_bos_token = true` ganha
  do `tokenizer.ggml.pre`, e o alinhador arrumava o pre e deixava a flag.
- **`wllama-espec/index.js`** monta o draft como blob e agora manda
  `speculative: { types: [...] }`.

### O veredito

Para o Nilo, a especulativa ataca a metade errada do turno. No wasm o prefill
roda a ~7,8 tok/s contra 5,2 da geração — só 1,5× mais barato por token, contra
6× no nativo — então ~75% do turno é prefill. O draft **piora** isso, porque os
dois modelos processam o prompt. E 1,92 GB + 198 MB estoura o teto do aparelho.

O que resta de especulativa que ainda pode valer é o **n-grama no REVISOR**, não
no rascunhador: ele reescreve uma frase que já está no prompt mudando o mínimo,
e aí quase todo token da saída já existe na entrada. E não carrega segundo
modelo — zero RAM extra, que é a única coisa que cabe no teto.

### O que falta para valer a pena

1. um draft Llama-3.2 de ~300 MB (podado ou destilado) — a busca agora é trivial
   porque o vocabulário está destravado;
2. **ou** recompilar o wasm expondo `types`, o que abre n-grama (zero RAM extra),
   MTP (a cabeça do próprio revisor v2) e EAGLE-3.

E mesmo que 1 funcione, a RAM continua de pé: SmolLM3 1,92 GB + draft é mais que
o teto de 1,92 GB. Fechar exigiria o SmolLM3 em Q3.
