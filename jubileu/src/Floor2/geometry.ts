/**
 * Floor2/geometry.ts — Procedural geometry creation functions, shared
 * geometry instances, noise function, and the glow texture.
 *
 * IMPORTANT: noise3D MUST be defined before any geometry that uses it.
 * All geometries are constructed at module load time (not per-render).
 */

import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mergeBufferGeometries as mergeGeometries } from 'three-stdlib';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, STALAGMITES, STALACTITES,
    UW_ROCK_COLLIDERS, UW_PILLAR_COLLIDERS, UW_CORAL_PILLARS, UW_ARCHES,
} from './constants';

// ─── Simplex noise instance (shared across all procedural geometry) ─────
// MUST be defined before any geometry that uses it (CAVE_FLOOR_GEO, etc.)
const noise3D = createNoise3D();

// ─── Procedural glow texture for sprites (prevents square artifacts) ────
export const GLOW_TEXTURE = (() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
})();

// ─── Shared simple geometries ─────────────────────────────────────────
export const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
export const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);
export const PEBBLE_GEO  = /*@__PURE__*/ createProceduralRock(1, 2, 0.3, 200);   // seixos: rocha lisa, não icosaedro de 20 faces
export const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.35, 0);
export const KELP_GEO    = new THREE.CylinderGeometry(0.06, 0.10, 1, 5, 4);
export const FISH_GEO    = new THREE.ConeGeometry(0.18, 0.55, 4);
export const DEBRIS_GEO  = new THREE.SphereGeometry(1, 3, 2);
export const PLANKTON_GEO = new THREE.SphereGeometry(1, 4, 3);
export const GOD_RAY_GEO = new THREE.CylinderGeometry(1, 0.3, 15, 8, 1, true);

