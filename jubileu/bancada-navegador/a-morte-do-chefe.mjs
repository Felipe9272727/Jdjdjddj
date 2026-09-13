// ── A MORTE DO CHEFE, FOTOGRAFADA E CRONOMETRADA ─────────────────────────────
// O chefe morria numa caixa de texto. A cena existe agora; esta bancada mata ele
// e prova duas coisas que não dá para ver lendo código: que a sequência DURA o
// que a tabela diz, e que ela tem o que ver quadro a quadro.
//
//   W=1100 H=620 node bancada-navegador/a-morte-do-chefe.mjs /tmp/morte.png
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { execFileSync } from 'node:child_process';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const W = Number(process.env.W ?? 1100), H = Number(process.env.H ?? 620);
const saida = process.argv[2] ?? '/tmp/morte.png';
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
  await new Promise(r => setTimeout(r, 350));
  if ((await p.evaluate(() => window.__f12estado?.fase)) === 'luta') break;
}
await new Promise(r => setTimeout(r, 1200));
// lidos do jogo para a bancada não ter número próprio — é assim que o teto da
// vida ficou escrito à mão aqui e mediu um jogo que não existia mais.
const { GRANDE, ALVO_AFUNDO } = await p.evaluate(() => ({
  GRANDE: window.__f12regras?.MORTE?.oGrande ?? 2.4,
  ALVO_AFUNDO: window.__f12regras?.MORTE?.afundoNaTela ?? 0.12,
}));
const arqs = [];
const foto = async (nome) => { const f = `/tmp/mt-${arqs.length}.png`; await p.screenshot({ path: f }); arqs.push([f, nome]); };
await foto('vivo');
// mata
const t0 = Date.now();
await p.evaluate(() => window.__f12ferir(99999));
const INTERVALO = Number(process.env.INTERVALO ?? 550), QUADROS = Number(process.env.QUADROS ?? 9);
const marcos = [];
for (let i = 0; i < QUADROS; i++) {
  // O `y` DE TELA da cabeça, e não o do mundo: o afundo dela já foi "consertado"
  // uma vez com um teste em unidades de mundo que passava enquanto o olho via
  // uma cabeça parada. O que o jogador vê é fração de tela.
  const e = await p.evaluate(() => {
    const s = window.__f12estado, r = window.__f12regras;
    const yTela = r && s ? r.fracaoNaTela(0, r.ALTURA_DA_CABECA - (r.quedaDaMorte?.(s.morteT) ?? 0), r.ARENA.zCabeca) : null;
    return { fase: s.fase, mt: s.morteT, yTela };
  });
  marcos.push({ t: +((Date.now() - t0) / 1000).toFixed(2), ...e });
  await foto(`${((Date.now() - t0) / 1000).toFixed(1)}s · ${e.fase}`);
  await new Promise(r => setTimeout(r, INTERVALO));
}
const fim = await p.evaluate(() => window.__f12estado?.fase);
const pAtropeladas = p.evaluate(() => window.__f12regras?.bolasAtropeladas?.() ?? -1);
console.log('\n── A CENA ──');
for (const m of marcos) console.log(`  ${String(m.t).padStart(5)}s  ${m.fase.padEnd(9)} morteT=${(m.mt ?? 0).toFixed(2)}`);
const morrendo = marcos.filter(m => m.fase === 'morrendo');
console.log(`\n  fase final: ${fim}`);
console.log(`  quadros em 'morrendo': ${morrendo.length} de ${QUADROS}`);
if (morrendo.length) {
  console.log(`  duração observada: >= ${(morrendo[morrendo.length-1].t - morrendo[0].t + INTERVALO/1000).toFixed(1)}s`);
}
// ── O ANEL DE BOLAS AGUENTOU? ───────────────────────────────────────────────
// Bola viva sobrescrita por bola nova = fogo que some antes da hora, e some
// justamente no clímax, que é onde a cena é julgada. O alvo é ZERO.
const atropeladas = await pAtropeladas;
console.log(`  bolas vivas atropeladas pelo anel: ${atropeladas}  ${atropeladas === 0 ? 'OK' : 'O ANEL ESTOUROU'}`);

