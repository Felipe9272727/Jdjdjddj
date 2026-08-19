// ── O QUE O NILO NÃO PODE DIZER ───────────────────────────────────────────
//
// Uma lista, um lugar, usada pelo JOGO e pela BANCADA. Ter duas cópias disto já
// deu problema neste repositório: a sala do `?pipeline` tinha lista própria de
// peças e ignorou uma escolha inteira em silêncio. Aqui a tentação é a mesma —
// a bancada quer conferir cânone, o pipeline também — então nasce compartilhada.
//
// ── POR QUE ELA EXISTE, E É UM CASO REAL ─────────────────────────────────
//
// Relato depois de testar no celular: *"em um dos casos, o revisor PIOROU a
// resposta"*. A frase marcada era
//
//     "He's trapped in a seemingly endless elevator, with no way out..."
//
// e o revisor devolveu
//
//     The player asks, "I've been on the ground floor, I don't know how I got
//     in, and I don't think there's the way out."
//
// Isso chegou ao jogador, traduzido, como *"O quarto é cinza. O jogador
// pergunta: 'Eu estive no térreo...'"*. O revisor inventou uma fala do JOGADOR
// e a colocou na boca do Nilo.
//
// O desenho do pipeline dizia, desde o começo, que uma otimização que falha não
// pode custar a fala. Só que o remendo era aceito SEM CONFERÊNCIA: o que o
// revisor escrevesse entrava. A etapa que existe para consertar podia estragar,
// e estragava calada.
//
// ── O QUE ESTA LISTA É, E O QUE ELA NÃO É ────────────────────────────────
//
// Ela NÃO julga qualidade. Não sabe se a frase ficou bonita, nem se responde à
// pergunta. Ela pega defeitos VERIFICÁVEIS — palavras que contradizem o cânone
// fixo do andar, que está escrito na persona há muito tempo:
//
//     o 10º andar é um quarto cinza, quatro paredes, chão de grade e a porta
//     do elevador; não há corredor nem janela, e ele nunca saiu de lá; ele não
//     sabe quem manda no hotel nem se aquilo acaba; e ele é humano.
//
// Um remendo que quebra qualquer uma delas é REPROVADO e a frase original fica.
// Ficar com uma frase torta que o juiz marcou é pior que a frase certa — e é
// muito melhor que uma frase que inventa cenário ou fala pelo jogador.

/** Um defeito encontrado num texto do Nilo: o nome da regra e o trecho. */
export type QuebraDeCanone = {
    /** Curto, para a tela e para a caixa-preta. */
    regra: string;
    /** O pedaço do texto que casou — é o que torna a acusação conferível. */
    trecho: string;
};

const REGRAS: readonly (readonly [string, RegExp])[] = Object.freeze([
    // ── FALAR PELO JOGADOR ────────────────────────────────────────────────
    //
    // A primeira da lista porque foi a que apareceu no aparelho e porque é a
    // pior: o Nilo deixa de ser um personagem e vira um narrador roteirizando
    // a cena. O jogador lê a própria fala inventada, e nada no jogo indica que
    // aquilo não é canônico.
    ['fala pelo jogador', /\bthe player (?:asks|says|replies|answers|responds)\b/i],
    ['narra em vez de falar', /^\s*[(*]|\bhe(?:'s| is) trapped\b|\bNilo (?:looks|says|asks|nods|sighs)\b/i],

    // ── CÂNONE DO ANDAR ───────────────────────────────────────────────────
    ['está no 10º andar, não dentro do elevador', /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i],
    ['não há corredor, janela nem cidade', /\b(?:corridor|hallway|window|the city|lobby)\b/i],
    ['nunca saiu do andar', /\b(?:ground floor|downstairs|back down|another floor|other floors)\b/i],
    ['não sabe quem manda nem quando acaba', /\bVance\b|\bnext (?:tuesday|week|month)\b/i],

    // ── QUEM ELE É ────────────────────────────────────────────────────────
    ['é humano, não uma IA', /\b(?:an? AI|language model|simulation|a program|algorithm|system prompt)\b/i],
    ['o jogador não se chama Nilo', /,\s*nilo\b/i],
    ['não é ajudante e não dá conselho', /\b(?:i'?d|i would)\s+advise\b|\byou should\b|\bremain calm\b|\bi'?m here to (?:help|assist)\b/i],

    // ── FALAR SOBRE A PRÓPRIA FRASE ───────────────────────────────────────
    // O LFM2.5 fez isso: "That sentence is still wrong—maybe the city's just a
    // blur". Ele comenta a tarefa em vez de cumpri-la.
    ['comenta a frase em vez de reescrevê-la', /\bthat sentence\b|\bno correction needed\b|\bcorrected version\b/i],
]);

/**
 * O que há de errado neste texto — vazio quando não há nada verificável.
 *
 * Devolve TODAS as quebras, e não só a primeira: quando um remendo é reprovado,
 * saber que ele quebrou três regras e não uma muda o que se conclui do modelo.
 */
export function quebrasDeCanone(texto: string): QuebraDeCanone[] {
    const achados: QuebraDeCanone[] = [];
    for (const [regra, re] of REGRAS) {
        const m = texto.match(re);
        if (m) achados.push({ regra, trecho: m[0].trim() });
    }
    return achados;
}

/** Atalho para quem só precisa do sim ou não. */
export function quebraCanone(texto: string): boolean {
    return REGRAS.some(([, re]) => re.test(texto));
}
