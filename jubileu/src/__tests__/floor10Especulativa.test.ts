import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    caminhosDaEspeculativa,
    definirRuntimeFloor10,
    especulativaLigada,
    parametrosEspeculativos,
    PASTA_ESPECULATIVA,
    RASCUNHO_N_MAX,
    resetCaminhosEspeculativosForTests,
    resetRuntimeFloor10ForTests,
    runtimeFloor10,
    TIPOS_NGRAMA,
} from '../npc/floor10Especulativa';

afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TNE_WLLAMA_ESPEC__;
    resetCaminhosEspeculativosForTests();
    resetRuntimeFloor10ForTests();
    vi.restoreAllMocks();
});

describe('floor10Especulativa — n-gramas ligados pelo wllama recompilado', () => {
    it('publica o par ESM/WASM dentro do public usado pelo Vite e pela Vercel', () => {
        const esmPath = fileURLToPath(new URL(
            '../../public/wllama-espec/index.js',
            import.meta.url,
        ));
        const wasmPath = fileURLToPath(new URL(
            '../../public/wllama-espec/wllama.wasm',
            import.meta.url,
        ));
        const esm = readFileSync(esmPath, 'utf8');
        const wasm = readFileSync(wasmPath);

        expect(esm).toContain('Wllama');
        expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    });

    it('desligada por padrão; só `?especulativa` liga', () => {
        expect(especulativaLigada('')).toBe(false);
        expect(especulativaLigada('?bancada')).toBe(false);
        expect(especulativaLigada('?especulativa')).toBe(true);
        expect(especulativaLigada('?bancada&especulativa')).toBe(true);
    });

    it('a bancada alterna os runtimes sem adulterar consultas explícitas à URL', () => {
        definirRuntimeFloor10('ngram');
        expect(runtimeFloor10()).toBe('ngram');
        expect(especulativaLigada()).toBe(true);
        expect(especulativaLigada('?bancada')).toBe(false);

        definirRuntimeFloor10('normal');
        expect(runtimeFloor10()).toBe('normal');
        expect(especulativaLigada()).toBe(false);
        expect(especulativaLigada('?especulativa')).toBe(true);
    });

    it('pede AUTO-especulação: nenhum modelo rascunhador no caminho', () => {
        // O prefixo `types:` é o que o patch em cpp/wllama-context.h reconhece.
        // Sem ele, a string seria lida como caminho de um .gguf que não existe.
        expect(TIPOS_NGRAMA.startsWith('types:')).toBe(true);
        expect(TIPOS_NGRAMA).toContain('ngram-simple');
        expect(TIPOS_NGRAMA).toContain('ngram-cache');
        // Nada de .gguf: é isto que dispensa download, RAM e vocabulário igual.
        expect(TIPOS_NGRAMA).not.toContain('.gguf');
    });

    it('os parâmetros vão pelo campo público do LoadModelParams', () => {
        const p = parametrosEspeculativos();
        expect(p.spec_draft_model).toBe(TIPOS_NGRAMA);
        expect(p.spec_draft_n_max).toBe(RASCUNHO_N_MAX);
        expect(p).toHaveProperty('spec_draft_n_min');
        expect(p).toHaveProperty('spec_draft_p_min');
        // A CPU manda aqui: a GPU deste andar já custou duas falas perdidas.
        expect(p.spec_draft_ngl).toBe(0);
    });

    it('o ESM e o .wasm vêm do MESMO lugar — eles andam em par', () => {
        const { esm, wasm } = caminhosDaEspeculativa();
        // O glue do emscripten e o binário são gerados juntos; misturar o ESM
        // do CDN com este .wasm (ou o contrário) quebra na carga.
        expect(esm.startsWith(PASTA_ESPECULATIVA)).toBe(true);
        expect(wasm.startsWith(PASTA_ESPECULATIVA)).toBe(true);
        expect(wasm.endsWith('.wasm')).toBe(true);
    });

    it('no single-file usa Blob URLs e não depende de módulo externo', () => {
        (globalThis as Record<string, unknown>).__TNE_WLLAMA_ESPEC__ = {
            esm: 'export const Wllama = class {};',
            // Cabeçalho mágico de um módulo WASM: \0asm.
            wasmBase64: 'AGFzbQ==',
        };
        const criar = vi.spyOn(URL, 'createObjectURL')
            .mockReturnValueOnce('blob:wllama-esm')
            .mockReturnValueOnce('blob:wllama-wasm');

        expect(caminhosDaEspeculativa()).toEqual({
            esm: 'blob:wllama-esm',
            wasm: 'blob:wllama-wasm',
        });
        // A mesma instância precisa usar o mesmo par ESM/WASM até descarregar.
        expect(caminhosDaEspeculativa().wasm).toBe('blob:wllama-wasm');
        expect(criar).toHaveBeenCalledTimes(2);
    });

    it('n_min nunca passa de n_max — o llama.cpp trunca, mas melhor não depender', () => {
        const p = parametrosEspeculativos();
        expect(Number(p.spec_draft_n_min)).toBeLessThanOrEqual(Number(p.spec_draft_n_max));
        expect(Number(p.spec_draft_n_min)).toBeGreaterThanOrEqual(0);
    });

    it('p_min fica entre 0 e 1 — é probabilidade, não contador', () => {
        const p = Number(parametrosEspeculativos().spec_draft_p_min);
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThanOrEqual(1);
    });
});
