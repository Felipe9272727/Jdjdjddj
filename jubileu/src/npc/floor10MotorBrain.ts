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
import {
    FLOOR10_TENTATIVAS,
    conferirModeloCarregado,
    ehFalhaTransitoria,
    esperar,
    esperaDaTentativa,
    textoDaTentativa,
    vigiarInatividade,
} from './floor10Carga';
import { floor10Fila, FILA_MOTOR } from './floor10Fila';
import { baixarSemSubir, type CofreDeModelos } from './floor10Roteamento';
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
import { anotar } from './floor10CaixaPreta';
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
// AQUI EXISTIA `FLOOR10_MOTOR_LOAD_TIMEOUT_MS = 180_000`, com o comentário
// "download emperrado não pode bloquear todas as deliberações da sessão". A
// intenção estava certa; o instrumento, não. Download LENTO não é download
// emperrado, e um teto sobre o tempo TOTAL não sabe a diferença: 386 MB a
// 1,5 MB/s (4G comum) levam 257s, e o teto matava aos 180s — a 70% — um
// download que estava andando. Quem reprova agora é o teto de INATIVIDADE de
// floor10Carga.ts, que emperrado reprova em 2min e andando não reprova nunca.
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
/**
 * O engine que está TRADUZINDO agora. Mesmo defeito do cérebro pequeno: o
 * `abortSignal` do wllama só faz o JS parar de ler, e este worker continuava
 * gerando junto da fala. Sem esta referência não havia o que encerrar.
 */
let translatingEngine: MotorInstance | null = null;
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
    tentativa = 0,
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
        // `travou` separa as duas causas de aborto que chegam aqui como o MESMO
        // AbortError: o vigia (a carga morreu — vale tentar de novo) e quem
        // chamou/a fala (preempção — repetir seria desobedecer).
        let travou = false;
        const vigia = vigiarInatividade(() => { travou = true; controller.abort(); });
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
                    vigia.avancou();
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
                    floor10Fila.progresso(FILA_MOTOR, amostra);
                    npcSet({
                        motorDownload: amostra,
                        motorLoadProgress: fraction,
                        motorLoadText:
                            `baixando ${FLOOR10_MOTOR_MODEL.label} · `
                            + downloadLine(amostra),
                    });
                },
            }), controller.signal);
            // VEIO MODELO OU VEIO CASCA? Ver floor10Carga: um GGUF truncado
            // faz a carga RESOLVER com nVocab/nLayer zerados e só estoura na
            // primeira tradução, longe daqui e sem conserto possível.
            await conferirModeloCarregado(engine);
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
                return ensureMotorEngine(parentSignal, false, tentativa);
            }
            // REDE CAIU ≠ MOTOR INDISPONÍVEL. O OPFS guarda o que já desceu, e
            // a tentativa seguinte CONTINUA de onde parou em vez de recomeçar
            // os 386 MB. Só não se insiste quando quem abortou foi a fala: aí o
            // motor deve mesmo sair da frente.
            if (
                (travou || !controller.signal.aborted)
                && tentativa + 1 < FLOOR10_TENTATIVAS
                && (travou || ehFalhaTransitoria(falha))
            ) {
                const espera = esperaDaTentativa(tentativa + 1);
                npcSet({
                    motorPhase: 'loading',
                    motorDownload: DOWNLOAD_ZERO,
                    motorLoadText: textoDaTentativa(
                        FLOOR10_MOTOR_MODEL.label,
                        tentativa + 1,
                        espera,
                    ),
                });
                enginePromise = null;
                await esperar(espera, travou ? parentSignal : controller.signal);
                if (parentSignal?.aborted) return null;
                if (!travou && controller.signal.aborted) return null;
                return ensureMotorEngine(parentSignal, recoverBrokenCache, tentativa + 1);
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
            vigia.parar();
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
    translatingEngine = engine;
    anotar('motor:traduzindo');
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
        if (translatingEngine === engine) translatingEngine = null;
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

/**
 * SÓ BAIXA o tradutor, sem traduzir nada. Ver a nota em `precarregarVontade`:
 * sem uma porta assim, este modelo só começava a descer no primeiro pensamento
 * a traduzir — e a fila ficava eternamente em "2 de 3".
 */
/**
 * BAIXA E PARA POR AÍ. Mesmo desenho de `baixarVontade`, mesma razão: a etapa
 * da fila não pode subir um llama.cpp enquanto o jogador usa o chat. Construir
 * a instância não abre Worker — ele nasce em `loadModelFromUrl`.
 */
export async function baixarMotor(): Promise<boolean> {
    if (residentEngine) return true;
    try {
        const backend = await probeModelStorageBackend();
        if (!backend.ok) return false;
        const plano = planModelCache(await readStorageEstimate(), FLOOR10_MOTOR_MODEL.bytes);
        if (!plano.ok) {
            npcSet({
                motorPhase: 'unavailable',
                motorLoadText: `${FLOOR10_MOTOR_MODEL.label} não cabe: ${plano.message}`,
            });
            return false;
        }
        const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as
            Promise<{ Wllama: MotorCtor }>);
        const cofre = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
        medidorMotor.reset();
        npcSet({ motorPhase: 'loading', motorDownload: DOWNLOAD_ZERO });
        const baixou = await baixarSemSubir(
            (cofre as { cacheManager?: CofreDeModelos }).cacheManager,
            FLOOR10_MOTOR_MODEL.url,
            (loaded, total) => {
                const amostra = medidorMotor.push(loaded, total);
                floor10Fila.progresso(FILA_MOTOR, amostra);
                npcSet({
                    motorDownload: amostra,
                    motorLoadProgress: total ? Math.min(1, loaded / total) : 0,
                    motorLoadText:
                        `baixando ${FLOOR10_MOTOR_MODEL.label} · ${downloadLine(amostra)}`,
                });
            },
        );
        try { await (cofre as { exit?: () => Promise<void> }).exit?.(); } catch { /* nada subiu */ }
        if (!baixou) return false;
        npcSet({
            motorPhase: 'off',
            motorLoadProgress: 1,
            motorLoadText: `${FLOOR10_MOTOR_MODEL.label} no aparelho · em espera`,
        });
        anotar('motor:no-aparelho');
        return true;
    } catch (erro) {
        anotar('motor:download-falhou', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
        return false;
    }
}

export async function precarregarMotor(): Promise<boolean> {
    const engine = await floor10ModelCoordinator.activate(
        'deliberation',
        () => ensureMotorEngine(),
    );
    return engine !== null;
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
    // Encerra também quem está TRADUZINDO — só o abort deixaria este worker
    // gerando em cima da fala. Os 640 MB do Qwen continuam no OPFS; a próxima
    // tradução reabre o runtime lendo do disco, sem baixar nada.
    const traduzindo = translatingEngine;
    translatingEngine = null;
    if (traduzindo) {
        anotar('motor:preemptado');
        terminate(traduzindo);
        enginePromise = null;
    }
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
