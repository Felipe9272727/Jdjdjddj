/**
 * f3Olhos.ts — OS OLHOS DO DIABRETE.
 *
 * ── DE ONDE ISTO VEM ─────────────────────────────────────────────────────────
 *
 * O dono do jogo pediu: "seria legal a cara inteira dele ser animada (tipo uma
 * animação dos anos 80/60)", e mandou a ficha: doze expressões de olho, quatro
 * quadros de piscada e oito sobrancelhas (essas em `f3Sobrancelha.ts`).
 *
 * O instinto dele tem nome. Desenho animado de TV dos anos 60–80 não redesenhava
 * a cara quadro a quadro: mantinha a cabeça parada e TROCAVA CÉLULAS. É o que
 * este andar já faz com a boca, e é o que faz isso caber no celular dele — zero
 * byte de download, uma textura, e cada peça é uma função testável.
 *
 * ── UM OLHO É SEIS NÚMEROS ───────────────────────────────────────────────────
 *
 * As doze expressões da ficha não são doze desenhos: são o MESMO olho com
 * pálpebra, ângulo e direção de olhar diferentes. Descrever assim, e não como
 * doze listas de pontos, é o que permite a piscada existir — ela é a pálpebra de
 * cima descendo de 0 a 1, e os quadros intermediários saem de graça.
 *
 * ── A REGRA DE OURO DAQUI ────────────────────────────────────────────────────
 *
 * O `neutro` tem que ser a cara que o modelo JÁ TEM. O GLB do Diabrete vem com
 * dois olhos pretos grandes pintados na textura, e desenhar por cima significa
 * cobrir. Se o repouso desenhado não for igual ao olho do modelo, o personagem
 * muda de cara sem ninguém ter pedido — foi exatamente isso que aconteceu com o
 * nariz dele, três vezes seguidas. Então: parado, ninguém percebe; a animação só
 * aparece quando ele ATUA.
 */

export type NomeDoOlho =
    | 'neutro' | 'esquerda' | 'direita' | 'cima' | 'baixoMalicioso'
    | 'semicerrado' | 'fechadoSorrindo' | 'malicia' | 'arregalado'
    | 'bravo' | 'triste' | 'tonto';

export interface Olho {
    /** Quanto da altura do olho a pálpebra de CIMA cobre, de 0 a 1. */
    palpebraCima: number;
    /** Idem, a de baixo. */
    palpebraBaixo: number;
    /**
     * Inclinação da pálpebra de cima, em graus.
     * POSITIVO desce a ponta de DENTRO (perto do nariz) — é a cara de raiva.
     * NEGATIVO desce a de fora — é a cara de tristeza. Um sinal, duas emoções.
     */
    anguloDaPalpebra: number;
    /** Para onde a massa preta olha, em fração do olho (-1 a 1). */
    olharX: number;
    olharY: number;
    /** Fechado: em vez de massa, um arco só, virado para cima (sorrindo). */
    fechado: boolean;
    /**
     * Raio da pupila, de 0 a 1. Zero = olho cheio de tinta, que é o do modelo.
     * Acima de zero o olho vira campo claro com uma pupila pequena — o
     * "arregalado" da ficha, e é o que dá susto.
     */
    pupila: number;
    /** Espiral no lugar da pupila: o "tonto" da ficha. */
    espiral: boolean;
    /** O brilhinho de tinta que todo olho de desenho de 1930 tem. */
    brilho: boolean;
}

const O = (o: Partial<Olho> = {}): Olho => ({
    palpebraCima: 0, palpebraBaixo: 0, anguloDaPalpebra: 0,
    olharX: 0, olharY: 0, fechado: false, pupila: 0, espiral: false,
    brilho: true, ...o,
});

/** As doze da ficha, na ordem em que ele numerou. */
export const OLHOS: Readonly<Record<NomeDoOlho, Olho>> = Object.freeze({
    // 1. O REPOUSO. Tem que ser igual ao olho que o modelo já tem: massa cheia,
    // pálpebra nenhuma. Ver a regra de ouro no cabeçalho.
    neutro:          O(),
    esquerda:        O({ olharX: -0.45 }),
    direita:         O({ olharX: 0.45 }),
    cima:            O({ olharY: 0.40 }),
    // 5. "baixo (malicioso)": olhar caído E pálpebra pesada. As duas coisas
    // juntas é o que faz parecer malícia em vez de sono.
    baixoMalicioso:  O({ olharY: -0.38, palpebraCima: 0.30 }),
    semicerrado:     O({ palpebraCima: 0.40, palpebraBaixo: 0.06 }),
    fechadoSorrindo: O({ fechado: true, brilho: false }),
    // 8. "malícia": fenda inclinada. É a cara padrão dele em repouso quando está
    // aprontando, e combina com o sorriso torto da boca.
    //
    // As frações caíram (0,56/0,22 -> 0,42/0,10) quando o olho ganhou o tamanho
    // da ficha. A conta é a mesma, o olho é que ficou alto: 78% de pálpebra
    // sobre um olho de 113 px deixava uma lasca de 25 px, e na folha do rosto
    // montado `malicia` e `semicerrado` liam como dois riscos, não como olho
    // apertado. Na ficha do Felipe a "malícia apertada" é uma forma de FOLHA,
    // com massa.
    malicia:         O({ palpebraCima: 0.42, palpebraBaixo: 0.10, anguloDaPalpebra: 12 }),
    arregalado:      O({ pupila: 0.34, palpebraCima: -0.12 }),
    bravo:           O({ palpebraCima: 0.40, anguloDaPalpebra: 26, olharY: -0.10 }),
    triste:          O({ palpebraCima: 0.36, anguloDaPalpebra: -24, olharY: -0.16 }),
    tonto:           O({ espiral: true, pupila: 0.42, brilho: false }),
});

