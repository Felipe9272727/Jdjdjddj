// test-deep.cjs — probe Floor 2 deeper: refuse path, NV toggle, cutscene visuals
const { chromium } = require('playwright');

const args = process.argv[2] || 'accept';  // 'accept' | 'refuse'

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-certificate-errors'],
    headless: true,
  });
  const page = await browser.newPage();
  const errs = []; const cerrs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

  console.log(`MODE: ${args}`);
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
    if (box) { await page.mouse.click(box.x, box.y); return true; }
    return false;
  };

  await click("t.includes('CRIADOR')");
  await page.waitForTimeout(1500);
  await click("t.includes('Andar 2')");
  await page.waitForTimeout(800);
  await click("t.includes('INICIAR')");
  await page.mouse.move(10, 10);
  await page.waitForTimeout(8000);

  // ─── Inspect diver & camera before walking
  const pre = await page.evaluate(() => {
    // Hack: read any window/global state if exposed
    return {
      title: document.title,
      hasCanvas: !!document.querySelector('canvas'),
      canvasSize: (() => { const c = document.querySelector('canvas'); return c ? `${c.width}x${c.height}` : null; })(),
    };
  });
  console.log('Pre-walk:', JSON.stringify(pre));

  // Walk to trigger cutscene
  await page.keyboard.down('w');
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !!document.querySelector('.cs-root'))) {
      await page.keyboard.up('w');
      console.log(`Cutscene started at walk step ${i}`);
      break;
    }
  }

  await page.screenshot({ path: `/tmp/deep-01-cs-start-${args}.png` });

  if (args === 'refuse') {
    // Click PULAR to refuse
    await page.waitForTimeout(800);
    const pular = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('PULAR'));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    });
    if (pular) {
      await page.mouse.click(pular.x, pular.y);
      console.log('Clicked PULAR (refuse)');
    } else {
      console.log('PULAR not found');
    }
    // Wait for cutscene to close
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      if (!(await page.evaluate(() => !!document.querySelector('.cs-root')))) {
        console.log('Cutscene closed after refuse at', i*0.5, 's');
        break;
      }
    }
    await page.mouse.move(10, 10);
    // After refuse, diver should walk away. Inventory should NOT get rebreather/NV
    console.log('Refuse path: waiting 90s for any inventory changes (should remain EMPTY)...');
    let rebreatherSeen = false; let nvSeen = false;
    for (let s = 1; s <= 90; s++) {
      await page.waitForTimeout(1000);
      const inv = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('[aria-label]')];
        const labels = elements.map(e => e.getAttribute('aria-label') || '');
        return {
          nv: labels.some(a => /noturna/i.test(a)),
          rebr: labels.some(a => /respirador|rebreather/i.test(a)),
        };
      });
      if (inv.nv && !nvSeen) { nvSeen = true; console.log(`  !!! BUG: NV button appeared at +${s}s after REFUSE (should NOT happen)`); }
      if (inv.rebr && !rebreatherSeen) { rebreatherSeen = true; console.log(`  !!! BUG: Rebreather appeared at +${s}s after REFUSE (should NOT happen)`); }
      if (s % 15 === 0) console.log(`  +${s}s — nv:${inv.nv} rebr:${inv.rebr}`);
    }

  } else {
    // Accept path: wait for cutscene to fully end + rebreather to finish
    console.log('Accept: waiting for cutscene to end and rebreather to grant...');
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(500);
      if (!(await page.evaluate(() => !!document.querySelector('.cs-root')))) {
        console.log('Cutscene closed at', i*0.5, 's');
        break;
      }
    }
    // Wait for rebreather3D + inventory grant (slow in swiftshader)
    let granted = -1;
    for (let s = 1; s <= 120; s++) {
      await page.waitForTimeout(1000);
      const ok = await page.evaluate(() => {
        const e = [...document.querySelectorAll('[aria-label]')];
        return e.some(el => /noturna/i.test(el.getAttribute('aria-label') || ''));
      });
      if (ok) { granted = s; break; }
    }
    if (granted < 0) console.log('!!! BUG: NV never granted after accept path in 120s');
    else console.log('Inventory granted at +' + granted + 's');

    await page.screenshot({ path: `/tmp/deep-02-after-grant-${args}.png` });

    // Test NV toggle
    console.log('\n--- NV toggle test ---');
    const nvLabel = async () => page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /noturna/i.test(b.getAttribute('aria-label') || ''));
      return btn?.getAttribute('aria-label') || null;
    });
    const before = await nvLabel();
    console.log('Before N:', before);
    await page.keyboard.press('n');
    await page.waitForTimeout(800);
    const after = await nvLabel();
    console.log('After N:', after);
    // Detect "NV ON" indicator (per NightVisionOverlay.tsx text)
    const nvOn = await page.evaluate(() => {
      return [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent?.trim() === 'NV ON');
    });
    console.log('NV ON HUD indicator visible:', nvOn);

    await page.screenshot({ path: `/tmp/deep-03-nv-on-${args}.png` });

    // Press N again — turn off
    await page.keyboard.press('n');
    await page.waitForTimeout(800);
    const finalLabel = await nvLabel();
    const nvStillOn = await page.evaluate(() => {
      return [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent?.trim() === 'NV ON');
    });
    console.log('After 2nd N:', finalLabel, '| NV ON still visible:', nvStillOn);

    await page.screenshot({ path: `/tmp/deep-04-nv-off-${args}.png` });
  }

  console.log('\nConsole errors:', cerrs.length ? cerrs : 'NONE');
  console.log('Page errors:', errs.length ? errs : 'NONE');
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
