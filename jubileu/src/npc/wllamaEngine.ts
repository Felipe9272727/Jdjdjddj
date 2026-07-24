// ── O CÉREBRO DO NPC — CPU/WASM ───────────────────────────────────────────
// A inferência roda no processador, dentro de um Worker, via wllama/llama.cpp.
// O modelo fica em cache no navegador depois do primeiro download.
//
// Diagnóstico medido em 2026-07-23:
// - o GGUF Qwen3.5-2B responde normalmente em llama.cpp nativo;
// - a configuração web antiga (persona longa + contexto 2048) levou 91s até o
//   primeiro token mesmo numa CPU de servidor e virava vários minutos no celular;
// - o 0.8B foi ~2,5× mais rápido, mas perdeu qualidade em português.
//
// Por isso o 2B continua sendo o cérebro principal. Reduzimos o trabalho por
// fala, usamos até quatro núcleos quando o host libera WASM threads, pausamos o
// render 3D enquanto o chat está aberto e mantemos o 0.8B só como recuperação
// automática para um aparelho que realmente não aguente o 2B.
import { npc, npcSet } from './npcStore';
import {
    buildFloor10SystemPrompt,
    groundedModelHistory,
    guardNpcReply,
    guardedStreamingText,
} from './floor10Canon';
import { answerFloor10PerceptionQuestion } from './floor10Perception';
import { answerFloor10WillQuestion } from './floor10Will';

const WLLAMA_V = '3.5.1';
// esm.sh/esm.run reempacotavam o wllama e quebravam worker/WASM. O ESM
// pré-buildado do jsDelivr preserva os imports relativos do pacote.
const CDN = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;
const HF = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;

// wllama v3 usa uma única build e exige literalmente a chave "default".
export const WLLAMA_PATHS = Object.freeze({ default: WASM_SINGLE });
export const CPU_LOAD_CONFIG = Object.freeze({
    // A conversa enviada ao modelo é limitada a seis mensagens. 2048 só
    // dobrava o custo de contexto sem melhorar esse NPC.
    n_ctx: 1024,
    n_threads: 1,
    n_gpu_layers: 0,
    // Qwen3.5 traz um template Jinja multimodal. Fixar estas opções no load
    // evita autodetecção/reasoning ambíguos na primeira geração.
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    warmup: false,
});
export const CHAT_COMPLETION_CONFIG = Object.freeze({
    stream: true,
    // O personagem responde em 1–3 frases. 220 tokens só faziam a CPU trabalhar
    // mais e davam espaço para modelos pequenos divagarem.
    max_tokens: 64,
    temperature: 0.45,
    top_p: 0.85,
    top_k: 40,
    cache_prompt: true,
});

