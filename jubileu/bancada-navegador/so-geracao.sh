#!/bin/bash
# Prompt CURTO de proposito: com ~15 tokens de entrada e 160 de saida, o
# prefill vira ruido e o relogio de parede mede GERACAO quase pura. E' a
# unica forma honesta de comparar aqui, porque o `prompt eval time` mistura
# os contadores dos dois modelos (variou de 5,5 a 8,4 s para o MESMO prompt).
set -u
B=./lcpp/build/bin/llama-speculative-simple
COMUM="-m smollm3.gguf -f curto.txt -c 1024 -n 160 --ignore-eos -t 4 --temp 0.7 -s 42"
roda () {
  echo "===== $1"
  timeout 900 $B $COMUM $2 2>&1 \
    | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time" \
    | grep -viE "print_info|model_loader" | tail -6
}
roda "base (sem rascunho)"        "--spec-type ngram-mod"
roda "200M p_min=0.4"   "--spec-type draft-simple -md draft-200m.gguf -td 4 --spec-draft-n-max 5 --spec-draft-p-min 0.4"
roda "200M p_min=0.6"   "--spec-type draft-simple -md draft-200m.gguf -td 4 --spec-draft-n-max 5 --spec-draft-p-min 0.6"
roda "1B   p_min=0.4"   "--spec-type draft-simple -md draft-1b.gguf   -td 4 --spec-draft-n-max 5 --spec-draft-p-min 0.4"
