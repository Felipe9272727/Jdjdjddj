#!/bin/sh
# Renderiza as 8 cenas (mp4) e junta num compilado: ./compilado.sh  → out/compilado.mp4
set -e
cd "$(dirname "$0")"
for c in Briga Elevador Malas Cha Suite Conves Arquivo Ceu; do SO_MP4=1 node render.mjs $c; done
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
for c in Briga Elevador Malas Cha Suite Conves Arquivo Ceu; do echo "file '$c.mp4'"; done > out/lista.txt
$FF -y -loglevel error -f concat -safe 0 -i out/lista.txt -c copy out/compilado.mp4
echo pronto
