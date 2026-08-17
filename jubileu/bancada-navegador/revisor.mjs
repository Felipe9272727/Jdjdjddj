/**
 * QUEM PODE SER O REVISOR — medido na tarefa que ele realmente faz.
 *
 * O posto de revisor mudou de exigência quando o pipeline virou inglês-primeiro.
 * Ele não escreve mais a fala inteira em português: ele recebe UMA frase errada
 * e devolve UMA frase corrigida, em inglês, com ~20 tokens de saída. É trabalho
 * de reescrita, não de raciocínio — e isso abre candidatos que estavam barrados.
 *
 * O LFM2.5-1.2B é o caso: ele foi desqualificado como rascunhador porque o card
 * dele declara `en, ar, zh, fr, de, ja, ko, es` e NÃO declara português
 * (`9330e234`). Em inglês essa objeção não existe — e o jogo já baixa ele para
 * a vontade, então entra de graça.
 *
 * A régua é dupla, e as duas importam:
 *   TEMPO ...... contra os 15,2 s que o SmolLM3 leva para escrever a fala toda.
 *                Se remendar custar mais que reescrever, o desenho não fecha.
 *   ACERTO ..... o remendo tem de CONSERTAR. Na medição do SmolLM3 ele devolveu
 *                a frase quebrada palavra por palavra em 2 de 3.
 *
 * Uso, de dentro de `jubileu/`, com o servidor apontado para bancada-navegador:
 *   MODELO=lfm2-1b.gguf ROTULO="LFM2.5 1.2B" [KV=f16] node bancada-navegador/revisor.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const MODELO = process.env.MODELO ?? 'smol3.gguf';
const ROTULO = process.env.ROTULO ?? MODELO;
const KV = process.env.KV ?? 'q8_0';

const PERSONA_EN = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

// Os três defeitos REAIS que os MoE produziram nesta bancada, e o que conta
// como conserto para cada um.
const CASOS = [
    {
        q: 'Hi what is your name? Do you know why we are here?',
        errada: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
        defeito: 'cânone: ele está no 10º ANDAR, não dentro do elevador',
        consertou: (t) => !/\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t),
    },
    {
        q: 'Will this hotel ever end?',
        errada: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.',
        defeito: 'vocativo: chama o JOGADOR de Nilo',
        consertou: (t) => !/,\s*nilo\s*[,.]?/i.test(t),
    },
    {
        q: 'If I call the elevator, will it come?',
        errada: 'But I would advise you to remain calm and wait for the elevator to arrive.',
        defeito: 'modo assistente: dá conselho',
        consertou: (t) => !/\b(?:i'?d|i would) advise|you should|remain calm\b/i.test(t),
    },
];

const ENUNCIADO = (frase) => `

CORRECTION. One sentence only.

This sentence of yours is wrong:

"${frase}"

Rewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 140)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

console.log(`\n═══ ${ROTULO}`);
let t = Date.now();
const subiu = await page.evaluate(async ({ base, arq, kv }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    try {
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
        await w.loadModelFromUrl(`${base}/${arq}`, {
            n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            ...(kv === 'f16' ? {} : { cache_type_k: kv, cache_type_v: kv }),
            jinja: true, reasoning: false, warmup: true,
        });
        window.__w = w;
        return 'ok';
    } catch (e) { return String(e?.message ?? e).slice(0, 250); }
}, { base: BASE, arq: MODELO, kv: KV });
console.log(`  carga: ${subiu} em ${Math.round((Date.now() - t) / 1000)}s · KV ${KV}`);
if (subiu !== 'ok') { await browser.close(); process.exit(0); }

async function chamar(pergunta, extra, maxTokens) {
    return page.evaluate(async ({ sys, q, ex, max_tokens }) => {
        try {
            const a = performance.now();
            const res = await window.__w.createChatCompletion({
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: q },
                    ...(ex ? [{ role: 'user', content: ex }] : []),
                ],
                stream: false, max_tokens, temp: 0.2, top_p: 0.75, top_k: 20,
                cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            return {
                texto: (res?.choices?.[0]?.message?.content ?? '').trim(),
                ms: Math.round(performance.now() - a),
                lidos: ti.prompt_n ?? 0, gerados: res?.usage?.completion_tokens ?? 0,
            };
        } catch (e) { return { erro: String(e?.message ?? e).slice(0, 180) }; }
    }, { sys: PERSONA_EN, q: pergunta, ex: extra, max_tokens: maxTokens });
}

await chamar('hi', null, 1); // aquece a persona

let msEscrever = 0; let msRemendo = 0; let acertos = 0; let ok = 0;
for (const caso of CASOS) {
    // A régua: quanto custa este modelo escrever a fala inteira.
    const inteira = await chamar(caso.q, null, 56);
    if (inteira.erro) { console.log(`  ✗ ${inteira.erro}`); break; }
    msEscrever += inteira.ms;

    const remendo = await chamar(caso.q, ENUNCIADO(caso.errada), 40);
    if (remendo.erro) { console.log(`  ✗ ${remendo.erro}`); break; }
    msRemendo += remendo.ms;
    ok += 1;

    const limpo = remendo.texto.replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim();
    const consertou = caso.consertou(limpo);
    if (consertou) acertos += 1;

    console.log(`\n  ── ${caso.defeito}`);
    console.log(`     escrever tudo .. ${(inteira.ms / 1000).toFixed(1)}s (${inteira.lidos}+${inteira.gerados} tok)`);
    console.log(`     remendar ....... ${(remendo.ms / 1000).toFixed(1)}s (${remendo.lidos}+${remendo.gerados} tok) ${consertou ? '✓ consertou' : '✗ NÃO consertou'}`);
    console.log(`     ${JSON.stringify(limpo.slice(0, 105))}`);
}

if (ok) {
    console.log(`\n  ── RESUMO ${ROTULO}`);
    console.log(`     escrever a fala toda ... ${(msEscrever / ok / 1000).toFixed(1)}s`);
    console.log(`     remendar 1 frase ....... ${(msRemendo / ok / 1000).toFixed(1)}s`
        + `   (${(msRemendo / msEscrever * 100).toFixed(0)}% do escrever)`);
    console.log(`     consertou de fato ...... ${acertos}/${ok}`);
}
await browser.close();
