import { describe, expect, it } from 'vitest';
import {
    OLHADA_AMPLITUDE,
    OLHADA_SEG,
    segundosAteProximaOlhada,
    yawDaVarredura,
} from '../npc/floor10Olhar';

describe('floor10Olhar — o Nilo parado deixou de ser um pião', () => {
    it('NÃO GIRA SEM FIM: em 10 minutos parado, o olhar nunca sai de base ± amplitude', () => {
        const base = 1.2;
        for (let t = 0; t < 600; t += 0.25) {
            const yaw = yawDaVarredura(base, t);
            expect(Math.abs(yaw - base)).toBeLessThanOrEqual(OLHADA_AMPLITUDE + 1e-9);
        }
        // O defeito antigo, para comparação: `rotation.y + 0.32` a cada quadro
        // acumulava mais de 200 rad nesses mesmos 10 minutos.
    });

    it('o olhar SEGURA no ponto: dentro de um trecho o alvo não muda', () => {
        const base = 0;
        const dentro = [0.1, 1, 2, 3.3].map((t) => yawDaVarredura(base, t));
        expect(new Set(dentro).size).toBe(1);
    });

    it('e troca de ponto quando o trecho vira', () => {
        const base = 0;
        expect(yawDaVarredura(base, OLHADA_SEG - 0.1))
            .not.toBe(yawDaVarredura(base, OLHADA_SEG + 0.1));
    });

    it('varre os DOIS lados — não é sempre para a mesma direção', () => {
        const base = 0;
        const angulos: number[] = [];
        for (let i = 0; i < 40; i++) angulos.push(yawDaVarredura(base, i * OLHADA_SEG + 0.5));
        expect(angulos.some((a) => a > 0.2)).toBe(true);
        expect(angulos.some((a) => a < -0.2)).toBe(true);
    });

    it('é determinístico: o mesmo instante dá sempre o mesmo alvo', () => {
        expect(yawDaVarredura(0.7, 42.42)).toBe(yawDaVarredura(0.7, 42.42));
    });

    it('acompanha o rumo em que ele parou', () => {
        const t = 7.7;
        expect(yawDaVarredura(2, t) - yawDaVarredura(0, t)).toBeCloseTo(2, 10);
    });

    it('a conta da próxima olhada fica dentro do trecho', () => {
        expect(segundosAteProximaOlhada(0)).toBeCloseTo(OLHADA_SEG, 10);
        const falta = segundosAteProximaOlhada(1.4);
        expect(falta).toBeGreaterThan(0);
        expect(falta).toBeLessThanOrEqual(OLHADA_SEG);
    });
});
