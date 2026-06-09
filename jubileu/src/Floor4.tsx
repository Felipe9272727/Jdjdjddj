/**
 * Floor4.tsx — Andar 4. This floor is 100% 2D pixel-art (flat, UNLIT sprites/
 * planes via meshBasic + NearestFilter), seen in the first-person camera —
 * Doom-ish 2.5D. No 3D lighting/shadows/fog. SHIPS in the game (App mounts it at
 * level 4); the floor4.html runner just renders these same components in isolation.
 *
 * ── Extension seams (how content drops in) ────────────────────────────────────
 *  • LOOK      → edit the FLOOR4 block + add flat planes with `pixelTex` art.
 *  • MOVEMENT  → level 4 uses Player's default flat-walk branch (y=0). For custom
 *                movement add `else if (currentLevel === 4)` in Player.tsx.
 *  • AUDIO     → fill floor4Sfx.ts; this module's `useFloor4Audio` hook reserves
 *                the 'floor4' music bus (App calls it — no App audio code).
 *  • ENTITIES  → BILLBOARD pixel sprites (planes facing the camera) — drop into
 *                the ENTITIES slot. Player sprite spec: FLOOR4.md §8.
 *  • CUTSCENE  → the 3D→2D pixelate TRANSITION + intro performer (FLOOR4.md §8).
 *  • OBJECTIVE → clone f3Hazards.ts shared-state + setOnProgress; add an
 *                advanceToFloor5AfterWin in App.tsx (copy of advanceToFloor4AfterWin).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Floor4Elevator2D } from './Floor4Elevator';
import { pixelTex, px } from './floor4-pixels';
import { configureFloor4Sfx, clearFloor4Sfx } from './floor4Sfx';
import { getMusicBus, setMusicActive } from './musicDirector';

/**
 * Floor 4's AUDIO LIFECYCLE — owned by this module, NOT App.tsx, so building the
 * floor's sound stays in here. Call once at the top of App:
 *   useFloor4Audio(currentLevel === 4, audioCtx, cartoonBusRef);
 * On enter it points the floor's SFX at the master bus and reserves the
 * exclusive 'floor4' music group (no track yet — theme TBD); on leave it tears
 * down. No-op without an AudioContext (e.g. the offline dev workbench).
 */
export function useFloor4Audio(
    active: boolean,
    audioCtx: AudioContext | null,
    busRef: React.MutableRefObject<AudioNode | null>,
): void {
    useEffect(() => {
        if (!active || !audioCtx) return;
        configureFloor4Sfx(audioCtx, busRef.current);
        getMusicBus('floor4', 65);
        setMusicActive('floor4', true);
        return () => { setMusicActive('floor4', false); clearFloor4Sfx(); };
    }, [active, audioCtx, busRef]);
}

/**
 * Pixelate3DRamp — the 3D→2D TRANSITION, ridden from INSIDE the elevator.
 * App mounts this in the 3D Canvas during the last ~10s of the ride to Floor 4
 * (and unmounts <AdaptiveDpr> while it's up, so nothing fights over the dpr).
 * The 3D render gradually collapses into chunky 2D pixels:
 *   • dpr steps DOWN in quantized notches (ease-in cubic — imperceptible at
 *     first, accelerating into full blocks right before the doors open);
 *   • the colour drains via a CSS filter on the canvas (desaturate + contrast),
 *     selling "the world is flattening into 2D" without a postprocessing pass.
 * On unmount (doors open → the 2D overlay takes the screen) it clears the
 * filter; the remounted <AdaptiveDpr> restores the dpr by itself.
 */
export const Pixelate3DRamp: React.FC<{ durationMs?: number }> = ({ durationMs = 9000 }) => {
    const gl = useThree((s) => s.gl);
    const setDpr = useThree((s) => s.setDpr);
    const t0 = useRef(performance.now());
    const base = useRef<number | null>(null);
    const lastStep = useRef(-1);

    useFrame(() => {
        if (base.current === null) base.current = gl.getPixelRatio();
        const k = Math.min(1, (performance.now() - t0.current) / durationMs);
        const e = k * k * k;                              // ease-in: NOT abrupt
        // Stepped dpr (re-sizing buffers every frame would thrash; notches also
        // read as "blockifying" rather than a continuous blur).
        const STEPS = 26;
        const step = Math.floor(e * STEPS);
        if (step !== lastStep.current) {
            lastStep.current = step;
            const q = step / STEPS;
            setDpr(Math.max(0.05, base.current * (1 - q * 0.96)));
            gl.domElement.style.imageRendering = step > 0 ? 'pixelated' : 'auto';
        }
        gl.domElement.style.filter = `saturate(${(1 - 0.65 * e).toFixed(3)}) contrast(${(1 + 0.14 * e).toFixed(3)})`;
    });

    useEffect(() => () => {
        gl.domElement.style.filter = '';
        gl.domElement.style.imageRendering = 'auto';
    }, [gl]);

    return null;
};

// ── Theme block — Floor 4 is 100% 2D: flat, UNLIT pixel-art (meshBasic +
//    NearestFilter), no 3D lights/shadows/fog. Edit here to reskin. ────────────
const FLOOR4 = {
    plate: 60,                 // base-plate extent (x/z)
    sky:   '#1a1d26',          // flat 2D backdrop colour
    floorBase: '#3a4150',
    floorLine: '#2a2f3b',
    floorSpec: '#474e60',
};

/** Flat 2D backdrop — solid colour, NO fog (fog is a 3D depth cue). */
const Sky2D: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color(FLOOR4.sky);
        scene.fog = null;
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

/** One tiled pixel floor tile (a base colour + dark grid border + speckles). */
function makeFloorTex(): THREE.CanvasTexture {
    const t = pixelTex(16, 16, (ctx) => {
        px(ctx, 0, 0, 16, 16, FLOOR4.floorBase);
        px(ctx, 0, 0, 16, 1, FLOOR4.floorLine);   // grid lines (top + left edge)
        px(ctx, 0, 0, 1, 16, FLOOR4.floorLine);
        px(ctx, 5, 9, 2, 2, FLOOR4.floorSpec);     // speckles for texture
        px(ctx, 11, 4, 1, 1, FLOOR4.floorSpec);
        px(ctx, 8, 13, 1, 1, FLOOR4.floorSpec);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

export const Floor4Environment: React.FC<{ elevator?: boolean }> = ({ elevator = true }) => {
    // Flat pixel ground — one tile repeated across the plate (2 world units/tile).
    const ground = useMemo(() => {
        const t = makeFloorTex();
        t.repeat.set(FLOOR4.plate / 2, FLOOR4.plate / 2);
        return t;
    }, []);

    return (
        <group>
            <Sky2D />

            {/* Flat pixel ground (UNLIT — 100% 2D). Top surface at y=0. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[FLOOR4.plate, FLOOR4.plate]} />
                <meshBasicMaterial map={ground} toneMapped={false} />
            </mesh>

            {/* ── ENV PROPS slot ── (2D pixel set-dressing: flat planes + pixelTex) */}
            {/* ── ENTITIES slot ── (billboard pixel sprites — face the camera) */}
            {/* ── HAZARDS slot ── (objective / pickups; clone f3Hazards.ts when designed) */}
            {/* ── CUTSCENE anchor ── (intro / transition performer) */}

            {/* The elevator, recreated ENTIRELY in 2D pixel-art (no 3D facade) —
                the doorway the player arrives through / rides back from. */}
            {elevator && <Floor4Elevator2D position={[0, 0, -8]} />}
        </group>
    );
};

export default Floor4Environment;
