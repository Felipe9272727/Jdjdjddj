/**
 * Roda o CÉREBRO PEQUENO de verdade no navegador e mede as travas contra loop.
 *
 * A preocupação do dono do jogo é concreta: modelo pequeno de raciocínio entra
 * em cadeia circular. Teste de unidade cobre as funções puras; isto cobre o que
 * elas não alcançam — o teto de tempo por rodada e a promessa que pode nunca
 * resolver dentro do Worker.
 *
 * Numa caixa sem o MiniCPM, qualquer GGUF local serve de dublê: o que está sob
 * teste é o ARREIO (gramática, teto de tokens, timeout, parse), não o modelo.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-small-brain.mjs
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
        '--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--unlimited-storage',
    ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

await page.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__smallBrainModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_SMALL_MODEL });

const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 120)); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });

// Chama a deliberação diretamente, com um estado de mundo plausível.
const t0 = Date.now();
console.log('Disparando uma deliberação real…');
const resultado = await page.evaluate(async (limite) => {
    const mod = await import('/src/npc/floor10SmallBrain.ts');
    const perc = {
        player: { visible: true, direction: 'ahead', distance: 3.1 },
        elevator: { visible: true, distance: 4.2 },
    };
    const começou = performance.now();
    const decidido = await Promise.race([
        mod.deliberateFloor10({
            perception: perc,
            drives: { social: 0.6, curiosity: 0.7, restlessness: 0.4, fatigue: 0.2 },
            memory: {
                inspectedElevatorCount: 3, sleeps: 44, playerSilentSeconds: 30,
                lastGoals: ['idle'], agreedAction: null, agreedReason: null,
            },
            now: 10,
        }),
        new Promise((r) => setTimeout(() => r('__ESTOUROU__'), limite)),
    ]);
    return {
        segundos: +((performance.now() - começou) / 1000).toFixed(1),
        estourou: decidido === '__ESTOUROU__',
        meta: decidido && decidido !== '__ESTOUROU__' ? decidido.goal : null,
        razao: decidido && decidido !== '__ESTOUROU__'
            ? String(decidido.rationale).slice(0, 120) : null,
    };
}, budgetMs - 10_000).catch((e) => ({ falhou: String(e).split('\n')[0] }));

console.log('RESULTADO:', JSON.stringify(resultado, null, 2));
console.log('fase final:', await page.evaluate(
    () => window.__f10bench.npc.deliberationPhase,
).catch(() => '?'));
console.log('texto:', await page.evaluate(
    () => window.__f10bench.npc.deliberationLoadText,
).catch(() => '?'));
console.log('total', ((Date.now() - t0) / 1000).toFixed(1), 's');

if (erros.length) {
    console.log('\nERROS:');
    for (const e of [...new Set(erros)].slice(0, 8)) console.log(' -', e);
}
await browser.close();
