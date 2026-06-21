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
import { makeWood, makeJollyRoger, makeCloud, makeGlow, makeSkyEquirect, makeSailcloth, makeContactShadow, makePuddleRipple } from './floor7Textures';

const _puddleRipple = makePuddleRipple();
import { buildHullGeometry, buildDeckGeometry, buildRailGeometry, buildWaleGeometry, buildInnerWallGeometry, buildDeckSeams, buildWaterwayGeometry, deckYAt, railYAt, beamAt } from './floor7Geo';
import { FLOOR7_SCALE, F7_DECK_PROPS } from './constants';
import { f7Footstep, f7Scrub, f7BucketClunk, f7CaptainGrunt, f7PuddleDone, f7Wave, f7TideWarn, updateF7Roll } from './floor7Sfx';

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
const _mainSailGeo = billowSail(4.5, 3.4, 0.92);
const _foreSailGeo = billowSail(3.3, 2.9, 0.74);

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
    tideWarn: number;           // 0..1 incoming-swell telegraph
    bucWater: number;           // 0..1 bucket freshness (second-verb meter)
}
export function useFloor7Handle(): React.MutableRefObject<Floor7Handle> {
    return useRef<Floor7Handle>({ brain: null, interact: false, dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0, tideWarn: 0, bucWater: 1 });
}

// ── materials (module-scope, shared) ──
const M = {
    hull: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.09, color: '#caa066', roughness: 0.85, envMapIntensity: 0.7, side: THREE.DoubleSide }),
    hullDk: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.08, color: '#8c6e44', roughness: 0.92 }),
    plank: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#c79a5e', roughness: 0.78, envMapIntensity: 0.6 }),
    plankDk: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#ac8049', roughness: 0.82, envMapIntensity: 0.6 }),
    rail: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, bumpMap: _trimWood.rough, bumpScale: 0.025, color: '#b07f48', roughness: 0.55, envMapIntensity: 0.8 }),
    mast: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#b58a52', roughness: 0.6 }),
    sail: new THREE.MeshStandardMaterial({ map: _sailCloth.map, roughnessMap: _sailCloth.rough, color: '#f2ead6', roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.4 }),
    rope: new THREE.MeshStandardMaterial({ color: '#caa56a', roughness: 1 }),
    flag: new THREE.MeshStandardMaterial({ map: makeJollyRoger(), roughness: 0.95, side: THREE.DoubleSide }),
    barrel: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#9c7038', roughness: 0.7 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.8 }),
    cannon: new THREE.MeshStandardMaterial({ color: '#2e3034', roughness: 0.34, metalness: 0.92, envMapIntensity: 1.1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9c2c8', roughness: 0.35, metalness: 0.7 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#5b3d22', roughness: 0.7 }),
    // wool coat: a fabric bump + high roughness + low env so it reads as cloth,
    // not wet plastic (the sailcloth rough map doubles as a weave bump)
    coat: new THREE.MeshStandardMaterial({ color: '#8a2222', roughness: 0.88, bumpMap: _sailCloth.rough, bumpScale: 0.014, envMapIntensity: 0.25 }),
    coatDk: new THREE.MeshStandardMaterial({ color: '#5c1414', roughness: 0.9, bumpMap: _sailCloth.rough, bumpScale: 0.014, envMapIntensity: 0.2 }),
    skin: new THREE.MeshStandardMaterial({ color: '#cd9a6e', roughness: 0.62 }),
    hat: new THREE.MeshStandardMaterial({ color: '#17161b', roughness: 0.62, envMapIntensity: 0.6 }),
    // warm gold for ALL exterior trim: a faint emissive + a calmer reflection so
    // the gold albedo carries it and the sea reflection can't tint it olive
    // (the env-map sea band is also desaturated to blue-grey for the same reason).
    gold: new THREE.MeshStandardMaterial({ color: '#e8c45a', roughness: 0.34, metalness: 0.7, envMapIntensity: 0.6, emissive: '#3a2b08', emissiveIntensity: 0.18 }),
    // first-person cuff: even calmer, since it fills the frame next to the camera.
    goldFp: new THREE.MeshStandardMaterial({ color: '#e3bb55', roughness: 0.45, metalness: 0.5, envMapIntensity: 0.3, emissive: '#3a2b08', emissiveIntensity: 0.16 }),
    boot: new THREE.MeshStandardMaterial({ color: '#2a1d12', roughness: 0.55 }),
    beard: new THREE.MeshStandardMaterial({ color: '#7d6552', roughness: 0.95 }),
    hair: new THREE.MeshStandardMaterial({ color: '#26201a', roughness: 0.9 }),
    eyewhite: new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.35 }),
    // recessed eye socket (dark, sits behind the white so the eye reads sunken)
    socket: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8 }),
    // iris — weathered grey-blue with a touch of life
    iris: new THREE.MeshStandardMaterial({ color: '#5a6b6e', roughness: 0.32, metalness: 0.1 }),
    // ruddy, weathered captain skin (cheeks/nose catch a warmer tone)
    skinR: new THREE.MeshStandardMaterial({ color: '#c4805c', roughness: 0.66 }),
    sash: new THREE.MeshStandardMaterial({ color: '#caa024', roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.3, metalness: 0.85 }),
    bucket: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, bumpMap: _trimWood.rough, bumpScale: 0.02, color: '#9c7038', roughness: 0.7, envMapIntensity: 0.6 }),
    sudsy: new THREE.MeshPhysicalMaterial({ color: '#cfe2e6', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#d6d0c2', roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#2f6d86', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.6 }),
    foam: new THREE.MeshStandardMaterial({ color: '#eef6f7', roughness: 1, transparent: true, opacity: 0.7, depthWrite: false }),
    bootTop: new THREE.MeshStandardMaterial({ color: '#14322a', roughness: 0.55, envMapIntensity: 0.5 }),
    grate: new THREE.MeshStandardMaterial({ color: '#3a2817', roughness: 0.85 }),
    caulk: new THREE.MeshStandardMaterial({ color: '#140f08', roughness: 1 }),
    giltTrim: new THREE.MeshStandardMaterial({ color: '#a8822f', roughness: 0.55, metalness: 0.6, envMapIntensity: 0.45, emissive: '#2e2207', emissiveIntensity: 0.16 }),
    island: new THREE.MeshStandardMaterial({ color: '#3f5346', roughness: 1, transparent: true, opacity: 0, fog: false }),
    islandBeach: new THREE.MeshStandardMaterial({ color: '#9c8a63', roughness: 1, transparent: true, opacity: 0, fog: false }),
    bird: new THREE.MeshStandardMaterial({ color: '#3a3a40', roughness: 0.9 }),
    puddle: new THREE.MeshPhysicalMaterial({ color: '#0a1316', roughness: 0.05, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04, bumpMap: _puddleRipple, bumpScale: 0.05, transparent: true, opacity: 0.92, envMapIntensity: 1.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#11242e', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#4a3010', emissiveIntensity: 0.28, envMapIntensity: 1.5 }),
    elev: new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.4, metalness: 0.5, transparent: true }),
    elevTrim: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.4, metalness: 0.6, transparent: true }),
};

