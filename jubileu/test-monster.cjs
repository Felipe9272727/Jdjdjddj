// test-monster.cjs — verify NV brightening, monster fish appearance, scanner accuracy.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-certificate-errors'],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; const cerrs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    if (box) { await page.mouse.click(box.x, box.y); return true; }
    return false;
  };

  console.log('[1] Boot game on Floor 2');
  await click("t.includes('CRIADOR')");
  await page.waitForTimeout(1200);
  await click("t.includes('Andar 2')");
  await page.waitForTimeout(700);
  await click("t.includes('INICIAR')");
  await page.mouse.move(10, 10);
  await page.waitForTimeout(6000);

  console.log('[2] Walk to cutscene');
  await page.keyboard.down('w');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !!document.querySelector('.cs-root'))) {
      await page.keyboard.up('w');
      break;
    }
  }
  await page.keyboard.up('w');

  console.log('[3] Click ACEITAR + wait for rebreather grant');
  await page.waitForTimeout(2000);
  await click("t.includes('ACEITAR')");
  let granted = -1;
  for (let s = 1; s <= 120; s++) {
    await page.waitForTimeout(1000);
    const cs = await page.evaluate(() => !!document.querySelector('.cs-root'));
    const ok = await page.evaluate(() => {
      const e = [...document.querySelectorAll('[aria-label]')];
      return e.some(el => /noturna/i.test(el.getAttribute('aria-label') || ''));
    });
    if (ok && !cs) { granted = s; break; }
  }
  console.log(`  NV granted at +${granted}s`);

  console.log('[4] Screenshot WITHOUT NV (cave should be dark)');
  await page.screenshot({ path: '/tmp/mon-A-nv-off.png' });

  console.log('[5] Toggle NV ON');
  await page.keyboard.press('n');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mon-B-nv-on.png' });

  // Sample center pixel brightness to confirm NV brightens, not darkens.
  const bright = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!ctx) return null;
    const pixels = new Uint8Array(4);
    ctx.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);
    return { r: pixels[0], g: pixels[1], b: pixels[2], lum: (pixels[0]+pixels[1]+pixels[2])/3 };
  });
  console.log('  center pixel with NV ON:', JSON.stringify(bright));

  console.log('[6] Walk forward and dive (S key in this game moves backward, W forward)');
  await page.keyboard.down('w');
  await page.waitForTimeout(12000);
  await page.keyboard.up('w');
  await page.screenshot({ path: '/tmp/mon-C-dive.png' });

  // Read player Y if exposed
  const yReport = await page.evaluate(() => (window).__playerY ?? 'no global');
  console.log('  player Y reading:', yReport);

  console.log('[7] Wait 25s underwater to find a shard / observe monster');
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `/tmp/mon-D-sub-${i}.png` });
  }

  console.log('\nConsole errors:', cerrs.length ? cerrs.slice(0, 8) : 'NONE');
  console.log('Page errors:', errs.length ? errs.slice(0, 5) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
