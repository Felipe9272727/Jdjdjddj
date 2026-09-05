// ── O REFLEXO VERBAL — a quinta IA, e a primeira em OUTRO motor ────────────
//
// O PEDIDO, na palavra de quem manda no jogo: "coloque uma ia menor pra ajudar
// todas a pensar mais rápido, tipo dando um atalho inteligente". E depois:
// "adicione o sistema onnx".
//
// POR QUE OUTRO MOTOR, E O QUE ISSO MUDA DE VERDADE
// O wllama (llama.cpp em WASM) só expõe geração de alto nível:
// createCompletion / createChatCompletion / createEmbedding / createRerank.
// Não há `decode`, `getLogits`, `tokenize` nem `sampling` — conferido baixando
// os tipos da versão 3.5.1 do CDN. O transformers.js, ao contrário, expõe
// `forward()` com LOGITS. Essa diferença não é detalhe: logits por posição são
// a única forma de um modelo CONFERIR o rascunho de outro, que é o que separa
// decodificação especulativa (idêntica ao original, só mais rápida) de chute
// (mais rápido e mais burro).
//
// Ou seja: com ONNX dentro do jogo, especulativa passa a ser possível — entre
// modelos que rodem AQUI. O SmolLM3-3B da fala continua no wllama e continua
// fora do alcance dela. Isto está escrito para a decisão ser tomada com o dado
// na mão, e não de novo pela lembrança de uma conversa.
//
// O QUE ELE FAZ HOJE: o reflexo. Quando o jogador manda uma mensagem, o 3B leva
// dezenas de segundos entre ler o prompt e escrever a primeira palavra — e
// nesse buraco a tela fica em "…". Um modelo de 135M responde em menos de um
// segundo com uma reação curta, do personagem, e o silêncio deixa de existir.
// Não acelera o 3B em um milissegundo: encurta a ESPERA PERCEBIDA, que é o que
// faz alguém impaciente fechar o jogo.
//
// REGRAS, todas herdadas do que este andar já aprendeu na marra:
// - OPCIONAL. Se o CDN cair, se o modelo não baixar, se o aparelho não der
//   conta: o jogo segue exatamente como antes.
// - NUNCA COMPETE COM A FALA. Ele roda ANTES de o 3B começar, com teto de
//   tempo curto, e é abortado se atrasar. Dois motores gerando ao mesmo tempo
//   foi o que fez o celular desligar sozinho.
// - Entra na FILA ÚNICA de download, como os outros quatro.
import { npcSet } from './npcStore';
import { floor10Fila, FILA_REFLEXO } from './floor10Fila';
import { DownloadMeter, DOWNLOAD_ZERO, downloadLine } from './floor10Download';
import { TETO_ESTOUROU, comTeto } from './floor10Teto';
import { anotar } from './floor10CaixaPreta';
import { vigiarInatividade } from './floor10Carga';

/** Versão fixada, como a do wllama: `main` mudar não pode quebrar o jogo. */
const TRANSFORMERS_V = '3.8.1';

const CDN = (globalThis as { __onnxCdn?: string }).__onnxCdn
    ?? `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_V}`;
const TRANSFORMERS_ESM = (globalThis as { __onnxModuleUrl?: string }).__onnxModuleUrl
    ?? `${CDN}/dist/transformers.min.js`;

/**
 * SmolLM2-135M-Instruct em int8 (~137 MB).
 *
 * Escolhido por tamanho antes de tudo: o aparelho já carrega 4,2 GB de pesos e
 * foi ele que desligou sozinho quando dois motores brigaram. 135M é o maior
 * modelo que dá para acrescentar sem mexer nesse equilíbrio — e para uma frase
 * curta de reação ele basta. q4f16 é menor (117 MB) mas mira WebGPU; em CPU o
 * int8 é o que roda.
 */
export const FLOOR10_REFLEXO_MODEL = Object.freeze({
    id: 'smollm2-135m',
    label: 'Reflexo SmolLM2 135M',
    repo: (globalThis as { __reflexoRepo?: string }).__reflexoRepo
        ?? 'HuggingFaceTB/SmolLM2-135M-Instruct',
    dtype: 'int8',
    /** Pesos + tokenizer, para a barra não mentir sobre o total. */
    bytes: 137_147_867 + 2_104_556,
});

