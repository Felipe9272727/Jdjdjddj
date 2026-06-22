/**
 * pirateRig.ts — builds a procedural skeleton for the rig-less pirate-captain
 * GLB (a Tripo-generated STATIC mesh: 1 mesh, 1 PBR material, 3 baked textures,
 * NO bones, NO animations) and binds a SkinnedMesh to it, so the captain can be
 * animated (idle sway, breathing, walk, head-track, ship roll) bone by bone.
 *
 * Same approach as diabreteRig.ts: synthesise the whole rig from the raw vertex
 * cloud. Spatial analysis of THIS mesh (bbox X ±0.14, Y -0.5→0.5, Z ±0.25,
 * 3829 verts) read the pose — a captain standing, arms at his sides:
 *
 *     Y  0.22 → 0.50   head + tricorne   (z narrows to the face, then the brim)
 *     Y  0.00 → 0.25   torso / shoulders (the coat; deepest in Z = belly/chest)
 *     Y -0.10 → 0.00   waist
 *     Y -0.50 → -0.10  two legs / boots  (split left/right at x≈0)
 *     arms run down the OUTER-X edges of the torso band (|x| ≳ 0.06)
 *
 * Weight painting puts the head up top, a central torso column, arms in the
 * outer-x mid band, and bilateral legs below — smooth cubic falloffs so the
 * skin flows instead of tearing at the zone borders. The GLB keeps its own
 * baked PBR material (we only add skinning), so it looks like the model the
 * user authored, not a re-shaded primitive.
 */

import * as THREE from 'three';

// The raw model is ~1m tall (feet at y=-0.5). The procedural captain it
// replaces stood ~1.55m with FLOOR7_SCALE applied on top; this lifts the GLB to
// a captain that reads a head taller than the player on the rolling deck.
// desired WORLD height of the captain (the GLB is ~1m tall; the player eye is
// ~1.55, so this stands him a clear head taller). Applied as a SINGLE effective
// parent scale by the caller (which cancels the ship's own scale first).
export const PIRATE_SCALE = 3.0;
// feet sit at GLB-local y=-0.5; lift the rig so the group origin is at the feet.
export const PIRATE_FOOT_LIFT = 0.5;

// ── Bone indices (same shape as the Diabrete so the anim code reads the same) ──
export const enum PB { root, body, head, l_arm, r_arm, l_leg, r_leg }

export interface PirateRig {
    group: THREE.Group;          // add to your scene; holds the bound SkinnedMesh
    bones: THREE.Bone[];         // index with PB.*
    dispose: () => void;
}

// Rest positions in GLB-local space (feet at Y=-0.5), from the vertex analysis.
const BP: ReadonlyArray<readonly [number, number, number]> = [
    [0,     -0.50, 0],   // root  — between the feet
    [0,     -0.05, 0],   // body  — waist pivot
    [0,      0.30, 0],   // head  — neck/head base
    [-0.10,  0.12, 0],   // l_arm — left shoulder (arm runs down the side)
    [ 0.10,  0.12, 0],   // r_arm — right shoulder
    [-0.05, -0.18, 0],   // l_leg — left hip
    [ 0.05, -0.18, 0],   // r_leg — right hip
];
const BPARENT = [-1, 0, 1, 1, 1, 1, 1] as const;
const BNAME   = ['p_root', 'p_body', 'p_head', 'p_l_arm', 'p_r_arm', 'p_l_leg', 'p_r_leg'] as const;

// smoothstep
function ss(v: number, lo: number, hi: number): number {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}

