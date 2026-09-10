// ── AS NOVE FALAS DA APRESENTAÇÃO, NUMA FOLHA SÓ ─────────────────────────────
//
// Irmã de `as-oito-suplicas.mjs`, e pelo mesmo motivo: a decupagem da
// apresentação escolhe cinco lentes (55, 46, 58, 38, 36 graus) e na tela do
// Felipe — 412x915, aspecto 0,45 — `enquadrar()` pode achatar todas contra o
// teto e devolver cinco cópias da mesma coisa. Foi exatamente o que a súplica
// fazia: `fov` 66 nas oito falas, todas 2,5 vezes mais longe do que compostas.
//
// A diferença é que a apresentação NÃO recebe a fala como prop: ela roda por
// relógio interno. Por isso existe `?f3preview&fala=N`, que trava o relógio do
// roteiro dentro da fala pedida (`travarNaFala` em `Floor3Cutscene`).
//
// O que a folha reporta, por fala: o `fov` REALMENTE aplicado, a distância até
// a cabeça, e a fração da altura da tela que a cabeça ocupa. Sem esses três
// números "o close está apertado?" é chute.
//
//   node bancada-navegador/as-nove-apresentacoes.mjs [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const SAIDA = process.argv[2] ?? '/tmp/as-nove-apresentacoes.png';
const PORTA = process.env.PORTA ?? '3011';
const FALAS = Number(process.env.FALAS ?? 9);
const INSTANTE = process.env.INSTANTE ?? '0.5';
const ESPERA = Number(process.env.ESPERA ?? 13000);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));

const arquivos = [], medidas = [];
for (let linha = 0; linha < FALAS; linha++) {
    await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&sempiscar&fala=${linha}&instante=${INSTANTE}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, ESPERA));

    const m = await p.evaluate(() => {
        const w = window;
        const c3 = w.__cam;
        const cena = w.__cena;
        if (!c3 || !cena) return null;
        // A cabeça esculpida da APRESENTAÇÃO: nesta tela só existe uma (o rival
        // que corre pelo andar não é desenhado aqui), mas escolher a mais perto
        // da câmera mantém a sonda honesta se um dia existir outra.
        let melhor = null, dist = Infinity;
        cena.traverse((o) => {
            if (o.name !== 'diabrete-sculpted-head') return;
            o.updateWorldMatrix(true, false);
            const e = o.matrixWorld.elements;
            const d = Math.hypot(e[12] - c3.position.x, e[13] - c3.position.y, e[14] - c3.position.z);
            if (d < dist) { dist = d; melhor = e.slice(); }
        });
        if (!melhor) return { fov: +c3.fov.toFixed(1), semCabeca: true };

        const px = melhor[12], py = melhor[13], pz = melhor[14];
        const raio = Math.hypot(melhor[4], melhor[5], melhor[6]);   // RY=1 na escultura
        const fz = [melhor[8], melhor[9], melhor[10]];
        const nf = Math.hypot(...fz) || 1;
        const v = [c3.position.x - px, c3.position.y - py, c3.position.z - pz];
        const nv = Math.hypot(...v) || 1;
        const cos = (fz[0]*v[0] + fz[1]*v[1] + fz[2]*v[2]) / (nf * nv);

        const mul = (a, bb) => {
            const o = new Array(16).fill(0);
            for (let col = 0; col < 4; col++) for (let lin = 0; lin < 4; lin++)
                for (let k = 0; k < 4; k++) o[col * 4 + lin] += a[k * 4 + lin] * bb[col * 4 + k];
            return o;
        };
        const M = mul(c3.projectionMatrix.elements, c3.matrixWorldInverse.elements);
        const ndcY = (x, y, z) => {
            const cy = M[1]*x + M[5]*y + M[9]*z + M[13];
            const cw = M[3]*x + M[7]*y + M[11]*z + M[15];
            return cy / (cw || 1);
        };
        const u = c3.up, nu = Math.hypot(u.x, u.y, u.z) || 1;
        const a0 = ndcY(px, py, pz);
        const a1 = ndcY(px + (u.x/nu)*raio, py + (u.y/nu)*raio, pz + (u.z/nu)*raio);
        // ONDE ELE CAI NO QUADRO, de cima para baixo (0 = topo, 1 = rodapé).
        // Sem isto, "a metade de baixo do quadro está vazia" é uma frase dita
        // olhando uma miniatura — e olhar miniatura já me fez reportar defeito
        // que não existia neste mesmo andar.
        const paraOTopo = (ndc) => +((1 - ndc) / 2).toFixed(3);
        return { fov: +c3.fov.toFixed(1), dist: +nv.toFixed(2), cos: +cos.toFixed(3),
            // NDC vai de -1 a +1 na altura INTEIRA da tela. Um deslocamento
            // de um RAIO dá um delta de NDC que já é a fração de tela do
            // DIÂMETRO — multiplicar por 200 conta duas vezes, e foi o que eu
            // fiz nos dois primeiros ciclos: os "69% da tela" que reportei eram
            // 34%. As comparações antes/depois continuavam válidas; os números
            // absolutos não. É a régua errando sobre si mesma.
            telaPct: +(Math.abs(a1 - a0) * 100).toFixed(1),   // diâmetro do crânio, em % da altura
            cabecaEm: paraOTopo(a0),
            pesEm: paraOTopo(ndcY(px, py - 2.05, pz)) };      // ~altura do Diabrete abaixo da cabeça
    });

    const f = `/tmp/apresentacao-${String(linha).padStart(2, '0')}-.png`;
    await p.screenshot({ path: f });
    arquivos.push(f); medidas.push([linha, m]);
    console.log('📷', linha, m ? `fov=${m.fov} dist=${m.dist} cos=${m.cos} tela=${m.telaPct}%` : 'SEM SONDA');
}
ponte.fechar(); await b.close();

console.log('\n fala | fov  | dist  | cos    | cabeça | onde ele cai (cabeça→pés, 0=topo)');
for (const [linha, m] of medidas) {
    console.log(` ${String(linha).padStart(4)} | ${String(m?.fov ?? '—').padStart(4)}`
        + ` | ${String(m?.dist ?? '—').padStart(5)} | ${String(m?.cos ?? '—').padStart(6)}`
        + ` | ${String(m?.telaPct === undefined ? '—' : m.telaPct + '%').padStart(6)}`
        + ` | ${m?.cabecaEm ?? '—'} → ${m?.pesEm ?? '—'}`);
}

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 260.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 5; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 8) + 8, linhas * (h + 26) + 8), (20, 16, 14))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 8 + (i % cols) * (w + 8); y = 8 + (i // cols) * (h + 26)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 6), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arquivos.map((f, i) =>
    [f, `${i}  fov ${medidas[i][1]?.fov ?? '?'}  ${medidas[i][1]?.telaPct ?? '?'}%`])), SAIDA]);
console.log('📄', SAIDA);
