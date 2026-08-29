/**
 * Prova que o MTP LIGA no wasm implantado, antes de alguém baixar 2,12 GB
 * num plano de celular para descobrir que não.
 *
 * O que ele confere não é velocidade — é se o llama.cpp registra a
 * implementação. Sem `--spec-type` a inicialização morre com "no
 * implementations specified", e o remendo WLLAMA_PATCH_TNE deste wasm é a
 * única porta: sobrecarrega `spec_draft_model` com o prefixo `types:`.
 *
 *     node bancada-navegador/mtp-navegador.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';

/** Um GGUF que tenha cabeça MTP. Ex.: Qwen3.5-0.8B-MTP-GGUF Q4_K_M, 550 MB. */
const MODELO = process.env.MODELO ?? '/home/user/qwen08b-mtp.gguf';
const RAIZ = '/tmp/mtpraiz';
if (existsSync(RAIZ)) rmSync(RAIZ, { recursive: true, force: true });
mkdirSync(RAIZ, { recursive: true });
copyFileSync('bancada-navegador/vazio.html', `${RAIZ}/vazio.html`);
symlinkSync(MODELO, `${RAIZ}/m.gguf`);
symlinkSync(process.env.MOTOR ?? `${process.cwd()}/public/wllama-relaxed`, `${RAIZ}/wllama-relaxed`);

const PORTA = 3411;
const BASE = `http://127.0.0.1:${PORTA}`;
const srv = spawn('node', ['bancada-navegador/servidor.mjs', RAIZ, String(PORTA)],
    { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const p = await b.newPage();
const nativo = [];
p.on('console', (m) => {
    const t = m.text();
    if (/WLLAMA_PATCH_TNE|adding speculative|no implementations|accepted|draft/i.test(t)) {
        nativo.push(t.slice(0, 200));
    }
});
await p.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const medir = async (nMax) => p.evaluate(async ({ base, nMax }) => {
    const mod = await import(`${base}/wllama-relaxed/index.js`);
    const linhas = [];
    globalThis.__linhas = linhas;
    const pega = (...a) => linhas.push(a.map(String).join(' '));
    const w = new mod.Wllama({ default: `${base}/wllama-relaxed/wllama.wasm` },
        { suppressNativeLog: false, logger: { debug: pega, log: pega, warn: pega, error: pega } });
    await w.loadModelFromUrl(`${base}/m.gguf`, {
        n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: false,
        ...(nMax ? {
            spec_draft_model: 'types:draft-mtp',
            spec_draft_n_max: nMax, spec_draft_n_min: 1,
            spec_draft_p_min: 0, spec_draft_threads: 4,
        } : {}),
    });
    const msgs = [{ role: 'user', content: 'Explique como funciona um elevador antigo.' }];
    const uma = async () => {
        const t0 = performance.now();
        await w.createChatCompletion({
            messages: msgs, n_predict: 64, temp: 0, cache_prompt: false, ignore_eos: true,
        });
        return performance.now() - t0;
    };
    await uma();                       // aquece
    const t = [await uma(), await uma(), await uma()];
    await w.exit?.();
    return { t, linhas: linhas.filter((l) => /spec|draft|WLLAMA_PATCH|implementation|accept/i.test(l)).slice(0, 12) };
}, { base: BASE, nMax });

for (const n of [0, 1, 2]) {
    nativo.length = 0;
    let r;
    try { r = await medir(n); } catch (e) { console.log(`  n-max ${n}: FALHOU — ${e.message}`); continue; }
    const t = r.t;
    const ms = t.reduce((a, x) => a + x, 0) / t.length;
    const rot = n ? `MTP n-max ${n}` : 'CONTROLE   ';
    console.log(`  ${rot}  ${(64000 / ms).toFixed(2)} tok/s   (${t.map((x) => Math.round(x)).join(' ')} ms)`);
    for (const l of r.linhas) console.log(`      ‹nativo› ${l.slice(0, 160)}`);
}
await b.close(); srv.kill();
