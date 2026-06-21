// playshots7.cjs — capture a rich set of FIRST-PERSON gameplay views of Floor 7
// (the playable harness) for the critic to judge the actual playing experience.
const { chromium } = require('playwright');
const S = 1.45;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto(`http://127.0.0.1:${process.env.PORT || 3001}/floor7play.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await pg.waitForFunction(() => window.__ready === true, { timeout: 20000 }); } catch {}
  await pg.waitForTimeout(2500);
  // [worldX, worldZ(local*scale), yaw, pitch, tag]
  const views = [
    [0, 4.2 * S, 0, -0.12, 'fp-spawn'],             // spawn faces the bow (the real in-game view)
    [0, 1.0 * S, Math.PI, -0.1, 'fp-mid-aft'],       // amidships -> stern/deckhouse
    [0, 1.0 * S, 0, -0.1, 'fp-mid-bow'],             // amidships -> bow
    [0, -3.2 * S, 0, 0.5, 'fp-mid-rig'],             // look up the main mast at the rig/sails/stays
    [0, 1.0 * S, Math.PI, -0.7, 'fp-mid-deck'],      // look down at the deck/puddles
    [1.4, 0.5 * S, -Math.PI / 2, -0.05, 'fp-stbd-in'],// starboard, look inboard
    [0, -4.5 * S, Math.PI, 0.0, 'fp-cabin'],         // aft -> the deckhouse/helm
    [0, 3.0 * S, 0, 0.1, 'fp-foremast'],             // look at the foremast/boat booms
  ];
  for (const [x, z, yaw, pitch, tag] of views) {
    await pg.evaluate(({ x, z, yaw, pitch }) => { window.__teleport(x, z); window.__setYaw(yaw); window.__setPitch(pitch); }, { x, z, yaw, pitch });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: `/tmp/${tag}.png` });
    console.log(tag, 'ok');
  }
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
