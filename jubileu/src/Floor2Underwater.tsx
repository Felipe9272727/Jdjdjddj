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
 */

import React, { useMemo, useRef, useEffect, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, shaderMaterial, MeshReflectorMaterial, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

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
// Rock geometries are now loaded from GLB files (see ROCK_MODEL_PATHS).
// These were generated from ambientcg.com displacement maps using
// Python/trimesh, giving photogrammetry-based rock shapes instead of
// procedural icosahedra.
const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);
const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);  // kept for instanced pebbles

// Procedural underwater terrain — displaced PlaneGeometry
// Starts as a flat 80×80 grid (64×64 subdivisions) and displaces vertices
// with layered sine noise for gentle rolling terrain. Edges fade flat so
// the floor connects seamlessly with the underwater walls.
const UW_FLOOR_GEO = (() => {
    const geo = new THREE.PlaneGeometry(80, 80, 64, 64);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        // Only displace the interior — fade out near edges for seamless wall joins
        const edgeDist = Math.min(
            Math.abs(v.x - (-40)), Math.abs(v.x - 40),
            Math.abs(v.y - (-40)), Math.abs(v.y - 40)
        );
        const edgeFade = Math.min(1, edgeDist / 5);
        // Multi-octave sine noise for natural rolling terrain
        const n = Math.sin(v.x * 0.3 + 1.7) * 0.5
                + Math.sin(v.y * 0.4 + 3.1) * 0.4
                + Math.sin((v.x + v.y) * 0.2 + 0.8) * 0.6
                + Math.cos(v.x * 0.7 - v.y * 0.5 + 5.3) * 0.3
                + Math.sin(v.x * 1.4 + v.y * 1.1 + 2.2) * 0.15;
        // Apply as Z displacement (PlaneGeometry is XY, rotated to XZ later)
        // Z in local space = Y (up) after rotation
        positions.setZ(i, v.z + n * 1.5 * edgeFade);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
})();

// ─── REAL PBR Textures from ambientcg.com (CC0) ───────────────────
// Replaced procedural canvas-generated textures with photogrammetry-
// scanned PBR texture sets from ambientcg.com (Public Domain license).
// Each set includes: Color (albedo), NormalGL, Roughness, AO.
// Textures are loaded via drei's useTexture hook at runtime.
//
// Sources:
//   Cave floor/walls: Rock064, Rock035, Rock020 (ambientcg.com)
//   Underwater floor: Ground037 (ambientcg.com)
//   Underwater rocks: Rock058 (ambientcg.com)

