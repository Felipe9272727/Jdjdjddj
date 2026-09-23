/**
 * floor12Sfx.ts — o som do ANDAR 12.
 *
 * Tudo SINTETIZADO, sem sample nenhum. Não é preciosismo: um andar de nave
 * dispara tiro a cada 0,14 s, e um `fetch`+`decodeAudioData` por tiro é o
 * caminho mais curto para engasgar o celular do dono do jogo, que é a regra
 * número um deste repositório. Osciladores curtos custam quase nada e ainda
 * caem no timbre certo — o irmão do TROCO-64 é da mesma família de bipes.
 *
 * O contexto vem de fora (`configureFloor12Sfx`), igual ao andar 5, para o som
 * do andar entrar no barramento mestre do jogo e respeitar o volume geral.
 */

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor12Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor12Sfx(): void { pararMotor(); pararMusica(0.2); ctx = null; dest = null; }

function saida(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

/**
 * Um bipe. `tipo`, frequência inicial, frequência final, duração e volume.
 *
 * O envelope tem ATAQUE, e não começa em 1: sem os 8 ms de subida cada nota
 * estala no alto-falante, e com trinta tiros por segundo o estalo vira chiado.
 */
function bipe(
    tipo: OscillatorType, f0: number, f1: number, dur: number, vol: number, atraso = 0,
): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(d);
    osc.start(t); osc.stop(t + dur + 0.02);
}

/** Ruído curto, para impacto e explosão. */
function ruido(dur: number, vol: number, corte = 1400, atraso = 0): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = corte;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filtro); filtro.connect(g); g.connect(d);
    src.start(t); src.stop(t + dur + 0.02);
}

// ── O MOTOR ──────────────────────────────────────────────────────────────────
// Um zumbido contínuo enquanto o avião voa. É o único som persistente do andar,
// e ele existe porque sem motor um avião parado no céu não tem peso nenhum.
let motor: { osc: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;

export function tocarMotor(): void {
    const c = ctx, d = saida();
    if (!c || !d || motor) return;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 74;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.2);
    // um LFO leve na altura: hélice, não gerador
    const lfo = c.createOscillator(); lfo.frequency.value = 6.5;
    const lfoG = c.createGain(); lfoG.gain.value = 5;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.connect(filtro); filtro.connect(g); g.connect(d);
    osc.start(); lfo.start();
    motor = { osc, g, lfo };
}

export function pararMotor(): void {
    if (!motor || !ctx) { motor = null; return; }
    const { osc, g, lfo } = motor;
    motor = null;
    try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.4); lfo.stop(ctx.currentTime + 0.4);
    } catch { /* já parado */ }
}

// ── OS EVENTOS ───────────────────────────────────────────────────────────────
export function tocarTiro(): void { bipe('square', 900, 320, 0.075, 0.055); }
export function tocarTiroIrmao(): void { bipe('square', 620, 240, 0.085, 0.04); }
export function tocarAcerto(): void { bipe('square', 1500, 900, 0.05, 0.05); }

/** A boca abrindo: o telegrafo sonoro do ataque. */
export function tocarBocaAbrindo(): void {
    bipe('sawtooth', 90, 260, 0.5, 0.09);
}
/** A boca cuspindo. Cada ataque tem o seu, para dar para reconhecer de ouvido. */
export function tocarAtaque(nome: string): void {
    switch (nome) {
        case 'leque':      for (let i = 0; i < 5; i++) bipe('square', 520, 300, 0.09, 0.05, i * 0.035); break;
        case 'teleguiado': bipe('sine', 1200, 300, 0.55, 0.07); break;
        case 'naves':      for (let i = 0; i < 4; i++) bipe('triangle', 700 + i * 90, 400, 0.13, 0.045, i * 0.07); break;
        case 'mare':       ruido(0.75, 0.10, 700); bipe('sine', 150, 60, 0.7, 0.06); break;
        case 'elevadores': for (let i = 0; i < 4; i++) bipe('square', 200, 130, 0.16, 0.05, i * 0.09); break;
        default:           bipe('square', 400, 200, 0.2, 0.05);
    }
}

export function tocarDano(): void { ruido(0.32, 0.22, 900); bipe('sawtooth', 240, 70, 0.34, 0.10); }
export function tocarExplosao(): void { ruido(0.6, 0.28, 1200); bipe('sawtooth', 180, 40, 0.6, 0.12); }
export function tocarFalaDoIrmao(): void { bipe('square', 300, 380, 0.05, 0.035); }

/** O elevador virando avião: metal se desdobrando. */
export function tocarDesdobrar(): void {
    for (let i = 0; i < 6; i++) bipe('square', 160 + i * 55, 90 + i * 30, 0.12, 0.05, i * 0.12);
    ruido(0.5, 0.14, 2200, 0.5);
}
export function tocarDing(): void { bipe('sine', 1320, 1320, 0.16, 0.09); bipe('sine', 990, 990, 0.36, 0.07, 0.1); }

