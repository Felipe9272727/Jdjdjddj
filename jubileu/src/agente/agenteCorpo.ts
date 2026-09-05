import { TOLERANCIA_DE_POUSO } from '../f3Fisica';
import { F3_GRAVITY, F3_JUMP, PR, SPEED } from '../constants';
import { boxCollider, resolveCollision } from '../physics';

export type Posicao = { x: number; y: number; z: number };
export type Superficie = { id: number; x: number; z: number; hw: number; hd: number; topY: number };
export type Corpo = Posicao & { vy: number; vx: number; vz: number; grounded: boolean };
export type MundoFisico = {
    paredes: number[][];
    /** null means void. A floor must explicitly provide its ground. */
    chao: number | null;
    plataformas: readonly Superficie[];
};

export const criarCorpo = (p: Posicao): Corpo => ({ ...p, vy: 0, vx: 0, vz: 0, grounded: true });
export const contem = (p: Superficie, x: number, z: number, margem = 0) =>
    Math.abs(x - p.x) <= p.hw - margem && Math.abs(z - p.z) <= p.hd - margem;

/** Solids taller than the feet have sides; jumping never snaps up through a box. */
export function paredesNaAltura(mundo: MundoFisico, y: number): number[][] {
    const altas = mundo.plataformas.filter(p => p.topY > y + 0.08);
    return altas.length ? [...mundo.paredes, ...altas.flatMap(p => boxCollider(p.x, p.z, p.hw * 2, p.hd * 2))] : mundo.paredes;
}

/** Shared by the Floor 11 player and the agent. Small substeps prevent tunnelling. */
export function passoDoCorpo(c: Corpo, mundo: MundoFisico, dx: number, dz: number, pular: boolean, dt: number, velocidade = SPEED): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const tempo = Math.min(dt, 0.1);
    const n = Math.ceil(tempo / (1 / 120));
    const h = tempo / n;
    const mag = Math.hypot(dx, dz);
    const k = mag > 1 ? 1 / mag : 1;
    const v = Math.max(0, Math.min(SPEED, Number.isFinite(velocidade) ? velocidade : 0));
    if (pular && c.grounded) { c.vy = F3_JUMP; c.grounded = false; }
    for (let i = 0; i < n; i++) {
        const x0 = c.x, z0 = c.z, y0 = c.y;
        c.vy -= F3_GRAVITY * h;
        const proximoY = c.y + c.vy * h;
        const paredes = paredesNaAltura(mundo, Math.min(y0, proximoY));
        [c.x, c.z] = resolveCollision(c.x + dx * k * v * h, c.z + dz * k * v * h, PR, paredes);
        c.y = proximoY;
        let piso = mundo.chao ?? -Infinity;
        for (const p of mundo.plataformas) {
            if (contem(p, c.x, c.z) && p.topY <= y0 + TOLERANCIA_DE_POUSO && p.topY > piso) piso = p.topY;
        }
        c.grounded = c.vy <= 0 && c.y <= piso && y0 >= piso - TOLERANCIA_DE_POUSO;
        if (c.grounded) { c.y = piso; c.vy = 0; }
        c.vx = (c.x - x0) / h;
        c.vz = (c.z - z0) / h;
    }
}
