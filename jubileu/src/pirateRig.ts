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
import { makeFabricDetail } from './floor7Textures';

// one shared detail-bump for every captain instance (cheap, tileable).
let _fabricDetail: THREE.CanvasTexture | null = null;
function fabricDetail(): THREE.CanvasTexture {
    if (!_fabricDetail) { _fabricDetail = makeFabricDetail(); _fabricDetail.repeat.set(4, 4); }
    return _fabricDetail;
}

// The raw model is ~1m tall (feet at y=-0.5). The procedural captain it
// replaces stood ~1.55m with FLOOR7_SCALE applied on top; this lifts the GLB to
// a captain that reads a head taller than the player on the rolling deck.
// desired WORLD height of the captain (the GLB is ~1m tall; the player eye is
// ~1.55, so this stands him a clear head taller). Applied as a SINGLE effective
// parent scale by the caller (which cancels the ship's own scale first).
export const PIRATE_SCALE = 2.4;
// feet sit at GLB-local y=-0.5; lift the rig so the group origin is at the feet.
export const PIRATE_FOOT_LIFT = 0.5;

// ── Bone indices (same shape as the Diabrete so the anim code reads the same) ──
export const enum PB { root, body, head, l_arm, r_arm, l_leg, r_leg }

export interface PirateRig {
    group: THREE.Group;          // add to your scene; holds the bound SkinnedMesh
    bones: THREE.Bone[];         // index with PB.*
    // Each bone's REST local position (relative to its parent). Animation MUST
    // offset from these, never assign absolute BP values — the bone hierarchy
    // stores parent-relative offsets (e.g. body's rest local-y is +0.45, NOT the
    // absolute -0.05), so assigning the absolute value sinks/teleports the limb.
    restPos: THREE.Vector3[];
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
// legs hang off the ROOT, NOT the body: if the legs are children of the torso bone
// they inherit every breath/lean/laugh the torso does, which shears the thigh skin
// (hip rises with the torso while the boot stays planted = a stretched leg). Parenting
// them to the root keeps the boots independent of the upper-body performance.
const BPARENT = [-1, 0, 1, 1, 1, 0, 0] as const;
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

        // The GLB is ONE fused mesh, so the trick is to weight it as if it were SEPARATE
        // parts — each region rides one bone rigidly — otherwise the cloth smears/shears and
        // the captain looks "contorted". The key: the long COAT/CAPE skirt belongs to the
        // TORSO, not the legs, so it sways as one piece while the boots step underneath.

        // HEAD — head + tricorne; sharp so the hat is a rigid block (no neck shear on the laugh).
        s[PB.head] = ss(y, 0.20, 0.30);

        // ARMS — the coat SLEEVES: outer-x columns from mid-torso to shoulder, so an arm move
        // carries its sleeve (but stays off the chest/back so the coat body doesn't follow).
        const armY = ss(y, -0.04, 0.07) * (1 - ss(y, 0.18, 0.28));
        s[PB.l_arm] = armY * ss(-x, 0.06, 0.12);   // left  (x < 0)
        s[PB.r_arm] = armY * ss( x, 0.06, 0.12);   // right (x > 0)

        // LEGS — ONLY the boots / lower shins (low Y), split L/R with a dead-zone at the
        // centreline. The draping coat skirt ABOVE the boots is intentionally NOT claimed here
        // (it goes to the body), so a leg swing moves the boot, not the whole skirt.
        const bootBand = 1 - ss(y, -0.30, -0.18);
        s[PB.l_leg] = bootBand * ss(0.02 - x, 0.0, 0.05);
        s[PB.r_leg] = bootBand * ss(0.02 + x, 0.0, 0.05);

        // BODY — the WHOLE torso + the hanging coat/cape skirt: everything below the head that
        // the sleeves and boots didn't strongly claim. So the coat is one rigid piece on the
        // torso bone and never tears between the legs or shears on a lean.
        const claimed = s[PB.l_arm] + s[PB.r_arm] + s[PB.l_leg] + s[PB.r_leg] + s[PB.head];
        s[PB.body] = Math.max(0.03, (1 - ss(y, 0.18, 0.30)) * (1 - claimed));