// ─── Organic cave wall geometry helper ──────────────────────────────────
export function createOrganicCaveWall(
  width: number,
  height: number,
  segments: number = 64,
  seed: number = 0,
  amplitude: number = 3.5
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, segments, segments);
  const positions = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    let displacement = 0;
    displacement += noise3D(v.x * 0.03 + seed, v.y * 0.03, seed * 0.7) * amplitude;
    displacement += noise3D(v.x * 0.07 + seed, v.y * 0.07, seed * 1.1) * amplitude * 0.5;
    displacement += noise3D(v.x * 0.15 + seed, v.y * 0.15, seed * 1.3) * amplitude * 0.25;
    displacement += noise3D(v.x * 0.4 + seed, v.y * 0.4, seed * 2.1) * amplitude * 0.08;
    const ridge = Math.abs(noise3D(v.x * 0.08 + seed, v.y * 0.08, seed * 0.5)) * amplitude * 0.4;
    positions.setZ(i, v.z + Math.abs(displacement) + ridge);
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Cave ceiling geometry — displaced PlaneGeometry with stalactite-like bumps ───
export function createCaveCeiling(
  width: number,
  depth: number,
  segments: number = 80,
  seed: number = 99
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  const positions = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    let displacement = 0;
    displacement += noise3D(v.x * 0.025 + seed, v.y * 0.025, seed * 1.7) * 3.5;
    displacement += noise3D(v.x * 0.06 + seed, v.y * 0.06, seed * 0.9) * 1.8;
    const stalactiteNoise = Math.max(0, noise3D(v.x * 0.12 + seed, v.y * 0.12, seed * 2.3));
    displacement += stalactiteNoise * stalactiteNoise * 4.0;
    displacement += noise3D(v.x * 0.2 + seed, v.y * 0.2, seed * 3.1) * 0.8;
    displacement += noise3D(v.x * 0.5 + seed, v.y * 0.5, seed * 4.7) * 0.2;
    positions.setZ(i, v.z + Math.abs(displacement));
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Procedural rock geometry helper ────────────────────────────────────
export function createProceduralRock(
  radius: number = 1,
  detail: number = 2,
  roughness: number = 0.35,
  seed: number = 0
): THREE.BufferGeometry {
  // Vértices UNIDOS antes de deslocar (o icosaedro do three vem com cada face solta: deslocar por face
  // abria rachaduras e deixava tudo facetado). Desloca na direção radial, com camadas sedimentares e
  // arestas mais vivas; UV esférica no fim para as texturas.
  const base = new THREE.IcosahedronGeometry(radius, Math.max(detail, 4));
  base.deleteAttribute('normal'); base.deleteAttribute('uv');
  const geo = mergeVertices(base); base.dispose();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); d.copy(v).normalize();
    let disp = noise3D(d.x * 0.9 + seed, d.y * 0.9, d.z * 0.9) * roughness;
    disp += noise3D(d.x * 2.2 + seed, d.y * 2.2, d.z * 2.2) * roughness * 0.4;
    disp += (1 - Math.abs(noise3D(d.x * 4.5 + seed, d.y * 4.5, d.z * 4.5))) * roughness * 0.22;   // cristas
    disp += noise3D(d.x * 11 + seed, d.y * 11, d.z * 11) * roughness * 0.06;
    const strata = Math.sin(d.y * 9 + noise3D(d.x * 1.3, d.z * 1.3, seed) * 2.5);                  // camadas
    disp += Math.max(0, strata) * roughness * 0.12;
    const r = radius * (1 + disp) * (d.y < -0.55 ? 0.85 + 0.15 * (1 + d.y) / 0.45 : 1);          // base mais chata
    pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
    uv[i * 2] = 0.5 + Math.atan2(d.z, d.x) / (Math.PI * 2); uv[i * 2 + 1] = 0.5 + Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / Math.PI;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Coluna de rocha orgânica (no lugar do prisma de 8 lados): perfil torneado com base alargada e topo
 *  arredondado, corpo que ondula de lado, saliências, camadas e cavidades. Origem no pé. */
export function createRockPillar(h: number, rTop: number, rBot: number, seed: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 36;
  for (let k = 0; k <= N; k++) {
    const t = k / N, y = t * h;
    let r = rBot + (rTop - rBot) * Math.pow(t, 0.8);
    r *= 1 + 0.55 * Math.pow(1 - t, 6);                           // pé espalhado no leito
    if (t > 0.9) r *= Math.sqrt(Math.max(0.001, 1 - Math.pow((t - 0.9) / 0.1, 2)));   // topo arredondado
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / h, r = Math.hypot(v.x, v.z), ang = Math.atan2(v.z, v.x);
    const cx = Math.cos(ang), cz = Math.sin(ang);
    let disp = noise3D(cx * 1.2 + seed, v.y * 0.18, cz * 1.2) * 0.32;
    disp += noise3D(cx * 3 + seed, v.y * 0.6, cz * 3) * 0.14;
    disp += (1 - Math.abs(noise3D(cx * 5 + seed, v.y * 1.4, cz * 5))) * 0.1;
    disp += Math.max(0, Math.sin(v.y * 2.3 + noise3D(cx, cz, seed + v.y * .05) * 3)) * 0.1;   // camadas
    const nr = r * (1 + disp);
    const swayX = noise3D(seed, v.y * 0.09, 3) * 0.9 * t, swayZ = noise3D(seed, v.y * 0.09, 7) * 0.9 * t;   // o corpo serpenteia
    pos.setXYZ(i, cx * nr + swayX, v.y, cz * nr + swayZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Arco de rocha: um tubo em curva (pé esquerdo → topo → pé direito) com a mesma pele de rocha. */
export function createRockArch(h: number, span: number, thick: number, seed: number): THREE.BufferGeometry {
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-span / 2 - thick * .4, -0.3, 0), new THREE.Vector3(-span / 2, h * 0.55, 0.2),
    new THREE.Vector3(-span * 0.3, h * 0.95, -0.15), new THREE.Vector3(span * 0.25, h * 1.02, 0.1),
    new THREE.Vector3(span / 2, h * 0.5, -0.2), new THREE.Vector3(span / 2 + thick * .4, -0.3, 0),
  ]);
  const geo = new THREE.TubeGeometry(curva, 64, thick, 14, false);
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const pe = Math.max(0, 1 - (v.y + 0.3) / (h * 0.25));      // os pés engrossam
    let disp = noise3D(v.x * 0.5 + seed, v.y * 0.5, v.z * 0.5) * 0.45 + noise3D(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6) * 0.18;
    disp += (1 - Math.abs(noise3D(v.x * 3 + seed, v.y * 3, v.z * 3))) * 0.12 + pe * 0.7;
    v.addScaledVector(n, thick * disp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ─── Procedural stalactite geometry helper ──────────────────────────────
export function createProceduralStalactite(
  height: number,
  topRadius: number,
  bottomRadius: number = 0.05,
  segments: number = 10,
  heightSegs: number = 15,
  seed: number = 0
): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(topRadius, height, segments, heightSegs);
  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    n.fromBufferAttribute(normals, i);
    const yNorm = (v.y + height / 2) / height;
    const noiseAmt = yNorm * 0.25;
    const disp = noise3D(v.x * 2.0 + seed, v.y * 1.5, v.z * 2.0) * noiseAmt;
    positions.setX(i, v.x + n.x * disp);
    positions.setZ(i, v.z + n.z * disp);
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Cave floor with circular hole — ShapeGeometry + proper UVs ───────
export const CAVE_FLOOR_GEO = (() => {
    const shape = new THREE.Shape();
    // Size 31 so the floor extends past the walls (62×62 total, matching ceiling)
    const size = 31;
    shape.moveTo(-size, -size);
    shape.lineTo( size, -size);
    shape.lineTo( size,  size);
    shape.lineTo(-size,  size);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(HOLE_CENTER_X, -HOLE_CENTER_Z, HOLE_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    // 64 → 96 curve segments around the hole — smoother circle silhouette
    // and finer noise-displaced floor near the well rim.
    const geo = new THREE.ShapeGeometry(shape, 96);
    const positions = geo.attributes.position;
    // ── Override UVs: map world-space XY → UV based on the full floor span.
    // ShapeGeometry auto-UVs can be wrong with holes, so we compute our own.
    const uvAttr = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const dxH = v.x - HOLE_CENTER_X;
        const dyH = v.y + HOLE_CENTER_Z;
        const distToHole = Math.sqrt(dxH * dxH + dyH * dyH);
        const holeFade = Math.min(1, Math.max(0, (distToHole - HOLE_RADIUS) / 3));
        const edgeDist = Math.min(
            Math.abs(v.x - (-size)), Math.abs(v.x - size),
            Math.abs(v.y - (-size)), Math.abs(v.y - size)
        );
        const edgeFade = Math.min(1, edgeDist / 4);
        const fade = holeFade * edgeFade;
        const n1 = noise3D(v.x * 0.04, v.y * 0.04, 0.0) * 4.0;
        const n2 = noise3D(v.x * 0.1, v.y * 0.1, 5.0) * 2.0;
        const n3 = noise3D(v.x * 0.25, v.y * 0.25, 10.0) * 0.8;
        const n4 = noise3D(v.x * 0.6, v.y * 0.6, 15.0) * 0.2;
        const ridge1 = Math.abs(noise3D(v.x * 0.06, v.y * 0.06, 20.0)) * 2.5;
        const ridge2 = Math.abs(noise3D(v.x * 0.15, v.y * 0.15, 25.0)) * 1.0;
        const totalN = n1 + n2 + n3 + n4 + ridge1 + ridge2;
        positions.setZ(i, v.z + totalN * 2.5 * fade);
        // UV: map [-size, +size] → [0, 1] so texture repeat works correctly
        uvAttr.setXY(i, (v.x + size) / (2 * size), (v.y + size) / (2 * size));
    }
    positions.needsUpdate = true;
    uvAttr.needsUpdate = true;
    // ── AO map needs UV2 — copy UV1 → UV2 so aoMap samples correctly.
    // Without this, aoMap reads garbage UV2 and creates black patches.
    geo.setAttribute('uv2', geo.attributes.uv.clone());
    geo.computeVertexNormals();
    return geo;
})();

// ─── Cave floor UNDERSIDE — flat slab WITH the same well hole ──────────
// Sits just below the main floor to block X-ray from underwater looking up.
// Must share the floor's circular hole, otherwise it becomes a solid "lid"
// over the well mouth and you see rock instead of the water column below.
export const CAVE_FLOOR_UNDERSIDE_GEO = (() => {
    const shape = new THREE.Shape();
    const size = 32;
    shape.moveTo(-size, -size);
    shape.lineTo( size, -size);
    shape.lineTo( size,  size);
    shape.lineTo(-size,  size);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(HOLE_CENTER_X, -HOLE_CENTER_Z, HOLE_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 96);
    geo.setAttribute('uv2', geo.attributes.uv.clone());
    return geo;
})();

// Cave ceiling — 3D organic, not flat. 80→64 segments: ~36% fewer vertices,
// the stalactite-bump silhouette is visually identical from the floor.
export const CAVE_CEILING_GEO = createCaveCeiling(62, 62, 64, 99);

// DRY cave walls — organic displaced planes (above water, Y > 0)
export const CAVE_WALL_N_GEO = createOrganicCaveWall(62, 10, 64, 0, 3.5);
export const CAVE_WALL_S_GEO = createOrganicCaveWall(62, 10, 64, 10, 3.5);
export const CAVE_WALL_W_GEO = createOrganicCaveWall(62, 10, 64, 20, 3.5);
export const CAVE_WALL_E_GEO = createOrganicCaveWall(62, 10, 64, 30, 3.5);

// UNDERWATER cave walls — organic displaced planes
export const UW_WALL_NORTH_GEO = createOrganicCaveWall(62, 35, 64, 40, 3.5);
export const UW_WALL_SOUTH_GEO = createOrganicCaveWall(62, 35, 64, 50, 3.5);
export const UW_WALL_WEST_GEO  = createOrganicCaveWall(62, 35, 64, 60, 3.5);
export const UW_WALL_EAST_GEO  = createOrganicCaveWall(62, 35, 64, 70, 3.5);

// Pre-computed procedural rock geometries
// Detail 2 → 3 quadruples the face count (80 → 320) so rocks read as smooth
// silhouettes against the cave instead of obvious low-poly icosahedrons.
// Pilares e arcos do fundo: todos numa malha só cada (2 chamadas de desenho).
export const UW_PILLARS_GEO = /*@__PURE__*/ (() => mergeGeometries(UW_CORAL_PILLARS.map(([x, z, h, rTop, rBot], i) => createRockPillar(h, rTop, rBot, i * 13.7).translate(x, -30, z))))()!;
export const UW_ARCHES_GEO = /*@__PURE__*/ (() => mergeGeometries(UW_ARCHES.map(([x, z, h, span, thick], i) => createRockArch(h, span, thick, i * 7.1 + 3).translate(x, -30, z))))()!;
export const PROC_ROCK_A = createProceduralRock(1, 3, 0.35, 0);
export const PROC_ROCK_B = createProceduralRock(1, 3, 0.3, 50);
export const PROC_ROCK_C = createProceduralRock(1, 3, 0.4, 100);
export const PROC_ROCK_D = createProceduralRock(1, 3, 0.25, 150);

// Pre-computed procedural stalactite/stalagmite geometries.
// Segment counts raised (10→18, 15→24) so the cone silhouette and Phong
// shading hide the polygonal edges that read as "low poly" on close inspection.
export const PROC_STALAGMITE_GEOS = [
  createProceduralStalactite(2.5, 0.6, 0.05, 14, 16,200),
  createProceduralStalactite(3.2, 0.8, 0.05, 14, 16,210),
  createProceduralStalactite(2.0, 0.5, 0.05, 14, 16,220),
  createProceduralStalactite(2.8, 0.7, 0.05, 14, 16,230),
  createProceduralStalactite(1.8, 0.5, 0.05, 14, 16,240),
  createProceduralStalactite(2.1, 0.6, 0.05, 14, 16,250),
  createProceduralStalactite(2.4, 0.7, 0.05, 14, 16,260),
  createProceduralStalactite(1.5, 0.4, 0.05, 14, 16,270),
  createProceduralStalactite(3.0, 0.9, 0.05, 14, 16,280),
];
export const PROC_STALACTITE_GEOS = [
  createProceduralStalactite(1.5, 0.4, 0.05, 14, 16,300),
  createProceduralStalactite(1.8, 0.5, 0.05, 14, 16,310),
  createProceduralStalactite(1.2, 0.4, 0.05, 14, 16,320),
  createProceduralStalactite(2.0, 0.55, 0.05, 14, 16,330),
  createProceduralStalactite(1.4, 0.4, 0.05, 14, 16,340),
  createProceduralStalactite(1.6, 0.5, 0.05, 14, 16,350),
  createProceduralStalactite(1.3, 0.4, 0.05, 14, 16,360),
  createProceduralStalactite(1.7, 0.5, 0.05, 14, 16,370),
  createProceduralStalactite(2.5, 0.6, 0.05, 14, 16,380),
  createProceduralStalactite(2.2, 0.5, 0.05, 14, 16,390),
];

// ─── Merged stalagmite / stalactite geometry ────────────────────────────
// Bakes all 15+15 individual meshes into 2 draw calls.
const _mergeObj = new THREE.Object3D();
export const MERGED_STALAGMITE_GEO: THREE.BufferGeometry = (() => {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < STALAGMITES.length; i++) {
        const [x, z, h] = STALAGMITES[i];
        const geo = PROC_STALAGMITE_GEOS[i % PROC_STALAGMITE_GEOS.length].clone();
        _mergeObj.position.set(x, h / 2, z);
        _mergeObj.rotation.set(0, 0, 0);
        _mergeObj.updateMatrix();
        geo.applyMatrix4(_mergeObj.matrix);
        geos.push(geo);
    }
    const merged = mergeGeometries(geos, false)!;
    geos.forEach(g => g.dispose());
    return merged;
})();

export const MERGED_STALACTITE_GEO: THREE.BufferGeometry = (() => {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < STALACTITES.length; i++) {
        const [x, z, h] = STALACTITES[i];
        const geo = PROC_STALACTITE_GEOS[i % PROC_STALACTITE_GEOS.length].clone();
        _mergeObj.position.set(x, 8 - h / 2, z);
        _mergeObj.rotation.set(Math.PI, 0, 0);
        _mergeObj.updateMatrix();
        geo.applyMatrix4(_mergeObj.matrix);
        geos.push(geo);
    }
    const merged = mergeGeometries(geos, false)!;
    geos.forEach(g => g.dispose());
    return merged;
})();

// Procedural underwater terrain — displaced PlaneGeometry (extends past walls)
export const UW_FLOOR_GEO = (() => {
    // 90×90 plane so it extends well past the ±30 UW walls, no edge gaps.
    // Segments 200→144: the displaced ridge silhouette is unchanged to the eye
    // but the vertex count drops ~48% (40 401 → 21 025), a clean perf win since
    // this full-floor mesh always fills the underwater view (no culling benefit).
    const geo = new THREE.PlaneGeometry(90, 90, 144, 144);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const edgeDist = Math.min(
            Math.abs(v.x - (-45)), Math.abs(v.x - 45),
            Math.abs(v.y - (-45)), Math.abs(v.y - 45)
        );
        const edgeFade = Math.min(1, edgeDist / 8);
        const distFromCenter = Math.sqrt(v.x * v.x + (v.y - 5) * (v.y - 5));
        const centerDip = Math.max(0, 1 - distFromCenter / 12);
        const n1 = noise3D(v.x * 0.04, v.y * 0.04, 0.0) * 5.0;
        const n2 = noise3D(v.x * 0.1, v.y * 0.1, 3.0) * 2.0;
        const n3 = noise3D(v.x * 0.25, v.y * 0.25, 7.0) * 0.6;
        const n4 = noise3D(v.x * 0.6, v.y * 0.6, 11.0) * 0.15;
        const ridge = Math.abs(noise3D(v.x * 0.06, v.y * 0.06, 15.0)) * 4.5;
        const totalN = n1 + n2 + n3 + n4 + ridge;
        const displacement = totalN * edgeFade * (1 - centerDip * 0.6);
        positions.setZ(i, v.z + displacement);
    }
    positions.needsUpdate = true;
    // AO map needs UV2 — copy UV1 → UV2
    geo.setAttribute('uv2', geo.attributes.uv.clone());
    geo.computeVertexNormals();
    return geo;
})();

