const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader']});
  const A={ capclose:[0.6,1.6,3.2], deck:[1.5,2.4,3.0], hull:[6,0.5,4], puddle:[-1.4,0.7,2.6], face:[0.3,1.65,1.7] };
  for(const [tag,pos] of Object.entries(A)){
    const pg=await(await b.newContext({viewport:{width:900,height:760}})).newPage();
    await pg.addInitScript((p)=>{window.__orbit=p;}, pos);
    await pg.goto(`http://127.0.0.1:${process.env.PORT||3000}/floor7.html`,{waitUntil:'domcontentloaded',timeout:30000});
    try{await pg.waitForFunction(()=>window.__ready===true,{timeout:20000});}catch{}
    await pg.waitForTimeout(2200); await pg.screenshot({path:`/tmp/c-${tag}.png`}); console.log(tag,'ok'); await pg.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
