/**
 * f3Boca.ts — A BOCA DO DIABRETE.
 *
 * ── DE ONDE ISTO VEM ─────────────────────────────────────────────────────────
 *
 * O Felipe mandou uma ficha de personagem: "DIABRETE — pequeno diabo, grandes
 * problemas", com personalidade escrita (Irônico, Travesso, Tagarela,
 * Imprevisível) e um vocabulário de DEZOITO bocas, cada uma com nome. Junto veio
 * o pedido: "talvez vc pudesse fazer uma boca pro diabrete no blender e animar
 * ela".
 *
 * ── POR QUE NÃO É NO BLENDER ─────────────────────────────────────────────────
 *
 * O modelo dele não tem esqueleto nem blend shape — o rig de `diabreteRig.ts` é
 * sintetizado à mão a partir da nuvem de vértices. Pôr boca ali significaria um
 * GLB novo, com malha e texturas novas, num andar de onde acabaram de sair 4,3 MB
 * de download justamente porque a regra do dono é velocidade no celular dele.
 *
 * E a ficha dele já aponta o caminho certo, no próprio título do quadro: "ASSETS
 * DE BOCA (PNG com fundo transparente)". A boca de um desenho de 1930 não é
 * geometria — é um DESENHO chapado na cara, que troca de forma quadro a quadro.
 * Então ela é desenhada aqui, do mesmo jeito que os espinhos, as nuvens e os
 * balões deste andar já são: procedural, zero byte de download, e — o que
 * importa para quem entrega no escuro — TESTÁVEL.
 *
 * ── O QUE É TESTÁVEL AQUI ────────────────────────────────────────────────────
 *
 * Que as dezoito formas da ficha existem e são distintas; que a boca de fala
 * alterna em vez de piscar sempre igual; que a expressão segue o ARCO do andar
 * (`roubados` 0→3, o mesmo que a voz e a trilha já seguem); e que o repouso dele
 * NÃO é neutro — a ficha diz Irônico e Travesso, então parado ele está de sorriso
 * torto, que é metade da personagem.
 */

import { BOIL_HZ } from './f3Tinta';
import type { Voz } from './f3Voz';

export type NomeDaBoca =
    | 'neutra' | 'sorriso' | 'sorrisoIronico' | 'deboche' | 'falando1' | 'falando2'
    | 'feliz' | 'empolgado' | 'bravo' | 'irritado' | 'surpreso' | 'assustado'
    | 'triste' | 'desanimado' | 'confuso' | 'pensativo' | 'zangado' | 'provocando';

export interface Ponto { x: number; y: number }

export interface Forma {
    /** Contorno fechado, normalizado em x,y ∈ [-1,1]. Vazio quando é só traço. */
    caminho: Ponto[];
    /** Traço aberto — as bocas que são uma linha só (neutra, sorriso, triste…). */
    traco: Ponto[];
    /** Boca ABERTA se preenche de tinta; fechada se é só linha. */
    cheia: boolean;
    /** Quantos dentes, distribuídos na largura. 0 = sem dentes. */
    dentes: number;
    /** Dentes pontudos (zigue-zague de vilão) em vez de retos. */
    presas: boolean;
    /** Língua de fora — a boca "provocando" da ficha. */
    lingua: boolean;
    /** Inclinação em graus. O irônico é TORTO, e é o torto que faz o personagem. */
    inclinacao: number;
}

// ── Ajudantes de traçado ─────────────────────────────────────────────────────
/** Arco de parábola de `-1..1`, com flecha `f` (positiva sobe nas pontas). */
function curva(f: number, n = 9, largura = 1): Ponto[] {
    const p: Ponto[] = [];
    for (let i = 0; i <= n; i++) {
        const x = (-1 + (2 * i) / n) * largura;
        p.push({ x, y: f * (1 - x * x / (largura * largura)) });
    }
    return p;
}
/** Lente: dois arcos costurados. É a forma de toda boca aberta desta ficha. */
function lente(largura: number, alto: number, baixo: number, n = 10): Ponto[] {
    const cima = curva(alto, n, largura);
    const baixoP = curva(-baixo, n, largura).reverse();
    return [...cima, ...baixoP];
}

