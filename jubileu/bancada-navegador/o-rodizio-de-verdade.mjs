// ── O RODÍZIO DE VERDADE, MEDIDO NO JOGO ─────────────────────────────────────
//
// Esta bancada existe por causa do defeito mais caro do andar até aqui.
//
// A PORTA GIRATÓRIA foi entregue com seis testes verdes, e ela NUNCA APARECIA
// para o jogador. O cursor do rodízio saía de `Math.floor(bocaT / CICLO)`, e o
// diretor zera `bocaT` quando o balão da virada fecha: depois da virada o cursor
// voltava a zero, o catálogo recomeçava pelo TUTORIAL e o ataque exclusivo da
// segunda metade ficava a oito aberturas de distância, fora do fim da luta.
//
// Os testes passavam porque chamavam `ataqueDaVez(i, ...)` com `i` crescendo —
// um contador que o JOGO zera. Eles testavam a função. O andar ninguém testou.
//
// Régua de módulo prova que a REGRA está certa. Só o navegador prova que o JOGO
// executa a regra. Esta bancada faz a segunda pergunta.
//
//   node bancada-navegador/o-rodizio-de-verdade.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 55);
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

const colher = async (segundos) => {
  const vistos = [];
  const fim = Date.now() + segundos * 1000;
  let ultimo = null;
  while (Date.now() < fim) {
    // o jogador é imortal e o chefe não morre: queremos medir o RODÍZIO, e uma
    // luta que acaba no meio mede a arma, não a rotação
    const e = await p.evaluate(() => {
      const s = window.__f12estado;
      if (s?.nave) s.nave.piscando = 9999;
      if (s && s.vida < 40) s.vida = 120;
      return { at: s?.ataqueNoAr ?? null, virou: !!s?.passouDaVirada };
    }).catch(() => null);
    if (e && e.at && e.at !== ultimo) { vistos.push(e.at); ultimo = e.at; }
    await new Promise(r => setTimeout(r, 120));
  }
  return vistos;
};

// ── A PRIMEIRA LIÇÃO É A PRIMEIRA? ──────────────────────────────────────────
//
// `ENSINO[0]` é o leque, escolhido a dedo em `f12Boss` como "o mais legível".
// O diretor incrementava o índice da abertura uma linha ANTES de usá-lo, então a
// luta abria com `ENSINO[1]` e o leque só voltava pelo saco embaralhado, perto
// do minuto, com a legenda de primeira vez chegando quando o jogador já parou de
// ler balões. Nenhum teste pegava: todos chamam `ataqueDaVez` direto, e o
// defeito morava na ARITMÉTICA DO DIRETOR.
const primeiro = await (async () => {
  const ate = Date.now() + 25000;
  while (Date.now() < ate) {
    const a = await p.evaluate(() => window.__f12estado?.ataqueNoAr ?? null).catch(() => null);
    if (a) return a;
    await new Promise(r => setTimeout(r, 80));
  }
  return null;
})();
console.log(`\n  PRIMEIRO ataque da luta: ${primeiro}  ${primeiro === 'leque' ? 'OK' : 'NÃO É A PRIMEIRA LIÇÃO'}`);

console.log(`\n── ANTES DA VIRADA (${SEGUNDOS}s) ──`);
const antes = await colher(SEGUNDOS);
console.log('  ' + antes.join(' '));
const vazou = antes.filter((q) => q === 'giratoria').length;
console.log(`  giratórias antes da virada: ${vazou}  ${vazou === 0 ? 'OK' : 'VAZOU'}`);

// Força a VIRADA — e só ela. (A primeira versão desta linha mandava um dano
// enorme "para garantir", matava o chefe, e a colheita seguinte vinha vazia
// porque o andar estava na cena de morte. A bancada tem de empurrar o jogo para
// o estado que ela quer medir, não para o fim dele.)
await p.evaluate(() => {
  const s = window.__f12estado;
  const teto = s?.vidaMaxima ?? 300;
  if (s) s.vida = teto * 0.52;            // um fio acima do limiar
});
await p.evaluate(() => window.__f12ferir(12));   // cruza os 50%
for (let i = 0; i < 8; i++) { const bt = await p.$('button'); if (bt) await bt.click({ timeout: 1500 }).catch(() => {}); await new Promise(r => setTimeout(r, 350)); }
const virou = await p.evaluate(() => window.__f12estado?.passouDaVirada);
console.log(`\n── DEPOIS DA VIRADA (${SEGUNDOS}s)  [passouDaVirada=${virou}] ──`);
const depois = await colher(SEGUNDOS);
console.log('  ' + depois.join(' '));

const giras = depois.filter((q) => q === 'giratoria').length;
const ensino = ['leque', 'naves', 'teleguiado', 'mare', 'elevadores'];
const repetiuOEnsino = depois.slice(0, 5).join(',') === ensino.join(',');
console.log(`\n  giratórias depois da virada: ${giras}  ${giras >= 2 ? 'OK' : 'ABAIXO DO ALVO (>=2)'}`);
console.log(`  a segunda metade repete o TUTORIAL na ordem fixa? ${repetiuOEnsino ? 'SIM — o cursor foi zerado' : 'não'}`);
console.log(`  padrões distintos depois da virada: ${new Set(depois).size}`);
await b.close(); await ponte.fechar?.();
