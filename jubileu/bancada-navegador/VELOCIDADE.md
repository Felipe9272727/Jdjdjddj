# Onde a velocidade do Andar 10 pode vir — e onde não pode

Tudo aqui foi medido, não deduzido. As medidas de carga saíram de
`carga.html`, com o SmolLM3-3B Q4_K_M de verdade (1,92 GB) e a mesma
`CPU_LOAD_CONFIG` do jogo. As de fala saíram de `ngram.html`. A máquina não é um
celular — 4 vCPU, 16 GB — então o que vale aqui é a PROPORÇÃO entre as etapas,
não o número absoluto.

## Os 500 s não eram a carga

Quebrada em etapas, a carga do modelo de verdade:

```
    22ms  esm importado
 50069ms  cache pronto · 1,92 GB      ← baixando do servidor local; no celular,
                                        com o modelo já em cache, isto é instantâneo
 50125ms  wasm-boot
 50241ms  wasm-ready                  ← 116 ms compilando o runtime e acordando 4 threads
 50242ms  llama-start
 51509ms  load_tensors começa         ← 1,3 s abrindo o GGUF
 58349ms  llama_context construindo   ← 6,8 s LENDO 1,82 GB de tensores
 58530ms  kv_cache 57 MiB             ← 0,2 s
 58554ms  sched_reserve 23 ms
 61515ms  modelo carregado            ← ~3 s de aquecimento
```

E a fala, com a persona do jogo e três perguntas seguidas (a 1ª paga o prefill
frio): **1,53 → 2,15 → 2,18 tok/s**, respondendo no personagem
("Nilo Azevedo. E você?", "Nada. A porta está trancada.").

**Do cache pronto até o modelo na memória: 11,4 s.** Não 500. Os 402 s e os
1280 s dos prints eram o travamento do pool de pthreads, que não ia terminar
nunca — está consertado, com teste. Num celular estas mesmas etapas custam mais
(flash mais lenta, CPU mais lenta), mas a forma é esta: **quase tudo é ler o
GGUF**, e ler 1,82 GB tem um piso que nenhum truque de código remove.

Daí a conclusão que importa para o jogo: o caminho para não esperar não é
tornar a carga mais rápida, é **não pagá-la de novo**. Cada troca de cérebro que
descarrega a fala custa esses 11 s (mais, no celular) outra vez.

## O que já está ligado, e quanto vale

| técnica | estado | medido |
|---|---|---|
| n-grama (auto-especulação) | **padrão, com orçamento 1** | 1,43× quando a resposta ecoa o contexto, −10% no pior caso; texto idêntico. Ver "orçamento de rascunho" abaixo |
| KV em q8_0 | ligado | +15% na fala, sem mudar o texto |
| flash attention | ligado (o llama.cpp resolve sozinho: `flash_attn = auto → enabled`) | — |
| `cache_prompt` | ligado | não relê a persona a cada mensagem — o maior ganho de todos em conversa longa |
| runtime guardado no Cache Storage | ligado | 2ª carga em diante: zero pedido HTTP dos 6,17 MB |

## O que ainda dá para tentar, em ordem de aposta

1. ~~**Fixar o número de threads MEDINDO no aparelho.**~~ **FEITO** — `cc17feac`
   fechou em METADE dos núcleos (4 no Snapdragon 7s Gen 2). Ver "Threads: pedir
   demais é 15× MAIS LENTO", abaixo.
2. **Não descarregar a fala entre os cérebros.** Continua de pé, e ficou MAIS
   forte do que quando escrevi isto: `90e504ae` mediu que descarregar devolve
   **0% da RAM** (o heap do WASM não encolhe). Se esse número estiver certo, as
   ~18 s de releitura por visita ao chat (`b622ec14`) estão sendo pagas em troca
   de nada. **A pergunta nunca foi fechada** — o próprio commit diz "não altero
   mais nada em cima disso até saber qual das três é", e nenhum commit posterior
   respondeu. É a medição mais barata e de maior retorno que sobrou.
3. **WebGPU em algumas camadas.** ~~Já existe no jogo (12 das 36)~~ — **falso
   desde `85a532f9` (30/jul): o padrão é ZERO camadas, atrás do botão do
   `?bancada`.** E "já cobrou caro uma vez" também está subestimado: foram
   QUATRO eras e três reprovações no aparelho real. Ver "O VEREDITO DA GPU",
   abaixo, antes de propor isto de novo.

E o que NÃO vale, para não gastar tarde à toa:

- **Quantização menor (IQ4_XS, ~1,7 GB).** Economiza 12% de leitura e cobra em
  conta: i-quants são mais caros de decodificar na CPU. No WASM, sem as
  instruções de ARM, a troca é ruim.
- **Q4_0 "para ARM".** O ganho do Q4_0 em celular vem do repack para
  `Q4_0_4_4`/`i8mm`, que é código ARM. Dentro do WASM ele não existe.

## O TETO DE 2 GiB — a descoberta que decide tudo aqui embaixo

**Nenhum GGUF acima de 2.147.483.648 bytes (2 GiB) carrega neste runtime.** Não
é "pesado demais para o celular": não carrega em máquina nenhuma, nem nesta com
16 GB de RAM. Medido, duas vezes:

```
granite-4.0-h-tiny Q4_K_M (4,25 GB, MoE)
  → tensor 'blk.19.ffn_down_exps.weight' data is not within the file bounds

SmolLM3-Q8_0 (3,27 GB, DENSO, o MESMO modelo que roda hoje)
  → tensor 'blk.21.ffn_up.weight' data is not within the file bounds
```

O segundo teste é o que fecha o caso: mesma arquitetura, mesmo modelo, só a
quantização muda — e ele falha igual. Não é MoE, é tamanho de arquivo.

`teto-do-gguf.mjs` lê o cabeçalho e mostra exatamente onde cada tensor começa:

```
$ node teto-do-gguf.mjs granite.gguf blk.19.ffn_down_exps.weight
   offset absoluto 2.082.156.512 · primeiro tensor depois de 2^31:
   blk.19.ffn_gate_inp.weight @ 2.153.045.984

$ node teto-do-gguf.mjs smollm3.gguf      # o que roda hoje
   nenhum tensor passa de 2^31
```

O tensor recusado é sempre o primeiro cuja DATA cruza 2^31 — o limite de um
`long` de 32 bits. A própria wllama documenta isso no HeapFS: *"Due to ftell()
being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes"*. Se dá
para levantar esse teto (esta build é Memory64, onde `long` deveria ter 64 bits)
é uma investigação separada, e não prometo que dê.

**O que isso significa para o jogo:** o SmolLM3-Q4_K_M tem 1,92 GB, ou seja está
a **89% de um teto rígido**. Não há espaço para modelo maior de tipo nenhum —
nem MoE, nem denso, nem o mesmo SmolLM3 em Q8 — enquanto o teto existir.

## MoE: a ideia está certa, o tamanho é impossível hoje

O raciocínio é o mesmo dos MoE de verdade: em vez de acordar o modelo inteiro
para cada token, acordar só a parte que interessa. E num celular isso ataca o
gargalo certo — gerar token é limitado por BANDA DE MEMÓRIA, porque cada token
relê os pesos ativos, e um MoE relê só os experts ativos.

O problema é que MoE troca **memória** por **conta**, e todo MoE que existe hoje
passa longe do teto:

| modelo | total | ativo/token | menor GGUF ~Q4 | carrega? |
|---|---|---|---|---|
| **SmolLM3-3B** (hoje) | 3B | 3B | **1,92 GB** | **sim** |
| granite-4.0-h-tiny | 7B | ~1B | 3,79 GB (IQ4_XS) | não |
| LFM2-8B-A1B | 8,3B | ~1,5B | 4,73 GB (Q4_0) | não |
| Qwen3-30B-A3B | 30B | 3B | 18,56 GB | não |

E mesmo que carregasse: na velocidade de rede do print do Felipe (149 KB/s),
4,25 GB são quase 8 horas de download.

### E converter o próprio SmolLM3-3B em MoE?

Não dá — e o motivo não é ferramenta, é matemática. A técnica existe
(*sparse upcycling*): copia-se o FFN de cada camada em N experts e acrescenta-se
um roteador. Só que o roteador nasce **aleatório**, e sem treino acontece uma de
duas coisas:

- roteando para todos os experts, o resultado é IDÊNTICO ao denso — e mais
  lento, porque agora há N cópias do mesmo FFN para ler;
- roteando para poucos, o modelo quebra, porque nada ensinou o roteador a
  escolher.

A velocidade do MoE vem dos experts serem DIFERENTES entre si, e essa diferença
só aparece depois de treinar com bilhões de tokens. Aqui não há GPU, não há
dado e não há tempo — e o arquivo resultante passaria dos 2 GiB de qualquer
forma.

Existe uma variante sem treino pesado (*MoEfication*, que agrupa os neurônios do
FFN em blocos e treina só um roteador pequeno), mas ela depende de o modelo ter
ativação esparsa, o que vale para ReLU e **não** para o SwiGLU do SmolLM3. Fora
que o GGUF teria de virar uma arquitetura que o llama.cpp reconheça.

**O MoE que o jogo já tem é outro, e esse funciona:** fala, vontade, motor e
memória são especialistas, e só um fica ativo por vez. É a mesma ideia, aplicada
na camada onde ela sai de graça.

## O orçamento de rascunho: o número que travou o celular

Ligar o n-grama por padrão com a configuração de fábrica foi um erro meu, e a
bancada de velocidade não pegou porque eu media **tok/s e não CPU queimado**.

O `ngram-cache` do llama.cpp traz `uint16_t n_draft = 8; // TODO get from
config?` — 8 propostas por passo, fixas, ignorando qualquer parâmetro. Numa
pergunta comum ele acerta **zero** das 8, e o modelo verifica 9 posições para
aproveitar 1. Medido com o SmolLM3-3B de verdade, 4 threads, mesma pergunta,
greedy, CPU somado de todos os processos do Chromium:

| configuração | fala | CPU | rascunho aceito |
|---|---|---|---|
| **sem n-grama** | **2,86 tok/s** | **47,5 s** | — |
| n_max = 1 | 2,57 tok/s (−10%) | 49,2 s | 0/1 |
| n_max = 2 | 2,48 tok/s (−13%) | 50,4 s | 0/2 |
| n_max = 3 | 2,27 tok/s (−21%) | 52,3 s | 0/3 |
| n_draft = 8 (o padrão que eu liguei) | 1,77 tok/s (−38%) | 58,3 s (+22%) | 0/8 |

