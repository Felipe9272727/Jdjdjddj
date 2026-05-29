/**
 * Floor3.tsx — "Câmara de Testes Cartoon" — Portal-inspired obby rendered with
 * the Guilty-Gear-class toon system in cartoonToon.ts.
 *
 * Every solid object = an inverted-hull outline mesh (distance-scaled width) +
 * a custom toon fill mesh (banded colored-shadow diffuse + Fresnel rim + hard
 * specular). The result is a clean, designed cartoon — not a filter on top of
 * realism — that reads as an Aperture test chamber: white seam panels, portal
 * blue/orange accents, hard-light platforms, a companion cube, portal rings,
 * and an Aperture logo at the goal.
 *
 * Platform layout / physics live in constants.ts (F3_PLATFORMS, f3MovingX) and
 * Player.tsx; this file is purely visual + the moving-platform animation.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import { F3_PLATFORMS, F3_MOVE_AMP, f3MovingX } from './constants';
import { createToonMaterial, createOutlineMaterial, type ToonOpts } from './cartoonToon';

// ─── Palette (Aperture cartoon) ──────────────────────────────────────────────
const PANEL       = '#eef1f4';
const PANEL_SHADOW= '#9fb0c4';
const PANEL_SEAM  = '#c2ccd6';
const DARKPANEL   = '#2a3340';
const DARK_SHADOW = '#161c26';
const PORTAL_BLUE = '#19a8ff';
const PORTAL_ORNG = '#ff7a18';
const OUTLINE     = '#0a0712';

// ─── Reusable cartoon primitives ─────────────────────────────────────────────
type GeoKind = 'box' | 'cyl' | 'torus' | 'sphere';

interface ShapeProps {
    kind: GeoKind;
    geoArgs: any[];
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    toon: ToonOpts;
    outline?: number;          // 0 = no outline
    castShadow?: boolean;
}

const Geo: React.FC<{ kind: GeoKind; args: any[] }> = ({ kind, args }) => {
    switch (kind) {
        case 'box':    return <boxGeometry args={args as any} />;
        case 'cyl':    return <cylinderGeometry args={args as any} />;
        case 'torus':  return <torusGeometry args={args as any} />;
        case 'sphere': return <sphereGeometry args={args as any} />;
    }
};

/** Outline (inverted hull) + toon fill. The cartoon building block. */
const Shape: React.FC<ShapeProps> = ({
    kind, geoArgs, position = [0,0,0], rotation = [0,0,0], scale = [1,1,1], toon, outline = 0.09, castShadow = true,
}) => {
    const toonMat = useMemo(() => createToonMaterial(toon), [JSON.stringify(toon)]);
    const outMat  = useMemo(() => outline > 0 ? createOutlineMaterial(outline, OUTLINE) : null, [outline]);
    return (
        <group position={position} rotation={rotation as any} scale={scale as any}>
            {outMat && (
                <mesh>
                    <Geo kind={kind} args={geoArgs} />
                    <primitive object={outMat} attach="material" />
                </mesh>
            )}
            <mesh castShadow={castShadow}>
                <Geo kind={kind} args={geoArgs} />
                <primitive object={toonMat} attach="material" />
            </mesh>
        </group>
    );
};

