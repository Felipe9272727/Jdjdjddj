/**
 * Floor2Underwater.tsx — cave with a hole leading into a submerged void.
 *
 * Layout (Y axis):
 *   Y = 8        cave ceiling
 *   Y = 0        cave floor (with a circular hole at HOLE_CENTER, radius HOLE_R)
 *   Y = -0.05    water surface (sits just below the cave floor inside the hole)
 *   Y = -30      underwater terrain floor
 *
 * The player walks the cave normally on Y=0 except when standing over the
 * hole — there they fall through. Below the surface they're in swim mode
 * (handled by Player.tsx via the `swimMode` prop).
 *
 * Visual layers, broken down for performance:
 *   - Cave: 4 wall slabs + ceiling plane + ShapeGeometry floor-with-hole
 *           + a few rocky outcrops. ~12 meshes, all static.
 *   - WaterSurface: a single 60x60 plane with a custom ShaderMaterial that
 *           does cheap sine-wave displacement on the vertices and an
 *           additive caustic-ish color in the fragment. ~64 verts.
 *   - Underwater: rocky ground, boulders (Instances), pebbles (Instances),
 *           drifting bubbles (Instances), 5 shards.
 *
 * Performance notes:
 *   - All geometries that don't change across the session are constructed
 *     at module load (not per-render).
 *   - Bubbles count reduced from 32 → 20 — they read fine even sparser.
 *   - Pebbles get a distance-cull (any past 25m squared is hidden in fog
 *     anyway). Boulders too.
 *   - The shader material is a single one-pass thing; no texture lookups.
 *   - DynamicFog uses setHex() instead of new Color() per frame (no GC spikes).
 *   - Kelp batched into single KelpField with one useFrame (was 8 separate).
 *   - safeDt clamped to 0.033 everywhere to prevent huge jumps after tab-switch.
 */

import React, { useMemo, useRef, useEffect, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, shaderMaterial, MeshReflectorMaterial, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { ElevatorFacade } from './Elevator';
import {
    caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
    caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
    caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
    uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
    uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
    uwWallColor, uwWallNormal, uwWallRoughness, uwWallAO,
    rockModelA, rockModelB, rockModelC, rockModelD,
    boulderModel, pebbleModel,
} from './assets/textureImports';
import { CaveEnhancements } from './CaveEnhancements';

// ─── Procedural glow texture for sprites (prevents square artifacts) ────
const GLOW_TEXTURE = (() => {
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

// ─── Hole geometry placement (also exported for Player.tsx) ────────────
export const HOLE_CENTER_X = 0;
export const HOLE_CENTER_Z = 5;
export const HOLE_RADIUS = 3.0;
export const WATER_LEVEL_Y = -0.05;
export const SWIM_THRESHOLD_Y = -0.3;   // below this the player is "in" the water

// ─── Simplex noise instance (shared across all procedural geometry) ─────
// MUST be defined before any geometry that uses it (CAVE_FLOOR_GEO, etc.)
const noise3D = createNoise3D();

// ─── Cave floor with circular hole — ShapeGeometry ────────────────────
// THREE.Shape supports holes natively; this gives us a single mesh for
// the floor with a clean circular cutout, no triangulation tricks.
const CAVE_FLOOR_GEO = (() => {
    const shape = new THREE.Shape();
    const size = 30;
    shape.moveTo(-size, -size);
    shape.lineTo( size, -size);
    shape.lineTo( size,  size);
    shape.lineTo(-size,  size);
    shape.closePath();
    const hole = new THREE.Path();
    // Note: ShapeGeometry is in XY plane before rotation; the cave floor
    // is then rotated -π/2 around X so its Y becomes world's Z.
    hole.absarc(HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 48); // higher segments for more organic terrain
    // Displace vertices for DRAMATIC unevenness — real caves are very irregular.
    // In ShapeGeometry XY plane, Z displacement becomes Y (up) after rotation.
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        // Fade out near the hole edge so the rim stays clean
        const dxH = v.x - HOLE_CENTER_X;
        const dyH = v.y - HOLE_CENTER_Z;
        const distToHole = Math.sqrt(dxH * dxH + dyH * dyH);
        const holeFade = Math.min(1, Math.max(0, (distToHole - HOLE_RADIUS) / 3));
        // Fade out near outer edges so walls connect cleanly
        const edgeDist = Math.min(
            Math.abs(v.x - (-size)), Math.abs(v.x - size),
            Math.abs(v.y - (-size)), Math.abs(v.y - size)
        );
        const edgeFade = Math.min(1, edgeDist / 4);
        const fade = holeFade * edgeFade;
        // DRAMATIC multi-octave simplex noise — real caves have 1-3 meter elevation changes
        const n1 = noise3D(v.x * 0.04, v.y * 0.04, 0.0) * 4.0;    // large hills
        const n2 = noise3D(v.x * 0.1, v.y * 0.1, 5.0) * 2.0;       // medium bumps
        const n3 = noise3D(v.x * 0.25, v.y * 0.25, 10.0) * 0.8;    // small rocks
        const n4 = noise3D(v.x * 0.6, v.y * 0.6, 15.0) * 0.2;     // fine roughness
        // Sharp ridges — dramatic rocky outcroppings you can see
        const ridge1 = Math.abs(noise3D(v.x * 0.06, v.y * 0.06, 20.0)) * 2.5;
        const ridge2 = Math.abs(noise3D(v.x * 0.15, v.y * 0.15, 25.0)) * 1.0;
        const totalN = n1 + n2 + n3 + n4 + ridge1 + ridge2;
        positions.setZ(i, v.z + totalN * 2.5 * fade);
    }
    positions.needsUpdate = true;
    // ─── FIX: Remap UVs to cover the ENTIRE floor surface ───
    // ShapeGeometry with holes generates broken UVs near the hole cutout,
    // causing the texture to only appear on part of the floor.
    // We manually remap UVs based on XY position (which becomes XZ in world),
    // normalizing -size..+size → 0..1 so the texture covers everything.
    const uvAttr = geo.attributes.uv;
    const floorSize = size * 2; // 60 units total
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const u = (v.x + size) / floorSize;  // -30..30 → 0..1
        const v2 = (v.y + size) / floorSize; // -30..30 → 0..1
        uvAttr.setXY(i, u, v2);
    }
    uvAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
})();

// ─── Geometries shared across the scene ────────────────────────────────
const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);
const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);

