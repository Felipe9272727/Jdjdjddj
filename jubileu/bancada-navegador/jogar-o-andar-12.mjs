// ── JOGAR O ANDAR 12 DE VERDADE ──────────────────────────────────────────────
// Segura o toque (que é o gatilho), persegue a boca com o dedo e mede o que
// acontece: dano por segundo, vidas perdidas, padrões vistos, FPS.
import { chromium } from 'playwright';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W=Number(process.env.W??915), H=Number(process.env.H??412);
const SEG=Number(process.env.SEGUNDOS??60);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:1, hasTouch:true });
const p = await ctx.newPage();
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r=>r.abort().catch(()=>{}));
const erros=[]; p.on('pageerror', e=>erros.push(String(e.message).slice(0,160)));
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
await p.evaluate(()=>{ window.__q=0; const l=()=>{window.__q++;requestAnimationFrame(l);}; requestAnimationFrame(l); });
// SEGURA o gatilho e pilota
await p.mouse.move(W*0.5, H*0.66); await p.mouse.down();
const t0=Date.now(); const fps=[]; let qAnt=0, tAnt=Date.now();
const vistos=new Set(); let vidaIni=null, menorVida=Infinity, vidasPerdidas=0, vidasAnt=null;
let vidaAnt=null, acertos=0, danoTotal=0, cargaMax=0, misseis=0;
while (Date.now()-t0 < SEG*1000){
  const e = await p.evaluate(()=>{const s=window.__f12estado;
     // o padrão no ar é DERIVADO dos projéteis: o estado não o expõe
     const tipos=[...new Set((s?.projeteis??[]).map(q=>q.tipo).filter(t=>t!=='tiro'))];
     return{ fase:s?.fase, vida:s?.vida, vidas:s?.nave?.vidas ?? s?.vidas,
     at: tipos[0] ?? null, tipos, q:window.__q,
     nx: s?.nave?.x ?? 0, ny: s?.nave?.y ?? 0,
     carga: s?.arma?.charge ?? null, misseis: s?.arma?.missilesEmitted ?? 0 };}).catch(()=>null);
  if(!e) break;
  if(e.vida!=null){ vidaIni ??= e.vida; menorVida=Math.min(menorVida,e.vida); }
  for(const t of (e.tipos??[])) vistos.add(t);
  if(vidaAnt!=null && e.vida<vidaAnt-0.001){ acertos++; danoTotal += vidaAnt-e.vida; }
  vidaAnt=e.vida;
  if(e.carga!=null) cargaMax=Math.max(cargaMax,e.carga);
  misseis=Math.max(misseis, e.misseis??0);
  if(vidasAnt!=null && e.vidas<vidasAnt) vidasPerdidas += vidasAnt-e.vidas;
  vidasAnt=e.vidas;
  const now=Date.now();
  if(now-tAnt>1000){ fps.push(+((e.q-qAnt)/((now-tAnt)/1000)).toFixed(1)); qAnt=e.q; tAnt=now; }
  // ── JOGAR A ARMA COMO ELA FOI DESENHADA ─────────────────────────────────
  //
  // Esta arma carrega enquanto o jogador fica PARADO (com o dedo na tela) e
  // despeja a rajada quando ele volta a se mexer; a 100% ela solta um míssil.
  // Um bot que se move o tempo todo nunca carrega — e foi assim que a primeira
  // medição desta bancada acusou uma luta de 245 s que é da bancada, não do
  // jogo. O ciclo abaixo espera a carga encher e só então manobra.
  const ciclo = (now - t0) % 6000;
  if (ciclo < 4800) {
    // PARADO, carregando. O dedo continua na tela (é o gatilho), imóvel.
    await new Promise(r=>setTimeout(r,40));
  } else {
    // MEXENDO: despeja a rajada, varrendo em volta do centro
    const fase = (ciclo - 4800) / 1000;
    await p.mouse.move(W*(0.5 + 0.10*Math.sin(fase*6)), H*(0.60 + 0.06*Math.cos(fase*5)), {steps:2});
    await new Promise(r=>setTimeout(r,40));
  }
}
await p.mouse.up();
const fim = await p.evaluate(()=>{const s=window.__f12estado;return{fase:s?.fase,vida:s?.vida};}).catch(()=>({}));
await b.close();
const dano = (vidaIni??0) - Math.min(menorVida, fim.vida ?? Infinity);
const med = fps.slice().sort((a,b)=>a-b)[Math.floor(fps.length/2)] ?? 0;
console.log(`\n  fase final ......... ${fim.fase}`);
console.log(`  vida ............... ${vidaIni} -> ${fim.vida}   (menor vista ${menorVida})`);
console.log(`  DANO em ${SEG}s ....... ${dano.toFixed(1)}   => dps ${(dano/SEG).toFixed(2)}`);
console.log(`  luta completa ...... ${dano>0 ? ((vidaIni/(dano/SEG)).toFixed(0)+'s') : 'NUNCA'}`);
console.log(`  vidas perdidas ..... ${vidasPerdidas}`);
console.log(`  padrões vistos ..... ${[...vistos].join(', ') || 'nenhum'}`);
console.log(`  acertos ............ ${acertos}   dano/acerto ${acertos? (danoTotal/acertos).toFixed(2):'-'}`);
console.log(`  carga máx vista .... ${cargaMax.toFixed(2)} de 2,4   mísseis soltos: ${misseis}`);
console.log(`  FPS mediana ........ ${med}   min ${Math.min(...fps)}`);
if(erros.length) console.log(`  ERROS: ${erros.slice(0,3)}`);
