/**
 * Floor2/MonsterFish.tsx — Abyssal predator: deep-sea anglerfish / eel hybrid.
 *
 * v3 — Real kinematic spine (nested groups = true FK chain).
 *
 * Architecture:
 *  - SPINE: 18 segments, each nested in its parent. Rotating segment N
 *    moves all downstream segments — produces real traveling waves.
 *  - CAUDAL FIN: 3-segment articulated tail at the spine tip that whips.
 *  - TENTACLES: 8 chains × 6 nested segments around the jaw.
 *  - HEAD/JAW: jaw is a child of head, rotates on its hinge bone.
 *  - PECTORAL FINS: dual-axis flutter (camber + sweep) per swim cycle.
 *  - EYE TRACKING: vertical slit pupils slide in local head space.
 *  - TEETH: 3 rows — outer (18), inner translucent (8), ghost (8).
 *  - BIOLUMINESCENCE: 4-phase stripe wave + 6 bio point lights with offset.
 *
 * AI: dormant → awakening (11 s) → patrol → hunting → lunge → [3D jumpscare]
 * Tuned for tension over instant-kill — player gets reaction window.
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS, UW_PILLAR_COLLIDERS, SWIM_THRESHOLD_Y } from './constants';

// ─── AI tuning — HARDER TO CATCH ────────────────────────────────────────────
const PATROL_SPEED   = 2.2;
const HUNT_SPEED_MIN = 3.0;
const HUNT_SPEED_MAX = 7.0;   // was 9.0
const LUNGE_SPEED    = 14.0;  // was 18.0
const LUNGE_DIST     = 4.5;   // was 5.5 — must be closer to commit
const CATCH_DIST     = 2.2;   // was 3.2 — much smaller hit-box, requires precision
const REGROUP_TIME   = 5.0;   // was 3.2 — longer recovery
const AWARENESS_DIST = 42.0;
const SPAWN_POS      = new THREE.Vector3(-22, -20, -22);
const AWAKEN_DELAY   = 11.0;
const BERSERK_HUNT_MULT  = 1.35;
const BERSERK_LUNGE_MULT = 1.45;

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

// ─── Spine — 18 segments, real FK chain ────────────────────────────────────
const N_BODY = 18;
const SEG_LEN = 0.30;
// Radius taper neck → tail with anglerfish belly bulge around seg 2-3
const BODY_R = [
    0.55, 0.66, 0.74, 0.72, 0.68, 0.62, 0.55, 0.48, 0.41,
    0.34, 0.28, 0.23, 0.18, 0.14, 0.11, 0.09, 0.07, 0.05,
];
// Cylinder geometry per segment — front radius matches previous segment's back
const BODY_GEOS = BODY_R.map((r, i) => {
    const prev = i === 0 ? r * 0.92 : BODY_R[i - 1] * 0.98;
    return makeSeg(prev, r, SEG_LEN);
});

// ─── Caudal fin (whip tail) — 3 articulated segments ────────────────────────
const CAUDAL_SEGS = 3;
const CAUDAL_LEN  = [0.36, 0.30, 0.24];
const CAUDAL_GEOS = CAUDAL_LEN.map((L, i) => makeSeg(0.06 - i * 0.012, 0.04 - i * 0.012, L, 5));
const CAUDAL_FIN_GEO_UP   = new THREE.BoxGeometry(0.04, 0.78, 0.58);
const CAUDAL_FIN_GEO_DOWN = new THREE.BoxGeometry(0.04, 0.66, 0.50);

// ─── Head & jaw ────────────────────────────────────────────────────────────
const HEAD_GEO  = new THREE.SphereGeometry(0.82, 18, 14);
const SKULL_GEO = new THREE.SphereGeometry(0.62, 14, 10);   // crown bulge
const JAW_GEO   = new THREE.SphereGeometry(0.72, 16, 12);
const GILL_GEO  = new THREE.TorusGeometry(0.42, 0.05, 6, 14, Math.PI * 0.45);

// ─── Eyes ──────────────────────────────────────────────────────────────────
const EYE_SCLERA_GEO = new THREE.SphereGeometry(0.22, 14, 11);
const EYE_IRIS_GEO   = new THREE.SphereGeometry(0.14, 12, 9);
const PUPIL_GEO      = new THREE.CylinderGeometry(0.030, 0.038, 0.22, 5);

// ─── Teeth ─────────────────────────────────────────────────────────────────
const OUTER_TOOTH_GEO = new THREE.ConeGeometry(0.030, 0.18, 5);
const INNER_TOOTH_GEO = new THREE.ConeGeometry(0.044, 0.30, 5);
const GHOST_TOOTH_GEO = new THREE.ConeGeometry(0.030, 0.20, 5);

// ─── Tentacles — 8 chains × 6 nested segments ──────────────────────────────
const N_TENT    = 8;
const TENT_SEGS = 6;
const TENT_L    = [0.30, 0.26, 0.22, 0.18, 0.14, 0.10];
const TENT_GEOS = [
    new THREE.CylinderGeometry(0.032, 0.044, TENT_L[0], 5),
    new THREE.CylinderGeometry(0.024, 0.032, TENT_L[1], 5),
    new THREE.CylinderGeometry(0.018, 0.024, TENT_L[2], 5),
    new THREE.CylinderGeometry(0.013, 0.018, TENT_L[3], 5),
    new THREE.CylinderGeometry(0.008, 0.013, TENT_L[4], 5),
    new THREE.CylinderGeometry(0.003, 0.008, TENT_L[5], 5),
];
const TENT_ROOTS: [number, number, number][] = Array.from({ length: N_TENT }, (_, i) => {
    const a = (i / (N_TENT - 1)) * Math.PI;
    return [Math.sin(a) * 0.54 - 0.27, -0.46, Math.cos(a) * 0.24 + 0.40];
});

// ─── Other parts ───────────────────────────────────────────────────────────
const DORSAL_GEO     = new THREE.BoxGeometry(0.05, 0.62, 0.30);
const VENTRAL_GEO    = new THREE.BoxGeometry(0.04, 0.32, 0.22);
const PECT_GEO       = new THREE.BoxGeometry(0.72, 0.08, 0.26);
const LURE_GEO       = new THREE.SphereGeometry(0.15, 14, 11);
const LURE_STALK_GEO = makeSeg(0.026, 0.042, 0.72, 6);
const STRIPE_GEO     = new THREE.BoxGeometry(0.07, 0.07, SEG_LEN * 0.85);

// ─── Materials ─────────────────────────────────────────────────────────────
const DARK_MAT = new THREE.MeshStandardMaterial({
    color: '#03050f', roughness: 0.88, metalness: 0.15, toneMapped: false,
});
const SKIN_MAT = new THREE.MeshStandardMaterial({
    color: '#070811', roughness: 0.82, metalness: 0.10, toneMapped: false,
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
// 4 stripe materials with independent pulsation phases (running wave)
const STRIPE_MATS = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({
    color: '#001a10', emissive: '#00dd88', emissiveIntensity: 0.9,
    roughness: 0.7, toneMapped: false,
}));

// ─── Tooth placements ──────────────────────────────────────────────────────
const OUTER_LOWER: [number, number, number][] = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 11) * Math.PI;
    return [Math.sin(a) * 0.50 - 0.25, -0.18 + Math.abs(Math.sin(a)) * 0.08, Math.cos(a) * 0.34 + 0.22];
});
const OUTER_UPPER: [number, number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 9) * Math.PI;
    return [Math.sin(a) * 0.46 - 0.23, 0.22 - Math.abs(Math.sin(a)) * 0.07, Math.cos(a) * 0.30 + 0.20];
});
const INNER_TEETH: [number, number, number, boolean][] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 7) * Math.PI;
    return [Math.sin(a) * 0.38 - 0.19, -0.04, Math.cos(a) * 0.22 + 0.12, i < 4] as [number, number, number, boolean];
});
const GHOST_TEETH: [number, number, number][] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 7) * Math.PI;
    return [Math.sin(a) * 0.26 - 0.13, 0.0, Math.cos(a) * 0.16 - 0.04];
});
const TOOTH_SCALES = Array.from({ length: 40 }, (_, i) => 1 + ((i * 7919) % 100) / 250);

// ─── Dorsal fin positions (spine indices) ──────────────────────────────────
// Tuple: [segment-index, side-bias, height-bonus]
const DORSAL_SLOTS: { idx: number; side: number; h: number }[] = [
    { idx: 2,  side:  0.04, h: 0.40 },
    { idx: 4,  side: -0.04, h: 0.38 },
    { idx: 6,  side:  0.04, h: 0.32 },
    { idx: 8,  side: -0.04, h: 0.22 },
    { idx: 10, side:  0.04, h: 0.16 },
    { idx: 12, side: -0.04, h: 0.10 },
];

const VENTRAL_SLOTS: { idx: number }[] = [{ idx: 3 }, { idx: 5 }, { idx: 8 }];

// ─── Bio-light segment indices (6 lights) ─────────────────────────────────
const BIO_SEG_MAP = new Map([[1, 0], [4, 1], [7, 2], [10, 3], [13, 4], [16, 5]]);

// ─── Tentacle FK chain (6 nested segments) ─────────────────────────────────
interface TentacleProps {
    index: number;
    refs:  React.MutableRefObject<(THREE.Group | null)[][]>;
}
const TentacleChain: React.FC<TentacleProps> = ({ index, refs }) => {
    const setR = (j: number) => (el: THREE.Group | null) => {
        if (!refs.current[index]) refs.current[index] = new Array(TENT_SEGS).fill(null);
        refs.current[index][j] = el;
    };
    // Inner-to-outer build using a fold so the JSX stays flat-ish
    let inner: React.ReactNode = null;
    for (let j = TENT_SEGS - 1; j >= 0; j--) {
        const mat = j === 0 && index % 2 === 0 ? BIO_MAT : DARK_MAT;
        const childOffset = j < TENT_SEGS - 1 ? -(TENT_L[j] + TENT_L[j + 1]) * 0.5 : 0;
        inner = (
            <group ref={setR(j)}>
                <mesh geometry={TENT_GEOS[j]} material={mat} />
                {inner && (
                    <group position={[0, childOffset, 0]}>{inner}</group>
                )}
            </group>
        );
    }
    return <>{inner}</>;
};

// ─── Spine FK chain (18 nested segments) ────────────────────────────────────
interface SpineProps {
    refs:        React.MutableRefObject<(THREE.Group | null)[]>;
    dorsalRefs:  React.MutableRefObject<(THREE.Mesh | null)[]>;
    bioRefs:     React.MutableRefObject<(THREE.PointLight | null)[]>;
    caudalRefs:  React.MutableRefObject<(THREE.Group | null)[]>;
}
const SpineFK: React.FC<SpineProps> = ({ refs, dorsalRefs, bioRefs, caudalRefs }) => {
    const setSeg    = (i: number) => (el: THREE.Group | null) => { refs.current[i] = el; };
    const setDorsal = (i: number) => (el: THREE.Mesh | null) => { dorsalRefs.current[i] = el; };
    const setBio    = (i: number) => (el: THREE.PointLight | null) => { bioRefs.current[i] = el; };
    const setCaudal = (i: number) => (el: THREE.Group | null) => { caudalRefs.current[i] = el; };

    // Caudal fin at the tip of the spine
    let inner: React.ReactNode = (
        <group ref={setCaudal(0)} position={[0, 0, -SEG_LEN * 0.5]}>
            <mesh geometry={CAUDAL_GEOS[0]} material={DARK_MAT} />
            <group ref={setCaudal(1)} position={[0, 0, -CAUDAL_LEN[0]]}>
                <mesh geometry={CAUDAL_GEOS[1]} material={DARK_MAT} />
                <group ref={setCaudal(2)} position={[0, 0, -CAUDAL_LEN[1]]}>
                    <mesh geometry={CAUDAL_GEOS[2]} material={DARK_MAT} />
                    {/* Caudal fin lobes */}
                    <mesh geometry={CAUDAL_FIN_GEO_UP}
                        position={[0, 0.36, -CAUDAL_LEN[2] * 0.3]} rotation={[0, 0, 0.32]} />
                    <mesh geometry={CAUDAL_FIN_GEO_DOWN}
                        position={[0, -0.32, -CAUDAL_LEN[2] * 0.3]} rotation={[0, 0, -0.32]} />
                </group>
            </group>
        </group>
    );

    // Build spine from tail back to neck (each becomes parent of previous)
    for (let i = N_BODY - 1; i >= 0; i--) {
        const r = BODY_R[i];
        const dorsalSlot = DORSAL_SLOTS.findIndex(d => d.idx === i);
        const ventralSlot = VENTRAL_SLOTS.findIndex(v => v.idx === i);
        const bioIdx = BIO_SEG_MAP.get(i);
        const stripeMat = STRIPE_MATS[Math.floor(i / 5) % 4];

        inner = (
            <group ref={setSeg(i)} position={i === 0 ? [0, 0, -SEG_LEN * 0.5] : [0, 0, -SEG_LEN]}>
                <mesh geometry={BODY_GEOS[i]} material={SKIN_MAT} />
                {/* Bioluminescent stripes */}
                <mesh geometry={STRIPE_GEO} material={stripeMat}
                    position={[ r * 0.80, -r * 0.55, 0]} />
                <mesh geometry={STRIPE_GEO} material={stripeMat}
                    position={[-r * 0.80, -r * 0.55, 0]} />
                {/* Dorsal fin */}
                {dorsalSlot >= 0 && (
                    <mesh ref={setDorsal(dorsalSlot)} geometry={DORSAL_GEO} material={DARK_MAT}
                        position={[DORSAL_SLOTS[dorsalSlot].side, r + DORSAL_SLOTS[dorsalSlot].h, 0]}
                        scale={[1.0, 1.0 + dorsalSlot * 0.08, 1.0]} />
                )}
                {/* Ventral fin */}
                {ventralSlot >= 0 && (
                    <mesh geometry={VENTRAL_GEO} material={DARK_MAT}
                        position={[0, -(r + 0.16), 0]} />
                )}
                {/* Bio light */}
                {bioIdx !== undefined && (
                    <pointLight ref={setBio(bioIdx)}
                        color="#00ff88" intensity={0.7} distance={6} decay={2} />
                )}
                {inner}
            </group>
        );
    }

    return <>{inner}</>;
};

