import { chromium } from 'playwright';

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:8710/ngram.html';
const LIMITE_MS = Number(process.argv[3] ?? 600_000);

// Em máquina com o Chromium do Playwright instalado normalmente, deixe vazio.
// Em ambiente com o binário fora do lugar (como o container onde isto nasceu),
// aponte CHROMIUM_BIN para o executável.
const executablePath = process.env.CHROMIUM_BIN || undefined;

const navegador = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    '--enable-features=SharedArrayBuffer',
    '--no-sandbox',
    '--js-flags=--experimental-wasm-jspi',
  ],
});
const pagina = await navegador.newPage();
pagina.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text()}`));
pagina.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

await pagina.goto(URL_BASE, { waitUntil: 'domcontentloaded' });

try {
  await pagina.waitForFunction(() => globalThis.__resultado !== null, null, { timeout: LIMITE_MS });
} catch {
  console.log('TIMEOUT — último texto da página:');
  console.log(await pagina.textContent('#saida'));
  await navegador.close();
  process.exit(2);
}

const resultado = await pagina.evaluate(() => globalThis.__resultado);
console.log('\n===== RESULTADO =====');
console.log(JSON.stringify(resultado, null, 2));
await navegador.close();
process.exit(resultado?.ok ? 0 : 1);
