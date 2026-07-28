/**
 * Abrir o jogo COMO ARQUIVO (file://) tira os cabeçalhos COOP/COEP que o
 * servidor manda. Sem eles não há crossOriginIsolated, sem isso não há
 * SharedArrayBuffer, e sem isso o wllama cai para UMA thread — o oposto do que
 * se quer ao "tirar o navegador do caminho".
 *
 * Este teste mede isso em vez de supor: abre o index.html gerado por file:// e
 * pergunta ao próprio motor quantas threads ele vai usar.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-file-protocol.mjs [caminho/index.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const arquivo = path.resolve(process.argv[2] ?? '../index.html');

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message.slice(0, 120)));

await page.goto(`file://${arquivo}?bancada`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 })
    .catch(() => console.log('AVISO: a bancada não montou'));

const amb = await page.evaluate(() => window.__f10bench?.ambiente?.() ?? null)
    .catch(() => null);
console.log('POR ARQUIVO (file://):', JSON.stringify(amb, null, 2));

if (amb) {
    console.log('\nisolado:', amb.crossOriginIsolated);
    console.log('SharedArrayBuffer:', amb.sharedArrayBuffer);
    console.log('threads que o motor vai usar:', amb.threadsQueVamosUsar);
    console.log(amb.threadsQueVamosUsar > 1
        ? 'OK: multi-thread sobrevive ao file://'
        : 'ATENÇÃO: cai para 1 thread — vai ficar MUITO mais lento que pelo servidor');
}
if (erros.length) console.log('\nerros:', [...new Set(erros)].slice(0, 5));
await browser.close();