// ─── Main component ────────────────────────────────────────────────────────
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

    // Refs into the FK chain
    const segRefs      = useRef<(THREE.Group | null)[]>(new Array(N_BODY).fill(null));
    const caudalRefs   = useRef<(THREE.Group | null)[]>(new Array(CAUDAL_SEGS).fill(null));
    const tentacleRefs = useRef<(THREE.Group | null)[][]>(
        Array.from({ length: N_TENT }, () => new Array(TENT_SEGS).fill(null))
    );
    const dorsalRefs   = useRef<(THREE.Mesh | null)[]>(new Array(DORSAL_SLOTS.length).fill(null));
    const bioLightRefs = useRef<(THREE.PointLight | null)[]>(new Array(6).fill(null));

    const headRef      = useRef<THREE.Group>(null);
    const jawRef       = useRef<THREE.Group>(null);
    const eyeLPupilRef = useRef<THREE.Mesh>(null);
    const eyeRPupilRef = useRef<THREE.Mesh>(null);
    const pectLRef     = useRef<THREE.Group>(null);
    const pectRRef     = useRef<THREE.Group>(null);
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

    // Temp vectors
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());

    // Visual update — drives all bone animation
    const updateVisuals = useCallback((t: number, safeDt: number, g: THREE.Group, proximity: number) => {
        // Body orientation along velocity
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

        // ── Spine traveling wave (real FK — rotations propagate to all children) ──
        const speedMode = jsPhase.current === 'rush' ? 3
            : state.current === 'lunge'              ? 2
            : state.current === 'hunting'            ? 1
            : 0;
        const waveFreq = [3.0, 5.5, 9.0, 13.0][speedMode];
        const waveAmpBase = [0.10, 0.10, 0.20, 0.28][speedMode];
        const waveAmpTail = [0.18, 0.20, 0.32, 0.40][speedMode];
        const rollAmp     = [0.04, 0.04, 0.08, 0.10][speedMode];

        for (let i = 0; i < N_BODY; i++) {
            const seg = segRefs.current[i];
            if (!seg) continue;
            const norm = i / (N_BODY - 1);
            // Wave phase travels head→tail with realistic per-segment delay
            const phase = t * waveFreq - i * 0.42;
            // Amplitude grows toward the tail (lerp base→tail)
            const amp = waveAmpBase + (waveAmpTail - waveAmpBase) * norm;
            // Local-Y rotation = yaw bend (the swim wave)
            seg.rotation.y = Math.sin(phase) * amp;
            // Subtle local-X (pitch) for realistic body undulation
            seg.rotation.x = Math.sin(phase * 0.5 + 0.4) * amp * 0.18;
            // Slight roll synced with yaw for natural body twist
            seg.rotation.z = Math.sin(phase * 0.7) * rollAmp;
        }

        // ── Caudal fin whip ───────────────────────────────────────────────
        // Caudal fin amplifies the tail wave with extra phase delay
        const caudalAmp = [0.30, 0.36, 0.55, 0.75][speedMode];
        for (let i = 0; i < CAUDAL_SEGS; i++) {
            const c = caudalRefs.current[i];
            if (!c) continue;
            const phase = t * waveFreq - (N_BODY + i) * 0.42;
            c.rotation.y = Math.sin(phase) * caudalAmp * (0.6 + i * 0.2);
        }

        // ── Jaw articulation ──────────────────────────────────────────────
        if (jawRef.current) {
            const target = jsPhase.current !== 'none' ? -0.90
                : state.current === 'lunge'           ?  0.32
                : 0.04 + Math.sin(t * 1.4) * 0.03;  // idle micro-breathing
            const speed = jsPhase.current !== 'none' ? 24 : 9;
            jawRef.current.rotation.x += (target - jawRef.current.rotation.x) * safeDt * speed;
        }

        // ── Pectoral fins — dual-axis flutter (sweep + camber) ────────────
        const finCycleFreq = waveFreq * 0.6;
        const flapL = Math.sin(t * finCycleFreq + 0.5);
        const flapR = Math.sin(t * finCycleFreq + Math.PI * 0.5 + 0.5);
        if (pectLRef.current) {
            pectLRef.current.rotation.z =  0.40 + flapL * 0.26;
            pectLRef.current.rotation.x =  Math.cos(t * finCycleFreq + 0.5) * 0.18;
        }
        if (pectRRef.current) {
            pectRRef.current.rotation.z = -0.40 - flapR * 0.26;
            pectRRef.current.rotation.x =  Math.cos(t * finCycleFreq + Math.PI * 0.5 + 0.5) * 0.18;
        }

        // ── Dorsal fin flutter (alternating phases for natural look) ──────
        const dorsalAmp = speedMode >= 2 ? 0.32 : 0.18;
        for (let i = 0; i < dorsalRefs.current.length; i++) {
            const d = dorsalRefs.current[i];
            if (d) d.rotation.z = Math.sin(t * waveFreq * 0.8 + i * 1.1) * dorsalAmp;
        }

        // ── Lure + bio lights pulse ──────────────────────────────────────
        if (lureLightRef.current) {
            lureLightRef.current.intensity = 0.7 + Math.sin(t * 3.2) * 0.5 + proximity * 1.5;
        }
        for (let i = 0; i < bioLightRefs.current.length; i++) {
            const bl = bioLightRefs.current[i];
            if (bl) bl.intensity = 0.5 + Math.abs(Math.sin(t * 3.5 - i * 1.2 + proximity * 3)) * 0.9;
        }

        // ── Stripe running wave (4 phase groups) ─────────────────────────
        for (let i = 0; i < 4; i++) {
            STRIPE_MATS[i].emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2.8 - i * 1.1)) * 1.3;
        }

        // ── Tentacle FK animation (6 segments per chain, deeper curl) ─────
        const huntMult = state.current === 'hunting' || state.current === 'lunge'
            || jsPhase.current !== 'none' ? 1.8 : 1.0;
        for (let ti = 0; ti < N_TENT; ti++) {
            const chainPhase = (ti / N_TENT) * Math.PI * 2;
            for (let j = 0; j < TENT_SEGS; j++) {
                const grp = tentacleRefs.current[ti]?.[j];
                if (!grp) continue;
                const ph = t * 2.2 * huntMult - chainPhase - j * 0.7;
                // Per-joint amplitude grows toward tip
                const amp = (0.12 + j * 0.10) * (jsPhase.current !== 'none' ? 2.4 : 1.0);
                grp.rotation.z = Math.sin(ph) * amp;
                grp.rotation.x = Math.cos(ph * 0.65) * amp * 0.5;
                grp.rotation.y = Math.sin(ph * 0.4 + j * 0.3) * amp * 0.25;
            }
        }

        // ── Eye tracking — pupils slide toward player in local head space ─
        if (eyeLPupilRef.current && eyeRPupilRef.current && rootRef.current) {
            const pp = playerPositionRef.current;
            const dxp = (pp?.x ?? 0) - pos.current.x;
            const dyp = (pp?.y ?? 0) - pos.current.y;
            const dzp = (pp?.z ?? 0) - pos.current.z;
            const invQ = rootRef.current.quaternion.clone().invert();
            const localDir = _v1.current.set(dxp, dyp, dzp).normalize().applyQuaternion(invQ);
            const ex = THREE.MathUtils.clamp(localDir.x, -0.08, 0.08);
            const ey = THREE.MathUtils.clamp(localDir.y, -0.06, 0.06);
            eyeLPupilRef.current.position.set(-0.60 + ex, 0.18 + ey, 0.52);
            eyeRPupilRef.current.position.set( 0.60 + ex, 0.18 + ey, 0.52);
        }
    }, []);

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

        const playerY = playerPositionRef.current?.y ?? 0;
        if (state.current === 'dormant' || !active.current || playerY >= SWIM_THRESHOLD_Y) {
            if (monsterProximityRef) monsterProximityRef.current = 0;
            g.visible = false;
            return;
        }
        g.visible = true;

        // Awakening — stirs in place
        if (state.current === 'awakening') {
            awakenTimer.current -= safeDt;
            for (let i = 0; i < N_BODY; i++) {
                const seg = segRefs.current[i];
                if (seg) seg.rotation.y = Math.sin(t * 0.9 - i * 0.3) * 0.05;
            }
            g.position.copy(SPAWN_POS);
            if (monsterPositionRef) monsterPositionRef.current.copy(SPAWN_POS);
            const ad = SPAWN_POS.distanceTo(playerPositionRef.current);
            if (monsterProximityRef) monsterProximityRef.current = Math.max(0, 1 - ad / AWARENESS_DIST) * 0.25;
            if (awakenTimer.current <= 0) state.current = 'patrol';
            return;
        }

        // Per-frame values
        const pp = playerPositionRef.current;
        const px = pp?.x ?? 0, py = pp?.y ?? -10, pz = pp?.z ?? 0;
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dxp = px - fx, dyp = py - fy, dzp = pz - fz;
        const dist     = Math.sqrt(dxp*dxp + dyp*dyp + dzp*dzp);
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);

        if (monsterPositionRef) monsterPositionRef.current.set(fx, fy, fz);
        if (monsterProximityRef) monsterProximityRef.current = proximity;

        // 3D jumpscare — scripted, overrides normal AI
        if (jsPhase.current !== 'none') {
            jsTimer.current += safeDt;
            const jt = jsTimer.current;

            if (jsPhase.current === 'turn') {
                vel.current.x *= Math.max(0, 1 - safeDt * 14);
                vel.current.y *= Math.max(0, 1 - safeDt * 14);
                vel.current.z *= Math.max(0, 1 - safeDt * 14);
                if (cameraShakeRef) cameraShakeRef.current = true;
                if (jt > 0.40) jsPhase.current = 'rush';
            } else if (jsPhase.current === 'rush') {
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
            return;
        }

        // AI state transitions
        switch (state.current) {
            case 'patrol':
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;
            case 'hunting':
                if (dist < LUNGE_DIST) {
                    _v1.current.set(dxp, dyp, dzp).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    // Stricter angle requirement — monster must be more aligned to commit
                    if (fwd.dot(_v1.current) > 0.45 || dist < 2.6) {
                        state.current = 'lunge';
                        lDir.current.set(dxp/dist, dyp/dist, dzp/dist);
                    }
                }
                break;
            case 'lunge':
                if (dist < CATCH_DIST && !caught.current) {
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

        // Movement
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
                const speed  = berserk ? HUNT_SPEED_MAX * BERSERK_HUNT_MULT
                    : HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                _v1.current.set(dxp/dist, dyp/dist, dzp/dist).multiplyScalar(speed);
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
                // Coral pillar avoidance
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
                vel.current.lerp(_v1.current, safeDt * 3.0);
                break;
            }
            case 'lunge': {
                const ls = berserk ? LUNGE_SPEED * BERSERK_LUNGE_MULT : LUNGE_SPEED;
                vel.current.lerp(
                    _v1.current.set(lDir.current.x * ls, lDir.current.y * ls, lDir.current.z * ls),
                    safeDt * 11,
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

        // Apply velocity + bounds + wall collision
        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -29, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);

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

    // Memo: tooth list as arrays so React doesn't re-create on each render
    const outerLowerTeeth = useMemo(() => OUTER_LOWER.map(([x, y, z], i) => (
        <mesh key={`ol${i}`} geometry={OUTER_TOOTH_GEO} material={TOOTH_MAT}
            position={[x, y, z]} scale={[1, TOOTH_SCALES[i], 1]} />
    )), []);
    const outerUpperTeeth = useMemo(() => OUTER_UPPER.map(([x, y, z], i) => (
        <mesh key={`ou${i}`} geometry={OUTER_TOOTH_GEO} material={TOOTH_MAT}
            position={[x, y, z]} rotation={[Math.PI, 0, 0]}
            scale={[1, TOOTH_SCALES[i + 12], 1]} />
    )), []);
    const innerTeeth = useMemo(() => INNER_TEETH.map(([x, y, z, lower], i) => (
        <mesh key={`in${i}`} geometry={INNER_TOOTH_GEO} material={INNER_TOOTH_MAT}
            position={[x, y, z]} rotation={[lower ? 0 : Math.PI, 0, 0]}
            scale={[1, TOOTH_SCALES[i + 22], 1]} />
    )), []);
    const ghostTeeth = useMemo(() => GHOST_TEETH.map(([x, y, z], i) => (
        <mesh key={`gh${i}`} geometry={GHOST_TOOTH_GEO} material={GHOST_TOOTH_MAT}
            position={[x, y, z]} rotation={[i % 2 === 0 ? 0 : Math.PI, 0, 0]} />
    )), []);

    return (
        <group ref={rootRef} visible={false}>

            {/* ── HEAD GROUP ──────────────────────────────────────────────── */}
            <group ref={headRef}>
                {/* Skull bulge behind the main head */}
                <mesh geometry={SKULL_GEO} material={SKIN_MAT}
                    scale={[1.18, 0.95, 1.10]} position={[0, 0.18, -0.10]} />
                {/* Main head sphere */}
                <mesh geometry={HEAD_GEO} material={SKIN_MAT}
                    scale={[1.55, 0.78, 1.18]} position={[0, 0.05, 0.35]} />
                {/* Gill slits — 2 per side */}
                <mesh geometry={GILL_GEO} material={DARK_MAT}
                    position={[ 0.78, 0.0, 0.10]} rotation={[0, -Math.PI / 2, 0.4]} />
                <mesh geometry={GILL_GEO} material={DARK_MAT}
                    position={[ 0.74, 0.0, -0.10]} rotation={[0, -Math.PI / 2, 0.4]} />
                <mesh geometry={GILL_GEO} material={DARK_MAT}
                    position={[-0.78, 0.0, 0.10]} rotation={[0, Math.PI / 2, -0.4]} />
                <mesh geometry={GILL_GEO} material={DARK_MAT}
                    position={[-0.74, 0.0, -0.10]} rotation={[0, Math.PI / 2, -0.4]} />

                {/* JAW — child of head, hinged */}
                <group ref={jawRef} position={[0, -0.10, 0.30]}>
                    <mesh geometry={JAW_GEO} material={SKIN_MAT}
                        scale={[1.62, 0.66, 1.16]} position={[0, -0.20, 0.02]} />
                    {/* Teeth on the jaw rotate WITH it */}
                    {outerLowerTeeth}
                    {innerTeeth.filter((_, i) => INNER_TEETH[i][3])}
                </group>

                {/* Upper teeth — stay on head (don't rotate with jaw) */}
                {outerUpperTeeth}
                {innerTeeth.filter((_, i) => !INNER_TEETH[i][3])}
                {ghostTeeth}

                {/* EYES */}
                <mesh geometry={EYE_SCLERA_GEO} material={SCLERA_MAT} position={[-0.62, 0.18, 0.44]} />
                <mesh geometry={EYE_IRIS_GEO}   material={IRIS_MAT}   position={[-0.60, 0.18, 0.50]} />
                <mesh ref={eyeLPupilRef} geometry={PUPIL_GEO} material={PUPIL_MAT}
                    position={[-0.60, 0.18, 0.52]} />

                <mesh geometry={EYE_SCLERA_GEO} material={SCLERA_MAT} position={[ 0.62, 0.18, 0.44]} />
                <mesh geometry={EYE_IRIS_GEO}   material={IRIS_MAT}   position={[ 0.60, 0.18, 0.50]} />
                <mesh ref={eyeRPupilRef} geometry={PUPIL_GEO} material={PUPIL_MAT}
                    position={[ 0.60, 0.18, 0.52]} />

                {/* TENTACLES — 8 chains × 6 nested FK segments */}
                {TENT_ROOTS.map(([rx, ry, rz], ti) => (
                    <group key={`tent${ti}`} position={[rx, ry, rz]}>
                        <TentacleChain index={ti} refs={tentacleRefs} />
                    </group>
                ))}

                {/* ANGLERFISH LURE */}
                <mesh geometry={LURE_STALK_GEO} material={DARK_MAT}
                    position={[0, 0.65, 0.22]} rotation={[0.50, 0, 0]} />
                <mesh geometry={LURE_GEO} material={LURE_MAT} position={[0, 1.10, -0.10]} />
                <pointLight ref={lureLightRef} position={[0, 1.10, -0.10]}
                    color="#00ffee" intensity={1.2} distance={10} decay={2} />
                <pointLight position={[0, 1.10, -0.10]}
                    color="#00ccdd" intensity={0.4} distance={22} decay={2} />
            </group>

            {/* ── PECTORAL FINS (groups for multi-axis articulation) ────── */}
            <group ref={pectLRef} position={[ 0.82, -0.05, -0.18]}>
                <mesh geometry={PECT_GEO} material={DARK_MAT} scale={[1, 1, 1.8]} />
            </group>
            <group ref={pectRRef} position={[-0.82, -0.05, -0.18]}>
                <mesh geometry={PECT_GEO} material={DARK_MAT} scale={[1, 1, 1.8]} />
            </group>

            {/* ── SPINE FK CHAIN (18 nested segments + 3-segment caudal) ── */}
            <SpineFK refs={segRefs} dorsalRefs={dorsalRefs}
                bioRefs={bioLightRefs} caudalRefs={caudalRefs} />
        </group>
    );
};
