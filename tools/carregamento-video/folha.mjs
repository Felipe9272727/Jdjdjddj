// Folha de quadros de uma composição: node folha.mjs <Composição> <q1,q2,...>  → out/<id>-folha.png
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'child_process';
import path from 'path';
const [id, lista] = process.argv.slice(2);
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const local = (m) => path.resolve('node_modules', m);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.jsx'), publicDir: path.resolve('public'),
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias ?? {}), react: local('react'), 'react-dom': local('react-dom') } } }) });
const composition = await selectComposition({ serveUrl, id, browserExecutable });
const qs = lista.split(',').map(Number), fs = [];
for (const q of qs) { const o = path.resolve(`out/${id}-${q}.png`); await renderStill({ composition, serveUrl, output: o, frame: q, browserExecutable }); fs.push(o); }
execFileSync('python3', ['-c', `import sys
from PIL import Image,ImageDraw
ims=[Image.open(f).convert('RGB').resize((640,304)) for f in sys.argv[2:]]
c=2;r=(len(ims)+1)//2;o=Image.new('RGB',(1280,304*r))
for i,im in enumerate(ims):
  o.paste(im,((i%c)*640,(i//c)*304));ImageDraw.Draw(o).text(((i%c)*640+6,(i//c)*304+4),str(i),fill='yellow')
o.save(sys.argv[1])`, `out/${id}-folha.png`, ...fs]);
console.log(`out/${id}-folha.png`);
