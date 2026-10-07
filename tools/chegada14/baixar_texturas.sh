#!/bin/sh
# Texturas da chegada (Poly Haven, CC0): ./baixar_texturas.sh  → tex/<nome>_{diff,rough,disp}.jpg (2k)
cd "$(dirname "$0")"; mkdir -p tex
for a in dense_sand cliff_side dark_rock medieval_wood dark_wood mud_cracked_dry_03; do
  curl -sS "https://api.polyhaven.com/files/$a" -o tex/_f.json
  for m in Diffuse:diff Rough:rough Displacement:disp; do
    k=${m%%:*}; n=${m##*:}
    url=$(python3 -c "import json;d=json.load(open('tex/_f.json'));print(d['$k']['2k']['jpg']['url'])" 2>/dev/null)
    [ -n "$url" ] && [ ! -f "tex/${a}_$n.jpg" ] && curl -sS -o "tex/${a}_$n.jpg" "$url"
  done
done
rm -f tex/_f.json; ls tex | wc -l
