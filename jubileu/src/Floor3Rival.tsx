/**
 * Floor3Rival.tsx — "O Diabrete": procedurally-rigged rubber-hose rival that
 * runs AHEAD of the player on Floor 3.
 *
 * The GLB has zero skeleton. This file builds a 7-bone rig at load time:
 *   1. Paint skinning weights onto every vertex via spatial proximity rules
 *      (head zone, arm zones, leg zones, torso fill — smooth transitions)
 *   2. Pre-expand a second geometry copy along vertex normals for the
 *      inverted-hull ink outline (same skeleton → deforms in perfect sync)
 *   3. Each frame: alternate leg/arm pendulums, body bounce + forward lean,
 *      head counter-bob — all spring-damped for rubber-hose follow-through
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { platforms as f3Platforms, f3PlayerZ } from './f3Parkour';

// ── Config ────────────────────────────────────────────────────────────────────
const RIVAL_URL  = '/diabrete.glb';
const LEAD_Z     = 14;    // units ahead of player the rival stays
const MOVE_SPD   = 6.2;   // Z-pursuit speed (units/sec)
const JUMP_VEL   = 8.0;   // Y launch speed when stepping up to a higher platform
const GRAVITY    = 22.0;  // same as Floor 3 player physics
const CHAR_SCALE = 1.55;  // visual scale so character reads well against platforms

// ── Bone enum / layout ────────────────────────────────────────────────────────
// 7 bones: root, body, head, l_arm, r_arm, l_leg, r_leg
// Model bbox: X ±0.434, Y 0→1.002, Z ±0.204 → Y density peaks at 0.45–0.55.
// The constriction at Y 0.40–0.45 marks the waist; arms exit at Y 0.52–0.76.
const enum B { root, body, head, l_arm, r_arm, l_leg, r_leg }

// World-space rest positions (model local, feet at Y=0)
const BP: ReadonlyArray<readonly [number, number, number]> = [
    [0,      0.00, 0],  // root
    [0,      0.46, 0],  // body — pelvis/torso pivot (at the waist)
    [0,      0.84, 0],  // head
    [-0.20,  0.65, 0],  // l_arm — left shoulder socket
    [ 0.20,  0.65, 0],  // r_arm — right shoulder socket
    [-0.10,  0.33, 0],  // l_leg — left hip socket
    [ 0.10,  0.33, 0],  // r_leg — right hip socket
];
const BPARENT = [-1, 0, 1, 1, 1, 1, 1] as const;
const BNAME   = ['root','body','head','l_arm','r_arm','l_leg','r_leg'] as const;

// ── Smooth step ───────────────────────────────────────────────────────────────
function ss(v: number, lo: number, hi: number): number {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}

// ── Weight painting ───────────────────────────────────────────────────────────
/**
 * Assign up to 4 bone influences per vertex using Y/X spatial zones with
 * smooth cubic transitions. Returns JOINTS_0 + WEIGHTS_0 ready for the GPU.
 *
 * Zone summary (bottom → top):
 *   l_leg / r_leg  — Y < 0.44, split by X sign
 *   body           — Y 0.33–0.70, central column
 *   l_arm / r_arm  — Y 0.52–0.76, lateral outer band
 *   head           — Y > 0.72
 *   root           — 0.01 catch-all (no vertex ever fully unweighted)
 */
function paintWeights(pos: Float32Array): { joints: Uint16Array; weights: Float32Array } {
    const N = pos.length / 3;
    const J = new Uint16Array(N * 4);
    const W = new Float32Array(N * 4);

    for (let i = 0; i < N; i++) {
        const x = pos[i * 3];
        const y = pos[i * 3 + 1];
        const s = new Float32Array(7);

        // HEAD — top quarter of the model
        s[B.head] = ss(y, 0.72, 0.82);

        // ARMS — mid-height band, outside the torso column
        const armBand = ss(y, 0.50, 0.65) * (1 - ss(y, 0.70, 0.80));
        s[B.l_arm] = armBand * ss(-x, 0.10, 0.23);   // left  (x < 0)
        s[B.r_arm] = armBand * ss( x, 0.10, 0.23);   // right (x > 0)

        // LEGS — lower half, split by X sign (+0.04 bias avoids hard seam at x=0)
        const legBand = 1 - ss(y, 0.40, 0.54);
        s[B.l_leg] = legBand * ss(0.04 - x, 0.0, 0.12);  // left
        s[B.r_leg] = legBand * ss(0.04 + x, 0.0, 0.12);  // right

        // BODY — torso residual fill
        const limbSum = s[B.l_arm] + s[B.r_arm] + s[B.l_leg] + s[B.r_leg] + s[B.head];
        s[B.body] = Math.max(0.05,
            ss(y, 0.33, 0.50) * (1 - ss(y, 0.68, 0.80)) * (1 - limbSum));

        // ROOT — tiny constant so every vertex is always influenced
        s[B.root] = 0.01;

        // Pick top-4, normalise
        const rank = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => s[b] - s[a]);
        let total = 0;
        for (let k = 0; k < 4; k++) total += s[rank[k]];
        if (total < 1e-8) total = 1;
        for (let k = 0; k < 4; k++) {
            J[i * 4 + k] = rank[k];
            W[i * 4 + k] = s[rank[k]] / total;
        }
    }
    return { joints: J, weights: W };
}

