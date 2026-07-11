/**
 * floor6-dev.tsx — isolated RUNNER for the REAL Floor 6 (Suíte 612 escape
 * room). Mounts the SAME Floor6Suite + Floor6Overlay the game uses, plus a
 * tiny dev first-person walker (WASD + drag look) running the same wall
 * resolve, so the whole puzzle chain can be played end-to-end here.
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor6.html
 */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Vector3 } from 'three';
import Floor6Suite from './Floor6Suite';
import Floor6Overlay from './Floor6Overlay';
import { configureFloor6Sfx } from './floor6Sfx';
import { f6Reset, f6DoorWalls, f6 } from './f6Escape';
import { wallsForState } from './constants';
import { resolveCollision } from './physics';

const arm = () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    configureFloor6Sfx(ctx);
    window.removeEventListener('pointerdown', arm);
};
window.addEventListener('pointerdown', arm);

const posRef = { current: new Vector3(0, 0, -8.6) };
const frozenRef = { current: false };

const DevWalker: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const keys = useRef<Record<string, boolean>>({});
    const ang = useRef({ theta: Math.PI, phi: 0 });
    const drag = useRef<{ x: number; y: number } | null>(null);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f6ang = ang;

    useEffect(() => {
        const kd = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
        const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
        const pd = (e: PointerEvent) => { if (!frozenRef.current) drag.current = { x: e.clientX, y: e.clientY }; };
        const pm = (e: PointerEvent) => {
            if (!drag.current) return;
            ang.current.theta -= (e.clientX - drag.current.x) * 0.004;
            ang.current.phi = Math.max(-1.4, Math.min(1.4, ang.current.phi + (e.clientY - drag.current.y) * 0.004));
            drag.current = { x: e.clientX, y: e.clientY };
        };
        const pu = () => { drag.current = null; };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        window.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm);
        window.addEventListener('pointerup', pu);
        return () => {
            window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
            window.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm);
            window.removeEventListener('pointerup', pu);
        };
    }, []);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const k = keys.current;
        if (!frozenRef.current) {
            const fwd = (k['w'] ? 1 : 0) - (k['s'] ? 1 : 0);
            const str = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0);
            if (fwd || str) {
                const th = ang.current.theta;
                const dx = (-Math.sin(th) * fwd + Math.cos(th) * str) * 4 * dt;
                const dz = (-Math.cos(th) * fwd - Math.sin(th) * str) * 4 * dt;
                let [x, z] = resolveCollision(posRef.current.x + dx, posRef.current.z + dz, 0.5, wallsForState(6, false, false));
                const dw = f6DoorWalls();
                if (dw.length) [x, z] = resolveCollision(x, z, 0.5, dw);
                posRef.current.set(x, 0, z);
            }
        }
        camera.position.set(posRef.current.x, 1.6, posRef.current.z);
        camera.rotation.set(0, 0, 0);
        camera.lookAt(
            posRef.current.x - Math.sin(ang.current.theta) * Math.cos(ang.current.phi),
            1.6 - Math.sin(ang.current.phi),
            posRef.current.z - Math.cos(ang.current.theta) * Math.cos(ang.current.phi),
        );
    });
    return null;
};

const Dev: React.FC = () => {
    useEffect(() => {
        f6Reset();
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f6dbg = { f6, posRef };
    }, []);
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
            <Canvas camera={{ fov: 75, near: 0.1, far: 100, position: [0, 1.6, -8.6] }}>
                <DevWalker />
                <Floor6Suite playerPositionRef={posRef} />
            </Canvas>
            <Floor6Overlay playerPositionRef={posRef} onUiOpenChange={(o) => { frozenRef.current = o; }} onLeave={() => console.log('F6 LEAVE OK')} />
            <div style={{
                position: 'absolute', bottom: 8, left: 10, color: '#777', zIndex: 50,
                fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none',
            }}>WASD anda · arrasta pra olhar · E interage — floor6 dev</div>
        </div>
    );
};

createRoot(document.getElementById('root')!).render(<Dev />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
