/**
 * Floor3Cutscene.tsx — the Diabrete's PERFORMANCE during the meet-the-rival
 * dialogue that plays the instant the Floor 3 doors open.
 *
 * Same procedurally-rigged character as Floor3Rival (diabreteRig), but instead
 * of running it stands on the landing facing the player and ACTS each scripted
 * beat with big, springy rubber-hose motion: it hops, twists, throws its arms,
 * shakes when it laughs — then, on the final 'dash' beat, it squashes, springs
 * and rockets off up the course, handing the screen back to gameplay.
 *
 * It drives `targetRef` (the dialogue camera's look-at) to the character's
 * FEET — the dialogue camera then adds its own look/camera height, so feeding
 * it the feet (like every NPC ref) frames the devil correctly instead of
 * aiming over his head (which made him look tiny). Advances the DOM line via
 * `onLine` and calls `onDone` when the dash clears frame.
 */

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { buildDiabreteRig, B, DIABRETE_SCALE, type DiabreteRig } from './diabreteRig';
import { DIABRETE_SCRIPT, SCRIPT_TOTAL, lineAt, timeInLine, type Gesture } from './diabreteScript';
import { playFloor3Voice } from './floor3Sfx';
import { vozDoDiabrete } from './f3Voz';
import { bocaNoInstante, expressaoDoDiabrete, quadroDaBoca, type NomeDaBoca } from './f3Boca';
// ARM_REST vem de `f3Pose` junto com a atuação: era declarado aqui TAMBÉM,
// e dois donos do mesmo número é como uma pose passa a discordar da outra.
import { poseDoGesto, quadroDaPose, tempoDaPose, POSE_HZ, ARM_REST } from './f3Pose';
import { f3PlayerZ } from './f3Parkour';
import { diabreteModel } from './assets/textureImports';
import { planoDaApresentacao, PALCO_DA_APRESENTACAO } from './f3Decupagem';

const RIVAL_URL = diabreteModel; // bundled (inlined) — no runtime fetch
const STAND     = new THREE.Vector3(0.9, 0, -9.2);   // on the landing, ahead of the player

interface Props {
    targetRef: React.MutableRefObject<THREE.Vector3>;   // camera look-at (feet)
    onLine: (i: number) => void;
    onDone: () => void;
}

class Spring {
    value = 0; vel = 0;
    constructor(readonly k = 22, readonly d = 7) {}
    tick(target: number, dt: number) {
        this.vel += (-this.k * (this.value - target) - this.d * this.vel) * dt;
        this.value += this.vel * dt;
        return this.value;
    }
    reset(v = 0) { this.value = v; this.vel = 0; }
}

