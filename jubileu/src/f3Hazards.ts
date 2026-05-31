/**
 * f3Hazards.ts — the Floor 3 sabotage loop: the Diabrete inks obstacles onto
 * the climb, drops paintbrushes the player can steal, gets dizzy when robbed,
 * and finally plunges into the void once the player has nicked three brushes.
 *
 * Like f3Parkour, this is a module of SHARED MUTABLE STATE so the renderer
 * (Floor3Hazards.tsx — draws spikes + brushes), the physics (Player.tsx — jump
 * counting, spike knockback, brush pickup) and the rival (Floor3Rival.tsx —
 * draw flourish, dizzy daze, the final fall) all read/write the same records
 * without prop-drilling. App registers an `onWin` to bounce the player back to
 * the elevator when the devil falls.
 *
 * The cadence the user asked for:
 *   • every 10 player jumps  → the devil DRAWS a new obstacle (never just a
 *     plain platform — a spiked ink-strip the player must hop)
 *   • every 2 obstacles      → a paintbrush pickup appears further up
 *   • grab a brush           → the devil goes dizzy (birds tweeting)
 *   • grab the 3rd brush     → the devil falls into the abyss → back to elevator
 */

import { platforms as f3Platforms, type F3Plat } from './f3Parkour';

// ── Records ───────────────────────────────────────────────────────────────────
export interface Hazard {
    id: number;
    platId: number;    // the platform this spike-strip is inked onto (live lookup)
    reveal: number;    // 0→1 ink-in progress (drawing); collidable past ~0.6
    spikes: number;    // how many spikes across
    hit: boolean;      // already knocked the player back (one-shot per pass)
}
export interface Brush {
    id: number;
    platId: number;    // platform it hovers over
    bob: number;       // bob phase
    collected: boolean;
    fade: number;      // 1→0 collect pop-out
}

export const hazards: Hazard[] = [];
export const brushes: Brush[] = [];

// ── Progress / event state (read by the rival + HUD) ──────────────────────────
export const f3Progress = {
    jumps: 0,
    obstacles: 0,
    brushes: 0,         // collected (win at 3)
    dizzyUntil: 0,      // performance.now() ms — devil dazed while now < this
    drawFlashAt: 0,     // ms of the last obstacle draw (rival does a flourish)
    fell: false,        // devil has begun its plunge
    fellAt: 0,          // ms the fall started
    needed: 3,
};

let _nextId = 1;
let _onWin: (() => void) | null = null;
let _onProgress: (() => void) | null = null;   // nudges React HUD to re-render

/** App wires this so the win (devil fell) returns the player to the elevator. */
export function setOnWin(cb: (() => void) | null): void { _onWin = cb; }
/** App wires this to re-render the brush HUD when the count changes. */
export function setOnProgress(cb: (() => void) | null): void { _onProgress = cb; }

export function resetHazards(): void {
    hazards.length = 0;
    brushes.length = 0;
    f3Progress.jumps = 0;
    f3Progress.obstacles = 0;
    f3Progress.brushes = 0;
    f3Progress.dizzyUntil = 0;
    f3Progress.drawFlashAt = 0;
    f3Progress.fell = false;
    f3Progress.fellAt = 0;
    _nextId = 1;
}

// ── Spawning ──────────────────────────────────────────────────────────────────
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Pick a static platform a few steps AHEAD of zRef that isn't already used. */
function pickAhead(zRef: number, minAhead: number, used: Set<number>): F3Plat | null {
    let best: F3Plat | null = null;
    for (const p of f3Platforms) {
        if (p.palette < 0) continue;             // skip the elevator landing
        if (p.cz < zRef + minAhead) continue;
        if (used.has(p.id)) continue;
        if (!best || p.cz < best.cz) best = p;   // nearest one past the threshold
    }
    return best;
}

/** Ink a spiked obstacle onto a platform ahead of the player. */
function spawnObstacle(playerZ: number): void {
    const used = new Set<number>([...hazards.map(h => h.platId), ...brushes.map(b => b.platId)]);
    const plat = pickAhead(playerZ, 7, used);
    if (!plat) return;
    hazards.push({ id: _nextId++, platId: plat.id, reveal: 0, spikes: 5, hit: false });
    f3Progress.obstacles += 1;
    f3Progress.drawFlashAt = now();             // rival does a "drawing" flourish
    // Every 2 obstacles, drop a paintbrush still further up.
    if (f3Progress.obstacles % 2 === 0) spawnBrush(playerZ);
    _onProgress?.();
}

