import { describe, it, expect } from 'vitest';
import { simular } from '../f12Simulacao';
import { ATAQUES, VIDA_MAXIMA } from '../f12Boss';

/**
 * ── A DIFICULDADE DEIXOU DE SER OPINIÃO ──────────────────────────────────────
 *
 * Eu entreguei este andar dizendo "não consegui verificar a dificuldade", e o
 * dono do jogo jogou e disse que estava ruim. Ele estava certo: eu tinha
 * testado cada PADRÃO isoladamente e fotografado a tela, e nenhuma das duas
 * coisas responde se a luta é jogável.
 *
 * Estes testes rodam a luta INTEIRA em memória, com um piloto de política
 * conhecida no comando. Eles não dizem se o andar é divertido — isso só o
 * Felipe sabe — mas dizem, com número, se ele é vencível, se é longo demais,
 * se todos os ataques chegam a aparecer, e se desviar faz diferença.
 */
describe('f12 — a luta, jogada de ponta a ponta por um bot', () => {
    it('um piloto que desvia VENCE, e sobra vida para ele errar', () => {
        const r = simular({ reflexo: 1 });
        expect(r.venceu, `perdeu com ${r.vidas} vidas em ${r.duracao}s`).toBe(true);
        expect(r.vidas, 'venceu por um fio: sem margem para um humano').toBeGreaterThanOrEqual(2);
    });

    // ── E DESVIAR TEM DE IMPORTAR ────────────────────────────────────────
    // Se quem ignora os ataques também vence, os cinco padrões são decoração e
    // o andar inteiro é um botão de tiro. Esta é a linha que separa um chefe de
    // uma barra de progresso.
    it('um piloto que NÃO desvia perde', () => {
        const r = simular({ reflexo: 0 });
        expect(r.venceu, 'dá para vencer sem desviar de nada').toBe(false);
        expect(r.vidaDaCabeca, 'ele morre tão cedo que nem arranha o chefe')
            .toBeLessThan(VIDA_MAXIMA * 0.8);
    });

    it('a luta dura o tempo de um chefe: nem cutscene, nem maratona', () => {
        const r = simular({ reflexo: 1 });
        expect(r.duracao, 'curta demais para ser um chefe').toBeGreaterThan(60);
        expect(r.duracao, 'longa demais para um andar de celular').toBeLessThan(150);
    });

    // ── TODO ATAQUE TEM DE CHEGAR A APARECER ─────────────────────────────
    // Com a vida em 100 a boca abria cinco vezes e a luta acabava antes de os
    // dois padrões da virada entrarem em cena. Eles existiam no código, tinham
    // teste, e o jogador nunca os via.
    it('a boca abre vezes suficientes para os cinco padrões aparecerem — e repetirem', () => {
        const r = simular({ reflexo: 1 });
        expect(r.aberturas, 'padrão que aparece uma vez não é aprendido')
            .toBeGreaterThanOrEqual(ATAQUES.length * 3);
    });

    it('um piloto meia-boca também vence, mas apanhando pelo caminho', () => {
        const r = simular({ reflexo: 0.5 });
        expect(r.venceu).toBe(true);
        expect(r.toques, 'não encostou uma vez: o desafio sumiu').toBeGreaterThan(0);
    });

    it('a simulação é determinística — sem isso ela não serve de régua', () => {
        expect(simular({ reflexo: 0.75 })).toEqual(simular({ reflexo: 0.75 }));
    });
});
