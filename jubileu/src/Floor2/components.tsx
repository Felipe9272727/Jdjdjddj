/**
 * Floor2/components.tsx — All React sub-components used by Floor2Environment.
 *
 * Organized by visual layer:
 *   1. Cave features (crystals, torches, dust)
 *   2. Water effects (surface, ceiling disc, occluder, overlay, fog)
 *   3. Underwater effects (caustics, flora, god rays, mist, particles, fish, shards)
 */

import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    DUST_COUNT, DEBRIS_COUNT, SEDIMENT_COUNT, PLANKTON_COUNT, FISH_COUNT,
    BUBBLE_COUNT, BUBBLE_RANGE, BUBBLE_RISE, BUBBLE_MAX_Y, BUBBLE_MIN_Y,
    SURFACE_BUBBLE_COUNT, SURFACE_BUBBLE_RING_RADIUS,
    COLLECT_DIST_SQ,
    CRYSTALS, TORCH_POSITIONS,
    UW_BOULDERS, UW_PEBBLES, UW_SCATTERED_ROCKS,
    UW_CORAL_PILLARS, UW_ARCHES,
    KELP_POSITIONS, CORAL_POSITIONS,
} from './constants';

import {
    GLOW_TEXTURE,
    BUBBLE_GEO, SHARD_GEO, PEBBLE_GEO, CRYSTAL_GEO,
    KELP_GEO, FISH_GEO, DEBRIS_GEO, PLANKTON_GEO, GOD_RAY_GEO,
    PROC_STALAGMITE_GEOS, PROC_STALACTITE_GEOS,
    PROC_ROCK_A, PROC_ROCK_B, PROC_ROCK_C, PROC_ROCK_D,
} from './geometry';

import {
    WaterCeilingMaterial,
    UnderwaterOverlayMaterial,
    WaterMaterial,
    CausticsMaterial,
} from './shaders';

// ═══════════════════════════════════════════════════════════════════════
// 1. CAVE FEATURES
// ═══════════════════════════════════════════════════════════════════════

// ─── CrystalCluster — colored emissive octahedra with glow sprites ────
export const CrystalCluster: React.FC<{ x: number; y: number; z: number; color: string }> = ({ x, y, z, color }) => (
    <group position={[x, y, z]}>
        <mesh geometry={CRYSTAL_GEO} rotation={[0.3, 0.8, 0]} scale={1.4}>
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={2.2}
                metalness={0.55}
                roughness={0.15}
                toneMapped={false}
            />
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
        {/* Round glow halo — additive sprite */}
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        {/* Bigger soft outer glow for atmospheric pool of light */}
        <sprite scale={[5.0, 5.0, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.12} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
    </group>
);

// ─── Torch — warm wall-mounted flame with flicker ────────────────────
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

// ═══════════════════════════════════════════════════════════════════════
// 2. WATER EFFECTS
// ═══════════════════════════════════════════════════════════════════════

// ─── WaterSurface — Gerstner wave plane ───────────────────────────────
interface WaterSurfaceProps {
    reflective?: boolean;
}
export const WaterSurface: React.FC<WaterSurfaceProps> = ({ reflective = false }) => {
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
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
                    <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05]} />
                    {/* Tuned for "dark water reflective bowl" feel — mirror
                        coefficient way up so torch/diver light bounces back
                        clearly, blur reduced so the reflection is recognizable
                        without being mirror-perfect (real water is messy). */}
                    <MeshReflectorMaterial
                        blur={[200, 60]}
                        resolution={768}
                        mixBlur={0.7}
                        mixStrength={2.2}
                        roughness={0.35}
                        depthScale={0.6}
                        minDepthThreshold={0.3}
                        maxDepthThreshold={1.4}
                        color="#06121e"
                        metalness={0.55}
                        mirror={0.95}
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

