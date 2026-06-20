/**
 * Floor7.tsx — THE PIRATE SHIP (Andar 7). The whole floor is driven by the
 * WebAssembly brain in Floor7Brain.ts (compiled from floor7.c + floor7_asm.s):
 * the ship's sea motion, the elevator vanishing, the captain who strides over
 * and gives the quest, the bucket pickup and the puddle-mopping all come out of
 * the WASM. This file only READS those numbers and renders Three.js meshes.
 *
 * Player rides the deck: each frame the player's world position is mapped into
 * the ship's local frame and fed to the brain, so cleaning stays aligned even
 * as the hull rolls on the swell.
 *
 * NOTE: partial level (by design) — once the deck is clean there's nothing left
 * to do and the elevator is gone, so there's no way out. f7_can_leave() === 0.
 */
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { Floor7Brain, F7_STATE, type F7Puddle } from './Floor7Brain';
import { Floor7Water } from './Floor7Water';
import { makeWood, makeJollyRoger, makeCloud, makeGlow, makeSkyEquirect, makeSailcloth } from './floor7Textures';
import { buildHullGeometry, buildDeckGeometry, buildRailGeometry } from './floor7Geo';

// procedural wood (browser-only canvas; Floor7 is never imported by tests)
const _deckWood = makeWood({ base: '#8a6334', dark: '#5a3f22', light: '#a9824a', plankW: 64, knots: 6 });
const _hullWood = makeWood({ base: '#5f4226', dark: '#3a2715', light: '#7a5634', plankW: 80, knots: 4 });
const _trimWood = makeWood({ base: '#6e4a28', dark: '#46301a', light: '#8a5f34', plankW: 40, knots: 2 });
_deckWood.map.repeat.set(3, 7); _deckWood.rough.repeat.set(3, 7);
_hullWood.map.repeat.set(4, 2); _hullWood.rough.repeat.set(4, 2);
_trimWood.map.repeat.set(6, 1); _trimWood.rough.repeat.set(6, 1);
const _sailCloth = makeSailcloth();

// a billowing sail: a plane bulged outward (wind-filled) with a sagging foot,
// so the canvas reads as cloth catching wind instead of a flat card.
function billowSail(w: number, h: number, bulge: number): THREE.PlaneGeometry {
    const g = new THREE.PlaneGeometry(w, h, 12, 8);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w + 0.5;        // 0..1 across
        const v = p.getY(i) / h + 0.5;        // 0..1 up
        const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        p.setZ(i, belly * bulge);             // bulge toward +z (lee side)
        p.setY(i, p.getY(i) - (1 - Math.cos((u - 0.5) * Math.PI * 0.9)) * h * 0.06); // scalloped foot
    }
    g.computeVertexNormals();
    return g;
}
const _mainSailGeo = billowSail(4.2, 2.6, 0.55);
const _foreSailGeo = billowSail(3.0, 1.9, 0.42);

// warm low sun (golden hour) shared by the Sky, the key light and water glitter
const SUN_POS: [number, number, number] = [26, 4.5, -30];
const SUN_DIR = new THREE.Vector3(...SUN_POS).normalize();

// ── shared per-mount handle so the DOM overlay can read the brain ──
export interface Floor7Handle {
    brain: Floor7Brain | null;
    interact: boolean;          // action held this frame
    dialogue: number;
    cleaned: number;
    npud: number;
    cleanPct: number;
    state: number;
}
export function useFloor7Handle(): React.MutableRefObject<Floor7Handle> {
    return useRef<Floor7Handle>({ brain: null, interact: false, dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0 });
}

