/**
 * Floor6Guest.tsx — O HÓSPEDE QUE SABIA DEMAIS, in person.
 *
 * A gaunt man in a hotel bathrobe, barefoot, the RIGHT ARM GONE — the empty
 * sleeve folded and pinned against the shoulder, a dark stain seeping where
 * the bandage wraps. He appears between the player and the repaired elevator
 * during the blackout, and he does not move.
 *
 * Procedural primitives only (the game's style): the unsettling part is the
 * stillness — a slow breathing cycle, a small tremor, the head tracking the
 * player a beat too late.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GUEST_POS = new THREE.Vector3(0, 0, -8.2);

const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => <mesh position={p} rotation={r ?? [0, 0, 0]} material={m}><boxGeometry args={a} /></mesh>;

export const Floor6Guest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const root = useRef<THREE.Group>(null!);
    const chest = useRef<THREE.Group>(null!);
    const head = useRef<THREE.Group>(null!);
    const headYaw = useRef(0);

    const mats = useMemo(() => ({
        robe: new THREE.MeshStandardMaterial({ color: '#9d937e', roughness: 0.95 }),
        robeDk: new THREE.MeshStandardMaterial({ color: '#857c69', roughness: 0.95 }),
        belt: new THREE.MeshStandardMaterial({ color: '#6e6452', roughness: 0.95 }),
        skin: new THREE.MeshStandardMaterial({ color: '#b89e84', roughness: 0.85 }),
        skinPale: new THREE.MeshStandardMaterial({ color: '#c2ab93', roughness: 0.85 }),
        hair: new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 1 }),
        socket: new THREE.MeshStandardMaterial({ color: '#241d18', roughness: 1 }),
        bandage: new THREE.MeshStandardMaterial({ color: '#cfc4ad', roughness: 1 }),
        stain: new THREE.MeshStandardMaterial({ color: '#54120d', roughness: 0.6 }),
        pin: new THREE.MeshStandardMaterial({ color: '#8a8a8a', metalness: 0.8, roughness: 0.3 }),
    }), []);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        if (!root.current) return;
        root.current.position.copy(GUEST_POS);

        // face the player — slowly, a beat too late
        const p = playerPositionRef.current;
        const want = Math.atan2(p.x - GUEST_POS.x, p.z - GUEST_POS.z);
        let d = want - root.current.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        root.current.rotation.y += d * Math.min(1, dt * 1.6);

        // breathing + a faint tremor + a slow weight shift, heel to heel
        if (chest.current) {
            const br = Math.sin(t * 1.7);
            chest.current.scale.set(1 + br * 0.015, 1 + br * 0.03, 1 + br * 0.02);
            chest.current.position.x = Math.sin(t * 13.7) * 0.004;
        }
        root.current.rotation.z = Math.sin(t * 0.31) * 0.012;
        root.current.position.y = Math.abs(Math.sin(t * 0.31)) * -0.008;
        if (head.current) {
            headYaw.current += (Math.sin(t * 0.43) * 0.12 - headYaw.current) * Math.min(1, dt * 2);
            head.current.rotation.y = headYaw.current;
            head.current.rotation.x = 0.14 + Math.sin(t * 1.7) * 0.015;   // hung a little low
        }
    });

    return (
        <group ref={root}>
            {/* bare feet + thin shins */}
            <B a={[0.16, 0.07, 0.3]} p={[-0.12, 0.035, 0.04]} m={mats.skin} />
            <B a={[0.16, 0.07, 0.3]} p={[0.13, 0.035, -0.02]} m={mats.skin} r={[0, 0.18, 0]} />
            <B a={[0.13, 0.5, 0.13]} p={[-0.12, 0.32, 0]} m={mats.skinPale} />
            <B a={[0.13, 0.5, 0.13]} p={[0.13, 0.32, 0]} m={mats.skinPale} />
            {/* the robe — skirt, torso, collar */}
            <B a={[0.5, 0.55, 0.36]} p={[0, 0.78, 0]} m={mats.robeDk} />
            <group ref={chest} position={[0, 1.22, 0]}>
                <B a={[0.52, 0.42, 0.34]} p={[0, 0, 0]} m={mats.robe} />
                {/* collar V */}
                <B a={[0.1, 0.34, 0.05]} p={[-0.12, 0.06, 0.16]} m={mats.robeDk} r={[0, 0, 0.5]} />
                <B a={[0.1, 0.34, 0.05]} p={[0.12, 0.06, 0.16]} m={mats.robeDk} r={[0, 0, -0.5]} />
                <B a={[0.12, 0.3, 0.03]} p={[0, 0.02, 0.17]} m={mats.skinPale} />
                {/* LEFT arm — sleeve, forearm, hand hanging */}
                <group position={[-0.32, 0.12, 0]} rotation={[0.06, 0, 0.1]}>
                    <B a={[0.17, 0.4, 0.19]} p={[0, -0.18, 0]} m={mats.robe} />
                    <B a={[0.11, 0.34, 0.11]} p={[0, -0.52, 0.01]} m={mats.skinPale} />
                    <B a={[0.1, 0.16, 0.07]} p={[0, -0.76, 0.02]} m={mats.skin} />
                </group>
                {/* RIGHT arm — GONE. The pinned, folded sleeve + the seep */}
                <group position={[0.32, 0.12, 0]}>
                    <B a={[0.17, 0.2, 0.19]} p={[0, -0.08, 0]} m={mats.robe} />
                    <B a={[0.15, 0.12, 0.16]} p={[0, -0.2, 0.02]} m={mats.robe} r={[0.3, 0, 0.2]} />
                    {/* bandage wrap peeking at the shoulder */}
                    <B a={[0.2, 0.1, 0.21]} p={[0, 0.06, 0]} m={mats.bandage} />
                    {/* the stain */}
                    <B a={[0.12, 0.1, 0.04]} p={[0.03, -0.05, 0.1]} m={mats.stain} r={[0, 0, 0.3]} />
                    {/* the safety pin */}
                    <B a={[0.03, 0.1, 0.02]} p={[0, -0.26, 0.1]} m={mats.pin} r={[0, 0, 0.6]} />
                </group>
            </group>
            {/* belt, knotted tight */}
            <B a={[0.54, 0.08, 0.38]} p={[0, 1.0, 0]} m={mats.belt} />
            <B a={[0.1, 0.16, 0.06]} p={[0.08, 0.92, 0.19]} m={mats.belt} />
            {/* head — gaunt, sunken eyes, hair flat */}
            <group ref={head} position={[0, 1.56, 0]}>
                <B a={[0.07, 0.1, 0.08]} p={[0, 0.0, 0]} m={mats.skinPale} />
                <B a={[0.26, 0.3, 0.26]} p={[0, 0.22, 0]} m={mats.skinPale} />
                {/* sunken sockets + tired eyes */}
                <B a={[0.07, 0.05, 0.02]} p={[-0.06, 0.25, 0.13]} m={mats.socket} />
                <B a={[0.07, 0.05, 0.02]} p={[0.06, 0.25, 0.13]} m={mats.socket} />
                <B a={[0.03, 0.02, 0.015]} p={[-0.06, 0.25, 0.14]} m={mats.skin} />
                <B a={[0.03, 0.02, 0.015]} p={[0.06, 0.25, 0.14]} m={mats.skin} />
                {/* hollow cheeks (shadow planes) */}
                <B a={[0.03, 0.1, 0.02]} p={[-0.1, 0.15, 0.12]} m={mats.socket} />
                <B a={[0.03, 0.1, 0.02]} p={[0.1, 0.15, 0.12]} m={mats.socket} />
                {/* thin mouth */}
                <B a={[0.1, 0.015, 0.015]} p={[0, 0.11, 0.135]} m={mats.socket} />
                {/* flat, unwashed hair */}
                <B a={[0.28, 0.1, 0.28]} p={[0, 0.39, -0.01]} m={mats.hair} />
                <B a={[0.28, 0.16, 0.1]} p={[0, 0.3, -0.1]} m={mats.hair} />
            </group>
        </group>
    );
};

export default Floor6Guest;
