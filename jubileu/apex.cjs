// Capture the LAST frame of a given beat (the landed/held framing).
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const TARGET = Number(process.env.BEAT || 1);   // 1=REVEAL
const TAG = process.env.TAG || 'reveal-apex';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());
  const t0 = Date.now();
  let inBeat = false, shots = 0;
  while (Date.now() - t0 < 160000) {
    const beat = await pg.evaluate(() => (window.__beat ? window.__beat() : -1));
    if (beat === TARGET) { inBeat = true; shots++; await pg.screenshot({ path: `${OUT}/${TAG}-${String(shots).padStart(2,'0')}.png` }); }
    else if (inBeat && beat > TARGET) { console.log(TAG, 'captured', shots, 'frames'); break; }
    await sleep(120);
  }
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
