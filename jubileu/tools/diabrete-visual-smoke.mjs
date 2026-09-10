import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const out = '../diabrete-qa';
const faceOnly = process.argv.includes('--face-only');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const angleViews = faceOnly
    ? [['front', 0]]
    : [['front', 0], ['three-quarter', 0.65], ['profile', 1.57], ['back', 3.14]];
  for (const [name, angle] of angleViews) {
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
  if (faceOnly) {
    // Facial QA is intentionally small: desktop front/moods plus one portrait
    // speaking frame. Keep pageerror collection and the same screenshot timing.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5173/diabrete-preview.html');
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    await page.getByRole('checkbox').check();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/speaking.png` });
  } else {
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

    // The helper owns the flight silhouette. Keep the three samples fixed so a
    // screenshot or a CI failure always points at takeoff, apex, or landing.
    const flightViews = [
      ['acting-jump-takeoff', { jumpProgress: '0' }],
      ['acting-jump-apex', { jumpProgress: '0.5' }],
      // Landing uses the helper's dedicated impact clock, which also exercises
      // the optional `landingTime` query path.
      ['acting-jump-landing', { landingTime: '0' }],
    ];
    const flightPoses = new Map();
    for (const [name, flight] of flightViews) {
    const query = new URLSearchParams({
      rig: '1', scene: 'rival', phase: 'run',
      time: '1', phaseTime: '1', line: '-1', speaking: '0', angle: '0',
      ...flight,
    });
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?${query}`);
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.documentElement.dataset.f3Acting === 'ready');
    const sample = await page.evaluate(() => {
      const finiteFlag = document.documentElement.dataset.f3ActingFinite === 'true';
      const values = (document.documentElement.dataset.f3ActingPose || '').split(',').map(Number);
      return { finite: finiteFlag && values.length > 0 && values.every(Number.isFinite), values };
    });
    if (!sample.finite) throw new Error(`${name}: non-finite bone transform`);
    flightPoses.set(name, sample.values);
    await page.screenshot({ path: `${out}/${name}.png` });
    }
    const takeoff = flightPoses.get('acting-jump-takeoff');
    const apex = flightPoses.get('acting-jump-apex');
    const landing = flightPoses.get('acting-jump-landing');
    const differs = (a, b) => a.length === b.length
      && a.some((value, i) => Math.abs(value - b[i]) > 1e-6);
    if (!differs(takeoff, apex) || !differs(apex, landing)) {
      throw new Error('jump samples did not change the acting pose');
    }

    // Head pitch and roll are applied after poseDoGesto. The neck anchors in the
    // rig therefore move with the sampled head instead of leaving a rigid seam.
    const headViews = [
      ['acting-head-pitch', { headPitch: '0.24', headRoll: '0' }],
      ['acting-head-roll', { headPitch: '0', headRoll: '-0.22' }],
    ];
    const headPoses = new Map();
    for (const [name, head] of headViews) {
    const query = new URLSearchParams({
      rig: '1', scene: 'rival', phase: 'run',
      time: '0.5', phaseTime: '0.5', line: '-1', speaking: '0', angle: '0', ...head,
    });
    await page.goto(`http://127.0.0.1:5173/diabrete-preview.html?${query}`);
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.documentElement.dataset.f3Acting === 'ready');
    const sample = await page.evaluate(() => {
      const finiteFlag = document.documentElement.dataset.f3ActingFinite === 'true';
      const values = (document.documentElement.dataset.f3ActingPose || '').split(',').map(Number);
      return { finite: finiteFlag && values.length > 0 && values.every(Number.isFinite), values };
    });
    if (!sample.finite) throw new Error(`${name}: non-finite bone transform`);
    headPoses.set(name, sample.values);
    await page.screenshot({ path: `${out}/${name}.png` });
    }
    if (!differs(headPoses.get('acting-head-pitch'), headPoses.get('acting-head-roll'))) {
      throw new Error('head pitch/roll samples did not change the acting pose');
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${out}/result.json`, JSON.stringify({ ok: true, mode: faceOnly ? 'face-only' : 'full', views: faceOnly ? 4 : 20, errors }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(error), errors }));
  throw error;
} finally { await browser.close(); }
