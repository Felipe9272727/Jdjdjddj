import type { Floor10Perception, Vec3Like } from './floor10Perception';
import { readClock, stepDrives, type Floor10Clock } from './floor10Drives';
import {
    PRISON_DEVICES, PRISON_REACH, prisonSenses, type F10PrisonState,
} from './f10Prison';
import { deliberationBonus, type Floor10Deliberation } from './floor10Deliberation';
import {
    FLOOR10_RL_ACTIONS,
    FLOOR10_RL_BODY_STATE_SIZE,
    FLOOR10_RL_STATE_SIZE,
    Floor10ReinforcementLearner,
    INITIAL_FLOOR10_REINFORCEMENT,
    type Floor10ReinforcementSnapshot,
    type Floor10RlAction,
} from './floor10Reinforcement';

// ── A VONTADE DO HÓSPEDE ───────────────────────────────────────────────────
// "Livre-arbítrio" de gameplay: um agente de Utility AI separado dos olhos e
// do LLM. Nilo mantém desejos contínuos, memória de curto prazo, personalidade
// e custos de repetição. A cada decisão ele compara ações possíveis e escolhe
// a que mais atende ao que quer naquele instante — não uma sequência roteirizada.
//
// O cérebro de fala continua responsável por conversa aberta. Esta micro-IA decide e age
// mesmo sem chat, sem download adicional e sem bloquear o jogo.

export type Floor10WillGoal =
    | 'idle'
    | 'wait'
    | 'wander'
    | 'inspect-elevator'
    | 'enter-elevator'
    | 'approach-player'
    | 'follow-player'
    | 'seek-player'
    | 'observe-player'
    | 'make-space'
    | 'talk-player'
    // As duas da PRISÃO. Ele não sabe para que servem: descobrir é com ele.
    | 'try-device'
    | 'call-player';

export type Floor10WillDrives = {
    social: number;
    curiosity: number;
    restlessness: number;
    fatigue: number;
};

export type Floor10WillCommitment = 'follow-player' | null;
export type Floor10WillCommandAction =
    | 'follow-player'
    | 'resume-autonomy'
    | 'approach-player'
    | 'wait'
    | 'inspect-elevator'
    | 'enter-elevator'
    | 'explore-room'
    | 'make-space'
    | 'observe-player';

export type Floor10WillCommand = {
    id: number;
    action: Floor10WillCommandAction;
    reason: string;
};

export type Floor10WillSnapshot = {
    source: 'floor10-utility-will';
    decisionId: number;
    goal: Floor10WillGoal;
    label: string;
    reason: string;
    target: null | { x: number; z: number };
    moving: boolean;
    commitment: Floor10WillCommitment;
    commitmentReason: string | null;
    activeDirective: Floor10WillCommandAction | null;
    activeDirectiveReason: string | null;
    drives: Floor10WillDrives;
    learning: Floor10ReinforcementSnapshot;
};

export type Floor10WillTick = {
    snapshot: Floor10WillSnapshot;
    speech?: string;
};

type WillInput = {
    dt: number;
    time: number;
    perception: Floor10Perception;
    npcPosition: Vec3Like;
    conversationOpen: boolean;
    speaking: boolean;
    /**
     * Intenção madurada pela DELIBERAÇÃO (o modelo pequeno pensando por fora).
     * Chega quando fica pronta e apenas INCLINA a escolha: se a situação mudou,
     * o reflexo continua livre para preferir outra coisa.
     */
    deliberation?: Floor10Deliberation | null;
    /**
     * A sala trancada. Opcional: sem ela o Nilo continua sendo o que sempre
     * foi, e nenhuma das duas metas novas chega a ser considerada.
     */
    prison?: F10PrisonState | null;
};

type Candidate = {
    goal: Floor10WillGoal;
    utility: number;
    target: Floor10WillSnapshot['target'];
    reason: string;
};

type ActiveDirective = {
    action: Exclude<Floor10WillCommandAction, 'follow-player' | 'resume-autonomy'>;
    issuedAt: number;
    expiresAt: number;
    target: Floor10WillSnapshot['target'];
    reason: string;
    completed: boolean;
};

