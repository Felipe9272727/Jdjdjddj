/**
 * f3Passada.ts — a CORRIDA do Diabrete, quadro a quadro.
 *
 * ── O QUE ELA ERA ────────────────────────────────────────────────────────────
 *
 * Um seno. Um só: `sin(φ)` girava as pernas, `−sin(φ)` girava os braços, e o
 * corpo subia com `|sin(φ)|`. Havia agachada e alongamento, e isso já era mais
 * do que muita coisa tem — mas o resultado é SIMÉTRICO e LISO, e corrida de
 * desenho de 1930 não é nem uma coisa nem outra. É a única peça do andar que
 * nunca recebeu passagem, e é o personagem que mais aparece nele.
 *
 * ── O QUE MUDA ───────────────────────────────────────────────────────────────
 *
 * ESTALO. A perna não passeia: ela SEGURA nos extremos e cruza o meio depressa.
 * Um seno faz o contrário — corre rápido nos extremos e demora no meio. Elevar
 * o seno a uma potência menor que 1 (mantendo o sinal) inverte isso, e é a
 * diferença entre um pêndulo e uma passada.
 *
 * ATRASO DA CABEÇA. Cabeça e tronco não chegam juntos: a cabeça é arrastada e
 * chega uns quadros depois. Aqui ela lê a fase do corpo ATRASADA, o que custa
 * uma subtração e é o truque mais barato de animação que existe.
 *
 * CONTRAPONTO DOS BRAÇOS. O braço não é o espelho da perna: ele vem com a sua
 * própria defasagem e amplitude maior, porque em rubber-hose o braço é uma
 * mangueira e chicoteia.
 *
 * FERVILHAR. O resto do andar já treme em degraus de 8 Hz — os espinhos, o
 * balão da súplica, o balão de grito. O Diabrete era o único parado. Agora não.
 *
 * ── POR QUE MÓDULO PURO ──────────────────────────────────────────────────────
 *
 * Porque animação é onde eu mais me engano olhando: a bancada roda a ~2 fps e
 * uma foto de um ciclo de corrida não diz nada sobre o ciclo. O que dá para
 * cobrar em teste é o que importa — que o ciclo FECHE (a pose em φ e em φ+2π é
 * a mesma), que as pernas andem em oposição, que nada inverta ou saia da faixa
 * humana, e que o fervilhar salte em degraus em vez de deslizar.
 */

import { tremor, BOIL_AMP } from './f3Tinta';

/** Passadas por segundo. */
export const PASSOS_POR_SEGUNDO = 2.6;

/**
 * A onda ESTALADA. `dureza < 1` alarga os extremos e encurta a travessia;
 * `dureza = 1` é o seno de volta.
 */
export function estalo(s: number, dureza = 0.62): number {
    const a = Math.abs(s);
    return (s < 0 ? -1 : 1) * Math.pow(a, dureza);
}

export interface Passada {
    corpoY: number;        // altura do quadril, em metros de modelo
    corpoIncl: number;     // inclinação para a frente (x)
    corpoGiro: number;     // torção do tronco (y)
    corpoTorc: number;     // balanço lateral (z)
    cabecaIncl: number;
    cabecaTorc: number;
    pernaE: number; pernaD: number;
    bracoE: number; bracoD: number;
    esticaY: number;       // >1 estica, <1 agacha (volume preservado por quem aplica)
}

/** Quanto a cabeça chega atrasada em relação ao tronco, em radianos de fase. */
export const ATRASO_DA_CABECA = 0.85;
/** A defasagem do braço em relação à perna oposta. */
export const ATRASO_DO_BRACO = 0.42;

const BASE_DO_QUADRIL = 0.46;

/**
 * A pose de um quadro.
 *
 * @param fase  fase do ciclo, em radianos (0..2π se repete)
 * @param noAr  verdadeiro entre um pulo e o pouso
 * @param t     tempo em segundos, só para o fervilhar
 */
export function passada(fase: number, noAr: boolean, t: number): Passada {
    const sw = estalo(Math.sin(fase));
    const swBraco = estalo(Math.sin(fase - ATRASO_DO_BRACO));
    const swCabeca = Math.sin(fase - ATRASO_DA_CABECA);
    // O fervilhar: um tremor por membro, com sementes diferentes, saltando em
    // degraus de 8 Hz. É pequeno de propósito — ele tem de parecer tinta
    // redesenhada, não tremedeira.
    const tr = (semente: number, amp = BOIL_AMP) => tremor(semente, t, amp);

    if (noAr) {
        // NO AR ele encolhe: joelhos para o peito, braços para cima, tronco
        // jogado para trás. É a pose de quem foi lançado, não de quem corre.
        return {
            corpoY: BASE_DO_QUADRIL,
            corpoIncl: -0.24 + tr(11, 0.03),
            corpoGiro: 0,
            corpoTorc: tr(12, 0.04),
            cabecaIncl: -0.16 + tr(13, 0.03),
            cabecaTorc: tr(14, 0.05),
            pernaE: -0.58 + tr(15, 0.05),
            pernaD: -0.42 + tr(16, 0.05),
            bracoE: -0.78 + tr(17, 0.06),
            bracoD: -0.78 + tr(18, 0.06),
            esticaY: 1,
        };
    }

    return {
        // O quadril sobe no meio da passada e cai no apoio.
        corpoY: BASE_DO_QUADRIL + Math.abs(Math.sin(fase)) * 0.085,
        corpoIncl: 0.24 + tr(1, 0.03),
        corpoGiro: sw * 0.13,
        corpoTorc: sw * 0.08 + tr(2, 0.03),
        // A cabeça lê a fase ATRASADA: ela chega depois do tronco.
        cabecaIncl: 0.10 + swCabeca * 0.09 + tr(3, 0.035),
        cabecaTorc: swCabeca * 0.11 + tr(4, 0.04),
        // Pernas em oposição, com estalo.
        pernaE:  sw * 0.92 + tr(5, 0.05),
        pernaD: -sw * 0.92 + tr(6, 0.05),
        // Braços em contraponto com a perna OPOSTA, defasados e mais soltos.
        bracoE: -swBraco * 1.25 + tr(7, 0.06),
        bracoD:  swBraco * 1.25 + tr(8, 0.06),
        // Agacha no apoio (φ = 0, π) e estica no ar da passada.
        esticaY: 1 + Math.abs(Math.sin(fase)) * 0.10 - 0.07,
    };
}
