#!/bin/bash
# O n-grama rascunha COPIANDO do contexto. Numa resposta nova ele nao tem o que
# copiar e rascunha zero -- foi o que deu na pergunta do Nilo. Mas a tarefa do
# REVISOR e' outra: ele reescreve uma frase que ja' esta' no proprio prompt,
# mudando o minimo. Ai' quase todo token da saida JA' EXISTE na entrada, que e'
# exatamente o caso para o qual o prompt-lookup foi inventado.
# E o melhor: n-grama nao carrega segundo modelo -- zero RAM extra.
set -u
B=./lcpp/build/bin/llama-speculative-simple
COMUM="-m smollm3.gguf -c 2048 -n 64 --ignore-eos -t 4 --temp 0.7 -s 42"
roda () {
  echo "===== $1"
  timeout 900 $B $COMUM -f "$2" $3 2>&1 \
    | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time" \
    | grep -viE "print_info|model_loader" | tail -6
}
roda "PERGUNTA nova  · base"        nilo-prompt.txt    "--spec-type ngram-mod"
roda "REVISAO (copia) · base"       revisor-prompt.txt "--spec-type ngram-mod"
roda "REVISAO (copia) · ngram-cache"   revisor-prompt.txt "--spec-type ngram-cache"
roda "REVISAO (copia) · ngram-simple"  revisor-prompt.txt "--spec-type ngram-simple"
