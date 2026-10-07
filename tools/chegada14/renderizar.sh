#!/bin/sh
# Renderiza todos os planos da chegada (Cycles): ./renderizar.sh  → frames/cinema/<plano>_NNNN.png
cd "$(dirname "$0")"; mkdir -p frames/cinema
for p in geral porta queda pov pega visor; do
  K14_ESCALA=${K14_ESCALA:-75} K14_AMOSTRAS=${K14_AMOSTRAS:-16} blender -b -P cinema.py -- frames/cinema $p > frames/cinema/log-$p.txt 2>&1
  echo "$p feito" >> frames/cinema/progresso.txt
done