// ─── WaterCeilingDisc — opaque BackSide disc with ripple shader ───────
export const WaterCeilingDisc: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (WaterCeilingMaterial as any)();
        m.side = THREE.BackSide;
        m.depthWrite = true;
        m.transparent = false;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
    });
    return (
        <mesh
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.1, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.15, 48]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── DynamicFog — depth-based color absorption (Beer-Lambert style) ───
export const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    const _surfaceFog = new THREE.Color('#0a2a50');
    const _midFog = new THREE.Color('#061a3a');
    const _deepFog = new THREE.Color('#03102a');
    const _caveFog = new THREE.Color('#0e0a08');
    const _surfaceBg = new THREE.Color('#0a2a50');
    const _midBg = new THREE.Color('#061a3a');
    const _deepBg = new THREE.Color('#03102a');
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
            scene.fog.near = scene.fog.near + (8 - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (70 - scene.fog.far) * k;
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
            const baseNear = 1.5 - t * 0.6;
            const baseFar = 20 - t * 8;
            const tgtNear = Math.max(0.5, baseNear + breathe * 0.1);
            const tgtFar = Math.max(8, baseFar + breathe * 0.5);

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

// ─── UnderwaterOverlay — camera-following tint + caustic ──────────────
export const UnderwaterOverlay: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const mat = useMemo(() => {
        const m = new (UnderwaterOverlayMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.depthTest = false;
        m.renderOrder = 999;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        const y = playerPositionRef.current?.y ?? 0;
        const isUnderwater = y < SWIM_THRESHOLD_Y;
        const m = meshRef.current;
        if (m) {
            m.visible = isUnderwater;
            if (isUnderwater) {
                m.position.copy(state.camera.position);
                m.quaternion.copy(state.camera.quaternion);
                m.translateZ(-0.3);
            }
        }
        (mat as any).time = state.clock.elapsedTime;
        (mat as any).depth = Math.min(Math.abs(y - SWIM_THRESHOLD_Y) / 29, 1);
    });
    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[1.6, 1.6]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── WaterOccluder — depth-only mesh that blocks X-ray from underwater ──
export const WaterOccluder: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        const m = meshRef.current;
        if (m) {
            m.visible = playerPositionRef.current.y < SWIM_THRESHOLD_Y;
        }
    });
    return (
        <mesh
            ref={meshRef}
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.05, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={-1}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.3, 48]} />
            <meshBasicMaterial colorWrite={false} depthWrite={true} transparent={false} side={THREE.DoubleSide} />
        </mesh>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// 3. UNDERWATER EFFECTS
// ═══════════════════════════════════════════════════════════════════════

// ─── UnderwaterCaustics ───────────────────────────────────────────────
export const UnderwaterCaustics: React.FC<{ playerPositionRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const mat = useMemo(() => {
        const m = new (CausticsMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.toneMapped = false;
        return m;
    }, []);
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
        // Fade caustic intensity based on player depth — strong when shallow,
        // dim deep down where the light wouldn't reach.
        if (playerPositionRef && meshRef.current) {
            const y = playerPositionRef.current.y;
            const depth = Math.min(Math.max(-y / 29, 0), 1);
            const baseAlpha = 1.0 - depth * 0.55;
            (meshRef.current.material as any).opacity = baseAlpha;
        }
    });
    return (
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -29.95, 0]}>
            <planeGeometry args={[80, 80]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── KelpField — single useFrame driving all kelp ─────────────────────
export const KelpField: React.FC = () => {
    const meshRefs = useRef<(THREE.Mesh | null)[][]>(
        KELP_POSITIONS.map(() => new Array(3).fill(null))
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let k = 0; k < KELP_POSITIONS.length; k++) {
            const phase = KELP_POSITIONS[k][3];
            const segments = 3;
            for (let i = 0; i < segments; i++) {
                const m = meshRefs.current[k]?.[i];
                if (!m) continue;
                const swayAmt = (i / segments) * 0.25;
                m.rotation.z = Math.sin(t * 0.6 + phase + i * 0.4) * swayAmt;
                m.rotation.x = Math.cos(t * 0.5 + phase + i * 0.3) * swayAmt * 0.6;
            }
        }
    });
    return (
        <>
            {KELP_POSITIONS.map(([x, z, height, phase], k) => {
                const segments = 3;
                const segLen = height / segments;
                return (
                    <group key={`kelp-${k}`} position={[x, -30, z]}>
                        {Array.from({ length: segments }, (_, i) => (
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
                        <mesh
                            position={[0, height * 0.9, 0]}
                            rotation={[0.3 + Math.sin(phase) * 0.2, phase, 0.1]}
                            scale={[0.6, 0.3, 0.02]}
                        >
                            <planeGeometry args={[1, 1]} />
                            <meshStandardMaterial color="#0c0f06" roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.85} />
                        </mesh>
                    </group>
                );
            })}
        </>
    );
};

// ─── Coral ────────────────────────────────────────────────────────────
export const Coral: React.FC<{ x: number; z: number; color: string; scale: number }> = ({ x, z, color, scale }) => (
    <group position={[x, -30, z]} scale={scale}>
        <mesh position={[0, 0.3, 0]}>
            <dodecahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#0e0a06" roughness={0.95} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[0, 1.0, 0]} rotation={[0.1, 0, 0.15]}>
            <cylinderGeometry args={[0.06, 0.1, 1.2, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.15, 1.5, 0.1]} rotation={[0, 0.4, 0.3]}>
            <cylinderGeometry args={[0.04, 0.07, 0.8, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.12, 1.4, -0.08]} rotation={[0.2, -0.3, -0.25]}>
            <cylinderGeometry args={[0.04, 0.06, 0.7, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.15, 1.9, 0.1]}>
            <sphereGeometry args={[0.08, 6, 4]} />
            <meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} />
        </mesh>
        <mesh position={[-0.12, 1.75, -0.08]}>
            <sphereGeometry args={[0.06, 6, 4]} />
            <meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} />
        </mesh>
    </group>
);

