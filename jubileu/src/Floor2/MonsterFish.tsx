/**
 * Floor2/MonsterFish.tsx — Procedural deep-sea predator.
 * No GLB / no AnimationMixer — body is sinusoidal geometry updated via
 * useFrame, which keeps the frame cost to O(segments) matrix ops instead
 * of a full skeleton solve.
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UW_ROCK_COLLIDERS, SWIM_THRESHOLD_Y } from './constants';

// ─── AI tuning ─────────────────────────────────────────────────────────────
const PATROL_SPEED   = 2.2;
const HUNT_SPEED_MIN = 3.8;
const HUNT_SPEED_MAX = 9.0;
const LUNGE_SPEED    = 18.0;
const LUNGE_DIST     = 5.5;
const CATCH_DIST     = 1.9;
const REGROUP_TIME   = 3.2;
const AWARENESS_DIST = 42.0;
const SPAWN_POS      = new THREE.Vector3(-22, -20, -22);

type FishState = 'dormant' | 'patrol' | 'hunting' | 'lunge' | 'regroup';

export interface MonsterFishProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onPlayerCaught: () => void;
}

// ─── Geometry helpers ──────────────────────────────────────────────────────

/** Build a tapered cylinder (cone frustum) aligned on Z. */
function makeSeg(rFront: number, rBack: number, len: number, radSeg = 8): THREE.CylinderGeometry {
    const g = new THREE.CylinderGeometry(rFront, rBack, len, radSeg, 1, false);
    // Rotate so the axis is along Z, not Y
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    return g;
}

/** Flat fin: thin scaled box */
function makeFin(w: number, h: number, d: number): THREE.BoxGeometry {
    return new THREE.BoxGeometry(w, h, d);
}

// ─── Materials (shared across all instances) ───────────────────────────────
const DARK_MAT = new THREE.MeshStandardMaterial({
    color: '#050810',
    roughness: 0.88,
    metalness: 0.18,
    toneMapped: false,
});
const BIO_MAT = new THREE.MeshStandardMaterial({
    color: '#002820',
    emissive: '#00ffaa',
    emissiveIntensity: 1.2,
    roughness: 0.6,
    metalness: 0.0,
    toneMapped: false,
});
const EYE_MAT = new THREE.MeshStandardMaterial({
    color: '#ff4400',
    emissive: '#ff6600',
    emissiveIntensity: 2.5,
    roughness: 0.2,
    toneMapped: false,
});
const TOOTH_MAT = new THREE.MeshStandardMaterial({
    color: '#d4d0c8',
    emissive: '#aaaaaa',
    emissiveIntensity: 0.3,
    roughness: 0.5,
    toneMapped: false,
});
const LURE_MAT = new THREE.MeshStandardMaterial({
    color: '#00ffee',
    emissive: '#00ffee',
    emissiveIntensity: 3.0,
    roughness: 0.0,
    toneMapped: false,
});
const STRIPE_MAT = new THREE.MeshStandardMaterial({
    color: '#001a10',
    emissive: '#00dd88',
    emissiveIntensity: 0.9,
    roughness: 0.7,
    toneMapped: false,
});

// ─── Geometry constants (created once) ─────────────────────────────────────
const BODY_SEGS = 10;          // spine segments
const SEG_LEN   = 0.42;        // metres per segment

// Body radii per segment (head → tail)
const BODY_R = [0.55, 0.62, 0.60, 0.55, 0.48, 0.40, 0.32, 0.24, 0.16, 0.10];

// Geometries for each body segment
const BODY_GEOS = BODY_R.map((r, i) =>
    makeSeg(i === 0 ? r * 0.9 : BODY_R[Math.max(0, i - 1)] * 0.98, r, SEG_LEN)
);

