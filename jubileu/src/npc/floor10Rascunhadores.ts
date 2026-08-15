// ── QUEM ESCREVE O PRIMEIRO JATO DA FALA ───────────────────────────────────
//
// Este arquivo existe por causa de uma pergunta do dono do jogo: "e qual ia
// rascunha? vc nem pesquisou uma ia rápida e boa pra isso". Ele estava certo.
//
// A primeira versão do rascunhador chamava "o cérebro pequeno" — que é o da
// VONTADE. Não foi uma escolha; foi o modelo que por acaso já estava carregado.
// E a escolha por acaso caiu justamente no candidato que não serve:
//
//     LFM2.5-1.2B, card da própria Liquid: en, ar, zh, fr, de, ja, ko, es
//
// Português não está lá. O Nilo fala português.
//
// ── O QUE FOI VERIFICADO, CARD POR CARD ───────────────────────────────────
//
// Não é lista de gosto nem memória: cada linha abaixo saiu da metadata do
// repositório no Hugging Face, lida agora.
//
//   Qwen3-0.6B ....... "Support of 100+ languages and dialects", com "strong
//                       capabilities for multilingual instruction following".
//                       0,6B — o menor de todos, e velocidade é a razão de
//                       este caminho existir. JÁ ESTÁ NO APARELHO: são os
//                       mesmos 639 MB do motor.
//   Llama-3.2-1B ..... `pt` na lista oficial de idiomas do card da Meta
//                       (en, de, fr, it, pt, hi, es, th). 1,2B.
//   LFM2.5-1.2B ...... português AUSENTE do card. É a vontade em uso hoje.
//   Gemma-3-1b-it .... card SEM metadata de idioma nenhuma — ao contrário dos
//                       irmãos 4B+, que listam dezenas. 1,0B.
//   EuroLLM-1.7B ..... 35 idiomas europeus com `pt` entre os primeiros, feito
//                       para isso. Mas: 1,7B (o mais lento), GGUF só de
//                       terceiros (~800 downloads), e um download NOVO — e a
//                       cota deste jogo já recusou 2,07 GB uma vez, emudecendo
//                       o Nilo. Fica documentado e fora do padrão por isso.
//
// ── O QUE ESTA LISTA NÃO PROVA ────────────────────────────────────────────
//
// Declarar português não é escrever bem em português, e nenhuma metadata mede
// prosa de terror em primeira pessoa. A lista elimina quem está DESQUALIFICADO
// e ordena o resto por custo. Quem decide entre os qualificados é a medição no
// aparelho — `tools/f10-rascunhador.mjs` — como a vontade foi decidida.

export type RascunhadorId = 'motor' | 'vontade' | 'nenhum';

export type RascunhadorEntry = {
    id: RascunhadorId;
    label: string;
    /** O que o card do modelo declara sobre português. */
    portugues: string;
    /** Por que ele está (ou não está) como padrão. */
    nota: string;
};

export const RASCUNHADORES: readonly RascunhadorEntry[] = Object.freeze([
    {
        id: 'motor',
        label: 'Qwen3 0.6B (o motor, já carregado)',
        portugues: 'card declara 100+ idiomas e instruction following multilíngue',
        nota: 'o menor dos candidatos e zero cota a mais — são os 639 MB do motor',
    },
    {
        id: 'vontade',
        label: 'o cérebro da vontade em uso',
        portugues: 'depende de qual vontade está escolhida; o LFM2.5 NÃO declara pt',
        nota: 'existe para comparar na bancada, não para ser o padrão',
    },
    {
        id: 'nenhum',
        label: 'sem rascunho (o 3B escreve tudo, como antes)',
        portugues: 'o SmolLM3 escreve direto',
        nota: 'o caminho antigo, inteiro — a régua contra a qual os outros são medidos',
    },
] as const);

/**
 * O padrão é o motor, e o motivo mais forte não é a nota do card: é ele já
 * estar no aparelho. Baixar um modelo NOVO para acelerar uma resposta cobra
 * cota da fala, e a fala é o que não pode faltar.
 */
export const RASCUNHADOR_PADRAO: RascunhadorId = 'motor';

function lerDaUrl(busca: string): RascunhadorId | null {
    const pedido = new URLSearchParams(busca).get('rascunhador');
    if (!pedido) return null;
    const achado = RASCUNHADORES.find((r) => r.id === pedido);
    return achado ? achado.id : null;
}

let escolhido: RascunhadorId | null = null;

/**
 * Qual rascunhador está em vigor.
 *
 * `?rascunhador=vontade|motor|nenhum` troca sem recompilar — é assim que os
 * três são comparados na MESMA pergunta, no MESMO aparelho, olhando a linha
 * "leitura Xs · fala Ys". Sem esse par de números a escolha seria opinião, e
 * opinar sobre desempenho já saiu caro neste projeto.
 */
export function rascunhadorEscolhido(): RascunhadorId {
    if (escolhido) return escolhido;
    const forcado = (globalThis as { __f10Rascunhador?: RascunhadorId }).__f10Rascunhador;
    if (forcado && RASCUNHADORES.some((r) => r.id === forcado)) return forcado;
    const busca = typeof window === 'undefined' ? '' : window.location.search;
    return lerDaUrl(busca) ?? RASCUNHADOR_PADRAO;
}

/** Troca a escolha em tempo de execução (bancada e console). */
export function definirRascunhador(id: RascunhadorId): void {
    escolhido = RASCUNHADORES.some((r) => r.id === id) ? id : null;
}

export function resetRascunhadorParaTestes(): void {
    escolhido = null;
}
