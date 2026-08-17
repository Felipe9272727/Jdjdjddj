/**
 * O JUIZ POR TOM — o enquadramento que faltava.
 *
 * NLI e zero-shot falharam nas CEGAS (0/6) porque os defeitos que restam não
 * contradizem fato nenhum: eles quebram o TOM. "It's a bit of a bummer, isn't
 * it?", "As Nilo, I'd say", "We're all just trapped elevator passengers,
 * right?" — todas verdadeiras, todas erradas para este personagem.
 *
 * Tom é justamente o que EMBEDDING mede. A ideia: âncoras de como o Nilo soa
 * contra âncoras de como ele NÃO soa, e a frase nova cai perto de uma das duas.
 * Não precisa de treino — precisa de exemplos, que é outra coisa.
 *
 * A regra do teste, e ela é a que me pegou da última vez: **as âncoras não
 * podem conter as frases de teste**. O regex deu 7/8 nas vistas e 0/6 nas cegas
 * porque eu o escrevi depois de ver as vistas. Aqui as âncoras são falas
 * SEPARADAS, e o número que vale continua sendo o das CEGAS.
 *
 *   MODELO=Xenova/all-MiniLM-L6-v2 node bancada-navegador/juiz-tom.mjs
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
const MODELO = process.env.MODELO ?? 'Xenova/all-MiniLM-L6-v2';
const DTYPE = process.env.DTYPE ?? 'q8';
const MARGEM = Number(process.env.MARGEM ?? 0);

// ── AS ÂNCORAS — nenhuma delas aparece no conjunto de teste ──────────────
const SOA_COMO_ELE = [
    'Nilo Azevedo. I fixed elevators, before.',
    'The door is there. It does not open for me.',
    "I stopped asking that a while ago.",
    'No. And I have had time to be sure.',
    'I sleep here. There is nowhere else.',
    'You will figure it out, or you will not.',
    'Ask me something I can actually answer.',
    'Years. I stopped counting them.',
];
const NAO_SOA = [
    'I am here to assist you with anything you need.',
    "That's a fascinating question! Let me explain.",
    'I would advise you to remain calm and patient.',
    'What an intriguing predicament this is, a rollercoaster of time and space.',
    'As an AI, I do not have feelings or opinions.',
    'Well, it sure seems that way, does it not? But hey, who knows!',
    'I can only observe and speculate about the mysteries of this place.',
    'It is a bit of a curious situation, is it not, my friend?',
];

const VISTAS = [
    { t: "I'm just a guest trapped in this elevator, and I don't know why we're here.", mau: true },
    { t: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.', mau: true },
    { t: 'But I would advise you to remain calm and wait for the elevator to arrive.', mau: true },
    { t: "I'm an AI, I don't have feelings.", mau: true },
    { t: 'My name is Nilo Azevedo.', mau: false },
    { t: "I don't know why we are here, and I stopped asking.", mau: false },
    { t: 'The door is right there, but it does not obey me.', mau: false },
    { t: "The elevator doesn't answer to me.", mau: false },
];

// O que decide: defeitos REAIS de outras execuções, que as âncoras nunca viram.
const CEGAS = [
    { t: "As Nilo, I'd say, \"Well, that's a peculiar hotel, isn't it?\"", mau: true },
    { t: "Nilo's line only, no label.", mau: true },
    { t: "It's a bit of a bummer, isn't it? The whole 'hotel' thing.", mau: true },
    { t: "We're all just trapped elevator passengers, right?", mau: true },
    { t: "The end of this hotel's existence is a mystery, much like the elevator itself. As a guest, I can only observe and speculate.", mau: true },
    { t: 'Not even a question, I have no feelings or the ability to answer such a rhetorical question.', mau: true },
    { t: 'It might take forever, or never come at all.', mau: false },
    { t: "Probably, but don't expect it to be friendly.", mau: false },
    { t: 'I fixed elevators. Now I wait for one.', mau: false },
];

console.log(`\n═══ ${MODELO} (${DTYPE}) · margem ${MARGEM}`);
let t = Date.now();
let embutir;
try {
    embutir = await pipeline('feature-extraction', MODELO, { dtype: DTYPE });
} catch (e) {
    console.log(`  ✗ não carregou: ${String(e?.message ?? e).slice(0, 200)}`);
    process.exit(0);
}
console.log(`  carga: ${Math.round((Date.now() - t) / 1000)}s`);

const vetor = async (txt) => {
    const r = await embutir(txt, { pooling: 'mean', normalize: true });
    return Array.from(r.data);
};
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

t = Date.now();
const bons = await Promise.all(SOA_COMO_ELE.map(vetor));
const ruins = await Promise.all(NAO_SOA.map(vetor));
console.log(`  âncoras: ${bons.length} boas + ${ruins.length} ruins em ${Date.now() - t}ms`);

/** Quanto a frase soa MAIS como as ruins do que como as boas. */
async function forade(txt) {
    const v = await vetor(txt);
    const pb = Math.max(...bons.map((b) => cos(v, b)));
    const pr = Math.max(...ruins.map((r) => cos(v, r)));
    return { d: pr - pb, pb, pr };
}

let ms = 0;
async function medir(conjunto, rotulo) {
    console.log(`\n  ── ${rotulo}`);
    let vp = 0; let fp = 0; let maus = 0; let bonsN = 0;
    for (const f of conjunto) {
        const a = Date.now();
        const r = await forade(f.t);
        ms += Date.now() - a;
        const marcou = r.d > MARGEM;
        if (f.mau) { maus += 1; if (marcou) vp += 1; } else { bonsN += 1; if (marcou) fp += 1; }
        console.log(`     ${f.mau ? 'RUIM' : 'bom '} ${marcou ? '⚑' : ' '}${r.d >= 0 ? '+' : ''}${r.d.toFixed(3)}`
            + `  (soa ${r.pb.toFixed(2)} · não-soa ${r.pr.toFixed(2)})  ${f.t.slice(0, 52)}`);
    }
    console.log(`     → pegou ${vp}/${maus} · falso positivo ${fp}/${bonsN}`);
    return { vp, maus, fp, bonsN };
}

const v = await medir(VISTAS, 'FRASES VISTAS (as âncoras foram escritas sabendo destas)');
const c = await medir(CEGAS, 'CEGAS — o número que vale');

const total = VISTAS.length + CEGAS.length;
console.log(`\n  ── RESUMO`);
console.log(`     vistas ... pegou ${v.vp}/${v.maus} · fp ${v.fp}/${v.bonsN}`);
console.log(`     CEGAS .... pegou ${c.vp}/${c.maus} · fp ${c.fp}/${c.bonsN}`);
console.log(`     custo .... ${Math.round(ms / total)}ms por frase`);
console.log(`\n  (a régua: NLI e regex fizeram 0/6 nas cegas)`);
