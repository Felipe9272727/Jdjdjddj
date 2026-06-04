/**
 * CartoonIntro3D.tsx — the "everything turns cartoon" intro for Floor 3, now
 * rendered IN the 3D scene (not a flat DOM overlay). It mounts inside the
 * Canvas and pins a little viewmodel rig to the camera:
 *
 *   • a 3D cream IRIS that wipes open onto the freshly-cartoon Floor 3, holds,
 *     then wipes closed + back open to hand off to gameplay (classic 1930s
 *     iris transition, done with real geometry so it lives in the world);
 *   • two chunky rubber-hose GLOVES (toon-shaded + inverted-hull ink outline)
 *     that POP into frame one after the other — "puck… puck!" — spring-scaling
 *     with a little wobble, clap together, wave, then drop away.
 *
 * Audio is file-based (cartoonAudio.ts) and routed through the shared master
 * bus so the SFX obey mute + the volume slider. The DOM side (CartoonIntro.tsx)
 * is reduced to just the wobbly title, driven by the `onStage` callback here so
 * the two stay in lock-step off this single timeline.
 */

import { useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createToonMaterial } from './cartoonToon';
import { playCartoonSfx } from './cartoonAudio';

const INK = '#0a0712';
const CREAM = '#f4ecda';

// ── A rubber-hose glove built from primitives (palm + 4 fingers + thumb + cuff).
// Local space: fingers point +Y, back of hand faces +Z (toward the camera).
type Part = {
    geo: 'sphere' | 'capsule' | 'cyl';
    args: number[];
    pos: [number, number, number];
    rot?: [number, number, number];
    scale?: [number, number, number];
};
const GLOVE_PARTS: Part[] = [
    // palm — squashed sphere
    { geo: 'sphere', args: [0.42, 20, 16], pos: [0, 0, 0], scale: [1.15, 1.0, 0.62] },
    // four fingers (capsule = radius, length)
    { geo: 'capsule', args: [0.115, 0.34], pos: [-0.27, 0.5,  0.02] },
    { geo: 'capsule', args: [0.12,  0.40], pos: [-0.09, 0.56, 0.02] },
    { geo: 'capsule', args: [0.12,  0.36], pos: [ 0.10, 0.54, 0.02] },
    { geo: 'capsule', args: [0.11,  0.28], pos: [ 0.27, 0.46, 0.02] },
    // thumb — swung out to the side
    { geo: 'capsule', args: [0.13, 0.26], pos: [-0.43, 0.06, 0.04], rot: [0, 0, 0.95] },
    // cuff — tapered band at the wrist
    { geo: 'cyl', args: [0.30, 0.40, 0.30, 20], pos: [0, -0.46, 0], scale: [1.1, 1, 0.7] },
];

function PartMesh({ part, material, renderOrder }: { part: Part; material: THREE.Material; renderOrder: number }) {
    return (
        <mesh
            position={part.pos}
            rotation={part.rot ?? [0, 0, 0]}
            scale={part.scale ?? [1, 1, 1]}
            material={material}
            renderOrder={renderOrder}
            frustumCulled={false}
        >
            {part.geo === 'sphere'  && <sphereGeometry  args={part.args as [number, number, number]} />}
            {part.geo === 'capsule' && <capsuleGeometry args={[part.args[0], part.args[1], 6, 16]} />}
            {part.geo === 'cyl'     && <cylinderGeometry args={part.args as [number, number, number, number]} />}
        </mesh>
    );
}

// One glove = an ink-outline shell (drawn first) under the white toon fill.
function Glove({ fillMat, outlineMat, flip }: { fillMat: THREE.Material; outlineMat: THREE.Material; flip?: boolean }) {
    return (
        <group scale={flip ? [-1, 1, 1] : [1, 1, 1]}>
            {GLOVE_PARTS.map((p, i) => <PartMesh key={`o${i}`} part={p} material={outlineMat} renderOrder={10} />)}
            {GLOVE_PARTS.map((p, i) => <PartMesh key={`f${i}`} part={p} material={fillMat}    renderOrder={11} />)}
        </group>
    );
}

interface Props {
    audioCtx: AudioContext | null;
    busRef: MutableRefObject<AudioNode | null>;
    onStage: (stage: number) => void;
    onDone: () => void;
}

