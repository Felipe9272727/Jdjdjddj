// ── QUEM A FILA BAIXA — e o que muda quando o pipeline entra ──────────────
//
// Este arquivo existe porque a composição da fila deixou de ser óbvia. Até
// agora ela era uma lista fixa no `passosDoAndar10`; com o pipeline
// inglês-primeiro ela passa a ter duas formas, e a diferença é grande demais
// para ficar espalhada em `if`s pelo caminho de carga.
//
// ── A TROCA, EM BYTES ─────────────────────────────────────────────────────
//
//     HOJE                                    COM `?pipeline`
//     fala ....... SmolLM3-3B   1,92 GB       rascunho ... granite a400m  822 MB
//     vontade .... LFM2.5-1.2B  1,25 GB       vontade .... LFM2.5-1.2B   1,25 GB
//     motor ...... Qwen3-0.6B    639 MB       motor ...... Qwen3-0.6B     639 MB
//     memória .... embedgemma    334 MB       memória .... embedgemma     334 MB
//     reflexo .... SmolLM2-135M  139 MB       reflexo .... SmolLM2-135M   139 MB
//                                             juiz ....... mpnet          110 MB
//                                             tradutor ... Bergamot en↔pt  51 MB
//     ────────────────────────────────         ──────────────────────────────────
//     total ...................  4,28 GB      total ..................   3,34 GB
//
// **Quase um giga a menos.** O SmolLM3 sai porque no pipeline ele não escreve
// nada: quem rascunha é o MoE (3,2 s contra 13,4 s) e quem remenda é o LFM2.5
// (11,6 s e 3/3 de acerto, contra 18,4 s e 1/3 do SmolLM3).
//
// ── O QUE ISSO CUSTA, E PRECISA ESTAR ESCRITO ─────────────────────────────
//
// Sem o SmolLM3 não existe mais "o 3B escreve tudo em português" como rede de
// segurança. A cadeia de recuo passa a ser:
//
//   1. o MoE rascunha, o juiz confere, o LFM2.5 remenda, o Bergamot traduz;
//   2. se o rascunhador falhar → o LFM2.5 escreve a fala inteira EM INGLÊS e o
//      Bergamot traduz. Custa 30,8 s (o cache de prefixo dele não reaproveita),
//      mas fala;
//   3. se o TRADUTOR falhar → não há português, e nem sequer há pergunta: são
//      DOIS pares (`pt → en` para a pergunta do jogador, `en → pt` para a
//      resposta), porque a cadeia inteira do meio trabalha em inglês. Este é o
//      buraco, e por isso o tradutor entra em `conversaLiberada`: 51 MB que
//      precisam estar em pé antes de a conversa abrir, como a fala sempre
//      precisou.
//
// Um NPC que emudece porque a otimização falhou é pior que um NPC lento — é
// regra deste andar desde o começo, e a lista acima é ela aplicada.

import { pipelineLigado } from './floor10Pipeline';
import { FLOOR10_TRADUTOR_BYTES } from './floor10Tradutor';
import { cerebroDoRevisor, pesoDoRevisor } from './floor10Revisores';
import { SMALL_BRAIN_CATALOG } from './floor10Brains';

export type PapelNaFila =
    | 'fala' | 'rascunho' | 'vontade' | 'motor' | 'memoria' | 'reflexo' | 'juiz' | 'tradutor';

export type PecaDaFila = {
    papel: PapelNaFila;
    label: string;
    bytes: number;
    /** Sem esta peça o jogador não recebe uma fala em português. */
    essencial: boolean;
};

/** O SmolLM3 — fora da fila, e por que ele continua existindo no código. */
export const PECA_FALA: PecaDaFila = Object.freeze({
    papel: 'fala', label: 'SmolLM3-3B', bytes: 1_915_305_312, essencial: true,
});

export const PECA_RASCUNHO: PecaDaFila = Object.freeze({
    papel: 'rascunho', label: 'granite-3.1-1b-a400m (MoE, 400M ativos)', bytes: 821_847_360, essencial: true,
});
/**
 * O cérebro pequeno, que no pipeline serve DOIS papéis com UM arquivo.
 *
 * Deixou de ser constante quando `?revisor=` passou a trocar o modelo: com
 * `llama` a fila baixa 1,02 GB de Llama 3.2 em vez de 1,25 GB de LFM2.5 — não
 * os dois. Um rótulo fixo aqui faria a barra prometer o arquivo errado.
 */
