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
import { F9_FIO } from './f9Floresta';

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
    return h - 0.02;
}
