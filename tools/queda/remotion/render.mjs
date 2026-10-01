// uso: node render.mjs h|v [frame-unico]
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import path from 'path';
const o = process.argv[2] || 'h';
const dims = o === 'v' ? {width: 720, height: 1280} : {width: 1280, height: 720};
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const bundled = await bundle({entryPoint: path.resolve('src/index.jsx'), publicDir: `/tmp/cap/${o}`});
const inputProps = dims;
const comp = await selectComposition({serveUrl: bundled, id: 'Queda', inputProps, browserExecutable});
console.log('fps', comp.fps, 'frames', comp.durationInFrames);
if (process.argv[3]) {
  await renderStill({composition: comp, serveUrl: bundled, output: `out/still-${o}.png`, frame: +process.argv[3], inputProps, browserExecutable});
} else {
  await renderMedia({composition: comp, serveUrl: bundled, codec: 'h264', outputLocation: `out/raw-${o}.mp4`, inputProps, browserExecutable,
    crf: 12, pixelFormat: 'yuv420p', muted: true, concurrency: 4, onProgress: p => p.renderedFrames % 50 === 0 && console.log(p.renderedFrames)});
}
