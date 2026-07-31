/**
 * f8Music.ts — a TRILHA das memórias (WebAudio procedural, zero assets).
 *
 * Cada memória tem seu humor: o QUINTAL é um pad maior quente com uma
 * pentatônica dedilhada (fim de tarde); a ESCOLA é staccato travesso; a
 * TEMPESTADE é um menor esparso com chuva de ruído filtrado e trovões; o
 * HOTEL é um drone grave com batimento cardíaco e um music-box distante; e
 * YOURSELF devolve fragmentos das quatro faixas numa pulsação quebrada.
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
    yourself: {
        root: 103.8, // Ab2 — familiar, mas meio tom fora do lugar
        chords: [[0, 3, 7], [0, 6, 10], [-2, 3, 7], [1, 5, 8]],
        chordSecs: 3.15, padWave: 'sawtooth', padGain: 0.032,
        scale: [0, 1, 3, 6, 7, 10, 12], melodyRate: 0.72, melodyWave: 'triangle',
        melodyGain: 0.05, melodyOctave: 3, melodyDecay: 1.7, restChance: 0.42,
        noiseGain: 0.02, noiseFreq: 520, thunder: false, heartbeat: true,
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

// ── O SOM DA SALA DO ARQUIVO (3D): drone baixo + ar + eventos esparsos ───────
let room: { gain: GainNode; timer: number; nodes: AudioNode[] } | null = null;

/** Para o tom-de-sala com fade. */
export function f8RoomToneStop(fade = 0.9): void {
    if (!ctx || !room) return;
    const rm = room; room = null;
    window.clearInterval(rm.timer);
    try { rm.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); } catch { /* ctx morto */ }
    window.setTimeout(() => { try { rm.nodes.forEach((n) => { (n as OscillatorNode).stop?.(); n.disconnect(); }); rm.gain.disconnect(); } catch { /* já foi */ } }, fade * 1000 + 150);
}

/** O ambiente do interrogatório: um drone de porão, o "ar" dos dutos, e de
 *  tempos em tempos um BAQUE do tubo pneumático (uma ficha chegou) ou uma
 *  rajada curta de datilografia vinda de longe. */
export function f8RoomToneStart(): void {
    const ac = ensureCtx();
    if (!ac || !master || room) return;

    const bus = ac.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, ac.currentTime, 0.8);
    bus.connect(master);
    const nodes: AudioNode[] = [];

    // drone de porão: duas ondas graves desafinadas por um lowpass fechado
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const dg = ac.createGain(); dg.gain.value = 0.035;
    lp.connect(dg); dg.connect(bus);
    for (const [f, det] of [[55, 0], [55.7, -4]] as const) {
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(); nodes.push(o);
    }
    nodes.push(lp, dg);

    // o "ar" dos dutos (ruído em bandpass bem baixo)
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.4;
    const ng = ac.createGain(); ng.gain.value = 0.011;
    src.connect(bp); bp.connect(ng); ng.connect(bus); src.start();
    nodes.push(src, bp, ng);

    // eventos esparsos
    let nextThunk = ac.currentTime + 14 + Math.random() * 18;
    let nextType = ac.currentTime + 7 + Math.random() * 9;
    const timer = window.setInterval(() => {
        if (!ac || ac.state === 'closed') return;
        const now = ac.currentTime;
        // o BAQUE pneumático: whoosh curto + toc surdo
        if (now >= nextThunk) {
            nextThunk = now + 22 + Math.random() * 26;
            const wg = ac.createGain();
            wg.gain.setValueAtTime(0, now);
            wg.gain.linearRampToValueAtTime(0.05, now + 0.22);
            wg.gain.exponentialRampToValueAtTime(0.0004, now + 0.55);
            const wbp = ac.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.setValueAtTime(300, now); wbp.frequency.exponentialRampToValueAtTime(900, now + 0.4);
            const ws = ac.createBufferSource(); ws.buffer = buf; ws.loop = true;
            ws.connect(wbp); wbp.connect(wg); wg.connect(bus);
            ws.start(now); ws.stop(now + 0.6);
            const o = ac.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(120, now + 0.42); o.frequency.exponentialRampToValueAtTime(48, now + 0.58);
            const og = ac.createGain();
            og.gain.setValueAtTime(0, now + 0.42);
            og.gain.linearRampToValueAtTime(0.11, now + 0.445);
            og.gain.exponentialRampToValueAtTime(0.0004, now + 0.72);
            o.connect(og); og.connect(bus);
            o.start(now + 0.42); o.stop(now + 0.8);
        }
        // rajada de datilografia ao longe (3-7 estalos secos)
        if (now >= nextType) {
            nextType = now + 9 + Math.random() * 14;
            const n = 3 + Math.floor(Math.random() * 5);
            let t = now + 0.05;
            for (let i = 0; i < n; i++) {
                const o = ac.createOscillator(); o.type = 'square';
                o.frequency.setValueAtTime(1400 + Math.random() * 900, t);
                const g = ac.createGain();
                g.gain.setValueAtTime(0.016 + Math.random() * 0.008, t);
                g.gain.exponentialRampToValueAtTime(0.0004, t + 0.03);
                const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
                o.connect(hp); hp.connect(g); g.connect(bus);
                o.start(t); o.stop(t + 0.04);
                t += 0.09 + Math.random() * 0.16;
            }
        }
    }, 400);

    room = { gain: bus, timer, nodes };
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

