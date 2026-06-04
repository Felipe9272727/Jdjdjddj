/**
 * Floor3Rival.tsx — "O Diabrete" in gameplay: the rubber-hose rival that
 * sprints ahead of the player up the endless parkour and PERFORMS the sabotage
 * loop (f3Hazards) as a series of little cartoon set-pieces:
 *
 *   • PAINT  — when he inks a new obstacle he runs to that platform, whips out
 *     a giant paintbrush and sweeps it across, the spikes inking in under his
 *     strokes, then dashes on.
 *   • DIZZY  — each time the player steals a brush he drops into a classic
 *     1930s "seeing stars" pose: knees buckled, body teetering, head lolling
 *     back, three little birds tweeting in orbit.
 *   • FALL   — once the third brush is gone he TRIPS (Huggy-Wuggy style):
 *     lurch, windmill-arm teeter on the edge, then topples forward and plummets
 *     tumbling into the void, handing off to the dedicated fall cutscene (which
 *     stages at the position published here via f3DevilPos).
 *
 * The skeleton + skinning is built in diabreteRig.ts (the GLB is rig-less);
 * here we only DRIVE the bones each frame with spring-damped rubber-hose motion.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { f3PlayerZ, nearestPlatform } from './f3Parkour';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3Progress, isDizzy, f3DevilPos, f3DevilPosValid } from './f3Hazards';
import { playFloor3Draw, playFloor3Dizzy } from './floor3Sfx';

const RIVAL_URL = '/diabrete.glb';
const LEAD_Z    = 14;
const MOVE_SPD  = 6.2;
const GRAVITY   = 22.0;
const ARM_DROP  = 0.85;
const NBIRDS    = 3;
const PAINT_DUR = 1.5;     // seconds the painting set-piece lasts
const CATCHUP_MULT = 3.6;  // speed boost after a stun, until he retakes his lead

// Brush-prop materials (held in the devil's hand while painting).
const handleMat  = new THREE.MeshToonMaterial({ color: '#e0a94a' });
const ferruleMat = new THREE.MeshToonMaterial({ color: '#c2c7cf' });
const bristleMat = new THREE.MeshToonMaterial({ color: '#1a1420' });
const tipMat     = new THREE.MeshToonMaterial({ color: '#c0271a' });

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
    const brushRef = useRef<THREE.Group | null>(null);

    const posRef = useRef(new THREE.Vector3(0, 0, LEAD_Z));
    const velY   = useRef(0);
    const onGnd  = useRef(true);
    const phase  = useRef(0);
    const tRef   = useRef(0);
    const inited = useRef(false);

    // Reaction state
    const prevDraw  = useRef(0);
    const paintT    = useRef(0);
    const paintZ    = useRef(0);
    const dizzyStop = useRef<null | (() => void)>(null);
    const wasDizzy  = useRef(false);
    const catchUp   = useRef(false);   // sprinting back to the lead after a stun

    const sBob  = useRef(new Spring(24, 8));
    const sLean = useRef(new Spring(14, 5));
    const landImpact = useRef(0);   // 0→1 squash spike on touchdown, decays fast

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;

        // Giant paintbrush prop, parented to the right-arm bone (so it tracks the
        // hand), lying along the arm (+X), bristles at the far tip. Hidden until
        // a painting set-piece.
        const brush = new THREE.Group();
        const h  = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 10), handleMat);  h.rotation.z = Math.PI / 2; h.position.x = 0.2;
        const fe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), ferruleMat);    fe.rotation.z = Math.PI / 2; fe.position.x = 0.43;
        const br = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), bristleMat);              br.rotation.z = -Math.PI / 2; br.position.x = 0.57;
        const tp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), tipMat);                    tp.position.x = 0.68;
        brush.add(h, fe, br, tp);
        brush.position.set(0.24, 0, 0);
        brush.visible = false;
        rig.bones[B.r_arm].add(brush);
        brushRef.current = brush;

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
        // Landing squash decays fast back to neutral (set on touchdown below).
        landImpact.current = Math.max(0, landImpact.current - safeDt / 0.16);

        // ── Defeated — hand off to the dedicated fall cutscene
        //    (Floor3FallCutscene), which owns its own cinematic camera + staging
        //    (trip → ledge grab → the player stomps his hand → plummet). Publish
        //    our last spot so it can stage there, then HIDE the gameplay rival so
        //    only the cutscene's devil is on screen.
        if (f3Progress.fell) {
            f3DevilPos.current.copy(groupRef.current.position);
            f3DevilPosValid.current = true;     // tell the fall cutscene this spot is real (not the sentinel)
            groupRef.current.visible = false;
            if (brushRef.current) brushRef.current.visible = false;
            for (const b of birdRefs.current) if (b) b.visible = false;
            if (dizzyStop.current) { dizzyStop.current(); dizzyStop.current = null; }
            return;
        }
        groupRef.current.visible = true;

        // ── Target & ground ─────────────────────────────────────────────────
        const dazed = isDizzy();
        const leadZ = f3PlayerZ.current + LEAD_Z;
        // (Re)spawn at the lead on first run AND whenever he's grossly desynced —
        // e.g. after a SALVAR respawn the course is rebuilt and the player is
        // teleported to the start, but this component stays mounted with a stale
        // position far up the (old) climb, so he'd appear to vanish and slowly
        // slide back. Snapping him to the fresh lead fixes that.
        if (!inited.current || Math.abs(posRef.current.z - leadZ) > 20) {
            inited.current = true;
            posRef.current.z = leadZ;
            const g0 = nearestPlatform(leadZ);
            posRef.current.x = g0.x; posRef.current.y = g0.topY;
            velY.current = 0; onGnd.current = true;
        }

        // Trigger a paint set-piece when a new obstacle is inked.
        if (f3Progress.drawFlashAt !== prevDraw.current) {
            prevDraw.current = f3Progress.drawFlashAt;
            if (f3Progress.drawFlashAt > 0 && !dazed) { paintT.current = PAINT_DUR; paintZ.current = f3Progress.drawZ; playFloor3Draw(); }
        }
        const painting = paintT.current > 0 && !dazed;
        if (painting) paintT.current = Math.max(0, paintT.current - safeDt);

        // Where he wants to be: at the obstacle while painting, else his lead.
        const targetZ = painting ? paintZ.current : leadZ;
        // Resolve the resting ground from his ACTUAL Z (the platform underfoot),
        // not the target — otherwise, while he's frozen dizzy (or sprinting to
        // catch up after) his Y chases a platform far ahead and he FLOATS. The
        // target only steers his horizontal weave toward the platform ahead.
        const standGnd = nearestPlatform(posRef.current.z);
        const moveGnd  = nearestPlatform(targetZ);
        const groundY = standGnd.topY, groundX = moveGnd.x;

        if (!dazed) {
            const dz = targetZ - posRef.current.z;
            // After a stun he SPRINTS back to his lead, then drops to cruising
            // speed once he's basically there.
            if (catchUp.current && Math.abs(dz) < 1.5) catchUp.current = false;
            const spd = painting ? MOVE_SPD * 1.6 : (catchUp.current ? MOVE_SPD * CATCHUP_MULT : MOVE_SPD);
            posRef.current.z += Math.sign(dz) * Math.min(Math.abs(dz), spd * safeDt);
            posRef.current.x += (groundX - posRef.current.x) * (1 - Math.exp(-6 * safeDt));
        }

        // Gravity / landing — SKIPPED while dizzy: he's frozen stiff on the spot
        // (his Y is held, so he never floats even if the climb scrolls under him).
        if (!dazed) {
            const yDiff = groundY - posRef.current.y;
            if (onGnd.current && yDiff > 0.28 && !painting) { velY.current = Math.sqrt(2 * GRAVITY * (yDiff + 0.5)) * 1.05; onGnd.current = false; }
            if (!onGnd.current) {
                velY.current -= GRAVITY * safeDt; posRef.current.y += velY.current * safeDt;
                if (posRef.current.y <= groundY && velY.current <= 0) {
                    landImpact.current = Math.min(1, Math.abs(velY.current) / 9);   // squash scaled by impact speed
                    posRef.current.y = groundY; velY.current = 0; onGnd.current = true;
                }
            } else { posRef.current.y += yDiff * (1 - Math.exp(-14 * safeDt)); }
        }
        groupRef.current.position.copy(posRef.current);
        groupRef.current.scale.setScalar(DIABRETE_SCALE);

        // ── DIZZY — classic "seeing stars" pose, FROZEN in place ─────────────
        if (dazed) {
            if (brushRef.current) brushRef.current.visible = false;
            if (!wasDizzy.current) { wasDizzy.current = true; if (dizzyStop.current) dizzyStop.current(); dizzyStop.current = playFloor3Dizzy(3000); }
            // He stays planted where he was zapped (no movement) — the player
            // closes in on him during the stun. On recovery he sprints to retake
            // the lead (catchUp), then resumes normal speed.
            groupRef.current.rotation.set(0, Math.sin(t * 1.5) * 0.3, Math.sin(t * 2.5) * 0.18);  // teetering
            bones[B.body].position.y = 0.46 - 0.08;                 // knees buckle → slump
            bones[B.body].rotation.set(sLean.current.tick(0.05, safeDt), 0, Math.sin(t * 3) * 0.12);
            bones[B.head].rotation.set(-0.32 + Math.sin(t * 3) * 0.12, 0, Math.sin(t * 4) * 0.42); // lolling
            bones[B.l_arm].rotation.set(Math.sin(t * 4) * 0.35, 0, 1.25);   // arms dangle, sway
            bones[B.r_arm].rotation.set(Math.sin(t * 4 + 1) * 0.35, 0, -1.25);
            bones[B.l_leg].rotation.set(0.22, 0, 0.26);             // knees splayed out
            bones[B.r_leg].rotation.set(0.22, 0, -0.26);
            for (let i = 0; i < birdRefs.current.length; i++) {
                const b = birdRefs.current[i]; if (!b) continue; b.visible = true;
                const a = t * 4 + (i / NBIRDS) * Math.PI * 2;
                b.position.set(Math.cos(a) * 0.42, 1.05 + Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.42);
                b.rotation.set(0, -a + Math.PI / 2, Math.sin(t * 18 + i) * 0.5);
            }
            rig.group.scale.set(1.05, 0.95, 1.05);
            return;
        }
        if (wasDizzy.current) { wasDizzy.current = false; catchUp.current = true; if (dizzyStop.current) { dizzyStop.current(); dizzyStop.current = null; } }
        for (const b of birdRefs.current) if (b) b.visible = false;

        // ── PAINT — sweep the giant brush; the spikes ink in beneath it ─────
        if (painting) {
            if (brushRef.current) brushRef.current.visible = true;
            groupRef.current.rotation.set(0, Math.PI * 0.28, 0);    // 3/4 turn so the strokes read
            const sweep = Math.sin(t * 9);
            bones[B.body].position.y = 0.46;
            bones[B.body].rotation.set(sLean.current.tick(0.42, safeDt), 0, 0);   // hunch over the work
            bones[B.head].rotation.set(0.35, sweep * 0.2, 0);                     // watching the brush
            // left hand on hip; right arm reaches down-forward and sweeps
            bones[B.l_arm].rotation.set(0.2, 0, 1.5);
            bones[B.r_arm].rotation.set(-0.5 + sweep * 0.7, sweep * 0.5, -1.35);
            bones[B.l_leg].rotation.set(0.06, 0, 0.04);
            bones[B.r_leg].rotation.set(-0.06, 0, -0.04);
            rig.group.scale.set(1, 1, 1);
            return;
        }
        if (brushRef.current) brushRef.current.visible = false;
        groupRef.current.rotation.set(0, 0, 0);

        // ── RUN ─────────────────────────────────────────────────────────────
        const air = !onGnd.current;
        if (!air) phase.current += safeDt * 2.6 * Math.PI * 2;
        const φ = phase.current; const sw = Math.sin(φ);

        bones[B.body].position.y = 0.46 + sBob.current.tick(air ? 0 : Math.abs(sw) * 0.075, safeDt);
        bones[B.body].rotation.set(sLean.current.tick(air ? -0.22 : 0.20, safeDt), air ? 0 : Math.sin(φ) * 0.10, air ? 0 : Math.sin(φ) * 0.06);
        bones[B.head].rotation.set(air ? -0.14 : 0.11 + Math.sin(φ * 2 + 0.6) * 0.06, 0, air ? 0 : Math.sin(φ + 0.3) * 0.08);
        bones[B.l_leg].rotation.set(air ? -0.5 :  sw * 0.78, 0, 0);
        bones[B.r_leg].rotation.set(air ? -0.5 : -sw * 0.78, 0, 0);
        bones[B.l_arm].rotation.set(air ? -0.7 : -sw * 1.05, 0,  (air ? 1.3 : ARM_DROP));
        bones[B.r_arm].rotation.set(air ? -0.7 :  sw * 1.05, 0, -(air ? 1.3 : ARM_DROP));

        let strY = air ? 1 + Math.abs(velY.current) * 0.011 : 1 - Math.abs(sw) * 0.06;
        strY *= 1 - 0.26 * landImpact.current;             // cartoon landing squash
        const strX = 1 / Math.sqrt(Math.max(0.5, strY));
        rig.group.scale.set(strX, strY, strX);
    });

    return (
        <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]}>
            {Array.from({ length: NBIRDS }).map((_, i) => (
                <group key={i} ref={(el) => { if (el) birdRefs.current[i] = el; }} visible={false}>
                    <mesh><sphereGeometry args={[0.055, 10, 8]} /><meshToonMaterial color="#ffffff" /></mesh>
                    <mesh position={[0.055, 0.015, 0]} rotation={[0, 0, -0.6]}>
                        <coneGeometry args={[0.022, 0.06, 6]} /><meshToonMaterial color="#e8a33a" />
                    </mesh>
                    <mesh position={[-0.02, 0.02, 0.04]} rotation={[0.3, 0, 0.4]}><boxGeometry args={[0.07, 0.012, 0.04]} /><meshToonMaterial color="#dfe6ee" /></mesh>
                    <mesh position={[-0.02, 0.02, -0.04]} rotation={[-0.3, 0, 0.4]}><boxGeometry args={[0.07, 0.012, 0.04]} /><meshToonMaterial color="#dfe6ee" /></mesh>
                </group>
            ))}
        </group>
    );
};

useGLTF.preload(RIVAL_URL);
export default Floor3Rival;
