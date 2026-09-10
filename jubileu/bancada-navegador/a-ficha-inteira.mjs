// Fotografa `ficha-de-bocas.html`: as vinte e sete bocas desenhadas pelo pincel
// do jogo, do tamanho da folha do Felipe, numa foto só.
//   node bancada-navegador/a-ficha-inteira.mjs [saida.png]
import { chromium } from 'playwright';
const SAIDA = process.argv[2] ?? '/tmp/ficha-de-bocas.png';
/**
 * Qual folha: `cara` (olhos e sobrancelhas) ou nada, que dá a das bocas.
 *
 * `rosto` saiu. Ela apontava para `o-rosto-inteiro.html`, que montava o rosto
 * com os PINCÉIS de canvas — e o rosto deixou de ser desenhado em canvas quando
 * virou geometria esculpida. A folha continuava desenhando bonito uma cara que
 * o jogo não tem mais, que é a pior espécie de bancada.
 * A substituta é `as-dezesseis-caras.mjs`, e a diferença de método é o ponto:
 * ela FOTOGRAFA O JOGO em vez de redesenhar o rosto por conta própria, então
 * não tem como divergir dele.
 */
const QUAL = { cara: 'ficha-da-cara' }[process.argv[3]] ?? 'ficha-de-bocas';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
p.on('pageerror', e => console.log('[erro]', String(e.message).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await p.goto(`http://127.0.0.1:3011/bancada-navegador/${QUAL}.html`, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForFunction(() => document.title === 'pronto', { timeout: 30000 });
await p.screenshot({ path: SAIDA, fullPage: true });
console.log('📷', SAIDA);
await b.close();
