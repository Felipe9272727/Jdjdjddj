#!/bin/bash
# grava a queda em densidade 2 e reduz (lanczos) para o tamanho final
S=/tmp/claude-0/-home-user-Jdjdjddj/5fdb4135-da04-565f-a0ec-1b437258dbc7/scratchpad
F=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
for o in h v; do
  if [ $o = h ]; then W=1280; H=720; else W=720; H=1280; fi
  rm -rf /tmp/cap/$o-2x /tmp/cap/$o; mkdir -p /tmp/cap/$o-2x /tmp/cap/$o
  cd $S && node captura.mjs $W $H /tmp/cap/$o-2x 30 2 3150 > /tmp/cap/$o.log 2>&1 || { echo "falhou $o"; tail -5 /tmp/cap/$o.log; exit 1; }
  for f in /tmp/cap/$o-2x/q*.png; do "$F" -y -loglevel error -i "$f" -vf "scale=$W:$H:flags=lanczos" "/tmp/cap/$o/$(basename $f)"; done
  echo "ok $o $(ls /tmp/cap/$o | wc -l) quadros"
done
