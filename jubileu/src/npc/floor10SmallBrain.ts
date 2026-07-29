// ── O CÉREBRO PEQUENO — deliberação em segundo plano ──────────────────────
// Instância própria do wllama com o MiniCPM5-1B (688 MB). Não conversa com o
// jogador: recebe o estado do mundo em inglês estruturado e devolve a intenção
// do Nilo. A saída é curta e presa por gramática; o reflexo (Utility AI)
// continua dirigindo o corpo enquanto isto pensa.
//
// Tudo aqui é OPCIONAL por construção: se o aparelho não tiver memória para o
// segundo modelo, a carga falha em silêncio e o Nilo segue com o reflexo. O
// jogo nunca depende desta camada para funcionar.
import {
    DELIBERATION_EXTRACT_TOKENS,
    DELIBERATION_GRAMMAR,
    DELIBERATION_SYSTEM_PROMPT,
    DELIBERATION_TIMEOUT_MS,
    buildChoiceExtractionPrompt,
    buildDeliberationPrompt,
    looksLikeLoop,
    parseDeliberation,
    type DeliberationMemory,
    type Floor10Deliberation,
} from './floor10Deliberation';
import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives } from './floor10Will';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { npc, npcSet } from './npcStore';
import {
    chunkDelta, chunkOpensReply, cpuThreadCount, type ChatChunk,
} from './wllamaEngine';

const WLLAMA_V = '3.5.1';
// Mesmos overrides do cérebro de fala. Sem eles o cérebro PEQUENO era
// impossível de testar fora da internet aberta: runtime e modelo estavam
// fixos, e a deliberação simplesmente nunca rodava numa caixa fechada — o que
// escondia justamente os defeitos de loop e de travamento que ele pode ter.
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

export const SMALL_BRAIN_MODEL = Object.freeze({
    label: 'MiniCPM5-1B',
    url: (globalThis as { __smallBrainModelUrl?: string }).__smallBrainModelUrl
        ?? 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf',
});

/**
 * DOIS núcleos, e não metade da máquina.
 *
 * Eu subi para metade das threads da fala depois de ver, na sala da mente, uma
 * rodada morrer no teto sem produzir um token. Só que medi isso numa caixa de 4
 * núcleos, onde "metade" continuava sendo 2 — ou seja, não medi nada. No
 * celular do Felipe, com a fala em 8, virou 8 + 4 = 12 threads disputando 8
 * núcleos, e a conversa passou a travar em "liberando a CPU".
 *
 * A deliberação não tem pressa: ela roda em segundo plano, num ciclo de 60s, e
 * ninguém espera por ela. A fala do jogador tem. Então quem cede é esta.
 */
export const SMALL_BRAIN_THREADS = 2;

export function smallBrainThreads(): number {
    return Math.min(SMALL_BRAIN_THREADS, Math.max(1, cpuThreadCount()));
}

/**
 * Teto de tokens do pensamento. É ELE que torna o loop eterno impossível — não
 * a mordaça que havia antes. Mesmo que o modelo comece a girar, ele para aqui,
 * e o texto circular é descartado por looksLikeLoop.
 */
export const SMALL_BRAIN_THINK_TOKENS = 320;

// n_threads é resolvido na CARGA, não aqui: depende do aparelho.
export const SMALL_BRAIN_LOAD_CONFIG = Object.freeze({
    // Precisa caber o estado do mundo (~300) MAIS o raciocínio (~320). Com 1024
    // o pensamento batia no teto do contexto e saía truncado.
    n_ctx: 2048,
    n_batch: 256,
    n_gpu_layers: 0,
    jinja: true,
    // Esta flag NÃO liga nem desliga o pensamento — e, medido no navegador, ela
    // também não decide por qual canal ele chega: com `reasoning: false` o
    // llama.cpp continuou entregando o raciocínio em `reasoning_content`, com
    // `content` nulo. Eu já culpei esta linha pelas rodadas de zero token; a
    // culpa era do LEITOR, corrigido em chunkPensamento/readCompletionText.
    // Fica falsa por ser o comportamento medido e estável.
    //
    // Quem liga o pensamento é enable_thinking, logo abaixo.
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: true }),
    warmup: true,
});

