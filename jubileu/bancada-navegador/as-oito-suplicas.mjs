// ── AS OITO FALAS DA SÚPLICA, NUMA FOLHA SÓ ──────────────────────────────────
//
// A primeira foto da cutscene da queda pegou as falas 0, 2 e 4 e mostrou a
// CÚPULA DO CRÂNIO enchendo o quadro — a cena em que ele suplica, filmada por
// trás. Três fotos não fecham um diagnóstico: "a cena inteira está de costas" e
// "faltam N planos" pedem consertos diferentes, e a diferença entre os dois é
// varrer as oito.
//
// E aqui a folha não é só olho. `Floor3FallCutscene` publica `__fallCam` e
// `__f3Cabeca` em DEV, e a cabeça esculpida tem o rosto no +Z local dela — então
// dá para MEDIR o que a foto sugere:
//
//     cos = (frente do rosto) · (direção da câmera)
//
//   cos ≈ +1  a câmera está de frente para ele
//   cos ≈  0  perfil
//   cos <  0  a câmera está ATRÁS da cabeça: o quadro é cocuruto
//
// Um número por fala, ao lado do nome do plano que a decupagem escolheu. Assim
// "o close mostra o rosto?" deixa de ser opinião.
//
//   node bancada-navegador/as-oito-suplicas.mjs [saida.png]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const SAIDA = process.argv[2] ?? '/tmp/as-oito-suplicas.png';
const PORTA = process.env.PORTA ?? '3011';
const FALAS = Number(process.env.FALAS ?? 8);
const ESPERA = Number(process.env.ESPERA ?? 13000);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// A TELA DELE, em pé. O enquadramento é o assunto desta folha e `enquadrar()`
// muda o plano conforme o aspecto — julgar isto em paisagem seria julgar uma
// cena que o Felipe nunca vê.
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));

// SEM `cam=`/`alvo=`: a cutscene dirige a própria câmera, que é justamente o que
// está sendo julgado. E SEM `nopost`, porque a vinheta e o contraste fazem parte
// da composição que ele vê.
const arquivos = [];
const medidas = [];
for (let linha = 0; linha < FALAS; linha++) {
    await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&sempiscar&queda=${linha}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, ESPERA));

    const m = await p.evaluate(() => {
        const w = window;
        const cabeca = w.__f3Cabeca, cam = w.__fallCam;
        if (!cabeca || !cam) return null;
        // A cabeça esculpida do PENDURADO, não a do rival que corre pelo andar:
        // escolhida pela proximidade do osso que a cutscene acabou de publicar.
        let melhor = null, dist = Infinity;
        const cena = w.__cena;
        if (cena) {
            cena.traverse((o) => {
                if (o.name !== 'diabrete-sculpted-head') return;
                o.updateWorldMatrix(true, false);
                const e = o.matrixWorld.elements;
                const d = Math.hypot(e[12] - cabeca[0], e[13] - cabeca[1], e[14] - cabeca[2]);
                if (d < dist) { dist = d; melhor = e.slice(); }
            });
        }
        if (!melhor) return { cam, cabeca, cos: null };
        // +Z local da escultura = para onde o rosto aponta (ver `front()`).
        const fz = [melhor[8], melhor[9], melhor[10]];
        const nf = Math.hypot(...fz) || 1;
        const px = melhor[12], py = melhor[13], pz = melhor[14];
        const v = [cam[0] - px, cam[1] - py, cam[2] - pz];
        const nv = Math.hypot(...v) || 1;
        const cos = (fz[0] * v[0] + fz[1] * v[1] + fz[2] * v[2]) / (nf * nv);

        // ── QUANTO DA TELA A CABEÇA DELE OCUPA ──────────────────────────────
        // `cos` diz para ONDE ele está virado; não diz se dá para VER. Um close
        // que virou plano geral acerta o ângulo e erra tudo. O raio do crânio é
        // RY=1 na escultura, então a escala em Y da matriz de mundo já é o raio
        // em metros; o resto é projetar e medir em fração de altura de tela.
        const raio = Math.hypot(melhor[4], melhor[5], melhor[6]);
        const c3 = w.__cam;
        let telaPct = null;
        if (c3) {
            // viewProj = projection · matrixWorldInverse, ambas em coluna-maior.
            const mul = (a, bb) => {
                const o = new Array(16).fill(0);
                for (let col = 0; col < 4; col++) for (let lin = 0; lin < 4; lin++)
                    for (let k = 0; k < 4; k++) o[col * 4 + lin] += a[k * 4 + lin] * bb[col * 4 + k];
                return o;
            };
            const M = mul(c3.projectionMatrix.elements, c3.matrixWorldInverse.elements);
            const ndcY = (x, y, z) => {
                const cy = M[1] * x + M[5] * y + M[9] * z + M[13];
                const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
                return cy / (cw || 1);
            };
            const u = c3.up, nu = Math.hypot(u.x, u.y, u.z) || 1;
            const a = ndcY(px, py, pz);
            const bq = ndcY(px + (u.x / nu) * raio, py + (u.y / nu) * raio, pz + (u.z / nu) * raio);
            // NDC de -1 a +1 cobre a tela INTEIRA, então o delta de um raio já
            // é a fração de tela do DIÂMETRO. Aqui isto é o número final; quem
            // dobrava era a impressão lá embaixo, e dobrar era erro.
            telaPct = +(Math.abs(bq - a) * 100).toFixed(1);   // diâmetro do crânio, em % da altura
        }
        const r3 = (a) => a.map((n) => +n.toFixed(3));
        return { cam, cabeca, beirada: w.__f3Beirada, corpo: w.__f3DevilPos,
            frente: r3([fz[0] / nf, fz[1] / nf, fz[2] / nf]),
            cos: +cos.toFixed(3), dist: +Math.hypot(...v).toFixed(2), raio: +raio.toFixed(3), telaPct };
    });

    const f = `/tmp/suplica-${String(linha).padStart(2, '0')}-.png`;
    await p.screenshot({ path: f });
    arquivos.push([f, String(linha)]);
    medidas.push([linha, m]);
    console.log('📷', linha, m ? `cos=${m.cos} dist=${m.dist} tela=${m.telaPct}% cam=${JSON.stringify(m.cam)}`
        + ` frente=${JSON.stringify(m.frente)} beirada=${JSON.stringify(m.beirada)}` : 'SEM SONDA');
}
ponte.fechar(); await b.close();

console.log('\n fala | cos   | rosto        | dist  | cabeça na tela');
for (const [linha, m] of medidas) {
    const c = m?.cos;
    const leitura = c === null || c === undefined ? '—'
        : c > 0.55 ? 'de frente'
        : c > 0.15 ? 'três quartos'
        : c > -0.15 ? 'perfil'
        : 'DE COSTAS'
    ;
    const pct = m?.telaPct;
    console.log(` ${String(linha).padStart(4)} | ${String(c ?? '—').padStart(5)} | ${leitura.padEnd(12)}`
        + ` | ${String(m?.dist ?? '—').padStart(5)} | ${pct === null || pct === undefined ? '—' : pct.toFixed(1) + '% da altura'}`);
}

const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 300.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 4; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 8) + 8, linhas * (h + 26) + 8), (20, 16, 14))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 8 + (i % cols) * (w + 8); y = 8 + (i // cols) * (h + 26)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 6), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arquivos.map(([f, n], i) => [f, n + '  ' + (medidas[i][1]?.cos ?? '?')])), SAIDA]);
console.log('📄', SAIDA);
