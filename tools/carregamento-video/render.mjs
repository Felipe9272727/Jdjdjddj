// uso: node render.mjs <Composição> [quadro]  — vídeo (VP9 webm + H.264 mp4) ou um quadro parado (png)
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
const [id, quadro] = process.argv.slice(2);
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const local = (m) => path.resolve('node_modules', m);
const serveUrl = await bundle({
  entryPoint: path.resolve('src/index.jsx'), publicDir: path.resolve('public'),
  // as peças de arte vêm do jogo (jubileu/src); o React tem de ser um só
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias ?? {}), react: local('react'), 'react-dom': local('react-dom') } } }),
});
const composition = await selectComposition({ serveUrl, id, browserExecutable });
if (quadro !== undefined) {
  await renderStill({ composition, serveUrl, output: `out/${id}-${quadro}.png`, frame: +quadro, browserExecutable });
  console.log(`out/${id}-${quadro}.png`);
} else {
  await renderMedia({ composition, serveUrl, codec: 'vp9', outputLocation: `out/${id}.webm`, browserExecutable, crf: 34, concurrency: 4 });
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: `out/${id}.mp4`, browserExecutable, crf: 23, pixelFormat: 'yuv420p', concurrency: 4 });
  console.log(`out/${id}.webm`, `out/${id}.mp4`);
}
