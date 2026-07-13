/** Captures the real DONE -> SAIL sequence after deterministically cleaning. */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { createServer } from 'vite';

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = arg('out', '/tmp/f7helmshots');
const PORT = arg('port', '5173');
mkdirSync(OUT, { recursive: true });

// Keep the dev server in this process. Some sandboxed runners isolate PTY
// sessions into separate network namespaces, making an otherwise healthy Vite
// process unreachable from Playwright.
const server = await createServer({
    server: { host: '127.0.0.1', port: Number(PORT), strictPort: true },
    logLevel: 'error',
});
await server.listen();

const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium', chromium.executablePath()].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));
if (!executablePath) throw new Error('Chromium não encontrado; defina PLAYWRIGHT_CHROMIUM_EXECUTABLE.');
const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 220)));
await page.goto(`http://127.0.0.1:${PORT}/floor7play.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 45000 });
await page.waitForTimeout(900);

const reached = await page.evaluate(() => {
    const state = () => window.__brainState?.() ?? -1;
    // GREET -> FETCH -> CLEAN.
    window.__forceTick?.(1, 0, 5, false); window.__forceTick?.(1, 0, 5, true);
    window.__forceTick?.(1, 1.35, -1.8, false); window.__forceTick?.(1, 1.35, -1.8, true);
    const puddles = window.__puddles?.() ?? [];
    for (const puddle of puddles) {
        for (const dz of [-0.38, 0, 0.38]) for (const dx of [-0.38, 0, 0.38]) {
            for (let burst = 0; burst < 6 && state() < 4; burst++) {
                window.__forceTick?.(4, puddle.x + dx, puddle.z + dz, true);
            }
            if (state() >= 4) return state();
        }
    }
    return state();
});
if (reached < 4) throw new Error(`Não chegou a DONE; estado=${reached}`);

const beats = [250, 900, 850, 850, 950, 1050];
for (let i = 0; i < beats.length; i++) {
    await page.waitForTimeout(beats[i]);
    const [state, active] = await page.evaluate(() => [window.__brainState?.(), window.__phaseActive?.()]);
    const file = `${OUT}/${i + 1}-helm-state-${state}.png`;
    await page.screenshot({ path: file });
    console.log('helm beat', i + 1, 'state', state, 'cinematic', active, file);
}
// Dedicated final proof: the cabin, captain and wheel must share one readable
// frame after the cinematic releases the player camera.
await page.evaluate(() => window.__setPhaseActive?.(true));
await page.evaluate(() => window.__cam?.(-4.8, 3.25, -4.15, -0.35, 2.15, -8.3));
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/7-final-helm-starboard.png` });
await page.evaluate(() => window.__camOff?.());
await page.evaluate(() => window.__setPhaseActive?.(false));
await browser.close();
await server.close();
console.log(`OK — sequência do leme em ${OUT}`);
