/**
 * floor9Sfx.ts — o SOM do Viveiro (WebAudio procedural, zero assets).
 *
 * O andar era MUDO; agora ele respira à la Rain World:
 *  - CAMA DE FLORESTA: ruído em bandpass ~400 Hz + chirps FM esparsos + sopro
 *    de vento. No AVISO a cama faz duck até ~0 em ~3 s — a fauna cala antes
 *    da chuva (a assinatura emocional do RW: o silêncio que avisa).
 *  - CHUVA por fase (ruído branco → bandpass, vocabulário do "tempestade" do
 *    f8Music): 0 calmo · 0.06 aviso (com pingos-grãos esparsos) · 0.22 onda.
 *  - TROVÃO: scheduler do f8Music (sine 46–64 Hz, swell 0.5 s, decay 3.2 s),
 *    disparado pelo relâmpago do Floor9Storm com atraso de 0.5–2 s.
 *  - STINGERS via f9EcoOn (fan-out — não interfere no drain da cena):
 *    bote, agarrou (squeal FM), escapou (flutter), vinculo (sino), ondaComeca
 *    (sub-drone), renasceu (pulso de memória, ref f6).
 *  - QUEDA: vento crescente dirigido por frame (f9.phase==='queda') + THUD de
 *    pouso (74→46 Hz, ref playF6Thud) + shake sonoro do freio.
 *  - CHAMADOS DE CRIATURA (ambiente): saltito (chirp 2 kHz), cervo (grave,
 *    oco), vulto (raspado) — esparsos, com jitter, MAIS FREQUENTES no calmo,
 *    ZERO no aviso (a floresta prende a respiração).
 *
 * Padrão do projeto (floor6Sfx/f8Music): configureFloor9Sfx(ctx, bus) ao
 * entrar no andar, clearFloor9Sfx() ao sair; a cena chama
 * floor9SfxSetPhase(phase, frac) por frame. Sem ctx configurado tudo é no-op.
 */
import { f9EcoOn, type F9CyclePhase, type F9EcoEvent } from './f9Eco';
import type { F9Event } from './f9Floresta';

// ── estado do módulo ─────────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// nós vivos (pra derrubar tudo no clear)
let liveNodes: AudioNode[] = [];
let liveSrcs: Array<AudioBufferSourceNode | OscillatorNode> = [];

// gains dirigidos (por frame/fase)
let bedDuck: GainNode | null = null;    // duck da cama no aviso (0..1)
let rainGain: GainNode | null = null;   // corpo da chuva
let rainHighGain: GainNode | null = null; // "patter" agudo da chuva cheia
let ondaGain: GainNode | null = null;   // sub-drone contínuo da onda
let quedaGain: GainNode | null = null;  // vento da queda
let quedaFilt: BiquadFilterNode | null = null; // brilho do vento (sobe com k)

let schedTimer: number | null = null;
let unsubEco: (() => void) | null = null;

// fase corrente (alimentada por frame via floor9SfxSetPhase)
let curPhase: F9CyclePhase = 'calmo';
let curFrac = 0;
// alvos suavizados (o setPhase escreve; o scheduler lê pros gates)
let bedOpen = 1; // 1 = cama audível; 0 = calada (aviso/onda)

// agenda (tempo do AudioContext)
let nextChirp = 0;
let nextCall = 0;
let nextPingo = 0;

// ── ruído compartilhado ──────────────────────────────────────────────────────
let noiseBuf: AudioBuffer | null = null;
function getNoise(): AudioBuffer | null {
    if (!ctx) return null;
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
}

function noiseSrc(loop = true): AudioBufferSourceNode | null {
    if (!ctx) return null;
    const buf = getNoise(); if (!buf) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    liveSrcs.push(s);
    return s;
}

/** one-shot de ruído filtrado (t = agora). Não rastreia: para sozinho. */
function noiseBurst(gain: number, dur: number, type: BiquadFilterType, freq: number, q = 1, at?: number): void {
    if (!ctx || !master) return;
    const buf = getNoise(); if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = dur > 1.4;
    const t = at ?? ctx.currentTime;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.025, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
}

/** one-shot tonal com glide (t = agora). */
function tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', at?: number): void {
    if (!ctx || !master) return;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.03, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
}

