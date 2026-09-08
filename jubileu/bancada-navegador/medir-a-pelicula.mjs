// ── QUANTO A PELÍCULA ESTÁ APAGANDO DO ANDAR ─────────────────────────────────
//
// O dono do jogo mandou foto do celular: "as texturas estão extremamente
// bugadas". Não eram as texturas — era o grade de película por cima delas, que
// esmagava o meio-tom e transformava o andar num estêncil de duas cores.
//
// A régua é o HISTOGRAMA DA IMAGEM INTEIRA, e ela é assim por um motivo: eu
// tentei primeiro comparar pontos (céu, nuvem, plataforma) entre duas fotos, e
// aquilo mentiu — a câmera anda entre execuções, e com a película ligada o jogo
// roda mais devagar, então as duas rodadas param em momentos diferentes da
// cutscene. O histograma não depende de onde a câmera está.
//
// O que importa é `meios%`: quanto da tela cai entre 60 e 200 de luminância. É
// ali que moram céu, nuvem e tabuado. Zero por cento de meio-tom é uma cena que
// virou preto e branco puro.
//
//   node bancada-navegador/medir-a-pelicula.mjs "nopost" "" "contraste=0.10"
//
// Cada argumento é uma query. `nopost` desliga a película no preview;
// `?contraste=` e companhia (ver `floor3Grade.ts`) mexem nos números um a um.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,140)));
const py = `
from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('L'); h=im.histogram(); t=sum(h)
niveis=sum(1 for n in h if n/t>0.002)
print(round(sum(h[60:200])/t*100,1), round(sum(h[:40])/t*100,1), round(sum(h[216:])/t*100,1), niveis)
`;
console.log('grade                          meios%  preto%  branco%  níveis');
for (const q of process.argv.slice(2)) {
  const arq = `/tmp/g-${q.replace(/[^0-9a-z]/gi,'_')}.png`;
  await p.goto(`http://127.0.0.1:3011/index.html?f3preview&${q}`,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,14000));
  await p.screenshot({path:arq});
  const [m,pr,br,n] = execFileSync('python3',['-c',py,arq],{encoding:'utf8'}).trim().split(/\s+/);
  console.log(`${q.padEnd(30)} ${m.padStart(6)} ${pr.padStart(7)} ${br.padStart(8)} ${n.padStart(7)}`);
}
ponte.fechar(); await b.close();
