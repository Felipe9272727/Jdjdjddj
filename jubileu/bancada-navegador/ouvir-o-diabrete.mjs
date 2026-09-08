// ── OUVIR O DIABRETE (sem ouvido) ────────────────────────────────────────────
//
// Eu não escuto o jogo. Os testes provam a partitura (`f3Voz.test.ts`) e o
// tocador (`floor3Sfx.test.ts`), mas os dois rodam com um contexto de mentira em
// Node — nenhum dos dois prova a única coisa que interessa aqui: que no JOGO
// RODANDO, na hora certa, alguma coisa de fato toca. Foi exatamente esse buraco
// que deixou o Diabrete mudo o andar inteiro sem ninguém perceber.
//
// Então esta bancada grampeia o WebAudio do navegador ANTES da página carregar e
// anota cada oscilador que nasce: quando, de que tipo e por quanto tempo. Depois
// entra no jogo de verdade pelo Modo Criador e olha o registro.
//
// O que ela prova: a voz dispara, na hora da fala, com o número de notas que a
// partitura mandou, e com o timbre certo (sawtooth = Diabrete, triangle = o
// jogador). O que ela NÃO prova, e nem tenta: se soa bem. Isso é ouvido do
// Felipe no celular dele.
//
//   node bancada-navegador/ouvir-o-diabrete.mjs [intro|queda]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CENA = process.argv[2] ?? 'intro';
const PORTA = process.env.PORTA ?? '3011';
const NOME_DO_CARTAO = CENA === 'queda' ? 'Queda do Diabrete' : 'Transição 2 → 3';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const perfil = mkdtempSync(join(tmpdir(), 'f3voz-'));
const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'],
});
const p = ctx.pages()[0] ?? await ctx.newPage();

// ── O GRAMPO ─────────────────────────────────────────────────────────────────
// Envolve `createOscillator` e `start`. Não muda o som: só anota. Tem de entrar
// por `addInitScript` porque o jogo constrói o contexto antes do primeiro
// `evaluate` chegar.
await p.addInitScript(() => {
    const w = window;
    w.__vozLog = [];      // osciladores: a voz e os efeitos sintetizados
    w.__amostras = [];    // AudioBufferSourceNode: a trilha e os efeitos de arquivo
    w.__decodes = [];     // o que o jogo conseguiu decodificar
    w.__fetches = [];     // e o que ele conseguiu BAIXAR (a trilha tem 7 MB)
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;

    // ── OSCILADORES ──────────────────────────────────────────────────────────
    const criarOsc = Ctx.prototype.createOscillator;
    Ctx.prototype.createOscillator = function () {
        const o = criarOsc.call(this);
        const comecar = o.start.bind(o);
        o.start = (quando) => {
            w.__vozLog.push({ t: +(quando ?? this.currentTime).toFixed(4), tipo: o.type });
            return comecar(quando);
        };
        return o;
    };

    // ── AMOSTRAS ─────────────────────────────────────────────────────────────
    // A trilha do Andar 3 NÃO é sintetizada: é um mp3 de ragtime que vira
    // AudioBuffer. Contar oscilador não diz nada sobre ela — foi por isso que a
    // primeira medição desta bancada deu zero e não provou coisa nenhuma.
    // O que separa a TRILHA dos efeitos é `loop` e a duração do buffer.
    w.__rotacao = [];   // as rampas de velocidade do disco em loop (a trilha)
    const criarFonte = Ctx.prototype.createBufferSource;
    Ctx.prototype.createBufferSource = function () {
        const s = criarFonte.call(this);
        const comecar = s.start.bind(s);
        s.start = (quando, ...resto) => {
            w.__amostras.push({
                t: +(quando ?? this.currentTime).toFixed(3),
                loop: !!s.loop,
                dur: s.buffer ? +s.buffer.duration.toFixed(2) : null,
            });
            // Só a trilha toca em loop. É nela que a vitrola perde corda, então
            // é a rotação DELA que interessa anotar.
            if (s.loop) {
                const rampa = s.playbackRate.linearRampToValueAtTime.bind(s.playbackRate);
                s.playbackRate.linearRampToValueAtTime = (v, t) => {
                    w.__rotacao.push({ para: +v.toFixed(4), ate: +t.toFixed(2) });
                    return rampa(v, t);
                };
            }
            return comecar(quando, ...resto);
        };
        return s;
    };

    // ── DECODIFICAÇÃO ────────────────────────────────────────────────────────
    const decodificar = Ctx.prototype.decodeAudioData;
    Ctx.prototype.decodeAudioData = function (dados, ...resto) {
        const bytes = dados?.byteLength ?? 0;
        const pr = decodificar.call(this, dados, ...resto);
        if (pr && typeof pr.then === 'function') {
            pr.then((b) => w.__decodes.push({ bytes, dur: +b.duration.toFixed(2) }),
                    (e) => w.__decodes.push({ bytes, erro: String(e).slice(0, 80) }));
        }
        return pr;
    };

    // ── DOWNLOAD ─────────────────────────────────────────────────────────────
    // Se o mp3 nem chega, não adianta procurar defeito no grafo de áudio.
    const buscar = w.fetch;
    w.fetch = async (...a) => {
        const url = String(a[0]?.url ?? a[0] ?? '');
        const r = await buscar(...a);
        if (/\.(mp3|wav|ogg)(\?|$)/i.test(url)) {
            w.__fetches.push({ url: url.split('/').pop(), ok: r.ok, status: r.status });
        }
        return r;
    };
});

