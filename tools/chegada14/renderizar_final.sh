#!/bin/sh
# Renderiza as cutscenes do final (Cycles): ./renderizar_final.sh → frames/final/<plano>_NNNN.png (retomável)
cd "$(dirname "$0")"; mkdir -p frames/final
[ -f frames/entidade.blend ] || blender -b -P entidade.py > /dev/null 2>&1
find frames/final -name '*.png' -size -8k -delete
for p in ${K14_PLANOS:-descida portal}; do
  K14_ESCALA=${K14_ESCALA:-66} K14_AMOSTRAS=${K14_AMOSTRAS:-$([ $p = portal ] && echo 16 || echo 12)} blender -b -P final.py -- frames/final $p > frames/final/log-$p.txt 2>&1
done
