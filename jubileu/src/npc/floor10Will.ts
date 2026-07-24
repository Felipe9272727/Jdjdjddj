import type { Floor10Perception, Vec3Like } from './floor10Perception';

// ── A VONTADE DO HÓSPEDE ───────────────────────────────────────────────────
// "Livre-arbítrio" de gameplay: um agente de Utility AI separado dos olhos e
// do LLM. Nilo mantém desejos contínuos, memória de curto prazo, personalidade
// e custos de repetição. A cada decisão ele compara ações possíveis e escolhe
// a que mais atende ao que quer naquele instante — não uma sequência roteirizada.
//
// O Qwen continua responsável por conversa aberta. Esta micro-IA decide e age
// mesmo sem chat, sem download adicional e sem bloquear o jogo.

export type Floor10WillGoal =
    | 'idle'
    | 'wander'
    | 'inspect-elevator'
    | 'approach-player'
    | 'seek-player'
    | 'observe-player'
    | 'make-space'
    | 'talk-player';

export type Floor10WillDrives = {
    social: number;
    curiosity: number;
    restlessness: number;
    fatigue: number;
};

export type Floor10WillSnapshot = {
    source: 'floor10-utility-will';
    decisionId: number;
    goal: Floor10WillGoal;
    label: string;
    reason: string;
    target: null | { x: number; z: number };
    moving: boolean;
    drives: Floor10WillDrives;
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
};

type Candidate = {
    goal: Floor10WillGoal;
    utility: number;
    target: Floor10WillSnapshot['target'];
    reason: string;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const GOAL_LABEL: Record<Floor10WillGoal, string> = {
    idle: 'ficar em silêncio por um instante',
    wander: 'explorar a sala',
    'inspect-elevator': 'examinar o elevador',
    'approach-player': 'me aproximar de você',
    'seek-player': 'procurar você',
    'observe-player': 'observar você',
    'make-space': 'abrir um pouco de espaço',
    'talk-player': 'falar com você',
};

const GOAL_LABEL_EN: Record<Floor10WillGoal, string> = {
    idle: 'stay quiet for a moment',
    wander: 'explore the room',
    'inspect-elevator': 'inspect the elevator',
    'approach-player': 'come closer to you',
    'seek-player': 'look for you',
    'observe-player': 'observe you',
    'make-space': 'give you some space',
    'talk-player': 'talk to you',
};

const GOAL_LABEL_ES: Record<Floor10WillGoal, string> = {
    idle: 'quedarme en silencio un momento',
    wander: 'explorar la sala',
    'inspect-elevator': 'examinar el ascensor',
    'approach-player': 'acercarme a ti',
    'seek-player': 'buscarte',
    'observe-player': 'observarte',
    'make-space': 'darte un poco de espacio',
    'talk-player': 'hablar contigo',
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
    drives: {
        social: 0.62,
        curiosity: 0.68,
        restlessness: 0.42,
        fatigue: 0.08,
    },
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
    };
    private nextDecisionAt = 0;
    private goalLockedUntil = 0;
    private speechCooldown = 0;
    private lastSeenPlayer: { x: number; z: number; at: number } | null = null;
    private lastGoal: Floor10WillGoal = 'idle';
    private lastAutonomousLine = -1;

    constructor(seed?: number) {
        if (seed === undefined) {
            const entropy = new Uint32Array(1);
            if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(entropy);
            else entropy[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
            seed = entropy[0] ^ 0x4e494c4f;
        }
        this.randomState = seed >>> 0;
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

    private updateDrives(dt: number, perception: Floor10Perception) {
        const safeDt = clamp(dt, 0, 0.25);
        const moving = this.snapshot.moving;
        this.drives.social = clamp01(
            this.drives.social + safeDt * (perception.player?.visible ? 0.014 : 0.007),
        );
        this.drives.curiosity = clamp01(
            this.drives.curiosity + safeDt * (perception.elevator.visible ? 0.007 : 0.004),
        );
        this.drives.restlessness = clamp01(
            this.drives.restlessness + safeDt * (moving ? -0.018 : 0.016),
        );
        this.drives.fatigue = clamp01(
            this.drives.fatigue + safeDt * (moving ? 0.013 : -0.02),
        );
        this.speechCooldown = Math.max(0, this.speechCooldown - safeDt);
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
            drives: drivesCopy(this.drives),
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

    private decide(input: WillInput): Candidate {
        const { perception, npcPosition, time } = input;
        const candidates: Candidate[] = [];
        const player = perception.player;
        const recentPlayerMemory = this.lastSeenPlayer && time - this.lastSeenPlayer.at <= 9
            ? this.lastSeenPlayer
            : null;

        if (player?.visible) {
            if (player.distance < 1.05) {
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
            candidate.utility += this.random() * 0.055;
        }
        candidates.sort((a, b) => b.utility - a.utility);
        return candidates[0];
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
            return { snapshot: this.snapshot };
        }

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
    if (goal === 'approach-player' || goal === 'seek-player') return 1.12;
    if (goal === 'make-space') return 1.28;
    if (goal === 'inspect-elevator') return 0.78;
    if (goal === 'wander') return 0.68;
    return 0;
}

export function formatFloor10WillForPrompt(will: Floor10WillSnapshot): string {
    return `VONTADE ATUAL (estado interno real, pode mudar):
- Nilo escolheu ${will.label}, porque ${will.reason}.
- Desejos 0..1: social ${will.drives.social.toFixed(2)}, curiosidade ${will.drives.curiosity.toFixed(2)}, inquietação ${will.drives.restlessness.toFixed(2)}, cansaço ${will.drives.fatigue.toFixed(2)}.
- Se perguntarem o que você quer ou por que está agindo, responda naturalmente a partir deste estado; nunca mencione números, scores ou sistemas.`;
}

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
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

    if (/\b(?:what|why|where)\b/.test(text)) {
        return `Right now I want to ${GOAL_LABEL_EN[will.goal]}. I chose it because it feels more important than the other things I could do.`;
    }
    if (/\b(?:quieres|por que estas|donde)\b/.test(text)) {
        return `Ahora quiero ${GOAL_LABEL_ES[will.goal]}. Lo elegí porque ahora me importa más que las otras cosas que podría hacer.`;
    }
    return `Agora eu quero ${will.label}. Escolhi isso porque ${will.reason}.`;
}