// ─── Collision for the organic deformations ─────────────────────────────────
// The underwater walls bulge inward (up to ~6 units) and the seafloor rises
// into ridges (up to ~12 units). Both are displaced by a noise field that is
// re-seeded randomly every load (createNoise3D() above), so colliders CANNOT
// be recomputed independently — they must be read back from the SAME geometry
// buffers that get rendered, or they won't line up. We extract two cheap
// collision proxies at module load:
//   • per-wall inward "inset" profile (24 buckets along each wall), so the
//     player/shark are stopped at the real bulge surface instead of a flat ±26
//     box that let them clip straight through the lumps.
//   • a coarse seafloor height-field, so swimmers ride above the ridges
//     instead of phasing through them.
// Lookups are O(1), adding negligible per-frame cost for either agent.

const WALL_BUCKETS = 24;
const WALL_HALF    = 31;          // local half-width of the 62-wide wall plane
const WALL_PLANE   = 30;          // |world coord| of each wall plane

function _extractWallProfile(geo: THREE.BufferGeometry): Float32Array {
    const prof = new Float32Array(WALL_BUCKETS);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        // Walls sit at world y=-15; swimmers occupy world y∈[-29,-3] → the
        // wall's LOCAL y band [-15, 13]. Ignoring the ceiling-side bulges keeps
        // the proxy from feeling like an invisible wall up high.
        const ly = pos.getY(i);
        if (ly < -15 || ly > 13) continue;
        const lx    = pos.getX(i);
        const inset = pos.getZ(i);   // baked displacement, ≥ 0 (points inward)
        const b = Math.min(WALL_BUCKETS - 1, Math.max(0,
            Math.floor((lx + WALL_HALF) / (2 * WALL_HALF) * WALL_BUCKETS)));
        if (inset > prof[b]) prof[b] = inset;
    }
    return prof;
}

