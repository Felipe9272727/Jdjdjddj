import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    caminhosDaEspeculativa,
    cargaRapidaLigada,
    configuracaoCargaRapida,
    definirRuntimeFloor10,
    especulativaLigada,
    FLOOR10_FAST_LOAD_CHUNK_BYTES,
    parametrosEspeculativos,
    PASTA_ESPECULATIVA,
    prepararEspeculativa,
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
        expect(esm).toContain('modelLoadActivityCallback');
        expect(esm).toContain('stage: "file-read"');
        expect(esm).toContain('fs.write_opfs');
        expect(esm).toContain('createSyncAccessHandle');
        expect(esm).toContain('opfs-mmap');
        // A região que ficava muda — buscar o .wasm, compilar, acordar as
        // threads, reservar o GGUF — agora tem nome em cada passo.
        // A PONTE DE PTHREAD. Sem estas duas linhas o pool de threads nunca
        // fecha o handshake e a carga do N-gram não termina NUNCA — foi o
        // travamento reproduzido no Chromium e vivido no celular. Um rebuild
        // do bundle que as perca reprova aqui, não no aparelho de quem joga.
        expect(esm).toContain('globalThis.__emPthreadUrl||_scriptName');
        // Erro de worker precisa CHEGAR. Um DOMException (QuotaExceededError)
        // não é clonável: passá-lo inteiro derruba o postMessage e a carga fica
        // "carregando" para sempre em vez de dizer que faltou espaço.
        expect(esm).toContain("args: ['exception', message, stack, null]");
        expect(esm).not.toContain("args: ['exception', message, stack, err]");
        expect(esm).toContain('globalThis.__emPthreadUrl = URL.createObjectURL(argMainScriptBlob)');
        expect(esm).toContain('wasm-boot');
        expect(esm).toContain('wasm-ready');
        expect(esm).toContain('heapfs-reserve');
        expect(esm).toContain('llama-start');
        expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    });

    it('ligada por padrão; `?semngram` é a saída de emergência', () => {
        // Medido no navegador: empata no pior caso, 1,43× no melhor, texto
        // idêntico. Um recurso assim não fica escondido atrás de flag.
        expect(especulativaLigada('')).toBe(true);
        expect(especulativaLigada('?bancada')).toBe(true);
        expect(especulativaLigada('?especulativa')).toBe(true);
        expect(especulativaLigada('?semngram')).toBe(false);
        expect(especulativaLigada('?bancada&semngram')).toBe(false);
    });

    it('a bancada alterna os runtimes sem adulterar consultas explícitas à URL', () => {
        definirRuntimeFloor10('ngram');
        expect(runtimeFloor10()).toBe('ngram');
        expect(especulativaLigada()).toBe(true);
        // Consulta explícita ignora a escolha da bancada e lê só a URL.
        expect(especulativaLigada('?semngram')).toBe(false);

        definirRuntimeFloor10('normal');
        expect(runtimeFloor10()).toBe('normal');
        expect(especulativaLigada()).toBe(false);
        expect(especulativaLigada('?bancada')).toBe(true);
    });

    it('a carga OPFS tem flag PRÓPRIA: `?especulativa` não a arrasta junto', () => {
        // Ligar o N-gram é uma decisão; trocar o jeito de ler 1,92 GB do disco
        // é outra. Amarradas, a bancada comparava duas coisas de uma vez — e a
        // que não terminava era a segunda.
        expect(cargaRapidaLigada('?especulativa')).toBe(false);
        expect(cargaRapidaLigada('')).toBe(false);
        expect(cargaRapidaLigada('?cargarapida')).toBe(true);
        expect(cargaRapidaLigada('?especulativa&cargarapida')).toBe(true);
        // E o contrário também: desligar o n-grama não liga a carga OPFS.
        expect(cargaRapidaLigada('?semngram')).toBe(false);
    });

    it('pede AUTO-especulação: nenhum modelo rascunhador no caminho', () => {
        // O prefixo `types:` é o que o patch em cpp/wllama-context.h reconhece.
        // Sem ele, a string seria lida como caminho de um .gguf que não existe.
        expect(TIPOS_NGRAMA.startsWith('types:')).toBe(true);
        expect(TIPOS_NGRAMA).toContain('ngram-cache');
        // Regressão do travamento pós-download: nesta build, ngram-simple usa
        // silenciosamente o padrão de 48 propostas ao montar o contexto.
        expect(TIPOS_NGRAMA).not.toContain('ngram-simple');
        // Nada de .gguf: é isto que dispensa download, RAM e vocabulário igual.
        expect(TIPOS_NGRAMA).not.toContain('.gguf');
    });

    it('não envia controles de modelo rascunhador que o N-gram ignora', () => {
        const p = parametrosEspeculativos();
        expect(p).toEqual({ spec_draft_model: TIPOS_NGRAMA });
        expect(p).not.toHaveProperty('spec_draft_n_max');
        expect(p).not.toHaveProperty('spec_draft_n_min');
        expect(p).not.toHaveProperty('spec_draft_p_min');
        expect(p).not.toHaveProperty('spec_draft_ngl');
    });

    it('monta o GGUF em blocos grandes usando a mesma chave de cache', () => {
        const url = 'https://huggingface.co/modelo/resolve/main/modelo.gguf';
        expect(configuracaoCargaRapida(url)).toEqual({
            cacheURL: url,
            chunkBytes: FLOOR10_FAST_LOAD_CHUNK_BYTES,
        });
        expect(FLOOR10_FAST_LOAD_CHUNK_BYTES).toBe(16 * 1024 * 1024);
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

});