type BossCombatSound = 'slam' | 'impact' | 'sweep' | 'throw' | 'cocoon';

function noiseBurst(ac: AudioContext, destination: AudioNode, at: number, duration: number, gain: number, frequency: number, type: BiquadFilterType): void {
    const length = Math.max(1, Math.ceil(ac.sampleRate * duration));
    const buffer = ac.createBuffer(1, length, ac.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource(); source.buffer = buffer;
    const filter = ac.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.72;
    const envelope = ac.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(destination);
    source.start(at); source.stop(at + duration + 0.02);
}

function pitchedHit(ac: AudioContext, destination: AudioNode, at: number, from: number, to: number, duration: number, gain: number, wave: OscillatorType): void {
    const oscillator = ac.createOscillator(); oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    const envelope = ac.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(destination);
    oscillator.start(at); oscillator.stop(at + duration + 0.03);
}

/**
 * Sequência sonora da manifestação. Os tempos espelham os quadros da câmera:
 * fios tensionam, a máscara encaixa, há uma inspiração e só então vem o rugido.
 * A cauda termina antes de os controles serem devolvidos ao jogador.
 */
export function f8BossIntroSfx(): void {
    const ac = ensureCtx();
    if (!ac || !master) return;
    const start = ac.currentTime + 0.025;

    // Rumor contínuo de algo pesado se formando sob o tear.
    pitchedHit(ac, master, start, 48, 27, 3.55, 0.09, 'sine');
    pitchedHit(ac, master, start + 0.22, 73, 34, 2.7, 0.038, 'triangle');
    for (const [delay, pitch] of [[0.68, 1180], [1.03, 930], [1.42, 760], [1.93, 610]] as const) {
        noiseBurst(ac, master, start + delay, 0.085, 0.042, pitch, 'highpass');
        pitchedHit(ac, master, start + delay, pitch * 0.52, pitch * 0.32, 0.09, 0.025, 'square');
    }

    // Inspiração: ruído filtrado que cresce até o quadro de antecipação.
    const inhaleAt = start + 2.18, inhaleDur = 0.62;
    const inhaleLength = Math.ceil(ac.sampleRate * inhaleDur);
    const inhaleBuffer = ac.createBuffer(1, inhaleLength, ac.sampleRate), inhaleData = inhaleBuffer.getChannelData(0);
    for (let i = 0; i < inhaleLength; i++) inhaleData[i] = Math.random() * 2 - 1;
    const inhale = ac.createBufferSource(); inhale.buffer = inhaleBuffer;
    const inhaleFilter = ac.createBiquadFilter(); inhaleFilter.type = 'bandpass'; inhaleFilter.Q.value = 0.9;
    inhaleFilter.frequency.setValueAtTime(180, inhaleAt); inhaleFilter.frequency.exponentialRampToValueAtTime(920, inhaleAt + inhaleDur);
    const inhaleGain = ac.createGain(); inhaleGain.gain.setValueAtTime(0.0001, inhaleAt); inhaleGain.gain.exponentialRampToValueAtTime(0.052, inhaleAt + inhaleDur * 0.86); inhaleGain.gain.exponentialRampToValueAtTime(0.0001, inhaleAt + inhaleDur);
    inhale.connect(inhaleFilter); inhaleFilter.connect(inhaleGain); inhaleGain.connect(master);
    inhale.start(inhaleAt); inhale.stop(inhaleAt + inhaleDur + 0.02);

    // Encaixe seco da máscara imediatamente antes da boca se abrir.
    noiseBurst(ac, master, start + 2.64, 0.13, 0.085, 1450, 'highpass');
    pitchedHit(ac, master, start + 2.64, 260, 72, 0.22, 0.075, 'square');

    // Rugido: duas gargantas distorcidas, ar grave e uma reflexão curta.
    const roarAt = start + 2.82, roarDur = 0.92;
    const roarBus = ac.createGain(); roarBus.gain.setValueAtTime(0.0001, roarAt);
    roarBus.gain.exponentialRampToValueAtTime(0.12, roarAt + 0.065);
    roarBus.gain.setValueAtTime(0.12, roarAt + 0.48);
    roarBus.gain.exponentialRampToValueAtTime(0.0001, roarAt + roarDur);
    const lowpass = ac.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = 1.4;
    lowpass.frequency.setValueAtTime(1250, roarAt); lowpass.frequency.exponentialRampToValueAtTime(240, roarAt + roarDur);
    const shaper = ac.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = Math.tanh(x * 2.8); }
    shaper.curve = curve; shaper.oversample = '2x';
    for (const [frequency, detune] of [[168, -11], [116, 8], [83, -4]] as const) {
        const voice = ac.createOscillator(); voice.type = frequency > 100 ? 'sawtooth' : 'triangle'; voice.detune.value = detune;
        voice.frequency.setValueAtTime(frequency, roarAt); voice.frequency.exponentialRampToValueAtTime(frequency * 0.34, roarAt + roarDur);
        voice.connect(shaper); voice.start(roarAt); voice.stop(roarAt + roarDur + 0.03);
    }
    noiseBurst(ac, shaper, roarAt, roarDur * 0.88, 0.16, 260, 'bandpass');
    shaper.connect(lowpass); lowpass.connect(roarBus); roarBus.connect(master);
    const echo = ac.createDelay(0.4), echoGain = ac.createGain(); echo.delayTime.value = 0.16; echoGain.gain.value = 0.19;
    roarBus.connect(echo); echo.connect(echoGain); echoGain.connect(master);
    pitchedHit(ac, master, start + 3.72, 76, 29, 0.36, 0.1, 'sine');
}

