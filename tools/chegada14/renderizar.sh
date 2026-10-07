#!/bin/sh
# Renderiza todos os planos da chegada (Cycles): ./renderizar.sh  → frames/cinema/<plano>_NNNN.png
# Pode ser interrompido: rodar de novo continua de onde parou (os PNG vazios de um quadro cortado no meio são apagados).
cd "$(dirname "$0")"; mkdir -p frames/cinema
find frames/cinema -name '*.png' -size -8k -delete
for p in ${K14_PLANOS:-geral porta queda pov pega visor}; do
  K14_ESCALA=${K14_ESCALA:-75} K14_AMOSTRAS=${K14_AMOSTRAS:-16} blender -b -P cinema.py -- frames/cinema $p > frames/cinema/log-$p.txt 2>&1
  echo "$p feito" >> frames/cinema/progresso.txt
done
