// Sequência de quadros CONSECUTIVOS (para julgar movimento): node folhaSeq.mjs <Comp> <de> <ate> <passo> → out/<Comp>-seq.png
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'child_process';
import path from 'path';
const [id, de, ate, pas = '2'] = process.argv.slice(2);
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const local = (m) => path.resolve('node_modules', m);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.jsx'), publicDir: path.resolve('public'),
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias ?? {}), react: local('react'), 'react-dom': local('react-dom') } } }) });
const composition = await selectComposition({ serveUrl, id, browserExecutable });
const fs = [];
for (let q = +de; q <= +ate; q += +pas) { const o = path.resolve(`out/seq-${id}-${q}.png`); await renderStill({ composition, serveUrl, output: o, frame: q, browserExecutable }); fs.push(o); }
execFileSync('python3', ['-c', `import sys
from PIL import Image,ImageDraw
ims=[Image.open(f).convert('RGB').resize((640,304)) for f in sys.argv[2:]]
c=2;r=(len(ims)+c-1)//c;o=Image.new('RGB',(640*c,304*r))
for i,im in enumerate(ims):
  o.paste(im,((i%c)*640,(i//c)*304));ImageDraw.Draw(o).text(((i%c)*640+5,(i//c)*304+3),str(i),fill='yellow')
o.save(sys.argv[1],quality=85)`, `out/${id}-seq.jpg`, ...fs]);
console.log(`out/${id}-seq.jpg`);
