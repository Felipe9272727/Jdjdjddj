const { chromium } = require('playwright');
const { writeFileSync } = require('fs');

(async () => {
  const BASE = 'http://localhost:3000';
  const SS = (name) => `/tmp/ss-${name}.png`;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1223/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--disable-dev-shm-usage', '--use-gl=swiftshader'],
    headless: true,
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = await ctx.newPage();
  const errors = [];
  const logs = [];
  page.on('console', m => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(e.message));

  console.log('1. Loading page...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SS('01-loaded') });
  console.log('   -> 01-loaded.png');

  // Find and click start button
  console.log('2. Looking for start button...');
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => b.textContent?.trim())
  );
  console.log('   Buttons:', btns);

  // Try clicking any start-like button
  let started = false;
  for (const txt of ['ENTRAR', 'COMEÇAR', 'START', 'JOGAR', 'PLAY']) {
    try {
      const el = await page.locator(`text=${txt}`).first();
      if (await el.isVisible({ timeout: 500 })) {
        console.log(`   Clicking "${txt}"`);
        await el.click();
        await page.waitForTimeout(2000);
        started = true;
        break;
      }
    } catch {}
  }
  if (!started) {
    // Just click center of screen
    await page.mouse.click(640, 360);
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: SS('02-after-click') });
  console.log('   -> 02-after-click.png');

  // Try keyboard to start
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SS('03-ingame') });
  console.log('   -> 03-ingame.png');

  // Check current state
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('   Canvases:', canvases);

  const uiText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').substring(0, 300));
  console.log('   UI text:', uiText);

  // Check overlay states
  console.log('\n3. Checking overlays...');
  const overlays = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    return all
      .filter(el => {
        const s = window.getComputedStyle(el);
        return s.position === 'fixed' && parseFloat(s.opacity) > 0.05 &&
               s.pointerEvents !== 'none' === false; // include pointer-events:none
      })
      .map(el => {
        const s = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          cls: (el.className || '').substring(0, 60),
          opacity: parseFloat(s.opacity).toFixed(2),
          bg: s.backgroundColor,
          blend: s.mixBlendMode,
          z: s.zIndex,
        };
      })
      .filter(o => o.blend !== 'normal' || o.bg !== 'rgba(0, 0, 0, 0)')
      .sort((a, b) => parseInt(b.z) - parseInt(a.z))
      .slice(0, 15);
  });
  console.log('   Active overlays (sorted by z-index):');
  overlays.forEach(o => console.log('  ', JSON.stringify(o)));

  // Check if NV lights are somehow on (look for ambient light intensity)
  const nvActive = await page.evaluate(() => {
    // Check if inventory NV is active
    const nvText = [...document.querySelectorAll('*')].find(e =>
      e.children.length === 0 && (e.textContent?.includes('NV ON') || e.textContent?.includes('NV'))
    );
    return nvText ? nvText.textContent : null;
  });
  console.log('   NV HUD text:', nvActive);

  // Test NV toggle - N key
  console.log('\n4. Testing NV (N key - should be blocked if not owned yet)...');
  await page.keyboard.press('n');
  await page.waitForTimeout(600);
  await page.screenshot({ path: SS('04-nv-attempt') });
  console.log('   -> 04-nv-attempt.png');

  const nvHUD = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e =>
      e.children.length === 0 && e.textContent?.includes('NV ON')
    );
    return el ? 'NV ON visible' : 'NV ON NOT visible';
  });
  console.log('   After N press:', nvHUD);

  // Check error count
  console.log('\n5. Errors:', errors.length ? errors : 'none');
  console.log('   Warnings/errors in console:', logs.filter(l => l.includes('[warn') || l.includes('[error')).length);
  logs.filter(l => l.includes('[error')).forEach(l => console.log('  ', l));

  await browser.close();
  console.log('\nDone. Screenshots at /tmp/ss-*.png');
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
