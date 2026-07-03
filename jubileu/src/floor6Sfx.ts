/**
 * floor6Sfx.ts — paleta sonora do Andar 6 "Labirinto Amarelo".
 *
 * Mesmo padrão do floor3Sfx/floor4Sfx: configure na entrada, clear na saída,
 * tudo sintetizado na hora (Web Audio) e roteado pro master bus → obedece
 * mute + slider de volume. O DRONE ambiente é música: vai pelo bus 'floor6'
 * do musicDirector (Floor6.tsx passa o bus na hora de ligar), então o
 * director garante que nunca briga com outra trilha.
 */

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor6Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor6Sfx(): void { ctx = null; dest = null; }
function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

// ── Passos com eco de corredor (carpete úmido + reflexo distante) ─────────────
let stepFoot = 0;
export function playF6Step(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    stepFoot ^= 1;
    const base = (stepFoot ? 120 : 104) * (0.93 + Math.random() * 0.14);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(base * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.05);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.13);
    // eco único e seco — corredor comprido
    const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.21;
    const dg = ctx.createGain(); dg.gain.value = 0.28;
    o.connect(lp).connect(g);
    g.connect(d);
    g.connect(dl).connect(dg).connect(d);
    o.start(t); o.stop(t + 0.4);
}

// ── Fusível coletado: zap elétrico + chime que sobe ──────────────────────────
export function playF6Fuse(n: number): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    // zap: serra rápida caindo, com bandpass estreito
    const z = ctx.createOscillator(); z.type = 'sawtooth';
    z.frequency.setValueAtTime(2200, t);
    z.frequency.exponentialRampToValueAtTime(160, t + 0.09);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6;
    const zg = ctx.createGain();
    zg.gain.setValueAtTime(0.16, t);
    zg.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    z.connect(bp).connect(zg).connect(d);
    z.start(t); z.stop(t + 0.14);
    // chime: sobe um tom por fusível (progresso audível)
    const freqs = [523.25, 659.25, 783.99];            // C5 E5 G5
    const f = freqs[Math.min(freqs.length - 1, Math.max(0, n - 1))];
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.7);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2).connect(g); g.connect(d);
    o.start(t + 0.05); o.stop(t + 0.75);
    o2.start(t + 0.05); o2.stop(t + 0.75);
}

// ── Sting de detecção: a Entidade te VIU ─────────────────────────────────────
export function playF6Sting(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    // segunda menor (trítono-adjacente) crescendo — clássico do horror
    const mk = (f: number, delay: number) => {
        const o = ctx!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(0.11, t + delay + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0004, t + delay + 1.1);
        o.connect(lp).connect(g).connect(d!);
        o.start(t + delay); o.stop(t + delay + 1.2);
    };
    mk(196.0, 0);       // G3
    mk(207.65, 0.05);   // G#3 — o atrito
    // batida de sub pra dar o susto físico
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(90, t);
    s.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.22, t);
    sg.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    s.connect(sg).connect(d);
    s.start(t); s.stop(t + 0.55);
}

// ── Drone ambiente (música do andar — roteado pelo musicDirector) ────────────
// Camadas: sub grave batendo devagar + zumbido fluorescente + ruído lowpass.
// setF6Hunt(true) sobe a camada dissonante enquanto a Entidade caça.
let droneStop: (() => void) | null = null;
let huntGain: GainNode | null = null;
let droneCtx: AudioContext | null = null;

export function startF6Drone(context: AudioContext, destination: AudioNode): void {
    stopF6Drone();
    droneCtx = context;
    const t = context.currentTime;
    const master = context.createGain(); master.gain.value = 0.5; master.connect(destination);

    // sub duplo levemente desafinado (batimento lento ~0.6Hz)
    const s1 = context.createOscillator(); s1.type = 'sine'; s1.frequency.value = 48;
    const s2 = context.createOscillator(); s2.type = 'sine'; s2.frequency.value = 48.6;
    const sg = context.createGain(); sg.gain.value = 0.16;
    s1.connect(sg); s2.connect(sg); sg.connect(master);

    // zumbido de fluorescente (bem baixo, banda estreita)
    const buzz = context.createOscillator(); buzz.type = 'square'; buzz.frequency.value = 120;
    const bb = context.createBiquadFilter(); bb.type = 'bandpass'; bb.frequency.value = 2300; bb.Q.value = 9;
    const bg = context.createGain(); bg.gain.value = 0.012;
    buzz.connect(bb).connect(bg).connect(master);

    // "ar" do prédio: ruído em loop com lowpass respirando via LFO
    const len = Math.floor(context.sampleRate * 2);
    const buf = context.createBuffer(1, len, context.sampleRate);
    const ch = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;             // park–miller: determinístico
        ch[i] = (seed / 2147483647) * 2 - 1;
    }
    const noise = context.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nlp = context.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 240; nlp.Q.value = 0.4;
    const ng = context.createGain(); ng.gain.value = 0.05;
    const lfo = context.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lg = context.createGain(); lg.gain.value = 90;
    lfo.connect(lg).connect(nlp.frequency);
    noise.connect(nlp).connect(ng).connect(master);

    // camada de CAÇADA (muda quando a Entidade te vê): segunda menor sustentada
    const h1 = context.createOscillator(); h1.type = 'sawtooth'; h1.frequency.value = 110;
    const h2 = context.createOscillator(); h2.type = 'sawtooth'; h2.frequency.value = 116.54;
    const hlp = context.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 900;
    huntGain = context.createGain(); huntGain.gain.value = 0;
    h1.connect(hlp); h2.connect(hlp); hlp.connect(huntGain); huntGain.connect(master);

    const nodes = [s1, s2, buzz, noise, lfo, h1, h2];
    nodes.forEach((n) => n.start(t));
    droneStop = () => {
        nodes.forEach((n) => { try { n.stop(); } catch { /* já parado */ } });
        try { master.disconnect(); } catch { /* já desconectado */ }
        huntGain = null;
        droneCtx = null;
    };
}

export function stopF6Drone(): void {
    if (droneStop) { droneStop(); droneStop = null; }
}

/** A Entidade entrou/saiu do modo caçada — a trilha reage sem trocar de faixa. */
export function setF6Hunt(hunting: boolean): void {
    if (!huntGain || !droneCtx) return;
    huntGain.gain.setTargetAtTime(hunting ? 0.13 : 0, droneCtx.currentTime, hunting ? 0.15 : 0.8);
}
