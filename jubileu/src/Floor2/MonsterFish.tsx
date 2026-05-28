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
import {
    UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS, UW_PILLAR_COLLIDERS, SWIM_THRESHOLD_Y,
} from './constants';

// ─── AI constants ─────────────────────────────────────────────────────────────
const PATROL_SPEED   = 2.2;
const HUNT_SPEED_MIN = 3.0;
const HUNT_SPEED_MAX = 7.5;
const LUNGE_SPEED    = 18.0;
const LUNGE_DIST     = 5.0;
const CATCH_DIST     = 2.5;
const REGROUP_TIME   = 5.0;
const AWARENESS_DIST = 42.0;
const SPAWN_POS      = new THREE.Vector3(-22, -20, -22);
const AWAKEN_DELAY   = 11.0;
const BERSERK_HUNT_MULT  = 1.35;
const BERSERK_LUNGE_MULT = 1.45;

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

    // Clone scene once — clone the GLB's own atlas material so the texture
    // stays intact. Just darken color slightly for the deep-sea look; the
    // fill light below makes the shark visible against dark water.
    const clonedScene = useMemo(() => {
        const clone = (scene as THREE.Group).clone(true);
        clone.traverse((child: any) => {
            if (child.isSkinnedMesh || child.isMesh) {
                const m = (child.material as THREE.MeshStandardMaterial).clone();
                if (m.color) m.color.multiplyScalar(0.75);
                m.toneMapped = false;
                m.needsUpdate = true;
                child.material = m;
                child.castShadow = false;
                child.receiveShadow = false;
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

    // Reusable temp vectors — never allocate in useFrame
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());
    const _v3 = useRef(new THREE.Vector3());

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

        // ── Jumpscare — overrides normal AI ─────────────────────────────────
        if (jsPhase.current !== 'none') {
            jsTimer.current += safeDt;
            const jt = jsTimer.current;

            // 280 ms of raw terror (player sees the shark's face) then fire overlay
            if (!callbackFired.current && jt >= JUMPSCARE_DELAY) {
                callbackFired.current = true;
                if (cameraShakeRef) cameraShakeRef.current = false;
                onPlayerCaught();
            }

            if (jsPhase.current === 'rush') {
                const tp = jsTarget.current;
                const rdx = tp.x - pos.current.x;
                const rdy = tp.y - pos.current.y;
                const rdz = tp.z - pos.current.z;
                const rl  = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz) + 0.001;
                vel.current.set(rdx / rl * 55, rdy / rl * 55, rdz / rl * 55);
                pos.current.x += vel.current.x * safeDt;
                pos.current.y += vel.current.y * safeDt;
                pos.current.z += vel.current.z * safeDt;
                g.position.copy(pos.current);
                if (jt > 1.0) jsPhase.current = 'done';
            }
            _updateOrientation(g, safeDt, true);
            return;
        }

        // ── Shard-based difficulty scaling ───────────────────────────────────
        const shardMult = 1 + collectedShards.size * 0.18;

        // ── State transitions ────────────────────────────────────────────────
        switch (state.current) {
            case 'patrol':
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;
            case 'hunting':
                // Player left awareness range → investigate last known position
                if (dist > AWARENESS_DIST) {
                    lastKnownPosRef.current.set(px, py, pz);
                    investigateTimer.current = 14.0;
                    state.current = 'investigating';
                } else if (dist < LUNGE_DIST) {
                    _v1.current.set(dxp, dyp, dzp).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    if (fwd.dot(_v1.current) > 0.45 || dist < 2.8) {
                        state.current = 'lunge';
                        lDir.current.set(dxp / dist, dyp / dist, dzp / dist);
                    }
                }
                break;
            case 'investigating':
                if (dist < AWARENESS_DIST) {
                    // Player spotted again — resume hunt
                    state.current = 'hunting';
                } else {
                    investigateTimer.current -= safeDt;
                    const dxi = lastKnownPosRef.current.x - fx;
                    const dyi = lastKnownPosRef.current.y - fy;
                    const dzi = lastKnownPosRef.current.z - fz;
                    const di  = Math.sqrt(dxi*dxi + dyi*dyi + dzi*dzi);
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
        switch (state.current) {
            case 'patrol': {
                patrolT.current += safeDt * 0.28;
                const tx = Math.cos(patrolT.current) * 10 + (px - 10);
                const tz = Math.sin(patrolT.current) * 10 + (pz - 10);
                const tY = -17 + Math.sin(patrolT.current * 0.6) * 3;
                _v1.current.set(tx - fx, tY - fy, tz - fz);
                const tl = _v1.current.length();
                if (tl > 0.1) _v1.current.multiplyScalar(PATROL_SPEED / tl);
                vel.current.lerp(_v1.current, safeDt * 1.6);
                break;
            }
            case 'hunting': {
                // Predictive interception: aim at where player will be, not where they are
                const speedT    = Math.min(1, (dist - LUNGE_DIST) / (AWARENESS_DIST - LUNGE_DIST));
                const baseSpeed = berserk
                    ? HUNT_SPEED_MAX * BERSERK_HUNT_MULT
                    : HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                const speed = baseSpeed * Math.min(shardMult, 2.5);
                // Look-ahead: predict player position 55% of the travel time ahead
                const lookAhead = Math.min(dist / (speed + 0.001) * 0.55, 1.8);
                const tpx = px + playerVelRef.current.x * lookAhead;
                const tpy = py + playerVelRef.current.y * lookAhead;
                const tpz = pz + playerVelRef.current.z * lookAhead;
                const tdx = tpx - fx, tdy = tpy - fy, tdz = tpz - fz;
                const tDist = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) + 0.001;
                _v1.current.set(tdx / tDist, tdy / tDist, tdz / tDist).multiplyScalar(speed);
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rd2 = rdx*rdx + rdy*rdy + rdz*rdz;
                    const mr  = rock.r + 2.0;
                    if (rd2 < mr*mr && rd2 > 0.001) {
                        const rd  = Math.sqrt(rd2);
                        const str = (mr - rd) / rd * 7;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }
                for (const pillar of UW_PILLAR_COLLIDERS) {
                    const pdx = fx - pillar.x, pdz = fz - pillar.z;
                    const pd2 = pdx*pdx + pdz*pdz;
                    const mr  = pillar.r + 1.8;
                    if (pd2 < mr*mr && pd2 > 0.001) {
                        const pd  = Math.sqrt(pd2);
                        const str = (mr - pd) / pd * 6;
                        _v1.current.x += pdx * str;
                        _v1.current.z += pdz * str;
                    }
                }
                _v1.current.y += Math.sin(t * 1.3) * 0.5;
                vel.current.lerp(_v1.current, safeDt * 3.0);
                break;
            }
            case 'investigating': {
                // Navigate toward last known player position
                const speed = HUNT_SPEED_MAX * 0.55 * Math.min(shardMult, 2.0);
                const idx = lastKnownPosRef.current.x - fx;
                const idy = lastKnownPosRef.current.y - fy;
                const idz = lastKnownPosRef.current.z - fz;
                const id  = Math.sqrt(idx*idx + idy*idy + idz*idz) + 0.001;
                _v1.current.set(idx / id, idy / id, idz / id).multiplyScalar(speed);
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rd2 = rdx*rdx + rdy*rdy + rdz*rdz;
                    const mr  = rock.r + 2.0;
                    if (rd2 < mr*mr && rd2 > 0.001) {
                        const rd  = Math.sqrt(rd2);
                        const str = (mr - rd) / rd * 7;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }
                _v1.current.y += Math.sin(t * 1.3) * 0.3;
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
                    vel.current.multiplyScalar(1 - safeDt * 2.2);
                    vel.current.lerp(
                        _v1.current.copy(SPAWN_POS).sub(pos.current).normalize().multiplyScalar(2.5),
                        safeDt * 0.9,
                    );
                }
                break;
        }

        // ── Apply velocity + bounds + wall avoidance ──────────────────────────
        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -29, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);

        for (const wall of CAVE_WALL_COLLIDERS) {
            const wdx = pos.current.x - wall.x;
            const wdz = pos.current.z - wall.z;
            const wd2 = wdx*wdx + wdz*wdz;
            const mr  = wall.r + 1.2;
            if (wd2 < mr*mr && wd2 > 0.001) {
                const wd   = Math.sqrt(wd2);
                const push = (mr - wd) / wd;
                pos.current.x += wdx * push;
                pos.current.z += wdz * push;
            }
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

    return (
        <group ref={rootRef} visible={false} scale={[3.8, 3.8, 3.8]}>
            {/* Primitive uses the cloned, material-overridden scene.
                Rotate 180° around Y so the shark faces its velocity (+Z forward). */}
            <primitive object={clonedScene} rotation={[0, Math.PI, 0]} />

            {/* Single blue-white fill — makes the shark visible in dark water */}
            <pointLight color="#5090c8" intensity={10} distance={18} decay={2} />
        </group>
    );
};
