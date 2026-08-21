// ── POR QUE ESTE GGUF NÃO CARREGA ────────────────────────────────────────
//
// A bancada sobe o wllama com `suppressNativeLog: true`, que é certo para
// medir (o llama.cpp é falante) e péssimo para diagnosticar: um `(ABORT)` sem
// texto não diz nada. Esta sonda faz o contrário — carrega UM modelo com o log
// nativo ligado e repete o que ele disser.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3405';
const ARQ = process.env.ARQ ?? 'mobile.gguf';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('console', (m) => {
    const t = m.text();
    if (/error|abort|unknown|unsupported|missing|failed|not found|arch/i.test(t)) {
        console.log('  ‹nativo› ' + t.slice(0, 200));
    }
});
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
// vazio.html e não carga.html: a segunda já baixa um modelo sozinha, e o
// 404 dela polui o diagnóstico.
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, arq }) => {
    try {
        const mod = await import(`${base}/wllama-cdn/index.js`);
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` });
        await w.loadModelFromUrl(`${base}/${arq}`, {
            n_ctx: 1024, n_batch: 256, n_threads: 4, n_gpu_layers: 0, jinja: true,
        });
        const meta = w.getModelMetadata?.()?.meta ?? {};
        const saida = await w.createChatCompletion({
            messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
            max_tokens: 16,
        });
        return { ok: true, arch: meta['general.architecture'] ?? '?', texto: JSON.stringify(saida).slice(0, 160) };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 300) }; }
}, { base: BASE, arq: ARQ });
console.log(`\n  ${ARQ}: ${r.ok ? 'CARREGOU e gerou · arch ' + r.arch + ' · ' + r.texto : 'FALHOU · ' + r.erro}`);
await browser.close();