// ── materials (module-scope, shared) ──
const M = {
    hull: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.04, color: '#caa066', roughness: 0.85, envMapIntensity: 0.7, side: THREE.DoubleSide }),
    hullDk: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.04, color: '#8c6e44', roughness: 0.92 }),
    plank: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#c79a5e', roughness: 0.78, envMapIntensity: 0.6 }),
    plankDk: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#ac8049', roughness: 0.82, envMapIntensity: 0.6 }),
    rail: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, bumpMap: _trimWood.rough, bumpScale: 0.025, color: '#b07f48', roughness: 0.55, envMapIntensity: 0.8 }),
    mast: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#b58a52', roughness: 0.6 }),
    sail: new THREE.MeshStandardMaterial({ map: _sailCloth.map, roughnessMap: _sailCloth.rough, color: '#f2ead6', roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.4 }),
    rope: new THREE.MeshStandardMaterial({ color: '#caa56a', roughness: 1 }),
    flag: new THREE.MeshStandardMaterial({ map: makeJollyRoger(), roughness: 0.95, side: THREE.DoubleSide }),
    barrel: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#9c7038', roughness: 0.7 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9c2c8', roughness: 0.35, metalness: 0.7 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#5b3d22', roughness: 0.7 }),
    coat: new THREE.MeshStandardMaterial({ color: '#8a2222', roughness: 0.6 }),
    coatDk: new THREE.MeshStandardMaterial({ color: '#5c1414', roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ color: '#cd9a6e', roughness: 0.62 }),
    hat: new THREE.MeshStandardMaterial({ color: '#17161b', roughness: 0.62, envMapIntensity: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e8c45a', roughness: 0.28, metalness: 0.9, envMapIntensity: 1.4 }),
    boot: new THREE.MeshStandardMaterial({ color: '#2a1d12', roughness: 0.55 }),
    beard: new THREE.MeshStandardMaterial({ color: '#7d6552', roughness: 0.95 }),
    hair: new THREE.MeshStandardMaterial({ color: '#26201a', roughness: 0.9 }),
    eyewhite: new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.35 }),
    sash: new THREE.MeshStandardMaterial({ color: '#caa024', roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.3, metalness: 0.85 }),
    bucket: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, bumpMap: _trimWood.rough, bumpScale: 0.02, color: '#9c7038', roughness: 0.7, envMapIntensity: 0.6 }),
    sudsy: new THREE.MeshPhysicalMaterial({ color: '#cfe2e6', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#d6d0c2', roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#2f6d86', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.6 }),
    foam: new THREE.MeshStandardMaterial({ color: '#eef6f7', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }),
    bird: new THREE.MeshStandardMaterial({ color: '#3a3a40', roughness: 0.9 }),
    puddle: new THREE.MeshPhysicalMaterial({ color: '#244e5e', roughness: 0.12, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04, transparent: true, opacity: 0.82, envMapIntensity: 1.3 }),
    elev: new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.4, metalness: 0.5, transparent: true }),
    elevTrim: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.4, metalness: 0.6, transparent: true }),
};

