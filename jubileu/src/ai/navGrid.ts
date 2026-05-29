/**
 * ai/navGrid.ts — A* navigation grid for the Floor 2 underwater cave.
 *
 * Local context-steering is great for smooth obstacle hugging, but it has a
 * fatal flaw: dead-ends and ravines are LOCAL MINIMA. When the shark swims into
 * the gap between two coral pillars (or a pillar and a wall bulge) every nearby
 * heading points at an obstacle, the steering nulls out, and it gets pinned —
 * the "enroscado" bug. A* solves this globally: it plans a path of FREE cells
 * from the shark to its goal, routing *around* obstacle clusters. The shark then
 * steers toward the next waypoint, so local steering only ever has to handle the
 * fine avoidance along an already-clear corridor.
 *
 * The grid is static (obstacles never move), built once at module load from the
 * same collider data the renderer uses. A* runs on fixed-size typed arrays with
 * zero per-call allocation; for a 30×30 grid a full search is well under a
 * millisecond, and the shark only re-plans a few times a second.
 */

import { UW_PILLAR_COLLIDERS, UW_BOULDERS } from '../Floor2/constants';

const ORIGIN = -30;        // world coord of the grid's lower corner (matches ±30 walls)
const CELL   = 2;          // 2-unit cells
const COLS   = 30;         // 30 × 2 = 60 → spans [-30, 30]
const NCELLS = COLS * COLS;
const AGENT  = 1.7;        // shark clearance baked into the blocked test

const blocked = new Uint8Array(NCELLS);

const cellCenter = (c: number): number => ORIGIN + c * CELL + CELL / 2;
const colOf      = (w: number): number => Math.floor((w - ORIGIN) / CELL);
const clampCol   = (c: number): number => (c < 0 ? 0 : c >= COLS ? COLS - 1 : c);

// ─── Build the blocked grid (full-height obstacles + a wall margin) ─────────
// Coral pillars and arch legs are full-height XZ cylinders, so they block at
// every swim depth. The big seafloor boulders form the visible ravine walls, so
// we project those into the grid too. Small scattered rocks are left to the 3D
// push-out (resolveUWObstacles) so the shark can still glide over them.
(function build() {
    for (let cz = 0; cz < COLS; cz++) {
        for (let cx = 0; cx < COLS; cx++) {
            const x = cellCenter(cx), z = cellCenter(cz);
            let b = 0;
            // Keep a one-cell margin off the walls (precise surface = resolveUWWalls).
            if (x < -27 || x > 27 || z < -27 || z > 27) b = 1;
            if (!b) {
                for (let i = 0; i < UW_PILLAR_COLLIDERS.length; i++) {
                    const p = UW_PILLAR_COLLIDERS[i];
                    const dx = x - p.x, dz = z - p.z;
                    const rr = p.r + AGENT;
                    if (dx * dx + dz * dz < rr * rr) { b = 1; break; }
                }
            }
            if (!b) {
                for (let i = 0; i < UW_BOULDERS.length; i++) {
                    const r = UW_BOULDERS[i];
                    const dx = x - r[0], dz = z - r[2];
                    const rr = r[3] * 0.78 + AGENT;   // matches the UW_ROCK collider radius
                    if (dx * dx + dz * dz < rr * rr) { b = 1; break; }
                }
            }
            blocked[cz * COLS + cx] = b;
        }
    }
})();

// ─── A* working buffers (single agent → safe to share) ──────────────────────
const gScore   = new Float32Array(NCELLS);
const fScore   = new Float32Array(NCELLS);
const cameFrom = new Int32Array(NCELLS);
const inOpen   = new Uint8Array(NCELLS);
const closed   = new Uint8Array(NCELLS);

const SQRT2 = 1.4142135623730951;
const NB: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Octile heuristic (admissible for 8-connectivity with unit/√2 step costs).
const heur = (ax: number, az: number, bx: number, bz: number): number => {
    const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
    return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
};

/** Nearest free cell index to (cx,cz), spiralling outward. Falls back to itself. */
function nearestFree(cx: number, cz: number): number {
    cx = clampCol(cx); cz = clampCol(cz);
    if (!blocked[cz * COLS + cx]) return cz * COLS + cx;
    for (let r = 1; r < COLS; r++) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // ring only
                const nx = cx + dx, nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= COLS || nz >= COLS) continue;
                if (!blocked[nz * COLS + nx]) return nz * COLS + nx;
            }
        }
    }
    return cz * COLS + cx;
}

function reconstruct(goal: number, start: number, out: number[]): number {
    out.length = 0;
    // Walk parents goal→start into a temp pair-list, then emit reversed so the
    // first waypoint is the one nearest the shark.
    const rev: number[] = [];
    let cur = goal;
    while (cur !== -1 && cur !== start) {
        rev.push(cellCenter(cur % COLS), cellCenter((cur / COLS) | 0));
        cur = cameFrom[cur];
    }
    for (let i = rev.length - 2; i >= 0; i -= 2) out.push(rev[i], rev[i + 1]);
    return out.length / 2;
}

/**
 * A* from world (sx,sz) to world (gx,gz). Writes waypoint world-XZ pairs into
 * `out` ([x0,z0,x1,z1,…], nearest first) and returns the waypoint count.
 * Returns 0 (and empties `out`) when start == goal or no path exists — the
 * caller should then fall back to steering straight at the goal.
 */
export function findPath(sx: number, sz: number, gx: number, gz: number, out: number[]): number {
    const start = nearestFree(colOf(sx), colOf(sz));
    const goal  = nearestFree(colOf(gx), colOf(gz));
    if (start === goal) { out.length = 0; return 0; }

    gScore.fill(Infinity);
    inOpen.fill(0);
    closed.fill(0);
    gScore[start] = 0;
    const gcx = goal % COLS, gcz = (goal / COLS) | 0;
    fScore[start] = heur(start % COLS, (start / COLS) | 0, gcx, gcz);
    inOpen[start] = 1;
    let openCount = 1;

    while (openCount > 0) {
        // Pop the lowest-f open cell (linear scan — grid is tiny).
        let cur = -1, best = Infinity;
        for (let i = 0; i < NCELLS; i++) {
            if (inOpen[i] && fScore[i] < best) { best = fScore[i]; cur = i; }
        }
        if (cur === goal) return reconstruct(goal, start, out);

        inOpen[cur] = 0; openCount--; closed[cur] = 1;
        const ccx = cur % COLS, ccz = (cur / COLS) | 0;

        for (let k = 0; k < NB.length; k++) {
            const dx = NB[k][0], dz = NB[k][1];
            const nx = ccx + dx, nz = ccz + dz;
            if (nx < 0 || nz < 0 || nx >= COLS || nz >= COLS) continue;
            const ni = nz * COLS + nx;
            if (blocked[ni] || closed[ni]) continue;
            // No diagonal corner-cutting through a blocked orthogonal neighbour.
            if (dx !== 0 && dz !== 0 &&
                (blocked[ccz * COLS + nx] || blocked[nz * COLS + ccx])) continue;
            const step = (dx !== 0 && dz !== 0) ? SQRT2 : 1;
            const tg = gScore[cur] + step;
            if (tg < gScore[ni]) {
                cameFrom[ni] = cur;
                gScore[ni]   = tg;
                fScore[ni]   = tg + heur(nx, nz, gcx, gcz);
                if (!inOpen[ni]) { inOpen[ni] = 1; openCount++; }
            }
        }
    }
    out.length = 0;
    return 0;
}
