import { describe, expect, it } from 'vitest';
import {
    CACHE_HEADROOM,
    formatGB,
    planModelCache,
} from '../npc/floor10ModelStorage';

const GB = 1e9;

describe('floor10ModelStorage — a cota que travava a carga', () => {
    it('reprova o caso REAL medido no jogo (cota 1,07 GB, modelo 1,92 GB)', () => {
        const plano = planModelCache({ quota: 1.07 * GB, usage: 0 }, 1.915 * GB);
        expect(plano.ok).toBe(false);
        if (plano.ok) return;
        expect(plano.message).toContain('1.07 GB');
        expect(plano.message).toContain('modelo');
    });

    it('aprova quando sobra espaço de verdade', () => {
        const plano = planModelCache({ quota: 6 * GB, usage: 1 * GB }, 1.915 * GB);
        expect(plano.ok).toBe(true);
        expect(plano.freeBytes).toBe(5 * GB);
    });

    it('conta o que já está em uso, não só a cota total', () => {
        // 3 GB de cota parecem suficientes até lembrar que 1,5 GB já foi gasto.
        expect(planModelCache({ quota: 3 * GB, usage: 1.5 * GB }, 1.915 * GB).ok).toBe(false);
    });

    it('exige uma folga além do tamanho puro do arquivo', () => {
        const justo = planModelCache({ quota: 1.92 * GB, usage: 0 }, 1.915 * GB);
        expect(justo.ok).toBe(false);
        expect(CACHE_HEADROOM).toBeGreaterThan(1);
    });

    it('na dúvida deixa tentar em vez de bloquear o NPC', () => {
        expect(planModelCache({ quota: null, usage: 0 }, 1.915 * GB).ok).toBe(true);
        expect(planModelCache({ quota: 1.07 * GB, usage: 0 }, null).ok).toBe(true);
    });
});

describe('floor10ModelStorage — formatação', () => {
    it('fala em GB com duas casas', () => {
        expect(formatGB(1.915e9)).toBe('1.92 GB');
        expect(formatGB(0)).toBe('0.00 GB');
    });
});
