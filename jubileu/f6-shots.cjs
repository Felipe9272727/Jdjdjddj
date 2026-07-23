/**
 * f6-shots.cjs — staged screenshots of the Floor 6 escape room (dev page).
 * DEV-ONLY. Drives the exposed __f6dbg/__f6ang handles through the phases
 * and frames each beat. Usage: node f6-shots.cjs   (vite dev must be up)
 */
const { chromium } = require('playwright');

const exe = process.env.PW_CHROMIUM
    || `${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux/chrome`;

const SHOTS = [
    // [tag, setup-fn (in page), settle-ms]   look dir = (-sin θ, -cos θ)
    ['10-bedroom', `
        dbg.posRef.current.set(-0.5, 0, -6.0);
        ang.current.theta = Math.PI * 0.95; ang.current.phi = 0.04;
        dbg.f6.phase = 'explore';
    `, 2000],
    ['11-desk-quadro', `
        dbg.posRef.current.set(-3.6, 0, -7.2);
        ang.current.theta = 0.45; ang.current.phi = 0.06;
    `, 800],
    ['12-doorway-jam', `
        dbg.posRef.current.set(0, 0, -6.6);
        ang.current.theta = 0; ang.current.phi = 0.02;
    `, 1500],
    ['13-cab-inside', `
        dbg.posRef.current.set(0.2, 0, -10.6);
        ang.current.theta = 0.15; ang.current.phi = 0.05;
    `, 900],
    ['14-cab-fusebox', `
        dbg.posRef.current.set(-1.6, 0, -12.4);
        ang.current.theta = Math.PI * 0.5; ang.current.phi = 0.05;
    `, 800],
    ['15-cab-winch', `
        dbg.posRef.current.set(0, 0, -13.8);
        ang.current.theta = 0; ang.current.phi = 0.0;
    `, 800],
    ['16-cab-lookback', `
        dbg.posRef.current.set(0, 0, -12.2);
        ang.current.theta = Math.PI; ang.current.phi = 0.03;
    `, 800],
    ['20-tv-on', `
        dbg.f6.tvOn = true; dbg.f6.tvChannel = 2;
        dbg.posRef.current.set(-0.6, 0, 1.2);
        ang.current.theta = -Math.PI / 2; ang.current.phi = 0.1;
    `, 900],
    ['30-bath', `
        dbg.f6.bathOpen = true;
        dbg.posRef.current.set(3.3, 0, -7.0);
        ang.current.theta = -0.12; ang.current.phi = 0.04;
    `, 1600],
    ['31-bath-mirror-fog', `
        dbg.f6.tapOn = true; dbg.f6.fogT = 5.9;
        dbg.posRef.current.set(3.2, 0, -8.5);
        ang.current.theta = 0; ang.current.phi = -0.1;
    `, 2500],
    ['32-toilet-lid', `
        dbg.f6.lidOff = true;
        dbg.posRef.current.set(4.3, 0, -8.0);
        ang.current.theta = -1.2; ang.current.phi = 0.22;
    `, 1400],
    ['40-kitchen', `
        dbg.f6.kitchenOpen = true;
        dbg.posRef.current.set(2.6, 0, 1.2);
        ang.current.theta = -Math.PI / 2; ang.current.phi = 0.04;
    `, 1600],
    ['41-fridge-open', `
        dbg.f6.fridgeOpen = true;
        dbg.posRef.current.set(4.2, 0, -2.6);
        ang.current.theta = -2.0; ang.current.phi = 0.05;
    `, 1500],
    ['42-stove-melt', `
        dbg.f6.stoveLit = true; dbg.f6.geloTaken = true;
        dbg.f6.melting = true; dbg.f6.meltT = 4;
        dbg.posRef.current.set(4.35, 0, 0.6);
        ang.current.theta = -Math.PI / 2; ang.current.phi = 0.3;
    `, 1200],
    ['43-pantry-truth', `
        dbg.f6.kitchenOpen = true; dbg.f6.despensaOpen = true;
        dbg.posRef.current.set(3.4, 0, 4.0);
        ang.current.theta = Math.PI + 0.12; ang.current.phi = -0.12;
    `, 2200],
    ['50-winch-crank', `
        dbg.f6.installed.fusivel = true; dbg.f6.installed.rele = true;
        dbg.f6.installed.manivela = true; dbg.f6.crankT = 0.4;
        dbg.posRef.current.set(0, 0, -13.6);
        ang.current.theta = 0; ang.current.phi = 0.0;
    `, 1000],
    ['51-cab-panel', `
        dbg.posRef.current.set(1.4, 0, -11.3);
        ang.current.theta = -Math.PI / 2; ang.current.phi = 0.02;
    `, 800],
    ['60-guest', `
        dbg.f6.phase = 'guestIdle';
        dbg.posRef.current.set(0, 0, -5.4);
        ang.current.theta = 0; ang.current.phi = 0.02;
    `, 1500],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: exe,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
        headless: true,
    });
    const page = await browser.newContext({ viewport: { width: 1000, height: 700 } }).then((c) => c.newPage());
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('CE ' + m.text().slice(0, 220)); });

    await page.goto('http://127.0.0.1:3000/floor6.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForFunction(() => window.__ready === true, { timeout: 20000 }); } catch { errs.push('TIMEOUT __ready'); }
    await page.waitForTimeout(2000);

    for (const [tag, code, settle] of SHOTS) {
        await page.evaluate(`(() => {
            const dbg = window.__f6dbg, ang = window.__f6ang;
            if (!dbg || !ang) { console.error('no dbg handles'); return; }
            ${code}
            dbg.f6.version++;
        })()`);
        await page.waitForTimeout(settle);
        await page.screenshot({ path: `/tmp/f6-${tag}.png` });
        console.log(`wrote /tmp/f6-${tag}.png`);
    }
    console.log(errs.length ? 'notes:\n' + [...new Set(errs)].join('\n') : 'no console/page errors');
    await browser.close();
    process.exit(0);
})();
