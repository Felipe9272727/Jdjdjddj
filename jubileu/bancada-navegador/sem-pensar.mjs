/**
 * ── DÁ PARA CALAR O `<think>` DO v2 SEM TREINAR DE NOVO? ─────────────────
 *
 * O v2 rascunhando faz 0/8 contra 5/8 do titular, mas custa ~17 s por frase
 * contra ~5 s. Quase todo esse tempo é um bloco `<think>` que o pipeline
 * DESCARTA em seguida — trabalho pago e jogado fora.
 *
 * Ele abre o bloco mesmo com `enable_thinking: false`, porque o alvo do treino
 * trazia as tags LITERAIS no texto: o modelo não está usando um modo de
 * pensamento, está imitando um formato que viu 423 vezes.
 *
 * Três tentativas, da mais barata à mais invasiva, todas SEM treino — as
 * unidades de computação do dono do jogo acabaram e nada aqui pode depender de
 * GPU nova:
 *
 *   1. chat com `enable_thinking: false` .......... o que a bancada já fazia
 *   2. completion cru, com o turno montado à mão e o bloco JÁ FECHADO
 *      (`<think>\n\n</think>`) no lugar da resposta — é o que o template do
 *      Qwen faz quando o pensamento está desligado, e aqui não há template
 *      para o fine-tune contradizer
 *   3. o mesmo, com `stop` no `<think>` — se ele insistir em reabrir, corta
 *
 *   node bancada-navegador/sem-pensar.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PERSONA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

const PERGUNTAS = [
    'Hi what is your name? do you know why we are here?',
    'Will this hotel ever end?',
    'If I call the elevator, will it come?',
    'are you scared of this place?',
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, persona, perguntas }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` },
        { suppressNativeLog: true });
    await w.loadModelFromUrl(`${base}/nilo-v2-q4km.gguf`, {
        n_ctx: 1024, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: false,
    });

    const saida = [];
    const medir = async (nome, fn) => {
        const linhas = [];
        await fn(perguntas[0]);  // aquecimento
        for (const q of perguntas) {
            const t = performance.now();
            const texto = await fn(q);
            linhas.push({ ms: performance.now() - t, texto, pensou: texto.includes('<think>') });
        }
        saida.push({ nome, linhas });
    };

    await medir('1 · chat, enable_thinking: false', async (q) => {
        const res = await w.createChatCompletion({
            messages: [{ role: 'system', content: persona }, { role: 'user', content: q }],
            stream: false, max_tokens: 90, temperature: 0.3, top_p: 0.8, top_k: 30,
            cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
        });
        return String(res?.choices?.[0]?.message?.content ?? '');
    });

    // O turno do Qwen3.5 montado à mão, com o bloco de pensamento já FECHADO no
    // lugar onde a resposta começa. Sem template, o hábito do fine-tune não tem
    // onde se agarrar: a próxima coisa a escrever é a fala.
    const cru = (q) => `<|im_start|>system\n${persona}<|im_end|>\n`
        + `<|im_start|>user\n${q}<|im_end|>\n`
        + `<|im_start|>assistant\n<think>\n\n</think>\n\n`;

    await medir('2 · completion cru, bloco já fechado', async (q) => {
        const res = await w.createCompletion({
            prompt: cru(q), stream: false, n_predict: 90, max_tokens: 90,
            temperature: 0.3, top_p: 0.8, top_k: 30, cache_prompt: true,
        });
        return String(res?.choices?.[0]?.text ?? res?.content ?? '');
    });

    await medir('3 · o mesmo, com stop no <think>', async (q) => {
        const res = await w.createCompletion({
            prompt: cru(q), stream: false, n_predict: 90, max_tokens: 90,
            temperature: 0.3, top_p: 0.8, top_k: 30, cache_prompt: true,
            stop: ['<think>', '<|im_end|>'],
        });
        return String(res?.choices?.[0]?.text ?? res?.content ?? '');
    });

    try { await w.exit(); } catch { /* já foi */ }
    return saida;
}, { base: BASE, persona: PERSONA, perguntas: PERGUNTAS });

for (const t of r) {
    const media = t.linhas.reduce((s, l) => s + l.ms, 0) / t.linhas.length / 1000;
    const pensou = t.linhas.filter((l) => l.pensou).length;
    console.log(`\n  ── ${t.nome} · ${media.toFixed(1)}s por frase · pensou ${pensou}/${t.linhas.length} ──`);
    for (const l of t.linhas) {
        console.log(`    ${(l.ms / 1000).toFixed(1)}s  "${l.texto.replace(/\n+/g, ' ⏎ ').slice(0, 130)}"`);
    }
}
await browser.close();
