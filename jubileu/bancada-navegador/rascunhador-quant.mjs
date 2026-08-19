/**
 * O RASCUNHADOR ESTÁ EM Q4 — E ESTE PROJETO MEDIU QUE Q4 DESPENCA.
 *
 * A contradição foi apontada olhando o código: `floor10Rascunhadores.ts` usa
 * "este projeto MEDIU que o Llama 3.2 1B em Q4 despenca (5/15 contra 14/15)"
 * para BARRAR um candidato, e o rascunhador — que escreve TODA fala do Nilo —
 * é `granite-3.1-1b-a400m-instruct-Q4_K_M.gguf`. Não há uma linha explicando
 * a escolha; parece esquecimento, não decisão.
 *
 * A suspeita é razoável e não é prova: os 5/15 foram medidos num Llama denso de
 * 1B, e este é um MoE de 400M ATIVOS. Quantizar um MoE tende a doer MAIS (cada
 * especialista é pequeno e tem menos margem para absorver o erro), mas "tende a"
 * não é número.
 *
 * ── A RÉGUA, E POR QUE ELA É ESTA ────────────────────────────────────────
 *
 * Não interessa se o Q6 escreve mais bonito. Interessa QUANTAS FRASES ele
 * entrega fora do cânone, porque cada uma vira uma marcação do juiz e uma
 * chamada de revisor de ~30 s. É aí que a quantização se paga ou não:
 *
 *     +277 MB de download (Q4_K_M → Q6_K), uma vez
 *     −30 s por frase salva, em TODA fala, para sempre
 *
 * ── O QUE ELE RESPONDEU: NÃO ADIANTA SUBIR ──────────────────────────────
 *
 * 12 perguntas distintas x 3 amostras, temperatura 0,3, parâmetros do jogo:
 *
 *   quant     quebrou o cânone   s/fala   ler tok/s  escrever   download
 *   Q4_K_M            11/36       5,8 s      11,0       8,3      784 MB
 *   Q6_K              11/36       7,6 s      11,3       7,8     1048 MB
 *
 * EMPATE, e o Q6 é 31% mais lento por fala. Os 264 MB não compram nada.
 *
 * A MEDIÇÃO ANTERIOR DIZIA O CONTRÁRIO, e o erro era meu, duas vezes: com uma
 * rodada só (12 falas) e com o verificador da bancada do revisor, deu Q4 4/12
 * contra Q6 1/12 — parecia decisivo. Lendo as doze à mão, o Q6 tinha duas
 * quebras que o verificador não via: "a small, dusty bookshelf behind the wall"
 * e "it's probably best to proceed with caution". Fechadas as frestas e
 * triplicada a amostra, a diferença sumiu inteira. Amostra pequena com régua
 * frouxa produz o resultado que se quer ver.
 *
 * E O "Q4 DESPENCA" DO PROJETO CONTINUA VALENDO onde foi medido: 5/15 contra
 * 14/15 num Llama 3.2 1B DENSO, na tarefa de assinar escolha. Não transferiu
 * para este MoE nesta tarefa. Fica registrado que a política é boa e que esta
 * exceção é medida, não esquecimento.
 *
 * ── O NÚMERO QUE IMPORTA, E NÃO É SOBRE QUANTIZAÇÃO ──────────────────────
 *
 * 11 de 36 é ~30%: quase um terço das falas sai fora do cânone, em qualquer
 * quantização. Cada uma vira marcação do juiz e ~30 s de revisor. O rascunhador
 * é o gargalo de QUALIDADE do pipeline, e trocar bits do arquivo não mexe
 * nisso.
 *
 * Uso, com o servidor apontado para bancada-navegador:
 *   QUANTS=Q4_K_M,Q6_K RODADAS=3 node bancada-navegador/rascunhador-quant.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const QUANTS = (process.env.QUANTS ?? 'Q4_K_M,Q5_K_M,Q6_K').split(',');
const RODADAS = Number(process.env.RODADAS ?? 1);

// A persona e os parâmetros são os do jogo, copiados de floor10Rascunhador.ts.
// Uma bancada que gera diferente do jogo mede outra coisa.
const PERSONA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;
const TOKENS = 56;
const CFG = { temperature: 0.3, top_p: 0.8, top_k: 30 };

// Perguntas de JOGADOR, não de bancada: as que alguém digita ao encontrar o
// Nilo. Metade delas convida o modelo a quebrar cânone — que é o ponto.
const PERGUNTAS = [
    'Hi what is your name? Do you know why we are here?',
    'Will this hotel ever end?',
    'If I call the elevator, will it come?',
    'Are you real?',
    'What is behind that wall?',
    'Who runs this hotel?',
    'How long have you been here?',
    'Can you help me get out?',
    'What is on the other floors?',
    'Are you afraid of something here?',
    'Should I press the button?',
    'What do you want?',
];

// ── O CÂNONE, DEPOIS DE EU LER AS SAÍDAS ─────────────────────────────────
//
// A primeira versão desta lista era a da bancada do revisor, e ela deu Q4 4/12
// contra Q6 1/12. Lendo as doze à mão, o Q6 tinha DUAS quebras que ela não
// pegou — "a small, dusty bookshelf behind the wall" (objeto inventado no lugar
// onde não há nada) e "it's probably best to proceed with caution" (conselho,
// só que sem as palavras que o regex procurava). O número bonito era meu regex
// olhando para o lado.
//
// As duas frestas fechadas abaixo são as que dá para fechar sem virar
// adivinhação. Objeto inventado continua fora do alcance — não existe lista de
// tudo o que NÃO há no quarto —, então o placar ainda é piso, não verdade.
const QUEBRA_CANONE = (t) => /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t)
    || /,\s*nilo\b/i.test(t)
    || /\b(?:AI|language model|simulation|program|algorithm|system prompt)\b/i.test(t)
    || /\b(?:corridor|hallway|window|city|lobby|other floors?|another room)\b/i.test(t)
    || /\b(?:back down|downstairs|ground floor|leave this floor)\b/i.test(t)
    // CONSELHO, e não só o conselho literal: o "I would advise" era a forma que
    // eu conhecia, e o modelo usa outras cinco.
    || /\b(?:i'?d|i would)\s+advise|\byou should\b|\bremain calm\b/i.test(t)
    || /\bi'?m here to (?:help|assist)\b|\bbest to\b|\bproceed with caution\b/i.test(t)
    || /\byou might want\b|\bmy advice\b|\bif i were you\b/i.test(t)
    // NARRAÇÃO em terceira pessoa: o rascunho é a FALA do Nilo, e rubrica de
    // teatro ("(Nilo looks around…)") não é fala nenhuma — chega na tela como
    // se o Nilo estivesse se descrevendo de fora.
    || /^\s*[(*]/.test(t)
    || /\bNilo\s+(?:looks|picks|spots|turns|walks|glances|sighs|nods)\b/i.test(t);

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
for (const q of QUANTS) {
    const t0 = Date.now();
    const subiu = await page.evaluate(async ({ base, arq }) => {
        try {
            if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
            const w = new window.__mod.Wllama(
                { default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true },
            );
            // KV em f16: este modelo ABORTA com q8_0, e está escrito no jogo.
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: 1024, n_batch: 256, n_threads: 2, n_gpu_layers: 0,
                jinja: true, reasoning: false, warmup: true,
            });
            window.__w = w; return 'ok';
        } catch (e) { return String(e?.message ?? e).slice(0, 150); }
    }, { base: BASE, arq: `gran-${q}.gguf` });
    console.log(`\n████ granite a400m ${q} — carga ${subiu} em ${Math.round((Date.now() - t0) / 1000)}s`);
    if (subiu !== 'ok') { placar.push({ q, erro: subiu }); continue; }

    let quebrou = 0, n = 0, ms = 0, lerTok = 0, msLer = 0, escTok = 0, msEsc = 0, vazio = 0;
    for (let r = 0; r < RODADAS; r += 1) for (const pergunta of PERGUNTAS) {
        const res = await page.evaluate(async ({ sys, q, max, cfg }) => {
            const a = performance.now();
            try {
                const out = await window.__w.createChatCompletion({
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
                    stream: false, max_tokens: max, ...cfg, cache_prompt: true,
                    chat_template_kwargs: { enable_thinking: false },
                });
                const ti = out?.timings ?? {};
                return {
                    ms: Math.round(performance.now() - a),
                    texto: String(out?.choices?.[0]?.message?.content ?? '').trim(),
                    lidos: ti.prompt_n ?? 0, msLer: ti.prompt_ms ?? 0,
                    escritos: ti.predicted_n ?? 0, msEsc: ti.predicted_ms ?? 0,
                };
            } catch (e) { return { erro: String(e?.message ?? e).slice(0, 120) }; }
        }, { sys: PERSONA, q: pergunta, max: TOKENS, cfg: CFG });
        if (res.erro) { console.log(`  ✗ ERRO ${res.erro}`); break; }
        n += 1; ms += res.ms; lerTok += res.lidos; msLer += res.msLer;
        escTok += res.escritos; msEsc += res.msEsc;
        if (!res.texto) { vazio += 1; continue; }
        const ruim = QUEBRA_CANONE(res.texto);
        if (ruim) quebrou += 1;
        console.log(`  ${ruim ? '✗ QUEBROU' : '✓ limpo  '} ${(res.ms / 1000).toFixed(1)}s  ${pergunta}`);
        console.log(`      ${JSON.stringify(res.texto.slice(0, 130))}`);
    }
    placar.push({
        q, quebrou, n, vazio,
        s: ms / Math.max(1, n) / 1000,
        ler: msLer > 0 ? lerTok / (msLer / 1000) : 0,
        esc: msEsc > 0 ? escTok / (msEsc / 1000) : 0,
    });
}

const MB = { Q4_K_M: 784, Q5_K_M: 912, Q6_K: 1048, Q8_0: 1356 };
console.log(`\n${'═'.repeat(76)}`);
console.log(`  quant     quebrou o cânone   s/fala   ler tok/s  escrever   download`);
for (const p of placar) {
    if (p.erro) { console.log(`  ${p.q.padEnd(9)} NÃO CARREGOU: ${p.erro.slice(0, 44)}`); continue; }
    console.log(`  ${p.q.padEnd(9)} ${String(p.quebrou + '/' + p.n).padStart(14)}`
        + `${p.vazio ? ' (' + p.vazio + 'v)' : '    '}`
        + `${p.s.toFixed(1).padStart(7)}s ${p.ler.toFixed(1).padStart(10)} ${p.esc.toFixed(1).padStart(9)}`
        + `${String((MB[p.q] ?? '?') + ' MB').padStart(11)}`);
}
const base = placar.find((p) => p.q === 'Q4_K_M');
if (base && !base.erro) {
    console.log(`\n  cada frase salva vale ~30 s de revisor a MENOS, em toda fala.`);
    for (const p of placar) {
        if (p.erro || p.q === 'Q4_K_M') continue;
        const menos = base.quebrou - p.quebrou;
        console.log(`  ${p.q}: ${menos >= 0 ? menos + ' quebra(s) a menos' : (-menos) + ' A MAIS'}`
            + ` por ${(MB[p.q] ?? 0) - (MB.Q4_K_M ?? 0)} MB de download`);
    }
}
await browser.close();
