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
