import { describe, it, expect, beforeEach } from 'vitest';
import { contarBatida, oQueSeOuve, terceiraBatida, zerarBatidas } from '../f13Batidas';
import { CASAS, CASA_CERTA } from '../f13Lore';

describe('f13 — três batidas', () => {
    beforeEach(() => zerarBatidas());
    it('conta batidas seguidas na mesma porta e zera depois de 25 s', () => {
        expect(contarBatida(0, 0)).toBe(1);
        expect(contarBatida(0, 1000)).toBe(2);
        expect(contarBatida(0, 2000)).toBe(3);
        expect(contarBatida(0, 40000)).toBe(1);
        expect(contarBatida(1, 40500)).toBe(1);
    });
    it('o que se ouve casa com a lareira de cada casa', () => {
        CASAS.forEach((c, i) => {
            if (i === CASA_CERTA) return;
            expect(oQueSeOuve(i)).toMatch(c.fumaca ? /estalando/ : /fria/);
        });
        expect(oQueSeOuve(CASA_CERTA)).toMatch(/zumbido/);
    });
    it('a terceira batida: a certa confirma, as erradas respondem de dentro', () => {
        expect(terceiraBatida(CASA_CERTA).errada).toBe(false);
        CASAS.forEach((_, i) => { if (i !== CASA_CERTA) expect(terceiraBatida(i).errada).toBe(true); });
    });
});
