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

## REGRA ZERO — WEBGPU ESTÁ FECHADA. NÃO PROPONHA.

Reprovada **seis vezes** no aparelho do dono do jogo. A sexta fui eu, nesta
sessão, listando-a como "a frente de maior valor da fila" — dentro do arquivo
cujo primeiro parágrafo diz que ele existe porque eu já tinha feito isso.

A causa não é lentidão, não é memória, e não se conserta com menos camadas:

> O jogo é Three.js e desenha na **MESMA GPU**. O trabalho da LLM entope a fila
> de submissão e o render não fecha o quadro no prazo. (`d9fc9af4`)

E ela nunca ganhou nem quando funcionou: **CPU×8 em 242,5 s contra WebGPU×2 em
257,1 s**. Com 3 de 36 camadas dava `(ABORT)` na fala e depois `loadModel() is
not yet called` — a geração morrendo, não demorando. `GGML_WEBGPU=ON` no binário
também foi medido: **diferença zero**.

Palavras do dono do jogo, depois da sexta vez: *"pqp eu já testei mais de 5x, já
está registrado, e tu insiste nisso"*.

**O que reabre isto:** nada que eu meça nesta caixa. Só ele, no aparelho dele,
dizendo que quer olhar de novo. Número de paper, cobertura de mercado e
`build-gpu` parado na árvore JÁ FORAM os argumentos das seis vezes.

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

### ↑ ISSO ESTAVA CERTO NO SINTOMA E ERRADO NA CAUSA — E A PAREDE CAIU

`not within file bounds` **não é falta de RAM nem limite de arquitetura**. As
três builds em jogo (a do CDN e as duas locais) são wasm64 — conferido lendo a
flag da memória importada no binário, `0x07`. E o número entrega a causa:

    SmolLM3-Q4_K_M = 1,92 GB, registrado como "89% do teto"
    1,92 ÷ 0,89 = 2,16 GB ≈ 2 GiB exatos

**2 GiB é o limite de um `Blob`/`ArrayBuffer` no navegador**, por ARQUIVO. E
isso tem contorno documentado no próprio wllama, que nunca foi tentado:

    "If the input URL is a string in the `gguf-split` format, it returns an
     array containing the URL of each shard in ascending order"

**MEDIDO, e a parede caiu.** `granite-4.0-h-tiny` (7B-A1B, MoE híbrido de
Mamba) em Q2_K, 2,59 GB, partido com `llama-gguf-split --split-max-size 1500M`
em dois pedaços de 1,50 e 1,09 GB, carregou e gerou no navegador:

    modelo                    prefill        geração       lote
    granite 7B-A1B Q2_K ..... 11,05 tok/s    5,38 tok/s    2,05×
    SmolLM3-3B Q4_K_M .......  7,26 tok/s    4,71 tok/s    1,54×

**O MoE de 7B ganha do denso de 3B nas DUAS pontas** — +52% no prefill, que é
~75% do turno no aparelho, e +14% na geração. Custa 74 s de carga e ~2,6 GB de
RAM, que é 35% acima do que o aparelho já provou aguentar: esse é o único
desconhecido que sobra, e só o aparelho responde.

