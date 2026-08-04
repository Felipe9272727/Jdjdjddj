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
| n-grama (auto-especulação) | **padrão** | 1,00× em conversa, 1,43× quando a resposta ecoa o contexto; texto idêntico |
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

## MoE: a ideia está certa, o tamanho não

O raciocínio do Felipe é o mesmo dos MoE de verdade: em vez de acordar o modelo
inteiro para cada token, acordar só a parte que interessa. E num celular isso
ataca exatamente o gargalo certo — gerar token é limitado por BANDA DE MEMÓRIA,
porque cada token relê os pesos ativos. Um MoE relê só os experts ativos.

O problema é que MoE troca **memória** por **conta**, e memória é justamente o
que está faltando aqui:

| modelo | total | ativo/token | Q4_K_M |
|---|---|---|---|
| **SmolLM3-3B** (hoje) | 3B | 3B | **1,92 GB** |
| granite-4.0-h-tiny | 7B | ~1B | 4,25 GB (IQ4_XS: 3,79 GB) |
| LFM2-8B-A1B | 8,3B | ~1,5B | 5,04 GB (Q4_0: 4,73 GB) |
| Qwen3-30B-A3B | 30B | 3B | 18,56 GB |

O menor MoE decente **dobra e meia** o download e a RAM residente para ler ~1/3
dos pesos por token. Traduzindo para o aparelho do Felipe: 4,25 GB no lugar de
1,92 GB, e no print de download dele a rede estava a 149 KB/s — 4,25 GB nessa
velocidade são **quase 8 horas**. O ganho seria real (fala talvez 2–3× mais
rápida, com qualidade de um denso maior), mas pago na moeda que está em falta.

**Recomendação honesta:** não trocar agora. O caminho é testar antes de mexer no
jogo — e isso já dá para fazer sem commit nenhum, porque o modelo da fala aceita
override:

```js
// no console, antes de subir para o Andar 10
window.__npcModelUrl = 'https://huggingface.co/unsloth/granite-4.0-h-tiny-GGUF/resolve/main/granite-4.0-h-tiny-IQ4_XS.gguf';
```

Se num celular com RAM sobrando o granite carregar e falar mais rápido que o
SmolLM3, aí a conversa muda e a troca passa a valer a discussão. Se não
carregar, custou um download e nenhum código.
