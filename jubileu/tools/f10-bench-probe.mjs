/**
 * Mede o cérebro do Nilo NA BANCADA (floor10.html), sem jogo em volta.
 *
 * O par desta sonda é a f10-npc-probe.mjs, que mede o mesmo modelo DENTRO do
 * Andar 10. A diferença entre as duas é a conta do que o jogo cobra do modelo:
 * se aqui carrega rápido e lá não, a culpa é do que roda junto, não do wllama.
 *
 * Uso:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   F10_URL=http://127.0.0.1:3000/floor10.html \
 *   F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_MODEL_URL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-bench-probe.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';
const budgetMs = Number(process.env.F10_BUDGET_MS ?? 600_000);

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: [
        '--ignore-certificate-errors',
        '--no-sandbox', '--disable-setuid-sandbox',
        '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // F10_BIG_QUOTA=1 solta a cota de disco do Chromium. Serve para medir a
        // VELOCIDADE do modelo sem esbarrar no limite de armazenamento — que é
        // um problema separado, testado com a cota normal.
        ...(process.env.F10_BIG_QUOTA ? ['--unlimited-storage'] : []),
    ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

const localCdn = process.env.F10_WLLAMA_CDN;
const localModel = process.env.F10_MODEL_URL;
const forcedGpuLayers = process.env.F10_GPU_LAYERS;
await page.addInitScript(({ cdn, model, gpu }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__npcModelUrl = model;
    if (gpu !== undefined) window.__npcGpuLayers = Number(gpu);
    // O log do llama.cpp é o que revela a etapa exata da carga.
    window.__npcVerboseLlama = true;
}, { cdn: localCdn, model: localModel, gpu: forcedGpuLayers });

const errors = [];
let crashed = false;
page.on('crash', () => { crashed = true; errors.push('ABA MORREU (crash do renderer)'); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// Ao vivo: sem isto, um travamento não deixa rastro nenhum até o fim do teste.
page.on('console', (m) => {
    const txt = m.text();
    if (m.type() === 'error') errors.push(txt);
    if (process.env.F10_VERBOSE) console.log(`  · ${txt.slice(0, 180)}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
console.log('AMBIENTE:', JSON.stringify(await page.evaluate(() => window.__f10bench.ambiente())));

const t0 = Date.now();
// Sem o `void`, o evaluate espera a promessa da carga e nada é medido no meio.
await page.evaluate(() => { void window.__f10bench.initLLM(); });
console.log('CARGA pedida');

let lastPhase = '';
let lastText = '';
let enviou = false;
let respondeu = false;
// O número que interessa ao jogador é este: do envio até a resposta.
let enviadoEm = 0;
while (Date.now() - t0 < budgetMs) {
    if (crashed) { console.log('ABA MORREU'); break; }
    const snap = await page.evaluate(() => {
        const s = window.__f10bench.npc;
        return {
            phase: s.phase, label: s.modelLabel, loadText: s.loadText,
            streaming: (s.streaming ?? '').length,
            last: s.history?.at(-1)?.content?.slice(0, 200) ?? '',
            lastRole: s.history?.at(-1)?.role ?? '',
            error: s.error,
        };
    }).catch((e) => { console.log(`AVALIAÇÃO FALHOU: ${String(e).split('\n')[0]}`); return null; });
    if (!snap) break;
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    if (snap.phase !== lastPhase) { lastPhase = snap.phase; console.log(`[${el}s] FASE: ${snap.phase}`); }
    if (snap.loadText !== lastText) {
        lastText = snap.loadText;
        console.log(`[${el}s] ${snap.loadText}${snap.streaming ? ` · ${snap.streaming} chars` : ''}`);
    }
    // Espera o AQUECIMENTO terminar antes de falar — é o caso real: o painel
    // abre quando o jogador chega e ele ainda leva alguns segundos digitando.
    // Falar no exato instante do "ready" mediria a disputa, não a conversa.
    if (!enviou && snap.phase === 'ready' && snap.loadText === 'pronto') {
        enviou = true;
        enviadoEm = Date.now();
        console.log(`[${el}s] AQUECIDO — mandando "oi"`);
        await page.evaluate(() => window.__f10bench.send('Oi, qual o seu nome?'));
    }
    if (enviou && snap.phase === 'ready' && snap.lastRole === 'assistant' && snap.last) {
        respondeu = true;
        console.log(`[${el}s] RESPOSTA: ${snap.last}`);
        console.log(`[${el}s] ETIQUETA: ${snap.label}`);
        console.log(`ESPERA DO JOGADOR: ${((Date.now() - enviadoEm) / 1000).toFixed(1)} s`);
        break;
    }
    if (snap.error) { console.log(`[${el}s] ERRO: ${snap.error}`); break; }
    await page.waitForTimeout(3000);
}
console.log('RESPONDEU:', respondeu, 'total', ((Date.now() - t0) / 1000).toFixed(1), 's');

console.log('\n=== ERROS ===');
for (const e of [...new Set(errors)].slice(0, 12)) console.log(' -', e.slice(0, 200));

await browser.close();
