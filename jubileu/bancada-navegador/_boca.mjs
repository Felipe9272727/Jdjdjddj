import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache:true, registrar:()=>{} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:1100,height:620}, deviceScaleFactor:1, hasTouch:true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
p.on('pageerror', e=>console.log(' [ERRO]', String(e.message).slice(0,160)));
await p.goto('http://127.0.0.1:3011/index.html?f12',{waitUntil:'domcontentloaded',timeout:120000});
await new Promise(r=>setTimeout(r,3000));
for (let i=0;i<40;i++){ const bt=await p.$('button'); if(bt) await bt.click({timeout:2500}).catch(()=>{});
  await new Promise(r=>setTimeout(r,300));
  if ((await p.evaluate(()=>window.__f12estado?.fase))==='luta') break; }
// prende a boca ESCANCARADA e fotografa
const info = await p.evaluate(()=>{
  const s=window.__f12estado, r=window.__f12regras, cena=window.__f12cena, cam=window.__f12cam, T=window.__THREE;
  s.nave.piscando=9999;
  const B=r.BOCA_ALVO ?? null;
  const proj=(x,y,z)=>{ const v=new T.Vector3(x,y,z).project(cam);
    return {px:Math.round((v.x*0.5+0.5)*1100), py:Math.round((-v.y*0.5+0.5)*620)}; };
  const cabeca=cena.getObjectByName('cabeca');
  const caixa=new T.Box3().setFromObject(cabeca);
  const topo=proj(0,caixa.max.y,r.ARENA.zCabeca), base=proj(0,caixa.min.y,r.ARENA.zCabeca);
  return { boca: B? proj(B.x,B.y,r.ARENA.zCabeca):null, bocaY:B?B.y:null,
           topoCabeca:topo, baseCabeca:base, alturaCabeca:r.ALTURA_DA_CABECA };
});
console.log(JSON.stringify(info));
// escancara
const t0=Date.now();
while (Date.now()-t0<9000){
  await p.evaluate(()=>{ const s=window.__f12estado;
    s.nave.piscando=9999; if(s.vida<100) s.vida=250;
    s.bocaT = 2.6;   // dentro do estado ABERTA
  });
  await new Promise(r=>setTimeout(r,60));
}
await p.screenshot({path:'/tmp/boca-aberta.png'});
await b.close(); await ponte.fechar?.();
