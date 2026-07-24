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
import { abortDeliberation, unloadSmallBrain } from './floor10SmallBrain';
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
    // 1024 quase estourava com um system prompt grande + histórico: na 2ª
    // mensagem o contexto transbordava e o 2B parava de responder. 1536 dá
    // folga real (prompt + histórico curto + geração cabem).
    n_ctx: 1536,
    // Tamanho do bloco de prefill. Sem isto o wllama não define n_batch e o
    // prompt pode ser processado em pedaços pequenos, desperdiçando as threads.
    // 512 cabe no n_ctx e deixa o prompt inteiro entrar em poucos blocos.
    n_batch: 512,
    n_threads: 1,
    n_gpu_layers: 0,
    // Qwen3.5 traz um template Jinja multimodal. Fixar estas opções no load
    // evita autodetecção/reasoning ambíguos na primeira geração.
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    // Aquece no load: paga o custo do 1º prefill uma vez, na tela de "carregando",
    // em vez de estourar o watchdog na primeira fala real.
    warmup: true,
});
export const CHAT_COMPLETION_CONFIG = Object.freeze({
    stream: true,
    // O personagem responde em 1–3 frases. 220 tokens só faziam a CPU trabalhar
    // mais e davam espaço para modelos pequenos divagarem.
    max_tokens: 64,
    temperature: 0.45,
    top_p: 0.85,
    top_k: 40,
    // SEM penalidade o 2B entrava em loop ("meu nome é o mesmo que o seu quando
    // você for perguntar…"). Pior: a fala degenerada era reprovada na validação
    // e disparava uma SEGUNDA geração completa — dobrando o tempo de espera.
    // Reproduzido no modelo real: 1.15 devolve fala coerente e no personagem.
    penalty_repeat: 1.15,
    penalty_last_n: 256,
    // Faz o motor emitir as medições de velocidade durante o stream.
    timings_per_token: true,
    // DESLIGADO de propósito: o cache híbrido de prompt do Qwen3.5 tem bug de
    // REUSO de contexto (llama.cpp#20225 / Qwen3#1826) — na 2ª mensagem o
    // estado cacheado corrompia e o modelo travava ("parou de responder").
    cache_prompt: false,
});

export type Floor10ModelDef = {
    url: string;
    label: string;
    qwen3: boolean;
};

/**
 * Cérebro de fala. Escolhido por comparação medida no modelo real (6 candidatos,
 * com o prompt e o histórico do jogo): o Qwen3.5-2B saía incoerente ("o teto está
 * cortando meu ombro", "um fio invisível cortando meu caminho") porque é um
 * modelo de RACIOCÍNIO rodando com o raciocínio desligado — modo em que ele
 * obedece pior a instruções. Gemma-4-E2B e MiniCPM5-1B caem no mesmo problema
 * (gastam a resposta inteira "pensando"); Llama-3.2-3B chegou a negar o próprio
 * nome; Phi-4-mini virou assistente ("como posso te ajudar hoje?").
 * O Qwen2.5-3B-Instruct respondeu certo, no personagem e TERMINANDO a frase —
 * e na mesma faixa de velocidade de leitura do 2B. Como ele acerta de primeira,
 * evita a segunda geração que a validação disparava: mais rápido na prática.
 */
