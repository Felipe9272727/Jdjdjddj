/** Visual smoke runner for O VIVEIRO and its ecosystem states.
 *
 * CHROMIUM_PATH=/path/to/chromium node tools/f9-overhaul-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F9_URL ?? 'http://127.0.0.1:3000/floor9.html';
const out = process.env.F9_SHOT_DIR ?? '/tmp/f9-overhaul-shots';
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
await page.waitForFunction(() => window.__ready === true && window.__f9dbg);

await page.evaluate(() => window.__f9dbg.skipQueda());
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01-landing-corridor.png` });

await page.evaluate(() => window.__f9dbg.posRef.current.set(-12, 0, -23));
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/02-painted-ecosystem.png` });

await page.evaluate(() => window.__f9dbg.posRef.current.set(21.5, 0, -9.5));
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/03-relic-shrine.png` });

await page.evaluate(() => window.__f9dbg.warpCycle(.81));
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/04-wave-warning.png` });

await page.evaluate(() => window.__f9dbg.posRef.current.set(8.5, 0, -42));
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/05-root-locked.png` });

await page.evaluate(() => window.__f9dbg.collectRelics());
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/06-root-awake.png` });

await browser.close();
if (errors.length) throw new Error(`Floor 9 browser errors:\n${errors.join('\n')}`);
console.log(JSON.stringify({ out, errors }, null, 2));
