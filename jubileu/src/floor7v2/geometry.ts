import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FLOOR7_V2_STERN_Z = -7;
export const FLOOR7_V2_BOW_Z = 8.2;

export interface Floor7ShipGeometrySet {
    hull: THREE.BufferGeometry;
    deck: THREE.BufferGeometry;
    upperDecks: THREE.BufferGeometry;
    cabin: THREE.BufferGeometry;
    rails: THREE.BufferGeometry;
    trim: THREE.BufferGeometry;
    masts: THREE.BufferGeometry;
    sails: THREE.BufferGeometry;
    sailWear: THREE.BufferGeometry;
    rigging: THREE.BufferGeometry;
    iron: THREE.BufferGeometry;
}

const station = (t: number) => {
    const end = Math.sin(Math.PI * Math.pow(t, 0.82));
    const beam = 0.4 + 2.5 * Math.pow(Math.max(0, end), 0.5);
    // Kept inside the existing gameplay envelope: the old brain assumes a deck
    // close to y=0 even at the ends of the ship.
    const sheer = 0.02 + 0.27 * Math.pow(Math.min(1, Math.abs(t - 0.48) * 2), 2.35);
    const keel = -1.75 + 0.65 * Math.pow(Math.abs(t - 0.52) * 2, 1.8);
    return { z: THREE.MathUtils.lerp(FLOOR7_V2_STERN_Z, FLOOR7_V2_BOW_Z, t), beam, sheer, keel };
};

export function floor7V2DeckY(z: number): number {
    return station(THREE.MathUtils.clamp((z - FLOOR7_V2_STERN_Z) / (FLOOR7_V2_BOW_Z - FLOOR7_V2_STERN_Z), 0, 1)).sheer;
}

/** Public sampling helpers used by collision/geometry contract tests. */
export const deckYV2 = floor7V2DeckY;
export function beamV2(z: number): number {
    return station(THREE.MathUtils.clamp((z - FLOOR7_V2_STERN_Z) / (FLOOR7_V2_BOW_Z - FLOOR7_V2_STERN_Z), 0, 1)).beam;
}

function loftHull(): THREE.BufferGeometry {
    const n = 48, pos: number[] = [], uv: number[] = [], index: number[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, s = station(t);
        const cross: Array<[number, number]> = [
            [-s.beam * .9, s.sheer + .62], [-s.beam, s.sheer - .18], [-s.beam * .72, s.keel + .55],
            [0, s.keel], [s.beam * .72, s.keel + .55], [s.beam, s.sheer - .18], [s.beam * .9, s.sheer + .62],
        ];
        cross.forEach(([x, y], k) => { pos.push(x, y, s.z); uv.push(k / 6, t * 4); });
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) {
        const a = i * 7 + k, b = a + 7;
        index.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals(); return g;
}

function deck(): THREE.BufferGeometry {
    const n = 48, pos: number[] = [], uv: number[] = [], index: number[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, s = station(t), w = s.beam * .84;
        pos.push(-w, s.sheer + .02, s.z, w, s.sheer + .02, s.z); uv.push(0, t * 8, 1, t * 8);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}

const box = (size: [number, number, number], at: [number, number, number], rot: [number, number, number] = [0, 0, 0]) =>
    new THREE.BoxGeometry(...size).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));

const cyl = (r: number, h: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], seg = 10) =>
    new THREE.CylinderGeometry(r, r * 1.03, h, seg).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));