/** Teto da reação. Passou disto, a fala do 3B já está a caminho e ele perdeu a vez. */
export const REFLEXO_TIMEOUT_MS = 2_500;

/**
 * ── O TETO PRECISA SER MEDÍVEL, PORQUE ELE ESTOURA SEMPRE ────────────────
 *
 * Medido no jogo de verdade (bancada `andar-10-real.mjs`, x86, CPU×2): nos dois
 * turnos de fala a caixa-preta registrou `reflexo:estourou-o-tempo` com 2516 ms
 * e 2504 ms, e NENHUM `reflexo:reagiu`. Ou seja: o jogador paga os 2,5 s — o
 * `sendToNpc` faz `await reagir(...)` — e não vê reação nenhuma, nunca.
 *
 * O número que falta para decidir o que fazer é "quanto ele PRECISARIA", e esse
 * número não dá para tirar de um teto que corta antes. Este atalho existe para
 * medi-lo, no aparelho de quem estiver medindo — mesmo padrão do
 * `limiteDoReflexo` logo abaixo, e pelo mesmo motivo.
 */
export function tetoDaReacao(): number {
    const forcado = (globalThis as { __f10ReflexoTetoMs?: number }).__f10ReflexoTetoMs;
    return typeof forcado === 'number' && forcado > 0 ? forcado : REFLEXO_TIMEOUT_MS;
}

/** Uma frase curta. Mais que isso deixa de ser reflexo e vira resposta. */
export const REFLEXO_MAX_TOKENS = 24;

/**
 * O PROMPT DO REFLEXO.
 *
 * Ele NÃO pode responder a pergunta — quem responde é o 3B, com o cânone, a
 * percepção e a memória. Se este modelo tentar responder, ele vai inventar, e
 * inventar é exatamente o que este andar passou meses consertando. O trabalho
 * dele é o primeiro segundo: reagir como quem ouviu, e devolver a vez.
 */
export const REFLEXO_SYSTEM = `Você é Nilo, um homem preso sozinho no 10º andar de um hotel. Alguém acabou de falar com você.
Responda com UMA reação curtíssima (no máximo 6 palavras), como quem ouviu e vai pensar antes de responder.
Nunca responda a pergunta. Nunca invente fatos. Nunca faça perguntas.
Exemplos: "Hm." / "Espera aí…" / "Deixa eu pensar." / "Ah, essa é difícil."`;

type Gerador = (
    entrada: Array<{ role: string; content: string }>,
    opcoes: Record<string, unknown>,
) => Promise<unknown>;

type TransformersModule = {
    pipeline: (
        tarefa: string,
        modelo: string,
        opcoes: Record<string, unknown>,
    ) => Promise<Gerador>;
    env?: { allowLocalModels?: boolean; backends?: Record<string, unknown> };
};

/**
 * UMA thread para o reflexo. Ele é um modelo de 135M em int8 que completa meia
 * frase enquanto o SmolLM3 ainda está pensando — trabalho de milissegundos.
 * Deixá-lo abrir um pool do tamanho do aparelho era dar a ele o mesmo peso que
 * o cérebro de fala tem, para um décimo do serviço.
 */
export const REFLEXO_THREADS = 1;

let modulePromise: Promise<TransformersModule> | null = null;
let geradorPromise: Promise<Gerador | null> | null = null;
let gerador: Gerador | null = null;
let pesosNoAparelho = false;
const medidor = new DownloadMeter();

/** O reflexo já está no aparelho? Pergunta sem baixar nada. */
export function reflexoJaCarregado(): boolean {
    return gerador !== null || pesosNoAparelho;
}

/**
 * Progresso do transformers.js: ele reporta por ARQUIVO (pesos, tokenizer,
 * config). Só o arquivo grande interessa para a barra — os outros somam alguns
 * KB e fariam a fração pular para trás.
 */
