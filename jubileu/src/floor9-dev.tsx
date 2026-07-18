/**
 * floor9-dev.tsx — RUNNER isolado do Andar 9 (O Viveiro). Monta a MESMA
 * Floor9Forest do jogo com um walker de dev (WASD + arrastar pra olhar).
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor9.html
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import Floor9Forest from './Floor9Forest';
import Floor9Overlay from './Floor9Overlay';
import Floor9Cutscene from './Floor9Cutscene';
import { Fiapo } from './Floor9Fauna';
import { f9, f9Reset, f9QuedaDone, f9ChegadaDone, f9Subscribe, F9_OCOS } from './f9Floresta';
import { f9eco, f9EcoReset } from './f9Eco';
import { configureFloor9Sfx, clearFloor9Sfx } from './floor9Sfx';
import { wallsForState } from './constants';
import { resolveCollision } from './physics';

const posRef = { current: new Vector3(0, 0, -1.5) };
const frozenRef = { current: false };

const DevWalker: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const keys = useRef<Record<string, boolean>>({});
    const ang = useRef({ theta: Math.PI, phi: 0 });
    const drag = useRef<{ x: number; y: number } | null>(null);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f9ang = ang;

    useEffect(() => {
        const kd = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
        const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
        const pd = (e: PointerEvent) => { if (!frozenRef.current) drag.current = { x: e.clientX, y: e.clientY }; };
        const pm = (e: PointerEvent) => {
            if (frozenRef.current || !drag.current) { drag.current = null; return; }
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
        if (f9.phase === 'queda') return;             // a cutscene é a dona da câmera
        const k = keys.current;
        if (!frozenRef.current) {
            const fwd = (k['w'] ? 1 : 0) - (k['s'] ? 1 : 0);
            const str = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0);
            const sp = k['shift'] ? 9 : 4.5;
            if (fwd || str) {
                const th = ang.current.theta;
                const dx = (-Math.sin(th) * fwd + Math.cos(th) * str) * sp * dt;
                const dz = (-Math.cos(th) * fwd - Math.sin(th) * str) * sp * dt;
                const [x, z] = resolveCollision(posRef.current.x + dx, posRef.current.z + dz, 0.5, wallsForState(9, false, false));
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
    const [, setV] = useState(0);
    useEffect(() => {
        f9Reset(); f9EcoReset();
        // o bench é ferramenta de debug: expõe o handle SEMPRE (não só em dev
        // mode — um `vite build` do bench pra smoke headless continua dirigível)
        (window as unknown as Record<string, unknown>).__f9dbg = {
            f9, f9eco, posRef,
            skipQueda: () => { f9QuedaDone(); f9ChegadaDone(); },
            wake: f9QuedaDone, chegou: f9ChegadaDone,
            warpCycle: (frac: number) => { f9eco.cycleT = f9eco.cycleLen * frac; },
        };
    }, []);
    // o SOM do Viveiro no bench: AudioContext precisa de gesto — liga no
    // primeiro clique/tecla (no jogo, o wiring no App.tsx é do Coder C)
    useEffect(() => {
        let ac: AudioContext | null = null;
        const boot = () => {
            if (ac) return;
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return;
            ac = new AC();
            void ac.resume();
            configureFloor9Sfx(ac);
        };
        window.addEventListener('pointerdown', boot);
        window.addEventListener('keydown', boot);
        return () => {
            window.removeEventListener('pointerdown', boot);
            window.removeEventListener('keydown', boot);
            clearFloor9Sfx();
            if (ac) void ac.close();
        };
    }, []);
    useEffect(() => f9Subscribe(() => setV((x) => x + 1)), []);
    // replantio no bench: acorda na boca do oco mais próximo
    const prevPhase = useRef(f9.phase);
    useEffect(() => f9Subscribe(() => {
        if (f9.phase === 'explorar' && prevPhase.current === 'apagando') {
            let best = F9_OCOS[0], bd = Infinity;
            for (const o of F9_OCOS) {
                const d = (posRef.current.x - o[0]) ** 2 + (posRef.current.z - o[1]) ** 2;
                if (d < bd) { bd = d; best = o; }
            }
            posRef.current.set(best[0], 0, best[1] + best[2] + 0.7);
        }
        prevPhase.current = f9.phase;
    }), []);
    // o Fiapo orbita pelo theta do walker (adapter pro ref de ângulo do dev)
    const thetaAdapter = useMemo(() => ({
        get current(): number {
            const a = (window as unknown as { __f9ang?: { current: { theta: number } } }).__f9ang;
            return a ? a.current.theta : Math.PI;
        },
        set current(_v: number) { /* dev: só leitura */ },
    }) as React.MutableRefObject<number>, []);
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
            <Canvas camera={{ fov: 74, near: 0.1, far: 130, position: [0, 1.6, -1.5] }}>
                <DevWalker />
                <Floor9Forest playerPositionRef={posRef} />
                <Fiapo playerPositionRef={posRef} cameraThetaRef={thetaAdapter} />
                <Floor9Cutscene />
            </Canvas>
            <Floor9Overlay onUiOpenChange={(o) => { frozenRef.current = o; }} playerPositionRef={posRef} />
            <div style={{
                position: 'absolute', bottom: 8, left: 10, color: '#777', zIndex: 50,
                fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none',
            }}>WASD anda (shift corre) · arrasta pra olhar — floor9 dev</div>
        </div>
    );
};

createRoot(document.getElementById('root')!).render(<Dev />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
