// uso: node render.mjs <saida.png>  — renderiza os 4 quadros e monta o atlas 2x2 (1024x576).
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'child_process';
import path from 'path';
const saida = process.argv[2];
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const serveUrl = await bundle({entryPoint: path.resolve('src/index.jsx')});
const composition = await selectComposition({serveUrl, id: 'Letreiro', browserExecutable});
const quadros = [];
for (let f = 0; f < composition.durationInFrames; f++) {
  const output = path.resolve(`out/q${f}.png`); quadros.push(output);
  await renderStill({composition, serveUrl, output, frame: f, imageFormat: 'png', browserExecutable});
}
execFileSync('python3', ['-c', `
import sys; from PIL import Image
q=[Image.open(p).convert('RGBA') for p in sys.argv[2:]]; w,h=q[0].size
o=Image.new('RGBA',(w*2,h*2),(0,0,0,0))
for i,im in enumerate(q): o.paste(im,((i%2)*w,(i//2)*h))
o.save(sys.argv[1], optimize=True)`, saida, ...quadros]);
console.log('atlas', saida);
