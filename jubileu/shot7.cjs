const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader']});
  const A={
    hero:{p:[12,5.5,14],t:[0,1.4,0]},
    broadside:{p:[16,2.6,1],t:[0,1.4,0]},
    bow:{p:[1.5,3.2,16],t:[0,0.8,4]},
    stern:{p:[2,3.6,-14],t:[0,1.2,-4]},
    topdown:{p:[0.5,16,1],t:[0,0,-1]},
    capclose:{p:[0.6,1.6,3.2]},
  };
  for(const [tag,cfg] of Object.entries(A)){
    const pg=await(await b.newContext({viewport:{width:900,height:760}})).newPage();
    await pg.addInitScript((c)=>{window.__orbit=c.p; if(c.t)window.__target=c.t;}, cfg);
    await pg.goto(`http://127.0.0.1:${process.env.PORT||3000}/floor7.html`,{waitUntil:'domcontentloaded',timeout:30000});
    try{await pg.waitForFunction(()=>window.__ready===true,{timeout:20000});}catch{}
    await pg.waitForTimeout(2200); await pg.screenshot({path:`/tmp/c-${tag}.png`}); console.log(tag,'ok'); await pg.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
