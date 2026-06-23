// Verify the captain (1) walks facing his travel direction (not sideways) and
// (2) faces the player in the GREET dialogue. Polls his position (headless fps is
// low so brain time crawls) and shoots at the right moments.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = async (pg) => (await pg.evaluate(() => window.__geom())).captain;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());

  const t0 = Date.now();
  let shotWalk = false, shotGreet = false;
  while (Date.now() - t0 < 180000 && !(shotWalk && shotGreet)) {
    const c = await cap(pg);
    // (1) MID-WALK: captain between bow start (~-5.9) and talk spot (~4). Shoot when z in [-3,1].
    if (!shotWalk && c[1] > 0.05 && c[2] > -3 && c[2] < 1) {
      await pg.evaluate(({c}) => window.__cam(c[0], 1.5, c[2] + 3.2, c[0], 1.2, c[2]), {c});
      await sleep(450); await pg.screenshot({ path: `${OUT}/verify-walk-front.png` });
      await pg.evaluate(({c}) => window.__cam(c[0] + 3.0, 1.15, c[2] + 0.3, c[0], 1.05, c[2]), {c});
      await sleep(350); await pg.screenshot({ path: `${OUT}/verify-walk-side.png` });
      console.log('WALK shot at', JSON.stringify(c)); shotWalk = true;
    }
    // (2) GREET: arrived at talk spot (z ~> 3.5), facing the player.
    if (shotWalk && !shotGreet && c[2] > 3.5) {
      await pg.evaluate(({c}) => window.__cam(0, 1.6, 7.77, c[0], 1.5, c[2]), {c});  // player POV
      await sleep(500); await pg.screenshot({ path: `${OUT}/verify-greet-pov.png` });
      await pg.evaluate(({c}) => window.__cam(c[0] + 2.4, 1.45, c[2] + 2.6, c[0], 1.4, c[2]), {c});
      await sleep(350); await pg.screenshot({ path: `${OUT}/verify-greet-34.png` });
      console.log('GREET shot at', JSON.stringify(c)); shotGreet = true;
    }
    await sleep(250);
  }
  if (!shotWalk) console.log('NEVER caught walk');
  if (!shotGreet) console.log('NEVER caught greet, last cap', JSON.stringify(await cap(pg)));
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
