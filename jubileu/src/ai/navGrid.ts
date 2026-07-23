/**
 * ai/navGrid.ts — Lazy Theta* any-angle navigation for the Floor 2 cave shark.
 *
 * Plain grid A* has two problems that made the shark look dumb / get stuck:
 *   1. It only steps along the 8 grid directions, so paths ZIGZAG and snag on
 *      cell corners instead of cutting straight at the player.
 *   2. If the goal cell is "blocked", the goal silently snaps elsewhere — which
 *      is exactly what broke pursuit: the player collects shards sitting right
 *      next to seafloor boulders, those cells were marked blocked, so the goal
 *      jumped away and the shark swam to the wrong place.
 *
 * Fixes:
 *   • LAZY THETA*  (Nash & Koenig, "Game AI Pro 2", ch.16; Lazy variant from
 *     AAAI-10). An any-angle planner: during the search it runs grid
 *     line-of-sight checks and lets a node inherit its grandparent as parent
 *     whenever the straight line is clear. The result is a smooth path of long
 *     straight runs aimed directly at the target — no post-smoothing, no
 *     zigzag, dramatically fewer places to snag. "Lazy" = it assumes line of
 *     sight and only verifies on expansion, ~10× fewer LOS checks.
 *   • The grid now blocks only the FULL-HEIGHT coral pillars (+ a thin wall
 *     margin). Seafloor boulders are low and handled by the 3D push-out, so
 *     they no longer wall off the shard areas the player actually visits.
 *
 * Static grid (obstacles never move), fixed-size typed arrays, zero per-call
 * allocation. A 30×30 search with lazy LOS is well under a millisecond and the
 * shark only re-plans a few times a second.
 */

import { UW_PILLAR_COLLIDERS } from '../Floor2/constants';

const ORIGIN = -30;        // world coord of the grid's lower corner (matches ±30 walls)
const CELL   = 2;          // 2-unit cells
const COLS   = 30;         // 30 × 2 = 60 → spans [-30, 30]
const NCELLS = COLS * COLS;
const AGENT  = 0.9;        // shark clearance baked into the blocked test (hitbox 0.5 + margin)

const blocked = new Uint8Array(NCELLS);

const cellCenter = (c: number): number => ORIGIN + c * CELL + CELL / 2;
const colOf      = (w: number): number => Math.floor((w - ORIGIN) / CELL);
const clampCol   = (c: number): number => (c < 0 ? 0 : c >= COLS ? COLS - 1 : c);

// True if the cell is off-grid or solid. Off-grid counts as blocked so LOS and
// neighbour expansion never walk outside the cave.
const isBlocked = (cx: number, cz: number): boolean =>
    cx < 0 || cz < 0 || cx >= COLS || cz >= COLS || blocked[cz * COLS + cx] === 1;

// ─── Build the blocked grid (full-height pillars + a thin wall margin) ──────
// ONLY coral pillars / arch legs — those are full-height XZ cylinders that
// block at every swim depth. Seafloor boulders are deliberately NOT baked in:
// they're low, the shark glides over them, and the 3D resolveUWObstacles()
// push-out handles the rare low-dive contact. Baking them was what made the
// shard zones (where the player lives) unreachable.
(function build() {
    for (let cz = 0; cz < COLS; cz++) {
        for (let cx = 0; cx < COLS; cx++) {
            const x = cellCenter(cx), z = cellCenter(cz);
            let b = 0;
            if (x < -28 || x > 28 || z < -28 || z > 28) b = 1;  // thin wall margin
            if (!b) {
                for (let i = 0; i < UW_PILLAR_COLLIDERS.length; i++) {
                    const p = UW_PILLAR_COLLIDERS[i];
                    const dx = x - p.x, dz = z - p.z;
                    const rr = p.r + AGENT;
                    if (dx * dx + dz * dz < rr * rr) { b = 1; break; }
                }
            }
            blocked[cz * COLS + cx] = b;
        }
    }
})();

// ─── Search buffers (single agent → safe to share, no allocation) ───────────
const gScore   = new Float32Array(NCELLS);
const fScore   = new Float32Array(NCELLS);
const parent   = new Int32Array(NCELLS);
const inOpen   = new Uint8Array(NCELLS);
const closed   = new Uint8Array(NCELLS);

const NB: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Straight-line (euclidean) distance between two cell indices — the natural
// metric for an any-angle planner, and an admissible heuristic.
const dist = (a: number, b: number): number => {
    const ax = a % COLS, az = (a / COLS) | 0;
    const bx = b % COLS, bz = (b / COLS) | 0;
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
};

