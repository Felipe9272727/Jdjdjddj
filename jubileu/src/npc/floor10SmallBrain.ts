// ── O CÉREBRO PEQUENO — deliberação em segundo plano ──────────────────────
// Instância própria do wllama com um modelo de ~1B (ver SMALL_BRAIN_CATALOG).
// Não conversa com o jogador: recebe o estado do mundo em inglês estruturado,
// PENSA em primeira pessoa e assina uma intenção do Nilo. O reflexo (Utility
// AI) continua dirigindo o corpo o tempo todo enquanto isto pensa.
//
// Tudo aqui é OPCIONAL por construção: se o aparelho não tiver memória para o
// segundo modelo, a carga falha em silêncio e o Nilo segue com o reflexo. O
// jogo nunca depende desta camada para funcionar.
import {
    DELIBERATION_EXTRACT_TOKENS,
    DELIBERATION_GRAMMAR,
    DELIBERATION_SYSTEM_PROMPT,
    DELIBERATION_TIMEOUT_MS,
    buildChoiceExtractionPrompt,
    buildDeliberationPrompt,
    looksLikeLoop,
    parseDeliberation,
    type DeliberationMemory,
    type Floor10Deliberation,
} from './floor10Deliberation';
import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives } from './floor10Will';
import type { F10PrisonState } from './f10Prison';
import {
    abortFloor10MotorBrain,
    resetFloor10MotorBrainForTests,
    translateFloor10MotorThought,
} from './floor10MotorBrain';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import {
    SMALL_BRAIN_CATALOG, SMALL_BRAIN_DEFAULT, SPEECH_BRAIN_BYTES, type SmallBrainId,
} from './floor10Brains';
import { DownloadMeter, DOWNLOAD_ZERO, downloadLine } from './floor10Download';
import { floor10Fila, FILA_VONTADE } from './floor10Fila';
import {
    CACHE_HEADROOM,
    deleteCachedModel,
    isBrokenModelCacheError,
    formatGB,
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { npc, npcSet } from './npcStore';
import {
    chunkDelta, chunkOpensReply, cpuThreadCount, speechModelReady,
    type ChatChunk,
} from './wllamaEngine';

export { SMALL_BRAIN_CATALOG, type SmallBrainId } from './floor10Brains';

const WLLAMA_V = '3.5.1';
// Mesmos overrides do cérebro de fala. Sem eles o cérebro PEQUENO era
// impossível de testar fora da internet aberta: runtime e modelo estavam
// fixos, e a deliberação simplesmente nunca rodava numa caixa fechada — o que
// escondia justamente os defeitos de loop e de travamento que ele pode ter.
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

const SMALL_BRAIN_STORAGE_KEY = 'floor10-small-brain';

function readSavedBrain(): SmallBrainId | null {
    try {
        const saved = globalThis.localStorage?.getItem(SMALL_BRAIN_STORAGE_KEY);
        return SMALL_BRAIN_CATALOG.some((m) => m.id === saved)
            ? (saved as SmallBrainId)
            : null;
    } catch {
        return null;
    }
}

let escolhido: SmallBrainId = readSavedBrain() ?? SMALL_BRAIN_DEFAULT;

function brainAtual() {
    return SMALL_BRAIN_CATALOG.find((m) => m.id === escolhido) ?? SMALL_BRAIN_CATALOG[0];
}

/**
 * Continua sendo lido como um objeto simples em todo o resto do arquivo, mas
 * agora responde ao modelo escolhido. O override global existe para as sondas
 * servirem o .gguf de uma caixa fechada.
 */
export const SMALL_BRAIN_MODEL = Object.freeze({
    get id(): SmallBrainId { return brainAtual().id; },
    get label(): string { return brainAtual().label; },
    get url(): string {
        return (globalThis as { __smallBrainModelUrl?: string }).__smallBrainModelUrl
            ?? brainAtual().url;
    },
    get bytes(): number { return brainAtual().bytes; },
});

/**
 * Troca o cérebro pequeno. Descarrega o atual antes: dois modelos de 800 MB
 * vivos ao mesmo tempo é exatamente como o aparelho do Felipe trava.
 */
export async function setSmallBrain(id: SmallBrainId): Promise<void> {
    if (id === escolhido) return;
    if (!SMALL_BRAIN_CATALOG.some((m) => m.id === id)) return;
    await unloadSmallBrain();
    escolhido = id;
    try {
        globalThis.localStorage?.setItem(SMALL_BRAIN_STORAGE_KEY, id);
    } catch { /* sem localStorage a escolha só vale para esta sessão */ }
}

/**
 * Até QUATRO núcleos para o MiniBrain.
 *
 * O limite antigo de 2 tentava evitar disputa com a fala, mas hoje o
 * floor10ModelCoordinator interrompe a inferência pequena antes de o SmolLM3
 * gerar. Portanto não existe mais motivo para deixar metade dos celulares
 * modernos ociosa durante uma rodada que roda sozinha. Quatro é o teto, não
 * uma exigência: aparelhos menores continuam usando hardwareConcurrency.
 */
export const SMALL_BRAIN_THREADS = 4;

export function smallBrainThreads(): number {
    return Math.min(SMALL_BRAIN_THREADS, Math.max(1, cpuThreadCount()));
}

/**
 * Teto de tokens do pensamento. É ELE que torna o loop eterno impossível — não
 * a mordaça que havia antes. Mesmo que o modelo comece a girar, ele para aqui,
 * e o texto circular é descartado por looksLikeLoop.
 */
export const SMALL_BRAIN_THINK_TOKENS = 320;

// n_threads é resolvido na CARGA, não aqui: depende do aparelho.
export const SMALL_BRAIN_LOAD_CONFIG = Object.freeze({
    // Precisa caber o estado do mundo (~300) MAIS o raciocínio (~320). Com 1024
    // o pensamento batia no teto do contexto e saía truncado.
    n_ctx: 2048,
    n_batch: 256,
    n_gpu_layers: 0,
    jinja: true,
    // Esta flag NÃO liga nem desliga o pensamento — e, medido no navegador, ela
    // também não decide por qual canal ele chega: com `reasoning: false` o
    // llama.cpp continuou entregando o raciocínio em `reasoning_content`, com
    // `content` nulo. Eu já culpei esta linha pelas rodadas de zero token; a
    // culpa era do LEITOR, corrigido em chunkPensamento/readCompletionText.
    // Fica falsa por ser o comportamento medido e estável.
    //
    // Quem liga o pensamento é enable_thinking, logo abaixo.
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: true }),
    warmup: true,
});

