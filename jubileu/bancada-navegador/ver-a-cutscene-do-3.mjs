// ── VER A CUTSCENE DO ANDAR 3 ────────────────────────────────────────────────
//
// As telas de preview mostram o CENÁRIO. A cutscene não está no cenário: ela é
// encenação, câmera e tempo, e só existe dentro do jogo rodando. Este script
// abre o jogo de verdade, entra pelo MODO CRIADOR (que já tem os cartões
// "Diabrete de Ferro"/"Queda do Diabrete") e fotografa em rajada, para eu poder
// ver o RITMO — que é a única coisa que uma foto sozinha nunca mostra.
//
//   node bancada-navegador/ver-a-cutscene-do-3.mjs [cartão] [sufixo]
//     cartão: 'queda' (padrão) | 'intro'
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARTAO = process.argv[2] ?? 'queda';
const SUFIXO = process.argv[3] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
// Quantas fotos, e de quanto em quanto tempo. O SwiftShader anda a ~2 fps, então
// "quadro a quadro" é ficção; o que dá para ver é a SEQUÊNCIA de poses.
const FOTOS = Number(process.env.FOTOS ?? 14);
const INTERVALO = Number(process.env.INTERVALO ?? 2500);

// Os nomes sao os do cartao no Modo Criador, literais.
const NOME_DO_CARTAO = CARTAO === 'intro' ? 'Transição 2 → 3' : 'Queda do Diabrete';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
// Perfil PERSISTENTE: o efêmero limita a cota a 2,67 GB e o jogo estoura isso
// só de abrir. Com `--unlimited-storage` a cota vai a 27 GB.
const perfil = mkdtempSync(join(tmpdir(), 'f3cut-'));
const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    // 1280×800: `isDesktop` é `min-width: 1024px`. Abaixo disso o jogo entra em
    // modo celular, o teclado morre e o menu tem outro layout.
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'],
});
const p = ctx.pages()[0] ?? await ctx.newPage();
await ponte.instalarEm(p);
// NUNCA abortar a textura remota: o error boundary derruba o andar inteiro.
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });

await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });

// O MENU TEM DOIS DE CADA BOTAO — um do layout de celular e um do de desktop —
// e o primeiro do DOM e o escondido. `.first()` pendurava 120 s esperando um
// botao que nunca ia aparecer. Pegar o primeiro VISIVEL e o conserto.
// Clicar no TEXTO nao selecionava o cartao: o texto e um <div> la dentro e o
// clique nao chegava no <button> que guarda o `selectedId` — o botao PLAY ficava
// `disabled` para sempre. Mirar no botao ancestral resolve.
async function clicarBotao(texto, timeout = 60000) {
    return clicarTexto(texto, timeout, true);
}
async function clicarTexto(texto, timeout = 60000, botao = false) {
    const todos = botao
        ? p.locator('button', { hasText: texto })
        : p.getByText(texto, { exact: false });
    const fim = Date.now() + timeout;
    for (;;) {
        const n = await todos.count();
        for (let i = 0; i < n; i += 1) {
            const alvo = todos.nth(i);
            if (await alvo.isVisible().catch(() => false)) {
                await alvo.scrollIntoViewIfNeeded().catch(() => {});
                await alvo.click();
                console.log('   clicou:', texto, `(${i + 1}/${n})`);
                return;
            }
        }
        if (Date.now() > fim) throw new Error(`nenhum "${texto}" visivel (${n} no DOM)`);
        await p.waitForTimeout(500);
    }
}

try {
    await clicarBotao('MODO CRIADOR', 120000);
    await p.waitForTimeout(800);
    await clicarBotao(NOME_DO_CARTAO);
    await p.waitForTimeout(400);
    // Confere que o cartao PEGOU antes de tentar o PLAY — senao o erro que eu
    // vejo e "botao disabled", que nao diz onde foi que falhou.
    const ligado = await p.locator('[data-creator-start]:not([disabled])').count();
    if (!ligado) throw new Error('o cartao nao selecionou (PLAY continua disabled)');
    await p.waitForTimeout(500);
    // O PLAY tambem vem em dose dupla (celular + desktop) e o primeiro do DOM e
    // o escondido, que fica `disabled` para sempre. Pega o visivel e ligado.
    const plays = p.locator('[data-creator-start]:not([disabled])');
    let clicou = false;
    for (let i = 0; i < await plays.count(); i += 1) {
        if (await plays.nth(i).isVisible().catch(() => false)) {
            await plays.nth(i).click(); clicou = true; break;
        }
    }
    if (!clicou) throw new Error('nenhum PLAY visivel e ligado');
    console.log('   começou');
} catch (e) {
    await p.screenshot({ path: `${SAIDA}/f3-cut-MENU-${SUFIXO}.png` });
    console.log('não consegui entrar:', String(e.message).slice(0, 200));
    console.log('foto do menu em', `${SAIDA}/f3-cut-MENU-${SUFIXO}.png`);
    ponte.fechar(); await ctx.close(); process.exit(1);
}

// ── O RELÓGIO DA CUTSCENE ────────────────────────────────────────────────────
//
// Uma foto não distingue "o personagem está parado" de "o personagem se move e
// eu fotografei duas vezes a mesma pose". `Floor3FallCutscene` já publica
// `__fallT`/`__fallPh` em DEV; ler isso — e a posição do Diabrete no mundo — diz
// em NÚMERO se a cena está viva. Sem isto eu ia "consertar" uma animação que
// talvez já funcionasse, que é o erro que eu já cometi duas vezes hoje.
async function pulso() {
    return p.evaluate(() => {
        const w = window;
        const d = w.__f3DevilPos ?? null;
        return {
            t: typeof w.__fallT === 'number' ? +w.__fallT.toFixed(3) : null,
            ph: w.__fallPh ?? null,
            pos: d ? [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)] : null,
            cam: w.__fallCam ?? null,
            linha: w.__fallLinha ?? null,
            cabeca: w.__f3Cabeca ?? null,
            beirada: w.__f3Beirada ?? null,
        };
    }).catch(() => null);
}

// Rajada: a cutscene é TEMPO, então uma foto só não diz nada.
for (let i = 0; i < FOTOS; i += 1) {
    await p.waitForTimeout(INTERVALO);
    const u = await pulso();
    if (u) console.log('   t=', u.t, 'fase=', u.ph, 'fala=', u.linha, 'cam=', JSON.stringify(u.cam), 'cabeca=', JSON.stringify(u.cabeca), 'beirada=', JSON.stringify(u.beirada));
    const arq = `${SAIDA}/f3-cut-${CARTAO}-${String(i).padStart(2, '0')}-${SUFIXO}.png`;
    try { await p.screenshot({ path: arq, timeout: 30000 }); console.log('📷', arq); }
    catch (e) { console.log('falhou', i, String(e.message).slice(0, 70)); }
}
ponte.fechar();
await ctx.close();
