#!/bin/bash
# O tokenizador do SmolLM3 e' o do Llama 3, treinado com peso em ingles.
# A mesma frase em portugues custa mais tokens -- e token e' a unidade de
# tempo do modelo. Se custa o dobro, ele demora o dobro para dizer o mesmo.
B=./lcpp/build/bin/llama-tokenize
conta () { timeout 300 $B -m smollm3.gguf -p "$1" --ids 2>/dev/null | tr ',' '\n' | grep -c '[0-9]'; }
par () {
  local pt="$1" en="$2"
  local a b
  a=$(conta "$pt"); b=$(conta "$en")
  printf '  pt %3d  ·  en %3d  ·  %.2fx   "%s"\n' "$a" "$b" "$(echo "scale=4; $a/$b" | bc)" "${pt:0:44}"
}
echo "=== FALAS DO NILO (o que ele ESCREVE, que e' onde o tempo vai)"
par "Estou preso aqui há mais de um ano, à espera que o elevador coopere." \
    "I've been stuck here for over a year, waiting for the elevator to cooperate."
par "O elevador não vai ceder. Nem mesmo para uma conversa." \
    "The elevator won't budge. Not even for a conversation."
par "Não sei se confio em ti, só espero que não me deixes preso aqui para sempre." \
    "I'm not sure I trust you, I'm just hoping you won't leave me stranded here forever."
par "Parece que estamos presos há um tempo, mas nunca ouvi falar de mais ninguém ficar preso." \
    "It seems we've been locked in for a bit, but I've never heard of anyone else getting stuck."
echo
echo "=== A PERSONA INTEIRA (o que ele LÊ todo turno)"
PT="Você é Nilo Azevedo, 29 anos, humano e ex-técnico de elevadores; agora você é um hóspede preso no décimo andar do hotel \"O Elevador Normal\", e não dentro do elevador. Você é observador, cauteloso, de humor seco, e tem vontades próprias."
EN="You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel \"The Normal Elevator\", not inside the elevator. You are observant, cautious, dry-humoured, and you have your own wants."
par "$PT" "$EN"
