// floor7Geo.ts — bridges the C++-generated ship geometry (floor7_geo.cpp, in the
// same WASM module as the brain) into a Three.js BufferGeometry. The hull is
// MODELLED in C++ (lofted cross-sections); here we just copy the vertex/normal/
// uv/index buffers out of WASM memory and hand them to the GPU. Cached: the hull
// is built once for the whole app.
import * as THREE from 'three';
import { decodeFloor7Wasm } from './floor7-wasm';

interface GeoExports {
    memory: WebAssembly.Memory;
    f7_hull_build(): number;
    f7_hull_verts(): number; f7_hull_norms(): number; f7_hull_uvs(): number; f7_hull_idx(): number;
    f7_hull_vcount(): number; f7_hull_icount(): number;
}

let _hull: THREE.BufferGeometry | null = null;

export function buildHullGeometry(): THREE.BufferGeometry {
    if (_hull) return _hull;
    const inst = new WebAssembly.Instance(new WebAssembly.Module(decodeFloor7Wasm()), {});
    const e = inst.exports as unknown as GeoExports;
    const vc = e.f7_hull_build();
    const ic = e.f7_hull_icount();
    const buf = e.memory.buffer;
    // copy out (slice → detached from WASM memory, safe to keep)
    const verts = new Float32Array(buf, e.f7_hull_verts(), vc * 3).slice();
    const norms = new Float32Array(buf, e.f7_hull_norms(), vc * 3).slice();
    const uvs = new Float32Array(buf, e.f7_hull_uvs(), vc * 2).slice();
    const idx = new Uint32Array(buf, e.f7_hull_idx(), ic).slice();

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); // smooth the lofted surface
    _hull = g;
    return g;
}
