// Check if cutscene actually grants rebreather + NV inventory (long wait for slow FPS)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-certificate-errors'],
    headless: true,
  });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PE:' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CE:' + m.text()); });

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

  const inv = async () => page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const aria = btns.map(b => (b.getAttribute('aria-label') || b.textContent || '').trim());
    return {
      nv: aria.some(a => /noturna/i.test(a)),
      flash: aria.some(a => /lanterna/i.test(a)),
      rebr: aria.some(a => /rebreather|reciclador|m[áa]scara/i.test(a)),
      btnCount: aria.filter(a => a.length > 0).length,
    };
  });

  // Walk to cutscene
  await page.keyboard.down('w');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !!document.querySelector('.cs-root'))) {
      await page.keyboard.up('w'); break;
    }
  }
  console.log('cutscene active, waiting for end...');
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => !!document.querySelector('.cs-root')))) {
      console.log('cs ended after', i*0.5, 's'); break;
    }
  }

  // Wait up to 2 MIN for rebreather animation to complete (slow swiftshader)
  console.log('Polling inventory for up to 120s...');
  let granted = false;
  for (let s = 1; s <= 120; s++) {
    await page.waitForTimeout(1000);
    const i = await inv();
    if (i.nv || i.flash || i.rebr) {
      console.log(`>>> Inventory updated at +${s}s:`, JSON.stringify(i));
      granted = true;
      break;
    }
    if (s % 10 === 0) console.log(`  +${s}s — still empty (btns:${i.btnCount})`);
  }
  if (!granted) console.log('!!! Inventory NEVER updated in 120s after cutscene end');

  // Try N
  await page.keyboard.press('n');
  await page.waitForTimeout(1000);
  const final = await inv();
  console.log('After N:', JSON.stringify(final));

  console.log('\nERRS:', errs.length ? errs : 'NONE');
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
