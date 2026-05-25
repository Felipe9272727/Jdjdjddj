import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Ceiling fan — slowly spinning in the lobby for atmospheric effect.
 * Gives the liminal space more life and movement.
 */
export const CeilingFan = ({ x = 0, z = 0, speed = 0.8 }: { x?: number; z?: number; speed?: number }) => {
    const bladeRef = useRef<THREE.Group>(null);
    const lastUpdateRef = useRef(0);

    useFrame((state) => {
        if (!bladeRef.current) return;
        // Distance cull first — fan past 14u is far in the lobby; no point spinning it.
        const dx = state.camera.position.x - x;
        const dz = state.camera.position.z - z;
        if (dx * dx + dz * dz > 196) return;
        // Throttle to ~20fps — smooth enough for a spinning fan
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.05) return;
        lastUpdateRef.current = now;
        bladeRef.current.rotation.y = now * speed;
    });

    return (
        <group position={[x, 4.3, z]}>
            {/* Motor housing */}
            <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 0.2, 12]} />
                <meshStandardMaterial color="#424242" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Rod */}
            <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
                <meshStandardMaterial color="#424242" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Blades */}
            <group ref={bladeRef} position={[0, -0.05, 0]}>
                {[0, 1, 2, 3].map((i) => (
                    <mesh key={i} position={[0, 0, 0]} rotation={[0, (Math.PI / 2) * i, 0]}>
                        <boxGeometry args={[0.12, 0.02, 1.2]} />
                        <meshStandardMaterial color="#5D4037" roughness={0.8} />
                    </mesh>
                ))}
            </group>
            {/* Light underneath */}
            <pointLight position={[0, -0.2, 0]} intensity={0.5} distance={6} color="#FFE0B2" decay={2} />
        </group>
    );
};

/**
 * Elevator arrival ding — procedural audio for the elevator arriving.
 * Plays a pleasant ding sound when the elevator doors open.
 */
export const playArrivalDing = (audioContext: AudioContext | null) => {
    if (!audioContext) return;
    const t = audioContext.currentTime;

    // Main ding tone
    const osc1 = audioContext.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t); // A5
    osc1.frequency.exponentialRampToValueAtTime(830, t + 0.8);

    const gain1 = audioContext.createGain();
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    // Harmonic overtone
    const osc2 = audioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, t); // E6

    const gain2 = audioContext.createGain();
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.05, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

    // Connect
    osc1.connect(gain1).connect(audioContext.destination);
    osc2.connect(gain2).connect(audioContext.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 1.5);
    osc2.stop(t + 1.0);
};

/**
 * Jumpscare stab — short, sharp violin-style sting for sudden NPC
 * appearances. Composed of:
 *   - Low atonal cluster (G2 + Ab2 + A#2 dissonance)
 *   - High shrill descending sweep (2.5kHz → 800Hz)
 *   - White-noise burst gated by a fast envelope
 *   - Low-end thud for body impact
 */
export const playJumpscareStab = (audioContext: AudioContext | null) => {
    if (!audioContext) return;
    const t = audioContext.currentTime;

    // ── Low atonal cluster (Bernard Herrmann-ish dissonance) ──
    const cluster = [98, 104, 117]; // G2, Ab2, A#2 — semitone dissonance
    for (const freq of cluster) {
        const osc = audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(t);
        osc.stop(t + 0.7);
    }

    // ── High shrill descending sweep ──
    const high = audioContext.createOscillator();
    high.type = 'sawtooth';
    high.frequency.setValueAtTime(2500, t);
    high.frequency.exponentialRampToValueAtTime(800, t + 0.45);
    const highFilter = audioContext.createBiquadFilter();
    highFilter.type = 'lowpass';
    highFilter.frequency.value = 4000;
    highFilter.Q.value = 6;
    const highGain = audioContext.createGain();
    highGain.gain.setValueAtTime(0, t);
    highGain.gain.linearRampToValueAtTime(0.16, t + 0.01);
    highGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    high.connect(highFilter).connect(highGain).connect(audioContext.destination);
    high.start(t);
    high.stop(t + 0.55);

    // ── White noise burst ──
    const noiseLen = Math.floor(audioContext.sampleRate * 0.25);
    const noiseBuf = audioContext.createBuffer(1, noiseLen, audioContext.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = audioContext.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 1.2;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.20, t + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(audioContext.destination);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.30);

    // ── Sub-bass thud (body impact) ──
    const thud = audioContext.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(70, t);
    thud.frequency.exponentialRampToValueAtTime(30, t + 0.18);
    const thudGain = audioContext.createGain();
    thudGain.gain.setValueAtTime(0, t);
    thudGain.gain.linearRampToValueAtTime(0.50, t + 0.005);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    thud.connect(thudGain).connect(audioContext.destination);
    thud.start(t);
    thud.stop(t + 0.35);
};

