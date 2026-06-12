const { chromium } = require('playwright');
const exe = '/opt/pw-browsers/chromium-1223/chrome-linux64/chrome';
const SHOTS = [
    ['70-bed-close', `dbg.f6.phase='explore'; dbg.posRef.current.set(-4.6,0,4.6);
        ang.current.theta = 0.85; ang.current.phi = 0.18;`, 1500],
    ['71-tub-close', `dbg.f6.bathOpen=true; dbg.f6.curtainOpen=true; dbg.posRef.current.set(3.7,0,-5.6);
        ang.current.theta = Math.PI; ang.current.phi = 0.3;`, 1600],
    ['72-toilet-close', `dbg.f6.bathOpen=true; dbg.f6.lidOff=true; dbg.posRef.current.set(4.4,0,-7.4);
        ang.current.theta = -0.75; ang.current.phi = 0.28;`, 1400],
    ['73-armchair', `dbg.posRef.current.set(-2.9,0,0.3);
        ang.current.theta = 2.23; ang.current.phi = 0.12;`, 1000],
    ['74-kitchen-counter', `dbg.f6.kitchenOpen=true; dbg.posRef.current.set(3.4,0,-0.2);
        ang.current.theta = -Math.PI/2+0.5; ang.current.phi = 0.12;`, 1500],
];
(async () => {
    const browser = await chromium.launch({ executablePath: exe,
        args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader'], headless: true });
    const page = await browser.newContext({ viewport: { width: 1000, height: 700 } }).then(c => c.newPage());
    await page.goto('http://127.0.0.1:3000/floor6.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
    await page.waitForTimeout(2000);
    for (const [tag, code, settle] of SHOTS) {
        await page.evaluate(`(() => { const dbg = window.__f6dbg, ang = window.__f6ang; ${code} dbg.f6.version++; })()`);
        await page.waitForTimeout(settle);
        await page.screenshot({ path: `/tmp/f6-${tag}.png` });
        console.log(tag);
    }
    await browser.close(); process.exit(0);
})();
