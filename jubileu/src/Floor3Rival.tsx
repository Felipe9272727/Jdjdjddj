/**
 * Floor3Rival.tsx — "O Diabrete" in gameplay: the rubber-hose rival that
 * sprints ahead of the player up the endless parkour AND reacts to the sabotage
 * loop (f3Hazards): a quick "drawing" flourish when he inks a new obstacle, a
 * classic 1930s DIZZY daze (head lolling, body spinning, little birds tweeting
 * around his head) each time the player steals one of his paintbrushes, and a
 * plunge into the void once the third brush is gone — after which he reports his
 * own defeat (fireWin) so the game whisks the player back to the elevator.
 *
 * The skeleton + skinning is built in diabreteRig.ts (the GLB is rig-less); here
 * we only DRIVE the bones each frame with spring-damped rubber-hose motion.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { platforms as f3Platforms, f3PlayerZ } from './f3Parkour';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3Progress, isDizzy, fireWin } from './f3Hazards';
import { playFloor3Draw, playFloor3Dizzy, playFloor3Fall } from './floor3Sfx';

const RIVAL_URL  = '/diabrete.glb';
const LEAD_Z     = 14;     // units ahead of the player
const MOVE_SPD   = 6.2;    // Z pursuit speed (u/s)
const GRAVITY    = 22.0;
const ARM_DROP   = 0.85;   // radians: lower the T-pose arms to a run posture
const NBIRDS     = 3;

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

const Floor3Rival: React.FC = () => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const groupRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);
    const birdRefs = useRef<THREE.Group[]>([]);

    const posRef = useRef(new THREE.Vector3(0, 0, LEAD_Z));
    const velY   = useRef(0);
    const onGnd  = useRef(true);
    const phase  = useRef(0);
    const tRef   = useRef(0);
    const inited = useRef(false);

    // Reaction state
    const prevDraw  = useRef(0);
    const drawAnim  = useRef(0);                       // seconds left on the draw flourish
    const dizzyStop = useRef<null | (() => void)>(null);
    const wasDizzy  = useRef(false);
    const fallVelY  = useRef(0);
    const fallSpin  = useRef(0);
    const fellSfx   = useRef(false);
    const fellFired = useRef(false);

    const sBob  = useRef(new Spring(24, 8));
    const sLean = useRef(new Spring(14, 5));

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        sBob.current.reset(0);
        sLean.current.reset(0.14);
        return () => {
            if (dizzyStop.current) { dizzyStop.current(); dizzyStop.current = null; }
            group.remove(rig.group);
            rig.dispose();
            rigRef.current = null;
        };
    }, [gltf]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        const bones  = rig.bones;
        tRef.current += safeDt;
        const t = tRef.current;

        // ── FALL: the devil plunges into the abyss, then reports his defeat ──
        if (f3Progress.fell) {
            if (!fellSfx.current) { fellSfx.current = true; playFloor3Draw(); playFloor3Fall(); if (dizzyStop.current) { dizzyStop.current(); dizzyStop.current = null; } }
            fallVelY.current -= GRAVITY * 1.4 * safeDt;
            posRef.current.y += fallVelY.current * safeDt;
            fallSpin.current += safeDt * 9;
            groupRef.current.position.copy(posRef.current);
            groupRef.current.rotation.y = fallSpin.current;         // tumbling spin
            groupRef.current.rotation.z = Math.sin(fallSpin.current) * 0.5;
            // flailing limbs as he drops
            bones[B.l_arm].rotation.x = Math.sin(t * 18) * 1.2;
            bones[B.r_arm].rotation.x = -Math.sin(t * 18) * 1.2;
            bones[B.l_leg].rotation.x = Math.sin(t * 16) * 0.9;
            bones[B.r_leg].rotation.x = -Math.sin(t * 16) * 0.9;
            for (const b of birdRefs.current) if (b) b.visible = false;
            const fallenMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - f3Progress.fellAt;
            if (fallenMs > 1900 && !fellFired.current) { fellFired.current = true; fireWin(); }
            return;
        }

        // ── Target & ground ─────────────────────────────────────────────────
        const targetZ = f3PlayerZ.current + LEAD_Z;
        if (!inited.current) { inited.current = true; posRef.current.z = targetZ; }
        let best: { cz: number; topY: number; x: number } | null = null;
        for (const p of f3Platforms) {
            if (!best || Math.abs(p.cz - targetZ) < Math.abs(best.cz - targetZ)) best = p;
        }
        const groundY = best?.topY ?? 0;
        const groundX = best?.x ?? 0;

        const dazed = isDizzy();

        // Forward chase — paused while dazed (he's too dizzy to run).
        if (!dazed) {
            const dz = targetZ - posRef.current.z;
            posRef.current.z += Math.sign(dz) * Math.min(Math.abs(dz), MOVE_SPD * safeDt);
            posRef.current.x += (groundX - posRef.current.x) * (1 - Math.exp(-6 * safeDt));
        }

        // Gravity / landing (runs in both states so he stays on the platform).
        const yDiff = groundY - posRef.current.y;
        if (onGnd.current && yDiff > 0.28 && !dazed) {
            velY.current = Math.sqrt(2 * GRAVITY * (yDiff + 0.5)) * 1.05;
            onGnd.current = false;
        }
        if (!onGnd.current) {
            velY.current -= GRAVITY * safeDt;
            posRef.current.y += velY.current * safeDt;
            if (posRef.current.y <= groundY && velY.current <= 0) { posRef.current.y = groundY; velY.current = 0; onGnd.current = true; }
        } else {
            posRef.current.y += yDiff * (1 - Math.exp(-14 * safeDt));
        }
        groupRef.current.position.copy(posRef.current);

        // ── Draw flourish — a quick scribble + arm flick when a new obstacle inks
        if (f3Progress.drawFlashAt !== prevDraw.current) {
            prevDraw.current = f3Progress.drawFlashAt;
            if (f3Progress.drawFlashAt > 0) { drawAnim.current = 0.55; playFloor3Draw(); }
        }
        if (drawAnim.current > 0) drawAnim.current = Math.max(0, drawAnim.current - safeDt);

        // ── DIZZY daze ───────────────────────────────────────────────────────
        if (dazed) {
            if (!wasDizzy.current) { wasDizzy.current = true; if (dizzyStop.current) dizzyStop.current(); dizzyStop.current = playFloor3Dizzy(3000); }
            // drunken slow spin + big sway
            groupRef.current.rotation.y = Math.sin(t * 2.2) * 0.7;
            bones[B.body].position.y = 0.46;
            bones[B.body].rotation.x = sLean.current.tick(-0.1, safeDt);
            bones[B.body].rotation.z = Math.sin(t * 3.0) * 0.22;
            bones[B.head].rotation.z = Math.sin(t * 4.0) * 0.5;     // head lolling
            bones[B.head].rotation.x = 0.15 + Math.sin(t * 2.5) * 0.1;
            // arms dangle loosely, swaying
            bones[B.l_arm].rotation.z = 1.15; bones[B.r_arm].rotation.z = -1.15;
            bones[B.l_arm].rotation.x = Math.sin(t * 5) * 0.5;
            bones[B.r_arm].rotation.x = Math.sin(t * 5 + 1) * 0.5;
            bones[B.l_leg].rotation.x = Math.sin(t * 3) * 0.12;
            bones[B.r_leg].rotation.x = -Math.sin(t * 3) * 0.12;
            // birds circle the head
            for (let i = 0; i < birdRefs.current.length; i++) {
                const b = birdRefs.current[i]; if (!b) continue;
                b.visible = true;
                const a = t * 4 + (i / NBIRDS) * Math.PI * 2;
                b.position.set(Math.cos(a) * 0.42, 1.0 + Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.42);
                b.rotation.y = -a + Math.PI / 2;
                b.rotation.z = Math.sin(t * 18 + i) * 0.5;          // wing flap tilt
            }
            // whole-mesh idle scale
            rig.group.scale.set(1.04, 0.97, 1.04);
            return;
        }
        if (wasDizzy.current) { wasDizzy.current = false; if (dizzyStop.current) { dizzyStop.current(); dizzyStop.current = null; } }
        for (const b of birdRefs.current) if (b) b.visible = false;
        groupRef.current.rotation.y = 0;

        // ── RUN ─────────────────────────────────────────────────────────────
        const air = !onGnd.current;
        if (!air) phase.current += safeDt * 2.6 * Math.PI * 2;
        const φ = phase.current;
        const sw = Math.sin(φ);

        bones[B.body].position.y = 0.46 + sBob.current.tick(air ? 0 : Math.abs(sw) * 0.075, safeDt);
        bones[B.body].rotation.x = sLean.current.tick(air ? -0.22 : 0.20, safeDt);
        bones[B.body].rotation.y = air ? 0 : Math.sin(φ) * 0.10;
        bones[B.body].rotation.z = air ? 0 : Math.sin(φ) * 0.06;

        bones[B.head].rotation.x = air ? -0.14 : 0.11 + Math.sin(φ * 2 + 0.6) * 0.06;
        bones[B.head].rotation.z = air ? 0 : Math.sin(φ + 0.3) * 0.08;

        bones[B.l_leg].rotation.x = air ? -0.5 :  sw * 0.78;
        bones[B.r_leg].rotation.x = air ? -0.5 : -sw * 0.78;

        // Arms pump fore/aft — unless mid draw-flourish: jab the right arm out as
        // if scribbling the obstacle into the air.
        const drawing = drawAnim.current > 0;
        bones[B.l_arm].rotation.z =  (air ? 1.3 : ARM_DROP);
        bones[B.r_arm].rotation.z = -(air ? 1.3 : (drawing ? 0.4 : ARM_DROP));
        bones[B.l_arm].rotation.x = air ? -0.7 : -sw * 1.05;
        bones[B.r_arm].rotation.x = drawing ? -1.25 + Math.sin(t * 34) * 0.35 : (air ? -0.7 : sw * 1.05);

        const strY = air ? 1 + Math.abs(velY.current) * 0.011 : 1 - Math.abs(sw) * 0.06;
        const strX = 1 / Math.sqrt(Math.max(0.55, strY));
        rig.group.scale.set(strX, strY, strX);
    });

    return (
        <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]}>
            {/* dizzy birds (hidden until dazed) — children inherit the body scale */}
            {Array.from({ length: NBIRDS }).map((_, i) => (
                <group key={i} ref={(el) => { if (el) birdRefs.current[i] = el; }} visible={false}>
                    <mesh><sphereGeometry args={[0.055, 10, 8]} /><meshToonMaterial color="#ffffff" /></mesh>
                    <mesh position={[0.055, 0.015, 0]} rotation={[0, 0, -0.6]}>
                        <coneGeometry args={[0.022, 0.06, 6]} /><meshToonMaterial color="#e8a33a" />
                    </mesh>
                    {/* little wings */}
                    <mesh position={[-0.02, 0.02, 0.04]} rotation={[0.3, 0, 0.4]}><boxGeometry args={[0.07, 0.012, 0.04]} /><meshToonMaterial color="#dfe6ee" /></mesh>
                    <mesh position={[-0.02, 0.02, -0.04]} rotation={[-0.3, 0, 0.4]}><boxGeometry args={[0.07, 0.012, 0.04]} /><meshToonMaterial color="#dfe6ee" /></mesh>
                </group>
            ))}
        </group>
    );
};

useGLTF.preload(RIVAL_URL);
export default Floor3Rival;
