// ── A MORTE DO CHEFE, FOTOGRAFADA E CRONOMETRADA ─────────────────────────────
// O chefe morria numa caixa de texto. A cena existe agora; esta bancada mata ele
// e prova duas coisas que não dá para ver lendo código: que a sequência DURA o
// que a tabela diz, e que ela tem o que ver quadro a quadro.
//
//   W=1100 H=620 node bancada-navegador/a-morte-do-chefe.mjs /tmp/morte.png
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 1100), H = Number(process.env.H ?? 620);
const saida = process.argv[2] ?? '/tmp/morte.png';
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
await new Promise(r => setTimeout(r, 1200));
const arqs = [];
const foto = async (nome) => { const f = `/tmp/mt-${arqs.length}.png`; await p.screenshot({ path: f }); arqs.push([f, nome]); };
await foto('vivo');
// mata
const t0 = Date.now();
await p.evaluate(() => window.__f12ferir(99999));
const INTERVALO = 550, QUADROS = 9;
const marcos = [];
for (let i = 0; i < QUADROS; i++) {
  const e = await p.evaluate(() => { const s = window.__f12estado; return { fase: s.fase, mt: s.morteT }; });
  marcos.push({ t: +((Date.now() - t0) / 1000).toFixed(2), ...e });
  await foto(`${((Date.now() - t0) / 1000).toFixed(1)}s · ${e.fase}`);
  await new Promise(r => setTimeout(r, INTERVALO));
}
const fim = await p.evaluate(() => window.__f12estado?.fase);
console.log('\n── A CENA ──');
for (const m of marcos) console.log(`  ${String(m.t).padStart(5)}s  ${m.fase.padEnd(9)} morteT=${(m.mt ?? 0).toFixed(2)}`);
const morrendo = marcos.filter(m => m.fase === 'morrendo');
console.log(`\n  fase final: ${fim}`);
console.log(`  quadros em 'morrendo': ${morrendo.length} de ${QUADROS}`);
if (morrendo.length) {
  console.log(`  duração observada: >= ${(morrendo[morrendo.length-1].t - morrendo[0].t + INTERVALO/1000).toFixed(1)}s`);
}
await b.close(); await ponte.fechar?.();
// folha de contato — a mesma receita em PIL das outras bancadas (não há
// `convert` nesta máquina, e descobrir isso depois de matar o chefe custa caro)
const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 400.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 4; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 6) + 6, linhas * (h + 22) + 6), (18, 15, 13))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 22)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 5), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), saida]);
console.log('📄', saida);
