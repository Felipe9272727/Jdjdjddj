/**
 * f8Music.ts — a TRILHA das memórias (WebAudio procedural, zero assets).
 *
 * Cada memória tem seu humor: o QUINTAL é um pad maior quente com uma
 * pentatônica dedilhada (fim de tarde); a ESCOLA é staccato travesso; a
 * TEMPESTADE é um menor esparso com chuva de ruído filtrado e trovões; o
 * HOTEL é um drone grave com batimento cardíaco e um music-box distante.
 *
 * API: f8MusicStart(key) troca (com crossfade) pra música da memória;
 * f8MusicStop() encerra com fade. Tudo num AudioContext próprio, criado
 * preguiçosamente (o player já interagiu — clicou pra entrar na imagem).
 */

interface Song {
    root: number;                       // Hz da tônica
    chords: number[][];                 // progressão em semitons sobre a tônica
    chordSecs: number;                  // duração de cada acorde
    padWave: OscillatorType;
    padGain: number;
    scale: number[];                    // escala da melodia (semitons)
    melodyRate: number;                 // notas por segundo (média)
    melodyWave: OscillatorType;
    melodyGain: number;
    melodyOctave: number;               // multiplicador da tônica pra melodia
    melodyDecay: number;
    restChance: number;                 // silêncio entre notas (respiro)
    noiseGain: number;                  // chuva/vento (0 = sem)
    noiseFreq: number;                  // centro do bandpass do ruído
    thunder: boolean;                   // swells graves ocasionais
    heartbeat: boolean;                 // o thump-thump do fundo
}

const SONGS: Record<string, Song> = {
    quintal: {
        root: 196, // G3 — dourado
        chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]],
        chordSecs: 3.6, padWave: 'sine', padGain: 0.05,
        scale: [0, 2, 4, 7, 9, 12, 14], melodyRate: 1.7, melodyWave: 'triangle',
        melodyGain: 0.055, melodyOctave: 2, melodyDecay: 0.9, restChance: 0.3,
        noiseGain: 0, noiseFreq: 0, thunder: false, heartbeat: false,
    },
    escola: {
        root: 233, // Bb3 — travesso
        chords: [[0, 4, 7], [2, 5, 9], [5, 9, 12], [7, 10, 14]],
        chordSecs: 2.2, padWave: 'triangle', padGain: 0.035,
        scale: [0, 2, 4, 5, 7, 9, 11, 12], melodyRate: 3.2, melodyWave: 'square',
        melodyGain: 0.03, melodyOctave: 2, melodyDecay: 0.16, restChance: 0.22,
        noiseGain: 0, noiseFreq: 0, thunder: false, heartbeat: false,
    },
    tempestade: {
        root: 174.6, // F3 menor — a perda
        chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
        chordSecs: 4.8, padWave: 'sine', padGain: 0.055,
        scale: [0, 3, 5, 7, 10, 12], melodyRate: 0.55, melodyWave: 'sine',
        melodyGain: 0.05, melodyOctave: 2, melodyDecay: 1.6, restChance: 0.5,
        noiseGain: 0.045, noiseFreq: 900, thunder: true, heartbeat: false,
    },
    hotel: {
        root: 110, // A2 — a verdade no escuro
        chords: [[0, 7], [-2, 5], [0, 7], [-4, 3]],
        chordSecs: 6.0, padWave: 'sawtooth', padGain: 0.028,
        scale: [0, 3, 7, 10, 12, 15], melodyRate: 0.3, melodyWave: 'sine',
        melodyGain: 0.045, melodyOctave: 4, melodyDecay: 2.4, restChance: 0.55,
        noiseGain: 0.012, noiseFreq: 300, thunder: false, heartbeat: true,
    },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { key: string; gain: GainNode; timer: number; nodes: AudioNode[] } | null = null;

function ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
        if (!ctx) {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.9;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch { return null; }
}

const st = (semi: number, root: number) => root * Math.pow(2, semi / 12);

/** Para a música atual com fade (e limpa os nós). */
export function f8MusicStop(fade = 1.2): void {
    if (!ctx || !current) return;
    const c = current; current = null;
    window.clearInterval(c.timer);
    try {
        c.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    } catch { /* ctx morto */ }
    window.setTimeout(() => { try { c.nodes.forEach((n) => { (n as OscillatorNode).stop?.(); n.disconnect(); }); c.gain.disconnect(); } catch { /* já foi */ } }, fade * 1000 + 200);
}

