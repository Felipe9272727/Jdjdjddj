import type { F10PrisonState } from './f10Prison';
import type { Floor10Perception, Vec3Like } from './floor10Perception';

// ── CÓRTEX MOTOR DE LINGUAGEM ──────────────────────────────────────────────
// O cérebro pequeno pensa em texto livre. Este módulo transforma uma intenção
// textual curta em um plano que o corpo realmente consegue executar.
//
// Uma terceira LLM de 135M faz a tradução sem tocar no raciocínio nem no cache
// do MiniBrain. Este módulo aterra o resultado nas coordenadas reais da sala. O
// RL recebe as características do plano e aprende quando confiar, corrigir ou
// ignorar a proposta. Linguagem sugere; corpo e experiência continuam mandando.

export const FLOOR10_MOTOR_VERBS = [
    'approach',
    'withdraw',
    'hold',
    'orbit',
    'explore',
    'stay',
] as const;

export const FLOOR10_MOTOR_TARGETS = [
    'player',
    'elevator',
    'nearest-device',
    'active-device',
    'room-center',
    'north-side',
    'south-side',
    'east-side',
    'west-side',
    'self',
] as const;

export const FLOOR10_MOTOR_PACES = ['slow', 'normal', 'fast'] as const;
export const FLOOR10_MOTOR_DURATIONS = [3, 6, 9, 12] as const;

export type Floor10MotorVerb = (typeof FLOOR10_MOTOR_VERBS)[number];
export type Floor10MotorTarget = (typeof FLOOR10_MOTOR_TARGETS)[number];
export type Floor10MotorPace = (typeof FLOOR10_MOTOR_PACES)[number];
export type Floor10MotorDuration = (typeof FLOOR10_MOTOR_DURATIONS)[number];

export type Floor10MotorPlan = {
    verb: Floor10MotorVerb;
    target: Floor10MotorTarget;
    pace: Floor10MotorPace;
    duration: Floor10MotorDuration;
    /** Linha produzida pela tradução, útil para a sala da mente. */
    raw: string;
};

export type GroundedFloor10Motion = {
    plan: Floor10MotorPlan;
    target: { x: number; z: number } | null;
    speed: number;
    lockSeconds: number;
    reason: string;
};

const MOTOR_PATTERN =
    /MOTION:\s*(approach|withdraw|hold|orbit|explore|stay)\s*\|\s*(player|elevator|nearest-device|active-device|room-center|north-side|south-side|east-side|west-side|self)\s*\|\s*(slow|normal|fast)\s*\|\s*(3|6|9|12)\s*(?:s|seconds?)?/gi;

/**
 * Gramática da PASSADA DE TRADUÇÃO, não do pensamento. O texto livre já foi
 * escrito; aqui só o comprimimos numa instrução motora segura e barata.
 */
export const FLOOR10_MOTOR_GRAMMAR =
    `root ::= "MOTION: " verb " | " target " | " pace " | " duration
verb ::= ${FLOOR10_MOTOR_VERBS.map((value) => `"${value}"`).join(' | ')}
target ::= ${FLOOR10_MOTOR_TARGETS.map((value) => `"${value}"`).join(' | ')}
pace ::= ${FLOOR10_MOTOR_PACES.map((value) => `"${value}"`).join(' | ')}
duration ::= ${FLOOR10_MOTOR_DURATIONS.map((value) => `"${value}"`).join(' | ')}`;

function availableMotorTargets(
    perception: Floor10Perception,
    prison?: F10PrisonState | null,
): Floor10MotorTarget[] {
    return [
        ...(perception.player ? ['player' as const] : []),
        'elevator',
        ...(prison ? ['nearest-device' as const] : []),
        ...(prison && Object.values(prison.devices).some(
            (device) => device.heldByNpc || device.heldByPlayer,
        )
            ? ['active-device' as const]
            : []),
        'room-center',
        'north-side',
        'south-side',
        'east-side',
        'west-side',
        'self',
    ];
}

/**
 * Além de explicar os alvos no prompt, remove os impossíveis da decodificação.
 * Isso deixa a tarefa viável para 135M e impede que ele desperdice a rodada
 * escolhendo jogador/aparelho que os olhos não detectaram.
 */
export function buildMotorGrammar(
    perception: Floor10Perception,
    prison?: F10PrisonState | null,
): string {
    const targets = availableMotorTargets(perception, prison);
    return `root ::= "MOTION: " verb " | " target " | " pace " | " duration
verb ::= ${FLOOR10_MOTOR_VERBS.map((value) => `"${value}"`).join(' | ')}
target ::= ${targets.map((value) => `"${value}"`).join(' | ')}
pace ::= ${FLOOR10_MOTOR_PACES.map((value) => `"${value}"`).join(' | ')}
duration ::= ${FLOOR10_MOTOR_DURATIONS.map((value) => `"${value}"`).join(' | ')}`;
}

