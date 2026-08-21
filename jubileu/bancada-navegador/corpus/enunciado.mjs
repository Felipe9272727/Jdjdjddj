// ── O ENUNCIADO DO REVISOR TREINADO ──────────────────────────────────────
//
// Este é o prêmio do treino, e ele está escrito nesta função: SEM os três
// exemplos. Os exemplos existem para ensinar a tarefa na hora — um modelo que
// já viu a tarefa mil vezes no treino não precisa deles, e o enunciado cai de
// ~350 tokens para ~80. Como 89% do custo de um turno é LEITURA de prompt, é
// aí que o turno encolhe, não na geração.
//
// REGRA DURA: a string montada aqui tem que ser IDÊNTICA à que o jogo manda.
// Treinar com um formato e pedir com outro é o modo mais discreto de perder
// meio ponto por frase e nunca descobrir por quê. Quando o revisor treinado
// entrar no jogo, `floor10Pipeline.ts` importa daqui ou copia com um teste que
// compare as duas.
// A PERSONA CURTA, E POR QUE ELA ENCOLHEU. A persona do jogo tem ~200 tokens
// porque o rascunhador precisa dela inteira para INVENTAR fala. O revisor
// treinado não inventa: ele conserta, e o cânone que ele precisa saber já está
// nos 216 pares do treino. Medido no tokenizador do SmolLM2, a persona longa
// custava 199 tokens de prompt contra 20 de resposta — quase toda a conta do
// turno era ler algo que o treino já ensinou.
//
// O que sobra aqui é só o que a tarefa exige em toda frase: quem fala, onde
// está, e o tom. Se um defeito novo aparecer que o treino não cobre, ele volta
// a crescer — e aí a régua diz se valeu.
export const PERSONA = `You are Nilo Azevedo, a human guest trapped on the 10th floor of the hotel "The Normal Elevator": a grey room, four walls, a grate floor, the elevator door. You are dry, observant, and nobody's helper.`;

export const enunciado = (q, f, porque) =>
    `The player asked: "${String(q).trim()}"\n`
    + `Wrong line: "${String(f).trim()}"\n`
    + `It is wrong because ${String(porque).trim()}\n`
    + `Corrected line:`;