// ─── Organic cave wall geometry helper ──────────────────────────────────
// Creates a PlaneGeometry with heavy multi-octave noise displacement
// so walls look like real cave rock — bulging, rounded, organic.
function createOrganicCaveWall(
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
    // Large smooth bulges — main cave shape
    let displacement = 0;
    displacement += noise3D(v.x * 0.03 + seed, v.y * 0.03, seed * 0.7) * amplitude;
    displacement += noise3D(v.x * 0.07 + seed, v.y * 0.07, seed * 1.1) * amplitude * 0.5;
    // Medium detail — rocky texture
    displacement += noise3D(v.x * 0.15 + seed, v.y * 0.15, seed * 1.3) * amplitude * 0.25;
    // Fine detail — rough surface
    displacement += noise3D(v.x * 0.4 + seed, v.y * 0.4, seed * 2.1) * amplitude * 0.08;
    // Sharp ridges — dramatic protrusions like real cave formations
    const ridge = Math.abs(noise3D(v.x * 0.08 + seed, v.y * 0.08, seed * 0.5)) * amplitude * 0.4;
    // Push vertex along Z (normal direction) — walls bulge INWARD
    // Use abs() so displacement is always inward (positive Z = into the cave)
    positions.setZ(i, v.z + Math.abs(displacement) + ridge);
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Cave ceiling geometry — displaced PlaneGeometry with stalactite-like bumps ───
function createCaveCeiling(
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
    // Large undulations — ceiling height varies 2-4 meters
    let displacement = 0;
    displacement += noise3D(v.x * 0.025 + seed, v.y * 0.025, seed * 1.7) * 3.5;
    displacement += noise3D(v.x * 0.06 + seed, v.y * 0.06, seed * 0.9) * 1.8;
    // Stalactite clusters — sharp downward protrusions
    const stalactiteNoise = Math.max(0, noise3D(v.x * 0.12 + seed, v.y * 0.12, seed * 2.3));
    displacement += stalactiteNoise * stalactiteNoise * 4.0;
    // Medium detail
    displacement += noise3D(v.x * 0.2 + seed, v.y * 0.2, seed * 3.1) * 0.8;
    // Fine roughness
    displacement += noise3D(v.x * 0.5 + seed, v.y * 0.5, seed * 4.7) * 0.2;
    // Push DOWN (positive Z after rotation = downward in world)
    positions.setZ(i, v.z + Math.abs(displacement));
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Cave ceiling — 3D organic, not flat
const CAVE_CEILING_GEO = createCaveCeiling(62, 62, 64, 99);  // 64 segs (was 80) — still very organic

// DRY cave walls — organic displaced planes (above water, Y > 0)
const CAVE_WALL_N_GEO = createOrganicCaveWall(62, 10, 48, 0, 3.5);   // 48 segs (was 64)
const CAVE_WALL_S_GEO = createOrganicCaveWall(62, 10, 48, 10, 3.5);
const CAVE_WALL_W_GEO = createOrganicCaveWall(62, 10, 48, 20, 3.5);
const CAVE_WALL_E_GEO = createOrganicCaveWall(62, 10, 48, 30, 3.5);


// UNDERWATER cave walls — organic displaced planes
const UW_WALL_NORTH_GEO = createOrganicCaveWall(62, 35, 48, 40, 3.5);  // 48 segs (was 64)
const UW_WALL_SOUTH_GEO = createOrganicCaveWall(62, 35, 48, 50, 3.5);
const UW_WALL_WEST_GEO = createOrganicCaveWall(62, 35, 48, 60, 3.5);
const UW_WALL_EAST_GEO = createOrganicCaveWall(62, 35, 48, 70, 3.5);


// ─── Procedural rock geometry helper ────────────────────────────────────
function createProceduralRock(
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
    // Flatten rocks slightly (more realistic)
    disp *= 0.7 + 0.3 * Math.abs(n.y);
    positions.setX(i, v.x + n.x * disp);
    positions.setY(i, v.y + n.y * disp);
    positions.setZ(i, v.z + n.z * disp);
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const PROC_ROCK_A = createProceduralRock(1, 2, 0.35, 0);
const PROC_ROCK_B = createProceduralRock(1, 2, 0.3, 50);
const PROC_ROCK_C = createProceduralRock(1, 2, 0.4, 100);
const PROC_ROCK_D = createProceduralRock(1, 2, 0.25, 150);

// ─── Procedural stalactite geometry helper ──────────────────────────────
function createProceduralStalactite(
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
    const yNorm = (v.y + height / 2) / height; // 0 at tip, 1 at base
    const noiseAmt = yNorm * 0.25;
    const disp = noise3D(v.x * 2.0 + seed, v.y * 1.5, v.z * 2.0) * noiseAmt;
    positions.setX(i, v.x + n.x * disp);
    positions.setZ(i, v.z + n.z * disp);
  }
  positions.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Pre-computed procedural stalactite geometries (different seeds for variation)
const PROC_STALAGMITE_GEOS = [
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

const PROC_STALACTITE_GEOS = [
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


// Procedural underwater terrain — displaced PlaneGeometry (simplex-noise)
const UW_FLOOR_GEO = (() => {
    const geo = new THREE.PlaneGeometry(80, 80, 150, 150);  // 150 segs (was 200) — saves ~44% verts, still dense
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const edgeDist = Math.min(
            Math.abs(v.x - (-40)), Math.abs(v.x - 40),
            Math.abs(v.y - (-40)), Math.abs(v.y - 40)
        );
        const edgeFade = Math.min(1, edgeDist / 8);
        // Distance from center — central area around the hole gets less displacement
        const distFromCenter = Math.sqrt(v.x * v.x + (v.y - 5) * (v.y - 5));
        const centerDip = Math.max(0, 1 - distFromCenter / 12);
        // Rich multi-octave simplex-noise terrain — dramatic 3-5 meter elevation changes
        const n1 = noise3D(v.x * 0.04, v.y * 0.04, 0.0) * 5.0;
        const n2 = noise3D(v.x * 0.1, v.y * 0.1, 3.0) * 2.0;
        const n3 = noise3D(v.x * 0.25, v.y * 0.25, 7.0) * 0.6;
        const n4 = noise3D(v.x * 0.6, v.y * 0.6, 11.0) * 0.15;
        // Rocky ridges — sharp prominent features
        const ridge = Math.abs(noise3D(v.x * 0.06, v.y * 0.06, 15.0)) * 4.5;
        // Combine with edge fade and center dip
        const totalN = n1 + n2 + n3 + n4 + ridge;
        const displacement = totalN * edgeFade * (1 - centerDip * 0.6);
        positions.setZ(i, v.z + displacement);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
})();

// ─── Texture loading helper ────────────────────────────────────────
function usePBRSet(colorUrl: string, normalUrl: string, roughUrl: string, aoUrl: string, repeatX: number, repeatY: number) {
    const [color, normal, rough, ao] = useTexture([colorUrl, normalUrl, roughUrl, aoUrl]);
    for (const tex of [color, normal, rough, ao]) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
    }
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    rough.colorSpace = THREE.NoColorSpace;
    ao.colorSpace = THREE.NoColorSpace;
    return { color, normal, rough, ao };
}

// ─── Rock GLB models ──────────────────────────────────────────────
const ROCK_MODEL_URLS = [rockModelA, rockModelB, rockModelC, rockModelD];
const BOULDER_MODEL_URL = boulderModel;
const PEBBLE_MODEL_URL = pebbleModel;

// ─── Cave boulders — multiple cohorts for color variation ─────────────
type Boulder = readonly [number, number, number, number, number]; // x,y,z,s,ry

// "Dark" group — wall-hugging, deep stone color
const CAVE_ROCKS_DARK: readonly Boulder[] = [
    [-22, 0,  20, 2.4, 0.3],
    [ 24, 0,  18, 2.1, 1.2],
    [-25, 0, -15, 2.8, 0.6],
    [ 22, 0, -22, 2.5, 1.9],
    [ 18, 0,   4, 1.6, 0.4],
    [-19, 0,   8, 1.8, 2.1],
    [  6, 0,  25, 1.5, 1.0],
    [-12, 0, -25, 2.0, 0.7],
    [-27, 0,  -2, 2.2, 0.9],
    [ 26, 0,   8, 1.9, 1.5],
    [-24, 0,  25, 2.0, 0.4],
    [ 27, 0, -10, 2.3, 1.1],
] as const;

// "Mid" group — mid-area, slightly lighter
const CAVE_ROCKS_MID: readonly Boulder[] = [
    [-15, 0,  15, 1.0, 2.3],
    [ 14, 0, -10, 0.9, 0.5],
    [-20, 0,   0, 1.2, 1.7],
    [ 19, 0,  14, 1.1, 0.8],
    [-17, 0, -18, 1.3, 0.2],
    [ 12, 0,  18, 0.8, 1.4],
    [-10, 0,  -3, 1.1, 1.9],
    [ 16, 0, -20, 1.2, 0.6],
    [-13, 0,  22, 1.0, 1.1],
    [ 20, 0, -14, 1.1, 0.7],
] as const;

// "Light" group — scattered small bright stones
const CAVE_ROCKS_LIGHT: readonly Boulder[] = [
    [-26,  0,   6, 0.7, 0.3],
    [ 26,  0,  -4, 0.6, 1.2],
    [ -8,  0,  26, 0.7, 0.6],
    [ 10,  0, -26, 0.8, 1.9],
    [-26,  0, -18, 0.7, 0.4],
    [ 26,  0,  20, 0.6, 1.5],
] as const;

// ─── Pool rim — large boulders forming the edge of the water pit ──────
// More boulders, bigger, more irregular — looks like a natural sinkhole, not a pipe
const POOL_RIM: readonly Boulder[] = (() => {
    const r = HOLE_RADIUS + 1.2;
    const result: Boulder[] = [];
    for (let i = 0; i < 20; i++) {  // more boulders = less pipe-like
        const a = (i / 20) * Math.PI * 2;
        const jitter = 0.7 + (Math.sin(i * 13.7) * 0.5 + 0.5) * 0.5;
        const x = HOLE_CENTER_X + Math.cos(a) * r * jitter;
        const z = HOLE_CENTER_Z + Math.sin(a) * r * jitter;
        const s = 1.0 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 1.2;  // bigger boulders
        const ry = a + Math.sin(i * 3.1) * 0.6;
        result.push([x, 0.2, z, s, ry] as const);
    }
    return result;
})();

// ─── Stalagmites / Stalactites ────────────────────────────────────────
type Stalactite = readonly [number, number, number, number]; // x, z, height, radius
const STALAGMITES: readonly Stalactite[] = [
    [-18,  18, 2.5, 0.6],
    [ 20,  15, 3.2, 0.8],
    [-22, -10, 2.0, 0.5],
    [ 24, -18, 2.8, 0.7],
    [ -8,  22, 1.8, 0.5],
    [ 10,  20, 2.1, 0.6],
    [-15, -22, 2.4, 0.7],
    // Extra stalagmites — more claustrophobic, more cave-like
    [-5,   12, 1.5, 0.4],
    [ 8,   -8, 1.8, 0.5],
    [-20,   5, 2.2, 0.6],
    [ 15,  -3, 1.3, 0.4],
    [ -3, -15, 1.6, 0.5],
    [ 25,   8, 2.0, 0.5],
    [-12, -5,  1.4, 0.3],
    [ 18,  22, 1.7, 0.4],
];
const STALACTITES: readonly Stalactite[] = [
    [-12,  10, 1.5, 0.4],
    [ 16,   2, 1.8, 0.5],
    [ -5, -15, 1.2, 0.4],
    [ 22,  10, 2.0, 0.55],
    [-18,  -5, 1.4, 0.4],
    [  3, -20, 1.6, 0.5],
    [-22,  20, 1.3, 0.4],
    [ 18, -25, 1.7, 0.5],
    // Extra stalactites — more claustrophobic, hanging lower
    [-8,    0, 2.5, 0.6],
    [ 5,   -8, 2.2, 0.5],
    [-15,  15, 1.8, 0.4],
    [ 12,  18, 2.0, 0.5],
    [ 0,  -12, 1.5, 0.4],
    [-25,  -8, 1.9, 0.5],
    [ 20,  -3, 1.6, 0.4],
];

// ─── Crystals — colored emissive accents along the walls ─────────────
// Cluster of small octahedra at each spot; one big one + a few small ones.
// Adds soft directional pools of color you can see from across the cave.
// FIX: pointLight replaced by emissive sprites to avoid square lights on
// mobile. The glow is driven by additive-blend sprites (always round) +
// a dim pointLight for actual scene illumination (low intensity = no square).
type Crystal = readonly [number, number, number, string]; // x, y, z, hexColor
const CRYSTALS: readonly Crystal[] = [
    // Wall crystals (near ground level)
    [-28,  2.2,   8, '#9ae6ff'],   // cyan, west wall
    [ 28,  3.5,  -5, '#c39bff'],   // purple, east wall
    [-10,  0.6,  28, '#ff9ad8'],   // pink, north wall
    [ 12,  0.8, -28, '#ffd066'],   // amber, south wall
    [-28,  4.5, -18, '#9affae'],   // green, west wall further
    [ 28,  1.5,  20, '#84d8ff'],   // light blue, east wall
    // More wall crystals — denser mineral deposits
    [-28,  1.5,  -3, '#b8a9ff'],   // lavender, west wall
    [ 28,  5.0,  12, '#ff8fab'],   // rose, east wall
    [-15,  1.0, -28, '#66ffcc'],   // mint, south wall
    [ 20,  2.5,  28, '#ffb347'],   // orange, north wall
    [-28,  3.8,  20, '#87ceeb'],   // sky blue, west wall
    [ 15,  0.8, -28, '#dda0dd'],   // plum, south wall
    // Ceiling crystals — hanging minerals like amethyst/geode formations
    [-12,  7.5,   5, '#c39bff'],   // purple, ceiling
    [  8,  7.0, -10, '#9ae6ff'],   // cyan, ceiling
    [ 18,  7.8,  15, '#ff9ad8'],   // pink, ceiling
    [-20,  7.2, -15, '#84d8ff'],   // light blue, ceiling
    [  0,  7.6,  20, '#9affae'],   // green, ceiling
    [-8,  7.3,  -22, '#ffd066'],   // amber, ceiling
    [ 22,  7.4,  -5, '#b8a9ff'],   // lavender, ceiling
    [-18,  7.1,  10, '#ff8fab'],   // rose, ceiling
    // Floor mineral veins — glowing deposits emerging from cracks
    [-20,  0.3, -10, '#00ffaa'],   // bright green vein
    [ 15,  0.2,   8, '#ff6b9d'],   // hot pink vein
    [ -5,  0.4, -20, '#4dc9f6'],   // teal vein
    [ 25,  0.3,   0, '#f7c948'],   // gold vein
];

const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.35, 0);

const CrystalCluster: React.FC<{ x: number; y: number; z: number; color: string }> = ({ x, y, z, color }) => (
    <group position={[x, y, z]}>
        <mesh geometry={CRYSTAL_GEO} rotation={[0.3, 0.8, 0]} scale={1.4}>
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={2.2}
                metalness={0.55}
                roughness={0.15}
                toneMapped={false}
            />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.75} position={[0.45, -0.20, 0.15]} rotation={[0.6, 1.2, 0.3]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.9} metalness={0.5} roughness={0.18} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.55} position={[-0.42, -0.25, -0.05]} rotation={[-0.4, 0.5, 0.7]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.7} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.4} position={[0.0, 0.35, -0.15]} rotation={[0.2, 0.2, 1.4]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        {/* Round glow halo — additive sprite with procedural glow texture */}
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        {/* Bigger soft outer glow for atmospheric pool of light */}
        <sprite scale={[5.0, 5.0, 1]}>
            <spriteMaterial map={GLOW_TEXTURE} color={color} transparent opacity={0.12} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
    </group>
);

// ─── Central torches — warm wall-mounted flames around the cave ───────
const TORCH_POSITIONS: readonly (readonly [number, number, number])[] = [
    [-29.5, 5.5,   0],
    [ 29.5, 5.5,   0],
    [   0, 5.5, -29.5],
    [   0, 5.5,  29.5],
    [-21,  6.0, -21],
    [ 21,  6.0,  21],
];

const Torch: React.FC<{ x: number; y: number; z: number; seed: number }> = ({ x, y, z, seed }) => {
    const spriteRef = useRef<THREE.SpriteMaterial>(null);
    const outerRef = useRef<THREE.SpriteMaterial>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        // Deterministic flicker — NO Math.random() (causes GC spikes on mobile)
        const noise = Math.sin(t * 37.7 + seed * 13.3) * 0.5 + 0.5;
        const flicker = 0.5 + Math.sin(t * 9 + seed) * 0.08 + Math.sin(t * 23 + seed * 1.3) * 0.06 + noise * 0.05;
        if (spriteRef.current) spriteRef.current.opacity = flicker;
        if (outerRef.current) outerRef.current.opacity = flicker * 0.3;
    });
    return (
        <group position={[x, y, z]}>
            {/* Flame cone — emissive, no pointLight */}
            <mesh>
                <coneGeometry args={[0.18, 0.4, 8]} />
                <meshStandardMaterial color="#FFA850" emissive="#FFB060" emissiveIntensity={3.5} toneMapped={false} />
            </mesh>
            {/* Inner glow sprite — always round with glow texture */}
            <sprite scale={[3.0, 3.0, 1]}>
                <spriteMaterial ref={spriteRef} map={GLOW_TEXTURE} color="#FFC080" transparent opacity={0.5} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            {/* Outer atmospheric glow */}
            <sprite scale={[7.0, 7.0, 1]}>
                <spriteMaterial ref={outerRef} map={GLOW_TEXTURE} color="#FF9040" transparent opacity={0.15} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};

