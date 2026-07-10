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
        // DONE advances by itself into the landfall run after ~4.6s, and the
        // final sweep can spill past that — either state proves the quest done.
        expect(b.state()).toBeGreaterThanOrEqual(F7_STATE.DONE);
    });

    it('the rising tide washes back a puddle you leave half-mopped', () => {
        const b = new Floor7Brain();
        step(b, 4.2, 0, 5, false);                              // -> GREET
        b.tick(1 / 60, 0, 0, 5, false); b.tick(1 / 60, 0, 0, 5, true);   // -> FETCH
        const buc = b.bucket();
        b.tick(1 / 60, buc.x, 0, buc.z, false); b.tick(1 / 60, buc.x, 0, buc.z, true); // -> CLEAN
        const p0: F7Puddle = { x: 0, z: 0, r: 0, prog: 0, cell: new Float32Array(16) };
        b.puddle(0, p0);
        // partially mop puddle 0 (centre scrub), but do NOT finish it
        step(b, 0.6, p0.x, p0.z, true);
        b.puddle(0, p0);
        const partial = p0.prog;
        expect(partial).toBeGreaterThan(0.05);
        expect(partial).toBeLessThan(0.985);
        // now neglect it: idle far from every puddle for ~16s so swells fire
        step(b, 16.0, 3.2, 6.5, false);
        b.puddle(0, p0);
        expect(p0.prog).toBeLessThan(partial);                  // the sea washed it back
    });

    // drive a fresh brain through the whole quest to the DONE payoff
    const playToDone = (b: Floor7Brain) => {
        step(b, 4.2, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, true);
        const buc = b.bucket();
        b.tick(1 / 60, buc.x, 0, buc.z, false);
        b.tick(1 / 60, buc.x, 0, buc.z, true);
        const p: F7Puddle = { x: 0, z: 0, r: 0, prog: 0, cell: new Float32Array(16) };
        for (let i = 0; i < b.npud; i++) { b.puddle(i, p); mopPuddle(b, p); }
        expect(b.state()).toBeGreaterThanOrEqual(F7_STATE.DONE);
    };

    it('you cannot leave before the finale (mid-quest the floor holds you)', () => {
        const b = new Floor7Brain();
        expect(b.canLeave()).toBe(false);
        step(b, 4.2, 0, 5, false);
        expect(b.canLeave()).toBe(false);           // GREET
        playToDone(b);
        expect(b.canLeave()).toBe(false);           // DONE still holds you
    });

    it('DONE sails to landfall: the island approaches and the sea calms', () => {
        const b = new Floor7Brain();
        playToDone(b);
        // the captain takes the helm, then the landfall run starts
        step(b, 6.0, 0, 5, false);
        expect(b.state()).toBe(F7_STATE.SAIL);
        const lf0 = b.landfall();
        step(b, 8.0, 0, 5, false);
        expect(b.landfall()).toBeGreaterThan(lf0);  // the island is closing in
        step(b, 22.0, 0, 5, false);                 // finish the run
        expect(b.state()).toBe(F7_STATE.ANCHOR);
        expect(b.landfall()).toBe(1);
        step(b, 6.0, 0, 5, false);
        expect(b.calm()).toBeLessThan(0.5);         // harbour water, not open sea
        expect(b.canLeave()).toBe(false);           // still anchored: nobody remembered yet
    });

    it('reading the captain\'s log frees you: the elevator returns and you board', () => {
        const b = new Floor7Brain();
        playToDone(b);
        step(b, 34.0, 0, 5, false);                 // helm walk + full landfall run
        expect(b.state()).toBe(F7_STATE.ANCHOR);
        // read the log at the companionway: 4 rising edges = open, p2, p3, close
        const log = b.logPos();
        for (let i = 0; i < 4; i++) {
            b.tick(1 / 60, log.x, 0, log.z, false);
            b.tick(1 / 60, log.x, 0, log.z, true);
        }
        expect(b.logRead()).toBe(true);
        step(b, 0.2, 0, 5, false);
        expect(b.state()).toBe(F7_STATE.FREE);
        // the elevator REmaterialises
        step(b, 3.5, 0, 5, false);
        expect(b.elevFade()).toBeGreaterThan(0.95);
        expect(b.canLeave()).toBe(true);
        // walk into the cab doorway (ship-local 0,5.2) and press E — boarded
        b.tick(1 / 60, 0, 0, 5.2, false);
        expect(b.nearExit()).toBe(true);
        b.tick(1 / 60, 0, 0, 5.2, true);
        expect(b.boarded()).toBe(true);
    });

    it('the log stays shut until the player actually opens it', () => {
        const b = new Floor7Brain();
        playToDone(b);
        expect(b.logPage()).toBe(0);
        expect(b.logRead()).toBe(false);
        // a press far from the companionway does nothing
        b.tick(1 / 60, 0, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, true);
        expect(b.logPage()).toBe(0);
    });

    it('the log cannot be sequence-broken before the ship anchors', () => {
        const b = new Floor7Brain();
        step(b, 4.2, 0, 5, false); // GREET
        b.tick(1 / 60, 0, 0, 5, false);
        b.tick(1 / 60, 0, 0, 5, true); // FETCH
        const buc = b.bucket();
        b.tick(1 / 60, buc.x, 0, buc.z, false);
        b.tick(1 / 60, buc.x, 0, buc.z, true); // CLEAN

        const log = b.logPos();
        for (let i = 0; i < 5; i++) {
            b.tick(1 / 60, log.x, 0, log.z, false);
            b.tick(1 / 60, log.x, 0, log.z, true);
        }
        expect(b.state()).toBe(F7_STATE.CLEAN);
        expect(b.logPage()).toBe(0);
        expect(b.logRead()).toBe(false);
        expect(b.canLeave()).toBe(false);
    });

    it('puddles sit on the WALKABLE deck (never overhanging the bulwark)', () => {
        const b = new Floor7Brain();
        const p: F7Puddle = { x: 0, z: 0, r: 0, prog: 0 };
        for (let i = 0; i < b.npud; i++) {
            b.puddle(i, p);
            expect(Math.abs(p.x)).toBeGreaterThan(0.5);   // clear of the centre lane
            expect(Math.abs(p.x)).toBeLessThan(1.35);
            expect(Math.abs(p.z)).toBeLessThan(3.6);
            expect(Math.abs(p.x) + p.r).toBeLessThan(2.0); // disc edge stays on deck
            expect(p.r).toBeGreaterThanOrEqual(0.4);
            expect(p.r).toBeLessThanOrEqual(0.65);
            expect(p.prog).toBe(0);
        }
    });
});
