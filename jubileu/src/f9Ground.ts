/**
 * f9Ground.ts — a ALTURA do chão do Viveiro, FONTE ÚNICA.
 *
 * Antes a fórmula do relevo vivia embutida no <Ground> (Floor9Forest) e
 * nada mais podia pisar no terreno: bichos flutuavam/afundavam, poças e
 * sombras-blob não tinham onde apoiar. Agora o Ground, a fauna, a tempestade
 * (splashes/poças) e as sombras consultam a MESMA função.
 *
 * Puro: sem three/react. A fórmula é EXATAMENTE a que o Ground sempre usou
 * (tigela nas bordas + ondulação senoidal no miolo, aplanada na trilha do
 * fio e no claro do pouso) — alterar aqui altera o chão renderizado junto.
 */
import { F9_FIO, F9_RAIZ_CHAMBER } from './f9Floresta';
import { F9_OCOS } from './f9Eco';

// M18: PISOS NIVELADOS dos santuários — dentro de cada oco e da câmara da
// Raiz o chão vira terra batida plana (interiores reais precisam de piso; a
// tigela da borda subia um MORRO dentro da câmara — a QA visual pegou).
// [cx, cz, raio plano, raio de mistura, altura alvo]
const FLATS: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [F9_RAIZ_CHAMBER[0], F9_RAIZ_CHAMBER[1], 4.3, 6.2, 0.3],
    ...F9_OCOS.map(([ox, oz]) => [ox, oz, 2.5, 3.8, 0.02] as const),
];

/** Altura do chão em (x, z) — coordenadas do mundo do Andar 9. */
export function f9GroundHeight(x: number, z: number): number {
    // relevo: tigela nas bordas + ondulação leve no miolo
    const ex = Math.max(0, Math.abs(x) - 27) / 7;
    const ez = Math.max(0, (z < -24 ? -46 - z : z - (-2))) / 7;
    const edge = Math.max(ex, ez);
    let h = edge * edge * 3.4;
    h += Math.sin(x * 0.31 + z * 0.17) * 0.14 + Math.sin(x * 0.11 - z * 0.23) * 0.12;
    // corredor do fio fica plano (os pés do player não flutuam)
    let trailK = 0;
    for (const [fx, fz] of F9_FIO) {
        const d = Math.hypot(x - fx, z - fz);
        if (d < 3.4) trailK = Math.max(trailK, 1 - d / 3.4);
    }
    const spawnK = Math.max(0, 1 - Math.hypot(x, z + 2) / 6.5);
    const flat = Math.max(trailK, spawnK);
    h *= (1 - flat * 0.9);
    // os pisos dos santuários por último (mandam no relevo E na trilha)
    for (const [cx, cz, r0, r1, hT] of FLATS) {
        const d = Math.hypot(x - cx, z - cz);
        if (d >= r1) continue;
        const k = d <= r0 ? 1 : 1 - (d - r0) / (r1 - r0);
        h += (hT - h) * k;
    }
    return h - 0.02;
}
