/**
 * Floor7.tsx — THE PIRATE SHIP (Andar 7). The whole floor is driven by the
 * WebAssembly brain in Floor7Brain.ts (compiled from floor7.c + floor7_asm.s):
 * the ship's sea motion, the elevator vanishing, the captain who strides over
 * and gives the quest, the bucket pickup and the puddle-mopping all come out of
 * the WASM. This file only READS those numbers and renders Three.js meshes.
 *
 * Player rides the deck: each frame the player's world position is mapped into
 * the ship's local frame and fed to the brain, so cleaning stays aligned even
 * as the hull rolls on the swell.
 *
 * NOTE: partial level (by design) — once the deck is clean there's nothing left
 * to do and the elevator is gone, so there's no way out. f7_can_leave() === 0.
 */
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { Floor7Brain, F7_STATE, type F7Puddle } from './Floor7Brain';
import { Floor7Water } from './Floor7Water';

// warm low sun shared by the Sky, the key light and the water glitter
const SUN_POS: [number, number, number] = [18, 7, -22];
const SUN_DIR = new THREE.Vector3(...SUN_POS).normalize();

// ── shared per-mount handle so the DOM overlay can read the brain ──
export interface Floor7Handle {
    brain: Floor7Brain | null;
    interact: boolean;          // action held this frame
    dialogue: number;
    cleaned: number;
    npud: number;
    cleanPct: number;
    state: number;
}
export function useFloor7Handle(): React.MutableRefObject<Floor7Handle> {
    return useRef<Floor7Handle>({ brain: null, interact: false, dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0 });
}

// ── materials (module-scope, shared) ──
const M = {
    hull: new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.85 }),
    hullDk: new THREE.MeshStandardMaterial({ color: '#3f2817', roughness: 0.9 }),
    plank: new THREE.MeshStandardMaterial({ color: '#9b7748', roughness: 0.8 }),
    plankDk: new THREE.MeshStandardMaterial({ color: '#86653b', roughness: 0.85 }),
    rail: new THREE.MeshStandardMaterial({ color: '#6b4a2c', roughness: 0.8 }),
    mast: new THREE.MeshStandardMaterial({ color: '#7a5a36', roughness: 0.8 }),
    sail: new THREE.MeshStandardMaterial({ color: '#efe7d4', roughness: 0.95, side: THREE.DoubleSide, emissive: '#6b5f44', emissiveIntensity: 0.35 }),
    rope: new THREE.MeshStandardMaterial({ color: '#caa56a', roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9c2c8', roughness: 0.35, metalness: 0.7 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#5b3d22', roughness: 0.7 }),
    coat: new THREE.MeshStandardMaterial({ color: '#7a1f1f', roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: '#caa07a', roughness: 0.7 }),
    hat: new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.8 }),
    bucket: new THREE.MeshStandardMaterial({ color: '#7e5a33', roughness: 0.7 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#cfcabb', roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#2f6d86', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.6 }),
    puddle: new THREE.MeshStandardMaterial({ color: '#86b6c8', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.75 }),
    elev: new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.4, metalness: 0.5, transparent: true }),
    elevTrim: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.4, metalness: 0.6, transparent: true }),
};

