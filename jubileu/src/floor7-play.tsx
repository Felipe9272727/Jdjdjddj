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
        // dev probe: locate the rigged GLB captain (SkinnedMesh) — world pos, scale, bbox.
        (window as unknown as { __captain?: () => unknown }).__captain = () => {
            let r: unknown = 'no SkinnedMesh';
            scene.traverse((o: THREE.Object3D) => {
                if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
                    const m = o as THREE.SkinnedMesh;
                    const wp = new THREE.Vector3(); m.getWorldPosition(wp);
                    const ws = new THREE.Vector3(); m.getWorldScale(ws);
                    m.geometry.computeBoundingBox();
                    const bb = m.geometry.boundingBox!;
                    // world bbox (rest pose) projected to screen to measure the
                    // ACTUAL rendered height in pixels (removes scale guesswork)
                    const wbb = new THREE.Box3().setFromObject(m);
                    const top = new THREE.Vector3((wbb.min.x + wbb.max.x) / 2, wbb.max.y, (wbb.min.z + wbb.max.z) / 2).project(camera);
                    const bot = new THREE.Vector3((wbb.min.x + wbb.max.x) / 2, wbb.min.y, (wbb.min.z + wbb.max.z) / 2).project(camera);
                    // bone world positions — reliable (getWorldPosition), unlike
                    // setFromObject which lies for SkinnedMeshes. Tells us where the
                    // skeleton actually IS vs where the geometry bbox claims.
                    const bones = (m.skeleton?.bones ?? []).map((bn) => {
                        const p = new THREE.Vector3(); bn.getWorldPosition(p);
                        return { name: bn.name, w: p.toArray().map(n => +n.toFixed(2)) };
                    });
                    // ACTUAL skinned silhouette: run the real bone transform on a
                    // sample of vertices (setFromObject ignores skinning and lies).
                    // This tells us if the skinned mesh is upright, collapsed, or
                    // exploded — the real "is the animation bugged" signal.
                    const posAttr = m.geometry.attributes.position;
                    const tmp = new THREE.Vector3();
                    const skMin = new THREE.Vector3(Infinity, Infinity, Infinity);
                    const skMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
                    const applyBone = (m as unknown as { applyBoneTransform?: (i:number,t:THREE.Vector3)=>THREE.Vector3; boneTransform?: (i:number,t:THREE.Vector3)=>THREE.Vector3 });
                    const fn = applyBone.applyBoneTransform ? applyBone.applyBoneTransform.bind(m) : (applyBone.boneTransform ? applyBone.boneTransform.bind(m) : null);
                    let nan = 0;
                    if (fn) {
                        const N = posAttr.count, step = Math.max(1, Math.floor(N / 400));
                        for (let i = 0; i < N; i += step) {
                            tmp.fromBufferAttribute(posAttr, i);
                            fn(i, tmp);          // local -> skinned (still mesh-local)
                            m.localToWorld(tmp); // -> world
                            if (Number.isNaN(tmp.x)) { nan++; continue; }
                            skMin.min(tmp); skMax.max(tmp);
                        }
                    }
                    const skinnedBox = fn ? {
                        min: skMin.toArray().map(n => +n.toFixed(2)), max: skMax.toArray().map(n => +n.toFixed(2)),
                        size: [skMax.x - skMin.x, skMax.y - skMin.y, skMax.z - skMin.z].map(n => +n.toFixed(2)), nan,
                    } : 'no boneTransform fn';
                    // walk ancestors and report each .visible — a hidden parent
                    // group (e.g. the elevFade gate) would draw nothing while the
                    // mesh + bones still have valid world transforms.
                    const ancestorVis = (() => { const v:string[]=[]; let o2:THREE.Object3D|null=m; let d=0; while(o2&&d<7){v.push(`${o2.type}:${o2.visible}`);o2=o2.parent;d++;} return v; })();
                    r = { worldPos: wp.toArray().map(n => +n.toFixed(2)), worldScale: ws.toArray().map(n => +n.toFixed(2)), visible: m.visible, ancestorVis, skinnedBox,
                        parentChain: (() => { const names:string[]=[]; let o2:THREE.Object3D|null=m; let d=0; while(o2&&d<8){names.push(`${o2.type}@(${o2.position.x.toFixed(1)},${o2.position.y.toFixed(1)},${o2.position.z.toFixed(1)})s${o2.scale.x.toFixed(2)}`);o2=o2.parent;d++;} return names; })(),
                        bones,
                        worldBox: { minY: +wbb.min.y.toFixed(2), maxY: +wbb.max.y.toFixed(2), height: +(wbb.max.y - wbb.min.y).toFixed(2) },
                        screenHpx: Math.round(Math.abs(top.y - bot.y) / 2 * 900) };
                }
            });
            return r;
        };
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
        // dev probe: world bbox of the captain (primitive parts) — frames the portrait cam.
        (window as unknown as { __capBox?: () => unknown }).__capBox = () => {
            let r: unknown = 'none';
            scene.traverse((o: THREE.Object3D) => {
                if (o.name === 'captainRoot') {
                    const bb = new THREE.Box3().setFromObject(o);
                    const c = new THREE.Vector3(); bb.getCenter(c);
                    r = { min: bb.min.toArray().map(n => +n.toFixed(2)), max: bb.max.toArray().map(n => +n.toFixed(2)), center: c.toArray().map(n => +n.toFixed(2)) };
                }
            });
            return r;
        };
        // dev: isolate the captain — hide every mesh that isn't under captainRoot,
        // and drop in a plain bg, so the portrait cam sees ONLY the captain.
        (window as unknown as { __soloCaptain?: () => unknown }).__soloCaptain = () => {
            let capRoot: THREE.Object3D | null = null;
            scene.traverse(o => { if (o.name === 'captainRoot') capRoot = o; });
            if (!capRoot) return 'no captain';
            const under = new Set<THREE.Object3D>();
            (capRoot as THREE.Object3D).traverse(o => under.add(o));
            let o2: THREE.Object3D | null = capRoot; while (o2) { under.add(o2); o2 = o2.parent; }
            scene.traverse(o => { if ((o as THREE.Mesh).isMesh || o.type === 'Points') o.visible = under.has(o); });
            scene.background = new THREE.Color(0x6a7886);
            const wp = new THREE.Vector3(); (capRoot as THREE.Object3D).getWorldPosition(wp);
            return wp.toArray().map(n => +n.toFixed(2));
        };
        (window as unknown as { __capInspect?: () => unknown }).__capInspect = () => {
            let root: THREE.Object3D | null = null;
            scene.traverse(o => { if (o.name === 'captainRoot') root = o; });
            if (!root) return 'no captainRoot';
            let mesh = 0, vis = 0; const colors: Record<string, number> = {};
            (root as THREE.Object3D).traverse(o => {
                if ((o as THREE.Mesh).isMesh) { mesh++; if (o.visible && (o.parent?.visible ?? true)) vis++;
                    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; const h = m?.color ? m.color.getHexString() : '?'; colors[h] = (colors[h] || 0) + 1; }
            });
            const wp = new THREE.Vector3(); (root as THREE.Object3D).getWorldPosition(wp);
            const sp = wp.clone(); sp.y += 2; sp.project(camera);
            return { rootVisible: (root as THREE.Object3D).visible, meshCount: mesh, visMeshes: vis,
                worldPos: wp.toArray().map(n => +n.toFixed(2)), screenXY: [+sp.x.toFixed(2), +sp.y.toFixed(2), +sp.z.toFixed(2)],
                topColors: Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 6) };
        };
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
        // reset the brain back to the INTRO so the captain re-plays his entry
        // STRIDE (capWalk=1) — lets us screenshot the walk cycle, which the
        // 400-tick fast-forward otherwise skips past.
        (window as unknown as { __resetBrain?: () => void }).__resetBrain = () => { handle.current.brain?.reset(); };
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
