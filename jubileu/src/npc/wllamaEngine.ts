// ── O CÉREBRO DO NPC — CPU + WEBGPU ───────────────────────────────────────
// O wllama divide o SmolLM3 entre WebGPU e CPU quando o aparelho comporta; em
// aparelhos menores recua sozinho para CPU/WASM. O modelo fica em cache no
// navegador depois do primeiro download.
//
// O SmolLM3-3B é o cérebro de fala. RAG apenas fornece contexto; olhos e vontade
// continuam sendo micro-IAs independentes, inclusive com suas respostas
// factuais próprias. O MiniCPM delibera, mas nunca fala no lugar do 3B.
import { npc, npcIssueWillCommand, npcSet } from './npcStore';
import {
    FLOOR10_STABLE_PREFIX,
    buildFloor10SystemPrompt,
    floor10ReplyIssue,
    groundedModelHistory,
    guardedStreamingText,
    isFloor10IdentityQuestion,
    type Floor10ReplyIssue,
} from './floor10Canon';
import { answerFloor10PerceptionQuestion } from './floor10Perception';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { SMALL_BRAIN_MODEL, abortDeliberation } from './floor10SmallBrain';
import {
    formatGB,
    isForeignModel,
    planModelCache,
    probeModelBytes,
    readStorageEstimate,
    reclaimableBytes,
    type CachedEntry,
} from './floor10ModelStorage';
import {
    answerFloor10WillQuestion,
    hasFloor10PhysicalActionCue,
    parseFloor10WillLanguageDecision,
    stripFloor10WillControl,
} from './floor10Will';

const WLLAMA_V = '3.5.1';
// esm.sh/esm.run reempacotavam o wllama e quebravam worker/WASM. O ESM
// pré-buildado do jsDelivr preserva os imports relativos do pacote.
//
// __wllamaCdn e __npcModelUrl permitem apontar runtime e modelo para cópias
// LOCAIS. É o que torna possível medir o NPC dentro do jogo num ambiente sem
// internet (sonda headless): sem override, o motor nem carrega e a única coisa
// observável é "Failed to fetch".
const cdnOverride = (globalThis as { __wllamaCdn?: string }).__wllamaCdn;
const CDN = cdnOverride ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;
const HF = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;

// wllama v3 usa uma única build e exige literalmente a chave "default".
export const WLLAMA_PATHS = Object.freeze({ default: WASM_SINGLE });
export const CPU_LOAD_CONFIG = Object.freeze({
    // 1024 quase estourava com um system prompt grande + histórico: na 2ª
    // mensagem o contexto transbordava e o modelo parava de responder. 1536 dá
    // folga real (prompt + histórico curto + geração cabem).
    n_ctx: 1536,
    // Tamanho do bloco de prefill. Sem isto o wllama não define n_batch e o
    // prompt pode ser processado em pedaços pequenos, desperdiçando as threads.
    // 512 cabe no n_ctx e deixa o prompt inteiro entrar em poucos blocos.
    n_batch: 512,
    n_threads: 1,
    n_gpu_layers: 0,
    // SmolLM3 é híbrido. Fixar o modo rápido no load evita que o template ligue
    // raciocínio longo antes mesmo de receber a primeira fala.
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
    // SEM penalidade o modelo entrava em loop ("meu nome é o mesmo que o seu quando
    // você for perguntar…"). Pior: a fala degenerada era reprovada na validação
    // e disparava uma SEGUNDA geração completa — dobrando o tempo de espera.
    // Reproduzido no modelo real: 1.15 devolve fala coerente e no personagem.
    penalty_repeat: 1.15,
    penalty_last_n: 256,
    // Faz o motor emitir as medições de velocidade durante o stream.
    timings_per_token: true,
    // Reaproveita o prefixo estável da persona e do histórico em vez de reler
    // tudo a cada mensagem.
    cache_prompt: true,
});

export type Floor10ModelDef = {
    url: string;
    label: string;
    disableThinking: boolean;
    systemTemplateFlags: string;
};

/**
 * Cérebro de fala escolhido para o equilíbrio celular: 3B/Q4_K_M, português
 * nativo e forte obediência a instruções e chamadas estruturadas. O GGUF oficial
 * usa dois controles próprios:
 * - /no_think impede que uma fala curta gaste tempo em raciocínio visível;
 * - /system_override fecha corretamente a mensagem de sistema e impede que o
 *   template acrescente a identidade genérica "SmolLM".
 * Os controles são removidos pelo próprio template antes da inferência.
 */
