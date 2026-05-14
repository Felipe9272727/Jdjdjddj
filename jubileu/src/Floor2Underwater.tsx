/**
 * Floor2Underwater.tsx — submerged void with rocky terrain.
 *
 * The fiction: stepping out of the elevator drops you into a freezing
 * underwater void. A rocky bottom, a far-away water surface flickering
 * above, drifting bubbles, cyan-tinted lighting that fakes light passing
 * through several meters of water. Five collectible shards are scattered
 * around the terrain.
 *
 * Design rules:
 *  - NEVER use useFrame with non-zero priority (R3F v9 black screen).
 *  - Pre-allocated math objects in useFrame closures (no per-frame allocs).
 *  - Geometries memoized at module scope where possible.
 *  - Total polycount budget aimed at ~5–10k tris for the level so it runs
 *    on mid-range phones with the rest of the game.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import { COLORS } from './constants';

// ─── Shared, memoized geometries ───────────────────────────────────────
const BOULDER_GEO = new THREE.IcosahedronGeometry(1, 1); // 80 tri — looks rocky
const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0); // 20 tri — pebbles
const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);   // ~50 tri per bubble
const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);

// ─── Boulder field positions (hand-tuned to feel scattered, hide shards) ─
// Format: [x, y, z, scale, rotY]
type Boulder = readonly [number, number, number, number, number];
const BOULDERS: readonly Boulder[] = [
    [ 6.0, -0.3,  -8.0, 1.6, 0.3],
    [-9.0,  0.0,   4.5, 2.1, 1.2],
    [12.0, -0.4,   3.0, 1.8, 0.6],
    [ 4.0,  0.1,  12.0, 1.3, 2.0],
    [-5.0, -0.2, -14.0, 2.4, 0.9],
    [16.0,  0.2,   9.0, 1.7, 1.5],
    [-14.0, 0.1, -10.0, 1.9, 2.5],
    [-18.0, -0.3,  5.0, 2.0, 0.4],
    [20.0, -0.1,  -4.0, 1.5, 1.8],
    [-3.0, -0.2,  18.0, 1.4, 1.0],
    [ 9.0,  0.0,  -16.0, 2.3, 0.8],
    [-11.0, 0.1,  14.0, 1.6, 2.2],
    [ 0.0, -0.4,  -22.0, 1.9, 0.5],
    [22.0,  0.0,   12.0, 1.7, 1.1],
    [-20.0, 0.2, -16.0, 2.0, 0.7],
] as const;

// Smaller pebbles scattered around for ground detail
const PEBBLES: readonly Boulder[] = [
    [ 3.0, -0.05,  2.0, 0.4, 0.2],
    [-2.0, -0.05,  6.0, 0.3, 1.5],
    [ 7.0, -0.05, -3.0, 0.5, 0.8],
    [-6.0, -0.05, -2.0, 0.4, 2.1],
    [ 1.5, -0.05, 10.0, 0.35, 0.5],
    [10.0, -0.05,  6.0, 0.45, 1.2],
    [-8.0, -0.05,  9.0, 0.5, 0.9],
    [14.0, -0.05, -2.0, 0.4, 1.8],
    [-12.0, -0.05, 0.0, 0.55, 0.3],
    [ 5.0, -0.05, -10.0, 0.4, 2.4],
    [-4.0, -0.05, 14.0, 0.5, 1.6],
    [13.0, -0.05, 14.0, 0.4, 0.6],
    [-15.0, -0.05, 8.0, 0.35, 2.0],
    [17.0, -0.05, 4.0, 0.5, 1.0],
    [-7.0, -0.05, -8.0, 0.4, 0.4],
    [ 0.0, -0.05, -14.0, 0.45, 1.9],
    [11.0, -0.05, -11.0, 0.4, 0.7],
    [-16.0, -0.05, -3.0, 0.5, 1.3],
    [19.0, -0.05, -10.0, 0.4, 2.3],
    [ 8.0, -0.05, 18.0, 0.45, 0.1],
] as const;

// ─── Water surface — high above, slowly rippling ───────────────────────
const UnderwaterSurface: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        // Subtle opacity wobble — fakes light fluctuating through the water.
        m.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
    });
    return (
        <mesh position={[0, 25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[120, 120]} />
            <meshBasicMaterial
                ref={matRef}
                color="#6ab0d8"
                transparent
                opacity={0.18}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
            />
        </mesh>
    );
};

// ─── Caustics — animated light pattern on the floor ────────────────────
// Pure mesh trick: an additive plane with a color that sweeps slowly via
// material color cycling. No texture, no shader — cheap.
const Caustics: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        const t = state.clock.elapsedTime;
        // Caustic-style flicker: two sine sums with different speeds
        const intensity = 0.10 + Math.sin(t * 1.3) * 0.05 + Math.sin(t * 0.7 + 1.2) * 0.04;
        m.opacity = Math.max(0.05, intensity);
    });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <planeGeometry args={[80, 80, 1, 1]} />
            <meshBasicMaterial
                ref={matRef}
                color="#8fc4e0"
                transparent
                opacity={0.10}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </mesh>
    );
};

// ─── Drifting bubbles — Instances with per-frame Y reset ───────────────
const BUBBLE_COUNT = 32;
const BUBBLE_RANGE = 20; // half-width of the spawn box (XZ)
const BUBBLE_RISE = 0.5; // m/s upward
const BUBBLE_MAX_Y = 22;
const BUBBLE_MIN_Y = -1;

const BubbleField: React.FC = () => {
    // Per-instance state. Plain JS array — small + reused across frames.
    const positions = useRef<{ x: number; y: number; z: number; speed: number }[]>(
        Array.from({ length: BUBBLE_COUNT }, () => ({
            x: (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            y: Math.random() * BUBBLE_MAX_Y,
            z: (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            speed: BUBBLE_RISE * (0.7 + Math.random() * 0.6),
        }))
    );
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(BUBBLE_COUNT).fill(null));

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.05);
        const pos = positions.current;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const p = pos[i];
            p.y += p.speed * safeDt;
            if (p.y > BUBBLE_MAX_Y) {
                // Wrap back to bottom at a new XZ position
                p.y = BUBBLE_MIN_Y;
                p.x = (Math.random() - 0.5) * BUBBLE_RANGE * 2;
                p.z = (Math.random() - 0.5) * BUBBLE_RANGE * 2;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });

    return (
        <Instances limit={BUBBLE_COUNT} range={BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial
                color="#b8e0f0"
                transparent
                opacity={0.35}
                depthWrite={false}
                toneMapped={false}
            />
            {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
                <Instance
                    key={i}
                    ref={(r: any) => { refs.current[i] = r; }}
                    scale={0.03 + Math.random() * 0.05}
                />
            ))}
        </Instances>
    );
};

// ─── Shard ─────────────────────────────────────────────────────────────
// A floating rotating crystal. Glows cyan; collected when the player gets
// within COLLECT_DIST. Calls onCollect with its index so the App can
// increment the counter and avoid double-collecting.
const COLLECT_DIST = 1.4;
const COLLECT_DIST_SQ = COLLECT_DIST * COLLECT_DIST;

interface ShardProps {
    index: number;
    position: readonly [number, number, number];
    collected: boolean;
    onCollect: (index: number) => void;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}

const Shard: React.FC<ShardProps> = ({ index, position, collected, onCollect, playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    const collectStartRef = useRef<number | null>(null);
    const { camera } = useThree();
    const tooFar = useRef(false);

    useFrame((state, dt) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;

        // Distance-cull: skip work when far from the camera. The shards
        // can be 30m+ from the player and the rotate/bob is invisible.
        const dxCam = position[0] - camera.position.x;
        const dzCam = position[2] - camera.position.z;
        if (dxCam * dxCam + dzCam * dzCam > 400) {
            // Past 20m, only update once per second
            if (!tooFar.current) tooFar.current = true;
            // Still hide if collected animation complete
            if (collected && collectStartRef.current && t - collectStartRef.current > 0.6) {
                g.visible = false;
            }
            return;
        }
        tooFar.current = false;

        // Rotate slowly, bob up and down
        g.rotation.y = t * 0.7 + index;
        g.rotation.x = Math.sin(t * 0.5 + index) * 0.3;
        g.position.set(position[0], position[1] + Math.sin(t * 1.2 + index) * 0.15, position[2]);

        // Already collected → play shrink-out animation
        if (collected) {
            if (collectStartRef.current === null) collectStartRef.current = t;
            const elapsed = t - collectStartRef.current;
            const k = Math.max(0, 1 - elapsed * 2); // 0.5s shrink
            g.scale.setScalar(k);
            if (k <= 0.001) g.visible = false;
            return;
        }
        g.visible = true;
        g.scale.setScalar(1 + Math.sin(t * 2 + index) * 0.05);

        // Proximity check
        const pp = playerPositionRef.current;
        const dx = position[0] - pp.x;
        const dz = position[2] - pp.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < COLLECT_DIST_SQ) {
            onCollect(index);
        }
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
            {/* Outer halo — additive sprite */}
            <sprite scale={[1.3, 1.3, 1]}>
                <spriteMaterial
                    color="#9be8ff"
                    transparent
                    opacity={0.35}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
            {/* Local point light so the shard actually lights the rocks
                around it — sells the "magical artifact" feel */}
            <pointLight intensity={0.8} distance={3} decay={1.5} color="#7ad8ff" />
        </group>
    );
};