// ── a construção do grafo (camas contínuas) ──────────────────────────────────
function buildGraph(): void {
    if (!ctx) return;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // ── CAMA DE FLORESTA: corpo ~400 Hz + sopro de vento com LFO ──
    bedDuck = ctx.createGain(); bedDuck.gain.value = 1; bedDuck.connect(master);
    {
        const body = noiseSrc(); if (!body) return;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0.015;
        body.connect(bp); bp.connect(g); g.connect(bedDuck); body.start();
        liveNodes.push(bp, g);
        // sopro: bandpass mais grave com LFO no gain (vai-e-vem de copa)
        const wind = noiseSrc(); if (!wind) return;
        const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 240; wbp.Q.value = 0.4;
        const wg = ctx.createGain(); wg.gain.value = 0.006;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.004;
        lfo.connect(lfoG); lfoG.connect(wg.gain); lfo.start();
        wind.connect(wbp); wbp.connect(wg); wg.connect(bedDuck); wind.start();
        liveNodes.push(wbp, wg, lfoG);
        liveSrcs.push(lfo);
    }

    // ── CHUVA: ruído branco → bandpass 900 (o "tempestade" do f8) + patter ──
    rainGain = ctx.createGain(); rainGain.gain.value = 0; rainGain.connect(master);
    {
        const rain = noiseSrc(); if (!rain) return;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
        rain.connect(bp); bp.connect(rainGain); rain.start();
        liveNodes.push(bp);
    }
    rainHighGain = ctx.createGain(); rainHighGain.gain.value = 0; rainHighGain.connect(master);
    {
        const pat = noiseSrc(); if (!pat) return;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3600;
        pat.connect(hp); hp.connect(rainHighGain); pat.start();
        liveNodes.push(hp);
    }

    // ── SUB-DRONE da onda (contínuo, entra junto com a parede) ──
    ondaGain = ctx.createGain(); ondaGain.gain.value = 0; ondaGain.connect(master);
    for (const f of [42, 44.6]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        o.connect(ondaGain); o.start();
        liveSrcs.push(o);
    }

    // ── VENTO DA QUEDA (a cutscene dirige por frame) ──
    quedaFilt = ctx.createBiquadFilter(); quedaFilt.type = 'bandpass'; quedaFilt.frequency.value = 300; quedaFilt.Q.value = 0.7;
    quedaGain = ctx.createGain(); quedaGain.gain.value = 0;
    {
        const w = noiseSrc(); if (!w) return;
        w.connect(quedaFilt); quedaFilt.connect(quedaGain); quedaGain.connect(master); w.start();
    }

    // agenda inicial
    const now = ctx.currentTime;
    nextChirp = now + 1.5 + Math.random() * 3;
    nextCall = now + 2.5 + Math.random() * 4;
    nextPingo = now + 0.4;
    schedTimer = window.setInterval(schedule, 190);
}

// ── scheduler: chirps da cama, chamados de criatura, pingos do aviso ────────
function schedule(): void {
    if (!ctx || ctx.state === 'closed') return;
    const now = ctx.currentTime;
    const horizon = now + 0.3;
    const calmo = curPhase === 'calmo';
    const aviso = curPhase === 'aviso';

    // chirps FM esparsos da cama (2–7 s) — só com a cama aberta
    while (nextChirp < horizon) {
        if (bedOpen > 0.5 && calmo) {
            // passarinho do viveiro: 2–3 blips descendentes, FMzinho no ataque
            const base = 1900 + Math.random() * 900;
            const n = 2 + Math.floor(Math.random() * 2);
            let t = Math.max(nextChirp, now);
            for (let i = 0; i < n; i++) {
                tone(base * (1 - i * 0.12), base * (0.78 - i * 0.1), 0.07, 0.012 + Math.random() * 0.006, 'sine', t);
                t += 0.09 + Math.random() * 0.05;
            }
        }
        nextChirp = Math.max(nextChirp, now) + 2 + Math.random() * 5;
    }

    // CHAMADOS DE CRIATURA — esparsos, com jitter; calmo » renascer; NUNCA no aviso
    while (nextCall < horizon) {
        if (calmo || curPhase === 'renascer') {
            const roll = Math.random();
            const t = Math.max(nextCall, now);
            if (roll < 0.5) {
                // saltito: chirp agudo ~2 kHz, duplo
                tone(2050 + Math.random() * 300, 1700, 0.06, 0.014, 'sine', t);
                tone(2300 + Math.random() * 300, 1900, 0.05, 0.01, 'sine', t + 0.11);
            } else if (roll < 0.8) {
                // cervo-lanterna: baixo e oco (sine grave + sopros)
                tone(170 + Math.random() * 30, 110, 0.75, 0.02, 'sine', t);
                noiseBurst(0.008, 0.6, 'bandpass', 300, 0.8, t + 0.05);
            } else {
                // vulto: raspado grave (saw filtrado + rosnado de ruído)
                tone(95 + Math.random() * 20, 58, 0.5, 0.016, 'sawtooth', t);
                noiseBurst(0.012, 0.45, 'lowpass', 240, 0.9, t);
            }
        }
        // calmo: 4–9 s; renascer: bem mais raro
        nextCall = Math.max(nextCall, now) + (calmo ? 4 + Math.random() * 5 : 9 + Math.random() * 7);
    }

    // PINGOS do aviso: grãos curtos e secos (o prenúncio da chuva)
    while (nextPingo < horizon) {
        if (aviso) {
            const t = Math.max(nextPingo, now);
            noiseBurst(0.01 + Math.random() * 0.008, 0.04, 'bandpass', 2400 + Math.random() * 1800, 1.4, t);
            nextPingo = t + 0.12 + Math.random() * 0.5;
        } else {
            nextPingo = now + 0.4;
        }
    }
}