        // ROOT — tiny constant so no vertex is ever fully unweighted.
        s[PB.root] = 0.005;

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
    geo.computeVertexNormals();
    // No geometry bake: keep the GLB's native coords (feet at y=-0.5). Size + foot
    // lift are applied by the caller's group (a SINGLE effective parent scale, the
    // same setup the Diabrete rig binds correctly). Baking + binding detached and
    // then mounting under the ship's scale sank the mesh.

    // Keep the GLB's own baked PBR material (clone so animating mat props on the
    // captain can't leak into other users of the cached gltf). MeshStandardMaterial
    // already supports skinning — no shader surgery needed.
    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0xb08050 });

    // ── surface-detail pass ──────────────────────────────────────────────────
    // The Tripo bake ships a near-FLAT normal map (#8080ff almost everywhere), so
    // the coat/skin/leather render as a plastic sheet under PBR light despite the
    // detailed albedo. Layer a tiled fabric/grain BUMP on top (three.js applies
    // bumpMap AND the baked normalMap together) to restore micro-relief, and tune
    // the PBR so cloth reads matte instead of wet-glossy.
    mat.bumpMap = fabricDetail();
    mat.bumpScale = 0.16;
    if (mat.map) { mat.map.anisotropy = 8; (mat.map as THREE.Texture).needsUpdate = true; }
    // the baked metalness lives in the ORM blue channel (~0 across the figure), but
    // clamp the multiplier so no residual specular metalness plasticises the cloth;
    // calm the env reflection so broad sky-sheen doesn't flatten the surface.
    mat.metalness = 0.0;
    mat.envMapIntensity = 0.55;

    // ── albedo grime/tonal break-up (onBeforeCompile) ────────────────────────
    // The Tripo bake's albedo is a near-uniform flat field per region (a "toy" look
    // the dialogue camera lingers on). Inject value variation in-shader (no asset,
    // GPU-cheap, and — unlike the bump — it renders everywhere): darken the lower
    // coat/boots as hem grime, add low-frequency board-to-board tonal noise, and a
    // faint desaturated salt lift on the upper body. Driven by the REST-pose local
    // position (feet y≈-0.5 → head ≈+0.5) so the wear stays put as he animates.
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vGrimePos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGrimePos = position;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vGrimePos;')
            .replace('#include <map_fragment>', `#include <map_fragment>
            {
                float gy = vGrimePos.y;
                float hem = mix(0.58, 1.0, smoothstep(-0.5, 0.0, gy));          // soil the lower coat/boots
                float tone = 1.0 + 0.10 * sin(vGrimePos.x*27.0) * cos(vGrimePos.y*19.0 + vGrimePos.z*23.0); // board-to-board variance
                diffuseColor.rgb *= hem * tone;
                float salt = smoothstep(0.12, 0.42, gy) * 0.07;                 // desaturated salt bloom up top
                float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), salt);
            }`);
    };
    mat.needsUpdate = true;

    // Bones — rest positions in the GLB's native coords (feet at y=-0.5), exactly
    // mirroring the Diabrete rig's construction (no flush, no bake).
    const bones: THREE.Bone[] = BNAME.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    bones.forEach((bone, i) => {
        const pi = BPARENT[i];
        if (pi >= 0) {
            bones[pi].add(bone);
            bone.position.set(BP[i][0] - BP[pi][0], BP[i][1] - BP[pi][1], BP[i][2] - BP[pi][2]);
        } else {
            bone.position.set(...BP[i]);
        }
    });
    // snapshot the rest local positions so the animation can offset from them
    const restPos = bones.map((b) => b.position.clone());

    const skeleton = new THREE.Skeleton(bones);

    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.castShadow = true;
    skinned.frustumCulled = false;
    skinned.add(bones[0]);
    skinned.bind(skeleton);
    // ensure each vertex's 4 weights sum to exactly 1.0 — unnormalised weights are a
    // classic source of skin distortion/stretch when a bone rotates (three.js docs).
    skinned.normalizeSkinWeights();

    const group = new THREE.Group();
    group.add(skinned);

    return {
        group,
        bones,
        restPos,
        dispose: () => {
            skeleton.dispose();
            geo.dispose();
            mat.dispose();
        },
    };
}
