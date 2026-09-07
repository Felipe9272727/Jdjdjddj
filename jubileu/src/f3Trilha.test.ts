/**
 * f3Trilha.test.ts — a curva da vitrola, provada sem ouvido.
 *
 * O mesmo acordo de `f3Voz.test.ts`: se soa bem é ouvido do Felipe. O que dá
 * para provar aqui é tudo que seria defeito mesmo soando bem — o disco
 * acelerando quando devia desacelerar, uma etapa que pula, ou a trilha começando
 * já estragada para quem não roubou pincel nenhum.
 */

import { describe, it, expect } from 'vitest';
import { trilhaDoAndar, mudouATrilha, ETAPAS_DA_TRILHA, TEMPO_DA_VIRADA, CHORO_HZ } from './f3Trilha';
import { PINCEIS_DO_DIABRETE, acabamentoDoAndar } from './f3Desenho';

const ETAPAS = [0, 1, 2, 3].map(trilhaDoAndar);

describe('quem não roubou nada ouve o disco intacto', () => {
    it('a etapa zero não mexe em nada', () => {
        const e = ETAPAS[0];
        expect(e.rotacao).toBe(1);
        expect(e.choro).toBe(0);
        // 20 kHz é acima do que se escuta: o filtro existe no grafo mas é
        // transparente. Quem nunca rouba um pincel ouve o mesmo de sempre.
        expect(e.brilho).toBeGreaterThanOrEqual(18000);
    });
});

describe('O ARCO — a vitrola perde corda junto com o dono', () => {
    it('o andamento CAI a cada pincel, e nunca sobe', () => {
        for (let i = 1; i < ETAPAS.length; i++) {
            expect(ETAPAS[i].rotacao).toBeLessThan(ETAPAS[i - 1].rotacao);
        }
    });
    it('o brilho fecha e o volume murcha', () => {
        for (let i = 1; i < ETAPAS.length; i++) {
            expect(ETAPAS[i].brilho).toBeLessThan(ETAPAS[i - 1].brilho);
            expect(ETAPAS[i].ganho).toBeLessThan(ETAPAS[i - 1].ganho);
        }
    });
    it('o choro de rotação só aparece depois da primeira perda, e aumenta', () => {
        expect(ETAPAS[0].choro).toBe(0);
        for (let i = 1; i < ETAPAS.length; i++) {
            expect(ETAPAS[i].choro).toBeGreaterThan(ETAPAS[i - 1].choro);
        }
    });
    it('mas não vira piada: o disco continua tocável no fundo do poço', () => {
        const fim = ETAPAS[ETAPAS.length - 1];
        expect(fim.rotacao).toBeGreaterThanOrEqual(0.85);   // abaixo disto é lamaçal
        expect(fim.brilho).toBeGreaterThanOrEqual(800);     // e isto já é abafado
        expect(fim.ganho).toBeGreaterThan(0.2);             // baixo, não mudo
        expect(fim.choro).toBeLessThan(0.05);               // wow, não vibrato
    });
});

describe('um número, um dono', () => {
    it('a trilha tem uma etapa por pincel, igual ao chão', () => {
        expect(ETAPAS_DA_TRILHA).toBe(PINCEIS_DO_DIABRETE + 1);
        // e as duas escadas andam juntas: onde o chão muda, a trilha muda
        for (let i = 1; i <= PINCEIS_DO_DIABRETE; i++) {
            const chaoMudou = JSON.stringify(acabamentoDoAndar(i)) !== JSON.stringify(acabamentoDoAndar(i - 1));
            expect(mudouATrilha(trilhaDoAndar(i), trilhaDoAndar(i - 1))).toBe(chaoMudou);
        }
    });
    it('cada etapa é distinta — nenhuma perda passa em branco', () => {
        expect(new Set(ETAPAS.map(e => JSON.stringify(e))).size).toBe(ETAPAS.length);
    });
});

describe('contagem fora da faixa não quebra a trilha', () => {
    it('acima do último pincel fica no último', () => {
        expect(trilhaDoAndar(99)).toEqual(ETAPAS[3]);
    });
    it('negativo e lixo caem na etapa inteira', () => {
        expect(trilhaDoAndar(-3)).toEqual(ETAPAS[0]);
        expect(trilhaDoAndar(NaN)).toEqual(ETAPAS[0]);
    });
});

describe('a virada desliza', () => {
    it('o tempo de virada é desmaio, não corte nem espera', () => {
        expect(TEMPO_DA_VIRADA).toBeGreaterThan(0.5);   // corte seco soa como defeito
        expect(TEMPO_DA_VIRADA).toBeLessThan(3);        // e mais que isso ninguém liga uma coisa à outra
    });
    it('o choro é lento como sulco torto, não rápido como vibrato', () => {
        expect(CHORO_HZ).toBeGreaterThan(0.2);
        expect(CHORO_HZ).toBeLessThan(2);
    });
    it('mudouATrilha só acusa quando muda mesmo', () => {
        expect(mudouATrilha(ETAPAS[1], ETAPAS[1])).toBe(false);
        expect(mudouATrilha(ETAPAS[1], ETAPAS[2])).toBe(true);
    });
});
