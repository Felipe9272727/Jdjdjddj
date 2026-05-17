/**
 * CaveEnhancements.tsx — Unreal Engine 5-quality cave effects
 *
 * Adds photorealistic cave features that make the environment feel like
 * a real underground system, not a 3D scene with flat walls.
 *
 * Features:
 *   1. Wet surfaces near water (reflective rock with roughness variation)
 *   2. Volumetric cave fog (height-based, animated drift)
 *   3. Dripping water from stalactites (particle system)
 *   4. Flowstone formations (calcite deposits on walls)
 *   5. Moss/algae patches on walls near water
 *   6. Small cave streams flowing to the pool
 *   7. Crystal light bounce (colored indirect illumination)
 *   8. Wet floor reflections near pool rim
 *   9. Cave dust motes with volumetric lighting
 *  10. Water splash rings where drips hit pool
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

// ─── Shared constants ─────────────────────────────────────────────────
const HOLE_CENTER_X = 0;
const HOLE_CENTER_Z = 5;
const HOLE_RADIUS = 3.0;
const WATER_LEVEL_Y = -0.05;

// ═══════════════════════════════════════════════════════════════════════
// 1. WET SURFACE MATERIAL — PBR-like with animated moisture
// ═══════════════════════════════════════════════════════════════════════

const WetSurfaceMaterial = shaderMaterial(
    {
        time: 0,
        uWetness: 0.8,
        uBaseColor: new THREE.Color('#1a1610'),
        uWetColor: new THREE.Color('#0a0a08'),
        uFresnelPower: 3.0,
        uDripSpeed: 0.3,
        uMoistureScale: 0.15,
    },
    /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vUv = uv;
            vHeight = position.y;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
    `,
    /* glsl */ `
        uniform float time;
        uniform float uWetness;
        uniform vec3 uBaseColor;
        uniform vec3 uWetColor;
        uniform float uFresnelPower;
        uniform float uDripSpeed;
        uniform float uMoistureScale;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        varying float vHeight;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2D(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 4; i++) { v += a * noise2D(p); p *= 2.0; a *= 0.5; }
            return v;
        }

        void main() {
            vec3 N = normalize(vWorldNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

            vec2 moistureUV = vWorldPos.xz * uMoistureScale;
            float moisture = fbm(moistureUV + time * 0.02);
            moisture = smoothstep(0.3, 0.7, moisture) * uWetness;

            float dripNoise = noise2D(vec2(vWorldPos.x * 2.0, vWorldPos.y * 0.5 - time * uDripSpeed));
            float dripTrail = smoothstep(0.6, 0.9, dripNoise) * smoothstep(0.0, 0.3, vHeight);
            dripTrail *= 0.3;

            float totalWetness = min(moisture + dripTrail, 1.0);
            vec3 baseColor = mix(uBaseColor, uWetColor, totalWetness * 0.6);

            vec3 reflectDir = reflect(-V, N);
            vec3 envColor = mix(
                vec3(0.02, 0.04, 0.06),
                vec3(0.08, 0.12, 0.15),
                max(reflectDir.y, 0.0)
            );

            float reflectivity = fresnel * totalWetness * 0.4;
            vec3 finalColor = mix(baseColor, envColor, reflectivity);

            vec3 lightDir = normalize(vec3(0.0, 1.0, 0.3));
            float spec = pow(max(dot(reflect(-lightDir, N), V), 0.0), 16.0);
            finalColor += vec3(0.04, 0.05, 0.06) * spec * totalWetness;

            float shimmer = noise2D(vWorldPos.xz * 8.0 + time * 0.5);
            finalColor += vec3(0.01, 0.015, 0.02) * shimmer * totalWetness;

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
);

// ═══════════════════════════════════════════════════════════════════════
// 2. VOLUMETRIC CAVE FOG — height-based, animated drift
// ═══════════════════════════════════════════════════════════════════════

const FogLayerMaterial = shaderMaterial(
    {
        time: 0,
        uColor: new THREE.Color('#0a0806'),
        uOpacity: 0.06,
        uSpeed: 0.03,
        uScale: 0.08,
        uHeightFade: 0.0,
    },
    /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    /* glsl */ `
        uniform float time;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uHeightFade;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2D(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise2D(p); p *= 2.0; a *= 0.5; }
            return v;
        }

        void main() {
            vec2 uv = vWorldPos.xz * uScale;
            float fog = fbm(uv + time * uSpeed);
            fog *= fbm(uv * 1.5 - time * uSpeed * 0.7 + 10.0);
            float edgeDist = length(vWorldPos.xz) / 30.0;
            float edgeFade = smoothstep(1.0, 0.4, edgeDist);
            float heightFade = smoothstep(uHeightFade + 3.0, uHeightFade, vWorldPos.y);
            float alpha = fog * uOpacity * edgeFade * heightFade;
            gl_FragColor = vec4(uColor, alpha);
        }
    `
);

// ═══════════════════════════════════════════════════════════════════════
// 3. DRIP SYSTEM — water droplets falling from stalactites
// ═══════════════════════════════════════════════════════════════════════

interface DripData {
    x: number; y: number; z: number;
    vy: number; age: number; maxAge: number; active: boolean;
}

const DRIP_COUNT = 30;
const DRIP_SOURCES: [number, number, number][] = [
    [-12, 7.5, 10], [16, 7.2, 2], [-5, 7.0, -15], [22, 7.5, 10],
    [-18, 7.3, -5], [3, 6.8, -20], [-22, 7.4, 20], [18, 7.1, -25],
    [-8, 7.6, 0], [5, 6.9, -8], [-15, 7.2, 15], [12, 7.4, 18],
    [0, 7.0, -12], [-25, 7.1, -8], [20, 7.3, -3],
];

const DripSystem: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>(new Array(DRIP_COUNT).fill(null));
    const data = useRef<DripData[]>(
        Array.from({ length: DRIP_COUNT }, (_, i) => {
            const src = DRIP_SOURCES[i % DRIP_SOURCES.length];
            return {
                x: src[0] + (Math.random() - 0.5) * 1.5,
                y: src[1],
                z: src[2] + (Math.random() - 0.5) * 1.5,
                vy: -3 - Math.random() * 2,
                age: Math.random() * 3,
                maxAge: 2.5 + Math.random() * 1.5,
                active: false,
            };
        })
    );

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        for (let i = 0; i < DRIP_COUNT; i++) {
            const d = data.current[i];
            d.age += safeDt;
            if (!d.active) {
                if (d.age > 1.5 + Math.random() * 3.0) {
                    d.active = true;
                    d.age = 0;
                    const src = DRIP_SOURCES[i % DRIP_SOURCES.length];
                    d.x = src[0] + (Math.random() - 0.5) * 1.0;
                    d.y = src[1];
                    d.z = src[2] + (Math.random() - 0.5) * 1.0;
                    d.vy = -3 - Math.random() * 2;
                }
                const r = refs.current[i];
                if (r) r.visible = false;
                continue;
            }
            d.vy += -9.8 * safeDt;
            d.y += d.vy * safeDt;
            if (d.y <= 0.0 || d.y <= WATER_LEVEL_Y) {
                d.active = false;
                d.age = 0;
                const r = refs.current[i];
                if (r) r.visible = false;
                continue;
            }
            const r = refs.current[i];
            if (r) {
                r.visible = true;
                r.position.set(d.x, d.y, d.z);
                const stretch = Math.min(Math.abs(d.vy) * 0.08, 2.0);
                r.scale.set(0.02, 0.02 + stretch * 0.02, 0.02);
            }
        }
    });

    return (
        <group>
            {Array.from({ length: DRIP_COUNT }, (_, i) => (
                <mesh key={i} ref={(r) => { refs.current[i] = r; }}>
                    <sphereGeometry args={[1, 4, 3]} />
                    <meshStandardMaterial
                        color="#4a6a80"
                        emissive="#1a3040"
                        emissiveIntensity={0.3}
                        transparent
                        opacity={0.7}
                        roughness={0.2}
                        metalness={0.1}
                    />
                </mesh>
            ))}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// 4. FLOWSTONE FORMATIONS — calcite deposits on walls
// ═══════════════════════════════════════════════════════════════════════

const FlowstoneMaterial = shaderMaterial(
    { time: 0, uBaseColor: new THREE.Color('#2a2218'), uStripeColor: new THREE.Color('#3a3020') },
    /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    /* glsl */ `
        uniform float time;
        uniform vec3 uBaseColor;
        uniform vec3 uStripeColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
            float stripe = sin(vWorldPos.y * 12.0 + vWorldPos.x * 2.0) * 0.5 + 0.5;
            stripe = smoothstep(0.3, 0.7, stripe);
            vec3 color = mix(uBaseColor, uStripeColor, stripe * 0.4);
            vec3 V = normalize(cameraPosition - vWorldPos);
            float fresnel = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 2.5);
            color += vec3(0.02, 0.025, 0.03) * fresnel;
            float shimmer = sin(vWorldPos.y * 20.0 + time * 0.3) * 0.02;
            color += vec3(shimmer);
            gl_FragColor = vec4(color, 1.0);
        }
    `
);

interface FlowstoneProps {
    x: number; y: number; z: number;
    height: number; width: number; rotY: number;
}

const Flowstone: React.FC<FlowstoneProps> = ({ x, y, z, height, width, rotY }) => {
    const mat = useMemo(() => new (FlowstoneMaterial as any)(), []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });

    const geo = useMemo(() => {
        const g = new THREE.CylinderGeometry(width * 0.3, width, height, 8, 12);
        const pos = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const n = noise3D(v.x * 3, v.y * 2, v.z * 3) * 0.15;
            const taper = 1.0 - ((v.y + height / 2) / height) * 0.6;
            pos.setX(i, v.x * (1 + n) * taper);
            pos.setZ(i, v.z * (1 + n) * taper);
        }
        pos.needsUpdate = true;
        g.computeVertexNormals();
        return g;
    }, [width, height]);

    return (
        <mesh position={[x, y, z]} rotation={[0, rotY, 0]} geometry={geo}>
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

const FLOWSTONES: FlowstoneProps[] = [
    { x: -28.5, y: 2, z: -10, height: 4, width: 0.8, rotY: 0.3 },
    { x: -28.5, y: 1.5, z: 5, height: 3, width: 0.6, rotY: -0.2 },
    { x: -28.5, y: 3, z: 18, height: 5, width: 1.0, rotY: 0.5 },
    { x: 28.5, y: 2.5, z: -8, height: 4.5, width: 0.9, rotY: 0.4 },
    { x: 28.5, y: 1, z: 12, height: 2.5, width: 0.5, rotY: -0.3 },
    { x: -8, y: 2, z: -28.5, height: 3.5, width: 0.7, rotY: 1.2 },
    { x: 10, y: 3, z: -28.5, height: 4, width: 0.8, rotY: -0.8 },
    { x: -3, y: 0.5, z: 7, height: 1.5, width: 0.4, rotY: 0.1 },
    { x: 2, y: 0.3, z: 3, height: 1.2, width: 0.35, rotY: 2.1 },
];

// ═══════════════════════════════════════════════════════════════════════
// 5. MOSS PATCHES — organic growth on walls near water
// ═══════════════════════════════════════════════════════════════════════

const MossMaterial = shaderMaterial(
    { time: 0, uColor: new THREE.Color('#1a3a1a') },
    /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    /* glsl */ `
        uniform float time;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2D(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        void main() {
            vec2 uv = vUv * 4.0;
            float n = noise2D(uv) * 0.5 + noise2D(uv * 2.0) * 0.3 + noise2D(uv * 4.0) * 0.2;
            float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
            edge *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
            float mask = smoothstep(0.2, 0.5, n) * edge;
            vec3 color = uColor * (0.7 + n * 0.6);
            color += vec3(0.0, 0.02, 0.0) * sin(time * 0.5 + vWorldPos.x);
            float glow = smoothstep(0.6, 0.9, n) * 0.15;
            color += vec3(0.05, 0.12, 0.05) * glow;
            gl_FragColor = vec4(color, mask * 0.85);
        }
    `
);

interface MossPatchProps {
    x: number; y: number; z: number;
    width: number; height: number;
    rotX: number; rotY: number; rotZ: number;
}

const MossPatch: React.FC<MossPatchProps> = ({ x, y, z, width, height, rotX, rotY, rotZ }) => {
    const mat = useMemo(() => new (MossMaterial as any)(), []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });
    return (
        <mesh position={[x, y, z]} rotation={[rotX, rotY, rotZ]}>
            <planeGeometry args={[width, height, 8, 8]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

const MOSS_PATCHES: MossPatchProps[] = [
    { x: -28.8, y: 1.2, z: 3, width: 3, height: 2, rotX: 0, rotY: Math.PI / 2, rotZ: 0 },
    { x: -28.8, y: 0.8, z: 7, width: 2, height: 1.5, rotX: 0.1, rotY: Math.PI / 2, rotZ: 0.2 },
    { x: 28.8, y: 1.0, z: 4, width: 2.5, height: 1.8, rotX: 0, rotY: -Math.PI / 2, rotZ: -0.1 },
    { x: 28.8, y: 0.5, z: 8, width: 1.8, height: 1.2, rotX: -0.1, rotY: -Math.PI / 2, rotZ: 0 },
    { x: -2, y: 0.8, z: -28.8, width: 2, height: 1.5, rotX: 0, rotY: 0, rotZ: 0.15 },
    { x: 5, y: 1.2, z: -28.8, width: 3, height: 2, rotX: 0, rotY: 0, rotZ: -0.1 },
    { x: -2, y: 0.02, z: 7.5, width: 1.5, height: 1.5, rotX: -Math.PI / 2, rotY: 0, rotZ: 0 },
    { x: 3, y: 0.02, z: 2.5, width: 1.2, height: 1.2, rotX: -Math.PI / 2, rotY: 0, rotZ: 0.5 },
    { x: -1, y: 0.02, z: 2, width: 1.0, height: 1.0, rotX: -Math.PI / 2, rotY: 0, rotZ: 1.2 },
];

// ═══════════════════════════════════════════════════════════════════════
// 6. CAVE STREAM — small flowing water channel on the floor
// ═══════════════════════════════════════════════════════════════════════

const StreamMaterial = shaderMaterial(
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
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2D(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        void main() {
            vec2 uv = vUv;
            float flow = noise2D(vec2(uv.x * 4.0, uv.y * 2.0 - time * 0.8));
            flow += noise2D(vec2(uv.x * 8.0, uv.y * 4.0 - time * 1.2)) * 0.5;
            float edge = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x);
            vec3 color = mix(vec3(0.02, 0.04, 0.05), vec3(0.04, 0.08, 0.10), flow * 0.5);
            float ripple = sin(uv.y * 30.0 - time * 3.0) * sin(uv.x * 20.0 + time * 1.5);
            color += vec3(0.02, 0.03, 0.04) * max(ripple, 0.0);
            float alpha = edge * (0.4 + flow * 0.2);
            gl_FragColor = vec4(color, alpha);
        }
    `
);