// Weather the hull by WORLD height: below the (world-fixed) waterline it goes
// dark, wet and green; up toward the cap rail it sun-bleaches. Driven by world
// Y so the wet band tracks the real sea line even as the ship heaves/rolls.
function weatherByHeight(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = 'varying vec3 vWPosF7;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n vWPosF7 = (modelMatrix * vec4(transformed,1.0)).xyz;');
        shader.fragmentShader = 'varying vec3 vWPosF7;\n' + shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             {
                float wet = smoothstep(-0.45, -1.5, vWPosF7.y);
                float sun = smoothstep(0.25, 1.5, vWPosF7.y);
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42,0.5,0.48), wet);
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16,1.1,0.98), sun);
             }`);
    };
    mat.needsUpdate = true;
    return mat;
}
weatherByHeight(M.hull);
weatherByHeight(M.hullDk);

// ── the ornamented stern: the galleon's "face" — framed stern windows with
// glass, a gilt name-board, taffrail + counter moldings, and quarter galleries
// at the corners. Mounted on the raked transom at the stern (z=-7). ──
const Transom: React.FC = () => {
    const xs = [-0.86, 0, 0.86];
    const winW = 0.46, winH = 0.5, winY = 0.62;
    return (
        <group position={[0, 0, -7.0]} rotation={[0.1, 0, 0]}>
            {/* counter molding below the windows + taffrail across the top */}
            <mesh position={[0, 0.30, -0.04]} material={M.rail}><boxGeometry args={[3.0, 0.13, 0.14]} /></mesh>
            <mesh position={[0, 1.02, -0.02]} material={M.rail}><boxGeometry args={[2.9, 0.15, 0.18]} /></mesh>
            {/* gilt name-board */}
            <mesh position={[0, 0.92, -0.07]} material={M.gold}><boxGeometry args={[1.9, 0.12, 0.03]} /></mesh>
            {/* three framed stern windows */}
            {xs.map((x, i) => (
                <group key={i} position={[x, winY, 0]}>
                    {/* glass deeply recessed; proud 4-piece cased frame */}
                    <mesh position={[0, 0, -0.14]} material={M.glass}><boxGeometry args={[winW, winH, 0.03]} /></mesh>
                    <mesh position={[0, 0, -0.11]} material={M.rail}><boxGeometry args={[0.03, winH, 0.03]} /></mesh>
                    <mesh position={[0, 0, -0.11]} material={M.rail}><boxGeometry args={[winW, 0.03, 0.03]} /></mesh>
                    {([[0, winH / 2 + 0.03, winW + 0.12, 0.07], [0, -winH / 2 - 0.03, winW + 0.12, 0.07], [-winW / 2 - 0.04, 0, 0.07, winH + 0.12], [winW / 2 + 0.04, 0, 0.07, winH + 0.12]] as const).map(([cx, cy, w, h], k) => (
                        <mesh key={k} position={[cx, cy, -0.06]} material={M.giltTrim}><boxGeometry args={[w, h, 0.06]} /></mesh>
                    ))}
                </group>
            ))}
            {/* quarter galleries (corner turrets with a little window + gilt cap) */}
            {[-1, 1].map((s) => (
                <group key={s} position={[s * 1.42, 0.6, 0.12]}>
                    <mesh material={M.hull}><cylinderGeometry args={[0.2, 0.24, 0.8, 10]} /></mesh>
                    <mesh position={[0, 0, -0.18]} material={M.glass}><boxGeometry args={[0.2, 0.36, 0.05]} /></mesh>
                    <mesh position={[0, 0.46, 0]} material={M.gold}><coneGeometry args={[0.24, 0.22, 10]} /></mesh>
                    <mesh position={[0, 0.27, 0]} material={M.gold}><cylinderGeometry args={[0.23, 0.21, 0.06, 10]} /></mesh>
                </group>
            ))}
        </group>
    );
};

// a gently sagging rope (catenary) between two points, as tube geometry
function sagTube(a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.02): THREE.TubeGeometry {
    const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, r, 5);
}

// ── standing rig: a mainstay between the mastheads and stays fore and aft, with
// a little catenary sag so the cordage reads as rope under its own weight. ──
const Stays: React.FC = () => {
    const geos = useMemo(() => {
        const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
        return [
            sagTube(v(0, 5.4, -1), v(0, 4.6, 4), 0.35, 0.022),      // mainstay (mast to mast)
            sagTube(v(0, 6.2, -1), v(0, 1.4, -6.4), 0.3, 0.022),    // main backstay to the stern
            sagTube(v(0.13, 6.0, -1), v(2.4, 1.2, -3.2), 0.25),     // running backstays
            sagTube(v(-0.13, 6.0, -1), v(-2.4, 1.2, -3.2), 0.25),
        ];
    }, []);
    return <group>{geos.map((g, i) => <mesh key={i} geometry={g} material={M.rope} />)}</group>;
};

// a straight tube between two points (props for a unit-cylinder mesh)
function tube(a: THREE.Vector3, b: THREE.Vector3): { pos: [number, number, number]; quat: THREE.Quaternion; len: number } {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { pos: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], quat, len };
}

// ── ratline shrouds: a fan of shroud ropes from the channel (rail) up to the
// masthead, with horizontal ratline rungs forming the climbable rope ladder ──
const RatlineShrouds: React.FC<{ side: number; railX: number; railY: number; baseZ: number; spread: number; topY: number; topZ: number; count: number }>
    = ({ side, railX, railY, baseZ, spread, topY, topZ, count }) => {
        const { shrouds, rungs, deadeyes } = useMemo(() => {
            const top = new THREE.Vector3(side * 0.13, topY, topZ);
            const anchors: THREE.Vector3[] = [];
            for (let i = 0; i < count; i++) {
                const f = count > 1 ? i / (count - 1) : 0.5;
                anchors.push(new THREE.Vector3(side * railX, railY, baseZ + (f - 0.5) * spread));
            }
            const shrouds = anchors.map((a) => tube(a, top));
            const rungs: ReturnType<typeof tube>[] = [];
            const H = 8;
            for (let h = 1; h <= H; h++) {
                const t = (h / (H + 1)) * 0.82;            // stop before they converge
                for (let i = 0; i < count - 1; i++) {
                    rungs.push(tube(anchors[i].clone().lerp(top, t), anchors[i + 1].clone().lerp(top, t)));
                }
            }
            return { shrouds, rungs, deadeyes: anchors };
        }, [side, railX, railY, baseZ, spread, topY, topZ, count]);
        return (
            <group>
                {shrouds.map((s, i) => (
                    <mesh key={'s' + i} position={s.pos} quaternion={s.quat} material={M.rope}><cylinderGeometry args={[0.016, 0.016, s.len, 5]} /></mesh>
                ))}
                {rungs.map((s, i) => (
                    <mesh key={'r' + i} position={s.pos} quaternion={s.quat} material={M.rope}><cylinderGeometry args={[0.008, 0.008, s.len, 4]} /></mesh>
                ))}
                {deadeyes.map((d, i) => (
                    <mesh key={'d' + i} position={[d.x, d.y - 0.06, d.z]} material={M.barrel}><sphereGeometry args={[0.05, 8, 6]} /></mesh>
                ))}
            </group>
        );
    };

// ── deck furniture (mast partners, grated hatch, capstan) — all on the centre
// lane (x≈0), which the brain keeps clear of puddles, so it never blocks the
// mopping gameplay. ──
const DeckFurniture: React.FC = () => {
    const boatGeo = useMemo(() => buildHullGeometry(), []);
    return (
    <group>
        {/* mast partner collars + a ring of belaying pins (pin rail) */}
        {[-1, 4].map((z) => (
            <group key={'mp' + z} position={[0, 0, z]}>
                <mesh position={[0, 0.11, 0]} material={M.rail}><cylinderGeometry args={[0.32, 0.4, 0.2, 8]} /></mesh>
                {Array.from({ length: 8 }).map((_, i) => {
                    const a = (i / 8) * Math.PI * 2;
                    return <mesh key={i} position={[Math.cos(a) * 0.43, 0.2, Math.sin(a) * 0.43]} material={M.rail}><cylinderGeometry args={[0.022, 0.022, 0.22, 6]} /></mesh>;
                })}
            </group>
        ))}
        {/* ship's boat stowed keel-up on skid BOOMS above head height (amidships),
            so the player walks underneath it — no deck obstruction */}
        <group position={[0, 1.78, 2.2]}>
            <mesh geometry={boatGeo} scale={[0.17, 0.16, 0.17]} rotation={[Math.PI, 0, 0]} material={M.plank} />
            {[-1.4, 1.4].map((z) => (
                <mesh key={'skid' + z} position={[0, -0.05, z]} material={M.rail}><boxGeometry args={[1.1, 0.12, 0.14]} /></mesh>
            ))}
            {/* the stanchions holding the booms up off the deck */}
            {[[-0.5, -1.4], [0.5, -1.4], [-0.5, 1.4], [0.5, 1.4]].map(([px, pz], i) => (
                <mesh key={'st' + i} position={[px, -0.95, pz]} material={M.mast}><cylinderGeometry args={[0.05, 0.05, 1.8, 6]} /></mesh>
            ))}
        </group>
        {/* companionway (deck hatch house with a slanted lid) aft of the main mast */}
        <group position={[0, 0.0, -3.1]}>
            <mesh position={[0, 0.22, 0]} material={M.plankDk}><boxGeometry args={[0.74, 0.44, 0.66]} /></mesh>
            <mesh position={[0, 0.46, 0.05]} rotation={[-0.35, 0, 0]} material={M.rail}><boxGeometry args={[0.78, 0.05, 0.6]} /></mesh>
        </group>
        {/* grated cargo hatch with a raised coaming */}
        <group position={[0, 0.06, 1.2]}>
            <mesh position={[0, 0.04, 0]} material={M.rail}><boxGeometry args={[1.04, 0.16, 1.24]} /></mesh>
            <mesh position={[0, 0.02, 0]} material={M.hat}><boxGeometry args={[0.86, 0.06, 1.06]} /></mesh>
            {[-0.36, -0.18, 0, 0.18, 0.36].map((x) => (
                <mesh key={'gx' + x} position={[x, 0.1, 0]} material={M.grate}><boxGeometry args={[0.05, 0.05, 1.06]} /></mesh>
            ))}
            {[-0.45, -0.225, 0, 0.225, 0.45].map((z) => (
                <mesh key={'gz' + z} position={[0, 0.1, z]} material={M.grate}><boxGeometry args={[0.86, 0.05, 0.05]} /></mesh>
            ))}
        </group>
        {/* capstan amidships — ribbed drum with staves, drumhead, pawl rim,
            inserted bars and a rope turn round the barrel */}
        <group position={[0, 0, 2.7]}>
            <mesh position={[0, 0.06, 0]} material={M.wheel}><cylinderGeometry args={[0.34, 0.37, 0.12, 12]} /></mesh>
            <mesh position={[0, 0.37, 0]} material={M.barrel}><cylinderGeometry args={[0.24, 0.3, 0.56, 12]} /></mesh>
            {Array.from({ length: 10 }).map((_, i) => { const a = (i / 10) * Math.PI * 2; return (
                <mesh key={'sv' + i} position={[Math.cos(a) * 0.28, 0.37, Math.sin(a) * 0.28]} material={M.wheel}><boxGeometry args={[0.05, 0.52, 0.08]} /></mesh>
            ); })}
            <mesh position={[0, 0.7, 0]} material={M.wheel}><cylinderGeometry args={[0.33, 0.26, 0.15, 12]} /></mesh>
            <mesh position={[0, 0.61, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[0.31, 0.022, 6, 16]} /></mesh>
            {[0, 1].map((i) => (
                <mesh key={'bar' + i} position={[0, 0.7, 0]} rotation={[0, i * Math.PI + 0.4, 0]} material={M.mast}><boxGeometry args={[1.5, 0.06, 0.08]} /></mesh>
            ))}
            {[0, 0.07, 0.14].map((dy, j) => (
                <mesh key={'rw' + j} position={[0, 0.3 + dy, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}><torusGeometry args={[0.31, 0.026, 6, 16]} /></mesh>
            ))}
        </group>
    </group>
    );
};

// ── the head rig at the bow: a triangular jib on the forestay, a bobstay
// loading the bowsprit, swept head rails and a small gilt figurehead. ──
const HeadRig: React.FC = () => {
    const jib = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const A = [0, 1.7, 9.5], B = [0, 3.5, 4.1], C = [0.18, 1.45, 5.4]; // tack, head, clew (slight belly)
        g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C], 3));
        g.setIndex([0, 1, 2]); g.computeVertexNormals();
        return g;
    }, []);
    const lines = useMemo(() => {
        const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
        return {
            bob: tube(v([0, 1.7, 9.5]), v([0, -0.45, 8.1])),       // bobstay: tip down to stem
            fore: tube(v([0, 1.7, 9.5]), v([0, 3.5, 4.1])),        // forestay: tip to foremast head
            rails: [-1, 1].map((s) => tube(v([s * 0.5, 1.0, 6.9]), v([s * 0.12, 0.78, 8.4]))),
        };
    }, []);
    return (
        <group>
            <mesh geometry={jib} material={M.sail} />
            {[lines.bob, lines.fore].map((l, i) => (
                <mesh key={'l' + i} position={l.pos} quaternion={l.quat} material={M.rope}><cylinderGeometry args={[0.012, 0.012, l.len, 5]} /></mesh>
            ))}
            {lines.rails.map((l, i) => (
                <mesh key={'hr' + i} position={l.pos} quaternion={l.quat} material={M.rail}><cylinderGeometry args={[0.05, 0.05, l.len, 6]} /></mesh>
            ))}
            {/* beakhead grating platform projecting forward at the bow */}
            <mesh position={[0, 0.86, 7.8]} rotation={[-0.18, 0, 0]} material={M.grate}><boxGeometry args={[0.7, 0.05, 1.1]} /></mesh>
            {[-0.28, 0, 0.28].map((x) => (
                <mesh key={'bk' + x} position={[x, 0.9, 7.8]} rotation={[-0.18, 0, 0]} material={M.rail}><boxGeometry args={[0.05, 0.04, 1.1]} /></mesh>
            ))}
            {/* catheads projecting from the bow corners */}
            {[-1, 1].map((s) => (
                <mesh key={'ct' + s} position={[s * 0.5, 1.0, 7.1]} rotation={[1.1, s * 0.3, 0]} material={M.rail}><boxGeometry args={[0.1, 0.7, 0.1]} /></mesh>
            ))}
            {/* hawse holes on the bow cheeks */}
            {[-1, 1].map((s) => (
                <mesh key={'hw' + s} position={[s * 0.42, 0.75, 7.3]} rotation={[0, s * 0.5, 0]} material={M.hat}><cylinderGeometry args={[0.07, 0.07, 0.1, 10]} /></mesh>
            ))}
            {/* gilt winged figurehead leaning out over the water */}
            <group position={[0, 0.5, 8.6]} rotation={[0.55, 0, 0]}>
                <mesh material={M.gold}><cylinderGeometry args={[0.08, 0.13, 0.5, 8]} /></mesh>
                <mesh position={[0, 0.33, 0.05]} material={M.gold}><sphereGeometry args={[0.1, 10, 8]} /></mesh>
                {[-1, 1].map((s) => (
                    <mesh key={s} position={[s * 0.13, 0.05, -0.04]} rotation={[0.5, 0, s * 0.8]} material={M.gold}><coneGeometry args={[0.05, 0.42, 6]} /></mesh>
                ))}
                <mesh position={[0, -0.3, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={M.gold}><torusGeometry args={[0.1, 0.04, 6, 12]} /></mesh>
            </group>
        </group>
    );
};

// ── the stern deckhouse / quarterdeck cabin (the "galpão") — a planked cabin
// with a door, windows and gilt trim, just forward of the helm. ──
const SternCabin: React.FC = () => (
    <group position={[0, 0, -5.9]}>
        <mesh position={[0, 0.62, 0]} material={M.plankDk}><boxGeometry args={[2.1, 1.24, 1.3]} /></mesh>
        <mesh position={[0, 1.32, 0]} material={M.rail}><boxGeometry args={[2.38, 0.12, 1.58]} /></mesh>
        {/* cornice drip-edge: a stepped overhang between wall and roof (proud, so
            it casts a shadow line instead of co-planar Z-fighting) */}
        <mesh position={[0, 1.23, 0]} material={M.plankDk}><boxGeometry args={[2.22, 0.07, 1.42]} /></mesh>
        {/* gilt belt molding + a lower wood rubbing strake + corner-post battens */}
        <mesh position={[0, 0.95, 0]} material={M.giltTrim}><boxGeometry args={[2.12, 0.05, 1.32]} /></mesh>
        <mesh position={[0, 0.22, 0]} material={M.rail}><boxGeometry args={[2.16, 0.08, 1.36]} /></mesh>
        {[-1.02, 1.02].map((x) => (
            <mesh key={'cp' + x} position={[x, 0.62, 0.66]} material={M.rail}><boxGeometry args={[0.07, 1.24, 0.07]} /></mesh>
        ))}
        {/* door (faces forward, toward the deck), recessed in a gilt frame: a
            planked dark-wood door with two raised panels, not a flat black void */}
        <mesh position={[0, 0.5, 0.63]} material={M.giltTrim}><boxGeometry args={[0.5, 0.92, 0.04]} /></mesh>
        <mesh position={[0, 0.5, 0.655]} material={M.wheel}><boxGeometry args={[0.42, 0.84, 0.05]} /></mesh>
        {/* raised panel frames + darker recessed centres = self-shadowed depth */}
        {[0.69, 0.31].map((y, i) => (
            <React.Fragment key={i}>
                <mesh position={[0, y, 0.682]} material={M.barrel}><boxGeometry args={[0.30, 0.30, 0.012]} /></mesh>
                <mesh position={[0, y, 0.686]} material={M.grate}><boxGeometry args={[0.22, 0.22, 0.012]} /></mesh>
            </React.Fragment>
        ))}
        <mesh position={[0.15, 0.5, 0.7]} material={M.gold}><sphereGeometry args={[0.035, 8, 6]} /></mesh>
        {/* windows flanking the door — glass deeply recessed behind a proud
            4-piece cased frame with a sill, so the wall thickness self-shadows */}
        {[-0.68, 0.68].map((x) => (
            <group key={x} position={[x, 0.74, 0.65]}>
                <mesh position={[0, 0, -0.1]} material={M.glass}><boxGeometry args={[0.42, 0.42, 0.03]} /></mesh>
                <mesh position={[0, 0, -0.08]} material={M.rail}><boxGeometry args={[0.03, 0.42, 0.03]} /></mesh>
                <mesh position={[0, 0, -0.08]} material={M.rail}><boxGeometry args={[0.42, 0.03, 0.03]} /></mesh>
                {([[0, 0.25, 0.5, 0.08], [0, -0.25, 0.5, 0.08], [-0.25, 0, 0.08, 0.58], [0.25, 0, 0.08, 0.58]] as const).map(([cx, cy, w, h], k) => (
                    <mesh key={k} position={[cx, cy, 0.03]} material={M.giltTrim}><boxGeometry args={[w, h, 0.07]} /></mesh>
                ))}
                <mesh position={[0, -0.28, 0.06]} rotation={[-0.4, 0, 0]} material={M.rail}><boxGeometry args={[0.54, 0.05, 0.13]} /></mesh>
            </group>
        ))}
    </group>
);

// ── reachable deck props (barrels, crates, rope coils, a bell) placed from the
// shared F7_DECK_PROPS list so the visuals match the colliders exactly. ──
const DeckProps: React.FC = () => (
    <group>
        {F7_DECK_PROPS.map((p, i) => {
            if (p.kind === 'barrel') return (
                <group key={i} position={[p.x, 0.34, p.z]}>
                    <mesh material={M.barrel}><cylinderGeometry args={[0.3, 0.26, 0.68, 12]} /></mesh>
                    <mesh position={[0, 0.19, 0]} material={M.iron}><torusGeometry args={[0.3, 0.022, 6, 16]} /></mesh>
                    <mesh position={[0, -0.19, 0]} material={M.iron}><torusGeometry args={[0.3, 0.022, 6, 16]} /></mesh>
                    <mesh position={[0, 0.35, 0]} material={M.barrel}><cylinderGeometry args={[0.24, 0.24, 0.03, 12]} /></mesh>
                </group>
            );
            if (p.kind === 'crate') return (
                <group key={i} position={[p.x, 0.28, p.z]} rotation={[0, p.rot ?? 0, 0]}>
                    <mesh material={M.plank}><boxGeometry args={[0.56, 0.56, 0.56]} /></mesh>
                    {/* corner battens */}
                    {[[-0.27, -0.27], [0.27, -0.27], [0.27, 0.27], [-0.27, 0.27]].map(([bx, bz], k) => (
                        <mesh key={k} position={[bx, 0, bz]} material={M.rail}><boxGeometry args={[0.05, 0.58, 0.05]} /></mesh>
                    ))}
                </group>
            );
            if (p.kind === 'rope') return (
                <group key={i} position={[p.x, 0.05, p.z]}>
                    {[0.22, 0.16, 0.1].map((r, j) => (
                        <mesh key={j} position={[0, j * 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}><torusGeometry args={[r, 0.035, 6, 16]} /></mesh>
                    ))}
                </group>
            );
            // ship's bell on a small frame
            return (
                <group key={i} position={[p.x, 0, p.z]}>
                    {[-0.18, 0.18].map((bx) => (
                        <mesh key={bx} position={[bx, 0.5, 0]} rotation={[0, 0, bx < 0 ? 0.18 : -0.18]} material={M.rail}><cylinderGeometry args={[0.03, 0.03, 1.0, 6]} /></mesh>
                    ))}
                    <mesh position={[0, 0.98, 0]} rotation={[0, 0, Math.PI / 2]} material={M.rail}><cylinderGeometry args={[0.03, 0.03, 0.5, 6]} /></mesh>
                    <mesh position={[0, 0.82, 0]} material={M.gold}><cylinderGeometry args={[0.02, 0.13, 0.22, 12, 1, true]} /></mesh>
                    <mesh position={[0, 0.7, 0]} material={M.gold}><sphereGeometry args={[0.04, 8, 6]} /></mesh>
                </group>
            );
        })}
    </group>
);

// ── bulwark carpentry: vertical frame timbers (futtock tops) standing proud of
// the inner planking every ~0.8m along the sheer, plus scupper slots at deck
// level — so the walls read as built timber, not a flat extruded ribbon. ──
const BulwarkFrames: React.FC = () => {
    const { frames, scuppers } = useMemo(() => {
        const frames: { x: number; y: number; z: number; h: number }[] = [];
        const scuppers: { x: number; z: number; y: number }[] = [];
        const N = 20, stern = -7.0, bow = 8.2;
        for (let i = 1; i < N; i++) {
            const t = i / N;
            const dy = deckYAt(t), ry = railYAt(t), hb = beamAt(t);
            const z = stern + (bow - stern) * t;
            const x = hb * 0.745;
            const h = ry - dy;
            if (h < 0.2) continue;
            for (const s of [-1, 1]) frames.push({ x: s * x, y: dy + h / 2, z, h });
            if (i % 4 === 0) for (const s of [-1, 1]) scuppers.push({ x: s * hb * 0.78, z, y: dy + 0.05 });
        }
        return { frames, scuppers };
    }, []);
    return (
        <group>
            {frames.map((f, i) => (
                <mesh key={'fr' + i} position={[f.x, f.y, f.z]} material={M.rail}><boxGeometry args={[0.09, f.h, 0.13]} /></mesh>
            ))}
            {scuppers.map((s, i) => (
                <mesh key={'sc' + i} position={[s.x, s.y, s.z]} material={M.caulk}><boxGeometry args={[0.12, 0.09, 0.2]} /></mesh>
            ))}
        </group>
    );
};

// ── fake AO contact shadows: a soft dark blob on the deck under every vertical
// prop so nothing floats (the cheap grounding the critic demanded). ──
const _contactTex = makeContactShadow();
const ContactShadows: React.FC = () => {
    const blobs = useMemo(() => {
        const arr: { x: number; z: number; r: number }[] = [
            { x: 0, z: -1, r: 0.5 }, { x: 0, z: 4, r: 0.42 },     // masts
            { x: 0, z: 2.7, r: 0.42 },                            // capstan
            { x: -0.95, z: -5.9, r: 0.85 }, { x: 0.95, z: -5.9, r: 0.85 }, // deckhouse (two tighter blobs)
            { x: 0, z: 1.2, r: 0.62 }, { x: 0, z: -3.1, r: 0.46 },// hatch, companionway
        ];
        for (const p of F7_DECK_PROPS) arr.push({ x: p.x, z: p.z, r: p.kind === 'rope' ? 0.26 : p.kind === 'bell' ? 0.24 : 0.36 });
        return arr;
    }, []);
    return (
        <group>
            {blobs.map((b, i) => (
                <mesh key={i} position={[b.x, deckYAt((b.z + 7.0) / 15.2) + 0.012, b.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
                    <planeGeometry args={[b.r * 2, b.r * 2]} />
                    <meshBasicMaterial map={_contactTex} transparent depthWrite={false} opacity={0.8} polygonOffset polygonOffsetFactor={-2} />
                </mesh>
            ))}
        </group>
    );
};

// ── the static ship hull + deck + masts (no per-frame logic) ──
const ShipBody: React.FC = () => {
    // hull + deck + rail caps are ALL MODELLED IN C++ (floor7_geo.cpp → WASM):
    // the deck and rails sample the same sheer/beam curves as the hull, so the
    // whole ship sweeps together. JS only uploads the buffers. Plus a thin spray
    // band hugging the waterline.
    const { hullGeo, deckGeo, railGeo, foamGeo, waleHi, waleLo, bootGeo, innerGeo } = useMemo(() => {
        const hull = buildHullGeometry();
        const deck = buildDeckGeometry();
        const rail = buildRailGeometry();
        const wHi = buildWaleGeometry(0.74, 0.07, 0.09);   // below the gunports / deck edge
        const wLo = buildWaleGeometry(0.52, 0.06, 0.08);   // at the turn of the topside
        const boot = buildWaleGeometry(0.45, 0.015, 0.07); // boot-top stripe at the waterline
        const inner = buildInnerWallGeometry(0.72);         // inboard bulwark face (real thickness)
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
        return { hullGeo: hull, deckGeo: deck, railGeo: rail, foamGeo: foam, waleHi: wHi, waleLo: wLo, bootGeo: boot, innerGeo: inner };
    }, []);
    return (
        <group>
            {/* hull — generated in C++ (sheer + tumblehome + raked stem + bulwarks),
                double-sided so the inner planking shows */}
            <mesh geometry={hullGeo} position={[0, 0, 0]} material={M.hull} />
            {/* deck surface (C++ sheer curve) + fore-aft caulk seams + king plank */}
            <mesh geometry={deckGeo} material={M.plankDk} />
            <mesh geometry={buildDeckSeams()} material={M.caulk} renderOrder={1} />
            <mesh geometry={deckGeo} scale={[0.06, 1, 1]} position={[0, 0.004, 0]} material={M.plank} />
            {/* inboard bulwark face — gives the bulwark real timber thickness */}
            <mesh geometry={innerGeo} material={M.plank} />
            {/* rail caps swept along the sheer (C++ curve) */}
            <mesh geometry={railGeo} material={M.rail} />
            {/* bulwark frame timbers + scuppers + the perimeter waterway beam */}
            <BulwarkFrames />
            <mesh geometry={buildWaterwayGeometry()} material={M.rail} />
            {/* wales — proud rubbing-strakes laid on the C++ hull surface */}
            <mesh geometry={waleHi} material={M.hullDk} />
            <mesh geometry={waleLo} material={M.hullDk} />
            {/* boot-top stripe marking the load waterline (kills the bathtub look) */}
            <mesh geometry={bootGeo} material={M.bootTop} />
            {/* ornamented stern (windows, galleries, gilt) */}
            <Transom />
            {/* deck furniture on the puddle-free centre lane */}
            <DeckFurniture />
            {/* the stern deckhouse / quarterdeck cabin */}
            <SternCabin />
            {/* reachable deck props (barrels/crates/ropes/bell) — match colliders */}
            <DeckProps />
            {/* fake AO contact shadows grounding the props */}
            <ContactShadows />
            {/* thin spray band at the waterline */}
            <mesh geometry={foamGeo} position={[0, -0.66, 0]} material={M.foam} renderOrder={2} />
            {/* main mast + yard + sail + flag + crow's nest */}
            <group position={[0, 0, -1]}>
                <mesh position={[0, 3.4, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.11, 0.23, 6.8, 12]} />
                </mesh>
                {/* woolding (rope bands) on the lower mast */}
                {[0.55, 0.95, 1.35, 1.75].map((y, i) => (
                    <mesh key={'wd' + i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}><torusGeometry args={[0.215 - i * 0.004, 0.024, 6, 14]} /></mesh>
                ))}
                {/* mast wedges ringing the deck partners */}
                {Array.from({ length: 8 }).map((_, i) => { const a = (i / 8) * Math.PI * 2; return (
                    <mesh key={'wg' + i} position={[Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25]} rotation={[0, -a, 0.14]} material={M.wheel}><boxGeometry args={[0.09, 0.36, 0.17]} /></mesh>
                ); })}
                <mesh position={[0, 5.2, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.08, 0.08, 4.6, 8]} />
                </mesh>
                <mesh position={[0, 3.45, 0.06]} geometry={_mainSailGeo} material={M.sail} />
                {/* foot-rope slung under the main yard */}
                <mesh position={[0, 5.05, 0.04]} rotation={[0, 0, Math.PI / 2]} material={M.rope}><cylinderGeometry args={[0.012, 0.012, 4.3, 5]} /></mesh>
                {/* a row of reef-point ties across the course */}
                {[-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8].map((rx) => (
                    <mesh key={'rf' + rx} position={[rx, 4.25, 0.16]} material={M.rope}><cylinderGeometry args={[0.008, 0.008, 0.16, 4]} /></mesh>
                ))}
                {/* crow's nest */}
                <mesh position={[0, 6.0, 0]} material={M.rail}><cylinderGeometry args={[0.34, 0.28, 0.4, 10, 1, true]} /></mesh>
                <mesh position={[0, 5.8, 0]} material={M.rail}><cylinderGeometry args={[0.32, 0.32, 0.04, 10]} /></mesh>
                <Flag y={6.7} />
            </group>
            {/* foremast */}
            <group position={[0, 0, 4]}>
                <mesh position={[0, 2.6, 0]} material={M.mast}>
                    <cylinderGeometry args={[0.09, 0.18, 5.2, 12]} />
                </mesh>
                {[0.5, 0.85, 1.2].map((y, i) => (
                    <mesh key={'fwd' + i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}><torusGeometry args={[0.17 - i * 0.004, 0.02, 6, 14]} /></mesh>
                ))}
                {Array.from({ length: 8 }).map((_, i) => { const a = (i / 8) * Math.PI * 2; return (
                    <mesh key={'fwg' + i} position={[Math.cos(a) * 0.2, 0.18, Math.sin(a) * 0.2]} rotation={[0, -a, 0.14]} material={M.wheel}><boxGeometry args={[0.07, 0.3, 0.14]} /></mesh>
                ); })}
                <mesh position={[0, 3.7, 0]} rotation={[0, 0, Math.PI / 2]} material={M.mast}>
                    <cylinderGeometry args={[0.07, 0.07, 3.4, 8]} />
                </mesh>
                <mesh position={[0, 2.25, 0.05]} geometry={_foreSailGeo} material={M.sail} />
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
            {/* standing rig: mainstay + fore/aft stays with catenary sag */}
            <Stays />
            {/* bowsprit + head rig (jib, stays, head rails, figurehead) */}
            <mesh position={[0, 0.95, 8.5]} rotation={[0.5, 0, 0]} material={M.mast}>
                <cylinderGeometry args={[0.08, 0.13, 3.2, 8]} />
            </mesh>
            <HeadRig />


            {/* ratline shrouds (rope ladders) — main mast + foremast, both sides */}
            {[-1, 1].map((s) => (
                <RatlineShrouds key={'ms' + s} side={s} railX={2.55} railY={0.55} baseZ={-1.0} spread={1.7} topY={5.0} topZ={-1.0} count={4} />
            ))}
            {[-1, 1].map((s) => (
                <RatlineShrouds key={'fs' + s} side={s} railX={2.3} railY={0.5} baseZ={4.0} spread={1.3} topY={3.6} topZ={4.0} count={3} />
            ))}

            {/* cannons at the gunwales, pointing out to sea */}
            {[[2.55, -2.5, 1], [-2.55, 1.5, -1], [2.55, 0.5, 1]].map(([x, z, s], i) => (
                <group key={'cn' + i} position={[x, 0.32, z]} rotation={[0, (s as number) * Math.PI / 2, 0]}>
                    {/* tapered barrel (thin muzzle to fat breech) + reinforcing rings */}
                    <mesh rotation={[0, 0, Math.PI / 2]} material={M.cannon}><cylinderGeometry args={[0.085, 0.13, 0.88, 16]} /></mesh>
                    {[0.0, 0.3, -0.28].map((bx, k) => (
                        <mesh key={k} position={[bx, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={M.cannon}><torusGeometry args={[0.105 - Math.abs(bx) * 0.05, 0.018, 6, 14]} /></mesh>
                    ))}
                    {/* dark muzzle bore + breech cascabel */}
                    <mesh position={[-0.46, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={M.hat}><cylinderGeometry args={[0.06, 0.06, 0.06, 12]} /></mesh>
                    <mesh position={[0.46, 0, 0]} material={M.cannon}><sphereGeometry args={[0.07, 10, 8]} /></mesh>
                    <mesh position={[-0.1, -0.16, 0]} material={M.wheel}><boxGeometry args={[0.5, 0.22, 0.36]} /></mesh>
                    {[-0.18, 0.18].map((wz) => (
                        <mesh key={wz} position={[-0.1, -0.28, wz]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><cylinderGeometry args={[0.1, 0.1, 0.05, 10]} /></mesh>
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
// the captain — now RIGGED into pivot groups (hips, shoulders, neck, jaw, eye)
// so the parent useFrame can drive a peg-leg walk cycle, jaw flap, blink and
// head-tracking instead of a sliding statue.
interface CaptainRig {
    legL: React.RefObject<THREE.Group>; legR: React.RefObject<THREE.Group>;
    armL: React.RefObject<THREE.Group>; armR: React.RefObject<THREE.Group>;
    head: React.RefObject<THREE.Group>; jaw: React.RefObject<THREE.Group>;
    eye: React.RefObject<THREE.Mesh>;
    // cloth + grip that follow-through on stride / deck roll (secondary motion).
    // The hem and finger are 2-bone chains (each lower joint lags the one above)
    // so cloth bends along its length and fingers curl mid-segment, not rigidly.
    coatHem: React.RefObject<THREE.Group>; coatHem2: React.RefObject<THREE.Group>;
    sash: React.RefObject<THREE.Group>;
    feather: React.RefObject<THREE.Group>;
    gripR: React.RefObject<THREE.Group>; gripR2: React.RefObject<THREE.Group>;
}
const Captain = React.forwardRef<THREE.Group, { rig: CaptainRig }>(({ rig }, ref) => (
    <group ref={ref}>
        {/* LEFT booted leg — breeches THIGH (mass) over a boot, hip pivot at y=0.62 */}
        <group ref={rig.legL} position={[-0.13, 0.62, 0]}>
            <mesh position={[0, -0.1, 0]} material={M.bootTop}><cylinderGeometry args={[0.135, 0.105, 0.34, 12]} /></mesh>
            <mesh position={[0, -0.36, 0]} material={M.boot}><cylinderGeometry args={[0.105, 0.12, 0.5, 12]} /></mesh>
            <mesh position={[0, -0.58, 0.05]} material={M.boot}><boxGeometry args={[0.18, 0.12, 0.34]} /></mesh>
            {/* polished fold-over boot cuff */}
            <mesh position={[0, -0.2, 0]} material={M.boot}><cylinderGeometry args={[0.155, 0.12, 0.13, 12]} /></mesh>
        </group>
        {/* RIGHT peg leg — a real thigh above, the peg below the knee (the gag) */}
        <group ref={rig.legR} position={[0.13, 0.62, 0]}>
            <mesh position={[0, -0.12, 0]} material={M.bootTop}><cylinderGeometry args={[0.125, 0.09, 0.34, 12]} /></mesh>
            <mesh position={[0, -0.36, 0]} material={M.wheel}><cylinderGeometry args={[0.05, 0.08, 0.42, 10]} /></mesh>
            <mesh position={[0, -0.58, 0]} material={M.wheel}><cylinderGeometry args={[0.085, 0.065, 0.1, 10]} /></mesh>
        </group>

        {/* long coat — flared skirt as a 2-BONE cloth chain: an upper panel that
            swings from the waist, and a lower hem nested at its base that lags
            further, so the skirt bends along its length instead of as a rigid bell */}
        <group ref={rig.coatHem} position={[0, 1.05, 0]}>
            {/* waistband ring */}
            <mesh position={[0, -0.04, 0]} material={M.coat}><cylinderGeometry args={[0.255, 0.275, 0.13, 16]} /></mesh>
            {/* OPEN frock-coat skirt: separate hanging panels with a front-centre
                VENT, so the breeches + boots show through instead of a closed cone */}
            <group ref={rig.coatHem2} position={[0, -0.1, 0]}>
                {/* a hem cross-piece behind the vent so no black void shows through */}
                <mesh position={[0, -0.42, 0.12]} material={M.coatDk}><boxGeometry args={[0.32, 0.2, 0.05]} /></mesh>
                {/* side + back panels (thicker, so edges catch light not vanish) */}
                {[-0.62, 0.62, -1.45, 1.45, Math.PI - 0.6, Math.PI + 0.6].map((ang, i) => (
                    <mesh key={i} position={[Math.sin(ang) * 0.3, -0.27, Math.cos(ang) * 0.3]} rotation={[0.05, ang, 0]} material={M.coat}>
                        <boxGeometry args={[0.26, 0.58, 0.09]} />
                    </mesh>
                ))}
                {/* two front flaps — wider + swung toward centre so they nearly
                    meet (overlapping the waistcoat), not a canyon (gilt-edged) */}
                {[-1, 1].map((s) => (
                    <React.Fragment key={'ff' + s}>
                        <mesh position={[s * 0.15, -0.27, 0.29]} rotation={[0.05, s * 0.32, 0]} material={M.coat}><boxGeometry args={[0.26, 0.6, 0.09]} /></mesh>
                        <mesh position={[s * 0.045, -0.27, 0.345]} rotation={[0.05, s * 0.32, 0]} material={M.giltTrim}><boxGeometry args={[0.022, 0.6, 0.022]} /></mesh>
                    </React.Fragment>
                ))}
                {/* longer back tails */}
                {[-1, 1].map((s) => (
                    <mesh key={'t' + s} position={[s * 0.16, -0.34, -0.31]} rotation={[0.3, s * 0.1, 0]} material={M.coatDk}><boxGeometry args={[0.2, 0.64, 0.07]} /></mesh>
                ))}
            </group>
        </group>
        {/* breeches behind the open vent + a polished boot-top showing through */}
        <mesh position={[0, 0.66, 0.04]} material={M.bootTop}><boxGeometry args={[0.34, 0.34, 0.26]} /></mesh>
        {/* torso — broad chest tapering to a nipped waist (a V, not a tube) */}
        <mesh position={[0, 1.16, 0]} material={M.coat}><cylinderGeometry args={[0.285, 0.25, 0.44, 16]} /></mesh>
        <mesh position={[0, 0.95, 0.235]} rotation={[0.05, 0, 0]} material={M.coatDk}><boxGeometry args={[0.30, 0.95, 0.04]} /></mesh>
        {[1.30, 1.16, 1.02, 0.88].map((y, i) => (
            <React.Fragment key={i}>
                <mesh position={[-0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
                <mesh position={[0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
            </React.Fragment>
        ))}
        <mesh position={[0, 1.33, 0]} material={M.coatDk}><cylinderGeometry args={[0.21, 0.16, 0.12, 14]} /></mesh>
        <group ref={rig.sash} position={[0, 1.30, 0]}>
            <mesh position={[0, -0.32, 0.04]} rotation={[0, 0, 0.55]} material={M.sash}><boxGeometry args={[0.11, 0.74, 0.44]} /></mesh>
        </group>
        <mesh position={[0, 0.74, 0]} material={M.boot}><cylinderGeometry args={[0.30, 0.32, 0.1, 16]} /></mesh>
        {/* big brass belt buckle */}
        <mesh position={[0, 0.74, 0.32]} rotation={[Math.PI / 2, 0, 0]} material={M.gold}><torusGeometry args={[0.058, 0.02, 8, 18]} /></mesh>
        <mesh position={[0, 0.74, 0.325]} material={M.gold}><boxGeometry args={[0.05, 0.05, 0.012]} /></mesh>
        {/* gold waistcoat showing in the open coat vent, with a button row */}
        <mesh position={[0, 0.92, 0.2]} rotation={[0.05, 0, 0]} material={M.sash}><boxGeometry args={[0.24, 0.4, 0.04]} /></mesh>
        {[1.0, 0.9, 0.8].map((y, i) => (
            <mesh key={'wb' + i} position={[0, y, 0.225]} material={M.gold}><sphereGeometry args={[0.016, 8, 6]} /></mesh>
        ))}

        {/* SHOULDER YOKE + deltoid caps — broaden the bottle-shoulder silhouette
            into a barrel chest, with the coat draping over real shoulder mass */}
        <mesh position={[0, 1.28, 0.02]} rotation={[0, 0, Math.PI / 2]} material={M.coat}><cylinderGeometry args={[0.155, 0.155, 0.62, 16]} /></mesh>
        {[-1, 1].map((s) => (
            <mesh key={'dl' + s} position={[s * 0.31, 1.2, 0.04]} material={M.coat}><sphereGeometry args={[0.135, 12, 10]} /></mesh>
        ))}
        {/* gilt lapel edging down the front placket (FIX: break the flat coat) */}
        {[-1, 1].map((s) => (
            <mesh key={'lp' + s} position={[s * 0.14, 0.98, 0.247]} rotation={[0.05, 0, s * 0.06]} material={M.giltTrim}><boxGeometry args={[0.022, 0.92, 0.02]} /></mesh>
        ))}

        {/* ARMS — shoulder pivots at y=1.18 */}
        <group ref={rig.armL} position={[-0.30, 1.18, 0.04]}>
            {/* upper arm -> elbow -> tapered forearm */}
            <mesh position={[0, -0.125, 0]} material={M.coat}><cylinderGeometry args={[0.09, 0.082, 0.25, 12]} /></mesh>
            <mesh position={[0, -0.26, 0.01]} material={M.coat}><sphereGeometry args={[0.083, 10, 8]} /></mesh>
            <mesh position={[0, -0.37, 0.025]} material={M.coat}><cylinderGeometry args={[0.078, 0.068, 0.22, 12]} /></mesh>
            {/* big turn-back cuff, flared wider than the sleeve + gold band */}
            <mesh position={[0, -0.46, 0.04]} material={M.coatDk}><cylinderGeometry args={[0.115, 0.082, 0.14, 12]} /></mesh>
            <mesh position={[0, -0.525, 0.04]} material={M.gold}><cylinderGeometry args={[0.118, 0.112, 0.03, 12]} /></mesh>
            {/* white lace cuff ruffle + a blocky mitt with a thumb (not a nub) */}
            <mesh position={[0, -0.5, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.cloth}><torusGeometry args={[0.1, 0.026, 6, 16]} /></mesh>
            <mesh position={[0, -0.585, 0.06]} material={M.skin}><boxGeometry args={[0.09, 0.052, 0.115]} /></mesh>
            <mesh position={[-0.054, -0.56, 0.07]} rotation={[0, 0, 0.55]} material={M.skin}><capsuleGeometry args={[0.018, 0.042, 3, 6]} /></mesh>
            {/* four fingers — match the right hand so he isn't one-fingered */}
            {[-0.036, -0.012, 0.012, 0.036].map((fx, i) => (
                <mesh key={'lf' + i} position={[fx, -0.625, 0.105]} rotation={[0.55, 0, 0]} material={M.skin}><capsuleGeometry args={[0.016, 0.05, 3, 6]} /></mesh>
            ))}
        </group>
        <group ref={rig.armR} position={[0.30, 1.18, 0.04]}>
            <mesh position={[0, -0.125, 0]} material={M.coat}><cylinderGeometry args={[0.09, 0.082, 0.25, 12]} /></mesh>
            <mesh position={[0, -0.26, 0.01]} material={M.coat}><sphereGeometry args={[0.083, 10, 8]} /></mesh>
            <mesh position={[0, -0.37, 0.025]} material={M.coat}><cylinderGeometry args={[0.078, 0.068, 0.22, 12]} /></mesh>
            <mesh position={[0, -0.46, 0.04]} material={M.coatDk}><cylinderGeometry args={[0.115, 0.082, 0.14, 12]} /></mesh>
            <mesh position={[0, -0.525, 0.04]} material={M.gold}><cylinderGeometry args={[0.118, 0.112, 0.03, 12]} /></mesh>
            <mesh position={[0, -0.5, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.cloth}><torusGeometry args={[0.1, 0.026, 6, 16]} /></mesh>
            {/* a fuller palm so the hand isn't a nub */}
            <mesh position={[0, -0.565, 0.06]} material={M.skin}><boxGeometry args={[0.092, 0.05, 0.1]} /></mesh>
            {/* fingers as a 2-KNUCKLE chain: proximal segments hinge at the
                palm, the nested distal segments curl further — so the grip
                closes around the wheel mid-finger when he takes the helm (ST_DONE) */}
            <group ref={rig.gripR} position={[0, -0.585, 0.10]}>
                {[-0.036, -0.012, 0.012, 0.036].map((fx, i) => (
                    <mesh key={i} position={[fx, 0, 0.018]} material={M.skin}><capsuleGeometry args={[0.017, 0.05, 3, 6]} /></mesh>
                ))}
                <group ref={rig.gripR2} position={[0, -0.025, 0.05]}>
                    {[-0.036, -0.012, 0.012, 0.036].map((fx, i) => (
                        <mesh key={i} position={[fx, 0, 0]} material={M.skin}><capsuleGeometry args={[0.015, 0.044, 3, 6]} /></mesh>
                    ))}
                </group>
                <mesh position={[-0.058, 0.012, -0.02]} rotation={[0, 0, 0.6]} material={M.skin}><capsuleGeometry args={[0.018, 0.055, 3, 6]} /></mesh>
            </group>
        </group>

        {/* neck (static) — a touch longer so the head isn't bolted to the chest */}
        <mesh position={[0, 1.42, 0]} material={M.skin}><cylinderGeometry args={[0.083, 0.1, 0.15, 12]} /></mesh>
        {/* standing coat collar — a high wrap open at the front, frames the beard */}
        <mesh position={[0, 1.5, -0.025]} rotation={[-0.22, 0, 0]} material={M.giltTrim}><cylinderGeometry args={[0.185, 0.14, 0.19, 16, 1, true, Math.PI * 0.34, Math.PI * 1.32]} /></mesh>
        <mesh position={[0, 1.49, -0.03]} rotation={[-0.22, 0, 0]} material={M.coatDk}><cylinderGeometry args={[0.165, 0.13, 0.17, 16, 1, true, Math.PI * 0.36, Math.PI * 1.28]} /></mesh>

        {/* HEAD group — neck pivot at y=1.42 (rotates to track the player) */}
        <group ref={rig.head} position={[0, 1.42, 0]}>
            {/* SKULL */}
            <mesh position={[0, 0.16, 0]} scale={[1, 1.06, 0.97]} material={M.skin}><sphereGeometry args={[0.185, 22, 20]} /></mesh>
            {/* hair skull-cap under the hat — no more bald temples/nape */}
            <mesh position={[0, 0.175, -0.012]} scale={[1.02, 1, 1.03]} material={M.hair}><sphereGeometry args={[0.182, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} /></mesh>
            {/* brow ridge — angled skin boxes that throw a shadow over the eyes */}
            {[-1, 1].map((s) => (
                <mesh key={'br' + s} position={[s * 0.075, 0.222, 0.158]} rotation={[0.18, 0, s * 0.16]} material={M.skin}><boxGeometry args={[0.09, 0.034, 0.07]} /></mesh>
            ))}
            {/* bushy eyebrows on the ridge */}
            {[-1, 1].map((s) => (
                <mesh key={'eb' + s} position={[s * 0.075, 0.23, 0.188]} rotation={[0, 0, s * -0.14]} material={M.hair}><boxGeometry args={[0.078, 0.02, 0.024]} /></mesh>
            ))}
            {/* cheekbones — ruddier weathered skin, catch the key light */}
            {[-1, 1].map((s) => (
                <mesh key={'ck' + s} position={[s * 0.122, 0.125, 0.12]} scale={[1, 0.8, 0.7]} material={M.skinR}><sphereGeometry args={[0.06, 10, 8]} /></mesh>
            ))}
            {/* LEFT working eye — recessed socket + a SMALLER white with a BIGGER
                iris (no more wall-eye), dropped under the brow so it reads sunken */}
            <mesh position={[-0.072, 0.184, 0.152]} scale={[1.15, 0.92, 0.55]} material={M.socket}><sphereGeometry args={[0.05, 12, 10]} /></mesh>
            <mesh ref={rig.eye} position={[-0.072, 0.184, 0.162]} scale={[1, 0.92, 0.7]} material={M.eyewhite}><sphereGeometry args={[0.03, 14, 12]} /></mesh>
            <mesh position={[-0.072, 0.184, 0.184]} material={M.iris}><sphereGeometry args={[0.022, 12, 10]} /></mesh>
            <mesh position={[-0.072, 0.184, 0.2]} material={M.hat}><sphereGeometry args={[0.01, 8, 8]} /></mesh>
            {/* RIGHT eye — a FLAT leather eyepatch disc flush to the socket (matched
                to the left eye's y/size, not a googly dome) + a strap up under the hat */}
            <mesh position={[0.072, 0.184, 0.176]} rotation={[Math.PI / 2, 0, 0.1]} material={M.boot}><cylinderGeometry args={[0.05, 0.05, 0.014, 16]} /></mesh>
            <mesh position={[0.072, 0.184, 0.185]} material={M.hat}><sphereGeometry args={[0.012, 8, 8]} /></mesh>
            <mesh position={[0.082, 0.30, 0.05]} rotation={[0.55, 0, 0.14]} material={M.boot}><boxGeometry args={[0.022, 0.3, 0.016]} /></mesh>
            {/* NOSE — bridge cone + bulbous ruddy tip + nostril wings */}
            <mesh position={[0, 0.178, 0.175]} rotation={[Math.PI / 2.3, 0, 0]} material={M.skin}><coneGeometry args={[0.046, 0.14, 8]} /></mesh>
            <mesh position={[0, 0.142, 0.2]} material={M.skinR}><sphereGeometry args={[0.03, 10, 8]} /></mesh>
            {[-1, 1].map((s) => (
                <mesh key={'no' + s} position={[s * 0.032, 0.135, 0.185]} material={M.skin}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
            ))}
            {/* mustache */}
            {[-1, 1].map((s) => (
                <mesh key={'ms' + s} position={[s * 0.055, 0.103, 0.168]} rotation={[0, 0, s * 0.6]} material={M.hair}><capsuleGeometry args={[0.022, 0.08, 3, 8]} /></mesh>
            ))}
            {/* full beard */}
            <mesh position={[0, 0.05, 0.075]} scale={[1.04, 1.05, 0.95]} material={M.beard}><sphereGeometry args={[0.168, 18, 16, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.62]} /></mesh>
            {[-1, 1].map((s) => (
                <mesh key={'bd' + s} position={[s * 0.155, 0.13, 0.04]} material={M.beard}><sphereGeometry args={[0.06, 10, 10]} /></mesh>
            ))}
            {/* beard LOCKS — cones around the lower rim break the smooth bib edge
                into a forked, characterful beard */}
            {[-0.5, -0.22, 0, 0.22, 0.5].map((a, i) => (
                <mesh key={'bl' + i} position={[Math.sin(a) * 0.13, -0.06 - (i === 2 ? 0.05 : 0), 0.085 + Math.cos(a) * 0.04]} rotation={[0.5, 0, a * 0.8]} material={M.beard}><coneGeometry args={[0.034, 0.13, 7]} /></mesh>
            ))}
            {/* a few thick hair locks at the temple/brow edge under the hat brim */}
            {[-1, 1].map((s) => (
                <mesh key={'hl' + s} position={[s * 0.165, 0.16, 0.06]} rotation={[0, 0, s * 0.4]} material={M.hair}><capsuleGeometry args={[0.026, 0.08, 3, 7]} /></mesh>
            ))}
            {/* QUEUE — a TAPERED tied ponytail down the nape (apex points down) */}
            <mesh position={[0, 0.0, -0.18]} rotation={[Math.PI - 0.28, 0, 0]} material={M.hair}><coneGeometry args={[0.052, 0.26, 9]} /></mesh>
            <mesh position={[0, 0.135, -0.16]} material={M.coatDk}><torusGeometry args={[0.034, 0.011, 6, 12]} /></mesh>
            {/* hairline lock clumps breaking the felt-cap edge at the brow/temples */}
            {[-0.13, -0.05, 0.05, 0.13].map((x, i) => (
                <mesh key={'hf' + i} position={[x, 0.305, 0.12]} material={M.hair}><sphereGeometry args={[0.042, 8, 7]} /></mesh>
            ))}
            {/* JAW group — chin hinge (flaps while talking) */}
            <group ref={rig.jaw} position={[0, 0.06, 0.04]}>
                <mesh position={[0, -0.08, 0.03]} material={M.beard}><coneGeometry args={[0.125, 0.26, 14]} /></mesh>
            </group>
            {/* TRICORNE */}
            <mesh position={[0, 0.37, 0]} material={M.hat}><cylinderGeometry args={[0.155, 0.175, 0.17, 18]} /></mesh>
            <mesh position={[0, 0.45, 0]} material={M.hat}><sphereGeometry args={[0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} /></mesh>
            {[0, 2.0944, 4.1888].map((ang, i) => (
                <group key={i} rotation={[0, ang, 0]}>
                    <mesh position={[0, 0.325, 0.20]} rotation={[-0.5, 0, 0]} material={M.hat}><boxGeometry args={[0.46, 0.035, 0.28]} /></mesh>
                    <mesh position={[0, 0.395, 0.335]} rotation={[-0.5, 0, 0]} material={M.gold}><boxGeometry args={[0.45, 0.02, 0.03]} /></mesh>
                </group>
            ))}
            {/* plume — whips with a lag off head/body motion */}
            <group ref={rig.feather} position={[-0.18, 0.39, 0.18]}>
                <mesh position={[0, 0.14, 0]} rotation={[0.2, 0, 0.5]} material={M.coat}><coneGeometry args={[0.04, 0.32, 8]} /></mesh>
            </group>
        </group>

        {/* cutlass at the hip (static) */}
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
    const capRig: CaptainRig = {
        legL: useRef<THREE.Group>(null), legR: useRef<THREE.Group>(null),
        armL: useRef<THREE.Group>(null), armR: useRef<THREE.Group>(null),
        head: useRef<THREE.Group>(null), jaw: useRef<THREE.Group>(null),
        eye: useRef<THREE.Mesh>(null),
        coatHem: useRef<THREE.Group>(null), coatHem2: useRef<THREE.Group>(null),
        sash: useRef<THREE.Group>(null),
        feather: useRef<THREE.Group>(null),
        gripR: useRef<THREE.Group>(null), gripR2: useRef<THREE.Group>(null),
    };
    const _capWorld = useRef(new THREE.Vector3());
    const _prevPP = useRef(new THREE.Vector3());
    const _vel = useRef(new THREE.Vector3());
    const _brushHeading = useRef(0); // last drag direction, held through slow passes
    // trailing cloth state (hem/sash/feather/grip) for follow-through lag
    const _cloth = useRef({ hemX: 0, hemZ: 0, hem2X: 0, hem2Z: 0, sashZ: 0, featX: 0, featZ: 0, grip: 0.3, grip2: 0.3, face: 0 });
    const _sfx = useRef({ held: 0, cleaned: 0, dialogue: 0, step: 0, scrub: 0, px: 0, pz: 0, drainHit: false, tideArmed: 0 });
    // suds particle pool (ship-local) for scrub juice
    const SUDS_N = 48;
    const sudsPts = useRef<THREE.Points>(null);
    const _suds = useRef({ vel: new Float32Array(SUDS_N * 3), life: new Float32Array(SUDS_N), head: 0 });
    const sudsGeo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(SUDS_N * 3); for (let i = 0; i < SUDS_N; i++) pos[i * 3 + 1] = -999;
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return g;
    }, []);
    const sudsBurst = (x: number, y: number, z: number) => {
        const d = _suds.current, pos = sudsGeo.attributes.position.array as Float32Array;
        for (let k = 0; k < 5; k++) {
            const i = d.head; d.head = (d.head + 1) % SUDS_N;
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
            const a = Math.random() * 6.283, sp = 0.4 + Math.random() * 0.7;
            d.vel[i * 3] = Math.cos(a) * sp; d.vel[i * 3 + 1] = 1.3 + Math.random() * 0.9; d.vel[i * 3 + 2] = Math.sin(a) * sp;
            d.life[i] = 0.45 + Math.random() * 0.3;
        }
    };
    const bucketRef = useRef<THREE.Group>(null);
    const sudsSurfRef = useRef<THREE.Mesh>(null);
    const _tideWarnRef = useRef(0);   // shared with the water shader for the surge
    const _tideDirRef = useRef(new THREE.Vector2(0, 0)); // dir to the at-risk puddle
    const handsRef = useRef<THREE.Group>(null);
    const brushRef = useRef<THREE.Group>(null);
    const leftHandRef = useRef<THREE.Group>(null);
    const islandRef = useRef<THREE.Group>(null);
    const elevatorRef = useRef<THREE.Group>(null);
    const puddleRefs = useRef<(THREE.Group | null)[]>([]);
    const brainRef = useRef<Floor7Brain | null>(null);
    const _local = useRef(new THREE.Vector3());
    const _pud = useRef<F7Puddle>({ x: 0, z: 0, r: 0, prog: 0, cell: new Float32Array(16).fill(1) });
    // previous-frame wetness per cell (6 puddles x 16), so we can catch the exact
    // wet->dry crossing and throw a fleck + scrub accent right where the brush bit.
    const _prevCells = useRef<Float32Array | null>(null);
    // per-puddle materials with a 4x4 wetness MASK TEXTURE: the fragment samples
    // the player's scrubbed-away cells and discards them, so the puddle erodes
    // directionally under the brush (texture lookup avoids dynamic array indexing).
    const puddleMats = useMemo(() => Array.from({ length: 6 }, () => {
        const data = new Uint8Array(16 * 4).fill(255);
        const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
        // LINEAR (not nearest) so the wetness mask interpolates: the puddle edge
        // and the scrubbed boundary read as a smooth organic shoreline, which we
        // then trim with a bright foam meniscus instead of a chunky pixel step.
        tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
        const m = new THREE.MeshPhysicalMaterial({ color: '#0d1a20', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, bumpMap: _puddleRipple, bumpScale: 0.06, transparent: true, opacity: 0.94, envMapIntensity: 1.2 });
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uCellTex = { value: tex };
            shader.vertexShader = 'varying vec2 vF7Uv;\n' + shader.vertexShader.replace(
                '#include <begin_vertex>', '#include <begin_vertex>\n vF7Uv = uv;');
            shader.fragmentShader = 'uniform sampler2D uCellTex;\nvarying vec2 vF7Uv;\n' + shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 {
                   float wet = texture2D(uCellTex, vF7Uv).r;
                   if (wet < 0.04) discard;
                   // foam meniscus 1: the receding shoreline under the brush — the
                   // band where the mask is mid-value glistens as it dries off.
                   float erodeRim = smoothstep(0.04, 0.30, wet) * (1.0 - smoothstep(0.30, 0.62, wet));
                   // foam meniscus 2: the static outer lip of the puddle disc.
                   float rad = length(vF7Uv - 0.5) * 2.0;
                   float outerRim = smoothstep(0.80, 1.0, rad);
                   float foam = clamp(max(erodeRim, outerRim * 0.65), 0.0, 1.0);
                   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.62, 0.68), foam * 0.85);
                   diffuseColor.a *= clamp(wet * 1.35, 0.0, 1.0);
                 }`);
        };
        (m as unknown as { _cellData: Uint8Array; _cellTex: THREE.DataTexture })._cellData = data;
        (m as unknown as { _cellData: Uint8Array; _cellTex: THREE.DataTexture })._cellTex = tex;
        return m;
    }), []);
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

    useFrame((state, dt) => {
        const b = brainRef.current;
        const ship = shipRef.current;
        if (!b || !ship) return;
        const t = state.clock.elapsedTime;

        // map player world pos into the ship's local frame, feed the brain
        ship.updateWorldMatrix(true, false);
        _local.current.copy(playerPositionRef.current);
        ship.worldToLocal(_local.current);
        b.tick(Math.min(dt, 0.05), _local.current.x, _local.current.y, _local.current.z, handleRef.current.interact);

        // ship rides the swell (heave + pitch + roll from the WASM)
        ship.position.y = b.heave();
        ship.rotation.x = b.pitch();
        ship.rotation.z = b.roll();

        // captain — rigged: peg-leg walk cycle, jaw flap, blink, head-track
        if (captainRef.current) {
            const c = b.captain();
            const walking = b.capWalking();
            const ph = t * 7.0;
            const lurch = walking ? Math.max(0, Math.sin(ph)) * 0.05 : 0;  // peg down-beat
            const breath = Math.sin(t * 1.1) * 0.011;                      // always-on chest rise
            captainRef.current.position.set(c.x, c.bob - lurch + breath, c.z);
            captainRef.current.rotation.y = c.face;
            captainRef.current.visible = b.elevFade() < 0.85;
            const { legL, legR, armL, armR, head, jaw, eye } = capRig;
            if (legL.current && legR.current && armL.current && armR.current) {
                if (walking) {
                    legL.current.rotation.x = Math.sin(ph) * 0.5;
                    legR.current.rotation.x = Math.sin(ph + Math.PI) * 0.42;
                    // lift the swinging foot off the deck (kills the skate)
                    legL.current.position.y = 0.62 + Math.max(0, Math.sin(ph)) * 0.07;
                    legR.current.position.y = 0.62 + Math.max(0, Math.sin(ph + Math.PI)) * 0.05;
                    armL.current.rotation.x = Math.sin(ph + Math.PI) * 0.4;
                    armR.current.rotation.x = Math.sin(ph) * 0.4;
                } else {
                    const idle = Math.sin(t * 1.6) * 0.05;
                    legL.current.rotation.x *= 0.8; legR.current.rotation.x *= 0.8;
                    legL.current.position.y = 0.62; legR.current.position.y = 0.62;
                    armL.current.rotation.x = idle; armR.current.rotation.x = -idle;
                    // weight-shift foot to foot so he isn't a frozen statue
                    const wsh = Math.sin(t * 0.8);
                    captainRef.current.position.x += wsh * 0.022;
                    captainRef.current.rotation.z = wsh * 0.02;
                }
            }
            if (jaw.current) {
                const dlg = b.dialogue();
                jaw.current.rotation.x = (dlg === 1 || dlg === 4 || dlg === 5) ? Math.abs(Math.sin(t * 9)) * 0.4 : 0;
            }
            if (eye.current) eye.current.scale.y = (t % 4.0 > 3.89) ? 0.06 : 0.85;
            if (head.current && captainRef.current.visible) {
                captainRef.current.updateMatrixWorld();
                _capWorld.current.copy(playerPositionRef.current);
                captainRef.current.worldToLocal(_capWorld.current);
                const yawTo = Math.max(-0.7, Math.min(0.7, Math.atan2(_capWorld.current.x, _capWorld.current.z)));
                head.current.rotation.y += (yawTo - head.current.rotation.y) * 0.1;
                head.current.rotation.x = Math.sin(t * 0.9) * 0.04;  // slow idle nod, always alive
                head.current.rotation.z = Math.sin(t * 0.7) * 0.025;
            }
            // ── secondary motion: cloth + grip trail the body (follow-through) ──
            {
                const cl = _cloth.current;
                const roll = b.roll(), pitch = b.pitch();
                // turn rate (how fast he's rotating) drives the hem/sash swinging out
                const turn = c.face - cl.face; cl.face = c.face;
                const strideX = walking ? Math.sin(ph) * 0.16 : 0;   // hem kicks with the peg-leg stride
                // targets, then a one-pole trail so the cloth lags the motion
                const hemXt = pitch * 1.1 + strideX + Math.sin(t * 1.1) * 0.02;
                const hemZt = -roll * 1.2 - turn * 2.2;
                const sashZt = -roll * 0.9 - turn * 1.6 + Math.sin(t * 1.3) * 0.03;
                const featXt = -pitch * 1.4 - strideX * 0.6 + Math.sin(t * 2.1) * 0.05;
                const featZt = roll * 1.5 + turn * 3.0;
                const k = Math.min(1, dt * 6);
                cl.hemX += (hemXt - cl.hemX) * k; cl.hemZ += (hemZt - cl.hemZ) * k;
                // lower hem CASCADES off the upper with extra lag + amplification,
                // so the skirt whips along its length (cloth chain, not a rigid bell)
                const k2 = Math.min(1, dt * 4);
                cl.hem2X += (cl.hemX * 1.25 - cl.hem2X) * k2; cl.hem2Z += (cl.hemZ * 1.25 - cl.hem2Z) * k2;
                cl.sashZ += (sashZt - cl.sashZ) * k;
                cl.featX += (featXt - cl.featX) * Math.min(1, dt * 9);
                cl.featZ += (featZt - cl.featZ) * Math.min(1, dt * 9);
                if (capRig.coatHem.current) { capRig.coatHem.current.rotation.x = cl.hemX; capRig.coatHem.current.rotation.z = cl.hemZ; }
                if (capRig.coatHem2.current) { capRig.coatHem2.current.rotation.x = cl.hem2X - cl.hemX; capRig.coatHem2.current.rotation.z = cl.hem2Z - cl.hemZ; }
                if (capRig.sash.current) capRig.sash.current.rotation.z = cl.sashZ;
                if (capRig.feather.current) { capRig.feather.current.rotation.x = cl.featX; capRig.feather.current.rotation.z = cl.featZ; }
                // fingers: relaxed normally, curl tight to grip the wheel at the helm;
                // the distal knuckle curls further and lags the proximal one
                const gripTo = b.state() === F7_STATE.DONE ? 1.15 : 0.35;
                cl.grip += (gripTo - cl.grip) * Math.min(1, dt * 4);
                cl.grip2 += (cl.grip - cl.grip2) * Math.min(1, dt * 3);   // distal lags the proximal
                if (capRig.gripR.current) capRig.gripR.current.rotation.x = cl.grip;
                // distal knuckle adds its OWN curl ON TOP of the proximal (it's a
                // child group), so the fingertip closes further than the base joint
                if (capRig.gripR2.current) capRig.gripR2.current.rotation.x = cl.grip2 * 0.8;
            }
        }
        // bucket
        if (bucketRef.current) {
            const bu = b.bucket();
            // when carried, the bucket follows the player with spring lag + sways
            // on the rolling deck (slosh) instead of snapping to a fixed offset
            const br = bucketRef.current, k = bu.held ? Math.min(1, dt * 9) : Math.min(1, dt * 16);
            const ty = bu.held ? 0.5 : 0.18;
            br.position.x += (bu.x - br.position.x) * k;
            br.position.z += (bu.z - br.position.z) * k;
            br.position.y += (ty - br.position.y) * k;
            br.rotation.z = bu.held ? -b.roll() * 1.3 + Math.sin(t * 3) * 0.04 : 0;
            br.rotation.x = bu.held ? b.pitch() * 1.0 : 0;
            const glow = (b.state() === F7_STATE.FETCH) ? 0.5 + 0.5 * Math.sin(performance.now() / 200) : 0;
            (M.cloth as THREE.MeshStandardMaterial).emissive.setRGB(glow * 0.4, glow * 0.4, glow * 0.2);
            // the soapy surface sinks as the water goes stale, and tints muddier
            if (sudsSurfRef.current) {
                sudsSurfRef.current.position.y = 0.04 + bu.water * 0.06;
                (M.sudsy as THREE.MeshPhysicalMaterial).color.setRGB(0.55 + bu.water * 0.26, 0.62 + bu.water * 0.27, 0.55 + bu.water * 0.35);
            }
        }
        // elevator dematerialises
        if (elevatorRef.current) {
            const f = b.elevFade();
            elevatorRef.current.visible = f > 0.01;
            elevatorRef.current.position.y = (1 - f) * 0.6;       // lifts as it fades
            elevatorRef.current.scale.setScalar(0.6 + f * 0.4);
            M.elev.opacity = f; M.elevTrim.opacity = f;
        }
        // puddles erode directionally: the disc stays full-size; the per-cell
        // wetness mask (driven from the brain) discards the scrubbed cells, and
        // the wet halo fades with overall progress.
        // TELEGRAPH: as a swell approaches (tideWarn 0..1) the wet halos surge and
        // shimmer — and the AT-RISK puddle (the one this swell will re-wet) pulses
        // far brighter, so the player sees not just THAT a swell is coming but WHERE.
        const warn = b.tideWarn();
        const tideT = b.tideTarget();
        const haloSurge = 1 + warn * (0.6 + 0.4 * Math.sin(t * 13));
        const targetPulse = 1 + warn * (2.4 + 1.6 * Math.sin(t * 9));
        for (let i = 0; i < b.npud; i++) {
            const g = puddleRefs.current[i];
            if (!g) continue;
            const p = b.puddle(i, _pud.current);
            g.scale.setScalar(Math.max(0.0001, p.r));
            g.position.set(p.x, 0.02, p.z);
            g.visible = p.prog < 0.995;
            const halo = g.children[0] as THREE.Mesh;
            const hm = halo.material as THREE.MeshBasicMaterial;
            const atRisk = i === tideT.idx;
            hm.opacity = 0.6 * (1 - p.prog) * (atRisk ? targetPulse : haloSurge);
            // the at-risk halo also flushes toward a cold spray-white as it pulses
            if (atRisk && warn > 0.02) hm.color.setRGB(0.18 + warn * 0.5, 0.42 + warn * 0.45, 0.5 + warn * 0.45);
            else hm.color.setRGB(0.039, 0.094, 0.11);
            if (p.cell) {
                const mm = puddleMats[i] as unknown as { _cellData: Uint8Array; _cellTex: THREE.DataTexture };
                if (!_prevCells.current) { _prevCells.current = new Float32Array(b.npud * 16); _prevCells.current.set(p.cell, i * 16); }
                const prev = _prevCells.current;
                for (let c = 0; c < 16; c++) {
                    const v = p.cell[c];
                    mm._cellData[c * 4] = Math.max(0, Math.min(255, v * 255));
                    // wet -> (mostly) dry crossing under the brush: pop a fleck at
                    // that cell's world spot and arm a scrub accent, so erosion is
                    // legible exactly where it happens (not on a blind metronome).
                    const pc = prev[i * 16 + c];
                    if (pc > 0.5 && v <= 0.5) {
                        const ci = c & 3, cj = c >> 2;
                        const cx = (ci * 0.5 - 0.75) * p.r, cy = (cj * 0.5 - 0.75) * p.r;
                        sudsBurst(p.x + cx, 0.1, p.z - cy);
                        _sfx.current.drainHit = true;
                    }
                    prev[i * 16 + c] = v;
                }
                mm._cellTex.needsUpdate = true;
            }
        }

        // first-person hands holding the scrub-brush — ride the camera, stroke
        // when scrubbing so the player is doing the cleaning, not watching it
        if (handsRef.current) {
            const cam = state.camera;
            handsRef.current.position.copy(cam.position);
            handsRef.current.quaternion.copy(cam.quaternion);
            handsRef.current.translateX(0.18); handsRef.current.translateY(-0.2); handsRef.current.translateZ(-0.34);
            handsRef.current.visible = b.elevFade() < 0.85;
            if (brushRef.current) {
                const scrubbing = b.state() === F7_STATE.CLEAN && handleRef.current.interact;
                // player velocity in CAMERA-local XZ (so the stroke sweeps where
                // you're actually dragging the brush, not a fixed wiggle)
                _vel.current.copy(playerPositionRef.current).sub(_prevPP.current);
                _prevPP.current.copy(playerPositionRef.current);
                const e = cam.matrixWorld.elements;
                const vr = _vel.current.x * e[0] + _vel.current.z * e[2];   // along camera right
                const vf = -(_vel.current.x * e[8] + _vel.current.z * e[10]); // along camera forward
                const speed = Math.hypot(vr, vf);
                if (scrubbing) {
                    // hold the last drag direction when you slow to clean a spot
                    // precisely (don't snap forward) — the stroke stays deliberate
                    if (speed > 0.0006) _brushHeading.current = Math.atan2(vr, -vf);
                    const heading = _brushHeading.current;
                    brushRef.current.rotation.y += (heading - brushRef.current.rotation.y) * 0.2;
                    const amp = Math.min(0.12, 0.035 + speed * 7.0);          // bigger sweep when moving faster
                    const s = Math.sin(t * 12);
                    brushRef.current.position.x = Math.sin(heading) * s * amp;
                    brushRef.current.position.z = -Math.cos(heading) * s * amp;
                    brushRef.current.position.y = -Math.abs(s) * 0.02;
                    brushRef.current.rotation.x = s * 0.12;
                } else {
                    // idle: a gentle breathing bob + sway so the hand is never a
                    // frozen prop, even in a still frame
                    const sway = Math.sin(t * 1.6) * 0.012;
                    const breathe = Math.sin(t * 1.1) * 0.008;
                    brushRef.current.position.set(Math.sin(t * 0.8) * 0.006, sway * 0.5 + breathe, sway);
                    brushRef.current.rotation.x = sway; brushRef.current.rotation.y *= 0.85;
                }
            }
        }
        // left hand carrying the bucket (lower-left), shown once it's grabbed
        if (leftHandRef.current) {
            const cam = state.camera;
            leftHandRef.current.position.copy(cam.position);
            leftHandRef.current.quaternion.copy(cam.quaternion);
            leftHandRef.current.translateX(-0.26); leftHandRef.current.translateY(-0.34 + Math.sin(t * 1.5) * 0.01); leftHandRef.current.translateZ(-0.4);
            leftHandRef.current.visible = b.bucket().held && b.elevFade() < 0.85;
        }

        // payoff: land rises on the horizon once the deck is clean (state DONE)
        if (islandRef.current) {
            const target = b.state() === F7_STATE.DONE ? 0.92 : 0;
            const op = (M.island as THREE.MeshStandardMaterial).opacity + (target - (M.island as THREE.MeshStandardMaterial).opacity) * Math.min(1, dt * 0.6);
            (M.island as THREE.MeshStandardMaterial).opacity = op;
            (M.islandBeach as THREE.MeshStandardMaterial).opacity = op;
            islandRef.current.visible = op > 0.01;
        }

        // ── audio cues ──
        const sf = _sfx.current;
        updateF7Roll(b.roll());
        const pw = playerPositionRef.current;
        const dStep = Math.hypot(pw.x - sf.px, pw.z - sf.pz);
        sf.px = pw.x; sf.pz = pw.z;
        if (dStep > 0.002) { sf.step += dStep; if (sf.step > 1.5) { sf.step = 0; f7Footstep(); } }
        // scrub SFX: an accent locked to each wet->dry cell drain (so the sound
        // lands where the brush actually bites), over a quieter bristle metronome
        // while you're working the brush — feedback, not a blind tick.
        if (sf.drainHit) { f7Scrub(); sf.scrub = 0.34; sf.drainHit = false; }
        else if (b.state() === F7_STATE.CLEAN && handleRef.current.interact) {
            sf.scrub -= dt; if (sf.scrub <= 0) { sf.scrub = 0.34; f7Scrub(); }
        }
        // advance suds particles (gravity + fade)
        {
            const d = _suds.current, pos = sudsGeo.attributes.position.array as Float32Array;
            let any = false;
            for (let i = 0; i < SUDS_N; i++) {
                if (d.life[i] > 0) {
                    d.life[i] -= dt; d.vel[i * 3 + 1] -= 4.5 * dt;
                    pos[i * 3] += d.vel[i * 3] * dt; pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
                    if (d.life[i] <= 0) pos[i * 3 + 1] = -999;
                    any = true;
                }
            }
            if (any) sudsGeo.attributes.position.needsUpdate = true;
        }
        const held = b.bucket().held ? 1 : 0;
        if (held && !sf.held) f7BucketClunk();
        sf.held = held;
        const cl = b.cleaned();
        if (cl > sf.cleaned) f7PuddleDone();
        sf.cleaned = cl;
        const dlg = b.dialogue();
        if (dlg !== sf.dialogue) {
            if (dlg === 1 || dlg === 4 || dlg === 5) f7CaptainGrunt();
            if (dlg === 6) { f7Wave(); f7CaptainGrunt(); }   // a swell broke over the rail
            if (dlg === 8) { f7BucketClunk(); f7Scrub(); }   // dunked the bucket at the rail
            sf.dialogue = dlg;
        }
        // tide telegraph: fire the rising warning pre-roll once as warn ramps up
        if (warn > 0.04 && !sf.tideArmed) { sf.tideArmed = 1; f7TideWarn(); }
        if (warn <= 0.001) sf.tideArmed = 0;

        // publish a snapshot for the DOM overlay
        const h = handleRef.current;
        h.dialogue = b.dialogue(); h.cleaned = b.cleaned(); h.cleanPct = b.cleanPct(); h.state = b.state();
        h.tideWarn = warn; h.bucWater = b.bucket().water;
        _tideWarnRef.current = warn;
        // direction (ship-local xz) toward the at-risk puddle, for the directional surge
        if (tideT.idx >= 0) { _tideDirRef.current.set(tideT.x, tideT.z); if (_tideDirRef.current.lengthSq() > 1e-4) _tideDirRef.current.normalize(); }
        else _tideDirRef.current.set(0, 0);
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
            <Floor7Water sunDir={SUN_DIR} warnRef={_tideWarnRef} />

            {/* the ship (sways) */}
            <group ref={shipRef} scale={FLOOR7_SCALE}>
                <ShipBody />
                {/* the elevator the player rode in on — dematerialises */}
                <group ref={elevatorRef} position={[0, 0, 5.2]}>
                    <mesh position={[0, 1.2, 0]} material={M.elev}><boxGeometry args={[2.2, 2.4, 0.2]} /></mesh>
                    <mesh position={[-1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[1.1, 1.2, 0.6]} material={M.elev}><boxGeometry args={[0.2, 2.4, 1.2]} /></mesh>
                    <mesh position={[0, 2.45, 0.6]} material={M.elevTrim}><boxGeometry args={[2.4, 0.16, 1.4]} /></mesh>
                </group>
                {/* captain */}
                <Captain ref={captainRef} rig={capRig} />
                {/* bucket + cloth — wooden staved pail with iron bands, soapy
                    water surface and a draped wet rag (a hero prop up close) */}
                <group ref={bucketRef} position={[1.35, 0.18, -1.8]}>
                    <mesh material={M.bucket}><cylinderGeometry args={[0.16, 0.13, 0.3, 16, 1, true]} /></mesh>
                    <mesh position={[0, -0.15, 0]} material={M.bucket}><cylinderGeometry args={[0.13, 0.13, 0.02, 16]} /></mesh>
                    {/* iron hoops */}
                    {[0.12, -0.1].map((y) => (
                        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[y > 0 ? 0.162 : 0.142, 0.012, 6, 18]} /></mesh>
                    ))}
                    {/* soapy water surface — drops as the bucket goes stale, refills on a dunk */}
                    <mesh ref={sudsSurfRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.sudsy}><circleGeometry args={[0.15, 18]} /></mesh>
                    {/* swing handle (iron arc) */}
                    <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[0.155, 0.01, 6, 18, Math.PI]} /></mesh>
                    {/* draped wet rag over the rim */}
                    <mesh position={[0.1, 0.13, 0.05]} rotation={[0.5, 0.4, 0.2]} material={M.cloth}><boxGeometry args={[0.2, 0.03, 0.16]} /></mesh>
                    <mesh position={[0.16, 0.04, 0.08]} rotation={[0.1, 0.4, 0.6]} material={M.cloth}><boxGeometry args={[0.12, 0.02, 0.14]} /></mesh>
                </group>
                {/* puddles: a wet halo soaking the planks + a reflective water disc */}
                {Array.from({ length: 6 }).map((_, i) => (
                    <group key={i} ref={(g) => { puddleRefs.current[i] = g; }} position={[0, 0.02, 0]}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} renderOrder={1}>
                            <circleGeometry args={[1.28, 20]} />
                            <meshBasicMaterial map={_contactTex} color="#0a181c" transparent opacity={0.6} depthWrite={false} />
                        </mesh>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} material={puddleMats[i]}>
                            <circleGeometry args={[1, 48]} />
                        </mesh>
                    </group>
                ))}
                {/* suds particles thrown up by scrubbing */}
                <points ref={sudsPts} geometry={sudsGeo} frustumCulled={false}>
                    <pointsMaterial size={0.07} color="#eef7f8" transparent opacity={0.92} depthWrite={false} sizeAttenuation />
                </points>
            </group>

            {/* "terra à vista" — land rises on the horizon when the deck is clean */}
            <group ref={islandRef} visible={false} position={[14, -0.6, 90]}>
                <mesh position={[0, 0, 0]} scale={[1, 0.5, 1]} material={M.island}><sphereGeometry args={[14, 16, 10]} /></mesh>
                <mesh position={[-12, -0.5, 4]} scale={[1, 0.42, 1]} material={M.island}><sphereGeometry args={[8, 14, 10]} /></mesh>
                <mesh position={[13, -0.8, -3]} scale={[1, 0.38, 1]} material={M.island}><sphereGeometry args={[7, 14, 10]} /></mesh>
                <mesh position={[2, 5, 1]} material={M.island}><coneGeometry args={[5, 9, 12]} /></mesh>
                <mesh position={[0, -1.2, 12]} rotation={[-Math.PI / 2, 0, 0]} material={M.islandBeach}><circleGeometry args={[16, 24]} /></mesh>
            </group>

            {/* first-person hands + scrub-brush (rides the camera, world-space) */}
            <group ref={handsRef} frustumCulled={false}>
                <group ref={brushRef} scale={1.4}>
                    {/* coat sleeve entering from the lower-right corner + gold cuff */}
                    <mesh position={[0.07, -0.16, 0.16]} rotation={[0.95, 0.12, 0.22]} material={M.coat}><cylinderGeometry args={[0.052, 0.075, 0.4, 10]} /></mesh>
                    <mesh position={[0.035, -0.055, 0.02]} rotation={[0.95, 0.12, 0.22]} material={M.goldFp}><cylinderGeometry args={[0.072, 0.072, 0.045, 10]} /></mesh>
                    {/* flattened palm gripping the brush */}
                    <mesh position={[0, -0.035, -0.085]} rotation={[0.42, 0, 0]} material={M.skin}><boxGeometry args={[0.088, 0.03, 0.1]} /></mesh>
                    {/* thumb + four fingers curling over the brush block */}
                    <mesh position={[-0.052, -0.05, -0.08]} rotation={[0.42, 0, 0.35]} material={M.skin}><capsuleGeometry args={[0.014, 0.05, 3, 6]} /></mesh>
                    {[-0.03, -0.01, 0.01, 0.03].map((fx, i) => (
                        <mesh key={i} position={[fx, -0.062, -0.125]} rotation={[1.15, 0, 0]} material={M.skin}><capsuleGeometry args={[0.011, 0.045, 3, 6]} /></mesh>
                    ))}
                    {/* scrub brush: wooden block + pale bristles, forward under the palm */}
                    <mesh position={[0, -0.078, -0.12]} rotation={[0.35, 0, 0]} material={M.barrel}><boxGeometry args={[0.16, 0.045, 0.1]} /></mesh>
                    <mesh position={[0, -0.112, -0.13]} rotation={[0.35, 0, 0]} material={M.cloth}><boxGeometry args={[0.15, 0.04, 0.09]} /></mesh>
                </group>
            </group>

            {/* left hand carrying the bucket by its handle (camera-attached) */}
            <group ref={leftHandRef} frustumCulled={false} visible={false}>
                <mesh position={[-0.04, 0.0, 0.1]} rotation={[1.0, 0, -0.2]} material={M.coat}><cylinderGeometry args={[0.05, 0.07, 0.34, 10]} /></mesh>
                <mesh position={[0, 0.02, 0.0]} material={M.skin}><boxGeometry args={[0.08, 0.05, 0.09]} /></mesh>
                {/* the iron bail (handle) the fist grips, dropping to the bucket below */}
                <mesh position={[0, -0.04, 0.0]} rotation={[0, 0, 0]} material={M.iron}><torusGeometry args={[0.09, 0.012, 6, 14, Math.PI]} /></mesh>
                <mesh position={[0.02, -0.22, 0.02]} material={M.bucket}><cylinderGeometry args={[0.1, 0.085, 0.16, 12, 1, true]} /></mesh>
            </group>
        </group>
    );
};

