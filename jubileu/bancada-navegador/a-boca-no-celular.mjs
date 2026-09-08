// ── QUANTO A BOCA DELE MEDE NA TELA DO FELIPE ────────────────────────────────
//
// Ele disse duas vezes que "a boca se mexe muito pouco". Eu consertei o relógio
// (a boca articula a 8 Hz enquanto o balão está no ar, e não só nos 0,55 s do
// trombone) e conferi numa foto de 1024 px. Só que ele joga no CELULAR, e é lá
// que a queixa nasce: movimento que não cabe em pixel nenhum não existe.
//
// Então esta bancada não olha, ela MEDE, e mede nos dois lugares em que ele vê o
// Diabrete:
//   apresentacao — a cutscene, câmera perto
//   jogo         — a perseguição, ele lá na frente
// Para cada um, em aparelho de verdade: quantos pixels de CSS tem a cara dele, e
// quantos tem a boca. Se a boca der dois pixels, nenhum ciclo de desenho salva —
// o conserto teria que ser de ENQUADRAMENTO ou de TAMANHO, não de relógio.
//
//   node bancada-navegador/a-boca-no-celular.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// O creme e a tinta do Diabrete, já posterizados pelo material dele.
const CREME = [224, 223, 220], TINTA = [4, 3, 4], TOL = 14;

/** Mede a cara e a mancha da boca numa foto. Devolve em pixels da imagem. */
function medir(caminho) {
    const py = `
from PIL import Image
from collections import deque
import sys
CREME=(${CREME}); TINTA=(${TINTA}); TOL=${TOL}
im=Image.open(sys.argv[1]).convert('RGB'); px=im.load(); W,H=im.size
def eh(c,a): return all(abs(c[i]-a[i])<=TOL for i in range(3))
seen=bytearray(W*H); best=None
for sy in range(H):
    for sx in range(W):
        p=sy*W+sx
        if seen[p] or not eh(px[sx,sy],CREME): continue
        q=deque([(sx,sy)]); seen[p]=1; n=0; x0=x1=sx; y0=y1=sy
        while q:
            x,y=q.popleft(); n+=1
            if x<x0:x0=x
            if x>x1:x1=x
            if y<y0:y0=y
            if y>y1:y1=y
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                a,b=x+dx,y+dy
                if 0<=a<W and 0<=b<H and not seen[b*W+a] and eh(px[a,b],CREME):
                    seen[b*W+a]=1; q.append((a,b))
        if not best or n>best[0]: best=(n,x0,x1,y0,y1)
if not best: print('0 0 0 0 0'); sys.exit()
n,x0,x1,y0,y1=best
# a boca: manchas de tinta no MEIO da cara, no terco de baixo
meio=(x0+x1)/2; larg=x1-x0; alt=y1-y0
mx0=mx1=my0=my1=None
for y in range(y0+int(alt*0.55), y1+1):
    for x in range(x0,x1+1):
        if eh(px[x,y],TINTA) and abs(x-meio)<larg*0.34:
            mx0=x if mx0 is None else min(mx0,x); mx1=x if mx1 is None else max(mx1,x)
            my0=y if my0 is None else min(my0,y); my1=y if my1 is None else max(my1,y)
print(larg, alt, (mx1-mx0+1) if mx0 is not None else 0, (my1-my0+1) if my0 is not None else 0, n)
`;
    const saida = execFileSync('python3', ['-c', py, caminho], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
    return { caraL: saida[0], caraA: saida[1], bocaL: saida[2], bocaA: saida[3] };
}

const APARELHOS = [
    { nome: 'iphone-deitado', largura: 844, altura: 390, dpr: 3 },
    { nome: 'iphone', largura: 390, altura: 844, dpr: 3 },
];
// Os dois lugares em que ele vê a cara do Diabrete. A cutscene usa o
// enquadramento real da apresentação; o jogo, a distância real da perseguição.
// ONDE ELE VÊ A CARA. A vista `&diabo` do preview olha para as COSTAS dele —
// medi ali primeiro e o que saiu foi a nuca, com boca nenhuma. Isso não é um
// erro da bancada, é o ACHADO: durante a perseguição o Diabrete corre na frente
// e o jogador vê as costas dele o tempo todo. A boca só existe onde a câmera
// olha para o rosto — a apresentação, a súplica e a queda.
const CENAS = [
    ['apresentacao', '&cam=0.66,1.90,15.8&alvo=0.66,1.80,14'],
    ['de-perto', '&cam=0.70,1.88,15.05&alvo=0.66,1.84,14'],
];
const FORMAS = ['sorrisoIronico', 'empolgado'];

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (const ap of APARELHOS) {
    const ctx = await b.newContext({ viewport: { width: ap.largura, height: ap.altura }, deviceScaleFactor: ap.dpr,
        isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); await ponte.instalarEm(p);
    await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await p.route('**://www.google.com/**', r => r.abort());
    p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 120)));
    for (const [cena, q] of CENAS) {
        for (const forma of FORMAS) {
            const arq = `/tmp/cel-${ap.nome}-${cena}-${forma}.png`;
            await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado&boca=${forma}${q}`,
                { waitUntil: 'domcontentloaded', timeout: 120000 });
            await new Promise(r => setTimeout(r, 13000));
            await p.screenshot({ path: arq });
            const m = medir(arq);
            // A foto sai em pixel de aparelho; o que o olho vê é pixel de CSS.
            const css = (v) => (v / ap.dpr).toFixed(1);
            console.log(`${ap.nome.padEnd(15)} ${cena.padEnd(13)} ${forma.padEnd(15)} `
                + `cara ${css(m.caraL)}x${css(m.caraA)} css-px | boca ${css(m.bocaL)}x${css(m.bocaA)} css-px`);
        }
    }
    await ctx.close();
}
ponte.fechar(); await b.close();
