const { chromium } = require('playwright');
const exe = '/opt/pw-browsers/chromium-1223/chrome-linux64/chrome';
const SHOTS = [
    ['80-guest-close', `dbg.f6.phase='guestIdle'; dbg.posRef.current.set(0.3,0,-7.0);
        ang.current.theta = 0.2; ang.current.phi = 0.0;`, 2000],
    ['81-guest-face', `dbg.f6.phase='guestIdle'; dbg.posRef.current.set(0,0,-7.4);
        ang.current.theta = 0; ang.current.phi = -0.18;`, 1500],
    ['82-botoeira', `dbg.f6.phase='explore'; dbg.posRef.current.set(2.0,0,-10.7);
        ang.current.theta = -Math.PI/2; ang.current.phi = 0.0;`, 1500],
    ['83-bedroom-pbr', `dbg.posRef.current.set(-0.5,0,-6.0);
        ang.current.theta = Math.PI*0.95; ang.current.phi = 0.04;`, 1500],
    ['84-armchair-leather', `dbg.posRef.current.set(-2.9,0,0.3);
        ang.current.theta = 2.23; ang.current.phi = 0.12;`, 1200],
    ['85-bath-pbr', `dbg.f6.bathOpen=true; dbg.posRef.current.set(3.3,0,-7.0);
        ang.current.theta = -0.12; ang.current.phi = 0.04;`, 1500],
    ['86-kitchen-pbr', `dbg.f6.kitchenOpen=true; dbg.posRef.current.set(2.6,0,1.2);
        ang.current.theta = -Math.PI/2; ang.current.phi = 0.1;`, 1500],
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
