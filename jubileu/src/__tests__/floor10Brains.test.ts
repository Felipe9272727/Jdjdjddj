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
        // Este teste nasceu travando `llama32-1b`, porque ele tinha dito "todos
        // llms que estão aqui, foram escolhidos a dedo" e a bancada não pode
        // promover modelo sozinha. A medição QUALIFICA um candidato; quem troca
        // é ele. E trocou, com os números na mão:
        //
        //     "Deixe o lfm como principal, e fds o llama"
        //
        // O teste continua com a mesma função de sempre — impedir troca
        // silenciosa —, só que agora guardando a escolha nova.
        expect(SMALL_BRAIN_DEFAULT).toBe('lfm2-1b');
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

    it('quem é grande demais para a fala precisa dizer isso na entrada', () => {
        // O teto de verdade de um `soRevisor` é a parede de 2 GiB por gguf do
        // wasm32, e não a cota da fala.
        for (const m of SMALL_BRAIN_CATALOG.filter((x) => x.soRevisor)) {
            expect(m.bytes).toBeLessThan(2 * 1024 * 1024 * 1024);
            expect(m.bytes).toBeGreaterThan(1_400_000_000);
        }
    });

    it('nenhum candidato é grande a ponto de sufocar a fala', () => {
        // O SmolLM3 da conversa pede ~2,07 GB de cota, e o teto aqui subiu para
        // 1,4 GB por causa de uma MEDIÇÃO: em Q4 o Llama 1B assinava escolha em
        // 5 de 15 rodadas e quase não falava em 1ª pessoa; em Q8 (1,32 GB) faz
        // 14 de 15. Vale os 513 MB. Quem não tiver a cota usa a entrada Q4, que
        // continua no catálogo exatamente para isso.
        // A exceção declarada: uma entrada `soRevisor` não convive com a fala,
        // só com o rascunhador de 822 MB dentro do `?pipeline`. Ela sai deste
        // teto e ganha o próprio, logo abaixo — afrouxar o teto de todo mundo
        // para caber um caso seria perder a medição que criou a regra.
        for (const m of SMALL_BRAIN_CATALOG.filter((x) => !x.soRevisor)) {
            expect(m.bytes).toBeLessThan(1_400_000_000);
            expect(m.url).toMatch(/\.gguf$/);
            expect(m.nota.length).toBeGreaterThan(10);
        }
    });
});