const F = (
    caminho: Ponto[], traco: Ponto[], cheia: boolean,
    dentes = 0, presas = false, lingua = false, inclinacao = 0,
): Forma => ({ caminho, traco, cheia, dentes, presas, lingua, inclinacao });

/**
 * As dezoito bocas da ficha, na ordem em que ele as desenhou.
 *
 * Os números saíram de LER o desenho dele, não de inventar: as bocas de cima são
 * traços finos e fechados, a fileira do meio é aberta e cheia de dente, e a de
 * baixo volta a ser traço, salvo o "zangado" e o "provocando".
 */
export const BOCAS: Readonly<Record<NomeDaBoca, Forma>> = Object.freeze({
    // ── fileira 1 da ficha: o registro do dia a dia ──────────────────────────
    neutra:         F([], curva(0.00, 5, 0.62), false, 0, false, false, 0),
    sorriso:        F([], curva(-0.22, 9, 0.68), false, 0, false, false, 0),
    sorrisoIronico: F([], curva(-0.26, 9, 0.78), false, 4, false, false, -9),
    deboche:        F(lente(0.72, 0.10, 0.34), [], true, 5, false, false, -13),
    falando1:       F(lente(0.36, 0.16, 0.16), [], true, 0, false, false, -4),
    falando2:       F(lente(0.52, 0.34, 0.30), [], true, 0, false, false, -2),

    // ── fileira 2: as emoções grandes ────────────────────────────────────────
    feliz:          F(lente(0.82, 0.06, 0.52), [], true, 6, false, false, 0),
    empolgado:      F(lente(0.86, 0.10, 0.58), [], true, 7, true, false, 0),
    bravo:          F(lente(0.70, 0.30, 0.10), [], true, 5, false, false, 0),
    irritado:       F(lente(0.62, 0.34, 0.06), [], true, 4, true, false, 11),
    surpreso:       F(lente(0.30, 0.42, 0.42), [], true, 0, false, false, 0),
    assustado:      F(lente(0.34, 0.56, 0.24), [], true, 3, true, false, 0),

    // ── fileira 3: o registro baixo ──────────────────────────────────────────
    triste:         F([], curva(0.20, 9, 0.60), false, 0, false, false, 0),
    desanimado:     F([], curva(0.16, 9, 0.62), false, 2, false, false, -7),
    confuso:        F([], curva(0.10, 7, 0.40), false, 0, false, false, -14),
    pensativo:      F([], curva(-0.06, 5, 0.36), false, 0, false, false, 17),
    zangado:        F(lente(0.76, 0.14, 0.14), [], true, 8, false, false, 0),
    provocando:     F(lente(0.54, 0.14, 0.30), [], true, 0, false, true, -8),
});

export const NOMES_DAS_BOCAS = Object.keys(BOCAS) as NomeDaBoca[];

// ── O REPOUSO ────────────────────────────────────────────────────────────────
/**
 * A ficha do Felipe diz, em letra grande, Irônico e Travesso. Um personagem
 * assim NÃO fica de boca neutra esperando a vez: ele fica de sorriso torto. Este
 * é o valor mais importante deste arquivo, porque é o que se vê 90% do tempo.
 */
export const BOCA_EM_REPOUSO: NomeDaBoca = 'sorrisoIronico';

// ── A FALA ───────────────────────────────────────────────────────────────────
/**
 * Qual boca numa nota da fala. A voz (`f3Voz`) já entrega uma nota por palavra,
 * com `acento` marcado nas que o texto escreveu em CAIXA ALTA — então a boca abre
 * MAIS exatamente onde ele grita, de graça, sem uma segunda fonte de verdade.
 *
 * As duas bocas de fala alternam porque a ficha traz DUAS ("Falando 1" e
 * "Falando 2") e não uma: boca que pisca sempre igual lê como luz de aviso.
 */
