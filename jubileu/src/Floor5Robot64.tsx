/**
 * Floor5Robot64.tsx — TROCO-64, the hotel's recreation robot.
 *
 * A chunky N64-era robot: boxy chrome body, screen face with emissive eyes,
 * an antenna bulb and a chest LED strip that CHASE while he talks (Felipe:
 * "animações quando for falar, tipo luzes ligando"). He hops out when the
 * elevator opens, pitches the race with full-body gestures, then runs his
 * own lane with a real AI:
 *   • predicts timed hazards (spinner / pushers / hammer) and WAITS for a
 *     safe window — sampling the same hazardHit() the player collides with;
 *   • steers across pads in the gap and weaves between the rolling balls;
 *   • hops ledges and steps with the same shared jump physics;
 *   • rubber-bands so the heat stays close — and rolls scripted "mistakes"
 *     so he sometimes eats an obstacle like anyone else.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    f5, stepRacer, makeRacer, groundHeightAt, ballsAt, hazardHit,
    type Racer, LANE_ROBOT, GAP, BALLS, SPINNERS, PUSHERS, PUSHER, HAMMER, STEPS, FINISH_Z,
    F5_FAREWELL,
} from './f5Race';
import { mat64, BlobShadow } from './Floor5Player64';
import { playF5Bonk, playF5Jump } from './floor5RaceSfx';

const B: React.FC<{ args: [number, number, number]; p?: [number, number, number]; m: THREE.Material }> =
    ({ args, p = [0, 0, 0], m }) => (
        <mesh position={p} material={m}><boxGeometry args={args} /></mesh>
    );

interface RobotRefs {
    root: THREE.Group | null; visual: THREE.Group | null; body: THREE.Group | null;
    head: THREE.Group | null; armL: THREE.Group | null; armR: THREE.Group | null;
    legL: THREE.Group | null; legR: THREE.Group | null; shadow: THREE.Group | null;
    bulb: THREE.MeshLambertMaterial | null;
    eyeL: THREE.MeshLambertMaterial | null; eyeR: THREE.MeshLambertMaterial | null;
    leds: THREE.MeshLambertMaterial[];
}

/** Scripted positions outside the race. */
const TALK_POS = new THREE.Vector3(0.5, 0, -11.2);
const GATE_POS = new THREE.Vector3(LANE_ROBOT, 0, -2.2);