/**
 * O vigia da carga em curso. Módulo, e não parâmetro, porque quem recebe os
 * eventos de progresso é o `progress_callback` que o transformers.js chama de
 * dentro — não há por onde passar contexto.
 */
let vigiaAtual: { avancou: () => void; parar: () => void } | null = null;
/**
 * Qual carga é a da vez. `progress_callback` é registrado DENTRO do
 * `pipeline()`, e uma carga abandonada continua chamando o dela: sem esta
 * senha, o zumbi alimentava `vigiaAtual` — que já é o vigia da tentativa
 * SEGUINTE — e a mantinha viva para sempre. O vigia deixava de vigiar
 * exatamente quando mais precisava.
 */
let cargaDaVez = 0;

function criarAoProgredir(minhaCarga: number) {
    return function aoProgredir(evento: {
        status?: string; file?: string; loaded?: number; total?: number;
    }): void {
        if (evento.status !== 'progress') return;
        // QUALQUER byte de QUALQUER arquivo conta como sinal de vida — inclusive do
        // tokenizer, que a barra ignora de propósito. Confundir "não interessa para
        // a barra" com "não é progresso" faria o vigia matar um download saudável.
        if (minhaCarga === cargaDaVez) vigiaAtual?.avancou();
        if (!evento.file || !/\.onnx$/i.test(evento.file)) return;
        const amostra = medidor.push(evento.loaded ?? 0, evento.total ?? 0);
        floor10Fila.progresso(FILA_REFLEXO, amostra);
        npcSet({
            reflexoPhase: 'loading',
            reflexoLoadProgress: amostra.totalBytes > 0
                ? Math.min(1, amostra.bytes / amostra.totalBytes)
                : 0,
            reflexoLoadText: `baixando ${FLOOR10_REFLEXO_MODEL.label} · ${downloadLine(amostra)}`,
        });
    };
}

/**
 * ── O ÚNICO CÉREBRO SEM CÃO DE GUARDA, E ELE FICA NO MEIO DA FILA ─────────
 *
 * A vontade, o motor e a memória têm `vigiarInatividade` desde que uma carga
 * silenciosa deixou a vontade "carregando" até a página ser recarregada. Aqui
 * não havia nada — e este é o cérebro com MAIS motivo para ter:
 *
 *   - baixa de `huggingface.co`, host diferente de todos os outros (jsdelivr),
 *     ou seja, um ponto de falha que nenhum outro compartilha;
 *   - `mod.pipeline()` não aceita AbortSignal: se a rede do celular morrer no
 *     meio, a promessa não resolve nem rejeita. Fica.
 *
 * E o preço não é perder o reflexo. É perder a FILA: `iniciarPrecarga` roda os
 * passos em sequência com `await`, e o reflexo é o 3º de 5. Um download travado
 * aqui significa que A VONTADE E O MOTOR NUNCA BAIXAM — que é, palavra por
 * palavra, um relato que ele já fez ("só baixou a smollm3 e a de embedding").
 * Eu tinha atribuído aquilo inteiro ao `adiarEnquanto`; esta era a outra porta,
 * e ela continuava aberta.
 *
 * Como o `pipeline()` não pode ser abortado, o vigia não interrompe o download
 * de verdade — ele DESISTE DE ESPERAR, devolve `null` e libera a fila. O
 * download segue em segundo plano e, se um dia terminar, o cache do navegador
 * fica quente para a próxima tentativa. Perder o reflexo custa o primeiro
 * segundo de uma resposta; perder a vontade custa o livre-arbítrio do NPC.
 */
// ── E 90 s ERAM POUCOS, PELO MOTIVO QUE EU NÃO CONSIDEREI ────────────────
//
// Eu escolhi 90 s "porque o arquivo é pequeno". O vigia não mede tamanho: mede
// SILÊNCIO. E a parte silenciosa daqui não é o download — é o que vem depois,
// que não emite `progress` nenhum:
//
//   criar a sessão ONNX · compilar o WASM · subir o worker do `proxy: true` ·
//   e, quando os pesos já estão no cache do navegador, a carga inteira, que
//   não gera evento de progresso porque não há rede.
//
// Num celular lento, esse trecho mudo passa de 90 s com facilidade — e aí o
// vigia mata uma carga SAUDÁVEL e o andar perde o reflexo sem motivo. É o
// oposto do que ele existe para fazer.
//
// 180 s é o mesmo número que `floor10Carga` escolheu para o caso análogo, e
// aquele foi calibrado contra rede de celular de verdade. Alinhar os dois vale
// mais que um palpite meu novo.
export const REFLEXO_INATIVIDADE_MS = 180_000;