// ─── Hand-picked shard positions — varied placement so finding them
// requires actually exploring (some near boulders, some far from elevator).
export const SHARD_POSITIONS: readonly (readonly [number, number, number])[] = [
    [  7.5, 0.8,  -7.5],   // behind a near boulder
    [-13.0, 0.6,   4.8],   // far left
    [  3.5, 0.6,  13.5],   // behind player at spawn
    [-18.0, 0.6, -10.0],   // far back-left
    [ 19.5, 0.6,  11.5],   // far right
] as const;

// ─── Full level component ──────────────────────────────────────────────
interface Floor2EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onCollectShard: (index: number) => void;
}

export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
}) => (
    <group>
        {/* Cold, deep-water palette. Very dense fog (5–18m) — most of the
            world is hidden in the gloom; you discover it by walking into it. */}
        <color attach="background" args={['#021420']} />
        <fog attach="fog" args={['#021420', 5, 22]} />

        {/* Lighting: mostly from above (water-surface light) + faint
            bluish ambient. No warm tones — keeps the "cold" feeling. */}
        <ambientLight intensity={0.20} color="#4880a8" />
        <hemisphereLight intensity={0.25} color="#5090b8" groundColor="#0a1620" />
        <directionalLight position={[0, 30, 0]} intensity={0.45} color="#9ec8e0" />

        <UnderwaterSurface />
        <Caustics />
        <BubbleField />

        {/* Rocky floor — large dark plane, slightly bluish */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color="#1a2530" roughness={1} />
        </mesh>

        {/* Big boulders — Instances for cheap rendering */}
        <Instances limit={BOULDERS.length} range={BOULDERS.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#2a3845" roughness={0.95} flatShading />
            {BOULDERS.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* Pebbles for ground detail */}
        <Instances limit={PEBBLES.length} range={PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#202a35" roughness={1} flatShading />
            {PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* 5 collectible shards */}
        {SHARD_POSITIONS.map((pos, i) => (
            <Shard
                key={i}
                index={i}
                position={pos}
                collected={collectedShards.has(i)}
                onCollect={onCollectShard}
                playerPositionRef={playerPositionRef}
            />
        ))}

        {/* Elevator shell back so the player can return. Same placement as
            other levels (z=-10). Walls tinted darker / cooler to match. */}
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
            <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color="#1a2630" /></mesh>
            <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a2630" /></mesh>
            <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a2630" /></mesh>
            <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color="#1a2630" /></mesh>
        </group>
    </group>
);
