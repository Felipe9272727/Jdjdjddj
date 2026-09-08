// ── ANDAR PELO ANDAR ─────────────────────────────────────────────────────────
//
// A folha de estados da volta 32 fotografava o jogador PARADO onde ele nasce, e
// isso levou a dois diagnósticos errados seguidos: que a vista inicial era vazia
// (não é — é o vão da porta emoldurando o desenho, e o retrato do celular é que
// corta as laterais) e que a moldura marrom era permanente (não é — é o vão em
// que ele nasce).
//
// Esta bancada MOVE o jogador pelo curso com o teleporte de teste e fotografa a
// cada passo. Sem andar, qualquer julgamento sobre o começo do andar é sobre uma
// pose, não sobre o jogo.
//
//   node bancada-navegador/andar-pelo-andar.mjs
import { chromium, devices } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const perfil = mkdtempSync(join(tmpdir(), 'f3onde-'));
const ctx = await chromium.launchPersistentContext(perfil, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  // O Felipe joga em CELULAR, e foi o formato (não o level design) que fez a
  // vista inicial parecer vazia. Padrão passa a ser retrato; `MESA=1` volta ao
  // desktop para comparar.
  viewport: process.env.MESA ? { width: 1024, height: 640 } : { width: 390, height: 844 },
  ...(process.env.MESA ? {} : { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 5'].userAgent }),
  args: ['--no-sandbox','--disable-setuid-sandbox','--unlimited-storage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const p = ctx.pages()[0] ?? await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
await p.goto('http://127.0.0.1:3011/index.html',{waitUntil:'domcontentloaded',timeout:180000});
await p.waitForFunction(()=>typeof window.__startFloor==='function',null,{timeout:120000});
await p.evaluate(()=>window.__startFloor?.(3));
await p.waitForFunction(()=>typeof window.__f3Pincel==='function',null,{timeout:240000}).catch(()=>{});
// Anda para a frente com o teleporte de teste e fotografa: a fachada é
// PERMANENTE ou é só o vão da porta em que ele nasce?
for (const z of [-13, -11, -9, -7, -5]) {
  await p.waitForTimeout(9000);
  await p.evaluate((zz)=>window.__f10teleport?.(0, zz), z).catch(()=>{});
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `/tmp/f3-andando-${process.env.MESA ? 'mesa' : 'cel'}-z${String(z).replace('-','m')}.png` }).catch(()=>{});
  const s = await p.evaluate(()=>({
    jogador: window.__playerPos?.() ?? null,
    diabo: window.__f3DevilPos ? [ +window.__f3DevilPos.x.toFixed(2), +window.__f3DevilPos.y.toFixed(2), +window.__f3DevilPos.z.toFixed(2) ] : null,
    hud: !!document.querySelector('.hud-fixed'),
  })).catch(e=>({erro:String(e).slice(0,60)}));
  console.log('z=', z, JSON.stringify(s));
}
ponte.fechar(); await ctx.close().catch(()=>{}); rmSync(perfil,{recursive:true,force:true});
