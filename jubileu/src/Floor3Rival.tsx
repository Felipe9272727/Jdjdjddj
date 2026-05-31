/**
 * Floor3Rival.tsx — "O Diabrete" in RUN mode: the rubber-hose rival that
 * sprints ahead of the player up the endless parkour.
 *
 * The skeleton + skinning is built in diabreteRig.ts (the GLB is rig-less).
 * Here we only DRIVE the bones each frame with spring-damped, hand-tuned
 * rubber-hose locomotion:
 *   • Legs: alternating pendulum, tucked when airborne.
 *   • Arms: the model holds its arms straight OUT to the sides, so we first
 *     rotate them DOWN to a running posture (rotation.z) and then pump them
 *     fore/aft (rotation.x), counter-phased to the legs.
 *   • Body: vertical bounce + forward lean; head counter-bobs.
 *   • Whole-mesh squash/stretch on heel-strike and in the air.
 * The rival chases a point LEAD_Z ahead of the player and hops when the next
 * platform rises.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { platforms as f3Platforms, f3PlayerZ } from './f3Parkour';
import { buildDiabreteRig, B, type DiabreteRig } from './diabreteRig';

const RIVAL_URL  = '/diabrete.glb';
const LEAD_Z     = 14;     // units ahead of the player
const MOVE_SPD   = 6.2;    // Z pursuit speed (u/s)
const GRAVITY    = 22.0;
const CHAR_SCALE = 1.55;
const BASE_YAW   = 0;      // 0 = model faces +Z (running away up the course)
const ARM_DROP   = 0.95;   // radians: lower the T-pose arms to a run posture

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

    const posRef = useRef(new THREE.Vector3(0, 0, LEAD_Z));
    const velY   = useRef(0);
    const onGnd  = useRef(true);
    const phase  = useRef(0);
    const inited = useRef(false);   // snap the lead position to the player on frame 1

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

        // ─ Target & ground ───────────────────────────────────────────────────
        const targetZ = f3PlayerZ.current + LEAD_Z;
        // On the very first frame, spawn already at the lead point (and on the
        // right platform height) so the devil doesn't run BACKWARD into view.
        if (!inited.current) {
            inited.current = true;
            posRef.current.z = targetZ;
        }
        let best: { cz: number; topY: number; x: number } | null = null;
        for (const p of f3Platforms) {
            if (!best || Math.abs(p.cz - targetZ) < Math.abs(best.cz - targetZ)) best = p;
        }
        const groundY = best?.topY ?? 0;
        const groundX = best?.x ?? 0;

        const dz = targetZ - posRef.current.z;
        posRef.current.z += Math.sign(dz) * Math.min(Math.abs(dz), MOVE_SPD * safeDt);
        posRef.current.x += (groundX - posRef.current.x) * (1 - Math.exp(-6 * safeDt));

        const yDiff = groundY - posRef.current.y;
        if (onGnd.current && yDiff > 0.28) {
            velY.current = Math.sqrt(2 * GRAVITY * (yDiff + 0.5)) * 1.05;
            onGnd.current = false;
        }
        if (!onGnd.current) {
            velY.current -= GRAVITY * safeDt;
            posRef.current.y += velY.current * safeDt;
            if (posRef.current.y <= groundY && velY.current <= 0) {
                posRef.current.y = groundY; velY.current = 0; onGnd.current = true;
            }
        } else {
            posRef.current.y += yDiff * (1 - Math.exp(-14 * safeDt));
        }
        groupRef.current.position.copy(posRef.current);
        groupRef.current.rotation.y = BASE_YAW;

        // ─ Bones ─────────────────────────────────────────────────────────────
        const air = !onGnd.current;
        if (!air) phase.current += safeDt * 2.4 * Math.PI * 2;
        const φ = phase.current;
        const sw = Math.sin(φ);

        // BODY bounce + lean
        bones[B.body].position.y =
            (0.46 - 0.0) + sBob.current.tick(air ? 0 : Math.abs(sw) * 0.055, safeDt);
        bones[B.body].rotation.x = sLean.current.tick(air ? -0.18 : 0.14, safeDt);

        // HEAD counter-bob + nod
        bones[B.head].rotation.x = air ? -0.12 : 0.09 + Math.sin(φ * 2 + 0.6) * 0.04;
        bones[B.head].rotation.z = air ? 0 : Math.sin(φ + 0.3) * 0.05;

        // LEGS alternating pendulum (tuck in the air)
        bones[B.l_leg].rotation.x = air ? -0.44 :  sw * 0.60;
        bones[B.r_leg].rotation.x = air ? -0.44 : -sw * 0.60;

        // ARMS — drop the sideways T-pose arms DOWN (z), then pump fore/aft (x),
        // counter-phased to the legs. l_arm points -X so +z lowers it; r_arm
        // points +X so -z lowers it.
        bones[B.l_arm].rotation.z =  (air ? 1.25 : ARM_DROP);
        bones[B.r_arm].rotation.z = -(air ? 1.25 : ARM_DROP);
        bones[B.l_arm].rotation.x = air ? -0.55 : -sw * 0.85;
        bones[B.r_arm].rotation.x = air ? -0.55 :  sw * 0.85;

        // Squash / stretch (whole-mesh) — stretch falling, squash on heel-strike
        const strY = air ? 1 + Math.abs(velY.current) * 0.011 : 1 - Math.abs(sw) * 0.05;
        const strX = 1 / Math.sqrt(Math.max(0.55, strY));
        rig.group.scale.set(strX, strY, strX);
    });

    return <group ref={groupRef} scale={[CHAR_SCALE, CHAR_SCALE, CHAR_SCALE]} />;
};

useGLTF.preload(RIVAL_URL);
export default Floor3Rival;