export const SMALL_BRAIN_COMPLETION_CONFIG = Object.freeze({
    stream: false,
    // Espaço para pensar de verdade, com fim garantido.
    max_tokens: SMALL_BRAIN_THINK_TOKENS,
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    // Janela LONGA de propósito: com 64 o modelo podia repetir um parágrafo
    // inteiro sem penalidade, que é exatamente a cara de um loop de pensamento.
    penalty_repeat: 1.15,
    penalty_last_n: 256,
    cache_prompt: true,
    // SEM gramática: ela forçava uma linha só e tornava o raciocínio impossível.
    chat_template_kwargs: Object.freeze({ enable_thinking: true }),
});

/**
 * A PASSADA DE RESGATE. Só roda quando o pensamento livre terminou sem uma
 * escolha legível; nunca no lugar dele.
 *
 * Aqui a gramática é bem-vinda: não há nada para pensar, o pensamento já
 * aconteceu e está na tela. Esta chamada existe para não jogar fora um
 * raciocínio bom por causa de formatação — o modelo relê o que escreveu e
 * assina. Custa ~16 tokens contra os 320 da primeira passada.
 *
 * enable_thinking desligado SÓ AQUI, e sem contradição com "o Nilo pensa": a
 * gramática já obriga o primeiro token a ser "CHOICE:", então pensar nesta
 * chamada seria impossível de qualquer jeito — desligar apenas evita que o
 * template injete um bloco de raciocínio que morreria vazio.
 */
export const SMALL_BRAIN_EXTRACT_CONFIG = Object.freeze({
    stream: false,
    max_tokens: DELIBERATION_EXTRACT_TOKENS,
    // Determinístico: não é criação, é leitura do que ele já decidiu.
    temperature: 0,
    grammar: DELIBERATION_GRAMMAR,
    cache_prompt: true,
    chat_template_kwargs: Object.freeze({ enable_thinking: false }),
});

/** Teto próprio do resgate: 16 tokens presos por gramática não demoram. */
export const DELIBERATION_EXTRACT_TIMEOUT_MS = 45_000;

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
let loadAbort: AbortController | null = null;
let loadingEngine: SmallInstance | null = null;

export const SMALL_BRAIN_HANDOFF_TIMEOUT_MS = 3_000;

function abortError(): Error {
    const error = new Error('MiniCPM load aborted for conversation');
    error.name = 'AbortError';
    return error;
}

/** Faz qualquer etapa de carga devolver o controle assim que a conversa chega. */
export function raceWithAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
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

function terminateSmallEngine(engine: SmallInstance | null): void {
    if (!engine?.exit) return;
    try {
        void Promise.resolve(engine.exit()).catch(() => undefined);
    } catch { /* worker já encerrou */ }
}

/**
 * Interrompe a deliberação em curso. O 3B da conversa tem PRIORIDADE ABSOLUTA:
 * sem isto, uma deliberação continuava queimando CPU depois de o jogador mandar
 * mensagem, e os dois modelos disputavam os mesmos núcleos — foi o que travou a
 * resposta por mais de 370s no aparelho do Felipe. O runtime não é descarregado.
 */
export function abortDeliberation(): void {
    const interruptedDownload = npc.deliberationPhase === 'loading';
    const pausedInference = npc.deliberationPhase === 'thinking';
    currentAbort?.abort();
    currentAbort = null;
    loadAbort?.abort();
    const loading = loadingEngine;
    loadingEngine = null;
    terminateSmallEngine(loading);
    if (npc.deliberationPhase === 'thinking' || npc.deliberationPhase === 'loading') {
        npcSet({
            deliberationPhase: 'off',
            deliberationLoadText: interruptedDownload
                ? 'download interrompido para dar prioridade à conversa'
                : pausedInference
                    ? 'modelo em cache · CPU liberada para a conversa'
                    : npc.deliberationLoadText,
        });
    }
}

