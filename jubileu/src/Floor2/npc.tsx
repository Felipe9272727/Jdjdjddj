/**
 * Floor2/npc.tsx — Procedural bearded hotel handler NPC.
 *
 * Spawns just outside the Floor 2 elevator doors. Two phases:
 *   1. SUSTO: when the elevator doors finish opening, the NPC fades in
 *      with a quick scale-pop (clean / not jumpscare-cheap). Stays
 *      perfectly still until the player approaches.
 *   2. DELIVER: when the player gets within ~3m AND has not yet received
 *      the diving mask, fire onDeliver(). The NPC stays in place after
 *      (no walking-off — keeps the scene composition stable).
 *
 * Everything is built from primitives: spheres + cylinders + boxes,
 * arranged to read as "old bellhop with a thick beard". Total ~10
 * meshes, all static. No GLB needed.
 */

import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BellhopNPCProps {
    /** World position to place the NPC at (player exits the elevator
     *  and sees the NPC standing here). */
    position: readonly [number, number, number];
    /** Rotation in radians around Y — face toward the player by default. */
    rotationY?: number;
    /** When false, the NPC is fully hidden. The susto reveal flips this
     *  to true when the elevator doors finish opening. */
    visible: boolean;
    /** Ref to the player's position so we can detect proximity. */
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    /** Fired once when the player first comes within DELIVER_RADIUS. */
    onDeliver?: () => void;
    /** Has the delivery already happened? Used so we don't fire onDeliver
     *  multiple times and so we can switch the NPC's animation (idle vs.
     *  "extending arm to hand over the mask"). */
    delivered: boolean;
}

const DELIVER_RADIUS = 3.0;
const DELIVER_RADIUS_SQ = DELIVER_RADIUS * DELIVER_RADIUS;

// Hotel palette — match the lobby Undertale-amber + the bellhop sprite
// up in the lobby for consistency.
const SUIT_BLACK = '#13110d';
const SHIRT_WHITE = '#e8e0c8';
const TIE_RED = '#9a1e1e';
const HAT_AMBER = '#c89030';
const SKIN_PALE = '#d8b896';
const BEARD_DARK = '#1c150e';
const SHOE_BLACK = '#0a0807';
const BUTTON_GOLD = '#d4a04a';

