const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader']});
  const pg=await(await b.newContext()).newPage();
  pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
  pg.on('console',m=>{if(m.type()==='error')console.log('CONSOLEERR',m.text());});
  await pg.goto('http://127.0.0.1:3001/floor7play.html',{waitUntil:'domcontentloaded',timeout:30000});
  await pg.waitForTimeout(4000);
  console.log('READY',await pg.evaluate(()=>window.__ready));
  await b.close();
})().catch(e=>console.log('FATAL',e.message));
