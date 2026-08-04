# Treinar um rascunhador EAGLE-3 para o Nilo, no Colab

Este é o caminho que vale o seu tempo de GPU. Não é Medusa — é EAGLE-3, que é o
sucessor dela e o que **o nosso binário já sabe carregar**. Antes de pedir para
você treinar qualquer coisa, conferi as três pontas do caminho:

1. **O runtime aceita.** `common/speculative.cpp` do binário em
   `public/wllama-espec` reconhece `draft-eagle3` na lista de tipos, ao lado de
   `ngram-cache` que já usamos.
2. **Existe conversor para GGUF.** `convert_hf_to_gguf.py` tem
   `--target-model-dir`, com esta ajuda no próprio código: *"required when
   converting a standalone draft model (e.g. EAGLE3 / DFlash) that needs
   target-model metadata such as tokenizer, hidden size, and layer count"*.
   E `gguf-py` tem `MODEL_ARCH.EAGLE3` com a lista de tensores.
3. **O jogo tem onde plugar.** `spec_draft_model` já é o campo que carrega o
   rascunhador; hoje ele leva `types:ngram-cache`.

## Por que EAGLE-3 e não Medusa

Medusa treina K cabeças de saída independentes. Cada cabeça do SmolLM3 seria uma
matriz `2048 × 128256` = **263M parâmetros** — sozinha, do tamanho da tabela de
embeddings, e você precisaria de 4 ou 5. EAGLE-3 treina **uma camada de
transformer** que reaproveita o embedding e a cabeça de saída do próprio modelo
alvo: ~50M parâmetros em vez de 1,3 bilhão, e aceitação melhor nos papers.

E o mais importante, o que vale para os dois: **o texto não muda.** O rascunhador
só propõe; quem aceita ou rejeita é o SmolLM3, token por token. Velocidade sem
custo de inteligência — que é exatamente o que você pediu desde o começo, e o
que o n-grama só entrega quando a resposta repete o contexto.

## O que esperar, em número

O n-grama que está no jogo hoje acerta **0 de 1** numa pergunta nova (medido) e
68 de 81 quando o texto ecoa o contexto. Um EAGLE-3 treinado no domínio certo
costuma aceitar 60–80% em conversa comum. Traduzindo para a fala do Nilo, que
hoje faz 2,7 tok/s na CPU do WASM: a expectativa honesta é **1,8× a 2,5×**, sem
mudar uma palavra do que ele responde.

## O trabalho, e ele é pouco para você

O grosso é uma célula de Colab. O tempo de GPU depende do dataset:

| dataset | passadas | GPU | tempo estimado |
|---|---|---|---|
| ~10k diálogos (suficiente para começar) | 2 épocas | L4 | 2–4 h |
| ~68k (ShareGPT completo, como no paper) | 2 épocas | A100 | 8–12 h |

Comece pelo pequeno. Um rascunhador medíocre já paga: ele só precisa acertar
mais que 10% para empatar, e o alvo corrige todo o resto.

**Um detalhe que economiza horas:** treine com diálogos no ESTILO DO JOGO
(português, falas curtas, a persona do Nilo). O rascunhador não precisa ser
inteligente — precisa acertar o que o SmolLM3 diria *neste jogo*. Um dataset
pequeno e no domínio bate um dataset grande e genérico.

## As três células

```python
# 1. ambiente
!pip install -q torch transformers datasets accelerate
!git clone --depth 1 https://github.com/SafeAILab/EAGLE.git
%cd EAGLE && pip install -q -e .

# 2. treino — alvo é o MESMO GGUF que o jogo usa, em pesos originais
#    ggml-org/SmolLM3-3B  →  HuggingFaceTB/SmolLM3-3B
#    Gere os estados ocultos e treine a camada de rascunho.
#    Siga o README do repo: ele mudou de interface algumas vezes, e o que
#    estiver lá no dia vale mais do que eu chutar aqui a assinatura do script.

# 3. converter para GGUF (o passo que eu já verifiquei que existe)
!git clone --depth 1 https://github.com/ggml-org/llama.cpp
!python llama.cpp/convert_hf_to_gguf.py \
    /content/eagle3-smollm3 \
    --target-model-dir /content/SmolLM3-3B \
    --outfile /content/smollm3-eagle3.gguf \
    --outtype q8_0
```

Depois é só me mandar o `.gguf`. Do lado do jogo falta um patch pequeno: hoje o
`spec_draft_model` trata `types:` e caminho de modelo como excludentes, e o
EAGLE-3 precisa dos dois juntos (`types:draft-eagle3` + o caminho). São poucas
linhas no mesmo arquivo que já patchei duas vezes, mais um rebuild — mas não
adianta eu subir isso antes de existir um arquivo para testar.

## O que eu NÃO recomendo tentar

- **Treinar aqui, neste contêiner.** Não é que CPU não treine; é que só gerar os
  estados ocultos de 1 milhão de tokens passando pelo 3B levaria ~11 horas
  (prefill medido: 24 tok/s), o container morre por inatividade, e os papers
  usam dezenas de milhões de tokens.
- **Medusa.** 263M parâmetros por cabeça, e o llama.cpp não tem `draft-medusa`
  na lista — só `draft-simple`, `draft-eagle3` e `draft-mtp`. Treinar Medusa
  daria um arquivo que o jogo não carrega.

## E o cache estático de n-gramas?

Era a minha proposta anterior, e depois de olhar o custo eu tiro ela da frente:
o caminho do arquivo (`lookup_cache_static`) não está exposto no GLUE do wllama,
e o GLUE lê os campos POSICIONALMENTE — acrescentar um campo obriga a mexer nos
dois lados do protocolo e recompilar. Muito encanamento para um ganho que só
aparece quando o Nilo repete o cânone. O EAGLE-3 ganha em qualquer frase, e o
seu Colab existe. Se o EAGLE-3 der errado, o n-grama estático continua na mesa.
