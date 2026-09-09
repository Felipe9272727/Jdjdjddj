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
  for (const mood of ['angry', 'surprised']) {
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?mood=${mood}`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${mood}.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('http://127.0.0.1:5173/diabrete-preview.html');
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/mobile.png` });
  await page.getByRole('checkbox').check();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/speaking.png` });
  for (const [name, angle] of [['full-rig', 0], ['full-rig-profile', 1.57]]) {
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?rig=1&angle=${angle}`);
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.documentElement.dataset.diabreteRig === 'ready');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  await page.getByRole('checkbox').check();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/full-rig-speaking.png` });

  // Deterministic acting samples. The preview resets the neutral base pose,
  // calls begin/apply at a fixed time, and exposes drift/finite checks.
  const actingViews = [
    ['acting-intro-point', 'intro', 'point', 0.40, 0.40, 2, 1],
    ['acting-intro-laugh', 'intro', 'laugh', 0.65, 0.65, 6, 1],
    ['acting-fall-beg', 'fall', 'beg', 1.20, 1.20, 0, 1],
    ['acting-fall-stomp', 'fall', 'stomp', 0.90, 0.90, 7, 0],
  ];
  for (const [name, scene, phase, time, phaseTime, line, speaking] of actingViews) {
    const query = new URLSearchParams({
      rig: '1', scene, phase,
      time: String(time), phaseTime: String(phaseTime),
      line: String(line), speaking: String(speaking), angle: '0',
    });
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?${query}`);
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.documentElement.dataset.f3Acting === 'ready');
    await page.waitForTimeout(650);
    await page.waitForFunction(() => document.documentElement.dataset.f3ActingFinite === 'true');
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}/result.json`, JSON.stringify({ ok: true, views: 15, actingViews: actingViews.length, errors }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), errors }));
  throw error;
} finally { await browser.close(); }
