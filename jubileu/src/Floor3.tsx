/**
 * Floor3.tsx — Placeholder chamber the elevator reaches after the player
 * collects every Floor 2 shard. A clean, atmospheric holding room with a
 * working elevator and a glowing "FLOOR 3 — EM BREVE" sign, so the full
 * shards → teleport → elevator → new-floor loop is playable end-to-end while
 * the real level is built out later.
 *
 * Layout deliberately mirrors the 10×10 lobby shell (see _WALLS_FLOOR3 in
 * constants.ts) with the elevator alcove at z=-10, so movement/collision and
 * the elevator transition behave exactly like the lobby.
 */

import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

const WALL = '#15161c';
const FLOOR = '#0c0d12';
const ACCENT = '#36e0ff';

export const Floor3Environment: React.FC = () => {
    return (
        <group>
            <color attach="background" args={['#04050a']} />
            <fog attach="fog" args={['#04050a', 9, 34]} />

            {/* Soft fill so the room reads without washing it out. */}
            <ambientLight intensity={0.5} color="#9fd8ff" />
            <hemisphereLight args={['#bfe9ff', '#0a0c14', 0.5]} />
            {/* Central cool key light. */}
            <pointLight position={[0, 4.4, 0]} intensity={3.4} distance={20} decay={2} color="#bfe9ff" />
            {/* Warm elevator spill so the doorway is inviting. */}
            <pointLight position={[0, 3.0, -8.5]} intensity={2.6} distance={12} decay={1.6} color="#ffd9a0" />
            {/* Accent uplights flanking the sign. */}
            <pointLight position={[-4, 1.0, 8.6]} intensity={1.6} distance={9} decay={2} color={ACCENT} />
            <pointLight position={[4, 1.0, 8.6]} intensity={1.6} distance={9} decay={2} color={ACCENT} />

            {/* Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color={FLOOR} roughness={0.85} metalness={0.1} />
            </mesh>
            {/* Glowing inlay strip running toward the elevator. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]}>
                <planeGeometry args={[0.5, 14]} />
                <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>

            {/* Ceiling */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]}>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color="#0a0b10" roughness={0.95} side={THREE.DoubleSide} />
            </mesh>

            {/* Walls — 10×10 room (matches _WALLS_FLOOR3). */}
            {/* Back wall (z=10) — hosts the sign. */}
            <mesh position={[0, 2.5, 10]}>
                <boxGeometry args={[20, 5, 0.3]} />
                <meshStandardMaterial color={WALL} roughness={0.8} />
            </mesh>
            {/* Left / right */}
            <mesh position={[-10, 2.5, 0]}>
                <boxGeometry args={[0.3, 5, 20]} />
                <meshStandardMaterial color={WALL} roughness={0.8} />
            </mesh>
            <mesh position={[10, 2.5, 0]}>
                <boxGeometry args={[0.3, 5, 20]} />
                <meshStandardMaterial color={WALL} roughness={0.8} />
            </mesh>
            {/* Front wall split by the elevator opening (gap x ∈ [-1.3, 1.3]). */}
            <mesh position={[-5.65, 2.5, -10]}>
                <boxGeometry args={[8.7, 5, 0.3]} />
                <meshStandardMaterial color={WALL} roughness={0.8} />
            </mesh>
            <mesh position={[5.65, 2.5, -10]}>
                <boxGeometry args={[8.7, 5, 0.3]} />
                <meshStandardMaterial color={WALL} roughness={0.8} />
            </mesh>

            {/* Elevator alcove facade (same as the lobby) at z=-10. */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={5} width={10} />
            </group>

            {/* Glowing "FLOOR 3 — EM BREVE" sign on the back wall. */}
            <Html position={[0, 3.1, 9.8]} center transform distanceFactor={8} occlude>
                <div style={{
                    fontFamily: 'system-ui, sans-serif',
                    textAlign: 'center',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    <div style={{
                        fontSize: 64, fontWeight: 800, letterSpacing: 6,
                        color: '#eafcff',
                        textShadow: `0 0 18px ${ACCENT}, 0 0 40px ${ACCENT}`,
                    }}>FLOOR 03</div>
                    <div style={{
                        marginTop: 8, fontSize: 26, fontWeight: 600, letterSpacing: 10,
                        color: ACCENT,
                        textShadow: `0 0 14px ${ACCENT}`,
                    }}>EM BREVE</div>
                </div>
            </Html>

            {/* A couple of cold monolith props so the room isn't empty. */}
            {[-6, 6].map((x) => (
                <mesh key={x} position={[x, 1.4, 5]}>
                    <boxGeometry args={[1.0, 2.8, 1.0]} />
                    <meshStandardMaterial color="#101218" roughness={0.6} metalness={0.3} emissive={ACCENT} emissiveIntensity={0.12} />
                </mesh>
            ))}
        </group>
    );
};

export default Floor3Environment;