/**
 * O teto em vigor. Mesmo padrão de `limiteDeInatividade`: sem um atalho, provar
 * que o vigia reprova custaria 90 s de relógio de verdade por caso — e um teste
 * caro é um teste que ninguém roda.
 */
export function limiteDoReflexo(): number {
    const forcado = (globalThis as { __f10ReflexoInatividadeMs?: number })
        .__f10ReflexoInatividadeMs;
    return typeof forcado === 'number' && forcado > 0 ? forcado : REFLEXO_INATIVIDADE_MS;
}

async function carregar(): Promise<Gerador | null> {
    medidor.reset();
    const reabrindo = pesosNoAparelho;
    anotar(reabrindo ? 'reflexo:reabrindo' : 'reflexo:carregando');
    const comecou = Date.now();
    npcSet({
        reflexoPhase: reabrindo ? 'reopening' : 'loading',
        reflexoLoadProgress: reabrindo ? 1 : 0,
        reflexoLoadText: reabrindo
            ? `reabrindo o ${FLOOR10_REFLEXO_MODEL.label}…`
            : `preparando o ${FLOOR10_REFLEXO_MODEL.label}…`,
        reflexoDownload: DOWNLOAD_ZERO,
    });
    // O vigia começa ANTES do import: o próprio `import()` do transformers.js
    // sai pela rede, e travar ali é tão fatal para a fila quanto travar no
    // download dos pesos.
    const minhaCarga = ++cargaDaVez;
    let desistiu = false;
    // `Promise.withResolvers` só existe a partir do ES2024, e o alvo deste
    // projeto é anterior. A forma antiga faz o mesmo.
    let desistir: (v: null) => void = () => {};
    const render = new Promise<null>((resolve) => { desistir = resolve; });
    vigiaAtual = vigiarInatividade(() => {
        desistiu = true;
        anotar('reflexo:desistiu', { ms: Date.now() - comecou });
        npcSet({
            reflexoPhase: 'unavailable',
            reflexoLoadText:
                `${FLOOR10_REFLEXO_MODEL.label} sem resposta; a fila segue sem ele`,
        });
        // A FILA É LIBERADA AQUI, e é este o ponto do vigia. `pipeline()` não
        // aceita AbortSignal, então o download não para — o que para é a ESPERA.
        desistir(null);
    }, limiteDoReflexo());
    try {
        modulePromise ??= import(/* @vite-ignore */ TRANSFORMERS_ESM) as
            unknown as Promise<TransformersModule>;
        // ── O IMPORT TAMBÉM ENTRA NA CORRIDA ──────────────────────────────
        //
        // Eu escrevi o vigia e depois comemorei que "a fila não pode mais ser
        // presa" — e tinha corrido o `render` só contra `pipeline()`. Um
        // `import()` pendurado (o CDN aceita a conexão e não responde) parava
        // AQUI, antes do `pipeline`, e a fila ficava presa exatamente como
        // antes. O comentário lá em cima jurava fechar esse buraco; o código
        // fechava metade dele.
        const mod = await Promise.race([render, modulePromise]);
        if (!mod || desistiu) {
            geradorPromise = null;
            // E O IMPORT TAMBÉM. Se foi ELE que pendurou, guardá-lo faz toda
            // tentativa seguinte esperar a mesma promessa morta — o vigia
            // dispararia de novo, e de novo, sem nunca tocar na rede.
            modulePromise = null;
            return null;
        }
        // ── O QUINTO RUNTIME TAMBÉM TEM POOL DE THREADS ───────────────────
        //
        // `env.backends` estava declarado no tipo e NUNCA era configurado. Sem
        // isto o onnxruntime-web usa o padrão dele — `navigator.hardware-
        // Concurrency` — e abre um pool do tamanho do aparelho. Num celular de
        // 8 núcleos são OITO threads de ONNX por cima das quatro do llama.cpp,
        // e ninguém no jogo sabia dessas oito: o coordenador dos cérebros nem
        // enxerga este runtime.
        //
        // O reflexo é um modelo de 135M em int8 que escreve meia frase. Ele não
        // precisa da máquina inteira; precisa de um núcleo e de sair da frente.
        // Este é o mesmo erro de orçamento de CPU que já custou caro na fala,
        // agora no único runtime que tinha escapado da conta.
        try {
            const backends = (mod.env ??= {}).backends ??= {};
            const onnx = (backends as { onnx?: Record<string, unknown> }).onnx ??= {};
            const wasm = (onnx as { wasm?: Record<string, unknown> }).wasm ??= {};
            (wasm as { numThreads?: number }).numThreads = REFLEXO_THREADS;
            // ── E `proxy` PRECISOU SER LIGADO ─────────────────────────────
            //
            // Aqui estava escrito: "`proxy` tiraria o ONNX da thread principal,
            // mas ele já roda pouco e o proxy custa outra cópia dos pesos". A
            // primeira metade é verdade; a segunda era palpite meu, e errado.
            //
            // Com `numThreads: 1` o onnxruntime-web usa a build SINGLE-THREAD,
            // que roda na thread que chamou — a principal. Somado ao `await`
            // que eu mesmo pus antes da fala, o jogo congela enquanto o reflexo
            // escreve.
            //
            // MEDIDO no celular emulado, quatro mensagens, quadro a quadro:
            //
            //     61 buracos acima de 100ms · o pior deles 6.016 ms
            //     buracos >= 3s: 1
            //     veredito: THREAD PRINCIPAL BLOQUEADA
            //
            // Um buraco só, enorme, é assinatura de trabalho síncrono — e não
            // de disputa de núcleo, que daria muitos buracos médios. Bate com o
            // relato: "ao enviar, trava uns 10s e volta".
            //
            // `proxy: true` põe o ONNX num Worker. Continua com UMA thread — o
            // orçamento de CPU não muda; o que muda é que ele para de segurar a
            // thread que desenha o jogo.
            (wasm as { proxy?: boolean }).proxy = true;
        } catch { /* build do transformers.js sem env: segue com o padrão */ }
        const criado = await Promise.race([render, mod.pipeline(
            'text-generation',
            FLOOR10_REFLEXO_MODEL.repo,
            {
            dtype: FLOOR10_REFLEXO_MODEL.dtype,
            // CPU de propósito. A GPU deste andar já custou duas falas perdidas
            // e um gerente inteiro para administrar; o reflexo não vai reabrir
            // essa porta por 135M de parâmetros.
            device: 'wasm',
            progress_callback: criarAoProgredir(minhaCarga),
            },
        )]);
        // Desistir não é falhar em silêncio: a fase e o texto já foram
        // publicados pelo vigia, e sobrescrevê-los com "pronto" seria mentir.
        if (!criado || desistiu) {
            // ── E A PRÓXIMA TENTATIVA PRECISA PODER ACONTECER ─────────────
            // Defeito que EU criei junto com o vigia: este `return null` sai
            // sem passar pelo `catch`, que é quem zerava `geradorPromise`. Sem
            // esta linha, `precarregarReflexo` guardaria a promessa resolvida
            // com null e o reflexo morreria pelo resto da sessão — exatamente o
            // defeito que eu tinha acabado de consertar na vontade, recriado
            // por mim no arquivo ao lado, no mesmo dia.
            geradorPromise = null;
            return null;
        }
        gerador = criado;
        pesosNoAparelho = true;
        floor10Fila.concluir(FILA_REFLEXO);
        npcSet({
            reflexoPhase: 'ready',
            reflexoLoadProgress: 1,
            reflexoLoadText: `${FLOOR10_REFLEXO_MODEL.label} pronto`,
        });
        anotar('reflexo:pronto', { ms: Date.now() - comecou, reabertura: reabrindo });
        return criado;
    } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        geradorPromise = null;
        // ── E O MÓDULO TAMBÉM ─────────────────────────────────────────────
        // `modulePromise ??= import(...)` guarda a promessa do IMPORT. Se o CDN
        // estiver fora do ar no instante da primeira tentativa, ela fica
        // guardada REJEITADA, e toda tentativa seguinte morre nela sem sequer
        // tocar na rede. Um soluço de rede de celular virava "sem reflexo até
        // recarregar a página".
        modulePromise = null;
        npcSet({
            reflexoPhase: 'unavailable',
            reflexoLoadText: `${FLOOR10_REFLEXO_MODEL.label} indisponível: ${motivo}`,
        });
        anotar('reflexo:falhou', { motivo: motivo.slice(0, 80) });
        return null;
    } finally {
        vigiaAtual?.parar();
        vigiaAtual = null;
    }
}

