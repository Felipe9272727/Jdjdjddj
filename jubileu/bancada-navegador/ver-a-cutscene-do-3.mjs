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
import { mkdtempSync, rmSync } from 'node:fs';
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
const NOME_DO_CARTAO = (CARTAO === 'intro' || CARTAO === 'falas' || CARTAO === 'travado')
    ? 'Transição 2 → 3' : 'Queda do Diabrete';
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
    viewport: process.env.CEL ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(process.env.CEL ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}),
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

await p.goto(`http://127.0.0.1:${PORTA}/index.html${process.env.PARAM ? `?${process.env.PARAM}` : ""}`, { waitUntil: "domcontentloaded", timeout: 180000 });

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
    // A INTRO CUSTA OITO MINUTOS A 2 fps. `__f3PularIntro` (só em DEV) entrega a
    // cena direto para a apresentação, que é o que esta bancada existe para ver.
    // Sem isto, uma execução inteira fotografa o cartão de título e nada mais —
    // já aconteceu.
    // SÓ no cartão da intro. Chamado no cartão da QUEDA, este gancho liga a
    // apresentação POR CIMA da cena de súplica — e a foto sai com o Diabrete em
    // pé dizendo "olha o que o elevador cuspiu" no meio do clímax. Já aconteceu:
    // uma verificação inteira da queda foi invalidada por isso.
    if (process.env.PULAR !== '0' && CARTAO !== 'queda') {
        await p.waitForFunction(() => typeof window.__f3PularIntro === 'function',
            null, { timeout: 180000 }).catch(() => {});
        await p.waitForTimeout(3000);
        await p.evaluate(() => window.__f3PularIntro?.()).catch(() => {});
        console.log('   pulou a intro');
    }
} catch (e) {
    await p.screenshot({ path: `${SAIDA}/f3-cut-MENU-${SUFIXO}.png` });
    console.log('não consegui entrar:', String(e.message).slice(0, 200));
    console.log('foto do menu em', `${SAIDA}/f3-cut-MENU-${SUFIXO}.png`);
    ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true }); process.exit(1);
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

// Modo `falas`: entra pelo cartão da intro (que cai no andar jogável), espera a
// intro sair de cena e manda o Diabrete gritar cada tipo de fala, fotografando
// uma a uma. Dirigir o parkour pelo teclado num navegador a 2 fps seria o mesmo
// que não fotografar.
if (CARTAO === 'falas') {
    // Esperar POR TEMPO não serve: esta caixa roda a ~10% da velocidade, então
    // a intro de 4,6 s leva quase um minuto e a apresentação do Diabrete, uns
    // cinco. Espera-se pelo CONTADOR DE PINCÉIS, que só existe quando as duas
    // cutscenes saíram de cena — o mesmo `!f3EmCena` que esconde o balão.
    await p.getByText('PINCÉIS', { exact: false }).first()
        .waitFor({ state: 'visible', timeout: Number(process.env.ESPERA_INTRO ?? 480000) });
    console.log('   andar jogável');
    const EVENTOS = [['desenhou', {}], ['espetou', {}], ['roubou', { roubados: 1 }],
                     ['roubou', { roubados: 3 }], ['provoca', {}], ['caiu', {}]];
    for (let i = 0; i < EVENTOS.length; i += 1) {
        const [ev, ctx] = EVENTOS[i];
        const ok = await p.evaluate(([e, c]) => {
            const f = window.__f3Dizer; if (!f) return null;
            return f(e, c).texto;
        }, [ev, ctx]);
        console.log('   fala:', ev, '→', ok);
        await p.waitForTimeout(1200);
        const arq = `${SAIDA}/f3-fala-${String(i).padStart(2, '0')}-${ev}-${SUFIXO}.png`;
        try { await p.screenshot({ path: arq, timeout: 30000 }); console.log('📷', arq); }
        catch (e) { console.log('falhou', ev, String(e.message).slice(0, 70)); }
    }
    ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true }); process.exit(0);
}

