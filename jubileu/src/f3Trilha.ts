/**
 * f3Trilha.ts — O DISCO DELE VAI RODANDO MAIS DEVAGAR.
 *
 * ── O QUE FOI MEDIDO ANTES DE ESCREVER ISTO ──────────────────────────────────
 *
 * A bancada `ouvir-o-diabrete.mjs` grampeou o WebAudio do jogo rodando e a
 * trilha do Andar 3 TOCA: uma fonte em loop, buffer de 179,46 s (o ragtime de
 * 7,3 MB), começando 12 s depois de entrar. Isso precisou ser medido porque a
 * primeira leitura desta mesma bancada só contava oscilador, e a trilha não é
 * sintetizada — é arquivo. Zero oscilador não provava silêncio nenhum.
 *
 * ── O BURACO ─────────────────────────────────────────────────────────────────
 *
 * Ela toca, e é um TAPETE FIXO. O andar inteiro se desmancha em volta dela:
 * `f3Desenho` apaga as setas e rareia o tabuado a cada pincel roubado, e
 * `f3Voz` sobe e afina a voz do Diabrete na mesma conta. A música é a única
 * coisa do andar que não sabe que o dono está perdendo.
 *
 * Num curta de 1930 isso é ao contrário: a música é quem DIRIGE. É dela que vem
 * a palavra "Mickey Mousing" — a orquestra faz o que a cena faz.
 *
 * ── O QUE DÁ PRA FAZER COM UM MP3 SÓ ─────────────────────────────────────────
 *
 * Não dá pra tirar instrumentos de uma gravação pronta, e fingir que dá seria
 * mentira. O que dá — e que por acaso é a imagem CERTA para esta história — é
 * tratar a trilha como o que ela é: um DISCO. O sujeito que desenha o andar
 * está perdendo os pincéis, e a vitrola dele vai perdendo corda junto:
 *
 *   o andamento CAI          (playbackRate desce, e o tom desce junto — é disco,
 *                             não afinador; se o tom não caísse é que estaria
 *                             errado)
 *   o brilho SOME            (um passa-baixa fecha: a banda saindo da sala)
 *   o volume MURCHA
 *   e entra o CHORO da rotação (o "wow" de disco empenado, que só aparece
 *                             quando ele já perdeu alguma coisa)
 *
 * Na última etapa é quase um gemido: exatamente onde ele fica pendurado no
 * abismo pedindo socorro.
 *
 * ── POR QUE MÓDULO PURO ──────────────────────────────────────────────────────
 *
 * O mesmo motivo de `f3Voz`: eu não escuto o jogo. Se a curva morasse dentro do
 * grafo de áudio, a única prova de que ela anda na direção certa seria o ouvido
 * do Felipe. Aqui ela é uma tabela, e uma tabela dá para provar.
 */

import { PINCEIS_DO_DIABRETE } from './f3Desenho';

export interface EstadoDaTrilha {
    /** Velocidade do disco. 1 = como foi gravado. */
    rotacao: number;
    /** Onde o passa-baixa corta, em Hz. Alto = aberto. */
    brilho: number;
    /** Volume da trilha. */
    ganho: number;
    /** Profundidade do choro de rotação, em fração de `rotacao`. 0 = disco reto. */
    choro: number;
}

/** Quantas vezes por segundo o disco empenado passa pelo sulco torto. */
export const CHORO_HZ = 0.7;
/** A virada DESLIZA. Um corte seco viraria defeito; o deslize vira desmaio. */
export const TEMPO_DA_VIRADA = 1.2;

// Uma etapa por pincel perdido, mais a etapa inteira — o mesmo formato de
// `f3Desenho.ETAPAS`, de propósito: são a mesma escada contada por dois
// sentidos, e ficar igual no código é o que impede uma andar sem a outra.
const ETAPAS: readonly EstadoDaTrilha[] = Object.freeze([
    { rotacao: 1.000, brilho: 20000, ganho: 0.50, choro: 0.000 },  // 0 — o disco dele, novo
    { rotacao: 0.975, brilho: 6000,  ganho: 0.46, choro: 0.004 },  // 1 — perdeu corda
    { rotacao: 0.945, brilho: 3200,  ganho: 0.42, choro: 0.009 },  // 2 — a banda saindo da sala
    { rotacao: 0.900, brilho: 1800,  ganho: 0.36, choro: 0.016 },  // 3 — a vitrola morrendo
]);

/** Como a trilha está com `roubados` pincéis fora das mãos dele. */
export function trilhaDoAndar(roubados: number): EstadoDaTrilha {
    const i = Math.max(0, Math.min(ETAPAS.length - 1, Math.floor(roubados) || 0));
    return ETAPAS[i];
}

/** Se mudou o bastante para valer mexer no grafo de áudio. */
export function mudouATrilha(a: EstadoDaTrilha, b: EstadoDaTrilha): boolean {
    return a.rotacao !== b.rotacao || a.brilho !== b.brilho
        || a.ganho !== b.ganho || a.choro !== b.choro;
}

/** Uma etapa por pincel, mais a inteira — o mesmo três de `f3Desenho`. */
export const ETAPAS_DA_TRILHA = ETAPAS.length;
if (ETAPAS_DA_TRILHA !== PINCEIS_DO_DIABRETE + 1) {
    // Não é um `throw`: quebrar o andar por causa de música seria pior que o
    // defeito. O teste de coerência é quem reprova isso.
    console.warn('[f3Trilha] etapas da trilha e pincéis do Diabrete não batem');
}
