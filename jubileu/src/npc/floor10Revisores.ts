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
// obriga este módulo a existir: a escolha muda QUAL arquivo a fila baixa, e
// portanto precisa ser lida por ela.
//
// ── UM CÉREBRO PEQUENO, NÃO DOIS ─────────────────────────────────────────
//
// A primeira versão disto ACRESCENTAVA o Llama à fila, ao lado do LFM2.5 — 2,27
// GB de cérebro pequeno para usar um. O dono do jogo cortou na hora: "isso é
// burrice, não precisa baixar os dois; no ?revisor=llama deixe baixar só o
// llama, e no pipeline normal, o lfm".
//
// Ele está certo, e a consequência é maior que economia de banda: se só existe
// UM arquivo, ele serve os dois papéis (vontade e revisor) e toda a máquina de
// "trocar de papel descarregando o modelo" que eu tinha escrito some junto.
//
//     ?pipeline ................. baixa o LFM2.5, 1,25 GB
//     ?pipeline&revisor=llama ... baixa o Llama 3.2, 1,02 GB
//
// O QUE ISSO CUSTA, e não é zero: com `llama` a DELIBERAÇÃO também passa a ser
// o Llama. Medido em `floor10Brains`, ele assina a escolha em 14/15 rodadas
// contra 15/15 do LFM2.5, e a rodada sobe de 44,8 s para 64,8 s. Pior, não
// quebrado — e é o preço de não baixar dois modelos de 1 GB.
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
// E O PLACAR DE QUALIDADE NÃO SOBREVIVEU À REPETIÇÃO: numa segunda rodada, o
// mesmo Llama fez 2/6, ecoando a frase errada letra por letra em três casos.
// Com 6 casos e temperatura 0,7, o "4/6 contra 3/6" era ruído — eu avisei que
// cabia no ruído e mesmo assim usei o número para recomendar. Só a diferença de
// TEMPO era estrutural, e ela também não se confirmou no celular (ver abaixo).
//
// A diferença de TEMPO, essa, é estrutural e não sorte: `llama` é transformer
// puro e o llama.cpp reaproveita o prefixo entre chamadas, então ele relê só o
// que mudou. O `lfm2` é híbrido (`shortconv.l_cache` no gguf) e não aceita
// reaproveitamento PARCIAL — relê os ~270 tokens inteiros, toda vez.
//
// SÓ QUE NEM ELA SOBREVIVEU AO APARELHO: no celular o Llama custou 14,7 s a
// 71,9 s por frase, contra os 11,6 s desta bancada. A bancada AQUECE antes de
// medir, e no jogo o revisor sobe do zero a cada turno — a primeira frase
// marcada paga a persona inteira, que é justamente o que o reaproveitamento
// pouparia. Eu medi o caso que o jogo não faz.
//
// Medido depois, no mesmo processo: granite 3.3 2B Q4 fez 5/6 com ZERO desvios
// — o melhor placar que qualquer candidato tirou aqui — a 34,7 s por frase,
// lendo 109 tokens. É a pista viva; ainda não foi repetida nem medida a frio, e
// a lição desta seção é exatamente não recomendar antes disso.

import type { SmallBrainId } from './floor10Brains';

export type RevisorId = 'lfm' | 'llama';

export type RevisorEntry = {
    id: RevisorId;
    label: string;
    /** O cérebro pequeno que esta escolha coloca na fila. Sempre existe um. */
    cerebro: SmallBrainId;
    nota: string;
};

export const REVISORES: readonly RevisorEntry[] = Object.freeze([
    {
        id: 'lfm',
        label: 'LFM2.5 1.2B',
        cerebro: 'lfm2-1b',
        nota: 'relê os ~270 tokens do enunciado toda chamada: 52,1s por frase — mas delibera melhor',
    },
    {
        // ── REPROVADO NO APARELHO, e o registro fica ─────────────────────
        //
        // Na bancada ele marcou 11,6 s por frase contra 52,1 s do LFM2.5, e eu
        // recomendei a troca. NO CELULAR DO DONO DO JOGO ele custou 14,7 s,
        // 21,4 s, 64,5 s e 71,9 s — "a ponto de chegar numa demora nível
        // smollm3 sozinho" — e o veredito foi "llama está DESCARTADO".
        //
        // Duas coisas explicam a diferença, e as duas são falha da minha
        // medição, não do modelo:
        //
        //   1. a bancada AQUECE antes de medir (`await remendar(SYS, 'hi'…)`),
        //      e no jogo o revisor sobe do zero a cada turno — a primeira frase
        //      marcada paga a persona inteira, sem cache nenhum;
        //   2. o celular dele é muito mais lento que esta caixa, e eu nunca
        //      medi nada lá.
        //
        // E o pior não foi o tempo: numa das falas ele devolveu `The player
        // asks, "I've been on the ground floor…"` — inventou uma fala do
        // JOGADOR, que chegou traduzida à tela. Isso virou a conferência de
        // cânone em `floor10CanoneDoNilo`, que vale para qualquer revisor.
        //
        // Continua selecionável para a bancada. Não é recomendação.
        id: 'llama',
        label: 'Llama 3.2 1B Q6 (REPROVADO no aparelho)',
        cerebro: 'llama32-1b-q6',
        nota: 'rápido na bancada (11,6s) e lento no celular (14,7 a 71,9s); inventou fala do jogador uma vez',
    },
]);

/**
 * O PADRÃO CONTINUA O LFM2.5 — "por enquanto", nas palavras do dono do jogo.
 *
 * Ele ganha do Llama na DELIBERAÇÃO (15/15 contra 14/15 ao assinar a escolha,
 * e 44,8 s contra 64,8 s por rodada) e perde feio no REMENDO (52,1 s contra
 * 11,6 s). Enquanto um arquivo só serve os dois papéis, a escolha é essa
 * troca — e ela ainda não foi medida no aparelho de quem joga.
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
 * O cérebro pequeno que esta escolha põe na fila — e que serve os DOIS papéis.
 *
 * É lido por `floor10Brains` para decidir qual arquivo desce, o que faz de
 * `?revisor=` a chave que troca o modelo inteiro, e não um segundo download.
 */
export function cerebroDoRevisor(): SmallBrainId {
    return revisorAtual().cerebro;
}

/** Troca em tempo de execução (bancada, console, painel). */
export function definirRevisor(id: RevisorId): void {
    escolhido = REVISORES.some((r) => r.id === id) ? id : null;
}

export function resetRevisorParaTestes(): void {
    escolhido = null;
}
