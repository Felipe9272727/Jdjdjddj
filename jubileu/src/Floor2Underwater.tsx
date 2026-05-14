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
import { Instances, Instance, shaderMaterial } from '@react-three/drei';
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

// ─── Cave dressing — rocky outcrops along the walls ────────────────────
type Boulder = readonly [number, number, number, number, number]; // x,y,z,s,ry
const CAVE_ROCKS: readonly Boulder[] = [
    [-22, 0,  20, 2.4, 0.3],
    [ 24, 0,  18, 2.1, 1.2],
    [-25, 0, -15, 2.8, 0.6],
    [ 22, 0, -22, 2.5, 1.9],
    [ 18, 0,   4, 1.6, 0.4],
    [-19, 0,   8, 1.8, 2.1],
    [  6, 0,  25, 1.5, 1.0],
    [-12, 0, -25, 2.0, 0.7],
    // Smaller mid-area pebbles for texture
    [-15, 0,  15, 1.0, 2.3],
    [ 14, 0, -10, 0.9, 0.5],
    [-20, 0,   0, 1.2, 1.7],
    [ 19, 0,  14, 1.1, 0.8],
] as const;

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
        <mesh geometry={CRYSTAL_GEO} rotation={[0.3, 0.8, 0]}>
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1.4}
                metalness={0.55}
                roughness={0.15}
                toneMapped={false}
            />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.55} position={[0.35, -0.15, 0.15]} rotation={[0.6, 1.2, 0.3]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} metalness={0.5} roughness={0.18} toneMapped={false} />
        </mesh>
        <mesh geometry={CRYSTAL_GEO} scale={0.4} position={[-0.32, -0.2, -0.05]} rotation={[-0.4, 0.5, 0.7]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} metalness={0.5} roughness={0.2} toneMapped={false} />
        </mesh>
        {/* Soft pool of colored light. distance=5 so 6 crystals = 6 small
            local pools, never overlapping for shader cost. */}
        <pointLight intensity={0.9} distance={5} decay={1.6} color={color} />
    </group>
);

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
const WaterSurface: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (WaterMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
    });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 32, 32]} />
            <primitive object={mat} attach="material" />
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
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
}) => (
    <group>
        {/* Cold deep-water palette + heavy fog. The fog reaches into the
            cave too so the room feels damp / oppressive. */}
        <color attach="background" args={['#0a1820']} />
        <fog attach="fog" args={['#0a1820', 6, 30]} />

        {/* Cave lighting — dim with a faint warm hint to read as "cave",
            not the underwater blue tint. */}
        <ambientLight intensity={0.22} color="#a8b8c0" />
        <hemisphereLight intensity={0.18} color="#7090a0" groundColor="#1a2530" />
        <directionalLight position={[0, 30, 0]} intensity={0.35} color="#9ec0d0" />

        {/* ─── CAVE (above water, Y=0..8) ───────────────────────────── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
        >
            <meshStandardMaterial color="#34302c" roughness={0.95} flatShading />
        </mesh>

        {/* Cave ceiling */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#1e1c1a" roughness={1} side={THREE.DoubleSide} />
        </mesh>

        {/* Cave walls — 4 slabs around radius 25 */}
        <mesh position={[0, 4, -30]}><boxGeometry args={[60, 8, 0.5]} /><meshStandardMaterial color="#2a2620" roughness={1} /></mesh>
        <mesh position={[0, 4,  30]}><boxGeometry args={[60, 8, 0.5]} /><meshStandardMaterial color="#2a2620" roughness={1} /></mesh>
        <mesh position={[-30, 4, 0]}><boxGeometry args={[0.5, 8, 60]} /><meshStandardMaterial color="#2a2620" roughness={1} /></mesh>
        <mesh position={[ 30, 4, 0]}><boxGeometry args={[0.5, 8, 60]} /><meshStandardMaterial color="#2a2620" roughness={1} /></mesh>

        {/* Cave rock outcrops (instances) */}
        <Instances limit={CAVE_ROCKS.length} range={CAVE_ROCKS.length} geometry={BOULDER_GEO}>
            <meshStandardMaterial color="#3a342e" roughness={0.95} flatShading />
            {CAVE_ROCKS.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.8, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* Stalagmites — cones rising from the floor. Random-ish heights. */}
        {STALAGMITES.map(([x, z, h, r], i) => (
            <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]}>
                <coneGeometry args={[r, h, 6]} />
                <meshStandardMaterial color="#2e2820" roughness={1} flatShading />
            </mesh>
        ))}

        {/* Stalactites — inverted cones from the ceiling */}
        {STALACTITES.map(([x, z, h, r], i) => (
            <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[r, h, 6]} />
                <meshStandardMaterial color="#26221c" roughness={1} flatShading />
            </mesh>
        ))}

        {/* Decorative glowing crystal clusters on the walls */}
        {CRYSTALS.map(([x, y, z, color], i) => (
            <CrystalCluster key={`crystal-${i}`} x={x} y={y} z={z} color={color} />
        ))}

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface />

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
