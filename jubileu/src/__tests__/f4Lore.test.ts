/**
 * f4Lore.test.ts — rules of the Floor 4 lore/puzzle layer (pure module).
 * Covers the full arc: runner → generator → bell → skeleton/slip → safe/key
 * → door → keeper dialogue → page 5 finale.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    f4, f4Reset, f4SetLever, f4RingBell, f4TrySafe, f4UseDoor,
    f4CollectPage, f4FinishIfLastPage, f4PagesCollected,
    f4NearestPoint, f4Objective, f4Bounds, f4GoRoom,
    f4TriggerRunner, f4RunnerDone, f4SkeletonRisen, f4TakeCode,
    f4MeetKeeper, f4AskKeeper,
    F4_LIGHT_PATTERN, F4_SAFE_CODE, F4_BELL_RINGS, F4_POINTS, F4_KEEPER_DIALOG,
} from '../f4Lore';

beforeEach(() => f4Reset());

const solveGenerator = () => F4_LIGHT_PATTERN.forEach((p, i) => f4SetLever(i, p));
const solveBell = () => { for (let i = 0; i < F4_BELL_RINGS; i++) f4RingBell(1000 + i * 200); };

describe('the Zelador (scripted runner)', () => {
    it('triggers once, then stays seen', () => {
        expect(f4TriggerRunner()).toBe(true);
        expect(f4.runnerActive).toBe(true);
        expect(f4TriggerRunner()).toBe(false);             // already playing
        f4RunnerDone();
        expect(f4.runnerSeen).toBe(true);
        expect(f4TriggerRunner()).toBe(false);             // never again
    });
    it('only triggers in the lobby', () => {
        f4GoRoom('basement', 0);
        expect(f4TriggerRunner()).toBe(false);
    });
});

describe('rooms', () => {
    it('transitions set spawn + token for the player to consume', () => {
        const tok = f4.spawnToken;
        f4GoRoom('basement', -3.2);
        expect(f4.room).toBe('basement');
        expect(f4.spawnX).toBe(-3.2);
        expect(f4.spawnToken).toBe(tok + 1);
    });
    it('each room has its own bounds', () => {
        const lobby = f4Bounds();
        f4GoRoom('basement', 0);
        const basement = f4Bounds();
        expect(basement.right).toBeLessThan(lobby.right);
    });
});

describe('P1 — the generator', () => {
    it('solves only on the exact light pattern', () => {
        expect(f4.levers).not.toEqual([...F4_LIGHT_PATTERN]);
        solveGenerator();
        expect(f4.powerOn).toBe(true);
    });
    it('reports solved on the final flip and refuses changes after', () => {
        f4SetLever(0, 0); f4SetLever(1, 0); f4SetLever(2, 0);
        expect(f4.powerOn).toBe(false);
        expect(f4SetLever(3, 1)).toBe('solved');
        expect(f4SetLever(0, 1)).toBe('noop');             // panel is done
        expect(f4.levers[0]).toBe(0);
    });
});

describe('P2 — the bell + the guest of 404', () => {
    it('five consecutive rings solve it', () => {
        let r: string = '';
        for (let i = 0; i < F4_BELL_RINGS; i++) r = f4RingBell(1000 + i * 300);
        expect(r).toBe('solved');
        expect(f4.bellSolved).toBe(true);
    });
    it('a slow gap resets the count', () => {
        f4RingBell(1000); f4RingBell(1300); f4RingBell(1600); f4RingBell(1900);
        f4RingBell(10000);                                  // too late — back to 1
        expect(f4.bellCount).toBe(1);
        expect(f4.bellSolved).toBe(false);
    });
    it('keeps dinging but stays inert after solving', () => {
        solveBell();
        expect(f4RingBell(99999)).toBe('dead');
    });
    it('the guest only rises after the bell, then offers the slip once', () => {
        f4SkeletonRisen();                                  // too early — ignored
        expect(f4.skeletonRisen).toBe(false);
        expect(f4TakeCode()).toBe(false);
        solveBell();
        f4SkeletonRisen();
        expect(f4.skeletonRisen).toBe(true);
        expect(f4TakeCode()).toBe(true);
        expect(f4TakeCode()).toBe(false);                   // only one slip
    });
});

describe('P3 — the safe (master key)', () => {
    it('opens only with 404', () => {
        expect(f4TrySafe('123')).toBe(false);
        expect(f4.safeSolved).toBe(false);
        expect(f4TrySafe(F4_SAFE_CODE)).toBe(true);
        expect(f4.safeSolved).toBe(true);
    });
});

describe('the exit door', () => {
    it('locked until the key, unlocks once, then enters', () => {
        expect(f4UseDoor()).toBe('locked');
        f4TrySafe(F4_SAFE_CODE);
        expect(f4UseDoor()).toBe('unlock');
        expect(f4.doorUnlocked).toBe(true);
        expect(f4UseDoor()).toBe('enter');
    });
});

describe('the first receptionist', () => {
    it('answers questions and marks them asked', () => {
        f4MeetKeeper();
        expect(f4.metKeeper).toBe(true);
        const d = f4AskKeeper('who');
        expect(d?.a).toContain('recepcionista');
        expect(f4.asked.who).toBe(true);
    });
    it('exactly one question is final (hands page 5)', () => {
        expect(F4_KEEPER_DIALOG.filter((d) => d.final).length).toBe(1);
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
});

describe('interaction points', () => {
    it('lobby points are reachable (right of the elevator exit zone)', () => {
        for (const p of F4_POINTS.filter((q) => q.room === 'lobby')) {
            expect(p.x).toBeGreaterThanOrEqual(-7.5);
        }
    });
    it('nearest-point respects the current room', () => {
        expect(f4NearestPoint(-6.0)?.id).toBe('page1');
        f4GoRoom('basement', 0);
        expect(f4NearestPoint(-6.0)?.id ?? 'none').not.toBe('page1');
        expect(f4NearestPoint(5.2)?.id).toBe('generator');
        expect(f4NearestPoint(99)).toBeNull();
    });
    it('the bell hides until the power is on', () => {
        expect(f4NearestPoint(2.3)?.id ?? 'none').not.toBe('bell');
        solveGenerator();
        expect(f4NearestPoint(2.3)?.id).toBe('bell');
    });
    it('the door cycles EMPURRAR → DESTRANCAR → ENTRAR', () => {
        f4TriggerRunner(); f4RunnerDone();
        expect(f4NearestPoint(11.5)?.label).toBe('EMPURRAR');
        f4TrySafe(F4_SAFE_CODE);
        expect(f4NearestPoint(11.5)?.label).toBe('DESTRANCAR');
        f4UseDoor();
        expect(f4NearestPoint(11.5)?.label).toBe('ENTRAR');
    });
});

describe('objective line (no creator-only steps)', () => {
    it('walks the whole chain', () => {
        expect(f4Objective()).toContain('Saia do elevador');
        f4TriggerRunner();
        expect(f4Objective()).toBeNull();                   // cinematic
        f4RunnerDone();
        expect(f4Objective()).toContain('DESÇA');
        f4GoRoom('basement', -3.2);
        expect(f4Objective()).toContain('GERADOR');
        solveGenerator();
        expect(f4Objective()).toContain('SUBA');
        f4GoRoom('lobby', 6.2);
        expect(f4Objective()).toContain('sino');
        solveBell();
        f4SkeletonRisen();
        expect(f4Objective()).toContain('PEGUE');
        f4TakeCode();
        expect(f4Objective()).toContain('404');
        f4TrySafe(F4_SAFE_CODE);
        expect(f4Objective()).toContain('Destranque');
        f4UseDoor();
        expect(f4Objective()).toContain('ENTRE');
        f4GoRoom('beyond', 0.2);
        expect(f4Objective()).toContain('luz fraca');
        f4MeetKeeper();
        expect(f4Objective()).toContain('Pergunte');
        f4CollectPage(4);
        f4FinishIfLastPage(4);
        expect(f4Objective()).toContain('elevador');
    });
});
