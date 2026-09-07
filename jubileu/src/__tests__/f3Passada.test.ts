import { describe, it, expect } from 'vitest';
import { passada, estalo, ATRASO_DA_CABECA, ATRASO_DO_BRACO } from '../f3Passada';
import { BOIL_HZ, BOIL_AMP } from '../f3Tinta';

const TAU = Math.PI * 2;

describe('f3Passada — a corrida do Diabrete', () => {
    // ── O ESTALO ─────────────────────────────────────────────────────────
    // A perna tem de SEGURAR nos extremos e cruzar o meio depressa. Um seno faz
    // o contrário. É esta função que inverte, e é ela que separa uma passada de
    // um pêndulo — então ela é cobrada sozinha.
    it('estalo segura nos extremos e cruza o meio mais rápido que o seno', () => {
        expect(estalo(0)).toBe(0);
        expect(estalo(1)).toBeCloseTo(1, 6);
        expect(estalo(-1)).toBeCloseTo(-1, 6);
        // fora do meio, o estalo já está MAIS longe do zero que o seno cru
        for (const s of [0.2, 0.4, 0.6, 0.8]) {
            expect(estalo(s), `s=${s}`).toBeGreaterThan(s);
            expect(estalo(-s), `s=-${s}`).toBeLessThan(-s);
        }
        // e é ímpar: o passo da esquerda é o espelho do da direita
        for (const s of [0.15, 0.5, 0.9]) expect(estalo(-s)).toBeCloseTo(-estalo(s), 12);
        // `dureza = 1` devolve o seno
        expect(estalo(0.37, 1)).toBeCloseTo(0.37, 12);
    });

    it('é determinística: a mesma fase desenha a mesma pose', () => {
        expect(passada(1.234, false, 2.5)).toEqual(passada(1.234, false, 2.5));
        expect(passada(1.234, true, 2.5)).toEqual(passada(1.234, true, 2.5));
    });

    // ── O CICLO TEM DE FECHAR ────────────────────────────────────────────
    // Se a pose em φ e em φ+2π não for a mesma, a corrida dá um solavanco a cada
    // volta — o defeito mais fácil de introduzir e o mais difícil de ver a 2 fps.
    it('o ciclo fecha: φ e φ+2π dão a mesma pose', () => {
        const t = 3.0;
        for (const f of [0, 0.7, 1.9, 3.3, 5.1]) {
            const a = passada(f, false, t);
            const b = passada(f + TAU, false, t);
            for (const k of Object.keys(a) as (keyof typeof a)[]) {
                expect(b[k], `${k} em φ=${f}`).toBeCloseTo(a[k], 9);
            }
        }
    });

    it('as pernas andam em oposição, e o passo tem amplitude de verdade', () => {
        const t = 0;   // sem tremor no degrau zero? não: o tremor é o mesmo para ambas as sementes só por acaso
        let maiorPasso = 0;
        for (let i = 0; i < 64; i++) {
            const f = (i / 64) * TAU;
            const p = passada(f, false, t);
            // uma perna vai para a frente enquanto a outra vai para trás
            expect(Math.sign(p.pernaE) === Math.sign(p.pernaD) && Math.abs(p.pernaE) > 0.2
                   && Math.abs(p.pernaD) > 0.2, `φ=${f.toFixed(2)}`).toBe(false);
            maiorPasso = Math.max(maiorPasso, Math.abs(p.pernaE));
        }
        expect(maiorPasso).toBeGreaterThan(0.7);    // não é um arrastar de pés
    });

    // ── NADA DE MEMBRO INVERTIDO ─────────────────────────────────────────
    it('nenhum ângulo sai da faixa de um corpo, no chão ou no ar', () => {
        for (const ar of [false, true]) {
            for (let i = 0; i < 96; i++) {
                const f = (i / 96) * TAU;
                for (const t of [0, 0.31, 1.77, 9.4]) {
                    const p = passada(f, ar, t);
                    expect(p.corpoY, 'quadril abaixo do chão').toBeGreaterThan(0.3);
                    expect(p.corpoY).toBeLessThan(0.62);
                    expect(Math.abs(p.corpoIncl)).toBeLessThan(0.5);
                    expect(Math.abs(p.corpoGiro)).toBeLessThan(0.35);
                    expect(Math.abs(p.cabecaIncl)).toBeLessThan(0.45);
                    expect(Math.abs(p.pernaE)).toBeLessThan(1.2);
                    expect(Math.abs(p.pernaD)).toBeLessThan(1.2);
                    expect(Math.abs(p.bracoE)).toBeLessThan(1.6);
                    expect(Math.abs(p.bracoD)).toBeLessThan(1.6);
                    expect(p.esticaY).toBeGreaterThan(0.85);
                    expect(p.esticaY).toBeLessThan(1.2);
                }
            }
        }
    });

    // ── A CABEÇA CHEGA DEPOIS ────────────────────────────────────────────
    // O truque mais barato de animação que existe: cabeça e tronco não chegam
    // juntos. Se a defasagem sumir, ela vira um enfeite rígido em cima do corpo.
    it('a cabeça está atrasada em relação ao tronco', () => {
        expect(ATRASO_DA_CABECA).toBeGreaterThan(0.3);
        expect(ATRASO_DO_BRACO).toBeGreaterThan(0.15);
        // o pico da cabeça acontece DEPOIS do pico do tronco
        const picoDe = (f: (p: ReturnType<typeof passada>) => number) => {
            let melhor = 0, fase = 0;
            for (let i = 0; i < 2048; i++) {
                const φ = (i / 2048) * TAU; const v = f(passada(φ, false, 0));
                if (v > melhor) { melhor = v; fase = φ; }
            }
            return fase;
        };
        const doTronco = picoDe((p) => p.corpoGiro);
        const daCabeca = picoDe((p) => p.cabecaTorc);
        const atraso = (daCabeca - doTronco + TAU) % TAU;
        expect(atraso).toBeGreaterThan(0.2);
        expect(atraso).toBeLessThan(Math.PI);   // atrasada, não em oposição
    });

    // ── O FERVILHAR ──────────────────────────────────────────────────────
    it('ferve em degraus de 8 Hz: parado dentro do degrau, salta entre eles', () => {
        const dentro = [0.02, 0.05, 0.10].map((d) => passada(1.0, false, 1 / BOIL_HZ + d).pernaE);
        expect(new Set(dentro.map((v) => v.toFixed(10))).size).toBe(1);
        const a = passada(1.0, false, 1 / BOIL_HZ).pernaE;
        const b = passada(1.0, false, 2 / BOIL_HZ).pernaE;
        expect(a).not.toBe(b);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(BOIL_AMP);   // tinta, não tremedeira
    });

    it('no ar ele encolhe: joelhos para cima e tronco jogado para trás', () => {
        const ar = passada(1.0, true, 0);
        const chao = passada(1.0, false, 0);
        expect(ar.pernaE).toBeLessThan(-0.3);          // joelho subindo
        expect(ar.pernaD).toBeLessThan(-0.3);
        expect(ar.corpoIncl).toBeLessThan(0);          // tronco para trás
        expect(chao.corpoIncl).toBeGreaterThan(0);     // e para a frente correndo
        expect(ar.esticaY).toBe(1);                    // no ar quem estica é o pulo
    });
});
