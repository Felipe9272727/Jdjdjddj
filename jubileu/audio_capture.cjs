// AUDIO critic harness: plays the real Floor 7 intro cutscene with its full WebAudio
// score+SFX, taps an AnalyserNode, and prints the RMS energy profile over cutscene-time
// (proving every cue fires + the dynamic arc + the mix level). Headless can't emit sound,
// so judge the SYNTHESIS in src/floor7Sfx.ts together with this energy/sync analysis.
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--use-gl=swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const pg = await (await b.newContext({viewport:{width:480,height:270}})).newPage();
  pg.on('pageerror',e=>console.log('ERR',e.message));
  await pg.goto('http://127.0.0.1:3000/floor7cutscene.html',{waitUntil:'load',timeout:30000});
  await pg.waitForFunction(()=>window.__ready===true,{timeout:20000}).catch(()=>console.log('no ready'));
  const t0=Date.now();
  while(Date.now()-t0<225000){ const d=await pg.evaluate(()=>window.__done?window.__done():false); if(d){console.log('cutscene reached onDone');break;} await sleep(1000); }
  const log = await pg.evaluate(()=>window.__audioLog?window.__audioLog():[]);
  const band={}; let peak=0,sum=0,n=0;
  for(const [t,r] of log){ const k=(Math.floor(t*2)/2).toFixed(1); band[k]=Math.max(band[k]||0,r); peak=Math.max(peak,r); sum+=r; n++; }
  console.log('BEATS: 0 LEGS 0-2.4 | 1 REVEAL 2.4-4.6 | 2 LOOK_BACK 4.6-6.7 | 3 LAUGH 6.7-8.9 | 4 TALK 8.9-18.7');
  console.log('dialogue lines at t = 6.95 / 9.3 / 11.5 / 13.7 / 15.9');
  console.log(`samples=${n}  peakRMS=${peak.toFixed(3)}  meanRMS=${(sum/Math.max(1,n)).toFixed(3)}`);
  console.log('max RMS per 0.5s band (energy + sync):');
  Object.entries(band).sort((a,b)=>parseFloat(a[0])-parseFloat(b[0])).forEach(([t,r])=>{
    console.log(`  t=${t.padStart(5)}  ${r.toFixed(3)} ${'#'.repeat(Math.round(r*120))}`);
  });
  await pg.close(); await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