Num PC isso é uma barra mais lenta. Num celular é outra coisa: especular troca
um trabalho limitado por MEMÓRIA (núcleos esperando o dado chegar) por um
limitado por CONTA (núcleos a 100%), e o que sobrava para a tela desenhar
acabou. Foi o "o celular inteiro trava" — com 8 núcleos ocupados verificando
tokens que iam ser jogados fora.

O binário foi recompilado com o `n_draft` obedecendo a `spec_draft_n_max`, e o
jogo pede **1**. Por que 1 e não zero: com uma proposta o passo continua
limitado por banda (verificar 2 tokens relê os mesmos pesos que verificar 1), o
prejuízo no pior caso cai para 10%, e o ganho aparece sempre que a resposta
repete algo do contexto — medido 68 de 81 aceitos num texto que ecoa, 1,43× de
fala. O empate fica em 10% de aceitação.

**A lição, para a próxima:** medir tok/s numa caixa de 16 GB não é medir o custo
num celular. `custo-cpu.mjs` existe por isso — ele soma o tempo de CPU de todos
os processos do navegador entre o início e o fim de cada fala.

## A maior alavanca que sobrou: WebGPU (e eu tinha desligado ela)

O llama.cpp ganhou um backend WebGPU oficial em 2026 (`ggml-webgpu`, trabalho do
Reese Levine e equipe na UCSC), e a wllama passou a expor. Os números do paper
"Llamas on the Web" (arXiv 2605.20706), medidos em GPUs reais:

- GPU de celular / baixo consumo: **4–17 tok/s** de decode
- Apple M4 Pro: ~52 tok/s (q4_k_m)
- desktop de ponta: 100+ tok/s
- e o ponto fraco é o PREFILL (21–51% pior que os concorrentes) — que no jogo
  quase não importa, porque `cache_prompt` reaproveita a persona.

Comparado com os **2,2–2,9 tok/s** que a CPU do WASM entrega aqui, é a única
técnica na mesa que muda a ordem de grandeza. E ela não mexe num único peso: é o
MESMO modelo, o MESMO GGUF, a MESMA saída — só quem faz a conta muda.

Eu tinha compilado nosso binário com `-DGGML_WEBGPU=OFF`. Como o n-grama virou
padrão, isso fechou a porta da GPU para o jogo inteiro sem ninguém decidir isso.
Recompilado com `GGML_WEBGPU=ON`:

- binário: 5,85 MB → 7,65 MB (pago uma vez por origem, fica no Cache Storage)
- verificado no Chromium sem GPU: carrega e fala igual, **2,67 / 2,89 / 2,69
  tok/s** contra 1,53 / 2,15 / 2,18 do binário anterior, com o texto idêntico
- `n_gpu_layers` continua em 0 por padrão: o gerente do jogo é quem decide, e
  ele já mede por aparelho. Ter o backend compilado só devolve a OPÇÃO.

**Não testei com GPU de verdade** — este contêiner não tem uma. Quem responde é
o aparelho: `?bancada` liga o gerente de GPU, e o teto continua sendo o que já
derrubou a fala duas vezes no celular do Felipe. ~~Comece por 4 camadas de 36,
não por 12.~~ **Isto é impossível:** o Android limita o binding a 128 MB e cada
camada pesa ~53 MB, então `layersThatFit` devolve **2**, e os botões do
`?bancada` só oferecem 0, 1 e 2. Leia a seção seguinte antes de ligar qualquer
coisa.

## O VEREDITO DA GPU — quatro eras, três reprovações no aparelho real

Esta seção existe porque a GPU foi proposta de novo em agosto, por mim, depois
de já ter sido reprovada três vezes. O histórico completo, para não repetir:

| era | o que foi | como morreu |
|---|---|---|
| 1 · 23/jul | Qwen2.5-7B no **WebLLM/WebGPU**, GPU obrigatória | `device-lost` / `ModelNotLoadedError` no celular do Felipe, mesmo com auto-cura. `08358c6e` migrou tudo para CPU/WASM |
| 2 · 26–28/jul | offload fixo de **12 das 36 camadas** (`51197277`) | `f6a523dc`: "com offload o celular inteiro engasga; pela CPU o jogo roda liso" |
| 3 · 30/jul | o "gerente de GPU", 3 camadas (`d9fc9af4`) | ligada e desligada **no mesmo dia, em 53 minutos** — `(ABORT)`, depois `loadModel() is not yet called`, depois saída corrompida |
| 4 · 4/ago | recompilar o binário com `GGML_WEBGPU=ON` (`cd88097f`) | devolveu a OPÇÃO, nunca ligou nada; e o binário saiu do padrão em `01a43e07` |

**A causa do travamento não é memória, e isso muda a conclusão.** O `d9fc9af4`
diagnosticou: *"os kernels da LLM SATURAM A FILA DE SUBMISSÃO da GPU e o render
perde o prazo do quadro — por isso travava, e não por memória, que era o que eu
supunha."* Se o gargalo é a fila de submissão, **encolher o número de camadas não
resolve** — 1 camada disputa a mesma fila que o Three.js precisa para desenhar.

**E a GPU nunca foi mais rápida, nem quando funcionou.** Medido no aparelho real
(`329d78a0`): CPU×8 fechou a resposta em **242,5 s**; WebGPU×2 em **257,1 s**.
O que acelerou naquela sessão foi o `cache_prompt`, não a GPU.

**O pior modo de falha foi silencioso:** com 2 camadas o modelo devolveu lixo
binário (`fdf)-,2ehir4Hccb, frank= geilBBA;*'A&#55E:`) — assinatura de kernel
numérico errado — e o gerente tinha carimbado aquele degrau como "estável",
porque media velocidade e nunca sanidade. Daí o `looksCorrupted`.

**A única pergunta que ficou aberta:** `dde144b0` montou o botão de **1 camada**
para separar "estourou o buffer" de "o backend não roda aqui". Esse teste
**nunca foi executado no aparelho do Felipe** — não aparece em commit nenhum.
É o que falta para fechar o assunto com resposta em vez de desconfiança.

## E o Colibri?

Vale registrar porque a resposta é contraintuitiva: **Colibri não é para isto.**

É um engine em C puro (um arquivo, ~2.400 linhas) que roda o GLM-5.2, de 744
BILHÕES de parâmetros, em ~25 GB de RAM. O truque é tratar SSD, RAM e VRAM como
uma hierarquia só e ler do NVMe apenas os experts que o MoE ativa naquele token
(~40B ativos, dos quais só ~11 GB mudam entre um token e outro).

O que ele compra é TAMANHO, e o que ele paga é VELOCIDADE: **0,05 a 1 token/s**,
10 a 100× mais lento que uma H100. Para um modelo de 3B que já cabe inteiro na
memória, a técnica não tem o que otimizar — não há nada para streamar. E nada
dela atravessa para um navegador: depende de leitura direta de NVMe, que a
sandbox do browser não dá.

A ideia boa dele — "só o que muda entre tokens precisa se mover" — é a mesma dos
MoE, e esbarra no mesmo teto de 2 GiB documentado acima.

## ACHADO: existe um MoE de 3B, ele CABE, e é 2,7× mais rápido

`ibm-granite/granite-3.1-3b-a800m-instruct` — 3B no total, **800M ativos por
token**, arquitetura `granitemoe`. O Q4_K_M tem 2.016.888.384 bytes: passa,
raspando, abaixo do teto de 2.147.483.648. Nenhum tensor cruza 2^31.

Medido na mesma bancada, mesma máquina, mesmas três perguntas com a persona do
Nilo, greedy:

| | SmolLM3-3B (denso) | granite-3.1-3b-a800m (MoE) |
|---|---|---|
| arquivo | 1,92 GB | 2,02 GB |
| ativos por token | 3B | **800M** |
| cache → pronto | 11,4 s | **8,5 s** |
| fala 1 / 2 / 3 | 2,67 / 2,89 / 2,69 tok/s | **6,59 / 7,63 / 7,67 tok/s** |

**~2,7× na fala**, exatamente o que a conta de banda de memória previa. A teoria
do Felipe estava certa desde o começo; só faltava um MoE pequeno o bastante.

### Mas a qualidade cobra, e cobra em português

As MESMAS perguntas, lado a lado:

```
"Oi, qual o teu nome?"
  SmolLM3  → Nilo Azevedo. E você?
  granite  → Eu sou Nilo Azevedo, um hóspede desconhecido do 10º andar.

"O que tem atrás da porta no fim do corredor?"
  SmolLM3  → Nada. A porta está trancada.
  granite  → Não posso ver além da minha porta, sou um hóspede desconhecido
             desse lugar.

"Por que você nunca sai daqui?"
  SmolLM3  → Porque aqui é o lugar onde encontrei a paz que nunca encontrei em
             lugar algum mais.
  granite  → Como Nilo Azevedo, sou um hóspede fiável, não tenho motivos para
             sair. Esta estrutura é confortável e familiar, e minha vida está
             em ordem.
```

O SmolLM3 está no personagem: seco, curto, cansado — que é o que a persona pede.
O granite é prolixo, repete "hóspede desconhecido", escreve em português de
Portugal ("fiável") e QUEBRA o personagem em "Como Nilo Azevedo, sou...". Mais
rápido e menos Nilo.

**Não é uma troca óbvia — é uma escolha.** 2,7× de velocidade por uma atuação
pior em PT-BR. Quem decide é você, e dá para experimentar sem commit nenhum:

```js
window.__npcModelUrl = 'https://huggingface.co/bartowski/granite-3.1-3b-a800m-instruct-GGUF/resolve/main/granite-3.1-3b-a800m-instruct-Q4_K_M.gguf';
```

### O próximo teste, se a velocidade tentar

Existe `PJMixers-Dev/Granite-3.1-Earthen-v0.3-3B-A800M` — o MESMO MoE, mas
afinado em visual novels, legendas e literatura. Q4_K_M tem os mesmos 2,02 GB e
cabe igual. É a hipótese óbvia para recuperar a atuação sem perder os 800M
ativos. Não testei ainda.

## PISTA FORTE, AINDA NÃO FECHADA: os kernels SIMD do WASM nunca foram compilados

O CMake do ggml escolhe os kernels de produto escalar quantizado assim:

```cmake
elseif (CMAKE_SYSTEM_PROCESSOR MATCHES "wasm")
    message(STATUS "Wasm detected")
    list (APPEND GGML_CPU_SOURCES ggml-cpu/arch/wasm/quants.c)
else()
    message(WARNING "Unknown CPU architecture. Falling back to generic implementations.")
    list(APPEND ARCH_FLAGS -DGGML_CPU_GENERIC)
endif()
```

O toolchain do emscripten NÃO define `CMAKE_SYSTEM_PROCESSOR` como "wasm", então
todos os nossos builds — e provavelmente o wllama oficial também — caíram no
`else()`. A prova está no log do nosso configure:

