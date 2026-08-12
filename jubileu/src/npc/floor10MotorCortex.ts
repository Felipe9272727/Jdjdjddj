import { planoDaProsa } from './floor10Prosa';
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

/**
 * ── DIREÇÕES RELATIVAS AO CORPO ───────────────────────────────────────────
 *
 * O dono do jogo descrevendo o desenho que ele quer:
 *
 *   "vamos supor que a vontade quer fazer algo que não tenha na choice, como
 *    pular, ou explorar... o lfm fala, vou andar 5 passos a esquerda, e o motor
 *    traduz em movimento, a vontade vai ficar jogando como se fosse um RPG de
 *    texto"
 *
 * "5 passos à esquerda" não era EXPRIMÍVEL. Os alvos eram todos absolutos
 * (player, elevator, north-side…), então a única forma de o Nilo ir para a
 * esquerda era existir alguma COISA à esquerda dele. Um corpo que só sabe ir
 * até objetos não anda pela sala, ele pula de âncora em âncora — e isso é parte
 * do "rondando de um lado pro outro".
 *
 * Estes quatro se resolvem contra o `yaw` dele no instante do passo, que é o
 * que faz "esquerda" significar a esquerda DELE e não a do mapa.
 */
export const FLOOR10_MOTOR_RELATIVE = [
    'ahead', 'behind', 'to-my-left', 'to-my-right',
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
    ...FLOOR10_MOTOR_RELATIVE,
] as const;

/**
 * ── O MOTOR PASSA A DIZER A INTENÇÃO, E NÃO SÓ O MOVIMENTO ────────────────
 *
 * Medido no caminho real do jogo, duas rodadas em que a vontade e o motor
 * responderam sobre o MESMO pensamento:
 *
 *     vontade: approach-player   motor: stay | self
 *     vontade: inspect-elevator  motor: stay | self
 *
 * Pela regra de inferência (`metaDoPlanoMotor`), `stay + self` vira `idle`. Ou
 * seja: quando a linha CHOICE faltasse e a meta viesse do motor, o Nilo ficaria
 * PARADO onde ele queria se aproximar. A ideia do dono do jogo — "o motor
 * serviria justamente pra não ficar dependendo do choice" — está certa; a minha
 * primeira execução dela é que era um canal com perda, porque o prompt do motor
 * pergunta COMO ELE SE MOVE e eu tentei ler DALI o que ele QUER.
 *
 * O conserto é pedir as duas coisas. A saída já é presa por gramática, então
 * acrescentar a meta não abre espaço para invenção: o modelo escolhe entre as
 * oito, e não escreve mais nada.
 *
 * A lista vive AQUI, e não é importada de floor10Deliberation, porque aquele
 * módulo importa o tipo daqui — importar de volta fecharia um ciclo. Um teste
 * garante que as duas listas continuem iguais.
 */
export const FLOOR10_MOTOR_GOALS = [
    'inspect-elevator', 'wander', 'idle', 'observe-player',
    'approach-player', 'make-space', 'seek-player', 'talk-player',
] as const;

/**
 * ── O QUE ELE FAZ QUE NÃO É ANDAR ─────────────────────────────────────────
 *
 * Fechando o desenho dele:
 *
 *   "vamos supor que a vontade quer fazer algo que não tenha na choice, como
 *    pular, ou explorar"
 *
 * O motor só sabia falar de DESLOCAMENTO: seis verbos que são todos formas de
 * ir e vir. "Encostar o ouvido na porta", "bater na parede", "pular" não
 * existiam em lugar nenhum — nem no vocabulário, nem no corpo. Um personagem
 * que só translada não age sobre o mundo, ele passeia por ele.
 *
 * A LISTA É CURTA DE PROPÓSITO, e a régua foi: só entra o que a SALA permite.
 * Não há janela para abrir, não há objeto para pegar. Um vocabulário maior que
 * o mundo é um convite à alucinação — o modelo pediria coisas impossíveis e o
 * corpo teria de recusar, que é pior que nunca ter oferecido.
 *
 * `none` existe e é o normal: a maior parte das rodadas é só movimento, e
 * forçar um gesto a cada rodada faria o Nilo parecer um autômato de tiques.
 */
