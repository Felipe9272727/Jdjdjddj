// ── A MEMÓRIA POR SIGNIFICADO — o QUARTO modelo do 10º andar ───────────────
//
// POR QUE ELE EXISTE
// O cânone do Nilo era procurado por PALAVRA. Medido nas 12 perguntas que uma
// pessoa realmente faz em português: 8 não recuperavam fato NENHUM e 2
// recuperavam o fato errado — 2/12. E quando nada é recuperado o cérebro de
// fala responde só com a persona, que é de onde saem as invenções ("lembro que
// VOCÊ era um ex-técnico de elevadores").
//
// O problema não é o cânone, é a busca. "O que te trouxe pra cá?" não contém
// nenhuma das palavras-chave de `past`, mas é exatamente essa a pergunta.
//
// Um modelo de embedding lê a pergunta pelo SIGNIFICADO. Medido no navegador,
// no mesmo caminho que o jogo usa (wllama), com as MESMAS 12 perguntas:
//
//      por palavra .................  2/12
//      granite-embedding 107M ......  6/12   (121 MB)
//      multilingual-e5-small ....... 1/12    (conversão GGUF quebrada, ver abaixo)
//      embeddinggemma 300M .........  9/12   (333 MB)
//      embeddinggemma 300M + título 11/12   ← o que está aqui
//
// O "+ título" é o campo `tema` do cânone entrando no prompt de documento que
// o embeddinggemma espera. Custou dez linhas de texto e valeu duas perguntas.
//
// SOBRE O e5: a única conversão com o tokenizador certo (SentencePiece/XLM-R)
// não grava `token_type_count` e o llama.cpp recusa o arquivo; as conversões
// que gravam essa chave usam tokenizador WordPiece e devolvem vetores inúteis
// (1/12, com uma frase sobre gatos ganhando da resposta certa). Consertei a
// metadata com tools/gguf-kv.py e aí o tokenizador SPM estourava
// `unordered_map::at: key not found` dentro do WASM em texto com acento. Ficou
// documentado para ninguém tentar de novo achando que é fácil.
//
// O QUE ELE NÃO FAZ
// Não fala, não decide e não pode atrasar a conversa. Se o modelo não baixar,
// não couber ou demorar, a busca por palavra continua valendo e o Nilo responde
// como responde hoje. É por isso que ele é o ÚLTIMO da fila de download.
import { FLOOR10_CANON, type CanonEntry } from './floor10Canon';
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
import { floor10Fila, FILA_MEMORIA } from './floor10Fila';
import { baixarSemSubir, type CofreDeModelos } from './floor10Roteamento';
import { floor10ModelCoordinator } from './floor10ModelCoordinator';
import {
    FLOOR10_MEMORIA_VETORES,
    FLOOR10_MEMORIA_DIM,
} from './floor10MemoriaVetores';
import {
    deleteCachedModel,
    isBrokenModelCacheError,
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { TETO_ESTOUROU, comTeto } from './floor10Teto';
import { npc, npcSet } from './npcStore';
import { cpuThreadCount } from './wllamaEngine';

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
const WASM = `${CDN}/wasm/wllama.wasm`;

export const FLOOR10_MEMORIA_MODEL = Object.freeze({
    id: 'embeddinggemma-300m',
    label: 'Memória EmbeddingGemma 300M',
    url: (globalThis as { __memoryModelUrl?: string }).__memoryModelUrl
        ?? 'https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/0f741b5a6585bd53aeb15cd1372c56f2a0f65e12/embeddinggemma-300M-Q8_0.gguf',
    bytes: 333_590_944,
});

export const FLOOR10_MEMORIA_SIZE_LABEL = formatBytes(FLOOR10_MEMORIA_MODEL.bytes);

/** Duas threads: é um trabalho de 200ms que não pode roubar a CPU da fala. */
export const FLOOR10_MEMORIA_THREADS = 2;

export function memoriaThreads(): number {
    return Math.min(FLOOR10_MEMORIA_THREADS, Math.max(1, cpuThreadCount()));
}

export const FLOOR10_MEMORIA_LOAD_CONFIG = Object.freeze({
    // 512 é o contexto do próprio modelo; pedir mais só gastaria RAM.
    n_ctx: 512,
    n_batch: 512,
    n_gpu_layers: 0,
    embeddings: true,
    pooling_type: 'mean',
});

export const FLOOR10_MEMORIA_USE_CACHE = true;
// AQUI EXISTIA `FLOOR10_MEMORIA_LOAD_TIMEOUT_MS = 180_000`, um teto sobre o
// tempo TOTAL, e a conta condenava o celular: 334 MB a 1,5 MB/s (4G comum)
// precisam de 222s. O download morria aos 180s com a barra ANDANDO, e o
// AbortError resultante era indistinguível de rede caída. O teto agora é de
// inatividade — ver floor10Carga.ts.
/**
 * Teto por pergunta. Medido no contêiner (2 threads, CPU de servidor):
 * 130–450ms quente. Passar disso é sintoma de outra coisa disputando a CPU — e
 * nesse caso é melhor responder sem o fato do que fazer o jogador esperar.
 *
 * Era 1500ms e isso derrubava justamente a PRIMEIRA pergunta: medido, a
 * primeira busca depois da carga levou 1504ms (fria) contra ~300ms nas
 * seguintes. Hoje o aquecimento abaixo paga esse custo junto da barra de
 * download, e a folga aqui existe só para o celular, que é mais lento que esta
 * máquina.
 */
export const FLOOR10_MEMORIA_TIMEOUT_MS = 2_500;
/**
 * O teto da BUSCA DA CONVERSA, que não é o mesmo problema.
 *
 * Os dois usos deste modelo dividiam este número, e não deviam. O motor
 * classifica um pensamento a cada rodada de deliberação: ali 2,5 s é o certo,
 * porque uma rodada perdida não custa nada — o Nilo segue no reflexo e a
 * próxima rodada vem em seguida.
 *
 * A busca da conversa é o oposto. Ela roda UMA vez por fala, e o que se perde
 * quando ela estoura é o bloco "SUA MEMÓRIA" inteiro: o 3B responde sem o
 * fato e inventa o passado. É exatamente a alucinação que o dono do jogo
 * fotografou ("acredito que é algum tipo de acidente ou erro de programação").
 *
 * E o preço da espera é ridículo ao lado do que já se espera: a mesma tela
 * mostrava "Pensando localmente… 142s". Desistir do fato aos 2,5 s para
 * economizar tempo dentro de uma espera de dois minutos não economiza nada —
 * só troca uma resposta certa por uma inventada.
 *
 * O outro motivo de este número precisar de folga é a FILA: os dois usos
 * dividem um worker só. Uma busca da conversa que chegue no meio de uma rodada
 * de deliberação espera a rodada terminar antes de começar.
 */
export const FLOOR10_MEMORIA_TETO_DA_FALA = 12_000;
/**
 * Piso de semelhança. Abaixo disto o "melhor" fato é só o menos ruim de dez, e
 * enfiar um fato aleatório no prompt é pior que não enfiar nenhum.
 *
 * O número saiu de medir os dois lados no navegador (tools/f10-memoria-vetores):
 *   pergunta do assunto ....... 0,24 a 0,44
 *   pergunta fora do assunto .. 0,085 a 0,177  ("oi" é o teto aqui)
 * 0,20 cai exatamente no vão entre os dois — um "oi" não puxa fato nenhum e a
 * pergunta mais fraca do conjunto ainda puxa.
 */
export const FLOOR10_MEMORIA_PISO = 0.20;
/** Pergunta gigante não entra no lote do modelo; cortar é melhor que falhar. */
export const FLOOR10_MEMORIA_MAX_CHARS = 600;

// ── OS PROMPTS QUE O EMBEDDINGGEMMA ESPERA ────────────────────────────────
// Não são decorativos: o modelo foi treinado com estes prefixos e trocá-los
// muda o resultado. O `title:` é o campo em que entra o `tema` do cânone.
export function textoDoDocumento(entry: CanonEntry): string {
    return `title: ${entry.tema} | text: ${entry.fact}`;
}

export function textoDaPergunta(query: string): string {
    return `task: search result | query: ${query.slice(0, FLOOR10_MEMORIA_MAX_CHARS)}`;
}

/** FNV-1a de 32 bits — só precisa detectar cânone editado, não é criptografia. */
export function hashDoFato(entry: CanonEntry): number {
    const texto = textoDoDocumento(entry);
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

type Vetor = Float32Array;

function decodificar(base64: string, escala: number): Vetor {
    const bin = atob(base64);
    const saida = new Float32Array(bin.length);
    let soma = 0;
    for (let i = 0; i < bin.length; i += 1) {
        // int8 assinado a partir do byte.
        const b = bin.charCodeAt(i);
        const x = ((b & 0x80) ? b - 256 : b) / 127 * escala;
        saida[i] = x;
        soma += x * x;
    }
    const norma = Math.sqrt(soma) || 1;
    for (let i = 0; i < saida.length; i += 1) saida[i] /= norma;
    return saida;
}

function normalizar(v: readonly number[]): Vetor {
    const saida = new Float32Array(v.length);
    let soma = 0;
    for (let i = 0; i < v.length; i += 1) soma += v[i] * v[i];
    const norma = Math.sqrt(soma) || 1;
    for (let i = 0; i < v.length; i += 1) saida[i] = v[i] / norma;
    return saida;
}

function cosseno(a: Vetor, b: Vetor): number {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i += 1) s += a[i] * b[i];
    return s;
}

type FatoVetorizado = { entry: CanonEntry; v: Vetor };

/**
 * Os fatos com vetor pronto, vindos do bundle. Um fato cujo texto mudou desde a
 * última geração é DESCARTADO aqui — melhor procurar entre nove fatos certos do
 * que entre dez com um mentindo. Ele volta assim que a ferramenta rodar.
 */
function fatosPrecalculados(): FatoVetorizado[] {
    const porId = new Map(FLOOR10_MEMORIA_VETORES.map((f) => [f.id, f]));
    const saida: FatoVetorizado[] = [];
    for (const entry of FLOOR10_CANON) {
        const guardado = porId.get(entry.id);
        if (!guardado || guardado.hash !== hashDoFato(entry)) continue;
        saida.push({ entry, v: decodificar(guardado.v, guardado.escala) });
    }
    return saida;
}

let fatos: FatoVetorizado[] | null = null;

export function fatosDaMemoria(): FatoVetorizado[] {
    fatos ??= fatosPrecalculados();
    return fatos;
}

/** Quantos fatos do cânone ficaram sem vetor válido (0 = tudo em dia). */
export function fatosSemVetor(): string[] {
    const comVetor = new Set(fatosDaMemoria().map((f) => f.entry.id));
    return FLOOR10_CANON.filter((e) => !comVetor.has(e.id)).map((e) => e.id);
}

type MemoriaInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createEmbedding(options: { input: string }): Promise<{
        data?: Array<{ embedding?: number[] }>;
    }>;
    cacheManager?: { delete?: (nameOrUrl: string) => Promise<void> };
    exit?: () => Promise<void> | void;
};
type MemoriaCtor =
    new (paths: Record<string, string>, cfg?: Record<string, unknown>) => MemoriaInstance;

