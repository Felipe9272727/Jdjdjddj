// Establishing shots of the deck layout (free-cam) to stage the cutscene properly.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 1000 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());  // reset brain → cab solid, captain at start
  await sleep(400);
  // world coords. SCALE=1.85. cab at ~(0,*,9.61). captain spawns ~(1.11,0,-5.9). player ~(0,0,7.77).
  const shots = {
    topdown:    { p: [0, 34, 2.0], t: [0, 0, 2.0] },
    topdown_bow:{ p: [0, 22, 8.0], t: [0, 0, 8.0] },
    iso_star:   { p: [16, 12, 16], t: [0, 1.5, 2] },
    iso_port:   { p: [-16, 12, 16], t: [0, 1.5, 2] },
    bow_low:    { p: [0, 1.2, 2.0], t: [0, 1.5, 10] },   // from mid-deck looking at the bow/cab
  };
  for (const [tag, c] of Object.entries(shots)) {
    await pg.evaluate(({ p, t }) => window.__cam(p[0], p[1], p[2], t[0], t[1], t[2]), c);
    await sleep(500);
    await pg.screenshot({ path: `${OUT}/est-${tag}.png` });
    console.log('est-' + tag, JSON.stringify(await pg.evaluate(() => window.__geom())));
  }
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
