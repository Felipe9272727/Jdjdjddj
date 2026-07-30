// ── O TRADUTOR MOTOR — terceira LLM, minúscula e especializada ─────────────
// O MiniBrain continua fazendo apenas aquilo em que é bom: pensar livremente.
// Um SmolLM2 de 360M lê o pensamento pronto e o comprime numa instrução motora.
//
// São PESOS e runtime próprios. Ele não reutiliza nem altera o KV cache do
// MiniBrain e nunca gera ao mesmo tempo que ele. Em Q8_0 o arquivo tem 386 MB —
// três vezes menor que o Llama 3.2 1B da vontade, mas longe de ser invisível
// num plano de dados de celular. Por isso ele tem BARRA DE DOWNLOAD PRÓPRIA,
// com os mesmos bytes/velocidade/ETA da barra do 1B.
import {
    DownloadMeter,
    DOWNLOAD_ZERO,
    downloadLine,
    formatBytes,
} from './floor10Download';
import type { F10PrisonState } from './f10Prison';
import {
    FLOOR10_MOTOR_GRAMMAR,
    buildMotorGrammar,
    buildMotorTranslationPrompt,
    parseMotorPlan,
    type Floor10MotorPlan,
} from './floor10MotorCortex';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import {
    deleteCachedModel,
    isBrokenModelCacheError,
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import type { Floor10Perception } from './floor10Perception';
import { npc, npcSet } from './npcStore';
import { cpuThreadCount } from './wllamaEngine';

const WLLAMA_V = '3.5.1';
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM = `${CDN}/wasm/wllama.wasm`;

/**
 * O TRADUTOR, medido no navegador contra o que estava aqui antes.
 *
 * O SmolLM2-360M não estava "repetindo" — estava mandando o Nilo fazer o
 * OPOSTO do que ele pensava. Nos mesmos 6 pensamentos, no mesmo prompt:
 *
 *   "ele está perto demais, preciso de espaço"  → approach|player   ✗
 *   "aquilo sob meu pé zumbiu, não vou sair"    → approach|player   ✗
 *   "a porta do elevador, de outro ângulo"      → approach|player   ✗
 *   "vou andar no lado que nunca confiro"       → approach|player   ✗
 *
 * Quatro de seis viravam "aproximar do jogador". Todo o livre-arbítrio que a
 * deliberação produzia morria neste elo.
 *
 * O Qwen3-0.6B acertou 5 de 5 que respondeu, com nuance real: distinguiu
 * `stay` (ficar parado) de `hold` (manter o peso sobre a placa), que são
 * coisas diferentes na prisão do andar. Custa 253 MB a mais e ~40% mais tempo
 * por tradução (9–11s contra 7s) — e essas ordens nascem em segundo plano,
 * longe da conversa, então o tempo cabe onde a correção não cabia.
 */
export const FLOOR10_MOTOR_MODEL = Object.freeze({
    id: 'qwen3-06b',
    label: 'Motor Qwen3 0.6B',
    url: (globalThis as { __motorBrainModelUrl?: string }).__motorBrainModelUrl
        // Revisão fixa: uma mudança futura em `main` não repete o erro de
        // "Model file not found" que já derrubou o SmolLM3 no celular.
        ?? 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    bytes: 639_446_688,
});

/**
 * O tamanho por extenso, tirado dos bytes DE VERDADE. A tela dizia "105 MB"
 * escrito à mão — o tamanho do 135M que já não é mais usado — enquanto baixava
 * 386 MB. Derivando do campo `bytes`, esse erro não tem como voltar.
 */
export const FLOOR10_MOTOR_SIZE_LABEL = formatBytes(FLOOR10_MOTOR_MODEL.bytes);

/** Duas threads bastam para 360M e evitam outro pico de CPU no telefone. */
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
 * `useCache: false` no wllama não evita o OPFS: ele apenas força baixar tudo
 * novamente. Persistir os 386 MB evita castigar o celular em cada abertura.
 */
export const FLOOR10_MOTOR_USE_CACHE = true;

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
    cacheManager?: {
        delete?: (nameOrUrl: string) => Promise<void>;
    };
    exit?: () => Promise<void> | void;
};
type MotorCtor =
    new (paths: Record<string, string>, cfg?: Record<string, unknown>) => MotorInstance;

/** Medidor próprio: bytes, velocidade e "parado há Ns" só do arquivo do motor. */
const medidorMotor = new DownloadMeter();

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

