// ── O PIPELINE INGLÊS-PRIMEIRO — a arquitetura que o dono do jogo desenhou ──
//
//     MoE rascunha em INGLÊS → juiz de TOM → revisor remenda a frase errada
//     → Bergamot traduz → passe pt-BR → tela
//
// Medido de ponta a ponta em `bancada-navegador/VELOCIDADE.md`:
//
//     A) SmolLM3 escrevendo direto ....... 13,0 s / 8,1 s
//     B) pipeline (juiz não marcou) ......  3,9 s / 3,4 s     0,30× e 0,42×
//     B) pipeline (3 de 3 marcados) ...... 15,4 s             1,01×
//
// Ou seja: 2,4× a 3,3× mais rápido quando o rascunho passa, e empate no pior
// caso absoluto. O ponto de equilíbrio é o juiz aprovar 17% dos rascunhos.
//
// ── POR QUE INGLÊS, e não é preferência ───────────────────────────────────
//
// Três medições independentes apontaram para o mesmo lugar:
//
//   1. o rascunhador MoE erra menos em inglês (em português ele quebrou o
//      cânone em 2 de 3 falas; em inglês, nenhuma);
//   2. o JUIZ só enxerga em inglês — o mesmo par de frases dá 0,94 de
//      contradição em inglês e 0,29 em português;
//   3. o REVISOR fica livre: o LFM2.5 foi barrado como rascunhador por não
//      declarar português no card, e em inglês essa objeção não existe.
//
// O preço é um tradutor, e ele só ficou barato com o Bergamot (83 ms contra
// 2.200 ms do m2m100). Antes disso o desenho perdia por 66% de custo.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
//
// Não carrega modelo. Recebe as quatro peças por parâmetro, e isso não é
// elegância: é o que permite testar a ORQUESTRAÇÃO — a ordem, o que acontece
// quando cada peça falha, quando o juiz marca tudo, quando não marca nada —
// sem baixar 1 GB. As peças reais são ligadas em `wllamaEngine`.

import { abrasileirar } from './floor10Tradutor';

/** As quatro peças. Qualquer uma devolvendo vazio/nulo aborta o pipeline. */
export type PecasDoPipeline = {
    /** Escreve o primeiro jato, em inglês. */
    rascunhar: (perguntaEmIngles: string) => Promise<string | null>;
    /** Devolve os índices 1-based das frases que soam fora do personagem. */
    julgar: (frases: readonly string[]) => Promise<number[]>;
    /** Reescreve UMA frase, em inglês. */
    remendar: (perguntaEmIngles: string, frase: string) => Promise<string | null>;
    /** Traduz o texto final para pt-BR. */
    traduzir: (textoEmIngles: string) => Promise<string | null>;
};

export type SaidaDoPipeline = {
    /** A fala pronta, em pt-BR. */
    fala: string;
    /** Quantas frases o juiz marcou — o número que decide se o desenho paga. */
    marcadas: number;
    /** Quantas o revisor de fato trocou. */
    remendadas: number;
    /** Consertos de string, que saem de graça. */
    limpezas: number;
};

/**
 * ── OS CONSERTOS DE STRING, QUE NUNCA DEVEM IR AO REVISOR ─────────────────
 *
 * Isto existe por causa de uma medição embaraçosa: numa execução o juiz marcou
 * `"Nilo: "` e eu mandei a frase ao revisor — SESSENTA SEGUNDOS para tirar um
 * prefixo, e ele nem conseguiu (devolveu o rótulo de volta com "(Correção a uma
 * frase)" colado). Aquele caso sozinho respondeu por 60 dos 87 segundos do
 * pipeline inteiro.
 *
 * Defeito de FORMA é conserto de string: microssegundos e nunca falha. Só
 * defeito de CONTEÚDO merece um modelo.
 */
