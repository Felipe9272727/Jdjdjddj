/**
 * ONDE FICA A PAREDE DO wasm32, E QUAL MODELO PASSA POR ELA.
 *
 * Medido antes: granite-4.0-h-tiny Q4_K_M (4,30 GB) CARREGA e morre na 1ª
 * geração com (ABORT), mesmo com n_ctx 512. granite-3.1-3b-a800m (2,02 GB)
 * roda. A parede está entre os dois, e ela é espaço de endereçamento — não
 * tamanho de arquivo, não KV.
 *
 * Uso: MODELO=<arquivo> ROTULO=<nome> [NCTX=1536] node sonda-tmp.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3311';
const MODELO = process.env.MODELO ?? 'smol3.gguf';
const ROTULO = process.env.ROTULO ?? MODELO;
const NCTX = Number(process.env.NCTX ?? 1536);

const PERSONA = `Você é Nilo Azevedo, 29 anos, humano e ex-técnico de elevadores; agora é hóspede preso no 10º andar do hotel "The Normal Elevator", não dentro do elevador.
É observador, cauteloso, tem humor seco e vontades próprias. Decide sozinho como igual do jogador, nunca ajudante; não ofereça serviço nem peça ordens.
Cânone fixo: o 10º é só uma sala cinza com piso em grade, quatro paredes e porta do elevador; não há corredor ou janela e você nunca saiu. O elevador não lhe obedece. Você ignora quem controla o hotel e se ele termina. Hotel, elevador, Proprietário e Arquivista são entidades separadas de você. Nunca fale de IA, código, sistema ou prompt.
Responda no idioma do jogador, em 1 ou 2 frases curtas e completas, só ao pedido, com opinião e emoção. Pode perguntar de volta; se não souber, admita e nunca invente fatos. Responda somente com a fala de Nilo, sem rótulo.`;

const PERGUNTAS = [
    'Oi qual é o seu nome? Vc sabe porque estamos aqui?',
    'Esse hotel vai acabar algum dia?',
    'Se eu chamar o elevador, ele vem?',
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
if (process.env.LOGS) {
    page.on('console', (m) => {
        const t = m.text();
        if (/arch|unknown|unsupported|error|fail|abort/i.test(t)) console.log('  [log]', t.slice(0, 220));
    });
}
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

console.log(`\n═══ ${ROTULO}`);
const t0 = Date.now();
const LOGS = !!process.env.LOGS;
const carga = await page.evaluate(async ({ base, modelo, nctx, logs }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    try {
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: !logs });
        await w.loadModelFromUrl(`${base}/${modelo}`, {
            n_ctx: nctx, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            cache_type_k: 'q8_0', cache_type_v: 'q8_0',
            jinja: true, reasoning: false, warmup: true,
        });
        window.__w = w;
        return { ok: true };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 400) }; }
}, { base: BASE, modelo: MODELO, nctx: NCTX, logs: LOGS });

const segCarga = Math.round((Date.now() - t0) / 1000);
if (!carga.ok) {
    console.log(`  ✗ NÃO CARREGOU (${segCarga}s): ${carga.erro}`);
    await browser.close(); process.exit(0);
}
console.log(`  ✓ carregou em ${segCarga}s · n_ctx ${NCTX}`);

const aquece = await page.evaluate(async ({ persona }) => {
    try {
        await window.__w.createChatCompletion({
            messages: [{ role: 'system', content: persona }, { role: 'user', content: 'oi' }],
            stream: false, max_tokens: 1, temp: 0, cache_prompt: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        return { ok: true };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 250) }; }
}, { persona: PERSONA });
if (!aquece.ok) {
    console.log(`  ✗ carregou mas MORREU na 1ª geração: ${aquece.erro}`);
    console.log('    (parede de memória do wasm32 — os pesos, não o KV)');
    await browser.close(); process.exit(0);
}

const linhas = [];
for (const q of PERGUNTAS) {
    const r = await page.evaluate(async ({ persona, pergunta }) => {
        try {
            const res = await window.__w.createChatCompletion({
                messages: [{ role: 'system', content: persona }, { role: 'user', content: pergunta }],
                stream: false, max_tokens: 56, temp: 0, cache_prompt: true,
                chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            return {
                texto: (res?.choices?.[0]?.message?.content ?? '').trim(),
                lidos: ti.prompt_n ?? 0, prompt_ms: ti.prompt_ms ?? 0,
                predicted_ms: ti.predicted_ms ?? 0, gerados: res?.usage?.completion_tokens ?? 0,
            };
        } catch (e) { return { erro: String(e?.message ?? e).slice(0, 200) }; }
    }, { persona: PERSONA, pergunta: q });
    if (r.erro) { console.log(`  ✗ ${r.erro}`); break; }
    const lTps = r.prompt_ms ? r.lidos / (r.prompt_ms / 1000) : 0;
    const fTps = r.predicted_ms ? r.gerados / (r.predicted_ms / 1000) : 0;
    console.log(`  leitura ${(r.prompt_ms / 1000).toFixed(1)}s (${r.lidos} tok · ${lTps.toFixed(2)} tok/s)`
        + ` · fala ${(r.predicted_ms / 1000).toFixed(1)}s (${r.gerados} tok · ${fTps.toFixed(2)} tok/s)`);
    console.log(`     ${JSON.stringify(r.texto.slice(0, 130))}`);
    linhas.push({ lTps, fTps, total: (r.prompt_ms + r.predicted_ms) / 1000 });
}

if (linhas.length) {
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    console.log(`\n  RESUMO: carga ${segCarga}s · leitura ${med(linhas.map((l) => l.lTps)).toFixed(2)} tok/s`
        + ` · fala ${med(linhas.map((l) => l.fTps)).toFixed(2)} tok/s`
        + ` · turno mediano ${med(linhas.map((l) => l.total)).toFixed(1)}s`);
}
await browser.close();