const Floor3Cutscene: React.FC<Props> = ({ targetRef, onLine, onDone }) => {
    const { scene: gltf } = useGLTF(RIVAL_URL);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null!);
    const rigRef   = useRef<DiabreteRig | null>(null);

    const clock    = useRef(0);
    const lineRef  = useRef(-1);
    const doneRef  = useRef(false);
    const dashPos  = useRef(new THREE.Vector3().copy(STAND));
    // Qual fala está no ar e quando ela entrou — é a troca que dispara o CORTE.
    const linhaRef = useRef(-1);
    const vozDaLinha = useRef<ReturnType<typeof vozDoDiabrete> | null>(null);
    const quadroBoca = useRef(-1);
    const quadroPose = useRef(-1);
    const poseRef = useRef(poseDoGesto('idle', 0));
    const tLinha   = useRef(0);

    // Springs for limber, weighty motion.
    const sLean  = useRef(new Spring(16, 5.5));
    const sArmL  = useRef(new Spring(24, 5.5));
    const sArmR  = useRef(new Spring(24, 5.5));
    const sArmLx = useRef(new Spring(28, 5.5));
    const sArmRx = useRef(new Spring(28, 5.5));
    const sHead  = useRef(new Spring(20, 5.5));

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const rig = buildDiabreteRig(gltf);
        if (!rig) { console.warn('[Diabrete cutscene] no mesh in GLB'); return; }
        group.add(rig.group);
        rigRef.current = rig;
        clock.current = 0;
        lineRef.current = -1;
        doneRef.current = false;
        dashPos.current.copy(STAND);
        sLean.current.reset(0.12);
        sArmL.current.reset(ARM_REST); sArmR.current.reset(ARM_REST);
        sArmLx.current.reset(0); sArmRx.current.reset(0);
        sHead.current.reset(0);
        return () => { group.remove(rig.group); rig.dispose(); rigRef.current = null; };
    }, [gltf]);

    useFrame((_, dt) => {
        const rig = rigRef.current;
        if (!groupRef.current || !rig) return;
        const safeDt = Math.min(dt, 0.05);
        const bones = rig.bones;
        clock.current += safeDt;
        const t = clock.current;

        const li = lineAt(t);
        const line = DIABRETE_SCRIPT[li];
        if (li !== lineRef.current) {
            lineRef.current = li;
            onLine(li);
            // ── A APRESENTAÇÃO DEIXA DE SER MUDA ─────────────────────────
            // A cutscene da queda já tinha quatro batidas de som; esta, que é
            // onde o andar apresenta o vilão, não tinha nenhuma. Uma nota de
            // trombone por palavra, na abertura do arco (`roubados: 0`): grave,
            // gordo, seguro de si. É contra este timbre que a súplica lá no
            // fim, com os três pincéis perdidos, vai soar rachada.
            if (line) playFloor3Voice(line.text, {
                roubados: 0,
                quem: line.speaker === 'player' ? 'jogador' : 'diabrete',
            });
            // A BOCA LÊ A MESMA PARTITURA QUE O TROMBONE. `vozDoDiabrete` já
            // decidiu quantas notas a frase tem e quais são acento; guardar a
            // partitura aqui é o que faz o desenho bater com o som em vez de
            // andar do lado dele. A fala do JOGADOR não mexe na boca dele.
            vozDaLinha.current = (line && line.speaker !== 'player')
                ? vozDoDiabrete(line.text, { roubados: 0 }) : null;
        }
        const gesture: Gesture = line?.gesture ?? 'idle';
        const tl = timeInLine(t);
        const dashing = gesture === 'dash';

        // ── A POSE, EM DOIS ──────────────────────────────────────────────────
        //
        // A atuação saiu daqui para `f3Pose.ts` e passou a ser desenhada EM
        // DOIS: 12 poses por segundo, paradas entre uma e outra, que é como um
        // curta de 1930 é feito. Antes ela era `Math.sin(t)` avaliado todo
        // quadro — o corpo dele DESLIZAVA no meio de um andar onde os espinhos,
        // os balões, as nuvens, a corrida e a boca dele fervem em quadros. Corpo
        // liso num mundo que treme não lê como suavidade: lê como personagem de
        // outro filme colado por cima do desenho.
        //
        // Quem segura a pose é o `if` abaixo: entre um desenho e outro NADA é
        // escrito nos ossos, então eles ficam exatamente onde estavam. Não
        // adiantaria só quantizar o alvo — as molas alisariam tudo de volta.
        const qp = quadroDaPose(t);
        const desenhoNovo = qp !== quadroPose.current;
        if (desenhoNovo) {
            quadroPose.current = qp;
            const po = poseDoGesto(gesture, tempoDaPose(t), tl);
            poseRef.current = po;
            // As molas correm no relógio do DESENHO, não no da tela: um passo
            // por pose, sempre do mesmo tamanho, dê o navegador 60 fps ou 2.
            const dtPose = 1 / POSE_HZ;
            const wob = po.wob;
            bones[B.body].position.y = 0.46 + po.bodyBob;
            bones[B.body].rotation.x = sLean.current.tick(po.lean, dtPose);
            bones[B.body].rotation.y = po.bodyYaw;
            bones[B.body].rotation.z = po.bodyRoll;
            bones[B.head].rotation.x = sHead.current.tick(po.headX, dtPose);
            bones[B.head].rotation.z = po.headZ + wob * 0.3;
            bones[B.l_arm].rotation.z =  sArmL.current.tick(po.armLz, dtPose);
            bones[B.r_arm].rotation.z = -sArmR.current.tick(po.armRz, dtPose);
            bones[B.l_arm].rotation.x =  sArmLx.current.tick(po.armLx, dtPose) + wob;
            bones[B.r_arm].rotation.x =  sArmRx.current.tick(po.armRx, dtPose) - wob;
            if (dashing && tl > 0.25) {
                const run = tl - 0.25;
                bones[B.l_leg].rotation.x =  Math.sin(run * 22) * 0.8;
                bones[B.r_leg].rotation.x = -Math.sin(run * 22) * 0.8;
            } else {
                const tq = tempoDaPose(t);
                bones[B.l_leg].rotation.x =  Math.sin(tq * 2.0) * 0.07;
                bones[B.r_leg].rotation.x = -Math.sin(tq * 2.0) * 0.07;
            }
        }
        const hop = poseRef.current.hop;

        // ── Position: stand (with hops), then DASH away on the last beat ──────
        if (dashing) {
            const run = Math.max(0, tl - 0.25);
            dashPos.current.z += run * 24 * safeDt;
            dashPos.current.x += (0 - dashPos.current.x) * (1 - Math.exp(-5 * safeDt));
            groupRef.current.position.copy(dashPos.current);
            groupRef.current.rotation.y = 0;                 // face +Z (running off)
        } else {
            groupRef.current.position.set(STAND.x, STAND.y + hop, STAND.z);
            groupRef.current.rotation.y = Math.PI + 0.16;    // ≈ face the player (-Z), slight 3/4
        }

        // ── A CÂMERA É DESTA CENA, e não mais a de diálogo ────────────────
        //
        // Ela era a câmera genérica de diálogo do <Player>, alimentada com os PÉS
        // dele. O resultado, fotografado pela bancada: um close fixo na cara,
        // segurando as nove falas inteiras, com o CORPO INTEIRO FORA DO QUADRO.
        // E ele está atuando o tempo todo — aponta, se inclina, abre os braços,
        // gargalha. A animação existe, é boa, e ninguém via.
        //
        // Agora esta cena tem a própria decupagem (`f3Decupagem`), como a queda:
        // cada fala tem o seu plano e a troca de fala é o corte. A regra que
        // manda aqui é outra — em rubber-hose a atuação está no CORPO, então
        // plano de corpo é o normal e close é tempero. O teste cobra que os
        // planos de corpo abracem os 2,2 m dele com folga para o gesto.
        //
        // `targetRef` continua sendo alimentado porque é ele que a UI usa para
        // saber onde o Diabrete está; a câmera é que deixou de depender dele.
        targetRef.current.set(
            groupRef.current.position.x,
            STAND.y,
            groupRef.current.position.z,
        );
        if (linhaRef.current !== li) { linhaRef.current = li; tLinha.current = clock.current; }

        // ── A BOCA ───────────────────────────────────────────────────────────
        // Em QUADROS DESENHADOS (8 Hz), não interpolada: boca que desliza é
        // interpolação, boca que salta é tinta. E só se mexe no rig quando o
        // quadro vira, não a cada frame.
        const qb = quadroDaBoca(clock.current);
        if (qb !== quadroBoca.current) {
            quadroBoca.current = qb;
            const repouso: NomeDaBoca = expressaoDoDiabrete('apresentacao', 0);
            const nova = vozDaLinha.current
                ? bocaNoInstante(vozDaLinha.current, clock.current - tLinha.current, repouso)
                : repouso;
            rig.definirBoca(nova);
        }
        const pl = planoDaApresentacao(li, PALCO_DA_APRESENTACAO,
            (clock.current - tLinha.current) / 3.2);
        camera.position.set(pl.x, pl.y, pl.z);
        camera.up.set(0, 1, 0);
        camera.lookAt(pl.lx, pl.ly, pl.lz);
        (camera as THREE.PerspectiveCamera).fov = pl.fov;
        camera.updateProjectionMatrix();

        // ── Finish: dash cleared frame → hand back to gameplay ───────────────
        if (!doneRef.current && (t >= SCRIPT_TOTAL + 0.5 || dashPos.current.z > f3PlayerZ.current + 12)) {
            doneRef.current = true;
            onDone();
        }
    });

    return <group ref={groupRef} scale={[DIABRETE_SCALE, DIABRETE_SCALE, DIABRETE_SCALE]} />;
};

useGLTF.preload(RIVAL_URL);
export default Floor3Cutscene;
