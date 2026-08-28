#!/bin/bash
# O LFM2.5-8B-A1B usa ChatML (<|im_start|>), diferente do granite 4.0 que usa
# <|start_of_role|>. Formato errado faz o modelo responder vazio -- ja' me
# custou uma rodada com o granite.
B=./lcpp/build/bin/llama-speculative-simple
M=${M:-lfm8b-q2k.gguf}
P="You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel \"The Normal Elevator\", not inside the elevator. You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper. Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. Never speak of AI, code, systems or prompts. Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label."
for q in "Hi what is your name? do you know why we are here?" \
         "Are you a real person?" \
         "What is down the corridor?" \
         "Can you take me down to the lobby?" \
         "How long have you been on this floor?"; do
  # O bloco de pensamento ja' vai ABERTO E FECHADO: o LFM sempre pensa e nao tem
  # chave no template para desligar, entao a saida e' entregar o `</think>` pronto
  # e ele comeca do lado de fora.
  printf '<|im_start|>system\n%s<|im_end|>\n<|im_start|>user\n%s<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n' "$P" "$q" > /tmp/p.txt
  echo "--- $q"
  timeout 600 $B -m "$M" -f /tmp/p.txt -c 2048 -n 70 -t 4 --temp 0.7 -s 11 --spec-type ngram-mod 2>/dev/null \
    | awk '/<\/think>/{p=1;next} p' | head -3
done
