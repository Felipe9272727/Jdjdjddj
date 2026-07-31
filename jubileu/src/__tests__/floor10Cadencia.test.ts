import { describe, expect, it } from 'vitest';
import { Cadencia, CADENCIA_PERCEPCAO, CADENCIA_VONTADE } from '../npc/floor10Cadencia';

const QUADRO = 1 / 60;

describe('floor10Cadencia — a vontade parou de pensar 60 vezes por segundo', () => {
    it('a 60 fps, a vontade dá 12 passos por segundo em vez de 60', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        let passos = 0;
        for (let i = 0; i < 60; i++) if (c.passo(QUADRO) > 0) passos++;
        expect(passos).toBe(12);
    });

    it('NENHUM dt SE PERDE: o tempo dos quadros pulados volta no passo seguinte', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        let entregue = 0;
        for (let i = 0; i < 600; i++) entregue += c.passo(QUADRO);
        // 10 s de quadros; o que ainda não foi entregue está guardado.
        expect(entregue + c.pendente()).toBeCloseTo(10, 6);
    });

    it('cada passo entrega o dt somado dos quadros que ele representa', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        for (let i = 0; i < 4; i++) expect(c.passo(QUADRO)).toBe(0);
        // O 5º quadro fecha os 1/12 s: 5 quadros de 1/60 = 1/12 exato.
        expect(c.passo(QUADRO)).toBeCloseTo(5 * QUADRO, 10);
    });

    it('quadro longo (aparelho engasgado) dá o passo na hora, com o dt inteiro', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        expect(c.passo(0.4)).toBe(0.4);
    });

    it('`agora()` força o próximo quadro — abrir a conversa não espera 83 ms', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        expect(c.passo(QUADRO)).toBe(0);
        c.agora();
        expect(c.passo(QUADRO)).toBeGreaterThan(0);
    });

    it('dt inválido (NaN, negativo, primeiro quadro) não corrompe o acumulado', () => {
        const c = new Cadencia(CADENCIA_VONTADE);
        expect(c.passo(Number.NaN)).toBe(0);
        expect(c.passo(-5)).toBe(0);
        expect(c.pendente()).toBe(0);
    });

    it('a percepção manteve os 6 Hz que já tinha', () => {
        const c = new Cadencia(CADENCIA_PERCEPCAO);
        let passos = 0;
        for (let i = 0; i < 60; i++) if (c.passo(QUADRO) > 0) passos++;
        expect(passos).toBe(6);
    });

    it('intervalo zero volta a rodar todo quadro', () => {
        const c = new Cadencia(0);
        expect(c.passo(QUADRO)).toBe(QUADRO);
        expect(c.passo(QUADRO)).toBe(QUADRO);
    });
});
