import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/ilhota';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  try {
    console.log('Navigating to floor7play...');
    await page.goto('http://localhost:5173/floor7play.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Running tick commands to reach island state...');
    await page.evaluate(() => {
      const ft = window.__forceTick;
      ft(2, 0.75, 4.3, false);
      ft(1, 0.75, 4.3, true);
      ft(2, 0.75, 4.3, false);
      ft(1, 1.35, -1.8, false);
      ft(1, 1.35, -1.8, true);
      for(let r = 0; r < 3; r++) {
        for(const p of window.__puddles()) {
          for(const dx of [-0.3, 0, 0.3]) {
            for(const dz of [-0.3, 0, 0.3]) {
              ft(22, p.x + dx, p.z + dz, true);
            }
          }
        }
      }
      ft(700, 0.75, 4.3, false);
    });

    await page.waitForTimeout(3000);
    
    const cameras = [
      { name: 'angle1-left', x: -6, y: 5, z: 4, tx: 8, ty: 2, tz: 30 },
      { name: 'angle2-front', x: 4.5, y: 3.5, z: 8, tx: 10, ty: 3, tz: 40 },
      { name: 'angle3-wide', x: 0, y: 6, z: 10, tx: 0, ty: -2, tz: 35 }
    ];

    for (const cam of cameras) {
      console.log(`Capturing ${cam.name}...`);
      await page.evaluate((c) => {
        window.__cam(c.x, c.y, c.z, c.tx, c.ty, c.tz);
      }, cam);
      
      await page.waitForTimeout(500);
      const filename = path.join(outDir, `${cam.name}.png`);
      await page.screenshot({ path: filename });
      console.log(`Saved: ${filename}`);
    }

    console.log('All screenshots captured!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
