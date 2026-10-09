#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
npm ci --prefix tools/carregamento-video --no-audit --no-fund
(cd jubileu && node --import tsx --input-type=module - <<'JS'
import * as data from './src/Floor2/constants.ts';
import {writeFileSync} from 'node:fs';
writeFileSync('../tools/floor2-cinematic/scene-data.json',JSON.stringify(data,null,2));
JS
)
python tools/floor2-cinematic/parallel.py
(cd tools/floor2-cinematic && python -m manim --disable_caching -t --format=png -r 1280,720 --fps 24 --media_dir frames/manim opening.py Abismo)
node tools/floor2-cinematic/render.mjs
