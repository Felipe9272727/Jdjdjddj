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
    // O perfil do Playwright é temporário e a cota do OPFS sai do disco livre.
    // Sem isto, guardar um GGUF de 1,92 GB levanta QuotaExceededError e o teste
    // mede a cota da máquina, não o runtime.
    '--unlimited-storage',
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
// ── O RELATÓRIO VAI PARA ARQUIVO, SEMPRE ──────────────────────────────────
// Duas vezes hoje eu rodei uma medição de 13 minutos, ela imprimiu o resultado
// certo, e o meu próprio `| tail -N` cortou a parte que interessava: o veredito
// dos quadros na primeira, os dados do Llama 1B na segunda. O dado existiu e
// morreu no encanamento.
//
// Console pode ser truncado por quem lê; arquivo não. O caminho é fixo e
// previsível para não depender de eu lembrar de redirecionar.
const RELATORIO = process.env.RELATORIO
  ?? `/tmp/bancada-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
try {
  (await import('node:fs')).writeFileSync(RELATORIO, JSON.stringify(resultado, null, 2));
  console.log(`\n>>> relatório completo em ${RELATORIO}`);
} catch (e) {
  console.log(`não consegui gravar o relatório: ${e?.message}`);
}
console.log('\n===== RESULTADO =====');
console.log(JSON.stringify(resultado, null, 2));
await navegador.close();
process.exit(resultado?.ok ? 0 : 1);