// ─── Dust motes — drifting in the air, catching light ─────────────────
const DUST_COUNT = 25;
const DustMotes: React.FC = () => {
    const positions = useRef(
        Array.from({ length: DUST_COUNT }, () => ({
            x: (Math.random() - 0.5) * 56,
            y: 1 + Math.random() * 6,
            z: (Math.random() - 0.5) * 56,
            vx: (Math.random() - 0.5) * 0.05,
            vy: 0.02 + Math.random() * 0.03,
            vz: (Math.random() - 0.5) * 0.05,
            seed: Math.random() * 10,
        }))
    );
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(DUST_COUNT).fill(null));
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        const pos = positions.current;
        for (let i = 0; i < DUST_COUNT; i++) {
            const p = pos[i];
            p.x += (p.vx + Math.sin(t * 0.6 + p.seed) * 0.02) * safeDt;
            p.y += p.vy * safeDt;
            p.z += (p.vz + Math.cos(t * 0.5 + p.seed) * 0.02) * safeDt;
            if (p.y > 7.5) {
                p.y = 0.5;
                // Deterministic reset using sin hash (avoids GC spikes from Math.random)
                const h1 = Math.sin(i * 127.1 + p.seed * 311.7) * 43758.5453;
                p.x = (h1 - Math.floor(h1) - 0.5) * 56;
                const h2 = Math.sin(i * 269.5 + p.seed * 183.3) * 43758.5453;
                p.z = (h2 - Math.floor(h2) - 0.5) * 56;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });
    return (
        <Instances limit={DUST_COUNT} range={DUST_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#FFE0B8" transparent opacity={0.55} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            {Array.from({ length: DUST_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.018 + Math.random() * 0.022} />
            ))}
        </Instances>
    );
};

// ─── Underwater terrain ────────────────────────────────────────────────
const UW_BOULDERS: readonly Boulder[] = [
    [  6, -28,   -8, 2.6, 0.3],
    [ -9, -28.5, 4.5, 3.1, 1.2],
    [ 12, -28.5,  3,  2.4, 0.6],
    [  4, -28.2, 12, 2.2, 2.0],
    [ -5, -28.5,-14, 3.0, 0.9],
    [ 16, -28.3,  9, 2.7, 1.5],
    [-14, -28.5,-10, 2.6, 2.5],
    [-18, -28.5,  5, 2.9, 0.4],
    [ 20, -28.3, -4, 2.4, 1.8],
    [ -3, -28.4, 18, 2.3, 1.0],
    [  9, -28.5,-16, 3.1, 0.8],
    [-11, -28.4, 14, 2.5, 2.2],
    [  0, -28.5,-22, 2.8, 0.5],
    [ 22, -28.4, 12, 2.6, 1.1],
    [-20, -28.4,-16, 2.9, 0.7],
] as const;

const UW_PEBBLES: readonly Boulder[] = [
    [  3, -29.6,   2, 0.4, 0.2],
    [ -2, -29.6,   6, 0.3, 1.5],
    [  7, -29.6,  -3, 0.5, 0.8],
    [ -6, -29.6,  -2, 0.4, 2.1],
    [  1.5,-29.6, 10, 0.35,0.5],
    [ 10, -29.6,   6, 0.45,1.2],
    [ -8, -29.6,   9, 0.5, 0.9],
    [ 14, -29.6,  -2, 0.4, 1.8],
    [-12, -29.6,   0, 0.55,0.3],
    [  5, -29.6, -10, 0.4, 2.4],
    [ -4, -29.6,  14, 0.5, 1.6],
    [ 13, -29.6,  14, 0.4, 0.6],
] as const;

// ─── Scattered 3D rock formations on the underwater floor ─────────────
type RockFormation = readonly [number, number, number, number, number, number]; // x, y, z, scale, rotY, rotX
const UW_SCATTERED_ROCKS: readonly RockFormation[] = (() => {
    const rocks: RockFormation[] = [];
    const count = 25;
    for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random using sin hash
        const h1 = Math.sin(i * 127.1 + 1.7) * 43758.5453;
        const h2 = Math.sin(i * 269.5 + 3.1) * 43758.5453;
        const h3 = Math.sin(i * 419.2 + 0.8) * 43758.5453;
        const f1 = h1 - Math.floor(h1);
        const f2 = h2 - Math.floor(h2);
        const f3 = h3 - Math.floor(h3);
        const x = (f1 - 0.5) * 40;
        const z = (f2 - 0.5) * 40;
        const s = 0.3 + f3 * 1.2;
        const ry = f1 * Math.PI * 2;
        const rx = (f2 - 0.5) * 0.5;
        // Skip rocks too close to center (hole area)
        const distFromCenter = Math.sqrt(x * x + (z - 5) * (z - 5));
        if (distFromCenter < 5) continue;
        rocks.push([x, -30, z, s, ry, rx] as const);
    }
    return rocks;
})();

// ─── Underwater coral/rock pillars — tall vertical formations ────────
type CoralPillar = readonly [number, number, number, number, number]; // x, z, height, radiusTop, radiusBottom
const UW_CORAL_PILLARS: readonly CoralPillar[] = [
    [ 12,  -8, 12, 0.8, 1.5],
    [-15,  10,  8, 0.6, 1.2],
    [ 18,  15, 15, 1.0, 2.0],
    [-20, -12, 10, 0.7, 1.4],
    [  8,  20,  6, 0.5, 1.0],
    [-10, -18, 14, 0.9, 1.8],
    [ 22,  -5,  9, 0.6, 1.3],
    [-8,   8,  7, 0.5, 1.1],
    [ 15, -20, 11, 0.8, 1.6],
    [-22,  15, 13, 1.0, 1.9],
];

// ─── Underwater arches — curved rock formations ─────────────────────
const UW_ARCHES: readonly (readonly [number, number, number, number, number])[] = [
    [ 10, -28, 10, 2.5, 0.6],  // x, z, height, span, thickness
    [-14, -28, 8,  2.0, 0.5],
    [ 20, -28, 12, 3.0, 0.7],
    [ -5, -28, 6,  1.5, 0.4],
];

// ─── Surface bubble ring — larger bubbles at water surface level ──────
const SURFACE_BUBBLE_COUNT = 15;
const SURFACE_BUBBLE_RING_RADIUS = HOLE_RADIUS * 0.8;

// ─── Rock collision data (exported for Player.tsx) ───────────────────
export const CAVE_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...CAVE_ROCKS_DARK.map(([x,y,z,s]) => ({ x, y: y + s * 0.35, z, r: s * 0.7 })),
    ...CAVE_ROCKS_MID.map(([x,y,z,s]) => ({ x, y: y + s * 0.35, z, r: s * 0.5 })),
];
export const UW_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...UW_BOULDERS.map(([x,y,z,s]) => ({ x, y: y + s * 0.3, z, r: s * 0.6 })),
];

// ─── Wall collision data — organic walls bulge inward, need collision ──
// Place collision spheres along each wall. The organic walls have max
// displacement ~5m inward from z=±30 / x=±30, so the inner edge is ~25.
// We place colliders every 8m along the wall at varying heights.
export const CAVE_WALL_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = (() => {
    const colliders: { x: number; y: number; z: number; r: number }[] = [];
    const WALL_POS = 30;
    const BULGE = 4;  // max inward bulge
    const STEP = 8;
    // North wall (z = -30, bulges toward +Z)
    for (let x = -28; x <= 28; x += STEP) {
        colliders.push({ x, y: 3, z: -WALL_POS + BULGE, r: BULGE + 1 });
    }
    // South wall (z = 30, bulges toward -Z)
    for (let x = -28; x <= 28; x += STEP) {
        colliders.push({ x, y: 3, z: WALL_POS - BULGE, r: BULGE + 1 });
    }
    // West wall (x = -30, bulges toward +X)
    for (let z = -28; z <= 28; z += STEP) {
        colliders.push({ x: -WALL_POS + BULGE, y: 3, z, r: BULGE + 1 });
    }
    // East wall (x = 30, bulges toward -X)
    for (let z = -28; z <= 28; z += STEP) {
        colliders.push({ x: WALL_POS - BULGE, y: 3, z, r: BULGE + 1 });
    }
    // Corner colliders — bigger spheres at corners where two walls meet
    const corners = [[-28, -28], [28, -28], [-28, 28], [28, 28]];
    for (const [cx, cz] of corners) {
        colliders.push({ x: cx, y: 3, z: cz, r: 5 });
    }
    return colliders;
})();

