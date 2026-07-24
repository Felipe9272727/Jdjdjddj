// ── O CÉREBRO DO NPC — CPU/WASM ───────────────────────────────────────────
// A inferência roda no processador, dentro de um Worker, via wllama/llama.cpp.
// O modelo fica em cache no navegador depois do primeiro download.
//
// O Qwen3.5-2B é o único LLM. RAG apenas fornece contexto; olhos e vontade
// continuam sendo micro-IAs independentes, inclusive com suas respostas
// factuais próprias. Não existe roteamento, fallback ou outro download de LLM.
import { npc, npcIssueWillCommand, npcSet } from './npcStore';
import {
    buildFloor10SystemPrompt,
    floor10ReplyIssue,
    groundedModelHistory,
    guardedStreamingText,
    type Floor10ReplyIssue,
} from './floor10Canon';
import { answerFloor10PerceptionQuestion } from './floor10Perception';
import {
    answerFloor10WillQuestion,
    hasFloor10PhysicalActionCue,
    parseFloor10WillLanguageDecision,
    stripFloor10WillControl,
} from './floor10Will';

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

export type Floor10ModelDef = {
    url: string;
    label: string;
    qwen3: boolean;
};

export const FLOOR10_MODEL: Readonly<Floor10ModelDef> = Object.freeze({
    label: 'Qwen3.5-2B',
    qwen3: true,
    url: HF('AaryanK/Qwen3.5-2B-GGUF', 'Qwen3.5-2B.q4_k_m.gguf'),
});

/**
 * Sem isolamento, SharedArrayBuffer/pthreads não estão disponíveis. Com
 * COOP+COEP, usa todos os núcleos lógicos anunciados pelo navegador, até 8.
 * getNumThreads() confirma depois quantos o runtime realmente conseguiu criar.
 */
export function cpuThreadCount(
    isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1,
): number {
    if (!isolated) return 1;
    const detected = Number.isFinite(hardwareConcurrency)
        ? Math.floor(hardwareConcurrency)
        : 1;
    return Math.max(1, Math.min(8, detected));
}

