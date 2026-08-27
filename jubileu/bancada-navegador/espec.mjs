/**
 * ── A DECODIFICAÇÃO ESPECULATIVA LIGA NESTE BINÁRIO? ────────────────────
 *
 * O `JA-TENTADO.md` marcou este caminho como fechado por dois motivos, e os
 * dois merecem revisão:
 *
 *   "rascunhador por MODELO (par especulativo): vocabulários incompatíveis —
 *    SmolLM3 128256 vs SmolLM2-360M 49152"
 *   "não existe draft público para esta família"
 *
 * O par testado era a família errada. O `tokenizer_config.json` do SmolLM3
 * mostra `<|begin_of_text|>` em 128000 e `<|start_header_id|>` em 128006 — os
 * ids EXATOS do Llama 3. Ele usa o tokenizador do Llama 3.2, trocando dois
 * `reserved_special_token` por `<think>` e `</think>`. Então QUALQUER Llama-3.2
 * é draft candidato, e existem aos montes.
 *
 * E o binário traz três implementações, não uma:
 *
 *   speculative_impl_draft_simple   draft de prateleira, sem treino
 *   speculative_impl_draft_eagle    EAGLE-3, precisa treinar numa GPU
 *   speculative_impl_draft_mtp      a cabeça de MTP do PRÓPRIO modelo
 *
 * A terceira é a mais interessante e a que eu quase destruí: o revisor v2 tem
 * cabeça de MTP, e hoje de manhã eu escrevi `--no-mtp` como padrão do
 * conversor chamando-a de "peso morto". Se o `mtp` funcionar aqui, ela é uma
 * peça de VELOCIDADE — especula sem segundo modelo e sem RAM extra.
 *
 *   ALVO=smollm3.gguf DRAFT=nanoimp.gguf node bancada-navegador/espec.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PACOTE = process.env.PACOTE ?? 'wllama-espec';
const ALVO = process.env.ALVO ?? 'smollm3.gguf';
const DRAFT = process.env.DRAFT ?? '';
const NMAX = Number(process.env.NMAX ?? 5);

const PERGUNTA = 'Hi what is your name? do you know why we are here?';
const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; '
    + 'now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator". '
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('console', (m) => {
    const t = m.text();
    if (/spec|draft|error|abort|vocab|incompat/i.test(t)) console.log('  ‹nativo› ' + t.slice(0, 220));
});
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, pacote, alvo, draft, nmax, persona, pergunta }) => {
    const mod = await import(`${base}/${pacote}/index.js`);
    const w = new mod.Wllama({ default: `${base}/${pacote}/wllama.wasm` });
    const params = {
        n_ctx: 1024, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: false,
    };
    if (draft) {
        // Os nomes saem do próprio binário: `strings wllama.wasm` lista
        // spec_draft_model, spec_draft_n_max, n_min, ngl, p_min, threads.
        //
        // Mas o draft vai como BLOB, e não como URL: o llama.cpp abre
        // `spec_draft_model` como caminho de arquivo, e uma URL não é caminho.
        // O remendo em `wllama-espec/index.js` monta o blob em
        // `models/draft.gguf` e reescreve o parâmetro.
        params.spec_draft_blob = await (await fetch(`${base}/${draft}`)).blob();
        params.spec_draft_n_max = nmax;
        params.spec_draft_n_min = 1;
        params.spec_draft_p_min = 0.75;
        params.spec_draft_threads = 4;
        params.spec_draft_ngl = 0;
    }
    const t0 = performance.now();
    try {
        await w.loadModelFromUrl(`${base}/${alvo}`, params);
    } catch (e) {
        return { ok: false, onde: 'carga', erro: String(e?.message ?? e).slice(0, 400) };
    }
    const carga = performance.now() - t0;
    const medidas = [];
    for (let i = 0; i < 3; i += 1) {
        const t = performance.now();
        try {
            const res = await w.createChatCompletion({
                messages: [{ role: 'system', content: persona },
                    { role: 'user', content: pergunta }],
                stream: false, max_tokens: 56, temperature: 0.3, top_p: 0.8,
                cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            medidas.push({
                ms: performance.now() - t,
                escritos: ti.predicted_n ?? 0, msEscrever: ti.predicted_ms ?? 0,
                lidos: ti.prompt_n ?? 0, msLer: ti.prompt_ms ?? 0,
                texto: String(res?.choices?.[0]?.message?.content ?? '').slice(0, 110),
            });
        } catch (e) { return { ok: false, onde: 'geração', erro: String(e?.message ?? e).slice(0, 300) }; }
    }
    try { await w.exit(); } catch { /* já foi */ }
    return { ok: true, carga, medidas };
}, { base: BASE, pacote: PACOTE, alvo: ALVO, draft: DRAFT, nmax: NMAX, persona: PERSONA, pergunta: PERGUNTA });

console.log(`\n  ${PACOTE} · alvo ${ALVO}${DRAFT ? ` · draft ${DRAFT} (n_max ${NMAX})` : ' · SEM draft'}`);
if (!r.ok) { console.log(`  FALHOU em ${r.onde}: ${r.erro}`); }
else {
    console.log(`  carga ${(r.carga / 1000).toFixed(1)}s`);
    // A primeira é fria; as duas seguintes é que comparam.
    for (const [i, m] of r.medidas.entries()) {
        const tps = m.msEscrever ? m.escritos / (m.msEscrever / 1000) : 0;
        console.log(`    ${i === 0 ? 'fria ' : `${i}    `} ${(m.ms / 1000).toFixed(1)}s`
            + ` · escreveu ${m.escritos}tok a ${tps.toFixed(2)} tok/s`
            + ` · leu ${m.lidos}tok`);
        if (i === 0) console.log(`      "${m.texto}"`);
    }
}
await browser.close();