// ── Outline geometry — pre-expanded along vertex normals ──────────────────────
// Both geo copies share the same skinIndex/skinWeight so they deform in sync.
function makeOutlineGeo(src: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
    const geo = src.clone();
    const P = geo.attributes.position.array as Float32Array;
    const N = geo.attributes.normal.array as Float32Array;
    for (let i = 0, n = P.length / 3; i < n; i++) {
        P[i * 3]     += N[i * 3]     * thickness;
        P[i * 3 + 1] += N[i * 3 + 1] * thickness;
        P[i * 3 + 2] += N[i * 3 + 2] * thickness;
    }
    geo.attributes.position.needsUpdate = true;
    return geo;
}

// ── 3-band toon gradient ──────────────────────────────────────────────────────
const _grad = (() => {
    const d = new Uint8Array([230, 220, 200,  190, 178, 155,  140, 128, 106,  90, 80, 65]);
    const t = new THREE.DataTexture(d, 4, 1, THREE.RGBFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
})();
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0712, side: THREE.BackSide });

// ── Spring damper ─────────────────────────────────────────────────────────────
class Spring {
    value = 0; vel = 0;
    constructor(readonly k = 22, readonly d = 7) {}
    tick(target: number, dt: number) {
        this.vel += (-this.k * (this.value - target) - this.d * this.vel) * dt;
        this.value += this.vel * dt;
        return this.value;
    }
    reset(v = 0) { this.value = v; this.vel = 0; }
}