async function ensureMotorEngine(
    parentSignal?: AbortSignal,
    recoverBrokenCache = true,
): Promise<MotorInstance | null> {
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
        medidorMotor.reset();
        npcSet({
            motorPhase: 'loading',
            motorLoadText: `verificando o cache do ${FLOOR10_MOTOR_MODEL.label}…`,
            motorLoadProgress: 0,
            motorDownload: DOWNLOAD_ZERO,
        });
        let engine: MotorInstance | null = null;
        try {
            const backend = await probeModelStorageBackend();
            if (!backend.ok) throw new Error(backend.message);

            // CABE? O terceiro modelo entra no MESMO cofre dos outros dois, e
            // quando o cofre estoura o Worker levanta QuotaExceededError — um
            // DOMException, que não atravessa o postMessage. A carga então não
            // resolve NEM rejeita: barra parada para sempre, sem explicação.
            // Já aconteceu com a fala e com a vontade; aqui a conta vem antes.
            const plano = planModelCache(
                await readStorageEstimate(),
                FLOOR10_MOTOR_MODEL.bytes,
            );
            if (!plano.ok) {
                npcSet({
                    motorPhase: 'unavailable',
                    motorLoadText:
                        `${FLOOR10_MOTOR_MODEL.label} não cabe: ${plano.message}`,
                });
                enginePromise = null;
                return null;
            }

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
                // Sem isto o wllama rebaixa os 386 MB em toda abertura, embora
                // continue gravando a cópia temporária no mesmo OPFS.
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
                    // Os BYTES, na mesma régua da barra do 1B. "38%" não
                    // distingue um download que anda de um que morreu;
                    // "147 MB de 386 MB · 4,2 MB/s · faltam 57s" distingue.
                    const amostra = medidorMotor.push(
                        progress.loaded ?? 0,
                        progress.total ?? 0,
                    );
                    npcSet({
                        motorDownload: amostra,
                        motorLoadProgress: fraction,
                        motorLoadText:
                            `baixando ${FLOOR10_MOTOR_MODEL.label} · `
                            + downloadLine(amostra),
                    });
                },
            }), controller.signal);
            // ── AQUECIMENTO ───────────────────────────────────────────────
            // Medido: a PRIMEIRA tradução depois da carga estourou o teto de
            // 30s e voltou vazia, enquanto as cinco seguintes ficaram em 9–11s.
            // Não é o modelo ser lento, é a primeira passada pagar cache frio e
            // compilação da gramática. Esse custo tem que cair aqui, ao lado da
            // barra de download — e não sobre o primeiro pensamento de verdade,
            // que é justamente o que o jogador está esperando virar movimento.
            npcSet({
                motorLoadText: `${FLOOR10_MOTOR_MODEL.label} · aquecendo o tradutor…`,
            });
            try {
                await raceWithAbort(engine.createChatCompletion({
                    messages: [{ role: 'user', content: 'MOTION:' }],
                    ...FLOOR10_MOTOR_COMPLETION_CONFIG,
                    max_tokens: 1,
                    abortSignal: controller.signal,
                }), controller.signal);
            } catch { /* falhar aqui só devolve a lentidão da 1ª tradução */ }
            residentEngine = engine;
            npcSet({
                motorPhase: 'translating',
                motorLoadProgress: 1,
                motorLoadText: `${FLOOR10_MOTOR_MODEL.label} pronto · traduzindo`,
            });
            return engine;
        } catch (falha) {
            terminate(engine);
            if (
                !controller.signal.aborted
                && recoverBrokenCache
                && isBrokenModelCacheError(falha)
                && await deleteCachedModel(engine?.cacheManager, FLOOR10_MOTOR_MODEL.url)
            ) {
                npcSet({
                    motorPhase: 'loading',
                    motorLoadProgress: 0,
                    motorDownload: DOWNLOAD_ZERO,
                    motorLoadText:
                        `o cache do ${FLOOR10_MOTOR_MODEL.label} `
                        + 'ficou incompleto; baixando de novo…',
                });
                enginePromise = null;
                return ensureMotorEngine(parentSignal, false);
            }
            if (controller.signal.aborted) {
                // Cortado pela fala ou pelo teto de tempo. A barra para de dizer
                // "baixando" — mas o PROGRESSO fica: ele é a única prova de
                // quanto do arquivo já está no cache.
                npcSet({
                    motorPhase: 'off',
                    motorLoadText:
                        `${FLOOR10_MOTOR_MODEL.label} · download interrompido`,
                });
            } else {
                const motivo = falha instanceof Error
                    ? `${falha.name}: ${falha.message}`
                    : String(falha);
                npcSet({
                    motorPhase: 'unavailable',
                    motorLoadText:
                        `não foi possível carregar ${FLOOR10_MOTOR_MODEL.label} — `
                        + motivo.slice(0, 200),
                });
            }
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
        // coordenador serializa o download de 386 MB contra uma carga da fala;
        // se a fala chegar, o preemptor da deliberação aborta este Worker.
        const engine = await floor10ModelCoordinator.activate(
            'deliberation',
            () => ensureMotorEngine(signal),
        );
        if (!engine || signal?.aborted) return null;
        npcSet({
            motorPhase: 'translating',
            motorLoadText: `${FLOOR10_MOTOR_MODEL.label} · lendo o pensamento`,
        });
        const plan = await translateWithMotorEngine(
            engine, thinking, perception, prison, signal,
        );
        npcSet({
            motorPhase: 'ready',
            motorLoadText: plan
                ? `${FLOOR10_MOTOR_MODEL.label} · ${plan.verb} ${plan.target}`
                : `${FLOOR10_MOTOR_MODEL.label} pronto · sem ordem clara`,
        });
        return plan;
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
    // A barra não pode continuar dizendo "baixando" depois do corte. O
    // progresso permanece: ele mostra quanto do arquivo já está no cache.
    if (npc.motorPhase === 'loading' || npc.motorPhase === 'translating') {
        npcSet({
            motorPhase: 'off',
            motorLoadText: `${FLOOR10_MOTOR_MODEL.label} · interrompido pela fala`,
        });
    }
}

/** Descarga explícita para aparelhos sem memória ou encerramento de testes. */
export async function unloadFloor10MotorBrain(): Promise<void> {
    abortFloor10MotorBrain();
    const pending = enginePromise;
    enginePromise = null;
    const engine = residentEngine ?? (pending ? await pending.catch(() => null) : null);
    residentEngine = null;
    terminate(engine);
    npcSet({ motorPhase: 'off', motorLoadText: '' });
}

export function resetFloor10MotorBrainForTests(): void {
    abortFloor10MotorBrain();
    enginePromise = null;
    residentEngine = null;
    loadingEngine = null;
    inFlight = false;
    npcSet({
        motorPhase: 'off',
        motorLoadText: '',
        motorLoadProgress: 0,
        motorDownload: DOWNLOAD_ZERO,
    });
}