const medidor = new DownloadMeter();
let enginePromise: Promise<MemoriaInstance | null> | null = null;
let residentEngine: MemoriaInstance | null = null;
let loadAbort: AbortController | null = null;

function terminate(engine: MemoriaInstance | null): void {
    if (!engine?.exit) return;
    try {
        void Promise.resolve(engine.exit()).catch(() => undefined);
    } catch { /* worker já encerrou */ }
}

async function ensureMemoriaEngine(
    recoverBrokenCache = true,
    tentativa = 0,
): Promise<MemoriaInstance | null> {
    if (residentEngine) return residentEngine;
    if (enginePromise) return enginePromise;

    enginePromise = (async () => {
        const controller = new AbortController();
        loadAbort = controller;
        // Teto por INATIVIDADE, não por tempo total: 334 MB a 1,5 MB/s levam
        // 222s de download saudável, e o teto total de 180s matava isso com a
        // barra andando. Ver floor10Carga.ts para a conta inteira.
        // `travou` separa as duas causas de aborto que chegam aqui como o
        // MESMO AbortError: o vigia (a carga morreu — vale tentar de novo) e
        // quem chamou (o coordenador preemptou — repetir seria desobedecer).
        let travou = false;
        const vigia = vigiarInatividade(() => { travou = true; controller.abort(); });
        medidor.reset();
        npcSet({
            memoriaPhase: 'loading',
            memoriaLoadText: `verificando o cache da ${FLOOR10_MEMORIA_MODEL.label}…`,
            memoriaLoadProgress: 0,
            memoriaDownload: DOWNLOAD_ZERO,
        });
        let engine: MemoriaInstance | null = null;
        try {
            const backend = await probeModelStorageBackend();
            if (!backend.ok) throw new Error(backend.message);
            const plano = planModelCache(
                await readStorageEstimate(),
                FLOOR10_MEMORIA_MODEL.bytes,
            );
            if (!plano.ok) {
                npcSet({
                    memoriaPhase: 'unavailable',
                    memoriaLoadText:
                        `${FLOOR10_MEMORIA_MODEL.label} não cabe: ${plano.message}`,
                });
                enginePromise = null;
                return null;
            }

            const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as
                Promise<{ Wllama: MemoriaCtor }>);
            if (controller.signal.aborted) throw new Error('interrompido');
            engine = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
            await engine.loadModelFromUrl(FLOOR10_MEMORIA_MODEL.url, {
                ...FLOOR10_MEMORIA_LOAD_CONFIG,
                n_threads: memoriaThreads(),
                useCache: FLOOR10_MEMORIA_USE_CACHE,
                signal: controller.signal,
                progressCallback: (progress: { loaded?: number; total?: number }) => {
                    if (controller.signal.aborted) return;
                    vigia.avancou();
                    const amostra = medidor.push(
                        progress.loaded ?? 0,
                        progress.total ?? 0,
                    );
                    floor10Fila.progresso(FILA_MEMORIA, amostra);
                    npcSet({
                        memoriaDownload: amostra,
                        memoriaLoadProgress: progress.total
                            ? Math.max(0, Math.min(
                                1, (progress.loaded ?? 0) / progress.total,
                            ))
                            : 0,
                        memoriaLoadText:
                            `baixando ${FLOOR10_MEMORIA_MODEL.label} · `
                            + downloadLine(amostra),
                    });
                },
            });
            // VEIO MODELO OU VEIO CASCA? Medido: um GGUF truncado no cache faz
            // `loadModelFromUrl` RESOLVER, com nVocab/nLayer zerados, e só
            // estoura na primeira busca. Perguntar aqui joga o caso no caminho
            // de cache quebrado, que apaga e baixa de novo.
            await conferirModeloCarregado(engine);
            // ── AQUECIMENTO ───────────────────────────────────────────────
            // A primeira busca depois da carga custou 1504ms; as seguintes,
            // ~300ms. Não é o modelo ser lento, é a primeira passada pagar
            // cache frio. Esse custo tem de cair AQUI, ao lado da barra de
            // download — e não sobre a primeira pergunta do jogador, que é
            // exatamente aquela em que ele repara.
            npcSet({
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} · aquecendo…`,
            });
            try {
                await engine.createEmbedding({ input: textoDaPergunta('oi') });
            } catch { /* falhar aqui só devolve a lentidão da 1ª busca */ }
            residentEngine = engine;
            npcSet({
                memoriaPhase: 'ready',
                memoriaLoadProgress: 1,
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} pronta`,
            });
            return engine;
        } catch (falha) {
            terminate(engine);
            if (
                !controller.signal.aborted
                && recoverBrokenCache
                && isBrokenModelCacheError(falha)
                && await deleteCachedModel(engine?.cacheManager, FLOOR10_MEMORIA_MODEL.url)
            ) {
                npcSet({
                    memoriaPhase: 'loading',
                    memoriaLoadProgress: 0,
                    memoriaDownload: DOWNLOAD_ZERO,
                    memoriaLoadText:
                        `o cache da ${FLOOR10_MEMORIA_MODEL.label} `
                        + 'ficou incompleto; baixando de novo…',
                });
                enginePromise = null;
                return ensureMemoriaEngine(false, tentativa);
            }
            // REDE CAIU ≠ MODELO INDISPONÍVEL. O wllama guarda o que já desceu
            // no OPFS, então a tentativa seguinte CONTINUA — não recomeça os
            // 334 MB. Sem isto, um soluço de 4G no meio do download deixava a
            // memória 'unavailable' até alguém recarregar a página.
            if (
                (travou || !controller.signal.aborted)
                && tentativa + 1 < FLOOR10_TENTATIVAS
                && (travou || ehFalhaTransitoria(falha))
            ) {
                const espera = esperaDaTentativa(tentativa + 1);
                npcSet({
                    memoriaPhase: 'loading',
                    memoriaDownload: DOWNLOAD_ZERO,
                    memoriaLoadText: textoDaTentativa(
                        FLOOR10_MEMORIA_MODEL.label,
                        tentativa + 1,
                        espera,
                    ),
                });
                enginePromise = null;
                // Um aborto do VIGIA já cumpriu seu papel: o sinal fica
                // levantado, mas a espera aqui não pode ser encurtada por ele.
                await esperar(espera, travou ? undefined : controller.signal);
                if (!travou && controller.signal.aborted) return null;
                return ensureMemoriaEngine(recoverBrokenCache, tentativa + 1);
            }
            const motivo = falha instanceof Error
                ? `${falha.name}: ${falha.message}`
                : String(falha);
            npcSet({
                memoriaPhase: 'unavailable',
                memoriaLoadText:
                    `não foi possível carregar ${FLOOR10_MEMORIA_MODEL.label} — `
                    + motivo.slice(0, 200),
            });
            enginePromise = null;
            return null;
        } finally {
            vigia.parar();
            if (loadAbort === controller) loadAbort = null;
        }
    })();
    return enginePromise;
}

