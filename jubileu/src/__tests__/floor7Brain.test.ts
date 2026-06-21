import { describe, it, expect } from 'vitest';
import { Floor7Brain, F7_STATE, type F7Puddle } from '../Floor7Brain';

const step = (b: Floor7Brain, secs: number, px: number, pz: number, interact: boolean) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) b.tick(1 / 60, px, 0, pz, interact);
};

// puddles erode directionally now, so you must SWEEP the brush across the whole
// disc (not just stand on the centre) to clean it.
const mopPuddle = (b: Floor7Brain, p: F7Puddle) => {
    const o = p.r * 0.6;
    for (const dz of [-o, 0, o]) for (const dx of [-o, 0, o]) step(b, 0.8, p.x + dx, p.z + dz, true);
};

describe('Floor7Brain — the WASM (C + assembly) pirate-ship brain', () => {
    it('instantiates and starts in INTRO with the elevator present', () => {
        const b = new Floor7Brain();
        expect(b.state()).toBe(F7_STATE.INTRO);
        expect(b.elevFade()).toBeGreaterThan(0.9);
        expect(b.npud).toBe(6);
    });

    it('the asm-driven sea motion actually moves the ship', () => {
        const b = new Floor7Brain();
        const h0 = b.heave();
        step(b, 1.0, 0, 5, false);
        // heave should have changed (and stay bounded)
        expect(Math.abs(b.heave() - h0)).toBeGreaterThan(0.01);
        expect(Math.abs(b.heave())).toBeLessThan(0.4);
    });

    it('INTRO ends with the elevator vanished and captain at the talk spot', () => {
        const b = new Floor7Brain();
        step(b, 4.2, 0, 5, false);
        expect(b.state()).toBe(F7_STATE.GREET);
        expect(b.elevFade()).toBeLessThan(0.05);
        expect(b.captain().z).toBeGreaterThan(1.5); // walked over from the bow
    });

    it('plays the whole quest: greet -> fetch bucket -> mop puddles -> DONE', () => {
        const b = new Floor7Brain();
        step(b, 4.2, 0, 5, false);
        expect(b.state()).toBe(F7_STATE.GREET);
        // acknowledge the captain (rising edge)
        b.tick(1 / 60, 0, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, true);
        expect(b.state()).toBe(F7_STATE.FETCH);
        // go to the bucket and grab it
        const buc = b.bucket();
        b.tick(1 / 60, buc.x, 0, buc.z, false);
        b.tick(1 / 60, buc.x, 0, buc.z, true);
        expect(b.state()).toBe(F7_STATE.CLEAN);
        expect(b.bucket().held).toBe(true);
        // mop every puddle
        const p: F7Puddle = { x: 0, z: 0, r: 0, prog: 0, cell: new Float32Array(16) };
        for (let i = 0; i < b.npud; i++) {
            b.puddle(i, p);
            mopPuddle(b, p);
        }
        expect(b.cleaned()).toBe(b.npud);
        expect(b.cleanPct()).toBeCloseTo(1, 2);
        expect(b.state()).toBe(F7_STATE.DONE);
    });

    it('you can NEVER leave (partial level)', () => {
        const b = new Floor7Brain();
        expect(b.canLeave()).toBe(false);
        step(b, 4.2, 0, 5, false);
        expect(b.canLeave()).toBe(false);
        // even after finishing everything (each action needs a false->true edge)
        b.tick(1 / 60, 0, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, true);
        const buc = b.bucket();
        b.tick(1 / 60, buc.x, 0, buc.z, false);
        b.tick(1 / 60, buc.x, 0, buc.z, true);
        const p: F7Puddle = { x: 0, z: 0, r: 0, prog: 0, cell: new Float32Array(16) };
        for (let i = 0; i < b.npud; i++) { b.puddle(i, p); mopPuddle(b, p); }
        expect(b.state()).toBe(F7_STATE.DONE);
        expect(b.canLeave()).toBe(false);
    });

    it('puddles sit on the deck within sane bounds', () => {
        const b = new Floor7Brain();
        const p: F7Puddle = { x: 0, z: 0, r: 0, prog: 0 };
        for (let i = 0; i < b.npud; i++) {
            b.puddle(i, p);
            expect(Math.abs(p.x)).toBeLessThan(3.2);
            expect(Math.abs(p.z)).toBeLessThan(6.5);
            expect(p.r).toBeGreaterThan(0.4);
            expect(p.prog).toBe(0);
        }
    });
});
