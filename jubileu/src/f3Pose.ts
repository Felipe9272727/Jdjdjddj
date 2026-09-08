/**
 * f3Pose.ts — A ATUAÇÃO DO DIABRETE, em quadros desenhados.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────────
 *
 * O Felipe disse: "as cutscenes (as animações, do diabrete em especial) não estão
 * bom". A boca era metade do pedido; esta é a outra.
 *
 * A atuação em si é boa — ele aponta, se inclina, gargalha, abre os braços, dá
 * pulinhos. O problema não é o QUE ele faz, é COMO isso chega na tela: cada
 * gesto era `Math.sin(t * k)` com `t` contínuo, avaliado todo quadro. Ou seja, o
 * corpo dele DESLIZA.
 *
 * E ele é a única coisa do andar que desliza. Os espinhos fervem a 8 Hz, os dois
 * balões fervem, as nuvens fervem, a corrida dele ferve, a boca (que acabou de
 * nascer) ferve. O corpo interpolava liso no meio de tudo isso — e um corpo liso
 * num mundo que treme não lê como "animação suave", lê como personagem de outro
 * filme colado por cima do desenho.
 *
 * ── EM DOIS ──────────────────────────────────────────────────────────────────
 *
 * Curta de 1930 roda a 24 quadros por segundo e é desenhado "em dois": cada
 * desenho vale dois quadros de película, então a pose muda 12 vezes por segundo
 * e FICA PARADA entre uma e outra. Não é limitação técnica que virou estilo — é
 * o que dá o peso e o estalo do gesto, porque a pose tem tempo de ser vista.
 *
 * Por isso 12 Hz aqui e não os 8 Hz do `f3Tinta`: aquilo é a LINHA fervendo (a
 * mão redesenhando o contorno), isto é a POSE mudando. São dois relógios
 * diferentes no mesmo ofício, e misturá-los faria o personagem pulsar junto com
 * o contorno, que não é o que acontece num desenho de verdade.
 *
 * ── POR QUE MÓDULO PURO ──────────────────────────────────────────────────────
 *
 * Porque "a animação está boa" é opinião e "a pose muda 12 vezes por segundo e
 * fica parada entre elas" é fato. Com a matemática fora do componente dá para
 * amostrar a 60 Hz em teste e PROVAR que ela segura — o que uma foto a 2 fps
 * nunca mostraria.
 */

import type { Gesture } from './diabreteScript';

/** Animação "em dois": 24 quadros por segundo, cada desenho valendo dois. */
export const POSE_HZ = 12;
/** Em que desenho o tempo `t` cai. */
export const quadroDaPose = (t: number) => Math.floor(t * POSE_HZ);
/** O tempo do desenho em que `t` cai — é ISTO que alimenta os senos. */
export const tempoDaPose = (t: number) => Math.floor(t * POSE_HZ) / POSE_HZ;

/** Braço em repouso, herdado do rig em T. */
export const ARM_REST = 0.95;

export interface Pose {
    lean: number; headX: number; headZ: number;
    armLz: number; armRz: number; armLx: number; armRx: number;
    bodyBob: number; bodyYaw: number; bodyRoll: number;
    /** Pulo do corpo inteiro, em metros. */
    hop: number;
    /** Tremeliques de borracha, somados por quem aplica. */
    wob: number;
}

/**
 * A pose de um gesto no instante `t`.
 *
 * `t` entra CRU; quem quantiza é quem chama, com `tempoDaPose` — assim o teste
 * consegue amostrar os dois modos e comparar. `tl` é o tempo dentro da fala, que
 * só o 'dash' usa (ele tem preparação antes da arrancada).
 */
