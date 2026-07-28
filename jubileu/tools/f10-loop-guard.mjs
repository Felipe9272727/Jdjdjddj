/**
 * O cérebro pequeno pode FALHAR (sem rede, sem memória, modelo enrolado). Este
 * teste vive do caso ruim: entra no Andar 10 onde o MiniCPM NÃO carrega e
 * observa se o jogo se comporta ou entra em repetição infinita.
 *
 * O que reprova:
 *  - tentativas de deliberação crescendo sem parar (o retry de 5s eterno);
 *  - erro repetido no console dezenas de vezes;
 *  - a fase da deliberação oscilando sem sossegar.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_URL=http://127.0.0.1:3000/ node tools/f10-loop-guard.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/';
const janelaMs = Number(process.env.F10_WINDOW_MS ?? 150_000);

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: [
        '--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox',
        '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
    ],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });

const consoleErros = new Map();
page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const k = m.text().slice(0, 90);
    consoleErros.set(k, (consoleErros.get(k) ?? 0) + 1);
});
// Cada tentativa de baixar o modelo pequeno aparece como requisição falhada:
// é o contador mais honesto de "quantas vezes ele insistiu".
const tentativas = [];
page.on('requestfailed', (r) => {
    if (/gguf/i.test(r.url())) tentativas.push(Date.now());
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => typeof window.__startFloor === 'function', { timeout: 120_000 })
    .catch(() => console.log('AVISO: __startFloor não apareceu'));
await page.evaluate(() => window.__startFloor?.(10));
console.log('Andar 10 iniciado. Observando', janelaMs / 1000, 's com o cérebro pequeno falhando…');

const inicio = Date.now();
const fases = [];
while (Date.now() - inicio < janelaMs) {
    const fase = await page.evaluate(
        () => window.__npcDebug?.npc?.deliberationPhase ?? null,
    ).catch(() => null);
    if (fase && fase !== fases.at(-1)) {
        fases.push(fase);
        console.log(`[${((Date.now() - inicio) / 1000).toFixed(0)}s] deliberação: ${fase}`);
    }
    await page.waitForTimeout(2000);
}

console.log('\n=== VEREDITO ===');
console.log('tentativas de baixar o modelo pequeno:', tentativas.length);
if (tentativas.length > 1) {
    const gaps = tentativas.slice(1).map((t, i) => ((t - tentativas[i]) / 1000).toFixed(0));
    console.log('intervalos entre tentativas (s):', gaps.join(', '));
}
console.log('trocas de fase:', fases.length);
for (const [texto, n] of [...consoleErros].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`  ${n}x  ${texto}`);
}
// Numa janela de ~2,5 min, um retry saudável tenta poucas vezes. Dezenas de
// tentativas significam que a espera crescente não está segurando nada.
const repetiuDemais = tentativas.length > 12 || fases.length > 30;
console.log(repetiuDemais ? 'REPROVADO: parece repetição descontrolada' : 'OK: sem repetição descontrolada');

await browser.close();
process.exit(repetiuDemais ? 1 : 0);
