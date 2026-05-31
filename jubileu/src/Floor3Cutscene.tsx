/**
 * Floor3Cutscene.tsx — the Diabrete's PERFORMANCE during the meet-the-rival
 * dialogue that plays the instant the Floor 3 doors open.
 *
 * Same procedurally-rigged character as Floor3Rival (diabreteRig), but instead
 * of running it stands on the landing facing the player and ACTS each scripted
 * beat: idle breathing, a cocky lean, a jabbing point, a big two-arm throw, a
 * shaking belly-laugh, a taunting bounce — then, on the final 'dash' beat, it
 * squashes, springs and rockets off up the course, handing the screen back to
 * gameplay (where Floor3Rival takes over).
 *
 * It drives `cutsceneTargetRef` (the camera look-at, owned by the dialogue
 * system) to the character's chest, advances the DOM line via `onLine`, and
 * calls `onDone` when the dash clears frame.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, type DiabreteRig } from './diabreteRig';
import { DIABRETE_SCRIPT, SCRIPT_TOTAL, lineAt, timeInLine, type Gesture } from './diabreteScript';
import { f3PlayerZ } from './f3Parkour';

const RIVAL_URL  = '/diabrete.glb';
const CHAR_SCALE = 1.55;
const STAND      = new THREE.Vector3(1.1, 0, -8.6);   // on the landing, ahead of the player
const ARM_REST   = 0.95;                               // lower the T-pose arms

interface Props {
    targetRef: React.MutableRefObject<THREE.Vector3>;   // camera look-at, fed to the dialogue cam
    onLine: (i: number) => void;
    onDone: () => void;
}

class Spring {
    value = 0; vel = 0;
    constructor(readonly k = 22, readonly d = 7) {}
    tick(target: number, dt: number) {
        this.vel += (-this.k * (this.value - target) - this.d * this.vel) * dt;
        this.value += this.vel * dt;
        return this.value;
    }
    reset(v = 0) { this.value = v; this.vel = 0; }
}

const Floor3Cutscene: React.FC<Props> = ({ targetRef, onLine, onDone }) => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const groupRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const clock    = useRef(0);
    const lineRef  = useRef(-1);
    const doneRef  = useRef(false);
    const dashPos  = useRef(new THREE.Vector3().copy(STAND));
    const dashVelY = useRef(0);

    // Springs for limber, weighty motion.
    const sLean = useRef(new Spring(16, 5.5));
    const sArmL = useRef(new Spring(26, 6));
    const sArmR = useRef(new Spring(26, 6));
    const sArmLx = useRef(new Spring(30, 6));
    const sArmRx = useRef(new Spring(30, 6));
    const sHead = useRef(new Spring(22, 6));

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete cutscene] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        clock.current = 0;
        lineRef.current = -1;
        doneRef.current = false;
        dashPos.current.copy(STAND);
        sLean.current.reset(0.12);
        sArmL.current.reset(ARM_REST); sArmR.current.reset(ARM_REST);
        sArmLx.current.reset(0); sArmRx.current.reset(0);
        sHead.current.reset(0);
        return () => { group.remove(rig.group); rig.dispose(); rigRef.current = null; };
    }, [gltf]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        const bones = rig.bones;
        clock.current += safeDt;
        const t = clock.current;

        // Advance the DOM line.
        const li = lineAt(t);
        if (li !== lineRef.current) { lineRef.current = li; onLine(li); }
        const line = DIABRETE_SCRIPT[li];
        const gesture: Gesture = line?.gesture ?? 'idle';
        const tl = timeInLine(t);                 // seconds into this beat
        const dashing = gesture === 'dash';

        // ── Position: stand, then DASH away on the last beat ─────────────────
        if (dashing) {
            // wind-up squash (first 0.25s) then launch up the course (+Z)
            const run = Math.max(0, tl - 0.22);
            dashPos.current.z += run * 22 * safeDt;       // accelerate away
            dashPos.current.x += (0 - dashPos.current.x) * (1 - Math.exp(-5 * safeDt));
            groupRef.current.position.copy(dashPos.current);
            groupRef.current.rotation.y = 0;              // face +Z (running off)
        } else {
            groupRef.current.position.copy(STAND);
            // Face the player (who's down-course at -Z): yaw toward them.
            groupRef.current.rotation.y = Math.PI + 0.18; // ≈ face -Z, slight 3/4 turn
        }

        // Camera look-at target = chest height at the character's live position.
        targetRef.current.set(
            groupRef.current.position.x,
            groupRef.current.position.y + 1.05,
            groupRef.current.position.z,
        );

        // ── Per-gesture bone targets ─────────────────────────────────────────
        const breath = Math.sin(t * 2.2) * 0.5 + 0.5;
        let leanT = 0.12, headXT = 0, headZT = 0;
        let armLzT = ARM_REST, armRzT = ARM_REST, armLxT = 0, armRxT = 0;
        let bodyBob = Math.sin(t * 2.2) * 0.012;       // gentle idle breathing
        let bodyYaw = 0;
        const wobble = Math.sin(t * 9) * 0.06;          // rubber-hose jitter

        switch (gesture) {
            case 'lean':   // cocky size-up: lean in, head tilt, one arm on "hip"
                leanT = 0.30; headZT = 0.16;
                armLzT = 1.55; armLxT = 0.1;            // left arm akimbo (down/in)
                armRzT = ARM_REST - 0.1; armRxT = -0.1;
                break;
            case 'point':  // jab a finger at the player: right arm forward + up
                leanT = 0.22; headXT = 0.06;
                armRzT = 0.35; armRxT = -1.25 + Math.sin(t * 12) * 0.12; // stabbing
                armLzT = 1.4;  armLxT = 0.2;
                break;
            case 'throw':  // big two-arm "I'll bury you" overhead sweep
                leanT = 0.05 + Math.sin(t * 4) * 0.06;
                armLzT = 0.2; armRzT = 0.2;
                armLxT = -1.5 + Math.sin(t * 6) * 0.3;
                armRxT = -1.5 + Math.sin(t * 6 + 0.4) * 0.3;
                headXT = -0.12;
                break;
            case 'laugh':  // belly-laugh: lean back, arms out, body shake
                leanT = -0.22 + Math.sin(t * 14) * 0.05;
                armLzT = 1.2 + Math.sin(t * 14) * 0.12;
                armRzT = 1.2 + Math.sin(t * 14 + 0.3) * 0.12;
                armLxT = 0.3; armRxT = 0.3;
                headXT = -0.28; headZT = Math.sin(t * 14) * 0.08;
                bodyBob = Math.abs(Math.sin(t * 7)) * 0.05;
                break;
            case 'taunt':  // chest-puff bounce, hands wide, swaggering
                leanT = 0.10; bodyYaw = Math.sin(t * 4) * 0.12;
                armLzT = 1.0 + Math.sin(t * 6) * 0.2; armRzT = 1.0 + Math.sin(t * 6 + 0.5) * 0.2;
                armLxT = 0.1; armRxT = 0.1;
                bodyBob = Math.abs(Math.sin(t * 5)) * 0.045;
                headZT = Math.sin(t * 5) * 0.07;
                break;
            case 'dash': { // wind-up crouch then stretch into the run
                const run = Math.max(0, tl - 0.22);
                if (run <= 0) { leanT = 0.5; bodyBob = -0.06; armLxT = 0.6; armRxT = 0.6; armLzT = 1.4; armRzT = 1.4; }
                else { leanT = 0.45; armLzT = ARM_REST; armRzT = ARM_REST;
                       armLxT = -Math.sin(run * 22) * 0.9; armRxT = Math.sin(run * 22) * 0.9; }
                break;
            }
            default:       // idle — small breathing sway
                leanT = 0.10 + breath * 0.03;
                armLzT = ARM_REST + 0.05; armRzT = ARM_REST + 0.05;
                headZT = Math.sin(t * 1.6) * 0.05;
        }

        // ── Apply with springs (smooth, with a little wobble overshoot) ─────
        bones[B.body].position.y = 0.46 + bodyBob;
        bones[B.body].rotation.x = sLean.current.tick(leanT, safeDt);
        bones[B.body].rotation.y = bodyYaw;
        bones[B.head].rotation.x = sHead.current.tick(headXT, safeDt);
        bones[B.head].rotation.z = headZT + wobble * 0.3;

        bones[B.l_arm].rotation.z =  sArmL.current.tick(armLzT, safeDt);
        bones[B.r_arm].rotation.z = -sArmR.current.tick(armRzT, safeDt);
        bones[B.l_arm].rotation.x =  sArmLx.current.tick(armLxT, safeDt) + wobble;
        bones[B.r_arm].rotation.x =  sArmRx.current.tick(armRxT, safeDt) - wobble;

        // Legs: relaxed stand with a weight-shift sway, running kick on dash.
        if (dashing && tl > 0.22) {
            const run = tl - 0.22;
            bones[B.l_leg].rotation.x =  Math.sin(run * 22) * 0.7;
            bones[B.r_leg].rotation.x = -Math.sin(run * 22) * 0.7;
        } else {
            bones[B.l_leg].rotation.x = Math.sin(t * 1.4) * 0.04;
            bones[B.r_leg].rotation.x = -Math.sin(t * 1.4) * 0.04;
        }

        // ── Finish: dash has cleared frame → hand back to gameplay ───────────
        if (!doneRef.current && (t >= SCRIPT_TOTAL + 0.4 || dashPos.current.z > f3PlayerZ.current + 12)) {
            doneRef.current = true;
            onDone();
        }
    });

    return <group ref={groupRef} scale={[CHAR_SCALE, CHAR_SCALE, CHAR_SCALE]} />;
};

useGLTF.preload(RIVAL_URL);
export default Floor3Cutscene;