/** Lê sempre a última tradução, caso o modelo tenha se corrigido. */
export function parseMotorPlan(raw: string): Floor10MotorPlan | null {
    const matches = [...raw.matchAll(MOTOR_PATTERN)];
    const match = matches.at(-1);
    if (!match) return null;
    const duration = Number(match[4]);
    if (!(FLOOR10_MOTOR_DURATIONS as readonly number[]).includes(duration)) return null;
    return {
        verb: match[1] as Floor10MotorVerb,
        target: match[2] as Floor10MotorTarget,
        pace: match[3] as Floor10MotorPace,
        duration: duration as Floor10MotorDuration,
        raw: match[0].trim(),
    };
}

const MOTOR_TEXT_TAIL = 650;

/**
 * O tradutor conhece somente alvos que os sensores já expõem. Ele não recebe a
 * solução da prisão e não pode inventar uma coordenada fora do mapa.
 */
export function buildMotorTranslationPrompt(
    thinking: string,
    perception: Floor10Perception,
    prison?: F10PrisonState | null,
): string {
    const tail = thinking.trim().slice(-MOTOR_TEXT_TAIL);
    const targets = availableMotorTargets(perception, prison).join(', ');
    const examples = [
        'I should stay still and listen. => MOTION: stay | self | slow | 3',
        'I want to cross toward the right wall. => MOTION: explore | east-side | normal | 6',
        perception.player
            ? 'I want to get closer to him. => MOTION: approach | player | normal | 6'
            : 'I want another angle on the door. => MOTION: orbit | elevator | slow | 6',
        prison
            ? 'I should keep my weight on that thing. => MOTION: hold | nearest-device | slow | 9'
            : null,
    ].filter(Boolean).join('\n');
    return `Translate Nilo's own thought into one feasible body movement.
Do not invent a new desire and do not solve the room for him.
AVAILABLE TARGETS: ${targets}.
VERBS: approach, withdraw, hold, orbit, explore, stay.
PACE: slow, normal, fast. DURATION: 3, 6, 9, 12 seconds.
Use stay | self when his thought does not imply movement.

EXAMPLES:
${examples}

HIS THOUGHT:
"""
${tail}
"""

Answer with exactly:
MOTION: <verb> | <target> | <pace> | <duration>`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function safeRoomTarget(point: { x: number; z: number }): { x: number; z: number } {
    return {
        x: clamp(point.x, -19.5, 19.5),
        // Movimento livre não entra por acidente no poço do elevador.
        z: clamp(point.z, -8.2, 18.5),
    };
}

function distanceXZ(
    a: Pick<Vec3Like, 'x' | 'z'>,
    b: Pick<Vec3Like, 'x' | 'z'>,
): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function stableDirection(raw: string): { x: number; z: number } {
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index++) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
    return { x: Math.sin(angle), z: Math.cos(angle) };
}

function nearestDevice(
    prison: F10PrisonState,
    position: Pick<Vec3Like, 'x' | 'z'>,
    activeOnly: boolean,
): { x: number; z: number } | null {
    const devices = Object.values(prison.devices).filter(
        (device) => !activeOnly || device.heldByNpc || device.heldByPlayer,
    );
    let nearest: { x: number; z: number } | null = null;
    let nearestDistance = Infinity;
    for (const device of devices) {
        const distance = distanceXZ(position, device);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = { x: device.x, z: device.z };
        }
    }
    return nearest;
}

function targetPoint(
    plan: Floor10MotorPlan,
    perception: Floor10Perception,
    prison: F10PrisonState | null | undefined,
    position: Pick<Vec3Like, 'x' | 'z'>,
): { x: number; z: number } | null {
    switch (plan.target) {
        case 'player':
            return perception.player
                ? { x: perception.player.position.x, z: perception.player.position.z }
                : null;
        case 'elevator': return { x: 0, z: -8.35 };
        case 'nearest-device':
            return prison ? nearestDevice(prison, position, false) : null;
        case 'active-device':
            return prison ? nearestDevice(prison, position, true) : null;
        case 'room-center': return { x: 0, z: 4 };
        case 'north-side': return { x: 0, z: 16 };
        case 'south-side': return { x: 0, z: -6.5 };
        case 'east-side': return { x: 16, z: 4 };
        case 'west-side': return { x: -16, z: 4 };
        case 'self': return { x: position.x, z: position.z };
        default: return null;
    }
}

