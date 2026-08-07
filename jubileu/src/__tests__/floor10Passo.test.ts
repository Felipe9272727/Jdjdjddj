import { describe, expect, it } from 'vitest';
import { passoDoPlano, type CorpoDoNilo } from '../npc/floor10Passo';
import type { Floor10MotorPlan } from '../npc/floor10MotorCortex';

const plano = (verb: string, target: string, pace = 'normal'): Floor10MotorPlan => ({
    verb: verb as Floor10MotorPlan['verb'],
    target: target as Floor10MotorPlan['target'],
    pace: pace as Floor10MotorPlan['pace'],
    duration: 6,
    raw: '',
});

const mundo = (jogador: { x: number; z: number } | null = { x: 0, z: 10 }) => ({
    jogador,
    elevador: { x: 0, z: -10 },
    limite: 22,
    dt: 1 / 60,
});

/** Roda `n` quadros e devolve o corpo. */
function correr(corpo: CorpoDoNilo, p: Floor10MotorPlan | null, n: number, j = { x: 0, z: 10 }) {
    for (let i = 0; i < n; i += 1) passoDoPlano(corpo, p, mundo(j));
    return corpo;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

describe('o corpo obedece ao plano — e para quando não há plano', () => {
    // "ele só fica rondando de um lado pro outro, e o comportamento mais NPC
    //  possível". Rondar é o que um corpo faz quando ninguém lhe deu destino.
    it('SEM plano ele não sai do lugar', () => {
        const corpo: CorpoDoNilo = { x: 3, z: 3, yaw: 0 };
        correr(corpo, null, 300);
        expect(corpo.x).toBe(3);
        expect(corpo.z).toBe(3);
    });

    it('sem plano ele ainda acompanha o jogador com o olhar', () => {
        // Parado é presença; parado E de costas é NPC quebrado.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: Math.PI };
        correr(corpo, null, 300, { x: 0, z: 10 });
        // Olhando para +z: yaw ≈ 0.
        expect(Math.abs(Math.atan2(Math.sin(corpo.yaw), Math.cos(corpo.yaw)))).toBeLessThan(0.1);
    });
});

describe('approach tem FIM — o NPC não gruda no jogador', () => {
    it('para na distância de conversa em vez de encostar', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, plano('approach', 'player'), 60 * 20, j);
        const d = dist(corpo, j);
        // Sem o freio ele encosta (d → 0) e fica vibrando contra o jogador.
        expect(d).toBeGreaterThan(1.2);
        expect(d).toBeLessThan(2.2);
    });

    it('e chega de fato mais perto do que estava', () => {
        // O outro lado: um freio cedo demais viraria "approach" que não anda.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 18 };
        const antes = dist(corpo, j);
        correr(corpo, plano('approach', 'player'), 60 * 5, j);
        expect(dist(corpo, j)).toBeLessThan(antes - 3);
    });
});

describe('withdraw dá espaço sem fugir para a parede', () => {
    it('afasta até um limite e para', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 9, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, plano('withdraw', 'player'), 60 * 30, j);
        const d = dist(corpo, j);
        expect(d).toBeGreaterThan(4);
        // Sem o teto ele iria até a parede (limite 22).
        expect(d).toBeLessThan(6);
    });

    it('recua de FRENTE: dar espaço não é virar as costas', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 9, yaw: 0 };
        correr(corpo, plano('withdraw', 'player'), 60 * 10, { x: 0, z: 10 });
        // Continua encarando +z (o jogador), mesmo tendo andado para -z.
        expect(Math.abs(Math.atan2(Math.sin(corpo.yaw), Math.cos(corpo.yaw)))).toBeLessThan(0.2);
    });
});

describe('orbit anda sem aproximar nem afastar', () => {
    it('mantém o raio e muda de posição', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 7, yaw: 0 };
        const j = { x: 0, z: 10 };
        const raioAntes = dist(corpo, j);
        const xAntes = corpo.x;
        correr(corpo, plano('orbit', 'player'), 60 * 4, j);
        expect(Math.abs(corpo.x - xAntes)).toBeGreaterThan(1);
        // O raio não pode explodir nem colapsar — era o defeito clássico de
        // órbita sem correção: ela abre um pouco a cada volta.
        expect(Math.abs(dist(corpo, j) - raioAntes)).toBeLessThan(1.5);
    });
});

describe('o ritmo importa, e a parede segura', () => {
    it('fast anda mais que slow no mesmo tempo', () => {
        const lento: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const rapido: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 20 };
        correr(lento, plano('approach', 'player', 'slow'), 60 * 3, j);
        correr(rapido, plano('approach', 'player', 'fast'), 60 * 3, j);
        expect(rapido.z).toBeGreaterThan(lento.z + 2);
    });

    it('nunca atravessa a parede', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(corpo, plano('explore', 'north-side', 'fast'), 60 * 60);
        expect(Math.abs(corpo.x)).toBeLessThanOrEqual(21.5);
        expect(Math.abs(corpo.z)).toBeLessThanOrEqual(21.5);
    });

    it('stay e hold não deslocam', () => {
        for (const verbo of ['stay', 'hold']) {
            const corpo: CorpoDoNilo = { x: 5, z: -5, yaw: 0 };
            correr(corpo, plano(verbo, 'player'), 60 * 10);
            expect(corpo.x).toBe(5);
            expect(corpo.z).toBe(-5);
        }
    });

    it('sem jogador no mundo, alvo `player` não move nem quebra', () => {
        const corpo: CorpoDoNilo = { x: 2, z: 2, yaw: 0 };
        for (let i = 0; i < 100; i += 1) passoDoPlano(corpo, plano('approach', 'player'), mundo(null));
        expect(corpo.x).toBe(2);
        expect(corpo.z).toBe(2);
    });
});
