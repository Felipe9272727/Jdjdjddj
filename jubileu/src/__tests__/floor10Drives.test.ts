import { describe, expect, it } from 'vitest';
import {
    circadianBaseline, dayPhase, describeMood, readClock, stepDrives,
    type DriveContext,
} from '../npc/floor10Drives';
import type { Floor10WillDrives } from '../npc/floor10Will';

const CTX: DriveContext = {
    hour: 12,
    playerVisible: false,
    elevatorVisible: false,
    moving: false,
    goal: 'idle',
    driftSeconds: 0,
};

/** Roda `segundos` de relógio interno em passos de 0,1s, como o jogo faz. */
function correr(
    inicio: Floor10WillDrives,
    segundos: number,
    ctx: Partial<DriveContext> = {},
): Floor10WillDrives {
    let d = inicio;
    for (let t = 0; t < segundos; t += 0.1) {
        d = stepDrives(d, { ...CTX, ...ctx, driftSeconds: t }, 0.1);
    }
    return d;
}

const INICIO: Floor10WillDrives = {
    social: 0.62, curiosity: 0.68, restlessness: 0.42, fatigue: 0.08,
};

describe('npc/floor10Drives — o relógio interno', () => {
    it('NÃO deixa mais o desejo grudar no teto', () => {
        // O defeito original: social subia 0.014/s sem nunca descer, então em
        // meio minuto estava em 1.0 e ficava lá o resto da partida.
        const meiaHora = correr(INICIO, 1800, { playerVisible: true });
        expect(meiaHora.social).toBeLessThan(0.98);
        expect(meiaHora.curiosity).toBeLessThan(0.98);
        // E nenhum deles some no zero.
        for (const v of Object.values(meiaHora)) {
            expect(v).toBeGreaterThan(0.01);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('a MESMA situação dá humores diferentes em horas diferentes', () => {
        // É o pedido do Felipe: "dependendo da hora muda".
        const madrugada = correr(INICIO, 900, { hour: 3 });
        const tarde = correr(INICIO, 900, { hour: 15 });
        expect(madrugada.fatigue).toBeGreaterThan(tarde.fatigue);
        expect(tarde.restlessness).toBeGreaterThan(madrugada.restlessness);
        // De noite a falta de gente pesa mais que de madrugada.
        const noite = correr(INICIO, 900, { hour: 20 });
        expect(noite.social).toBeGreaterThan(madrugada.social);
    });

    it('a base do dia é contínua: ele não vira outra pessoa às 18h01', () => {
        const antes = circadianBaseline(17.98);
        const depois = circadianBaseline(18.02);
        for (const chave of ['social', 'curiosity', 'restlessness', 'fatigue'] as const) {
            expect(Math.abs(antes[chave] - depois[chave])).toBeLessThan(0.02);
        }
    });

    it('servir a vontade ESVAZIA a vontade — é o que o faz mudar de ideia', () => {
        const carente = { ...INICIO, social: 0.9 };
        const conversando = correr(carente, 120, { goal: 'talk-player', playerVisible: true });
        const sozinho = correr(carente, 120, { goal: 'idle' });
        expect(conversando.social).toBeLessThan(carente.social);
        expect(conversando.social).toBeLessThan(sozinho.social);
    });

    it('andar cansa e acalma; parar descansa e dá formigamento', () => {
        const andando = correr(INICIO, 120, { moving: true, goal: 'wander' });
        const parado = correr(INICIO, 120, { moving: false, goal: 'idle' });
        expect(andando.fatigue).toBeGreaterThan(parado.fatigue);
        expect(parado.restlessness).toBeGreaterThan(andando.restlessness);
    });

    it('nunca sai da faixa 0..1, nem com dt absurdo', () => {
        let d = INICIO;
        for (let i = 0; i < 50; i += 1) {
            d = stepDrives(d, { ...CTX, playerVisible: true, moving: true }, 999);
            for (const v of Object.values(d)) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        }
    });

    it('sabe em que parte do dia está', () => {
        expect(dayPhase(3)).toBe('madrugada');
        expect(dayPhase(9)).toBe('manha');
        expect(dayPhase(15)).toBe('tarde');
        expect(dayPhase(22)).toBe('noite');
        // Hora fora da faixa não quebra (fuso, relógio bagunçado).
        expect(dayPhase(-1)).toBe('noite');
        expect(dayPhase(25)).toBe('madrugada'); // 25h = 1h
    });

    it('lê o relógio do aparelho de quem está jogando', () => {
        const c = readClock(new Date(2026, 6, 29, 3, 30));
        expect(c.hour).toBeCloseTo(3.5, 2);
        expect(c.phase).toBe('madrugada');
        expect(c.label).toContain('madrugada');
    });

    it('o cérebro pequeno recebe a HORA, não só números soltos', () => {
        const texto = describeMood(
            { social: 0.9, curiosity: 0.2, restlessness: 0.8, fatigue: 0.9 },
            readClock(new Date(2026, 6, 29, 3, 0)),
        );
        expect(texto).toContain('03h');
        expect(texto).toContain('madrugada');
        expect(texto).toContain('worn out');
        expect(texto).toContain('starved for company');
    });
});
