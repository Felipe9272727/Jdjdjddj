import type { Superficie, Posicao } from './agente/agenteCorpo';

// Geometry is also the physics source. No invisible route or NPC-only shortcut.
export const F11_PAREDES: number[][] = [
    [-12, -10, -1.3, -10], [1.3, -10, 12, -10],
    [-12, -10, -12, 16], [12, -10, 12, 16], [-12, 16, 12, 16],
    // Two offset partitions: aiming straight at the player gets stuck here.
    [-5, -1, 2, -1], [-5, -1, -5, 5], [4, 4, 10, 4],
];
export const F11_PLATAFORMAS: readonly Superficie[] = [
    { id: 1101, x: 2, z: 7, hw: 1.5, hd: 1.5, topY: 0.9 },
    { id: 1102, x: 2, z: 10.6, hw: 1.4, hd: 1.4, topY: 1.8 },
    { id: 1103, x: -1.2, z: 13, hw: 1.4, hd: 1.4, topY: 2.65 },
];
export const F11_SPAWN: Posicao = { x: 2.5, y: 0, z: -6 };
export const F11_MARCOS: readonly (Posicao & { id: string })[] = [
    { id: 'painel', x: -8, y: 0, z: 8 },
    { id: 'plataforma', x: -1.2, y: 2.65, z: 13 },
    { id: 'janela', x: 9, y: 0, z: 11 },
];
