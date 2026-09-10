// ── MEDIR O ENQUADRAMENTO DO ANDAR 12 ────────────────────────────────────────
//
// Esta sonda foi quem salvou o andar. A primeira montagem PARECIA certa e
// estava errada de um jeito que a foto não nomeia: `fov` no three é VERTICAL,
// e a tela do dono do jogo tem aspecto 0,45 — a abertura horizontal é menos da
// metade. Medido, o quadro no plano do avião tinha 4,00 unidades de largura e o
// avião tinha 5,30 de envergadura. Ele era MAIS LARGO QUE A TELA, e cinco vezes
// maior que a própria caixa de colisão.
//
// Nada disso se vê olhando. Tudo isso se vê em três números.
//
//   node bancada-navegador/medir-o-andar-12.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:412,height:915}, deviceScaleFactor:2 });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
p.on('pageerror', e => console.log('  [ERRO]', String(e.message).slice(0,200)));
await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil:'domcontentloaded', timeout:120000 });
await new Promise(r=>setTimeout(r,3500));
await p.click('button').catch(()=>{});
await new Promise(r=>setTimeout(r,Number(process.env.ESPERA ?? 16000)));
const m = await p.evaluate(() => {
  const c = window.__f12cam, cena = window.__f12cena;
  if (!c || !cena) return { erro: 'sem sonda' };
  const caixa = (o) => {
    const b = new (window.__THREE.Box3)().setFromObject(o);
    return { min: b.min.toArray().map(n=>+n.toFixed(2)), max: b.max.toArray().map(n=>+n.toFixed(2)),
             tam: b.getSize(new window.__THREE.Vector3()).toArray().map(n=>+n.toFixed(2)) };
  };
  const acha = (nome) => { let r=null; cena.traverse(o=>{ if(o.name===nome) r=o; }); return r; };
  return {
    cam: c.position.toArray().map(n=>+n.toFixed(2)),
    fov: c.fov, aspecto: +(window.innerWidth/window.innerHeight).toFixed(3),
    fase: window.__f12fase,
    abertura: window.__f12abertura,
    aviao: acha('aviao') ? caixa(acha('aviao')) : null,
    cabeca: acha('cabeca') ? caixa(acha('cabeca')) : null,
    cabine: acha('cabine') ? caixa(acha('cabine')) : null,
  };
});
console.log(JSON.stringify(m, null, 1));
ponte.fechar(); await b.close();