// ── Component ─────────────────────────────────────────────────────────────────
const Floor3Rival: React.FC = () => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const groupRef = useRef<THREE.Group>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const fillRef  = useRef<THREE.SkinnedMesh | null>(null);

    // World state
    const posRef  = useRef(new THREE.Vector3(0, 0, LEAD_Z));
    const velY    = useRef(0);
    const onGnd   = useRef(true);
    const phase   = useRef(0);

    // Springs
    const sBodyBob  = useRef(new Spring(24, 8));
    const sBodyLean = useRef(new Spring(14, 5));

    // ── Build rig once from loaded GLTF ──────────────────────────────────────
    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;

        let src: THREE.Mesh | null = null;
        gltf.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
        if (!src) { console.warn('[Diabrete] no mesh found in GLB'); return; }

        // ── Geometry + skinning data ────────────────────────────────────────
        const fillGeo = src.geometry.clone();
        const { joints, weights } = paintWeights(fillGeo.attributes.position.array as Float32Array);
        fillGeo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(joints, 4));
        fillGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
        fillGeo.computeVertexNormals();

        // ── Material — toon over the model's base-colour texture ────────────
        const srcMat = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.MeshStandardMaterial;
        const fillMat = new THREE.MeshToonMaterial({
            map: srcMat.map ?? null,
            color: srcMat.map ? 0xffffff : 0xf2e8d0,
            gradientMap: _grad,
        });

        // ── Bones ───────────────────────────────────────────────────────────
        const bones: THREE.Bone[] = BNAME.map((name) => {
            const b = new THREE.Bone(); b.name = name; return b;
        });
        bones.forEach((bone, i) => {
            const pi = BPARENT[i];
            if (pi >= 0) {
                bones[pi].add(bone);
                const [wx, wy, wz] = BP[i];
                const [px, py, pz] = BP[pi];
                bone.position.set(wx - px, wy - py, wz - pz);
            } else {
                bone.position.set(...BP[i]);
            }
        });

        // ── Skeleton + fill SkinnedMesh ─────────────────────────────────────
        const skeleton = new THREE.Skeleton(bones);
        const fill = new THREE.SkinnedMesh(fillGeo, fillMat);
        fill.castShadow = true;
        fill.frustumCulled = false;
        fill.add(bones[0]);   // root bone lives under the fill mesh
        fill.bind(skeleton);

        // ── Outline SkinnedMesh (pre-expanded geo, same skeleton) ───────────
        const outlineGeo = makeOutlineGeo(fillGeo, 0.026);
        const outline = new THREE.SkinnedMesh(outlineGeo, _outlineMat);
        outline.frustumCulled = false;
        outline.bind(skeleton);   // shares the same skeleton instance

        group.add(outline);  // outline first (rendered behind)
        group.add(fill);
        bonesRef.current = bones;
        fillRef.current  = fill;

        // Init springs to avoid pop on first frame
        sBodyBob.current.reset(0);
        sBodyLean.current.reset(0.14);

        return () => {
            group.remove(fill, outline);
            skeleton.dispose();
            fillGeo.dispose();
            outlineGeo.dispose();
            fillMat.dispose();
            bonesRef.current = [];
            fillRef.current  = null;
        };
    }, [gltf]);

    // ── Per-frame: movement + bone animation ─────────────────────────────────
    useFrame((_, dt) => {
        if (!groupRef.current || !bonesRef.current.length) return;
        const safeDt = Math.min(dt, 0.05);
        const bones  = bonesRef.current;

        // ─ Target position ──────────────────────────────────────────────────
        const targetZ = f3PlayerZ.current + LEAD_Z;

        // Find nearest platform for ground height + X
        let best: { cz: number; topY: number; x: number } | null = null;
        for (const p of f3Platforms) {
            if (!best || Math.abs(p.cz - targetZ) < Math.abs(best.cz - targetZ)) best = p;
        }
        const groundY = best?.topY ?? 0;
        const groundX = best?.x    ?? 0;

        // Z: move toward target at MOVE_SPD
        const dz = targetZ - posRef.current.z;
        posRef.current.z += Math.sign(dz) * Math.min(Math.abs(dz), MOVE_SPD * safeDt);

        // X: smoothly follow platform centre
        posRef.current.x += (groundX - posRef.current.x) * (1 - Math.exp(-6 * safeDt));

        // Y: launch when platform rises significantly, fall under gravity
        const yDiff = groundY - posRef.current.y;
        if (onGnd.current && yDiff > 0.28) {
            velY.current = Math.sqrt(2 * GRAVITY * (yDiff + 0.5)) * 1.05;
            onGnd.current = false;
        }
        if (!onGnd.current) {
            velY.current -= GRAVITY * safeDt;
            posRef.current.y += velY.current * safeDt;
            if (posRef.current.y <= groundY && velY.current <= 0) {
                posRef.current.y = groundY;
                velY.current = 0;
                onGnd.current = true;
            }
        } else {
            // Spring-snap to ground when stepping down
            posRef.current.y += yDiff * (1 - Math.exp(-14 * safeDt));
        }

        groupRef.current.position.copy(posRef.current);

        // ─ Bone animation ───────────────────────────────────────────────────
        const airborne = !onGnd.current;
        if (!airborne) phase.current += safeDt * 2.4 * Math.PI * 2;
        const φ = phase.current;

        // BODY — bob up/down + forward lean
        const bobTarget  = airborne ? 0 : Math.abs(Math.sin(φ)) * 0.055;
        const leanTarget = airborne ? -0.18 : 0.14;
        bones[B.body].position.y =
            (BP[B.body][1] - BP[B.root][1]) + sBodyBob.current.tick(bobTarget, safeDt);
        bones[B.body].rotation.x = sBodyLean.current.tick(leanTarget, safeDt);

        // HEAD — counter-bob + gentle sway (don't follow body's lean perfectly)
        bones[B.head].rotation.x = airborne ? -0.12 : 0.09 + Math.sin(φ * 2 + 0.6) * 0.04;
        bones[B.head].rotation.z = airborne ? 0 : Math.sin(φ + 0.3) * 0.055;

        // LEGS — alternating pendulum  (tuck up when airborne)
        if (airborne) {
            bones[B.l_leg].rotation.x = -0.44;
            bones[B.r_leg].rotation.x = -0.44;
        } else {
            bones[B.l_leg].rotation.x =  Math.sin(φ) * 0.60;
            bones[B.r_leg].rotation.x = -Math.sin(φ) * 0.60;
        }

        // ARMS — counter-swing to legs (rubber-hose run: big reach)
        bones[B.l_arm].rotation.x = airborne ?  0.36 : -Math.sin(φ) * 0.72;
        bones[B.r_arm].rotation.x = airborne ?  0.36 :  Math.sin(φ) * 0.72;
        // Float arms outward + sway in cycle
        bones[B.l_arm].rotation.z =  0.14 + Math.abs(Math.sin(φ)) * 0.10;
        bones[B.r_arm].rotation.z = -0.14 - Math.abs(Math.sin(φ)) * 0.10;

        // Squash/stretch (whole-mesh scale for rubber-hose feel)
        if (fillRef.current) {
            const strY = airborne
                ? 1 + Math.abs(velY.current) * 0.011   // stretch while falling
                : 1 - Math.abs(Math.sin(φ)) * 0.055;   // squash on heel-strike
            const strX = 1 / Math.sqrt(Math.max(0.55, strY));
            fillRef.current.scale.set(strX, strY, strX);
        }
    });

    return <group ref={groupRef} scale={[CHAR_SCALE, CHAR_SCALE, CHAR_SCALE]} />;
};

useGLTF.preload(RIVAL_URL);
export default Floor3Rival;
