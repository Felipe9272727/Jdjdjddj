/**
 * Floor3FallCutscene.tsx — the Diabrete's DEFEAT as a directed, INTERACTIVE,
 * multi-angle cartoon cutscene in the 1930s rubber-hose idiom.
 *
 * Staging: he clings to the FRONT edge of the platform, FACING it (and the
 * player), dangling into the abyss below. The signature beat is the player
 * looking DOWN over the edge at him — one little hand gripping the ledge, the
 * other stretched up, begging — so the "beg" shot is a high, top-down angle.
 *
 * Phase machine, with hard cartoon CUTS between camera shots:
 *   intro → trips, slips, SLAPS the ledge and catches himself.
 *   beg   → hangs by one hand, reaches up the other, pleads — HOLDS for the
 *           player's choice (App shows the plea + SALVAR / PISAR buttons).
 *   ┌ 'stomp' → top-down: a stylized cartoon shoe peels his fingers off the
 *   │           ledge; he plummets, tumbling, into the void → onDone('stomp')
 *   └ 'save'  → the player's glove hauls him up; he grins… then SHOVES the
 *               player into the abyss (camera reels) → onDone('save')
 *
 * Owns its own camera (rendered after <Player>, so its writes win).
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3DevilPos } from './f3Hazards';
import { playFloor3Land, playFloor3Fall, playFloor3Dizzy } from './floor3Sfx';

const RIVAL_URL = '/diabrete.glb';
const HANG_DROP = 1.55;     // how far below the ledge his feet dangle (head+hands clear the lip)
const EDGE_Z    = 0.35;     // he hangs just off the front edge (abyss side)
const FACE_Y    = Math.PI;  // turn him to FACE the platform / the player
const INK = '#0a0712';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// Toon materials for the stylized props (game's cartoon look + ink outline).
const shoeBrown = new THREE.MeshToonMaterial({ color: '#7a4a24' });
const shoeSole  = new THREE.MeshToonMaterial({ color: '#2a2030' });
const shoeCuff  = new THREE.MeshToonMaterial({ color: '#15101a' });
const gloveWhite = new THREE.MeshToonMaterial({ color: '#f4f0e6' });
const gloveCuff  = new THREE.MeshToonMaterial({ color: '#c0271a' });

type Phase = 'intro' | 'beg' | 'stomp' | 'climb';
type Outcome = 'save' | 'stomp';

interface Props {
    choice: 'none' | Outcome;
    onBeg: () => void;
    onDone: (outcome: Outcome) => void;
}

const Floor3FallCutscene: React.FC<Props> = ({ choice, onBeg, onDone }) => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null!);
    const shoeRef  = useRef<THREE.Group>(null!);
    const gloveRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const base    = useRef(new THREE.Vector3());
    const phase   = useRef<Phase>('intro');
    const pt      = useRef(0);
    const begFired = useRef(false);
    const doneRef = useRef(false);
    const sfx     = useRef<Record<string, boolean>>({});
    const choiceRef = useRef(choice);
    choiceRef.current = choice;

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete fall] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        base.current.copy(f3DevilPos.current);
        phase.current = 'intro'; pt.current = 0; begFired.current = false; doneRef.current = false;
        sfx.current = {};
        playFloor3Land();
        return () => { group.remove(rig.group); rig.dispose(); rigRef.current = null; };
    }, [gltf]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        pt.current += safeDt;
        let T = pt.current;
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            const w = window as any;
            if (typeof w.__fallScrub === 'number') T = w.__fallScrub;
            if (typeof w.__fallPhase === 'string') phase.current = w.__fallPhase;
            w.__fallT = T; w.__fallPh = phase.current;
        }
        const b = rig.bones, g = groupRef.current;
        const gripY = base.current.y, gx = base.current.x, gz = base.current.z;
        const edgeZ = gz + EDGE_Z;
        const HANG_Y = gripY - HANG_DROP;
        const ph = phase.current;
        rig.group.scale.set(1, 1, 1);
        g.rotation.set(0, FACE_Y, 0);                  // FACE the platform / player
        if (shoeRef.current) shoeRef.current.visible = false;
        if (gloveRef.current) gloveRef.current.visible = false;

        // camera control — set per shot (see the switch at the bottom)
        let camRoll = 0;
        const cam = { x: gx, y: gripY + 3, z: gz - 2.4, lx: gx, ly: gripY - 0.7, lz: edgeZ, fov: 44 };

        const grip = () => { b[B.l_arm].rotation.set(-0.2, 0, 2.5); };   // left hand clamped on the ledge

        // ── INTRO: trip → slip → SLAP the ledge ──────────────────────────────
        if (ph === 'intro') {
            if (T < 0.5) {
                const k = T / 0.5;
                g.position.set(gx, gripY, edgeZ);
                g.rotation.set(k * 0.5, FACE_Y, Math.sin(T * 26) * 0.12);
                b[B.l_arm].rotation.set(Math.sin(T * 24) * 2.4, 0, 0.5);
                b[B.r_arm].rotation.set(Math.sin(T * 24 + 3) * 2.4, 0, -0.5);
                b[B.head].rotation.set(0.3 * k, 0, 0);
                b[B.l_leg].rotation.set(-0.7 * k, 0, 0); b[B.r_leg].rotation.set(0.5 * k, 0, 0);
                // wide establishing shot
                cam.x = gx + 4.5; cam.y = gripY + 1.6; cam.z = edgeZ + 4.5; cam.ly = gripY - 0.2; cam.fov = 46;
            } else if (T < 0.95) {
                const k = (T - 0.5) / 0.45;
                g.position.set(gx, lerp(gripY, HANG_Y, easeIn(k)), edgeZ);
                b[B.l_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(0.5, 2.5, k));
                b[B.r_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(-0.5, 2.5, k));
                b[B.head].rotation.set(lerp(0.3, -0.5, k), 0, 0);
                if (T > 0.85 && !sfx.current.slap) { sfx.current.slap = true; playFloor3Land(); }
                // low angle from the abyss looking UP at the catch
                cam.x = gx - 2.0; cam.y = HANG_Y + 0.2; cam.z = edgeZ + 3.2; cam.ly = gripY + 0.3; cam.fov = 50;
            } else {
                const k = clamp01((T - 0.95) / 0.45);
                g.position.set(gx, HANG_Y, edgeZ);
                grip();
                b[B.r_arm].rotation.set(lerp(-0.2, -0.1, k), 0, lerp(2.5, 1.4, k));    // settle toward a reach
                b[B.head].rotation.set(-0.55, 0, 0);
                b[B.l_leg].rotation.set(0.3, 0, 0.15); b[B.r_leg].rotation.set(0.3, 0, -0.15);
                topDownBeg(cam, gx, gripY, edgeZ, T);
            }
            if (T >= 1.4) { phase.current = 'beg'; pt.current = 0; }
        }

        // ── BEG: hang by one hand, reach the other up, plead — TOP-DOWN, HOLD ─
        else if (ph === 'beg') {
            if (!begFired.current) { begFired.current = true; onBeg(); if (!sfx.current.beg) { sfx.current.beg = true; playFloor3Dizzy(900); } }
            const reach = Math.sin(T * 5) * 0.5 + 0.5;
            g.position.set(gx + Math.sin(T * 22) * 0.02, HANG_Y + Math.sin(T * 5) * 0.04, edgeZ);
            g.rotation.set(0, FACE_Y, Math.sin(T * 4) * 0.06);
            grip();
            // free arm stretches UP toward the player (the camera, above)
            b[B.r_arm].rotation.set(lerp(-0.5, -0.9, reach), 0, lerp(1.7, 2.3, reach));
            b[B.head].rotation.set(-0.6 + Math.sin(T * 5) * 0.08, Math.sin(T * 3) * 0.1, 0);   // craned up, pleading
            b[B.l_leg].rotation.set(Math.sin(T * 7) * 0.5, 0, 0.15);
            b[B.r_leg].rotation.set(-Math.sin(T * 7) * 0.5, 0, -0.15);
            b[B.body].rotation.set(-0.05, 0, 0);
            topDownBeg(cam, gx, gripY, edgeZ, T);
            const c = choiceRef.current;
            if (c === 'stomp') { phase.current = 'stomp'; pt.current = 0; }
            else if (c === 'save') { phase.current = 'climb'; pt.current = 0; }
        }

        // ── STOMP: cartoon shoe peels his fingers off → plummet ──────────────
        else if (ph === 'stomp') {
            if (T < 0.7) {
                // top-down CLOSE on the shoe pressing his gripping hand
                grip();
                g.position.set(gx, HANG_Y, edgeZ);
                b[B.r_arm].rotation.set(-0.4, 0, 1.9);
                b[B.head].rotation.set(-0.5, 0, 0);
                if (shoeRef.current) {
                    shoeRef.current.visible = true;
                    const k = easeIn(clamp01(T / 0.5));
                    shoeRef.current.position.set(gx, lerp(gripY + 4, gripY + 0.32, k), edgeZ - 0.18);
                    shoeRef.current.rotation.set(-0.5, 0, 0);
                }
                if (T > 0.5 && !sfx.current.stomp) { sfx.current.stomp = true; playFloor3Land(); }
                if (T > 0.5) rig.group.scale.set(1.06, 0.92, 1.06);
                cam.x = gx + 2.0; cam.y = gripY + 3.0; cam.z = edgeZ + 2.6; cam.ly = gripY - 0.3; cam.lz = edgeZ; cam.fov = 46;
            } else {
                // plummet — wide side shot following him down
                const e = T - 0.7;
                if (!sfx.current.fall) { sfx.current.fall = true; playFloor3Fall(); }
                const y = HANG_Y - 0.5 * 26 * e * e;
                g.position.set(gx, y, edgeZ);
                g.rotation.set(e * 7, FACE_Y + Math.sin(e * 5) * 0.5, e * 4);
                g.scale.setScalar(DIABRETE_SCALE * Math.max(0.12, 1 - e * 0.45));
                b[B.l_arm].rotation.set(Math.sin(T * 26) * 1.6, 0, 0.3); b[B.r_arm].rotation.set(-Math.sin(T * 26) * 1.6, 0, -0.3);
                b[B.l_leg].rotation.set(Math.sin(T * 22), 0, 0); b[B.r_leg].rotation.set(-Math.sin(T * 22), 0, 0);
                cam.x = gx + 4.2; cam.y = gripY + 0.5; cam.z = edgeZ + 4.2; cam.ly = g.position.y + 0.8; cam.lz = edgeZ; cam.fov = 48;
                if (e > 1.3 && !doneRef.current) { doneRef.current = true; onDone('stomp'); }
            }
        }

        // ── CLIMB (save → betrayal): pulled up by the glove, grins, SHOVES ────
        else if (ph === 'climb') {
            if (gloveRef.current) gloveRef.current.visible = T < 1.3;
            if (T < 0.45) {
                const k = easeOut(clamp01(T / 0.45));
                g.position.set(gx, HANG_Y, edgeZ);
                grip();
                b[B.r_arm].rotation.set(-0.6, 0, lerp(1.7, 2.6, k));            // reach UP to the glove
                if (gloveRef.current) gloveRef.current.position.set(gx, lerp(gripY + 3, gripY + 1.1, k), edgeZ - 0.1);
                if (T > 0.4 && !sfx.current.grab) { sfx.current.grab = true; playFloor3Land(); }
                cam.x = gx + 1.6; cam.y = gripY + 2.4; cam.z = edgeZ + 1.4; cam.ly = gripY; cam.lz = edgeZ; cam.fov = 44;
            } else if (T < 1.3) {
                const k = easeOut(clamp01((T - 0.45) / 0.85));
                g.position.set(gx, lerp(HANG_Y, gripY, k), lerp(edgeZ, gz - 0.2, k));   // hauled up over the lip
                g.rotation.set(lerp(0, -0.1, k), FACE_Y, 0);
                const stretch = 1 + Math.sin(k * Math.PI) * 0.35;
                rig.group.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
                b[B.l_arm].rotation.set(-0.5, 0, lerp(2.5, 1.0, k));
                b[B.r_arm].rotation.set(-0.5, 0, lerp(2.6, 1.0, k));
                b[B.l_leg].rotation.set(lerp(0.3, -0.2, k), 0, 0.1); b[B.r_leg].rotation.set(lerp(0.3, -0.2, k), 0, -0.1);
                b[B.head].rotation.set(0.1, 0, 0);
                if (gloveRef.current) gloveRef.current.position.set(gx, lerp(gripY + 1.1, gripY + 2.4, k), lerp(edgeZ - 0.1, gz, k));
                cam.x = gx - 2.4; cam.y = gripY + 0.6; cam.z = edgeZ + 2.6; cam.ly = g.position.y + 0.8; cam.lz = gz; cam.fov = 46;
            } else if (T < 1.95) {
                // ON TOP — turn to face the player, cocky grin (low hero angle)
                const k = clamp01((T - 1.3) / 0.65);
                const turn = lerp(FACE_Y, 0, clamp01((T - 1.3) / 0.35));   // spin around to face the player
                g.position.set(gx, gripY, gz - 0.2);
                g.rotation.set(lerp(-0.1, 0.1, k), turn, 0);
                const puff = 1 + Math.sin(k * Math.PI) * 0.12;
                rig.group.scale.set(puff, puff, puff);
                b[B.l_arm].rotation.set(0.1, 0, 1.1); b[B.r_arm].rotation.set(0.1, 0, -1.1);   // hands on hips
                b[B.head].rotation.set(0.1, Math.sin(T * 8) * 0.1, -0.1);
                b[B.l_leg].rotation.set(0, 0, 0.08); b[B.r_leg].rotation.set(0, 0, -0.08);
                cam.x = gx + 1.8; cam.y = gripY - 0.3; cam.z = gz + 3.2; cam.ly = gripY + 1.2; cam.lz = gz; cam.fov = 42;
            } else {
                // LUNGE + SHOVE — thrust at the player; the camera reels back
                const e = T - 1.95;
                const k = clamp01(e / 0.35);
                g.position.set(gx, gripY, lerp(gz - 0.2, gz + 0.5, k));      // lunge toward the player
                g.rotation.set(lerp(0.1, -0.5, k), 0, 0);                    // facing the player
                b[B.l_arm].rotation.set(-1.5 * k, 0, 0.5); b[B.r_arm].rotation.set(-1.5 * k, 0, -0.5);
                b[B.head].rotation.set(-0.2, 0, 0);
                const s = easeIn(clamp01(e / 0.7));
                camRoll = s * 2.0;
                cam.x = gx; cam.y = gripY + 1.0 + s * 1.5; cam.z = gz + 3.0 + s * 9; cam.ly = gripY + 1.0; cam.lz = gz; cam.fov = 42 + s * 20;
                if (e > 0.5 && !sfx.current.shove) { sfx.current.shove = true; playFloor3Fall(); }
                if (e > 1.0 && !doneRef.current) { doneRef.current = true; onDone('save'); }
            }
        }

        // ── Apply the chosen camera shot (hard cuts, cartoon style) ──────────
        camera.position.set(cam.x, cam.y, cam.z);
        camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
        camera.lookAt(cam.lx, cam.ly, cam.lz);
        (camera as THREE.PerspectiveCamera).fov = cam.fov;
        camera.updateProjectionMatrix();
    });

    return (
        <group>
            <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />

            {/* PISAR — a stylized rubber-hose cartoon shoe (toon + ink outline) */}
            <group ref={shoeRef} visible={false} scale={[1.5, 1.5, 1.5]}>
                <mesh position={[0, 0.55, 0]}>{/* ankle */}
                    <cylinderGeometry args={[0.16, 0.2, 0.5, 14]} />
                    <primitive object={shoeCuff} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0, 0.12, 0.12]} scale={[1.05, 0.8, 1.5]}>{/* bulbous toe */}
                    <sphereGeometry args={[0.3, 16, 12]} />
                    <primitive object={shoeBrown} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0, -0.12, 0.14]} scale={[1.0, 0.5, 1.55]}>{/* sole */}
                    <sphereGeometry args={[0.3, 16, 10]} />
                    <primitive object={shoeSole} attach="material" />
                </mesh>
            </group>

            {/* SALVAR — a stylized white cartoon glove (toon + ink outline) */}
            <group ref={gloveRef} visible={false} scale={[1.35, 1.35, 1.35]} rotation={[Math.PI, 0, 0]}>
                <mesh>{/* palm */}
                    <sphereGeometry args={[0.3, 16, 12]} />
                    <primitive object={gloveWhite} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0.18, 0.2, 0]}><sphereGeometry args={[0.12, 10, 8]} /><primitive object={gloveWhite} attach="material" /><Outlines thickness={0.05} color={INK} /></mesh>
                <mesh position={[-0.05, 0.24, 0]}><sphereGeometry args={[0.12, 10, 8]} /><primitive object={gloveWhite} attach="material" /><Outlines thickness={0.05} color={INK} /></mesh>
                <mesh position={[0, 0.4, 0]}>{/* cuff */}
                    <cylinderGeometry args={[0.2, 0.26, 0.22, 16]} />
                    <primitive object={gloveCuff} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
            </group>
        </group>
    );
};

// Shared "player looks down over the edge" framing for the catch + beg beats.
function topDownBeg(cam: { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov: number },
                    gx: number, gripY: number, edgeZ: number, T: number) {
    const push = 1 - clamp01((T - 0.95) / 2.5) * 0.16;     // slow push-in
    cam.x = gx + 0.7; cam.y = gripY + (2.7 * push); cam.z = edgeZ + 1.3 - 3.0 * push;
    cam.lx = gx; cam.ly = gripY - 0.45; cam.lz = edgeZ; cam.fov = 48;
}

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
