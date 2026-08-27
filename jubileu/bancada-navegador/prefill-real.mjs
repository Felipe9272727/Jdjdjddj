/**
 * ── O CACHE DE PREFILL AGUENTA O PADRÃO DO JOGO? ─────────────────────────
 *
 * Eu medi "2,8× do frio para o quente" mandando a MESMA pergunta quatro vezes.
 * Isso não é o jogo. No jogo a persona é fixa e a PERGUNTA MUDA todo turno, e o
 * `cache_prompt` do llama.cpp só reaproveita PREFIXO IDÊNTICO — o que casa é a
 * persona, e a cauda tem que ser reprocessada.
 *
 * Então a pergunta é: quanto do ganho sobra quando a cauda muda? Três colunas:
 *
 *   IGUAL ....... mesma pergunta sempre (o meu teste otimista de antes)
 *   MUDANDO ..... persona fixa, pergunta nova a cada turno (o jogo)
 *   SEM CACHE ... cache_prompt desligado (o piso)
 *
 * Se MUDANDO ficar perto de IGUAL, o 2,8× é real e a tarefa #10 vale o que eu
 * disse. Se ficar perto de SEM CACHE, eu vendi um número que não existe.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PACOTE = process.env.PACOTE ?? 'wllama-velho';
const N = Number(process.env.N ?? 48);

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest '
    + 'trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.\n'
    + 'You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, '
    + "as the player's equal, never as a helper; do not offer service and do not ask for orders.\n"
    + 'Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator '
    + 'door; there is no corridor and no window, and you have never left. The elevator does not obey you. '
    + 'You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.\n'
    + 'Answer in 1 or 2 short complete sentences. Reply with Nilo\'s line only, no label.';

const PERGUNTAS = [
    'Hi what is your name? do you know why we are here?',
    'How long have you been on this floor?',
    'Is there any way down from here?',
    'What do you hear at night in this place?',
    'Do you trust the Archivist?',
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, pacote, persona, perguntas, n }) => {
    const mod = await import(`${base}/${pacote}/index.js`);
    const w = new mod.Wllama({ default: `${base}/${pacote}/wllama.wasm` });
    await w.loadModelFromUrl(`${base}/smollm3.gguf`, {
        n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: false,
    });
    const turno = async (pergunta, cache) => {
        const t = performance.now();
        await w.createChatCompletion({
            messages: [{ role: 'system', content: persona }, { role: 'user', content: pergunta }],
            n_predict: n, temp: 0, cache_prompt: cache, ignore_eos: true,
        });
        return Math.round(performance.now() - t);
    };
    // Aquece: a primeira chamada paga a carga fria, e ela não interessa aqui.
    await turno(perguntas[0], true);
    const igual = []; for (let i = 0; i < 4; i++) igual.push(await turno(perguntas[0], true));
    const mudando = []; for (let i = 0; i < 4; i++) mudando.push(await turno(perguntas[i + 1], true));
    const semCache = []; for (let i = 0; i < 3; i++) semCache.push(await turno(perguntas[i + 1], false));
    return { igual, mudando, semCache };
}, { base: BASE, pacote: PACOTE, persona: PERSONA, perguntas: PERGUNTAS, n: N });
await browser.close();

const med = (a) => a.reduce((x, y) => x + y, 0) / a.length / 1000;
const mi = med(r.igual), mm = med(r.mudando), ms = med(r.semCache);
console.log(`\n  ${PACOTE} · ${N} tokens por turno · persona de ~230 tokens`);
console.log(`    IGUAL (mesma pergunta) .... ${r.igual.map((x) => (x / 1000).toFixed(1)).join(' ')}  →  ${mi.toFixed(1)}s`);
console.log(`    MUDANDO (o jogo) .......... ${r.mudando.map((x) => (x / 1000).toFixed(1)).join(' ')}  →  ${mm.toFixed(1)}s`);
console.log(`    SEM CACHE (piso) .......... ${r.semCache.map((x) => (x / 1000).toFixed(1)).join(' ')}  →  ${ms.toFixed(1)}s`);
console.log(`\n  ganho do cache no padrão do JOGO: ${(ms / mm).toFixed(2)}×`);
console.log(`  quanto do ideal isso aproveita: ${(100 * (ms - mm) / (ms - mi)).toFixed(0)}%`);