export default function CartoonIntro3D({ audioCtx, busRef, onStage, onDone }: Props) {
    const { camera } = useThree();
    const root  = useRef<THREE.Group>(null);
    const leftRef  = useRef<THREE.Group>(null);
    const rightRef = useRef<THREE.Group>(null);
    const irisRef  = useRef<THREE.Mesh>(null);

    const tRef = useRef(0);
    const fired = useRef<Record<string, boolean>>({});
    const stageRef = useRef(0);
    const doneRef = useRef(false);

    // Materials: white toon fill + a depth-test-off ink outline shell. HUD-style
    // (always in front of scene geometry), so they read as the player's own hands.
    const { fillMat, outlineMat, irisMat } = useMemo(() => {
        const fill = createToonMaterial({
            color: '#f7f1e2', shadow: '#cdbfa0', light: '#fffaf0',
            bands: 2, ambient: 0.34, rimColor: '#ffffff', rimStrength: 0.5, rimPower: 2.4,
            specColor: '#ffffff', specThreshold: 0.9, shininess: 24,
        });
        fill.depthTest = false; fill.depthWrite = false;

        const outline = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: { uThickness: { value: 0.06 } },
            vertexShader: `
                uniform float uThickness;
                void main() {
                    vec3 p = position + normalize(normal) * uThickness;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                }`,
            fragmentShader: `void main() { gl_FragColor = vec4(0.039, 0.027, 0.07, 1.0); }`,
        });
        outline.depthTest = false; outline.depthWrite = false;

        // Iris: a camera-facing cream plane with a growing circular cutout. A
        // shader (not a scaled ring) so the cream surround ALWAYS covers the
        // frame while only the central hole opens — a real 1930s iris wipe.
        const iris = new THREE.ShaderMaterial({
            transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
            uniforms: { uRadius: { value: 0 }, uColor: { value: new THREE.Color(CREAM) } },
            vertexShader: `
                varying vec2 vP;
                void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                uniform float uRadius; uniform vec3 uColor; varying vec2 vP;
                void main() {
                    float d = length(vP);
                    float a = smoothstep(uRadius - 0.02, uRadius + 0.02, d); // hole inside, cream outside
                    if (a < 0.001) discard;
                    gl_FragColor = vec4(uColor, a);
                }`,
        });
        return { fillMat: fill, outlineMat: outline, irisMat: iris };
    }, []);

    // Plane that always over-covers the frustum at the iris depth (~0.45). 4×4
    // world units there is far larger than the visible ~1×0.7, so the cream
    // surround never reveals an edge at any aspect ratio.
    const irisGeo = useMemo(() => new THREE.PlaneGeometry(4, 4), []);

    const setStage = (n: number) => { if (n > stageRef.current) { stageRef.current = n; onStage(n); } };
    const sfx = (name: Parameters<typeof playCartoonSfx>[1], opts: Parameters<typeof playCartoonSfx>[2] = {}) => {
        if (audioCtx) playCartoonSfx(audioCtx, name, { ...opts, destination: busRef.current ?? undefined });
    };
    const once = (key: string, fn: () => void) => { if (!fired.current[key]) { fired.current[key] = true; fn(); } };

    useFrame((_s, dt) => {
        const g = root.current;
        if (!g) return;
        const t = (tRef.current += Math.min(dt, 0.033));

        // Pin the rig to the camera.
        g.position.copy(camera.position);
        g.quaternion.copy(camera.quaternion);

        // ── 3D iris (cream wipe). p: 0 = covered, 1 = clear. ──
        //   0.00→0.55 open · hold · 3.55→4.05 close · 4.05→4.60 open clean.
        let p: number;
        if (t < 0.55)      p = t / 0.55;
        else if (t < 3.55) p = 1;
        else if (t < 4.05) p = 1 - (t - 3.55) / 0.5;
        else if (t < 4.60) p = (t - 4.05) / 0.55;
        else               p = 1;
        const pe = p * p * (3 - 2 * p);                 // smoothstep
        // Grow the hole until it clears the frame (radius ~1.05 > screen diagonal
        // at this depth for any reasonable aspect). p=0 → fully cream.
        irisMat.uniforms.uRadius.value = pe * 1.15;

        // ── Glove pop choreography (spring-scale + wobble). ──
        const pop = (ref: RefObject<THREE.Group | null>, start: number, baseRot: number) => {
            const grp = ref.current;
            if (!grp) return;
            const a = t - start;
            if (a < 0) { grp.visible = false; return; }
            grp.visible = true;
            // Spring overshoot 0→1.12→1 over ~0.45s, then settle.
            let s: number;
            if (a < 0.45) {
                const u = a / 0.45;
                s = u < 0.6 ? (u / 0.6) * 1.12 : 1.12 - ((u - 0.6) / 0.4) * 0.12;
            } else s = 1;
            // Pop rises from below.
            const rise = a < 0.45 ? (1 - a / 0.45) * 0.22 : 0;
            // Gentle idle wobble once settled; a clap nudge at t≈1.4.
            const idle = Math.sin(t * 2.4 + (baseRot > 0 ? 1.5 : 0)) * 0.05;
            const clap = (t > 1.35 && t < 1.65) ? Math.sin((t - 1.35) / 0.3 * Math.PI) * 0.18 : 0;
            grp.scale.setScalar(0.42 * s);
            grp.position.y = -0.34 - rise;
            grp.position.x = baseRot > 0 ? 0.30 - clap : -0.30 + clap;
            grp.rotation.z = baseRot + idle;
            // Drop away at the end.
            if (t > 3.4) { const d = Math.min(1, (t - 3.4) / 0.4); grp.position.y -= d * 0.9; grp.scale.setScalar(0.42 * s * (1 - d)); }
        };
        pop(leftRef, 0.55, -0.32);
        pop(rightRef, 0.95, 0.32);

        // ── SFX + stage beats (each fires once). ──
        if (t >= 0.55) once('p1', () => { sfx('puck', { gain: 0.95 }); setStage(1); });
        if (t >= 0.95) once('p2', () => { sfx('puck', { gain: 0.95, rate: 1.12 }); setStage(2); });
        if (t >= 1.40) once('bo', () => { sfx('boing', { gain: 0.7 }); setStage(3); });
        if (t >= 1.90) once('ta', () => { sfx('tada', { gain: 0.8 }); setStage(4); });
        if (t >= 3.55) once('tr', () => { sfx('transform', { gain: 0.5 }); setStage(5); });
        if (t >= 4.60 && !doneRef.current) { doneRef.current = true; onDone(); }
    });

    return (
        <group ref={root}>
            {/* cream iris, parked just in front of the lens */}
            <mesh ref={irisRef} geometry={irisGeo} material={irisMat} position={[0, 0, -0.45]} renderOrder={20} frustumCulled={false} />
            {/* the two gloves */}
            <group ref={leftRef}  position={[-0.30, -0.34, -0.7]}>
                <Glove fillMat={fillMat} outlineMat={outlineMat} />
            </group>
            <group ref={rightRef} position={[0.30, -0.34, -0.7]}>
                <Glove fillMat={fillMat} outlineMat={outlineMat} flip />
            </group>
        </group>
    );
}
