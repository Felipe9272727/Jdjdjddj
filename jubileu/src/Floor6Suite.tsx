/**
 * Floor6Suite.tsx — a SUÍTE 612, the escape room of "O Hóspede que Sabia
 * Demais". Runs in the MAIN canvas (first person, Player.tsx controls).
 *
 * The realism pass: 512px painted textures with BUMP + ROUGHNESS maps, a
 * PMREM RoomEnvironment so porcelain/chrome/brass actually reflect, baked
 * contact shadows under every piece of furniture, crown molding + baseboards
 * + architraves so walls meet floors like buildings do, and practicals with
 * visible sources (abajur, plafons, sconces, the TV tube, the stove ring).
 *
 * The director (useFrame) advances f6Escape's clock and DRAINS the event
 * queue into the fx stamp map — every prop component eases toward the state
 * machine and plays its one-shot beats off those stamps. Picked-up items
 * physically fly into the camera; installed parts fly from the camera into
 * their sockets in the dead cab.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityProfile } from './Settings';
import { f6, f6Tick, f6DrainEvents, F6_CEIL } from './f6Escape';
import { Floor6Guest } from './Floor6Guest';
import {
    F6M, PBR, hdrUrl, wallAoTex, tileTex, tileBump, tileRough, plate612Tex, puffTex, paintingTex,
} from './Floor6Textures';
import {
    type F6Fx, B, GroundBlob, ItemMesh, F6_ITEM_SOURCE, F6_INSTALL_TARGET,
    Bed, Nightstand, Wardrobe, Desk, DrawerAbridor, TvSet, CrookedPainting,
    Window612, Suitcase, Sconce, SmokeDetector, SittingArea,
} from './Floor6Props';
import { DoorFrame, BathDoor, KitchenDoor, Bathroom, Kitchen } from './Floor6Wet';
import { DeadCab } from './Floor6Cab';
import {
    startF6RoomTone, stopF6RoomTone, playF6Spark, playF6Clank, playF6Unlock,
    playF6Chain, playF6Ding, startF6Tap, stopF6Tap, playF6Breath, playF6Static,
    playF6Creak, playF6Drawer, playF6Paper, playF6Groan, playF6Match,
    playF6Sizzle, playF6Pickup, startF6Flame, stopF6Flame,
    playF6MemoryPulse, playF6MemorySting,
} from './floor6Sfx';

// ── per-face wall finish ──────────────────────────────────────────────────────
/** UVs scaled to REAL wall size so a stripe is a stripe and a tile is 32cm on
 *  every wall. Clones carry the matching bump (and roughness for tile). */
type WallFinish = 'paper' | 'tile' | 'shaft';
const finishCache = new Map<string, THREE.MeshStandardMaterial>();
function wallFaceMat(kind: WallFinish, len: number, h: number): THREE.MeshStandardMaterial {
    const key = `${kind}:${len.toFixed(2)}:${h.toFixed(2)}`;
    let m = finishCache.get(key);
    if (!m) {
        // paper: photo PBR (decrepit wallpaper), ONE wall-height per tile so
        // the peeling pattern reads at architectural scale; tile: the painted
        // 32cm porcelain (the 1k photo tile turns to mush at this distance);
        // shaft: dark elevator shaft interior (matte, no texture).
        if (kind === 'paper') {
            m = new THREE.MeshStandardMaterial({
                ...PBR.wallpaper(len / 2.8, 1.04), roughness: 1,
                aoMap: wallAoTex, aoMapIntensity: 1,
            });
        } else if (kind === 'tile') {
            const map = tileTex.clone(); map.needsUpdate = true;
            const bump = tileBump.clone(); bump.needsUpdate = true;
            const rough = tileRough.clone(); rough.needsUpdate = true;
            map.repeat.set(len / 1.28, h / 1.28);
            bump.repeat.set(len / 1.28, h / 1.28);
            rough.repeat.set(len / 1.28, h / 1.28);
            m = new THREE.MeshStandardMaterial({
                map, bumpMap: bump, bumpScale: 0.15, roughnessMap: rough,
                aoMap: wallAoTex, aoMapIntensity: 0.8, envMapIntensity: 0.7,
            });
        } else {
            // shaft: dark matte surface of elevator shaft
            m = new THREE.MeshStandardMaterial({
                color: '#1a1f24', roughness: 0.9, metalness: 0, envMapIntensity: 0.1,
            });
        }
        finishCache.set(key, m);
    }
    return m;
}
const wallEdgeMat = new THREE.MeshStandardMaterial({ color: '#6e6354', roughness: 0.9 });

