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
    { i: 4, key: '05-yourself-boss', x: 27, boss: true },
];

const stageStats = {};
for (const shot of shots) {
    await page.evaluate(({ i, x, patch, boss }) => {
        const d = window.__f8dbg;
        d.jumpMem(i); d.f8.phase = 'platformer'; d.bump();
        d.p8.x = x; d.p8.lastGroundX = x; d.p8.y = 0; d.p8.lastGroundY = 0;
        if (patch) d.p8.patch = { x: x + 2.5, y: 1.7, t: 10 };
        if (boss && d.p8.boss) {
            d.p8.boss.phase = 'telegraph'; d.p8.boss.timer = 0.6;
            d.p8.boss.x = 38; d.p8.boss.introSeen = true;
        }
    }, shot);
    await page.waitForTimeout(450);
    await page.evaluate(() => {
        if (window.__f8plat?.introRef) window.__f8plat.introRef.current = false;
    });
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

// Estados congelados da luta: além de regressão visual, estas imagens deixam
// claro se o telegraph e a resposta de cada problema continuam legíveis.
const bossShots = [
    { key: '06-boss-vergonha-slam', attack: 'slam' },
    { key: '07-boss-controle-sweep', attack: 'sweep' },
    { key: '08-boss-ruminacao-parry', attack: 'throw' },
    { key: '09-boss-isolamento-cocoon', attack: 'cocoon' },
    { key: '10-boss-costura-exposed', attack: 'exposed' },
];
for (const shot of bossShots) {
    await page.evaluate(({ attack }) => {
        const d = window.__f8dbg; d.jumpMem(4); d.f8.phase = 'platformer'; d.bump();
        if (window.__f8plat?.introRef) window.__f8plat.introRef.current = true;
        d.p8.x = 29; d.p8.y = 0; d.p8.lastGroundX = 29; d.p8.lastGroundY = 0;
        const b = d.p8.boss; b.x = 38; b.y = 0; b.introSeen = true; b.timer = 2;
        b.seams = attack === 'cocoon' ? 2 : attack === 'throw' ? 3 : attack === 'sweep' ? 4 : 5;
        b.projectiles = []; b.shield = false; b.atkT = 0.35;
        if (attack === 'exposed') { b.phase = 'exposed'; b.attack = null; }
        else {
            b.phase = 'attack'; b.attack = attack;
            if (attack === 'slam') { b.slamX = 30.8; b.slamN = 0; }
            if (attack === 'sweep') { b.atkT = 0.92; b.sweepX = 31.5; b.sweepY = 0.55; b.sweepN = 0; b.sweepDir = -1; }
            if (attack === 'throw') b.projectiles = [{ x: 33.2, y: 1.55, vx: -9, vy: -0.3, parryable: true, reflected: false, dead: false, t: 0.5 }];
            if (attack === 'cocoon') {
                b.x = 31.5; b.y = 3; b.shield = true;
                d.p8.enemies.forEach((e, i) => { e.dead = false; e.x = 31.5 + (i ? 4.5 : -4.5); e.y = 4.7 + i * 0.7; });
            }
        }
    }, shot);
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${out}/${shot.key}.png` });
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
