// Real App integration probe; debug actions are excluded from production.
import { chromium } from 'playwright';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile=promisify(execFile);
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.F2_QA_OUT??'/tmp/floor2-flow';await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3093'],{stdio:['ignore','pipe','pipe']});
let browser;
const errors=[],checks=[];
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite startup timeout')),20000);server.stdout.on('data',d=>{if(d.toString().includes('Local:')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.F2_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
 const page=await browser.newPage({viewport:{width:844,height:390},ignoreHTTPSErrors:true});
 page.on('pageerror',e=>errors.push(e.stack??e.message));
 page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url().slice(0,250),r.failure()?.errorText));
 // Optional transport workaround for sandboxes: original public bytes, no mock textures.
 if(process.env.F2_PROXY_ASSETS) await page.route(/^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|fonts\.gstatic\.com)\//,async route=>{
   try {const {stdout}=await runFile('curl',['-sSL','--fail','--max-time','60',route.request().url()],{encoding:'buffer',maxBuffer:32*1024*1024});
     await route.fulfill({body:stdout,headers:{'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin'}});
   } catch {await route.continue();}
 });
 await page.goto('http://127.0.0.1:3093/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__startFloor&&window.__f2Test,null,{timeout:90000});
 await page.evaluate(()=>window.__startFloor(2));
 await page.waitForFunction(()=>window.__f2Test.snapshot().level===2);
 await page.evaluate(()=>window.__f2Test.prepare());
 await page.waitForFunction(()=>!window.__f2Test.snapshot().paused);
 const snapshot=()=>page.evaluate(()=>window.__f2Test.snapshot());
 await page.evaluate(()=>window.__f2Test.teleport(0,-15,5));
 await page.waitForFunction(()=>window.__f2Test.snapshot().player[1]<-10,null,{timeout:90000});
 checks.push('real Player mounted and entered the water');
 await page.evaluate(()=>window.__f2Test.pause(true));
 await page.waitForFunction(()=>window.__f2Test.snapshot().paused);
 await page.evaluate(()=>{window.__f2Test.collect(0);window.__f2Test.catch();});
 assert.equal((await snapshot()).phase,'playing');assert.equal((await snapshot()).shards.length,0);checks.push('settings pause blocks pickups and capture');
 await page.evaluate(()=>window.__f2Test.pause(false));
 await page.waitForFunction(()=>!window.__f2Test.snapshot().paused);
 await page.evaluate(()=>{for(let i=0;i<3;i++)window.__f2Test.collect(i);});
 await page.waitForFunction(()=>window.__f2Test.snapshot().berserk);checks.push('third fragment enrages predator');
 await page.screenshot({path:`${out}/hud-landscape.png`,timeout:60000});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/hud-portrait.png`,timeout:60000});
 await page.evaluate(()=>{window.__f2Test.collect(3);window.__f2Test.collect(4);window.__f2Test.catch();});
 assert.equal((await snapshot()).phase,'winning');
 await page.waitForFunction(()=>window.__f2Test.snapshot().destination===3&&window.__f2Test.snapshot().timer!==null,null,{timeout:15000});
 checks.push('fifth fragment wins same-frame capture race and starts elevator to Floor 3');
 await page.waitForFunction(()=>window.__f2Test.snapshot().level===3,null,{timeout:20000});
 const reset=await snapshot();assert.equal(reset.phase,'playing');assert.equal(reset.shards.length,0);assert.equal(reset.stamina,1);checks.push('leaving Floor 2 resets run and stamina');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__startFloor&&window.__f2Test,null,{timeout:90000});
 await page.evaluate(()=>window.__startFloor(2));
 await page.waitForFunction(()=>window.__f2Test.snapshot().level===2);
 await page.evaluate(()=>window.__f2Test.prepare());
 await page.waitForFunction(()=>!window.__f2Test.snapshot().paused);
 await page.evaluate(()=>{window.__f2Test.catch();window.__f2Test.collect(0);});
 assert.equal((await snapshot()).phase,'dying');assert.equal((await snapshot()).shards.length,0);
 await page.waitForFunction(()=>window.__f2Test.snapshot().level===0,null,{timeout:15000});checks.push('capture blocks pickups and returns to lobby');
 if(errors.length)throw Error('Runtime errors: '+errors.join('; '));
 console.log(JSON.stringify({checks,errors}));
} catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally {await writeFile(`${out}/flow.json`,JSON.stringify({checks,errors},null,2));await browser?.close();server.kill();}
