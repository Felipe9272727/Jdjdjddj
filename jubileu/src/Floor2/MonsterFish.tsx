/**
 * Floor2/MonsterFish.tsx — Abyssal predator: deep-sea anglerfish / eel hybrid.
 *
 * Model (all procedural, no GLB):
 * - 12 tapered body segments with sinusoidal swimming wave
 * - 7 FK tentacle chains (4 segments each) around the jaw — nested groups = real FK
 * - 3-row teeth: outer small, inner large, innermost translucent ghost row
 * - Eye tracking: vertical slit pupils move toward player direction each frame
 * - 5 dorsal fins, oversized pectoral fins, forked tail
 * - Anglerfish lure: long stalk + big pulsing bulb
 * - Bioluminescent stripes in 3 phase groups (running wave head → tail)
 * - 4 bio point lights along the spine (independent phase = wave effect)
 * - 3D jumpscare: monster turns to face player + rushes at camera for 800ms,
 *   THEN fires onPlayerCaught (DOM overlay fires after 3D sequence)
 *
 * AI: dormant → awakening (11 s) → patrol → hunting → lunge → [3D jumpscare] → caught
 * Berserk: no regroup, 1.6× hunt speed, 1.8× lunge speed
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS, UW_PILLAR_COLLIDERS, SWIM_THRESHOLD_Y } from './constants';

// ─── AI tuning ─────────────────────────────────────────────────────────────
const PATROL_SPEED   = 2.2;
const HUNT_SPEED_MIN = 3.8;
const HUNT_SPEED_MAX = 9.0;
const LUNGE_SPEED    = 18.0;
const LUNGE_DIST     = 5.5;
const CATCH_DIST     = 3.2;   // trigger 3D jumpscare when monster is this close
const REGROUP_TIME   = 3.2;
const AWARENESS_DIST = 42.0;
const SPAWN_POS      = new THREE.Vector3(-22, -20, -22);
const AWAKEN_DELAY   = 11.0;

type FishState      = 'dormant' | 'awakening' | 'patrol' | 'hunting' | 'lunge' | 'regroup';
type JumpscarePhase = 'none' | 'turn' | 'rush' | 'done';

export interface MonsterFishProps {
    playerPositionRef:    React.MutableRefObject<THREE.Vector3>;
    collectedShards:      Set<number>;
    onPlayerCaught:       () => void;
    monsterPositionRef?:  React.MutableRefObject<THREE.Vector3>;
    monsterProximityRef?: React.MutableRefObject<number>;
    berserk?:             boolean;
    cameraShakeRef?:      React.MutableRefObject<boolean>;
}

// ─── Geometry helpers ──────────────────────────────────────────────────────
function makeSeg(rFront: number, rBack: number, len: number, radSeg = 8): THREE.CylinderGeometry {
    const g = new THREE.CylinderGeometry(rFront, rBack, len, radSeg, 1, false);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    return g;
}

// ─── Body ──────────────────────────────────────────────────────────────────
const N_BODY = 12;
const SEG_LEN = 0.40;
// Radius per segment (neck → tail). Head section (0-2) is wide.
const BODY_R = [0.58, 0.68, 0.72, 0.70, 0.62, 0.52, 0.42, 0.33, 0.24, 0.16, 0.10, 0.06];
const BODY_GEOS = BODY_R.map((r, i) =>
    makeSeg(i === 0 ? r * 0.88 : BODY_R[Math.max(0, i - 1)] * 0.97, r, SEG_LEN)
);

// ─── Head & jaw ────────────────────────────────────────────────────────────
const HEAD_GEO = new THREE.SphereGeometry(0.82, 16, 12);
const JAW_GEO  = new THREE.SphereGeometry(0.72, 14, 10);

// ─── Eyes ──────────────────────────────────────────────────────────────────
const EYE_SCLERA_GEO = new THREE.SphereGeometry(0.20, 12, 10);
const EYE_IRIS_GEO   = new THREE.SphereGeometry(0.13, 10, 8);
const PUPIL_GEO      = new THREE.CylinderGeometry(0.025, 0.035, 0.20, 5); // vertical slit

// ─── Teeth ─────────────────────────────────────────────────────────────────
const OUTER_TOOTH_GEO = new THREE.ConeGeometry(0.030, 0.16, 5);
const INNER_TOOTH_GEO = new THREE.ConeGeometry(0.042, 0.26, 5);
const GHOST_TOOTH_GEO = new THREE.ConeGeometry(0.030, 0.18, 5);

// ─── Tentacles ─────────────────────────────────────────────────────────────
const N_TENT    = 7;
const TENT_SEGS = 4;
const TENT_L    = [0.30, 0.24, 0.18, 0.14];
const TENT_GEOS = [
    new THREE.CylinderGeometry(0.030, 0.042, TENT_L[0], 5),
    new THREE.CylinderGeometry(0.020, 0.030, TENT_L[1], 5),
    new THREE.CylinderGeometry(0.012, 0.020, TENT_L[2], 5),
    new THREE.CylinderGeometry(0.004, 0.012, TENT_L[3], 5),
];
// Root positions in monster local space (fan below the jaw)
const TENT_ROOTS: [number, number, number][] = Array.from({ length: N_TENT }, (_, i) => {
    const a = (i / (N_TENT - 1)) * Math.PI;
    return [Math.sin(a) * 0.52 - 0.26, -0.44, Math.cos(a) * 0.22 + 0.38];
});

// ─── Other body parts ──────────────────────────────────────────────────────
const DORSAL_GEO     = new THREE.BoxGeometry(0.06, 0.62, 0.28);
const PECT_GEO       = new THREE.BoxGeometry(0.68, 0.10, 0.24);
const TAIL_GEO       = new THREE.BoxGeometry(0.06, 0.80, 0.60);
const LURE_GEO       = new THREE.SphereGeometry(0.14, 12, 10);
const LURE_STALK_GEO = makeSeg(0.025, 0.040, 0.70, 6);
const STRIPE_GEO     = new THREE.BoxGeometry(0.07, 0.07, SEG_LEN * 0.80);

// ─── Materials ─────────────────────────────────────────────────────────────
const DARK_MAT = new THREE.MeshStandardMaterial({
    color: '#03050f', roughness: 0.88, metalness: 0.15, toneMapped: false,
});
const SCLERA_MAT = new THREE.MeshStandardMaterial({
    color: '#0a0606', roughness: 0.6, toneMapped: false,
});
const IRIS_MAT = new THREE.MeshStandardMaterial({
    color: '#ff5500', emissive: '#ff6600', emissiveIntensity: 2.8,
    roughness: 0.1, toneMapped: false,
});
const PUPIL_MAT = new THREE.MeshStandardMaterial({
    color: '#000000', roughness: 1.0, toneMapped: false,
});
const TOOTH_MAT = new THREE.MeshStandardMaterial({
    color: '#e0dcd0', emissive: '#cccccc', emissiveIntensity: 0.25,
    roughness: 0.4, toneMapped: false,
});
const INNER_TOOTH_MAT = new THREE.MeshStandardMaterial({
    color: '#d8d0c4', emissive: '#ffffff', emissiveIntensity: 0.4,
    roughness: 0.3, transparent: true, opacity: 0.80, toneMapped: false,
});
const GHOST_TOOTH_MAT = new THREE.MeshStandardMaterial({
    color: '#f0ebe0', emissive: '#ffffff', emissiveIntensity: 0.2,
    roughness: 0.2, transparent: true, opacity: 0.28, toneMapped: false,
});
const LURE_MAT = new THREE.MeshStandardMaterial({
    color: '#00ffee', emissive: '#00ffee', emissiveIntensity: 3.5,
    roughness: 0.0, toneMapped: false,
});
const BIO_MAT = new THREE.MeshStandardMaterial({
    color: '#002820', emissive: '#00ffaa', emissiveIntensity: 1.4,
    roughness: 0.55, toneMapped: false,
});
// 3 stripe materials with independent pulsation phases (running wave)
const STRIPE_MATS = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({
    color: '#001a10', emissive: '#00dd88', emissiveIntensity: 0.9,
    roughness: 0.7, toneMapped: false,
}));

// ─── Tooth placement ───────────────────────────────────────────────────────
const OUTER_LOWER: [number, number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 9) * Math.PI;
    return [Math.sin(a) * 0.48 - 0.24, -0.18 + Math.abs(Math.sin(a)) * 0.08, Math.cos(a) * 0.32 + 0.20];
});
const OUTER_UPPER: [number, number, number][] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 7) * Math.PI;
    return [Math.sin(a) * 0.44 - 0.22, 0.22 - Math.abs(Math.sin(a)) * 0.07, Math.cos(a) * 0.28 + 0.18];
});
const INNER_TEETH: [number, number, number, boolean][] = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 5) * Math.PI;
    return [Math.sin(a) * 0.36 - 0.18, -0.04, Math.cos(a) * 0.20 + 0.10, i < 3] as [number, number, number, boolean];
});
const GHOST_TEETH: [number, number, number][] = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 5) * Math.PI;
    return [Math.sin(a) * 0.25 - 0.12, 0.0, Math.cos(a) * 0.14 - 0.04];
});
// Deterministic scale variation per tooth
const TOOTH_SCALES = Array.from({ length: 30 }, (_, i) => 1 + ((i * 7919) % 100) / 250);

// ─── Dorsal fin positions ──────────────────────────────────────────────────
const DORSAL_POS = [2, 3, 4, 5, 7].map(i => ({
    z:    -(i + 0.5) * SEG_LEN,
    side: (i % 2 === 0 ? 1 : -1) * 0.06,
    h:    BODY_R[i] + 0.16 + (i < 4 ? 0.20 : 0.0),
}));

// ─── Bio-light segment indices ─────────────────────────────────────────────
const BIO_SEG_MAP = new Map([[2, 0], [4, 1], [6, 2], [9, 3]]);

// ─── Tentacle FK sub-component ─────────────────────────────────────────────
// Nested groups give real FK: child transforms are in parent space,
// so animating each group's rotation correctly propagates down the chain.
interface TentacleProps {
    index: number;
    refs:  React.MutableRefObject<(THREE.Group | null)[][]>;
}
const TentacleChain: React.FC<TentacleProps> = ({ index, refs }) => {
    const s = (j: number) => (el: THREE.Group | null) => {
        if (!refs.current[index]) refs.current[index] = new Array(TENT_SEGS).fill(null);
        refs.current[index][j] = el;
    };
    const mat0 = index % 2 === 0 ? BIO_MAT : DARK_MAT;
    return (
        <group ref={s(0)}>
            <mesh geometry={TENT_GEOS[0]} material={mat0} />
            <group position={[0, -(TENT_L[0] + TENT_L[1]) * 0.5, 0]}>
                <group ref={s(1)}>
                    <mesh geometry={TENT_GEOS[1]} material={DARK_MAT} />
                    <group position={[0, -(TENT_L[1] + TENT_L[2]) * 0.5, 0]}>
                        <group ref={s(2)}>
                            <mesh geometry={TENT_GEOS[2]} material={DARK_MAT} />
                            <group position={[0, -(TENT_L[2] + TENT_L[3]) * 0.5, 0]}>
                                <group ref={s(3)}>
                                    <mesh geometry={TENT_GEOS[3]} material={DARK_MAT} />
                                </group>
                            </group>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
};

// ─── Main component ─────────────────────────────────────────────────────────
export const MonsterFish: React.FC<MonsterFishProps> = ({
    playerPositionRef,
    collectedShards,
    onPlayerCaught,
    monsterPositionRef,
    monsterProximityRef,
    berserk = false,
    cameraShakeRef,
}) => {
    const rootRef = useRef<THREE.Group>(null);

    // Segment refs
    const segRefs      = useRef<(THREE.Group | null)[]>(new Array(N_BODY).fill(null));
    const tentacleRefs = useRef<(THREE.Group | null)[][]>(
        Array.from({ length: N_TENT }, () => new Array(TENT_SEGS).fill(null))
    );
    const dorsalRefs   = useRef<(THREE.Mesh | null)[]>(new Array(DORSAL_POS.length).fill(null));
    const bioLightRefs = useRef<(THREE.PointLight | null)[]>(new Array(4).fill(null));

    const jawRef       = useRef<THREE.Mesh>(null);
    const eyeLPupilRef = useRef<THREE.Mesh>(null);
    const eyeRPupilRef = useRef<THREE.Mesh>(null);
    const pectLRef     = useRef<THREE.Mesh>(null);
    const pectRRef     = useRef<THREE.Mesh>(null);
    const lureLightRef = useRef<THREE.PointLight>(null);

    // AI state
    const pos         = useRef(SPAWN_POS.clone());
    const vel         = useRef(new THREE.Vector3());
    const state       = useRef<FishState>('dormant');
    const regroup     = useRef(0);
    const lDir        = useRef(new THREE.Vector3());
    const patrolT     = useRef(0);
    const caught      = useRef(false);
    const active      = useRef(false);
    const awakenTimer = useRef(0);

    // 3D jumpscare
    const jsPhase  = useRef<JumpscarePhase>('none');
    const jsTimer  = useRef(0);
    const jsTarget = useRef(new THREE.Vector3());

    // Temp vectors (avoid GC)
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());

    const setSegRef    = useCallback((i: number) => (el: THREE.Group | null) => { segRefs.current[i] = el; }, []);
    const setDorsalRef = useCallback((i: number) => (el: THREE.Mesh | null) => { dorsalRefs.current[i] = el; }, []);
    const setBioLight  = useCallback((i: number) => (el: THREE.PointLight | null) => { bioLightRefs.current[i] = el; }, []);

    // Visual update — called from both normal AI path and jumpscare path
    const updateVisuals = useCallback((t: number, safeDt: number, g: THREE.Group, proximity: number) => {
        // Orient monster along velocity
        const vl = vel.current.length();
        if (vl > 0.08) {
            const ty = Math.atan2(vel.current.x, vel.current.z);
            const tp = -Math.asin(THREE.MathUtils.clamp(vel.current.y / vl, -1, 1));
            let yd = ty - g.rotation.y;
            while (yd >  Math.PI) yd -= Math.PI * 2;
            while (yd < -Math.PI) yd += Math.PI * 2;
            const fast = state.current === 'lunge' || jsPhase.current !== 'none';
            g.rotation.y += yd * (fast ? safeDt * 18 : safeDt * 3.5);
            g.rotation.x += (tp - g.rotation.x) * (fast ? safeDt * 18 : safeDt * 2.5);
        }

        // Body sinusoidal wave
        const waveFreq = jsPhase.current === 'rush' ? 12.0
            : state.current === 'lunge'              ?  9.0
            : state.current === 'hunting'            ?  5.5
            : 2.8;
        const waveAmp = jsPhase.current === 'rush' || state.current === 'lunge' ? 0.38 : 0.18;
        for (let i = 0; i < N_BODY; i++) {
            const seg = segRefs.current[i];
            if (!seg) continue;
            const phase = t * waveFreq - i * 0.55;
            const amp = waveAmp * (i / N_BODY) * (1 + i / N_BODY);
            seg.rotation.y = Math.sin(phase) * amp;
            seg.rotation.x = Math.sin(phase * 0.5 + 0.4) * amp * 0.25;
        }

        // Jaw
        if (jawRef.current) {
            const target = jsPhase.current !== 'none' ? -0.75
                : state.current === 'lunge'           ?  0.28
                : 0.0;
            const speed = jsPhase.current !== 'none' ? 22 : 10;
            jawRef.current.rotation.x += (target - jawRef.current.rotation.x) * safeDt * speed;
        }

        // Fin flutter
        const finFlap = Math.sin(t * waveFreq * 0.7 + 1.1) * 0.22;
        for (let i = 0; i < dorsalRefs.current.length; i++) {
            const d = dorsalRefs.current[i];
            if (d) d.rotation.z = finFlap * (i % 2 === 0 ? 1 : -1);
        }
        if (pectLRef.current) pectLRef.current.rotation.z =  0.42 + Math.sin(t * waveFreq * 0.8) * 0.22;
        if (pectRRef.current) pectRRef.current.rotation.z = -0.42 - Math.sin(t * waveFreq * 0.8) * 0.22;

        // Lure + bio lights pulse
        if (lureLightRef.current) lureLightRef.current.intensity = 0.7 + Math.sin(t * 3.2) * 0.5 + proximity * 1.5;
        for (let i = 0; i < bioLightRefs.current.length; i++) {
            const bl = bioLightRefs.current[i];
            if (bl) bl.intensity = 0.5 + Math.abs(Math.sin(t * 3.5 - i * 1.4 + proximity * 3)) * 0.9;
        }

        // Stripe running wave (3 phase groups)
        STRIPE_MATS[0].emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2.8 + 0.0)) * 1.3;
        STRIPE_MATS[1].emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2.8 - 1.4)) * 1.3;
        STRIPE_MATS[2].emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2.8 - 2.8)) * 1.3;

        // Tentacle FK animation
        const huntMult = state.current === 'hunting' || state.current === 'lunge'
            || jsPhase.current !== 'none' ? 1.8 : 1.0;
        for (let ti = 0; ti < N_TENT; ti++) {
            const phaseI = (ti / N_TENT) * Math.PI * 2;
            for (let j = 0; j < TENT_SEGS; j++) {
                const grp = tentacleRefs.current[ti]?.[j];
                if (!grp) continue;
                const ph = t * 2.0 * huntMult - phaseI - j * 0.8;
                const amp = (0.14 + j * 0.12) * (jsPhase.current !== 'none' ? 2.4 : 1.0);
                grp.rotation.z = Math.sin(ph) * amp;
                grp.rotation.x = Math.cos(ph * 0.65) * amp * 0.4;
            }
        }

        // Eye tracking — pupil slides toward player in local space
        if (eyeLPupilRef.current && eyeRPupilRef.current && rootRef.current) {
            const pp = playerPositionRef.current;
            const dx = (pp?.x ?? 0) - pos.current.x;
            const dy = (pp?.y ?? 0) - pos.current.y;
            const dz = (pp?.z ?? 0) - pos.current.z;
            const invQ = rootRef.current.quaternion.clone().invert();
            const localDir = _v1.current.set(dx, dy, dz).normalize().applyQuaternion(invQ);
            const ex = THREE.MathUtils.clamp(localDir.x, -0.08, 0.08);
            const ey = THREE.MathUtils.clamp(localDir.y, -0.06, 0.06);
            eyeLPupilRef.current.position.set(-0.60 + ex, 0.18 + ey, 0.52);
            eyeRPupilRef.current.position.set( 0.60 + ex, 0.18 + ey, 0.52);
        }
    }, []); // stable — only accesses refs

    useFrame(({ clock }, dt) => {
        const g = rootRef.current;
        if (!g) return;
        const t = clock.elapsedTime;
        const safeDt = Math.min(dt, 0.05);

        // Activate once first shard is collected
        if (!active.current && collectedShards.size >= 1) {
            active.current = true;
            state.current = 'awakening';
            awakenTimer.current = AWAKEN_DELAY;
        }

        // Hide when dormant or player is above water
        const playerY = playerPositionRef.current?.y ?? 0;
        if (state.current === 'dormant' || !active.current || playerY >= SWIM_THRESHOLD_Y) {
            if (monsterProximityRef) monsterProximityRef.current = 0;
            g.visible = false;
            return;
        }

        g.visible = true;

        // ── Awakening — stirs in place, builds tension ─────────────────
        if (state.current === 'awakening') {
            awakenTimer.current -= safeDt;
            for (let i = 0; i < N_BODY; i++) {
                const seg = segRefs.current[i];
                if (seg) seg.rotation.y = Math.sin(t * 0.9 - i * 0.4) * 0.06;
            }
            g.position.copy(SPAWN_POS);
            if (monsterPositionRef) monsterPositionRef.current.copy(SPAWN_POS);
            const ad = SPAWN_POS.distanceTo(playerPositionRef.current);
            if (monsterProximityRef) monsterProximityRef.current = Math.max(0, 1 - ad / AWARENESS_DIST) * 0.25;
            if (awakenTimer.current <= 0) state.current = 'patrol';
            return;
        }

        // ── Shared per-frame values ────────────────────────────────────
        const pp = playerPositionRef.current;
        const px = pp?.x ?? 0, py = pp?.y ?? -10, pz = pp?.z ?? 0;
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dx = px - fx, dy = py - fy, dz = pz - fz;
        const dist     = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);

        if (monsterPositionRef) monsterPositionRef.current.set(fx, fy, fz);
        if (monsterProximityRef) monsterProximityRef.current = proximity;

        // ── 3D JUMPSCARE — scripted, overrides normal AI ───────────────
        if (jsPhase.current !== 'none') {
            jsTimer.current += safeDt;
            const jt = jsTimer.current;

            if (jsPhase.current === 'turn') {
                // Brake hard, open jaw, shake camera
                vel.current.x *= Math.max(0, 1 - safeDt * 14);
                vel.current.y *= Math.max(0, 1 - safeDt * 14);
                vel.current.z *= Math.max(0, 1 - safeDt * 14);
                if (cameraShakeRef) cameraShakeRef.current = true;
                if (jt > 0.40) jsPhase.current = 'rush';

            } else if (jsPhase.current === 'rush') {
                // Rush toward locked target (player pos at catch time)
                const tp = jsTarget.current;
                const rdx = tp.x - pos.current.x;
                const rdy = tp.y - pos.current.y;
                const rdz = tp.z - pos.current.z;
                const rl = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz) + 0.001;
                vel.current.set(rdx/rl*45, rdy/rl*45, rdz/rl*45);
                pos.current.x += vel.current.x * safeDt;
                pos.current.y += vel.current.y * safeDt;
                pos.current.z += vel.current.z * safeDt;
                g.position.copy(pos.current);

                if (jt > 0.85) {
                    jsPhase.current = 'done';
                    if (cameraShakeRef) cameraShakeRef.current = false;
                    onPlayerCaught();
                }
            }

            updateVisuals(t, safeDt, g, proximity);
            return; // skip normal AI
        }

        // ── AI state transitions ───────────────────────────────────────
        switch (state.current) {
            case 'patrol':
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;
            case 'hunting':
                if (dist < LUNGE_DIST) {
                    _v1.current.set(dx, dy, dz).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    if (fwd.dot(_v1.current) > 0.30 || dist < 2.8) {
                        state.current = 'lunge';
                        lDir.current.set(dx/dist, dy/dist, dz/dist);
                    }
                }
                break;
            case 'lunge':
                if (dist < CATCH_DIST && !caught.current) {
                    // Start 3D jumpscare instead of immediate callback
                    caught.current = true;
                    jsPhase.current = 'turn';
                    jsTimer.current = 0;
                    jsTarget.current.copy(pp);
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

        // ── Movement ──────────────────────────────────────────────────
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
                const speed  = berserk ? HUNT_SPEED_MAX * 1.6
                    : HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                _v1.current.set(dx/dist, dy/dist, dz/dist).multiplyScalar(speed);
                // Rock avoidance
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rd2 = rdx*rdx + rdy*rdy + rdz*rdz;
                    const mr  = rock.r + 2.0;
                    if (rd2 < mr*mr && rd2 > 0.001) {
                        const rd  = Math.sqrt(rd2);
                        const str = (mr - rd) / rd * 7;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }
                // Coral pillar avoidance (XZ only — tall cylinders)
                for (const pillar of UW_PILLAR_COLLIDERS) {
                    const pdx = fx - pillar.x, pdz = fz - pillar.z;
                    const pd2 = pdx*pdx + pdz*pdz;
                    const mr  = pillar.r + 1.8;
                    if (pd2 < mr*mr && pd2 > 0.001) {
                        const pd  = Math.sqrt(pd2);
                        const str = (mr - pd) / pd * 6;
                        _v1.current.x += pdx * str;
                        _v1.current.z += pdz * str;
                    }
                }
                _v1.current.y += Math.sin(t * 1.3) * 0.5;
                vel.current.lerp(_v1.current, safeDt * 3.2);
                break;
            }
            case 'lunge': {
                const ls = berserk ? LUNGE_SPEED * 1.8 : LUNGE_SPEED;
                vel.current.lerp(
                    _v1.current.set(lDir.current.x * ls, lDir.current.y * ls, lDir.current.z * ls),
                    safeDt * 12,
                );
                break;
            }
            case 'regroup':
                if (berserk) {
                    state.current = 'hunting';
                    caught.current = false;
                } else {
                    vel.current.multiplyScalar(1 - safeDt * 2.2);
                    vel.current.lerp(
                        _v1.current.copy(SPAWN_POS).sub(pos.current).normalize().multiplyScalar(2.5),
                        safeDt * 0.9,
                    );
                }
                break;
        }

        // Apply velocity
        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -29, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);

        // Cave wall collision
        for (const wall of CAVE_WALL_COLLIDERS) {
            const wdx = pos.current.x - wall.x;
            const wdz = pos.current.z - wall.z;
            const wd2 = wdx*wdx + wdz*wdz;
            const mr  = wall.r + 1.2;
            if (wd2 < mr*mr && wd2 > 0.001) {
                const wd = Math.sqrt(wd2);
                const push = (mr - wd) / wd;
                pos.current.x += wdx * push;
                pos.current.z += wdz * push;
            }
        }

        g.position.copy(pos.current);
        updateVisuals(t, safeDt, g, proximity);
    });

    // Spine segment positions
    const segPositions = useMemo(
        () => Array.from({ length: N_BODY }, (_, i) => new THREE.Vector3(0, 0, -(i + 0.5) * SEG_LEN)),
        [],
    );

    return (
        <group ref={rootRef} visible={false}>

            {/* ── HEAD — wide, flat, hammerhead silhouette ────────────── */}
            <mesh geometry={HEAD_GEO} material={DARK_MAT}
                scale={[1.55, 0.78, 1.18]} position={[0, 0.05, 0.35]} />

            {/* ── JAW — large, grotesque, animates open ───────────────── */}
            <mesh ref={jawRef} geometry={JAW_GEO} material={DARK_MAT}
                scale={[1.62, 0.66, 1.16]} position={[0, -0.30, 0.32]} />

            {/* ── EYES: sclera + amber iris + vertical slit pupil ─────── */}
            <mesh geometry={EYE_SCLERA_GEO} material={SCLERA_MAT} position={[-0.62, 0.18, 0.44]} />
            <mesh geometry={EYE_IRIS_GEO}   material={IRIS_MAT}   position={[-0.60, 0.18, 0.50]} />
            <mesh ref={eyeLPupilRef} geometry={PUPIL_GEO} material={PUPIL_MAT}
                position={[-0.60, 0.18, 0.52]} />

            <mesh geometry={EYE_SCLERA_GEO} material={SCLERA_MAT} position={[ 0.62, 0.18, 0.44]} />
            <mesh geometry={EYE_IRIS_GEO}   material={IRIS_MAT}   position={[ 0.60, 0.18, 0.50]} />
            <mesh ref={eyeRPupilRef} geometry={PUPIL_GEO} material={PUPIL_MAT}
                position={[ 0.60, 0.18, 0.52]} />

            {/* ── TEETH — 3 rows: outer / inner / ghost ───────────────── */}
            {OUTER_LOWER.map(([x, y, z], i) => (
                <mesh key={`ol${i}`} geometry={OUTER_TOOTH_GEO} material={TOOTH_MAT}
                    position={[x, y, z]} scale={[1, TOOTH_SCALES[i] ?? 1, 1]} />
            ))}
            {OUTER_UPPER.map(([x, y, z], i) => (
                <mesh key={`ou${i}`} geometry={OUTER_TOOTH_GEO} material={TOOTH_MAT}
                    position={[x, y, z]} rotation={[Math.PI, 0, 0]}
                    scale={[1, TOOTH_SCALES[i + 10] ?? 1, 1]} />
            ))}
            {INNER_TEETH.map(([x, y, z, lower], i) => (
                <mesh key={`in${i}`} geometry={INNER_TOOTH_GEO} material={INNER_TOOTH_MAT}
                    position={[x, y, z]} rotation={[lower ? 0 : Math.PI, 0, 0]}
                    scale={[1, TOOTH_SCALES[i + 18] ?? 1, 1]} />
            ))}
            {GHOST_TEETH.map(([x, y, z], i) => (
                <mesh key={`gh${i}`} geometry={GHOST_TOOTH_GEO} material={GHOST_TOOTH_MAT}
                    position={[x, y, z]} rotation={[i % 2 === 0 ? 0 : Math.PI, 0, 0]} />
            ))}

            {/* ── TENTACLES — 7 × 4-segment FK chains ────────────────── */}
            {TENT_ROOTS.map(([rx, ry, rz], ti) => (
                <group key={`tent${ti}`} position={[rx, ry, rz]}>
                    <TentacleChain index={ti} refs={tentacleRefs} />
                </group>
            ))}

            {/* ── ANGLERFISH LURE ─────────────────────────────────────── */}
            <mesh geometry={LURE_STALK_GEO} material={DARK_MAT}
                position={[0, 0.65, 0.22]} rotation={[0.50, 0, 0]} />
            <mesh geometry={LURE_GEO} material={LURE_MAT} position={[0, 1.10, -0.10]} />
            <pointLight ref={lureLightRef} position={[0, 1.10, -0.10]}
                color="#00ffee" intensity={1.2} distance={10} decay={2} />
            <pointLight position={[0, 1.10, -0.10]}
                color="#00ccdd" intensity={0.4} distance={22} decay={2} />

            {/* ── PECTORAL FINS — large, wing-like ────────────────────── */}
            <mesh ref={pectLRef} geometry={PECT_GEO} material={DARK_MAT}
                position={[ 0.82, -0.05, -0.18]} rotation={[0.12, 0,  0.42]} scale={[1, 1, 1.8]} />
            <mesh ref={pectRRef} geometry={PECT_GEO} material={DARK_MAT}
                position={[-0.82, -0.05, -0.18]} rotation={[0.12, 0, -0.42]} scale={[1, 1, 1.8]} />

            {/* ── BODY SPINE ──────────────────────────────────────────── */}
            {Array.from({ length: N_BODY }, (_, i) => {
                const bioIdx = BIO_SEG_MAP.get(i);
                return (
                    <group key={`seg${i}`} ref={setSegRef(i)} position={segPositions[i]}>
                        <mesh geometry={BODY_GEOS[i]} material={DARK_MAT} />
                        {/* Bioluminescent stripes in 3 phase groups */}
                        <mesh geometry={STRIPE_GEO} material={STRIPE_MATS[Math.floor(i / 4) % 3]}
                            position={[ BODY_R[i] * 0.80, -BODY_R[i] * 0.55, 0]} />
                        <mesh geometry={STRIPE_GEO} material={STRIPE_MATS[Math.floor(i / 4) % 3]}
                            position={[-BODY_R[i] * 0.80, -BODY_R[i] * 0.55, 0]} />
                        {/* Bio point lights at 4 positions */}
                        {bioIdx !== undefined && (
                            <pointLight ref={setBioLight(bioIdx)}
                                color="#00ff88" intensity={0.7} distance={6} decay={2} />
                        )}
                    </group>
                );
            })}

            {/* ── DORSAL FINS ─────────────────────────────────────────── */}
            {DORSAL_POS.map((d, i) => (
                <mesh key={`df${i}`} ref={setDorsalRef(i)} geometry={DORSAL_GEO} material={DARK_MAT}
                    position={[d.side, d.h, d.z]} scale={[1.0, 1.0 + i * 0.08, 1.0]} />
            ))}

            {/* ── FORKED TAIL ─────────────────────────────────────────── */}
            <mesh geometry={TAIL_GEO} material={DARK_MAT}
                position={[0,  0.55, -(N_BODY + 0.5) * SEG_LEN]} rotation={[0, 0,  0.38]} />
            <mesh geometry={TAIL_GEO} material={DARK_MAT}
                position={[0, -0.55, -(N_BODY + 0.5) * SEG_LEN]} rotation={[0, 0, -0.38]} />

        </group>
    );
};
