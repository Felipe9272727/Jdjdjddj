const { chromium } = require('playwright');

(async () => {
  const BASE = 'http://localhost:3000';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu',
           '--disable-dev-shm-usage','--use-gl=swiftshader',
           '--ignore-certificate-errors','--ignore-certificate-errors-spki-list',
           '--allow-insecure-localhost'],
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') console.log('[CE]',m.text().substring(0,120)); });

  console.log('Loading...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);

  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('Canvases after load:', canvases);
  await page.screenshot({ path: '/tmp/s01-load.png' });

  // Find start button and click it
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b=>({t:b.textContent?.trim(),v:b.offsetParent!==null}))
  );
  console.log('Buttons:', btns.filter(b=>b.v));

  // Click ENTER THE LOBBY
  try {
    await page.locator('text=ENTER THE LOBBY').click({timeout:3000});
    console.log('Clicked ENTER THE LOBBY');
  } catch {
    await page.locator('text=ENTER').first().click({timeout:2000}).catch(()=>{});
    console.log('Clicked ENTER');
  }
  await page.waitForTimeout(5000);
  const c2 = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('Canvases in game:', c2);
  await page.screenshot({ path: '/tmp/s02-lobby.png' });

  // What floor are we on?
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').substring(0,400));
  console.log('In-game text:', txt);

  // Check overlays
  const overlays = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].filter(el=>{
      const s=window.getComputedStyle(el);
      return s.position==='fixed' && parseFloat(s.opacity)>0.05;
    }).map(el=>{
      const s=window.getComputedStyle(el);
      return {cls:(el.className||'').substring(0,50), op:s.opacity, blend:s.mixBlendMode, z:s.zIndex, bg:s.backgroundColor.substring(0,40)};
    }).filter(o=>o.blend!=='normal').sort((a,b)=>parseInt(b.z)-parseInt(a.z)).slice(0,10);
  });
  console.log('Blend-mode overlays:', JSON.stringify(overlays,null,2));

  console.log('Page errors:', errors.length ? errors.map(e=>e.substring(0,100)) : 'none');
  await browser.close();
  console.log('Done.');
})().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
