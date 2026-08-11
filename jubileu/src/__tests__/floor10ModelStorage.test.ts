import { describe, expect, it } from 'vitest';
import {
    CACHE_HEADROOM,
    deleteCachedModel,
    formatGB,
    isBrokenModelCacheError,
    nomeNoCacheDoWllama,
    planModelCache,
    probeModelStorageBackend,
} from '../npc/floor10ModelStorage';

const GB = 1e9;

describe('floor10ModelStorage — a cota que travava a carga', () => {
    it('reprova o caso REAL medido no jogo (cota 1,07 GB, modelo 1,92 GB)', () => {
        const plano = planModelCache({ quota: 1.07 * GB, usage: 0 }, 1.915 * GB);
        expect(plano.ok).toBe(false);
        if (plano.ok) return;
        expect(plano.message).toContain('1.07 GB');
        expect(plano.message).toContain('modelo');
    });

    it('aprova quando sobra espaço de verdade', () => {
        const plano = planModelCache({ quota: 6 * GB, usage: 1 * GB }, 1.915 * GB);
        expect(plano.ok).toBe(true);
        expect(plano.freeBytes).toBe(5 * GB);
    });

    it('conta o que já está em uso, não só a cota total', () => {
        // 3 GB de cota parecem suficientes até lembrar que 1,5 GB já foi gasto.
        expect(planModelCache({ quota: 3 * GB, usage: 1.5 * GB }, 1.915 * GB).ok).toBe(false);
    });

    it('exige uma folga além do tamanho puro do arquivo', () => {
        const justo = planModelCache({ quota: 1.92 * GB, usage: 0 }, 1.915 * GB);
        expect(justo.ok).toBe(false);
        expect(CACHE_HEADROOM).toBeGreaterThan(1);
    });

    it('na dúvida deixa tentar em vez de bloquear o NPC', () => {
        expect(planModelCache({ quota: null, usage: 0 }, 1.915 * GB).ok).toBe(true);
        expect(planModelCache({ quota: 1.07 * GB, usage: 0 }, null).ok).toBe(true);
    });
});

describe('floor10ModelStorage — formatação', () => {
    it('fala em GB com duas casas', () => {
        expect(formatGB(1.915e9)).toBe('1.92 GB');
        expect(formatGB(0)).toBe('0.00 GB');
    });
});

describe('floor10ModelStorage — backend e recuperação do GGUF', () => {
    it('explica por que um index aberto como file:// não pode instalar o modelo', async () => {
        const plano = await probeModelStorageBackend('file:', {
            getDirectory: async () => {
                throw new Error('não deveria tocar no OPFS');
            },
        });
        expect(plano.ok).toBe(false);
        expect(plano.message).toContain('file://');
        expect(plano.message).toContain('HTTPS');
    });

    it('confirma o OPFS antes de liberar um download enorme', async () => {
        let probes = 0;
        await expect(probeModelStorageBackend('https:', {
            getDirectory: async () => {
                probes += 1;
                return {};
            },
        })).resolves.toEqual({ ok: true, message: '' });
        expect(probes).toBe(1);

        const indisponivel = await probeModelStorageBackend('https:', {});
        expect(indisponivel.ok).toBe(false);
        expect(indisponivel.message).toContain('OPFS');
    });

    it('reconhece as assinaturas reais de cache parcial do wllama', () => {
        expect(isBrokenModelCacheError(new Error('Model file not found: x.gguf'))).toBe(true);
        expect(isBrokenModelCacheError(new Error('must be non-empty Blob'))).toBe(true);
        expect(isBrokenModelCacheError(
            new Error('Failed to open file x.gguf, model may be invalid'),
        )).toBe(true);
        expect(isBrokenModelCacheError(new Error('network offline'))).toBe(false);
    });

    // ── ESTE TESTE CRAVAVA O DEFEITO ─────────────────────────────────────
    //
    // A versão anterior afirmava `expect(removidos).toEqual([url])` — ou seja,
    // exigia exatamente a chamada que NUNCA apagou nada. O wllama guarda o
    // arquivo como `sha1hex(url)_nome.gguf` e o `delete(key)` dele engole
    // `NotFoundError` calado; passar a URL era um no-op que se declarava
    // bem-sucedido.
    //
    // O efeito no aparelho de quem joga: um download interrompido deixava o
    // cérebro morto PARA SEMPRE, porque a única rotina de conserto não
    // consertava e dizia que sim. O teste verde ajudou a esconder isso.
    it('apaga usando o NOME DO WLLAMA, não a URL', async () => {
        const removidos: string[] = [];
        const url = 'https://models.test/broken.gguf';
        await deleteCachedModel({
            delete: async (chave) => { removidos.push(chave); },
        }, url);
        const nome = await nomeNoCacheDoWllama(url);
        expect(nome).toMatch(/^[0-9a-f]{40}_broken\.gguf$/);
        expect(removidos).toContain(nome);
        expect(removidos).toContain(`__metadata__${nome}`);
    });

    it('o nome é o sha1 da URL — igual ao urlToFileName do wllama', async () => {
        // Conferido contra o bundle do wllama em bancada-navegador/wllama-cdn:
        //   return `${prefix}${hashHex}_${url.split("/").pop()}`
        const a = await nomeNoCacheDoWllama('https://x.test/a.gguf');
        const b = await nomeNoCacheDoWllama('https://x.test/a.gguf');
        const c = await nomeNoCacheDoWllama('https://x.test/b.gguf');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a?.endsWith('_a.gguf')).toBe(true);
    });

    it('sem cacheManager ainda tenta o OPFS — o engine pode nem ter nascido', async () => {
        // O `engine` é criado antes do `loadModelFromUrl`, mas se a falha vier
        // do import do módulo não há `cacheManager` nenhum. Nesse caso o
        // arquivo parcial continua no OPFS e alguém tem de removê-lo.
        await expect(deleteCachedModel(null, 'https://models.test/x.gguf'))
            .resolves.toBe(true);
    });
});
