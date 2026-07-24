import { describe, expect, it } from 'vitest';
import {
    CHAT_COMPLETION_CONFIG,
    CPU_LOAD_CONFIG,
    GenerationTimeoutError,
    WLLAMA_PATHS,
    chunkDelta,
    consumeChatStream,
    cpuThreadCount,
    modelHistory,
    shouldUseFastFallback,
    visibleText,
} from '../npc/wllamaEngine';

describe('npc/wllamaEngine — contrato do wllama 3.5.1', () => {
    it('usa a chave WASM obrigatória "default"', () => {
        expect(Object.keys(WLLAMA_PATHS)).toEqual(['default']);
        expect(WLLAMA_PATHS.default).toMatch(/@wllama\/wllama@3\.5\.1\/esm\/wasm\/wllama\.wasm$/);
    });

    it('mantém um fallback CPU de uma thread e contexto curto', () => {
        expect(CPU_LOAD_CONFIG).toEqual({
            n_ctx: 1024,
            n_threads: 1,
            n_gpu_layers: 0,
            jinja: true,
            reasoning: false,
            default_template_kwargs: { enable_thinking: false },
            warmup: false,
        });
    });

    it('usa até quatro núcleos somente com cross-origin isolation', () => {
        expect(cpuThreadCount(false, 12)).toBe(1);
        expect(cpuThreadCount(true, 2)).toBe(1);
        expect(cpuThreadCount(true, 4)).toBe(2);
        expect(cpuThreadCount(true, 8)).toBe(4);
        expect(cpuThreadCount(true, 16)).toBe(4);
    });

    it('usa os nomes OpenAI-compatible aceitos pela API v3', () => {
        expect(CHAT_COMPLETION_CONFIG).toMatchObject({
            stream: true,
            max_tokens: 64,
            temperature: 0.45,
            top_p: 0.85,
            top_k: 40,
            cache_prompt: true,
        });
        expect(CHAT_COMPLETION_CONFIG).not.toHaveProperty('nPredict');
        expect(CHAT_COMPLETION_CONFIG).not.toHaveProperty('sampling');
    });

    it('extrai texto do streaming OpenAI choices[0].delta.content', () => {
        expect(chunkDelta({
            choices: [{ delta: { content: 'Oi' } }],
        })).toBe('Oi');
        expect(chunkDelta({
            choices: [{ delta: { content: null } }],
        })).toBe('');
    });

    it('mantém compatibilidade defensiva com chunks antigos', () => {
        expect(chunkDelta({ piece: ' legado' })).toBe(' legado');
    });

    it('remove o raciocínio interno antes de exibir a resposta', () => {
        expect(visibleText('<think>pensando</think>  resposta')).toBe('resposta');
    });

    it('limita o contexto sem apagar a conversa exibida', () => {
        const history = ['1', '2', '3', '4', '5', '6', '7', '8'];
        expect(modelHistory(history)).toEqual(['3', '4', '5', '6', '7', '8']);
        expect(history).toHaveLength(8);
    });

    it('consome o stream OpenAI e publica somente o texto visível', async () => {
        async function* chunks() {
            yield { choices: [{ delta: { content: '<think>' } }] };
            yield { choices: [{ delta: { content: '</think> Oi' } }] };
            yield { choices: [{ delta: { content: ', tudo bem?' } }] };
        }
        const visible: string[] = [];
        const raw = await consumeChatStream(
            Promise.resolve(chunks()),
            (text) => visible.push(text),
            { firstTokenMs: 200, nextTokenMs: 200 },
        );
        expect(raw).toBe('<think></think> Oi, tudo bem?');
        expect(visible.at(-1)).toBe('Oi, tudo bem?');
    });

    it('interrompe um stream que não produz o primeiro token', async () => {
        const never: AsyncIterable<never> = {
            [Symbol.asyncIterator]() {
                return { next: () => new Promise(() => {}) };
            },
        };
        let timeoutStage = '';
        await expect(consumeChatStream(
            Promise.resolve(never),
            () => undefined,
            {
                firstTokenMs: 15,
                nextTokenMs: 15,
                onTimeout: (stage) => { timeoutStage = stage; },
            },
        )).rejects.toBeInstanceOf(GenerationTimeoutError);
        expect(timeoutStage).toBe('first-token');
    });

    it('não corta uma resposta longa enquanto os chunks continuam chegando', async () => {
        async function* slowChunks() {
            yield { choices: [{ delta: { content: 'Oi' } }] };
            await new Promise((resolve) => setTimeout(resolve, 20));
            yield { choices: [{ delta: { content: ', jogador' } }] };
            await new Promise((resolve) => setTimeout(resolve, 20));
            yield { choices: [{ delta: { content: '!' } }] };
        }
        const raw = await consumeChatStream(
            Promise.resolve(slowChunks()),
            () => undefined,
            { firstTokenMs: 100, nextTokenMs: 100 },
        );
        expect(raw).toBe('Oi, jogador!');
    });

    it('preserva a resposta parcial e identifica timeout após o texto começar', async () => {
        async function* partialThenStall() {
            yield { choices: [{ delta: { content: 'Ainda estou aqui' } }] };
            await new Promise(() => {});
        }
        let thrown: unknown;
        try {
            await consumeChatStream(
                Promise.resolve(partialThenStall()),
                () => undefined,
                { firstTokenMs: 100, nextTokenMs: 30 },
            );
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(GenerationTimeoutError);
        expect(thrown).toMatchObject({
            stage: 'next-token',
            hadVisibleText: true,
            partialText: 'Ainda estou aqui',
        });
    });

    it('só permite o 0.8B quando o 2B não publicou nenhum texto', () => {
        expect(shouldUseFastFallback(
            new GenerationTimeoutError('first-token'),
            0,
            0,
            false,
        )).toBe(true);
        expect(shouldUseFastFallback(
            new GenerationTimeoutError('next-token', true, 'Oi,'),
            0,
            0,
            false,
        )).toBe(false);
        expect(shouldUseFastFallback(
            new GenerationTimeoutError('first-token'),
            1,
            0,
            false,
        )).toBe(false);
    });
});