/**
 * Cave ambience — continuous low rumble + a few sine drones that beat
 * against each other for an unsettling cave acoustic. Returns a stop
 * function so the caller can cancel on level change.
 *
 * Use case: Floor 2 underwater cave. Mounts on level entry, stops on
 * exit. Volume is intentionally low; it sits under everything else.
 */
export const createCaveAmbience = (audioContext: AudioContext | null): (() => void) => {
    if (!audioContext) return () => {};

    // ── Sub-bass rumble ──
    const sub = audioContext.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 38;
    const subGain = audioContext.createGain();
    subGain.gain.value = 0;
    sub.connect(subGain).connect(audioContext.destination);
    subGain.gain.setTargetAtTime(0.13, audioContext.currentTime, 1.5);
    sub.start();

    // ── Mid drone (slightly detuned sines for beating) ──
    const drone1 = audioContext.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 87;
    const drone2 = audioContext.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 89.3;  // detune for slow beating
    const droneFilter = audioContext.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    droneFilter.Q.value = 0.6;
    const droneGain = audioContext.createGain();
    droneGain.gain.value = 0;
    drone1.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(droneGain).connect(audioContext.destination);
    droneGain.gain.setTargetAtTime(0.045, audioContext.currentTime, 2.0);
    drone1.start();
    drone2.start();

    // ── Filtered noise wash — distant water/wind ──
    const noiseLen = Math.floor(audioContext.sampleRate * 4);
    const noiseBuf = audioContext.createBuffer(1, noiseLen, audioContext.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 450;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter).connect(noiseGain).connect(audioContext.destination);
    noiseGain.gain.setTargetAtTime(0.028, audioContext.currentTime, 3.0);
    noise.start();

    // ── Random drip scheduler ──
    let stopped = false;
    const scheduleDrip = () => {
        if (stopped) return;
        const t = audioContext.currentTime;
        const dripFreq = 1200 + Math.random() * 1400;
        const dripOsc = audioContext.createOscillator();
        dripOsc.type = 'sine';
        dripOsc.frequency.setValueAtTime(dripFreq, t);
        dripOsc.frequency.exponentialRampToValueAtTime(dripFreq * 0.55, t + 0.10);
        const dripGain = audioContext.createGain();
        dripGain.gain.setValueAtTime(0, t);
        dripGain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.03, t + 0.005);
        dripGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        dripOsc.connect(dripGain).connect(audioContext.destination);
        dripOsc.start(t);
        dripOsc.stop(t + 0.20);
        // Next drip in 1.5..6 seconds
        const next = 1500 + Math.random() * 4500;
        setTimeout(scheduleDrip, next);
    };
    setTimeout(scheduleDrip, 1200 + Math.random() * 2000);

    return () => {
        stopped = true;
        try { subGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5); } catch {}
        try { droneGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5); } catch {}
        try { noiseGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5); } catch {}
        // Stop nodes 1s later so the fade can finish.
        setTimeout(() => {
            try { sub.stop(); sub.disconnect(); } catch {}
            try { drone1.stop(); drone1.disconnect(); } catch {}
            try { drone2.stop(); drone2.disconnect(); } catch {}
            try { noise.stop(); noise.disconnect(); } catch {}
            try { subGain.disconnect(); } catch {}
            try { droneGain.disconnect(); } catch {}
            try { noiseGain.disconnect(); } catch {}
            try { droneFilter.disconnect(); } catch {}
            try { noiseFilter.disconnect(); } catch {}
        }, 1200);
    };
};

/**
 * Soft confirm chime — used when the rebreather "snaps" into place during
 * the put-on cinematic.
 */
export const playEquipChime = (audioContext: AudioContext | null) => {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    const freqs = [523.25, 783.99]; // C5 + G5
    for (let i = 0; i < freqs.length; i++) {
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqs[i], t + i * 0.05);
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0, t + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.10, t + 0.02 + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + i * 0.05);
        osc.connect(gain).connect(audioContext.destination);
        osc.start(t + i * 0.05);
        osc.stop(t + 0.7 + i * 0.05);
    }
};

/**
 * Diver cutscene helpers — typewriter ticks, per-beat punctuation, ambient
 * bed. Procedural Web Audio, no external samples.
 */
export const playTypewriterTick = (audioContext: AudioContext | null) => {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    // Tiny pitched click — slightly randomized so it doesn't sound robotic.
    const osc = audioContext.createOscillator();
    osc.type = 'square';
    const freq = 1850 + Math.random() * 320;
    osc.frequency.setValueAtTime(freq, t);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.013, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    // Highpass to keep it tight + crisp; cuts the booming square fundamentals.
    const hp = audioContext.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    osc.connect(hp).connect(gain).connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.05);
};

