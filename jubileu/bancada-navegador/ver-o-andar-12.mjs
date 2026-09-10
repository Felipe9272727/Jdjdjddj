// ── VER O ANDAR 12 ───────────────────────────────────────────────────────────
//
// Fotografa a rota `?f12` em rajada, para eu ver a INTRODUÇÃO (o elevador se
// desdobrando em avião) e depois a luta. Aqui a rajada serve, ao contrário da
// passada do andar 3: o que estou olhando é uma coreografia de segundos, não um
// ciclo de 12 Hz.
//
//   node bancada-navegador/ver-o-andar-12.mjs [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const SAIDA = process.argv[2] ?? '/tmp/andar-12.png';
const FOTOS = Number(process.env.FOTOS ?? 12);
const INTERVALO = Number(process.env.INTERVALO ?? 2200);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// A tela do Felipe: celular em pé.
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [ERRO DE PÁGINA]', String(e.message).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });

await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 4000));
// O botão de entrada (ele existe para destravar o áudio).
await p.click('button', { timeout: 30000 }).catch(() => console.log('  [aviso] sem botão'));

// ── ATRAVESSAR O DIÁLOGO ─────────────────────────────────────────────────────
// Sem isto a rajada inteira fotografa a fala 1 do TROCO-63 e eu nunca vejo a
// LUTA, que é o andar. O balão avança por clique no botão ▶.
if (process.env.LUTAR) {
    for (let i = 0; i < 26; i++) {
        await new Promise(r => setTimeout(r, 700));
        const b = await p.$('button');
        if (b) await b.click({ timeout: 4000 }).catch(() => {});
    }
    console.log('  (diálogo atravessado)');
}

const arqs = [];
for (let i = 0; i < FOTOS; i++) {
    await new Promise(r => setTimeout(r, INTERVALO));
    // Depois que a luta começa, segura o tiro e mexe o manche, senão a foto é
    // sempre um avião parado no meio da tela.
    // O controle agora é ARRASTO de dedo, não joystick: a bancada tem de
    // arrastar de verdade, senão a nave fica parada no meio da tela e a foto
    // mostra um jogo que ninguém está jogando.
    if (process.env.LUTAR && i > 0) {
        const lado = i % 2 ? 120 : 292;
        await p.mouse.move(206, 620);
        await p.mouse.down();
        await p.mouse.move(lado, 520 + (i % 3) * 60, { steps: 6 });
        await p.mouse.up();
    }
    const f = `/tmp/f12-${String(i).padStart(2, '0')}.png`;
    await p.screenshot({ path: f });
    arqs.push([f, `${i} · ${((i + 1) * INTERVALO / 1000).toFixed(1)}s`]);
    console.log('📷', i);
}
ponte.fechar(); await b.close();

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 240.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 6; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 6) + 6, linhas * (h + 22) + 6), (18, 15, 13))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 22)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 5), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), SAIDA]);
console.log('📄', SAIDA);
