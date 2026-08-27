/**
 * ── OS TIPOS VÃO NO TURNO, E NÃO NA CARGA ────────────────────────────────
 *
 * O `loadModel` do wllama serializa por um ESQUEMA TIPADO: só os campos
 * declarados em `index.js` atravessam para o C++, e lá só existem sete
 * `spec_draft_*`. Não há campo `speculative` — por isso mandar
 * `speculative: { types: [...] }` na carga não faz nada, e o log responde
 * `no implementations specified`.
 *
 * Mas o TURNO não passa pelo esquema:
 *
 *     data_json: JSON.stringify({ ...options, ...customOpt })
 *
 * É JSON livre, e o servidor do llama.cpp lê `speculative.*` do corpo do
 * pedido. Então o seletor que falta na carga pode existir no turno.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const ALVO = process.env.ALVO ?? 'smollm3.gguf';
const TIPOS = (process.env.TIPOS ?? 'ngram-cache').split(',');

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; '
    + 'now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator". '
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";
// Tarefa de REVISOR: reescrever mudando o mínimo. É onde o n-grama ganha,
// porque quase todo token da saída já está na entrada.
const PEDIR = 'Rewrite this line so it does not break the canon, changing as little as possible:\n\n'
    + '"My name is Nilo Azevedo, and as an AI language model I was designed to help you '
    + 'navigate the corridors of this hotel and reach the window at the end of the hallway."';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('console', (m) => {
    const t = m.text();
    if (/spec|draft|ngram|implementation/i.test(t)) console.log('  ‹nativo› ' + t.slice(0, 200));
});
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, alvo, tipos, persona, pedir }) => {
    const mod = await import(`${base}/wllama-espec/index.js`);
    const w = new mod.Wllama({ default: `${base}/wllama-espec/wllama.wasm` });
    await w.loadModelFromUrl(`${base}/${alvo}`, {
        n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: false,
    });
    const msgs = [{ role: 'system', content: persona }, { role: 'user', content: pedir }];
    const uma = async (spec) => {
        const t0 = performance.now();
        const res = await w.createChatCompletion({
            messages: msgs, n_predict: 64, temp: 0.7, cache_prompt: true,
            ...(spec ? { speculative: { types: tipos } } : {}),
        });
        return { ms: Math.round(performance.now() - t0), txt: (res?.choices?.[0]?.message?.content ?? '').slice(0, 90) };
    };
    return { base_: await uma(false), com: await uma(true), base2: await uma(false) };
}, { base: BASE, alvo: ALVO, tipos: TIPOS, persona: PERSONA, pedir: PEDIR });

console.log(`\n  tarefa de REVISOR · tipos ${TIPOS.join(',')}`);
console.log(`    sem tipos   ${(r.base_.ms / 1000).toFixed(1)}s  "${r.base_.txt}"`);
console.log(`    COM tipos   ${(r.com.ms / 1000).toFixed(1)}s  "${r.com.txt}"`);
console.log(`    sem tipos   ${(r.base2.ms / 1000).toFixed(1)}s`);
await browser.close();
