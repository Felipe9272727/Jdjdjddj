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

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, shaderMaterial, MeshReflectorMaterial } from '@react-three/drei';
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
    const geo = new THREE.ShapeGeometry(shape);
    return geo;
})();

// ─── Geometries shared across the scene ────────────────────────────────
const BOULDER_GEO = new THREE.IcosahedronGeometry(1, 1);
const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);
const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);

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

// ─── Water shader ──────────────────────────────────────────────────────
// Bigger amplitude, multi-octave waves, fresnel-edge highlights, foam at
// extreme wave peaks. Animated via uniform `time` from useFrame.
const WaterMaterial = shaderMaterial(
    { time: 0, opacity: 0.78 },
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vNormalLocal;
      void main() {
        vUv = uv;
        // Three octaves of sine for layered chop (low frequency big motion +
        // higher-frequency ripples). Total amplitude ~0.12m.
        float w1 = sin(position.x * 0.55 + time * 1.0) * 0.06;
        float w2 = sin(position.y * 0.40 + time * 0.85 + 1.7) * 0.045;
        float w3 = sin((position.x + position.y) * 1.1 + time * 1.8) * 0.025;
        vWave = w1 + w2 + w3;
        // Cheap analytical normal via partial derivatives of the sum.
        float dx = cos(position.x * 0.55 + time * 1.0) * 0.06 * 0.55 +
                   cos((position.x + position.y) * 1.1 + time * 1.8) * 0.025 * 1.1;
        float dy = cos(position.y * 0.40 + time * 0.85 + 1.7) * 0.045 * 0.40 +
                   cos((position.x + position.y) * 1.1 + time * 1.8) * 0.025 * 1.1;
        vNormalLocal = normalize(vec3(-dx, -dy, 1.0));
        vec3 pos = position + vec3(0.0, 0.0, vWave);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vNormalLocal;
      void main() {
        // Two-tone water: deep base, sky reflection on the tops.
        vec3 deep   = vec3(0.04, 0.18, 0.28);
        vec3 mid    = vec3(0.12, 0.42, 0.55);
        vec3 sky    = vec3(0.60, 0.88, 0.98);
        // Caustic-style streaks
        float c1 = sin(vUv.x * 28.0 + time * 0.8) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 22.0 + time * 1.05 + 2.0) * 0.5 + 0.5;
        float caustic = pow(c1 * c2, 2.0);
        // Wave-height tinting: peaks brighter, troughs darker
        float h = clamp(vWave * 6.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);
        col = mix(col, sky, max(0.0, h) * 0.6 + caustic * 0.35);
        // Foam at wave extremes — only the very highest crests get whitened
        float foam = smoothstep(0.06, 0.10, vWave);
        col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.5);
        gl_FragColor = vec4(col, opacity);
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
            {/* Wave/caustic shader on top */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 32, 32]} />
                <primitive object={mat} attach="material" />
            </mesh>
        </group>
    );
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

