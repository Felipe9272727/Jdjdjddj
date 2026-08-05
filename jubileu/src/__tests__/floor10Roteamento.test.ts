import { describe, expect, it, vi } from 'vitest';
import {
    baixarSemSubir, quemDevoDesligar, quemDevoLigar,
} from '../npc/floor10Roteamento';

describe('baixar não é ligar', () => {
    it('baixa pelo cofre sem construir engine nenhum', async () => {
        const chamadas: string[] = [];
        const progresso: number[] = [];
        const cofre = {
            download: async (url: string, o?: { progressCallback?: (p: never) => void }) => {
                chamadas.push(url);
                (o?.progressCallback as unknown as (p: object) => void)?.(
                    { loaded: 50, total: 100 },
                );
            },
        };
        const ok = await baixarSemSubir(cofre, 'https://x/m.gguf', (l) => progresso.push(l));
        expect(ok).toBe(true);
        expect(chamadas).toEqual(['https://x/m.gguf']);
        expect(progresso).toEqual([50]);
    });

    it('runtime sem `download` devolve false em vez de estourar', async () => {
        // Degradar para o caminho antigo é aceitável; sumir com o cérebro não.
        expect(await baixarSemSubir({}, 'https://x/m.gguf')).toBe(false);
        expect(await baixarSemSubir(null, 'https://x/m.gguf')).toBe(false);
        expect(await baixarSemSubir(undefined, 'https://x/m.gguf')).toBe(false);
    });

    it('propaga a falha do download em vez de engolir', async () => {
        const cofre = { download: async () => { throw new Error('rede caiu'); } };
        await expect(baixarSemSubir(cofre, 'https://x/m.gguf')).rejects.toThrow('rede caiu');
    });
});

describe('o roteamento que o dono do jogo desenhou', () => {
    // "o player manda mensagem pra mente, ela liga automaticamente junto do
    //  embbending, processa, e manda a resposta, pós mandar a resposta, ela
    //  desliga dnv junto do embbending... aí, o player saiu do chat,
    //  automaticamente, liga a vontade (llama 1b) e o motor"
    it('no chat: mente e memória de pé, vontade e motor parados', () => {
        expect(quemDevoLigar(true)).toEqual(['fala', 'memoria']);
        expect(quemDevoDesligar(true)).toEqual(['vontade', 'motor']);
    });

    it('fora do chat: vontade e motor de pé, fala e memória parados', () => {
        expect(quemDevoLigar(false)).toEqual(['vontade', 'motor']);
        expect(quemDevoDesligar(false)).toEqual(['fala', 'memoria']);
    });

    it('nunca há sobreposição: os dois grupos são disjuntos', () => {
        // É esta a invariante que segura o aparelho — nunca dois pipelines de
        // pé ao mesmo tempo. Medido: cada cérebro de pé custa ~2x o arquivo em
        // memória ANÔNIMA (4,52 de 5,09 GB), então sobreposição é RAM real.
        for (const noChat of [true, false]) {
            const ligados = new Set(quemDevoLigar(noChat));
            expect(quemDevoDesligar(noChat).some((c) => ligados.has(c))).toBe(false);
        }
    });
});
