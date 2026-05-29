/**
 * Floor3.tsx — Cartoon Obby.
 *
 * Visual technique: every 3-D object renders TWO meshes stacked:
 *   1. Back-face mesh with normals pushed outward → thick black outline.
 *   2. Front-face mesh with MeshToonMaterial (4-step cel gradient) → flat cartoon shading.
 *
 * This "normal-extrusion outline" is the industry standard for cartoon games
 * (Borderlands, Cel-Damage, many anime titles) and works without any
 * post-processing pass. Combined with a hand-painted 3-step toon gradient it
 * gives a clean Cartoon Network / early-Roblox look that reads as *designed*
 * rather than as a shader trick on top of a realistic mesh.
 *
 * Additional cartoon elements:
 *   • Animated gradient sky sphere (blue top → pale-blue horizon).
 *   • Floating box-clouds with outlines that slowly drift in X.
 *   • Rotating gold star on the goal platform.
 *   • Bold, saturated, different colour on every platform.
 *   • f3MovingX.current is written every frame so Player.tsx physics can
 *     track the moving platform without any React state.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import { F3_PLATFORMS, F3_MOVE_AMP, f3MovingX } from './constants';

// ─── Toon gradient (4 luminance steps → hard cel-shading bands) ──────────────
function useToonGrad() {
    return useMemo(() => {
        const data = new Uint8Array([48, 108, 180, 255]);
        const t = new THREE.DataTexture(data, 4, 1);
        (t as any).format = THREE.RedFormat;
        t.minFilter = THREE.NearestFilter;
        t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.needsUpdate = true;
        return t;
    }, []);
}

// ─── Outline vertex shader (normal-extrusion technique) ──────────────────────
// Each vertex is pushed OUTWARD along its world-space normal by `outlineWidth`
// units, then rendered back-face-only in black → a clean silhouette ring.
const OUTLINE_VS = /* glsl */`
  uniform float outlineWidth;
  void main() {
    // Push along model-space normal then project normally
    vec3 extruded = position + normal * outlineWidth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);
  }
`;
const OUTLINE_FS = /* glsl */`
  void main() { gl_FragColor = vec4(0.04, 0.02, 0.06, 1.0); }
`;

