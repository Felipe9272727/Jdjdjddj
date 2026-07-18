import { beforeEach, describe, expect, it } from 'vitest';
import {
    f8finale,
    f8FinaleReset,
    f8FinaleStart,
    f8FinaleTick,
    F8_FINALE_CUES,
} from '../f8Finale';

beforeEach(() => f8FinaleReset());

describe('f8Finale — a entrega ao nono andar', () => {
    it('percorre todos os planos na ordem e só termina depois do preto', () => {
        f8FinaleStart();
        expect(f8finale.beat).toBe('door');
        const seen = new Set([f8finale.beat]);
        for (let i = 0; i < 12 * 60; i++) {
            seen.add(f8FinaleTick(1 / 60));
        }
        expect([...seen]).toEqual(F8_FINALE_CUES.map(([beat]) => beat));
        expect(f8finale.beat).toBe('done');
        expect(f8finale.active).toBe(false);
    });

    it('reset limpa um plano interrompido e permite uma nova entrega', () => {
        f8FinaleStart();
        for (let i = 0; i < 500; i++) f8FinaleTick(1 / 60);
        expect(['grip', 'push']).toContain(f8finale.beat);
        f8FinaleReset();
        expect(f8finale).toMatchObject({ active: false, beat: 'idle', t: 0, beatT: 0 });
        f8FinaleStart();
        expect(f8finale).toMatchObject({ active: true, beat: 'door', t: 0 });
    });
});
