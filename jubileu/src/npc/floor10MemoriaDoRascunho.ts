// ── O RASCUNHADOR NÃO TINHA MEMÓRIA NENHUMA ──────────────────────────────
//
// Observação do dono do jogo, e ela se confirma no código com dois greps:
// `floor10PipelineReal.ts` e `floor10Rascunhador.ts` importam ZERO de
// `floor10Canon`, `floor10Memoria`, `floor10Bolha` e `floor10Compressor`. O
// caminho antigo (o 3B em `wllamaEngine.ts`) chama `buildFloor10SystemPrompt`,
// que junta persona + 1 fato recuperado + percepção + vontade + já-dito +
// resumo. O pipeline não chama nada disso: o rascunhador recebe a persona fixa
// e a pergunta, e mais nada.
//
// Ou seja, ele não inventava por ser pequeno. Ele inventava porque NÃO TINHA
// A QUE SER FIEL. O 10º andar tem 43 sonos contados, um relógio parado em
// 03:17 e um elevador que nunca obedeceu — e nada disso chegava até ele.
//
// ── ONDE O FATO ENTRA, E POR QUE NÃO NO SISTEMA ──────────────────────────
//
// O fato vai na mensagem do USUÁRIO, nunca na do sistema. A persona é o
// prefixo estável que o `cache_prompt` reaproveita entre chamadas; mudar o
// sistema a cada pergunta jogaria fora o cache e faria a leitura ser cobrada
// inteira toda vez. Na mensagem do usuário o custo é só o do fato, porque a
// pergunta já muda de qualquer jeito.
import { retrieveFloor10Canon, type FatoDaMemoria } from './floor10Canon';
import { fatoEmIngles, fatosValidos, type LugarDoFato } from './floor10CanoneEmIngles';

/**
 * Onde o Nilo já esteve. Hoje só o 10º; quando ele subir, o andar novo entra
 * AO LADO e não no lugar — a memória dele é acumulativa por decisão de roteiro.
 */
export const LUGARES_CONHECIDOS: readonly LugarDoFato[] = Object.freeze(['andar10']);

/** Quantos fatos entram no rascunho. Um, como no curador do 3B. */
export const FATOS_NO_RASCUNHO = 1;

/**
 * O bloco de memória do rascunho, em inglês, ou string vazia quando não há
 * fato que sirva.
 *
 * `lembrado` é o que a memória POR SIGNIFICADO recuperou (embeddinggemma,
 * 11/12 nas perguntas reais). Ele tem preferência sobre a busca por palavra
 * (2/12) — a mesma precedência do curador, e pelo mesmo motivo medido.
 */
export function memoriaDoRascunho(
    pergunta: string,
    lembrado?: FatoDaMemoria | null,
    lugares: readonly LugarDoFato[] = LUGARES_CONHECIDOS,
): string {
    const validos = new Set(fatosValidos(lugares).map((f) => f.id));
    const escolhido = escolher(pergunta, lembrado, validos);
    if (!escolhido) return '';
    // "What you know" e não "Context": o modelo pequeno trata contexto como
    // texto a ser resumido, e trata conhecimento como coisa a ser usada.
    return `What you know that matters here: ${escolhido.texto}`;
}

function escolher(
    pergunta: string,
    lembrado: FatoDaMemoria | null | undefined,
    validos: ReadonlySet<string>,
): { id: string; texto: string } | null {
    if (lembrado && validos.has(lembrado.id)) {
        const emIngles = fatoEmIngles(lembrado.id);
        if (emIngles) return emIngles;
    }
    // A busca lexical do cânone aceita português, inglês e espanhol nas
    // palavras-chave, então ela funciona com a pergunta já traduzida.
    for (const achado of retrieveFloor10Canon(pergunta, 3)) {
        if (!validos.has(achado.id)) continue;
        const emIngles = fatoEmIngles(achado.id);
        if (emIngles) return emIngles;
    }
    return null;
}

/**
 * O que o rascunhador recebe como mensagem do usuário: a memória, quando há, e
 * a pergunta. Uma função só para que a bancada e o jogo não montem strings
 * diferentes — foi assim que o revisor treinado quase foi medido num formato
 * que ele nunca viu.
 */
export function turnoDoRascunho(perguntaEmIngles: string, memoria: string): string {
    return memoria ? `${memoria}\n\n${perguntaEmIngles}` : perguntaEmIngles;
}
