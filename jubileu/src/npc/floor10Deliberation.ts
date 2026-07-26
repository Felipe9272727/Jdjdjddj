// ── A DELIBERAÇÃO — o segundo cérebro, pequeno e privado ──────────────────
// A Utility AI é o REFLEXO do Nilo: decide em microssegundos e nunca deixa o
// corpo parado. Este módulo é a DELIBERAÇÃO: um modelo pequeno (MiniCPM5-1B)
// que escolhe por fora e, de vez em quando, entrega uma intenção própria que o
// reflexo passa a servir.
//
// Por que um modelo pequeno e em inglês:
// - Ele não fala com o jogador, então não precisa de português (medido: em
//   português ele devolve a própria entrada; em inglês raciocina certo sobre
//   posição, desejos e memória).
// - É barato (688 MB, ~200 tok/s de leitura), então roda em celular fraco sem
//   disputar com o 3B da conversa.
// - O checkpoint continua sendo o mesmo modelo híbrido, mas usamos o modo
//   no-think: gerar milhares de tokens de raciocínio não tornava a escolha mais
//   livre, apenas atrasava a única informação consumida pelo corpo.

import type { Floor10Perception } from './floor10Perception';
import type { Floor10WillDrives, Floor10WillGoal } from './floor10Will';

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
};

export const DELIBERATION_SYSTEM_PROMPT =
`You are the instinct of a man trapped alone on floor 10: one square gray room, grid floor, four walls, an elevator door. He never left. The elevator never obeys him.
You receive what he SEES right now, what he WANTS, and what he REMEMBERS trying.
Decide what he does next, by his own free will — he is a person, not a servant, and he may choose something unexpected as long as it makes sense for him.
Do not narrate reasoning. Answer immediately with exactly one line:
CHOICE: <option>
Valid options: ${DELIBERATION_GOALS.join(', ')}`;

/**
 * A gramática deixa o MiniCPM livre para escolher a meta, mas torna impossível
 * desperdiçar minutos narrando raciocínio que nenhum outro módulo consome.
 * Um teto curto adicional impede qualquer geração órfã de queimar CPU.
 */
export const DELIBERATION_GRAMMAR =
    `root ::= "CHOICE: " goal
goal ::= ${DELIBERATION_GOALS.map((goal) => `"${goal}"`).join(' | ')}`;

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
