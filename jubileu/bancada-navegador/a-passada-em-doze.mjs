// ── O CICLO DE CORRIDA, AS DOZE POSES NA ORDEM ───────────────────────────────
//
// Todas as fotos dos ciclos 15 a 19 são de POSE PARADA. Mas metade do que faz um
// rubber-hose funcionar é TIMING, e nada disso aparece num quadro congelado.
//
// A rajada de fotos NÃO serve aqui, e isso é uma limitação da bancada e não uma
// preguiça: o navegador roda a ~2 fps no SwiftShader e a passada corre a 12 Hz.
// Doze fotos seguidas cairiam em doze pontos ALEATÓRIOS do ciclo, e doze pontos
// aleatórios não são um ciclo — são doze poses soltas que não dá para ordenar.
//
// Então em vez de amostrar o TEMPO, esta folha escolhe a FASE: `?fase=0.25`
// trava a passada num ponto do ciclo (`FASE_TRAVADA` em `Floor3Rival`), e doze
// URLs dão as doze poses na ordem. É uma tira de animação de verdade, e é onde
// se vê se o ciclo tem contato, baixo, passagem e alto — ou se ele é um boneco
// deslizando.
//
//   node bancada-navegador/a-passada-em-doze.mjs [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const SAIDA = process.argv[2] ?? '/tmp/a-passada-em-doze.png';
const PORTA = process.env.PORTA ?? '3011';
const N = Number(process.env.N ?? 12);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// De lado: um ciclo de corrida se lê de PERFIL. De frente as pernas se escondem
// uma atrás da outra e o passo vira um borrão.
const CAM = process.env.CAM || '&cam=3.5,1.45,14.2&alvo=0.66,1.35,14';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 380, height: 500 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));

const arqs = [];
for (let k = 0; k < N; k++) {
    const fase = k / N;
    await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&diabo&sempiscar&nopost`
        + `&fase=${fase.toFixed(4)}${CAM}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 11000));
    const f = `/tmp/passada-${String(k).padStart(2, '0')}.png`;
    await p.screenshot({ path: f });
    arqs.push([f, `${k}/${N}`]);
    console.log('📷', k, fase.toFixed(3));
}
ponte.fechar(); await b.close();

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
cols = 6; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 6) + 6, linhas * (h + 24) + 6), (20, 16, 14))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 24)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 6), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), SAIDA]);
console.log('📄', SAIDA);
