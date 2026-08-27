/**
 * ── O RELAXED SIMD VALE, E ELE MUDA A RESPOSTA? ──────────────────────────
 *
 * Duas perguntas, e a segunda importa tanto quanto a primeira.
 *
 * VELOCIDADE: a PR #19590 do llama.cpp reporta 1,75–2,18× em Q4_K_M usando
 * `wasm_i32x4_relaxed_dot_i8x16_i7x16_add`. Se valer, o turno inteiro encolhe
 * — prefill e geração, e em todos os modelos do pipeline, não só num.
 *
 * DETERMINISMO: a semântica "relaxed" só garante resultado igual entre engines
 * se o segundo operando estiver na faixa i7. Os valores q8 do llama.cpp são i8
 * completos. Então a MESMA pergunta pode gerar texto DIFERENTE em navegadores
 * diferentes — para um NPC de jogo isso é defeito, não detalhe.
 *
 * Por isso os dois pacotes rodam com `temp 0` e `ignore_eos`: com temperatura
 * zero a saída é função só dos pesos e da aritmética. Se os textos baterem
 * caractere a caractere, a aritmética não mudou e o ganho é de graça. Se não
 * baterem, o ganho custa a fala do Nilo mudar conforme o navegador.
 *
 *   node bancada-navegador/relaxed-simd.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PACOTES = (process.env.PACOTES ?? 'wllama-velho,wllama-espec').split(',');
const N = Number(process.env.N ?? 64);
const NTHREADS = Number(process.env.NTHREADS ?? 4);

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; '
    + 'now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator". '
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";
const PERGUNTA = 'Hi what is your name? do you know why we are here?';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});

const saidas = [];
for (const pacote of PACOTES) {
    const page = await browser.newPage();
    await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const r = await page.evaluate(async ({ base, pacote, persona, pergunta, n, nthreads }) => {
        const mod = await import(`${base}/${pacote}/index.js`);
        const w = new mod.Wllama({ default: `${base}/${pacote}/wllama.wasm` });
        const t0 = performance.now();
        await w.loadModelFromUrl(`${base}/smollm3.gguf`, {
            // UMA thread de proposito: com 4, a reducao em ponto flutuante
            // soma em ordem variavel e a MESMA build diverge de si mesma --
            // medido, e foi o que invalidou a primeira versao deste teste.
            n_ctx: 1024, n_batch: 512, n_threads: Number(nthreads), n_gpu_layers: 0,
            jinja: true, reasoning: false, warmup: false,
        });
        const carga = performance.now() - t0;
        const msgs = [{ role: 'system', content: persona }, { role: 'user', content: pergunta }];
        const uma = async () => {
            const t = performance.now();
            const res = await w.createChatCompletion({
                messages: msgs, n_predict: n, temp: 0, top_k: 1, top_p: 1, seed: 42,
                cache_prompt: true, ignore_eos: true,
            });
            return { ms: Math.round(performance.now() - t),
                     txt: res?.choices?.[0]?.message?.content ?? '' };
        };
        const fria = await uma();
        const q1 = await uma(); const q2 = await uma(); const q3 = await uma();
        return { carga: Math.round(carga), fria: fria.ms, txt: fria.txt,
                 quentes: [q1.ms, q2.ms, q3.ms] };
    }, { base: BASE, pacote, persona: PERSONA, pergunta: PERGUNTA, n: N, nthreads: NTHREADS });
    await page.close();
    const med = r.quentes.reduce((a, b) => a + b, 0) / r.quentes.length;
    saidas.push({ pacote, ...r, med });
    console.log(`  ${pacote.padEnd(14)} carga ${(r.carga / 1000).toFixed(1)}s · fria ${(r.fria / 1000).toFixed(1)}s`
        + ` · quentes ${r.quentes.map((m) => (m / 1000).toFixed(1)).join(' ')} · média ${(med / 1000).toFixed(1)}s`
        + ` · ${(N / (med / 1000)).toFixed(2)} tok/s`);
}
await browser.close();

if (saidas.length === 2) {
    const [a, b] = saidas;
    console.log(`\n  VELOCIDADE  ${(a.med / b.med).toFixed(2)}× (${a.pacote} → ${b.pacote})`);
    const igual = a.txt === b.txt;
    console.log(`  DETERMINISMO  ${igual ? 'IGUAL caractere a caractere — a aritmética não mudou'
        : 'DIVERGIU — a fala do Nilo depende do navegador'}`);
    if (!igual) {
        console.log(`    velho: ${JSON.stringify(a.txt.slice(0, 120))}`);
        console.log(`    novo : ${JSON.stringify(b.txt.slice(0, 120))}`);
    }
}
