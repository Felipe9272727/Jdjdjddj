/**
 * Floor2/geometry.ts — Procedural geometry creation functions, shared
 * geometry instances, noise function, and the glow texture.
 *
 * IMPORTANT: noise3D MUST be defined before any geometry that uses it.
 * All geometries are constructed at module load time (not per-render).
 */

import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS } from './constants';

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
export const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);
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
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    n.fromBufferAttribute(normals, i);
    let disp = 0;
    disp += noise3D(v.x * 0.8 + seed, v.y * 0.8, v.z * 0.8) * roughness;
    disp += noise3D(v.x * 2.0 + seed, v.y * 2.0, v.z * 2.0) * roughness * 0.3;
    disp += noise3D(v.x * 5.0 + seed, v.y * 5.0, v.z * 5.0) * roughness * 0.1;
    disp *= 0.7 + 0.3 * Math.abs(n.y);
    positions.setX(i, v.x + n.x * disp);
    positions.setY(i, v.y + n.y * disp);
    positions.setZ(i, v.z + n.z * disp);
  }
  positions.needsUpdate = true;
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
    hole.absarc(HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 64);
    const positions = geo.attributes.position;
    // ── Override UVs: map world-space XY → UV based on the full floor span.
    // ShapeGeometry auto-UVs can be wrong with holes, so we compute our own.
    const uvAttr = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const dxH = v.x - HOLE_CENTER_X;
        const dyH = v.y - HOLE_CENTER_Z;
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

// Cave ceiling — 3D organic, not flat
export const CAVE_CEILING_GEO = createCaveCeiling(62, 62, 80, 99);

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
export const PROC_ROCK_A = createProceduralRock(1, 2, 0.35, 0);
export const PROC_ROCK_B = createProceduralRock(1, 2, 0.3, 50);
export const PROC_ROCK_C = createProceduralRock(1, 2, 0.4, 100);
export const PROC_ROCK_D = createProceduralRock(1, 2, 0.25, 150);

// Pre-computed procedural stalactite/stalagmite geometries
export const PROC_STALAGMITE_GEOS = [
  createProceduralStalactite(2.5, 0.6, 0.05, 10, 15, 200),
  createProceduralStalactite(3.2, 0.8, 0.05, 10, 15, 210),
  createProceduralStalactite(2.0, 0.5, 0.05, 10, 15, 220),
  createProceduralStalactite(2.8, 0.7, 0.05, 10, 15, 230),
  createProceduralStalactite(1.8, 0.5, 0.05, 10, 15, 240),
  createProceduralStalactite(2.1, 0.6, 0.05, 10, 15, 250),
  createProceduralStalactite(2.4, 0.7, 0.05, 10, 15, 260),
  createProceduralStalactite(1.5, 0.4, 0.05, 10, 15, 270),
  createProceduralStalactite(3.0, 0.9, 0.05, 10, 15, 280),
];
export const PROC_STALACTITE_GEOS = [
  createProceduralStalactite(1.5, 0.4, 0.05, 10, 15, 300),
  createProceduralStalactite(1.8, 0.5, 0.05, 10, 15, 310),
  createProceduralStalactite(1.2, 0.4, 0.05, 10, 15, 320),
  createProceduralStalactite(2.0, 0.55, 0.05, 10, 15, 330),
  createProceduralStalactite(1.4, 0.4, 0.05, 10, 15, 340),
  createProceduralStalactite(1.6, 0.5, 0.05, 10, 15, 350),
  createProceduralStalactite(1.3, 0.4, 0.05, 10, 15, 360),
  createProceduralStalactite(1.7, 0.5, 0.05, 10, 15, 370),
  createProceduralStalactite(2.5, 0.6, 0.05, 10, 15, 380),
  createProceduralStalactite(2.2, 0.5, 0.05, 10, 15, 390),
];

// Procedural underwater terrain — displaced PlaneGeometry (extends past walls)
export const UW_FLOOR_GEO = (() => {
    // 90×90 plane so it extends well past the ±30 UW walls, no edge gaps
    const geo = new THREE.PlaneGeometry(90, 90, 200, 200);
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
