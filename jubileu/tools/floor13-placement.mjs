// Same quality, viewport and camera before/after. Software GPU != phone FPS.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.F13_OUT??'/tmp/f13-placement';await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3094'],{stdio:['ignore','pipe','pipe']});
let browser;const errors=[],results=[];
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Vite timeout')),20000);server.stdout.on('data',d=>{if(d.toString().includes('Local:')){clearTimeout(t);resolve();}});});
 browser=await chromium.launch({executablePath:process.env.F13_CHROMIUM??'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
 const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1,ignoreHTTPSErrors:true});
 page.on('pageerror',e=>errors.push(e.message));
 const start=process.env.F13_START??'brokk';
 await page.goto(`http://127.0.0.1:3094/floor13.html?inicio=${start}&f13perf=1&f13quality=2&f13audit=1&${process.env.F13_QUERY??''}`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'ANDAR 13'}).click();
 await page.waitForFunction(()=>window.__f13r&&window.__f13gl,null,{timeout:180000});
 console.log('scene-ready',await page.evaluate(()=>window.__f13gl));
 await page.waitForFunction(()=>window.__f13Audit && window.__f13cena.getObjectByName('arni-seated')?.children.length,null,{timeout:120000});
 await page.evaluate(()=>{
   const root=window.__f13cena.getObjectByName('arni-bench-frame');root.updateWorldMatrix(true,true);
   const pos=root.position.clone().set(2.7,1.25,1.5).applyMatrix4(root.matrixWorld);
   const target=root.position.clone().set(-.16,.65,-.13).applyMatrix4(root.matrixWorld);
   window.__f13.ir(-15.2,20.2);window.__f13Audit.camera(pos.toArray(),target.toArray());
 });
 for(const mode of ['current',...(process.env.F13_TRIAL_Y?['trial']:[])]){
   if(mode==='trial')await page.evaluate(y=>{window.__f13cena.getObjectByName('arni-seated').position.y=y;},Number(process.env.F13_TRIAL_Y));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const stats=await page.evaluate(()=>{
     const scene=window.__f13cena,frame=scene.getObjectByName('arni-bench-frame'),person=scene.getObjectByName('arni-seated');
     scene.updateMatrixWorld(true);const inverse=frame.matrixWorld.clone().invert();
     const point=frame.position.clone(), samples=[];let meshes=0;
     person.traverse(m=>{if(!m.isSkinnedMesh)return;meshes++;m.skeleton.update();
       for(let i=0;i<m.geometry.attributes.position.count;i++){
         m.getVertexPosition(i,point).applyMatrix4(m.matrixWorld).applyMatrix4(inverse);
         if(Math.abs(point.x+.16)<.12 && Math.abs(point.z+.13)<.09)samples.push(point.y);
       }
     });
     const report=window.__f13Audit.scan();
     return {y:person.position.y,meshes,seatColumnMin:samples.length?Math.min(...samples):null,seatColumnVertices:samples.length,report};
   });
   results.push({mode,...stats});
   await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));
   const png=await page.evaluate(()=>new Promise((resolve,reject)=>{
     const renderer=window.__f13r,original=renderer.render;
     const timeout=setTimeout(()=>{renderer.render=original;reject(Error('Capture timeout'));},45000);
     renderer.render=function(...args){const result=original.apply(this,args);if(this.getRenderTarget()===null){this.render=original;clearTimeout(timeout);resolve(this.domElement.toDataURL('image/png').split(',')[1]);}return result;};
   }));
   await writeFile(`${out}/${mode}.png`,Buffer.from(png,'base64'));
   console.log(mode,JSON.stringify({y:stats.y,meshes:stats.meshes,min:stats.seatColumnMin,objects:stats.report.objects.length,candidates:stats.report.candidates.length}));
 }

 if(process.env.F13_CANDIDATE_SHOTS){
   for(const [id,position,target] of [
     ['market',[11,4,16],[6,1,11]],['bridge',[-13,4,10],[-10.2,1.3,5.7]]
   ]){
     await page.evaluate(([p,t])=>window.__f13Audit.camera(p,t),[position,target]);
     const png=await page.evaluate(()=>new Promise((resolve,reject)=>{
       const renderer=window.__f13r,original=renderer.render;
       const timeout=setTimeout(()=>{renderer.render=original;reject(Error('Capture timeout'));},45000);
       renderer.render=function(...args){const result=original.apply(this,args);if(this.getRenderTarget()===null){this.render=original;clearTimeout(timeout);resolve(this.domElement.toDataURL('image/png').split(',')[1]);}return result;};
     }));
     await writeFile(`${out}/${id}.png`,Buffer.from(png,'base64'));
   }
 }
} catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify({results,errors},null,2));await browser?.close();server.kill();}
