import { describe, expect, it } from 'vitest';
import {
    FLOOR10_MOTOR_COMPLETION_CONFIG,
    FLOOR10_MOTOR_LOAD_CONFIG,
    FLOOR10_MOTOR_LOAD_TIMEOUT_MS,
    FLOOR10_MOTOR_MODEL,
    FLOOR10_MOTOR_THREADS,
    FLOOR10_MOTOR_TIMEOUT_MS,
    FLOOR10_MOTOR_TOKENS,
    FLOOR10_MOTOR_USE_CACHE,
    motorBrainThreads,
    translateWithMotorEngine,
} from '../npc/floor10MotorBrain';
import { perceiveFloor10 } from '../npc/floor10Perception';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: 0,
    playerPosition: null,
});

describe('npc/floor10MotorBrain — a terceira LLM especializada', () => {
    it('usa pesos próprios de 135M sem ocupar o cache persistente da fala', () => {
        expect(FLOOR10_MOTOR_MODEL.id).toBe('smollm2-135m-instruct');
        expect(FLOOR10_MOTOR_MODEL.url).toMatch(/SmolLM2-135M.*Q4_K_M\.gguf$/);
        expect(FLOOR10_MOTOR_MODEL.bytes).toBeLessThanOrEqual(110_000_000);
        expect(FLOOR10_MOTOR_USE_CACHE).toBe(false);
    });

    it('limita CPU, contexto, saída e tempo porque só traduz uma linha', () => {
        expect(FLOOR10_MOTOR_THREADS).toBe(2);
        expect(motorBrainThreads()).toBeGreaterThanOrEqual(1);
        expect(motorBrainThreads()).toBeLessThanOrEqual(FLOOR10_MOTOR_THREADS);
        expect(FLOOR10_MOTOR_LOAD_CONFIG.n_ctx).toBe(768);
        expect(FLOOR10_MOTOR_LOAD_CONFIG.n_batch).toBe(128);
        expect(FLOOR10_MOTOR_LOAD_CONFIG.n_gpu_layers).toBe(0);
        expect(FLOOR10_MOTOR_COMPLETION_CONFIG.max_tokens).toBe(FLOOR10_MOTOR_TOKENS);
        expect(FLOOR10_MOTOR_COMPLETION_CONFIG.temperature).toBe(0);
        expect(FLOOR10_MOTOR_COMPLETION_CONFIG.grammar).toContain('"approach"');
        expect(FLOOR10_MOTOR_COMPLETION_CONFIG.chat_template_kwargs).toEqual({
            enable_thinking: false,
        });
        expect(FLOOR10_MOTOR_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
        expect(FLOOR10_MOTOR_LOAD_TIMEOUT_MS).toBe(180_000);
    });

    it('transforma o pensamento pronto do MiniBrain num plano tipado', async () => {
        let request: Record<string, unknown> | null = null;
        const engine = {
            loadModelFromUrl: async () => undefined,
            createChatCompletion: async (options: Record<string, unknown>) => {
                request = options;
                return {
                    choices: [{
                        message: {
                            content: 'MOTION: approach | elevator | normal | 6',
                        },
                    }],
                };
            },
        };
        const plan = await translateWithMotorEngine(
            engine,
            'I want to go closer to that stubborn door.',
            PERCEPTION,
        );
        expect(plan).toMatchObject({
            verb: 'approach',
            target: 'elevator',
            pace: 'normal',
            duration: 6,
        });
        expect(request).toMatchObject({
            max_tokens: FLOOR10_MOTOR_TOKENS,
            temperature: 0,
            stream: false,
        });
        expect((request as Record<string, unknown>).grammar).not.toContain('"player"');
    });

    it('falha aberto: saída inválida não apaga a escolha ampla do MiniBrain', async () => {
        const engine = {
            loadModelFromUrl: async () => undefined,
            createChatCompletion: async () => ({
                choices: [{ message: { content: 'walk into the wall' } }],
            }),
        };
        await expect(translateWithMotorEngine(
            engine,
            'I should inspect the door.',
            PERCEPTION,
        )).resolves.toBeNull();
    });

    it('devolve a CPU imediatamente se a conversa interromper um Worker preso', async () => {
        const parent = new AbortController();
        const engine = {
            loadModelFromUrl: async () => undefined,
            createChatCompletion: async () => new Promise<unknown>(() => undefined),
        };
        const pending = translateWithMotorEngine(
            engine,
            'I want to walk toward the door.',
            PERCEPTION,
            null,
            parent.signal,
        );
        parent.abort();
        await expect(pending).resolves.toBeNull();
    });
});