// ── the static ship hull + deck + masts (no per-frame logic) ──
const ShipBody: React.FC = () => {
    // hull + deck + rail caps are ALL MODELLED IN C++ (floor7_geo.cpp → WASM):
    // the deck and rails sample the same sheer/beam curves as the hull, so the
    // whole ship sweeps together. JS only uploads the buffers. Plus a thin spray
    // band hugging the waterline.
    const { hullGeo, deckGeo, railGeo, foamGeo } = useMemo(() => {
        const hull = buildHullGeometry();
        const deck = buildDeckGeometry();
        const rail = buildRailGeometry();
        // a slim spray/foam band tracing the waterline outline (thin, not a disc)
        const beam = 3.05, bow = 8.0, stern = -6.9, k = 1.06;
        const s = new THREE.Shape();
        s.moveTo(-beam * 0.7 * k, stern * k);
        s.lineTo(beam * 0.7 * k, stern * k);
        s.bezierCurveTo((beam + 0.15) * k, (stern + 3) * k, (beam + 0.15) * k, (bow - 4) * k, beam * 0.4 * k, (bow - 1.4) * k);
        s.bezierCurveTo(beam * 0.22 * k, (bow - 0.3) * k, beam * 0.1 * k, bow * k, 0, bow * k);
        s.bezierCurveTo(-beam * 0.1 * k, bow * k, -beam * 0.22 * k, (bow - 0.3) * k, -beam * 0.4 * k, (bow - 1.4) * k);
        s.bezierCurveTo(-(beam + 0.15) * k, (bow - 4) * k, -(beam + 0.15) * k, (stern + 3) * k, -beam * 0.7 * k, stern * k);
        const hole = new THREE.Path();
        const ki = 0.9;
        hole.moveTo(-beam * 0.7 * ki, stern * ki);
        hole.lineTo(beam * 0.7 * ki, stern * ki);
        hole.bezierCurveTo((beam + 0.15) * ki, (stern + 3) * ki, (beam + 0.15) * ki, (bow - 4) * ki, beam * 0.4 * ki, (bow - 1.4) * ki);
        hole.bezierCurveTo(beam * 0.22 * ki, (bow - 0.3) * ki, beam * 0.1 * ki, bow * ki, 0, bow * ki);
        hole.bezierCurveTo(-beam * 0.1 * ki, bow * ki, -beam * 0.22 * ki, (bow - 0.3) * ki, -beam * 0.4 * ki, (bow - 1.4) * ki);
        hole.bezierCurveTo(-(beam + 0.15) * ki, (bow - 4) * ki, -(beam + 0.15) * ki, (stern + 3) * ki, -beam * 0.7 * ki, stern * ki);
        s.holes.push(hole);
        const foam = new THREE.ShapeGeometry(s);
        foam.rotateX(-Math.PI / 2);
        return { hullGeo: hull, deckGeo: deck, railGeo: rail, foamGeo: foam };
    }, []);
    return (
        <group>
            {/* hull — generated in C++ (sheer + tumblehome + raked stem + bulwarks),
                double-sided so the inner planking shows */}
            <mesh geometry={hullGeo} position={[0, 0, 0]} material={M.hull} />
            {/* deck surface (C++ sheer curve) */}
            <mesh geometry={deckGeo} material={M.plankDk} />
            {/* rail caps swept along the sheer (C++ curve) */}
            <mesh geometry={railGeo} material={M.rail} />
            {/* thin spray band at the waterline */}
            <mesh geometry={foamGeo} position={[0, -0.66, 0]} material={M.foam} renderOrder={2} />
            {/* main mast + yard + sail + flag + crow's nest */}
            <group position={[0, 0, -1]}>
                <mesh position={[0, 3.4, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.16, 0.2, 6.8, 10]} />
                </mesh>
                <mesh position={[0, 5.2, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.08, 0.08, 4.6, 8]} />
                </mesh>
                <mesh position={[0, 4.0, 0.06]} geometry={_mainSailGeo} material={M.sail} />
                {/* crow's nest */}
                <mesh position={[0, 6.0, 0]} material={M.rail}><cylinderGeometry args={[0.34, 0.28, 0.4, 10, 1, true]} /></mesh>
                <mesh position={[0, 5.8, 0]} material={M.rail}><cylinderGeometry args={[0.32, 0.32, 0.04, 10]} /></mesh>
                <Flag y={6.7} />
            </group>
            {/* foremast */}
            <group position={[0, 0, 4]}>
                <mesh position={[0, 2.6, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.13, 0.16, 5.2, 10]} />
                </mesh>
                <mesh position={[0, 3.7, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.07, 0.07, 3.4, 8]} />
                </mesh>
                <mesh position={[0, 2.9, 0.05]} geometry={_foreSailGeo} material={M.sail} />
            </group>
            {/* helm (ship's wheel) at the stern */}
            <group position={[0, 0.7, -6.2]}>
                <mesh material={M.wheel}><torusGeometry args={[0.42, 0.06, 8, 18]} /></mesh>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} material={M.wheel}>
                        <boxGeometry args={[0.06, 1.0, 0.06]} />
                    </mesh>
                ))}
                <mesh material={M.metal}><cylinderGeometry args={[0.07, 0.07, 0.2, 8]} /></mesh>
            </group>
            {/* bowsprit */}
            <mesh position={[0, 0.7, 8.2]} rotation={[0.5, 0, 0]} material={M.mast}>
                <cylinderGeometry args={[0.1, 0.13, 3, 8]} />
            </mesh>


            {/* rope shrouds — mast to rail */}
            {[-1, 1].map((s) => [-0.8, 0, 0.8].map((zoff, i) => {
                const x2 = s * 2.9, z2 = -1 + zoff * 2.2;
                const mx = s * 0.18, mz = -1 + zoff * 0.4, my = 3.2;
                const dx = x2 - mx, dy = 0.5 - my, dz = z2 - mz;
                const len = Math.hypot(dx, dy, dz);
                return (
                    <mesh key={'sh' + s + i} position={[(mx + x2) / 2, (my + 0.5) / 2, (mz + z2) / 2]}
                        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize())}
                        material={M.rope}>
                        <cylinderGeometry args={[0.018, 0.018, len, 5]} />
                    </mesh>
                );
            }))}

            {/* barrels (bow corner) + a crate stack (by the foremast) */}
            {[[2.2, 5.6], [2.55, 6.1], [-2.4, 5.8]].map(([x, z], i) => (
                <group key={'bar' + i} position={[x, 0.34, z]}>
                    <mesh material={M.barrel}><cylinderGeometry args={[0.3, 0.26, 0.68, 12]} /></mesh>
                    <mesh position={[0, 0.18, 0]} material={M.iron}><torusGeometry args={[0.3, 0.022, 6, 16]} /></mesh>
                    <mesh position={[0, -0.18, 0]} material={M.iron}><torusGeometry args={[0.3, 0.022, 6, 16]} /></mesh>
                </group>
            ))}
            {[[0, 0], [0.05, 0.55], [0.5, 0.05]].map(([dy, dx], i) => (
                <mesh key={'cr' + i} position={[-2.2 + dx, 0.3 + dy, 4.0]} rotation={[0, i * 0.4, 0]} material={M.plank}>
                    <boxGeometry args={[0.55, 0.55, 0.55]} />
                </mesh>
            ))}

            {/* cannons at the gunwales, pointing out to sea */}
            {[[2.55, -2.5, 1], [-2.55, 1.5, -1], [2.55, 0.5, 1]].map(([x, z, s], i) => (
                <group key={'cn' + i} position={[x, 0.32, z]} rotation={[0, (s as number) * Math.PI / 2, 0]}>
                    <mesh rotation={[0, 0, Math.PI / 2]} material={M.iron}><cylinderGeometry args={[0.11, 0.14, 0.8, 12]} /></mesh>
                    <mesh position={[0.42, 0, 0]} material={M.iron}><sphereGeometry args={[0.09, 8, 6]} /></mesh>
                    <mesh position={[-0.1, -0.16, 0]} material={M.wheel}><boxGeometry args={[0.5, 0.22, 0.36]} /></mesh>
                    {[-0.18, 0.18].map((wz) => (
                        <mesh key={wz} position={[-0.1, -0.28, wz]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><cylinderGeometry args={[0.1, 0.1, 0.05, 10]} /></mesh>
                    ))}
                </group>
            ))}
            {/* coiled ropes on the deck */}
            {[[-1.8, -3.2], [1.7, 3.3]].map(([x, z], i) => (
                <group key={'rp' + i} position={[x, 0.06, z]}>
                    {[0.22, 0.16, 0.1].map((r, j) => (
                        <mesh key={j} position={[0, j * 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}><torusGeometry args={[r, 0.03, 6, 16]} /></mesh>
                    ))}
                </group>
            ))}

            {/* a hanging lantern by the helm (warm glow) */}
            <group position={[1.4, 1.5, -5.9]}>
                <mesh material={M.iron}><cylinderGeometry args={[0.02, 0.02, 0.5, 6]} /></mesh>
                <mesh position={[0, -0.32, 0]}>
                    <boxGeometry args={[0.16, 0.22, 0.16]} />
                    <meshStandardMaterial color="#ffd98a" emissive="#ffb347" emissiveIntensity={2.2} />
                </mesh>
                <pointLight position={[0, -0.32, 0]} color="#ffb347" intensity={6} distance={5} decay={2} />
            </group>
        </group>
    );
};