function paceSpeed(pace: Floor10MotorPace): number {
    if (pace === 'fast') return 1.16;
    if (pace === 'slow') return 0.56;
    return 0.86;
}

const VERB_PT: Record<Floor10MotorVerb, string> = {
    approach: 'me aproximar',
    withdraw: 'me afastar',
    hold: 'ficar naquele ponto',
    orbit: 'dar a volta e observar',
    explore: 'explorar por ali',
    stay: 'continuar onde estou',
};

const TARGET_PT: Record<Floor10MotorTarget, string> = {
    player: 'de você',
    elevator: 'do elevador',
    'nearest-device': 'da coisa mais próxima que reage',
    'active-device': 'da coisa que está reagindo',
    'room-center': 'do centro da sala',
    'north-side': 'do lado norte',
    'south-side': 'do lado sul',
    'east-side': 'do lado leste',
    'west-side': 'do lado oeste',
    self: 'aqui',
};

/**
 * Aterra uma intenção sem transformá-la numa ordem cega. Alvo inexistente
 * devolve null e a Utility AI usa a deliberação antiga como fallback.
 */
export function groundMotorPlan(
    plan: Floor10MotorPlan,
    perception: Floor10Perception,
    prison: F10PrisonState | null | undefined,
    position: Pick<Vec3Like, 'x' | 'z'>,
): GroundedFloor10Motion | null {
    if (plan.verb === 'stay') return null;
    const focus = targetPoint(plan, perception, prison, position);
    if (!focus) return null;

    let dx = position.x - focus.x;
    let dz = position.z - focus.z;
    let length = Math.hypot(dx, dz);
    if (length < 0.001) {
        const stable = stableDirection(plan.raw);
        dx = stable.x;
        dz = stable.z;
        length = 1;
    } else {
        dx /= length;
        dz /= length;
    }

    let target: { x: number; z: number };
    if (plan.verb === 'withdraw') {
        target = safeRoomTarget({
            x: position.x + dx * 4.2,
            z: position.z + dz * 4.2,
        });
    } else if (plan.verb === 'orbit') {
        const side = stableDirection(plan.raw).x >= 0 ? 1 : -1;
        target = safeRoomTarget({
            x: focus.x + (-dz * side) * 2.8,
            z: focus.z + (dx * side) * 2.8,
        });
    } else if (plan.verb === 'explore') {
        const drift = stableDirection(plan.raw);
        target = safeRoomTarget({
            x: focus.x + drift.x * 2.4,
            z: focus.z + drift.z * 2.4,
        });
    } else if (plan.verb === 'approach' && plan.target === 'player') {
        // Aproximar não significa invadir o corpo: para a 1,8 m.
        target = safeRoomTarget({
            x: focus.x + dx * 1.8,
            z: focus.z + dz * 1.8,
        });
    } else {
        target = plan.target === 'elevator'
            ? focus
            : safeRoomTarget(focus);
    }

    return {
        plan,
        target,
        speed: paceSpeed(plan.pace),
        lockSeconds: plan.duration,
        reason: `${VERB_PT[plan.verb]} ${TARGET_PT[plan.target]}, porque foi isso que concluí pensando`,
    };
}

/**
 * 6 verbos + 4 famílias de alvo + ritmo + duração. São os sinais compactos que
 * permitem ao RL aprender que tipos de tradução costumam funcionar.
 */
export const FLOOR10_MOTOR_FEATURE_SIZE = 12;

export function motorPlanFeatures(plan: Floor10MotorPlan | null | undefined): number[] {
    const features = new Array<number>(FLOOR10_MOTOR_FEATURE_SIZE).fill(0);
    if (!plan) return features;

    const verb = FLOOR10_MOTOR_VERBS.indexOf(plan.verb);
    if (verb >= 0) features[verb] = 1;

    const targetOffset = FLOOR10_MOTOR_VERBS.length;
    const targetClass = plan.target === 'player'
        ? 0
        : plan.target === 'elevator'
            ? 1
            : plan.target === 'nearest-device' || plan.target === 'active-device'
                ? 2
                : 3;
    features[targetOffset + targetClass] = 1;

    const paceIndex = targetOffset + 4;
    features[paceIndex] = plan.pace === 'slow' ? 0 : plan.pace === 'normal' ? 0.5 : 1;
    features[paceIndex + 1] = plan.duration / 12;
    return features;
}