export function poseDoGesto(gesto: Gesture, t: number, tl = 0): Pose {
    const breath = Math.sin(t * 2.4) * 0.5 + 0.5;
    const p: Pose = {
        lean: 0.12, headX: 0, headZ: 0,
        armLz: ARM_REST, armRz: ARM_REST, armLx: 0, armRx: 0,
        bodyBob: Math.sin(t * 2.4) * 0.02,
        bodyYaw: 0, bodyRoll: 0, hop: 0,
        wob: Math.sin(t * 11) * 0.07,
    };

    switch (gesto) {
        case 'lean':   // medindo o jogador de cima a baixo, com a mão na cintura
            p.lean = 0.40 + Math.sin(t * 3) * 0.05; p.headZ = 0.22; p.bodyYaw = 0.12;
            p.armLz = 1.7; p.armLx = 0.15;
            p.armRz = ARM_REST - 0.15; p.armRx = -0.2;
            break;
        case 'point':  // dedo na cara do jogador, cutucando
            p.lean = 0.28; p.headX = 0.10;
            p.armRz = 0.30; p.armRx = -1.45 + Math.sin(t * 13) * 0.28;
            p.armLz = 1.5;  p.armLx = 0.25;
            p.hop = Math.abs(Math.sin(t * 6.5)) * 0.06;
            break;
        case 'throw':  // o "eu te enterro" de dois braços por cima da cabeça
            p.lean = 0.10 + Math.sin(t * 5) * 0.12;
            p.armLz = 0.15; p.armRz = 0.15;
            p.armLx = -1.7 + Math.sin(t * 7) * 0.5;
            p.armRx = -1.7 + Math.sin(t * 7 + 0.5) * 0.5;
            p.headX = -0.18; p.bodyRoll = Math.sin(t * 7) * 0.12;
            break;
        case 'laugh':  // gargalhada de barriga: joga o corpo pra trás e treme
            p.lean = -0.30 + Math.sin(t * 15) * 0.10;
            p.armLz = 1.35 + Math.sin(t * 15) * 0.2;
            p.armRz = 1.35 + Math.sin(t * 15 + 0.4) * 0.2;
            p.armLx = 0.4; p.armRx = 0.4;
            p.headX = -0.38; p.headZ = Math.sin(t * 15) * 0.12;
            p.bodyBob = Math.abs(Math.sin(t * 7.5)) * 0.06;
            p.hop = Math.abs(Math.sin(t * 7.5)) * 0.10;
            p.bodyRoll = Math.sin(t * 15) * 0.06;
            break;
        case 'taunt':  // peito estufado, quadris gingando
            p.lean = 0.12; p.bodyYaw = Math.sin(t * 4.5) * 0.22;
            p.armLz = 1.1 + Math.sin(t * 7) * 0.3; p.armRz = 1.1 + Math.sin(t * 7 + 0.5) * 0.3;
            p.armLx = 0.15 + Math.sin(t * 7) * 0.25; p.armRx = 0.15 - Math.sin(t * 7) * 0.25;
            p.headZ = Math.sin(t * 5) * 0.12;
            p.hop = Math.abs(Math.sin(t * 4.5)) * 0.12;
            break;
        case 'dash': {  // agacha, junta e dispara
            const run = Math.max(0, tl - 0.25);
            if (run <= 0) {
                p.lean = 0.55; p.bodyBob = -0.08;
                p.armLx = 0.7; p.armRx = 0.7; p.armLz = 1.5; p.armRz = 1.5;
            } else {
                p.lean = 0.5; p.armLz = ARM_REST; p.armRz = ARM_REST;
                p.armLx = -Math.sin(run * 22) * 1.0; p.armRx = Math.sin(run * 22) * 1.0;
            }
            break;
        }
        default:       // parado: respiração e troca de peso
            p.lean = 0.10 + breath * 0.04; p.bodyYaw = Math.sin(t * 1.4) * 0.06;
            p.armLz = ARM_REST + 0.06; p.armRz = ARM_REST + 0.06;
            p.headZ = Math.sin(t * 1.6) * 0.07;
    }
    return p;
}

/** Quanto duas poses diferem — a régua que o teste usa para dizer se ela SEGURA. */
export function distanciaDaPose(a: Pose, b: Pose): number {
    let d = 0;
    for (const k of Object.keys(a) as (keyof Pose)[]) d += Math.abs(a[k] - b[k]);
    return d;
}