// ── the static ship hull + deck + masts (no per-frame logic) ──
const ShipBody: React.FC = () => {
    // deck planks: a few long boards
    const planks = useMemo(() => {
        const arr: { x: number; m: THREE.Material }[] = [];
        for (let i = -3; i <= 3; i++) arr.push({ x: i * 0.84, m: i % 2 ? M.plank : M.plankDk });
        return arr;
    }, []);
    return (
        <group>
            {/* hull — a tapered tub */}
            <mesh position={[0, -0.85, 0]} material={M.hull}>
                <boxGeometry args={[6.2, 1.7, 15]} />
            </mesh>
            <mesh position={[0, -0.4, -8]} rotation={[0.5, 0, 0]} material={M.hull}>
                <boxGeometry args={[5.6, 1.7, 3]} />
            </mesh>
            <mesh position={[0, -0.2, 8]} rotation={[-0.35, 0, 0]} material={M.hull}>
                <boxGeometry args={[5.6, 1.9, 3]} />
            </mesh>
            {/* keel strake */}
            <mesh position={[0, -1.55, 0]} material={M.hullDk}>
                <boxGeometry args={[1.2, 0.5, 15.6]} />
            </mesh>
            {/* deck */}
            <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.plankDk}>
                <planeGeometry args={[6, 14.4]} />
            </mesh>
            {planks.map((p, i) => (
                <mesh key={i} position={[p.x, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} material={p.m}>
                    <planeGeometry args={[0.78, 14]} />
                </mesh>
            ))}
            {/* bulwarks (rails) around the deck */}
            {[-3.05, 3.05].map((x) => (
                <mesh key={x} position={[x, 0.45, 0]} material={M.rail}>
                    <boxGeometry args={[0.18, 0.9, 14.2]} />
                </mesh>
            ))}
            {[-7.1, 7.1].map((z) => (
                <mesh key={z} position={[0, 0.45, z]} material={M.rail}>
                    <boxGeometry args={[6.1, 0.9, 0.18]} />
                </mesh>
            ))}
            {/* main mast + yard + sail */}
            <group position={[0, 0, -1]}>
                <mesh position={[0, 3.4, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.16, 0.2, 6.8, 10]} />
                </mesh>
                <mesh position={[0, 5.2, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.08, 0.08, 4.6, 8]} />
                </mesh>
                <mesh position={[0, 4.0, 0.05]} material={M.sail}>
                    <planeGeometry args={[4.2, 2.6]} />
                </mesh>
            </group>
            {/* foremast */}
            <group position={[0, 0, 4]}>
                <mesh position={[0, 2.6, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.13, 0.16, 5.2, 10]} />
                </mesh>
                <mesh position={[0, 3.7, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.07, 0.07, 3.4, 8]} />
                </mesh>
                <mesh position={[0, 2.9, 0.05]} material={M.sail}>
                    <planeGeometry args={[3.0, 1.9]} />
                </mesh>
            </group>
            {/* helm (ship's wheel) at the stern */}
            <group position={[0, 0.7, -6.2]}>
                <mesh material={M.wheel}><torusGeometry args={[0.42, 0.06, 8, 18]} /></mesh>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} material={M.wheel}>
                        <boxGeometry args={[0.06, 1.0, 0.06]} />
                    </mesh>
                ))}
                <mesh material={M.metal}><cylinderGeometry args={[0.07, 0.07, 0.2, 8]} /></mesh>
            </group>
            {/* bowsprit */}
            <mesh position={[0, 0.7, 8.2]} rotation={[0.5, 0, 0]} material={M.mast}>
                <cylinderGeometry args={[0.1, 0.13, 3, 8]} />
            </mesh>
        </group>
    );
};

