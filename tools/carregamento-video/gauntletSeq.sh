#!/bin/sh
# Gauntlet de MOVIMENTO: quadros consecutivos → DeepSeek julga a locomoção/atuação.
#   ./gauntletSeq.sh <Cena> "<o que acontece nesse trecho>" <de> <ate> [passo]
set -e
cd "$(dirname "$0")"
C=$1; ROT=$2; DE=$3; ATE=$4; P=${5:-2}
node folhaSeq.mjs $C $DE $ATE $P > /dev/null 2>&1
cat > out/$C-promptSeq.txt <<P
Esta folha mostra quadros CONSECUTIVOS (numerados em ordem de leitura, um a cada $P quadros de um vídeo a 24 qps) de uma animação 2D estilo desenho animado de 1930 (rubber hose).
O que acontece neste trecho: $ROT
Você é um animador sênior de personagens, MUITO exigente com locomoção. Julgue o MOVIMENTO: os pés escorregam ou ficam plantados? o ciclo tem contato/descida/passagem/subida legíveis? peso, ritmo, quique, oposição de braços e pernas, arcos, silhueta das poses, intenção (ponta dos pés, medo, fuga). Aponte quadros específicos.
Responda EXATAMENTE:
NOTA: <0 a 10, uma casa decimal>
PROBLEMAS (do mais grave ao menos):
1. ...
CORREÇÕES CONCRETAS (até 6, com valores numéricos: comprimento de passo, quadros por passo, altura do pé, quique, ângulos):
1. ...
P
CHAVES_DIR=${CHAVES_DIR:-/tmp/claude-0/-home-user-Jdjdjddj/5fdb4135-da04-565f-a0ec-1b437258dbc7/scratchpad} python3 ../cobuilder/ds_critica.py out/$C-promptSeq.txt out/$C-seq.jpg > out/$C-criticaSeq.txt 2>&1
grep -m1 "NOTA" out/$C-criticaSeq.txt || head -c 400 out/$C-criticaSeq.txt
