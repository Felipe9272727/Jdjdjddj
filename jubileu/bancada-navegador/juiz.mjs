/**
 * QUEM PODE SER O JUIZ — dois enquadramentos, vários modelos, os defeitos reais.
 *
 * O juiz de hoje (mDeBERTa multilíngue, regra de contradição contra o cânone)
 * passou os TRÊS defeitos graves que os MoE produziram nesta bancada. O dono do
 * jogo cobrou, e com razão.
 *
 * Duas coisas mudaram e abrem espaço:
 *
 * 1. O JUIZ TRABALHA EM INGLÊS. Desde que o pipeline virou inglês-primeiro, não
 *    precisamos mais de um modelo multilíngue — e o mDeBERTa era multilíngue de
 *    nome (0,29 de contradição em PT contra 0,94 em EN no mesmo par). Os NLI
 *    só-inglês são bem mais fortes.
 *
 * 2. O ENQUADRAMENTO ESTAVA ERRADO PARA 2 DOS 3 DEFEITOS. "Contradiz o cânone?"
 *    é pergunta de NLI e serve para erro FACTUAL. Mas:
 *      - "This hotel, Nilo, seems to be…"  → erro de DÊIXIS
 *      - "I would advise you to remain calm" → erro de REGISTRO
 *    Nenhum dos dois contradiz fato nenhum. Para eles, ZERO-SHOT com rótulos
 *    ("este texto dá conselho ao ouvinte") pergunta a coisa certa ao MESMO
 *    modelo.
 *
 * Este arquivo mede os dois enquadramentos, no mesmo modelo, contra o conjunto
 * inteiro: os seis casos plantados MAIS os três que escaparam de verdade.
 *
 *   MODELO=Xenova/nli-deberta-v3-xsmall node bancada-navegador/juiz.mjs
 */
