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
import { LAJES_DA_CUTSCENE, plano, planoDaSuplica, type Palco } from './f3Decupagem';
import { diabreteModel } from './assets/textureImports';

const RIVAL_URL = diabreteModel; // bundled (inlined) — no runtime fetch
const HANG_DROP = 1.5;      // how far below the ledge he dangles (hands clamp the lip, head just under)
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
    /** Qual fala da suplica esta no ar. E ela que dispara o CORTE de camera:
     *  a decupagem em `f3Decupagem` da um plano a cada fala. */
    line: number;
    onBeg: () => void;
    onDone: (outcome: Outcome) => void;
}

// AS LAJES E OS PLANOS MORAM EM `f3Decupagem.ts`. O pedacinho de mapa estava
// aqui dentro, o que impedia qualquer teste de perguntar "esta camera esta
// dentro de uma laje?" — a pergunta que descobriu o quadro preto no meio da
// cena. Agora palco e decupagem sao um modulo puro, e este arquivo so encena.
const CUTSCENE_TILES = LAJES_DA_CUTSCENE;

const Floor3FallCutscene: React.FC<Props> = ({ choice, line, onBeg, onDone }) => {
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
    // A fala entra por ref: o laco de quadro le, mas nao re-renderiza por causa
    // dela. E `tLinha` marca QUANDO ela mudou, que e o instante do corte — a
    // deriva de cada plano recomeca do zero a cada fala.
    const lineRef = useRef(line);
    const tLinha = useRef(0);
    if (lineRef.current !== line) { lineRef.current = line; tLinha.current = -1; }

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
            // A POSICAO E A CAMERA, para a bancada poder dizer em NUMERO se a
            // cena esta viva. Uma foto nao distingue "parado" de "eu fotografei
            // duas vezes a mesma pose".

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

        const palco: Palco = { gx, gripY, edgeZ, hangY: HANG_Y };

        const grip = () => { b[B.l_arm].rotation.set(-0.2, 0, 2.5); };   // left hand clamped on the ledge

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
                // O CONTRA-PLONGEE DAQUI SAIA PRETO. Era `cam.y = HANG_Y + 0.2`
                // olhando para cima — ou seja, filmando a barriga da laje, que e
                // um bloco de tinta. Ver `f3Decupagem`: neste palco so da para
                // filmar DE CIMA. O plano de CORPO INTEIRO e o certo para esta
                // batida: ele escorrega, o corpo despenca e a mao bate na
                // beirada, e e o unico plano de onde da para ver o corpo dele.
                const pl = plano('corpo', palco, clamp01((T - 0.5) / 0.45));
                cam.x = pl.x; cam.y = pl.y; cam.z = pl.z;
                cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov;
            } else {
                const k = clamp01((T - 0.95) / 0.45);
                g.position.set(gx, HANG_Y, edgeZ);
                grip();
                b[B.r_arm].rotation.set(lerp(-0.2, -0.1, k), 0, lerp(2.5, 1.4, k));    // settle toward a reach
                b[B.head].rotation.set(-0.55, 0, 0);
                b[B.l_leg].rotation.set(0.3, 0, 0.15); b[B.r_leg].rotation.set(0.3, 0, -0.15);
                // Termina no MESMO plano em que a suplica comeca (o de cima),
                // para a passagem intro→beg nao ter um corte sem motivo.
                const pl = planoDaSuplica(0, palco, clamp01((T - 0.95) / 2.5));
                cam.x = pl.x; cam.y = pl.y; cam.z = pl.z;
                cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov;
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
            g.position.set(gx + sway * 0.12 + strain, HANG_Y - sag - slip * 0.24, edgeZ);
            g.rotation.set(-0.04 + slip * 0.12, FACE_Y, sway + strain);
            // BOTH hands clamp the lip so he clearly hangs by his arms (head below
            // the edge), trembling with the strain. The free (right) hand lets go
            // periodically to plead straight up, then snaps back to re-grip — but
            // on a slip it always grabs.
            b[B.l_arm].rotation.set(0.1 + strain, 0, 2.45 - slip * 0.1);          // left clamped on the lip
            const pCyc = T % 1.9;
            const pleading = pCyc > 0.45 && pCyc < 1.25 && slip < 0.2;
            if (pleading) {
                const pr = Math.sin(((pCyc - 0.45) / 0.8) * Math.PI);            // 0→1→0 reach
                // fling the free hand UP over the lip toward the player (the camera
                // above) — the money beat for the top-down "looking down at him" shot
                b[B.r_arm].rotation.set(lerp(0.1, -2.0, pr), lerp(0, 0.5, pr), lerp(-2.45, -0.8, pr));
            } else {
                b[B.r_arm].rotation.set(0.1 + strain, 0, -2.45 + slip * 0.1);    // right clamped too
            }
            b[B.head].rotation.set(-0.5 + Math.sin(T * 4.5) * 0.1 + slip * 0.3, 0.25 + Math.sin(T * 2.6) * 0.12, sway * 0.4);
            // legs scramble/bicycle-kick for a foothold, frantic on a slip
            const kick = 7 + slip * 9;
            b[B.l_leg].rotation.set(Math.sin(T * kick) * (0.55 + slip * 0.5), 0, 0.18);
            b[B.r_leg].rotation.set(-Math.sin(T * kick + 1.1) * (0.55 + slip * 0.5), 0, -0.18);
            b[B.body].rotation.set(-0.06 + slip * 0.14, sway * 0.5, 0);
            // ── O CORTE ──────────────────────────────────────────────
            // Aqui morava `topDownBeg(...)` — UM plano, do comeco ao fim das
            // oito falas. Medido: a camera andava 11 cm em 24 s. Agora cada
            // fala tem o seu plano (f3Decupagem) e a troca de fala e o corte.
            if (tLinha.current < 0) tLinha.current = T;
            const naFala = T - tLinha.current;
            const pl = planoDaSuplica(lineRef.current, palco, naFala / 3.2);
            cam.x = pl.x; cam.y = pl.y; cam.z = pl.z;
            cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov;
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

        // ── A SONDA LE DEPOIS, NAO ANTES ──────────────────────────────────
        // Ela ficava no topo deste callback e reportava a camera do <Player>,
        // que roda antes no quadro — numeros reais, do objeto errado. Aqui
        // embaixo e a camera que de fato foi renderizada.
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            const w = window as any;
            const gg = groupRef.current;
            if (gg) w.__f3DevilPos = { x: gg.position.x, y: gg.position.y, z: gg.position.z };
            w.__fallCam = [
                +camera.position.x.toFixed(2), +camera.position.y.toFixed(2),
                +camera.position.z.toFixed(2), +(camera as THREE.PerspectiveCamera).fov.toFixed(1),
            ];
            w.__fallLinha = lineRef.current;
            // A ALTURA REAL DA CABECA. `f3Decupagem` precisa dela para saber o
            // que enquadrar, e ate aqui esse numero era um CHUTE meu, lido de
            // uma foto. O osso sabe.
            const cab = rig.bones[B.head];
            if (cab) {
                cab.updateWorldMatrix(true, false);
                const wp = new THREE.Vector3().setFromMatrixPosition(cab.matrixWorld);
                w.__f3Cabeca = [+wp.x.toFixed(3), +wp.y.toFixed(3), +wp.z.toFixed(3)];
            }
            w.__f3Beirada = [+gx.toFixed(3), +gripY.toFixed(3), +edgeZ.toFixed(3)];
        }
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

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