/** Pequenos sinais sincronizados aos extremos dos ataques do YOURSELF. */
export function f8BossCombatSfx(kind: BossCombatSound): void {
    const ac = ensureCtx();
    if (!ac || !master) return;
    const at = ac.currentTime + 0.01;
    if (kind === 'slam') {
        pitchedHit(ac, master, at, 54, 92, 0.42, 0.045, 'sine');
    } else if (kind === 'impact') {
        pitchedHit(ac, master, at, 82, 28, 0.31, 0.115, 'sine');
        noiseBurst(ac, master, at, 0.16, 0.08, 180, 'lowpass');
    } else if (kind === 'sweep') {
        noiseBurst(ac, master, at, 0.24, 0.065, 1250, 'bandpass');
        pitchedHit(ac, master, at, 430, 120, 0.21, 0.042, 'sawtooth');
    } else if (kind === 'throw') {
        pitchedHit(ac, master, at, 360, 92, 0.23, 0.047, 'triangle');
        noiseBurst(ac, master, at + 0.025, 0.13, 0.03, 850, 'highpass');
    } else {
        noiseBurst(ac, master, at, 0.48, 0.05, 340, 'bandpass');
        pitchedHit(ac, master, at, 118, 61, 0.52, 0.045, 'triangle');
    }
}
