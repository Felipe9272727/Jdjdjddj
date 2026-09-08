// ── O ANDAR 3 NO TAMANHO DA QUEIXA ───────────────────────────────────────────
//
// O Felipe reclamou, com as palavras dele: "as mensagens dele estão cobrindo
// metade da minha tela… creio que esse problema seja principalmente pra mobile".
// Eu mexi no tamanho dos balões — e fotografei TUDO em 1024–1280 de largura,
// porque abaixo de 1024 o jogo entra em modo celular e a bancada perde o
// teclado. Ou seja: consertei a queixa e nunca vi o conserto no tamanho da
// queixa.
//
// Esta bancada abre o jogo em viewport de celular de verdade, faz o Diabrete
// falar, e MEDE quanto da tela cada coisa cobre — em por cento, não em
// impressão. Foto junto, para eu poder olhar em vez de deduzir.
//
//   node bancada-navegador/no-celular.mjs [sufixo]
import { chromium, devices } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUFIXO = process.argv[2] ?? 'agora';
/** `jogo` = andar jogável pelo gancho (mede o GRITO). `cutscene` = o caminho antigo. */
const MODO = process.argv[3] ?? 'jogo';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

// Dois aparelhos reais: o iPhone comum e o Android barato, que é mais estreito.
// DEITADO ENTRA NA LISTA. O Felipe reclamou de celular DEITADO desde a primeira
// vez, e eu medi retrato duas vezes seguidas e disse que estava resolvido. Em
// paisagem a tela tem ~390 px de ALTURA, que é a dimensão que falta — e é
// exatamente onde o balão continua tampando.
const APARELHOS = [
    { nome: 'iphone-deitado', largura: 844, altura: 390, dpr: 3 },
    { nome: 'android-deitado', largura: 800, altura: 360, dpr: 2.75 },
    { nome: 'iphone', largura: 390, altura: 844, dpr: 3 },
];

// As falas que interessam medir: a mais longa de cada repertório. Se a maior
// couber, as outras cabem.
const FALAS = [
    { evento: 'provoca', roubados: 0, apelido: 'curta' },
    { evento: 'provoca', roubados: 2, apelido: 'longa' },   // o repertório do estrago
    { evento: 'roubou',  roubados: 3, apelido: 'roubo' },
];

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });

for (const ap of APARELHOS) {
    const perfil = mkdtempSync(join(tmpdir(), `f3cel-${ap.nome}-`));
    const ctx = await chromium.launchPersistentContext(perfil, {
        executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        headless: true,
        viewport: { width: ap.largura, height: ap.altura },
        deviceScaleFactor: ap.dpr,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['Pixel 5'].userAgent,
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

    console.log(`\n══ ${ap.nome.toUpperCase()} ${ap.largura}x${ap.altura} @${ap.dpr}x ══`);
    await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });

    // Abaixo de 1024 o menu troca de layout e os botões duplicados trocam de
    // visível. O que funciona é pegar o primeiro VISÍVEL, nunca o primeiro do DOM.
    async function clicar(texto, timeout = 120000) {
        const todos = p.locator('button', { hasText: texto });
        const fim = Date.now() + timeout;
        for (;;) {
            const n = await todos.count();
            for (let i = 0; i < n; i += 1) {
                if (await todos.nth(i).isVisible().catch(() => false)) {
                    await todos.nth(i).click(); return true;
                }
            }
            if (Date.now() > fim) return false;
            await p.waitForTimeout(500);
        }
    }

    // ── ENTRAR DIRETO NO ANDAR JOGÁVEL ───────────────────────────────────────
    // O caminho pelo Modo Criador cai na CUTSCENE, e a ~2 fps ela não termina
    // dentro do tempo de uma execução — foi por isso que a volta 23 mediu os
    // balões da cutscene e nunca o balão de grito de dentro do jogo, que é do
    // que o Felipe reclamou. `__startFloor` pula direto pro andar.
    if (MODO === 'jogo') {
        await p.waitForFunction(() => typeof window.__startFloor === 'function', null, { timeout: 120000 }).catch(() => {});
        await p.evaluate(() => window.__startFloor?.(3)).catch(() => {});
        await p.waitForFunction(() => typeof window.__f3Dizer === 'function', null, { timeout: 180000 }).catch(() => {});
        // O andar ainda toca a intro e a apresentação por cima; espera elas
        // saírem de cena, que é quando o HUD e o grito voltam a existir.
        await p.waitForFunction(() => !!document.querySelector('.f3-hud, .hud-fixed'),
            null, { timeout: 300000 }).catch(() => {});
        await p.waitForTimeout(4000);
        for (const f of FALAS) {
            await p.evaluate(({ e, r }) => {
                window.__f3Pincel?.(r);
                window.__f3Dizer?.(e, { roubados: r });
            }, { e: f.evento, r: f.roubados }).catch(() => {});
            await p.waitForSelector('[data-f3-grito]', { timeout: 20000 }).catch(() => {});
            const m = await medirGrito();
            console.log(`  ${f.apelido.padEnd(6)} ${JSON.stringify(m)}`);
            await p.screenshot({ path: `${SAIDA}/f3-jogo-${ap.nome}-${f.apelido}-${SUFIXO}.png` })
                .catch((e) => console.log('   (sem foto:', String(e.message).slice(0, 60), ')'));
        }
        await ctx.close().catch(() => {});
        rmSync(perfil, { recursive: true, force: true });
        continue;
    }

    if (!await clicar('MODO CRIADOR')) {
        await p.screenshot({ path: `${SAIDA}/f3-cel-${ap.nome}-MENU-${SUFIXO}.png` });
        console.log('  não achei MODO CRIADOR — foto do menu salva');
        await ctx.close(); continue;
    }
    await p.waitForTimeout(1000);
    await clicar('Transição 2 → 3');
    await p.waitForTimeout(600);
    const plays = p.locator('[data-creator-start]:not([disabled])');
    let entrou = false;
    for (let i = 0; i < await plays.count(); i += 1) {
        if (await plays.nth(i).isVisible().catch(() => false)) { await plays.nth(i).click(); entrou = true; break; }
    }
    if (!entrou) {
        await p.screenshot({ path: `${SAIDA}/f3-cel-${ap.nome}-PLAY-${SUFIXO}.png` });
        console.log('  nenhum PLAY visível — foto salva');
        await ctx.close(); continue;
    }

    // O gancho aparece assim que o módulo do andar carrega.
    await p.waitForFunction(() => typeof window.__f3Dizer === 'function', null, { timeout: 240000 }).catch(() => {});
    await p.waitForTimeout(20000);   // deixa a cena assentar

    // ── O GRITO, QUE É A QUEIXA ──────────────────────────────────────────────
    async function medirGrito() {
        return p.evaluate(() => {
            const W = innerWidth, H = innerHeight;
            const el = document.querySelector('[data-f3-grito]');
            if (!el) return { tela: `${W}x${H}`, grito: null };
            const r = el.getBoundingClientRect();
            const texto = el.querySelector('div,span,p');
            // A FONTE: `Luckiest Guy` vem do Google em tempo de execução. Se ela
            // não chegar, o cartão de 1930 vira system-ui — e num celular com
            // rede ruim isso é o caso comum, não o raro.
            const fonteOk = document.fonts
                ? document.fonts.check("16px 'Luckiest Guy'") : null;
            return {
                tela: `${W}x${H}`,
                grito: {
                    larg: +(r.width / W * 100).toFixed(1),
                    alt: +(r.height / H * 100).toFixed(1),
                    area: +((r.width * r.height) / (W * H) * 100).toFixed(1),
                    px: `${Math.round(r.width)}x${Math.round(r.height)}`,
                },
                fontePx: texto ? getComputedStyle(texto).fontSize : null,
                luckiestGuyCarregou: fonteOk,
                texto: (el.textContent ?? '').trim().slice(0, 50),
            };
        }).catch((e) => ({ erro: String(e).slice(0, 100) }));
    }

    // ── A MEDIÇÃO ────────────────────────────────────────────────────────────
    // Retângulo de cada coisa, em por cento da tela. É isto que responde
    // "cobre metade da tela?" — a impressão numa foto não responde.
    async function medir() {
        return p.evaluate(() => {
            const W = innerWidth, H = innerHeight;
            const pct = (el) => {
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2) return null;
                return {
                    larg: +(r.width / W * 100).toFixed(1),
                    alt: +(r.height / H * 100).toFixed(1),
                    area: +((r.width * r.height) / (W * H) * 100).toFixed(1),
                    px: `${Math.round(r.width)}x${Math.round(r.height)}`,
                    topo: +(r.top / H * 100).toFixed(1),
                };
            };
            // O balão se identifica: `data-f3-balao`. Procurar por texto era
            // frágil e foi o que fez a primeira medição voltar toda vazia.
            const alvo = document.querySelector('[data-f3-balao]');
            const botao = document.querySelector('button[aria-label="Pular"]');
            const visivel = (el) => !!el && el.getBoundingClientRect().width > 2;
            return {
                tela: `${W}x${H}`,
                dono: alvo?.getAttribute('data-f3-balao') ?? null,
                fonte: alvo ? getComputedStyle(alvo).fontSize : null,
                texto: alvo ? (alvo.textContent ?? '').slice(0, 44) : null,
                balao: alvo ? pct(alvo) : null,
                botaoPular: visivel(botao) ? pct(botao) : 'escondido',
            };
        }).catch((e) => ({ erro: String(e).slice(0, 100) }));
    }

    // O SwiftShader desta caixa cai de vez em quando ("reading 'alpha'"), e aí
    // a foto falha e leva o processo junto. Isso é defeito da BANCADA, não do
    // jogo — mas uma bancada que morre no meio não mede nada, então cada passo
    // aqui é à prova de queda e diz o que perdeu.
    for (const f of FALAS) {
        await p.evaluate(({ e, r }) => {
            window.__f3Pincel?.(r);
            window.__f3Dizer?.(e, { roubados: r });
        }, { e: f.evento, r: f.roubados }).catch(() => {});
        // Espera o balão EXISTIR em vez de contar até um número: a cena anda a
        // ~2 fps e um `waitForTimeout` fixo mede o vazio antes dela desenhar.
        await p.waitForSelector('[data-f3-balao]', { timeout: 30000 }).catch(() => {});
        const m = await medir();
        console.log(`  ${f.apelido.padEnd(6)} ${JSON.stringify(m)}`);
        await p.screenshot({ path: `${SAIDA}/f3-cel-${ap.nome}-${f.apelido}-${SUFIXO}.png` })
            .catch((e) => console.log('   (sem foto:', String(e.message).slice(0, 60), ')'));
    }

    await ctx.close().catch(() => {});
    // ── O PERFIL VAI EMBORA ──────────────────────────────────────────────────
    // Cada execução criava ~70 MB de perfil de Chromium em /tmp e deixava lá.
    // Com as dezenas de voltas desta noite isso encheu o disco da caixa até
    // 100%, e o sintoma que apareceu foi "Unable to capture screenshot" — ou
    // seja, a bancada quebrando e eu quase culpando o jogo por isso.
    rmSync(perfil, { recursive: true, force: true });
}
ponte.fechar();
console.log('\nfotos em', SAIDA);
