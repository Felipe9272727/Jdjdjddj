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
import { mkdtempSync } from 'node:fs';
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
    w.__vozLog = [];
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const criar = Ctx.prototype.createOscillator;
    Ctx.prototype.createOscillator = function () {
        const o = criar.call(this);
        const comecar = o.start.bind(o);
        o.start = (quando) => {
            w.__vozLog.push({ t: +(quando ?? this.currentTime).toFixed(4), tipo: o.type });
            return comecar(quando);
        };
        return o;
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

ponte.fechar(); await ctx.close();