// ─── Texture loading helper ────────────────────────────────────────
// useTexture returns THREE.Texture[]. We configure repeat wrapping
// and colorSpace per-map type (albedo=sRGB, normal/rough/AO=linear).
function usePBRSet(colorPath: string, normalPath: string, roughPath: string, aoPath: string, repeatX: number, repeatY: number) {
    const [color, normal, rough, ao] = useTexture([colorPath, normalPath, roughPath, aoPath]);
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
// Rock geometry generated from ambientcg displacement maps via
// Python/trimesh. Each rock has ~642 verts, ~1280 faces — detailed
// enough for close-up viewing but cheap enough for instancing.
// Loaded via drei's useGLTF at runtime.
const ROCK_MODEL_PATHS = [
    '/models/rocks/rock_a.glb',
    '/models/rocks/rock_b.glb',
    '/models/rocks/rock_c.glb',
    '/models/rocks/rock_d.glb',
];
const BOULDER_MODEL_PATH = '/models/rocks/boulder.glb';
const PEBBLE_MODEL_PATH = '/models/rocks/pebble.glb';

// ─── Real-PBR Rock Component ─────────────────────────────────────────
// Loads a GLB rock model and applies real PBR textures from ambientcg.
// This replaces the old procedural icosahedron rocks with photogrammetry-
// scanned geometry and textures.
const RealRock: React.FC<{
    modelPath: string;
    colorPath: string;
    normalPath: string;
    roughPath: string;
    aoPath: string;
    position: [number, number, number];
    scale?: [number, number, number];
    rotation?: [number, number, number];
    repeatX?: number;
    repeatY?: number;
}> = ({ modelPath, colorPath, normalPath, roughPath, aoPath, position, scale = [1,1,1], rotation = [0,0,0], repeatX = 1, repeatY = 1 }) => {
    const { scene } = useGLTF(modelPath);
    const pbr = usePBRSet(colorPath, normalPath, roughPath, aoPath, repeatX, repeatY);
    const cloned = useMemo(() => scene.clone(true), [scene]);
    return (
        <group position={position} rotation={rotation} scale={scale}>
            <primitive object={cloned}>
                <meshStandardMaterial
                    map={pbr.color}
                    normalMap={pbr.normal}
                    normalScale={new THREE.Vector2(2.0, 2.0)}
                    roughnessMap={pbr.rough}
                    roughness={0.9}
                    aoMap={pbr.ao}
                    aoMapIntensity={0.6}
                />
            </primitive>
        </group>
    );
};

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

// "Light" group — scattered small bright stones, near crystal lights
const CAVE_ROCKS_LIGHT: readonly Boulder[] = [
    [-26,  0,   6, 0.7, 0.3],
    [ 26,  0,  -4, 0.6, 1.2],
    [ -8,  0,  26, 0.7, 0.6],
    [ 10,  0, -26, 0.8, 1.9],
    [-26,  0, -18, 0.7, 0.4],
    [ 26,  0,  20, 0.6, 1.5],
] as const;

// ─── Pool rim — large boulders forming the edge of the water pit ──────
// Arranged in a circle around HOLE_CENTER at radius HOLE_RADIUS + 0.8.
// 14 stones at decreasing-then-increasing scale so the rim feels organic,
// not stamped. Heights vary so the silhouette isn't flat.
const POOL_RIM: readonly Boulder[] = (() => {
    const r = HOLE_RADIUS + 0.8;
    const result: Boulder[] = [];
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const jitter = 0.85 + (Math.sin(i * 13.7) * 0.5 + 0.5) * 0.35;
        const x = HOLE_CENTER_X + Math.cos(a) * r * jitter;
        const z = HOLE_CENTER_Z + Math.sin(a) * r * jitter;
        const s = 0.7 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.7; // 0.7-1.4
        const ry = a + Math.sin(i * 3.1) * 0.4;
        // Boulder centers at ground level — base at Y=0
        result.push([x, 0, z, s, ry] as const);
    }
    return result;
})();

// ─── Stalagmites (cones from the floor up) ─────────────────────────────
// Hand-placed so they don't block the elevator path or the hole.
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
// Stalactites (cones from the ceiling down)
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
        {/* Strong pool of colored light — distance bumped from 5 → 9 so
            each crystal actually illuminates a real area, not just itself. */}
        <pointLight intensity={2.4} distance={9} decay={1.4} color={color} />
        {/* Halo sprite for camera glow */}
        <sprite scale={[1.8, 1.8, 1]}>
            <spriteMaterial color={color} transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
    </group>
);