/** A wall slab along a collision segment (x1,z1)→(x2,z2) — with its OWN
 *  finish per side (a = local +X face, b = local −X face), so the bedroom
 *  side of the bathroom partition is wallpaper, not tile. */
const Wall: React.FC<{
    seg: [number, number, number, number];
    a?: WallFinish; b?: WallFinish;
    h?: number; y?: number; th?: number;
}> = ({ seg, a = 'paper', b = 'paper', h = F6_CEIL, y = 0, th = 0.22 }) => {
    const [x1, z1, x2, z2] = seg;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(x2 - x1, z2 - z1);
    const mats = useMemo<THREE.Material[]>(() => [
        wallFaceMat(a, len, h),     // +x
        wallFaceMat(b, len, h),     // −x
        wallEdgeMat, wallEdgeMat, wallEdgeMat, wallEdgeMat,
    ], [a, b, len, h]);
    return (
        <mesh position={[(x1 + x2) / 2, y + h / 2, (z1 + z2) / 2]} rotation={[0, ang, 0]} material={mats}>
            <boxGeometry args={[th, h, len]} />
        </mesh>
    );
};

/** The room's baseboards + crown molding share one material (woodDk) and never
 *  move, so all 32 little boxes (8 walls × 2 baseboard + 2 crown profiles) are
 *  baked into ONE merged geometry = 1 draw call instead of 32. Geometry matches
 *  the old <Baseboard>/<Crown> output exactly (same per-segment transform). */
const TRIM_SEGS: [number, number, number, number][] = [
    [-7.87, -10, -7.87, 7], [-8, 6.87, 1.5, 6.87], [1.37, -4.8, 1.37, 2.3], [1.37, 3.7, 1.37, 7],
    [-8, -9.87, -1.3, -9.87], [1.63, -3, 1.63, 2.3], [1.5, 6.87, 6, 6.87], [5.87, -3, 5.87, 7],
];
const MergedTrim: React.FC = () => {
    const geo = useMemo(() => {
        const parts: THREE.BufferGeometry[] = [];
        const m = new THREE.Matrix4(), r = new THREE.Matrix4(), tl = new THREE.Matrix4();
        const addBox = (w: number, h: number, d: number, gx: number, gy: number, gz: number, ang: number, lx: number, ly: number, lz: number) => {
            const g = new THREE.BoxGeometry(w, h, d);
            r.makeRotationY(ang);
            m.makeTranslation(gx, gy, gz).multiply(r).multiply(tl.makeTranslation(lx, ly, lz)); // T(group)·R·T(local)
            g.applyMatrix4(m);
            parts.push(g);
        };
        for (const [x1, z1, x2, z2] of TRIM_SEGS) {
            const len = Math.hypot(x2 - x1, z2 - z1);
            const ang = Math.atan2(x2 - x1, z2 - z1);
            const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
            addBox(0.26, 0.14, len, mx, 0, mz, ang, 0, 0.07, 0);        // baseboard
            addBox(0.3, 0.03, len, mx, 0, mz, ang, 0, 0.145, 0);
            addBox(0.3, 0.1, len, mx, F6_CEIL, mz, ang, 0, -0.05, 0);   // crown
            addBox(0.24, 0.06, len, mx, F6_CEIL, mz, ang, 0, -0.13, 0);
        }
        const merged = mergeGeometries(parts, false);
        parts.forEach((p) => p.dispose());
        return merged;
    }, []);
    useEffect(() => () => { geo?.dispose(); }, [geo]);
    if (!geo) return null;
    return <mesh geometry={geo} material={F6M.woodDk} />;
};