export const playBeatPunctuation = (audioContext: AudioContext | null, beatIdx: number) => {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    // Each beat gets a different "color" to underscore the emotion shift:
    //   0 cyan/curiosity, 1 amber/memory, 2 orange/warmth,
    //   3 green/handover (more weight), 4 blue/farewell.
    const palettes: Array<{ base: number; sweep: number; len: number; vol: number }> = [
        { base: 220,  sweep: 110, len: 0.85, vol: 0.085 }, // curious — descending
        { base: 165,  sweep: 132, len: 1.10, vol: 0.090 }, // memory — slow lower
        { base: 196,  sweep: 220, len: 0.95, vol: 0.085 }, // warm — rises
        { base: 110,  sweep: 78,  len: 1.20, vol: 0.110 }, // handover — deep
        { base: 260,  sweep: 174, len: 0.80, vol: 0.085 }, // farewell — bell-like
    ];
    const p = palettes[beatIdx] ?? palettes[0];

    // Sub layer: deep sine sweep
    const sub = audioContext.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(p.base, t);
    sub.frequency.exponentialRampToValueAtTime(p.sweep, t + p.len * 0.85);
    const subGain = audioContext.createGain();
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(p.vol, t + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + p.len);

    // Whoosh layer: filtered noise
    const noiseBuf = audioContext.createBuffer(1, audioContext.sampleRate * p.len, audioContext.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = audioContext.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(p.base * 4, t);
    bp.frequency.exponentialRampToValueAtTime(p.sweep * 3, t + p.len * 0.85);
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(p.vol * 0.45, t + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + p.len);

    sub.connect(subGain).connect(audioContext.destination);
    noise.connect(bp).connect(noiseGain).connect(audioContext.destination);
    sub.start(t);
    sub.stop(t + p.len + 0.05);
    noise.start(t);
    noise.stop(t + p.len);
};

/**
 * Dark underwater drone bed that plays during the diver cutscene.
 * Returns a stop function (call on unmount or when cutscene exits).
 */
export const createDiverCutsceneBed = (audioContext: AudioContext | null): (() => void) => {
    if (!audioContext) return () => {};
    const t = audioContext.currentTime;

    // Two detuned sub-bass sines for a brooding bed
    const subA = audioContext.createOscillator(); subA.type = 'sine'; subA.frequency.value = 55;
    const subB = audioContext.createOscillator(); subB.type = 'sine'; subB.frequency.value = 55 * 1.012;
    const subC = audioContext.createOscillator(); subC.type = 'sine'; subC.frequency.value = 82.5; // perfect fifth shimmer

    // Filtered pink noise for "underwater wash"
    const noiseBuf = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < noiseData.length; i++) {
        const white = Math.random() * 2 - 1;
        last = 0.985 * last + 0.015 * white;  // crude pink-ish filter
        noiseData[i] = last * 6;
    }
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const lp = audioContext.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.7;

    // Slow LFO modulates the noise filter — gives the bed gentle motion
    const lfo = audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);

    // Bus + 4s fade-in so it doesn't punch in
    const bus = audioContext.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(0.16, t + 4.0);

    subA.connect(bus); subB.connect(bus); subC.connect(bus);
    noise.connect(lp).connect(bus);
    bus.connect(audioContext.destination);

    subA.start(t); subB.start(t); subC.start(t); noise.start(t); lfo.start(t);

    let stopped = false;
    return () => {
        if (stopped) return;
        stopped = true;
        const now = audioContext.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        try {
            subA.stop(now + 0.7); subB.stop(now + 0.7); subC.stop(now + 0.7);
            noise.stop(now + 0.7); lfo.stop(now + 0.7);
        } catch { /* already stopped */ }
    };
};

/**
 * Elevator hum — subtle ambient motor sound while traveling.
 */
export const createElevatorHum = (audioContext: AudioContext | null): (() => void) => {
    if (!audioContext) return () => {};

    const osc = audioContext.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(45, audioContext.currentTime);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, audioContext.currentTime + 0.5);

    osc.connect(filter).connect(gain).connect(audioContext.destination);
    osc.start();

    return () => {
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
        setTimeout(() => { try { osc.stop(); } catch {} }, 300);
    };
};

/**
 * Monster presence ambience — deep bio-sonar drone that scales with proximity.
 * Returns { setProximity, stop }. Call setProximity(0..1) each frame or on
 * interval; call stop() when leaving Floor 2 or on game reset.
 *
 * Layers:
 *   sub    40 Hz sine  — felt more than heard, like a massive heartbeat
 *   harm   80 Hz sine  — warmth/body of the creature
 *   lfo    0.28 Hz LFO — slow biological breathing modulation
 * Pitch rises slightly as proximity increases (Doppler tension).
 */
