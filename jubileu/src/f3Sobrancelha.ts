/**
 * f3Sobrancelha.ts — AS SOBRANCELHAS DO DIABRETE.
 *
 * Oito, da ficha que o dono do jogo mandou. E delas a que mais importa é a
 * QUATRO: "uma erguida e a outra baixa". É ela que faz a ironia. Um personagem
 * pode ter dezoito bocas e doze olhos e ainda assim parecer um boneco; uma
 * sobrancelha torta resolve sozinha.
 *
 * ── O MODELO NÃO TEM SOBRANCELHA ─────────────────────────────────────────────
 *
 * E isso aqui, pela primeira vez neste rosto, é uma boa notícia. A boca e os
 * olhos já vinham pintados na textura do GLB, e desenhar por cima significava
 * cobrir — foi assim que o nariz dele morreu três vezes. A sobrancelha não
 * cobre nada: é espaço vazio de testa, entre o olho e o cabelo. Ela só soma.
 */

export type NomeDaSobrancelha =
    | 'neutra' | 'surpresa' | 'raiva' | 'ironia'
    | 'preocupada' | 'desconfiada' | 'pensativa' | 'bravaComRuga';

export interface Sobrancelha {
    /** Altura acima do olho, em fração da altura do olho. */
    altura: number;
    /**
     * Ângulo em graus. POSITIVO desce a ponta de DENTRO (raiva); NEGATIVO desce
     * a de fora (preocupação). O mesmo sinal que a pálpebra em `f3Olhos`, de
     * propósito: as duas peças falam a mesma língua e combinam sem tabela.
     */
    angulo: number;
    /** Curvatura do arco. Positivo = arqueada para cima (surpresa). */
    arco: number;
    /** Espessura do risco, em fração da largura do olho. */
    grossura: number;
    /**
     * A ASSIMETRIA — o coração da ficha dele. Quanto a sobrancelha da DIREITA
     * sobe a mais que a da esquerda, em fração da altura do olho. É isto, e não
     * a boca, que faz a cara dele ser irônica de longe.
     */
    assimetria: number;
    /** A ruga em V entre as duas, que a ficha pede na oitava. */
    ruga: boolean;
}

const S = (o: Partial<Sobrancelha> = {}): Sobrancelha => ({
    altura: 0.30, angulo: 0, arco: 0.16, grossura: 0.13,
    assimetria: 0, ruga: false, ...o,
});

export const SOBRANCELHAS: Readonly<Record<NomeDaSobrancelha, Sobrancelha>> = Object.freeze({
    neutra:       S(),
    surpresa:     S({ altura: 0.52, arco: 0.34 }),
    raiva:        S({ altura: 0.16, angulo: 30, arco: -0.06 }),
    // A QUATRO da ficha. Uma sobe, a outra fica — e a que sobe é a do lado que o
    // sorriso torto também levanta (ver `TORTO` em `f3Boca`), senão a cara
    // briga consigo mesma.
    ironia:       S({ altura: 0.30, angulo: 6, arco: 0.20, assimetria: 0.34 }),
    preocupada:   S({ altura: 0.40, angulo: -26, arco: 0.10 }),
    desconfiada:  S({ altura: 0.18, angulo: 10, arco: 0.04, assimetria: 0.16 }),
    pensativa:    S({ altura: 0.34, angulo: -8, arco: 0.24, assimetria: 0.26 }),
    bravaComRuga: S({ altura: 0.14, angulo: 34, arco: -0.10, grossura: 0.16, ruga: true }),
});

export const NOMES_DAS_SOBRANCELHAS = Object.keys(SOBRANCELHAS) as NomeDaSobrancelha[];

/** Parado ele está de sobrancelha torta. É metade do personagem, como a boca. */
export const SOBRANCELHA_EM_REPOUSO: NomeDaSobrancelha = 'ironia';

import type { MomentoDoDiabrete, MomentoExtra } from './f3Boca';

/** Mesmo `roubados` de tudo neste andar. Um número, um dono. */
export function sobrancelhaDoDiabrete(
    momento: MomentoDoDiabrete | MomentoExtra, roubados = 0,
): NomeDaSobrancelha {
    const r = Math.max(0, Math.min(3, Math.floor(roubados) || 0));
    switch (momento) {
        case 'apresentacao': return 'ironia';
        case 'provoca':      return r === 0 ? 'ironia' : r === 1 ? 'desconfiada' : 'raiva';
        case 'desenhou':     return r <= 1 ? 'ironia' : 'raiva';
        case 'espetou':      return r <= 1 ? 'ironia' : 'desconfiada';
        case 'roubou':       return r <= 1 ? 'surpresa' : r === 2 ? 'raiva' : 'preocupada';
        case 'caiu':         return r >= 2 ? 'raiva' : 'ironia';
        case 'suplica':      return 'preocupada';

        case 'ocioso':          return 'ironia';
        case 'quaseLaEmCima':   return 'ironia';
        case 'perdeuOPrimeiro': return 'bravaComRuga';
        case 'perdeuOUltimo':   return 'preocupada';
        case 'tonto':           return 'surpresa';
        case 'pensando':        return 'pensativa';
        case 'confuso':         return 'desconfiada';
        case 'vitorioso':       return 'surpresa';
        case 'derrotado':       return 'preocupada';
    }
}
