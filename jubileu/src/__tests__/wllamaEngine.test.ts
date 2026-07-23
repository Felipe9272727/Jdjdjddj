import { describe, expect, it } from 'vitest';
import {
    CHAT_COMPLETION_CONFIG,
    CPU_LOAD_CONFIG,
    WLLAMA_PATHS,
    chunkDelta,
    visibleText,
} from '../npc/wllamaEngine';

describe('npc/wllamaEngine — contrato do wllama 3.5.1', () => {
    it('usa a chave WASM obrigatória "default"', () => {
        expect(Object.keys(WLLAMA_PATHS)).toEqual(['default']);
        expect(WLLAMA_PATHS.default).toMatch(/@wllama\/wllama@3\.5\.1\/esm\/wasm\/wllama\.wasm$/);
    });

    it('força CPU e single-thread no carregamento do modelo', () => {
        expect(CPU_LOAD_CONFIG).toEqual({
            n_ctx: 2048,
            n_threads: 1,
            n_gpu_layers: 0,
        });
    });

    it('usa os nomes OpenAI-compatible aceitos pela API v3', () => {
        expect(CHAT_COMPLETION_CONFIG).toMatchObject({
            stream: true,
            max_tokens: 220,
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
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
});