// ─── Water ceiling shader — animated ripple pattern visible from below ──
const WaterCeilingMaterial = shaderMaterial(
    { time: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        // Animated ripples — concentric rings from center
        float dist = length(uv - 0.5) * 2.0;
        float ripple1 = sin(dist * 25.0 - time * 2.0) * 0.5 + 0.5;
        float ripple2 = sin(dist * 18.0 + time * 1.5 + 1.0) * 0.5 + 0.5;
        // Cross-ripple interference
        float cross1 = sin(uv.x * 22.0 + time * 1.8) * sin(uv.y * 20.0 - time * 1.3) * 0.5 + 0.5;
        float cross2 = sin(uv.x * 16.0 - time * 1.1 + 2.0) * sin(uv.y * 14.0 + time * 0.9) * 0.5 + 0.5;
        float ripple = pow(ripple1 * ripple2, 1.5) * 0.6 + pow(cross1 * cross2, 2.0) * 0.4;
        // Base dark murky color
        vec3 col = vec3(0.008, 0.018, 0.032);
        // Lighter ripple highlights — simulates light refracting through surface
        col += vec3(0.01, 0.05, 0.06) * ripple;
        // Subtle bright caustic streaks
        float caustic = pow(ripple, 3.0) * 0.15;
        col += vec3(0.02, 0.08, 0.06) * caustic;
        gl_FragColor = vec4(col, 1.0);
      }
    `
);

// ─── Underwater overlay — screen-space tint and caustic pattern ────────
const UnderwaterOverlayMaterial = shaderMaterial(
    { time: 0, depth: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float depth;  // 0 at surface, 1 at bottom
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        // Screen-space wobble — underwater distortion
        uv += vec2(sin(uv.y * 30.0 + time * 2.0) * 0.003, cos(uv.x * 25.0 + time * 1.7) * 0.003) * (1.0 - depth);
        // Center-based UV for vignette
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * 2.5;
        vignette = clamp(vignette, 0.0, 1.0);
        // Caustic-like pattern on the overlay
        float c1 = sin(uv.x * 18.0 + time * 1.4) * sin(uv.y * 15.0 + time * 1.1);
        float c2 = sin(uv.x * 12.0 - time * 0.9 + 1.5) * sin(uv.y * 10.0 + time * 1.3);
        float caustic = pow(max(0.0, c1 * c2), 2.5) * 0.2;
        // Color tinting based on depth — VISIBLE blue absorption
        vec3 shallowTint = vec3(0.0, 0.06, 0.12);
        vec3 midTint = vec3(0.0, 0.04, 0.14);
        vec3 deepTint = vec3(0.0, 0.01, 0.08);
        vec3 tint;
        if (depth < 0.35) {
          tint = mix(shallowTint, midTint, depth / 0.35);
        } else {
          tint = mix(midTint, deepTint, (depth - 0.35) / 0.65);
        }
        // Add caustic highlights to the tint
        tint += vec3(0.0, caustic * 0.4, caustic * 0.3);
        // Alpha increases with depth, vignette softens edges
        float alpha = (0.25 + depth * 0.5) * vignette;
        // Slight chromatic-aberration color shift at edges
        float edgeDist = length(center) * 2.0;
        tint.r += edgeDist * 0.005 * depth;
        tint.b += edgeDist * 0.01 * (1.0 - depth);
        gl_FragColor = vec4(tint, alpha);
      }
    `
);