type ModelDef = { url: string; label: string; qwen3?: boolean };
const MODELS: ModelDef[] = [
    { label: 'Qwen3.5-2B', qwen3: true, url: HF('AaryanK/Qwen3.5-2B-GGUF', 'Qwen3.5-2B.q4_k_m.gguf') },
    // Recuperação rápida: só entra depois de timeout real do 2B.
    { label: 'Qwen3.5-0.8B', qwen3: true, url: HF('unsloth/Qwen3.5-0.8B-GGUF', 'Qwen3.5-0.8B-Q4_K_M.gguf') },
    { label: 'Qwen2.5-1.5B', url: HF('bartowski/Qwen2.5-1.5B-Instruct-GGUF', 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf') },
    { label: 'Qwen2.5-0.5B', url: HF('bartowski/Qwen2.5-0.5B-Instruct-GGUF', 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf') },
];
const FAST_MODEL_INDEX = 1;

/** Uma thread sem COOP/COEP; até quatro quando o host liberou WASM threads. */
export function cpuThreadCount(
    isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1,
): number {
    if (!isolated) return 1;
    return Math.max(1, Math.min(4, Math.floor(Math.max(1, hardwareConcurrency) / 2)));
}

export const STREAM_WATCHDOG = Object.freeze({
    // Em uma única thread o 2B pode levar alguns minutos no prefill. O fallback
    // só deve entrar quando ele não produziu absolutamente nenhum texto.
    firstTokenMultiMs: 150_000,
    firstTokenSingleMs: 300_000,
    // Depois que a fala começou, usamos apenas inatividade entre chunks. Não
    // existe mais um limite total que possa cortar uma resposta saudável.
    nextTokenMultiMs: 120_000,
    nextTokenSingleMs: 240_000,
});

export class GenerationTimeoutError extends Error {
    constructor(
        public readonly stage: 'first-token' | 'next-token',
        public readonly hadVisibleText = false,
        public readonly partialText = '',
    ) {
        super(`GENERATION_TIMEOUT_${stage}`);
        this.name = 'GenerationTimeoutError';
    }
}

type StreamWatchdogOptions = {
    firstTokenMs: number;
    nextTokenMs: number;
    onTimeout?: (stage: GenerationTimeoutError['stage']) => void;
};

function raceWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutError: GenerationTimeoutError,
    onTimeout?: StreamWatchdogOptions['onTimeout'],
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = globalThis.setTimeout(() => {
            if (settled) return;
            settled = true;
            onTimeout?.(timeoutError.stage);
            reject(timeoutError);
        }, Math.max(0, timeoutMs));
        promise.then(
            (value) => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

// Tira o raciocínio do Qwen3.x (<think>…</think>) — no-op no Qwen2.5.
export function visibleText(s: string): string {
    const close = s.lastIndexOf('</think>');
    if (close !== -1) return s.slice(close + '</think>'.length).replace(/^\s+/, '');
    const open = s.indexOf('<think>');
    if (open !== -1) return s.slice(0, open).replace(/^\s+/, '');
    return s.replace(/^\s+/, '');
}

export type ChatChunk = {
    choices?: Array<{ delta?: { content?: string | null } }>;
    // Compatibilidade defensiva com builds antigos do wllama.
    currentText?: string;
    piece?: string;
};

export function chunkDelta(chunk: ChatChunk): string {
    const oaiDelta = chunk.choices?.[0]?.delta?.content;
    if (typeof oaiDelta === 'string') return oaiDelta;
    return typeof chunk.piece === 'string' ? chunk.piece : '';
}

/** Consome o stream sem permitir que um Worker silencioso deixe a UI em "…". */
export async function consumeChatStream(
    streamPromise: Promise<AsyncIterable<ChatChunk>>,
    onVisibleText: (text: string) => void,
    options: StreamWatchdogOptions,
): Promise<string> {
    const startedAt = Date.now();
    const firstDeadline = startedAt + options.firstTokenMs;
    const initialWait = Math.max(0, firstDeadline - Date.now());
    const stream = await raceWithTimeout(
        streamPromise,
        initialWait,
        new GenerationTimeoutError('first-token'),
        options.onTimeout,
    );
    const iterator = stream[Symbol.asyncIterator]();
    let acc = '';
    let sawVisibleText = false;

    while (true) {
        const now = Date.now();
        const stage: GenerationTimeoutError['stage'] = sawVisibleText ? 'next-token' : 'first-token';
        const stageRemaining = sawVisibleText ? options.nextTokenMs : firstDeadline - now;
        if (stageRemaining <= 0) {
            options.onTimeout?.(stage);
            throw new GenerationTimeoutError(stage, sawVisibleText, visibleText(acc).trim());
        }

        const result = await raceWithTimeout(
            iterator.next(),
            stageRemaining,
            new GenerationTimeoutError(stage, sawVisibleText, visibleText(acc).trim()),
            options.onTimeout,
        );
        if (result.done) break;

        const chunk = result.value;
        if (typeof chunk.currentText === 'string') acc = chunk.currentText;
        else acc += chunkDelta(chunk);
        const visible = visibleText(acc);
        if (visible.length > 0) sawVisibleText = true;
        onVisibleText(visible);
    }
    return acc;
}

/** Limita só o contexto do modelo; a UI continua mostrando a conversa toda. */
export function modelHistory<T>(history: T[], maxMessages = 6): T[] {
    return history.slice(-Math.max(1, maxMessages));
}

type WllamaInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<AsyncIterable<ChatChunk>>;
    getNumThreads?: () => number;
    exit?: () => Promise<void> | void;
};
type WllamaCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => WllamaInstance;

let loadedQwen3 = false;
let enginePromise: Promise<WllamaInstance> | null = null;
let currentEngine: WllamaInstance | null = null;
let activeModelIndex = -1;
let runtimeStartIndex: number | null = null;
let loadedThreads = 1;

function manualOverride(): string | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { __npcGGUF?: string }).__npcGGUF ?? null;
}

export function shouldUseFastFallback(
    error: unknown,
    attempt: number,
    modelIndexAtStart: number,
    hasManualOverride: boolean,
): boolean {
    return error instanceof GenerationTimeoutError
        && error.stage === 'first-token'
        && !error.hadVisibleText
        && attempt === 0
        && modelIndexAtStart !== FAST_MODEL_INDEX
        && !hasManualOverride;
}

// Override: window.__npcGGUF = 'Qwen3.5-2B' ou uma URL .gguf completa.
function startIndex(): number {
    const override = manualOverride();
    if (!override) {
        return runtimeStartIndex ?? 0;
    }
    if (override.startsWith('http')) {
        const custom = MODELS.findIndex((model) => model.label === 'custom');
        if (custom === -1) MODELS.unshift({ label: 'custom', url: override });
        else MODELS[custom] = { label: 'custom', url: override };
        return MODELS.findIndex((model) => model.label === 'custom');
    }
    const index = MODELS.findIndex((model) => model.label === override);
    return index >= 0 ? index : 0;
}

async function teardownEngine(engine: WllamaInstance | null = currentEngine): Promise<void> {
    if (engine === currentEngine) currentEngine = null;
    enginePromise = null;
    loadedQwen3 = false;
    loadedThreads = 1;
    activeModelIndex = -1;
    try { await engine?.exit?.(); } catch { /* worker já morreu */ }
}

export function initLLM(): Promise<WllamaInstance> {
    if (enginePromise) return enginePromise;
    npcSet({ phase: 'loading', loadText: 'acordando o hóspede (CPU)…', loadProgress: 0, error: '' });
    enginePromise = (async () => {
        try {
            await (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.();
        } catch { /* persistência é só uma otimização */ }

        const mod = (await import(/* @vite-ignore */ WLLAMA_ESM)) as unknown as { Wllama: WllamaCtor };
        let lastError: unknown = null;
        for (let index = startIndex(); index < MODELS.length; index++) {
            const model = MODELS[index];
            const threads = cpuThreadCount();
            const cpuLabel = `CPU×${threads}`;
            npcSet({
                modelLabel: `${model.label} · ${cpuLabel}`,
                loadText: `carregando ${model.label} (${cpuLabel})…`,
                loadProgress: 0,
            });

            let candidate: WllamaInstance | null = null;
            try {
                candidate = new mod.Wllama(WLLAMA_PATHS, { suppressNativeLog: true });
                await candidate.loadModelFromUrl(model.url, {
                    ...CPU_LOAD_CONFIG,
                    n_threads: threads,
                    progressCallback: (progress: { loaded?: number; total?: number }) => {
                        const fraction = progress.total ? (progress.loaded ?? 0) / progress.total : 0;
                        npcSet({
                            loadProgress: fraction,
                            loadText: `baixando ${model.label}… ${Math.round(fraction * 100)}%`,
                        });
                    },
                });
                loadedQwen3 = !!model.qwen3;
                // O próprio wllama confirma quantas pthreads conseguiu criar.
                // Assim o cabeçalho nunca promete CPU×4 se o browser recusou
                // SharedArrayBuffer por algum motivo.
                loadedThreads = Math.max(1, candidate.getNumThreads?.() ?? threads);
                activeModelIndex = index;
                currentEngine = candidate;
                npcSet({
                    phase: 'ready',
                    modelLabel: `${model.label} · CPU×${loadedThreads}`,
                    loadText: 'pronto',
                    loadProgress: 1,
                });
                return candidate;
            } catch (error) {
                lastError = error;
                const detail = error instanceof Error ? error.message.slice(0, 60) : '';
                npcSet({ loadText: `${model.label} não rolou (${detail}), tentando o próximo…` });
                try { await candidate?.exit?.(); } catch { /* ok */ }
            }
        }
        throw lastError ?? new Error('nenhum modelo carregou');
    })().catch((error: unknown) => {
        npcSet({
            phase: 'error',
            error: `Falha ao carregar a IA (CPU): ${error instanceof Error ? error.message : String(error)}`,
        });
        enginePromise = null;
        currentEngine = null;
        throw error;
    });
    return enginePromise;
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking') return;

    // A vontade conhece a própria escolha sem consultar o LLM. Ela vem antes
    // dos olhos para "onde você está indo?" significar intenção, não posição.
    const willAnswer = answerFloor10WillQuestion(text, npc.autonomy);
    if (willAnswer) {
        npcSet({
            history: [
                ...npc.history,
                { role: 'user', content: text },
                { role: 'assistant', content: willAnswer },
            ],
            streaming: '',
            speaking: false,
            error: '',
        });
        return;
    }

    // Os olhos são outra IA separada: perguntas sobre posição/campo de visão
    // recebem resposta instantânea e factual, sem gastar inferência do 2B.
    const sensoryAnswer = answerFloor10PerceptionQuestion(text, npc.perception);
    if (sensoryAnswer) {
        npcSet({
            history: [
                ...npc.history,
                { role: 'user', content: text },
                { role: 'assistant', content: sensoryAnswer },
            ],
            streaming: '',
            speaking: false,
            error: '',
        });
        return;
    }

    let engine: WllamaInstance;
    try { engine = await initLLM(); } catch { return; }

    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    const systemPrompt = buildFloor10SystemPrompt(text, history, npc.perception, npc.autonomy);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...groundedModelHistory(history),
    ];

    // A segunda tentativa é reservada ao fallback rápido e só acontece quando
    // o 2B não produz texto dentro do watchdog.
    for (let attempt = 0; attempt < 2; attempt++) {
        const modelIndexAtStart = activeModelIndex;
        let teardownAfterTimeout: Promise<void> | null = null;
        const abort = new AbortController();
        try {
            const firstTokenMs = loadedThreads > 1
                ? STREAM_WATCHDOG.firstTokenMultiMs
                : STREAM_WATCHDOG.firstTokenSingleMs;
            const nextTokenMs = loadedThreads > 1
                ? STREAM_WATCHDOG.nextTokenMultiMs
                : STREAM_WATCHDOG.nextTokenSingleMs;
            const streamPromise = engine.createChatCompletion({
                messages,
                ...CHAT_COMPLETION_CONFIG,
                abortSignal: abort.signal,
                ...(loadedQwen3 ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            });
            const acc = await consumeChatStream(
                streamPromise,
                (streaming) => npcSet({ streaming: guardedStreamingText(streaming) }),
                {
                    firstTokenMs,
                    nextTokenMs,
                    onTimeout: () => {
                        abort.abort();
                        teardownAfterTimeout ??= teardownEngine(engine);
                    },
                },
            );
            const finalText = guardNpcReply(visibleText(acc), text, npc.perception);
            npcSet({
                history: [...history, { role: 'assistant', content: finalText }],
                streaming: '',
                phase: 'ready',
                speaking: false,
            });
            return;
        } catch (error: unknown) {
            if (teardownAfterTimeout) await teardownAfterTimeout;
            const timedOut = error instanceof GenerationTimeoutError;
            const canUseFastFallback = shouldUseFastFallback(
                error,
                attempt,
                modelIndexAtStart,
                manualOverride() !== null,
            );

            if (canUseFastFallback) {
                runtimeStartIndex = FAST_MODEL_INDEX;
                npcSet({
                    phase: 'loading',
                    streaming: '',
                    speaking: false,
                    error: '',
                    loadText: 'o 2B ficou lento neste aparelho; ativando o cérebro rápido…',
                    loadProgress: 0,
                });
                try { engine = await initLLM(); } catch { return; }
                npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
                continue;
            }

            // Se o stream já publicou texto, ele nunca é trocado pelo 0.8B.
            // Preservamos a fala recebida e reiniciamos o mesmo 2B apenas na
            // próxima interação.
            if (timedOut && error.hadVisibleText && error.partialText) {
                const safePartialText = guardNpcReply(error.partialText, text, npc.perception);
                npcSet({
                    history: [...history, { role: 'assistant', content: safePartialText }],
                    phase: 'ready',
                    speaking: false,
                    streaming: '',
                    error: '',
                });
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            npcSet({
                phase: 'ready',
                speaking: false,
                streaming: '',
                error: timedOut
                    ? 'A CPU parou de responder. O motor foi reiniciado; manda a mensagem de novo.'
                    : `Deu ruim na resposta: ${message}`,
            });
            return;
        }
    }
}