/** Começa (ou troca com crossfade) a música da memória `key`. */
export function f8MusicStart(key: string): void {
    const song = SONGS[key];
    const ac = ensureCtx();
    if (!ac || !master || !song) return;
    if (current?.key === key) return;
    f8MusicStop(1.0);

    const bus = ac.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, ac.currentTime, 0.6);
    bus.connect(master);
    const nodes: AudioNode[] = [];

    // ── pad de acordes (2 osciladores por voz, detune leve, lowpass) ─────────
    const padLp = ac.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900;
    const padG = ac.createGain(); padG.gain.value = song.padGain;
    padLp.connect(padG); padG.connect(bus);
    const voices: OscillatorNode[] = [];
    for (let v = 0; v < 3; v++) {
        const o = ac.createOscillator(); o.type = song.padWave;
        o.frequency.value = st(song.chords[0][v % song.chords[0].length], song.root);
        o.detune.value = (v - 1) * 6;
        o.connect(padLp); o.start();
        voices.push(o); nodes.push(o);
    }
    nodes.push(padLp, padG);

    // ── chuva/vento (ruído em bandpass) ──────────────────────────────────────
    if (song.noiseGain > 0) {
        const len = ac.sampleRate * 2;
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = song.noiseFreq; bp.Q.value = 0.6;
        const ng = ac.createGain(); ng.gain.value = song.noiseGain;
        src.connect(bp); bp.connect(ng); ng.connect(bus); src.start();
        nodes.push(src, bp, ng);
    }

    // ── scheduler: acordes, melodia, trovão, batimento ───────────────────────
    let chordI = 0;
    let nextChord = ac.currentTime + song.chordSecs;
    let nextNote = ac.currentTime + 0.4;
    let nextThunder = ac.currentTime + 6 + Math.random() * 8;
    let nextBeat = ac.currentTime + 0.5;

    const timer = window.setInterval(() => {
        if (!ac || ac.state === 'closed') return;
        const now = ac.currentTime;
        const horizon = now + 0.35;

        // troca de acorde (glide suave)
        while (nextChord < horizon) {
            chordI = (chordI + 1) % song.chords.length;
            const ch = song.chords[chordI];
            voices.forEach((o, v) => o.frequency.setTargetAtTime(st(ch[v % ch.length], song.root), nextChord, 0.4));
            nextChord += song.chordSecs;
        }
        // melodia (nota agendada com envelope próprio)
        while (nextNote < horizon) {
            if (Math.random() > song.restChance) {
                const semi = song.scale[Math.floor(Math.random() * song.scale.length)];
                const o = ac.createOscillator(); o.type = song.melodyWave;
                o.frequency.value = st(semi, song.root * song.melodyOctave);
                const g = ac.createGain();
                g.gain.setValueAtTime(0, nextNote);
                g.gain.linearRampToValueAtTime(song.melodyGain, nextNote + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0004, nextNote + song.melodyDecay);
                o.connect(g); g.connect(bus);
                o.start(nextNote); o.stop(nextNote + song.melodyDecay + 0.1);
            }
            nextNote += (0.7 + Math.random() * 0.6) / song.melodyRate;
        }
        // trovão: swell grave de vez em quando
        if (song.thunder && nextThunder < horizon) {
            const o = ac.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(46 + Math.random() * 18, nextThunder);
            const g = ac.createGain();
            g.gain.setValueAtTime(0, nextThunder);
            g.gain.linearRampToValueAtTime(0.11, nextThunder + 0.5);
            g.gain.exponentialRampToValueAtTime(0.0004, nextThunder + 3.2);
            o.connect(g); g.connect(bus);
            o.start(nextThunder); o.stop(nextThunder + 3.4);
            nextThunder += 9 + Math.random() * 12;
        }
        // batimento: thump-thump
        if (song.heartbeat) {
            while (nextBeat < horizon) {
                for (const off of [0, 0.28]) {
                    const o = ac.createOscillator(); o.type = 'sine';
                    o.frequency.setValueAtTime(52, nextBeat + off);
                    o.frequency.exponentialRampToValueAtTime(30, nextBeat + off + 0.18);
                    const g = ac.createGain();
                    g.gain.setValueAtTime(0, nextBeat + off);
                    g.gain.linearRampToValueAtTime(0.14, nextBeat + off + 0.015);
                    g.gain.exponentialRampToValueAtTime(0.0004, nextBeat + off + 0.22);
                    o.connect(g); g.connect(bus);
                    o.start(nextBeat + off); o.stop(nextBeat + off + 0.3);
                }
                nextBeat += 1.7;
            }
        }
    }, 180);

    current = { key, gain: bus, timer, nodes };
}

/** Sting curto de eventos (stomp = plim descendente; beat = sino suave). */
export function f8Sting(kind: 'stomp' | 'beat' | 'win'): void {
    const ac = ensureCtx();
    if (!ac || !master) return;
    const now = ac.currentTime;
    const mk = (f0: number, f1: number, dur: number, gain: number, type: OscillatorType) => {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(f1, now + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
        o.connect(g); g.connect(master!);
        o.start(now); o.stop(now + dur + 0.05);
    };
    if (kind === 'stomp') { mk(520, 130, 0.28, 0.09, 'square'); }
    else if (kind === 'beat') { mk(880, 880, 0.9, 0.035, 'sine'); mk(1320, 1320, 0.7, 0.02, 'sine'); }
    else { mk(523, 1046, 1.4, 0.07, 'triangle'); mk(659, 1318, 1.6, 0.05, 'triangle'); }
}
