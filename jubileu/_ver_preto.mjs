import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
await p.goto('http://127.0.0.1:3055/index.html?f12',{waitUntil:'domcontentloaded',timeout:120000});
const s=ms=>new Promise(r=>setTimeout(r,ms));
await s(4000); await p.click('button',{timeout:30000}).catch(()=>{}); await s(1500);
for(let i=0;i<120;i++){ if(await p.evaluate(()=>window.__f12fase)==='luta')break;
  const btn=await p.$('[data-testid="f12-dialogue"] button'); if(btn)await btn.click({timeout:1500}).catch(()=>{}); await s(300); }
let fase='';
for(let i=0;i<800;i++){ fase=await p.evaluate(()=>window.__f12fase); if(fase==='abatido')break; await s(500); }
if(fase!=='abatido'){ console.log('NAO MORREU — fase final:',fase); await b.close(); process.exit(0); }
console.log('entrou em abatido');
let maxOp=0, saiu=false, depois=0;
for(let k=0;k<200;k++){
  const r=await p.evaluate(()=>{ const f=window.__f12fase; const c=window.__f12estado?.cinema??0;
    const d=[...document.querySelectorAll('div[aria-hidden]')].map(e=>getComputedStyle(e).opacity+'@'+getComputedStyle(e).backgroundColor);
    return {f,c:Number(c.toFixed(2)),d}; });
  if(r.d.length) { const o=Math.max(...r.d.filter(x=>x.includes('rgb(0, 0, 0)')).map(x=>parseFloat(x))); if(o>maxOp) maxOp=o; }
  if(r.c>4.9||saiu) await p.screenshot({path:`/tmp/morte/pr-${saiu?'card':''}${r.c}-${k}.png`});
  if(r.f!=='abatido'){ if(!saiu){ saiu=true; console.log('entrou no card em cinema',r.c); } if(++depois>8) break; }
  await s(70);
}
console.log('opacidade maxima do preto vista:',maxOp);
console.log('erros:',errs.slice(0,3)); await b.close();
