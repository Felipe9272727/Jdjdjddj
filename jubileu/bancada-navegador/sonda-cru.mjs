// ── O TESTE DE UMA LINHA: "The capital of France is" ──────────────────────
//
// Depois de reescrever a arquitetura de um gguf, "carregou" não prova nada:
// o grafo errado roda igual e devolve ruído. Uma continuação trivial, gulosa,
// separa as duas coisas em 30 segundos — se sai "Paris", os pesos estão sendo
// lidos certo e o problema é outro; se sai lixo, a troca não vale.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3410';
const ARQ = process.env.ARQ ?? 'mobile-llama.gguf';
const PROMPT = process.env.PROMPT ?? 'The capital of France is';
const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async ({ base, arq, prompt }) => {
    try {
        const mod = await import(`${base}/wllama-cdn/index.js`);
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
        await w.loadModelFromUrl(`${base}/${arq}`, { n_ctx: 512, n_batch: 256, n_threads: 4, n_gpu_layers: 0 });
        const meta = w.getModelMetadata?.()?.meta ?? {};
        const s = await w.createCompletion({ prompt, stream: false, n_predict: 24, max_tokens: 24, temperature: 0 });
        return { arch: meta['general.architecture'] ?? '?', texto: String(s?.content ?? JSON.stringify(s)).slice(0, 200) };
    } catch (e) { return { erro: String(e?.message ?? e).slice(0, 200) }; }
}, { base: BASE, arq: ARQ, prompt: PROMPT });
console.log(`\n  ${ARQ} · arch ${r.arch ?? '—'}`);
console.log(`  "${PROMPT}" → ${r.erro ? 'ERRO ' + r.erro : JSON.stringify(r.texto)}`);
await browser.close();
