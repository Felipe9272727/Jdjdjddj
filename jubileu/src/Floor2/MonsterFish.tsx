/**
 * Floor2/MonsterFish.tsx — Deep-sea shark predator using a real rigged GLB.
 *
 * Model: poly.pizza CC0 shark — 20 bones, 3 skinned animations
 *   Swim      → patrol / regroup
 *   Swim_Fast → hunting
 *   Swim_Bite → lunge attack
 *
 * AI: dormant → awakening (11 s) → patrol → hunting → lunge → [jumpscare] → regroup
 */

import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import {
    UW_ROCK_COLLIDERS, UW_PILLAR_COLLIDERS, SWIM_THRESHOLD_Y,
} from './constants';
import { resolveUWWalls, uwFloorHeight, resolveUWObstacles } from './geometry';
import { sharkDirector } from '../ai/AIDirector';
import { sharkSteer, interceptTime } from '../ai/contextSteering';
import { findPath } from '../ai/navGrid';

// ─── Context-steering danger field ──────────────────────────────────────────
// Writes a danger lobe into the shared context map for every rock, pillar and
// cave wall within look-ahead range of (fx,fz). The shark then picks the
// best collision-free heading — visibly weaving through the arches and the
// organic wall bulges instead of grinding along them. `agentR` is the shark's
// body half-width; `range` the steering look-ahead.
//
// CRITICAL — depth gating: the steering ring is purely horizontal, so a rock is
// only allowed to block a heading when it actually sits at the shark's swim
// depth. Without this, the seafloor boulders (y≈-28) projected a horizontal
// "wall" of danger up through the whole water column, deflecting the shark away
// from the player whenever the goal lay past a boulder — the real reason it
// "couldn't find the way". Pillars are full-height cylinders, so they always
// count. (The 3D resolveUWObstacles push-out is the matching hard constraint.)
function _writeObstacleDanger(fx: number, fy: number, fz: number, agentR: number, range: number): void {
    for (let i = 0; i < UW_ROCK_COLLIDERS.length; i++) {
        const r = UW_ROCK_COLLIDERS[i];
        if (Math.abs(fy - r.y) > r.r + agentR) continue;   // shark is above/below this rock → no horizontal block
        const dx = r.x - fx, dz = r.z - fz;
        const d = Math.hypot(dx, dz);
        if (d - r.r < range) sharkSteer.addDanger(dx, dz, d, r.r + agentR, range);
    }
    for (let i = 0; i < UW_PILLAR_COLLIDERS.length; i++) {
        const p = UW_PILLAR_COLLIDERS[i];
        const dx = p.x - fx, dz = p.z - fz;
        const d = Math.hypot(dx, dz);
        if (d - p.r < range) sharkSteer.addDanger(dx, dz, d, p.r + agentR, range);
    }
    // Four cave walls as danger pointing at the nearest plane. The vector
    // self→wall has magnitude = distance to that plane; er=0 (the plane itself).
    const WP = 30;
    const dN = WP + fz; if (dN < range) sharkSteer.addDanger(0, -dN, dN, 0, range); // north z=-30
    const dS = WP - fz; if (dS < range) sharkSteer.addDanger(0,  dS, dS, 0, range); // south z=+30
    const dW = WP + fx; if (dW < range) sharkSteer.addDanger(-dW, 0, dW, 0, range); // west  x=-30
    const dE = WP - fx; if (dE < range) sharkSteer.addDanger( dE, 0, dE, 0, range); // east  x=+30
}

// ─── AI constants ─────────────────────────────────────────────────────────────
// Speeds roughly halved — the shark is deliberately much slower now so the
// player can sweep the seabed for shards and finish Floor 2 without a constant
// frantic chase. It still hunts and lunges, just at a far more beatable pace.
const PATROL_SPEED   = 1.5;
const HUNT_SPEED_MIN = 2.0;
const HUNT_SPEED_MAX = 4.2;
const LUNGE_SPEED    = 10.5;
// The shark is now ~20 units long (scale 3.6), so lunge/catch trigger on the
// MOUTH reaching the player, not the body centre — hence the larger radii.
const LUNGE_DIST     = 11.0;
const CATCH_DIST     = 6.0;
const REGROUP_TIME   = 5.0;
const AWARENESS_DIST = 42.0;
const SPAWN_POS      = new THREE.Vector3(-22, -20, -22);
const AWAKEN_DELAY   = 6.0;
const BERSERK_HUNT_MULT  = 1.35;
const BERSERK_LUNGE_MULT = 1.45;

