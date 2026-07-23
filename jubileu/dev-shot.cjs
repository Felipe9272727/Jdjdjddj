/**
 * dev-shot.cjs — reusable offline screenshot tool for the dev workbenches
 * (e.g. floor4.html). DEV-ONLY, never part of the build.
 *
 * Usage:  node dev-shot.cjs [html-path] [out-tag]
 *   node dev-shot.cjs floor4.html floor4   → /tmp/floor4.png
 * Requires the vite dev server running (cd jubileu && npm run dev). See FLOOR4.md §4.
 *
 * The chromium path may differ after a fresh container — if it 404s, check
 * `ls /opt/pw-browsers/` and set PW_CHROMIUM, or run `npx playwright install chromium`.
 */
const { chromium } = require('playwright');

const htmlPath = process.argv[2] || 'floor4.html';
const tag = process.argv[3] || 'floor4';
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
    headless: true,
  });
  const page = await browser.newContext({ viewport: { width: 1000, height: 760 } }).then((c) => c.newPage());
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CE ' + m.text().slice(0, 180)); });

  await page.goto(`http://127.0.0.1:3000/${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForFunction(() => window.__ready === true, { timeout: 20000 }); } catch { errs.push('TIMEOUT __ready'); }
  await page.waitForTimeout(2500);   // let GLBs/textures settle
  await page.screenshot({ path: `/tmp/${tag}.png` });
  console.log('wrote /tmp/' + tag + '.png');
  // 404 (favicon) and ERR_CERT (external resource) are normal + harmless.
  console.log(errs.length ? 'console/page notes:\n' + errs.join('\n') : 'no console/page errors');
  await browser.close();
  process.exit(0);
})();
