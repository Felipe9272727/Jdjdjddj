import { chromium } from 'playwright';

const outDir = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/lenho';

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    await page.goto('http://localhost:5173/floor7play.html', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Screenshot 1: CASCO (hull side view)
    console.log('Capturing hull (casco)...');
    await page.evaluate(() => window.__cam(24, 3.5, -6, 0, 2, 0));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/01-casco-lateral.png` });

    // Screenshot 2: CONVÉS (first person, deck view)
    console.log('Capturing deck (convés)...');
    await page.evaluate(() => window.__cam(0, 2.2, 0, 0, 0, 0));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__setYaw(0));
    await page.evaluate(() => window.__setPitch(-0.3));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/02-convés-FP.png` });

    // Screenshot 3: CÉU/SOL (sky and sun view)
    console.log('Capturing sky (céu)...');
    await page.evaluate(() => window.__cam(0, 6, 20, 0, 10, -30));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/03-céu-sol.png` });

    console.log(`✓ Screenshots saved to ${outDir}`);

    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