export const FLOOR10_MODEL: Readonly<Floor10ModelDef> = Object.freeze({
    label: 'SmolLM3-3B',
    disableThinking: true,
    systemTemplateFlags: '/system_override /no_think',
    url: (globalThis as { __npcModelUrl?: string }).__npcModelUrl
        ?? HF('ggml-org/SmolLM3-3B-GGUF', 'SmolLM3-Q4_K_M.gguf'),
});

/** Adapta a persona ao template do Smol sem deixar os controles chegarem à fala. */
export function prepareFloor10SystemPrompt(prompt: string): string {
    return `${FLOOR10_MODEL.systemTemplateFlags}\n${prompt}`;
}

/**
 * Sem isolamento, SharedArrayBuffer/pthreads não estão disponíveis. Com
 * COOP+COEP, segue a estratégia padrão do wllama: metade dos núcleos, até 4.
 * Isso deixa o render/jogo responsivo e evita colocar núcleos de eficiência no
 * caminho crítico. getNumThreads() confirma o total criado pelo runtime.
 */
export function cpuThreadCount(
    isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1,
): number {
    if (!isolated) return 1;
    const detected = Number.isFinite(hardwareConcurrency)
        ? Math.floor(hardwareConcurrency)
        : 1;
    return Math.max(1, Math.min(4, Math.floor(detected / 2)));
}

/**
 * O SmolLM3 tem 36 camadas. Offload de 12 (um terço) acelera o 3B sem repetir
 * o antigo pico de VRAM causado por tentar colocar o modelo inteiro na GPU.
 */
export const SPEECH_WEBGPU_LAYERS = 12;
export const SPEECH_WEBGPU_LOW_MEMORY_LAYERS = 8;

/**
 * Reserva GPU só em aparelhos com memória suficiente. Chrome limita
 * navigator.deviceMemory a valores aproximados; 8 representa o Redmi de 12 GB.
 */
export function speechGpuLayerCount(
    webGpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator,
    deviceMemoryGiB = typeof navigator !== 'undefined'
        ? ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8)
        : 0,
): number {
    // A sonda usa este override para medir CPU pura contra CPU+WebGPU no mesmo
    // aparelho, sem recompilar o jogo.
    const forced = (globalThis as { __npcGpuLayers?: number }).__npcGpuLayers;
    if (typeof forced === 'number' && Number.isFinite(forced)) {
        return Math.max(0, Math.floor(forced));
    }
    if (!webGpuAvailable || !Number.isFinite(deviceMemoryGiB) || deviceMemoryGiB < 6) {
        return 0;
    }
    return deviceMemoryGiB >= 8
        ? SPEECH_WEBGPU_LAYERS
        : SPEECH_WEBGPU_LOW_MEMORY_LAYERS;
}

/**
 * O caminho WebGPU pode ser LENTO em vez de quebrado — e essa é a pior falha
 * possível, porque o `catch` do plano nunca dispara e o jogo fica preso em
 * "carregando" para sempre. Medido nesta caixa: o processo de GPU passou de 17
 * MINUTOS de CPU compilando shaders com o modelo ainda fora da memória, sem
 * lançar um único erro. O cronômetro só começa depois que o DOWNLOAD termina
 * (baixar 1,9 GB no celular é legitimamente demorado); ele cobre apenas a
 * inicialização do backend, que é rápida quando funciona.
 */
export const WEBGPU_INIT_WATCHDOG_MS = 45_000;

/**
 * Na CPU a mesma travada acontece por outro motivo (cota de disco estourada
 * dentro do Worker), e aí não há plano melhor para onde cair — então damos bem
 * mais corda antes de desistir. Abrir um GGUF de 2 GB e aquecer o KV num celular
 * fraco leva um tempo honesto; três minutos parados já são defeito.
 */
export const CPU_INIT_WATCHDOG_MS = 180_000;

export class WebGpuInitTimeoutError extends Error {
    constructor() {
        super('WEBGPU_INIT_TIMEOUT');
        this.name = 'WebGpuInitTimeoutError';
    }
}

/**
 * Reprova o plano de GPU se a inicialização travar depois do download. Só
 * decide com base no tempo PARADO após o download, então nunca interrompe uma
 * carga que ainda esteja progredindo.
 */
