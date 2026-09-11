// ── O QUE NINGUÉM VÊ ─────────────────────────────────────────────────────────
// Metade do conteúdo deste andar está atrás de 50% da vida do chefe, e jogando
// de verdade ninguém chega lá. Esta bancada força a vida para baixo e fotografa
// o que existe e nunca é visto: a virada, os dois ataques novos, a vitória.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:2, hasTouch:true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
p.on('pageerror', e=>console.log('  [ERRO]', String(e.message).slice(0,170)));
await p.goto('http://127.0.0.1:3011/index.html?f12',{waitUntil:'domcontentloaded',timeout:120000});
await new Promise(r=>setTimeout(r,3000));
await p.click('button',{timeout:30000}).catch(()=>{});
for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,350));
  if ((await p.evaluate(()=>window.__f12estado?.fase))==='luta') break;
  const bt=await p.$('button'); if(bt) await bt.click({timeout:2500}).catch(()=>{}); }
const arqs=[];
const foto = async (nome) => { const f=`/tmp/nv-${arqs.length}.png`; await p.screenshot({path:f}); arqs.push([f,nome]); };

// UM golpe só, até um fio acima da virada — e o jogador fica invulnerável,
// senão ele morre antes de os padrões novos aparecerem.
await p.evaluate(() => { window.__f12ferir(126); });
await new Promise(r=>setTimeout(r,600));
await foto('a VIRADA (50% da vida)');
for (let i=0;i<5;i++){ const bt=await p.$('button'); if(bt) await bt.click({timeout:2000}).catch(()=>{}); await new Promise(r=>setTimeout(r,450)); }
// agora os dois padrões novos existem. Trava a vida e a vida do jogador, e
// fotografa uma volta inteira da rotação.
const vistos = new Set();
for (let i=0;i<14;i++){
  await p.evaluate(()=>{ const s=window.__f12estado; s.nave.piscando = 9999; });
  await new Promise(r=>setTimeout(r,1500));
  const at = await p.evaluate(()=>window.__f12estado?.ataqueNoAr);
  if (at && !vistos.has(at)) { vistos.add(at); await foto(`pos-virada: ${at}`); }
  if (vistos.has('mare') && vistos.has('elevadores')) break;
}
console.log('padrões vistos depois da virada:', [...vistos].join(', '));
ponte.fechar(); await b.close();
const py=`
from PIL import Image, ImageDraw
import sys, json
itens=json.loads(sys.argv[1]); saida=sys.argv[2]
ims=[(Image.open(f),n) for f,n in itens]
w,h=ims[0][0].size; esc=430.0/w; w,h=int(w*esc),int(h*esc)
ims=[(im.resize((w,h)),n) for im,n in ims]
cols=3; linhas=(len(ims)+cols-1)//cols
folha=Image.new('RGB',(cols*(w+6)+6, linhas*(h+22)+6),(18,15,13))
d=ImageDraw.Draw(folha)
for i,(im,nome) in enumerate(ims):
    x=6+(i%cols)*(w+6); y=6+(i//cols)*(h+22)
    folha.paste(im,(x,y)); d.text((x+4,y+h+5),nome,fill=(220,210,190))
folha.save(saida)
`;
execFileSync('python3',['-c',py,JSON.stringify(arqs),process.argv[2]??'/tmp/nunca-visto.png']);
console.log('📄', process.argv[2]??'/tmp/nunca-visto.png');
