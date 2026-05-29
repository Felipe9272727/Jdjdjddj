/**
 * Floor3.tsx — "Câmara de Testes Cartoon" — Portal-inspired obby.
 *
 * Rendering stack (the "extra language" layered on top of raw three.js):
 *   • @react-three/drei  → <RoundedBox> for smooth, beveled geometry (kills the
 *     PS1 hard-edge look) and <Outlines> for a battle-tested inverted-hull
 *     cartoon outline with creased normals + screen-space thickness (no more
 *     z-fighting from the old hand-rolled double-mesh hull).
 *   • cartoonToon.ts     → the Guilty-Gear-class toon FILL shader (banded
 *     colored-shadow diffuse + Fresnel rim + hard specular).
 *
 * Toon materials are cached as shared singletons keyed by their options, so a
 * material is built once and reused across every identical surface — this is
 * what fixes the flickering/broken-material bug from the per-instance useMemo.
 *
 * Platform layout / physics live in constants.ts (F3_PLATFORMS, f3MovingX) and
 * Player.tsx; this file is purely visual + the moving-platform animation.
 */

import React, { useRef, useEffect, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import {
    platforms as f3Platforms, f3PlayerZ, tick as f3Tick, reset as f3Reset,
    validateNoOverlaps, type F3Plat,
} from './f3Parkour';
import { createToonMaterial, type ToonOpts } from './cartoonToon';

// ─── Palette (Aperture cartoon) ──────────────────────────────────────────────
const PANEL        = '#eef1f4';
const PANEL_SHADOW = '#9fb0c4';
const PANEL_SEAM   = '#c2ccd6';
const DARKPANEL    = '#2a3340';
const DARK_SHADOW  = '#161c26';
const PORTAL_BLUE  = '#19a8ff';
const PORTAL_ORNG  = '#ff7a18';
const OUTLINE      = '#0a0712';

// ─── Toon material cache (shared singletons) ─────────────────────────────────
// One material per unique option-set. Stable identity → no recreation, no
// flicker, far fewer GPU programs.
const _toonCache = new Map<string, THREE.ShaderMaterial>();
function toonMat(opts: ToonOpts): THREE.ShaderMaterial {
    const key = JSON.stringify(opts);
    let m = _toonCache.get(key);
    if (!m) { m = createToonMaterial(opts); _toonCache.set(key, m); }
    return m;
}

// ─── Cartoon building blocks ─────────────────────────────────────────────────
interface BoxProps {
    args: [number, number, number];
    position?: [number, number, number];
    rotation?: [number, number, number];
    toon: ToonOpts;
    outline?: number;          // 0 = no outline (screen-space px-ish thickness)
    radius?: number;           // corner rounding
    castShadow?: boolean;
}

/** Rounded, toon-shaded box with a drei screen-space outline. */
const RBox: React.FC<BoxProps> = ({
    args, position = [0,0,0], rotation = [0,0,0], toon, outline = 1.5, radius = 0.1, castShadow = true,
}) => {
    const mat = toonMat(toon);
    const minDim = Math.min(args[0], args[1], args[2]);
    const r = Math.min(radius, minDim * 0.42);   // clamp so thin panels don't collapse
    return (
        <RoundedBox
            args={args} radius={r} smoothness={4} bevelSegments={3} creaseAngle={0.5}
            position={position} rotation={rotation as any} castShadow={castShadow}
        >
            <primitive object={mat} attach="material" />
            {outline > 0 && (
                <Outlines thickness={outline * 0.03} color={OUTLINE} transparent={false} angle={0.4} />
            )}
        </RoundedBox>
    );
};

type GeoKind = 'cyl' | 'torus' | 'sphere';
interface GShapeProps {
    kind: GeoKind;
    args: any[];
    position?: [number, number, number];
    rotation?: [number, number, number];
    toon: ToonOpts;
    outline?: number;
    castShadow?: boolean;
}

/** Toon-shaded round primitive (torus/cyl/sphere) with a drei outline. */
const GShape: React.FC<GShapeProps> = ({
    kind, args, position = [0,0,0], rotation = [0,0,0], toon, outline = 1.2, castShadow = true,
}) => {
    const mat = toonMat(toon);
    return (
        <mesh position={position} rotation={rotation as any} castShadow={castShadow}>
            {kind === 'cyl'    && <cylinderGeometry args={args as any} />}
            {kind === 'torus'  && <torusGeometry args={args as any} />}
            {kind === 'sphere' && <sphereGeometry args={args as any} />}
            <primitive object={mat} attach="material" />
            {outline > 0 && (
                <Outlines thickness={outline * 0.03} color={OUTLINE} transparent={false} angle={0.4} />
            )}
        </mesh>
    );
};

// ─── Portal ring (blue / orange glowing oval) ────────────────────────────────
const Portal: React.FC<{ position: [number,number,number]; rotation?: [number,number,number]; color: string }> = ({
    position, rotation = [0,0,0], color,
}) => (
    <group position={position} rotation={rotation as any} scale={[1, 1.5, 1]}>
        <GShape kind="torus" args={[1.0, 0.12, 16, 48]} toon={{
            color, emissive: color, emissiveStrength: 2.4, rimColor: color, rimStrength: 1.2, bands: 2,
        }} outline={0.8} castShadow={false} />
        {/* swirling inner disc */}
        <mesh position={[0,0,-0.02]}>
            <circleGeometry args={[0.92, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
    </group>
);

// ─── Aperture logo (cartoon) ─────────────────────────────────────────────────
const ApertureLogo: React.FC<{ position: [number,number,number]; rotation?: [number,number,number]; r?: number }> = ({
    position, rotation = [0,0,0], r = 1.4,
}) => (
    <group position={position} rotation={rotation as any}>
        <GShape kind="torus" args={[r, 0.08, 12, 48]}      toon={{ color: '#ffffff', rimStrength: 0.9, bands: 2 }} outline={1} castShadow={false} />
        <GShape kind="torus" args={[r*0.5, 0.06, 12, 40]}  toon={{ color: '#ffffff', rimStrength: 0.9, bands: 2 }} outline={1} castShadow={false} />
        {Array.from({ length: 6 }).map((_, i) => (
            <RBox key={i} args={[r*0.5, 0.16, 0.04]}
                position={[Math.cos((i/6)*Math.PI*2)*r*0.74, Math.sin((i/6)*Math.PI*2)*r*0.74, 0]}
                rotation={[0, 0, (i/6)*Math.PI*2]}
                toon={{ color: '#ffffff', rimStrength: 0.6, bands: 2 }} outline={0} radius={0.015} castShadow={false} />
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
            <RBox args={[1,1,1]} radius={0.14} toon={{ color: '#d8dde4', shadow: '#7a8290', rimStrength: 0.7 }} outline={1.5} />
            {/* corner nubs */}
            {[[-.5,-.5,-.5],[.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5]].map(([x,y,z],i)=>(
                <RBox key={i} args={[0.2,0.2,0.2]} position={[x*0.5,y*0.5,z*0.5]} radius={0.05}
                    toon={{ color: '#aab2bd', shadow: '#5a6470', rimStrength: 0.5 }} outline={1} />
            ))}
            {/* pink heart faces */}
            {([[0,0,0.52,0,0,0],[0,0,-0.52,0,Math.PI,0],[0,0.52,0,-Math.PI/2,0,0],[0,-0.52,0,Math.PI/2,0,0],[0.52,0,0,0,Math.PI/2,0],[-0.52,0,0,0,-Math.PI/2,0]] as number[][]).map((d,i)=>(
                <mesh key={i} position={[d[0],d[1],d[2]]} rotation={[d[3],d[4],d[5]]}>
                    <circleGeometry args={[0.2, 6]} />
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

// ─── Cartoon platform palette (Spyro-bright, hard 2-band cel) ────────────────
// One vibrant hue per pool slot (f3Parkour assigns plat.palette = id % 6). The
// bold colored shadow + white rim + thick outline is the "BEM estilizado"
// cartoon look. palette === -1 → the neutral Aperture landing panel.
const CARTOON_PALETTE: ToonOpts[] = [
    { color: '#ff5d73', shadow: '#aa2a40', bands: 2, rimColor: '#ffe3e9', rimStrength: 1.1, specThreshold: 0.7 }, // coral
    { color: '#21c7c9', shadow: '#0e6f72', bands: 2, rimColor: '#dffcfc', rimStrength: 1.1, specThreshold: 0.7 }, // teal
    { color: '#ffd23f', shadow: '#b87d0c', bands: 2, rimColor: '#fff6d6', rimStrength: 1.1, specThreshold: 0.7 }, // gold
    { color: '#9b5de5', shadow: '#522a9c', bands: 2, rimColor: '#efe2ff', rimStrength: 1.1, specThreshold: 0.7 }, // purple
    { color: '#7ee787', shadow: '#2f8c46', bands: 2, rimColor: '#e6ffe9', rimStrength: 1.1, specThreshold: 0.7 }, // lime
    { color: '#4dabf7', shadow: '#175e9c', bands: 2, rimColor: '#e0f1ff', rimStrength: 1.1, specThreshold: 0.7 }, // sky
];
const LANDING_TOON: ToonOpts = { color: PANEL, shadow: PANEL_SHADOW, seams: 4, seamColor: PANEL_SEAM, rimStrength: 0.5, bands: 3 };

function platToon(p: F3Plat): ToonOpts {
    if (p.palette < 0) return LANDING_TOON;
    if (p.moving) {
        // hard-light bridge keeps the energy-blue glow, but cel-banded
        return { color: '#bfe9ff', shadow: '#3f8fc4', emissive: PORTAL_BLUE, emissiveStrength: 1.0, rimColor: PORTAL_BLUE, rimStrength: 1.5, bands: 2 };
    }
    return CARTOON_PALETTE[p.palette % CARTOON_PALETTE.length];
}

// ─── One platform in the endless pool ────────────────────────────────────────
// Sized from the platform record (NOT scaled — avoids outline/bevel distortion).
// Re-mounts only when the pool recycles (keyed by stable id in the parent).
const PlatformView = React.forwardRef<THREE.Group, { plat: F3Plat }>(({ plat }, ref) => {
    const w = plat.hw * 2, d = plat.hd * 2;
    const cy = plat.topY - plat.h / 2;
    const big = plat.palette < 0;          // the Aperture landing
    const trimColor = plat.palette < 0 ? PORTAL_BLUE
        : (CARTOON_PALETTE[plat.palette % CARTOON_PALETTE.length].color as string);
    return (
        <group ref={ref} position={[plat.bx, 0, plat.cz]}>
            <RBox args={[w, plat.h, d]} position={[0, cy, 0]} radius={big ? 0.14 : 0.12}
                toon={platToon(plat)} outline={big ? 0 : 2.2} />
            {/* glowing edge trim in the platform's own hue — cartoon pop */}
            {!big && (
                <RBox args={[w + 0.05, 0.09, d + 0.05]} position={[0, plat.topY - 0.045, 0]} radius={0.03}
                    toon={{ color: trimColor, emissive: trimColor, emissiveStrength: 2.4, bands: 1 }} outline={0} castShadow={false} />
            )}
            {big && (
                <RBox args={[w + 0.06, 0.08, d + 0.06]} position={[0, plat.topY - 0.04, 0]} radius={0.03}
                    toon={{ color: PORTAL_BLUE, emissive: PORTAL_BLUE, emissiveStrength: 1.8, bands: 1 }} outline={0} castShadow={false} />
            )}
        </group>
    );
});
PlatformView.displayName = 'PlatformView';

// ─── Main ─────────────────────────────────────────────────────────────────────
export const Floor3Environment: React.FC<{ elevator?: boolean }> = ({ elevator = true }) => {
    // Build the endless course once on mount; tear nothing down (module state).
    useEffect(() => {
        f3Reset();
        if (import.meta.env?.DEV) {
            const c = validateNoOverlaps(f3Platforms);
            if (c.length) console.warn('[Floor3] platform overlaps detected:', c);
        }
    }, []);

    // Live group refs by platform id, so the single frame loop can drive the
    // moving bridges imperatively (no per-platform useFrame, correct ordering).
    const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
    // Re-render only when the pool recycles (rare — a few times/sec at most).
    const [, bump] = useReducer((n: number) => n + 1, 0);

    useFrame((s) => {
        const before = f3Platforms.length ? f3Platforms[0].id : -1;
        f3Tick(s.clock.elapsedTime, f3PlayerZ.current);
        // Animate moving bridges' live X onto their group transforms.
        for (const p of f3Platforms) {
            if (p.moving) { const g = groupRefs.current.get(p.id); if (g) g.position.x = p.x; }
        }
        // Detect a recycle (front id changed) and re-render the slot list.
        if ((f3Platforms.length ? f3Platforms[0].id : -1) !== before) bump();
    });

    return (
        <group>
            {/* Sky / interior void */}
            <color attach="background" args={['#cdd6df']} />
            <mesh>
                <sphereGeometry args={[90, 32, 16]} />
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
            {/* Walls: no outline — camera is inside them, outlines would show as giant black blobs */}
            <RBox args={[30, 18, 0.6]} position={[0, 5, 22]} radius={0.25}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 9, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0} castShadow={false} />
            <RBox args={[0.6, 18, 36]} position={[-15, 5, 6]} radius={0.25}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 12, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0} castShadow={false} />
            <RBox args={[0.6, 18, 36]} position={[15, 5, 6]} radius={0.25}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, seams: 12, seamColor: PANEL_SEAM, rimStrength: 0.3 }} outline={0} castShadow={false} />
            {/* Framed back-wall panels: a glowing cyan plate with a lighter
                inset face on top, leaving a bright border (Portal "screen" read) */}
            {[[-8,9],[8,9],[-8,3],[8,3]].map(([x,y],i)=>(
                <group key={i} position={[x, y, 21.2]}>
                    {/* glowing border plate */}
                    <RBox args={[3.9, 3.9, 0.16]} position={[0,0,0]} radius={0.12}
                        toon={{ color: PORTAL_BLUE, emissive: PORTAL_BLUE, emissiveStrength: 1.6, bands: 1 }} outline={0} castShadow={false} />
                    {/* inset screen face — self-lit so it reads even though it
                        faces away from the key light */}
                    <RBox args={[3.3, 3.3, 0.12]} position={[0,0,-0.16]} radius={0.08}
                        toon={{ color: '#adc6e0', shadow: '#8aa6c4', ambient: 0.6, emissive: '#2a4763', emissiveStrength: 0.8, rimColor: '#dcefff', rimStrength: 1.2, bands: 2 }} outline={0} castShadow={false} />
                </group>
            ))}

            {/* Ceiling with recessed glowing light strips (encloses the chamber) */}
            <RBox args={[30, 0.5, 36]} position={[0, 13.5, 6]} radius={0.1}
                toon={{ color: PANEL, shadow: PANEL_SHADOW, rimStrength: 0.2 }} outline={0} castShadow={false} />
            {[-6, 2, 10].map((z, i) => (
                <RBox key={i} args={[10, 0.16, 0.7]} position={[0, 13.0, z]} radius={0.05}
                    toon={{ color: '#fffbe8', emissive: '#fff2c4', emissiveStrength: 2.0, bands: 1 }} outline={0} castShadow={false} />
            ))}

            {/* Glowing trim strips where the walls meet the floor (sci-fi edge light) */}
            {([[-14.6, 6, [0.12, 0.16, 34]], [14.6, 6, [0.12, 0.16, 34]], [0, 21.7, [29, 0.16, 0.12]]] as [number,number,number[]][]).map(([x,z,s],i)=>(
                <RBox key={i} args={s as [number,number,number]} position={[x, 0.18, z]} radius={0.04}
                    toon={{ color: PORTAL_BLUE, emissive: PORTAL_BLUE, emissiveStrength: 1.8, bands: 1 }} outline={0} castShadow={false} />
            ))}

            {/* ── Portals on the side walls ───────────────────────────────── */}
            <Portal position={[-14.6, 3.5, 2]} rotation={[0, Math.PI/2, 0]}  color={PORTAL_BLUE} />
            <Portal position={[14.6, 4.0, 8]}  rotation={[0, -Math.PI/2, 0]} color={PORTAL_ORNG} />

            {/* ── Endless parkour pool ─────────────────────────────────────
                Rendered straight from the live recycling array (f3Parkour).
                Keyed by stable id so React reuses slots across recycles;
                moving bridges are driven imperatively in the frame loop. */}
            {f3Platforms.map((p) => (
                <PlatformView
                    key={p.id}
                    plat={p}
                    ref={(el) => {
                        if (el) groupRefs.current.set(p.id, el);
                        else groupRefs.current.delete(p.id);
                    }}
                />
            ))}

            {/* Companion cube + Aperture logo float over the landing as a
                welcome beacon (the climb is endless, so there's no goal tile). */}
            <ApertureLogo position={[0, 7.5, 20.5]} r={1.6} />
            <CompanionCube position={[5.5, 2.0, -4.5]} scale={0.9} />

            {/* ── Floating accent panels for vertical depth ───────────────── */}
            {[[-9, 11, 4],[9, 13, 9],[-7, 9, 14]].map(([x,y,z],i)=>(
                <RBox key={i} args={[2.4, 2.4, 0.4]} position={[x, y, z]} radius={0.14}
                    rotation={[0, (i-1)*0.4, 0.1*i]}
                    toon={{ color: i%2 ? DARKPANEL : PANEL, shadow: i%2 ? DARK_SHADOW : PANEL_SHADOW, rimStrength: 0.6 }} outline={1} castShadow={false} />
            ))}

            {/* Elevator facade */}
            {elevator && (
                <group position={[0, 0, -10]}>
                    <ElevatorFacade z={0} height={5} width={10} />
                </group>
            )}
        </group>
    );
};

export default Floor3Environment;
