// ── A MEMÓRIA POR SIGNIFICADO — o QUARTO modelo do 10º andar ───────────────
//
// POR QUE ELE EXISTE
// O cânone do Nilo era procurado por PALAVRA. Medido nas 12 perguntas que uma
// pessoa realmente faz em português: 8 não recuperavam fato NENHUM e 2
// recuperavam o fato errado — 2/12. E quando nada é recuperado o cérebro de
// fala responde só com a persona, que é de onde saem as invenções ("lembro que
// VOCÊ era um ex-técnico de elevadores").
//
// O problema não é o cânone, é a busca. "O que te trouxe pra cá?" não contém
// nenhuma das palavras-chave de `past`, mas é exatamente essa a pergunta.
//
// Um modelo de embedding lê a pergunta pelo SIGNIFICADO. Medido no navegador,
// no mesmo caminho que o jogo usa (wllama), com as MESMAS 12 perguntas:
//
//      por palavra .................  2/12
//      granite-embedding 107M ......  6/12   (121 MB)
//      multilingual-e5-small ....... 1/12    (conversão GGUF quebrada, ver abaixo)
//      embeddinggemma 300M .........  9/12   (333 MB)
//      embeddinggemma 300M + título 11/12   ← o que está aqui
//
// O "+ título" é o campo `tema` do cânone entrando no prompt de documento que
// o embeddinggemma espera. Custou dez linhas de texto e valeu duas perguntas.
//
// SOBRE O e5: a única conversão com o tokenizador certo (SentencePiece/XLM-R)
// não grava `token_type_count` e o llama.cpp recusa o arquivo; as conversões
// que gravam essa chave usam tokenizador WordPiece e devolvem vetores inúteis
// (1/12, com uma frase sobre gatos ganhando da resposta certa). Consertei a
// metadata com tools/gguf-kv.py e aí o tokenizador SPM estourava
// `unordered_map::at: key not found` dentro do WASM em texto com acento. Ficou
// documentado para ninguém tentar de novo achando que é fácil.
//
// O QUE ELE NÃO FAZ
// Não fala, não decide e não pode atrasar a conversa. Se o modelo não baixar,
// não couber ou demorar, a busca por palavra continua valendo e o Nilo responde
// como responde hoje. É por isso que ele é o ÚLTIMO da fila de download.
import { FLOOR10_CANON, type CanonEntry } from './floor10Canon';
import {
    DownloadMeter,
    DOWNLOAD_ZERO,
    downloadLine,
    formatBytes,
} from './floor10Download';
import { floor10Fila, FILA_MEMORIA } from './floor10Fila';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import {
    FLOOR10_MEMORIA_VETORES,
    FLOOR10_MEMORIA_DIM,
} from './floor10MemoriaVetores';
import {
    deleteCachedModel,
    isBrokenModelCacheError,
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { npc, npcSet } from './npcStore';
import { cpuThreadCount } from './wllamaEngine';

const WLLAMA_V = '3.5.1';
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM = `${CDN}/wasm/wllama.wasm`;

export const FLOOR10_MEMORIA_MODEL = Object.freeze({
    id: 'embeddinggemma-300m',
    label: 'Memória EmbeddingGemma 300M',
    url: (globalThis as { __memoryModelUrl?: string }).__memoryModelUrl
        ?? 'https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf',
    bytes: 333_590_944,
});

export const FLOOR10_MEMORIA_SIZE_LABEL = formatBytes(FLOOR10_MEMORIA_MODEL.bytes);

/** Duas threads: é um trabalho de 200ms que não pode roubar a CPU da fala. */
export const FLOOR10_MEMORIA_THREADS = 2;

export function memoriaThreads(): number {
    return Math.min(FLOOR10_MEMORIA_THREADS, Math.max(1, cpuThreadCount()));
}

export const FLOOR10_MEMORIA_LOAD_CONFIG = Object.freeze({
    // 512 é o contexto do próprio modelo; pedir mais só gastaria RAM.
    n_ctx: 512,
    n_batch: 512,
    n_gpu_layers: 0,
    embeddings: true,
    pooling_type: 'mean',
});

export const FLOOR10_MEMORIA_USE_CACHE = true;
export const FLOOR10_MEMORIA_LOAD_TIMEOUT_MS = 180_000;
/**
 * Teto por pergunta. Medido no contêiner (2 threads, CPU de servidor):
 * 130–450ms quente. Passar disso é sintoma de outra coisa disputando a CPU — e
 * nesse caso é melhor responder sem o fato do que fazer o jogador esperar.
 *
 * Era 1500ms e isso derrubava justamente a PRIMEIRA pergunta: medido, a
 * primeira busca depois da carga levou 1504ms (fria) contra ~300ms nas
 * seguintes. Hoje o aquecimento abaixo paga esse custo junto da barra de
 * download, e a folga aqui existe só para o celular, que é mais lento que esta
 * máquina.
 */
export const FLOOR10_MEMORIA_TIMEOUT_MS = 2_500;
/**
 * Piso de semelhança. Abaixo disto o "melhor" fato é só o menos ruim de dez, e
 * enfiar um fato aleatório no prompt é pior que não enfiar nenhum.
 *
 * O número saiu de medir os dois lados no navegador (tools/f10-memoria-vetores):
 *   pergunta do assunto ....... 0,24 a 0,44
 *   pergunta fora do assunto .. 0,085 a 0,177  ("oi" é o teto aqui)
 * 0,20 cai exatamente no vão entre os dois — um "oi" não puxa fato nenhum e a
 * pergunta mais fraca do conjunto ainda puxa.
 */
export const FLOOR10_MEMORIA_PISO = 0.20;
/** Pergunta gigante não entra no lote do modelo; cortar é melhor que falhar. */
export const FLOOR10_MEMORIA_MAX_CHARS = 600;

// ── OS PROMPTS QUE O EMBEDDINGGEMMA ESPERA ────────────────────────────────
// Não são decorativos: o modelo foi treinado com estes prefixos e trocá-los
// muda o resultado. O `title:` é o campo em que entra o `tema` do cânone.
export function textoDoDocumento(entry: CanonEntry): string {
    return `title: ${entry.tema} | text: ${entry.fact}`;
}

export function textoDaPergunta(query: string): string {
    return `task: search result | query: ${query.slice(0, FLOOR10_MEMORIA_MAX_CHARS)}`;
}

/** FNV-1a de 32 bits — só precisa detectar cânone editado, não é criptografia. */
export function hashDoFato(entry: CanonEntry): number {
    const texto = textoDoDocumento(entry);
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

type Vetor = Float32Array;

function decodificar(base64: string, escala: number): Vetor {
    const bin = atob(base64);
    const saida = new Float32Array(bin.length);
    let soma = 0;
    for (let i = 0; i < bin.length; i += 1) {
        // int8 assinado a partir do byte.
        const b = bin.charCodeAt(i);
        const x = ((b & 0x80) ? b - 256 : b) / 127 * escala;
        saida[i] = x;
        soma += x * x;
    }
    const norma = Math.sqrt(soma) || 1;
    for (let i = 0; i < saida.length; i += 1) saida[i] /= norma;
    return saida;
}

function normalizar(v: readonly number[]): Vetor {
    const saida = new Float32Array(v.length);
    let soma = 0;
    for (let i = 0; i < v.length; i += 1) soma += v[i] * v[i];
    const norma = Math.sqrt(soma) || 1;
    for (let i = 0; i < v.length; i += 1) saida[i] = v[i] / norma;
    return saida;
}

function cosseno(a: Vetor, b: Vetor): number {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i += 1) s += a[i] * b[i];
    return s;
}

type FatoVetorizado = { entry: CanonEntry; v: Vetor };

/**
 * Os fatos com vetor pronto, vindos do bundle. Um fato cujo texto mudou desde a
 * última geração é DESCARTADO aqui — melhor procurar entre nove fatos certos do
 * que entre dez com um mentindo. Ele volta assim que a ferramenta rodar.
 */
function fatosPrecalculados(): FatoVetorizado[] {
    const porId = new Map(FLOOR10_MEMORIA_VETORES.map((f) => [f.id, f]));
    const saida: FatoVetorizado[] = [];
    for (const entry of FLOOR10_CANON) {
        const guardado = porId.get(entry.id);
        if (!guardado || guardado.hash !== hashDoFato(entry)) continue;
        saida.push({ entry, v: decodificar(guardado.v, guardado.escala) });
    }
    return saida;
}

let fatos: FatoVetorizado[] | null = null;

export function fatosDaMemoria(): FatoVetorizado[] {
    fatos ??= fatosPrecalculados();
    return fatos;
}

/** Quantos fatos do cânone ficaram sem vetor válido (0 = tudo em dia). */
export function fatosSemVetor(): string[] {
    const comVetor = new Set(fatosDaMemoria().map((f) => f.entry.id));
    return FLOOR10_CANON.filter((e) => !comVetor.has(e.id)).map((e) => e.id);
}

type MemoriaInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createEmbedding(options: { input: string }): Promise<{
        data?: Array<{ embedding?: number[] }>;
    }>;
    cacheManager?: { delete?: (nameOrUrl: string) => Promise<void> };
    exit?: () => Promise<void> | void;
};
type MemoriaCtor =
    new (paths: Record<string, string>, cfg?: Record<string, unknown>) => MemoriaInstance;

