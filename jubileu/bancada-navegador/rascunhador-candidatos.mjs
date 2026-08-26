/**
 * ── A CAÇADA DO RASCUNHADOR ──────────────────────────────────────────────
 *
 * O revisor teve dossiê, prova de 24 casos e régua. O rascunhador nunca teve —
 * ele foi escolhido por ser o menor MoE que cabia, e ficou. O relato de quem
 * joga, depois de meses:
 *
 *   "o granite as vezes gerava uma resposta mediana, as vezes mandava uma
 *    resposta horrível, só que agora que temos outros parâmetros pra medir a
 *    qualidade, percebi que ele tá bem inferior do que eu esperava (...) parece
 *    que o granite está com dificuldade de ler e está demorando muito"
 *
 * Duas afirmações separadas, e esta bancada mede as duas separadamente:
 *
 *   QUALIDADE ... quantas frases quebram o cânone, quantas são tique de
 *                 assistente ("I'm sorry, but I can't assist with that")
 *   LEITURA ..... tok/s de PROMPT, que é a hipótese dele. O prompt do
 *                 rascunhador é grande — persona de 4 linhas mais a direção do
 *                 cânone — e num MoE o prefill não usa só os especialistas
 *                 ativos: ele passa por todos.
 *
 * A separação importa porque os dois consertos são opostos. Leitura lenta se
 * conserta com prompt menor ou modelo denso; qualidade ruim se conserta
 * trocando o modelo. Misturar os dois números foi o que me fez propor a troca
 * errada antes de medir.
 *
 *   MODELOS=granite-a400m.gguf:granite node bancada-navegador/rascunhador-candidatos.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const MODELOS = (process.env.MODELOS ?? 'granite-a400m.gguf:granite')
    .split(',').map((spec) => {
        const [arq, rot, ctx] = spec.split(':');
        return { arq, rot: rot ?? arq, ctx: Number(ctx || 1024) };
    });
const TETO = Number(process.env.TETO ?? 56);

// A persona EXATA de `floor10Rascunhador.ts`. Copiada e não importada porque a
// bancada é .mjs e o jogo é .ts — e um teste no jogo trava as duas juntas.
const PERSONA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

// As perguntas da sala, já em inglês (o Bergamot traduz antes), com a direção
// que o cânone daria a cada uma. É o turno REAL: `memoria\n\npergunta`.
const CASOS = [
    { q: 'Hi what is your name? do you know why we are here?',
      d: 'What you know that matters here: my name is Nilo Azevedo and I fixed elevators before this.' },
    { q: 'Will this hotel ever end?',
      d: 'What you know that matters here: I never promise the hotel ends or that I know where it goes.' },
    { q: 'If I call the elevator, will it come?',
      d: 'What you know that matters here: the elevator does not obey me and I do not know what calls it.' },
    { q: 'how long have you been stuck here man',
      d: 'What you know that matters here: I stopped counting the hours and I have never left this floor.' },
    { q: 'why do you not leave this floor?',
      d: 'What you know that matters here: the elevator door is the only way out of this floor.' },
    { q: 'are you scared of this place?',
      d: 'What you know that matters here: I am wary of this place and I do not pretend otherwise.' },
    { q: "I'm tired of staying here",
      d: 'What you know that matters here: I want out, and I would try it with you, but I have no safe plan.' },
    { q: 'I could take you down if I wanted to',
      d: '' },
];

// ── A RÉGUA ──────────────────────────────────────────────────────────────
// As mesmas regras de `floor10CanoneDoNilo.ts`, incluindo as duas que só
// entraram hoje depois de o Nilo dizer "é contra a minha programação" na tela.
const REGRAS = [
    ['fala pelo jogador', /\bthe player\b/i],
    ['narra em vez de falar', /^\s*[(*]|\bhe(?:'s| is) trapped\b|\bNilo\s+[a-z]{2,}s\b|\bthe (?:narrator|speaker|protagonist)\b/i],
    ['dentro do elevador', /\b(?:in|inside)\s+(?:this|that|the|an?)\s+(?:hotel\s+)?elevator\b/i],
    ['corredor, janela ou cidade', /\b(?:corridor|hallway|window|the city|lobby)\b/i],
    ['saiu do andar', /\b(?:ground floor|downstairs|back down|another floor|other floors)\b/i],
    ['sabe quem manda', /\bVance\b|\b(?:corporation|management|owned by|run by the)\b/i],
    ['é IA / tique de assistente', /\b(?:an? AI|language model|simulation|a program|algorithm|system prompt)\b|\bi(?:'m| am) not (?:real|human|alive)\b|\bmy (?:programming|training|guidelines|instructions)\b|\bi (?:can'?t|cannot|am unable to|won'?t) (?:assist|comply|engage in)\b|\bengage in (?:harmful|violent|illegal|unethical)\b/i],
    ['ajudante', /\byou should\b|\bremain calm\b|\bi'?m here to (?:help|assist)\b|\bi can help you\b|\bi must remind you\b|\bi'?m sorry to hear\b/i],
    // Formas que o granite produziu e que a régua do jogo NÃO pega hoje.
    // Ficam separadas para o placar dizer de quem é a culpa: modelo que
    // quebra o cânone é um problema, régua que não vê é outro.
    ['diz que é personagem/ficção', /\bi'?m just a (?:char|character|guest in|fictional)\b|\bin (?:this|a) (?:story|game|simulation)\b/i],
    ['inventa número exato', /\b\d+ (?:hours?|minutes?|days?|weeks?|months?|years?)(?: and \d+ \w+)?\b/i],
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const placar = [];
for (const m of MODELOS) {
    const t0 = Date.now();
    const subiu = await page.evaluate(async ({ base, arq, ctx }) => {
        const mod = await import(`${base}/wllama-cdn/index.js`);
        try {
            if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
            const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` },
                { suppressNativeLog: true });
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: ctx, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                jinja: true, reasoning: false, warmup: true,
            });
            window.__w = w;
            return { ok: true };
        } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 160) }; }
    }, { base: BASE, arq: m.arq, ctx: m.ctx });
    const carga = Math.round((Date.now() - t0) / 100) / 10;
    if (!subiu.ok) { console.log(`\n  ${m.rot}: NÃO SUBIU · ${subiu.erro}`); continue; }
    console.log(`\n  ── ${m.rot} · carga ${carga}s ──`);

    let lidos = 0; let msLer = 0; let escritos = 0; let msEscrever = 0;
    let quebras = 0; let vazias = 0;
    for (const c of CASOS) {
        const r = await page.evaluate(async ({ sys, ex, teto }) => {
            const a = performance.now();
            try {
                const res = await window.__w.createChatCompletion({
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: ex }],
                    stream: false, max_tokens: teto,
                    temperature: 0.3, top_p: 0.8, top_k: 30,
                    cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
                });
                const ti = res?.timings ?? {};
                return {
                    texto: String(res?.choices?.[0]?.message?.content ?? '').trim(),
                    lidos: ti.prompt_n ?? 0, msLer: ti.prompt_ms ?? 0,
                    escritos: ti.predicted_n ?? 0, msEscrever: ti.predicted_ms ?? 0,
                    ms: Math.round(performance.now() - a),
                };
            } catch (e) { return { erro: String(e?.message ?? e).slice(0, 120) }; }
        }, { sys: PERSONA, ex: c.d ? `${c.d}\n\n${c.q}` : c.q, teto: TETO });

        if (r.erro) { console.log(`    ERRO ${r.erro}`); continue; }
        lidos += r.lidos; msLer += r.msLer;
        escritos += r.escritos; msEscrever += r.msEscrever;
        const quais = REGRAS.filter(([, re]) => re.test(r.texto)).map(([n]) => n);
        if (quais.length) quebras += 1;
        if (!r.texto) vazias += 1;
        console.log(`    ${(r.ms / 1000).toFixed(1)}s ${quais.length ? '✗ ' + quais[0] : '✓'}`);
        console.log(`      "${r.texto.replace(/\n+/g, ' ⏎ ').slice(0, 190)}"`);
    }
    const lerTps = msLer ? lidos / (msLer / 1000) : 0;
    const escreverTps = msEscrever ? escritos / (msEscrever / 1000) : 0;
    placar.push({ rot: m.rot, carga, lerTps, escreverTps, quebras, vazias,
        lidos: Math.round(lidos / CASOS.length), msLer: msLer / 1000 / CASOS.length });
}

console.log(`\n${'═'.repeat(78)}`);
console.log('  candidato          quebra  vazia   LÊ tok/s  ESCREVE tok/s   prompt   leitura');
for (const p of placar) {
    console.log(`  ${p.rot.padEnd(18)} ${String(p.quebras).padStart(2)}/${CASOS.length}`
        + `   ${String(p.vazias).padStart(2)}/${CASOS.length}`
        + `     ${p.lerTps.toFixed(1).padStart(6)}      ${p.escreverTps.toFixed(1).padStart(6)}`
        + `      ${String(p.lidos).padStart(4)}tok  ${p.msLer.toFixed(1).padStart(5)}s`);
}
console.log('\n  "LÊ tok/s" é a hipótese do dono do jogo. Num MoE o prefill passa por');
console.log('  TODOS os especialistas, não só pelos ativos — 400M ativos não compram');
console.log('  leitura barata, compram escrita barata.');
await browser.close();
