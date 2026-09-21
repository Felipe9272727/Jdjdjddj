import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createConciergeGeometry } from '../f12ConciergeGeometry';

const finite = (n: number) => Number.isFinite(n);

function hitsAlongZ(geometry: THREE.BufferGeometry, x: number, y: number) {
    // DoubleSide keeps this structural aperture check independent of winding.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(mesh, false);
}

describe('Floor 12 Blender concierge mesh', () => {
    it('decodes finite normals and valid indexed triangles at the authored scale', () => {
        const geometry = createConciergeGeometry();
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        const index = geometry.getIndex();
        expect(position.count).toBe(5075);
        expect(index?.count).toBe(30462);
        expect(Array.from(position.array as ArrayLike<number>).every(finite)).toBe(true);
        expect(Array.from(normal.array as ArrayLike<number>).every(finite)).toBe(true);
        expect(Array.from(index!.array as ArrayLike<number>).every((i) => i < position.count)).toBe(true);

        const box = geometry.boundingBox!;
        expect(box.min.x).toBeCloseTo(-2.951, 3);
        expect(box.min.y).toBeCloseTo(-1.175, 3);
        expect(box.min.z).toBeCloseTo(1.55, 3);
        expect(box.max.x).toBeCloseTo(2.951, 3);
        expect(box.max.y).toBeCloseTo(3.422, 3);
        expect(box.max.z).toBeCloseTo(3.864, 3);
        const authoredRootScale = 7.2 / 3.6;
        expect(box.getSize(new THREE.Vector3()).x * authoredRootScale).toBeCloseTo(11.804, 3);
        geometry.dispose();
    });

    it('keeps the animated eye sockets and mouth target open while retaining nose and cheeks', () => {
        const geometry = createConciergeGeometry();
        // Front-facing rays use the Blender/game +Z convention. Eye and mouth
        // rays must pass through the carved shell; nose and cheek rays must hit.
        expect(hitsAlongZ(geometry, -1.55, 1.15)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 1.55, 1.15)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 0, -1.95)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 0, 0.30).length).toBeGreaterThan(0);
        expect(hitsAlongZ(geometry, -2.13, -0.12).length).toBeGreaterThan(0);
        expect(hitsAlongZ(geometry, 2.13, -0.12).length).toBeGreaterThan(0);
        geometry.dispose();
    });
});
