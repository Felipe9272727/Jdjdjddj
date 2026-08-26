// ── O RASCUNHADOR — o MoE que escreve o primeiro jato, em inglês ───────────
//
// granite-3.1-1b-a400m: 3B... não. **1B no total, 400M ATIVOS por token**, e é
// disso que vem a velocidade. Medido nesta bancada, mesma persona, mesmas
// perguntas:
//
//     SmolLM3-3B (denso) ....... leitura  4,42 tok/s · turno 12,0 s
//     granite a400m (MoE) ...... leitura 15,28 tok/s · turno  6,1 s
//
// 3,5× na leitura, que é onde estão 90% da espera do jogador. E o arquivo é
// 822 MB contra 1,92 GB.
//
// ── DUAS COISAS QUE MATAM ESTE MODELO SE FOREM ESQUECIDAS ─────────────────
//
// 1. **KV EM f16, NUNCA q8_0.** O jogo carrega tudo com `cache_type_k/v:
//    'q8_0'` (+15% medidos no SmolLM3). Este modelo ABORTA com q8_0, num
//    `ggml-impl.h:318: fatal error` que não diz nada. Eu cheguei a reprová-lo
//    por isso e o dono do jogo não aceitou — o histórico mostrava ele rodando
//    em agosto, e a diferença era essa linha. O a800m, MESMA arquitetura
//    `granitemoe`, engole q8_0 sem reclamar; então não é a arquitetura, é
//    alguma dimensão deste modelo.
//
// 2. **Ele escreve em INGLÊS.** Não é preferência: em português quebrou o
//    cânone em 2 de 3 falas ("moro dentro deste elevador"), e em inglês
//    nenhuma. Mais importante, é em inglês que o JUIZ enxerga (0,94 de
//    contradição contra 0,29 no mesmo par). O Bergamot traz de volta por 83 ms.
//
// ── O QUE ELE NÃO É ───────────────────────────────────────────────────────
//
// Ele não é o Nilo. Ele erra tom, vaza rótulo e dá conselho — foi medido
// fazendo as três coisas. É por isso que existe um juiz depois dele e um
// revisor depois do juiz. Promovê-lo a titular seria repetir o erro que
// derrubou o granite-3b-a800m em `9fdcc382`: rápido e menos Nilo.

import {
    DownloadMeter,
    DOWNLOAD_ZERO,
    downloadLine,
    formatBytes,
} from './floor10Download';
import { floor10Fila } from './floor10Fila';
import { baixarSemSubir, type CofreDeModelos } from './floor10Roteamento';
import {
    planModelCache,
    probeModelStorageBackend,
    readStorageEstimate,
} from './floor10ModelStorage';
import { npcSet } from './npcStore';
import {
    enunciadoComExemplos, primeiraFraseFechada, PARADAS_DO_REMENDO,
    type RespostaDoRevisor,
} from './floor10Pipeline';
import {
    conferirCacheDeModelo, limparModeloDoCache, type CacheDoWllama,
} from './floor10CacheDeModelos';
import {
    comPrazo, PRAZO_RUNTIME_MS, PRAZO_CARGA_MS, PRAZO_SONDA_MS,
} from './floor10Carga';
import { anotar } from './floor10CaixaPreta';
import { turnoDoRascunho } from './floor10MemoriaDoRascunho';
import { cpuThreadCount } from './wllamaEngine';

