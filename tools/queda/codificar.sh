#!/bin/sh
# codificar.sh <pasta de quadros> <saida.mp4> — 29,41 qps (34 ms de jogo por quadro), H.264 com início rápido
set -e
F=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
D=$1
# o 1º quadro capturado é t≈0,047 s: uma cópia dele alinham o tempo do vídeo ao da cena
for k in 1; do cp "$D/q0000.png" "$D/p$k.png"; done
ls "$D"/p?.png "$D"/q*.png | sed "s|^|file '|;s|$|'\nduration 0.034|" > "$D/lista.txt"
"$F" -y -loglevel error -f concat -safe 0 -i "$D/lista.txt" -r 29.4118 -c:v libx264 -preset veryslow -crf 21 -pix_fmt yuv420p -movflags +faststart -an "$2"
ls -la "$2"