const _profN = _extractWallProfile(UW_WALL_NORTH_GEO);
const _profS = _extractWallProfile(UW_WALL_SOUTH_GEO);
const _profW = _extractWallProfile(UW_WALL_WEST_GEO);
const _profE = _extractWallProfile(UW_WALL_EAST_GEO);

function _bucketAt(localAlong: number): number {
    return Math.min(WALL_BUCKETS - 1, Math.max(0,
        Math.floor((localAlong + WALL_HALF) / (2 * WALL_HALF) * WALL_BUCKETS)));
}

/**
 * Push an XZ point out of the four organic underwater walls, following their
 * real bulged surface. `radius` is the agent's body radius. Mutates `p`.
 * (Y is irrelevant — the walls are vertical, so this is a pure XZ constraint.)
 */
export function resolveUWWalls(p: { x: number; z: number }, radius: number): void {
    // North: plane z=-30, bulges toward +Z, along = world x (= local x)
    const sN = -WALL_PLANE + _profN[_bucketAt(p.x)] + radius;
    if (p.z < sN) p.z = sN;
    // South: plane z=+30, bulges toward -Z, along = world x (= -local x)
    const sS = WALL_PLANE - _profS[_bucketAt(-p.x)] - radius;
    if (p.z > sS) p.z = sS;
    // West: plane x=-30, bulges toward +X, along = world z (= -local x)
    const sW = -WALL_PLANE + _profW[_bucketAt(-p.z)] + radius;
    if (p.x < sW) p.x = sW;
    // East: plane x=+30, bulges toward -X, along = world z (= local x)
    const sE = WALL_PLANE - _profE[_bucketAt(p.z)] - radius;
    if (p.x > sE) p.x = sE;
}