export function bocaDaNota(indiceDaNota: number, acento: boolean): NomeDaBoca {
    if (acento) return 'deboche';
    return indiceDaNota % 2 === 0 ? 'falando2' : 'falando1';
}

// ── A EXPRESSÃO ──────────────────────────────────────────────────────────────
export type MomentoDoDiabrete =
    | 'apresentacao' | 'desenhou' | 'espetou' | 'roubou' | 'provoca' | 'caiu' | 'suplica';

/**
 * A cara dele conforme o andar anda. Usa o MESMO `roubados` que o chão
 * (`f3Desenho`), a voz (`f3Voz`) e a trilha (`f3Trilha`) — um número, um dono.
 *
 * O arco é o mesmo dos outros três: dono do lugar → irritado → nervoso →
 * acabado. A ficha dá os nomes; a mecânica dá a hora.
 */
export function expressaoDoDiabrete(momento: MomentoDoDiabrete, roubados = 0): NomeDaBoca {
    const r = Math.max(0, Math.min(3, Math.floor(roubados) || 0));
    switch (momento) {
        // Ele está gozando da sua cara: é o mesmo deboche em qualquer altura.
        case 'espetou': return r >= 2 ? 'irritado' : 'empolgado';
        case 'caiu':    return r >= 2 ? 'bravo' : 'empolgado';
        case 'desenhou': return r === 0 ? 'deboche' : r === 1 ? 'bravo' : 'irritado';
        case 'provoca':  return r === 0 ? 'sorrisoIronico' : r === 1 ? 'deboche' : 'irritado';
        // Roubar é a perda DELE, e é o único momento em que a cara despenca.
        case 'roubou':   return r <= 1 ? 'bravo' : r === 2 ? 'irritado' : 'assustado';
        // Pendurado no abismo, com os três pincéis fora da mão.
        case 'suplica':  return 'assustado';
        case 'apresentacao': return 'sorrisoIronico';
    }
}

// ── O FERVILHAR ──────────────────────────────────────────────────────────────
/**
 * A boca troca em QUADROS DESENHADOS, não em interpolação. É o mesmo 8 Hz dos
 * espinhos, dos balões e da corrida dele: boca que desliza é interpolação, boca
 * que salta é tinta.
 */
export const BOCA_HZ = BOIL_HZ;
export const quadroDaBoca = (t: number) => Math.floor(t * BOCA_HZ);

// ── A BOCA SEGUE A VOZ ───────────────────────────────────────────────────────
/**
 * Qual boca no instante `t` (segundos desde o começo da fala).
 *
 * Nada aqui inventa ritmo: a partitura de `f3Voz` já decidiu quantas notas a
 * frase tem, quando cada uma cai e quais são acento. A boca só lê a mesma
 * partitura que o trombone — é isso que faz o desenho bater com o som em vez de
 * andar do lado dele.
 *
 * Antes da primeira nota e depois da última, ele volta ao `repouso`, que é a
 * expressão do momento (ver `expressaoDoDiabrete`).
 */
export function bocaNoInstante(voz: Voz, t: number, repouso: NomeDaBoca): NomeDaBoca {
    const blats = voz.blats;
    if (!blats.length || t < 0) return repouso;
    // Cada nota segura a boca até a próxima; a última segura pela própria duração.
    for (let i = blats.length - 1; i >= 0; i--) {
        const b = blats[i];
        if (t >= b.t) {
            const fim = i + 1 < blats.length ? blats[i + 1].t : b.t + b.dur;
            return t < fim ? bocaDaNota(i, b.acento) : repouso;
        }
    }
    return repouso;
}