// ── stingers (eventos do motor, fan-out f9EcoOn) ─────────────────────────────
function onEcoEvent(e: F9EcoEvent): void {
    if (!ctx || !master) return;
    switch (e) {
        case 'bote':
            // o disparo do vulto: whoosh grave + descida 120→48 Hz
            noiseBurst(0.09, 0.22, 'lowpass', 900);
            tone(120, 48, 0.3, 0.1, 'sine');
            break;
        case 'agarrou': {
            // squeal FM curto da presa
            const t = ctx.currentTime;
            const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = 1250;
            const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = 210;
            const modG = ctx.createGain(); modG.gain.value = 520;
            mod.connect(modG); modG.connect(car.frequency);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0004, t + 0.26);
            car.connect(g); g.connect(master);
            car.start(t); car.stop(t + 0.3); mod.start(t); mod.stop(t + 0.3);
            break;
        }
        case 'escapou': {
            // flutter ascendente (livramento)
            const t = ctx.currentTime;
            [620, 880, 1240].forEach((f, i) => tone(f, f * 1.18, 0.09, 0.028, 'triangle', t + i * 0.07));
            break;
        }
        case 'vinculo': {
            // sino suave (o bicho confiou em você)
            const t = ctx.currentTime;
            tone(880, 880, 0.9, 0.03, 'sine', t);
            tone(1320, 1320, 0.7, 0.016, 'sine', t + 0.05);
            break;
        }
        case 'ondaComeca':
            // sub-drone do fim do mundo (swell 0.8 s, cauda 4 s) + rugido baixo
            tone(44, 38, 4.2, 0.1, 'sine');
            noiseBurst(0.05, 2.6, 'lowpass', 160, 0.7);
            break;
        case 'renasceu':
            playF9MemoryPulse();
            break;
        default:
            break; // alarme/abate/cacaPlayer/ondaTermina: sem stinger próprio
    }
}

/** Pulso de memória (ref playF6MemoryPulse): sub 48 Hz + shimmer — o replantio. */
function playF9MemoryPulse(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.2);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.3);
    noiseBurst(0.014, 1.1, 'highpass', 6000, 0.7, t);
}

// ── API pública ──────────────────────────────────────────────────────────────

/** Configura o AudioContext do andar (padrão floor6Sfx). Reconfigura se trocar. */
export function configureFloor9Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    clearFloor9Sfx();
    if (!context) return;
    ctx = context;
    buildGraph();
    if (destination && master) { try { master.disconnect(); } catch { /* noop */ } master.connect(destination); }
    unsubEco = f9EcoOn(onEcoEvent);
}

