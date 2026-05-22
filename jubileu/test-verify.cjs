const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-certificate-errors'],
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failed404 = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() === 404) failed404.push(r.url()); });

  console.log('Loading game...');
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);

  const click = async (pred, label) => {
    const box = await page.evaluate((p) => {
      const btns = [...document.querySelectorAll('button')];
      const fn = new Function('t', `return ${p}`);
      const btn = btns.find(b => fn(b.textContent || '') && b.offsetParent !== null);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    }, pred);
    if (box) { await page.mouse.click(box.x, box.y); console.log('  clicked', label); return true; }
    console.log('  NOT FOUND:', label); return false;
  };

  await click("t.includes('CRIADOR')", 'MODO CRIADOR');
  await page.waitForTimeout(1500);
  await click("t.includes('Andar 2')", 'Andar 2');
  await page.waitForTimeout(800);
  await click("t.includes('INICIAR')", 'INICIAR');
  console.log('Waiting for Floor 2 to load...');
  await page.waitForTimeout(9000);

  await page.screenshot({ path: '/tmp/verify-floor2.png' });

  // Measure FPS over 3 seconds via requestAnimationFrame
  console.log('Measuring FPS for 3s (idle)...');
  const idleFps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0; const t0 = performance.now();
    function loop() {
      frames++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
      else resolve(Math.round(frames / ((performance.now() - t0) / 1000)));
    }
    requestAnimationFrame(loop);
  }));
  console.log('  idle FPS:', idleFps);

  // Measure FPS while walking (W held) — this is when lag was reported
  console.log('Measuring FPS for 3s (walking)...');
  await page.keyboard.down('w');
  const walkFps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0; const t0 = performance.now();
    function loop() {
      frames++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
      else resolve(Math.round(frames / ((performance.now() - t0) / 1000)));
    }
    requestAnimationFrame(loop);
  }));
  await page.keyboard.up('w');
  console.log('  walking FPS:', walkFps);

  await page.screenshot({ path: '/tmp/verify-floor2-walked.png' });

  // Canvas check
  const canvasOk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  console.log('Canvas:', JSON.stringify(canvasOk));

  console.log('\n=== RESULTS ===');
  console.log('404s:', failed404.length ? failed404 : 'NONE');
  console.log('Console errors:', consoleErrors.length ? consoleErrors : 'NONE');
  console.log('Page errors:', pageErrors.length ? pageErrors : 'NONE');
  console.log('Idle FPS:', idleFps, '| Walking FPS:', walkFps);
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
