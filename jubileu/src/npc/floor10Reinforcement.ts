// ── APRENDIZADO POR REFORÇO DA VONTADE ─────────────────────────────────────
// Uma Dueling Double DQN pequena, treinada online nas decisões da Utility AI.
// Ela não substitui olhos, fala ou regras de segurança: aprende um resíduo
// limitado sobre os scores da Utility AI. Pedidos aceitos pelo cérebro de fala
// continuam sendo compromissos explícitos e nunca podem ser vetados por esta rede.

import { FLOOR10_MOTOR_FEATURE_SIZE } from './floor10MotorCortex';

export const FLOOR10_RL_ACTIONS = [
    'idle',
    'wander',
    'inspect-elevator',
    'approach-player',
    'seek-player',
    'observe-player',
    'make-space',
    'talk-player',
    // Movimento proposto pelo pensamento livre e aterrado pelo córtex motor.
    'embodied-intent',
    // ── As duas que existem por causa da PRISÃO ────────────────────────────
    // Sem elas o Nilo não tem como aprender a cooperar: dá para querer sair
    // daqui a vida inteira e nunca descobrir nada se as únicas coisas que o
    // corpo sabe fazer são andar e olhar. Ele não sabe para que servem — é
    // justamente isso que a rede aprende, tentando.
    'try-device',
    'call-player',
] as const;

export type Floor10RlAction = typeof FLOOR10_RL_ACTIONS[number];

/**
 * 16 sinais do corpo + o que ele acabou de fazer (one-hot) + o que ele sente
 * da prisão. Cresceu de 24 para acomodar a sala trancada: sem os sentidos da
 * prisão no estado, a rede não teria como associar "o zumbido começou" a
 * "estávamos os dois em cima de alguma coisa".
 */
export const FLOOR10_RL_BODY_STATE_SIZE = 16;
export const FLOOR10_RL_PRISON_STATE_SIZE = 9;
export const FLOOR10_RL_MOTOR_STATE_SIZE = FLOOR10_MOTOR_FEATURE_SIZE;
export const FLOOR10_RL_STATE_SIZE =
    FLOOR10_RL_BODY_STATE_SIZE
    + FLOOR10_RL_ACTIONS.length
    + FLOOR10_RL_PRISON_STATE_SIZE
    + FLOOR10_RL_MOTOR_STATE_SIZE;
/**
 * Dobrou (48 → 96) a pedido do dono do jogo: "uma ia de bastantes parâmetros
 * de RL, onde ele aprende com as fases que ele faz". Agora o estado também
 * recebe o plano motor compacto e existe uma ação para julgá-lo; a rede fica
 * em ~15 mil parâmetros, ainda desprezível perto de um modelo de linguagem.
 */
export const FLOOR10_RL_HIDDEN_SIZE = 96;
export const FLOOR10_RL_ACTION_COUNT = FLOOR10_RL_ACTIONS.length;
export const FLOOR10_RL_PARAMETER_COUNT =
    FLOOR10_RL_STATE_SIZE * FLOOR10_RL_HIDDEN_SIZE
    + FLOOR10_RL_HIDDEN_SIZE
    + FLOOR10_RL_HIDDEN_SIZE * FLOOR10_RL_HIDDEN_SIZE
    + FLOOR10_RL_HIDDEN_SIZE
    + FLOOR10_RL_HIDDEN_SIZE + 1
    + FLOOR10_RL_HIDDEN_SIZE * FLOOR10_RL_ACTION_COUNT
    + FLOOR10_RL_ACTION_COUNT;

export type Floor10ReinforcementSnapshot = {
    source: 'floor10-dueling-double-dqn';
    parameterCount: number;
    experiences: number;
    replaySize: number;
    trainingSteps: number;
    confidence: number;
    lastReward: number;
};

