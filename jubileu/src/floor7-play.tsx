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
        __interact?: (v: boolean) => void;
        __forceTick?: (n: number, lx: number, lz: number, it: boolean) => void;
        __state?: () => { state: number; cleaned: number; npud: number; tideWarn?: number };
        __puddles?: () => { x: number; z: number }[];
        __playerPos?: () => [number, number, number];
    }
}

const Controller: React.FC<{ posRef: React.MutableRefObject<THREE.Vector3> }> = ({ posRef }) => {
    const { camera, scene } = useThree();
    const yaw = useRef(0);            // 0 faces +z (toward the bow / captain)
    const pitch = useRef(0);
    const move = useRef({ f: 0, s: 0 });
    const camO = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null);
    useEffect(() => {
        // dev probe: dump meshes near the camera with their material colors,
        // to hunt down a stray-colored prop the critic flagged in FP frames.
        (window as unknown as { __dumpNear?: () => unknown }).__dumpNear = () => {
            const out: unknown[] = [];
            const wp = new THREE.Vector3();
            scene.traverse((o: THREE.Object3D) => {
                const mesh = o as THREE.Mesh;
                if (!(mesh.isMesh || mesh.type === 'Points')) return;
                o.getWorldPosition(wp);
                const dist = wp.distanceTo(camera.position);
                const m = mesh.material as THREE.MeshStandardMaterial | undefined;
                out.push({
                    name: o.name || o.type, dist: +dist.toFixed(2),
                    hex: m && m.color ? '#' + m.color.getHexString() : null,
                    emissive: m && m.emissive ? '#' + m.emissive.getHexString() : null,
                    map: !!(m && m.map), geo: (mesh.geometry && mesh.geometry.type) || null,
                    local: o.position.toArray().map((n) => +n.toFixed(3)),
                });
            });
            return out.sort((a, b) => (a as { dist: number }).dist - (b as { dist: number }).dist).slice(0, 16);
        };
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
        // DEV portrait hook: detach the camera from the player and orbit it freely
        // (the brain-player stays frozen wherever __teleport put it, so the captain
        // keeps facing that spot) — lets the model critic see him from any angle.
        (window as unknown as { __cam?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void }).__cam =
            (px, py, pz, tx, ty, tz) => { camO.current = { p: new THREE.Vector3(px, py, pz), t: new THREE.Vector3(tx, ty, tz) }; };
        (window as unknown as { __camOff?: () => void }).__camOff = () => { camO.current = null; };
        window.__ready = true;
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, [posRef]);
    useFrame((_, dt) => {
        // portrait-orbit override: place the camera directly, leave the player frozen
        if (camO.current) { camera.position.copy(camO.current.p); camera.lookAt(camO.current.t); return; }
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
    useEffect(() => {
        window.__interact = (v: boolean) => { handle.current.interact = v; };
        // deterministic brain advance for offline verification (RAF throttles in
        // headless waits) — tick the WASM brain n times with the player at a given
        // ship-local spot; mirrors exactly what the frame loop feeds it.
        window.__forceTick = (n: number, lx: number, lz: number, it: boolean) => {
            const b = handle.current.brain; if (!b) return;
            for (let i = 0; i < n; i++) b.tick(0.05, lx, 0, lz, it);
        };
        window.__state = () => ({ state: handle.current.state, cleaned: handle.current.cleaned, npud: handle.current.npud, tideWarn: handle.current.tideWarn });
        window.__puddles = () => {
            const b = handle.current.brain; if (!b) return [];
            const out: { x: number; z: number }[] = [];
            const tmp = { x: 0, z: 0, r: 0, prog: 0 };
            for (let i = 0; i < b.npud; i++) { const p = b.puddle(i, tmp); out.push({ x: p.x, z: p.z }); }
            return out;
        };
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
