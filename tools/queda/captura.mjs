import fs from 'fs';
// Captura a queda quadro a quadro com relógio falso (determinístico).
import { chromium } from 'playwright';
const [W, H, OUT, FPS, DPR, PORTA] = [+process.argv[2], +process.argv[3], process.argv[4], +(process.argv[5] || 30), +(process.argv[6] || 1), process.argv[7] || "3150"];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })).newPage();
await p.clock.install({ time: 0 });
// um quadro renderizado por quadro capturado: o rAF (falso, a 16 ms) passa a disparar a cada 33 ms
await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => raf(cb)); });
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f13&f13aovivo&f13gravar`, { waitUntil: 'domcontentloaded', timeout: 180000 });
const real = (ms) => new Promise((r) => setTimeout(r, ms));
await real(3000);
// para o relógio: daqui em diante o tempo só anda quando mandamos
await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 3000);
await p.click('button').catch(() => {});
// deixa carregar e compilar: avança o relógio aos poucos até a queda começar
for (let i = 0; i < 600; i++) {
  await p.clock.runFor(100); await real(150);
  const t = await p.evaluate(() => window.__f13?.tQueda?.() ?? -1);
  if (t > 0) { console.log('queda começou em', i); break; }
}
await p.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
const passo = 1000 / FPS;
let n = 0;
for (;;) {
  const t = await p.evaluate(() => window.__f13.tQueda());
  if (t >= 12.55) break;
  const arq = `${OUT}/q${String(n).padStart(4, '0')}.png`;
  // retomada: o relógio é determinístico, então o quadro que já existe não precisa de nova foto
  if (!fs.existsSync(arq)) await p.screenshot({ path: arq, timeout: 300000 });
  n++;
  await p.clock.runFor(passo);
  console.log('quadro', n, 't', t.toFixed(3), await p.evaluate(() => performance.now()));
}
console.log('fim', n);
await b.close();
