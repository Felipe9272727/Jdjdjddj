/**
 * f9Walls.test.ts — M18: a COLISÃO do Viveiro à prova de atravessamento.
 * Uma sonda ANDA de verdade (passos de 0.08 u resolvidos por resolveCollision,
 * o mesmo do Player/DevWalker) e prova que: a borda segura, as árvores-mãe
 * são sólidas, o oco só se entra PELA BOCA (a parede do tronco barra) e a
 * câmara da Raiz idem.
 */
import { describe, it, expect } from 'vitest';
import { wallsForState } from '../constants';
import { resolveCollision } from '../physics';
import { F9_OCOS, F9_OCO_MOUTH, F9_RAIZ_CHAMBER, F9_RAIZ_MOUTH } from '../f9Floresta';
import { F9_TREE_OBSTACLES } from '../f9Eco';

const walls = wallsForState(9, false, false);

/** anda do ponto A pro B em passos resolvidos; devolve onde PAROU. */
function walk(fromX: number, fromZ: number, toX: number, toZ: number, steps = 600): [number, number] {
    let x = fromX, z = fromZ;
    for (let i = 0; i < steps; i++) {
        const dx = toX - x, dz = toZ - z, d = Math.hypot(dx, dz);
        if (d < 0.04) break;
        const s = Math.min(0.08, d);
        [x, z] = resolveCollision(x + (dx / d) * s, z + (dz / d) * s, 0.5, walls);
    }
    return [x, z];
}
const dist = (x: number, z: number, cx: number, cz: number) => Math.hypot(x - cx, z - cz);

describe('f9Walls — M18: nada atravessável', () => {
    it('a BORDA do viveiro segura (norte, sul, leste, oeste)', () => {
        expect(walk(0, 0, 0, 10)[1]).toBeLessThan(4);        // norte (z=4)
        expect(walk(0, -48, 0, -60)[1]).toBeGreaterThan(-52); // sul (z=-52)
        expect(walk(30, -24, 44, -24)[0]).toBeLessThan(34);   // leste
        expect(walk(-30, -24, -44, -24)[0]).toBeGreaterThan(-34); // oeste
    });

    it('as 12 ÁRVORES-MÃE são sólidas (a sonda não alcança o miolo)', () => {
        for (const [tx, tz, tr] of F9_TREE_OBSTACLES) {
            const [x, z] = walk(tx, tz - tr - 2.5, tx, tz);
            expect(dist(x, z, tx, tz)).toBeGreaterThan(tr * 0.7);
        }
    });

    it('cada OCO entra PELA BOCA (o santuário é alcançável)', () => {
        F9_OCOS.forEach(([ox, oz], i) => {
            const m = F9_OCO_MOUTH[i];
            const [x, z] = walk(ox + Math.cos(m) * 3.6, oz + Math.sin(m) * 3.6, ox, oz);
            expect(dist(x, z, ox, oz)).toBeLessThan(0.7);
        });
    });

    it('cada OCO barra POR TRÁS (a parede do tronco não é atravessável)', () => {
        F9_OCOS.forEach(([ox, oz], i) => {
            const m = F9_OCO_MOUTH[i] + Math.PI;             // o lado oposto à boca
            const [x, z] = walk(ox + Math.cos(m) * 3.6, oz + Math.sin(m) * 3.6, ox, oz);
            expect(dist(x, z, ox, oz)).toBeGreaterThan(2.2);
        });
    });

    it('a CÂMARA da Raiz entra pela PORTA (a entrega acontece lá dentro)', () => {
        const [cx, cz] = F9_RAIZ_CHAMBER;
        const m = F9_RAIZ_MOUTH;
        const [x, z] = walk(cx + Math.cos(m) * 6, cz + Math.sin(m) * 6, cx, cz + 1.2);
        expect(dist(x, z, cx, cz + 1.2)).toBeLessThan(0.7);
    });

    it('a CÂMARA da Raiz barra PELA LATERAL', () => {
        const [cx, cz, cr] = F9_RAIZ_CHAMBER;
        for (const s of [-1, 1]) {
            const [x, z] = walk(cx + s * (cr + 3), cz, cx, cz);
            expect(dist(x, z, cx, cz)).toBeGreaterThan(cr - 0.2);
        }
    });
});
