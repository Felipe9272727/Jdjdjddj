// ── O NILO PARADO NÃO PODE SER UM PIÃO ────────────────────────────────────
//
// Quando ele não estava indo a lugar nenhum e não tinha ninguém para encarar, o
// corpo fazia isto, todo quadro:
//
//     desiredYaw = g.rotation.y + 0.32;
//
// Como o alvo era sempre "0,32 rad à frente de onde estou agora", ele nunca
// chegava — girava a ~40°/s, para sempre, no mesmo sentido. A intenção escrita
// no comentário era "varre a sala lentamente em vez de ficar congelado"; o que
// saía era um homem rodando sozinho no meio do quarto, sem nunca olhar para
// nada. Ficar congelado era estranho, mas rodopiar é pior.
//
// Aqui a varredura vira o que uma pessoa faz: olha para um ponto, SEGURA o
// olhar alguns segundos, e depois escolhe outro ponto — sempre em volta da
// direção em que estava quando parou. Sem sorteio guardado em lugar nenhum: o
// ângulo sai do próprio relógio, então dois quadros do mesmo instante dão o
// mesmo resultado e o teste consegue afirmar qualquer coisa sobre ele.

/** Quanto tempo o olhar fica parado em cada ponto. */
export const OLHADA_SEG = 3.4;

/** Até onde ele vira a cabeça para os lados, em radianos (~66°). */
export const OLHADA_AMPLITUDE = 1.15;

/**
 * Ruído determinístico em [-1, 1] a partir de um índice inteiro. É o seno
 * embaralhado de sempre: barato, sem estado e igual em qualquer aparelho.
 */
function ruido(indice: number): number {
    const x = Math.sin(indice * 12.9898 + 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Para onde olhar neste instante, dado o rumo em que ele estava quando parou.
 *
 * O resultado é ABSOLUTO (não relativo à rotação atual), que é justamente o que
 * impede a pirueta: por mais tempo que passe, o alvo nunca escapa de
 * `base ± OLHADA_AMPLITUDE`.
 */
export function yawDaVarredura(base: number, t: number): number {
    const trecho = Math.floor(t / OLHADA_SEG);
    return base + ruido(trecho) * OLHADA_AMPLITUDE;
}

/**
 * Quanto falta para a próxima olhada — usado só por diagnóstico e teste, mas
 * deixa explícito que a varredura é feita de PAUSAS, não de rotação contínua.
 */
export function segundosAteProximaOlhada(t: number): number {
    return OLHADA_SEG - (t % OLHADA_SEG);
}
