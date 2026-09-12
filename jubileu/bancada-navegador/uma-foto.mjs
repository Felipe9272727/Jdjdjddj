// ── UMA FOTO, DO TAMANHO DA TELA ─────────────────────────────────────────────
// `o-andar-12-na-tela.mjs` monta folha de contato: várias fotos lado a lado, cada
// uma reduzida. Serve para ver RITMO — o que muda entre um instante e outro.
// Não serve para julgar ACABAMENTO: na folha, a cidade ao longe virava um borrão
// de 40 px de altura e passou duas revisões parecendo resolvida.
//
// Esta bancada tira UMA foto, em tamanho real, no instante pedido.
//
//   W=1100 H=620 T=8000 node bancada-navegador/uma-foto.mjs /tmp/f.png
//
// `T` é quanto tempo de LUTA esperar antes do clique do obturador (a introdução
// é atravessada automaticamente e não conta).
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 1100), H = Number(process.env.H ?? 620), T = Number(process.env.T ?? 6000);
const saida = process.argv[2] ?? '/tmp/andar12.png';
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [ERRO]', String(e.message).slice(0, 170)));
await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 3000));
for (let i = 0; i < 40; i++) {
  const bt = await p.$('button'); if (bt) await bt.click({ timeout: 2500 }).catch(() => {});
  await new Promise(r => setTimeout(r, 350));
  if ((await p.evaluate(() => window.__f12estado?.fase)) === 'luta') break;
}
await new Promise(r => setTimeout(r, T));
// O avião pisca depois de apanhar, e um obturador que cai no quadro apagado
// fotografa uma tela SEM jogador — já aconteceu, e eu quase li como sumiço.
await p.evaluate(() => { const s = window.__f12estado; if (s?.nave) s.nave.piscando = 0; });
await new Promise(r => setTimeout(r, 60));
await p.screenshot({ path: saida });
await b.close(); await ponte.fechar?.();
console.log('📄', saida);
