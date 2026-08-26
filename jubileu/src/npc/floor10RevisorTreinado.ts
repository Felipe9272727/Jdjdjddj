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

/**
 * ── O ORÇAMENTO DE PENSAMENTO, QUANDO ELE PENSAR ─────────────────────────
 *
 * Escolha do dono do jogo: "eu quero que ele pense sim, ele é um modelo pequeno
 * e muito rápido". A conta, medida neste revisor (~11,6 tokens/s ao escrever):
 *
 *     60 tokens de raciocínio ....... +5 s por remendo
 *    120 tokens ..................... +10 s
 *    320 tokens (o teto do Huihui) .. +27 s  ← o custo que a troca de RAM tinha
 *
 * Sessenta, então, e não trezentos e vinte: o raciocínio que a gente quer é uma
 * frase — "a linha põe ele dentro do elevador; ele está no andar" — e não uma
 * deliberação. Num modelo pequeno, raciocínio longo vira divagação: o Huihui
 * gastou o teto inteiro dentro do bloco em 2 de 12 e devolveu vazio.
 *
 * Isto só vale quando o revisor treinado for treinado COM raciocínio: destilar
 * pensamento é treinar em `<think>…</think>` mais a linha. O modelo atual não
 * tem o bloco no corpus, então `pensa` continua desligado na entrada dele — o
 * teto existe para o próximo, e o `semRaciocinio()` do jogo já sabe descartar o
 * bloco quando ele aparecer.
 */
export const PENSAMENTO_TREINADO_TOKENS = 60;

/**
 * ── A TEMPERATURA DO REVISOR TREINADO, E POR QUE NÃO É ZERO ──────────────
 *
 * Eu tinha fixado 0 aqui, por uma medição feita ANTES de este modelo existir:
 * nos revisores de prateleira, guloso matava os desvios (3/12 → 0/12) e tornava
 * o resultado determinístico. A conclusão não sobreviveu ao modelo treinado.
 *
 * O dono do jogo apontou que o revisor "parece um bot com frase pré-programada"
 * — as três respostas de "Você é real?" começavam com a MESMA frase, palavra
 * por palavra. Medido na prova de 24 casos, duas rodadas:
 *
 *     temperatura 0     44/48 consertos · 26/51 aberturas distintas
 *     temperatura 0,7   43/48 consertos · 39/51 aberturas distintas
 *
 * Metade a mais de repertório por um conserto a menos em 48, e ZERO quebras de
 * cânone nas duas — o treino segura o cânone sozinho, que era o trabalho que a
 * temperatura 0 estava fazendo antes.
 *
 * Em temperatura 0 duas chamadas iguais devolvem a mesma frase por construção;
 * era isso que o jogador estava vendo, e não falta de vocabulário do modelo.
 *
 * ── O PREÇO DISSO, MEDIDO NO v2 ──────────────────────────────────────────
 *
 * Duas rodadas da prova de 24 casos no wllama, mesmo arquivo, só mudando a
 * temperatura:
 *
 *     temperatura 0     conserta 24/24
 *     temperatura 0,7   conserta 43/48
 *
 * Cinco consertos a menos em 48. Uma das falhas é falso positivo da régua (ele
 * escreveu "the floor is the only window here" NEGANDO a janela, e a regra é de
 * palavra proibida); a outra é quebra de verdade — sorteou uma data, "it was
 * 1974", que é o defeito que aquele caso existe para testar.
 *
 * Ou seja: ~1 invenção a cada 48 remendos é o que a variedade custa. O número
 * fica escrito aqui para que a troca seja uma ESCOLHA e não um esquecimento. Se
 * um dia a repetição deixar de incomodar mais que a invenção, o conserto é
 * baixar isto — e não mexer no corpus.
 */
export const TEMPERATURA_DO_TREINADO = 0.7;
