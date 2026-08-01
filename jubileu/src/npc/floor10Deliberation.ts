// ── A DELIBERAÇÃO — o segundo cérebro, pequeno e privado ──────────────────
// A Utility AI é o REFLEXO do Nilo: decide em microssegundos e nunca deixa o
// corpo parado. Este módulo é a DELIBERAÇÃO: o MiniBrain configurado pelo
// jogador (Llama 3.2 1B por padrão), que escolhe por fora e, de vez em quando,
// entrega uma intenção própria que o reflexo passa a servir.
//
// Por que um modelo pequeno e em inglês:
// - Ele não fala com o jogador, então não precisa de português (medido: em
//   português ele devolve a própria entrada; em inglês raciocina certo sobre
//   posição, desejos e memória).
// - Fica entre ~688 e ~808 MB conforme a escolha e é opcional: se não couber,
//   o reflexo continua funcionando.
// - Pensa em texto livre com teto de tempo/tokens; sua passada restrita só
//   assina a escolha ampla. Uma terceira LLM de 135M traduz as palavras em
//   movimento executável, sem pedir outro trabalho ao MiniBrain.

import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives, Floor10WillGoal } from './floor10Will';
import type { Floor10MotorPlan } from './floor10MotorCortex';

/** Metas que a deliberação pode propor ao reflexo. */
export const DELIBERATION_GOALS = [
    'inspect-elevator',
    'wander',
    'idle',
    'observe-player',
    'approach-player',
    'make-space',
    'seek-player',
    'talk-player',
] as const;

export type DeliberationGoal = (typeof DELIBERATION_GOALS)[number];

export type Floor10Deliberation = {
    goal: DeliberationGoal;
    /** Justificativa crua do modelo (inglês) — vira cor para a fala, nunca é exibida. */
    rationale: string;
    at: number;
    /**
     * Tradução motora daquilo que ele pensou. É opcional: se a passagem curta
     * de tradução falhar, a escolha antiga continua funcionando normalmente.
     */
    motion?: Floor10MotorPlan | null;
};

/** Memória curta do que ele já tentou, para a deliberação não repetir à toa. */
export type DeliberationMemory = {
    inspectedElevatorCount: number;
    sleeps: number;
    playerSilentSeconds: number;
    lastGoals: readonly Floor10WillGoal[];
    /**
     * O QUE FOI COMBINADO NA CONVERSA. É por aqui que os dois cérebros se
     * falam: o 3B aceita um pedido do jogador ("entra no elevador"), a Utility
     * AI passa a cumprir, e a deliberação FICA SABENDO — sem isto ela poderia
     * decidir algo que contradiz o que o Nilo acabou de prometer.
     */
    agreedAction?: string | null;
    agreedReason?: string | null;
    /**
     * A HORA e o humor, em inglês, vindos do relógio interno (floor10Drives).
     * Sem isto o modelo recebe quatro números e nenhuma noção de que são 3 da
     * manhã — e a hora do dia não influencia nada do que ele decide pensar,
     * que era justamente o ponto de dar um ciclo a ele.
     */
    mood?: string | null;
};

/**
 * O Nilo PENSA antes de escolher — por decisão do dono do jogo.
 *
 * Antes este texto mandava "Do not narrate reasoning" e a saída era presa por
 * gramática a uma única linha. Isso deixava o modelo de raciocínio incapaz de
 * raciocinar: pagávamos o preço de um modelo pensante e proibíamos o
 * pensamento. Agora ele olha o que os olhos mostram, pesa o que sente, e só
 * então assina a escolha na última linha.
 *
 * O que impede o pensamento eterno NÃO é mais a mordaça, e sim três limites que
 * não interferem no conteúdo: teto de tokens, teto de tempo e o descarte de
 * texto que gira no lugar.
 */