// ─── Grid line-of-sight (Nash et al., the canonical Theta* LOS) ─────────────
// Returns true if the straight segment between the centres of cells a and b
// crosses no blocked cell. Integer-only, robust at corners.
function lineOfSight(a: number, b: number): boolean {
    let x0 = a % COLS, y0 = (a / COLS) | 0;
    const x1 = b % COLS, y1 = (b / COLS) | 0;
    let dx = x1 - x0, dy = y1 - y0;
    let sx = 1, sy = 1;
    if (dy < 0) { dy = -dy; sy = -1; }
    if (dx < 0) { dx = -dx; sx = -1; }
    let f = 0;
    if (dx >= dy) {
        while (x0 !== x1) {
            f += dy;
            if (f >= dx) {
                if (isBlocked(x0 + ((sx - 1) >> 1), y0 + ((sy - 1) >> 1))) return false;
                y0 += sy; f -= dx;
            }
            if (f !== 0 && isBlocked(x0 + ((sx - 1) >> 1), y0 + ((sy - 1) >> 1))) return false;
            if (dy === 0 &&
                isBlocked(x0 + ((sx - 1) >> 1), y0) &&
                isBlocked(x0 + ((sx - 1) >> 1), y0 - 1)) return false;
            x0 += sx;
        }
    } else {
        while (y0 !== y1) {
            f += dx;
            if (f >= dy) {
                if (isBlocked(x0 + ((sx - 1) >> 1), y0 + ((sy - 1) >> 1))) return false;
                x0 += sx; f -= dy;
            }
            if (f !== 0 && isBlocked(x0 + ((sx - 1) >> 1), y0 + ((sy - 1) >> 1))) return false;
            if (dx === 0 &&
                isBlocked(x0, y0 + ((sy - 1) >> 1)) &&
                isBlocked(x0 - 1, y0 + ((sy - 1) >> 1))) return false;
            y0 += sy;
        }
    }
    return true;
}

/** Nearest free cell index to (cx,cz), spiralling outward. Falls back to itself. */
function nearestFree(cx: number, cz: number): number {
    cx = clampCol(cx); cz = clampCol(cz);
    if (!isBlocked(cx, cz)) return cz * COLS + cx;
    for (let r = 1; r < COLS; r++) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // ring only
                const nx = cx + dx, nz = cz + dz;
                if (!isBlocked(nx, nz)) return nz * COLS + nx;
            }
        }
    }
    return cz * COLS + cx;
}

function reconstruct(goal: number, start: number, out: number[]): number {
    out.length = 0;
    const rev: number[] = [];
    let cur = goal;
    let guard = 0;
    while (cur !== -1 && cur !== start && guard++ < NCELLS) {
        rev.push(cellCenter(cur % COLS), cellCenter((cur / COLS) | 0));
        cur = parent[cur];
    }
    for (let i = rev.length - 2; i >= 0; i -= 2) out.push(rev[i], rev[i + 1]);
    return out.length / 2;
}

/**
 * Lazy Theta* from world (sx,sz) to world (gx,gz). Writes any-angle waypoint
 * world-XZ pairs into `out` ([x0,z0,…], nearest first) and returns the count.
 * Returns 0 (and empties `out`) when start == goal or no path exists — the
 * caller should then steer straight at the goal.
 */
export function findPath(sx: number, sz: number, gx: number, gz: number, out: number[]): number {
    const start = nearestFree(colOf(sx), colOf(sz));
    const goal  = nearestFree(colOf(gx), colOf(gz));
    if (start === goal) { out.length = 0; return 0; }

    gScore.fill(Infinity);
    inOpen.fill(0);
    closed.fill(0);
    gScore[start] = 0;
    parent[start] = start;
    fScore[start] = dist(start, goal);
    inOpen[start] = 1;
    let openCount = 1;

    while (openCount > 0) {
        // Pop the lowest-f open cell (linear scan — grid is tiny).
        let cur = -1, best = Infinity;
        for (let i = 0; i < NCELLS; i++) {
            if (inOpen[i] && fScore[i] < best) { best = fScore[i]; cur = i; }
        }
        inOpen[cur] = 0; openCount--; closed[cur] = 1;

        // ── Lazy Theta* "SetVertex": we optimistically set parent[cur] to the
        // grandparent on relaxation; verify line of sight now that cur is being
        // expanded. If the straight line is actually blocked, fall back to the
        // best visible already-closed neighbour (true grid-A* parent).
        if (cur !== start && !lineOfSight(parent[cur], cur)) {
            let bp = -1, bg = Infinity;
            const ccx = cur % COLS, ccz = (cur / COLS) | 0;
            for (let k = 0; k < NB.length; k++) {
                const nx = ccx + NB[k][0], nz = ccz + NB[k][1];
                if (nx < 0 || nz < 0 || nx >= COLS || nz >= COLS) continue;
                const ni = nz * COLS + nx;
                if (!closed[ni]) continue;
                const cand = gScore[ni] + dist(ni, cur);
                if (cand < bg) { bg = cand; bp = ni; }
            }
            if (bp !== -1) { parent[cur] = bp; gScore[cur] = bg; }
        }

        if (cur === goal) return reconstruct(goal, start, out);

        const ccx = cur % COLS, ccz = (cur / COLS) | 0;
        const par = parent[cur];
        for (let k = 0; k < NB.length; k++) {
            const dx = NB[k][0], dz = NB[k][1];
            const nx = ccx + dx, nz = ccz + dz;
            if (nx < 0 || nz < 0 || nx >= COLS || nz >= COLS) continue;
            const ni = nz * COLS + nx;
            if (blocked[ni] || closed[ni]) continue;
            // No diagonal corner-cutting through a blocked orthogonal neighbour.
            if (dx !== 0 && dz !== 0 &&
                (isBlocked(ccx, nz) || isBlocked(nx, ccz))) continue;
            // LAZY: assume the parent of cur can see ni; cost via that parent.
            const cand = gScore[par] + dist(par, ni);
            if (cand < gScore[ni]) {
                parent[ni] = par;
                gScore[ni] = cand;
                fScore[ni] = cand + dist(ni, goal);
                if (!inOpen[ni]) { inOpen[ni] = 1; openCount++; }
            }
        }
    }
    out.length = 0;
    return 0;
}
