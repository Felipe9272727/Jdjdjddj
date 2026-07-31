/**
 * FOTO DA BARRA DA FILA — o painel de conversa do Andar 10 durante a carga.
 *
 * Roda contra /barras.html, que monta o `Floor10NpcChat` de verdade e empurra
 * números no npcStore. Sem isto, conferir a tela custaria 4,2 GB de download.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-barras-tela.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.goto(`${BASE}/barras.html`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__barras, { timeout: 60_000 });
await page.waitForTimeout(2500);

// innerText, e não os nós folha: os rótulos vivem em <span> dentro de um
// cabeçalho com filhos, e varrer só as folhas os perdia.
const textos = (await page.evaluate(() => document.body.innerText))
    .split('\n').map((t) => t.trim()).filter(Boolean);
console.log('── O QUE ESTÁ ESCRITO NA TELA ──');
for (const t of textos) console.log('  ' + t);

await page.screenshot({ path: 'tools/out-barras-fila.png' });

// E a mesma tela com o motor travado, para conferir o vermelho e o aviso.
await page.click('text=travar o download');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tools/out-barras-travado.png' });
const travado = await page.evaluate(() => document.body.innerText.includes('parado há'));

const tem = (s) => textos.some((t) => t.includes(s));
// A tela mudou: hoje é UMA barra para a fila inteira. O que ela precisa dizer
// é onde a fila está, quanto falta NO TOTAL e QUAL arquivo está descendo.
const naFila = tem('de 4');
const total = tem('4.21 GB');
const qual = tem('EmbeddingGemma');
const ok = naFila && total && qual && travado;
console.log('\n── VEREDITO ──');
console.log(`  a fila diz a posição ("N de 4"): ${naFila}`);
console.log(`  o total dos quatro (4.21 GB) na tela: ${total}`);
console.log(`  o detalhe diz QUAL modelo está descendo: ${qual}`);
console.log(`  aviso de travamento funciona: ${travado}`);
console.log(`  fotos: tools/out-barras-fila.png · tools/out-barras-travado.png`);
console.log(ok ? '\nOK' : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