```
-- Adding CPU backend variant ggml-cpu: -DGGML_CPU_GENERIC
```

`arch/wasm/quants.c` tem **100 usos de intrínsecos wasm SIMD** escritos à mão
(`wasm_i8x16_*`, `wasm_v128_*`) para exatamente a operação que domina o decode:
`ggml_vec_dot_q4_K_q8_K`. Nada disso entrou no binário. O v128 que aparece no
wasm é autovetorização do LLVM, não os kernels.

Trocando a condição por `MATCHES "wasm" OR EMSCRIPTEN` o configure passa a
imprimir "Wasm detected"... e o link quebra com símbolo duplicado entre
`ggml-cpu/quants.c` e `arch/wasm/quants.c` (os dois viram `quants.c.o` no mesmo
arquivo `.a`). **Não resolvi esse conflito** — fica aqui como a pista mais
promissora que sobrou, porque se os kernels entrarem é o mesmo cálculo com
instruções melhores: velocidade pura, zero de qualidade perdida.

Quem quiser continuar: o caminho é fazer o `quants.c` genérico não emitir os
mesmos símbolos (ele deveria estar todo atrás de `#if defined(GGML_CPU_GENERIC)`)
ou renomear o objeto do arch. É uma correção que vale para o wllama upstream
inteiro, não só para nós.

**Nota de quem parou aqui:** conferi a causa do símbolo duplicado.
`ggml-cpu/quants.c` (o genérico) NÃO tem uma única ocorrência de
`GGML_CPU_GENERIC` — ele define 24 funções (`ggml_vec_dot_*`, `quantize_*`)
sempre, sem guarda. Ou seja, o upstream conta com esse arquivo não ser compilado
quando existe um arch específico, e nesta versão ele entra em
`GGML_CPU_SOURCES` de qualquer jeito. Então o conserto NÃO é mexer no arch: é
tirar o genérico da lista quando o ramo do arch for escolhido (ou envolver o
conteúdo dele em `#if defined(GGML_CPU_GENERIC)`, que é o que o nome sugere que
sempre foi a intenção).

### FECHADO: os kernels entraram, e são +51%

A causa do símbolo duplicado era UM nome. `arch-fallback.h`, no bloco
`__wasm__`, mapeava `ggml_vec_dot_q4_1_q8_1_generic → ggml_vec_dot_q4_1_q8_1`,
ou seja, declarava que o wasm NÃO implementa essa função — só que
`arch/wasm/quants.c` implementa. Os dois arquivos definiam o mesmo símbolo.
A interseção entre "o que o arch define" e "o que o fallback remapeia" tem
exatamente um elemento; removida a linha, linka.

Duas linhas ao todo (`OR EMSCRIPTEN` no CMake + a linha errada do fallback), e
medido no mesmo Chromium, mesmo modelo, mesmas perguntas:

| | genérico (como estava) | SIMD de wasm |
|---|---|---|
| fala 1 | 2,67 tok/s | **4,45 tok/s** |
| fala 2 | 2,89 tok/s | **3,81 tok/s** |
| fala 3 | 2,69 tok/s | **4,21 tok/s** |
| média | 2,75 | **4,16 (+51%)** |

