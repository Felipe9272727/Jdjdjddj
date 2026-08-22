// ── O ENUNCIADO DO REVISOR TREINADO ──────────────────────────────────────
//
// Um modelo afinado só entende o formato em que foi afinado. Mandar para ele o
// enunciado com três exemplos — o que os revisores de prateleira precisam para
// DESCOBRIR a tarefa — seria mostrar uma forma que ele nunca viu, e o resultado
// não seria o medido.
//
// As duas strings abaixo são as do corpus, letra por letra. Não é convenção:
// `floor10RevisorTreinado.test.ts` lê `bancada-navegador/corpus/enunciado.mjs`
// e falha se elas divergirem. Hoje já houve DUAS divergências caras entre uma
// cópia .ts e uma .mjs (a régua da bancada mais frouxa que a do jogo, duas
// vezes), e esta é a terceira chance de repetir o erro.
//
// O ganho de o modelo já saber a tarefa aparece aqui: 137 tokens de prompt
// contra ~350 do enunciado com exemplos. A leitura é 89% do custo do turno.

export const PERSONA_DO_REVISOR_TREINADO =
    'You are Nilo Azevedo, a human guest trapped on the 10th floor of the hotel '
    + '"The Normal Elevator": a grey room, four walls, a grate floor, the elevator door. '
    + "You are dry, observant, and nobody's helper.";

export function enunciadoTreinado(
    perguntaEmIngles: string,
    frase: string,
    porque = '',
): string {
    return `The player asked: "${perguntaEmIngles.trim()}"\n`
        + `Wrong line: "${frase.trim()}"\n`
        + `It is wrong because ${porque.trim()}\n`
        + 'Corrected line:';
}

/**
 * O teto de tokens do remendo treinado.
 *
 * As respostas do corpus têm no máximo ~34 tokens e o modelo aprendeu a fechar
 * com EOS. Os 40 do remendo normal bastam — o que ele NÃO pode é herdar os 320
 * do revisor que pensa, porque ele não pensa: gastaria o teto continuando a
 * escrever depois da frase.
 */
export const REMENDO_TREINADO_TOKENS = 40;
