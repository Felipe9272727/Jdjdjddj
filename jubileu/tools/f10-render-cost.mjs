/**
 * CONTROLE do diagnóstico do Andar 10: quanto custa só DESENHAR o andar?
 *
 * Entra no Andar 10 e fica parado, sem nunca acordar o LLM. Serve para separar
 * duas coisas que a sonda principal mistura: o custo do modelo e o custo do
 * jogo. Sem este controle é fácil culpar o LLM por CPU que o render já estava
 * gastando sozinho.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_URL=http://127.0.0.1:3000/ node tools/f10-render-cost.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/';
const samples = Number(process.env.F10_SAMPLES ?? 6);

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: [
        '--ignore-certificate-errors',
        '--no-sandbox', '--disable-setuid-sandbox',
        '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
    ],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });

await page.waitForFunction(() => typeof window.__startFloor === 'function', { timeout: 120_000 })
    .catch(() => console.log('AVISO: __startFloor não apareceu'));
await page.evaluate(() => window.__startFloor?.(10));
console.log('ANDAR 10 iniciado; medindo SÓ o render (LLM nunca é acordado)');
await page.waitForTimeout(8000);

/** Soma o %CPU dos processos do Chromium por tipo. */
function cpuByType() {
    const out = execSync('ps -eo pcpu,rss,args --no-headers', { encoding: 'utf8' });
    const totals = {};
    for (const line of out.split('\n')) {
        if (!line.includes('chrome-linux/chrome')) continue;
        const cpu = Number(line.trim().split(/\s+/)[0]);
        const rss = Number(line.trim().split(/\s+/)[1]);
        const type = /--type=([a-z-]+)/.exec(line)?.[1] ?? 'browser';
        totals[type] ??= { cpu: 0, rssMB: 0 };
        totals[type].cpu += cpu;
        totals[type].rssMB += rss / 1024;
    }
    return totals;
}

// Mede FPS junto: um render que já engasga sozinho explica lentidão sem LLM.
for (let i = 0; i < samples; i += 1) {
    const fps = await page.evaluate(() => new Promise((resolve) => {
        let frames = 0;
        const started = performance.now();
        const tick = () => {
            frames += 1;
            if (performance.now() - started >= 2000) resolve(frames / 2);
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
    const totals = cpuByType();
    const parts = Object.entries(totals)
        .map(([type, v]) => `${type} ${v.cpu.toFixed(0)}% / ${v.rssMB.toFixed(0)}MB`)
        .join('  ·  ');
    console.log(`[${i}] fps=${fps.toFixed(1)}  ${parts}`);
}

await browser.close();
