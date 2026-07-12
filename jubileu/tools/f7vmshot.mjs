import { chromium } from 'playwright';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath) throw new Error('PLAYWRIGHT_CHROMIUM_EXECUTABLE is required');
const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/floor7play.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 45000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
    window.__forceTick?.(1, 0, 5, false);
    window.__forceTick?.(1, 0, 5, true);          // GREET -> FETCH
    window.__forceTick?.(1, 1.35, -1.8, false);
    window.__forceTick?.(1, 1.35, -1.8, true);    // FETCH -> CLEAN, equips bucket
    window.__teleport?.(0.8, 3.2);
    window.__setYaw?.(Math.PI);
    window.__setPitch?.(-0.17);
});
await page.waitForTimeout(1800);
console.log('state', await page.evaluate(() => window.__state?.()));
await page.screenshot({ path: '/workspace/scratch/7469d3e7dbe1/f7-viewmodel-textured.png' });
await browser.close();
