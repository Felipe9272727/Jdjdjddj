/**
 * Floor2/MonsterFish.tsx — Deep-sea predator that hunts the player after
 * the first shard is collected.
 *
 * Uses the Khronos/code4game Monster GLB (GLTF 2.0, ~320KB) with a real
 * skeletal rig (35 bones, 96-channel animation). Materials are overridden
 * to give a pitch-black deep-sea appearance with bioluminescent accents.
 * Procedural eye sprites + lure point-light are overlaid on the model.
 *
 * AI state machine:  dormant → patrol → hunting → lunge → regroup → hunting
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { UW_ROCK_COLLIDERS, SWIM_THRESHOLD_Y } from './constants';

// ─── Asset path ────────────────────────────────────────────────────────────
const MONSTER_URL = '/models/monster/monster.glb';
useGLTF.preload(MONSTER_URL);

// ─── AI tuning ─────────────────────────────────────────────────────────────
const PATROL_SPEED    = 2.2;
const HUNT_SPEED_MIN  = 3.5;
const HUNT_SPEED_MAX  = 8.0;
const LUNGE_SPEED     = 16.0;
const LUNGE_DIST      = 5.5;
const CATCH_DIST      = 1.8;
const REGROUP_TIME    = 3.0;
const AWARENESS_DIST  = 40.0;

type FishState = 'dormant' | 'patrol' | 'hunting' | 'lunge' | 'regroup';

export interface MonsterFishProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onPlayerCaught: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────
export const MonsterFish: React.FC<MonsterFishProps> = ({
    playerPositionRef,
    collectedShards,
    onPlayerCaught,
}) => {
    // ── GLB load ────────────────────────────────────────────────────
    const { scene, animations } = useGLTF(MONSTER_URL) as any;

    // Three.js animation mixer (manual — animation clips have no names,
    // so we skip useAnimations and drive the mixer directly)
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);

    // Group refs
    const rootRef  = useRef<THREE.Group>(null);  // AI position / yaw / pitch
    const modelRef = useRef<THREE.Group>(null);  // model + mixer root

    // Eye sprite material refs (overlaid on the model)
    const eyeLMatRef = useRef<THREE.SpriteMaterial>(null);
    const eyeRMatRef = useRef<THREE.SpriteMaterial>(null);
    const lureLightRef = useRef<THREE.PointLight>(null);
    const fishLightRef = useRef<THREE.PointLight>(null);

    // ── AI state ────────────────────────────────────────────────────
    const pos      = useRef(new THREE.Vector3(-20, -18, -20));
    const vel      = useRef(new THREE.Vector3());
    const state    = useRef<FishState>('dormant');
    const regroup  = useRef(0);
    const lDir     = useRef(new THREE.Vector3());
    const patrolT  = useRef(0);
    const caught   = useRef(false);
    const _v1      = useRef(new THREE.Vector3());
    const _v2      = useRef(new THREE.Vector3());

    // ── Apply scary material + start animation ───────────────────────
    const calibratedRef = useRef(false);
    useEffect(() => {
        if (!scene) return;

        // Dark bioluminescent material — override every mesh in the model
        const mat = new THREE.MeshStandardMaterial({
            color: '#040608',
            emissive: '#001408',
            emissiveIntensity: 0.15,
            roughness: 0.90,
            metalness: 0.12,
            toneMapped: false,
        });
        scene.traverse((o: any) => {
            if (o.isMesh) {
                o.material = mat;
                o.castShadow = false;
                o.frustumCulled = false;
            }
        });

        // Auto-fit: the source GLB has a native bbox of ~23 × 59 × 35 units,
        // so without normalization a sane scale would be ~0.05.  Compute the
        // post-root-transform bbox and rescale + center so the longest axis
        // is exactly TARGET_SIZE meters and the visual center sits on the
        // group origin (matches the AI's tracked position).
        if (!calibratedRef.current) {
            const TARGET_SIZE = 3.0; // metres along longest axis
            const box = new THREE.Box3().setFromObject(scene);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const k = TARGET_SIZE / maxDim;
            scene.scale.setScalar(k);
            scene.position.set(-center.x * k, -center.y * k, -center.z * k);
            calibratedRef.current = true;
        }
    }, [scene]);

    useEffect(() => {
        const group = modelRef.current;
        if (!group || !animations?.length) return;

        const mixer = new THREE.AnimationMixer(group);
        const action = mixer.clipAction(animations[0]);
        action.play();
        mixerRef.current = mixer;

        return () => {
            mixer.stopAllAction();
            mixer.uncacheRoot(group);
            mixerRef.current = null;
        };
    }, [animations]);

    // ── Activate once first shard collected ─────────────────────────
    useEffect(() => {
        if (collectedShards.size >= 1 && state.current === 'dormant') {
            state.current = 'patrol';
        }
    }, [collectedShards.size]);

    // ── Main AI + render loop ───────────────────────────────────────
    useFrame(({ clock }, dt) => {
        const g = rootRef.current;
        if (!g) return;

        const safeDt = Math.min(dt, 0.033);
        const t = clock.elapsedTime;
        const playerY = playerPositionRef.current?.y ?? 0;

        // Only active when player is underwater
        if (state.current === 'dormant' || playerY >= SWIM_THRESHOLD_Y) {
            g.visible = false;
            return;
        }
        g.visible = true;

        // Update animation
        if (mixerRef.current) mixerRef.current.update(safeDt);

        const px = playerPositionRef.current?.x ?? 0;
        const py = playerPositionRef.current?.y ?? -10;
        const pz = playerPositionRef.current?.z ?? 0;
        const fx = pos.current.x, fy = pos.current.y, fz = pos.current.z;
        const dx = px - fx, dy = py - fy, dz = pz - fz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist   = Math.sqrt(distSq);

        // ── State transitions ──────────────────────────────────────
        switch (state.current) {
            case 'patrol':
                if (dist < AWARENESS_DIST) state.current = 'hunting';
                break;

            case 'hunting':
                if (dist < LUNGE_DIST) {
                    _v1.current.set(dx, dy, dz).normalize();
                    const fwd = _v2.current.set(0, 0, 1).applyQuaternion(g.quaternion);
                    if (fwd.dot(_v1.current) > 0.40 || dist < 2.8) {
                        state.current = 'lunge';
                        lDir.current.set(dx / dist, dy / dist, dz / dist);
                    }
                }
                break;

            case 'lunge':
                if (dist < CATCH_DIST && !caught.current) {
                    caught.current = true;
                    onPlayerCaught();
                }
                if (dist > LUNGE_DIST + 5) {
                    state.current = 'regroup';
                    regroup.current = REGROUP_TIME;
                }
                break;

            case 'regroup':
                regroup.current -= safeDt;
                if (regroup.current <= 0) {
                    state.current = 'hunting';
                    caught.current = false;
                }
                break;
        }

        // ── Movement ──────────────────────────────────────────────
        switch (state.current) {
            case 'patrol': {
                patrolT.current += safeDt * 0.35;
                const orbitX = Math.cos(patrolT.current) * 8 + (px - 8);
                const orbitZ = Math.sin(patrolT.current) * 8 + (pz - 8);
                const orbitY = -15 + Math.sin(patrolT.current * 0.7) * 2.5;
                _v1.current.set(orbitX - fx, orbitY - fy, orbitZ - fz);
                const tl = _v1.current.length();
                if (tl > 0.1) _v1.current.multiplyScalar(PATROL_SPEED / tl);
                vel.current.lerp(_v1.current, safeDt * 1.8);
                break;
            }
            case 'hunting': {
                const speedT = Math.min(1, (dist - LUNGE_DIST) / (AWARENESS_DIST - LUNGE_DIST));
                const speed  = HUNT_SPEED_MIN + speedT * (HUNT_SPEED_MAX - HUNT_SPEED_MIN);
                _v1.current.set(dx / dist, dy / dist, dz / dist).multiplyScalar(speed);
                for (const rock of UW_ROCK_COLLIDERS) {
                    const rdx = fx - rock.x, rdy = fy - rock.y, rdz = fz - rock.z;
                    const rd2 = rdx * rdx + rdy * rdy + rdz * rdz;
                    const mr  = rock.r + 1.8;
                    if (rd2 < mr * mr && rd2 > 0.001) {
                        const rd = Math.sqrt(rd2);
                        const str = (mr - rd) / rd * 6;
                        _v1.current.x += rdx * str;
                        _v1.current.y += rdy * str;
                        _v1.current.z += rdz * str;
                    }
                }
                _v1.current.y += Math.sin(t * 1.4) * 0.4;
                vel.current.lerp(_v1.current, safeDt * 2.8);
                break;
            }
            case 'lunge':
                vel.current.lerp(
                    _v1.current.set(lDir.current.x * LUNGE_SPEED, lDir.current.y * LUNGE_SPEED, lDir.current.z * LUNGE_SPEED),
                    safeDt * 10,
                );
                break;
            case 'regroup':
                vel.current.multiplyScalar(1 - safeDt * 2.5);
                vel.current.lerp(_v1.current.set(-20 - fx, -18 - fy, -20 - fz).normalize().multiplyScalar(2), safeDt * 0.8);
                break;
        }

        pos.current.x += vel.current.x * safeDt;
        pos.current.y += vel.current.y * safeDt;
        pos.current.z += vel.current.z * safeDt;
        pos.current.x = THREE.MathUtils.clamp(pos.current.x, -26, 26);
        pos.current.y = THREE.MathUtils.clamp(pos.current.y, -28, SWIM_THRESHOLD_Y - 1.5);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z, -26, 26);

        g.position.copy(pos.current);

        // ── Orientation ───────────────────────────────────────────
        const vl = vel.current.length();
        if (vl > 0.05) {
            const ty = Math.atan2(vel.current.x, vel.current.z);
            const tp = -Math.asin(THREE.MathUtils.clamp(vel.current.y / vl, -1, 1));
            let yd = ty - g.rotation.y;
            while (yd >  Math.PI) yd -= Math.PI * 2;
            while (yd < -Math.PI) yd += Math.PI * 2;
            const kYaw   = state.current === 'lunge' ? safeDt * 12 : safeDt * 4;
            const kPitch = state.current === 'lunge' ? safeDt * 12 : safeDt * 3;
            g.rotation.y += yd * kYaw;
            g.rotation.x += (tp - g.rotation.x) * kPitch;
        }

        // ── Animation speed based on state ────────────────────────
        if (mixerRef.current) {
            const timeScale = state.current === 'lunge' ? 3.5 : state.current === 'hunting' ? 2.0 : 0.9;
            (mixerRef.current as any).timeScale = timeScale;
        }

        // ── Eye glow ──────────────────────────────────────────────
        const proximity = Math.max(0, 1 - dist / AWARENESS_DIST);
        const eyeEmit   = 0.35 + proximity * 0.55 + Math.sin(t * 3.5) * 0.04;
        if (eyeLMatRef.current) eyeLMatRef.current.opacity = eyeEmit;
        if (eyeRMatRef.current) eyeRMatRef.current.opacity = eyeEmit;

        // ── Lights ────────────────────────────────────────────────
        if (lureLightRef.current) lureLightRef.current.intensity = 0.5 + Math.sin(t * 2.2) * 0.25 + proximity * 1.0;
        if (fishLightRef.current) fishLightRef.current.intensity = proximity * 2.5;
    });

    // ── Eye sprite + lure geometry ──────────────────────────────────
    const lureGeo = useMemo(() => new THREE.SphereGeometry(0.08, 8, 7), []);
    const lureMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#00ffaa', emissive: '#00ffaa', emissiveIntensity: 1.8, toneMapped: false,
    }), []);

    return (
        <group ref={rootRef} visible={false}>
            {/* Loaded monster model — auto-fitted in useEffect to ~3m. */}
            <group ref={modelRef}>
                <primitive object={scene} />
            </group>

            {/* Glowing amber eyes overlaid roughly at the head */}
            <sprite position={[0.18, 0.55, 0.7]} scale={[0.22, 0.22, 1]}>
                <spriteMaterial
                    ref={eyeLMatRef}
                    color="#ff5500"
                    transparent
                    opacity={0.4}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
            <sprite position={[-0.18, 0.55, 0.7]} scale={[0.22, 0.22, 1]}>
                <spriteMaterial
                    ref={eyeRMatRef}
                    color="#ff5500"
                    transparent
                    opacity={0.4}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>

            {/* Bioluminescent lure above the head */}
            <mesh geometry={lureGeo} material={lureMat} position={[0, 0.95, 0.4]} />
            <pointLight
                ref={lureLightRef}
                position={[0, 0.95, 0.4]}
                color="#00ffaa"
                intensity={0.8}
                distance={6}
                decay={2}
            />

            {/* Proximity fill light — illuminates player surfaces when fish is close */}
            <pointLight
                ref={fishLightRef}
                position={[0, 0.5, 0]}
                color="#0a2016"
                intensity={0}
                distance={14}
                decay={2}
            />
        </group>
    );
};