const medidor = new DownloadMeter();
let enginePromise: Promise<MemoriaInstance | null> | null = null;
let residentEngine: MemoriaInstance | null = null;
let loadAbort: AbortController | null = null;

function terminate(engine: MemoriaInstance | null): void {
    if (!engine?.exit) return;
    try {
        void Promise.resolve(engine.exit()).catch(() => undefined);
    } catch { /* worker já encerrou */ }
}

async function ensureMemoriaEngine(
    recoverBrokenCache = true,
): Promise<MemoriaInstance | null> {
    if (residentEngine) return residentEngine;
    if (enginePromise) return enginePromise;

    enginePromise = (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        const timer = globalThis.setTimeout(
            () => controller.abort(),
            FLOOR10_MEMORIA_LOAD_TIMEOUT_MS,
        );
        medidor.reset();
        npcSet({
            memoriaPhase: 'loading',
            memoriaLoadText: `verificando o cache da ${FLOOR10_MEMORIA_MODEL.label}…`,
            memoriaLoadProgress: 0,
            memoriaDownload: DOWNLOAD_ZERO,
        });
        let engine: MemoriaInstance | null = null;
        try {
            const backend = await probeModelStorageBackend();
            if (!backend.ok) throw new Error(backend.message);
            const plano = planModelCache(
                await readStorageEstimate(),
                FLOOR10_MEMORIA_MODEL.bytes,
            );
            if (!plano.ok) {
                npcSet({
                    memoriaPhase: 'unavailable',
                    memoriaLoadText:
                        `${FLOOR10_MEMORIA_MODEL.label} não cabe: ${plano.message}`,
                });
                enginePromise = null;
                return null;
            }

            const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as
                Promise<{ Wllama: MemoriaCtor }>);
            if (controller.signal.aborted) throw new Error('interrompido');
            engine = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
            await engine.loadModelFromUrl(FLOOR10_MEMORIA_MODEL.url, {
                ...FLOOR10_MEMORIA_LOAD_CONFIG,
                n_threads: memoriaThreads(),
                useCache: FLOOR10_MEMORIA_USE_CACHE,
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    const amostra = medidor.push(
                        progress.loaded ?? 0,
                        progress.total ?? 0,
                    );
                    floor10Fila.progresso(FILA_MEMORIA, amostra);
                    npcSet({
                        memoriaDownload: amostra,
                        memoriaLoadProgress: progress.total
                            ? Math.max(0, Math.min(
                                1, (progress.loaded ?? 0) / progress.total,
                            ))
                            : 0,
                        memoriaLoadText:
                            `baixando ${FLOOR10_MEMORIA_MODEL.label} · `
                            + downloadLine(amostra),
                    });
                },
            });
            // ── AQUECIMENTO ───────────────────────────────────────────────
            // A primeira busca depois da carga custou 1504ms; as seguintes,
            // ~300ms. Não é o modelo ser lento, é a primeira passada pagar
            // cache frio. Esse custo tem de cair AQUI, ao lado da barra de
            // download — e não sobre a primeira pergunta do jogador, que é
            // exatamente aquela em que ele repara.
            npcSet({
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} · aquecendo…`,
            });
            try {
                await engine.createEmbedding({ input: textoDaPergunta('oi') });
            } catch { /* falhar aqui só devolve a lentidão da 1ª busca */ }
            residentEngine = engine;
            npcSet({
                memoriaPhase: 'ready',
                memoriaLoadProgress: 1,
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} pronta`,
            });
            return engine;
        } catch (falha) {
            terminate(engine);
            if (
                !controller.signal.aborted
                && recoverBrokenCache
                && isBrokenModelCacheError(falha)
                && await deleteCachedModel(engine?.cacheManager, FLOOR10_MEMORIA_MODEL.url)
            ) {
                npcSet({
                    memoriaPhase: 'loading',
                    memoriaLoadProgress: 0,
                    memoriaDownload: DOWNLOAD_ZERO,
                    memoriaLoadText:
                        `o cache da ${FLOOR10_MEMORIA_MODEL.label} `
                        + 'ficou incompleto; baixando de novo…',
                });
                enginePromise = null;
                return ensureMemoriaEngine(false);
            }
            const motivo = falha instanceof Error
                ? `${falha.name}: ${falha.message}`
                : String(falha);
            npcSet({
                memoriaPhase: 'unavailable',
                memoriaLoadText:
                    `não foi possível carregar ${FLOOR10_MEMORIA_MODEL.label} — `
                    + motivo.slice(0, 200),
            });
            enginePromise = null;
            return null;
        } finally {
            globalThis.clearTimeout(timer);
            if (loadAbort === controller) loadAbort = null;
        }
    })();
    return enginePromise;
}

