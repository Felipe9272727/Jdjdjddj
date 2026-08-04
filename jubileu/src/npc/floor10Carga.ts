// ── AS DUAS REGRAS QUE FALTAVAM EM TODA CARGA DE MODELO ────────────────────
//
// 1. TETO POR INATIVIDADE, NÃO POR TEMPO TOTAL
//
// A memória e o motor abortavam com `setTimeout(abort, 180_000)`. Um teto
// TOTAL não pergunta se o download está andando — ele só conta o relógio. Faça
// a conta com os números reais do jogo:
//
//      memória (EmbeddingGemma Q8_0) ...... 334 MB
//      motor   (Qwen3-0.6B Q8_0) .......... 386 MB
//
// A 3 MB/s (Wi-Fi bom) a memória desce em 111s e passa. A 1,5 MB/s (4G comum)
// ela precisa de 222s — e morre aos 180s com a barra em ~80%, ANDANDO. O erro
// que aparece na tela é um AbortError, que de fora é indistinguível de rede
// caída. O aparelho do dono do jogo é justamente onde isso acontece.
//
// O teto certo é o mesmo que a fala já usa desde o cão de guarda do wllama:
// contar quanto tempo faz que NADA chega. Download que anda pode levar o tempo
// que precisar; download que parou é reprovado em menos de um minuto.
//
// 2. REDE CAI, E CAIR NÃO É MOTIVO PARA DESISTIR
//
// `TypeError: Failed to fetch` aparecia na tela como falha definitiva: o
// cérebro ficava 'unavailable' até alguém recarregar a página. Num celular
// trocando de célula ou saindo do Wi-Fi isso acontece o tempo todo, e o wllama
// guarda o que já baixou no OPFS — a tentativa seguinte CONTINUA de onde
// parou, não recomeça os 334 MB.
//
// O que NÃO se tenta de novo: cota estourada, arquivo corrompido, aborto
// pedido por quem chamou. Insistir nesses três só queima bateria.

/**
 * Silêncio tolerado antes de reprovar a carga.
 *
 * UM relógio só, e ele mede a mesma coisa nas três fases pelas quais a carga
 * passa — o que muda é só quem o alimenta:
 *
 *   verificar cache/importar ESM .. ninguém pulsa; o relógio corre desde o
 *                                   começo e 120s é folga enorme para isso
 *   baixando ...................... cada bloco chama `avancou()`; um download
 *                                   que anda nunca chega perto do teto
 *   lendo o GGUF para o WASM ...... o progresso já parou de pulsar; o relógio
 *                                   corre desde o último byte, e aqui ele é o
 *                                   único teto que existe
 *
 * TRÊS MINUTOS, e o número não é chute: é o mesmo `CPU_INIT_WATCHDOG_MS` que a
 * fala já usa para a fase equivalente, num arquivo MAIOR (1,8 GB) e com o mesmo
 * risco. A fase perigosa é a última — ler o GGUF do OPFS para dentro do WASM —
 * porque ela não emite nada enquanto trabalha. Medido nesta caixa, a fala
 * inteira faz esse caminho em 11,4s; um celular com armazenamento lento pode
 * levar vários múltiplos disso, e reprovar um aparelho que está fazendo o
 * trabalho CERTO é pior do que esperar mais um minuto por um que morreu.
 *
 * O erro na direção segura custa tempo. O erro na outra direção derruba a
 * vontade num aparelho onde ela funcionava.
 */
export const FLOOR10_INATIVIDADE_MS = 180_000;

/** Quantas vezes tentar, contando a primeira. */
export const FLOOR10_TENTATIVAS = 3;

/** Frequência da checagem do vigia. Barato: é uma subtração por segundo. */
export const FLOOR10_VIGIA_POLL_MS = 1_000;

/**
 * Espera antes da tentativa seguinte. Cresce para não martelar uma rede que
 * acabou de cair, mas o total (2s + 6s) continua invisível ao lado de um
 * download de 334 MB.
 */
export function esperaDaTentativa(tentativa: number): number {
    const forcada = (globalThis as { __f10EsperaMs?: number }).__f10EsperaMs;
    if (typeof forcada === 'number' && forcada >= 0) return forcada;
    return Math.min(6_000, 2_000 * Math.max(1, tentativa));
}