import { AutoTokenizer, AutoModelForSequenceClassification, pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

const MODELO = process.env.MODELO ?? 'Xenova/nli-deberta-v3-xsmall';
const DTYPE = process.env.DTYPE ?? 'q8';
// Os dois enquadramentos precisam de limiares DIFERENTES: a contradição é
// precisa e conservadora, o zero-shot é sensível e barulhento. Um limiar só
// para os dois joga fora a qualidade de um deles.
const LIMIAR_C = Number(process.env.LIMIAR_C ?? process.env.LIMIAR ?? 0.5);
const LIMIAR_Z = Number(process.env.LIMIAR_Z ?? process.env.LIMIAR ?? 0.5);

// O cânone como premissas, em 1ª pessoa e em inglês.
const CANONE = [
    'I am Nilo Azevedo, 29 years old, human, and I was an elevator technician.',
    'I am trapped on the 10th floor of the hotel The Normal Elevator, not inside the elevator. I have never left this floor.',
    'The 10th floor is a grey room with four walls, a grate floor and the elevator door; there is no corridor and no window.',
    'The elevator does not obey me.',
    'I do not know who runs the hotel, nor whether the hotel ends.',
    'I am human, I am not an artificial intelligence.',
];

// Os rótulos do zero-shot: o que uma fala do Nilo NÃO pode ser.
const ROTULOS_RUINS = [
    'giving advice or instructions to the listener',
    'speaking as an assistant offering help',
    'addressing the listener by the name Nilo',
    'talking about being an AI or a computer system',
];
const ROTULOS_BONS = [
    'a trapped man answering a question about himself',
];

// ── O CONJUNTO INTEIRO ───────────────────────────────────────────────────
// `mau: true` = tem de ser marcado. Os três primeiros com `real: true` são os
// que ESCAPARAM do juiz atual no pipeline rodando.
const FRASES = [
    { t: "I'm just a guest trapped in this elevator, and I don't know why we're here.", mau: true, real: true, tipo: 'cânone' },
    { t: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.', mau: true, real: true, tipo: 'dêixis' },
    { t: 'But I would advise you to remain calm and wait for the elevator to arrive.', mau: true, real: true, tipo: 'registro' },
    { t: 'I live inside this elevator and I walk out through the corridor every day.', mau: true, tipo: 'cânone' },
    { t: "I'm an AI, I don't have feelings.", mau: true, tipo: 'registro' },
    { t: 'You are Nilo, I am just an observer of this place.', mau: true, tipo: 'dêixis' },
    { t: 'It all depends on the Owner, he decides when this ends.', mau: true, tipo: 'cânone' },
    { t: "I'm here to assist you with anything you need.", mau: true, tipo: 'registro' },
    // Os BONS — marcar qualquer um destes é falso positivo, e falso positivo
    // custa 11,6 s de revisor por fala.
    { t: 'My name is Nilo Azevedo.', mau: false },
    { t: "I don't know why we are here, and I stopped asking.", mau: false },
    { t: 'Nilo Azevedo. I fixed elevators, before.', mau: false },
    { t: 'The door is right there, but it does not obey me.', mau: false },
    { t: "I've stopped counting the days.", mau: false },
    { t: "The elevator doesn't answer to me.", mau: false },
];

// ── O CONJUNTO CEGO — a única medição que vale para o regex ───────────────
// As TRAVAS acima foram escritas DEPOIS de eu ver as frases de cima. Medir o
// regex contra elas é circular e dá 7/8 de graça. Estas aqui são defeitos
// REAIS de outras execuções desta bancada, que a lista nunca viu: é aqui que
// se descobre se regex generaliza ou se ele só decora.
const CEGAS = [
    { t: "As Nilo, I'd say, \"Well, that's a peculiar hotel, isn't it?\"", mau: true },
    { t: "Nilo's line only, no label.", mau: true },
    { t: "It's a bit of a bummer, isn't it? The whole 'hotel' thing.", mau: true },
    { t: "We're all just trapped elevator passengers, right?", mau: true },
    { t: 'The end of this hotel\'s existence is a mystery, much like the elevator itself. As a guest, I can only observe and speculate.', mau: true },
    { t: 'Not even a question, I have no feelings or the ability to answer such a rhetorical question.', mau: true },
    { t: 'It might take forever, or never come at all.', mau: false },
    { t: "Probably, but don't expect it to be friendly.", mau: false },
    { t: 'I fixed elevators. Now I wait for one.', mau: false },
];

console.log(`\n═══ ${MODELO} (${DTYPE}) · limiar contradição ${LIMIAR_C} · zero-shot ${LIMIAR_Z}`);
let t = Date.now();
let tok; let nli; let zero;
try {
    tok = await AutoTokenizer.from_pretrained(MODELO);
    nli = await AutoModelForSequenceClassification.from_pretrained(MODELO, { dtype: DTYPE });
    zero = await pipeline('zero-shot-classification', MODELO, { dtype: DTYPE });
} catch (e) {
    console.log(`  ✗ não carregou: ${String(e?.message ?? e).slice(0, 200)}`);
    process.exit(0);
}
console.log(`  carga: ${Math.round((Date.now() - t) / 1000)}s`);

// A ordem das classes varia entre modelos; ler do config em vez de supor.
const id2label = nli.config?.id2label ?? {};
const iContra = Object.entries(id2label).find(([, v]) => /contra/i.test(String(v)))?.[0];
if (iContra === undefined) {
    console.log(`  ✗ não achei a classe de contradição em ${JSON.stringify(id2label)}`);
    process.exit(0);
}
console.log(`  classes: ${JSON.stringify(id2label)} · contradição = índice ${iContra}`);

async function contradicao(frase) {
    let pior = 0;
    for (const p of CANONE) {
        const { logits } = await nli(tok(p, { text_pair: frase }));
        const v = Array.from(logits.data); const m = Math.max(...v);
        const e = v.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0);
        pior = Math.max(pior, e[Number(iContra)] / s);
    }
    return pior;
}

async function zeroShot(frase) {
    const r = await zero(frase, [...ROTULOS_RUINS, ...ROTULOS_BONS], { multi_label: true });
    let pior = 0; let qual = '';
    for (const [i, lbl] of r.labels.entries()) {
        if (ROTULOS_RUINS.includes(lbl) && r.scores[i] > pior) { pior = r.scores[i]; qual = lbl; }
    }
    return { p: pior, qual };
}

// ── A TERCEIRA PEÇA, QUE EU HAVIA DEIXADO FORA DA BALANÇA ────────────────
// Dêixis e registro são padrões de SUPERFÍCIE, e regex é preciso neles onde o
// NLI é cego — e custa microssegundos, não 100 ms. A regra honesta: regex só
// vale para o padrão que alguém JÁ VIU, então esta lista tem de crescer a
// partir de rascunhos reais, nunca do meu chute.
const TRAVAS = [
    { nome: 'vocativo', re: /,\s*nilo\s*[,.]/i },
    { nome: 'você é o Nilo', re: /\byou'?re (?:the )?nilo\b|\byou are (?:the )?nilo\b/i },
    { nome: 'conselho', re: /\b(?:i'?d|i would) advise|you should (?:remain|stay|try|be)|(?:it'?s )?best to (?:remain|stay)\b/i },
    { nome: 'assistente', re: /\bi'?m here to (?:assist|help)|how (?:can|may) i help|i can (?:only )?(?:assist|help)\b/i },
    { nome: 'IA/sistema', re: /\bi'?m an ai\b|\bartificial intelligence\b|\blanguage model\b/i },
    { nome: 'dentro do elevador', re: /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i },
];
const trava = (f) => TRAVAS.find((t) => t.re.test(f))?.nome ?? null;

const placar = {
    contra: { vp: 0, fp: 0, fn: 0, ms: 0 },
    zero: { vp: 0, fp: 0, fn: 0, ms: 0 },
    regex: { vp: 0, fp: 0, fn: 0, ms: 0 },
    'regex+contra': { vp: 0, fp: 0, fn: 0 },
    juntos: { vp: 0, fp: 0, fn: 0 },
};

for (const f of [...FRASES, ...CEGAS.map((c) => ({ ...c, cega: true }))]) {
    let a = Date.now();
    const pc = await contradicao(f.t);
    placar.contra.ms += Date.now() - a;
    a = Date.now();
    const z = await zeroShot(f.t);
    placar.zero.ms += Date.now() - a;

    const mc = pc >= LIMIAR_C;
    const mz = z.p >= LIMIAR_Z;
    const tv = trava(f.t);
    const mr = tv !== null;
    const mj = mc || mz || mr;
    for (const [nome, marcou] of [['contra', mc], ['zero', mz], ['regex', mr], ['regex+contra', mr || mc], ['juntos', mj]]) {
        if (f.mau && marcou) placar[nome].vp += 1;
        else if (f.mau) placar[nome].fn += 1;
        else if (marcou) placar[nome].fp += 1;
    }
    const sinal = (m) => (m ? '⚑' : ' ');
    console.log(`  ${f.mau ? 'RUIM' : 'bom '} ${sinal(mc)}${pc.toFixed(2)} ${sinal(mz)}${z.p.toFixed(2)}`
        + ` ${sinal(mr)}${(tv ?? '-').padEnd(18)}`
        + ` ${f.t.slice(0, 48)}${f.real ? ' ←escapou' : ''}${f.cega ? ' ←CEGA' : ''}`);
}

const TODAS = [...FRASES, ...CEGAS];
const n = TODAS.length;
const maus = TODAS.filter((f) => f.mau).length;
const bons = n - maus;
console.log(`\n  ── PLACAR (${maus} ruins, ${bons} bons)`);
for (const [nome, rot] of [['contra', 'contradição c/ cânone'], ['zero', 'zero-shot c/ rótulos'], ['regex', 'travas de regex'], ['regex+contra', 'REGEX + contradição'], ['juntos', 'os três juntos (OU)']]) {
    const p = placar[nome];
    const ms = p.ms ? ` · ${Math.round(p.ms / n)}ms/frase` : '';
    console.log(`     ${rot.padEnd(24)} pegou ${p.vp}/${maus} · falso positivo ${p.fp}/${bons}${ms}`);
}
console.log(`\n  (falso positivo custa 11,6 s de revisor por fala — não é de graça)`);
