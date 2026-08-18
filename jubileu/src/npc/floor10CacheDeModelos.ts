// ── CONFERIR O CACHE DO wllama, PARA TODOS OS CARREGADORES ────────────────
//
// POR QUE EXISTE, e por que num arquivo próprio: esta conferência nasceu dentro
// do rascunhador. O defeito que ela conserta é do wllama, então vale para TODOS
// os modelos — e a vontade, que não a tinha, quebrou exatamente igual. O relato:
//
//   "eu estava baixando o lsfm, aí no fim, eu saí sem querer do chrome, e deu
//    erro, aí eu cliquei pra baixar dnv, e foi INSTANTÂNEO, mas faltava até que
//    um tempo antes de instalar"
//
// Descrição perfeita do mecanismo. O `download` do wllama 3.5.1 faz:
//
//     if (hint && (await sb.getSize(fileKey, hint)) !== -1) { …; return; }
//
// Se JÁ EXISTE algo com aquela chave, ele volta na hora dizendo "pronto" — sem
// conferir o tamanho. O pedaço que sobrou da tentativa interrompida passa por
// arquivo inteiro, e quem estoura depois é o `loadModelFromUrl`, com um
// "Model file not found" que não aponta para o cache.
//
// ── E A BUSCA É PELA CHAVE, NÃO PELA METADATA ────────────────────────────
//
// Medido no wllama de verdade:
//
//     depois do download ......... size=3000000  metadata=sim
//     depois de escrever parcial . size=1024     metadata=SEM
//
// Uma escrita interrompida PERDE a metadata — e `originalURL` mora nela. Quem
// procurar por `originalURL` nunca encontra a entrada quebrada, e portanto
// nunca consegue limpá-la. `getNameFromURL` devolve a chave (um hash da URL) e
// não depende de metadata nenhuma.
//
// ── DEIXAR ISTO DENTRO DE UM CARREGADOR FOI O ERRO ───────────────────────
//
// Foi o que aconteceu: o rascunhador ganhou a conferência, a vontade não, e o
// mesmo defeito voltou pelo outro lado. Um conserto que vale para todos os
// clientes não pode morar dentro de um deles.

export type ArquivoNoCache = {
    name: string;
    size: number;
    metadata?: { originalURL?: string; originalSize?: number };
};

export type CacheDoWllama = {
    list?: () => Promise<ArquivoNoCache[]>;
    delete?: (nome: string) => Promise<void>;
    /** A CHAVE de armazenamento da URL — existe mesmo sem metadata. */
    getNameFromURL?: (url: string) => Promise<string>;
};

/**
 * O que o cache tem, dito como FATO e não como causa.
 *
 * A primeira versão respondia `'faltando'` e a tela dizia "cota de disco no
 * limite". O dono do jogo tem 10 GB livres e me corrigiu na hora. Cada estado
 * carrega agora o que foi MEDIDO; quem explica é o diagnóstico, com hipóteses.
 */
export type EstadoDoCache =
    | { tipo: 'ok'; bytes: number }
    | { tipo: 'ausente'; bytes: number }
    | { tipo: 'sem-metadata'; bytes: number }
    | { tipo: 'tamanho-errado'; bytes: number };

/**
 * Confere se o arquivo daquela URL está inteiro no cache.
 *
 * NUNCA lança e nunca vira bloqueio: sem API para conferir, ou com erro, ela
 * responde `ok` e sai da frente. Uma verificação que reprova por não saber é
 * pior que a ausência dela.
 */
export async function conferirCacheDeModelo(
    cofre: CacheDoWllama | undefined,
    url: string,
    bytesEsperados: number,
): Promise<EstadoDoCache> {
    if (typeof cofre?.list !== 'function') return { tipo: 'ok', bytes: -1 };
    try {
        const nome = typeof cofre.getNameFromURL === 'function'
            ? await cofre.getNameFromURL(url)
            : null;
        const lista = await cofre.list();
        const meu = (nome ? lista.find((f) => f.name === nome) : undefined)
            ?? lista.find((f) => f.metadata?.originalURL === url);
        if (!meu) return { tipo: 'ausente', bytes: -1 };
        if (meu.size !== bytesEsperados) return { tipo: 'tamanho-errado', bytes: meu.size };
        // Tamanho certo e sem `originalURL`: o `loadModelFromUrl` procura por
        // esse campo e dirá "Model file not found" mesmo com o arquivo inteiro.
        if (!meu.metadata?.originalURL) return { tipo: 'sem-metadata', bytes: meu.size };
        return { tipo: 'ok', bytes: meu.size };
    } catch {
        return { tipo: 'ok', bytes: -1 };
    }
}

/** Apaga a entrada daquela URL — pela chave E pela metadata. */
export async function limparModeloDoCache(
    cofre: CacheDoWllama | undefined,
    url: string,
): Promise<number> {
    if (typeof cofre?.list !== 'function' || typeof cofre?.delete !== 'function') return 0;
    let apagados = 0;
    try {
        const nome = typeof cofre.getNameFromURL === 'function'
            ? await cofre.getNameFromURL(url)
            : null;
        for (const f of await cofre.list()) {
            if (f.name === nome || f.metadata?.originalURL === url) {
                await cofre.delete(f.name);
                apagados += 1;
            }
        }
    } catch { /* se não der para limpar, o erro do load já explica */ }
    return apagados;
}
