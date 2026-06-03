/**
 * Floor3FallCutscene.tsx — the Diabrete's DEFEAT as a directed, INTERACTIVE
 * cutscene, in the 1930s rubber-hose idiom (big squash/stretch, flailing
 * rubber-hose limbs, huge pleading acting — Fleischer/Cuphead reference).
 *
 * It owns its OWN cinematic camera (a fixed 3/4 side angle) so it never reads as
 * first-person, and runs a small phase machine:
 *
 *   intro → he trips at the edge, slips, and catches the ledge by his hands.
 *   beg   → hangs by ONE hand, stretches the OTHER toward the player, pleading
 *           ("take my hand!") — and HOLDS here until the player chooses.
 *
 *   ┌ choice = 'stomp' → STOMP: a giant boot crushes his gripping hand and he
 *   │                    plummets, tumbling, into the void  → onDone('stomp')
 *   └ choice = 'save'  → CLIMB: the player's glove pulls him up… he grins, then
 *                        SHOVES the player into the abyss (camera tumbles)
 *                        → onDone('save')
 *
 * App shows the plea + the two choice buttons when `onBeg` fires, feeds the
 * pick back through `choice`, and handles each outcome via `onDone`.
 *
 * Camera note: rendered AFTER <Player> in the Canvas, so its useFrame runs last
 * and its camera writes win.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3DevilPos } from './f3Hazards';
import { playFloor3Land, playFloor3Fall, playFloor3Dizzy } from './floor3Sfx';

const RIVAL_URL = '/diabrete.glb';
const HANG_DROP = 1.95;    // body drop so he dangles BELOW the ledge, head at the edge
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

const bootDark = new THREE.MeshToonMaterial({ color: '#15101a' });
const bootSole = new THREE.MeshToonMaterial({ color: '#2c2436' });
const bootOutline = new THREE.MeshBasicMaterial({ color: '#0a0712', side: THREE.BackSide });
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
    const bootRef  = useRef<THREE.Group>(null!);
    const gloveRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const base    = useRef(new THREE.Vector3());
    const phase   = useRef<Phase>('intro');
    const pt      = useRef(0);                 // time in the current phase
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
            if (typeof w.__fallScrub === 'number') T = w.__fallScrub;   // dev: hold a phase time
            if (typeof w.__fallPhase === 'string') phase.current = w.__fallPhase;
            w.__fallT = T; w.__fallPh = phase.current;
        }
        const b = rig.bones, g = groupRef.current;
        const gripY = base.current.y, gx = base.current.x, gz = base.current.z;
        const HANG_Y = gripY - HANG_DROP;
        const ph = phase.current;
        rig.group.scale.set(1, 1, 1);
        if (bootRef.current) bootRef.current.visible = false;
        if (gloveRef.current) gloveRef.current.visible = false;

        // camera tumble (set by the save-shove)
        let camBack = 0, camRoll = 0;
        const grip = () => { b[B.l_arm].rotation.set(-0.2, 0, 2.5); };   // left hand on the ledge

        // ── INTRO: trip → slip → catch → settle into the plea ────────────────
        if (ph === 'intro') {
            if (T < 0.5) {
                const k = T / 0.5;
                g.position.set(gx, gripY, gz);
                g.rotation.set(k * 0.6, 0, Math.sin(T * 26) * 0.12);
                b[B.l_arm].rotation.set(Math.sin(T * 24) * 2.4, 0, 0.5);
                b[B.r_arm].rotation.set(Math.sin(T * 24 + 3) * 2.4, 0, -0.5);
                b[B.head].rotation.set(0.4 * k, 0, 0);
                b[B.l_leg].rotation.set(-0.7 * k, 0, 0); b[B.r_leg].rotation.set(0.5 * k, 0, 0);
            } else if (T < 0.9) {
                const k = (T - 0.5) / 0.4;
                g.position.set(gx, lerp(gripY, HANG_Y, easeIn(k)), gz);
                g.rotation.set(0, 0, 0);
                b[B.l_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(0.5, 2.5, k));
                b[B.r_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(-0.5, -2.5, k));
                b[B.head].rotation.set(-0.2, 0, 0);
            } else {
                // settle: right hand lets go of the ledge and reaches OUT to plead
                const k = clamp01((T - 0.9) / 0.5);
                g.position.set(gx, HANG_Y, gz);
                grip();
                b[B.r_arm].rotation.set(lerp(-0.2, -0.1, k), lerp(0, -0.6, k), lerp(-2.5, -0.7, k));
                b[B.head].rotation.set(-0.3, 0, 0);
                b[B.l_leg].rotation.set(0.3, 0, 0.15); b[B.r_leg].rotation.set(0.3, 0, -0.15);
            }
            if (T >= 1.4) { phase.current = 'beg'; pt.current = 0; }
        }

        // ── BEG: hang by one hand, reach the other out, plead — HOLD for choice ─
        else if (ph === 'beg') {
            if (!begFired.current) { begFired.current = true; onBeg(); if (!sfx.current.beg) { sfx.current.beg = true; playFloor3Dizzy(900); } }
            const reach = Math.sin(T * 6) * 0.5 + 0.5;                 // 0..1 pleading pulse
            g.position.set(gx + Math.sin(T * 26) * 0.012, HANG_Y + Math.sin(T * 5) * 0.03, gz);  // trembling
            g.rotation.set(0, 0, Math.sin(T * 4) * 0.05);
            grip();
            b[B.r_arm].rotation.set(-0.1, lerp(-0.45, -0.8, reach), lerp(-0.55, -0.85, reach)); // reaching for the player
            b[B.head].rotation.set(-0.35 + Math.sin(T * 5) * 0.1, lerp(-0.05, -0.2, reach), Math.sin(T * 3) * 0.12);
            b[B.l_leg].rotation.set(Math.sin(T * 7) * 0.5, 0, 0.15);
            b[B.r_leg].rotation.set(-Math.sin(T * 7) * 0.5, 0, -0.15);
            b[B.body].rotation.set(0.05, 0, 0);
            const c = choiceRef.current;
            if (c === 'stomp') { phase.current = 'stomp'; pt.current = 0; }
            else if (c === 'save') { phase.current = 'climb'; pt.current = 0; }
        }

        // ── STOMP: boot crushes the gripping hand → he plummets ──────────────
        else if (ph === 'stomp') {
            grip();
            b[B.r_arm].rotation.set(-0.1, -0.6, -0.7);
            if (T < 0.55) {
                // boot drops onto the gripping (left) hand at the ledge
                g.position.set(gx, HANG_Y, gz);
                if (bootRef.current) {
                    bootRef.current.visible = true;
                    const k = easeIn(clamp01(T / 0.45));
                    bootRef.current.position.set(gx - 0.15, lerp(gripY + 5.5, gripY + 0.3, k), gz + 0.05);
                }
                b[B.head].rotation.set(-0.4, 0, 0);
                if (T > 0.45 && !sfx.current.stomp) { sfx.current.stomp = true; playFloor3Land(); }
                if (T > 0.45) rig.group.scale.set(1.1, 0.88, 1.1);
            } else {
                // plummet
                const e = T - 0.55;
                if (!sfx.current.fall) { sfx.current.fall = true; playFloor3Fall(); }
                if (bootRef.current) { bootRef.current.visible = true; bootRef.current.position.set(gx - 0.15, lerp(gripY + 0.3, gripY + 3, clamp01(e / 0.6)), gz + 0.05); }
                const y = HANG_Y - 0.5 * 26 * e * e;
                g.position.set(gx, y, gz);
                g.rotation.set(e * 7, Math.sin(e * 5) * 0.5, e * 4);
                g.scale.setScalar(DIABRETE_SCALE * Math.max(0.12, 1 - e * 0.45));
                b[B.l_arm].rotation.set(Math.sin(T * 26) * 1.6, 0, 0.3); b[B.r_arm].rotation.set(-Math.sin(T * 26) * 1.6, 0, -0.3);
                b[B.l_leg].rotation.set(Math.sin(T * 22) * 1.0, 0, 0); b[B.r_leg].rotation.set(-Math.sin(T * 22) * 1.0, 0, 0);
                if (e > 1.3 && !doneRef.current) { doneRef.current = true; onDone('stomp'); }
            }
        }

        // ── CLIMB (save → betrayal): pulled up, grins, SHOVES the player ──────
        else if (ph === 'climb') {
            // the player's glove only shows while it grabs + pulls him up (T < 1.3)
            if (gloveRef.current) gloveRef.current.visible = T < 1.3;
            if (T < 0.45) {
                // glove drops in to grab his hand; he reaches up to it
                const k = easeOut(clamp01(T / 0.45));
                g.position.set(gx, HANG_Y, gz);
                grip();
                b[B.r_arm].rotation.set(-0.6, -0.5, -1.6 * k - 0.2);          // reach UP to the glove
                if (gloveRef.current) gloveRef.current.position.set(gx + 0.5, lerp(gripY + 3, gripY + 0.9, k), gz + 0.5);
                if (T > 0.4 && !sfx.current.grab) { sfx.current.grab = true; playFloor3Land(); }
            } else if (T < 1.3) {
                // PULL UP — rubber-hose stretch over the ledge onto the platform
                const k = easeOut(clamp01((T - 0.45) / 0.85));
                const y = lerp(HANG_Y, gripY, k);
                g.position.set(gx, y, gz);
                g.rotation.set(lerp(0, -0.1, k), 0, 0);
                const stretch = 1 + Math.sin(k * Math.PI) * 0.35;            // stretch then settle
                rig.group.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
                b[B.l_arm].rotation.set(-0.5, 0, lerp(2.5, 1.0, k));
                b[B.r_arm].rotation.set(-0.5, 0, lerp(-1.8, -1.0, k));
                b[B.l_leg].rotation.set(lerp(0.3, -0.2, k), 0, 0.1); b[B.r_leg].rotation.set(lerp(0.3, -0.2, k), 0, -0.1);
                b[B.head].rotation.set(0.1, 0, 0);
                if (gloveRef.current) gloveRef.current.position.set(gx + 0.4, lerp(gripY + 0.9, gripY + 2.2, k), gz + 0.5);
            } else if (T < 1.95) {
                // ON TOP — cocky grin beat (puff up, lean back, hands low)
                const k = clamp01((T - 1.3) / 0.65);
                g.position.set(gx, gripY, gz);
                g.rotation.set(lerp(-0.1, 0.12, k), 0, 0);                    // lean back, chest out
                const puff = 1 + Math.sin(k * Math.PI) * 0.12;
                rig.group.scale.set(puff, puff, puff);
                b[B.l_arm].rotation.set(0.1, 0, 1.1); b[B.r_arm].rotation.set(0.1, 0, -1.1);  // hands on hips
                b[B.head].rotation.set(0.15, Math.sin(T * 8) * 0.08, -0.1);                   // cocky tilt
                b[B.l_leg].rotation.set(0, 0, 0.08); b[B.r_leg].rotation.set(0, 0, -0.08);
            } else {
                // LUNGE + SHOVE — he thrusts at the player; the camera tumbles down
                const e = T - 1.95;
                const k = clamp01(e / 0.35);
                g.position.set(gx, gripY, gz);
                g.rotation.set(lerp(0.12, -0.5, k), 0, 0);                    // lunge forward at the camera
                b[B.l_arm].rotation.set(-1.5 * k, 0, 0.5); b[B.r_arm].rotation.set(-1.5 * k, 0, -0.5);  // shove out
                b[B.head].rotation.set(-0.2, 0, 0);
                // the player is shoved back into the void: camera flies back, drops, rolls
                const s = easeIn(clamp01(e / 0.7));
                camBack = s * 9; camRoll = s * 2.2;
                if (e > 0.5 && !sfx.current.shove) { sfx.current.shove = true; playFloor3Fall(); }
                if (e > 1.0 && !doneRef.current) { doneRef.current = true; onDone('save'); }
            }
        }

        // ── Camera — 3/4 side, push-in; tumbles backward on the shove ────────
        const intro = ph === 'intro';
        const dist = lerp(6.0, 4.6, clamp01((intro ? T : 1.4 + T) / 3.5)) + camBack;
        const dir = new THREE.Vector3(0.80, 0.18, 0.57).normalize();
        camera.position.set(gx + dir.x * dist, gripY + 0.4 + dir.y * dist - camBack * 0.4, gz + dir.z * dist);
        camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
        camera.lookAt(gx, g.position.y + 1.0, gz);    // track his torso (hang → climb → fall)
        (camera as THREE.PerspectiveCamera).fov = 42;
        camera.updateProjectionMatrix();
    });

    return (
        <group>
            <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />
            {/* the player's giant stomping boot (PISAR branch) */}
            <group ref={bootRef} visible={false} scale={[1.4, 1.4, 1.4]}>
                <mesh position={[0, 0.7, 0]} material={bootOutline} scale={1.08}><cylinderGeometry args={[0.2, 0.24, 1.3, 12]} /></mesh>
                <mesh position={[0, 0.7, 0]} material={bootDark}><cylinderGeometry args={[0.2, 0.24, 1.3, 12]} /></mesh>
                <mesh position={[0, 0.0, 0.14]} material={bootDark}><boxGeometry args={[0.42, 0.34, 0.74]} /></mesh>
                <mesh position={[0, -0.22, 0.14]} material={bootSole}><boxGeometry args={[0.46, 0.14, 0.8]} /></mesh>
            </group>
            {/* the player's white glove reaching down to save him (SALVAR branch) */}
            <group ref={gloveRef} visible={false} scale={[1.3, 1.3, 1.3]} rotation={[Math.PI, 0, 0]}>
                <mesh material={gloveWhite}><sphereGeometry args={[0.32, 14, 12]} /></mesh>
                <mesh position={[0.22, 0.18, 0]} material={gloveWhite}><sphereGeometry args={[0.13, 10, 8]} /></mesh>
                <mesh position={[0, 0.42, 0]} material={gloveCuff}><cylinderGeometry args={[0.2, 0.26, 0.22, 14]} /></mesh>
            </group>
        </group>
    );
};

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
