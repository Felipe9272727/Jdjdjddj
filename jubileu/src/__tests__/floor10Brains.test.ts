import { describe, expect, it } from 'vitest';
import {
    SMALL_BRAIN_CATALOG, SMALL_BRAIN_DEFAULT, smallBrainUrls,
} from '../npc/floor10Brains';
import { SMALL_BRAIN_CATALOG as reexportado } from '../npc/floor10SmallBrain';

describe('npc/floor10Brains — a lista que os DOIS cérebros precisam ver', () => {
    it('a fala enxerga exatamente os mesmos pesos que a vontade baixa', () => {
        // Este módulo existe porque a FALA precisa saber quais caches pode
        // reciclar quando falta espaço para ela, e importar o cérebro pequeno
        // dentro do cérebro da fala fecharia um ciclo. Se as duas listas
        // divergirem, a fala volta a ser recusada por falta de cota com um
        // modelo de 800 MB que ela não sabe que existe.
        expect(smallBrainUrls()).toEqual(SMALL_BRAIN_CATALOG.map((m) => m.url));
        expect(reexportado).toBe(SMALL_BRAIN_CATALOG);
        expect(smallBrainUrls().length).toBeGreaterThanOrEqual(3);
    });

    it('o padrão é um modelo do próprio catálogo', () => {
        expect(SMALL_BRAIN_CATALOG.some((m) => m.id === SMALL_BRAIN_DEFAULT)).toBe(true);
    });

    it('nenhum candidato é grande a ponto de sufocar a fala', () => {
        // O SmolLM3 da conversa pede ~2,07 GB de cota. Um cérebro pequeno de
        // 800 MB já derrubou a fala uma vez; nada aqui pode passar de 1,1 GB.
        for (const m of SMALL_BRAIN_CATALOG) {
            expect(m.bytes).toBeLessThan(1_100_000_000);
            expect(m.url).toMatch(/\.gguf$/);
            expect(m.nota.length).toBeGreaterThan(10);
        }
    });
});
