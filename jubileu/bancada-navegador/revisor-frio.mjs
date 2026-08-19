/**
 * A PRIMEIRA FRASE DO TURNO É A QUE O JOGADOR SENTE — e ela é FRIA.
 *
 * Esta sonda existe porque eu quase entreguei um número que não é o que ele vai
 * ver. `revisor-candidatos.mjs` faz uma chamada de AQUECIMENTO antes de medir:
 *
 *     // Aquece: a PRIMEIRA chamada paga o prefixo sem cache em qualquer modelo
 *     await remendar(SYS, 'hi', 'hi there.');
 *
 * Com o prefixo já no cache, o Llama relê só os ~100 tokens que mudaram e marca
 * 11,6 s. Só que no JOGO o revisor sobe do zero a cada turno (o pipeline
 * descarrega o rascunhador e carrega o revisor), então a PRIMEIRA frase marcada
 * paga a persona inteira. E quando o juiz marca uma frase só — o caso comum —
 * a primeira é a única.
 *
 * O que se mede aqui, sem aquecer nada:
 *   1ª chamada .. o que o jogador espera quando o juiz marca UMA frase
 *   2ª e 3ª ..... o que ele espera pelas seguintes, com o prefixo já lido
 *
 * Uso: node bancada-navegador/revisor-frio.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const MODELOS = [
    { arq: 'lfm12.gguf', rot: 'LFM2.5 1.2B (padrão)' },
    { arq: 'llama32.gguf', rot: 'Llama 3.2 1B Q6' },
];

const SYS = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.`;
const EN = (q, f, porque) => `\n\nCORRECTION. One sentence only.\n\nThe player asked: "${q.trim()}"\n\nYou answered with this line:\n\n"${f}"\n\nIt is wrong because ${porque}\n\nWrite the corrected line. Keep what it was saying, fix only that error. Nilo's voice, one sentence, no explaining, no quotes.`;

const CASOS = [
    { q: 'Hi what is your name? Do you know why we are here?',
      f: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
      porque: 'Nilo is trapped on the 10th FLOOR, in a grey room. He is not inside the elevator.' },
    { q: 'If I call the elevator, will it come?',
      f: 'But I would advise you to remain calm and wait for the elevator to arrive.',
      porque: "it gives the player advice. Nilo is the player's equal, never a helper." },
    { q: 'Who runs this hotel?',
      f: 'The hotel is run by the Vance family, and they will shut it down next Tuesday.',
      porque: 'Nilo does NOT know who runs the hotel. He must not name anyone or give dates.' },
];

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 110)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(async ({ base }) => {
    window.__mod = await import(`${base}/wllama-cdn/index.js`);
}, { base: BASE });

const placar = [];
for (const m of MODELOS) {
    const t0 = Date.now();
    const subiu = await page.evaluate(async ({ base, arq }) => {
        try {
            if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
            const w = new window.__mod.Wllama(
                { default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true },
            );
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                cache_type_k: 'q8_0', cache_type_v: 'q8_0', jinja: true, reasoning: false, warmup: true,
            });
            window.__w = w; return 'ok';
        } catch (e) { return String(e?.message ?? e).slice(0, 140); }
    }, { base: BASE, arq: m.arq });
    console.log(`\n████ ${m.rot} — carga ${subiu} em ${Math.round((Date.now() - t0) / 1000)}s`);
    if (subiu !== 'ok') { placar.push({ rot: m.rot, erro: subiu }); continue; }

    // SEM AQUECIMENTO. A primeira chamada abaixo é a primeira do modelo.
    const tempos = [];
    for (const [i, c] of CASOS.entries()) {
        const r = await page.evaluate(async ({ sys, ex }) => {
            const a = performance.now();
            try {
                const res = await window.__w.createChatCompletion({
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: ex }],
                    stream: false, max_tokens: 40, temperature: 0.7, top_p: 0.95, top_k: 40,
                    penalty_repeat: 1.15, penalty_last_n: 256, cache_prompt: true,
                    chat_template_kwargs: { enable_thinking: false },
                });
                const ti = res?.timings ?? {};
                return {
                    ms: Math.round(performance.now() - a),
                    lidos: ti.prompt_n ?? 0, cache: ti.cache_n ?? 0,
                    texto: String(res?.choices?.[0]?.message?.content ?? '').trim(),
                };
            } catch (e) { return { erro: String(e?.message ?? e).slice(0, 110) }; }
        }, { sys: SYS, ex: EN(c.q, c.f, c.porque) });
        if (r.erro) { console.log(`  ✗ ${r.erro}`); break; }
        tempos.push(r.ms);
        console.log(`  ${i === 0 ? 'FRIA ' : `#${i + 1}   `} ${(r.ms / 1000).toFixed(1).padStart(5)}s`
            + `  leu ${String(r.lidos).padStart(3)} tok (${r.cache} do cache)`);
        console.log(`        ${JSON.stringify(r.texto.slice(0, 90))}`);
    }
    placar.push({ rot: m.rot, fria: tempos[0], depois: tempos.slice(1) });
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`  candidato               1ª frase (FRIA)   as seguintes`);
for (const p of placar) {
    if (p.erro) { console.log(`  ${p.rot.padEnd(24)} ${p.erro.slice(0, 40)}`); continue; }
    const med = p.depois.length ? p.depois.reduce((a, b) => a + b, 0) / p.depois.length : 0;
    console.log(`  ${p.rot.padEnd(24)} ${(p.fria / 1000).toFixed(1).padStart(12)}s`
        + `${(med / 1000).toFixed(1).padStart(14)}s`);
}
console.log(`\n  A 1ª é a que o jogador sente quando o juiz marca UMA frase — o caso comum.`);
await browser.close();
