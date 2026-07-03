/**
 * f6Maze.ts — Andar 6 "Labirinto Amarelo" (backrooms liminal).
 *
 * Módulo PURO (zero imports) com o mundo lógico do andar:
 *   • labirinto procedural determinístico (mulberry32 + DFS + loops extras),
 *     exportado como segmentos de parede no formato do physics.ts
 *     ([x1,z1,x2,z2]) — constants.ts compõe em wallsForState(6).
 *   • 3 fusíveis nos becos mais fundos (distância BFS da entrada).
 *   • BFS de caminho pros corredores (a Entidade anda por centros de célula,
 *     então nunca precisa de colisão própria).
 *   • linha-de-visão (segmento × paredes) pra detecção honesta.
 *   • f6Intercept — mira ESPECULATIVA inspirada no DeepSpec/DSpark do
 *     DeepSeek: rascunha (draft) a posição FUTURA do player a partir da
 *     velocidade, verifica se o palpite é válido (dentro do labirinto e
 *     alcançável) e, se não for, cai de volta pra verdade observada (a
 *     posição real). O mesmo loop draft→verify→accept/reject do speculative
 *     decoding, virando uma caçadora que corta caminho.
 *
 * Estado compartilhado no padrão f3Hazards: Floor6.tsx (render/entidade),
 * Player (via colisão de paredes comum) e App (HUD + progressão) leem o
 * mesmo registro sem prop-drilling.
 */

// ── Grade do labirinto ────────────────────────────────────────────────────────
export const F6_COLS = 9;
export const F6_ROWS = 7;
export const F6_CELL = 4;            // metros por célula
export const F6_X0 = -18;            // borda esquerda do labirinto
export const F6_Z0 = -6;             // borda frontal (a antecâmara fica em z -10..-6)
export const F6_WALL_H = 3.05;       // altura visual das paredes / teto

const ENTRANCE_C = 4;                // célula da entrada (vão na borda z=Z0)

// ── RNG determinístico (mulberry32, mesmo padrão do f3Parkour) ───────────────
function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Geração: DFS backtracker + aberturas extras (loops = backrooms) ──────────
// open[i] = passagens abertas da célula i (índice = c + r*COLS).
type Cell = { c: number; r: number };
const idx = (c: number, r: number) => c + r * F6_COLS;
const open: { n: boolean; s: boolean; e: boolean; w: boolean }[] = [];

function carve(): void {
    const rng = mulberry32(0x600d5eed);
    for (let i = 0; i < F6_COLS * F6_ROWS; i++) open.push({ n: false, s: false, e: false, w: false });
    const visited = new Array<boolean>(F6_COLS * F6_ROWS).fill(false);
    const stack: Cell[] = [{ c: ENTRANCE_C, r: 0 }];
    visited[idx(ENTRANCE_C, 0)] = true;
    while (stack.length) {
        const cur = stack[stack.length - 1];
        const nbs: { c: number; r: number; d: 'n' | 's' | 'e' | 'w'; o: 'n' | 's' | 'e' | 'w' }[] = [];
        if (cur.r + 1 < F6_ROWS && !visited[idx(cur.c, cur.r + 1)]) nbs.push({ c: cur.c, r: cur.r + 1, d: 'n', o: 's' });
        if (cur.r - 1 >= 0      && !visited[idx(cur.c, cur.r - 1)]) nbs.push({ c: cur.c, r: cur.r - 1, d: 's', o: 'n' });
        if (cur.c + 1 < F6_COLS && !visited[idx(cur.c + 1, cur.r)]) nbs.push({ c: cur.c + 1, r: cur.r, d: 'e', o: 'w' });
        if (cur.c - 1 >= 0      && !visited[idx(cur.c - 1, cur.r)]) nbs.push({ c: cur.c - 1, r: cur.r, d: 'w', o: 'e' });
        if (!nbs.length) { stack.pop(); continue; }
        const n = nbs[Math.floor(rng() * nbs.length)];
        open[idx(cur.c, cur.r)][n.d] = true;
        open[idx(n.c, n.r)][n.o] = true;
        visited[idx(n.c, n.r)] = true;
        stack.push({ c: n.c, r: n.r });
    }
    // Loops extras: um labirinto perfeito só tem UM caminho entre dois pontos —
    // claustrofóbico demais pra fugir da Entidade. ~12 aberturas a mais criam
    // rotas de fuga (e deixam a perseguição justa).
    let punched = 0;
    while (punched < 12) {
        const c = Math.floor(rng() * F6_COLS);
        const r = Math.floor(rng() * F6_ROWS);
        const horiz = rng() < 0.5;
        if (horiz && c + 1 < F6_COLS && !open[idx(c, r)].e) {
            open[idx(c, r)].e = true; open[idx(c + 1, r)].w = true; punched++;
        } else if (!horiz && r + 1 < F6_ROWS && !open[idx(c, r)].n) {
            open[idx(c, r)].n = true; open[idx(c, r + 1)].s = true; punched++;
        }
    }
}
carve();

