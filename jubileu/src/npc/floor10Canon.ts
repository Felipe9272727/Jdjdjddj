import type { NpcMsg } from './npcStore';
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

type CanonEntry = {
    id: string;
    keywords: readonly string[];
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
Responda no idioma do jogador, em 1 a 3 frases naturais, só ao pedido, com opinião e emoção. Pode perguntar de volta; se não souber, admita e nunca invente fatos. Responda somente com a fala de Nilo, sem rótulo.`;

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

export function buildFloor10SystemPrompt(
    userText: string,
    history: readonly NpcMsg[],
    perception?: Floor10Perception,
    will?: Floor10WillSnapshot,
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

    const [topFact] = retrieveFloor10Canon(query, 1);
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

    return `${ESSENTIAL_PERSONA}${factBlock}${livePerception}${liveWill}${identityGuard}${actionRequest}`;
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
];

export function hasHardCanonContradiction(text: string): boolean {
    return HARD_CONTRADICTIONS.some((pattern) => pattern.test(text));
}

export type Floor10ReplyIssue =
    | 'resposta vazia'
    | 'contradição com o cânone'
    | 'contradição com os olhos'
    | 'identidade ausente';

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
