/**
 * Floor3Cutscene.tsx — the Diabrete's PERFORMANCE during the meet-the-rival
 * dialogue that plays the instant the Floor 3 doors open.
 *
 * Same procedurally-rigged character as Floor3Rival (diabreteRig), but instead
 * of running it stands on the landing facing the player and ACTS each scripted
 * beat with big, springy rubber-hose motion: it hops, twists, throws its arms,
 * shakes when it laughs — then, on the final 'dash' beat, it squashes, springs
 * and rockets off up the course, handing the screen back to gameplay.
 *
 * It drives `targetRef` (the dialogue camera's look-at) to the character's
 * FEET — the dialogue camera then adds its own look/camera height, so feeding
 * it the feet (like every NPC ref) frames the devil correctly instead of
 * aiming over his head (which made him look tiny). Advances the DOM line via
 * `onLine` and calls `onDone` when the dash clears frame.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { DIABRETE_SCRIPT, SCRIPT_TOTAL, lineAt, timeInLine, type Gesture } from './diabreteScript';
import { f3PlayerZ } from './f3Parkour';
import { diabreteModel } from './assets/textureImports';

const RIVAL_URL = diabreteModel; // bundled (inlined) — no runtime fetch
const STAND     = new THREE.Vector3(0.9, 0, -9.2);   // on the landing, ahead of the player
const ARM_REST  = 0.95;                               // lower the T-pose arms to rest

interface Props {
    targetRef: React.MutableRefObject<THREE.Vector3>;   // camera look-at (feet)
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

    // Springs for limber, weighty motion.
    const sLean  = useRef(new Spring(16, 5.5));
    const sArmL  = useRef(new Spring(24, 5.5));
    const sArmR  = useRef(new Spring(24, 5.5));
    const sArmLx = useRef(new Spring(28, 5.5));
    const sArmRx = useRef(new Spring(28, 5.5));
    const sHead  = useRef(new Spring(20, 5.5));

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

        const li = lineAt(t);
        if (li !== lineRef.current) { lineRef.current = li; onLine(li); }
        const line = DIABRETE_SCRIPT[li];
        const gesture: Gesture = line?.gesture ?? 'idle';
        const tl = timeInLine(t);
        const dashing = gesture === 'dash';

        // ── Per-gesture targets (computed first so position hops can use them) ─
        const breath = Math.sin(t * 2.4) * 0.5 + 0.5;
        let leanT = 0.12, headXT = 0, headZT = 0;
        let armLzT = ARM_REST, armRzT = ARM_REST, armLxT = 0, armRxT = 0;
        let bodyBob = Math.sin(t * 2.4) * 0.02;     // idle breathing
        let bodyYaw = 0, bodyRoll = 0;
        let hop = 0;                                 // whole-body vertical hop
        const wob = Math.sin(t * 11) * 0.07;         // rubber-hose jitter

        switch (gesture) {
            case 'lean':   // cocky size-up: lean way in, head tilt, one arm akimbo
                leanT = 0.40 + Math.sin(t * 3) * 0.05; headZT = 0.22; bodyYaw = 0.12;
                armLzT = 1.7; armLxT = 0.15;
                armRzT = ARM_REST - 0.15; armRxT = -0.2;
                break;
            case 'point':  // jab a finger right at the player, stabbing repeatedly
                leanT = 0.28; headXT = 0.10;
                armRzT = 0.30; armRxT = -1.45 + Math.sin(t * 13) * 0.28;
                armLzT = 1.5;  armLxT = 0.25;
                hop = Math.abs(Math.sin(t * 6.5)) * 0.06;
                break;
            case 'throw':  // big two-arm "I'll bury you" overhead sweep + lunge
                leanT = 0.10 + Math.sin(t * 5) * 0.12;
                armLzT = 0.15; armRzT = 0.15;
                armLxT = -1.7 + Math.sin(t * 7) * 0.5;
                armRxT = -1.7 + Math.sin(t * 7 + 0.5) * 0.5;
                headXT = -0.18; bodyRoll = Math.sin(t * 7) * 0.12;
                break;
            case 'laugh':  // belly-laugh: rock back, arms flung out, whole body shake
                leanT = -0.30 + Math.sin(t * 15) * 0.10;
                armLzT = 1.35 + Math.sin(t * 15) * 0.2;
                armRzT = 1.35 + Math.sin(t * 15 + 0.4) * 0.2;
                armLxT = 0.4; armRxT = 0.4;
                headXT = -0.38; headZT = Math.sin(t * 15) * 0.12;
                bodyBob = Math.abs(Math.sin(t * 7.5)) * 0.06;
                hop = Math.abs(Math.sin(t * 7.5)) * 0.10; bodyRoll = Math.sin(t * 15) * 0.06;
                break;
            case 'taunt':  // chest-puff swagger: bounce, hands wide, hips weaving
                leanT = 0.12; bodyYaw = Math.sin(t * 4.5) * 0.22;
                armLzT = 1.1 + Math.sin(t * 7) * 0.3; armRzT = 1.1 + Math.sin(t * 7 + 0.5) * 0.3;
                armLxT = 0.15 + Math.sin(t * 7) * 0.25; armRxT = 0.15 - Math.sin(t * 7) * 0.25;
                headZT = Math.sin(t * 5) * 0.12;
                hop = Math.abs(Math.sin(t * 4.5)) * 0.12;
                break;
            case 'dash': { // wind-up crouch then stretch into the run
                const run = Math.max(0, tl - 0.25);
                if (run <= 0) { leanT = 0.55; bodyBob = -0.08; armLxT = 0.7; armRxT = 0.7; armLzT = 1.5; armRzT = 1.5; }
                else { leanT = 0.5; armLzT = ARM_REST; armRzT = ARM_REST;
                       armLxT = -Math.sin(run * 22) * 1.0; armRxT = Math.sin(run * 22) * 1.0; }
                break;
            }
            default:       // idle — breathing sway, weight shift
                leanT = 0.10 + breath * 0.04; bodyYaw = Math.sin(t * 1.4) * 0.06;
                armLzT = ARM_REST + 0.06; armRzT = ARM_REST + 0.06;
                headZT = Math.sin(t * 1.6) * 0.07;
        }

        // ── Position: stand (with hops), then DASH away on the last beat ──────
        if (dashing) {
            const run = Math.max(0, tl - 0.25);
            dashPos.current.z += run * 24 * safeDt;
            dashPos.current.x += (0 - dashPos.current.x) * (1 - Math.exp(-5 * safeDt));
            groupRef.current.position.copy(dashPos.current);
            groupRef.current.rotation.y = 0;                 // face +Z (running off)
        } else {
            groupRef.current.position.set(STAND.x, STAND.y + hop, STAND.z);
            groupRef.current.rotation.y = Math.PI + 0.16;    // ≈ face the player (-Z), slight 3/4
        }

        // Camera look-at = the character's FEET (the dialogue cam adds its own
        // look/camera height; feeding chest height aimed it over his head).
        targetRef.current.set(
            groupRef.current.position.x,
            STAND.y,
            groupRef.current.position.z,
        );

        // ── Apply bone targets with springs (+ wobble overshoot) ─────────────
        bones[B.body].position.y = 0.46 + bodyBob;
        bones[B.body].rotation.x = sLean.current.tick(leanT, safeDt);
        bones[B.body].rotation.y = bodyYaw;
        bones[B.body].rotation.z = bodyRoll;
        bones[B.head].rotation.x = sHead.current.tick(headXT, safeDt);
        bones[B.head].rotation.z = headZT + wob * 0.3;

        bones[B.l_arm].rotation.z =  sArmL.current.tick(armLzT, safeDt);
        bones[B.r_arm].rotation.z = -sArmR.current.tick(armRzT, safeDt);
        bones[B.l_arm].rotation.x =  sArmLx.current.tick(armLxT, safeDt) + wob;
        bones[B.r_arm].rotation.x =  sArmRx.current.tick(armRxT, safeDt) - wob;

        // Legs: relaxed weight-shift while talking, running kick on dash.
        if (dashing && tl > 0.25) {
            const run = tl - 0.25;
            bones[B.l_leg].rotation.x =  Math.sin(run * 22) * 0.8;
            bones[B.r_leg].rotation.x = -Math.sin(run * 22) * 0.8;
        } else {
            bones[B.l_leg].rotation.x = Math.sin(t * 2.0) * 0.07;
            bones[B.r_leg].rotation.x = -Math.sin(t * 2.0) * 0.07;
        }

        // ── Finish: dash cleared frame → hand back to gameplay ───────────────
        if (!doneRef.current && (t >= SCRIPT_TOTAL + 0.5 || dashPos.current.z > f3PlayerZ.current + 12)) {
            doneRef.current = true;
            onDone();
        }
    });

    return <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />;
};

useGLTF.preload(RIVAL_URL);
export default Floor3Cutscene;
