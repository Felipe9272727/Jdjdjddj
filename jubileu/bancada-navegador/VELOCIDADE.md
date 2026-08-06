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

1. **Fixar o número de threads MEDINDO no aparelho.** Num celular big.LITTLE o
   llama.cpp divide o trabalho igualmente entre as threads, então o núcleo mais
   lento segura cada token — 8 threads pode ser MAIS LENTO que 4. O jogo já tem
   onde guardar a escolha (`floor10-threads`); falta rodar os dois e ficar com o
   vencedor. É a técnica de maior retorno por esforço que sobrou.
2. **Não descarregar a fala entre os cérebros**, quando a RAM deixar. Vale os
   11 s medidos, por troca.
3. **WebGPU em algumas camadas.** Já existe no jogo (12 das 36) e já cobrou caro
   uma vez; só entra de novo com medição por aparelho, que o gerente já faz.

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
derrubou a fala duas vezes no celular do Felipe. Comece por 4 camadas de 36, não
por 12.

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
