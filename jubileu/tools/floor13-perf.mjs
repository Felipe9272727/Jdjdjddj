// Same quality, viewport and camera before/after. Software GPU != phone FPS.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.F13_OUT??'/tmp/f13-perf';await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3094'],{stdio:['ignore','pipe','pipe']});
let browser;const errors=[],results=[];
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Vite timeout')),20000);server.stdout.on('data',d=>{if(d.toString().includes('Local:')){clearTimeout(t);resolve();}});});
 browser=await chromium.launch({executablePath:process.env.F13_CHROMIUM??'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
 const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1,ignoreHTTPSErrors:true});
 page.on('pageerror',e=>errors.push(e.message));
 const start=process.env.F13_START??'brokk';
 await page.goto(`http://127.0.0.1:3094/floor13.html?inicio=${start}&f13perf=1&f13quality=2&${process.env.F13_QUERY??''}`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'ANDAR 13'}).click();
 await page.waitForFunction(()=>window.__f13r&&window.__f13gl,null,{timeout:180000});
 console.log('scene-ready',await page.evaluate(()=>window.__f13gl));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
 for(const mode of (process.env.F13_MODES??'settled,dialogue').split(',')){
   if(mode==='exit') await page.waitForFunction(()=>window.__f13.alvo().startsWith('casa:'),null,{timeout:120000});
   await page.evaluate(()=>{window.__f13React=[];window.__f13Frames=[];let prev=performance.now();window.__f13Capture=true;const loop=now=>{if(!window.__f13Capture)return;window.__f13Frames.push({ms:now-prev,...window.__f13gl});prev=now;requestAnimationFrame(loop);};requestAnimationFrame(loop);});
   await cdp.send('Profiler.start');
   if(mode==='dialogue')await page.evaluate(()=>window.__f13.dialogo('brokk'));
   if(mode==='exit')await page.evaluate(()=>window.__f13.agir());
   if(mode==='bench')await page.evaluate(()=>window.__f13.banco());
   if(mode==='opening')await page.mouse.click(20,20);
   await page.waitForFunction(()=>window.__f13Frames.length>=24,null,{timeout:120000});
   await page.evaluate(()=>{window.__f13Capture=false;});
   const profile=await cdp.send('Profiler.stop');
   await writeFile(`${out}/${mode}.cpuprofile`,JSON.stringify(profile.profile));
   const stats=await page.evaluate(()=>({frames:window.__f13Frames,commits:window.__f13React,gl:window.__f13gl,geometries:window.__f13r.info.memory.geometries,textures:window.__f13r.info.memory.textures}));
   results.push({mode,...stats});
   await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));
   if(process.env.F13_SHOTS){
     const png=await page.evaluate(()=>new Promise(resolve=>{
       const renderer=window.__f13r, original=renderer.render;
       renderer.render=function(...args){const result=original.apply(this,args);
         if(this.getRenderTarget()===null){this.render=original;resolve(this.domElement.toDataURL('image/png').split(',')[1]);}
         return result;
       };
     }));
     await writeFile(`${out}/${mode}.png`,Buffer.from(png,'base64'));

   }
   console.log(mode,JSON.stringify({frames:stats.frames.length,commits:stats.commits.length,reactMs:stats.commits.reduce((s,c)=>s+c.actualDuration,0),gl:stats.gl}));
 }
} catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));await browser?.close();server.kill();}
