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
    trimToCompleteSentence,
    groundedModelHistory,
    guardedStreamingText,
    isFloor10IdentityQuestion,
    type Floor10ReplyIssue,
} from './floor10Canon';
import { answerFloor10PerceptionQuestion } from './floor10Perception';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { abortDeliberation } from './floor10SmallBrain';
import { smallBrainUrls } from './floor10Brains';
import { DownloadMeter, DOWNLOAD_ZERO } from './floor10Download';
import {
    CACHE_HEADROOM,
    deleteCachedModel,
    isBrokenModelCacheError,
    planModelCache,
    probeModelBytes,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { floor10Gpu, FpsSampler, probeWebGpuAdapter } from './floor10Gpu';
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
    // ── O KV EM 8 BITS ────────────────────────────────────────────────────
    // Num celular a fala não é limitada por conta, é limitada por BANDA DE
    // MEMÓRIA: cada token gerado relê os pesos e o cache de atenção inteiros.
    // Guardar o KV em q8_0 em vez de f16 corta pela metade os bytes desse
    // cache, e o que economiza banda vira velocidade direta.
    //
    // Medido no navegador com o SmolLM3-3B de verdade (4 threads): fala de
    // 2,2 → 2,5 tok/s, +15%. Não é o dobro, mas é de graça e não muda uma
    // vírgula do que ele responde — a perda de precisão do KV em 8 bits é
    // irrelevante num contexto de 1536 tokens.
    //
    // `flash_attn` foi medido junto e NÃO ajudou nada nesta build WASM
    // (0,99×); fica de fora para não pagar risco por zero.
    cache_type_k: 'q8_0',
    cache_type_v: 'q8_0',
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
    // 64 cortava a fala no meio da palavra no celular do Felipe. Medido: passar
    // de 2 para 4 threads dobra a velocidade (fala 2→3 tok/s, espera 84s→42s),
    // e é essa folga que paga o orçamento maior. O modelo continua mirando 1–2
    // frases pela persona; este teto é só a margem para FECHAR a última delas,
    // não um convite para divagar (penalty_repeat + corte na frase completa
    // seguram o resto).
    max_tokens: 96,
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
 * Sem isolamento, SharedArrayBuffer/pthreads não estão disponíveis.
 *
 * Foram três regras até esta, e cada mudança veio de MEDIÇÃO, não de teoria:
 * metade dos núcleos (teto 4) → ~3/4 (teto 6) → todos (teto 8).
 *
 * Eu tinha guardado folga para o render e para o MiniCPM, e supus que os
 * núcleos de eficiência de um celular big.LITTLE atrapalhariam. O Felipe mediu
 * no aparelho dele, de 1 a 8, e 8 ganhou — a folga que eu reservava só estava
 * deixando o jogador esperando. Quem tem o aparelho mede melhor que quem
 * teoriza sobre ele.
 *
 * getNumThreads() confirma o total realmente criado pelo runtime, e o seletor
 * da bancada permite refazer essa medição em qualquer aparelho.
 */
export const MAX_SPEECH_THREADS = 8;

/**
 * Número de threads escolhido À MÃO e guardado no aparelho.
 *
 * Existe porque a regra automática não tem como acertar sozinha: num celular
 * big.LITTLE o llama.cpp divide o trabalho IGUALMENTE entre as threads, então a
 * mais lenta segura cada token — e colocar núcleos de eficiência no lote pode
 * DEIXAR MAIS LENTO. Medido: nesta caixa (núcleos iguais) 2→4 threads dobrou a
 * velocidade; no celular do Felipe 4→6 não mudou nada. Sem saber quantos
 * núcleos rápidos o aparelho tem — e o navegador não conta —, o único caminho
 * honesto é medir no próprio aparelho e fixar o vencedor.
 */
export const SAVED_THREADS_KEY = 'floor10-threads';

export function readSavedThreads(): number | null {
    try {
        const raw = globalThis.localStorage?.getItem(SAVED_THREADS_KEY);
        const n = raw ? Number(raw) : Number.NaN;
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    } catch {
        return null;
    }
}

export function saveThreads(threads: number | null): void {
    try {
        if (threads === null) globalThis.localStorage?.removeItem(SAVED_THREADS_KEY);
        else globalThis.localStorage?.setItem(SAVED_THREADS_KEY, String(Math.max(1, threads)));
    } catch { /* sem localStorage: segue com a regra automática */ }
}

export function cpuThreadCount(
    isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1,
): number {
    const forced = (globalThis as { __npcThreads?: number }).__npcThreads
        ?? readSavedThreads();
    if (typeof forced === 'number' && Number.isFinite(forced) && forced > 0) {
        return Math.max(1, Math.floor(forced));
    }
    if (!isolated) return 1;
    const detected = Number.isFinite(hardwareConcurrency)
        ? Math.floor(hardwareConcurrency)
        : 1;
    return Math.max(1, Math.min(MAX_SPEECH_THREADS, detected));
}

/**
 * O SmolLM3 tem 36 camadas. Offload de 12 (um terço) acelera o 3B sem repetir
 * o antigo pico de VRAM causado por tentar colocar o modelo inteiro na GPU.
 */
export const SPEECH_WEBGPU_LAYERS = 12;
export const SPEECH_WEBGPU_LOW_MEMORY_LAYERS = 8;

/**
 * A GPU voltou — mas AGORA COM GERENTE, e é isso que muda tudo.
 *
 * O desligamento anterior estava certo para o que existia na época: 12 de 36
 * camadas, fixas, sem ninguém olhando o resultado. Isso travava o aparelho do
 * dono do jogo. A causa não era memória: o jogo desenha na MESMA GPU, o
 * trabalho da LLM entope a fila de submissão e o render perde o prazo do
 * quadro (arXiv 2501.14794). O mesmo trabalho mostra a saída — mandar só uma
 * PARTE PEQUENA das camadas mantém o FPS intacto e custa 0,5–2,2% de
 * velocidade.
 *
 * Então o que liga aqui não é o offload antigo: é `floor10Gpu`, que começa em
 * 3 camadas (~8% do modelo), mede tokens/s e FPS no aparelho de quem joga, e
 * VOLTA SOZINHO para a CPU se qualquer um dos dois piorar. O requisito do dono
 * do jogo — "não diminuir a velocidade atual" — está codificado como regra de
 * recuo, não como esperança.
 */
export const SPEECH_WEBGPU_ENABLED = true;

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
    if (!SPEECH_WEBGPU_ENABLED) return 0;
    if (!webGpuAvailable || !Number.isFinite(deviceMemoryGiB) || deviceMemoryGiB < 6) {
        return 0;
    }
    // QUEM DECIDE É O GERENTE, não uma tabela de memória.
    //
    // A regra antiga ("8 GB ou mais → 12 camadas") olhava só o tamanho da RAM,
    // que não diz nada sobre a briga entre a LLM e o render pela fila da GPU —
    // e era justamente essa briga que travava o aparelho. O gerente olha o que
    // importa: os tokens/s e o FPS medidos ali, naquele celular.
    //
    // O teto de memória continua valendo como porta: abaixo de 6 GB nem começa.
    return Math.min(floor10Gpu.layersForLoad(), SPEECH_WEBGPU_LAYERS);
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
    // `role` só aparece no pedaço que ABRE uma resposta — é o marco que separa
    // esta geração dos restos da anterior.
    choices?: Array<{ delta?: { content?: string | null; role?: string } }>;
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
 * Este pedaço ABRE uma resposta nova?
 *
 * O stream do wllama entrega, no começo de uma geração, os restos da geração
 * ANTERIOR — vistos crus na sala da mente: um `content` solto e um
 * `finish_reason: "stop"` chegando ANTES do primeiro pedaço real. Foi isso que
 * transformou "CHOICE: idle" em "OSE: idleCHO" e emendou falas do Nilo
 * ("eu possa.O hotel…"). Eu tinha culpado o teto de tokens; era vazamento.
 *
 * A convenção OpenAI marca a abertura com `delta.role`. Ao vê-la, tudo o que
 * veio antes é lixo da rodada passada e deve ser descartado.
 */
export function chunkOpensReply(chunk: ChatChunk): boolean {
    return typeof chunk.choices?.[0]?.delta?.role === 'string';
}

/**
 * Resume as medições para a etiqueta da UI. Sem isto só dava para ADIVINHAR a
 * velocidade do aparelho; agora o número na tela é o que o motor mediu.
 */
/**
 * A partir daqui a taxa de leitura significa alguma coisa. Abaixo disso o
 * tempo medido é quase todo custo fixo da chamada, não trabalho de verdade.
 */
export const TIMINGS_MIN_PROMPT_N = 24;

/**
 * A "leitura 2 tok/s" que assustou o dono do jogo era UM ARTEFATO DA CONTA.
 *
 * Medido no navegador: com `cache_prompt` ligado, a segunda fala reaproveitou
 * 376 dos ~380 tokens do prompt. Sobraram 4 tokens para processar, e 4 tokens
 * divididos pelo custo fixo da chamada dão "2 tok/s" — um número que parece
 * catastrófico e na verdade é o oposto: significa que a leitura foi de graça.
 *
 * Uma etiqueta que transforma o melhor caso possível no pior número da tela é
 * pior que etiqueta nenhuma; foi ela que mandou a gente caçar um problema que
 * não existia. Agora a taxa só aparece quando há prompt de verdade para ler, e
 * o que é reaproveitado aparece como o que é: trabalho economizado.
 */
export function formatTimings(timings: ChatTimings | null): string {
    if (!timings) return '';
    const parts: string[] = [];
    const lidos = typeof timings.prompt_n === 'number' ? timings.prompt_n : 0;
    const reusados = typeof timings.cache_n === 'number' ? timings.cache_n : 0;
    if (
        lidos >= TIMINGS_MIN_PROMPT_N
        && typeof timings.prompt_per_second === 'number'
        && timings.prompt_per_second > 0
    ) {
        parts.push(`leitura ${Math.round(timings.prompt_per_second)} tok/s`);
    }
    if (typeof timings.predicted_per_second === 'number' && timings.predicted_per_second > 0) {
        parts.push(`fala ${Math.round(timings.predicted_per_second)} tok/s`);
    }
    if (reusados > 0) parts.push(`${reusados} reaproveitados`);
    if (lidos > 0) parts.push(`${lidos} lidos`);
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
        // Restos da geração anterior chegam ANTES da abertura desta. Jogar fora
        // o que já se acumulou é o que impede a fala nova de nascer emendada na
        // velha (ver chunkOpensReply).
        if (chunkOpensReply(chunk)) { acc = ''; onVisibleText(''); }
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

/** Um por cérebro: o da fala vive aqui, o da vontade no floor10SmallBrain. */
const medidorFala = new DownloadMeter();

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
 * O modelo já está guardado neste navegador?
 *
 * Importa muito: a conta de espaço livre é `cota - em uso`, e o modelo em cache
 * ENTRA no "em uso". Sem esta pergunta, quanto mais pronto o modelo estivesse,
 * menos espaço parecia sobrar — e a checagem recusava carregar um arquivo que
 * já estava baixado e não ia ocupar um byte a mais. Medido no navegador: 2ª
 * sessão com o modelo em cache acusava "só libera 1.38 GB" e travava a carga.
 */
type CacheProbe = WllamaInstance & {
    cacheManager?: {
        list: () => Promise<Array<{ metadata?: { originalURL?: string } }>>;
        delete: (nameOrUrl: string) => Promise<void>;
    };
};

/**
 * UMA instância para todas as perguntas ao cache.
 *
 * Antes cada consulta construía um `new Wllama` — e depois que a fala passou a
 * perguntar "o modelo já está aqui?" a cada ciclo da vontade, e a reciclagem a
 * perguntar por três URLs, isso virava meia dúzia de runtimes WASM criados à
 * toa. Num celular isso é memória que falta justamente na hora de carregar o
 * modelo. Uma só, reaproveitada, responde igual.
 */
let cacheProbe: CacheProbe | null = null;

function probeDoCache(mod: WllamaModule): CacheProbe {
    cacheProbe ??= new mod.Wllama(WLLAMA_PATHS, { suppressNativeLog: true }) as CacheProbe;
    return cacheProbe;
}

async function isModelCached(mod: WllamaModule, url: string): Promise<boolean> {
    try {
        const entries = await probeDoCache(mod).cacheManager?.list();
        return !!entries?.some((e) => e.metadata?.originalURL === url);
    } catch {
        return false;
    }
}

/**
 * A FALA TEM PRIORIDADE SOBRE A VONTADE — no armazenamento também.
 *
 * Os dois cérebros dividem o mesmo cofre do site. Medido no navegador: com o
 * cérebro pequeno já baixado, a cota restante caiu para 1,87 GB e o SmolLM3
 * precisa de 2,07 GB — a fala era recusada e o Nilo emudecia. Era isto o "agr
 * nem falar ele fala".
 *
 * A vontade é opcional por construção (sem ela o Nilo segue no reflexo); a fala
 * não é. Então, e só quando falta espaço PARA A FALA, os pesos da vontade são
 * devolvidos. Nada de varrer o cache por dedução — a lista de URLs é fechada e
 * conhecida, e ela volta sozinha no próximo ciclo de deliberação.
 */
async function reclaimSmallBrains(mod: WllamaModule): Promise<number> {
    let liberados = 0;
    for (const url of smallBrainUrls()) {
        if (!await isModelCached(mod, url)) continue;
        if (await forgetCachedModel(mod, url)) liberados += 1;
    }
    return liberados;
}

/**
 * O cérebro da FALA já está baixado? A vontade pergunta isto antes de gastar
 * 800 MB: quem baixa primeiro fica com o espaço, e não pode ser ela.
 */
export async function speechModelReady(): Promise<boolean> {
    if (currentEngine && activeModelUrl === FLOOR10_MODEL.url) return true;
    try {
        modulePromise ??= import(/* @vite-ignore */ WLLAMA_ESM) as unknown as Promise<WllamaModule>;
        return await isModelCached(await modulePromise, FLOOR10_MODEL.url);
    } catch {
        return false;
    }
}

async function forgetCachedModel(mod: WllamaModule, url: string): Promise<boolean> {
    const probe = probeDoCache(mod);
    return deleteCachedModel(probe.cacheManager, url);
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

    medidorFala.reset();
    npcSet({
        phase: 'loading',
        modelLabel: `${model.label} · detectando aceleração`,
        loadText: `preparando ${model.label} localmente…`,
        loadProgress: 0,
        loadDownload: DOWNLOAD_ZERO,
        error: '',
    });

    const pending = (async () => {
        const backend = await probeModelStorageBackend();
        if (!backend.ok) throw new ModelStorageError(backend.message);

        try {
            if (typeof navigator !== 'undefined') {
                void (navigator as unknown as {
                    storage?: { persist?: () => Promise<boolean> };
                }).storage?.persist?.().catch(() => undefined);
            }
        } catch { /* persistência é só uma otimização */ }

        modulePromise ??= import(/* @vite-ignore */ WLLAMA_ESM) as unknown as Promise<WllamaModule>;
        const mod = await modulePromise;

        // Antes de gastar 1,9 GB de DADOS NOVOS: cabe? Se o modelo já está no
        // cache, não há nada a caber — a pergunta simplesmente não se aplica.
        if (!await isModelCached(mod, model.url)) {
            const modelBytes = await probeModelBytes(model.url);
            let estimativa = await readStorageEstimate();
            // Publica o espaço ANTES de tentar: se não couber, o jogador vê o
            // número que explica, em vez de uma barra que nunca sai do lugar.
            npcSet({
                storage: {
                    quota: estimativa.quota,
                    usage: estimativa.usage,
                    needBytes: Math.ceil((modelBytes ?? 0) * CACHE_HEADROOM),
                },
            });
            let cachePlan = planModelCache(estimativa, modelBytes);
            if (!cachePlan.ok && await reclaimSmallBrains(mod)) {
                // Devolveu os pesos da vontade e refaz a conta: se agora cabe,
                // o jogador fala. A vontade rebaixa sozinha depois.
                estimativa = await readStorageEstimate();
                npcSet({
                    storage: {
                        quota: estimativa.quota,
                        usage: estimativa.usage,
                        needBytes: Math.ceil((modelBytes ?? 0) * CACHE_HEADROOM),
                    },
                });
                cachePlan = planModelCache(estimativa, modelBytes);
            }
            if (!cachePlan.ok) {
                throw new ModelStorageError(cachePlan.message);
            }
        }

        const threads = cpuThreadCount();
        // `'gpu' in navigator` NÃO significa que existe GPU para usar.
        //
        // Medido aqui: neste ambiente `navigator.gpu` existe e
        // `requestAdapter()` devolve null — o wllama registra
        // "ggml_webgpu: Failed to get an adapter" e segue pela CPU em silêncio.
        // Sem esta checagem o gerente creditaria ao degrau "3 camadas" um
        // desempenho que é da CPU pura, e aprenderia a coisa errada sobre o
        // aparelho. Perguntar pelo adaptador de verdade é o que separa
        // "tem a API" de "tem GPU".
        const adaptador = await probeWebGpuAdapter();
        if (!adaptador.ok) floor10Gpu.markUnavailable(adaptador.motivo);
        const requestedGpuLayers = (webGpuDisabledForSession || !adaptador.ok)
            ? 0
            : speechGpuLayerCount();
        const plans = requestedGpuLayers > 0
            ? [requestedGpuLayers, 0]
            : [0];
        let lastError: unknown = new Error('Nenhum backend local disponível');

        // Duas voltas: se a primeira morrer por CACHE QUEBRADO, apagamos o
        // registro do modelo e baixamos limpo. Sem isto o jogador ficava preso
        // para sempre no mesmo erro, porque cada tentativa reencontrava o mesmo
        // registro corrompido — e nada no jogo apagava aquilo.
        for (let tentativa = 0; tentativa < 2; tentativa += 1) {
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
                            // Bytes reais na tela: "412 MB de 1,92 GB · 1,2 MB/s"
                            // responde "está baixando?" — a porcentagem sozinha,
                            // não. Foi a informação que faltou quando o download
                            // parou de acontecer no aparelho do Felipe.
                            loadDownload: medidorFala.push(
                                progress.loaded ?? 0,
                                progress.total ?? 0,
                            ),
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
                // O teto aqui precisa acompanhar MAX_SPEECH_THREADS: preso em 4,
                // a etiqueta mentiria "CPU×4" num aparelho rodando com 6.
                loadedThreads = Number.isFinite(confirmedThreads) && (confirmedThreads ?? 0) > 0
                    ? Math.min(MAX_SPEECH_THREADS, Math.floor(confirmedThreads as number))
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
                    // O gerente precisa saber. Sem isto ele proporia GPU de
                    // novo na próxima carga e o jogador pagaria o mesmo
                    // prejuízo outra vez.
                    floor10Gpu.markLoadFailed(
                        error instanceof Error ? error.name : String(error),
                    );
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
        // Fim de uma volta. Cache quebrado tem conserto; qualquer outra falha
        // não melhora repetindo, então sai na hora.
        if (tentativa === 0 && isBrokenModelCacheError(lastError)) {
            npcSet({
                loadText: `o download anterior de ${model.label} ficou pela metade; baixando de novo…`,
                loadProgress: 0,
            });
            if (!await forgetCachedModel(mod, model.url)) break;
            continue;
        }
        break;
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
        prewarmPromise ??= prewarmPersona(engine);
        return engine;
    });
}

let prewarmPromise: Promise<void> | null = null;
let personaPrewarmed = false;
let personaPrewarmDone = false;

/**
 * Espera o aquecimento acabar — NUNCA o corta.
 *
 * Cortar foi o meu erro: uma instância do wllama atende uma geração por vez, e
 * o `abort` não é por tarefa. Quando o aquecimento já tinha terminado, o corte
 * chegava atrasado e derrubava a geração SEGUINTE, que era a fala do jogador —
 * o `(ABORT)` na PRIMEIRA mensagem, com o painel sem resposta nenhuma.
 *
 * Esperar é seguro e quase de graça: o aquecimento está lendo exatamente o
 * prefixo que a fala real vai reaproveitar, então o trabalho não é jogado fora.
 */
export function settlePersonaPrewarm(): Promise<void> {
    return prewarmPromise?.catch(() => undefined) ?? Promise.resolve();
}

/** Há aquecimento em curso AGORA? Serve para explicar a espera na tela. */
export function personaPrewarmRunning(): boolean {
    return prewarmPromise !== null && !personaPrewarmDone;
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
    npcSet({ loadText: 'aquecendo a memória do Nilo…' });
    try {
        // Sem abortSignal DE PROPÓSITO: ver settlePersonaPrewarm(). Um sinal de
        // cancelamento aqui vazava para a fala seguinte do jogador.
        const stream = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: prepareFloor10SystemPrompt(FLOOR10_STABLE_PREFIX) },
                { role: 'user', content: 'oi' },
            ],
            ...CHAT_COMPLETION_CONFIG,
            max_tokens: 1,
            ...(loadedDisableThinking
                ? { chat_template_kwargs: { enable_thinking: false } }
                : {}),
        });
        for await (const _chunk of stream) { /* só interessa o prefill */ }
        personaPrewarmDone = true;
        npcSet({ loadText: 'pronto' });
    } catch (falha) {
        // ── O AQUECIMENTO É O LUGAR CERTO PARA A GPU FALHAR ───────────────
        // Ele roda na tela de carregamento, com o jogador ainda andando até o
        // Nilo, e exercita exatamente o mesmo caminho de geração que abortou.
        // Descobrir aqui que a GPU não presta custa segundos de carregamento;
        // descobrir na primeira mensagem custa a mensagem — foi o que
        // aconteceu no aparelho do dono do jogo.
        if (loadedGpuLayers > 0) {
            const motivo = falha instanceof Error
                ? `${falha.name}: ${falha.message}`
                : String(falha);
            floor10Gpu.markGenerationFailed(`no aquecimento — ${motivo}`);
            webGpuDisabledForSession = true;
            npcSet({ loadText: 'a GPU não passou no aquecimento; seguindo pela CPU…' });
            // Derruba o motor com GPU. A próxima carga já vem sem ela, porque
            // o gerente e a trava de sessão concordam em zero.
            await teardownEngine(engine).catch(() => undefined);
        }
        // Falhar aqui não custa a fala: no pior caso ela só fica mais lenta.
        personaPrewarmed = false;
        personaPrewarmDone = true;
    }
}

