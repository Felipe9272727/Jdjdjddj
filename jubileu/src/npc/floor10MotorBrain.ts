// ── O TRADUTOR MOTOR — terceira LLM, minúscula e especializada ─────────────
// O MiniBrain continua fazendo apenas aquilo em que é bom: pensar livremente.
// Um SmolLM2 de 135M lê o pensamento pronto e o comprime numa instrução motora.
//
// São PESOS e runtime próprios. Ele não reutiliza nem altera o KV cache do
// MiniBrain e nunca gera ao mesmo tempo que ele. Com Q4_K_M, o arquivo tem
// cerca de 105 MB — quase oito vezes menor que o Llama 3.2 1B da vontade.
import type { F10PrisonState } from './f10Prison';
import {
    FLOOR10_MOTOR_GRAMMAR,
    buildMotorGrammar,
    buildMotorTranslationPrompt,
    parseMotorPlan,
    type Floor10MotorPlan,
} from './floor10MotorCortex';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import type { Floor10Perception } from './floor10Perception';
import { npcSet } from './npcStore';
import { cpuThreadCount } from './wllamaEngine';

const WLLAMA_V = '3.5.1';
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM = `${CDN}/wasm/wllama.wasm`;

export const FLOOR10_MOTOR_MODEL = Object.freeze({
    id: 'smollm2-135m-instruct',
    label: 'Motor SmolLM2 135M',
    url: (globalThis as { __motorBrainModelUrl?: string }).__motorBrainModelUrl
        ?? 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/'
        // Revisão fixa: uma mudança futura em `main` não repete o erro de
        // "Model file not found" que já derrubou o SmolLM3 no celular.
        + 'resolve/ce7737e81beace910ffe847aa1f244bb3abac620/'
        + 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
    bytes: 105_000_000,
});

/** Duas threads bastam para 135M e evitam outro pico de CPU no telefone. */
export const FLOOR10_MOTOR_THREADS = 2;

export function motorBrainThreads(): number {
    return Math.min(FLOOR10_MOTOR_THREADS, Math.max(1, cpuThreadCount()));
}

export const FLOOR10_MOTOR_LOAD_CONFIG = Object.freeze({
    // O prompt é curto e a saída tem uma linha. Contexto maior só gastaria RAM.
    n_ctx: 768,
    n_batch: 128,
    n_gpu_layers: 0,
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    warmup: true,
});

/**
 * O SmolLM3 da fala é o dono do cache persistente. Os 105 MB do córtex motor
 * ficam residentes apenas nesta sessão para não recriar o bug em que outro
 * GGUF expulsava a fala da cota do navegador.
 */
export const FLOOR10_MOTOR_USE_CACHE = false;

export const FLOOR10_MOTOR_TOKENS = 32;
export const FLOOR10_MOTOR_TIMEOUT_MS = 30_000;
/** Download emperrado não pode bloquear todas as deliberações da sessão. */
export const FLOOR10_MOTOR_LOAD_TIMEOUT_MS = 180_000;
export const FLOOR10_MOTOR_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    max_tokens: FLOOR10_MOTOR_TOKENS,
    temperature: 0,
    grammar: FLOOR10_MOTOR_GRAMMAR,
    cache_prompt: true,
    chat_template_kwargs: Object.freeze({ enable_thinking: false }),
});

type MotorInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<unknown>;
    exit?: () => Promise<void> | void;
};
type MotorCtor =
    new (paths: Record<string, string>, cfg?: Record<string, unknown>) => MotorInstance;

let enginePromise: Promise<MotorInstance | null> | null = null;
let residentEngine: MotorInstance | null = null;
let loadingEngine: MotorInstance | null = null;
let loadAbort: AbortController | null = null;
let inferenceAbort: AbortController | null = null;
let inFlight = false;

function readCompletionText(response: unknown): string {
    if (typeof response === 'string') return response;
    const record = response as {
        choices?: Array<{
            message?: { content?: string | null; reasoning_content?: string | null };
            text?: string;
        }>;
        content?: string;
    } | null;
    const choice = record?.choices?.[0];
    const content = choice?.message?.content;
    const reasoning = choice?.message?.reasoning_content;
    if (typeof content === 'string' && content.trim()) return content;
    if (typeof reasoning === 'string' && reasoning.trim()) return reasoning;
    if (typeof choice?.text === 'string') return choice.text;
    if (typeof record?.content === 'string') return record.content;
    return '';
}

function terminate(engine: MotorInstance | null): void {
    if (!engine?.exit) return;
    try {
        void Promise.resolve(engine.exit()).catch(() => undefined);
    } catch { /* worker já encerrou */ }
}

function abortError(): Error {
    const error = new Error('Motor brain interrupted');
    error.name = 'AbortError';
    return error;
}

function raceWithAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
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

