/**
 * Floor2/MonsterFish.tsx — Deep-sea predator that hunts the player after
 * the first shard is collected. Procedurally-built anglerfish body, state-
 * machine AI with patrol → hunt → lunge behaviour, and a death callback.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UW_ROCK_COLLIDERS, SWIM_THRESHOLD_Y } from './constants';

// ─── AI tuning ─────────────────────────────────────────────────────────────
const PATROL_SPEED    = 2.2;
const HUNT_SPEED_MIN  = 3.5;
const HUNT_SPEED_MAX  = 8.0;
const LUNGE_SPEED     = 16.0;
const LUNGE_DIST      = 5.5;   // distance at which a lunge is triggered
const CATCH_DIST      = 1.6;   // contact-kill radius
const REGROUP_TIME    = 3.0;   // seconds to recover after a missed lunge
const AWARENESS_DIST  = 40.0;  // fish becomes aware of player within this range
const ORBIT_RADIUS    = 8.0;   // patrol orbit radius

type FishState = 'dormant' | 'patrol' | 'hunting' | 'lunge' | 'regroup';

// ─── Spawn position (edge of the underwater cave) ─────────────────────────
const SPAWN = new THREE.Vector3(-20, -18, -20);

// ─── Props ─────────────────────────────────────────────────────────────────
export interface MonsterFishProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    /** Set of collected shard indices. Fish spawns once size >= 1. */
    collectedShards: Set<number>;
    /** Called when the fish catches the player. */
    onPlayerCaught: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────
