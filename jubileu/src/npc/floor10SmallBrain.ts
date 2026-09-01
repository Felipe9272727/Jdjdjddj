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
import {
    metaDoPlanoMotor,
} from './floor10MotorCortex';
import { MemoriaDeBolhas, gerarBolha } from './floor10Bolha';
import {
    PERSONA_DO_REVISOR_TREINADO, REMENDO_TREINADO_TOKENS, TEMPERATURA_DO_TREINADO,
    PENSAMENTO_TREINADO_TOKENS,
    enunciadoTreinado,
} from './floor10RevisorTreinado';
import { completar as completarNoMicro } from './floor10Reflexo';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import { anotar } from './floor10CaixaPreta';
import { revisorAtual } from './floor10Revisores';
import { camadasNoPipeline, gpuDoPipelineCaiu, marcarGpuDoPipelineReprovada } from './floor10Gpu';
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
    conferirCacheDeModelo, limparModeloDoCache, type CacheDoWllama,
} from './floor10CacheDeModelos';
import { baixarSemSubir, type CofreDeModelos } from './floor10Roteamento';
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
// O revisor vive aqui, mas o VOCABULÁRIO do desfecho é do pipeline: é ele que
// confronta a resposta com a frase original e decide "trocou" ou "manteve".
import {
    primeiraFraseFechada, semRaciocinio, type RespostaDoRevisor,
} from './floor10Pipeline';

export { SMALL_BRAIN_CATALOG, type SmallBrainId } from './floor10Brains';
import {
    cerebroEscolhido, definirCerebroEscolhido, SMALL_BRAIN_STORAGE_KEY,
} from './floor10Brains';

// Mesmos overrides do cérebro de fala. Sem eles o cérebro PEQUENO era
// impossível de testar fora da internet aberta: runtime e modelo estavam
// fixos, e a deliberação simplesmente nunca rodava numa caixa fechada — o que
// escondia justamente os defeitos de loop e de travamento que ele pode ter.
// ── O MOTOR DA CASA TAMBÉM AQUI ──────────────────────────────────────────
//
// Medido abrindo o jogo de verdade (`bancada-navegador/andar-10-real.mjs`): a
// fala já subia por `/wllama-relaxed`, mas o navegador AINDA buscava
// `cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js` — porque só o
// cérebro de fala tinha sido trocado. Os outros continuavam no CDN.
//
// São dois ganhos, e nenhum é hipótese:
//
//   · velocidade — o binário implantado mede 8,81–9,00 tok/s contra 6,82 do
//     CDN em modelo denso (é o caso destes três), fora os 3x do granite;
//   · o jogo deixa de depender do jsdelivr em tempo de execução.
//
// E não é caminho novo: `?motor=relaxed` já escrevia `__wllamaCdn` com este
// mesmo valor, então esta linha só torna PADRÃO o que já era testável por
// bandeira. `?wllama=<versão>` continua levando ao CDN para comparar.
const MOTOR_DA_CASA = '/wllama-relaxed';
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? MOTOR_DA_CASA;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM_SINGLE = `${CDN}/wasm/wllama.wasm`;

// A resolução de QUAL cérebro está escolhido mora em floor10Brains, e não aqui,
// porque o wllamaEngine também precisa dela — ele tem de saber qual NÃO apagar
// quando falta cota para a fala. Duas cópias da mesma regra é como este projeto
// já criou buraco antes (a fila perguntando a si mesma se a conversa estava
// ocupada). floor10Brains não importa motor nenhum, então não há ciclo.
/**
 * ── UM MOTOR, DOIS PAPÉIS, UM ARQUIVO ────────────────────────────────────
 *
 * O mesmo slot de llama.cpp serve a VONTADE (o Nilo pensando entre falas) e o
 * REVISOR (remendar uma frase marcada), e os dois usam o MESMO gguf — quem
 * escolhe qual é `?revisor=`, lá no `floor10Brains`.
 *
 * AQUI CHEGOU A EXISTIR UMA MÁQUINA DE TROCAR DE PAPEL, com descarga do modelo
 * no meio, para o revisor poder ter arquivo próprio. Ela foi apagada junto com
 * o segundo download: "não precisa baixar os dois". Com um arquivo só, trocar
 * de papel não troca de nada, e a função mais segura é a que não existe.
 */
function brainAtual() {
    return SMALL_BRAIN_CATALOG.find((m) => m.id === cerebroEscolhido()) ?? SMALL_BRAIN_CATALOG[0];
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
    if (id === cerebroEscolhido()) return;
    if (!SMALL_BRAIN_CATALOG.some((m) => m.id === id)) return;
    await unloadSmallBrain();
    definirCerebroEscolhido(id);
    try {
        globalThis.localStorage?.setItem(SMALL_BRAIN_STORAGE_KEY, id);
    } catch { /* sem localStorage a escolha só vale para esta sessão */ }
}

/**
 * ── E VOLTOU A SER O TETO DA FALA ─────────────────────────────────────────
 *
 * Cortei para 2 lendo ao pé da letra o "2 pra vontade" que ele tinha dito, e
 * ele corrigiu na hora: "a vontade tem que ser mais RÁPIDA que a mente". Faz
 * sentido — ela roda quando o jogador NÃO está no chat, ou seja, sozinha no
 * aparelho. Dar metade dos núcleos a quem tem a máquina inteira à disposição é
 * desperdício, e foi exatamente esse o erro que eu já tinha consertado antes e
 * refiz ao contrário.
 *
 * O "2 pra vontade" dele descrevia QUANTOS MODELOS ficam de pé por vez (llama
 * 1b + motor), não quantas threads. Eu confundi as duas coisas.
 *
 * A trava que ele relatou ao baixar a vontade tem outra causa e outro conserto:
 * ela não devia estar SUBINDO enquanto ele usa o chat. Isso é roteamento, não
 * orçamento de thread.
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
/**
 * Os IDs cujos pesos já estão no aparelho.
 *
 * ERA UM BOOLEANO, e virou conjunto quando o revisor pôde ter arquivo próprio.
 * Com um `let pesosNoAparelho = false` global, baixar a vontade marcava "já
 * tenho" e o download do revisor saía pela porta dos fundos na primeira linha
 * (`if (pesosNoAparelho) return true`) — a barra fechava, o arquivo nunca
 * descia, e o remendo só falharia depois, na hora de abrir o modelo.
 */