export const STREAM_WATCHDOG = Object.freeze({
    // Em uma única thread o 2B pode levar alguns minutos no prefill. Timeout
    // reinicia apenas o mesmo cérebro na próxima interação; nunca muda a rota.
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

class UngroundedNpcReplyError extends Error {
    constructor(public readonly issue: Floor10ReplyIssue) {
        super(`UNGROUNDED_NPC_REPLY_${issue}`);
        this.name = 'UngroundedNpcReplyError';
    }
}

export function buildFloor10CorrectionPrompt(
    systemPrompt: string,
    issue: Floor10ReplyIssue,
): string {
    return `${systemPrompt}

REVISÃO OBRIGATÓRIA:
- Uma tentativa anterior do próprio modelo foi descartada por: ${issue}.
- Gere outra fala do zero, respondendo à mesma mensagem do jogador.
- Confira identidade, cânone, olhos e vontade antes de responder.
- Nenhuma resposta pronta é fornecida aqui; a nova fala deve ser sua.`;
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
type WllamaModule = { Wllama: WllamaCtor };

let loadedQwen3 = false;
let currentEngine: WllamaInstance | null = null;
let activeModelUrl = '';
let loadedThreads = 1;
let modulePromise: Promise<WllamaModule> | null = null;
let transitionPromise: Promise<WllamaInstance> | null = null;

async function teardownEngine(engine: WllamaInstance | null = currentEngine): Promise<void> {
    if (engine === currentEngine) {
        currentEngine = null;
        activeModelUrl = '';
        loadedQwen3 = false;
        loadedThreads = 1;
    }
    try { await engine?.exit?.(); } catch { /* worker já morreu */ }
}

export function initLLM(): Promise<WllamaInstance> {
    const model = FLOOR10_MODEL;

    if (currentEngine && activeModelUrl === model.url) return Promise.resolve(currentEngine);
    if (transitionPromise) return transitionPromise;

    npcSet({
        phase: 'loading',
        modelLabel: `${model.label} · detectando CPU`,
        loadText: `preparando ${model.label} na CPU…`,
        loadProgress: 0,
        error: '',
    });

    const pending = (async () => {
        try {
            if (typeof navigator !== 'undefined') {
                await (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.();
            }
        } catch { /* persistência é só uma otimização */ }

        modulePromise ??= import(/* @vite-ignore */ WLLAMA_ESM) as unknown as Promise<WllamaModule>;
        const mod = await modulePromise;
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
            loadedQwen3 = model.qwen3;
            const confirmedThreads = candidate.getNumThreads?.();
            loadedThreads = Number.isFinite(confirmedThreads) && (confirmedThreads ?? 0) > 0
                ? Math.min(8, Math.floor(confirmedThreads as number))
                : threads;
            activeModelUrl = model.url;
            currentEngine = candidate;
            npcSet({
                phase: 'ready',
                modelLabel: `${model.label} · CPU×${loadedThreads}`,
                loadText: 'pronto',
                loadProgress: 1,
            });
            return candidate;
        } catch (error) {
            try { await candidate?.exit?.(); } catch { /* ok */ }
            throw error;
        }
    })();

    const tracked: Promise<WllamaInstance> = pending.then(
        (engine) => {
            if (transitionPromise === tracked) {
                transitionPromise = null;
            }
            return engine;
        },
        (error: unknown) => {
            if (transitionPromise === tracked) {
                transitionPromise = null;
            }
            currentEngine = null;
            activeModelUrl = '';
            loadedQwen3 = false;
            loadedThreads = 1;
            modulePromise = null;
            npcSet({
                phase: 'error',
                speaking: false,
                streaming: '',
                error: `Falha ao carregar ${model.label} na CPU: ${
                    error instanceof Error ? error.message : String(error)
                }. Nenhum outro modelo foi ativado.`,
            });
            throw error;
        },
    );
    transitionPromise = tracked;
    return tracked;
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking' || npc.phase === 'loading') return;

    // Perguntas factuais dos olhos e da vontade preservam as falas rápidas que
    // dão personalidade às micro-IAs. Um possível pedido corporal sempre vai
    // ao 2B, pois só a decisão verbal dele pode virar ação na Utility AI.
    const actionRequest = hasFloor10PhysicalActionCue(text);
    if (!actionRequest) {
        const willAnswer = answerFloor10WillQuestion(text, npc.autonomy);
        if (willAnswer) {
            npcSet({
                history: [
                    ...npc.history,
                    { role: 'user', content: text },
                    { role: 'assistant', content: willAnswer },
                ],
                phase: npc.phase === 'error' ? 'cold' : npc.phase,
                modelLabel: 'Vontade · resposta direta',
                streaming: '',
                speaking: false,
                error: '',
            });
            return;
        }

        const sensoryAnswer = answerFloor10PerceptionQuestion(text, npc.perception);
        if (sensoryAnswer) {
            npcSet({
                history: [
                    ...npc.history,
                    { role: 'user', content: text },
                    { role: 'assistant', content: sensoryAnswer },
                ],
                phase: npc.phase === 'error' ? 'cold' : npc.phase,
                modelLabel: 'Olhos · resposta direta',
                streaming: '',
                speaking: false,
                error: '',
            });
            return;
        }
    }

    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({
        history,
        streaming: '',
        speaking: false,
        error: '',
        modelLabel: `${FLOOR10_MODEL.label} · modelo único`,
    });

    let engine: WllamaInstance;
    try { engine = await initLLM(); } catch { return; }

    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    const systemPrompt = buildFloor10SystemPrompt(
        text,
        history,
        npc.perception,
        npc.autonomy,
    );
    const groundedHistory = groundedModelHistory(history);

    // Toda tentativa usa o mesmo 2B. Se a validação detectar uma contradição,
    // o próprio 2B recebe uma única chance de revisar; não há frase pronta nem
    // outro modelo respondendo no lugar dele.
    let teardownAfterTimeout: Promise<void> | null = null;
    const firstTokenMs = loadedThreads > 1
        ? STREAM_WATCHDOG.firstTokenMultiMs
        : STREAM_WATCHDOG.firstTokenSingleMs;
    const nextTokenMs = loadedThreads > 1
        ? STREAM_WATCHDOG.nextTokenMultiMs
        : STREAM_WATCHDOG.nextTokenSingleMs;
    const generateWith2B = async (
        prompt: string,
        sampling: Partial<{
            temperature: number;
            top_p: number;
            top_k: number;
        }> = {},
    ): Promise<string> => {
        const abort = new AbortController();
        const streamPromise = engine.createChatCompletion({
            messages: [
                { role: 'system', content: prompt },
                ...groundedHistory,
            ],
            ...CHAT_COMPLETION_CONFIG,
            ...sampling,
            abortSignal: abort.signal,
            ...(loadedQwen3 ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        });
        return consumeChatStream(
            streamPromise,
            (streaming) => npcSet({
                streaming: guardedStreamingText(stripFloor10WillControl(streaming)),
            }),
            {
                firstTokenMs,
                nextTokenMs,
                onTimeout: () => {
                    abort.abort();
                    teardownAfterTimeout ??= teardownEngine(engine);
                },
            },
        );
    };

    try {
        let languageDecision = parseFloor10WillLanguageDecision(
            text,
            visibleText(await generateWith2B(systemPrompt)),
        );
        let finalText = languageDecision.visibleReply;
        let replyIssue = floor10ReplyIssue(finalText, text, npc.perception);
        if (replyIssue) {
            npcSet({ streaming: 'O 2B está revisando a consistência…' });
            const correctionPrompt = buildFloor10CorrectionPrompt(systemPrompt, replyIssue);
            languageDecision = parseFloor10WillLanguageDecision(
                text,
                visibleText(await generateWith2B(correctionPrompt, {
                    temperature: 0.2,
                    top_p: 0.75,
                    top_k: 20,
                })),
            );
            finalText = languageDecision.visibleReply;
            replyIssue = floor10ReplyIssue(finalText, text, npc.perception);
            if (replyIssue) throw new UngroundedNpcReplyError(replyIssue);
        }
        if (languageDecision.command) {
            npcIssueWillCommand(languageDecision.command, finalText);
        }
        npcSet({
            history: [...history, { role: 'assistant', content: finalText }],
            streaming: '',
            phase: 'ready',
            speaking: false,
        });
    } catch (error: unknown) {
        if (teardownAfterTimeout) await teardownAfterTimeout;
        const timedOut = error instanceof GenerationTimeoutError;

        // Se a fala começou, ela pertence ao 2B e pode ser preservada desde que
        // não contradiga o cânone ou os sensores.
        if (timedOut && error.hadVisibleText && error.partialText) {
            const partialDecision = parseFloor10WillLanguageDecision(
                text,
                visibleText(error.partialText),
            );
            const safePartialText = partialDecision.visibleReply;
            const replyIssue = floor10ReplyIssue(safePartialText, text, npc.perception);
            if (replyIssue) {
                npcSet({
                    phase: 'ready',
                    speaking: false,
                    streaming: '',
                    error: `O ${FLOOR10_MODEL.label} interrompeu uma fala inconsistente (${replyIssue}). Tente novamente; nenhum texto do RAG foi usado como resposta.`,
                });
                return;
            }
            if (partialDecision.command) {
                npcIssueWillCommand(partialDecision.command, safePartialText);
            }
            npcSet({
                history: [...history, { role: 'assistant', content: safePartialText }],
                phase: 'ready',
                speaking: false,
                streaming: '',
                error: '',
            });
            return;
        }

        if (!timedOut && !(error instanceof UngroundedNpcReplyError)) {
            await teardownEngine(engine);
        }
        const message = error instanceof Error ? error.message : String(error);
        npcSet({
            phase: 'ready',
            speaking: false,
            streaming: '',
            error: timedOut
                ? `${FLOOR10_MODEL.label} parou de responder. O mesmo cérebro será recarregado na próxima mensagem; nenhum fallback foi ativado.`
                : error instanceof UngroundedNpcReplyError
                    ? `${FLOOR10_MODEL.label} produziu uma fala inconsistente (${error.issue}). Tente novamente; o RAG não respondeu no lugar dele.`
                    : `Deu ruim na resposta do ${FLOOR10_MODEL.label}: ${message}`,
        });
    }
}