export function raceGpuInitWatchdog(
    load: Promise<unknown>,
    stalledMs: () => number | null,
    limitMs = WEBGPU_INIT_WATCHDOG_MS,
    pollMs = 1_000,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const timer = globalThis.setInterval(() => {
            const stalled = stalledMs();
            if (stalled !== null && stalled > limitMs) {
                globalThis.clearInterval(timer);
                reject(new WebGpuInitTimeoutError());
            }
        }, pollMs);
        load.then(
            () => { globalThis.clearInterval(timer); resolve(); },
            (error: unknown) => { globalThis.clearInterval(timer); reject(error); },
        );
    });
}

export function speechRuntimeLabel(gpuLayers: number, threads: number): string {
    const cpu = `CPU×${Math.max(1, Math.floor(threads))}`;
    return gpuLayers > 0 ? `WebGPU×${gpuLayers} + ${cpu}` : cpu;
}

export const STREAM_WATCHDOG = Object.freeze({
    // O PREFILL de um prompt grande (~1000+ tokens) na CPU do celular passava
    // dos 150s antigos e o watchdog matava o 3B TRABALHANDO ("parou de
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

// Tira qualquer bloco de raciocínio que um template híbrido ainda devolva.
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
        // Assim que QUALQUER chunk chega (mesmo raciocínio oculto do template),
        // passamos a medir só INATIVIDADE entre chunks. Antes, enquanto a fala
        // visível não começava, o prazo absoluto de first-token corria mesmo com
        // o modelo emitindo <think> — e o LLM "parava de responder" trabalhando.
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

let loadedDisableThinking = false;
let currentEngine: WllamaInstance | null = null;
let activeModelUrl = '';
let loadedThreads = 1;
let loadedGpuLayers = 0;
let webGpuDisabledForSession = false;
let modulePromise: Promise<WllamaModule> | null = null;
let transitionPromise: Promise<WllamaInstance> | null = null;

/** Falha de ARMAZENAMENTO, não do modelo: merece texto próprio para o jogador. */
export class ModelStorageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ModelStorageError';
    }
}

/**
 * Apaga GGUFs de modelos que não usamos mais. Cada troca de cérebro deixava o
 * anterior parado no cache; como o navegador dá uma cota fixa por site, o
 * modelo novo deixava de caber e o wllama rebaixava tudo a cada sessão.
 */
async function pruneStaleModels(mod: WllamaModule, keepUrl: string): Promise<void> {
    try {
        const probe = new mod.Wllama(WLLAMA_PATHS, { suppressNativeLog: true }) as WllamaInstance & {
            cacheManager?: {
                list: () => Promise<CachedEntry[]>;
                deleteMany: (p: (e: CachedEntry) => boolean) => Promise<void>;
            };
        };
        const cache = probe.cacheManager;
        if (!cache) return;
        const entries = await cache.list();
        const keep = [keepUrl, SMALL_BRAIN_MODEL.url];
        const liberavel = reclaimableBytes(entries, keep);
        if (liberavel <= 0) return;
        await cache.deleteMany((entry) => isForeignModel(entry, keep));
        npcSet({ loadText: `liberando ${formatGB(liberavel)} de modelos antigos…` });
    } catch { /* limpeza é oportunista: nunca pode impedir a carga */ }
}

async function teardownEngine(engine: WllamaInstance | null = currentEngine): Promise<void> {
    if (engine === currentEngine) {
        currentEngine = null;
        activeModelUrl = '';
        loadedDisableThinking = false;
        loadedThreads = 1;
        loadedGpuLayers = 0;
        floor10ModelCoordinator.markUnloaded('conversation');
    }
    try { await engine?.exit?.(); } catch { /* worker já morreu */ }
}

floor10ModelCoordinator.register('conversation', () => teardownEngine());