type LearningDecision = {
    state: Float32Array;
    action: Floor10RlAction;
    startedAt: number;
    playerDistance: number | null;
    elevatorDistance: number;
    targetDistance: number | null;
    restlessness: number;
    fatigue: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function isFloor10RlAction(goal: Floor10WillGoal): goal is Floor10RlAction {
    return (FLOOR10_RL_ACTIONS as readonly string[]).includes(goal);
}

const GOAL_LABEL: Record<Floor10WillGoal, string> = {
    idle: 'ficar em silêncio por um instante',
    wait: 'esperar aqui',
    wander: 'explorar a sala',
    'inspect-elevator': 'examinar o elevador',
    'enter-elevator': 'entrar no elevador',
    'approach-player': 'me aproximar de você',
    'follow-player': 'seguir você',
    'seek-player': 'procurar você',
    'observe-player': 'observar você',
    'make-space': 'abrir um pouco de espaço',
    'talk-player': 'falar com você',
    'try-device': 'mexer naquilo outra vez',
    'call-player': 'te chamar aqui',
};

const GOAL_LABEL_EN: Record<Floor10WillGoal, string> = {
    idle: 'stay quiet for a moment',
    wait: 'wait here',
    wander: 'explore the room',
    'inspect-elevator': 'inspect the elevator',
    'enter-elevator': 'enter the elevator',
    'approach-player': 'come closer to you',
    'follow-player': 'follow you',
    'seek-player': 'look for you',
    'observe-player': 'observe you',
    'make-space': 'give you some space',
    'talk-player': 'talk to you',
    'try-device': 'go poke at that thing again',
    'call-player': 'call you over here',
};

const GOAL_LABEL_ES: Record<Floor10WillGoal, string> = {
    idle: 'quedarme en silencio un momento',
    wait: 'esperar aquí',
    wander: 'explorar la sala',
    'inspect-elevator': 'examinar el ascensor',
    'enter-elevator': 'entrar en el ascensor',
    'approach-player': 'acercarme a ti',
    'follow-player': 'seguirte',
    'seek-player': 'buscarte',
    'observe-player': 'observarte',
    'make-space': 'darte un poco de espacio',
    'talk-player': 'hablar contigo',
    'try-device': 'volver a tocar esa cosa',
    'call-player': 'llamarte aquí',
};

const AUTONOMOUS_LINES = [
    'Ei… você consegue me ouvir? O silêncio daqui começa a parecer outra parede.',
    'Desculpa te abordar assim. Você foi a primeira coisa nova que apareceu aqui em muito tempo.',
    'Você chegou pelo elevador, né? Ele nunca costuma obedecer quando eu estou sozinho.',
    'Eu estava tentando decidir se investigava a porta de novo. Acho que prefiro falar com você.',
    'Não quero te assustar. Só precisava confirmar que eu não estava sozinho nesta sala.',
] as const;

function distanceXZ(a: Pick<Vec3Like, 'x' | 'z'>, b: Pick<Vec3Like, 'x' | 'z'>): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function drivesCopy(drives: Floor10WillDrives): Floor10WillDrives {
    return {
        social: drives.social,
        curiosity: drives.curiosity,
        restlessness: drives.restlessness,
        fatigue: drives.fatigue,
    };
}

export const INITIAL_FLOOR10_WILL: Floor10WillSnapshot = {
    source: 'floor10-utility-will',
    decisionId: 0,
    goal: 'idle',
    label: GOAL_LABEL.idle,
    reason: 'estou entendendo o que existe ao meu redor',
    target: null,
    moving: false,
    commitment: null,
    commitmentReason: null,
    activeDirective: null,
    activeDirectiveReason: null,
    drives: {
        social: 0.62,
        curiosity: 0.68,
        restlessness: 0.42,
        fatigue: 0.08,
    },
    learning: { ...INITIAL_FLOOR10_REINFORCEMENT },
};

/**
 * Agente persistente e reproduzível. O ruído serve só para desempatar desejos;
 * a escolha continua explicável pelos scores, percepção e memória.
 */
export class Floor10WillBrain {
    private randomState: number;
    private drives: Floor10WillDrives = drivesCopy(INITIAL_FLOOR10_WILL.drives);
    private snapshot: Floor10WillSnapshot = {
        ...INITIAL_FLOOR10_WILL,
        drives: drivesCopy(INITIAL_FLOOR10_WILL.drives),
        learning: { ...INITIAL_FLOOR10_WILL.learning },
    };
    /** Recompensa acumulada pelos eventos da sala desde a última rodada. */
    private externalReward = 0;
    private driftSeconds = 0;
    private clock: Floor10Clock = readClock();
    private nextDecisionAt = 0;
    private goalLockedUntil = 0;
    private speechCooldown = 0;
    private lastSeenPlayer: { x: number; z: number; at: number } | null = null;
    private lastGoal: Floor10WillGoal = 'idle';
    private lastAutonomousLine = -1;
    private commitment: Floor10WillCommitment = null;
    private commitmentReason: string | null = null;
    private activeDirective: ActiveDirective | null = null;
    private reinforcement: Floor10ReinforcementLearner;
    private learningDecision: LearningDecision | null = null;

    constructor(seed?: number) {
        if (seed === undefined) {
            const entropy = new Uint32Array(1);
            if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(entropy);
            else entropy[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
            seed = entropy[0] ^ 0x4e494c4f;
        }
        this.randomState = seed >>> 0;
        this.reinforcement = new Floor10ReinforcementLearner({
            seed: (seed ^ 0x524c4e49) >>> 0,
        });
        this.snapshot.learning = this.reinforcement.snapshot();
    }

    /**
     * Recebe apenas compromissos que o cérebro de fala aceitou explicitamente.
     * A ordem do jogador, sozinha, nunca chega aqui.
     */
    applyLanguageDecision(
        action: Floor10WillCommandAction,
        time: number,
        languageReason = '',
    ): Floor10WillSnapshot {
        const reason = languageReason.replace(/\s+/g, ' ').trim().slice(0, 180)
            || 'Nilo aceitou verbalmente.';
        if (action === 'follow-player') {
            this.commitment = 'follow-player';
            this.commitmentReason = reason;
            this.activeDirective = null;
        } else if (action === 'resume-autonomy') {
            this.commitment = null;
            this.commitmentReason = null;
            this.activeDirective = null;
        } else {
            const duration = action === 'wait' || action === 'observe-player'
                ? 8
                : action === 'explore-room'
                    ? 14
                    : 12;
            this.activeDirective = {
                action,
                issuedAt: time,
                expiresAt: time + duration,
                target: null,
                reason,
                completed: false,
            };
        }
        this.goalLockedUntil = time;
        this.nextDecisionAt = time;
        this.snapshot = {
            ...this.snapshot,
            decisionId: this.snapshot.decisionId + 1,
            commitment: this.commitment,
            commitmentReason: this.commitmentReason,
            activeDirective: this.activeDirective?.action ?? null,
            activeDirectiveReason: this.activeDirective?.reason ?? null,
            reason: action === 'follow-player'
                ? 'eu aceitei acompanhar você e quero cumprir o que disse'
                : action === 'resume-autonomy'
                    ? 'eu concordei em cancelar o compromisso e voltei a escolher livremente'
                    : `eu aceitei um pedido físico e decidi cumpri-lo: ${reason}`,
        };
        return this.snapshot;
    }

    private random(): number {
        // xorshift32: barato, determinístico e suficiente para personalidade.
        let x = this.randomState || 0x6d2b79f5;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.randomState = x >>> 0;
        return this.randomState / 0x100000000;
    }

    /**
     * O RELÓGIO INTERNO. Antes isto aqui só somava: social +0,014/s, curiosity
     * +0,007/s, para sempre. Saindo de 0,62, a carência social encostava em 1,0
     * em meio minuto e MORAVA lá — a tabela de utilidade passava a devolver
     * sempre a mesma ordem e o Nilo virava um homem de humor único. Era o "as
     * vontades dele são fixas".
     *
     * Agora quem manda é floor10Drives: linha de base que muda com a HORA do
     * dia, homeostase puxando de volta, e a ação em curso esvaziando o desejo
     * que ela serve. Ver o jogador não soma mais nada — move o alvo.
     */
    private updateDrives(dt: number, perception: Floor10Perception) {
        const safeDt = clamp(dt, 0, 0.25);
        this.driftSeconds += safeDt;
        this.clock = readClock();
        this.drives = stepDrives(this.drives, {
            hour: this.clock.hour,
            playerVisible: !!perception.player?.visible,
            elevatorVisible: perception.elevator.visible,
            moving: this.snapshot.moving,
            goal: this.snapshot.goal,
            driftSeconds: this.driftSeconds,
        }, safeDt);
        this.speechCooldown = Math.max(0, this.speechCooldown - safeDt);
    }

    /** A hora que o Nilo está vivendo agora — vai para o prompt e para a UI. */
    currentClock(): Floor10Clock {
        return this.clock;
    }

    private setGoal(candidate: Candidate, time: number, lockSeconds: number): Floor10WillSnapshot {
        this.lastGoal = this.snapshot.goal;
        this.snapshot = {
            source: 'floor10-utility-will',
            decisionId: this.snapshot.decisionId + 1,
            goal: candidate.goal,
            label: GOAL_LABEL[candidate.goal],
            reason: candidate.reason,
            target: candidate.target,
            moving: candidate.target !== null,
            commitment: this.commitment,
            commitmentReason: this.commitmentReason,
            activeDirective: this.activeDirective?.action ?? null,
            activeDirectiveReason: this.activeDirective?.reason ?? null,
            drives: drivesCopy(this.drives),
            learning: this.reinforcement.snapshot(),
        };
        this.goalLockedUntil = time + lockSeconds;
        this.nextDecisionAt = time + 1.4 + this.random() * 1.7;
        return this.snapshot;
    }

    private safeTarget(x: number, z: number): { x: number; z: number } {
        const clampedZ = clamp(z, -15.1, 19.5);
        // Dentro do poço/cabine, mantém o corpo entre as paredes laterais.
        const clampedX = clampedZ < -9.2 ? clamp(x, -2.65, 2.65) : clamp(x, -19.5, 19.5);
        return { x: clampedX, z: clampedZ };
    }

    private wanderTarget(position: Vec3Like): { x: number; z: number } {
        const angle = this.random() * Math.PI * 2;
        const radius = 4 + this.random() * 8;
        // Passeio espontâneo fica na sala; entrar no elevador exige uma razão.
        return this.safeTarget(
            position.x + Math.sin(angle) * radius,
            clamp(position.z + Math.cos(angle) * radius, -8.2, 18.5),
        );
    }

    private makeSpaceTarget(position: Vec3Like, player: { position: Vec3Like }): { x: number; z: number } {
        let dx = position.x - player.position.x;
        let dz = position.z - player.position.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) {
            const angle = this.random() * Math.PI * 2;
            dx = Math.sin(angle);
            dz = Math.cos(angle);
        } else {
            dx /= length;
            dz /= length;
        }
        return this.safeTarget(position.x + dx * 2.2, position.z + dz * 2.2);
    }

    private goalReached(position: Vec3Like, perception: Floor10Perception): boolean {
        if (this.snapshot.goal === 'approach-player') {
            return !!perception.player && perception.player.distance <= 1.9;
        }
        if (!this.snapshot.target) return false;
        return distanceXZ(position, this.snapshot.target) <= 0.32;
    }

    private onArrival() {
        if (this.snapshot.goal === 'wander') {
            this.drives.restlessness = clamp01(this.drives.restlessness - 0.22);
        } else if (this.snapshot.goal === 'inspect-elevator') {
            this.drives.curiosity = clamp01(this.drives.curiosity - 0.2);
            this.drives.restlessness = clamp01(this.drives.restlessness - 0.08);
        } else if (this.snapshot.goal === 'seek-player') {
            this.lastSeenPlayer = null;
        }
    }

    /**
     * Qual aparelho ele vai cutucar agora.
     *
     * NÃO é "o que resolve": é o mais perto entre os que ele não está pisando.
     * Nenhuma pista da regra mora aqui — a preferência por um ou outro é
     * trabalho da rede, que aprende olhando o que acontece depois.
     */
    private deviceToTry(
        prison: F10PrisonState,
        from: Vec3Like,
    ): { x: number; z: number } | null {
        // FICAR é parte de tentar. Eu tinha escrito `if (device.heldByNpc)
        // continue`, ou seja: assim que ele pisava em algo, o alvo virava OUTRO
        // aparelho e ele saía de cima. Medido na bancada — os dois chegaram a
        // estar nas alavancas ao mesmo tempo e a tranca começou a ceder (0.09
        // de 1), mas ele ia embora antes dos 4s. Ninguém aprende cooperação
        // saindo no primeiro segundo.
        const jaEmCima = Object.values(prison.devices).find((d) => d.heldByNpc);
        if (jaEmCima) return { x: jaEmCima.x, z: jaEmCima.z };
        let melhor: { x: number; z: number } | null = null;
        let menor = Infinity;
        for (const device of Object.values(prison.devices)) {
            const d = Math.hypot(from.x - device.x, from.z - device.z);
            if (d < menor) {
                menor = d;
                melhor = { x: device.x, z: device.z };
            }
        }
        return melhor;
    }

    private reinforcementState(input: WillInput): Float32Array {
        const state = new Float32Array(FLOOR10_RL_STATE_SIZE);
        const player = input.perception.player;
        state[0] = this.drives.social;
        state[1] = this.drives.curiosity;
        state[2] = this.drives.restlessness;
        state[3] = this.drives.fatigue;
        state[4] = player ? 1 : 0;
        state[5] = player?.visible ? 1 : 0;
        state[6] = player ? 1 - clamp(player.distance / 18, 0, 1) : 0;
        state[7] = player && player.distance < 1.05 ? 1 : 0;
        state[8] = player && player.distance <= 2.6 ? 1 : 0;
        state[9] = input.perception.elevator.visible ? 1 : 0;
        state[10] = 1 - clamp(input.perception.elevator.distance / 30, 0, 1);
        state[11] = this.snapshot.moving ? 1 : 0;
        state[12] = input.conversationOpen || input.speaking ? 1 : 0;
        state[13] = this.commitment === 'follow-player' ? 1 : 0;
        state[14] = this.activeDirective ? 1 : 0;
        state[15] = this.lastSeenPlayer
            ? 1 - clamp((input.time - this.lastSeenPlayer.at) / 9, 0, 1)
            : 0;
        if (isFloor10RlAction(this.snapshot.goal)) {
            state[FLOOR10_RL_BODY_STATE_SIZE + FLOOR10_RL_ACTIONS.indexOf(this.snapshot.goal)] = 1;
        }
        // O QUE ELE SENTE DA PRISÃO. Sem isto a rede não teria como ligar "o
        // zumbido começou" a "não estávamos sozinhos" — e a cooperação nunca
        // sairia de uma coincidência.
        if (input.prison) {
            const sentidos = prisonSenses(input.prison);
            const base = FLOOR10_RL_BODY_STATE_SIZE + FLOOR10_RL_ACTIONS.length;
            for (let i = 0; i < sentidos.length && base + i < state.length; i += 1) {
                state[base + i] = sentidos[i];
            }
        }
        return state;
    }

    private learningReward(decision: LearningDecision, input: WillInput): number {
        const playerDistance = input.perception.player?.distance ?? null;
        const targetDistance = this.snapshot.target
            ? distanceXZ(input.npcPosition, this.snapshot.target)
            : null;
        const targetProgress = decision.targetDistance !== null && targetDistance !== null
            ? clamp((decision.targetDistance - targetDistance) / 4, -1, 1)
            : 0;
        const playerProgress = decision.playerDistance !== null && playerDistance !== null
            ? clamp((decision.playerDistance - playerDistance) / 4, -1, 1)
            : 0;
        const elevatorProgress = clamp(
            (decision.elevatorDistance - input.perception.elevator.distance) / 5,
            -1,
            1,
        );
        let reward = -0.025;

        if (decision.action === 'idle') {
            reward += clamp((decision.fatigue - this.drives.fatigue) * 1.2, -0.3, 0.5);
            if (decision.fatigue >= 0.45) reward += 0.2;
        } else if (decision.action === 'wander') {
            reward += targetProgress * 0.45;
            reward += clamp((decision.restlessness - this.drives.restlessness) * 1.1, -0.3, 0.55);
        } else if (decision.action === 'inspect-elevator') {
            reward += elevatorProgress * 0.5;
            if (input.perception.elevator.distance <= 1.8) reward += 0.65;
        } else if (decision.action === 'approach-player') {
            reward += playerProgress * 0.55;
            if (playerDistance !== null && playerDistance <= 2.6) reward += 0.65;
            if (!input.perception.player) reward -= 0.25;
        } else if (decision.action === 'seek-player') {
            reward += targetProgress * 0.35;
            if (input.perception.player?.visible) reward += 0.85;
        } else if (decision.action === 'observe-player') {
            reward += input.perception.player?.visible ? 0.45 : -0.12;
            if (input.time - decision.startedAt >= 1) reward += 0.12;
        } else if (decision.action === 'make-space') {
            reward -= playerProgress * 0.35;
            if (playerDistance === null || playerDistance >= 1.3) reward += 0.85;
        } else if (decision.action === 'talk-player') {
            const closeAndVisible = input.perception.player?.visible
                && input.perception.player.distance <= 2.8;
            reward += closeAndVisible ? 0.72 : -0.35;
            reward += clamp((decision.restlessness - this.drives.restlessness) * 0.5, -0.2, 0.25);
        }
        return clamp(reward, -1.5, 1.5);
    }

    /**
     * Recompensa vinda do MUNDO, não da minha tabela.
     *
     * A tabela de learningReward sabe julgar "andei na direção do alvo" e
     * "descansei quando estava cansado" — coisas que eu escrevi. O que
     * acontece na prisão ela não tem como saber: quem diz que a tranca cedeu é
     * a sala. Isto entra somado à rodada de aprendizado em curso, e é por aqui
     * que a cooperação vira aprendizado de verdade.
     */
    addExternalReward(amount: number): void {
        if (!Number.isFinite(amount)) return;
        this.externalReward = clamp(this.externalReward + amount, -3, 3);
    }

    private settleLearning(input: WillInput, done = false): Float32Array {
        const nextState = this.reinforcementState(input);
        const previous = this.learningDecision;
        if (previous) {
            this.snapshot.learning = this.reinforcement.remember(
                previous.state,
                previous.action,
                this.learningReward(previous, input) + this.externalReward,
                nextState,
                done,
            );
            this.externalReward = 0;
            this.learningDecision = null;
        }
        return nextState;
    }

    private rememberLearningChoice(
        candidate: Candidate,
        input: WillInput,
        state: Float32Array,
    ) {
        if (!isFloor10RlAction(candidate.goal)) return;
        this.learningDecision = {
            state,
            action: candidate.goal,
            startedAt: input.time,
            playerDistance: input.perception.player?.distance ?? null,
            elevatorDistance: input.perception.elevator.distance,
            targetDistance: candidate.target
                ? distanceXZ(input.npcPosition, candidate.target)
                : null,
            restlessness: this.drives.restlessness,
            fatigue: this.drives.fatigue,
        };
    }

    private clearActiveDirective(time: number) {
        this.activeDirective = null;
        this.goalLockedUntil = time;
        this.nextDecisionAt = time;
        this.snapshot.activeDirective = null;
        this.snapshot.activeDirectiveReason = null;
    }

    private runActiveDirective(input: WillInput): Floor10WillSnapshot | null {
        const directive = this.activeDirective;
        if (!directive) return null;
        if (input.time >= directive.expiresAt) {
            this.clearActiveDirective(input.time);
            return null;
        }

        const player = input.perception.player;
        let goal: Floor10WillGoal;
        let target: Floor10WillSnapshot['target'] = null;
        let reason: string;

        if (directive.action === 'wait') {
            goal = 'wait';
            reason = 'eu aceitei esperar aqui por um momento';
        } else if (directive.action === 'observe-player') {
            goal = 'observe-player';
            reason = player?.visible
                ? 'eu aceitei observar você e estou prestando atenção'
                : 'eu aceitei observar você, mas agora não consigo vê-lo';
        } else if (directive.action === 'explore-room') {
            goal = 'wander';
            if (!directive.target || distanceXZ(input.npcPosition, directive.target) <= 0.4) {
                directive.target = this.wanderTarget(input.npcPosition);
            }
            target = directive.target;
            reason = 'eu aceitei explorar a sala e escolhi investigar este ponto';
        } else if (directive.action === 'inspect-elevator') {
            goal = 'inspect-elevator';
            directive.target ??= { x: 0, z: -8.35 };
            if (distanceXZ(input.npcPosition, directive.target) <= 0.42) directive.completed = true;
            target = directive.completed ? null : directive.target;
            reason = directive.completed
                ? 'eu aceitei examinar o elevador e cheguei até a entrada'
                : 'eu aceitei examinar o elevador e estou indo até a entrada';
        } else if (directive.action === 'enter-elevator') {
            goal = 'enter-elevator';
            directive.target ??= { x: 0, z: -12 };
            if (distanceXZ(input.npcPosition, directive.target) <= 0.42) directive.completed = true;
            target = directive.completed ? null : directive.target;
            reason = directive.completed
                ? 'eu aceitei entrar no elevador e já estou dentro da cabine'
                : 'eu aceitei entrar no elevador e estou atravessando a porta';
        } else if (directive.action === 'approach-player') {
            goal = 'approach-player';
            if (player && player.distance <= 1.9) directive.completed = true;
            if (!directive.completed && player) {
                target = this.safeTarget(player.position.x, player.position.z);
            } else if (!directive.completed && this.lastSeenPlayer) {
                target = this.safeTarget(this.lastSeenPlayer.x, this.lastSeenPlayer.z);
            }
            reason = directive.completed
                ? 'eu aceitei me aproximar e já estou perto o bastante'
                : 'eu aceitei me aproximar e estou indo até você';
        } else {
            goal = 'make-space';
            if (!player || player.distance >= 1.8) directive.completed = true;
            if (!directive.completed && player) {
                directive.target ??= this.makeSpaceTarget(input.npcPosition, player);
                target = directive.target;
            }
            reason = directive.completed
                ? 'eu aceitei abrir espaço e esta distância parece suficiente'
                : 'eu aceitei me afastar um pouco para abrir espaço';
        }

        const targetChanged = (
            !target && !!this.snapshot.target
        ) || (
            !!target
            && (
                !this.snapshot.target
                || distanceXZ(target, this.snapshot.target) > 0.18
            )
        );
        if (this.snapshot.goal !== goal || targetChanged) {
            this.setGoal({
                goal,
                utility: 3,
                target,
                reason,
            }, input.time, Math.max(0.2, directive.expiresAt - input.time));
        } else {
            this.snapshot.target = target;
            this.snapshot.moving = target !== null;
            this.snapshot.reason = reason;
            this.snapshot.activeDirective = directive.action;
            this.snapshot.activeDirectiveReason = directive.reason;
        }
        this.snapshot.drives = drivesCopy(this.drives);
        this.snapshot.learning = this.reinforcement.snapshot();
        return this.snapshot;
    }

    private decide(input: WillInput): Candidate {
        const { perception, npcPosition, time } = input;
        const prison = input.prison ?? null;
        const learningState = this.settleLearning(input);
        const candidates: Candidate[] = [];
        const player = perception.player;
        const recentPlayerMemory = this.lastSeenPlayer && time - this.lastSeenPlayer.at <= 9
            ? this.lastSeenPlayer
            : null;

        if (player?.visible) {
            // ESPAÇO PESSOAL, MENOS QUANDO ELE ESCOLHEU ESTAR ALI.
            //
            // Esta regra tem utilidade 2,5 e atropela tudo. Na prisão isso
            // virava uma armadilha: o jogador chega ao aparelho gêmeo para
            // fazer a dupla, entra no raio de 1,05 m, e o Nilo é EXPULSO
            // justamente no instante em que o puzzle acontece. Medido na
            // bancada: 70 segundos de vaivém make-space ↔ seek-player, sem
            // encostar em nada.
            //
            // Ele continua tendo espaço pessoal em todo o resto: só não abre
            // mão de um lugar que ele mesmo decidiu ocupar.
            // A condição é a DISTÂNCIA AO ALVO DELE, não "já está em cima":
            // ele nunca chegava a ficar em cima, porque era expulso na
            // chegada — o guard nunca ligava e o vaivém continuava.
            const plantado = this.snapshot.goal === 'try-device'
                && !!this.snapshot.target
                && distanceXZ(npcPosition, this.snapshot.target) <= 2.2;
            if (player.distance < 1.05 && !plantado) {
                candidates.push({
                    goal: 'make-space',
                    utility: 2.5,
                    target: this.makeSpaceTarget(npcPosition, player),
                    reason: 'você está perto demais e eu quero respeitar seu espaço',
                });
            }
            if (player.distance <= 2.6 && this.speechCooldown <= 0) {
                candidates.push({
                    goal: 'talk-player',
                    utility: 0.28 + this.drives.social * 1.3 + this.drives.curiosity * 0.18,
                    target: null,
                    reason: 'minha vontade de quebrar o silêncio ficou maior que minha cautela',
                });
            }
            if (player.distance > 1.75) {
                candidates.push({
                    goal: 'approach-player',
                    utility: this.drives.social * 0.98
                        + this.drives.curiosity * 0.17
                        + clamp((player.distance - 2) / 14, 0, 1) * 0.12,
                    target: this.safeTarget(player.position.x, player.position.z),
                    reason: 'eu vi você e quero me aproximar antes de decidir se falo',
                });
            }
            candidates.push({
                goal: 'observe-player',
                utility: 0.22 + (1 - this.drives.social) * 0.34 + this.drives.curiosity * 0.16,
                target: null,
                reason: 'quero entender seu comportamento antes de agir',
            });
        } else if (recentPlayerMemory) {
            const memoryFreshness = 1 - clamp((time - recentPlayerMemory.at) / 9, 0, 1);
            candidates.push({
                goal: 'seek-player',
                utility: this.drives.social * 0.56
                    + this.drives.curiosity * 0.22
                    + memoryFreshness * 0.38,
                target: this.safeTarget(recentPlayerMemory.x, recentPlayerMemory.z),
                reason: 'não vejo você agora, mas lembro onde o vi pela última vez',
            });
        }

        candidates.push({
            goal: 'inspect-elevator',
            utility: this.drives.curiosity * 0.78 + this.drives.restlessness * 0.14,
            target: { x: 0, z: -8.35 },
            reason: 'a porta continua sendo a única saída que eu ainda posso investigar',
        });

        // ── AS DUAS DA PRISÃO ─────────────────────────────────────────────
        // Elas entram com utilidade BAIXA de propósito. Se eu as colocasse em
        // primeiro lugar, ele iria direto ao aparelho certo e o campo de provas
        // não provaria nada: o mérito seria da minha tabela, não do que ele
        // aprendeu. Baixas, elas só ganham quando a rede aprende que ganham —
        // e é isso que o Felipe quer ver acontecendo.
        if (prison && !prison.doorOpen) {
            const alvo = this.deviceToTry(prison, npcPosition);
            if (alvo) {
                candidates.push({
                    goal: 'try-device',
                    // Alta o bastante para ACONTECER, baixa o bastante para
                    // não dominar. Se ela nunca ganhasse, a rede nunca poderia
                    // aprender que cooperar funciona — ação que não é escolhida
                    // não recebe recompensa, e eu tinha deixado exatamente esse
                    // buraco (o teste pegou: 1200s sem uma única tentativa).
                    // O termo do silêncio é o homem trancado cutucando as
                    // coisas quando nada acontece — não é conhecer a regra.
                    utility: 0.28
                        + this.drives.curiosity * 0.3
                        + this.drives.restlessness * 0.12
                        + clamp(prison.secondsSinceProgress / 240, 0, 0.35),
                    target: this.safeTarget(alvo.x, alvo.z),
                    reason: 'aquilo ali reage quando eu piso — não sei por quê',
                });
            }
            // Chamar só faz sentido se houver alguém para vir.
            if (perception.player) {
                candidates.push({
                    goal: 'call-player',
                    utility: 0.24 + this.drives.social * 0.32
                        + clamp(prison.secondsSinceProgress / 180, 0, 0.3),
                    target: null,
                    reason: 'sozinho eu já tentei de tudo aqui',
                });
            }
        }
        candidates.push({
            goal: 'wander',
            utility: this.drives.restlessness * 0.72
                + this.drives.curiosity * 0.2
                - this.drives.fatigue * 0.28,
            target: this.wanderTarget(npcPosition),
            reason: 'ficar parado está me incomodando e quero observar outro ponto da sala',
        });
        candidates.push({
            goal: 'idle',
            utility: 0.12 + this.drives.fatigue * 0.92,
            target: null,
            reason: 'quero descansar e escutar a sala antes de tomar outra decisão',
        });

        for (const candidate of candidates) {
            // Evita loops mecânicos, mas não proíbe repetir algo que ainda faz sentido.
            if (candidate.goal === this.snapshot.goal) candidate.utility -= 0.12;
            else if (candidate.goal === this.lastGoal) candidate.utility -= 0.06;
            if (isFloor10RlAction(candidate.goal)) {
                candidate.utility += this.reinforcement.utilityBonus(
                    learningState,
                    candidate.goal,
                );
            }
            // A vontade deliberada por fora entra aqui como peso, não como ordem.
            candidate.utility += deliberationBonus(
                input.deliberation ?? null,
                candidate.goal,
                time,
            );
            candidate.utility += this.random() * 0.055;
        }
        candidates.sort((a, b) => b.utility - a.utility);
        const selected = candidates[0];
        this.rememberLearningChoice(selected, input, learningState);
        return selected;
    }

    private followAcceptedPlayer(input: WillInput): Floor10WillSnapshot | null {
        if (this.commitment !== 'follow-player' || !input.perception.player) return null;
        const player = input.perception.player;

        // Seguir não significa invadir o corpo do jogador. O reflexo de abrir
        // espaço vence por alguns passos, sem cancelar o compromisso aceito.
        if (player.distance < 1.05) {
            if (this.snapshot.goal !== 'make-space' || !this.snapshot.target) {
                this.setGoal({
                    goal: 'make-space',
                    utility: 3,
                    target: this.makeSpaceTarget(input.npcPosition, player),
                    reason: 'aceitei seguir você, mas preciso manter algum espaço entre nós',
                }, input.time, 0.8);
            }
            this.snapshot.drives = drivesCopy(this.drives);
            return this.snapshot;
        }

        const target = player.distance > 1.85
            ? this.safeTarget(player.position.x, player.position.z)
            : null;
        const reason = target
            ? 'eu aceitei seguir você e estou acompanhando seus passos'
            : 'eu aceitei seguir você e já estou perto o bastante';

        if (this.snapshot.goal !== 'follow-player') {
            this.setGoal({
                goal: 'follow-player',
                utility: 3,
                target,
                reason,
            }, input.time, 1);
        } else {
            // O compromisso não muda só porque o alvo caminhou: atualizamos a
            // posição sem criar centenas de decisões novas por segundo.
            this.snapshot.target = target;
            this.snapshot.moving = target !== null;
            this.snapshot.reason = reason;
            this.snapshot.commitment = this.commitment;
            this.snapshot.commitmentReason = this.commitmentReason;
            this.snapshot.activeDirective = null;
            this.snapshot.activeDirectiveReason = null;
        }
        this.snapshot.drives = drivesCopy(this.drives);
        this.snapshot.learning = this.reinforcement.snapshot();
        return this.snapshot;
    }

    private autonomousLine(): string {
        let index = Math.floor(this.random() * AUTONOMOUS_LINES.length);
        if (index === this.lastAutonomousLine) index = (index + 1) % AUTONOMOUS_LINES.length;
        this.lastAutonomousLine = index;
        return AUTONOMOUS_LINES[index];
    }

    tick(input: WillInput): Floor10WillTick {
        this.updateDrives(input.dt, input.perception);
        const player = input.perception.player;
        if (player?.visible) {
            this.lastSeenPlayer = {
                x: player.position.x,
                z: player.position.z,
                at: input.time,
            };
        }

        if (input.conversationOpen || input.speaking) {
            this.drives.social = clamp01(this.drives.social - input.dt * 0.04);
            if (this.snapshot.goal !== 'observe-player' || this.snapshot.moving) {
                this.setGoal({
                    goal: 'observe-player',
                    utility: 1,
                    target: null,
                    reason: 'estou prestando atenção na conversa',
                }, input.time, 1);
            }
            this.snapshot.drives = drivesCopy(this.drives);
            this.snapshot.learning = this.reinforcement.snapshot();
            return { snapshot: this.snapshot };
        }

        if (this.activeDirective) {
            if (this.learningDecision) this.settleLearning(input, true);
            const acceptedDirective = this.runActiveDirective(input);
            if (acceptedDirective) return { snapshot: acceptedDirective };
        }

        if (this.commitment === 'follow-player' && this.learningDecision) {
            this.settleLearning(input, true);
        }
        const acceptedFollow = this.followAcceptedPlayer(input);
        if (acceptedFollow) return { snapshot: acceptedFollow };

        const reached = this.goalReached(input.npcPosition, input.perception);
        if (reached) {
            this.onArrival();
            this.goalLockedUntil = input.time;
        }

        // Enquanto segue alguém visível, corrige o alvo sem criar uma decisão
        // nova a cada passo. A vontade é a mesma; só o mundo se mexeu.
        if (this.snapshot.goal === 'approach-player' && player?.visible) {
            this.snapshot.target = this.safeTarget(player.position.x, player.position.z);
        }

        const urgentPersonalSpace = !!player?.visible && player.distance < 1.05;
        const closeEnoughToTalk = !!player?.visible
            && player.distance <= 2.6
            && this.speechCooldown <= 0
            && this.drives.social >= 0.48;
        const decisionDue = input.time >= this.nextDecisionAt
            && input.time >= this.goalLockedUntil;
        if (reached || urgentPersonalSpace || closeEnoughToTalk || decisionDue) {
            const candidate = this.decide(input);
            const lock = candidate.goal === 'talk-player'
                ? 2.4
                : candidate.goal === 'approach-player'
                    ? 4
                    : candidate.goal === 'seek-player'
                        ? 3
                        : candidate.goal === 'observe-player' || candidate.goal === 'idle'
                            ? 2
                            : candidate.goal === 'make-space'
                                ? 1.6
                                // A prisão é GRANDE: um aparelho fica a 14 m do
                                // outro lado, e com 3,5s ele repensava antes de
                                // chegar — escolhia try-device sem nunca pisar
                                // em nada. Medido na bancada: 60s de sala e
                                // ZERO tentativas, com a meta certa escolhida.
                                : candidate.goal === 'try-device'
                                    ? 12
                                    : candidate.goal === 'call-player'
                                        ? 5
                                        : 3.5;
            this.setGoal(candidate, input.time, lock);

            if (candidate.goal === 'talk-player') {
                const speech = this.autonomousLine();
                this.drives.social = clamp01(this.drives.social - 0.44);
                this.drives.restlessness = clamp01(this.drives.restlessness - 0.12);
                this.speechCooldown = 22 + this.random() * 18;
                this.snapshot.drives = drivesCopy(this.drives);
                return { snapshot: this.snapshot, speech };
            }
        }

        // Atualiza valores internos no snapshot sem trocar a decisão.
        this.snapshot.drives = drivesCopy(this.drives);
        this.snapshot.commitment = this.commitment;
        this.snapshot.commitmentReason = this.commitmentReason;
        this.snapshot.activeDirective = this.activeDirective?.action ?? null;
        this.snapshot.activeDirectiveReason = this.activeDirective?.reason ?? null;
        this.snapshot.learning = this.reinforcement.snapshot();
        return { snapshot: this.snapshot };
    }
}

export type Floor10MovementStep = {
    x: number;
    z: number;
    yaw: number;
    moving: boolean;
};

/**
 * Navegação leve do mapa atual. Encaminha o NPC pela abertura real da porta
 * quando um alvo fica dentro/fora do elevador, em vez de atravessar a parede.
 */
export function stepFloor10Movement(
    position: Pick<Vec3Like, 'x' | 'z'>,
    target: { x: number; z: number } | null,
    speed: number,
    dt: number,
): Floor10MovementStep {
    if (!target) return { x: position.x, z: position.z, yaw: 0, moving: false };

    let navX = target.x;
    let navZ = target.z;
    const targetInsideElevator = target.z < -9.7;
    const npcInsideElevator = position.z < -9.65;

    if (targetInsideElevator && !npcInsideElevator) {
        if (Math.abs(position.x) > 0.38 || position.z > -8.7) {
            navX = 0;
            navZ = -8.75;
        } else {
            navX = 0;
            navZ = -10.55;
        }
    } else if (!targetInsideElevator && npcInsideElevator) {
        if (Math.abs(position.x) > 0.38 || position.z < -10.35) {
            navX = 0;
            navZ = -10.25;
        } else {
            navX = 0;
            navZ = -8.65;
        }
    }

    const dx = navX - position.x;
    const dz = navZ - position.z;
    const distance = Math.hypot(dx, dz);
    const yaw = distance > 0.0001 ? Math.atan2(dx, dz) : 0;
    if (distance <= 0.08) return { x: position.x, z: position.z, yaw, moving: false };

    const amount = Math.min(distance, Math.max(0, speed * clamp(dt, 0, 0.1)));
    return {
        x: position.x + (dx / distance) * amount,
        z: position.z + (dz / distance) * amount,
        yaw,
        moving: amount > 0.0001,
    };
}

export function speedForWillGoal(goal: Floor10WillGoal): number {
    if (goal === 'follow-player') return 1.18;
    if (goal === 'approach-player' || goal === 'seek-player') return 1.12;
    if (goal === 'make-space') return 1.28;
    if (goal === 'enter-elevator') return 0.92;
    if (goal === 'inspect-elevator') return 0.78;
    if (goal === 'wander') return 0.68;
    // SEM ISTO ELE NÃO SAI DO LUGAR. A tabela devolve 0 para tudo que não
    // conhece, e a meta nova caía justamente aí: ele escolhia try-device,
    // segurava a meta por 12s e ficava parado olhando o aparelho a 14 m de
    // distância. Medido na bancada: a meta certa escolhida dezenas de vezes e
    // ZERO tentativas. Um passo mais decidido que o passeio: ele quer chegar.
    if (goal === 'try-device') return 0.95;
    return 0;
}

export function formatFloor10WillForPrompt(will: Floor10WillSnapshot): string {
    const commitment = will.commitment === 'follow-player'
        ? `- Compromisso verbal ativo: aceitou seguir o jogador ("${will.commitmentReason ?? 'aceitei seguir'}").`
        : '- Compromisso verbal ativo: nenhum; continua escolhendo sozinho.';
    const directive = will.activeDirective
        ? `\n- Pedido físico em execução: ${will.activeDirective} ("${will.activeDirectiveReason ?? 'aceitei fazer isso'}").`
        : '';
    const learnedPreference = will.learning.experiences > 0
        ? '\n- Já ajusta as preferências a partir das consequências de decisões anteriores.'
        : '';
    return `VONTADE ATUAL (estado interno real, pode mudar):
- Nilo escolheu ${will.label}, porque ${will.reason}.
- Desejos 0..1: social ${will.drives.social.toFixed(2)}, curiosidade ${will.drives.curiosity.toFixed(2)}, inquietação ${will.drives.restlessness.toFixed(2)}, cansaço ${will.drives.fatigue.toFixed(2)}.
${commitment}${directive}${learnedPreference}
- Se perguntarem o que quer ou por que age, responda a partir deste estado; nunca cite números nem sistemas.`;
}

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
}

