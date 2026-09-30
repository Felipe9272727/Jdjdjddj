import { describe, it, expect, beforeEach } from 'vitest';
import {
    contarBatida, oQueSeOuve, terceiraBatida, zerarBatidas, batidaNaPorta, pistaQueElimina,
} from '../f13Batidas';
import { CASAS, CASA_CERTA } from '../f13Lore';

const ERRADAS = CASAS.map((_, i) => i).filter((i) => i !== CASA_CERTA);

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
        ERRADAS.forEach((i) => expect(terceiraBatida(i).errada).toBe(true));
    });

    it('a 3ª numa porta errada deixa escapar um fato verdadeiro que risca a casa', () => {
        ERRADAS.forEach((i) => {
            const c = CASAS[i];
            const t = terceiraBatida(i).texto;

            // toda casa errada tem uma pista a eliminar…
            expect(pistaQueElimina(i)).not.toBeNull();

            // …e a fala tem de dizer algum fato — e ser verdade sobre a casa.
            const fatos: Array<[boolean, boolean]> = [
                [/lareira nunca apaga/.test(t), c.fumaca],
                [/de carvalho, forasteiro/.test(t), !c.portaDeLatao],
                [/não tem botão nenhum/.test(t), !c.botao],
            ];
            const ditos = fatos.filter(([menciona]) => menciona);
            expect(ditos.length).toBeGreaterThan(0);
            ditos.forEach(([, verdade]) => expect(verdade).toBe(true));
        });
    });

    it('a 4ª em diante: porta errada emudece, sem repetir a 3ª', () => {
        ERRADAS.forEach((i) => {
            const t3 = terceiraBatida(i).texto;
            const t4 = batidaNaPorta(i, 4).texto;
            const t5 = batidaNaPorta(i, 5).texto;
            expect(t4).not.toBe(t3);
            expect(t4).toMatch(/ninguém responde|silêncio/i);
            expect(t5).toBe(t4);
        });
    });

    it('a 4ª em diante na casa certa traz um detalhe diferente do ding', () => {
        const t3 = terceiraBatida(CASA_CERTA).texto;
        const t4 = batidaNaPorta(CASA_CERTA, 4).texto;
        expect(t3).toMatch(/ding/);
        expect(t4).not.toBe(t3);
        expect(t4).toMatch(/zumbido/i);
        expect(t4).not.toMatch(/ding/i);
    });

    it('batidaNaPorta devolve a 3ª para n <= 3', () => {
        expect(batidaNaPorta(CASA_CERTA, 3).texto).toBe(terceiraBatida(CASA_CERTA).texto);
    });
});
