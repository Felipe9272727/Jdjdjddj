#!/bin/bash
# O buraco: no prompt do Nilo o aceite foi 33-51%, mas eu media turnos de 64
# tokens onde o prefill (dobrado pelo draft) dominava. No teste de geracao pura
# eu usei um prompt de historia ABERTA, onde o aceite caiu para 12-15%.
# Nunca juntei ACEITE ALTO com MEDICAO LIMPA. E' o que falta.
#
# Aqui: prompt do Nilo (aceite alto) + 192 tokens de saida (geracao domina).
set -u
B=./lcpp/build/bin/llama-speculative-simple
COMUM="-m smollm3.gguf -f nilo-prompt.txt -c 2048 -n 192 --ignore-eos -t 4 --temp 0.7 -s 42"
roda () {
  echo "===== $1"
  timeout 1800 $B $COMUM $2 2>&1 \
    | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time" \
    | grep -viE "print_info|model_loader" | tail -6
}
roda "base (ngram-mod, rascunha 0)" "--spec-type ngram-mod"
roda "200M p_min=0.4" "--spec-type draft-simple -md draft-200m.gguf -td 2 --spec-draft-n-max 5 --spec-draft-p-min 0.4"
roda "200M p_min=0.6" "--spec-type draft-simple -md draft-200m.gguf -td 2 --spec-draft-n-max 4 --spec-draft-p-min 0.6"
roda "200M n_max=2"   "--spec-type draft-simple -md draft-200m.gguf -td 2 --spec-draft-n-max 2 --spec-draft-p-min 0.5"