/**
 * O teto em vigor. Sai da constante acima, mas um teste pode encurtá-lo — sem
 * isso, provar que o vigia reprova custaria dois minutos de relógio de verdade
 * por caso. Mesmo mecanismo de `__wllamaCdn` e `__npcThreads`.
 */
export function limiteDeInatividade(): number {
    const forcado = (globalThis as { __f10InatividadeMs?: number }).__f10InatividadeMs;
    return typeof forcado === 'number' && forcado > 0
        ? forcado
        : FLOOR10_INATIVIDADE_MS;
}

const TRANSITORIAS = [
    'failed to fetch',        // Chrome/Chromium
    'networkerror',           // Firefox
    'load failed',            // Safari
    'network error',
    'connection',
    'err_network',
    'err_internet_disconnected',
    'err_connection',
    'err_timed_out',
    'socket',
    'econnreset',
    'etimedout',
];

/** Erros de servidor que passam se a gente pedir de novo. */
const HTTP_TRANSITORIO = /\b(408|425|429|500|502|503|504)\b/;

/**
 * Vale tentar de novo?
 *
 * A ordem importa: um `AbortError` levantado DEPOIS de uma queda de rede ainda
 * é um aborto, e abortar foi decisão de alguém — repetir seria desobedecer.
 */
export function ehFalhaTransitoria(erro: unknown): boolean {
    if (erro === null || erro === undefined) return false;
    const nome = (erro as { name?: unknown }).name;
    if (typeof nome === 'string') {
        const n = nome.toLowerCase();
        if (n === 'aborterror' || n === 'quotaexceedederror') return false;
    }
    const texto = (
        erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro)
    ).toLowerCase();
    if (texto.includes('abort') || texto.includes('interrompid')) return false;
    if (texto.includes('quota') || texto.includes('não cabe')) return false;
    // Arquivo quebrado no cache tem tratamento próprio (apagar e rebaixar);
    // repetir por cima dele só faria o mesmo download falhar do mesmo jeito.
    if (texto.includes('corrupted') || texto.includes('incomplete')) return false;
    if (HTTP_TRANSITORIO.test(texto)) return true;
    return TRANSITORIAS.some((marca) => texto.includes(marca));
}

/** Há quanto tempo a carga não dá sinal de vida. */
export function inatividadeMs(ultimoSinal: number, agora = Date.now()): number {
    return Math.max(0, agora - ultimoSinal);
}

/**
 * O vigia decide reprovar? Separado da plumbing de timer para poder ser
 * testado sem relógio falso.
 */
export function vigiaReprova(
    ultimoSinal: number,
    limiteMs = FLOOR10_INATIVIDADE_MS,
    agora = Date.now(),
): boolean {
    return inatividadeMs(ultimoSinal, agora) > limiteMs;
}

export type VigiaDeCarga = {
    /** Chamado a cada byte que chega. Só encosta num número. */
    avancou: (agora?: number) => void;
    parar: () => void;
};

/**
 * Liga o vigia. Devolve o par (avancou, parar) para o chamador pendurar no
 * `progressCallback` e no `finally`.
 *
 * O relógio começa AGORA, não no primeiro byte. É de propósito: um modelo que
 * vem inteiro do cache nunca emite progresso nenhum, e se o relógio esperasse
 * o primeiro byte essa carga ficaria sem teto algum — exatamente o "carregando
 * para sempre" que este arquivo existe para impedir.
 */
export function vigiarInatividade(
    aoTravar: () => void,
    limiteMs = limiteDeInatividade(),
    pollMs = Math.min(FLOOR10_VIGIA_POLL_MS, Math.max(5, limiteMs / 4)),
): VigiaDeCarga {
    let ultimoSinal = Date.now();
    let vivo = true;
    const timer = globalThis.setInterval(() => {
        if (!vivo) return;
        if (vigiaReprova(ultimoSinal, limiteMs)) {
            vivo = false;
            globalThis.clearInterval(timer);
            aoTravar();
        }
    }, pollMs);
    return {
        avancou(agora = Date.now()) { ultimoSinal = agora; },
        parar() { vivo = false; globalThis.clearInterval(timer); },
    };
}