/**
 * Descarga de emergência/encerramento. No fluxo normal o Mini fica residente:
 * abortDeliberation pausa apenas a geração para o Smol falar e preserva pesos,
 * Worker e cache KV. Esta função continua disponível para aparelhos que
 * realmente não comportem os dois runtimes.
 */
async function disposeSmallBrainEngine(): Promise<void> {
    abortDeliberation();
    if (disposePromise) {
        await disposePromise;
        return;
    }

    const pending = enginePromise;
    enginePromise = null;
    npcSet({
        deliberationPhase: 'off',
        deliberationLoadText: npc.deliberationLoadProgress >= 1
            ? 'modelo em cache · descarregado por limite de memória'
            : npc.deliberationLoadText,
    });

    const task = (async () => {
        const cleanup = Promise.resolve(pending)
            .then((engine) => engine?.exit?.())
            .catch(() => undefined);
        // O wllama encerra o Worker imediatamente. Este limite protege a
        // conversa até de um Promise antigo que tenha ficado órfão no browser.
        await Promise.race([
            cleanup,
            new Promise<void>((resolve) => {
                globalThis.setTimeout(resolve, SMALL_BRAIN_HANDOFF_TIMEOUT_MS);
            }),
        ]);
    })();
    disposePromise = task;
    try {
        await task;
    } finally {
        if (disposePromise === task) disposePromise = null;
    }
}

floor10ModelCoordinator.register(
    'deliberation',
    disposeSmallBrainEngine,
    abortDeliberation,
);

/** Pede ao coordenador para retirar o cérebro pequeno da memória. */
export function unloadSmallBrain(): Promise<void> {
    abortDeliberation();
    npcSet({ deliberationPhase: 'off' });
    return floor10ModelCoordinator.release('deliberation');
}

/**
 * O PENSAMENTO NÃO VEM PELO CANAL DO TEXTO.
 *
 * Visto cru no navegador, pedaço por pedaço: o llama.cpp separa o raciocínio do
 * MiniCPM e o entrega em `delta.reasoning_content`, enquanto `delta.content`
 * chega NULO. Como o leitor só olhava `content`, cada rodada terminava com ZERO
 * token e texto vazio — 128s de CPU queimada para devolver nada. Era isto que
 * aparecia no aparelho do Felipe: 172s, 66s, 245s, todas sem uma palavra.
 *
 * Eu tinha atribuído isso à flag `reasoning` da carga e a desliguei; a sonda
 * mostrou que o canal separado continua vindo do mesmo jeito. Então a correção
 * não é brigar com a flag, é LER OS DOIS CANAIS — que é o que o Felipe pediu de
 * qualquer forma: ver o raciocínio interno dele, não só a conclusão.
 */
export function chunkPensamento(chunk: unknown): string {
    const delta = (chunk as {
        choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
    } | null)?.choices?.[0]?.delta;
    if (typeof delta?.reasoning_content === 'string') return delta.reasoning_content;
    return chunkDelta(chunk as ChatChunk);
}

/** Texto da resposta, tolerando os formatos que o wllama já devolveu. */
export function readCompletionText(response: unknown): string {
    if (typeof response === 'string') return response;
    const record = response as {
        choices?: Array<{
            message?: { content?: string | null; reasoning_content?: string | null };
            text?: string;
        }>;
        content?: string;
    } | null;
    const fromChoices = record?.choices?.[0];
    // Mesmo canal separado da versão em stream: sem juntar os dois, a decisão
    // que ele assina DEPOIS de pensar chega sozinha e sem justificativa — ou não
    // chega nada.
    const raciocinio = fromChoices?.message?.reasoning_content;
    const conteudo = fromChoices?.message?.content;
    if (typeof raciocinio === 'string' && raciocinio.trim()) {
        return typeof conteudo === 'string' && conteudo.trim()
            ? `${raciocinio}\n${conteudo}`
            : raciocinio;
    }
    if (typeof conteudo === 'string') return conteudo;
    if (typeof fromChoices?.text === 'string') return fromChoices.text;
    if (typeof record?.content === 'string') return record.content;
    return '';
}

