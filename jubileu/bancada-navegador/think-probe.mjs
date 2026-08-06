import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const RAIZ = process.argv[2];
const srv = http.createServer((req,res)=>{
  const p = new URL(req.url,'http://x').pathname;
  const f = p==='/modelo.gguf' ? process.env.MODELO : path.join(RAIZ, p==='/'?'index.html':p);
  if(!fs.existsSync(f)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Length':String(fs.statSync(f).size),
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless',
    'Content-Type': f.endsWith('.gguf')?'application/octet-stream':f.endsWith('.js')?'text/javascript':'text/html'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>srv.listen(8799,'127.0.0.1',r));
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-home-user-Jdjdjddj/eb607b4a-9077-5167-b34d-b96450c86372/scratchpad/p-think',
  {executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox','--enable-features=SharedArrayBuffer','--unlimited-storage']});
const pg = await ctx.newPage(); pg.setDefaultTimeout(900000);
pg.on('console',m=>console.log('>',m.text().slice(0,900)));
// SEM ISTO A SONDA MORRE MUDA: um erro no módulo da página não vira console,
// vira `pageerror`, e a espera só estoura 15 min depois sem dizer por quê.
pg.on('pageerror',e=>console.log('!! PAGEERROR:', String(e).slice(0,500)));
pg.on('requestfailed',r=>console.log('!! FALHOU:', r.url()));
pg.on('response',r=>{ if(r.status()>=400) console.log('!!', r.status(), r.url()); });
await pg.goto('http://127.0.0.1:8799/cru.html',{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>globalThis.__pronto===true,{timeout:900000});
await ctx.close(); srv.close();
