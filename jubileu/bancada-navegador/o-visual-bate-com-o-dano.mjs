// ── O QUE SE VÊ É O QUE MACHUCA? ─────────────────────────────────────────────
//
// O pedido do dono do jogo: "telegrafos, geometria visível e regiões que causam
// dano têm de concordar". Esta bancada compara, para cada projétil no ar, o
// RAIO DE COLISÃO (`p.r`, a regra) com o tamanho da MALHA que o representa na
// cena (a caixa delimitadora do objeto que o jogador vê).
//
// Uma malha muito maior que a hitbox é um ataque que "passa por dentro" do
// avião sem machucar. Uma malha menor é dano vindo do nada. As duas são o mesmo
// defeito com sinais trocados, e nenhum teste de módulo consegue vê-las.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 1, hasTouch: true });
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
const medidas = {};
const fim = Date.now() + Number(process.env.SEGUNDOS ?? 120) * 1000;
while (Date.now() < fim) {
  const lote = await p.evaluate(() => {
    const s = window.__f12estado, cena = window.__f12cena, THREE = window.__THREE;
    if (!s || !cena || !THREE) return [];
    const vivos = s.projeteis.filter((q) => q.tipo !== 'tiro' && q.tipo !== 'carregado' && q.t > 0.2);
    if (!vivos.length) return [];
    // acha, para cada projétil, a malha visível mais próxima dele
    const caixa = new THREE.Box3(), v = new THREE.Vector3();
    const objetos = [];
    cena.traverse((o) => { if (o.visible && (o.isMesh || o.isGroup) && o.name !== 'cabeca') objetos.push(o); });
    const out = [];
    for (const q of vivos) {
      // ── O CASAMENTO TEM DE SER EXATO ──────────────────────────────────
      // A primeira versão pegava "o objeto mais perto dentro de 2,5" e media a
      // caixa DELE. Num leque de cinco esferas vizinhas isso pegava a esfera
      // errada, ou um grupo inteiro, e a razão saía inflada sem defeito nenhum
      // por trás. Agora só conta o objeto que está EM CIMA do projétil.
      let melhor = null, dist = 1e9;
      for (const o of objetos) {
        o.getWorldPosition(v);
        const d = Math.hypot(v.x - q.x, v.y - q.y, v.z - q.z);
        if (d < dist && d < 0.25) { dist = d; melhor = o; }
      }
      if (!melhor) continue;
      caixa.setFromObject(melhor);
      const t = caixa.getSize(new THREE.Vector3());
      out.push({ tipo: q.tipo, r: q.r, larg: +t.x.toFixed(2), alt: +t.y.toFixed(2), dist: +dist.toFixed(2) });
    }
    return out;
  }).catch(() => []);
  for (const m of lote) {
    medidas[m.tipo] ??= { n: 0, r: m.r, larg: 0, alt: 0 };
    const a = medidas[m.tipo];
    a.n++; a.larg += m.larg; a.alt += m.alt;
  }
  await new Promise(r => setTimeout(r, 120));
}
await b.close(); await ponte.fechar?.();
console.log('\n── RAIO DE COLISÃO vs TAMANHO DO QUE SE VÊ ──');
console.log('  padrão        r (hitbox)   malha larg x alt   diâmetro da hitbox   razão');
for (const [k, a] of Object.entries(medidas).sort()) {
  const L = a.larg / a.n, A = a.alt / a.n, d = a.r * 2;
  const razao = (Math.max(L, A) / d);
  const marca = razao > 1.6 ? '  <-- a malha é MUITO maior que o dano' : razao < 0.7 ? '  <-- o dano é maior que a malha' : '';
  console.log(`  ${k.padEnd(12)} ${a.r.toFixed(2).padStart(9)}   ${L.toFixed(2).padStart(5)} x ${A.toFixed(2).padStart(5)}   ${d.toFixed(2).padStart(16)}   ${razao.toFixed(2)}${marca}`);
}
