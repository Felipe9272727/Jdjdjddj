const { chromium } = require('playwright');

(async () => {
  const BASE = 'http://localhost:3001';
  const SS = (name) => `/tmp/ss-${name}.png`;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--use-gl=swiftshader',
      '--ignore-certificate-errors',
    ],
    headless: true,
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('Loading game...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: SS('00-menu') });
  console.log('Menu loaded.');

  // Click CREATOR MODE (ANDAR 2)
  // The main menu has 3 buttons: ENTER THE LOBBY, MODO CRIADOR, (maybe settings)
  // We want creator mode → Floor 2
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({text: b.textContent?.trim(), visible: b.offsetParent !== null}))
  );
  console.log('Buttons on menu:', buttons);

  // Try to find and click MODO CRIADOR
  let creatorClicked = false;
  // Click by coordinates to avoid visibility issues
  const creatorBox = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.textContent?.includes('CRIADOR') && b.offsetParent !== null);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  });
  if (creatorBox) {
    await page.mouse.click(creatorBox.x, creatorBox.y);
    creatorClicked = true;
    console.log('Clicked MODO CRIADOR by coords', creatorBox);
  }

  if (!creatorClicked) {
    console.log('MODO CRIADOR not found in first pass, trying visible locator');
    try {
      await page.locator('button:has-text("CRIADOR")').filter({ hasNotText: '' }).first().click({ timeout: 3000, force: true });
      creatorClicked = true;
    } catch (e) {
      console.log('Still not found:', e.message);
      // Try clicking by coordinates - find the visible MODO CRIADOR button
      const box = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const btn = btns.find(b => b.textContent?.includes('CRIADOR') && b.offsetParent !== null);
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width/2, y: r.top + r.height/2 };
      });
      if (box) {
        await page.mouse.click(box.x, box.y);
        creatorClicked = true;
        console.log('Clicked MODO CRIADOR by coords', box);
      }
    }
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: SS('01-after-creator') });
  console.log('After creator click');

  // Now look for floor selection buttons (ANDAR 1, ANDAR 2, etc.)
  const afterButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({text: b.textContent?.trim(), visible: b.offsetParent !== null}))
  );
  console.log('Buttons after creator:', afterButtons);

  // Click ANDAR 2 by coordinates
  const floor2Box = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.textContent?.includes('Andar 2') && b.offsetParent !== null);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  });
  console.log('Floor 2 button coords:', floor2Box);
  if (floor2Box) {
    await page.mouse.click(floor2Box.x, floor2Box.y);
    console.log('Clicked Andar 2');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: SS('01b-andar2-selected') });

    // Now click "INICIAR NO ANDAR 2" (the start button, text changes after selection)
    await page.waitForTimeout(500);
    const startBox = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => (b.textContent?.includes('INICIAR') || b.textContent?.includes('SELECIONE')) && b.offsetParent !== null);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2, text: btn.textContent?.trim() };
    });
    console.log('Start button coords:', startBox);
    if (startBox) {
      await page.mouse.click(startBox.x, startBox.y);
      console.log('Clicked start button:', startBox.text);
    }
  }

  await page.waitForTimeout(6000);
  await page.screenshot({ path: SS('02-floor2-initial') });
  console.log('Floor 2 initial state captured');

  // Check canvas count
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('Canvases:', canvases);

  // Check UI text
  const uiText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').substring(0, 400));
  console.log('UI text:', uiText);

  // Check for overlay divs
  const overlays = await page.evaluate(() => {
    return [...document.querySelectorAll('*')]
      .filter(el => {
        const s = window.getComputedStyle(el);
        return s.position === 'fixed' && parseFloat(s.opacity) > 0.05;
      })
      .map(el => {
        const s = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          cls: (el.className || '').substring(0, 80),
          opacity: parseFloat(s.opacity).toFixed(2),
          bg: s.backgroundColor.substring(0, 40),
          blend: s.mixBlendMode,
          z: s.zIndex,
        };
      })
      .filter(o => o.blend !== 'normal' || o.bg !== 'rgba(0, 0, 0, 0)')
      .sort((a, b) => parseInt(b.z) - parseInt(a.z))
      .slice(0, 20);
  });
  console.log('\nActive DOM overlays:');
  overlays.forEach(o => console.log(' ', JSON.stringify(o)));

  // First check the scene without moving (elevator view)
  await page.screenshot({ path: SS('03-elevator-view') });
  console.log('Elevator view captured');

  // Walk a little forward (will trigger diver cutscene)
  console.log('Walking toward cave...');
  await page.keyboard.down('w');
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');
  await page.waitForTimeout(500);

  // Check if cutscene appeared, if so skip it
  const hasPular = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find(b => b.textContent?.includes('PULAR') && b.offsetParent !== null) !== undefined;
  });
  console.log('Has PULAR (skip) button:', hasPular);

  await page.screenshot({ path: SS('04-floor2-in-cave') });

  if (hasPular) {
    const pularBox = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.includes('PULAR') && b.offsetParent !== null);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    });
    if (pularBox) {
      await page.mouse.click(pularBox.x, pularBox.y);
      console.log('Clicked PULAR (skip cutscene)');
      await page.waitForTimeout(2000);
    }
  }

  await page.screenshot({ path: SS('05-after-cutscene') });
  console.log('After cutscene screenshot captured');

  // Try NV toggle - should be blocked (not owned yet)
  console.log('Testing NV toggle (N key)...');
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS('06-nv-test') });

  // Check for NV HUD element
  const nvOn = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].some(e =>
      e.children.length === 0 && e.textContent?.trim() === 'NV ON'
    );
  });
  console.log('NV ON visible (should be false):', nvOn);

  // Final settled screenshot
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SS('07-final') });
  console.log('Final state captured');

  // Check quality setting
  const quality = await page.evaluate(() => {
    try {
      const s = localStorage.getItem('jubileu-settings');
      if (s) { const parsed = JSON.parse(s); return parsed.quality; }
    } catch {}
    return 'unknown';
  });
  console.log('Quality setting:', quality);

  console.log('\nErrors:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\nDone. Check /tmp/ss-*.png');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