export const FLOOR10_MODEL: Readonly<Floor10ModelDef> = Object.freeze({
    label: 'Qwen2.5-3B',
    qwen3: false,
    url: HF('bartowski/Qwen2.5-3B-Instruct-GGUF', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf'),
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
    // O PREFILL de um prompt grande (~1000+ tokens) na CPU do celular passava
    // dos 150s antigos e o watchdog matava o 2B TRABALHANDO ("parou de
    // responder"). Como só o mesmo cérebro é reiniciado (nunca troca de rota),
    // é seguro dar MUITO mais folga: melhor esperar do que falhar. O prefill
    // real termina bem antes desses tetos.
    firstTokenMultiMs: 600_000,   // 10 min (era 150s — estourava no prefill)
    firstTokenSingleMs: 900_000,  // 15 min numa thread só
    // Depois que a fala começou, usamos apenas inatividade entre chunks. Não
    // existe mais um limite total que possa cortar uma resposta saudável.
    nextTokenMultiMs: 180_000,
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
    onTimings?: (timings: ChatTimings) => void;
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

/** Medições reais do llama.cpp (chegam no último chunk do stream). */
export type ChatTimings = {
    prompt_n?: number;
    prompt_per_second?: number;
    predicted_per_second?: number;
    cache_n?: number;
};

export type ChatChunk = {
    choices?: Array<{ delta?: { content?: string | null } }>;
    // Compatibilidade defensiva com builds antigos do wllama.
    currentText?: string;
    piece?: string;
    timings?: ChatTimings;
};

export function chunkDelta(chunk: ChatChunk): string {
    const oaiDelta = chunk.choices?.[0]?.delta?.content;
    if (typeof oaiDelta === 'string') return oaiDelta;
    return typeof chunk.piece === 'string' ? chunk.piece : '';
}

/**
 * Resume as medições para a etiqueta da UI. Sem isto só dava para ADIVINHAR a
 * velocidade do aparelho; agora o número na tela é o que o motor mediu.
 */
export function formatTimings(timings: ChatTimings | null): string {
    if (!timings) return '';
    const parts: string[] = [];
    if (typeof timings.prompt_per_second === 'number' && timings.prompt_per_second > 0) {
        parts.push(`leitura ${Math.round(timings.prompt_per_second)} tok/s`);
    }
    if (typeof timings.predicted_per_second === 'number' && timings.predicted_per_second > 0) {
        parts.push(`fala ${Math.round(timings.predicted_per_second)} tok/s`);
    }
    if (typeof timings.prompt_n === 'number' && timings.prompt_n > 0) {
        parts.push(`${timings.prompt_n} tokens lidos`);
    }
    return parts.join(' · ');
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
    let sawAnyChunk = false;   // tokens OCULTOS (<think>) também contam como progresso

    while (true) {
        const now = Date.now();
        const stage: GenerationTimeoutError['stage'] = sawVisibleText ? 'next-token' : 'first-token';
        // Assim que QUALQUER chunk chega (mesmo raciocínio oculto do Qwen3.5),
        // passamos a medir só INATIVIDADE entre chunks. Antes, enquanto a fala
        // visível não começava, o prazo absoluto de first-token corria mesmo com
        // o modelo emitindo <think> — e o 2B "parava de responder" trabalhando.
        const stageRemaining = sawAnyChunk ? options.nextTokenMs : firstDeadline - now;
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

        sawAnyChunk = true;
        const chunk = result.value;
        if (chunk.timings) options.onTimings?.(chunk.timings);
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

        // UM MODELO POR VEZ. Carregar o cérebro pequeno antes deixava os dois
        // residentes (2,6 GB numa aba de celular) e a inferência despencava por
        // pressão de memória. Aqui ele SAI da memória para o 3B entrar inteiro.
        await unloadSmallBrain();

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

            // AFERIÇÃO REAL DO APARELHO. Uma geração minúscula (prompt curto,
            // poucos tokens) logo após o load, só para o llama.cpp devolver
            // quantos tokens por segundo ESTE celular faz. Sem isto a lentidão
            // só podia ser estimada, e estimativa já me levou a duas teorias
            // erradas. Termina em segundos mesmo num aparelho lento.
            void (async () => {
                try {
                    const probe = await candidate!.createChatCompletion({
                        messages: [{ role: 'user', content: 'Oi' }],
                        stream: false,
                        max_tokens: 8,
                        temperature: 0.1,
                    });
                    const timings = (probe as { timings?: ChatTimings })?.timings;
                    const measured = formatTimings(timings ?? null);
                    if (measured) {
                        npcSet({ modelLabel: `${model.label} · CPU×${loadedThreads} · ${measured}` });
                    }
                } catch { /* aferição é diagnóstico, nunca bloqueia a conversa */ }
            })();

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

    // A conversa tem prioridade absoluta sobre a deliberação. Sem isto, o
    // cérebro pequeno (que roda sem teto de tokens) continuava queimando CPU e
    // a geração do 3B despencava de 10,9 para 0,3 tok/s — medido nos dois
    // modelos reais. Era a resposta que nunca chegava.
    abortDeliberation();

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
        // Mantém CPU×N à vista durante a conversa. Antes virava "modelo único" e
        // parecia que a inferência caía para 1 thread — o número some da tela,
        // não as threads (o wllama fixa n_threads no load e não muda depois).
        modelLabel: `${FLOOR10_MODEL.label} · CPU×${loadedThreads}`,
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
    // Memória curta de propósito: as últimas 2 trocas (4 mensagens). Histórico
    // longo inchava o prefill e fazia o 2B "fixar" num tema. O essencial do
    // personagem vive na persona, não no histórico.
    const groundedHistory = groundedModelHistory(history, 4);

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
                // Publica a velocidade MEDIDA pelo motor no aparelho do jogador.
                onTimings: (timings) => {
                    const measured = formatTimings(timings);
                    if (measured) {
                        npcSet({ modelLabel: `${FLOOR10_MODEL.label} · CPU×${loadedThreads} · ${measured}` });
                    }
                },
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
