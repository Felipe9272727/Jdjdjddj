// ── O ANDAR INTEIRO, NOS QUATRO ESTADOS ──────────────────────────────────────
//
// As últimas oito voltas foram de PEÇA: som, boca, pose, enquadramento. Cada uma
// verificada isolada, e nenhuma olhou o conjunto — que é o que o Felipe joga.
//
// LIMITE DESTA BANCADA, dito de saída: ela não JOGA o andar. O navegador desta
// caixa roda a ~2 fps e dirigir o parkour pelo teclado nessa velocidade não é
// travessia, é sorteio. O que ela faz é pôr o andar nos quatro estados por que
// ele passa — inteiro, um pincel roubado, dois, três — e fotografar cada um no
// tamanho do celular do Felipe e no desktop. É uma FOLHA DE ESTADOS, não um
// replay, e serve para a pergunta desta volta: o conjunto se lê?
//
//   node bancada-navegador/o-andar-inteiro.mjs [sufixo]
import { chromium, devices } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = process.argv[2] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

const TELAS = [
    { nome: 'cel', largura: 390, altura: 844, dpr: 3, movel: true },
    { nome: 'mesa', largura: 1280, altura: 800, dpr: 1, movel: false },
];

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });

for (const tela of TELAS) {
    const perfil = mkdtempSync(join(tmpdir(), `f3todo-${tela.nome}-`));
    const ctx = await chromium.launchPersistentContext(perfil, {
        executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        headless: true,
        viewport: { width: tela.largura, height: tela.altura },
        deviceScaleFactor: tela.dpr,
        isMobile: tela.movel, hasTouch: tela.movel,
        ...(tela.movel ? { userAgent: devices['Pixel 5'].userAgent } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'],
    });
    const p = ctx.pages()[0] ?? await ctx.newPage();
    await ponte.instalarEm(p);
    await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await p.route('**://www.google.com/**', (r) => r.abort());
    await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
    p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 140)));

    console.log(`\n══ ${tela.nome.toUpperCase()} ${tela.largura}x${tela.altura} ══`);
    await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => typeof window.__startFloor === 'function', null, { timeout: 120000 }).catch(() => {});
    await p.evaluate(() => window.__startFloor?.(3)).catch(() => {});
    await p.waitForFunction(() => typeof window.__f3Pincel === 'function', null, { timeout: 240000 }).catch(() => {});
    // Espera o HUD aparecer: é o sinal de que a intro e a apresentação saíram.
    await p.waitForFunction(() => !!document.querySelector('.hud-fixed, [data-f3-grito]'),
        null, { timeout: 300000 }).catch(() => {});
    await p.waitForTimeout(6000);

    for (const roubados of [0, 1, 2, 3]) {
        await p.evaluate((n) => window.__f3Pincel?.(n), roubados).catch(() => {});
        await p.waitForTimeout(6000);
        // E que ele diga o que está sentindo neste ponto do arco.
        await p.evaluate((n) => window.__f3Dizer?.(n === 0 ? 'provoca' : 'roubou', { roubados: n }), roubados).catch(() => {});
        await p.waitForTimeout(2500);
        const nome = `${SAIDA}/f3-todo-${tela.nome}-p${roubados}-${S}.png`;
        await p.screenshot({ path: nome }).catch((e) => console.log('   (sem foto)', String(e.message).slice(0, 50)));
        const info = await p.evaluate(() => ({
            seta: (window.__f3SetaOpacidade ?? null),
            hud: !!document.querySelector('.hud-fixed'),
            grito: !!document.querySelector('[data-f3-grito]'),
        })).catch(() => ({}));
        console.log(`  ${roubados} pincéis  ${JSON.stringify(info)}`);
    }

    await ctx.close().catch(() => {});
    rmSync(perfil, { recursive: true, force: true });
}
ponte.fechar();
console.log('\nfolha de estados em', SAIDA);
