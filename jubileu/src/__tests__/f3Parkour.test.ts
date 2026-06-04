import { describe, it, expect, beforeEach } from 'vitest';
import { reset, platforms, nearestPlatform, respawnPoint } from '../f3Parkour';

describe('f3Parkour — nearestPlatform (rival ground resolution)', () => {
    beforeEach(() => reset());

    it('returns the platform whose center Z is nearest the query', () => {
        for (const probe of [-5, 0, 4, 9, 14, 20]) {
            let best = platforms[0];
            for (const p of platforms) if (Math.abs(p.cz - probe) < Math.abs(best.cz - probe)) best = p;
            const got = nearestPlatform(probe);
            expect(got.topY).toBe(best.topY);
            expect(got.x).toBe(best.x);
        }
    });

    it('resolves a queried platform to ITS OWN height (the anti-float guarantee)', () => {
        // The dizzy "float" bug came from resolving the rival's resting height
        // from a far-ahead target Z instead of its actual Z. Querying any
        // platform's own center must return that platform's surface — so when the
        // rival asks nearestPlatform(its own Z) it gets the ground underfoot, not
        // a platform far up the climb.
        for (let i = 0; i < platforms.length; i += 3) {
            const p = platforms[i];
            expect(nearestPlatform(p.cz).topY).toBe(p.topY);
        }
    });

    it('a far-ahead Z and the rival\'s actual Z map to DIFFERENT heights mid-climb', () => {
        // (so using one in place of the other visibly lifts/sinks the character)
        const backZ = platforms[1].cz;                       // just ahead of the start
        const aheadZ = platforms[platforms.length - 1].cz;   // top of the live pool
        // The climb rises overall, so the far-ahead platform sits higher.
        expect(nearestPlatform(aheadZ).topY).toBeGreaterThan(nearestPlatform(backZ).topY);
    });

    it('falls back to origin when the pool is empty', () => {
        platforms.length = 0;
        expect(nearestPlatform(3)).toEqual({ x: 0, topY: 0 });
        reset();
    });

    it('respawnPoint still lands on a real platform at/behind the player', () => {
        const r = respawnPoint(8);
        expect(Number.isFinite(r.x)).toBe(true);
        expect(r.z).toBeLessThanOrEqual(8 + 1);
    });
});
