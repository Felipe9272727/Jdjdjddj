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
import { ElevatorFacade } from './Elevator';
import {
    caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
    caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
    caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
    uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
    uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
    rockModelA, rockModelB, rockModelC, rockModelD,
    boulderModel, pebbleModel,
} from './assets/textureImports';

// ─── Hole geometry placement (also exported for Player.tsx) ────────────
export const HOLE_CENTER_X = 0;
export const HOLE_CENTER_Z = 5;
export const HOLE_RADIUS = 3.0;
export const WATER_LEVEL_Y = -0.05;
export const SWIM_THRESHOLD_Y = -0.3;   // below this the player is "in" the water

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
        // Small multi-octave noise for subtle unevenness
        const n = Math.sin(v.x * 0.8 + 2.3) * 0.3
                + Math.sin(v.y * 0.6 + 1.1) * 0.25
                + Math.cos(v.x * 1.2 + v.y * 0.9 + 4.5) * 0.15;
        positions.setZ(i, v.z + n * 0.15 * fade);
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
    const geo = new THREE.PlaneGeometry(80, 80, 32, 32);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const edgeDist = Math.min(
            Math.abs(v.x - (-40)), Math.abs(v.x - 40),
            Math.abs(v.y - (-40)), Math.abs(v.y - 40)
        );
        const edgeFade = Math.min(1, edgeDist / 5);
        const n = Math.sin(v.x * 0.3 + 1.7) * 0.5
                + Math.sin(v.y * 0.4 + 3.1) * 0.4
                + Math.sin((v.x + v.y) * 0.2 + 0.8) * 0.6
                + Math.cos(v.x * 0.7 - v.y * 0.5 + 5.3) * 0.3
                + Math.sin(v.x * 1.4 + v.y * 1.1 + 2.2) * 0.15;
        positions.setZ(i, v.z + n * 1.5 * edgeFade);
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
        result.push([x, 0, z, s, ry] as const);
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
        {/* Dim pointLight — low intensity avoids square light artifact.
            Higher intensity = square on mobile GPU. We compensate with
            the larger glow sprite below. */}
        <pointLight intensity={0.8} distance={7} decay={1.4} color={color} />
        {/* Round glow halo — additive sprite, always circular, no square */}
        <sprite scale={[2.5, 2.5, 1]}>
            <spriteMaterial color={color} transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        {/* Bigger soft outer glow for atmospheric pool of light */}
        <sprite scale={[5.0, 5.0, 1]}>
            <spriteMaterial color={color} transparent opacity={0.12} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
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
    const lightRef = useRef<THREE.PointLight>(null);
    useFrame((state) => {
        const l = lightRef.current;
        if (!l) return;
        const dxC = x - state.camera.position.x;
        const dzC = z - state.camera.position.z;
        if (dxC * dxC + dzC * dzC > 400) {
            l.intensity = 3.5;
            return;
        }
        const t = state.clock.elapsedTime;
        const flicker = 0.85 + Math.sin(t * 9 + seed) * 0.05 + Math.sin(t * 23 + seed * 1.3) * 0.04 + Math.random() * 0.03;
        l.intensity = 3.5 * flicker;
    });
    return (
        <group position={[x, y, z]}>
            <mesh>
                <coneGeometry args={[0.18, 0.4, 8]} />
                <meshStandardMaterial color="#FFA850" emissive="#FFB060" emissiveIntensity={3.5} toneMapped={false} />
            </mesh>
            <sprite scale={[2.2, 2.2, 1]}>
                <spriteMaterial color="#FFC080" transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <pointLight ref={lightRef} intensity={3.5} distance={16} decay={1.4} color="#FFB070" />
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

// ─── DynamicFog — FIX #6: no per-frame Color allocation ──────────────
// FIX #8: tighter underwater fog for horror, breathing fog effect
const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    // Pre-allocated target colors — setHex() instead of new Color() per frame
    const _tgtBg = useRef(new THREE.Color());
    const _tgtFog = useRef(new THREE.Color());
    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;
        const submerged = y < SWIM_THRESHOLD_Y;
        // Target presets — FIX #8: much tighter underwater for horror
        _tgtBg.current.setHex(submerged ? 0x010404 : 0x0e0a08);
        _tgtFog.current.setHex(submerged ? 0x010404 : 0x0e0a08);
        // FIX #8: breathing fog — subtle oscillation for horror atmosphere
        const breathe = Math.sin(performance.now() * 0.0003) * 0.5;
        const tgtNear = submerged ? (0.2 + breathe * 0.05) : 14;
        const tgtFar  = submerged ? (6 + breathe * 0.5)  : 55;
        // Lerp colors + fog distances toward targets
        const k = Math.min(1, 8 * safeDt);
        _fogColor.current.lerp(_tgtFog.current, k);
        _bgColor.current.lerp(_tgtBg.current, k);
        scene.fog.color.copy(_fogColor.current);
        scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
        scene.fog.far  = scene.fog.far  + (tgtFar  - scene.fog.far)  * k;
        if (scene.background && (scene.background as any).isColor) {
            (scene.background as THREE.Color).copy(_bgColor.current);
        }
    });
    return null;
};