export const Floor5Robot64: React.FC<{
    racer: React.MutableRefObject<Racer>;
    playerRacer: React.MutableRefObject<Racer>;
    talkingRef: React.MutableRefObject<boolean>;     // a speech bubble is typing
}> = ({ racer, playerRacer, talkingRef }) => {
    const R = useRef<RobotRefs>({
        root: null, visual: null, body: null, head: null, armL: null, armR: null,
        legL: null, legR: null, shadow: null, bulb: null, eyeL: null, eyeR: null, leds: [],
    });
    // AI scratchpad
    const ai = useRef({ revealT: 0, mistakeRolledAtZ: -999, blindUntilZ: -999, entered: false, waitT: 0, lastZ: -999, stallT: 0, sadT: 0 });
    const scratch = useRef(new THREE.Vector3()); // reused per frame (no alloc on the trot-to-gate path)

    const mats = useMemo(() => ({
        chrome: mat64('#9aa3ad'), chromeDk: mat64('#6a7480'), panel: mat64('#4a525c'),
        accent: mat64('#e8503a'), joint: mat64('#33383e'), screen: mat64('#101418'),
        eye: mat64('#16e0e8', '#16e0e8', 1), eye2: mat64('#16e0e8', '#16e0e8', 1),
        bulb: mat64('#ff5040', '#ff5040', 1),
        led0: mat64('#222', '#ffd24d', 0), led1: mat64('#222', '#4dff7a', 0), led2: mat64('#222', '#4da8ff', 0),
    }), []);
    R.current.bulb = mats.bulb; R.current.eyeL = mats.eye; R.current.eyeR = mats.eye2;
    R.current.leds = [mats.led0, mats.led1, mats.led2];

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = state.clock.elapsedTime;
        const r = racer.current;
        const refs = R.current;
        const phase = f5.phase;

        // ── where the script wants him outside the race ──
        if (phase === 'intro' || phase === 'talk') {
            // waits in the wings; hops in front of the doors once they open
            if (phase === 'talk' && !ai.current.entered) {
                r.x = THREE.MathUtils.lerp(r.x, TALK_POS.x, dt * 2.6);
                r.z = THREE.MathUtils.lerp(r.z, TALK_POS.z, dt * 2.6);
                r.y = Math.abs(Math.sin(t * 9)) * 0.3;             // entrance hops
                if (Math.abs(r.x - TALK_POS.x) < 0.25 && Math.abs(r.z - TALK_POS.z) < 0.25) { ai.current.entered = true; r.y = 0; }
            } else if (ai.current.entered) r.y = 0;
            r.facing = Math.PI;                                    // face the elevator (the camera)
        } else if (phase === 'reveal' || phase === 'walk' || phase === 'countdown') {
            // trot to the start gate, idle there facing the track
            const d = scratch.current.set(GATE_POS.x - r.x, GATE_POS.y, GATE_POS.z - r.z);
            if (d.length() > 0.3) {
                d.normalize();
                r.x += d.x * dt * 5.2; r.z += d.z * dt * 5.2;
                r.y = Math.abs(Math.sin(t * 10)) * 0.22;
                r.facing = Math.atan2(d.x, d.z);
                r.runPhase += dt * 9;
            } else {
                r.y = 0; r.facing = 0;
                // an eager hop every few seconds
                if (phase !== 'countdown' && Math.sin(t * 1.3) > 0.985) r.y = 0.18;
            }
        } else if (phase === 'race') {
            // ── THE AI ──
            const xRel = r.x - r.lane;
            let targetX = 0;                                       // lane-relative steer target
            let go = 1;                                            // throttle
            let wantJump = false;

            // gap: line up on the NEXT pad before hopping, never drift off the
            // side of the one underfoot, steer the rest mid-air
            if (r.z > GAP.z0 - 8 && r.z < GAP.z1 + 1) {
                const next = GAP.pads.find((p) => p.z - GAP.halfD > r.z + 0.2);
                const aim = next ? next.dx : 0;                    // past the last pad: exit straight
                const cur = GAP.pads.find((p) => Math.abs(r.z - p.z) <= GAP.halfD && Math.abs(xRel - p.dx) <= GAP.halfW);
                targetX = (cur && r.onGround)
                    ? THREE.MathUtils.clamp(aim, cur.dx - GAP.halfW + 0.6, cur.dx + GAP.halfW - 0.6)
                    : aim;
                const aligned = Math.abs(xRel - aim) < 1.35;
                const aheadGone = groundHeightAt(xRel, r.z + 1.0) === null;
                if (r.onGround && aheadGone && groundHeightAt(xRel, r.z) !== null) {
                    if (aligned) wantJump = true;
                    else go = 0.05;                                // sidle along the edge first
                }
            }
            // balls: weave away from the next incoming ball
            else if (r.z > BALLS.z0 - 5 && r.z < BALLS.z1) {
                const incoming = ballsAt(f5.clock)
                    .filter((b) => b.z > r.z - 1 && b.z < r.z + 11)
                    .sort((a, b) => a.z - b.z)[0];
                if (incoming) targetX = THREE.MathUtils.clamp(incoming.x + (xRel >= incoming.x ? 2.6 : -2.6), -3.3, 3.3);
            }
            // steps: hop each riser
            else if (r.z > STEPS[0].z0 - 3 && r.z < STEPS[2].z0 + 5) {
                const ahead = groundHeightAt(xRel, r.z + 1.0) ?? 0;
                if (r.onGround && ahead > r.y + 0.35) wantJump = true;
            }
            // spinner / hammer: hug a side — their arcs barely reach the rails
            for (const sp of SPINNERS) {
                if (r.z > sp.z - 7 && r.z < sp.z + sp.len + 1) targetX = xRel >= 0 ? 3.3 : -3.3;
            }
            if (r.z > HAMMER.z - 7 && r.z < HAMMER.z + 2) targetX = xRel >= 0 ? 3.5 : -3.5;

            // pushers: read the block's PHASE — cross on the side it just left
            let waiting = false;
            for (const p of PUSHERS) {
                const dz = p.z - r.z;
                if (dz < -0.5 || dz > 4.5) continue;
                if (ai.current.mistakeRolledAtZ < p.z - 8) {       // sometimes he just floors it
                    ai.current.mistakeRolledAtZ = p.z;
                    if (Math.random() < 0.18) ai.current.blindUntilZ = p.z + 2;
                }
                if (r.z < ai.current.blindUntilZ && ai.current.blindUntilZ > p.z - 1) break;
                const bx = Math.sin(f5.clock * PUSHER.w + p.phase) * PUSHER.amp;
                if (Math.abs(bx) > 1.4) {
                    targetX = -Math.sign(bx) * 2.8;                // far side of the block
                    if (Math.abs(xRel - targetX) > 1.6 && dz < 2.2) { go = 0.15; waiting = true; }
                } else if (dz < 2.4) {                             // block crossing the middle — hold
                    go = dz < 1.2 ? -0.1 : 0.1; waiting = true;
                }
                break;                                             // only the nearest one matters
            }

            // spinners + hammer: sample the next footfalls with the REAL hit test
            const timed: Array<{ z: number; span: number }> = [
                ...SPINNERS.map((s) => ({ z: s.z, span: s.len + 1 })),
                { z: HAMMER.z, span: 2.2 },
            ];
            for (const hz of timed) {
                const dz = hz.z - r.z;
                if (dz < 0.5 || dz > 5.5) continue;
                if (ai.current.mistakeRolledAtZ < hz.z - 8) {
                    ai.current.mistakeRolledAtZ = hz.z;
                    if (Math.random() < 0.18) ai.current.blindUntilZ = hz.z + hz.span;
                }
                if (r.z < ai.current.blindUntilZ && ai.current.blindUntilZ > hz.z - 1) continue;
                const speed = Math.max(3, Math.hypot(r.vx, r.vz));
                let danger = false;
                for (const k of [1, 2, 3, 4]) {
                    const zAhead = r.z + k * speed * 0.16;
                    if (zAhead > hz.z + hz.span) break;
                    if (hazardHit(targetX * 0.5 + xRel * 0.5, 0.2, zAhead, f5.clock + k * 0.16)) { danger = true; break; }
                }
                if (danger && dz < 3.4) { go = dz < 1.4 ? -0.15 : 0; waiting = true; }
            }
            // patience has limits: waiting too long (NOT tumbling) → SEND IT
            const slow = r.stun <= 0 && Math.hypot(r.vx, r.vz) < 1.2;
            ai.current.waitT = (waiting || slow) ? ai.current.waitT + dt : 0;
            if (ai.current.waitT > 2.4) {
                ai.current.blindUntilZ = r.z + 7;
                ai.current.waitT = 0;
            }

            // rubber-band: stay beatable, stay scary
            const lead = playerRacer.current.z - r.z;
            const speedMul = THREE.MathUtils.clamp(1 + lead * 0.014, 0.86, 1.15) * 0.97;

            const steer = THREE.MathUtils.clamp((targetX - xRel) * 0.9, -1, 1);
            const ev = stepRacer(r, { mx: steer, mz: go, jump: wantJump }, dt, f5.clock, false, speedMul);
            if (ev.hit || ev.fellRespawn) {
                if (r.z - playerRacer.current.z < 25) playF5Bonk();
                ai.current.blindUntilZ = -999;                     // pain is a great teacher
            }
            if (ev.jumped && Math.abs(r.z - playerRacer.current.z) < 20) playF5Jump();

            // progress watchdog: wedged on some geometry edge → step back to
            // the lane center a couple of meters and commit to the retry
            if (Math.abs(r.z - ai.current.lastZ) > 0.25) {
                ai.current.lastZ = r.z; ai.current.stallT = 0;
            } else if ((ai.current.stallT += dt) > 2.5) {
                r.x = r.lane; r.y = 0.1; r.z = Math.max(1, r.z - 2.5);
                r.vx = r.vy = r.vz = 0; r.onGround = true; r.stun = 0;
                ai.current.blindUntilZ = r.z + 8;
                ai.current.stallT = 0; ai.current.lastZ = r.z;
            }
        } else if (phase === 'finish') {
            // podium: dance if he won, slump if he lost
            r.vx = 0; r.vz = 0;
            const px = playerRacer.current;
            r.facing = Math.atan2(px.x - r.x, px.z - r.z);
            if (f5.winner === 'robot') r.y = Math.abs(Math.sin(t * 7)) * 0.45;
            else r.y = 0;
        } else if (phase === 'farewell') {
            // player is leaving — robot stands still, facing the elevator, slowly powering down
            r.vx = 0; r.vz = 0; r.y = 0;
            r.facing = Math.PI;
            ai.current.sadT += dt;
        }

        // ── pose the model ──
        const g = refs.root;
        if (g) g.position.set(r.x, r.y, r.z);
        const body = refs.body, vis = refs.visual;
        if (body) {
            let dy = r.facing - body.rotation.y;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            body.rotation.y += dy * Math.min(1, dt * 10);
        }
        if (vis) {
            if (r.stun > 0) { vis.rotation.x += dt * 12; vis.position.y = 0.3; }
            else { vis.rotation.x = THREE.MathUtils.lerp(vis.rotation.x % (Math.PI * 2), 0, Math.min(1, dt * 9)); vis.position.y = 0; }
        }
        const speed = Math.hypot(r.vx, r.vz);
        const run = Math.min(1, speed / 7);
        const ph = r.runPhase * 1.25;                              // scrappy little legs
        const rot = (gr: THREE.Group | null, rx: number) => { if (gr) gr.rotation.x = rx; };
        const talking = talkingRef.current && (phase === 'talk' || phase === 'finish' ||
            (phase === 'farewell' && F5_FAREWELL[f5.subLine]?.speaker === 'robot'));
        // sadness factor: 0 = normal, 1 = fully shut down (used during farewell)
        const sadness = phase === 'farewell' ? Math.min(1, ai.current.sadT / 7) : 0;
        if (!r.onGround && phase === 'race') {
            rot(refs.legL, -0.9); rot(refs.legR, -0.5);
            rot(refs.armL, -2.4); rot(refs.armR, -2.4);
        } else if (run > 0.12) {
            rot(refs.legL, Math.sin(ph) * 1.05 * run); rot(refs.legR, -Math.sin(ph) * 1.05 * run);
            rot(refs.armL, -Math.sin(ph) * 0.95 * run); rot(refs.armR, Math.sin(ph) * 0.95 * run);
            if (body) body.rotation.x = run * 0.16;
        } else if (talking) {
            // full-body pitch: alternating arm waves, head bobs and tilts
            const energy = 1 - sadness * 0.7;                      // sad = less energetic
            rot(refs.armL, -0.6 + Math.sin(t * 7) * 0.55 * energy);
            rot(refs.armR, -0.6 + Math.sin(t * 7 + Math.PI) * 0.55 * energy);
            if (refs.armL) refs.armL.rotation.z = 0.5 + Math.sin(t * 3.4) * 0.25;
            if (refs.armR) refs.armR.rotation.z = -0.5 - Math.sin(t * 3.1) * 0.25;
            if (refs.head) {
                refs.head.position.y = 1.62 + Math.abs(Math.sin(t * 6.6)) * 0.06 * energy - sadness * 0.12;
                refs.head.rotation.z = Math.sin(t * 2.2) * 0.10;
                refs.head.rotation.x = sadness * 0.35;             // droops forward as sadness grows
            }
            if (body) body.rotation.x = Math.sin(t * 6.6) * 0.03;
            rot(refs.legL, 0); rot(refs.legR, 0);
        } else if (phase === 'farewell') {
            // sad idle: arms hanging, head drooped
            rot(refs.armL, 0.4 + sadness * 0.3); rot(refs.armR, 0.4 + sadness * 0.3);
            if (refs.armL) refs.armL.rotation.z = 0.08;
            if (refs.armR) refs.armR.rotation.z = -0.08;
            if (refs.head) {
                refs.head.position.y = 1.62 - sadness * 0.14;
                refs.head.rotation.x = sadness * 0.45;
                refs.head.rotation.z = 0;
            }
            if (body) body.rotation.x = sadness * 0.08;
            rot(refs.legL, 0); rot(refs.legR, 0);
        } else {
            rot(refs.legL, 0); rot(refs.legR, 0);
            rot(refs.armL, Math.sin(t * 1.8) * 0.08); rot(refs.armR, -Math.sin(t * 1.8) * 0.08);
            if (refs.armL) refs.armL.rotation.z = 0.12;
            if (refs.armR) refs.armR.rotation.z = -0.12;
            if (refs.head) { refs.head.position.y = 1.62 + Math.sin(t * 2.6) * 0.02; refs.head.rotation.z = 0; refs.head.rotation.x = 0; }
            if (body) body.rotation.x = 0;
        }

        // ── the LIGHTS (his whole personality) ──
        const alive = 1 - sadness;                                  // fades to 0 on shutdown
        const bulb = refs.bulb;
        if (bulb) bulb.emissiveIntensity = (talking ? 1.6 + Math.sin(t * 14) * 1.2 : (phase === 'race' ? 2.2 : 0.7 + Math.sin(t * 2.2) * 0.3)) * alive;
        const blink = Math.sin(t * 0.9) > 0.97;                    // a slow robot blink
        const eyeScale = talking ? 1 + Math.sin(t * 16) * 0.25 : 1;
        for (const e of [refs.eyeL, refs.eyeR]) if (e) e.emissiveIntensity = (blink ? 0.1 : eyeScale) * alive;
        refs.leds.forEach((led, i) => {
            const chase = talking
                ? (Math.floor(t * 8) % 3 === i ? 1.8 : 0.1)        // chasing while he talks
                : phase === 'race'
                    ? (Math.floor(t * 12) % 3 === i ? 1.6 : 0.2)   // strobing at speed
                    : (Math.sin(t * 2 + i * 1.1) > 0.4 ? 0.9 : 0.12);
            led.emissiveIntensity = chase * alive;
        });
        // shadow
        if (refs.shadow) {
            const gh = groundHeightAt(r.x - r.lane, r.z);
            refs.shadow.position.y = ((phase === 'race' ? gh : 0) ?? GAP.foamY) - r.y + 0.03;
        }
    });

    return (
        <group ref={(n) => { R.current.root = n; }}>
            <group ref={(n) => { R.current.shadow = n; }}><BlobShadow size={1.7} /></group>
            <group ref={(n) => { R.current.visual = n; }}>
                <group ref={(n) => { R.current.body = n; }}>
                    {/* piston legs + big flat feet */}
                    <group ref={(n) => { R.current.legL = n; }} position={[-0.2, 0.74, 0]}>
                        <B args={[0.16, 0.42, 0.16]} p={[0, -0.22, 0]} m={mats.joint} />
                        <B args={[0.3, 0.14, 0.46]} p={[0, -0.48, 0.06]} m={mats.chromeDk} />
                    </group>
                    <group ref={(n) => { R.current.legR = n; }} position={[0.2, 0.74, 0]}>
                        <B args={[0.16, 0.42, 0.16]} p={[0, -0.22, 0]} m={mats.joint} />
                        <B args={[0.3, 0.14, 0.46]} p={[0, -0.48, 0.06]} m={mats.chromeDk} />
                    </group>
                    {/* torso: chrome shell, dark panel, the LED strip */}
                    <B args={[0.78, 0.62, 0.5]} p={[0, 1.06, 0]} m={mats.chrome} />
                    <B args={[0.58, 0.4, 0.04]} p={[0, 1.06, 0.26]} m={mats.panel} />
                    {[0, 1, 2].map((i) => (
                        <B key={i} args={[0.12, 0.12, 0.03]} p={[-0.17 + i * 0.17, 1.06, 0.29]} m={R.current.leds[i] ?? mats.panel} />
                    ))}
                    <B args={[0.84, 0.1, 0.56]} p={[0, 0.72, 0]} m={mats.accent} />
                    {/* arms with claw hands */}
                    <group ref={(n) => { R.current.armL = n; }} position={[-0.5, 1.3, 0]}>
                        <B args={[0.16, 0.44, 0.16]} p={[0, -0.2, 0]} m={mats.chromeDk} />
                        <B args={[0.07, 0.16, 0.12]} p={[-0.04, -0.5, 0.04]} m={mats.joint} />
                        <B args={[0.07, 0.16, 0.12]} p={[0.04, -0.5, -0.04]} m={mats.joint} />
                    </group>
                    <group ref={(n) => { R.current.armR = n; }} position={[0.5, 1.3, 0]}>
                        <B args={[0.16, 0.44, 0.16]} p={[0, -0.2, 0]} m={mats.chromeDk} />
                        <B args={[0.07, 0.16, 0.12]} p={[-0.04, -0.5, 0.04]} m={mats.joint} />
                        <B args={[0.07, 0.16, 0.12]} p={[0.04, -0.5, -0.04]} m={mats.joint} />
                    </group>
                    {/* head: screen face + emissive eyes + antenna bulb */}
                    <group ref={(n) => { R.current.head = n; }} position={[0, 1.62, 0]}>
                        <B args={[0.56, 0.44, 0.46]} p={[0, 0.24, 0]} m={mats.chrome} />
                        <B args={[0.44, 0.3, 0.03]} p={[0, 0.24, 0.235]} m={mats.screen} />
                        <B args={[0.1, 0.12, 0.03]} p={[-0.11, 0.26, 0.255]} m={mats.eye} />
                        <B args={[0.1, 0.12, 0.03]} p={[0.11, 0.26, 0.255]} m={mats.eye2} />
                        <B args={[0.5, 0.05, 0.5]} p={[0, 0.49, 0]} m={mats.accent} />
                        <mesh position={[0, 0.62, 0]} material={mats.joint}><cylinderGeometry args={[0.025, 0.025, 0.22, 6]} /></mesh>
                        <mesh position={[0, 0.76, 0]} material={mats.bulb}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
                        {/* ear bolts */}
                        <B args={[0.06, 0.12, 0.12]} p={[-0.31, 0.24, 0]} m={mats.accent} />
                        <B args={[0.06, 0.12, 0.12]} p={[0.31, 0.24, 0]} m={mats.accent} />
                    </group>
                </group>
            </group>
        </group>
    );
};

export function makeRobotRacer(): Racer {
    // begins OFF-STAGE right of the elevator; the intro hops him in
    const r = makeRacer(LANE_ROBOT, 7.5, -13.5);
    r.facing = Math.PI;
    return r;
}
