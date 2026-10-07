// Monta a chegada no Remotion. Da raiz do repositório: node tools/chegada14/render.mjs
// Entradas (em frames/, ignorado pelo git): cinema/<plano>_NNNN.png (cinema.py), manim/images/titulo/*.png
// (titulo.py) e chegada.wav (audio.py). Saída: jubileu/public/chegada-14.mp4 e alguns quadros de conferência.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const video = path.join(root, 'tools/carregamento-video');
const require = createRequire(path.join(video, 'package.json'));
const { bundle } = require('@remotion/bundler');
const { renderMedia, renderStill, selectComposition } = require('@remotion/renderer');

const pub = path.join(here, 'frames/public'), dest = path.join(pub, 'ch14-v3');
await fs.rm(dest, { recursive: true, force: true });
await fs.mkdir(path.join(dest, 'quadros'), { recursive: true }); await fs.mkdir(path.join(dest, 'manim'), { recursive: true });
// quadros do Blender → JPG (o bundle fica leve); os PNG do Manim mantêm a transparência
execFileSync('python3', ['-c', `
import glob, os
from PIL import Image
for f in sorted(glob.glob('${path.join(here, 'frames/cinema')}/*.png')):
    Image.open(f).convert('RGB').save(os.path.join('${path.join(dest, 'quadros')}', os.path.basename(f)[:-4] + '.jpg'), quality=93)
`], { stdio: 'inherit' });
for (const f of await fs.readdir(path.join(here, 'frames/manim/images/titulo')))
  await fs.copyFile(path.join(here, 'frames/manim/images/titulo', f), path.join(dest, 'manim', f));
await fs.copyFile(path.join(here, 'frames/chegada.wav'), path.join(dest, 'chegada.wav'));
// a camada da luva (cinema.py com K14_MAO=1), PNG com transparência
await fs.mkdir(path.join(dest, 'mao'), { recursive: true });
for (const f of await fs.readdir(path.join(here, 'frames/mao')).catch(() => []))
  if (f.endsWith('.png')) await fs.copyFile(path.join(here, 'frames/mao', f), path.join(dest, 'mao', f));

const serveUrl = await bundle({ entryPoint: path.join(here, 'composition.jsx'), publicDir: pub,
  webpackOverride: c => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias || {}), react: path.join(video, 'node_modules/react'), 'react-dom': path.join(video, 'node_modules/react-dom'), remotion: path.join(video, 'node_modules/remotion') } } }) });
const browserExecutable = process.env.CHROMIUM_PATH || execFileSync('sh', ['-c', 'ls -d /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell | head -1']).toString().trim();
const composition = await selectComposition({ serveUrl, id: 'Chegada14', browserExecutable });
const saida = path.join(root, 'jubileu/public/chegada-14.mp4');
await renderMedia({ composition, serveUrl, browserExecutable, codec: 'h264', pixelFormat: 'yuv420p', crf: 20, concurrency: 2,
  outputLocation: saida, onProgress: ({ progress }) => { if (Math.round(progress * 100) % 10 === 0) process.stdout.write('.'); } });
// yuv420p + faststart: decodificação por hardware no celular e começa a tocar sem baixar tudo
const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim(), tmp = saida + '.tmp.mp4';
execFileSync(ff, ['-y', '-loglevel', 'error', '-i', saida, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
  '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-g', '48', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp]);
await fs.rename(tmp, saida);
await fs.copyFile(saida, path.join(root, 'chegada-14.mp4'));
for (const frame of [40, 98, 110, 175, 290, 455])
  await renderStill({ composition, serveUrl, browserExecutable, frame, output: path.join(here, 'frames', `edit-${frame}.png`) });
console.log('\nchegada-14.mp4 + quadros de conferência prontos.');