export function tocarVitoria(): void {
    [523, 659, 784, 1047].forEach((f, i) => bipe('square', f, f, 0.22, 0.07, i * 0.13));
}
export function tocarDerrota(): void {
    [392, 330, 262, 196].forEach((f, i) => bipe('sawtooth', f, f * 0.94, 0.3, 0.07, i * 0.17));
}

// ── A MÚSICA DA LUTA ─────────────────────────────────────────────────────────
// Sintetizada também, pelo mesmo motivo dos tiros: nada de baixar arquivo no
// celular. Uma marcha em ré menor a 132 bpm — bumbo, caixa, baixo pulsando em
// colcheias e um arpejo por cima. Passada a virada ela ENDURECE: entra o chimbal
// em semicolcheias e o arpejo sobe uma oitava. O relógio é o do AudioContext,
// agendado com folga (o padrão "lookahead"), então um quadro lento no celular
// não atrasa nota nenhuma.
const BPM = 132, SEMI = 60 / BPM / 4;
// Progressão Dm – Bb – C – A, uma por compasso; graus em Hz da fundamental.
const FUNDAMENTAIS = [73.42, 58.27, 65.41, 55.0];
const ARPEJO = [0, 3, 7, 12, 7, 3, 0, 7];        // semitons: menor com oitava
let musica: { id: number; passo: number; proxima: number; bus: GainNode; forte: boolean } | null = null;

function nota(tipo: OscillatorType, f: number, t: number, dur: number, vol: number, corte: number, d: AudioNode): void {
    const c = ctx!;
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    fl.type = 'lowpass'; fl.frequency.value = corte;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(d);
    o.start(t); o.stop(t + dur + 0.03);
}
function bumbo(t: number, d: AudioNode): void {
    const c = ctx!, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.25);
}
function chiado(t: number, dur: number, vol: number, corte: number, tipo: BiquadFilterType, d: AudioNode): void {
    const c = ctx!, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate);
    const x = buf.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = tipo; f.frequency.value = corte; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(d); s.start(t); s.stop(t + dur + 0.02);
}
function agendar(): void {
    const m = musica, c = ctx;
    if (!m || !c) return;
    while (m.proxima < c.currentTime + 0.15) {
        const t = m.proxima, p = m.passo % 64, compasso = Math.floor(p / 16), s = p % 16;
        const raiz = FUNDAMENTAIS[compasso];
        if (s % 4 === 0) bumbo(t, m.bus);
        if (s === 4 || s === 12) chiado(t, 0.14, 0.22, 1800, 'bandpass', m.bus);
        if (s % 2 === 0) nota('sawtooth', raiz * (s % 4 === 2 ? 2 : 1), t, SEMI * 1.8, 0.16, 420, m.bus);
        if (s % 2 === 1 || m.forte) {
            const semi = ARPEJO[(s >> (m.forte ? 0 : 1)) % ARPEJO.length];
            nota('square', raiz * 4 * (m.forte ? 2 : 1) * Math.pow(2, semi / 12), t, SEMI * 0.9, m.forte ? 0.035 : 0.045, 2600, m.bus);
        }
        if (m.forte) chiado(t, 0.035, s % 4 === 2 ? 0.1 : 0.05, 7000, 'highpass', m.bus);
        m.passo++; m.proxima += SEMI;
    }
}
export function iniciarMusica(): void {
    const c = ctx, d = saida();
    if (!c || !d || musica) return;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.55, c.currentTime + 1.2);
    bus.connect(d);
    musica = { id: 0, passo: 0, proxima: c.currentTime + 0.1, bus, forte: false };
    musica.id = window.setInterval(agendar, 40);
    agendar();
}
export function musicaDaVirada(forte: boolean): void { if (musica) musica.forte = forte; }
export function pararMusica(fade = 0.8): void {
    const m = musica, c = ctx;
    musica = null;
    if (!m) return;
    window.clearInterval(m.id);
    if (!c) return;
    m.bus.gain.cancelScheduledValues(c.currentTime);
    m.bus.gain.setValueAtTime(m.bus.gain.value, c.currentTime);
    m.bus.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fade);
    window.setTimeout(() => m.bus.disconnect(), fade * 1000 + 100);
}
/** O rugido da virada: ruído grave subindo e um serrote descendo, juntos. */
export function tocarRugido(): void {
    ruido(1.4, 0.35, 500); ruido(0.9, 0.2, 2400, 0.2);
    bipe('sawtooth', 110, 38, 1.3, 0.16); bipe('sawtooth', 164, 55, 1.1, 0.1, 0.12);
}