// ── procedural drifting clouds (self-contained billboards, no external assets) ──
const CloudField: React.FC = () => {
    const ref = useRef<THREE.Group>(null);
    const clouds = useMemo(() => {
        const r = (n: number) => ((Math.sin(n * 127.1) * 43758.5) % 1 + 1) % 1;
        return Array.from({ length: 7 }, (_, i) => ({
            tex: makeCloud(i + 1),
            x: -60 + r(i) * 120, y: 14 + r(i + 9) * 14, z: -30 - r(i + 3) * 55,
            s: 14 + r(i + 5) * 18, sp: 0.4 + r(i + 7) * 0.7,
        }));
    }, []);
    useFrame((_, dt) => {
        const g = ref.current; if (!g) return;
        for (let i = 0; i < g.children.length; i++) {
            const ch = g.children[i]; ch.position.x += clouds[i].sp * dt;
            if (ch.position.x > 75) ch.position.x = -75;
        }
    });
    return (
        <group ref={ref}>
            {clouds.map((c, i) => (
                <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.5, 1]}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={c.tex} transparent opacity={0.85} depthWrite={false} fog={false} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
};

// ── a warm sun halo on the horizon ──
const SunGlow: React.FC = () => {
    const tex = useMemo(() => makeGlow(), []);
    const p = SUN_DIR.clone().multiplyScalar(180);
    return (
        <mesh position={[p.x, p.y, p.z]}>
            <planeGeometry args={[120, 120]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
        </mesh>
    );
};

// ── a small flock of seagulls (simple flapping V's) ──
const Birds: React.FC = () => {
    const ref = useRef<THREE.Group>(null);
    const birds = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
        r: 18 + i * 5, h: 11 + (i % 3) * 3, ph: i * 1.4, sp: 0.12 + (i % 4) * 0.03, flap: 5 + i,
    })), []);
    useFrame(({ clock }) => {
        const g = ref.current; if (!g) return;
        const t = clock.elapsedTime;
        g.children.forEach((b, i) => {
            const d = birds[i]; const a = t * d.sp + d.ph;
            b.position.set(Math.cos(a) * d.r, d.h + Math.sin(a * 1.3) * 1.2, -20 + Math.sin(a) * d.r);
            b.rotation.y = -a + Math.PI / 2;
            const fl = Math.sin(t * d.flap) * 0.5;
            (b.children[0] as THREE.Mesh).rotation.z = 0.3 + fl;
            (b.children[1] as THREE.Mesh).rotation.z = -0.3 - fl;
        });
    });
    return (
        <group ref={ref}>
            {birds.map((_, i) => (
                <group key={i}>
                    <mesh position={[0.22, 0, 0]} material={M.bird}><boxGeometry args={[0.5, 0.04, 0.16]} /></mesh>
                    <mesh position={[-0.22, 0, 0]} material={M.bird}><boxGeometry args={[0.5, 0.04, 0.16]} /></mesh>
                </group>
            ))}
        </group>
    );
};

