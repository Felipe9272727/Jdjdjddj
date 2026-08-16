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