const CaveStream: React.FC<{ points: [number, number][]; width?: number }> = ({ points, width = 0.4 }) => {
    const mat = useMemo(() => {
        const m = new (StreamMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });

    const geo = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3(
            points.map(([x, z]) => new THREE.Vector3(x, 0.03, z))
        );
        const pts = curve.getPoints(40);
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const t = i / (pts.length - 1);
            const w = width * (0.6 + 0.4 * Math.sin(t * Math.PI));
            const tangent = curve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            positions.push(p.x - normal.x * w, p.y, p.z - normal.z * w);
            positions.push(p.x + normal.x * w, p.y, p.z + normal.z * w);
            uvs.push(0, t);
            uvs.push(1, t);
            if (i < pts.length - 1) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
    }, [points, width]);

    return (
        <mesh geometry={geo}>
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

const STREAM_PATHS: [number, number][][] = [
    [[-28, 6], [-20, 5.5], [-12, 5.2], [-6, 5.1], [-3.5, 5]],
    [[-5, -28], [-3, -18], [-1, -8], [0, 2], [0.5, 4]],
    [[20, 20], [14, 15], [8, 10], [4, 7], [2, 5.5]],
];

// ═══════════════════════════════════════════════════════════════════════
// 7. CRYSTAL BOUNCE LIGHTS — colored indirect illumination
// ═══════════════════════════════════════════════════════════════════════

const CRYSTAL_BOUNCE_LIGHTS: [number, number, number, string, number][] = [
    [-27, 1.5, 8, '#4a7a9a', 0.4],
    [27, 2.5, -5, '#6a4a8a', 0.35],
    [-10, 0.5, 27, '#8a4a6a', 0.3],
    [12, 0.5, -27, '#8a7a3a', 0.35],
    [-27, 3.5, -18, '#4a8a5a', 0.25],
    [27, 1.0, 20, '#3a6a8a', 0.3],
];

// ═══════════════════════════════════════════════════════════════════════
// 8. WET FLOOR REFLECTIONS — near pool rim
// ═══════════════════════════════════════════════════════════════════════

const WetFloorMaterial = shaderMaterial(
    { time: 0 },
    /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    /* glsl */ `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise2D(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        void main() {
            float dist = length(vWorldPos.xz - vec2(0.0, 5.0));
            float poolFade = smoothstep(3.0, 8.0, dist);
            float puddle = noise2D(vWorldPos.xz * 2.0 + time * 0.01);
            puddle = smoothstep(0.4, 0.6, puddle) * (1.0 - poolFade);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 N = vec3(0.0, 1.0, 0.0);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            vec3 color = vec3(0.03, 0.03, 0.025);
            vec3 reflectColor = vec3(0.06, 0.08, 0.10);
            color = mix(color, reflectColor, fresnel * puddle * 0.5);
            float ripple = sin(dist * 8.0 - time * 2.0) * 0.5 + 0.5;
            color += vec3(0.01, 0.015, 0.02) * ripple * puddle * 0.3;
            float alpha = puddle * 0.6 * (1.0 - poolFade * 0.8);
            gl_FragColor = vec4(color, alpha);
        }
    `
);

// ═══════════════════════════════════════════════════════════════════════
// 9. CAVE DUST MOTES — volumetric particles catching light
// ═══════════════════════════════════════════════════════════════════════

const VOLUMETRIC_DUST_COUNT = 80;
const VolumetricDust: React.FC = () => {
    const refs = useRef<(THREE.Object3D | null)[]>(new Array(VOLUMETRIC_DUST_COUNT).fill(null));
    const data = useRef(
        Array.from({ length: VOLUMETRIC_DUST_COUNT }, () => ({
            x: (Math.random() - 0.5) * 50,
            y: Math.random() * 7,
            z: (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 0.003,
            vy: (Math.random() - 0.5) * 0.001,
            vz: (Math.random() - 0.5) * 0.003,
            seed: Math.random() * 10,
        }))
    );

    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const t = state.clock.elapsedTime;
        for (let i = 0; i < VOLUMETRIC_DUST_COUNT; i++) {
            const d = data.current[i];
            d.x += (d.vx + Math.sin(t * 0.05 + d.seed) * 0.001) * safeDt;
            d.y += (d.vy + Math.cos(t * 0.03 + d.seed * 0.7) * 0.0005) * safeDt;
            d.z += (d.vz + Math.sin(t * 0.04 + d.seed * 1.3) * 0.001) * safeDt;
            if (d.x < -25) d.x = 25; if (d.x > 25) d.x = -25;
            if (d.y < 0.5) d.y = 7; if (d.y > 7.5) d.y = 0.5;
            if (d.z < -25) d.z = 25; if (d.z > 25) d.z = -25;
            const r = refs.current[i];
            if (r) r.position.set(d.x, d.y, d.z);
        }
    });

    return (
        <Instances limit={VOLUMETRIC_DUST_COUNT} range={VOLUMETRIC_DUST_COUNT}>
            <sphereGeometry args={[1, 3, 2]} />
            <meshBasicMaterial color="#c8a870" transparent opacity={0.15} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            {Array.from({ length: VOLUMETRIC_DUST_COUNT }, (_, i) => (
                <Instance key={i} ref={(r: any) => { refs.current[i] = r; }} scale={0.02 + Math.random() * 0.03} />
            ))}
        </Instances>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// FOG LAYER HELPER
// ═══════════════════════════════════════════════════════════════════════

const FogLayer: React.FC<{
    y: number; opacity: number; scale: number; speed: number; color: string;
}> = ({ y, opacity, scale, speed, color }) => {
    const mat = useMemo(() => {
        const m = new (FogLayerMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        m.uOpacity = opacity;
        m.uScale = scale;
        m.uSpeed = speed;
        m.uColor = new THREE.Color(color);
        m.uHeightFade = y;
        return m;
    }, [y, opacity, scale, speed, color]);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime; });
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
            <planeGeometry args={[60, 60, 1, 1]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════

export const CaveEnhancements: React.FC<{ quality: 'low' | 'medium' | 'high' }> = ({ quality }) => {
    const wetMat = useMemo(() => new (WetSurfaceMaterial as any)(), []);
    const wetFloorMat = useMemo(() => {
        const m = new (WetFloorMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        (wetMat as any).time = t;
        (wetFloorMat as any).time = t;
    });

    const isMed = quality === 'medium' || quality === 'high';

    return (
        <group>
            {/* Wet surfaces on lower cave walls near water */}
            <mesh position={[-29.5, 1.5, 5]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[12, 3, 16, 8]} />
                <primitive object={wetMat} attach="material" />
            </mesh>
            <mesh position={[29.5, 1.5, 5]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[12, 3, 16, 8]} />
                <meshStandardMaterial color="#0e0c08" roughness={0.4} metalness={0.1} transparent opacity={0.85} />
            </mesh>

            {/* Wet floor puddles near pool */}
            <mesh position={[0, 0.01, 5]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[16, 16, 32, 32]} />
                <primitive object={wetFloorMat} attach="material" />
            </mesh>

            {/* Volumetric fog layers */}
            {isMed && (
                <>
                    <FogLayer y={0.5} opacity={0.08} scale={0.06} speed={0.02} color="#0a0806" />
                    <FogLayer y={1.5} opacity={0.05} scale={0.08} speed={0.015} color="#080604" />
                    <FogLayer y={3.0} opacity={0.03} scale={0.1} speed={0.01} color="#060404" />
                </>
            )}

            {/* Dripping water from stalactites */}
            <DripSystem />

            {/* Flowstone formations */}
            {FLOWSTONES.map((fs, i) => <Flowstone key={`fs-${i}`} {...fs} />)}

            {/* Moss patches */}
            {isMed && MOSS_PATCHES.map((mp, i) => <MossPatch key={`moss-${i}`} {...mp} />)}

            {/* Cave streams flowing to pool */}
            {STREAM_PATHS.map((path, i) => (
                <CaveStream key={`stream-${i}`} points={path} width={0.3 + i * 0.05} />
            ))}

            {/* Crystal bounce lights */}
            {CRYSTAL_BOUNCE_LIGHTS.map(([x, y, z, color, intensity], i) => (
                <pointLight key={`bounce-${i}`} position={[x, y, z]} color={color} intensity={intensity} distance={8} decay={2} />
            ))}

            {/* Volumetric dust motes */}
            {isMed && <VolumetricDust />}
        </group>
    );
};

export default CaveEnhancements;
