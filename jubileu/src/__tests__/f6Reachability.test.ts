/**
 * f6Reachability — REGRESSÃO do soft-lock do Andar 6: em guestDemand o Aurélio
 * EXIGE a fotografia (que está na mala, no quarto), mas o player conserta o
 * elevador DE DENTRO do cab. Se a porta do cab for selada (o bug antigo,
 * DOOR_ELEVATOR_BLOCK de largura cheia), o player fica trancado longe da mala.
 *
 * Este teste prova, com a MESMA física do jogo (resolveCollision +
 * wallsForState), que existe um CORREDOR GENUINAMENTE ABERTO do cab até a mala,
 * contornando o CORPO do hóspede — e a contra-prova mostra que o selo antigo o
 * obstruía. Se alguém reintroduzir um bloqueio no vão, este teste quebra.
 *
 * Método à prova de tunelamento: amostra pontos ao longo do corredor e exige
 * que CADA um já tenha folga ≥ raio do player de toda parede (o resolve não
 * move o ponto). Se o caminho estivesse obstruído, algum ponto seria empurrado.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { f6, f6Reset, f6DoorWalls } from '../f6Escape';
import { wallsForState } from '../constants';
import { resolveCollision, COLLISION_RADIUS } from '../physics';

beforeEach(() => { f6Reset(); });

/** Quanto o resolve empurra o ponto — ~0 ⇒ tem folga ≥ raio de todas paredes. */
function pushDist(x: number, z: number, walls: number[][]): number {
    const [rx, rz] = resolveCollision(x, z, COLLISION_RADIUS, walls);
    return Math.hypot(rx - x, rz - z);
}

/** Amostra a polilinha (passo 0.05) e devolve a maior obstrução encontrada. */
function worstClearance(poly: Array<[number, number]>, walls: number[][]) {
    let worst = 0, at: [number, number] = poly[0];
    for (let i = 0; i < poly.length - 1; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
        const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.05));
        for (let s = 0; s <= n; s++) {
            const x = ax + (bx - ax) * (s / n), z = az + (bz - az) * (s / n);
            const p = pushDist(x, z, walls);
            if (p > worst) { worst = p; at = [x, z]; }
        }
    }
    return { worst, at };
}

// corredor humano: cab → vão centrado → à esquerda do corpo do hóspede → quarto
// → parado em frente à mala (o móvel da mala ocupa z≈[5.6,6.2], então a gente
// encosta por baixo, dentro do alcance de 1.8m do hotspot em (-2.0,5.9)).
const CORRIDOR: Array<[number, number]> = [
    [0, -13], [0, -10.4], [-1.25, -8.2], [-1.6, -5.0], [-2.0, 4.6],
];
const OLD_SEAL: number[][] = [[-1.45, -9.9, 1.45, -9.9]];

describe('PROBE: guestDemand — corredor cab → mala aberto', () => {
    it('o corpo do hóspede é mesmo o que a fase emite (x∈[-0.45,0.45])', () => {
        f6.phase = 'guestDemand';
        expect(f6DoorWalls()).toEqual(expect.arrayContaining([[-0.45, -8.2, 0.45, -8.2]]));
        expect(f6DoorWalls().some((w) => w[0] === -1.45 && w[2] === 1.45)).toBe(false);
    });

    it('todo o corredor tem folga ≥ raio (caminho genuíno, sem tunelar)', () => {
        f6.phase = 'guestDemand';
        const walls = [...wallsForState(6, false, false), ...f6DoorWalls()];
        const { worst, at } = worstClearance(CORRIDOR, walls);
        // < 1mm de empurrão ⇒ o player de raio 0.5 passa limpo por todo o trajeto
        expect(worst, `obstruído em (${at[0].toFixed(2)},${at[1].toFixed(2)})`).toBeLessThan(0.001);
    });

    it('CONTRA-PROVA: com o SELO ANTIGO o MESMO corredor é obstruído no vão', () => {
        const walls = [...wallsForState(6, false, false), ...OLD_SEAL];
        const { worst } = worstClearance(CORRIDOR, walls);
        // o selo em z=-9.9 barra o ponto do corredor que cruza o vão
        expect(worst).toBeGreaterThan(0.3);
    });
});