// ─── UnderwaterFlora ──────────────────────────────────────────────────
export const UnderwaterFlora: React.FC = () => (
    <>
        <KelpField />
        {CORAL_POSITIONS.map(([x, z, color, s], i) => (
            <Coral key={`coral-${i}`} x={x} z={z} color={color} scale={s} />
        ))}
    </>
);

// ─── GodRayShafts — Subnautica-style light shafts ─────────────────────
interface GodRayShaftsProps {
    playerPositionRef?: React.MutableRefObject<THREE.Vector3>;
}
export const GodRayShafts: React.FC<GodRayShaftsProps> = ({ playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    const shaftMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const outerConeMat = useRef<THREE.MeshBasicMaterial>(null);
    const innerConeMat = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (groupRef.current) groupRef.current.rotation.y = t * 0.04;

        // If we have player position, drive the opacity so the shafts
        // POP when the player is directly under the hole (the most
        // dramatic angle: looking up at the sun-shaft).
        let proximity = 0.4; // default "background" intensity
        if (playerPositionRef) {
            const p = playerPositionRef.current;
            const dx = p.x - HOLE_CENTER_X;
            const dz = p.z - HOLE_CENTER_Z;
            const horizDist = Math.sqrt(dx * dx + dz * dz);
            // 1 when directly under the hole, fades to 0.3 by 15 units away
            proximity = 0.3 + Math.max(0, 1 - horizDist / 15) * 0.7;
        }

        const breathe = 0.85 + 0.15 * Math.sin(t * 0.6);
        for (let i = 0; i < shaftMats.current.length; i++) {
            const m = shaftMats.current[i];
            if (m) {
                const baseOp = 0.16 + (i % 3) * 0.05;
                m.opacity = baseOp * proximity * breathe;
            }
        }
        if (outerConeMat.current) outerConeMat.current.opacity = 0.18 * proximity * breathe;
        if (innerConeMat.current) innerConeMat.current.opacity = 0.14 * proximity * breathe;
    });
    const SHAFT_COUNT = 8;
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            {Array.from({ length: SHAFT_COUNT }, (_, i) => {
                const a = (i / SHAFT_COUNT) * Math.PI * 2;
                const r = 0.5 + (i % 2) * 1.0;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
                        rotation={[0, a, 0]}
                    >
                        <planeGeometry args={[1.6 + (i % 3) * 0.4, 28]} />
                        <meshBasicMaterial
                            ref={(r: any) => { shaftMats.current[i] = r; }}
                            color="#3aa8d0"
                            transparent
                            opacity={0.16 + (i % 3) * 0.05}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            toneMapped={false}
                        />
                    </mesh>
                );
            })}
            {/* Bright spot near the surface — narrow cone of light from the hole */}
            <mesh position={[0, 10, 0]}>
                <coneGeometry args={[2.5, 14, 16, 1, true]} />
                <meshBasicMaterial
                    ref={outerConeMat}
                    color="#5acce0"
                    transparent
                    opacity={0.18}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            {/* Secondary inner cone — brighter core */}
            <mesh position={[0, 8, 0]}>
                <coneGeometry args={[1.2, 10, 12, 1, true]} />
                <meshBasicMaterial
                    ref={innerConeMat}
                    color="#a0e0f0"
                    transparent
                    opacity={0.14}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
};

