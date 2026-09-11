// ── QUAL É O TETO DE DANO DESTE ANDAR? ───────────────────────────────────────
//
// Um jogador PERFEITO: parado no meio da arena, alinhado com a boca, sem
// desviar de nada, atirando o tempo todo. Ele leva todo dano do mundo, mas
// mede a única coisa que importa aqui: quanto tempo a luta dura NO MELHOR CASO.
//
// Se nem este teto derruba o chefe num tempo de chefe, a luta é longa por
// construção — e nenhuma habilidade do jogador conserta isso.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const SEG = Number(process.env.SEG ?? 70);
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:W,height:H}, hasTouch:true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.goto('http://127.0.0.1:3011/index.html?f12',{waitUntil:'domcontentloaded',timeout:120000});
await new Promise(r=>setTimeout(r,3000));
await p.click('button',{timeout:30000}).catch(()=>{});
for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,350));
  if ((await p.evaluate(()=>window.__f12estado?.fase)) === 'luta') break;
  const bt=await p.$('button'); if(bt) await bt.click({timeout:2500}).catch(()=>{}); }

// põe a nave exatamente no x da boca e deixa lá
await p.evaluate(() => { const n = window.__f12estado.nave; n.alvoX = 0; n.x = 0; });
const t0 = Date.now(), amostras = [];
let aberturas = 0, abertaAnt = false;
while ((Date.now()-t0)/1000 < SEG) {
  const e = await p.evaluate(() => {
    const s = window.__f12estado; const n = s.nave;
    n.alvoX = 0; n.alvoY = (window.__f12arena.yBaixo + window.__f12arena.yAlto)/2;  // trava no meio
    n.piscando = 99;                                                                // invulnerável: medimos DANO, não sobrevivência
    const anel = window.__f12anel;
    return { vida: s.vida, bocaT: s.bocaT, x: n.x, aberta: !!window.__f12aberta };
  }).catch(()=>null);
  if (!e) break;
  amostras.push({ t:(Date.now()-t0)/1000, vida:e.vida });
  await new Promise(r=>setTimeout(r,250));
}
const fim = amostras[amostras.length-1], ini = amostras[0];
ponte.fechar(); await b.close();
const dt = fim.t - ini.t, dv = ini.vida - fim.vida;
console.log(`\n═══ O TETO DO DANO (${W}x${H}) ═══`);
console.log(`  janela medida ....... ${dt.toFixed(1)}s`);
console.log(`  vida: ${ini.vida.toFixed(1)} -> ${fim.vida.toFixed(1)}   (dano ${dv.toFixed(1)})`);
console.log(`  DANO POR SEGUNDO .... ${(dv/dt).toFixed(2)}`);
console.log(`  vida máxima ......... 240`);
console.log(`  => luta completa no MELHOR CASO: ${(240/(dv/dt)).toFixed(0)}s = ${(240/(dv/dt)/60).toFixed(1)} min`);