// ── Conversão em segmentos de parede (formato physics.ts: [x1,z1,x2,z2]) ─────
export const cellCenter = (c: number, r: number): { x: number; z: number } => ({
    x: F6_X0 + c * F6_CELL + F6_CELL / 2,
    z: F6_Z0 + r * F6_CELL + F6_CELL / 2,
});
export const worldToCell = (x: number, z: number): Cell => ({
    c: Math.max(0, Math.min(F6_COLS - 1, Math.floor((x - F6_X0) / F6_CELL))),
    r: Math.max(0, Math.min(F6_ROWS - 1, Math.floor((z - F6_Z0) / F6_CELL))),
});

function buildWalls(): number[][] {
    const w: number[][] = [];
    const X1 = F6_X0 + F6_COLS * F6_CELL;   // +18
    const Z1 = F6_Z0 + F6_ROWS * F6_CELL;   // +22
    // Internas: leste de cada célula (parede vertical) + norte (horizontal).
    for (let r = 0; r < F6_ROWS; r++) {
        for (let c = 0; c < F6_COLS; c++) {
            const o = open[idx(c, r)];
            const x = F6_X0 + (c + 1) * F6_CELL;
            const z = F6_Z0 + (r + 1) * F6_CELL;
            if (c + 1 < F6_COLS && !o.e) w.push([x, F6_Z0 + r * F6_CELL, x, F6_Z0 + (r + 1) * F6_CELL]);
            if (r + 1 < F6_ROWS && !o.n) w.push([F6_X0 + c * F6_CELL, z, F6_X0 + (c + 1) * F6_CELL, z]);
        }
    }
    // Borda do labirinto — vão de entrada na célula ENTRANCE_C (frente, z=Z0).
    const gapX0 = F6_X0 + ENTRANCE_C * F6_CELL;
    const gapX1 = gapX0 + F6_CELL;
    w.push([F6_X0, F6_Z0, gapX0, F6_Z0]);
    w.push([gapX1, F6_Z0, X1, F6_Z0]);
    w.push([F6_X0, Z1, X1, Z1]);                     // fundo
    // Laterais estendidas até a fachada (cobrem a antecâmara z -10..-6).
    w.push([F6_X0, -10, F6_X0, Z1]);
    w.push([X1, -10, X1, Z1]);
    // Fachada do elevador (vão da porta em x -1.3..1.3, igual FLOOR3_BND).
    w.push([F6_X0, -10, -1.3, -10]);
    w.push([1.3, -10, X1, -10]);
    return w;
}
export const F6_MAZE_WALLS: readonly number[][] = buildWalls();

