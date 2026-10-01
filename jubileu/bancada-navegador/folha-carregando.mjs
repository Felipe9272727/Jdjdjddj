// Folha de quadros de uma cena de carregamento: node bancada-navegador/folha-carregando.mjs <cena> <saida.png> [passo=0.4] [n=12]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [cena, saida, passo = '0.4', n = '12'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true, args:['--no-sandbox'] });
const p = await (await b.newContext({ viewport:{width:800,height:380} })).newPage();
await p.goto(`http://127.0.0.1:3131/index.html?carregando&cena=${cena}&t=0`, { waitUntil:'domcontentloaded', timeout:90000 });
await new Promise(r=>setTimeout(r,6000));
const fs = [];
for (let i = 0; i < +n; i++) {
  await p.evaluate(t => window.__carregandoT?.(t), (+(process.env.T0||0)) + i * +passo); await new Promise(r=>setTimeout(r,250));
  const f = `${saida}.q${i}.png`; await p.screenshot({ path:f }); fs.push(f);
}
await b.close();
execFileSync('python3', ['-c', `import sys;from PIL import Image,ImageDraw
q=[Image.open(f).resize((400,190)) for f in sys.argv[2:]];c=3;r=(len(q)+c-1)//c
o=Image.new('RGB',(400*c,190*r),'white')
for i,im in enumerate(q):
  o.paste(im,((i%c)*400,(i//c)*190));ImageDraw.Draw(o).text(((i%c)*400+4,(i//c)*190+4),str(i),fill='red')
o.save(sys.argv[1])`, saida, ...fs]);
for (const f of fs) execFileSync('rm', [f]);
console.log(saida);
