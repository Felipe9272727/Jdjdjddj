import { chromium } from 'playwright';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W=Number(process.env.W??915), H=Number(process.env.H??412);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:1, hasTouch:true });
const p = await ctx.newPage();
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r=>r.abort().catch(()=>{}));
const PORTA = process.env.PORTA ?? '3011';
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f12`,{waitUntil:'domcontentloaded',timeout:120000});
await new Promise(r=>setTimeout(r,3500));
for (let i=0;i<120;i++){
  const f = await p.evaluate(()=>window.__f12estado?.fase ?? null).catch(()=>null);
  if (f==='luta') break;
  const alvo = await p.$('[data-testid="f12-dialogue"] button') ?? await p.$('button');
  if (alvo) await alvo.click({timeout:1200}).catch(()=>{});
  await new Promise(r=>setTimeout(r,260));
}
// mede SEM interferir: nenhum evaluate durante a janela
const r = await p.evaluate(async ()=>{
  const amostras=[]; let q=0;
  const laco=()=>{q++;requestAnimationFrame(laco);}; requestAnimationFrame(laco);
  for (let s=0;s<12;s++){ const a=q; await new Promise(r=>setTimeout(r,1000)); amostras.push(q-a); }
  const cena=window.__f12cena; let malhas=0, tri=0;
  // De QUEM são as malhas: sobe até um ancestral com nome, para saber o que
  // instanciar. Contar 947 sem saber de onde não é diagnóstico.
  const porDono={};
  cena?.traverse?.(o=>{ if(o.isMesh&&o.visible){ malhas++;
    const g=o.geometry;
    if(g?.index) tri+=g.index.count/3; else if(g?.attributes?.position) tri+=g.attributes.position.count/3;
    let a=o, nome='(sem nome)';
    while(a){ if(a.name){ nome=a.name; } a=a.parent; }
    porDono[nome]=(porDono[nome]||0)+1;
  }});
  const top=Object.entries(porDono).sort((a,b)=>b[1]-a[1]).slice(0,12);
  // O NÚMERO QUE IMPORTA: chamadas de desenho de verdade, já depois do culling.
  const gl = window.__f12gl ?? null;
  const info = gl?.info?.render ? { calls: gl.info.render.calls, tris: gl.info.render.triangles } : null;
  return { amostras, malhas, tri: Math.round(tri), top, info };
});
const s=r.amostras.slice().sort((a,b)=>a-b);
console.log(`  FPS por segundo: ${r.amostras.join(' ')}`);
console.log(`  mediana ${s[Math.floor(s.length/2)]}   min ${s[0]}   max ${s[s.length-1]}`);
console.log(`  malhas visíveis ${r.malhas}   triângulos ~${r.tri}`);
if (r.info) console.log(`  DRAW CALLS reais: ${r.info.calls}   triângulos desenhados: ${r.info.tris}`);
else console.log('  (renderer não exposto em window.__f12gl)');
console.log('  de quem são:'); for(const [k,v] of r.top) console.log(`    ${String(v).padStart(4)}  ${k}`);
await b.close();