// ─── Water shader — Gerstner waves + SSS + Fresnel + foam ───────────
// FIX #3: Water is opaque when viewed from below (dot(normal, viewDir) < 0)
// FIX #8: Much darker colors for horror atmosphere
const WaterMaterial = shaderMaterial(
    { time: 0, opacity: 0.85 },
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewWS;
      varying vec3 vNormalWS;
      varying vec3 vWorldPos;

      vec4 gerstner(vec2 pos, vec2 dir, float steepness, float wavelength, float t) {
        float k = 6.28318 / max(wavelength, 0.01);
        float c = sqrt(9.8 / max(k, 0.001));
        float a = steepness / max(k, 0.001);
        float f = k * (dot(dir, pos) - c * t);
        float sinF = sin(f);
        float cosF = cos(f);
        return vec4(
          -dir.x * a * cosF,
          a * sinF,
          -dir.y * a * cosF,
          0.0
        );
      }

      void main() {
        vUv = uv;
        vec3 p = position;

        vec2 d1 = normalize(vec2(1.0, 0.3));
        vec2 d2 = normalize(vec2(0.3, 1.0));
        vec2 d3 = normalize(vec2(-0.5, 0.7));
        vec2 d4 = normalize(vec2(0.8, -0.5));

        vec4 w1 = gerstner(p.xz, d1, 0.22, 4.0, time * 0.8);
        vec4 w2 = gerstner(p.xz, d2, 0.18, 2.8, time * 0.95 + 1.7);
        vec4 w3 = gerstner(p.xz, d3, 0.12, 1.8, time * 1.15 + 3.2);
        vec4 w4 = gerstner(p.xz, d4, 0.07, 1.2, time * 1.4 + 5.0);

        vec3 disp = w1.xyz + w2.xyz + w3.xyz + w4.xyz;
        p += disp;
        vWave = disp.y;

        float k1 = 6.28318 / 4.0;  float c1 = sqrt(9.8 / k1);  float a1 = 0.22 / k1;
        float k2 = 6.28318 / 2.8;  float c2 = sqrt(9.8 / k2);  float a2 = 0.18 / k2;
        float k3 = 6.28318 / 1.8;  float c3 = sqrt(9.8 / k3);  float a3 = 0.12 / k3;
        float k4 = 6.28318 / 1.2;  float c4 = sqrt(9.8 / k4);  float a4 = 0.07 / k4;

        float f1 = k1 * (dot(d1, position.xz) - c1 * time * 0.8);
        float f2 = k2 * (dot(d2, position.xz) - c2 * time * 0.95 - 1.7 * c2);
        float f3 = k3 * (dot(d3, position.xz) - c3 * time * 1.15 - 3.2 * c3);
        float f4 = k4 * (dot(d4, position.xz) - c4 * time * 1.4 - 5.0 * c4);

        vec3 dPdx = vec3(
          1.0 - (d1.x * d1.x * a1 * k1 * sin(f1) + d2.x * d2.x * a2 * k2 * sin(f2)
               + d3.x * d3.x * a3 * k3 * sin(f3) + d4.x * d4.x * a4 * k4 * sin(f4)),
          d1.x * a1 * k1 * cos(f1) + d2.x * a2 * k2 * cos(f2) + d3.x * a3 * k3 * cos(f3) + d4.x * a4 * k4 * cos(f4),
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4))
        );
        vec3 dPdz = vec3(
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4)),
          d1.y * a1 * k1 * cos(f1) + d2.y * a2 * k2 * cos(f2) + d3.y * a3 * k3 * cos(f3) + d4.y * a4 * k4 * cos(f4),
          1.0 - (d1.y * d1.y * a1 * k1 * sin(f1) + d2.y * d2.y * a2 * k2 * sin(f2)
               + d3.y * d3.y * a3 * k3 * sin(f3) + d4.y * d4.y * a4 * k4 * sin(f4))
        );
        vec3 localNormal = normalize(cross(dPdz, dPdx));
        vNormalWS = normalize(mat3(modelMatrix) * localNormal);

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vViewWS = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewWS;
      varying vec3 vNormalWS;
      varying vec3 vWorldPos;

      // Simplex-like noise for caustics
      float hash22(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash22(i), hash22(i + vec2(1,0)), f.x),
                   mix(hash22(i + vec2(0,1)), hash22(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        // ─── Schlick Fresnel ──────────────────────────────────────
        float ndv = max(0.001, dot(vNormalWS, vViewWS));
        float R0 = 0.02;
        float fresnel = R0 + (1.0 - R0) * pow(1.0 - ndv, 5.0);
        fresnel = mix(fresnel, pow(1.0 - ndv, 2.4) * 0.9, 0.5);

        // ─── Opaque when viewed from BELOW ───────────────────────
        float viewFromBelow = step(dot(vNormalWS, vViewWS), 0.0);

        // ─── Deep / shallow / sky palette — HORROR DARK ──────────
        vec3 deep   = vec3(0.003, 0.015, 0.03);
        vec3 mid    = vec3(0.015, 0.06, 0.10);
        vec3 sky    = vec3(0.12, 0.20, 0.25);

        // ─── Enhanced caustic pattern — more realistic ──────────
        // Multiple overlapping caustic networks
        float c1 = sin(vUv.x * 32.0 + time * 0.9) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 26.0 + time * 1.1 + 2.0) * 0.5 + 0.5;
        float caustic1 = pow(c1 * c2, 2.5);

        // Noise-based caustics — more organic
        float cn1 = vnoise(vUv * 12.0 + time * 0.3);
        float cn2 = vnoise(vUv * 8.0 - time * 0.2 + 5.0);
        float caustic2 = pow(max(0.0, cn1 * cn2), 1.5) * 0.5;

        // Animated caustic network
        float cn3 = vnoise(vUv * 20.0 + vec2(time * 0.4, time * 0.3));
        float caustic3 = smoothstep(0.4, 0.8, cn3) * 0.3;

        float caustic = caustic1 + caustic2 + caustic3;

        // ─── Wave-height tinting ─────────────────────────────────
        float h = clamp(vWave * 5.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);

        // ─── Subsurface scattering — more visible ──────────────
        float sss = pow(max(0.0, h), 1.5) * 0.4;
        vec3 sssColor = vec3(0.04, 0.18, 0.12);
        col += sssColor * sss;

        // ─── Caustic light on surface ──────────────────────────
        col += vec3(0.02, 0.04, 0.03) * caustic * 0.5;

        // ─── Fresnel reflection of sky ──────────────────────────
        col = mix(col, sky, fresnel * 0.6 + caustic * 0.08);

        // ─── Specular highlights — multiple sources ────────────
        vec3 lightDir1 = normalize(vec3(0.4, 1.0, 0.3));
        vec3 halfVec1 = normalize(vViewWS + lightDir1);
        float spec1 = pow(max(0.0, dot(vNormalWS, halfVec1)), 256.0);
        col += vec3(0.5, 0.45, 0.35) * spec1 * 0.7 * (1.0 - fresnel * 0.5);

        // Secondary specular — from cave lights
        vec3 lightDir2 = normalize(vec3(-0.3, 0.8, -0.5));
        vec3 halfVec2 = normalize(vViewWS + lightDir2);
        float spec2 = pow(max(0.0, dot(vNormalWS, halfVec2)), 128.0);
        col += vec3(0.3, 0.25, 0.2) * spec2 * 0.3;

        // ─── Foam on wave crests + edge foam ────────────────────
        float foam = smoothstep(0.04, 0.09, vWave);
        float distFromCenter = length(vWorldPos.xz - vec2(0.0, 5.0));
        float edgeFoam = smoothstep(2.8, 2.2, distFromCenter) * 0.4;
        // Animated foam detail
        float foamDetail = vnoise(vUv * 30.0 + time * 0.1);
        foam *= 0.7 + foamDetail * 0.3;
        float totalFoam = max(foam * 0.5, edgeFoam);
        col = mix(col, vec3(0.5, 0.55, 0.58), totalFoam);

        // ─── Alpha: opaque from below, semi-transparent from above ──
        float alpha = mix(0.80, 0.95, fresnel);
        if (viewFromBelow > 0.5) {
            alpha = 1.0;
            col = vec3(0.008, 0.025, 0.04);
        }
        gl_FragColor = vec4(col, alpha);
      }
    `
);
interface WaterSurfaceProps {
    reflective?: boolean;
}
const WaterSurface: React.FC<WaterSurfaceProps> = ({ reflective = false }) => {
    const mat = useMemo(() => {
        const m = new (WaterMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
        if (reflective) (mat as any).opacity = 0.45;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            {reflective && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
                    <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05]} />
                    <MeshReflectorMaterial
                        blur={[300, 100]}
                        resolution={512}
                        mixBlur={1.0}
                        mixStrength={1.2}
                        roughness={0.6}
                        depthScale={0.4}
                        minDepthThreshold={0.4}
                        maxDepthThreshold={1.5}
                        color="#0a1a2a"
                        metalness={0.4}
                        mirror={0.65}
                    />
                </mesh>
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 64, 64]} />
                <primitive object={mat} attach="material" />
            </mesh>
        </group>
    );
};

// ─── Water ceiling disc — opaque BackSide disc with ripple shader ──────
const WaterCeilingDisc: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (WaterCeilingMaterial as any)();
        m.side = THREE.BackSide;
        m.depthWrite = true;
        m.transparent = false;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
    });
    return (
        <mesh
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.1, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.15, 48]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── DynamicFog — depth-based color absorption (Beer-Lambert style) ───
const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    // Pre-allocated depth-based fog colors — VISIBLE blue tint underwater
    const _surfaceFog = new THREE.Color('#0a2a50');  // visible blue near surface
    const _midFog = new THREE.Color('#061a3a');      // deep blue mid-depth
    const _deepFog = new THREE.Color('#03102a');     // dark blue at bottom
    const _caveFog = new THREE.Color('#0e0a08');     // warm dark cave
    const _surfaceBg = new THREE.Color('#0a2a50');
    const _midBg = new THREE.Color('#061a3a');
    const _deepBg = new THREE.Color('#03102a');
    const _caveBg = new THREE.Color('#0e0a08');

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;

        if (y >= SWIM_THRESHOLD_Y) {
            // Cave mode — breathing fog for horror atmosphere
            const breathe = Math.sin(performance.now() * 0.0002) * 0.5;
            const flicker = Math.sin(performance.now() * 0.001) * 0.1;
            _tgtFog.current.copy(_caveFog);
            _tgtBg.current.copy(_caveBg);
            const k = Math.min(1, 6 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            const tgtNear = 12 + breathe * 1.5 + flicker;
            const tgtFar = 50 + breathe * 4;
            scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (tgtFar - scene.fog.far) * k;
        } else {
            // Underwater — depth-based color absorption (Beer-Lambert style)
            const depth = Math.abs(y - SWIM_THRESHOLD_Y); // 0 at surface, ~29 at bottom
            const t = Math.min(depth / 29, 1); // 0-1 normalized depth

            // Interpolate fog color based on depth
            if (t < 0.4) {
                _tgtFog.current.copy(_surfaceFog).lerp(_midFog, t / 0.4);
                _tgtBg.current.copy(_surfaceBg).lerp(_midBg, t / 0.4);
            } else {
                _tgtFog.current.copy(_midFog).lerp(_deepFog, (t - 0.4) / 0.6);
                _tgtBg.current.copy(_midBg).lerp(_deepBg, (t - 0.4) / 0.6);
            }

            // Breathing fog for horror
            const breathe = Math.sin(performance.now() * 0.0003) * 0.5;
            // Wider fog so blue tint is visible
            const baseNear = 1.5 - t * 0.6; // 1.5 at surface, 0.9 at bottom
            const baseFar = 20 - t * 8;      // 20 at surface, 12 at bottom
            const tgtNear = Math.max(0.5, baseNear + breathe * 0.1);
            const tgtFar = Math.max(8, baseFar + breathe * 0.5);

            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (tgtFar - scene.fog.far) * k;
        }
        if (scene.background && (scene.background as any).isColor) {
            (scene.background as THREE.Color).copy(_bgColor.current);
        }
    });
    return null;
};

// ─── Underwater overlay — camera-following tint + caustic pattern ──────
const UnderwaterOverlay: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const mat = useMemo(() => {
        const m = new (UnderwaterOverlayMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.depthTest = false;
        m.renderOrder = 999;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
        const y = playerPositionRef.current?.y ?? 0;
        const isUnderwater = y < SWIM_THRESHOLD_Y;
        const m = meshRef.current;
        if (m) {
            m.visible = isUnderwater;
            if (isUnderwater) {
                m.position.copy(state.camera.position);
                m.quaternion.copy(state.camera.quaternion);
                m.translateZ(-0.3);
            }
        }
        (mat as any).depth = Math.min(Math.abs(y - SWIM_THRESHOLD_Y) / 29, 1);
    });
    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[1.6, 1.6]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── Underwater caustics — improved visibility ─────────────────────────
const CausticsMaterial = shaderMaterial(
    { time: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv * 10.0;
        // More octaves of interference for detailed caustics
        float a = sin(uv.x * 6.28 + time * 1.2) + sin((uv.x + uv.y) * 5.0 + time * 1.5);
        float b = sin(uv.y * 6.28 + time * 1.0 + 1.2) + sin((uv.y - uv.x) * 4.5 + time * 1.1);
        // Extra octave for more detail
        float c3 = sin(uv.x * 12.0 + uv.y * 8.0 + time * 2.0) * sin(uv.y * 10.0 - uv.x * 6.0 + time * 1.8);
        float c = pow(max(0.0, sin(a) * sin(b)), 2.0) + pow(max(0.0, c3), 3.0) * 0.5;
        // 3x brighter caustics — visible even in horror darkness
        vec3 col = vec3(c * 0.35, c * 0.65, c * 0.50);
        gl_FragColor = vec4(col, c * 0.45);
      }
    `
);
const UnderwaterCaustics: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (CausticsMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.toneMapped = false;
        return m;
    }, []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -29.95, 0]}>
            <planeGeometry args={[40, 40]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── Underwater flora — kelp + coral ─────────────────────────────────
const KELP_GEO = new THREE.CylinderGeometry(0.06, 0.10, 1, 5, 4);
type KelpData = readonly [number, number, number, number]; // x, z, height, phase
const KELP_POSITIONS: readonly KelpData[] = [
    [ 5.5, -8.0, 4.5, 0.3],
    [ 4.0, -9.5, 3.8, 1.1],
    [ 7.0, -7.0, 5.0, 2.0],
    [-3.5,  3.0, 4.0, 0.7],
    [-5.0,  4.5, 3.2, 1.4],
    [-6.5,  3.0, 4.8, 2.3],
    [10.0,  4.0, 4.5, 0.9],
    [11.5,  6.0, 3.5, 1.7],
    // NEW — denser kelp forest
    [ 6.5, -10.0, 5.5, 0.5],
    [ 3.0, -7.0, 3.5, 1.8],
    [ 8.5, -6.0, 4.2, 2.5],
    [-2.0,  5.0, 3.8, 0.2],
    [-7.0,  2.0, 5.2, 1.0],
    [12.0,  3.0, 4.0, 0.6],
    [-8.0,  7.0, 3.0, 1.3],
    [15.0, -3.0, 4.8, 2.1],
];

// KelpField — single useFrame driving all kelp
const KelpField: React.FC = () => {
    const meshRefs = useRef<(THREE.Mesh | null)[][]>(
        KELP_POSITIONS.map(() => new Array(3).fill(null))
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let k = 0; k < KELP_POSITIONS.length; k++) {
            const phase = KELP_POSITIONS[k][3];
            const segments = 3;
            for (let i = 0; i < segments; i++) {
                const m = meshRefs.current[k]?.[i];
                if (!m) continue;
                const swayAmt = (i / segments) * 0.25;
                m.rotation.z = Math.sin(t * 0.6 + phase + i * 0.4) * swayAmt;
                m.rotation.x = Math.cos(t * 0.5 + phase + i * 0.3) * swayAmt * 0.6;
            }
        }
    });
    return (
        <>
            {KELP_POSITIONS.map(([x, z, height, phase], k) => {
                const segments = 3;
                const segLen = height / segments;
                return (
                    <group key={`kelp-${k}`} position={[x, -30, z]}>
                        {Array.from({ length: segments }, (_, i) => (
                            <mesh
                                key={i}
                                ref={(r: any) => { if (meshRefs.current[k]) meshRefs.current[k][i] = r; }}
                                position={[0, segLen * 0.5 + i * segLen * 0.95, 0]}
                                geometry={KELP_GEO}
                                scale={[1 - i * 0.1, segLen, 1 - i * 0.1]}
                            >
                                <meshStandardMaterial color={i < 2 ? '#0a0805' : '#0c0a06'} roughness={0.85} flatShading />
                            </mesh>
                        ))}
                        {/* Kelp leaf — flat plane at the top */}
                        <mesh
                            position={[0, height * 0.9, 0]}
                            rotation={[0.3 + Math.sin(phase) * 0.2, phase, 0.1]}
                            scale={[0.6, 0.3, 0.02]}
                        >
                            <planeGeometry args={[1, 1]} />
                            <meshStandardMaterial color="#0c0f06" roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.85} />
                        </mesh>
                    </group>
                );
            })}
        </>
    );
};

type CoralData = readonly [number, number, string, number]; // x, z, color, scale
const CORAL_POSITIONS: readonly CoralData[] = [
    [ 3.0, -5.0, '#1a1208', 1.0],
    [-4.0,  6.0, '#1a0e06', 0.8],
    [ 9.0, -2.0, '#1a1610', 1.2],
    [-12.0, -5.0, '#1a1208', 0.9],
    [13.0,  3.0, '#1a0e06', 1.0],
    [-8.0, 12.0, '#1a1610', 0.7],
];

