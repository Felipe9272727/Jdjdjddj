#!/bin/sh
# uso: ./run.sh h   (quadros de /tmp/cap/h -> out/queda-h.mp4)   |   ./run.sh v   (/tmp/cap/v -> out/queda-v.mp4)
set -e
cd "$(dirname "$0")"
O=${1:-h}
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
node render.mjs $O
$FF -y -loglevel error -i out/raw-$O.mp4 -an -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -r 29.4118 -movflags +faststart out/queda-$O.mp4
