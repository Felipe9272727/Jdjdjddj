import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CONVIVENCIA_ZERO, blocoDaConvivencia, comAproximacaoIgnorada, comFalaDoJogador,
    esquecerConvivencia, lerConversa, lerConvivencia, salvarConversa, salvarConvivencia,
    tempoSemVer,
} from '../npc/floor10Convivencia';

const HORA = 3_600_000;
const DIA = 24 * HORA;
const T0 = 1_700_000_000_000;

/**
 * ── O QUE ELE VIVEU COM VOCÊ ─────────────────────────────────────────────
 *
 * A rede de reforço da vontade persiste no localStorage há tempos; a memória da
 * convivência não persistia nada. O personagem aprendia a se comportar e
 * esquecia quem era o jogador a cada F5.
 *
 * A regra deste módulo é uma só, e a maior parte destes testes existe para
 * mantê-la: SÓ ENTRA O QUE DÁ PARA CONTAR. Nada é inferido de texto livre.
 */
/**
 * O ambiente do vitest deste projeto é `node` (ver `vitest.config.ts`), então
 * não existe `localStorage` — e é justamente o disco que este módulo exercita.
 * Um duplo em memória dá o comportamento real sem depender do navegador; é o
 * mesmo caminho que `f8Arquivo.test.ts` já usava.
 */
function lojaDeMentira(): Storage {
    const dados = new Map<string, string>();
    return {
        get length() { return dados.size; },
        clear: () => dados.clear(),
        getItem: (k: string) => dados.get(k) ?? null,
        key: (i: number) => [...dados.keys()][i] ?? null,
        removeItem: (k: string) => { dados.delete(k); },
        setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    } as Storage;
}

