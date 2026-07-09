import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  
  console.log('Loading floor7play.html...');
  await page.goto('http://localhost:5173/floor7play.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  console.log('Setting up CLEAN state with visible puddles...');
  await page.evaluate(() => {
    const ft = window.__forceTick;
    if (ft) {
      // Force a few puddles to exist and be in clean state
      ft(2, 0.75, 4.3, false);  
      ft(1, 0.75, 4.3, true);   
      ft(2, 0.75, 4.3, false);  
    }
  });
  
  await page.waitForTimeout(2000);
  
  // Position camera to focus on puddles on deck
  await page.evaluate(() => {
    // Get canvas and try to access three.js camera
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      console.log('Found canvas, puddles should be visible');
    }
  });
  
  // Screenshot 1: puddles from slightly above
  const path1 = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/verniz/puddles_clean_view1.png';
  await page.screenshot({ path: path1 });
  console.log('Screenshot saved: ' + path1);
  
  await page.waitForTimeout(1500);
  
  // Screenshot 2: another angle
  const path2 = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/verniz/puddles_clean_view2.png';
  await page.screenshot({ path: path2 });
  console.log('Screenshot saved: ' + path2);
  
  await browser.close();
  console.log('Bench complete!');
})().catch(e => { console.error(e); process.exit(1); });
