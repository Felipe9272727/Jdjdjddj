#!/bin/sh
# Gauntlet: folha de quadros da cena → crítica do DeepSeek (com visão) com NOTA e defeitos.
#   ./gauntlet.sh <Cena> "<roteiro em uma frase>" [quadros]
# Saída: out/<Cena>-critica.txt (a chave fica em CHAVES_DIR/deepseek.env; nunca é impressa)
set -e
cd "$(dirname "$0")"
C=$1; ROT=$2; Q=${3:-6,24,44,60,76,92,110,130}
node folha.mjs $C $Q > /dev/null 2>&1
python3 -c "from PIL import Image; Image.open('out/$C-folha.png').convert('RGB').save('out/$C-folha.jpg', quality=82)"
cat > out/$C-prompt.txt <<P
Esta é UMA folha com 8 quadros numerados (0 a 7, em ordem de leitura) de um vídeo de 6 s em laço, 24 qps: TELA DE CARREGAMENTO de um jogo web em estilo desenho animado de 1930 (rubber hose, Fleischer/Cuphead).
Roteiro da cena: $ROT
Você é um diretor de arte e animador sênior, MUITO exigente. Avalie com dureza: legibilidade da piada em cada quadro, composição e câmera, design e expressividade dos personagens (poses, silhuetas, atuação), direção de arte (cor, luz, textura), e o que parece amador.
Responda EXATAMENTE neste formato:
NOTA: <0 a 10, uma casa decimal>
PROBLEMAS (do mais grave ao menos):
1. ... (cite o quadro)
...
CORREÇÕES CONCRETAS (até 6, implementáveis em SVG/React desenhado por código, com valores):
1. ...
P
CHAVES_DIR=${CHAVES_DIR:-/tmp/claude-0/-home-user-Jdjdjddj/5fdb4135-da04-565f-a0ec-1b437258dbc7/scratchpad} python3 ../cobuilder/ds_critica.py out/$C-prompt.txt out/$C-folha.jpg > out/$C-critica.txt 2>&1
grep -m1 "NOTA" out/$C-critica.txt || head -c 400 out/$C-critica.txt
