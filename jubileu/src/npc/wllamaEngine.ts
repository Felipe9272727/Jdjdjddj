// ── O CÉREBRO DO NPC — CPU + WEBGPU ───────────────────────────────────────
// O wllama divide o SmolLM3 entre WebGPU e CPU quando o aparelho comporta; em
// aparelhos menores recua sozinho para CPU/WASM. O modelo fica em cache no
// navegador depois do primeiro download.
//
// O SmolLM3-3B é o cérebro de fala. RAG apenas fornece contexto; olhos e vontade
// continuam sendo micro-IAs independentes, inclusive com suas respostas
// factuais próprias. O MiniCPM delibera, mas nunca fala no lugar do 3B.
import { npc, npcIssueWillCommand, npcSet, type NpcMsg } from './npcStore';
import {
    FLOOR10_STABLE_PREFIX,
    buildFloor10SystemPrompt,
    floor10ReplyIssue,
    arrumarFala,
    groundedModelHistory,
    guardedStreamingText,
    isFloor10IdentityQuestion,
    type Floor10ReplyIssue,
} from './floor10Canon';
import { answerFloor10PerceptionQuestion } from './floor10Perception';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { anotar } from './floor10CaixaPreta';
import {
    cargaRapidaLigada, configuracaoCargaRapida, definirRuntimeFloor10, especulativaLigada,
    parametrosEspeculativos, prepararEspeculativa, runtimeEspecLigado, type Floor10Runtime,
} from './floor10Especulativa';
import { completar, rascunharComReflexo, reagir, reflexoJaCarregado } from './floor10Reflexo';
import { dobrarConversa } from './floor10Compressor';
import { abortDeliberation } from './floor10SmallBrain';
import { lembrarPorSignificado, memoriaJaCarregada } from './floor10Memoria';
import { cachesDescartaveis, urlDoCerebroEscolhido } from './floor10Brains';
import { conferirModeloCarregado, entradaIntacta, type EntradaDoCache } from './floor10Carga';
import { rascunharFala, vontadeJaCarregada } from './floor10SmallBrain';
import { motorJaCarregado, rascunharComMotor } from './floor10MotorBrain';
import { rascunhadorEscolhido } from './floor10Rascunhadores';
import {
    GRAMATICA_DO_REMENDO,
    aplicarRemendos,
    blocoDeRevisao,
    enumerarFrases,
    lerVeredito,
    remendosQueValem,
} from './floor10Remendo';
import { DownloadMeter, DOWNLOAD_ZERO, formatBytes } from './floor10Download';
import {
    CACHE_HEADROOM,
    deleteCachedModel,
    isBrokenModelCacheError,
    planModelCache,
    probeModelBytes,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import {
    floor10Gpu, FpsSampler, layersThatFit, looksCorrupted, probeWebGpuAdapter,
} from './floor10Gpu';
import { floor10Fila, FILA_FALA } from './floor10Fila';
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
/**
 * Quantas mensagens o 3B lê PALAVRA POR PALAVRA. O que fica antes disso é o que
 * o compressor dobra em uma linha — os dois números precisam ser o mesmo, senão
 * o resumo cobriria mensagens que o modelo ainda vai ler inteiras (e ele leria
 * a mesma coisa duas vezes).
 */
export const FLOOR10_HISTORY_VERBATIM = 4;

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
    // ── FOLGA PARA O JOGO CONTINUAR SENDO UM JOGO ─────────────────────────
    //
    // A regra antiga pegava TODOS os núcleos (`min(detected, 8)` = 8 de 8 no
    // celular do Felipe). Isso mediu bem e jogou mal, e o motivo é que a
    // medição olhava tok/s da fala isolada — não o aparelho.
    //
    // Duas coisas que a conta de tok/s não vê:
    //
    // 1. O ggml ESPERA GIRANDO nas barreiras entre os nós do grafo. Thread de
    //    llama.cpp ociosa não dorme: ela ocupa núcleo. Com 8 de 8, não sobra
    //    nada para o render do Three.js, para o compositor do navegador nem
    //    para o sistema — e o que trava não é a fala, é o celular inteiro.
    // 2. Num big.LITTLE o trabalho é dividido IGUALMENTE. O Snapdragon 7s Gen 2
    //    tem 4×A78 e 4×A55; as A55 são muito mais lentas, e como toda barreira
    //    espera a thread mais devagar, as quatro últimas threads atrasam CADA
    //    token além de ocupar os núcleos que faltam para desenhar.
    //
    // Metade dos núcleos, portanto: no 7s Gen 2 isso dá 4, que é exatamente o
    // grupo rápido. E o override manual continua valendo — quem quiser provar
    // que 8 é melhor no próprio aparelho mede pela bancada e fixa.
    // Nunca pedir mais threads do que existe núcleo: num aparelho de 1 ou 2
    // núcleos a folga não cabe, e forçar duas seria o mesmo erro ao contrário.
    const comFolga = Math.min(detected, Math.max(2, Math.floor(detected / 2)));
    return Math.max(1, Math.min(MAX_SPEECH_THREADS, comFolga));
}

/**
 * O SmolLM3 tem 36 camadas. Offload de 12 (um terço) acelera o 3B sem repetir
 * o antigo pico de VRAM causado por tentar colocar o modelo inteiro na GPU.
 */
export const SPEECH_WEBGPU_LAYERS = 12;

/** O SmolLM3-3B Q4_K_M: bytes e camadas, para a conta de quanto cabe na GPU. */
export const SPEECH_MODEL_BYTES = 1_915_305_312;
export const SPEECH_MODEL_LAYERS = 36;
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

/**
 * O N-gram carrega pelo mesmo caminho JSPI do runtime normal, então ele TEM
 * heartbeat: cada leitura do GGUF passa pela thread principal e vira um pulso.
 * O que ele tem a mais é a cauda silenciosa no fim — montar o contexto e o
 * especulador do llama.cpp sem devolver nenhum sinal. Daí a corda maior que a
 * da CPU normal, e ainda assim uma corda: cinco minutos de silêncio absoluto
 * depois da última leitura não são carga, são defeito.
 */
export const NGRAM_CPU_INIT_WATCHDOG_MS = 300_000;

/**
 * Teto absoluto da carga rápida (`?cargarapida`), o ÚNICO caminho sem
 * heartbeat: a cópia OPFS -> HeapFS acontece dentro de uma chamada síncrona no
 * Worker, que não posta nada enquanto roda.
 *
 * Já foi 900 s, e 900 s é o defeito, não o remédio: no aparelho a carga rápida
 * não terminou, o relógio esgotou e só ENTÃO a carga que funciona começou do
 * zero — quinze minutos de tela parada antes da primeira leitura útil. Copiar
 * 1,92 GB do armazenamento para a memória ou anda em poucos minutos ou não vai
 * andar; quatro minutos é o limite entre dar uma chance e roubar a tarde de
 * quem está jogando.
 */
export const NGRAM_CPU_INIT_HARD_LIMIT_MS = 240_000;

export type ModelLoadActivity = {
    stage?: string;
    level?: string;
    message?: string;
    offset?: number;
    size?: number;
    total?: number;
};

const MODEL_LOAD_TRACE_LIMIT = 24;
let modelLoadTraceStartedAt = 0;
let modelLoadTrace: string[] = [];

/** A telemetria detalhada só é ligada na bancada A/B, nunca no jogo normal. */
export function floor10ComparisonDiagnosticsEnabled(
    search = globalThis.location?.search ?? '',
): boolean {
    return /(?:^\?|&)comparacao(?:[=&]|$)/i.test(search);
}

/** Converte os argumentos do logger do wllama em uma linha copiável. */
export function stringifyModelLoadLog(values: readonly unknown[]): string {
    return values.map((value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        try {
            const json = JSON.stringify(value);
            return json === undefined ? String(value) : json;
        } catch {
            return String(value);
        }
    }).join(' ');
}

