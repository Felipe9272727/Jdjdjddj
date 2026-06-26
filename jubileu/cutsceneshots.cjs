// Capture the captain arrival cutscene, sampling BY BEAT (headless fps is low,
// so wall-clock sampling misses beats). Grabs an early + late frame per beat.
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 }); } catch (e) { console.log('not ready'); }
  await pg.waitForTimeout(2500);                       // let the GLB resolve
  await pg.evaluate(() => window.__restart && window.__restart());  // sync brain + cutscene from 0
  const names = ['LEGS', 'REVEAL', 'LOOKBACK', 'LAUGH'];
  const seen = {};
  const t0 = Date.now();
  let shots = 0;
  while (Date.now() - t0 < 200000) {
    const info = await pg.evaluate(() => ({ beat: window.__beat ? window.__beat() : -1, done: window.__done ? window.__done() : false, geom: window.__geom ? window.__geom() : null }));
    const nm = names[info.beat] || ('b' + info.beat);
    seen[nm] = (seen[nm] || 0) + 1;
    // capture the 1st and ~10th poll of each beat (entry + settled), and the done frame
    if (seen[nm] === 1 || seen[nm] === 10) {
      const tag = `cs-${String(shots).padStart(2, '0')}-${nm}-${seen[nm] === 1 ? 'in' : 'set'}`;
      await pg.screenshot({ path: `${OUT}/${tag}.png` }); shots++;
      console.log(tag, 'cap=' + JSON.stringify(info.geom && info.geom.captain), 'cam=' + JSON.stringify(info.geom && info.geom.cam));
    }
    if (info.done) { await pg.screenshot({ path: `${OUT}/cs-${String(shots).padStart(2, '0')}-DONE.png` }); console.log('DONE'); break; }
    await sleep(110);
  }
  await pg.close();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