// ─── Sensory perception AI ──────────────────────────────────────────────────
// The shark no longer omnisciently knows where the player is. It builds an
// "alertness" value (0..1) every frame from two independent senses:
//   • VISION  — player inside a forward cone, in range, with unobstructed
//               line of sight (rocks / pillars actually break sight).
//   • HEARING — a noise bubble whose radius grows with how fast the player is
//               moving. Holding still shrinks it to almost nothing, so a
//               motionless diver behind a boulder is effectively invisible.
// Alertness rises fast when perceived and decays slowly when not — so losing
// the shark means breaking BOTH senses for a couple of seconds, after which it
// falls back to investigating your last known position. This gives the level
// real stealth counterplay instead of a permanent distance-triggered chase.
const VISION_RANGE    = 44.0;   // max sight distance
const VISION_DOT      = 0.05;   // forward-cone gate: dot(forward,toPlayer) > this (~175° FOV)
const HEARING_MIN     = 7.0;    // always-hear bubble, even motionless
const HEARING_MAX     = 38.0;   // cap on hearing radius when thrashing
const HEARING_NOISE_K = 3.4;    // hearing radius gained per unit of player speed
const ALERT_RISE      = 3.2;    // alertness/sec while the player is perceived
const ALERT_DECAY     = 0.24;   // alertness/sec lost when hidden — stays committed
const ALERT_HUNT_ON   = 0.60;   // alertness needed to begin hunting
const ALERT_HUNT_OFF  = 0.24;   // drop below → lose the trail, investigate
const LOS_SAMPLES     = 6;      // ray-march steps for line-of-sight occlusion
const BERSERK_HEARING_MULT = 1.6; // enraged shark senses far more sharply

// ─── Line-of-sight test ─────────────────────────────────────────────────────
// Marches the segment shark→player and returns true if any rock sphere or
// coral pillar blocks it. Cheap: LOS_SAMPLES × (rocks + pillars), only ever
// called while the shark is active and the player is within VISION_RANGE.
function _segmentBlocked(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
): boolean {
    for (let s = 1; s < LOS_SAMPLES; s++) {
        const u  = s / LOS_SAMPLES;
        const sx = ax + (bx - ax) * u;
        const sy = ay + (by - ay) * u;
        const sz = az + (bz - az) * u;
        for (let i = 0; i < UW_ROCK_COLLIDERS.length; i++) {
            const r = UW_ROCK_COLLIDERS[i];
            const dx = sx - r.x, dy = sy - r.y, dz = sz - r.z;
            if (dx*dx + dy*dy + dz*dz < r.r * r.r) return true;
        }
        for (let i = 0; i < UW_PILLAR_COLLIDERS.length; i++) {
            const p = UW_PILLAR_COLLIDERS[i];
            const dx = sx - p.x, dz = sz - p.z;
            if (dx*dx + dz*dz < p.r * p.r) return true;
        }
    }
    return false;
}

// ms before the DOM overlay fires so the player sees the shark up-close first
const JUMPSCARE_DELAY = 0.28;

const SHARK_URL = '/models/monster/shark.glb';
useGLTF.preload(SHARK_URL);

type FishState      = 'dormant' | 'awakening' | 'patrol' | 'hunting' | 'lunge' | 'regroup' | 'investigating';
type JumpscarePhase = 'none' | 'rush' | 'done';


// ─── Props ────────────────────────────────────────────────────────────────────
export interface MonsterFishProps {
    playerPositionRef:    React.MutableRefObject<THREE.Vector3>;
    collectedShards:      Set<number>;
    onPlayerCaught:       () => void;
    monsterPositionRef?:  React.MutableRefObject<THREE.Vector3>;
    monsterProximityRef?: React.MutableRefObject<number>;
    berserk?:             boolean;
    cameraShakeRef?:      React.MutableRefObject<boolean>;
}