/** SÓ BAIXA — a fila de pré-carga chama isto, como nos outros três cérebros. */
/**
 * BAIXA E PARA POR AÍ. A memória é a menor dos quatro (334 MB), mas o fim do
 * download dela também é um llama.cpp subindo — e era ela que subia por cima
 * da primeira mensagem do jogador.
 */
export async function baixarMemoria(): Promise<boolean> {
    if (residentEngine) return true;
    try {
        const backend = await probeModelStorageBackend();
        if (!backend.ok) return false;
        const plano = planModelCache(await readStorageEstimate(), FLOOR10_MEMORIA_MODEL.bytes);
        if (!plano.ok) {
            npcSet({
                memoriaPhase: 'unavailable',
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} não cabe: ${plano.message}`,
            });
            return false;
        }
        const mod = await (import(/* @vite-ignore */ WLLAMA_ESM) as
            Promise<{ Wllama: MemoriaCtor }>);
        const cofre = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
        medidor.reset();
        npcSet({ memoriaPhase: 'loading', memoriaDownload: DOWNLOAD_ZERO });
        const baixou = await baixarSemSubir(
            (cofre as { cacheManager?: CofreDeModelos }).cacheManager,
            FLOOR10_MEMORIA_MODEL.url,
            (loaded, total) => {
                const amostra = medidor.push(loaded, total);
                floor10Fila.progresso(FILA_MEMORIA, amostra);
                npcSet({
                    memoriaDownload: amostra,
                    memoriaLoadProgress: total ? Math.min(1, loaded / total) : 0,
                    memoriaLoadText:
                        `baixando ${FLOOR10_MEMORIA_MODEL.label} · ${downloadLine(amostra)}`,
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
                memoriaPhase: 'off',
                memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} não respondeu; a fila seguiu sem ele`,
            });
            return false;
        }
        npcSet({
            memoriaPhase: 'off',
            memoriaLoadProgress: 1,
            memoriaLoadText: `${FLOOR10_MEMORIA_MODEL.label} no aparelho · em espera`,
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * ── A DIREÇÃO PODE SER DESLIGADA, E ELA PRECISA PODER ────────────────────
 *
 * `?direcao=0` deixa o EmbeddingGemma FORA da RAM. Existe por uma suspeita
 * minha, sobre uma mudança minha, e o dono do jogo é o único que pode medir.
 *
 * O que ele relatou, no aparelho dele:
 *
 *     pipeline quando era bom .... ~25 s, às vezes menos
 *     pipeline agora ............. 55–65 s, e o rascunho pior
 *
 * Hoje eu passei a subir a memória junto do rascunhador. Antes ela nunca
 * ficava de pé nesta sala: a busca do cânone caía na LEXICAL, que não precisa
 * de modelo nenhum. Agora são dois llama.cpp residentes — 822 MB do
 * rascunhador mais 333 MB deste — num aparelho onde este projeto já mediu, mais
 * de uma vez, que runtime a mais custa caro.
 *
 * Pode não ser isso. A primeira lei do `JA-TENTADO.md` é que a minha bancada
 * não prevê o celular dele, e ela vale nos dois sentidos: eu não posso
 * confirmar NEM descartar daqui. O que dá para fazer é entregar as duas
 * corridas na mão de quem tem o aparelho — com direção e sem — e deixar o
 * número decidir.
 *
 * Desligada, a direção não some: `memoriaDoRascunho` cai na busca lexical do
 * cânone, que é o que a sala fazia até hoje de manhã. O rascunhador continua
 * recebendo um fato; ele só é escolhido por palavra em vez de por significado.
 */
export function direcaoLigada(busca = globalThis.location?.search ?? ''): boolean {
    return !/[?&]direcao=(?:0|nao|off)\b/i.test(busca);
}

export async function precarregarMemoria(): Promise<boolean> {
    if (!direcaoLigada()) return false;
    const engine = await floor10ModelCoordinator.activate(
        'memory',
        () => ensureMemoriaEngine(),
    );
    return engine !== null;
}

export function memoriaJaCarregada(): boolean {
    return residentEngine !== null;
}

/**
 * O VETOR DE UM TEXTO QUALQUER, para quem mais precisar do mesmo modelo.
 *
 * Existe porque o MOTOR passou a classificar o pensamento do Nilo por
 * significado (ver floor10Rotulos / floor10Classificador) e seria absurdo
 * baixar um segundo modelo de embedding para isso: este já está no aparelho,
 * já está residente, e é 333 MB.
 *
 * O que NÃO se exporta é o `residentEngine`. Quem tem o motor na mão ganha
 * também `loadModelFromUrl` e `exit` — e uma chamada distraída a `exit()` de
 * fora derrubaria a memória do Nilo no meio de uma conversa. Aqui sai um
 * vetor, e só.
 *
 * Devolve `null` — nunca lança e nunca demora além do teto — quando o modelo
 * não está carregado (é o caso durante o passeio, se o roteamento o tiver
 * desligado) ou quando a resposta vem torta. Quem chama decide o que fazer
 * com o vazio; no motor, vazio significa "sem plano", que é a falha segura.
 */
export async function vetorDoTexto(texto: string): Promise<Vetor | null> {
    const limpo = texto.trim();
    if (!limpo || !residentEngine) return null;
    try {
        const corrida = await comTeto(
            residentEngine.createEmbedding({ input: limpo }),
            FLOOR10_MEMORIA_TIMEOUT_MS,
        );
        if (corrida === TETO_ESTOUROU) return null;
        const resposta = corrida;
        const bruto = resposta?.data?.[0]?.embedding;
        if (!bruto || bruto.length !== FLOOR10_MEMORIA_DIM) return null;
        return normalizar(bruto);
    } catch {
        return null;
    }
}

export type FatoLembrado = {
    id: string;
    fact: string;
    /** Semelhança com a pergunta, 0..1. Vai para a tela do ?mente. */
    score: number;
};

/**
 * O FATO QUE ESTA FALA PEDE — ou null, e aí quem procura é a busca por palavra.
 *
 * Nunca lança e nunca baixa: se o modelo ainda não está carregado, devolve null
 * na hora. A conversa não pode ficar esperando um download de 333 MB para
 * responder "oi".
 */
export async function lembrarPorSignificado(
    query: string,
): Promise<FatoLembrado | null> {
    const texto = query.trim();
    // ── O SILÊNCIO QUE NÃO DIZIA POR QUE ──────────────────────────────────
    //
    // Esta função tinha SEIS saídas em `null` e nenhuma delas deixava rastro.
    // `memoriaLembrou` só era escrito no sucesso — e nunca limpo —, então uma
    // busca que estourava o teto era indistinguível, de fora, de uma que não
    // achou nada, e o painel continuava mostrando o acerto da pergunta
    // ANTERIOR como se fosse desta.
    //
    // O dono do jogo desconfiou que o embedding com duas funções estivesse
    // prejudicando a mente principal. Pode estar — mas ninguém tinha como
    // saber, porque a falha era muda. Um diagnóstico ausente vira palpite; o
    // motivo publicado vira medida.
    if (!texto) return semMemoria('sem pergunta');
    if (!residentEngine) return semMemoria('modelo desligado');
    const lista = fatosDaMemoria();
    if (lista.length === 0) return semMemoria('sem fatos vetorizados');

    let vetor: Vetor;
    try {
        const corrida = await comTeto(
            residentEngine.createEmbedding({ input: textoDaPergunta(texto) }),
            FLOOR10_MEMORIA_TETO_DA_FALA,
        );
        if (corrida === TETO_ESTOUROU) return semMemoria('estourou o teto');
        const resposta = corrida;
        const bruto = resposta?.data?.[0]?.embedding;
        if (!bruto || bruto.length !== FLOOR10_MEMORIA_DIM) {
            return semMemoria('vetor com tamanho errado');
        }
        vetor = normalizar(bruto);
    } catch {
        return semMemoria('o modelo falhou');
    }

    let melhor: FatoLembrado | null = null;
    for (const { entry, v } of lista) {
        const score = cosseno(vetor, v);
        if (!melhor || score > melhor.score) {
            melhor = { id: entry.id, fact: entry.fact, score };
        }
    }
    if (!melhor) return semMemoria('sem fatos vetorizados');
    if (melhor.score < FLOOR10_MEMORIA_PISO) {
        // O score entra mesmo assim: saber que o melhor deu 0,18 contra um piso
        // de 0,20 é informação diferente de saber que deu 0,02.
        npcSet({ memoriaLembrou: '', memoriaScore: melhor.score, memoriaMotivo: 'abaixo do piso' });
        return null;
    }
    npcSet({ memoriaLembrou: melhor.id, memoriaScore: melhor.score, memoriaMotivo: '' });
    return melhor;
}

/** Registra POR QUE a memória não respondeu, e apaga o acerto da fala anterior. */
function semMemoria(motivo: string): null {
    npcSet({ memoriaLembrou: '', memoriaScore: 0, memoriaMotivo: motivo });
    return null;
}

export async function unloadFloor10Memoria(): Promise<void> {
    loadAbort?.abort();
    loadAbort = null;
    const pending = enginePromise;
    enginePromise = null;
    const engine = residentEngine ?? (pending ? await pending.catch(() => null) : null);
    residentEngine = null;
    terminate(engine);
    npcSet({ memoriaPhase: 'off', memoriaLoadText: '' });
}

floor10ModelCoordinator.register('memory', unloadFloor10Memoria);

export function resetFloor10MemoriaForTests(): void {
    loadAbort?.abort();
    loadAbort = null;
    enginePromise = null;
    residentEngine = null;
    fatos = null;
    npcSet({
        memoriaPhase: 'off',
        memoriaLoadText: '',
        memoriaLoadProgress: 0,
        memoriaDownload: DOWNLOAD_ZERO,
        memoriaLembrou: '',
        memoriaScore: 0,
        memoriaMotivo: '',
    });
}

/** Só para as sondas: injeta um motor já carregado sem baixar 333 MB. */
export function __setMemoriaEngineForProbes(engine: MemoriaInstance | null): void {
    residentEngine = engine;
}