// ── A TRAVA DA CUTSCENE ──────────────────────────────────────────────────────
//
// O dono do jogo achou o bug: durante o cartão de título e a apresentação do
// Diabrete dá para ANDAR, e andar demais quebra a cena (o `f3PlayerZ` avança, o
// pool de plataformas recicla, e a cutscene é encenada em coordenadas que já não
// existem). Este modo segura o W do começo ao fim da abertura e mede se o
// jogador saiu do lugar. É a única forma de provar a trava — olhando, não dá.
if (CARTAO === 'travado') {
    const onde = () => p.evaluate(() => (window.__f3Onde ? window.__f3Onde() : null)).catch(() => null);
    await p.waitForTimeout(3000);
    const antes = await onde();
    console.log('   antes de segurar W:', JSON.stringify(antes));
    await p.keyboard.down('w');
    for (let i = 0; i < 14; i += 1) {
        await p.waitForTimeout(2500);
        const u = await onde();
        console.log(`   [${i}] segurando W →`, JSON.stringify(u));
    }
    await p.keyboard.up('w');
    const depois = await onde();
    console.log('   depois:', JSON.stringify(depois));
    if (antes && depois) {
        const andou = Math.abs(depois.z - antes.z);
        console.log(andou < 0.05 ? `TRAVA OK — andou ${andou.toFixed(4)} m`
                                 : `TRAVA FALHOU — andou ${andou.toFixed(2)} m`);
    }
    await p.screenshot({ path: `${SAIDA}/f3-travado-${SUFIXO}.png` });
    ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true }); process.exit(0);
}

// ── OS DOIS DESFECHOS ────────────────────────────────────────────────────────
//
// `queda-pisar` e `queda-salvar` são o CLÍMAX do andar e não davam para
// fotografar: a súplica segura para sempre esperando o clique, então a rajada
// normal nunca passava dali. Aqui a bancada espera os botões nascerem, escolhe,
// e continua fotografando o que vem depois.
const ESCOLHA = CARTAO === 'queda-pisar' ? 'PISAR NA MÃOZINHA'
              : CARTAO === 'queda-salvar' ? 'PUXAR PRA CIMA' : null;
// O NOME DO ARQUIVO CARREGA A RAMIFICAÇÃO. Os dois desfechos gravavam como
// `f3-desfecho-NN-sufixo.png`, os dois — então rodar os dois com o mesmo sufixo
// fazia o segundo APAGAR o primeiro, e a folha de contato que eu montava dizia
// "pisar" mostrando o "salvar". Errei uma avaliação inteira por causa disso.
if (ESCOLHA) {
    const botao = p.locator('button', { hasText: ESCOLHA }).first();
    await botao.waitFor({ state: 'visible', timeout: Number(process.env.ESPERA_ESCOLHA ?? 300000) });
    // Uma foto do momento da decisão, antes de decidir.
    await p.screenshot({ path: `${SAIDA}/f3-${CARTAO}-00-escolha-${SUFIXO}.png` });
    console.log('📷 a escolha');
    await botao.click();
    console.log('   escolheu:', ESCOLHA);
    for (let i = 1; i <= FOTOS; i += 1) {
        await p.waitForTimeout(INTERVALO);
        const u = await p.evaluate(() => ({
            ph: window.__fallPh ?? null, t: window.__fallT ?? null,
            cam: window.__fallCam ?? null,
            // O TEXTO DA TELA. Um cartão que dura 2,6 s pode escapar entre duas
            // fotos; ler o DOM não escapa.
            cartao: /FIM DO TRAÇO|ENGANADO/.test(document.body.innerText || '')
                ? (document.body.innerText.match(/FIM DO TRAÇO|ENGANADO!/) || [''])[0] : '',
        })).catch(() => null);
        if (u) console.log('   fase=', u.ph, 't=', u.t, 'cartão=', JSON.stringify(u.cartao));
        const arq = `${SAIDA}/f3-${CARTAO}-${String(i).padStart(2, '0')}-${SUFIXO}.png`;
        try { await p.screenshot({ path: arq, timeout: 30000 }); console.log('📷', arq); }
        catch (e) { console.log('falhou', i, String(e.message).slice(0, 70)); }
    }
    ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true }); process.exit(0);
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