Qualidade em Q2_K, nas perguntas do dono do jogo (`nilo-perguntas.sh`): 4 de 5
limpas, e **passou na armadilha do corredor que o SmolLM3 errou nas duas vezes
que foi testado** — respondeu que não há corredor, só a sala cinza. A que falhou
foi "pode me levar ao saguão?", onde ele vira ajudante ("Sure, just let me know
when you're ready"), que é justamente o que o revisor existe para pegar.

CUIDADO AO REPETIR: o granite 4.0 usa `<|start_of_role|>…<|end_of_role|>`, e não
ChatML. Com o formato errado ele responde vazio, e eu quase condenei a qualidade
dele por erro meu de prompt.

E o par especulativo NÃO existe para ele: vocabulário 100352, e o menor granite
4.0 é o `h-micro` de 3B. Não há draft minúsculo com esse vocabulário.

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

**~~A outra frente que eu ignorava: WebGPU.~~ ERRADO — ver a REGRA ZERO no topo.**
Este parágrafo dizia que a WebGPU "NUNCA foi implantada" e valia 5–10×. As duas
coisas são falsas, e a refutação estava neste mesmo arquivo, 380 linhas acima,
escrita antes. Ele ficou aqui tempo suficiente para me enganar de novo numa
sessão posterior — eu li ESTA linha, não a seção "WEBGPU: NÃO É ALAVANCA, É
ARMADILHA", e apresentei a WebGPU ao dono do jogo como o item mais valioso da
fila. Sexta vez.

Fica riscado em vez de apagado porque o defeito não era o conteúdo, era o
arquivo poder se contradizer: um índice do que está fechado não serve para nada
se a entrada nova não olha a antiga.

Ordenando as frentes pelo que valem:

| frente | ganho | estado |
|---|---|---|
| especulativa | **0** | morta, medida por todos os caminhos |
| relaxed SIMD | **0 como está** | certo só em ARM; conserto = reescrever o kernel |
| cache de prefill (#10) | ~2,8× | medido no A/B frio/quente |
| ~~WebGPU (#11)~~ | **0, e trava o aparelho** | FECHADA — regra zero |

Sobra o cache de prefill. O relaxed SIMD saiu da conta ao ser testado, e a
WebGPU nunca esteve nela — ver a regra zero.

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

---

## Os 75% de lentidão da especulativa nunca existiram (medição errada, minha)

O dono do jogo desconfiou: *"vc deve estar fazendo algo de errado, especulativa
não diminuí a velocidade"*. Ele estava certo. Eram **quatro** erros empilhados,
todos meus. Registrados aqui para ninguém repetir.

### 1. `total time` não é o tempo de geração

`llama_context::perf_reset()` zera `t_start_us` no fim de
`common_init_from_params` — ou seja, depois do warmup do **alvo**. Em
`speculative-simple` o **rascunhador é carregado depois disso**. Então o
`total time` da run especulativa engole a carga do rascunhador, e a run base
não tem rascunhador para carregar. Viciado por construção.

A métrica honesta é a linha `decoded N tokens in T seconds`: o `t_dec_start`
fica depois dos dois modelos carregados e do prompt processado.

### 2. `prompt eval time` também mente na especulativa

Um dump meu mostrava `prompt eval time = 5319 ms / 101 tokens` para um prompt
de **17 tokens**. Não é bug: o llama.cpp contabiliza como `n_p_eval` **todo**
lote com mais de um token. Os lotes de verificação da especulativa entram ali.
Pelo mesmo motivo `eval time / N runs` conta *chamadas* de decode, não tokens.
Nenhum dos dois serve para comparar especulativa contra base.

### 3. O controle era outro binário

Eu comparava contra `llama-bench` (10,64 t/s) o que media com
`speculative-simple` (9,85 t/s) e creditava a diferença à especulativa. Mas o
`llama-bench` roda um caminho sem cadeia de samplers e sem detokenização: o
controle honesto é o **mesmo binário** com `--spec-draft-n-max 0`, que dá
**9,25 t/s**. Os 15% que eu vinha chamando de "custo da especulativa" eram
diferença de binário.

### 4. `--spec-type` é obrigatório neste llama.cpp

`-md draft.gguf` sozinho **não liga nada**: `--spec-type` tem default `none` e
a inicialização morre com `no implementations specified for speculative
decoding`. Metade das minhas runs antigas pode ter medido isso.

### O resultado honesto (x86, 4 núcleos, granite-4.0-micro Q4_0)

| configuração | t/s | vs controle |
| --- | --- | --- |
| controle (`--spec-draft-n-max 0`) | 9,247 | — |
| draft-simple 258M, n-max 3, p-min 0,75 | 8,982 | −3% |
| ngram-map-k, n-max 3 | 9,155 | −1% |

Três repetições cada, `-n 256`. **Empate**, não 75% de lentidão. Com uma
repetição só eu tinha "medido" +9,3% — ruído; a variância entre runs é ±5%.

### A curva de lote, que é quem decide

`llama-bench -p 1,2,3,4,5,6,8` no alvo, custo em unidades de 1 token solto:

| lote | 1 | 2 | 3 | **4** | 5 | 6 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| custo | 1,00× | 1,39× | 1,60× | **1,10×** | 1,62× | 1,85× | 1,89× |

O lote 4 é uma descontinuidade real: confere 4 tokens pelo preço de 1,1. É o
único ponto doce — 3, 5 e 6 são caros. Logo **n-max 3 e nada mais**.

Com o custo do rascunhador de 258M medido em 0,054× por token:

    aceleração = E[tokens da rodada] / (custo(n+1) + n × 0,054)

| aceitação | 27% | 40% | 50% | 60% | 70% | 80% |
| --- | --- | --- | --- | --- | --- | --- |
| n-max 3 | 1,08× | 1,29× | 1,48× | 1,72× | 2,00× | 2,34× |

O modelo prevê 1,08× a 27% de aceitação; medi empate. Bate.

### A conclusão que muda a caça

**A especulativa não está quebrada. O rascunhador está.** O docling-258M só
concorda com o granite 27% das vezes quando forçado a rascunhar 3 tokens (os
"52%" de antes eram com `p-min` cortando o rascunho no primeiro token, o que
joga fora o desconto do lote 4 e paga o lote 2 a 1,39×).

A aritmética diz exatamente do que precisamos: **aceitação ≥ 50%** com n-max 3.
Aí são 1,48×. A 70%, 2×. Abaixo de 40% não vale.

E o `ganho do lote` que a `?velocidade` mostra **não responde essa pergunta**:
ele é `geracaoMs / prefillMs`, o ganho no lote de **512**. A especulativa roda
lote 4. Neste x86 o ganho a 512 é enorme e o ganho a 4 é 3,63× — e mesmo assim
a especulativa empatou, porque quem travou foi a aceitação.

### Onde continuar

Caçar aceitação, não velocidade de rascunhador:

1. rascunhador **da própria família** do alvo (destilado da saída do granite),
   que é o que faz a aceitação subir de 27% para 70%+;
2. auto-especulativa: o próprio alvo em quantização mais baixa como rascunho —
   aceitação alta por construção, mas o tamanho precisa caber no teto;
3. n-grama continua sendo o único que não custa RAM.

---

## O estado da arte da especulativa (pesquisa + medição, ago/2026)

A conta da seção anterior pede **aceitação ≥ 50%**. Isso define a busca: não é
achar rascunhador mais rápido, é achar rascunho que o alvo *concorde*. Existem
quatro famílias, e só duas têm caminho até o navegador.

### 1. Rascunhador separado (`draft-simple`) — o que eu vinha tentando

Um segundo modelo pequeno, vocabulário compatível. É o que dá 27% com o
docling-258M contra o granite. O problema é estrutural: dois modelos treinados
separadamente não concordam, por melhor que o pequeno seja. Custa ainda um
download extra e RAM extra.

### 2. EAGLE-3 — a melhor aceitação que existe, e inalcançável daqui

Uma cabeça de uma camada só que lê as ativações **internas** do alvo (baixo,
médio e alto nível fundidos) em vez de só o token anterior. Aceitação de 60–88%,
3–4× de throughput. Treina em 2–4 h em 4×H100 com a saída do próprio alvo como
supervisão.

Mas: **não existe caminho GGUF**. Busquei no Hub por `eagle3 GGUF` e o resultado
é vazio. EAGLE-3 vive em vLLM e SGLang. O `--spec-type draft-eagle3` está
compilado no wasm, mas não há peso para carregar nele. Fechado por enquanto.

### 3. MTP — especulativa embutida no modelo. **É o caminho.**

O modelo é pré-treinado com um objetivo auxiliar de prever N tokens à frente, e
a cabeça extra viaja **dentro do mesmo GGUF**. Consequências, todas boas para o
teto do aparelho:

- **zero download extra** — não há segundo arquivo;
- **zero RAM extra** de um segundo modelo;
- **zero problema de vocabulário** — é o mesmo tokenizador, por construção;
- aceitação alta porque a cabeça foi treinada contra este alvo exato.

Não dá para adicionar depois: é objetivo de pré-treino, não de fine-tune. Ou o
modelo nasceu com MTP, ou não tem.

Nativos: Qwen3.5 e 3.6 (inclusive as MoE A3B), DeepSeek V3/V4, Gemma 4. **Não**
têm: Llama 3 e 4, Mistral, Gemma 2/3 — e o granite também não.

Em tamanho de celular (unsloth, GGUF, Q4_K_M):

| modelo | tamanho | nota |
| --- | --- | --- |
| Qwen3.5-0.8B-MTP | 550 MB | |
| **Qwen3.5-2B-MTP** | **1,33 GB** | menor que o granite 7B de hoje |
| Qwen3.5-4B-MTP (UD-Q2_K_XL) | 2,12 GB | abaixo da parede de 2 GiB, arquivo único |

O wasm implantado tem `draft-mtp` **e** a arquitetura `qwen35` compilados
(conferido com grep no binário), então o caminho existe no navegador.

### O que eu medi do MTP (x86, 4 núcleos, Qwen3.5-2B Q4_K_M, 3 repetições)

| configuração | t/s | aceite | vs controle |
| --- | --- | --- | --- |
| controle (`--spec-draft-n-max 0`) | 14,261 | — | — |
| MTP n-max 1 | 14,604 | 77,2% | +2,4% |
| **MTP n-max 2** | **14,915** | **70,4%** | **+4,6%** |
| MTP n-max 3 | 11,197 | 36,5% | **−21%** |

A aceitação é a prometida: **70–77%**, contra 27% do rascunhador separado. É a
única coisa que já entregou o número que a conta pedia.

**n-max 3 despenca.** A cabeça é treinada para uma profundidade limitada; além
dela ela chuta, a aceitação cai pela metade e o lote maior vira prejuízo.
`n-max 2` e ponto — é o que a documentação do llama.cpp também usa no exemplo.

### Por que 2× na GPU e só 5% aqui

Os números de 1,7–2× que circulam são todos de GPU (Qwen3.6-27B numa RTX 3090:
38 → 65 t/s). Na CPU a cabeça MTP **não é de graça**: fazendo a conta reversa a
partir da aceitação e do ganho medidos, ela custa ~0,31× de um forward completo
por token rascunhado. O motivo é a projeção de saída sobre um vocabulário de
150k — numa GPU isso é troco, numa CPU limitada por banda é uma fatia grande.

A curva de lote do Qwen 2B também é pior que a do granite:

| lote | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- |
| custo | 1,59× | 1,47× | 1,45× | 1,74× | 2,53× |

Aqui o lote **2 é o pior negócio** (1,59×), ao contrário do granite, onde o
degrau estava no 4. A curva é por modelo *e* por hardware — não dá para herdar.

### 4. n-grama — grátis em RAM, e não serve para português

Testei numa tarefa de reescrita, que é o trabalho real do revisor e onde quase
todo token da saída já existe na entrada:

| | t/s |
| --- | --- |
| controle | 9,968 |
| ngram-simple n-max 8 | 9,891 |
| ngram-simple n-max 16 | 10,076 |
| ngram-mod (config da doc) | 10,137 |

Tudo dentro do ruído. E o motivo é específico do português: corrigir `nao` para
`não` **troca o token**. Numa correção de acentuação quase toda palavra muda, e
o n-grama, que só sabe copiar trechos idênticos, não tem o que copiar. Ele
ganharia em código e em JSON, não em prosa acentuada.

### Conclusão

Das quatro famílias, só o **MTP** entregou aceitação suficiente, e ele exige
trocar de modelo — o granite não tem MTP e não dá para acrescentar. O ganho da
especulativa em si, na CPU, é modesto (+4,6%); o ganho grande estaria em trocar
o alvo, não em rascunhar melhor.

Antes de trocar qualquer coisa, o Qwen3.5-2B Q4_K_M **perde em qualidade** para
o granite em português — pedi uma resposta do Nilo e ele escreveu "o vidro aqui
é feito de vidro de vidro" e contradisse a premissa. O candidato honesto para
medir é o **Qwen3.5-4B-MTP em UD-Q2_K_XL (2,12 GB)**, que fica no tamanho do
granite 7B de hoje. Isso ainda não foi medido.

### O Qwen3.5-4B-MTP medido: reprovado, e por um motivo que fecha o assunto

Baixei o `UD-Q2_K_XL` (2,12 GB, abaixo da parede de 2 GiB) e medi contra o
controle honesto, 3 repetições de 256 tokens:

| configuração | t/s | aceite | vs controle |
| --- | --- | --- | --- |
| controle | 6,670 | — | — |
| MTP n-max 1 | 6,524 | 74,8% | −2% |
| MTP n-max 2 | 6,052 | 61,7% | −9% |

**MTP perde no 4B mesmo com 74,8% de aceitação.** A causa é a quantização, não
a cabeça. Curva de lote deste arquivo em Q2_K:

| lote | 2 | 3 | 4 |
| --- | --- | --- | --- |
| custo | 1,50× | 2,02× | 2,51× |

Quase linear — o lote 4 custa 2,51× um token solto, contra **1,10×** do granite
em Q4_0. Em Q2_K o llama.cpp não entra no caminho de GEMM para lotes pequenos:
faz matriz-vetor por token e o custo cresce reto. Sem degrau, não há o que a
especulativa explore.

A conta fecha na casa decimal: 74,8% de aceite dá E = 1,75 tokens, dividido por
(1,50 do lote + 0,29 da cabeça MTP) = 0,98×. Medido: 0,978.

**Regra que sai daí: especulativa e Q2_K não se misturam.** Se for usar
especulativa, o alvo tem de estar em Q4_0 ou Q4_K, que é onde o degrau existe.

### E a comparação que encerra a caça

| modelo | tamanho | t/s |
| --- | --- | --- |
| **granite 4.0 h-tiny 7B-A1B Q2_K (o de hoje)** | 2,59 GB | **19,7 a 29,6** |
| Qwen3.5-2B-MTP Q4_K_M | 1,33 GB | 14,9 |
| Qwen3.5-4B-MTP Q2_K_XL | 2,12 GB | 6,7 |

(`llama-bench` dá 19,7 para o granite e o `speculative-simple` dá 29,6; os dois
discordam na magnitude, mas não na ordem.)

O granite ganha de 1,3× a 4,4×, e o motivo é a arquitetura: **7B totais, ~1B
ativos**. Por token ele calcula um quinto do que o Qwen 4B denso calcula. Nenhum
ganho de MTP — o melhor medido foi +4,6% — chega perto de fechar 3× ou 4×.

**A MoE já ganhou da especulativa, e por uma ordem de grandeza.** E não existe
MoE pequena com MTP: as únicas Qwen A3B com MTP são de 35B totais, que em Q2
passam de 13 GB.

Uma coisa que o Qwen fez melhor e que **não** exige trocar de modelo: seguir o
personagem. Perguntado "por que não tem janela aqui?" com a instrução "curto e
seco", o Qwen 4B respondeu *"Porque é um elevador. A janela não serve para
nada."* e o granite respondeu *"A janela é um recurso de design para o elevador,
mas neste caso, optamos por não incluir uma janela para manter um ambiente de
trabalho focado e livre de distrações."* — ignorando a instrução e virando
consultoria. Isso é problema de prompt do granite, não de modelo, e é onde vale
mexer.

### O MTP liga no wasm implantado — provado antes de custar dados de celular

`bancada-navegador/mtp-navegador.mjs` sobe o wllama-relaxed no Chromium com um
GGUF que tem cabeça MTP e compara o controle contra `types:draft-mtp`. O que ele
confere não é velocidade, é **se a implementação registra**. A prova está nos
logs nativos:

    controle .... common_speculative_init: no implementations specified
                  prompt_save: total state size = 20.252 MiB (draft: 0.000 MiB)

    MTP ......... (sem o erro acima)
                  [spec] failed to measure MTP context memory:
                         common_get_device_memory_data is not implemented in wllama
                  prompt_save: total state size = 20.418 MiB (draft: 0.166 MiB)

Os 0,166 MiB de `draft` no estado salvo e o aviso específico de MTP só aparecem
quando a cabeça está montada. O remendo `WLLAMA_PATCH_TNE` — o prefixo `types:`
sobrecarregando `spec_draft_model` — é a única porta, porque o schema tipado do
wllama não tem campo para o tipo e sem `--spec-type` a inicialização morre.

Medido no wasm desta bancada (Qwen3.5-0.8B-MTP Q4_K_M, 64 tokens, 3 repetições):

| | tok/s |
| --- | --- |
| controle | 13,82 |
| MTP n-max 1 | 9,22 |
| MTP n-max 2 | 7,18 |

**No wasm a perda é MAIOR que no nativo** (−33% e −48%, contra −2% e −9% do
nativo). Isso não decide o aparelho do dono do jogo — a curva de lote é por
hardware, e a desta bancada dá 1,10× onde a dele deu 3,17× — mas é a expectativa
honesta a levar para o teste.

---

## Por que o SmolLM3 parece mais rápido que o granite no aparelho

O dono do jogo disse que, no celular dele, o SmolLM3 continua mais rápido que o
granite — e desconfiou que fosse "questão de configurar". Era, e a configuração
errada é minha.

**Primeiro descartei o palpite óbvio:** threads. A sala fixa `n_threads: 4` e o
jogo resolve por `cpuThreadCount()`, que no Snapdragon 7s Gen 2 (4×A78 + 4×A55)
também dá 4 — metade dos núcleos, o cluster rápido. Batem. Não é isso.

**A causa é o kernel relaxed.** Ele acelera **uma** função:
`ggml_vec_dot_q4_K_q8_K`. Mais nada. E os dois modelos não compartilham nem um
tensor de tipo:

| granite 7B-A1B (Q2_K) | | SmolLM3-3B (Q4_K_M) | |
| --- | --- | --- | --- |
| q2_K | 176 | **q4_K** | a maioria |
| q5_K | 64 | q6_K | |
| q8_0 | 64 | q5_K | |
| q3_K | 24 | q8_0 | 1 |
| q6_K | 1 | | |

**O granite Q2_K não tem UM tensor q4_K.** Com `?motor=relaxed` ligado — que é
como o aparelho é testado — o SmolLM3 pega o kernel inteiro e o granite pega
zero. Eu escrevi o kernel para a quantização do modelo antigo e nunca o estendi
para a do novo, então o granite roda no caminho lento enquanto o SmolLM3 roda no
rápido. A comparação que o aparelho mostra não é entre dois modelos, é entre um
modelo com kernel e outro sem.

Conferido que não há conserto de graça: `ggml/src/ggml-cpu/arch/wasm/quants.c`
do llama.cpp upstream não tem **nenhuma** ocorrência de `relaxed` — o meu de
q4_K é o único caminho relaxed que existe no wasm. Recompilar mais novo não
resolve.

### O kernel de q2_K está escrito: `relaxed-q2k.patch`

`ggml_vec_dot_q2_K_q8_K` é um alvo melhor que o de q4_K: ela faz **quatro**
`dot_i16x8` mais **oito** extends por 32 elementos, e o dot relaxed colapsa isso
em **dois**. Os pesos, depois do `& 0x03`, valem 0..3 — cabem no slot i7 com
folga enorme, e o pior caso do i16 intermediário do PMADDUBSW é
3×127 + 3×127 = 762, longe dos 32767 que saturariam.

A ordem dos operandos é a parte que quebra, e é a mesma armadilha de antes:
a ativação (`q8_*`, −128..127) vai no slot **i8** e o peso (`q2_bits_*`, 0..3)
no slot **i7**. Invertido, sai texto aleatório — foi o que aconteceu na primeira
versão do kernel de q4_K, e é o erro do PR #19590 do upstream.

O patch aplica limpo em `11cd988` (`git apply --check` passa).

**Ele NÃO foi compilado nem medido.** Falta emsdk e disco nesta sessão, e um
kernel de quantização errado não falha: ele responde bobagem, como o
`jumbotron pymysql` da primeira tentativa. Antes de ir para o wasm implantado
tem de passar pela `kernel-qualidade.mjs`, que compara a saída contra o build
antigo com `n_threads: 1`, `top_k: 1` e semente fixa — com mais de um fio o
build diverge de si mesmo e a prova não vale nada.

---

## O kernel de q2_K foi compilado e medido — e o "1,17×" do de q4_K era falso

Recompilei o wasm de verdade: emsdk 4.0.20 (o que o projeto fixa; a 6.0.8 falha
com `wasm32 object file can't be linked in wasm64 mode`), o llama.cpp que o
wllama fixa, os dois patches de kernel e o `-mrelaxed-simd`.

### O A/B honesto: dois wasms da MESMA árvore

`bancada-navegador/q2k-ab.mjs` compara `sem-q2k` contra `com-q2k`. Mesmo
llama.cpp, mesmo emcc, mesmas flags — e a cola do emscripten saiu **byte a byte
idêntica** entre os dois (mesmo md5), então a ÚNICA diferença é o kernel.

| modelo | sem q2_K | com q2_K | |
| --- | --- | --- | --- |
| requantizado Q2_K, 0,4 GB | 7,65 tok/s | 7,74 tok/s | 1,012× |
| **granite 7B-A1B Q2_K, 2,59 GB** | **3,10 tok/s** | **3,12 tok/s** | **1,008×** |

Aritmética: saída **idêntica caractere a caractere** com `temp 0`, `top_k 1`,
semente fixa e UM fio, em português de verdade. O kernel está **correto** — só
não paga.

### O controle positivo reprovou, e é a descoberta importante

Compilei um terceiro wasm sem kernel relaxed NENHUM e medi num modelo Q4_K_M,
onde o kernel de q4_K deveria brilhar:

    sem-nada .... 11,72 tok/s
    com-q2k ..... 11,61 tok/s      1,009× mais LENTO

**O ganho de 1,17× que este arquivo registrava para o kernel de q4_K não
existe.** Aquela medição comparou o wasm implantado (llama.cpp antigo, emcc
antigo) contra um build novo — carregou versão de biblioteca e de compilador
junto com o kernel. É o mesmo erro do `total time` da especulativa: comparar
duas coisas que diferem em três.

Descartadas as explicações fáceis, uma a uma: a flag chega
(`C_FLAGS` do ggml-cpu tem `-msimd128 -mrelaxed-simd`), a macro
`__wasm_relaxed_simd__` é definida, e o `repack` NÃO está ativo no wasm (o
carregamento mostra só `CPU model buffer`, sem `CPU_REPACK`), então o
`vec_dot` É o caminho quente.

### Por que zero, e onde ainda pode não ser zero

No x86 a `relaxed_dot_i8x16_i7x16_add` baixa para PMADDUBSW+PMADDWD — quase as
mesmas instruções do caminho explícito de extend+dot. **Esta bancada não
consegue medir o benefício da instrução**, e eu devia ter previsto isso antes
de compilar. É no ARM que ela vira `SDOT`, uma instrução no lugar da cadeia
inteira. Só o aparelho responde.

Por isso os dois wasms foram publicados EM PAR: `?motor=q2k` e `?motor=base`,
mesma árvore, só o kernel diferindo. É a única forma de perguntar isso ao ARM
sem repetir o erro de cima.

### O que a árvore nova custa: o MTP morre

Subir para o llama.cpp que o wllama fixa **quebra o MTP no wasm**. A página
morre depois de montar o segundo contexto — sem exceção, sem erro, morte por
memória — inclusive com `n_ctx` 512. No wasm de agosto o mesmo teste passa e
imprime `draft: 0.166 MiB`.

Então `?motor=relaxed` continua sendo o de agosto e continua sendo o ÚNICO com
MTP; a sala só mostra a caixa do MTP nele. Trocar o motor implantado por um que
ganha 0,8% no x86 e perde um recurso que funciona seria péssimo negócio.

O remendo dos tipos está salvo em `wllama-tipos-espec.patch` — ele estava só na
árvore de trabalho e teria se perdido.

---

## REGRESSÃO: os motores recompilados são 3× mais lentos, e foram retirados

O dono do jogo mediu no aparelho e trouxe os prints. Ele estava certo, e o
estrago é meu:

|  | antes (`164895a2`) | com os motores novos |
| --- | --- | --- |
| geração | 231 ms/token · **4,32 tok/s** | 455 ms/token · **2,20 tok/s** |
| prefill | 139 ms/token · **7,18 tok/s** | 285 ms/token · **3,51 tok/s** |
| uma pergunta | 35,7 s | 77,5 s |

Os DOIS números caíram quase exatamente pela metade, e a razão entre eles ficou
igual (1,66× contra 1,60×) — assinatura de máquina inteira mais lenta, não de
caminho de código diferente.

### O que era, e o que não era

Não era a sala: o diff de `164895a2` até aqui não toca `n_threads`, `n_ctx` nem
`n_batch`, e o wasm de `wllama-relaxed` **não mudou** (`git diff --name-only`
volta vazio para ele). Não era o `index.html`: a tabela de motores é
equivalente ao `if` que substituiu.

Era o motor que eu mandei ele usar. Eu escrevi "mede `?motor=q2k` contra
`?motor=base`" sem nunca ter comparado nenhum dos dois contra o de agosto —
comparei os dois novos ENTRE SI, que é o A/B certo para isolar o kernel e o
errado para decidir o que implantar.

Medido em bancada ociosa (load 0,06), três repetições, os dois na mesma corrida:

| modelo | motor de agosto | motor novo | |
| --- | --- | --- | --- |
| Qwen 0,8B denso Q4_K_M | 9,01 tok/s | 6,78 tok/s | 1,33× mais lento |
| **granite 7B-A1B Q2_K** | **4,85 tok/s** | **1,58 tok/s** | **3,07× mais lento** |

A perda atinge tudo, mas o **híbrido de Mamba do granite apanha o triplo**. O
wasm de agosto não tem `resolve_fused_ops`, `Lightning Indexer` nem
`DeepSeek V4` nas strings; o novo tem, e o log de carga dele resolve
`fused Gated Delta Net` duas vezes. É nessa faixa de mudança do llama.cpp que a
regressão do recorrente mora.

`wllama-q2k` e `wllama-base` foram **removidos** e o `?motor=` voltou a aceitar
só `relaxed`. Subir três vezes o custo do turno para medir um kernel que vale
0,8% seria trocar o certo pelo duvidoso.

### A lição, e ela é a mesma de novo

O A/B entre os dois motores novos estava metodologicamente certo — mesma
árvore, mesmo compilador, cola idêntica — e mesmo assim eu errei, porque um A/B
correto só responde a pergunta que ele faz. Ele respondia "o kernel de q2_K
paga?" e eu usei a resposta para decidir "posso implantar isto?", que é outra
pergunta e exigia um terceiro braço: o que já está no ar.

**Toda troca de motor precisa de um braço contra o que está implantado**, por
mais que o resto do experimento esteja limpo.

### O que sobra da caça ao kernel

A pergunta do ARM continua aberta e agora é mais cara: para respondê-la sem
regressão, o kernel de q2_K tem de ser portado para o llama.cpp de AGOSTO — o
que o `wllama-relaxed` usa — e não o contrário. Aí sim os dois braços diferem
só no kernel E nenhum deles é mais lento que o que está no ar.

### Confirmado no aparelho: a retirada resolveu

Medido pelo dono do jogo depois do revert, granite 7B-A1B Q2_K:

|  | antes da regressão | com os motores novos | depois do revert |
| --- | --- | --- | --- |
| geração | 4,32 tok/s | 2,20 | **3,96** |
| prefill | 7,18 tok/s | 3,51 | **7,76** |
| ganho do lote (512) | 1,66× | 1,60× | **1,96×** |

O prefill voltou ACIMA do de antes. A geração ficou 8% abaixo, e isso é
variação do aparelho, não resíduo: se fosse resíduo da regressão, o prefill
teria caído junto — foi assim que ela se apresentou, os dois pela metade e a
razão intacta.

Fica registrado o **1,96×** como leitura nova do ganho de lote 512 no aparelho,
ao lado do 1,88× de antes. Duas leituras do mesmo aparelho com 4% de distância
é a régua de quanto vale confiar numa medição única lá — e é o motivo de a
conta da especulativa nunca ter sido decidida por uma corrida só.

---

## O motor implantado é 3× mais rápido que QUALQUER build — inclusive o oficial

Fui portar o kernel de q2_K para o llama.cpp de agosto e esbarrei em algo bem
maior. Registrando na ordem em que apareceu, porque cada passo matou uma
hipótese.

### Achar a base de agosto

O wasm implantado tem `Gated Delta Net` nas strings mas não `Lightning Indexer`
nem `DeepSeek V4`. Cruzando com os pinos de submódulo do wllama:

| wllama | data | llama.cpp |
| --- | --- | --- |
| 91f2491 | 23/ago | 8144f319 |
| f16050d · d302659 · 95db60f · a3d9da2 | 16–17/ago | 4df29be4 |
| 0d62244 | 16/ago | 10bf611e |
| **766d28e** | **15/jun** | **dd4623a7** |

Só `dd4623a7` tem `draft-mtp` e `types:` **sem** as strings novas. Base achada,
e os dois patches de kernel aplicam limpo nela.

### As hipóteses, e como cada uma morreu

**1. "É a versão do llama.cpp."** Construí `wllama 766d28e + dd4623a7`, a base
de agosto, sem patch nenhum: **1,59 tok/s** no granite contra 4,75 do
implantado. Mesma fonte, mesma lentidão. Morta.

**2. "É o `-mrelaxed-simd`."** A flag deixa o compilador emitir relaxed em
código de ponto flutuante, que é onde o Mamba vive. Build limpo, sem a flag e
sem os kernels: **1,59 tok/s**. Morta.

**3. "É fio único."** Os dois escalam igual — o implantado vai de 2,80 a 8,81
tok/s de 1 para 4 fios, os meus de ~1,97 a ~6,7. Morta.

**4. "Monta um grafo diferente."** `carga-comparada.mjs` põe os logs de carga
lado a lado: **idênticos**. Mesmos buffers, 3454 nós nos dois, mesmos fused ops,
mesma flash attention. Morta.

**5. "É o meu jeito de compilar."** Esta é a que virou o resultado. Medi o
**build OFICIAL do CDN** que já estava na bancada:

| motor | Qwen 0,8B denso | **granite 7B-A1B** |
| --- | --- | --- |
| **implantado (agosto)** | **8,81–9,00 tok/s** | **4,64–4,85 tok/s** |
| CDN oficial do wllama | 6,82 | 1,59 |
| meu build de junho (a base de agosto) | 6,65 | 1,59 |
| meu build do pino de 23/ago | 6,78 | 1,58 |

**Não são os meus builds que estão lentos — é o implantado que está rápido.**
Todo o resto, inclusive o binário oficial, cai no mesmo patamar. E a vantagem é
de 1,3× no denso e **3× no híbrido de Mamba**.

Isso casa com o aparelho: o dono do jogo mede 3,96 tok/s no implantado e mediu
2,20 quando estava com um dos meus. A bancada e o celular concordam nos dois
motores, então o efeito é do binário, não do x86.

### O que isso significa, e é desconfortável

O jogo roda hoje num motor que **eu não sei reproduzir**. Enquanto isso não se
resolver, a caça ao kernel está travada: qualquer build meu já entra 3× atrás,
e nenhum ganho de kernel cobre isso.

A única variável que sobrou sem teste é a **versão do emcc**. Tentei compilar
com a 6.0.8 e o `emsdk_env.sh` reativou a 4.0.20 por baixo — o build saiu com a
4.0.20 de novo e não testou nada. É por onde começar.

O que NÃO fazer: trocar o motor implantado antes de reproduzir a velocidade
dele. Ele é o ativo mais valioso desta pasta e não tem receita escrita.

### A assinatura do motor implantado: outro toolchain, e nenhuma mágica no código

O dono do jogo levantou a hipótese certa — "será uma modificação que a gente fez
e esqueceu?" — e ela se responde comparando as tabelas de strings do binário
implantado contra o oficial do CDN. Diferença semântica: **uma só**.

    WLLAMA_PATCH_TNE: draft model = %s
    WLLAMA_PATCH_TNE: speculative types = %s

É o meu remendo do MTP, e ele não toca aritmética nenhuma. Não há kernel
escondido, não há flag mágica no código.

Mas os nomes mangleados denunciam o resto:

    implantado ... NSt3__210__function6__funcIN14wllama_context11should_stopMUlvE_ E FbvEEE
    oficial ...... NSt3__210__function6__funcIN14wllama_context11should_stopMUlvE_ NS_9allocatorIS4_EE FbvEEE

O parâmetro `allocator` do `std::function::__func` sumiu — isso é **libc++ de
outra versão**. O oficial ainda tem `__cxa_guard_acquire/release/abort`; o
implantado não. São toolchains diferentes, e o implantado é o mais novo.

Some-se a isso o `index.js`: o implantado tem **370.965 bytes**, e nenhum build
meu produz esse tamanho — a árvore de junho gera 357.890 e a de 23/ago gera
374.595. Ele está ENTRE as duas, o que aponta para um wllama de 16–17/ago
(`0d62244`…`f16050d`) combinado com o llama.cpp de junho, que é a única
combinação capaz de dar log com prefixo `sched_reserve:` e JS desse tamanho.
Essa combinação eu ainda não construí.

### O emcc 6.0.8 NÃO é a explicação

Testei a hipótese até o fim. Instalar e ativar exigiu três correções — a
`activate` por versão falha se o SDK veio pelo nome `latest`, o cache do
emscripten fica MISTURADO entre versões (`wasm32-emscripten` sobrevivendo num
link de 64 bits) e o CMake resolve as bibliotecas na sondagem inicial, que roda
sem `-sMEMORY64`. O que destrava é:

    emcc --clear-cache
    embuilder build ALL --wasm64
    emcmake cmake .. -DCMAKE_C_FLAGS=-sMEMORY64=1 -DCMAKE_CXX_FLAGS=-sMEMORY64=1 \
                     -DCMAKE_EXE_LINKER_FLAGS=-sMEMORY64=1

O build sai. E é **ainda mais lento** que o de 4.0.20 — tão lento que a corrida
de 48 tokens não terminou em 25 minutos, com o Chromium a 180% de CPU (ou seja,
calculando, não travado, e usando menos fios do que pediu). Hipótese descartada.

### O que ficou de proteção

`src/__tests__/motorImplantado.test.ts` fixa o md5 do wasm E do `index.js`
implantados, e cobra que `?motor=` não aponte para nenhum outro caminho da
mesma origem. Eu já sobrescrevi esse arquivo uma vez publicando rebuilds sem
medir contra o que estava no ar; o teste existe para que a próxima vez pare no
CI e não no aparelho do dono do jogo, dias depois.

Se ele falhar, a pergunta certa não é "atualizo a soma?" — é "o substituto
ganhou do `agosto` no granite, medido pelo `q2k-ab.mjs`?".

### Varrendo os pinos: a regressão do Mamba está entre 16 e 23 de agosto

Continuei a caça construindo cada combinação que o wllama já fixou. Todas com
emcc 4.0.20, `-DGGML_WEBGPU=OFF`, sem patch de kernel, medidas contra o
implantado **na mesma corrida** (o x86 desta bancada oscila entre dias, então só
a razão vale):

| wllama | llama.cpp | data | granite | atraso contra o implantado |
| --- | --- | --- | --- | --- |
| 766d28e | dd4623a7 | 15/jun | 1,59 tok/s | 2,99× |
| 0d62244 | 10bf611e | 16/ago | 3,02 tok/s | **2,23×** |
| d302659 (v3.6.0) | 4df29be4 | 16/ago | 3,09 tok/s | **2,20×** |
| 91f2491 | 8144f319 | 23/ago | 1,58 tok/s | 3,07× |

Duas coisas saem daí.

**1. Achei a janela da regressão do recorrente.** Os pinos de 16/ago rodam o
granite quase o DOBRO dos de 15/jun e de 23/ago. Ou seja, entre `4df29be4`
(16/ago) e `8144f319` (23/ago) o llama.cpp perdeu ~50% de velocidade em modelo
híbrido de Mamba no wasm. Essa janela é bissectável e o resultado interessa ao
projeto inteiro, não só a este jogo.

**2. E mesmo o melhor pino fica 2,2× atrás do implantado.** O ganho de trocar
de junho para agosto é real (2,99× → 2,20× de atraso), mas não fecha nem
metade. Sobra um segundo fator, maior que a versão do llama.cpp, que eu ainda
não achei.

Uma hipótese morreu de vez no caminho: **wllama de agosto + llama.cpp de junho
não compila** (`CMake Error at CMakeLists.txt:132 (add_executable)`, arquivos de
servidor que ainda não existiam). Então o implantado usa o pino do próprio
wllama, e a combinação híbrida que os tamanhos de `index.js` sugeriam é
impossível.

### O que já foi descartado, para não se repetir

| hipótese | como morreu |
| --- | --- |
| versão do llama.cpp | quatro pinos construídos; o melhor ainda fica 2,2× atrás |
| `-mrelaxed-simd` | build sem a flag dá o mesmo número |
| fio único | os dois escalam igual de 1 para 4 fios |
| grafo diferente | logs de carga idênticos, 3454 nós (`carga-comparada.mjs`) |
| meu jeito de compilar | o binário OFICIAL do CDN também fica 2,9× atrás |
| kernel escondido | a única string a mais no implantado é o `WLLAMA_PATCH_TNE` |
| emcc 6.0.8 | build sai e é AINDA mais lento (48 tokens não terminam em 25 min) |
| wllama ago + llama.cpp jun | não compila |

O que sobra sem teste: `-DGGML_WEBGPU=ON` (o implantado tem 29 strings de
webgpu, todos os meus zero, porque compilei com OFF) e as versões de emcc entre
a 4.0.20 e a 6.0.8 — o mangling do `std::function::__func` prova que o
implantado usa uma libc++ mais nova que a 4.0.20.

### Mais duas hipóteses mortas, e onde a caça fica

`-DGGML_WEBGPU=ON` **não é**: construí o melhor pino com WebGPU ligado (baixando
o `emdawnwebgpu_pkg` que o build oficial usa) e deu **3,10 tok/s** contra 3,09
do mesmo pino com WebGPU desligado. Diferença zero.

**Memória de 32 bits também não é.** Li o cabeçalho de importação de memória dos
quatro binários: todos trazem `flags=0x07`, ou seja **64 bits e compartilhada**.
O MEMORY64 é sabidamente mais caro no V8 e seria uma explicação bonita — mas o
implantado tem exatamente o mesmo.

O que sobrou de pista concreta: a cola do emscripten embutida no `index.js`
implantado tem **127.726 bytes** descomprimida, contra 144.377 e 144.504 das
minhas. Toolchain diferente, confirmando o que o mangling do `std::function`
já dizia. E o wasm implantado (7,65 MB) fica ENTRE o meu sem WebGPU (6,6 MB) e
o meu com WebGPU (8,5 MB), o que nenhuma das minhas configurações reproduz.

### Onde continuar, e é bissecção

A varredura dos pinos mostrou que existe uma **janela rápida** no llama.cpp por
volta de 16/ago: os pinos de lá rodam o granite ao dobro dos de 15/jun e de
23/ago. Mas mesmo eles ficam 2,2× atrás do implantado — o que sugere que o
motor de agosto foi construído sobre um commit do llama.cpp que **nenhum
release do wllama fixa**, provavelmente escolhido à mão quando eu apliquei o
patch do kernel.

Então a caça vira bissecção do llama.cpp dentro da janela, usando
`q2k-ab.mjs` com o braço `agosto` como referência fixa. É caro (cada ponto é um
build de ~12 min mais uma medição de ~10), mas é mecânico e o alvo é claro:
achar o commit que roda o granite a ~6,8 tok/s nesta bancada.

E vale lembrar por que isso importa além da curiosidade: se o motor implantado
depende de um commit que ninguém anotou, ele é irreproduzível — e o dia em que
alguém precisar recompilar (para o kernel de q2_K, para o MTP, para qualquer
coisa) o jogo perde 2× de velocidade sem aviso. Já aconteceu uma vez esta
semana.

### O `n_parallel` parecia a resposta e não era

Comparando os logs de carga achei uma diferença grande que tinha me escapado:

    implantado ... llama_memory_recurrent: 55,37 MiB (1 cells, 40 layers, 1 seqs)
    meu build .... llama_memory_recurrent: 221,48 MiB (4 cells, 40 layers, 4 seqs)

A causa é o commit `a3d9da2` do wllama, "properly support n_parallel" (16/ago),
que trocou o padrão de `n_parallel: 1` fixo por `params.n_parallel ?? 4`. Num
híbrido de Mamba isso QUADRUPLICA o estado recorrente, que é lido e escrito a
cada token — 55 MiB cabem em cache, 221 MiB não. E explicava a assimetria que eu
não sabia explicar: denso perdia 1,3×, Mamba perdia 3×.

Passando `n_parallel: 1` o buffer volta aos 55,37 MiB, idêntico ao implantado.
**E a velocidade não muda**: 3,06 tok/s contra 3,10 com o padrão de 4. O
atraso continua em 2,18×.

Então a diferença de memória é real, tem causa conhecida, e **não custa nada**.
Uma hipótese bonita a menos.

Fica o aviso de método: eu quase anunciei isso como a resposta ao ver os buffers.
Duas vezes nesta mesma investigação o patch de teste falhou em silêncio (um `cd`
que não existia derrubou o `python3` da cadeia e o script rodou sem a opção), e
a medição "sem diferença" parecia confirmar. Conferir que a opção CHEGOU — aqui,
olhando o buffer no log — é parte do teste, não zelo extra.

### A versão do emscripten também não é — e a invariância virou o dado principal

O motor implantado tem a assinatura de mangling de **duas** posições
(`NSt3__210__function6__funcIPFbcES2_EE`); os builds com emcc 4.0.20 têm três
(com `NS_9allocatorI...EE` no meio). Compilei com a 6.0.8 e a assinatura bate
com a do implantado — ou seja, **ele é da família 6.0.x**, não de uma versão
antiga.

Então testei a combinação que faltava, emcc 6.0.8 com o llama.cpp de agosto (o
pino rápido): **3,05 tok/s**, 2,24× atrás. A versão do compilador não é a
explicação.

O que sobra dos números é a **invariância**, e ela virou o dado mais importante
desta caça. Tudo que eu construo cai em 3,05–3,10 tok/s no granite:

| combinação | granite |
| --- | --- |
| emcc 4.0.20 + llama.cpp 16/ago | 3,02–3,09 |
| emcc 6.0.8 + llama.cpp 16/ago | 3,05 |
| com WebGPU / sem WebGPU | 3,10 / 3,09 |
| `n_parallel` 1 / 4 | 3,06 / 3,10 |
| depois de `wasm-opt -O3` | tamanho não muda: já estava otimizado |
| **implantado** | **6,6–6,9** |

Nada que eu mexa move o número. Isso não parece diferença de flag nem de
versão — parece que o implantado passou por uma etapa que o meu pipeline não
tem, ou saiu de uma fonte que não é a que eu reconstruo.

Uma pista sem explicação, guardada para quem retomar: comparando as seções dos
dois wasm, o **código do implantado é MENOR** (5.642.066 B contra 5.913.913 B)
apesar de ele carregar WebGPU compilado dentro e o meu não. Código menor com
mais funcionalidade é sinal de otimização mais agressiva.

### A janela da regressão do Mamba, com commits verificados

Um agente varreu os 137 commits entre `4df29be4` (16/ago) e `8144f319`
(23/ago). Conferi que os quatro candidatos existem e que os títulos batem:

| commit | data | título |
| --- | --- | --- |
| `849798132` | 20/ago | ggml: fix backend split scheduler race condition (#26040) |
| `929d47a39` | 20/ago | graph : create V as a view of K in the k_iswa build_attn (#27392) |
| `369e1cd61` | 22/ago | ggml: optimize concat op by replacing per-element memcpy with row-level memcpy (#24575) |
| `b062ba735` | 19/ago | opencl: port fused ssm_scan kernel (Mamba-2) to GPU (#26439) |

O primeiro é o mais plausível para o caso: ele acrescenta sincronização entre
splits do escalonador, e modelo recorrente gera muitos splits pequenos. A PR
mediu "sem regressão" em CUDA de duas GPUs — ninguém mediu em wasm de backend
único. **Nada disso está confirmado por medição**; é lista de suspeitos para
bissectar, não conclusão.

Aviso sobre a outra frente: um segundo agente concluiu que o implantado seria
Emscripten 3.1.6x. **Está errado** — a assinatura de mangling que eu li direto
do binário coloca ele na família 6.0.x. Registro aqui para ninguém reaproveitar
a conclusão.

---

## A "regressão do Mamba no llama.cpp" não se sustenta — e o erro é meu de novo

Fui atacar a bissecção para reportar upstream e o primeiro teste derrubou a
própria hipótese.

### 1. Não reproduz no nativo

`llama-bench`, granite 7B-A1B Q2_K, 64 tokens, 4 fios, x86:

    llama.cpp 4df29be4 (16/ago) ..... 21,90 tok/s
    llama.cpp 11cd988  (26/ago) ..... 19,98 tok/s      1,10x

No wasm a mesma janela dava **1,96×**. Ou seja: o llama.cpp sozinho responde por
~10%, não por 2×.

### 2. Minhas medições de wasm estavam confundidas

Olhando a tabela dos pinos com atenção, em TODA comparação eu troquei o wllama
JUNTO com o llama.cpp:

| wllama | llama.cpp | granite |
| --- | --- | --- |
| 766d28e (jun) | dd4623a7 | 1,59 |
| 0d62244 (16/ago) | 10bf611e | 3,02 |
| d302659 (17/ago) | 4df29be4 | 3,09 |
| 91f2491 (23/ago) | 8144f319 | 1,58 |

Os dois rápidos são wllama de meados de agosto; os dois lentos são wllama de
junho e de 23/ago. **Eu atribuí ao llama.cpp uma diferença que podia ser do
wllama**, e escrevi isso aqui como se fosse achado. Era a mesma armadilha do
`total time` e do "1,17× do kernel": dois eixos mudando juntos, conclusão num só.

### 3. E o eixo não dá para isolar

Tentei as duas combinações cruzadas e nenhuma compila:

    wllama 91f2491 + llama.cpp 4df29be4 → unknown type name 'common_fit_extra_model'
    wllama d302659 + llama.cpp 8144f319 → assigning to 'int' from incompatible type 'common_json'

O `wllama-context.h` acompanha a API do `common/` do llama.cpp de perto demais.
Sem um terceiro ponto que compile dos dois lados, a atribuição fica indecidível
com estas árvores.

### 4. Então NÃO abri relato upstream

Seria reportar como regressão do llama.cpp uma diferença que eu não consigo
demonstrar ser do llama.cpp — e o projeto pede bissecção fechada e, de
preferência, repro em backend nativo. Eu tenho o oposto: nativo quase não mexe.

O que sobra de verdadeiro e reportável, se alguém quiser retomar: **existe uma
diferença de ~2× no wasm entre pares (wllama, llama.cpp) de meados de agosto e
os de junho/23-ago**, e ela não aparece no nativo. Fechar a atribuição exige
achar um commit do wllama que compile com dois llama.cpp diferentes, ou fazer o
caminho inverso — portar as poucas chamadas de `common/` que quebram.

### O que a análise dos commits rendeu, mesmo sem o relato

Um agente leu os diffs dos quatro candidatos e eliminou três por mecanismo, o
que continua útil se a caça for retomada:

- `849798132` (scheduler sync) — **não pode ser**: a sincronização é guardada por
  `prev_backend_id != split_backend_id`, e com backend CPU único isso é sempre
  falso.
- `929d47a39` (V como view de K) — **não pode ser**: só toca a atenção do
  Deepseek4; o modelo em teste é recorrente.
- `b062ba735` (ssm_scan em OpenCL) — **não pode ser**: kernel de GPU, nunca
  compilado no wasm de CPU.
- `369e1cd61` (concat com memcpy por linha) — **único que sobra**: troca um laço
  único distribuído sobre a dimensão de saída por DOIS laços, cada um
  distribuído sobre sua própria dimensão. Se `ne02 != ne12`, as threads
  desbalanceiam. É hipótese de leitura de diff, **não medida**.

E a busca por relato existente voltou vazia: ninguém reportou regressão de
SSM/Mamba em CPU ou wasm nessa janela. O mais próximo é a issue #16454, de
out/2025, sobre o granite-4.0-h-tiny estar lento — aberta, nunca confirmada.

---

## O motor implantado é um artefato REMENDADO, e os remendos não existem em fonte

O dono do jogo insistiu: *"será uma modificação que a gente fez e nós dois
esquecemos?"* Quatro agentes varreram os dois binários e a resposta é **sim** —
mas não do jeito que eu procurava.

### O que os inventários acharam

Diferenças de símbolo entre o binário rápido e o meu, verificadas por mim
direto nos arquivos:

| | rápido (implantado) | meu build |
| --- | --- | --- |
| `draft-dflash` | **ausente** | presente |
| `draft-dspark` | **ausente** | presente |
| `deepseek4` | **ausente** | presente (3×) |
| `resolve_fused_ops` | **ausente** | presente |
| `Lightning Indexer` | **ausente** | presente (22×) |
| `Gated Delta Net` | presente (8×) | presente (14×) |
| `draft-mtp`, `draft-eagle3` | presentes | presentes |
| `ggml::cpu::repack` | 1 ocorrência | 18 ocorrências |

**Isso data o motor com precisão nova.** O DFlash entrou no llama.cpp em
`d1b34251b`, **28/jun/2026**, e o motor não o tem; mas ele tem MTP e EAGLE3, que
são anteriores. Logo o llama.cpp dele é **de antes de 28/jun** — mais velho que
QUALQUER coisa que eu reconstruí nesta caça, que começou no pino de 15/jun e foi
para a frente.

E o wllama dele não é nenhum commit upstream: entre `766d28e` (16/jun) e
`0d62244` (16/ago) existe **um único** commit, e o `index.js` implantado tem
370.965 bytes, contra 357.890 de um build limpo do 766d28e. Sobram ~13 KB.

### Os 13 KB são remendos nossos, escritos direto no artefato

Tirando a cola comprimida e comparando só o TypeScript, aparecem identificadores
que build nenhum do upstream produz: `ESPECULATIVA`, `Frankenstein`, `PONTE`,
`TIPADO`, `CHEGA`, `Medido`, `MODEL_LOAD_ACTIVITY_EVENT`. São **35 linhas de
comentário em português**, em sete regiões, marcadas como `PATCH TNE`:

1. **Ponte de pthread** — o emscripten desta build ignora `mainScriptUrlOrBlob` e
   cria cada pthread a partir de `_scriptName`, que dentro do Worker de Blob
   aponta para o próprio arquivo, sem bootstrap. O handshake nunca fechava e a
   carga travava para sempre. O remendo publica o Blob do módulo em
   `__emPthreadUrl`.
2. **Erro não-clonável no `postMessage`** — um `DOMException` inteiro não é
   clonável; o `postMessage` falhava, o main thread não sabia, e a promessa da
   carga não resolvia NEM rejeitava: o "carregando" eterno. Passa nome e
   mensagem em vez do objeto.
3. **O draft da especulativa precisa estar no FS, não numa URL.**
4. **Fragmentos de gguf dividido** — "dois modelos viram um Frankenstein".
5. Mais três regiões menores de registro e de esquema tipado.

**Nenhum é de performance.** São consertos funcionais — mas nenhum deles existe
em código-fonte, nem aqui nem no wllama upstream. Eles sobrevivem só porque o
`index.js` construído está versionado. Se esse arquivo se perder, some tudo, e
o "carregando" eterno volta.

Estão resgatados em `bancada-navegador/REMENDOS-DO-MOTOR.md`, com contexto, para
poderem ser reaplicados numa recompilação futura.

### A velocidade continua sem explicação

Testei mais duas coisas nesta rodada e nenhuma é a causa:

    n_parallel 1 (buffer recorrente idêntico ao dele) ... 3,06 tok/s
    GGML_CPU_REPACK=OFF (some o repack do binário) ...... 3,20 tok/s
    implantado ......................................... 6,6–6,9 tok/s

O repack rendeu 4%, o melhor ganho de flag até agora, e ainda assim sobra 2,08×.

O que a datação acrescenta é uma direção nova: **eu nunca testei um llama.cpp
anterior a 15/jun**. O motor é de antes de 28/jun e o pino mais velho que o
wllama oferece é o de 15/jun, que eu medi em 1,59 — mas com o wllama de junho
junto, e já sei que essa amarração confunde os dois eixos. Fechar isso exigiria
compilar llama.cpp de maio/junho contra o wllama de junho, que é a única
combinação que ainda não foi tentada.

---

## O motor da casa não subia em `npm run dev` — e nenhum teste podia ver

Isto não é sobre velocidade; é sobre o andar não funcionar. Fica aqui porque a
causa é a mesma decisão (trocar o CDN pelo motor da casa) e porque o modo como
escapou é o que interessa.

Quando `MOTOR_DA_CASA = '/wllama-relaxed'` virou o padrão de `wllamaEngine.ts`,
o Andar 10 parou de falar em desenvolvimento:

    Falha ao carregar granite-4.0-h-tiny 7B-A1B localmente:
    Failed to fetch dynamically imported module:
    http://127.0.0.1:3000/wllama-relaxed/index.js?import
    Nenhum outro modelo foi ativado.

O Vite recusa com 500 qualquer `import()` de arquivo que more em `public/`:

    This file is in /public and will be copied as-is during build without going
    through the plugin transforms, and therefore should not be imported from
    source code. It can only be referenced via HTML tags.

**Produção nunca esteve quebrada** — conferido, não suposto: `npm run build`
copia `dist/wllama-relaxed/index.js` e o `wasm`, e o `import()` sobrevive ao
bundle como import de URL em tempo de execução (`/* @vite-ignore */` mantém o
especificador dinâmico). É defeito só de `dev`.

### O que escapou, e por quê

Os 1.617 testes de unidade passavam. O `tsc` estava limpo. As duas coisas
continuam verdadeiras e continuam sem valer nada aqui: **nenhum teste de unidade
encosta no servidor de desenvolvimento**, e o defeito é uma resposta HTTP.

Quem viu foi abrir o jogo de verdade — `bancada-navegador/andar-10-real.mjs`,
que sobe o `index.html`, chama `window.__startFloor(10)`, põe o jogador perto do
Nilo e aperta `E`. A primeira execução dela morreu na primeira linha da fila.

### O conserto e a trava

`vite.config.ts` ganhou o plugin `motorDaCasa()`: um middleware que entrega
`/wllama-relaxed/*` cru, antes de o Vite analisar o pedido, com o tipo certo e
com os cabeçalhos de isolamento (sem eles não há `SharedArrayBuffer`, e o wasm
com threads não sobe).

A trava é `src/__tests__/motorServidoEmDev.test.ts`, que **sobe um servidor Vite
de verdade** e pede o arquivo com o `?import` incluído — que é exatamente a
parte que quebrava.

### Uma correção do próprio teste

A quarta asserção começou como "o atalho não serve nada fora da pasta do motor",
pedindo `/wllama-relaxed/../../package.json`. Ela falhou, e a leitura fácil era
"abri um buraco". Errado, nos dois sentidos:

  · `fetch` normaliza `../` antes de sair, então esse pedido chega ao servidor
    já como `/package.json` e nunca passa pelo nosso prefixo;
  · na forma percent-encoded (`%2e%2e`), o `package.json` volta — **e volta
    também com o plugin desligado**, medido num Vite sem `configFile`. É o
    servidor de desenvolvimento do Vite servindo a raiz do projeto, coisa dele,
    só em `dev`.

O teste hoje afirma só o que pode afirmar: que quem respondeu não foi o nosso
middleware (a assinatura é o `Cross-Origin-Resource-Policy`, que só ele põe).

---

## O Andar 10 real, aberto e medido de ponta a ponta

`bancada-navegador/andar-10-real.mjs` abre `index.html`, chama
`window.__startFloor(10)`, aproxima o jogador do Nilo, aperta `E` (o `open()` de
verdade, que dispara `iniciarPrecarga`) e manda as falas por `sendToNpc` — o
mesmo caminho do botão de enviar. Nada de `?pipeline`, nada de `floor10.html`
(que renderiza a bancada, não o jogo).

### O que a fila do jogo comum faz, medido

    1. fala      granite-4.0-h-tiny 7B-A1B          2,59 GB  ← essencial
    2. memoria   embeddinggemma-300M                0,33 GB
    3. juiz      juiz de tom (all-mpnet-base-v2)    0,11 GB
    4. reflexo   SmolLM2-135M (ONNX)                0,14 GB
    5. vontade   LFM2.5 1.2B                        1,25 GB
    6. motor     Qwen3-0.6B                         0,64 GB
                                                    5,05 GB

A conversa libera assim que a fala desce (a única essencial). Com tudo em cache
a fila inteira fecha em 44,7 s nesta caixa.

### As falas, no Andar 10 real

    ▸ Oi, quem é você?
      82,1 s · leitura 68 s · fala 10 s · 337 lidos
      "Eu sou Nilo Azevedo, um ex-técnico de elevadores que agora estou preso
       no 10º andar do hotel «The Normal Elevator»."

    ▸ Você lembra do que eu te perguntei antes?
      107,6 s · leitura 89 s · fala 16 s · 459 lidos
      "Eu lembro que você perguntou se eu lembrava do que aconteceu antes de
       estar aqui."

    ▸ Onde a gente tá?
      0,0 s — respondido pelos OLHOS, sem acordar o modelo

O gargalo aqui é a LEITURA do prompt, não a escrita: 110 s para 565 tokens
contra 11 s de fala. É o alvo da tarefa 10 (cache de prefill via
`llama_state_seq_*`), e não do modelo.

### Os outros três cérebros ainda estavam no CDN

A fala subia por `/wllama-relaxed`, mas o navegador continuava buscando
`cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js` — memória, vontade e
motor nunca tinham sido trocados. Passaram a apontar para o motor da casa, e
`bancada-navegador/cerebros-no-motor-da-casa.mjs` usa cada um DE VERDADE
(subir o runtime, não só baixar os pesos):

    ✓ memória — subir o runtime          9,6 s
    ✓ memória — lembrar por significado  0,3 s
    ✓ motor   — subir o runtime          5,5 s
    ✓ vontade — subir o runtime          9,8 s
    ✓ nenhum motor veio de CDN

### O que esta caixa NÃO consegue medir: a vontade

Ela mora no `useFrame` do Floor10Npc, e aqui nenhum `useFrame` roda. Medido:

    __startFloor(10) → menu fora da tela: sim
    requestAnimationFrame ... roda, ~3 fps (SwiftShader)
    contexto WebGL .......... vivo, não perdido
    __playerPos() ........... [0, 0, 8] antes e depois de __f10teleport
    npc.perception.player ... null

Uma exceção dentro de um `useFrame` derruba o laço inteiro do
react-three-fiber, e esta caixa não alcança a internet — as texturas do jogo
vêm de `raw.githubusercontent.com`. Então a vontade fica em `decisões: 0`, e
dizer qualquer coisa sobre o comportamento autônomo a partir daqui seria
invenção. O que a bancada mede é o caminho da CONVERSA, que não depende de
quadro nenhum.

### Dois defeitos da própria bancada, para não se repetirem

  · **HMR mata a volta.** Editar QUALQUER arquivo da raiz enquanto a bancada
    corre faz o Vite mandar um recarregamento, e a volta morre com
    `Execution context was destroyed`. Suba com `DISABLE_HMR=true npm run dev`.

  · **Download interrompido virava cache bom.** O `curl` escrevia direto no
    nome definitivo e o teste de cache é `existsSync`; matar a bancada no meio
    deixava um arquivo parcial que todas as voltas seguintes serviam como
    completo. O sintoma foi o jogo reclamando, com razão, em duas voltas
    seguidas: `a vontade tem 32 MB e deveria ter 1246 MB`. Hoje o `curl`
    escreve em `.parcial` e o `rename` é o commit.

---

## O granite perdeu o cache de prefixo — e isso custa 6x o turno

### O que apareceu

No Andar 10 real, os contadores do próprio motor (`fala:fim` na caixa-preta):

    turno 1 ... 337 lidos · leitura 67,8 s
    turno 2 ... 459 lidos · leitura 89,1 s
    turno 3 ... 565 lidos · leitura 110,3 s

`reusados` (o `cache_n`) não apareceu em turno nenhum. O prompt inteiro é
relido toda vez, e a leitura come 110 s dos 124 s do turno.

Isso contradiz o que está escrito no `formatTimings`, medido no aparelho do dono
do jogo: **"321 lidos · 273 reaproveitados"**. Só que aquilo foi com o
SmolLM3-3B, e a fala hoje é o granite.

### Antes de acusar o modelo: os fios

O dono do jogo olhou "leitura 69 s" e disse que no aparelho dele rodava na
metade. Ele estava certo, e a causa não era o motor — as URLs pedidas foram
`/wllama-relaxed/index.js` e `/wllama-relaxed/wasm/wllama.wasm`, o binário
implantado. Era o número de fios. `cpuThreadCount()` pega METADE dos núcleos;
esta caixa tem 4 → 2 fios, o celular dele tem 8 → 4. Medido no granite, config
do jogo, só variando os fios (`bancada-navegador/fios-e-config.mjs`):

    1 fio ..... leitura 138,7 s ·  2,89 tok/s
    2 fios .... leitura  69,8 s ·  5,74 tok/s   ← esta caixa
    4 fios .... leitura  39,2 s · 10,23 tok/s   ← o celular dele

Toda a tabela abaixo usa a config DO JOGO (`n_ctx` 1536, `n_batch` 512, KV
`q8_0`) e 4 fios.

### A tabela que decide (`bancada-navegador/cache-de-prefixo.mjs`)

Mesmo motor, mesmo prefixo de ~400 tokens, cauda mudando a cada turno — a forma
do jogo:

    modelo                      arquitetura   turno 1   turnos 2+   reaproveitados
    granite-4.0-h-tiny 7B-A1B   híbrido        40,9 s    42,3 s        0 de 401
    SmolLM3-3B                  denso          71,6 s     6,8 s      423 de 439
    LFM2.5-1.2B                 híbrido        18,0 s    19,0 s        0 de 402
    Qwen3-0.6B                  denso           9,3 s     2,1 s      398 de 414

**Na conversa em andamento, o granite é 6,2x mais lento por turno que o modelo
que ele substituiu.** Ele ganha só o PRIMEIRO turno (40,9 contra 71,6), porque é
MoE com ~1B ativo. Do segundo em diante perde feio, e o segundo em diante é a
conversa.

### Por que, e por que não é tamanho nem quantização

O reaproveitamento de prefixo precisa de um cache que se possa TRUNCAR, e o
estado recorrente de um SSM é sequencial — não dá para voltar a um ponto do
meio. O `llama_memory_seq_rm` falha para modelo recorrente e o caminho cai em
reprocessar tudo.

A terceira coluna existe justamente para matar as outras explicações. O granite
e o Qwen diferem em tudo (2,59 GB contra 0,64, Q2_K contra Q8_0, dois shards
contra um, MoE contra denso), então com duas colunas qualquer diferença serviria
de causa. O LFM2.5 desempata: arquivo único, Q8_0, pesos densos — igual ao Qwen
nisso tudo — e híbrido como o granite. Ele também reaproveita ZERO. O que separa
as colunas é a arquitetura, e nada mais.

### O que isso NÃO decide

A troca para o granite foi decisão do dono do jogo, e pelo português: o granite
fala nativo, o SmolLM3 pensava em inglês. Esta medição não desfaz essa razão —
ela põe o preço na mesa, que ninguém tinha medido: 42 s por turno contra 7 s.

A saída que atende os dois lados é um modelo DENSO que fale português nativo
(Qwen3-4B, Gemma 3 4B, Llama 3.2 3B são os candidatos óbvios). Denso mantém o
cache; nativo mantém o português. Isso ainda não foi medido.

---

## Qual modelo responde melhor — medido, e com o texto na mesa

Pergunta do dono do jogo depois da tabela de velocidade. A bancada é
`qualidade-da-fala.mjs`: prompt real (`buildFloor10SystemPrompt`), amostragem
real (`CHAT_COMPLETION_CONFIG`), motor da casa, 4 fios, e a régua é a DO JOGO —
`floor10ReplyIssue` e `frasesForaDoTom`, os mesmos detectores que decidem em
partida se a fala vai para a tela.

### A tabela

Quatro perguntas, duas voltas, motor novo por volta:

    modelo                    defeito  tom  inglês  PT-PT  variedade  turno*  reaprov.
    Llama 3.2 3B  Q4_K_M         0/8   0/8    0/8    0/8      8/8     32,4s     1876
    SmolLM3-3B    Q4_K_M         0/8   1/8    0/8    0/8      7/8     36,2s     1960
    Qwen3-4B      Q4_K_M         0/8   1/8    0/8    0/8      7/8     42,4s     1756
    granite-4.0-h-tiny Q2_K      0/8   0/8    0/8    0/8      8/8     47,9s       10
    Gemma 3 4B it Q4_K_M         0/8   0/8    0/8    0/8      8/8     60,6s        0

    * turno em CONVERSA — sem o primeiro de cada volta, que é frio para todos.
      A primeira versão desta tabela usava a média de todos e penalizava
      justamente quem reaproveita cache.

### A régua automática empata. O texto não.

Todos tiram 0/8 em defeito. É no texto que se separam, e por isso a bancada
imprime as falas inteiras — **o Gemma 3 4B é o melhor, com folga**:

    "Nilo Azevedo, sou hóspede preso no 10º andar deste lugar. E você, que
     figura é a sua, que insiste em me perguntar?"
    "Não faço a mínima ideia de quem manda. Só sei que não me interessa."
    "Querer é o primeiro passo, suponho. Mas sair daqui é uma questão que me
     cabe, e não de ninguém mais."

Ele devolve pergunta, tem humor seco, recusa o papel de ajudante e não inventa
fato nenhum — que é a persona escrita, palavra por palavra. Os outros:

  · **Llama 3.2 3B** — inventa ("pode ser um corredor, uma sala, um armário";
    o cânone diz que não há corredor) e soa animado demais ("Claro, quem não
    quer?"), não o Nilo seco.
  · **granite (o de hoje)** — fluente, mas inventa ("atrás da parede é apenas um
    elevador inoperante, esperando ser reparado") e se põe DENTRO do elevador
    ("quero sair deste elevador"), contra o cânone.
  · **SmolLM3** — fiel ao cânone e sem personalidade; repete abertura idêntica e
    afirmou saber quem manda no hotel ("o proprietário e o Arquivista"), que ele
    não sabe.
  · **Qwen3-4B** — ecoa a pergunta de volta nas duas voltas ("Oi, quem é você?
    Eu sou Nilo…") e inventa "aparelho de som".

Nenhum dos cinco respondeu em inglês com o prompt real. Isso enfraquece a razão
declarada da troca para o granite — mas não a anula: o teste é de 8 falas por
modelo, e o vazamento de inglês do SmolLM3 foi observado em jogo, não aqui.

### O impasse, e a tentativa de resolvê-lo

O melhor em qualidade é o mais lento por turno, e pela mesma causa da seção
anterior: o Gemma 3 alterna camadas com JANELA DESLIZANTE e reaproveitou **zero**
tokens de prefixo.

`swa_full` — a opção do llama.cpp que guarda o KV inteiro em vez de só a janela —
existe no binário implantado e FUNCIONA para isso:

    swa_full OFF · n_ctx 1536 ... turno 60,7s ·   0 reaproveitados
    swa_full ON  · n_ctx 1536 ... turno 29,2s · 788 reaproveitados
    swa_full ON  · n_ctx 3072 ... turno 28,6s · 788 reaproveitados

2,1x mais rápido. **E não serve**, porque quebra a geração — contados os tokens
que ele chegou a escrever, por turno:

    swa_full OFF ... 32, 23, 15, 15 tokens   → falas completas
    swa_full ON  ... 31, 21, 16,  7 tokens   → "Quero." / "…de quem manda…"
    swa_full ON (n_ctx 3072) ... 27, 25, 11, 3 → "Claro que…"

Dobrar o `n_ctx` não conserta e chega a piorar, então **não é falta de
contexto**: com o prefixo restaurado o modelo simplesmente para de gerar cedo. É
troca de qualidade por velocidade, não ganho de graça, e nesta build não dá para
usar.

### O que fica decidido e o que não

Decidido: **Gemma 3 4B responde melhor**, e o preço é 60,6s por turno contra
47,9s do granite de hoje (+27%) nesta caixa, com 4 fios.

Não decidido, e é escolha do dono do jogo: se esses 27% valem. O meio-termo
medido é o **Llama 3.2 3B** — 32,4s por turno, 1,5x MAIS RÁPIDO que o granite de
hoje, com a régua limpa e uma voz razoável, ainda que inventiva.

Ressalva de tamanho de amostra: são 8 falas por modelo. Serve para separar
"ecoa a pergunta" de "não ecoa"; não serve para ranquear dois modelos parecidos.

---

## Os 13 segundos do celular, reproduzidos — e o que decide o turno

O dono do jogo: *"no meu celular rodava o SmolLM3, e ele às vezes respondia em
13 segundos"*, contra os 36,2 s de média que a bancada de qualidade mediu. Ele
suspeitou do motor de novo. O motor estava certo (a bancada carrega
`/wllama-relaxed` cravado, e só existem dois diretórios em `public/`), e os dois
números também estavam.

`conversa-que-nao-salta.mjs`, SmolLM3, motor da casa, config do jogo, 4 fios:

    SALTANDO de assunto (identidade → parede → hotel → sair)
      Oi, quem é você?                  lidos 375 · reaprov   0 · TURNO 45,7s
      O que tem atrás daquela parede?   lidos 212 · reaprov 310 · TURNO 28,9s
      Quem manda nesse hotel?           lidos 233 · reaprov 335 · TURNO 33,7s
      Você quer sair daqui?             lidos 395 · reaprov 335 · TURNO 45,8s
      → 36,1 s por turno · 280 tokens relidos em média

    NO MESMO ASSUNTO (o passado dele, quatro perguntas encadeadas)
      Oi, quem é você?                  lidos 375 · reaprov   0 · TURNO 43,6s
      Você era técnico de quê?          lidos  69 · reaprov 310 · TURNO 12,8s  ←
      E como foi o último dia?          lidos  24 · reaprov 409 · TURNO  6,5s  ←
      Você se lembra da hora?           lidos 338 · reaprov 310 · TURNO 40,2s
      → 19,8 s por turno · 144 tokens relidos em média

### O que decide o turno não é o modelo — é se o FATO trocou

`buildFloor10SystemPrompt` monta `persona · resumo · FATO · percepção · vontade ·
guardas · já dito`, e o curador escolhe o fato POR PERGUNTA. Os números medem o
tamanho de cada peça sem precisar do tokenizador:

    fato IGUAL ao do turno anterior ... reaproveita 409, relê  24 → 6,5 s
    fato DIFERENTE ................... reaproveita 310, relê 338 →  40 s

Persona + resumo = ~310 tokens; o bloco do fato = ~99. Quando o fato muda, ele
invalida os ~340 tokens que vêm depois dele, e são esses que custam 30 s.

E a ordem ATUAL está certa, ao contrário do que parece: mover o fato para o fim
pioraria o caso bom (reaproveitaria 310 em vez de 409) sem melhorar o ruim,
porque tudo que vem depois dele — percepção, vontade, guardas, já dito — muda
mais que ele, não menos.

### A alavanca que sobra, e ainda não foi medida

Trocar o fato menos vezes. Hoje o curador reescolhe do zero a cada fala; uma
HISTERESE — manter o fato do turno anterior a menos que o novo case bem melhor —
transformaria boa parte dos turnos de 40 s em turnos de 13 s, sem trocar de
modelo e sem tocar no motor.

Isso muda O QUE o modelo lê em cada fala, então não é ajuste de bancada: é
mudança de comportamento, e precisa da régua de qualidade em cima antes de
entrar.

---

## A histerese do fato do cânone: −34% no turno, e o cânone mais respeitado

Implementada depois da seção anterior, que mostrou que o preço de um turno é
decidido por uma coisa só — se o curador trocou o fato do cânone.

`fatoComHisterese` só troca quando vale, e a primeira regra é a que protege a
resposta: se o fato que está no prompt tem nota ZERO para a nova pergunta, ele
não fala do que foi perguntado e a troca acontece de qualquer jeito. Economizar
prefill entregando o assunto errado seria uma resposta pior, mais rápido. Fora
isso, só troca quando o candidato novo é 1,5× melhor.

`fatoDaConversa` não guarda o fato anterior em variável de módulo: recalcula o
encadeamento a partir do histórico. Determinístico, sem estado, e dois painéis
abertos não contaminam um ao outro.

### O resultado (SmolLM3, prompt real, motor da casa, 4 fios)

    conjunto                     sem histerese      com histerese
    saltando de assunto        36,1 s · 280 relê   23,9 s · 165 relê   −34%
    no mesmo assunto           19,8 s · 144 relê   18,7 s · 143 relê    −6%

O formato do ganho é o esperado, e é isso que dá confiança nele: no assunto
único quase nada muda, porque ali já não havia troca de fato para evitar. Todo o
ganho está onde estava o desperdício. Turno a turno, saltando de assunto:

    Quem manda nesse hotel?   antes: relê 233, reaprov 335 → 33,7 s
                              hoje:  relê  22, reaprov 516 →  6,7 s

E `Você se lembra da hora?` continua custando 36,7 s — de propósito: ali o fato
anterior tem nota 0, então a regra troca. É a proteção funcionando.

### A resposta não piorou; melhorou

Comparando as mesmas perguntas antes e depois, a mudança visível foi para
melhor. Sobre quem manda no hotel, o cânone diz que ele NÃO SABE:

    antes: "O proprietário e o Arquivista são as únicas entidades que têm
            controle, mas eles não são de minha conta."   ← afirma saber
    hoje:  "Não sei. Não tenho controle sobre o hotel, nem sobre o elevador."

Faz sentido: com a histerese ele fica com o fato que a conversa já estabeleceu
em vez de puxar um fato novo a cada pergunta, e menos fato novo é menos convite
a completar o que não está escrito.

### Um defeito meu no caminho, que a própria bancada pegou

A primeira versão de `fatoDaConversa` pontuava a pergunta PELADA, e o montador
do prompt sempre pontuou com as DUAS últimas falas do jogador mais a atual. O
sintoma foi o PRIMEIRO turno passar de 375 para 341 tokens lidos — e ele não
podia mudar, porque sem histórico a histerese não tem o que segurar.

Não era detalhe: "e o que mais?" não casa palavra-chave nenhuma sozinho, e o
curador perderia o assunto no primeiro seguimento curto — exatamente o caso que
a histerese existe para proteger. `consultaDoCurador` passou a ser a única forma
de montar essa consulta, com quatro testes travando.

Com o defeito, o ganho medido era 12%. Sem ele, 34%. A comparação estava suja
porque as duas rodadas diferiam em DUAS coisas.

### Ressalva de método, que ainda vale

A linha de base (36,1 s) foi medida antes de a fala voltar ao SmolLM3, quando
`systemTemplateFlags` estava vazio; hoje as flags `/system_override /no_think`
entram na frente da persona. São ~8 tokens em ~340, ou seja, 2,4%, e eles
tornam a rodada NOVA mais pesada, não mais leve. O ganho de 34% é real e, se
alguma coisa, está subestimado.
