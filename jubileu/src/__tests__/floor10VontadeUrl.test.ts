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
        const pequeno = await import('../npc/floor10SmallBrain');
        const catalogo = await import('../npc/floor10Brains');
        // ── A LEITURA PRECISA ACONTECER COM A `location` TROCADA ─────────
        //
        // A escolha do cérebro passou a ser resolvida na primeira LEITURA e não
        // na avaliação do módulo — foi assim que se corrigiu a corrida entre
        // `floor10Brains` e `floor10Revisores`, em que a ordem de import
        // decidia qual modelo o jogador baixava. Aqui isso significa que o
        // `finally` abaixo devolveria a `location` original antes de alguém
        // perguntar, e o teste passaria a medir a URL errada.
        catalogo.cerebroEscolhido();
        return { ...pequeno, ...catalogo };
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

describe('a troca de modelo deixa lixo no OPFS — e a fala não pode pagar por ele', () => {
    // "o llama de 1,32 GB que já baixou continua ocupando o OPFS"
    //
    // O cofre do site é o mesmo para os dois cérebros, e a fala já foi recusada
    // uma vez no aparelho dele por causa disso ("o navegador só libera 1.87 GB e
    // o modelo precisa de 2.07 GB" → o Nilo emudeceu). Depois de uma troca de
    // vontade, o modelo antigo é lixo puro: cota gasta por nada.
    it('o descartável é tudo menos o que está em uso', async () => {
        const m = await carregarCom('?vontade=lfm2-1b');
        const descartaveis = m.cachesDescartaveis();
        expect(descartaveis).not.toContain(m.urlDoCerebroEscolhido());
        // E o Llama, que acabou de sair de uso, ESTÁ na lista de descarte.
        expect(descartaveis.some((u: string) => u.includes('Llama-3.2-1B'))).toBe(true);
    });

    it('trocar de volta inverte quem é lixo — a regra segue a escolha', async () => {
        const m = await carregarCom('?vontade=llama32-1b');
        const descartaveis = m.cachesDescartaveis();
        expect(descartaveis.some((u: string) => u.includes('LFM2.5'))).toBe(true);
        expect(descartaveis).not.toContain(m.urlDoCerebroEscolhido());
    });

    it('nunca sobra a lista inteira: o em uso sai de fora sempre', async () => {
        const m = await carregarCom('');
        expect(m.cachesDescartaveis().length).toBe(m.SMALL_BRAIN_CATALOG.length - 1);
    });
});

/**
 * ── A CORRIDA QUE FAZIA `?revisor=` NÃO VALER ─────────────────────────────
 *
 * `floor10Brains` e `floor10Revisores` se importam em ciclo. Enquanto a escolha
 * do cérebro era resolvida na AVALIAÇÃO do módulo, quem ganhava dependia de
 * quem tinha sido importado primeiro lá em cima: com `floor10Revisores` ainda
 * inicializando, `REVISORES` estava na zona morta, `cerebroDoRevisor()`
 * estourava, o `catch` devolvia null e a escolha caía no padrão — calada.
 *
 * Medido no navegador com `?pipeline&revisor=treinado`: a fila baixou 1,25 GB
 * de LFM2.5 em vez dos 386 MB do revisor treinado, e o remendo saiu
 * `sem-revisor` porque o arquivo certo nunca desceu.
 *
 * Este caso importa o módulo do REVISOR primeiro, que é a ordem que quebrava.
 */
describe('?revisor= escolhe o cérebro, em qualquer ordem de import', () => {
    it('vale quando floor10Revisores é importado antes de floor10Brains', async () => {
        vi.resetModules();
        const original = globalThis.location;
        Object.defineProperty(globalThis, 'location', {
            value: { search: '?pipeline&revisor=treinado' }, writable: true, configurable: true,
        });
        try {
            const revisores = await import('../npc/floor10Revisores');
            const catalogo = await import('../npc/floor10Brains');
            expect(revisores.revisorEscolhido()).toBe('treinado');
            expect(catalogo.cerebroEscolhido()).toBe('nilo-revisor-360m');
        } finally {
            Object.defineProperty(globalThis, 'location', {
                value: original, writable: true, configurable: true,
            });
        }
    });
});
