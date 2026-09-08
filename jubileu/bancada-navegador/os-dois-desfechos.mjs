// ── OS DOIS DESFECHOS DO ANDAR 3 ─────────────────────────────────────────────
//
// O andar termina numa escolha: o Diabrete pendurado no abismo, e o jogador
// decide PUXAR PRA CIMA ou PISAR NA MÃOZINHA. Salvar faz ele te trair; pisar te
// dá a escadaria. São dois cartões diferentes, e nenhum dos dois tinha sido
// olhado nesta sessão inteira.
//
//   node bancada-navegador/os-dois-desfechos.mjs [save|stomp] [cel|mesa]
import { chromium, devices } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const QUAL = process.argv[2] ?? 'stomp';
const TELA = process.argv[3] ?? 'cel';
const TEXTO = QUAL === 'save' ? 'PUXAR PRA CIMA' : 'PISAR NA MÃOZINHA';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const movel = TELA === 'cel';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const perfil = mkdtempSync(join(tmpdir(), 'f3fim-'));
const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: movel ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(movel ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 5'].userAgent } : {}),
    args: ['--no-sandbox','--disable-setuid-sandbox','--unlimited-storage','--use-gl=angle',
           '--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'],
});
const p = ctx.pages()[0] ?? await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 140)));

await p.goto(`http://127.0.0.1:3011/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });

async function clicar(texto, timeout = 120000) {
    const todos = p.locator('button', { hasText: texto });
    const fim = Date.now() + timeout;
    for (;;) {
        const n = await todos.count();
        for (let i = 0; i < n; i += 1) {
            if (await todos.nth(i).isVisible().catch(() => false)) { await todos.nth(i).click(); return true; }
        }
        if (Date.now() > fim) return false;
        await p.waitForTimeout(600);
    }
}

if (!await clicar('MODO CRIADOR')) { console.log('sem menu'); process.exit(1); }
await p.waitForTimeout(900);
await clicar('Queda do Diabrete');
await p.waitForTimeout(500);
const plays = p.locator('[data-creator-start]:not([disabled])');
for (let i = 0; i < await plays.count(); i += 1) {
    if (await plays.nth(i).isVisible().catch(() => false)) { await plays.nth(i).click(); break; }
}
console.log('   entrou na queda');

// A escolha só aparece na última fala da súplica.
const achou = await clicar(TEXTO, 300000);
if (!achou) {
    await p.screenshot({ path: `/tmp/f3-fim-${QUAL}-${TELA}-SEMBOTAO.png` }).catch(() => {});
    console.log('   os botões da escolha não apareceram');
    ponte.fechar(); await ctx.close().catch(() => {}); rmSync(perfil, { recursive: true, force: true });
    process.exit(1);
}
console.log('   escolheu:', TEXTO);

// O cartão é RÁPIDO: nove segundos depois do clique o jogo já estava chamando o
// Andar 4. Amostra cedo e várias vezes, e guarda o primeiro quadro em que ele
// aparece de verdade.
for (const espera of [1200, 1200, 1500, 2000]) {
    await p.waitForTimeout(espera);
    const achouCartao = await p.evaluate(() =>
        /ENGANADO|FIM DO TRAÇO/.test(document.body.innerText)).catch(() => false);
    await p.screenshot({ path: `/tmp/f3-fim-${QUAL}-${TELA}-t${espera}.png` }).catch(() => {});
    if (achouCartao) { console.log('   cartão no ar'); break; }
}
const m = await p.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const txt = document.body.innerText.replace(/\s+/g, ' ').slice(0, 160);
    const alvo = [...document.querySelectorAll('div')]
        .filter(d => /ENGANADO|FIM DO TRAÇO/.test(d.textContent ?? ''))
        .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    const r = alvo?.getBoundingClientRect();
    return {
        tela: `${W}x${H}`,
        texto: txt,
        cartao: r ? { px: `${Math.round(r.width)}x${Math.round(r.height)}`,
                      larg: +(r.width / W * 100).toFixed(1), alt: +(r.height / H * 100).toFixed(1) } : null,
    };
}).catch((e) => ({ erro: String(e).slice(0, 90) }));
console.log('  ', JSON.stringify(m));
await p.screenshot({ path: `/tmp/f3-fim-${QUAL}-${TELA}.png` }).catch(() => {});

ponte.fechar(); await ctx.close().catch(() => {}); rmSync(perfil, { recursive: true, force: true });
