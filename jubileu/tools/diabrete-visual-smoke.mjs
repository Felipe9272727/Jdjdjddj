import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const out = '../diabrete-qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const [name, angle] of [['front', 0], ['three-quarter', 0.65], ['profile', 1.57], ['back', 3.14]]) {
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?angle=${angle}`);
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('http://127.0.0.1:5173/diabrete-preview.html');
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/mobile.png` });
  await page.getByRole('checkbox').check();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/speaking.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}/result.json`, JSON.stringify({ ok: true, views: 6, errors }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), errors }));
  throw error;
} finally { await browser.close(); }
