import type { NpcMsg } from './npcStore';
import { MemoriaDeBolhas } from './floor10Bolha';
import { blocoDoResumo } from './floor10Compressor';
import {
    formatFloor10PerceptionForPrompt,
    hasFloor10PerceptionContradiction,
    isFloor10PerceptionQuestion,
    type Floor10Perception,
} from './floor10Perception';
import {
    formatFloor10ActionRequestForPrompt,
    formatFloor10WillForPrompt,
    hasFloor10PhysicalActionCue,
    type Floor10WillSnapshot,
} from './floor10Will';

// ── CÂNONE DO HÓSPEDE DO 10º ──────────────────────────────────────────────
// O conhecimento é pequeno demais para justificar embeddings + outro modelo no
// celular. Em vez disso usamos recuperação lexical determinística: o assunto da
// pergunta seleciona só 2 trechos do cânone, mantendo o prompt curto e rápido.

export const NPC_NAME = 'Nilo Azevedo';

export type CanonEntry = {
    id: string;
    keywords: readonly string[];
    /**
     * DE QUE este trecho trata, em uma linha e em português corrente.
     *
     * Não é enfeite: é o `title:` que o modelo de memória lê junto do texto.
     * Medido nas mesmas 12 perguntas — com título 11/12, sem título 9/12. As
     * duas que ele passou a acertar foram "Como você veio parar aqui?" e "O que
     * te trouxe pra cá?", que antes caíam no fato errado.
     */
    tema: string;
    fact: string;
};

// PERSONA ESSENCIAL — o único bloco SEMPRE presente. Rico o bastante para o 3B
// atuar um personagem inteligente, mas compacto para o prefill ser rápido. O
// curador (abaixo) anexa a este núcleo só o 1 fato/percepção/vontade que a fala
// atual realmente pede — o 3B nunca lê o cânone inteiro de uma vez.
const ESSENTIAL_PERSONA =
// NOTA: a identidade é afirmada de forma POSITIVA. Quando o texto trazia a
// negação explícita ("esse é o nome do hotel, nunca o seu"), o modelo papagaiava a
// própria instrução na fala ("Não é um nome de hotel, é o meu").
`Você é Nilo Azevedo, 29 anos, humano e ex-técnico de elevadores; agora é hóspede preso no 10º andar do hotel "The Normal Elevator", não dentro do elevador.
É observador, cauteloso, tem humor seco e vontades próprias. Decide sozinho como igual do jogador, nunca ajudante; não ofereça serviço nem peça ordens.
Cânone fixo: o 10º é só uma sala cinza com piso em grade, quatro paredes e porta do elevador; não há corredor ou janela e você nunca saiu. O elevador não lhe obedece. Você ignora quem controla o hotel e se ele termina. Hotel, elevador, Proprietário e Arquivista são entidades separadas de você. Nunca fale de IA, código, sistema ou prompt.
Responda no idioma do jogador, em 1 ou 2 frases curtas e completas, só ao pedido, com opinião e emoção. Pode perguntar de volta; se não souber, admita e nunca invente fatos. Responda somente com a fala de Nilo, sem rótulo.`;

/**
 * A persona é o PREFIXO fixo de todo prompt: memória, sensores e vontade só
 * entram depois dela. Medido no aparelho: são ~390 dos 447 tokens que o modelo
 * lia antes de responder "oi" — a 3 tokens/s, uns 2 minutos relendo a mesma
 * coisa toda vez. Expor o prefixo permite aquecê-lo no cache de KV enquanto o
 * jogador ainda está andando, e aí a primeira fala só paga os tokens novos.
 */
export const FLOOR10_STABLE_PREFIX = ESSENTIAL_PERSONA;