export const MonsterFish: React.FC<MonsterFishProps> = ({
    playerPositionRef,
    collectedShards,
    onPlayerCaught,
    monsterPositionRef,
    monsterProximityRef,
    berserk = false,
    cameraShakeRef,
}) => {
    const { scene, animations } = useGLTF(SHARK_URL) as any;
    const rootRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
    const currentAnimRef = useRef('');

    // Clone scene once. CRITICAL: the shark is a *skinned* mesh, so we must use
    // SkeletonUtils.clone — a plain Object3D.clone(true) leaves the cloned
    // SkinnedMesh bound to the ORIGINAL skeleton, which makes it collapse to a
    // point / render invisible (the long-standing "shark is invisible" bug).
    //
    // Visibility fix: deep water has almost no light + the atlas material is
    // semi-metallic, so a normally-lit shark reads as a black blob. We make it
    // SELF-ILLUMINATED — its own base-colour texture is reused as an emissive
    // map with a cold tint, so the shark is always clearly visible regardless
    // of scene lighting, and we kill metalness so it never renders black.
    // frustumCulled=false stops the animated skin from being culled when its
    // deformed bounds drift outside the bind-pose bounding sphere.
    const clonedScene = useMemo(() => {
        const clone = SkeletonUtils.clone(scene as THREE.Object3D) as THREE.Group;
        clone.traverse((child: any) => {
            if (child.isSkinnedMesh || child.isMesh) {
                const src = child.material as THREE.MeshStandardMaterial;
                const m = src.clone();
                m.metalness = 0.0;            // never render black in dark water
                m.roughness = 0.65;
                if (m.map) {
                    m.emissiveMap = m.map;    // self-lit using its own texture
                    m.emissive = new THREE.Color(0x8fb4d8);
                    m.emissiveIntensity = 0.7;
                } else {
                    m.emissive = new THREE.Color(0x2a3a4a);
                    m.emissiveIntensity = 0.6;
                }
                m.toneMapped = true;
                m.needsUpdate = true;
                child.material = m;
                child.castShadow = false;
                child.receiveShadow = false;
                child.frustumCulled = false;  // animated skin must not be culled
                child.visible = true;
            }
        });
        return clone;
    }, [scene]);

    // AnimationMixer — GPU skinning, zero JS bone math per frame
    useEffect(() => {
        const mixer = new THREE.AnimationMixer(clonedScene);
        mixerRef.current = mixer;
        const acts: Record<string, THREE.AnimationAction> = {};

        for (const clip of (animations as THREE.AnimationClip[])) {
            // Names have long repeated prefixes: "SharkArmature|...|Swim_Fast|..." → "Swim_Fast"
            const short = clip.name.split('|').pop() ?? clip.name;
            const action = mixer.clipAction(clip, clonedScene);
            action.setLoop(THREE.LoopRepeat, Infinity);
            acts[short] = action;
        }
        actionsRef.current = acts;

        // Start idle
        acts['Swim']?.play();
        currentAnimRef.current = 'Swim';

        return () => { mixer.stopAllAction(); };
    }, [clonedScene, animations]);

    // ─── Smooth animation crossfade ─────────────────────────────────────────
    const playAnim = useCallback((name: string, fadeIn = 0.35) => {
        if (currentAnimRef.current === name) return;
        const acts = actionsRef.current;
        const next = acts[name];
        if (!next) return;
        const prev = acts[currentAnimRef.current];
        if (prev?.isRunning()) {
            next.reset().play();
            next.crossFadeFrom(prev, fadeIn, true);
        } else {
            next.reset().play();
        }
        currentAnimRef.current = name;
    }, []);

    // ─── AI state ───────────────────────────────────────────────────────────
    const pos         = useRef(SPAWN_POS.clone());
    const vel         = useRef(new THREE.Vector3());
    const state       = useRef<FishState>('dormant');
    const regroup     = useRef(0);
    const lDir        = useRef(new THREE.Vector3());
    const patrolT     = useRef(0);
    const caught      = useRef(false);
    const active      = useRef(false);
    const awakenTimer = useRef(0);
    const callbackFired = useRef(false);  // ensures onPlayerCaught fires exactly once

    // Jumpscare
    const jsPhase  = useRef<JumpscarePhase>('none');
    const jsTimer  = useRef(0);
    const jsTarget = useRef(new THREE.Vector3());

    // Predictive AI — velocity tracking and investigation state
    const playerVelRef     = useRef(new THREE.Vector3());
    const lastPlayerPosRef = useRef<THREE.Vector3 | null>(null);
    const lastKnownPosRef  = useRef(new THREE.Vector3());
    const investigateTimer = useRef(0);

    // Sensory perception — continuous alertness meter (0..1) + fill-light tell
    const alertness   = useRef(0);
    const fillLightRef = useRef<THREE.PointLight>(null);
    const _calm       = useMemo(() => new THREE.Color('#5090c8'), []); // unaware → cold blue
    const _enraged    = useMemo(() => new THREE.Color('#ff3322'), []); // locked-on → blood red

    // AI Director search target (occupancy-grid best guess for investigation)
    const _searchTgt = useRef(new THREE.Vector3());

    // Reset the drama director / spatial memory whenever the shark (re)mounts.
    useEffect(() => { sharkDirector.reset(); return () => sharkDirector.reset(); }, []);

    // Reusable temp vectors — never allocate in useFrame
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());
    const _v3 = useRef(new THREE.Vector3());
    const _steer = useRef(new THREE.Vector3());   // context-steering output (XZ)
    // Anti-stuck: track real displacement; if pinned while trying to move, fire
    // a timed escape impulse toward open water.
    const lastPos    = useRef(new THREE.Vector3(-22, -20, -22));
    const stuckT     = useRef(0);
    const escapeT    = useRef(0);
    const escapeCount = useRef(0); // consecutive escapes without progress → teleport
    // A* navigation — the shark plans a path of free cells to its goal and
    // follows the waypoints, so it routes AROUND pillar/rock clusters instead of
    // getting trapped in a local-minimum ravine. Re-planned on a short timer.
    const navPath  = useRef<number[]>([]);   // [x0,z0,x1,z1,…] world XZ waypoints
    const navIdx   = useRef(0);
    const navTimer = useRef(0);
    const navGoal  = useRef(new THREE.Vector3());

    // ─── Main loop ──────────────────────────────────────────────────────────
    useFrame(({ clock }, dt) => {
        const g = rootRef.current;
        if (!g) return;
        const t = clock.elapsedTime;
        const safeDt = Math.min(dt, 0.05);

        // Tick the animation mixer (GPU skinning)
        mixerRef.current?.update(safeDt);

        // Activate once first shard is collected
        if (!active.current && collectedShards.size >= 1) {
            active.current = true;
            state.current = 'awakening';
            awakenTimer.current = AWAKEN_DELAY;
        }

        const playerY = playerPositionRef.current?.y ?? 0;
        if (state.current === 'dormant' || !active.current || playerY >= SWIM_THRESHOLD_Y) {
            if (monsterProximityRef) monsterProximityRef.current = 0;
            g.visible = false;
            return;
        }
        g.visible = true;

        // Awakening — stirs gently in the dark
        if (state.current === 'awakening') {
            awakenTimer.current -= safeDt;
            g.position.copy(SPAWN_POS);
            if (monsterPositionRef) monsterPositionRef.current.copy(SPAWN_POS);
            const ad = SPAWN_POS.distanceTo(playerPositionRef.current);
            if (monsterProximityRef) monsterProximityRef.current = Math.max(0, 1 - ad / AWARENESS_DIST) * 0.25;
            playAnim('Swim');
            if (awakenTimer.current <= 0) state.current = 'patrol';
            return;
        }

        const pp = playerPositionRef.current;
        const px = pp?.x ?? 0, py = pp?.y ?? -10, pz = pp?.z ?? 0;

        // ── Predictive AI: track player velocity (smoothed) ─────────────────
        if (lastPlayerPosRef.current) {
            _v3.current.set(
                px - lastPlayerPosRef.current.x,
                py - lastPlayerPosRef.current.y,
                pz - lastPlayerPosRef.current.z,
            ).divideScalar(safeDt);
            playerVelRef.current.lerp(_v3.current, safeDt * 4);
        } else {
            lastPlayerPosRef.current = new THREE.Vector3(px, py, pz);
        }
        lastPlayerPosRef.current.set(px, py, pz);
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dxp = px - fx, dyp = py - fy, dzp = pz - fz;
        const dist      = Math.sqrt(dxp*dxp + dyp*dyp + dzp*dzp);
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);

        if (monsterPositionRef) monsterPositionRef.current.set(fx, fy, fz);
        if (monsterProximityRef) monsterProximityRef.current = proximity;

        // ── Sensory perception: fuse vision + hearing into alertness ─────────
        // The AI Director sharpens or dulls the senses (read last frame's value).
        const senseMult     = sharkDirector.perceptionMult;
        // Hearing radius swells with the player's speed (their "noise").
        const playerNoise   = playerVelRef.current.length();
        const hearMult      = (berserk ? BERSERK_HEARING_MULT : 1) * senseMult;
        const hearingRadius = Math.min(HEARING_MIN + playerNoise * HEARING_NOISE_K, HEARING_MAX) * hearMult;
        const heard         = dist < hearingRadius;
        // Vision: in range + inside forward cone + unobstructed line of sight.
        let seen = false;
        if (dist < VISION_RANGE * hearMult && dist > 0.001) {
            const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
            const dot = (dxp * fwd.x + dyp * fwd.y + dzp * fwd.z) / dist;
            if (dot > VISION_DOT && !_segmentBlocked(fx, fy, fz, px, py, pz)) seen = true;
        }
        const perceived = seen || heard;
        // Rise fast when perceived, decay slowly when the player is hidden.
        if (perceived) {
            alertness.current = Math.min(1, alertness.current + ALERT_RISE * safeDt);
            lastKnownPosRef.current.set(px, py, pz);   // remember where we last had them
        } else {
            alertness.current = Math.max(0, alertness.current - ALERT_DECAY * safeDt);
        }

        // ── AI Director: feed observations, pull fresh directives ────────────
        sharkDirector.update({
            dt: safeDt, dist, awareness: AWARENESS_DIST, perceived,
            alertness: alertness.current, playerSpeed: playerNoise,
            shards: collectedShards.size, inLunge: state.current === 'lunge',
            berserk, px, pz,
        });

        // Tension (heartbeat / dread audio / DOM darkness) follows real detection
        // AND the Director's drama intensity → adaptive audio: the dread swells
        // during a "peak" assault and recedes during a "respite", not just by
        // raw distance.
        if (monsterProximityRef) {
            monsterProximityRef.current = Math.max(
                proximity, alertness.current * 0.9, sharkDirector.intensity * 0.85,
            );
        }
        // Visual tell: the fill light bleeds from cold blue → blood red as the
        // shark locks on, and brightens with alertness. Lets the player read
        // the predator's state and reward stealth (stay blue = stay hidden).
        if (fillLightRef.current) {
            fillLightRef.current.color.copy(_calm).lerp(_enraged, alertness.current);
            fillLightRef.current.intensity = 8 + alertness.current * 10;
        }

        // ── Jumpscare — the 3D shark IS the scare (no 2D overlay art) ────────
        if (jsPhase.current !== 'none') {
            jsTimer.current += safeDt;
            const jt = jsTimer.current;

            // Lock the biting animation and flare the fill light blood-red and
            // bright so the maw is fully lit as it engulfs the camera.
            playAnim('Swim_Bite', 0.05);
            if (fillLightRef.current) {
                fillLightRef.current.color.copy(_enraged);
                fillLightRef.current.intensity = 26;
                fillLightRef.current.distance = 26;
            }

            // Brief beat of raw terror (the player sees the maw fill the screen)
            // before the DOM impact/vignette overlay fires.
            if (!callbackFired.current && jt >= JUMPSCARE_DELAY) {
                callbackFired.current = true;
                if (cameraShakeRef) cameraShakeRef.current = false;
                onPlayerCaught();
            }

            if (jsPhase.current === 'rush') {
                // Lunge slightly PAST the camera so the open mouth swallows the
                // whole view instead of stopping politely in front of it.
                const tp = jsTarget.current;
                const rdx = tp.x - pos.current.x;
                const rdy = tp.y - pos.current.y;
                const rdz = tp.z - pos.current.z;
                const rl  = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz) + 0.001;
                const rushSpd = 60;
                vel.current.set(rdx / rl * rushSpd, rdy / rl * rushSpd, rdz / rl * rushSpd);
                pos.current.x += vel.current.x * safeDt;
                pos.current.y += vel.current.y * safeDt;
                pos.current.z += vel.current.z * safeDt;
                // Overshoot: once we're basically on the camera, keep drifting in
                // along the same heading so the maw stays filling the frame.
                g.position.copy(pos.current);
                if (jt > 1.2) jsPhase.current = 'done';
            }
            _updateOrientation(g, safeDt, true);
            return;
        }

        // ── Shard-based difficulty scaling ───────────────────────────────────
        const shardMult = 1 + collectedShards.size * 0.18;

        // ── State transitions — driven by perception, not raw distance ───────
        switch (state.current) {
            case 'patrol':
                // Only give chase once the shark actually detects the player.
                if (alertness.current >= ALERT_HUNT_ON) state.current = 'hunting';
                break;
            case 'hunting':
                // Lost track of the player → investigate last known position
                if (alertness.current < ALERT_HUNT_OFF) {
                    investigateTimer.current = 14.0;
                    state.current = 'investigating';
                } else if (dist < LUNGE_DIST * sharkDirector.aggression) {
                    // Director aggression widens/loosens the commit window: it
                    // pounces from farther and at a worse angle during a "peak".
                    _v1.current.set(dxp, dyp, dzp).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    const dotGate = 0.45 - (sharkDirector.aggression - 1) * 0.2;
                    if (fwd.dot(_v1.current) > dotGate || dist < 2.8) {
                        state.current = 'lunge';
                        lDir.current.set(dxp / dist, dyp / dist, dzp / dist);
                    }
                }
                break;
            case 'investigating':
                if (alertness.current >= ALERT_HUNT_ON) {
                    // Re-acquired the player — resume the hunt
                    state.current = 'hunting';
                } else {
                    investigateTimer.current -= safeDt;
                    const dxi = lastKnownPosRef.current.x - fx;
                    const dyi = lastKnownPosRef.current.y - fy;
                    const dzi = lastKnownPosRef.current.z - fz;
                    const di  = Math.sqrt(dxi*dxi + dyi*dyi + dzi*dzi);
                    // Reached the last known spot (and they're not here) or gave up → patrol
                    if (di < 3.0 || investigateTimer.current <= 0) state.current = 'patrol';
                }
                break;
            case 'lunge':
                if (dist < CATCH_DIST && !caught.current) {
                    caught.current = true;
                    jsPhase.current = 'rush';
                    jsTimer.current = 0;
                    jsTarget.current.copy(pp);
                    if (cameraShakeRef) cameraShakeRef.current = true;
                }
                if (dist > LUNGE_DIST + 6) {
                    state.current = 'regroup';
                    regroup.current = REGROUP_TIME;
                }
                break;
            case 'regroup':
                regroup.current -= safeDt;
                if (regroup.current <= 0) {
                    state.current = 'hunting';
                    caught.current = false;
                    callbackFired.current = false;
                }
                break;
        }

        // ── Animation selection ──────────────────────────────────────────────
        if (state.current === 'lunge') {
            playAnim('Swim_Bite', 0.12);
        } else if (state.current === 'hunting' || state.current === 'investigating') {
            playAnim('Swim_Fast', 0.5);
        } else {
            playAnim('Swim', 0.8);
        }

        // ── Movement ─────────────────────────────────────────────────────────
        // A*-guided steering: plan a path of free cells to (gx,gz), follow its
        // waypoints, and use context steering only for the fine avoidance along
        // the cleared corridor. This is what stops the shark dead-ending in a
        // ravine — the global path always has a way out. Re-plans every ~0.4s or
        // when the goal jumps. Writes the chosen unit heading into _steer.
        const navSteer = (gx: number, gz: number, agentR: number, range: number): void => {
            navTimer.current -= safeDt;
            const goalMoved = Math.hypot(gx - navGoal.current.x, gz - navGoal.current.z) > 4;
            if (navTimer.current <= 0 || goalMoved || navPath.current.length === 0) {
                findPath(fx, fz, gx, gz, navPath.current);
                navIdx.current = 0;
                navGoal.current.set(gx, 0, gz);
                navTimer.current = 0.4;
            }
            // Default to steering straight at the goal (used when A* found no path).
            let wx = gx, wz = gz;
            const path = navPath.current;
            if (path.length >= 2) {
                // Advance past any waypoints we've already reached.
                while (navIdx.current * 2 + 1 < path.length) {
                    const cwx = path[navIdx.current * 2], cwz = path[navIdx.current * 2 + 1];
                    if (Math.hypot(cwx - fx, cwz - fz) < 2.4) navIdx.current++;
                    else break;
                }
                const i = Math.min(navIdx.current * 2, path.length - 2);
                wx = path[i]; wz = path[i + 1];
            }
            sharkSteer.reset();
            sharkSteer.addInterest(wx - fx, wz - fz, 1);
            _writeObstacleDanger(fx, fy, fz, agentR, range);
            // When pick() reports the local ring is fully boxed in, its fallback
            // is the least-dangerous slot — which near a corner points BACK into
            // the corner and strands the shark. But the A* segment to the next
            // waypoint is line-of-sight clear by construction, so the safe move
            // is simply to head straight at the waypoint. This is the seam where
            // global planning (A*) overrides local steering's dead-end panic.
            if (!sharkSteer.pick(_steer.current)) {
                const dxw = wx - fx, dzw = wz - fz;
                const l = Math.hypot(dxw, dzw) || 1;
                _steer.current.x = dxw / l;
                _steer.current.z = dzw / l;
            }
        };

        // Escape override — when the watchdog flags the shark as stuck it heads
        // for open water via a FRESH A* path to the cave centre, so it threads
        // out around whatever it's wedged against instead of grinding into it.
        if (escapeT.current > 0) {
            escapeT.current -= safeDt;
            navSteer(0, 0, 1.0, 11);   // path to centre, wide clearance
            _v1.current.set(_steer.current.x * 9, 3.5, _steer.current.z * 9);
            vel.current.lerp(_v1.current, safeDt * 8);
        } else
        switch (state.current) {
            case 'patrol': {
                // Steered patrol — orbit a point but A*-route around obstacles and
                // keep clear of the seafloor, so it never grinds into geometry.
                patrolT.current += safeDt * 0.28;
                const tx = Math.cos(patrolT.current) * 9 + px * 0.5;
                const tz = Math.sin(patrolT.current) * 9 + pz * 0.5;
                navSteer(tx, tz, 0.5, 8);
                const floorClear = uwFloorHeight(fx, fz) + 3.0;
                const tY = -17 + Math.sin(patrolT.current * 0.6) * 3;
                let vy = (tY - fy);
                if (fy < floorClear) vy += (floorClear - fy) * 2.0;
                vy = THREE.MathUtils.clamp(vy, -PATROL_SPEED, PATROL_SPEED);
                _v1.current.set(_steer.current.x * PATROL_SPEED, vy, _steer.current.z * PATROL_SPEED);
                vel.current.lerp(_v1.current, safeDt * 1.8);
                break;
            }
            case 'hunting': {
                const speedT    = Math.min(1, (dist - LUNGE_DIST) / (AWARENESS_DIST - LUNGE_DIST));
                const baseSpeed = berserk
                    ? HUNT_SPEED_MAX * BERSERK_HUNT_MULT
                    : HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                const speed = baseSpeed * Math.min(shardMult, 2.5) * sharkDirector.huntMult;

                // ── Predictive interception (closed-form quadratic) ──
                // Aim at the exact point where the shark meets the player's
                // extrapolated path, not at the stale player position. Cut the
                // corner — that's what makes it feel like it reads your mind.
                const pv = playerVelRef.current;
                let it = interceptTime(fx, fy, fz, px, py, pz, pv.x, pv.y, pv.z, speed);
                if (it < 0) it = dist / (speed + 0.001);   // no solution → pure pursuit
                it = Math.min(it, 2.5);
                const aimx = px + pv.x * it, aimy = py + pv.y * it, aimz = pz + pv.z * it;

                // ── A* path toward the predicted aim point, obstacle-threaded ──
                const range = Math.min(speed * 0.7 + 4, 14);
                navSteer(aimx, aimz, 0.5, range);   // unit XZ heading, collision-free

                // Vertical handled separately (the ring is horizontal): chase the
                // aim depth, stay clear of the seafloor ridge below.
                const floorClear = uwFloorHeight(fx, fz) + 3.0;
                let vy = (aimy - fy);
                if (fy < floorClear) vy += (floorClear - fy) * 2.0;
                vy = THREE.MathUtils.clamp(vy, -speed, speed) * 0.8 + Math.sin(t * 1.3) * 0.5;
                _v1.current.set(_steer.current.x * speed, vy, _steer.current.z * speed);
                vel.current.lerp(_v1.current, safeDt * 3.0);
                break;
            }
            case 'investigating': {
                // Predator search: head for the highest-probability cell in the
                // occupancy grid (spatial memory), steered around obstacles.
                const speed = HUNT_SPEED_MAX * 0.55 * Math.min(shardMult, 2.0) * sharkDirector.huntMult;
                sharkDirector.getSearchTarget(_searchTgt.current);
                _searchTgt.current.y = lastKnownPosRef.current.y; // keep last-seen depth
                const range = Math.min(speed * 0.7 + 4, 12);
                navSteer(_searchTgt.current.x, _searchTgt.current.z, 0.5, range);
                const floorClear = uwFloorHeight(fx, fz) + 3.0;
                let vy = (_searchTgt.current.y - fy);
                if (fy < floorClear) vy += (floorClear - fy) * 2.0;
                vy = THREE.MathUtils.clamp(vy, -speed, speed) * 0.7 + Math.sin(t * 1.3) * 0.3;
                _v1.current.set(_steer.current.x * speed, vy, _steer.current.z * speed);
                vel.current.lerp(_v1.current, safeDt * 2.5);
                break;
            }
            case 'lunge': {
                const ls = berserk ? LUNGE_SPEED * BERSERK_LUNGE_MULT : LUNGE_SPEED;
                vel.current.lerp(
                    _v1.current.set(lDir.current.x * ls * shardMult, lDir.current.y * ls * shardMult, lDir.current.z * ls * shardMult),
                    safeDt * 11,
                );
                break;
            }
            case 'regroup':
                if (berserk) {
                    state.current = 'hunting';
                    caught.current = false;
                    callbackFired.current = false;
                } else {
                    // Back off into OPEN water (toward cave centre, away from the
                    // player and the wall corners), staying above the seafloor —
                    // never retreat into the corner where it used to get pinned.
                    const rx = (fx * 0.25) - (px - fx) * 0.15;  // drift toward centre + away from player
                    const rz = (fz * 0.25) - (pz - fz) * 0.15;
                    const floorClear = uwFloorHeight(fx, fz) + 3.0;
                    const rY = Math.max(-18, floorClear);
                    _v1.current.set(-rx, rY - fy, -rz);
                    const rl = _v1.current.length();
                    if (rl > 0.1) _v1.current.multiplyScalar(2.6 / rl);
                    vel.current.lerp(_v1.current, safeDt * 1.4);
                }
                break;
        }

        // ── Apply velocity + bounds ───────────────────────────────────────────
        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -28.5, 28.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -28.5, 28.5);

        // ── Organic-deformation collision + velocity SLIDE ─────────────────────
        // Collision moves the body out of the bulged walls / seafloor ridges
        // (small ≈original-size hitbox). CRITICAL: we then remove the velocity
        // component that was digging INTO the surface and add a small outward
        // nudge — otherwise vel keeps pointing into the wall and the shark
        // vibrates in place (the "enroscado" bug). Now it slides along instead.
        // Hitbox radius 0.5 — much smaller than the ~20-unit visual shark, so it
        // threads gaps the way its slim body really would instead of being held
        // back by a fat sphere (the "preso nas pedras" complaint).
        const HITBOX = 0.5;
        const preX = pos.current.x, preY = pos.current.y, preZ = pos.current.z;
        resolveUWWalls(pos.current, HITBOX);
        // Hard push-out of rocks + coral pillars — the constraint that finally
        // makes it IMPOSSIBLE for the shark to stay embedded in an obstacle.
        resolveUWObstacles(pos.current, HITBOX);
        const floorMin = uwFloorHeight(pos.current.x, pos.current.z) + 0.6;
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, floorMin, SWIM_THRESHOLD_Y - 1.5);
        const cx = pos.current.x - preX, cy = pos.current.y - preY, cz = pos.current.z - preZ;
        const corr2 = cx * cx + cy * cy + cz * cz;
        if (corr2 > 1e-6) {
            const cl = Math.sqrt(corr2);
            const nx = cx / cl, ny = cy / cl, nz = cz / cl;
            const into = vel.current.x * nx + vel.current.y * ny + vel.current.z * nz;
            if (into < 0) {                       // moving into the surface → cancel that part
                vel.current.x -= into * nx;
                vel.current.y -= into * ny;
                vel.current.z -= into * nz;
            }
            vel.current.x += nx * 2.0;            // outward peel so corners release
            vel.current.z += nz * 2.0;
        }

        // ── Anti-stuck watchdog ────────────────────────────────────────────────
        // Per-frame motion is noisy (collision nudges), so we measure NET
        // progress over a 0.5s window: checkpoint the position, and if it
        // barely moved while still trying to swim, fire an escape burst.
        // After 3 consecutive escapes with no progress we give up and
        // teleport to spawn — nothing else will free it from deep geometry.
        stuckT.current += safeDt;
        if (stuckT.current >= 0.5) {
            const net = Math.hypot(
                pos.current.x - lastPos.current.x,
                pos.current.y - lastPos.current.y,
                pos.current.z - lastPos.current.z,
            );
            if (net >= 2.0) {
                escapeCount.current = 0; // making real progress — reset
            } else if (escapeT.current <= 0 && net < 0.6) {
                // NB: no velocity gate here. The velocity-slide CANCELS velocity
                // when wedged, so gating on vel>0.6 meant the escape never fired
                // exactly when the shark was most stuck. Net displacement over the
                // window is the honest stuck signal — and the watchdog only runs
                // while actively swimming (dormant/awakening/jumpscare return early).
                escapeCount.current++;
                if (escapeCount.current >= 3) {
                    // Still stuck after 3 escape bursts — teleport to spawn
                    pos.current.copy(SPAWN_POS);
                    vel.current.set(0, 0, 0);
                    escapeCount.current = 0;
                } else {
                    escapeT.current = 1.2;        // longer escape burst (was 0.9)
                }
                navTimer.current = 0;            // force a fresh A* re-plan now
                navPath.current.length = 0;
            }
            lastPos.current.copy(pos.current);
            stuckT.current = 0;
        }

        g.position.copy(pos.current);
        _updateOrientation(g, safeDt, false);
    });

    // ─── Orientation helper — inline so closure captures vel ref ────────────
    function _updateOrientation(g: THREE.Group, safeDt: number, fast: boolean) {
        const vl = vel.current.length();
        if (vl < 0.08) return;
        const ty = Math.atan2(vel.current.x, vel.current.z);
        const tp = -Math.asin(THREE.MathUtils.clamp(vel.current.y / vl, -1, 1));
        let yd = ty - g.rotation.y;
        while (yd >  Math.PI) yd -= Math.PI * 2;
        while (yd < -Math.PI) yd += Math.PI * 2;
        const t = fast ? 22 : 3.5;
        g.rotation.y += yd * safeDt * t;
        g.rotation.x += (tp - g.rotation.x) * safeDt * (fast ? 22 : 2.5);
    }

    // Scale 3.6 → ~20-unit shark (3× the previous 1.2). The GLB is authored
    // ~5.6 units long (a 100× node scale baked in). This is now visible at any
    // distance thanks to the skeleton clone + emissive material + no frustum
    // culling, and the lunge/catch radii were widened so the kill triggers when
    // the mouth reaches the player rather than the body centre.
    return (
        <group ref={rootRef} visible={false} scale={[3.6, 3.6, 3.6]}>
            {/* Primitive uses the cloned, material-overridden scene.
                The orientation helper already aims the group's +Z axis along the
                velocity, and this GLB's nose IS its local +Z — so NO extra 180°
                flip. The old Math.PI flip made it swim tail-first ("de costas"). */}
            <primitive object={clonedScene} rotation={[0, 0, 0]} />

            {/* Single fill light — makes the shark visible in dark water, and
                doubles as a perception tell: cold blue when unaware, blood red
                when it has locked onto the player (driven from useFrame). */}
            <pointLight ref={fillLightRef} color="#5090c8" intensity={10} distance={18} decay={2} />
        </group>
    );
};
