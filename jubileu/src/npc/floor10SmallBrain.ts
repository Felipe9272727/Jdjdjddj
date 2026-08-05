// ── O CÉREBRO PEQUENO — deliberação em segundo plano ──────────────────────
// Instância própria do wllama com um modelo de ~1B (ver SMALL_BRAIN_CATALOG).
// Não conversa com o jogador: recebe o estado do mundo em inglês estruturado,
// PENSA em primeira pessoa e assina uma intenção do Nilo. O reflexo (Utility
// AI) continua dirigindo o corpo o tempo todo enquanto isto pensa.
//
// Tudo aqui é OPCIONAL por construção: se o aparelho não tiver memória para o
// segundo modelo, a carga falha em silêncio e o Nilo segue com o reflexo. O
// jogo nunca depende desta camada para funcionar.
import {
    DELIBERATION_EXTRACT_TOKENS,
    DELIBERATION_GOALS,
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
import type { F10PrisonState } from './f10Prison';
import {
    abortFloor10MotorBrain,
    resetFloor10MotorBrainForTests,
    translateFloor10MotorThought,
} from './floor10MotorBrain';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { anotar } from './floor10CaixaPreta';
import {
    descartarPensamento,
    emendarPensamento,
    pausarPensamento,
    pensamentoPausado,
    promptDeRetomada,
} from './floor10Pausa';
import {
    SMALL_BRAIN_CATALOG, SMALL_BRAIN_DEFAULT, SPEECH_BRAIN_BYTES, type SmallBrainId,
} from './floor10Brains';
import {
    FLOOR10_TENTATIVAS,
    conferirModeloCarregado,
    ehFalhaTransitoria,
    esperar,
    esperaDaTentativa,
    textoDaTentativa,
    vigiarInatividade,
} from './floor10Carga';
import { DownloadMeter, DOWNLOAD_ZERO, downloadLine } from './floor10Download';
import { floor10Fila, FILA_VONTADE } from './floor10Fila';
import { conversaOcupaOAparelho } from './floor10Precarga';
import {
    CACHE_HEADROOM,
    deleteCachedModel,
    isBrokenModelCacheError,
    formatGB,
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { npc, npcSet } from './npcStore';
import {
    chunkDelta, chunkOpensReply, cpuThreadCount, speechModelReady,
    type ChatChunk,
} from './wllamaEngine';

export { SMALL_BRAIN_CATALOG, type SmallBrainId } from './floor10Brains';

const WLLAMA_V = '3.5.1';
// Mesmos overrides do cérebro de fala. Sem eles o cérebro PEQUENO era
// impossível de testar fora da internet aberta: runtime e modelo estavam
// fixos, e a deliberação simplesmente nunca rodava numa caixa fechada — o que
// escondia justamente os defeitos de loop e de travamento que ele pode ter.
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

const SMALL_BRAIN_STORAGE_KEY = 'floor10-small-brain';

function readSavedBrain(): SmallBrainId | null {
    try {
        const saved = globalThis.localStorage?.getItem(SMALL_BRAIN_STORAGE_KEY);
        return SMALL_BRAIN_CATALOG.some((m) => m.id === saved)
            ? (saved as SmallBrainId)
            : null;
    } catch {
        return null;
    }
}

let escolhido: SmallBrainId = readSavedBrain() ?? SMALL_BRAIN_DEFAULT;

function brainAtual() {
    return SMALL_BRAIN_CATALOG.find((m) => m.id === escolhido) ?? SMALL_BRAIN_CATALOG[0];
}

/**
 * Continua sendo lido como um objeto simples em todo o resto do arquivo, mas
 * agora responde ao modelo escolhido. O override global existe para as sondas
 * servirem o .gguf de uma caixa fechada.
 */
export const SMALL_BRAIN_MODEL = Object.freeze({
    get id(): SmallBrainId { return brainAtual().id; },
    get label(): string { return brainAtual().label; },
    get url(): string {
        return (globalThis as { __smallBrainModelUrl?: string }).__smallBrainModelUrl
            ?? brainAtual().url;
    },
    get bytes(): number { return brainAtual().bytes; },
});

/**
 * Troca o cérebro pequeno. Descarrega o atual antes: dois modelos de 800 MB
 * vivos ao mesmo tempo é exatamente como o aparelho do Felipe trava.
 */
export async function setSmallBrain(id: SmallBrainId): Promise<void> {
    if (id === escolhido) return;
    if (!SMALL_BRAIN_CATALOG.some((m) => m.id === id)) return;
    await unloadSmallBrain();
    escolhido = id;
    try {
        globalThis.localStorage?.setItem(SMALL_BRAIN_STORAGE_KEY, id);
    } catch { /* sem localStorage a escolha só vale para esta sessão */ }
}

/**
 * Os MESMOS núcleos da fala — hoje oito.
 *
 * Foi 2 (medo de disputar com o SmolLM3), depois 4, e agora acompanha o teto da
 * fala. A razão é o coordenador: fala e vontade NUNCA geram ao mesmo tempo. A
 * fala preempta a deliberação antes de gerar, e a deliberação cede a vez
 * enquanto o painel está aberto. Deixar metade do aparelho parada durante uma
 * rodada que roda sozinha era desperdício puro.
 *
 * Continua sendo TETO, não exigência: quem tem menos núcleos usa o que tem.
 *
 * Uma ressalva honesta, porque ela é medível e eu não tenho o aparelho aqui:
 * em celular big.LITTLE (o Snapdragon 7s Gen 2 tem 4 núcleos grandes e 4
 * pequenos) o llama.cpp espera pela thread mais lenta, então mais threads nem
 * sempre é mais rápido. Por isso o painel de pensamento publica `CPU×N` e os
 * tok/s medidos: dá para ver, na hora, se 8 ficou melhor que 4 — e é um número
 * só para voltar atrás.
 */
export const SMALL_BRAIN_THREADS = 8;

export function smallBrainThreads(): number {
    return Math.min(SMALL_BRAIN_THREADS, Math.max(1, cpuThreadCount()));
}

/**
 * De quanto em quanto tempo o pensamento em curso vai para a tela. 150ms é
 * rápido o bastante para parecer que ele está escrevendo e devagar o bastante
 * para não re-renderizar o painel a cada token.
 */
export const PENSAMENTO_PUBLICA_MS = 150;

/**
 * O PENSAMENTO JÁ FOI ASSINADO?
 *
 * O prompt manda terminar com uma linha "CHOICE: <opção>", e ela é a ÚLTIMA
 * coisa que ele escreve. Reconhecê-la enquanto o texto ainda chega permite
 * encerrar a rodada ali, em vez de ficar lendo até o teto de 320 tokens.
 *
 * Exige a opção INTEIRA (uma das conhecidas) e mais um caractere depois, senão
 * "CHOICE: approach" pararia no meio de "approach-player" e a decisão viraria
 * outra.
 */
export function escolhaAssinada(texto: string): boolean {
    // NO COMEÇO DA LINHA, e não em qualquer lugar. O modelo às vezes repete o
    // enunciado dentro do próprio raciocínio ("...terminar com CHOICE: idle,
    // então..."), e parar ali seria trocar a decisão dele por um eco da
    // instrução. `parseDeliberation` lê a ÚLTIMA ocorrência justamente por
    // isso; encerrar cedo demais desfaria essa proteção.
    const m = /^[ \t]*CHOICE:[ \t]*([a-z-]+)/im.exec(texto);
    if (!m) return false;
    const escolha = m[1].toLowerCase();
    return DELIBERATION_GOALS.some(
        (goal) => escolha === goal && texto.length > (m.index + m[0].length),
    );
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
export const DELIBERATION_EXTRACT_TIMEOUT_MS = 90_000;

type SmallInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<unknown>;
    cacheManager?: {
        delete?: (nameOrUrl: string) => Promise<void>;
    };
    exit?: () => Promise<void> | void;
};
type SmallCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => SmallInstance;

const medidorVontade = new DownloadMeter();

let enginePromise: Promise<SmallInstance | null> | null = null;
let disposePromise: Promise<void> | null = null;
let inFlight = false;
let currentAbort: AbortController | null = null;
let loadAbort: AbortController | null = null;
let loadingEngine: SmallInstance | null = null;
/**
 * O engine que está GERANDO agora. Existir separado de `loadingEngine` é o que
 * conserta a travada do aparelho: até aqui a preempção só encerrava o worker
 * que estava CARREGANDO, e o que estava gerando seguia queimando os núcleos
 * até os 320 tokens — junto com a fala que acabara de começar.
 */
let generatingEngine: SmallInstance | null = null;
/**
 * Conta as rodadas de deliberação. Encerrar o worker no meio pode deixar a
 * promessa do stream pendurada; se ela acordar depois, a rodada morta não pode
 * publicar uma decisão por cima da que já está valendo.
 */
let rodadaDeliberacao = 0;
/**
 * Os pesos já vieram para o aparelho nesta sessão (OPFS).
 *
 * Precisa ser separado de `enginePromise` porque agora o runtime é ENCERRADO na
 * pausa: sem esta memória, `vontadeJaCarregada()` passaria a responder "não" na
 * primeira preempção e a deliberação desistiria para sempre, achando que
 * precisaria baixar 1,32 GB de novo. Encerrar o worker não apaga o arquivo.
 */
let pesosNoAparelho = false;

export const SMALL_BRAIN_HANDOFF_TIMEOUT_MS = 3_000;

function abortError(): Error {
    const error = new Error('MiniBrain load aborted for conversation');
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
    abortFloor10MotorBrain();
    loadAbort?.abort();
    const loading = loadingEngine;
    loadingEngine = null;
    terminateSmallEngine(loading);
    // ── O QUE FALTAVA: ENCERRAR QUEM ESTÁ GERANDO ─────────────────────────
    //
    // `currentAbort.abort()` acima só faz o JS parar de ler. O worker continua
    // gerando até 320 tokens — e é exatamente isso que punha o Llama 1B e o
    // SmolLM3 nos mesmos núcleos ao mesmo tempo, travando o aparelho a ponto de
    // desligar. Nesta versão do wllama, encerrar o Worker é a única forma de
    // devolver CPU.
    //
    // Os pesos NÃO são perdidos: eles estão no OPFS. `enginePromise` é zerado
    // para a próxima rodada reabrir o runtime lendo do disco, sem baixar nada —
    // e `pesosNoAparelho` garante que a deliberação saiba disso.
    const gerando = generatingEngine;
    generatingEngine = null;
    if (gerando) {
        // O QUE ELE JÁ PENSOU É SALVO AQUI, e não só no `finally` da rodada:
        // matar o worker pode deixar a promessa do stream pendurada para
        // sempre, e nesse caso o `finally` nunca roda. `deliberationLive` é
        // publicado a cada 150 ms, então se perde no máximo isso.
        const salvou = pausedInference && !escolhaAssinada(npc.deliberationLive)
            && pausarPensamento('vontade', npc.deliberationLive, 0);
        anotar('vontade:preemptada', {
            fase: npc.deliberationPhase,
            pensado: npc.deliberationLive.length,
            guardou: !!salvou,
        });
        terminateSmallEngine(gerando);
        enginePromise = null;
        floor10ModelCoordinator.markUnloaded('deliberation');
        // A rodada acabou por decreto. Sem isto, uma promessa pendurada
        // deixaria `inFlight` travado e o livre-arbítrio morreria calado pelo
        // resto da sessão — defeito que este projeto já pagou uma vez.
        rodadaDeliberacao += 1;
        inFlight = false;
        // ── CEDER A VEZ NÃO É FALHAR ──────────────────────────────────────
        //
        // Esta linha é o conserto de "depois de eu mandar mensagem, o llama 1b
        // não volta a pensar". Quando a pausa passou a ENCERRAR o worker, a
        // rodada morta passou a devolver null — e quem chama (Floor10Npc) lê
        // null como FRACASSO e aumenta a espera a cada vez: 5s, 10s, 20s… até o
        // teto de 300s. Ou seja, quanto mais o jogador conversava, mais tempo a
        // vontade ficava de castigo, até parecer que tinha morrido.
        //
        // O projeto já tinha o conceito certo para isto e eu não o usei: a
        // rodada não fracassou, ela CEDEU A VEZ para a fala. Cedendo, a espera
        // continua no ciclo normal e ele volta a pensar assim que a conversa dá
        // uma folga.
        cedeuAVez = true;
    }
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
function ensureSmallEngine(
    cederParaFala = true,
    recoverBrokenCache = true,
    tentativa = 0,
): Promise<SmallInstance | null> {
    enginePromise ??= (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        // O MAIOR ARQUIVO DOS QUATRO (1,32 GB) ERA O ÚNICO SEM TETO NENHUM.
        // A fala tem cão de guarda desde o travamento por quota; a memória e o
        // motor tinham (teto total, hoje de inatividade). Aqui não havia nada:
        // se o download morresse em silêncio — sem erro, sem progresso — a
        // promessa não resolvia nem rejeitava e a vontade ficava "carregando"
        // até a página ser recarregada. Justamente no arquivo que passa mais
        // tempo exposto à rede do celular.
        let travou = false;
        const vigia = vigiarInatividade(() => { travou = true; controller.abort(); });
        let engine: SmallInstance | null = null;
        medidorVontade.reset();
        // REABRIR NÃO É BAIXAR. Depois que a pausa passou a encerrar o worker,
        // toda volta passa por aqui — e anunciar isso como download fazia a tela
        // mostrar uma barra de 1,32 GB que não existe, escondendo justamente o
        // "ele está voltando a pensar" que o jogador queria ver.
        const reabrindo = pesosNoAparelho;
        anotar(reabrindo ? 'vontade:reabrindo' : 'vontade:carregando', {
            modelo: SMALL_BRAIN_MODEL.id,
        });
        const comecouACarregar = Date.now();
        npcSet({
            deliberationPhase: reabrindo ? 'reopening' : 'loading',
            deliberationLoadText: reabrindo
                ? `reabrindo o ${SMALL_BRAIN_MODEL.label} (já está no aparelho)…`
                : `verificando o cache do ${SMALL_BRAIN_MODEL.label}…`,
            deliberationLoadProgress: reabrindo ? 1 : 0,
            deliberationDownload: DOWNLOAD_ZERO,
        });
        // A FALA PRIMEIRO — mas a pergunta certa é "CABEM OS DOIS?", não
        // "a fala já baixou?".
        //
        // Terceira versão desta trava, e as duas primeiras foram erro meu.
        // Ela nasceu porque os dois cérebros dividem o cofre do site e um
        // cérebro pequeno baixado antes derrubava a cota abaixo do que o
        // SmolLM3 precisa. Só que eu a escrevi como "espere a fala estar em
        // CACHE", e essa pergunta é respondida pelo cacheManager do wllama, que
        // não enxerga o armazenamento todo — ele responde "não" para modelos que
        // ESTÃO lá. Resultado no aparelho do Felipe: em jogo o cérebro pequeno
        // nunca baixava. (A primeira versão era pior ainda: valia também no
        // ?mente, onde não existe fala nenhuma.)
        //
        // Agora a conta é direta e verdadeira: se a cota do site couber os dois
        // modelos, baixa. Ele mediu 12 GB livres no aparelho — para quem tem
        // espaço, esta trava simplesmente não existe mais.
        if (cederParaFala) {
            const espaco = await readStorageEstimate();
            const precisa = Math.ceil(
                (SMALL_BRAIN_MODEL.bytes + SPEECH_BRAIN_BYTES) * CACHE_HEADROOM,
            );
            const livre = espaco.quota === null
                ? null
                : Math.max(0, espaco.quota - espaco.usage);
            // quota nula = navegador que não informa. Na dúvida, DEIXA TENTAR:
            // um palpite meu que bloqueia o cérebro é pior que um download que
            // falha com mensagem.
            if (livre !== null && livre < precisa) {
                npcSet({
                    deliberationPhase: 'off',
                    deliberationLoadText:
                        `a fala vem primeiro: ${formatGB(livre)} livres não cabem os dois cérebros `
                        + `(${formatGB(precisa)}). Libere espaço ou escolha o ${SMALL_BRAIN_CATALOG
                            .find((m) => m.id === 'llama32-1b-q4')?.label ?? 'modelo menor'} no ?mente.`,
                });
                enginePromise = null;
                loadAbort = null;
                return null;
            }
        }
        try {
            const backend = await probeModelStorageBackend();
            if (!backend.ok) throw new Error(backend.message);

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
            // CABE? A mesma defesa que a fala já tinha, que faltava aqui.
            // Sem ela, quando o cache estoura, o Worker levanta
            // QuotaExceededError — um DOMException, que não atravessa o
            // postMessage — e a promessa da carga não resolve NEM rejeita. Na
            // tela: "carregando" para sempre, sem uma palavra de explicação.
            // Publica o número também, para a barra poder mostrá-lo.
            const estimativa = await readStorageEstimate();
            const plano = planModelCache(estimativa, SMALL_BRAIN_MODEL.bytes);
            npcSet({
                storage: {
                    quota: estimativa.quota,
                    usage: estimativa.usage,
                    needBytes: Math.ceil(SMALL_BRAIN_MODEL.bytes * CACHE_HEADROOM),
                },
            });
            if (!plano.ok) {
                npcSet({
                    deliberationPhase: 'unavailable',
                    deliberationLoadText:
                        `${SMALL_BRAIN_MODEL.label} não cabe: ${plano.message}`,
                });
                enginePromise = null;
                loadAbort = null;
                return null;
            }
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
                    vigia.avancou();
                    const fraction = progress.total
                        ? Math.max(0, Math.min(1, (progress.loaded ?? 0) / progress.total))
                        : 0;
                    const amostra = medidorVontade.push(
                        progress.loaded ?? 0,
                        progress.total ?? 0,
                    );
                    floor10Fila.progresso(FILA_VONTADE, amostra);
                    npcSet({
                        deliberationDownload: amostra,
                        deliberationLoadProgress: fraction,
                        deliberationLoadText:
                            `baixando ${SMALL_BRAIN_MODEL.label} · ${downloadLine(amostra)}`,
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
            // VEIO MODELO OU VEIO CASCA? Ver floor10Carga: um GGUF truncado faz
            // a carga RESOLVER com nVocab/nLayer zerados, e o estouro só vem no
            // primeiro pensamento — onde vira "a vontade parou de funcionar".
            await conferirModeloCarregado(engine);
            npcSet({
                deliberationLoadProgress: 1,
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · iniciando vontade`,
            });
            // O .gguf está no OPFS a partir daqui. Encerrar o worker na pausa
            // não desfaz isto — por isso a bandeira é separada do runtime.
            pesosNoAparelho = true;
            anotar('vontade:pronta', {
                ms: Date.now() - comecouACarregar,
                reabertura: reabrindo,
                threads: smallBrainThreads(),
            });
            return engine;
        } catch (falha) {
            terminateSmallEngine(engine);
            if (
                !controller.signal.aborted
                && recoverBrokenCache
                && isBrokenModelCacheError(falha)
                && await deleteCachedModel(engine?.cacheManager, SMALL_BRAIN_MODEL.url)
            ) {
                npcSet({
                    deliberationPhase: 'loading',
                    deliberationLoadProgress: 0,
                    deliberationLoadText:
                        `o cache do ${SMALL_BRAIN_MODEL.label} ficou `
                        + 'incompleto; baixando de novo…',
                });
                enginePromise = null;
                return ensureSmallEngine(cederParaFala, false, tentativa);
            }
            // REDE CAIU ≠ VONTADE INDISPONÍVEL. Este é o arquivo mais pesado do
            // andar: 1,32 GB são muitos minutos de exposição a uma rede de
            // celular, e o que já desceu está no OPFS — a tentativa seguinte
            // continua. Antes, um único soluço custava o download inteiro.
            if (
                (travou || !controller.signal.aborted)
                && tentativa + 1 < FLOOR10_TENTATIVAS
                && (travou || ehFalhaTransitoria(falha))
            ) {
                const espera = esperaDaTentativa(tentativa + 1);
                npcSet({
                    deliberationPhase: 'loading',
                    deliberationDownload: DOWNLOAD_ZERO,
                    deliberationLoadText: textoDaTentativa(
                        SMALL_BRAIN_MODEL.label,
                        tentativa + 1,
                        espera,
                    ),
                });
                enginePromise = null;
                await esperar(espera, travou ? undefined : controller.signal);
                if (!travou && controller.signal.aborted) return null;
                return ensureSmallEngine(cederParaFala, recoverBrokenCache, tentativa + 1);
            }
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
            vigia.parar();
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
    /** Sensores da sala, sem a regra/solução do puzzle. */
    prison?: F10PrisonState | null;
    now: number;
};

function conversationHasPriority(): boolean {
    // ── O PAINEL ABERTO É PARADA, E ISTO CUSTOU CARO PARA APRENDER ────────
    //
    // Aqui dizia: "O Mini pode formar intenções com o painel aberto, enquanto o
    // jogador pensa no que escrever. Ele só para durante carga/geração real do
    // Smol." A ideia é boa e o efeito no aparelho é péssimo, porque pausar
    // ENCERRA o Worker e voltar custa reabrir 1,32 GB:
    //
    //   jogador abre o chat  -> a vontade continua liberada e REABRE 1,32 GB
    //   jogador digita       -> a fala pausa a vontade e MATA o que reabriu
    //   jogador fecha        -> reabre de novo
    //
    // Cada abre-e-fecha do chat pagava uma ou duas inicializações completas de
    // modelo. O relato foi exatamente esse: "quando eu saio do chat, e entro,
    // LAGA TUDO".
    //
    // Com o painel aberto contando como prioridade da conversa, nenhuma rodada
    // NOVA começa — logo não há reabertura para matar depois. É a arquitetura
    // que o dono do jogo descreveu: com o chat aberto ficam de pé só o SmolLM3
    // e o embedding; a vontade e o motor esperam a vez.
    //
    // O que ele pediu e NÃO dá para fazer é a suspensão de verdade (runtime
    // vivo, zero CPU, volta instantânea). Medido nesta caixa, com o modelo e o
    // runtime reais: o glue do wllama não expõe ação de parar, e picar a
    // geração em pedaços — a única saída sem recompilar — custa 1,93x em
    // pedaços de 16 tokens e 9,33x em pedaços de 8, com cada pedaço mais lento
    // que o anterior. O remédio sai mais caro que a doença.
    //
    // A REGRA MORA NA PRÉ-CARGA, e não é um detalhe de arrumação. Esta função
    // segurava as RODADAS de deliberação, mas quem estava subindo 1,32 GB no
    // meio da conversa era a FILA — que perguntava a si mesma, ou seja, não
    // perguntava nada. Duas cópias da mesma regra é como o buraco existiu.
    return conversaOcupaOAparelho();
}

/**
 * Segunda passada: devolve a linha "CHOICE: x" tirada do raciocínio que o modelo
 * acabou de escrever. Devolve '' se falhar — o resgate nunca pode derrubar a
 * rodada, ele só tenta salvá-la.
 */
/**
 * Por que o último resgate falhou. Engolir esta exceção já me custou caro duas
 * vezes neste andar (a carga infinita por quota e as rodadas de zero token):
 * o resgate NÃO pode derrubar a deliberação, mas o motivo tem que aparecer em
 * algum lugar — a sala da mente lê daqui.
 */
let ultimoErroResgate: string | null = null;

export function erroDoResgate(): string | null {
    return ultimoErroResgate;
}

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
            // SEM o prompt de sistema, de propósito. Medido no navegador: com
            // ele, esta chamada de 16 tokens estourava o teto de 45s — o custo
            // não era gerar, era RELER os ~330 tokens da persona. E ela não faz
            // falta aqui: o Nilo já pensou, isto é só a assinatura.
            messages: [
                { role: 'user', content: buildChoiceExtractionPrompt(pensamento) },
            ],
            ...SMALL_BRAIN_EXTRACT_CONFIG,
            abortSignal: controller.signal,
        });
        const texto = readCompletionText(response);
        ultimoErroResgate = texto.trim()
            ? null
            : `resposta vazia — ${JSON.stringify(response).slice(0, 160)}`;
        return texto;
    } catch (e) {
        ultimoErroResgate = controller.signal.aborted
            ? `cortado pelo teto de ${DELIBERATION_EXTRACT_TIMEOUT_MS / 1000}s`
            : String(e).slice(0, 200);
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
/**
 * A ÚLTIMA RODADA FOI DESISTÊNCIA, NÃO FRACASSO?
 *
 * `deliberateFloor10` devolve `null` em duas situações muito diferentes: ele
 * TENTOU E FALHOU, ou ele CEDEU A VEZ porque o jogador está conversando e a
 * fala tem prioridade. O jogo contava as duas como falha e crescia a espera
 * exponencialmente.
 *
 * O efeito no aparelho: enquanto o modelo de fala baixa — minutos, no celular
 * — a deliberação cede a vez a cada 5 segundos. Em poucas rodadas a espera
 * bate o teto de 300s. Quando a fala finalmente termina e a CPU fica livre, o
 * cérebro de vontade está de castigo por 5 minutos por um crime que não
 * cometeu: ele nunca chegou a tentar. É por isso que "depois ele não baixa".
 */
let cedeuAVez = false;
export function deliberationYieldedTurn(): boolean { return cedeuAVez; }

/**
 * O CÉREBRO DE VONTADE JÁ ESTÁ NO APARELHO?
 *
 * Pergunta sem baixar nada. `enginePromise` só existe depois que alguém pediu
 * a carga — e é essa distinção que faltava.
 */
export function vontadeJaCarregada(): boolean {
    // `enginePromise` deixou de ser a única prova: a pausa encerra o runtime
    // para devolver CPU, mas o .gguf continua no aparelho. Sem `pesosNoAparelho`
    // a deliberação desistiria de vez depois da primeira fala do jogador.
    return enginePromise !== null || pesosNoAparelho;
}

/**
 * O RUNTIME ESTÁ ABERTO AGORA? — pergunta diferente de `vontadeJaCarregada`, e
 * a diferença custou o aparelho do dono do jogo quase reiniciando.
 *
 * `vontadeJaCarregada` responde "os pesos estão no celular", que continua
 * verdadeiro depois de uma pausa. Mas a pausa ENCERRA o Worker, e voltar a
 * pensar exige reabrir: ler 1,32 GB do OPFS para dentro do WASM, alocar tudo
 * de novo e subir o pool de threads. Medido nesta caixa, com o modelo de
 * 1,92 GB já em cache, isso custa 7,5–8,2 s de CPU cheia; num celular é vários
 * múltiplos disso.
 *
 * Quem decide QUANDO voltar precisa saber se vai pagar esse preço ou não.
 */
export function vontadeRuntimeAberto(): boolean {
    return enginePromise !== null;
}

export async function deliberateFloor10(
    input: DeliberateInput,
): Promise<Floor10Deliberation | null> {
    if (inFlight || conversationHasPriority()) { cedeuAVez = true; return null; }
    // ── A DELIBERAÇÃO NÃO BAIXA NADA ──────────────────────────────────────
    //
    // Isto é o defeito que quem joga encontrou: "sempre que eu entro no andar,
    // o download da vontade inicia, sendo que isso é pra acontecer só quando eu
    // clicar em conversar".
    //
    // Estava certo. O laço de deliberação começa a rodar assim que o NPC nasce
    // no andar, e ele chamava `ensureSmallEngine` — que BAIXA. Ou seja: pisar no
    // 10º disparava 1,32 GB sem ninguém pedir, competindo com a fala e com a
    // própria fila de pré-carga que eu tinha acabado de escrever. Os dois
    // brigando pelo mesmo lugar explicam a carga travada e o "pulou direto".
    //
    // Agora ela USA o cérebro se ele já estiver no aparelho, e desiste em
    // silêncio se não estiver. Quem manda baixar é a fila, e a fila começa no
    // botão de conversar. Desistir aqui é ceder a vez, não fracassar — senão a
    // espera cresceria até o teto por um download que ninguém pediu.
    if (!vontadeJaCarregada()) { cedeuAVez = true; return null; }
    cedeuAVez = false;
    inFlight = true;
    try {
        const engine = await floor10ModelCoordinator.activate(
            'deliberation',
            // Automática: cede a vez para a fala, que é quem o jogador espera.
            () => ensureSmallEngine(true),
        );
        if (!engine) {
            const unavailable = npc.deliberationPhase === 'unavailable';
            const unavailableText = npc.deliberationLoadText;
            // markUnloaded, NÃO release.
            //
            // `release` chama o descarregador registrado — e aqui não há nada
            // carregado para descarregar: a carga acabou de falhar ou de ser
            // recusada. Pior: quando havia, isso virava carregar e DESCARREGAR
            // a cada rodada que falhasse, que é justamente o vaivém que o
            // Felipe pediu para acabar. Este caminho só acerta a contabilidade
            // do coordenador para a próxima tentativa poder acontecer.
            floor10ModelCoordinator.markUnloaded('deliberation');
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
        if (conversationHasPriority()) { cedeuAVez = true; return null; }
        npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 1,
            deliberationLoadText: `${SMALL_BRAIN_MODEL.label} pronto · escolhendo uma intenção`,
        });
        currentAbort = new AbortController();
        const abort = currentAbort;
        // A partir daqui existe um worker GERANDO. `abortDeliberation` precisa
        // dele para encerrar de verdade: o abort do wllama sozinho só faz o JS
        // parar de ler, e o worker seguiria queimando os núcleos junto da fala.
        generatingEngine = engine;
        const minhaRodada = ++rodadaDeliberacao;
        // TETO DE TEMPO. Sem ele, um worker preso deixava esta promessa pendente
        // para sempre; como `inFlight` só é liberado no finally, o livre-arbítrio
        // morria calado pelo resto da sessão. Agora a rodada é abandonada e a
        // próxima tenta de novo.
        const relogio = globalThis.setTimeout(() => abort.abort(), DELIBERATION_TIMEOUT_MS);
        // ── O PENSAMENTO SAI AO VIVO ──────────────────────────────────────
        //
        // Antes esta chamada era `stream: false`: o texto aparecia inteiro, de
        // uma vez, dois minutos depois. De fora, "pensando…" e "travado" eram a
        // mesma imagem — não dava para saber se havia alguém trabalhando.
        //
        // Em stream o custo é o mesmo (o modelo já gerava token a token; só o
        // JS não olhava) e ganha-se duas coisas: o raciocínio pode ser LIDO
        // enquanto nasce, e a rodada pode PARAR assim que ele assina a escolha,
        // em vez de continuar até o teto de 320 tokens.
        const comecouAPensar = Date.now();
        // ── RETOMAR DE ONDE PAROU ─────────────────────────────────────────
        // Se a fala do jogador interrompeu um raciocínio recente, ele NÃO
        // recomeça do primeiro token: o que já tinha sido pensado volta como
        // ponto de partida. Sem isto, um pensamento de ~320 tokens a 2 tok/s
        // nunca fechava — bastava o jogador falar de vez em quando para ele
        // reiniciar para sempre.
        const retomado = pensamentoPausado('vontade');
        anotar(retomado ? 'vontade:retomando' : 'vontade:pensando', {
            herdado: retomado?.parcial.length ?? 0,
        });
        const base = retomado?.parcial ?? '';
        // A continuação é acumulada à parte para poder ser EMENDADA à base: o
        // modelo costuma reescrever o fim da frase anterior antes de seguir.
        let continuacao = '';
        let texto = base;
        let tokens = 0;
        let cortadoNaEscolha = false;
        npcSet({
            deliberationLive: texto,
            deliberationThreads: smallBrainThreads(),
            deliberationSeconds: 0,
        });
        try {
            const stream = await engine.createChatCompletion({
                messages: [
                    { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: retomado
                            ? promptDeRetomada(
                                buildDeliberationPrompt(input.perception, input.drives, input.memory),
                                retomado.parcial,
                            )
                            : buildDeliberationPrompt(input.perception, input.drives, input.memory),
                    },
                ],
                ...SMALL_BRAIN_COMPLETION_CONFIG,
                stream: true,
                abortSignal: abort.signal,
            }) as AsyncIterable<unknown>;
            let publicadoEm = 0;
            for await (const chunk of stream) {
                const c = chunk as ChatChunk;
                // Mesmo vazamento do cérebro de fala: os restos da rodada
                // anterior vêm na frente. Sem descartar, "CHOICE: idle" chegava
                // como "OSE: idleCHO" e a decisão era perdida.
                // Volta para a BASE, não para o vazio: os restos da rodada
                // anterior são descartados sem jogar fora o que ele já pensou
                // antes da pausa.
                if (chunkOpensReply(c)) { continuacao = ''; texto = base; tokens = 0; }
                const pedaco = chunkPensamento(c);
                if (!pedaco) continue;
                continuacao += pedaco;
                texto = emendarPensamento(base, continuacao);
                tokens += 1;
                // A tela não precisa de 30 atualizações por segundo; cada uma
                // custa um re-render do painel inteiro.
                const agora = Date.now();
                if (agora - publicadoEm >= PENSAMENTO_PUBLICA_MS) {
                    publicadoEm = agora;
                    npcSet({
                        deliberationLive: texto,
                        deliberationSeconds: (agora - comecouAPensar) / 1000,
                    });
                }
                if (escolhaAssinada(texto)) { cortadoNaEscolha = true; break; }
            }
        } catch {
            // Cortado pela fala, pelo teto ou pelo worker. O que já saiu vale:
            // se ele chegou a assinar a escolha, a rodada ainda conta.
        } finally {
            globalThis.clearTimeout(relogio);
            generatingEngine = null;
            // PAUSOU, NÃO PERDEU. Se a fala cortou no meio e ele ainda não
            // tinha assinado, o raciocínio fica guardado e a próxima rodada
            // continua daí — em vez de recomeçar do primeiro token.
            if (abort.signal.aborted && !escolhaAssinada(texto)) {
                pausarPensamento('vontade', texto, tokens);
            }
            const segundos = (Date.now() - comecouAPensar) / 1000;
            anotar('vontade:fim-da-geracao', {
                tokens,
                s: segundos,
                tps: segundos > 0 ? tokens / segundos : 0,
                cortada: abort.signal.aborted,
                assinou: escolhaAssinada(texto),
            });
            npcSet({
                deliberationLive: texto,
                deliberationSeconds: segundos,
                deliberationTps: segundos > 0 ? tokens / segundos : 0,
            });
        }
        // A RODADA AINDA É A ATUAL? Se o worker foi encerrado pela fala, esta
        // promessa pode ter acordado tarde. Publicar daqui seria sobrescrever a
        // decisão de uma rodada mais nova com o eco de uma morta.
        if (minhaRodada !== rodadaDeliberacao) return null;

        // PARAR NO "CHOICE:" É ENCERRAR A RODADA, não interromper o modelo no
        // meio de uma frase: a linha da escolha é a última coisa que ele
        // escreve, por instrução do prompt.
        //
        // O QUE ISSO ECONOMIZA, E O QUE NÃO ECONOMIZA — sem ilusão: o `abort`
        // do wllama 3.5.1 só faz o JS PARAR DE LER (`getResponse` checa o sinal
        // entre um `get_result` e outro); o worker continua gerando até o EOS
        // ou até os 320 tokens. Portanto isto não devolve CPU. O que ele
        // devolve é TEMPO DE JOGO: a intenção chega ao corpo do Nilo assim que
        // ele a assina, em vez de esperar o resto do texto que ninguém vai ler.
        if (cortadoNaEscolha) {
            npcSet({
                deliberationLoadText:
                    `${SMALL_BRAIN_MODEL.label} · assinou a escolha em ${tokens} tokens`,
            });
        }

        // Cadeia de pensamento girando no lugar: a gramática limita QUAIS
        // palavras saem, não quantas vezes. Descartar aqui evita alimentar o
        // corpo com uma "decisão" tirada de um texto em círculo.
        if (looksLikeLoop(texto)) {
            // Pensamento girando no lugar não merece ser retomado: continuar
            // dele só faria o círculo crescer.
            descartarPensamento('vontade');
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
        if (decided && texto.trim() && !conversationHasPriority()) {
            const motion = await translateFloor10MotorThought(
                texto,
                input.perception,
                input.prison,
                abort.signal,
            );
            if (motion) decided = { ...decided, motion };
        }
        if (decided) {
            descartarPensamento('vontade');
            anotar('vontade:decidiu', { meta: decided.goal, motor: !!decided.motion });
            npcSet({
                deliberationPhase: 'decided',
                deliberationLoadText: decided.motion
                    ? `${SMALL_BRAIN_MODEL.label} pronto · ${decided.motion.verb} ${decided.motion.target}`
                    : `${SMALL_BRAIN_MODEL.label} pronto no cache`,
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
    // A sala da mente observa o cérebro pequeno SOZINHO: não há fala nesta
    // página, então esperar por ela seria esperar para sempre.
    const engine = await floor10ModelCoordinator.activate(
        'deliberation',
        () => ensureSmallEngine(false),
    );
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
    let erro: string | null = null;
    if (!decided && !opts.useGrammar && raw.trim() && !looksLikeLoop(raw)) {
        resgate = (await assinarEscolha(engine, raw)) || null;
        if (resgate) decided = parseDeliberation(`${raw}\n${resgate}`, input.now);
        else erro = `resgate falhou: ${erroDoResgate() ?? 'sem motivo'}`;
    }
    if (decided && raw.trim() && !looksLikeLoop(raw)) {
        const motion = await translateFloor10MotorThought(
            raw,
            input.perception,
            input.prison,
        );
        if (motion) decided = { ...decided, motion };
    }
    return {
        raw,
        decided,
        loop: looksLikeLoop(raw),
        ms: Date.now() - comecou,
        tokens,
        erro,
        resgate,
    };
}

/**
 * SÓ BAIXA. Não delibera, não decide, não gasta token.
 *
 * Faltava exatamente isto. Cada cérebro só começava a descer quando alguém
 * PRECISAVA dele — a vontade na primeira deliberação, o motor no primeiro
 * pensamento a traduzir. O resultado no aparelho de quem joga: a barra da fila
 * parava em "1 de 3 · 49%" e ficava lá, porque os outros dois nunca tinham
 * sido pedidos. Uma barra que soma três coisas que ninguém mandou baixar é uma
 * barra mentirosa.
 *
 * `cederParaFala: false` porque quem chama isto é a fila, que já esperou a
 * fala terminar — a trava de "a fala vem primeiro" já foi respeitada lá fora.
 */
export async function precarregarVontade(): Promise<boolean> {
    const engine = await floor10ModelCoordinator.activate(
        'deliberation',
        () => ensureSmallEngine(false),
    );
    return engine !== null;
}

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    abortDeliberation();
    resetFloor10MotorBrainForTests();
    floor10ModelCoordinator.markUnloaded('deliberation');
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
    loadAbort = null;
    loadingEngine = null;
}