// ── O AFUNDO, EM FRAÇÃO DE TELA ──────────────────────────────────────────────
const comY = marcos.filter(m => m.fase === 'morrendo' && typeof m.yTela === 'number');
const antesDoGrande = comY.filter(m => m.mt <= GRANDE);
if (antesDoGrande.length >= 2) {
  const desceu = antesDoGrande[0].yTela - antesDoGrande[antesDoGrande.length - 1].yTela;
  const alvo = ALVO_AFUNDO;
  console.log(`\n  afundo antes do estouro grande: ${(desceu * 100).toFixed(1)}% da altura da tela` +
    `  (alvo >= ${(alvo * 100).toFixed(0)}%)  ${desceu >= alvo ? 'OK' : 'ABAIXO DO ALVO'}`);
}
await b.close(); await ponte.fechar?.();
// folha de contato — a mesma receita em PIL das outras bancadas (não há
// `convert` nesta máquina, e descobrir isso depois de matar o chefe custa caro)
const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1]); saida = sys.argv[2]
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
esc = 400.0 / w
w, h = int(w * esc), int(h * esc)
ims = [(im.resize((w, h)), n) for im, n in ims]
cols = 4; linhas = (len(ims) + cols - 1) // cols
folha = Image.new('RGB', (cols * (w + 6) + 6, linhas * (h + 22) + 6), (18, 15, 13))
d = ImageDraw.Draw(folha)
for i, (im, nome) in enumerate(ims):
    x = 6 + (i % cols) * (w + 6); y = 6 + (i // cols) * (h + 22)
    folha.paste(im, (x, y)); d.text((x + 4, y + h + 5), nome, fill=(220, 210, 190))
folha.save(saida)
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), saida]);
console.log('📄', saida);

// ── O CRITÉRIO: A CENA TEM DE TER O QUE VER ──────────────────────────────────
//
// ── A RÉGUA DA LUZ, E O QUE ELA NÃO SABE MEDIR ───────────────────────────────
//
// A primeira versão da morte passava nesta bancada com louvor — 7 quadros em
// `morrendo`, duração certa, fase final certa — e não tinha imagem nenhuma: os
// "estouros" eram faíscas de três pixels. Cronômetro não é espetáculo.
//
// A régua abaixo é a que um avaliador independente propôs: a LUMINÂNCIA MÉDIA
// de cada quadro contra a do quadro "vivo". Ela está aqui sem ajuste, com o
// critério dele (>= 115%), e ela REPROVA a maior parte dos quadros.
//
// Isso é informação, e não desculpa: uma média de quadro inteiro é pouco
// sensível a fogo num céu claro — uma bola cobrindo 4% da tela e somando 60
// níveis move a média 2,4%. Tentei duas substitutas (fração de pixels que
// clarearam; ponto quente normalizado pela mediana do próprio quadro) e as duas
// mediram outra coisa: a primeira mede o CÉU, que a morte clareia inteiro para
// dourado (os quadros de vitória, sem fogo nenhum e com a cabeça já fora do
// quadro, davam 19,8%); a segunda satura, porque 1,35x a mediana de um céu
// claro passa de 255, e ainda conta a caixa de diálogo branca.
//
// Inventar régua até uma passar É inflar a nota. Ficou a dele, com o número que
// der, e o júri continua sendo a FOLHA DE FOTOS — que é o que este projeto diz,
// em `COMO-MEDIR-O-ANDAR-12.md`, desde que o avião foi desenhado dentro da boca
// do chefe por duas revisões seguidas.
const pyLuz = `
from PIL import Image
import sys, json
itens = json.loads(sys.argv[1])

def luz(f):
    px = list(Image.open(f).convert('L').resize((160, 90)).getdata())
    return sum(px) / len(px)

base = luz(itens[0][0])
acima = 0
pico = 0.0
print()
print('── LUMINÂNCIA MÉDIA (o quadro "vivo" = 100%) ──')
for f, n in itens[1:]:
    v = luz(f) / base * 100
    pico = max(pico, v)
    if v >= 115: acima += 1
    print('  %-22s %7.1f%%%s' % (n, v, ' ***' if v >= 115 else ''))
print()
print('  quadros >= 115%% (criterio do avaliador): %d de %d' % (acima, len(itens) - 1))
print('  pico da cena: %.1f%%' % pico)
`;
execFileSync('python3', ['-c', pyLuz, JSON.stringify(arqs)], { stdio: 'inherit' });