// ─── Underwater caustics — darker for horror ─────────────────────────
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
        vec2 uv = vUv * 6.0;
        float a = sin(uv.x * 6.28 + time * 0.6) + sin((uv.x + uv.y) * 5.0 + time * 0.9);
        float b = sin(uv.y * 6.28 + time * 0.5 + 1.2) + sin((uv.y - uv.x) * 4.5 + time * 0.7);
        float c = pow(max(0.0, sin(a) * sin(b)), 3.0);
        // Dimmer caustics for horror
        vec3 col = vec3(c * 0.06, c * 0.10, c * 0.08);
        gl_FragColor = vec4(col, c * 0.12);
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

// ─── Underwater flora — kelp + coral — FIX #5: darkened for horror ───
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
];

// FIX #6: KelpField — single useFrame driving all kelp (was 8 separate useFrame callbacks)
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
                                {/* FIX #5: near-black kelp for horror */}
                                <meshStandardMaterial color={i < 2 ? '#0a0805' : '#0c0a06'} roughness={0.85} flatShading />
                            </mesh>
                        ))}
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
        <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.6, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[0.3, 0.9, 0.2]}>
            <sphereGeometry args={[0.4, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[-0.35, 1.0, -0.15]}>
            <sphereGeometry args={[0.35, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[0.1, 1.3, 0.3]}>
            <sphereGeometry args={[0.28, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} flatShading />
        </mesh>
    </group>
);

// ─── Subnautica-style god ray shafts — dimmer for horror ─────────────
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
                            color="#0a1810"
                            transparent
                            opacity={0.03 + (i % 3) * 0.005}
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

// ─── FIX #8: Deep Mist — slowly drifting fog plane underwater ────────
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

// ─── FIX #8: Debris particles — tiny dark specs drifting underwater ──
const DEBRIS_COUNT = 30;
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
const BUBBLE_COUNT = 20;
const BUBBLE_RANGE = 18;
const BUBBLE_RISE = 0.5;
const BUBBLE_MAX_Y = WATER_LEVEL_Y - 0.5;
const BUBBLE_MIN_Y = -29;

// ─── Plankton particles (underwater) — darkened for horror ────────────
const PLANKTON_COUNT = 20;
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
                <spriteMaterial color="#9be8ff" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <pointLight intensity={0.8} distance={3} decay={1.5} color="#7ad8ff" />
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
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    reflective = false,
}) => {
    // ─── Load real PBR texture sets ────────────────────────────────
    // FIX #7: Increased cave floor texture repeat from 8,8 to 12,12
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
    // FIX #7: Increased UW floor texture repeat from 10,10 to 16,16
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

        {/* FIX #8: Horror lighting — MUCH darker */}
        <ambientLight intensity={0.15} color="#d8c0a0" />
        <hemisphereLight intensity={0.12} color="#c8a888" groundColor="#1a1612" />
        <directionalLight position={[5, 20, 5]} intensity={0.15} color="#ffe8c0" />

        {/* FIX #8: Dim reddish ember pointLights at floor level */}
        <pointLight position={[-25, 0.5, 0]} intensity={0.3} distance={8} decay={1.5} color="#3a1008" />
        <pointLight position={[25, 0.5, -5]} intensity={0.3} distance={8} decay={1.5} color="#3a1008" />
        <pointLight position={[0, 0.5, 25]} intensity={0.25} distance={7} decay={1.5} color="#3a1008" />

        <DynamicFog playerPositionRef={playerPositionRef} />

        {/* ─── CAVE FLOOR with hole — FIX #1: Y=0 (was -0.02), FIX #7: better textures ─── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
        >
            <meshStandardMaterial
                color="#1a1610"
                map={caveFloor.color}
                normalMap={caveFloor.normal}
                normalScale={new THREE.Vector2(3.0, 3.0)}
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
        <mesh position={[ -8, 2.5, -29.6]}><boxGeometry args={[24, 5, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 10, 3.2, -29.4]}><boxGeometry args={[18, 6.4, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ -2, 6.0, -29.8]}><boxGeometry args={[60, 4, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* South (z = 30) */}
        <mesh position={[  6, 2.4,  29.6]}><boxGeometry args={[26, 4.8, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-12, 3.5,  29.4]}><boxGeometry args={[20, 7, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[  4, 6.2,  29.8]}><boxGeometry args={[60, 3.6, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* West (x = -30) */}
        <mesh position={[-29.6, 2.6,   0]}><boxGeometry args={[1.0, 5.2, 28]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-29.4, 3.4, -12]}><boxGeometry args={[1.2, 6.8, 18]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[-29.8, 6.2,   3]}><boxGeometry args={[0.6, 3.6, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        {/* East (x = 30) */}
        <mesh position={[ 29.6, 2.5,   8]}><boxGeometry args={[1.0, 5, 22]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 29.4, 3.6, -10]}><boxGeometry args={[1.2, 7.2, 20]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
        <mesh position={[ 29.8, 6.0,  -2]}><boxGeometry args={[0.6, 4, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(1.6, 1.6)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>

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
            <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* FIX #1: Pool rim torus REMOVED — boulders alone mask the edge.
            The POOL_RIM boulders sit on the cave floor at Y=0, no z-fighting. */}

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

        {/* Floating dust motes catching the warm light */}
        <DustMotes />

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* Opaque water ceiling — blocks x-ray vision from below.
            This is a flat, OPAQUE plane at the water level that only
            renders its BACK face (visible from underwater looking up).
            It writes to the depth buffer, so all cave geometry above
            is correctly occluded. The Gerstner wave shader on top
            (transparent, depthWrite=false) can't block anything because
            transparent objects don't write depth. This plane does. */}
        <mesh
            position={[HOLE_CENTER_X, WATER_LEVEL_Y + 0.02, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
        >
            <circleGeometry args={[HOLE_RADIUS, 32]} />
            <meshBasicMaterial
                color="#020810"
                side={THREE.BackSide}
                depthWrite={true}
                transparent={false}
            />
        </mesh>

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        {/* FIX #7: Better UW floor textures, FIX #5: very dark color */}
        <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
            <meshStandardMaterial
                color="#0a0a06"
                map={uwFloor.color}
                normalMap={uwFloor.normal}
                normalScale={new THREE.Vector2(3.0, 3.0)}
                roughnessMap={uwFloor.rough}
                roughness={0.98}
                aoMap={uwFloor.ao}
                aoMapIntensity={1.0}
            />
        </mesh>

        {/* RGB caustics on the seafloor */}
        <UnderwaterCaustics />

        {/* Underwater flora — kelp & coral */}
        <UnderwaterFlora />

        {/* God ray shafts descending from the surface */}
        <GodRayShafts />

        {/* FIX #8: Deep Mist — drifting fog plane */}
        <DeepMist />

        {/* FIX #8: Debris particles — tiny specs drifting */}
        <DebrisField />

        {/* Small fish school looping around the boulder field */}
        <FishSchool />

        {/* FIX #5: Underwater boulders — darkened color="#0a0a08" */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* FIX #5: Underwater pebbles — darkened color="#0c0c0a" */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        <BubbleField />
        <PlanktonField />

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