export const SMALL_BRAIN_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    // Espaço para pensar de verdade, com fim garantido.
    max_tokens: SMALL_BRAIN_THINK_TOKENS,
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    // Janela LONGA de propósito: com 64 o modelo podia repetir um parágrafo
    // inteiro sem penalidade, que é exatamente a cara de um loop de pensamento.
    penalty_repeat: 1.15,
    penalty_last_n: 256,
    cache_prompt: true,
    // SEM gramática: ela forçava uma linha só e tornava o raciocínio impossível.
    chat_template_kwargs: Object.freeze({ enable_thinking: true }),
});

/**
 * A PASSADA DE RESGATE. Só roda quando o pensamento livre terminou sem uma
 * escolha legível; nunca no lugar dele.
 *
 * Aqui a gramática é bem-vinda: não há nada para pensar, o pensamento já
 * aconteceu e está na tela. Esta chamada existe para não jogar fora um
 * raciocínio bom por causa de formatação — o modelo relê o que escreveu e
 * assina. Custa ~16 tokens contra os 320 da primeira passada.
 *
 * enable_thinking desligado SÓ AQUI, e sem contradição com "o Nilo pensa": a
 * gramática já obriga o primeiro token a ser "CHOICE:", então pensar nesta
 * chamada seria impossível de qualquer jeito — desligar apenas evita que o
 * template injete um bloco de raciocínio que morreria vazio.
 */
export const SMALL_BRAIN_EXTRACT_CONFIG = Object.freeze({
    stream: false,
    max_tokens: DELIBERATION_EXTRACT_TOKENS,
    // Determinístico: não é criação, é leitura do que ele já decidiu.
    temperature: 0,
    grammar: DELIBERATION_GRAMMAR,
    cache_prompt: true,
    chat_template_kwargs: Object.freeze({ enable_thinking: false }),
});

/** Teto próprio do resgate: 16 tokens presos por gramática não demoram. */
export const DELIBERATION_EXTRACT_TIMEOUT_MS = 90_000;

type SmallInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<unknown>;
    cacheManager?: {
        delete?: (nameOrUrl: string) => Promise<void>;
    };
    exit?: () => Promise<void> | void;
};
type SmallCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => SmallInstance;

const medidorVontade = new DownloadMeter();

