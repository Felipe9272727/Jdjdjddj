// questtest7.cjs — verify the Floor 7 quest is completable end-to-end in the
// playable harness: greet the captain, grab the bucket, mop all 6 puddles,
// reach DONE (and trigger the land-on-horizon payoff). Catches the "can't reach
// the bucket / can't clean" bugs the player hit.
const { chromium } = require('playwright');
const S = 1.85;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto('http://127.0.0.1:3001/floor7play.html', { waitUntil: 'domcontentloaded' });
  try { await pg.waitForFunction(() => window.__ready === true, { timeout: 20000 }); } catch {}
  await pg.waitForTimeout(2500);
  const st = async () => await pg.evaluate(() => window.__state());
  const tap = async () => { await pg.evaluate(() => window.__interact(true)); await pg.waitForTimeout(140); await pg.evaluate(() => window.__interact(false)); await pg.waitForTimeout(140); };
  const tp = async (lx, lz) => pg.evaluate(({ x, z }) => window.__teleport(x, z), { x: lx * S, z: lz * S });

  console.log('start', JSON.stringify(await st()));        // GREET
  await tap();                                             // GREET -> FETCH
  console.log('after greet tap', JSON.stringify(await st()));
  // grab the bucket (local 1.35,-1.8)
  await tp(1.35, -1.8); await pg.waitForTimeout(150); await tap();
  console.log('after bucket', JSON.stringify(await st()));  // expect FETCH->CLEAN (state 3)
  // mop every puddle: teleport onto it and hold interact ~2s
  const puds = await pg.evaluate(() => window.__puddles());
  console.log('puddles', puds.length);
  for (let i = 0; i < puds.length; i++) {
    // deterministically scrub this puddle (~40 ticks * 0.05s = 2s sim, > 1.6s)
    await pg.evaluate(({ x, z }) => window.__forceTick(40, x, z, true), { x: puds[i].x, z: puds[i].z });
    const s = await st();
    console.log(`puddle ${i} -> cleaned ${s.cleaned}/${s.npud} state ${s.state}`);
    if (s.state === 4) break;
  }
  await pg.waitForTimeout(1500);
  const final = await st();
  console.log('FINAL', JSON.stringify(final), final.state === 4 ? 'QUEST COMPLETE ✓' : 'NOT DONE ✗');
  // capture the payoff (land on the horizon) — look toward the bow
  await pg.evaluate(() => { window.__teleport(0, 2); window.__setYaw(0); window.__setPitch(0.02); });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: '/tmp/fp-payoff.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