/**
 * Etapas que chegam em RAJADA: um pulso por bloco do GGUF, centenas por carga.
 * Elas contam como sinal de vida, mas não cabem uma a uma nem no relatório nem
 * na tela — as etapas nativas, essas sim, são poucas e cada uma importa.
 */
export function leituraDoModelo(stage?: string): boolean {
    return stage === 'file-read' || stage === 'opfs-mmap' || stage === 'heapfs-write';
}

/** Texto curto e copiável para mostrar exatamente onde o Worker está. */
export function describeModelLoadActivity(activity: ModelLoadActivity): string {
    if (leituraDoModelo(activity.stage)) {
        const offset = Number.isFinite(activity.offset) ? Math.max(0, activity.offset ?? 0) : 0;
        const size = Number.isFinite(activity.size) ? Math.max(0, activity.size ?? 0) : 0;
        const total = Number.isFinite(activity.total) ? Math.max(0, activity.total ?? 0) : 0;
        const lidos = Math.min(total || Number.POSITIVE_INFINITY, offset + size);
        return total > 0
            ? `GGUF ${formatBytes(lidos)} de ${formatBytes(total)}`
            : `lendo GGUF em ${formatBytes(lidos)}`;
    }
    const message = (activity.message ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    const detail = message.length > 180 ? `${message.slice(0, 177)}…` : message;
    return detail || activity.stage || 'atividade nativa sem detalhe';
}

let ultimaEtapaNaTela = 0;

function resetModelLoadTrace(now = Date.now()): void {
    modelLoadTraceStartedAt = now;
    modelLoadTrace = [];
    ultimaEtapaNaTela = 0;
}

/**
 * As ETAPAS ANTES do modelo entrar em cena — fila dos modelos, buscar o
 * runtime, conferir o cache — não emitiam um sinal sequer.
 *
 * Isso não é detalhe: a bancada mediu 176 s inteiros ali, ANTES de o wllama
 * sequer abrir o worker, e a tela dizia só "carregando". Quando a espera não
 * tem nome, cada rodada de investigação vira palpite; com nome, o próximo
 * print responde sozinho onde o tempo foi parar.
 */
export function publicarEtapaDeCarga(mensagem: string, texto = mensagem): void {
    const now = Date.now();
    rememberModelLoadActivity({ stage: 'etapa', message: mensagem }, now);
    if (now - ultimaEtapaNaTela < 500) return;
    ultimaEtapaNaTela = now;
    npcSet({ loadText: texto });
}

function rememberModelLoadActivity(activity: ModelLoadActivity, now = Date.now()): string {
    const detail = describeModelLoadActivity(activity);
    const elapsed = Math.max(0, now - modelLoadTraceStartedAt) / 1000;
    const kind = leituraDoModelo(activity.stage) ? 'arquivo' : 'nativo';
    modelLoadTrace.push(`${elapsed.toFixed(1)}s · ${kind} · ${detail}`);
    if (modelLoadTrace.length > MODEL_LOAD_TRACE_LIMIT) {
        modelLoadTrace.splice(0, modelLoadTrace.length - MODEL_LOAD_TRACE_LIMIT);
    }
    return detail;
}

/** Snapshot defensivo para a bancada guardar no relatório copiável. */
export function conversationModelLoadTrace(): string[] {
    return [...modelLoadTrace];
}

export class WebGpuInitTimeoutError extends Error {
    constructor() {
        super('WEBGPU_INIT_TIMEOUT');
        this.name = 'WebGpuInitTimeoutError';
    }
}

/**
 * Reprova uma inicialização depois do download por inatividade observável ou,
 * quando informado, por um teto absoluto. O chamador pode devolver `null` em
 * `stalledMs` quando o Worker entra numa região sem heartbeat confiável.
 */
export function raceGpuInitWatchdog(
    load: Promise<unknown>,
    stalledMs: () => number | null,
    limitMs = WEBGPU_INIT_WATCHDOG_MS,
    pollMs = 1_000,
    hardLimit?: { elapsedMs: () => number | null; limitMs: number },
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const timer = globalThis.setInterval(() => {
            const stalled = stalledMs();
            const elapsed = hardLimit?.elapsedMs() ?? null;
            const passouDoTeto = elapsed !== null
                && elapsed > (hardLimit?.limitMs ?? Number.POSITIVE_INFINITY);
            if ((stalled !== null && stalled > limitMs) || passouDoTeto) {
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

/** Quanto tempo a carga está realmente sem dar sinal de vida. */
export function modelInitStalledMs(
    downloadDoneAt: number | null,
    lastActivityAt: number | null,
    now = Date.now(),
): number | null {
    if (downloadDoneAt === null) return null;
    return Math.max(0, now - Math.max(downloadDoneAt, lastActivityAt ?? downloadDoneAt));
}

/**
 * Política explícita, e o critério é UM só: existe heartbeat neste plano?
 *
 * - GPU: o travamento medido foi compilar shaders sem nunca voltar, e nada
 *   naquela região pulsa. Conta o tempo total depois do download.
 * - CPU (normal ou N-gram): a leitura do GGUF passa pela thread principal a
 *   cada bloco, então silêncio ali é silêncio de verdade e pode ser medido.
 * - Carga rápida OPFS: a cópia inteira acontece dentro de uma chamada síncrona
 *   no Worker. Ela não posta nada enquanto trabalha, e chamar isso de travado
 *   seria inventar. Só o teto absoluto do chamador vale nesse caso.
 */
export function modelInitWatchdogStalledMs(
    gpuLayers: number,
    semHeartbeat: boolean,
    downloadDoneAt: number | null,
    lastActivityAt: number | null,
    now = Date.now(),
): number | null {
    if (gpuLayers > 0) return modelInitStalledMs(downloadDoneAt, null, now);
    if (semHeartbeat) return null;
    return modelInitStalledMs(downloadDoneAt, lastActivityAt, now);
}

/**
 * O TETO DO GGUF NESTE RUNTIME: 2 GiB, e é rígido.
 *
 * Medido no Chromium (ver `bancada-navegador/VELOCIDADE.md`), com dois modelos
 * diferentes e o mesmo resultado: o llama.cpp recusa o primeiro tensor cuja
 * data cruza 2^31 com "data is not within the file bounds, model is corrupted
 * or incomplete". O granite-4.0-h-tiny (4,25 GB, MoE) morre em
 * `blk.19.ffn_down_exps.weight`; o PRÓPRIO SmolLM3 em Q8_0 (3,27 GB, denso)
 * morre em `blk.21.ffn_up.weight`. Mesmo modelo, mesma arquitetura, só a
 * quantização muda — logo o limite é o TAMANHO DO ARQUIVO, não o modelo.
 *
 * A wllama documenta a origem no próprio HeapFS: `ftell()` preso em MAX_LONG.
 *
 * Isto existe para o jogador ver o motivo em vez de "modelo corrompido", que
 * manda a pessoa apagar o cache e baixar 2 GB de novo à toa.
 */
export const TETO_GGUF_BYTES = 2 ** 31;

/** Mensagem quando o arquivo passa do teto; string vazia quando cabe. */
export function excedeTetoDoGguf(bytes: number | null): string {
    if (bytes === null || !Number.isFinite(bytes) || bytes <= TETO_GGUF_BYTES) return '';
    return `${formatBytes(bytes)} passa do teto de ${formatBytes(TETO_GGUF_BYTES)}`
        + ' que este runtime consegue abrir. Nenhum aparelho carrega este arquivo —'
        + ' é limite do llama.cpp em WASM, não falta de espaço.';
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

/**
 * O revisor tem pouquíssimo a dizer, e o teto reflete isso.
 *
 * "OK" é um token. Duas frases trocadas cabem folgadamente aqui. Este número é
 * o coração do ganho: o 3B sai de gerar até 96 tokens para gerar quase nenhum.
 */
export const REVISAO_MAX_TOKENS = 72;

/**
 * O desenho pedido pelo dono do jogo: um modelo pequeno rascunha, o 3B decide
 * se serve e — quando não serve — troca SÓ a parte errada.
 *
 * Devolve a fala pronta, ou `null` para dizer "não deu, siga pelo caminho de
 * sempre". Todo `null` daqui é um caminho já testado tomando o lugar; nenhum é
 * uma falha visível para quem joga.
 *
 * O 3B nunca deixa de ser a autoridade: o texto costurado ainda passa por
 * `floor10ReplyIssue` antes de valer, e um rascunho que ele aprovou por engano
 * morre ali como morreria uma fala escrita por ele mesmo.
 */
async function falarRevisando(
    text: string,
    systemPrompt: string,
    groundedHistory: readonly NpcMsg[],
    gerar: (
        prompt: string,
        sampling?: Partial<{ temperature: number; top_p: number; top_k: number }>,
        revisao?: Partial<{ extraUser: string; grammar: string; maxTokens: number }>,
    ) => Promise<string>,
): Promise<string | null> {
    // ── QUEM RASCUNHA, E POR QUE NÃO É "QUEM ESTIVER CARREGADO" ───────────
    //
    // A primeira versão disto chamava o cérebro da VONTADE, e isso não era uma
    // escolha — era o modelo que por acaso estava de pé. O dono do jogo
    // perguntou qual IA rascunha, e a pergunta achou o defeito: o card do
    // LFM2.5, que é a vontade em uso, declara `en, ar, zh, fr, de, ja, ko, es`.
    // Sem português. O Nilo fala português.
    //
    // Agora é escolha explícita, com `?rascunhador=` para comparar os dois no
    // mesmo aparelho. Ver `floor10Rascunhadores.ts` para o que cada card diz.
    const quem = rascunhadorEscolhido();
    if (quem === 'nenhum') return null;
    // ── PEDIDO CORPORAL NÃO PASSA POR AQUI ────────────────────────────────
    //
    // "Me segue", "vai até a porta": só a decisão VERBAL do 3B vira ação, pelo
    // marcador `[[WILL:…]]` que ele conhece e o cérebro pequeno não. Um rascunho
    // dessa fala produziria um Nilo que concorda por escrito e não sai do
    // lugar — o pior defeito possível neste NPC, e o mais difícil de perceber,
    // porque a resposta na tela parece perfeita.
    //
    // A regra não é nova: `sendToNpc` já mandava todo pedido corporal ao 3B
    // ("um possível pedido corporal sempre vai ao 3B, pois só a decisão verbal
    // dele pode virar ação na Utility AI"). Aqui ela só continua valendo.
    if (hasFloor10PhysicalActionCue(text)) return null;
    // Só com o cérebro pequeno JÁ de pé. Baixar 1,25 GB para acelerar uma
    // resposta seria o contrário de acelerar, e a primeira fala da partida não
    // pode esperar por isso.
    // Só com o modelo JÁ de pé. Baixar centenas de MB para acelerar uma
    // resposta é o contrário de acelerar, e a cota deste jogo já recusou 2,07 GB
    // uma vez — o Nilo emudeceu.
    const dePe = quem === 'reflexo'
        ? reflexoJaCarregado()
        : (quem === 'motor' ? motorJaCarregado() : vontadeJaCarregada());
    if (!dePe) return null;

    const comecou = Date.now();
    npcSet({ streaming: 'rascunhando…' });
    const rascunho = visibleText(await (
        quem === 'reflexo' ? rascunharComReflexo(systemPrompt, text)
            : quem === 'motor' ? rascunharComMotor(systemPrompt, groundedHistory)
                : rascunharFala(systemPrompt, groundedHistory)));
    if (!rascunho) {
        anotar('rascunho:vazio', { ms: Date.now() - comecou });
        return null;
    }
    const frases = enumerarFrases(rascunho);
    if (frases.length === 0) return null;

    npcSet({ streaming: `O ${FLOOR10_MODEL.label} está conferindo o rascunho…` });
    // Temperatura baixa: julgar não é criar. É a mesma escolha do caminho de
    // correção que já existia neste arquivo.
    const bruto = visibleText(await gerar(
        systemPrompt,
        { temperature: 0.2, top_p: 0.75, top_k: 20 },
        {
            extraUser: blocoDeRevisao(text, frases),
            grammar: GRAMATICA_DO_REMENDO,
            maxTokens: REVISAO_MAX_TOKENS,
        },
    ));
    const veredito = lerVeredito(bruto, frases.length);
    const valem = remendosQueValem(frases, veredito.remendos);
    const costurado = arrumarFala(aplicarRemendos(frases, valem));
    const problema = floor10ReplyIssue(costurado, text, npc.perception);
    anotar('rascunho:revisado', {
        quem,
        ms: Date.now() - comecou,
        frases: frases.length,
        remendos: valem.length,
        // Quantos remendos o revisor pediu e foram descartados por não mudarem
        // nada. Se este número for alto, o enunciado está fazendo o modelo
        // "corrigir" por obrigação — e isso é caro sem consertar coisa alguma.
        inuteis: veredito.remendos.length - valem.length,
        aprovado: veredito.aprovado ? 1 : 0,
        reprovado: problema ? 1 : 0,
    });
    if (problema) return null;
    return costurado;
}

/**
 * O REVISOR, exposto para a bancada e para a sala do rascunho.
 *
 * No jogo esta chamada vive dentro de `sendToNpc`, embrulhada no watchdog, no
 * medidor de FPS e no gerente de GPU — tudo o que uma fala de verdade precisa e
 * uma medição não. Aqui é a mesma pergunta ao mesmo modelo, com a MESMA
 * gramática e o MESMO teto, sem o resto.
 *
 * O `?rascunho` existe para o dono do jogo VER a arquitetura antes de ela ser o
 * jogo, e uma sala que medisse um caminho diferente do real seria pior que
 * nenhuma sala.
 */
export async function revisarRascunhoParaBancada(
    systemPrompt: string,
    blocoDaRevisao: string,
): Promise<string> {
    const engine = await initLLM();
    if (!engine) return '';
    floor10ModelCoordinator.pausarDeliberacao();
    const resposta = await engine.createChatCompletion({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: blocoDaRevisao },
        ],
        ...CHAT_COMPLETION_CONFIG,
        stream: false,
        temperature: 0.2,
        top_p: 0.75,
        top_k: 20,
        grammar: GRAMATICA_DO_REMENDO,
        max_tokens: REVISAO_MAX_TOKENS,
    }) as { choices?: Array<{ message?: { content?: string } }> } | undefined;
    return visibleText(resposta?.choices?.[0]?.message?.content ?? '').trim();
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
    // ── O TEMPO CRU, QUE SEMPRE ESTEVE ALI ────────────────────────────────
    //
    // Este tipo é escrito à mão porque o wllama entra por `import()` de CDN.
    // Faltavam dois campos que o `ResultTimings` dele declara e o motor manda
    // em toda geração: o tempo DECORRIDO de cada metade, em milissegundos.
    //
    // Sem eles, a tela só sabia falar em tokens por segundo — uma taxa
    // DERIVADA, que já mandou o dono do jogo caçar três problemas de prefill
    // inexistentes, porque uma taxa calculada sobre meia dúzia de tokens é
    // dominada pelo custo fixo da chamada.
    //
    // Milissegundo decorrido não tem esse defeito: "leitura 95s · fala 47s"
    // soma o que ele viu no relógio, e responde de uma vez a pergunta que
    // importa — encolher o prompt adianta, ou o gargalo é a geração?
    prompt_ms?: number;
    predicted_ms?: number;
};

/** Segundos legíveis: "1,4s" para o que é curto, "95s" para o que não é. */
function segundos(ms: number): string {
    const s = ms / 1000;
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

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
    // ── E A GUARDA TINHA UM FURO, QUE ASSUSTOU DE NOVO ────────────────────
    //
    // O parágrafo acima diagnosticou o artefato e criou o piso de 24 tokens.
    // Só que ele contava `lidos`, e `lidos` INCLUI o que veio do cache. No
    // aparelho do dono do jogo, hoje: "321 lidos · 273 reaproveitados" — 321
    // passa folgado do piso, a etiqueta aparece, e mostra a taxa calculada
    // sobre 48 tokens de trabalho real dividida pelo custo fixo da chamada.
    // Deu "leitura 2 tok/s" outra vez, e outra vez mandou caçar um problema de
    // prefill que não existe.
    //
    // O piso tem de olhar o trabalho DE VERDADE: lidos menos reaproveitados.
    const processados = Math.max(0, lidos - reusados);
    // E O SEGUNDO CRITÉRIO, QUE É O QUE TEM PRINCÍPIO: prefill é em LOTE
    // (n_batch 512), geração é token a token. Ler NUNCA pode ser mais lento
    // que falar. Medido nesta caixa, no mesmo modelo, cinco rodadas: a razão
    // leitura/fala ficou entre 1,82x e 2,03x, nunca abaixo de 1.
    //
    // Quando a tela mostra leitura 2 e fala 2, o "2" da leitura não é vazão —
    // é o custo fixo da chamada dividido por meia dúzia de tokens. Escolher um
    // piso maior seria chutar outro número; esta regra sai da natureza das duas
    // operações e não precisa de calibragem.
    const fala = typeof timings.predicted_per_second === 'number'
        ? timings.predicted_per_second
        : 0;
    // ── E A GUARDA COMPARAVA CRU E EXIBIA ARREDONDADO ─────────────────────
    //
    // A regra acima é a certa: ler é em lote, falar é token a token, então
    // leitura menor ou igual à fala é artefato, não vazão. Só que ela comparava
    // os valores CRUS e a tela mostra os ARREDONDADOS. Com leitura 2,4 e fala
    // 1,6 a guarda aprova (2,4 > 1,6) e a tela imprime "leitura 2 · fala 2" —
    // exatamente a imagem que este bloco existe para não produzir.
    //
    // E ela produziu: o dono do jogo mandou o print dessa linha como evidência
    // de que algo estava errado. Terceira vez que esta etiqueta manda caçar um
    // problema que não existe — as duas anteriores estão contadas acima.
    //
    // A comparação passa a ser sobre o que o jogador VÊ. Se os dois números
    // aparecem iguais, o de leitura não informa nada e sai.
    const leituraBruta = typeof timings.prompt_per_second === 'number'
        ? timings.prompt_per_second
        : 0;
    const leituraCrivel = leituraBruta > 0
        && (fala <= 0 || (leituraBruta > fala && Math.round(leituraBruta) > Math.round(fala)));
    // ── O TEMPO DECORRIDO GANHA DA TAXA, QUANDO ELE EXISTE ────────────────
    //
    // Toda a ginástica acima (piso de tokens, "ler não pode ser mais lento que
    // falar") existe para consertar uma TAXA que engana em prompt curto. O
    // motor manda o tempo decorrido junto, e ele não engana: são os segundos
    // que o jogador passou olhando a tela.
    //
    // Quando os dois vêm, a taxa sai — dizer a mesma coisa duas vezes num
    // cabeçalho que já quebra em três linhas no celular não ajuda ninguém.
    const msLeitura = typeof timings.prompt_ms === 'number' ? timings.prompt_ms : 0;
    const msFala = typeof timings.predicted_ms === 'number' ? timings.predicted_ms : 0;
    const temTempoCru = msLeitura > 0 || msFala > 0;
    if (temTempoCru) {
        if (msLeitura > 0) parts.push(`leitura ${segundos(msLeitura)}`);
        if (msFala > 0) parts.push(`fala ${segundos(msFala)}`);
    } else {
        if (processados >= TIMINGS_MIN_PROMPT_N && leituraCrivel) {
            parts.push(`leitura ${Math.round(timings.prompt_per_second)} tok/s`);
        }
        if (typeof timings.predicted_per_second === 'number' && timings.predicted_per_second > 0) {
            parts.push(`fala ${Math.round(timings.predicted_per_second)} tok/s`);
        }
    }
    if (reusados > 0) parts.push(`${reusados} reaproveitados`);
    if (lidos > 0) parts.push(`${lidos} lidos`);
    return parts.join(' · ');
}

/**
 * Separa a espera em LEITURA e FALA, a partir do que o motor mediu.
 *
 * `leitura_s` é derivado (tokens ÷ tokens por segundo) porque é isso que o
 * wllama entrega — e é exatamente o suficiente para responder qual das duas
 * metades domina.
 */
export function divisaoDaEspera(
    timings: ChatTimings | null,
): Record<string, number> {
    if (!timings) return {};
    const saida: Record<string, number> = {};
    const lidos = typeof timings.prompt_n === 'number' ? timings.prompt_n : 0;
    const reusados = typeof timings.cache_n === 'number' ? timings.cache_n : 0;
    if (lidos > 0) saida.lidos = lidos;
    if (reusados > 0) saida.reusados = reusados;
    // O medido ganha do derivado: `prompt_ms` é o relógio do motor, enquanto
    // `lidos / tok_por_segundo` é uma divisão que só reconstrói o mesmo número
    // quando as duas pontas concordam sobre o que "lidos" conta — e elas nem
    // sempre concordam (o cache entra em `prompt_n` em algumas builds e não em
    // outras). O derivado fica de reserva para quem não mandar o cru.
    if (typeof timings.prompt_ms === 'number' && timings.prompt_ms > 0) {
        saida.leitura_s = timings.prompt_ms / 1000;
    } else if (
        lidos > 0
        && typeof timings.prompt_per_second === 'number'
        && timings.prompt_per_second > 0
    ) {
        saida.leitura_s = lidos / timings.prompt_per_second;
    }
    if (typeof timings.prompt_per_second === 'number' && timings.prompt_per_second > 0) {
        saida.leitura_tps = timings.prompt_per_second;
    }
    if (typeof timings.predicted_ms === 'number' && timings.predicted_ms > 0) {
        // A metade que faltava na conta. Sem ela dava para saber quanto custou
        // ler, mas não com o que comparar — que é a pergunta inteira.
        saida.fala_s = timings.predicted_ms / 1000;
    }
    if (typeof timings.predicted_per_second === 'number' && timings.predicted_per_second > 0) {
        saida.fala_tps = timings.predicted_per_second;
    }
    return saida;
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
    // ── SÓ PUBLICA O QUE MUDOU ────────────────────────────────────────────
    // Cada chamada aqui vira um `npcSet`, e todo `npcSet` re-renderiza o painel.
    // Enquanto o modelo escreve raciocínio oculto (<think>), o texto VISÍVEL
    // fica o mesmo por dezenas de tokens — e cada um desses tokens estava
    // custando um render idêntico ao anterior, na mesma thread que desenha o
    // jogo enquanto 8 threads geram a fala. Publicar só a mudança não altera
    // uma vírgula do que aparece na tela.
    let ultimoPublicado: string | null = null;
    const publicar = (texto: string) => {
        if (texto === ultimoPublicado) return;
        ultimoPublicado = texto;
        onVisibleText(texto);
    };

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
        if (chunkOpensReply(chunk)) { acc = ''; publicar(''); }
        if (typeof chunk.currentText === 'string') acc = chunk.currentText;
        else acc += chunkDelta(chunk);
        const visible = visibleText(acc);
        if (visible.length > 0) sawVisibleText = true;
        publicar(visible);
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
let moduleEsm = '';
let transitionPromise: Promise<WllamaInstance> | null = null;

/** Não mistura o ESM oficial com o WASM recompilado quando outro probe veio antes. */
function carregarModuloWllama(esm: string): Promise<WllamaModule> {
    if (modulePromise && moduleEsm === esm) return modulePromise;
    moduleEsm = esm;
    const pending = import(/* @vite-ignore */ esm) as unknown as Promise<WllamaModule>;
    const tracked = pending.catch((error: unknown) => {
        if (modulePromise === tracked) {
            modulePromise = null;
            moduleEsm = '';
        }
        throw error;
    });
    modulePromise = tracked;
    return tracked;
}

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
        list: () => Promise<EntradaDoCache[]>;
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
        // `entradaIntacta`: a entrada existe desde o primeiro byte baixado, e
        // um arquivo pela metade responderia "já está aqui" — fazendo o jogo
        // pular a conta de espaço justamente quando ela é necessária.
        return !!entries?.some((e) => e.metadata?.originalURL === url && entradaIntacta(e));
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
/**
 * ── OS DESCARTADOS PRIMEIRO, O EM USO SÓ SE NÃO SOBRAR JEITO ──────────────
 *
 * Esta função apagava TODOS os cérebros pequenos de uma vez, inclusive o que
 * está em uso. Funciona — a fala volta a caber — e é caro à toa: o único que o
 * jogo vai querer de novo em seguida é justamente o que estava selecionado, e
 * ele desce inteiro outra vez.
 *
 * Passou a importar de verdade quando o dono do jogo trocou a vontade para o
 * LFM2.5: o Llama de 1,32 GB continua no OPFS ocupando cota que agora não serve
 * para nada. Sem esta ordem, a primeira aperto de espaço apagaria os dois e ele
 * pagaria 1,25 GB de download por um problema causado por 1,32 GB de lixo.
 *
 * Ordem: os NÃO selecionados primeiro. Se isso bastar, quem chama refaz a conta
 * e nem chega a pedir o resto — a vontade em uso fica onde está.
 */
async function reclaimSmallBrains(mod: WllamaModule): Promise<number> {
    const emUso = urlDoCerebroEscolhido();
    const descartados = cachesDescartaveis();
    let liberados = 0;
    for (const url of descartados) {
        if (!await isModelCached(mod, url)) continue;
        if (await forgetCachedModel(mod, url)) liberados += 1;
    }
    if (liberados > 0) return liberados;
    // Não havia lixo para jogar fora: aí sim a vontade em uso cede o lugar. Ela
    // é opcional por construção; a fala não é.
    if (await isModelCached(mod, emUso) && await forgetCachedModel(mod, emUso)) liberados += 1;
    return liberados;
}

/**
 * O cérebro da FALA já está baixado? A vontade pergunta isto antes de gastar
 * 800 MB: quem baixa primeiro fica com o espaço, e não pode ser ela.
 */
export async function speechModelReady(): Promise<boolean> {
    if (currentEngine && activeModelUrl === FLOOR10_MODEL.url) return true;
    try {
        return await isModelCached(await carregarModuloWllama(WLLAMA_ESM), FLOOR10_MODEL.url);
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
        // O KV e o Worker pertencem à instância encerrada. Reabrir outro
        // runtime (caso A/B) precisa aquecer a própria persona, não herdar a
        // promessa já concluída do anterior.
        prewarmPromise = null;
        personaPrewarmed = false;
        personaPrewarmDone = false;
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
    resetModelLoadTrace();
    npcSet({
        phase: 'loading',
        modelLabel: `${model.label} · detectando aceleração`,
        loadText: `preparando ${model.label} localmente…`,
        loadProgress: 0,
        loadDownload: DOWNLOAD_ZERO,
        error: '',
    });

    const pending = (async () => {
        publicarEtapaDeCarga(
            'conferindo o armazenamento do site',
            'conferindo o armazenamento do site…',
        );
        const backend = await probeModelStorageBackend();
        if (!backend.ok) throw new ModelStorageError(backend.message);

        try {
            if (typeof navigator !== 'undefined') {
                void (navigator as unknown as {
                    storage?: { persist?: () => Promise<boolean> };
                }).storage?.persist?.().catch(() => undefined);
            }
        } catch { /* persistência é só uma otimização */ }

        // DUAS DECISÕES DIFERENTES, e juntá-las custou caro uma vez.
        //
        // `runtimeEspecLigado` escolhe o BINÁRIO: o nosso, remendado, com os
        // kernels SIMD (+51%), a ponte de pthread e o erro clonável. Vale
        // sempre, salvo `?wllamacdn`.
        //
        // `especulativaLigada` escolhe só se o llama.cpp recebe os parâmetros
        // de rascunho por n-grama. Hoje: não, salvo `?ngram`.
        //
        // Enquanto as duas eram a mesma flag, "tirar o n-grama" significava
        // voltar ao CDN e perder os 51% junto — trocar um custo de 10% por uma
        // perda de 51%.
        const usandoRuntimeEspec = runtimeEspecLigado();
        const usandoNgram = especulativaLigada();
        const diagnosticoComparacao = usandoNgram && floor10ComparisonDiagnosticsEnabled();
        publicarEtapaDeCarga(
            usandoRuntimeEspec ? 'buscando o runtime remendado' : 'buscando o runtime wllama',
            'buscando o runtime do llama.cpp…',
        );
        const runtimeEspec = usandoRuntimeEspec ? await prepararEspeculativa() : null;
        const esmDaVez = runtimeEspec ? runtimeEspec.esm : WLLAMA_ESM;
        const mod = await carregarModuloWllama(esmDaVez);
        publicarEtapaDeCarga(
            `runtime pronto (${runtimeEspec ? runtimeEspec.origem : 'cdn'})`,
            'runtime pronto; conferindo o modelo…',
        );

        // ── A MEDIDA É SEMPRE PUBLICADA; SÓ A DECISÃO FICA ATRÁS DO `if` ──
        //
        // Antes de gastar 1,9 GB de DADOS NOVOS: cabe? Se o modelo já está no
        // cache, não há nada a caber — a pergunta simplesmente não se aplica, e
        // esse raciocínio está certo sobre a DECISÃO.
        //
        // Só que o bloco inteiro estava dentro do `if`, inclusive a LEITURA da
        // cota. Com o modelo em cache, `npc.storage` nunca era preenchido e
        // ficava no `{ quota: null }` do estado inicial — e a tela imprime, para
        // `quota: null`, "o navegador não informa a cota".
        //
        // Foi exatamente essa frase que o dono do jogo fotografou. O navegador
        // informa; ninguém perguntou. A carga da vontade
        // (`floor10SmallBrain`) lê e publica o mesmo campo SEM condição, o que
        // mostra que aqui era omissão e não política.
        //
        // Diagnóstico que mente é pior que diagnóstico ausente: "não sei quanto
        // cabe" manda procurar defeito no aparelho do jogador.
        const jaEmCache = await isModelCached(mod, model.url);
        if (jaEmCache) {
            const estimativa = await readStorageEstimate();
            npcSet({
                storage: {
                    quota: estimativa.quota,
                    usage: estimativa.usage,
                    // Zero, e é a verdade: os pesos já estão no aparelho, não
                    // há nada de novo para caber.
                    needBytes: 0,
                },
            });
        }
        if (!jaEmCache) {
            const modelBytes = await probeModelBytes(model.url);
            const excedeTeto = excedeTetoDoGguf(modelBytes);
            if (excedeTeto) throw new ModelStorageError(excedeTeto);
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
        // O TETO DE BUFFER DO APARELHO manda mais que o gerente.
        //
        // No Android o `maxStorageBufferBindingSize` costuma ser 128 MB, e o
        // SmolLM3-3B tem ~53 MB por camada: cabem duas, não três. Pedir mais do
        // que cabe é o caminho mais curto para "Binding size is larger than the
        // maximum binding size" — que no aparelho do dono do jogo apareceu como
        // a geração simplesmente morrendo.
        const cabem = adaptador.ok
            ? layersThatFit(adaptador.maxBindingBytes, SPEECH_MODEL_BYTES, SPEECH_MODEL_LAYERS)
            : 0;
        const requestedGpuLayers = (webGpuDisabledForSession || !adaptador.ok)
            ? 0
            : Math.min(speechGpuLayerCount(), cabem);
        const plans = requestedGpuLayers > 0
            ? [requestedGpuLayers, 0]
            : [0];
        // A carga OPFS -> Worker -> HeapFS/mmap só entra com `?cargarapida`.
        // Ligada, ela ainda tem a instância de recuo pela leitura JSPI; sem a
        // flag NÃO existe primeira tentativa para falhar, e é essa ausência que
        // devolve ao jogador os minutos que ele estava perdendo antes de a
        // carga boa começar.
        const fastLoadPlans = usandoRuntimeEspec && cargaRapidaLigada() ? [true, false] : [false];
        let lastError: unknown = new Error('Nenhum backend local disponível');

        // Duas voltas: se a primeira morrer por CACHE QUEBRADO, apagamos o
        // registro do modelo e baixamos limpo. Sem isto o jogador ficava preso
        // para sempre no mesmo erro, porque cada tentativa reencontrava o mesmo
        // registro corrompido — e nada no jogo apagava aquilo.
        for (let tentativa = 0; tentativa < 2; tentativa += 1) {
        for (const gpuLayers of plans) {
        for (const cargaRapida of fastLoadPlans) {
            const runtime = speechRuntimeLabel(gpuLayers, threads);
            npcSet({
                modelLabel: `${model.label} · ${runtime}`,
                loadText: cargaRapida
                    ? `montando ${model.label} direto do armazenamento…`
                    : `carregando ${model.label} (${runtime})…`,
                loadProgress: 0,
            });

            let candidate: WllamaInstance | null = null;
            // Marca o instante em que o download acabou. Enquanto for null, o
            // cão de guarda do WebGPU nem começa a contar.
            let downloadDoneAt: number | null = null;
            let lastInitActivityAt: number | null = null;
            let lastActivityTraceAt = 0;
            let lastActivityUiAt = 0;
            let observingInit = true;
            try {
                const publishModelLoadActivity = (activity: ModelLoadActivity): void => {
                    if (!observingInit) return;
                    const now = Date.now();
                    lastInitActivityAt = now;
                    // O callback da build customizada avisa que EXISTIU um
                    // log, mas não traz seus argumentos. Na bancada o logger
                    // oficial logo abaixo publica a mesma linha com o texto
                    // real, então descartamos apenas esse pulso genérico.
                    if (
                        diagnosticoComparacao
                        && activity.stage === 'native-log'
                        && !activity.message
                    ) return;
                    // Leituras chegam em rajada: uma por segundo já basta para
                    // o relatório contar a história. Etapas nativas são poucas
                    // e todas entram.
                    const rajada = leituraDoModelo(activity.stage);
                    if (rajada && now - lastActivityTraceAt < 1_000) return;
                    if (rajada) lastActivityTraceAt = now;
                    const detail = rememberModelLoadActivity(activity, now);
                    // A TELA tem outro limite, e mais duro: `npcSet` re-renderiza
                    // a árvore inteira, e o llama.cpp com log ligado despeja uma
                    // linha por tensor. Era a bancada disputando CPU com a carga
                    // que ela deveria estar apenas medindo.
                    if (now - lastActivityUiAt < 1_000) return;
                    lastActivityUiAt = now;
                    if (downloadDoneAt === null) return;
                    npcSet({
                        loadText: rajada
                            ? `lendo ${model.label} do cache · ${detail}`
                            : `llama.cpp · ${detail}`,
                    });
                };
                // Wllama já aceita um logger próprio. Assim a bancada enxerga
                // as mensagens reais do Worker sem editar o bundle gerado e
                // sem inundar o console durante o jogo normal.
                const diagnosticLogger = diagnosticoComparacao ? {
                    debug: (...args: unknown[]) => {
                        console.debug(...args);
                        publishModelLoadActivity({
                            stage: 'native-log',
                            level: 'debug',
                            message: stringifyModelLoadLog(args),
                        });
                    },
                    log: (...args: unknown[]) => {
                        console.log(...args);
                        publishModelLoadActivity({
                            stage: 'native-log',
                            level: 'log',
                            message: stringifyModelLoadLog(args),
                        });
                    },
                    warn: (...args: unknown[]) => {
                        console.warn(...args);
                        publishModelLoadActivity({
                            stage: 'native-log',
                            level: 'warn',
                            message: stringifyModelLoadLog(args),
                        });
                    },
                    error: (...args: unknown[]) => {
                        console.error(...args);
                        publishModelLoadActivity({
                            stage: 'native-log',
                            level: 'error',
                            message: stringifyModelLoadLog(args),
                        });
                    },
                } : undefined;
                // Em jogo o log nativo do llama.cpp só polui o console; na
                // bancada ele é a ÚNICA janela para saber em que etapa a carga
                // travou (abrir o GGUF, montar o KV, aquecer…).
                candidate = new mod.Wllama(
                    runtimeEspec
                        ? { default: runtimeEspec.wasm }
                        : WLLAMA_PATHS,
                    {
                    suppressNativeLog: !(
                        diagnosticoComparacao
                        || (globalThis as { __npcVerboseLlama?: boolean }).__npcVerboseLlama
                    ),
                    ...(diagnosticLogger ? { logger: diagnosticLogger } : {}),
                    // A build N-gram sabe avisar quando o Worker pede outro
                    // bloco do GGUF ou publica um estágio nativo. Sem este
                    // pulso, 180 s de leitura ativa pareciam um travamento.
                    ...(usandoRuntimeEspec ? {
                        modelLoadActivityCallback: publishModelLoadActivity,
                    } : {}),
                    ...(usandoRuntimeEspec && cargaRapida ? {
                        fastModelLoad: configuracaoCargaRapida(model.url),
                    } : {}),
                    },
                );
                // ── ESPECULATIVA POR N-GRAMAS (só com `?especulativa`) ─
                // Ver floor10Especulativa.ts: o wllama de prateleira ignora
                // `speculative.types`, então esta build vem do binário
                // recompilado em /wllama-espec. Desligada, nada disto acontece
                // e o jogo carrega o CDN de sempre.
                const espec = usandoNgram ? parametrosEspeculativos() : {};
                const loadTask = candidate.loadModelFromUrl(model.url, {
                    ...CPU_LOAD_CONFIG,
                    ...espec,
                    n_threads: threads,
                    n_gpu_layers: gpuLayers,
                    progressCallback: (progress: { loaded?: number; total?: number }) => {
                        const fraction = progress.total
                            ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                            : 0;
                        const acabou = fraction >= 1;
                        if (acabou && downloadDoneAt === null) {
                            downloadDoneAt = Date.now();
                            lastInitActivityAt = downloadDoneAt;
                        }
                        const amostraFala = medidorFala.push(
                            progress.loaded ?? 0,
                            progress.total ?? 0,
                        );
                        // A FILA ÚNICA. As barras por modelo continuam vivas no
                        // ?mente e na bancada, onde a granularidade é o ponto;
                        // no jogo o que vale é "quanto falta ao TODO".
                        floor10Fila.progresso(FILA_FALA, amostraFala);
                        npcSet({
                            // Bytes reais na tela: "412 MB de 1,92 GB · 1,2 MB/s"
                            // responde "está baixando?" — a porcentagem sozinha,
                            // não. Foi a informação que faltou quando o download
                            // parou de acontecer no aparelho do Felipe.
                            loadDownload: amostraFala,
                            loadProgress: fraction,
                            // Depois de 100% o wllama ainda lê o arquivo de volta do
                            // cache e copia ~2 GB para dentro do WASM — e nesse
                            // trecho ele não reporta NADA. Medido na sonda: minutos
                            // parados em "100%", que é exatamente a tela travada que
                            // o jogador vê. Trocar o texto não acelera, mas para de
                            // mentir que acabou.
                            loadText: acabou
                                ? `montando ${model.label} e o contexto na memória…`
                                : `preparando ${model.label}… ${Math.round(fraction * 100)}%`,
                        });
                    },
                });
                // O cão de guarda vale para OS DOIS planos. Na CPU normal o
                // travamento medido foi o pior de todos: o Worker levantou QuotaExceeded,
                // não conseguiu devolver o erro por postMessage (DOMException
                // não é clonável) e a promessa nunca resolveu NEM rejeitou —
                // "carregando" eterno, sem uma linha de erro. Passar batido por
                // isso é o que fazia o jogador esperar 300s por nada.
                await raceGpuInitWatchdog(
                    loadTask,
                    // Quem tem heartbeat é medido por inatividade; quem não tem
                    // (só a carga rápida) cai apenas no teto absoluto abaixo.
                    // A política pura mantém os dois casos testáveis.
                    () => modelInitWatchdogStalledMs(
                        gpuLayers,
                        cargaRapida,
                        downloadDoneAt,
                        lastInitActivityAt,
                    ),
                    gpuLayers > 0
                        ? WEBGPU_INIT_WATCHDOG_MS
                        : (usandoRuntimeEspec
                            ? NGRAM_CPU_INIT_WATCHDOG_MS
                            : CPU_INIT_WATCHDOG_MS),
                    1_000,
                    cargaRapida ? {
                        elapsedMs: () => downloadDoneAt === null
                            ? null
                            : Date.now() - downloadDoneAt,
                        limitMs: NGRAM_CPU_INIT_HARD_LIMIT_MS,
                    } : undefined,
                );
                observingInit = false;
                // VEIO MODELO OU VEIO CASCA? Ver floor10Carga: um GGUF
                // truncado faz a carga RESOLVER com nVocab/nLayer zerados.
                // Aqui é o pior lugar para isso passar — é o modelo com quem o
                // jogador CONVERSA, e a falha só apareceria na primeira frase
                // dele, como um erro incompreensível vindo do Worker.
                await conferirModeloCarregado(candidate);
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
                observingInit = false;
                lastError = error;
                // Encerrar o Worker é o que realmente mata o trabalho de GPU em
                // curso. Se ele estiver ocupado demais para responder, seguimos
                // adiante: esperar aqui recriaria a travada que acabamos de sair.
                await Promise.race([
                    Promise.resolve(candidate?.exit?.()).catch(() => undefined),
                    new Promise<void>((resolve) => { globalThis.setTimeout(resolve, 3_000); }),
                ]);
                if (cargaRapida) {
                    npcSet({
                        loadText: 'a montagem OPFS/mmap não coube; retomando pela leitura compatível…',
                        loadProgress: 1,
                    });
                    continue;
                }
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
            moduleEsm = '';
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

/**
 * Troca segura usada pela bancada A/B.
 *
 * Um único aparelho não comporta dois SmolLM3 residentes. Esperamos qualquer
 * prewarm em curso, encerramos o Worker atual e só então mudamos o par
 * ESM/WASM. O GGUF continua no mesmo cache: nada é baixado outra vez.
 */
export async function selectConversationRuntime(runtime: Floor10Runtime): Promise<void> {
    await settlePersonaPrewarm();
    await unloadConversationBrain();
    definirRuntimeFloor10(runtime);
    npcSet({
        phase: 'cold',
        loadText: '',
        loadProgress: 0,
        loadDownload: DOWNLOAD_ZERO,
        modelLabel: '',
        streaming: '',
        speaking: false,
        error: '',
    });
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(
    userText: string,
    options: { forceMainModel?: boolean } = {},
): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking' || npc.phase === 'loading') return;

    // Perguntas factuais dos olhos e da vontade preservam as falas rápidas que
    // dão personalidade às micro-IAs. Um possível pedido corporal sempre vai
    // ao 3B, pois só a decisão verbal dele pode virar ação na Utility AI.
    const actionRequest = hasFloor10PhysicalActionCue(text);
    if (!options.forceMainModel && !actionRequest) {
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

    // ── O REFLEXO COBRE O PRIMEIRO SEGUNDO ────────────────────────────────
    //
    // Daqui até a primeira palavra do 3B passam dezenas de segundos: ele ainda
    // vai carregar (se estiver frio), ler o prompt inteiro e só então escrever.
    // A tela mostrava "…" o tempo todo, e para quem não sabe o que está
    // acontecendo isso é indistinguível de travamento.
    //
    // A ORDEM AQUI NÃO É DETALHE: o reflexo roda AGORA, com a deliberação já
    // encerrada e o 3B ainda sem gerar — a janela em que o aparelho está livre.
    // Ele tem 2,5s de teto e some sozinho. Nunca, em hipótese alguma, gera ao
    // mesmo tempo que a fala: foi assim que o celular desligou sozinho.
    // ── E ESTA LINHA PRECISOU DE `await` ──────────────────────────────────
    //
    // O parágrafo acima jura que o reflexo "nunca, em hipótese alguma, gera ao
    // mesmo tempo que a fala". O código fazia o oposto: `void reagir(text)`
    // dispara e SEGUE na mesma hora: a execução caía direto na carga e na
    // geração do 3B enquanto o ONNX ainda estava gerando.
    //
    // Os 2,5s de teto do `reagir` não salvavam nada, porque teto de tempo ali é
    // `Promise.race` — ele faz o JavaScript parar de esperar, não o ONNX parar
    // de trabalhar. Exatamente o mesmo engano do `abortSignal` do wllama, no
    // outro motor.
    //
    // Então o aparelho rodava 135M em ONNX e 3B em llama.cpp ao mesmo tempo,
    // com os dois pools de threads abertos. É a receita que este arquivo já
    // descreve como "foi assim que o celular desligou sozinho" — e desligou de
    // novo.
    //
    // Esperar custa no MÁXIMO os 2,5s do teto, e esse tempo não é perdido: é
    // justamente o buraco que o reflexo existe para preencher, antes de o 3B
    // começar. Serializado, ele cumpre a promessa do comentário.
    if (reflexoJaCarregado()) {
        const reacao = await reagir(text);
        // Se a fala de verdade já começou, a reação perdeu a vez — publicar
        // agora seria empurrar texto velho por cima do novo.
        if (reacao && npc.streaming === '' && npc.phase !== 'ready') {
            npcSet({ reflexo: reacao });
        }
    }

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

    // ── A MEMÓRIA, ANTES DE MONTAR O PROMPT ───────────────────────────────
    // Roda aqui, e não durante a geração, porque o fato escolhido É parte do
    // prompt. Custa ~200ms medidos e NUNCA bloqueia: se o modelo de 333 MB
    // ainda não desceu, `lembrarPorSignificado` devolve null na hora e o
    // curador volta a procurar por palavra, como fazia antes de existir.
    if (memoriaJaCarregada()) {
        npcSet({ loadText: 'lembrando…' });
    }
    const lembrado = await lembrarPorSignificado(
        `${history.filter((m) => m.role === 'user').slice(-2)
            .map((m) => m.content).join(' ')} ${text}`,
    );

    // O reflexo sai de cena quando a fala real começa: ele cobriu o silêncio,
    // e a partir daqui quem fala é o 3B.
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '', reflexo: '' });
    const systemPrompt = prepareFloor10SystemPrompt(
        buildFloor10SystemPrompt(
            text,
            history,
            npc.perception,
            npc.autonomy,
            lembrado,
        ),
    );
    // Memória curta de propósito: as últimas 2 trocas (4 mensagens). Histórico
    // longo inchava o prefill e fazia o 3B "fixar" num tema. O essencial do
    // personagem vive na persona, não no histórico.
    const groundedHistory = groundedModelHistory(history, FLOOR10_HISTORY_VERBATIM);

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
    /** Última etiqueta de velocidade publicada — evita re-render repetido. */
    let ultimaMedicao = '';
    /**
     * A ÚLTIMA MEDIÇÃO CRUA DA RODADA.
     *
     * Existe para a caixa-preta poder separar as duas metades da espera, que é a
     * pergunta que decide qualquer otimização daqui para a frente:
     *
     *   LEITURA (prefill) — o modelo lendo o prompt, uma vez só.
     *   FALA (decode)     — o modelo escrevendo, um token de cada vez.
     *
     * Se a espera for quase toda LEITURA, encolher o prompt vale a pena (e um
     * modelo auxiliar que resuma tem função). Se for quase toda FALA, prompt
     * menor não muda nada — só menos tokens de saída ou mais tok/s ajudam, e aí
     * nenhum modelo auxiliar resolve. Sem este número, escolher entre os dois é
     * chute; já paguei caro por chute nesta sessão.
     */
    let medicaoFinal: ChatTimings | null = null;
    const generateWithMainModel = async (
        prompt: string,
        sampling: Partial<{
            temperature: number;
            top_p: number;
            top_k: number;
        }> = {},
        /**
         * O modo REVISOR: em vez de escrever a fala, o 3B lê um rascunho e diz
         * o que trocar.
         *
         * `extraUser` entra como ÚLTIMA mensagem, e não coladao no fim do
         * prompt de sistema — de propósito. O llama.cpp reaproveita o maior
         * prefixo comum entre duas chamadas, e é daí que saem os "515
         * reaproveitados" do cabeçalho. Alterar o sistema mudaria o prefixo
         * logo no começo e recobraria o prefill de TUDO, inclusive do
         * histórico. Como última mensagem, só o rascunho é novo.
         */
        revisao: Partial<{
            extraUser: string;
            grammar: string;
            maxTokens: number;
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
        const comecouAFalar = Date.now();
        // ── A BOCA FALA, A VONTADE CALA ───────────────────────────────────
        // Carregar a fala acontece uma vez; FALAR acontece a cada mensagem. Sem
        // esta linha a vontade deliberava por cima da geração — dois llama.cpp
        // de oito threads disputando os mesmos núcleos, e o celular inteiro
        // travando. Pausar aqui não custa nada à vontade: ela guarda o
        // pensamento parcial e retoma quando a vez volta.
        floor10ModelCoordinator.pausarDeliberacao();
        anotar('fala:gerando', { gpu: loadedGpuLayers, threads: loadedThreads });
        const streamPromise = engine.createChatCompletion({
            messages: [
                { role: 'system', content: prompt },
                ...groundedHistory,
                ...(revisao.extraUser
                    ? [{ role: 'user' as const, content: revisao.extraUser }]
                    : []),
            ],
            ...CHAT_COMPLETION_CONFIG,
            ...sampling,
            ...(revisao.grammar ? { grammar: revisao.grammar } : {}),
            ...(revisao.maxTokens ? { max_tokens: revisao.maxTokens } : {}),
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
                    medicaoFinal = timings;
                    if (typeof timings.predicted_per_second === 'number'
                        && timings.predicted_per_second > 0) {
                        tpsDaVez = timings.predicted_per_second;
                    }
                    const measured = formatTimings(timings);
                    // `timings_per_token` entrega medição a CADA token, e cada
                    // npcSet aqui era um segundo re-render por token, em cima do
                    // render do texto. Só que a etiqueta é arredondada: depois
                    // dos primeiros tokens ela repete o mesmo texto até o fim da
                    // fala. Publicar só quando o número MUDA mostra exatamente a
                    // mesma coisa pela metade do custo.
                    if (measured && measured !== ultimaMedicao) {
                        ultimaMedicao = measured;
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
    const entregarAmostra = (resposta = '') => {
        const fps = quadrosDaVez?.stop() ?? null;
        // O FPS aqui é o número que eu mais quis ver e nunca vi: ele mede o
        // jogo DURANTE a geração, que é quando o aparelho aperta.
        anotar('fala:fim', {
            tps: tpsDaVez,
            fps,
            letras: resposta.length,
            ...divisaoDaEspera(medicaoFinal),
        });
        // ── SANIDADE ANTES DE VELOCIDADE ──────────────────────────────────
        // Com 2 camadas na GPU o Nilo respondeu lixo — tokens aleatórios,
        // e-mail, `_trampoline` — e o gerente carimbou "estável", porque
        // tokens/s e FPS tinham passado. Rápido e errado passava em todos os
        // testes que eu tinha escrito. Não passa mais.
        if (loadedGpuLayers > 0 && looksCorrupted(resposta)) {
            floor10Gpu.markCorruptOutput(resposta);
            webGpuDisabledForSession = true;
            return;
        }
        if (tpsDaVez > 0) {
            floor10Gpu.observe({ layers: loadedGpuLayers, tps: tpsDaVez, fps });
        }
    };

    try {
        // ── RASCUNHO PRIMEIRO, 3B COMO REVISOR ────────────────────────────
        //
        // O caminho de baixo (o 3B escrevendo do zero) continua inteiro e
        // continua sendo a verdade final. Este bloco só tenta chegar lá mais
        // barato, e some sem deixar rastro quando não consegue: rascunho vazio,
        // veredito ilegível ou texto costurado que não passa nas checagens
        // determinísticas caem no caminho de sempre.
        //
        // Nunca fica pior que hoje é requisito, não elegância. Um NPC que
        // emudece porque a otimização falhou é pior que um NPC lento.
        const revisado = await falarRevisando(
            text, systemPrompt, groundedHistory, generateWithMainModel,
        );
        let languageDecision = parseFloor10WillLanguageDecision(
            text,
            revisado ?? visibleText(await generateWithMainModel(
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
        const historicoFinal = [
            ...history,
            { role: 'assistant' as const, content: arrumarFala(finalText) },
        ];
        npcSet({
            // Entrega só o que ficou inteiro: o teto de tokens cortava a fala no
            // meio da palavra, e o pedaço solto ainda contaminava a mensagem
            // seguinte (".O elevador…", "eu possa.O hotel…").
            history: historicoFinal,
            streaming: '',
            phase: 'ready',
            speaking: false,
        });
        // ── O COMPRESSOR TRABALHA DEPOIS, NUNCA ANTES ─────────────────────
        //
        // A resposta já está na tela. Só agora o micro dobra a conversa antiga
        // numa linha, para a PRÓXIMA pergunta ter menos prompt para ler — e
        // para o começo da conversa não sumir quando o orçamento de histórico
        // estourar. Sem `await` de propósito: se demorar ou falhar, o jogador
        // não fica sabendo e nada muda.
        if (reflexoJaCarregado()) {
            void dobrarConversa(
                historicoFinal,
                FLOOR10_HISTORY_VERBATIM,
                (prompt) => completar(prompt),
            );
        }
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
                // ── A SAÍDA QUE NÃO PASSAVA PELO CORTE ────────────────────
                // O caminho feliz aparava a fala na última frase completa; este
                // aqui salvava o parcial cru. É o AVESSO do certo: o watchdog
                // dispara justamente quando a geração foi interrompida no meio,
                // então esta é a saída com MAIS chance de terminar em palavra
                // pela metade — e era a única sem conserto.
                history: [...history, { role: 'assistant', content: arrumarFala(safePartialText) }],
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
        // SEMPRE, e COM O TEXTO. Uma fala que estourou o watchdog com a GPU
        // ligada é a amostra mais valiosa que existe — é ela que denuncia o
        // degrau ruim. E o texto é o que denuncia o degrau que responde rápido
        // e errado, que o gerente aprovava.
        entregarAmostra(npc.history.at(-1)?.role === 'assistant'
            ? npc.history.at(-1)!.content
            : '');
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
