/**
 * Floor2/cave-features.tsx — Above-water cave visuals.
 * CrystalCluster, Torch (kept for re-export), TorchField, DustMotes.
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';

import { DUST_COUNT } from './constants';
import { GLOW_TEXTURE, CRYSTAL_GEO, BUBBLE_GEO } from './geometry';

// ─── CrystalCluster — colored emissive octahedra with glow sprites ────
export const CrystalCluster: React.FC<{ x: number; y: number; z: number; color: string }> = ({ x, y, z, color }) => (
    <group position={[x, y, z]}>
        <mesh geometry={CRYSTAL_GEO} rotation={[0.3, 0.8, 0]} scale={1.4}>
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.95}
                metalness={0.55}
                roughness={0.15}
                toneMapped={false}
            />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.75} position={[0.45, -0.20, 0.15]} rotation={[0.6, 1.2, 0.3]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} metalness={0.5} roughness={0.18} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.55} position={[-0.42, -0.25, -0.05]} rotation={[-0.4, 0.5, 0.7]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.60} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.4} position={[0.0, 0.35, -0.15]} rotation={[0.2, 0.2, 1.4]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.30} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite scale={[5.0, 5.0, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.08} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
    </group>
);

// ─── Torch — kept for backward-compat re-export; use TorchField instead ─
export const Torch: React.FC<{ x: number; y: number; z: number; seed: number }> = ({ x, y, z, seed }) => {
    const spriteRef = useRef<THREE.SpriteMaterial>(null);
    const outerRef = useRef<THREE.SpriteMaterial>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const noise = Math.sin(t * 37.7 + seed * 13.3) * 0.5 + 0.5;
        const flicker = 0.5 + Math.sin(t * 9 + seed) * 0.08 + Math.sin(t * 23 + seed * 1.3) * 0.06 + noise * 0.05;
        if (spriteRef.current) spriteRef.current.opacity = flicker;
        if (outerRef.current) outerRef.current.opacity = flicker * 0.3;
    });
    return (
        <group position={[x, y, z]}>
            <mesh>
                <coneGeometry args={[0.18, 0.4, 8]} />
                <meshStandardMaterial color="#FFA850" emissive="#FFB060" emissiveIntensity={3.5} toneMapped={false} />
            </mesh>
            <sprite scale={[3.0, 3.0, 1]}>
                <spriteMaterial ref={spriteRef} map={GLOW_TEXTURE} color="#FFC080" transparent opacity={0.5} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <sprite scale={[7.0, 7.0, 1]}>
                <spriteMaterial ref={outerRef} map={GLOW_TEXTURE} color="#FF9040" transparent opacity={0.15} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};

// ─── TorchField — single useFrame drives all torches ─────────────────
export const TorchField: React.FC<{ positions: readonly (readonly [number, number, number])[] }> = ({ positions }) => {
    const innerRefs = useRef<(THREE.SpriteMaterial | null)[]>([]);
    const outerRefs = useRef<(THREE.SpriteMaterial | null)[]>([]);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < positions.length; i++) {
            const seed = i * 7.3;
            const noise = Math.sin(t * 37.7 + seed * 13.3) * 0.5 + 0.5;
            const flicker = 0.5 + Math.sin(t * 9 + seed) * 0.08 + Math.sin(t * 23 + seed * 1.3) * 0.06 + noise * 0.05;
            const r = innerRefs.current[i];
            const o = outerRefs.current[i];
            if (r) r.opacity = flicker;
            if (o) o.opacity = flicker * 0.3;
        }
    });
    return (
        <group>
            {positions.map(([x, y, z], i) => (
                <group key={i} position={[x, y, z]}>
                    <mesh>
                        <coneGeometry args={[0.18, 0.4, 8]} />
                        <meshStandardMaterial color="#FFA850" emissive="#FFB060" emissiveIntensity={3.5} toneMapped={false} />
                    </mesh>
                    <sprite scale={[3.0, 3.0, 1]}>
                        <spriteMaterial ref={(r: any) => { innerRefs.current[i] = r; }} map={GLOW_TEXTURE} color="#FFC080" transparent opacity={0.5} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                    </sprite>
                    <sprite scale={[7.0, 7.0, 1]}>
                        <spriteMaterial ref={(r: any) => { outerRefs.current[i] = r; }} map={GLOW_TEXTURE} color="#FF9040" transparent opacity={0.15} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                    </sprite>
                </group>
            ))}
        </group>
    );
};

// ─── DustMotes — drifting in the air, catching light ──────────────────
export const DustMotes: React.FC = () => {
    const positions = useRef(
        Array.from({ length: DUST_COUNT }, () => ({
            x: (Math.random() - 0.5) * 56,
            y: 1 + Math.random() * 6,
            z: (Math.random() - 0.5) * 56,
            vx: (Math.random() - 0.5) * 0.05,
            vy: 0.02 + Math.random() * 0.03,
            vz: (Math.random() - 0.5) * 0.05,
            seed: Math.random() * 10,
        }))
    );
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(DUST_COUNT).fill(null));
    const frameTickRef = useRef(0);
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        const pos = positions.current;
        const tick = frameTickRef.current++;
        // Update half the dust each frame (alternating indices)
        for (let i = 0; i < DUST_COUNT; i++) {
            if ((i & 1) !== (tick & 1)) continue;  // Skip if parity doesn't match
            const p = pos[i];
            p.x += (p.vx + Math.sin(t * 0.6 + p.seed) * 0.02) * safeDt;
            p.y += p.vy * safeDt;
            p.z += (p.vz + Math.cos(t * 0.5 + p.seed) * 0.02) * safeDt;
            if (p.y > 7.5) {
                p.y = 0.5;
                const h1 = Math.sin(i * 127.1 + p.seed * 311.7) * 43758.5453;
                p.x = (h1 - Math.floor(h1) - 0.5) * 56;
                const h2 = Math.sin(i * 269.5 + p.seed * 183.3) * 43758.5453;
                p.z = (h2 - Math.floor(h2) - 0.5) * 56;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });
    return (
        <Instances limit={DUST_COUNT} range={DUST_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#FFE0B8" transparent opacity={0.55} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            {Array.from({ length: DUST_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.018 + Math.random() * 0.022} />
            ))}
        </Instances>
    );
};