export function pecaDaVontade(): PecaDaFila {
    // `pesoDoRevisor` e não o catálogo: com `?revisor=lfm-onnx` o arquivo não
    // é um gguf, e ler o catálogo aqui prometia 1,25 GB enquanto a rede baixava
    // 760 MB. O PAPEL continua sendo 'vontade' — é a mesma peça, outro arquivo,
    // exatamente como `?revisor=llama` já fazia.
    const m = pesoDoRevisor();
    return Object.freeze({
        papel: 'vontade' as const, label: m.label, bytes: m.bytes, essencial: false,
    });
}
export const PECA_MOTOR: PecaDaFila = Object.freeze({
    papel: 'motor', label: 'Qwen3-0.6B', bytes: 639_446_688, essencial: false,
});
export const PECA_MEMORIA: PecaDaFila = Object.freeze({
    papel: 'memoria', label: 'embeddinggemma-300M', bytes: 333_590_944, essencial: false,
});
export const PECA_REFLEXO: PecaDaFila = Object.freeze({
    papel: 'reflexo', label: 'SmolLM2-135M (ONNX)', bytes: 139_252_423, essencial: false,
});
export const PECA_JUIZ: PecaDaFila = Object.freeze({
    papel: 'juiz', label: 'juiz de tom (all-mpnet-base-v2)', bytes: 110_100_000, essencial: false,
});
/**
 * O peso vem IMPORTADO do próprio tradutor, e não copiado.
 *
 * Ele já mudou uma vez sem avisar: o par `pt → en` entrou depois — o jogador
 * pergunta em português e o rascunhador só lê inglês — e dobrou o número. Uma
 * cópia aqui teria continuado prometendo 26 MB na barra enquanto a rede baixava
 * 51, e a barra é a única coisa que o jogador tem para saber quanto falta.
 */
export const PECA_TRADUTOR: PecaDaFila = Object.freeze({
    papel: 'tradutor', label: 'Bergamot en↔pt', bytes: FLOOR10_TRADUTOR_BYTES, essencial: true,
});

/**
 * A fila, na ordem em que ela desce.
 *
 * A ordem não é estética: a primeira peça essencial é a que solta a conversa,
 * e as leves vêm antes das pesadas para que o jogador possa falar mais cedo.
 * No pipeline o tradutor (26 MB) vem logo depois do rascunhador porque sem ele
 * não sai português — é a segunda metade da mesma condição.
 */
export function composicaoDaFila(busca?: string): PecaDaFila[] {
    if (!pipelineLigado(busca ?? globalThis.location?.search ?? '')) {
        return [PECA_FALA, PECA_MEMORIA, PECA_REFLEXO, pecaDaVontade(), PECA_MOTOR];
    }
    return [
        PECA_RASCUNHO,
        PECA_TRADUTOR,
        PECA_JUIZ,
        PECA_MEMORIA,
        PECA_REFLEXO,
        // A vontade é também o REVISOR do pipeline — UM arquivo, dois papéis,
        // e é `?revisor=` que escolhe qual. Ela não é essencial para a
        // primeira fala porque o rascunho só vai ao revisor quando o juiz
        // marca alguma coisa.
        //
        // NÃO EXISTE UMA SEGUNDA PEÇA AQUI, e essa foi a correção: a primeira
        // versão acrescentava o Llama ao lado do LFM2.5 — 2,27 GB de cérebro
        // pequeno para usar um.
        pecaDaVontade(),
        PECA_MOTOR,
    ];
}

/** Quantos bytes a fila inteira baixa. É o número que a barra promete. */
export function bytesDaFila(busca?: string): number {
    return composicaoDaFila(busca).reduce((s, p) => s + p.bytes, 0);
}

/**
 * As peças sem as quais não sai uma fala em português — as que a conversa
 * espera antes de abrir.
 *
 * Fora do pipeline é uma só (o SmolLM3). Dentro, são duas: o rascunhador e o
 * tradutor. O juiz NÃO entra: sem ele o rascunho passa direto, que é pior em
 * qualidade e não em silêncio.
 */
export function pecasEssenciais(busca?: string): PecaDaFila[] {
    return composicaoDaFila(busca).filter((p) => p.essencial);
}

/**
 * O SmolLM3 continua no código e sai da fila.
 *
 * Pedido do dono do jogo: "tire o smol da fila, deixe ele só como testagem na
 * bancada". Ele continua sendo carregável por `?mente=smol` e pelas bancadas —
 * é a régua contra a qual o pipeline é medido, e uma régua que some não serve
 * para medir nada.
 */
export function smolNaFila(busca?: string): boolean {
    return composicaoDaFila(busca).some((p) => p.papel === 'fala');
}

export function smolDisponivelParaBancada(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]mente=smol\b/i.test(busca) || /[?&]bancada\b/i.test(busca);
}
