/**
 * Floor4Canvas2D.tsx — the in-game 2D Floor 4: a full-screen overlay with its
 * OWN orthographic <Canvas> (a real 2D side-scroller, separate from the 3D game
 * canvas) + the scene + the controllable player + touch/keyboard controls.
 *
 * App mounts this when currentLevel === 4 (over the 3D canvas). The workbench
 * (floor4.html) mounts the exact same component. `onExit` fires when the player
 * walks left into the elevator (ride back down).
 */
import React, { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import Floor4Scene2D from './Floor4Scene2D';
import { Floor4Player2D } from './Floor4Player2D';

export const Floor4Canvas2D: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const dirRef = useRef(0);

    // Keyboard: ←/A and →/D (held).
    useEffect(() => {
        const keys = { left: false, right: false };
        const upd = () => { dirRef.current = (keys.right ? 1 : 0) + (keys.left ? -1 : 0); };
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'arrowleft' || k === 'a') { keys.left = true; upd(); }
            if (k === 'arrowright' || k === 'd') { keys.right = true; upd(); }
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#1a1d26', touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [0, 3, 10], zoom: 48, near: 0.1, far: 100 }} gl={{ preserveDrawingBuffer: true }}>
                <Floor4Scene2D />
                <Floor4Player2D dirRef={dirRef} onExit={onExit} />
            </Canvas>
            <div style={{ ...btn, left: 'calc(env(safe-area-inset-left) + 22px)' }}
                onPointerDown={set(-1)} onPointerUp={clr} onPointerLeave={clr} onPointerCancel={clr}>◄</div>
            <div style={{ ...btn, right: 'calc(env(safe-area-inset-right) + 22px)' }}
                onPointerDown={set(1)} onPointerUp={clr} onPointerLeave={clr} onPointerCancel={clr}>►</div>
        </div>
    );
};

export default Floor4Canvas2D;