await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 160)));

await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });

async function clicarBotao(texto, timeout = 60000) {
    const todos = p.locator('button', { hasText: texto });
    const fim = Date.now() + timeout;
    for (;;) {
        const n = await todos.count();
        for (let i = 0; i < n; i += 1) {
            const alvo = todos.nth(i);
            if (await alvo.isVisible().catch(() => false)) { await alvo.click(); return; }
        }
        if (Date.now() > fim) throw new Error(`nenhum "${texto}" visivel (${n} no DOM)`);
        await p.waitForTimeout(500);
    }
}

await clicarBotao('MODO CRIADOR', 120000);
await p.waitForTimeout(800);
await clicarBotao(NOME_DO_CARTAO);
await p.waitForTimeout(500);
const plays = p.locator('[data-creator-start]:not([disabled])');
for (let i = 0; i < await plays.count(); i += 1) {
    if (await plays.nth(i).isVisible().catch(() => false)) { await plays.nth(i).click(); break; }
}
console.log('   entrou na cena:', NOME_DO_CARTAO);

const ler = () => p.evaluate(() => (window.__vozLog ?? []).slice()).catch(() => []);
const trilha = () => p.evaluate(() => ({
    amostras: (window.__amostras ?? []).slice(),
    decodes: (window.__decodes ?? []).slice(),
    fetches: (window.__fetches ?? []).slice(),
    rotacao: (window.__rotacao ?? []).slice(),
})).catch(() => null);

// ── AS RAJADAS ───────────────────────────────────────────────────────────────
// Uma fala é uma RAJADA de notas coladas (~75 ms entre elas). Dois osciladores
// separados por mais de 0,35 s são falas diferentes. Agrupar assim é o que
// transforma "nasceram 34 osciladores" em "ele falou 5 vezes".
function rajadas(log) {
    const r = [];
    for (const e of [...log].sort((a, b) => a.t - b.t)) {
        const ultima = r[r.length - 1];
        if (ultima && e.t - ultima.fim <= 0.35) { ultima.fim = e.t; ultima.n += 1; ultima.tipos.add(e.tipo); }
        else r.push({ inicio: e.t, fim: e.t, n: 1, tipos: new Set([e.tipo]) });
    }
    return r;
}

