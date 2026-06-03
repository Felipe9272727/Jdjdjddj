/**
 * Floor3FallCutscene.tsx — the Diabrete's DEFEAT, as a proper directed cutscene.
 *
 * Unlike the gameplay rival (Floor3Rival), this owns its OWN cinematic camera (a
 * fixed 3/4 side angle, pushed in, that tilts down to follow the plunge) so it
 * never reads as first-person. It stages the beat the user asked for:
 *
 *   TRIP   — he stumbles at the platform edge…
 *   GRAB   — slips off but catches the ledge, dangling by both hands, legs
 *            kicking, looking up in panic.
 *   STOMP  — a giant cartoon BOOT (the player's) drops in and stomps his hands.
 *   FALL   — he lets go and plummets, tumbling + shrinking, into the void.
 *
 * It mounts when App's `cartoonFall` is true (the gameplay rival hides itself),
 * reads the devil's last position from f3DevilPos to stage there, and calls
 * onDone when the plunge clears — App then rides the player up to Floor 4.
 *
 * Camera note: this component is rendered AFTER <Player> in the Canvas, so its
 * useFrame runs last and its camera writes win over the player's.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3DevilPos } from './f3Hazards';
import { playFloor3Land, playFloor3Fall } from './floor3Sfx';

const RIVAL_URL = '/diabrete.glb';
const HANG_DROP = 1.95;    // body drop so he dangles BELOW the ledge, head at the edge
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;

// Boot materials (the player's stomping boot).
const bootDark = new THREE.MeshToonMaterial({ color: '#15101a' });
const bootSole = new THREE.MeshToonMaterial({ color: '#2c2436' });
const bootOutline = new THREE.MeshBasicMaterial({ color: '#0a0712', side: THREE.BackSide });

interface Props { onDone: () => void; }

const Floor3FallCutscene: React.FC<Props> = ({ onDone }) => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null!);
    const bootRef  = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const base   = useRef(new THREE.Vector3());
    const clock  = useRef(0);
    const doneRef = useRef(false);
    const sGrab  = useRef(false);
    const sStomp = useRef(false);
    const sFall  = useRef(false);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete fall] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        base.current.copy(f3DevilPos.current);     // stage where the devil was beaten
        clock.current = 0; doneRef.current = false;
        sGrab.current = sStomp.current = sFall.current = false;
        playFloor3Land();                            // the "trip" thud
        return () => { group.remove(rig.group); rig.dispose(); rigRef.current = null; };
    }, [gltf]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        clock.current += safeDt;
        let t = clock.current;
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            const scrub = (window as any).__fallScrub;
            if (typeof scrub === 'number') t = scrub;     // dev: hold a fixed phase
            (window as any).__fallT = t;
        }
        const b = rig.bones;
        const gripY = base.current.y;               // platform top edge (hands grip here)
        const g = groupRef.current;

        // ── Camera — fixed cinematic 3/4 side angle, push-in, tilt-down on fall ─
        const gx = base.current.x, gz = base.current.z;
        const focusY = gripY - 0.9;                  // centre on his dangling body
        const dist = lerp(6.0, 4.6, clamp01(t / 3.5));
        // 3/4 side, near ledge height, looking slightly DOWN at the hang
        const dir = new THREE.Vector3(0.80, 0.18, 0.57).normalize();
        camera.position.set(gx + dir.x * dist, gripY + 0.4 + dir.y * dist, gz + dir.z * dist);
        let lookY = focusY;
        if (sFall.current) lookY = focusY - (t - 3.2) * 5.0;   // follow him into the void
        camera.lookAt(gx, lookY, gz);
        (camera as THREE.PerspectiveCamera).fov = 42;
        camera.updateProjectionMatrix();

        // ── Devil staging ────────────────────────────────────────────────────
        rig.group.scale.set(1, 1, 1);
        if (t < 0.5) {
            // TRIP — lurch at the edge, arms flail, on his feet (group at ledge top)
            const k = t / 0.5;
            g.position.set(gx, gripY, gz);
            g.rotation.set(k * 0.6, 0, Math.sin(t * 26) * 0.12);
            b[B.l_arm].rotation.set(Math.sin(t * 24) * 2.4, 0, 0.5);
            b[B.r_arm].rotation.set(Math.sin(t * 24 + 3) * 2.4, 0, -0.5);
            b[B.head].rotation.set(0.4 * k, 0, 0);
            b[B.l_leg].rotation.set(-0.7 * k, 0, 0); b[B.r_leg].rotation.set(0.5 * k, 0, 0);
        } else if (t < 0.9) {
            // SLIP & GRAB — drop, arms shoot UP and catch the ledge
            const k = (t - 0.5) / 0.4;
            g.position.set(gx, lerp(gripY, gripY - HANG_DROP, easeIn(k)), gz);
            g.rotation.set(0, 0, 0);
            b[B.l_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(0.5, 2.5, k));   // fling arms UP to catch
            b[B.r_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(-0.5, -2.5, k));
            b[B.head].rotation.set(-0.2, 0, 0);
            b[B.l_leg].rotation.set(0.3, 0, 0.1); b[B.r_leg].rotation.set(0.3, 0, -0.1);
            if (!sGrab.current) { sGrab.current = true; }
        } else if (!sFall.current && t < 3.2) {
            // HANG — dangle from the ledge, legs kicking, looking up in panic
            const sway = Math.sin(t * 3.5);
            g.position.set(gx + sway * 0.04, gripY - HANG_DROP + Math.abs(Math.sin(t * 5)) * 0.04, gz);
            g.rotation.set(0, 0, sway * 0.06);
            b[B.l_arm].rotation.set(-0.2, 0, 2.5); b[B.r_arm].rotation.set(-0.2, 0, -2.5);  // reaching up to grip the ledge
            b[B.head].rotation.set(-0.35 + Math.sin(t * 4) * 0.06, 0, sway * 0.1);          // looking up
            b[B.l_leg].rotation.set(Math.sin(t * 7) * 0.5, 0, 0.15);                        // kicking
            b[B.r_leg].rotation.set(-Math.sin(t * 7) * 0.5, 0, -0.15);
            b[B.body].rotation.set(0.05, 0, 0);

            // STOMP — boot drops in and crushes his hands at ~t=2.9
            if (t >= 2.4) {
                if (bootRef.current) bootRef.current.visible = true;
                const k = clamp01((t - 2.4) / 0.5);
                const by = lerp(gripY + 5.5, gripY + 0.3, easeIn(k));
                if (bootRef.current) bootRef.current.position.set(gx, by, gz + 0.05);
                if (k >= 1 && !sStomp.current) { sStomp.current = true; playFloor3Land(); }  // the stomp
                if (sStomp.current) rig.group.scale.set(1.08, 0.9, 1.08);                     // squashed under the boot
            }
            if (t >= 3.2) { sFall.current = true; playFloor3Fall(); }
        } else {
            // FALL — released, plummets tumbling + shrinking into the void
            const e = t - 3.2;
            if (bootRef.current) bootRef.current.position.y = lerp(gripY + 0.3, gripY + 3, clamp01(e / 0.6));
            const y = gripY - HANG_DROP - 0.5 * 26 * e * e;     // gravity plunge
            g.position.set(gx, y, gz);
            g.rotation.set(e * 7, Math.sin(e * 5) * 0.5, e * 4);
            g.scale.setScalar(DIABRETE_SCALE * Math.max(0.12, 1 - e * 0.45));
            b[B.l_arm].rotation.set(Math.sin(t * 26) * 1.5, 0, 0.3); b[B.r_arm].rotation.set(-Math.sin(t * 26) * 1.5, 0, -0.3);
            b[B.l_leg].rotation.set(Math.sin(t * 22) * 1.0, 0, 0); b[B.r_leg].rotation.set(-Math.sin(t * 22) * 1.0, 0, 0);
            if (e > 1.2 && !doneRef.current) { doneRef.current = true; onDone(); }
        }
    });

    return (
        <group>
            {/* the Diabrete (rig added in useEffect) — scaled */}
            <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />
            {/* the player's giant stomping boot — world-space sibling, hidden until the stomp */}
            <group ref={bootRef} visible={false} scale={[1.4, 1.4, 1.4]}>
                <mesh position={[0, 0.7, 0]} material={bootOutline} scale={1.08}>
                    <cylinderGeometry args={[0.2, 0.24, 1.3, 12]} />
                </mesh>
                <mesh position={[0, 0.7, 0]} material={bootDark}>
                    <cylinderGeometry args={[0.2, 0.24, 1.3, 12]} />
                </mesh>
                <mesh position={[0, 0.0, 0.14]} material={bootDark}>
                    <boxGeometry args={[0.42, 0.34, 0.74]} />
                </mesh>
                <mesh position={[0, -0.22, 0.14]} material={bootSole}>
                    <boxGeometry args={[0.46, 0.14, 0.8]} />
                </mesh>
            </group>
        </group>
    );
};

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