/** Carrega o cérebro pequeno uma única vez; falha vira null, nunca exceção. */
function ensureSmallEngine(): Promise<SmallInstance | null> {
    enginePromise ??= (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        let engine: SmallInstance | null = null;
        npcSet({
            deliberationPhase: 'loading',
            deliberationLoadText: `verificando o cache do ${SMALL_BRAIN_MODEL.label}…`,
            deliberationLoadProgress: 0,
        });
        try {
            try {
                if (typeof navigator !== 'undefined') {
                    void (navigator as unknown as {
                        storage?: { persist?: () => Promise<boolean> };
                    }).storage?.persist?.().catch(() => undefined);
                }
            } catch { /* cache persistente é só uma otimização */ }
            const mod = await raceWithAbort(
                import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: SmallCtor }>,
                controller.signal,
            );
            engine = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
            loadingEngine = engine;
            const loadTask = engine.loadModelFromUrl(SMALL_BRAIN_MODEL.url, {
                ...SMALL_BRAIN_LOAD_CONFIG,
                n_threads: smallBrainThreads(),
                // O wllama usa `signal` no download; raceWithAbort também cobre
                // a abertura do cache e a inicialização do Worker/WASM.
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    const fraction = progress.total
                        ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                        : 0;
                    npcSet({
                        deliberationLoadProgress: fraction,
                        deliberationLoadText:
                            `baixando ${SMALL_BRAIN_MODEL.label}… ${Math.round(fraction * 100)}%`,
                    });
                },
            });
            // Se o cancelamento venceu a corrida enquanto o wllama terminava
            // uma etapa interna, encerra qualquer Worker que apareça depois.
            void loadTask.then(
                () => {
                    if (controller.signal.aborted) terminateSmallEngine(engine);
                },
                () => undefined,
            );
            await raceWithAbort(loadTask, controller.signal);
            if (controller.signal.aborted) {
                terminateSmallEngine(engine);
                return null;
            }
            npcSet({
                deliberationLoadProgress: 1,
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · iniciando vontade`,
            });
            return engine;
        } catch (falha) {
            terminateSmallEngine(engine);
            // Sem memória, sem rede ou modelo incompatível: o reflexo segue só.
            //
            // O MOTIVO precisa aparecer. Sem ele, uma falha instantânea no
            // GitHub Pages virou "não foi possível carregar" e nada mais — e a
            // primeira suspeita (URL errada do modelo) estava errada, o arquivo
            // existe. Engolir a causa custou uma volta inteira de investigação.
            if (!controller.signal.aborted) {
                const motivo = falha instanceof Error
                    ? `${falha.name}: ${falha.message}`
                    : String(falha);
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText:
                        `não foi possível carregar ${SMALL_BRAIN_MODEL.label} — ${motivo.slice(0, 200)}`,
                });
            }
            return null;
        } finally {
            if (loadAbort === controller) loadAbort = null;
            if (loadingEngine === engine) loadingEngine = null;
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
    // O Mini pode formar intenções com o painel aberto, enquanto o jogador
    // pensa no que escrever. Ele só para durante carga/geração real do Smol.
    return npc.phase === 'thinking' || npc.phase === 'loading';
}

/**
 * Segunda passada: devolve a linha "CHOICE: x" tirada do raciocínio que o modelo
 * acabou de escrever. Devolve '' se falhar — o resgate nunca pode derrubar a
 * rodada, ele só tenta salvá-la.
 */
export async function assinarEscolha(
    engine: SmallInstance,
    pensamento: string,
    signal?: AbortSignal,
): Promise<string> {
    const controller = new AbortController();
    const herdar = () => controller.abort();
    if (signal?.aborted) return '';
    signal?.addEventListener('abort', herdar, { once: true });
    const relogio = globalThis.setTimeout(
        () => controller.abort(),
        DELIBERATION_EXTRACT_TIMEOUT_MS,
    );
    try {
        const response = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                { role: 'user', content: buildChoiceExtractionPrompt(pensamento) },
            ],
            ...SMALL_BRAIN_EXTRACT_CONFIG,
            abortSignal: controller.signal,
        });
        return readCompletionText(response);
    } catch {
        return '';
    } finally {
        globalThis.clearTimeout(relogio);
        signal?.removeEventListener('abort', herdar);
    }
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
            const unavailable = npc.deliberationPhase === 'unavailable';
            const unavailableText = npc.deliberationLoadText;
            await floor10ModelCoordinator.release('deliberation');
            if (unavailable) {
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText: unavailableText,
                });
            }
            return null;
        }
        // Se o jogador começou a falar enquanto o modelo carregava, desiste
        // agora: a conversa vem primeiro.
        if (conversationHasPriority()) return null;
        npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 1,
            deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · escolhendo uma intenção`,
        });
        currentAbort = new AbortController();
        const abort = currentAbort;
        // TETO DE TEMPO. Sem ele, um worker preso deixava esta promessa pendente
        // para sempre; como `inFlight` só é liberado no finally, o livre-arbítrio
        // morria calado pelo resto da sessão. Agora a rodada é abandonada e a
        // próxima tenta de novo.
        const relogio = globalThis.setTimeout(() => abort.abort(), DELIBERATION_TIMEOUT_MS);
        let response: unknown;
        try {
            response = await engine.createChatCompletion({
                messages: [
                    { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: buildDeliberationPrompt(input.perception, input.drives, input.memory),
                    },
                ],
                ...SMALL_BRAIN_COMPLETION_CONFIG,
                abortSignal: abort.signal,
            });
        } finally {
            globalThis.clearTimeout(relogio);
        }
        const texto = readCompletionText(response);
        // Cadeia de pensamento girando no lugar: a gramática limita QUAIS
        // palavras saem, não quantas vezes. Descartar aqui evita alimentar o
        // corpo com uma "decisão" tirada de um texto em círculo.
        if (looksLikeLoop(texto)) {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} se enrolou; vai tentar de novo`,
            });
            return null;
        }
        let decided = parseDeliberation(texto, input.now);
        // RESGATE. O raciocínio saiu, mas sem a linha final legível. Em vez de
        // descartar o que ele pensou, pedimos só a assinatura — presa por
        // gramática, ~16 tokens. O pensamento continua sendo o da primeira
        // passada; o que entra aqui é a última linha, e ela é anexada ao texto
        // para que a justificativa lida depois continue vindo do raciocínio.
        if (!decided && texto.trim() && !conversationHasPriority()) {
            const assinatura = await assinarEscolha(engine, texto, abort.signal);
            if (assinatura) decided = parseDeliberation(`${texto}\n${assinatura}`, input.now);
        }
        if (decided) {
            npcSet({
                deliberationPhase: 'decided',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto no cache`,
                deliberationGoal: decided.goal,
                deliberationCount: npc.deliberationCount + 1,
            });
        } else {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · tentando outra ideia`,
            });
        }
        return decided;
    } catch {
        if (npc.deliberationPhase !== 'unavailable') {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · deliberação pausada`,
            });
        }
        return null;
    } finally {
        inFlight = false;
        currentAbort = null;
    }
}