export const DELIBERATION_SYSTEM_PROMPT =
`You are the inner voice of Nilo, a man trapped alone on floor 10: one square gray room, grid floor, four walls, an elevator door. He never left. The elevator never obeys him.
You receive what he SEES right now, what he WANTS, and what he REMEMBERS trying.
Think it through in first person, as the man himself: what you notice, what bothers you, what you feel like doing.
Then decide by your own free will — you are a person, not a servant, and you may choose something unexpected as long as it makes sense for you.
Describe the physical movement you actually imagine doing. A separate motor interpreter will read your words and ground them in the room, so your body is not limited to the broad labels below.
Be brief: at most three short sentences. Never repeat yourself.
Then end with exactly one final line, choosing the option that fits what you just said:
CHOICE: <option>

The options, and what each one means for you:
- inspect-elevator: walk to the elevator door and study it again
- wander: walk around the room with no destination
- idle: stay where you are and do nothing
- observe-player: watch him in silence from where you are (only if you can see him)
- approach-player: walk closer to him (only if you can see him)
- make-space: step away from him, put distance between you
- seek-player: go looking for him, because he is not in sight
- talk-player: say something to him out loud`;

/**
 * A gramática força UMA linha e, com isso, torna o raciocínio impossível.
 * Por isso ela saiu da passada de pensamento — mas NÃO foi aposentada: virou a
 * rede de segurança da SEGUNDA passada, quando o raciocínio livre termina sem
 * uma escolha legível (ver buildChoiceExtractionPrompt).
 */
export const DELIBERATION_GRAMMAR =
    `root ::= "CHOICE: " goal
goal ::= ${DELIBERATION_GOALS.map((goal) => `"${goal}"`).join(' | ')}`;

/** A linha final cabe em poucos tokens; mais que isso é desperdício. */
export const DELIBERATION_EXTRACT_TOKENS = 16;

/** Quanto do raciocínio volta como contexto na hora de assinar a escolha. */
export const DELIBERATION_EXTRACT_TAIL = 400;

/**
 * A SEGUNDA PASSADA — o pensamento já aconteceu, falta só assiná-lo.
 *
 * Modelo de 1B erra formato com uma frequência que nada tem a ver com a
 * qualidade do que ele pensou: a literatura mede ~9,6% de acerto de formato sem
 * ajuda e ~91-94% com decodificação restrita por gramática. É exatamente o que
 * víamos aqui — raciocínio bom, terminado sem a linha "CHOICE:", jogado fora.
 *
 * Então a gramática não volta para amordaçar o pensamento; ela entra DEPOIS
 * dele, numa chamada curta que só relê o que ele mesmo escreveu e escolhe. O
 * raciocínio exibido continua sendo o da primeira passada, íntegro.
 */
