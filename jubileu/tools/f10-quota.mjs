/**
 * Quanto o navegador deixa este site guardar? O modelo do Nilo só fica em cache
 * se couber na cota da ORIGEM; quando não cabe, o wllama estoura QuotaExceeded
 * dentro do Worker e a carga trava sem mensagem nenhuma.
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: ['--no-sandbox', '--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

const info = await page.evaluate(async () => {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    const granted = await navigator.storage?.persist?.();
    return {
        quotaGB: est?.quota ? +(est.quota / 1e9).toFixed(2) : null,
        usageGB: est?.usage ? +(est.usage / 1e9).toFixed(3) : 0,
        persistedAntes: persisted ?? null,
        persistConcedido: granted ?? null,
    };
});
const MODELO_FALA = 1.915;
const MODELO_MINI = 0.688;
console.log(JSON.stringify(info, null, 2));
console.log(`\nmodelo de fala: ${MODELO_FALA} GB · mini: ${MODELO_MINI} GB · juntos: ${(MODELO_FALA + MODELO_MINI).toFixed(2)} GB`);
if (info.quotaGB !== null) {
    const livre = info.quotaGB - info.usageGB;
    console.log(`cabe o de fala?  ${livre > MODELO_FALA ? 'SIM' : 'NÃO'} (livre ${livre.toFixed(2)} GB)`);
    console.log(`cabem os dois?   ${livre > MODELO_FALA + MODELO_MINI ? 'SIM' : 'NÃO'}`);
}

await browser.close();
