/**
 * O seletor de threads da bancada só vale se a escolha REALMENTE chegar ao
 * motor: as threads são fixadas no load do wllama e não mudam depois, então
 * um botão que não sobrevive ao reload seria decoração.
 *
 * Aqui clicamos num número, deixamos a página recarregar e conferimos que o
 * ambiente e a etiqueta passam a falar aquele número.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-thread-picker.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const context = await browser.newContext();
const page = await context.newPage();
await context.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__npcModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_MODEL_URL });

const lerThreads = () => page.evaluate(
    () => window.__f10bench.ambiente().threadsQueVamosUsar,
);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
console.log('automático:', await lerThreads());

for (const alvo of [2, 4]) {
    // O clique recarrega a página; esperamos o gancho voltar.
    await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        page.getByRole('button', { name: String(alvo), exact: true }).click(),
    ]);
    await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
    const lido = await lerThreads();
    console.log(`escolhi ${alvo} → motor diz ${lido}`, lido === alvo ? 'OK' : 'FALHOU');
    if (lido !== alvo) { await browser.close(); process.exit(1); }
}

await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.getByRole('button', { name: 'automático' }).click(),
]);
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
console.log('voltou ao automático:', await lerThreads());

console.log('OK: a escolha sobrevive ao reload e chega ao motor');
await browser.close();
