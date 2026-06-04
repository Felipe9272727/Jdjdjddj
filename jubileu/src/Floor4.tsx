/**
 * Floor4.tsx — Andar 4. FOUNDATION pass (theme TBD).
 *
 * The concrete look/genre of Floor 4 is deliberately NOT decided yet — the user
 * will dictate it later. So this file is a clean, themeable SCAFFOLD: an
 * intentional neutral staging area (not a debug grey slab) with every seam a
 * future theme needs, clearly marked. To reskin, edit the FLOOR4 block and drop
 * content into the JSX slots — no structural hunting required.
 *
 * ── Extension seams (how the theme drops in) ──────────────────────────────────
 *  • LOOK      → edit the FLOOR4 constants/palette block below + the env slots.
 *  • MOVEMENT  → level 4 currently uses Player's default flat-walk branch
 *                (Player.tsx `else { pos.y = 0 }`). For custom movement add an
 *                `else if (currentLevel === 4)` branch next to the level-2 swim /
 *                level-3 parkour branches in Player.tsx.
 *  • AUDIO     → fill floor4Sfx.ts and give the reserved 'floor4' music bus a
 *                track (App.tsx Floor-4 enter effect: getMusicBus('floor4', 65)).
 *  • ENTITIES  → reuse buildDiabreteRig (diabreteRig.ts) or createToonMaterial
 *                (cartoonToon.ts) + the Spring class; mount in the ENTITIES slot.
 *  • OBJECTIVE → clone the f3Hazards.ts shared-state + setOnProgress pattern
 *                (a progress flag opens a cutscene whose outcome advances) and add
 *                an advanceToFloor5AfterWin handler in App.tsx (copy of
 *                advanceToFloor4AfterWin). Progression is OPEN for now.
 *  • CUTSCENE  → reuse Floor3Cutscene + the dialogue-camera lock (dialogueOpen).
 */

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

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

/** Neutral staging sky so the plate doesn't float in pure black. */
const Sky: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color(FLOOR4.sky);
        scene.fog = new THREE.Fog(FLOOR4.sky, FLOOR4.fogNear, FLOOR4.fogFar);
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

export const Floor4Environment: React.FC<{ elevator?: boolean }> = ({ elevator = true }) => {
    // A subtle grid sitting just above the slab for the classic base-plate read.
    const grid = useMemo(() => {
        const g = new THREE.GridHelper(FLOOR4.plate, FLOOR4.plate, FLOOR4.gridColor, FLOOR4.gridSub);
        (g.material as THREE.Material).transparent = true;
        (g.material as THREE.Material).opacity = 0.5;
        g.position.y = 0.01;
        return g;
    }, []);

    return (
        <group>
            <Sky />

            {/* Lighting — flat & even (neutral staging) */}
            <ambientLight intensity={FLOOR4.ambient} color="#eef2f8" />
            <directionalLight position={[8, 18, 10]} intensity={FLOOR4.sun} color="#fffaf0" castShadow />
            <hemisphereLight args={['#dfe7f2', '#9aa6b4', 0.6]} />

            {/* Base plate — top surface at y=0 (matches the player's flat ground) */}
            <mesh position={[0, -0.5, 0]} receiveShadow>
                <boxGeometry args={[FLOOR4.plate, 1, FLOOR4.plate]} />
                <meshStandardMaterial color={FLOOR4.plateColor} roughness={0.95} metalness={0} />
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
