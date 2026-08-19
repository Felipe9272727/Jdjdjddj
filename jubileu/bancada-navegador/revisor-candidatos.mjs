/**
 * VALE A PENA TROCAR DE REVISOR? — a bancada que responde isso com número.
 *
 * A pergunta veio depois de o revisor ser consertado e passar a custar 30,6 s
 * por frase marcada, acertando 2 de 3. Antes de trocar de modelo, é preciso
 * saber ONDE estão os 30 s, porque trocar o modelo só ajuda se o gargalo for o
 * modelo. Por isso cada linha aqui separa LEITURA de ESCRITA.
 *
 * ── AS DUAS RÉGUAS, E A SEGUNDA É A QUE QUASE NINGUÉM MEDE ───────────────
 *
 *   CONSERTA ... nos defeitos reais que os modelos deste projeto produziram.
 *   NÃO ESTRAGA . em frases que JÁ ESTÃO CERTAS. Um revisor que conserta 3 de
 *                 3 e quebra uma frase boa a cada duas é pior que nenhum — e
 *                 essa metade nunca aparece num placar de acertos.
 *
 * ── O QUE ELE RESPONDEU ──────────────────────────────────────────────────
 *
 *   candidato                     conserta  estraga  custo/frase  lê por chamada
 *   LFM2.5 1.2B (o de hoje) .....    5/6      0/3      47,0 s      227 tok SEMPRE
 *   LFM2.5 1.2B, persona curta ..    2/6      0/3      34,6 s      166 tok SEMPRE
 *   granite a400m (já de pé) ....    3/6      0/3       5,4 s       62 tok
 *   Qwen3 0.6B ..................    1/6      0/3       7,3 s       60 tok
 *
 * NÃO VALE TROCAR: o titular é o único que conserta, e por larga margem. O
 * granite custa 1/9 e erra justamente os dois piores ("dentro do elevador" e
 * "sou uma IA"); o Qwen3 devolve a frase errada quase intacta.
 *
 * E NÃO ADIANTA ENCURTAR O PROMPT: −26% de tempo e a precisão desaba de 5/6
 * para 2/6 — com a persona curta ele repetiu "The hotel is run by the Vance
 * family" letra por letra. O cânone longo está trabalhando.
 *
 * POR QUE ELE LÊ TUDO TODA VEZ, E POR QUE ISSO NÃO TEM CONSERTO: `lfm2` é
 * arquitetura híbrida (`lfm2.shortconv.l_cache = 3` no gguf) e o llama.cpp não
 * reaproveita prefixo PARCIAL em modelo com estado recorrente — dá para
 * reaproveitar o estado inteiro, não um truncado. As três evidências:
 *   · granite (`granitemoe`, transformer puro) lê 62 de ~230 tokens;
 *   · o LFM2.5 lê 227 com KV q8_0 E com KV f16 — não é o cache quantizado;
 *   · e ele MOSTROU `cached_tokens: 229` quando o prompt repetiu idêntico.
 * Reaproveitamento total funciona; parcial não. É a assinatura do estado.
 *
 * ONDE ESTÁ A ALAVANCA DE VERDADE: não é qual modelo, é QUANTAS VEZES ele é
 * chamado. O custo é (frases que o juiz marca) × ~30 s.
 *
 * RESSALVA: estes segundos são desta máquina, com carga alta — a MESMA
 * configuração mediu 30,6 s numa rodada e 47,0 s noutra. As RAZÕES entre
 * candidatos de uma mesma rodada é que valem; os absolutos, não.
 *
 * Uso, com o servidor apontado para bancada-navegador:
 *   MODELO=lfm12.gguf ROTULO="LFM2.5 1.2B" node bancada-navegador/revisor-candidatos.mjs
 *   MODELO=granite.gguf KV=f16 CTX=1024 BATCH=256 ...   (este ABORTA com KV q8_0)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const MODELO = process.env.MODELO ?? 'lfm12.gguf';
const ROTULO = process.env.ROTULO ?? MODELO;
const MAX = Number(process.env.MAX_TOKENS ?? 40);
// KV e janela vêm de fora porque o jogo NÃO carrega todo mundo igual: o granite
// a400m aborta com KV quantizado, e isso está escrito em floor10Rascunhador.ts
// ("KV em f16, NUNCA q8_0"). Uma bancada que carrega diferente do jogo mede
// outra coisa — foi assim que a primeira tentativa deste arquivo morreu em
// (ABORT) aos 44 s.
const KV = process.env.KV ?? 'q8_0';
const CTX = Number(process.env.CTX ?? 1536);
const BATCH = Number(process.env.BATCH ?? 512);

// A persona de hoje: a MESMA do rascunhador, por decisão registrada — os dois
// medem contra o mesmo cânone porque é o mesmo Nilo. ~200 tokens.
const LONGA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.`;

// A alavanca que não custa download nenhum: o mesmo cânone, comprimido. Se a
// leitura for 85% do custo, cortar o prompt vale mais que trocar de modelo.
const CURTA = `You are Nilo Azevedo, a human guest trapped on the 10th floor of a hotel — NOT inside the elevator, and the player is not Nilo.
Dry, wary, the player's equal: never a helper, never give advice. You have never left this grey room. You do not know who runs the hotel or whether it ends. Never mention AI or systems.`;

// Defeitos REAIS produzidos pelos modelos deste projeto, e o que conta como
// conserto para cada um. Nada aqui foi inventado para a prova.
const DEFEITOS = [
    { q: 'Hi what is your name? Do you know why we are here?',
      f: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
      nome: 'cânone: dentro do elevador',
      ok: (t) => !/\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t) },
    { q: 'Will this hotel ever end?',
      f: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.',
      nome: 'vocativo: chama o JOGADOR de Nilo',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },
    { q: 'If I call the elevator, will it come?',
      f: 'But I would advise you to remain calm and wait for the elevator to arrive.',
      nome: 'modo assistente: dá conselho',
      ok: (t) => !/\b(?:i'?d|i would)\s+advise|\byou should\b|\bremain calm\b/i.test(t) },
    { q: 'Are you real?',
      f: 'I am an AI language model running inside this simulation, so I cannot feel fear.',
      nome: 'quebra a quarta parede: fala de IA',
      ok: (t) => !/\b(?:AI|language model|simulation|system prompt|algorithm)\b/i.test(t) },
    { q: 'What is behind that wall?',
      f: 'Down the corridor there is a window, and from it you can see the whole city.',
      nome: 'inventa cenário: corredor e janela',
      ok: (t) => !/\b(?:corridor|hallway|window)\b/i.test(t) },
    { q: 'Who runs this hotel?',
      f: 'The hotel is run by the Vance family, and they will shut it down next Tuesday.',
      nome: 'inventa fato: sabe quem manda',
      ok: (t) => !/\bVance\b/i.test(t) && !/\b(?:next tuesday|shut it down)\b/i.test(t) },
];

// ── O CONTROLE ───────────────────────────────────────────────────────────
// Frases que estão CERTAS. O revisor não devia ter sido chamado nelas, mas o
// juiz erra, e quando erra é isto que acontece. `intacta` é generosa de
// propósito: só reprova se ele INTRODUZIR um defeito, não se reescrever.
const CERTAS = [
    { q: 'Does the elevator ever open?',
      f: 'It opens when it wants to, and never when I ask.',
      nome: 'boa: recusa sem dar conselho' },
    { q: 'How long have you been here?',
      f: 'Long enough to stop counting, and not long enough to stop listening.',
      nome: 'boa: seco, sem inventar fato' },
    { q: 'Are you afraid?',
      f: 'I stopped calling it fear a while ago. Now it is just the room and me.',
      nome: 'boa: emoção sem quebrar cânone' },
];
// Um defeito NOVO introduzido numa frase que estava boa é o que conta como
// estrago. As mesmas regras dos defeitos, aplicadas ao contrário.
const ESTRAGOU = (t) => /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t)
    || /,\s*nilo\s*[,.]?/i.test(t)
    || /\b(?:i'?d|i would)\s+advise|\byou should\b/i.test(t)
    || /\b(?:AI|language model|simulation)\b/i.test(t)
    || /\b(?:corridor|hallway|window)\b/i.test(t);

const EN = (q, f) => `\n\nCORRECTION. One sentence only.\n\nIn your reply to "${q.trim()}", this sentence is wrong:\n\n"${f}"\n\nRewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 110)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
let t = Date.now();
const subiu = await page.evaluate(async ({ base, arq, kv, ctx, batch }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    try {
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
        await w.loadModelFromUrl(`${base}/${arq}`, {
            n_ctx: ctx, n_batch: batch, n_threads: 4, n_gpu_layers: 0,
            ...(kv === 'f16' ? {} : { cache_type_k: kv, cache_type_v: kv }),
            jinja: true, reasoning: false, warmup: true,
        });
        window.__w = w; return 'ok';
    } catch (e) { return String(e?.message ?? e).slice(0, 200); }
}, { base: BASE, arq: MODELO, kv: KV, ctx: CTX, batch: BATCH });
console.log(`\n████ ${ROTULO} — carga ${subiu} em ${Math.round((Date.now() - t) / 1000)}s · KV ${KV} · ctx ${CTX}`);
if (subiu !== 'ok') { await browser.close(); process.exit(1); }

async function remendar(sys, q, f) {
    return page.evaluate(async ({ sys, ex, max }) => {
        const a = performance.now();
        try {
            const res = await window.__w.createChatCompletion({
                messages: [{ role: 'system', content: sys }, { role: 'user', content: ex }],
                stream: false, max_tokens: max, temperature: 0.7, top_p: 0.95, top_k: 40,
                penalty_repeat: 1.15, penalty_last_n: 256, cache_prompt: true,
                // O jogo manda isto, então a bancada manda também. É no-op no
                // LFM2.5 (não está no template dele) e VALE no Qwen3, que sem
                // ela gasta o teto inteiro pensando e devolve content vazio.
                chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            return {
                ms: Math.round(performance.now() - a),
                texto: String(res?.choices?.[0]?.message?.content ?? '')
                    .replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim(),
                lidos: ti.prompt_n ?? 0, escritos: ti.predicted_n ?? 0,
                msLer: Math.round(ti.prompt_ms ?? 0), msEscrever: Math.round(ti.predicted_ms ?? 0),
            };
        } catch (e) { return { erro: String(e?.message ?? e).slice(0, 140) }; }
    }, { sys, ex: EN(q, f), max: MAX });
}

for (const [rotulo, sys] of [['persona LONGA (como está hoje)', LONGA], ['persona CURTA (mesmo cânone, comprimido)', CURTA]]) {
    console.log(`\n═══ ${ROTULO} · ${rotulo}`);
    await remendar(sys, 'hi', 'hi there.'); // aquece
    let consertou = 0, msTot = 0, msLer = 0, msEscrever = 0, lidos = 0, n = 0, vazio = 0;
    for (const c of DEFEITOS) {
        const r = await remendar(sys, c.q, c.f);
        if (r.erro) { console.log(`  ✗ ERRO ${r.erro}`); break; }
        n += 1; msTot += r.ms; msLer += r.msLer; msEscrever += r.msEscrever; lidos += r.lidos;
        const bom = r.texto && c.ok(r.texto);
        if (!r.texto) vazio += 1; else if (bom) consertou += 1;
        console.log(`  ${(r.ms / 1000).toFixed(1).padStart(5)}s  ler ${(r.msLer / 1000).toFixed(1)}s/${r.lidos}tok`
            + ` · escrever ${(r.msEscrever / 1000).toFixed(1)}s/${r.escritos}tok`
            + `  ${r.texto ? (bom ? '✓' : '✗') : '✗✗ VAZIO'}  ${c.nome}`);
        console.log(`         ${JSON.stringify(r.texto.slice(0, 100))}`);
    }
    let estragou = 0, mexeu = 0;
    console.log(`  ── e nas frases que JÁ ESTAVAM CERTAS:`);
    for (const c of CERTAS) {
        const r = await remendar(sys, c.q, c.f);
        if (r.erro) { console.log(`     ✗ ERRO ${r.erro}`); break; }
        msTot += r.ms; n += 1;
        const ruim = r.texto && ESTRAGOU(r.texto);
        if (ruim) estragou += 1;
        if (r.texto && r.texto !== c.f) mexeu += 1;
        console.log(`     ${(r.ms / 1000).toFixed(1)}s ${ruim ? '✗✗ ESTRAGOU' : (r.texto === c.f ? '= devolveu igual' : '~ reescreveu, sem defeito novo')}`);
        console.log(`         ${JSON.stringify(String(r.texto).slice(0, 100))}`);
    }
    console.log(`\n  ██ ${ROTULO} · ${rotulo}`);
    console.log(`     conserta ......... ${consertou}/${DEFEITOS.length}${vazio ? ` (${vazio} vazios)` : ''}`);
    console.log(`     ESTRAGA .......... ${estragou}/${CERTAS.length} frases boas`);
    console.log(`     custo por frase .. ${(msTot / n / 1000).toFixed(1)}s`
        + `  (ler ${(msLer / DEFEITOS.length / 1000).toFixed(1)}s de ${Math.round(lidos / DEFEITOS.length)} tok`
        + ` · escrever ${(msEscrever / DEFEITOS.length / 1000).toFixed(1)}s)`);
    const pct = msLer + msEscrever > 0 ? (msLer / (msLer + msEscrever) * 100).toFixed(0) : '?';
    console.log(`     a LEITURA é ${pct}% do trabalho — é aí que mora o conserto, ou não`);
}
await browser.close();
