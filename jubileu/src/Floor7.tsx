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
import { Sky, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Floor7Brain, F7_STATE, type F7Puddle } from './Floor7Brain';
import { buildPirateRig, PB, PIRATE_SCALE, type PirateRig } from './pirateRig';
import { pirateCaptainModel } from './assets/textureImports';

// bundled (inlined) GLB — works with no network in the single-file build
const PIRATE_GLB_URL = pirateCaptainModel;
useGLTF.preload(PIRATE_GLB_URL);
import { Floor7WaterV2 } from './floor7v2/Floor7WaterV2';
import { Floor7ViewModelV2 } from './floor7v2/Floor7ViewModelV2';
import { FLOOR7_HELM, floor7HelmProgress, resolveFloor7CaptainRenderPose } from './floor7v2/helm';
import { makeWood, makeJollyRoger, makeCloud, makeGlow, makeSkyEquirect, makeSailcloth, makeContactShadow, makePuddleRipple, makeCrewManifest } from './floor7Textures';

const _puddleRipple = makePuddleRipple();
import { buildHullGeometry, buildDeckGeometry, buildRailGeometry, buildWaleGeometry, buildInnerWallGeometry, buildDeckSeams, buildWaterwayGeometry, deckYAt, railYAt, beamAt } from './floor7Geo';
import { FLOOR7_SCALE, F7_DECK_PROPS } from './constants';
import { f7Footstep, f7Scrub, f7BucketClunk, f7CaptainGrunt, f7PuddleDone, f7Wave, f7TideWarn, updateF7Roll, f7ElevatorReturn, f7AnchorSplash } from './floor7Sfx';

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

function organicPuddleGeometry(seed: number): THREE.ShapeGeometry {
    const shape = new THREE.Shape();
    const points: THREE.Vector2[] = [];
    for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const r = 0.82 + Math.sin(a * 3 + seed * 1.7) * 0.11
            + Math.sin(a * 5 - seed * 0.9) * 0.07
            + Math.sin(a * 7 + seed * 2.3) * 0.035;
        points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 1);
}
const _organicPuddles = Array.from({ length: 6 }, (_, i) => organicPuddleGeometry(i + 1));
// (the foresail is FURLED on its yard — see the foremast JSX; a billowed plane
// there clipped through the elevator cab and crowded the spawn point)

// warm low sun (golden hour) shared by the Sky, the key light and water glitter
const SUN_POS: [number, number, number] = [26, 4.5, -30];
const SUN_DIR = new THREE.Vector3(...SUN_POS).normalize();

// HYBRID captain sizing: the primitive Captain is authored ~3.75 world-units tall
// (measured), vs the GLB's ~2.45 — scale it to the GLB's height so the cutscene
// camera (tuned for the GLB) frames him correctly and the close-up→gameplay swap is
// height-continuous. DROP seats the soles on the deck after the scale.
const CAP_HERO_SCALE = 0.653;
const CAP_HERO_DROP = 0.1;

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
    landfall: number;           // 0..1 island approach (ST_SAIL payoff)
    logPage: number;            // captain's log: 0 closed · 1..3 page N · 4 done
    logRead: boolean;           // the player "remembered" the floor
    nearExit: boolean;          // standing in the rematerialised cab's doorway
    boarded: boolean;           // latched — App rides the elevator home
}
export function useFloor7Handle(): React.MutableRefObject<Floor7Handle> {
    return useRef<Floor7Handle>({ brain: null, interact: false, dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0, tideWarn: 0, bucWater: 1, landfall: 0, logPage: 0, logRead: false, nearExit: false, boarded: false });
}

// ── materials (module-scope, shared) ──
const M = {
    hull: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.09, color: '#caa066', roughness: 0.85, envMapIntensity: 0.7, side: THREE.DoubleSide }),
    hullDk: new THREE.MeshStandardMaterial({ map: _hullWood.map, roughnessMap: _hullWood.rough, bumpMap: _hullWood.rough, bumpScale: 0.08, color: '#8c6e44', roughness: 0.92 }),
    // deck envMapIntensity kept LOW — at 0.6 the sky/sea env-map smeared cold
    // blue reflection streaks across the dry planks (the deck read as wet)
    plank: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#c79a5e', roughness: 0.85, envMapIntensity: 0.22 }),
    plankDk: new THREE.MeshStandardMaterial({ map: _deckWood.map, roughnessMap: _deckWood.rough, bumpMap: _deckWood.rough, bumpScale: 0.03, color: '#ac8049', roughness: 0.88, envMapIntensity: 0.22 }),
    rail: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, bumpMap: _trimWood.rough, bumpScale: 0.025, color: '#b07f48', roughness: 0.62, envMapIntensity: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#b58a52', roughness: 0.6 }),
    sail: new THREE.MeshStandardMaterial({ map: _sailCloth.map, roughnessMap: _sailCloth.rough, color: '#f2ead6', roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.4, transparent: true }),
    // tarred hemp — darker + rougher so rigging reads as ROPE, not pale macaroni
    rope: new THREE.MeshStandardMaterial({ color: '#5b4b32', roughness: 0.95, bumpMap: _sailCloth.rough, bumpScale: 0.01, envMapIntensity: 0.15 }),
    flag: new THREE.MeshStandardMaterial({ map: makeJollyRoger(), roughness: 0.95, side: THREE.DoubleSide }),
    // o ROL DA TRIPULAÇÃO pregado no mastro grande (easter egg do Cap. Fable)
    manifest: new THREE.MeshStandardMaterial({ map: makeCrewManifest(), roughness: 0.92, side: THREE.DoubleSide }),
    barrel: new THREE.MeshStandardMaterial({ map: _trimWood.map, roughnessMap: _trimWood.rough, color: '#9c7038', roughness: 0.7 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.8 }),
    cannon: new THREE.MeshStandardMaterial({ color: '#2e3034', roughness: 0.34, metalness: 0.92, envMapIntensity: 1.1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9c2c8', roughness: 0.35, metalness: 0.7 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#5b3d22', roughness: 0.7 }),
    // wool coat: a fabric bump + high roughness + low env so it reads as cloth,
    // not wet plastic (the sailcloth rough map doubles as a weave bump)
    coat: new THREE.MeshStandardMaterial({ color: '#8a2222', roughness: 0.88, bumpMap: _sailCloth.rough, bumpScale: 0.014, envMapIntensity: 0.25 }),
    coatDk: new THREE.MeshStandardMaterial({ color: '#5c1414', roughness: 0.9, bumpMap: _sailCloth.rough, bumpScale: 0.014, envMapIntensity: 0.2 }),
    // weathered lower coat — much darker grime at the hem (the subtle delta
    // before was invisible on-screen), plus a desaturated dusty SALT bloom for
    // the light-catching shoulders/forearms: real value variation per the AAA bar
    coatWorn: new THREE.MeshStandardMaterial({ color: '#4a1010', roughness: 0.98, bumpMap: _sailCloth.rough, bumpScale: 0.022, envMapIntensity: 0.15 }),
    coatSalt: new THREE.MeshStandardMaterial({ color: '#a8675f', roughness: 0.96, bumpMap: _sailCloth.rough, bumpScale: 0.02, envMapIntensity: 0.2 }),
    skin: new THREE.MeshStandardMaterial({ color: '#cd9a6e', roughness: 0.62 }),
    hat: new THREE.MeshStandardMaterial({ color: '#17161b', roughness: 0.62, envMapIntensity: 0.6 }),
    // warm brass for ALL exterior trim (formerly gold): darker + more metallic + reduced emissive
    // so it reads as true metallic brass under the warm sunlight, not painted plastic.
    gold: new THREE.MeshStandardMaterial({ color: '#c9a24e', roughness: 0.4, metalness: 0.7, envMapIntensity: 0.6, emissive: '#2a1f08', emissiveIntensity: 0.12 }),
    // first-person cuff: even calmer, since it fills the frame next to the camera.
    goldFp: new THREE.MeshStandardMaterial({ color: '#e3bb55', roughness: 0.45, metalness: 0.5, envMapIntensity: 0.3, emissive: '#3a2b08', emissiveIntensity: 0.16 }),
    boot: new THREE.MeshStandardMaterial({ color: '#2a1d12', roughness: 0.55 }),
    // beard warmed toward the hair so the two cohere (AAA rule: analogous hues)
    beard: new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.98, bumpMap: _sailCloth.rough, bumpScale: 0.022 }),
    // baldric/sash — a deep navy leather so it reads SEPARATELY from the gold
    // waistcoat (was the same gold, an unreadable yellow mush on the chest)
    baldric: new THREE.MeshStandardMaterial({ color: '#1f2b44', roughness: 0.6, bumpMap: _sailCloth.rough, bumpScale: 0.015 }),
    hair: new THREE.MeshStandardMaterial({ color: '#26201a', roughness: 0.9 }),
    eyewhite: new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.35 }),
    // recessed eye socket (dark, sits behind the white so the eye reads sunken)
    socket: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8 }),
    // iris — weathered grey-blue with a touch of life
    iris: new THREE.MeshStandardMaterial({ color: '#5a6b6e', roughness: 0.32, metalness: 0.1 }),
    // ruddy, weathered captain skin (cheeks/nose catch a warmer tone)
    skinR: new THREE.MeshStandardMaterial({ color: '#c4805c', roughness: 0.66 }),
    // pale old scar tissue, and a darker shadow-skin for socket/crease AO
    scar: new THREE.MeshStandardMaterial({ color: '#d9a98a', roughness: 0.5 }),
    skinD: new THREE.MeshStandardMaterial({ color: '#9c6a4a', roughness: 0.66 }),
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
    giltTrim: new THREE.MeshStandardMaterial({ color: '#9d7a3a', roughness: 0.5, metalness: 0.65, envMapIntensity: 0.45, emissive: '#1f1605', emissiveIntensity: 0.11 }),
    // the captain's log (diário de bordo) — worn leather + salt-stained pages
    logCover: new THREE.MeshStandardMaterial({ color: '#3a2417', roughness: 0.85, bumpMap: _sailCloth.rough, bumpScale: 0.012, emissive: '#000000' }),
    logPages: new THREE.MeshStandardMaterial({ color: '#e4d7b4', roughness: 0.95 }),
    island: new THREE.MeshStandardMaterial({ color: '#3f5346', roughness: 1, transparent: true, opacity: 0, fog: false }),
    islandBeach: new THREE.MeshStandardMaterial({ color: '#d8c48f', roughness: 1, transparent: true, opacity: 0, fog: false }),
    islandTrunk: new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 1, transparent: true, opacity: 0, fog: false }),
    islandFrond: new THREE.MeshStandardMaterial({ color: '#3e7d3a', roughness: 1, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide }),
    islandHalo: new THREE.MeshStandardMaterial({ color: '#3fb0a8', roughness: 0.8, transparent: true, opacity: 0, fog: false }),
    islandRock: new THREE.MeshStandardMaterial({ color: '#8a8577', roughness: 0.95, transparent: true, opacity: 0, fog: false }),
    islandFrondDark: new THREE.MeshStandardMaterial({ color: '#2f6e2f', roughness: 1, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide }),
    bird: new THREE.MeshStandardMaterial({ color: '#eef1f2', roughness: 0.9 }),
    birdWing: new THREE.MeshStandardMaterial({ color: '#b9c2c6', roughness: 0.9 }),
    puddle: new THREE.MeshPhysicalMaterial({ color: '#0a1316', roughness: 0.05, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04, bumpMap: _puddleRipple, bumpScale: 0.05, transparent: true, opacity: 0.92, envMapIntensity: 1.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#11242e', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#4a3010', emissiveIntensity: 0.28, envMapIntensity: 1.5 }),
    // shell kept matte-ish: at roughness 0.4/metal 0.5 the sunlit back panel
    // blew out into a featureless white wall next to the island
    elev: new THREE.MeshStandardMaterial({ color: '#9fb0b9', roughness: 0.62, metalness: 0.3, transparent: true }),
    elevTrim: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.4, metalness: 0.6, transparent: true }),
    // warm interior glow so the open cab reads as a lit hotel elevator (the "doorway"
    // the player rode in on), and a darker floor/ceiling to box it in.
    elevGlow: new THREE.MeshStandardMaterial({ color: '#3a2a18', emissive: '#ffdca8', emissiveIntensity: 1.4, roughness: 0.7, metalness: 0, transparent: true }),
    elevFloor: new THREE.MeshStandardMaterial({ color: '#6b5535', roughness: 0.8, metalness: 0.1, transparent: true }),
    // brushed-steel sliding doors — the single most "this is an elevator" feature. Now true steel.
    elevDoor: new THREE.MeshStandardMaterial({ color: '#b8c0c6', roughness: 0.35, metalness: 0.9, transparent: true, envMapIntensity: 0.9 }),
    elevSeam: new THREE.MeshStandardMaterial({ color: '#10141a', roughness: 0.6, metalness: 0.3, transparent: true }),       // recessed dark gap between the two leaves
    elevEdge: new THREE.MeshStandardMaterial({ color: '#eef3f7', roughness: 0.15, metalness: 0.9, transparent: true }),       // bright bevel down each inner door edge
    // dark translucent glass for gallery windows (Carpenter's material for vidraças)
    glassPort: new THREE.MeshPhysicalMaterial({ color: '#1a2630', roughness: 0.12, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.08, transparent: true, opacity: 0.85, envMapIntensity: 1.2 }),
    // bronze for ship's bell — warm reddish metal reads as BELL, not chandelier hardware
    bell: new THREE.MeshStandardMaterial({ color: '#b8860b', roughness: 0.35, metalness: 0.8, envMapIntensity: 0.7 }),
};