let enginePromise: Promise<SmallInstance | null> | null = null;
let disposePromise: Promise<void> | null = null;
let inFlight = false;
let currentAbort: AbortController | null = null;
let loadAbort: AbortController | null = null;
let loadingEngine: SmallInstance | null = null;

export const SMALL_BRAIN_HANDOFF_TIMEOUT_MS = 3_000;

function abortError(): Error {
    const error = new Error('MiniBrain load aborted for conversation');
    error.name = 'AbortError';
    return error;
}

/** Faz qualquer etapa de carga devolver o controle assim que a conversa chega. */
export function raceWithAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener('abort', onAbort, { once: true });
        task.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

function terminateSmallEngine(engine: SmallInstance | null): void {
    if (!engine?.exit) return;
    try {
        void Promise.resolve(engine.exit()).catch(() => undefined);
    } catch { /* worker já encerrou */ }
}

/**
 * Interrompe a deliberação em curso. O 3B da conversa tem PRIORIDADE ABSOLUTA:
 * sem isto, uma deliberação continuava queimando CPU depois de o jogador mandar
 * mensagem, e os dois modelos disputavam os mesmos núcleos — foi o que travou a
 * resposta por mais de 370s no aparelho do Felipe. O runtime não é descarregado.
 */
export function abortDeliberation(): void {
    const interruptedDownload = npc.deliberationPhase === 'loading';
    const pausedInference = npc.deliberationPhase === 'thinking';
    currentAbort?.abort();
    currentAbort = null;
    abortFloor10MotorBrain();
    loadAbort?.abort();
    const loading = loadingEngine;
    loadingEngine = null;
    terminateSmallEngine(loading);
    if (npc.deliberationPhase === 'thinking' || npc.deliberationPhase === 'loading') {
        npcSet({
            deliberationPhase: 'off',
            deliberationLoadText: interruptedDownload
                ? 'download interrompido para dar prioridade à conversa'
                : pausedInference
                    ? 'modelo em cache · CPU liberada para a conversa'
                    : npc.deliberationLoadText,
        });
    }
}

/**
 * Descarga de emergência/encerramento. No fluxo normal o Mini fica residente:
 * abortDeliberation pausa apenas a geração para o Smol falar e preserva pesos,
 * Worker e cache KV. Esta função continua disponível para aparelhos que
 * realmente não comportem os dois runtimes.
 */
async function disposeSmallBrainEngine(): Promise<void> {
    abortDeliberation();
    if (disposePromise) {
        await disposePromise;
        return;
    }

    const pending = enginePromise;
    enginePromise = null;
    npcSet({
        deliberationPhase: 'off',
        deliberationLoadText: npc.deliberationLoadProgress >= 1
            ? 'modelo em cache · descarregado por limite de memória'
            : npc.deliberationLoadText,
    });

    const task = (async () => {
        const cleanup = Promise.resolve(pending)
            .then((engine) => engine?.exit?.())
            .catch(() => undefined);
        // O wllama encerra o Worker imediatamente. Este limite protege a
        // conversa até de um Promise antigo que tenha ficado órfão no browser.
        await Promise.race([
            cleanup,
            new Promise<void>((resolve) => {
                globalThis.setTimeout(resolve, SMALL_BRAIN_HANDOFF_TIMEOUT_MS);
            }),
        ]);
    })();
    disposePromise = task;
    try {
        await task;
    } finally {
        if (disposePromise === task) disposePromise = null;
    }
}

floor10ModelCoordinator.register(
    'deliberation',
    disposeSmallBrainEngine,
    abortDeliberation,
);

/** Pede ao coordenador para retirar o cérebro pequeno da memória. */
export function unloadSmallBrain(): Promise<void> {
    abortDeliberation();
    npcSet({ deliberationPhase: 'off' });
    return floor10ModelCoordinator.release('deliberation');
}

/**
 * O PENSAMENTO NÃO VEM PELO CANAL DO TEXTO.
 *
 * Visto cru no navegador, pedaço por pedaço: o llama.cpp separa o raciocínio do
 * MiniCPM e o entrega em `delta.reasoning_content`, enquanto `delta.content`
 * chega NULO. Como o leitor só olhava `content`, cada rodada terminava com ZERO
 * token e texto vazio — 128s de CPU queimada para devolver nada. Era isto que
 * aparecia no aparelho do Felipe: 172s, 66s, 245s, todas sem uma palavra.
 *
 * Eu tinha atribuído isso à flag `reasoning` da carga e a desliguei; a sonda
 * mostrou que o canal separado continua vindo do mesmo jeito. Então a correção
 * não é brigar com a flag, é LER OS DOIS CANAIS — que é o que o Felipe pediu de
 * qualquer forma: ver o raciocínio interno dele, não só a conclusão.
 */
