// Sweep candidate LOOK_BACK camera angles with the cab held SOLID, to find a clean one.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());
  await sleep(500);
  // cab at world (0,*,9.61), ~4 tall. Try angles that put the SHIP (not sky) behind the cab.
  const cabT = [0, 1.7, 9.9];
  const cands = {
    ahead_hi:  [0.6, 4.0, 13.6],   // dead ahead off the bow, high enough to clear bowsprit
    ahead_far: [0.6, 3.3, 15.2],   // farther + lower, flatter perspective
    star_hi:   [3.2, 4.4, 12.6],   // starboard-forward high
    star_clear:[3.0, 5.0, 11.6],   // closer + higher, look down past the bulwark
    high45:    [2.2, 5.6, 13.2],   // 45 down
    p_ahead:   [-0.6, 4.0, 13.6],  // port mirror of ahead_hi
  };
  for (const [tag, p] of Object.entries(cands)) {
    await pg.evaluate(({ p, t }) => { window.__cam(p[0], p[1], p[2], t[0], t[1], t[2]); window.__holdElev(1); }, { p, t: cabT });
    await sleep(450);
    await pg.evaluate(() => window.__holdElev(1));   // ensure still solid
    await sleep(150);
    await pg.screenshot({ path: `${OUT}/lbs-${tag}.png` });
    console.log('lbs-' + tag, JSON.stringify(await pg.evaluate(() => window.__geom())));
  }
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
