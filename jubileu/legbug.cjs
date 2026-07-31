// Capture close consecutive frames of the captain's LEGS during the walk to hunt
// for stretching/skinning artifacts.
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Jdjdjddj/78f2d8bc-a0f7-5989-a75f-906fec3961cd/scratchpad/legs';
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = async (pg) => (await pg.evaluate(() => window.__geom())).captain;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 720, height: 720 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3000}/floor7cutscene.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForFunction(() => window.__ready === true, { timeout: 25000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__restart && window.__restart());
  // wait until he's mid-walk (visible, z in walk range), then lock a close side-on cam on the legs
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const c = await cap(pg);
    if (c[1] > 0.05 && c[2] > -3.5 && c[2] < 2) break;
    await sleep(250);
  }
  // 16 consecutive frames, close side-on at knee/boot height
  for (let i = 0; i < 16; i++) {
    const c = await cap(pg);
    // camera 2.2 to starboard, low at shin height, looking at the legs
    await pg.evaluate(({ c }) => window.__cam(c[0] + 2.2, c[1] + 0.45, c[2] + 0.1, c[0], c[1] + 0.45, c[2]), { c });
    await sleep(60);
    await pg.screenshot({ path: `${OUT}/leg-${String(i).padStart(2, '0')}.png` });
    await sleep(180);
  }
  console.log('captured 16 leg frames');
  await pg.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
