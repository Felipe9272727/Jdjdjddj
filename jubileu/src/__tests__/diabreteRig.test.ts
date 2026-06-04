import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDiabreteRig, B } from '../diabreteRig';

// buildDiabreteRig binds two SkinnedMeshes (toon fill + ink outline) to a
// hand-built 7-bone skeleton. The #1 regression risk flagged for any material/
// rig change is the character FREEZING in its rest pose (skinning silently lost
// → bones no longer deform the mesh). These tests prove the skinning is live by
// driving a bone on the CPU and asserting the skinned vertices actually move —
// no WebGL/GPU needed.

function fakeGltf(): THREE.Object3D {
    // A box spanning Y 0..1 / X ±0.4 so paintWeights' spatial bands (head/arms/
    // legs/torso) all catch some vertices, like the real Diabrete mesh.
    const geo = new THREE.BoxGeometry(0.8, 1, 0.4, 2, 4, 2).translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const g = new THREE.Group();
    g.add(mesh);
    return g;
}

function findSkinned(group: THREE.Object3D): THREE.SkinnedMesh[] {
    const out: THREE.SkinnedMesh[] = [];
    group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh); });
    return out;
}

// Max displacement of any vertex between the current pose and a captured rest set.
function maxDisplacement(mesh: THREE.SkinnedMesh, rest: THREE.Vector3[]): number {
    const v = new THREE.Vector3();
    let max = 0;
    for (let i = 0; i < rest.length; i++) {
        mesh.applyBoneTransform(i, v.set(0, 0, 0));
        max = Math.max(max, v.distanceTo(rest[i]));
    }
    return max;
}

function snapshot(mesh: THREE.SkinnedMesh): THREE.Vector3[] {
    const n = mesh.geometry.attributes.position.count;
    const out: THREE.Vector3[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { mesh.applyBoneTransform(i, v.set(0, 0, 0)); out.push(v.clone()); }
    return out;
}

describe('buildDiabreteRig', () => {
    it('binds a fill + outline SkinnedMesh to a 7-bone skeleton', () => {
        const rig = buildDiabreteRig(fakeGltf());
        expect(rig).not.toBeNull();
        expect(rig!.bones.length).toBe(7);
        const skinned = findSkinned(rig!.group);
        expect(skinned.length).toBe(2);              // fill + ink outline
        rig!.dispose();
    });

    it('returns null when the GLTF has no mesh', () => {
        expect(buildDiabreteRig(new THREE.Group())).toBeNull();
    });

    it('DEFORMS when a bone rotates (skinning is live — not frozen in rest pose)', () => {
        const rig = buildDiabreteRig(fakeGltf())!;
        const fill = findSkinned(rig.group)[0];

        rig.group.updateMatrixWorld(true);
        fill.skeleton.update();
        const rest = snapshot(fill);

        // Raise the left arm hard.
        rig.bones[B.l_arm].rotation.set(0, 0, 1.5);
        rig.group.updateMatrixWorld(true);
        fill.skeleton.update();

        // At least one vertex must have moved meaningfully → the skin follows bones.
        expect(maxDisplacement(fill, rest)).toBeGreaterThan(0.1);
        rig.dispose();
    });

    it('the ink-outline mesh deforms in lock-step with the fill (shares the skeleton)', () => {
        const rig = buildDiabreteRig(fakeGltf())!;
        const [a, b] = findSkinned(rig.group);
        rig.group.updateMatrixWorld(true); a.skeleton.update(); b.skeleton.update();
        const restB = snapshot(b);
        rig.bones[B.r_leg].rotation.set(1.2, 0, 0);
        rig.group.updateMatrixWorld(true); a.skeleton.update(); b.skeleton.update();
        expect(maxDisplacement(b, restB)).toBeGreaterThan(0.05);
        rig.dispose();
    });
});