/** Desmonta tudo com fade curto (pare os loops ANTES de soltar o ctx — ref f6). */
export function clearFloor9Sfx(): void {
    if (unsubEco) { unsubEco(); unsubEco = null; }
    if (schedTimer !== null) { window.clearInterval(schedTimer); schedTimer = null; }
    const c = ctx, m = master;
    const nodes = liveNodes, srcs = liveSrcs;
    liveNodes = []; liveSrcs = [];
    bedDuck = rainGain = rainHighGain = ondaGain = quedaGain = quedaFilt = null;
    master = null; ctx = null; noiseBuf = null;
    curPhase = 'calmo'; curFrac = 0; bedOpen = 1;
    if (c && m) {
        try { m.gain.setTargetAtTime(0, c.currentTime, 0.12); } catch { /* ctx morto */ }
        window.setTimeout(() => {
            try {
                for (const s of srcs) { try { s.stop(); } catch { /* já parou */ } }
                for (const n of nodes) n.disconnect();
                m.disconnect();
            } catch { /* já foi */ }
        }, 450);
    }
}

/**
 * Dirigido por frame pela cena: fase do ciclo + fração (0..1).
 * Ajusta chuva, duck da cama, patter, sub-drone — tudo com ramps suaves.
 */
export function floor9SfxSetPhase(phase: F9CyclePhase, frac: number): void {
    curPhase = phase; curFrac = frac;
    if (!ctx || !rainGain || !bedDuck || !rainHighGain || !ondaGain) return;
    const now = ctx.currentTime;
    // chuva por fase: 0 calmo · 0.06 aviso · 0.22 onda · renascer secando
    const rainTarget = phase === 'onda' ? 0.22 : phase === 'aviso' ? 0.06 : phase === 'renascer' ? 0.03 : 0;
    rainGain.gain.setTargetAtTime(rainTarget, now, 0.9);
    rainHighGain.gain.setTargetAtTime(phase === 'onda' ? 0.05 : 0, now, 1.1);
    // SILÊNCIO PRÉ-CHUVA: a cama cala no aviso (~3 s), volta no renascer
    bedOpen = phase === 'calmo' ? 1 : phase === 'renascer' ? Math.min(1, frac) : 0;
    bedDuck.gain.setTargetAtTime(bedOpen, now, bedOpen > 0 ? 0.8 : 1.0);
    // sub-drone contínuo da onda (embaixo da chuva)
    ondaGain.gain.setTargetAtTime(phase === 'onda' ? 0.045 : 0, now, 1.4);
}

/** Vento da queda — a cutscene chama por frame com k (0..1, progresso). */
export function floor9SfxQueda(k: number): void {
    if (!ctx || !quedaGain || !quedaFilt) return;
    const now = ctx.currentTime;
    quedaGain.gain.setTargetAtTime(0.03 + k * k * 0.22, now, 0.18);
    quedaFilt.frequency.setTargetAtTime(300 + k * 900, now, 0.2);
}

/** O POUSO: corta o vento e bate o THUD (74→46 Hz, ref playF6Thud). */
export function floor9SfxPousou(): void {
    if (!ctx || !quedaGain) return;
    quedaGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    tone(74, 46, 0.24, 0.32, 'sine');
    noiseBurst(0.1, 0.08, 'lowpass', 500);
    // folhas/impacto macio depois do baque
    noiseBurst(0.05, 0.5, 'bandpass', 700, 0.6, ctx.currentTime + 0.05);
}

/** Trovão (scheduler do f8Music): o relâmpago chama com atraso de 0.5–2 s. */
export function playFloor9Thunder(delay = 1, gainMul = 1): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime + Math.max(0, delay);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(46 + Math.random() * 18, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 * gainMul, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 3.2);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 3.4);
    // estalo inicial pra raio perto
    if (delay < 0.9) noiseBurst(0.05 * gainMul, 0.14, 'highpass', 2400, 0.7, t);
}

/** Eventos da FLORESTA (a cena drena f9DrainEvents e repassa — sem fan-out lá). */
export function floor9SfxFloresta(e: F9Event): void {
    if (!ctx || !master) return;
    if (e === 'apagado') {
        // pego pela onda/vulto: swell reverso clareando (o branco engolindo)
        noiseBurst(0.06, 1.6, 'bandpass', 1200, 0.5);
        tone(220, 440, 1.2, 0.02, 'sine');
    } else if (e === 'replantado') {
        playF9MemoryPulse();
    } else if (e === 'raiz') {
        // a árvore-mãe responde: acorde grave suave
        const t = ctx.currentTime;
        [110, 165, 220].forEach((f, i) => tone(f, f, 2.2, 0.02, 'sine', t + i * 0.12));
    }
    // 'pousou' usa floor9SfxPousou (a cutscene chama no tempo exato do freio)
}