export function buildChoiceExtractionPrompt(thinking: string): string {
    const cauda = thinking.trim().slice(-DELIBERATION_EXTRACT_TAIL);
    return `A man trapped alone in a room just thought this:
"""
${cauda}
"""
Which of these is he about to do? Answer with one line only.
Options: ${DELIBERATION_GOALS.join(', ')}`;
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Estado do mundo em inglês compacto e numérico. Sem prosa: o modelo pequeno lê
 * bem estrutura e mal literatura.
 */
export function buildDeliberationPrompt(
    perception: Floor10Perception,
    drives: Floor10WillDrives,
    memory: DeliberationMemory,
): string {
    const player = perception.player;
    const sees = player
        ? `player ${player.visible ? 'visible' : 'out of sight'}, ${player.direction}, ${round1(player.distance)}m`
        : 'no player';
    const elevator = `elevator ${perception.elevator.visible ? 'visible' : 'out of sight'}, ${round1(perception.elevator.distance)}m`;
    const recent = memory.lastGoals.length > 0
        ? memory.lastGoals.join(' -> ')
        : 'nothing yet';
    const lines = [
        ...(memory.mood ? [memory.mood] : []),
        `SEES: ${sees}; ${elevator}.`,
        `WANTS: social ${round1(drives.social)}, curiosity ${round1(drives.curiosity)}, restless ${round1(drives.restlessness)}, fatigue ${round1(drives.fatigue)}.`,
        `REMEMBERS: inspected the elevator ${memory.inspectedElevatorCount}x and found nothing; slept ${memory.sleeps} times here; player silent for ${Math.round(memory.playerSilentSeconds)}s.`,
        `RECENT ACTIONS: ${recent}.`,
    ];
    // A palavra dada na conversa vale mais que qualquer impulso: entra por
    // último, logo antes da decisão, e diz explicitamente para honrá-la.
    if (memory.agreedAction) {
        lines.push(
            `JUST PROMISED THE PLAYER: ${memory.agreedAction}`
            + (memory.agreedReason ? ` — he said: "${memory.agreedReason}"` : '')
            + '. Keep your word unless something makes it impossible.',
        );
    }
    return lines.join('\n');
}

const CHOICE_PATTERN = /CHOICE:\s*([a-z-]+)/gi;

/**
 * Lê a decisão no fim do raciocínio. O modelo escreve "CHOICE: x" várias vezes
 * enquanto delibera consigo mesmo, então vale sempre a ÚLTIMA ocorrência —
 * é a que ele assumiu depois de pensar.
 */
export function parseDeliberation(raw: string, at = 0): Floor10Deliberation | null {
    const matches = [...raw.matchAll(CHOICE_PATTERN)];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        const candidate = matches[index]?.[1]?.toLowerCase();
        if (candidate && (DELIBERATION_GOALS as readonly string[]).includes(candidate)) {
            return {
                goal: candidate as DeliberationGoal,
                rationale: extractRationale(raw),
                at,
            };
        }
    }
    // Sem o prefixo "CHOICE:". Visto na sala da mente: solto da gramática, o
    // modelo respondeu apenas "talk-player" — uma decisão perfeitamente boa que
    // era descartada por causa do formato.
    //
    // MAS: quando ele PENSA, ele relê o enunciado em voz alta — "I must choose
    // from the given options: inspect-elevator, wander, idle, …" — e o leitor
    // antigo pegava o ÚLTIMO rótulo da lista como se fosse a escolha. Ou seja: o
    // Nilo "decidia" sempre o último item da minha própria lista, sem ter
    // decidido nada. Peguei isso na sonda, numa rodada em que a saída era só o
    // enunciado repetido.
    //
    // Então o rótulo solto só vale quando NÃO há enumeração: um único alvo
    // conhecido no texto inteiro. Se houver mais de um, não dá para saber qual é
    // escolha e qual é eco — e aí quem decide é a segunda passada, com gramática.
    const solto = raw.toLowerCase().match(/[a-z]+(?:-[a-z]+)+/g) ?? [];
    const conhecidos = new Set(
        solto.filter((word) => (DELIBERATION_GOALS as readonly string[]).includes(word)),
    );
    if (conhecidos.size === 1) {
        const [candidate] = [...conhecidos];
        return {
            goal: candidate as DeliberationGoal,
            rationale: extractRationale(raw),
            at,
        };
    }
    return null;
}

/** Pega a fala final do modelo (depois do raciocínio), que explica a escolha. */
function extractRationale(raw: string): string {
    const endThink = raw.lastIndexOf('[End thinking]');
    const tail = endThink >= 0 ? raw.slice(endThink + '[End thinking]'.length) : raw;
    return tail
        .replace(CHOICE_PATTERN, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 400);
}

/**
 * Quanto a deliberação empurra a meta escolhida na tabela do reflexo. Não é uma
 * ordem: o reflexo continua livre para ignorá-la se a situação mudou (o jogador
 * chegou perto demais, por exemplo). É uma inclinação que dura um tempo.
 */
// A intenção deliberada dita como o Nilo diria. A bolha no mundo é do
// personagem: nenhum rótulo técnico pode vazar para a tela do jogador.
const DELIBERATION_THOUGHT: Record<DeliberationGoal, string> = {
    'inspect-elevator': 'preciso olhar aquela porta outra vez…',
    'wander': 'não consigo ficar parado aqui.',
    'idle': 'vou ficar quieto um pouco e escutar a sala.',
    'observe-player': 'quero entender você antes de falar.',
    'approach-player': 'acho que vou chegar mais perto.',
    'make-space': 'preciso de um pouco de espaço.',
    'seek-player': 'para onde foi você?',
    'talk-player': 'tem algo que eu queria te dizer.',
};

/** Texto da bolha de pensamento; vazio quando não há nada a mostrar. */
export function deliberationThought(phase: string, goal: string): string {
    if (phase === 'thinking') return 'pensando…';
    // Sem esta linha havia um buraco visível de dezenas de segundos entre a
    // conversa acabar e o pensamento voltar — e de fora isso é indistinguível
    // de "ele morreu".
    if (phase === 'reopening') return 'voltando a pensar…';
    if (phase !== 'decided') return '';
    return DELIBERATION_THOUGHT[goal as DeliberationGoal] ?? 'decidi o que fazer.';
}