// ── Weight painting ───────────────────────────────────────────────────────────
function paintWeights(pos: Float32Array): { joints: Uint16Array; weights: Float32Array } {
    const N = pos.length / 3;
    const J = new Uint16Array(N * 4);
    const W = new Float32Array(N * 4);

    for (let i = 0; i < N; i++) {
        const x = pos[i * 3];
        const y = pos[i * 3 + 1];
        const s = new Float32Array(7);

        // HEAD — everything above the collar (head + tricorne).
        s[PB.head] = ss(y, 0.2, 0.3);

        // ARMS — the OUTER-X edges of the torso band. Arms hang at the sides, so
        // they live in Y 0.0–0.22 and ramp in from |x|≈0.06 outward.
        const armY = ss(y, -0.02, 0.06) * (1 - ss(y, 0.2, 0.3));
        s[PB.l_arm] = armY * ss(-x, 0.06, 0.11);   // left  (x < 0)
        s[PB.r_arm] = armY * ss( x, 0.06, 0.11);   // right (x > 0)

        // LEGS — lower half, split by X sign (+0.02 bias avoids a seam at x=0).
        const legBand = 1 - ss(y, -0.14, 0.02);
        s[PB.l_leg] = legBand * ss(0.02 - x, 0.0, 0.07);
        s[PB.r_leg] = legBand * ss(0.02 + x, 0.0, 0.07);

        // BODY — central torso column, whatever the limbs/head didn't claim.
        const claimed = s[PB.l_arm] + s[PB.r_arm] + s[PB.l_leg] + s[PB.r_leg] + s[PB.head];
        s[PB.body] = Math.max(0.05,
            ss(y, -0.12, 0.04) * (1 - ss(y, 0.18, 0.30)) * (1 - claimed));

        // ROOT — tiny constant so no vertex is ever fully unweighted.
        s[PB.root] = 0.01;

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

/**
 * Build the rig from a loaded GLTF scene. Returns a group holding the bound
 * SkinnedMesh (keeping the GLB's own textured material) + the bone array to
 * animate. `null` if no mesh was found.
 */
export function buildPirateRig(gltf: THREE.Object3D): PirateRig | null {
    let src: THREE.Mesh | null = null;
    gltf.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (!src) return null;
    const mesh = src as THREE.Mesh;

    const geo = mesh.geometry.clone();
    // paint weights on the ORIGINAL vertex positions (feet at y=-0.5) before any
    // bake — the skin attributes are per-vertex so the later translate/scale keeps
    // them valid.
    const { joints, weights } = paintWeights(geo.attributes.position.array as Float32Array);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    // Bake foot-lift (feet -0.5 -> 0) AND the full target size into the geometry,
    // so the mesh is already PIRATE_SCALE tall at object-scale 1. The caller then
    // mounts it so its NET world scale is exactly 1 (it cancels the ship's scale),
    // meaning the detached bind (captured at scale 1) matches the render scale (1)
    // — no scale-about-bone displacement, so the captain neither shrinks nor sinks.
    geo.translate(0, PIRATE_FOOT_LIFT, 0);
    geo.scale(PIRATE_SCALE, PIRATE_SCALE, PIRATE_SCALE);

    // Keep the GLB's own baked PBR material (clone so animating mat props on the
    // captain can't leak into other users of the cached gltf). MeshStandardMaterial
    // already supports skinning — no shader surgery needed.
    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xb08050 });

    // Bones — rest positions lifted + scaled the SAME as the geometry so the bind
    // reproduces the rest mesh at the baked size, feet at the origin.
    const S = PIRATE_SCALE, LZ = PIRATE_FOOT_LIFT;
    const BPB = BP.map((p): [number, number, number] => [p[0] * S, (p[1] + LZ) * S, p[2] * S]);
    const bones: THREE.Bone[] = BNAME.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    bones.forEach((bone, i) => {
        const pi = BPARENT[i];
        if (pi >= 0) {
            bones[pi].add(bone);
            bone.position.set(BPB[i][0] - BPB[pi][0], BPB[i][1] - BPB[pi][1], BPB[i][2] - BPB[pi][2]);
        } else {
            bone.position.set(...BPB[i]);
        }
    });

    // CRITICAL: update the bones' world matrices from their rest positions BEFORE
    // building the Skeleton — its constructor computes the bind inverses from
    // bone.matrixWorld, which is otherwise still identity (positions set but never
    // flushed), giving identity inverses that shift every vertex by its bone's
    // rest offset (the captain sank into the deck). One flush fixes the bind.
    bones[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);

    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.castShadow = true;
    skinned.frustumCulled = false;
    skinned.add(bones[0]);
    skinned.bind(skeleton);

    const group = new THREE.Group();
    group.add(skinned);

    return {
        group,
        bones,
        dispose: () => {
            skeleton.dispose();
            geo.dispose();
            mat.dispose();
        },
    };
}