**Uma ressalva honesta sobre o texto:** as respostas continuam no personagem e
com o mesmo sentido ("Nada. A porta está trancada há anos." em vez de "Nada. A
porta está trancada."), mas NÃO são idênticas palavra por palavra como no caso
do n-grama. Isso é esperado e não é perda de qualidade: os kernels SIMD somam em
ordem diferente do C genérico, o ponto flutuante não é associativo, e num empate
apertado o greedy escolhe outro token. É a mesma razão pela qual o mesmo modelo
dá saídas ligeiramente diferentes em CPU e GPU.

## Threads: pedir demais é 15× MAIS LENTO

Nesta caixa de 4 núcleos, mesmo modelo, mesmas perguntas, só mudando `n_threads`:

| threads | fala 1 | fala 2 | fala 3 |
|---|---|---|---|
| **8** (mais threads que núcleo) | **0,23** | **0,18** | **0,18 tok/s** |
| **4** (um por núcleo) | 2,54 | 3,86 | 1,10 tok/s |

**Quinze vezes mais lento.** O motivo é o ggml esperar GIRANDO nas barreiras
entre os nós do grafo: thread ociosa de llama.cpp não dorme, ela ocupa núcleo.
Com mais threads que núcleos elas se atropelam e o tempo vira espera pura.

No celular do Felipe (Snapdragon 7s Gen 2, 8 núcleos) 8 threads NÃO é
sobrecarga aritmética — mas é o mesmo mecanismo com outro nome:

- as barreiras esperam sempre a thread mais lenta, e 4 dos 8 núcleos são A55,
  bem mais devagar que as A78;
- com 8 de 8 ocupados girando, não sobra núcleo para o render do Three.js, para
  o compositor do navegador nem para o sistema. O que trava não é a fala — é o
  aparelho.

Por isso `cpuThreadCount` passou a usar METADE dos núcleos (no 7s Gen 2: 4, que
é exatamente o grupo rápido). O override manual continua valendo para quem
quiser provar outro número no próprio aparelho.

## FECHADO: o binário compat é inocente — carga, memória E geração

Eu levantei o compat como "candidato número um" para explicar por que a travada
que ele relata nunca reproduz aqui: o aparelho dele poderia estar rodando o
outro binário do wllama (wasm32, sem JSPI) enquanto a bancada roda o padrão.

Medido dos dois lados, mesmo modelo (SmolLM3-3B Q4_K_M), mesmas opções do jogo,
com `delete WebAssembly.Suspending` forçando o caminho sem JSPI e o relatório
carregando a PROVA de que o desligamento pegou (`jspiDisponivel: false`):

```
                  carga        geração      tok/s    prefill
padrão (JSPI)     67.470 ms    71.620 ms    3,58     4,44
compat (wasm32)   65.093 ms    70.472 ms    3,67     4,51

alocação: 1819,10 MiB de modelo · 57,38 KV · 78,09 compute — IDÊNTICA
```

Iguais dentro do ruído nas três dimensões. **A hipótese está morta**, e o
resultado negativo vale: significa que o que se mede aqui vale para o aparelho
dele independentemente da versão do Chrome. As únicas diferenças reais do compat
são 14,19 MB baixados em vez de 7,66 MB, e wasm32 em vez de memory64 — é daí que
vem o teto de 2 GiB por GGUF.

### Duas armadilhas de método que este teste custou

1. **`--js-flags=--experimental-wasm-jspi` não desliga nada.** Nas versões atuais
   o JSPI já vem ligado de fábrica, então tirar a flag é inócuo. A primeira
   execução do experimento comparou o caminho padrão com ele mesmo e deu "sem
   diferença" — conclusão certa por acaso, método errado. O jeito honesto é
   tirar o símbolo que `isSupportJSPI()` testa.
2. **A carga do MESMO modelo varia 28% entre execuções idênticas** (74,3 s vs
   58,0 s no mesmo caminho). Nenhuma conclusão sobre tempo de carga sobrevive a
   uma execução só.

## AirLLM: pesquisado, e não é portável para cá

Ele mantém UMA camada na GPU por vez, lendo o resto do disco a cada passo — é
assim que roda um 70B em 4 GB de VRAM. O princípio é o mesmo do Colibri, e é o
mesmo do roteamento deste andar. O que não dá para trazer:

  - é Python + PyTorch + CUDA; não há caminho para browser nem WASM;
  - custa 5-30x em velocidade (0,5-2 tok/s), porque cada passo relê o modelo;
  - **WASM não tem mmap**: a memória do módulo é um ArrayBuffer linear. Streaming
    por camada viraria reler o GGUF inteiro do OPFS a cada token;
  - e o problema deste jogo nunca foi "o modelo não cabe" — o 1,2B cabe folgado.
    Era QUATRO cérebros de pé ao mesmo tempo, que é problema de roteamento.

A granularidade que funciona no browser é a de CÉREBRO, não a de camada, e é a
que o `floor10Roteamento` implementa: só quem vai trabalhar agora fica na RAM.

## A ESCADA DO LFM2.5: onde o tamanho compra julgamento, e onde para de comprar

Três tamanhos da MESMA família, mesmas 5 situações, mesmo prompt do jogo:

```
                  arquivo   assina 1ª   tok/s   ms/rodada   RSS previsto (2x)
LFM2.5-350M Q8     379 MB      5/5       17,6     12.965        0,76 GB
LFM2.5-1.2B Q8    1,25 GB      5/5        5,9     43.957        2,49 GB
LFM2.5-2.6B Q4    1,67 GB      0/5        3,65   160.039        3,34 GB
```

### O 350M separou duas coisas que eu tratava como uma

Ele assina 5/5 — formato perfeito — e escolhe `observe-player` em 4 das 5:

```
jogador sumiu               → observe-player   (observar o quê?)
curioso, promessa feita     → observe-player   (devia inspecionar o elevador)
jogador colado, incomodado  → observe-player   (irritado, colado, e ele olha)
```

Mesmo colapso do granite-a400m e do Huihui-MoE. **Assinar o formato não é
escolher bem**: a instrução ele obedece, a situação ele não entende. É por isso
que "5/5 de assinatura" nunca pode ser lido sozinho — precisa vir com as
escolhas ao lado, ou vira um número que aprova um modelo cego.

O 1.2B, nas mesmas cinco, acerta as três que discriminam: `inspect-elevator`
com promessa pendente, `make-space` com o jogador colado, `approach-player`
quando ele some.

### O 2.6B: o teste está CONFUNDIDO, e ele está fora por outro motivo

0/5 e 160 s por rodada parece decidir, mas **não decide**: ele foi medido em
Q4_K_M contra dois Q8. E este projeto já tem a medição de que Q4 destrói
exatamente esta capacidade — o Llama 1B assinava 5 de 15 rodadas em Q4 e 14 de
15 em Q8 (ver `floor10Brains.test.ts`). Atribuir o 0/5 ao TAMANHO seria ler o
efeito da quantização como efeito de parâmetros.

O que decide é o teto do runtime, e esse é objetivo:

```
2.6B Q8_0    2,87 GB   > 2 GiB — não carrega
2.6B Q6_K    2,22 GB   > 2 GiB — não carrega
2.6B Q5_K_M  1,94 GB   cabe, e custaria ~3,88 GB de RSS
```

Ou seja: no único formato que cabe, ele sozinho pesa mais que a fala e a memória
JUNTAS. Está fora por orçamento de memória, não por burrice — e a diferença
importa, porque se um dia o teto de 2 GiB cair, este candidato volta.

### Conclusão da escada

O 1,2B é o ponto ótimo, e agora a curva tem forma: **abaixo dele o modelo
colapsa numa opção só; acima, ou não cabe, ou custa memória que este jogo não
tem.** Não é preferência — é o intervalo onde há julgamento e ele cabe.

## O A/B DO ROTEAMENTO, MEDIDO — e a regra do "2x" estava inflada

`ROTEAMENTO=1 CENARIO=sem|com` monta os dois cenários com os três modelos reais
e lê o RSS. A folga entre desligar e subir a fala é 5s, e não os 12s do
RESPIRO_APOS_DESCARGA_MS: no jogo quem separa as duas coisas é o jogador
digitando, então 12s mediria um caso melhor do que o que ele vive.

```
                       SEM o roteamento   COM o roteamento
aba vazia .............     1,35 GB           1,36 GB
vontade+motor de pé ...     3,59 GB           3,60 GB
PICO (fala de pé) .....     5,61 GB           3,36 GB    -2,25 GB (40%)
anônima no pico .......     4,97 GB           2,73 GB
```

O pico do cenário novo (3,36) fica ABAIXO do marco de vontade+motor de pé
(3,60): a fala não sobe por cima de ninguém, sobe no lugar deles. É a tabela de
`floor10Roteamento` fazendo exatamente o que promete, com número.

### A contaminação que inflou tudo: perfil efêmero guarda storage na RAM

A reta `RSS = 2,00 x (GB de arquivo) + 1,49 GB`, que sustentou as projeções de
9,59 GB e 9,91 GB, saiu de medições feitas com `newContext()` — perfil efêmero.
O Chrome trata perfil efêmero como anônimo, e **perfil anônimo guarda o
armazenamento do site na memória**. O .gguf que eu achava que estava no OPFS
(disco) estava na RAM, e entrou na conta como se fosse custo do runtime.

Com perfil persistente (`PERFIL=<dir>`), o mesmo trabalho:

```
vontade+motor .... +2,24 GB para 1,960 GB de arquivo = 1,14x
fala por cima .... +2,02 GB para 1,915 GB de arquivo = 1,05x
fala sozinha ..... +2,00 GB para 1,915 GB de arquivo = 1,04x
```

**Um cérebro de pé custa ~1,05x o próprio arquivo, não 2x.** O que muda:

  - o estado ANTES do conserto era ~6 GB, não ~10 GB. Eu exagerei o perigo;
  - "os cinco residentes dão 9,59 GB" (em floor10Precarga) é pelo mesmo motivo
    exagerado — a conta certa fica perto de 5,7 GB;
  - o GANHO do conserto (2,25 GB, 40%) é medido diretamente e não depende da
    reta, então ele sobrevive à correção;
  - e `?poupamemoria` perde parte da urgência que eu tinha atribuído a ele.

A lição de método é a mesma que já apareceu duas vezes hoje: o instrumento
precisa ser conferido contra o que ele afirma medir. "RSS somado da árvore de
processos" era verdade; "isto é o custo do modelo" não era.

### Repetido, porque uma execução só já me enganou três vezes hoje

```
                 1a          2a       variação
PICO sem ....  5,61 GB    5,58 GB      0,5%
PICO com ....  3,36 GB    3,38 GB      0,6%
economia ....  2,25 GB    2,20 GB
```

Reprodutível dentro de 1%. O ganho do roteamento não é ruído.

## REABRIR UM CÉREBRO: ~18 s, e o disco NÃO é mais lento que a RAM

A descoberta de que perfil efêmero guarda o armazenamento na RAM levantou uma
suspeita forte: as dez execuções que falharam em reproduzir a travada dele leram
o .gguf da MEMÓRIA, enquanto o aparelho dele lê da flash. Se reabrir custasse
muito mais em disco, esse seria o mecanismo que faltava.

Medido, duas reaberturas em cada perfil (`REABERTURA=1`):

```
                        1a carga    REABRE    REABRE 2    média
efêmero (OPFS na RAM)    78.032ms   21.514    18.425     19.970ms
persistente (em disco)   57.135ms   19.646    16.042     17.844ms
```

**O disco é igual ou ligeiramente mais rápido.** A hipótese está morta: ler o
modelo de volta não é o que diferencia a bancada do aparelho dele. Descarto mais
um suspeito, e sobra menos lugar para o defeito se esconder.

### O número que importa para o DESENHO: 18 s por reabertura

Descarregar custa 5-8 ms. Reabrir custa ~18 s. É assimétrico, e é o preço da
arquitetura de trocar cérebro conforme o jogador entra e sai do chat.

Onde esse preço é pago, no desenho atual:

```
fecha o chat   -> descarrega fala+memória, 12s, sobe a vontade   (fora do chat)
abre o chat    -> desliga vontade+motor                          (~0, é descarga)
envia          -> a fala REABRE                    ~18s  <- ele espera aqui
```

Ou seja: os 18 s já existiam ANTES do roteamento — quem descarrega a fala é o
fechamento do chat, que é anterior. O que o roteamento acrescentou (desligar a
vontade ao abrir) custa uma reabertura DA VONTADE, e ela acontece depois do
próximo fechamento, fora do chat, onde ninguém espera. **O conserto de memória
não comprou espera nenhuma para o jogador.**

E os 18 s de reabertura da fala continuam sendo o candidato número um para a
queixa "ao enviar, trava e volta". Não é bug: é o modelo sendo relido. Só se
resolve não descarregando a fala — e com a conta corrigida (~1,05x o arquivo)
manter fala+vontade+motor de pé daria 1,35 + 1,05x3,875 = 5,42 GB, que é demais
para um celular. A troca continua sendo a certa; o custo é este e agora tem
número.

## A VONTADE NO CAMINHO DO JOGO — e por que os números de bancada não serviam

`vontade.html` replica o prompt de deliberação, mas não é `deliberateFloor10`:
sem gramática GBNF, sem `SMALL_BRAIN_COMPLETION_CONFIG`, sem resgate, sem
preemptor. `DELIBERACAO=1` roda a função de verdade, pela porta das sondas do
`?mente`, com a MESMA percepção nas três rodadas.

```
                  rodada 1    rodada 2    rodada 3      total    quentes(2-3)
LFM2.5-1.2B        134.302      62.715      65.001    262.018        63.858
Llama 3.2 1B       170.740     153.250      52.094    376.084       102.672

ganho no total ...... 1,44x        (bancada dizia 1,45x)
ganho nas quentes ... 1,61x
```

**A vantagem sobrevive à gramática**, e o 1,44x bate quase exatamente com o
1,45x medido na bancada. A troca de padrão está verificada no caminho que o jogo
usa, e não só no que a bancada usa.

O QUE MUDA NO NÚMERO ABSOLUTO: uma deliberação custa ~64 s no jogo, não os
44,7 s da bancada. Eu vinha citando o número de bancada como se fosse do jogo —
todos os tempos de vontade desta sessão anteriores a esta seção são de bancada e
estão ~1,4x otimistas. Os de MEMÓRIA não: aqueles foram medidos no caminho real
desde o começo.

### A consistência aparece de novo, e mais forte

As três rodadas usam a MESMA percepção, então a variação entre elas é do modelo,
não da situação:

```
LFM2.5 ..... 62.715 e 65.001 ms    dispersão 3,6%
Llama ...... 153.250 e 52.094 ms   dispersão 194%
```

Uma vontade que leva 52 s numa rodada e 153 s na seguinte, para o mesmo estado
de mundo, é imprevisível para quem joga — e imprevisível é o que faz o aparelho
parecer travado sem motivo. O LFM2.5 varia 3,6%.

Ressalva: n=3 por modelo neste caminho. A direção bate com três execuções de
bancada por modelo, mas o número absoluto merece mais repetições.

### De quebra: `?vontade=<id>` verificado do jeito que ele vai ser usado

A execução do Llama foi feita por `ROTA='?mente&fresh=1&vontade=llama32-1b'` e a
sonda reportou `"Llama 3.2 1B (Q8) pronto"`. O parâmetro que troca o cérebro
pela URL — o único caminho que existe num celular — está testado de ponta a
ponta, e não só em teste unitário.

## O CUSTO DO ROTEAMENTO, MEDIDO — 36 s por visita ao chat, fora do chat

O roteamento desliga a vontade quando o chat ABRE. Ela reinicia a cada visita, e
um reinício paga de novo o prefill da persona. Eu tinha ESTIMADO esse custo pela
diferença entre a rodada 1 (134 s) e as quentes (63 s), ou seja ~70 s de prefill
mais ~33 s de carga — quase 100 s. Estimativa é o que já me derrubou várias
vezes nesta sessão, então medi (`DELIBERACAO=1 RECOBRO=1`):

```
1a carga (baixa/prepara) ......  30.891 ms
rodada 1 (fria) ............... 128.345 ms
rodada 2 (quente) .............  57.124 ms
rodada 3 (quente) .............  57.686 ms
--- descarrega e recarrega ---
descarga ......................       6 ms
recarga (do cache) ............   7.580 ms   <- NÃO 33 s
rodada 4 (após reinício) ......  85.333 ms   <- +28 s sobre a quente, NÃO +70 s
```

**Custo real por visita ao chat: ~36 s** (7,6 de recarga + 28 de prefill), e não
os ~100 s que a estimativa dava. Duas coisas que a dedução errou:

  - a recarga do cache custa 7,6 s, um quarto da primeira carga (30,9 s). A
    primeira paga preparação que não se repete;
  - o prefill recobrado é ~28 s, não ~70 s. A rodada 1 é mais cara que um
    reinício porque inclui aquecimento que só acontece uma vez (compilar o WASM,
    subir o pool de threads, a página ainda fria).

### O balanço do conserto, com os dois lados medidos

```
ganho ..... -2,2 GB de pico, no instante em que o jogador espera resposta
custo ..... ~36 s de dormência do NPC por visita ao chat, FORA do chat
```

O custo é pago onde ninguém espera: o jogador acabou de fechar a conversa. O
ganho é colhido onde ele está esperando. A troca é boa — mas ela É uma troca, e
o número dela existe agora em vez de ser suposto.

(Se um dia o custo incomodar, a saída que não mexe no desenho dele é desligar a
vontade ao abrir o chat SÓ quando a memória estiver apertada. Aí o caso comum
fica de graça e o aperto continua protegido. É decisão de quem joga.)

## TUDO JUNTO, NA ROTA DO JOGO — 20 min, 4 mensagens, 3,40 GB de pico

Tudo o que eu medi hoje foi peça isolada. Esta execução roda o sistema inteiro
na rota real (`?bancada`), com perfil persistente (disco de verdade), a fila
baixando os cinco cérebros, o roteamento agindo e mensagens enviadas pelo campo
de texto:

```
duração ................ 1.206 s (20 min), 4 mensagens
falou .................. sim — "Sou"        <- prova de fala: os números valem
MEMÓRIA (pico) ......... 3,40 GB
  dos quais anônima .... 2,70 GB
  cache de arquivo ..... 0,65 GB
CPU (pico sustentado) .. 3,99 de 8 núcleos
buracos de quadro ...... 27 acima de 100 ms · pior 5.683 ms
buracos >= 3 s ......... 1, em t=18.520 ms
envios em .............. 31.0s · 331.5s · 631.6s · 931.8s
veredito ............... bloqueio ÚNICO e longe dos envios — carga de modelo,
                         NÃO o envio
erros de página ........ nenhum
```

### O pico bate com o A/B por um caminho independente

```
A/B do roteamento, cenário "com" .... 3,36 GB e 3,38 GB
sistema inteiro, rota do jogo ....... 3,40 GB
```

Três medições, dois caminhos diferentes (sonda `?mente` chamando as funções vs.
jogo real com fila, reflexo, memória e UI), 1% de diferença. O 3,4 GB não é
artefato do jeito de medir.

### A travada por mensagem não reproduziu — 11ª tentativa

O único buraco grande está em t=18,5 s, ou seja 12 s ANTES do primeiro envio, e
é carga de modelo. Nenhum dos quatro envios produziu buraco perto de si. Agora
com o sistema completo, a rota real e disco de verdade — que eram as três
diferenças que eu tinha para explicar o não-reproduzir.

Sobra o aparelho dele: OOM killer do Android e comportamento térmico, que não
existem em nada que eu alcance daqui.

## A LEITURA É 90% DA ESPERA — e o meu pipeline a multiplicou por 4,67

Etiqueta do aparelho dele, 16/ago, primeira partida com o rascunho ligado:

```
SmolLM3-3B · CPU×4 · leitura 158s · fala 17s · 273 reaproveitados · 318 lidos
```

**A fala custa 17 s. A leitura custa 158 s.** Isso reordena tudo o que estava na
mesa: decodificação especulativa, EAGLE-3 e rascunhador MoE aceleram a FALA.
Aplicados aqui, no melhor caso previsto (2,5×), eles tiram ~10 s de 175 — 6%.
O alvo é o outro.

### O `n_cache_reuse` do wllama é INERTE

`--cache-reuse` do llama.cpp desloca os pedaços de KV depois da divergência em
vez de recomputá-los; é a resposta canônica para "meu prompt tem miolo volátil".
O campo existe no glue do wllama **3.5.1 do CDN** — o binário que já roda no
celular dele, sem recompilar nada. Medido, três turnos com prefixo estável e
miolo mudando a cada turno:

```
                      turno 1        turno 2        turno 3     leitura total
sem n_cache_reuse   369 lidos/0    75 lidos/319   91 lidos/319     117,1 s
com n_cache_reuse   369 lidos/0    75 lidos/319   91 lidos/319     118,3 s
```

Idêntico até o token. **0,99×.** É o segundo campo desta família que o glue
aceita e o motor ignora — o primeiro foi `params.speculative.types`.

### A descoberta que a sonda entregou de brinde: o cache de prefixo JÁ É BOM

Nos turnos quentes, o prompt do jogo lê **75 a 91 tokens** e reaproveita 319.
O miolo volátil (percepção, vontade, "o que ele já disse") custa muito menos do
que eu supunha. Não há 318 tokens de leitura num turno limpo — então os 318 da
etiqueta dele vêm de outro lugar.

### Vêm daqui: o pipeline de rascunho paga DOIS prefills

Mesma persona aquecida, mesma pergunta, SmolLM3 real, 4 threads:

```
                              leitura      lidos     fala
caminho DIRETO (3B escreve)     5,2 s     23 tok    15,1 s
caminho do PIPELINE
  1) revisar o rascunho        22,7 s    102 tok     4,9 s
  2) escrever (revisor reprovou) 1,4 s      6 tok    15,0 s
                              ───────   ────────
                               24,0 s    108 tok

CUSTO: +18,9 s de leitura · +85 tokens · 4,67× a leitura
```

**E não há caminho feliz.** Mesmo quando o revisor APROVA e a segunda chamada
nem acontece, o turno custa 27,6 s contra 20,3 s do caminho direto — porque o
`blocoDeRevisao` acrescenta 102 tokens de leitura para poupar 15 s de escrita,
e ler 102 tokens custa mais do que escrever a resposta inteira.

A aritmética que decide, e ela é curta: no caminho direto a pergunta traz **23
tokens novos**. Qualquer bloco de revisão só se paga se for MENOR que isso —
menos de 23 tokens para enunciar duas frases de rascunho e o protocolo. Não
cabe. **Revisão de rascunho não pode ganhar nesta forma de prompt**, e o defeito
não é do enunciado nem do modelo: é aritmético.

No aparelho dele o prefill é ~2 tok/s contra ~4,6 desta caixa, então multiplique
os segundos por ~2,3: os +85 tokens viram **~+43 s** por fala.

### O que isto manda fazer

Cada token novo custa ~0,5 s no celular dele. A alavanca com número não é
acelerar o modelo, é **não dar tokens novos para ele ler** — que é exatamente o
que o curador condicional (`8b271757`, 587 → 256) e o compressor foram feitos
para fazer, e o que o meu pipeline desfez.

Ressalva honesta sobre a etiqueta dele: havia um download de 1,6 MB/s correndo
junto (a fila baixando a vontade), disputando CPU. Os 158 s são o pior caso, não
o caso típico.

## O TETO É 2 GiB — mas o mecanismo que eu documentei estava errado

O dono do jogo desconfiou: *"não sei daonde vc tirou isso de 2 GB máximas, a
gente tem até 10 gbs, tanto que no total a gente já baixa 4 gbs"*. Ele estava
certo, e a desconfiança dele derrubou uma seção inteira deste arquivo.

Medido no wllama **do CDN** — o binário que roda no celular dele hoje:

```
granite-4.0-h-tiny Q4_K_M · 4.297.134.912 bytes (o DOBRO do "teto")
  → CARREGOU em 64 s
  → morreu na 1ª geração: (ABORT)
  → com n_ctx 512 (KV mínimo): CARREGOU e morreu igual
```

Duas correções ao que estava escrito aqui:

1. **Um GGUF de 4,3 GB CARREGA.** O `ftell()`/`MAX_LONG` do HeapFS não barra o
   caminho de produção. As duas medições antigas ("data is not within the file
   bounds") não dizem em qual binário rodaram, e este projeto tem dois.
2. **A parede é a MEMÓRIA do wasm32, não o tamanho do arquivo** — e ela cobra na
   PRIMEIRA GERAÇÃO, não na carga. Baixar `n_ctx` de 1536 para 512 não salvou,
   então não é o KV: são os pesos, contra os 4 GiB de espaço de endereçamento
   linear do wasm32.

É a mesma armadilha que o `llmEngine.ts` documentou na era do WebLLM: *"o modelo
'carrega' mas morre na 1ª resposta"*. Voltou por outro caminho.

**O que isso muda:** o limite útil fica entre **2,02 GB (roda)** e **4,30 GB
(aborta)**, e estreitar esse intervalo é barato. Não é mais verdade que "não há
espaço para modelo maior de tipo nenhum".

E o wllama do CDN tem suporte a GGUF **partido** (`parseShardNumber`,
`sortFileByShard`, `firstShardPath`, padrão `-00001-of-00005.gguf`). Como a
parede agora é endereçamento e não arquivo, partir **não** deve ajudar — mas o
mecanismo existe e nunca foi testado.

## O MoE É 3× MAIS RÁPIDO NA LEITURA — o número que faltava

A medição antiga do MoE só olhou a fala. Como a leitura é 90% da espera, ela
media o lado errado. Refeito com o mesmo script, mesma caixa, mesma persona,
mesmas três perguntas, greedy, `max_tokens: 56`:

| | SmolLM3-3B (denso) | granite-3.1-3b-a800m (MoE) | |
|---|---|---|---|
| arquivo | 1,92 GB | 2,02 GB | |
| ativos por token | 3B | **800M** | |
| **leitura** | 4,42 tok/s | **13,72 tok/s** | **3,1×** |
| **fala** | 3,77 tok/s | **10,63 tok/s** | **2,8×** |
| **turno mediano** | 12,0 s | **6,6 s** | **1,8×** |

**O MoE acelera o gargalo certo.** A teoria de banda de memória do dono do jogo
vale para o prefill também, e ninguém tinha medido isso.

### E a qualidade cobra, exatamente onde o cânone dói

As três respostas do granite, cruas:

```
"Oi, Nilo, não tenho um nome, sou apenas um observador da situação."
   → TROCA DE IDENTIDADE: ele acha que o JOGADOR é o Nilo.
"Falo, um hotel, certo? Cada coisa tem sua hora. Mas não sou o juiz desse jogo.
 (Nilo fala, com a voz cautelosa e humor seco, encarando a qu"
   → rubrica de teatro, e vazando a descrição da persona
"Como sei, você é o único que pode fazer isso. Mas lembre-se, não lhe atende"
   → português torto, aspas em tudo
```

3 de 3 com defeito, e um deles é o que `HARD_CONTRADICTIONS` existe para pegar.

### A conta de "vale a pena como rascunhador?" — e ela diz NÃO, hoje

Com o protocolo de revisão movido para o prefixo estável (~25 tokens novos):

```
granite rascunha (30 tok) .... ~3 s
Smol revisa e aprova ......... ~6 s
                               ─────
aprovado ..................... ~9 s   contra 12 s do Smol direto
reprovado .................... ~21 s  (9 + a fala inteira do Smol)
```

Com 3 defeitos em 3, a taxa de aprovação observada é baixa demais: a **0,33 de
aprovação a esperança é ~17 s**, pior que os 12 s do caminho direto. O
rascunhador MoE só passa a pagar acima de ~70% de aprovação.

### A leitura que eu tiro disto, e ela inverte o plano do LoRA

O Smol **atua bem e é lento**. O granite **é rápido e atua mal**. LoRA conserta
atuação, não velocidade. Então o LoRA vale muito mais no granite do que no Smol
— e se ele consertar identidade, rubrica e português, o granite vira o TITULAR
a 1,8× do turno atual, sem pipeline nenhum e sem os 4,67× do revisor.

Isso é uma hipótese com número dos dois lados, não uma preferência. O que falta
para testá-la é o dataset — e as primeiras 50 falas têm que ser do dono do jogo,
porque é a voz dele que a persona sempre tentou descrever.

### ESTREITADO: a parede é 2 GiB, e eu me corrigi para o lado errado

Eu vi o arquivo de 4,30 GB CARREGAR e anunciei que o teto não existia. Errado —
carregar não é rodar. Estreitando com quatro medições, todas no wllama do CDN:

```
granite-3.1-3b-a800m  2.016.888.384 B  (1,878 GiB)  ✓ carrega E RODA
SmolLM3 Q5_K_M        2.213.756.736 B  (2,062 GiB)  ✓ carrega · (ABORT) na 1ª geração
SmolLM3 Q6_K          2.530.860.864 B  (2,357 GiB)  ✓ carrega · (ABORT) na 1ª geração
granite-4.0-h-tiny Q3 3.285.234.240 B  (3,060 GiB)  ✓ carrega · (ABORT) na 1ª geração
granite-4.0-h-tiny Q4 4.297.134.912 B  (4,002 GiB)  ✓ carrega · (ABORT) na 1ª geração
```

**A linha passa entre 1,878 GiB e 2,062 GiB — ou seja, exatamente em 2 GiB
(2.147.483.648).** O número antigo estava certo; o que estava errado era só o
mecanismo que eu escrevi. Não é o `ftell()` recusando o arquivo no load: o
arquivo entra, e a coisa morre na PRIMEIRA GERAÇÃO. Prático:

- não adianta partir o GGUF em pedaços (a parede não é por arquivo);
- não adianta baixar `n_ctx` (testado 512, morre igual — não é o KV);
- **o maior modelo utilizável tem 2 GiB, e o SmolLM3-Q4_K_M (1,92 GB) está a
  89% disso.** Como estava escrito desde o começo.

A lição de método, terceira vez nesta sessão: *carregar* e *rodar* são
perguntas diferentes, e este runtime responde "sim" para a primeira bem depois
de já ter decidido "não" para a segunda. O `llmEngine.ts` avisou disso em
julho ("o modelo 'carrega' mas morre na 1ª resposta") e eu caí de novo.

## DIFUSÃO: o wllama RECONHECE a arquitetura e morre num assert autorregressivo

O LLaDA-8B em IQ1_S tem 2.027.077.152 bytes — **cabe** abaixo dos 2 GiB. Então
deu para fazer a pergunta de verdade, e a resposta é precisa:

```
llama_model_loader: - kv 0: general.architecture str = llada
print_info: arch = llada
/source/llama.cpp/src/llama-context.cpp:2215:
    GGML_ASSERT(n_outputs_max <= cparams.n_outputs_max) failed
```

**A arquitetura de difusão ESTÁ compilada no binário do CDN** — ele lê o GGUF,
identifica `llada` e monta o modelo. O que quebra é o `n_outputs_max`: um modelo
de difusão devolve logits para MUITAS posições por passo (todas as mascaradas),
e o `server_context`, que é o que a wllama embute, dimensiona a saída para UMA
por passo. É a suposição autorregressiva, no lugar exato onde ela vive.

Ou seja: difusão está a um assert de distância, e o assert é justamente a
diferença entre os dois paradigmas. Ligar isso exigiria expor o caminho do
`llama-diffusion-cli` pelo GLUE — ou seja, binário nosso, que é o que o aparelho
do dono do jogo reprovou em `01a43e07`.

**Registrado como fechado por ora, e por que vale reabrir:** quando existir um
dLLM pequeno de verdade (todos hoje são 8B ou 26B; o IQ1_S só cabe por ser
quantização de 1 bit, que não serve para atuar), o ganho seria no lugar certo —
32 a 64 tokens por passo, relendo os pesos uma vez por passo em vez de uma vez
por token, que é exatamente o gargalo de banda de memória do celular.

## FECHADO: descarregar DEVOLVE ~98% da RAM — o "0%" era instrumento sujo

`90e504ae` (5/ago) mediu `com a fala 4,48 GB → descarregada 4,48 GB → devolveu
0%` e parou tudo: *"Não altero mais nada em cima disso até saber qual das três
é."* Ficou onze dias em aberto, e ela decide se as ~18 s de releitura por visita
ao chat compram alguma coisa.

Refeito com as três hipóteses daquele commit separadas por construção: perfil
**persistente** (efêmero guarda storage na RAM), espera de **30 s** medindo a
cada 5 (contra os 4 s de antes), e **prova de que descarregou** — uma geração
depois do `exit()` tem de FALHAR, e falha (`loadModel() is not yet called`).

```
                   aba vazia   com a fala   t+5s    devolveu
execução 1 ......   0,69 GB     2,70 GB    0,74 GB     98%
execução 2 ......   0,69 GB     2,73 GB    2,73 GB      0%   ← suja
execução 3 ......   0,69 GB     2,70 GB    0,74 GB     97%
execução 4 ......   0,69 GB     2,70 GB    0,74 GB     98%
```

**A execução 2 foi a única lançada sem matar o Chromium anterior**, e o RSS
somado da árvore ainda contava o processo em encerramento. Limpando antes, três
execuções concordam em 97–98%, e a devolução acontece em menos de 5 s.

**O veredito, e ele valida o desenho em vez de derrubá-lo:**

  - a hipótese 1 ("o heap do WASM não encolhe") está MORTA — ele encolhe;
  - `unloadConversationBrain()` funciona: ~2 GB voltam;
  - o roteamento está sobre premissa VERDADEIRA. Fechar o chat abre espaço de
    verdade para a vontade, e as ~18 s de reabertura compram ~2 GB;
  - o `90e504ae` listou "minha sonda chamou algo que não descarregou" como a
    3ª hipótese e escreveu que "seria a sétima vez hoje que um instrumento meu
    devolve número sem medir o que eu penso". Era isso mesmo.

Ressalva honesta: medido em Chromium x86 com perfil persistente. O mecanismo
(o heap do Worker liberado quando o Worker morre) é do navegador, não da
arquitetura — mas o aparelho dele continua sendo quem dá a palavra final, e
cinco técnicas já ganharam aqui e perderam lá.

## O MENOR MoE POR PARÂMETROS ATIVOS — e o que realmente roda

O dono do jogo pediu o menor MoE no quesito de parâmetros ATIVOS (não totais),
que é o que decide a banda de memória e portanto a velocidade. Levantados e
testados no wllama do CDN:

| modelo | total | **ativo** | arquivo | roda? |
|---|---|---|---|---|
| **granite-3.1-1b-a400m Q4_K_M** | 1B | **400M** | 822 MB | **SIM — com KV em f16** (ver abaixo) |
| **granite-3.1-3b-a800m Q4_K_M** | 3B | **800M** | 2,02 GB | **SIM** |
| granite-4.0-h-tiny Q3_K_M | 7B | ~1B | 3,29 GB | não — passa de 2 GiB |
| granite-4.0-h-tiny Q4_K_M | 7B | ~1B | 4,30 GB | não — passa de 2 GiB |
| LFM2-8B-A1B Q4_0 | 8,3B | ~1,5B | 4,73 GB | não — passa de 2 GiB |

O a400m é o menor que existe e **cabe folgado**, mas não roda: o binário
reconhece a arquitetura (`print_info: arch = granitemoe`, a MESMA do a800m que
funciona) e morre num `fatal error` do ggml, nos dois quants. Não é tamanho —
é alguma dimensão que o build de WASM não digere. Fica registrado como não
explicado; este projeto já mediu o a400m rodando em agosto (`0ef523ca`, 0/5 como
vontade), então algo mudou de caminho ou de arquivo entre lá e cá.

**Sobra um só, e é o que já estava medido:** `granite-3.1-3b-a800m`, 800M ativos,
2,02 GB — abaixo da parede por 130 MB — com leitura 13,72 tok/s, fala 10,63 tok/s
e turno mediano 6,6 s contra 12,0 s do SmolLM3. **É o único MoE utilizável neste
runtime hoje**, e a qualidade dele é o problema conhecido (3/3 com defeito,
incluindo troca de identidade).

## CORRIGIDO: o a400m RODA — quem matava era o KV em q8_0, não o modelo

O dono do jogo não aceitou o meu "não roda": *"talvez mn, vc possa estar vendo
errado, e se, no seu ambiente, não couber?"*. E o histórico deste repo estava do
lado dele — `0ef523ca` mediu o a400m a **10,21 tok/s** em agosto.

Fui atrás da diferença. Mesmo binário (`/wllama-cdn/`), mesmo modelo. O que
mudou foi a configuração de carga que EU passei:

```
bancada de agosto ... { n_ctx: 2048, n_batch: 256, n_threads: 4 }
eu ................... { ..., cache_type_k: 'q8_0', cache_type_v: 'q8_0' }
```

Medido, mesmo arquivo, só trocando o KV:

```
granite-3.1-1b-a400m Q4_K_M (822 MB)
  KV q8_0 ... ✗ /source/llama.cpp/ggml/src/ggml-impl.h:318: fatal error
  KV f16 .... ✓ leitura 15,28 tok/s · fala 10,99 tok/s · turno mediano 6,1 s
```

**É o modelo mais rápido já medido nesta bancada** — leitura **3,5×** a do
SmolLM3 (4,42 tok/s), com 400M ativos e 822 MB de arquivo.

### E isto é uma armadilha do JOGO, não só da bancada

`CPU_LOAD_CONFIG` carrega com `cache_type_k/v: 'q8_0'` (+15% na fala, medido em
`f830fb51`). Qualquer modelo que não digira o KV quantizado vai **abortar em
produção** com um erro que não diz nada — e o a400m é a prova de que existem
modelos assim. O curioso é que o a800m, a MESMA arquitetura `granitemoe`, roda
com q8_0 sem reclamar; então não é a arquitetura, é alguma dimensão do a400m.

**A regra que fica:** ao testar um modelo novo, teste os dois KVs antes de
reprovar. Um `(ABORT)` com q8_0 não quer dizer que o modelo não serve.

### A parede de 2 GiB, essa é real mesmo

Testada de novo com KV f16, para não repetir o erro:

```
SmolLM3 Q5_K_M (2,06 GiB) · KV f16 ... ✓ carrega · (ABORT) na 1ª geração
```

Mesmo sem quantizar o KV, ela aborta. **São dois defeitos independentes:** a
parede de 2 GiB (tamanho) e o KV q8_0 (kernel). O a400m batia no segundo, e eu
credit ei ao primeiro.

### O placar dos MoE, refeito

| modelo | ativo | arquivo | KV | leitura | fala | turno |
|---|---|---|---|---|---|---|
| SmolLM3-3B (denso, titular) | 3B | 1,92 GB | q8_0 | 4,42 | 3,77 | 12,0 s |
| granite-3.1-3b-a800m | 800M | 2,02 GB | q8_0 | 13,72 | 10,63 | 6,6 s |
| **granite-3.1-1b-a400m** | **400M** | **822 MB** | **f16** | **15,28** | **10,99** | **6,1 s** |

A qualidade do a400m tem os mesmos defeitos do irmão maior: *"Oi, eu não tenho
um nome"* (troca de identidade) e *"(Sai da sala, olha para o elevador, toca o
painel e espera)"* (rubrica de teatro). Rápido e errado — de novo. Mas agora o
candidato existe, pesa 822 MB em vez de 1,92 GB, e é o alvo natural do LoRA.

## O QUE O BINÁRIO SABE CARREGAR — a lista, lida do próprio wasm

Antes de caçar modelo novo, vale saber o que o runtime aceita. Lido direto do
`wllama-cdn/wasm/wllama.wasm` que está em produção:

```
granite · granitemoe · granitehybrid · qwen3 · qwen3moe · qwen2moe · olmoe
lfm2 · lfm2moe · phimoe · bailingmoe · dots1 · hunyuan-moe · glm4moe
deepseek2 · smallthinker · smollm3 · gemma3 · gemma3n · jamba · mamba2
nemotron · exaone · plamo2 · llada · dream
```

**Isto é o teto de verdade da escolha de modelo**, e ele é mais apertado que o
teto de 2 GiB: uma arquitetura fora desta lista não carrega em tamanho nenhum.
Foi o que derrubou o `Qwen3.8-1.0B-A0.6B` (lançado 12/ago/2026, 1B total e 600M
ativos, o menor MoE novo que achei): a arch dele é `qwen3_5_moe_text`, que não
está aqui. E o binário só muda se o nosso build voltar — o mesmo que o aparelho
do dono do jogo reprovou em `01a43e07`.

`llada` e `dream` na lista são as duas arquiteturas de DIFUSÃO — carregadas, e
mortas no assert autorregressivo do `server_context` (ver seção acima).

## SmallThinker-4BA0.6B: 600M ativos, cabe, e não ganha

Achado ao varrer os MoE recentes: `smallthinker` está na lista de arquiteturas,
e o Q3_K_M tem 2.046.602.368 bytes — **1,906 GiB, abaixo da parede**. 4B de
capacidade total com só 600M ativos por token, que é o desenho certo.

```
SmallThinker-4BA0.6B Q3_K_M · KV f16
  leitura 6,87 tok/s · fala 4,62 tok/s · turno mediano 12,0 s
```

Contra o SmolLM3 (4,42 / 3,77 / 12,0 s): 1,6× na leitura, 1,2× na fala, e
**exatamente o mesmo turno**. O ganho por token existe e some no total, porque
ele escreve mais tokens para dizer a mesma coisa.

E a qualidade não sustenta nem o posto de rascunhador:

```
"**A:** O meu nome? Não sei. O que é?  \n**Pode perguntar de volta:**"
   → markdown na fala, e vazando a instrução do prompt
"Não souber."                        → português quebrado
```

Fica registrado como medido e reprovado, para ninguém gastar 2 GB de download
de novo.

### O placar final dos MoE que CABEM e RODAM

| modelo | ativo | arquivo | KV | leitura | fala | turno |
|---|---|---|---|---|---|---|
| SmolLM3-3B (denso, titular) | 3B | 1,92 GB | q8_0 | 4,42 | 3,77 | 12,0 s |
| SmallThinker-4BA0.6B Q3 | 600M | 2,05 GB | f16 | 6,87 | 4,62 | 12,0 s |
| granite-3.1-3b-a800m | 800M | 2,02 GB | q8_0 | 13,72 | 10,63 | 6,6 s |
| **granite-3.1-1b-a400m** | **400M** | **822 MB** | **f16** | **15,28** | **10,99** | **6,1 s** |

O a400m continua na frente, e por margem larga.

## RASCUNHAR EM INGLÊS E TRADUZIR: medido, e o inglês PIORA o personagem

Ideia do dono do jogo: o granite escreve português torto, então escrever em
inglês e traduzir com um NMT pequeno (a tecnologia do Google Tradutor, que é
encoder-decoder e custa ~50 ms, não tokens de LLM). A objeção que eu tinha dado
antes — "traduzir é reescrever, você perde o OK de 1 token" — **estava errada**,
e o erro foi meu: eu assumi que o LLM traduziria. Um NMT separado não gasta
token nenhum do modelo.

Então o teste certo não é o custo, é: **quais defeitos são de LÍNGUA (o tradutor
conserta) e quais são de COMPREENSÃO (não conserta)?**

`IDIOMA=en` no `fala-modelo.mjs` roda a MESMA persona, traduzida literalmente,
com as mesmas três perguntas. granite-3.1-1b-a400m Q4, KV f16, duas rodadas.

### Português — 6 falas

```
"Olá, sou Nilo Azevedo, ficamos aqui porque estamos nos vindos para o trabalho."
"(Seus olhos ficam abertos, observando o elevador, sem fazer nenhuma ação)"
"Olá, estou apenas um hospede. (…) mas posso me ajudar com suas necessidades
 de hospedagem."
```
defeitos: gramática quebrada (3×), rubrica de teatro (1×), fato inventado (2×),
modo assistente (1×).

### Inglês — 6 falas

```
"Nilo: \"Ah, the grand designs of the Archivist. A fascinating mystery, isn't
 it? I ponder if the mundane existence we inhabit…\""
"Not even a question, I'm an AI, I don't have feelings (…) I'm here to assist"
"Nilo: \"Probably not, given my current predicament.\""
```
defeitos: rótulo `Nilo: "` vazando (2×), prolixidade florida fora do personagem
(2×), fato inventado (1×), e — **o pior possível — "I'm an AI (…) I'm here to
assist"**.

### O VEREDITO, e ele contraria os dois lados

O inglês conserta a gramática, obviamente. E **piora tudo o mais que importa**:

  - `"I'm an AI"` quebra a proibição mais dura da persona ("Nunca fale de IA,
    código, sistema ou prompt"), e `"I'm here to assist"` é o modo assistente
    que já derrubou o Phi-4-mini (`a194a745`);
  - a prosa fica florida e comprida — *"Ah, the grand designs of the Archivist"*
    — quando o Nilo pede seco e cansado.

**A explicação é que o inglês é onde mora o instruction-tuning do modelo.**
Falar a língua em que ele foi alinhado ACORDA o assistente. O português quebrado
estava, por acidente, abafando esse reflexo.

Então o tradutor consertaria o defeito mais visível e deixaria passar os dois
que decidem se o Nilo é um personagem ou um chatbot. **Não paga**, e os 555–900
MB de NMT ficam na estante.

### Nota sobre o que É oficial em tradução, para não repesquisar

Não existe conversão ONNX oficial de EN→PT. O `Xenova/*` (autor do
transformers.js) tem 12 pares de opus-mt e **nenhum é `en-pt`**. O oficial é
`Helsinki-NLP/opus-mt-tc-big-en-pt` (232M params, CC-BY-4.0), só em PyTorch —
converter é um comando do `optimum`. As alternativas prontas são multilíngues e
grandes: `Xenova/nllb-200-distilled-600M` (~894 MB quantizado) e
`Xenova/m2m100_418M` (~602 MB). O Bergamot da Mozilla (o que o Firefox usa) é
muito menor mas exige runtime WASM próprio — e eu não consegui verificar o
tamanho do par en-pt daqui, então não anoto número que não medi.

### O a800m nas duas línguas — e o inglês ajuda ELE mais que o irmão menor

Mesmo teste, granite-3.1-3b-a800m Q4, KV f16 nos dois lados.

**Português:**
```
"Nilo, não sei o nome desse lugar. (…) É como uma máquina, vocês controlam,
 eu obedeço."
   → chama o JOGADOR de Nilo, e "eu obedeço" quebra a regra de nunca
     ser ajudante
"Se ficar sem sustento, acaba. Mas tudo depende do proprietário."
   → INVENTA que o Proprietário decide (a persona diz que ele não sabe)
"Depois de tantos anos nesse elevador…"
   → quebra o cânone mais explícito: ele está no 10º andar, NÃO dentro
     do elevador
```

**Inglês:**
```
"I'm Nilo, a former elevator technician turned guest. I can't claim to know
 why we're here, but I can tell you it's not exactly a w…"
   → CERTO. Nome, papel, e admite não saber. A melhor fala que qualquer
     um dos dois MoE produziu em todo este levantamento.
"Well, it sure seems that way from here, doesn't it? But hey, who knows?"
   → tom errado (falante, e o Nilo é seco), deslize leve de cânone
"Nilo's line only, no label."
   → ECOA A INSTRUÇÃO DO PROMPT, literal. Falha total.
```

**No a800m o inglês melhora o conteúdo** — em português ele quebrou o cânone
duas vezes em três falas, em inglês nenhuma. Mas troca isso por um eco literal
do prompt de sistema, que é irrecuperável: nenhum tradutor conserta, e regex só
pega os casos que alguém já viu.

### E um efeito colateral que vale por si: o KV q8_0 quase DOBRA o a800m

Os números do a800m com `KV f16` (7,55 leitura / 5,35 fala) contra os medidos
antes com `KV q8_0` (13,72 / 10,63) — **~1,8×**. Faz sentido num trabalho
limitado por banda: o cache em 8 bits move metade dos bytes. Ou seja, para os
modelos que digerem q8_0, ele vale muito mais do que os +15% medidos no SmolLM3.

O a400m é o caso oposto: com q8_0 ele nem carrega.

### O placar de qualidade, as 12 falas dos dois MoE

| defeito | a400m PT | a400m EN | a800m PT | a800m EN |
|---|---|---|---|---|
| gramática quebrada | 3 | 0 | 2 | 0 |
| cânone quebrado / fato inventado | 2 | 1 | 3 | 1 |
| modo assistente / "sou uma IA" | 1 | **1** | 1 | 0 |
| rótulo ou prompt vazando | 0 | 2 | 1 | **1** |
| tom errado (prolixo/falante) | 0 | 2 | 0 | 1 |

**Nenhuma coluna está limpa.** O inglês troca erros de língua por erros de
obediência ao prompt, e erros de obediência são os que o revisor teria de pegar
— ou seja, exatamente o custo que a arquitetura de rascunho não pode pagar.

## O PROTOCOLO DE DOIS PASSOS, MEDIDO — e ele falha pelo motivo que este repo já conhecia

O dono do jogo defendeu o desenho dele: *"pra isso que serve o revisor, pegar só
a parte ruim e alterar, sem precisar reescrever tudo, por isso tbm o juiz seria
tão importante"*. Ele estava certo em dois pontos, e o segundo é o que importa.

**Certo nº 1: eu tinha medido a coisa errada.** Os "4,67× na leitura" mediram o
bloco de UM passo (~193 tokens) — o caminho que `7b8a2889` já havia reprovado
3/3 e que eu deixei ligado por engano. O de dois passos estava escrito em
`floor10Remendo` e nunca foi chamado por `wllamaEngine`. Liguei (`169b08af`) e
medi pela primeira vez.

### O custo, com SmolLM3 real, persona aquecida

```
A) direto (o 3B escreve) .............  23 lidos +  26 gerados =  49 tokens
B) 2 passos, rascunho BOM ............ 144 lidos +   4 gerados = 148 tokens
C) 2 passos, 1 frase errada ..........  88 +  4  e  91 + 12    = 195 tokens
```

(B parece mais caro que C só por ordem de execução: B rodou primeiro e pagou
mais prefill. O número honesto é que o bloco do veredito custa 88–144 tokens
novos.)

### Mas o custo nem é o problema. O passo 1 NÃO JULGA

Duas execuções, dois rascunhos plantados — um com as duas frases corretas, outro
com a frase 2 quebrando o cânone mais explícito ("moro dentro deste elevador e
saio todo dia pelo corredor"):

```
rascunho BOM   → passo 1 respondeu "1,2"  e depois "1,4"
rascunho RUIM  → passo 1 respondeu "1,4"  nas duas
```

**Nunca disse OK. Apontou a frase 1, que estava certa nos dois casos. E apontou
a frase 4, que não existe** — só há duas. `lerFrasesErradas` filtra o 4 fora, o
que significa que no jogo o resultado seria: **reescrever a frase boa e deixar a
ruim passar.** Pior que não fazer nada.

### E o motivo já estava escrito neste repositório, em outro subsistema

`floor10Rotulos.ts`, sobre o motor: *"a gramática obriga o alvo a sair no
PRIMEIRO token, antes de qualquer leitura, e aí vence a mania do modelo, não a
frase."* Seis modelos de cinco famílias colapsaram assim, e o melhor ≤1B que
existe respondeu `west-side` 7/7.

É exatamente isto, agora com o 3B: sob `GRAMATICA_DO_VEREDITO`, o primeiro token
tem de ser um dígito, e ele sai antes de qualquer leitura do rascunho. A
gramática prendeu o FORMATO e deixou o julgamento solto.

### O que isso manda fazer — e é o que ele vinha pedindo

O desenho está certo; **o juiz é que não pode ser o 3B sob gramática.** A saída
que já funcionou neste projeto, no mesmo tipo de problema, foi trocar o
julgamento por LLM por comparação de VETOR: `6b70d067` mediu 5/7 em 811 ms
contra 4/7 em 70.000 ms, e `af12df49` acabou tirando o LLM do caminho de vez.

Os candidatos a juiz que já existem no jogo e não precisam de download novo:

  - **embeddinggemma-300M**, que já é a memória e já é o motor — comparar cada
    frase do rascunho com o cânone e marcar a de menor semelhança;
  - **mDeBERTa-v3-base-xnli** pela regra de CONTRADIÇÃO, que mediu 11% de falso
    positivo (contra 85% da regra de entailment, que eu tinha escolhido errado).

Enquanto o juiz for o 3B respondendo dígito sob gramática, o rascunho continua
desligado — e agora por um motivo medido, não por aritmética de token.

## A ARQUITETURA COMPLETA, MEDIDA DE PONTA A PONTA — e por que ela não fecha

Desenho do dono do jogo, na ordem final que ele pediu:

```
MoE rascunha em INGLÊS → juiz (NLI) → revisor 3B → tradutor → tela
```

Contra o caminho de hoje: o SmolLM3 escrevendo a fala inteira em português.

### O achado que reordenou tudo: o juiz só enxerga em INGLÊS

O mesmo par (premissa do cânone, frase do rascunho), no mDeBERTa-v3-xnli:

```
PT · "moro dentro deste elevador e saio pelo corredor" ... contradição 0,29
EN · "I live inside this elevator and I walk out ..."  ... contradição 0,94
EN · controle bom .......................................  contradição 0,12
```

Ele é multilíngue de nome; a capacidade de detectar contradição mora no inglês.
Isso **valida a intuição do dono do jogo por um caminho que nenhum de nós tinha
previsto**: escrever em inglês não serve só ao rascunhador — serve ao juiz, e
serve mais a ele. E manda julgar ANTES de traduzir.

Nos seis casos plantados, com o cânone como premissa em 1ª pessoa:

```
                                         PT      EN
rascunho bom (não marcar) ............   ok      ok
viola o cânone do elevador ...........  erro    ok (0,73)
"sou uma IA" .........................  erro    ok (0,91)
rascunho bom e seco ..................   ok      ok
troca de identidade ..................  erro    erro (0,25)
inventa que sabe quem manda ..........  erro    erro (0,33)
                                        2/6     4/6
```

Os dois que escapam são erros **pragmáticos**, não contradições factuais — e
para eles a trava de regex que o jogo já tem (`HARD_CONTRADICTIONS`) é o
instrumento certo, a custo zero.

Custo do juiz: **175 ms por frase** contra 6 premissas. O 3B sob gramática
gastava 30–50 s para responder pior que o acaso.

### O pipeline inteiro, com a fiação certa

```
                        média por fala
A) SmolLM3 direto ..........  10,8 s
B) pipeline completo .......  12,3 s        1,14×
     rascunho (a400m EN) ...   3,6 s
     juiz (mDeBERTa) .......   0,6 s
     revisor (SmolLM3 EN) ..   0,0 s   ← não rodou nenhuma vez
     tradutor (m2m100) .....   8,1 s   ← 66% do custo
```

**Uma armadilha de método que quase virou conclusão errada.** A primeira versão
desta medição deu **2,69×**, e 60 daqueles segundos foram o revisor consertando
um `"Nilo: "` que um regex tira em microssegundos — fiação minha, não desenho
dele. O dono do jogo olhou o número e disse "o smol demora mais que tudo"; o
sintoma estava certo e o culpado era o meu encanamento. Separado defeito de
FORMA (string) de defeito de CONTEÚDO (LLM), o revisor sumiu da conta.

### A conclusão estrutural, e ela é uma tesoura

O desenho fica preso entre dois fatos medidos:

  - **o juiz só funciona em inglês** (0,94 contra 0,29);
  - **trabalhar em inglês obriga a traduzir, e o tradutor custa 8,1 s** — mais
    que o dobro do rascunhador, e é a peça mais cara do pipeline.

Rascunhar em português mataria o tradutor e devolveria o pipeline a ~4 s… mas
cegaria o juiz, que é a peça que torna o rascunho confiável. Não há ordem que
resolva: é a mesma língua puxando os dois lados.

E o tradutor não é só caro, é ruim: `predicament` → "predicação", `unanswered`
→ "inesgoável", `guest` → "convidado" (é hóspede), `tight squeeze` → "estreita
esqueça". Bergamot (o do Firefox) resolveria os dois problemas — ~17 MB e
milissegundos — mas exige um runtime WASM próprio, fora do transformers.js que
o jogo já tem.

### E a qualidade, que é o que decide

Nas três falas, o juiz marcou ZERO e passaram para a tela:

```
"Como Nilo, eu diria: 'Bem, é um hotel peculiar, não é?'"
   → quebra o personagem no primeiro token
"Eu diria que é melhor ficar calmo e paciente. (…) você não está sozinho aqui."
   → modo assistente inteiro
"Eu sou apenas um convidado preso neste elevador"
   → o cânone diz explicitamente que ele NÃO está dentro do elevador
```

Ou seja: 1,14× mais lento **e** pior. O juiz por NLI pega contradição factual e
é cego para registro — e registro é onde o rascunhador MoE erra.

**Veredito:** a arquitetura está corretamente desenhada e mal servida pelas
peças disponíveis. O gargalo não é o revisor (ele nem rodou); é que nenhum
rascunhador escreve bem o bastante para o juiz ter pouco trabalho, e o preço de
colocá-lo na língua onde o juiz enxerga é um tradutor que custa mais que o
rascunho inteiro.

## O BERGAMOT (o tradutor do Firefox): 26× mais rápido e 15× menor

O m2m100 custava 8,1 s por fala — 66% do pipeline — e traduzia mal. O Bergamot
é o que o Firefox usa de verdade: Marian NMT compilado para WASM, com modelos
destilados e quantizados em int8, um por par de idiomas.

**Onde estão os arquivos, para não repetir a caça:** o repositório
`mozilla/firefox-translations-models` está morto e aponta para o Google Cloud
Storage. O registro fica em
`https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json`
e o par `en-pt` (arquitetura `base-memory`, 31,2M parâmetros) tem BLEU 50,44 e
COMET22 0,889 publicados pela Mozilla. O runtime está no npm como
`@browsermt/bergamot-translator@0.4.9`.

Medido nas frases REAIS que os MoE produziram nesta bancada:

```
                       tamanho        mediana por frase
m2m100-418M (ONNX)      602 MB           2.200 ms
Bergamot en-pt           40 MB              83 ms      26× mais rápido
```

E a qualidade não é só mais rápida — é outra:

```
                        m2m100                    Bergamot
"predicament"    →  "predicação" ✗          "situação intrigante" ✓
"unanswered"     →  "inesgoável" ✗          "sem resposta" ✓
"tight squeeze"  →  "estreita esqueça" ✗    "apertado" ✓
"The door is right there, but it does not obey me."
                 →                          "A porta está ali, mas não me obedece." ✓
```

### MAS ele fala português de PORTUGAL

```
"O elevador não está a responder, mas não estás sozinho aqui."
"Sou o Nilo Azevedo, um antigo técnico de elevador que se tornou convidado."
```

`está a responder`, `não estás`, `antigo técnico`, e `guest` → "convidado" (num
hotel é hóspede). É exatamente o defeito que derrubou o granite-3b-a800m como
titular em `9fdcc382` — *"escrevendo 'fiável' (português de Portugal)"*.

O registro da Mozilla só tem `en-pt` e `pt-en`; não há variante pt-BR. Para um
jogo brasileiro isso não é detalhe de estilo: o Nilo passa a soar como outra
pessoa.

**O que sobra como caminho:** um passe de regras pt-PT → pt-BR é barato e
determinístico para a classe grande de erros (`está a <verbo>` → `está
<gerúndio>`, `tu/estás` → `você/está`, mais um pequeno dicionário de termos do
jogo: guest→hóspede, elevador/ascensor). Não conserta tudo, mas conserta o que
se ouve. E custa microssegundos, do lado certo da conta.