// ─── Drifting bubbles (underwater) ─────────────────────────────────────
const BUBBLE_COUNT = 20;
const BUBBLE_RANGE = 18;
const BUBBLE_RISE = 0.5;
const BUBBLE_MAX_Y = WATER_LEVEL_Y - 0.5;
const BUBBLE_MIN_Y = -29;

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
}) => (
    <group>
        {/* Warmer cave palette — fog is now warm-tinted to read as "torch-lit
            interior", and the start distance is pushed out so the player can
            actually see the cave dressing. Most of the perceptual lift is
            from buffing ambient + adding torches, not from the bg color. */}
        <color attach="background" args={['#0e0a08']} />
        <fog attach="fog" args={['#0e0a08', 14, 55]} />

        {/* Cave lighting — much stronger than before. Felipe was getting a
            pitch-black room. ambient 0.22→0.65, hemisphere 0.18→0.5,
            directional 0.35→0.7. Plus 6 torches with flicker do the rest. */}
        <ambientLight intensity={0.65} color="#d8c0a0" />
        <hemisphereLight intensity={0.5} color="#c8a888" groundColor="#1a1612" />
        <directionalLight position={[5, 20, 5]} intensity={0.7} color="#ffe8c0" />

        {/* ─── CAVE FLOOR with hole ─────────────────────────────────── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
        >
            <meshStandardMaterial color="#4a3e2e" roughness={0.95} flatShading />
        </mesh>

        {/* Cave ceiling */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#2a221c" roughness={1} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — built as multiple offset boxes per side so the
            silhouette reads as natural stone rather than a flat sheet. Each
            "wall" is 3 vertically-stacked, slightly-offset boxes with
            varying colors. Far cheaper than real geometry; visually:
            chunky rock instead of cardboard panel. */}
        {/* North wall (z = -30) */}
        <mesh position={[ -8, 2.5, -29.6]}><boxGeometry args={[24, 5, 1.0]} /><meshStandardMaterial color="#3a2f24" roughness={1} flatShading /></mesh>
        <mesh position={[ 10, 3.2, -29.4]}><boxGeometry args={[18, 6.4, 1.2]} /><meshStandardMaterial color="#43372a" roughness={1} flatShading /></mesh>
        <mesh position={[ -2, 6.0, -29.8]}><boxGeometry args={[60, 4, 0.6]} /><meshStandardMaterial color="#352b21" roughness={1} flatShading /></mesh>
        {/* South wall (z = 30) */}
        <mesh position={[  6, 2.4,  29.6]}><boxGeometry args={[26, 4.8, 1.0]} /><meshStandardMaterial color="#3c3025" roughness={1} flatShading /></mesh>
        <mesh position={[-12, 3.5,  29.4]}><boxGeometry args={[20, 7, 1.2]} /><meshStandardMaterial color="#45382b" roughness={1} flatShading /></mesh>
        <mesh position={[  4, 6.2,  29.8]}><boxGeometry args={[60, 3.6, 0.6]} /><meshStandardMaterial color="#352b21" roughness={1} flatShading /></mesh>
        {/* West wall (x = -30) */}
        <mesh position={[-29.6, 2.6,   0]}><boxGeometry args={[1.0, 5.2, 28]} /><meshStandardMaterial color="#3a2f24" roughness={1} flatShading /></mesh>
        <mesh position={[-29.4, 3.4,  -12]}><boxGeometry args={[1.2, 6.8, 18]} /><meshStandardMaterial color="#43372a" roughness={1} flatShading /></mesh>
        <mesh position={[-29.8, 6.2,   3]}><boxGeometry args={[0.6, 3.6, 60]} /><meshStandardMaterial color="#352b21" roughness={1} flatShading /></mesh>
        {/* East wall (x = 30) */}
        <mesh position={[ 29.6, 2.5,   8]}><boxGeometry args={[1.0, 5, 22]} /><meshStandardMaterial color="#3c3025" roughness={1} flatShading /></mesh>
        <mesh position={[ 29.4, 3.6, -10]}><boxGeometry args={[1.2, 7.2, 20]} /><meshStandardMaterial color="#45382b" roughness={1} flatShading /></mesh>
        <mesh position={[ 29.8, 6.0,  -2]}><boxGeometry args={[0.6, 4, 60]} /><meshStandardMaterial color="#352b21" roughness={1} flatShading /></mesh>

        {/* Cave boulders — 3 cohorts in different tones */}
        <Instances limit={CAVE_ROCKS_DARK.length} range={CAVE_ROCKS_DARK.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#322820" roughness={0.95} flatShading />
            {CAVE_ROCKS_DARK.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.8, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>
        <Instances limit={CAVE_ROCKS_MID.length} range={CAVE_ROCKS_MID.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#564335" roughness={0.9} flatShading />
            {CAVE_ROCKS_MID.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.8, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>
        <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#6a5544" roughness={0.85} flatShading />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* POOL RIM — large boulders forming the circular edge of the
            water hole. Look + collision: even though Player.tsx falls
            through the hole by XZ-radius check, the rim makes it visually
            obvious where the pool is, even from across the cave. */}
        <Instances limit={POOL_RIM.length} range={POOL_RIM.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#3e3026" roughness={0.92} flatShading />
            {POOL_RIM.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.45, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

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
        <GodRay />

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        {/* Underwater rocky ground — large dark blue plane far below */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color="#0c1820" roughness={1} />
        </mesh>

        {/* Underwater boulders */}
        <Instances limit={UW_BOULDERS.length} range={UW_BOULDERS.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#1a2530" roughness={0.95} flatShading />
            {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* Underwater pebbles */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#101820" roughness={1} flatShading />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        <BubbleField />

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
