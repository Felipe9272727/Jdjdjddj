const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 1100 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());
  await sleep(500);
  // straight down over the whole deck; hold cab solid
  await pg.evaluate(() => { window.__cam(0.01, 40, 1.0, 0, 0, 1.0); window.__holdElev(1); });
  await sleep(700); await pg.evaluate(() => { window.__cam(0.01, 40, 1.0, 0, 0, 1.0); window.__holdElev(1); });
  await sleep(700); await pg.evaluate(() => window.__holdElev(1)); await sleep(200);
  await pg.screenshot({ path: `${OUT}/td-full.png` });
  console.log('td-full', JSON.stringify(await pg.evaluate(() => window.__geom())));
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
