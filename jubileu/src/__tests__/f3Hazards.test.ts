import { describe, it, expect, beforeEach } from 'vitest';
import { reset as resetParkour, platforms } from '../f3Parkour';
import {
    resetHazards, registerJump, hazards, brushes, f3Progress,
    hazardBox, hazardKnockback, tickHazards, isDizzy,
    f3DevilPos, f3DevilPosValid, devilStageBase,
} from '../f3Hazards';

// Drive the sabotage loop deterministically: each call advances the jump tally
// by 10 (one obstacle), passing a fixed playerZ so pickNear has platforms ahead.
function spawnNObstacles(n: number, playerZ = 0): void {
    for (let o = 0; o < n; o++) for (let j = 0; j < 10; j++) registerJump(playerZ);
}

// Array-adjacency of two platform ids in the live pool.
function areNeighbors(idA: number, idB: number): boolean {
    const ia = platforms.findIndex((p) => p.id === idA);
    const ib = platforms.findIndex((p) => p.id === idB);
    return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
}

describe('f3Hazards — Floor 3 sabotage loop', () => {
    beforeEach(() => {
        resetParkour();      // rebuild a fresh platform pool
        resetHazards();      // clear hazards/brushes/progress
    });

    describe('resetHazards', () => {
        it('restores needed to 3 even if it was mutated', () => {
            f3Progress.needed = 1;
            resetHazards();
            expect(f3Progress.needed).toBe(3);
        });

        it('clears the devil position back to the sentinel + invalid', () => {
            f3DevilPos.current.set(2, 3, 4);
            f3DevilPosValid.current = true;
            resetHazards();
            expect(f3DevilPosValid.current).toBe(false);
            expect(f3DevilPos.current.z).toBe(14);
        });
    });

    describe('obstacle / brush cadence', () => {
        it('inks one obstacle every 10 jumps', () => {
            spawnNObstacles(3);
            expect(f3Progress.obstacles).toBe(3);
            expect(hazards.length).toBeGreaterThanOrEqual(1);
        });

        it('drops the FIRST brush already on obstacle #1 (teaches the steal)', () => {
            spawnNObstacles(1);
            expect(f3Progress.obstacles).toBe(1);
            expect(brushes.length).toBe(1);
        });

        it('never places a brush on a platform adjacent to a spike (and vice-versa)', () => {
            spawnNObstacles(5);
            for (const h of hazards)
                for (const b of brushes)
                    expect(areNeighbors(h.platId, b.platId)).toBe(false);
        });
    });

    describe('dizzy suppresses sabotage', () => {
        it('does not count jumps while the devil is dazed', () => {
            f3Progress.dizzyUntil = Date.now() + 5000;   // force a daze window
            expect(isDizzy()).toBe(true);
            const before = f3Progress.jumps;
            for (let j = 0; j < 30; j++) registerJump(0);
            expect(f3Progress.jumps).toBe(before);       // tally paused
            expect(hazards.length).toBe(0);              // nothing inked itself
        });
    });

    describe('spike knockback fairness', () => {
        it('only bites a fully-inked strip, shoves clear of the near edge, and is one-shot', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            const box = hazardBox(h)!;
            const insideX = box.x;
            const insideZ = (box.z0 + box.z1) / 2;
            const lowY = box.topY;                       // feet at deck level → below the tips

            // Half-inked strip must NOT hit yet (telegraph window).
            h.reveal = 0.5;
            expect(hazardKnockback(insideX, lowY, insideZ)).toBeNull();

            // Fully inked → it shoves, and clears the player BEHIND the near edge.
            h.reveal = 1;
            const kb = hazardKnockback(insideX, lowY, insideZ);
            expect(kb).not.toBeNull();
            expect(kb!.z).toBeCloseTo(box.z0 - 1.3, 5);
            expect(kb!.vy).toBeGreaterThan(0);

            // One-shot: a second hit on the same pass (still overlapping) is null.
            expect(hazardKnockback(insideX, lowY, insideZ)).toBeNull();
        });

        it('lets the player pass a strip cleanly when hopping over it (high feet)', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            h.reveal = 1;
            const box = hazardBox(h)!;
            const highY = box.topY + 1.0;                // jumped above the spikes
            expect(hazardKnockback(box.x, highY, (box.z0 + box.z1) / 2)).toBeNull();
        });
    });

    describe('devilStageBase fallback', () => {
        it('stages ahead of the player on a real platform (never the sentinel)', () => {
            const s = devilStageBase();
            expect(s.z).toBeGreaterThan(0);              // ahead of playerZ=0
            expect(Number.isFinite(s.x)).toBe(true);
            expect(Number.isFinite(s.y)).toBe(true);
        });
    });
});

// Keep tickHazards referenced (renderer-owned per-frame tick) so a future
// refactor that drops it trips this import rather than silently dead-coding it.
describe('tickHazards', () => {
    it('advances ink reveal toward 1', () => {
        resetParkour();
        resetHazards();
        for (let j = 0; j < 10; j++) registerJump(0);
        const h = hazards[0];
        h.reveal = 0;
        tickHazards(0.5);
        expect(h.reveal).toBeGreaterThan(0);
    });
});