/** SÓ BAIXA — a fila de pré-carga chama isto, como nos outros três cérebros. */
export async function precarregarMemoria(): Promise<boolean> {
    const engine = await floor10ModelCoordinator.activate(
        'memory',
        () => ensureMemoriaEngine(),
    );
    return engine !== null;
}

export function memoriaJaCarregada(): boolean {
    return residentEngine !== null;
}

export type FatoLembrado = {
    id: string;
    fact: string;
    /** Semelhança com a pergunta, 0..1. Vai para a tela do ?mente. */
    score: number;
};

/**
 * O FATO QUE ESTA FALA PEDE — ou null, e aí quem procura é a busca por palavra.
 *
 * Nunca lança e nunca baixa: se o modelo ainda não está carregado, devolve null
 * na hora. A conversa não pode ficar esperando um download de 333 MB para
 * responder "oi".
 */
export async function lembrarPorSignificado(
    query: string,
): Promise<FatoLembrado | null> {
    const texto = query.trim();
    if (!texto || !residentEngine) return null;
    const lista = fatosDaMemoria();
    if (lista.length === 0) return null;

    let vetor: Vetor;
    try {
        const resposta = await Promise.race([
            residentEngine.createEmbedding({ input: textoDaPergunta(texto) }),
            new Promise<null>((resolve) => {
                globalThis.setTimeout(() => resolve(null), FLOOR10_MEMORIA_TIMEOUT_MS);
            }),
        ]);
        const bruto = resposta?.data?.[0]?.embedding;
        if (!bruto || bruto.length !== FLOOR10_MEMORIA_DIM) return null;
        vetor = normalizar(bruto);
    } catch {
        return null;
    }

    let melhor: FatoLembrado | null = null;
    for (const { entry, v } of lista) {
        const score = cosseno(vetor, v);
        if (!melhor || score > melhor.score) {
            melhor = { id: entry.id, fact: entry.fact, score };
        }
    }
    if (!melhor || melhor.score < FLOOR10_MEMORIA_PISO) return null;
    npcSet({ memoriaLembrou: melhor.id, memoriaScore: melhor.score });
    return melhor;
}

export async function unloadFloor10Memoria(): Promise<void> {
    loadAbort?.abort();
    loadAbort = null;
    const pending = enginePromise;
    enginePromise = null;
    const engine = residentEngine ?? (pending ? await pending.catch(() => null) : null);
    residentEngine = null;
    terminate(engine);
    npcSet({ memoriaPhase: 'off', memoriaLoadText: '' });
}

floor10ModelCoordinator.register('memory', unloadFloor10Memoria);

export function resetFloor10MemoriaForTests(): void {
    loadAbort?.abort();
    loadAbort = null;
    enginePromise = null;
    residentEngine = null;
    fatos = null;
    npcSet({
        memoriaPhase: 'off',
        memoriaLoadText: '',
        memoriaLoadProgress: 0,
        memoriaDownload: DOWNLOAD_ZERO,
        memoriaLembrou: '',
        memoriaScore: 0,
    });
}

/** Só para as sondas: injeta um motor já carregado sem baixar 333 MB. */
export function __setMemoriaEngineForProbes(engine: MemoriaInstance | null): void {
    residentEngine = engine;
}
