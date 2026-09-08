// ── PREVÊ ONDE CADA BOCA CAI NA CARA, SEM ABRIR NAVEGADOR ────────────────────
//
// Ajustar a caixa da boca custava cinco minutos de bancada por tentativa, e a
// pergunta é sempre a mesma desde que o dono do jogo disse "a bola preta inteira
// é o nariz": ESTA forma encosta no nariz?
//
// A régua é linear e está calibrada contra foto (`medir-a-cara.mjs`), então dá
// para responder em milissegundos. Uma calibração medida, e as vinte e sete
// formas de uma vez.
//
//   node bancada-navegador/onde-a-boca-cai.mjs
//
// A saída lista, para cada boca, a faixa que ela ocupa NO MEIO DA CARA (onde o
// nariz está) e nas PONTAS (onde há cara de sobra). Só o meio precisa passar
// por baixo do nariz.
import { BOCAS } from '../src/f3Boca.ts';

// ── A CARA, MEDIDA (`medir-a-cara.mjs` sobre a foto `?semboca&parado`) ───────
const OLHOS_ATE = 0.300;   // abaixo disto acabam os olhos
const NARIZ_DE = 0.083;    // a bola preta: 0,083 .. 0,244
const NARIZ_ATE = 0.244;
const QUEIXO = 0.020;      // abaixo disto é pescoço/corpo, preto
/** Meia-largura da bola, em fração da largura da cara. */
const NARIZ_MEIA_LARGURA = 0.09;

// ── A CALIBRAÇÃO ─────────────────────────────────────────────────────────────
// Duas fotos com `bocaY` separado por 0,05 deram 0,201 de deslocamento na régua
// da cara: 4,02 frações de cara por unidade do modelo. E com a caixa em
// 0,40 x 0,267 e centro em 0,610, o y=0 do desenho caiu em 0,249 da cara.
const FRACAO_POR_UNIDADE_DO_MODELO = 4.02;
const REF_CENTRO_Y = 0.610;
const REF_FRACAO = 0.249;
const REF_ALTURA_DA_CAIXA = 0.267;
const REF_FRACAO_POR_NORMALIZADO = 0.344;

export function reguaDaBoca(centroY, alturaDaCaixa) {
    const u = REF_FRACAO_POR_NORMALIZADO * (alturaDaCaixa / REF_ALTURA_DA_CAIXA);
    const zero = REF_FRACAO + (centroY - REF_CENTRO_Y) * FRACAO_POR_UNIDADE_DO_MODELO;
    return { zero, u, emCara: (yNorm) => zero + yNorm * u };
}

const centroY = Number(process.argv[2] ?? 0.589);
const altura = Number(process.argv[3] ?? 0.267);
const largura = Number(process.argv[4] ?? 0.40);
const r = reguaDaBoca(centroY, altura);

console.log(`caixa: ${largura} x ${altura}, centro ${centroY}`);
console.log(`o y=0 do desenho cai em ${r.zero.toFixed(3)} da cara; `
    + `1 unidade do desenho = ${r.u.toFixed(3)} de cara\n`);
console.log('boca                 meio(±nariz)      pontas          veredito');

let ruins = 0;
for (const [nome, f] of Object.entries(BOCAS)) {
    const pts = f.cheia ? f.caminho : f.traco;
    if (!pts.length) continue;
    const larguraDoDesenho = Math.max(...pts.map(p => p.x));
    // O "meio" é a faixa de x que a bola do nariz cobre. A bola tem meia-largura
    // de 0,09 da cara; o desenho tem `largura` do modelo de meia-largura.
    const meiaBolaEmDesenho = (NARIZ_MEIA_LARGURA * 2 * 0.329 / largura) * (1 / 0.74);
    const noMeio = pts.filter(p => Math.abs(p.x) <= meiaBolaEmDesenho * larguraDoDesenho);
    const alvo = noMeio.length ? noMeio : pts;
    const meioTopo = r.emCara(Math.max(...alvo.map(p => p.y)));
    const meioPe = r.emCara(Math.min(...alvo.map(p => p.y)));
    const pontaTopo = r.emCara(Math.max(...pts.map(p => p.y)));
    const pontaPe = r.emCara(Math.min(...pts.map(p => p.y)));

    // Os traços fechados são uma LINHA, e a linha tem espessura no desenho
    // (6 px de pincel num canvas de 128 ≈ 0,05 de cara). Some meia espessura.
    const grossura = f.cheia ? 0.012 : 0.030;

    const encostaNoNariz = meioTopo + grossura > NARIZ_DE;
    const entraNosOlhos = pontaTopo > OLHOS_ATE;
    const afundaNoCorpo = meioPe - grossura < QUEIXO - 0.06;
    const veredito = [
        encostaNoNariz ? 'ENCOSTA NO NARIZ' : '',
        entraNosOlhos ? 'sobe nos olhos' : '',
        afundaNoCorpo ? 'afunda no corpo' : '',
    ].filter(Boolean).join(', ') || 'ok';
    if (veredito !== 'ok') ruins++;
    console.log(`${nome.padEnd(20)} ${meioPe.toFixed(3)}..${meioTopo.toFixed(3)}    `
        + `${pontaPe.toFixed(3)}..${pontaTopo.toFixed(3)}   ${veredito}`);
}
console.log(`\nnariz: ${NARIZ_DE}..${NARIZ_ATE}   olhos acabam em ${OLHOS_ATE}   queixo ${QUEIXO}`);
console.log(ruins === 0 ? '✅ nenhuma boca encosta no nariz' : `❌ ${ruins} bocas com problema`);