export const MonsterFish: React.FC<MonsterFishProps> = ({
    playerPositionRef,
    collectedShards,
    onPlayerCaught,
}) => {
    const groupRef     = useRef<THREE.Group>(null);
    const bodyRef      = useRef<THREE.Group>(null);  // child group that snakes
    const seg0Ref      = useRef<THREE.Group>(null);
    const seg1Ref      = useRef<THREE.Group>(null);
    const seg2Ref      = useRef<THREE.Group>(null);
    const tailRef      = useRef<THREE.Group>(null);
    const eyeMatLRef   = useRef<THREE.MeshStandardMaterial>(null);
    const eyeMatRRef   = useRef<THREE.MeshStandardMaterial>(null);
    const lureLightRef = useRef<THREE.PointLight>(null);
    const fishLightRef = useRef<THREE.PointLight>(null);

    // Mutable state — never causes re-renders
    const pos      = useRef(SPAWN.clone());
    const vel      = useRef(new THREE.Vector3());
    const state    = useRef<FishState>('dormant');
    const regroup  = useRef(0);
    const lDir     = useRef(new THREE.Vector3());
    const patrolT  = useRef(0);
    const caughtFired = useRef(false);

    // Temp vectors (avoid per-frame allocations)
    const _v1 = useRef(new THREE.Vector3());
    const _v2 = useRef(new THREE.Vector3());

    // Activate once first shard is collected
    useEffect(() => {
        if (collectedShards.size >= 1 && state.current === 'dormant') {
            state.current = 'patrol';
        }
    }, [collectedShards.size]);

    useFrame(({ clock }, dt) => {
        const g = groupRef.current;
        if (!g) return;

        const safeDt = Math.min(dt, 0.033);
        const t = clock.elapsedTime;

        // Only active when player is underwater
        const playerY = playerPositionRef.current?.y ?? 0;
        if (state.current === 'dormant' || playerY >= SWIM_THRESHOLD_Y) {
            g.visible = false;
            return;
        }
        g.visible = true;

        const pp = playerPositionRef.current;
        const px = pp.x, py = pp.y, pz = pp.z;
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dx = px - fx, dy = py - fy, dz = pz - fz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);

        // ── State machine ────────────────────────────────────────────
        switch (state.current) {
            case 'patrol': {
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;
            }
            case 'hunting': {
                if (dist < LUNGE_DIST) {
                    // Lunge if fish is roughly facing the player
                    _v1.current.set(dx, dy, dz).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    if (fwd.dot(_v1.current) > 0.45 || dist < 2.5) {
                        state.current = 'lunge';
                        lDir.current.set(dx / dist, dy / dist, dz / dist);
                    }
                }
                break;
            }
            case 'lunge': {
                if (dist < CATCH_DIST && !caughtFired.current) {
                    caughtFired.current = true;
                    onPlayerCaught();
                }
                // If we've clearly overshot (fish moving away from player now),
                // enter regroup
                if (dist > LUNGE_DIST + 4) {
                    state.current = 'regroup';
                    regroup.current = REGROUP_TIME;
                }
                break;
            }
            case 'regroup': {
                regroup.current -= safeDt;
                if (regroup.current <= 0) {
                    state.current = 'hunting';
                    caughtFired.current = false;
                }
                break;
            }
        }

        // ── Movement ────────────────────────────────────────────────
        switch (state.current) {
            case 'patrol': {
                // Lazy circular orbit
                patrolT.current += safeDt * 0.35;
                const orbitX = Math.cos(patrolT.current) * ORBIT_RADIUS + (px - 8);
                const orbitZ = Math.sin(patrolT.current) * ORBIT_RADIUS + (pz - 8);
                const orbitY = -15 + Math.sin(patrolT.current * 0.7) * 2.5;
                _v1.current.set(orbitX - fx, orbitY - fy, orbitZ - fz);
                const targetLen = _v1.current.length();
                if (targetLen > 0.1) _v1.current.multiplyScalar(PATROL_SPEED / targetLen);
                vel.current.lerp(_v1.current, safeDt * 1.8);
                break;
            }
            case 'hunting': {
                // Arrive steering: faster when far, slower when close
                const speedT = Math.min(1, (dist - LUNGE_DIST) / (AWARENESS_DIST - LUNGE_DIST));
                const speed = HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                _v1.current.set(dx / dist, dy / dist, dz / dist).multiplyScalar(speed);

                // Obstacle push-off
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rDist2 = rdx * rdx + rdy * rdy + rdz * rdz;
                    const minR = rock.r + 1.8;
                    if (rDist2 < minR * minR && rDist2 > 0.001) {
                        const rDist = Math.sqrt(rDist2);
                        const str = (minR - rDist) / rDist * 6.0;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }

                // Slight vertical weave while hunting (looks alive)
                _v1.current.y += Math.sin(t * 1.4) * 0.4;

                vel.current.lerp(_v1.current, safeDt * 2.8);
                break;
            }
            case 'lunge': {
                _v1.current.set(
                    lDir.current.x * LUNGE_SPEED,
                    lDir.current.y * LUNGE_SPEED,
                    lDir.current.z * LUNGE_SPEED,
                );
                vel.current.lerp(_v1.current, safeDt * 10.0);
                break;
            }
            case 'regroup': {
                // Decelerate + drift back
                vel.current.multiplyScalar(1 - safeDt * 2.5);
                // Gently return toward a regrouping point
                const regroupX = -20, regroupY = -18, regroupZ = -20;
                _v1.current.set(regroupX - fx, regroupY - fy, regroupZ - fz).normalize().multiplyScalar(2.0);
                vel.current.lerp(_v1.current, safeDt * 0.8);
                break;
            }
        }

        // Apply velocity
        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;

        // Clamp to underwater bounds
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -28, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);

        g.position.copy(pos.current);

        // ── Orientation ─────────────────────────────────────────────
        const velLen = vel.current.length();
        if (velLen > 0.05) {
            const targetYaw   = Math.atan2(vel.current.x, vel.current.z);
            const targetPitch = -Math.asin(THREE.MathUtils.clamp(vel.current.y / velLen, -1, 1));
            const yawLerp   = state.current === 'lunge' ? safeDt * 12 : safeDt * 4.0;
            const pitchLerp = state.current === 'lunge' ? safeDt * 12 : safeDt * 3.0;
            // Shortest-path yaw lerp
            let yawDiff = targetYaw - g.rotation.y;
            while (yawDiff >  Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            g.rotation.y += yawDiff * yawLerp;
            g.rotation.x += (targetPitch - g.rotation.x) * pitchLerp;
        }

        // ── Body snake animation ────────────────────────────────────
        const swimFreq = state.current === 'lunge' ? 4.5 : (state.current === 'hunting' ? 2.5 : 1.6);
        const swimAmp  = state.current === 'lunge' ? 0.08 : 0.22;
        const segs = [seg0Ref, seg1Ref, seg2Ref, tailRef] as const;
        for (let i = 0; i < segs.length; i++) {
            const s = segs[i].current;
            if (s) s.rotation.y = Math.sin(t * swimFreq - i * 0.55) * swimAmp * (1 + i * 0.25);
        }

        // ── Eye glow — ramps up with proximity ──────────────────────
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);
        const eyeEmit = 2.0 + proximity * 6.0 + Math.sin(t * 3.5) * 0.3;
        if (eyeMatLRef.current) eyeMatLRef.current.emissiveIntensity = eyeEmit;
        if (eyeMatRRef.current) eyeMatRRef.current.emissiveIntensity = eyeEmit;

        // ── Lure + fish point light ──────────────────────────────────
        const lureIntensity = 0.5 + Math.sin(t * 2.2) * 0.25 + proximity * 1.0;
        if (lureLightRef.current) lureLightRef.current.intensity = lureIntensity;
        // Proximity fish light: illuminates the player when fish is close (ominous!)
        if (fishLightRef.current) fishLightRef.current.intensity = proximity * 2.5;
    });

    // ─── Geometry (all memoized) ────────────────────────────────────────────
    const headGeo = useMemo(() => {
        const g = new THREE.SphereGeometry(0.55, 14, 10);
        g.scale(1.8, 0.72, 1.0);
        return g;
    }, []);

    const jawGeo = useMemo(() => {
        const g = new THREE.SphereGeometry(0.42, 10, 7);
        g.scale(1.6, 0.42, 0.95);
        return g;
    }, []);

    // Upper teeth (points down from upper jaw)
    const upperTeethGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const verts: number[] = [];
        const N = 8;
        for (let i = 0; i < N; i++) {
            const t = (i / (N - 1)) - 0.5;
            const x = t * 0.76;
            const base = 0.04;
            verts.push(
                x - 0.04, -base, 0.1,
                x + 0.04, -base, 0.1,
                x,        -base - 0.22, 0.1,
            );
        }
        const idx: number[] = [];
        for (let i = 0; i < N; i++) {
            const b = i * 3;
            idx.push(b, b + 1, b + 2, b, b + 2, b + 1);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
    }, []);

    // Lower teeth (points up from lower jaw)
    const lowerTeethGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const verts: number[] = [];
        const N = 8;
        for (let i = 0; i < N; i++) {
            const t = (i / (N - 1)) - 0.5;
            const x = t * 0.72;
            const base = -0.04;
            verts.push(
                x - 0.04, base, 0.1,
                x + 0.04, base, 0.1,
                x,        base + 0.18, 0.1,
            );
        }
        const idx: number[] = [];
        for (let i = 0; i < N; i++) {
            const b = i * 3;
            idx.push(b, b + 1, b + 2, b, b + 2, b + 1);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
    }, []);

    const bodySegGeo = useMemo(() => new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10), []);
    const tailSegGeo = useMemo(() => new THREE.CylinderGeometry(0.10, 0.28, 0.9, 10), []);
    const eyeGeo     = useMemo(() => new THREE.SphereGeometry(0.11, 10, 8), []);
    const lureGeo    = useMemo(() => new THREE.SphereGeometry(0.08, 8, 7), []);
    const lureStemGeo = useMemo(() => new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), []);
    const spotGeo    = useMemo(() => new THREE.SphereGeometry(0.055, 6, 5), []);

    // Dorsal fin — thin triangle running along the back
    const dorsalGeo  = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
            0.0, 0.0,  0.5,
            0.0, 0.0, -1.2,
            0.0, 0.55, -0.4,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.setIndex([0, 1, 2, 0, 2, 1]);
        geo.computeVertexNormals();
        return geo;
    }, []);

    // Tail fin — forked crescent
    const tailFinGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
            0, 0, 0,
            0.65,  0.38, -0.15,
            0.65, -0.38, -0.15,
            0, 0.10, -0.22,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.setIndex([0, 1, 3, 0, 3, 2, 0, 3, 1, 0, 2, 3]);
        geo.computeVertexNormals();
        return geo;
    }, []);

    // Pectoral fin
    const pectoralGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
            0, 0, 0,
            0, -0.1, 0.55,
            0.42, -0.18, 0.22,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.setIndex([0, 1, 2, 0, 2, 1]);
        geo.computeVertexNormals();
        return geo;
    }, []);

    // ─── Materials ──────────────────────────────────────────────────────────
    const matBody  = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#050810', roughness: 0.88, metalness: 0.14, toneMapped: false,
    }), []);
    const matBelly = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#0a0e1a', roughness: 0.90, metalness: 0.10,
    }), []);
    const matFin   = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#060910', roughness: 0.92, metalness: 0.08,
        side: THREE.DoubleSide, transparent: true, opacity: 0.82,
    }), []);
    const matTeeth = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#c0bfb0', roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide,
    }), []);
    const matLure  = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#00ffaa', emissive: '#00ffaa', emissiveIntensity: 1.8, toneMapped: false,
    }), []);
    const matSpot  = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#00f8cc', emissive: '#00e8b0', emissiveIntensity: 0.9, toneMapped: false,
    }), []);

    return (
        <group ref={groupRef} visible={false}>
            {/* ── Head ───────────────────────────────────────────── */}
            <mesh geometry={headGeo} position={[0, 0.05, 0.9]} material={matBody} />

            {/* Upper jaw */}
            <mesh geometry={jawGeo} position={[0, 0.14, 0.82]} material={matBody} />

            {/* Lower jaw — slightly drooped */}
            <mesh geometry={jawGeo} position={[0, -0.22, 0.80]} rotation={[0.18, 0, 0]} material={matBelly} />

            {/* Upper teeth */}
            <mesh geometry={upperTeethGeo} position={[0, 0.05, 0.85]} material={matTeeth} />

            {/* Lower teeth */}
            <mesh geometry={lowerTeethGeo} position={[0, -0.22, 0.85]} material={matTeeth} />

            {/* Eyes — glowing amber */}
            <mesh geometry={eyeGeo} position={[0.28, 0.22, 1.16]}>
                <meshStandardMaterial
                    ref={eyeMatLRef}
                    color="#ff7700" emissive="#ff5500" emissiveIntensity={2.5}
                    toneMapped={false}
                />
            </mesh>
            <mesh geometry={eyeGeo} position={[-0.28, 0.22, 1.16]}>
                <meshStandardMaterial
                    ref={eyeMatRRef}
                    color="#ff7700" emissive="#ff5500" emissiveIntensity={2.5}
                    toneMapped={false}
                />
            </mesh>

            {/* Lure stem + orb */}
            <mesh geometry={lureStemGeo} position={[0, 0.52, 0.95]} rotation={[-0.55, 0, 0]} material={matBody} />
            <mesh geometry={lureGeo} position={[0, 0.95, 0.65]} material={matLure} />
            <pointLight
                ref={lureLightRef}
                position={[0, 0.95, 0.65]}
                color="#00ffaa"
                intensity={0.8}
                distance={5}
                decay={2}
            />

            {/* Fish proximity light — illuminates player when close */}
            <pointLight
                ref={fishLightRef}
                position={[0, 0, 0]}
                color="#1a3a2a"
                intensity={0}
                distance={12}
                decay={2}
            />

            {/* Dorsal fin */}
            <mesh geometry={dorsalGeo} position={[0, 0.32, 0.3]} material={matFin} />

            {/* Pectoral fins */}
            <mesh geometry={pectoralGeo} position={[0.32, -0.1, 0.6]} material={matFin} />
            <mesh geometry={pectoralGeo} position={[-0.32, -0.1, 0.6]} scale={[-1, 1, 1]} material={matFin} />

            {/* ── Body segments (snake chain) ─────────────────────── */}
            <group ref={bodyRef}>
                <group ref={seg0Ref}>
                    <mesh geometry={bodySegGeo} position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]} material={matBody} />

                    {/* Bioluminescent spots */}
                    <mesh geometry={spotGeo} position={[0.3, 0.1, -0.25]}  material={matSpot} />
                    <mesh geometry={spotGeo} position={[-0.3, 0.1, -0.25]} material={matSpot} />

                    <group ref={seg1Ref} position={[0, 0, -0.9]}>
                        <mesh geometry={bodySegGeo} rotation={[Math.PI / 2, 0, 0]} material={matBody} />
                        <mesh geometry={spotGeo} position={[0.28, 0.08, 0]} material={matSpot} />
                        <mesh geometry={spotGeo} position={[-0.28, 0.08, 0]} material={matSpot} />

                        <group ref={seg2Ref} position={[0, 0, -0.9]}>
                            <mesh geometry={tailSegGeo} rotation={[Math.PI / 2, 0, 0]} material={matBody} />
                            <mesh geometry={spotGeo} position={[0.2, 0.06, 0]} material={matSpot} />

                            {/* Tail */}
                            <group ref={tailRef} position={[0, 0, -0.85]}>
                                <mesh geometry={tailFinGeo} position={[0, 0, -0.2]} material={matFin} />
                            </group>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
};