// ── BFS: distâncias e caminhos pelos corredores ──────────────────────────────
function bfsFrom(c0: number, r0: number): Int16Array {
    const dist = new Int16Array(F6_COLS * F6_ROWS).fill(-1);
    dist[idx(c0, r0)] = 0;
    const q: Cell[] = [{ c: c0, r: r0 }];
    while (q.length) {
        const cur = q.shift()!;
        const d = dist[idx(cur.c, cur.r)];
        const o = open[idx(cur.c, cur.r)];
        const step = (c: number, r: number) => {
            if (dist[idx(c, r)] === -1) { dist[idx(c, r)] = d + 1; q.push({ c, r }); }
        };
        if (o.n) step(cur.c, cur.r + 1);
        if (o.s) step(cur.c, cur.r - 1);
        if (o.e) step(cur.c + 1, cur.r);
        if (o.w) step(cur.c - 1, cur.r);
    }
    return dist;
}
const distFromEntrance = bfsFrom(ENTRANCE_C, 0);
export const f6DistFromEntrance = (c: number, r: number): number => distFromEntrance[idx(c, r)];

/** Caminho BFS célula→célula (lista de centros de célula, inclui o destino). */
export function f6Path(from: Cell, to: Cell): { x: number; z: number }[] {
    if (from.c === to.c && from.r === to.r) return [cellCenter(to.c, to.r)];
    const prev = new Int16Array(F6_COLS * F6_ROWS).fill(-1);
    const seen = new Array<boolean>(F6_COLS * F6_ROWS).fill(false);
    seen[idx(from.c, from.r)] = true;
    const q: Cell[] = [from];
    while (q.length) {
        const cur = q.shift()!;
        if (cur.c === to.c && cur.r === to.r) break;
        const o = open[idx(cur.c, cur.r)];
        const step = (c: number, r: number) => {
            if (!seen[idx(c, r)]) { seen[idx(c, r)] = true; prev[idx(c, r)] = idx(cur.c, cur.r); q.push({ c, r }); }
        };
        if (o.n) step(cur.c, cur.r + 1);
        if (o.s) step(cur.c, cur.r - 1);
        if (o.e) step(cur.c + 1, cur.r);
        if (o.w) step(cur.c - 1, cur.r);
    }
    const path: { x: number; z: number }[] = [];
    let i = idx(to.c, to.r);
    if (!seen[i]) return [cellCenter(to.c, to.r)];   // inalcançável (não acontece: grafo conexo)
    while (i !== -1 && i !== idx(from.c, from.r)) {
        path.unshift(cellCenter(i % F6_COLS, Math.floor(i / F6_COLS)));
        i = prev[i];
    }
    return path;
}