// ─── Central torches — warm wall-mounted flames around the cave ───────
// Positioned high on the walls. Provide warm fill-light that lifts the
// whole space out of pitch black. Each is a small emissive cone + a
// pulsing pointLight so the cave "breathes" visually.
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
        // Distance cull: torches > 20m from the camera don't visibly flicker,
        // skip the math. Saves on cave-wide useFrame churn (6 torches × 60Hz).
        const dxC = x - state.camera.position.x;
        const dzC = z - state.camera.position.z;
        if (dxC * dxC + dzC * dzC > 400) {
            l.intensity = 3.5;   // hold steady at base
            return;
        }
        // Subtle flame flicker — combination of fast random and slow drift.
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
// 25 motes (was 40). Past a count threshold the additive blending dominates
// the cave's color budget; 25 reads as "atmospheric" without washing out.
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
        const safeDt = Math.min(dt, 0.05);
        const t = state.clock.elapsedTime;
        const pos = positions.current;
        for (let i = 0; i < DUST_COUNT; i++) {
            const p = pos[i];
            // Gentle Brownian drift + small sine wobble
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

// ─── Water shader — Gerstner waves + SSS + Fresnel + foam ───────────
// Unreal-quality water: Gerstner waves produce realistic choppiness with
// proper horizontal displacement (not just vertical sine). The fragment
// shader computes Schlick Fresnel, subsurface scattering through thin
// wave peaks, fake refraction via screen-space offset, and foam on crests.
const WaterMaterial = shaderMaterial(
    { time: 0, opacity: 0.85 },
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewWS;
      varying vec3 vNormalWS;
      varying vec3 vWorldPos;

      // Gerstner wave: returns displacement (x,y,z) and derivatives (dx, dz)
      // Based on GPU Gems chapter + Jerry Tessendorf's formulation.
      vec4 gerstner(vec2 pos, vec2 dir, float steepness, float wavelength, float t) {
        float k = 6.28318 / max(wavelength, 0.01);
        float c = sqrt(9.8 / max(k, 0.001));
        float a = steepness / max(k, 0.001);
        float f = k * (dot(dir, pos) - c * t);
        float sinF = sin(f);
        float cosF = cos(f);
        return vec4(
          -dir.x * a * cosF,  // x displacement
          a * sinF,            // y displacement (vertical)
          -dir.y * a * cosF,  // z displacement
          0.0
        );
      }

      void main() {
        vUv = uv;
        vec3 p = position;

        // 4 Gerstner wave octaves with different directions & wavelengths.
        // Steepness < 1.0 prevents wave folding. Shorter waves = less
        // amplitude (natural spectral decay).
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

        // Analytical normal from Gerstner partial derivatives.
        // dP/dx and dP/dz are computed from the wave functions.
        float k1 = 6.28318 / 4.0;  float c1 = sqrt(9.8 / k1);  float a1 = 0.22 / k1;
        float k2 = 6.28318 / 2.8;  float c2 = sqrt(9.8 / k2);  float a2 = 0.18 / k2;
        float k3 = 6.28318 / 1.8;  float c3 = sqrt(9.8 / k3);  float a3 = 0.12 / k3;
        float k4 = 6.28318 / 1.2;  float c4 = sqrt(9.8 / k4);  float a4 = 0.07 / k4;

        float f1 = k1 * (dot(d1, position.xz) - c1 * time * 0.8);
        float f2 = k2 * (dot(d2, position.xz) - c2 * time * 0.95 - 1.7 * c2);
        float f3 = k3 * (dot(d3, position.xz) - c3 * time * 1.15 - 3.2 * c3);
        float f4 = k4 * (dot(d4, position.xz) - c4 * time * 1.4 - 5.0 * c4);

        // dP/dx
        vec3 dPdx = vec3(
          1.0 - (d1.x * d1.x * a1 * k1 * sin(f1) + d2.x * d2.x * a2 * k2 * sin(f2)
               + d3.x * d3.x * a3 * k3 * sin(f3) + d4.x * d4.x * a4 * k4 * sin(f4)),
          d1.x * a1 * k1 * cos(f1) + d2.x * a2 * k2 * cos(f2) + d3.x * a3 * k3 * cos(f3) + d4.x * a4 * k4 * cos(f4),
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4))
        );
        // dP/dz (mapped from local y since plane is rotated)
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
        // F0 = 0.02 for water (dielectric). At grazing angles,
        // reflectance approaches 100% — that's the "mirror edge" look.
        float ndv = max(0.001, dot(vNormalWS, vViewWS));
        float R0 = 0.02;
        float fresnel = R0 + (1.0 - R0) * pow(1.0 - ndv, 5.0);
        // Boost for visual punch (physically ~1.0 at grazing, we push)
        fresnel = mix(fresnel, pow(1.0 - ndv, 2.4) * 0.9, 0.5);

        // ─── Deep / shallow / sky palette ────────────────────────
        vec3 deep   = vec3(0.01, 0.08, 0.14);
        vec3 mid    = vec3(0.06, 0.28, 0.38);
        vec3 sky    = vec3(0.55, 0.82, 0.94);

        // ─── Caustic streaks on the surface itself ──────────────
        float c1 = sin(vUv.x * 32.0 + time * 0.9) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 26.0 + time * 1.1 + 2.0) * 0.5 + 0.5;
        float caustic = pow(c1 * c2, 2.5);

        // ─── Wave-height tinting ─────────────────────────────────
        float h = clamp(vWave * 5.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);

        // ─── Subsurface scattering ──────────────────────────────
        // Light transmitted through thin wave peaks glows cyan-green.
        // The thinner the wave (higher wave peak = more transmittance),
        // the stronger the SSS. This is THE Unreal water look.
        float sss = pow(max(0.0, h), 1.5) * 0.6;
        vec3 sssColor = vec3(0.1, 0.55, 0.45);
        col += sssColor * sss;

        // ─── Fresnel reflection of sky ──────────────────────────
        col = mix(col, sky, fresnel * 0.8 + caustic * 0.15);

        // ─── Fake specular (sun highlight) ──────────────────────
        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
        vec3 halfVec = normalize(vViewWS + lightDir);
        float spec = pow(max(0.0, dot(vNormalWS, halfVec)), 256.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 1.5 * (1.0 - fresnel * 0.5);

        // ─── Foam on wave crests + edge foam ────────────────────
        float foam = smoothstep(0.04, 0.09, vWave);
        // Edge foam near pool rim (distance from center)
        float distFromCenter = length(vWorldPos.xz - vec2(0.0, 5.0));
        float edgeFoam = smoothstep(2.8, 2.2, distFromCenter) * 0.4;
        float totalFoam = max(foam * 0.55, edgeFoam);
        col = mix(col, vec3(0.92, 0.96, 1.0), totalFoam);

        // ─── Alpha: visible from all angles ──────────────────────
        float alpha = mix(0.82, 0.96, fresnel);
        gl_FragColor = vec4(col, alpha);
      }
    `
);
// Use primitive attach="material" — avoids JSX intrinsic typing churn.
// Falls back to the custom WaterMaterial when reflections aren't desired
// (low/medium quality, or if MeshReflectorMaterial is too heavy on the
// device). In `realistic` mode it stacks both: an opaque-ish reflector
// underneath, and the wave-shader on top with reduced opacity, so the
// reflection shows THROUGH the chop.
interface WaterSurfaceProps {
    /** When true, render a second mesh underneath with MeshReflectorMaterial
     *  (real screen-space reflection). When false, just the wave shader. */
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
        // In reflective mode, lower the opacity so the reflector layer
        // beneath actually shows through. The wave shader provides the
        // chop and color tint; the reflector provides the real reflection.
        if (reflective) (mat as any).opacity = 0.45;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            {/* Reflector layer (high quality only). Renders the scene
                mirrored at this plane → real reflection of cave + torches
                + crystals in the water. Cost: 1 extra render pass per
                frame at 1024x1024 — fine for desktop high, skipped on
                mobile/low. */}
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
                        color="#1a3a4a"
                        metalness={0.4}
                        mirror={0.65}
                    />
                </mesh>
            )}
            {/* Wave/caustic shader on top — 64x64 verts for Gerstner detail */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 64, 64]} />
                <primitive object={mat} attach="material" />
            </mesh>
        </group>
    );
};

// ─── DynamicFog ────────────────────────────────────────────────────────
// Swaps scene.fog + scene.background between "cave" and "underwater"
// presets based on the player's Y. When the player is below the water
// line (Y < SWIM_THRESHOLD_Y), fog goes dense + cyan-blue → you can't
// see the cave THROUGH the water surface looking up (was a bug Felipe
// flagged). Smooth lerp so the transition isn't a snap.
const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _bgColor = useRef(new THREE.Color('#0e0a08'));
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    useFrame((_, dt) => {
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;
        const submerged = y < SWIM_THRESHOLD_Y;
        // Target presets
        const tgtBg   = submerged ? 0x041422 : 0x0e0a08;
        const tgtFog  = submerged ? 0x041422 : 0x0e0a08;
        const tgtNear = submerged ? 0.5 : 14;
        const tgtFar  = submerged ? 14  : 55;
        // Lerp colors + fog distances toward targets at ~8/s rate.
        const k = Math.min(1, 8 * Math.min(0.05, dt));
        _fogColor.current.lerp(new THREE.Color(tgtFog), k);
        _bgColor.current.lerp(new THREE.Color(tgtBg), k);
        scene.fog.color.copy(_fogColor.current);
        scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
        scene.fog.far  = scene.fog.far  + (tgtFar  - scene.fog.far)  * k;
        if (scene.background && (scene.background as any).isColor) {
            (scene.background as THREE.Color).copy(_bgColor.current);
        }
    });
    return null;
};

// ─── God ray — volumetric cone of light coming through the hole ───────
// Single additive cone mesh hanging from the ceiling above the pool.
// The hole "lets sunlight in" — that's the fiction; in reality there
// is no sun, but this single cone fakes the effect convincingly. Slow
// opacity pulse via useFrame to feel alive (dust drifting in beam).
const GodRay: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        m.opacity = 0.10 + Math.sin(state.clock.elapsedTime * 0.4) * 0.025;
    });
    return (
        <mesh position={[HOLE_CENTER_X, 4, HOLE_CENTER_Z]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[HOLE_RADIUS * 1.4, 8, 16, 1, true]} />
            <meshBasicMaterial
                ref={matRef}
                color="#FFE0A8"
                transparent
                opacity={0.10}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                toneMapped={false}
            />
        </mesh>
    );
};

// ─── Underwater caustics — animated rippling light on the seafloor ───
// A flat plane just above the seafloor with a shader that draws
// "voronoi-ish" caustic bands. Additive, transparent. Mimics the light
// pattern that refracts through wave-water in real underwater scenes.
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
        // Tile UVs so the pattern repeats across the big seafloor plane.
        vec2 uv = vUv * 6.0;
        // Two moving sine grids with different angles + speeds = rippling
        // intersection pattern that reads as light caustics.
        float a = sin(uv.x * 6.28 + time * 0.6) + sin((uv.x + uv.y) * 5.0 + time * 0.9);
        float b = sin(uv.y * 6.28 + time * 0.5 + 1.2) + sin((uv.y - uv.x) * 4.5 + time * 0.7);
        float c = pow(max(0.0, sin(a) * sin(b)), 3.0);
        // Slightly chromatically split for "RGB caustics" feel.
        vec3 col = vec3(c * 0.85, c * 0.95, c * 1.0);
        gl_FragColor = vec4(col, c * 0.55);
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
            <planeGeometry args={[80, 80]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── Underwater flora — kelp + coral ──────────────────────────────────
// Animated kelp (tall green strands swaying with sin time) and a few
// coral pieces (red/orange clusters). Built procedurally; reasonable
// poly count.
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
    [-8.0, -8.0, 3.5, 0.5],
    [-9.5, -7.0, 4.2, 1.9],
    [12.0, -10.0, 4.0, 1.2],
    [-15.0,  5.0, 3.8, 0.4],
    [ 14.0,  8.0, 4.5, 2.1],
    [ -6.0,  16.0, 3.3, 1.6],
    [  8.0,  15.0, 4.8, 0.8],
];
type CoralData = readonly [number, number, string, number]; // x, z, color, scale
const CORAL_POSITIONS: readonly CoralData[] = [
    [ 3.0, -5.0, '#ff6b3d', 1.0],
    [-4.0,  6.0, '#ff9750', 0.8],
    [ 9.0, -2.0, '#ff5555', 1.2],
    [-12.0, -5.0, '#ffa030', 0.9],
    [13.0,  3.0, '#ff7050', 1.0],
    [-8.0, 12.0, '#ff8060', 0.7],
];

const Kelp: React.FC<{ x: number; z: number; height: number; phase: number }> = ({ x, z, height, phase }) => {
    const groupRef = useRef<THREE.Group>(null);
    const segments = 5;
    const refs = useRef<(THREE.Mesh | null)[]>(new Array(segments).fill(null));
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < segments; i++) {
            const m = refs.current[i];
            if (!m) continue;
            // Each segment sways more the higher it is (i / segments).
            const swayAmt = (i / segments) * 0.25;
            m.rotation.z = Math.sin(t * 0.6 + phase + i * 0.4) * swayAmt;
            m.rotation.x = Math.cos(t * 0.5 + phase + i * 0.3) * swayAmt * 0.6;
        }
    });
    const segLen = height / segments;
    return (
        <group ref={groupRef} position={[x, -30, z]}>
            {Array.from({ length: segments }, (_, i) => (
                <mesh
                    key={i}
                    ref={(r: any) => { refs.current[i] = r; }}
                    position={[0, segLen * 0.5 + i * segLen * 0.95, 0]}
                    geometry={KELP_GEO}
                    scale={[1 - i * 0.1, segLen, 1 - i * 0.1]}
                >
                    <meshStandardMaterial color={i < 2 ? '#0e3a1e' : '#2a6a3c'} roughness={0.85} flatShading />
                </mesh>
            ))}
        </group>
    );
};
const Coral: React.FC<{ x: number; z: number; color: string; scale: number }> = ({ x, z, color, scale }) => (
    <group position={[x, -30, z]} scale={scale}>
        <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.6, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[0.3, 0.9, 0.2]}>
            <sphereGeometry args={[0.4, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[-0.35, 1.0, -0.15]}>
            <sphereGeometry args={[0.35, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} flatShading />
        </mesh>
        <mesh position={[0.1, 1.3, 0.3]}>
            <sphereGeometry args={[0.28, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} flatShading />
        </mesh>
    </group>
);
// ─── Subnautica-style god ray shafts (underwater volumetric) ──────────
// Stack of 8 thin vertical planes arranged radially around the hole
// projection. Each plane is additive-blended translucent — overlapped
// from any angle they produce the "shafts of sunlight from the surface"
// look. Slow rotation = sun moving slowly through the water.
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
                            color="#a8d8f0"
                            transparent
                            opacity={0.07 + (i % 3) * 0.015}
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

// ─── Fish school — small fish swimming in circular paths ──────────────
// 14 fish using cone geometry. Each fish has a unique radius, speed,
// height oscillation, and phase offset → school motion without real
// boids. Sells "alive ecosystem" instantly.
const FISH_GEO = new THREE.ConeGeometry(0.18, 0.55, 4);
const FISH_COUNT = 14;
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
            // Face the direction of motion (tangent to circle).
            f.rotation.y = -angle + Math.PI / 2;
            f.rotation.z = Math.PI / 2; // lay cone horizontally so the point is the head
            // Wiggle
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
                        color={i % 3 === 0 ? '#a0c8d8' : i % 3 === 1 ? '#7090a0' : '#88a8c0'}
                        emissive={i % 3 === 0 ? '#284050' : '#1c2830'}
                        emissiveIntensity={0.4}
                        roughness={0.6}
                        flatShading
                    />
                </mesh>
            ))}
        </group>
    );
};

const UnderwaterFlora: React.FC = () => (
    <>
        {KELP_POSITIONS.map(([x, z, h, p], i) => (
            <Kelp key={`kelp-${i}`} x={x} z={z} height={h} phase={p} />
        ))}
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

// ─── Plankton particles (underwater) ────────────────────────────────
// Tiny green-white specs floating in the water column. Sells "alive
// underwater ecosystem" without any real cost — InstancedMesh, 40
// particles, no useFrame per-particle (position set once).
const PLANKTON_COUNT = 40;
const PLANKTON_GEO = new THREE.SphereGeometry(1, 4, 3);
const PlanktonField: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(PLANKTON_COUNT).fill(null));
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < PLANKTON_COUNT; i++) {
            const r = refs.current[i];
            if (!r) continue;
            // Slow Brownian drift — each particle has a unique phase
            const seed = i * 7.31;
            r.position.x += Math.sin(t * 0.15 + seed) * 0.003;
            r.position.y += Math.cos(t * 0.12 + seed * 1.3) * 0.002;
            r.position.z += Math.sin(t * 0.13 + seed * 0.7) * 0.003;
        }
    });
    return (
        <Instances limit={PLANKTON_COUNT} range={PLANKTON_COUNT} geometry={PLANKTON_GEO}>
            <meshBasicMaterial color="#a8e8c8" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
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
        const safeDt = Math.min(dt, 0.05);
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
            <meshBasicMaterial color="#b8e0f0" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
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

        // Distance cull: past 20m, hide entirely.
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

// ─── Shard positions (now underwater, around the boulder field) ───────
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
    /** When true, the water surface gets a real screen-space reflection.
     *  Quality-gated: ONLY pass true on high quality — it's an extra
     *  render pass per frame at 512px. */
    reflective?: boolean;
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    reflective = false,
}) => {
    // ─── Load real PBR texture sets from ambientcg.com ─────────────
    const caveFloor = usePBRSet(
        '/textures/cave/floor_color.jpg',
        '/textures/cave/floor_normal.jpg',
        '/textures/cave/floor_roughness.jpg',
        '/textures/cave/floor_ao.jpg',
        8, 8
    );
    const caveWall = usePBRSet(
        '/textures/cave/wall_color.jpg',
        '/textures/cave/wall_normal.jpg',
        '/textures/cave/wall_roughness.jpg',
        '/textures/cave/wall_ao.jpg',
        4, 2
    );
    const caveRock = usePBRSet(
        '/textures/cave/rock_color.jpg',
        '/textures/cave/rock_normal.jpg',
        '/textures/cave/rock_roughness.jpg',
        '/textures/cave/rock_ao.jpg',
        1, 1
    );
    const uwFloor = usePBRSet(
        '/textures/underwater/floor_color.jpg',
        '/textures/underwater/floor_normal.jpg',
        '/textures/underwater/floor_roughness.jpg',
        '/textures/underwater/floor_ao.jpg',
        10, 10
    );
    const uwRock = usePBRSet(
        '/textures/underwater/rock_color.jpg',
        '/textures/underwater/rock_normal.jpg',
        '/textures/underwater/rock_roughness.jpg',
        '/textures/underwater/rock_ao.jpg',
        1, 1
    );

    // ─── Load rock GLB models ──────────────────────────────────────
    const rockModels = ROCK_MODEL_PATHS.map(p => useGLTF(p));
    const boulderModel = useGLTF(BOULDER_MODEL_PATH);

    // Clone GLB scenes so each instance has its own transform
    const rockScenes = useMemo(() => rockModels.map(m => m.scene.clone(true)), [rockModels]);
    const boulderScene = useMemo(() => boulderModel.scene.clone(true), [boulderModel]);

    return (
    <group>
        <color attach="background" args={['#0e0a08']} />
        <fog attach="fog" args={['#0e0a08', 14, 55]} />

        <ambientLight intensity={0.65} color="#d8c0a0" />
        <hemisphereLight intensity={0.5} color="#c8a888" groundColor="#1a1612" />
        <directionalLight position={[5, 20, 5]} intensity={0.7} color="#ffe8c0" />

        <DynamicFog playerPositionRef={playerPositionRef} />

        {/* ─── CAVE FLOOR with hole — real PBR textures ─────────── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.02, 0]}
        >
            <meshStandardMaterial
                map={caveFloor.color}
                normalMap={caveFloor.normal}
                normalScale={new THREE.Vector2(2.0, 2.0)}
                roughnessMap={caveFloor.rough}
                roughness={0.92}
                aoMap={caveFloor.ao}
                aoMapIntensity={0.6}
            />
        </mesh>

        {/* Cave ceiling */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#2a221c" roughness={1} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — real PBR textures from ambientcg Rock035 */}
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
        {/* Light pebbles — still using instanced icosahedra (tiny, not worth GLB) */}
        <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* Pool rim ring — lowered to Y=-0.08 to sit BELOW the cave floor
            at Y=-0.02, fixing the z-fighting/overlap issue Felipe reported. */}
        <mesh position={[HOLE_CENTER_X, -0.08, HOLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[HOLE_RADIUS + 0.2, 0.35, 8, 24]} />
            <meshStandardMaterial map={caveFloor.color} normalMap={caveFloor.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={caveFloor.rough} roughness={0.95} />
        </mesh>

        {/* POOL RIM — individual boulders forming the circular edge */}
        {POOL_RIM.map(([x, y, z, s, ry], i) => (
            <group key={`rim-${i}`} position={[x, y - 0.1 + s * 0.3, z]} scale={[s, s * 0.5, s]} rotation={[0, ry, 0]}>
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

        {/* God-ray beam descending through the hole */}
        {/* God ray removed — Felipe flagged it as "luz esquisita no
            meio do lago". The cone was reading as a UFO beam, not a
            shaft of sunlight. Reverting until we have a real volumetric
            implementation. */}

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        {/* Underwater rocky ground — real PBR textures from ambientcg Ground037 */}
        <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
            <meshStandardMaterial
                map={uwFloor.color}
                normalMap={uwFloor.normal}
                normalScale={new THREE.Vector2(2.5, 2.5)}
                roughnessMap={uwFloor.rough}
                roughness={0.95}
                aoMap={uwFloor.ao}
                aoMapIntensity={0.7}
            />
        </mesh>

        {/* RGB caustics on the seafloor — animated additive plane that
            casts the rippling light pattern from the surface above onto
            the ground. Pure shader, no texture. */}
        <UnderwaterCaustics />

        {/* Underwater flora — kelp & coral for ecosystem feel */}
        <UnderwaterFlora />

        {/* Subnautica-style god ray shafts descending from the surface */}
        <GodRayShafts />

        {/* Small fish school looping around the boulder field */}
        <FishSchool />

        {/* Underwater boulders — real GLB models with PBR textures */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Underwater pebbles — real PBR textures on instanced geometry */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
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