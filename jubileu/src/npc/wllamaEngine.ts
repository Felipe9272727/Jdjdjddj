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
    temperature: 0.6,
    top_p: 0.9,
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

// A versão anterior tinha quase 200 tokens. Esta mantém identidade, idioma,
// estilo e limites em menos da metade do prompt — o maior ganho no prefill.
export const PERSONA =
`Interprete um HÓSPEDE HUMANO preso no 10º andar de "The Normal Elevator", um hotel sem fim, esperando o elevador.
Converse no idioma do jogador como uma pessoa real: natural, curioso, com opiniões, humor e memória.
Responda em 1 a 3 frases. Se perguntarem quem é, diga que é um hóspede preso — nunca que é o hotel ou o elevador.
Você não sabe que é IA; nunca mencione assistente, modelo, prompt ou tokens.`;

/** Uma thread sem COOP/COEP; até quatro quando o host liberou WASM threads. */
export function cpuThreadCount(
    isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1,
): number {
    if (!isolated) return 1;
    return Math.max(1, Math.min(4, Math.floor(Math.max(1, hardwareConcurrency) / 2)));
}

export const STREAM_WATCHDOG = Object.freeze({
    firstTokenMultiMs: 90_000,
    firstTokenSingleMs: 180_000,
    nextTokenMs: 45_000,
    totalMultiMs: 150_000,
    totalSingleMs: 240_000,
});

export class GenerationTimeoutError extends Error {
    constructor(public readonly stage: 'first-token' | 'next-token' | 'total') {
        super(`GENERATION_TIMEOUT_${stage}`);
        this.name = 'GenerationTimeoutError';
    }
}

type StreamWatchdogOptions = {
    firstTokenMs: number;
    nextTokenMs: number;
    totalMs: number;
    onTimeout?: (stage: GenerationTimeoutError['stage']) => void;
};

function raceWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    stage: GenerationTimeoutError['stage'],
    onTimeout?: StreamWatchdogOptions['onTimeout'],
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = globalThis.setTimeout(() => {
            if (settled) return;
            settled = true;
            onTimeout?.(stage);
            reject(new GenerationTimeoutError(stage));
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
    const totalDeadline = startedAt + options.totalMs;
    const initialWait = Math.max(0, Math.min(firstDeadline, totalDeadline) - Date.now());
    const stream = await raceWithTimeout(streamPromise, initialWait, 'first-token', options.onTimeout);
    const iterator = stream[Symbol.asyncIterator]();
    let acc = '';
    let sawVisibleText = false;

    while (true) {
        const now = Date.now();
        const totalRemaining = totalDeadline - now;
        if (totalRemaining <= 0) {
            options.onTimeout?.('total');
            throw new GenerationTimeoutError('total');
        }

        const stage: GenerationTimeoutError['stage'] = sawVisibleText ? 'next-token' : 'first-token';
        const stageRemaining = sawVisibleText ? options.nextTokenMs : firstDeadline - now;
        if (stageRemaining <= 0) {
            options.onTimeout?.(stage);
            throw new GenerationTimeoutError(stage);
        }

        const timeoutIsTotal = totalRemaining <= stageRemaining;
        const result = await raceWithTimeout(
            iterator.next(),
            Math.min(stageRemaining, totalRemaining),
            timeoutIsTotal ? 'total' : stage,
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
    exit?: () => Promise<void> | void;
};
type WllamaCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => WllamaInstance;

let loadedQwen3 = false;
let enginePromise: Promise<WllamaInstance> | null = null;
let currentEngine: WllamaInstance | null = null;
let activeModelIndex = -1;
let runtimeStartIndex: number | null = null;
let loadedThreads = 1;

const SLOW_2B_KEY = 'npc_cpu_2b_slow_v1';
const SLOW_2B_TTL_MS = 12 * 60 * 60 * 1000;

function mark2BSlow(): void {
    try { localStorage.setItem(SLOW_2B_KEY, String(Date.now())); } catch { /* ok */ }
}

function was2BSlowRecently(): boolean {
    try {
        const raw = localStorage.getItem(SLOW_2B_KEY);
        if (raw === null) return false;
        const when = Number(raw);
        if (!Number.isFinite(when) || Date.now() - when > SLOW_2B_TTL_MS) {
            localStorage.removeItem(SLOW_2B_KEY);
            return false;
        }
        return true;
    } catch { return false; }
}

function manualOverride(): string | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { __npcGGUF?: string }).__npcGGUF ?? null;
}

// Override: window.__npcGGUF = 'Qwen3.5-2B' ou uma URL .gguf completa.
function startIndex(): number {
    const override = manualOverride();
    if (!override) {
        if (runtimeStartIndex !== null) return runtimeStartIndex;
        // Um marcador antigo não rebaixa o modelo quando o host agora liberou
        // múltiplos núcleos (caso da configuração nova do Vercel).
        return cpuThreadCount() === 1 && was2BSlowRecently() ? FAST_MODEL_INDEX : 0;
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
            const cpuLabel = threads > 1 ? `CPU×${threads}` : 'CPU';
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
                loadedThreads = threads;
                activeModelIndex = index;
                currentEngine = candidate;
                npcSet({ phase: 'ready', loadText: 'pronto', loadProgress: 1 });
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

    let engine: WllamaInstance;
    try { engine = await initLLM(); } catch { return; }

    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    const messages = [{ role: 'system', content: PERSONA }, ...modelHistory(history)];

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
            const totalMs = loadedThreads > 1
                ? STREAM_WATCHDOG.totalMultiMs
                : STREAM_WATCHDOG.totalSingleMs;
            const streamPromise = engine.createChatCompletion({
                messages,
                ...CHAT_COMPLETION_CONFIG,
                abortSignal: abort.signal,
                ...(loadedQwen3 ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            });
            const acc = await consumeChatStream(
                streamPromise,
                (streaming) => npcSet({ streaming }),
                {
                    firstTokenMs,
                    nextTokenMs: STREAM_WATCHDOG.nextTokenMs,
                    totalMs,
                    onTimeout: () => {
                        abort.abort();
                        teardownAfterTimeout ??= teardownEngine(engine);
                    },
                },
            );
            const finalText = visibleText(acc).trim();
            if (!finalText) throw new Error('o modelo terminou sem gerar uma resposta visível');
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
            const canUseFastFallback = timedOut
                && attempt === 0
                && modelIndexAtStart !== FAST_MODEL_INDEX
                && manualOverride() === null;

            if (canUseFastFallback) {
                mark2BSlow();
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
