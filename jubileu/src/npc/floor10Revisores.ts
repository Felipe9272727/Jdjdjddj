// ── QUEM REMENDA A FRASE MARCADA ──────────────────────────────────────────
//
// O revisor é a etapa CARA do pipeline. O juiz custa 0,5 s e aponta; o remendo
// custa dezenas de segundos e é chamado uma vez por frase apontada. Com o
// rascunhador quebrando cânone em ~30% das falas, é ele que decide se a
// conversa é fluida ou se o Nilo trava meio minuto por resposta.
//
// ── POR QUE VIROU ESCOLHA, E NÃO UMA TROCA DIRETA ────────────────────────
//
// Pedido do dono do jogo: "coloca o llama como revisor — eu quero que deixe
// como opção no pipeline, colocar o llama ou o lfm, aí vc escolhe, e entra na
// linha única de download". As duas metades importam, e a segunda é a que
// obriga este módulo a existir: os dois candidatos NÃO custam o mesmo em
// disco, então a escolha muda a fila de download e precisa ser lida por ela.
//
//     LFM2.5 ..... 0 bytes novos. É o MESMO arquivo da vontade, dois papéis.
//     Llama 3.2 .. +1,02 GB. Arquivo próprio, que ninguém mais usa.
//
// ── O QUE FOI MEDIDO ─────────────────────────────────────────────────────
//
// Os dois no MESMO processo (comparar entre rodadas nesta bancada já deu 30,6 s
// e 52,1 s para a MESMA configuração), com o enunciado que leva o motivo do
// juiz, e a régua conferindo o cânone inteiro:
//
//     candidato        conserta  desviou  estraga  custo/frase  lê
//     LFM2.5 1.2B         3/6      1/6      0/3      52,1 s    267 tok
//     Llama 3.2 1B Q6     4/6      1/6      0/3      11,6 s     97 tok
//
// 4,5x mais rápido com placar igual ou melhor. E o motivo é estrutural, não
// sorte: `llama` é transformer puro e o llama.cpp reaproveita o prefixo entre
// chamadas, então ele relê só o que mudou. O `lfm2` é híbrido
// (`shortconv.l_cache` no gguf) e não aceita reaproveitamento PARCIAL — relê os
// ~270 tokens inteiros, toda vez, para sempre.
//
// RESSALVA QUE IMPEDE ISSO DE VIRAR PROPAGANDA: são 6 defeitos e 3 controles. A
// diferença de PLACAR (4/6 contra 3/6) cabe no ruído. A de TEMPO não cabe, e
// tem causa medida — 97 tokens lidos contra 267.
//
// ── E POR QUE O PADRÃO CONTINUA SENDO O LFM2.5 ───────────────────────────
//
// Porque 1,02 GB a mais numa fila que já tem 4,2 GB é decisão de quem baixa, no
// aparelho de quem baixa. Este projeto já derrubou o celular do dono do jogo
// com download, já viu a cota do navegador recusar 2,07 GB e emudecer o Nilo. O
// ganho é real e está medido; o custo também. `?revisor=llama` liga.

import type { SmallBrainId } from './floor10Brains';

export type RevisorId = 'lfm' | 'llama';

export type RevisorEntry = {
    id: RevisorId;
    label: string;
    /**
     * O modelo no catálogo dos cérebros pequenos, ou `null` quando o revisor é
     * a PRÓPRIA vontade — e aí não há arquivo novo nenhum.
     */
    cerebro: SmallBrainId | null;
    /** Bytes que ESTA escolha acrescenta à fila. Zero quando reusa a vontade. */
    bytesExtras: number;
    nota: string;
};

export const REVISORES: readonly RevisorEntry[] = Object.freeze([
    {
        id: 'lfm',
        label: 'LFM2.5 1.2B (o mesmo arquivo da vontade)',
        cerebro: null,
        bytesExtras: 0,
        nota: 'de graça em disco, mas relê os ~270 tokens do enunciado toda chamada: 52,1s por frase',
    },
    {
        id: 'llama',
        label: 'Llama 3.2 1B Q6 (arquivo próprio)',
        cerebro: 'llama32-1b-q6',
        bytesExtras: 1_021_800_576,
        nota: '4,5x mais rápido (11,6s por frase) porque reaproveita o prefixo — custa 1,02 GB na fila',
    },
]);

/**
 * O PADRÃO É O DE GRAÇA.
 *
 * Não é timidez: é a mesma regra que este andar segue desde o começo — uma
 * otimização que falha não pode custar a fala, e um download que não cabe
 * emudece o Nilo antes de qualquer otimização entrar em cena.
 */
export const REVISOR_PADRAO: RevisorId = 'lfm';

function lerDaUrl(busca: string): RevisorId | null {
    const pedido = new URLSearchParams(busca).get('revisor');
    if (!pedido) return null;
    return REVISORES.find((r) => r.id === pedido)?.id ?? null;
}

let escolhido: RevisorId | null = null;

/**
 * Qual revisor está em vigor.
 *
 * `?revisor=llama|lfm` troca sem recompilar — é assim que os dois são
 * comparados na MESMA pergunta, no MESMO aparelho. Sem isso a escolha seria
 * opinião, e opinar sobre desempenho já saiu caro neste projeto mais de uma vez.
 */
export function revisorEscolhido(): RevisorId {
    if (escolhido) return escolhido;
    const forcado = (globalThis as { __f10Revisor?: RevisorId }).__f10Revisor;
    if (forcado && REVISORES.some((r) => r.id === forcado)) return forcado;
    const busca = typeof window === 'undefined' ? '' : window.location.search;
    return lerDaUrl(busca) ?? REVISOR_PADRAO;
}

/** A entrada em vigor, inteira. */
export function revisorAtual(): RevisorEntry {
    return REVISORES.find((r) => r.id === revisorEscolhido()) ?? REVISORES[0];
}

/**
 * O modelo que o motor precisa ter de pé para remendar — ou `null` quando é a
 * própria vontade, e aí não há troca de arquivo nenhuma.
 */
export function cerebroDoRevisor(): SmallBrainId | null {
    return revisorAtual().cerebro;
}

/** Troca em tempo de execução (bancada, console, painel). */
export function definirRevisor(id: RevisorId): void {
    escolhido = REVISORES.some((r) => r.id === id) ? id : null;
}

export function resetRevisorParaTestes(): void {
    escolhido = null;
}