function spawnBrush(playerZ: number): void {
    const used = new Set<number>([...hazards.map(h => h.platId), ...brushes.map(b => b.platId)]);
    const plat = pickAhead(playerZ, 11, used);
    if (!plat) return;
    brushes.push({ id: _nextId++, platId: plat.id, bob: Math.random() * Math.PI * 2, collected: false, fade: 1 });
}

/** Player.tsx calls this on every successful Floor-3 jump. */
export function registerJump(playerZ: number): void {
    if (f3Progress.fell) return;
    f3Progress.jumps += 1;
    if (f3Progress.jumps % 10 === 0) spawnObstacle(playerZ);
}

// ── Per-frame tick (renderer owns it) ─────────────────────────────────────────
export function tickHazards(dt: number): void {
    for (const h of hazards) if (h.reveal < 1) h.reveal = Math.min(1, h.reveal + dt / 0.9);
    for (const b of brushes) {
        b.bob += dt;
        if (b.collected && b.fade > 0) b.fade = Math.max(0, b.fade - dt / 0.4);
    }
    // Cull collected+faded brushes and hazards whose platform recycled away.
    for (let i = brushes.length - 1; i >= 0; i--)
        if (brushes[i].collected && brushes[i].fade <= 0) brushes.splice(i, 1);
    const live = new Set(f3Platforms.map(p => p.id));
    for (let i = hazards.length - 1; i >= 0; i--)
        if (!live.has(hazards[i].platId)) hazards.splice(i, 1);
}

/** Live world transform of a hazard's spike-strip (front half of its platform). */
export function hazardBox(h: Hazard): { x: number; z0: number; z1: number; hw: number; topY: number } | null {
    const p = f3Platforms.find(pp => pp.id === h.platId);
    if (!p) return null;
    return { x: p.x, z0: p.cz - p.hd * 0.15, z1: p.cz + p.hd, hw: p.hw * 0.92, topY: p.topY };
}

/** Live world position of a brush pickup (hovering over its platform). */
export function brushPos(b: Brush): { x: number; y: number; z: number } | null {
    const p = f3Platforms.find(pp => pp.id === b.platId);
    if (!p) return null;
    return { x: p.x, y: p.topY + 1.25 + Math.sin(b.bob * 2) * 0.12, z: p.cz };
}

// ── Player interactions ───────────────────────────────────────────────────────
/**
 * Knockback test. If the player is crossing a fully-drawn spike-strip at low
 * height (didn't jump it), returns a shove; else null. One-shot per strip until
 * the player clears it.
 */
export function hazardKnockback(px: number, py: number, pz: number):
    { z: number; vy: number } | null {
    for (const h of hazards) {
        if (h.reveal < 0.6) continue;
        const box = hazardBox(h);
        if (!box) continue;
        const inX = px >= box.x - box.hw && px <= box.x + box.hw;
        const inZ = pz >= box.z0 && pz <= box.z1;
        const low = py < box.topY + 0.45;        // feet below the spike tips → hit
        if (inX && inZ && low) {
            if (h.hit) return null;              // already bounced on this pass
            h.hit = true;
            return { z: box.z0 - 0.5, vy: 4.2 }; // shove back to the strip's near edge + bounce
        }
        // Reset the one-shot once the player has retreated well behind the strip.
        if (h.hit && pz < box.z0 - 1.2) h.hit = false;
    }
    return null;
}

/** Brush pickup test. Collects the nearest in-range brush; triggers dizzy/win. */
export function tryCollectBrush(px: number, py: number, pz: number): boolean {
    for (const b of brushes) {
        if (b.collected) continue;
        const wp = brushPos(b);
        if (!wp) continue;
        const dx = px - wp.x, dy = py + 0.9 - wp.y, dz = pz - wp.z;
        if (dx * dx + dy * dy + dz * dz < 1.3 * 1.3) {
            b.collected = true;
            f3Progress.brushes += 1;
            f3Progress.dizzyUntil = now() + 3000;     // devil dazed ~3s
            if (f3Progress.brushes >= f3Progress.needed && !f3Progress.fell) {
                f3Progress.fell = true;
                f3Progress.fellAt = now();
            }
            _onProgress?.();
            return true;
        }
    }
    return false;
}

/** The rival calls this once after its fall animation finishes. */
export function fireWin(): void { const cb = _onWin; _onWin = null; cb?.(); }

export function isDizzy(): boolean { return now() < f3Progress.dizzyUntil && !f3Progress.fell; }
