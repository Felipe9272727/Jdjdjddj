import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,180)));
await p.goto('http://127.0.0.1:3011/index.html',{waitUntil:'domcontentloaded',timeout:180000});
await p.waitForFunction(() => typeof window.__startFloor === 'function', null, { timeout:180000 });
await p.evaluate(() => window.__startFloor?.(3));
await new Promise(r=>setTimeout(r,45000));
const info = await p.evaluate(() => {
  const cv = document.querySelector('canvas');
  return { css: cv && `${cv.clientWidth}x${cv.clientHeight}`, buffer: cv && `${cv.width}x${cv.height}`,
           dpr: cv ? (cv.width/cv.clientWidth).toFixed(2) : null, devicePR: window.devicePixelRatio,
           estilo: cv && getComputedStyle(cv).imageRendering };
});
console.log('canvas:', JSON.stringify(info));
await p.screenshot({path:'/tmp/tela-dele.png'}); console.log('📷');
ponte.fechar(); await b.close();
