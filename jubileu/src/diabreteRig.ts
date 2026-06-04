/**
 * diabreteRig.ts — builds a procedural skeleton for the rig-less Diabrete GLB
 * and binds two SkinnedMeshes (toon fill + inverted-hull ink outline) to it.
 *
 * The GLB ships with NO bones and NO animations, so the whole rig is
 * synthesised here from the raw vertex cloud. Spatial analysis of the mesh
 * (bbox X ±0.43, Y 0→1.0, Z ±0.20) revealed the pose:
 *
 *     Y 0.85–0.97  head            (centred)
 *     Y 0.60–0.80  torso/shoulders (widening)
 *     Y 0.47–0.60  ARMS held OUT sideways (a wide horizontal bar reaching the
 *                  full ±0.43 width — hands at the outer edges)
 *     Y 0.41–0.47  waist           (narrow)
 *     Y 0.00–0.40  two legs        (split left/right with a gap at x≈0)
 *
 * Weight painting therefore puts the arms in an OUTER-X band at mid height,
 * the legs in a bilateral lower band, the head up top, and the torso in the
 * central column — all with smooth cubic falloffs so the skin flows instead of
 * tearing at zone borders.
 */

import * as THREE from 'three';

// Shared visual scale — the raw model is only ~1m tall, which read as a tiny
// doll on the platforms (and barely filled the cutscene frame). Bumped so the
// devil stands a head TALLER than the player and actually reads as a threat.
export const DIABRETE_SCALE = 2.2;

// ── Bone indices ──────────────────────────────────────────────────────────────
export const enum B { root, body, head, l_arm, r_arm, l_leg, r_leg }

export interface DiabreteRig {
    group: THREE.Group;          // add to your scene; holds fill + outline
    bones: THREE.Bone[];         // index with B.*
    dispose: () => void;
}

// Rest positions (model-local, feet at Y=0) derived from the vertex analysis.
const BP: ReadonlyArray<readonly [number, number, number]> = [
    [0,     0.00, 0],   // root
    [0,     0.46, 0],   // body  — waist pivot
    [0,     0.84, 0],   // head
    [-0.22, 0.55, 0],   // l_arm — left shoulder (arm extends out to x≈-0.43)
    [ 0.22, 0.55, 0],   // r_arm — right shoulder
    [-0.10, 0.33, 0],   // l_leg — left hip
    [ 0.10, 0.33, 0],   // r_leg — right hip
];
const BPARENT = [-1, 0, 1, 1, 1, 1, 1] as const;
const BNAME   = ['root', 'body', 'head', 'l_arm', 'r_arm', 'l_leg', 'r_leg'] as const;

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

        // HEAD — top of the model.
        s[B.head] = ss(y, 0.74, 0.84);

        // ARMS — the wide horizontal bar at mid height, OUTER X only. The hands
        // sit at ±0.43, the shoulders meet the torso near ±0.22, so the band
        // ramps in from |x|=0.22 outward and lives in Y 0.43–0.62.
        const armY = ss(y, 0.42, 0.49) * (1 - ss(y, 0.60, 0.68));
        s[B.l_arm] = armY * ss(-x, 0.22, 0.30);   // left  (x < 0)
        s[B.r_arm] = armY * ss( x, 0.22, 0.30);   // right (x > 0)

        // LEGS — lower half, split by X sign (+0.04 bias avoids a seam at x=0).
        const legBand = 1 - ss(y, 0.40, 0.52);
        s[B.l_leg] = legBand * ss(0.04 - x, 0.0, 0.12);
        s[B.r_leg] = legBand * ss(0.04 + x, 0.0, 0.12);

        // BODY — central torso column, whatever the limbs/head didn't claim.
        const claimed = s[B.l_arm] + s[B.r_arm] + s[B.l_leg] + s[B.r_leg] + s[B.head];
        s[B.body] = Math.max(0.05,
            ss(y, 0.33, 0.50) * (1 - ss(y, 0.66, 0.80)) * (1 - claimed));

        // ROOT — tiny constant so no vertex is ever fully unweighted.
        s[B.root] = 0.01;

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

