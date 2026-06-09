/**
 * Floor4Canvas2D.tsx — the in-game 2D Floor 4: a full-screen overlay with its
 * OWN orthographic <Canvas> (a real 2D side-scroller, separate from the 3D game
 * canvas) + the scene + the controllable player + touch/keyboard controls.
 *
 * ARRIVAL CHOREOGRAPHY (the back half of the 3D→2D transition): App keeps this
 * UNMOUNTED for the whole 20s elevator ride — the player rides INSIDE the 3D
 * elevator, and from T-10s the 3D render pixelates down (Pixelate3DRamp). When
 * the doors open (timer 0) this mounts and:
 *   1. the 2D world starts as chunky as the 3D ended and RESOLVES to crisp
 *      (ResolveFX ramps this canvas's pixelRatio) under a brief black veil —
 *      pixel-to-pixel continuity, never an abrupt cut;
 *   2. the player is INSIDE the 2D elevator, doors closed;
 *   3. the 2D doors slide open (IntroDirector) and control unlocks.
 *
 * The workbench (floor4.html) mounts this exact same component. `onExit` fires
 * when the player walks back into the elevator (ride back down).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Floor4Scene2D from './Floor4Scene2D';
import { Floor4Player2D } from './Floor4Player2D';
import { Floor4Interact } from './Floor4Interact';
import { f4Reset, f4SetOnChange } from './f4Lore';

/** R3F aims the default camera at the origin, so position [0,3,10] arrives with
 *  a subtle DOWNWARD TILT — which, under an orthographic camera, parallax-shears
 *  the flat layers apart (each z-layer slides vertically). Zero the rotation so
 *  the camera is truly axis-aligned: every layer maps 1:1, real 2D. */
export const AxisAlignedCamera: React.FC = () => {
    const camera = useThree((s) => s.camera);
    useEffect(() => { camera.rotation.set(0, 0, 0); camera.updateMatrixWorld(); }, [camera]);
    return null;
};

/** Ramps THIS canvas's pixelRatio from chunky → crisp, so the 2D world resolves
 *  out of big pixels on entry. Self-contained (own canvas) — never touches the
 *  3D game renderer. */
const ResolveFX: React.FC<{ durationMs?: number }> = ({ durationMs = 2600 }) => {
    const { gl } = useThree();
    const t0 = useRef(performance.now());
    const base = useRef(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
    const done = useRef(false);
    useFrame(() => {
        if (done.current) return;
        const k = Math.min(1, (performance.now() - t0.current) / durationMs);
        const dpr = THREE.MathUtils.lerp(base.current * 0.05, base.current, k * k);
        gl.setPixelRatio(dpr);
        gl.domElement.style.imageRendering = k < 1 ? 'pixelated' : 'auto';
        if (k >= 1) { done.current = true; }
    });
    return null;
};

/** Drives the arrival beat: a short hold while the pixels resolve, then the 2D
 *  elevator doors slide open (smoothstep) and the player is unlocked. */
const IntroDirector: React.FC<{ doorRef: React.MutableRefObject<number>; lockRef: React.MutableRefObject<boolean> }> = ({ doorRef, lockRef }) => {
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        const k = THREE.MathUtils.clamp((t.current - 1.6) / 1.4, 0, 1);
        doorRef.current = k * k * (3 - 2 * k);
        if (k >= 0.92 && lockRef.current) lockRef.current = false;
    });
    return null;
};

