// Monta as cutscenes do final no Remotion. Da raiz: node tools/chegada14/render_final.mjs
// Entradas (frames/, ignorado): final/<plano>_NNNN.png (final.py), manim_final/images/titulo_final/*.png
// (titulo_final.py), descida.wav e portal.wav (audio_final.py). Saídas: jubileu/public/f14-descida.mp4, f14-portal.mp4.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..'), video = path.join(root, 'tools/carregamento-video');
const require = createRequire(path.join(video, 'package.json'));
const { bundle } = require('@remotion/bundler');
const { renderMedia, renderStill, selectComposition } = require('@remotion/renderer');
const pub = path.join(here, 'frames/public_final'), dest = path.join(pub, 'f14final');
await fs.rm(dest, { recursive: true, force: true });
for (const d of ['quadros', 'manim']) await fs.mkdir(path.join(dest, d), { recursive: true });
execFileSync('python3', ['-c', `
import glob, os
from PIL import Image
for f in sorted(glob.glob('${path.join(here, 'frames/final')}/*.png')):
    try: Image.open(f).convert('RGB').save(os.path.join('${path.join(dest, 'quadros')}', os.path.basename(f)[:-4] + '.jpg'), quality=93)
    except Exception: pass   # quadro ainda sendo renderizado
`], { stdio: 'inherit' });
for (const f of await fs.readdir(path.join(here, 'frames/manim_final/images/titulo_final')))
  await fs.copyFile(path.join(here, 'frames/manim_final/images/titulo_final', f), path.join(dest, 'manim', f));
for (const w of ['descida.wav', 'portal.wav']) await fs.copyFile(path.join(here, 'frames', w), path.join(dest, w));
const serveUrl = await bundle({ entryPoint: path.join(here, 'composition_final.jsx'), publicDir: pub,
  webpackOverride: c => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias || {}), react: path.join(video, 'node_modules/react'), 'react-dom': path.join(video, 'node_modules/react-dom'), remotion: path.join(video, 'node_modules/remotion') } } }) });
const browserExecutable = process.env.CHROMIUM_PATH || execFileSync('sh', ['-c', 'ls -d /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell | head -1']).toString().trim();
const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();
for (const [id, nome, conf] of [['FinalDescida', 'f14-descida.mp4', [120, 190, 280, 352]], ['FinalPortal', 'f14-portal.mp4', [30, 100, 150, 280, 460]]].filter(([i]) => !process.env.K14_SO || process.env.K14_SO === i)) {   // K14_SO=FinalDescida: só um
  const composition = await selectComposition({ serveUrl, id, browserExecutable });
  const saida = path.join(root, 'jubileu/public', nome), tmp = saida + '.tmp.mp4';
  await renderMedia({ composition, serveUrl, browserExecutable, codec: 'h264', pixelFormat: 'yuv420p', crf: 20, concurrency: 2, outputLocation: saida });
  // yuv420p + faststart: decodificação por hardware no celular e começa a tocar sem baixar tudo
  execFileSync(ff, ['-y', '-loglevel', 'error', '-i', saida, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-g', '48', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp]);
  await fs.rename(tmp, saida);
  for (const frame of conf) await renderStill({ composition, serveUrl, browserExecutable, frame, output: path.join(here, 'frames', `final-${id}-${frame}.png`) });
  console.log(nome, 'pronto');
}