// Pre-expand a geometry copy along its normals for the inverted-hull outline.
//
// The Diabrete GLB (from Tripo) has SPLIT vertices at UV/normal seams — many
// verts sharing a position but carrying different normals. Extruding each along
// its own normal tears the hull open at every seam, which reads as ugly black
// streaks crawling across his body ("looks like a bugged texture"). The scenery
// avoids this because its outlines are on clean primitives. The fix: WELD the
// normals — average every normal that shares a position and extrude all coincident
// verts along that single averaged direction, so the shell stays watertight and
// the outline becomes a clean silhouette like the rest of the world.
function makeOutlineGeo(src: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
    const geo = src.clone();
    const P = geo.attributes.position.array as Float32Array;
    const Nn = geo.attributes.normal.array as Float32Array;
    const n = P.length / 3;

    const key = (x: number, y: number, z: number) =>
        `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    const acc = new Map<string, [number, number, number]>();
    for (let i = 0; i < n; i++) {
        const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        let e = acc.get(k);
        if (!e) { e = [0, 0, 0]; acc.set(k, e); }
        e[0] += Nn[i * 3]; e[1] += Nn[i * 3 + 1]; e[2] += Nn[i * 3 + 2];
    }
    for (const e of acc.values()) {
        const l = Math.hypot(e[0], e[1], e[2]) || 1;
        e[0] /= l; e[1] /= l; e[2] /= l;
    }
    for (let i = 0; i < n; i++) {
        const e = acc.get(key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]))!;
        P[i * 3]     += e[0] * thickness;
        P[i * 3 + 1] += e[1] * thickness;
        P[i * 3 + 2] += e[2] * thickness;
    }
    geo.attributes.position.needsUpdate = true;
    return geo;
}

// 3-band toon gradient + shared ink outline material.
const _grad = (() => {
    const d = new Uint8Array([230, 220, 200, 190, 178, 155, 140, 128, 106, 90, 80, 65]);
    const t = new THREE.DataTexture(d, 4, 1, THREE.RGBFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
})();
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0712, side: THREE.BackSide });

/**
 * Build the rig from a loaded GLTF scene. Returns a group containing the bound
 * fill + outline SkinnedMeshes and the bone array to animate. `null` if no mesh
 * was found.
 */
export function buildDiabreteRig(gltf: THREE.Object3D): DiabreteRig | null {
    let src: THREE.Mesh | null = null;
    gltf.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (!src) return null;
    const mesh = src as THREE.Mesh;

    const fillGeo = mesh.geometry.clone();
    const { joints, weights } = paintWeights(fillGeo.attributes.position.array as Float32Array);
    fillGeo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(joints, 4));
    fillGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    fillGeo.computeVertexNormals();

    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const fillMat = new THREE.MeshToonMaterial({
        map: srcMat?.map ?? null,
        color: srcMat?.map ? 0xffffff : 0xf2e8d0,
        gradientMap: _grad,
    });
    // Add a crisp fresnel RIM LIGHT on top of the toon banding so the Diabrete
    // reads with the same stylised "edge pop" as the floor's createToonMaterial
    // (cartoonToon.ts) — the single biggest cue that made him look like he was
    // from another renderer. Done via onBeforeCompile so MeshToonMaterial keeps
    // its built-in SKINNING (a raw ShaderMaterial would freeze the rig). Guarded:
    // if the expected chunk isn't present (three.js internals changed) we skip
    // the injection and fall back to plain toon rather than ship a broken shader.
    fillMat.onBeforeCompile = (shader) => {
        if (!shader.fragmentShader.includes('#include <opaque_fragment>')) return;
        shader.uniforms.uRimColor = { value: new THREE.Color(0xfff3d4) };
        shader.uniforms.uRimPow   = { value: 2.6 };
        shader.uniforms.uRimStr   = { value: 0.5 };
        // Use the view-space normal's Z as the fresnel term (normal.z→1 faces the
        // camera, →0 at the silhouette). MeshToonMaterial doesn't expose
        // vViewPosition, but `normal` is always defined by normal_fragment_begin,
        // so this is robust. No new varyings, no vertex-shader changes.
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'uniform vec3 uRimColor;\nuniform float uRimPow;\nuniform float uRimStr;\nvoid main() {')
            .replace('#include <opaque_fragment>',
                'float _rimF = pow(1.0 - clamp(normal.z, 0.0, 1.0), uRimPow);\n'
                + 'outgoingLight += uRimColor * (smoothstep(0.4, 0.75, _rimF) * uRimStr);\n'
                + '#include <opaque_fragment>');
    };
    // Distinct cache key so the patched program isn't shared with a plain toon.
    fillMat.customProgramCacheKey = () => 'diabrete-toon-rim';

    // Bones (parented hierarchy, local offsets from parent rest position).
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

    const skeleton = new THREE.Skeleton(bones);

    const fill = new THREE.SkinnedMesh(fillGeo, fillMat);
    fill.castShadow = true;
    fill.frustumCulled = false;
    fill.add(bones[0]);
    fill.bind(skeleton);

    // Ink outline: fixed-width inverted hull. Bumped from 0.026 → 0.04 so the
    // silhouette stays readable at gameplay distance (the devil leads ~14u
    // ahead) without a distance-scaled shader (which would need skinning).
    const outlineGeo = makeOutlineGeo(fillGeo, 0.04);
    const outline = new THREE.SkinnedMesh(outlineGeo, _outlineMat);
    outline.frustumCulled = false;
    outline.bind(skeleton);

    const group = new THREE.Group();
    group.add(outline);   // behind
    group.add(fill);

    return {
        group,
        bones,
        dispose: () => {
            skeleton.dispose();
            fillGeo.dispose();
            outlineGeo.dispose();
            fillMat.dispose();
        },
    };
}
