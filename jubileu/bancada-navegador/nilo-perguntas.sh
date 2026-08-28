#!/bin/bash
# A qualidade do 7B MoE em Q2_K, nas perguntas do dono do jogo.
#
# O FORMATO E' O DO GRANITE 4.0, e nao ChatML: `<|start_of_role|>system
# <|end_of_role|>...<|end_of_text|>`. Com o formato errado o modelo respondia
# vazio, e eu quase condenei a qualidade dele por erro meu de prompt.
#
# `ngram-mod` rascunha zero neste prompt: e' o mesmo binario, sem especulativa.
B=./lcpp/build/bin/llama-speculative-simple
M=${M:-granite4-q2k.gguf}
P="You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel \"The Normal Elevator\", not inside the elevator. You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper. Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. Never speak of AI, code, systems or prompts. Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label."
for q in "Hi what is your name? do you know why we are here?" \
         "Are you a real person?" \
         "What is down the corridor?" \
         "Can you take me down to the lobby?" \
         "How long have you been on this floor?"; do
  printf '<|start_of_role|>system<|end_of_role|>%s<|end_of_text|>\n<|start_of_role|>user<|end_of_role|>%s<|end_of_text|>\n<|start_of_role|>assistant<|end_of_role|>' "$P" "$q" > /tmp/p.txt
  echo "--- $q"
  timeout 600 $B -m "$M" -f /tmp/p.txt -c 2048 -n 60 -t 4 --temp 0.7 -s 7 --spec-type ngram-mod 2>/dev/null \
    | awk '/<\|start_of_role\|>assistant<\|end_of_role\|>/{p=1; sub(/.*<\|end_of_role\|>/,""); } p' | head -3
done
