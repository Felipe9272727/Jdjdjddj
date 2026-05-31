/**
 * Floor4.tsx — Andar 4 (WIP). For now it's just a clean "base plate": a flat
 * grey blockout slab with a grid, lit neutrally, with the elevator facade so the
 * player can ride back down. This is the scaffold the real Floor 4 gets built
 * on later; movement falls through Player's default flat-ground branch (y=0).
 */

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

const PLATE = 40;        // base-plate extent (x/z)

/** Neutral blockout sky so the plate doesn't float in pure black. */
const Sky: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color('#aeb6c2');
        scene.fog = new THREE.Fog('#aeb6c2', 50, 140);
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

export const Floor4Environment: React.FC = () => {
    // A subtle grid sitting just above the slab for the classic base-plate read.
    const grid = useMemo(() => {
        const g = new THREE.GridHelper(PLATE, PLATE, '#6b7480', '#8b94a1');
        (g.material as THREE.Material).transparent = true;
        (g.material as THREE.Material).opacity = 0.5;
        g.position.y = 0.01;
        return g;
    }, []);

    return (
        <group>
            <Sky />

            {/* Lighting — flat & even (blockout) */}
            <ambientLight intensity={0.8} color="#eef2f8" />
            <directionalLight position={[8, 18, 10]} intensity={1.3} color="#fffaf0" castShadow />
            <hemisphereLight args={['#dfe7f2', '#9aa6b4', 0.6]} />

            {/* Base plate — top surface at y=0 (matches the player's flat ground) */}
            <mesh position={[0, -0.5, 0]} receiveShadow>
                <boxGeometry args={[PLATE, 1, PLATE]} />
                <meshStandardMaterial color="#9aa3b0" roughness={0.95} metalness={0} />
            </mesh>
            <primitive object={grid} />

            {/* Elevator facade so the player can leave (ride back to the lobby) */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={5} width={10} />
            </group>
        </group>
    );
};

export default Floor4Environment;