/** Carrega o reflexo. Usado pela fila; seguro chamar várias vezes. */
export async function precarregarReflexo(): Promise<boolean> {
    geradorPromise ??= carregar();
    return await geradorPromise !== null;
}

/** Texto cru do transformers.js, que já devolveu três formatos diferentes. */
export function lerTextoGerado(saida: unknown): string {
    const primeiro = Array.isArray(saida) ? saida[0] : saida;
    if (!primeiro || typeof primeiro !== 'object') return '';
    const registro = primeiro as {
        generated_text?: unknown;
    };
    const bruto = registro.generated_text;
    if (typeof bruto === 'string') return bruto;
    // Formato de chat: a última mensagem é a do assistente.
    if (Array.isArray(bruto)) {
        const ultima = bruto[bruto.length - 1] as { content?: unknown } | undefined;
        if (ultima && typeof ultima.content === 'string') return ultima.content;
    }
    return '';
}

/**
 * Deixa a reação apresentável: uma frase, curta, sem aspas nem eco do prompt.
 * Um reflexo comprido atrapalha mais que ajuda — ele ocuparia a tela que a
 * resposta de verdade vai usar em seguida.
 */
export function limparReacao(bruto: string): string {
    // A ORDEM IMPORTA: primeiro fica com a linha, DEPOIS tira as aspas. Ao
    // contrário, `"Hm."\nE também…` perdia a aspa da frente e ficava com a de
    // trás — o teste pegou isso na primeira execução.
    const limpo = (bruto.split('\n')[0] ?? '')
        .trim()
        .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
        .trim();
    if (!limpo) return '';
    const corte = limpo.slice(0, 60);
    // Termina numa fronteira de frase quando houver uma; senão devolve o que
    // coube, com reticências, para não parecer que travou no meio.
    const fim = Math.max(corte.lastIndexOf('.'), corte.lastIndexOf('…'), corte.lastIndexOf('!'), corte.lastIndexOf('?'));
    if (fim > 8) return corte.slice(0, fim + 1);
    return corte.length < limpo.length ? `${corte.trimEnd()}…` : corte;
}

