const { chromium } = require('playwright');

(async () => {
  const BASE = 'http://localhost:3000';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu',
           '--disable-dev-shm-usage','--use-gl=swiftshader',
           '--ignore-certificate-errors'],
    headless: true,
  });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, ignoreHTTPSErrors:true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[PAGE_ERR]',e.message.substring(0,120)));

  await page.goto(BASE, {waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(4000);
  await page.getByText('ENTER THE LOBBY').click();
  await page.waitForTimeout(4000);

  // Screenshot lobby (Floor 1)
  await page.screenshot({path:'/tmp/g0-lobby.png'});
  console.log('Lobby screenshot taken');

  // Walk toward elevator: hold W for 10 seconds
  console.log('Walking toward elevator (W key)...');
  await page.keyboard.down('w');
  let floor2 = false;
  for(let i=0;i<30;i++){
    await page.waitForTimeout(333);
    const lvl = await page.evaluate(()=>{
      const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0 && (e.textContent?.includes('02') || e.textContent?.includes('ANDAR 2')));
      return t?.textContent?.trim()??'';
    });
    if(lvl.includes('02')){ floor2=true; console.log('  Floor 2 detected at step',i); break; }
  }
  await page.keyboard.up('w');

  if(!floor2){
    // Check if we reached the elevator zone
    const txt2 = await page.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').substring(0,200));
    console.log('State after walk:', txt2.substring(0,150));
    // Wait for elevator - it might be triggering
    await page.waitForTimeout(25000);
    const txt3 = await page.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').substring(0,200));
    console.log('State after wait:', txt3.substring(0,150));
  }

  await page.screenshot({path:'/tmp/g1-floor2-arrive.png'});

  // Check level
  const level = await page.evaluate(()=>{
    const el=[...document.querySelectorAll('*')].find(e=>e.textContent?.includes('FLOOR') || e.textContent?.includes('Floor'));
    return el?.textContent?.trim()?.substring(0,60)??'unknown';
  });
  console.log('Level indicator:', level);

  // Check for active blend-mode overlays (cyan/underwater tint)
  const overlayDiag = await page.evaluate(()=>{
    const all=[...document.querySelectorAll('*')];
    return all.filter(el=>{
      const s=window.getComputedStyle(el);
      return s.position==='fixed' && parseFloat(s.opacity)>0.02;
    }).map(el=>{
      const s=window.getComputedStyle(el);
      return {
        cls:el.className?.substring(0,60),
        bg:s.backgroundColor.substring(0,50),
        blend:s.mixBlendMode,
        opacity:s.opacity,
        z:s.zIndex,
        visible:el.offsetParent!==null || s.position==='fixed'
      };
    }).filter(o=>o.blend!=='normal' || o.bg!=='rgba(0, 0, 0, 0)').slice(0,20);
  });
  console.log('\nActive overlays on Floor 2:');
  overlayDiag.forEach(o=>console.log(' ',JSON.stringify(o)));

  // Walk around a bit and take more screenshots
  await page.waitForTimeout(2000);
  await page.screenshot({path:'/tmp/g2-floor2-look.png'});

  // Try MODO CRIADOR to fast-travel to floor 2 if we're still on 1
  const lvlTxt = await page.evaluate(()=>document.body.innerText.substring(0,200));
  if(!lvlTxt.includes('02')){
    console.log('\nStill on Floor 1. Trying MODO CRIADOR...');
    try {
      await page.getByText('MODO CRIADOR').click({timeout:2000});
      await page.waitForTimeout(1000);
      await page.screenshot({path:'/tmp/g3-creator.png'});
      const ct = await page.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').substring(0,400));
      console.log('Creator text:', ct.substring(0,300));
    } catch(e){ console.log('Creator mode not clickable'); }
  }

  await browser.close();
  console.log('\nDone. Screenshots at /tmp/g*.png');
})().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
