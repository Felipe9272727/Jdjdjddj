# MTP no navegador: procurado em cinco frentes, não existe

> ## ⚠ WEBGPU ESTÁ FECHADA — VER A REGRA ZERO EM `JA-TENTADO.md`
>
> Este arquivo aponta a WebGPU como caminho a seguir. **Ela foi reprovada seis
> vezes no aparelho do dono do jogo**, e a sexta foi um agente lendo exatamente
> uma linha como as que estão abaixo.
>
> A causa não é lentidão nem memória, e não se conserta com menos camadas: o
> jogo é Three.js e desenha na MESMA GPU; o trabalho da LLM entope a fila de
> submissão e o render não fecha o quadro. E ela nunca ganhou nem quando
> funcionou — CPU×8 em 242,5 s contra WebGPU×2 em 257,1 s.
>
> **O que reabre o assunto:** só ele, no aparelho dele. Número de paper,
> cobertura de mercado e binário parado na árvore JÁ FORAM os argumentos das
> seis vezes.


Pergunta que voltou várias vezes: *"será que não tem nenhuma outra arquitetura
que rode MTP?"*. Cinco buscas paralelas, em ângulos que não se sobrepõem, mais
verificação minha nos arquivos. O resumo é que a parede não está onde eu
supunha, e por isso ela é mais firme do que eu dizia.

## A parede é o llama.cpp, e não o wllama

`ggml-org/llama.cpp` **issue #27089 — "Library hosts cannot use speculative
decoding"**: a decodificação especulativa (e o modo `draft-mtp`) vive em
`common/` e no laço principal do `llama-server`. Ela **não está na API pública**
(`llama.h`). Quem chama `llama_decode()` direto — que é o caso de todo binding
in-process, o wllama incluído — não tem como ligar.

Isso explica o que eu tinha achado sozinho e não sabia interpretar: o wllama
expõe `spec_draft_model`, `spec_draft_ngl` e mais cinco campos, e eles são
**inertes**. Não é binding incompleto; é que a engine embaixo não aceita o
pedido por essa porta. Detalhe irônico: o ngxson, autor do wllama, é
contribuidor de MTP no próprio llama.cpp.

## E não é só o llama.cpp

| runtime | roda no Chrome Android? | MTP / especulativo |
|---|---|---|
| wllama (llama.cpp WASM) | sim | não — bloqueado pela API do llama.cpp |
| transformers.js / onnxruntime-web | sim | não — sem menção em v4.2.0 |
| WebLLM (MLC) | sim | não — o MLC-LLM **nativo** tem, o WebLLM não expõe |
| picoLLM | sim | não |
| Ratchet / Candle / Burn | teórico | não |
| WebNN | atrás de flag | não, e ninguém usa para LLM generativo |
| Chrome Prompt API (Gemini Nano) | **não** — desktop apenas | usa MTP por dentro, não exposto |
| LiteRT-LM (Google) | **não é navegador** | **sim**, 2-3x — mobile nativo |

O padrão se repete: onde MTP existe (vLLM, MLC nativo, LiteRT-LM, llama-server)
é fora do navegador; dentro do navegador, ninguém expõe.

## O modelo existe, e não adianta

`unsloth/Qwen3.5-2B-MTP-GGUF`. Conferi o cabeçalho do gguf eu mesmo, com
requisição de faixa, em vez de acreditar no relatório:

    general.architecture ......... qwen35
    qwen35.nextn_predict_layers .. 1
    tensores de MTP .............. 4   (blk.24.nextn.eh_proj / enorm /
                                       hnorm / shared_head_norm)

A cabeça está **mesmo** dentro do arquivo, e o UD-IQ2_M pesa 944 MB — cabe no
orçamento. Mas pelo #27089 o wllama carregaria o modelo e **ignoraria** os
quatro tensores, rodando decodificação normal. A cabeça viria junto como peso
morto no download.

E há um segundo motivo para não tentar: é **Qwen**, e nesta bancada a família
devolveu a frase errada letra por letra em 0/6, duas vezes, inclusive quando o
enunciado dizia qual era o defeito.

## O que sobra

O ganho de velocidade não vem de MTP. Vem de:

1. ~~**WebGPU** — o único caminho medido que muda a ordem de grandeza.~~
   **FECHADA** (ver a nota no topo). Que o backend do ONNX suba no aparelho não
   é prova sobre o do wllama, que abortava — e a causa medida é a fila de
   submissão disputada com o Three.js, que nenhum backend resolve;
2. **menos tokens lidos** — 89% do custo do revisor é ler o enunciado;
3. **chamar o revisor menos vezes** — hoje ~30% das falas marcam alguma frase.