/**
 * A REAÇÃO IMEDIATA. Nunca lança, nunca demora: se passar do teto, devolve ''
 * e o jogo segue como se ela não existisse.
 */
export async function reagir(fala: string): Promise<string> {
    if (!gerador) return '';
    const comecou = Date.now();
    try {
        const corrida = await comTeto(
            gerador(
                [
                    { role: 'system', content: REFLEXO_SYSTEM },
                    { role: 'user', content: fala },
                ],
                {
                    max_new_tokens: REFLEXO_MAX_TOKENS,
                    do_sample: true,
                    temperature: 0.7,
                    top_p: 0.9,
                    return_full_text: false,
                },
            ),
            tetoDaReacao(),
        );
        if (corrida === TETO_ESTOUROU) {
            anotar('reflexo:estourou-o-tempo', { ms: Date.now() - comecou });
            return '';
        }
        const reacao = limparReacao(lerTextoGerado(corrida));
        anotar('reflexo:reagiu', { ms: Date.now() - comecou, letras: reacao.length });
        return reacao;
    } catch (erro) {
        anotar('reflexo:erro', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 60),
        });
        return '';
    }
}

/** Só para os testes. */
export function resetReflexoForTests(): void {
    modulePromise = null;
    geradorPromise = null;
    gerador = null;
    pesosNoAparelho = false;
}

