/**
 * Floor6Guest.tsx — O HÓSPEDE QUE SABIA DEMAIS, in person.
 *
 * A gaunt man in a hotel bathrobe, barefoot, the RIGHT ARM GONE — the empty
 * sleeve folded and pinned against the shoulder, a dark stain seeping where
 * the bandage wraps. He appears between the player and the repaired elevator
 * during the blackout, and he does not move.
 *
 * Organic build: capsules, lathed cones and squashed spheres — no boxes.
 * The unsettling part is the stillness: a slow breathing cycle, a weight
 * shift heel to heel, heavy eyelids that BLINK, and the head tracking the
 * player a beat too late.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GUEST_POS = new THREE.Vector3(0, 0, -8.2);

export const Floor6Guest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const root = useRef<THREE.Group>(null!);
    const chest = useRef<THREE.Group>(null!);
    const head = useRef<THREE.Group>(null!);
    const lidL = useRef<THREE.Mesh>(null!);
    const lidR = useRef<THREE.Mesh>(null!);
    const handL = useRef<THREE.Group>(null!);
    const headYaw = useRef(0);
    const nextBlink = useRef(2);
    const blinkT = useRef(0);

    const mats = useMemo(() => ({
        robe: new THREE.MeshStandardMaterial({ color: '#9d937e', roughness: 0.95 }),
        robeDk: new THREE.MeshStandardMaterial({ color: '#837a66', roughness: 0.95 }),
        robeIn: new THREE.MeshStandardMaterial({ color: '#6e6452', roughness: 1, side: THREE.DoubleSide }),
        belt: new THREE.MeshStandardMaterial({ color: '#6e6452', roughness: 0.95 }),
        skin: new THREE.MeshStandardMaterial({ color: '#b59a80', roughness: 0.72 }),
        skinPale: new THREE.MeshStandardMaterial({ color: '#c2ab93', roughness: 0.78 }),
        socket: new THREE.MeshStandardMaterial({ color: '#5e4a3c', roughness: 1 }),
        eyeWhite: new THREE.MeshStandardMaterial({ color: '#d8cdb6', roughness: 0.25 }),
        iris: new THREE.MeshStandardMaterial({ color: '#241c14', roughness: 0.15 }),
        hair: new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 1 }),
        bandage: new THREE.MeshStandardMaterial({ color: '#cfc4ad', roughness: 1 }),
        stain: new THREE.MeshStandardMaterial({ color: '#4a100c', roughness: 0.55 }),
        pin: new THREE.MeshStandardMaterial({ color: '#9a9a9a', metalness: 0.85, roughness: 0.25 }),
        mouth: new THREE.MeshStandardMaterial({ color: '#3c2a22', roughness: 0.9 }),
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

        // breathing + faint tremor + slow weight shift heel to heel
        if (chest.current) {
            const br = Math.sin(t * 1.7);
            chest.current.scale.set(1 + br * 0.012, 1 + br * 0.025, 1 + br * 0.018);
            chest.current.position.x = Math.sin(t * 13.7) * 0.0035;
        }
        root.current.rotation.z = Math.sin(t * 0.31) * 0.012;
        root.current.position.y = Math.abs(Math.sin(t * 0.31)) * -0.008;

        // head: hung low, late tracking, tiny breathing nod
        if (head.current) {
            headYaw.current += (Math.sin(t * 0.43) * 0.12 - headYaw.current) * Math.min(1, dt * 2);
            head.current.rotation.y = headYaw.current;
            head.current.rotation.x = 0.16 + Math.sin(t * 1.7) * 0.015;
        }

        // heavy blink every few seconds (lids slide down over the eyes)
        nextBlink.current -= dt;
        if (nextBlink.current <= 0) { nextBlink.current = 3 + Math.random() * 3.5; blinkT.current = 0.32; }
        blinkT.current = Math.max(0, blinkT.current - dt);
        const closed = blinkT.current > 0 ? Math.sin((1 - blinkT.current / 0.32) * Math.PI) : 0;
        const lidY = -0.004 - closed * 0.02;
        if (lidL.current) lidL.current.position.y = 0.012 + lidY * 1.2;
        if (lidR.current) lidR.current.position.y = 0.012 + lidY * 1.2;

        // the living hand trembles, slightly, always
        if (handL.current) {
            handL.current.rotation.z = Math.sin(t * 11.3) * 0.05;
            handL.current.rotation.x = Math.sin(t * 9.1) * 0.04;
        }
    });

    return (
        <group ref={root}>
            {/* ── bare feet + thin shins ── */}
            {[-0.11, 0.12].map((x, i) => (
                <group key={x} position={[x, 0, i ? -0.02 : 0.03]} rotation={[0, i ? -0.16 : 0.12, 0]}>
                    <mesh position={[0, 0.035, 0.04]} scale={[0.75, 0.5, 1.6]} material={mats.skin}>
                        <sphereGeometry args={[0.075, 12, 8]} />
                    </mesh>
                    <mesh position={[0, 0.03, 0.15]} scale={[0.7, 0.45, 0.8]} material={mats.skin}>
                        <sphereGeometry args={[0.05, 10, 6]} />
                    </mesh>
                    <mesh position={[0, 0.28, 0]} material={mats.skinPale}>
                        <capsuleGeometry args={[0.042, 0.34, 4, 10]} />
                    </mesh>
                </group>
            ))}

            {/* ── the robe ── */}
            {/* skirt: a worn cone falling to mid-shin */}
            <mesh position={[0, 0.72, 0]} scale={[1.22, 1, 1]} material={mats.robe}>
                <cylinderGeometry args={[0.175, 0.26, 0.72, 18, 1, true]} />
            </mesh>
            <mesh position={[0, 0.37, 0]} scale={[1.22, 1, 1]} material={mats.robeIn}>
                <torusGeometry args={[0.255, 0.012, 8, 18]} />
            </mesh>
            {/* hem hangs uneven — he tied it one-handed */}
            <mesh position={[0.12, 0.34, 0.1]} rotation={[0.1, 0, -0.08]} scale={[0.5, 0.9, 0.3]} material={mats.robe}>
                <sphereGeometry args={[0.12, 10, 8]} />
            </mesh>

            {/* torso (breathes) */}
            <group ref={chest} position={[0, 1.24, 0]}>
                <mesh scale={[1.28, 1, 1]} material={mats.robe}>
                    <cylinderGeometry args={[0.165, 0.185, 0.52, 18]} />
                </mesh>
                {/* sunken chest shading under the collar */}
                <mesh position={[0, 0.14, 0.135]} scale={[1, 1.6, 0.5]} material={mats.skinPale}>
                    <sphereGeometry args={[0.055, 10, 8]} />
                </mesh>
                {/* shawl collar: two soft rolls meeting in a V */}
                <mesh position={[-0.085, 0.1, 0.13]} rotation={[0.18, 0.25, 0.62]} scale={[0.35, 1, 0.45]}
                    material={mats.robeDk}>
                    <capsuleGeometry args={[0.075, 0.3, 4, 10]} />
                </mesh>
                <mesh position={[0.085, 0.1, 0.13]} rotation={[0.18, -0.25, -0.62]} scale={[0.35, 1, 0.45]}
                    material={mats.robeDk}>
                    <capsuleGeometry args={[0.075, 0.3, 4, 10]} />
                </mesh>
                {/* collar roll behind the neck */}
                <mesh position={[0, 0.26, -0.02]} rotation={[1.45, 0, 0]} scale={[1, 0.7, 1]} material={mats.robeDk}>
                    <torusGeometry args={[0.13, 0.045, 8, 14, Math.PI]} />
                </mesh>
                {/* drooped shoulders */}
                <mesh position={[-0.21, 0.21, 0]} rotation={[0, 0, 0.5]} scale={[1.25, 0.7, 1]} material={mats.robe}>
                    <sphereGeometry args={[0.095, 12, 8]} />
                </mesh>
                <mesh position={[0.21, 0.21, 0]} rotation={[0, 0, -0.5]} scale={[1.25, 0.7, 1]} material={mats.robe}>
                    <sphereGeometry args={[0.095, 12, 8]} />
                </mesh>

                {/* ── LEFT arm: sleeve to the elbow, bare forearm, trembling hand ── */}
                <group position={[-0.27, 0.16, 0]} rotation={[0.1, 0, 0.22]}>
                    <mesh position={[0, -0.14, 0]} rotation={[0, 0, 0.06]} material={mats.robe}>
                        <cylinderGeometry args={[0.062, 0.078, 0.34, 12]} />
                    </mesh>
                    <mesh position={[0, -0.31, 0.005]} scale={[1.15, 0.5, 1.15]} material={mats.robeIn}>
                        <torusGeometry args={[0.07, 0.014, 8, 12]} />
                    </mesh>
                    {/* forearm with a hint of elbow flex */}
                    <group position={[0, -0.32, 0.01]} rotation={[-0.22, 0, 0]}>
                        <mesh position={[0, -0.16, 0]} material={mats.skinPale}>
                            <capsuleGeometry args={[0.037, 0.24, 4, 10]} />
                        </mesh>
                        {/* hand */}
                        <group ref={handL} position={[0, -0.34, 0.01]}>
                            <mesh scale={[0.62, 1.1, 0.32]} material={mats.skin}>
                                <sphereGeometry args={[0.055, 10, 8]} />
                            </mesh>
                            {/* fingers, half-curled */}
                            {[-0.025, -0.008, 0.009, 0.026].map((x) => (
                                <mesh key={x} position={[x, -0.06, 0.012]} rotation={[0.5, 0, 0]} material={mats.skin}>
                                    <capsuleGeometry args={[0.0075, 0.045, 3, 6]} />
                                </mesh>
                            ))}
                            <mesh position={[-0.038, -0.015, 0.018]} rotation={[0.5, 0, 0.7]} material={mats.skin}>
                                <capsuleGeometry args={[0.008, 0.032, 3, 6]} />
                            </mesh>
                        </group>
                    </group>
                </group>

                {/* ── RIGHT arm: GONE. The folded, pinned sleeve + the seep ── */}
                <group position={[0.27, 0.16, 0]}>
                    {/* stump sleeve, folded up against the shoulder */}
                    <mesh position={[0, -0.07, 0]} rotation={[0, 0, -0.1]} material={mats.robe}>
                        <cylinderGeometry args={[0.066, 0.075, 0.16, 12]} />
                    </mesh>
                    <mesh position={[0.01, -0.16, 0.02]} rotation={[0.45, 0, -0.3]} scale={[0.9, 0.55, 0.8]}
                        material={mats.robe}>
                        <sphereGeometry args={[0.075, 10, 8]} />
                    </mesh>
                    {/* bandage peeking at the shoulder line */}
                    <mesh position={[0, 0.045, 0]} rotation={[0, 0, -0.25]} scale={[1.1, 0.5, 1.05]}
                        material={mats.bandage}>
                        <sphereGeometry args={[0.082, 10, 8]} />
                    </mesh>
                    {/* the stain, seeping through the fold */}
                    <mesh position={[0.025, -0.1, 0.055]} rotation={[0.3, 0, 0]} scale={[0.85, 1.15, 0.35]}
                        material={mats.stain}>
                        <sphereGeometry args={[0.045, 10, 8]} />
                    </mesh>
                    {/* the safety pin holding the fold */}
                    <mesh position={[0.0, -0.19, 0.05]} rotation={[0.2, 0, 0.5]} material={mats.pin}>
                        <capsuleGeometry args={[0.004, 0.05, 3, 6]} />
                    </mesh>
                    <mesh position={[0.012, -0.21, 0.052]} material={mats.pin}>
                        <torusGeometry args={[0.009, 0.003, 5, 8]} />
                    </mesh>
                </group>
            </group>

            {/* belt knotted tight, ends hanging unequal */}
            <mesh position={[0, 1.02, 0]} scale={[1.3, 1, 1.05]} rotation={[Math.PI / 2, 0, 0]} material={mats.belt}>
                <torusGeometry args={[0.195, 0.025, 8, 18]} />
            </mesh>
            <mesh position={[0.06, 1.0, 0.21]} material={mats.belt}>
                <sphereGeometry args={[0.035, 8, 6]} />
            </mesh>
            <mesh position={[0.09, 0.88, 0.22]} rotation={[0.15, 0, 0.1]} material={mats.belt}>
                <capsuleGeometry args={[0.016, 0.18, 4, 8]} />
            </mesh>
            <mesh position={[0.02, 0.93, 0.22]} rotation={[0.1, 0, -0.12]} material={mats.belt}>
                <capsuleGeometry args={[0.014, 0.1, 4, 8]} />
            </mesh>

            {/* ── neck + head ── */}
            <mesh position={[0, 1.56, 0]} material={mats.skinPale}>
                <cylinderGeometry args={[0.042, 0.05, 0.1, 10]} />
            </mesh>
            <group ref={head} position={[0, 1.66, 0]} rotation={[0.16, 0, 0]}>
                {/* skull + gaunt jaw */}
                <mesh position={[0, 0.04, 0]} scale={[0.9, 1.06, 0.96]} material={mats.skinPale}>
                    <sphereGeometry args={[0.115, 18, 14]} />
                </mesh>
                <mesh position={[0, -0.045, 0.035]} scale={[0.72, 0.78, 0.8]} material={mats.skinPale}>
                    <sphereGeometry args={[0.085, 14, 10]} />
                </mesh>
                {/* hollow cheeks — shadowed dents */}
                <mesh position={[-0.062, -0.015, 0.07]} rotation={[0, 0.5, 0.3]} scale={[0.5, 1, 0.35]}
                    material={mats.socket}>
                    <sphereGeometry args={[0.035, 8, 6]} />
                </mesh>
                <mesh position={[0.062, -0.015, 0.07]} rotation={[0, -0.5, -0.3]} scale={[0.5, 1, 0.35]}
                    material={mats.socket}>
                    <sphereGeometry args={[0.035, 8, 6]} />
                </mesh>
                {/* eye sockets, sunken */}
                {[-0.042, 0.042].map((x) => (
                    <mesh key={x} position={[x, 0.055, 0.082]} scale={[1.15, 0.85, 0.5]} material={mats.socket}>
                        <sphereGeometry args={[0.026, 10, 8]} />
                    </mesh>
                ))}
                {/* eyes — tired whites, dark pinpoint irises */}
                {[-0.042, 0.042].map((x, i) => (
                    <group key={x} position={[x, 0.055, 0.088]}>
                        <mesh scale={[1, 0.85, 0.6]} material={mats.eyeWhite}>
                            <sphereGeometry args={[0.019, 10, 8]} />
                        </mesh>
                        <mesh position={[0, -0.001, 0.0105]} material={mats.iris}>
                            <sphereGeometry args={[0.0085, 8, 6]} />
                        </mesh>
                        {/* the heavy lid (slides shut on blink) */}
                        <mesh ref={i === 0 ? lidL : lidR} position={[0, 0.012, 0.002]}
                            rotation={[0.5, 0, 0]} scale={[1.12, 0.6, 0.7]} material={mats.skinPale}>
                            <sphereGeometry args={[0.021, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                        </mesh>
                    </group>
                ))}
                {/* dark rings under the eyes */}
                {[-0.042, 0.042].map((x) => (
                    <mesh key={x} position={[x, 0.035, 0.088]} rotation={[0.3, 0, 0]} scale={[1, 0.5, 0.4]}
                        material={mats.socket}>
                        <torusGeometry args={[0.018, 0.005, 6, 10, Math.PI]} />
                    </mesh>
                ))}
                {/* brow ridge, knotted */}
                <mesh position={[0, 0.085, 0.085]} rotation={[0.5, 0, 0]} scale={[1.5, 0.4, 0.5]} material={mats.skinPale}>
                    <capsuleGeometry args={[0.018, 0.06, 4, 8]} />
                </mesh>
                {/* nose — thin, bony */}
                <mesh position={[0, 0.02, 0.105]} rotation={[1.25, 0, 0]} scale={[0.62, 1, 0.7]} material={mats.skinPale}>
                    <capsuleGeometry args={[0.016, 0.05, 4, 8]} />
                </mesh>
                {/* mouth — a thin, pressed line with downturned corners */}
                <mesh position={[0, -0.055, 0.092]} rotation={[0.2, 0, 0]} scale={[1, 0.25, 0.3]} material={mats.mouth}>
                    <capsuleGeometry args={[0.018, 0.035, 3, 8]} />
                </mesh>
                {/* ears */}
                {[-0.105, 0.105].map((x) => (
                    <mesh key={x} position={[x, 0.03, -0.005]} rotation={[0, 0, x < 0 ? 0.2 : -0.2]}
                        scale={[0.35, 1, 0.7]} material={mats.skinPale}>
                        <sphereGeometry args={[0.032, 8, 8]} />
                    </mesh>
                ))}
                {/* flat unwashed hair: skull cap + stray tufts */}
                <mesh position={[0, 0.105, -0.012]} scale={[0.94, 0.62, 1.0]} material={mats.hair}>
                    <sphereGeometry args={[0.118, 16, 12]} />
                </mesh>
                <mesh position={[0, 0.045, -0.1]} scale={[0.9, 0.9, 0.45]} material={mats.hair}>
                    <sphereGeometry args={[0.1, 12, 10]} />
                </mesh>
                <mesh position={[-0.08, 0.13, 0.03]} rotation={[0.3, 0, 0.9]} material={mats.hair}>
                    <capsuleGeometry args={[0.012, 0.07, 3, 6]} />
                </mesh>
                <mesh position={[0.06, 0.145, -0.02]} rotation={[-0.2, 0, -0.7]} material={mats.hair}>
                    <capsuleGeometry args={[0.01, 0.06, 3, 6]} />
                </mesh>
                {/* sideburns grown wild */}
                {[-0.1, 0.1].map((x) => (
                    <mesh key={x} position={[x, -0.01, 0.02]} rotation={[0, 0, x < 0 ? 0.15 : -0.15]}
                        scale={[0.4, 1, 0.6]} material={mats.hair}>
                        <sphereGeometry args={[0.035, 8, 6]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

export default Floor6Guest;
