/**
 * floor7Sfx.ts — paleta sonora do Andar 7 "Constelação".
 *
 * Padrão floor3Sfx/floor6Sfx: configure na entrada, clear na saída, tudo
 * sintetizado (Web Audio) → obedece mute + volume. O PAD espacial é música e
 * vai pelo bus 'floor7' do musicDirector; os SFX sentam por cima no master.
 */

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor7Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor7Sfx(): void { ctx = null; dest = null; }
function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

// ── Pulo lunar: blip arejado subindo ─────────────────────────────────────────
export function playF7Jump(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.22);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 0.25);
}

// ── Aterrissagem macia (poeira de regolito) ──────────────────────────────────
export function playF7Land(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 0.2);
}

// ── Estrela coletada: arpejo pentatônico que SOBE com o progresso ────────────
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // C D E G A C D
export function playF7Star(n: number): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const base = Math.max(0, Math.min(PENTA.length - 1, n - 1));
    // três notas rápidas terminando na nota do progresso
    const notes = [PENTA[Math.max(0, base - 2)], PENTA[Math.max(0, base - 1)], PENTA[base]];
    notes.forEach((f, i) => {
        const o = ctx!.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx!.createGain();
        const t0 = t + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.5);
        o.connect(g).connect(d!);
        o.start(t0); o.stop(t0 + 0.55);
    });
    // brilho: parcial agudo curtinho
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = PENTA[base] * 3;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.045, t + 0.18);
    sg.gain.exponentialRampToValueAtTime(0.0003, t + 0.6);
    s.connect(sg).connect(d);
    s.start(t + 0.18); s.stop(t + 0.65);
}

// ── Respawn: whoosh reverso (sugado de volta pro checkpoint) ─────────────────
export function playF7Respawn(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let seed = 987654;
    for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        const env = i / len;                            // cresce → "reverso"
        ch[i] = ((seed / 2147483647) * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(bp).connect(g).connect(d);
    src.start(t);
}

// ── Vitória: acorde shimmering (a constelação acende) ────────────────────────
export function playF7Win(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx!.createGain();
        const t0 = t + i * 0.06;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.8);
        o.connect(g).connect(d!);
        o.start(t0); o.stop(t0 + 1.9);
    });
}

// ── Pad espacial (música do andar — bus 'floor7' do musicDirector) ───────────
let padStop: (() => void) | null = null;

export function startF7Pad(context: AudioContext, destination: AudioNode): void {
    stopF7Pad();
    const t = context.currentTime;
    const master = context.createGain(); master.gain.value = 0.4; master.connect(destination);

    // duas serras desafinadas + quinta, atrás de um lowpass que respira
    const lp = context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.8;
    const lfo = context.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05;
    const lg = context.createGain(); lg.gain.value = 220;
    lfo.connect(lg).connect(lp.frequency);
    lp.connect(master);

    const mk = (freq: number, gain: number, type: OscillatorType = 'sawtooth') => {
        const o = context.createOscillator(); o.type = type; o.frequency.value = freq;
        const g = context.createGain(); g.gain.value = gain;
        o.connect(g).connect(lp);
        return o;
    };
    const o1 = mk(110, 0.05);          // A2
    const o2 = mk(110.7, 0.05);        // batimento lento
    const o3 = mk(165, 0.032);         // E3 (quinta)
    // sub senoidal por fora do filtro (fundação)
    const sub = context.createOscillator(); sub.type = 'sine'; sub.frequency.value = 55;
    const subg = context.createGain(); subg.gain.value = 0.08;
    sub.connect(subg).connect(master);
    // cintilância: seno agudo bem baixinho com vibrato lento (estrelas)
    const tw = context.createOscillator(); tw.type = 'sine'; tw.frequency.value = 1318.5; // E6
    const twg = context.createGain(); twg.gain.value = 0.008;
    const twlfo = context.createOscillator(); twlfo.type = 'sine'; twlfo.frequency.value = 0.21;
    const twlg = context.createGain(); twlg.gain.value = 0.006;
    twlfo.connect(twlg).connect(twg.gain);
    tw.connect(twg).connect(master);

    const nodes = [o1, o2, o3, sub, tw, lfo, twlfo];
    nodes.forEach((n) => n.start(t));
    padStop = () => {
        nodes.forEach((n) => { try { n.stop(); } catch { /* já parado */ } });
        try { master.disconnect(); } catch { /* já desconectado */ }
    };
}

export function stopF7Pad(): void {
    if (padStop) { padStop(); padStop = null; }
}
