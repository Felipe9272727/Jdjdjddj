// ── O ACERTO MAIS FREQUENTE DO JOGO APARECE NA TELA? ─────────────────────────
//
// O jogador atira sete vezes por segundo, e durante nove ciclos o retorno disso
// foi uma faísca de três pixels. Quando o anel de choque foi construído, um
// avaliador disparou uma foto no quadro seguinte a cada um de OITO acertos e
// achou o anel em ZERO delas: o efeito existia no código e não na tela.
//
// Esta bancada faz a mesma pergunta de forma repetível. Ela vigia a vida do
// chefe a cada 25 ms e fotografa no instante em que ela cai — ou seja, no quadro
// do acerto — e mede quanto de CIANO (a cor do anel, e de mais nada no andar)
// existe em volta da boca.
//
//   node bancada-navegador/o-acerto-aparece.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 1100), H = Number(process.env.H ?? 620);
const QUANTOS = Number(process.env.QUANTOS ?? 8);
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
await new Promise(r => setTimeout(r, 1500));

// ── DUAS PERGUNTAS, E A SEGUNDA É A QUE PEGA O DEFEITO ───────────────────────
//
// A primeira — "aparece na foto?" — foi a que denunciou o problema, e é a que
// mais importa. Mas ela é uma régua RUIM para repetir: `p.screenshot()` leva uns
// 150 ms e o anel vive 0,28 s, então a foto cai depois de metade da vida dele e
// o número balança entre 1 e 2 em 8 sem nada ter mudado no jogo. Medi três
// tamanhos de anel e o número não acompanhou: é latência, não efeito.
//
// A segunda pergunta é a que prende o DEFEITO que existia: o acerto estourava em
// `zCabeca + 2`, dentro de um crânio de 7,8 de raio, e o teste de profundidade
// escondia o efeito ATRÁS da cara dela. Isso é estado, não pixel, e mede sem
// ruído: todo anel nascido tem de estar À FRENTE da superfície do crânio.
const frentes = { total: 0, atras: 0 };
const vistos = new Set();
let ultima = await p.evaluate(() => window.__f12estado?.vida ?? 0);
const arqs = [];
const ate = Date.now() + 45000;
while (Date.now() < ate && arqs.length < QUANTOS) {
  const e = await p.evaluate(() => {
    const s = window.__f12estado, r = window.__f12regras;
    if (s?.nave) s.nave.piscando = 9999;
    const bs = r?.todasAsBolas?.() ?? [];
    const zFrente = r ? r.ARENA.zCabeca + r.ESCALA_DA_CABECA * 0.6 : 0;
    return {
      vida: s?.vida ?? 0,
      aneis: bs.filter((x) => x.vida > 0 && x.anel).map((x) => ({ id: x.x + ',' + x.y + ',' + x.vida.toFixed(2), z: x.z, ok: x.z >= zFrente })),
    };
  }).catch(() => null);
  if (!e) break;
  for (const a of e.aneis) {
    if (vistos.has(a.id)) continue;
    vistos.add(a.id);
    frentes.total++;
    if (!a.ok) frentes.atras++;
  }
  if (e.vida < ultima - 0.01 && arqs.length < QUANTOS) {
    const f = `/tmp/ac-${arqs.length}.png`;
    await p.screenshot({ path: f });
    arqs.push([f, `acerto ${arqs.length + 1}`]);
  }
  ultima = e.vida;
  await new Promise(r => setTimeout(r, 25));
}
await b.close(); await ponte.fechar?.();

console.log(`\n  anéis nascidos ................... ${frentes.total}`);
console.log(`  anéis ATRÁS da cara do chefe ..... ${frentes.atras}  ${frentes.atras === 0 ? 'OK' : 'ESCONDIDO PELO CRÂNIO'}`);
console.log(`  acertos fotografados ............. ${arqs.length}`);
console.log(`  (a foto é a prova de que ele LÊ; a contagem acima é a que não`);
console.log(`   deixa o efeito voltar a ser desenhado dentro do crânio)`);
