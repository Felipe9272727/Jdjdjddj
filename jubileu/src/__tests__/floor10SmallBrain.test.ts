import { describe, expect, it } from 'vitest';
import {
    SMALL_BRAIN_COMPLETION_CONFIG,
    SMALL_BRAIN_LOAD_CONFIG,
    SMALL_BRAIN_MODEL,
    readCompletionText,
} from '../npc/floor10SmallBrain';
import { Floor10WillBrain } from '../npc/floor10Will';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { parseDeliberation } from '../npc/floor10Deliberation';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: 0,
    playerPosition: null,
});

describe('npc/floor10SmallBrain — o cérebro pequeno da deliberação', () => {
    it('usa o MiniCPM5-1B, que só pensa e nunca fala com o jogador', () => {
        expect(SMALL_BRAIN_MODEL.label).toBe('MiniCPM5-1B');
        expect(SMALL_BRAIN_MODEL.url).toMatch(/MiniCPM5-1B.*\.gguf$/i);
    });

    it('delibera SEM teto de tokens — com teto ele nunca conclui', () => {
        expect(SMALL_BRAIN_COMPLETION_CONFIG.max_tokens).toBe(-1);
        // Precisa de contexto largo: o raciocínio inteiro tem que caber.
        expect(SMALL_BRAIN_LOAD_CONFIG.n_ctx).toBeGreaterThanOrEqual(4096);
        // Roda só na CPU, como o resto do motor.
        expect(SMALL_BRAIN_LOAD_CONFIG.n_gpu_layers).toBe(0);
    });

    it('lê o texto nos formatos que o wllama devolve', () => {
        expect(readCompletionText({ choices: [{ message: { content: 'CHOICE: idle' } }] }))
            .toBe('CHOICE: idle');
        expect(readCompletionText({ choices: [{ text: 'CHOICE: wander' }] }))
            .toBe('CHOICE: wander');
        expect(readCompletionText('cru')).toBe('cru');
        expect(readCompletionText(null)).toBe('');
        expect(readCompletionText({})).toBe('');
    });
});

describe('a deliberação inclina o reflexo sem sequestrá-lo', () => {
    const tickFor = (deliberationRaw: string | null) => {
        const brain = new Floor10WillBrain();
        const deliberation = deliberationRaw ? parseDeliberation(deliberationRaw, 0) : null;
        let last = '';
        // Alguns ticks para a vontade assentar.
        for (let i = 0; i < 40; i += 1) {
            const tick = brain.tick({
                dt: 0.1,
                time: i * 0.1,
                perception: PERCEPTION,
                npcPosition: { x: 0, y: 0, z: 2.2 },
                conversationOpen: false,
                speaking: false,
                deliberation,
            });
            last = tick.snapshot.goal;
        }
        return last;
    };

    it('aceita a meta deliberada quando ela chega', () => {
        // Sem deliberação o reflexo decide sozinho; com ela, a meta escolhida
        // ganha peso suficiente para aparecer.
        const semDeliberacao = tickFor(null);
        const comDeliberacao = tickFor('[End thinking]\nCHOICE: inspect-elevator');
        expect(typeof semDeliberacao).toBe('string');
        expect(comDeliberacao).toBe('inspect-elevator');
    });

    it('não quebra quando o cérebro pequeno não assina escolha', () => {
        expect(() => tickFor('ainda pensando, sem decisão')).not.toThrow();
    });
});
