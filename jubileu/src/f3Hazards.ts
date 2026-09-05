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

import { platforms as f3Platforms, f3PlayerZ, type F3Plat } from './f3Parkour';
import * as THREE from 'three';

// Live world position of the Diabrete (feet), written every frame by
// Floor3Rival. The fall-cutscene camera in App reads this (via the dialogue
// camera lock) so the shot tracks the devil as he topples into the void.
export const f3DevilPos = { current: new THREE.Vector3(0, 0, 14) };
// True once Floor3Rival has published a REAL devil position (set the frame the
// devil falls, cleared on reset). The fall cutscene checks this so it never
// stages on the (0,0,14) sentinel if it mounts a frame before the rival writes.
export const f3DevilPosValid = { current: false };

/** Best-guess stage spot for the fall cutscene when the rival hasn't published
 *  a real position yet (race guard). Puts the devil his usual lead ahead of the
 *  player, on top of the nearest live platform so he never floats. */
export function devilStageBase(): { x: number; y: number; z: number } {
    const targetZ = f3PlayerZ.current + 12;
    let best: F3Plat | null = null;
    for (const p of f3Platforms) {
        if (!best || Math.abs(p.cz - targetZ) < Math.abs(best.cz - targetZ)) best = p;
    }
    return best ? { x: best.x, y: best.topY, z: targetZ } : { x: 0, y: 0, z: targetZ };
}

// Creator-Mode preview flag: when set (by the "Queda do Diabrete" card), Floor 3
// skips the intro and triggers the defeat fall cutscene a moment after arrival,
// so the fall can be watched on demand. App consumes (and clears) it on entry.
export const f3Demo = { fall: false };

// ── Records ───────────────────────────────────────────────────────────────────
export interface Hazard {
    id: number;
    platId: number;    // the platform this spike-strip is inked onto (live lookup)
    reveal: number;    // 0→1 ink-in progress (drawing); collidable once fully inked
    spikes: number;    // how many spikes across
    hit: boolean;      // already knocked the player back (one-shot per pass)
    hitAt: number;     // ms of the last knockback (time-based re-arm cooldown)
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
    drawFlashAt: 0,     // ms of the last obstacle draw (rival paints it)
    drawZ: 0,           // Z of the platform being painted (rival goes there)
    fell: false,        // devil has begun its plunge
    fellAt: 0,          // ms the fall started
    needed: 3,
};

let _nextId = 1;
let _onProgress: (() => void) | null = null;   // nudges React HUD to re-render

/** App wires this to re-render the brush HUD when the count changes. It also
 *  fires when the 3rd brush sets `fell`, which is the single source of truth for
 *  the win → App opens the defeat cutscene, whose outcome advances the floor. */
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
    f3Progress.needed = 3;
    f3DevilPos.current.set(0, 0, 14);
    f3DevilPosValid.current = false;
    _nextId = 1;
}

// ── Spawning ──────────────────────────────────────────────────────────────────
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Expand a set of occupied platform ids to also block their immediate
 *  array-neighbors, so a spike and a brush can never land on touching platforms
 *  (which would force the player through a hazard to reach the reward). */
function withNeighbors(ids: Set<number>): Set<number> {
    const out = new Set<number>(ids);
    for (let i = 0; i < f3Platforms.length; i++) {
        if (!ids.has(f3Platforms[i].id)) continue;
        if (i > 0) out.add(f3Platforms[i - 1].id);
        if (i < f3Platforms.length - 1) out.add(f3Platforms[i + 1].id);
    }
    return out;
}

/** Pick the platform NEAREST to targetZ (but at least minZ ahead) that's free. */
function pickNear(targetZ: number, minZ: number, used: Set<number>): F3Plat | null {
    let best: F3Plat | null = null;
    for (const p of f3Platforms) {
        if (p.palette < 0) continue;             // skip the elevator landing
        if (p.cz < minZ) continue;
        if (used.has(p.id)) continue;
        if (!best || Math.abs(p.cz - targetZ) < Math.abs(best.cz - targetZ)) best = p;
    }
    return best;
}

/** Ink a spiked obstacle onto a platform up where the Diabrete is (so he can be
 *  seen painting it), still well ahead of the player. */
function spawnObstacle(playerZ: number): void {
    // Block spike + brush platforms AND their neighbors so the two never touch.
    const used = withNeighbors(new Set<number>([...hazards.map(h => h.platId), ...brushes.map(b => b.platId)]));
    const plat = pickNear(playerZ + 12, playerZ + 5, used);
    if (!plat) return;
    hazards.push({ id: _nextId++, platId: plat.id, reveal: 0, spikes: 5, hit: false, hitAt: 0 });
    f3Progress.obstacles += 1;
    f3Progress.drawZ = plat.cz;                 // the rival runs here to paint it
    f3Progress.drawFlashAt = now();
    // Drop a paintbrush further up: the FIRST one right away (teaches the steal
    // mechanic immediately), then on every other obstacle after that.
    if (f3Progress.obstacles % 2 === 1) spawnBrush(playerZ);
    _onProgress?.();
}