/** Teto do resumo: ele roda fora do caminho da fala, então pode respirar mais. */
export const RESUMO_TIMEOUT_MS = 6_000;

/** Uma frase. O prompt pede isso, e o teto garante.  */
export const RESUMO_MAX_TOKENS = 64;

/**
 * Geração livre do micro, para quem precisa de texto e não de reação.
 *
 * É o mesmo modelo, o mesmo motor e a mesma regra: nunca lança, nunca demora
 * além do teto, e devolve '' quando não deu. Quem chama decide o que fazer com
 * o vazio — no caso do compressor, ficar com o resumo que já tinha.
 */
export async function completar(
    prompt: string,
    tetoMs = RESUMO_TIMEOUT_MS,
    // ── QUANDO REPETIR É O DEFEITO, A GANÂNCIA TEM DE SAIR ────────────────
    //
    // O resumo do compressor quer ser estável: mesmo texto, mesmo resumo, e
    // por isso o padrão continua guloso. A BOLHA quer o contrário — ela existe
    // porque o dono do jogo viu a mesma frase dezenas de vezes, e decodificação
    // gulosa com prompt parecido devolve saída parecida por construção.
    opcoes: { amostrar?: boolean; maxTokens?: number } = {},
): Promise<string> {
    if (!gerador) return '';
    try {
        const corrida = await comTeto(
            gerador(
                [{ role: 'user', content: prompt }],
                {
                    max_new_tokens: opcoes.maxTokens ?? RESUMO_MAX_TOKENS,
                    ...(opcoes.amostrar
                        ? { do_sample: true, temperature: 0.9, top_p: 0.95 }
                        : { do_sample: false }),
                    return_full_text: false,
                },
            ),
            tetoMs,
        );
        return corrida === TETO_ESTOUROU ? '' : lerTextoGerado(corrida);
    } catch {
        return '';
    }
}

/** Teto do rascunho no reflexo: o Nilo fala em 2–3 frases, não em parágrafos. */
export const RASCUNHO_REFLEXO_TOKENS = 90;

/**
 * O reflexo já tapa o silêncio; aqui ele tenta escrever a fala inteira.
 *
 * POR QUE ELE, DE NOVO POR ELIMINAÇÃO
 *
 * Durante a conversa só existem dois modelos de pé além dele: o SmolLM3-3B (que
 * é o revisor — se ele rascunhar não há atalho) e o EmbeddingGemma (que não
 * escreve). O motor e a vontade estão desligados POR DESENHO nessa janela. Este
 * é o único gerador disponível, e ele já está aqui, já roda antes do 3B começar,
 * e já tem teto curto e aborto — as três regras que o cabeçalho deste arquivo
 * promete.
 *
 * O PROMPT É ACHATADO NUMA MENSAGEM SÓ, e não é preguiça: 135M com system +
 * histórico de quatro mensagens gasta o contexto inteiro em enquadramento e
 * responde sobre a mensagem errada. Uma instrução curta seguida da pergunta é o
 * formato em que um modelo deste tamanho ainda acerta o alvo.
 *
 * `amostrar: true` pelo mesmo motivo da bolha: decodificação gulosa com prompt
 * parecido devolve saída parecida por construção, e repetição já foi um defeito
 * fotografado neste jogo.
 */
export async function rascunharComReflexo(
    persona: string,
    perguntaDoJogador: string,
): Promise<string> {
    if (!gerador) return '';
    const prompt = `${persona.trim()}\n\n`
        + `O jogador diz: "${perguntaDoJogador.trim()}"\n\n`
        + 'Responda como Nilo, em português, em no máximo três frases curtas. '
        + 'Só a fala dele, sem aspas e sem narração.';
    return completar(prompt, RESUMO_TIMEOUT_MS, {
        amostrar: true,
        maxTokens: RASCUNHO_REFLEXO_TOKENS,
    });
}