export const createMonsterAmbience = (audioContext: AudioContext | null): {
    setProximity: (p: number) => void;
    stop: () => void;
} => {
    const noop = { setProximity: () => {}, stop: () => {} };
    if (!audioContext) return noop;

    const master = audioContext.createGain();
    master.gain.setValueAtTime(0, audioContext.currentTime);
    master.connect(audioContext.destination);

    // Sub-bass body
    const sub = audioContext.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(40, audioContext.currentTime);

    // Second harmonic — richness
    const harm = audioContext.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(80, audioContext.currentTime);
    const harmGain = audioContext.createGain();
    harmGain.gain.setValueAtTime(0.35, audioContext.currentTime);

    // LFO — slow biological pulse (0.28 Hz ≈ one breath every 3.5s)
    const lfo = audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.28, audioContext.currentTime);
    const lfoDepth = audioContext.createGain();
    lfoDepth.gain.setValueAtTime(0.18, audioContext.currentTime);

    // Low-pass to keep it subsonic-ish
    const lpf = audioContext.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(120, audioContext.currentTime);
    lpf.Q.value = 0.7;

    lfo.connect(lfoDepth).connect(master.gain);
    sub.connect(lpf);
    harm.connect(harmGain).connect(lpf);
    lpf.connect(master);

    sub.start();
    harm.start();
    lfo.start();

    let stopped = false;
    return {
        setProximity: (p: number) => {
            if (stopped) return;
            const t = audioContext.currentTime;
            const gain = p * p * 0.45;           // quadratic — ramps up fast when close
            master.gain.linearRampToValueAtTime(gain, t + 0.6);
            // Pitch creep — rises 15 Hz at full proximity
            sub.frequency.linearRampToValueAtTime(40 + p * 15, t + 1.2);
            harm.frequency.linearRampToValueAtTime(80 + p * 22, t + 1.2);
        },
        stop: () => {
            if (stopped) return;
            stopped = true;
            const t = audioContext.currentTime;
            master.gain.linearRampToValueAtTime(0, t + 1.8);
            setTimeout(() => {
                try { sub.stop(); harm.stop(); lfo.stop(); } catch (_) {}
                master.disconnect();
            }, 2200);
        },
    };
};

/**
 * Wall clock — ticking clock on the lobby wall for atmosphere.
 */
export const WallClock = ({ x = 8, z = -8 }: { x?: number; z?: number }) => {
    const handRef = useRef<THREE.Mesh>(null);
    const lastUpdateRef = useRef(0);

    useFrame((state) => {
        if (!handRef.current) return;
        // Distance cull — clock past 12u is too small to read anyway.
        const dx = state.camera.position.x - x;
        const dz = state.camera.position.z - z;
        if (dx * dx + dz * dz > 144) return;
        // Throttle to ~10fps — a clock hand doesn't need smooth updates
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.1) return;
        lastUpdateRef.current = now;
        // Second hand rotation — 1 revolution per 60 seconds
        handRef.current.rotation.z = -(now * Math.PI * 2) / 60;
    });

    return (
        <group position={[x, 2.5, z]} rotation={[0, -Math.PI / 2, 0]}>
            {/* Clock face */}
            <mesh>
                <circleGeometry args={[0.3, 32]} />
                <meshStandardMaterial color="#F5F0EB" roughness={0.3} />
            </mesh>
            {/* Rim */}
            <mesh position={[0, 0, -0.01]}>
                <ringGeometry args={[0.28, 0.32, 32]} />
                <meshStandardMaterial color="#424242" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Hour markers */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
                const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                const r = 0.24;
                return (
                    <mesh key={i} position={[Math.cos(angle) * r, Math.sin(angle) * r, 0.01]}>
                        <circleGeometry args={[i % 3 === 0 ? 0.02 : 0.01, 8]} />
                        <meshBasicMaterial color="#1a1a1a" />
                    </mesh>
                );
            })}
            {/* Second hand */}
            <mesh ref={handRef} position={[0, 0, 0.02]}>
                <boxGeometry args={[0.005, 0.22, 0.005]} />
                <meshBasicMaterial color="#FF0000" />
            </mesh>
            {/* Hour hand */}
            <mesh position={[0, 0.06, 0.015]} rotation={[0, 0, -0.8]}>
                <boxGeometry args={[0.012, 0.14, 0.005]} />
                <meshBasicMaterial color="#1a1a1a" />
            </mesh>
            {/* Minute hand */}
            <mesh position={[0, 0.08, 0.015]} rotation={[0, 0, 0.4]}>
                <boxGeometry args={[0.008, 0.18, 0.005]} />
                <meshBasicMaterial color="#1a1a1a" />
            </mesh>
            {/* Center dot */}
            <mesh position={[0, 0, 0.025]}>
                <circleGeometry args={[0.015, 12]} />
                <meshBasicMaterial color="#424242" />
            </mesh>
        </group>
    );
};
