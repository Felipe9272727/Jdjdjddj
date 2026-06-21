/** floor7-play.tsx — a PLAYABLE first-person harness for Andar 7 (open
 *  /floor7play.html). Mounts the real Floor7Environment + a first-person
 *  controller that walks the deck using the REAL collision walls
 *  (wallsForState(7)) and the same resolveCollision used by the game. Lets me
 *  (and the critic) actually play the ship offline — drive with WASD / arrow
 *  keys, or scripted via window.__setMove(f,s)/__setYaw(y). DEV-ONLY. */
import React, { useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Floor7Environment, useFloor7Handle } from './Floor7';
import { wallsForState, FLOOR7_SCALE } from './constants';
import { resolveCollision } from './physics';

const PR = 0.4, EYE = 1.55, SPEED = 3.4;

declare global {
    interface Window {
        __ready?: boolean;
        __setMove?: (f: number, s: number) => void;
        __setYaw?: (y: number) => void;
        __setPitch?: (p: number) => void;
        __teleport?: (x: number, z: number) => void;
        __playerPos?: () => [number, number, number];
    }
}

const Controller: React.FC<{ posRef: React.MutableRefObject<THREE.Vector3> }> = ({ posRef }) => {
    const { camera } = useThree();
    const yaw = useRef(0);            // 0 faces +z (toward the bow / captain)
    const pitch = useRef(0);
    const move = useRef({ f: 0, s: 0 });
    useEffect(() => {
        window.__setMove = (f, s) => { move.current = { f, s }; };
        window.__setYaw = (y) => { yaw.current = y; };
        window.__setPitch = (p) => { pitch.current = p; };
        window.__teleport = (x, z) => { posRef.current.set(x, 0, z); };
        window.__playerPos = () => [posRef.current.x, posRef.current.y, posRef.current.z];
        const keys: Record<string, number> = { w: 0, a: 0, s: 0, d: 0 };
        const upd = () => { move.current = { f: keys.w - keys.s, s: keys.d - keys.a }; };
        const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k in keys) { keys[k] = 1; upd(); } if (e.key === 'ArrowLeft') yaw.current += 0.1; if (e.key === 'ArrowRight') yaw.current -= 0.1; };
        const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k in keys) { keys[k] = 0; upd(); } };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        window.__ready = true;
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, [posRef]);
    useFrame((_, dt) => {
        const m = move.current, y = yaw.current;
        const fwd = new THREE.Vector3(Math.sin(y), 0, Math.cos(y));
        const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
        const d = new THREE.Vector3().addScaledVector(fwd, m.f).addScaledVector(right, m.s);
        // resolve EVERY frame (like the real Player) so a spawn inside a collider
        // would visibly pin the player here too — not just when moving
        let nx = posRef.current.x, nz = posRef.current.z;
        if (d.lengthSq() > 0) { d.normalize().multiplyScalar(SPEED * Math.min(dt, 0.05)); nx += d.x; nz += d.z; }
        const [rx, rz] = resolveCollision(nx, nz, PR, wallsForState(7, false, false));
        posRef.current.set(rx, 0, rz);
        camera.position.set(posRef.current.x, EYE, posRef.current.z);
        const p = pitch.current;
        camera.lookAt(posRef.current.x + Math.sin(y) * Math.cos(p), EYE + Math.sin(p), posRef.current.z + Math.cos(y) * Math.cos(p));
    });
    return null;
};

const Play: React.FC = () => {
    const handle = useFloor7Handle();
    const posRef = useRef(new THREE.Vector3(0, 0, 4.2 * FLOOR7_SCALE));
    // fast-forward the WASM brain past the intro so the elevator is gone and the
    // captain is in place (regardless of render fps), like the dev workbench.
    useEffect(() => {
        const iv = setInterval(() => {
            const b = handle.current.brain;
            if (!b) return;
            for (let i = 0; i < 400; i++) b.tick(0.05, 0, 0, 4.2, false);
            clearInterval(iv);
        }, 100);
        return () => clearInterval(iv);
    }, [handle]);
    return (
        <>
            <Floor7Environment playerPositionRef={posRef} handleRef={handle} />
            <Controller posRef={posRef} />
        </>
    );
};

createRoot(document.getElementById('root')!).render(
    <Canvas camera={{ fov: 72, position: [0, EYE, 4.2 * FLOOR7_SCALE], near: 0.05, far: 400 }} gl={{ antialias: true }}>
        <Play />
    </Canvas>,
);