// glowing floor-indicator "7" — sells the "The Normal Elevator, floor 7" gag on the cab.
function makeFloorNumTex(n: string): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); if (!x) return null;
    // near-black plate with a bright gold bezel + a big bright glyph so it survives the
    // washed software-GL exposure and reads as a lit floor indicator.
    x.fillStyle = '#0a0703'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#ffcf6e'; x.lineWidth = 12; x.strokeRect(14, 14, 228, 228);
    x.fillStyle = '#f0dcab'; x.font = 'bold 190px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#ffd27a'; x.shadowBlur = 16;
    x.fillText(n, 128, 142);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
const _floor7NumTex = makeFloorNumTex('7');
// warm gold tint (not pure white) so the lit "7" reads as a floor indicator without
// blowing out brighter than the cab itself and stealing the LOOK_BACK frame.
const M_elevNum = new THREE.MeshBasicMaterial({ map: _floor7NumTex ?? undefined, color: _floor7NumTex ? '#c9ad72' : '#ffd27a', toneMapped: false, fog: false, transparent: true });

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
            {/* battens sit ON the recessed dark plate (no air gap — the old y=0.1
                left the lattice hovering like a floating table-top) */}
            {[-0.36, -0.18, 0, 0.18, 0.36].map((x) => (
                <mesh key={'gx' + x} position={[x, 0.07, 0]} material={M.grate}><boxGeometry args={[0.05, 0.05, 1.06]} /></mesh>
            ))}
            {[-0.45, -0.225, 0, 0.225, 0.45].map((z) => (
                <mesh key={'gz' + z} position={[0, 0.07, z]} material={M.grate}><boxGeometry args={[0.86, 0.05, 0.05]} /></mesh>
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
const ShipBody: React.FC<{ helmWheelRef?: React.MutableRefObject<THREE.Group | null> }> = ({ helmWheelRef }) => {
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
                {/* ROL DA TRIPULAÇÃO — pergaminho pregado na face de ré do mastro,
                    curvado no fuste (easter egg: o navio lembra de quem o construiu).
                    Segmento de cilindro aberto, um fio a mais que o raio do mastro. */}
                <group rotation={[0, Math.PI - 0.18, 0]}>
                    <mesh position={[0, 1.55, 0]} material={M.manifest}>
                        <cylinderGeometry args={[0.245, 0.245, 0.42, 10, 1, true, -0.62, 1.24]} />
                    </mesh>
                    {/* tachas de ferro segurando o alto e o pé do rol */}
                    {[1.74, 1.36].map((y) => (
                        <mesh key={'tk' + y} position={[Math.sin(0) * 0.25, y, Math.cos(0) * 0.25]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}>
                            <cylinderGeometry args={[0.014, 0.02, 0.02, 6]} />
                        </mesh>
                    ))}
                </group>
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
                {/* the foresail rides FURLED on its yard: a billowed sail here
                    clipped straight through the elevator cab (whose rotated
                    corner reaches z≈4.0) and crowded the spawn. A rolled bundle
                    with gaskets reads as a ship easing toward harbour. */}
                <mesh position={[0, 3.58, 0]} rotation={[0, 0, Math.PI / 2]} material={M.sail}><cylinderGeometry args={[0.13, 0.1, 3.15, 8]} /></mesh>
                <mesh position={[0, 3.58, 0]} rotation={[0, 0, Math.PI / 2]} material={M.sail}><cylinderGeometry args={[0.1, 0.13, 3.15, 8]} /></mesh>
                {[-1.1, -0.4, 0.4, 1.1].map((gx) => (
                    <mesh key={'gask' + gx} position={[gx, 3.58, 0]} rotation={[0, 0, Math.PI / 2]} material={M.rope}><torusGeometry args={[0.135, 0.018, 5, 10]} /></mesh>
                ))}
            </group>
            {/* binnacle: pedestal base for the helm (ship's wheel) */}
            <mesh position={[FLOOR7_HELM.wheelX, 0.35, FLOOR7_HELM.wheelZ]} material={M.rail}><boxGeometry args={[0.5, 0.7, 0.4]} /></mesh>
            {/* Real helm in front of the deckhouse. The original -6.8 location
                put the entire cabin between the captain and the wheel. */}
            <group ref={helmWheelRef} position={[FLOOR7_HELM.wheelX, FLOOR7_HELM.wheelY, FLOOR7_HELM.wheelZ]}>
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
                    {/* wings first (the flap code drives children[0]/[1]) — grey on top
                        so they read as gull wings, not black boomerang blades */}
                    <mesh position={[0.22, 0, 0]} material={M.birdWing}><boxGeometry args={[0.44, 0.03, 0.14]} /></mesh>
                    <mesh position={[-0.22, 0, 0]} material={M.birdWing}><boxGeometry args={[0.44, 0.03, 0.14]} /></mesh>
                    {/* white body + head + dark tail tip = an actual bird silhouette */}
                    <mesh rotation={[Math.PI / 2, 0, 0]} material={M.bird}><capsuleGeometry args={[0.055, 0.2, 3, 6]} /></mesh>
                    <mesh position={[0, 0.03, 0.16]} material={M.bird}><sphereGeometry args={[0.05, 6, 5]} /></mesh>
                    <mesh position={[0, 0.01, -0.17]} material={M.birdWing}><boxGeometry args={[0.09, 0.02, 0.1]} /></mesh>
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
    <group ref={ref} name="captainRoot">
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
                {/* side + back panels — WORN (darker/dirtier) tonal zone, and FLARED
                    out at the hem with a staggered edge so the skirt breaks like
                    cloth instead of reading as a stiff cylinder billboard */}
                {[-0.62, 0.62, -1.45, 1.45, Math.PI - 0.6, Math.PI + 0.6].map((ang, i) => (
                    <mesh key={i} position={[Math.sin(ang) * 0.31, -0.27 + (i % 2 ? 0.04 : -0.04), Math.cos(ang) * 0.31]} rotation={[0.2, ang, 0]} material={M.coatWorn}>
                        <boxGeometry args={[0.4, 0.62, 0.09]} />
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
        {/* torso — a real broad CHEST over a NIPPED WAIST (geometry, not a paint
            stripe), with pec mass breaking the flat front plane */}
        <mesh position={[0, 1.27, 0]} material={M.coat}><cylinderGeometry args={[0.3, 0.27, 0.24, 16]} /></mesh>
        <mesh position={[0, 1.04, 0]} material={M.coat}><cylinderGeometry args={[0.225, 0.255, 0.22, 16]} /></mesh>
        {[-1, 1].map((s) => (
            <mesh key={'pec' + s} position={[s * 0.1, 1.22, 0.2]} scale={[1, 0.85, 0.55]} material={M.coat}><sphereGeometry args={[0.11, 12, 10]} /></mesh>
        ))}
        {/* recessed centre-front closure seam + a thin red placket */}
        <mesh position={[0, 1.05, 0.265]} material={M.coatDk}><boxGeometry args={[0.045, 0.52, 0.03]} /></mesh>
        {[1.30, 1.16, 1.02, 0.88].map((y, i) => (
            <React.Fragment key={i}>
                <mesh position={[-0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
                <mesh position={[0.085, y, 0.245]} material={M.gold}><sphereGeometry args={[0.024, 8, 6]} /></mesh>
            </React.Fragment>
        ))}
        <mesh position={[0, 1.33, 0]} material={M.coatDk}><cylinderGeometry args={[0.21, 0.16, 0.12, 14]} /></mesh>
        {/* baldric — a single clean navy-leather diagonal with a gold edge, so it
            reads as its own strap (not merged into the gold waistcoat) */}
        <group ref={rig.sash} position={[0, 1.30, 0]}>
            <mesh position={[0, -0.32, 0.04]} rotation={[0, 0, 0.55]} material={M.baldric}><boxGeometry args={[0.1, 0.78, 0.46]} /></mesh>
            {/* edge in the DARKER gilt (was bright M.gold) — the critic flagged the baldric
                reading as a bright horizontal bar bisecting the chest; a lower-luminance
                gold lets it sit as a strap accent instead of competing with the coat trim */}
            <mesh position={[0.022, -0.32, 0.27]} rotation={[0, 0, 0.55]} material={M.giltTrim}><boxGeometry args={[0.016, 0.78, 0.018]} /></mesh>
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
            <mesh key={'dl' + s} position={[s * 0.31, 1.2, 0.04]} material={M.coatSalt}><sphereGeometry args={[0.135, 12, 10]} /></mesh>
        ))}
        {/* gilt lapel edging down the front placket (FIX: break the flat coat) */}
        {[-1, 1].map((s) => (
            <mesh key={'lp' + s} position={[s * 0.09, 1.0, 0.262]} rotation={[0.05, 0, s * 0.06]} material={M.giltTrim}><boxGeometry args={[0.04, 0.62, 0.022]} /></mesh>
        ))}

        {/* ARMS — shoulder pivots at y=1.18 */}
        <group ref={rig.armL} position={[-0.30, 1.18, 0.04]}>
            {/* upper arm -> elbow -> tapered forearm */}
            <mesh position={[0, -0.125, 0]} material={M.coat}><cylinderGeometry args={[0.09, 0.082, 0.25, 12]} /></mesh>
            <mesh position={[0, -0.26, 0.01]} material={M.coat}><sphereGeometry args={[0.083, 10, 8]} /></mesh>
            <mesh position={[0, -0.37, 0.025]} material={M.coatSalt}><cylinderGeometry args={[0.078, 0.068, 0.22, 12]} /></mesh>
            {/* big turn-back cuff, flared wider than the sleeve + gold band */}
            <mesh position={[0, -0.46, 0.04]} material={M.coatDk}><cylinderGeometry args={[0.115, 0.082, 0.14, 12]} /></mesh>
            <mesh position={[0, -0.525, 0.04]} material={M.gold}><cylinderGeometry args={[0.118, 0.112, 0.03, 12]} /></mesh>
            {/* white lace cuff ruffle + a blocky mitt with a thumb (not a nub) */}
            <mesh position={[0, -0.5, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.cloth}><torusGeometry args={[0.1, 0.026, 6, 16]} /></mesh>
            <mesh position={[0, -0.585, 0.06]} material={M.skin}><boxGeometry args={[0.09, 0.052, 0.115]} /></mesh>
            <mesh position={[-0.054, -0.56, 0.07]} rotation={[0, 0, 0.55]} material={M.skin}><capsuleGeometry args={[0.018, 0.042, 3, 6]} /></mesh>
            {/* fingers as a 2-KNUCKLE chain in a soft static curl — same fidelity
                as the right hand (the dossier demands both equally articulated) */}
            <group position={[0, -0.625, 0.1]} rotation={[0.4, 0, 0]}>
                {[-0.036, -0.012, 0.012, 0.036].map((fx, i) => (
                    <mesh key={'lf' + i} position={[fx, 0, 0.012]} material={M.skin}><capsuleGeometry args={[0.013, [0.04, 0.052, 0.052, 0.044][i], 3, 6]} /></mesh>
                ))}
                <group position={[0, -0.025, 0.04]} rotation={[0.5, 0, 0]}>
                    {[-0.036, -0.012, 0.012, 0.036].map((fx, i) => (
                        <mesh key={'ld' + i} position={[fx, 0, 0]} material={M.skin}><capsuleGeometry args={[0.012, 0.04, 3, 6]} /></mesh>
                    ))}
                </group>
            </group>
        </group>
        <group ref={rig.armR} position={[0.30, 1.18, 0.04]}>
            <mesh position={[0, -0.125, 0]} material={M.coat}><cylinderGeometry args={[0.09, 0.082, 0.25, 12]} /></mesh>
            <mesh position={[0, -0.26, 0.01]} material={M.coat}><sphereGeometry args={[0.083, 10, 8]} /></mesh>
            <mesh position={[0, -0.37, 0.025]} material={M.coatSalt}><cylinderGeometry args={[0.078, 0.068, 0.22, 12]} /></mesh>
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
                    <mesh key={i} position={[fx, 0, 0.018]} material={M.skin}><capsuleGeometry args={[0.013, [0.04, 0.052, 0.052, 0.044][i], 3, 6]} /></mesh>
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

        {/* HEAD group — neck pivot at y=1.42 (rotates to track the player).
            Scaled down to ~7-head proportion (was a bobblehead vs the AAA bar). */}
        <group ref={rig.head} position={[0, 1.44, 0]} scale={0.86}>
            {/* SKULL */}
            <mesh position={[0, 0.16, 0]} scale={[1, 1.06, 0.97]} material={M.skin}><sphereGeometry args={[0.185, 22, 20]} /></mesh>
            {/* hair skull-cap under the hat — no more bald temples/nape */}
            <mesh position={[0, 0.175, -0.012]} scale={[1.02, 1, 1.03]} material={M.hair}><sphereGeometry args={[0.182, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} /></mesh>
            {/* brow ridge — pushed FORWARD + DOWN so it physically overhangs the
                eyeballs and throws a real sunken shadow (not a high shelf) */}
            {[-1, 1].map((s) => (
                <mesh key={'br' + s} position={[s * 0.075, 0.205, 0.175]} rotation={[0.34, 0, s * 0.16]} material={M.skin}><boxGeometry args={[0.092, 0.036, 0.09]} /></mesh>
            ))}
            {/* bushy eyebrows riding the ridge — the patch-side brow cocked higher
                (gammy asymmetry the AAA bar demands) */}
            {[-1, 1].map((s) => (
                <mesh key={'eb' + s} position={[s * 0.075, 0.216 + (s > 0 ? 0.014 : 0), 0.2]} rotation={[0.2, 0, s * -0.16 + (s > 0 ? 0.12 : 0)]} material={M.hair}><boxGeometry args={[0.08, 0.022, 0.026]} /></mesh>
            ))}
            {/* cheekbones — a flat MALAR PLANE that flows toward the jaw (not two
                clown-balls): wide + flat + angled, catching the key light */}
            {[-1, 1].map((s) => (
                <mesh key={'ck' + s} position={[s * 0.14, 0.1, 0.115]} rotation={[0, s * -0.22, 0.08 * s]} scale={[1.35, 0.5, 0.6]} material={M.skinR}><sphereGeometry args={[0.05, 10, 8]} /></mesh>
            ))}
            {/* darker shadow-skin pooled in the eye/nose creases — fake AO so the
                brow, nose and sockets read as ONE fused surface, not floating blocks */}
            {[-1, 1].map((s) => (
                <mesh key={'sh' + s} position={[s * 0.072, 0.162, 0.16]} scale={[1.1, 0.72, 0.45]} material={M.skinD}><sphereGeometry args={[0.046, 10, 8]} /></mesh>
            ))}
            {/* an OLD SCAR slashing down across the patched eye (weathering) */}
            <mesh position={[0.086, 0.215, 0.182]} rotation={[0, 0, -0.62]} material={M.scar}><capsuleGeometry args={[0.0072, 0.14, 3, 6]} /></mesh>
            {/* LEFT working eye — recessed socket + a SMALLER white with a BIGGER
                iris (no more wall-eye), dropped under the brow so it reads sunken */}
            <mesh position={[-0.072, 0.184, 0.152]} scale={[1.15, 0.92, 0.55]} material={M.socket}><sphereGeometry args={[0.05, 12, 10]} /></mesh>
            <mesh ref={rig.eye} position={[-0.072, 0.184, 0.162]} scale={[1, 0.92, 0.7]} material={M.eyewhite}><sphereGeometry args={[0.03, 14, 12]} /></mesh>
            <mesh position={[-0.072, 0.184, 0.184]} material={M.iris}><sphereGeometry args={[0.018, 12, 10]} /></mesh>
            <mesh position={[-0.072, 0.184, 0.198]} material={M.hat}><sphereGeometry args={[0.009, 8, 8]} /></mesh>
            {/* EYELIDS — an upper lid drooping over the top third of the iris + a
                thin lower lid, so the eye is SEATED, not a floating sphere-in-a-bowl */}
            <mesh position={[-0.072, 0.2, 0.176]} rotation={[0.55, 0, 0.06]} material={M.skin}><boxGeometry args={[0.054, 0.014, 0.022]} /></mesh>
            <mesh position={[-0.072, 0.168, 0.18]} rotation={[-0.35, 0, 0]} material={M.skinD}><boxGeometry args={[0.05, 0.01, 0.018]} /></mesh>
            {/* RIGHT eye — a recessed socket with a slightly CONVEX leather patch
                seated in it (covering a real hole), strap denting up under the hat */}
            <mesh position={[0.072, 0.184, 0.15]} scale={[1.1, 0.95, 0.5]} material={M.socket}><sphereGeometry args={[0.05, 12, 10]} /></mesh>
            <mesh position={[0.072, 0.184, 0.168]} rotation={[Math.PI / 2, 0, 0.1]} material={M.boot}><sphereGeometry args={[0.05, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} /></mesh>
            <mesh position={[0.082, 0.30, 0.05]} rotation={[0.55, 0, 0.14]} material={M.boot}><boxGeometry args={[0.022, 0.3, 0.016]} /></mesh>
            {/* NOSE — a bridge FILL fuses it into the brow (no air-gap seam),
                then the bridge cone + bulbous ruddy tip + nostril wings */}
            <mesh position={[0, 0.2, 0.172]} material={M.skin}><boxGeometry args={[0.032, 0.07, 0.05]} /></mesh>
            <mesh position={[0, 0.172, 0.175]} rotation={[Math.PI / 2.3, 0, 0]} material={M.skin}><coneGeometry args={[0.046, 0.14, 8]} /></mesh>
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
            {/* FRONT clumps hang down the face of the beard with a centre fork gap,
                so it stops reading as a smooth molded dome (apex points down) */}
            {[-0.085, -0.04, 0.04, 0.085].map((x, i) => (
                <mesh key={'bf' + i} position={[x, -0.02 - (Math.abs(x) < 0.05 ? 0.035 : 0), 0.15]} rotation={[Math.PI - 0.5, 0, x * 2.0]} material={M.beard}><coneGeometry args={[0.028, 0.12, 6]} /></mesh>
            ))}
            {/* a few thick hair locks at the temple/brow edge under the hat brim */}
            {[-1, 1].map((s) => (
                <mesh key={'hl' + s} position={[s * 0.165, 0.16, 0.06]} rotation={[0, 0, s * 0.4]} material={M.hair}><capsuleGeometry args={[0.026, 0.08, 3, 7]} /></mesh>
            ))}
            {/* QUEUE — a TAPERED tied ponytail down the nape (apex points down) */}
            <mesh position={[0, 0.0, -0.18]} rotation={[Math.PI - 0.28, 0, 0]} material={M.hair}><coneGeometry args={[0.052, 0.26, 9]} /></mesh>
            <mesh position={[0, 0.135, -0.16]} material={M.coatDk}><torusGeometry args={[0.034, 0.011, 6, 12]} /></mesh>
            {/* hairline locks — flattened clumps lying tangent to the skull (not a
                row of golf balls), irregular in height + size */}
            {[-0.13, -0.05, 0.05, 0.13].map((x, i) => (
                <mesh key={'hf' + i} position={[x, 0.3 + (i % 2 === 0 ? 0.014 : -0.012), 0.1]} rotation={[1.3, 0, x * 1.6]} scale={[1, 1, 0.55]} material={M.hair}><capsuleGeometry args={[0.028 + (i % 2) * 0.009, 0.05, 3, 7]} /></mesh>
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
            {/* hat BADGE — a gold cockade + skull on the front crown (the AAA bar
                requires the tricorne to carry a symbol) */}
            <mesh position={[0, 0.4, 0.155]} rotation={[0.2, 0, 0]} material={M.gold}><cylinderGeometry args={[0.05, 0.05, 0.016, 16]} /></mesh>
            <mesh position={[0, 0.402, 0.166]} rotation={[0.2, 0, 0]} material={M.eyewhite}><sphereGeometry args={[0.028, 12, 10]} /></mesh>
            <mesh position={[0, 0.384, 0.166]} material={M.eyewhite}><boxGeometry args={[0.026, 0.016, 0.012]} /></mesh>
            {[-1, 1].map((s) => (
                <mesh key={'es' + s} position={[s * 0.011, 0.404, 0.18]} material={M.hat}><sphereGeometry args={[0.006, 6, 6]} /></mesh>
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

// ── PirateCaptain — the user's GLB captain, procedurally RIGGED ───────────────
// The GLB is a rig-less Tripo static mesh; pirateRig.ts synthesises a skeleton +
// skin weights from its vertex cloud. This component loads it, binds the rig, and
// animates the bones every frame off the WASM brain (idle sway/breathing, peg-leg
// walk on INTRO/DONE, head-track to the player, deck-roll lean, talk nod).
// FACE_OFFSET corrects the GLB's authored facing so capFace points him right.
// The GLB's body is authored facing +X (verified by a 360° orbit: his front — face,
// baldric, both arms — reads from the +X side). The brain's capFace uses a +Z "face
// the bow / the player" convention, so rotate -90° to map the model's +X forward onto
// +Z. With this, capFace=0 (the entry stride) faces +Z travel (no more crab-walk) and
// the GREET facing turns his body to the player (no more profile in the dialogue).
const PIRATE_FACE_OFFSET = -Math.PI / 2;
const PirateCaptain: React.FC<{
    brainRef: React.MutableRefObject<Floor7Brain | null>;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    anchorRef?: React.MutableRefObject<THREE.Vector3>;   // captain FEET in world space (dialogue-camera look-at)
    laughRef?: React.MutableRefObject<number>;           // 0..1 from the intro cutscene's LAUGH beat
    poseRef?: React.MutableRefObject<number>;            // 0..1 power-stance blend (intro REVEAL/TALK)
    talkRef?: React.MutableRefObject<number>;            // 0..1 speaking-gesture blend (intro TALK)
    legsRef?: React.MutableRefObject<number>;            // 1 during the LEGS close-up → hide the GLB (the rigid primitive legs stand in)
}> = ({ brainRef, playerPositionRef, anchorRef, laughRef, poseRef, talkRef, legsRef }) => {
    const { scene } = useGLTF(PIRATE_GLB_URL);
    const outer = useRef<THREE.Group>(null);
    const rigRef = useRef<PirateRig | null>(null);
    const _w = useRef(new THREE.Vector3());
    const _helmPos = useRef(new THREE.Vector3());
    const _helmTangent = useRef(new THREE.Vector3());
    const _hd = useRef(0); // smoothed head yaw
    const _rollLag = useRef(0); // lagged deck-roll for torso follow-through

    const rig = useMemo(() => buildPirateRig(scene), [scene]);
    useEffect(() => { rigRef.current = rig; return () => rig?.dispose(); }, [rig]);

    useFrame((state, dt) => {
        const b = brainRef.current, g = outer.current, r = rigRef.current;
        if (!b || !g || !r) return;
        const t = state.clock.elapsedTime;
        const c = b.captain();
        const floorState = b.state();
        const helmProgress = floorState === F7_STATE.DONE ? floor7HelmProgress(c.z) : (floorState === F7_STATE.SAIL ? 1 : 0);
        const helmBlend = floorState === F7_STATE.SAIL ? 1 : THREE.MathUtils.smoothstep(helmProgress, 0.72, 0.98);
        const resolvedYaw = resolveFloor7CaptainRenderPose(floorState, c, _helmPos.current, _helmTangent.current);
        const walking = b.capWalking();
        const roll = b.roll(), pitch = b.pitch();
        const ph = t * 7.0;
        // CLUMSY entry stride: a gentle vertical lurch + a peg-leg hitch (every other step
        // dips a touch deeper) so the gait reads awkward/comedic — he's "desajeitado".
        // (kept small so the whole figure doesn't sink the boots through the deck.)
        const hitch = walking ? (Math.sin(ph * 0.5) > 0 ? 1.0 : 0.5) : 0;    // alternate step weight
        const lurch = walking ? Math.max(0, Math.sin(ph)) * 0.04 * (0.7 + 0.3 * hitch) : 0;
        const waddle = walking ? Math.sin(ph) * 0.055 : 0;                   // side-to-side body roll
        // breathing: a squared sine = quick inhale, held exhale (a piston sine reads
        // mechanical). Drives the TORSO only — never the planted feet.
        const breath = Math.sin(t * 1.15) ** 2 * 0.02;
        // frame-rate-independent one-pole smoothing factor for the tracked terms
        const sdt = Math.min(dt, 0.05);
        const damp = (k: number) => 1 - Math.pow(1 - k, sdt * 60);

        // The GLB is the captain for the WHOLE cutscene + gameplay — hidden only for the
        // one EXTREME LEGS close-up, where a single fused skinned mesh smears as the legs
        // swing right under the lens. There the rigid primitive boots stand in (legsRef);
        // the GLB takes back over the instant the camera pulls off the boots.
        // The elevFade gate only applies while the cab is still DEmaterialising in the
        // intro (ST_INTRO) — on ST_FREE the fade rises AGAIN as the cab returns, and the
        // captain must stay on deck to wave you off.
        g.visible = (floorState !== F7_STATE.INTRO || b.elevFade() < 0.85) && (legsRef?.current ?? 0) < 0.5;
        if (!g.visible) return;
        // The group carries ONLY horizontal position + facing (+ a brief walk lurch).
        // The idle bob + breath live on the BODY bone (with the legs counter-translated
        // below) so they bob the chest without ever lifting the boots off the deck; the
        // weight-shift is a hip lean, not a whole-body tilt (which used to rock the feet).
        g.position.set(_helmPos.current.x, _helmPos.current.y - lurch, _helmPos.current.z);
        // NEGATE capFace: the brain's f7_atan2 yields a facing mirrored in X, so the
        // captain turned to the player's reflection (~33° off) instead of AT the player
        // — which read as a back-left view in the dialogue cam. Negating aims him dead
        // at the player; capFace is 0 during the walk so the entry stride is unaffected.
        g.rotation.y = resolvedYaw;
        g.rotation.z = waddle;   // clumsy waddle while striding in

        const bn = r.bones;
        const wsh = walking ? 0 : Math.sin(t * 0.8) * 0.05;   // idle weight-shift
        // BODY — bob+breath rise (torso only); the chest tip TRAILS the inhale (phase
        // offset, so it's a rise-then-lean, not one lumpy hitch); deck-roll lean lags
        // the ship (follow-through); a static hip-cock to the stance side; and 35% of
        // the head-track yaw bleeds in here so turning to the player runs through the
        // whole spine instead of shearing the neck/collar at the head bone alone.
        const bodyRise = c.bob + breath;
        const chestTip = Math.sin(t * 1.15 + 0.5) ** 2 * 0.006;   // trails the rise
        _rollLag.current += (roll - _rollLag.current) * damp(0.08);
        // clamp the combined lean so a roll peak coinciding with the weight-shift can't
        // over-tilt the whole figure (body is the parent of the legs).
        const bodyLean = Math.max(-0.14, Math.min(0.14,
            -roll * 0.9 + (roll - _rollLag.current) * 0.5 + wsh * 0.6 + (walking ? 0 : 0.025)));
        bn[PB.body].position.y = r.restPos[PB.body].y + bodyRise;
        // pitch coupling kept GENTLE + a small forward bias so he braces INTO the swell
        // (pitch*0.8 rocked him backward as if losing his balance).
        bn[PB.body].rotation.x = pitch * 0.35 + 0.05 + chestTip + (walking ? Math.sin(ph * 0.5) * 0.04 : 0);
        bn[PB.body].rotation.z = bodyLean;
        // HEAD — ease onto the player (frame-rate-independent, gentle gain). Only 65%
        // of the look-at lives on the head (the other 35% is the body, above) to kill
        // the collar shear; the head also counter-rolls the torso lean (a fake spine
        // S-curve — stays level as he sways); layered talk cadence + a touch of body.
        g.updateMatrixWorld();
        // publish the captain's FEET world pos for the dialogue camera (the outer
        // group origin sits at the feet thanks to the foot-lift). The Player dialogue
        // rig adds its own look/cam height, same as the Diabrete cutscene.
        if (anchorRef) g.getWorldPosition(anchorRef.current);
        _w.current.copy(playerPositionRef.current); g.worldToLocal(_w.current);
        const yawTo = Math.max(-0.7, Math.min(0.7, Math.atan2(_w.current.x, _w.current.z) - PIRATE_FACE_OFFSET));
        _hd.current += (yawTo - _hd.current) * damp(0.06);
        bn[PB.body].rotation.y = _hd.current * 0.35;
        const dlg = b.dialogue();
        const talking = (dlg === 1 || dlg === 4 || dlg === 5 || dlg === 6);
        const talk = talking ? (Math.sin(t * 4.5) + 0.5 * Math.sin(t * 9.1 + 0.7)) * 0.08 : 0;
        if (talking) bn[PB.body].rotation.x += Math.max(0, Math.sin(t * 4.5)) * 0.015;  // speech body emphasis
        bn[PB.head].rotation.y = _hd.current * 0.65 + (talking ? Math.sin(t * 3.3) * 0.02 : 0);
        const _lf = laughRef?.current ?? 0;   // fade the down-look + talk nod out as the laugh takes over
        bn[PB.head].rotation.x = (0.16 - pitch * 0.3 + Math.sin(t * 0.5) * 0.02 + talk) * (1 - _lf);   // hold the down-look as the deck pitches
        bn[PB.head].rotation.z = -bodyLean * 0.4 + Math.sin(t * 0.45) * 0.02; // keep head level as torso sways
        // LEGS — now parented to the ROOT (not the body), so the torso's bob/lean/laugh
        // no longer drags or stretches them; the soles stay planted with NO counter-translate.
        bn[PB.l_leg].position.y = r.restPos[PB.l_leg].y;
        bn[PB.r_leg].position.y = r.restPos[PB.r_leg].y;
        if (walking) {
            // swing forward AND back (not max(0,…)) for a natural alternating stride, and
            // gentler amplitude so the single-bone leg doesn't kick into a stretched pose.
            bn[PB.l_leg].rotation.set(Math.sin(ph) * 0.32, 0, 0);
            bn[PB.r_leg].rotation.set(Math.sin(ph + Math.PI) * 0.32, 0, 0);
        } else {
            bn[PB.l_leg].rotation.set(0.0, 0, 0.05);     // stance leg
            bn[PB.r_leg].rotation.set(-0.10, 0, -0.04);  // relaxed leg, knee softened, weight off it
        }
        // ARMS — bigger desynced idle drift (the small swing read static at distance) +
        // shoulders that rise/settle with the breath; splayed clear of the coat.
        // arm roll-coupling uses the LAGGED roll (secondary motion — the arms trail the
        // deck instead of snapping with it) and is halved so it can't splay past the coat.
        if (walking) {
            const armSwing = Math.sin(ph + Math.PI) * 0.5;
            bn[PB.l_arm].rotation.set(armSwing, 0, 0.14 + _rollLag.current * 0.18);
            bn[PB.r_arm].rotation.set(-armSwing, 0, -0.14 + _rollLag.current * 0.18);
        } else {
            // asymmetric rest: the right arm hangs looser (lower base, more splay, hand
            // drifting toward the sash) so the silhouette isn't a clean mirror.
            bn[PB.l_arm].rotation.set(0.10 + Math.sin(t * 1.5) * 0.16, 0, 0.14 + _rollLag.current * 0.18 + breath * 0.4);
            bn[PB.r_arm].rotation.set(0.06 + Math.sin(t * 1.27 + 1.1) * 0.14, 0.05, -0.18 + _rollLag.current * 0.18 - breath * 0.4);
        }
        // HELM POSE — once his boots reach the quarterdeck, both hands settle on
        // the wheel and the torso braces into the swell. This is blended late in
        // the walk so he can still swing his arms naturally while climbing.
        if (helmBlend > 0.001) {
            // The model faces local +X, so rotating both hanging arms around +Z
            // swings them forward toward the wheel. Procedural cuffs at the helm
            // complete the short reach that this rig-less GLB cannot articulate.
            bn[PB.l_arm].rotation.x = THREE.MathUtils.lerp(bn[PB.l_arm].rotation.x, -0.08, helmBlend);
            bn[PB.r_arm].rotation.x = THREE.MathUtils.lerp(bn[PB.r_arm].rotation.x, 0.08, helmBlend);
            bn[PB.l_arm].rotation.y = THREE.MathUtils.lerp(bn[PB.l_arm].rotation.y, 0, helmBlend);
            bn[PB.r_arm].rotation.y = THREE.MathUtils.lerp(bn[PB.r_arm].rotation.y, 0, helmBlend);
            bn[PB.l_arm].rotation.z = THREE.MathUtils.lerp(bn[PB.l_arm].rotation.z, 1.18, helmBlend);
            bn[PB.r_arm].rotation.z = THREE.MathUtils.lerp(bn[PB.r_arm].rotation.z, 1.18, helmBlend);
            bn[PB.body].rotation.x = THREE.MathUtils.lerp(bn[PB.body].rotation.x, 0.12 - pitch * 0.18, helmBlend);
            bn[PB.head].rotation.x = THREE.MathUtils.lerp(bn[PB.head].rotation.x, 0.18, helmBlend);
        }
        // POWER STANCE (intro REVEAL): hands drop to the hips (akimbo), chest out, chin up —
        // a confident "behold the captain" posture blended over the idle as he's revealed.
        const PO = poseRef?.current ?? 0;
        if (PO > 0.001) {
            // elbows WIDER + hands a touch higher (onto the belt, not the skirt) so the
            // hand stops clipping into the coat hem on the wide reveal.
            bn[PB.l_arm].rotation.x += 0.84 * PO; bn[PB.l_arm].rotation.z += 0.92 * PO;   // hands to the hips (akimbo), elbows splayed clear of the coat
            bn[PB.r_arm].rotation.x += 0.84 * PO; bn[PB.r_arm].rotation.z += -0.92 * PO;
            bn[PB.body].rotation.x += -0.08 * PO;                                         // chest out
            bn[PB.head].rotation.x += -0.12 * PO;                                         // chin up
        }
        // LAUGH (intro cutscene): head tips back, chest heaves, shoulders bounce in
        // a quick "arr-arr-arr" cadence, both hands rock up toward the belly. Blended
        // by L over whatever idle/talk pose is underneath so it reads as a real beat.
        const L = laughRef?.current ?? 0;
        if (L > 0.001) {
            // discrete "ARR — arr — arr" pulses: the head/chest throw BACK hard on each
            // pulse and the apex holds ~0.3s so it lands on camera (not a flickery bounce).
            const pulse = Math.max(0, Math.sin(t * 6.2)) ** 0.6;       // sharp rise, held crest, one per "arr"
            const a = pulse * L;
            // a CLEAR but controlled belly-laugh — a held chin-up with gentle "arr" bobs, not
            // a writhing flail (the bigger amplitudes read as the captain convulsing).
            // a clear head-thrown-back laugh (the HEAD travels — that's not the "contortion";
            // the body/arms stay controlled so he doesn't convulse).
            bn[PB.head].rotation.x += L * -0.62 + a * -0.28;           // chin tips back, snapping further on each "arr"
            bn[PB.body].rotation.x += L * -0.1 + a * -0.08;            // slight chest lean-back + heave
            bn[PB.body].rotation.z += Math.sin(t * 6.2) * 0.025 * L;   // subtle shoulder rock
            bn[PB.body].rotation.y *= (1 - 0.6 * L);                   // square up to the player
            bn[PB.l_arm].rotation.x += L * -0.34 + a * -0.16;          // hands rise toward the belly with the heave
            bn[PB.r_arm].rotation.x += L * -0.34 + a * -0.16;
            bn[PB.l_arm].rotation.z += 0.26 * L;
            bn[PB.r_arm].rotation.z += -0.26 * L;
        }
        // TALK (intro cutscene): a confident captain addressing the player. Head bobs +
        // small yaw on the speaking cadence, chest emphasis on stressed beats, and the
        // right hand lifts off the hip to gesture in slow swells. Layered over the akimbo
        // (pose) stance, fading in as the laugh fades out.
        const TK = talkRef?.current ?? 0;
        if (TK > 0.001) {
            bn[PB.head].rotation.x += (Math.sin(t * 5.0) * 0.05 + Math.max(0, Math.sin(t * 2.3)) * 0.03) * TK;
            bn[PB.head].rotation.y += Math.sin(t * 1.7) * 0.06 * TK;
            bn[PB.body].rotation.x += Math.max(0, Math.sin(t * 2.3)) * 0.02 * TK;
            const gest = (0.5 + 0.5 * Math.sin(t * 0.85)) * TK;   // slow 0..TK gesture swell
            bn[PB.r_arm].rotation.x += -0.55 * gest;              // raise the right hand to gesture
            bn[PB.r_arm].rotation.z += 0.34 * gest;
        }
        // NECK distribution: split the head's accumulated rotation across the neck +
        // head joints so the bend flows through the collar instead of shearing the seam
        // in one step (the laugh's hard throw-back was the worst offender). The neck is
        // the head's PARENT, so neck.x*f + head.x*(1-f) keeps the final head orientation
        // while spreading the deformation over two joints.
        const nkB = bn[PB.neck], hdB = bn[PB.head];
        if (nkB && hdB) {
            nkB.rotation.x = hdB.rotation.x * 0.45; hdB.rotation.x *= 0.55;
            nkB.rotation.y = hdB.rotation.y * 0.40; hdB.rotation.y *= 0.60;
            nkB.rotation.z = hdB.rotation.z * 0.40; hdB.rotation.z *= 0.60;
        }
    });

    if (!rig) return null;
    // SINGLE effective parent scale (the setup the Diabrete binds correctly): the
    // inner group's scale cancels the ship's FLOOR7_SCALE and applies PIRATE_SCALE,
    // so the SkinnedMesh's NET world scale is exactly PIRATE_SCALE. Foot-lift: the
    // GLB's feet are at local y=-0.5; lift the inner group by +0.5*scale (in
    // outer-local units) so the feet sit at the outer-group origin (the deck).
    const s = PIRATE_SCALE / FLOOR7_SCALE;
    return (
        <group ref={outer}>
            <group scale={s} position={[0, 0.5 * s, 0]}>
                <primitive object={rig.group} />
            </group>
        </group>
    );
};

interface Floor7Props {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    handleRef: React.MutableRefObject<Floor7Handle>;
    /** Shared with the finale camera, which is mounted after Player in App. */
    shipRef?: React.MutableRefObject<THREE.Group | null>;
    /** Hides camera-mounted hands while a Floor 7 payoff shot owns the camera. */
    phaseActiveRef?: React.MutableRefObject<boolean>;
    captainAnchorRef?: React.MutableRefObject<THREE.Vector3>;   // captain feet world pos (dialogue cam)
    // intro cutscene override for the elevator dematerialisation: when non-null the
    // cab fade is driven by the cutscene (so it vanishes on the LOOK_BACK beat)
    // instead of the brain's first-2.6s auto-fade.
    introElevFadeRef?: React.MutableRefObject<number | null>;
    // intro cutscene LAUGH-beat strength (0..1) — drives the captain's laugh pose.
    introLaughRef?: React.MutableRefObject<number>;
    // intro cutscene power-stance strength (0..1) — drives the captain's akimbo reveal/talk pose.
    introPoseRef?: React.MutableRefObject<number>;
    // intro cutscene speaking-gesture strength (0..1) — drives the captain's talk motion.
    introTalkRef?: React.MutableRefObject<number>;
    // intro cutscene: hide the (bow) sails during the LOOK BACK beat so the dead foresail
    // plane doesn't crowd the hero "floor 7" elevator frame.
    introHideSailsRef?: React.MutableRefObject<number>;
    // intro cutscene LEGS close-up: 1 while the camera is tight on the boots. During
    // that beat we show the rigid PRIMITIVE legs (no skin-weight smear up close) and
    // hide the GLB; on the zoom-out it flips back to 0 and the GLB captain takes over.
    introLegsRef?: React.MutableRefObject<number>;
}

export const Floor7Environment: React.FC<Floor7Props> = ({ playerPositionRef, handleRef, shipRef: externalShipRef, phaseActiveRef, captainAnchorRef, introElevFadeRef, introLaughRef, introPoseRef, introTalkRef, introHideSailsRef, introLegsRef }) => {
    const localShipRef = useRef<THREE.Group>(null);
    const shipRef = externalShipRef ?? localShipRef;
    const helmWheelRef = useRef<THREE.Group>(null);
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
    const _calmRef = useRef(1);       // shared with the water shader — landfall calm
    const _tideDirRef = useRef(new THREE.Vector2(0, 0)); // dir to the at-risk puddle
    const handsRef = useRef<THREE.Group>(null);
    const brushRef = useRef<THREE.Group>(null);
    const leftHandRef = useRef<THREE.Group>(null);
    const vmHeldRef = useRef(false);
    const vmCleaningRef = useRef(false);
    const vmFillRef = useRef(1);
    const islandRef = useRef<THREE.Group>(null);
    const elevatorRef = useRef<THREE.Group>(null);
    const elevLightRef = useRef<THREE.PointLight>(null);
    const elevDoorLRef = useRef<THREE.Mesh>(null);
    const elevDoorRRef = useRef<THREE.Mesh>(null);
    const elevSeamRef = useRef<THREE.Mesh>(null);
    const elevEdgeLRef = useRef<THREE.Mesh>(null);
    const elevEdgeRRef = useRef<THREE.Mesh>(null);
    const _doorSlide = useRef(0);
    const sfxPrevState = useRef(0);
    const logGlowRef = useRef<THREE.Mesh>(null);
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
        const m = new THREE.MeshPhysicalMaterial({ color: '#12211d', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, bumpMap: _puddleRipple, bumpScale: 0.06, transparent: true, opacity: 0.68, envMapIntensity: 0.4 });
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
                   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.078, 0.110, 0.102), foam * 0.85);
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
        if (helmWheelRef.current) {
            const steering = b.state() === F7_STATE.SAIL ? Math.sin(t * 0.72) * 0.24 - b.roll() * 0.45 : 0;
            helmWheelRef.current.rotation.z += (steering - helmWheelRef.current.rotation.z) * Math.min(1, dt * 3.5);
        }

        // read the bucket snapshot ONCE per frame (b.bucket() allocates a fresh
        // object on every call; it was being called 3x — bucket rig, left hand,
        // audio clunk — for the same live WASM state). One read, reuse below.
        const bucketState = b.bucket();
        vmHeldRef.current = bucketState.held && b.elevFade() < 0.85 && !(phaseActiveRef?.current ?? false);
        vmCleaningRef.current = b.state() === F7_STATE.CLEAN && handleRef.current.interact;
        vmFillRef.current = bucketState.water;

        // captain — rigged: peg-leg walk cycle, jaw flap, blink, head-track
        if (captainRef.current) {
            const c = b.captain();
            const walking = b.capWalking();
            const ph = t * 7.0;
            const lurch = walking ? Math.max(0, Math.sin(ph)) * 0.05 : 0;  // peg down-beat
            const breath = Math.sin(t * 1.1) * 0.011;                      // always-on chest rise
            // HYBRID height-match: the primitive is authored ~1.5x taller than the GLB
            // (a giant next to the GLB-tuned cutscene camera). Scale it down to the GLB's
            // world height so the existing camera framing reads on him AND the INTRO->
            // gameplay swap is height-continuous. Origin sits at the feet, so the scale
            // pivots there; a small drop seats the soles on the deck.
            captainRef.current.scale.setScalar(CAP_HERO_SCALE);
            captainRef.current.position.set(c.x, c.bob - lurch + breath - CAP_HERO_DROP, c.z);
            captainRef.current.rotation.y = c.face;
            // The rigid primitive stands in ONLY for the one EXTREME LEGS close-up, where
            // the GLB's single fused skinned mesh smears as the legs swing under the lens.
            // The GLB owns every other frame. Height-matched to the GLB (CAP_HERO_SCALE)
            // so the boots line up exactly across the swap.
            const legsCloseUp = (introLegsRef?.current ?? 0) >= 0.5;
            captainRef.current.visible = legsCloseUp;
            const { legL, legR, armL, armR, head, jaw, eye } = capRig;
            if (legL.current && legR.current && armL.current && armR.current) {
                if (walking) {
                    // a BIGGER, clearer stride for the dedicated boot close-up — the
                    // legs read as a deliberate clumsy clomp, never a parallel idle.
                    legL.current.rotation.x = Math.sin(ph) * 0.66;
                    legR.current.rotation.x = Math.sin(ph + Math.PI) * 0.58;
                    // lift the swinging foot off the deck (kills the skate)
                    legL.current.position.y = 0.62 + Math.max(0, Math.sin(ph)) * 0.09;
                    legR.current.position.y = 0.62 + Math.max(0, Math.sin(ph + Math.PI)) * 0.07;
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
            if (eye.current) eye.current.scale.y = (t % 4.0 > 3.89) ? 0.06 : 0.85;   // blink: squash the eye white closed
            if (head.current && captainRef.current.visible) {
                captainRef.current.updateMatrixWorld();
                _capWorld.current.copy(playerPositionRef.current);
                captainRef.current.worldToLocal(_capWorld.current);
                const yawTo = Math.max(-0.7, Math.min(0.7, Math.atan2(_capWorld.current.x, _capWorld.current.z)));
                head.current.rotation.y += (yawTo - head.current.rotation.y) * 0.1;
                head.current.rotation.x = Math.sin(t * 0.9) * 0.04;  // slow idle nod, always alive
                head.current.rotation.z = Math.sin(t * 0.7) * 0.025;
            }
            // ── intro cutscene poses — REVEAL power-stance + ironic LAUGH, driven by
            //    the shared refs the cutscene writes; blended OVER the idle pose ──
            const PO = introPoseRef?.current ?? 0;    // 0..1 akimbo reveal
            const LF = introLaughRef?.current ?? 0;   // 0..1 laugh
            if (PO > 0.001 && armL.current && armR.current && head.current) {
                // hands drop to the hips (akimbo), chest out, chin up — "behold the captain"
                armL.current.rotation.x = 0.16 - 0.06 * PO; armL.current.rotation.z = 0.92 * PO;
                armR.current.rotation.x = 0.16 - 0.06 * PO; armR.current.rotation.z = -0.92 * PO;
                head.current.rotation.x += -0.12 * PO;
            }
            if (LF > 0.001 && armL.current && armR.current && head.current) {
                // throw the head back, snapping further on each "arr"; mouth open; hands
                // rock up with the heave; square up to the player (a clear belly-laugh)
                const pulse = Math.max(0, Math.sin(t * 6.2)) ** 0.6;
                const a = pulse * LF;
                head.current.rotation.x += LF * -0.5 + a * -0.22;
                head.current.rotation.y *= (1 - 0.6 * LF);
                armL.current.rotation.x = -0.32 * LF - a * 0.16; armL.current.rotation.z = 0.34 * LF;
                armR.current.rotation.x = -0.32 * LF - a * 0.16; armR.current.rotation.z = -0.34 * LF;
                if (jaw.current) jaw.current.rotation.x = 0.22 + a * 0.22;
                captainRef.current.rotation.z += Math.sin(t * 6.2) * 0.022 * LF;
            }
            // publish the captain's world position for the dialogue camera (feet origin)
            // — only during the LEGS close-up where the primitive is the visible stand-in;
            // every other frame the GLB owns the anchor so the two don't fight over it.
            if (captainAnchorRef && legsCloseUp) captainRef.current.getWorldPosition(captainAnchorRef.current);
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
                const gripTo = (b.state() >= F7_STATE.DONE && b.state() <= F7_STATE.SAIL) ? 1.15 : 0.35;
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
            const bu = bucketState;
            // when carried, the bucket follows the player with spring lag + sways
            // on the rolling deck (slosh) instead of snapping to a fixed offset
            const br = bucketRef.current, k = bu.held ? Math.min(1, dt * 9) : Math.min(1, dt * 16);
            const ty = bu.held ? 0.5 : 0.18;
            br.position.x += (bu.x - br.position.x) * k;
            br.position.z += (bu.z - br.position.z) * k;
            br.position.y += (ty - br.position.y) * k;
            br.rotation.z = bu.held ? -b.roll() * 1.3 + Math.sin(t * 3) * 0.04 : 0;
            br.rotation.x = bu.held ? b.pitch() * 1.0 : 0;
            // first-person only: while HELD the left-hand viewmodel is the
            // bucket — the world mesh trailing beside the player read as a
            // floating crate in the corner of every frame.
            br.visible = !bu.held;
            const glow = (b.state() === F7_STATE.FETCH) ? 0.5 + 0.5 * Math.sin(performance.now() / 200) : 0;
            (M.cloth as THREE.MeshStandardMaterial).emissive.setRGB(glow * 0.4, glow * 0.4, glow * 0.2);
            // the soapy surface sinks as the water goes stale, and tints muddier
            if (sudsSurfRef.current) {
                sudsSurfRef.current.position.y = 0.04 + bu.water * 0.06;
                (M.sudsy as THREE.MeshPhysicalMaterial).color.setRGB(0.55 + bu.water * 0.26, 0.62 + bu.water * 0.27, 0.55 + bu.water * 0.35);
            }
        }
        // elevator dematerialises — during the intro cutscene the fade is driven
        // by the cutscene (override ref) so the cab vanishes on the LOOK_BACK beat;
        // otherwise it follows the brain's auto-fade.
        if (elevatorRef.current) {
            const ov = introElevFadeRef?.current;
            const f = (ov != null) ? ov : b.elevFade();
            elevatorRef.current.visible = f > 0.01;
            // ASCEND + dissolve (no shrink — shrinking read as a glitch): the cab rises a
            // little and fades, like it's beaming back up to the hotel.
            elevatorRef.current.position.y = (1 - f) * 1.1;
            elevatorRef.current.scale.setScalar(1.0);
            M.elev.opacity = f; M.elevTrim.opacity = f;
            M.elevGlow.opacity = f; M.elevFloor.opacity = f; M.elevDoor.opacity = f; M_elevNum.opacity = f;
            M.elevSeam.opacity = f; M.elevEdge.opacity = f;
            M.elevGlow.emissiveIntensity = 1.4 * f;
            if (elevLightRef.current) elevLightRef.current.intensity = 6 * f;
        }
        // hide the sails during the LOOK BACK beat (camera is on the cab; the bow foresail
        // was a dead beige plane crowding the hero "7"). Smoothly fade so there's no pop.
        {
            const want = 1 - (introHideSailsRef?.current ?? 0);
            M.sail.opacity += (want - M.sail.opacity) * Math.min(1, dt * 12);
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
            // sit each puddle ON the cambered deck (deckYAt needs t = 0 stern → 1 bow;
            // deck spans z −7..8.2). The old fixed y=0.02 buried discs at the deck's
            // high ends and floated them amidships.
            const dY = deckYAt(Math.max(0, Math.min(1, (p.z + 7) / 15.2)));
            g.position.set(p.x, dY + 0.022, p.z);
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
                let cellChanged = false;
                for (let c = 0; c < 16; c++) {
                    const v = p.cell[c];
                    const enc = Math.max(0, Math.min(255, v * 255)) | 0;
                    if (mm._cellData[c * 4] !== enc) { mm._cellData[c * 4] = enc; cellChanged = true; }
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
                // only re-upload the 4x4 wetness texture to the GPU when an encoded
                // cell byte ACTUALLY changed — most frames the mask is static (the
                // player isn't scrubbing that puddle), so this skips the per-frame
                // DataTexture upload for all idle puddles. Pixels are identical.
                if (cellChanged) mm._cellTex.needsUpdate = true;
            }
        }

        // first-person hands holding the scrub-brush — ride the camera, stroke
        // when scrubbing so the player is doing the cleaning, not watching it
        if (handsRef.current) {
            const cam = state.camera;
            handsRef.current.position.copy(cam.position);
            handsRef.current.quaternion.copy(cam.quaternion);
            handsRef.current.translateX(0.17); handsRef.current.translateY(-0.21); handsRef.current.translateZ(-0.42);
            // the scrub-brush hand only exists once you actually HOLD the bucket
            // (it was on-screen from the intro on — a giant unexplained prop) and
            // goes away for the boarding beat (elevFade rises again on ST_FREE).
            handsRef.current.visible = bucketState.held && b.elevFade() < 0.85 && !(phaseActiveRef?.current ?? false);
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
            leftHandRef.current.visible = bucketState.held && b.elevFade() < 0.85 && !(phaseActiveRef?.current ?? false);
        }

        // payoff: land rises on the horizon once the deck is clean — and then
        // ACTUALLY APPROACHES across ST_SAIL (landfall 0→1) until the ship rides
        // at anchor in its lee. The old build faded it in and never arrived.
        if (islandRef.current) {
            const st = b.state();
            const target = st >= F7_STATE.DONE ? 1 : 0;
            const op = (M.island as THREE.MeshStandardMaterial).opacity + (target - (M.island as THREE.MeshStandardMaterial).opacity) * Math.min(1, dt * 0.6);
            // once fully faded in, flip the island OPAQUE: while transparent the
            // overlapping hills/palms ghost through each other (the cone showed
            // through the hillside) — transparency only exists for the fade.
            const solid = op > 0.95;
            for (const m of [M.island, M.islandBeach, M.islandTrunk, M.islandFrond] as THREE.MeshStandardMaterial[]) {
                m.opacity = solid ? 1 : op;
                m.transparent = !solid;
            }
            islandRef.current.visible = op > 0.01;
            const lf = b.landfall();
            const ease = lf * lf * (3 - 2 * lf);              // smoothstep the approach
            islandRef.current.position.z = 90 - ease * 62;    // 90 → 28 (anchorage)
            islandRef.current.position.x = 14 - ease * 6;     // drifts toward the bow line
        }
        // the elevator's sliding doors PART once it has fully rematerialised —
        // the lit doorway is the "you can leave now" beacon (ST_FREE only).
        if (elevDoorLRef.current && elevDoorRRef.current) {
            const open = (b.state() === F7_STATE.FREE && b.elevFade() > 0.95) ? 1 : 0;
            const k = Math.min(1, dt * 2.2);
            _doorSlide.current += (open - _doorSlide.current) * k;
            elevDoorLRef.current.position.x = -0.46 - _doorSlide.current * 0.5;
            elevDoorRRef.current.position.x = 0.46 + _doorSlide.current * 0.5;
            // the centre seam + inner-edge bevels only exist while the leaves MEET —
            // once they part, the seam would hang mid-doorway as a floating post.
            if (elevSeamRef.current) elevSeamRef.current.visible = _doorSlide.current < 0.15;
            if (elevEdgeLRef.current) elevEdgeLRef.current.position.x = -0.055 - _doorSlide.current * 0.5;
            if (elevEdgeRRef.current) elevEdgeRRef.current.position.x = 0.055 + _doorSlide.current * 0.5;
        }
        // one-shot audio beats on the finale state changes
        {
            const st = b.state();
            if (st !== sfxPrevState.current) {
                if (st === F7_STATE.ANCHOR) { f7Wave(); f7AnchorSplash(); }   // the hook bites the bay
                if (st === F7_STATE.FREE) f7ElevatorReturn();                 // the cab dings back in
                sfxPrevState.current = st;
            }
            // the log glows when the story points at it (ANCHOR, unread) and
            // whispers a faint pulse during CLEAN/SAIL so explorers spot it early
            if (logGlowRef.current) {
                const em = (M.logCover as THREE.MeshStandardMaterial).emissive;
                const urgent = st === F7_STATE.ANCHOR && !b.logRead();
                const soft = (st >= F7_STATE.CLEAN && st <= F7_STATE.SAIL) && !b.logRead();
                const pulse = urgent ? 0.45 + 0.35 * Math.sin(t * 4) : (soft ? 0.1 + 0.08 * Math.sin(t * 2.2) : 0);
                em.setRGB(pulse, pulse * 0.72, pulse * 0.3);
            }
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
        const held = bucketState.held ? 1 : 0;
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
        h.tideWarn = warn; h.bucWater = bucketState.water;
        h.landfall = b.landfall(); h.logPage = b.logPage(); h.logRead = b.logRead();
        h.nearExit = b.nearExit(); h.boarded = b.boarded();
        _tideWarnRef.current = warn;
        _calmRef.current = b.calm();
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
            <hemisphereLight args={['#e6ddc4', '#4c4436', 0.85]} />
            <directionalLight position={SUN_POS} intensity={2.6} color="#ffdca0" />
            <ambientLight intensity={0.2} color="#9fc0d8" />

            {/* the Gerstner-wave ocean */}
            <Floor7WaterV2 sunDir={SUN_DIR} warnRef={_tideWarnRef} calmRef={_calmRef} shipScale={FLOOR7_SCALE} />

            {/* the ship (sways) */}
            <group ref={shipRef} scale={FLOOR7_SCALE}>
                <ShipBody helmWheelRef={helmWheelRef} />
                {/* the elevator the player rode in on — dematerialises */}
                {/* the hotel elevator the player rode in on — a discrete box with CLOSED
                    brushed-steel sliding doors (centre seam), a gold frame and a lit "7"
                    floor indicator, yawed so the doors face the off-bow look-back camera. It
                    reads as an elevator, then the whole closed-door box dematerialises. */}
                <group ref={elevatorRef} name="elevCab" position={[0, 0, 5.2]} rotation={[0, 0.7, 0]}>
                    {/* shell: back + side + roof + floor */}
                    <mesh position={[0, 1.2, -0.5]} material={M.elev}><boxGeometry args={[2.0, 2.4, 0.16]} /></mesh>
                    <mesh position={[-0.98, 1.2, 0]} material={M.elev}><boxGeometry args={[0.16, 2.4, 1.0]} /></mesh>
                    <mesh position={[0.98, 1.2, 0]} material={M.elev}><boxGeometry args={[0.16, 2.4, 1.0]} /></mesh>
                    <mesh position={[0, 2.42, 0]} material={M.elev}><boxGeometry args={[2.1, 0.18, 1.2]} /></mesh>
                    <mesh position={[0, 0.05, 0]} material={M.elevFloor}><boxGeometry args={[2.0, 0.1, 1.0]} /></mesh>
                    {/* warm interior glow (seen as a sliver through the door seam) + light */}
                    <mesh position={[0, 1.2, -0.42]} material={M.elevGlow}><boxGeometry args={[1.7, 2.1, 0.05]} /></mesh>
                    <pointLight ref={elevLightRef} position={[0, 1.7, -0.1]} color="#ffd9a0" intensity={6} distance={4} decay={2} />
                    {/* CLOSED sliding doors facing +z (toward the camera): two leaves, a
                        recessed dark centre gap, and a bright bevel down each inner edge so
                        they read unmistakably as elevator doors (not a painted panel). */}
                    <mesh ref={elevDoorLRef} position={[-0.46, 1.2, 0.5]} material={M.elevDoor}><boxGeometry args={[0.88, 2.3, 0.09]} /></mesh>
                    <mesh ref={elevDoorRRef} position={[0.46, 1.2, 0.5]} material={M.elevDoor}><boxGeometry args={[0.88, 2.3, 0.09]} /></mesh>
                    <mesh ref={elevSeamRef} position={[0, 1.2, 0.46]} material={M.elevSeam}><boxGeometry args={[0.07, 2.26, 0.06]} /></mesh>
                    <mesh ref={elevEdgeLRef} position={[-0.055, 1.2, 0.55]} material={M.elevEdge}><boxGeometry args={[0.035, 2.28, 0.02]} /></mesh>
                    <mesh ref={elevEdgeRRef} position={[0.055, 1.2, 0.55]} material={M.elevEdge}><boxGeometry args={[0.035, 2.28, 0.02]} /></mesh>
                    {/* a slim brushed-steel kick/header band per leaf to catch light as "metal" */}
                    <mesh position={[-0.46, 0.35, 0.555]} material={M.elevEdge}><boxGeometry args={[0.84, 0.08, 0.02]} /></mesh>
                    <mesh position={[0.46, 0.35, 0.555]} material={M.elevEdge}><boxGeometry args={[0.84, 0.08, 0.02]} /></mesh>
                    {/* gold door frame */}
                    <mesh position={[-0.98, 1.2, 0.52]} material={M.elevTrim}><boxGeometry args={[0.14, 2.5, 0.14]} /></mesh>
                    <mesh position={[0.98, 1.2, 0.52]} material={M.elevTrim}><boxGeometry args={[0.14, 2.5, 0.14]} /></mesh>
                    <mesh position={[0, 2.46, 0.52]} material={M.elevTrim}><boxGeometry args={[2.1, 0.14, 0.14]} /></mesh>
                    {/* lit floor-indicator "7" on the upper doors — big & bright so it reads
                        as the "floor 7" gag (kept low enough to stay in the look-back frame). */}
                    <mesh position={[0, 1.7, 0.57]} material={M_elevNum}><planeGeometry args={[0.66, 0.66]} /></mesh>
                </group>
                {/* One GLB actor for every shot and gameplay beat. */}
                <React.Suspense fallback={null}>
                    <PirateCaptain brainRef={brainRef} playerPositionRef={playerPositionRef} anchorRef={captainAnchorRef} laughRef={introLaughRef} poseRef={introPoseRef} talkRef={introTalkRef} legsRef={introLegsRef} />
                </React.Suspense>
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
                    <mesh position={[0, 0.18, 0]} material={M.iron}><torusGeometry args={[0.155, 0.01, 6, 18, Math.PI]} /></mesh>
                    {/* draped wet rag over the rim */}
                    <mesh position={[0.11, 0.12, 0.05]} rotation={[-1.18, 0.2, 0.35]} material={M.cloth}><planeGeometry args={[0.25, 0.22, 3, 3]} /></mesh>
                </group>
                {/* the captain's LOG (diário de bordo) on the companionway lid — the
                    floor's memory. Reading it is what brings the elevator back. */}
                <group position={[0.14, 0.5, -2.98]} rotation={[-0.35, 0.4, 0]}>
                    <mesh ref={logGlowRef} material={M.logCover}><boxGeometry args={[0.3, 0.05, 0.4]} /></mesh>
                    <mesh position={[0, 0.012, 0]} material={M.logPages}><boxGeometry args={[0.27, 0.035, 0.37]} /></mesh>
                    {/* leather strap + a brass clasp catching the sun */}
                    <mesh position={[0, 0.005, 0.05]} material={M.baldric}><boxGeometry args={[0.32, 0.055, 0.05]} /></mesh>
                    <mesh position={[0, 0.03, 0.05]} material={M.gold}><boxGeometry args={[0.05, 0.02, 0.06]} /></mesh>
                </group>
                {/* puddles: a wet halo soaking the planks + a reflective water disc */}
                {Array.from({ length: 6 }).map((_, i) => (
                    <group key={i} ref={(g) => { puddleRefs.current[i] = g; }} position={[0, 0.02, 0]}>
                        <mesh geometry={_organicPuddles[i]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} scale={1.28} renderOrder={1}>
                            <meshBasicMaterial map={_contactTex} color="#0a181c" transparent opacity={0.6} depthWrite={false} />
                        </mesh>
                        <mesh geometry={_organicPuddles[i]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} material={puddleMats[i]} />
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

                {/* rocky outcrops to break up smooth dome silhouette */}
                <mesh position={[6, 0.8, 8]} scale={[1.1, 1.3, 0.9]} material={M.islandRock}><dodecahedronGeometry args={[1.2, 0]} /></mesh>
                <mesh position={[-8, 1.2, 6]} scale={[0.95, 1.5, 1.1]} material={M.islandRock}><dodecahedronGeometry args={[1.0, 0]} /></mesh>
                <mesh position={[10, 0.6, -6]} scale={[1.05, 1.25, 0.85]} material={M.islandRock}><dodecahedronGeometry args={[1.15, 0]} /></mesh>

                {/* beach ABOVE the waterline (group y −0.6 + local −0.55 = world
                    −1.15 vs water −1.3) — at the old −1.2 the whole sand ring
                    sat submerged and the island met the sea as bare green */}
                <mesh position={[0, -0.55, 12]} rotation={[-Math.PI / 2, 0, 0]} material={M.islandBeach}><circleGeometry args={[16, 24]} /></mesh>

                {/* turquoise shallow water halo around the beach */}
                <mesh position={[0, -0.56, 12]} rotation={[-Math.PI / 2, 0, 0]} material={M.islandHalo}><circleGeometry args={[18.5, 28]} /></mesh>

                {/* tropical island palms — 4-5 along the beach edge with trunks, fronds, and coconuts */}
                {[
                    { x: 10, y: -0.5, z: 10, h: 3.5, rot: 0.15 },
                    { x: 12, y: -0.4, z: 5, h: 3.8, rot: -0.12 },
                    { x: 8, y: -0.5, z: -8, h: 4.1, rot: 0.08 },
                    { x: 14, y: -0.3, z: 0, h: 3.2, rot: -0.18 },
                    { x: 13, y: -0.5, z: 12, h: 3.9, rot: 0.1 },
                ].map((palm, pi) => (
                    <group key={'palm' + pi} position={[palm.x, palm.y, palm.z]}>
                        {/* trunk: two stacked cylinders with slight taper */}
                        <mesh position={[0, palm.h * 0.2, 0]} rotation={[palm.rot, 0, 0]} material={M.islandTrunk}><cylinderGeometry args={[0.15, 0.18, palm.h * 0.55, 8]} /></mesh>
                        <mesh position={[0, palm.h * 0.65, 0]} rotation={[palm.rot * 0.8, 0, 0]} material={M.islandTrunk}><cylinderGeometry args={[0.12, 0.15, palm.h * 0.45, 8]} /></mesh>
                        {/* fronds: 6 planes in radial fan, angled downward — alternating greens for organic look */}
                        {Array.from({ length: 6 }).map((_, fi) => {
                            const a = (fi / 6) * Math.PI * 2;
                            const useDark = fi % 2 === 1;
                            return (
                                <mesh
                                    key={'frond' + fi}
                                    position={[
                                        Math.cos(a) * 0.2,
                                        palm.h * 0.9,
                                        Math.sin(a) * 0.2,
                                    ]}
                                    rotation={[
                                        -Math.PI / 2.5 + (Math.sin(a) * Math.PI * 0.15),
                                        a,
                                        0,
                                    ]}
                                    material={useDark ? M.islandFrondDark : M.islandFrond}
                                >
                                    <planeGeometry args={[2.6, 0.55]} />
                                </mesh>
                            );
                        })}
                        {/* coconut */}
                        <mesh position={[0, palm.h + 0.1, 0]} material={M.islandTrunk}><sphereGeometry args={[0.18, 6, 6]} /></mesh>
                    </group>
                ))}

                {/* rocks scattered on the island */}
                {[
                    { x: 5, y: -0.5, z: 5, r: 1.0 },
                    { x: -8, y: -0.6, z: -2, r: 1.3 },
                    { x: 10, y: -0.5, z: -5, r: 0.9 },
                ].map((rock, ri) => (
                    <mesh key={'rock' + ri} position={[rock.x, rock.y, rock.z]} material={M.islandRock}>
                        <dodecahedronGeometry args={[rock.r, 0]} />
                    </mesh>
                ))}

                {/* second beach band on the opposite side (a hair lower than the
                    main ring so the two discs never z-fight) */}
                <mesh position={[-6, -0.57, -8]} rotation={[-Math.PI / 2, 0, 0]} material={M.islandBeach}><circleGeometry args={[7, 20]} /></mesh>
            </group>

            <Floor7ViewModelV2 heldRef={vmHeldRef} cleaningRef={vmCleaningRef} bucketFillRef={vmFillRef} />
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
    // ── the landfall run: at the wheel, the captain finally lets the lore out ──
    9: 'Capitão: Quarenta anos eu esperei pra ver essa ilha crescer, grumete. O convés nunca tinha ficado TODO limpo… o mar nunca tinha deixado.',
    10: 'Capitão: Sabe o que é esse oceano? É tudo que o hotel esquece. Escorre dos andares lá de cima e vira maré. Por isso ele nunca seca.',
    11: 'Capitão: O Zelador subiu a bordo uma vez. Não disse nada — só apontou pras poças. Enquanto houver o que limpar… alguém ainda lembra deste andar.',
    12: 'Capitão: Chegamos. Mas antes de desembarcar — meu DIÁRIO DE BORDO, na escotilha. Lê. Alguém tem que lembrar por mim.',
    13: 'Capitão: Ouviu esse DING? Máquina não esquece — ele lembra de quem lembra. Vai, grumete. E não esquece da gente.',
};

// the captain's log — the floor's memory, one page per press. Ties the ship to
// the hotel arc: the Zelador's silent visit, the tide as the hotel breathing,
// and the Andar 4 rule ("ser lembrado é ser cuidado") that frees the player.
const LOG_PAGES: ReadonlyArray<string> = [
    'Dia 1 no comando. O hotel me deu este navio e um mar do tamanho da minha dívida. As ordens, assinadas pela administração: "navegue até a terra aparecer". Tem quarenta anos que a terra não aparece. O convés nunca fica limpo. A maré cuida disso.',
    'Dia ????. O Zelador subiu a bordo hoje. Não falou — ele não fala. Pregou uma tábua nova no convés e apontou pras poças. Entendi assim: enquanto houver o que limpar, alguém LEMBRA deste andar. A maré não é castigo. A maré é o hotel respirando.',
    'Última página. Se um grumete estiver lendo isto: foi você que limpou TODAS as poças — por isso o mar te deixou chegar. O do quarto andar me ensinou pelas paredes: ser lembrado é ser cuidado. Lembra de mim. Lembra deste navio. E chama o elevador — máquina não esquece. Ele volta pra quem lembra.',
];

export const Floor7Overlay: React.FC<{ handleRef: React.MutableRefObject<Floor7Handle>; onGreeting?: (g: boolean) => void; onBoard?: () => void }> = ({ handleRef, onGreeting, onBoard }) => {
    const [snap, setSnap] = useState({ dialogue: 0, cleaned: 0, npud: 6, cleanPct: 0, state: 0, tideWarn: 0, bucWater: 1, landfall: 0, logPage: 0, logRead: false, nearExit: false, boarded: false });
    // tell App when the captain is in his quest-pitch (GREET) so the dialogue camera
    // can lock onto him (cutscene framing, the same rig the Diabrete meet uses).
    useEffect(() => { onGreeting?.(snap.state === F7_STATE.GREET); }, [snap.state, onGreeting]);
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const h = handleRef.current;
            setSnap((s) => (s.dialogue !== h.dialogue || s.cleaned !== h.cleaned || Math.abs(s.cleanPct - h.cleanPct) > 0.01 || s.state !== h.state || Math.abs(s.tideWarn - h.tideWarn) > 0.04 || Math.abs(s.bucWater - h.bucWater) > 0.03 || Math.abs(s.landfall - h.landfall) > 0.005 || s.logPage !== h.logPage || s.logRead !== h.logRead || s.nearExit !== h.nearExit || s.boarded !== h.boarded)
                ? { dialogue: h.dialogue, cleaned: h.cleaned, npud: h.npud, cleanPct: h.cleanPct, state: h.state, tideWarn: h.tideWarn, bucWater: h.bucWater, landfall: h.landfall, logPage: h.logPage, logRead: h.logRead, nearExit: h.nearExit, boarded: h.boarded } : s);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [handleRef]);
    // the WASM latches `boarded` on a rising interact in the cab doorway — hand
    // the ride home to the App exactly once.
    const boardedFired = useRef(false);
    useEffect(() => {
        if (snap.boarded && !boardedFired.current) { boardedFired.current = true; onBoard?.(); }
    }, [snap.boarded, onBoard]);
    // "VOCÊ LEMBROU DO ANDAR 7" — the memory chime moment when the log's last
    // page turns (mirrors the Andar 4 finale card, quoting its exact format).
    const [memoryCard, setMemoryCard] = useState(false);
    const logReadPrev = useRef(false);
    useEffect(() => {
        if (snap.logRead && !logReadPrev.current) {
            setMemoryCard(true);
            const tm = setTimeout(() => setMemoryCard(false), 4200);
            logReadPrev.current = true;
            return () => clearTimeout(tm);
        }
        logReadPrev.current = snap.logRead;
    }, [snap.logRead]);

    // keyboard interact (E / Space) → handle.interact while held
    useEffect(() => {
        const dn = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = true; };
        const up = (e: KeyboardEvent) => { if (e.code === 'KeyE' || e.code === 'Space') handleRef.current.interact = false; };
        window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
    }, [handleRef]);

    const txt = DIALOGUE[snap.dialogue];
    const cleaning = snap.state === F7_STATE.CLEAN;
    const sailing = snap.state === F7_STATE.SAIL;
    const reading = snap.logPage >= 1 && snap.logPage <= 3;
    const canBoard = snap.state === F7_STATE.FREE && snap.nearExit;
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
            {txt && !reading && (
                <div style={{ position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom,0px) + 92px)', transform: 'translateX(-50%)', maxWidth: 'min(92vw, 640px)', background: 'rgba(20,14,8,0.86)', border: '1px solid rgba(202,165,106,0.5)', borderRadius: 12, padding: '12px 16px', color: '#f3e7cf', fontSize: 15, lineHeight: 1.35, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                    {txt}
                </div>
            )}
            {/* the captain's LOG — a salt-stained page at a time (E turns it) */}
            {reading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,10,14,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ maxWidth: 'min(90vw, 560px)', background: 'linear-gradient(165deg,#efe3c2,#e2d0a4 60%,#d8c294)', border: '1px solid #8a6a42', borderRadius: 6, padding: '22px 26px 18px', color: '#3a2a17', boxShadow: '0 12px 44px rgba(0,0,0,0.75), inset 0 0 46px rgba(122,86,52,0.28)', transform: 'rotate(-0.6deg)' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.22em', color: '#7a5634', marginBottom: 10 }}>
                            ⚓ DIÁRIO DE BORDO — PÁGINA {snap.logPage}/3
                        </div>
                        <div style={{ fontSize: 15.5, lineHeight: 1.55, fontStyle: 'italic' }}>
                            {LOG_PAGES[snap.logPage - 1]}
                        </div>
                        <div style={{ marginTop: 14, textAlign: 'right', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.14em', color: '#7a5634' }}>
                            {snap.logPage < 3 ? 'E — VIRAR A PÁGINA' : 'E — FECHAR O DIÁRIO'}
                        </div>
                    </div>
                </div>
            )}
            {/* "VOCÊ LEMBROU DO ANDAR 7" — same card language as the Andar 4 finale */}
            {memoryCard && (
                <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translateX(-50%)', fontFamily: 'monospace', color: '#FFD54F', fontSize: 'min(5.4vw, 34px)', fontWeight: 700, letterSpacing: 4, textAlign: 'center', textShadow: '0 2px 18px rgba(0,0,0,0.9)' }}>
                    VOCÊ LEMBROU DO ANDAR 7
                </div>
            )}
            {/* landfall run HUD — the island closing in */}
            {sailing && (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top,0px) + 56px)', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: '#f3e7cf', fontSize: 12, letterSpacing: '0.15em', textShadow: '0 1px 3px #000' }}>⛵ RUMO À ILHA</div>
                    <div style={{ width: 200, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(snap.landfall * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#7fae6a,#cde8b0)', transition: 'width 0.3s linear' }} />
                    </div>
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
                style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right,0px) + 20px)', bottom: 'calc(env(safe-area-inset-bottom,0px) + 110px)', width: 78, height: 78, borderRadius: '50%', background: canBoard ? 'rgba(120,190,140,0.3)' : 'rgba(202,165,106,0.22)', border: canBoard ? '2px solid rgba(150,230,170,0.8)' : '2px solid rgba(202,165,106,0.6)', color: '#f3e7cf', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', pointerEvents: 'auto', backdropFilter: 'blur(3px)' }}
            >{reading ? 'VIRAR' : canBoard ? 'EMBARCAR' : cleaning ? 'ESFREGAR' : 'E'}</button>
            {/* boarding beacon — the returned cab is the way home */}
            {canBoard && !reading && (
                <div style={{ position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom,0px) + 52px)', transform: 'translateX(-50%)', color: '#d8f2df', fontSize: 12, letterSpacing: '0.18em', textShadow: '0 1px 4px #04160a' }}>
                    ▲ APERTE E PARA EMBARCAR ▲
                </div>
            )}
        </div>
    );
};

export default Floor7Environment;
