// ── O TURNAROUND: OS QUATRO LADOS DELE ───────────────────────────────────────
//
// Todos os ciclos deste loop foram câmera e ROSTO. As COSTAS deste personagem
// nunca entraram numa foto — e foi exatamente "nunca olhei de perfil" que
// escondeu, até o ciclo 7, uma máscara de rosto que caía aos pedaços fora do
// eixo frontal. O que não é fotografado não é sabido.
//
// Os quatro lados saem da MESMA rodada, com a mesma pose congelada (`parado`),
// porque comparar lados entre rodadas diferentes compara poses diferentes.
//
//   node bancada-navegador/o-turnaround.mjs [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const SAIDA = process.argv[2] ?? '/tmp/o-turnaround.png';
const PORTA = process.env.PORTA ?? '3011';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// O centro dele saiu da sonda (`medir-o-corpo.mjs`): a caixa vai de y 0,249 a
// 2,707, e ele encara +Z — as fotos de rosto deste loop todas vêm de z > 14.
const ALVO = '0.66,1.45,14';
const R = 2.45;
const LADOS = [
    ['frente', `0.66,1.55,${(14 + R).toFixed(2)}`],
    ['tres-quartos', `${(0.66 + R * 0.707).toFixed(2)},1.55,${(14 + R * 0.707).toFixed(2)}`],
    ['perfil', `${(0.66 + R).toFixed(2)},1.55,14`],
    ['costas', `0.66,1.55,${(14 - R).toFixed(2)}`],
];

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 620, height: 760 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));

const arqs = [];
for (const [nome, cam] of LADOS) {
    await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&diabo&parado&sempiscar&nopost`
        + `&cam=${cam}&alvo=${ALVO}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 12000));
    const f = `/tmp/turnaround-${nome}.png`;
    await p.screenshot({ path: f });
    arqs.push([f, nome]);
    console.log('📷', nome, cam);
}
ponte.fechar(); await b.close();

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
folha = Image.new('RGB', (len(ims) * (w + 8) + 8, h + 30), (20, 16, 14))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 8 + i * (w + 8)
    folha.paste(im, (x, 8)); d.text((x + 4, h + 14), nome, fill=(230, 220, 200))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), SAIDA]);
console.log('📄', SAIDA);
