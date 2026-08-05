// ── BAIXAR NÃO É LIGAR ────────────────────────────────────────────────────
//
// O desenho é do dono do jogo, e ele o descreveu assim:
//
//   "primeiro, baixe tudo de uma vez, sem ligar, deixe os pesos desses modelos
//    na memória, assim não vai gastar na CPU, eles não podem ter uma thread
//    ativa enquanto não estão sendo usados, será um roteamento inteligente"
//
// Hoje as duas coisas são a MESMA chamada: `loadModelFromUrl` baixa o .gguf e,
// no fim, sobe um llama.cpp inteiro — pool de threads, heap do WASM, tudo.
// Enquanto forem a mesma chamada, "baixe tudo sem ligar" é impossível, e é por
// isso que este arquivo existe antes de qualquer roteador.
//
// ── POR QUE ISTO IMPORTA, COM NÚMERO ──────────────────────────────────────
// Medido no celular emulado, separando memória ANÔNIMA de cache de arquivo:
//
//     RSS sustentado ..... 5,09 GB
//     anônima ............ 4,52 GB   <- alocada, o kernel não tem para onde mandar
//     cache de arquivo ... 0,57 GB   <- descartável sob pressão
//
// Ou seja: 89% do custo é memória de verdade. Um cérebro de pé pesa mesmo, e
// descarregá-lo devolve mesmo. O Colibri (744B em 25 GB de RAM) chega ao mesmo
// princípio por outro caminho — disco como fonte, RAM só para o que está ativo.
// Ele fatia por especialista de MoE; aqui a granularidade é o cérebro inteiro,
// que é mais simples e serve.
//
// O QUE ESTE MÓDULO NÃO FAZ: decidir quem liga e quando. Isso é o roteador, e
// ele vem depois — sobre esta separação.

/** O contrato mínimo do CacheManager do wllama que o download usa. */
export type CofreDeModelos = {
    download?: (
        url: string,
        opcoes?: { progressCallback?: (p: { loaded: number; total: number }) => void },
    ) => Promise<unknown>;
    getSize?: (nome: string) => Promise<number>;
};

export type ProgressoDoDownload = (loaded: number, total: number) => void;

/**
 * Baixa o .gguf para o OPFS SEM subir runtime nenhum.
 *
 * Devolve `false` quando o runtime não expõe `download` — e nesse caso quem
 * chama deve seguir pelo caminho antigo (baixar junto de carregar) em vez de
 * ficar sem modelo. Degradar é aceitável; sumir com o cérebro não é.
 */
export async function baixarSemSubir(
    cofre: CofreDeModelos | null | undefined,
    url: string,
    aoProgredir?: ProgressoDoDownload,
): Promise<boolean> {
    if (typeof cofre?.download !== 'function') return false;
    await cofre.download(url, {
        progressCallback: ({ loaded, total }) => aoProgredir?.(loaded, total),
    });
    return true;
}

/**
 * Os quatro estados de um cérebro, e a distinção que o jogo não tinha.
 *
 * Até aqui existiam só dois — "carregado" ou não — e por isso a fila precisava
 * SUBIR cada modelo para poder dizer que ele estava pronto. `no-aparelho` é o
 * estado que faltava: os pesos chegaram, e nada está gastando CPU por eles.
 */
export type EstadoDoCerebro = 'ausente' | 'baixando' | 'no-aparelho' | 'de-pe';

/**
 * Quem deve estar DE PÉ agora, dado o que o jogador está fazendo.
 *
 * Pura de propósito: é a regra inteira do roteamento, e ela precisa ser
 * legível e testável sem subir nada. A tabela é a que o dono do jogo escreveu:
 *
 *   no chat ....... mente (fala) + memória. A vontade e o motor esperam.
 *   fora do chat .. vontade + motor. A fala e a memória esperam.
 */
export type Cerebro = 'fala' | 'memoria' | 'vontade' | 'motor';

export function quemDevoLigar(noChat: boolean): readonly Cerebro[] {
    return noChat ? ['fala', 'memoria'] : ['vontade', 'motor'];
}

/** O complemento: quem deve sair de pé para o outro grupo caber. */
export function quemDevoDesligar(noChat: boolean): readonly Cerebro[] {
    return quemDevoLigar(!noChat);
}
