/** Smoke test do caminho real Menu -> Modo Criador -> YOURSELF. */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F8_URL ?? 'http://127.0.0.1:3000/';
const shot = process.env.F8_MENU_SHOT ?? '/tmp/f8-menu-boss.png';
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
await page.getByRole('button', { name: 'MODO CRIADOR', exact: true }).click();
await page.locator('[data-creator-floor="floor-8-yourself"]').click();
await page.locator('[data-creator-start]').click();
await page.waitForSelector('[data-f8-boss-intro]', { timeout: 15_000 });
await page.screenshot({ path: shot });

const state = await page.evaluate(() => ({
  hasBossIntro: !!document.querySelector('[data-f8-boss-intro]'),
  bodyHasYourself: document.body.innerText.includes('YOURSELF'),
  hasDirectHook: typeof window.__startFloor8Boss === 'function',
}));
await browser.close();
if (!state.hasBossIntro || !state.bodyHasYourself) throw new Error(`Creator boss teleport failed: ${JSON.stringify(state)}`);
console.log(JSON.stringify({ state, errors, shot }, null, 2));
