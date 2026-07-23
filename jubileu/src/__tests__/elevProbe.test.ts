/**
 * elevProbe.test.ts — CONTENÇÃO do elevador. Uma sonda ANDA (passos resolvidos
 * por resolveCollision) e prova que o player não atravessa as paredes do cab.
 * Nasceu do bug do Felipe ("atravesso as paredes do elevador"): o cab é
 * renderizado em (0,-13) em todo nível (App.tsx), mas o Andar 9 não tinha
 * colisão pra ele. Aqui: os níveis com ELEV_W seguram; o 9 agora é sólido.
 */
import { describe, it, expect } from 'vitest';
import { wallsForState, PR } from '../constants';
import { resolveCollision } from '../physics';

function walk(walls: number[][], fx: number, fz: number, tx: number, tz: number): [number, number] {
  let x = fx, z = fz;
  for (let i = 0; i < 900; i++) {
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    if (d < 0.03) break;
    const s = Math.min(0.06, d);
    [x, z] = resolveCollision(x + (dx / d) * s, z + (dz / d) * s, PR, walls);
  }
  return [x, z];
}

// caixa do cab: x∈[-3.25,3.25], z∈[-16,-10]; porta (aberta) no meio da frente.
describe('elevador — contenção (níveis com ELEV_W: porta aberta)', () => {
  for (const lvl of [0, 2, 3, 5, 6, 8]) {
    it(`nível ${lvl}: paredes seguram, só a porta central passa`, () => {
      const w = wallsForState(lvl, false, false);
      expect(walk(w, 0, -13, -8, -13)[0]).toBeGreaterThan(-3.05);   // parede esquerda
      expect(walk(w, 0, -13, 8, -13)[0]).toBeLessThan(3.05);        // parede direita
      expect(walk(w, 0, -13, 0, -22)[1]).toBeGreaterThan(-15.9);    // fundo
      expect(walk(w, -2.2, -13, -2.2, -4)[1]).toBeLessThan(-9.9);   // canto frontal esq. barra
      expect(walk(w, 2.2, -13, 2.2, -4)[1]).toBeLessThan(-9.9);     // canto frontal dir. barra
      expect(walk(w, 0, -13, 0, -4)[1]).toBeGreaterThan(-7);        // porta central: passa
    });
  }
});

describe('elevador — Andar 9: o cab quebrado é SÓLIDO (fix do atravessar)', () => {
  it('a sonda não entra no elevador do Viveiro por nenhum lado', () => {
    const w = wallsForState(9, false, false);
    expect(walk(w, 0, -6, 0, -16)[1]).toBeGreaterThan(-10);   // pela frente (norte)
    expect(walk(w, 0, -20, 0, -10)[1]).toBeLessThan(-16);     // por trás (sul)
    expect(walk(w, -8, -13, 0, -13)[0]).toBeLessThan(-3.2);   // pela esquerda
    expect(walk(w, 8, -13, 0, -13)[0]).toBeGreaterThan(3.2);  // pela direita
  });
});