const Coral: React.FC<{ x: number; z: number; color: string; scale: number }> = ({ x, z, color, scale }) => (
    <group position={[x, -30, z]} scale={scale}>
        {/* Base rock */}
        <mesh position={[0, 0.3, 0]}>
            <dodecahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#0e0a06" roughness={0.95} metalness={0.05} flatShading />
        </mesh>
        {/* Branch 1 — main trunk */}
        <mesh position={[0, 1.0, 0]} rotation={[0.1, 0, 0.15]}>
            <cylinderGeometry args={[0.06, 0.1, 1.2, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        {/* Branch 2 — split */}
        <mesh position={[0.15, 1.5, 0.1]} rotation={[0, 0.4, 0.3]}>
            <cylinderGeometry args={[0.04, 0.07, 0.8, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        {/* Branch 3 — opposite split */}
        <mesh position={[-0.12, 1.4, -0.08]} rotation={[0.2, -0.3, -0.25]}>
            <cylinderGeometry args={[0.04, 0.06, 0.7, 5]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        {/* Tip bulbs — bioluminescent for horror */}
        <mesh position={[0.15, 1.9, 0.1]}>
            <sphereGeometry args={[0.08, 6, 4]} />
            <meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} />
        </mesh>
        <mesh position={[-0.12, 1.75, -0.08]}>
            <sphereGeometry args={[0.06, 6, 4]} />
            <meshStandardMaterial color="#1a3020" emissive="#081810" emissiveIntensity={0.3} roughness={0.8} />
        </mesh>
    </group>
);

// ─── Subnautica-style god ray shafts — brighter with gradient ──────────
const GodRayShafts: React.FC = () => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    });
    const SHAFT_COUNT = 12;
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            {Array.from({ length: SHAFT_COUNT }, (_, i) => {
                const a = (i / SHAFT_COUNT) * Math.PI * 2;
                const r = 0.3 + (i % 3) * 0.8;
                const w = 1.2 + (i % 4) * 0.5;
                const h = 26 + (i % 3) * 2;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
                        rotation={[0, a, 0]}
                    >
                        <planeGeometry args={[w, h]} />
                        <meshBasicMaterial
                            color={i % 3 === 0 ? '#0a3828' : i % 3 === 1 ? '#0c3020' : '#083028'}
                            transparent
                            opacity={0.08 + (i % 4) * 0.03}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            toneMapped={false}
                        />
                    </mesh>
                );
            })}
            {/* Outer glow cone — wide, soft */}
            <mesh position={[0, 10, 0]}>
                <coneGeometry args={[3.5, 16, 16, 1, true]} />
                <meshBasicMaterial
                    color="#1a5040"
                    transparent
                    opacity={0.07}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            {/* Mid cone */}
            <mesh position={[0, 9, 0]}>
                <coneGeometry args={[2.0, 12, 12, 1, true]} />
                <meshBasicMaterial
                    color="#1a6050"
                    transparent
                    opacity={0.06}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
            {/* Core — brightest */}
            <mesh position={[0, 8, 0]}>
                <coneGeometry args={[0.8, 8, 8, 1, true]} />
                <meshBasicMaterial
                    color="#2a8060"
                    transparent
                    opacity={0.05}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
};

// ─── Deep Mist — slowly drifting fog plane underwater ────────────────
const DeepMist: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    const matRef2 = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const m = matRef.current;
        if (m) m.opacity = 0.04 + Math.sin(t * 0.2) * 0.015;
        const m2 = matRef2.current;
        if (m2) m2.opacity = 0.025 + Math.sin(t * 0.15 + 1.0) * 0.01;
    });
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
                <planeGeometry args={[60, 60]} />
                <meshBasicMaterial ref={matRef} color="#040808" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -22, 0]}>
                <planeGeometry args={[50, 50]} />
                <meshBasicMaterial ref={matRef2} color="#020406" transparent opacity={0.025} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
        </group>
    );
};

// ─── Debris particles — tiny dark specs drifting underwater ──────────
const DEBRIS_COUNT = 40;  // reduced from 60 — outside fog range anyway
const DEBRIS_GEO = new THREE.SphereGeometry(1, 3, 2);
const DebrisField: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(DEBRIS_COUNT).fill(null));
    const data = useRef(
        Array.from({ length: DEBRIS_COUNT }, () => ({
            x: (Math.random() - 0.5) * 50,
            y: -5 + Math.random() * -23,
            z: (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 0.01,
            vy: (Math.random() - 0.5) * 0.005,
            vz: (Math.random() - 0.5) * 0.01,
            seed: Math.random() * 10,
        }))
    );
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const d = data.current[i];
            d.x += (d.vx + Math.sin(t * 0.1 + d.seed) * 0.002) * safeDt;
            d.y += (d.vy + Math.cos(t * 0.08 + d.seed) * 0.001) * safeDt;
            d.z += (d.vz + Math.sin(t * 0.09 + d.seed * 0.7) * 0.002) * safeDt;
            // Wrap around
            if (d.x < -25) d.x = 25;
            if (d.x > 25) d.x = -25;
            if (d.y < -29) d.y = -5;
            if (d.y < -29) d.y = -3;
            if (d.z < -25) d.z = 25;
            if (d.z > 25) d.z = -25;
            const r = refs.current[i];
            if (r) r.position.set(d.x, d.y, d.z);
        }
    });
    return (
        <Instances limit={DEBRIS_COUNT} range={DEBRIS_COUNT} geometry={DEBRIS_GEO}>
            <meshBasicMaterial color="#080808" transparent opacity={0.25} depthWrite={false} />
            {Array.from({ length: DEBRIS_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.015 + Math.random() * 0.03} />
            ))}
        </Instances>
    );
};

// ─── Fish school — small fish swimming in circular paths ──────────────
const FISH_GEO = new THREE.ConeGeometry(0.18, 0.55, 4);
const FISH_COUNT = 8;
const FishSchool: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>(new Array(FISH_COUNT).fill(null));
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < FISH_COUNT; i++) {
            const f = refs.current[i];
            if (!f) continue;
            const offset = i / FISH_COUNT;
            const radius = 4 + Math.sin(offset * 13.7) * 4.5;
            const speed = 0.18 + offset * 0.12;
            const angle = t * speed + offset * Math.PI * 4;
            const y = -18 + Math.sin(t * 0.7 + offset * 8) * 5 + (offset - 0.5) * 6;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            f.position.set(x, y, z);
            f.rotation.y = -angle + Math.PI / 2;
            f.rotation.z = Math.PI / 2;
            f.rotation.x = Math.sin(t * 6 + offset * 20) * 0.15;
        }
    });
    return (
        <group>
            {Array.from({ length: FISH_COUNT }, (_, i) => (
                <mesh
                    key={i}
                    ref={(r: any) => { refs.current[i] = r; }}
                    geometry={FISH_GEO}
                    scale={0.6 + (i % 3) * 0.25}
                >
                    <meshStandardMaterial
                        color={i % 3 === 0 ? '#1a2a30' : i % 3 === 1 ? '#0e1a20' : '#162228'}
                        emissive={i % 3 === 0 ? '#081018' : '#060c10'}
                        emissiveIntensity={0.2}
                        roughness={0.8}
                        flatShading
                    />
                </mesh>
            ))}
        </group>
    );
};

const UnderwaterFlora: React.FC = () => (
    <>
        <KelpField />
        {CORAL_POSITIONS.map(([x, z, color, s], i) => (
            <Coral key={`coral-${i}`} x={x} z={z} color={color} scale={s} />
        ))}
    </>
);

// ─── God Ray — volumetric light beam from the water hole ─────────────────
const GodRay: React.FC = () => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    useFrame((state) => {
        if (matRef.current) matRef.current.uniforms.time.value = state.clock.elapsedTime;
    });
    return (
        <mesh position={[HOLE_CENTER_X, -10, HOLE_CENTER_Z]} rotation={[0, 0, 0]}>
            <coneGeometry args={[5, 25, 32, 1, true]} />
            <shaderMaterial
                ref={matRef}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                uniforms={{
                    time: { value: 0 },
                    uColor: { value: new THREE.Color('#1a5a8a') },
                }}
                vertexShader={`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `}
                fragmentShader={`
                    uniform float time;
                    uniform vec3 uColor;
                    varying vec2 vUv;
                    void main() {
                        // Fade from center to edges
                        float dist = length(vUv - 0.5) * 2.0;
                        float alpha = smoothstep(1.0, 0.0, dist);
                        // Fade along length (stronger near top)
                        alpha *= (1.0 - vUv.y) * 0.5;
                        // Subtle animation
                        alpha *= 0.7 + 0.3 * sin(time * 0.5 + vUv.y * 3.0);
                        // Make it very subtle for horror atmosphere
                        alpha *= 0.15;
                        gl_FragColor = vec4(uColor, alpha);
                    }
                `}
            />
        </mesh>
    );
};

// ─── Underwater Sediment — floating particles for depth perception ───────
const SEDIMENT_COUNT = 120;  // reduced from 200 — outside fog range
const UnderwaterSediment: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(SEDIMENT_COUNT).fill(null));
    const data = useRef(
        Array.from({ length: SEDIMENT_COUNT }, () => ({
            x: (Math.random() - 0.5) * 56,
            y: -2 + Math.random() * -27,
            z: (Math.random() - 0.5) * 56,
            vx: (Math.random() - 0.5) * 0.008,
            vy: (Math.random() - 0.5) * 0.004,
            vz: (Math.random() - 0.5) * 0.008,
            seed: Math.random() * 10,
        }))
    );
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < SEDIMENT_COUNT; i++) {
            const d = data.current[i];
            d.x += (d.vx + Math.sin(t * 0.08 + d.seed) * 0.002) * safeDt;
            d.y += (d.vy + Math.cos(t * 0.06 + d.seed * 0.7) * 0.001) * safeDt;
            d.z += (d.vz + Math.sin(t * 0.07 + d.seed * 1.3) * 0.002) * safeDt;
            // Wrap around
            if (d.x < -28) d.x = 28;
            if (d.x > 28) d.x = -28;
            if (d.y < -29) d.y = -2;
            if (d.y > -2) d.y = -29;
            if (d.z < -28) d.z = 28;
            if (d.z > 28) d.z = -28;
            const r = refs.current[i];
            if (r) r.position.set(d.x, d.y, d.z);
        }
    });
    return (
        <Instances limit={SEDIMENT_COUNT} range={SEDIMENT_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#8a9aaa" transparent opacity={0.2} depthWrite={false} />
            {Array.from({ length: SEDIMENT_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.02 + Math.random() * 0.04} />
            ))}
        </Instances>
    );
};

// ─── Drifting bubbles (underwater) ─────────────────────────────────────
const BUBBLE_COUNT = 35;
const BUBBLE_RANGE = 18;
const BUBBLE_RISE = 0.5;
const BUBBLE_MAX_Y = WATER_LEVEL_Y - 0.5;
const BUBBLE_MIN_Y = -29;

