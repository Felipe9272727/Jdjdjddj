import { describe, expect, it } from 'vitest';
import {
    SMALL_BRAIN_COMPLETION_CONFIG,
    SMALL_BRAIN_LOAD_CONFIG,
    SMALL_BRAIN_MODEL,
    SMALL_BRAIN_THREADS,
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

    it('mantém o teto ilimitado, mas usa quatro threads e saída curta', () => {
        expect(SMALL_BRAIN_COMPLETION_CONFIG.max_tokens).toBe(-1);
        expect(SMALL_BRAIN_THREADS).toBe(4);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_threads).toBe(4);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_ctx).toBeGreaterThanOrEqual(4096);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_gpu_layers).toBe(0);
        expect(SMALL_BRAIN_LOAD_CONFIG.default_template_kwargs).toEqual({
            enable_thinking: false,
        });
        expect(SMALL_BRAIN_COMPLETION_CONFIG.chat_template_kwargs).toEqual({
            enable_thinking: false,
        });
        expect(SMALL_BRAIN_COMPLETION_CONFIG.cache_prompt).toBe(true);
        expect(SMALL_BRAIN_COMPLETION_CONFIG.grammar).toContain('CHOICE: ');
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

describe('a conversa tem prioridade absoluta sobre a deliberação', () => {
    it('não delibera enquanto o 3B está respondendo', async () => {
        const { deliberateFloor10, resetSmallBrainForTests } = await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        // Jogador conversando: a deliberação precisa desistir sem tocar na CPU.
        npcSet({ open: true, phase: 'thinking' });
        const decided = await deliberateFloor10({
            perception: PERCEPTION,
            drives: { social: 0.5, curiosity: 0.5, restlessness: 0.5, fatigue: 0.1 },
            memory: { inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 0, lastGoals: [] },
            now: 0,
        });
        expect(decided).toBeNull();
        npcSet({ open: false, phase: 'cold' });
    });

    it('abortDeliberation devolve a fase para repouso', async () => {
        const { abortDeliberation } = await import('../npc/floor10SmallBrain');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({ deliberationPhase: 'thinking' });
        abortDeliberation();
        expect(npc.deliberationPhase).toBe('off');
    });
});

describe('um modelo por vez na memória', () => {
    it('unloadSmallBrain devolve a fase para repouso e libera o motor', async () => {
        const { unloadSmallBrain } = await import('../npc/floor10SmallBrain');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({ deliberationPhase: 'thinking' });
        await unloadSmallBrain();
        expect(npc.deliberationPhase).toBe('off');
    });

    it('descarregar duas vezes seguidas não quebra', async () => {
        const { unloadSmallBrain } = await import('../npc/floor10SmallBrain');
        await unloadSmallBrain();
        await expect(unloadSmallBrain()).resolves.toBeUndefined();
    });
});
