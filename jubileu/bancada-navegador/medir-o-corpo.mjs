// ── AS PROPORÇÕES DELE, MEDIDAS NA TELA ──────────────────────────────────────
//
// A ficha de proporções do Felipe conta a altura EM CABEÇAS, que é como um
// model sheet de desenho sempre contou. O rosto deste personagem já está medido
// até o osso; o corpo nunca entrou numa régua em ciclo nenhum.
//
// Isto NÃO lê o GLB. Ler o GLB mediria o asset cru, e o asset cru não é o que o
// jogador vê: o rig deforma a malha e a cabeça esculpida substitui o rosto
// inteiro. A sonda mede a caixa de mundo do grupo que está sendo renderizado,
// mais os ossos, que é a única medida que responde sobre o personagem.
//
//   node bancada-navegador/medir-o-corpo.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PORTA = process.env.PORTA ?? '3011';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&diabo&parado&sempiscar&nopost`
    + `&cam=0.66,1.8,17&alvo=0.66,1.3,14`, { waitUntil: 'domcontentloaded', timeout: 120000 });
// A assinatura é (fn, arg, opções) — passar as opções na posição do ARG
// faz o playwright usar o timeout padrão de 30 s e mandar o objeto de
// opções para dentro da página como argumento.
await p.waitForFunction(() => !!window.__f3Rival, null, { timeout: 90000 });
await new Promise(r => setTimeout(r, 6000));

const m = await p.evaluate(() => {
    const raiz = window.__f3Rival;
    const caixa = (obj) => {
        let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9, achou=false;
        obj.traverse((o) => {
            const g = o.geometry;
            if (!g || !g.attributes || !g.attributes.position) return;
            if (o.visible === false) return;
            o.updateWorldMatrix(true, false);
            const pos = g.attributes.position, e = o.matrixWorld.elements;
            for (let i = 0; i < pos.count; i++) {
                const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
                const wx = e[0]*px + e[4]*py + e[8]*pz + e[12];
                const wy = e[1]*px + e[5]*py + e[9]*pz + e[13];
                const wz = e[2]*px + e[6]*py + e[10]*pz + e[14];
                if (wx<x0)x0=wx; if (wy<y0)y0=wy; if (wz<z0)z0=wz;
                if (wx>x1)x1=wx; if (wy>y1)y1=wy; if (wz>z1)z1=wz;
                achou = true;
            }
        });
        return achou ? { x0,y0,z0,x1,y1,z1, larg:x1-x0, alt:y1-y0, fund:z1-z0 } : null;
    };
    let cabeca = null;
    raiz.traverse((o) => { if (o.name === 'diabrete-sculpted-head') cabeca = o; });

    // ── AS PEÇAS, UMA A UMA ─────────────────────────────────────────────────
    // A primeira versão mediu a caixa do grupo `diabrete-sculpted-head` inteiro
    // e chamou aquilo de "cabeça". Só que o grupo inclui os CHIFRES, que num
    // model sheet não contam como cabeça — e chifre neste personagem é alto.
    // Medir a cabeça com chifre junto e dividir a altura por ela dá um número
    // que não é a altura em cabeças de coisa nenhuma.
    const pecas = [];
    if (cabeca) {
        for (const filho of cabeca.children) {
            const c = caixa(filho);
            if (c) pecas.push({ nome: filho.name || '(sem nome)', tipo: filho.type,
                visivel: filho.visible, y0: c.y0, y1: c.y1, larg: c.larg, alt: c.alt, fund: c.fund });
        }
    }
    // ── FATIAS DO CORPO ─────────────────────────────────────────────────────
    // A largura da caixa inteira mede os BRAÇOS ABERTOS, não o corpo. Um model
    // sheet quer ombro, cintura e pé, e isso são fatias de altura.
    const todos = [];
    raiz.traverse((o) => {
        const g = o.geometry;
        if (!g?.attributes?.position || o.visible === false) return;
        o.updateWorldMatrix(true, false);
        const pos = g.attributes.position, e = o.matrixWorld.elements;
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
            todos.push([
                e[0]*px + e[4]*py + e[8]*pz + e[12],
                e[1]*px + e[5]*py + e[9]*pz + e[13],
                e[2]*px + e[6]*py + e[10]*pz + e[14],
            ]);
        }
    });
    let lo = 1e9, hi = -1e9;
    for (const q of todos) { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; }
    const N = 16, fatias = [];
    for (let k = 0; k < N; k++) {
        const a = lo + (hi - lo) * (k / N), b = lo + (hi - lo) * ((k + 1) / N);
        let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,n=0;
        for (const q of todos) {
            if (q[1] < a || q[1] >= b) continue;
            if (q[0]<x0)x0=q[0]; if (q[0]>x1)x1=q[0];
            if (q[2]<z0)z0=q[2]; if (q[2]>z1)z1=q[2]; n++;
        }
        fatias.push(n ? { y0: a, y1: b, larg: x1-x0, fund: z1-z0, n } : { y0: a, y1: b, n: 0 });
    }
    return { todo: caixa(raiz), cabecaComChifre: cabeca ? caixa(cabeca) : null, pecas, fatias };
});
ponte.fechar(); await b.close();

