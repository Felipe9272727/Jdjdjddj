import { describe, expect, it } from 'vitest';
import { ALVO, REAGENTES, bancadaVazia, despejar, passou, bateu } from '../f14Lab';

describe('Andar 14 · mistura anti-simulação', () => {
    it('tem UMA só combinação de doses que bate a assinatura', () => {
        const solucoes: number[][] = [];
        for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let c = 0; c <= 6; c++) {
            const barras = [0, 1, 2].map((k) => a * REAGENTES[0].soma[k] + b * REAGENTES[1].soma[k] + c * REAGENTES[2].soma[k]);
            if (barras.every((v, k) => v === ALVO[k])) solucoes.push([a, b, c]);
        }
        expect(solucoes).toEqual([[1, 2, 2]]);
    });
    it('passar de qualquer barra deixa instável', () => {
        let b = bancadaVazia(); b = despejar(b, 0); b = despejar(b, 0); b = despejar(b, 1); b = despejar(b, 1);
        expect(passou(b)).toBe(true); expect(bateu(b)).toBe(false);
    });
    it('a ordem não importa', () => {
        let b = bancadaVazia(); for (const r of [2, 1, 0, 2, 1]) b = despejar(b, r);
        expect(bateu(b)).toBe(true); expect(passou(b)).toBe(false);
    });
});