export function detectFloor10PlayerActionRequest(
    userText: string,
): Floor10WillCommandAction | null {
    const text = normalize(userText);
    const asksToStopFollowing =
        /\b(?:nao me siga|pare de me seguir|para de me seguir|pode parar de me seguir)\b/.test(text)
        || /\b(?:do not follow me|don't follow me|stop following me)\b/.test(text)
        || /\b(?:no me sigas|deja de seguirme|para de seguirme)\b/.test(text);
    if (asksToStopFollowing) return 'resume-autonomy';

    const asksToFollow =
        /\b(?:me siga|me segue|siga-me|venha comigo|vem comigo|ande comigo|anda comigo|me acompanhe|me acompanha)\b/.test(text)
        || /\b(?:follow me|come with me|walk with me)\b/.test(text)
        || /\b(?:sigueme|ven conmigo|camina conmigo|acompaname)\b/.test(text);
    if (asksToFollow) return 'follow-player';

    if (
        /\b(?:espere aqui|espera aqui|fique aqui|fica aqui|nao saia dai|pare ai)\b/.test(text)
        || /\b(?:wait here|stay here|do not move|don't move)\b/.test(text)
        || /\b(?:espera aqui|quedate aqui|no te muevas)\b/.test(text)
    ) return 'wait';
    if (
        /\b(?:entre|entra|va|vai) (?:no|pro|para o) elevador\b/.test(text)
        || /\b(?:enter|get into|go into) the elevator\b/.test(text)
        || /\b(?:entra|ve) (?:en|al) (?:el )?ascensor\b/.test(text)
    ) return 'enter-elevator';
    if (
        /\b(?:examine|examina|inspecione|inspeciona|investigue|investiga|olhe|olha) (?:o|pro|para o) elevador\b/.test(text)
        || /\b(?:inspect|check|examine) the elevator\b/.test(text)
        || /\b(?:inspecciona|examina|revisa) (?:el )?ascensor\b/.test(text)
    ) return 'inspect-elevator';
    if (
        /\b(?:explore|explora|ande|anda) (?:pela|na|por essa|esta|essa) sala\b/.test(text)
        || /\b(?:explore|walk around) (?:the|this) room\b/.test(text)
        || /\b(?:explora|camina por) (?:la|esta) sala\b/.test(text)
    ) return 'explore-room';
    if (
        /\b(?:se afaste|afasta|de um espaco|de espaço|abra espaco|abre espaco)\b/.test(text)
        || /\b(?:back away|give me space|move back)\b/.test(text)
        || /\b(?:alejate|dame espacio|hazte atras)\b/.test(text)
    ) return 'make-space';
    if (
        /\b(?:se aproxime|chegue mais perto|vem aqui|venha aqui|fica perto de mim)\b/.test(text)
        || /\b(?:come closer|come here|stand near me)\b/.test(text)
        || /\b(?:acercate|ven aqui|ponte cerca de mi)\b/.test(text)
    ) return 'approach-player';
    if (
        /\b(?:olhe pra mim|olha pra mim|me observe|me observa)\b/.test(text)
        || /\b(?:look at me|watch me|observe me)\b/.test(text)
        || /\b(?:mirame|observame)\b/.test(text)
    ) return 'observe-player';
    return null;
}

export function hasFloor10PhysicalActionCue(userText: string): boolean {
    if (detectFloor10PlayerActionRequest(userText)) return true;
    const text = normalize(userText);
    return /\b(?:va|vai) (?:ate|para|pro|pra)\b/.test(text)
        || /\b(?:venha|vem) (?:ate|aqui|comigo)\b/.test(text)
        || /\b(?:fique|fica|espere|espera|ande|anda|pare|olhe pra|olhe para|olha pra|entre|entra|explore|explora|afaste-se|se afaste|aproxime-se|se aproxime|sente-se|senta|levante-se|se levante|vire-se|se vire|corra|pegue)\b/.test(text)
        || /\b(?:go to|come here|come with me|stay|wait|walk|stop|look at|enter|explore|move away|come closer|sit down|stand up|turn around|run|pick up)\b/.test(text)
        || /\b(?:ve a|ven aqui|ven conmigo|quedate|espera|camina|para|mira a|entra|explora|alejate|acercate|sientate|levantate|date la vuelta|corre|recoge)\b/.test(text);
}

const COMMAND_MARKERS: Record<Floor10WillCommandAction, string> = {
    'follow-player': '[[WILL:FOLLOW_PLAYER]]',
    'resume-autonomy': '[[WILL:RESUME_AUTONOMY]]',
    'approach-player': '[[WILL:APPROACH_PLAYER]]',
    wait: '[[WILL:WAIT]]',
    'inspect-elevator': '[[WILL:INSPECT_ELEVATOR]]',
    'enter-elevator': '[[WILL:ENTER_ELEVATOR]]',
    'explore-room': '[[WILL:EXPLORE_ROOM]]',
    'make-space': '[[WILL:MAKE_SPACE]]',
    'observe-player': '[[WILL:OBSERVE_PLAYER]]',
};

const MARKER_TO_COMMAND: Record<string, Floor10WillCommandAction> = Object.fromEntries(
    Object.entries(COMMAND_MARKERS).map(([command, marker]) => [
        marker.slice('[[WILL:'.length, -2),
        command as Floor10WillCommandAction,
    ]),
) as Record<string, Floor10WillCommandAction>;

const CONTROL_MARKERS = [...Object.values(COMMAND_MARKERS), '[[WILL:NONE]]'];

export function formatFloor10ActionRequestForPrompt(userText: string): string {
    if (!hasFloor10PhysicalActionCue(userText)) return '';
    return `

PROTOCOLO SILENCIOSO ENTRE FALA E CORPO:
- A última fala pode conter um pedido físico. Identifique a intenção você mesmo. Isso é um pedido, não uma ordem: aceite ou recuse conforme sua confiança, olhos e vontade.
- Se aceitar, finalize com um marcador: seguir ${COMMAND_MARKERS['follow-player']}; cancelar ${COMMAND_MARKERS['resume-autonomy']}; aproximar ${COMMAND_MARKERS['approach-player']}; esperar ${COMMAND_MARKERS.wait}; examinar elevador ${COMMAND_MARKERS['inspect-elevator']}; entrar ${COMMAND_MARKERS['enter-elevator']}; explorar ${COMMAND_MARKERS['explore-room']}; afastar ${COMMAND_MARKERS['make-space']}; observar ${COMMAND_MARKERS['observe-player']}.
- Se recusar, hesitar ou negociar, finalize com [[WILL:NONE]]. Se não houver pedido físico, não use marcador.
- O marcador é invisível para o jogador: nunca o explique, leia ou mencione.`;
}

export function stripFloor10WillControl(text: string): string {
    const markerStart = text.search(/\[\[WILL:/i);
    if (markerStart >= 0) return text.slice(0, markerStart).trimEnd();
    const partialStart = text.lastIndexOf('[[');
    if (partialStart >= 0) {
        const partial = text.slice(partialStart).toLocaleUpperCase();
        if (CONTROL_MARKERS.some((marker) => marker.startsWith(partial))) {
            return text.slice(0, partialStart).trimEnd();
        }
    }
    // Esconde também o primeiro colchete enquanto o segundo ainda não chegou.
    return text.endsWith('[') ? text.slice(0, -1).trimEnd() : text;
}

function inferredAcceptance(
    request: Floor10WillCommandAction,
    visibleReply: string,
): boolean {
    const text = normalize(visibleReply);
    const refuses =
        /\b(?:nao vou|nao quero|nao posso|prefiro nao|recuso|nem pensar)\b/.test(text)
        || /\b(?:i will not|i won't|i do not want|i don't want|i cannot|i can't|no thanks)\b/.test(text)
        || /\b(?:no voy|no quiero|no puedo|prefiero no|me niego)\b/.test(text);
    if (refuses) return false;
    if (request === 'follow-player') {
        return /\b(?:vou te seguir|te sigo|vou com voce|irei com voce|vamos juntos|claro que sigo)\b/.test(text)
            || /\b(?:i will follow you|i'll follow you|i am coming with you|i'm coming with you|let's go together)\b/.test(text)
            || /\b(?:voy a seguirte|te seguire|voy contigo|vamos juntos|claro que te sigo)\b/.test(text);
    }
    if (request === 'resume-autonomy') {
        return /\b(?:vou parar de te seguir|paro de te seguir|pode deixar|volto a decidir sozinho)\b/.test(text)
            || /\b(?:i will stop following you|i'll stop following you|i will stop|i'll stop)\b/.test(text)
            || /\b(?:dejare de seguirte|voy a dejar de seguirte|dejare de hacerlo)\b/.test(text);
    }
    // Nas demais ações, só o marcador explícito do cérebro de fala cria uma ordem corporal.
    return false;
}

export type Floor10WillLanguageDecision = {
    visibleReply: string;
    command: Floor10WillCommandAction | null;
};

export function parseFloor10WillLanguageDecision(
    userText: string,
    modelReply: string,
): Floor10WillLanguageDecision {
    const request = detectFloor10PlayerActionRequest(userText);
    const visibleReply = stripFloor10WillControl(modelReply).trim();
    const marker = modelReply.match(/\[\[WILL:([A-Z_]+)\]\]/i)?.[1]
        ?.toLocaleUpperCase();
    if (marker === 'NONE') return { visibleReply, command: null };
    if (marker && MARKER_TO_COMMAND[marker]) {
        return { visibleReply, command: MARKER_TO_COMMAND[marker] };
    }
    if (marker || !request) return { visibleReply, command: null };

    // Compatibilidade defensiva caso o 2B esqueça o marcador:
    // só seguir/parar possuem frases inequívocas; dúvida mantém a autonomia.
    return {
        visibleReply,
        command: inferredAcceptance(request, visibleReply) ? request : null,
    };
}

export function answerFloor10WillQuestion(
    userText: string,
    will: Floor10WillSnapshot,
): string | null {
    const text = normalize(userText);
    const asksWill = /\b(?:o que|oq|que) (?:voce|vc|ce|tu) (?:quer|vai)(?: (?:fazer|faze))?\b/.test(text)
        || /\b(?:por que|pq) (?:voce|vc|ce|tu) (?:esta|ta) (?:andando|vindo|indo|parado|me olhando)\b/.test(text)
        || /\bonde (?:voce|vc|ce|tu) (?:vai|ta indo|esta indo)\b/.test(text)
        || /\bwhat do you want to do\b/.test(text)
        || /\bwhy are you (?:walking|coming|moving|staring|standing)\b/.test(text)
        || /\bwhere are you (?:going|heading)\b/.test(text)
        || /\bque quieres hacer\b/.test(text)
        || /\bpor que estas (?:caminando|viniendo|quieto|mirandome)\b/.test(text)
        || /\bdonde (?:vas|estas yendo)\b/.test(text);
    if (!asksWill) return null;

    if (will.activeDirective) {
        if (/\b(?:what|why|where)\b/.test(text)) {
            return `I accepted your request, so right now I want to ${GOAL_LABEL_EN[will.goal]}. After that, I will decide what I want to do next.`;
        }
        if (/\b(?:quieres|por que estas|donde)\b/.test(text)) {
            return `Acepté tu pedido, así que ahora quiero ${GOAL_LABEL_ES[will.goal]}. Después decidiré qué quiero hacer.`;
        }
        return `Eu aceitei o seu pedido, então agora quero ${will.label}. Depois disso, volto a decidir o que quero fazer.`;
    }

    if (will.commitment === 'follow-player') {
        if (/\b(?:what|why|where)\b/.test(text)) {
            return 'I chose to follow you because I accepted your request. I can change my mind, but for now I intend to keep my word.';
        }
        if (/\b(?:quieres|por que estas|donde)\b/.test(text)) {
            return 'Elegí seguirte porque acepté tu pedido. Puedo cambiar de opinión, pero por ahora quiero cumplir mi palabra.';
        }
        return 'Eu escolhi te seguir porque aceitei o seu pedido. Posso mudar de ideia, mas por enquanto quero cumprir o que falei.';
    }

    if (/\b(?:what|why|where)\b/.test(text)) {
        return `Right now I want to ${GOAL_LABEL_EN[will.goal]}. I chose it because it feels more important than the other things I could do.`;
    }
    if (/\b(?:quieres|por que estas|donde)\b/.test(text)) {
        return `Ahora quiero ${GOAL_LABEL_ES[will.goal]}. Lo elegí porque ahora me importa más que las otras cosas que podría hacer.`;
    }
    return `Agora eu quero ${will.label}. Escolhi isso porque ${will.reason}.`;
}