const WLLAMA_V = '3.5.1';
const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm`;
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM = `${CDN}/wasm/wllama.wasm`;

/** O lugar dele na fila. */
export const FILA_RASCUNHO = 'rascunho';

/**
 * ── POR QUE Q4, SE ESTE PROJETO MEDIU QUE Q4 DESPENCA ────────────────────
 *
 * A contradição foi apontada olhando o código, e era justa: o
 * `floor10Rascunhadores.ts` usa "este projeto MEDIU que o Llama 3.2 1B em Q4
 * despenca (5/15 contra 14/15)" para BARRAR um candidato, e o rascunhador —
 * que escreve TODA fala do Nilo — estava em Q4_K_M sem uma linha de
 * justificativa. Parecia esquecimento.
 *
 * FUI MEDIR (`bancada-navegador/rascunhador-quant.mjs`), 12 perguntas
 * distintas x 3 amostras, parâmetros do jogo:
 *
 *     Q4_K_M .... 11/36 falas fora do cânone · 5,8 s por fala ·  784 MB
 *     Q6_K ...... 11/36 falas fora do cânone · 7,6 s por fala · 1048 MB
 *
 * Empate, e o Q6 é 31% mais lento. Os 264 MB a mais não compram nada.
 *
 * O "Q4 despenca" continua valendo ONDE FOI MEDIDO: num Llama 3.2 1B denso, na
 * tarefa de assinar escolha. Não transferiu para este MoE de 400M ativos nesta
 * tarefa. A exceção agora é medida, e não esquecimento.
 *
 * RESSALVA: a primeira rodada, com 12 falas e um verificador mais frouxo, deu
 * 4/12 contra 1/12 e parecia decisiva a favor do Q6. Era amostra pequena mais
 * régua com fresta. Se alguém repetir isto, repita com as três rodadas.
 */
export const FLOOR10_RASCUNHADOR_MODEL = Object.freeze({
    id: 'granite-a400m',
    label: 'Rascunhador granite 1B-A400M',
    url: (globalThis as { __rascunhadorModelUrl?: string }).__rascunhadorModelUrl
        ?? 'https://huggingface.co/bartowski/granite-3.1-1b-a400m-instruct-GGUF/resolve/main/granite-3.1-1b-a400m-instruct-Q4_K_M.gguf',
    bytes: 821_847_360,
});

export const FLOOR10_RASCUNHADOR_SIZE_LABEL = formatBytes(FLOOR10_RASCUNHADOR_MODEL.bytes);

/** Duas threads: ele é 400M ativos e não pode disputar núcleo com o revisor. */
export const FLOOR10_RASCUNHADOR_THREADS = 2;

export function rascunhadorThreads(): number {
    return Math.min(FLOOR10_RASCUNHADOR_THREADS, Math.max(1, cpuThreadCount()));
}

/**
 * A CONFIGURAÇÃO DE CARGA, e o que NÃO está aqui é o mais importante.
 *
 * `cache_type_k` e `cache_type_v` estão AUSENTES de propósito — ausente
 * significa f16. Acrescentar `q8_0` aqui, por simetria com os outros cérebros,
 * derruba este modelo com um erro do ggml que não aponta para nada. Há um
 * teste travando isso.
 */
export const FLOOR10_RASCUNHADOR_LOAD_CONFIG = Object.freeze({
    n_ctx: 1024,
    n_batch: 256,
    n_gpu_layers: 0,
    jinja: true,
    reasoning: false,
    default_template_kwargs: Object.freeze({ enable_thinking: false }),
    warmup: true,
});

/** Teto do rascunho. O revisor conserta uma frase; o rascunho tem duas. */
export const FLOOR10_RASCUNHO_TOKENS = 56;
/**
 * O teto do REMENDO quando quem remenda é o próprio rascunhador.
 *
 * 40 e não 56: o remendo devolve UMA frase, e o resto do orçamento só dá
 * espaço para ele continuar o padrão dos exemplos.
 */
export const FLOOR10_REMENDO_TOKENS = 40;
export const FLOOR10_RASCUNHO_TIMEOUT_MS = 30_000;

export const FLOOR10_RASCUNHO_COMPLETION_CONFIG = Object.freeze({
    // Temperatura baixa: o rascunho não precisa ser criativo, precisa ser
    // corrigível. Quanto mais perto do cânone ele sair, menos o juiz marca — e
    // cada marcação custa ~11,6 s de revisor.
    temperature: 0.3,
    top_p: 0.8,
    top_k: 30,
});

/**
 * A PERSONA EM INGLÊS.
 *
 * Tradução literal da de produção, na mesma ordem e com as mesmas regras. Não é
 * uma persona nova: se ela divergir da portuguesa, o rascunho e o revisor
 * passam a mirar personagens diferentes, e o juiz mede contra um terceiro.
 */
export const PERSONA_DO_RASCUNHO = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

type Mensagem = { role: 'system' | 'user' | 'assistant'; content: string };
type Instancia = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(p: Record<string, unknown>): Promise<unknown>;
    exit?: () => Promise<void>;
};
type Ctor = new (p: Record<string, string>, o?: Record<string, unknown>) => Instancia;


/**
 * ── O MOTIVO DA ÚLTIMA FALHA, E POR QUE ELE PRECISOU EXISTIR ─────────────
 *
 * Todos os caminhos de falha daqui devolviam `false` e mandavam o motivo para a
 * caixa-preta. Isso é certo para o JOGO — o Nilo não pode emudecer nem mostrar
 * pilha de erro na cara de quem joga — e é péssimo para quem está tentando
 * instalar: o relato foi "falhou em instalar o rascunhador", e não havia como
 * saber se foi rede, cota de disco, CORS ou o navegador sem OPFS. São quatro
 * consertos diferentes.
 *
 * O motivo fica guardado aqui e quem quiser mostrar, mostra. A fila de download
 * mostra; o jogo continua sem mostrar.
 */
let ultimoErro = '';

export function ultimoErroDoRascunhador(): string { return ultimoErro; }


const medidor = new DownloadMeter();
let enginePromise: Promise<Instancia | null> | null = null;
let residente: Instancia | null = null;
let abortoDaCarga: AbortController | null = null;

function encerrar(e: Instancia | null): void {
    if (!e) return;
    try { void e.exit?.(); } catch { /* já morreu */ }
}

function lerTexto(resposta: unknown): string {
    if (typeof resposta === 'string') return resposta.trim();
    const r = resposta as { choices?: { message?: { content?: string }; text?: string }[] };
    return (r?.choices?.[0]?.message?.content ?? r?.choices?.[0]?.text ?? '').trim();
}

/**
 * ── O RASCUNHO CORTADO NO MEIO NÃO PODE CHEGAR À TELA ────────────────────
 *
 * Foto de tela do dono do jogo, com o rascunho terminando assim:
 *
 *     "I don't know why we're here, but I'm not going anywhere until I"
 *
 * E, depois do Bergamot, na fala que o jogador leria: *"não vou a lado nenhum
 * até eu"*. O teto de 56 tokens cortou no meio da palavra seguinte, e nenhuma
 * peça a jusante desfez isso: o juiz mede TOM (e o tom da metade estava bom), o
 * revisor só entra em frase marcada, e o tradutor traduziu o toco fielmente.
 *
 * ── E POR QUE `finish_reason`, E NÃO "TERMINA SEM PONTO" ─────────────────
 *
 * Frase sem ponto final não prova corte: o próprio revisor tem um caminho para
 * "terminou por vontade dele, sem pontuação, e vale". Adivinhar aqui reprovaria
 * frases inteiras.
 *
 * `finish_reason: 'length'` é FATO — o modelo parou porque o teto acabou, e não
 * porque a frase acabou. O sinal estava vindo na resposta e sendo jogado fora
 * por `lerTexto`, que lê só o conteúdo.
 *
 * Cortar é conserto de STRING, e a regra da casa é clara: defeito de forma sai
 * em microssegundos e nunca falha; só defeito de conteúdo merece um modelo.
 * Mandar o toco ao revisor custaria uma chamada de ~25 s para reescrever algo
 * que ninguém pediu.
 *
 * Se NADA fechar — o teto cortou antes da primeira pontuação — devolve o texto
 * inteiro. Meia fala é ruim; nenhuma fala é pior, e aí quem decide é o resto do
 * pipeline, que já sabe lidar com frase torta.
 */
export function bateuNoTeto(resposta: unknown): boolean {
    const r = resposta as { choices?: { finish_reason?: string }[] };
    return r?.choices?.[0]?.finish_reason === 'length';
}

/** Corta a cauda inacabada — só quando se SABE que houve corte. */
export function semACaudaCortada(texto: string, cortou: boolean): string {
    if (!cortou) return texto;
    // O último fechamento de frase que existe. `Mr.`/`10th` não confundem: o
    // que importa é onde a última frase COMPLETA termina, e uma abreviação no
    // meio só faria o corte ser mais conservador do que precisa.
    const fim = Math.max(texto.lastIndexOf('.'), texto.lastIndexOf('!'), texto.lastIndexOf('?'));
    if (fim < 0) return texto;
    const inteiro = texto.slice(0, fim + 1).trim();
    return inteiro || texto;
}

/** Já está de pé? O pipeline só rascunha com ele carregado — nunca baixa na hora. */
export function rascunhadorJaCarregado(): boolean {
    return residente !== null;
}

/**
 * BAIXA sem subir. É o que a fila chama: download é rede, subir é núcleo, e os
 * dois no mesmo passo foi o que fazia a fila competir com a fala.
 */
export async function baixarRascunhador(): Promise<boolean> {
    if (residente) return true;
    ultimoErro = '';
    try {
        const backend = await comPrazo(
            probeModelStorageBackend(), PRAZO_SONDA_MS, 'a sonda de armazenamento',
        );
        if (!backend.ok) {
            ultimoErro = backend.message || 'este navegador não guarda modelos (sem OPFS)';
            anotar('rascunhador:sem-backend', { motivo: ultimoErro.slice(0, 80) });
            return false;
        }
        const plano = planModelCache(
            await comPrazo(readStorageEstimate(), PRAZO_SONDA_MS, 'a estimativa de disco'),
            FLOOR10_RASCUNHADOR_MODEL.bytes,
        );
        if (!plano.ok) {
            ultimoErro = plano.message;
            anotar('rascunhador:nao-cabe', { motivo: plano.message.slice(0, 80) });
            return false;
        }
        const mod = await comPrazo(
            import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: Ctor }>,
            PRAZO_RUNTIME_MS,
            'o CDN do motor (jsdelivr)',
        );
        const cofre = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
        medidor.reset();
        const cache = (cofre as { cacheManager?: unknown }).cacheManager as CacheDoWllama;

        // ── CONFERE ANTES DE BAIXAR ──────────────────────────────────────
        // Uma tentativa anterior interrompida deixa um pedaço de arquivo que o
        // `download` do wllama aceita como pronto (ele só olha se a chave
        // existe, não o tamanho). Apagar aqui é o que impede o "Model file not
        // found" de voltar em toda tentativa.
        const antes = await conferirCacheDeModelo(cache, FLOOR10_RASCUNHADOR_MODEL.url, FLOOR10_RASCUNHADOR_MODEL.bytes);
        if (antes.tipo !== 'ok' && antes.tipo !== 'ausente') {
            anotar('rascunhador:cache-quebrado-antes', { estado: antes.tipo, bytes: antes.bytes });
            npcSet({ loadText: 'o download anterior ficou pela metade; limpando…' });
            await limparModeloDoCache(cache, FLOOR10_RASCUNHADOR_MODEL.url);
        }

        const baixou = await baixarSemSubir(
            (cofre as { cacheManager?: CofreDeModelos }).cacheManager,
            FLOOR10_RASCUNHADOR_MODEL.url,
            (loaded, total) => {
                const amostra = medidor.push(loaded, total);
                floor10Fila.progresso(FILA_RASCUNHO, amostra);
                npcSet({
                    // `loadDownload` FALTAVA, e a barra da sala lia exatamente
                    // ele: ficava em 0 MB enquanto os bytes andavam, e o que o
                    // dono do jogo via era "0 MB de 2,23 GB" para sempre. O
                    // progresso existia; só não chegava a quem desenha.
                    loadDownload: amostra,
                    loadText: `baixando ${FLOOR10_RASCUNHADOR_MODEL.label} · ${downloadLine(amostra)}`,
                });
            },
        );
        try { await cofre.exit?.(); } catch { /* nada subiu */ }
        if (!baixou) {
            ultimoErro = 'o download parou antes de terminar';
            anotar('rascunhador:download-desistiu');
            return false;
        }

        // ── E CONFERE DEPOIS, QUE É O QUE FALTAVA ────────────────────────
        // `download` resolver não significa que os 822 MB estão lá: quando a
        // chave já existia, ele volta na hora sem olhar o tamanho. Sem esta
        // conferência, `baixarRascunhador` devolvia `true` e quem estourava era
        // o `loadModelFromUrl`, com uma mensagem que não aponta para o cache.
        const depois = await conferirCacheDeModelo(cache, FLOOR10_RASCUNHADOR_MODEL.url, FLOOR10_RASCUNHADOR_MODEL.bytes);
        anotar('rascunhador:cache-depois', {
            estado: depois.tipo,
            bytes: depois.tipo === 'ausente' ? -1 : depois.bytes,
        });

        // ── O QUE EU SEI, E O QUE EU NÃO SEI ─────────────────────────────
        //
        // A versão anterior respondia "cota de disco no limite" quando não
        // achava o arquivo. O dono do jogo tem 10 GB livres e me corrigiu na
        // hora. Eu não tinha como saber que era cota — inventei, e escolhi uma
        // palavra que fazia o diagnóstico repetir o meu chute com ar de certeza.
        //
        // Agora cada mensagem diz o que foi MEDIDO. As hipóteses ficam com o
        // diagnóstico, que as apresenta como hipóteses.
        const MB = (n: number) => `${(n / 1_000_000).toFixed(0)} MB`;
        if (depois.tipo === 'tamanho-errado' || depois.tipo === 'sem-metadata') {
            await limparModeloDoCache(cache, FLOOR10_RASCUNHADOR_MODEL.url);
            ultimoErro = depois.tipo === 'tamanho-errado'
                ? `o arquivo guardado tem ${MB(depois.bytes)} e deveria ter `
                    + `${MB(FLOOR10_RASCUNHADOR_MODEL.bytes)}; apaguei, tente de novo`
                : `o arquivo guardado tem o tamanho certo mas perdeu o registro `
                    + `da origem; apaguei, tente de novo`;
            return false;
        }
        if (depois.tipo === 'ausente') {
            // NÃO apago e NÃO reprovo: se a minha busca não achou, a minha
            // busca pode estar errada — e reprovar aqui jogaria fora um
            // download de 822 MB que talvez esteja inteiro. Quem decide é o
            // `loadModelFromUrl`, que é quem de fato precisa do arquivo.
            anotar('rascunhador:cache-nao-encontrado');
            npcSet({ loadText: 'baixado; não localizei no cache, vou tentar abrir mesmo assim…' });
        }

        anotar('rascunhador:no-aparelho');
        return true;
    } catch (erro) {
        ultimoErro = erro instanceof Error ? erro.message : String(erro);
        anotar('rascunhador:download-falhou', { motivo: ultimoErro.slice(0, 80) });
        return false;
    }
}

/** Sobe o modelo. Devolve `null` em qualquer falha — o pipeline então desiste. */
export async function subirRascunhador(): Promise<Instancia | null> {
    if (residente) return residente;
    enginePromise ??= (async () => {
        abortoDaCarga = new AbortController();
        try {
            const mod = await comPrazo(
                import(/* @vite-ignore */ WLLAMA_ESM) as Promise<{ Wllama: Ctor }>,
                PRAZO_RUNTIME_MS,
                'o CDN do motor (jsdelivr)',
            );
            const e = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
            await comPrazo(
                e.loadModelFromUrl(FLOOR10_RASCUNHADOR_MODEL.url, {
                    ...FLOOR10_RASCUNHADOR_LOAD_CONFIG,
                    n_threads: rascunhadorThreads(),
                }),
                PRAZO_CARGA_MS,
                'a abertura do modelo',
            );
            residente = e;
            npcSet({ loadDownload: DOWNLOAD_ZERO });
            anotar('rascunhador:de-pe', { threads: rascunhadorThreads() });
            return e;
        } catch (erro) {
            ultimoErro = erro instanceof Error ? erro.message : String(erro);
            anotar('rascunhador:carga-falhou', { motivo: ultimoErro.slice(0, 80) });
            enginePromise = null;
            return null;
        } finally {
            abortoDaCarga = null;
        }
    })();
    return enginePromise;
}

/**
 * Escreve o rascunho, em inglês. `null` em qualquer tropeço.
 *
 * Não sobe o modelo: se ele não estiver de pé, desiste. Baixar 822 MB para
 * acelerar UMA resposta é o contrário de acelerar — a mesma regra que já vale
 * para os outros rascunhadores.
 */
export async function rascunharEmIngles(
    perguntaEmIngles: string,
    /**
     * O que ele SABE que importa aqui — o fato recuperado do cânone, em inglês.
     * Vai na mensagem do usuário e nunca no sistema: a persona é o prefixo
     * estável que o `cache_prompt` reaproveita, e trocá-la a cada pergunta
     * jogaria fora o cache inteiro. Ver floor10MemoriaDoRascunho.ts.
     */
    memoria = '',
): Promise<string | null> {
    if (!residente) return null;
    const mensagens: Mensagem[] = [
        { role: 'system', content: PERSONA_DO_RASCUNHO },
        { role: 'user', content: turnoDoRascunho(perguntaEmIngles, memoria) },
    ];
    try {
        const resposta = await residente.createChatCompletion({
            messages: mensagens,
            ...FLOOR10_RASCUNHO_COMPLETION_CONFIG,
            max_tokens: FLOOR10_RASCUNHO_TOKENS,
            cache_prompt: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        const t = semACaudaCortada(lerTexto(resposta), bateuNoTeto(resposta));
        return t || null;
    } catch (erro) {
        anotar('rascunhador:geracao-falhou', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
        return null;
    }
}

/** Descarrega. Medido: ~98% da RAM volta em menos de 5 s (`81ba41ad`). */
/**
 * ── O RASCUNHADOR REMENDA A PRÓPRIA FRASE ────────────────────────────────
 *
 * Escolha do dono do jogo, e a piada dele acertou o mecanismo: *"se aproximamos
 * do mtp kkk"*. É por outro caminho, mas é a mesma economia — o remendo
 * REAPROVEITA a conta que o rascunho acabou de fazer.
 *
 * O que isso apaga do turno, e é quase tudo:
 *
 *     hoje ..... descarrega o granite · sobe 1,25 GB · remenda · devolve
 *                = 36 s de carga + 35 s de leitura fria = 71 s
 *     assim .... ele já está de pé, e QUENTE do rascunho
 *                = 0 s de carga + ~5 s = 5 s
 *
 * ── POR QUE A PERSONA AQUI É A DO RASCUNHO, E NÃO A DO REVISOR ───────────
 *
 * É esta linha que faz o ganho existir, e é fácil de destruir sem perceber. O
 * `cache_prompt` do llama.cpp só reaproveita PREFIXO IDÊNTICO: se o remendo
 * mandar uma persona diferente da que o rascunho mandou, o cache é descartado e
 * ele relê tudo. Medido: com o prefixo casando ele lê 66 a 84 tokens; sem
 * casar, 400.
 *
 * Então o system é `PERSONA_DO_RASCUNHO` — a MESMA string, byte por byte, da
 * chamada anterior. A instrução de remendo vai toda no `user`.
 *
 * ── O QUE ELE CONSEGUE, MEDIDO ───────────────────────────────────────────
 *
 * 6 de 12 defeitos, determinístico, sem eco e sem desvio. É menos que os 7/12
 * do titular — e as seis que ele erra são quebras de cânone que `aplicarRemendo`
 * RECUSA, então a fala original fica de pé. Ele conserta metade de graça e
 * nunca estraga.
 */
export async function remendarComRascunhador(
    perguntaEmIngles: string, frase: string, porque = '',
): Promise<RespostaDoRevisor> {
    if (!residente) return { tipo: 'sem-revisor' };
    const t0 = Date.now();
    try {
        const resposta = await residente.createChatCompletion({
            messages: [
                { role: 'system', content: PERSONA_DO_RASCUNHO },
                { role: 'user', content: enunciadoComExemplos(perguntaEmIngles, frase, porque) },
            ],
            ...FLOOR10_RASCUNHO_COMPLETION_CONFIG,
            // ── ESCOLHER, NÃO SORTEAR ────────────────────────────────────
            //
            // O resto do pipeline gera com `temperature: 0.7` porque variedade é
            // personagem. Consertar não é conversar: existe uma resposta boa e o
            // que se quer é o token mais provável. Medido, guloso levou os
            // desvios de 3/12 a 0/12 e tornou o resultado repetível — antes o
            // mesmo arquivo dava 6/12 numa rodada e 7/12 na seguinte.
            temperature: 0,
            stop: [...PARADAS_DO_REMENDO],
            max_tokens: FLOOR10_REMENDO_TOKENS,
            cache_prompt: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        const bruto = lerTexto(resposta);
        anotar('remendo:rascunhador', { ms: Date.now() - t0, chars: bruto.length });
        if (!bruto) return { tipo: 'vazio' };
        const fechada = primeiraFraseFechada(bruto);
        if (fechada) return { tipo: 'frase', texto: fechada, cortado: false };
        if (bruto.length > 2) return { tipo: 'frase', texto: bruto, cortado: false };
        return { tipo: 'vazio' };
    } catch (erro) {
        return {
            tipo: 'erro',
            erro: (erro instanceof Error ? erro.message : String(erro)).slice(0, 180),
        };
    }
}

export async function descarregarRascunhador(): Promise<void> {
    abortoDaCarga?.abort();
    abortoDaCarga = null;
    const e = residente;
    residente = null;
    enginePromise = null;
    encerrar(e);
}