export function chunkPensamento(chunk: unknown): string {
    const delta = (chunk as {
        choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
    } | null)?.choices?.[0]?.delta;
    if (typeof delta?.reasoning_content === 'string') return delta.reasoning_content;
    return chunkDelta(chunk as ChatChunk);
}

/** Texto da resposta, tolerando os formatos que o wllama já devolveu. */
export function readCompletionText(response: unknown): string {
    if (typeof response === 'string') return response;
    const record = response as {
        choices?: Array<{
            message?: { content?: string | null; reasoning_content?: string | null };
            text?: string;
        }>;
        content?: string;
    } | null;
    const fromChoices = record?.choices?.[0];
    // Mesmo canal separado da versão em stream: sem juntar os dois, a decisão
    // que ele assina DEPOIS de pensar chega sozinha e sem justificativa — ou não
    // chega nada.
    const raciocinio = fromChoices?.message?.reasoning_content;
    const conteudo = fromChoices?.message?.content;
    if (typeof raciocinio === 'string' && raciocinio.trim()) {
        return typeof conteudo === 'string' && conteudo.trim()
            ? `${raciocinio}\n${conteudo}`
            : raciocinio;
    }
    if (typeof conteudo === 'string') return conteudo;
    if (typeof fromChoices?.text === 'string') return fromChoices.text;
    if (typeof record?.content === 'string') return record.content;
    return '';
}

