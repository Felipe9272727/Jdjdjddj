// Real-browser choreography checks. Vite and Chromium share one process scope.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.F2_QA_OUT??'/tmp/floor2-cinematic-qa';
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3095'],{stdio:['ignore','pipe','pipe']});
let browser;
const errors=[],checks=[],evidence={};
const checked=message=>{checks.push(message);console.log(message);};
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Vite startup timeout')),20000);
    server.stdout.on('data',d=>{if(d.toString().includes('Local:')){clearTimeout(timer);resolve();}});
  });
  browser=await chromium.launch({headless:true,executablePath:process.env.F2_CHROMIUM??'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:844,height:390}});
  page.on('pageerror',e=>errors.push(e.message));
  const preview='http://127.0.0.1:3095/floor2-cinematic.html';
  const film=page.locator('.f2-film'),next=page.getByRole('button',{name:/CONTINUAR/});
  const waitBeat=i=>page.waitForFunction(i=>document.querySelector('.f2-film')?.dataset.beat===String(i),i);
  const settle=()=>page.waitForFunction(()=>!document.querySelector('video').seeking);
  if(!process.env.F2_APP_ONLY) {
    await page.route('**/floor2-mergulhador.mp4',route=>route.abort());
    await page.goto(preview,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.f2-film')?.dataset.fallback==='true');
    await waitBeat(0);
    for(let i=0;i<4;i++)await next.click();
    await page.getByRole('button',{name:'RECEBER EQUIPAMENTO'}).click();
    await page.waitForFunction(()=>window.__f2Film.accept===1);
    assert.deepEqual(await page.evaluate(()=>window.__f2Film.beats),[0,1,2,3,4]);
    assert.equal(await page.evaluate(()=>window.__f2Film.refuse),0);
    checked('failed video preserves all five beats, handover and exactly one acceptance');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Pular conversa'}).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__f2Film.refuse===1);
    assert.equal(await page.evaluate(()=>window.__f2Film.accept),0);
    checked('focused skip works by keyboard and refuses once without awarding gear');
    if(!process.env.F2_FALLBACK_ONLY) {
      await page.unroute('**/floor2-mergulhador.mp4');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('video').currentTime>3.2);
      assert.equal(await film.getAttribute('data-fallback'),'false');
      assert.equal(await film.getAttribute('data-beat'),'0');
      // Freeze only QA media for deterministic stills; production stall recovery stays active.
      await page.evaluate(()=>document.querySelector('video').pause());
      await page.waitForTimeout(300);
      await page.screenshot({path:`${out}/landscape.png`});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:`${out}/portrait.png`});
      const box=await page.locator('.f2-film-caption p').boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=390&&box.y+box.height<=844,'subtitle fits portrait');
      for(let i=1;i<=3;i++){await page.keyboard.press('Space');await waitBeat(i);await settle();}
      await page.waitForTimeout(300);
      assert.equal(await film.getAttribute('data-beat'),'3');
      await page.screenshot({path:`${out}/mask-portrait.png`});
      await page.setViewportSize({width:844,height:390});
      await page.screenshot({path:`${out}/mask-landscape.png`});
      await page.keyboard.press('Space');await waitBeat(4);
      await page.getByRole('button',{name:'RECEBER EQUIPAMENTO'}).click();
      await page.waitForFunction(()=>window.__f2Film.accept===1);
      assert.deepEqual(await page.evaluate(()=>window.__f2Film.beats),[0,1,2,3,4]);
      checked('real H.264 plays, keyboard seeks preserve handover, mobile subtitles fit');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__f2Film.accept===1,null,{timeout:60000});
      assert.deepEqual(await page.evaluate(()=>window.__f2Film.beats),[0,1,2,3,4]);
      assert.equal(await page.evaluate(()=>window.__f2Film.refuse),0);
      assert.equal(await film.count(),0);
      checked('uninterrupted film completes every beat and accepts exactly once');
    }
  }
  if(!process.env.F2_PREVIEW_ONLY) {
    if(process.env.F2_FALLBACK_ONLY&&process.env.F2_APP_ONLY)await page.route('**/floor2-mergulhador.mp4',route=>route.abort());
    await page.setViewportSize({width:844,height:390});
    await page.goto('http://127.0.0.1:3095/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__startFloor&&window.__f2Test,null,{timeout:90000});
    await page.evaluate(()=>window.__startFloor(2,'floor2Diver'));
    await page.waitForFunction(()=>window.__f2Test.snapshot().level===2);
    await page.evaluate(()=>window.__f2Test.prepare());
    await page.waitForFunction(()=>!window.__f2Test.snapshot().paused);
    assert.equal(await page.evaluate(()=>window.__f2Test.snapshot().gear),false);
    await page.evaluate(()=>window.__f2Test.conversation());
    if(!process.env.F2_FALLBACK_ONLY) {
      await page.waitForFunction(()=>window.__f2Test.snapshot().diverFilm,null,{timeout:20000});
      // Drain already queued R3F frames before measuring the Canvas loop.
      await page.waitForFunction(()=>window.__f2RenderState().loop==='never'&&window.__f2RenderState().pending===0);
      const frame=await page.evaluate(()=>window.__f2RenderState().frame);
      await page.waitForTimeout(400);
      const after=await page.evaluate(()=>window.__f2RenderState());
      assert.equal(after.frame,frame);assert.equal(after.loop,'never');
      evidence.coveredCanvas={before:frame,after:after.frame,waitMs:400,loop:after.loop};
    }
    await waitBeat(0);
    for(let i=1;i<=4;i++){await next.click();await waitBeat(i);await settle();}
    await page.waitForFunction(()=>window.__f2Test.snapshot().diverPhase==='handover');
    await page.getByRole('button',{name:'RECEBER EQUIPAMENTO'}).click();
    // Software WebGL is slow: keep the real animation but reduce the test viewport.
    await page.setViewportSize({width:320,height:180});
    await page.waitForFunction(()=>window.__f2Test.snapshot().gear,null,{timeout:90000});
    assert.equal(await page.evaluate(()=>window.__f2Test.snapshot().diverFilm),false);
    assert.equal(await page.evaluate(()=>window.__f2RenderState().loop),'always');
    checked(process.env.F2_FALLBACK_ONLY?'real App fallback awards gear and resumes gameplay':'real App pauses covered Canvas, awards gear and resumes gameplay');
  }
  if(errors.length)throw Error(errors.join('; '));
  console.log(JSON.stringify({checks,errors,evidence}));
} catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally {await writeFile(`${out}/checks.json`,JSON.stringify({checks,errors,evidence},null,2));await browser?.close();server.kill();}
