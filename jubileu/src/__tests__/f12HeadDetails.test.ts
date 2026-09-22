import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
    createConciergeJaw,
    createConciergeSkull,
    createFaceDetails,
} from '../f12HeadDetails';
import { createConciergeGeometry } from '../f12ConciergeGeometry';

const finiteArray = (array: ArrayLike<number>) => Array.from(array).every(Number.isFinite);

function rayHits(geometry: THREE.BufferGeometry, x: number, y: number) {
    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(mesh, false);
}

describe('Floor 12 concierge head details', () => {
    it('keeps the rear skull behind the sculpt and present behind both eye centres', () => {
        const sculpt = createConciergeGeometry();
        const skull = createConciergeSkull();

        for (const x of [-1.55, 1.55]) {
            const sculptHits = rayHits(sculpt, x, 1.15);
            const skullHits = rayHits(skull, x, 1.15);
            // The sculpt deliberately leaves the animated eye socket empty.
            expect(sculptHits).toHaveLength(0);
            expect(skullHits.length).toBeGreaterThan(0);
        }

        // A cheek ray crosses the authored sculpt first, then the rear housing.
        for (const x of [-2.2, 2.2]) {
            const sculptHits = rayHits(sculpt, x, 1.15);
            const skullHits = rayHits(skull, x, 1.15);
            expect(sculptHits.length).toBeGreaterThan(0);
            expect(skullHits.length).toBeGreaterThan(0);
            expect(sculptHits[0].distance).toBeLessThan(skullHits[0].distance);
        }

        sculpt.dispose();
        skull.dispose();
    });

    it('leaves the mouth ray open to the rear of the cavity', () => {
        const skull = createConciergeSkull();
        const hits = rayHits(skull, 0, -1.95);

        // The front shell is removed here. Any remaining hit is the rear
        // housing, so it must be behind the positive-Z face of the sculpt.
        expect(hits.length).toBeGreaterThan(0);
        expect(Math.max(...hits.map(hit => hit.point.z))).toBeLessThan(0.5);
        skull.dispose();
    });

    it('keeps projected rims and cracks finite and attached to the sculpt', () => {
        const sculpt = createConciergeGeometry();
        const details = createFaceDetails(sculpt);
        const projected = [...details.rims, ...details.cracks.flatMap(({ edge, ember }) => [edge, ember])];

        expect(projected.length).toBe(14);
        for (const geometry of projected) {
            const position = geometry.getAttribute('position');
            geometry.computeBoundingSphere();
            expect(position.count).toBeGreaterThan(0);
            expect(finiteArray(position.array)).toBe(true);
            expect(finiteArray(geometry.boundingSphere?.center.toArray() ?? [])).toBe(true);
            expect(Number.isFinite(geometry.boundingSphere?.radius ?? NaN)).toBe(true);
            geometry.dispose();
        }
        sculpt.dispose();
    });

    it('bounds the shallow jaw and separates its dark rear material group', () => {
        const jaw = createConciergeJaw();
        const position = jaw.getAttribute('position');
        const normal = jaw.getAttribute('normal');
        jaw.computeBoundingBox();
        const box = jaw.boundingBox!;

        expect(jaw.groups.length).toBeGreaterThanOrEqual(2);
        expect(jaw.groups.some(group => group.materialIndex === 1)).toBe(true);
        expect(finiteArray(position.array)).toBe(true);
        expect(finiteArray(normal.array)).toBe(true);
        expect(box.min.x).toBeLessThan(-2.2);
        expect(box.max.x).toBeGreaterThan(2.2);
        expect(box.min.y).toBeLessThan(-1.1);
        expect(box.max.y).toBeGreaterThan(0.4);
        expect(box.min.z).toBeGreaterThan(0.2);
        expect(box.max.z).toBeLessThan(1.2);
        jaw.dispose();
    });
});