// ── Seafloor height-field ──────────────────────────────────────────────────
const FLOOR_N    = 48;
const FLOOR_HALF = 45;            // floor plane spans [-45, 45]
const _floorH    = (() => {
    const grid = new Float32Array(FLOOR_N * FLOOR_N).fill(-Infinity);
    const pos = UW_FLOOR_GEO.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        // Floor mesh: rotation [-π/2,0,0], position y=-30. local (x,y,z=disp) →
        // world x = x, world z = -y, world height = -30 + disp.
        const xw = pos.getX(i);
        const zw = -pos.getY(i);
        const h  = -30 + pos.getZ(i);
        const cx = Math.min(FLOOR_N - 1, Math.max(0,
            Math.floor((xw + FLOOR_HALF) / (2 * FLOOR_HALF) * FLOOR_N)));
        const cz = Math.min(FLOOR_N - 1, Math.max(0,
            Math.floor((zw + FLOOR_HALF) / (2 * FLOOR_HALF) * FLOOR_N)));
        const idx = cz * FLOOR_N + cx;
        if (h > grid[idx]) grid[idx] = h;
    }
    // Fill any empty cell (none expected) with the seafloor base.
    for (let i = 0; i < grid.length; i++) if (!isFinite(grid[i])) grid[i] = -30;
    return grid;
})();

