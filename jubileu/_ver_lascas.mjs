import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,180)));
await p.goto('http://127.0.0.1:3055/index.html?f12',{waitUntil:'domcontentloaded',timeout:120000});
const s=ms=>new Promise(r=>setTimeout(r,ms));
await s(4000); await p.click('button',{timeout:30000}).catch(()=>{}); await s(1500);
for(let i=0;i<140;i++){ if(await p.evaluate(()=>window.__f12fase)==='luta')break;
  const btn=await p.$('[data-testid="f12-dialogue"] button'); if(btn)await btn.click({timeout:2000}).catch(()=>{}); await s(300); }
console.log('fase:',await p.evaluate(()=>window.__f12fase));
// atira sem parar: arrasta de um lado pro outro sob a boca
await p.mouse.move(195,600); await p.mouse.down();
let vidaAntes=await p.evaluate(()=>window.__f12estado?.vida??240);
for(let k=0;k<26;k++){
  await p.mouse.move(195+(k%2?60:-60),560+(k%3)*20,{steps:2});
  await s(260);
  const v=await p.evaluate(()=>window.__f12estado?.vida??240);
  if(v<vidaAntes){ console.log('acertou a boca! vida',vidaAntes,'->',v);
    for(let j=0;j<4;j++){ await p.screenshot({path:`/tmp/morte/la-${j}.png`}); await s(90); }
    break; }
  vidaAntes=v;
}
console.log('erros:',errs.slice(0,3)); await b.close();