const r3 = (n) => Math.round(n * 1000) / 1000;
if (!m || !m.todo) { console.log('SEM MEDIDA', JSON.stringify(m)); process.exit(1); }
const T = m.todo, C = m.cabecaComChifre;
console.log('\n── A CAIXA DELE, EM METROS DE MUNDO ──');
console.log(`corpo inteiro   larg ${r3(T.larg)}  alt ${r3(T.alt)}  fund ${r3(T.fund)}`);
console.log(`                y de ${r3(T.y0)} a ${r3(T.y1)}`);
if (C) {
    console.log(`cabeça (escult) larg ${r3(C.larg)}  alt ${r3(C.alt)}  fund ${r3(C.fund)}`);
    console.log(`                y de ${r3(C.y0)} a ${r3(C.y1)}`);
    // O CRÂNIO, não o grupo. O grupo inclui chifre, e num model sheet chifre não
    // é cabeça — contar com ele dá uma altura em cabeças que não é de nada.
    // Ele sai das peças: é a maior delas em volume.
    const cr = (m.pecas ?? []).slice().sort((a, b) =>
        (b.larg * b.alt * b.fund) - (a.larg * a.alt * a.fund))[0];
    if (cr) {
        console.log(`crânio (só ele) larg ${r3(cr.larg)}  alt ${r3(cr.alt)}  fund ${r3(cr.fund)}`);
        console.log(`                y de ${r3(cr.y0)} a ${r3(cr.y1)}`);
        console.log('\n── EM CABEÇAS (crânio, sem chifre) ──');
        console.log(`altura sem chifre  ${r3((cr.y1 - T.y0) / cr.alt)} cabeças`);
        console.log(`altura com chifre  ${r3(T.alt / cr.alt)} cabeças`);
        console.log(`queixo ao chão     ${r3((cr.y0 - T.y0) / cr.alt)} cabeças`);
        console.log(`crânio: fund/larg  ${r3(cr.fund / cr.larg)}   (1 = redondo, <1 = chapado)`);
    }
}
console.log('\n── O CORPO EM FATIAS (largura x profundidade por faixa de altura) ──');
for (const q of (m.fatias ?? [])) {
    if (!q.n) { console.log(`y ${r3(q.y0)}..${r3(q.y1)}  (vazio)`); continue; }
    console.log(`y ${String(r3(q.y0)).padStart(6)}..${String(r3(q.y1)).padEnd(6)}`
        + `  larg ${String(r3(q.larg)).padStart(6)}  fund ${String(r3(q.fund)).padStart(6)}`);
}

console.log('\n── AS PEÇAS DA CABEÇA, DA MAIS ALTA PARA A MAIS BAIXA ──');
for (const q of (m.pecas ?? []).sort((a, b) => b.y1 - a.y1)) {
    console.log(`${(q.nome || q.tipo).padEnd(22)} y ${r3(q.y0)}..${r3(q.y1)}`
        + `  larg ${r3(q.larg)} alt ${r3(q.alt)} fund ${r3(q.fund)}`
        + (q.visivel ? '' : '   [invisível]'));
}