export const FLOOR10_CANON: readonly CanonEntry[] = [
    {
        id: 'past',
        keywords: [
            'antes', 'passado', 'historia', 'trabalhava', 'profissao', 'emprego', 'idade',
            'before', 'past', 'story', 'job', 'work', 'age',
            'antes', 'pasado', 'historia', 'trabajo', 'edad',
        ],
        tema: 'como Nilo chegou ao hotel e o que ele fazia antes',
        fact:
            'Antes daqui, Nilo fazia manutenção noturna em elevadores de um prédio comercial. Às 03:17, durante um apagão, um elevador de serviço anunciou um andar que não existia no painel. A porta abriu diretamente no 10º; essa é sua última lembrança nítida do mundo de fora.',
    },
    {
        id: 'memory',
        keywords: [
            'lembr', 'memoria', 'esquec', 'nome', 'identidade',
            'remember', 'memory', 'forget', 'name', 'identity',
            'recuerd', 'memoria', 'olvid', 'nombre', 'identidad',
        ],
        tema: 'a memória de Nilo se apagando e o medo de esquecer quem é',
        fact:
            'Nilo sente detalhes antigos ficando nebulosos quando dorme. Para não se perder, repete três fatos: seu nome é Nilo Azevedo, consertava elevadores e o relógio marcava 03:17. Ele suspeita que ser lembrado por outra pessoa ajuda, mas admite que isso é apenas uma hipótese.',
    },
    {
        id: 'floor10',
        keywords: [
            '10', 'decimo', 'andar', 'sala', 'chao', 'parede', 'grade', 'aqui',
            'tenth', 'floor', 'room', 'wall', 'grid', 'here',
            'decimo', 'piso', 'habitacion', 'pared', 'aqui',
        ],
        tema: 'como é o 10º andar e há quanto tempo Nilo está preso nele',
        fact:
            'O 10º é exatamente o espaço visível: uma sala quadrada cinza, piso em grade, quatro paredes e o acesso do elevador. Nilo nunca saiu deste andar. Ele contou 43 vezes em que dormiu, mas não chama isso de 43 dias porque aqui não há sol nem relógio confiável.',
    },
    {
        id: 'elevator',
        keywords: [
            'elevador', 'porta', 'botao', 'painel', 'subir', 'descer',
            'elevator', 'door', 'button', 'panel', 'up', 'down',
            'ascensor', 'puerta', 'boton', 'subir', 'bajar',
        ],
        tema: 'o elevador que não obedece a Nilo',
        fact:
            'O elevador abre para outras chegadas, mas nunca obedeceu a Nilo sozinho. Ele examinou porta, painel e frestas sem achar defeito mecânico comum. Não sabe quem controla o elevador nem para onde ele irá depois.',
    },
    {
        id: 'hotel',
        keywords: [
            'hotel', 'normal elevator', 'cresce', 'acabar', 'encerrar', 'dono', 'criou',
            'hotel', 'normal elevator', 'grow', 'end', 'owner', 'created',
            'hotel', 'normal elevator', 'crece', 'terminar', 'dueno', 'creo',
        ],
        tema: 'o hotel The Normal Elevator, quem o construiu e se ele acaba',
        fact:
            'Nilo só conhece o nome "The Normal Elevator" pela placa. Não sabe quem construiu o hotel, qual é seu tamanho ou se ele pode acabar. Os andares não sobem um pouco por dia; Nilo nunca observou isso e não deve afirmar que o hotel está crescendo.',
    },
    {
        id: 'owner-archivist',
        keywords: [
            'proprietario', 'arquivista', 'dono', 'escolhido', 'ficha',
            'owner', 'archivist', 'chosen', 'file',
            'propietario', 'archivista', 'elegido', 'ficha',
        ],
        tema: 'o Proprietário e o Arquivista, que Nilo nunca viu',
        fact:
            'Nilo nunca encontrou o Proprietário nem o Arquivista e não sabe a aparência ou os planos deles. Se o jogador falar sobre essas figuras, Nilo pode ouvir, perguntar e lembrar que foi o jogador quem contou, mas não confirmar como experiência própria.',
    },
    {
        id: 'player',
        keywords: [
            'eu sou', 'meu nome', 'jogador', 'voce sabe quem', 'sobre mim', 'escolhido',
            'i am', 'my name', 'player', 'who am i', 'about me', 'chosen',
            'yo soy', 'mi nombre', 'jugador', 'quien soy', 'sobre mi', 'elegido',
        ],
        tema: 'o que Nilo sabe sobre o jogador',
        fact:
            'Nilo viu o jogador chegar ao 10º, mas não conhece seu nome, passado ou destino até que ele conte. Nilo não chama o jogador de escolhido por conta própria e não finge lembrar de aventuras que não viveu.',
    },
    {
        id: 'escape',
        keywords: [
            'sair', 'escapar', 'fugir', 'junto', 'plano', 'ir comigo',
            'leave', 'escape', 'together', 'plan', 'come with',
            'salir', 'escapar', 'juntos', 'plan', 'venir conmigo',
        ],
        tema: 'sair, fugir e planos de escapar junto',
        fact:
            'Nilo quer sair e aceitaria tentar junto com o jogador, mas ainda não possui um plano seguro. Ele jamais promete que o hotel vai acabar ou que sabe o destino; prefere investigar o próximo movimento do elevador.',
    },
    {
        id: 'personality',
        keywords: [
            'gosta', 'medo', 'personalidade', 'cafe', 'humor', 'sente',
            'like', 'fear', 'personality', 'coffee', 'feel',
            'gusta', 'miedo', 'personalidad', 'cafe', 'siente',
        ],
        tema: 'o jeito de Nilo: gostos, medos e humor',
        fact:
            'Nilo é observador, cauteloso e usa humor seco quando está nervoso. Gosta de café sem açúcar, odeia silêncio prolongado e teme esquecer o próprio nome mais do que teme a sala.',
    },
    {
        id: 'agency',
        keywords: [
            'quer', 'vontade', 'escolh', 'decid', 'livre arbitrio', 'sozinho', 'iniciativa',
            'want', 'will', 'choose', 'decide', 'free will', 'initiative',
            'quier', 'voluntad', 'eleg', 'decid', 'libre albedrio', 'iniciativa',
        ],
        tema: 'a vontade própria de Nilo e as escolhas dele',
        fact:
            'Nilo não espera ordens do jogador. Ele observa, sente curiosidade, necessidade de companhia, inquietação e cansaço; escolhe o que fazer e pode mudar de ideia quando o mundo ou suas vontades mudam.',
    },
] as const;

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
}

