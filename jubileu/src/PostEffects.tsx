import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Lightweight post-processing via CSS overlay (no EffectComposer = 0 extra render passes).
 * Replaces the heavy @react-three/postprocessing stack that was causing lag.
 */
export const GameEffects = ({
    nightMode,
    gameState,
    currentLevel,
    quality = 'high',
}: {
    nightMode: boolean;
    gameState: string;
    currentLevel: number;
    quality?: string;
}) => {
    if (quality === 'low') return null;

    const isChase = gameState === 'chase';
    const isScary = nightMode || isChase;

    // CSS-based vignette + grain — zero GPU cost, handled by the browser compositor
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 5,
                // Vignette via radial gradient
                background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${isChase ? 0.6 : isScary ? 0.4 : 0.25}) 100%)`,
                // Film grain via CSS animation
                mixBlendMode: 'multiply',
                opacity: isChase ? 0.15 : isScary ? 0.08 : 0.04,
            }}
        />
    );
};

/**
 * Atmospheric dust particles — floating specs in the lobby.
 * Uses InstancedMesh for performance (single draw call).
 */
export const DustParticles = ({ count = 20, area = 16 }: { count?: number; area?: number }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const particles = useMemo(() => {
        return Array.from({ length: count }, () => ({
            x: (Math.random() - 0.5) * area,
            y: Math.random() * 4,
            z: (Math.random() - 0.5) * area,
            vy: 0.02 + Math.random() * 0.05,
            phase: Math.random() * Math.PI * 2,
            speed: 0.3 + Math.random() * 0.7,
            size: 0.015 + Math.random() * 0.025,
        }));
    }, [count, area]);

    const frameRef = useRef(0);

    useFrame((state) => {
        if (!meshRef.current) return;
        frameRef.current++;
        if (frameRef.current % 3 !== 0) return; // every 3rd frame
        const t = state.clock.elapsedTime;

        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const x = p.x + Math.sin(t * p.speed + p.phase) * 0.3;
            const y = ((p.y + t * p.vy) % 4.2) - 0.1;
            const z = p.z + Math.cos(t * p.speed * 0.7 + p.phase) * 0.3;

            dummy.position.set(x, y, z);
            dummy.scale.setScalar(p.size * (1 + Math.sin(t * 2 + p.phase) * 0.3));
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[1, 4, 4]} />
            <meshBasicMaterial
                color="#FFE0B2"
                transparent
                opacity={0.15}
                depthWrite={false}
                toneMapped={false}
            />
        </instancedMesh>
    );
};

/**
 * Ambient light flicker — subtle, unsettling light variation in the lobby.
 */
export const FluorescentFlicker = ({ intensity = 2.8 }: { intensity?: number }) => {
    const lightRef = useRef<THREE.PointLight>(null);
    const lastUpdateRef = useRef(0);

    useFrame((state) => {
        if (!lightRef.current) return;
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.1) return; // ~10fps
        lastUpdateRef.current = now;
        const t = now;
        const base = intensity;
        const flicker = Math.sin(t * 30) * 0.02;
        const dip = Math.sin(t * 0.5) > 0.95 ? -0.3 : 0;
        const random = (Math.sin(t * 137.5) * 0.5 + 0.5) * 0.05;
        lightRef.current.intensity = base + flicker + dip + random;
    });

    return <pointLight ref={lightRef} position={[0, 3.8, 0]} intensity={intensity} distance={22} color="#FFE0B2" decay={2} />;
};

/**
 * Night mode ambient — eerie pulsing light during horror sequences.
 */
export const NightAmbient = ({ active }: { active: boolean }) => {
    const lightRef = useRef<THREE.PointLight>(null);
    const lastUpdateRef = useRef(0);

    useFrame((state) => {
        if (!lightRef.current || !active) return;
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.1) return; // ~10fps
        lastUpdateRef.current = now;
        lightRef.current.intensity = 0.1 + Math.sin(now * 1.5) * 0.05;
    });

    if (!active) return null;

    return (
        <pointLight
            ref={lightRef}
            position={[0, 3, 0]}
            intensity={0.1}
            distance={20}
            color="#1a1a40"
            decay={2}
        />
    );
};