export type PensamentoAoVivo = {
    raw: string;
    decided: Floor10Deliberation | null;
    loop: boolean;
    ms: number;
    tokens: number;
    erro: string | null;
    /** Assinatura da segunda passada, quando o pensamento livre não decidiu. */
    resgate?: string | null;
};

/**
 * Deliberação OBSERVÁVEL, para a sala da mente.
 *
 * Em jogo a saída é presa por gramática e não transmitida: só interessa a meta.
 * Isso esconde exatamente aquilo que precisamos vigiar — se o modelo pequeno
 * entra em cadeia de pensamento circular. Aqui dá para desligar a gramática e
 * ver o texto CRU nascendo token a token, que é onde um loop aparece.
 *
 * Não substitui deliberateFloor10: é instrumento de observação, não o caminho
 * que o jogo usa.
 */
export async function deliberarObservando(
    input: DeliberateInput,
    opts: {
        useGrammar: boolean;
        maxTokens: number;
        onToken: (parcial: string) => void;
        /**
         * Teto próprio da observação. O do jogo (60s) existe para uma rodada
         * PRESA não matar o livre-arbítrio; aqui ele atrapalhava o oposto —
         * cortava antes do primeiro token e não sobrava raciocínio nenhum para
         * olhar, que é o motivo de a sala existir.
         */
        timeoutMs?: number;
        /** Cada pedaço cru do stream, para diagnosticar texto embaralhado. */
        onChunk?: (chunk: unknown) => void;
    },
): Promise<PensamentoAoVivo> {
    const comecou = Date.now();
    const engine = await floor10ModelCoordinator.activate('deliberation', ensureSmallEngine);
    if (!engine) {
        return {
            raw: '', decided: null, loop: false, ms: Date.now() - comecou, tokens: 0,
            erro: npc.deliberationLoadText || `não foi possível carregar ${SMALL_BRAIN_MODEL.label}`,
        };
    }
    npcSet({ deliberationPhase: 'thinking' });
    const abort = new AbortController();
    const teto = opts.timeoutMs ?? DELIBERATION_TIMEOUT_MS;
    const relogio = globalThis.setTimeout(() => abort.abort(), teto);
    let raw = '';
    let tokens = 0;
    try {
        const stream = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: buildDeliberationPrompt(input.perception, input.drives, input.memory),
                },
            ],
            ...SMALL_BRAIN_COMPLETION_CONFIG,
            stream: true,
            max_tokens: opts.maxTokens,
            // Sem gramática o modelo fica livre — é assim que se vê um loop.
            ...(opts.useGrammar ? {} : { grammar: undefined }),
            abortSignal: abort.signal,
        }) as AsyncIterable<unknown>;
        for await (const chunk of stream) {
            opts.onChunk?.(chunk);
            const c = chunk as ChatChunk;
            // Mesmo vazamento do cérebro de fala: os restos da rodada anterior
            // vêm na frente. Sem descartar, "CHOICE: idle" chegava como
            // "OSE: idleCHO" e a decisão era perdida.
            if (chunkOpensReply(c)) { raw = ''; tokens = 0; opts.onToken(raw); }
            const pedaco = chunkPensamento(c);
            if (pedaco) { raw += pedaco; tokens += 1; opts.onToken(raw); }
        }
    } catch (e) {
        return {
            raw, decided: null, loop: looksLikeLoop(raw), ms: Date.now() - comecou, tokens,
            erro: abort.signal.aborted
                ? `cortado pelo teto de ${teto / 1000}s`
                : String(e).slice(0, 160),
        };
    } finally {
        globalThis.clearTimeout(relogio);
        npcSet({ deliberationPhase: 'off' });
    }
    let decided = parseDeliberation(raw, input.now);
    // Mesmo resgate do jogo, visível aqui de propósito: a sala da mente existe
    // para mostrar o que acontece de verdade, inclusive a segunda passada.
    let resgate: string | null = null;
    if (!decided && !opts.useGrammar && raw.trim() && !looksLikeLoop(raw)) {
        resgate = (await assinarEscolha(engine, raw)) || null;
        if (resgate) decided = parseDeliberation(`${raw}\n${resgate}`, input.now);
    }
    return {
        raw,
        decided,
        loop: looksLikeLoop(raw),
        ms: Date.now() - comecou,
        tokens,
        erro: null,
        resgate,
    };
}

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    abortDeliberation();
    floor10ModelCoordinator.markUnloaded('deliberation');
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
    loadAbort = null;
    loadingEngine = null;
}
