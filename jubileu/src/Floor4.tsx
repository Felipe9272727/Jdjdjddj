/**
 * Floor4.tsx — Andar 4 com suporte a modo 2D pixel art.
 *
 * Este andar pode operar em dois modos:
 * - Modo 3D (padrão): Renderização normal com materiais PBR
 * - Modo 2D (pixelado): Renderização estilo pixel art retro
 *
 * A transição do Floor 3 ativa automaticamente o modo 2D via props.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import { PixelArtScene } from './PixelArtRenderer';

// ── Theme block — edit here to reskin (size, palette, lighting, fog) ──────────
const FLOOR4 = {
    plate: 40,                 // base-plate extent (x/z)
    plateColor: '#9aa3b0',
    gridColor: '#6b7480',
    gridSub:   '#828b98',
    sky:       '#aeb6c2',
    fogNear:   50,
    fogFar:    140,
    ambient:   0.8,
    sun:       1.3,
};

// Paleta de cores estilo pixel art (limitada para look retro)
const PIXEL_PALETTE = {
    ground: '#8b9dc3',
    grid: '#4a5f7a',
    sky: '#c5d5e8',
    elevator: '#6b7c8f',
};

/** Neutral staging sky so the plate doesn't float in pure black. */
const Sky: React.FC<{ mode2D?: boolean }> = ({ mode2D = false }) => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        const skyColor = mode2D ? PIXEL_PALETTE.sky : FLOOR4.sky;
        scene.background = new THREE.Color(skyColor);
        scene.fog = new THREE.Fog(skyColor, FLOOR4.fogNear, FLOOR4.fogFar);
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene, mode2D]);
    return null;
};

/** Grid estilo pixel art - linhas mais grossas e visíveis */
const PixelGrid: React.FC = () => {
    const grid = useMemo(() => {
        const g = new THREE.GridHelper(FLOOR4.plate, FLOOR4.plate / 2, PIXEL_PALETTE.grid, PIXEL_PALETTE.grid);
        (g.material as THREE.Material).transparent = true;
        (g.material as THREE.Material).opacity = 0.8;
        g.position.y = 0.01;
        return g;
    }, []);
    return <primitive object={grid} />;
};

export const Floor4Environment: React.FC<{ elevator?: boolean; mode2D?: boolean }> = ({ 
    elevator = true, 
    mode2D = false 
}) => {
    // Grid normal ou pixelado dependendo do modo
    const grid = useMemo(() => {
        const g = new THREE.GridHelper(
            FLOOR4.plate, 
            mode2D ? FLOOR4.plate / 2 : FLOOR4.plate, 
            mode2D ? PIXEL_PALETTE.grid : FLOOR4.gridColor, 
            mode2D ? PIXEL_PALETTE.grid : FLOOR4.gridSub
        );
        (g.material as THREE.Material).transparent = true;
        (g.material as THREE.Material).opacity = mode2D ? 0.8 : 0.5;
        g.position.y = 0.01;
        return g;
    }, [mode2D]);

    const plateColor = mode2D ? PIXEL_PALETTE.ground : FLOOR4.plateColor;

    return (
        <group>
            <Sky mode2D={mode2D} />

            {/* Lighting — mais plano em 2D para look sprite */}
            <ambientLight intensity={mode2D ? 1.2 : FLOOR4.ambient} color={mode2D ? "#ffffff" : "#eef2f8"} />
            <directionalLight 
                position={[8, 18, 10]} 
                intensity={mode2D ? 0.8 : FLOOR4.sun} 
                color={mode2D ? "#f0f0f0" : "#fffaf0"} 
                castShadow={!mode2D}
            />
            {!mode2D && <hemisphereLight args={['#dfe7f2', '#9aa6b4', 0.6]} />}

            {/* Base plate — top surface at y=0 (matches the player's flat ground) */}
            <mesh position={[0, -0.5, 0]} receiveShadow={!mode2D}>
                <boxGeometry args={[FLOOR4.plate, 1, FLOOR4.plate]} />
                <meshStandardMaterial 
                    color={plateColor} 
                    roughness={mode2D ? 1.0 : 0.95} 
                    metalness={0}
                    flatShading={mode2D}
                />
            </mesh>
            <primitive object={grid} />

            {/* ── ENV PROPS slot ── (theme set-dressing goes here) */}
            {/* ── ENTITIES slot ── (characters / NPCs via buildDiabreteRig or toon prims) */}
            {/* ── HAZARDS slot ── (objective / pickups; clone f3Hazards.ts when designed) */}
            {/* ── CUTSCENE anchor ── (intro performer; reuse Floor3Cutscene pattern) */}

            {/* Elevator facade so the player can leave (ride back to the lobby) */}
            {elevator && (
                <group position={[0, 0, -10]}>
                    <ElevatorFacade z={0} height={5} width={10} />
                </group>
            )}
        </group>
    );
};

export default Floor4Environment;
