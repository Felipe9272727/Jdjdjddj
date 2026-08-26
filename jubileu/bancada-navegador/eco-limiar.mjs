// Roda `eco-limiar.html` num Chromium e repete o resultado no terminal.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
await page.goto(`${BASE}/eco-limiar.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__pronto, null, { timeout: 600000 });
console.log('\n' + await page.evaluate(() => window.__pronto) + '\n');
await browser.close();
