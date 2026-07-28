/**
 * Diagnóstico do NPC do Andar 10 rodando O JOGO DE VERDADE.
 *
 * Sobe o Chromium, entra no Andar 10, abre a conversa pelo gancho de depuração,
 * manda uma mensagem e relata: isolamento cross-origin (que decide se o wllama
 * pode usar várias threads), erros de console, a etiqueta do motor (que carrega
 * as medições reais de tokens/s) e quanto tempo a resposta levou.
 *
 * Runtime e modelo podem apontar para cópias LOCAIS, o que permite medir o NPC
 * numa máquina sem acesso externo:
 *   F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama
 *   F10_MODEL_URL=http://127.0.0.1:3000/models/smollm3.gguf
 *
 * Uso:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   F10_URL=http://127.0.0.1:3000/ node tools/f10-npc-probe.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/';
const budgetMs = Number(process.env.F10_BUDGET_MS ?? 900_000);

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
    ],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

// Aponta runtime e modelo para cópias locais ANTES de o app carregar.
const localCdn = process.env.F10_WLLAMA_CDN;
const localModel = process.env.F10_MODEL_URL;
const forcedGpuLayers = process.env.F10_GPU_LAYERS;
if (localCdn || localModel || forcedGpuLayers !== undefined) {
    await page.addInitScript(({ cdn, model, gpu }) => {
        if (cdn) window.__wllamaCdn = cdn;
        if (model) window.__npcModelUrl = model;
        if (gpu !== undefined) window.__npcGpuLayers = Number(gpu);
    }, { cdn: localCdn, model: localModel, gpu: forcedGpuLayers });
}

const errors = [];
let crashed = false;
// Uma aba que MORRE (estouro de memória do WASM, por exemplo) não gera
// pageerror: ela some. Sem isto o sintoma vira só "evaluate falhou".
page.on('crash', () => { crashed = true; errors.push('ABA MORREU (crash do renderer)'); });
page.on('close', () => { crashed = true; });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => {
    const u = r.url();
    // Ruído previsível desta caixa sem internet: música, fontes, telemetria.
    if (/fonts\.googleapis|githubusercontent|firestore|google\.com/.test(u)) return;
    errors.push(`requestfailed: ${u.slice(0, 110)} — ${r.failure()?.errorText}`);
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });

const env = await page.evaluate(() => ({
    crossOriginIsolated: globalThis.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webgpu: 'gpu' in navigator,
}));
console.log('AMBIENTE:', JSON.stringify(env));

await page.waitForFunction(() => typeof window.__startFloor === 'function', { timeout: 120_000 })
    .catch(() => console.log('AVISO: __startFloor não apareceu'));
console.log('ANDAR 10:', await page.evaluate(() => {
    if (typeof window.__startFloor === 'function') { window.__startFloor(10); return true; }
    return false;
}));
await page.waitForTimeout(6000);

await page.waitForFunction(() => !!window.__npcDebug, { timeout: 60_000 })
    .catch(() => console.log('AVISO: __npcDebug ausente'));
console.log('ABRIU:', await page.evaluate(() => {
    window.__npcDebug?.open();
    return !!window.__npcDebug;
}));
await page.waitForTimeout(1500);
console.log('ENVIOU:', await page.evaluate(() => {
    window.__npcDebug?.send('Oi, qual o seu nome?');
    return true;
}), 'em', ((Date.now() - t0) / 1000).toFixed(1), 's');

const sentAt = Date.now();
let lastLabel = '';
let lastPhase = '';
let lastText = '';
let answered = false;
while (Date.now() - sentAt < budgetMs) {
    if (crashed) { console.log('ABA MORREU antes de responder'); break; }
    const snap = await page.evaluate(() => {
        const s = window.__npcDebug?.npc;
        return s ? {
            phase: s.phase,
            label: s.modelLabel,
            loadText: s.loadText,
            progress: s.loadProgress,
            streaming: (s.streaming ?? '').length,
            last: s.history?.at(-1)?.content?.slice(0, 160) ?? '',
            lastRole: s.history?.at(-1)?.role ?? '',
            error: s.error,
        } : null;
    }).catch((e) => {
        console.log(`AVALIAÇÃO FALHOU: ${String(e).split('\n')[0]}`);
        return null;
    });
    if (!snap) break;
    const elapsed = ((Date.now() - sentAt) / 1000).toFixed(0);
    if (snap.label !== lastLabel) { lastLabel = snap.label; console.log(`[${elapsed}s] ETIQUETA: ${snap.label}`); }
    if (snap.phase !== lastPhase) { lastPhase = snap.phase; console.log(`[${elapsed}s] FASE: ${snap.phase}`); }
    // O texto de carga carrega o % do download e as trocas de plano (WebGPU→CPU).
    if (snap.loadText !== lastText) {
        lastText = snap.loadText;
        console.log(`[${elapsed}s] ${snap.loadText}${snap.streaming ? ` · ${snap.streaming} chars` : ''}`);
    }
    if (snap.phase === 'ready' && snap.lastRole === 'assistant' && snap.last) {
        answered = true;
        console.log(`[${elapsed}s] RESPOSTA: ${snap.last}`);
        break;
    }
    if (snap.error) { console.log(`[${elapsed}s] ERRO: ${snap.error}`); break; }
    await page.waitForTimeout(3000);
}
console.log('RESPONDEU:', answered, 'em', ((Date.now() - sentAt) / 1000).toFixed(1), 's');
console.log('ETIQUETA FINAL:', lastLabel);

console.log('\n=== ERROS RELEVANTES ===');
for (const e of [...new Set(errors)].slice(0, 15)) console.log(' -', e.slice(0, 220));

await browser.close();
