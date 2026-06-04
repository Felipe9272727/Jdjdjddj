/**
 * Floor3FallCutscene.tsx — the Diabrete's DEFEAT as a directed, INTERACTIVE,
 * multi-angle cartoon cutscene in the 1930s rubber-hose idiom.
 *
 * Staging: he clings to the FRONT edge of the platform, FACING it (and the
 * player), dangling into the abyss below. The signature beat is the player
 * looking DOWN over the edge at him — one little hand gripping the ledge, the
 * other stretched up, begging — so the "beg" shot is a high, top-down angle.
 *
 * Phase machine, with hard cartoon CUTS between camera shots:
 *   intro → trips, slips, SLAPS the ledge and catches himself.
 *   beg   → hangs by one hand, reaches up the other, pleads — HOLDS for the
 *           player's choice (App shows the plea + SALVAR / PISAR buttons).
 *   ┌ 'stomp' → top-down: a stylized cartoon shoe peels his fingers off the
 *   │           ledge; he plummets, tumbling, into the void → onDone('stomp')
 *   └ 'save'  → the player's glove hauls him up; he grins… then SHOVES the
 *               player into the abyss (camera reels) → onDone('save')
 *
 * Owns its own camera (rendered after <Player>, so its writes win).
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3DevilPos, f3DevilPosValid, devilStageBase } from './f3Hazards';
import { playFloor3Land, playFloor3Fall, playFloor3Dizzy, playFloor3Stomp, playFloor3Shove } from './floor3Sfx';
import { PlatformView } from './Floor3';
import { type F3Plat } from './f3Parkour';

const RIVAL_URL = '/diabrete.glb';
const HANG_DROP = 1.55;     // how far below the ledge his feet dangle (head+hands clear the lip)
const EDGE_Z    = 0.35;     // he hangs just off the front edge (abyss side)
const FACE_Y    = Math.PI;  // turn him to FACE the platform / the player
const INK = '#0a0712';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// Toon materials for the stylized props (game's cartoon look + ink outline).
const shoeBrown = new THREE.MeshToonMaterial({ color: '#7a4a24' });
const shoeSole  = new THREE.MeshToonMaterial({ color: '#2a2030' });
const shoeCuff  = new THREE.MeshToonMaterial({ color: '#15101a' });
const gloveWhite = new THREE.MeshToonMaterial({ color: '#f4f0e6' });
const gloveCuff  = new THREE.MeshToonMaterial({ color: '#c0271a' });

type Phase = 'intro' | 'beg' | 'stomp' | 'climb';
type Outcome = 'save' | 'stomp';

interface Props {
    choice: 'none' | Outcome;
    onBeg: () => void;
    onDone: (outcome: Outcome) => void;
}

// The cutscene's own map slice, generated with the SAME rules as the real obby
// (f3Parkour): gentle ~3.0–3.8 forward gaps, ~0.4–1.4 step in Y, ±1.9 lateral
// wander, footprints from {1.0,1.2,1.4} — so it reads as the actual parkour
// (floating tiles on a shallow slope), NOT a vertical tower. Here it DESCENDS
// forward, the climb tumbling down into the abyss the devil dangles over; the
// first tile is the big one he clings to. Deterministic (seeded), built once.
function buildCutsceneTiles(): F3Plat[] {
    let seed = 0x1a2b3c4d | 0;
    const rng = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (a: number, b: number) => a + (b - a) * rng();
    const HALF = [1.0, 1.2, 1.4], X_LIMIT = 11;
    const mk = (id: number, bx: number, cz: number, topY: number, half: number, palette: number): F3Plat =>
        ({ id, bx, cz, hw: half, hd: half, h: 0.6, topY, moving: false, amp: 0, phase: 0, x: bx, palette });

    const tiles: F3Plat[] = [mk(0, 0, -2.4, 0, 2.4, 0)];   // the tile he clings to (front edge ≈ grip)
    let bx = 0, cz = -2.4, topY = 0;
    for (let i = 1; i < 11; i++) {
        const half = HALF[Math.floor(rng() * HALF.length)];
        cz += rand(3.0, 3.8) + half;                          // step FORWARD (matches GAP)
        topY -= rand(0.4, 1.4);                               // step DOWN into the abyss (matches RISE)
        // veer off the centre fall-line on the first step, then wander like the obby
        bx += i === 1 ? -2.6 : rand(-1.9, 1.9);
        bx = Math.max(-X_LIMIT + half, Math.min(X_LIMIT - half, bx));
        tiles.push(mk(i, bx, cz, topY, half, i % 6));
    }
    return tiles;
}
const CUTSCENE_TILES: F3Plat[] = buildCutsceneTiles();

const Floor3FallCutscene: React.FC<Props> = ({ choice, onBeg, onDone }) => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null!);
    const ledgeRef = useRef<THREE.Group>(null!);
    const shoeRef  = useRef<THREE.Group>(null!);
    const gloveRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const base    = useRef(new THREE.Vector3());
    const phase   = useRef<Phase>('intro');
    const pt      = useRef(0);
    const begFired = useRef(false);
    const doneRef = useRef(false);
    const sfx     = useRef<Record<string, boolean>>({});
    const choiceRef = useRef(choice);
    choiceRef.current = choice;

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete fall] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        // Stage where the rival actually fell — but if it hasn't published a real
        // spot yet (mounted a frame too early), fall back to a sane guess instead
        // of the (0,0,14) sentinel, so the cutscene never plays in the wrong place.
        if (f3DevilPosValid.current) base.current.copy(f3DevilPos.current);
        else { const s = devilStageBase(); base.current.set(s.x, s.y, s.z); }
        phase.current = 'intro'; pt.current = 0; begFired.current = false; doneRef.current = false;
        sfx.current = {};
        // Remember the player's FOV so we can hand the camera back untouched.
        const prevFov = (camera as THREE.PerspectiveCamera).fov;
        playFloor3Land();
        return () => {
            group.remove(rig.group); rig.dispose(); rigRef.current = null;
            // CRITICAL: restore the camera so the player's view isn't left rolled
            // or zoomed — reset the up vector AND the FOV the cutscene was bending.
            camera.up.set(0, 1, 0);
            (camera as THREE.PerspectiveCamera).fov = prevFov;
            camera.updateProjectionMatrix();
            // Clear the DEV scrub hooks so a scrubbed playthrough doesn't freeze
            // the next one in this tab until a reload.
            if (import.meta.env?.DEV && typeof window !== 'undefined') {
                const w = window as any;
                delete w.__fallScrub; delete w.__fallPhase; delete w.__fallT; delete w.__fallPh;
            }
        };
    }, [gltf, camera]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        pt.current += safeDt;
        let T = pt.current;
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            const w = window as any;
            if (typeof w.__fallScrub === 'number') T = w.__fallScrub;
            if (typeof w.__fallPhase === 'string') phase.current = w.__fallPhase;
            w.__fallT = T; w.__fallPh = phase.current;
        }
        const b = rig.bones, g = groupRef.current;
        const gripY = base.current.y, gx = base.current.x, gz = base.current.z;
        const edgeZ = gz + EDGE_Z;
        const HANG_Y = gripY - HANG_DROP;
        const ph = phase.current;
        rig.group.scale.set(1, 1, 1);
        g.rotation.set(0, FACE_Y, 0);                  // FACE the platform / player
        // the cliff he clings to (top at gripY, front edge at z=gz) so he never floats
        if (ledgeRef.current) ledgeRef.current.position.set(gx, gripY, gz);
        if (shoeRef.current) shoeRef.current.visible = false;
        if (gloveRef.current) gloveRef.current.visible = false;

        // camera control — set per shot (see the switch at the bottom)
        let camRoll = 0;
        const cam = { x: gx, y: gripY + 3, z: gz - 2.4, lx: gx, ly: gripY - 0.7, lz: edgeZ, fov: 44 };

        // ── Enhanced grip animation: realistic hand clamping on the ledge ──────────
    // Simulates fingers wrapping over the edge with forearm tension + strain tremor
    const grip = (strain = 0, slip = 0) => {
        // Base grip: arm reaches UP and OVER the ledge, forearm twisted to grip
        const baseRotX = -1.85;  // arm reaches up over the edge
        const baseRotZ = 2.65;   // arm crosses body to grip the ledge
        const baseRotY = 0.15;   // slight inward twist for natural grip
        
        // High-frequency strain tremor - simulates muscle fatigue and effort
        // Multiple frequencies create organic, non-repetitive shaking
        const tremor1 = Math.sin(T * 38) * 0.04 * (1 + strain * 2.5);
        const tremor2 = Math.sin(T * 42 + 1.3) * 0.025 * (1 + strain * 2);
        const tremorZ1 = Math.cos(T * 36) * 0.035 * (1 + strain * 2);
        const tremorZ2 = Math.cos(T * 44 + 0.7) * 0.02 * (1 + strain * 1.5);
        
        // On slip: arm stretches down, grip weakens, forearm pronates
        const slipDrop = slip * 0.22;
        const slipWeaken = slip * 0.30;
        const slipPronation = slip * 0.15;  // forearm twists as grip fails
        
        b[B.l_arm].rotation.set(
            baseRotX + tremor1 + tremor2 - slipDrop,
            baseRotY + tremorZ1 * 0.6 + slipPronation,
            baseRotZ + tremorZ1 + tremorZ2 - slipWeaken
        );
    };

        // ── INTRO: trip → slip → SLAP the ledge ──────────────────────────────
        if (ph === 'intro') {
            if (T < 0.5) {
                const k = T / 0.5;
                g.position.set(gx, gripY, edgeZ);
                g.rotation.set(k * 0.5, FACE_Y, Math.sin(T * 26) * 0.12);
                b[B.l_arm].rotation.set(Math.sin(T * 24) * 2.4, 0, 0.5);
                b[B.r_arm].rotation.set(Math.sin(T * 24 + 3) * 2.4, 0, -0.5);
                b[B.head].rotation.set(0.3 * k, 0, 0);
                b[B.l_leg].rotation.set(-0.7 * k, 0, 0); b[B.r_leg].rotation.set(0.5 * k, 0, 0);
                // wide establishing shot
                cam.x = gx + 4.5; cam.y = gripY + 1.6; cam.z = edgeZ + 4.5; cam.ly = gripY - 0.2; cam.fov = 46;
            } else if (T < 0.95) {
                const k = (T - 0.5) / 0.45;
                g.position.set(gx, lerp(gripY, HANG_Y, easeIn(k)), edgeZ);
                b[B.l_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(0.5, 2.5, k));
                b[B.r_arm].rotation.set(lerp(0.2, -0.2, k), 0, lerp(-0.5, 2.5, k));
                b[B.head].rotation.set(lerp(0.3, -0.5, k), 0, 0);
                if (T > 0.85 && !sfx.current.slap) { sfx.current.slap = true; playFloor3Land(); }
                // low angle from the abyss looking UP at the catch
                cam.x = gx - 2.0; cam.y = HANG_Y + 0.2; cam.z = edgeZ + 3.2; cam.ly = gripY + 0.3; cam.fov = 50;
            } else {
                const k = clamp01((T - 0.95) / 0.45);
                g.position.set(gx, HANG_Y, edgeZ);
                grip();
                b[B.r_arm].rotation.set(lerp(-0.2, -0.1, k), 0, lerp(2.5, 1.4, k));    // settle toward a reach
                b[B.head].rotation.set(-0.55, 0, 0);
                b[B.l_leg].rotation.set(0.3, 0, 0.15); b[B.r_leg].rotation.set(0.3, 0, -0.15);
                topDownBeg(cam, gx, gripY, edgeZ, T);
            }
            if (T >= 1.4) { phase.current = 'beg'; pt.current = 0; }
        }

        // ── BEG: dangle by one straining hand, scramble + plead, PANIC-SLIP ──
        else if (ph === 'beg') {
            if (!begFired.current) { begFired.current = true; onBeg(); if (!sfx.current.beg) { sfx.current.beg = true; playFloor3Dizzy(900); } }
            // Every ~2.4s his grip fails for a beat: he drops a little, legs go
            // wild and his free hand shoots back to re-clamp — then he hauls back.
            const slipPhase = T % 2.4;
            const slip = slipPhase < 0.34 ? Math.sin((slipPhase / 0.34) * Math.PI) : 0;   // 0→1→0
            if (slip > 0.5 && !sfx.current['slip' + Math.floor(T / 2.4)]) { sfx.current['slip' + Math.floor(T / 2.4)] = true; playFloor3Land(); }
            const strain = Math.sin(T * 34) * 0.025;          // high-freq hold tremor
            const sag    = 0.05 + Math.sin(T * 2.2) * 0.05;   // heavy weight bob
            const sway   = Math.sin(T * 1.7) * 0.06;          // pendulum on the gripping arm
            const reach  = Math.sin(T * 4.5) * 0.5 + 0.5;
            const grasp  = Math.sin(T * 6) * 0.5 + 0.5;       // free hand opens/closes, grabbing
            // Body hangs with realistic weight distribution - shoulders below ledge, body sways
            const bodyDrop = 0.08 + Math.sin(T * 1.8) * 0.04;  // subtle breathing sag
            // Body hangs with realistic weight distribution - shoulders below ledge, body sways
            const shoulderDrop = 0.15 + slip * 0.12;  // shoulders drop when slipping
            const backArch = Math.sin(T * 2.1) * 0.06;  // subtle arching from effort
            g.position.set(
                gx + sway * 0.18 + strain * 0.8,
                HANG_Y - sag - slip * 0.32 - bodyDrop - shoulderDrop,
                edgeZ + backArch * 0.3
            );
            // Body tilts back from the ledge, twisted by sway, drops forward on slip
            // More pronounced backward lean - hanging from one arm
            const backLean = -0.18 + slip * 0.22;  // leans back more when slipping
            const twist = sway * 0.35 + Math.sin(T * 2.8) * 0.08;
            g.rotation.set(backLean + backArch, FACE_Y + twist, sway + strain * 1.4);
            // gripping (left) hand clamped on the lip — using enhanced grip with strain/slip
            grip(slip, slip);
            // free (right) hand pleads UP toward the player - MUCH more expressive
            // On slip: whips back to ledge to re-grab in panic
            if (slip > 0.45) {
                // PANIC GRAB: arm shoots up desperately to catch the ledge
                const panicReach = (slip - 0.45) / 0.55;
                const panicTremor = Math.sin(T * 48) * 0.12 * panicReach;
                b[B.r_arm].rotation.set(
                    lerp(-0.9, -0.15, panicReach) + panicTremor,
                    Math.sin(T * 22) * 0.18 * panicReach,  // wild searching
                    lerp(2.1, 2.5, panicReach) + panicTremor * 0.6
                );
            } else {
                // PLEADING: arm reaches high, hand opens/closes desperately, waves
                const reachHeight = lerp(-0.7, -1.4, reach);  // reaches even higher
                const reachWidth = lerp(1.5, 2.8, reach * grasp);  // opens wider
                // Desperate tremor - hand shakes from exhaustion and panic
                const handTremor = Math.sin(T * 28) * 0.10 * reach;
                const handWave = Math.sin(T * 5.2) * 0.22;  // waves side to side
                // Add reaching motion - arm stretches up and out
                const stretchReach = Math.sin(T * 3.8) * 0.08;
                b[B.r_arm].rotation.set(
                    reachHeight + handTremor + stretchReach,
                    handWave + Math.sin(T * 7) * 0.12 * reach,  // more waving
                    reachWidth + handTremor * 0.5 + Math.sin(T * 4.5) * 0.1
                );
            }
            // Head looks up at player, shakes with desperation, drops on slip - MORE EXPRESSIVE
            const headDespair = Math.sin(T * 3.8) * 0.18;
            const headShake = Math.sin(T * 13) * 0.12 * (1 + slip * 2.5);  // shakes MORE when slipping
            const headTilt = sway * 0.6 + Math.sin(T * 9) * 0.08;
            const panicNod = Math.sin(T * 6) * 0.08 * slip;  // frantic nodding when slipping
            
            b[B.head].rotation.set(
                -0.75 + headDespair + slip * 0.40 + panicNod,  // looks up + drops + nodding
                Math.sin(T * 2.8) * 0.22 + headShake,  // turns side to side more
                headTilt + Math.sin(T * 7) * 0.10  // tilts with sway + tremor
            );
            // legs dangle and scramble for foothold - MUCH more realistic hanging physics
            const kick = 6 + slip * 12;  // kick faster when slipping
            const legSwing = 0.65 + slip * 0.85;  // wider swings when slipping
            const pendulum = Math.sin(T * 1.6) * 0.12;  // natural pendulum motion
            
            // Left leg - pendulum swing + frantic kicking
            const leftKick = Math.sin(T * kick) * legSwing;
            const leftSpread = 0.25 + Math.sin(T * 2.8) * 0.10;  // legs spread apart
            b[B.l_leg].rotation.set(
                leftKick + 0.18 + pendulum * 0.5,  // forward bend + pendulum
                Math.sin(T * 3.2) * 0.12,  // hip rotation
                leftSpread + Math.sin(T * 2.5) * 0.08  // spread + subtle motion
            );
            
            // Right leg - offset phase for natural alternating motion
            const rightKick = Math.sin(T * kick + 1.4) * legSwing;
            const rightSpread = 0.25 + Math.sin(T * 2.8 + 0.8) * 0.10;
            b[B.r_leg].rotation.set(
                -rightKick + 0.18 - pendulum * 0.5,  // opposite phase
                -Math.sin(T * 3.2 + 0.6) * 0.12,
                -rightSpread - Math.sin(T * 2.5 + 0.5) * 0.08
            );
            // Torso twists and strains with the effort of holding on - MORE EXPRESSIVE
            const torsoStrain = Math.sin(T * 2.2) * 0.10;  // breathing/effort
            const torsoTwist = Math.sin(T * 1.8) * 0.12;  // twisting from strain
            const slipPanic = slip * 0.25;  // more panic when slipping
            
            b[B.body].rotation.set(
                -0.18 + slipPanic + torsoStrain + Math.sin(T * 4.2) * 0.04,  // leans back + panic
                sway * 0.8 + torsoTwist,  // twists with sway + effort
                Math.sin(T * 3.5) * 0.08 + sway * 0.3  // side strain + sway
            );
            topDownBeg(cam, gx, gripY, edgeZ, T);
            const c = choiceRef.current;
            if (c === 'stomp') { phase.current = 'stomp'; pt.current = 0; }
            else if (c === 'save') { phase.current = 'climb'; pt.current = 0; }
        }

        // ── STOMP: cartoon shoe peels his fingers off → plummet ──────────────
        else if (ph === 'stomp') {
            if (T < 0.7) {
                // top-down CLOSE on the shoe pressing his gripping hand
                grip();
                g.position.set(gx, HANG_Y, edgeZ);
                b[B.r_arm].rotation.set(-0.4, 0, 1.9);
                b[B.head].rotation.set(-0.5, 0, 0);
                if (shoeRef.current) {
                    shoeRef.current.visible = true;
                    const k = easeIn(clamp01(T / 0.5));
                    shoeRef.current.position.set(gx, lerp(gripY + 4, gripY + 0.32, k), edgeZ - 0.18);
                    shoeRef.current.rotation.set(-0.5, 0, 0);
                }
                if (T > 0.5 && !sfx.current.stomp) { sfx.current.stomp = true; playFloor3Stomp(); }
                if (T > 0.5) rig.group.scale.set(1.06, 0.92, 1.06);
                cam.x = gx + 2.0; cam.y = gripY + 3.0; cam.z = edgeZ + 2.6; cam.ly = gripY - 0.3; cam.lz = edgeZ; cam.fov = 46;
            } else {
                // plummet — wide side shot following him down
                const e = T - 0.7;
                if (!sfx.current.fall) { sfx.current.fall = true; playFloor3Fall(); }
                const y = HANG_Y - 0.5 * 26 * e * e;
                g.position.set(gx, y, edgeZ);
                g.rotation.set(e * 7, FACE_Y + Math.sin(e * 5) * 0.5, e * 4);
                g.scale.setScalar(DIABRETE_SCALE * Math.max(0.12, 1 - e * 0.45));
                b[B.l_arm].rotation.set(Math.sin(T * 26) * 1.6, 0, 0.3); b[B.r_arm].rotation.set(-Math.sin(T * 26) * 1.6, 0, -0.3);
                b[B.l_leg].rotation.set(Math.sin(T * 22), 0, 0); b[B.r_leg].rotation.set(-Math.sin(T * 22), 0, 0);
                cam.x = gx + 4.2; cam.y = gripY + 0.5; cam.z = edgeZ + 4.2; cam.ly = g.position.y + 0.8; cam.lz = edgeZ; cam.fov = 48;
                if (e > 1.3 && !doneRef.current) { doneRef.current = true; onDone('stomp'); }
            }
        }

        // ── CLIMB (save → betrayal): pulled up by the glove, grins, SHOVES ────
        else if (ph === 'climb') {
            if (gloveRef.current) gloveRef.current.visible = T < 1.3;
            if (T < 0.45) {
                const k = easeOut(clamp01(T / 0.45));
                g.position.set(gx, HANG_Y, edgeZ);
                grip();
                b[B.r_arm].rotation.set(-0.6, 0, lerp(1.7, 2.6, k));            // reach UP to the glove
                if (gloveRef.current) gloveRef.current.position.set(gx, lerp(gripY + 3, gripY + 1.1, k), edgeZ - 0.1);
                if (T > 0.4 && !sfx.current.grab) { sfx.current.grab = true; playFloor3Land(); }
                cam.x = gx + 1.6; cam.y = gripY + 2.4; cam.z = edgeZ + 1.4; cam.ly = gripY; cam.lz = edgeZ; cam.fov = 44;
            } else if (T < 1.3) {
                const k = easeOut(clamp01((T - 0.45) / 0.85));
                g.position.set(gx, lerp(HANG_Y, gripY, k), lerp(edgeZ, gz - 0.2, k));   // hauled up over the lip
                g.rotation.set(lerp(0, -0.1, k), FACE_Y, 0);
                const stretch = 1 + Math.sin(k * Math.PI) * 0.35;
                rig.group.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
                b[B.l_arm].rotation.set(-0.5, 0, lerp(2.5, 1.0, k));
                b[B.r_arm].rotation.set(-0.5, 0, lerp(2.6, 1.0, k));
                b[B.l_leg].rotation.set(lerp(0.3, -0.2, k), 0, 0.1); b[B.r_leg].rotation.set(lerp(0.3, -0.2, k), 0, -0.1);
                b[B.head].rotation.set(0.1, 0, 0);
                if (gloveRef.current) gloveRef.current.position.set(gx, lerp(gripY + 1.1, gripY + 2.4, k), lerp(edgeZ - 0.1, gz, k));
                cam.x = gx - 2.4; cam.y = gripY + 0.6; cam.z = edgeZ + 2.6; cam.ly = g.position.y + 0.8; cam.lz = gz; cam.fov = 46;
            } else if (T < 1.95) {
                // ON TOP — turn to face the player, cocky grin (low hero angle)
                const k = clamp01((T - 1.3) / 0.65);
                const turn = lerp(FACE_Y, 0, clamp01((T - 1.3) / 0.35));   // spin around to face the player
                g.position.set(gx, gripY, gz - 0.2);
                g.rotation.set(lerp(-0.1, 0.1, k), turn, 0);
                const puff = 1 + Math.sin(k * Math.PI) * 0.12;
                rig.group.scale.set(puff, puff, puff);
                b[B.l_arm].rotation.set(0.1, 0, 1.1); b[B.r_arm].rotation.set(0.1, 0, -1.1);   // hands on hips
                b[B.head].rotation.set(0.1, Math.sin(T * 8) * 0.1, -0.1);
                b[B.l_leg].rotation.set(0, 0, 0.08); b[B.r_leg].rotation.set(0, 0, -0.08);
                cam.x = gx + 1.8; cam.y = gripY - 0.3; cam.z = gz + 3.2; cam.ly = gripY + 1.2; cam.lz = gz; cam.fov = 42;
            } else {
                // SHOVE — he lunges with both arms; the PLAYER (camera) is knocked
                // off and plummets, looking UP at the devil shrinking on the ledge.
                const e = T - 1.95;
                const lunge = clamp01(e / 0.22);
                g.position.set(gx, gripY, gz - 0.2 + lunge * 0.7);          // thrust toward the player
                g.rotation.set(lerp(0.1, -0.4, lunge), 0, 0);
                b[B.l_arm].rotation.set(-1.7 * lunge, 0, 0.45); b[B.r_arm].rotation.set(-1.7 * lunge, 0, -0.45);  // both palms shove out
                b[B.head].rotation.set(-0.15, 0, 0);
                const ff = easeIn(clamp01((e - 0.18) / 0.9));               // the player falling
                camRoll = ff * 1.3;
                cam.x = gx + ff * 1.2; cam.y = gripY + 1.0 - ff * 9.0; cam.z = gz + 3.0 + ff * 5.0;
                cam.lx = gx; cam.ly = gripY + 0.8; cam.lz = gz; cam.fov = 48;
                if (e > 0.4 && !sfx.current.shove) { sfx.current.shove = true; playFloor3Shove(); }
                if (e > 1.2 && !doneRef.current) { doneRef.current = true; onDone('save'); }
            }
        }

        // ── Apply the chosen camera shot (hard cuts, cartoon style) ──────────
        camera.position.set(cam.x, cam.y, cam.z);
        camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
        camera.lookAt(cam.lx, cam.ly, cam.lz);
        (camera as THREE.PerspectiveCamera).fov = cam.fov;
        camera.updateProjectionMatrix();
    });

    return (
        <group>
            {/* The cutscene's OWN little map, cloned from the real obby's
                PlatformView tiles (same ink rim + toon top + arrow + palette).
                The first tile is the one he clings to; the rest tumble away far
                below so it reads as "high up the climb", never the start. Top at
                this group's Y, front face at its Z. */}
            <group ref={ledgeRef}>
                {CUTSCENE_TILES.map((t) => <PlatformView key={t.id} plat={t} />)}
            </group>

            <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />

            {/* PISAR — a stylized rubber-hose cartoon shoe (toon + ink outline) */}
            <group ref={shoeRef} visible={false} scale={[1.5, 1.5, 1.5]}>
                <mesh position={[0, 0.55, 0]}>{/* ankle */}
                    <cylinderGeometry args={[0.16, 0.2, 0.5, 14]} />
                    <primitive object={shoeCuff} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0, 0.12, 0.12]} scale={[1.05, 0.8, 1.5]}>{/* bulbous toe */}
                    <sphereGeometry args={[0.3, 16, 12]} />
                    <primitive object={shoeBrown} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0, -0.12, 0.14]} scale={[1.0, 0.5, 1.55]}>{/* sole */}
                    <sphereGeometry args={[0.3, 16, 10]} />
                    <primitive object={shoeSole} attach="material" />
                </mesh>
            </group>

            {/* SALVAR — a stylized white cartoon glove (toon + ink outline) */}
            <group ref={gloveRef} visible={false} scale={[1.35, 1.35, 1.35]} rotation={[Math.PI, 0, 0]}>
                <mesh>{/* palm */}
                    <sphereGeometry args={[0.3, 16, 12]} />
                    <primitive object={gloveWhite} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
                <mesh position={[0.18, 0.2, 0]}><sphereGeometry args={[0.12, 10, 8]} /><primitive object={gloveWhite} attach="material" /><Outlines thickness={0.05} color={INK} /></mesh>
                <mesh position={[-0.05, 0.24, 0]}><sphereGeometry args={[0.12, 10, 8]} /><primitive object={gloveWhite} attach="material" /><Outlines thickness={0.05} color={INK} /></mesh>
                <mesh position={[0, 0.4, 0]}>{/* cuff */}
                    <cylinderGeometry args={[0.2, 0.26, 0.22, 16]} />
                    <primitive object={gloveCuff} attach="material" />
                    <Outlines thickness={0.04} color={INK} />
                </mesh>
            </group>
        </group>
    );
};

// Shared "player looks down over the edge" framing for the catch + beg beats.
function topDownBeg(cam: { x: number; y: number; z: number; lx: number; ly: number; lz: number; fov: number },
                    gx: number, gripY: number, edgeZ: number, T: number) {
    const push = 1 - clamp01((T - 0.95) / 2.5) * 0.16;     // slow push-in
    cam.x = gx + 0.7; cam.y = gripY + (2.7 * push); cam.z = edgeZ + 1.3 - 3.0 * push;
    cam.lx = gx; cam.ly = gripY - 0.45; cam.lz = edgeZ; cam.fov = 48;
}

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