// Sky gradient shader
const SKY_VS = /* glsl */`varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = /* glsl */`
  varying vec3 vPos;
  void main() {
    float t = clamp((normalize(vPos).y + 0.3) / 1.3, 0.0, 1.0);
    vec3 top  = vec3(0.22, 0.50, 0.95);
    vec3 mid  = vec3(0.50, 0.75, 1.00);
    vec3 col  = mix(mid, top, t * t);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Reusable cartoon box: outline + toon fill ───────────────────────────────
interface CBoxProps {
    args: [number, number, number];
    position: [number, number, number];
    rotation?: [number, number, number];
    color: string;
    grad: THREE.DataTexture;
    outlineW?: number;
}
const CBox: React.FC<CBoxProps> = ({ args, position, rotation = [0,0,0], color, grad, outlineW = 0.08 }) => {
    const uniRef = useMemo(() => ({ outlineWidth: { value: outlineW } }), [outlineW]);
    return (
        <group position={position} rotation={rotation as any}>
            <mesh>
                <boxGeometry args={args} />
                <shaderMaterial vertexShader={OUTLINE_VS} fragmentShader={OUTLINE_FS} uniforms={uniRef} side={THREE.BackSide} />
            </mesh>
            <mesh castShadow>
                <boxGeometry args={args} />
                <meshToonMaterial color={color} gradientMap={grad} />
            </mesh>
        </group>
    );
};

// ─── Cartoon cylinder (for poles, clouds, etc.) ───────────────────────────────
interface CCylProps {
    args: [number, number, number, number];
    position: [number, number, number];
    rotation?: [number, number, number];
    color: string;
    grad: THREE.DataTexture;
    outlineW?: number;
}
const CCyl: React.FC<CCylProps> = ({ args, position, rotation = [0,0,0], color, grad, outlineW = 0.07 }) => {
    const uniRef = useMemo(() => ({ outlineWidth: { value: outlineW } }), [outlineW]);
    return (
        <group position={position} rotation={rotation as any}>
            <mesh>
                <cylinderGeometry args={args} />
                <shaderMaterial vertexShader={OUTLINE_VS} fragmentShader={OUTLINE_FS} uniforms={uniRef} side={THREE.BackSide} />
            </mesh>
            <mesh castShadow>
                <cylinderGeometry args={args} />
                <meshToonMaterial color={color} gradientMap={grad} />
            </mesh>
        </group>
    );
};

// ─── Platform colors ──────────────────────────────────────────────────────────
const P_COLORS   = ['#e84040', '#ff4040', '#ff8c00', '#ffe000', '#30cc30', '#ffd700'];
const P_TOP_CLR  = ['#c83030', '#cc3030', '#d07000', '#ccb800', '#28a828', '#e0b800'];

// ─── Animated cloud ───────────────────────────────────────────────────────────
const Cloud: React.FC<{ x: number; y: number; z: number; speed: number; phase: number; grad: THREE.DataTexture }> = ({
    x, y, z, speed, phase, grad,
}) => {
    const ref = useRef<THREE.Group>(null);
    useFrame((s) => {
        if (ref.current) ref.current.position.x = x + Math.sin(s.clock.elapsedTime * speed + phase) * 4;
    });
    return (
        <group ref={ref} position={[x, y, z]}>
            <CBox args={[3.2, 1.2, 1.6]} position={[0, 0, 0]}      color="#f8f8f8" grad={grad} outlineW={0.06} />
            <CBox args={[2.0, 1.4, 1.4]} position={[-1.3, 0.5, 0]} color="#f8f8f8" grad={grad} outlineW={0.05} />
            <CBox args={[2.0, 1.4, 1.4]} position={[1.3,  0.5, 0]} color="#f8f8f8" grad={grad} outlineW={0.05} />
            <CBox args={[1.4, 1.2, 1.2]} position={[0,    1.0, 0]} color="#f0f0f0" grad={grad} outlineW={0.05} />
        </group>
    );
};

// ─── Rotating star on goal ────────────────────────────────────────────────────
const GoalStar: React.FC<{ x: number; y: number; z: number; grad: THREE.DataTexture }> = ({ x, y, z, grad }) => {
    const ref = useRef<THREE.Group>(null);
    useFrame((s) => {
        if (ref.current) {
            ref.current.rotation.y = s.clock.elapsedTime * 1.2;
            ref.current.position.y = y + Math.sin(s.clock.elapsedTime * 2.2) * 0.18;
        }
    });
    return (
        <group ref={ref} position={[x, y, z]}>
            {/* Two crossing boxes make a 3-D star shape */}
            <CBox args={[0.9, 0.9, 0.9]} position={[0, 0, 0]} rotation={[0, 0, 0]}               color="#ffd700" grad={grad} outlineW={0.07} />
            <CBox args={[0.6, 0.6, 0.6]} position={[0, 0, 0]} rotation={[Math.PI/4, Math.PI/4, 0]} color="#fff060" grad={grad} outlineW={0.05} />
            {/* Spikes */}
            {[[0,0.7,0],[0,-0.7,0],[0.7,0,0],[-0.7,0,0],[0,0,0.7],[0,0,-0.7]].map(([px,py,pz],i) => (
                <CBox key={i} args={[0.22, 0.22, 0.22]} position={[px,py,pz]} color="#ffe840" grad={grad} outlineW={0.04} />
            ))}
            {/* Emissive core glow */}
            <mesh>
                <sphereGeometry args={[0.22, 8, 6]} />
                <meshStandardMaterial color="#fff080" emissive="#ffd000" emissiveIntensity={8} />
            </mesh>
        </group>
    );
};

// ─── Void plane (abyss below platforms) ───────────────────────────────────────
const VoidFloor: React.FC = () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -14, 6]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color="#050318" />
    </mesh>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const Floor3Environment: React.FC = () => {
    const grad = useToonGrad();

    // Animate the moving platform (step 4) and write to shared mutable
    const movingRef = useRef<THREE.Group>(null);
    useFrame((s) => {
        const x = Math.sin(s.clock.elapsedTime * 0.9) * F3_MOVE_AMP;
        f3MovingX.current = x;
        if (movingRef.current) movingRef.current.position.x = x;
    });

    return (
        <group>
            {/* ── Sky ─────────────────────────────────────────────────── */}
            <color attach="background" args={['#4a90e8']} />
            {/* Sky sphere — gradient shader, huge radius, back-faces inward */}
            <mesh>
                <sphereGeometry args={[80, 16, 10]} />
                <shaderMaterial vertexShader={SKY_VS} fragmentShader={SKY_FS} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* ── Lighting ────────────────────────────────────────────── */}
            <ambientLight intensity={1.4} color="#e8f4ff" />
            <directionalLight position={[-6, 14, 8]} intensity={2.2} color="#fff8d8" castShadow />
            {/* Warm bounce from below */}
            <hemisphereLight args={['#b8d8ff', '#2a1a60', 0.6]} />

            {/* ── Void abyss ──────────────────────────────────────────── */}
            <VoidFloor />
            {/* Fog-like ambient point in the void for depth */}
            <pointLight position={[0, -8, 8]} intensity={1.2} distance={28} decay={2} color="#2010a0" />

            {/* ── Platforms ───────────────────────────────────────────── */}
            {F3_PLATFORMS.map((p, i) => {
                const cy = p.topY - p.h / 2;   // center Y of box
                const w  = p.hw * 2;
                const d  = p.hd * 2;

                if (p.moving) {
                    return (
                        <group key={i} ref={movingRef} position={[p.cx, 0, p.cz]}>
                            {/* Platform body */}
                            <CBox args={[w, p.h, d]} position={[0, cy, 0]} color={P_COLORS[i]} grad={grad} outlineW={0.09} />
                            {/* Top face highlight strip */}
                            <mesh position={[0, p.topY + 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
                                <planeGeometry args={[w - 0.1, d - 0.1]} />
                                <meshToonMaterial color={P_TOP_CLR[i]} gradientMap={grad} />
                            </mesh>
                            {/* Stripes under the platform (cartoon detail) */}
                            <CBox args={[w + 0.05, 0.12, 0.12]} position={[0, cy - p.h * 0.3, 0]} color="#222" grad={grad} outlineW={0.0} />
                        </group>
                    );
                }

                // i === 0: start floor (no visible outline, connects to elevator)
                const ow = i === 0 ? 0.0 : 0.09;
                return (
                    <group key={i} position={[p.cx, 0, p.cz]}>
                        <CBox args={[w, p.h, d]} position={[0, cy, 0]} color={P_COLORS[i]} grad={grad} outlineW={ow} />
                        {/* Top strip */}
                        {i > 0 && (
                            <mesh position={[0, p.topY + 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
                                <planeGeometry args={[w - 0.1, d - 0.1]} />
                                <meshToonMaterial color={P_TOP_CLR[i]} gradientMap={grad} />
                            </mesh>
                        )}
                        {/* Decorative band */}
                        {i > 0 && (
                            <CBox args={[w + 0.05, 0.10, 0.10]} position={[0, cy - p.h * 0.3, 0]} color="#222" grad={grad} outlineW={0.0} />
                        )}
                        {/* Goal star */}
                        {i === F3_PLATFORMS.length - 1 && (
                            <GoalStar x={0} y={p.topY + 1.2} z={0} grad={grad} />
                        )}
                        {/* Goal flag pole */}
                        {i === F3_PLATFORMS.length - 1 && (
                            <>
                                <CCyl args={[0.06, 0.06, 3.5, 8]} position={[-1.8, p.topY + 1.75, -1.8]} color="#e8e8e8" grad={grad} outlineW={0.04} />
                                <CBox args={[0.8, 0.5, 0.04]} position={[-1.4, p.topY + 3.1, -1.8]} color="#e82040" grad={grad} outlineW={0.04} />
                            </>
                        )}
                    </group>
                );
            })}

            {/* ── Floating clouds ─────────────────────────────────────── */}
            <Cloud x={-6}  y={10} z={5}  speed={0.25} phase={0.0} grad={grad} />
            <Cloud x={7}   y={12} z={10} speed={0.18} phase={1.6} grad={grad} />
            <Cloud x={-2}  y={14} z={15} speed={0.22} phase={3.2} grad={grad} />
            <Cloud x={5}   y={11} z={0}  speed={0.15} phase={5.0} grad={grad} />

            {/* ── Background decorative pillars (give vertical scale) ──── */}
            {[[-10, 14, 3], [10, 14, 3], [-10, 10, 10], [10, 10, 10]].map(([px, py, pz], i) => (
                <CCyl key={i} args={[0.3, 0.3, py as number, 8]} position={[px, (py as number)/2 - 14, pz]} color={['#6644cc','#4466cc','#cc4466','#44cc88'][i]} grad={grad} outlineW={0.06} />
            ))}

            {/* ── Elevator facade ─────────────────────────────────────── */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={5} width={10} />
            </group>
        </group>
    );
};

export default Floor3Environment;
