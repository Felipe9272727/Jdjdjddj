/**
 * Floor4.tsx — Andar 4. The floor itself is the 2D side-scroller overlay
 * (Floor4Canvas2D / Floor4Scene2D — the destroyed lobby); what remains HERE is
 * the floor's 3D-side support kit, all of it about the RIDE UP:
 *
 *  • useFloor4Audio    — the floor's audio lifecycle (App calls it once).
 *  • Pixelate3DRamp    — the 3D→2D transition ridden from inside the elevator.
 *  • Floor4Environment — the ride shell: just a dark flat backdrop behind the
 *    3D elevator interior while the doors are shut (the old 3D base plate is
 *    gone — the real floor is 100% the 2D overlay).
 */

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
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
 *
 * DRIVEN BY THE ELEVATOR TIMER (not its own clock): each frame the target
 * progress is (10 − timer)/10 and the visible progress chases it at a capped
 * rate — so the pixelation always lands fully chunky exactly when the doors
 * open, even if the 1s ticks stretch on a slow device, and each 1s notch is
 * smoothed instead of stepping.
 *
 * The 3D render gradually collapses into chunky 2D pixels:
 *   • dpr steps DOWN in quantized notches (curve ^1.5 — gentle start but
 *     clearly visible from ~a third in, huge blocks right before the doors);
 *   • the colour drains via a CSS filter on the canvas (desaturate + contrast),
 *     selling "the world is flattening into 2D" without a postprocessing pass.
 * On unmount (doors open → the 2D overlay takes the screen) it clears the
 * filter; the remounted <AdaptiveDpr> restores the dpr by itself.
 */
export const Pixelate3DRamp: React.FC<{ timer: number | null }> = ({ timer }) => {
    const gl = useThree((s) => s.gl);
    const setDpr = useThree((s) => s.setDpr);
    const base = useRef<number | null>(null);
    const progress = useRef(0);
    const lastStep = useRef(-1);
    const timerRef = useRef(timer);
    timerRef.current = timer;

    useFrame((_, dt) => {
        if (base.current === null) base.current = gl.getPixelRatio();
        const t = timerRef.current;
        const target = t === null ? 1 : THREE.MathUtils.clamp((10 - t) / 10, 0, 1);
        // chase the timer-driven target, capped at ~0.14/s (full ramp ≈ doors)
        const step = Math.min(dt, 0.1) * 0.14;
        progress.current = Math.min(target, progress.current + step);

        const e = Math.pow(progress.current, 1.5);
        const STEPS = 22;
        const notch = Math.floor(e * STEPS);
        if (notch !== lastStep.current) {
            lastStep.current = notch;
            const q = notch / STEPS;
            setDpr(Math.max(0.045, base.current * (1 - q * 0.96)));
            gl.domElement.style.imageRendering = notch > 0 ? 'pixelated' : 'auto';
        }
        gl.domElement.style.filter =
            `saturate(${(1 - 0.75 * e).toFixed(3)}) contrast(${(1 + 0.16 * e).toFixed(3)}) brightness(${(1 + 0.05 * e).toFixed(3)})`;
    });

    useEffect(() => () => {
        gl.domElement.style.filter = '';
        gl.domElement.style.imageRendering = 'auto';
    }, [gl]);

    return null;
};

// ── Ride shell ────────────────────────────────────────────────────────────────

/** Flat dark backdrop — solid colour, NO fog (nothing to see out there). */
const Sky2D: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color('#0b0c12');
        scene.fog = null;
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

/**
 * The Floor-4 "environment" in the 3D world = just the ride shell. The player
 * only ever sees the INSIDE of the elevator here (ElevatorInterior has its own
 * light); when the doors open, the 2D overlay owns the screen. No base plate,
 * no 3D props — the floor lives entirely in Floor4Scene2D.
 */
export const Floor4Environment: React.FC = () => <Sky2D />;

export default Floor4Environment;
