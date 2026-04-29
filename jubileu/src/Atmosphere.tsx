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