// ── Linha de visão (segmento player↔entidade × paredes) ──────────────────────
function segsIntersect(ax: number, az: number, bx: number, bz: number,
                       cx: number, cz: number, dx: number, dz: number): boolean {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
/** true = nada entre os dois pontos (a Entidade te VÊ). */
export function f6LosClear(x1: number, z1: number, x2: number, z2: number): boolean {
    for (const w of F6_MAZE_WALLS) {
        if (segsIntersect(x1, z1, x2, z2, w[0], w[1], w[2], w[3])) return false;
    }
    return true;
}

// ── Mira especulativa (DeepSpec draft→verify) ────────────────────────────────
/**
 * Rascunha um ponto de intercepto: onde o player VAI estar quando a Entidade
 * chegar lá (τ = dist/velocidade, clampado). Verificação: o palpite precisa
 * cair dentro do labirinto E continuar visível/plausível; palpite rejeitado →
 * usa a verdade observada (posição real). `drafted` diz se o chute foi aceito.
 */
export function f6Intercept(
    px: number, pz: number,          // posição real do player (ground truth)
    vx: number, vz: number,          // velocidade estimada do player (u/s)
    ex: number, ez: number,          // posição da entidade
    speed: number,                    // velocidade da entidade (u/s)
): { x: number; z: number; drafted: boolean } {
    const speedSq = vx * vx + vz * vz;
    if (speedSq < 0.16 || speed <= 0) return { x: px, z: pz, drafted: false }; // parado → sem chute
    const dist = Math.hypot(px - ex, pz - ez);
    const tau = Math.min(1.4, dist / speed);          // horizonte do rascunho
    let gx = px + vx * tau;
    let gz = pz + vz * tau;
    // Verify 1: clampa pra dentro do mundo jogável (labirinto + antecâmara).
    const X1 = F6_X0 + F6_COLS * F6_CELL, Z1 = F6_Z0 + F6_ROWS * F6_CELL;
    gx = Math.max(F6_X0 + 0.6, Math.min(X1 - 0.6, gx));
    gz = Math.max(-9.4, Math.min(Z1 - 0.6, gz));
    // Verify 2: o chute precisa ser visível DA POSIÇÃO REAL do player (o
    // player não atravessa parede em τ segundos). Rejeitado → verdade real.
    if (!f6LosClear(px, pz, gx, gz)) return { x: px, z: pz, drafted: false };
    return { x: gx, z: gz, drafted: true };
}

// ── Fusíveis: os 3 becos mais fundos (determinístico e espalhado) ────────────
function pickFuseCells(): Cell[] {
    const cells: (Cell & { d: number })[] = [];
    for (let r = 0; r < F6_ROWS; r++) for (let c = 0; c < F6_COLS; c++) {
        cells.push({ c, r, d: distFromEntrance[idx(c, r)] });
    }
    cells.sort((a, b) => b.d - a.d);
    const picked: Cell[] = [];
    for (const cand of cells) {
        if (picked.length === 3) break;
        // espalha: pelo menos 5 células (manhattan) de distância entre fusíveis
        if (picked.every((p) => Math.abs(p.c - cand.c) + Math.abs(p.r - cand.r) >= 5)) {
            picked.push({ c: cand.c, r: cand.r });
        }
    }
    return picked;
}
export const F6_FUSE_CELLS: readonly Cell[] = pickFuseCells();
export const F6_FUSES: readonly { id: number; x: number; z: number }[] =
    F6_FUSE_CELLS.map((cell, id) => ({ id, ...cellCenter(cell.c, cell.r) }));

/** Spawn da Entidade: a célula mais funda que NÃO é fusível. */
function pickEntitySpawn(): { x: number; z: number } {
    let best: Cell = { c: F6_COLS - 1, r: F6_ROWS - 1 };
    let bestD = -1;
    for (let r = 0; r < F6_ROWS; r++) for (let c = 0; c < F6_COLS; c++) {
        const d = distFromEntrance[idx(c, r)];
        const isFuse = F6_FUSE_CELLS.some((f) => f.c === c && f.r === r);
        if (!isFuse && d > bestD) { bestD = d; best = { c, r }; }
    }
    return cellCenter(best.c, best.r);
}
export const F6_ENTITY_SPAWN = pickEntitySpawn();

// ── Estado compartilhado (padrão f3Hazards) ──────────────────────────────────
export const F6_FUSE_COUNT = 3;
export const f6State = {
    fuses: 0,               // coletados (HUD; ganha ao voltar pro elevador com 3)
    needed: F6_FUSE_COUNT,
    caught: 0,              // quantas vezes a Entidade pegou o player (escala a caçada)
    hunting: false,         // espelho do modo da Entidade (HUD/áudio leem)
};
const fuseTaken: boolean[] = new Array(F6_FUSE_COUNT).fill(false);
export const f6FuseTaken = (i: number): boolean => fuseTaken[i];

let onProgress: (() => void) | null = null;
export function setOnF6Progress(cb: (() => void) | null): void { onProgress = cb; }
const notify = () => { if (onProgress) onProgress(); };

/** Coleta por proximidade. Retorna o índice coletado ou -1. */
export function f6TryCollectFuse(x: number, z: number): number {
    for (const f of F6_FUSES) {
        if (!fuseTaken[f.id]) {
            const dx = x - f.x, dz = z - f.z;
            if (dx * dx + dz * dz < 1.44) {           // raio 1.2
                fuseTaken[f.id] = true;
                f6State.fuses++;
                notify();
                return f.id;
            }
        }
    }
    return -1;
}

/** A Entidade pegou o player (Floor6.tsx chama; App reage via onPlayerCaught). */
export function f6RegisterCaught(): void {
    f6State.caught++;
    notify();
}

export function f6Reset(): void {
    f6State.fuses = 0;
    f6State.caught = 0;
    f6State.hunting = false;
    fuseTaken.fill(false);
}
