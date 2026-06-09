/**
 * f4Lore.test.ts — rules of the Floor 4 lore/puzzle layer (pure module).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    f4, f4Reset, f4SetLever, f4RingBell, f4TrySafe, f4TryDoor,
    f4CollectPage, f4FinishIfLastPage, f4BoardsGone, f4PagesCollected,
    f4NearestPoint, F4_LIGHT_PATTERN, F4_SAFE_CODE, F4_BELL_RINGS, F4_POINTS,
} from '../f4Lore';

beforeEach(() => f4Reset());

describe('P1 — breaker', () => {
    it('solves only on the exact light pattern', () => {
        // scrambled start must NOT match the pattern
        expect(f4.levers).not.toEqual([...F4_LIGHT_PATTERN]);
        F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
        expect(f4.breakerSolved).toBe(true);
    });
    it('reports solved on the final flip and refuses changes after', () => {
        f4SetLever(0, 0); f4SetLever(1, 0); f4SetLever(2, 0);
        expect(f4.breakerSolved).toBe(false);
        expect(f4SetLever(3, 1)).toBe('solved');
        expect(f4SetLever(0, 1)).toBe('noop');           // panel is done
        expect(f4.levers[0]).toBe(0);
    });
});

describe('P2 — bell', () => {
    it('five consecutive rings solve it', () => {
        let r: string = '';
        for (let i = 0; i < F4_BELL_RINGS; i++) r = f4RingBell(1000 + i * 300);
        expect(r).toBe('solved');
        expect(f4.bellSolved).toBe(true);
    });
    it('a slow gap resets the count', () => {
        f4RingBell(1000); f4RingBell(1300); f4RingBell(1600); f4RingBell(1900);
        f4RingBell(10000);                                // too late — back to 1
        expect(f4.bellCount).toBe(1);
        expect(f4.bellSolved).toBe(false);
    });
    it('keeps dinging but stays inert after solving', () => {
        for (let i = 0; i < F4_BELL_RINGS; i++) f4RingBell(1000 + i * 200);
        expect(f4RingBell(99999)).toBe('dead');
    });
});

describe('P3 — safe', () => {
    it('opens only with 404', () => {
        expect(f4TrySafe('123')).toBe(false);
        expect(f4.safeSolved).toBe(false);
        expect(f4TrySafe(F4_SAFE_CODE)).toBe(true);
        expect(f4.safeSolved).toBe(true);
    });
});

describe('the back door + boards', () => {
    it('each puzzle removes one board', () => {
        expect(f4BoardsGone()).toBe(0);
        F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
        expect(f4BoardsGone()).toBe(1);
        for (let i = 0; i < F4_BELL_RINGS; i++) f4RingBell(1000 + i * 200);
        expect(f4BoardsGone()).toBe(2);
        f4TrySafe(F4_SAFE_CODE);
        expect(f4BoardsGone()).toBe(3);
    });
    it('stays boarded until all three, then "ainda não." exactly once', () => {
        expect(f4TryDoor()).toBe('boarded');
        F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
        for (let i = 0; i < F4_BELL_RINGS; i++) f4RingBell(1000 + i * 200);
        f4TrySafe(F4_SAFE_CODE);
        expect(f4TryDoor()).toBe('notyet');
        expect(f4TryDoor()).toBe('silent');
    });
});

describe('pages + finale', () => {
    it('collects each page once and finishes on page 5', () => {
        expect(f4CollectPage(0)).toBe(true);
        expect(f4CollectPage(0)).toBe(false);
        expect(f4PagesCollected()).toBe(1);
        expect(f4FinishIfLastPage(0)).toBe(false);
        f4CollectPage(4);
        expect(f4FinishIfLastPage(4)).toBe(true);
        expect(f4.finished).toBe(true);
    });
    it('page 5 only spawns after the door said "ainda não."', () => {
        const p5 = F4_POINTS.find((p) => p.id === 'page5')!;
        expect(p5.when!()).toBe(false);
        F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
        for (let i = 0; i < F4_BELL_RINGS; i++) f4RingBell(1000 + i * 200);
        f4TrySafe(F4_SAFE_CODE);
        f4TryDoor();
        expect(p5.when!()).toBe(true);
    });
});

describe('interaction points', () => {
    it('all points are reachable (right of the elevator exit zone)', () => {
        for (const p of F4_POINTS) expect(p.x).toBeGreaterThanOrEqual(-7.5);
    });
    it('nearest-point picks the closest available one', () => {
        expect(f4NearestPoint(-6.0)?.id).toBe('page1');
        f4CollectPage(0);
        expect(f4NearestPoint(-6.0)?.id ?? 'none').not.toBe('page1');
        expect(f4NearestPoint(2.3)?.id).toBe('bell');
        expect(f4NearestPoint(99)).toBeNull();
    });
    it('gated pages hide until their puzzle is solved', () => {
        expect(f4NearestPoint(-4.4)?.id).toBe('breaker');   // page2 hidden, breaker offered
        F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
        expect(f4NearestPoint(-4.4)?.id).toBe('page2');     // now the page
    });
});