// ── DOM overlay: captain dialogue + objective + clean HUD + interact button ──
const DIALOGUE: Record<number, string> = {
    1: 'Capitão: Ahá, um novo grumete! Antes de zarparmos de vez… o convés tá um brejo. Pega aquele balde com o pano e esfrega essas poças, marujo!',
    2: 'Objetivo: pegue o balde com o pano (perto do mastro).',
    3: 'Objetivo: esfregue todas as poças do convés.',
    4: 'Capitão: Bom trabalho, grumete! Olha lá na proa… TERRA À VISTA! Vou assumir o leme — segura firme, que a gente chega já.',
    5: 'Capitão: Isso, marujo! Já tá ficando decente — não para agora!',
    6: 'Capitão: Segura! Uma onda lavou o convés — voltou a molhar uma poça. Não deixa nenhuma pela metade!',
    7: 'Objetivo: a água tá suja — molhe o pano na amurada (chegue na borda e aperte) pra esfregar mais rápido.',
    8: 'Pano encharcado de água do mar — esfrega que rende mais!',
};

export const Floor7Overlay: React.FC<{ handleRef: React.MutableRefObject<Floor7Handle> }> = ({ handleRef }) => {
    const [snap, setSnap] = useState({ dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0, tideWarn: 0, bucWater: 1 });
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const h = handleRef.current;
            setSnap((s) => (s.dialogue !== h.dialogue || s.cleaned !== h.cleaned || Math.abs(s.cleanPct - h.cleanPct) > 0.01 || s.state !== h.state || Math.abs(s.tideWarn - h.tideWarn) > 0.04 || Math.abs(s.bucWater - h.bucWater) > 0.03)
                ? { dialogue: h.dialogue, cleaned: h.cleaned, npud: h.npud, cleanPct: h.cleanPct, state: h.state, tideWarn: h.tideWarn, bucWater: h.bucWater } : s);
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
            {/* rising-tide telegraph: a cold spray vignette creeps in from the
                screen edges as a swell approaches (tideWarn 0..1) */}
            {cleaning && snap.tideWarn > 0.02 && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: snap.tideWarn, boxShadow: 'inset 0 0 140px 30px rgba(60,120,150,0.75)', transition: 'opacity 0.12s linear' }} />
            )}
            {cleaning && snap.tideWarn > 0.45 && (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top,0px) + 92px)', transform: 'translateX(-50%)', color: '#dff2fb', fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textShadow: '0 1px 4px #04263a', opacity: Math.min(1, (snap.tideWarn - 0.45) * 3) }}>
                    ◣ VAGALHÃO CHEGANDO ◢
                </div>
            )}
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
                    {/* bucket-freshness meter (the second-verb resource) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ color: snap.bucWater < 0.3 ? '#ffd27a' : '#cfe3ee', fontSize: 10, letterSpacing: '0.12em', textShadow: '0 1px 3px #000' }}>PANO</span>
                        <div style={{ width: 150, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', outline: snap.bucWater < 0.3 ? '1px solid rgba(255,180,90,0.7)' : 'none' }}>
                            <div style={{ width: `${Math.round(snap.bucWater * 100)}%`, height: '100%', background: snap.bucWater < 0.3 ? 'linear-gradient(90deg,#b9863a,#e7c074)' : 'linear-gradient(90deg,#3f93b4,#a9dcea)', transition: 'width 0.2s linear' }} />
                        </div>
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