// ── a waving pirate flag (black with a skull) ──
const Flag: React.FC<{ y: number }> = ({ y }) => {
    const ref = useRef<THREE.Mesh>(null);
    const geo = useMemo(() => new THREE.PlaneGeometry(1.4, 0.85, 14, 6), []);
    const base = useMemo(() => geo.attributes.position.array.slice(0), [geo]);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        const t = clock.elapsedTime;
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const bx = (base as Float32Array)[i * 3];
            const u = (bx + 0.7) / 1.4;                // 0 at mast, 1 at fly
            const z = Math.sin(u * 7 - t * 6) * 0.12 * u + Math.sin(u * 3 - t * 3) * 0.05 * u;
            pos.setZ(i, z);
        }
        pos.needsUpdate = true;
    });
    return (
        <mesh ref={ref} geometry={geo} position={[0.7, y, 0]} material={M.flag} />
    );
};

// ── the captain (stylized) — transform set per frame ──
// Designed in pieces so it reads as a real pirate captain up close: a cocked
// tricorne (crown + three upturned brim flaps), a face with eyes/brow/eyepatch/
// nose/mustache, a full beard, brocaded red coat, sash, belt and cutlass.
const Captain = React.forwardRef<THREE.Group>((_, ref) => (
    <group ref={ref}>
        {/* legs + boots (one peg leg for pirate flair) */}
        <mesh position={[-0.13, 0.3, 0]} material={M.boot}><cylinderGeometry args={[0.1, 0.12, 0.62, 10]} /></mesh>
        <mesh position={[-0.13, 0.04, 0.05]} material={M.boot}><boxGeometry args={[0.18, 0.12, 0.34]} /></mesh>
        <mesh position={[-0.13, 0.56, 0]} material={M.boot}><cylinderGeometry args={[0.15, 0.12, 0.14, 10]} /></mesh>{/* boot cuff */}
        <mesh position={[0.13, 0.34, 0]} material={M.boot}><cylinderGeometry args={[0.055, 0.085, 0.5, 8]} /></mesh>{/* peg */}
        <mesh position={[0.13, 0.06, 0]} material={M.boot}><cylinderGeometry args={[0.09, 0.07, 0.1, 8]} /></mesh>

        {/* long coat — flared skirt + torso */}
        <mesh position={[0, 0.78, 0]} material={M.coat}><cylinderGeometry args={[0.27, 0.38, 0.62, 16]} /></mesh>
        <mesh position={[0, 1.16, 0]} material={M.coat}><cylinderGeometry args={[0.23, 0.27, 0.44, 16]} /></mesh>
        {/* open-coat front panels (darker lining) */}
        <mesh position={[0, 0.95, 0.235]} rotation={[0.05, 0, 0]} material={M.coatDk}><boxGeometry args={[0.30, 0.95, 0.04]} /></mesh>
        {/* gold buttons (two rows) */}
        {[1.30, 1.16, 1.02, 0.88].map((y, i) => (
            <React.Fragment key={i}>
                <mesh position={[-0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
                <mesh position={[0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
            </React.Fragment>
        ))}
        {/* shoulder/coat collar */}
        <mesh position={[0, 1.33, 0]} material={M.coatDk}><cylinderGeometry args={[0.21, 0.16, 0.12, 14]} /></mesh>
        {/* sash across the chest */}
        <mesh position={[0, 0.98, 0.04]} rotation={[0, 0, 0.55]} material={M.sash}><boxGeometry args={[0.11, 0.74, 0.44]} /></mesh>
        {/* belt + gold buckle */}
        <mesh position={[0, 0.74, 0]} material={M.boot}><cylinderGeometry args={[0.30, 0.32, 0.09, 16]} /></mesh>
        <mesh position={[0, 0.74, 0.31]} material={M.gold}><boxGeometry args={[0.12, 0.08, 0.03]} /></mesh>

        {/* arms with gold cuffs + hands */}
        {[-1, 1].map((s) => (
            <group key={s}>
                <mesh position={[s * 0.30, 1.0, 0.04]} rotation={[0.2, 0, s * 0.34]} material={M.coat}><cylinderGeometry args={[0.075, 0.09, 0.62, 8]} /></mesh>
                <mesh position={[s * 0.41, 0.72, 0.12]} material={M.gold}><cylinderGeometry args={[0.092, 0.092, 0.09, 10]} /></mesh>
                <mesh position={[s * 0.44, 0.65, 0.15]} material={M.skin}><sphereGeometry args={[0.066, 10, 8]} /></mesh>
            </group>
        ))}

        {/* neck + head */}
        <mesh position={[0, 1.41, 0]} material={M.skin}><cylinderGeometry args={[0.085, 0.1, 0.1, 10]} /></mesh>
        <mesh position={[0, 1.58, 0]} scale={[1, 1.05, 0.96]} material={M.skin}><sphereGeometry args={[0.185, 20, 18]} /></mesh>

        {/* === FACE === */}
        {/* brow over the seeing eye (slight angry arch) */}
        <mesh position={[-0.072, 1.64, 0.168]} rotation={[0, 0, 0.18]} material={M.hair}><boxGeometry args={[0.07, 0.016, 0.03]} /></mesh>
        {/* left eye: white sclera + brown iris + dark pupil + glint */}
        <mesh position={[-0.072, 1.607, 0.158]} scale={[1, 0.85, 0.6]} material={M.eyewhite}><sphereGeometry args={[0.03, 14, 12]} /></mesh>
        <mesh position={[-0.072, 1.605, 0.18]} material={M.barrel}><sphereGeometry args={[0.016, 10, 8]} /></mesh>
        <mesh position={[-0.072, 1.604, 0.187]} material={M.hair}><sphereGeometry args={[0.009, 8, 8]} /></mesh>
        {/* right eye: eyepatch + strap across the head */}
        <mesh position={[0.075, 1.605, 0.176]} material={M.hat}><sphereGeometry args={[0.042, 12, 10]} /></mesh>
        <mesh position={[0.02, 1.66, 0]} rotation={[0, 0, 0.5]} material={M.hair}><torusGeometry args={[0.185, 0.011, 6, 28]} /></mesh>
        {/* nose */}
        <mesh position={[0, 1.575, 0.185]} rotation={[Math.PI / 2, 0, 0]} material={M.skin}><coneGeometry args={[0.042, 0.12, 8]} /></mesh>
        {/* mustache (two swept halves) */}
        {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.055, 1.525, 0.165]} rotation={[0, 0, s * 0.55]} material={M.hair}><capsuleGeometry args={[0.02, 0.075, 3, 8]} /></mesh>
        ))}
        {/* full beard: rounded mass + chin point + sideburns */}
        <mesh position={[0, 1.47, 0.075]} scale={[1, 1, 0.9]} material={M.beard}><sphereGeometry args={[0.165, 16, 14, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6]} /></mesh>
        <mesh position={[0, 1.40, 0.07]} material={M.beard}><coneGeometry args={[0.125, 0.26, 14]} /></mesh>
        {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.155, 1.55, 0.04]} material={M.beard}><sphereGeometry args={[0.058, 10, 10]} /></mesh>
        ))}

        {/* === TRICORNE HAT === crown + three upturned brim flaps */}
        <mesh position={[0, 1.79, 0]} material={M.hat}><cylinderGeometry args={[0.155, 0.175, 0.17, 18]} /></mesh>
        <mesh position={[0, 1.87, 0]} material={M.hat}><sphereGeometry args={[0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} /></mesh>
        {[0, 2.0944, 4.1888].map((ang, i) => (
            <group key={i} rotation={[0, ang, 0]}>
                {/* flap plate (tilts outward edge up) + gold rim braid along its edge */}
                <mesh position={[0, 1.745, 0.20]} rotation={[-0.5, 0, 0]} material={M.hat}><boxGeometry args={[0.46, 0.035, 0.28]} /></mesh>
                <mesh position={[0, 1.815, 0.335]} rotation={[-0.5, 0, 0]} material={M.gold}><boxGeometry args={[0.45, 0.02, 0.03]} /></mesh>
            </group>
        ))}
        {/* red plume on the front-left corner */}
        <mesh position={[-0.18, 1.93, 0.18]} rotation={[0.2, 0, 0.5]} material={M.coat}><coneGeometry args={[0.04, 0.32, 8]} /></mesh>

        {/* cutlass at the hip */}
        <group position={[0.34, 0.7, -0.05]} rotation={[0, 0, -0.5]}>
            <mesh position={[0, -0.3, 0]} material={M.steel}><boxGeometry args={[0.03, 0.6, 0.008]} /></mesh>
            <mesh material={M.gold}><torusGeometry args={[0.06, 0.012, 6, 12]} /></mesh>
            <mesh position={[0, 0.06, 0]} material={M.hat}><cylinderGeometry args={[0.018, 0.018, 0.12, 6]} /></mesh>
        </group>
    </group>
));
Captain.displayName = 'Captain';