export const NOMES_DOS_OLHOS = Object.keys(OLHOS) as NomeDoOlho[];

/** O olho parado dele. Ver a regra de ouro: é o olho que o modelo já tem. */
export const OLHO_EM_REPOUSO: NomeDoOlho = 'neutro';

// ── A PISCADA ────────────────────────────────────────────────────────────────
/**
 * Quatro quadros, e eles NÃO são desenhos novos: são a pálpebra de cima
 * descendo. A ficha pede "aberto → meio → quase fechado → fechado", e é isso.
 */
export const QUADROS_DA_PISCADA = 4;
export const PISCADA: readonly number[] = Object.freeze([0, 0.42, 0.78, 1]);

/** O olho no quadro `i` de uma piscada, a partir de um olho qualquer. */
export function olhoPiscando(base: Olho, quadro: number): Olho {
    const i = Math.max(0, Math.min(PISCADA.length - 1, Math.floor(quadro)));
    const desce = PISCADA[i];
    if (desce >= 1) return { ...base, fechado: true, brilho: false };
    return { ...base, palpebraCima: Math.max(base.palpebraCima, desce) };
}

// ── O RELÓGIO DA PISCADA É SÓ DELA ───────────────────────────────────────────
/**
 * Piscar NÃO segue o fervilhar de 8 Hz nem a fala, e essa é a diferença entre
 * um personagem vivo e um boneco: piscar é involuntário, acontece no tempo dele,
 * e cair no compasso de outra coisa entrega o truque na hora.
 *
 * Uma pessoa pisca a cada 3 a 6 segundos. O Diabrete é elétrico, então: a cada
 * ~2,8 s, com a piscada durando 4 quadros a 14 Hz (0,29 s) — rápido, como convém
 * a desenho animado.
 */
export const INTERVALO_DA_PISCADA = 2.8;
export const PISCADA_HZ = 14;
export const DURACAO_DA_PISCADA = QUADROS_DA_PISCADA / PISCADA_HZ;

/**
 * Em que quadro da piscada ele está no instante `t`, ou -1 se está de olho
 * aberto. `fase` desencontra personagens (ou cenas) na mesma tela.
 */
export function quadroDaPiscada(t: number, fase = 0): number {
    // `Infinity % x` é NaN, e NaN escapa de todo `Math.min` — o teste pegou.
    if (!Number.isFinite(t) || t < 0) return -1;
    const ciclo = (t + fase * INTERVALO_DA_PISCADA) % INTERVALO_DA_PISCADA;
    if (ciclo >= DURACAO_DA_PISCADA) return -1;
    return Math.min(QUADROS_DA_PISCADA - 1, Math.floor(ciclo * PISCADA_HZ));
}

// ── O OLHO ACOMPANHA O GRITO ─────────────────────────────────────────────────
/**
 * A cara estava dividida em duas: a boca soletrando a frase inteira e os olhos
 * parados olhando. Numa cara de desenho isso não existe — quando o personagem
 * ESCANCARA a boca no acento da piada, o olho abre junto. É um quadro só, e é
 * ele que costura as duas metades do rosto.
 *
 * Só nos acentos (a palavra que o texto escreveu em CAIXA ALTA), e só quando o
 * olho de base não é uma cara que contradiria: quem está de olho fechado
 * sorrindo, ou tonto, ou já arregalado, fica como está.
 */
const NAO_ARREGALAM: readonly NomeDoOlho[] = Object.freeze([
    'fechadoSorrindo', 'tonto', 'arregalado', 'triste',
]);

export function olhoNoGrito(base: NomeDoOlho, gritando: boolean): NomeDoOlho {
    if (!gritando || NAO_ARREGALAM.includes(base)) return base;
    return 'arregalado';
}

// ── O OLHO SEGUE O MESMO ARCO QUE TUDO NESTE ANDAR ───────────────────────────
import type { MomentoDoDiabrete, MomentoExtra } from './f3Boca';

/**
 * Qual olho em cada momento, com o MESMO `roubados` que o chão (`f3Desenho`), a
 * voz (`f3Voz`), a trilha (`f3Trilha`) e a boca (`f3Boca`) já usam. Um número,
 * um dono — se o olho tivesse a própria contagem, mais cedo ou mais tarde a cara
 * dele contaria uma história diferente da do andar.
 */
export function olhoDoDiabrete(
    momento: MomentoDoDiabrete | MomentoExtra, roubados = 0,
): NomeDoOlho {
    const r = Math.max(0, Math.min(3, Math.floor(roubados) || 0));
    switch (momento) {
        case 'apresentacao': return 'malicia';
        case 'provoca':      return r === 0 ? 'malicia' : r === 1 ? 'baixoMalicioso' : 'bravo';
        case 'desenhou':     return r <= 1 ? 'baixoMalicioso' : 'bravo';
        case 'espetou':      return r <= 1 ? 'fechadoSorrindo' : 'malicia';
        // Roubar é a perda DELE: é aqui que o olho abre.
        case 'roubou':       return r <= 1 ? 'arregalado' : r === 2 ? 'bravo' : 'arregalado';
        case 'caiu':         return r >= 2 ? 'bravo' : 'fechadoSorrindo';
        case 'suplica':      return 'arregalado';

        case 'ocioso':          return 'baixoMalicioso';
        case 'quaseLaEmCima':   return 'malicia';
        case 'perdeuOPrimeiro': return 'bravo';
        case 'perdeuOUltimo':   return 'triste';
        case 'tonto':           return 'tonto';
        case 'pensando':        return 'cima';
        case 'confuso':         return 'esquerda';
        case 'vitorioso':       return 'fechadoSorrindo';
        case 'derrotado':       return 'semicerrado';
    }
}
