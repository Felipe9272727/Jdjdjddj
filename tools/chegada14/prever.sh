#!/bin/sh
# prévia Workbench de quadros escolhidos: ./prever.sh <saida.jpg>   (usa K14_ESCALA=35)
SAIDA=$1; D=/tmp/ch14p; rm -rf $D; mkdir -p $D
cd "$(dirname "$0")"
for spec in "geral 1 84 83" "porta 100 146 9" "queda 154 210 8" "pov 215 330 23" "pega 340 410 14" "visor 411 460 49"; do
  set -- $spec
  K14_MOTOR=BLENDER_WORKBENCH K14_ESCALA=35 blender -b -P cinema.py -- $D $1 $2 $3 $4 2>/dev/null >/dev/null &
done
wait
EOF=1
python3 - "$SAIDA" <<'P'
import sys,glob
from PIL import Image, ImageDraw
fs=sorted(glob.glob('/tmp/ch14p/*.png'), key=lambda f:int(f.split('_')[-1][:4]))
ims=[Image.open(f).convert('RGB') for f in fs]; w,h=ims[0].size; c=4
o=Image.new('RGB',(w*c,h*((len(ims)+c-1)//c)))
for i,(f,im) in enumerate(zip(fs,ims)):
    o.paste(im,((i%c)*w,(i//c)*h)); ImageDraw.Draw(o).text(((i%c)*w+4,(i//c)*h+4),f.split('/')[-1],fill='yellow')
o.save(sys.argv[1],quality=80)
P