// ─── DeepMist — 3 stacked fog planes for parallax depth fog ──────────
export const DeepMist: React.FC<{ reflective?: boolean }> = ({ reflective = false }) => {
    const mat1 = useRef<THREE.MeshBasicMaterial>(null);
    const mat2 = useRef<THREE.MeshBasicMaterial>(null);
    const mat3 = useRef<THREE.MeshBasicMaterial>(null);
    const g1 = useRef<THREE.Group>(null);
    const g2 = useRef<THREE.Group>(null);
    const g3 = useRef<THREE.Group>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (mat1.current) mat1.current.opacity = 0.05 + Math.sin(t * 0.20) * 0.015;
        if (mat2.current) mat2.current.opacity = 0.045 + Math.sin(t * 0.16 + 1.3) * 0.012;
        if (mat3.current) mat3.current.opacity = 0.04 + Math.sin(t * 0.13 + 2.7) * 0.012;
        // Subtle horizontal drift (rotation) — parallax
        if (g1.current) g1.current.rotation.y = t * 0.012;
        if (g2.current) g2.current.rotation.y = -t * 0.009 + 1.0;
        if (g3.current) g3.current.rotation.y = t * 0.007 + 2.0;
    });
    return (
        <>
            {/* Upper mist layer — bluish, near the surface */}
            <group ref={g1}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]}>
                    <planeGeometry args={[70, 70]} />
                    <meshBasicMaterial
                        ref={mat1}
                        color="#0a1a30"
                        transparent
                        opacity={0.05}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </mesh>
            </group>
            {/* Mid mist layer — teal */}
            <group ref={g2}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
                    <planeGeometry args={[80, 80]} />
                    <meshBasicMaterial
                        ref={mat2}
                        color="#061a2a"
                        transparent
                        opacity={0.045}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </mesh>
            </group>
            {/* Deep mist layer — black-purple, only on quality > low */}
            {reflective && (
                <group ref={g3}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -23, 0]}>
                        <planeGeometry args={[90, 90]} />
                        <meshBasicMaterial
                            ref={mat3}
                            color="#040810"
                            transparent
                            opacity={0.04}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                </group>
            )}
        </>
    );
};

// ─── DebrisField — tiny dark specs drifting underwater ────────────────
export const DebrisField: React.FC = () => {
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
            if (d.x < -25) d.x = 25;
            if (d.x > 25) d.x = -25;
            if (d.y < -29) d.y = -5;
            if (d.y < -29) d.y = -3;
            if (d.z < -25) d.z = 25;
            if (d.z > 25) d.z = -25;
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

// ─── FishSchool — small fish swimming in circular paths ───────────────
// Fish are visually varied: some are "glow" fish with bright emissive
// colors that catch the eye, others are darker for background filler.
const FISH_PALETTE: { color: string; emissive: string; intensity: number; glow: boolean }[] = [
    { color: '#1a2a30', emissive: '#081018', intensity: 0.2, glow: false },
    { color: '#0e1a20', emissive: '#060c10', intensity: 0.2, glow: false },
    { color: '#162228', emissive: '#0a1218', intensity: 0.2, glow: false },
    { color: '#2a4a5e', emissive: '#1a4a6e', intensity: 1.6, glow: true },   // teal glower
    { color: '#3a2a4e', emissive: '#5a1a8a', intensity: 1.4, glow: true },   // purple glower
    { color: '#1a3e3a', emissive: '#0aa888', intensity: 1.5, glow: true },   // aqua glower
];
export const FishSchool: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>(new Array(FISH_COUNT).fill(null));
    const spriteRefs = useRef<(THREE.Sprite | null)[]>(new Array(FISH_COUNT).fill(null));
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
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            f.position.set(x, y, z);
            f.rotation.y = -angle + Math.PI / 2;
            f.rotation.z = Math.PI / 2;
            f.rotation.x = Math.sin(t * 6 + offset * 20) * 0.15;
            // Glow sprite follows the fish
            const sp = spriteRefs.current[i];
            if (sp) sp.position.set(x, y, z);
        }
    });
    return (
        <group>
            {Array.from({ length: FISH_COUNT }, (_, i) => {
                // Varied size — wider range for visual variety
                const seed = Math.sin(i * 12.93) * 0.5 + 0.5;
                const scale = 0.45 + seed * 0.9;
                const palette = FISH_PALETTE[i % FISH_PALETTE.length];
                return (
                    <React.Fragment key={i}>
                        <mesh
                            ref={(r: any) => { refs.current[i] = r; }}
                            geometry={FISH_GEO}
                            scale={scale}
                        >
                            <meshStandardMaterial
                                color={palette.color}
                                emissive={palette.emissive}
                                emissiveIntensity={palette.intensity}
                                roughness={0.8}
                                flatShading
                                toneMapped={!palette.glow}
                            />
                        </mesh>
                        {/* Subtle additive glow sprite for the bright "glower" fish */}
                        {palette.glow && (
                            <sprite
                                ref={(r: any) => { spriteRefs.current[i] = r; }}
                                scale={[scale * 1.8, scale * 1.8, 1]}
                            >
                                <spriteMaterial
                                    map={GLOW_TEXTURE}
                                    color={palette.emissive}
                                    transparent
                                    opacity={0.40}
                                    depthWrite={false}
                                    toneMapped={false}
                                    blending={THREE.AdditiveBlending}
                                />
                            </sprite>
                        )}
                    </React.Fragment>
                );
            })}
        </group>
    );
};

