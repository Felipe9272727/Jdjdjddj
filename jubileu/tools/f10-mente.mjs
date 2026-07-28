/**
 * Roda a sala da mente (?mente) de ponta a ponta: manda pensar SEM gramática,
 * que é o modo em que um loop apareceria, e confere que o raciocínio chega na
 * tela e que o veredito de loop é calculado.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-mente.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
await page.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__smallBrainModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_SMALL_MODEL });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('sala da mente montou');

// O mapa precisa render o prompt a partir do estado do mundo.
const prompt = await page.locator('pre').first().innerText();
console.log('\n--- o que ele lê ---\n' + prompt.slice(0, 300));
if (!/SEES:|WANTS:/.test(prompt)) {
    console.log('FALHOU: o prompt não foi montado a partir do mapa');
    await browser.close();
    process.exit(1);
}

console.log('\nmandando pensar (sem gramática)…');
await page.getByRole('button', { name: 'pensar agora' }).click();
// Acompanha a fase do cérebro pequeno: sem isso, "não terminou" não diz se
// ele travou baixando, carregando ou gerando.
const t0 = Date.now();
let ultimo = '';
while (Date.now() - t0 < 600_000) {
    const s = await page.evaluate(() => ({
        fase: window.__f10mente.npc.deliberationPhase,
        texto: window.__f10mente.npc.deliberationLoadText,
        pensando: document.body.innerText.includes('pensando…'),
    })).catch(() => null);
    if (!s) break;
    const marca = `${s.fase} — ${s.texto}`;
    if (marca !== ultimo) {
        ultimo = marca;
        console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${marca}`);
    }
    if (!s.pensando) break;
    await page.waitForTimeout(3000);
}

const rodada = await page.evaluate(() => {
    const secoes = [...document.querySelectorAll('div')];
    const alvo = secoes.find((d) => d.querySelector('b')?.textContent === 'Rodadas');
    return alvo?.innerText.slice(0, 500) ?? '(não achei)';
});
console.log('\n--- rodadas ---\n' + rodada);

if (erros.length) console.log('\nERROS:', [...new Set(erros)].slice(0, 5));
const ok = /tokens/.test(rodada);
console.log(ok ? '\nOK: pensou e registrou a rodada' : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
