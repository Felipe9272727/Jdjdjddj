// Cabine do elevador em vistas fixas.  node bancada-navegador/ver-elevador.mjs <sufixo> <pasta> [porta]
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Texturas do raw.githubusercontent baixadas antes (curl) em <pasta>/raw/<md5[0:12]>: a rede do navegador é instável.
const S = process.argv[2] ?? 'agora', OUT = process.argv[3] ?? '/tmp', PORTA = process.argv[4] ?? '3131';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{width:900,height:600}, ignoreHTTPSErrors:true })).newPage();
// O navegador não atravessa o proxy da sandbox: tudo que é externo vem pelo curl (com cache em <pasta>/raw).
await p.route(u => !u.hostname.match(/^(127\.0\.0\.1|localhost)$/), r => {
  const url = r.request().url(), f = `${OUT}/raw/${createHash('md5').update(url+'\n').digest('hex').slice(0,12)}`;
  try { if (!existsSync(f)) execFileSync('curl', ['-sSfL', '-o', f, url], { timeout: 30000 }); }
  catch { return r.abort(); }
  const tipo = /\.png/.test(url) ? 'image/png' : /\.jpe?g/.test(url) ? 'image/jpeg' : /\.json/.test(url) ? 'application/json' : /\.woff2?/.test(url) ? 'font/woff' : 'application/octet-stream';
  return r.fulfill({ status: 200, contentType: tipo, headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f) });
});
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,160)));
for (const [nome,q] of [['fundo','cam=0,1.7,-10.6&alvo=0,1.8,-16'],['porta','cam=0,1.7,-15.2&alvo=0,1.9,-10&timer=7'],
                        ['canto','cam=2.4,2.4,-11.0&alvo=-1.5,1.4,-15.5'],['teto','cam=0,1.6,-13&alvo=0,4,-13.5']]) {
  await p.goto(`http://127.0.0.1:${PORTA}/index.html?elevpreview&${q}`,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,18000));
  await p.screenshot({path:`${OUT}/el-${nome}-${S}.png`}); console.log('ok',nome);
}
await b.close();
