/**
 * f6-playtest.cjs — plays the WHOLE Floor 6 escape room through the real UI:
 * walks with WASD, presses [E] on prompts, types the padlock code on the DOM
 * keypad, holds the crank button, clicks through the guest. Asserts the state
 * machine after every beat and screenshots the highlights.
 *
 * DEV-ONLY. Usage: node f6-playtest.cjs   (vite dev must be up)
 */
const { chromium } = require('playwright');

const exe = process.env.PW_CHROMIUM
    || '/opt/pw-browsers/chromium-1223/chrome-linux64/chrome';

const fails = [];
const log = (m) => console.log('  ' + m);
const assert = (cond, msg) => {
    if (cond) log('✓ ' + msg);
    else { fails.push(msg); console.log('  ✗ FAIL: ' + msg); }
};

(async () => {
    const browser = await chromium.launch({
        executablePath: exe,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
        headless: true,
    });
    const page = await browser.newContext({ viewport: { width: 520, height: 360 } }).then((c) => c.newPage());
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('CE ' + m.text().slice(0, 200)); });

    await page.goto('http://127.0.0.1:3000/floor6.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const f6 = (expr) => page.evaluate(`window.__f6dbg.f6.${expr}`);
    const teleport = (x, z, theta, phi = 0.05) => page.evaluate(`(() => {
        window.__f6dbg.posRef.current.set(${x}, 0, ${z});
        window.__f6ang.current.theta = ${theta};
        window.__f6ang.current.phi = ${phi};
    })()`);
    const pos = () => page.evaluate(`[window.__f6dbg.posRef.current.x, window.__f6dbg.posRef.current.z]`);
    const promptText = async () => {
        const el = await page.$('button:has-text("[E]")');
        return el ? (await el.innerText()).replace('[E]', '').trim() : null;
    };
    /** Press E on the current prompt, optionally wait the card out and close it. */
    const interactE = async (expectCard = true, settle = 400) => {
        await key('keydown', 'e'); await key('keyup', 'e');
        await page.waitForTimeout(settle);
        if (expectCard) {
            // cards can be delayed up to ~1.6s by the 3D beat
            try {
                await page.waitForSelector('text=toque para fechar', { timeout: 9000 });
            } catch { return false; }
            await page.waitForTimeout(250);
            await key('keydown', 'e'); await key('keyup', 'e');     // close
            await page.waitForTimeout(750);
        }
        return true;
    };
    const key = (type, k) => page.evaluate(`window.dispatchEvent(new KeyboardEvent('${type}', { key: '${k}' }))`);
    /** Hold a movement key until cond() or maxMs — the headless page renders
     *  slow and dt is clamped, so distance ≠ wall-clock time. */
    const walkUntil = async (k, cond, maxMs = 25000) => {
        await key('keydown', k);
        const t0 = Date.now();
        let ok = false;
        while (Date.now() - t0 < maxMs) {
            await page.waitForTimeout(300);
            if (await cond()) { ok = true; break; }
        }
        await key('keyup', k);
        return ok;
    };
    const echo = async (tag) => {
        const st = await page.evaluate(`(() => { const f = window.__f6dbg.f6, p = window.__f6dbg.posRef.current;
            return f.phase + ' @ (' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ') insp=' + f.inspecting; })()`);
        const cards = await page.evaluate(`document.body.innerText.includes('toque para fechar')`);
        log(`   [${tag}] ${st} card=${cards}`);
    };

    console.log('— ARRIVE → BANG —');
    await teleport(0, -8.6, Math.PI);
    const walked = await walkUntil('w', async () => (await pos())[1] > -6.8);
    await page.waitForTimeout(800);
    assert(walked, 'player can walk (movement alive)');
    assert(await f6('phase') === 'explore', 'bang fires on the walk-in');
    await page.screenshot({ path: '/tmp/pt-01-bang.png' });

    console.log('— BEDROOM READS —');
    for (const [tag, x, z, th] of [
        ['aviso', -1.7, -8.6, 0], ['quadro', -2.5, -8.6, 0],
        ['maquina', -5.8, -8.0, 0], ['diario', -6.9, 2.2, Math.PI / 2],
        ['telefone', -7.0, 4.5, Math.PI / 2], ['mala', -2.0, 5.0, Math.PI],
        ['janela', -7.0, -2.0, Math.PI / 2],
    ]) {
        await teleport(x, z, th);
        await page.waitForTimeout(750);
        const p = await promptText();
        await echo(tag);
        const ok = await interactE(true);
        assert(p !== null && ok, `${tag}: prompt "${p}" + card`);
    }
    assert(await f6('quadroMoved') === true, 'quadro swung aside');

    console.log('— ABRIDOR → COLCHÃO —');
    await teleport(-4.9, -8.2, 0.1);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('Gaveta'), 'drawer prompt');
    await interactE(true);
    assert(await f6('inv.abridor') === true, 'abridor in inventory');
    await teleport(-6.0, 1.2, Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);                                  // the cut
    assert(await f6('camaCut') === true, 'mattress cut open');
    await page.waitForTimeout(300);
    await interactE(true);                                  // the take
    assert(await f6('inv.manivela') === true, 'manivela taken');
    await page.screenshot({ path: '/tmp/pt-02-manivela.png' });

    console.log('— CABIDE —');
    await teleport(-3.5, 5.4, Math.PI);
    await page.waitForTimeout(750);
    await interactE(true);                                  // open
    assert(await f6('wardrobeOpen') === true, 'wardrobe open');
    await interactE(true);                                  // take
    assert(await f6('inv.cabide') === true, 'cabide taken');

    console.log('— TV: canal 2 —');
    await teleport(-0.3, 1.2, -Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);                                  // turn on (ch 9)
    assert(await f6('tvOn') === true, 'tv on');
    await interactE(false, 700);                            // ch 1 (fx only)
    await interactE(true);                                  // ch 2 → card
    assert(await f6('tvChannel') === 2, 'reached canal 2');
    await page.screenshot({ path: '/tmp/pt-03-tv.png' });

    console.log('— CADEADO 9142 —');
    await teleport(0.4, -5.5, Math.PI / 2);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('Cadeado'), 'padlock prompt');
    await key('keydown', 'e'); await key('keyup', 'e');
    await page.waitForSelector('text=CADEADO — 4 DÍGITOS', { timeout: 8000 });
    for (const d of '9142') {
        await page.click(`button:has-text("${d}")`);
        await page.waitForTimeout(150);
    }
    await page.waitForTimeout(600);
    assert(await f6('bathOpen') === true, 'bathroom unlocked');
    await page.waitForSelector('text=toque para fechar', { timeout: 9000 });
    await key('keydown', 'e'); await key('keyup', 'e');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/pt-04-bathdoor.png' });

    console.log('— VAPOR → ESPELHO → RALO —');
    await teleport(3.2, -8.3, 0);
    await page.waitForTimeout(750);
    await interactE(true);                                  // tap on
    assert(await f6('tapOn') === true, 'hot tap running');
    await page.evaluate(`window.__f6dbg.f6.fogT = 5.98`);   // fast-forward the steam
    await page.waitForTimeout(1600);
    assert(await f6('fogDone') === true, 'mirror fogged');
    await page.screenshot({ path: '/tmp/pt-05-fog.png' });
    await teleport(3.2, -8.2, 0, -0.15);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('Espelho'), 'mirror prompt');
    await interactE(true);
    assert(await f6('mirrorRead') === true, 'message read');
    await teleport(3.2, -8.3, 0);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('Pescar'), 'fishing prompt');
    await interactE(true);
    assert(await f6('inv.chave') === true, 'chave fished out');

    console.log('— COZINHA —');
    await teleport(0.7, 3.0, Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);
    assert(await f6('kitchenOpen') === true, 'kitchen unchained');
    await page.waitForTimeout(1200);
    // gelo
    await teleport(4.6, -1.9, -Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);                                  // open fridge
    assert(await f6('fridgeOpen') === true, 'fridge open');
    await interactE(true);                                  // take ice
    assert(await f6('inv.gelo') === true, 'gelo taken');
    // stove is dead without matches
    await teleport(4.6, 0.6, -Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);
    assert(await f6('stoveLit') === false, 'stove refuses without matches');
    // despensa + fósforos
    await teleport(3.75, 5.3, Math.PI);
    await page.waitForTimeout(700);
    log(`   [despensa] prompt="${await promptText()}"`); await echo('despensa');
    await interactE(true);
    assert(await f6('despensaOpen') === true, 'pantry open (the truth)');
    await page.screenshot({ path: '/tmp/pt-06-truth.png' });
    await teleport(4.5, 5.3, Math.PI);
    await page.waitForTimeout(700);
    log(`   [fosforos] prompt="${await promptText()}"`); await echo('fosforos');
    assert((await promptText() || '').includes('fósforos'), 'matches prompt');
    await interactE(true);
    assert(await f6('inv.fosforos') === true, 'fósforos taken');
    // light, melt, take
    await teleport(4.6, 0.6, -Math.PI / 2);
    await page.waitForTimeout(750);
    log(`   [fogao] prompt="${await promptText()}"`); await echo('fogao');
    await interactE(true);
    await echo('fogao-pos');
    assert(await f6('stoveLit') === true, 'stove lit');
    await interactE(true);
    assert(await f6('melting') === true, 'ice on the flame');
    await page.evaluate(`window.__f6dbg.f6.meltT = 8.97`);  // fast-forward the melt
    await page.waitForTimeout(1800);
    assert(await f6('panRele') === true, 'relay waiting in the pan');
    await page.screenshot({ path: '/tmp/pt-07-melt.png' });
    await interactE(true);
    assert(await f6('inv.rele') === true, 'relé taken');

    console.log('— FUSÍVEL —');
    await teleport(4.6, -8.3, -1.2);
    await page.waitForTimeout(750);
    await interactE(true);                                  // lid off
    assert(await f6('lidOff') === true, 'cistern lid off');
    await interactE(true);                                  // take
    assert(await f6('inv.fusivel') === true, 'fusível taken');

    console.log('— INTO THE DEAD CAB (through the squeeze gap, walking) —');
    await teleport(0, -8.8, 0);
    const through = await walkUntil('w', async () => (await pos())[1] < -10.4);
    const [, z1] = await pos();
    assert(through, `walked through the door gap (z=${z1.toFixed(2)})`);
    await page.screenshot({ path: '/tmp/pt-08-insidecab.png' });

    console.log('— INSTALLS —');
    await teleport(-2.0, -12.6, Math.PI / 2);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('fusíveis'), 'fuse box prompt');
    await interactE(true);
    assert(await f6('installed.fusivel') === true, 'fusível installed');
    await teleport(1.9, -11.2, -Math.PI / 2);
    await page.waitForTimeout(750);
    await interactE(true);
    assert(await f6('installed.rele') === true, 'relé installed');
    await page.screenshot({ path: '/tmp/pt-09-panel.png' });

    console.log('— O GUINCHO —');
    await teleport(0, -13.9, 0);
    await page.waitForTimeout(750);
    assert((await promptText() || '').includes('manivela'), 'winch prompt');
    await key('keydown', 'e'); await key('keyup', 'e');      // installs crank → crank UI
    await page.waitForSelector('text=GUINCHO DE EMERGÊNCIA', { timeout: 9000 });
    assert(await f6('installed.manivela') === true, 'manivela installed');
    const btn = await page.waitForSelector('button:has-text("SEGURE PARA GIRAR")');
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2500);
    const ct = await f6('crankT');
    assert(ct > 0.02, `crank progresses while held (crankT=${ct.toFixed(2)})`);
    await page.screenshot({ path: '/tmp/pt-10-cranking.png' });
    await page.evaluate(`window.__f6dbg.f6.crankT = 0.97`);   // fast-forward the wind
    await page.waitForTimeout(4000);
    await page.mouse.up();
    assert(['blackout', 'guest'].includes(await f6('phase')), 'crank wound → blackout');

    console.log('— O HÓSPEDE —');
    await page.waitForTimeout(4500);
    assert(await f6('phase') === 'guest', 'guest appeared');
    for (let i = 0; i < 14 && (await f6('phase')) === 'guest'; i++) {
        await page.mouse.click(260, 180);   // skip typing / advance
        await page.waitForTimeout(1300);
    }
    assert(await f6('phase') === 'guestIdle', 'dialogue done → guestIdle');
    await teleport(0, -5.6, 0);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/pt-11-guest.png' });

    console.log('\n' + (fails.length ? `✗ ${fails.length} FAILS:\n  - ` + fails.join('\n  - ') : '✓ FULL CLEAR — escape room jogável de ponta a ponta'));
    if (errs.length) console.log('console/page notes:\n' + [...new Set(errs)].slice(0, 6).join('\n'));
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