function initConversationEngine(): Promise<WllamaInstance> {
    const model = FLOOR10_MODEL;

    if (currentEngine && activeModelUrl === model.url) return Promise.resolve(currentEngine);
    if (transitionPromise) return transitionPromise;

    npcSet({
        phase: 'loading',
        modelLabel: `${model.label} · detectando aceleração`,
        loadText: `preparando ${model.label} localmente…`,
        loadProgress: 0,
        error: '',
    });

    const pending = (async () => {
        try {
            if (typeof navigator !== 'undefined') {
                void (navigator as unknown as {
                    storage?: { persist?: () => Promise<boolean> };
                }).storage?.persist?.().catch(() => undefined);
            }
        } catch { /* persistência é só uma otimização */ }

        modulePromise ??= import(/* @vite-ignore */ WLLAMA_ESM) as unknown as Promise<WllamaModule>;
        const mod = await modulePromise;

        // Antes de gastar 1,9 GB de dados: cabe? Modelos de versões anteriores
        // continuavam ocupando a cota e eram a causa mais provável do "baixa
        // tudo de novo toda hora" — limpar devolve o espaço sem custo nenhum.
        await pruneStaleModels(mod, model.url);
        const modelBytes = await probeModelBytes(model.url);
        const cachePlan = planModelCache(await readStorageEstimate(), modelBytes);
        if (!cachePlan.ok) {
            throw new ModelStorageError(cachePlan.message);
        }

        const threads = cpuThreadCount();
        const requestedGpuLayers = webGpuDisabledForSession
            ? 0
            : speechGpuLayerCount();
        const plans = requestedGpuLayers > 0
            ? [requestedGpuLayers, 0]
            : [0];
        let lastError: unknown = new Error('Nenhum backend local disponível');

        for (const gpuLayers of plans) {
            const runtime = speechRuntimeLabel(gpuLayers, threads);
            npcSet({
                modelLabel: `${model.label} · ${runtime}`,
                loadText: `carregando ${model.label} (${runtime})…`,
                loadProgress: 0,
            });

            let candidate: WllamaInstance | null = null;
            // Marca o instante em que o download acabou. Enquanto for null, o
            // cão de guarda do WebGPU nem começa a contar.
            let downloadDoneAt: number | null = null;
            try {
                // Em jogo o log nativo do llama.cpp só polui o console; na
                // bancada ele é a ÚNICA janela para saber em que etapa a carga
                // travou (abrir o GGUF, montar o KV, aquecer…).
                candidate = new mod.Wllama(WLLAMA_PATHS, {
                    suppressNativeLog: !(globalThis as { __npcVerboseLlama?: boolean })
                        .__npcVerboseLlama,
                });
                const loadTask = candidate.loadModelFromUrl(model.url, {
                    ...CPU_LOAD_CONFIG,
                    n_threads: threads,
                    n_gpu_layers: gpuLayers,
                    progressCallback: (progress: { loaded?: number; total?: number }) => {
                        const fraction = progress.total
                            ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                            : 0;
                        const acabou = fraction >= 1;
                        downloadDoneAt = acabou ? (downloadDoneAt ?? Date.now()) : null;
                        npcSet({
                            loadProgress: fraction,
                            // Depois de 100% o wllama ainda lê o arquivo de volta do
                            // cache e copia ~2 GB para dentro do WASM — e nesse
                            // trecho ele não reporta NADA. Medido na sonda: minutos
                            // parados em "100%", que é exatamente a tela travada que
                            // o jogador vê. Trocar o texto não acelera, mas para de
                            // mentir que acabou.
                            loadText: acabou
                                ? `instalando ${model.label} na memória… (só na primeira vez)`
                                : `preparando ${model.label}… ${Math.round(fraction * 100)}%`,
                        });
                    },
                });
                // O cão de guarda vale para OS DOIS planos. Na CPU o travamento
                // medido foi o pior de todos: o Worker levantou QuotaExceeded,
                // não conseguiu devolver o erro por postMessage (DOMException
                // não é clonável) e a promessa nunca resolveu NEM rejeitou —
                // "carregando" eterno, sem uma linha de erro. Passar batido por
                // isso é o que fazia o jogador esperar 300s por nada.
                await raceGpuInitWatchdog(
                    loadTask,
                    () => (downloadDoneAt === null ? null : Date.now() - downloadDoneAt),
                    gpuLayers > 0 ? WEBGPU_INIT_WATCHDOG_MS : CPU_INIT_WATCHDOG_MS,
                );
                loadedDisableThinking = model.disableThinking;
                const confirmedThreads = candidate.getNumThreads?.();
                loadedThreads = Number.isFinite(confirmedThreads) && (confirmedThreads ?? 0) > 0
                    ? Math.min(4, Math.floor(confirmedThreads as number))
                    : threads;
                loadedGpuLayers = gpuLayers;
                activeModelUrl = model.url;
                currentEngine = candidate;
                npcSet({
                    phase: 'ready',
                    modelLabel: `${model.label} · ${speechRuntimeLabel(loadedGpuLayers, loadedThreads)}`,
                    loadText: 'pronto',
                    loadProgress: 1,
                });

                return candidate;
            } catch (error) {
                lastError = error;
                // Encerrar o Worker é o que realmente mata o trabalho de GPU em
                // curso. Se ele estiver ocupado demais para responder, seguimos
                // adiante: esperar aqui recriaria a travada que acabamos de sair.
                await Promise.race([
                    Promise.resolve(candidate?.exit?.()).catch(() => undefined),
                    new Promise<void>((resolve) => { globalThis.setTimeout(resolve, 3_000); }),
                ]);
                if (gpuLayers > 0) {
                    webGpuDisabledForSession = true;
                    npcSet({
                        loadText: error instanceof WebGpuInitTimeoutError
                            ? 'WebGPU travou na inicialização; seguindo pela CPU…'
                            : 'WebGPU não coube; retomando pela CPU sem trocar o modelo…',
                        loadProgress: 0,
                    });
                }
            }
        }
        throw lastError;
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
            loadedDisableThinking = false;
            loadedThreads = 1;
            loadedGpuLayers = 0;
            modulePromise = null;
            npcSet({
                phase: 'error',
                speaking: false,
                streaming: '',
                // Espaço em disco e travamento têm CONSERTO do lado do jogador;
                // dizer só "falha ao carregar" escondia isso.
                error: error instanceof ModelStorageError
                    ? `Sem espaço para o ${model.label}: ${error.message}`
                    : error instanceof WebGpuInitTimeoutError
                        ? `O ${model.label} travou ao iniciar e foi interrompido. `
                          + 'Tente falar com ele de novo.'
                        : `Falha ao carregar ${model.label} localmente: ${
                            error instanceof Error ? error.message : String(error)
                        }. Nenhum outro modelo foi ativado.`,
            });
            throw error;
        },
    );
    transitionPromise = tracked;
    return tracked;
}

