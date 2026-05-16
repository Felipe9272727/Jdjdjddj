/**
 * Floor2Underwater.tsx — cave with a hole leading into a submerged void.
 *
 * Layout (Y axis):
 *   Y = 8        cave ceiling
 *   Y = 0.35     water surface (raised above the cave floor like a natural pool)
 *   Y = 0        cave floor (with a circular hole at HOLE_CENTER, radius HOLE_R)
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
import { ElevatorFacade } from './Elevator';
import type { Quality } from './Settings';
import {
    caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
    caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
    caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
    uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
    uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
    rockModelA, rockModelB, rockModelC, rockModelD,
    boulderModel, pebbleModel,
} from './assets/textureImports';

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
export const WATER_LEVEL_Y = 0.35;
export const SWIM_THRESHOLD_Y = 0.10;   // below this the player is "in" the water

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
    const geo = new THREE.ShapeGeometry(shape, 24); // higher curveSegments for more vertices
    // Displace vertices for subtle unevenness — breaks the flat plane look.
    // In ShapeGeometry XY plane, Z displacement becomes Y (up) after rotation.
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        // Fade out near the hole edge so the rim stays clean
        const dxH = v.x - HOLE_CENTER_X;
        const dyH = v.y - HOLE_CENTER_Z;
        const distToHole = Math.sqrt(dxH * dxH + dyH * dyH);
        const holeFade = Math.min(1, Math.max(0, (distToHole - HOLE_RADIUS) / 2));
        // Fade out near outer edges so walls connect cleanly
        const edgeDist = Math.min(
            Math.abs(v.x - (-size)), Math.abs(v.x - size),
            Math.abs(v.y - (-size)), Math.abs(v.y - size)
        );
        const edgeFade = Math.min(1, edgeDist / 3);
        const fade = holeFade * edgeFade;
        // More dramatic multi-octave noise for realistic unevenness
        const n = Math.sin(v.x * 0.8 + 2.3) * 0.5
                + Math.sin(v.y * 0.6 + 1.1) * 0.4
                + Math.cos(v.x * 1.2 + v.y * 0.9 + 4.5) * 0.3
                + Math.sin(v.x * 2.1 + v.y * 1.7 + 3.2) * 0.15
                + Math.cos(v.x * 3.5 + v.y * 2.8 + 1.8) * 0.08;
        positions.setZ(i, v.z + n * 0.4 * fade);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
})();

// ─── Geometries shared across the scene ────────────────────────────────
const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);
const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);  // kept for instanced pebbles

// Procedural underwater terrain — displaced PlaneGeometry
const UW_FLOOR_GEO = (() => {
    const geo = new THREE.PlaneGeometry(80, 80, 150, 150);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    // Seed-based hash for pseudo-random per-vertex noise
    const hash = (x: number, y: number) => {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
    };
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
        // Rich multi-octave terrain — MUCH more dramatic than before
        const n1 = Math.sin(v.x * 0.15 + 1.7) * 2.0
                  + Math.sin(v.y * 0.2 + 3.1) * 1.8
                  + Math.sin((v.x + v.y) * 0.1 + 0.8) * 2.5
                  + Math.cos(v.x * 0.35 - v.y * 0.25 + 5.3) * 1.2;
        const n2 = Math.sin(v.x * 0.7 + v.y * 0.55 + 2.2) * 0.8
                  + Math.sin(v.x * 1.4 + v.y * 1.1 + 2.2) * 0.4
                  + Math.cos(v.x * 2.1 - v.y * 1.8 + 4.7) * 0.2;
        const n3 = Math.sin(v.x * 3.2 + v.y * 2.8 + 1.3) * 0.12
                  + Math.cos(v.x * 5.5 + v.y * 4.2 - 0.8) * 0.06;
        // Rocky ridges — sharp features
        const ridge = Math.abs(Math.sin(v.x * 0.4 + 0.5)) * Math.abs(Math.cos(v.y * 0.3 + 2.1)) * 3.0;
        // Combine with edge fade and center dip
        const totalN = n1 + n2 + n3 + ridge;
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
const POOL_RIM: readonly Boulder[] = (() => {
    const r = HOLE_RADIUS + 0.8;
    const result: Boulder[] = [];
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const jitter = 0.85 + (Math.sin(i * 13.7) * 0.5 + 0.5) * 0.35;
        const x = HOLE_CENTER_X + Math.cos(a) * r * jitter;
        const z = HOLE_CENTER_Z + Math.sin(a) * r * jitter;
        const s = 0.7 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.7;
        const ry = a + Math.sin(i * 3.1) * 0.4;
        result.push([x, 0.35, z, s, ry] as const);
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
];

// ─── Crystals — colored emissive accents along the walls ─────────────
// Cluster of small octahedra at each spot; one big one + a few small ones.
// Adds soft directional pools of color you can see from across the cave.
// FIX: pointLight replaced by emissive sprites to avoid square lights on
// mobile. The glow is driven by additive-blend sprites (always round) +
// a dim pointLight for actual scene illumination (low intensity = no square).
type Crystal = readonly [number, number, number, string]; // x, y, z, hexColor
const CRYSTALS: readonly Crystal[] = [
    [-28,  2.2,   8, '#9ae6ff'],   // cyan, west wall
    [ 28,  3.5,  -5, '#c39bff'],   // purple, east wall
    [-10,  0.6,  28, '#ff9ad8'],   // pink, north wall
    [ 12,  0.8, -28, '#ffd066'],   // amber, south wall
    [-28,  4.5, -18, '#9affae'],   // green, west wall further
    [ 28,  1.5,  20, '#84d8ff'],   // light blue, east wall
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
                p.x = (Math.random() - 0.5) * 56;
                p.z = (Math.random() - 0.5) * 56;
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

// ─── Rock collision data (exported for Player.tsx) ───────────────────
export const CAVE_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...CAVE_ROCKS_DARK.map(([x,y,z,s]) => ({ x, y: y + s * 0.35, z, r: s * 0.7 })),
    ...CAVE_ROCKS_MID.map(([x,y,z,s]) => ({ x, y: y + s * 0.35, z, r: s * 0.5 })),
];
export const UW_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...UW_BOULDERS.map(([x,y,z,s]) => ({ x, y: y + s * 0.3, z, r: s * 0.6 })),
];

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

      void main() {
        // ─── Schlick Fresnel ──────────────────────────────────────
        float ndv = max(0.001, dot(vNormalWS, vViewWS));
        float R0 = 0.02;
        float fresnel = R0 + (1.0 - R0) * pow(1.0 - ndv, 5.0);
        fresnel = mix(fresnel, pow(1.0 - ndv, 2.4) * 0.9, 0.5);

        // ─── FIX #3: Opaque when viewed from BELOW ───────────────
        // dot(normal, viewDir) < 0 means we're looking up from underwater
        float viewFromBelow = step(dot(vNormalWS, vViewWS), 0.0);

        // ─── Deep / shallow / sky palette — HORROR DARK ──────────
        vec3 deep   = vec3(0.005, 0.02, 0.04);   // almost black-blue
        vec3 mid    = vec3(0.02, 0.08, 0.12);     // very dark teal
        vec3 sky    = vec3(0.15, 0.25, 0.30);     // muted gray-green

        // ─── Caustic streaks on the surface itself ──────────────
        float c1 = sin(vUv.x * 32.0 + time * 0.9) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 26.0 + time * 1.1 + 2.0) * 0.5 + 0.5;
        float caustic = pow(c1 * c2, 2.5);

        // ─── Wave-height tinting ─────────────────────────────────
        float h = clamp(vWave * 5.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);

        // ─── Subsurface scattering ──────────────────────────────
        float sss = pow(max(0.0, h), 1.5) * 0.3; // reduced from 0.6 for horror
        vec3 sssColor = vec3(0.05, 0.2, 0.15);   // much dimmer
        col += sssColor * sss;

        // ─── Fresnel reflection of sky ──────────────────────────
        col = mix(col, sky, fresnel * 0.6 + caustic * 0.1);

        // ─── Fake specular (sun highlight) — reduced ────────────
        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
        vec3 halfVec = normalize(vViewWS + lightDir);
        float spec = pow(max(0.0, dot(vNormalWS, halfVec)), 256.0);
        col += vec3(0.6, 0.55, 0.45) * spec * 0.8 * (1.0 - fresnel * 0.5);

        // ─── Foam on wave crests + edge foam ────────────────────
        float foam = smoothstep(0.04, 0.09, vWave);
        float distFromCenter = length(vWorldPos.xz - vec2(0.0, 5.0));
        float edgeFoam = smoothstep(2.8, 2.2, distFromCenter) * 0.4;
        float totalFoam = max(foam * 0.55, edgeFoam);
        col = mix(col, vec3(0.6, 0.7, 0.72), totalFoam); // gray foam, not bright white

        // ─── Alpha: opaque from below, semi-transparent from above ──
        float alpha = mix(0.82, 0.96, fresnel);
        // FIX #3: When viewed from below, water ceiling is fully opaque
        if (viewFromBelow > 0.5) {
            alpha = 1.0;
            col = vec3(0.01, 0.03, 0.05); // dark murky ceiling
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
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
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

// ─── DynamicFog — depth-based color absorption (Beer-Lambert style) ───
const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    // Pre-allocated depth-based fog colors
    const _surfaceFog = new THREE.Color('#040e12');  // dark teal near surface
    const _midFog = new THREE.Color('#020810');      // deep blue mid-depth
    const _deepFog = new THREE.Color('#010406');     // near-black at bottom
    const _caveFog = new THREE.Color('#0e0a08');     // warm dark cave
    const _surfaceBg = new THREE.Color('#040e12');
    const _midBg = new THREE.Color('#020810');
    const _deepBg = new THREE.Color('#010406');
    const _caveBg = new THREE.Color('#0e0a08');

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;

        if (y >= SWIM_THRESHOLD_Y) {
            // Cave mode
            _tgtFog.current.copy(_caveFog);
            _tgtBg.current.copy(_caveBg);
            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (14 - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (55 - scene.fog.far) * k;
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
            // Tighter fog as you go deeper
            const baseNear = 0.5 - t * 0.4; // 0.5 at surface, 0.1 at bottom
            const baseFar = 8 - t * 4;       // 8 at surface, 4 at bottom
            const tgtNear = Math.max(0.1, baseNear + breathe * 0.05);
            const tgtFar = Math.max(3, baseFar + breathe * 0.3);

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
        vec2 uv = vUv * 8.0;
        float a = sin(uv.x * 6.28 + time * 0.6) + sin((uv.x + uv.y) * 5.0 + time * 0.9);
        float b = sin(uv.y * 6.28 + time * 0.5 + 1.2) + sin((uv.y - uv.x) * 4.5 + time * 0.7);
        float c = pow(max(0.0, sin(a) * sin(b)), 2.5);
        // Brighter caustics — can still be horror but need to be VISIBLE
        vec3 col = vec3(c * 0.08, c * 0.18, c * 0.14);  // more green-blue, brighter
        gl_FragColor = vec4(col, c * 0.2);  // was 0.12, now 0.2
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

// ─── Subnautica-style god ray shafts — brighter for visibility ────────
const GodRayShafts: React.FC = () => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.04;
    });
    const SHAFT_COUNT = 8;
    return (
        <group ref={groupRef} position={[HOLE_CENTER_X, -15, HOLE_CENTER_Z]}>
            {Array.from({ length: SHAFT_COUNT }, (_, i) => {
                const a = (i / SHAFT_COUNT) * Math.PI * 2;
                const r = 0.5 + (i % 2) * 1.0;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
                        rotation={[0, a, 0]}
                    >
                        <planeGeometry args={[1.6 + (i % 3) * 0.4, 28]} />
                        <meshBasicMaterial
                            color="#0c3020"
                            transparent
                            opacity={0.06 + (i % 3) * 0.02}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            toneMapped={false}
                        />
                    </mesh>
                );
            })}
        </group>
    );
};

// ─── Deep Mist — slowly drifting fog plane underwater ────────────────
const DeepMist: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        const t = state.clock.elapsedTime;
        // Slow pulse — mist breathes
        m.opacity = 0.04 + Math.sin(t * 0.2) * 0.015;
    });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshBasicMaterial
                ref={matRef}
                color="#040808"
                transparent
                opacity={0.04}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                toneMapped={false}
            />
        </mesh>
    );
};

// ─── Debris particles — tiny dark specs drifting underwater ──────────
const DEBRIS_COUNT = 60;
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
    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < PLANKTON_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            const seed = i * 7.31;
            r.position.x += Math.sin(t * 0.15 + seed) * 0.003;
            r.position.y += Math.cos(t * 0.12 + seed * 1.3) * 0.002;
            r.position.z += Math.sin(t * 0.13 + seed * 0.7) * 0.003;
        }
    });
    return (
        <Instances limit={PLANKTON_COUNT} range={PLANKTON_COUNT} geometry={PLANKTON_GEO}>
            {/* Darkened plankton for horror */}
            <meshBasicMaterial color="#1a1808" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
            {Array.from({ length: PLANKTON_COUNT }, (_, i) => {
                const x = HOLE_CENTER_X + (Math.random() - 0.5) * 30;
                const y = -3 + Math.random() * -25;
                const z = HOLE_CENTER_Z + (Math.random() - 0.5) * 30;
                return (
                    <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} position={[x, y, z]} scale={0.012 + Math.random() * 0.02} />
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
                p.x = HOLE_CENTER_X + (Math.random() - 0.5) * BUBBLE_RANGE * 2;
                p.z = HOLE_CENTER_Z + (Math.random() - 0.5) * BUBBLE_RANGE * 2;
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

// ─── Full level ────────────────────────────────────────────────────────
interface Floor2EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onCollectShard: (i: number) => void;
    reflective?: boolean;
    quality?: Quality;
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    reflective = false,
    quality = 'high',
}) => {
    // Quality-based feature flags
    const isLow = quality === 'low';
    const isMed = quality === 'medium';
    const isHigh = quality === 'high';
    // Low: minimal — no caustics, no god rays, no fish, no kelp, no coral, no dust, no deep mist, fewer bubbles
    // Medium: most features — caustics, kelp, coral, bubbles, fish, dust; no god rays, no MeshReflector, no deep mist, fewer plankton
    // High: everything + MeshReflectorMaterial + god rays + deep mist + more particles
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
        16, 16
    );
    const uwRock = usePBRSet(
        uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
        1, 1
    );

    // ─── Load rock GLB models ──────────────────────────────────────
    const rockModels = ROCK_MODEL_URLS.map(u => useGLTF(u));
    const boulderModel_ = useGLTF(BOULDER_MODEL_URL);

    const rockScenes = useMemo(() => rockModels.map(m => m.scene.clone(true)), [rockModels]);
    const boulderScene = useMemo(() => boulderModel_.scene.clone(true), [boulderModel_]);

    return (
    <group>
        <color attach="background" args={['#0e0a08']} />
        <fog attach="fog" args={['#0e0a08', 14, 55]} />

        {/* Horror lighting — intensity scales with quality */}
        <ambientLight intensity={isLow ? 0.15 : 0.25} color="#d8c0a0" />
        <hemisphereLight intensity={isLow ? 0.12 : 0.20} color="#c8a888" groundColor="#1a1612" />
        <directionalLight position={[5, 20, 5]} intensity={isLow ? 0.12 : 0.20} color="#ffe8c0" />

        {/* Ember sprites — warm glow on floor, NO pointLight (square artifact) */}
        <sprite position={[-25, 0.8, 0]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.2} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[25, 0.8, -5]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.2} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[0, 0.8, 25]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.15} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>

        <DynamicFog playerPositionRef={playerPositionRef} />

        {/* ─── CAVE FLOOR with hole ─── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
        >
            <meshStandardMaterial
                color="#1a1610"
                map={caveFloor.color}
                normalMap={caveFloor.normal}
                normalScale={new THREE.Vector2(4.0, 4.0)}
                roughnessMap={caveFloor.rough}
                roughness={0.92}
                aoMap={caveFloor.ao}
                aoMapIntensity={1.0}
            />
        </mesh>

        {/* Cave ceiling */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#2a221c" roughness={1} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — real PBR textures */}
        {/* North (z = -30) */}
        <mesh position={[ -8, 2.5, -29.6]}><boxGeometry args={[24, 5, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 10, 3.2, -29.4]}><boxGeometry args={[18, 6.4, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ -2, 6.0, -29.8]}><boxGeometry args={[60, 4, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* South (z = 30) */}
        <mesh position={[  6, 2.4,  29.6]}><boxGeometry args={[26, 4.8, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-12, 3.5,  29.4]}><boxGeometry args={[20, 7, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[  4, 6.2,  29.8]}><boxGeometry args={[60, 3.6, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* West (x = -30) */}
        <mesh position={[-29.6, 2.6,   0]}><boxGeometry args={[1.0, 5.2, 28]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-29.4, 3.4, -12]}><boxGeometry args={[1.2, 6.8, 18]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-29.8, 6.2,   3]}><boxGeometry args={[0.6, 3.6, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* East (x = 30) */}
        <mesh position={[ 29.6, 2.5,   8]}><boxGeometry args={[1.0, 5, 22]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 29.4, 3.6, -10]}><boxGeometry args={[1.2, 7.2, 20]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 29.8, 6.0,  -2]}><boxGeometry args={[0.6, 4, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>

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

        {/* Stalagmites — cones rising from the floor */}
        {STALAGMITES.map(([x, z, h, r], i) => (
            <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]}>
                <coneGeometry args={[r, h, 6]} />
                <meshStandardMaterial color="#3a3024" roughness={1} flatShading />
            </mesh>
        ))}

        {/* Stalactites — inverted cones from the ceiling */}
        {STALACTITES.map(([x, z, h, r], i) => (
            <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[r, h, 6]} />
                <meshStandardMaterial color="#322a1f" roughness={1} flatShading />
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

        {/* Floating dust motes catching the warm light — medium+ only */}
        {!isLow && <DustMotes />}

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* Opaque water column — blocks X-ray from below.
            FrontSide renders the inner face visible when looking UP from underwater.
            Extends 8 units below surface to cover most viewing angles. */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 5, HOLE_CENTER_Z]}>
            <cylinderGeometry args={[HOLE_RADIUS + 0.15, HOLE_RADIUS + 0.15, 10, 32, 1, true]} />
            <meshBasicMaterial color="#010508" side={THREE.FrontSide} depthWrite={true} transparent={false} />
        </mesh>
        {/* Opaque disc at water surface — primary X-ray blocker from below */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.05, HOLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[HOLE_RADIUS + 0.15, 32]} />
            <meshBasicMaterial color="#010508" side={THREE.FrontSide} depthWrite={true} transparent={false} />
        </mesh>

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
            <meshStandardMaterial
                color="#060804"
                map={uwFloor.color}
                normalMap={uwFloor.normal}
                normalScale={new THREE.Vector2(6.0, 6.0)}
                roughnessMap={uwFloor.rough}
                roughness={0.95}
                aoMap={uwFloor.ao}
                aoMapIntensity={1.2}
            />
        </mesh>

        {/* RGB caustics on the seafloor — medium+ only */}
        {!isLow && <UnderwaterCaustics />}

        {/* Underwater flora — kelp & coral — medium+ only */}
        {!isLow && <UnderwaterFlora />}

        {/* God ray shafts descending from the surface — high only */}
        {isHigh && <GodRayShafts />}

        {/* Deep Mist — drifting fog plane — high only */}
        {isHigh && <DeepMist />}

        {/* Debris particles — tiny specs drifting — medium+ only */}
        {!isLow && <DebrisField />}

        {/* Small fish school looping around the boulder field — medium+ only */}
        {!isLow && <FishSchool />}

        {/* Underwater boulders — darkened */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Underwater pebbles — darkened */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        <BubbleField />
        {/* Plankton — reduced in medium, full in high */}
        {!isLow && <PlanktonField />}

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