/** Espera que acorda na hora se alguém abortar no meio. */
export function esperar(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const timer = globalThis.setTimeout(() => {
            signal?.removeEventListener('abort', aoAbortar);
            resolve();
        }, ms);
        function aoAbortar(): void {
            globalThis.clearTimeout(timer);
            resolve();
        }
        signal?.addEventListener('abort', aoAbortar, { once: true });
    });
}

// ── O MODELO QUE "CARREGA" E ESTÁ VAZIO ───────────────────────────────────
//
// MEDIDO NO CHROMIUM, com o wllama de verdade (bancada-navegador/rede.html):
// servi 48 MB de zeros no lugar de um GGUF e chamei `loadModelFromUrl`.
//
//      loadModelFromUrl ........ RESOLVEU. Sem erro, sem aviso.
//      getModelMetadata ........ { nVocab: 0, nCtxTrain: 0, nEmbd: 0, nLayer: 0 }
//      primeira geração ........ RangeError: Invalid typed array length, lá
//                                dentro do Worker
//
// Isso é pior do que uma falha de carga, porque atravessa todas as defesas que
// já existem: a carga não lança, então `isBrokenModelCacheError` nunca é
// consultado e o "cache incompleto, baixando de novo" NÃO dispara; a fase vira
// 'ready'; a fila marca a etapa como concluída. O defeito só aparece na
// primeira frase do Nilo — longe, disfarçado, e num lugar onde a única saída é
// recarregar a página.
//
// Um arquivo truncado no OPFS é rotina em celular: é o que sobra de um
// download que morreu. Então a checagem tem que ser aqui, na hora, e a
// mensagem tem que ser uma das que `isBrokenModelCacheError` reconhece — assim
// o caminho de conserto que já existe (apagar do cache e baixar de novo) passa
// a valer também para este caso.
export type MetadadosDoModelo = {
    hparams?: {
        nVocab?: number;
        nLayer?: number;
        nEmbd?: number;
        nCtxTrain?: number;
    };
};

/** Um modelo de verdade tem vocabulário e camadas. Zero em qualquer um = casca. */
export function modeloVazio(meta: MetadadosDoModelo | null | undefined): boolean {
    const h = meta?.hparams;
    if (!h) return false; // runtime que não informa: na dúvida, deixa passar
    const vocab = Number(h.nVocab ?? 0);
    const camadas = Number(h.nLayer ?? 0);
    const embd = Number(h.nEmbd ?? 0);
    return vocab <= 0 || camadas <= 0 || embd <= 0;
}

/**
 * A frase é escolhida a dedo: `isBrokenModelCacheError` casa com
 * "Failed to open file... model may be invalid", e é exatamente o tratamento
 * que este caso precisa.
 */
export const ERRO_MODELO_VAZIO =
    'Failed to open file: o modelo carregou vazio (nVocab/nLayer = 0), '
    + 'model may be invalid — arquivo truncado no cache';

type ComMetadados = {
    getModelMetadata?: () => Promise<MetadadosDoModelo> | MetadadosDoModelo;
};

/**
 * Confere, logo depois da carga, que veio um modelo e não uma casca. Lança —
 * de propósito — para cair no caminho de cache quebrado que já existe.
 *
 * Um runtime que não expõe `getModelMetadata` passa direto: inventar uma falha
 * por falta de instrumento seria pior que o defeito.
 */
export async function conferirModeloCarregado(engine: unknown): Promise<void> {
    const ler = (engine as ComMetadados | null)?.getModelMetadata;
    if (typeof ler !== 'function') return;
    let meta: MetadadosDoModelo | null = null;
    try {
        meta = await ler.call(engine);
    } catch {
        return; // não conseguir perguntar não é prova de nada
    }
    if (modeloVazio(meta)) throw new Error(ERRO_MODELO_VAZIO);
}

/** O texto que a barra mostra entre uma tentativa e outra. */
export function textoDaTentativa(
    label: string,
    tentativa: number,
    esperaMs: number,
    total = FLOOR10_TENTATIVAS,
): string {
    const seg = Math.round(esperaMs / 1000);
    return `a rede falhou ao baixar ${label} · tentando de novo em ${seg}s `
        + `(tentativa ${tentativa + 1} de ${total})`;
}