export const FLOOR10_MOTOR_ACTS = [
    'none',
    'listen',      // encostar o ouvido — o gesto do homem preso, e o mais dele
    'touch',       // pôr a mão em algo
    'knock',       // bater, chamar atenção da matéria
    'crouch',      // abaixar-se para olhar de perto
    'jump',        // literalmente o exemplo dele
    'look-around', // varrer a sala com os olhos, sem sair do lugar
    'wave',        // um gesto para o jogador
] as const;

export type Floor10MotorAct = (typeof FLOOR10_MOTOR_ACTS)[number];

export const FLOOR10_MOTOR_PACES = ['slow', 'normal', 'fast'] as const;
export const FLOOR10_MOTOR_DURATIONS = [3, 6, 9, 12] as const;

export type Floor10MotorVerb = (typeof FLOOR10_MOTOR_VERBS)[number];
export type Floor10MotorTarget = (typeof FLOOR10_MOTOR_TARGETS)[number];
export type Floor10MotorPace = (typeof FLOOR10_MOTOR_PACES)[number];
export type Floor10MotorDuration = (typeof FLOOR10_MOTOR_DURATIONS)[number];

export type Floor10MotorPlan = {
    /**
     * O gesto que acompanha o movimento. `none` na maioria das rodadas — ver
     * FLOOR10_MOTOR_ACTS. Opcional para respostas antigas continuarem válidas.
     */
    act?: Floor10MotorAct;
    /** Sobre o que o gesto é feito. Só faz sentido com `act` diferente de none. */
    actTarget?: Floor10MotorTarget;
    /**
     * A intenção que o motor leu no pensamento. Opcional porque respostas
     * antigas (e o caminho sem gramática) não a trazem — quem consome cai na
     * inferência por verbo+alvo.
     */
    goal?: MetaDoMotor;
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
        // ── AS RELATIVAS PRECISAM ESTAR AQUI, E NÃO ESTAVAM ──────────────
        //
        // Eu acrescentei `ahead/behind/to-my-left/to-my-right` a
        // FLOOR10_MOTOR_TARGETS e esta função monta a lista À MÃO. Resultado:
        // a gramática nunca as oferecia, e o motor não podia escolhê-las nem
        // querendo. O passo do "5 passos à esquerda" nasceu morto.
        //
        // Apareceu no aparelho dele, com o pensamento na tela:
        //     "I step sideways, left, toward the wall"  ->  sem plano motor
        // Ele disse exatamente a coisa que o vocabulário novo existe para
        // dizer, e o vocabulário não estava lá.
        //
        // Duas listas para a mesma coisa é como um vocabulário some sem
        // ninguém notar; um teste agora exige que esta contenha todas as
        // relativas.
        ...FLOOR10_MOTOR_RELATIVE,
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
    // ── O VETOR PODE ESTREITAR A LISTA ───────────────────────────────────
    // Quando o classificador por vetor já ranqueou os alvos, a gramática desta
    // rodada oferece só os melhores. É o que impede o colapso: com 12 opções o
    // modelo responde sempre a mesma (medido em 6 modelos de 5 famílias); com
    // 3 que VIERAM da frase, a mania dele não tem para onde fugir.
    //
    // A interseção com `availableMotorTargets` é obrigatória — um alvo que os
    // olhos não veem não pode entrar só porque o vetor gostou dele.
    candidatos?: readonly Floor10MotorTarget[],
): string {
    const disponiveis = availableMotorTargets(perception, prison);
    const estreitado = candidatos?.filter((c) => disponiveis.includes(c)) ?? [];
    const targets = estreitado.length > 0 ? estreitado : disponiveis;
    // ── A QUEBRA DE LINHA PRECISA CHEGAR ESCAPADA NA GBNF ────────────────
    // Escrito como `"\nMOTION: "` dentro de um template literal, o `\n` vira
    // uma quebra de linha DE VERDADE no runtime — e um literal da GBNF não pode
    // conter quebra crua. A gramática ficava malformada e `createChatCompletion`
    // estourava; o `catch` do motor devolvia `null` e o jogo perdia a tradução
    // EM SILÊNCIO. Medido: `motor: null` nas 3 rodadas, onde antes vinha
    // `stay | self`. Um erro que nenhum teste de string pegava, porque a string
    // parecia certa — quem reprovava era o parser da GBNF, dentro do worker.
    // ── A META SAIU DA GRAMÁTICA, E A MEDIÇÃO MANDOU ─────────────────────
    //
    // Eu pus `GOAL:` aqui para o motor declarar a intenção em vez de eu
    // inferi-la do par verbo+alvo. A bancada, com os pensamentos REAIS do
    // aparelho dele, derrubou a ideia:
    //
    //     Qwen3, GOAL primeiro ....... approach-player em 5 de 7
    //     Qwen3, MOTION primeiro ..... inspect-elevator em 7 de 7
    //     LFM2-700M .................. observe-player na maioria
    //
    // Inverter a ordem não consertou: só trocou QUAL rótulo ele repete. Esses
    // modelos não escolhem entre oito rótulos de intenção — travam num e
    // repetem. E era exatamente isso que aparecia na tela dele: cinco rodadas
    // seguidas de `approach-player`.
    //
    // O MOVIMENTO, esse eles acertam: 4 de 7 e zero proibidos no Qwen3, com os
    // alvos difíceis certos (`north-side` para "the north wall", `west-side`
    // para "five steps to my left").
    //
    // Então o motor volta a fazer UMA coisa, a que ele faz bem, e a meta passa
    // a ser CALCULADA do par verbo+alvo — determinística, correta por
    // construção, e de graça. `approach+player` é approach-player; nenhum
    // modelo precisa adivinhar isso.
    //
    // (A razão de eu ter posto o GOAL aqui foi o motor responder `stay|self` a
    // um pensamento de aproximação — mas aquilo era o movimento errado, e o
    // conserto foi no PROMPT. Consertei o sintoma no lugar errado e a medição
    // me devolveu ao lugar certo.)
    return `root ::= "MOTION: " verb " | " target " | " pace " | " duration "\\nACT: " act " | " target
act ::= ${FLOOR10_MOTOR_ACTS.map((value) => `"${value}"`).join(' | ')}
verb ::= ${FLOOR10_MOTOR_VERBS.map((value) => `"${value}"`).join(' | ')}
target ::= ${targets.map((value) => `"${value}"`).join(' | ')}
pace ::= ${FLOOR10_MOTOR_PACES.map((value) => `"${value}"`).join(' | ')}
duration ::= ${FLOOR10_MOTOR_DURATIONS.map((value) => `"${value}"`).join(' | ')}`;
}

