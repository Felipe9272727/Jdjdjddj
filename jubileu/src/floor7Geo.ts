// floor7Geo.ts — bridges the C++-generated ship hull (floor7_geo.cpp, in the
// same WASM module as the brain) into Three.js BufferGeometries. The hull is
// MODELLED in C++ (lofted cross-sections with sheer, tumblehome, a raked stem
// and integrated bulwarks). Here we copy the hull buffers out of WASM memory,
// and we build the deck surface + rail caps by SAMPLING the same C++ sheer/beam
// curves (f7_hull_deckY / railY / beam) so every part of the ship sweeps with
// the same lines. Cached: built once for the whole app.
import * as THREE from 'three';
import { decodeFloor7Wasm } from './floor7-wasm';

interface GeoExports {
    memory: WebAssembly.Memory;
    f7_hull_build(): number;
    f7_hull_verts(): number; f7_hull_norms(): number; f7_hull_uvs(): number; f7_hull_idx(): number;
    f7_hull_vcount(): number; f7_hull_icount(): number;
    f7_hull_deckY(t: number): number;
    f7_hull_railY(t: number): number;
    f7_hull_beam(t: number): number;
}

// keep in sync with floor7_geo.cpp
const STERNZ = -7.0, BOWZ = 8.2;

let _exports: GeoExports | null = null;
function exports(): GeoExports {
    if (_exports) return _exports;
    const inst = new WebAssembly.Instance(new WebAssembly.Module(decodeFloor7Wasm()), {});
    _exports = inst.exports as unknown as GeoExports;
    return _exports;
}

let _hull: THREE.BufferGeometry | null = null;
export function buildHullGeometry(): THREE.BufferGeometry {
    if (_hull) return _hull;
    const e = exports();
    const vc = e.f7_hull_build();
    const ic = e.f7_hull_icount();
    const buf = e.memory.buffer;
    const verts = new Float32Array(buf, e.f7_hull_verts(), vc * 3).slice();
    const uvs = new Float32Array(buf, e.f7_hull_uvs(), vc * 2).slice();
    const idx = new Uint32Array(buf, e.f7_hull_idx(), ic).slice();

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); // smooth the lofted surface
    _hull = g;
    return g;
}

// The deck: a surface filling the inside of the hull at deck level, following
// the sheer (rises at bow/stern) and narrowing to the pointed bow & bluff stern.
let _deck: THREE.BufferGeometry | null = null;
export function buildDeckGeometry(): THREE.BufferGeometry {
    if (_deck) return _deck;
    const e = exports(); e.f7_hull_build();
    const N = 56;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const z = STERNZ + (BOWZ - STERNZ) * t;
        const dy = e.f7_hull_deckY(t) + 0.015;
        const halfX = e.f7_hull_beam(t) * 0.80;        // just inside the bulwark
        pos.push(-halfX, dy, z); uv.push(0, t * 6);
        pos.push(halfX, dy, z); uv.push(1, t * 6);
    }
    for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    _deck = g;
    return g;
}

// The rail caps: thin rounded timber capping the top of each bulwark, swept
// along the sheer line on both sides (and converging at bow & stern).
let _rail: THREE.BufferGeometry | null = null;
export function buildRailGeometry(): THREE.BufferGeometry {
    if (_rail) return _rail;
    const e = exports(); e.f7_hull_build();
    const N = 56, capW = 0.16, capH = 0.07;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let base = 0;
    for (const side of [-1, 1]) {
        const start = base;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const z = STERNZ + (BOWZ - STERNZ) * t;
            const ry = e.f7_hull_railY(t);
            const hx = e.f7_hull_beam(t) * 0.79;       // matches hull rail x (tumblehome)
            const xo = side * (hx + capW * 0.5);
            const xi = side * (hx - capW * 0.5);
            pos.push(xo, ry + capH, z); uv.push(0, t * 6);
            pos.push(xi, ry + capH, z); uv.push(1, t * 6);
        }
        for (let i = 0; i < N; i++) {
            const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
            if (side < 0) idx.push(a, c, b, b, c, d);
            else idx.push(a, b, c, b, d, c);
        }
        base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    _rail = g;
    return g;
}

// sheer-curve samplers (for placing props/masts along the deck line in JS)
export function deckYAt(t: number): number { return exports().f7_hull_deckY(t); }
export function railYAt(t: number): number { return exports().f7_hull_railY(t); }
export function beamAt(t: number): number { return exports().f7_hull_beam(t); }