beforeEach(() => { vi.stubGlobal('localStorage', lojaDeMentira()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('o registro sobrevive, e não confia no disco', () => {
    it('grava e lê de volta', () => {
        salvarConvivencia({ encontros: 3, ultimaFala: T0, falasDoJogador: 12, ignoradas: 1 });
        expect(lerConvivencia()).toEqual({
            encontros: 3, ultimaFala: T0, falasDoJogador: 12, ignoradas: 1,
        });
    });

    it('sem registro nenhum, começa do zero', () => {
        expect(lerConvivencia()).toEqual(CONVIVENCIA_ZERO);
    });

    it('JSON corrompido vira zero, não exceção', () => {
        localStorage.setItem('floor10-convivencia-v1', '{isso não é json');
        expect(() => lerConvivencia()).not.toThrow();
        expect(lerConvivencia()).toEqual(CONVIVENCIA_ZERO);
    });

    it('campo com tipo errado no disco não vira NaN no prompt', () => {
        // O disco não é fonte confiável: outra versão do jogo, outra aba, um
        // usuário curioso no DevTools.
        localStorage.setItem('floor10-convivencia-v1',
            JSON.stringify({ encontros: 'muitas', ultimaFala: 'ontem', ignoradas: -5 }));
        const c = lerConvivencia();
        expect(c.encontros).toBe(0);
        expect(c.ultimaFala).toBeNull();
        expect(c.ignoradas).toBe(0);
    });

    it('localStorage que ATIRA não derruba o andar', () => {
        // Safari em janela privada atira ao só tocar no objeto. Um personagem
        // que não lembra é um defeito; um jogo que não abre é outro.
        vi.stubGlobal('localStorage', {
            get getItem() { throw new Error('SecurityError'); },
        });
        expect(() => lerConvivencia()).not.toThrow();
        expect(() => salvarConvivencia({ ...CONVIVENCIA_ZERO })).not.toThrow();
    });
});

describe('a conversa volta depois da recarga', () => {
    it('grava e lê as mensagens', () => {
        salvarConversa([
            { role: 'user', content: 'oi' },
            { role: 'assistant', content: 'Sou Nilo Azevedo.' },
        ]);
        expect(lerConversa()).toHaveLength(2);
        expect(lerConversa()[1].content).toBe('Sou Nilo Azevedo.');
    });

    it('descarta item torto em vez de quebrar o painel', () => {
        localStorage.setItem('floor10-conversa-v1', JSON.stringify([
            { role: 'user', content: 'oi' },
            { role: 'sistema', content: 'não existe esse papel' },
            { role: 'assistant' },
            null,
            { role: 'assistant', content: 'certo' },
        ]));
        const volta = lerConversa();
        expect(volta).toHaveLength(2);
        expect(volta.map((m) => m.content)).toEqual(['oi', 'certo']);
    });

    it('o que não é lista nenhuma vira lista vazia', () => {
        localStorage.setItem('floor10-conversa-v1', '"uma string"');
        expect(lerConversa()).toEqual([]);
    });
});

describe('quanto tempo ele passou sem te ver', () => {
    it('menos de uma hora não vira frase', () => {
        // "Faz três minutos que você não aparece" não soa atento, soa quebrado.
        expect(tempoSemVer(T0, T0 + 3 * 60_000)).toBe('');
        expect(tempoSemVer(T0, T0 + 59 * 60_000)).toBe('');
    });

    it('horas e dias, no singular certo', () => {
        expect(tempoSemVer(T0, T0 + HORA)).toBe('cerca de uma hora');
        expect(tempoSemVer(T0, T0 + 5 * HORA)).toBe('cerca de 5 horas');
        expect(tempoSemVer(T0, T0 + DIA)).toBe('cerca de um dia');
        expect(tempoSemVer(T0, T0 + 3 * DIA)).toBe('cerca de 3 dias');
    });

    it('sem última fala, não há tempo a contar', () => {
        expect(tempoSemVer(null, T0)).toBe('');
    });
});

describe('o bloco que entra no prompt', () => {
    it('no primeiro encontro não existe', () => {
        // Cada bloco custa leitura em TODO turno. "Esta é a primeira vez" é
        // gastar prefill para dizer ao modelo o que ele já faria sozinho.
        expect(blocoDaConvivencia(CONVIVENCIA_ZERO, T0)).toBe('');
    });

    it('conta os encontros', () => {
        const bloco = blocoDaConvivencia(
            { encontros: 4, ultimaFala: T0, falasDoJogador: 20, ignoradas: 0 }, T0 + 1000);
        expect(bloco).toContain('conversaram 4 vezes');
        expect(bloco).not.toContain('sumiu');
    });

    it('menciona o sumiço só quando houve sumiço', () => {
        const bloco = blocoDaConvivencia(
            { encontros: 2, ultimaFala: T0, falasDoJogador: 8, ignoradas: 0 }, T0 + 2 * DIA);
        expect(bloco).toContain('sumiu por cerca de 2 dias');
    });

    it('as aproximações ignoradas só entram quando viram padrão', () => {
        // Uma acontece com qualquer um. Três é o jogador fazendo de propósito.
        const uma = { encontros: 2, ultimaFala: T0, falasDoJogador: 5, ignoradas: 1 };
        expect(blocoDaConvivencia(uma, T0)).not.toContain('sem ele responder');
        expect(blocoDaConvivencia({ ...uma, ignoradas: 3 }, T0)).toContain('3 vezes sem ele responder');
    });

    it('avisa o modelo para não inventar além do que está ali', () => {
        const bloco = blocoDaConvivencia(
            { encontros: 2, ultimaFala: T0, falasDoJogador: 5, ignoradas: 0 }, T0);
        expect(bloco).toContain('não invente além disto');
    });
});

describe('contar encontros sem inflar a conta', () => {
    it('a primeira fala abre um encontro', () => {
        expect(comFalaDoJogador(CONVIVENCIA_ZERO, T0).encontros).toBe(1);
    });

    it('falar de novo na MESMA conversa não abre outro', () => {
        // Sair do andar e voltar não pode virar "já conversamos 40 vezes" no
        // mesmo dia.
        let c = comFalaDoJogador(CONVIVENCIA_ZERO, T0);
        c = comFalaDoJogador(c, T0 + 60_000);
        c = comFalaDoJogador(c, T0 + 20 * 60_000);
        expect(c.encontros).toBe(1);
        expect(c.falasDoJogador).toBe(3);
    });

    it('depois de uma hora parado, é outro encontro', () => {
        let c = comFalaDoJogador(CONVIVENCIA_ZERO, T0);
        c = comFalaDoJogador(c, T0 + HORA + 1);
        expect(c.encontros).toBe(2);
    });

    it('a aproximação ignorada é somada à parte', () => {
        const c = comAproximacaoIgnorada(comFalaDoJogador(CONVIVENCIA_ZERO, T0));
        expect(c.ignoradas).toBe(1);
        expect(c.encontros).toBe(1);
    });
});
