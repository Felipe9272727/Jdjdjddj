/**
 * Floor2/underwater-effects.tsx — All underwater visual components.
 *
 * Each useFrame early-returns when swimmerY >= SWIM_THRESHOLD_Y so the
 * entire module goes near-zero CPU cost while the player is in the cave.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';

import {
    swimmerY, SWIM_THRESHOLD_Y,
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, WATER_LEVEL_Y,
    DEBRIS_COUNT, SEDIMENT_COUNT, PLANKTON_COUNT, FISH_COUNT,
    BUBBLE_COUNT, BUBBLE_RANGE, BUBBLE_RISE, BUBBLE_MAX_Y, BUBBLE_MIN_Y,
    SURFACE_BUBBLE_COUNT, SURFACE_BUBBLE_RING_RADIUS,
    COLLECT_DIST_SQ, SHARD_POSITIONS,
    KELP_POSITIONS, CORAL_POSITIONS,
} from './constants';
import {
    GLOW_TEXTURE,
    BUBBLE_GEO, SHARD_GEO, KELP_GEO, FISH_GEO, DEBRIS_GEO, PLANKTON_GEO, GOD_RAY_GEO,
} from './geometry';
import { CausticsMaterial } from './shaders';

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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
        (mat as any).time = state.clock.elapsedTime;
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.15, 1.5, 0.1]} rotation={[0, 0.4, 0.3]}>
            <cylinderGeometry args={[0.04, 0.07, 0.8, 5]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.12, 1.4, -0.08]} rotation={[0.2, -0.3, -0.25]}>
            <cylinderGeometry args={[0.04, 0.06, 0.7, 5]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.9} flatShading />
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
        const t = state.clock.elapsedTime;
        if (groupRef.current) groupRef.current.rotation.y = t * 0.04;

        let proximity = 0.4;
        if (playerPositionRef) {
            const p = playerPositionRef.current;
            const dx = p.x - HOLE_CENTER_X;
            const dz = p.z - HOLE_CENTER_Z;
            const horizDist = Math.sqrt(dx * dx + dz * dz);
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
        const t = state.clock.elapsedTime;
        if (mat1.current) mat1.current.opacity = 0.05 + Math.sin(t * 0.20) * 0.015;
        if (mat2.current) mat2.current.opacity = 0.045 + Math.sin(t * 0.16 + 1.3) * 0.012;
        if (mat3.current) mat3.current.opacity = 0.04 + Math.sin(t * 0.13 + 2.7) * 0.012;
        if (g1.current) g1.current.rotation.y = t * 0.012;
        if (g2.current) g2.current.rotation.y = -t * 0.009 + 1.0;
        if (g3.current) g3.current.rotation.y = t * 0.007 + 2.0;
    });
    return (
        <>
            <group ref={g1}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]}>
                    <planeGeometry args={[70, 70]} />
                    <meshBasicMaterial ref={mat1} color="#0a1a30" transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
            </group>
            <group ref={g2}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
                    <planeGeometry args={[80, 80]} />
                    <meshBasicMaterial ref={mat2} color="#061a2a" transparent opacity={0.045} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
            </group>
            {reflective && (
                <group ref={g3}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -23, 0]}>
                        <planeGeometry args={[90, 90]} />
                        <meshBasicMaterial ref={mat3} color="#040810" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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

// ─── FishSchool — Boids-based AI fish school with shark predator evasion ─
const FISH_PALETTE: { color: string; emissive: string; intensity: number; glow: boolean }[] = [
    { color: '#1a2a30', emissive: '#081018', intensity: 0.2, glow: false },
    { color: '#0e1a20', emissive: '#060c10', intensity: 0.2, glow: false },
    { color: '#162228', emissive: '#0a1218', intensity: 0.2, glow: false },
    { color: '#2a4a5e', emissive: '#1a4a6e', intensity: 1.6, glow: true },
    { color: '#3a2a4e', emissive: '#5a1a8a', intensity: 1.4, glow: true },
    { color: '#1a3e3a', emissive: '#0aa888', intensity: 1.5, glow: true },
];

// Boids parameters
const BOIDS_CRUISE   = 3.2;
const BOIDS_FLEE     = 10.0;
const BOIDS_SEP_R    = 2.2;
const BOIDS_VIEW_R   = 7.0;
const BOIDS_SHARK_R  = 18.0;
const BOIDS_BOUND_R  = 13.0;
const BOIDS_CENTER_X = 0;
const BOIDS_CENTER_Y = -18;
const BOIDS_CENTER_Z = 5;

export const FishSchool: React.FC<{ monsterPositionRef?: React.MutableRefObject<THREE.Vector3> }> = ({ monsterPositionRef }) => {
    const refs       = useRef<(THREE.Mesh | null)[]>(new Array(FISH_COUNT).fill(null));
    const spriteRefs = useRef<(THREE.Sprite | null)[]>(new Array(FISH_COUNT).fill(null));

    // Boids state — pre-allocated Vector3 arrays, never re-created per frame
    const bPos = useRef<THREE.Vector3[]>(
        Array.from({ length: FISH_COUNT }, (_, i) => new THREE.Vector3(
            Math.cos(i / FISH_COUNT * Math.PI * 2) * 6,
            -18 + (i % 6) * 2.0,
            Math.sin(i / FISH_COUNT * Math.PI * 2) * 6,
        ))
    );
    const bVel = useRef<THREE.Vector3[]>(
        Array.from({ length: FISH_COUNT }, (_, i) => new THREE.Vector3(
            Math.cos(i * 2.3) * BOIDS_CRUISE * 0.5,
            (Math.sin(i * 1.7) - 0.5) * 0.3,
            Math.sin(i * 2.3) * BOIDS_CRUISE * 0.5,
        ))
    );
    const _steer = useRef(new THREE.Vector3());
    // Per-fish cached steering force. The O(n²) neighbour scan is time-sliced:
    // each frame only half the flock (alternating parity) recomputes its force,
    // the rest reuse last frame's — every fish still integrates + renders every
    // frame, so motion stays smooth at half the perception cost.
    const bSteer = useRef<THREE.Vector3[]>(
        Array.from({ length: FISH_COUNT }, () => new THREE.Vector3())
    );
    const bFleeing = useRef<boolean[]>(new Array(FISH_COUNT).fill(false));
    const frameParity = useRef(0);

    useFrame((state, dt) => {
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        const sharkPos = monsterPositionRef?.current;
        const sharkActive = !!sharkPos && sharkPos.y < SWIM_THRESHOLD_Y;
        const parity = frameParity.current;
        frameParity.current ^= 1;

        for (let i = 0; i < FISH_COUNT; i++) {
            const pos = bPos.current[i];
            const vel = bVel.current[i];

            // Time-slice: only recompute this fish's steering on its frame.
            // Off-frames reuse the cached force and just keep integrating.
            const recompute = (i & 1) === parity;
            let fleeing = false;
            if (!recompute) {
                _steer.current.copy(bSteer.current[i]);
                fleeing = bFleeing.current[i];
            } else {
            _steer.current.set(0, 0, 0);

            // ── O(n²) Boids — only 18 fish, < 308 pair checks per frame ───────
            let sepX = 0, sepY = 0, sepZ = 0, sepN = 0;
            let aliX = 0, aliY = 0, aliZ = 0;
            let cohX = 0, cohY = 0, cohZ = 0, viewN = 0;

            for (let j = 0; j < FISH_COUNT; j++) {
                if (i === j) continue;
                const op = bPos.current[j];
                const ov = bVel.current[j];
                const dx = op.x - pos.x, dy = op.y - pos.y, dz = op.z - pos.z;
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 < BOIDS_SEP_R * BOIDS_SEP_R && d2 > 0.0001) {
                    const d = Math.sqrt(d2);
                    const w = 1 / d;
                    sepX -= dx * w; sepY -= dy * w; sepZ -= dz * w;
                    sepN++;
                }
                if (d2 < BOIDS_VIEW_R * BOIDS_VIEW_R) {
                    aliX += ov.x; aliY += ov.y; aliZ += ov.z;
                    cohX += op.x; cohY += op.y; cohZ += op.z;
                    viewN++;
                }
            }

            if (sepN > 0) {
                _steer.current.x += sepX * 1.6;
                _steer.current.y += sepY * 1.6;
                _steer.current.z += sepZ * 1.6;
            }
            if (viewN > 0) {
                const inv = 1 / viewN;
                // Alignment — steer toward average heading
                const al = Math.sqrt(aliX*aliX + aliY*aliY + aliZ*aliZ) * inv + 0.0001;
                _steer.current.x += (aliX * inv / al - vel.x) * 0.7;
                _steer.current.y += (aliY * inv / al - vel.y) * 0.7;
                _steer.current.z += (aliZ * inv / al - vel.z) * 0.7;
                // Cohesion — steer toward center of mass
                const tcx = cohX * inv - pos.x;
                const tcy = cohY * inv - pos.y;
                const tcz = cohZ * inv - pos.z;
                const cd  = Math.sqrt(tcx*tcx + tcy*tcy + tcz*tcz) + 0.0001;
                _steer.current.x += tcx / cd * 0.5;
                _steer.current.y += tcy / cd * 0.5;
                _steer.current.z += tcz / cd * 0.5;
            }

            // ── Shark predator evasion ─────────────────────────────────────────
            if (sharkActive) {
                const sdx = pos.x - sharkPos!.x;
                const sdy = pos.y - sharkPos!.y;
                const sdz = pos.z - sharkPos!.z;
                const sd2 = sdx*sdx + sdy*sdy + sdz*sdz;
                if (sd2 < BOIDS_SHARK_R * BOIDS_SHARK_R && sd2 > 0.0001) {
                    const sd  = Math.sqrt(sd2);
                    const str = (BOIDS_SHARK_R - sd) / BOIDS_SHARK_R * 7.0;
                    _steer.current.x += sdx / sd * str;
                    _steer.current.y += sdy / sd * str;
                    _steer.current.z += sdz / sd * str;
                    fleeing = true;
                }
            }

            // ── Boundary — steer back toward school home ───────────────────────
            const bcx = BOIDS_CENTER_X - pos.x;
            const bcy = BOIDS_CENTER_Y - pos.y;
            const bcz = BOIDS_CENTER_Z - pos.z;
            const bd  = Math.sqrt(bcx*bcx + bcy*bcy + bcz*bcz);
            if (bd > BOIDS_BOUND_R) {
                const str = (bd - BOIDS_BOUND_R) / BOIDS_BOUND_R * 3.0;
                _steer.current.x += bcx / bd * str;
                _steer.current.y += bcy / bd * str;
                _steer.current.z += bcz / bd * str;
            }

            // Cache this frame's freshly computed force for the off-frame reuse.
            bSteer.current[i].copy(_steer.current);
            bFleeing.current[i] = fleeing;
            } // end recompute

            // ── Integrate ────────────────────────────────────────────────────
            vel.x += _steer.current.x * safeDt * 6;
            vel.y += _steer.current.y * safeDt * 6;
            vel.z += _steer.current.z * safeDt * 6;
            const spd    = Math.sqrt(vel.x*vel.x + vel.y*vel.y + vel.z*vel.z);
            const maxSpd = fleeing ? BOIDS_FLEE : BOIDS_CRUISE;
            if (spd > maxSpd) { const sc = maxSpd / spd; vel.x *= sc; vel.y *= sc; vel.z *= sc; }
            else if (spd < 0.5 && !fleeing) { const sc = 0.5 / (spd + 0.0001); vel.x *= sc; vel.y *= sc; vel.z *= sc; }
            pos.x += vel.x * safeDt;
            pos.y += vel.y * safeDt;
            pos.z += vel.z * safeDt;

            // ── Update mesh ───────────────────────────────────────────────────
            const m = refs.current[i];
            if (m) {
                m.position.copy(pos);
                m.rotation.y = -Math.atan2(vel.z, vel.x) + Math.PI / 2;
                m.rotation.z = Math.PI / 2;
                m.rotation.x = Math.sin(t * 6 + i * 20) * 0.12;
            }
            const sp = spriteRefs.current[i];
            if (sp) sp.position.copy(pos);
        }
    });

    return (
        <group>
            {Array.from({ length: FISH_COUNT }, (_, i) => {
                const seed    = Math.sin(i * 12.93) * 0.5 + 0.5;
                const scale   = 0.38 + seed * 0.72;
                const palette = FISH_PALETTE[i % FISH_PALETTE.length];
                return (
                    <React.Fragment key={i}>
                        <mesh ref={(r: any) => { refs.current[i] = r; }} geometry={FISH_GEO} scale={scale}>
                            <meshStandardMaterial
                                color={palette.color}
                                emissive={palette.emissive}
                                emissiveIntensity={palette.intensity}
                                roughness={0.8}
                                flatShading
                                toneMapped={!palette.glow}
                            />
                        </mesh>
                        {palette.glow && (
                            <sprite ref={(r: any) => { spriteRefs.current[i] = r; }} scale={[scale * 1.8, scale * 1.8, 1]}>
                                <spriteMaterial map={GLOW_TEXTURE} color={palette.emissive} transparent opacity={0.40} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
            <meshBasicMaterial color="#7ac8e0" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
            <meshBasicMaterial color="#9adce8" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) return;
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
        if (swimmerY.current >= SWIM_THRESHOLD_Y) { if (groupRef.current) groupRef.current.visible = false; return; }
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
                <meshStandardMaterial color="#9be8ff" emissive="#5ad8ff" emissiveIntensity={1.5} metalness={0.4} roughness={0.1} toneMapped={false} />
            </mesh>
            <sprite scale={[1.3, 1.3, 1]}>
                <spriteMaterial map={GLOW_TEXTURE} color="#9be8ff" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};

// ─── ShardField — single useFrame manages all collectible shards ───────
interface ShardFieldProps {
    collectedShards: Set<number>;
    onCollectShard: (i: number) => void;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}
export const ShardField: React.FC<ShardFieldProps> = ({ collectedShards, onCollectShard, playerPositionRef }) => {
    const groupRefs = useRef<(THREE.Group | null)[]>(new Array(SHARD_POSITIONS.length).fill(null));
    const collectStartRefs = useRef<(number | null)[]>(new Array(SHARD_POSITIONS.length).fill(null));
    const { camera } = useThree();

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const pp = playerPositionRef.current;

        for (let index = 0; index < SHARD_POSITIONS.length; index++) {
            const g = groupRefs.current[index];
            if (!g) continue;

            const position = SHARD_POSITIONS[index];
            const dxCam = position[0] - camera.position.x;
            const dyCam = position[1] - camera.position.y;
            const dzCam = position[2] - camera.position.z;
            if (dxCam*dxCam + dyCam*dyCam + dzCam*dzCam > 600) {
                g.visible = false;
                continue;
            }

            const collected = collectedShards.has(index);
            if (collected) {
                if (collectStartRefs.current[index] === null) collectStartRefs.current[index] = t;
                const elapsed = t - (collectStartRefs.current[index] as number);
                const k = Math.max(0, 1 - elapsed * 2);
                g.scale.setScalar(k);
                if (k <= 0.001) g.visible = false;
                continue;
            }

            g.visible = true;
            g.rotation.y = t * 0.7 + index;
            g.rotation.x = Math.sin(t * 0.5 + index) * 0.3;
            g.position.set(position[0], position[1] + Math.sin(t * 1.2 + index) * 0.15, position[2]);
            g.scale.setScalar(1 + Math.sin(t * 2 + index) * 0.05);

            const dx = position[0] - pp.x;
            const dy = position[1] - pp.y;
            const dz = position[2] - pp.z;
            if (dx*dx + dy*dy + dz*dz < COLLECT_DIST_SQ) onCollectShard(index);
        }
    });

    return (
        <group>
            {SHARD_POSITIONS.map((position, index) => (
                <group key={index} ref={(r: any) => { groupRefs.current[index] = r; }} position={[position[0], position[1], position[2]]} scale={0.85}>
                    <mesh geometry={SHARD_GEO}>
                        <meshStandardMaterial color="#44ddff" emissive="#00ccff" emissiveIntensity={2.2} metalness={0.5} roughness={0.08} toneMapped={false} />
                    </mesh>
                    {/* inner tight glow */}
                    <sprite scale={[1.1, 1.1, 1]}>
                        <spriteMaterial map={GLOW_TEXTURE} color="#00eeff" transparent opacity={0.55} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                    </sprite>
                    {/* outer aura — visible from distance */}
                    <sprite scale={[3.2, 3.2, 1]}>
                        <spriteMaterial map={GLOW_TEXTURE} color="#0088cc" transparent opacity={0.18} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                    </sprite>
                </group>
            ))}
        </group>
    );
};