// Head = wide flat disc
const HEAD_GEO   = new THREE.SphereGeometry(0.70, 14, 10);
// Jaw = slightly smaller oblate sphere, offset down
const JAW_GEO    = new THREE.SphereGeometry(0.60, 12, 8);
// Eye
const EYE_GEO    = new THREE.SphereGeometry(0.12, 10, 8);
// Tooth
const TOOTH_GEO  = new THREE.ConeGeometry(0.035, 0.18, 5);
// Dorsal fin
const DORSAL_GEO = makeFin(0.06, 0.55, 0.30);
// Pectoral fin
const PECT_GEO   = makeFin(0.55, 0.10, 0.22);
// Tail lobe
const TAIL_GEO   = makeFin(0.06, 0.65, 0.55);
// Lure bulb
const LURE_GEO   = new THREE.SphereGeometry(0.10, 10, 9);
// Lure stalk
const LURE_STALK_GEO = makeSeg(0.025, 0.04, 0.55, 6);
// Bioluminescent stripe: thin box
const STRIPE_GEO = new THREE.BoxGeometry(0.06, 0.06, SEG_LEN * 0.85);

// Precomputed random tooth scales (deterministic)
const TOOTH_SCALES: number[] = [];
for (let i = 0; i < 14; i++) TOOTH_SCALES.push(1 + ((i * 7919) % 100) / 200);

