/**
 * f3Parkour.ts — Endless parkour engine for Floor 3.
 *
 * Floor 3 used to be a fixed 6-platform obby that ended at a goal. This turns
 * it into an INFINITE climbing loop: a rolling pool of platforms that recycle
 * as the player advances. Platforms behind the player retire and are
 * regenerated ahead — deterministically (seeded RNG), so the course is
 * reproducible and, crucially, every generated platform is validated to never
 * overlap any other ("script pra que não possa existir mais essas
 * sobreposições"). The same `validateNoOverlaps` helper is exported for the
 * static chamber decor.
 *
 * Both the renderer (Floor3.tsx) and the physics (Player.tsx) read the SAME
 * live `platforms` array. Floor3 owns the per-frame `tick()` (animates moving
 * platforms + recycles); Player just reads positions for collision and asks
 * `respawnPoint()` when it falls into the void.
 *
 * Reachability is baked into the generator so the climb is always jumpable:
 * with F3_JUMP=9.5 / F3_GRAVITY=22 the apex is ~2.05u, so rises stay ≤1.4u and
 * horizontal offsets stay small.
 */

// ── Live platform record ─────────────────────────────────────────────────────
export interface F3Plat {
    id: number;        // stable identity (monotonic) — used as React key
    bx: number;        // base center X
    cz: number;        // center Z
    hw: number;        // half-width  (X)
    hd: number;        // half-depth  (Z)
    h: number;         // visual height
    topY: number;      // player foot level (top surface)
    moving: boolean;   // oscillates in X
    amp: number;       // X oscillation amplitude (0 when static)
    phase: number;     // oscillation phase offset
    x: number;         // LIVE center X (= bx + sin(t·sp+phase)·amp), read by all
    palette: number;   // index into the cartoon palette (renderer picks color)
}

// ── Tunables ─────────────────────────────────────────────────────────────────
const POOL          = 16;     // platforms kept live at once
const BEHIND        = 9;      // retire a platform once it's this far behind player
const X_LIMIT       = 11;     // |center X| ceiling (inside the ±14 corridor walls)
const MOVE_SPEED    = 0.9;    // oscillation angular speed
const CLASH_DY      = 1.3;    // platforms closer than this in Y can clash in XZ

// Generation ranges (kept conservative so every gap is jumpable).
const GAP_MIN = 3.0, GAP_MAX = 3.8;     // center-to-center Z gap
const RISE_MIN = 0.4, RISE_MAX = 1.4;   // climb per step
const REST_CHANCE = 0.18;               // chance of a flat "breather" step
const DROP_CHANCE = 0.10;               // chance of a small step DOWN
const MOVE_CHANCE = 0.20;               // chance a platform is a moving bridge
const DX_MAX = 1.9;                     // max lateral shift per step
const HALF_SET = [1.0, 1.2, 1.4];       // platform footprint half-extents