// ─── UnderwaterSediment — floating particles for depth perception ─────
export const UnderwaterSediment: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(SEDIMENT_COUNT).fill(null));
    const data = useRef(
        Array.from({ length: SEDIMENT_COUNT }, () => ({
            x: (Math.random() - 0.5) * 56,
            y: -2 + Math.random() * -27,
            z: (Math.random() - 0.5) * 56,
            vx: (Math.random() - 0.5) * 0.008,
            vy: (Math.random() - 0.5) * 0.004,
            vz: (Math.random() - 0.5) * 0.008,
            seed: Math.random() * 10,
        }))
    );
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < SEDIMENT_COUNT; i++) {
            const d = data.current[i];
            d.x += (d.vx + Math.sin(t * 0.08 + d.seed) * 0.002) * safeDt;
            d.y += (d.vy + Math.cos(t * 0.06 + d.seed * 0.7) * 0.001) * safeDt;
            d.z += (d.vz + Math.sin(t * 0.07 + d.seed * 1.3) * 0.002) * safeDt;
            if (d.x < -28) d.x = 28;
            if (d.x > 28) d.x = -28;
            if (d.y < -29) d.y = -2;
            if (d.y > -2) d.y = -29;
            if (d.z < -28) d.z = 28;
            if (d.z > 28) d.z = -28;
            const r = refs.current[i];
            if (r) r.position.set(d.x, d.y, d.z);
        }
    });
    return (
        <Instances limit={SEDIMENT_COUNT} range={SEDIMENT_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#8a9aaa" transparent opacity={0.2} depthWrite={false} />
            {Array.from({ length: SEDIMENT_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.02 + Math.random() * 0.04} />
            ))}
        </Instances>
    );
};

// ─── PlanktonField ────────────────────────────────────────────────────
export const PlanktonField: React.FC = () => {
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
                return (
                    <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} position={[x, y, z]} scale={0.012 + Math.random() * 0.02} />
                );
            })}
        </Instances>
    );
};

// ─── BubbleField — drifting bubbles (underwater) ──────────────────────
export const BubbleField: React.FC = () => {
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
                const h = Math.sin(i * 127.1 + p.y * 311.7) * 43758.5453;
                const hf = h - Math.floor(h);
                p.x = HOLE_CENTER_X + (hf - 0.5) * BUBBLE_RANGE * 2;
                const h2 = Math.sin(i * 269.5 + p.y * 183.3) * 43758.5453;
                const hf2 = h2 - Math.floor(h2);
                p.z = HOLE_CENTER_Z + (hf2 - 0.5) * BUBBLE_RANGE * 2;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });

    return (
        <Instances limit={BUBBLE_COUNT} range={BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial
                color="#7ac8e0"
                transparent
                opacity={0.45}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
            />
            {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.04 + Math.random() * 0.07} />
            ))}
        </Instances>
    );
};