/** World-space seafloor height (top of the ridges) at (x, z). */
export function uwFloorHeight(x: number, z: number): number {
    const cx = Math.min(FLOOR_N - 1, Math.max(0,
        Math.floor((x + FLOOR_HALF) / (2 * FLOOR_HALF) * FLOOR_N)));
    const cz = Math.min(FLOOR_N - 1, Math.max(0,
        Math.floor((z + FLOOR_HALF) / (2 * FLOOR_HALF) * FLOOR_N)));
    return _floorH[cz * FLOOR_N + cx];
}

// ── Hard obstacle push-out ──────────────────────────────────────────────────
// The shark previously only ever AVOIDED the rocks and coral pillars via the
// context-steering danger field — a soft preference, not a constraint. With
// momentum (or a wall-peel nudge) it would drift bodily INTO a pillar/rock and
// nothing pushed it back out, so it stayed embedded and vibrated in place (the
// "enroscado" bug). This is the missing collision response: it ejects an XYZ
// point out of every rock sphere and coral-pillar cylinder it penetrates,
// exactly like resolveUWWalls does for the walls. Mutates `p`; returns true if
// any correction was applied so the caller can kill the velocity digging in.
export function resolveUWObstacles(p: { x: number; y: number; z: number }, radius: number): boolean {
    let pushed = false;
    // Coral pillars + arch legs — full-height XZ cylinders (Y ignored).
    for (let i = 0; i < UW_PILLAR_COLLIDERS.length; i++) {
        const c = UW_PILLAR_COLLIDERS[i];
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
            if (d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const push = (rr - d) / d;
                p.x += dx * push; p.z += dz * push;
            } else {
                p.x += rr;   // dead-centre — pick an arbitrary outward axis
            }
            pushed = true;
        }
    }
    // Boulders / scattered rocks — 3D spheres (respect depth, so a shark gliding
    // well above a seafloor boulder is never falsely pushed).
    for (let i = 0; i < UW_ROCK_COLLIDERS.length; i++) {
        const c = UW_ROCK_COLLIDERS[i];
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (rr - d) / d;
            p.x += dx * push; p.y += dy * push; p.z += dz * push;
            pushed = true;
        }
    }
    return pushed;
}
