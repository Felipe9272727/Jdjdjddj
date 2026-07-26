// ── O CÉREBRO PEQUENO — deliberação em segundo plano ──────────────────────
// Instância própria do wllama com o MiniCPM5-1B (688 MB). Não conversa com o
// jogador: recebe o estado do mundo em inglês estruturado e devolve a intenção
// do Nilo. A saída é curta e presa por gramática; o reflexo (Utility AI)
// continua dirigindo o corpo enquanto isto pensa.
//
// Tudo aqui é OPCIONAL por construção: se o aparelho não tiver memória para o
// segundo modelo, a carga falha em silêncio e o Nilo segue com o reflexo. O
// jogo nunca depende desta camada para funcionar.
import {
    DELIBERATION_SYSTEM_PROMPT,
    DELIBERATION_GRAMMAR,
    buildDeliberationPrompt,
    parseDeliberation,
    type DeliberationMemory,
    type Floor10Deliberation,
} from './floor10Deliberation';
import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives } from './floor10Will';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { npc, npcSet } from './npcStore';

const WLLAMA_V = '3.5.1';
const CDN = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

export const SMALL_BRAIN_MODEL = Object.freeze({
    label: 'MiniCPM5-1B',
    url: 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf',
});

/** Dois núcleos bastam para a escolha curta e deixam CPU livre para o jogo. */
export const SMALL_BRAIN_THREADS = 2;

export const SMALL_BRAIN_LOAD_CONFIG = Object.freeze({
    // O prompt estruturado usa poucas centenas de tokens. 4096 só reservava KV
    // desnecessário no celular e tornava cada reativação mais cara.
    n_ctx: 1024,
    n_batch: 256,
    n_threads: SMALL_BRAIN_THREADS,
    n_gpu_layers: 0,
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    warmup: true,
});

export const SMALL_BRAIN_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    // "CHOICE: inspect-elevator" cabe com ampla folga; a gramática impede prosa.
    max_tokens: 24,
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    penalty_repeat: 1.1,
    penalty_last_n: 64,
    cache_prompt: true,
    grammar: DELIBERATION_GRAMMAR,
    chat_template_kwargs: Object.freeze({ enable_thinking: false }),
});

type SmallInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<unknown>;
    exit?: () => Promise<void> | void;
};
type SmallCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => SmallInstance;

let enginePromise: Promise<SmallInstance | null> | null = null;
let disposePromise: Promise<void> | null = null;
let inFlight = false;
let currentAbort: AbortController | null = null;
let loadAbort: AbortController | null = null;
let loadingEngine: SmallInstance | null = null;

export const SMALL_BRAIN_HANDOFF_TIMEOUT_MS = 3_000;

function abortError(): Error {
    const error = new Error('MiniCPM load aborted for conversation');
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

/** Texto da resposta, tolerando os formatos que o wllama já devolveu. */
export function readCompletionText(response: unknown): string {
    if (typeof response === 'string') return response;
    const record = response as {
        choices?: Array<{ message?: { content?: string | null }; text?: string }>;
        content?: string;
    } | null;
    const fromChoices = record?.choices?.[0];
    if (typeof fromChoices?.message?.content === 'string') return fromChoices.message.content;
    if (typeof fromChoices?.text === 'string') return fromChoices.text;
    if (typeof record?.content === 'string') return record.content;
    return '';
}

/** Carrega o cérebro pequeno uma única vez; falha vira null, nunca exceção. */
function ensureSmallEngine(): Promise<SmallInstance | null> {
    enginePromise ??= (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        let engine: SmallInstance | null = null;
        npcSet({
            deliberationPhase: 'loading',
            deliberationLoadText: `verificando o cache do ${SMALL_BRAIN_MODEL.label}…`,
            deliberationLoadProgress: 0,
        });
        try {
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
            engine = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
            loadingEngine = engine;
            const loadTask = engine.loadModelFromUrl(SMALL_BRAIN_MODEL.url, {
                ...SMALL_BRAIN_LOAD_CONFIG,
                // O wllama usa `signal` no download; raceWithAbort também cobre
                // a abertura do cache e a inicialização do Worker/WASM.
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    const fraction = progress.total
                        ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                        : 0;
                    npcSet({
                        deliberationLoadProgress: fraction,
                        deliberationLoadText:
                            `baixando ${SMALL_BRAIN_MODEL.label}… ${Math.round(fraction * 100)}%`,
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
        } catch {
            terminateSmallEngine(engine);
            // Sem memória, sem rede ou modelo incompatível: o reflexo segue só.
            if (!controller.signal.aborted) {
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText: `não foi possível carregar ${SMALL_BRAIN_MODEL.label}`,
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
    now: number;
};

function conversationHasPriority(): boolean {
    // O Mini pode formar intenções com o painel aberto, enquanto o jogador
    // pensa no que escrever. Ele só para durante carga/geração real do Smol.
    return npc.phase === 'thinking' || npc.phase === 'loading';
}

/**
 * Uma rodada de deliberação. Devolve null se o cérebro pequeno não estiver
 * disponível, se já houver uma rodada em curso ou se ele não assinar escolha.
 */
export async function deliberateFloor10(
    input: DeliberateInput,
): Promise<Floor10Deliberation | null> {
    if (inFlight || conversationHasPriority()) return null;
    inFlight = true;
    try {
        const engine = await floor10ModelCoordinator.activate(
            'deliberation',
            ensureSmallEngine,
        );
        if (!engine) {
            const unavailable = npc.deliberationPhase === 'unavailable';
            const unavailableText = npc.deliberationLoadText;
            await floor10ModelCoordinator.release('deliberation');
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
        if (conversationHasPriority()) return null;
        npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 1,
            deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · escolhendo uma intenção`,
        });
        currentAbort = new AbortController();
        const response = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: buildDeliberationPrompt(input.perception, input.drives, input.memory),
                },
            ],
            ...SMALL_BRAIN_COMPLETION_CONFIG,
            abortSignal: currentAbort.signal,
        });
        const decided = parseDeliberation(readCompletionText(response), input.now);
        if (decided) {
            npcSet({
                deliberationPhase: 'decided',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto no cache`,
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

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    abortDeliberation();
    floor10ModelCoordinator.markUnloaded('deliberation');
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
    loadAbort = null;
    loadingEngine = null;
}
