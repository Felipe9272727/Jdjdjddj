// ── AS DEZESSEIS CARAS DO ANDAR, NUMA FOLHA SÓ ───────────────────────────────
//
// A folha do rosto montado (`o-rosto-inteiro.html`) desenhava a cara PINTADA, e
// envelheceu inteira quando a cara virou geometria esculpida. Esta é a
// substituta, e a diferença de método importa: aquela redesenhava a cara com os
// pincéis, esta FOTOGRAFA O JOGO. Não há como ela mentir sobre o que o jogador vê.
//
// A trava é `?momento=`, que resolve a tripla (boca, olho, sobrancelha) dentro do
// rig a partir de `expressaoDoDiabrete`/`olhoDoDiabrete`/`sobrancelhaDoDiabrete`.
// A bancada NÃO copia essa tabela — tabela copiada envelhece calada, e neste
// rosto isso já cobrou caro duas vezes.
//
//   node bancada-navegador/as-dezesseis-caras.mjs [pinceis] [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';


const PINCEIS = process.argv[2] ?? '0';
const SAIDA = process.argv[3] ?? `/tmp/as-dezesseis-caras-${PINCEIS}.png`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CAM = '&cam=0.66,1.94,15.35&alvo=0.66,1.91,14';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));

// A lista vem da PÁGINA, não copiada para cá — ver a nota em `PublicarMomentos`
// no `Floor3Preview`. Uma fonte só, e ela não envelhece sem avisar.
await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado${CAM}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => !!window.__f3Momentos, { timeout: 60000 });
const momentos = await p.evaluate(() => window.__f3Momentos);
console.log(`${momentos.length} momentos`);

const arquivos = [];
for (const m of momentos) {
    // `sempiscar` é obrigatório: sem ele cada foto pega uma fase aleatória da
    // piscada e a folha vira ruído em vez de comparação.
    await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado&sempiscar`
        + `&momento=${m}&pinceis=${PINCEIS}${CAM}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 11000));
    const f = `/tmp/cara-momento-${m}.png`;
    // O corte pega a cabeça INTEIRA, com chifre e tufo: a primeira versão
    // cortava no alto e a folha não mostrava metade da silhueta.
    await p.screenshot({ path: f, clip: { x: 218, y: 40, width: 470, height: 470 } });
    arquivos.push([f, m]);
    console.log('📷', m);
}
ponte.fechar(); await b.close();

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
cols = 4; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 8) + 8, linhas * (h + 26) + 8), (20, 16, 14))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 8 + (i % cols) * (w + 8); y = 8 + (i // cols) * (h + 26)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 6), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arquivos), SAIDA]);
console.log('📄', SAIDA);
