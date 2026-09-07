/**
 * f3Voz.ts — A BOCA DO DIABRETE.
 *
 * ── O BURACO QUE ISTO TAPA ───────────────────────────────────────────────────
 *
 * O Andar 3 tem banco de som próprio (`floor3Sfx`) e ele é bom: passo de
 * woodblock, apito de pular, o "wah-wah-wah" de fim de jogo. A queda tem quatro
 * batidas. O jogador tem cinco. O Diabrete, que é o personagem do andar, tem
 * ZERO — toda fala dele, na apresentação, na escalada e na súplica pendurado no
 * abismo, aparece em silêncio absoluto.
 *
 * Balão que nasce sem som não lê como alguém falando: lê como notificação. Num
 * curta de 1930 o vilão não é mudo, e nem é dublado — a boca dele é um
 * INSTRUMENTO, um trombone com surdina que resmunga uma nota por palavra. É
 * isso que falta.
 *
 * ── POR QUE UM MÓDULO SÓ DE PARTITURA ────────────────────────────────────────
 *
 * Porque eu não escuto o resultado. Se a voz fosse escrita direto em nós de
 * WebAudio, a única forma de saber se ela está certa seria o ouvido do Felipe, e
 * eu entregaria no escuro.
 *
 * Então a parte que decide as coisas — quantas notas, em que altura, onde cai o
 * acento, o que a pontuação faz no fim, e como o timbre ENVELHECE conforme os
 * pincéis somem — é uma função pura que devolve uma partitura. Isso dá para
 * provar em teste. O `floor3Sfx` só toca o que esta função escreveu.
 *
 * O que continua sendo ouvido dele, e não meu: se o timbre agrada.
 *
 * ── A VOZ CONTA A HISTÓRIA ───────────────────────────────────────────────────
 *
 * O arco do andar é o desmonte de um sujeito: dono do lugar → irritado →
 * nervoso → desesperado. `f3Desenho` já faz o CHÃO envelhecer com isso (as setas
 * desbotam, o tabuado vira esboço). A voz faz o mesmo: a cada pincel roubado ele
 * sobe de altura e AFINA — a surdina fecha, o vibrato acelera, e no fim o
 * acento RACHA para cima. É a mesma informação chegando por outro sentido, que é
 * o que faz um andar ter personalidade em vez de ter texto.
 */

import { BOIL_HZ } from './f3Tinta';

/** Uma nota da fala: um blat de trombone. */
export interface Blat {
    /** Segundos desde o começo da fala. */
    t: number;
    hz: number;
    /** Pico do envelope. */
    ganho: number;
    dur: number;
    /** Palavra em CAIXA ALTA — o acento da piada, que o texto já marca. */
    acento: boolean;
}

export interface Voz {
    blats: Blat[];
    /** Vibrato. O fervilhar do andar, na boca dele. */
    boilHz: number;
    /** Centro da surdina (bandpass). */
    surdina: number;
    /** Fechamento da surdina. Quanto maior, mais anasalado. */
    q: number;
    /** 'trombone' = o Diabrete. 'simples' = o jogador, que não é desenho dele. */
    timbre: 'trombone' | 'simples';
    /** Quanto a fala inteira dura. */
    total: number;
}

export interface OpcoesDeVoz {
    /** Quantos pincéis já saíram das mãos dele: 0 (dono) a 3 (acabado). */
    roubados?: number;
    /** O balão de estrela — mais alto e mais curto. */
    grito?: boolean;
    /** Quem fala. O jogador não tem surdina: ele não foi desenhado pelo Diabrete. */
    quem?: 'diabrete' | 'jogador';
}

// ── Os números ───────────────────────────────────────────────────────────────

/** Nota por palavra, com teto: ninguém aguenta um trombone de doze sílabas. */
export const TETO_DE_BLATS = 7;
export const PISO_DE_BLATS = 2;
/** Espaço entre notas. Rápido — é resmungo, não é melodia. */
const PASSO = 0.075;
const DUR_BLAT = 0.10;

const BASE_DIABRETE = 300;
const BASE_JOGADOR = 190;
/** Quanto ele sobe de altura por pincel perdido. Pânico é agudo. */
const SUBIDA_POR_PINCEL = 0.09;

