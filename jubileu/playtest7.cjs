// playtest7.cjs — PLAY Floor 7 offline via the playable harness
// (floor7play.html): first-person controller on the real ship using the real
// collision walls. Drives the player around, screenshots first-person, logs
// positions, and flags collision escapes (player off the deck).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  const PORT = process.env.PORT || 3001;
  await pg.goto(`http://127.0.0.1:${PORT}/floor7play.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await pg.waitForFunction(() => window.__ready === true, { timeout: 20000 }); } catch { console.log('NOT READY'); }
  await pg.waitForTimeout(2500); // brain skips intro / elevator fades

  const pos = async () => await pg.evaluate(() => window.__playerPos && window.__playerPos());
  const yaw = async (y) => pg.evaluate((y) => window.__setYaw(y), y);
  const drive = async (f, s, ms, tag) => {
    await pg.evaluate(({ f, s }) => window.__setMove(f, s), { f, s });
    await pg.waitForTimeout(ms);
    await pg.evaluate(() => window.__setMove(0, 0));
    await pg.waitForTimeout(200);
    const p = await pos();
    const off = p && (Math.hypot(p[0], 0) > 3.4 || p[2] > 12 || p[2] > 11.8 || p[2] < -10.5);
    console.log(String(tag).padEnd(12), p ? p.map(n => n.toFixed(2)).join(', ') : 'null', off ? '  <<< OFF DECK!' : '');
    if (tag) await pg.screenshot({ path: `/tmp/play-${tag}.png` });
  };

  await yaw(0); await drive(0, 0, 50, 'spawn');     // spawn (facing bow)
  // FIRST test: can the player walk AFT from spawn toward the captain? (the
  // direction that was blocked by the foremast collider = "born stuck")
  await drive(-1, 0, 1500, 'aft1');                 // walk aft (toward captain/mop area)
  await drive(-1, 0, 1500, 'aft2');                 // keep going aft
  await drive(1, 0, 2200, 'bow1');                  // walk forward to the bow
  await drive(0, 1, 1800, 'stbd');                  // strafe to starboard rail
  await drive(0, -1, 3200, 'port');                 // strafe across to port rail
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
