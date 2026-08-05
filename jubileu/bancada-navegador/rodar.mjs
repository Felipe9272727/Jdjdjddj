import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:8710/ngram.html';
const LIMITE_MS = Number(process.argv[3] ?? 600_000);

// Em máquina com o Chromium do Playwright instalado normalmente, deixe vazio.
// Em ambiente com o binário fora do lugar (como o container onde isto nasceu),
// aponte CHROMIUM_BIN para o executável.
//
// ── E ELE PROCURA SOZINHO ────────────────────────────────────────────────
// O container troca a versão do Chromium entre sessões (era o 1223, virou o
// 1194) e o playwright morre pedindo `npx playwright install` — que aqui não
// resolve, porque o binário existe, só está com outro número. Uma medição
// perdida por isso é uma medição perdida à toa.
function acharChromium() {
    if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
    const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    let pastas = [];
    try { pastas = fs.readdirSync(raiz); } catch { return undefined; }
    const candidatos = pastas
        .filter((p) => p.startsWith('chromium'))
        // headless_shell por último: ele não abre o mesmo runtime gráfico.
        .sort((a, b) => Number(a.includes('headless')) - Number(b.includes('headless')));
    for (const pasta of candidatos) {
        for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
            const alvo = path.join(raiz, pasta, rel);
            if (fs.existsSync(alvo)) return alvo;
        }
    }
    return undefined;
}
const executablePath = acharChromium();

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