function spawnBrush(playerZ: number): void {
    const used = withNeighbors(new Set<number>([...hazards.map(h => h.platId), ...brushes.map(b => b.platId)]));
    const plat = pickNear(playerZ + 16, playerZ + 9, used);
    if (!plat) return;
    brushes.push({ id: _nextId++, platId: plat.id, bob: Math.random() * Math.PI * 2, collected: false, fade: 1 });
}

/** Player.tsx calls this on every successful Floor-3 jump. */
export function registerJump(playerZ: number): void {
    if (f3Progress.fell) return;
    // While the devil is dazed he's in no state to sabotage — pause the jump
    // tally so an obstacle never "inks itself" with no one there to paint it.
    if (isDizzy()) return;
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
    // Cull collected+faded brushes and — hazards E PINCÉIS — cujo apoio já
    // reciclou. O pincel órfão não sumia: `brushPos` passava a devolver null, o
    // renderer fazia `continue` e o grupo ficava congelado no ar, na última
    // posição válida, sem plataforma embaixo e impossível de pegar.
    const live = new Set(f3Platforms.map(p => p.id));
    for (let i = brushes.length - 1; i >= 0; i--) {
        const b = brushes[i];
        if ((b.collected && b.fade <= 0) || !live.has(b.platId)) brushes.splice(i, 1);
    }
    for (let i = hazards.length - 1; i >= 0; i--)
        if (!live.has(hazards[i].platId)) hazards.splice(i, 1);
}

// ── O QUE MACHUCA TEM DE SER O QUE SE VÊ ─────────────────────────────────────
// A caixa ia de `cz − 0,15·hd` até `cz + hd`: 1,15·hd de fundura, entre 1,15 e
// 1,61 m. A tira desenhada tem 0,34 m (o traço de tinta e os espinhos são finos
// em Z), então quase 80% do que empurrava o jogador era invisível — ele levava o
// tranco parado a um metro dos espinhos. A caixa agora é a tira: mesmo centro,
// meia-fundura METADE_DA_TIRA, com uma folga pequena para os cones não ficarem
// atravessáveis pela quina.
const CENTRO_DA_TIRA = 0.425;   // fração de `hd` à frente do centro da plataforma
const METADE_DA_TIRA = 0.28;    // meia-fundura em Z (a tira desenhada tem 0,34)

/** Live world transform of a hazard's spike-strip (the drawn band, in world Z). */
export function hazardBox(h: Hazard): { x: number; z0: number; z1: number; hw: number; topY: number } | null {
    const p = f3Platforms.find(pp => pp.id === h.platId);
    if (!p) return null;
    const centro = p.cz + p.hd * CENTRO_DA_TIRA;
    return {
        x: p.x,
        z0: centro - METADE_DA_TIRA,
        z1: centro + METADE_DA_TIRA,
        hw: p.hw * 0.92,
        topY: p.topY,
    };
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
    const tNow = now();
    for (const h of hazards) {
        if (h.reveal < 0.85) continue;           // only a FULLY-inked strip bites (fair telegraph)
        const box = hazardBox(h);
        if (!box) continue;
        const inX = px >= box.x - box.hw && px <= box.x + box.hw;
        const inZ = pz >= box.z0 && pz <= box.z1;
        const low = py < box.topY + 0.45;        // feet below the spike tips → hit
        if (inX && inZ && low) {
            if (h.hit) return null;              // already bounced on this pass
            h.hit = true; h.hitAt = tNow;
            return { z: box.z0 - 1.3, vy: 4.2 }; // shove clear of the strip's near edge + bounce
        }
        // ── O TRANCO QUE SÓ ACONTECIA UMA VEZ ────────────────────────────
        // O rearme exigia `pz < box.z0 − 1.3`, ESTRITAMENTE menor — e o empurrão
        // deixa o jogador exatamente em `box.z0 − 1.3`. A condição nunca era
        // verdadeira: quem levasse um tranco atravessava aquela tira de graça
        // para sempre. Agora rearma quando ele está FORA da faixa (por qualquer
        // um dos dois lados) e o tempo de espera passou — o guard de tempo é o
        // que impede a oscilação, não a distância.
        if (h.hit && (pz < box.z0 - 0.35 || pz > box.z1 + 0.35) && tNow - h.hitAt > 500) h.hit = false;
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

export function isDizzy(): boolean { return now() < f3Progress.dizzyUntil && !f3Progress.fell; }
