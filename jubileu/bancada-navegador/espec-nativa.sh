#!/bin/bash
# ── A ESPECULATIVA MEDIDA FORA DO NAVEGADOR ──────────────────────────────
#
# O wllama leva ~45 s só para subir os dois modelos, e o console do Chromium
# não devolve `n_drafted`/`n_accept`. O llama.cpp nativo devolve, e é o mesmo
# `common_speculative` que roda dentro do wasm — então a taxa de aceite medida
# aqui vale lá.
#
# Precisa de dois alvos construídos uma vez:
#
#     cmake --build build --target llama-speculative-simple -j4
#     cmake --build build --target llama-bench -j4
#
# A BASE NÃO PODE SAIR DE `llama-cli`: o `llama-speculative-simple` exige um
# `--spec-type` e sai com "failed to initialize" sem ele. A base honesta é
# `ngram-mod`, que nesta pergunta rascunha ZERO — mesmo binário, mesmo caminho
# de código, zero especulação. Comparar contra outro binário mediria o binário.
#
# E RODE SOZINHO. Duas medições minhas foram para o lixo por eu ter deixado um
# `llama-quantize` e um leitor de gguf rodando junto: o prefill despencou de
# 43 para 16,7 tok/s e a linha virou ruído.
set -u
LCPP=${LCPP:-/home/user/lcpp}
ALVO=${ALVO:-/home/user/smollm3.gguf}
PROMPT=${PROMPT:-$(dirname "$0")/nilo-prompt.txt}
B="$LCPP/build/bin/llama-speculative-simple"
COMUM="-m $ALVO -f $PROMPT -c 2048 -n 64 --ignore-eos -t 4 --temp 0.7 -s 42"

roda () {
  echo "===== $1"
  timeout 900 $B $COMUM $2 2>&1 \
    | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time" \
    | grep -viE "print_info|model_loader" | tail -6
}

roda "base (ngram-mod: rascunha 0)" "--spec-type ngram-mod"
for D in "$@"; do
  for P in 0.4 0.75 0.90; do
    roda "$(basename "$D")  n_max=5  p_min=$P" \
      "--spec-type draft-simple -md $D -td 4 --spec-draft-n-max 5 --spec-draft-p-min $P"
  done
done
