/** Timelines shared by the director and the cinematic effects (seconds). */
export const F12_CINEMA = { intro: 14, victory: 10.5, rupture: 3.2 } as const;

export function cinemaEase(value: number): number {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
}

export function victoryBeat(seconds: number) {
  const t = Math.max(0, seconds);
  return {
    tremor: cinemaEase(t / 2.8),
    rupture: cinemaEase((t - F12_CINEMA.rupture) / .65),
    fall: cinemaEase((t - 4.0) / 4.2),
    escape: cinemaEase((t - 7) / 3.5),
    finished: t >= F12_CINEMA.victory,
  };
}

/**
 * ── A DERROTA TAMBÉM É UMA CENA ──────────────────────────────────────────────
 *
 * Perder acabava a luta assim: `fase = 'derrota'`, projéteis limpos, motor
 * desligado, um balão de fala e um botão REPETIR. Sem relógio, sem câmera, sem
 * um único quadro de consequência — a cena era DESLIGADA. Ao lado dos 10,5 s
 * coreografados da vitória, perder parecia um bug, e é o desfecho que o jogador
 * ruim vê mais vezes.
 *
 * Os tempos são o negativo da vitória, e de propósito mais curtos: quem perdeu
 * quer tentar de novo, não assistir. A vitória dá 10,5 s porque é prêmio; a
 * derrota dá 6,4 porque é consequência.
 *
 *   atingido — o motor morre e o avião começa a rodar (o golpe, não o susto)
 *   rodopio  — a espiral, com o irmão mergulhando atrás
 *   engolir  — a cabeça desce para dentro do quadro e abre a boca: é a última
 *              coisa que se vê, e é o que faz a derrota ser DELA e não do acaso
 *   preto    — fecha, e só então entra a fala
 */
export const CENA_DA_DERROTA = { total: 6.4, engolir: 3.4 } as const;

export function defeatBeat(seconds: number) {
  const t = Math.max(0, seconds);
  return {
    /** 0→1 no primeiro instante: o baque. */
    atingido: cinemaEase(t / .55),
    /** 0→1 ao longo da queda: quanto o avião já rodou e caiu. */
    rodopio: cinemaEase((t - .35) / 3.1),
    /** 0→1 enquanto a cabeça avança e abre a boca sobre a câmera. */
    engolir: cinemaEase((t - CENA_DA_DERROTA.engolir) / 2.1),
    /** 0→1 do fade final. */
    preto: cinemaEase((t - 5.3) / 1.0),
    finished: t >= CENA_DA_DERROTA.total,
  };
}

/**
 * ── A VIRADA PRECISA ACONTECER NA TELA ───────────────────────────────────────
 *
 * Aos 50% de vida o andar fazia isto: trocava a fase, apagava os projéteis,
 * tocava UMA explosão e passava a vez para o balão de fala. O quadro congelava
 * na pose em que a cabeça estivesse. Sem movimento de câmera, sem reação da
 * cabeça, sem efeito — e o HUD inteiro sumia, porque ele está preso a
 * `fase === 'luta'`, justamente o HUD com a barra de vida de que o momento
 * trata. O jogador era informado por escrito de que algo grande tinha
 * acontecido, sem ver nada acontecer.
 *
 * Diferente da vitória e da derrota, esta cena NÃO tem duração fixa: quem a
 * encerra é o jogador, clicando pelo diálogo. Então o relógio aqui só governa a
 * ENTRADA — o baque, a câmera indo para cima da cara, a cabeça se abrindo — e
 * depois segura a pose até o jogador seguir.
 */
export const CENA_DA_VIRADA = { entrada: 2.6 } as const;

export function turnBeat(seconds: number) {
  const t = Math.max(0, seconds);
  return {
    /** O baque seco do primeiro instante. */
    baque: cinemaEase(t / .4),
    /** A câmera fechando na cara. */
    aproxima: cinemaEase(t / CENA_DA_VIRADA.entrada),
    /** O tremor, que começa forte e assenta. */
    tremor: Math.max(0, 1 - cinemaEase(t / 1.8)),
    /** A cabeça escancarando: o rugido. */
    rugido: Math.max(0, Math.sin(Math.min(1, t / 1.5) * Math.PI)),
  };
}
