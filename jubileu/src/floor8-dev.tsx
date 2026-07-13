/**
 * floor8-dev.tsx — RUNNER isolado do Andar 8 (sala de interrogatório + o
 * Arquivista). Monta a MESMA Floor8Room do jogo com um walker de dev (WASD +
 * arrastar pra olhar) rodando o mesmo resolve de colisão.
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor8.html
 */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import Floor8Room from './Floor8Room';
import Floor8Overlay from './Floor8Overlay';
import Floor8Image from './Floor8Image';
import Floor8Memory from './Floor8Memory';
import Floor8Cinematics from './Floor8Cinematics';
import Floor8Finale from './Floor8Finale';
import { f8, f8Reset, f8AdvanceLine, f8Bump, f8EnterImage } from './f8Arquivo';
import { wallsForState } from './constants';
import { resolveCollision } from './physics';

const posRef = { current: new Vector3(0, 0, -8.2) };
const frozenRef = { current: false };

const DevWalker: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const scene = useThree((s) => s.scene);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8scene = scene;
    const keys = useRef<Record<string, boolean>>({});
    const ang = useRef({ theta: Math.PI, phi: 0 });
    const drag = useRef<{ x: number; y: number } | null>(null);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8ang = ang;

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
                const [x, z] = resolveCollision(posRef.current.x + dx, posRef.current.z + dz, 0.5, wallsForState(8, false, false));
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
        f8Reset();
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8dbg = { f8, posRef, adv: f8AdvanceLine, bump: f8Bump, enterImage: f8EnterImage };
    }, []);
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
            <Canvas camera={{ fov: 75, near: 0.1, far: 100, position: [0, 1.6, -8.2] }}>
                <DevWalker />
                <Floor8Room playerPositionRef={posRef} />
                <Floor8Cinematics />
            </Canvas>
            <Floor8Overlay onUiOpenChange={(o) => { frozenRef.current = o; }} />
            <Floor8Image />
            <Floor8Memory />
            <Floor8Finale onLeave={() => f8Reset()} />
            <div style={{
                position: 'absolute', bottom: 8, left: 10, color: '#777', zIndex: 50,
                fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none',
            }}>WASD anda · arrasta pra olhar — floor8 dev</div>
        </div>
    );
};

createRoot(document.getElementById('root')!).render(<Dev />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
