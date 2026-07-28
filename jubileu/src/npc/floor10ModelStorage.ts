// ── COTA DE DISCO DO NAVEGADOR — por que o Nilo "pensava" para sempre ─────
//
// Diagnóstico medido dentro do jogo (sonda headless, Andar 10):
//   cota da origem  1,07 GB   ·   modelo de fala  1,92 GB   ·   os dois  2,60 GB
//   navigator.storage.persist() → false (negado)
//
// O wllama SEMPRE grava o modelo no cache — nem `useCache: false` escapa disso,
// ele só força rebaixar. Quando não cabe, o Worker levanta QuotaExceededError e
// tenta devolvê-lo por postMessage. DOMException não é clonável nessa borda,
// então o postMessage FALHA e o erro nunca chega ao main thread: a promessa da
// carga não resolve NEM rejeita. É exatamente a tela de "carregando" eterna,
// sem mensagem de erro, que aparecia depois de baixar 1,9 GB à toa.
//
// Este módulo é a defesa: mede a cota ANTES de baixar, limpa modelos velhos que
// só ocupam espaço, e transforma "trava para sempre" em "erro explicado".

/** Sobra que o próprio cache consome (metadados, blocos parciais, folga do FS). */
export const CACHE_HEADROOM = 1.08;

export type StorageEstimate = { quota: number | null; usage: number };

export type CachePlan =
    | { ok: true; freeBytes: number | null; message: '' }
    | { ok: false; freeBytes: number; needBytes: number; message: string };

export function formatGB(bytes: number): string {
    return `${(bytes / 1e9).toFixed(2)} GB`;
}

/**
 * Decide se vale começar o download. Na dúvida (navegador sem storage.estimate,
 * tamanho desconhecido) SEMPRE deixa tentar: um palpite errado que bloqueia o
 * NPC é pior que um download que falha.
 */
export function planModelCache(
    estimate: StorageEstimate,
    modelBytes: number | null,
): CachePlan {
    if (estimate.quota === null || modelBytes === null || modelBytes <= 0) {
        return { ok: true, freeBytes: null, message: '' };
    }
    const freeBytes = Math.max(0, estimate.quota - estimate.usage);
    const needBytes = Math.ceil(modelBytes * CACHE_HEADROOM);
    if (freeBytes >= needBytes) return { ok: true, freeBytes, message: '' };
    return {
        ok: false,
        freeBytes,
        needBytes,
        message:
            `o navegador só libera ${formatGB(freeBytes)} para este site e o modelo `
            + `precisa de ${formatGB(needBytes)}. Libere espaço no aparelho `
            + '(ou use um modelo menor) — o Nilo segue com os reflexos.',
    };
}

export type CachedEntry = { name: string; size?: number; metadata?: { originalURL?: string } };

/**
 * Um GGUF em cache é "estrangeiro" quando não é mais nenhum dos modelos atuais.
 * Cada troca de modelo deixava o anterior ocupando a cota — foi assim que 1 GB
 * de sobra virou zero e os DOIS cérebros passaram a rebaixar toda hora.
 */
export function isForeignModel(entry: CachedEntry, keepUrls: readonly string[]): boolean {
    const url = entry.metadata?.originalURL ?? '';
    const alvo = url || entry.name;
    if (!/\.gguf/i.test(alvo)) return false;
    return !keepUrls.some((keep) => keep === url || alvo.includes(fileNameOf(keep)));
}

function fileNameOf(url: string): string {
    const semQuery = url.split('?')[0] ?? url;
    return semQuery.slice(semQuery.lastIndexOf('/') + 1);
}

/** Soma o que a limpeza recuperaria, para poder dizer isso ao jogador. */
export function reclaimableBytes(
    entries: readonly CachedEntry[],
    keepUrls: readonly string[],
): number {
    return entries
        .filter((e) => isForeignModel(e, keepUrls))
        .reduce((total, e) => total + (e.size ?? 0), 0);
}

export async function readStorageEstimate(): Promise<StorageEstimate> {
    try {
        const storage = (navigator as unknown as {
            storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
        }).storage;
        const est = await storage?.estimate?.();
        return {
            quota: typeof est?.quota === 'number' ? est.quota : null,
            usage: typeof est?.usage === 'number' ? est.usage : 0,
        };
    } catch {
        return { quota: null, usage: 0 };
    }
}

/**
 * Tamanho do GGUF sem baixá-lo. O Hugging Face responde HEAD com content-length
 * depois do redirecionamento para o CDN; se algo falhar, devolve null e o plano
 * simplesmente deixa tentar.
 */
export async function probeModelBytes(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
        const len = Number(res.headers.get('content-length'));
        return Number.isFinite(len) && len > 0 ? len : null;
    } catch {
        return null;
    }
}