// ─── Plankton particles (underwater) ──────────────────────────────────
const PLANKTON_COUNT = 50;
const PLANKTON_GEO = new THREE.SphereGeometry(1, 4, 3);
const PlanktonField: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(PLANKTON_COUNT).fill(null));
    // Pre-compute base positions for deterministic absolute movement
    const basePositions = useRef(
        Array.from({ length: PLANKTON_COUNT }, (_, i) => {
            const h1 = Math.sin(i * 127.1 + 1.7) * 43758.5453;
            const h2 = Math.sin(i * 269.5 + 3.1) * 43758.5453;
            const h3 = Math.sin(i * 419.2 + 0.8) * 43758.5453;
            return {
                x: HOLE_CENTER_X + (h1 - Math.floor(h1) - 0.5) * 30,
                y: -3 - (h2 - Math.floor(h2)) * 25,
                z: HOLE_CENTER_Z + (h3 - Math.floor(h3) - 0.5) * 30,
            };
        })
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < PLANKTON_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            const bp = basePositions.current[i];
            // Absolute position based on time — no drift, no accumulation errors
            r.position.x = bp.x + Math.sin(t * 0.15 + i * 7.31) * 0.3;
            r.position.y = bp.y + Math.cos(t * 0.12 + i * 7.31 * 1.3) * 0.2;
            r.position.z = bp.z + Math.sin(t * 0.13 + i * 7.31 * 0.7) * 0.3;
        }
    });
    return (
        <Instances limit={PLANKTON_COUNT} range={PLANKTON_COUNT} geometry={PLANKTON_GEO}>
            {/* Darkened plankton for horror */}
            <meshBasicMaterial color="#1a1808" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
            {Array.from({ length: PLANKTON_COUNT }, (_, i) => {
                const bp = basePositions.current[i];
                const s = 0.012 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 0.02;  // deterministic scale
                return (
                    <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} position={[bp.x, bp.y, bp.z]} scale={s} />
                );
            })}
        </Instances>
    );
};

const BubbleField: React.FC = () => {
    const positions = useRef(
        Array.from({ length: BUBBLE_COUNT }, () => ({
            x: HOLE_CENTER_X + (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            y: BUBBLE_MIN_Y + Math.random() * (BUBBLE_MAX_Y - BUBBLE_MIN_Y),
            z: HOLE_CENTER_Z + (Math.random() - 0.5) * BUBBLE_RANGE * 2,
            speed: BUBBLE_RISE * (0.7 + Math.random() * 0.6),
        }))
    );
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(BUBBLE_COUNT).fill(null));

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const pos = positions.current;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const p = pos[i];
            p.y += p.speed * safeDt;
            if (p.y > BUBBLE_MAX_Y) {
                p.y = BUBBLE_MIN_Y;
                // Deterministic reset using sin hash instead of Math.random() (avoids GC spikes)
                const h = Math.sin(i * 127.1 + p.y * 311.7) * 43758.5453;
                const hf = h - Math.floor(h);
                p.x = HOLE_CENTER_X + (hf - 0.5) * BUBBLE_RANGE * 2;
                const h2 = Math.sin(i * 269.5 + p.y * 183.3) * 43758.5453;
                const hf2 = h2 - Math.floor(h2);
                p.z = HOLE_CENTER_Z + (hf2 - 0.5) * BUBBLE_RANGE * 2;
            }
            const r = refs.current[i];
            if (r) r.position.set(p.x, p.y, p.z);
        }
    });

    return (
        <Instances limit={BUBBLE_COUNT} range={BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#2a3a40" transparent opacity={0.2} depthWrite={false} toneMapped={false} />
            {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.03 + Math.random() * 0.05} />
            ))}
        </Instances>
    );
};

// ─── Surface bubble ring — larger bubbles right at water surface ──────
const SurfaceBubbleRing: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(SURFACE_BUBBLE_COUNT).fill(null));
    const offsets = useRef(
        Array.from({ length: SURFACE_BUBBLE_COUNT }, (_, i) => ({
            angle: (i / SURFACE_BUBBLE_COUNT) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2,
            r: SURFACE_BUBBLE_RING_RADIUS * (0.6 + Math.sin(i * 13.1) * 0.5 + 0.5) * 0.5,
            phase: i * 1.7,
        }))
    );
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < SURFACE_BUBBLE_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            const o = offsets.current[i];
            const wobble = Math.sin(t * 0.8 + o.phase) * 0.3;
            const a = o.angle + wobble * 0.1;
            r.position.set(
                HOLE_CENTER_X + Math.cos(a) * (o.r + wobble),
                WATER_LEVEL_Y - 0.2 + Math.sin(t * 1.2 + o.phase) * 0.1,
                HOLE_CENTER_Z + Math.sin(a) * (o.r + wobble),
            );
        }
    });
    return (
        <Instances limit={SURFACE_BUBBLE_COUNT} range={SURFACE_BUBBLE_COUNT} geometry={BUBBLE_GEO}>
            <meshBasicMaterial color="#3a4a50" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
            {Array.from({ length: SURFACE_BUBBLE_COUNT }, (_, i) => {
                const s = 0.06 + Math.sin(i * 5.7) * 0.5 * 0.04;
                return <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={s} />;
            })}
        </Instances>
    );
};

// ─── Shard ─────────────────────────────────────────────────────────────
const COLLECT_DIST_SQ = 1.4 * 1.4;
interface ShardProps {
    index: number;
    position: readonly [number, number, number];
    collected: boolean;
    onCollect: (i: number) => void;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}
const Shard: React.FC<ShardProps> = ({ index, position, collected, onCollect, playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    const collectStartRef = useRef<number | null>(null);
    const { camera } = useThree();

    useFrame((state) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;

        const dxCam = position[0] - camera.position.x;
        const dyCam = position[1] - camera.position.y;
        const dzCam = position[2] - camera.position.z;
        if (dxCam*dxCam + dyCam*dyCam + dzCam*dzCam > 600) {
            g.visible = false;
            return;
        }

        g.rotation.y = t * 0.7 + index;
        g.rotation.x = Math.sin(t * 0.5 + index) * 0.3;
        g.position.set(position[0], position[1] + Math.sin(t * 1.2 + index) * 0.15, position[2]);

        if (collected) {
            if (collectStartRef.current === null) collectStartRef.current = t;
            const elapsed = t - collectStartRef.current;
            const k = Math.max(0, 1 - elapsed * 2);
            g.scale.setScalar(k);
            if (k <= 0.001) g.visible = false;
            return;
        }
        g.visible = true;
        g.scale.setScalar(1 + Math.sin(t * 2 + index) * 0.05);

        const pp = playerPositionRef.current;
        const dx = position[0] - pp.x;
        const dy = position[1] - pp.y;
        const dz = position[2] - pp.z;
        if (dx*dx + dy*dy + dz*dz < COLLECT_DIST_SQ) onCollect(index);
    });

    return (
        <group ref={groupRef} position={[position[0], position[1], position[2]]}>
            <mesh geometry={SHARD_GEO}>
                <meshStandardMaterial
                    color="#9be8ff"
                    emissive="#5ad8ff"
                    emissiveIntensity={1.5}
                    metalness={0.4}
                    roughness={0.1}
                    toneMapped={false}
                />
            </mesh>
            <sprite scale={[1.3, 1.3, 1]}>
                <spriteMaterial map={GLOW_TEXTURE} color="#9be8ff" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            {/* NO pointLight — causes square lights on mobile. Sprite glow only. */}
        </group>
    );
};

// ─── Shard positions (underwater, around the boulder field) ───────────
export const SHARD_POSITIONS: readonly (readonly [number, number, number])[] = [
    [  7.5, -27.5,  -7.5],
    [-13.0, -27.7,   4.8],
    [  3.5, -27.7,  13.5],
    [-18.0, -27.7, -10.0],
    [ 19.5, -27.7,  11.5],
] as const;

// ─── Water occluder — depth-only mesh that blocks X-ray from underwater ──
const WaterOccluder: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        const m = meshRef.current;
        if (m) {
            m.visible = playerPositionRef.current.y < SWIM_THRESHOLD_Y;
        }
    });
    return (
        <mesh
            ref={meshRef}
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.05, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={-1}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.3, 48]} />
            <meshBasicMaterial colorWrite={false} depthWrite={true} transparent={false} side={THREE.DoubleSide} />
        </mesh>
    );
};

// ─── God rays — light shafts from the surface hole ────────────────────
const GOD_RAY_GEO = new THREE.CylinderGeometry(1, 0.3, 15, 8, 1, true);
const GodRays: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame(() => {
        const g = groupRef.current;
        if (g) {
            g.visible = playerPositionRef.current.y < SWIM_THRESHOLD_Y;
        }
    });
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            {/* Main central ray */}
            <mesh geometry={GOD_RAY_GEO} rotation={[0, 0, 0.1]}>
                <meshBasicMaterial color="#1a4a5a" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            {/* Secondary offset ray */}
            <mesh geometry={GOD_RAY_GEO} position={[0.5, -2, 0.3]} rotation={[0.05, 0.3, -0.15]} scale={0.7}>
                <meshBasicMaterial color="#1a5a6a" transparent opacity={0.03} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
        </group>
    );
};