// ── the captain (stylized) — transform set per frame ──
const Captain = React.forwardRef<THREE.Group>((_, ref) => (
    <group ref={ref}>
        <mesh position={[0, 0.55, 0]} material={M.coat}><cylinderGeometry args={[0.26, 0.34, 1.1, 10]} /></mesh>
        <mesh position={[0, 1.25, 0]} material={M.skin}><sphereGeometry args={[0.22, 12, 10]} /></mesh>
        {/* tricorne hat */}
        <mesh position={[0, 1.45, 0]} material={M.hat}><cylinderGeometry args={[0.05, 0.34, 0.16, 12]} /></mesh>
        <mesh position={[0, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.hat}><torusGeometry args={[0.28, 0.06, 6, 14]} /></mesh>
        {/* arms */}
        <mesh position={[-0.32, 0.7, 0.05]} rotation={[0, 0, 0.3]} material={M.coat}><cylinderGeometry args={[0.08, 0.08, 0.7, 8]} /></mesh>
        <mesh position={[0.32, 0.7, 0.05]} rotation={[0, 0, -0.3]} material={M.coat}><cylinderGeometry args={[0.08, 0.08, 0.7, 8]} /></mesh>
        {/* belt */}
        <mesh position={[0, 0.35, 0]} material={M.hat}><cylinderGeometry args={[0.3, 0.3, 0.12, 10]} /></mesh>
    </group>
));
Captain.displayName = 'Captain';

interface Floor7Props {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    handleRef: React.MutableRefObject<Floor7Handle>;
}

export const Floor7Environment: React.FC<Floor7Props> = ({ playerPositionRef, handleRef }) => {
    const shipRef = useRef<THREE.Group>(null);
    const captainRef = useRef<THREE.Group>(null);
    const bucketRef = useRef<THREE.Group>(null);
    const elevatorRef = useRef<THREE.Group>(null);
    const puddleRefs = useRef<(THREE.Mesh | null)[]>([]);
    const brainRef = useRef<Floor7Brain | null>(null);
    const _local = useRef(new THREE.Vector3());
    const _pud = useRef<F7Puddle>({ x: 0, z: 0, r: 0, prog: 0 });
    const { scene } = useThree();

    // ocean sky + fog, restored when leaving the floor
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color('#9cc0d8');
        scene.fog = new THREE.Fog('#9cc0d8', 24, 70);
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);

    // build the brain once
    useEffect(() => {
        const b = new Floor7Brain();
        brainRef.current = b;
        handleRef.current.brain = b;
        handleRef.current.npud = b.npud;
        return () => { brainRef.current = null; handleRef.current.brain = null; };
    }, [handleRef]);

    useFrame((_, dt) => {
        const b = brainRef.current;
        const ship = shipRef.current;
        if (!b || !ship) return;

        // map player world pos into the ship's local frame, feed the brain
        ship.updateWorldMatrix(true, false);
        _local.current.copy(playerPositionRef.current);
        ship.worldToLocal(_local.current);
        b.tick(Math.min(dt, 0.05), _local.current.x, _local.current.y, _local.current.z, handleRef.current.interact);

        // ship rides the swell (heave + pitch + roll from the WASM)
        ship.position.y = b.heave();
        ship.rotation.x = b.pitch();
        ship.rotation.z = b.roll();

        // captain
        if (captainRef.current) {
            const c = b.captain();
            captainRef.current.position.set(c.x, c.bob, c.z);
            captainRef.current.rotation.y = c.face;
            captainRef.current.visible = b.elevFade() < 0.85; // appears as the lift fades
        }
        // bucket
        if (bucketRef.current) {
            const bu = b.bucket();
            bucketRef.current.position.set(bu.x, bu.held ? 0.5 : 0.18, bu.z);
            const glow = (b.state() === F7_STATE.FETCH) ? 0.5 + 0.5 * Math.sin(performance.now() / 200) : 0;
            (M.cloth as THREE.MeshStandardMaterial).emissive.setRGB(glow * 0.4, glow * 0.4, glow * 0.2);
        }
        // elevator dematerialises
        if (elevatorRef.current) {
            const f = b.elevFade();
            elevatorRef.current.visible = f > 0.01;
            elevatorRef.current.position.y = (1 - f) * 0.6;       // lifts as it fades
            elevatorRef.current.scale.setScalar(0.6 + f * 0.4);
            M.elev.opacity = f; M.elevTrim.opacity = f;
        }
        // puddles shrink + fade as they're mopped
        for (let i = 0; i < b.npud; i++) {
            const m = puddleRefs.current[i];
            if (!m) continue;
            const p = b.puddle(i, _pud.current);
            const s = (1 - p.prog) * p.r;
            m.scale.setScalar(Math.max(0.0001, s));
            m.position.set(p.x, 0.02, p.z);
            (m.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - p.prog);
            m.visible = p.prog < 0.995;
        }

        // publish a snapshot for the DOM overlay
        const h = handleRef.current;
        h.dialogue = b.dialogue(); h.cleaned = b.cleaned(); h.cleanPct = b.cleanPct(); h.state = b.state();
    });

    return (
        <group>
            {/* atmospheric sky with a warm low sun */}
            <Sky sunPosition={SUN_POS} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
            {/* light rig — warm key sun + cool sky fill */}
            <hemisphereLight args={['#dcebf7', '#46525a', 0.9]} />
            <directionalLight position={SUN_POS} intensity={2.2} color="#fff0d0" />
            <ambientLight intensity={0.18} color="#9fc0d8" />

            {/* the Gerstner-wave ocean */}
            <Floor7Water sunDir={SUN_DIR} />

            {/* the ship (sways) */}
            <group ref={shipRef}>
                <ShipBody />
                {/* the elevator the player rode in on — dematerialises */}
                <group ref={elevatorRef} position={[0, 0, 5.2]}>
                    <mesh position={[0, 1.2, 0]} material={M.elev}><boxGeometry args={[2.2, 2.4, 0.2]} /></mesh>
                    <mesh position={[-1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[0, 2.45, 0.6]} material={M.elevTrim}><boxGeometry args={[2.4, 0.16, 1.4]} /></mesh>
                </group>
                {/* captain */}
                <Captain ref={captainRef} />
                {/* bucket + cloth */}
                <group ref={bucketRef} position={[2.1, 0.18, -2.2]}>
                    <mesh material={M.bucket}><cylinderGeometry args={[0.16, 0.13, 0.3, 12]} /></mesh>
                    <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.metal}><torusGeometry args={[0.16, 0.02, 6, 14]} /></mesh>
                    <mesh position={[0.05, 0.2, 0.05]} rotation={[0.4, 0.3, 0]} material={M.cloth}><boxGeometry args={[0.22, 0.04, 0.18]} /></mesh>
                </group>
                {/* puddles */}
                {Array.from({ length: 6 }).map((_, i) => (
                    <mesh
                        key={i}
                        ref={(m) => { puddleRefs.current[i] = m; }}
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, 0.02, 0]}
                        material={M.puddle.clone()}
                    >
                        <circleGeometry args={[1, 20]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

// ── DOM overlay: captain dialogue + objective + clean HUD + interact button ──
const DIALOGUE: Record<number, string> = {
    1: 'Capitão: Ahá, um novo grumete! Antes de zarparmos de vez… o convés tá um brejo. Pega aquele balde com o pano e esfrega essas poças, marujo!',
    2: 'Objetivo: pegue o balde com o pano (perto do mastro).',
    3: 'Objetivo: esfregue todas as poças do convés.',
    4: 'Capitão: Bom trabalho, grumete! …agora senta e espera. Ainda não chegamos a lugar nenhum.',
};

export const Floor7Overlay: React.FC<{ handleRef: React.MutableRefObject<Floor7Handle> }> = ({ handleRef }) => {
    const [snap, setSnap] = useState({ dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0 });
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const h = handleRef.current;
            setSnap((s) => (s.dialogue !== h.dialogue || s.cleaned !== h.cleaned || Math.abs(s.cleanPct - h.cleanPct) > 0.01 || s.state !== h.state)
                ? { dialogue: h.dialogue, cleaned: h.cleaned, npud: h.npud, cleanPct: h.cleanPct, state: h.state } : s);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [handleRef]);

    // keyboard interact (E / Space) → handle.interact while held
    useEffect(() => {
        const dn = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = true; };
        const up = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = false; };
        window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
    }, [handleRef]);

    const txt = DIALOGUE[snap.dialogue];
    const cleaning = snap.state === F7_STATE.CLEAN;
    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 45, fontFamily: '"Source Sans 3","Segoe UI",sans-serif' }}>
            {txt && (
                <div style={{ position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom,0px) + 92px)', transform: 'translateX(-50%)', maxWidth: 'min(92vw, 640px)', background: 'rgba(20,14,8,0.86)', border: '1px solid rgba(202,165,106,0.5)', borderRadius: 12, padding: '12px 16px', color: '#f3e7cf', fontSize: 15, lineHeight: 1.35, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                    {txt}
                </div>
            )}
            {cleaning && (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top,0px) + 56px)', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: '#f3e7cf', fontSize: 12, letterSpacing: '0.15em', textShadow: '0 1px 3px #000' }}>
                        CONVÉS LIMPO {snap.cleaned}/{snap.npud}
                    </div>
                    <div style={{ width: 200, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(snap.cleanPct * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#5fa8c4,#bfe3ef)', transition: 'width 0.15s linear' }} />
                    </div>
                </div>
            )}
            {/* interact button (mobile) */}
            <button
                aria-label="Interagir / Esfregar"
                onPointerDown={(e) => { e.preventDefault(); handleRef.current.interact = true; }}
                onPointerUp={() => { handleRef.current.interact = false; }}
                onPointerLeave={() => { handleRef.current.interact = false; }}
                style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right,0px) + 20px)', bottom: 'calc(env(safe-area-inset-bottom,0px) + 110px)', width: 78, height: 78, borderRadius: '50%', background: 'rgba(202,165,106,0.22)', border: '2px solid rgba(202,165,106,0.6)', color: '#f3e7cf', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', pointerEvents: 'auto', backdropFilter: 'blur(3px)' }}
            >{cleaning ? 'ESFREGAR' : 'E'}</button>
        </div>
    );
};

export default Floor7Environment;
