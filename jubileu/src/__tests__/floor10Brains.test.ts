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

    it('o padrão continua sendo o que o DONO do jogo escolheu', () => {
        // "Não aceito a proposta pra trocar de modelo, pq todos llms que estão
        //  aqui, foram escolhidos a dedo"
        //
        // O LFM2.5 ganhou a bancada em tudo que dá para medir — 5/5 contra 2/5
        // assinando de primeira, rodada 1,45× mais rápida, duas execuções
        // independentes. Isso o qualifica para ENTRAR na lista, e nada mais:
        // trocar o padrão é decisão de quem joga, no aparelho de quem joga.
        // Este teste existe para que a próxima boa medição também não vire uma
        // troca silenciosa.
        expect(SMALL_BRAIN_DEFAULT).toBe('llama32-1b');
    });

    it('o candidato novo está lá, e não custa cota a mais que o titular', () => {
        const titular = SMALL_BRAIN_CATALOG.find((m) => m.id === 'llama32-1b');
        const novo = SMALL_BRAIN_CATALOG.find((m) => m.id === 'lfm2-1b');
        expect(novo).toBeDefined();
        // 75 MB menor que o Q8 do Llama. Um candidato que ganhasse em velocidade
        // e perdesse em cota não serviria: a cota já recusou 2,07 GB uma vez no
        // aparelho dele, e quem paga essa conta é a FALA.
        expect(novo!.bytes).toBeLessThan(titular!.bytes);
    });

    it('nenhum candidato é grande a ponto de sufocar a fala', () => {
        // O SmolLM3 da conversa pede ~2,07 GB de cota, e o teto aqui subiu para
        // 1,4 GB por causa de uma MEDIÇÃO: em Q4 o Llama 1B assinava escolha em
        // 5 de 15 rodadas e quase não falava em 1ª pessoa; em Q8 (1,32 GB) faz
        // 14 de 15. Vale os 513 MB. Quem não tiver a cota usa a entrada Q4, que
        // continua no catálogo exatamente para isso.
        for (const m of SMALL_BRAIN_CATALOG) {
            expect(m.bytes).toBeLessThan(1_400_000_000);
            expect(m.url).toMatch(/\.gguf$/);
            expect(m.nota.length).toBeGreaterThan(10);
        }
    });
});
