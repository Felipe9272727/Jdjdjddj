// ── OS ATAQUES ACERTAM? ──────────────────────────────────────────────────────
//
// O dono do jogo relatou que vários ataques do chefe não acertam o jogador de
// forma confiável. Isto é um defeito de JOGABILIDADE, não de aparência: um
// ataque que se desvia sozinho ensina o jogador a ignorá-lo.
//
// Esta bancada põe o avião PARADO numa grade de posições da arena, com o desvio
// desligado e a invulnerabilidade desligada, e conta quantos toques cada padrão
// consegue. Um padrão que não acerta um alvo imóvel no caminho dele está
// quebrado.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const SEG = Number(process.env.SEGUNDOS ?? 150);
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
p.on('pageerror', e => console.log('  [ERRO]', String(e.message).slice(0, 170)));
await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 3000));
for (let i = 0; i < 40; i++) {
  const bt = await p.$('button'); if (bt) await bt.click({ timeout: 2500 }).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  if ((await p.evaluate(() => window.__f12estado?.fase)) === 'luta') break;
}

// A grade: 3 colunas x 3 alturas dentro da arena.
const pontos = await p.evaluate(() => {
  const r = window.__f12regras, A = r.ARENA;
  const xs = [-A.x * 0.7, 0, A.x * 0.7];
  const ys = [A.yBaixo + 1.0, (A.yBaixo + A.yAlto) / 2, A.yAlto - 1.0];
  const out = [];
  for (const y of ys) for (const x of xs) out.push({ x: +x.toFixed(2), y: +y.toFixed(2) });
  return out;
});

// ── O TOQUE É CONTADO DE FORA ────────────────────────────────────────────────
//
// Sem tocar no código do jogo: a bancada mantém `vidas` cheio e conta toda vez
// que ele CAI. Instrumentar o produto para medir o produto é como este andar já
// perdeu entregas — e um contador de teste no arquivo de jogo é exatamente o
// tipo de coisa que fica lá para sempre.
const resumo = {};
let iPonto = 0;
const fim = Date.now() + SEG * 1000;
while (Date.now() < fim) {
  const alvo = pontos[(iPonto++) % pontos.length];
  const t0 = Date.now();
  let qual = null, toques = 0;
  let vidasAnt = null;
  while (Date.now() - t0 < 6200) {
    const e = await p.evaluate(({ alvo }) => {
      const s = window.__f12estado;
      if (!s?.nave) return null;
      // prende o avião no ponto, vulnerável, e sem morrer
      s.nave.x = alvo.x; s.nave.y = alvo.y;
      s.nave.alvoX = alvo.x; s.nave.alvoY = alvo.y;
      s.nave.piscando = 0;
      const v = s.nave.vidas;
      if (v < 90) s.nave.vidas = 99;
      if (s.vida < 60) s.vida = 200;         // a luta não pode acabar no meio
      return { at: s.ataqueNoAr ?? null, vidas: v };
    }, { alvo }).catch(() => null);
    if (!e) break;
    if (e.at) qual = e.at;
    if (vidasAnt !== null && e.vidas < vidasAnt) toques += vidasAnt - e.vidas;
    vidasAnt = e.vidas >= 90 ? 99 : e.vidas;
    await new Promise(r => setTimeout(r, 25));
  }
  if (qual) {
    resumo[qual] ??= { ciclos: 0, comToque: 0, toques: 0, falhou: [] };
    resumo[qual].ciclos++;
    resumo[qual].toques += toques;
    if (toques > 0) resumo[qual].comToque++;
    else resumo[qual].falhou.push(`(${alvo.x},${alvo.y})`);
  }
}
await b.close(); await ponte.fechar?.();
console.log('\n── O AVIÃO PARADO NO CAMINHO, POR PADRÃO ──');
console.log('  (avião imóvel, vulnerável, em 9 pontos da arena; sem desviar)\n');
console.log('  padrão        ciclos  acertou   toques   pontos onde NÃO acertou');
for (const [k, v] of Object.entries(resumo).sort()) {
  const pct = v.ciclos ? Math.round(v.comToque / v.ciclos * 100) : 0;
  console.log(`  ${k.padEnd(12)} ${String(v.ciclos).padStart(5)} ${String(pct).padStart(6)}% ${String(v.toques).padStart(8)}   ${v.falhou.slice(0, 5).join(' ')}`);
}