export const INITIAL_FLOOR10_REINFORCEMENT: Floor10ReinforcementSnapshot = {
    source: 'floor10-dueling-double-dqn',
    parameterCount: FLOOR10_RL_PARAMETER_COUNT,
    experiences: 0,
    replaySize: 0,
    trainingSteps: 0,
    confidence: 0,
    lastReward: 0,
};

type Network = {
    inputWeights: Float32Array;
    inputBias: Float32Array;
    hiddenWeights: Float32Array;
    hiddenBias: Float32Array;
    valueWeights: Float32Array;
    valueBias: Float32Array;
    advantageWeights: Float32Array;
    advantageBias: Float32Array;
};

type ForwardPass = {
    hidden1: Float32Array;
    hidden2: Float32Array;
    q: Float32Array;
};

type Experience = {
    state: Float32Array;
    action: number;
    reward: number;
    nextState: Float32Array;
    done: boolean;
    priority: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type Floor10ReinforcementOptions = {
    seed?: number;
    storage?: StorageLike | null;
    storageKey?: string;
};

type SavedNetwork = {
    version: 1;
    trainingSteps: number;
    experiences: number;
    weights: {
        inputWeights: number[];
        inputBias: number[];
        hiddenWeights: number[];
        hiddenBias: number[];
        valueWeights: number[];
        valueBias: number[];
        advantageWeights: number[];
        advantageBias: number[];
    };
};

const REPLAY_CAPACITY = 256;
const MIN_REPLAY_TO_TRAIN = 6;
const BATCH_SIZE = 4;
const GAMMA = 0.92;
const LEARNING_RATE = 0.0016;
const TARGET_TAU = 0.075;
const MAX_UTILITY_RESIDUAL = 0.22;
const STORAGE_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'floor10-nilo-rl-v1';

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

function createNetwork(): Network {
    return {
        inputWeights: new Float32Array(FLOOR10_RL_STATE_SIZE * FLOOR10_RL_HIDDEN_SIZE),
        inputBias: new Float32Array(FLOOR10_RL_HIDDEN_SIZE),
        hiddenWeights: new Float32Array(FLOOR10_RL_HIDDEN_SIZE * FLOOR10_RL_HIDDEN_SIZE),
        hiddenBias: new Float32Array(FLOOR10_RL_HIDDEN_SIZE),
        valueWeights: new Float32Array(FLOOR10_RL_HIDDEN_SIZE),
        valueBias: new Float32Array(1),
        advantageWeights: new Float32Array(FLOOR10_RL_ACTION_COUNT * FLOOR10_RL_HIDDEN_SIZE),
        advantageBias: new Float32Array(FLOOR10_RL_ACTION_COUNT),
    };
}

function copyNetwork(source: Network): Network {
    return {
        inputWeights: source.inputWeights.slice(),
        inputBias: source.inputBias.slice(),
        hiddenWeights: source.hiddenWeights.slice(),
        hiddenBias: source.hiddenBias.slice(),
        valueWeights: source.valueWeights.slice(),
        valueBias: source.valueBias.slice(),
        advantageWeights: source.advantageWeights.slice(),
        advantageBias: source.advantageBias.slice(),
    };
}

function safeBrowserStorage(): StorageLike | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function actionIndex(action: Floor10RlAction): number {
    return FLOOR10_RL_ACTIONS.indexOf(action);
}

function finiteArray(value: unknown, length: number): value is number[] {
    return Array.isArray(value)
        && value.length === length
        && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

/**
 * Rede neural online. A exploração já vem do ruído e dos custos de repetição da
 * Utility AI; a DQN observa essas escolhas e aprende quais tiveram bom desfecho.
 */
export class Floor10ReinforcementLearner {
    private randomState: number;
    private online = createNetwork();
    private target = createNetwork();
    private replay: Experience[] = [];
    private replayCursor = 0;
    private trainingSteps = 0;
    private experiences = 0;
    private lastReward = 0;
    private readonly storage: StorageLike | null;
    private readonly storageKey: string;

    constructor(options: Floor10ReinforcementOptions | number = {}) {
        const resolved = typeof options === 'number' ? { seed: options } : options;
        this.randomState = (resolved.seed ?? 0x4e494c4f) >>> 0;
        this.storage = resolved.storage === undefined ? safeBrowserStorage() : resolved.storage;
        this.storageKey = resolved.storageKey ?? DEFAULT_STORAGE_KEY;
        this.initializeNetwork(this.online);
        this.target = copyNetwork(this.online);
        this.restore();
    }

    private random(): number {
        let x = this.randomState || 0x6d2b79f5;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.randomState = x >>> 0;
        return this.randomState / 0x100000000;
    }

    private initializeMatrix(weights: Float32Array, fanIn: number, fanOut: number) {
        // Xavier reduzido: o modelo nasce neutro e só ganha influência depois
        // de acumular experiências reais no aparelho.
        const scale = Math.sqrt(6 / (fanIn + fanOut)) * 0.35;
        for (let index = 0; index < weights.length; index++) {
            weights[index] = (this.random() * 2 - 1) * scale;
        }
    }

    private initializeNetwork(network: Network) {
        this.initializeMatrix(
            network.inputWeights,
            FLOOR10_RL_STATE_SIZE,
            FLOOR10_RL_HIDDEN_SIZE,
        );
        this.initializeMatrix(
            network.hiddenWeights,
            FLOOR10_RL_HIDDEN_SIZE,
            FLOOR10_RL_HIDDEN_SIZE,
        );
        this.initializeMatrix(network.valueWeights, FLOOR10_RL_HIDDEN_SIZE, 1);
        this.initializeMatrix(
            network.advantageWeights,
            FLOOR10_RL_HIDDEN_SIZE,
            FLOOR10_RL_ACTION_COUNT,
        );
    }

    private sanitizeState(state: ArrayLike<number>): Float32Array {
        const safe = new Float32Array(FLOOR10_RL_STATE_SIZE);
        for (let index = 0; index < safe.length; index++) {
            const value = Number(state[index] ?? 0);
            safe[index] = Number.isFinite(value) ? clamp(value, -1, 1) : 0;
        }
        return safe;
    }

    private forward(network: Network, stateLike: ArrayLike<number>): ForwardPass {
        const state = stateLike instanceof Float32Array
            ? stateLike
            : this.sanitizeState(stateLike);
        const hidden1 = new Float32Array(FLOOR10_RL_HIDDEN_SIZE);
        const hidden2 = new Float32Array(FLOOR10_RL_HIDDEN_SIZE);

        for (let row = 0; row < FLOOR10_RL_HIDDEN_SIZE; row++) {
            let sum = network.inputBias[row];
            const offset = row * FLOOR10_RL_STATE_SIZE;
            for (let column = 0; column < FLOOR10_RL_STATE_SIZE; column++) {
                sum += network.inputWeights[offset + column] * state[column];
            }
            hidden1[row] = Math.max(0, sum);
        }
        for (let row = 0; row < FLOOR10_RL_HIDDEN_SIZE; row++) {
            let sum = network.hiddenBias[row];
            const offset = row * FLOOR10_RL_HIDDEN_SIZE;
            for (let column = 0; column < FLOOR10_RL_HIDDEN_SIZE; column++) {
                sum += network.hiddenWeights[offset + column] * hidden1[column];
            }
            hidden2[row] = Math.max(0, sum);
        }

        let value = network.valueBias[0];
        for (let index = 0; index < FLOOR10_RL_HIDDEN_SIZE; index++) {
            value += network.valueWeights[index] * hidden2[index];
        }
        const advantages = new Float32Array(FLOOR10_RL_ACTION_COUNT);
        let advantageMean = 0;
        for (let action = 0; action < FLOOR10_RL_ACTION_COUNT; action++) {
            let advantage = network.advantageBias[action];
            const offset = action * FLOOR10_RL_HIDDEN_SIZE;
            for (let index = 0; index < FLOOR10_RL_HIDDEN_SIZE; index++) {
                advantage += network.advantageWeights[offset + index] * hidden2[index];
            }
            advantages[action] = advantage;
            advantageMean += advantage;
        }
        advantageMean /= FLOOR10_RL_ACTION_COUNT;

        const q = new Float32Array(FLOOR10_RL_ACTION_COUNT);
        for (let action = 0; action < FLOOR10_RL_ACTION_COUNT; action++) {
            q[action] = value + advantages[action] - advantageMean;
        }
        return { hidden1, hidden2, q };
    }

    private confidence(): number {
        // A rede começa sem autoridade e ganha, no máximo, 0.22 no score.
        return clamp((this.trainingSteps + this.experiences * 2) / 120, 0, 1);
    }

    utilityBonus(state: ArrayLike<number>, action: Floor10RlAction): number {
        const values = this.forward(this.online, state).q;
        let mean = 0;
        for (const value of values) mean += value;
        mean /= values.length;
        const centered = values[actionIndex(action)] - mean;
        return Math.tanh(centered) * MAX_UTILITY_RESIDUAL * this.confidence();
    }

    rawActionValue(state: ArrayLike<number>, action: Floor10RlAction): number {
        return this.forward(this.online, state).q[actionIndex(action)];
    }

    remember(
        state: ArrayLike<number>,
        action: Floor10RlAction,
        reward: number,
        nextState: ArrayLike<number>,
        done = false,
    ): Floor10ReinforcementSnapshot {
        const experience: Experience = {
            state: this.sanitizeState(state),
            action: actionIndex(action),
            reward: clamp(Number.isFinite(reward) ? reward : 0, -1.5, 1.5),
            nextState: this.sanitizeState(nextState),
            done,
            priority: this.replay.reduce(
                (highest, item) => Math.max(highest, item.priority),
                1,
            ),
        };
        if (this.replay.length < REPLAY_CAPACITY) this.replay.push(experience);
        else {
            this.replay[this.replayCursor] = experience;
            this.replayCursor = (this.replayCursor + 1) % REPLAY_CAPACITY;
        }
        this.experiences++;
        this.lastReward = experience.reward;
        this.trainBatch();
        if (this.trainingSteps > 0 && this.trainingSteps % 32 < BATCH_SIZE) this.persist();
        return this.snapshot();
    }

    private samplePrioritized(count: number): Array<{ experience: Experience; weight: number }> {
        const priorities = this.replay.map((item) => Math.pow(item.priority + 0.001, 0.62));
        const total = priorities.reduce((sum, value) => sum + value, 0);
        const beta = clamp(0.45 + this.trainingSteps / 12_000, 0.45, 1);
        const samples: Array<{ experience: Experience; weight: number }> = [];
        let maxWeight = 0;

        for (let sample = 0; sample < count; sample++) {
            let cursor = this.random() * total;
            let selected = priorities.length - 1;
            for (let index = 0; index < priorities.length; index++) {
                cursor -= priorities[index];
                if (cursor <= 0) {
                    selected = index;
                    break;
                }
            }
            const probability = priorities[selected] / total;
            const weight = Math.pow(this.replay.length * probability, -beta);
            maxWeight = Math.max(maxWeight, weight);
            samples.push({ experience: this.replay[selected], weight });
        }
        for (const sample of samples) sample.weight /= Math.max(0.0001, maxWeight);
        return samples;
    }

    private trainBatch() {
        if (this.replay.length < MIN_REPLAY_TO_TRAIN) return;
        const samples = this.samplePrioritized(Math.min(BATCH_SIZE, this.replay.length));
        for (const sample of samples) {
            const error = this.trainOne(sample.experience, sample.weight);
            sample.experience.priority = Math.abs(error) + 0.015;
            this.trainingSteps++;
        }
        this.softUpdateTarget();
    }

    private trainOne(experience: Experience, importanceWeight: number): number {
        const pass = this.forward(this.online, experience.state);
        const current = pass.q[experience.action];
        let expected = experience.reward;
        if (!experience.done) {
            const onlineNext = this.forward(this.online, experience.nextState).q;
            let bestAction = 0;
            for (let action = 1; action < onlineNext.length; action++) {
                if (onlineNext[action] > onlineNext[bestAction]) bestAction = action;
            }
            expected += GAMMA * this.forward(this.target, experience.nextState).q[bestAction];
        }
        expected = clamp(expected, -3, 3);
        const error = current - expected;
        const huberGradient = Math.abs(error) <= 1 ? error : Math.sign(error);
        const outputGradient = clamp(huberGradient * importanceWeight, -1, 1);

        const advantageGradient = new Float32Array(FLOOR10_RL_ACTION_COUNT);
        for (let action = 0; action < FLOOR10_RL_ACTION_COUNT; action++) {
            advantageGradient[action] = outputGradient
                * ((action === experience.action ? 1 : 0) - 1 / FLOOR10_RL_ACTION_COUNT);
        }

        const hidden2Gradient = new Float32Array(FLOOR10_RL_HIDDEN_SIZE);
        for (let hidden = 0; hidden < FLOOR10_RL_HIDDEN_SIZE; hidden++) {
            let gradient = outputGradient * this.online.valueWeights[hidden];
            for (let action = 0; action < FLOOR10_RL_ACTION_COUNT; action++) {
                gradient += advantageGradient[action]
                    * this.online.advantageWeights[action * FLOOR10_RL_HIDDEN_SIZE + hidden];
            }
            hidden2Gradient[hidden] = pass.hidden2[hidden] > 0
                ? clamp(gradient, -1, 1)
                : 0;
        }

        const hidden1Gradient = new Float32Array(FLOOR10_RL_HIDDEN_SIZE);
        for (let source = 0; source < FLOOR10_RL_HIDDEN_SIZE; source++) {
            let gradient = 0;
            for (let target = 0; target < FLOOR10_RL_HIDDEN_SIZE; target++) {
                gradient += hidden2Gradient[target]
                    * this.online.hiddenWeights[target * FLOOR10_RL_HIDDEN_SIZE + source];
            }
            hidden1Gradient[source] = pass.hidden1[source] > 0
                ? clamp(gradient, -1, 1)
                : 0;
        }

        for (let hidden = 0; hidden < FLOOR10_RL_HIDDEN_SIZE; hidden++) {
            this.online.valueWeights[hidden] -= LEARNING_RATE
                * outputGradient
                * pass.hidden2[hidden];
        }
        this.online.valueBias[0] -= LEARNING_RATE * outputGradient;
        for (let action = 0; action < FLOOR10_RL_ACTION_COUNT; action++) {
            const gradient = advantageGradient[action];
            const offset = action * FLOOR10_RL_HIDDEN_SIZE;
            for (let hidden = 0; hidden < FLOOR10_RL_HIDDEN_SIZE; hidden++) {
                this.online.advantageWeights[offset + hidden] -= LEARNING_RATE
                    * gradient
                    * pass.hidden2[hidden];
            }
            this.online.advantageBias[action] -= LEARNING_RATE * gradient;
        }
        for (let target = 0; target < FLOOR10_RL_HIDDEN_SIZE; target++) {
            const offset = target * FLOOR10_RL_HIDDEN_SIZE;
            for (let source = 0; source < FLOOR10_RL_HIDDEN_SIZE; source++) {
                this.online.hiddenWeights[offset + source] -= LEARNING_RATE
                    * hidden2Gradient[target]
                    * pass.hidden1[source];
            }
            this.online.hiddenBias[target] -= LEARNING_RATE * hidden2Gradient[target];
        }
        for (let target = 0; target < FLOOR10_RL_HIDDEN_SIZE; target++) {
            const offset = target * FLOOR10_RL_STATE_SIZE;
            for (let source = 0; source < FLOOR10_RL_STATE_SIZE; source++) {
                this.online.inputWeights[offset + source] -= LEARNING_RATE
                    * hidden1Gradient[target]
                    * experience.state[source];
            }
            this.online.inputBias[target] -= LEARNING_RATE * hidden1Gradient[target];
        }
        return error;
    }

    private softUpdateTarget() {
        const pairs: Array<[Float32Array, Float32Array]> = [
            [this.target.inputWeights, this.online.inputWeights],
            [this.target.inputBias, this.online.inputBias],
            [this.target.hiddenWeights, this.online.hiddenWeights],
            [this.target.hiddenBias, this.online.hiddenBias],
            [this.target.valueWeights, this.online.valueWeights],
            [this.target.valueBias, this.online.valueBias],
            [this.target.advantageWeights, this.online.advantageWeights],
            [this.target.advantageBias, this.online.advantageBias],
        ];
        for (const [target, online] of pairs) {
            for (let index = 0; index < target.length; index++) {
                target[index] += (online[index] - target[index]) * TARGET_TAU;
            }
        }
    }

    snapshot(): Floor10ReinforcementSnapshot {
        return {
            source: 'floor10-dueling-double-dqn',
            parameterCount: FLOOR10_RL_PARAMETER_COUNT,
            experiences: this.experiences,
            replaySize: this.replay.length,
            trainingSteps: this.trainingSteps,
            confidence: this.confidence(),
            lastReward: this.lastReward,
        };
    }

    persist() {
        if (!this.storage) return;
        const saved: SavedNetwork = {
            version: STORAGE_VERSION,
            trainingSteps: this.trainingSteps,
            experiences: this.experiences,
            weights: {
                inputWeights: Array.from(this.online.inputWeights),
                inputBias: Array.from(this.online.inputBias),
                hiddenWeights: Array.from(this.online.hiddenWeights),
                hiddenBias: Array.from(this.online.hiddenBias),
                valueWeights: Array.from(this.online.valueWeights),
                valueBias: Array.from(this.online.valueBias),
                advantageWeights: Array.from(this.online.advantageWeights),
                advantageBias: Array.from(this.online.advantageBias),
            },
        };
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(saved));
        } catch {
            // Storage cheio/privado não impede a autonomia desta sessão.
        }
    }

    private restore() {
        if (!this.storage) return;
        try {
            const raw = this.storage.getItem(this.storageKey);
            if (!raw) return;
            const saved = JSON.parse(raw) as Partial<SavedNetwork>;
            const weights = saved.weights;
            if (
                saved.version !== STORAGE_VERSION
                || !weights
                || !finiteArray(weights.inputWeights, this.online.inputWeights.length)
                || !finiteArray(weights.inputBias, this.online.inputBias.length)
                || !finiteArray(weights.hiddenWeights, this.online.hiddenWeights.length)
                || !finiteArray(weights.hiddenBias, this.online.hiddenBias.length)
                || !finiteArray(weights.valueWeights, this.online.valueWeights.length)
                || !finiteArray(weights.valueBias, this.online.valueBias.length)
                || !finiteArray(weights.advantageWeights, this.online.advantageWeights.length)
                || !finiteArray(weights.advantageBias, this.online.advantageBias.length)
            ) return;

            this.online.inputWeights.set(weights.inputWeights);
            this.online.inputBias.set(weights.inputBias);
            this.online.hiddenWeights.set(weights.hiddenWeights);
            this.online.hiddenBias.set(weights.hiddenBias);
            this.online.valueWeights.set(weights.valueWeights);
            this.online.valueBias.set(weights.valueBias);
            this.online.advantageWeights.set(weights.advantageWeights);
            this.online.advantageBias.set(weights.advantageBias);
            this.target = copyNetwork(this.online);
            this.trainingSteps = Math.max(0, Math.floor(Number(saved.trainingSteps) || 0));
            this.experiences = Math.max(0, Math.floor(Number(saved.experiences) || 0));
        } catch {
            // Snapshot inválido é ignorado; uma rede nova assume sem quebrar o NPC.
        }
    }
}
