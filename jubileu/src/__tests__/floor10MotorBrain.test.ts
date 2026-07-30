import { describe, expect, it } from 'vitest';
import {
    abortFloor10MotorBrain,
    FLOOR10_MOTOR_COMPLETION_CONFIG,
    FLOOR10_MOTOR_LOAD_CONFIG,
    FLOOR10_MOTOR_LOAD_TIMEOUT_MS,
    FLOOR10_MOTOR_MODEL,
    FLOOR10_MOTOR_SIZE_LABEL,
    FLOOR10_MOTOR_THREADS,
    FLOOR10_MOTOR_TIMEOUT_MS,
    FLOOR10_MOTOR_TOKENS,
    FLOOR10_MOTOR_USE_CACHE,
    motorBrainThreads,
    resetFloor10MotorBrainForTests,
    translateWithMotorEngine,
} from '../npc/floor10MotorBrain';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { npc, npcSet } from '../npc/npcStore';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: 0,
    playerPosition: null,
});

describe('npc/floor10MotorBrain — a terceira LLM especializada', () => {
    it('usa pesos próprios de 360M e não baixa tudo de novo em cada sessão', () => {
        expect(FLOOR10_MOTOR_MODEL.id).toBe('smollm2-360m-instruct');
        expect(FLOOR10_MOTOR_MODEL.url).toMatch(/SmolLM2-360M.*Q8_0\.gguf$/);
        // 386 MB, e não os 105 MB do 135M que estava aqui antes. Medido no
        // prompt real de tradução: o 135M respondia a MESMA linha para todo
        // pensamento — `stay | self` para tudo com um prompt, `approach |
        // player` para tudo com outro. Ele não lia a frase, copiava o exemplo
        // mais próximo. O 360M é o menor que diferencia (15/30 verbos contra
        // 10/30), e trocar Q4 por Q8 no 135M não mudou NADA: o gargalo era
        // tamanho, não precisão.
        expect(FLOOR10_MOTOR_MODEL.bytes).toBeLessThanOrEqual(400_000_000);
        expect(FLOOR10_MOTOR_USE_CACHE).toBe(true);
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

describe('o download do motor tem barra PRÓPRIA, do lado da barra do 1B', () => {
    it('anuncia o tamanho a partir dos bytes de verdade, nunca de um número escrito à mão', () => {
        // O texto na tela dizia "105 MB" — o tamanho do 135M que já não é mais
        // usado — enquanto baixava 386 MB. Derivar do campo `bytes` torna esse
        // erro impossível de repetir.
        expect(FLOOR10_MOTOR_SIZE_LABEL).toBe('386 MB');
        expect(FLOOR10_MOTOR_SIZE_LABEL).not.toContain('105');
    });

    it('escreve nos campos do MOTOR e não encosta nos da vontade', () => {
        resetFloor10MotorBrainForTests();
        npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 0.5,
            deliberationLoadText: 'baixando Llama 3.2 1B (Q8)',
            deliberationDownload: {
                fraction: 0.5, bytes: 660_000_000, totalBytes: 1_321_083_008,
                rate: 20e6, etaSec: 33, stalledSec: 0,
            },
        });
        // Era exatamente aqui que a tela mentia: o motor publicava
        // `deliberationLoadProgress`, então a barra rotulada "Llama 3.2 1B"
        // passava a mostrar o progresso de OUTRO arquivo, e o estado real do
        // 1B desaparecia.
        npcSet({
            motorPhase: 'loading',
            motorLoadProgress: 0.25,
            motorLoadText: `baixando ${FLOOR10_MOTOR_MODEL.label}`,
            motorDownload: {
                fraction: 0.25, bytes: 96_601_320,
                totalBytes: FLOOR10_MOTOR_MODEL.bytes,
                rate: 4.2e6, etaSec: 69, stalledSec: 0,
            },
        });
        expect(npc.motorDownload.totalBytes).toBe(FLOOR10_MOTOR_MODEL.bytes);
        expect(npc.deliberationLoadProgress).toBe(0.5);
        expect(npc.deliberationDownload.totalBytes).toBe(1_321_083_008);
        expect(npc.deliberationLoadText).toContain('Llama');
        expect(npc.deliberationPhase).toBe('thinking');
    });

    it('interromper pela fala para a barra mas PRESERVA o progresso já baixado', () => {
        npcSet({
            motorPhase: 'loading',
            motorLoadProgress: 0.61,
            motorLoadText: 'baixando…',
        });
        abortFloor10MotorBrain();
        expect(npc.motorPhase).toBe('off');
        // O progresso é a única prova de quanto do arquivo já está no cache;
        // zerá-lo faria a próxima tentativa parecer começar do nada.
        expect(npc.motorLoadProgress).toBe(0.61);
        expect(npc.motorLoadText).toContain('interrompido');
    });

    it('não reescreve a fase quando o motor já estava parado', () => {
        npcSet({ motorPhase: 'unavailable', motorLoadText: 'não cabe' });
        abortFloor10MotorBrain();
        expect(npc.motorPhase).toBe('unavailable');
        expect(npc.motorLoadText).toBe('não cabe');
        resetFloor10MotorBrainForTests();
        expect(npc.motorPhase).toBe('off');
        expect(npc.motorLoadProgress).toBe(0);
        expect(npc.motorDownload.bytes).toBe(0);
    });
});