const LIMPEZAS: readonly (readonly [RegExp, string])[] = Object.freeze([
    [/^\s*nilo\s*:\s*/i, ''],
    [/^\s*["“](.*)["”]\s*$/s, '$1'],
    // O eco do prompt, INTEIRO. A primeira versão desta linha era
    // `(?:no label|nilo'?s line only)` e comia só o pedaço final: de
    // "I wait. Nilo's line only, no label." sobrava "I wait. Nilo's line only,"
    // — pior que não ter limpado, porque o texto fica truncado no meio.
    // As duas partes aparecem juntas ou sozinhas, então a alternância tem de
    // tratar a forma composta primeiro.
    [/\s*\(?\s*nilo'?s line only\s*[,;]?\s*(?:no label)?\s*\)?\s*[.]?\s*$/i, ''],
    [/\s*\(?\s*no label\s*\)?\s*[.]?\s*$/i, ''],
]);

export function limparFrase(frase: string): { texto: string; mudou: boolean } {
    let t = frase;
    let mudou = false;
    for (const [re, por] of LIMPEZAS) {
        if (re.test(t)) { t = t.replace(re, por).trim(); mudou = true; }
    }
    return { texto: t.trim(), mudou };
}

/** Quebra em frases, do mesmo jeito que o resto do andar. */
export function enumerarEmIngles(texto: string): string[] {
    return (texto.match(/[^.!?…]+[.!?…]*/g) ?? [])
        .map((f) => f.trim())
        .filter((f) => f.length > 2)
        .slice(0, 4);
}

/**
 * Roda o pipeline. Devolve `null` em qualquer tropeço — e essa é a regra que
 * este andar inteiro segue: uma otimização que falha não pode custar a fala do
 * jogador. Quem chama cai no caminho normal (o 3B escrevendo em português).
 */
export async function falarPeloPipeline(
    perguntaEmIngles: string,
    pecas: PecasDoPipeline,
): Promise<SaidaDoPipeline | null> {
    const bruto = await pecas.rascunhar(perguntaEmIngles);
    if (!bruto || !bruto.trim()) return null;

    const cruas = enumerarEmIngles(bruto);
    if (cruas.length === 0) return null;

    const limpas = cruas.map(limparFrase);
    const limpezas = limpas.filter((l) => l.mudou).length;
    const frases = limpas.map((l) => l.texto).filter((f) => f.length > 2);
    if (frases.length === 0) return null;

    // O JUIZ vem antes da tradução de propósito: é em inglês que ele enxerga.
    // Se ele falhar, devolve lista vazia e o rascunho passa — não julgar custa
    // o que já custava; marcar por engano custa ~11,6 s de revisor.
    const marcadas = await pecas.julgar(frases);

    const finais = [...frases];
    let remendadas = 0;
    for (const n of marcadas) {
        const i = n - 1;
        if (i < 0 || i >= finais.length) continue;
        const nova = await pecas.remendar(perguntaEmIngles, finais[i]);
        if (!nova) continue;
        const { texto } = limparFrase(nova);
        // Um remendo que devolve a MESMA frase não é remendo — foi o que o
        // SmolLM3 fez em 2 de 3 ("(No correction needed)"). Contar como troca
        // inflaria o placar e esconderia que o revisor não serve.
        if (texto && texto !== finais[i]) { finais[i] = texto; remendadas += 1; }
    }

    const pt = await pecas.traduzir(finais.join(' '));
    if (!pt || !pt.trim()) return null;

    return {
        fala: abrasileirar(pt),
        marcadas: marcadas.length,
        remendadas,
        limpezas,
    };
}

/**
 * O pipeline está ligado?
 *
 * Fica atrás de `?pipeline` e DESLIGADO por padrão, pelo mesmo motivo que a
 * GPU: ele acrescenta ~950 MB de download (rascunhador + juiz + tradutor) e
 * três modos de falha novos, e nada disso foi medido no aparelho de quem joga.
 * Cinco técnicas já ganharam nesta bancada e perderam lá.
 */
export function pipelineLigado(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]pipeline\b/i.test(busca);
}