function between(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry {
    const d = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return new THREE.CylinderGeometry(r, r, d.length(), seg).applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
}

function curvedSail(width: number, height: number, at: [number, number, number], flip = false): THREE.BufferGeometry {
    const nx = 8, ny = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
        const u = x / nx, v = y / ny, taper = 1 - v * .24;
        pos.push((u - .5) * width * taper + at[0], at[1] - v * height, at[2] + Math.sin(u * Math.PI) * (flip ? -.18 : .18)); uv.push(u, v);
    }
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const a = y * (nx + 1) + x, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

let cached: Floor7ShipGeometrySet | undefined;
export function buildFloor7V2Geometries(): Floor7ShipGeometrySet {
    if (cached) return cached;
    const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;
    const upper: THREE.BufferGeometry[] = [box([4.0, .18, 2.35], [0, .56, -5.35]), box([3.35, .16, 1.6], [0, .45, 6.75])];
    for (let i = 0; i < 5; i++) { upper.push(box([.72, .12, .34], [-1.35, .12 + i * .105, -3.78 + i * .32])); upper.push(box([.72, .12, .34], [1.35, .12 + i * .105, -3.78 + i * .32])); }
    const rails: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
        let previous: THREE.Vector3 | null = null;
        for (let z = -6.45; z <= 7.7; z += .72) {
            const x = side * beamV2(z) * .91;
            const deckY = floor7V2DeckY(z);
            const top = new THREE.Vector3(x, deckY + .72, z);
            rails.push(between(new THREE.Vector3(x, deckY + .08, z), top, .038, 6));
            if (previous) rails.push(between(previous, top, .055, 7));
            previous = top;
        }
    }
    const trim: THREE.BufferGeometry[] = [box([4.35, .12, .12], [0, 1.0, -6.28]), box([3.0, .12, .12], [0, 1.02, 7.55])];
    for (const side of [-1, 1]) for (let z = -5.7; z < 6.5; z += 1.55) {
        if (beamV2(z) < 1.45) continue;
        trim.push(box([.08, .48, .72], [side * beamV2(z) * .96, floor7V2DeckY(z) - .22, z]));
    }
    const masts = merge([cyl(.17, 7.5, [0, 3.75, -.45], [0, 0, -.025], 12), cyl(.13, 5.5, [0, 2.75, 4.4], [0, 0, .02], 12), cyl(.1, 4.4, [0, 2.2, -5.1], [0, 0, -.04], 10), cyl(.09, 4.8, [0, 6.0, -.45], [Math.PI / 2, 0, 0], 10), cyl(.075, 3.8, [0, 4.4, 4.4], [Math.PI / 2, 0, 0], 10)]);
    const rig = merge([
        between(new THREE.Vector3(0, 7.4, -.45), new THREE.Vector3(-2.25, 1.0, -6), .018), between(new THREE.Vector3(0, 7.4, -.45), new THREE.Vector3(2.25, 1.0, -6), .018),
        between(new THREE.Vector3(0, 7.3, -.45), new THREE.Vector3(0, 1.0, 7.6), .018), between(new THREE.Vector3(-2.4, 6, -.45), new THREE.Vector3(-2.2, .95, 1.6), .014), between(new THREE.Vector3(2.4, 6, -.45), new THREE.Vector3(2.2, .95, 1.6), .014),
    ]);
    const iron: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) for (let z = -4.7; z < 5.8; z += 1.55) {
        const x = side * beamV2(z) * .985;
        iron.push(cyl(.17, .06, [x, floor7V2DeckY(z) - .2, z], [0, 0, Math.PI / 2], 10));
    }
    cached = {
        hull: loftHull(), deck: deck(), upperDecks: merge(upper),
        cabin: merge([box([3.55, 1.45, 1.75], [0, 1.28, -5.25]), box([3.86, .14, 2.02], [0, 2.04, -5.25]), box([.18, 1.3, 1.95], [-1.82, 1.3, -5.25]), box([.18, 1.3, 1.95], [1.82, 1.3, -5.25])]),
        rails: merge(rails), trim: merge(trim), masts,
        sails: merge([curvedSail(4.55, 2.35, [0, 6.75, -.2]), curvedSail(3.55, 1.9, [0, 4.95, 4.5], true), curvedSail(2.7, 1.45, [0, 4.0, -5.05])]),
        sailWear: merge([box([.035, .025, .035], [-.7, 5.55, -.01]), box([.03, .03, .03], [.85, 4.1, 4.32])]), rigging: rig, iron: merge(iron),
    };
    return cached;
}

export function disposeFloor7V2Geometries(): void {
    if (!cached) return; Object.values(cached).forEach((g) => g.dispose()); cached = undefined;
}

// Small public factories intentionally clone cached batches. Consumers are free
// to dispose their result without corrupting the shared in-game geometry set.
export const buildHullV2Geometry = () => buildFloor7V2Geometries().hull.clone();
export const buildDeckV2Geometry = () => buildFloor7V2Geometries().deck.clone();
export const buildDeckStructuresV2 = () => buildFloor7V2Geometries().upperDecks.clone();
export const buildCabinV2Geometry = () => buildFloor7V2Geometries().cabin.clone();
export const buildMastsV2Geometry = () => buildFloor7V2Geometries().masts.clone();
export const buildSailsV2Geometry = () => buildFloor7V2Geometries().sails.clone();
export const buildRiggingV2Geometry = () => buildFloor7V2Geometries().rigging.clone();
