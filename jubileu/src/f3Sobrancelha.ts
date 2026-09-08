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

// ── A TESTA DELE É ESTREITA, E ISSO É MEDIDO ─────────────────────────────────
// A primeira versão pôs as sobrancelhas a 0,30 da altura do olho acima dele, que
// é onde elas ficariam num rosto humano. Na foto elas subiram no CABELO PRETO e
// viraram engrossamento da franja — desenhar tinta sobre tinta é o mesmo que não
// desenhar.
// Medida a faixa de creme que sobra acima do olho (`medir-a-cara.mjs` sobre
// `?semolhos&parado`): ela vai da régua 0,750 (topo do olho) a ~0,82, e ENCOLHE
// subindo, porque é o V entre as orelhas. Então a sobrancelha mora ali, baixa e
// mais estreita que o olho.
// A GROSSURA subiu de 0,13 para 0,17. Motivo, e é medido na foto de perto: com
// 0,13 o traço saía com ~6 px na tela do celular — no meio de um olho de 100 px
// e de um nariz de 70 px, isso não lê como sobrancelha, lê como risco. Traço de
// desenho animado é grosso; é dele que vem a leitura de longe.
// ── E DEPOIS A FICHA DELE MOSTROU QUE ELAS SÃO FIOS, NÃO ARCOS ───────────────
// Nas três folhas que ele mandou, as sobrancelhas do Diabrete são traços FINOS
// e RASOS, encostados no olho. Não há arco alto nem testa para ele: com o olho
// no tamanho certo (ver a nota da ficha em `f3OlhosTextura`) sobram 24 px de
// testa, e é assim que tem que ser — o rosto dele é quase todo olho.
// Então altura, arco e grossura desceram todos, mantendo a diferença ENTRE as
// oito, que é o que distingue uma expressão da outra.
const S = (o: Partial<Sobrancelha> = {}): Sobrancelha => ({
    altura: 0.06, angulo: 0, arco: 0.10, grossura: 0.09,
    assimetria: 0.0, ruga: false, ...o,
});

export const SOBRANCELHAS: Readonly<Record<NomeDaSobrancelha, Sobrancelha>> = Object.freeze({
    neutra:       S(),
    // `surpresa` era a ÚNICA das oito que não cabia na testa: 0,208 de altura mais
    // 0,34 de arco punham o alto do traço 3 px acima da linha do cabelo, e ela
    // saía aparada. Baixando a altura (o arco é que faz a surpresa, não a altura):
    surpresa:     S({ altura: 0.075, arco: 0.16 }),
    raiva:        S({ altura: 0.032, angulo: 30, arco: -0.04 }),
    // A QUATRO da ficha. Uma sobe, a outra fica — e a que sobe é a do lado que o
    // sorriso torto também levanta (ver `TORTO` em `f3Boca`), senão a cara
    // briga consigo mesma.
    ironia:       S({ altura: 0.06, angulo: 6, arco: 0.125, assimetria: 0.10 }),
    preocupada:   S({ altura: 0.085, angulo: -26, arco: 0.065 }),
    desconfiada:  S({ altura: 0.036, angulo: 10, arco: 0.025, assimetria: 0.05 }),
    pensativa:    S({ altura: 0.06, angulo: -8, arco: 0.12, assimetria: 0.07 }),
    bravaComRuga: S({ altura: 0.028, angulo: 34, arco: -0.06, grossura: 0.115, ruga: true }),
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
