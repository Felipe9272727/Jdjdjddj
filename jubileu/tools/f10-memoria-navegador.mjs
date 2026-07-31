/**
 * A MEMÓRIA POR SIGNIFICADO RODA NO NAVEGADOR? — a prova que falta.
 *
 * `f10-memoria-prova.mjs` mediu 11/12 contra 2/12 da busca lexical, mas rodou
 * em Node, com @huggingface/transformers (ONNX). Isso prova o MODELO, não o
 * caminho: no jogo não existe ONNX, existe wllama. Antes de instalar qualquer
 * coisa, esta sonda responde três perguntas no navegador de verdade:
 *
 *   1. o wllama CARREGA um modelo de embedding (BERT/e5) e devolve vetor?
 *   2. os 11/12 se mantêm com o mesmo GGUF que o jogo baixaria?
 *   3. quanto CUSTA — carga, os 10 fatos e cada pergunta — em CPU?
 *
 * O item 3 é o que decide: se embutir o vetor da pergunta atrasar a fala em
 * mais do que uns poucos décimos, a memória semântica não vale o preço.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-memoria-navegador.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const EMBED = process.env.F10_EMBED_MODEL ?? `${BASE}/models/e5-small.gguf`;
// O e5 exige os prefixos "query:"/"passage:"; o granite não usa nenhum.
const PREFIXO = process.env.F10_EMBED_PREFIX ?? 'e5';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('▸') || t.startsWith('  ')) console.log(t);
});
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 300)));
await page.addInitScript(({ cdn }) => { window.__wllamaCdn = cdn; },
    { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama` });
await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

const r = await page.evaluate(async ({ embed, prefixo }) => {
    const doc = (t) => (prefixo === 'e5' ? `passage: ${t}`
        : prefixo === 'gemma' ? `title: none | text: ${t}` : t);
    const ask = (t) => (prefixo === 'e5' ? `query: ${t}`
        : prefixo === 'gemma' ? `task: search result | query: ${t}` : t);
    const mod = await import(window.__wllamaCdn + '/index.js');
    const canon = await import('/src/npc/floor10Canon.ts');
    const engine = new mod.Wllama(
        { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true },
    );
    const t0 = performance.now();
    await engine.loadModelFromUrl(embed, {
        n_ctx: 512, n_batch: 512, n_threads: 2, n_gpu_layers: 0,
        embeddings: true, pooling_type: 'mean',
    });
    const carga = performance.now() - t0;
    console.log(`▸ carregou em ${(carga / 1000).toFixed(1)}s`);

    // ATENÇÃO: `input` é OBRIGATÓRIO como objeto. Passando a string crua o
    // wllama a lê como lista de TOKENS e o worker morre com
    // "Invalid typed array length: 1163217991" — que é o texto virando número.
    const vetor = async (texto) => {
        const raw = await engine.createEmbedding({ input: texto });
        const v = Array.isArray(raw)
            ? raw
            : (raw?.data?.[0]?.embedding ?? raw?.embedding ?? []);
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
    };
    const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

    const primeiro = await vetor(doc('teste'));
    if (!primeiro.length) return { erro: 'createEmbedding devolveu vazio', dims: 0 };

    const tFatos = performance.now();
    const fatos = [];
    for (const f of canon.FLOOR10_CANON) {
        fatos.push({ id: f.id, v: await vetor(doc(f.fact)) });
    }
    const msFatos = performance.now() - tFatos;

    // As MESMAS 12 perguntas da prova em Node.
    const CASOS = [
        ['Você tem saudade de alguém?', ['memory', 'past', 'personality']],
        ['Cê lembra de antes?', ['past', 'memory']],
        ['Como você veio parar aqui?', ['past']],
        ['O que te trouxe pra cá?', ['past']],
        ['Você já tentou ir embora?', ['escape', 'elevator']],
        ['Dá pra fugir daqui?', ['escape']],
        ['Tem medo de quê?', ['personality', 'memory']],
        ['O que te assusta?', ['personality', 'memory']],
        ['Quem manda nesse lugar?', ['hotel', 'owner-archivist']],
        ['Alguém construiu isso?', ['hotel', 'owner-archivist']],
        ['Faz quanto tempo que você tá preso?', ['floor10']],
        ['Você dorme?', ['floor10', 'memory']],
    ];
    const linhas = [];
    let acertos = 0;
    let lexicais = 0;
    const temposPergunta = [];
    for (const [q, aceitos] of CASOS) {
        const t = performance.now();
        const qv = await vetor(ask(q));
        temposPergunta.push(performance.now() - t);
        const rank = fatos
            .map((f) => ({ id: f.id, s: cos(qv, f.v) }))
            .sort((a, b) => b.s - a.s);
        const [lex] = canon.retrieveFloor10Canon(q, 1);
        const ok = aceitos.includes(rank[0].id);
        const okLex = lex ? aceitos.includes(lex.id) : false;
        if (ok) acertos += 1;
        if (okLex) lexicais += 1;
        linhas.push({
            q, ok, okLex,
            semantico: rank[0].id, score: rank[0].s, segundo: rank[1].id,
            lexical: lex ? lex.id : null,
        });
    }
    try { await engine.exit(); } catch { /* já morreu */ }
    return {
        dims: primeiro.length,
        cargaMs: carga,
        fatosMs: msFatos,
        perguntaMs: temposPergunta.reduce((a, b) => a + b, 0) / temposPergunta.length,
        piorPerguntaMs: Math.max(...temposPergunta),
        acertos, lexicais, total: CASOS.length, linhas,
    };
}, { embed: EMBED, prefixo: PREFIXO });

if (r.erro) {
    console.log(`\n✘ ${r.erro}`);
    await browser.close();
    process.exit(1);
}

console.log(`\n── QUEM CADA BUSCA ESCOLHE (dim ${r.dims}) ──`);
for (const l of r.linhas) {
    console.log(` ${l.ok ? '✔' : '✘'} ${l.q.padEnd(38)} → ${l.semantico.padEnd(15)}`
        + `${l.score.toFixed(3)}  (2º ${l.segundo})`);
    console.log(`   ${l.okLex ? '✔' : '✘'} por palavra: ${l.lexical ?? 'NADA'}`);
}
console.log(`\nsignificado: ${r.acertos}/${r.total}    palavra: ${r.lexicais}/${r.total}`);
console.log('\n── O PREÇO (CPU, 2 threads) ──');
console.log(`  carga do modelo:      ${(r.cargaMs / 1000).toFixed(1)}s`);
console.log(`  os 10 fatos:          ${(r.fatosMs / 1000).toFixed(1)}s  (uma vez, na carga)`);
console.log(`  cada pergunta:        ${r.perguntaMs.toFixed(0)}ms  (pior: ${r.piorPerguntaMs.toFixed(0)}ms)`);
await browser.close();
