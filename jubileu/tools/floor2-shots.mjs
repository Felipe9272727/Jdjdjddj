// Run from jubileu. F2_CHROMIUM may point to an installed Chromium binary.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve(process.env.F2_QA_OUT ?? '/tmp/floor2-qa');
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3092'],{stdio:['ignore','pipe','pipe']});
let browser;
try {
    await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Vite did not start')),20000);
        server.stdout.on('data',data=>{if(data.toString().includes('Local:')){clearTimeout(timer);resolve();}});
        server.on('exit',code=>reject(new Error('Vite exited '+code)));
    });
    browser=await chromium.launch({headless:true,executablePath:process.env.F2_CHROMIUM,
        args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
    const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1,ignoreHTTPSErrors:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const results=[];
    const shots=process.env.F2_HUD ? [['deep','high',390,844],['deep','high',844,390]] : process.env.F2_QUICK ? [['rim','medium',900,600],['deep','medium',900,600]] :
        [['rim','medium',900,600],['cave','medium',900,600],['deep','medium',900,600],['shards','medium',900,600],['rim','high',390,844],['deep','high',844,390]];
    for (const [view,quality,width,height] of shots) {
        await page.setViewportSize({width,height});
        const start=Date.now();
        await page.goto(`http://127.0.0.1:3092/floor2.html?view=${view}&quality=${quality}&clean=1${process.env.F2_HUD?'&hud=1':''}`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.__f2PreviewStats?.frames>12,null,{timeout:60000});
        await page.screenshot({path:path.join(out,`${view}-${quality}-${width}.png`),timeout:60000});
        results.push({view,quality,width,height,loadMs:Date.now()-start,stats:await page.evaluate(()=>window.__f2PreviewStats)});
    }
    await writeFile(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({out,results,errors}));
    if (errors.length) process.exitCode=1;
} finally {await browser?.close();server.kill();}
