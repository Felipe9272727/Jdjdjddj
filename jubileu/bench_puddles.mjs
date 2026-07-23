import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  console.log('Loading http://localhost:5173/floor7play.html...');
  await page.goto('http://localhost:5173/floor7play.html');
  await page.waitForLoadState('networkidle');
  
  // Wait for scene to load
  await page.waitForTimeout(3000);
  
  console.log('Setting up clean state with puddles...');
  const result = await page.evaluate(() => {
    const ft = window.__forceTick;
    if (ft) {
      ft(2, 0.75, 4.3, false);
      ft(1, 0.75, 4.3, true);
      ft(2, 0.75, 4.3, false);
      ft(1, 1.35, -1.8, false);
      ft(1, 1.35, -1.8, true);
      return 'forceTick applied';
    }
    return 'forceTick not found';
  });
  console.log('Scene state:', result);
  
  await page.waitForTimeout(1500);
  
  // Top-down view
  const td_path = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/verniz/puddles_topdown.png';
  await page.screenshot({ path: td_path });
  console.log('Screenshot 1 (top-down): ' + td_path);
  
  // Check puddle info
  const puddle_info = await page.evaluate(() => {
    const puddles = window.__puddles ? window.__puddles() : [];
    return { count: puddles ? puddles.length : 0 };
  });
  console.log('Puddle info:', puddle_info);
  
  await page.waitForTimeout(1000);
  
  // First-person close-up view
  const fp_path = '/tmp/claude-0/-home-user-Jdjdjddj/acf0bc34-2ec9-516a-bad8-e16ca8130597/scratchpad/esquadra1/verniz/puddles_fp.png';
  await page.screenshot({ path: fp_path });
  console.log('Screenshot 2 (first-person): ' + fp_path);
  
  await browser.close();
  console.log('Done!');
})().catch(e => { console.error(e); process.exit(1); });
