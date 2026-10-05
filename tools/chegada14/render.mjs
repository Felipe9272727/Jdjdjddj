// Run from repository root: node tools/chegada14/render.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const video = path.join(root, 'tools/carregamento-video');
const require = createRequire(path.join(video, 'package.json'));
const { bundle } = require('@remotion/bundler');
const { renderMedia, renderStill, selectComposition } = require('@remotion/renderer');
const dest = path.join(here, 'frames/public/ch14-v2');
await fs.mkdir(dest, { recursive: true });
for (const name of ['portal.png', 'vista.png', 'fall.png', 'helmet.png', 'ground.png', 'arrival.wav'])
  await fs.copyFile(path.join(here, 'frames', ...(name.endsWith('.png') ? ['denoised'] : []), name), path.join(dest, name));
const serveUrl = await bundle({ entryPoint: path.join(here, 'composition.jsx'), publicDir: path.join(here, 'frames/public'),
  webpackOverride: c => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias || {}), react: path.join(video, 'node_modules/react'), 'react-dom': path.join(video, 'node_modules/react-dom'), remotion: path.join(video, 'node_modules/remotion') } } }) });
const browserExecutable = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const composition = await selectComposition({ serveUrl, id: 'Chegada14', browserExecutable });
await renderMedia({ composition, serveUrl, browserExecutable, codec: 'h264', pixelFormat: 'yuv420p', crf: 19, concurrency: 2,
  outputLocation: path.join(root, 'jubileu/public/chegada-14.mp4'), onProgress: ({ progress }) => { if (Math.round(progress * 100) % 20 === 0) process.stdout.write('.'); } });
for (const frame of [32, 90, 133, 167, 205, 250])
  await renderStill({ composition, serveUrl, browserExecutable, frame, output: path.join(here, 'frames', `edit-${frame}.png`) });
console.log('\nRendered arrival + six review frames.');
