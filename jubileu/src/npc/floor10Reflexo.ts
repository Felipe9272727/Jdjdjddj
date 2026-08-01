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
import { anotar } from './floor10CaixaPreta';

/** Versão fixada, como a do wllama: `main` mudar não pode quebrar o jogo. */
const TRANSFORMERS_V = '3.8.1';

const CDN = (globalThis as { __onnxCdn?: string }).__onnxCdn
    ?? `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_V}`;

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
function aoProgredir(evento: {
    status?: string; file?: string; loaded?: number; total?: number;
}): void {
    if (evento.status !== 'progress') return;
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
    try {
        modulePromise ??= import(/* @vite-ignore */ `${CDN}/dist/transformers.min.js`) as
            unknown as Promise<TransformersModule>;
        const mod = await modulePromise;
        const criado = await mod.pipeline('text-generation', FLOOR10_REFLEXO_MODEL.repo, {
            dtype: FLOOR10_REFLEXO_MODEL.dtype,
            // CPU de propósito. A GPU deste andar já custou duas falas perdidas
            // e um gerente inteiro para administrar; o reflexo não vai reabrir
            // essa porta por 135M de parâmetros.
            device: 'wasm',
            progress_callback: aoProgredir,
        });
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
        npcSet({
            reflexoPhase: 'unavailable',
            reflexoLoadText: `${FLOOR10_REFLEXO_MODEL.label} indisponível: ${motivo}`,
        });
        anotar('reflexo:falhou', { motivo: motivo.slice(0, 80) });
        return null;
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
        const corrida = await Promise.race([
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
            new Promise<null>((resolve) => {
                globalThis.setTimeout(() => resolve(null), REFLEXO_TIMEOUT_MS);
            }),
        ]);
        if (corrida === null) {
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
