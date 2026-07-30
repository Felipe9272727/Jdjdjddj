/**
 * QUANTO DÁ PARA ACELERAR O CÉREBRO DE FALA — medido, não teorizado.
 *
 * O relato foi "lê tokens em 2/s e fala com 1/s". A configuração de carga hoje
 * usa só n_ctx / n_batch / n_threads. O wllama 3.5.1 expõe MAIS botões que
 * ninguém tinha ligado, e cada um deles muda a conta na CPU:
 *
 *   flash_attn         — atenção em bloco: menos passes de memória por token
 *   cache_type_k/v     — KV em q8_0 em vez de f16: metade da banda de memória
 *   swa_full           — KV completo para as camadas de janela deslizante
 *   n_cache_reuse      — reaproveita pedaços do prefixo APÓS uma divergência
 *
 * Num celular a inferência é limitada por BANDA DE MEMÓRIA, não por conta —
 * então o que corta bytes lidos por token é o que costuma pagar. Esta sonda
 * roda o MESMO prompt em cada combinação e imprime prompt/s e fala/s do motor.
 *
 * Uso:
 *   CHROMIUM_PATH=... node tools/f10-velocidade.mjs
 *   (npm run dev servindo em :3000, modelo em public/models/smollm3-3b.gguf)
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;
const THREADS = Number(process.env.F10_THREADS ?? 4);

// Cada linha é uma carga completa do modelo. Mantive a lista curta de
// propósito: são ~2 min por configuração.
const KV8 = { cache_type_k: 'q8_0', cache_type_v: 'q8_0' };
const TODOS = {
    knobs: [
        { nome: 'hoje (nada ligado)', extra: {} },
        { nome: 'flash_attn', extra: { flash_attn: true } },
        { nome: 'KV em q8_0', extra: KV8 },
        { nome: 'flash_attn + KV q8_0', extra: { flash_attn: true, ...KV8 } },
    ],
    // O prefill mediu 3,2 tok/s — perto demais dos 2,2 da fala. Prefill é
    // matriz×matriz e deveria ser MUITO mais rápido que a fala; se não é, o
    // lote não está sendo aproveitado. Estes testes perguntam isso.
    lote: [
        { nome: 'n_batch 128', extra: { ...KV8, n_batch: 128 } },
        { nome: 'n_batch 512 (hoje)', extra: { ...KV8, n_batch: 512 } },
        { nome: 'n_batch 1024', extra: { ...KV8, n_batch: 1024 } },
    ],
};
const CONFIGS = TODOS[process.env.F10_SUITE ?? 'knobs'] ?? TODOS.knobs;

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
console.log('isolado:', await page.evaluate(() => crossOriginIsolated),
    '· hardwareConcurrency:', await page.evaluate(() => navigator.hardwareConcurrency),
    '· threads no teste:', THREADS);

const linhas = [];
for (const cfg of CONFIGS) {
    process.stdout.write(`\n▸ ${cfg.nome} … `);
    const r = await page.evaluate(async ({ modelo, extra, threads }) => {
        const t0 = Date.now();
        const mod = await import(window.__wllamaCdn + '/index.js');
        const engine = new mod.Wllama(
            { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
            { suppressNativeLog: true },
        );
        try {
            await engine.loadModelFromUrl(modelo, {
                n_ctx: 1536,
                n_batch: 512,
                n_threads: threads,
                // `extra` vem DEPOIS de propósito: é ele que sobrescreve.
                n_gpu_layers: 0,
                jinja: true,
                reasoning: false,
                default_template_kwargs: { enable_thinking: false },
                warmup: true,
                ...extra,
            });
        } catch (e) {
            return { erro: String(e).slice(0, 220) };
        }
        const carga = Date.now() - t0;
        // Um prompt do tamanho do de verdade (persona + pergunta), para o
        // prefill medido ser o prefill que o jogador paga.
        const persona = ('Você é Nilo Azevedo, hóspede preso no décimo andar de um '
            + 'hotel que não devia existir. Fala pouco, em português, com frases '
            + 'curtas e secas. Nunca inventa fatos sobre o hotel. ').repeat(6);
        const rodada = async (rotulo) => {
            let timings = null;
            const stream = await engine.createChatCompletion({
                messages: [
                    { role: 'system', content: '/system_override /no_think\n' + persona },
                    { role: 'user', content: 'quem é você e o que está fazendo aqui?' },
                ],
                stream: true,
                max_tokens: 32,
                temperature: 0.45,
                cache_prompt: true,
                timings_per_token: true,
                chat_template_kwargs: { enable_thinking: false },
            });
            for await (const chunk of stream) {
                if (chunk?.timings) timings = chunk.timings;
            }
            return { rotulo, timings };
        };
        // Primeira rodada = cache frio (o que o jogador paga na 1ª fala).
        const fria = await rodada('fria');
        // Segunda = com o prefixo já no KV (o que ele paga da 2ª em diante).
        const quente = await rodada('quente');
        try { await engine.exit(); } catch { /* já morreu */ }
        return { carga, fria, quente };
    }, { modelo: MODELO, extra: cfg.extra, threads: THREADS });

    if (r.erro) { console.log('ERRO', r.erro); continue; }
    const f = r.fria.timings ?? {};
    const q = r.quente.timings ?? {};
    linhas.push({ nome: cfg.nome, carga: r.carga, f, q });
    console.log(`carga ${(r.carga / 1000).toFixed(0)}s · `
        + `prompt ${(f.prompt_per_second ?? 0).toFixed(1)}/s · `
        + `fala ${(f.predicted_per_second ?? 0).toFixed(1)}/s`);
}

console.log('\n\n══ RESULTADO ══');
console.log('configuração              carga   prompt/s  fala/s   2ª fala: prompt/s  fala/s  reusado');
for (const l of linhas) {
    console.log(
        l.nome.padEnd(24)
        + `${(l.carga / 1000).toFixed(0).padStart(5)}s`
        + `${(l.f.prompt_per_second ?? 0).toFixed(1).padStart(10)}`
        + `${(l.f.predicted_per_second ?? 0).toFixed(1).padStart(9)}`
        + `${(l.q.prompt_per_second ?? 0).toFixed(1).padStart(19)}`
        + `${(l.q.predicted_per_second ?? 0).toFixed(1).padStart(8)}`
        + `${String(l.q.cache_n ?? 0).padStart(9)}`,
    );
}
const base = linhas[0];
if (base) {
    console.log('\nganho sobre a configuração de hoje (fala/s, 1ª fala):');
    for (const l of linhas.slice(1)) {
        const g = (l.f.predicted_per_second ?? 0) / (base.f.predicted_per_second || 1);
        console.log(`  ${l.nome.padEnd(24)} ${g.toFixed(2)}×`);
    }
}
await browser.close();