export const Floor4Canvas2D: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const dirRef = useRef(0);
    const doorRef = useRef(0);          // 2D elevator doors (0 closed → 1 open)
    const lockRef = useRef(true);       // player frozen inside until the doors open
    const uiLockRef = useRef(false);    // frozen while a lore panel is open
    const jumpRef = useRef(false);      // queued jump (▲ button / Space)
    const playerXRef = useRef(-8);      // live player x for the interact layer
    const shakeRef = useRef(0);         // 0..1 screen shake (knocks from below)
    const wrapRef = useRef<HTMLDivElement>(null);
    const [flash, setFlash] = useState(true);   // black veil that fades on entry
    const [loreV, setLoreV] = useState(0);      // re-render scene on lore changes

    useEffect(() => { const id = setTimeout(() => setFlash(false), 50); return () => clearTimeout(id); }, []);

    // lore state: fresh run per visit; scene re-renders on every change
    useEffect(() => {
        f4Reset();
        f4SetOnChange(() => setLoreV((v) => v + 1));
        return () => f4SetOnChange(null);
    }, []);

    // decaying screen shake (driven by shakeRef — e.g. the knocks from below)
    useEffect(() => {
        const id = setInterval(() => {
            const el = wrapRef.current;
            if (!el) return;
            if (shakeRef.current > 0.02) {
                shakeRef.current *= 0.9;
                const s = shakeRef.current;
                el.style.transform = `translate(${(Math.random() - 0.5) * 18 * s}px, ${(Math.random() - 0.5) * 14 * s}px)`;
            } else if (el.style.transform) { el.style.transform = ''; }
        }, 33);
        return () => clearInterval(id);
    }, []);

    // Keyboard: ←/A and →/D (held); Space/W/↑ queues a jump.
    useEffect(() => {
        const keys = { left: false, right: false };
        const upd = () => { dirRef.current = (keys.right ? 1 : 0) + (keys.left ? -1 : 0); };
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'arrowleft' || k === 'a') { keys.left = true; upd(); }
            if (k === 'arrowright' || k === 'd') { keys.right = true; upd(); }
            if ((k === ' ' || k === 'arrowup' || k === 'w') && !e.repeat) { e.preventDefault(); jumpRef.current = true; }
        };
        const ku = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'arrowleft' || k === 'a') { keys.left = false; upd(); }
            if (k === 'arrowright' || k === 'd') { keys.right = false; upd(); }
        };
        window.addEventListener('keydown', kd);
        window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, []);

    const set = (d: number) => (e: React.PointerEvent) => { e.preventDefault(); dirRef.current = d; };
    const clr = (e: React.PointerEvent) => { e.preventDefault(); dirRef.current = 0; };

    const btn: React.CSSProperties = {
        position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 22px)',
        width: 78, height: 78, borderRadius: 16, border: '3px solid #f4f0e6',
        background: 'rgba(20,22,30,0.55)', color: '#f4f0e6', fontSize: 34, lineHeight: '72px',
        textAlign: 'center', userSelect: 'none', touchAction: 'none', fontFamily: 'monospace',
    };

    return (
        <div ref={wrapRef} style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#160b10', touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [0, 3, 10], zoom: 48, near: 0.1, far: 100 }} gl={{ preserveDrawingBuffer: true }}>
                <AxisAlignedCamera />
                <ResolveFX />
                <IntroDirector doorRef={doorRef} lockRef={lockRef} />
                <Floor4Scene2D doorOpenRef={doorRef} loreVersion={loreV} />
                <Floor4Player2D dirRef={dirRef} lockRef={lockRef} uiLockRef={uiLockRef} playerXRef={playerXRef} jumpRef={jumpRef} onExit={onExit} />
            </Canvas>

            {/* lore discovery layer: prompts, diary, puzzles, finale */}
            <Floor4Interact playerXRef={playerXRef} uiLockRef={uiLockRef} shakeRef={shakeRef} />

            {/* grade pass: vignette pulls the eye center-frame, faint scanlines
                sell the CRT-pixel mood — both static DOM, zero render cost */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 120% 95% at 50% 42%, rgba(0,0,0,0) 54%, rgba(10,4,12,0.46) 100%)',
            }} />
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.08,
                background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, transparent 1px, transparent 3px)',
            }} />

            {/* entry black veil (fades once — the pixel continuity does the rest) */}
            <div style={{
                position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none',
                opacity: flash ? 1 : 0, transition: 'opacity 0.6s ease-out',
            }} />

            {/* walk arrows together on the LEFT (where the 3D joystick sits)… */}
            <div style={{ ...btn, left: 'calc(env(safe-area-inset-left) + 22px)' }}
                onPointerDown={set(-1)} onPointerUp={clr} onPointerLeave={clr} onPointerCancel={clr}>◄</div>
            <div style={{ ...btn, left: 'calc(env(safe-area-inset-left) + 112px)' }}
                onPointerDown={set(1)} onPointerUp={clr} onPointerLeave={clr} onPointerCancel={clr}>►</div>
            {/* …and JUMP on the RIGHT (where the 3D action button sits) */}
            <div style={{ ...btn, right: 'calc(env(safe-area-inset-right) + 22px)' }}
                onPointerDown={(e) => { e.preventDefault(); jumpRef.current = true; }}>▲</div>
        </div>
    );
};

export default Floor4Canvas2D;
