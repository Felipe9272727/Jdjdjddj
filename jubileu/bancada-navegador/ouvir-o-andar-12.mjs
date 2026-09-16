// ── OUVIR O ANDAR 12 (sem ouvido): CONTAR O GRAFO DE ÁUDIO ───────────────────
//
// O Chromium desta caixa não tem placa de som, mas o Web Audio CONSTRÓI o grafo
// do mesmo jeito. Então dá para medir o que importa sem ouvir: quantas vozes
// existem ao mesmo tempo no combate, se o motor continua vivo depois da virada,
// e se alguma coisa fica presa no ar depois de 60 s (vazamento).
//
// Ela instrumenta `AudioContext.prototype.create*` ANTES da página montar, e
// conta start/stop de cada fonte.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const W = 915, H = 412, SEGUNDOS = Number(process.env.SEGUNDOS ?? 60);
const ponte = abrirPonte({ porta: 3457, manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
const erros = [];
p.on('pageerror', e => erros.push(String(e.message).slice(0, 200)));

await p.addInitScript(() => {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const est = { criados: {}, vivos: 0, pico: 0, starts: 0, stops: 0, estado: '?', relogio: 0 };
    const Orig = A;
    window.AudioContext = function (...a) { const c = new Orig(...a); est.ctxs = (est.ctxs ?? 0) + 1; window.__ctx = c; return c; };
    window.AudioContext.prototype = A.prototype;
    window.__audio = est;
    const marcar = (nome) => {
        const orig = A.prototype['create' + nome];
        if (!orig) return;
        A.prototype['create' + nome] = function (...a) {
            const n = orig.apply(this, a);
            est.criados[nome] = (est.criados[nome] ?? 0) + 1;
            if (n.start && n.stop) {
                const s0 = n.start.bind(n), p0 = n.stop.bind(n);
                let ligado = false, fim = Infinity;
                n.start = (t) => { if (!ligado) { ligado = true; est.starts++; est.vivos++; est.pico = Math.max(est.pico, est.vivos); } return s0(t); };
                n.stop = (t) => {
                    const r = p0(t);
                    const q = (t ?? this.currentTime);
                    if (q < fim) { fim = q; setTimeout(() => { est.stops++; est.vivos--; }, Math.max(0, (q - this.currentTime) * 1000) + 30); }
                    return r;
                };
            }
            return n;
        };
    };
    ['Oscillator', 'BufferSource', 'Gain', 'BiquadFilter', 'DynamicsCompressor', 'Buffer'].forEach(marcar);
});

await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 2500));
await p.click('button', { timeout: 30000 }).catch(() => {});
const t0 = Date.now();
const agora = () => (Date.now() - t0) / 1000;
const amostras = [];
let viradaVista = false, vivosNaVirada = null, motorNaVirada = null;

// clica para passar pelas falas
const cutucar = async () => { await p.mouse.click(W / 2, H * 0.9).catch(() => {}); };

while (agora() < SEGUNDOS) {
    const e = await p.evaluate(() => {
        const s = window.__f12estado, a = window.__audio;
        if (window.__ctx) { a.estado = window.__ctx.state; a.relogio = +window.__ctx.currentTime.toFixed(2); }
        return { fase: s?.fase, virada: !!s?.passouDaVirada, vida: s?.vida,
            proj: (s?.projeteis ?? []).length, ...a, criados: { ...a.criados } };
    }).catch(() => null);
    if (e) {
        amostras.push({ t: +agora().toFixed(1), fase: e.fase, vivos: e.vivos, pico: e.pico, vida: e.vida, estado: e.estado, relogio: e.relogio, starts: e.starts, stops: e.stops, proj: e.proj, virada: e.virada });
        if (e.virada && !viradaVista) { viradaVista = true; vivosNaVirada = e.vivos; }
        if (e.fase !== 'luta' && e.fase !== 'virada') await cutucar();
        // FORÇA A VIRADA por volta dos 25 s: a bancada não joga bem o bastante
        // para tirar metade da vida sozinha, e o que se quer medir aqui é se o
        // MOTOR sobrevive à troca de fase — não a perícia do robô.
        if (e.virada && motorNaVirada === null) motorNaVirada = e.starts - e.stops;
    }
    // PILOTAGEM MÍNIMA: fica debaixo da boca para os tiros acertarem — esta
    // bancada mede o GRAFO, não a perícia; só precisa que a luta progrida.
    if (e && (e.fase === 'luta')) {
        const fx = W * (0.5 + 0.12 * Math.sin(agora() * 0.9));
        await p.mouse.move(fx, H * 0.62).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 400));
}

// o motor continua? mede o ganho do barramento do motor não é acessível, mas dá
// para contar osciladores que NUNCA pararam — o motor é o único assim.
const fim = await p.evaluate(() => ({ ...window.__audio, criados: { ...window.__audio.criados } }));
const noCombate = amostras.filter(a => a.fase === 'luta');
const media = noCombate.length ? noCombate.reduce((s, a) => s + a.vivos, 0) / noCombate.length : 0;
console.log(JSON.stringify({
    erros,
    fases: [...new Set(amostras.map(a => a.fase))],
    segundos: +agora().toFixed(1),
    criados: fim.criados,
    starts: fim.starts, stops: fim.stops, presos: fim.starts - fim.stops,
    vozesNoCombate: { media: +media.toFixed(1), pico: fim.pico, ultimo: fim.vivos },
    viradaVista, vivosNaVirada, presosNaVirada: motorNaVirada,
    amostras: amostras.filter((_, i) => i % 5 === 0),
}, null, 1));
await b.close(); await ponte.fechar?.();