/** Lê sempre a última tradução, caso o modelo tenha se corrigido. */
export function parseMotorPlan(raw: string): Floor10MotorPlan | null {
    const matches = [...raw.matchAll(MOTOR_PATTERN)];
    const match = matches.at(-1);
    // ── QUANDO O ESTRITO RECUSA, A PROSA SALVA ────────────────────────────
    //
    // `MOTOR_PATTERN` exige as palavras do enum exatas. Solto da gramática, o
    // modelo escreve natural — medido, saída real do Qwen3:
    //
    //     MOTION: walk | him | slow | 3
    //
    // Leitura PERFEITA de "I walk right up to him", recusada pelo parser
    // porque `walk` não é `approach` e `him` não é `player`. O tradutor de
    // prosa (floor10Prosa) faz esse mapeamento e é testado contra saídas reais
    // — mas estava ÓRFÃO: 21 testes verdes e ninguém o chamava. Exatamente a
    // armadilha de código morto que eu venho apontando nesta base, agora
    // cometida por mim.
    //
    // O import é adiado (`await import`) não daria: esta função é síncrona.
    // Como `floor10Prosa` importa só TIPOS deste arquivo, não há ciclo em
    // tempo de execução.
    if (!match) return planoDaProsa(raw);
    const duration = Number(match[4]);
    if (!(FLOOR10_MOTOR_DURATIONS as readonly number[]).includes(duration)) return null;
    // A meta vem ANTES do MOTION na gramática; sem ela (respostas antigas, ou
    // um caminho sem gramática) quem consome cai na inferência por verbo+alvo.
    const metaCrua = /GOAL:\s*([a-z-]+)/i.exec(raw)?.[1]?.toLowerCase();
    // O gesto é opcional em toda a cadeia: respostas antigas, o caminho sem
    // gramática e o `none` (que é o normal) chegam todos aqui como ausência.
    const atoCru = /ACT:\s*([a-z-]+)\s*\|\s*([a-z-]+)/i.exec(raw);
    const ato = (FLOOR10_MOTOR_ACTS as readonly string[]).includes(atoCru?.[1]?.toLowerCase() ?? '')
        ? atoCru![1].toLowerCase() as Floor10MotorAct
        : undefined;
    const atoAlvo = (FLOOR10_MOTOR_TARGETS as readonly string[])
        .includes(atoCru?.[2]?.toLowerCase() ?? '')
        ? atoCru![2].toLowerCase() as Floor10MotorTarget
        : undefined;
    const goal = (FLOOR10_MOTOR_GOALS as readonly string[]).includes(metaCrua ?? '')
        ? metaCrua as MetaDoMotor
        : undefined;
    return {
        ...(goal ? { goal } : {}),
        ...(ato && ato !== 'none' ? { act: ato, actTarget: atoAlvo } : {}),
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
        'I should stay still and listen. => MOTION: stay | self | slow | 3 / ACT: listen | elevator',
        'I want to cross toward the right wall. => MOTION: explore | east-side | normal | 6 / ACT: none | self',
        perception.player
            ? 'I want to get closer to him. => MOTION: approach | player | normal | 6 / ACT: wave | player'
            : 'I want another angle on the door. => MOTION: orbit | elevator | slow | 6',
        prison
            ? 'I should keep my weight on that thing. => MOTION: hold | nearest-device | slow | 9'
            : null,
    ].filter(Boolean).join('\n');
    return `Read Nilo's own thought and report TWO things: one feasible body movement,
and one gesture he makes (or none).
Do not invent a new desire and do not solve the room for him.
GESTURES: ${FLOOR10_MOTOR_ACTS.join(', ')}. Use none when his thought is only movement.
AVAILABLE TARGETS: ${targets}.
Map his words to a target: a wall is that side of the room (the west wall is west-side);
"left"/"right"/"forward"/"back" without a landmark are to-my-left / to-my-right / ahead / behind.
If he says he MOVES, never answer stay — pick the verb and target that carry him there.
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
MOTION: <verb> | <target> | <pace> | <duration>
ACT: <gesture> | <target>`;
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
    // As relativas dizem respeito ao CORPO dele, e por isso a tradução em
    // português é possessiva: é a esquerda do Nilo, não a do mapa.
    ahead: 'para a frente',
    behind: 'para trás',
    'to-my-left': 'para a minha esquerda',
    'to-my-right': 'para a minha direita',
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

// ── O MOTOR PODE DAR A META, E NÃO SÓ O MOVIMENTO ─────────────────────────
//
// O desenho é do dono do jogo, e ele o disse assim:
//
//   "o motor serviria justamente pra não ficar dependendo do 'choice' e a gente
//    está procurando velocidade e inteligência"
//
// Ele está certo, e o código estava fazendo o contrário. O fluxo era:
//
//     pensamento -> tem "CHOICE: x"?  -> sim: decidiu, e AÍ o motor traduz
//                                     -> não: RESGATE (outra geração do 1.2B)
//                                              -> falhou: joga a rodada fora
//
// Ou seja: o motor ficava ATRÁS do portão do CHOICE em vez de no lugar dele. Um
// pensamento bom que não terminasse na linha certa era descartado inteiro —
// mesmo com um tradutor de 0,6B, preso por gramática, pronto para lê-lo.
//
// O que isso custava, medido:
//   - o resgate é uma geração COMPLETA do modelo grande: 13,7 s a cada 5
//     rodadas na bancada, e ele roda em 3 de 5 rodadas com o Llama;
//   - com o LFM2.5, que pensa em `<think>` por padrão, a linha CHOICE
//     frequentemente não chega dentro do orçamento — e a rodada morria. É o
//     "thinking infinito" que ele viu no aparelho.
//
// E fazia a ESCOLHA DE MODELO ser decidida pela métrica errada: eu comparei
// candidatos por "assina a linha de primeira", que é uma exigência do
// andaime, não da inteligência do NPC.
//
// A TRADUÇÃO É DIRETA porque os dois vocabulários foram desenhados para o mesmo
// mundo. O que o motor já devolve (verbo + alvo, preso por gramática) determina
// a meta em quase todos os pares:
//
//     approach + player     -> approach-player
//     withdraw + player     -> make-space
//     hold/orbit + player   -> observe-player
//     * + elevator          -> inspect-elevator
//     explore + lugar       -> wander
//     stay/hold + self      -> idle
//
// O QUE ESTA FUNÇÃO NÃO RESOLVE, e é honesto dizer: o motor é preso por
// gramática, então ele SEMPRE devolve um par válido. Um pensamento confuso vira
// uma meta confiante em vez de virar nada. A troca é aceitar uma decisão
// possivelmente ruim no lugar de uma rodada perdida — e para um NPC que precisa
// se mexer, agir errado de vez em quando é melhor que congelar.
export type MetaDoMotor =
    | 'inspect-elevator' | 'wander' | 'idle' | 'observe-player'
    | 'approach-player' | 'make-space' | 'seek-player' | 'talk-player';

/** Lugares do andar: alvo de deslocamento que não é pessoa nem máquina. */
const LUGARES = new Set<Floor10MotorTarget>([
    'room-center', 'north-side', 'south-side', 'east-side', 'west-side',
]);

/**
 * A meta que este plano motor implica. Pura: é a regra inteira, e ela precisa
 * ser lida e testada sem subir modelo nenhum.
 */
export function metaDoPlanoMotor(plano: Floor10MotorPlan): MetaDoMotor {
    // A meta DECLARADA pelo motor manda: ela sai do pensamento inteiro, e não
    // de um par verbo+alvo que descreve só o corpo. A inferência abaixo é a
    // rede para quando ela não veio.
    if (plano.goal) return plano.goal;
    const { verb, target } = plano;
    // O elevador manda no resto: qualquer movimento em direção a ele é a mesma
    // intenção, e é a única meta do andar ligada a um objeto específico.
    if (target === 'elevator') return 'inspect-elevator';
    if (target === 'player') {
        if (verb === 'approach') return 'approach-player';
        if (verb === 'withdraw') return 'make-space';
        // hold, orbit, explore, stay perto do jogador: está de olho, não age.
        return 'observe-player';
    }
    if (target === 'self') return 'idle';
    // Máquinas do andar são "coisa para examinar"; o jogo não tem meta própria
    // para elas, e vagar é o comportamento que mais se aproxima de investigar
    // sem prometer nada.
    if (target === 'nearest-device' || target === 'active-device') return 'wander';
    // ── AS RELATIVAS CAÍAM NO `idle`, E ISSO CUSTAVA A DECISÃO SEGUINTE ──
    //
    // `ahead`, `behind`, `to-my-left` e `to-my-right` não estavam em lista
    // nenhuma aqui: as 24 combinações verbo×alvo-relativo desciam até o
    // `return 'idle'` do fim. Ou seja, "cinco passos à esquerda" — o recurso
    // que existe justamente para o Nilo ANDAR pela sala — era rotulado como
    // "parado".
    //
    // E o rótulo não é enfeite: ele vira `deliberationBonus`, que dá +0,55 de
    // utilidade por 45 s ao candidato de mesma meta. Uma decisão de se deslocar
    // acabava empurrando o candidato de FICAR QUIETO. O motor mandava andar e a
    // deliberação, no lance seguinte, era subornada a não andar.
    //
    // A regra é a mesma dos lugares fixos, e usa a lista que o próprio módulo
    // exporta em vez de uma cópia — foi a falta de uma lista compartilhada que
    // deixou estas quatro de fora.
    const relativa = (FLOOR10_MOTOR_RELATIVE as readonly string[]).includes(target);
    if (LUGARES.has(target) || relativa) {
        // Parar num canto é ficar quieto; ir até ele é vagar.
        return verb === 'stay' || verb === 'hold' ? 'idle' : 'wander';
    }
    return 'idle';
}
