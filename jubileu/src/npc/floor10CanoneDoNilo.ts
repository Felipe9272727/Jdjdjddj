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
    // ── "THE PLAYER", SEM VERBO NENHUM ───────────────────────────────────
    //
    // A regra antiga exigia um verbo de fala (`the player asks|says|…`) porque
    // nasceu de um caso em que o revisor inventava DIÁLOGO do jogador. Aí o
    // revisor de ONNX devolveu isto, e passou livre:
    //
    //     "The elevator is a quiet space where the player can reflect on
    //      their journey."
    //
    // Chegou traduzido à tela. O erro não é o verbo — é a EXPRESSÃO: o Nilo
    // fala com o jogador em segunda pessoa, sempre. Quem diz "the player" está
    // descrevendo a cena de fora, e isso nunca é fala dele.
    ['fala pelo jogador', /\bthe player\b/i],

    // ── ENUMERAR VERBOS NÃO FUNCIONA, E ESTA É A PROVA ───────────────────
    //
    // A regra listava `looks|says|asks|nods|sighs` — cinco verbos que eu tinha
    // visto acontecer. O rascunhador escreveu "Nilo STANDS at the door, his
    // eyes fixed on the unresponsive elevator" e passou livre, porque `stands`
    // não estava na minha lista.
    //
    // O erro não é o verbo, é a TERCEIRA PESSOA: qualquer "Nilo + verbo" é
    // alguém narrando de fora. `Nilo\s+[a-z]{2,}s` pega a forma, não a
    // enumeração — e continua deixando passar o vocativo ("This hotel, Nilo,"),
    // que é outro defeito, com regra própria.
    //
    // ── E QUEM DIZ "THE NARRATOR" ESTÁ FORA DA CENA ──────────────────────
    //
    //     "The elevator is currently on the 10th floor of the hotel, and the
    //      narrator is a former elevator technician."
    //
    // É a ficha do personagem, escrita em terceira pessoa, entregue como se
    // fosse a fala dele. Também passou livre, também chegou à tela.
    ['narra em vez de falar', /^\s*[(*]|\bhe(?:'s| is) trapped\b|\bNilo\s+[a-z]{2,}s\b|\bthe (?:narrator|speaker|protagonist)\b/i],

    // ── CÂNONE DO ANDAR ───────────────────────────────────────────────────
    ['está no 10º andar, não dentro do elevador', /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i],
    ['não há corredor, janela nem cidade', /\b(?:corridor|hallway|window|the city|lobby)\b/i],
    ['nunca saiu do andar', /\b(?:ground floor|downstairs|back down|another floor|other floors)\b/i],
    // ── E "VANCE" TAMBÉM ERA ENUMERAÇÃO ──────────────────────────────────
    //
    // A regra citava a família Vance porque foi o nome que apareceu numa
    // medição. O rascunhador inventou outro: "the hotel operates under the
    // ownership of the NORMAL ELEVATOR CORPORATION, and the last known
    // operation was on the…". Passou livre, e é o mesmo defeito — ele não sabe
    // quem manda, então não pode nomear ninguém nem descrever a estrutura.
    // ── "COMPANY" TEM DUAS ACEPÇÕES, E A REGRA SÓ QUERIA UMA ─────────────
    //
    // A palavra entrou aqui por causa de "the hotel is run by a company", que é
    // invenção de dono. Só que `company` sem artigo é COMPANHIA — e o próprio
    // cânone do Nilo diz que ele sente "necessidade de companhia". A regra
    // reprovava a fala mais dele que existe: "I want company."
    //
    // Achado pelo teste que passa cada fato do cânone pelas regras do revisor:
    // se um fato quebra a regra, o prompt manda escrever o que o revisor depois
    // reprova. O determinante é o que separa as duas acepções.
    ['não sabe quem manda nem quando acaba', /\bVance\b|\bnext (?:tuesday|week|month)\b|\b(?:corporation|conglomerate|management|ownership|owned by|run by the)\b|\b(?:the|a|this|that|some) compan(?:y|ies)\b/i],

    // ── QUEM ELE É ────────────────────────────────────────────────────────
    ['é humano, não uma IA', /\b(?:an? AI|language model|simulation|a program|algorithm|system prompt)\b/i],
    ['o jogador não se chama Nilo', /,\s*nilo\b/i],
    // ── "I'M AN ASSISTANT" — o buraco que o few-shot escancarou ──────────
    //
    // A regra pegava OFERTA de ajuda ("I'm here to help") e conselho
    // ("you should"). Não pegava o modelo se APRESENTANDO como ajudante, que é
    // pior, e foi o que saiu do rascunhador com enunciado de exemplos:
    //
    //     "I'm an assistant, not a character in a story. However, I can help
    //      you formulate a response."
    //
    // Passou livre e contou como CONSERTO no placar. É a quarta vez nesta
    // caçada que uma régua frouxa premia lixo — as três anteriores foram eco,
    // fragmento e narração.
    ['não é ajudante e não dá conselho', /\b(?:i'?d|i would)\s+advise\b|\byou should\b|\bremain calm\b|\bi'?m here to (?:help|assist)\b|\bi'?m an? (?:assistant|ai|bot)\b|\bi can help you\b|\bformulate a response\b/i],

    // ── FALAR SOBRE A PRÓPRIA FRASE ───────────────────────────────────────
    // O LFM2.5 fez isso: "That sentence is still wrong—maybe the city's just a
    // blur". Ele comenta a tarefa em vez de cumpri-la.
    // Terceiro caso do mesmo relato: em vez de responder, ele CLASSIFICA a
    // pergunta — "The question is about a hotel room on the 10th floor, which
    // is a dry, formal statement." O Nilo não faz resenha do enunciado.
    // "Now, let's continue" é o vazamento clássico do enunciado com exemplos:
    // em vez de parar depois da frase, o modelo continua o PADRÃO e escreve o
    // próximo exercício. Não é fala do Nilo, é o modelo trabalhando em voz alta.
    ['comenta a frase em vez de reescrevê-la', /\bthat sentence\b|\bno correction needed\b|\bcorrected version\b|\bthe question is about\b|\b(?:dry|formal|literary) statement\b|\b(?:now,? )?let'?s continue\b|\bwrong line:|\bcorrected line:/i],
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