export const DELIBERATION_BONUS = 0.55;
export const DELIBERATION_TTL_SECONDS = 45;

export function deliberationBonus(
    deliberation: Floor10Deliberation | null,
    goal: Floor10WillGoal,
    now: number,
): number {
    if (!deliberation || deliberation.goal !== goal) return 0;
    const age = now - deliberation.at;
    if (age < 0 || age > DELIBERATION_TTL_SECONDS) return 0;
    // Perde força com o tempo: uma intenção velha não deve mandar para sempre.
    return DELIBERATION_BONUS * (1 - age / DELIBERATION_TTL_SECONDS);
}

// ── TRAVAS CONTRA O LOOP DO MODELO PEQUENO ────────────────────────────────
// Alerta do Felipe, e procede: modelo pequeno de raciocínio às vezes entra em
// cadeia de pensamento circular. Aqui isso não pode virar um NPC travado nem um
// celular esquentando à toa, então há três limites independentes.

/**
 * Teto de tempo para UMA deliberação. Sem ele, um worker preso deixava a rodada
 * pendente para sempre — e como a trava `inFlight` só é liberada no `finally`,
 * o livre-arbítrio morria calado pelo resto da sessão.
 *
 * Foi de 20s para 60s quando o teto passou a reprovar deliberação SAUDÁVEL, e
 * agora para 150s porque o Nilo voltou a PENSAR: ler o mundo e escrever algumas
 * frases custa mais que assinar uma linha. Apertar aqui não deixa nada rápido,
 * só mata o pensamento antes do fim — que é pior do que o defeito original.
 *
 * Quem impede o loop eterno é o teto de TOKENS (o modelo não tem como passar
 * dele) mais o descarte do texto que gira. Este relógio é só a garantia de que
 * uma rodada PRESA acaba algum dia. Ninguém espera por ela: a deliberação roda
 * em segundo plano e o reflexo continua dirigindo o corpo o tempo todo.
 */
export const DELIBERATION_TIMEOUT_MS = 150_000;

/** A partir daqui paramos de insistir depressa e passamos a espaçar. */
export const DELIBERATION_MAX_FAST_RETRIES = 3;

/**
 * Reconhece a saída em círculo ("inspect elevator inspect elevator inspect…").
 * A gramática já limita QUAIS palavras saem, mas não impede repeti-las até o
 * teto de tokens; sem detectar isso, cada rodada gasta CPU para devolver nada.
 */
export function looksLikeLoop(raw: string): boolean {
    const words = raw.toLowerCase().match(/[a-zà-ú0-9-]+/gi) ?? [];
    if (words.length < 6) return false;
    const unique = new Set(words);
    // Muitas palavras e pouquíssima variedade = está girando no lugar.
    if (unique.size <= Math.max(2, Math.floor(words.length / 4))) return true;
    // Ou o mesmo par de palavras repetido em sequência.
    let repeats = 0;
    for (let i = 2; i < words.length; i += 1) {
        if (words[i] === words[i - 2] && words[i - 1] === words[i - 3]) repeats += 1;
    }
    return repeats >= 4;
}

/**
 * Espaçamento entre tentativas depois de uma rodada sem escolha. As primeiras
 * falhas costumam ser só uma fala do jogador atravessando, então retomar rápido
 * é certo; falha repetida é defeito, e aí insistir a cada 5s só cozinha o
 * aparelho. Cresce até o ciclo normal e para de piorar.
 */
export function deliberationRetryDelay(consecutiveFailures: number): number {
    const falhas = Math.max(0, Math.floor(consecutiveFailures));
    if (falhas <= DELIBERATION_MAX_FAST_RETRIES) return 5;
    return Math.min(300, 5 * 2 ** (falhas - DELIBERATION_MAX_FAST_RETRIES));
}

/**
 * Quanto tempo depois de a fala terminar a vontade ganha uma nova chance.
 *
 * Antes ela esperava o ciclo cheio de 60s a partir do ÚLTIMO disparo — somado
 * ao tempo de reabrir o runtime, dava mais de um minuto de silêncio depois de
 * cada conversa, e quem estava jogando concluía (com razão) que ele tinha
 * parado de pensar. Seis segundos é o bastante para a fala terminar de assentar
 * e curto o suficiente para o retorno ser visível.
 */
export const REARME_APOS_FALA_SEG = 6;
