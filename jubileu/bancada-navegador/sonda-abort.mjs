// ── POR QUE ESTE GGUF NÃO CARREGA ────────────────────────────────────────
//
// A bancada sobe o wllama com `suppressNativeLog: true`, que é certo para
// medir (o llama.cpp é falante) e péssimo para diagnosticar: um `(ABORT)` sem
// texto não diz nada. Esta sonda faz o contrário — carrega UM modelo com o log
// nativo ligado e repete o que ele disser.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3405';
const ARQ = process.env.ARQ ?? 'mobile.gguf';
const PACOTE = process.env.PACOTE ?? 'wllama-cdn';
const process_TUDO = process.env.TUDO === '1';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('console', (m) => {
    const t = m.text();
    // TUDO=1 repete o log inteiro. O filtro abaixo é bom para achar a linha
    // do erro, e ruim para achar a linha ANTES do erro — que no caso do
    // MobileLLM era a que importava.
    if (process_TUDO || /error|abort|unknown|unsupported|missing|failed|not found|arch|template|jinja|chat/i.test(t)) {
        console.log('  ‹nativo› ' + t.slice(0, 300));
    }
});
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
// vazio.html e não carga.html: a segunda já baixa um modelo sozinha, e o
// 404 dela polui o diagnóstico.
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, arq, pacote }) => {
    try {
        // ── QUAL BUILD DO wllama ─────────────────────────────────────────
        //
        // `PACOTE=wllama-360` troca a build sem tocar no resto. Existe porque o
        // wasm de `wllama-cdn` é de 5 de agosto e o de `wllama-360` é de 19: a
        // diferença de duas semanas é a diferença entre construir o grafo de
        // uma arquitetura híbrida e recusar com `missing tensor`.
        const mod = await import(`${base}/${pacote}/index.js`);
        const w = new mod.Wllama({ default: `${base}/${pacote}/wasm/wllama.wasm` });
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
}, { base: BASE, arq: ARQ, pacote: PACOTE });
console.log(`\n  ${ARQ}: ${r.ok ? 'CARREGOU e gerou · arch ' + r.arch + ' · ' + r.texto : 'FALHOU · ' + r.erro}`);
await browser.close();
