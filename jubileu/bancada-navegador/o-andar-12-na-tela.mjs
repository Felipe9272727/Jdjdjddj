// ── O ANDAR 12 NA TELA QUE ELE É JOGADO ──────────────────────────────────────
//
// O dono do jogo joga com o celular DEITADO, e o andar tinha sido composto só
// para a tela em pé. Esta bancada fotografa qualquer proporção, e PILOTA de
// verdade (arrasta o dedo), porque a foto de um avião parado no meio da tela é
// indistinguível de um jogo em que o controle está quebrado — que foi
// exatamente o que aconteceu.
//
//   MODO=intro|luta W=915 H=412 node bancada-navegador/o-andar-12-na-tela.mjs saida.png
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MODO = process.env.MODO ?? 'intro';
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const N = Number(process.env.FOTOS ?? 9), IV = Number(process.env.INTERVALO ?? 1000);
const SAIDA = process.argv[2] ?? '/tmp/andar12-tela.png';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [ERRO DE PÁGINA]', String(e.message).slice(0, 170)));
await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 3500));
await p.click('button', { timeout: 30000 }).catch(() => {});

if (MODO === 'luta') {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 450));
        if (await p.evaluate(() => window.__f12fase) === 'luta') break;
        const bt = await p.$('button'); if (bt) await bt.click({ timeout: 3000 }).catch(() => {});
    }
}

const arqs = [];
for (let i = 0; i < N; i++) {
    if (MODO === 'luta') {
        const lado = i % 2 ? 0.26 : 0.74;
        await p.mouse.move(W * 0.5, H * 0.62); await p.mouse.down();
        await p.mouse.move(W * lado, H * (0.42 + (i % 3) * 0.10), { steps: 6 }); await p.mouse.up();
    }
    await new Promise(r => setTimeout(r, IV));
    const f = `/tmp/a12-${String(i).padStart(2, '0')}.png`;
    await p.screenshot({ path: f });
    arqs.push([f, `${i} · ${((i + 1) * IV / 1000).toFixed(1)}s`]);
}
ponte.fechar(); await b.close();

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 430.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 3; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 6) + 6, linhas * (h + 22) + 6), (18, 15, 13))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 22)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 5), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), SAIDA]);
console.log('📄', SAIDA);
