// ── O ARRASTO FUNCIONA? ───────────────────────────────────────────────────────
//
// O dono do jogo disse "mesmo eu tocando, eu não consigo mexer o avião". Foto
// não responde isso: um avião parado no meio da tela é exatamente o que se vê
// quando ninguém está tocando E quando o toque está quebrado.
//
// Esta bancada arrasta DE VERDADE (pointer events do navegador, como um dedo) e
// compara o x/y da nave antes e depois. Roda nos dois aspectos, porque ele joga
// com o celular deitado e a composição foi feita em pé.
//
//   node bancada-navegador/o-arrasto-funciona.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const TELAS = [
    { nome: 'celular EM PÉ   ', width: 412, height: 915 },
    { nome: 'celular DEITADO ', width: 915, height: 412 },
];

for (const t of TELAS) {
    const ctx = await b.newContext({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: 1, hasTouch: true });
    const p = await ctx.newPage(); await ponte.instalarEm(p);
    await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    p.on('pageerror', e => console.log('  [ERRO]', String(e.message).slice(0, 160)));
    await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 3500));
    await p.click('button', { timeout: 30000 }).catch(() => {});
    // atravessa a introdução e o diálogo até a luta começar
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const fase = await p.evaluate(() => window.__f12fase);
        if (fase === 'luta') break;
        const bt = await p.$('button'); if (bt) await bt.click({ timeout: 3000 }).catch(() => {});
    }
    const fase = await p.evaluate(() => window.__f12fase);
    const arena = await p.evaluate(() => window.__f12arena && { ...window.__f12arena });
    const antes = await p.evaluate(() => window.__f12nave && { x: window.__f12nave.x, y: window.__f12nave.y });

    // UM ARRASTO DE DEDO, do meio da tela para a esquerda e para cima.
    const cx = Math.round(t.width / 2), cy = Math.round(t.height * 0.62);
    const alvoX = Math.round(t.width * 0.2), alvoY = Math.round(t.height * 0.35);
    await p.mouse.move(cx, cy); await p.mouse.down();
    for (let i = 1; i <= 10; i++) {
        await p.mouse.move(cx + (alvoX - cx) * i / 10, cy + (alvoY - cy) * i / 10);
        await new Promise(r => setTimeout(r, 40));
    }
    await new Promise(r => setTimeout(r, 350));
    const depois = await p.evaluate(() => window.__f12nave && { x: window.__f12nave.x, y: window.__f12nave.y });
    await p.mouse.up();

    const dx = depois && antes ? depois.x - antes.x : NaN;
    const dy = depois && antes ? depois.y - antes.y : NaN;
    console.log(`${t.nome} ${t.width}x${t.height}  fase=${fase}  arena.x=${arena ? arena.x.toFixed(2) : '?'}`);
    console.log(`   nave antes  x ${antes ? antes.x.toFixed(2) : '?'}  y ${antes ? antes.y.toFixed(2) : '?'}`);
    console.log(`   nave depois x ${depois ? depois.x.toFixed(2) : '?'}  y ${depois ? depois.y.toFixed(2) : '?'}`);
    console.log(`   ARRASTOU?   dx ${Number.isFinite(dx) ? dx.toFixed(2) : '?'}  dy ${Number.isFinite(dy) ? dy.toFixed(2) : '?'}  -> ${Math.hypot(dx, dy) > 0.4 ? 'SIM' : '*** NÃO ***'}`);
    await ctx.close();
}
ponte.fechar(); await b.close();
