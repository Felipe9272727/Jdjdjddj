/**
 * POR QUE O REVISOR NUNCA REMENDA — no modelo de PRODUÇÃO, e não num primo dele.
 *
 * A pergunta veio assim: *"o revisor até foi acionado (tanto que parece que ele
 * pensou) mas ele simplesmente decide não mudar — será um bug, ou uma
 * escolha?"*, com 45,6 s e 30,6 s na tela e um teto de 25 s no código.
 *
 * Esta bancada já me enganou uma vez aqui: medi no LFM2.5-2.6B, achei que o
 * chat template abria `<think>` sempre e escrevi isso como causa. O template do
 * 2.6B abre mesmo — o do 1.2B, que é o que o jogo carrega, NÃO. Conferido lendo
 * os dois gguf. Então este arquivo mede o 1.2B, com as três configurações que
 * disputam a explicação:
 *
 *   A · como estava ....... chat + enable_thinking:false + teto 40 + corte 25 s
 *   B · só sem o corte .... o mesmo, com prazo de sobra
 *   C · prompt cru ........ <think></think> fechado à mão, sem template
 *
 * ── O QUE ELE ACHOU ──────────────────────────────────────────────────────
 *
 *     A · como estava, corte em 25 s ..... 0/3 consertou · 3 VAZIOS · 26,1 s
 *     B · o MESMO código, prazo de sobra .. 2/3 consertou · 0 vazios · 30,6 s
 *     C · prompt cru, <think></think> ..... 2/3 · 1 vazio · 30,9 s · e QUEBRA
 *
 * A: era o bug. A chamada custa ~30 s e o corte caía aos 25, nas três. O
 * revisor nunca entregou nada desde que foi ligado — não era escolha dele.
 *
 * B: uma linha de diferença, e é o conserto. `fim=stop`, 16 a 23 tokens
 * escritos, conteúdo cheio: o 1.2B não fica pensando, ele só não tinha tempo.
 *
 * C: a ideia que eu trouxe do 2.6B e que esta medição derrubou. Sem o template
 * o texto volta corrompido no começo ("Mone—…", "Mole, …") e uma das três
 * estourou `Invalid magic number`. O caminho cru erra os tokens especiais.
 *
 * Uso, com o servidor apontado para bancada-navegador:
 *   node bancada-navegador/revisor-pensa.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const MODELO = process.env.MODELO ?? 'lfm12.gguf';
const MAX = Number(process.env.MAX_TOKENS ?? 40);

const SYS = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.`;
const EN = (q, f) => `\n\nCORRECTION. One sentence only.\n\nIn your reply to "${q.trim()}", this sentence is wrong:\n\n"${f}"\n\nRewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;
const PROMPT = (q, f) => `<|im_start|>system\n${SYS}<|im_end|>\n<|im_start|>user\n${EN(q, f)}<|im_end|>\n<|im_start|>assistant\n<think></think>`;

// Os três defeitos REAIS que os modelos produziram nesta bancada.
const CASOS = [
    { q: 'Hi what is your name? Do you know why we are here?',
      errada: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
      defeito: 'cânone: ele está no 10º ANDAR, não dentro do elevador',
      ok: (t) => !/\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t) },
    { q: 'Will this hotel ever end?',
      errada: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.',
      defeito: 'vocativo: chama o JOGADOR de Nilo',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },
    { q: 'If I call the elevator, will it come?',
      errada: 'But I would advise you to remain calm and wait for the elevator to arrive.',
      defeito: 'modo assistente: dá conselho',
      ok: (t) => !/\b(?:i'?d|i would) advise|you should|remain calm\b/i.test(t) },
];

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
let t = Date.now();
const subiu = await page.evaluate(async ({ base, arq }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    try {
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
        await w.loadModelFromUrl(`${base}/${arq}`, {
            n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            cache_type_k: 'q8_0', cache_type_v: 'q8_0', jinja: true, reasoning: false, warmup: true,
        });
        window.__w = w; return 'ok';
    } catch (e) { return String(e?.message ?? e).slice(0, 200); }
}, { base: BASE, arq: MODELO });
console.log(`${MODELO}: ${subiu} em ${Math.round((Date.now() - t) / 1000)}s · teto ${MAX} tokens`);
if (subiu !== 'ok') { await browser.close(); process.exit(1); }

async function chamar(modo, q, f, prazoMs) {
    return page.evaluate(async ({ sys, ex, prompt, max, modo, prazoMs }) => {
        const a = performance.now();
        const abort = new AbortController();
        const relogio = setTimeout(() => abort.abort(), prazoMs);
        const comum = {
            max_tokens: max, temperature: 0.7, top_p: 0.95, top_k: 40,
            penalty_repeat: 1.15, penalty_last_n: 256, cache_prompt: true,
            abortSignal: abort.signal,
        };
        let texto = '', pensou = 0, fim = '', ger = 0, lid = 0, cache = 0, err = '';
        try {
            if (modo === 'cru') {
                let acc = '';
                const st = await window.__w.createCompletion({ ...comum, prompt, stream: true });
                for await (const c of st) { acc += (c?.choices?.[0]?.text ?? ''); if (abort.signal.aborted) break; }
                texto = acc.split('<|im_end|>')[0];
            } else {
                const res = await window.__w.createChatCompletion({
                    ...comum, stream: false,
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: ex }],
                    chat_template_kwargs: { enable_thinking: false },
                });
                const ch = res?.choices?.[0];
                texto = ch?.message?.content ?? '';
                pensou = (ch?.message?.reasoning_content ?? '').length;
                fim = ch?.finish_reason; ger = res?.usage?.completion_tokens;
                lid = res?.timings?.prompt_n; cache = res?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
            }
        } catch (e) { err = String(e?.name ?? '') + ' ' + String(e?.message ?? e).slice(0, 70); }
        finally { clearTimeout(relogio); }
        return {
            ms: Math.round(performance.now() - a), cortado: abort.signal.aborted, err,
            texto: String(texto).replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim(),
            pensou, fim, ger, lid, cache,
        };
    }, { sys: SYS, ex: EN(q, f), prompt: PROMPT(q, f), max: MAX, modo, prazoMs });
}

await chamar('cru', 'hi', 'hi there.', 120000); // aquece

const MODOS = [
    { rot: 'A · como estava: chat, enable_thinking:false, corte em 25 s', modo: 'chat', prazo: 25000 },
    { rot: 'B · o mesmo, SEM o corte apertado (prazo 120 s)', modo: 'chat', prazo: 120000 },
    { rot: 'C · prompt cru com <think></think> fechado', modo: 'cru', prazo: 120000 },
];
for (const m of MODOS) {
    console.log(`\n═══ ${m.rot}`);
    let ac = 0, vaz = 0, tot = 0;
    for (const c of CASOS) {
        const r = await chamar(m.modo, c.q, c.errada, m.prazo);
        tot += r.ms;
        const bom = r.texto && c.ok(r.texto);
        if (!r.texto) vaz += 1; else if (bom) ac += 1;
        console.log(`  ${(r.ms / 1000).toFixed(1).padStart(5)}s ${r.cortado ? 'CORTADO' : 'inteiro'}`
            + ` ${r.lid ? r.lid + '+' + r.ger + 'tok' : ''} ${r.cache ? 'cache=' + r.cache : ''}`
            + ` ${r.fim ? 'fim=' + r.fim : ''} ${r.pensou ? 'pensou=' + r.pensou + 'ch' : ''}`
            + ` ${r.texto ? (bom ? '✓ consertou' : '✗ não consertou') : '✗✗ VAZIO'}${r.err ? ' [' + r.err + ']' : ''}`);
        console.log(`        ${c.defeito}`);
        console.log(`        ${JSON.stringify(r.texto.slice(0, 115))}`);
    }
    console.log(`  ── ${ac}/${CASOS.length} consertou · ${vaz} vazios · ${(tot / CASOS.length / 1000).toFixed(1)}s por frase`);
}
await browser.close();
