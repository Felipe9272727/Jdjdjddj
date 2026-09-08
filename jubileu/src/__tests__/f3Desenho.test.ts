import { describe, it, expect } from 'vitest';
import { acabamentoDoAndar, mudouOAcabamento, PINCEIS_DO_DIABRETE, SETA_MINIMA } from '../f3Desenho';

describe('f3Desenho — o andar se desfaz junto com o dono', () => {
    it('começa inteiro e só piora', () => {
        const etapas = [0, 1, 2, 3].map(acabamentoDoAndar);
        expect(etapas[0]).toEqual({ seta: 1, tabuado: 1 });
        for (let i = 1; i < etapas.length; i++) {
            expect(etapas[i].seta, `seta ${i}`).toBeLessThanOrEqual(etapas[i - 1].seta);
            expect(etapas[i].tabuado, `tabuado ${i}`).toBeLessThanOrEqual(etapas[i - 1].tabuado);
        }
    });

    it('cada pincel roubado muda alguma coisa — senão a história não aparece', () => {
        for (let i = 1; i <= PINCEIS_DO_DIABRETE; i++) {
            expect(mudouOAcabamento(acabamentoDoAndar(i - 1), acabamentoDoAndar(i)), `pincel ${i}`).toBe(true);
        }
    });

    // ── O QUE ELE PODE TIRAR, E O QUE NÃO PODE ───────────────────────────
    // A seta é ajuda de leitura e pode sumir; o TABUADO é acabamento e pode
    // rarear. Nenhum dos dois é a plataforma. Se um dia o tabuado zerar, o
    // convés fica liso e o andar perde a leitura de profundidade de perto — daí
    // este piso, que é a promessa de que perder o desenho nunca vira perder o
    // chão.
    it('o tabuado rareia mas NUNCA some: acabamento some, chão não', () => {
        for (let i = 0; i <= 8; i++) {
            expect(acabamentoDoAndar(i).tabuado, `roubados=${i}`).toBeGreaterThan(0.15);
        }
    });

    it('aguenta contagem fora da faixa sem devolver indefinido', () => {
        for (const n of [-5, 0, 3, 7, 99, NaN]) {
            const a = acabamentoDoAndar(n);
            expect(Number.isFinite(a.seta), `n=${n}`).toBe(true);
            expect(Number.isFinite(a.tabuado), `n=${n}`).toBe(true);
        }
    });

    it('mudouOAcabamento não acusa mudança onde não houve', () => {
        expect(mudouOAcabamento(acabamentoDoAndar(1), acabamentoDoAndar(1))).toBe(false);
        expect(mudouOAcabamento(acabamentoDoAndar(2), acabamentoDoAndar(3))).toBe(true);
    });
});

// ── A SETA É NAVEGAÇÃO, NÃO É ENFEITE ────────────────────────────────────────
// O Felipe jogou no celular e reportou como bug: "quando o player avança de
// mais, as setas começam a sumir". A tabela levava a seta a 0,00 com dois
// pincéis — e o próprio texto deste módulo já dizia que isto não pode "deixar
// ninguém sem saber onde pisar". Este teste é para a contradição não voltar.
describe('a seta desbota, mas nunca some', () => {
    it('nenhuma etapa deixa a seta abaixo do piso legível', () => {
        for (let r = 0; r <= PINCEIS_DO_DIABRETE; r++) {
            expect(acabamentoDoAndar(r).seta).toBeGreaterThanOrEqual(SETA_MINIMA);
        }
        expect(SETA_MINIMA).toBeGreaterThan(0.25);   // abaixo disso não se enxerga
    });
    it('ela ainda PERDE tinta a cada pincel — a história continua sendo contada', () => {
        for (let r = 1; r <= PINCEIS_DO_DIABRETE; r++) {
            expect(acabamentoDoAndar(r).seta).toBeLessThan(acabamentoDoAndar(r - 1).seta);
        }
    });
    it('e quem some de verdade é o TABUADO, que é acabamento e não caminho', () => {
        expect(acabamentoDoAndar(3).tabuado).toBeLessThan(acabamentoDoAndar(3).seta);
    });
});
