import { describe, expect, it } from 'vitest';
import {
    FLOOR10_RL_ACTIONS,
    FLOOR10_RL_PARAMETER_COUNT,
    FLOOR10_RL_STATE_SIZE,
    Floor10ReinforcementLearner,
} from '../npc/floor10Reinforcement';

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
    };
}

describe('npc/floor10Reinforcement — RL neural ligada à Utility AI', () => {
    it('usa uma Dueling Double DQN compacta de 3.993 parâmetros treináveis', () => {
        expect(FLOOR10_RL_PARAMETER_COUNT).toBe(3993);
        expect(FLOOR10_RL_STATE_SIZE).toBe(24);
        expect(FLOOR10_RL_ACTIONS).toHaveLength(8);
        const learner = new Floor10ReinforcementLearner({ seed: 3, storage: null });
        expect(learner.snapshot()).toMatchObject({
            source: 'floor10-dueling-double-dqn',
            parameterCount: 3993,
            experiences: 0,
            confidence: 0,
        });
    });

    it('aprende consequências com replay priorizado sem dominar o score-base', () => {
        const learner = new Floor10ReinforcementLearner({ seed: 9, storage: null });
        const state = new Float32Array(FLOOR10_RL_STATE_SIZE);
        const next = new Float32Array(FLOOR10_RL_STATE_SIZE);
        state[0] = 0.9;
        state[5] = 1;
        state[8] = 1;
        next.set(state);

        for (let step = 0; step < 90; step++) {
            learner.remember(state, 'talk-player', 1, next);
            learner.remember(state, 'idle', -1, next);
        }

        expect(learner.rawActionValue(state, 'talk-player'))
            .toBeGreaterThan(learner.rawActionValue(state, 'idle'));
        expect(learner.utilityBonus(state, 'talk-player')).toBeGreaterThan(0);
        expect(Math.abs(learner.utilityBonus(state, 'talk-player'))).toBeLessThanOrEqual(0.22);
        expect(learner.snapshot()).toMatchObject({
            experiences: 180,
            replaySize: 180,
        });
        expect(learner.snapshot().trainingSteps).toBeGreaterThan(0);
        expect(learner.snapshot().confidence).toBe(1);
    });

    it('persiste os pesos aprendidos e restaura sem novo download', () => {
        const storage = memoryStorage();
        const state = new Float32Array(FLOOR10_RL_STATE_SIZE);
        state[2] = 0.8;
        const first = new Floor10ReinforcementLearner({
            seed: 15,
            storage,
            storageKey: 'test-nilo-rl',
        });
        for (let step = 0; step < 20; step++) {
            first.remember(state, 'wander', 0.7, state);
        }
        first.persist();
        const learnedValue = first.rawActionValue(state, 'wander');

        const restored = new Floor10ReinforcementLearner({
            seed: 999,
            storage,
            storageKey: 'test-nilo-rl',
        });
        expect(restored.rawActionValue(state, 'wander')).toBeCloseTo(learnedValue, 6);
        expect(restored.snapshot().experiences).toBe(first.snapshot().experiences);
        expect(restored.snapshot().trainingSteps).toBe(first.snapshot().trainingSteps);
    });
});
