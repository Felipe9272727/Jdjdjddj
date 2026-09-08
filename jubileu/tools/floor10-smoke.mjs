import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.FLOOR10_QA_DIR || '../floor10-qa';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,hasTouch:true});
const errors=[],forbidden=[];let phase='boot';
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/\/src\/(?:App|Player|Floor3|Floor9)\.tsx(?:\?|$)/.test(r.url()))forbidden.push(r.url());});
await page.route(/\.gguf(?:[?#]|$)/,r=>r.abort());
const read=()=>page.evaluate(async()=>{
  const {f10prison:p}=await import('/src/npc/f10Prison.ts');
  const {conviteDoNilo:c}=await import('/src/npc/f10Cooperacao.ts');
  const {npc}=await import('/src/npc/npcStore.ts');
  return {locks:p.locks.map(x=>({id:x.id,progress:x.progress,solved:x.solved})),invite:c.tipo,npc:npc.perception.position,open:npc.open,speaking:npc.speaking};
});
async function until(fn,label,ms=120000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error(`Timeout: ${label}`);}
async function teleport(x,z){await page.evaluate(([x,z])=>window.__f10teleport(x,z),[x,z]);}
async function clickHelp(text){const b=page.locator('[data-floor10-help]').filter({hasText:text});await until(async()=>await b.count()>0&&await b.isEnabled(),'cooperation button');await b.click();}
try{
  await page.goto(process.env.FLOOR10_URL || 'http://127.0.0.1:5173/floor10.html',{waitUntil:'domcontentloaded'});
  await page.locator('[data-floor10-workshop]').waitFor();
  await until(()=>page.evaluate(()=>typeof window.__f10teleport==='function'),'player ready',30000);
  await page.screenshot({path:`${out}/desktop.png`});
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:`${out}/mobile-room.png`});
  await teleport(0,-.5);await new Promise(r=>setTimeout(r,1200));
  await page.screenshot({path:`${out}/mobile-nilo.png`});
  phase='mobile-chat';
  await page.evaluate(async()=>{(await import('/src/npc/npcStore.ts')).npcSet({open:true});});
  await page.locator('[data-floor10-chat]').waitFor();
  await until(async()=>await page.locator('[data-floor10-workshop]').count()===0,'mission hidden during chat',10000);
  await page.screenshot({path:`${out}/mobile-chat.png`});
  await page.evaluate(async()=>{(await import('/src/npc/npcStore.ts')).npcSet({open:false});});
  await page.locator('[data-floor10-workshop]').waitFor();
  await page.setViewportSize({width:480,height:270});
  for(const [id,z] of [['placas',-6],['alavancas',6]]){
    phase=id;await teleport(-7,z);await clickHelp('Nilo, assume o outro contato');
    await until(async()=>!!(await read()).locks.find(l=>l.id===id)?.solved,`${id} solved`);
    console.log(phase,JSON.stringify(await read()));
    await teleport(0,0);await until(async()=>(await read()).invite===null,'invitation released',15000);
  }
  phase='boarding';await clickHelp('Nilo, vamos embora');await teleport(0,-13);
  await until(async()=>await page.locator('[data-floor10-complete]').count()>0,'both boarded');
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:`${out}/complete.png`});
  phase='reset';await page.getByRole('button',{name:'Jogar novamente',exact:true}).click();
  await page.locator('[data-floor10-workshop]').waitFor();
  if((await read()).locks.some(l=>l.solved))throw Error('Reset retained solved locks');
  phase='production-preview';
  await page.goto(process.env.FLOOR10_PREVIEW_URL || 'http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('[data-floor10-workshop]').waitFor();
  await page.screenshot({path:`${out}/production-mobile.png`});
  if(forbidden.length)throw Error('Standalone loaded host game: '+forbidden.join(','));
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(`${out}/result.json`,JSON.stringify({ok:true,locks:2,bothBoarded:true,reset:true,productionPreview:true,hostGameLoaded:false,llmRequiredForPuzzle:false,errors},null,2));
  console.log('Floor10 isolated smoke passed: real Nilo, mobile chat, both locks, boarding and reset; no App/Player/other floors.');
}catch(e){
  let state=null;try{state=await read();}catch{}
  await writeFile(`${out}/failure.json`,JSON.stringify({phase,message:String(e),state,errors,forbidden},null,2));
  await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw e;
}finally{await browser.close();}
