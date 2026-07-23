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
import { Floor9Elevator } from './Floor9Elevator';
import Floor9Overlay from './Floor9Overlay';
import Floor9Cutscene from './Floor9Cutscene';
import { Fiapo } from './Floor9Fauna';
import { f9, f9Reset, f9QuedaDone, f9ChegadaDone, f9Subscribe, F9_HOME_SPAWN, f9TriggerWake } from './f9Floresta';
import { f9eco, f9EcoReset, f9EcoBump, f9RequestPounce } from './f9Eco';
import { configureFloor9Sfx, clearFloor9Sfx } from './floor9Sfx';
import { wallsForState } from './constants';
import { resolveCollision } from './physics';

const posRef = { current: new Vector3(0, 0, -1.5) };
const frozenRef = { current: false };

/**
 * PERF PROBE do bench (P0 mobile): expõe window.__f9perf() (draw calls/tris do
 * ÚLTIMO frame renderizado, lidos do renderer.info) e window.__f9deltas()
 * (tempos entre frames: avg/p95 dos últimos ~240) pro playwright medir por
 * quality — alvo: draws ≤ ~80 no tier mobile e sem travamento com CPU 4×.
 */
const PerfProbe: React.FC = () => {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    useEffect(() => {
        const w = window as unknown as Record<string, unknown>;
        w.__f9r3f = { gl, scene, camera }; // probe de draws por objeto (bench)
        w.__f9perf = () => ({
            calls: gl.info.render.calls,
            tris: gl.info.render.triangles,
            programs: gl.info.programs ? gl.info.programs.length : 0,
            geoms: gl.info.memory.geometries,
        });
        let last = performance.now();
        const deltas: number[] = [];
        let raf = 0;
        const loop = (now: number) => {
            deltas.push(now - last);
            last = now;
            if (deltas.length > 240) deltas.shift();
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        w.__f9deltas = (reset?: boolean) => {
            const sorted = [...deltas].sort((a, b) => a - b);
            const n = Math.max(1, deltas.length);
            const out = {
                n: deltas.length,
                avg: deltas.reduce((s, d) => s + d, 0) / n,
                p50: sorted[Math.floor((n - 1) * 0.5)] ?? 0,
                p95: sorted[Math.floor((n - 1) * 0.95)] ?? 0,
                worst: sorted[n - 1] ?? 0,
            };
            if (reset) deltas.length = 0;
            return out;
        };
        return () => cancelAnimationFrame(raf);
    }, [gl, scene, camera]);
    return null;
};

const DevWalker: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const keys = useRef<Record<string, boolean>>({});
    const ang = useRef({ theta: Math.PI, phi: 0 });
    const drag = useRef<{ x: number; y: number } | null>(null);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f9ang = ang;

    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = true;
            if (e.key === ' ' && f9.phase === 'explorar') f9RequestPounce(); // M20: o BOTE
        };
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
            // V4: carregando oferenda = PESADO (speed ×0.55 — o motor escuta)
            const carryK = f9eco.offerings.some((o) => o.state === 'carregada') ? 0.55 : 1;
            const sp = (k['shift'] ? 9 : 4.5) * carryK;
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
            pounce: f9RequestPounce,     // M20: dispara o bote (QA headless)
            wakeAnim: f9TriggerWake,     // M21: dispara a animação de despertar (QA)
            warpCycle: (frac: number) => { f9eco.cycleT = f9eco.cycleLen * frac; },
            // V4: warps do objetivo (o visual deve ler mesmo com o motor do A2 no meio)
            warpToOffering: (i: number) => {
                const o = f9eco.offerings[i];
                if (o) posRef.current.set(o.x + 1.5, 0, o.z + 1.5);
            },
            setRootWake: (n: number) => {
                f9eco.rootWake = Math.max(0, Math.min(3, Math.round(n)));
                f9eco.rootState = f9eco.rootWake >= 3 ? 'desabrochada' : 'dormente';
                f9EcoBump();
            },
            desabrochar: () => {
                f9eco.rootWake = 3; f9eco.rootState = 'desabrochada'; f9EcoBump();
            },
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
        // M20/M21: respawn no SPAWN FIXO (a toca-casa) + animação de despertar
        if (f9.phase === 'explorar' && prevPhase.current === 'apagando') {
            posRef.current.set(F9_HOME_SPAWN[0], 0, F9_HOME_SPAWN[1]);
            f9TriggerWake();
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
                <PerfProbe />
                <DevWalker />
                <Floor9Forest playerPositionRef={posRef} />
                <Floor9Elevator />
                <Fiapo playerPositionRef={posRef} cameraThetaRef={thetaAdapter} />
                <Floor9Cutscene />
            </Canvas>
            <Floor9Overlay onUiOpenChange={(o) => { frozenRef.current = o; }} playerPositionRef={posRef} cameraThetaRef={thetaAdapter} />
            <div style={{
                position: 'absolute', bottom: 8, left: 10, color: '#777', zIndex: 50,
                fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none',
            }}>WASD anda (shift corre) · arrasta pra olhar — floor9 dev</div>
        </div>
    );
};

createRoot(document.getElementById('root')!).render(<Dev />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