/**
 * O coordenador serializa somente as cargas. MiniCPM e SmolLM3 podem ficar
 * residentes ao mesmo tempo; a geração pequena é pausada durante uma fala.
 */
function loadConversationBrain(): Promise<WllamaInstance> {
    return floor10ModelCoordinator.activate('conversation', initConversationEngine);
}

/**
 * Carrega E aquece a persona. É o caminho de QUEM SE APROXIMA (abrir o painel),
 * nunca o de quem já está falando: uma instância do wllama atende uma geração
 * por vez, e disparar o aquecimento junto da fala real fez as duas brigarem —
 * medido, a resposta saiu picotada ("OiNilo Azevedo…") e sem ganho de tempo.
 */
export function initLLM(): Promise<WllamaInstance> {
    return loadConversationBrain().then((engine) => {
        void prewarmPersona(engine);
        return engine;
    });
}

let prewarmAbort: AbortController | null = null;
let personaPrewarmed = false;

/** Cancela o aquecimento: a fala do jogador tem prioridade sobre ele. */
export function abortPersonaPrewarm(): void {
    prewarmAbort?.abort();
    prewarmAbort = null;
}

/**
 * Lê a persona UMA vez, logo depois da carga, enquanto o jogador ainda está
 * andando até o Nilo. Com `cache_prompt` ligado, o KV desse prefixo fica
 * guardado e a primeira fala real deixa de pagar ~390 tokens de prefill.
 *
 * Medido: prefill de 3 tok/s → esses 390 tokens custavam ~130s de espera antes
 * da PRIMEIRA palavra. Aqui esse custo sai da frente do jogador.
 *
 * `max_tokens: 1` porque só interessa o prefill; a fala gerada é descartada e
 * nunca chega ao histórico.
 */
async function prewarmPersona(engine: WllamaInstance): Promise<void> {
    if (personaPrewarmed) return;
    personaPrewarmed = true;
    const abort = new AbortController();
    prewarmAbort = abort;
    npcSet({ loadText: 'aquecendo a memória do Nilo…' });
    try {
        const stream = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: prepareFloor10SystemPrompt(FLOOR10_STABLE_PREFIX) },
                { role: 'user', content: 'oi' },
            ],
            ...CHAT_COMPLETION_CONFIG,
            max_tokens: 1,
            abortSignal: abort.signal,
            ...(loadedDisableThinking
                ? { chat_template_kwargs: { enable_thinking: false } }
                : {}),
        });
        for await (const _chunk of stream) { if (abort.signal.aborted) break; }
        if (!abort.signal.aborted) npcSet({ loadText: 'pronto' });
    } catch {
        // Falhar aqui não custa nada: a fala real só ficará mais lenta.
        personaPrewarmed = false;
    } finally {
        if (prewarmAbort === abort) prewarmAbort = null;
    }
}