export const MonsterFish: React.FC<MonsterFishProps> = ({
    playerPositionRef,
    collectedShards,
    onPlayerCaught,
}) => {
    // Root group (world position + yaw + pitch)
    const rootRef = useRef<THREE.Group>(null);

    // Per-segment refs for sinusoidal wave
    const segRefs = useRef<(THREE.Group | null)[]>([]);

    // Dorsal + pectoral fin refs (flutter)
    const dorsalRefs = useRef<(THREE.Mesh | null)[]>([]);
    const pectLRef   = useRef<THREE.Mesh>(null);
    const pectRRef   = useRef<THREE.Mesh>(null);

    // Jaw ref (snap during lunge)
    const jawRef       = useRef<THREE.Mesh>(null);
    // Lure light
    const lureLightRef = useRef<THREE.PointLight>(null);
    // Proximity fill
    const fillLightRef = useRef<THREE.PointLight>(null);

    // ── AI state ────────────────────────────────────────────────────────
    const pos      = useRef(SPAWN_POS.clone());
    const vel      = useRef(new THREE.Vector3());
    const state    = useRef<FishState>('dormant');
    const regroup  = useRef(0);
    const lDir     = useRef(new THREE.Vector3());
    const patrolT  = useRef(0);
    const caught   = useRef(false);
    const active   = useRef(false);

    // Temp vectors (avoid GC)
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());

    // Activate when first shard collected
    // (checked inside useFrame to avoid stale closures)

    // ── Main loop ────────────────────────────────────────────────────────
    useFrame(({ clock }, dt) => {
        const g = rootRef.current;
        if (!g) return;

        // Activate once first shard collected
        if (!active.current && collectedShards.size >= 1) {
            active.current = true;
            state.current = 'patrol';
        }

        const playerY = playerPositionRef.current?.y ?? 0;

        if (state.current === 'dormant' || !active.current || playerY >= SWIM_THRESHOLD_Y) {
            g.visible = false;
            return;
        }
        g.visible = true;

        const safeDt = Math.min(dt, 0.05);
        const t = clock.elapsedTime;

        const pp = playerPositionRef.current;
        const px = pp?.x ?? 0, py = pp?.y ?? -10, pz = pp?.z ?? 0;
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dx = px - fx, dy = py - fy, dz = pz - fz;
        const distSq = dx*dx + dy*dy + dz*dz;
        const dist   = Math.sqrt(distSq);

        // ── State transitions ────────────────────────────────────────
        switch (state.current) {
            case 'patrol':
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;
            case 'hunting':
                if (dist < LUNGE_DIST) {
                    _v1.current.set(dx, dy, dz).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    if (fwd.dot(_v1.current) > 0.35 || dist < 2.5) {
                        state.current = 'lunge';
                        lDir.current.set(dx / dist, dy / dist, dz / dist);
                    }
                }
                break;
            case 'lunge':
                if (dist < CATCH_DIST && !caught.current) {
                    caught.current = true;
                    onPlayerCaught();
                }
                if (dist > LUNGE_DIST + 6) {
                    state.current = 'regroup';
                    regroup.current = REGROUP_TIME;
                }
                break;
            case 'regroup':
                regroup.current -= safeDt;
                if (regroup.current <= 0) {
                    state.current = 'hunting';
                    caught.current = false;
                }
                break;
        }

        // ── Movement ─────────────────────────────────────────────────
        switch (state.current) {
            case 'patrol': {
                patrolT.current += safeDt * 0.28;
                const tx = Math.cos(patrolT.current) * 10 + (px - 10);
                const tz = Math.sin(patrolT.current) * 10 + (pz - 10);
                const tY = -17 + Math.sin(patrolT.current * 0.6) * 3;
                _v1.current.set(tx - fx, tY - fy, tz - fz);
                const tl = _v1.current.length();
                if (tl > 0.1) _v1.current.multiplyScalar(PATROL_SPEED / tl);
                vel.current.lerp(_v1.current, safeDt * 1.6);
                break;
            }
            case 'hunting': {
                const speedT = Math.min(1, (dist - LUNGE_DIST) / (AWARENESS_DIST - LUNGE_DIST));
                const speed  = HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                _v1.current.set(dx/dist, dy/dist, dz/dist).multiplyScalar(speed);
                // Rock avoidance
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rd2 = rdx*rdx + rdy*rdy + rdz*rdz;
                    const mr  = rock.r + 2.0;
                    if (rd2 < mr*mr && rd2 > 0.001) {
                        const rd = Math.sqrt(rd2);
                        const str = (mr - rd) / rd * 7;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }
                _v1.current.y += Math.sin(t * 1.3) * 0.5;
                vel.current.lerp(_v1.current, safeDt * 3.2);
                break;
            }
            case 'lunge':
                vel.current.lerp(
                    _v1.current.set(lDir.current.x * LUNGE_SPEED, lDir.current.y * LUNGE_SPEED, lDir.current.z * LUNGE_SPEED),
                    safeDt * 12,
                );
                break;
            case 'regroup':
                vel.current.multiplyScalar(1 - safeDt * 2.2);
                vel.current.lerp(
                    _v1.current.copy(SPAWN_POS).sub(pos.current).normalize().multiplyScalar(2.5),
                    safeDt * 0.9,
                );
                break;
        }

        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -29, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);
        g.position.copy(pos.current);

        // ── Orientation ───────────────────────────────────────────────
        const vl = vel.current.length();
        if (vl > 0.08) {
            const ty = Math.atan2(vel.current.x, vel.current.z);
            const tp = -Math.asin(THREE.MathUtils.clamp(vel.current.y / vl, -1, 1));
            let yd = ty - g.rotation.y;
            while (yd >  Math.PI) yd -= Math.PI * 2;
            while (yd < -Math.PI) yd += Math.PI * 2;
            const kYaw   = state.current === 'lunge' ? safeDt * 14 : safeDt * 3.5;
            const kPitch = state.current === 'lunge' ? safeDt * 14 : safeDt * 2.5;
            g.rotation.y += yd * kYaw;
            g.rotation.x += (tp - g.rotation.x) * kPitch;
        }

        // ── Body wave animation ───────────────────────────────────────
        const waveFreq   = state.current === 'lunge' ? 8.0 : state.current === 'hunting' ? 5.5 : 2.8;
        const waveAmp    = state.current === 'lunge' ? 0.30 : 0.18;
        const waveOffset = 0.55; // phase shift per segment

        for (let i = 0; i < BODY_SEGS; i++) {
            const seg = segRefs.current[i];
            if (!seg) continue;
            const phase = t * waveFreq - i * waveOffset;
            // Tail segments get stronger swing, head barely moves
            const amp = waveAmp * (i / BODY_SEGS) * (1 + (i / BODY_SEGS));
            seg.rotation.y = Math.sin(phase) * amp;
            // Very slight vertical undulation
            seg.rotation.x = Math.sin(phase * 0.5 + 0.4) * amp * 0.25;
        }

        // ── Jaw animation (snap open during lunge) ────────────────────
        if (jawRef.current) {
            const jawTarget = state.current === 'lunge' ? 0.28 : 0.0;
            jawRef.current.rotation.x += (jawTarget - jawRef.current.rotation.x) * safeDt * 10;
        }

        // ── Fin flutter ───────────────────────────────────────────────
        const finFlap = Math.sin(t * waveFreq * 0.7 + 1.1) * 0.20;
        for (let i = 0; i < dorsalRefs.current.length; i++) {
            const d = dorsalRefs.current[i];
            if (d) d.rotation.z = finFlap * (i % 2 === 0 ? 1 : -1);
        }
        if (pectLRef.current) pectLRef.current.rotation.z =  0.35 + Math.sin(t * waveFreq * 0.8) * 0.18;
        if (pectRRef.current) pectRRef.current.rotation.z = -0.35 - Math.sin(t * waveFreq * 0.8) * 0.18;

        // ── Lure pulse ────────────────────────────────────────────────
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);
        const lurePulse = 0.6 + Math.sin(t * 2.8) * 0.4 + proximity * 1.2;
        if (lureLightRef.current) lureLightRef.current.intensity = lurePulse;
        if (fillLightRef.current) fillLightRef.current.intensity = proximity * 3.0;
    });

    // ── Segment ref setter ────────────────────────────────────────────
    const setSegRef = useCallback((i: number) => (el: THREE.Group | null) => {
        segRefs.current[i] = el;
    }, []);
    const setDorsalRef = useCallback((i: number) => (el: THREE.Mesh | null) => {
        dorsalRefs.current[i] = el;
    }, []);

    // ── Build spine positions ────────────────────────────────────────
    // Each segment sits at z = i * SEG_LEN behind the head (negative Z = forward in model space)
    const segPositions = useMemo(
        () => Array.from({ length: BODY_SEGS }, (_, i) => new THREE.Vector3(0, 0, -(i + 0.5) * SEG_LEN)),
        [],
    );

    // Tooth positions around the jaw
    const toothPositions = useMemo(() => {
        const pts: Array<[number, number, number, number]> = [];
        const LOWER = 8, UPPER = 6;
        for (let i = 0; i < LOWER; i++) {
            const a = (i / LOWER) * Math.PI;
            pts.push([Math.sin(a) * 0.42, -0.12 + Math.abs(Math.sin(a)) * 0.10, Math.cos(a) * 0.30 + 0.15, 0]); // lower
        }
        for (let i = 0; i < UPPER; i++) {
            const a = (i / UPPER) * Math.PI;
            pts.push([Math.sin(a) * 0.38, 0.18 - Math.abs(Math.sin(a)) * 0.08, Math.cos(a) * 0.26 + 0.15, 1]); // upper
        }
        return pts;
    }, []);

    // Dorsal fin positions (along spine, alternating)
    const dorsalPositions = useMemo(() =>
        [2, 3, 4, 5].map(i => ({
            z: -(i + 0.5) * SEG_LEN,
            side: i % 2 === 0 ? 0.06 : -0.06,
            h: BODY_R[i] + 0.12 + (i < 3 ? 0.18 : 0.0),
        })),
    []);

    // Bioluminescent stripe positions (one per side)
    const stripePositions = useMemo(() =>
        Array.from({ length: 6 }, (_, i) => ({
            x: BODY_R[i + 2] * 0.72,
            z: -(i + 2.5) * SEG_LEN,
        })),
    []);

    return (
        <group ref={rootRef} visible={false}>
            {/* ── Head ──────────────────────────────────────────────── */}
            <mesh geometry={HEAD_GEO} material={DARK_MAT} scale={[1.45, 0.80, 1.12]} position={[0, 0.04, 0.30]} />

            {/* ── Jaw ───────────────────────────────────────────────── */}
            <mesh ref={jawRef} geometry={JAW_GEO} material={DARK_MAT} scale={[1.38, 0.55, 1.05]} position={[0, -0.22, 0.28]} />

            {/* ── Teeth ─────────────────────────────────────────────── */}
            {toothPositions.map(([x, y, z, upper], i) => (
                <mesh
                    key={`t${i}`}
                    geometry={TOOTH_GEO}
                    material={TOOTH_MAT}
                    position={[x, y, z]}
                    rotation={[upper ? Math.PI : 0, 0, 0]}
                    scale={[1, TOOTH_SCALES[i] ?? 1, 1]}
                />
            ))}

            {/* ── Eyes ──────────────────────────────────────────────── */}
            <mesh geometry={EYE_GEO} material={EYE_MAT} position={[ 0.36, 0.18, 0.25]} />
            <mesh geometry={EYE_GEO} material={EYE_MAT} position={[-0.36, 0.18, 0.25]} />
            {/* Inner pupil darkness */}
            <mesh geometry={EYE_GEO} material={DARK_MAT} scale={0.55} position={[ 0.40, 0.18, 0.30]} />
            <mesh geometry={EYE_GEO} material={DARK_MAT} scale={0.55} position={[-0.40, 0.18, 0.30]} />

            {/* ── Anglerfish lure ────────────────────────────────────── */}
            {/* Stalk */}
            <mesh
                geometry={LURE_STALK_GEO}
                material={DARK_MAT}
                position={[0, 0.58, 0.20]}
                rotation={[0.55, 0, 0]}
            />
            <mesh geometry={LURE_GEO} material={LURE_MAT} position={[0, 0.95, -0.08]} />
            <pointLight
                ref={lureLightRef}
                position={[0, 0.95, -0.08]}
                color="#00ffee"
                intensity={1.0}
                distance={9}
                decay={2}
            />

            {/* ── Pectoral fins ─────────────────────────────────────── */}
            <mesh ref={pectLRef} geometry={PECT_GEO} material={DARK_MAT} position={[ 0.70, -0.05, -0.20]} rotation={[0.12, 0.0, 0.35]} scale={[1, 1, 1.6]} />
            <mesh ref={pectRRef} geometry={PECT_GEO} material={DARK_MAT} position={[-0.70, -0.05, -0.20]} rotation={[0.12, 0.0,-0.35]} scale={[1, 1, 1.6]} />

            {/* ── Body spine (segmented chain) ──────────────────────── */}
            {Array.from({ length: BODY_SEGS }, (_, i) => (
                <group key={`seg${i}`} ref={setSegRef(i)} position={segPositions[i]}>
                    <mesh geometry={BODY_GEOS[i]} material={DARK_MAT} />
                    {/* Bioluminescent stripe on each body segment */}
                    <mesh
                        geometry={STRIPE_GEO}
                        material={STRIPE_MAT}
                        position={[BODY_R[i] * 0.78, -BODY_R[i] * 0.55, 0]}
                    />
                    <mesh
                        geometry={STRIPE_GEO}
                        material={STRIPE_MAT}
                        position={[-BODY_R[i] * 0.78, -BODY_R[i] * 0.55, 0]}
                    />
                </group>
            ))}

            {/* ── Dorsal fins (along back) ──────────────────────────── */}
            {dorsalPositions.map((d, i) => (
                <mesh
                    key={`df${i}`}
                    ref={setDorsalRef(i)}
                    geometry={DORSAL_GEO}
                    material={DARK_MAT}
                    position={[d.side, d.h, d.z]}
                    scale={[1.0, 1.0 + i * 0.08, 1.0]}
                />
            ))}

            {/* ── Tail ──────────────────────────────────────────────── */}
            <mesh
                geometry={TAIL_GEO}
                material={DARK_MAT}
                position={[0,  0.28, -(BODY_SEGS + 0.2) * SEG_LEN]}
                rotation={[0, 0, Math.PI * 0.08]}
                scale={[1, 1.3, 1]}
            />
            <mesh
                geometry={TAIL_GEO}
                material={DARK_MAT}
                position={[0, -0.18, -(BODY_SEGS + 0.2) * SEG_LEN]}
                rotation={[0, 0, -Math.PI * 0.08]}
                scale={[1, 1.1, 1]}
            />

            {/* ── Proximity fill light (illuminates player) ─────────── */}
            <pointLight
                ref={fillLightRef}
                position={[0, 0.3, 0]}
                color="#002210"
                intensity={0}
                distance={16}
                decay={2}
            />
        </group>
    );
};
