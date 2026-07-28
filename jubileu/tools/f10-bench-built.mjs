/**
 * Confere que a bancada existe no BUILD publicado, aberta por `?bancada`.
 *
 * O build single-file emite um index.html só: o floor10.html do dev não vai
 * junto. Sem esta verificação, a bancada "existe" na máquina de quem programa
 * e dá 404 justamente no celular, que é onde o problema acontece.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-bench-built.mjs [caminho/do/index.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const file = path.resolve(process.argv[2] ?? 'dist/index.html');

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

await page.goto(`file://${file}?bancada`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 })
    .catch(() => undefined);

const achou = await page.evaluate(() => ({
    gancho: !!window.__f10bench,
    titulo: document.body.innerText.slice(0, 90).replace(/\n/g, ' | '),
}));
console.log('BANCADA NO BUILD:', JSON.stringify(achou, null, 2));
if (erros.length) console.log('ERROS:', erros.slice(0, 5));
console.log(achou.gancho ? 'OK — `?bancada` abre no arquivo publicado' : 'FALHOU');

await browser.close();
process.exit(achou.gancho ? 0 : 1);