// ─── Portal ring (blue / orange glowing oval) ────────────────────────────────
const Portal: React.FC<{ position: [number,number,number]; rotation?: [number,number,number]; color: string }> = ({
    position, rotation = [0,0,0], color,
}) => {
    return (
        <group position={position} rotation={rotation as any} scale={[1, 1.5, 1]}>
            {/* outer ring */}
            <Shape kind="torus" geoArgs={[1.0, 0.12, 12, 40]} toon={{
                color, emissive: color, emissiveStrength: 2.4, rimColor: color, rimStrength: 1.2, bands: 2,
            }} outline={0.06} castShadow={false} />
            {/* swirling inner disc */}
            <mesh position={[0,0,-0.02]}>
                <circleGeometry args={[0.95, 32]} />
                <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};

// ─── Aperture logo (cartoon) ─────────────────────────────────────────────────
const ApertureLogo: React.FC<{ position: [number,number,number]; rotation?: [number,number,number]; r?: number }> = ({
    position, rotation = [0,0,0], r = 1.4,
}) => (
    <group position={position} rotation={rotation as any}>
        <Shape kind="torus" geoArgs={[r, 0.08, 10, 40]}        toon={{ color: '#ffffff', rimStrength: 0.9, bands: 2 }} outline={0.05} castShadow={false} />
        <Shape kind="torus" geoArgs={[r*0.5, 0.06, 10, 32]}    toon={{ color: '#ffffff', rimStrength: 0.9, bands: 2 }} outline={0.05} castShadow={false} />
        {Array.from({ length: 6 }).map((_, i) => (
            <Shape key={i} kind="box" geoArgs={[r*0.5, 0.16, 0.04]}
                position={[Math.cos((i/6)*Math.PI*2)*r*0.74, Math.sin((i/6)*Math.PI*2)*r*0.74, 0]}
                rotation={[0, 0, (i/6)*Math.PI*2]}
                toon={{ color: '#ffffff', rimStrength: 0.6, bands: 2 }} outline={0.03} castShadow={false} />
        ))}
    </group>
);

// ─── Companion cube (cartoon) ────────────────────────────────────────────────
const CompanionCube: React.FC<{ position: [number,number,number]; scale?: number }> = ({ position, scale = 1 }) => {
    const ref = useRef<THREE.Group>(null);
    useFrame((s) => {
        if (ref.current) {
            ref.current.rotation.y = s.clock.elapsedTime * 0.6;
            ref.current.position.y = position[1] + Math.sin(s.clock.elapsedTime * 1.6) * 0.12;
        }
    });
    return (
        <group ref={ref} position={position} scale={[scale,scale,scale]}>
            <Shape kind="box" geoArgs={[1,1,1]} toon={{ color: '#d8dde4', shadow: '#7a8290', rimStrength: 0.7 }} outline={0.08} />
            {/* corner nubs */}
            {[[-.5,-.5,-.5],[.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5]].map(([x,y,z],i)=>(
                <Shape key={i} kind="box" geoArgs={[0.2,0.2,0.2]} position={[x*0.5,y*0.5,z*0.5]}
                    toon={{ color: '#aab2bd', shadow: '#5a6470', rimStrength: 0.5 }} outline={0.04} />
            ))}
            {/* pink heart faces */}
            {([[0,0,0.52,0,0,0],[0,0,-0.52,0,Math.PI,0],[0,0.52,0,-Math.PI/2,0,0],[0,-0.52,0,Math.PI/2,0,0],[0.52,0,0,0,Math.PI/2,0],[-0.52,0,0,0,-Math.PI/2,0]] as number[][]).map((d,i)=>(
                <mesh key={i} position={[d[0],d[1],d[2]]} rotation={[d[3],d[4],d[5]]}>
                    <circleGeometry args={[0.2, 5]} />
                    <meshBasicMaterial color="#ff5fa0" side={THREE.FrontSide} />
                </mesh>
            ))}
        </group>
    );
};

// ─── Sky gradient (clean interior void) ──────────────────────────────────────
const SKY_VS = /* glsl */`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FS = /* glsl */`
  varying vec3 vP;
  void main(){
    float t = clamp((normalize(vP).y + 0.25)/1.25, 0.0, 1.0);
    vec3 lo = vec3(0.62, 0.68, 0.76);   // grey horizon
    vec3 hi = vec3(0.88, 0.92, 0.97);   // bright white-grey top
    gl_FragColor = vec4(mix(lo, hi, t), 1.0);
  }
`;

// ─── Platform colors (Portal cartoon) ────────────────────────────────────────
const PLAT_TOON: ToonOpts[] = [
    { color: PANEL, shadow: PANEL_SHADOW, seams: 4, seamColor: PANEL_SEAM, rimStrength: 0.5 },   // start
    { color: PANEL, shadow: PANEL_SHADOW, seams: 2, seamColor: PANEL_SEAM, rimStrength: 0.6 },
    { color: PANEL, shadow: PANEL_SHADOW, seams: 2, seamColor: PANEL_SEAM, rimStrength: 0.6 },
    { color: PANEL, shadow: PANEL_SHADOW, seams: 2, seamColor: PANEL_SEAM, rimStrength: 0.6 },
    // moving = hard-light bridge (blue glow)
    { color: '#bfe9ff', shadow: '#5aa8d8', emissive: PORTAL_BLUE, emissiveStrength: 0.9, rimColor: PORTAL_BLUE, rimStrength: 1.4, bands: 2 },
    // goal panel
    { color: PANEL, shadow: PANEL_SHADOW, seams: 3, seamColor: PANEL_SEAM, rimStrength: 0.7 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export const Floor3Environment: React.FC = () => {
    const movingRef = useRef<THREE.Group>(null);
    useFrame((s) => {
        const x = Math.sin(s.clock.elapsedTime * 0.9) * F3_MOVE_AMP;
        f3MovingX.current = x;
        if (movingRef.current) movingRef.current.position.x = x;
    });

    const lastIdx = F3_PLATFORMS.length - 1;

    return (
        <group>
            {/* Sky / interior void */}
            <color attach="background" args={['#cdd6df']} />
            <mesh>
                <sphereGeometry args={[90, 16, 10]} />
                <shaderMaterial vertexShader={SKY_VS} fragmentShader={SKY_FS} side={THREE.BackSide} depthWrite={false} />
            </mesh>

            {/* Lighting — bright, directional key matches KEY_LIGHT_DIR */}
            <ambientLight intensity={0.7} color="#e8eef6" />
            <directionalLight position={[-6, 14, 8]} intensity={1.8} color="#fff6e0" castShadow />
            <hemisphereLight args={['#dce8f6', '#3a4250', 0.5]} />
            {/* portal accent fills */}
            <pointLight position={[0, 5, 13.5]} intensity={2.2} distance={14} decay={2} color={PORTAL_BLUE} />
            <pointLight position={[0, 7, 17.5]} intensity={1.6} distance={12} decay={2} color={PORTAL_ORNG} />

            {/* Void abyss */}
            <mesh rotation={[-Math.PI/2,0,0]} position={[0,-16,6]}>
                <planeGeometry args={[120,120]} />
                <meshBasicMaterial color="#0a0e18" />
            </mesh>
            <pointLight position={[0,-9,8]} intensity={1.0} distance={30} decay={2} color="#10204a" />

            {/* ── Background panel walls (Aperture chamber feel) ──────────── */}
            {/* Back wall */}
            <Shape kind="box" geoArgs={[30, 18, 0.6]} position={[0, 5, 22]}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 9, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0.12} castShadow={false} />
            {/* Side walls */}
            <Shape kind="box" geoArgs={[0.6, 18, 36]} position={[-15, 5, 6]}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 12, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0.12} castShadow={false} />
            <Shape kind="box" geoArgs={[0.6, 18, 36]} position={[15, 5, 6]}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 12, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0.12} castShadow={false} />
            {/* A few dark accent panels on the back wall */}
            {[[-8,9],[8,9],[-8,3],[8,3]].map(([x,y],i)=>(
                <Shape key={i} kind="box" geoArgs={[3.6, 3.6, 0.3]} position={[x, y, 21.6]}
                    toon={{ color: DARKPANEL, shadow: DARK_SHADOW, rimStrength: 0.4 }} outline={0.06} castShadow={false} />
            ))}

            {/* ── Portals on the side walls ───────────────────────────────── */}
            <Portal position={[-14.6, 3.5, 2]}  rotation={[0, Math.PI/2, 0]}  color={PORTAL_BLUE} />
            <Portal position={[14.6, 4.0, 8]}   rotation={[0, -Math.PI/2, 0]} color={PORTAL_ORNG} />

            {/* ── Platforms ───────────────────────────────────────────────── */}
            {F3_PLATFORMS.map((p, i) => {
                const cy = p.topY - p.h / 2;
                const w = p.hw * 2, d = p.hd * 2;
                const isStart = i === 0;
                const isGoal  = i === lastIdx;

                const body = (
                    <>
                        <Shape kind="box" geoArgs={[w, p.h, d]} position={[0, cy, 0]}
                            toon={PLAT_TOON[i]} outline={isStart ? 0 : 0.1} />
                        {/* glowing portal-blue edge trim */}
                        {!isStart && (
                            <Shape kind="box" geoArgs={[w + 0.06, 0.08, d + 0.06]} position={[0, p.topY - 0.04, 0]}
                                toon={{ color: PORTAL_BLUE, emissive: PORTAL_BLUE, emissiveStrength: 2.6, bands: 1 }} outline={0} castShadow={false} />
                        )}
                        {/* goal extras */}
                        {isGoal && <ApertureLogo position={[0, p.topY + 3.2, d/2 - 0.1]} r={1.4} />}
                        {isGoal && <CompanionCube position={[0, p.topY + 1.0, 0]} scale={0.9} />}
                        {isGoal && (
                            <Shape kind="box" geoArgs={[0.12, 3.4, 0.12]} position={[-1.9, p.topY + 1.7, -1.9]}
                                toon={{ color: '#e8e8e8', rimStrength: 0.5 }} outline={0.04} />
                        )}
                        {isGoal && (
                            <Shape kind="box" geoArgs={[1.0, 0.6, 0.05]} position={[-1.45, p.topY + 3.1, -1.9]}
                                toon={{ color: PORTAL_ORNG, emissive: PORTAL_ORNG, emissiveStrength: 1.4, rimColor: PORTAL_ORNG, rimStrength: 1.0, bands: 2 }} outline={0.04} />
                        )}
                    </>
                );

                if (p.moving) {
                    return <group key={i} ref={movingRef} position={[p.cx, 0, p.cz]}>{body}</group>;
                }
                return <group key={i} position={[p.cx, 0, p.cz]}>{body}</group>;
            })}

            {/* ── Floating accent panels for vertical depth ───────────────── */}
            {[[-9, 11, 4],[9, 13, 9],[-7, 9, 14]].map(([x,y,z],i)=>(
                <Shape key={i} kind="box" geoArgs={[2.4, 2.4, 0.4]} position={[x, y, z]}
                    rotation={[0, (i-1)*0.4, 0.1*i]}
                    toon={{ color: i%2 ? DARKPANEL : PANEL, shadow: i%2 ? DARK_SHADOW : PANEL_SHADOW, rimStrength: 0.6 }} outline={0.06} castShadow={false} />
            ))}

            {/* Elevator facade */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={5} width={10} />
            </group>
        </group>
    );
};

export default Floor3Environment;