/** Ceiling fixture: plafon + glass dome with a real glow. */
const CeilLamp: React.FC<{ x: number; z: number; on?: boolean; cool?: boolean }> = ({ x, z, on = true, cool }) => (
    <group position={[x, F6_CEIL, z]}>
        <mesh position={[0, -0.025, 0]} material={F6M.brassOld}>
            <cylinderGeometry args={[0.26, 0.31, 0.05, 18]} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            <meshStandardMaterial
                color={on ? '#fff4da' : '#6e6a62'}
                emissive={cool ? '#dff0f4' : '#ffe7b0'}
                emissiveIntensity={on ? 1.7 : 0}
                roughness={0.3}
            />
        </mesh>
    </group>
);

/** A few dust motes drifting through the practicals' light. */
const DustMotes: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    const seeds = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        x: -7 + (i * 2.31) % 8, z: -8 + (i * 3.07) % 14, y: 0.6 + (i * 0.83) % 1.8, ph: i * 1.7,
    })), []);
    useFrame(({ clock, camera }) => {
        if (!g.current) return;
        const t = clock.elapsedTime;
        g.current.children.forEach((c, i) => {
            const s = seeds[i];
            c.position.set(
                s.x + Math.sin(t * 0.11 + s.ph) * 0.5,
                s.y + Math.sin(t * 0.07 + s.ph * 2.1) * 0.3,
                s.z + Math.cos(t * 0.09 + s.ph) * 0.5,
            );
            c.quaternion.copy(camera.quaternion);
        });
    });
    return (
        <group ref={g}>
            {seeds.map((_, i) => (
                <mesh key={i} scale={0.035}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={puffTex} color="#fff2d8" transparent opacity={0.16}
                        depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

// ── pickup / install flights ─────────────────────────────────────────────────
interface Flight {
    id: number; kind: string;
    from: [number, number, number] | null;       // null = from the camera (install)
    to: [number, number, number] | null;         // null = to the camera (pickup)
    t0: number; delay: number;
}
let flightId = 0;

const FLIGHT_DUR = 0.62;
const FlightLayer: React.FC<{ flights: Flight[]; onDone: (id: number) => void }> =
    ({ flights, onDone }) => {
        const refs = useRef(new Map<number, THREE.Group>());
        const v0 = useRef(new THREE.Vector3());
        const v1 = useRef(new THREE.Vector3());
        const fwd = useRef(new THREE.Vector3());
        useFrame(({ clock, camera }) => {
            const now = clock.elapsedTime;
            for (const f of flights) {
                const g = refs.current.get(f.id);
                if (!g) continue;
                const u = (now - f.t0 - f.delay) / FLIGHT_DUR;
                if (u < 0) { g.visible = false; continue; }
                if (u >= 1) { g.visible = false; onDone(f.id); continue; }
                g.visible = true;
                camera.getWorldDirection(fwd.current);
                // camera anchor sits just under the player's nose
                const camP = v0.current.copy(camera.position)
                    .addScaledVector(fwd.current, 0.55);
                camP.y -= 0.12;
                const e = u * u * (3 - 2 * u);   // smoothstep
                if (f.from) {
                    // pickup: source → camera, with a small upward arc + shrink
                    g.position.lerpVectors(v1.current.set(...f.from), camP, e);
                    g.position.y += Math.sin(e * Math.PI) * 0.28;
                    g.scale.setScalar(1 - e * 0.55);
                } else if (f.to) {
                    // install: camera → socket, growing into place
                    g.position.lerpVectors(camP, v1.current.set(...f.to), e);
                    g.position.y += Math.sin(e * Math.PI) * 0.12;
                    g.scale.setScalar(0.5 + e * 0.5);
                }
                g.rotation.y = e * 5;
            }
        });
        return (
            <group>
                {flights.map((f) => (
                    <group key={f.id} visible={false}
                        ref={(g) => { if (g) refs.current.set(f.id, g); else refs.current.delete(f.id); }}>
                        <ItemMesh kind={f.kind} />
                    </group>
                ))}
            </group>
        );
    };

// ── the suite ─────────────────────────────────────────────────────────────────
export const Floor6Suite: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3>; profile?: QualityProfile }> = ({ playerPositionRef, profile }) => {
    // "lite" = medium/low quality (atmosphere is high-only). Floor 6 used to
    // ignore quality entirely and always render the full HDRI env + every light,
    // which is what made it lag on phones. Lite drops the per-fragment env-map
    // cost (compensated by a brighter hemisphere) and trims the light count.
    const lite = profile ? !profile.atmosphere : false;   // medium + low
    const lowTier = profile ? !profile.overlay : false;    // low only (max-performance)
    const fx = useMemo<F6Fx>(() => ({ t: {} }), []);
    const bathFlicker = useRef(0);
    const bathLight = useRef<THREE.PointLight>(null!);
    const bedLight = useRef<THREE.PointLight>(null!);
    const tvLight = useRef<THREE.PointLight>(null!);
    const tapLoop = useRef(false);
    const breathTimer = useRef(0);
    // Pending pickup-sfx timers — tracked so they don't fire after the player
    // leaves Floor 6 (post-unmount callback into a torn-down audio graph).
    const pickupTimers = useRef<Set<number>>(new Set());
    const [flights, setFlights] = useState<Flight[]>([]);
    const [, force] = React.useReducer((v: number) => v + 1, 0);
    const versionSeen = useRef(f6.version);

    // Phase-based lighting: guest2 dimming target, memory pulse stamp, free recovery
    const guest2DimTarget = useRef(0);      // 0..1 multiplier for bedLight during guest2
    const memoryPulseTriggered = useRef(false);  // edge-detect for guestLine===5
    const lightRecoveryStart = useRef(0);   // timestamp when entering 'free' phase
    const memoryPulseStart = useRef(0);    // timestamp of memory pulse light effect

    const { gl, scene } = useThree();

    // REAL HDRI environment (PolyHaven "hotel_room", bundled) — true image-
    // based lighting and reflections. Intensity LOW: it's there for realism,
    // not to light the room (the practicals own the mood).
    useEffect(() => {
        // Image-based lighting is the single biggest GPU cost here (the PMREM
        // env sample on every PBR fragment ~doubles the frame cost). It's kept
        // on high+medium because it carries the room's ambient fill and looks
        // great. Only the LOW tier — an explicit "max performance" choice —
        // drops it; the brighter hemisphere below stands in for the fill.
        if (lowTier) return;
        let disposed = false;
        let envRT: THREE.WebGLRenderTarget | null = null;
        const pmrem = new THREE.PMREMGenerator(gl);
        new RGBELoader().load(hdrUrl, (tex) => {
            if (disposed) { tex.dispose(); pmrem.dispose(); return; }
            envRT = pmrem.fromEquirectangular(tex);
            tex.dispose(); pmrem.dispose();
            scene.environment = envRT.texture;
            scene.environmentIntensity = 0.36;
        });
        return () => {
            disposed = true;
            scene.environment = null; scene.environmentIntensity = 1;
            envRT?.dispose();
        };
    }, [gl, scene, lowTier]);

    useEffect(() => {
        startF6RoomTone();
        if (f6.stoveLit) startF6Flame();
        return () => {
            stopF6RoomTone(); stopF6Tap(); stopF6Flame();
            pickupTimers.current.forEach(clearTimeout);
            pickupTimers.current.clear();
        };
    }, []);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        f6Tick(dt, playerPositionRef.current.z, playerPositionRef.current.x);

        // re-render on state version changes (door targets, item visibility, …)
        if (f6.version !== versionSeen.current) { versionSeen.current = f6.version; force(); }

        // drain the event queue → fx stamps + sound + flights
        const drained = f6DrainEvents();
        for (const ev of drained) {
            fx.t[ev] = now;
            if (ev === 'bang') playF6Spark(1);
            else if (ev === 'unlock') { playF6Unlock(); bathFlicker.current = 1.3; }
            else if (ev === 'chain') playF6Chain();
            else if (ev === 'repaired') { playF6Ding(); }
            else if (ev === 'guestAppear') playF6Breath();
            else if (ev === 'melted') { playF6Clank(0.5); }
            else if (ev === 'quadro') playF6Creak(0.55);
            else if (ev === 'drawer') playF6Drawer();
            else if (ev === 'tug') playF6Drawer();
            else if (ev === 'cut') playF6Paper();
            else if (ev === 'wardrobe') playF6Creak();
            else if (ev === 'tvflip') playF6Static();
            else if (ev === 'lid') playF6Groan(0.35);
            else if (ev === 'curtain') playF6Creak(0.45);
            else if (ev === 'fridge') playF6Creak(0.6);
            else if (ev === 'match') { playF6Match(); startF6Flame(); }
            else if (ev === 'placeIce') playF6Sizzle();
            else if (ev === 'despensa') playF6Creak();
            else if (ev === 'fish') playF6Clank(0.3);
            else if (ev === 'guestAside') { playF6MemorySting(); }
            else if (ev.startsWith('install:')) {
                playF6Clank();
                const kind = ev.slice(8);
                const to = F6_INSTALL_TARGET[kind];
                if (to) setFlights((fl) => [...fl, { id: ++flightId, kind, from: null, to, t0: now, delay: 0 }]);
            } else if (ev.startsWith('pickup:')) {
                const kind = ev.slice(7);
                const from = F6_ITEM_SOURCE[kind];
                const delay = kind === 'chave' ? 1.15 : 0.1;
                const tid = window.setTimeout(() => { pickupTimers.current.delete(tid); playF6Pickup(); }, delay * 1000);
                pickupTimers.current.add(tid);
                if (from) setFlights((fl) => [...fl, { id: ++flightId, kind, from, to: null, t0: now, delay }]);
            }
        }

        // bathroom fluorescent: flickers to life right after the unlock
        if (bathLight.current) {
            bathFlicker.current = Math.max(0, bathFlicker.current - dt);
            const on = f6.bathOpen && f6.phase !== 'blackout';
            bathLight.current.intensity = !on ? 0
                : bathFlicker.current > 0 ? (Math.random() < 0.6 ? 13 : 1)
                : 13 + Math.sin(now * 13.7) * 0.5;
        }
        // bedroom bulb: breathes, dips on spark, dims during guest2, recovers in free
        if (bedLight.current) {
            const sparkDip = fx.t['bang'] !== undefined && now - fx.t['bang'] < 0.5 ? 0.45 : 1;

            // Phase logic: set dimming target based on phase
            if (f6.phase === 'guest2') {
                guest2DimTarget.current = 0.55;  // ~55% during act 2
            } else if (f6.phase === 'free') {
                if (lightRecoveryStart.current === 0) lightRecoveryStart.current = now;
                // Recover over 4 seconds
                const recoverElapsed = now - lightRecoveryStart.current;
                guest2DimTarget.current = 0.55 + (1 - 0.55) * Math.min(1, recoverElapsed / 4);
            } else if (f6.phase !== 'guest' && f6.phase !== 'guestIdle' && f6.phase !== 'leave') {
                // reset recovery timer if we leave free
                lightRecoveryStart.current = 0;
                guest2DimTarget.current = 1;
            }

            // Edge-detect: guestLine transitioned to 4 (climax "Lembra. De. Mim.")
            // Trigger memory pulse (light + sound) only once during guest2
            if (f6.phase === 'guest2' && f6.guestLine === 4 && !memoryPulseTriggered.current) {
                memoryPulseTriggered.current = true;
                memoryPulseStart.current = now;
                playF6MemoryPulse();
            }
            // Reset trigger when leaving guest2
            if (f6.phase !== 'guest2') memoryPulseTriggered.current = false;

            // Memory pulse light effect: bedLight pulses down ~0.4s then back up over 1.0s total
            const memoryPulseElapsed = memoryPulseStart.current > 0 ? now - memoryPulseStart.current : -1;
            const memoryPulse = memoryPulseElapsed >= 0 && memoryPulseElapsed < 0.4
                ? 1 - (memoryPulseElapsed / 0.4)  // ramp down
                : memoryPulseElapsed >= 0.4 && memoryPulseElapsed < 1.0
                ? (memoryPulseElapsed - 0.4) / 0.6  // ramp back up
                : 1;

            const baseBreathe = 21 + Math.sin(now * 0.9) * 0.8;
            bedLight.current.intensity = baseBreathe * guest2DimTarget.current * sparkDip * memoryPulse;
        }

        // tap loop follows the state
        if (f6.tapOn && !tapLoop.current) { tapLoop.current = true; startF6Tap(); }
        if (!f6.tapOn && tapLoop.current) { tapLoop.current = false; stopF6Tap(); }

        // TV glow
        if (tvLight.current) tvLight.current.intensity = f6.tvOn ? 4 + Math.random() * 3 : 0;

        // the guest breathes nearby every few seconds
        if (f6.phase === 'guest' || f6.phase === 'guestIdle') {
            breathTimer.current -= dt;
            if (breathTimer.current <= 0) { breathTimer.current = 4.5 + Math.random() * 3; playF6Breath(0.5); }
        }
    });

    const lightsOut = f6.phase === 'blackout';

    return (
        <group>
            {/* ── floors ── */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.25, 0.001, -1.5]} material={F6M.carpet}>
                <planeGeometry args={[9.5, 17]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.75, 0.001, -6.5]} material={F6M.tileFloor}>
                <planeGeometry args={[4.5, 7]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.75, 0.001, 2]} material={F6M.vinyl}>
                <planeGeometry args={[4.5, 10]} />
            </mesh>
            {/* bedside rug */}
            <mesh rotation={[-Math.PI / 2, 0, 0.3]} position={[-4.5, 0.008, 1.8]} scale={[1.55, 1.0, 1]}>
                <circleGeometry args={[1, 24]} />
                <meshStandardMaterial color="#67352c" roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0.3]} position={[-4.5, 0.01, 1.8]} scale={[1.55, 1.0, 1]}>
                <ringGeometry args={[0.86, 1, 24]} />
                <meshStandardMaterial color="#8c6a3a" roughness={1} />
            </mesh>
            {/* ceiling */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[-1, F6_CEIL, -1.5]} material={F6M.ceil}>
                <planeGeometry args={[14, 17]} />
            </mesh>

            {/* ── walls (collision-matched to F6_STATIC_WALLS; finish per FACE) ── */}
            <Wall seg={[-8, -10, -8, 7]} a="paper" b="paper" />
            <Wall seg={[6, -10, 6, -3]} a="paper" b="tile" />
            <Wall seg={[6, -3, 6, 7]} a="paper" b="paper" />
            <Wall seg={[-8, 7, 6, 7]} a="paper" b="paper" />
            {/* faces toward the dead cab (z<-10) are dark shaft, not wallpaper */}
            <Wall seg={[-8, -10, -1.3, -10]} a="shaft" b="paper" />
            <Wall seg={[1.3, -10, 6, -10]} a="shaft" b="tile" />
            <Wall seg={[1.5, -10, 1.5, -6.2]} a="tile" b="paper" />
            <Wall seg={[1.5, -4.8, 1.5, -3]} a="tile" b="paper" />
            <Wall seg={[1.5, -3, 1.5, 2.3]} a="paper" b="paper" />
            <Wall seg={[1.5, 3.7, 1.5, 7]} a="paper" b="paper" />
            <Wall seg={[1.5, -3, 6, -3]} a="tile" b="paper" />
            {/* lintels over the two doorways */}
            <Wall seg={[1.5, -6.2, 1.5, -4.8]} h={F6_CEIL - 2.14} y={2.14} a="tile" b="paper" />
            <Wall seg={[1.5, 2.3, 1.5, 3.7]} h={F6_CEIL - 2.14} y={2.14} a="paper" b="paper" />
            {/* header over the elevator doorway */}
            <Wall seg={[-1.3, -10, 1.3, -10]} h={F6_CEIL - 2.4} y={2.4} a="paper" b="paper" />
            {/* steel architrave around the elevator doorway */}
            <group position={[0, 0, -9.93]}>
                <B a={[0.18, 2.5, 0.1]} p={[-1.39, 1.25, 0]} m={F6M.steel} />
                <B a={[0.18, 2.5, 0.1]} p={[1.39, 1.25, 0]} m={F6M.steel} />
                <B a={[2.96, 0.16, 0.1]} p={[0, 2.48, 0]} m={F6M.steel} />
                {/* scuffed threshold plate */}
                <B a={[2.9, 0.02, 0.34]} p={[0, 0.012, -0.05]} m={F6M.steel} />
            </group>

            {/* baseboards + crown molding — merged into one mesh (was 32 draws) */}
            <MergedTrim />

            {/* ceiling hardware */}
            <CeilLamp x={-3} z={-1.5} on={!lightsOut} />
            <CeilLamp x={3.75} z={-6.5} on={f6.bathOpen && !lightsOut} cool />
            <CeilLamp x={3.75} z={2.0} on={f6.kitchenOpen && !lightsOut} />
            <SmokeDetector x={-5.5} z={-4} />
            {/* AC vent + sprinkler */}
            <group position={[4.8, F6_CEIL - 0.02, 4.5]}>
                <B a={[0.6, 0.04, 0.4]} p={[0, 0, 0]} m={F6M.applianceDk} />
                {[-0.12, 0, 0.12].map((z) => (
                    <B key={z} a={[0.52, 0.05, 0.04]} p={[0, 0, z]} m={F6M.dark} />
                ))}
            </group>
            <group position={[3.75, F6_CEIL - 0.03, -5]}>
                <mesh material={F6M.brassOld}><cylinderGeometry args={[0.03, 0.02, 0.09, 8]} /></mesh>
            </group>

            {/* ── contact shadows under everything heavy ──
                15 transparent decal planes — pure realism + heavy transparent
                overdraw, so high quality only. */}
            {!lite && (<>
            <GroundBlob x={-7.0} z={2.5} w={2.4} d={3.0} />
            <GroundBlob x={-7.6} z={4.4} w={1.1} d={1.1} />
            <GroundBlob x={-3.5} z={6.5} w={2.2} d={1.3} />
            <GroundBlob x={-5.5} z={-9.4} w={2.2} d={1.3} />
            <GroundBlob x={1.15} z={1.2} w={1.0} d={1.8} />
            <GroundBlob x={-2.0} z={5.9} w={1.3} d={0.9} />
            <GroundBlob x={-4.6} z={1.6} w={1.3} d={1.3} />
            <GroundBlob x={-3.5} z={1.45} w={0.8} d={0.7} />
            <GroundBlob x={-4.6} z={2.85} w={0.7} d={0.7} />
            <GroundBlob x={3.2} z={-9.5} w={1.3} d={0.9} />
            <GroundBlob x={5.5} z={-8.5} w={1.1} d={1.1} />
            <GroundBlob x={3.75} z={-3.6} w={2.4} d={1.3} />
            <GroundBlob x={5.5} z={1.2} w={1.2} d={4.0} />
            <GroundBlob x={5.5} z={-1.9} w={1.3} d={1.3} />
            <GroundBlob x={3.75} z={6.5} w={3.8} d={1.0} />
            </>)}

            {/* ── bedroom ── */}
            <Bed fx={fx} />
            <Nightstand />
            <Wardrobe fx={fx} />
            <Desk />
            <DrawerAbridor />
            <Suitcase />
            <SittingArea />
            <TvSet />
            <CrookedPainting />
            {/* a second, straighter landscape on the north wall */}
            <group position={[0.1, 1.8, 6.85]} rotation={[0, Math.PI, 0]}>
                <mesh>
                    <boxGeometry args={[0.9, 0.66, 0.05]} />
                    <meshStandardMaterial map={paintingTex} roughness={0.45} envMapIntensity={0.5} />
                </mesh>
                <B a={[0.98, 0.06, 0.06]} p={[0, 0.34, 0]} m={F6M.brassOld} />
                <B a={[0.98, 0.06, 0.06]} p={[0, -0.34, 0]} m={F6M.brassOld} />
                <B a={[0.06, 0.74, 0.06]} p={[-0.475, 0, 0]} m={F6M.brassOld} />
                <B a={[0.06, 0.74, 0.06]} p={[0.475, 0, 0]} m={F6M.brassOld} />
            </group>
            <Window612 />
            <Sconce p={[-7.86, 1.9, -5.5]} ry={Math.PI / 2} />
            <Sconce p={[-7.86, 1.9, 4.0]} ry={Math.PI / 2} />
            {/* suite plate over the elevator doorway */}
            <mesh position={[0, 2.7, -9.85]}>
                <boxGeometry args={[0.62, 0.32, 0.04]} />
                <meshStandardMaterial map={plate612Tex} roughness={0.4} metalness={0.4} envMapIntensity={1} />
            </mesh>
            {/* purely-atmospheric billboards — high only (transparent overdraw) */}
            {!lite && <DustMotes />}

            {/* ── doors ── */}
            <DoorFrame z0={-6.2} />
            <DoorFrame z0={2.3} />
            <BathDoor fx={fx} />
            <KitchenDoor fx={fx} />

            {/* ── the dead elevator ── */}
            <DeadCab fx={fx} />

            {/* ── locked rooms ──
                Mounted only once their door is actually open. While locked, a
                solid door slab + the partition wall fully hide the interior, so
                rendering it is pure waste — this is ~140 draw calls (and a lot of
                fill) skipped during the whole first half of the floor. They mount
                exactly as the door swings open. */}
            {f6.bathOpen && <Bathroom fx={fx} />}
            {f6.kitchenOpen && <Kitchen fx={fx} />}

            {/* ── flights ── */}
            <FlightLayer flights={flights}
                onDone={(id) => setFlights((fl) => fl.filter((f) => f.id !== id))} />

            {/* ── light rig (three r184: physical units — pointLights in candela) ── */}
            {!lightsOut && (
                <>
                    {/* low tier drops the env map, so brighten the fill to compensate */}
                    <hemisphereLight args={['#8d8780', '#463f36', lowTier ? 1.15 : 0.34]} />
                    {lowTier && <ambientLight color="#d4c8b0" intensity={0.75} />}
                    {/* abajur warmth */}
                    <pointLight position={[-7.5, 1.15, 4.3]} color="#ffc580" intensity={24} distance={10} decay={2} />
                    {/* bedroom ceiling bulb — anchored to its fixture */}
                    <pointLight ref={bedLight} position={[-3, 2.6, -1.5]} color="#e8d9b8" intensity={17} distance={16} decay={2} />
                    {/* bathroom fluorescent — only mounted once unlocked so it isn't a
                        dead (intensity-0) light baked into every material's shader. */}
                    {f6.bathOpen && <pointLight ref={bathLight} position={[3.75, 2.6, -6.5]} color="#cfe4e8" intensity={0} distance={10} decay={2} />}
                    {/* kitchen bulb */}
                    {f6.kitchenOpen && <pointLight position={[3.75, 2.6, 2.0]} color="#f4e2b8" intensity={16} distance={11} decay={2} />}
                    {/* TV glow — only while the TV is actually on */}
                    {f6.tvOn && <pointLight ref={tvLight} position={[0.4, 1.1, 1.2]} color="#bcd2da" intensity={0} distance={5} decay={2} />}
                </>
            )}
            {lightsOut && <hemisphereLight args={['#1a1a20', '#050507', 0.3]} />}

            {/* ── the guest ──
                Rendered through the whole endgame: dialogue acts ('guest',
                'guestIdle', 'guest2'), the step-aside ('free') and boarding
                ('leave') — his own animation reads f6.phase; unmounting here
                would make him vanish instead of dragging aside. */}
            {(f6.phase === 'guest' || f6.phase === 'guestIdle' || f6.phase === 'guest2'
                || f6.phase === 'free' || f6.phase === 'leave') && (
                <>
                    <Floor6Guest playerPositionRef={playerPositionRef} />
                    {(f6.phase === 'free' || f6.phase === 'leave')
                        ? <GroundBlob x={-2.35} z={-8.75} w={0.9} d={0.9} />
                        : <GroundBlob x={0} z={-8.2} w={0.9} d={0.9} />}
                </>
            )}
        </group>
    );
};

export default Floor6Suite;
