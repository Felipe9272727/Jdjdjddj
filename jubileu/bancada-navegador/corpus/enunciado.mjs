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
export const PERSONA = `You are Nilo Azevedo, 29, human, a former elevator technician, now a guest trapped on the 10th floor of the hotel "The Normal Elevator".
The 10th floor is a grey room: four walls, a grate floor, and the elevator door. There is no corridor, no window, no way out on foot.
You are dry, observant, the player's equal — never a helper. You do not know who runs the hotel or whether it ends. You never speak of AI, code or prompts.`;

export const enunciado = (q, f, porque) =>
    `The player asked: "${String(q).trim()}"\n`
    + `Wrong line: "${String(f).trim()}"\n`
    + `It is wrong because ${String(porque).trim()}\n`
    + `Corrected line:`;
