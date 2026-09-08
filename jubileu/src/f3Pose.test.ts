/**
 * f3Pose.test.ts — "a animação não está boa" vira número.
 *
 * O Felipe reclamou da animação do Diabrete. Reclamação de animação é difícil de
 * atacar porque "está boa" é opinião. O que dá para transformar em fato é o
 * COMO: a pose desliza (um valor novo a cada quadro de tela) ou ela SEGURA (um
 * desenho por vez, parado, do jeito que um curta de 1930 é feito)?
 *
 * Com a atuação fora do componente, dá para amostrar a 60 Hz aqui e responder.
 */

import { describe, it, expect } from 'vitest';
import { poseDoGesto, distanciaDaPose, tempoDaPose, quadroDaPose, POSE_HZ } from './f3Pose';
import { BOIL_HZ } from './f3Tinta';
import { DIABRETE_SCRIPT, type Gesture } from './diabreteScript';

const GESTOS: Gesture[] = ['idle', 'point', 'laugh', 'lean', 'throw', 'taunt', 'dash'];

/** Amostra um segundo de gesto a 60 Hz, com ou sem quantização. */
function amostrar(g: Gesture, quantizado: boolean, n = 60) {
    const poses = [];
    for (let i = 0; i < n; i++) {
        const t = i / 60;
        poses.push(poseDoGesto(g, quantizado ? tempoDaPose(t) : t, 1.0));
    }
    return poses;
}

describe('todo gesto do roteiro existe e MEXE alguma coisa', () => {
    it('os gestos do roteiro estão todos cobertos', () => {
        const usados = new Set(DIABRETE_SCRIPT.map(l => l.gesture));
        for (const g of usados) expect(GESTOS).toContain(g);
    });
    it('nenhum gesto é uma pose parada disfarçada', () => {
        for (const g of GESTOS) {
            const p = amostrar(g, false);
            const mexeu = Math.max(...p.map(x => distanciaDaPose(x, p[0])));
            // 0,02 rad não se vê na tela. Gesto que muda menos que isso não existe.
            expect(mexeu, `o gesto "${g}" mal se mexe`).toBeGreaterThan(0.02);
        }
    });
    it('e cada gesto é distinto dos outros — não são o mesmo boneco', () => {
        const impressoes = GESTOS.map(g => JSON.stringify(poseDoGesto(g, 0.37, 1.0)));
        expect(new Set(impressoes).size).toBe(GESTOS.length);
    });
});

describe('O DEFEITO: sem quantizar, o corpo DESLIZA', () => {
    it('sem quantizar, quase todo quadro de tela traz uma pose nova', () => {
        for (const g of GESTOS) {
            const p = amostrar(g, false);
            let novas = 0;
            for (let i = 1; i < p.length; i++) if (distanciaDaPose(p[i], p[i - 1]) > 1e-9) novas++;
            // 59 mudanças em 60 quadros: é interpolação, não é desenho.
            expect(novas, `"${g}" desliza`).toBeGreaterThan(50);
        }
    });
});

describe('O CONSERTO: em dois, a pose SEGURA', () => {
    it('quantizada, a pose muda POSE_HZ vezes por segundo e fica parada entre elas', () => {
        for (const g of GESTOS) {
            const p = amostrar(g, true);
            let novas = 0;
            for (let i = 1; i < p.length; i++) if (distanciaDaPose(p[i], p[i - 1]) > 1e-9) novas++;
            // 12 desenhos por segundo => 11 trocas dentro da janela de 1 s.
            expect(novas, `"${g}" deveria segurar`).toBeLessThanOrEqual(POSE_HZ);
            expect(novas).toBeGreaterThanOrEqual(POSE_HZ - 2);
        }
    });
    it('dentro de um desenho, a pose é EXATAMENTE a mesma', () => {
        const dentro = [0.501, 0.51, 0.52, 0.57, 0.582];   // todos no mesmo 1/12 s
        expect(new Set(dentro.map(quadroDaPose)).size).toBe(1);
        const poses = dentro.map(t => poseDoGesto('laugh', tempoDaPose(t), 1));
        for (const p of poses) expect(distanciaDaPose(p, poses[0])).toBe(0);
    });
    it('e ela ainda percorre a mesma amplitude — segurar não é encolher', () => {
        for (const g of GESTOS) {
            const liso = amostrar(g, false, 240);
            const dois = amostrar(g, true, 240);
            const amp = (ps: ReturnType<typeof amostrar>) =>
                Math.max(...ps.map(x => distanciaDaPose(x, ps[0])));
            // Amostrar em dois perde no máximo um pedacinho do pico do seno.
            expect(amp(dois)).toBeGreaterThan(amp(liso) * 0.7);
        }
    });
});

describe('dois relógios, dois ofícios', () => {
    it('a POSE anda em 12 e a LINHA ferve em 8 — não são o mesmo relógio', () => {
        expect(POSE_HZ).toBe(12);          // 24 quadros por segundo, em dois
        expect(BOIL_HZ).toBe(8);           // a mão redesenhando o contorno
        expect(POSE_HZ).not.toBe(BOIL_HZ);
    });
    it('tempoDaPose só devolve instantes de desenho', () => {
        for (const t of [0.0, 0.03, 0.41, 0.999, 2.7]) {
            expect(Math.abs(tempoDaPose(t) * POSE_HZ % 1)).toBeLessThan(1e-9);
            expect(tempoDaPose(t)).toBeLessThanOrEqual(t + 1e-9);
        }
    });
});
