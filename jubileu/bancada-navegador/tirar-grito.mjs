// ── FOTOGRAFAR O BALÃO DE GRITO ──────────────────────────────────────────────
//
// Para ver este balão DENTRO do jogo seria preciso atravessar a intro e a
// apresentação do Diabrete, e nesta caixa (SwiftShader, ~2 fps) isso passa de
// oito minutos — eu tentei, e a espera estourou. `Floor3Grito` mora em arquivo
// próprio justamente para o preview poder montar O MESMO componente que o jogo
// usa, em dois segundos, sobre a cena do andar.
//
//   node bancada-navegador/tirar-grito.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1280,height:800} });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
const falas = ['EI! EI! Aquele é MEU! Larga o meu pincel, ladrão!','Tá cansando, perna-curta?','N-não… esse não… sem ele eu não sou NADA aqui…'];
for (let i=0;i<falas.length;i++){
  await p.goto('http://127.0.0.1:3011/index.html?f3preview&nopost&grito='+encodeURIComponent(falas[i]),{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,9000));
  await p.screenshot({path:`/tmp/f3-grito-${i}.png`}); console.log('📷',i);
}
ponte.fechar(); await b.close();
