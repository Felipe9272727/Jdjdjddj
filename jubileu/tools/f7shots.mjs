/**
 * f7shots.mjs — os 6 POSTAIS OFICIAIS do Andar 7.
 *
 * Gera as 6 câmeras fixas do navio no bench floor7play.html, para comparação
 * visual antes/depois de qualquer mudança. Critério de aprovação do projeto:
 * se um postal piorou, a mudança não passa.
 *
 *   node tools/f7shots.mjs [--out DIR] [--label nome] [--port 5173]
 *
 * Requer o vite dev server rodando (cd jubileu && npm run dev -- --port 5173).
 * Chromium headless via swiftshader (funciona no ambiente remoto).
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = arg('out', '/tmp/f7shots');
const LABEL = arg('label', 'atual');
const PORT = arg('port', '5173');
mkdirSync(OUT, { recursive: true });

// Câmeras em COORDENADAS DE MUNDO (ship-local × 1.85). Proa = +z, popa = −z.
// [nome, pos(x,y,z), target(x,y,z)]
const PRESETS = [
    ['1-proa-heroi',   [17, 8, 26],    [0, 3.5, -2]],     // 3/4 da proa — o cartão-postal
    ['2-popa-leme',    [-14, 9, -26],  [0, 4.5, 2]],      // 3/4 da popa — cabine + leme
    ['3-conves',       [1.4, 4.6, 9],  [-0.8, 3.4, -9.8]],// do spawn olhando o convés até o leme
    ['4-leme-close',   [2.4, 6.4, -14.2], [-0.83, 4.4, -9.4]],// de ré, por cima: timão + quarterdeck
    ['5-costado-agua', [24, 3.2, 4],   [0, 2.2, 0]],      // linha d'água + casco + contact foam
    ['6-elevador-escotilha', [-5.2, 5.6, 16], [0.6, 2.6, 7.5]], // área do elevador + escotilha do diário
];

const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium', chromium.executablePath()].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));
if (!executablePath) throw new Error(`Chromium não encontrado. Tentativas: ${candidates.join(', ')}. Defina PLAYWRIGHT_CHROMIUM_EXECUTABLE.`);
const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));

await page.goto(`http://localhost:${PORT}/floor7play.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 45000 });
await page.waitForTimeout(3500);        // deixa o mar/céu/capitão assentarem

for (const [name, p, t] of PRESETS) {
    await page.evaluate(([p, t]) => window.__cam(p[0], p[1], p[2], t[0], t[1], t[2]), [p, t]);
    await page.waitForTimeout(500);
    const file = `${OUT}/${LABEL}-${name}.png`;
    await page.screenshot({ path: file });
    console.log('postal', file);
}
await page.evaluate(() => window.__camOff());
await browser.close();
console.log(`OK — 6 postais "${LABEL}" em ${OUT}`);