// ─── SurfaceBubbleRing — larger bubbles right at water surface ────────
export const SurfaceBubbleRing: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(SURFACE_BUBBLE_COUNT).fill(null));
    const offsets = useRef(
        Array.from({ length: SURFACE_BUBBLE_COUNT }, (_, i) => ({
            angle: (i / SURFACE_BUBBLE_COUNT) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2,
            r: SURFACE_BUBBLE_RING_RADIUS * (0.6 + Math.sin(i * 13.1) * 0.5 + 0.5) * 0.5,
            phase: i * 1.7,
        }))
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < SURFACE_BUBBLE_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            const o = offsets.current[i];
            const wobble = Math.sin(t * 0.8 + o.phase) * 0.3;
            const a = o.angle + wobble * 0.1;
            r.position.set(
                HOLE_CENTER_X + Math.cos(a) * (o.r + wobble),
                WATER_LEVEL_Y - 0.2 + Math.sin(t * 1.2 + o.phase) * 0.1,
                HOLE_CENTER_Z + Math.sin(a) * (o.r + wobble),
            );
        }
    });
    return (
        <Instances limit={SURFACE_BUBBLE_COUNT} range={SURFACE_BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial
                color="#9adce8"
                transparent
                opacity={0.45}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
            />
            {Array.from({ length: SURFACE_BUBBLE_COUNT }, (_, i) => {
                const s = 0.06 + Math.sin(i * 5.7) * 0.5 * 0.04;
                return <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={s} />;
            })}
        </Instances>
    );
};

// ─── GodRay — volumetric light beam from the water hole ──────────────
export const GodRay: React.FC = () => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    useFrame((state) => {
        if (matRef.current) (matRef.current as any).time = state.clock.elapsedTime;
    });
    return (
        <mesh position={[HOLE_CENTER_X, -10, HOLE_CENTER_Z]} rotation={[0, 0, 0]}>
            <coneGeometry args={[5, 25, 32, 1, true]} />
            <shaderMaterial
                ref={matRef}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                uniforms={{
                    time: { value: 0 },
                    uColor: { value: new THREE.Color('#1a5a8a') },
                }}
                vertexShader={`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `}
                fragmentShader={`
                    uniform float time;
                    uniform vec3 uColor;
                    varying vec2 vUv;
                    void main() {
                        float dist = length(vUv - 0.5) * 2.0;
                        float alpha = smoothstep(1.0, 0.0, dist);
                        alpha *= (1.0 - vUv.y) * 0.5;
                        alpha *= 0.7 + 0.3 * sin(time * 0.5 + vUv.y * 3.0);
                        alpha *= 0.15;
                        gl_FragColor = vec4(uColor, alpha);
                    }
                `}
            />
        </mesh>
    );
};

// ─── GodRays — light shafts from the surface hole ────────────────────
export const GodRays: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame(() => {
        const g = groupRef.current;
        if (g) {
            g.visible = playerPositionRef.current.y < SWIM_THRESHOLD_Y;
        }
    });
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            <mesh geometry={GOD_RAY_GEO} rotation={[0, 0, 0.1]}>
                <meshBasicMaterial color="#1a4a5a" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh geometry={GOD_RAY_GEO} position={[0.5, -2, 0.3]} rotation={[0.05, 0.3, -0.15]} scale={0.7}>
                <meshBasicMaterial color="#1a5a6a" transparent opacity={0.03} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
        </group>
    );
};

// ─── Shard — collectible crystal ──────────────────────────────────────
interface ShardProps {
    index: number;
    position: readonly [number, number, number];
    collected: boolean;
    onCollect: (i: number) => void;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}
export const Shard: React.FC<ShardProps> = ({ index, position, collected, onCollect, playerPositionRef }) => {
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
            g.visible = false;
            return;
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
                <meshStandardMaterial
                    color="#9be8ff"
                    emissive="#5ad8ff"
                    emissiveIntensity={1.5}
                    metalness={0.4}
                    roughness={0.1}
                    toneMapped={false}
                />
            </mesh>
            <sprite scale={[1.3, 1.3, 1]}>
                <spriteMaterial map={GLOW_TEXTURE} color="#9be8ff" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};