/** Carrega o cérebro pequeno uma única vez; falha vira null, nunca exceção. */
function ensureSmallEngine(
    cederParaFala = true,
    recoverBrokenCache = true,
): Promise<SmallInstance | null> {
    enginePromise ??= (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        let engine: SmallInstance | null = null;
        medidorVontade.reset();
        npcSet({
            deliberationPhase: 'loading',
            deliberationLoadText: `verificando o cache do ${SMALL_BRAIN_MODEL.label}…`,
            deliberationLoadProgress: 0,
            deliberationDownload: DOWNLOAD_ZERO,
        });
        // A FALA PRIMEIRO — mas a pergunta certa é "CABEM OS DOIS?", não
        // "a fala já baixou?".
        //
        // Terceira versão desta trava, e as duas primeiras foram erro meu.
        // Ela nasceu porque os dois cérebros dividem o cofre do site e um
        // cérebro pequeno baixado antes derrubava a cota abaixo do que o
        // SmolLM3 precisa. Só que eu a escrevi como "espere a fala estar em
        // CACHE", e essa pergunta é respondida pelo cacheManager do wllama, que
        // não enxerga o armazenamento todo — ele responde "não" para modelos que
        // ESTÃO lá. Resultado no aparelho do Felipe: em jogo o cérebro pequeno
        // nunca baixava. (A primeira versão era pior ainda: valia também no
        // ?mente, onde não existe fala nenhuma.)
        //
        // Agora a conta é direta e verdadeira: se a cota do site couber os dois
        // modelos, baixa. Ele mediu 12 GB livres no aparelho — para quem tem
        // espaço, esta trava simplesmente não existe mais.
        if (cederParaFala) {
            const espaco = await readStorageEstimate();
            const precisa = Math.ceil(
                (SMALL_BRAIN_MODEL.bytes + SPEECH_BRAIN_BYTES) * CACHE_HEADROOM,
            );
            const livre = espaco.quota === null
                ? null
                : Math.max(0, espaco.quota - espaco.usage);
            // quota nula = navegador que não informa. Na dúvida, DEIXA TENTAR:
            // um palpite meu que bloqueia o cérebro é pior que um download que
            // falha com mensagem.
            if (livre !== null && livre < precisa) {
                npcSet({
                    deliberationPhase: 'off',
                    deliberationLoadText:
                        `a fala vem primeiro: ${formatGB(livre)} livres não cabem os dois cérebros `
                        + `(${formatGB(precisa)}). Libere espaço ou escolha o ${SMALL_BRAIN_CATALOG
                            .find((m) => m.id === 'llama32-1b-q4')?.label ?? 'modelo menor'} no ?mente.`,
                });
                enginePromise = null;
                loadAbort = null;
                return null;
            }
        }
        try {
            const backend = await probeModelStorageBackend();
            if (!backend.ok) throw new Error(backend.message);

            try {
                if (typeof navigator !== 'undefined') {
                    void (navigator as unknown as {
                        storage?: { persist?: () => Promise<boolean> };
                    }).storage?.persist?.().catch(() => undefined);
                }
            } catch { /* cache persistente é só uma otimização */ }
            const mod = await raceWithAbort(
                import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: SmallCtor }>,
                controller.signal,
            );
            // CABE? A mesma defesa que a fala já tinha, que faltava aqui.
            // Sem ela, quando o cache estoura, o Worker levanta
            // QuotaExceededError — um DOMException, que não atravessa o
            // postMessage — e a promessa da carga não resolve NEM rejeita. Na
            // tela: "carregando" para sempre, sem uma palavra de explicação.
            // Publica o número também, para a barra poder mostrá-lo.
            const estimativa = await readStorageEstimate();
            const plano = planModelCache(estimativa, SMALL_BRAIN_MODEL.bytes);
            npcSet({
                storage: {
                    quota: estimativa.quota,
                    usage: estimativa.usage,
                    needBytes: Math.ceil(SMALL_BRAIN_MODEL.bytes * CACHE_HEADROOM),
                },
            });
            if (!plano.ok) {
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText:
                        `${SMALL_BRAIN_MODEL.label} não cabe: ${plano.message}`,
                });
                enginePromise = null;
                loadAbort = null;
                return null;
            }
            engine = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
            loadingEngine = engine;
            const loadTask = engine.loadModelFromUrl(SMALL_BRAIN_MODEL.url, {
                ...SMALL_BRAIN_LOAD_CONFIG,
                n_threads: smallBrainThreads(),
                // O wllama usa `signal` no download; raceWithAbort também cobre
                // a abertura do cache e a inicialização do Worker/WASM.
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    const fraction = progress.total
                        ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                        : 0;
                    const amostra = medidorVontade.push(
                        progress.loaded ?? 0,
                        progress.total ?? 0,
                    );
                    floor10Fila.progresso(FILA_VONTADE, amostra);
                    npcSet({
                        deliberationDownload: amostra,
                        deliberationLoadProgress: fraction,
                        deliberationLoadText:
                            `baixando ${SMALL_BRAIN_MODEL.label} · ${downloadLine(amostra)}`,
                    });
                },
            });
            // Se o cancelamento venceu a corrida enquanto o wllama terminava
            // uma etapa interna, encerra qualquer Worker que apareça depois.
            void loadTask.then(
                () => {
                    if (controller.signal.aborted) terminateSmallEngine(engine);
                },
                () => undefined,
            );
            await raceWithAbort(loadTask, controller.signal);
            if (controller.signal.aborted) {
                terminateSmallEngine(engine);
                return null;
            }
            npcSet({
                deliberationLoadProgress: 1,
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · iniciando vontade`,
            });
            return engine;
        } catch (falha) {
            terminateSmallEngine(engine);
            if (
                !controller.signal.aborted
                && recoverBrokenCache
                && isBrokenModelCacheError(falha)
                && await deleteCachedModel(engine?.cacheManager, SMALL_BRAIN_MODEL.url)
            ) {
                npcSet({
                    deliberationPhase: 'loading',
                    deliberationLoadProgress: 0,
                    deliberationLoadText:
                        `o cache do ${SMALL_BRAIN_MODEL.label} ficou `
                        + 'incompleto; baixando de novo…',
                });
                enginePromise = null;
                return ensureSmallEngine(cederParaFala, false);
            }
            // Sem memória, sem rede ou modelo incompatível: o reflexo segue só.
            //
            // O MOTIVO precisa aparecer. Sem ele, uma falha instantânea no
            // GitHub Pages virou "não foi possível carregar" e nada mais — e a
            // primeira suspeita (URL errada do modelo) estava errada, o arquivo
            // existe. Engolir a causa custou uma volta inteira de investigação.
            if (!controller.signal.aborted) {
                const motivo = falha instanceof Error
                    ? `${falha.name}: ${falha.message}`
                    : String(falha);
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText:
                        `não foi possível carregar ${SMALL_BRAIN_MODEL.label} — ${motivo.slice(0, 200)}`,
                });
            }
            return null;
        } finally {
            if (loadAbort === controller) loadAbort = null;
            if (loadingEngine === engine) loadingEngine = null;
        }
    })();
    return enginePromise;
}

export type DeliberateInput = {
    perception: Floor10Perception;
    drives: Floor10WillDrives;
    memory: DeliberationMemory;
    /** Sensores da sala, sem a regra/solução do puzzle. */
    prison?: F10PrisonState | null;
    now: number;
};

function conversationHasPriority(): boolean {
    // O Mini pode formar intenções com o painel aberto, enquanto o jogador
    // pensa no que escrever. Ele só para durante carga/geração real do Smol.
    return npc.phase === 'thinking' || npc.phase === 'loading';
}

/**
 * Segunda passada: devolve a linha "CHOICE: x" tirada do raciocínio que o modelo
 * acabou de escrever. Devolve '' se falhar — o resgate nunca pode derrubar a
 * rodada, ele só tenta salvá-la.
 */
/**
 * Por que o último resgate falhou. Engolir esta exceção já me custou caro duas
 * vezes neste andar (a carga infinita por quota e as rodadas de zero token):
 * o resgate NÃO pode derrubar a deliberação, mas o motivo tem que aparecer em
 * algum lugar — a sala da mente lê daqui.
 */
let ultimoErroResgate: string | null = null;

export function erroDoResgate(): string | null {
    return ultimoErroResgate;
}

export async function assinarEscolha(
    engine: SmallInstance,
    pensamento: string,
    signal?: AbortSignal,
): Promise<string> {
    const controller = new AbortController();
    const herdar = () => controller.abort();
    if (signal?.aborted) return '';
    signal?.addEventListener('abort', herdar, { once: true });
    const relogio = globalThis.setTimeout(
        () => controller.abort(),
        DELIBERATION_EXTRACT_TIMEOUT_MS,
    );
    try {
        const response = await engine.createChatCompletion({
            // SEM o prompt de sistema, de propósito. Medido no navegador: com
            // ele, esta chamada de 16 tokens estourava o teto de 45s — o custo
            // não era gerar, era RELER os ~330 tokens da persona. E ela não faz
            // falta aqui: o Nilo já pensou, isto é só a assinatura.
            messages: [
                { role: 'user', content: buildChoiceExtractionPrompt(pensamento) },
            ],
            ...SMALL_BRAIN_EXTRACT_CONFIG,
            abortSignal: controller.signal,
        });
        const texto = readCompletionText(response);
        ultimoErroResgate = texto.trim()
            ? null
            : `resposta vazia — ${JSON.stringify(response).slice(0, 160)}`;
        return texto;
    } catch (e) {
        ultimoErroResgate = controller.signal.aborted
            ? `cortado pelo teto de ${DELIBERATION_EXTRACT_TIMEOUT_MS / 1000}s`
            : String(e).slice(0, 200);
        return '';
    } finally {
        globalThis.clearTimeout(relogio);
        signal?.removeEventListener('abort', herdar);
    }
}

/**
 * Uma rodada de deliberação. Devolve null se o cérebro pequeno não estiver
 * disponível, se já houver uma rodada em curso ou se ele não assinar escolha.
 */
/**
 * A ÚLTIMA RODADA FOI DESISTÊNCIA, NÃO FRACASSO?
 *
 * `deliberateFloor10` devolve `null` em duas situações muito diferentes: ele
 * TENTOU E FALHOU, ou ele CEDEU A VEZ porque o jogador está conversando e a
 * fala tem prioridade. O jogo contava as duas como falha e crescia a espera
 * exponencialmente.
 *
 * O efeito no aparelho: enquanto o modelo de fala baixa — minutos, no celular
 * — a deliberação cede a vez a cada 5 segundos. Em poucas rodadas a espera
 * bate o teto de 300s. Quando a fala finalmente termina e a CPU fica livre, o
 * cérebro de vontade está de castigo por 5 minutos por um crime que não
 * cometeu: ele nunca chegou a tentar. É por isso que "depois ele não baixa".
 */
let cedeuAVez = false;
export function deliberationYieldedTurn(): boolean { return cedeuAVez; }

export async function deliberateFloor10(
    input: DeliberateInput,
): Promise<Floor10Deliberation | null> {
    if (inFlight || conversationHasPriority()) { cedeuAVez = true; return null; }
    cedeuAVez = false;
    inFlight = true;
    try {
        const engine = await floor10ModelCoordinator.activate(
            'deliberation',
            // Automática: cede a vez para a fala, que é quem o jogador espera.
            () => ensureSmallEngine(true),
        );
        if (!engine) {
            const unavailable = npc.deliberationPhase === 'unavailable';
            const unavailableText = npc.deliberationLoadText;
            // markUnloaded, NÃO release.
            //
            // `release` chama o descarregador registrado — e aqui não há nada
            // carregado para descarregar: a carga acabou de falhar ou de ser
            // recusada. Pior: quando havia, isso virava carregar e DESCARREGAR
            // a cada rodada que falhasse, que é justamente o vaivém que o
            // Felipe pediu para acabar. Este caminho só acerta a contabilidade
            // do coordenador para a próxima tentativa poder acontecer.
            floor10ModelCoordinator.markUnloaded('deliberation');
            if (unavailable) {
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText: unavailableText,
                });
            }
            return null;
        }
        // Se o jogador começou a falar enquanto o modelo carregava, desiste
        // agora: a conversa vem primeiro.
        if (conversationHasPriority()) { cedeuAVez = true; return null; }
        npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 1,
            deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · escolhendo uma intenção`,
        });
        currentAbort = new AbortController();
        const abort = currentAbort;
        // TETO DE TEMPO. Sem ele, um worker preso deixava esta promessa pendente
        // para sempre; como `inFlight` só é liberado no finally, o livre-arbítrio
        // morria calado pelo resto da sessão. Agora a rodada é abandonada e a
        // próxima tenta de novo.
        const relogio = globalThis.setTimeout(() => abort.abort(), DELIBERATION_TIMEOUT_MS);
        let response: unknown;
        try {
            response = await engine.createChatCompletion({
                messages: [
                    { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: buildDeliberationPrompt(input.perception, input.drives, input.memory),
                    },
                ],
                ...SMALL_BRAIN_COMPLETION_CONFIG,
                abortSignal: abort.signal,
            });
        } finally {
            globalThis.clearTimeout(relogio);
        }
        const texto = readCompletionText(response);
        // Cadeia de pensamento girando no lugar: a gramática limita QUAIS
        // palavras saem, não quantas vezes. Descartar aqui evita alimentar o
        // corpo com uma "decisão" tirada de um texto em círculo.
        if (looksLikeLoop(texto)) {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} se enrolou; vai tentar de novo`,
            });
            return null;
        }
        let decided = parseDeliberation(texto, input.now);
        // RESGATE. O raciocínio saiu, mas sem a linha final legível. Em vez de
        // descartar o que ele pensou, pedimos só a assinatura — presa por
        // gramática, ~16 tokens. O pensamento continua sendo o da primeira
        // passada; o que entra aqui é a última linha, e ela é anexada ao texto
        // para que a justificativa lida depois continue vindo do raciocínio.
        if (!decided && texto.trim() && !conversationHasPriority()) {
            const assinatura = await assinarEscolha(engine, texto, abort.signal);
            if (assinatura) decided = parseDeliberation(`${texto}\n${assinatura}`, input.now);
        }
        if (decided && texto.trim() && !conversationHasPriority()) {
            const motion = await translateFloor10MotorThought(
                texto,
                input.perception,
                input.prison,
                abort.signal,
            );
            if (motion) decided = { ...decided, motion };
        }
        if (decided) {
            npcSet({
                deliberationPhase: 'decided',
                deliberationLoadText: decided.motion
                    ? `${SMALL_BRAIN_MODEL.label} pronto · ${decided.motion.verb} ${decided.motion.target}`
                    : `${SMALL_BRAIN_MODEL.label} pronto no cache`,
                deliberationGoal: decided.goal,
                deliberationCount: npc.deliberationCount + 1,
            });
        } else {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · tentando outra ideia`,
            });
        }
        return decided;
    } catch {
        if (npc.deliberationPhase !== 'unavailable') {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · deliberação pausada`,
            });
        }
        return null;
    } finally {
        inFlight = false;
        currentAbort = null;
    }
}

export type PensamentoAoVivo = {
    raw: string;
    decided: Floor10Deliberation | null;
    loop: boolean;
    ms: number;
    tokens: number;
    erro: string | null;
    /** Assinatura da segunda passada, quando o pensamento livre não decidiu. */
    resgate?: string | null;
};

/**
 * Deliberação OBSERVÁVEL, para a sala da mente.
 *
 * Em jogo a saída é presa por gramática e não transmitida: só interessa a meta.
 * Isso esconde exatamente aquilo que precisamos vigiar — se o modelo pequeno
 * entra em cadeia de pensamento circular. Aqui dá para desligar a gramática e
 * ver o texto CRU nascendo token a token, que é onde um loop aparece.
 *
 * Não substitui deliberateFloor10: é instrumento de observação, não o caminho
 * que o jogo usa.
 */
export async function deliberarObservando(
    input: DeliberateInput,
    opts: {
        useGrammar: boolean;
        maxTokens: number;
        onToken: (parcial: string) => void;
        /**
         * Teto próprio da observação. O do jogo (60s) existe para uma rodada
         * PRESA não matar o livre-arbítrio; aqui ele atrapalhava o oposto —
         * cortava antes do primeiro token e não sobrava raciocínio nenhum para
         * olhar, que é o motivo de a sala existir.
         */
        timeoutMs?: number;
        /** Cada pedaço cru do stream, para diagnosticar texto embaralhado. */
        onChunk?: (chunk: unknown) => void;
    },
): Promise<PensamentoAoVivo> {
    const comecou = Date.now();
    // A sala da mente observa o cérebro pequeno SOZINHO: não há fala nesta
    // página, então esperar por ela seria esperar para sempre.
    const engine = await floor10ModelCoordinator.activate(
        'deliberation',
        () => ensureSmallEngine(false),
    );
    if (!engine) {
        return {
            raw: '', decided: null, loop: false, ms: Date.now() - comecou, tokens: 0,
            erro: npc.deliberationLoadText || `não foi possível carregar ${SMALL_BRAIN_MODEL.label}`,
        };
    }
    npcSet({ deliberationPhase: 'thinking' });
    const abort = new AbortController();
    const teto = opts.timeoutMs ?? DELIBERATION_TIMEOUT_MS;
    const relogio = globalThis.setTimeout(() => abort.abort(), teto);
    let raw = '';
    let tokens = 0;
    try {
        const stream = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: buildDeliberationPrompt(input.perception, input.drives, input.memory),
                },
            ],
            ...SMALL_BRAIN_COMPLETION_CONFIG,
            stream: true,
            max_tokens: opts.maxTokens,
            // Sem gramática o modelo fica livre — é assim que se vê um loop.
            ...(opts.useGrammar ? {} : { grammar: undefined }),
            abortSignal: abort.signal,
        }) as AsyncIterable<unknown>;
        for await (const chunk of stream) {
            opts.onChunk?.(chunk);
            const c = chunk as ChatChunk;
            // Mesmo vazamento do cérebro de fala: os restos da rodada anterior
            // vêm na frente. Sem descartar, "CHOICE: idle" chegava como
            // "OSE: idleCHO" e a decisão era perdida.
            if (chunkOpensReply(c)) { raw = ''; tokens = 0; opts.onToken(raw); }
            const pedaco = chunkPensamento(c);
            if (pedaco) { raw += pedaco; tokens += 1; opts.onToken(raw); }
        }
    } catch (e) {
        return {
            raw, decided: null, loop: looksLikeLoop(raw), ms: Date.now() - comecou, tokens,
            erro: abort.signal.aborted
                ? `cortado pelo teto de ${teto / 1000}s`
                : String(e).slice(0, 160),
        };
    } finally {
        globalThis.clearTimeout(relogio);
        npcSet({ deliberationPhase: 'off' });
    }
    let decided = parseDeliberation(raw, input.now);
    // Mesmo resgate do jogo, visível aqui de propósito: a sala da mente existe
    // para mostrar o que acontece de verdade, inclusive a segunda passada.
    let resgate: string | null = null;
    let erro: string | null = null;
    if (!decided && !opts.useGrammar && raw.trim() && !looksLikeLoop(raw)) {
        resgate = (await assinarEscolha(engine, raw)) || null;
        if (resgate) decided = parseDeliberation(`${raw}\n${resgate}`, input.now);
        else erro = `resgate falhou: ${erroDoResgate() ?? 'sem motivo'}`;
    }
    if (decided && raw.trim() && !looksLikeLoop(raw)) {
        const motion = await translateFloor10MotorThought(
            raw,
            input.perception,
            input.prison,
        );
        if (motion) decided = { ...decided, motion };
    }
    return {
        raw,
        decided,
        loop: looksLikeLoop(raw),
        ms: Date.now() - comecou,
        tokens,
        erro,
        resgate,
    };
}

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    abortDeliberation();
    resetFloor10MotorBrainForTests();
    floor10ModelCoordinator.markUnloaded('deliberation');
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
    loadAbort = null;
    loadingEngine = null;
}
