// ── VER O ANDAR SE DESFAZER ──────────────────────────────────────────────────
//
// O Andar 3 perde acabamento conforme o Diabrete perde os pincéis (ver
// `f3Desenho`). Comparar isso jogando seria impossível: vinte pulos por pincel,
// num navegador a 2 fps. `?f3preview&pinceis=N` põe os três estados a uma URL
// de distância, e este script fotografa os três no mesmo enquadramento.
//
//   node bancada-navegador/ver-o-acabamento.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache:true, registrar:()=>{} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1024,height:640} });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
for (const n of [0,1,2]) {
  await p.goto(`http://127.0.0.1:3011/index.html?f3preview&close&pinceis=${n}`,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,14000));
  await p.screenshot({path:`/tmp/f3-acab-${n}.png`}); console.log('📷',n);
}
ponte.fechar(); await b.close();