// ─── Full level ────────────────────────────────────────────────────────
interface Floor2EnvironmentProps {
    quality?: 'low' | 'medium' | 'high';
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onCollectShard: (i: number) => void;
    reflective?: boolean;
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    reflective = false,
    quality = 'medium',
}) => {
    // ─── Load real PBR texture sets ────────────────────────────────
    const caveFloor = usePBRSet(
        caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
        12, 12
    );
    const caveWall = usePBRSet(
        caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
        4, 2
    );
    const caveRock = usePBRSet(
        caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
        1, 1
    );
    const uwFloor = usePBRSet(
        uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
        20, 20
    );
    const uwRock = usePBRSet(
        uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
        1, 1
    );
    const uwWall = usePBRSet(
        uwWallColor, uwWallNormal, uwWallRoughness, uwWallAO,
        4, 2
    );

    // ─── Load rock GLB models ──────────────────────────────────────
    const rockModels = ROCK_MODEL_URLS.map(u => useGLTF(u));
    const boulderModel_ = useGLTF(BOULDER_MODEL_URL);

    const rockScenes = useMemo(() => rockModels.map(m => m.scene.clone(true)), [rockModels]);
    const boulderScene = useMemo(() => boulderModel_.scene.clone(true), [boulderModel_]);

    return (
    <group>
        <color attach="background" args={['#0e0a08']} />
        <fog attach="fog" args={['#0e0a08', 16, 60]} />

        {/* ═══ UE5-QUALITY CAVE LIGHTING ═══ */}

        {/* Base ambient — very dim, warm cave tone */}
        <ambientLight intensity={0.22} color="#b8a080" />

        {/* Hemisphere — warm above, cold below (simulates sky/ground bounce) */}
        <hemisphereLight intensity={0.35} color="#d4b898" groundColor="#0a0806" />

        {/* Main directional — shaft of light from above (like sun through a crack) */}
        <directionalLight position={[3, 25, 2]} intensity={0.45} color="#ffe0b0" castShadow={false} />

        {/* Secondary fill — dim blue-green from the water pool */}
        <directionalLight position={[0, 2, 5]} intensity={0.12} color="#2a4a5a" />

        {/* Warm rim light — catches edges of rocks */}
        <directionalLight position={[-15, 8, -10]} intensity={0.18} color="#ff9060" />

        {/* Cool accent — moon-like light from the cave entrance */}
        <directionalLight position={[20, 12, -15]} intensity={0.1} color="#8090b0" />

        {/* Point lights for localized pools of warmth */}
        <pointLight position={[-18, 3, 12]} intensity={1.2} color="#ff6030" distance={12} decay={2} />
        <pointLight position={[16, 2.5, -8]} intensity={0.8} color="#ff8040" distance={10} decay={2} />
        <pointLight position={[0, 4, 20]} intensity={0.6} color="#ff7028" distance={8} decay={2} />

        {/* Water pool glow — reflected light from the water surface */}
        <pointLight position={[0, 0.5, 5]} intensity={0.5} color="#1a3a4a" distance={8} decay={2} />

        {/* Ember sprites — warm glow on floor, NO pointLight (square artifact) */}
        <sprite position={[-25, 0.8, 0]} scale={[9, 9, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#6a2010" transparent opacity={0.3} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[25, 0.8, -5]} scale={[8, 8, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#5a1808" transparent opacity={0.28} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[0, 0.8, 25]} scale={[7, 7, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#4a1508" transparent opacity={0.22} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[0, 0.8, -25]} scale={[7, 7, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#4a1508" transparent opacity={0.22} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        {/* Additional ember sprites for more coverage */}
        <sprite position={[-15, 1.0, -15]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.18} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[18, 0.6, 18]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#4a1808" transparent opacity={0.2} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>

        <DynamicFog playerPositionRef={playerPositionRef} />


        {/* ─── CAVE FLOOR with hole ─── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
            frustumCulled={false}
        >
            <meshStandardMaterial
                color="#1a1610"
                map={caveFloor.color}
                normalMap={caveFloor.normal}
                normalScale={new THREE.Vector2(2.5, 2.5)}
                roughnessMap={caveFloor.rough}
                roughness={0.88}
                aoMap={caveFloor.ao}
                aoMapIntensity={1.2}
                side={THREE.DoubleSide}
            />
        </mesh>

        {/* Cave floor underside — blocks X-ray from underwater looking up */}
        <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[62, 62]} />
            <meshStandardMaterial color="#0a0806" map={caveFloor.color} normalMap={caveFloor.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveFloor.rough} roughness={0.92} aoMap={caveFloor.ao} aoMapIntensity={1.0} side={THREE.BackSide} />
        </mesh>

        {/* Cave ceiling — 3D ORGANIC with stalactite-like bumps */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={CAVE_CEILING_GEO} frustumCulled={false}>
            <meshStandardMaterial color="#1a1610" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={1} aoMap={caveWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — ORGANIC displaced PlaneGeometry (no more boxGeometry!) */}
        {/* North wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, 5, -30]} rotation={[0, 0, 0]} geometry={CAVE_WALL_N_GEO} frustumCulled={false}>
            <meshStandardMaterial color="#1a1610" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={1.0} side={THREE.DoubleSide} />
        </mesh>
        {/* South wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, 5, 30]} rotation={[0, Math.PI, 0]} geometry={CAVE_WALL_S_GEO} frustumCulled={false}>
            <meshStandardMaterial color="#1a1610" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={1.0} side={THREE.DoubleSide} />
        </mesh>
        {/* West wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, 5, 0]} rotation={[0, Math.PI / 2, 0]} geometry={CAVE_WALL_W_GEO} frustumCulled={false}>
            <meshStandardMaterial color="#1a1610" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={1.0} side={THREE.DoubleSide} />
        </mesh>
        {/* East wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, 5, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={CAVE_WALL_E_GEO} frustumCulled={false}>
            <meshStandardMaterial color="#1a1610" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={1.0} side={THREE.DoubleSide} />
        </mesh>

        {/* Cave boulders — real GLB models with PBR textures */}
        {CAVE_ROCKS_DARK.map(([x, y, z, s, ry], i) => (
            <group key={`dark-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}
        {CAVE_ROCKS_MID.map(([x, y, z, s, ry], i) => (
            <group key={`mid-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[(i + 1) % 4].clone(true)} />
            </group>
        ))}
        {/* Light pebbles — instanced icosahedra */}
        <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* POOL RIM — individual boulders forming the circular edge */}
        {POOL_RIM.map(([x, y, z, s, ry], i) => (
            <group key={`rim-${i}`} position={[x, y + s * 0.25, z]} scale={[s, s * 0.5, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Stalagmites — procedural noise-displaced cones rising from the floor */}
        {STALAGMITES.map(([x, z, h, r], i) => (
            <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]} geometry={PROC_STALAGMITE_GEOS[i % PROC_STALAGMITE_GEOS.length]}>
                <meshStandardMaterial color="#3a3024" map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveRock.rough} roughness={0.92} aoMap={caveRock.ao} aoMapIntensity={0.6} flatShading />
            </mesh>
        ))}

        {/* Stalactites — procedural noise-displaced inverted cones from the ceiling */}
        {STALACTITES.map(([x, z, h, r], i) => (
            <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]} geometry={PROC_STALACTITE_GEOS[i % PROC_STALACTITE_GEOS.length]}>
                <meshStandardMaterial color="#322a1f" map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveRock.rough} roughness={0.92} aoMap={caveRock.ao} aoMapIntensity={0.6} flatShading />
            </mesh>
        ))}

        {/* Decorative glowing crystal clusters on the walls */}
        {CRYSTALS.map(([x, y, z, color], i) => (
            <CrystalCluster key={`crystal-${i}`} x={x} y={y} z={z} color={color} />
        ))}

        {/* Wall-mounted torches with flicker */}
        {TORCH_POSITIONS.map(([x, y, z], i) => (
            <Torch key={`torch-${i}`} x={x} y={y} z={z} seed={i * 7.3} />
        ))}

        {/* Floating dust motes catching the warm light */}
        <DustMotes />

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* Opaque water column — blocks X-ray from the sides.
            BackSide renders the inner face visible when looking OUT from inside the water column.
            Extends 8 units below surface to cover most viewing angles. */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 16, HOLE_CENTER_Z]}>
            <cylinderGeometry args={[HOLE_RADIUS + 0.15, HOLE_RADIUS + 0.15, 32, 32, 1, true]} />
            <meshBasicMaterial color="#020508" side={THREE.BackSide} depthWrite={true} transparent={false} />
        </mesh>
        {/* Opaque water ceiling disc — primary X-ray blocker from below.
            BackSide = only visible from below (underwater), blocks seeing cave/elevator through water.
            Uses WaterCeilingMaterial for animated ripple effect. */}
        <WaterCeilingDisc />
        <WaterOccluder playerPositionRef={playerPositionRef} />

        {/* Underwater overlay — screen-space tint and caustic when underwater */}
        <UnderwaterOverlay playerPositionRef={playerPositionRef} />

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]} frustumCulled={false}>
            <meshStandardMaterial
                color="#060804"
                map={uwFloor.color}
                normalMap={uwFloor.normal}
                normalScale={new THREE.Vector2(2.0, 2.0)}
                roughnessMap={uwFloor.rough}
                roughness={0.95}
                aoMap={uwFloor.ao}
                aoMapIntensity={1.5}
            />
        </mesh>

        {/* RGB caustics on the seafloor */}
        <UnderwaterCaustics />

        {/* Underwater flora — kelp & coral */}
        <UnderwaterFlora />

        {/* God ray shafts descending from the surface */}
        <GodRayShafts />
        <GodRays playerPositionRef={playerPositionRef} />

        {/* God ray — volumetric light beam from the water hole */}
        <GodRay />

        {/* Deep Mist — drifting fog plane */}
        <DeepMist />

        {/* Underwater sediment — floating particles for depth perception */}
        <UnderwaterSediment />

        {/* Debris particles — tiny specs drifting */}
        <DebrisField />

        {/* Small fish school looping around the boulder field */}
        <FishSchool />

        {/* Underwater boulders — darkened */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Underwater pebbles — darkened */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(1.8, 1.8)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        <BubbleField />
        <SurfaceBubbleRing />
        <PlanktonField />

        {/* Scattered 3D rock formations on the underwater floor — procedural noise rocks */}
        {UW_SCATTERED_ROCKS.map(([x, y, z, s, ry, rx], i) => (
            <mesh
                key={`uwrock-${i}`}
                position={[x, y + s * 0.4, z]}
                scale={[s, s * 0.7, s]}
                rotation={[rx, ry, 0]}
                geometry={i % 4 === 0 ? PROC_ROCK_A : i % 4 === 1 ? PROC_ROCK_B : i % 4 === 2 ? PROC_ROCK_C : PROC_ROCK_D}
            >
                <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
            </mesh>
        ))}

        {/* ─── UNDERWATER CAVE WALLS — organic displaced PlaneGeometry ─── */}
        {/* North underwater wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, -15, -30]} rotation={[0, 0, 0]} geometry={UW_WALL_NORTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* South underwater wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, -15, 30]} rotation={[0, Math.PI, 0]} geometry={UW_WALL_SOUTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* West underwater wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, -15, 0]} rotation={[0, Math.PI / 2, 0]} geometry={UW_WALL_WEST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* East underwater wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, -15, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={UW_WALL_EAST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>

        {/* Underwater coral/rock pillars — tall vertical formations */}
        {UW_CORAL_PILLARS.map(([x, z, h, rTop, rBot], i) => (
            <mesh key={`coral-${i}`} position={[x, -30 + h / 2, z]}>
                <cylinderGeometry args={[rTop, rBot, h, 8]} />
                <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading side={THREE.DoubleSide} />
            </mesh>
        ))}

        {/* Underwater arches — curved rock formations spanning the seafloor */}
        {UW_ARCHES.map(([x, z, h, span, thick], i) => (
            <group key={`arch-${i}`} position={[x, -30, z]}>
                {/* Left pillar */}
                <mesh position={[-span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Right pillar */}
                <mesh position={[span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Top beam */}
                <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[thick * 0.8, thick * 0.8, span + thick * 2, 6]} />
                    <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
            </group>
        ))}

        {SHARD_POSITIONS.map((pos, i) => (
            <Shard
                key={i}
                index={i}
                position={pos}
                collected={collectedShards.has(i)}
                onCollect={onCollectShard}
                playerPositionRef={playerPositionRef}
            />
        ))}

        {/* ─── UE5-QUALITY CAVE ENHANCEMENTS ─── */}
        <CaveEnhancements quality={quality} />

        {/* Elevator shell — in the cave wall */}
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
            <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
        </group>
    </group>
    );
};
