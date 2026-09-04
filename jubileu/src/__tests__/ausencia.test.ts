import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { circadianBaseline, readClock } from '../npc/floor10Drives';
import {
    drivesAoChegar, esquecerAusencia, fracaoRelaxada, lerAusencia, salvarAusencia,
} from '../npc/floor10Ausencia';

/**
 * ── O TEMPO PASSA PARA ELE TAMBÉM ────────────────────────────────────────
 *
 * O defeito estava numa linha do `floor10Will`:
 *
 *     private drives = drivesCopy(INITIAL_FLOOR10_WILL.drives)
 *
 * Toda entrada no Andar 10 devolvia o humor às MESMAS quatro constantes, a
 * qualquer hora e depois de qualquer ausência. O `floor10Drives.ts` existe
 * inteiro para dar homeostase e linha de base circadiana ao Nilo, e o
 * nascimento atropelava tudo.
 *
 * Este arquivo NÃO simula o que ele fez sozinho — isso seria fabricar história
 * que ninguém observou. Ele afirma só o que dá para afirmar: o tempo passou, e
 * a homeostase que já existe teria levado os desejos à linha da hora.
 */
function lojaDeMentira(): Storage {
    const dados = new Map<string, string>();
    return {
        get length() { return dados.size; },
        clear: () => dados.clear(),
        getItem: (k: string) => dados.get(k) ?? null,
        key: (i: number) => [...dados.keys()][i] ?? null,
        removeItem: (k: string) => { dados.delete(k); },
        setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    } as Storage;
}
beforeEach(() => { vi.stubGlobal('localStorage', lojaDeMentira()); });
afterEach(() => { vi.unstubAllGlobals(); });

const CALMO = { social: 0.2, curiosity: 0.2, restlessness: 0.2, fatigue: 0.2 };
const T = new Date('2026-09-04T15:00:00').getTime();

describe('a fração relaxada é a solução fechada da mesma equação', () => {
    it('tempo zero não anda nada', () => {
        expect(fracaoRelaxada(0)).toBe(0);
        expect(fracaoRelaxada(-10)).toBe(0);
    });

    it('20 s andam 63% do caminho; 60 s, 95%', () => {
        // `stepDrives` limita cada passo a 0,25 s porque é chamado por quadro.
        // Para uma ausência de horas, iterar seria dezenas de milhares de voltas
        // para chegar onde a fórmula chega direto.
        expect(fracaoRelaxada(20)).toBeCloseTo(0.632, 2);
        expect(fracaoRelaxada(60)).toBeCloseTo(0.950, 2);
    });

    it('uma ausência longa chega ao fim do caminho, sem passar dele', () => {
        expect(fracaoRelaxada(86_400)).toBeGreaterThan(0.999);
        expect(fracaoRelaxada(86_400)).toBeLessThanOrEqual(1);
    });
});

describe('com que humor ele te recebe', () => {
    it('sem nada salvo, ele nasce na LINHA DA HORA — não em constante', () => {
        // É o ponto do arquivo: a mesma pessoa em horas diferentes.
        const base = circadianBaseline(readClock(new Date(T)).hour);
        expect(drivesAoChegar(T, null)).toEqual(base);
    });

    it('a hora muda quem ele é', () => {
        const madrugada = drivesAoChegar(new Date('2026-09-04T03:00:00').getTime(), null);
        const tarde = drivesAoChegar(new Date('2026-09-04T15:00:00').getTime(), null);
        // De madrugada ele mal se sustenta; a fadiga é a onda mais forte.
        expect(madrugada.fatigue).toBeGreaterThan(tarde.fatigue);
    });

    it('sair e voltar CORRENDO mantém o humor', () => {
        const volta = drivesAoChegar(T + 1000, { drives: CALMO, em: T });
        expect(volta.social).toBeCloseTo(CALMO.social, 1);
    });

    it('sumir de verdade devolve ele à linha da hora', () => {
        const base = circadianBaseline(readClock(new Date(T)).hour);
        const volta = drivesAoChegar(T + 24 * 3_600_000, { drives: CALMO, em: T });
        expect(volta.social).toBeCloseTo(base.social, 3);
        expect(volta.fatigue).toBeCloseTo(base.fatigue, 3);
    });

    it('relógio para trás não inventa tempo negativo', () => {
        // Fuso, viagem, usuário mexendo no relógio. Zero é a leitura honesta.
        const volta = drivesAoChegar(T - 5000, { drives: CALMO, em: T });
        expect(volta.social).toBeCloseTo(CALMO.social, 5);
    });
});

describe('o disco não é fonte confiável', () => {
    it('grava e lê de volta', () => {
        salvarAusencia(CALMO, T);
        expect(lerAusencia()).toEqual({ drives: CALMO, em: T });
    });

    it('sem registro, não há registro', () => {
        expect(lerAusencia()).toBeNull();
    });

    it('JSON corrompido não vira exceção', () => {
        localStorage.setItem('floor10-ausencia-v1', '{quebrado');
        expect(() => lerAusencia()).not.toThrow();
        expect(lerAusencia()).toBeNull();
    });

    it('desejo com tipo errado não vira NaN no humor', () => {
        localStorage.setItem('floor10-ausencia-v1',
            JSON.stringify({ em: T, drives: { social: 'muito', curiosity: null } }));
        const lido = lerAusencia();
        expect(Number.isFinite(lido!.drives.social)).toBe(true);
        expect(lido!.drives.social).toBeGreaterThanOrEqual(0);
        expect(lido!.drives.social).toBeLessThanOrEqual(1);
    });

    it('sem carimbo de tempo, o registro não vale', () => {
        localStorage.setItem('floor10-ausencia-v1', JSON.stringify({ drives: CALMO }));
        expect(lerAusencia()).toBeNull();
    });

    it('esquecer apaga', () => {
        salvarAusencia(CALMO, T);
        esquecerAusencia();
        expect(lerAusencia()).toBeNull();
    });
});
