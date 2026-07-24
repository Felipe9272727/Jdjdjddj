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
    buildDeliberationPrompt,
    parseDeliberation,
    type DeliberationMemory,
    type Floor10Deliberation,
} from './floor10Deliberation';
import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives } from './floor10Will';
import { npc, npcSet } from './npcStore';

const WLLAMA_V = '3.5.1';
const CDN = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

export const SMALL_BRAIN_MODEL = Object.freeze({
    label: 'MiniCPM5-1B',
    url: 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf',
});

export const SMALL_BRAIN_LOAD_CONFIG = Object.freeze({
    // Ele delibera longo: precisa de espaço para o raciocínio inteiro caber.
    n_ctx: 4096,
    n_batch: 512,
    n_gpu_layers: 0,
});

export const SMALL_BRAIN_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    // SEM teto de tokens: com limite ele nunca conclui (fica deliberando e a
    // resposta é cortada no meio). Solto, ele termina sozinho e assina a
    // escolha. Medido no modelo real.
    max_tokens: -1,
    temperature: 0.6,
    top_p: 0.9,
    penalty_repeat: 1.15,
    cache_prompt: false,
});

type SmallInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<unknown>;
    exit?: () => Promise<void> | void;
};
type SmallCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => SmallInstance;

let enginePromise: Promise<SmallInstance | null> | null = null;
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
function ensureSmallEngine(threads: number): Promise<SmallInstance | null> {
    enginePromise ??= (async () => {
        npcSet({ deliberationPhase: 'loading' });
        try {
            const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: SmallCtor }>);
            const engine = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
            await engine.loadModelFromUrl(SMALL_BRAIN_MODEL.url, {
                ...SMALL_BRAIN_LOAD_CONFIG,
                n_threads: threads,
            });
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
    threads?: number;
};

/**
 * Uma rodada de deliberação. Devolve null se o cérebro pequeno não estiver
 * disponível, se já houver uma rodada em curso ou se ele não assinar escolha.
 */
export async function deliberateFloor10(
    input: DeliberateInput,
): Promise<Floor10Deliberation | null> {
    if (inFlight) return null;
    inFlight = true;
    try {
        const engine = await ensureSmallEngine(input.threads ?? 1);
        if (!engine) return null;
        // Se o jogador começou a falar enquanto o modelo carregava, desiste
        // agora: a conversa vem primeiro.
        if (npc.open || npc.phase === 'thinking') return null;
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
    enginePromise = null;
    inFlight = false;
}
