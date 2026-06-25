// AAA-critic capture: drives the REAL intro cutscene (floor7cutscene.html) and
// grabs frames keyed to cutscene-time (not wall time) so the beats are covered
// regardless of headless fps. Usage: node critic_capture.cjs <outdir-tag>
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const tag = process.argv[2] || 'crit';
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--use-gl=swiftshader'] });
  const pg = await (await b.newContext({viewport:{width:760,height:430}})).newPage();
  pg.on('pageerror',e=>console.log('ERR',e.message));
  await pg.goto('http://127.0.0.1:3000/floor7cutscene.html',{waitUntil:'load',timeout:30000});
  await pg.waitForFunction(()=>window.__ready===true,{timeout:20000}).catch(()=>console.log('no ready'));
  // sample across the whole 16.8s timeline: legs, swap, reveal, cut, lookback, laugh, talk x3
  const targets = [1.2, 2.5, 3.7, 5.0, 6.1, 7.2, 8.4, 9.9, 12.0, 14.0, 16.3, 18.35];
  let i = 0; const t0 = Date.now();
  while (i < targets.length && Date.now()-t0 < 280000){
    const st = await pg.evaluate(()=>({t:window.__t?window.__t():0, beat:window.__beat?window.__beat():-1, line:window.__line?window.__line():-9, done:window.__done?window.__done():false}));
    if (st.t >= targets[i]){
      await pg.screenshot({path:`/tmp/${tag}_${String(i).padStart(2,'0')}_t${targets[i]}.png`});
      console.log(`shot ${i} t=${st.t.toFixed(2)} beat=${st.beat} line=${st.line}`);
      i++;
    }
    if (st.done){ console.log('cutscene DONE at i',i,'(reached onDone)'); break; }
    await sleep(200);
  }
  console.log('captured', i, 'frames');
  await pg.close(); await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