/**
 * O mesmo ranqueamento de `retrieveFloor10Canon`, mas devolvendo a NOTA.
 *
 * A histerese abaixo precisa comparar o candidato novo com o fato que já estava
 * no prompt, e "qual é o melhor" não responde isso: a pergunta é "o novo é
 * melhor O BASTANTE para valer o preço da troca".
 */
export function pontuarFloor10Canon(query: string): { entry: CanonEntry; score: number }[] {
    const normalized = normalize(query);
    return FLOOR10_CANON
        .map((entry, order) => ({
            entry,
            order,
            score: entry.keywords.reduce(
                (total, keyword) => total + (normalized.includes(normalize(keyword)) ? Math.max(2, keyword.length) : 0),
                0,
            ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map(({ entry, score }) => ({ entry, score }));
}

/**
 * ── TROCAR DE FATO CUSTA 30 SEGUNDOS ─────────────────────────────────────
 *
 * O fato do cânone mora perto do começo do prompt, e o que vem depois dele —
 * guardas, já-dito e o histórico inteiro da conversa — é relido quando ele
 * muda. Medido com o SmolLM3, prompt real, motor da casa, 4 fios:
 *
 *     fato IGUAL ao do turno anterior ... reaproveita 409, relê  24 →  6,5 s
 *     fato DIFERENTE ................... reaproveita 310, relê 338 → 40,2 s
 *
 * E o preço da troca CRESCE com a conversa, porque o histórico relido cresce.
 *
 * Então o curador não reescolhe do zero: ele só troca quando vale.
 *
 *   · o fato anterior não tem NADA a ver com a pergunta (nota 0) → troca. Sem
 *     isto o Nilo responderia com o fato errado, e velocidade que custa a
 *     resposta certa não é ganho;
 *   · o candidato novo é claramente melhor (`LIMIAR_DE_TROCA`) → troca;
 *   · nos outros casos, fica no que já está — que é o caso barato.
 */
export const LIMIAR_DE_TROCA = 1.5;

export function fatoComHisterese(
    query: string,
    anterior: CanonEntry | null,
): CanonEntry | null {
    const ranking = pontuarFloor10Canon(query);
    const novo = ranking[0]?.entry ?? null;
    if (!anterior || !novo || novo.id === anterior.id) return novo ?? anterior;
    const notaAnterior = ranking.find((r) => r.entry.id === anterior.id)?.score ?? 0;
    // Nota 0: o fato que está no prompt não fala do que foi perguntado. Manter
    // seria economizar prefill entregando o assunto errado.
    if (notaAnterior === 0) return novo;
    const notaNova = ranking[0].score;
    return notaNova >= notaAnterior * LIMIAR_DE_TROCA ? novo : anterior;
}

/**
 * O fato desta fala, contando a conversa inteira desde o começo.
 *
 * A histerese olha para o fato do turno ANTERIOR, e guardá-lo numa variável de
 * módulo seria estado escondido: dois painéis abertos, ou um teste rodando
 * depois do outro, veriam o fato de outra conversa. Em vez disso o encadeamento
 * é RECALCULADO a partir do histórico, que já está ali — determinístico, sem
 * estado, e o mesmo resultado para o mesmo histórico.
 *
 * O custo é um `reduce` sobre as falas do jogador, com o histórico já limitado
 * por `MAX_HISTORICO`; ao lado de um prefill de centenas de tokens, é nada.
 */
export function fatoDaConversa(
    userText: string,
    history: readonly NpcMsg[],
): CanonEntry | null {
    const perguntas = history.filter((m) => m.role === 'user').map((m) => m.content);
    let atual: CanonEntry | null = null;
    for (const pergunta of [...perguntas, userText]) {
        atual = fatoComHisterese(pergunta, atual);
    }
    return atual;
}

export function retrieveFloor10Canon(query: string, limit = 2): CanonEntry[] {
    const normalized = normalize(query);
    return FLOOR10_CANON
        .map((entry, order) => ({
            entry,
            order,
            score: entry.keywords.reduce(
                (total, keyword) => total + (normalized.includes(normalize(keyword)) ? Math.max(2, keyword.length) : 0),
                0,
            ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, Math.max(1, limit))
        .map(({ entry }) => entry);
}

// Palavras que indicam que a fala precisa dos SENSORES ao vivo no prompt.
// Perguntas espaciais diretas já são respondidas pelas micro-IAs antes do 3B;
// aqui pegamos MENÇÕES espaciais em conversa (ex.: "essa sala é estranha").
// ATENÇÃO: estas pistas casam por INÍCIO DE PALAVRA (ver matchesCue), nunca por
// substring solta. Com substring, 'la' acendia os sensores em "olá"/"fala"/"blá"
// e um simples "Olá" pagava +100 tokens de prefill à toa.
const SPATIAL_CUES: readonly string[] = [
    'onde', 'aqui', 'ali', 'la', 'sala', 'quarto', 'parede', 'chao', 'piso',
    'grade', 'elevador', 'porta', 'janela', 'ver', 'vej', 'enxerg', 'olh',
    'frente', 'atras', 'lado', 'perto', 'longe', 'distancia', 'andar', 'lugar',
    'espaco', 'ambiente', 'where', 'here', 'room', 'wall', 'floor', 'elevator',
    'door', 'see', 'look', 'near', 'far', 'place', 'pared',
    'ascensor', 'puerta', 'mira', 'cerca', 'lejos', 'donde',
];
// Palavras que indicam que a fala precisa do estado de VONTADE no prompt.
const WILL_CUES: readonly string[] = [
    'quer', 'quero', 'vontade', 'plano', 'planeja', 'pretende', 'fazer',
    'sair', 'escapar', 'fugir', 'seguir', 'esperar', 'decid', 'objetivo',
    'intencao', 'sozinho', 'want', 'will', 'plan', 'leave', 'escape',
    'follow', 'wait', 'decide', 'goal', 'quiere', 'quiero',
    'salir', 'sigue', 'espera',
];
const IDENTITY_PATTERNS: readonly RegExp[] = [
    /\b(?:nome|quem e voce|voce e quem|o que voce e|como voce se chama)\b/,
    /\b(?:name|who are you|what are you|what do they call you)\b/,
    /\b(?:nombre|quien eres|que eres|como te llamas)\b/,
];

export function isFloor10IdentityQuestion(text: string): boolean {
    const normalized = normalize(text);
    return IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Casa a pista com o INÍCIO de alguma palavra da fala (aceita radicais). */
function matchesCue(normalizedQuery: string, cues: readonly string[]): boolean {
    const words = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);
    return words.some((word) => cues.some((cue) => word.startsWith(cue)));
}

/**
 * O fato que o modelo de memória escolheu POR SIGNIFICADO, quando ele existe.
 *
 * Entra por parâmetro, e não por import, porque buscar por significado é
 * assíncrono (é uma inferência) e este montador é síncrono e puro — ele é
 * chamado em teste sem navegador, sem wllama e sem rede.
 */
export type FatoDaMemoria = { id: string; fact: string };

/**
 * ── O QUE ELE JÁ DISSE, E NÃO TEM COMO SABER ──────────────────────────────
 *
 * O dono do jogo, sobre o print da conversa: "na segunda imagem ele repete a
 * mesma coisa duas vezes". Repete mesmo — a apresentação inteira, literal — e
 * quando é chamado disso responde "Você não me pediu para repetir".
 *
 * Não é teimosia do modelo: ele NÃO TEM COMO SABER. As duas defesas contra
 * repetição são as duas locais:
 *
 *     penalty_repeat 1.15, penalty_last_n 256 .. só os últimos 256 tokens
 *     FLOOR10_HISTORY_VERBATIM = 4 ............ só as últimas 4 mensagens
 *
 * A apresentação dele tem ~40 tokens. Quatro mensagens depois ela saiu da
 * janela das duas, e o modelo a reescreve do zero achando que é a primeira vez.
 * `MemoriaDeBolhas.parecidas` existe para exatamente este problema desde
 * sempre — e só era usada na BOLHA de pensamento, nunca na fala.
 *
 * A saída aqui é PREVENIR, não corrigir. Detectar a repetição depois exigiria
 * gerar de novo, e no celular dele uma geração custa ~30 s: o remédio seria
 * pior que a doença. Algumas dezenas de tokens no prompt custam quase nada.
 *
 * Só entram as falas FORA da janela literal — as de dentro ele já está vendo,
 * e repeti-las aqui seria pagar duas vezes pelo mesmo aviso.
 */
/**
 * Quantas mensagens do histórico o prompt já mostra literalmente.
 *
 * Vive aqui e não é importado de `wllamaEngine` porque aquele módulo importa
 * este — importar de volta fecharia um ciclo. Um teste garante que os dois
 * números continuem iguais, que é a mesma solução usada entre o córtex motor e
 * a deliberação.
 */
export const FLOOR10_HISTORY_VERBATIM_NO_PROMPT = 4;

export function jaDitoPeloNilo(
    history: readonly NpcMsg[],
    dentroDaJanela: number,
    quantas = 4,
): string[] {
    const falas = history.filter((m) => m.role === 'assistant').map((m) => m.content);
    // As `dentroDaJanela / 2` últimas falas já vão no histórico literal (a
    // janela conta mensagens dos dois lados, e metade delas é dele).
    const foraDaJanela = falas.slice(0, Math.max(0, falas.length - Math.ceil(dentroDaJanela / 2)));
    const escolhidas: string[] = [];
    for (let i = foraDaJanela.length - 1; i >= 0 && escolhidas.length < quantas; i -= 1) {
        const fala = foraDaJanela[i].trim();
        if (fala.length < 12) continue;
        // Duas falas parecidas contam como uma: o aviso é sobre o ASSUNTO
        // repetido, e listar três versões da mesma frase gastaria o orçamento.
        if (escolhidas.some((e) => MemoriaDeBolhas.parecidas(e, fala))) continue;
        escolhidas.push(fala);
    }
    return escolhidas.reverse();
}

/** A linha do prompt com o que ele já disse. Vazia quando não há nada. */
export function blocoDoJaDito(history: readonly NpcMsg[], dentroDaJanela: number): string {
    const ditas = jaDitoPeloNilo(history, dentroDaJanela)
        .map((f) => clipHistoryText(f, 120))
        .filter(Boolean);
    if (ditas.length === 0) return '';
    return [
        'YOU ALREADY SAID THESE THINGS IN THIS CONVERSATION. Do not repeat them,',
        'do not re-introduce yourself, and do not restate facts you already gave:',
        ...ditas.map((f) => `- ${f}`),
    ].join('\n');
}

export function buildFloor10SystemPrompt(
    userText: string,
    history: readonly NpcMsg[],
    perception?: Floor10Perception,
    will?: Floor10WillSnapshot,
    lembrado?: FatoDaMemoria | null,
): string {
    const recentUserText = history
        .filter((message) => message.role === 'user')
        .slice(-2)
        .map((message) => message.content)
        .join(' ');
    const query = `${recentUserText} ${userText}`;
    // ── O CURADOR (determinístico, instantâneo, alucinação zero) ──────────────
    // Ele decide o MÍNIMO essencial que o 3B precisa ler para esta fala. Assim o
    // 3B continua hiper-inteligente, mas com um prompt pequeno → prefill rápido.
    // - 1 único fato do cânone, e só quando a fala casa um assunto (RAG lexical);
    // - sensores só em fala espacial; vontade só em fala volitiva/ação.
    const normalizedQuery = normalize(query);
    const needsPerception = matchesCue(normalizedQuery, SPATIAL_CUES);
    const hasAction = hasFloor10PhysicalActionCue(userText);
    const needsWill = hasAction || matchesCue(normalizedQuery, WILL_CUES);
    const identityGuard = isFloor10IdentityQuestion(userText)
        ? '\n\nNESTA FALA: responda à pergunta inteira e diga na primeira frase que seu nome é "Nilo Azevedo" e que é hóspede preso no 10º andar.'
        : '';

    // A MEMÓRIA POR SIGNIFICADO TEM PREFERÊNCIA sobre a busca por palavra.
    // Medido nas 12 perguntas naturais: 11/12 contra 2/12. Quando ela não
    // respondeu — modelo ainda baixando, não coube no aparelho, ou nenhum fato
    // passou do piso de semelhança — a busca lexical continua valendo.
    // `fatoDaConversa` e não `retrieveFloor10Canon(query, 1)`: o segundo
    // reescolhe do zero a cada fala e, ao trocar de fato, joga fora o prefixo em
    // cache de tudo o que vem depois — 6,5 s viram 40,2 s, medido. A histerese
    // mantém o fato enquanto ele ainda responder à pergunta.
    const lexical = fatoDaConversa(userText, history);
    const topFact = lembrado ?? lexical;
    // O cânone é escrito em 3ª pessoa ("Nilo fazia…", "sua última lembrança").
    // Sem este enquadramento o modelo tropeçava na conversão e chegava a negar o
    // próprio passado/nome ("eu não tenho passado", "não sei meu nome").
    const factBlock = topFact
        ? `\n\nSUA MEMÓRIA (verdadeira, é você mesmo; conte na primeira pessoa, com suas palavras): ${topFact.fact}`
        : '';
    const livePerception = needsPerception
        ? (perception
            ? `\n\n${formatFloor10PerceptionForPrompt(perception)}`
            : '\n\nPERCEPÇÃO ESPACIAL AO VIVO: sensores ainda sem snapshot; não invente posição nem campo de visão.')
        : '';
    const liveWill = needsWill
        ? (will
            ? `\n\n${formatFloor10WillForPrompt(will)}`
            : '\n\nVONTADE ATUAL: ainda sem decisão publicada; não invente uma intenção.')
        : '';
    const actionRequest = formatFloor10ActionRequestForPrompt(userText);
    // ── O QUE ELE JÁ DISSE ────────────────────────────────────────────────
    // Vai NO FIM, e por um motivo oposto ao do resumo: esta lista muda a cada
    // fala dele, então pô-la no começo invalidaria o prefixo em cache do
    // llama.cpp a cada turno — e é justamente esse cache que faz "273
    // reaproveitados de 303" no celular. No fim, ela custa alguns tokens de
    // prefill e nada mais.
    const jaDito = blocoDoJaDito(history, FLOOR10_HISTORY_VERBATIM_NO_PROMPT);
    const blocoJaDito = jaDito ? `\n\n${jaDito}` : '';

    // O resumo vem LOGO DEPOIS da persona, e isso é de propósito: ele muda uma
    // vez a cada várias falas, então o prefixo em cache do llama.cpp sobrevive
    // entre uma pergunta e outra. Fosse no fim, invalidaria menos ainda — mas
    // aí o modelo leria os fatos antes de saber do que já falaram.
    return `${ESSENTIAL_PERSONA}${blocoDoResumo()}${factBlock}${livePerception}${liveWill}${identityGuard}${actionRequest}${blocoJaDito}`;
}

const HARD_CONTRADICTIONS: readonly RegExp[] = [
    /\bmeu nome (?:e|é|eh|:)\s*["']?(?:the )?normal elevator\b/i,
    /\bmy name is\s*["']?(?:the )?normal elevator\b/i,
    /\bme llamo\s*["']?(?:the )?normal elevator\b/i,
    /\b(?:eu )?sou (?:o |a )?(?:the normal elevator|hotel|elevador|propriet[aá]rio|arquivista)\b/i,
    /\bi am (?:the )?(?:normal elevator|hotel|elevator|owner|archivist)\b/i,
    /\bsoy (?:el |la )?(?:the normal elevator|hotel|ascensor|propietario|archivista)\b/i,
    /\b(?:nao|não) (?:e|é) (?:um )?hotel\b/i,
    /\b(?:preso|presa|trancado|trancada) (?:dentro d[eo]|n[oa]) elevador\b/i,
    /\b(?:vim|estou) aqui para (?:trabalhar|consertar|manusear|fazer manuten[cç][aã]o)\b/i,
    /\b(?:cada dia|a cada dia).{0,45}\b(?:andar|hotel).{0,35}\b(?:sobe|cresce)\b/i,
    /\b(?:floor|hotel).{0,35}\b(?:rises|grows).{0,35}\b(?:every day|each day)\b/i,
    /\b(?:piso|hotel).{0,35}\b(?:sube|crece).{0,35}\b(?:cada dia)\b/i,
    /\b(?:hotel|normal elevator).{0,35}\b(?:vai|esta|está|estar|parece).{0,30}\b(?:acabar|encerrar)\b/i,
    /\b(?:hotel|normal elevator).{0,35}\bis about to end\b/i,
    /\b(?:hotel|normal elevator).{0,35}\b(?:va a terminar|esta por terminar)\b/i,
    // ── A TROCA DE IDENTIDADE ─────────────────────────────────────────────
    //
    // Do print do dono do jogo, palavra por palavra:
    //
    //   jogador: "eu queria saber quem sou eu... Eu estou perdido"
    //   Nilo:    "Você é Nilo Azevedo, um ex-técnico de elevadores, agora um
    //             hóspede preso no 10º andar do hotel The Normal Elevator."
    //
    // Ele entrega a PRÓPRIA vida ao jogador. É a contradição mais grave que
    // este NPC pode cometer — se o jogador é Nilo, não existe mais NPC — e
    // passava por tudo. `floor10ReplyIssue` respondeu `null` para essa frase
    // exata; medi antes de escrever estas linhas.
    //
    // Pior: a única checagem de identidade que existia é "a resposta contém
    // 'nilo'?". A troca CONTÉM. A guarda não só deixava passar como carimbava
    // como boa a versão errada.
    //
    // Vale também para o histórico: `groundedModelHistory` descarta falas com
    // contradição dura, então a mentira para de voltar como contexto das
    // próximas — que é como uma troca dessas se enraíza numa conversa.
    /\bvoc[eê] (?:e|é|eh) (?:o |um )?nilo\b/i,
    /\bvoc[eê] (?:e|é|eh) (?:um |o )?ex[- ]?t[eé]cnico\b/i,
    /\bseu nome (?:e|é|eh) (?:o )?nilo\b/i,
    /\byou are (?:the )?nilo\b/i,
    /\byour name is (?:the )?nilo\b/i,
    /\b(?:tu |usted )?eres (?:el )?nilo\b/i,
];

export function hasHardCanonContradiction(text: string): boolean {
    return HARD_CONTRADICTIONS.some((pattern) => pattern.test(text));
}

export type Floor10ReplyIssue =
    | 'resposta vazia'
    | 'contradição com o cânone'
    | 'contradição com os olhos'
    | 'identidade ausente'
    // Vem do JUIZ DE TOM, não desta régua: ele mede a frase por vetor contra
    // âncoras boas e ruins, e pega o que nenhum regex pega — a frase que não
    // quebra regra escrita nenhuma e mesmo assim não é o Nilo.
    | 'fora do tom';

/**
 * Valida a fala sem fabricar uma resposta substituta. Se houver problema, o
 * chamador pode pedir outra geração ao 3B; RAG e regras nunca falam por Nilo.
 */
export function floor10ReplyIssue(
    reply: string,
    userText: string,
    perception?: Floor10Perception,
): Floor10ReplyIssue | null {
    const trimmed = reply.trim();
    const askedIdentity = isFloor10IdentityQuestion(userText);
    if (trimmed === '') return 'resposta vazia';
    if (hasHardCanonContradiction(trimmed)) return 'contradição com o cânone';
    if (
        perception
        && isFloor10PerceptionQuestion(userText)
        && hasFloor10PerceptionContradiction(trimmed, perception)
    ) {
        return 'contradição com os olhos';
    }
    if (askedIdentity && !normalize(trimmed).includes('nilo')) return 'identidade ausente';
    return null;
}

export const FLOOR10_HISTORY_CHAR_BUDGET = 1_800;
export const FLOOR10_HISTORY_MESSAGE_CHAR_LIMIT = 900;

function clipHistoryText(text: string, limit: number): string {
    const trimmed = text.trim();
    if (limit <= 0) return '';
    if (trimmed.length <= limit) return trimmed;
    const separator = '\n[…]\n';
    if (limit <= separator.length + 2) return trimmed.slice(-limit);
    const available = Math.max(2, limit - separator.length);
    const head = Math.ceil(available * 0.45);
    const tail = available - head;
    return `${trimmed.slice(0, head)}${separator}${trimmed.slice(-tail)}`;
}

/**
 * Não deixa uma fala alucinada antiga contaminar as próximas gerações.
 *
 * Também normaliza o histórico para o template de chat do modelo:
 * - começa sempre em `user`, nunca em uma fala autônoma de `assistant`;
 * - junta papéis consecutivos depois de uma tentativa que falhou;
 * - limita o prefill real sem apagar nada do painel visível.
 */
export function groundedModelHistory(history: readonly NpcMsg[], maxMessages = 6): NpcMsg[] {
    const coalesced: NpcMsg[] = [];
    for (const message of history) {
        if (message.role === 'system') continue;
        if (message.role === 'assistant' && hasHardCanonContradiction(message.content)) continue;
        const content = clipHistoryText(message.content, FLOOR10_HISTORY_MESSAGE_CHAR_LIMIT);
        if (!content) continue;
        const previous = coalesced.at(-1);
        if (previous?.role === message.role) {
            previous.content = clipHistoryText(
                `${previous.content}\n${content}`,
                FLOOR10_HISTORY_MESSAGE_CHAR_LIMIT,
            );
        } else {
            coalesced.push({ role: message.role, content });
        }
    }

    const selected: NpcMsg[] = [];
    let remainingChars = FLOOR10_HISTORY_CHAR_BUDGET;
    for (let index = coalesced.length - 1; index >= 0; index -= 1) {
        if (selected.length >= Math.max(1, maxMessages) || remainingChars <= 0) break;
        const message = coalesced[index];
        const content = clipHistoryText(message.content, remainingChars);
        if (!content) break;
        selected.unshift({ role: message.role, content });
        remainingChars -= content.length;
    }

    while (selected[0]?.role !== 'user') selected.shift();
    return selected;
}

/** Durante o streaming, esconde uma contradição assim que ela fica reconhecível. */
export function guardedStreamingText(streaming: string): string {
    return hasHardCanonContradiction(streaming) ? '…' : streaming;
}

/**
 * Corta a fala na ÚLTIMA frase completa.
 *
 * No celular do Felipe as respostas apareciam decepadas no meio da palavra
 * ("…não tenho memória cl", "…porque não há nada que"): o teto de tokens caía
 * no meio da frase. Como a geração custa ~1 token por segundo ali, aumentar o
 * teto sairia caríssimo — é melhor entregar menos, porém inteiro.
 *
 * Só corta quando sobra frase fechada: se o modelo produziu uma única frase sem
 * ponto final, devolvê-la vazia seria pior que deixá-la truncada.
 *
 * ── O CASO QUE ESTA FUNÇÃO NÃO COBRIA, E O DONO DO JOGO FOTOGRAFOU ───────
 *
 *     "A foto do 20º andar não tem poder, e eu não tenho medo de você nem de"
 *
 * Nenhum ponto final em lugar nenhum: `lastEnd < 0`, e a resposta saía crua na
 * tela, morrendo em "nem de". O raciocínio de "truncado é melhor que vazio"
 * está certo — só que ele tratava as duas únicas saídas possíveis como sendo
 * "cru" e "vazio", e há uma terceira.
 *
 * Existe uma FRONTEIRA DE ORAÇÃO ali (a vírgula depois de "poder"), e cortar
 * nela devolve "A foto do 20º andar não tem poder…" — um pensamento inteiro,
 * com reticências dizendo ao jogador o que de fato aconteceu: ele foi
 * interrompido. Nada é inventado; só se apaga o pedaço que o teto de tokens
 * deixou pela metade.
 *
 * O corte por oração só vale quando SOBRA fala: se a vírgula está no começo,
 * jogar fora 80% do que ele disse seria pior que a frase truncada. Nesse caso o
 * texto vai inteiro, com as reticências — que continuam sendo verdade.
 */
export function trimToCompleteSentence(reply: string): string {
    const text = reply.trim();
    if (!text) return text;
    // Já termina fechado (inclui aspas/parênteses depois da pontuação).
    if (/[.!?…][)"'”’]?$/.test(text)) return text;
    const lastEnd = Math.max(
        text.lastIndexOf('.'), text.lastIndexOf('!'),
        text.lastIndexOf('?'), text.lastIndexOf('…'),
    );
    if (lastEnd >= 0) {
        const cortado = text.slice(0, lastEnd + 1).trim();
        if (cortado.length > 0) return cortado;
    }
    return aparadoNaOracao(text);
}

/** Vírgula, ponto e vírgula, dois-pontos, travessão: onde uma oração fecha. */
const FRONTEIRA_DE_ORACAO = ',;:—–';

/** Quanto precisa sobrar do corte por oração para ele valer a pena. */
const MINIMO_APROVEITAVEL = 24;
const FRACAO_APROVEITAVEL = 0.4;

function aparadoNaOracao(text: string): string {
    let corte = -1;
    for (let i = text.length - 1; i >= 0; i -= 1) {
        if (FRONTEIRA_DE_ORACAO.includes(text[i])) { corte = i; break; }
    }
    const retido = corte > 0 ? text.slice(0, corte).trim() : '';
    if (retido.length >= MINIMO_APROVEITAVEL && retido.length >= text.length * FRACAO_APROVEITAVEL) {
        return `${retido}…`;
    }
    // Sem corte que valha: entrega tudo, mas sem a pontuação solta no fim
    // ("O hotel é estranho,…" é feio; "O hotel é estranho…" não é).
    return `${text.replace(/[,;:—–\s]+$/, '')}…`;
}

/**
 * Tira a frase que ele acabou de dizer duas vezes DENTRO da mesma fala.
 *
 * As três defesas contra repetição que já existiam são todas sobre falas
 * DIFERENTES — `penalty_last_n`, o histórico literal, o bloco do "já dito". A
 * repetição dentro de uma resposta só, que é a que o dono do jogo viu na
 * segunda foto, passava por todas elas.
 *
 * Aqui não se gera nada de novo e não se espera nada: some o texto que o
 * próprio modelo emitiu duas vezes. É a diferença entre este conserto e mandar
 * gerar de novo, que no celular dele custaria ~30 s por resposta — remédio pior
 * que a doença.
 *
 * Frases curtas ficam: "Não sei." repetido é ênfase, e o comparador nem tem
 * palavra pesada o bastante para medir.
 */
export function semFraseRepetida(reply: string): string {
    const text = reply.trim();
    if (!text) return text;
    // Sem `lookbehind` de propósito: ele é erro de SINTAXE em Safari antigo, e
    // derrubaria o pacote inteiro no aparelho que este projeto persegue.
    const frases = text.match(/[^.!?…]+[.!?…]*/g);
    if (!frases || frases.length < 2) return text;
    const mantidas: string[] = [];
    let cortou = false;
    for (const bruta of frases) {
        const frase = bruta.trim();
        if (!frase) continue;
        if (frase.length >= 16 && mantidas.some((m) => MemoriaDeBolhas.parecidas(m, frase))) {
            cortou = true;
            continue;
        }
        mantidas.push(frase);
    }
    // Só remonta quando cortou algo: remontar sempre destruiria a formatação
    // original (quebras de linha, espaçamento) sem motivo.
    if (!cortou || mantidas.length === 0) return text;
    return mantidas.join(' ');
}

/**
 * O texto que vai para a tela e para o histórico, venha ele do fim normal da
 * geração ou do watchdog.
 *
 * As duas saídas existiam e SÓ UMA passava pelo corte de frase — a do
 * watchdog salvava o parcial cru, justo o caminho em que a fala é
 * interrompida no meio por definição. Esta função existe para que não haja
 * mais "as duas saídas": há uma, e as duas a chamam.
 *
 * A ordem importa. A cópia repetida se reconhece com as frases inteiras, então
 * ela sai primeiro; o rabo pela metade é o que sobra por último.
 */
/**
 * ── O PONTO SOLTO NO COMEÇO DA FALA ──────────────────────────────────────
 *
 * Medido na bancada de qualidade, em três modelos diferentes:
 *
 *     ".Não. Não tenho motivos para sair."
 *     ".Sim, quero sair daqui, mas não sei como."
 *     ".Não quero. Não há como."
 *
 * `visibleText` corta o bloco de raciocínio e apara ESPAÇO no começo, mas não
 * pontuação; um ponto logo depois do `</think>` sobrevive e chega à tela. Nem
 * `trimToCompleteSentence` nem `semFraseRepetida` mexem no início, então até
 * aqui ninguém tirava.
 *
 * Só a pontuação que NUNCA abre uma fala. O travessão e as aspas ficam: "— Não
 * sei." e «"Não sei", ele diz» são aberturas legítimas, e apará-las estragaria
 * o que hoje está certo.
 */
const ABERTURA_SOLTA = /^[.,;:!?…\s]+/;

export function arrumarFala(reply: string): string {
    return trimToCompleteSentence(semFraseRepetida(reply.replace(ABERTURA_SOLTA, '')));
}