interface Floor7Props {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    handleRef: React.MutableRefObject<Floor7Handle>;
}

export const Floor7Environment: React.FC<Floor7Props> = ({ playerPositionRef, handleRef }) => {
    const shipRef = useRef<THREE.Group>(null);
    const captainRef = useRef<THREE.Group>(null);
    const bucketRef = useRef<THREE.Group>(null);
    const elevatorRef = useRef<THREE.Group>(null);
    const puddleRefs = useRef<(THREE.Mesh | null)[]>([]);
    const brainRef = useRef<Floor7Brain | null>(null);
    const _local = useRef(new THREE.Vector3());
    const _pud = useRef<F7Puddle>({ x: 0, z: 0, r: 0, prog: 0 });
    const { scene, gl } = useThree();

    // ocean sky + fog + a PMREM environment so every PBR material reflects the
    // sky (metals, varnished wood, the wet puddles) — restored on unmount.
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog, prevEnv = scene.environment;
        scene.background = new THREE.Color('#9cc0d8');
        scene.fog = new THREE.Fog('#9cc0d8', 24, 70);
        const pmrem = new THREE.PMREMGenerator(gl);
        const sky = makeSkyEquirect();
        const envRT = pmrem.fromEquirectangular(sky);
        scene.environment = envRT.texture;
        scene.environmentIntensity = 1.0;
        sky.dispose(); pmrem.dispose();
        return () => {
            scene.background = prevBg; scene.fog = prevFog; scene.environment = prevEnv;
            envRT.dispose();
        };
    }, [scene, gl]);

    // build the brain once
    useEffect(() => {
        const b = new Floor7Brain();
        brainRef.current = b;
        handleRef.current.brain = b;
        handleRef.current.npud = b.npud;
        return () => { brainRef.current = null; handleRef.current.brain = null; };
    }, [handleRef]);

    useFrame((_, dt) => {
        const b = brainRef.current;
        const ship = shipRef.current;
        if (!b || !ship) return;

        // map player world pos into the ship's local frame, feed the brain
        ship.updateWorldMatrix(true, false);
        _local.current.copy(playerPositionRef.current);
        ship.worldToLocal(_local.current);
        b.tick(Math.min(dt, 0.05), _local.current.x, _local.current.y, _local.current.z, handleRef.current.interact);

        // ship rides the swell (heave + pitch + roll from the WASM)
        ship.position.y = b.heave();
        ship.rotation.x = b.pitch();
        ship.rotation.z = b.roll();

        // captain
        if (captainRef.current) {
            const c = b.captain();
            captainRef.current.position.set(c.x, c.bob, c.z);
            captainRef.current.rotation.y = c.face;
            captainRef.current.visible = b.elevFade() < 0.85; // appears as the lift fades
        }
        // bucket
        if (bucketRef.current) {
            const bu = b.bucket();
            bucketRef.current.position.set(bu.x, bu.held ? 0.5 : 0.18, bu.z);
            const glow = (b.state() === F7_STATE.FETCH) ? 0.5 + 0.5 * Math.sin(performance.now() / 200) : 0;
            (M.cloth as THREE.MeshStandardMaterial).emissive.setRGB(glow * 0.4, glow * 0.4, glow * 0.2);
        }
        // elevator dematerialises
        if (elevatorRef.current) {
            const f = b.elevFade();
            elevatorRef.current.visible = f > 0.01;
            elevatorRef.current.position.y = (1 - f) * 0.6;       // lifts as it fades
            elevatorRef.current.scale.setScalar(0.6 + f * 0.4);
            M.elev.opacity = f; M.elevTrim.opacity = f;
        }
        // puddles shrink + fade as they're mopped
        for (let i = 0; i < b.npud; i++) {
            const m = puddleRefs.current[i];
            if (!m) continue;
            const p = b.puddle(i, _pud.current);
            const s = (1 - p.prog) * p.r;
            m.scale.setScalar(Math.max(0.0001, s));
            m.position.set(p.x, 0.02, p.z);
            (m.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - p.prog);
            m.visible = p.prog < 0.995;
        }

        // publish a snapshot for the DOM overlay
        const h = handleRef.current;
        h.dialogue = b.dialogue(); h.cleaned = b.cleaned(); h.cleanPct = b.cleanPct(); h.state = b.state();
    });

    return (
        <group>
            {/* atmospheric golden-hour sky + procedural drifting clouds */}
            <Sky sunPosition={SUN_POS} turbidity={10} rayleigh={2.8} mieCoefficient={0.01} mieDirectionalG={0.94} />
            <SunGlow />
            <CloudField />
            <Birds />
            {/* light rig — warm key sun + cool sky fill */}
            <hemisphereLight args={['#e6ddc4', '#3e4a52', 0.85]} />
            <directionalLight position={SUN_POS} intensity={2.6} color="#ffdca0" />
            <ambientLight intensity={0.2} color="#9fc0d8" />

            {/* the Gerstner-wave ocean */}
            <Floor7Water sunDir={SUN_DIR} />

            {/* the ship (sways) */}
            <group ref={shipRef}>
                <ShipBody />
                {/* the elevator the player rode in on — dematerialises */}
                <group ref={elevatorRef} position={[0, 0, 5.2]}>
                    <mesh position={[0, 1.2, 0]} material={M.elev}><boxGeometry args={[2.2, 2.4, 0.2]} /></mesh>
                    <mesh position={[-1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[0, 2.45, 0.6]} material={M.elevTrim}><boxGeometry args={[2.4, 0.16, 1.4]} /></mesh>
                </group>
                {/* captain */}
                <Captain ref={captainRef} />
                {/* bucket + cloth — wooden staved pail with iron bands, soapy
                    water surface and a draped wet rag (a hero prop up close) */}
                <group ref={bucketRef} position={[2.1, 0.18, -2.2]}>
                    <mesh material={M.bucket}><cylinderGeometry args={[0.16, 0.13, 0.3, 16, 1, true]} /></mesh>
                    <mesh position={[0, -0.15, 0]} material={M.bucket}><cylinderGeometry args={[0.13, 0.13, 0.02, 16]} /></mesh>
                    {/* iron hoops */}
                    {[0.12, -0.1].map((y) => (
                        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[y > 0 ? 0.162 : 0.142, 0.012, 6, 18]} /></mesh>
                    ))}
                    {/* soapy water surface just below the rim */}
                    <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.sudsy}><circleGeometry args={[0.15, 18]} /></mesh>
                    {/* swing handle (iron arc) */}
                    <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[0.155, 0.01, 6, 18, Math.PI]} /></mesh>
                    {/* draped wet rag over the rim */}
                    <mesh position={[0.1, 0.13, 0.05]} rotation={[0.5, 0.4, 0.2]} material={M.cloth}><boxGeometry args={[0.2, 0.03, 0.16]} /></mesh>
                    <mesh position={[0.16, 0.04, 0.08]} rotation={[0.1, 0.4, 0.6]} material={M.cloth}><boxGeometry args={[0.12, 0.02, 0.14]} /></mesh>
                </group>
                {/* puddles */}
                {Array.from({ length: 6 }).map((_, i) => (
                    <mesh
                        key={i}
                        ref={(m) => { puddleRefs.current[i] = m; }}
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, 0.02, 0]}
                        material={M.puddle.clone()}
                    >
                        <circleGeometry args={[1, 20]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

// ── DOM overlay: captain dialogue + objective + clean HUD + interact button ──
const DIALOGUE: Record<number, string> = {
    1: 'Capitão: Ahá, um novo grumete! Antes de zarparmos de vez… o convés tá um brejo. Pega aquele balde com o pano e esfrega essas poças, marujo!',
    2: 'Objetivo: pegue o balde com o pano (perto do mastro).',
    3: 'Objetivo: esfregue todas as poças do convés.',
    4: 'Capitão: Bom trabalho, grumete! …agora senta e espera. Ainda não chegamos a lugar nenhum.',
};

export const Floor7Overlay: React.FC<{ handleRef: React.MutableRefObject<Floor7Handle> }> = ({ handleRef }) => {
    const [snap, setSnap] = useState({ dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0 });
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const h = handleRef.current;
            setSnap((s) => (s.dialogue !== h.dialogue || s.cleaned !== h.cleaned || Math.abs(s.cleanPct - h.cleanPct) > 0.01 || s.state !== h.state)
                ? { dialogue: h.dialogue, cleaned: h.cleaned, npud: h.npud, cleanPct: h.cleanPct, state: h.state } : s);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [handleRef]);

    // keyboard interact (E / Space) → handle.interact while held
    useEffect(() => {
        const dn = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = true; };
        const up = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = false; };
        window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
    }, [handleRef]);

    const txt = DIALOGUE[snap.dialogue];
    const cleaning = snap.state === F7_STATE.CLEAN;
    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 45, fontFamily: '"Source Sans 3","Segoe UI",sans-serif' }}>
            {txt && (
                <div style={{ position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom,0px) + 92px)', transform: 'translateX(-50%)', maxWidth: 'min(92vw, 640px)', background: 'rgba(20,14,8,0.86)', border: '1px solid rgba(202,165,106,0.5)', borderRadius: 12, padding: '12px 16px', color: '#f3e7cf', fontSize: 15, lineHeight: 1.35, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                    {txt}
                </div>
            )}
            {cleaning && (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top,0px) + 56px)', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: '#f3e7cf', fontSize: 12, letterSpacing: '0.15em', textShadow: '0 1px 3px #000' }}>
                        CONVÉS LIMPO {snap.cleaned}/{snap.npud}
                    </div>
                    <div style={{ width: 200, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(snap.cleanPct * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#5fa8c4,#bfe3ef)', transition: 'width 0.15s linear' }} />
                    </div>
                </div>
            )}
            {/* interact button (mobile) */}
            <button
                aria-label="Interagir / Esfregar"
                onPointerDown={(e) => { e.preventDefault(); handleRef.current.interact = true; }}
                onPointerUp={() => { handleRef.current.interact = false; }}
                onPointerLeave={() => { handleRef.current.interact = false; }}
                style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right,0px) + 20px)', bottom: 'calc(env(safe-area-inset-bottom,0px) + 110px)', width: 78, height: 78, borderRadius: '50%', background: 'rgba(202,165,106,0.22)', border: '2px solid rgba(202,165,106,0.6)', color: '#f3e7cf', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', pointerEvents: 'auto', backdropFilter: 'blur(3px)' }}
            >{cleaning ? 'ESFREGAR' : 'E'}</button>
        </div>
    );
};

export default Floor7Environment;
