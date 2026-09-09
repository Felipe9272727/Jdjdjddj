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

import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { quadroDaPose } from './f3Pose';
import { enquadrar, afastar } from './f3Enquadramento';
import { olhoDoDiabrete } from './f3Olhos';
import { sobrancelhaDoDiabrete } from './f3Sobrancelha';
import { useGLTF, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { f3DevilPos, f3DevilPosValid, devilStageBase } from './f3Hazards';
import { playFloor3Land, playFloor3Fall, playFloor3Dizzy, playFloor3Stomp, playFloor3Shove } from './floor3Sfx';
import { PlatformView } from './Floor3';
import { LAJES_DA_CUTSCENE, plano, planoDaSuplica, type Palco } from './f3Decupagem';
import { diabreteModel } from './assets/textureImports';
import { createF3ActingLayer } from './f3Acting';

const RIVAL_URL = diabreteModel; // bundled (inlined) — no runtime fetch
const HANG_DROP = 1.5;      // how far below the ledge he dangles (hands clamp the lip, head just under)
const EDGE_Z    = 0.35;     // he hangs just off the front edge (abyss side)
const FACE_Y    = Math.PI;  // turn him to FACE the platform / the player
const INK = '#0a0712';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
// App advances these exact lines with 3.2 s for Diabrete and 2.5 s for player.
// Keep the acting-layer `speaking` flag tied to the live line window so the
// waiting-for-choice beat can use its listening gaze after the final voice ends.
const FALL_LINE_ENDS = [3.2, 5.7, 8.9, 11.4, 14.6, 17.1, 20.3, 23.5] as const;

// ── AS CORES DOS DOIS PROPS ──────────────────────────────────────────────────
// O couro era `#7a4a24`, um marrom médio: sob a grade do andar (sat −0,62,
// sépia 0,5) ele vira exatamente o tom do fundo creme sujo, e a bota sumia por
// VALOR antes mesmo de sumir por forma. O andar inteiro é de dois tons — creme e
// tinta — e estes dois objetos passam a obedecer a isso: couro escuro, virola e
// cadarço claros, para a peça ter linha interna e não virar mancha.
// E DEPOIS EU INVERTI OS DOIS. A bota escura sumia igual: neste plano o fundo
// já é escuro — a borda de tinta da laje e a cabeça do Diabrete —, então massa
// escura em cima de massa escura dá mancha, exatamente como os espinhos davam
// em cima dos postes. Aqui a regra vira do avesso: a bota é CLARA, com contorno
// de tinta grosso e sola de tinta. O cano continua escuro, então a peça tem
// contraste dentro dela mesma e lê como perna preta calçando bota clara — que é
// o pé de qualquer boneco de 1930.
const shoeCouro   = new THREE.MeshToonMaterial({ color: '#f2e9d5' });
const shoeSola    = new THREE.MeshToonMaterial({ color: '#17121d' });
const shoeCano    = new THREE.MeshToonMaterial({ color: '#15101a' });
// (a virola vermelha lia como uma caixinha marrom solta no meio do preto;
//  virou tinta, e quem separa perna de bota passou a ser a própria linha)
const shoeVirola  = new THREE.MeshToonMaterial({ color: '#15101a' });
const shoeCadarco = new THREE.MeshToonMaterial({ color: '#140c08' });
const gloveWhite   = new THREE.MeshToonMaterial({ color: '#f7f3ea' });
const gloveCuff    = new THREE.MeshToonMaterial({ color: '#c0271a' });
const gloveCostura = new THREE.MeshToonMaterial({ color: '#140c08' });
const puffMat    = new THREE.MeshToonMaterial({ color: '#ffffff' });
// O CASCO DE TINTA, compartilhado por quem precisa de linha a distância: uma
// cópia maior da própria forma, desenhada de dentro para fora. É o truque das
// nuvens do andar, e é o único contorno que não some nem pontilha aqui.
const cascoTinta = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, depthWrite: false });
const puffTinta  = cascoTinta;
const estrelaMat = new THREE.MeshToonMaterial({ color: INK });

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
    const { camera, size: tamanho } = useThree();
    const groupRef = useRef<THREE.Group>(null!);
    const ledgeRef = useRef<THREE.Group>(null!);
    const shoeRef  = useRef<THREE.Group>(null!);
    const gloveRef = useRef<THREE.Group>(null!);
    const puffRef  = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);
    const acting = useMemo(() => createF3ActingLayer(), []);
    // ── O CLÍMAX TAMBÉM DESLIZAVA ────────────────────────────────────────
    // A varredura das voltas 27–30 achou o Diabrete deslizando na apresentação e
    // na perseguição, e consertou os dois. Esta cena — que é o CLÍMAX do andar,
    // com ele pendurado no abismo implorando — tinha vinte e cinco senos
    // contínuos e nenhuma quantização. É a cena que o jogador olha mais de
    // perto, porque a câmera está nele e não há nada para fazer além de olhar.
    //
    // Mesmo remédio do `Floor3Rival`: instantâneo dos ossos entre um desenho e
    // outro. Este arquivo tem quatro fases (queda, agarrada, súplica, desfecho)
    // escrevendo ossos em ramos diferentes, e embrulhar as quatro seria muito
    // risco para um efeito idêntico.
    const quadroPose = useRef(-1);
    const poseGuardada = useRef<{ p: THREE.Vector3; r: THREE.Euler }[] | null>(null);

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

    useEffect(() => () => acting.dispose(), [acting]);

    useFrame((_, dt) => {
        // Reset additive acting offsets before every phase branch/early return.
        acting.begin();
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
        g.visible = true;
        g.rotation.set(0, FACE_Y, 0);                  // FACE the platform / player
        // the cliff he clings to (top at gripY, front edge at z=gz) so he never floats
        if (ledgeRef.current) ledgeRef.current.position.set(gx, gripY, gz);
        if (shoeRef.current) shoeRef.current.visible = false;
        if (gloveRef.current) gloveRef.current.visible = false;

        // camera control — set per shot (see the switch at the bottom)
        let camRoll = 0;
        // `largura` diz a `enquadrar` de quanta abertura horizontal ESTE plano
        // precisa numa tela em pé — ver a nota longa em `f3Enquadramento`. Os
        // planos escritos aqui na mão são todos largos (mostram a queda, a
        // escadaria, o sapato descendo), então ficam no padrão; quem pede outra
        // coisa são os planos de figura da decupagem, e eles trazem o número.
        const cam = { x: gx, y: gripY + 3, z: gz - 2.4, lx: gx, ly: gripY - 0.7, lz: edgeZ, fov: 44,
            largura: undefined as number | undefined };

        const palco: Palco = { gx, gripY, edgeZ, hangY: HANG_Y };

        // ── A CARA ───────────────────────────────────────────────────────────
        // Esta cena é a que MAIS precisa de cara: ele está pendurado no abismo
        // implorando, e até agora fazia isso de olho parado. Cada fase tem a sua
        // — e nenhuma delas é de deboche, que é o que o teste de `f3Olhos`
        // cobra para a súplica.
        //
        // A `fase` da piscada é 0,37 para ele NÃO piscar junto com o Diabrete da
        // perseguição, caso os dois apareçam na mesma tela.
        const caraDaFase = ph === 'intro' ? 'roubou'
            : ph === 'beg' ? 'suplica'
            : ph === 'stomp' ? 'perdeuOUltimo'
            : 'vitorioso';
        rig.definirCara(olhoDoDiabrete(caraDaFase, 3), sobrancelhaDoDiabrete(caraDaFase, 3), T + 0.37);

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
                cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov; cam.largura = pl.largura;
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
                cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov; cam.largura = pl.largura;
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
            cam.lx = pl.lx; cam.ly = pl.ly; cam.lz = pl.lz; cam.fov = pl.fov; cam.largura = pl.largura;
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
                // MAIS PERTO, MAS NÃO TANTO. A 2,4 m com a bota a 2,1 ela ficou
                // MAIOR QUE O QUADRO — um borrão creme sem contorno, que é o
                // mesmo defeito de antes com o sinal trocado. Medido nas duas
                // pontas na bancada; este é o meio: a bota ocupa cerca de um
                // terço da largura, com sola, cadarço e cano todos dentro.
                cam.x = gx + 1.7; cam.y = gripY + 2.5; cam.z = edgeZ + 2.05; cam.ly = gripY - 0.2; cam.lz = edgeZ; cam.fov = 45;
            } else {
                // ── A QUEDA, EM QUATRO TEMPOS ────────────────────────────
                //
                // Ela era um só: gravidade desde o primeiro quadro, com o boneco
                // encolhendo por conta de `scale`. Na folha de contato deram
                // CINCO QUADROS de um pontinho diminuindo em creme vazio. Nenhum
                // gag, nenhum remate — o clímax do andar terminava numa mosca.
                //
                // Um desenho de 1930 não deixa ninguém cair assim. Primeiro a
                // gravidade NÃO PERCEBE: ele fica no ar pedalando, olha para a
                // câmera, e só então despenca. Depois a câmera CAI JUNTO, para
                // dar para ver o esperneio; se ela ficar parada ele vira uma
                // mosca em dois segundos. Só no fim ela para e deixa ele sumir
                // na distância — e aí vem a pontuação, que é o que diz "acabou".
                const e = T - 0.7;
                const NO_AR = 0.34;          // o tempo em que a gravidade não percebe
                const SOLTA = 0.95;          // quando a câmera para de acompanhar
                const q = Math.max(0, e - NO_AR);
                const queda = (t: number) => HANG_Y + 0.35 - 0.5 * 30 * t * t;
                const y = queda(q);
                g.position.set(gx, y, edgeZ);

                if (e < NO_AR) {
                    // ── 1. O AR ──────────────────────────────────────────
                    // Ele corre parado. As pernas pedalam depressa, os braços
                    // moinham, e a cabeça vira para a câmera — a piada é ele
                    // perceber antes de cair.
                    const k = e / NO_AR;
                    b[B.l_leg].rotation.set(Math.sin(T * 34), 0, 0.1);
                    b[B.r_leg].rotation.set(-Math.sin(T * 34), 0, -0.1);
                    b[B.l_arm].rotation.set(Math.sin(T * 30) * 2.2, 0, 0.6);
                    b[B.r_arm].rotation.set(-Math.sin(T * 30) * 2.2, 0, -0.6);
                    b[B.head].rotation.set(-0.15, lerp(0.4, 0, k), 0);
                    g.rotation.set(0, FACE_Y, Math.sin(T * 18) * 0.05);
                    cam.x = gx + 2.6; cam.y = HANG_Y + 1.2; cam.z = edgeZ + 2.6;
                    cam.ly = HANG_Y + 0.2; cam.lz = edgeZ; cam.fov = 46;
                } else {
                    // ── 2/3. A QUEDA, E O SUMIÇO ─────────────────────────
                    if (!sfx.current.fall) { sfx.current.fall = true; playFloor3Fall(); }
                    g.rotation.set(q * 6, FACE_Y + Math.sin(q * 5) * 0.6, q * 3.4);
                    b[B.l_arm].rotation.set(Math.sin(T * 26) * 1.8, 0, 0.3);
                    b[B.r_arm].rotation.set(-Math.sin(T * 26) * 1.8, 0, -0.3);
                    b[B.l_leg].rotation.set(Math.sin(T * 22) * 1.2, 0, 0);
                    b[B.r_leg].rotation.set(-Math.sin(T * 22) * 1.2, 0, 0);
                    // A câmera desce junto até `SOLTA` e depois fica: assim se vê
                    // o esperneio de perto, e só no fim ele encolhe de verdade.
                    const yCam = e < SOLTA ? y : queda(SOLTA - NO_AR);
                    cam.x = gx + 3.4; cam.y = yCam + 1.5; cam.z = edgeZ + 3.4;
                    cam.ly = (e < SOLTA ? y : Math.max(y, yCam - 14)) + 0.4;
                    cam.lz = edgeZ; cam.fov = 48;
                }

                // ── 4. A PONTUAÇÃO ───────────────────────────────────────
                // Um baque de tinta e uma estrelinha onde ele sumiu. Não está em
                // escala com nada — pontuação de desenho nunca está; ela existe
                // para dizer que acabou.
                const PUFF_EM = 1.30;
                if (puffRef.current) {
                    const vivo = e >= PUFF_EM && e < PUFF_EM + 0.55;
                    puffRef.current.visible = vivo;
                    if (vivo) {
                        const k = (e - PUFF_EM) / 0.55;
                        const yFim = queda(SOLTA - NO_AR) - 11;
                        puffRef.current.position.set(gx, yFim, edgeZ);
                        // ABRE E CORTA, não dissolve. A primeira versão baixava a
                        // opacidade e o baque virava uma nuvem CINZA se apagando —
                        // creme translúcido sobre creme não some, fica sujo, e
                        // pontuação de desenho nunca desbota: ela abre e sai.
                        puffRef.current.scale.setScalar(1.2 + easeOut(k) * 2.4);
                        puffRef.current.rotation.z = k * 0.45;
                        // E ELE JÁ SE FOI. O boneco continuava lá dentro do baque,
                        // como um pontinho no meio da fumaça — o que desmancha
                        // justamente a piada de ele ter sumido.
                        g.visible = false;
                    }
                    if (!vivo && e >= PUFF_EM) g.visible = false;
                }
                if (e > PUFF_EM + 0.5 && !doneRef.current) { doneRef.current = true; onDone('stomp'); }
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
                const mobile = tamanho.height < 520 || tamanho.width < 700;
                camRoll = ff * (mobile ? 0.10 : 0.30);
                cam.x = gx + ff * 1.2; cam.y = gripY + 1.0 - ff * 9.0; cam.z = gz + 3.0 + ff * 5.0;
                cam.lx = gx; cam.ly = gripY + 0.8; cam.lz = gz; cam.fov = 48;
                if (e > 0.4 && !sfx.current.shove) { sfx.current.shove = true; playFloor3Shove(); }
                if (e > 1.2 && !doneRef.current) { doneRef.current = true; onDone('save'); }
            }
        }

        // ── Apply the chosen camera shot (hard cuts, cartoon style) ──────────
        // Mesma correcao da cutscene de apresentacao: estes vinte e poucos
        // planos foram compostos em 1024x640, e `fov` no three e VERTICAL. Numa
        // tela de celular em pe a abertura horizontal cai por 3,5 e o plano
        // vira close. Ver `f3Enquadramento`. Em tela larga nada muda.
        const enq = enquadrar(cam.fov, tamanho.width / Math.max(1, tamanho.height),
            undefined, cam.largura);
        const olho = afastar({ x: cam.x, y: cam.y, z: cam.z },
            { x: cam.lx, y: cam.ly, z: cam.lz }, enq.recuo);
        camera.position.set(olho.x, olho.y, olho.z);
        camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
        camera.lookAt(cam.lx, cam.ly, cam.lz);
        (camera as THREE.PerspectiveCamera).fov = enq.fov;
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

        // ── SEGURA O DESENHO ─────────────────────────────────────────────────
        // Ver o comentário de `quadroPose`. A pose fica parada entre um desenho
        // e outro; a POSIÇÃO no mundo e a CÂMERA continuam contínuas, porque ele
        // está caindo e uma queda que anda aos saltos vira defeito, não estilo.
        const qp = quadroDaPose(T);
        if (qp !== quadroPose.current || !poseGuardada.current) {
            quadroPose.current = qp;
            // Sem `.clone()`: o buffer nasce uma vez e é REESCRITO. Clonar 7
            // Vector3 e 7 Euler doze vezes por segundo é lixo para o coletor num
            // aparelho modesto, e a regra número um deste jogo é o celular do
            // dono. Copiar para dentro custa o mesmo e não aloca nada.
            const ossos = rig.bones;
            if (!poseGuardada.current) {
                poseGuardada.current = ossos.map(() => ({ p: new THREE.Vector3(), r: new THREE.Euler() }));
            }
            for (let k = 0; k < ossos.length; k++) {
                poseGuardada.current[k].p.copy(ossos[k].position);
                poseGuardada.current[k].r.copy(ossos[k].rotation);
            }
        } else {
            const g = poseGuardada.current;
            for (let k = 0; k < rig.bones.length && k < g.length; k++) {
                rig.bones[k].position.copy(g[k].p);
                rig.bones[k].rotation.copy(g[k].r);
            }
        }

        // Apply additive acting only after the em-dois restore, so the layer's
        // offsets survive held drawings without accumulating frame over frame.
        const cue = acting.apply(rig.bones, {
            scene: 'fall', phase: ph, time: T, phaseTime: T,
            line: lineRef.current,
            speaking: ph === 'beg' && lineRef.current >= 0
                && T < (FALL_LINE_ENDS[lineRef.current] ?? 0),
        });
        if (cue.eye || cue.brow) {
            const baseEye = olhoDoDiabrete(caraDaFase, 3);
            const baseBrow = sobrancelhaDoDiabrete(caraDaFase, 3);
            rig.definirCara(cue.eye ?? baseEye, cue.brow ?? baseBrow, T + 0.37);
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

            {/* ── PISAR: A BOTA ─────────────────────────────────────────
                A primeira versão era um cilindro, uma esfera e outra esfera —
                e na foto do desfecho saía como UMA BOLA MARROM descendo. É o
                objeto que representa a escolha do jogador, e era a coisa menos
                legível da cena inteira.

                O que faz uma bota de 1930 ser lida não é volume, é SILHUETA
                recortada: bico bulboso, salto, cano, e linhas de tinta POR
                DENTRO separando as partes. Sem linha interna, qualquer massa
                escura vira mancha — foi o mesmo diagnóstico dos espinhos e da
                cabeça do Diabrete, três vezes o mesmo erro neste andar. */}
            <group ref={shoeRef} visible={false} scale={[1.75, 1.75, 1.75]}>
                {/* O CONTORNO É CASCO À MÃO, e não `<Outlines>`. Com o `<Outlines>`
                    do drei ele saía PONTILHADO: o casco do componente briga em
                    profundidade com a peça quando o grupo está escalado, e o que
                    se via era uma linha tracejada em volta de uma bota clara
                    encostada num convés claro — ou seja, quase nenhuma linha.
                    Este andar já tinha a resposta nas nuvens e o baque acabou de
                    usá-la: uma cópia um pouco maior, desenhada de dentro para
                    fora (`BackSide`), sem escrever profundidade. */}
                {([
                    // [posição, escala do grupo, geometria, material, engorda]
                    // A ENGORDA É EM FRAÇÃO DA PEÇA, e peça pequena precisa de
                    // fração grande: a 1,10 numa esfera de 27 cm o casco sobra
                    // 2,7 cm, que a três metros são dois pixels — ou seja, linha
                    // nenhuma. As nuvens usam 1,07 porque são esferas de metros.
                    [[0, 0.72, -0.04], [1, 1, 1], 'cano', shoeCano, 1.16],
                    [[0, 0.36, -0.04], [1, 1, 1], 'virola', shoeVirola, 1.14],
                    [[0, 0.19, 0.02], [1, 0.85, 1.15], 'peito', shoeCouro, 1.24],
                    [[0, 0.13, 0.34], [1.12, 0.78, 1.35], 'bico', shoeCouro, 1.24],
                    [[0, 0.03, -0.24], [0.85, 0.55, 0.7], 'salto', shoeSola, 1.26],
                    [[0, -0.06, 0.14], [1.12, 0.40, 1.58], 'sola', shoeSola, 1.22],
                ] as const).map(([pos, esc, qual, mat, engorda]) => (
                    <group key={qual} position={pos as unknown as [number, number, number]}
                           scale={esc as unknown as [number, number, number]}>
                        <mesh scale={engorda}>
                            {qual === 'cano' ? <cylinderGeometry args={[0.19, 0.24, 0.78, 16]} />
                             : qual === 'virola' ? <cylinderGeometry args={[0.27, 0.27, 0.11, 16]} />
                             : qual === 'peito' ? <sphereGeometry args={[0.27, 16, 12]} />
                             : qual === 'bico' ? <sphereGeometry args={[0.26, 16, 12]} />
                             : qual === 'salto' ? <sphereGeometry args={[0.24, 12, 10]} />
                             : <sphereGeometry args={[0.27, 16, 10]} />}
                            <primitive object={cascoTinta} attach="material" />
                        </mesh>
                        <mesh>
                            {qual === 'cano' ? <cylinderGeometry args={[0.19, 0.24, 0.78, 16]} />
                             : qual === 'virola' ? <cylinderGeometry args={[0.27, 0.27, 0.11, 16]} />
                             : qual === 'peito' ? <sphereGeometry args={[0.27, 16, 12]} />
                             : qual === 'bico' ? <sphereGeometry args={[0.26, 16, 12]} />
                             : qual === 'salto' ? <sphereGeometry args={[0.24, 12, 10]} />
                             : <sphereGeometry args={[0.27, 16, 10]} />}
                            <primitive object={mat} attach="material" />
                        </mesh>
                    </group>
                ))}
                {/* dois cadarços de tinta cruzando o peito do pé */}
                {[0.10, 0.22].map((z) => (
                    <mesh key={z} position={[0, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.028, 0.028, 0.42, 8]} />
                        <primitive object={shoeCadarco} attach="material" />
                    </mesh>
                ))}
            </group>

            {/* ── O BAQUE ───────────────────────────────────────────────
                A pontuação da queda: cinco bolotas de tinta abrindo e uma
                estrela de quatro pontas no meio. É o que um curta desenha quando
                alguém some — sem isto o clímax do andar terminava numa mosca
                diminuindo em creme vazio. */}
            <group ref={puffRef} visible={false}>
                {/* O CONTORNO É CASCO INVERTIDO FEITO À MÃO, e não `<Outlines>`.
                    O andar já tinha aprendido isso nas nuvens: o Outlines do drei
                    fica SUB-PIXEL a esta distância e some. Uma esfera é
                    radialmente simétrica, então aumentá-la um pouco e desenhá-la
                    de dentro para fora dá um contorno perfeitamente uniforme —
                    de graça, com `BackSide`. É o mesmo truque das nuvens, pelo
                    mesmo motivo. */}
                {[[0, 0], [0.9, 0.25], [-0.9, 0.2], [0.45, -0.7], [-0.5, -0.65]].map(([px, py], i) => (
                    <group key={i} position={[px, py, 0]} scale={i === 0 ? 1 : 0.72}>
                        <mesh scale={1.14}>
                            <sphereGeometry args={[0.55, 12, 10]} />
                            <primitive object={puffTinta} attach="material" />
                        </mesh>
                        <mesh>
                            <sphereGeometry args={[0.55, 12, 10]} />
                            <primitive object={puffMat} attach="material" />
                        </mesh>
                    </group>
                ))}
                {/* A estrela é de TINTA, não vermelha: sob a grade do andar o
                    vermelho vira um marrom que, num baque creme, lê como um
                    graveto. Preto sobre creme lê como estrela. */}
                {/* AS PONTAS SAEM DE TRÁS DO BAQUE, e são TRÊS cruzadas a 60°.
                    As duas primeiras estavam a 33° uma da outra e se somavam numa
                    barra só: na foto a "estrela" era um graveto preto atravessado
                    ao lado da fumaça. Cruzadas de verdade e atrás das bolotas,
                    elas viram o que são — as pontas espocando por trás. */}
                {[0, Math.PI / 3, (2 * Math.PI) / 3].map((r) => (
                    <mesh key={r} position={[0, 0, -0.55]} rotation={[0, 0, r]}>
                        <boxGeometry args={[2.7, 0.26, 0.06]} />
                        <primitive object={estrelaMat} attach="material" />
                    </mesh>
                ))}
            </group>

            {/* ── SALVAR: A LUVA ────────────────────────────────────────
                Mesma doença da bota: uma bola grande e duas bolinhas, que de
                cima viravam um caroço. Uma luva de desenho é reconhecida por
                DEDOS SEPARADOS e pelos três riscos de costura nas costas da mão
                — tirando isso, sobra uma bola branca.

                E ela mora no eixo Y, não no Z. A primeira remontagem pôs os
                dedos apontando para +Z; com o `rotation={[π,0,0]}` do grupo (que
                é o que faz a mão descer de cima), o resultado foi o PUNHO
                VERMELHO de topo enchendo o quadro, com os dedos escondidos atrás
                — um casquinho de sorvete marrom. Os dedos vão para +Y, que
                depois do giro aponta para baixo, na direção do Diabrete. */}
            <group ref={gloveRef} visible={false} scale={[1.4, 1.4, 1.4]} rotation={[Math.PI, 0, 0]}>
                {/* a palma, achatada como uma mão e não redonda como uma bola */}
                <mesh scale={[1.08, 1.0, 0.68]}>
                    <sphereGeometry args={[0.30, 16, 12]} />
                    <primitive object={gloveWhite} attach="material" />
                    <Outlines thickness={0.12} color={INK} />
                </mesh>
                {/* QUATRO DEDOS em leque — é a separação entre eles que faz a
                    mão ser uma mão, e não uma bola. */}
                {[-0.19, -0.065, 0.065, 0.19].map((x, i) => {
                    const comp = 0.28 - Math.abs(i - 1.5) * 0.05;
                    return (
                        <mesh key={x} position={[x, 0.28 + comp * 0.3, 0]}
                              rotation={[0, 0, -x * 1.1]} scale={[1, 1, 0.8]}>
                            <capsuleGeometry args={[0.077, comp, 4, 10]} />
                            <primitive object={gloveWhite} attach="material" />
                            <Outlines thickness={0.12} color={INK} />
                        </mesh>
                    );
                })}
                {/* o POLEGAR, curto e de lado: é ele que diz que aquilo é uma mão */}
                <mesh position={[-0.31, 0.10, 0]} rotation={[0, 0, 1.15]} scale={[1, 1, 0.8]}>
                    <capsuleGeometry args={[0.085, 0.19, 4, 10]} />
                    <primitive object={gloveWhite} attach="material" />
                    <Outlines thickness={0.12} color={INK} />
                </mesh>
                {/* os TRÊS RISCOS de costura nas costas da mão */}
                {[-0.11, 0, 0.11].map((x) => (
                    <mesh key={x} position={[x, 0.02, -0.20]} rotation={[0.2, 0, 0]}>
                        <cylinderGeometry args={[0.018, 0.018, 0.28, 8]} />
                        <primitive object={gloveCostura} attach="material" />
                    </mesh>
                ))}
                {/* o punho vermelho, na base */}
                <mesh position={[0, -0.30, 0]}>
                    <cylinderGeometry args={[0.30, 0.24, 0.24, 16]} />
                    <primitive object={gloveCuff} attach="material" />
                    <Outlines thickness={0.12} color={INK} />
                </mesh>
            </group>
        </group>
    );
};

useGLTF.preload(RIVAL_URL);
export default Floor3FallCutscene;