async function ensureMotorEngine(parentSignal?: AbortSignal): Promise<MotorInstance | null> {
    if (residentEngine) return residentEngine;
    if (parentSignal?.aborted) return null;
    if (enginePromise) {
        return parentSignal
            ? raceWithAbort(enginePromise, parentSignal).catch(() => null)
            : enginePromise;
    }

    enginePromise = (async () => {
        const controller = new AbortController();
        const inheritAbort = () => controller.abort();
        parentSignal?.addEventListener('abort', inheritAbort, { once: true });
        loadAbort = controller;
        const loadTimer = globalThis.setTimeout(
            () => controller.abort(),
            FLOOR10_MOTOR_LOAD_TIMEOUT_MS,
        );
        npcSet({
            deliberationPhase: 'loading',
            deliberationLoadText:
                `${FLOOR10_MOTOR_MODEL.label} · baixando tradutor de 105 MB`,
            deliberationLoadProgress: 0,
        });
        let engine: MotorInstance | null = null;
        try {
            const mod = await raceWithAbort(
                import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: MotorCtor }>,
                controller.signal,
            );
            if (controller.signal.aborted) throw abortError();
            engine = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
            loadingEngine = engine;
            await raceWithAbort(engine.loadModelFromUrl(FLOOR10_MOTOR_MODEL.url, {
                ...FLOOR10_MOTOR_LOAD_CONFIG,
                n_threads: motorBrainThreads(),
                // Não ocupa a cota persistente que protege o GGUF do SmolLM3.
                // O download acontece uma vez por sessão e os pesos ficam na RAM.
                useCache: FLOOR10_MOTOR_USE_CACHE,
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    const fraction = progress.total
                        ? Math.max(0, Math.min(
                            1,
                            (progress.loaded ?? 0) / progress.total,
                        ))
                        : 0;
                    npcSet({
                        deliberationLoadProgress: fraction,
                        deliberationLoadText:
                            `baixando ${FLOOR10_MOTOR_MODEL.label} · `
                            + `${Math.round(fraction * 100)}% de 105 MB`,
                    });
                },
            }), controller.signal);
            residentEngine = engine;
            npcSet({
                deliberationPhase: 'thinking',
                deliberationLoadProgress: 1,
                deliberationLoadText: `${FLOOR10_MOTOR_MODEL.label} pronto · traduzindo`,
            });
            return engine;
        } catch {
            terminate(engine);
            enginePromise = null;
            return null;
        } finally {
            globalThis.clearTimeout(loadTimer);
            parentSignal?.removeEventListener('abort', inheritAbort);
            if (loadAbort === controller) loadAbort = null;
            if (loadingEngine === engine) loadingEngine = null;
        }
    })();
    return enginePromise;
}

/**
 * Separada para o teste poder provar a chamada sem baixar 105 MB.
 */
export async function translateWithMotorEngine(
    engine: MotorInstance,
    thinking: string,
    perception: Floor10Perception,
    prison?: F10PrisonState | null,
    parentSignal?: AbortSignal,
): Promise<Floor10MotorPlan | null> {
    if (parentSignal?.aborted) return null;
    const controller = new AbortController();
    const inheritAbort = () => controller.abort();
    parentSignal?.addEventListener('abort', inheritAbort, { once: true });
    inferenceAbort = controller;
    const timer = globalThis.setTimeout(
        () => controller.abort(),
        FLOOR10_MOTOR_TIMEOUT_MS,
    );
    try {
        const response = await raceWithAbort(engine.createChatCompletion({
            messages: [{
                role: 'user',
                content: buildMotorTranslationPrompt(thinking, perception, prison),
            }],
            ...FLOOR10_MOTOR_COMPLETION_CONFIG,
            // A gramática base documenta o protocolo; esta versão por rodada
            // exclui alvos que os olhos não detectaram.
            grammar: buildMotorGrammar(perception, prison),
            abortSignal: controller.signal,
        }), controller.signal);
        return parseMotorPlan(readCompletionText(response));
    } catch {
        return null;
    } finally {
        globalThis.clearTimeout(timer);
        parentSignal?.removeEventListener('abort', inheritAbort);
        if (inferenceAbort === controller) inferenceAbort = null;
    }
}

/**
 * Caminho usado pelo jogo. Falhar nunca apaga a intenção ampla do MiniBrain.
 */
export async function translateFloor10MotorThought(
    thinking: string,
    perception: Floor10Perception,
    prison?: F10PrisonState | null,
    signal?: AbortSignal,
): Promise<Floor10MotorPlan | null> {
    if (inFlight || signal?.aborted) return null;
    inFlight = true;
    try {
        // O motor pertence ao pipeline de deliberação. Passar pelo mesmo
        // coordenador serializa o download de 105 MB contra uma carga da fala;
        // se a fala chegar, o preemptor da deliberação aborta este Worker.
        const engine = await floor10ModelCoordinator.activate(
            'deliberation',
            () => ensureMotorEngine(signal),
        );
        if (!engine || signal?.aborted) return null;
        return translateWithMotorEngine(engine, thinking, perception, prison, signal);
    } finally {
        inFlight = false;
    }
}

/** Fala tem prioridade: corta carga ou geração, mas preserva pesos já residentes. */
export function abortFloor10MotorBrain(): void {
    inferenceAbort?.abort();
    inferenceAbort = null;
    loadAbort?.abort();
    loadAbort = null;
    const loading = loadingEngine;
    loadingEngine = null;
    terminate(loading);
}

/** Descarga explícita para aparelhos sem memória ou encerramento de testes. */
export async function unloadFloor10MotorBrain(): Promise<void> {
    abortFloor10MotorBrain();
    const pending = enginePromise;
    enginePromise = null;
    const engine = residentEngine ?? (pending ? await pending.catch(() => null) : null);
    residentEngine = null;
    terminate(engine);
}

export function resetFloor10MotorBrainForTests(): void {
    abortFloor10MotorBrain();
    enginePromise = null;
    residentEngine = null;
    loadingEngine = null;
    inFlight = false;
}
