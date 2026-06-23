// Capture the cutscene at EVEN cutscene-time intervals across the whole timeline
// (transitions, cuts, dissolve included) — the honest playback, not cherry-picked apexes.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad/seq';
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());
  // targets in cutscene-seconds
  const targets = [];
  for (let s = 0.3; s <= 10.1; s += 0.5) targets.push(+s.toFixed(1));
  let i = 0, n = 0;
  const t0 = Date.now();
  while (i < targets.length && Date.now() - t0 < 220000) {
    const st = await pg.evaluate(() => ({ t: window.__t ? window.__t() : 0, beat: window.__beat ? window.__beat() : -1, done: window.__done ? window.__done() : false }));
    if (st.done) break;
    if (st.t >= targets[i]) {
      const tag = `${String(n).padStart(2, '0')}-t${targets[i].toFixed(1)}-b${st.beat}`;
      await pg.screenshot({ path: `${OUT}/${tag}.png` });
      console.log(tag, '(actual t=' + st.t.toFixed(2) + ')');
      n++; i++;
    }
    await sleep(80);
  }
  console.log('captured', n, 'frames');
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
