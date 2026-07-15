/** Visual regression runner for the rebuilt Floor 8 crochet sequence.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium F8_URL=http://127.0.0.1:3000/floor8.html \
 *     node tools/f8-v2-shots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F8_URL ?? 'http://127.0.0.1:3000/floor8.html';
const out = process.env.F8_SHOT_DIR ?? '/tmp/f8-v2-shots';
const stageFrames = Number(process.env.F8_STAGE_FRAMES ?? 30);
const finalFrames = Number(process.env.F8_FINAL_FRAMES ?? 120);
const shotFilter = new Set((process.env.F8_SHOTS ?? '').split(',').filter(Boolean));
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--no-zygote', '--single-process',
        '--ignore-gpu-blocklist', '--in-process-gpu', '--use-gl=angle',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForFunction(() => window.__ready === true && window.__f8dbg, undefined, { timeout: 60_000 });
await page.evaluate(() => {
    const d = window.__f8dbg; d.jumpMem(4); d.f8.phase = 'platformer'; d.bump();
});
await page.waitForTimeout(650);
await page.screenshot({ path: `${out}/00-yourself-intro.png` });
await page.addStyleTag({ content: '[data-f8-intro]{display:none!important}' });

const shots = [
    { i: 0, key: '01-quintal-gate', x: 36.2 },
    { i: 1, key: '02-escola-intrusive', x: 32.5 },
    { i: 2, key: '03-tempestade-readable', x: 38, patch: true },
    { i: 3, key: '04-hotel-echo', x: 54 },
    { i: 4, key: '05-yourself-pulse', x: 27, boss: true, attack: 'pulse' },
    { i: 4, key: '06-yourself-sweep', x: 27, boss: true, attack: 'sweep' },
    { i: 4, key: '07-yourself-cage', x: 27, boss: true, attack: 'cage' },
    { i: 4, key: '08-yourself-fisgue', x: 31, boss: true, phase: 'exposed', freeze: true },
    { i: 4, key: '09-yourself-costure', x: 31, boss: true, phase: 'bound', tension: 0.78, freeze: true },
];

const stageStats = {};
for (const shot of shots.filter((s) => !shotFilter.size || shotFilter.has(s.key))) {
    await page.evaluate(({ i, x, patch, boss, attack, phase, tension, freeze }) => {
        const d = window.__f8dbg;
        d.jumpMem(i); d.f8.phase = 'platformer'; d.bump();
        d.p8.x = x; d.p8.lastGroundX = x; d.p8.y = 0; d.p8.lastGroundY = 0;
        if (patch) d.p8.patch = { x: x + 2.5, y: 1.7, t: 10 };
        if (boss && d.p8.boss) {
            d.p8.boss.phase = phase ?? 'telegraph'; d.p8.boss.timer = 0.6;
            d.p8.boss.x = 38; d.p8.boss.introSeen = true;
            d.p8.boss.attack = attack ?? 'pulse'; d.p8.boss.targetX = x;
            if (phase === 'bound') {
                d.p8.boss.tethered = true; d.p8.bossTether = true; d.p8.tension = tension ?? 0.78;
            }
        }
        if (freeze && window.__f8plat?.introRef) window.__f8plat.introRef.current = true;
        d.bump();
    }, shot);
    await page.waitForTimeout(450);
    await page.evaluate((freeze) => {
        if (!freeze && window.__f8plat?.introRef) window.__f8plat.introRef.current = false;
    }, shot.freeze);
    await page.waitForTimeout(550);
    await page.screenshot({ path: `${out}/${shot.key}.png` });
    stageStats[shot.key] = await page.evaluate(async (frames) => {
        const deltas = []; let last = performance.now();
        await new Promise((resolve) => {
            let n = 0;
            const tick = (now) => { deltas.push(now - last); last = now; if (++n >= frames) resolve(); else requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
        });
        deltas.sort((a, b) => a - b);
        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        return { avgMs: avg, p95Ms: deltas[Math.floor(deltas.length * 0.95)], approxFps: 1000 / avg };
    }, stageFrames);
}

const frameStats = await page.evaluate(async (frames) => {
    const deltas = [];
    let last = performance.now();
    await new Promise((resolve) => {
        let n = 0;
        const tick = (now) => {
            deltas.push(now - last); last = now;
            if (++n >= frames) resolve(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    deltas.sort((a, b) => a - b);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return { avgMs: avg, p95Ms: deltas[Math.floor(deltas.length * 0.95)], approxFps: 1000 / avg };
}, finalFrames);

await browser.close();
console.log(JSON.stringify({ out, stageStats, frameStats, errors }, null, 2));
