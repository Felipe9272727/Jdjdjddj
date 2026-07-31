/**
 * GERA OS VETORES DO CÂNONE — para o jogo não pagar 17s de CPU na abertura.
 *
 * Os 10 fatos do Nilo não mudam durante a partida. Embeddá-los no aparelho do
 * jogador custaria ~17s de CPU (medido, 2 threads) toda vez que ele entrasse no
 * andar, competindo com a fala. Como o texto é fixo, o vetor é fixo: dá para
 * calcular aqui, uma vez, e mandar pronto dentro do bundle.
 *
 * Cada vetor sai quantizado em int8 com uma escala — 768 bytes por fato em vez
 * de 3 KB, e a diferença no cosseno fica na quarta casa. Junto vai o HASH do
 * texto: se alguém editar um fato do cânone e esquecer de rodar esta ferramenta,
 * o jogo detecta a divergência e recalcula aquele fato sozinho, em vez de
 * responder com o vetor de um texto que já não existe.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-memoria-vetores.mjs
 * Saída: src/npc/floor10MemoriaVetores.ts
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const MODEL = process.env.F10_MEMORY_MODEL ?? `${BASE}/models/gemma-embed.gguf`;

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 300)));
await page.addInitScript(({ cdn }) => { window.__wllamaCdn = cdn; },
    { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama` });
await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

console.log('▸ carregando o modelo de memória…');
const saida = await page.evaluate(async ({ model }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    const canon = await import('/src/npc/floor10Canon.ts');
    const mem = await import('/src/npc/floor10Memoria.ts');
    const engine = new mod.Wllama({ default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true });
    await engine.loadModelFromUrl(model, {
        ...mem.FLOOR10_MEMORIA_LOAD_CONFIG, n_threads: 4,
    });
    const vetor = async (t) => {
        const r = await engine.createEmbedding({ input: t });
        const v = r?.data?.[0]?.embedding ?? [];
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
    };
    const fatos = [];
    for (const f of canon.FLOOR10_CANON) {
        fatos.push({
            id: f.id,
            hash: mem.hashDoFato(f),
            v: await vetor(mem.textoDoDocumento(f)),
        });
    }
    // Diagnóstico: quanto marca uma pergunta do assunto e quanto marca uma que
    // não tem nada a ver. É essa distância que justifica (ou não) um piso.
    const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const medir = async (q) => {
        const qv = await vetor(mem.textoDaPergunta(q));
        return Math.max(...fatos.map((f) => cos(qv, f.v)));
    };
    const dentro = [];
    for (const q of ['Como você veio parar aqui?', 'Dá pra fugir daqui?',
        'Tem medo de quê?', 'Você dorme?']) dentro.push([q, await medir(q)]);
    const fora = [];
    for (const q of ['asdkjh askjdh', 'qual a capital da França?',
        'me ensina a fazer bolo de cenoura', '2 + 2', 'oi', 'kkkkk'])
        fora.push([q, await medir(q)]);
    try { await engine.exit(); } catch { /* já morreu */ }
    return { fatos, dentro, fora, dim: fatos[0].v.length };
}, { model: MODEL });

console.log('\n── o que marca uma pergunta DO assunto ──');
for (const [q, s] of saida.dentro) console.log(`  ${s.toFixed(3)}  ${q}`);
console.log('── o que marca uma pergunta FORA do assunto ──');
for (const [q, s] of saida.fora) console.log(`  ${s.toFixed(3)}  ${q}`);

/** int8 com escala: 768 bytes por fato, erro no cosseno na 4ª casa. */
function quantizar(v) {
    const escala = Math.max(...v.map(Math.abs)) || 1;
    const bytes = Buffer.from(v.map((x) => Math.max(-127, Math.min(127,
        Math.round((x / escala) * 127)))).map((x) => x & 0xff));
    return { escala, base64: bytes.toString('base64') };
}

const linhas = saida.fatos.map((f) => {
    const { escala, base64 } = quantizar(f.v);
    return `    { id: '${f.id}', hash: ${f.hash}, escala: ${escala.toFixed(8)},\n`
        + `        v: '${base64}' },`;
}).join('\n');

const arquivo = `// GERADO POR tools/f10-memoria-vetores.mjs — não editar à mão.
//
// Os vetores do cânone, calculados com o MESMO modelo que o jogo baixa
// (${MODEL.split('/').pop()}), quantizados em int8 com escala. Estão aqui para o
// aparelho do jogador não gastar ~17s de CPU embeddando texto que nunca muda.
//
// Se você editar um fato em floor10Canon.ts, rode a ferramenta de novo. Se
// esquecer, o jogo percebe pelo \`hash\` e recalcula aquele fato sozinho.
export type VetorDoFato = {
    id: string;
    /** FNV-1a do título + texto, para detectar cânone editado. */
    hash: number;
    escala: number;
    /** int8 em base64, ${saida.dim} dimensões. */
    v: string;
};

export const FLOOR10_MEMORIA_DIM = ${saida.dim};

export const FLOOR10_MEMORIA_VETORES: readonly VetorDoFato[] = [
${linhas}
];
`;
fs.writeFileSync(new URL('../src/npc/floor10MemoriaVetores.ts', import.meta.url), arquivo);
console.log(`\n▸ gravado src/npc/floor10MemoriaVetores.ts `
    + `(${saida.fatos.length} fatos, ${saida.dim} dimensões)`);
await browser.close();
