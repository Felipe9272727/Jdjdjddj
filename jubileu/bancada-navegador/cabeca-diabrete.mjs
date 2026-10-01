// Close da cabeça do Diabrete (frente, 3/4, perfil) para antes/depois.
//   node bancada-navegador/cabeca-diabrete.mjs <sufixo> [pasta] [porta]
import { chromium } from 'playwright';
const S = process.argv[2] ?? 'agora', OUT = process.argv[3] ?? '/tmp', PORTA = process.argv[4] ?? '3131';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{width:800,height:600} })).newPage();
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,140)));
for (const [nome,cam] of [['corpo','0.70,1.9,16.6'],['tres4','1.9,2.4,15.2'],['perfil','2.3,2.35,14.0']]) {
  await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&nopost&cam=${cam}&alvo=0.66,1.85,14`,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,14000));
  await p.screenshot({path:`${OUT}/dh-${nome}-${S}.png`}); console.log('ok',nome);
}
await b.close();
