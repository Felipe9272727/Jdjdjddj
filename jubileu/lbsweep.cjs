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
  const cabT = [0, 1.6, 9.61];
  const cands = {
    hi34_star: [4.5, 4.2, 12.6],   // high starboard-forward, looking down-back
    hi34_port: [-4.5, 4.2, 12.6],
    side_star: [7.0, 2.2, 9.61],   // straight starboard
    fwd_low:   [0, 2.0, 12.2],     // dead ahead off the bow, lower
    fwd_hi:    [0, 5.0, 12.8],     // dead ahead, high looking down
    aft34:     [4.0, 2.4, 11.4],   // just forward-starboard of cab
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
