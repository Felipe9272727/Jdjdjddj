/**
 * Floor3.tsx — "Câmara de Testes Nº 03" — Portal 2 / Aperture Science style.
 *
 * First-person (zoom locked to 0 by App.tsx). Custom GLSL shaders produce the
 * iconic Aperture look: white panelled walls with dark seam lines, dark metal
 * grating floor with a glowing blue grid, and ceiling light bays. Bloom in the
 * post-processing pass (threshold 0.50, intensity 1.1) makes every emissive
 * surface glow — energy bridge, indicator dots, ceiling bays, energy beam.
 *
 * Room bounds: X [-14, +14] · Y [0, 8] · Z [-10, +22]. Elevator at z = -10.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
    bg:           '#03060b',
    fog:          '#050a12',
    panelWhite:   '#d4d4cf',
    seamBlack:    '#060606',
    metalDark:    '#101620',
    metalMid:     '#1a2230',
    grating:      '#0c1218',
    portalBlue:   '#00c4ff',
    portalOrange: '#ff5e00',
    ceilLight:    '#c0dcff',
    warnStripe:   '#ff5800',
    glassBlue:    '#5090c8',
    indicatorOn:  '#00ffcc',
    gelOrange:    '#ff7020',
    white:        '#f0f0f0',
};

// ─── Vertex shader (shared) ──────────────────────────────────────────────────
const VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ─── Wall panel shader ───────────────────────────────────────────────────────
// Tiles white Aperture panels (2.2u × 1.5u) with 0.06u dark seams.
// Uniforms: panelW/H = panel size as fraction of total UV (set per-wall).
const WALL_FS = /* glsl */`
  varying vec2 vUv;
  uniform float panelW;
  uniform float panelH;
  void main() {
    float seamR = 0.032;
    float fx = fract(vUv.x / panelW);
    float fy = fract(vUv.y / panelH);
    float sx = step(fx, seamR) + step(1.0 - seamR, fx);
    float sy = step(fy, seamR) + step(1.0 - seamR, fy);
    float seam = clamp(sx + sy, 0.0, 1.0);
    // slight bevel darkening at corners
    float corner = step(fx, seamR * 1.6) * step(fy, seamR * 1.6);
    corner += step(1.0 - seamR * 1.6, fx) * step(1.0 - seamR * 1.6, fy);
    corner += step(fx, seamR * 1.6) * step(1.0 - seamR * 1.6, fy);
    corner += step(1.0 - seamR * 1.6, fx) * step(fy, seamR * 1.6);
    float c = seam + clamp(corner, 0.0, 1.0) * 0.5;
    c = clamp(c, 0.0, 1.0);
    vec3 col = mix(vec3(0.83, 0.83, 0.79), vec3(0.03, 0.03, 0.03), c);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Floor grating shader ────────────────────────────────────────────────────
// Dark metallic grating with blue-glowing grid lines — Portal 2 test floor.
const FLOOR_FS = /* glsl */`
  varying vec2 vUv;
  uniform vec2 gridScale;      // (cols, rows) grid lines across the mesh
  void main() {
    vec2 g = fract(vUv * gridScale);
    vec2 e = abs(g - 0.5) * 2.0;               // 0 at line, 1 between
    float lineW = 0.055;
    float gx = clamp(1.0 - e.x / lineW, 0.0, 1.0);
    float gz = clamp(1.0 - e.y / lineW, 0.0, 1.0);
    float grid = max(gx, gz);
    vec3 dark  = vec3(0.05, 0.075, 0.12);
    vec3 glow  = vec3(0.0,  0.55,  1.0);
    // faint sub-grid
    vec2 sg = fract(vUv * gridScale * 3.0);
    vec2 se = abs(sg - 0.5) * 2.0;
    float subGrid = clamp(1.0 - min(se.x, se.y) / (lineW * 0.6), 0.0, 1.0) * 0.12;
    vec3 col = mix(dark, glow, grid * 0.42 + subGrid);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Animated energy bridge shader ───────────────────────────────────────────
const BRIDGE_FS = /* glsl */`
  varying vec2 vUv;
  uniform float time;
  void main() {
    float t = time * 0.4;
    // scrolling scan lines along the bridge length (vUv.y = Z direction)
    float scan = abs(sin(vUv.y * 18.0 - t * 6.0));
    scan = pow(scan, 4.0);
    // edge fade
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0 - vUv.x);
    // shimmer
    float shim = abs(sin(vUv.x * 40.0 + t * 3.0)) * 0.12;
    vec3 col = vec3(0.0, 0.65, 1.0) + vec3(0.0, 0.2, 0.35) * scan + shim;
    float alpha = edge * (0.55 + scan * 0.35);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Animated energy beam shader (horizontal) ────────────────────────────────
const BEAM_FS = /* glsl */`
  varying vec2 vUv;
  uniform float time;
  void main() {
    float t = time;
    float ring = abs(sin(vUv.x * 30.0 - t * 8.0));
    ring = pow(ring, 5.0);
    float edge = smoothstep(0.0, 0.22, vUv.y) * smoothstep(0.0, 0.22, 1.0 - vUv.y);
    vec3 col = vec3(1.0, 0.35, 0.0) + vec3(0.4, 0.0, 0.0) * ring;
    gl_FragColor = vec4(col, edge * (0.7 + ring * 0.3));
  }
`;

// ─── Wall panel helper ────────────────────────────────────────────────────────
// Renders a single wall plane with panel+seam shading.
// totalW/totalH = real-world size of the plane.
// panelW/panelH = real-world panel tile size (e.g. 2.2 × 1.5).
const WallPanel: React.FC<{
    args: [number, number];
    position: [number, number, number];
    rotation?: [number, number, number];
    panelW?: number;
    panelH?: number;
}> = ({ args, position, rotation = [0, 0, 0], panelW = 2.2, panelH = 1.5 }) => {
    const uniforms = useMemo(() => ({
        panelW: { value: panelW / args[0] },
        panelH: { value: panelH / args[1] },
    }), [args, panelW, panelH]);
    return (
        <mesh position={position} rotation={rotation as any}>
            <planeGeometry args={[args[0], args[1]]} />
            <shaderMaterial vertexShader={VS} fragmentShader={WALL_FS} uniforms={uniforms} side={THREE.FrontSide} />
        </mesh>
    );
};

// ─── Floor mesh ───────────────────────────────────────────────────────────────
const FloorGrating: React.FC<{
    width: number; depth: number;
    position: [number, number, number];
    gridW?: number; gridD?: number;
}> = ({ width, depth, position, gridW = 2, gridD = 2 }) => {
    const uniforms = useMemo(() => ({
        gridScale: { value: new THREE.Vector2(width / gridW, depth / gridD) },
    }), [width, depth, gridW, gridD]);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
            <planeGeometry args={[width, depth]} />
            <shaderMaterial vertexShader={VS} fragmentShader={FLOOR_FS} uniforms={uniforms} />
        </mesh>
    );
};

// ─── Animated bridge ──────────────────────────────────────────────────────────
const EnergyBridge: React.FC<{ x: number; y: number; z: number; w: number; d: number }> = ({
    x, y, z, w, d,
}) => {
    const uniRef = useRef({ time: { value: 0 } });
    useFrame((_, dt) => { uniRef.current.time.value += dt; });
    const uniforms = uniRef.current;
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]}>
            <planeGeometry args={[w, d]} />
            <shaderMaterial
                vertexShader={VS} fragmentShader={BRIDGE_FS}
                uniforms={uniforms}
                transparent side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
};

// ─── Animated energy beam (horizontal cylinder + shader overlay) ───────────
const EnergyBeam: React.FC<{ x1: number; x2: number; y: number; z: number }> = ({ x1, x2, y, z }) => {
    const uniRef = useRef({ time: { value: 0 } });
    useFrame((_, dt) => { uniRef.current.time.value += dt; });
    const len = Math.abs(x2 - x1);
    return (
        <mesh position={[(x1 + x2) / 2, y, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.06, 0.06, len, 12]} />
            <shaderMaterial
                vertexShader={VS} fragmentShader={BEAM_FS}
                uniforms={uniRef.current}
                transparent depthWrite={false}
            />
        </mesh>
    );
};

// ─── Aperture turret ──────────────────────────────────────────────────────────
const Turret: React.FC<{ x: number; y: number; z: number; facing?: number }> = ({
    x, y, z, facing = 0,
}) => (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
        {/* base foot */}
        <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.22, 0.28, 0.16, 12]} />
            <meshStandardMaterial color="#d0d0cc" roughness={0.2} metalness={0.6} />
        </mesh>
        {/* body */}
        <mesh position={[0, 0.52, 0]}>
            <cylinderGeometry args={[0.16, 0.20, 0.72, 12]} />
            <meshStandardMaterial color="#e0e0dc" roughness={0.15} metalness={0.5} />
        </mesh>
        {/* eye panel */}
        <mesh position={[0, 0.55, 0.14]}>
            <boxGeometry args={[0.22, 0.26, 0.04]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.1} metalness={0.8} />
        </mesh>
        {/* eye glow red */}
        <mesh position={[0, 0.55, 0.17]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color="#ff1020" emissive="#ff0010" emissiveIntensity={5} />
        </mesh>
        {/* gun barrels */}
        {[-0.12, 0.12].map((ox) => (
            <mesh key={ox} position={[ox, 0.52, 0.30]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.32, 6]} />
                <meshStandardMaterial color="#c8c8c4" roughness={0.2} metalness={0.9} />
            </mesh>
        ))}
        {/* head antenna */}
        <mesh position={[0, 1.06, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.22, 6]} />
            <meshStandardMaterial color="#d0d0cc" roughness={0.3} metalness={0.7} />
        </mesh>
    </group>
);

// ─── Gel dispenser ────────────────────────────────────────────────────────────
const GelDispenser: React.FC<{ x: number; y: number; z: number }> = ({ x, y, z }) => (
    <group position={[x, y, z]}>
        {/* housing */}
        <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.22, 0.18, 0.5, 10]} />
            <meshStandardMaterial color="#d0d0cc" roughness={0.2} metalness={0.6} />
        </mesh>
        {/* nozzle */}
        <mesh position={[0, -0.55, 0]}>
            <cylinderGeometry args={[0.06, 0.12, 0.14, 8]} />
            <meshStandardMaterial color={C.gelOrange} emissive={C.gelOrange} emissiveIntensity={1.5} roughness={0.3} />
        </mesh>
        {/* gel drop */}
        <mesh position={[0, -0.9, 0]}>
            <sphereGeometry args={[0.085, 8, 6]} />
            <meshStandardMaterial color={C.gelOrange} emissive={C.gelOrange} emissiveIntensity={2} transparent opacity={0.9} />
        </mesh>
    </group>
);

// ─── Aperture Science circular logo ──────────────────────────────────────────
const ApertureLogo: React.FC<{ x: number; y: number; z: number; r?: number; facing?: number }> = ({
    x, y, z, r = 1.4, facing = 0,
}) => (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
        {/* outer ring */}
        <mesh>
            <torusGeometry args={[r, 0.07, 8, 40]} />
            <meshStandardMaterial color={C.white} emissive={C.white} emissiveIntensity={0.4} roughness={0.2} />
        </mesh>
        {/* inner ring */}
        <mesh>
            <torusGeometry args={[r * 0.55, 0.05, 8, 32]} />
            <meshStandardMaterial color={C.white} emissive={C.white} emissiveIntensity={0.3} roughness={0.2} />
        </mesh>
        {/* 6 spoke blades — Aperture A logo */}
        {Array.from({ length: 6 }).map((_, i) => (
            <mesh key={i} position={[0, 0, 0]} rotation={[0, 0, (i / 6) * Math.PI * 2]}>
                <mesh position={[r * 0.78, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <boxGeometry args={[r * 0.52, 0.22, 0.03]} />
                    <meshStandardMaterial color={C.white} emissive={C.white} emissiveIntensity={0.3} roughness={0.2} />
                </mesh>
            </mesh>
        ))}
    </group>
);

// ─── Ceiling light bay ────────────────────────────────────────────────────────
const CeilLightBay: React.FC<{ x: number; z: number; w?: number; d?: number; y?: number }> = ({
    x, z, w = 3.0, d = 0.9, y = 8,
}) => (
    <group position={[x, y, z]}>
        {/* recessed tray */}
        <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[w, 0.22, d]} />
            <meshStandardMaterial color={C.metalMid} roughness={0.6} metalness={0.4} />
        </mesh>
        {/* bright emissive panel */}
        <mesh position={[0, 0.0, 0]}>
            <boxGeometry args={[w - 0.1, 0.06, d - 0.08]} />
            <meshStandardMaterial
                color={C.ceilLight}
                emissive={C.ceilLight}
                emissiveIntensity={6}
                roughness={0.4}
            />
        </mesh>
    </group>
);

// ─── Wall indicator dot ───────────────────────────────────────────────────────
const IndicatorDot: React.FC<{ position: [number, number, number]; rotation?: [number, number, number]; on?: boolean }> = ({
    position, rotation = [0, 0, 0], on = true,
}) => (
    <mesh position={position} rotation={rotation as any}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial
            color={on ? C.indicatorOn : '#333'}
            emissive={on ? C.indicatorOn : '#000'}
            emissiveIntensity={on ? 4 : 0}
        />
    </mesh>
);

// ─── Warning stripe strip ─────────────────────────────────────────────────────
const WarnStripes: React.FC<{ x: number; y: number; z: number; length: number; axis?: 'x' | 'z' }> = ({
    x, y, z, length, axis = 'z',
}) => {
    const count = Math.ceil(length / 0.4);
    return (
        <group position={[x, y, z]}>
            {Array.from({ length: count }).map((_, i) => {
                const t = (i / count);
                const px = axis === 'x' ? -length / 2 + (i + 0.5) * (length / count) : 0;
                const pz = axis === 'z' ? -length / 2 + (i + 0.5) * (length / count) : 0;
                return (
                    <mesh key={i} position={[px, 0, pz]} rotation={[0, Math.PI / 4, 0]}>
                        <boxGeometry args={[0.28, 0.04, 0.04]} />
                        <meshStandardMaterial color={i % 2 === 0 ? C.warnStripe : '#111'} roughness={0.5} />
                    </mesh>
                );
            })}
        </group>
    );
};

// ─── Companion cube (decorative) ─────────────────────────────────────────────
const CompanionCube: React.FC<{ x: number; y: number; z: number; scale?: number }> = ({
    x, y, z, scale = 1,
}) => (
    <group position={[x, y, z]} scale={[scale, scale, scale]}>
        {/* main body */}
        <mesh castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#d0c8cc" roughness={0.3} metalness={0.3} />
        </mesh>
        {/* corner trim */}
        {[[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[-0.5,0.5,-0.5],[0.5,0.5,-0.5],
          [-0.5,-0.5, 0.5],[0.5,-0.5, 0.5],[-0.5,0.5, 0.5],[0.5,0.5, 0.5]].map(([cx,cy,cz],i) => (
            <mesh key={i} position={[cx * 0.5, cy * 0.5, cz * 0.5]} castShadow>
                <boxGeometry args={[0.18, 0.18, 0.18]} />
                <meshStandardMaterial color="#a898a0" roughness={0.2} metalness={0.5} />
            </mesh>
        ))}
        {/* pink heart faces */}
        {[[0,0,-0.51],[0,0,0.51],[0,-0.51,0],[0,0.51,0],[-0.51,0,0],[0.51,0,0]].map(([px,py,pz],i) => {
            const rots: [number,number,number][] = [
                [0,0,0],[0,Math.PI,0],
                [-Math.PI/2,0,0],[Math.PI/2,0,0],
                [0,-Math.PI/2,0],[0,Math.PI/2,0],
            ];
            return (
                <mesh key={i} position={[px,py,pz]} rotation={rots[i]}>
                    <circleGeometry args={[0.22, 16]} />
                    <meshStandardMaterial color="#e060a0" emissive="#c04080" emissiveIntensity={0.6} roughness={0.4} side={THREE.FrontSide} />
                </mesh>
            );
        })}
    </group>
);

// ─── Main environment ─────────────────────────────────────────────────────────
export const Floor3Environment: React.FC = () => {
    // Animated room point lights
    const blueLightRef = useRef<THREE.PointLight>(null);
    useFrame((_, dt) => {
        if (blueLightRef.current) {
            blueLightRef.current.intensity = 3.5 + Math.sin(Date.now() * 0.002) * 0.4;
        }
    });

    // Emitter/receiver portal-orange glow
    const emitterGlow = {
        color: C.portalOrange, emissive: C.portalOrange, emissiveIntensity: 6, roughness: 0.3,
    };
    const receiverGlow = {
        color: C.portalBlue, emissive: C.portalBlue, emissiveIntensity: 6, roughness: 0.3,
    };

    return (
        <group>
            {/* Background + fog */}
            <color attach="background" args={[C.bg]} />
            <fog attach="fog" args={[C.fog, 18, 50]} />

            {/* ── Lighting ───────────────────────────────────────────────── */}
            <ambientLight intensity={0.22} color="#a8c8e0" />
            {/* Overhead fill from ceiling light bays */}
            <directionalLight position={[0, 8, 6]} intensity={0.9} color="#d0e4f8" />
            {/* Portal blue accent fill */}
            <pointLight
                ref={blueLightRef}
                position={[0, 1.8, 5]}
                intensity={3.5}
                distance={18}
                decay={2}
                color={C.portalBlue}
            />
            {/* Orange emitter glow */}
            <pointLight position={[13, 4, 6]} intensity={2.8} distance={10} decay={2} color={C.portalOrange} />
            {/* Blue receiver glow */}
            <pointLight position={[-13, 4, 6]} intensity={2.4} distance={10} decay={2} color={C.portalBlue} />
            {/* Far chamber fill */}
            <pointLight position={[0, 4, 18]} intensity={1.8} distance={14} decay={2} color="#b0d0ff" />

            {/* ── Floor ──────────────────────────────────────────────────── */}
            <FloorGrating width={28} depth={32} position={[0, 0, 6]} gridW={2} gridD={2} />
            {/* Raised platform (z=+6 to +20) */}
            <FloorGrating width={18} depth={14} position={[0, 1.55, 13]} gridW={1.5} gridD={1.5} />
            {/* Platform sides */}
            <mesh position={[0, 0.775, 6.0]}>
                <boxGeometry args={[18, 1.55, 0.16]} />
                <meshStandardMaterial color={C.metalDark} roughness={0.5} metalness={0.8} />
            </mesh>
            <mesh position={[-9, 0.775, 13]}>
                <boxGeometry args={[0.16, 1.55, 14]} />
                <meshStandardMaterial color={C.metalDark} roughness={0.5} metalness={0.8} />
            </mesh>
            <mesh position={[9, 0.775, 13]}>
                <boxGeometry args={[0.16, 1.55, 14]} />
                <meshStandardMaterial color={C.metalDark} roughness={0.5} metalness={0.8} />
            </mesh>
            {/* Warning stripes on platform edges */}
            <WarnStripes x={0}   y={1.56} z={6.05} length={18} axis="x" />
            <WarnStripes x={-9}  y={1.56} z={13}   length={14} axis="z" />
            <WarnStripes x={9}   y={1.56} z={13}   length={14} axis="z" />

            {/* ── Ceiling ────────────────────────────────────────────────── */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 8, 6]}>
                <planeGeometry args={[28, 32]} />
                <meshStandardMaterial color={C.metalDark} roughness={0.8} metalness={0.4} side={THREE.BackSide} />
            </mesh>
            {/* Ceiling light bays — two rows of 4 */}
            {[-6, 6].map(cz => (
                [-8, -2.5, 2.5, 8].map(cx => (
                    <CeilLightBay key={`${cx}_${cz}`} x={cx} z={cz} y={8} w={3.0} d={0.9} />
                ))
            ))}
            {/* Deep chamber ceiling bays */}
            {[12, 18].map(cz => (
                [-5, 0, 5].map(cx => (
                    <CeilLightBay key={`${cx}_${cz}`} x={cx} z={cz} y={8} w={2.5} d={0.9} />
                ))
            ))}
            {/* Ceiling structural beams */}
            {[-7, 0, 7].map(bx => (
                <mesh key={bx} position={[bx, 7.6, 6]}>
                    <boxGeometry args={[0.4, 0.8, 32]} />
                    <meshStandardMaterial color={C.metalMid} roughness={0.6} metalness={0.6} />
                </mesh>
            ))}

            {/* ── Walls ──────────────────────────────────────────────────── */}
            {/* Left wall X=-14, spans Z[-10,+22] = 32 deep, H=8 */}
            <WallPanel args={[32, 8]} position={[-14, 4, 6]} rotation={[0, Math.PI / 2, 0]} panelW={2.2} panelH={1.5} />
            {/* Right wall X=+14 */}
            <WallPanel args={[32, 8]} position={[14, 4, 6]} rotation={[0, -Math.PI / 2, 0]} panelW={2.2} panelH={1.5} />
            {/* Far wall Z=+22 */}
            <WallPanel args={[28, 8]} position={[0, 4, 22]} rotation={[0, Math.PI, 0]} panelW={2.2} panelH={1.5} />
            {/* Entry wall Z=-10 — left and right of elevator doorway */}
            <WallPanel args={[12.7, 8]} position={[-7.65, 4, -10]} rotation={[0, 0, 0]} panelW={2.2} panelH={1.5} />
            <WallPanel args={[12.7, 8]} position={[7.65, 4, -10]} rotation={[0, 0, 0]} panelW={2.2} panelH={1.5} />
            {/* Header above elevator doorway */}
            <WallPanel args={[2.6, 3.5]} position={[0, 6.25, -10]} rotation={[0, 0, 0]} panelW={2.2} panelH={1.5} />

            {/* ── Observation window (left wall) ────────────────────────── */}
            <mesh position={[-13.92, 4.5, 10]}>
                <boxGeometry args={[0.12, 2.8, 4.5]} />
                <meshStandardMaterial
                    color={C.glassBlue} transparent opacity={0.25}
                    roughness={0} metalness={0.9}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Window frame */}
            {[[0, 1.5, 0], [0, -1.5, 0], [0, 0, 2.3], [0, 0, -2.3]].map(([fx, fy, fz], i) => (
                <mesh key={i} position={[-13.85, 4.5 + fy, 10 + fz]}>
                    <boxGeometry args={[0.16, i < 2 ? 0.12 : 2.8, i < 2 ? 4.7 : 0.12]} />
                    <meshStandardMaterial color={C.metalDark} roughness={0.5} metalness={0.8} />
                </mesh>
            ))}

            {/* ── Energy bridge (main path across the gap) ─────────────── */}
            <EnergyBridge x={0} y={1.56} z={3.5} w={6} d={7} />
            {/* Bridge edge trim emissive */}
            {[-3, 3].map(ex => (
                <mesh key={ex} position={[ex, 1.56, 3.5]}>
                    <boxGeometry args={[0.06, 0.04, 7]} />
                    <meshStandardMaterial color={C.portalBlue} emissive={C.portalBlue} emissiveIntensity={8} />
                </mesh>
            ))}

            {/* ── Energy emitter / receiver ─────────────────────────────── */}
            {/* Emitter (orange, right wall) */}
            <mesh position={[13.5, 4.0, 6]} rotation={[0, -Math.PI / 2, 0]}>
                <cylinderGeometry args={[0.28, 0.32, 0.4, 12]} />
                <meshStandardMaterial {...emitterGlow} />
            </mesh>
            <mesh position={[13.2, 4.0, 6]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.10, 0.10, 0.3, 8]} />
                <meshStandardMaterial {...emitterGlow} />
            </mesh>
            {/* Receiver (blue, left wall) */}
            <mesh position={[-13.5, 4.0, 6]} rotation={[0, Math.PI / 2, 0]}>
                <cylinderGeometry args={[0.28, 0.32, 0.4, 12]} />
                <meshStandardMaterial {...receiverGlow} />
            </mesh>
            <mesh position={[-13.2, 4.0, 6]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[0.10, 0.10, 0.3, 8]} />
                <meshStandardMaterial {...receiverGlow} />
            </mesh>
            {/* Energy beam between them */}
            <EnergyBeam x1={12.9} x2={-12.9} y={4.0} z={6} />

            {/* ── Gel dispensers on ceiling ──────────────────────────────── */}
            <GelDispenser x={-5} y={8} z={3} />
            <GelDispenser x={5}  y={8} z={3} />

            {/* ── Turrets on raised platform ────────────────────────────── */}
            <Turret x={-4.5} y={1.55} z={12} facing={0.4} />
            <Turret x={4.5}  y={1.55} z={12} facing={-0.4} />

            {/* ── Companion cube on platform ────────────────────────────── */}
            <CompanionCube x={0} y={2.05} z={17} scale={0.9} />

            {/* ── Aperture Science logo on far wall ────────────────────── */}
            <ApertureLogo x={0} y={4.5} z={21.85} r={1.6} facing={Math.PI} />
            {/* Test chamber info text light strip */}
            <mesh position={[0, 7.2, 21.88]}>
                <boxGeometry args={[5, 0.18, 0.06]} />
                <meshStandardMaterial color={C.ceilLight} emissive={C.ceilLight} emissiveIntensity={4} />
            </mesh>

            {/* ── Wall indicator dot panels ─────────────────────────────── */}
            {/* Left wall indicators */}
            {[2, 6, 10, 14, 18].map((iz, i) => (
                <IndicatorDot key={i} position={[-13.88, 1.3, iz]} rotation={[0, Math.PI / 2, 0]} on={i % 3 !== 2} />
            ))}
            {/* Right wall indicators */}
            {[2, 6, 10, 14, 18].map((iz, i) => (
                <IndicatorDot key={i} position={[13.88, 1.3, iz]} rotation={[0, -Math.PI / 2, 0]} on={i % 2 === 0} />
            ))}

            {/* ── Structural corner beams (vertical) ────────────────────── */}
            {[[-14, -10], [14, -10], [-14, 22], [14, 22]].map(([bx, bz], i) => (
                <mesh key={i} position={[bx, 4, bz]}>
                    <boxGeometry args={[0.4, 8.2, 0.4]} />
                    <meshStandardMaterial color={C.metalMid} roughness={0.5} metalness={0.7} />
                </mesh>
            ))}

            {/* ── Button panel on right wall ────────────────────────────── */}
            <mesh position={[13.7, 2.5, 2]} rotation={[0, -Math.PI / 2, 0]}>
                <boxGeometry args={[0.6, 0.8, 0.08]} />
                <meshStandardMaterial color={C.metalMid} roughness={0.4} metalness={0.7} />
            </mesh>
            {[[0, 0.2], [0, -0.1], [0, -0.32]].map(([bx, by], i) => (
                <mesh key={i} position={[13.62, 2.5 + by, 2 + bx]} rotation={[0, -Math.PI / 2, 0]}>
                    <boxGeometry args={[0.12, 0.08, 0.06]} />
                    <meshStandardMaterial
                        color={i === 0 ? C.portalBlue : i === 1 ? C.portalOrange : '#404040'}
                        emissive={i === 0 ? C.portalBlue : i === 1 ? C.portalOrange : '#000'}
                        emissiveIntensity={i < 2 ? 3 : 0}
                        roughness={0.3}
                    />
                </mesh>
            ))}

            {/* ── Elevator facade ───────────────────────────────────────── */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={8} width={10} />
            </group>
        </group>
    );
};

export default Floor3Environment;
