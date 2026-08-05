/**
 * medir-boot.cjs — quanto o jogo desenha ANTES de o jogador ver o menu.
 *
 * DEV-ONLY, nunca entra no build.
 *
 * POR QUE EXISTE
 * "Está lagando" e "travou o celular" são relatos, não números — e o custo de
 * abertura era invisível justamente por acontecer antes de qualquer quadro. As
 * texturas procedurais do jogo nasciam em `const` de escopo de módulo, e o
 * bundle é UM chunk só: todo módulo é avaliado na abertura, inclusive o do
 * Andar 6 para quem nunca saiu do saguão.
 *
 * Esta bancada instrumenta `getContext('2d')` DE FORA (sem tocar no código do
 * jogo) e soma a área de todo canvas 2D criado durante o boot.
 *
 * USO
 *   cd jubileu && npm run dev          # em outro terminal
 *   node medir-boot.cjs
 *
 * MEDIDO NESTA CAIXA (swiftshader, 9s de boot):
 *   antes das texturas preguiçosas .... 142 canvas · 26,10 MB RGBA
 *   depois ............................  29 canvas ·  9,83 MB RGBA
 */
const { chromium } = require('playwright');

const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const alvo = process.env.ALVO || 'http://127.0.0.1:3000/';
const esperaMs = Number(process.env.ESPERA_MS || 9000);

(async () => {
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
    headless: true,
  });
  const page = await browser.newContext({ viewport: { width: 900, height: 700 } })
    .then((c) => c.newPage());

  // O gancho é `getContext('2d')` e não `createElement('canvas')` porque o que
  // custa é o BUFFER: um canvas sem contexto 2D não alocou pixel nenhum. E a
  // largura/altura já estão definidas quando o contexto é pedido.
  await page.addInitScript(() => {
    window.__canvas2d = 0;
    window.__pixels2d = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      if (tipo === '2d') {
        window.__canvas2d++;
        window.__pixels2d += (this.width || 0) * (this.height || 0);
      }
      return original.call(this, tipo, ...resto);
    };
  });

  const erros = [];
  page.on('pageerror', (e) => erros.push('PAGEERR ' + e.message));

  await page.goto(alvo, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Espera o bundle avaliar e o React montar — e NÃO entra no jogo: o que
  // interessa é só o que foi pago sem o jogador ter pedido nada.
  await page.waitForTimeout(esperaMs);

  const r = await page.evaluate(() => ({
    canvas: window.__canvas2d,
    pixels: window.__pixels2d,
  }));
  console.log(`canvas 2D no boot: ${r.canvas}`);
  console.log(`pixels no boot:    ${r.pixels} = ${(r.pixels * 4 / 1048576).toFixed(2)} MB RGBA`);
  if (erros.length) console.log('erros:\n' + erros.join('\n'));

  await browser.close();
  process.exit(0);
})();
