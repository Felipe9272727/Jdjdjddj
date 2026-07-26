// ── O CÉREBRO PEQUENO — deliberação em segundo plano ──────────────────────
// Instância própria do wllama com o MiniCPM5-1B (688 MB). Não conversa com o
// jogador: recebe o estado do mundo em inglês estruturado e devolve a intenção
// do Nilo. Roda sem limite de tokens porque ninguém está esperando por ela — o
// reflexo (Utility AI) continua dirigindo o corpo enquanto isto pensa.
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

/** Fixo por projeto: metade dos oito núcleos do aparelho-alvo. */
export const SMALL_BRAIN_THREADS = 4;

export const SMALL_BRAIN_LOAD_CONFIG = Object.freeze({
    // Mantido largo para memória futura e para preservar o contrato já usado.
    n_ctx: 4096,
    n_batch: 512,
    n_threads: SMALL_BRAIN_THREADS,
    n_gpu_layers: 0,
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    warmup: true,
});

export const SMALL_BRAIN_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    // O teto continua ilimitado, conforme o desenho original. A gramática e o
    // modo no-think fazem a resposta terminar naturalmente após a escolha.
    max_tokens: -1,
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

/**
 * Interrompe a deliberação em curso. O 3B da conversa tem PRIORIDADE ABSOLUTA:
 * sem isto, uma deliberação sem teto de tokens continuava queimando CPU depois
 * de o jogador mandar mensagem, e os dois modelos disputavam os mesmos núcleos
 * — foi o que travou a resposta por mais de 370s no aparelho do Felipe.
 */
export function abortDeliberation(): void {
    currentAbort?.abort();
    currentAbort = null;
    if (npc.deliberationPhase === 'thinking' || npc.deliberationPhase === 'loading') {
        npcSet({ deliberationPhase: 'off' });
    }
}

/**
 * TIRA O CÉREBRO PEQUENO DA MEMÓRIA. Um modelo por vez, sempre.
 *
 * Manter os dois residentes somava 688 MB + 1,93 GB ≈ 2,6 GB numa aba de
 * celular. Acima de ~1,5-2 GB o navegador entra em pressão de memória e a
 * inferência despenca — foi o que derrubou a leitura para ~1,5 tok/s e deixou
 * a resposta sem chegar em 286s. Abortar a deliberação libera CPU, mas só
 * descarregar libera a MEMÓRIA, que era o gargalo real.
 *
 * O arquivo continua em cache no navegador: recarregar depois é rápido e não
 * baixa nada de novo.
 */
async function disposeSmallBrainEngine(): Promise<void> {
    abortDeliberation();
    if (disposePromise) {
        await disposePromise;
        return;
    }

    const pending = enginePromise;
    enginePromise = null;
    npcSet({ deliberationPhase: 'off' });

    const task = (async () => {
        try {
            const engine = await pending;
            await engine?.exit?.();
        } catch { /* já morreu; o que importa é a memória voltar */ }
    })();
    disposePromise = task;
    try {
        await task;
    } finally {
        if (disposePromise === task) disposePromise = null;
    }
}

floor10ModelCoordinator.register('deliberation', disposeSmallBrainEngine);

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
        npcSet({ deliberationPhase: 'loading' });
        try {
            try {
                if (typeof navigator !== 'undefined') {
                    await (navigator as unknown as {
                        storage?: { persist?: () => Promise<boolean> };
                    }).storage?.persist?.();
                }
            } catch { /* cache persistente é só uma otimização */ }
            const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: SmallCtor }>);
            const engine = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
            await engine.loadModelFromUrl(SMALL_BRAIN_MODEL.url, SMALL_BRAIN_LOAD_CONFIG);
            return engine;
        } catch {
            // Sem memória, sem rede ou modelo incompatível: o reflexo segue só.
            npcSet({ deliberationPhase: 'unavailable' });
            return null;
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
    return npc.open || npc.phase === 'thinking' || npc.phase === 'loading';
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
            await floor10ModelCoordinator.release('deliberation');
            return null;
        }
        // Se o jogador começou a falar enquanto o modelo carregava, desiste
        // agora: a conversa vem primeiro.
        if (conversationHasPriority()) return null;
        npcSet({ deliberationPhase: 'thinking' });
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
                deliberationGoal: decided.goal,
                deliberationCount: npc.deliberationCount + 1,
            });
        }
        return decided;
    } catch {
        return null;
    } finally {
        inFlight = false;
        currentAbort = null;
    }
}

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    abortDeliberation();
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
}
