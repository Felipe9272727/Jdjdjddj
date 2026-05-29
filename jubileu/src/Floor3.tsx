/**
 * Floor3.tsx — Sala branca minimalista.
 *
 * Câmara de primeira pessoa com pulo (Space / botão mobile).
 * Room: X [-14, +14] · Y [0, 8] · Z [-10, +22]. Elevator at z = -10.
 */

import React from 'react';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

const WHITE = '#f4f4f4';
const OFF   = '#e8e8e8';

export const Floor3Environment: React.FC = () => (
    <group>
        <color attach="background" args={[WHITE]} />
        <fog attach="fog" args={[WHITE, 25, 55]} />

        {/* Lighting — bright, flat, clinical */}
        <ambientLight intensity={2.2} color="#ffffff" />
        <directionalLight position={[0, 8, 6]}  intensity={1.2} color="#ffffff" />
        <directionalLight position={[0, 8, -6]} intensity={0.6} color="#f0f0ff" />

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 6]} receiveShadow>
            <planeGeometry args={[28, 32]} />
            <meshStandardMaterial color={OFF} roughness={0.8} metalness={0.0} />
        </mesh>

        {/* Ceiling */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 8, 6]}>
            <planeGeometry args={[28, 32]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} side={THREE.BackSide} />
        </mesh>

        {/* Left wall X = -14 */}
        <mesh position={[-14, 4, 6]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[32, 8]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>

        {/* Right wall X = +14 */}
        <mesh position={[14, 4, 6]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[32, 8]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>

        {/* Far wall Z = +22 */}
        <mesh position={[0, 4, 22]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[28, 8]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>

        {/* Entry wall Z = -10 — left and right of elevator opening */}
        <mesh position={[-7.65, 4, -10]}>
            <planeGeometry args={[12.7, 8]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>
        <mesh position={[7.65, 4, -10]}>
            <planeGeometry args={[12.7, 8]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>
        {/* Header above elevator doorway */}
        <mesh position={[0, 6.25, -10]}>
            <planeGeometry args={[2.6, 3.5]} />
            <meshStandardMaterial color={WHITE} roughness={0.9} />
        </mesh>

        {/* Elevator facade */}
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
        </group>
    </group>
);

export default Floor3Environment;