// ── Seeded RNG (mulberry32) — deterministic course ───────────────────────────
let _seed = 0x9e3779b9;
function rng(): number {
    _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand  = (a: number, b: number) => a + (b - a) * rng();
const pick  = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

// ── Live state ───────────────────────────────────────────────────────────────
export const platforms: F3Plat[] = [];
// Player.tsx writes its Z here every frame; Floor3.tsx's tick() reads it to
// drive recycling (the renderer owns the per-frame update, not the player).
export const f3PlayerZ = { current: 0 };
// Player Y too, so the sky/cloud backdrop can follow the endless vertical climb.
export const f3PlayerY = { current: 0 };

// Player motion state for the first-person hands' PROCEDURAL animation.
// Player.tsx writes it each frame; the FpHands component reads it to drive the
// idle breathing bob, the walk sway and the jump/fall swing (no GLB clips).
export const f3HandState = { vy: 0, moving: false, grounded: true };
let _nextId = 0;
let _lastTickT = -1;

// The fixed elevator landing the player spawns on (also the climb's first tile).
const START: Omit<F3Plat, 'x'> = {
    id: 0, bx: 0, cz: -5.0, hw: 6.5, hd: 4.5, h: 0.5, topY: 0,
    moving: false, amp: 0, phase: 0, palette: -1,   // palette -1 = neutral panel
};

// ── Overlap detection (the anti-sobreposição script) ─────────────────────────
/**
 * True if two platforms' XZ footprints intersect while sitting at nearly the
 * same height — i.e. they would visually/physically clash. Moving platforms use
 * their FULL swept X extent (±amp) so a sliding bridge can never overlap a
 * neighbor at any point in its travel.
 */
export function platsClash(a: F3Plat, b: F3Plat): boolean {
    if (Math.abs(a.topY - b.topY) >= CLASH_DY) return false;
    const aMinX = a.bx - a.hw - a.amp, aMaxX = a.bx + a.hw + a.amp;
    const bMinX = b.bx - b.hw - b.amp, bMaxX = b.bx + b.hw + b.amp;
    const aMinZ = a.cz - a.hd, aMaxZ = a.cz + a.hd;
    const bMinZ = b.cz - b.hd, bMaxZ = b.cz + b.hd;
    const sepX = aMaxX < bMinX || aMinX > bMaxX;
    const sepZ = aMaxZ < bMinZ || aMinZ > bMaxZ;
    return !(sepX || sepZ);
}

/**
 * Scan a platform list and return every clashing pair. Used by the generator to
 * reject bad placements and by a dev-time assertion to prove the course (and
 * any decor passed in) is overlap-free. Exported so callers can validate their
 * own AABB sets too.
 */
export function validateNoOverlaps(list: readonly F3Plat[]): Array<[number, number]> {
    const conflicts: Array<[number, number]> = [];
    for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
            if (platsClash(list[i], list[j])) conflicts.push([list[i].id, list[j].id]);
    return conflicts;
}

// ── Generation ────────────────────────────────────────────────────────────────
function makeNext(prev: F3Plat): F3Plat {
    const half = pick(HALF_SET);
    let cz = prev.cz + rand(GAP_MIN, GAP_MAX) + half;   // ensure an edge gap
    let topY: number;
    const r = rng();
    if (r < REST_CHANCE)        topY = prev.topY;                       // breather
    else if (r < REST_CHANCE + DROP_CHANCE) topY = Math.max(0.2, prev.topY - rand(RISE_MIN, RISE_MAX));
    else                        topY = prev.topY + rand(RISE_MIN, RISE_MAX);

    let bx = THREE_clamp(prev.bx + rand(-DX_MAX, DX_MAX), -X_LIMIT + half, X_LIMIT - half);

    const moving = rng() < MOVE_CHANCE && Math.abs(bx) < 6;
    // Bound amplitude so the swept bridge stays inside the corridor.
    const amp = moving ? Math.min(2.4, X_LIMIT - half - Math.abs(bx)) : 0;

    const cand: F3Plat = {
        id: ++_nextId, bx, cz, hw: half, hd: half, h: 0.5, topY,
        moving, amp, phase: rng() * Math.PI * 2,
        x: bx, palette: _nextId % CARTOON_PALETTE_COUNT,
    };

    // ── Anti-overlap: nudge forward / shrink amp until the candidate clashes
    //    with nothing currently live. Guarantees the user's "no overlaps". ──
    let guard = 0;
    while (platforms.some((p) => platsClash(p, cand)) && guard++ < 24) {
        cand.cz += 0.6;                       // push it further down the course
        if (cand.amp > 0) cand.amp = Math.max(0, cand.amp - 0.4);
        cand.bx = THREE_clamp(cand.bx, -X_LIMIT + cand.hw, X_LIMIT - cand.hw);
        cand.x = cand.bx;
    }
    return cand;
}

function THREE_clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

// Number of distinct cartoon colors (kept in sync with Floor3 palette).
export const CARTOON_PALETTE_COUNT = 6;

// ── Public lifecycle ──────────────────────────────────────────────────────────
/** (Re)build the course from scratch. Call on Floor 3 mount. */
export function reset(seed = 0x9e3779b9): void {
    _seed = seed | 0;
    _nextId = 0;
    _lastTickT = -1;
    platforms.length = 0;
    platforms.push({ ...START, x: START.bx });
    while (platforms.length < POOL) platforms.push(makeNext(platforms[platforms.length - 1]));

    if (import.meta.env?.DEV) {
        const c = validateNoOverlaps(platforms);
        if (c.length) console.warn('[f3Parkour] overlap after reset:', c);
    }
}

/**
 * Per-frame update. Animates moving platforms and recycles the pool so it
 * always extends ahead of the player. Idempotent within a single frame (guarded
 * by the clock value) so it's safe to call from more than one useFrame.
 */
export function tick(t: number, playerZ: number): void {
    if (t === _lastTickT) return;
    _lastTickT = t;

    // Recycle: drop platforms well behind the player, append fresh ones ahead.
    // Never recycle below POOL count, and keep at least the platform the player
    // is currently standing near.
    while (platforms.length > 0 && platforms[0].cz < playerZ - BEHIND && platforms.length >= POOL) {
        platforms.shift();
        platforms.push(makeNext(platforms[platforms.length - 1]));
    }

    // Animate live X for moving bridges.
    for (const p of platforms) {
        p.x = p.moving ? p.bx + Math.sin(t * MOVE_SPEED + p.phase) * p.amp : p.bx;
    }
}

/**
 * The live platform whose center Z is nearest to `z` — i.e. the one a character
 * at depth `z` is standing on. Returns its live X (moving bridges included) and
 * top surface. Used by the rival to resolve the ground UNDER it (its own Z), so
 * its height never chases a platform far ahead while it's stunned/lagging.
 */
export function nearestPlatform(z: number): { x: number; topY: number } {
    let best: F3Plat | null = null;
    let bd = Infinity;
    for (const p of platforms) {
        const d = Math.abs(p.cz - z);
        if (d < bd) { bd = d; best = p; }
    }
    return best ? { x: best.x, topY: best.topY } : { x: 0, topY: 0 };
}

/**
 * Where to drop the player after a void fall: the top of the furthest-back live
 * platform that's still at/behind them, so they resume near where they were
 * rather than restarting the whole climb.
 */
export function respawnPoint(playerZ: number): { x: number; y: number; z: number } {
    let best = platforms[0];
    for (const p of platforms) {
        if (p.cz <= playerZ + 1 && (!best || p.cz > best.cz)) best = p;
    }
    if (!best) best = platforms[0];
    return { x: best.x, y: best.topY + 0.05, z: best.cz };
}
