// ── O COMPRESSOR DE CONTEXTO — o atalho que o dono do jogo aprovou ─────────
//
// O PEDIDO: "uma ia menor pra ajudar todas a pensar mais rápido e sem perder
// inteligência, tipo dando um atalho inteligente pro processo de pensamento
// delas".
//
// O QUE ELE FAZ: o micro (SmolLM2-135M, ONNX) vai dobrando a conversa antiga
// numa linha só, e essa linha entra no prompt no lugar de mensagens inteiras.
// Menos tokens para o 3B LER antes de começar a escrever.
//
// E TEM UM SEGUNDO GANHO, que não é velocidade: hoje o histórico é cortado por
// orçamento (1.800 caracteres, no máximo 4 mensagens) e o que passa disso
// simplesmente SOME. Numa conversa longa — exatamente o que vai acontecer
// quando o jogo for publicado — o Nilo esquece o começo. O resumo faz o começo
// sobreviver em uma linha. Fica mais rápido E lembra mais.
//
// ── A REGRA QUE NÃO SE QUEBRA ─────────────────────────────────────────────
// O micro NUNCA toca em fato. Cânone, percepção e vontade continuam entrando
// no prompt VERBATIM, como sempre. Um modelo de 135M parafraseando "jogador
// visível, à frente, 2,7 m" viraria "jogador longe" — e este andar já gastou
// commits inteiros consertando o Nilo dizer que estava sozinho com o jogador na
// frente dele. Ele resume A CONVERSA, que é opinião e lembrança, não medição.
//
// E é OPCIONAL como tudo aqui: sem o micro, sem rede, com o resumo saindo
// estranho — o jogo se comporta exatamente como se comportava antes.
import { anotar } from './floor10CaixaPreta';

/** Só vale resumir quando a conversa já passou disto. Antes, não há o que dobrar. */
export const GATILHO_RESUMO = 6;

/** Teto do resumo. Ele existe para ECONOMIZAR prompt; comprido perde a graça. */
export const RESUMO_MAX_CHARS = 240;

/** Abaixo disto o que voltou não é resumo, é ruído. */
const RESUMO_MIN_CHARS = 12;

export type MensagemDaConversa = { role: string; content: string };

let resumo = '';
/** Quantas mensagens do histórico já estão dobradas dentro do resumo. */
let cobertas = 0;
let emCurso = false;

/** O resumo em cartaz. Vazio quando não há (ou não deu). */
export function resumoDaConversa(): string {
    return resumo;
}

export function quantasCobertas(): number {
    return cobertas;
}

export function limparResumo(): void {
    resumo = '';
    cobertas = 0;
    emCurso = false;
}

/**
 * O texto que o micro recebe. Curto e literal: um modelo de 135M não segue
 * instrução elaborada, mas copia bem um formato.
 */
export function promptDeResumo(
    anterior: string,
    mensagens: readonly MensagemDaConversa[],
): string {
    const conversa = mensagens
        .map((m) => `${m.role === 'user' ? 'Visitante' : 'Nilo'}: ${m.content}`)
        .join('\n');
    const base = anterior
        ? `Resumo até agora: ${anterior}\n\nContinuação da conversa:\n${conversa}`
        : `Conversa:\n${conversa}`;
    return `${base}\n\nEscreva UMA frase curta, em português, dizendo o que já foi conversado. Não invente nada. Não responda nada. Só a frase.`;
}

/**
 * Limpa o que o micro devolveu e decide se presta. Devolver '' aqui significa
 * "fica com o resumo antigo" — nunca piorar o que já existe.
 */
export function aproveitarResumo(bruto: string, anterior: string): string {
    const linha = (bruto.split('\n').find((l) => l.trim().length > 0) ?? '')
        .trim()
        .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
        .trim();
    if (linha.length < RESUMO_MIN_CHARS) return anterior;
    // Papagaio: devolveu a própria instrução em vez de resumir.
    if (/escreva uma frase|não invente|resumo até agora/i.test(linha)) return anterior;
    // Texto girando no lugar — o mesmo defeito que o cérebro de vontade já teve.
    const palavras = linha.toLowerCase().split(/\s+/);
    if (palavras.length >= 8 && new Set(palavras).size <= palavras.length / 2) return anterior;
    return linha.slice(0, RESUMO_MAX_CHARS);
}

/**
 * Quais mensagens ainda não estão no resumo E já saíram do que o 3B lê
 * verbatim. São exatamente as que iam ser esquecidas.
 */
export function mensagensParaDobrar(
    history: readonly MensagemDaConversa[],
    verbatim: number,
): MensagemDaConversa[] {
    const fim = Math.max(0, history.length - verbatim);
    return history.slice(cobertas, fim);
}

/**
 * Dobra a conversa antiga no resumo. NUNCA bloqueia a fala: é chamado sem
 * `await` depois que a resposta já foi entregue, e se falhar não muda nada.
 *
 * `gerar` entra por parâmetro para este módulo não importar o motor ONNX — o
 * mesmo cuidado que a fila e a pré-carga já tomam.
 */
export async function dobrarConversa(
    history: readonly MensagemDaConversa[],
    verbatim: number,
    gerar: (prompt: string) => Promise<string>,
): Promise<boolean> {
    if (emCurso) return false;
    if (history.length < GATILHO_RESUMO) return false;
    const pendentes = mensagensParaDobrar(history, verbatim);
    if (pendentes.length === 0) return false;

    emCurso = true;
    const comecou = Date.now();
    try {
        const bruto = await gerar(promptDeResumo(resumo, pendentes));
        const novo = aproveitarResumo(bruto, resumo);
        const mudou = novo !== resumo && novo !== '';
        if (mudou) {
            resumo = novo;
            cobertas = history.length - verbatim;
        }
        anotar('compressor:dobrou', {
            ms: Date.now() - comecou,
            mensagens: pendentes.length,
            letras: resumo.length,
            aproveitado: mudou,
        });
        return mudou;
    } catch (erro) {
        anotar('compressor:falhou', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 60),
        });
        return false;
    } finally {
        emCurso = false;
    }
}

/**
 * O bloco que entra no prompt do 3B. Vai depois da persona e antes do resto,
 * porque muda RARAMENTE — uma vez a cada várias falas — e assim o prefixo em
 * cache do llama.cpp sobrevive entre uma pergunta e outra.
 */
export function blocoDoResumo(): string {
    if (!resumo) return '';
    return `\n\nO QUE VOCÊS JÁ CONVERSARAM ANTES (lembrança sua, resumida): ${resumo}`;
}