describe('prepararEspeculativa — o runtime de 5,85 MB não se busca duas vezes', () => {
    const baldeFalso = (guardado: Record<string, boolean>) => {
        const adicionados: string[] = [];
        return {
            balde: {
                match: async (caminho: string) => (
                    guardado[caminho]
                        ? new Response('export const Wllama = class {};')
                        : undefined
                ),
                add: async (caminho: string) => {
                    adicionados.push(caminho);
                    guardado[caminho] = true;
                },
            },
            adicionados,
        };
    };

    const comCaches = (balde: unknown) => {
        (globalThis as Record<string, unknown>).caches = {
            open: async () => balde,
        };
    };

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).caches;
    });

    it('guarda o par na primeira vez e o serve do disco na seguinte', async () => {
        const { esm, wasm } = caminhosDaEspeculativa();
        const primeiro = baldeFalso({});
        comCaches(primeiro.balde);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:runtime');

        const frio = await prepararEspeculativa();
        expect(frio.origem).toBe('rede');
        expect(primeiro.adicionados).toEqual([esm, wasm]);

        // Nova visita à página: o balde já tem os dois, então ninguém sai à rede.
        resetCaminhosEspeculativosForTests();
        const segundo = baldeFalso({ [esm]: true, [wasm]: true });
        comCaches(segundo.balde);
        const quente = await prepararEspeculativa();
        expect(quente.origem).toBe('guardado');
        expect(segundo.adicionados).toEqual([]);
    });

    it('prepara uma vez só, por mais que perguntem', async () => {
        const { adicionados, balde } = baldeFalso({});
        comCaches(balde);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:runtime');

        const [a, b] = await Promise.all([prepararEspeculativa(), prepararEspeculativa()]);
        expect(a).toBe(b);
        expect(adicionados).toHaveLength(2);
    });

    it('o single-file não toca no balde: o par já veio dentro do HTML', async () => {
        (globalThis as Record<string, unknown>).__TNE_WLLAMA_ESPEC__ = {
            esm: 'export const Wllama = class {};',
            wasmBase64: 'AGFzbQ==',
        };
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:embutido');
        const { adicionados, balde } = baldeFalso({});
        comCaches(balde);

        expect((await prepararEspeculativa()).origem).toBe('embutido');
        expect(adicionados).toEqual([]);
    });

    it('balde quebrado devolve os caminhos HTTP: otimização não derruba fala', async () => {
        (globalThis as Record<string, unknown>).caches = {
            open: async () => { throw new Error('sem permissão de armazenamento'); },
        };

        const runtime = await prepararEspeculativa();
        expect(runtime).toEqual({ ...caminhosDaEspeculativa(), origem: 'rede' });
    });
});
