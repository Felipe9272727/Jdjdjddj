/**
 * O NILO RESPONDE MELHOR COM A MEMÓRIA SEMÂNTICA? — a única pergunta que importa.
 *
 * A busca do cânone é por PALAVRA. Medido: de 12 perguntas naturais em
 * português, 8 não recuperam fato nenhum e 2 recuperam o fato errado. Quando
 * nada é recuperado, o 3B responde só com a persona — e é daí que saem as
 * invenções ("lembro que VOCÊ era um ex-técnico de elevadores").
 *
 * A proposta é um modelo de embedding de 132 MB escolhendo o fato por
 * SIGNIFICADO. Mas medir "o fato certo foi encontrado" não prova nada sobre o
 * jogo: o que decide é se a FALA do Nilo melhora.
 *
 * Então esta sonda roda o SmolLM3 DUAS VEZES por pergunta, no mesmo navegador:
 *   SEM  — exatamente o prompt de hoje (busca lexical, quase sempre sem fato)
 *   COM  — o mesmo prompt, com o fato escolhido por significado
 * e imprime as duas falas lado a lado, para dar para julgar lendo.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-memoria-vale.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const FALA = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;
const EMBED = process.env.F10_EMBED_MODEL ?? `${BASE}/models/e5-small.gguf`;

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn }) => { window.__wllamaCdn = cdn; },
    { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama` });
await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

// ── ETAPA 1: quem o modelo de significado escolhe? ────────────────────────
console.log('▸ carregando o modelo de embedding (132 MB)…');
const escolhas = await page.evaluate(async ({ embed }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    const canon = await import('/src/npc/floor10Canon.ts');
    const engine = new mod.Wllama(
        { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true },
    );
    await engine.loadModelFromUrl(embed, {
        n_ctx: 512, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        embeddings: true, pooling_type: 'mean',
    });

    const vetor = async (texto) => {
        const r = await engine.createEmbedding(texto);
        const v = Array.isArray(r) ? r : (r?.data?.[0]?.embedding ?? r?.embedding ?? []);
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
    };
    const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

    // Os 10 fatos viram vetor UMA vez. Em jogo isso aconteceria na carga.
    const fatos = [];
    for (const f of canon.FLOOR10_CANON) {
        // "passage:" é o prefixo que o e5 espera para documentos.
        fatos.push({ id: f.id, fact: f.fact, v: await vetor(`passage: ${f.fact}`) });
    }

    const PERGUNTAS = [
        'O que te trouxe pra cá?',
        'Você já tentou ir embora?',
        'Quem manda nesse lugar?',
        'Você dorme?',
        'Faz quanto tempo que você tá preso?',
        'O que te assusta?',
    ];
    const out = [];
    for (const q of PERGUNTAS) {
        const qv = await vetor(`query: ${q}`);
        let melhor = null;
        for (const f of fatos) {
            const s = cos(qv, f.v);
            if (!melhor || s > melhor.score) melhor = { id: f.id, fact: f.fact, score: s };
        }
        const [lex] = canon.retrieveFloor10Canon(q, 1);
        out.push({ q, semantico: melhor, lexical: lex ? lex.id : null });
    }
    try { await engine.exit(); } catch { /* já morreu */ }
    return out;
}, { embed: EMBED });

console.log('\n── QUEM CADA BUSCA ESCOLHE ──');
for (const e of escolhas) {
    console.log(`  "${e.q}"`);
    console.log(`      por palavra:     ${e.lexical ?? 'NADA'}`);
    console.log(`      por significado: ${e.semantico.id}  (${e.semantico.score.toFixed(3)})`);
}

// ── ETAPA 2: o Nilo responde, com e sem ───────────────────────────────────
console.log('\n▸ carregando o SmolLM3-3B e gerando as falas (demora)…');
const falas = await page.evaluate(async ({ fala, escolhas }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    const canon = await import('/src/npc/floor10Canon.ts');
    const eng = await import('/src/npc/wllamaEngine.ts');
    const engine = new mod.Wllama(
        { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true },
    );
    await engine.loadModelFromUrl(fala, {
        n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        cache_type_k: 'q8_0', cache_type_v: 'q8_0',
        jinja: true, reasoning: false,
        default_template_kwargs: { enable_thinking: false }, warmup: true,
    });

    const responder = async (sys, q) => {
        let texto = '';
        const stream = await engine.createChatCompletion({
            messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
            stream: true, max_tokens: 96, temperature: 0.45, top_p: 0.85, top_k: 40,
            penalty_repeat: 1.15, penalty_last_n: 256, cache_prompt: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        for await (const c of stream) {
            const d = c?.choices?.[0]?.delta?.content;
            if (d) texto += d;
        }
        return texto.trim();
    };

    const out = [];
    for (const e of escolhas) {
        // SEM: exatamente o prompt de hoje.
        const semSys = eng.prepareFloor10SystemPrompt(
            canon.buildFloor10SystemPrompt(e.q, []),
        );
        // COM: o mesmo prompt, mas com o fato achado por significado. Uso o
        // MESMO enquadramento do jogo, para a comparação ser só sobre QUAL
        // fato chegou — não sobre como ele foi apresentado.
        const comSys = `${semSys}\n\nSUA MEMÓRIA (verdadeira, é você mesmo; conte na primeira pessoa, com suas palavras): ${e.semantico.fact}`;
        out.push({
            q: e.q,
            sem: await responder(semSys, e.q),
            com: await responder(comSys, e.q),
        });
    }
    try { await engine.exit(); } catch { /* já morreu */ }
    return out;
}, { fala: FALA, escolhas });

console.log('\n══ O NILO RESPONDENDO ══');
for (const f of falas) {
    console.log(`\n● "${f.q}"`);
    console.log(`   SEM memória: ${f.sem.replace(/\s+/g, ' ')}`);
    console.log(`   COM memória: ${f.com.replace(/\s+/g, ' ')}`);
}
await browser.close();
