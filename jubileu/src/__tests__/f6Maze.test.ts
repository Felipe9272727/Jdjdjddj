import { describe, it, expect, beforeEach } from 'vitest';
import {
    F6_COLS, F6_ROWS, F6_CELL, F6_X0, F6_Z0,
    F6_MAZE_WALLS, F6_FUSES, F6_FUSE_CELLS, F6_FUSE_COUNT, F6_ENTITY_SPAWN,
    f6State, f6Reset, f6TryCollectFuse, f6FuseTaken, f6RegisterCaught,
    f6DistFromEntrance, f6Path, f6LosClear, f6Intercept, cellCenter, worldToCell,
    setOnF6Progress,
} from '../f6Maze';

describe('f6Maze — geração do labirinto', () => {
    it('paredes no formato do physics.ts ([x1,z1,x2,z2] finitos)', () => {
        expect(F6_MAZE_WALLS.length).toBeGreaterThan(20);
        for (const w of F6_MAZE_WALLS) {
            expect(w).toHaveLength(4);
            for (const v of w) expect(Number.isFinite(v)).toBe(true);
        }
    });

    it('todas as células são alcançáveis a partir da entrada (labirinto conexo)', () => {
        for (let r = 0; r < F6_ROWS; r++) {
            for (let c = 0; c < F6_COLS; c++) {
                expect(f6DistFromEntrance(c, r)).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('f6Path liga quaisquer duas células e termina no destino', () => {
        const path = f6Path({ c: 0, r: 0 }, { c: F6_COLS - 1, r: F6_ROWS - 1 });
        expect(path.length).toBeGreaterThan(0);
        const last = path[path.length - 1];
        const target = cellCenter(F6_COLS - 1, F6_ROWS - 1);
        expect(last.x).toBeCloseTo(target.x);
        expect(last.z).toBeCloseTo(target.z);
    });

    it('worldToCell inverte cellCenter (com clamp nas bordas)', () => {
        const { x, z } = cellCenter(3, 2);
        expect(worldToCell(x, z)).toEqual({ c: 3, r: 2 });
        // fora do labirinto (antecâmara) → clampa pra primeira fileira
        expect(worldToCell(0, -9).r).toBe(0);
    });
});

describe('f6Maze — fusíveis e Entidade', () => {
    it('3 fusíveis, fundos (BFS ≥ 6 da entrada) e espalhados (manhattan ≥ 5)', () => {
        expect(F6_FUSES).toHaveLength(F6_FUSE_COUNT);
        for (const cell of F6_FUSE_CELLS) {
            expect(f6DistFromEntrance(cell.c, cell.r)).toBeGreaterThanOrEqual(6);
        }
        for (let i = 0; i < F6_FUSE_CELLS.length; i++) {
            for (let j = i + 1; j < F6_FUSE_CELLS.length; j++) {
                const a = F6_FUSE_CELLS[i], b = F6_FUSE_CELLS[j];
                expect(Math.abs(a.c - b.c) + Math.abs(a.r - b.r)).toBeGreaterThanOrEqual(5);
            }
        }
    });

    it('o spawn da Entidade não coincide com nenhum fusível', () => {
        for (const f of F6_FUSES) {
            const d = Math.hypot(f.x - F6_ENTITY_SPAWN.x, f.z - F6_ENTITY_SPAWN.z);
            expect(d).toBeGreaterThan(F6_CELL / 2);
        }
    });
});

describe('f6Maze — linha de visão', () => {
    it('ponto → ele mesmo é sempre visível', () => {
        const { x, z } = cellCenter(2, 2);
        expect(f6LosClear(x, z, x + 0.1, z + 0.1)).toBe(true);
    });

    it('uma parede interna bloqueia a visão entre os dois lados dela', () => {
        // acha uma parede interna (não-borda) e testa os dois lados do meio dela
        const inner = F6_MAZE_WALLS.find((w) => {
            const [x1, z1, x2, z2] = w;
            const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
            return midX > F6_X0 + F6_CELL && midX < F6_X0 + (F6_COLS - 1) * F6_CELL &&
                   midZ > F6_Z0 + F6_CELL && midZ < F6_Z0 + (F6_ROWS - 1) * F6_CELL;
        })!;
        expect(inner).toBeDefined();
        const [x1, z1, x2, z2] = inner;
        const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
        // normal perpendicular ao segmento
        const len = Math.hypot(x2 - x1, z2 - z1);
        const nx = -(z2 - z1) / len, nz = (x2 - x1) / len;
        expect(f6LosClear(midX + nx, midZ + nz, midX - nx, midZ - nz)).toBe(false);
    });
});

describe('f6Maze — mira especulativa (DeepSpec draft→verify)', () => {
    it('player parado → sem rascunho (usa a verdade observada)', () => {
        const g = f6Intercept(0, 0, 0, 0, 5, 5, 3.3);
        expect(g.drafted).toBe(false);
        expect(g.x).toBe(0);
        expect(g.z).toBe(0);
    });

    it('player em movimento → rascunho à frente, mas SEMPRE dentro do mundo', () => {
        const c = cellCenter(4, 3);
        const g = f6Intercept(c.x, c.z, 4, 0, c.x - 6, c.z, 3.3);
        expect(Math.abs(g.x - c.x) + Math.abs(g.z - c.z)).toBeGreaterThan(0); // antecipou
        expect(g.x).toBeGreaterThanOrEqual(F6_X0);
        expect(g.x).toBeLessThanOrEqual(F6_X0 + F6_COLS * F6_CELL);
        expect(g.z).toBeGreaterThanOrEqual(-10);
        expect(g.z).toBeLessThanOrEqual(F6_Z0 + F6_ROWS * F6_CELL);
    });

    it('rascunho que atravessaria parede é REJEITADO (verify → posição real)', () => {
        // player colado numa parede interna, correndo na direção dela: o chute
        // cairia do outro lado → verify falha → cai de volta pro ground truth
        const inner = F6_MAZE_WALLS.find((w) => w[0] === w[2] &&
            w[0] > F6_X0 + F6_CELL && w[0] < F6_X0 + (F6_COLS - 1) * F6_CELL &&
            (w[1] + w[3]) / 2 > F6_Z0 + F6_CELL)!;
        const px = inner[0] - 0.4, pz = (inner[1] + inner[3]) / 2;
        const g = f6Intercept(px, pz, 6, 0, px - 5, pz, 3.3);
        expect(g.drafted).toBe(false);
        expect(g.x).toBe(px);
        expect(g.z).toBe(pz);
    });
});

describe('f6Maze — estado compartilhado', () => {
    beforeEach(() => {
        f6Reset();
        setOnF6Progress(null);
    });

    it('coleta por proximidade: incrementa, marca e não coleta duas vezes', () => {
        const f = F6_FUSES[0];
        expect(f6TryCollectFuse(f.x + 0.5, f.z)).toBe(f.id);
        expect(f6State.fuses).toBe(1);
        expect(f6FuseTaken(f.id)).toBe(true);
        expect(f6TryCollectFuse(f.x, f.z)).toBe(-1);      // já pego
        expect(f6TryCollectFuse(0, -8)).toBe(-1);          // longe de tudo
    });

    it('notifica o App a cada coleta e captura', () => {
        let calls = 0;
        setOnF6Progress(() => { calls++; });
        const f = F6_FUSES[1];
        f6TryCollectFuse(f.x, f.z);
        f6RegisterCaught();
        expect(calls).toBe(2);
        expect(f6State.caught).toBe(1);
    });

    it('f6Reset zera tudo', () => {
        const f = F6_FUSES[2];
        f6TryCollectFuse(f.x, f.z);
        f6RegisterCaught();
        f6Reset();
        expect(f6State.fuses).toBe(0);
        expect(f6State.caught).toBe(0);
        expect(f6State.hunting).toBe(false);
        expect(f6FuseTaken(f.id)).toBe(false);
    });
});