// ── MODO `pinceis` ───────────────────────────────────────────────────────────
// Espera a cena virar andar jogável e então tira os pincéis da mão dele um a um,
// esperando entre um e outro, para ver a trilha responder a CADA perda.
if (CENA === 'pinceis') {
    console.log('   esperando o andar jogável…');
    await p.waitForFunction(() => typeof window.__f3Pincel === 'function', null, { timeout: 300000 });
    for (const n of [1, 2, 3]) {
        await p.waitForTimeout(12000);
        const posto = await p.evaluate((k) => window.__f3Pincel(k), n);
        console.log(`   roubou o pincel ${posto}`);
    }
    await p.waitForTimeout(8000);
    const t0 = await trilha();
    console.log('\n── A ROTAÇÃO DO DISCO A CADA PINCEL ──');
    for (const r of (t0?.rotacao ?? [])) console.log(`  -> ${r.para}  (deslizando até t=${r.ate}s)`);
    const emLoop0 = (t0?.amostras ?? []).filter((a) => a.loop);
    console.log(`\n  trilha em loop: ${emLoop0.length}   rampas de rotação: ${(t0?.rotacao ?? []).length}`);
    ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true });
    process.exit(0);
}

const AMOSTRAS = Number(process.env.AMOSTRAS ?? 18);
const INTERVALO = Number(process.env.INTERVALO ?? 2500);
let visto = 0;
for (let i = 0; i < AMOSTRAS; i += 1) {
    await p.waitForTimeout(INTERVALO);
    const log = await ler();
    if (log.length !== visto) {
        visto = log.length;
        const linha = await p.evaluate(() => window.__fallLinha ?? null).catch(() => null);
        console.log(`  ${String(i).padStart(2)}  osciladores=${log.length}  linha=${linha ?? '-'}`);
    }
}

const log = await ler();
const rs = rajadas(log);
console.log('\n── RAJADAS (cada uma é uma boca abrindo) ──');
for (const r of rs) {
    console.log(`  t=${r.inicio.toFixed(2)}s  notas=${String(r.n).padStart(2)}  dur=${(r.fim - r.inicio).toFixed(2)}s  timbre=${[...r.tipos].join('+')}`);
}
console.log(`\n  total de osciladores: ${log.length}   rajadas: ${rs.length}`);

// ── A TRILHA ─────────────────────────────────────────────────────────────────
const t = await trilha();
console.log('\n── A TRILHA (arquivo, não oscilador) ──');
console.log('  baixou:', JSON.stringify(t?.fetches ?? []));
console.log('  decodificou:', JSON.stringify(t?.decodes ?? []));
console.log('  amostras tocadas:', JSON.stringify(t?.amostras ?? []));
const emLoop = (t?.amostras ?? []).filter((a) => a.loop);
console.log(emLoop.length
    ? `  >>> A TRILHA TOCA: ${emLoop.length} fonte(s) em loop, ${emLoop[0].dur}s de buffer, primeira em t=${emLoop[0].t}s`
    : '  >>> NENHUMA fonte em loop começou — a trilha NÃO está tocando nesta cena');

// ── A VITROLA PERDENDO CORDA ─────────────────────────────────────────────────
// Só aparece se alguém roubar pincel. No modo `pinceis` a bancada faz isso pelo
// gancho de desenvolvimento, porque roubar de verdade a 2 fps é inviável.
if (t?.rotacao?.length) {
    console.log('\n── A ROTAÇÃO DO DISCO ──');
    for (const r of t.rotacao) console.log(`  -> ${r.para}  (deslizando até t=${r.ate}s)`);
}

ponte.fechar(); await ctx.close().catch(() => {});
// O perfil de Chromium (~70 MB por execução) ia ficando em /tmp. Dezenas de
// voltas depois o disco da caixa bateu 100% e a bancada passou a falhar com
// "Unable to capture screenshot" — sintoma que não tem nada a ver com o jogo.
rmSync(perfil, { recursive: true, force: true });
