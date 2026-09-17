import { describe, expect, it } from 'vitest';
import { F12_CINEMA, CENA_DA_DERROTA, cinemaEase, victoryBeat, defeatBeat } from '../f12Cinema';
import { f12IntroCamera } from '../f12Presentation';

describe('cinematic lifecycle', () => {
  it('keeps the reactor rupture, fall and escort in order', () => {
    expect(victoryBeat(0)).toMatchObject({ rupture: 0, fall: 0, escape: 0, finished: false });
    expect(victoryBeat(F12_CINEMA.rupture).fall).toBe(0);
    expect(victoryBeat(4).rupture).toBe(1);
    expect(victoryBeat(7).escape).toBe(0);
    expect(victoryBeat(F12_CINEMA.victory)).toMatchObject({ rupture: 1, fall: 1, escape: 1, finished: true });
  });
  it('finishes at the terminal frame and stays finished', () => {
    expect(victoryBeat(F12_CINEMA.victory - .001).finished).toBe(false);
    expect(victoryBeat(F12_CINEMA.victory + 30).finished).toBe(true);
    expect(victoryBeat(-2)).toEqual(victoryBeat(0));
  });
  it('keeps every motion channel bounded across the complete sequence', () => {
    for (let t = -1; t < 15; t += .017) {
      const { finished: _, ...channels } = victoryBeat(t);
      for (const value of Object.values(channels)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(cinemaEase(-10)).toBe(0); expect(cinemaEase(10)).toBe(1);
  });
  it('holds the camera inside the cabin until the doors reveal the sky', () => {
    expect(f12IntroCamera(0)).toEqual(f12IntroCamera(.2));
    expect(f12IntroCamera(0)).toMatchObject({ x: 0, y: .35, z: .55 });
  });
  it('has continuous finite camera marks through each shot transition', () => {
    for (const p of [.22, .48, .69, .91]) {
      const before = f12IntroCamera(p - .00001), after = f12IntroCamera(p + .00001);
      for (const key of Object.keys(before) as (keyof typeof before)[]) {
        expect(Number.isFinite(after[key])).toBe(true);
        expect(Math.abs(after[key] - before[key])).toBeLessThan(.01);
      }
    }
  });
});

describe('a derrota é uma cena, e não um desligar', () => {
    // Perder ia direto para `fase = 'derrota'`: balão de fala e botão REPETIR,
    // sem um quadro de consequência, ao lado dos 10,5 s coreografados da
    // vitória. É o desfecho que o jogador ruim vê mais vezes.
    it('as batidas acontecem em ordem, e nenhuma começa antes da anterior', () => {
        const meio = defeatBeat(CENA_DA_DERROTA.total / 2);
        expect(meio.atingido).toBe(1);          // o baque já passou
        expect(meio.rodopio).toBeGreaterThan(0.5);
        expect(meio.preto).toBe(0);             // ainda não fechou
    });

    it('a cabeça só avança depois de o avião já estar caindo', () => {
        const b = defeatBeat(CENA_DA_DERROTA.engolir);
        expect(b.engolir).toBe(0);
        expect(b.rodopio).toBeGreaterThan(0.8);
        expect(defeatBeat(CENA_DA_DERROTA.engolir + 1.2).engolir).toBeGreaterThan(0.2);
    });

    it('termina fechada: no fim, tudo está em 1', () => {
        const fim = defeatBeat(CENA_DA_DERROTA.total);
        expect(fim.finished).toBe(true);
        expect(fim.engolir).toBe(1);
        expect(fim.preto).toBe(1);
    });

    it('é mais curta que a vitória — prêmio se assiste, consequência não', () => {
        expect(CENA_DA_DERROTA.total).toBeLessThan(F12_CINEMA.victory);
    });

    it('nunca sai da faixa 0..1, em nenhum instante', () => {
        for (let t = -1; t < 12; t += 0.05) {
            for (const v of Object.values(defeatBeat(t))) {
                if (typeof v === 'number') { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
            }
        }
    });
});
