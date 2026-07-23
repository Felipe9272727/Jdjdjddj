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
    f7_hull_sx(t: number, h: number): number;
    f7_hull_sy(t: number, h: number): number;
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

    // calculate max halfX for planar UV projection (fore-aft, no distortion along seams)
    let maxHalfX = 0;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const halfX = e.f7_hull_beam(t) * 0.80;
        maxHalfX = Math.max(maxHalfX, halfX);
    }

    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const z = STERNZ + (BOWZ - STERNZ) * t;
        const dy = e.f7_hull_deckY(t) + 0.015;
        const halfX = e.f7_hull_beam(t) * 0.80;        // just inside the bulwark
        // planar UV: x→u linear world space, z→v linear along fore-aft
        const u_left = (-maxHalfX + maxHalfX) / (2 * maxHalfX);  // left edge at normalized x
        const u_right = (maxHalfX + maxHalfX) / (2 * maxHalfX);  // right edge at normalized x
        const v = (t) * 6;  // repeat factor same as before
        pos.push(-halfX, dy, z); uv.push(u_left, v);
        pos.push(halfX, dy, z); uv.push(u_right, v);
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

// A wale: a proud horizontal rubbing-strake swept along the hull at height
// fraction h (0 keel .. 1 rail), laid flush on the C++ hull surface (sampled via
// f7_hull_sx/sy) and pushed out so it stands proud — a box section (outer face +
// top/bottom bevels) so it reads as real structure breaking up the slab.
export function buildWaleGeometry(h: number, proud = 0.07, halfThick = 0.08): THREE.BufferGeometry {
    const e = exports(); e.f7_hull_build();
    const N = 64;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let base = 0;
    for (const side of [-1, 1]) {
        const start = base;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const z = STERNZ + (BOWZ - STERNZ) * t;
            const sx = e.f7_hull_sx(t, h), sy = e.f7_hull_sy(t, h);
            const xIn = side * sx;                  // flush on the hull
            const xOut = side * (sx + proud);       // proud lip
            // 4 verts per station: in-top, out-top, out-bot, in-bot
            pos.push(xIn, sy + halfThick, z); uv.push(0, t * 10);
            pos.push(xOut, sy + halfThick * 0.6, z); uv.push(0.3, t * 10);
            pos.push(xOut, sy - halfThick * 0.6, z); uv.push(0.7, t * 10);
            pos.push(xIn, sy - halfThick, z); uv.push(1, t * 10);
        }
        const stride = 4;
        for (let i = 0; i < N; i++) {
            const a = start + i * stride, b = a + stride;
            for (let k = 0; k < 3; k++) {           // 3 quads: top bevel, outer face, bottom bevel
                const p0 = a + k, p1 = a + k + 1, q0 = b + k, q1 = b + k + 1;
                if (side < 0) idx.push(p0, q0, p1, p1, q0, q1);
                else idx.push(p0, p1, q0, p1, q1, q0);
            }
        }
        base += (N + 1) * stride;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

// The inner bulwark face: a vertical wall swept just inboard of the hull's top
// edge, from deck level up to the rail, so the bulwark reads as a THICK timber
// (deck -> inner planking -> cap rail -> outer hull) instead of a knife edge.
let _inner: THREE.BufferGeometry | null = null;
export function buildInnerWallGeometry(inset = 0.72): THREE.BufferGeometry {
    if (_inner) return _inner;
    const e = exports(); e.f7_hull_build();
    const N = 56;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let base = 0;
    for (const side of [-1, 1]) {
        const start = base;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const z = STERNZ + (BOWZ - STERNZ) * t;
            const x = side * e.f7_hull_beam(t) * inset;
            pos.push(x, e.f7_hull_railY(t) + 0.07, z); uv.push(0, t * 6);
            pos.push(x, e.f7_hull_deckY(t), z); uv.push(1, t * 6);
        }
        for (let i = 0; i < N; i++) {
            const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
            if (side > 0) idx.push(a, c, b, b, c, d);   // face inboard
            else idx.push(a, b, c, b, d, c);
        }
        base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    _inner = g;
    return g;
}

// The waterway: a chamfered timber beam running the full perimeter in the
// deck-to-bulwark corner (where the deck planking meets the ship's side) — the
// structural beam the critic asked for, swept along the C++ deck edge.
let _waterway: THREE.BufferGeometry | null = null;
export function buildWaterwayGeometry(): THREE.BufferGeometry {
    if (_waterway) return _waterway;
    const e = exports(); e.f7_hull_build();
    const N = 56;
    const pos: number[] = [], idx: number[] = [];
    let base = 0;
    for (const side of [-1, 1]) {
        const start = base;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const z = STERNZ + (BOWZ - STERNZ) * t;
            const dy = e.f7_hull_deckY(t), hb = e.f7_hull_beam(t);
            const xo = side * hb * 0.76, xi = side * hb * 0.69;
            // chamfer: outer-top high, inner-top a touch lower (drains inboard)
            pos.push(xo, dy + 0.1, z); pos.push(xi, dy + 0.07, z);
        }
        for (let i = 0; i < N; i++) {
            const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
            if (side < 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
        }
        base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    _waterway = g;
    return g;
}

// Caulk seams: thin dark fore-and-aft lines laid on the deck at regular beam
// fractions (they fan with the hull taper, converging toward the bow) so the
// deck reads as laid planking with black caulk, not laminate.
let _seams: THREE.BufferGeometry | null = null;
export function buildDeckSeams(): THREE.BufferGeometry {
    if (_seams) return _seams;
    const e = exports(); e.f7_hull_build();
    const N = 56, K = 16, hw = 0.013;
    const pos: number[] = [], idx: number[] = [];
    let base = 0;
    for (let k = 0; k <= K; k++) {
        const f = k / K;                       // 0..1 across the beam
        const start = base;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const z = STERNZ + (BOWZ - STERNZ) * t;
            const cx = (f * 2 - 1) * e.f7_hull_beam(t) * 0.80;
            const dy = e.f7_hull_deckY(t) + 0.006;
            pos.push(cx - hw, dy, z); pos.push(cx + hw, dy, z);
        }
        for (let i = 0; i < N; i++) { const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
        base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    _seams = g;
    return g;
}

// sheer-curve samplers (for placing props/masts/ribs along the deck line in JS)
export function deckYAt(t: number): number { return exports().f7_hull_deckY(t); }
export function railYAt(t: number): number { return exports().f7_hull_railY(t); }
export function beamAt(t: number): number { return exports().f7_hull_beam(t); }
export function sxAt(t: number, h: number): number { return exports().f7_hull_sx(t, h); }
export function syAt(t: number, h: number): number { return exports().f7_hull_sy(t, h); }
