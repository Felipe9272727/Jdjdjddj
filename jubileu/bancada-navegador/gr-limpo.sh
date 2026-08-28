#!/bin/bash
# Prompt CURTO de proposito: o contador de `prompt eval time` inclui as passadas
# do draft e mente na comparacao. Com prompt curto, o total E' a geracao.
set -u
B=./lcpp/build/bin/llama-speculative-simple
C="-m granite7b.gguf -f /tmp/curto.txt -c 1024 -n 192 --ignore-eos -t 4 --temp 0.7 -s 42"
r () { echo "===== $1"; timeout 1200 $B $C $2 2>&1 \
  | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time" | grep -viE "print_info|model_loader" | tail -5; }
r "base"                "--spec-type ngram-mod"
r "draft n_max=4 p=0.4" "--spec-type draft-simple -md docling-draft.gguf -td 2 --spec-draft-n-max 4 --spec-draft-p-min 0.4"
r "draft n_max=6 p=0.3" "--spec-type draft-simple -md docling-draft.gguf -td 2 --spec-draft-n-max 6 --spec-draft-p-min 0.3"
