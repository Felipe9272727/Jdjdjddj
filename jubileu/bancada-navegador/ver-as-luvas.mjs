// Retrato das luvas de primeira pessoa, para comparar antes/depois de mexer no
// GLB delas. `?f3preview&fphands` desenha as luvas de verdade contra um fundo
// neutro; `?f3preview&close` mostra como elas aparecem jogando.
//   node bancada-navegador/ver-as-luvas.mjs <sufixo>
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const S = process.argv[2] ?? 'agora';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1024,height:640} });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,140)));
for (const [nome,q] of [['luvas','?f3preview&fphands'],['luvas-jogo','?f3preview&close']]) {
  await p.goto('http://127.0.0.1:3011/index.html'+q,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,15000));
  await p.screenshot({path:`/tmp/f3-${nome}-${S}.png`}); console.log('📷',nome);
}
ponte.fechar(); await b.close();
