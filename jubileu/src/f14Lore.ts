/**
 * f14Lore.ts — o que a ENTIDADE diz em Kessar-9.
 *
 * No andar 13 ela falou pela boca do pescador Halvard e foi cortada no meio de uma frase
 * ("…escolha a que não te"). Aqui, na cratera ao sul — o único lugar que o Proprietário não
 * olha —, ela termina a frase, explica por que fugia e por que trouxe o hóspede até ali.
 * Depois, no laboratório debaixo da cratera, conta quem é, por que não pode mostrar o rosto,
 * e pede ajuda para a mistura anti-simulação. No fim, o portal; e o pedido.
 *
 * Todo texto do final mora aqui: o resto do código só aponta para as listas.
 */
export interface Fala { quem: string; texto: string }

const ELA = 'A SOMBRA';

/** Na cratera, quando ela finalmente não foge. */
export const ENCONTRO: ReadonlyArray<Fala> = Object.freeze([
    { quem: ELA, texto: '…Você veio. Desculpa ter corrido. Não era de você que eu fugia.' },
    { quem: ELA, texto: 'Onde você olha, ELE olha. O Proprietário enxerga pelos seus olhos, hóspede — é assim que ele mede você.' },
    { quem: ELA, texto: 'Toda vez que você chegava perto, a atenção dele vinha junto. Eu tinha que sumir antes que ele me visse através de você.' },
    { quem: ELA, texto: 'Mas aqui é diferente. Kessar-9 é a borda da simulação: sem ar, sem gente, sem nada para medir. Ele quase não desenha este lugar.' },
    { quem: ELA, texto: 'E esta cratera é o ponto cego da borda. Por isso eu te puxei até aqui, rastro por rastro.' },
    { quem: ELA, texto: 'Lá em Vindhjem me cortaram no meio da frase. Eu ia dizer: quando te oferecerem uma escolha, escolha a que não te OBSERVA.' },
    { quem: ELA, texto: 'Você escolheu certo até agora. Então vem. Tem uma coisa embaixo da areia que eu guardo há muito tempo.' },
]);

/** Ao apertar o botão (uma linha só, durante a cutscene). */
export const BOTAO = 'Segura firme. O chão aqui é mais velho que o hotel.';

/** No laboratório: quem ela é. */
export const LAB_QUEM: ReadonlyArray<Fala> = Object.freeze([
    { quem: ELA, texto: 'Bem-vindo ao laboratório. Gente presa como você construiu isto, peça por peça, roubando pedaços dos andares.' },
    { quem: ELA, texto: 'Eu fui o primeiro hóspede. O Hóspede Zero. Entrei no hotel antes de existir saguão, antes de existir elevador.' },
    { quem: ELA, texto: 'Ele me mediu por tanto tempo que eu aprendi a ficar entre as medições. Virei sombra: uma coisa que ele não consegue fixar.' },
    { quem: ELA, texto: 'Por isso não posso te mostrar meu rosto. Ainda não.' },
    { quem: ELA, texto: 'Uma aparência é uma forma fixa. Se eu tiver uma forma, a simulação me desenha. Se ela me desenhar, ele me acha. E se ele me achar, me apaga.' },
    { quem: ELA, texto: 'Um dia, quando ninguém mais estiver preso, eu te mostro. Prometo.' },
]);

/** No laboratório: o pedido e a receita (o puzzle). */
export const LAB_RECEITA: ReadonlyArray<Fala> = Object.freeze([
    { quem: ELA, texto: 'Agora preciso das suas mãos. As minhas atravessam o vidro.' },
    { quem: ELA, texto: 'A simulação economiza: só calcula o que alguém observa. Esta mistura é feita de coisas que ela não sabe calcular juntas.' },
    { quem: ELA, texto: 'Três reagentes: Ferrugem Fria, Sal de Eco e Vidro Líquido. A tela mostra a assinatura que a gente precisa. Bata as três barras — nem mais, nem menos.' },
    { quem: ELA, texto: 'Se passar do ponto, a mistura fica instável: esvazia o béquer e recomeça. Quando as três barras baterem, aquece até a faixa violeta e agita.' },
]);

/** Respostas da bancada (curtas, aparecem como legenda). */
export const LAB_REACOES = Object.freeze({
    passou: 'Passou do ponto. Esvazia e recomeça — a simulação percebe mistura instável.',
    bateu: 'As três barras bateram. Agora o calor: até a faixa violeta.',
    quente: 'Quente demais! Ela vai calcular isso como fogo comum. Deixa esfriar um pouco.',
    pronto: 'Isso. Está na faixa. Agita.',
    agitado: 'Pronto. Está vendo como o vidro fica borrado em volta? Ela não consegue desenhar isso.',
});

/** A despedida, depois do portal. */
export const DESPEDIDA: ReadonlyArray<Fala> = Object.freeze([
    { quem: ELA, texto: 'Viu? Onde a mistura cai, o chão esquece onde está. É uma porta que ele não desenhou.' },
    { quem: ELA, texto: 'Ela te leva de volta ao elevador. Eu fico. Se eu atravessar, ele me vê.' },
    { quem: ELA, texto: 'Hóspede… você não é o único preso. Em cada andar tem gente que acha que é cenário. O pescador, a menina do botão, os do avião.' },
    { quem: ELA, texto: 'Se esforça. Tira todos eles daqui. Eu vou estar na sombra de cada andar, esperando.' },
]);
