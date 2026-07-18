/** Visual smoke runner for the painted Floor 8 finale.
 *
 * CHROMIUM_PATH=/path/to/chromium node tools/f8-finale-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F8_URL ?? 'http://127.0.0.1:3000/';
const out = process.env.F8_FINALE_SHOT_DIR ?? '/tmp/f8-finale-shots';
await mkdir(out, { recursive: true });

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
await page.waitForFunction(() => typeof window.__startFloor8Finale === 'function');
await page.evaluate(() => window.__startFloor8Finale());
await page.waitForTimeout(800);

for (const [t, name] of [
    [0.7, '01-elevator'], [3.75, '02-turn-reveal'], [5.7, '03-approach'],
    [7.45, '04-grip'], [8.55, '05-push'], [9.35, '06-black'],
]) {
    await page.evaluate((time) => window.__f8FinaleSeek(time), t);
    await page.waitForTimeout(70);
    await page.screenshot({ path: `${out}/${name}.png` });
}

await browser.close();
if (errors.length) throw new Error(`Floor 8 finale browser errors:\n${errors.join('\n')}`);
console.log(JSON.stringify({ out, errors }, null, 2));