/** Uma palavra é acento quando o texto já a escreveu gritando. */
export function ehAcento(palavra: string): boolean {
    const letras = palavra.replace(/[^\p{L}]/gu, '');
    return letras.length >= 2 && letras === letras.toLocaleUpperCase('pt-BR');
}

/**
 * O que a pontuação final faz com a última nota. É de graça: o texto das falas
 * já termina em "!" quando ele se gaba e em "…" quando ele hesita.
 */
export function curvaFinal(texto: string): number {
    const fim = texto.trimEnd();
    if (fim.endsWith('?')) return 1.28;    // pergunta sobe
    if (fim.endsWith('!')) return 1.18;    // exclamação sobe menos
    if (/[…\.]$/.test(fim)) return 0.82;   // reticência/ponto DESCE — ele murcha
    return 1;
}

/** Palavras de verdade, sem a pontuação grudada. */
function palavrasDe(texto: string): string[] {
    return texto.split(/\s+/).map(p => p.trim()).filter(p => p.replace(/[^\p{L}\p{N}]/gu, '').length > 0);
}

/**
 * Corta a fala no teto SEM perder o fim. A última palavra é onde mora a piada
 * (e a curva da pontuação), então ela sobrevive ao corte: some o miolo.
 */
export function encaixarNoTeto(palavras: string[], teto = TETO_DE_BLATS): string[] {
    if (palavras.length <= teto) return palavras;
    return [...palavras.slice(0, teto - 1), palavras[palavras.length - 1]];
}

/**
 * A partitura de uma fala.
 *
 * Determinística: a mesma frase soa igual em toda máquina e em toda partida,
 * igual ao rodízio de `f3Falas` — este andar não sorteia nada que o jogador
 * possa perceber como caráter.
 */
export function vozDoDiabrete(texto: string, opts: OpcoesDeVoz = {}): Voz {
    const quem = opts.quem ?? 'diabrete';
    const grito = opts.grito === true;
    const roubados = Math.max(0, Math.min(3, Math.floor(opts.roubados ?? 0) || 0));
    const jogador = quem === 'jogador';

    // O grito é interjeição: corta mais curto e bate mais forte.
    const teto = grito ? 4 : TETO_DE_BLATS;
    const passo = grito ? PASSO * 0.82 : PASSO;

    let palavras = encaixarNoTeto(palavrasDe(texto), teto);
    // Fala vazia ou só pontuação ainda faz um grunhido: ele nunca abre a boca à toa.
    while (palavras.length < PISO_DE_BLATS) palavras = [...palavras, palavras[palavras.length - 1] ?? '…'];

    // O arco: cada pincel perdido sobe a voz. O jogador não tem arco — quem se
    // desmancha ao longo do andar é o Diabrete.
    const base = jogador ? BASE_JOGADOR : BASE_DIABRETE * (1 + SUBIDA_POR_PINCEL * roubados);
    const curva = curvaFinal(texto);
    const ultimo = palavras.length - 1;

    const blats: Blat[] = palavras.map((p, i) => {
        const acento = ehAcento(p);
        // Desenho da frase: uma leve queda ao longo dela (o ar acabando), com a
        // curva da pontuação puxando a última nota de volta pra cima ou pra baixo.
        const caindo = 1 - (i / Math.max(1, ultimo)) * 0.14;
        // O acento salta. E RACHA: perto do fim ele já não segura a nota alta.
        const salto = acento ? (jogador ? 1.12 : 1.22 + 0.06 * roubados) : 1;
        const hz = base * caindo * salto * (i === ultimo ? curva : 1);
        const ganho = (grito ? 0.20 : 0.13) * (acento ? 1.35 : 1) * (jogador ? 0.85 : 1);
        return { t: i * passo, hz, ganho, dur: DUR_BLAT, acento };
    });

    return {
        blats,
        // O jogador não ferve: ele não é traço do Diabrete. O Diabrete ferve no
        // mesmo 8 Hz do chão que ele desenhou, e treme mais rápido quando perde.
        boilHz: jogador ? 0 : BOIL_HZ * (1 + 0.22 * roubados),
        // A surdina FECHA conforme ele perde: de trombone gordo a kazoo fininho.
        surdina: jogador ? 520 : 760 - 90 * roubados,
        q: jogador ? 1.2 : 3.2 + 1.4 * roubados,
        timbre: jogador ? 'simples' : 'trombone',
        total: (blats.length - 1) * passo + DUR_BLAT,
    };
}
