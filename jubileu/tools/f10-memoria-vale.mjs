/**
 * O NILO RESPONDE MELHOR COM A MEMÓRIA SEMÂNTICA? — a única pergunta que importa.
 *
 * A busca do cânone era por PALAVRA. Medido: de 12 perguntas naturais em
 * português, 8 não recuperam fato nenhum e 2 recuperam o fato errado. Quando
 * nada é recuperado, o 3B responde só com a persona — e é daí que saem as
 * invenções ("lembro que VOCÊ era um ex-técnico de elevadores").
 *
 * Medir "o fato certo foi encontrado" não prova nada sobre o jogo: o que decide
 * é se a FALA do Nilo melhora. Então esta sonda roda o SmolLM3 DUAS VEZES por
 * pergunta, no mesmo navegador, usando O CÓDIGO DO JOGO nos dois lados:
 *
 *   SEM  — `buildFloor10SystemPrompt` sem o fato lembrado (busca por palavra)
 *   COM  — o mesmo montador recebendo o que `lembrarPorSignificado` escolheu
 *
 * e imprime as duas falas lado a lado, para dar para julgar lendo.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-memoria-vale.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const FALA = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;
const MEMORIA = process.env.F10_MEMORY_MODEL ?? `${BASE}/models/gemma-embed.gguf`;

const PERGUNTAS = [
    'O que te trouxe pra cá?',
    'Você já tentou ir embora?',
    'Quem manda nesse lugar?',
    'Você dorme?',
    'Faz quanto tempo que você tá preso?',
    'O que te assusta?',
];

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

// ── ETAPA 1: o que a memória do JOGO escolhe? ─────────────────────────────
console.log('▸ carregando o modelo de memória (333 MB)…');
const escolhas = await page.evaluate(async ({ memoria, perguntas }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    const mem = await import('/src/npc/floor10Memoria.ts');
    const canon = await import('/src/npc/floor10Canon.ts');
    const engine = new mod.Wllama(
        { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true },
    );
    await engine.loadModelFromUrl(memoria, {
        ...mem.FLOOR10_MEMORIA_LOAD_CONFIG, n_threads: 4,
    });
    // O MESMO caminho do jogo: a sonda só empresta o motor já carregado.
    mem.__setMemoriaEngineForProbes(engine);
    const saida = [];
    for (const q of perguntas) {
        const t = performance.now();
        const lembrado = await mem.lembrarPorSignificado(q);
        const [lex] = canon.retrieveFloor10Canon(q, 1);
        saida.push({
            q,
            ms: Math.round(performance.now() - t),
            lembrado,
            lexical: lex ? lex.id : null,
        });
    }
    mem.__setMemoriaEngineForProbes(null);
    try { await engine.exit(); } catch { /* já morreu */ }
    return saida;
}, { memoria: MEMORIA, perguntas: PERGUNTAS });

console.log('\n── QUEM CADA BUSCA ESCOLHE ──');
for (const e of escolhas) {
    console.log(`  "${e.q}"  (${e.ms}ms)`);
    console.log(`      por palavra:     ${e.lexical ?? 'NADA'}`);
    console.log(`      por significado: ${e.lembrado
        ? `${e.lembrado.id}  (${e.lembrado.score.toFixed(3)})`
        : 'abaixo do piso'}`);
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
        // Os dois prompts saem do MESMO montador do jogo. A única diferença é
        // o quinto argumento: o fato que a memória lembrou.
        const semSys = eng.prepareFloor10SystemPrompt(
            canon.buildFloor10SystemPrompt(e.q, []),
        );
        const comSys = eng.prepareFloor10SystemPrompt(
            canon.buildFloor10SystemPrompt(e.q, [], undefined, undefined, e.lembrado),
        );
        out.push({
            q: e.q,
            mudou: semSys !== comSys,
            sem: await responder(semSys, e.q),
            com: await responder(comSys, e.q),
        });
    }
    try { await engine.exit(); } catch { /* já morreu */ }
    return out;
}, { fala: FALA, escolhas });

console.log('\n══ O NILO RESPONDENDO ══');
for (const f of falas) {
    console.log(`\n● "${f.q}"${f.mudou ? '' : '   (prompt idêntico nos dois lados)'}`);
    console.log(`   SEM memória: ${f.sem.replace(/\s+/g, ' ')}`);
    console.log(`   COM memória: ${f.com.replace(/\s+/g, ' ')}`);
}
await browser.close();