export function unloadConversationBrain(): Promise<void> {
    return floor10ModelCoordinator.release('conversation');
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking' || npc.phase === 'loading') return;

    // O aquecimento existe para ganhar tempo, não para roubá-lo: se o jogador
    // falou, ele para na hora. O que já entrou no cache de KV continua valendo.
    abortPersonaPrewarm();

    // Perguntas factuais dos olhos e da vontade preservam as falas rápidas que
    // dão personalidade às micro-IAs. Um possível pedido corporal sempre vai
    // ao 3B, pois só a decisão verbal dele pode virar ação na Utility AI.
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

    // Só pausa o Mini quando o Smol realmente vai gerar. O runtime e os pesos
    // de 688 MB permanecem residentes, então a autonomia retoma sem recarga.
    abortDeliberation();

    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({
        history,
        phase: 'loading',
        loadText: 'liberando a CPU para a conversa…',
        streaming: '',
        speaking: false,
        error: '',
        modelLabel: `${FLOOR10_MODEL.label} · ${speechRuntimeLabel(loadedGpuLayers, loadedThreads)}`,
    });

    let engine: WllamaInstance;
    // Só CARREGA. Aquecer agora seria disputar o modelo com a própria fala.
    try { engine = await loadConversationBrain(); } catch { return; }

    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    const systemPrompt = prepareFloor10SystemPrompt(
        buildFloor10SystemPrompt(
            text,
            history,
            npc.perception,
            npc.autonomy,
        ),
    );
    // Memória curta de propósito: as últimas 2 trocas (4 mensagens). Histórico
    // longo inchava o prefill e fazia o 3B "fixar" num tema. O essencial do
    // personagem vive na persona, não no histórico.
    const groundedHistory = groundedModelHistory(history, 4);

    // Toda tentativa usa o mesmo 3B. Se a validação detectar uma contradição,
    // o próprio 3B recebe uma única chance de revisar; não há frase pronta nem
    // outro modelo respondendo no lugar dele.
    let teardownAfterTimeout: Promise<void> | null = null;
    const firstTokenMs = loadedThreads > 1
        ? STREAM_WATCHDOG.firstTokenMultiMs
        : STREAM_WATCHDOG.firstTokenSingleMs;
    const nextTokenMs = loadedThreads > 1
        ? STREAM_WATCHDOG.nextTokenMultiMs
        : STREAM_WATCHDOG.nextTokenSingleMs;
    const generateWithMainModel = async (
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
            ...(loadedDisableThinking
                ? { chat_template_kwargs: { enable_thinking: false } }
                : {}),
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
                        npcSet({
                            modelLabel:
                                `${FLOOR10_MODEL.label} · `
                                + `${speechRuntimeLabel(loadedGpuLayers, loadedThreads)} · ${measured}`,
                        });
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
            visibleText(await generateWithMainModel(
                systemPrompt,
                isFloor10IdentityQuestion(text)
                    ? { temperature: 0.3, top_p: 0.8, top_k: 30 }
                    : {},
            )),
        );
        let finalText = languageDecision.visibleReply;
        let replyIssue = floor10ReplyIssue(finalText, text, npc.perception);
        if (replyIssue) {
            npcSet({ streaming: `O ${FLOOR10_MODEL.label} está revisando a consistência…` });
            const correctionPrompt = buildFloor10CorrectionPrompt(systemPrompt, replyIssue);
            languageDecision = parseFloor10WillLanguageDecision(
                text,
                visibleText(await generateWithMainModel(correctionPrompt, {
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

        // Se a fala começou, ela pertence ao 3B e pode ser preservada desde que
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
            if (loadedGpuLayers > 0) webGpuDisabledForSession = true;
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

// ── GANCHO DE DEPURAÇÃO ────────────────────────────────────────────────────
// Expõe estado e ações do NPC no console. Serve para dirigir a conversa de fora
// (sondas headless, teste manual) sem precisar caminhar até o NPC no mundo 3D,
// e para inspecionar fase, etiqueta e histórico enquanto ele responde.
//   __npcDebug.npc        estado vivo do NPC
//   __npcDebug.open()     abre a conversa
//   __npcDebug.send('oi') manda uma mensagem
if (typeof window !== 'undefined') {
    (window as unknown as { __npcDebug?: unknown }).__npcDebug = {
        npc,
        npcSet,
        sendToNpc,
        initLLM,
        open: () => npcSet({ open: true, near: true }),
        send: (text: string) => void sendToNpc(text),
    };
}