const pesosBaixados = new Set<string>();

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
    // e `pesosBaixados` garante que a deliberação saiba disso.
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
    // 'reopening' PRECISAVA ESTAR NESTA LISTA.
    //
    // Ela nasceu com 'thinking' e 'loading', e 'reopening' foi acrescentado ao
    // vocabulário DEPOIS, quando a pausa passou a encerrar o worker. Ninguém
    // voltou aqui. Resultado: interromper uma REABERTURA deixava a fase
    // congelada, e a tela ficava dizendo "Nilo está voltando a pensar…" para
    // sempre — que é a foto que ele mandou do aparelho dele.
    if (npc.deliberationPhase === 'thinking'
        || npc.deliberationPhase === 'loading'
        || npc.deliberationPhase === 'reopening') {
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
        const reabrindo = pesosBaixados.has(SMALL_BRAIN_MODEL.id);
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
                // Depois do spread, de propósito: é esta linha que vence o zero
                // do objeto congelado quando `?ngl=` liga o experimento da GPU.
                n_gpu_layers: camadasNoPipeline(),
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
            pesosBaixados.add(SMALL_BRAIN_MODEL.id);
            anotar('vontade:pronta', {
                ms: Date.now() - comecouACarregar,
                reabertura: reabrindo,
                threads: smallBrainThreads(),
                // Sem isto, uma rodada com `?ngl=7` no celular dele é
                // indistinguível de uma sem, e o experimento vira opinião.
                ngl: camadasNoPipeline(),
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
            // ── A GPU FALHOU? VOLTA PARA A CPU, E A FALA CONTINUA ────────
            //
            // O WebGPU do wllama já quebrou duas vezes no aparelho do dono do
            // jogo — "(ABORT)" numa fala, "loadModel() is not yet called" na
            // outra — e ele resumiu: "o do wllama é muito ruim". Se o
            // experimento de `?ngl=` reproduzir isso, o revisor NÃO pode sumir
            // junto: a regra do pipeline é que otimização que falha não custa a
            // fala.
            //
            // Uma vez por sessão, e daí em diante `camadasNoPipeline()` devolve
            // zero sozinho — não adianta tentar de novo com o mesmo binário no
            // mesmo aparelho.
            if (!controller.signal.aborted && camadasNoPipeline() > 0 && !gpuDoPipelineCaiu()) {
                marcarGpuDoPipelineReprovada();
                anotar('vontade:gpu-caiu', {
                    motivo: (falha instanceof Error ? falha.message : String(falha)).slice(0, 80),
                });
                npcSet({
                    deliberationPhase: 'loading',
                    deliberationLoadProgress: 0,
                    deliberationLoadText: 'a GPU falhou; recarregando na CPU…',
                });
                enginePromise = null;
                return ensureSmallEngine(cederParaFala, recoverBrokenCache, tentativa);
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
            } else {
                // ── ABORTADO NÃO É "MORTO PARA SEMPRE" ────────────────────
                //
                // Sem este ramo a fase ficava em 'reopening' e o jogador via
                // "Nilo está voltando a pensar…" PARA SEMPRE. Foi exatamente o
                // que ele fotografou: o balão preso, e "ele nunca mais pensa".
                npcSet({
                    deliberationPhase: 'off',
                    deliberationLoadText: `${SMALL_BRAIN_MODEL.label} no aparelho · em espera`,
                });
            }
            // ── E O `null` NÃO PODE FICAR EM CACHE ────────────────────────
            //
            // Este é o defeito de verdade. `ensureSmallEngine` começa com
            // `enginePromise ??= (async () => …)()`, então uma promessa que
            // resolveu `null` fica GUARDADA: toda chamada seguinte devolve o
            // mesmo `null` na hora, sem tentar nada. A vontade morre pelo resto
            // da sessão, e nada na tela diz por quê.
            //
            // Os ramos de retentativa acima já limpavam (`enginePromise = null`)
            // — só o ramo final não limpava, que é o que sobra quando a carga é
            // ABORTADA ou quando as três tentativas acabam. E abortar deixou de
            // ser raro: `unloadSmallBrain` chama `abortDeliberation`, e o
            // roteamento que eu instalei chama `unloadSmallBrain` A CADA
            // ABERTURA DE CHAT. Se ele abrir o chat enquanto a vontade está
            // reabrindo — janela de vários segundos, logo depois de fechar —
            // a vontade morre ali e não volta mais.
            //
            // Ou seja: o defeito era latente e a minha mudança o tornou
            // alcançável em uso normal. `deliberateFloor10` já chama
            // `markUnloaded` "para a próxima tentativa poder acontecer"; sem
            // esta linha, essa próxima tentativa nunca existiu.
            enginePromise = null;
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
    /**
     * O prompt da PRIMEIRA passada. Quando vem, o resgate CONTINUA aquela
     * conversa em vez de abrir uma nova — e é isso que faz o `cache_prompt`
     * ter o que aproveitar. Opcional para os chamadores antigos seguirem
     * funcionando; sem ele o comportamento é o de antes.
     */
    promptOriginal?: string,
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
            // ── O RESGATE CONTINUA A CONVERSA, E ISSO É 4x MAIS BARATO ────
            //
            // Aqui estava escrito: "SEM o prompt de sistema, de propósito.
            // Medido: com ele, esta chamada de 16 tokens estourava o teto de
            // 45s — o custo não era gerar, era RELER os ~330 tokens da
            // persona." O número era real; a CAUSA estava invertida.
            //
            // O problema nunca foi a persona ESTAR ali — foi o prompt não
            // compartilhar prefixo nenhum com a chamada anterior. Sem prefixo
            // comum, `cache_prompt: true` não tem o que aproveitar e o modelo
            // relê tudo, seja a persona (45s) ou a cauda do pensamento (18s).
            //
            // Medido no navegador, mesmo modelo, mesmas cinco situações:
            //
            //     prompt isolado (o de antes) .... 17.888 ms por resgate
            //     continuando a conversa ......... 4.264 ms por resgate
            //
            // 4,2x mais barato, e as duas versões assinam 5/5 — a qualidade
            // não muda. O prefixo (sistema + estado do mundo) é IDÊNTICO ao da
            // primeira passada, então só o pensamento e a pergunta são lidos.
            //
            // Isso importa além do relógio: QUATRO de cada cinco rodadas
            // precisam de resgate, então esta chamada é quase tão frequente
            // quanto a deliberação em si — e o custo dela não estava em conta
            // nenhuma do orçamento de CPU do andar.
            messages: promptOriginal
                ? [
                    { role: 'system' as const, content: DELIBERATION_SYSTEM_PROMPT },
                    { role: 'user' as const, content: promptOriginal },
                    { role: 'assistant' as const, content: pensamento },
                    {
                        role: 'user' as const,
                        content: 'Which option is that? Answer with one line only.',
                    },
                ]
                : [{ role: 'user', content: buildChoiceExtractionPrompt(pensamento) }],
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
/**
 * ── O RUNTIME ESTÁ DE PÉ AGORA? ──────────────────────────────────────────
 *
 * Diferente de `vontadeJaCarregada`, e a diferença travou o jogo. Aquela
 * responde `enginePromise !== null || pesosBaixados.has(…)`, e `baixarVontade`
 * marca o id como baixado — então, depois de apenas BAIXAR, ela já diz "sim".
 *
 * O pipeline usava ela para decidir se podia chamar o revisor. Passava, e o
 * `remendarFraseEmIngles` ia SUBIR 1,25 GB no meio de uma fala, com o
 * rascunhador já residente e sem prazo nenhum — a tela ficava em "corrigindo
 * uma frase…" para sempre.
 *
 * Quem pergunta "posso usar o revisor agora, sem pagar uma carga?" precisa
 * desta aqui. O nome da outra promete mais do que ela entrega, e eu confiei no
 * nome.
 */
export function vontadeDePeAgora(): boolean {
    return enginePromise !== null;
}

export function vontadeJaCarregada(): boolean {
    // `enginePromise` deixou de ser a única prova: a pausa encerra o runtime
    // para devolver CPU, mas o .gguf continua no aparelho. Sem `pesosBaixados`
    // a deliberação desistiria de vez depois da primeira fala do jogador.
    return enginePromise !== null || pesosBaixados.has(SMALL_BRAIN_MODEL.id);
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

// ── A LINHA QUE O JOGADOR LÊ ──────────────────────────────────────────────
//
// Uma memória só, viva enquanto a página existe: é a mesma pessoa falando a
// partida inteira, e o ponto do pedido era justamente ele não repetir.
const bolhas = new MemoriaDeBolhas();

/**
 * Escreve a bolha desta decisão no micro (135M, ONNX, já residente fora da
 * conversa) e publica — se ela ainda for a decisão vigente.
 *
 * NUNCA lança e nunca segura o passeio: é chamada com `void`. O `selo` é o
 * contador de deliberações no instante da decisão; se ele mudou, uma rodada
 * nova já entrou e esta linha descreve o passado.
 */
async function escreverBolha(meta: string, pensamento: string, selo: number): Promise<void> {
    try {
        const { linha, doModelo } = await gerarBolha({
            meta,
            pensamento,
            memoria: bolhas,
            completar: (prompt, teto) => completarNoMicro(
                prompt, teto, { amostrar: true, maxTokens: 32 },
            ),
        });
        if (npc.deliberationCount !== selo || npc.deliberationPhase !== 'decided') {
            anotar('bolha:tarde-demais', { meta, selo });
            return;
        }
        npcSet({ deliberationBubble: linha });
        anotar('bolha:escreveu', { meta, doModelo, letras: linha.length });
    } catch (erro) {
        // A frase pronta já está na tela desde o `npcSet` da decisão: não há o
        // que consertar aqui, só o que não derrubar.
        anotar('bolha:erro', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 60),
        });
    }
}

/** Só para os testes: a memória de bolhas atravessa a página inteira. */
export function resetBolhasForTests(): void { bolhas.limpar(); }

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
            } else if (npc.deliberationPhase === 'reopening'
                || npc.deliberationPhase === 'loading') {
                // REDE DE SEGURANÇA, não o conserto.
                //
                // O conserto do "voltando a pensar… para sempre" está em
                // `ensureSmallEngine` (limpa a promessa, devolve a fase) e em
                // `abortDeliberation` (aceita 'reopening'). Isto aqui é a última
                // porta: se a rodada terminar sem motor por QUALQUER caminho —
                // inclusive um que ainda não existe, como o coordenador recusar
                // sem chamar o carregador —, a tela não pode continuar anunciando
                // uma reabertura que não está acontecendo.
                //
                // O defeito custou a vontade inteira de uma sessão dele, e o que
                // o tornou permanente foi justamente ninguém ter fechado a porta
                // depois da fase nova.
                npcSet({ deliberationPhase: 'off' });
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
        // O prompt do usuário desta rodada, guardado: o RESGATE reutiliza o
        // mesmo texto para continuar esta conversa em vez de abrir outra, e é
        // isso que faz o `cache_prompt` valer (4,2x mais barato — ver
        // `assinarEscolha`).
        const promptDaRodada = retomado
            ? promptDeRetomada(
                buildDeliberationPrompt(input.perception, input.drives, input.memory),
                retomado.parcial,
            )
            : buildDeliberationPrompt(input.perception, input.drives, input.memory);
        try {
            const stream = await engine.createChatCompletion({
                messages: [
                    { role: 'system', content: DELIBERATION_SYSTEM_PROMPT },
                    { role: 'user', content: promptDaRodada },
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
                // ── O TETO PRECISAVA SER OLHADO AQUI ──────────────────────
                //
                // `DELIBERATION_TIMEOUT_MS` já existia e já chamava `abort()` —
                // e não adiantava nada, porque este laço nunca olhava o sinal.
                // A única saída antecipada era `escolhaAssinada`. Ou seja: o
                // teto valia para quem TERMINAVA cedo, e não valia justamente
                // para quem demorava, que é o caso que ele existe para cobrir.
                //
                // Com um modelo que não assina cedo, a rodada ia até os 320
                // tokens SEMPRE. No meu emulador isso é ~60 s e ninguém nota;
                // no celular dele, mais lento, são minutos — rodada atrás de
                // rodada, com o painel dizendo "pensando" o tempo todo. É o
                // "thinking infinito" que ele relatou, e não tem nada a ver com
                // o bloco `<think>` que eu tinha acusado (medido: com o prompt
                // de deliberação o LFM2.5 nem abre `<think>`, e assina em 23
                // caracteres — a acusação estava errada).
                //
                // Sair aqui NÃO perde a rodada, e é isso que torna o corte
                // barato agora: o motor lê o pensamento PARCIAL e tira a meta
                // dele. Antes desta mesma leva de mudanças, cortar no meio
                // significava jogar tudo fora.
                if (abort.signal.aborted) break;
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
        // ── O MOTOR SAI DE TRÁS DO PORTÃO ────────────────────────────────
        //
        // "o motor serviria justamente pra não ficar dependendo do 'choice' e a
        //  gente está procurando velocidade e inteligência"
        //
        // Era o contrário: o motor só rodava DEPOIS de `decided` existir, e
        // `decided` só existia com a linha "CHOICE: x". Sem ela vinha o
        // RESGATE — uma geração completa do modelo grande — e, se ele também
        // falhasse, a rodada inteira ia fora. Um pensamento bom era descartado
        // com um tradutor de 0,6B preso por gramática esperando ao lado.
        //
        // Agora o motor roda sempre que há pensamento, e a meta vem dele quando
        // a linha não veio. Três coisas mudam:
        //
        //   - o resgate deixa de ser o caminho comum (era 3 de 5 rodadas com o
        //     Llama, 13,7 s por 5 rodadas medidos na bancada);
        //   - modelos que pensam em `<think>` param de perder a rodada por não
        //     assinarem a tempo — o "thinking infinito" do relatório dele;
        //   - a escolha de modelo volta a ser decidida por qualidade de
        //     pensamento e velocidade, e não por "assina a linha de primeira",
        //     que é exigência do andaime e não do NPC.
        //
        // O RESGATE CONTINUA EXISTINDO, como última tentativa antes de perder a
        // rodada: ele lê o pensamento com o modelo que o escreveu, o que é mais
        // fiel que a leitura do tradutor. Só deixou de ser o primeiro recurso.
        const motion = texto.trim() && !conversationHasPriority()
            ? await translateFloor10MotorThought(
                texto, input.perception, input.prison, abort.signal,
            )
            : null;
        if (!decided && motion) {
            decided = {
                goal: metaDoPlanoMotor(motion),
                // A justificativa é o PENSAMENTO, não a linha do tradutor: é
                // ela que vira cor na fala, e o raciocínio do modelo grande é
                // muito mais rico que "approach player normal 6".
                rationale: texto.trim(),
                at: input.now,
            };
            anotar('vontade:meta-veio-do-motor', { meta: decided.goal, plano: motion.raw });
        }
        if (!decided && texto.trim() && !conversationHasPriority()) {
            const assinatura = await assinarEscolha(
                engine, texto, abort.signal, promptDaRodada,
            );
            if (assinatura) decided = parseDeliberation(`${texto}\n${assinatura}`, input.now);
        }
        if (decided && motion) decided = { ...decided, motion };
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
                // Zera a linha da rodada anterior AGORA: uma bolha velha
                // pendurada numa decisão nova é pior que a frase pronta, porque
                // descreve algo que ele já não está fazendo.
                deliberationBubble: '',
            });
            // A bolha não segura a decisão. O corpo já pode andar; a linha
            // chega quando o micro terminar, e se não terminar a frase pronta
            // já está na tela desde o `npcSet` acima.
            void escreverBolha(decided.goal, decided.rationale, npc.deliberationCount);
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
/**
 * BAIXA E PARA POR AÍ — sem subir llama.cpp nenhum.
 *
 * É o pedido do dono do jogo: "baixe tudo de uma vez, sem ligar, deixe os pesos
 * desses modelos na memória... eles não podem ter uma thread ativa enquanto não
 * estão sendo usados".
 *
 * O relato que motivou isto foi dele, sobre este cérebro: "quando começa a
 * baixar, começa a travar meu celular todo". E travava mesmo — o download é
 * rede, mas no FIM dele vinha um llama.cpp inteiro subindo, com pool próprio,
 * enquanto ele estava no chat lendo a resposta anterior.
 *
 * Construir a instância NÃO sobe worker: o `cacheManager` é do objeto, e o
 * Worker do wllama só nasce em `loadModelFromUrl`. É essa distinção que torna
 * "baixar sem ligar" possível sem tocar no wllama.
 *
 * Falha ou runtime sem `download` devolve `false`, e a fila segue para o passo
 * seguinte — quem precisar do cérebro sobe pelo caminho normal, baixando na
 * hora. Degradar é aceitável; ficar sem vontade não é.
 */
export async function baixarVontade(): Promise<boolean> {
    // ── QUANDO O REVISOR NÃO É UM GGUF ───────────────────────────────────
    //
    // `?revisor=lfm-onnx` põe o mesmo LFM2.5 no runtime do ONNX. Esta função é
    // o ÚNICO ponto por onde as duas filas passam para trazer essa peça — a do
    // jogo (`passosDoAndar10`) e a da sala do ?pipeline — então o desvio mora
    // aqui, e não em cada tela. Foi ter a mesma verdade em duas telas que fez
    // `?revisor=llama` não mudar nada da primeira vez.
    //
    // `import()` dinâmico e não estático: `floor10RevisorOnnx` importa a
    // persona e o enunciado DAQUI, e um import estático fecharia o ciclo.
    if (revisorAtual().runtime === 'onnx') {
        const { baixarRevisorOnnx } = await import('./floor10RevisorOnnx');
        return baixarRevisorOnnx();
    }
    if (pesosBaixados.has(SMALL_BRAIN_MODEL.id)) return true;
    try {
        const backend = await probeModelStorageBackend();
        if (!backend.ok) return false;
        const plano = planModelCache(await readStorageEstimate(), SMALL_BRAIN_MODEL.bytes);
        if (!plano.ok) {
            npcSet({
                deliberationPhase: 'unavailable',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} não cabe: ${plano.message}`,
            });
            return false;
        }
        const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as
            Promise<{ Wllama: SmallCtor }>);
        const cofre = new mod.Wllama({ default: WASM_SINGLE }, { suppressNativeLog: true });
        medidorVontade.reset();
        npcSet({ deliberationPhase: 'loading', deliberationDownload: DOWNLOAD_ZERO });
        const baixou = await baixarSemSubir(
            (cofre as { cacheManager?: CofreDeModelos }).cacheManager,
            SMALL_BRAIN_MODEL.url,
            (loaded, total) => {
                const amostra = medidorVontade.push(loaded, total);
                floor10Fila.progresso(FILA_VONTADE, amostra);
                npcSet({
                    deliberationDownload: amostra,
                    deliberationLoadProgress: total ? Math.min(1, loaded / total) : 0,
                    deliberationLoadText:
                        `baixando ${SMALL_BRAIN_MODEL.label} · ${downloadLine(amostra)}`,
                });
            },
        );
        try { await (cofre as { exit?: () => Promise<void> }).exit?.(); } catch { /* nada subiu */ }
        // ── DESISTIR TAMBÉM PRECISA LIMPAR A TELA ─────────────────────────
        // `baixarSemSubir` devolve `false` quando o vigia desiste de um download
        // travado. A fase ficava em 'loading' e o texto no último "baixando …
        // 45%" — o painel anunciava um download que ninguém está fazendo, e pior:
        // `motivoDaTela()` entregava ESSA string de progresso ao `floor10Fila`
        // como se fosse o motivo da falha.
        if (!baixou) {
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: `${SMALL_BRAIN_MODEL.label} não respondeu; a fila seguiu sem ele`,
            });
            return false;
        }
        // ── E CONFERE, PORQUE "BAIXOU" NÃO QUER DIZER "ESTÁ INTEIRO" ──
        //
        // Relato do dono do jogo, e é a descrição exata do mecanismo:
        //
        //   "eu estava baixando o lsfm, aí no fim, eu saí sem querer do chrome,
        //    e deu erro, aí eu cliquei pra baixar dnv, e foi INSTANTÂNEO, mas
        //    faltava até que um tempo antes de instalar"
        //
        // Instantâneo porque o `download` do wllama volta na hora quando a
        // chave já existe no cache — sem conferir o tamanho. O pedaço que
        // sobrou da tentativa interrompida passa por arquivo pronto.
        //
        // O rascunhador já tinha ganhado esta conferência; a vontade não, e o
        // defeito é o MESMO. Consertar num carregador só foi consertar metade.
        const cache = (cofre as { cacheManager?: unknown }).cacheManager as CacheDoWllama;
        const estado = await conferirCacheDeModelo(cache, SMALL_BRAIN_MODEL.url, SMALL_BRAIN_MODEL.bytes);
        if (estado.tipo !== 'ok' && estado.tipo !== 'ausente') {
            await limparModeloDoCache(cache, SMALL_BRAIN_MODEL.url);
            anotar('vontade:cache-quebrado', { estado: estado.tipo, bytes: estado.bytes });
            npcSet({
                deliberationPhase: 'off',
                deliberationLoadText: estado.tipo === 'tamanho-errado'
                    ? `o arquivo guardado tem ${Math.round(estado.bytes / 1e6)} MB e deveria ter `
                        + `${Math.round(SMALL_BRAIN_MODEL.bytes / 1e6)} MB; apaguei, tente de novo`
                    : 'o arquivo guardado perdeu o registro da origem; apaguei, tente de novo',
            });
            return false;
        }

        // OS PESOS ESTÃO NO APARELHO, e nada está de pé por causa deles.
        pesosBaixados.add(SMALL_BRAIN_MODEL.id);
        npcSet({
            deliberationPhase: 'off',
            deliberationLoadProgress: 1,
            deliberationLoadText: `${SMALL_BRAIN_MODEL.label} no aparelho · em espera`,
        });
        anotar('vontade:no-aparelho');
        return true;
    } catch (erro) {
        // ── O MOTIVO TEM QUE IR PARA A TELA, NÃO SÓ PARA A CAIXA-PRETA ───
        //
        // Isto aqui anotava e devolvia `false` seco. Quem chama transforma
        // `false` sem texto em "não subiu, e não disse por quê" — e foi
        // exatamente isso que o dono do jogo viu no aparelho quando o gguf do
        // revisor apontava para uma URL que ainda não existia. O erro REAL era
        // um 404, que responde a pergunta inteira; a caixa-preta sabia e a tela
        // não, o que é a pior divisão possível de uma informação dessas.
        //
        // `deliberationLoadText` é o campo que a sala do ?pipeline lê como
        // motivo (`Floor10PipelineSala.tsx`, `motivo: () => npc.deliberationLoadText`),
        // e ele estava vazio aqui porque o caminho de sucesso é quem costuma
        // escrever nele.
        const cru = erro instanceof Error ? erro.message : String(erro);
        anotar('vontade:download-falhou', { motivo: cru.slice(0, 80) });
        // Um 404 não é falha de rede e não adianta "tentar de novo": o arquivo
        // não está no servidor. Dizer isso com todas as letras evita a rodada
        // de tentativas que eu mesmo faria no lugar dele.
        const naoExiste = /\b404\b|not found/i.test(cru);
        npcSet({
            deliberationPhase: 'off',
            deliberationLoadText: naoExiste
                ? `${SMALL_BRAIN_MODEL.label}: o servidor respondeu 404 — este arquivo não `
                    + 'está publicado. Tentar de novo não resolve.'
                : `${SMALL_BRAIN_MODEL.label} não baixou: ${cru.slice(0, 120)}`,
        });
        return false;
    }
}

export async function precarregarVontade(): Promise<boolean> {
    const engine = await floor10ModelCoordinator.activate(
        'deliberation',
        () => ensureSmallEngine(false),
    );
    return engine !== null;
}

/**
 * Sobe o modelo que vai REMENDAR.
 *
 * É o MESMO arquivo da vontade — o nome existe para quem lê o pipeline saber o
 * que está sendo carregado e por quê, não porque o caminho seja outro.
 */
export const precarregarRevisor = precarregarVontade;

/** Só para os testes: devolve o módulo ao estado inicial. */
export function resetSmallBrainForTests(): void {
    pesosBaixados.clear();
    abortDeliberation();
    resetFloor10MotorBrainForTests();
    floor10ModelCoordinator.markUnloaded('deliberation');
    enginePromise = null;
    disposePromise = null;
    inFlight = false;
    loadAbort = null;
    loadingEngine = null;
}

// ── O RASCUNHADOR ──────────────────────────────────────────────────────────
//
// Este cérebro nasceu para DELIBERAR — decidir o que o Nilo quer fazer. Aqui
// ele ganha um segundo ofício: escrever o primeiro jato da fala, para o 3B só
// revisar.
//
// A conta que justifica: no aparelho do dono do jogo o 3B fala a 1 token por
// segundo. Quarenta tokens de resposta são quarenta segundos, e o teto é 96.
// Este modelo é ordens de grandeza menor. Ele escreve o rascunho enquanto o
// caro fica reservado para o trabalho que só ele sabe fazer: julgar.
//
// POR QUE ELE PODE FAZER OS DOIS
//
// Deliberar e rascunhar nunca acontecem juntos: o coordenador pausa a
// deliberação assim que a fala começa (`pausarDeliberacao`), e é exatamente
// dentro dessa pausa que o rascunho é escrito. É o mesmo motor, no mesmo
// instante em que ele estaria parado de qualquer jeito.

/** Teto do rascunho. Curto de propósito: o Nilo fala em 2–3 frases. */
export const RASCUNHO_MAX_TOKENS = 110;

/**
 * O rascunho não pode custar mais que a fala que ele substitui.
 *
 * Se este cérebro demorar mais que isso, o desenho inteiro perdeu a razão de
 * ser e quem chama volta ao caminho de sempre — o 3B escrevendo do zero.
 */
export const RASCUNHO_TIMEOUT_MS = 25_000;

/**
 * Escreve o primeiro jato da fala do Nilo.
 *
 * Devolve '' quando não dá — modelo não carregado, tempo estourado, saída
 * vazia. Nunca lança e nunca baixa nada: quem chama tem um caminho que
 * funciona sem isto, e transformar uma otimização em ponto único de falha
 * seria trocar velocidade por silêncio.
 */
export async function rascunharFala(
    systemPrompt: string,
    history: readonly { role: string; content: string }[],
): Promise<string> {
    // `false`: quem chama já é a fala, e ela já pausou a deliberação. Pedir
    // para "ceder para a fala" aqui seria pedir para ceder a si mesmo.
    const engine = await ensureSmallEngine(false).catch(() => null);
    if (!engine) return '';
    const abort = new AbortController();
    const relogio = globalThis.setTimeout(() => abort.abort(), RASCUNHO_TIMEOUT_MS);
    try {
        const resposta = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
            ],
            ...SMALL_BRAIN_COMPLETION_CONFIG,
            stream: false,
            max_tokens: RASCUNHO_MAX_TOKENS,
            // Sem gramática: é prosa, não formulário.
            grammar: undefined,
            // Sem bloco de raciocínio: o que se quer aqui é a FALA, e um
            // <think> de trinta tokens custaria mais que o rascunho inteiro.
            chat_template_kwargs: { enable_thinking: false },
            abortSignal: abort.signal,
        }) as { choices?: Array<{ message?: { content?: string } }> } | undefined;
        const bruto = resposta?.choices?.[0]?.message?.content ?? '';
        return typeof bruto === 'string' ? bruto.trim() : '';
    } catch {
        return '';
    } finally {
        globalThis.clearTimeout(relogio);
    }
}

// ── O LFM2.5 COMO REVISOR DO PIPELINE ─────────────────────────────────────
//
// O mesmo arquivo, um segundo papel — e por isso de graça: a vontade já está
// baixada, não há um byte novo.
//
// ELE FOI BARRADO COMO RASCUNHADOR e não como revisor, e a diferença importa.
// `9330e234` o desqualificou porque o card declara `en, ar, zh, fr, de, ja, ko,
// es` e NÃO declara português. No pipeline inglês-primeiro o revisor trabalha
// em inglês, então a objeção some.
//
// E aí ele ganha do titular. Medido nos três defeitos reais que os MoE
// produziram nesta bancada, mesmo enunciado, mesmo teto:
//
//     SmolLM3-3B ..... remendou em 18,4 s · consertou 1 de 3 · 137% do custo
//                      de simplesmente reescrever a fala inteira
//     LFM2.5-1.2B .... remendou em 11,6 s · consertou 3 de 3 ·  38%
//
// O motivo da falha do SmolLM3 é o mais interessante: ele DISCORDA do
// enunciado e devolve a frase intacta com um comentário — "(No correction
// needed)", "(But it's not wrong.)". Não é incapacidade, é o 3B argumentando.
// O LFM2.5 só faz o serviço.
//
// RESSALVA QUE IMPEDE A PROMOÇÃO DELE: ele lê 204–212 tokens por chamada onde
// o SmolLM3 lê 15–23 — o prefixo não é reaproveitado, o mesmo defeito medido no
// LFM2.5-2.6B. Por isso escrever a fala INTEIRA custa 30,8 s nele. Ele serve
// como REMENDADOR e nunca como a fala.

/**
 * Teto do remendo: uma frase.
 *
 * FICA EM 40, e a tentativa de baixar para 32 foi medida e desfeita. O
 * raciocínio para baixar era certo — o `abort` do wllama 3.5.1 não devolve CPU
 * (`getResponse` só para de LER; o worker segue gerando), então `max_tokens` é
 * o único número que o aparelho obedece. Mas a conta não fecha:
 *
 *     as frases fecharam em 15, 17, 18, 21, 24, 27 e 30 tokens ... e uma NÃO
 *     fechou dentro de 32, voltando truncada e sem ponto final
 *     os 8 tokens economizados valem ~1,7 s na bancada
 *     a leitura do prompt sozinha é 85% da chamada
 *
 * Economizar 4% do custo e perder o remendo inteiro de vez em quando é o lado
 * errado da troca. Sem ponto final não há frase, e a original fica.
 */
export const REMENDO_MAX_TOKENS = 40;

/**
 * O teto do remendo, e ele dobra de natureza quando o revisor PENSA.
 *
 * 40 tokens bastam para uma frase — e são fatais para um modelo de raciocínio,
 * que gasta os 40 dentro do `<think>` e não chega a responder. Medido no
 * Huihui-MoE: 0/12 com 40 tokens, 8/12 com 320.
 *
 * O teto continua existindo, e o motivo também está medido: com 512 ele NÃO
 * melhorou (8/12 igual), e em 2 dos 12 casos gastou o orçamento inteiro
 * pensando para devolver vazio — um deles em 40,9 s. Pensamento sem teto é o
 * jogador esperando quarenta segundos por nada.
 */
export const REMENDO_TOKENS_PENSANDO = 320;

export function tokensDoRemendo(): number {
    return revisorAtual().pensa ? REMENDO_TOKENS_PENSANDO : REMENDO_MAX_TOKENS;
}

/**
 * ── O TETO QUE ERA O BUG ─────────────────────────────────────────────────
 *
 * A pergunta foi: *"o revisor até foi acionado (tanto que parece que ele
 * pensou) mas ele simplesmente decide não mudar — será um bug, ou uma
 * escolha?"*. Bug, e o relógio já denunciava: 45,6 s e 30,6 s na tela, com o
 * teto aqui em 25 s. Uma guarda recusando custa 0,0 s.
 *
 * Os 25 s vieram de 11,6 s "medidos" — só que naquela medição a chamada tinha
 * outro formato. REFEITO com o LFM2.5-1.2B DE PRODUÇÃO, no navegador, nos três
 * defeitos reais desta bancada (`bancada-navegador/revisor-pensa.mjs`):
 *
 *     como estava, corte em 25 s ...... 0/3 · 3 VAZIOS · 26,1 s por frase
 *     o MESMO código, prazo de sobra ... 2/3 ·  0 vazios · 30,6 s por frase
 *
 * Uma linha de diferença, e ela é esta. A chamada custa ~30 s nesta bancada e
 * o corte caía aos 25 — antes do fim, sempre, nas três. O revisor nunca teve
 * chance de entregar nada, em nenhuma fala, desde que foi ligado.
 *
 * 70 s porque o celular dele é mais lento que esta máquina e o teto tem de
 * caber a chamada INTEIRA: `abortSignal` no wllama 3.5.1 é conferido entre uma
 * leitura de resultado e outra, então um corte durante a leitura do prompt não
 * volta mais cedo nem devolve nada — medido, um corte aos 8 s levou 37,9 s para
 * voltar, vazio. Prazo curto aqui não protege ninguém: só perde o trabalho.
 */
export const REMENDO_TIMEOUT_MS = 70_000;

/**
 * O ENUNCIADO, e ele é curto por medição.
 *
 * `7b8a2889` mediu que pedir DUAS coisas na mesma resposta ("diga qual frase
 * está errada E escreva a substituta") faz o modelo contradizer a si mesmo e
 * deslocar índices. Aqui há um grau de liberdade só: a frase vem citada, e a
 * saída não tem número para errar.
 *
 * ── E AGORA ELE DIZ O QUE ESTÁ ERRADO ────────────────────────────────────
 *
 * A versão anterior dizia "esta frase está errada" e parava aí. O juiz sabia o
 * motivo — a trava sabe qual regex casou, o juiz de tom sabe de qual âncora
 * ruim a frase chegou perto — e o motivo era descartado a um passo daqui.
 *
 * MEDIDO na bancada com o LFM2.5 de produção, régua conferindo o cânone
 * inteiro (`bancada-navegador/revisor-candidatos.mjs`):
 *
 *     "esta frase está errada", e só ......... 2/6 · 50,2 s
 *     dizendo TAMBÉM o que está errado ....... 4/6 · 53,0 s
 *
 * O texto abaixo é o que foi medido, não uma variação bonita dele. Duas
 * escolhas dentro dele custaram medição e não devem ser mexidas sem outra:
 *
 *   · "Keep what it was saying, fix only that error" — sem isso o modelo troca
 *     de assunto. Num teste com enunciado que EXIGIA saída diferente, o placar
 *     foi de 0/6 a 6/6 na régua frouxa e as frases eram "the endless loop of
 *     rooms and CORRIDORS" e "I should find my way BACK DOWN".
 *   · `porque` vazio volta ao enunciado antigo — por honestidade, não por
 *     medo: medido, um motivo ERRADO dá 2/6 e 0/3 estragou, o mesmo que ir às
 *     cegas. O revisor ignora o diagnóstico que não bate em vez de obedecê-lo.
 */
export function enunciadoDoRemendo(
    perguntaEmIngles: string,
    frase: string,
    porque = '',
): string {
    const motivo = porque.trim();
    if (!motivo) {
        return `

CORRECTION. One sentence only.

In your reply to "${perguntaEmIngles.trim()}", this sentence is wrong:

"${frase}"

Rewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;
    }
    return `

CORRECTION. One sentence only.

The player asked: "${perguntaEmIngles.trim()}"

You answered with this line:

"${frase}"

It is wrong because ${motivo}

Write the corrected line. Keep what it was saying, fix only that error. Nilo's voice, one sentence, no explaining, no quotes.`;
}

/** Tira as aspas que ele às vezes põe em volta da frase inteira. */
function semAspas(t: string): string {
    return t.replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim();
}


/**
 * Reescreve UMA frase, em inglês, e DIZ o que aconteceu.
 *
 * Não sobe o modelo: se a vontade não estiver de pé, devolve `sem-revisor` e a
 * frase original segue. Um rascunho com uma frase torta é melhor que 30 s de
 * espera para carregar um revisor.
 *
 * ── POR QUE ISTO LÊ EM STREAM PARA UMA FRASE SÓ ──────────────────────────
 *
 * Não é para mostrar o texto aparecendo — ninguém vê esta chamada. É porque o
 * `abort` do wllama levanta `WllamaAbortError` e NÃO devolve o parcial: sem o
 * laço, o corte no prazo apagava tudo o que ele já tinha escrito. Foi assim
 * que "45,6 s" virou "não remendou" na tela do dono do jogo.
 *
 * Lendo pedaço a pedaço, o texto é MEU antes de o prazo chegar, e três coisas
 * passam a existir de graça:
 *
 *   1. o prazo vira "fico com o que já saiu", e não "perco tudo";
 *   2. dá para PARAR na primeira frase fechada, em vez de esperar o teto —
 *      o enunciado pede uma frase e ele costuma escrever a segunda mesmo assim;
 *   3. o desfecho fica distinguível: cortado, mudo, tropeço ou frase.
 *
 * O descarte no `chunkOpensReply` não é zelo: o stream do wllama entrega os
 * restos da geração anterior antes do primeiro pedaço real, e foi ele que já
 * transformou "CHOICE: idle" em "OSE: idleCHO" neste mesmo arquivo.
 */
export async function remendarFraseEmIngles(
    perguntaEmIngles: string,
    frase: string,
    /** O que o juiz viu. Vazio = ele marcou sem saber dizer por quê. */
    porque = '',
): Promise<RespostaDoRevisor> {
    const engine = await ensureSmallEngine(false).catch(() => null);
    if (!engine) return { tipo: 'sem-revisor' };
    const abort = new AbortController();
    const relogio = globalThis.setTimeout(() => abort.abort(), REMENDO_TIMEOUT_MS);
    let acumulado = '';
    let tropeco = '';
    // `length` significa "parei porque acabaram os tokens", e é a única forma
    // de saber que a frase está truncada quando ela não trouxe ponto final.
    // Sem isto eu teria de adivinhar pela pontuação, e uma frase boa que ele
    // fechou sem ponto viraria "cortado" à toa.
    let noTeto = false;
    try {
        // ── O REVISOR TREINADO FALA OUTRA LÍNGUA DE ENUNCIADO ────────
        //
        // Os de prateleira precisam dos três exemplos para DESCOBRIR a tarefa;
        // o treinado viu a tarefa 192 vezes e precisa da forma exata em que a
        // viu. Mandar o enunciado com exemplos para ele seria medir uma coisa e
        // rodar outra.
        // ── QUAIS REVISORES FALAM A LÍNGUA DO TREINO ────────────────────
        //
        // Comparar com uma id só era uma armadilha esperando o segundo revisor
        // treinado: o v2 daria `false` aqui e receberia a persona genérica e o
        // enunciado antigo — e responderia pior SEM DAR ERRO, que é o modo de
        // falha mais caro de achar.
        //
        // A regra passa a ser a que importa de verdade: estes dois foram
        // treinados no enunciado de `corpus/enunciado.mjs`, então é esse que
        // eles têm que receber.
        const treinado = revisorAtual().id === 'treinado' || revisorAtual().id === 'v2';
        const stream = await engine.createChatCompletion({
            messages: [
                {
                    role: 'system',
                    content: treinado ? PERSONA_DO_REVISOR_TREINADO : PERSONA_DO_REVISOR,
                },
                {
                    role: 'user',
                    content: treinado
                        ? enunciadoTreinado(perguntaEmIngles, frase, porque)
                        : enunciadoDoRemendo(perguntaEmIngles, frase, porque),
                },
            ],
            ...SMALL_BRAIN_COMPLETION_CONFIG,
            stream: true,
            // NÃO guloso no treinado — ver TEMPERATURA_DO_TREINADO: guloso
            // devolve a mesma frase para entrada parecida, e era isso que fazia
            // as três respostas de "Você é real?" começarem igual.
            ...(treinado ? { temperature: TEMPERATURA_DO_TREINADO } : {}),
            max_tokens: treinado
                ? REMENDO_TREINADO_TOKENS
                    + (revisorAtual().pensa ? PENSAMENTO_TREINADO_TOKENS : 0)
                : tokensDoRemendo(),
            grammar: undefined,
            // NO-OP NESTE MODELO, e fica registrado para ninguém confiar nele:
            // `enable_thinking` é chave do Qwen, e o chat template do LFM2.5-1.2B
            // não a menciona (li o gguf). Não faz mal e volta a valer se o posto
            // de revisor mudar de modelo — mas quem resolveu o vazio foi o
            // prazo, não isto.
            chat_template_kwargs: { enable_thinking: false },
            abortSignal: abort.signal,
        }) as AsyncIterable<unknown>;
        for await (const bruto of stream) {
            const c = bruto as ChatChunk;
            // Os restos da geração anterior chegam na frente do primeiro pedaço
            // real — foi isso que já virou "CHOICE: idle" em "OSE: idleCHO"
            // neste arquivo.
            if (chunkOpensReply(c)) { acumulado = ''; noTeto = false; }
            acumulado += chunkDelta(c);
            const razao = (c as { choices?: Array<{ finish_reason?: string }> })
                .choices?.[0]?.finish_reason;
            if (razao) noTeto = razao === 'length';
            // NÃO sai no primeiro ponto: medido, a leitura do prompt é ~85% da
            // chamada e a escrita inteira são poucos segundos, então sair cedo
            // economiza quase nada e deixa o worker gerando sozinho.
            if (abort.signal.aborted) break;
        }
    } catch (e) {
        // Cortar no prazo cai AQUI (`WllamaAbortError`), e não é tropeço — por
        // isso o texto de erro só vale quando o sinal não foi acionado.
        if (!abort.signal.aborted) tropeco = String((e as Error)?.message ?? e).slice(0, 180);
    } finally {
        globalThis.clearTimeout(relogio);
    }
    const cortado = abort.signal.aborted;
    // Um revisor que pensa devolve `<think>…</think>` antes da frase. Sem esta
    // linha o raciocínio ia inteiro para o tradutor e para a tela.
    const limpo = semAspas(semRaciocinio(acumulado));
    const fechada = primeiraFraseFechada(limpo);
    if (fechada) return { tipo: 'frase', texto: fechada, cortado };
    if (tropeco) return { tipo: 'erro', erro: tropeco };
    // Terminou por vontade dele, sem ponto final e sem bater no teto: é uma
    // frase inteira que só não trouxe pontuação, e vale.
    if (limpo.length > 2 && !cortado && !noTeto) {
        return { tipo: 'frase', texto: limpo, cortado: false };
    }
    // Truncada de verdade. Enfiar meio período na fala do Nilo é pior que
    // deixar a original — e a tela diz qual dos dois aconteceu.
    if (cortado || limpo) return { tipo: 'cortado', parcial: limpo };
    return { tipo: 'vazio' };
}

/**
 * A persona do revisor — a MESMA do rascunhador, e isso não é economia.
 *
 * Se o revisor mirasse um personagem diferente do rascunhador, ele "consertaria"
 * frases certas para outra coisa. Os dois medem contra o mesmo cânone porque é
 * o mesmo Nilo.
 */
export const PERSONA_DO_REVISOR = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.
Reply with Nilo's line only, no label.`;
