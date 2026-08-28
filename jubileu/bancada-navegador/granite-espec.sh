#!/bin/bash
# O par que faltava: granite-4.0-h-tiny (7B, ~1B ativos) como alvo, e o
# decodificador de texto do granite-docling-258M como rascunhador -- 138 MB
# contra 2,59 GB, e o mesmo vocabulario (92 tokens especiais alinhados).
set -u
B=./lcpp/build/bin/llama-speculative-simple
P="You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel \"The Normal Elevator\", not inside the elevator. You are observant, cautious, dry-humoured, and you have your own wants. Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window. Answer in 1 or 2 short complete sentences."
printf '<|start_of_role|>system<|end_of_role|>%s<|end_of_text|>\n<|start_of_role|>user<|end_of_role|>Hi what is your name? do you know why we are here?<|end_of_text|>\n<|start_of_role|>assistant<|end_of_role|>' "$P" > /tmp/g.txt
COMUM="-m granite7b.gguf -f /tmp/g.txt -c 2048 -n 128 --ignore-eos -t 4 --temp 0.7 -s 42"
roda () {
  echo "===== $1"
  timeout 1200 $B $COMUM $2 2>&1 \
    | grep -iE "n_drafted|n_accept|accept  |prompt eval time|total time|not compatible|failed" \
    | grep -viE "print_info|model_loader" | tail -6
}
roda "base (sem rascunho)"        "--spec-type ngram-mod"
roda "docling-258M p_min=0.4"     "--spec-type draft-simple -md docling-draft.gguf -td 2 --spec-draft-n-max 5 --spec-draft-p-min 0.4"
roda "docling-258M p_min=0.7"     "--spec-type draft-simple -md docling-draft.gguf -td 2 --spec-draft-n-max 4 --spec-draft-p-min 0.7"
