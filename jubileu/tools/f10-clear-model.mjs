/**
 * Verifica a SAÍDA DE EMERGÊNCIA da bancada ("apagar modelo baixado").
 *
 * Ela existe porque o wllama grava o modelo em dois lugares (OPFS e um store
 * endereçado por sha256) mas só sabe listar e apagar o primeiro. Dá para ficar
 * com um registro apontando para um arquivo que a listagem não enxerga, e aí
 * toda carga morre em "Model file not found" sem nada no jogo capaz de desfazer.
 * Se este botão não liberar espaço de verdade, ele não serve para nada.
 *
 * Uso:
 *   CHROMIUM_PATH=... node tools/f10-clear-model.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--unlimited-storage',
    ],
});
const context = await browser.newContext();
const page = await context.newPage();
await context.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__npcModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_MODEL_URL });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });

console.log('Baixando o modelo para ter o que apagar…');
await page.evaluate(() => { void window.__f10bench.initLLM(); });
const t0 = Date.now();
let fase = '';
while (Date.now() - t0 < 500_000) {
    fase = await page.evaluate(() => window.__f10bench.npc.phase).catch(() => 'error');
    if (fase === 'ready' || fase === 'error') break;
    await page.waitForTimeout(3000);
}
console.log('carga:', fase);

const uso = () => page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
const antes = await uso();
console.log('em uso ANTES:', (antes / 1e9).toFixed(2), 'GB');

await page.getByText('apagar modelo baixado').click();
await page.waitForTimeout(8000);
const depois = await uso();
console.log('em uso DEPOIS:', (depois / 1e9).toFixed(2), 'GB');

// O modelo é a maior coisa guardada; se o botão funcionou, some quase tudo.
const ok = depois < Math.max(0.2e9, antes / 2);
console.log(ok ? 'OK: apagou de verdade' : 'REPROVADO: o espaço continua ocupado');
await browser.close();
process.exit(ok ? 0 : 1);