export const Floor2BellhopNPC: React.FC<BellhopNPCProps> = ({
    position, rotationY = Math.PI, visible, playerPositionRef, onDeliver, delivered,
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const breathRef = useRef<THREE.Group>(null);

    // Local "appearance" alpha so we can fade-in the NPC over ~0.4s when
    // visible flips true. Avoids the SNAP-INTO-EXISTENCE feel.
    const [alpha, setAlpha] = useState(0);
    const deliveredFired = useRef(false);

    useFrame((state, dt) => {
        const g = groupRef.current;
        if (!g) return;
        const safeDt = Math.min(dt, 0.05);

        // Fade alpha toward target (0 if not visible, 1 if visible).
        const target = visible ? 1 : 0;
        const newAlpha = alpha + (target - alpha) * Math.min(1, 8 * safeDt);
        if (Math.abs(newAlpha - alpha) > 0.001) setAlpha(newAlpha);

        // Scale-pop on appear: tiny over-shoot then settle. Sells "he was
        // there all along, you just saw him for the first time".
        const overshoot = Math.max(0, alpha) > 0.3 ? (1 + Math.sin(Math.min(alpha, 1) * Math.PI) * 0.08) : alpha;
        g.scale.setScalar(overshoot * (alpha > 0.05 ? 1 : 0));
        g.visible = alpha > 0.01;
        if (!g.visible) return;

        // Breathing — subtle vertical oscillation on the chest group.
        const t = state.clock.elapsedTime;
        if (breathRef.current) {
            breathRef.current.position.y = Math.sin(t * 1.4) * 0.012;
        }
        // Head sway — very slight side-to-side.
        if (headRef.current) {
            headRef.current.rotation.y = Math.sin(t * 0.5) * 0.05;
        }

        // Distance check — once player enters DELIVER_RADIUS the first time,
        // fire onDeliver and switch to "arm extended" pose.
        const pp = playerPositionRef.current;
        const dx = pp.x - position[0];
        const dz = pp.z - position[2];
        const distSq = dx * dx + dz * dz;
        if (!deliveredFired.current && !delivered && distSq < DELIVER_RADIUS_SQ && alpha > 0.7) {
            deliveredFired.current = true;
            onDeliver?.();
        }

        // Right arm pose — folded in by default; extended forward post-delivery
        // for the "handing-the-mask-over" gesture. Smoothly lerps.
        if (rightArmRef.current) {
            const targetExtend = delivered ? 0 : (distSq < DELIVER_RADIUS_SQ * 2 ? 0.5 : 0);
            const cur = rightArmRef.current.rotation.x;
            const tx = -targetExtend * Math.PI * 0.45;   // forward when target>0
            rightArmRef.current.rotation.x = cur + (tx - cur) * Math.min(1, 4 * safeDt);
            // Subtle idle breath rotation
            rightArmRef.current.rotation.z = Math.sin(t * 1.4 + 0.5) * 0.02;
        }
        if (leftArmRef.current) {
            leftArmRef.current.rotation.z = -Math.sin(t * 1.4) * 0.02;
        }
    });

    // Apply alpha across all child mesh materials. We do this in a useEffect
    // so the alpha plumbing isn't recomputed every frame — only when alpha
    // crosses a threshold.
    useEffect(() => {
        const g = groupRef.current;
        if (!g) return;
        g.traverse((child: any) => {
            if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = Math.max(0, Math.min(1, alpha));
                child.material.depthWrite = alpha > 0.95; // proper transparent depth
            }
        });
    }, [alpha]);

    return (
        <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} visible={false}>
            <group ref={breathRef}>
                {/* ─── HAT (bellhop pillbox) ───────────────────── */}
                <mesh position={[0, 1.94, 0]} castShadow>
                    <cylinderGeometry args={[0.21, 0.20, 0.16, 16]} />
                    <meshStandardMaterial color={HAT_AMBER} roughness={0.65} metalness={0.12} />
                </mesh>
                {/* Hat brim */}
                <mesh position={[0, 1.86, 0]}>
                    <cylinderGeometry args={[0.24, 0.24, 0.025, 18]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.85} />
                </mesh>
                {/* Hat band */}
                <mesh position={[0, 1.92, 0]}>
                    <cylinderGeometry args={[0.215, 0.215, 0.035, 18]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.85} />
                </mesh>
                {/* Hat insignia — tiny gold square in front */}
                <mesh position={[0, 1.94, 0.21]}>
                    <boxGeometry args={[0.07, 0.07, 0.005]} />
                    <meshStandardMaterial color={BUTTON_GOLD} emissive={BUTTON_GOLD} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
                </mesh>

                {/* ─── HEAD ──────────────────────────────────────── */}
                <group ref={headRef}>
                    {/* Skull (sphere) */}
                    <mesh position={[0, 1.72, 0]}>
                        <sphereGeometry args={[0.18, 18, 14]} />
                        <meshStandardMaterial color={SKIN_PALE} roughness={0.7} />
                    </mesh>
                    {/* Beard — squat ellipsoid below jaw */}
                    <mesh position={[0, 1.56, 0.02]} scale={[1.1, 0.85, 1.0]}>
                        <sphereGeometry args={[0.16, 16, 12]} />
                        <meshStandardMaterial color={BEARD_DARK} roughness={0.95} />
                    </mesh>
                    {/* Moustache — thin horizontal box across the upper lip */}
                    <mesh position={[0, 1.66, 0.16]}>
                        <boxGeometry args={[0.13, 0.025, 0.05]} />
                        <meshStandardMaterial color={BEARD_DARK} roughness={0.95} />
                    </mesh>
                    {/* Eyes — small dark spheres */}
                    <mesh position={[-0.06, 1.745, 0.155]}>
                        <sphereGeometry args={[0.018, 8, 6]} />
                        <meshStandardMaterial color="#0a0805" />
                    </mesh>
                    <mesh position={[0.06, 1.745, 0.155]}>
                        <sphereGeometry args={[0.018, 8, 6]} />
                        <meshStandardMaterial color="#0a0805" />
                    </mesh>
                    {/* Eye highlights — tiny white specks for life */}
                    <mesh position={[-0.054, 1.752, 0.169]}>
                        <sphereGeometry args={[0.004, 6, 4]} />
                        <meshBasicMaterial color="#ffffff" />
                    </mesh>
                    <mesh position={[0.066, 1.752, 0.169]}>
                        <sphereGeometry args={[0.004, 6, 4]} />
                        <meshBasicMaterial color="#ffffff" />
                    </mesh>
                    {/* Nose — small triangle */}
                    <mesh position={[0, 1.70, 0.17]} rotation={[0, 0, 0]}>
                        <coneGeometry args={[0.018, 0.05, 5]} />
                        <meshStandardMaterial color={SKIN_PALE} roughness={0.7} />
                    </mesh>
                </group>

                {/* ─── NECK + SHIRT COLLAR ───────────────────────── */}
                <mesh position={[0, 1.45, 0]}>
                    <cylinderGeometry args={[0.07, 0.08, 0.10, 10]} />
                    <meshStandardMaterial color={SKIN_PALE} roughness={0.75} />
                </mesh>
                {/* Collar V */}
                <mesh position={[0, 1.39, 0.08]} rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[0.20, 0.07, 0.02]} />
                    <meshStandardMaterial color={SHIRT_WHITE} roughness={0.8} />
                </mesh>

                {/* ─── BOWTIE ────────────────────────────────────── */}
                <mesh position={[0, 1.41, 0.10]} rotation={[0, 0, 0]}>
                    <boxGeometry args={[0.10, 0.04, 0.015]} />
                    <meshStandardMaterial color={TIE_RED} roughness={0.55} />
                </mesh>
                <mesh position={[-0.05, 1.41, 0.10]} rotation={[0, 0, 0.3]}>
                    <coneGeometry args={[0.025, 0.07, 4]} />
                    <meshStandardMaterial color={TIE_RED} roughness={0.55} />
                </mesh>
                <mesh position={[0.05, 1.41, 0.10]} rotation={[0, 0, -0.3]}>
                    <coneGeometry args={[0.025, 0.07, 4]} />
                    <meshStandardMaterial color={TIE_RED} roughness={0.55} />
                </mesh>

                {/* ─── TORSO (jacket) ────────────────────────────── */}
                <mesh position={[0, 1.06, 0]}>
                    <boxGeometry args={[0.42, 0.62, 0.27]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} metalness={0.05} />
                </mesh>
                {/* Lapels (two angled boxes) */}
                <mesh position={[-0.10, 1.16, 0.14]} rotation={[0, 0, 0.15]}>
                    <boxGeometry args={[0.08, 0.36, 0.02]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.55} />
                </mesh>
                <mesh position={[0.10, 1.16, 0.14]} rotation={[0, 0, -0.15]}>
                    <boxGeometry args={[0.08, 0.36, 0.02]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.55} />
                </mesh>
                {/* Gold button rows (4 buttons) */}
                {[0, 1, 2, 3].map((i) => (
                    <mesh key={`btn-${i}`} position={[0, 1.22 - i * 0.13, 0.142]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.018, 0.018, 0.01, 10]} />
                        <meshStandardMaterial color={BUTTON_GOLD} metalness={0.7} roughness={0.25} emissive={BUTTON_GOLD} emissiveIntensity={0.15} />
                    </mesh>
                ))}

                {/* ─── ARMS ───────────────────────────────────────── */}
                {/* Right shoulder anchor — group for rotation */}
                <group position={[-0.25, 1.32, 0]} ref={rightArmRef}>
                    {/* Upper arm */}
                    <mesh position={[0, -0.18, 0]}>
                        <cylinderGeometry args={[0.06, 0.065, 0.36, 10]} />
                        <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                    </mesh>
                    {/* Forearm + hand */}
                    <mesh position={[0, -0.5, 0.05]} rotation={[0.2, 0, 0]}>
                        <cylinderGeometry args={[0.058, 0.052, 0.32, 10]} />
                        <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                    </mesh>
                    <mesh position={[0, -0.68, 0.12]}>
                        <sphereGeometry args={[0.055, 10, 8]} />
                        <meshStandardMaterial color={SKIN_PALE} roughness={0.75} />
                    </mesh>
                    {/* The diving mask the NPC offers — small dark goggles
                        in the right hand. Visible until the player picks it
                        up (delivered=true), then it fades along with everything
                        else so the gesture reads as "you took it". */}
                    {!delivered && (
                        <group position={[0, -0.74, 0.15]} rotation={[0.3, 0, 0]}>
                            <mesh>
                                <boxGeometry args={[0.10, 0.05, 0.04]} />
                                <meshStandardMaterial color="#1a221a" roughness={0.6} />
                            </mesh>
                            <mesh position={[-0.026, 0, 0.02]}>
                                <sphereGeometry args={[0.018, 8, 6]} />
                                <meshStandardMaterial color="#7ee7a0" emissive="#3ad04a" emissiveIntensity={0.7} metalness={0.4} toneMapped={false} />
                            </mesh>
                            <mesh position={[0.026, 0, 0.02]}>
                                <sphereGeometry args={[0.018, 8, 6]} />
                                <meshStandardMaterial color="#7ee7a0" emissive="#3ad04a" emissiveIntensity={0.7} metalness={0.4} toneMapped={false} />
                            </mesh>
                        </group>
                    )}
                </group>
                {/* Left arm — purely cosmetic */}
                <group position={[0.25, 1.32, 0]} ref={leftArmRef}>
                    <mesh position={[0, -0.18, 0]}>
                        <cylinderGeometry args={[0.06, 0.065, 0.36, 10]} />
                        <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                    </mesh>
                    <mesh position={[0, -0.50, 0.0]}>
                        <cylinderGeometry args={[0.058, 0.052, 0.32, 10]} />
                        <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                    </mesh>
                    <mesh position={[0, -0.68, 0]}>
                        <sphereGeometry args={[0.055, 10, 8]} />
                        <meshStandardMaterial color={SKIN_PALE} roughness={0.75} />
                    </mesh>
                </group>

                {/* ─── PANTS ──────────────────────────────────────── */}
                {/* Right leg */}
                <mesh position={[-0.10, 0.45, 0]}>
                    <cylinderGeometry args={[0.082, 0.075, 0.6, 10]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                </mesh>
                {/* Left leg */}
                <mesh position={[0.10, 0.45, 0]}>
                    <cylinderGeometry args={[0.082, 0.075, 0.6, 10]} />
                    <meshStandardMaterial color={SUIT_BLACK} roughness={0.7} />
                </mesh>

                {/* ─── SHOES ──────────────────────────────────────── */}
                <mesh position={[-0.10, 0.07, 0.05]}>
                    <boxGeometry args={[0.13, 0.10, 0.22]} />
                    <meshStandardMaterial color={SHOE_BLACK} roughness={0.35} metalness={0.18} />
                </mesh>
                <mesh position={[0.10, 0.07, 0.05]}>
                    <boxGeometry args={[0.13, 0.10, 0.22]} />
                    <meshStandardMaterial color={SHOE_BLACK} roughness={0.35} metalness={0.18} />
                </mesh>

                {/* Small spotlight pointing down at the NPC, sells "he stands
                    in his own pool of light". Distance-limited, decay high. */}
                <pointLight position={[0, 2.4, 0.2]} intensity={1.6} distance={3.5} decay={1.6} color="#ffd9a0" />
            </group>
        </group>
    );
};
