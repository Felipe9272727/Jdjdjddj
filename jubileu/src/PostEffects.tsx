import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

/**
 * Post-processing stack for The Normal Elevator.
 *
 * Lobby (level 0): subtle bloom + vignette for liminal atmosphere
 * Night/chase: heavy bloom + chromatic aberration + noise for horror
 * Outdoor day: light bloom, warm tone
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
    // Skip all post-processing on low quality — big perf win
    if (quality === 'low') return null;
    const isMedium = quality === 'medium';

    const isChase = gameState === 'chase';
    const isScary = nightMode || isChase;
    const isOutdoor = currentLevel === 1;

    return (
        <EffectComposer multisampling={0}>
            {/* Bloom — subtle glow on lights, stronger during chase */}
            <Bloom
                intensity={isChase ? 1.2 : isScary ? 0.6 : 0.3}
                luminanceThreshold={isChase ? 0.2 : 0.6}
                luminanceSmoothing={0.9}
                mipmapBlur
            />

            {/* Vignette — darkens edges, more dramatic at night */}
            <Vignette
                offset={isScary ? 0.3 : 0.4}
                darkness={isChase ? 0.9 : isScary ? 0.7 : 0.4}
                blendFunction={BlendFunction.NORMAL}
            />

            {/* Film grain — subtle texture, heavier during horror (high quality only) */}
            {!isMedium && (
                <Noise
                    premultiply
                    blendFunction={isScary ? BlendFunction.ADD : BlendFunction.SOFT_LIGHT}
                    opacity={isChase ? 0.08 : isScary ? 0.04 : 0.02}
                />
            )}

            {/* Chromatic aberration — only during chase, high quality only */}
            {isChase && !isMedium && (
                <ChromaticAberration
                    offset={new THREE.Vector2(0.002, 0.002)}
                    blendFunction={BlendFunction.NORMAL}
                    radialModulation={true}
                    modulationOffset={0.5}
                />
            )}
        </EffectComposer>
    );
};

/**
 * Atmospheric dust particles — floating specs in the lobby.
 * Uses InstancedMesh for performance (single draw call for 60 particles).
 */
export const DustParticles = ({ count = 60, area = 16 }: { count?: number; area?: number }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Pre-compute particle positions and velocities
    const particles = useMemo(() => {
        return Array.from({ length: count }, () => ({
            x: (Math.random() - 0.5) * area,
            y: Math.random() * 4,
            z: (Math.random() - 0.5) * area,
            vx: (Math.random() - 0.5) * 0.1,
            vy: 0.02 + Math.random() * 0.05,
            vz: (Math.random() - 0.5) * 0.1,
            phase: Math.random() * Math.PI * 2,
            speed: 0.3 + Math.random() * 0.7,
            size: 0.015 + Math.random() * 0.025,
        }));
    }, [count, area]);

    const frameRef = useRef(0);

    useFrame((state) => {
        if (!meshRef.current) return;
        // Skip frames: update every 2nd frame for performance
        frameRef.current++;
        if (frameRef.current % 2 !== 0) return;
        const t = state.clock.elapsedTime;

        for (let i = 0; i < count; i++) {
            const p = particles[i];
            // Gentle floating motion
            const x = p.x + Math.sin(t * p.speed + p.phase) * 0.3;
            const y = ((p.y + t * p.vy) % 4.2) - 0.1; // wrap vertically
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
            <sphereGeometry args={[1, 6, 6]} />
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
 * Gives the liminal space a "fluorescent light" feel.
 */
export const FluorescentFlicker = ({ intensity = 2.8 }: { intensity?: number }) => {
    const lightRef = useRef<THREE.PointLight>(null);
    const lastUpdateRef = useRef(0);

    useFrame((state) => {
        if (!lightRef.current) return;
        // Throttle to ~15fps (every 66ms) — fluorescent flicker doesn't need 60fps
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.066) return;
        lastUpdateRef.current = now;
        const t = now;
        // Realistic fluorescent flicker: mostly stable with occasional dips
        const base = intensity;
        const flicker = Math.sin(t * 30) * 0.02; // fast subtle buzz
        const dip = Math.sin(t * 0.5) > 0.95 ? -0.3 : 0; // occasional dip
        const random = (Math.sin(t * 137.5) * 0.5 + 0.5) * 0.05; // pseudo-random
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
        // Throttle to ~15fps — eerie pulse doesn't need 60fps
        const now = state.clock.elapsedTime;
        if (now - lastUpdateRef.current < 0.066) return;
        lastUpdateRef.current = now;
        // Slow breathing pulse
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