export function unloadConversationBrain(): Promise<void> {
    return floor10ModelCoordinator.release('conversation');
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking' || npc.phase === 'loading') return;

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
    // Deixa o aquecimento TERMINAR antes de gerar. Cancelá-lo derrubava esta
    // fala aqui — era o "(ABORT)" na primeira mensagem. O prefixo que ele está
    // lendo é justamente o que esta geração reaproveita, então não se perde nada.
    //
    // Mas o jogador precisa SABER que é isso. Parado em "liberando a CPU para a
    // conversa…", o painel parecia travado e não dava para distinguir de um
    // defeito — foi assim que este ponto virou "loading infinito" no relato.
    if (personaPrewarmRunning()) {
        npcSet({ loadText: 'terminando de aquecer a memória do Nilo…' });
    }
    await settlePersonaPrewarm();

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
    // Vivem FORA do closure: cada geração reinicia a medição, mas quem entrega
    // a amostra ao gerente é o `finally` desta fala, lá embaixo.
    let quadrosDaVez: FpsSampler | null = null;
    let tpsDaVez = 0;
    const generateWithMainModel = async (
        prompt: string,
        sampling: Partial<{
            temperature: number;
            top_p: number;
            top_k: number;
        }> = {},
    ): Promise<string> => {
        const abort = new AbortController();
        // ── O QUE O GERENTE DE GPU VAI JULGAR ─────────────────────────────
        // O FPS é medido DURANTE a geração, que é exatamente a janela em que a
        // LLM e o render disputam a fila da GPU. Medir fora dela mostraria um
        // jogo liso e esconderia o problema.
        quadrosDaVez = new FpsSampler();
        quadrosDaVez.start();
        tpsDaVez = 0;
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
                    if (typeof timings.predicted_per_second === 'number'
                        && timings.predicted_per_second > 0) {
                        tpsDaVez = timings.predicted_per_second;
                    }
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
        // O `finally` é obrigatório aqui: se a geração estourar o watchdog, é
        // JUSTAMENTE a amostra que o gerente mais precisa ver.
    };

    /** Fecha a medição desta fala e entrega o veredito ao gerente de GPU. */
    const entregarAmostra = () => {
        const fps = quadrosDaVez?.stop() ?? null;
        if (tpsDaVez > 0) {
            floor10Gpu.observe({ layers: loadedGpuLayers, tps: tpsDaVez, fps });
        }
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
            // Entrega só o que ficou inteiro: o teto de tokens cortava a fala no
            // meio da palavra, e o pedaço solto ainda contaminava a mensagem
            // seguinte (".O elevador…", "eu possa.O hotel…").
            history: [...history, { role: 'assistant', content: trimToCompleteSentence(finalText) }],
            streaming: '',
            phase: 'ready',
            speaking: false,
        });
    } catch (error: unknown) {
        if (teardownAfterTimeout) await teardownAfterTimeout;
        const timedOut = error instanceof GenerationTimeoutError;

        // ── A GPU FALHOU ──────────────────────────────────────────────────
        //
        // Aqui já esteve uma tentativa de RECARREGAR e refazer a fala pela CPU
        // dentro deste `catch`. A intenção era boa — a falha não devia custar a
        // mensagem do jogador — mas a execução brigou com o ciclo de vida do
        // motor (coordenador, `transitionPromise`, o teardown do watchdog) e no
        // aparelho do dono do jogo trocou "(ABORT)" por "loadModel() is not yet
        // called", que é pior: um erro interno, sem sentido para quem joga.
        //
        // O que sobrou é o que é seguro e verdadeiro: ensinar o gerente e
        // desligar a GPU. A recarga acontece sozinha na próxima mensagem, pelo
        // caminho normal, que funciona. Menos esperto e mais confiável.
        if (loadedGpuLayers > 0 && !(error instanceof UngroundedNpcReplyError)) {
            const motivo = error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
            floor10Gpu.markGenerationFailed(motivo);
            webGpuDisabledForSession = true;
        }

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
    } finally {
        // SEMPRE. Uma fala que estourou o watchdog com a GPU ligada é a amostra
        // mais valiosa que existe — é ela que denuncia o degrau ruim. Deixar
        // isto só no caminho feliz ensinaria o gerente apenas com os sucessos.
        entregarAmostra();
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
