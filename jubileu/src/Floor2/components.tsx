/**
 * components.tsx — All Floor2 sub-components
 *
 * Each component is self-contained with its own hooks.
 * The main Floor2Environment composes these.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, MeshReflectorMaterial, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from '../Elevator';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    DUST_COUNT, DEBRIS_COUNT, FISH_COUNT, PLANKTON_COUNT,
    BUBBLE_COUNT, BUBBLE_RANGE, BUBBLE_RISE, BUBBLE_MAX_Y, BUBBLE_MIN_Y,
    COLLECT_DIST_SQ,
    ROCK_MODEL_URLS, BOULDER_MODEL_URL,
    CAVE_ROCKS_DARK, CAVE_ROCKS_MID, CAVE_ROCKS_LIGHT,
    POOL_RIM, STALAGMITES, STALACTITES, CRYSTALS, TORCH_POSITIONS,
    UW_BOULDERS, UW_PEBBLES, KELP_POSITIONS, CORAL_POSITIONS,
    type Boulder, type Stalactite, type Crystal,
} from './constants';

import {
    GLOW_TEXTURE, CAVE_FLOOR_GEO, BUBBLE_GEO, SHARD_GEO, PEBBLE_GEO,
    CRYSTAL_GEO, KELP_GEO, FISH_GEO, DEBRIS_GEO, PLANKTON_GEO, UW_FLOOR_GEO,
} from './geometry';

import { WaterMaterial, CausticsMaterial } from './shaders';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

export function usePBRSet(colorUrl: string, normalUrl: string, roughUrl: string, aoUrl: string, repeatX: number, repeatY: number) {
    const [color, normal, rough, ao] = useTexture([colorUrl, normalUrl, roughUrl, aoUrl]);
    for (const tex of [color, normal, rough, ao]) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
    }
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    rough.colorSpace = THREE.NoColorSpace;
    ao.colorSpace = THREE.NoColorSpace;
    return { color, normal, rough, ao };
}

// ═══════════════════════════════════════════════════════════════════════
// Crystal Cluster
// ═══════════════════════════════════════════════════════════════════════

const CrystalCluster: React.FC<{ x: number; y: number; z: number; color: string }> = ({ x, y, z, color }) => (
    <group position={[x, y, z]}>
        <mesh geometry={CRYSTAL_GEO} rotation={[0.3, 0.8, 0]} scale={1.4}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} metalness={0.55} roughness={0.15} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.75} position={[0.45, -0.20, 0.15]} rotation={[0.6, 1.2, 0.3]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.9} metalness={0.5} roughness={0.18} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.55} position={[-0.42, -0.25, -0.05]} rotation={[-0.4, 0.5, 0.7]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.7} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.4} position={[0.0, 0.35, -0.15]} rotation={[0.2, 0.2, 1.4]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite scale={[5.0, 5.0, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.12} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
    </group>
);

// ═══════════════════════════════════════════════════════════════════════
// Torch
// ═══════════════════════════════════════════════════════════════════════

const Torch: React.FC<{ x: number; y: number; z: number; seed: number }> = ({ x, y, z, seed }) => {
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

// ═══════════════════════════════════════════════════════════════════════
// Dust Motes
// ═══════════════════════════════════════════════════════════════════════

const DustMotes: React.FC = () => {
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
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        const pos = positions.current;
        for (let i = 0; i < DUST_COUNT; i++) {
            const p = pos[i];
            p.x += (p.vx + Math.sin(t * 0.6 + p.seed) * 0.02) * safeDt;
            p.y += p.vy * safeDt;
            p.z += (p.vz + Math.cos(t * 0.5 + p.seed) * 0.02) * safeDt;
            if (p.y > 7.5) {
                p.y = 0.5;
                p.x = (Math.random() - 0.5) * 56;
                p.z = (Math.random() - 0.5) * 56;
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

// ═══════════════════════════════════════════════════════════════════════
// Water Surface
// ═══════════════════════════════════════════════════════════════════════

export const WaterSurface: React.FC<{ reflective?: boolean }> = ({ reflective = false }) => {
    const mat = useMemo(() => {
        const m = new (WaterMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
        if (reflective) (mat as any).opacity = 0.45;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            {reflective && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
                    <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05]} />
                    <MeshReflectorMaterial
                        blur={[300, 100]} resolution={512} mixBlur={1.0} mixStrength={1.2}
                        roughness={0.6} depthScale={0.4} minDepthThreshold={0.4}
                        maxDepthThreshold={1.5} color="#0a1a2a" metalness={0.4} mirror={0.65}
                    />
                </mesh>
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 64, 64]} />
                <primitive object={mat} attach="material" />
            </mesh>
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Dynamic Fog
// ═══════════════════════════════════════════════════════════════════════

export const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    const _surfaceFog = new THREE.Color('#040e12');
    const _midFog = new THREE.Color('#020810');
    const _deepFog = new THREE.Color('#010406');
    const _caveFog = new THREE.Color('#0e0a08');
    const _surfaceBg = new THREE.Color('#040e12');
    const _midBg = new THREE.Color('#020810');
    const _deepBg = new THREE.Color('#010406');
    const _caveBg = new THREE.Color('#0e0a08');

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;

        if (y >= SWIM_THRESHOLD_Y) {
            _tgtFog.current.copy(_caveFog);
            _tgtBg.current.copy(_caveBg);
            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (14 - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (55 - scene.fog.far) * k;
        } else {
            const depth = Math.abs(y - SWIM_THRESHOLD_Y);
            const t = Math.min(depth / 29, 1);
            if (t < 0.4) {
                _tgtFog.current.copy(_surfaceFog).lerp(_midFog, t / 0.4);
                _tgtBg.current.copy(_surfaceBg).lerp(_midBg, t / 0.4);
            } else {
                _tgtFog.current.copy(_midFog).lerp(_deepFog, (t - 0.4) / 0.6);
                _tgtBg.current.copy(_midBg).lerp(_deepBg, (t - 0.4) / 0.6);
            }
            const breathe = Math.sin(performance.now() * 0.0003) * 0.5;
            const baseNear = 0.5 - t * 0.4;
            const baseFar = 8 - t * 4;
            const tgtNear = Math.max(0.1, baseNear + breathe * 0.05);
            const tgtFar = Math.max(3, baseFar + breathe * 0.3);
            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (tgtFar - scene.fog.far) * k;
        }
        if (scene.background && (scene.background as any).isColor) {
            (scene.background as THREE.Color).copy(_bgColor.current);
        }
    });
    return null;
};

// ═══════════════════════════════════════════════════════════════════════
// Underwater Caustics
// ═══════════════════════════════════════════════════════════════════════

const UnderwaterCaustics: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (CausticsMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.toneMapped = false;
        return m;
    }, []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -29.95, 0]}>
            <planeGeometry args={[40, 40]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Kelp Field
// ═══════════════════════════════════════════════════════════════════════

const KelpField: React.FC = () => {
    const meshRefs = useRef<(THREE.Mesh | null)[][]>(
        KELP_POSITIONS.map(() => new Array(3).fill(null))
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let k = 0; k < KELP_POSITIONS.length; k++) {
            const phase = KELP_POSITIONS[k][3];
            for (let i = 0; i < 3; i++) {
                const m = meshRefs.current[k]?.[i];
                if (!m) continue;
                const swayAmt = (i / 3) * 0.25;
                m.rotation.z = Math.sin(t * 0.6 + phase + i * 0.4) * swayAmt;
                m.rotation.x = Math.cos(t * 0.5 + phase + i * 0.3) * swayAmt * 0.6;
            }
        }
    });
    return (
        <>
            {KELP_POSITIONS.map(([x, z, height, phase], k) => {
                const segLen = height / 3;
                return (
                    <group key={`kelp-${k}`} position={[x, -30, z]}>
                        {Array.from({ length: 3 }, (_, i) => (
                            <mesh
                                key={i}
                                ref={(r: any) => { if (meshRefs.current[k]) meshRefs.current[k][i] = r; }}
                                position={[0, segLen * 0.5 + i * segLen * 0.95, 0]}
                                geometry={KELP_GEO}
                                scale={[1 - i * 0.1, segLen, 1 - i * 0.1]}
                            >
                                <meshStandardMaterial color={i < 2 ? '#0a0805' : '#0c0a06'} roughness={0.85} flatShading />
                            </mesh>
                        ))}
                        <mesh position={[0, height * 0.9, 0]} rotation={[0.3 + Math.sin(phase) * 0.2, phase, 0.1]} scale={[0.6, 0.3, 0.02]}>
                            <planeGeometry args={[1, 1]} />
                            <meshStandardMaterial color="#0c0f06" roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.85} />
                        </mesh>
                    </group>
                );
            })}
        </>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Coral
// ═══════════════════════════════════════════════════════════════════════

const Coral: React.FC<{ x: number; z: number; color: string; scale: number }> = ({ x, z, color, scale }) => (
    <group position={[x, -30, z]} scale={scale}>
        <mesh position={[0, 0.3, 0]}><dodecahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color="#0e0a06" roughness={0.95} metalness={0.05} flatShading /></mesh>
        <mesh position={[0, 1.0, 0]} rotation={[0.1, 0, 0.15]}><cylinderGeometry args={[0.06, 0.1, 1.2, 5]} /><meshStandardMaterial color={color} roughness={0.9} flatShading /></mesh>
        <mesh position={[0.15, 1.5, 0.1]} rotation={[0, 0.4, 0.3]}><cylinderGeometry args={[0.04, 0.07, 0.8, 5]} /><meshStandardMaterial color={color} roughness={0.9} flatShading /></mesh>
        <mesh position={[-0.12, 1.4, -0.08]} rotation={[0.2, -0.3, -0.25]}><cylinderGeometry args={[0.04, 0.06, 0.7, 5]} /><meshStandardMaterial color={color} roughness={0.9} flatShading /></mesh>
        <mesh position={[0.15, 1.9, 0.1]}><sphereGeometry args={[0.08, 6, 4]} /><meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} /></mesh>
        <mesh position={[-0.12, 1.75, -0.08]}><sphereGeometry args={[0.06, 6, 4]} /><meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} /></mesh>
    </group>
);

const UnderwaterFlora: React.FC = () => (
    <>
        <KelpField />
        {CORAL_POSITIONS.map(([x, z, color, s], i) => (
            <Coral key={`coral-${i}`} x={x} z={z} color={color} scale={s} />
        ))}
    </>
);

// ═══════════════════════════════════════════════════════════════════════
// God Ray Shafts
// ═══════════════════════════════════════════════════════════════════════

const GodRayShafts: React.FC = () => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.04;
    });
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2;
                const r = 0.5 + (i % 2) * 1.0;
                return (
                    <mesh key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]} rotation={[0, a, 0]}>
                        <planeGeometry args={[1.6 + (i % 3) * 0.4, 28]} />
                        <meshBasicMaterial color="#0c3020" transparent opacity={0.06 + (i % 3) * 0.02} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
                    </mesh>
                );
            })}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Deep Mist
// ═══════════════════════════════════════════════════════════════════════

const DeepMist: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        m.opacity = 0.04 + Math.sin(state.clock.elapsedTime * 0.2) * 0.015;
    });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshBasicMaterial ref={matRef} color="#040808" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Debris Field
// ═══════════════════════════════════════════════════════════════════════

const DebrisField: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(DEBRIS_COUNT).fill(null));
    const data = useRef(
        Array.from({ length: DEBRIS_COUNT }, () => ({
            x: (Math.random() - 0.5) * 50,
            y: -5 + Math.random() * -23,
            z: (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 0.01,
            vy: (Math.random() - 0.5) * 0.005,
            vz: (Math.random() - 0.5) * 0.01,
            seed: Math.random() * 10,
        }))
    );
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const d = data.current[i];
            d.x += (d.vx + Math.sin(t * 0.1 + d.seed) * 0.002) * safeDt;
            d.y += (d.vy + Math.cos(t * 0.08 + d.seed) * 0.001) * safeDt;
            d.z += (d.vz + Math.sin(t * 0.09 + d.seed * 0.7) * 0.002) * safeDt;
            if (d.x < -25) d.x = 25; if (d.x > 25) d.x = -25;
            if (d.y < -29) d.y = -5;
            if (d.z < -25) d.z = 25; if (d.z > 25) d.z = -25;
            const r = refs.current[i];
            if (r) r.position.set(d.x, d.y, d.z);
        }
    });
    return (
        <Instances limit={DEBRIS_COUNT} range={DEBRIS_COUNT} geometry={DEBRIS_GEO}>
            <meshBasicMaterial color="#080808" transparent opacity={0.25} depthWrite={false} />
            {Array.from({ length: DEBRIS_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.015 + Math.random() * 0.03} />
            ))}
        </Instances>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Fish School
// ═══════════════════════════════════════════════════════════════════════

const FishSchool: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>(new Array(FISH_COUNT).fill(null));
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < FISH_COUNT; i++) {
            const f = refs.current[i];
            if (!f) continue;
            const offset = i / FISH_COUNT;
            const radius = 4 + Math.sin(offset * 13.7) * 4.5;
            const speed = 0.18 + offset * 0.12;
            const angle = t * speed + offset * Math.PI * 4;
            const y = -18 + Math.sin(t * 0.7 + offset * 8) * 5 + (offset - 0.5) * 6;
            f.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
            f.rotation.y = -angle + Math.PI / 2;
            f.rotation.z = Math.PI / 2;
            f.rotation.x = Math.sin(t * 6 + offset * 20) * 0.15;
        }
    });
    return (
        <group>
            {Array.from({ length: FISH_COUNT }, (_, i) => (
                <mesh key={i} ref={(r: any) => { refs.current[i] = r; }} geometry={FISH_GEO} scale={0.6 + (i % 3) * 0.25}>
                    <meshStandardMaterial
                        color={i % 3 === 0 ? '#1a2a30' : i % 3 === 1 ? '#0e1a20' : '#162228'}
                        emissive={i % 3 === 0 ? '#081018' : '#060c10'}
                        emissiveIntensity={0.2} roughness={0.8} flatShading
                    />
                </mesh>
            ))}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Plankton Field
// ═══════════════════════════════════════════════════════════════════════

const PlanktonField: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(PLANKTON_COUNT).fill(null));
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < PLANKTON_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            const seed = i * 7.31;
            r.position.x += Math.sin(t * 0.15 + seed) * 0.003;
            r.position.y += Math.cos(t * 0.12 + seed * 1.3) * 0.002;
            r.position.z += Math.sin(t * 0.13 + seed * 0.7) * 0.003;
        }
    });
    return (
        <Instances limit={PLANKTON_COUNT} range={PLANKTON_COUNT} geometry={PLANKTON_GEO}>
            <meshBasicMaterial color="#1a1808" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
            {Array.from({ length: PLANKTON_COUNT }, (_, i) => {
                const x = HOLE_CENTER_X + (Math.random() - 0.5) * 30;
                const y = -3 + Math.random() * -25;
                const z = HOLE_CENTER_Z + (Math.random() - 0.5) * 30;
                return <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} position={[x, y, z]} scale={0.012 + Math.random() * 0.02} />;
            })}
        </Instances>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Bubble Field
// ═══════════════════════════════════════════════════════════════════════

const BubbleField: React.FC = () => {
    const positions = useRef(
        Array.from({ length: BUBBLE_COUNT }, () => ({
            x: HOLE_CENTER_X + (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            y: BUBBLE_MIN_Y + Math.random() * (BUBBLE_MAX_Y - BUBBLE_MIN_Y),
            z: HOLE_CENTER_Z + (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            speed: BUBBLE_RISE * (0.7 + Math.random() * 0.6),
        }))
    );
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(BUBBLE_COUNT).fill(null));

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const pos = positions.current;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const p = pos[i];
            p.y += p.speed * safeDt;
            if (p.y > BUBBLE_MAX_Y) {
                p.y = BUBBLE_MIN_Y;
                p.x = HOLE_CENTER_X + (Math.random() - 0.5) * BUBBLE_RANGE * 2;
                p.z = HOLE_CENTER_Z + (Math.random() - 0.5) * BUBBLE_RANGE * 2;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });

    return (
        <Instances limit={BUBBLE_COUNT} range={BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#2a3a40" transparent opacity={0.2} depthWrite={false} toneMapped={false} />
            {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.03 + Math.random() * 0.05} />
            ))}
        </Instances>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Shard
// ═══════════════════════════════════════════════════════════════════════

const Shard: React.FC<{
    index: number;
    position: readonly [number, number, number];
    collected: boolean;
    onCollect: (i: number) => void;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}> = ({ index, position, collected, onCollect, playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    const collectStartRef = useRef<number | null>(null);
    const { camera } = useThree();

    useFrame((state) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;

        const dxCam = position[0] - camera.position.x;
        const dyCam = position[1] - camera.position.y;
        const dzCam = position[2] - camera.position.z;
        if (dxCam*dxCam + dyCam*dyCam + dzCam*dzCam > 600) {
            g.visible = false; return;
        }

        g.rotation.y = t * 0.7 + index;
        g.rotation.x = Math.sin(t * 0.5 + index) * 0.3;
        g.position.set(position[0], position[1] + Math.sin(t * 1.2 + index) * 0.15, position[2]);

        if (collected) {
            if (collectStartRef.current === null) collectStartRef.current = t;
            const elapsed = t - collectStartRef.current;
            const k = Math.max(0, 1 - elapsed * 2);
            g.scale.setScalar(k);
            if (k <= 0.001) g.visible = false;
            return;
        }
        g.visible = true;
        g.scale.setScalar(1 + Math.sin(t * 2 + index) * 0.05);

        const pp = playerPositionRef.current;
        const dx = position[0] - pp.x;
        const dy = position[1] - pp.y;
        const dz = position[2] - pp.z;
        if (dx*dx + dy*dy + dz*dz < COLLECT_DIST_SQ) onCollect(index);
    });

    return (
        <group ref={groupRef} position={[position[0], position[1], position[2]]}>
            <mesh geometry={SHARD_GEO}>
                <meshStandardMaterial color="#9be8ff" emissive="#5ad8ff" emissiveIntensity={1.5} metalness={0.4} roughness={0.1} toneMapped={false} />
            </mesh>
            <sprite scale={[1.3, 1.3, 1]}>
                <spriteMaterial map={GLOW_TEXTURE} color="#9be8ff" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Elevator shell
// ═══════════════════════════════════════════════════════════════════════

const ElevatorShell: React.FC = () => (
    <group position={[0, 0, -10]}>
        <ElevatorFacade z={0} height={5} width={10} />
        <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color="#1a1612" /></mesh>
        <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
        <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
        <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
    </group>
);

// ═══════════════════════════════════════════════════════════════════════
// Re-export everything the main component needs
// ═══════════════════════════════════════════════════════════════════════

export {
    CrystalCluster, Torch, DustMotes,
    UnderwaterCaustics,
    UnderwaterFlora, GodRayShafts, DeepMist,
    DebrisField, FishSchool, PlanktonField, BubbleField,
    Shard, ElevatorShell,
};
