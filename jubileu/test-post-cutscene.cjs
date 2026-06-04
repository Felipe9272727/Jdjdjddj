// Verify player can MOVE after cutscene accept path (the bug user reported)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-certificate-errors'],
    headless: true,
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PE:' + e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CE:' + m.text()); });

  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(4500);

  const click = async (pred) => {
    const box = await page.evaluate((p) => {
      const btns = [...document.querySelectorAll('button')];
      const fn = new Function('t', `return ${p}`);
      const btn = btns.find(b => fn(b.textContent || '') && b.offsetParent !== null);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    }, pred);
    if (box) await page.mouse.click(box.x, box.y);
  };
  await click("t.includes('CRIADOR')");
  await page.waitForTimeout(1500);
  await click("t.includes('Andar 2')");
  await page.waitForTimeout(800);
  await click("t.includes('INICIAR')");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(8000);

  // Walk to trigger cutscene
  await page.keyboard.down('w');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !!document.querySelector('.cs-root'))) {
      await page.keyboard.up('w');
      console.log('cutscene started after walk step ' + i);
      break;
    }
  }

  // Wait for cutscene to end
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => !!document.querySelector('.cs-root')))) {
      console.log('cs closed at ' + (i*0.5) + 's');
      break;
    }
  }

  // Wait for inventory grant (= rebreather animation finished)
  let granted = -1;
  for (let s = 1; s <= 120; s++) {
    await page.waitForTimeout(1000);
    const ok = await page.evaluate(() => {
      const e = [...document.querySelectorAll('[aria-label]')];
      return e.some(el => /noturna/i.test(el.getAttribute('aria-label') || ''));
    });
    if (ok) { granted = s; break; }
  }
  if (granted < 0) { console.log('!!! inventory never granted in 120s'); await browser.close(); return; }
  console.log('inventory granted at +' + granted + 's');

  // Wait extra to ensure 'fading' (2200ms) phase finishes too
  await page.waitForTimeout(3000);
  console.log('post-fading wait done — player should be free now');

  // Probe: try to detect player movement via canvas frame diffs OR via a hook
  // The reliable signal: take a screenshot, press W for 3s, take another, compare hash.
  const beforeBuf = await page.screenshot({ path: '/tmp/post-cs-before-walk.png' });

  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.waitForTimeout(500);

  const afterBuf = await page.screenshot({ path: '/tmp/post-cs-after-walk.png' });

  // Compare by simple byte hash — different = scene moved
  const crypto = require('crypto');
  const h1 = crypto.createHash('md5').update(beforeBuf).digest('hex');
  const h2 = crypto.createHash('md5').update(afterBuf).digest('hex');
  console.log('hash before:', h1);
  console.log('hash after :', h2);
  console.log(h1 === h2 ? '!!! BUG: scene IDENTICAL after pressing W for 3s — player cannot move' : 'OK: scene changed — player moved');

  // Also test: press D to strafe right
  await page.keyboard.down('d');
  await page.waitForTimeout(2000);
  await page.keyboard.up('d');
  await page.waitForTimeout(500);
  const strafeBuf = await page.screenshot({ path: '/tmp/post-cs-after-strafe.png' });
  const h3 = crypto.createHash('md5').update(strafeBuf).digest('hex');
  console.log('hash strafe:', h3);
  console.log(h2 === h3 ? '!!! BUG: scene IDENTICAL after pressing D — strafe blocked too' : 'OK: strafe worked');

  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
