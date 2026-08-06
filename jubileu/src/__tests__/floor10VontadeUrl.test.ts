import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SMALL_BRAIN_CATALOG, SMALL_BRAIN_DEFAULT } from '../npc/floor10Brains';

/**
 * `?vontade=<id>` existe porque eu entreguei uma escolha que ele não tinha como
 * fazer: o seletor de cérebro só existe na página de depuração `?mente`, e no
 * jogo não há nenhum. O relato foi imediato e certeiro — "o lfm não está
 * baixando, ao invés disso quem tá baixando é o llama".
 *
 * O módulo lê a URL na PRIMEIRA importação, então cada caso precisa de um
 * módulo novo: `resetModules` + `location` trocado antes do `import()`.
 */
/**
 * `localStorage` não existe no ambiente destes testes, e sem um substituto o
 * caso "guarda a escolha" passaria a testar `undefined === undefined`. Um
 * dicionário simples basta: o que interessa é que a chave escrita seja a chave
 * lida na abertura seguinte.
 */
const guardado = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
    value: {
        getItem: (k: string) => guardado.get(k) ?? null,
        setItem: (k: string, v: string) => { guardado.set(k, v); },
        removeItem: (k: string) => { guardado.delete(k); },
        clear: () => guardado.clear(),
    },
    writable: true,
    configurable: true,
});

async function carregarCom(busca: string) {
    vi.resetModules();
    const original = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
        value: { search: busca }, writable: true, configurable: true,
    });
    try {
        return await import('../npc/floor10SmallBrain');
    } finally {
        Object.defineProperty(globalThis, 'location', {
            value: original, writable: true, configurable: true,
        });
    }
}

describe('?vontade=<id> troca o cérebro da vontade', () => {
    beforeEach(() => { guardado.clear(); });

    it('sem parâmetro, fica o padrão que o dono do jogo escolheu', async () => {
        const m = await carregarCom('');
        expect(m.SMALL_BRAIN_MODEL.id).toBe(SMALL_BRAIN_DEFAULT);
    });

    it('com ?vontade=lfm2-1b, é o LFM que a fila vai baixar', async () => {
        const m = await carregarCom('?vontade=lfm2-1b');
        expect(m.SMALL_BRAIN_MODEL.id).toBe('lfm2-1b');
        // O que a fila baixa sai DAQUI — se a url não chegasse até a url do
        // .gguf, a troca seria cosmética e ele veria o llama descer de novo.
        expect(m.SMALL_BRAIN_MODEL.url).toContain('LFM2.5');
    });

    it('guarda a escolha, para a próxima abertura não precisar do parâmetro', async () => {
        await carregarCom('?vontade=lfm2-1b');
        expect(globalThis.localStorage?.getItem('floor10-small-brain')).toBe('lfm2-1b');
        // E sem o parâmetro, na abertura seguinte, ele continua valendo.
        const m = await carregarCom('');
        expect(m.SMALL_BRAIN_MODEL.id).toBe('lfm2-1b');
    });

    it('dá para voltar atrás pela mesma porta', async () => {
        await carregarCom('?vontade=lfm2-1b');
        const m = await carregarCom('?vontade=llama32-1b');
        expect(m.SMALL_BRAIN_MODEL.id).toBe('llama32-1b');
    });

    it('id que não existe é ignorado, não quebra o jogo', async () => {
        const m = await carregarCom('?vontade=modelo-inventado');
        expect(m.SMALL_BRAIN_MODEL.id).toBe(SMALL_BRAIN_DEFAULT);
    });

    it('todo id do catálogo é aceito pela URL', async () => {
        for (const cerebro of SMALL_BRAIN_CATALOG) {
            const m = await carregarCom(`?vontade=${cerebro.id}`);
            expect(m.SMALL_BRAIN_MODEL.id).toBe(cerebro.id);
        }
    });
});
