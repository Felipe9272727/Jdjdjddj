import { describe, it, expect } from 'vitest';
import { createFloor2Run, collectFloor2Shard, catchFloor2Player } from '../Floor2/run';

describe('Floor 2 terminal arbitration', () => {
    it('fifth fragment protects the winner against a same-frame catch', () => {
        const run = createFloor2Run();
        for (let i = 0; i < 5; i++) expect(collectFloor2Shard(run, i)).toBe(true);
        expect(catchFloor2Player(run)).toBe(false);
        expect(run.phase).toBe('winning');
    });
    it('a catch already in progress prevents late fragments from starting the lift', () => {
        const run = createFloor2Run();
        for (let i = 0; i < 4; i++) collectFloor2Shard(run, i);
        expect(catchFloor2Player(run)).toBe(true);
        expect(catchFloor2Player(run)).toBe(false);
        expect(collectFloor2Shard(run, 4)).toBe(false);
        expect(run.collected.size).toBe(4);
    });
    it('pause blocks progression; duplicate/invalid callbacks cannot win early', () => {
        const run = createFloor2Run(); run.paused = true;
        expect(collectFloor2Shard(run, 0)).toBe(false);
        expect(catchFloor2Player(run)).toBe(false);
        run.paused = false;
        for (const i of [0, 0, -1, 5, .5, NaN]) collectFloor2Shard(run, i);
        expect([...run.collected]).toEqual([0]);
        expect(run.phase).toBe('playing');
    });
    it('a new dive has its own terminal state and collectible set', () => {
        const old = createFloor2Run(); collectFloor2Shard(old, 0); catchFloor2Player(old);
        const next = createFloor2Run();
        expect(collectFloor2Shard(next, 0)).toBe(true);
        expect(next.phase).toBe('playing');
        expect(old.phase).toBe('dying');
    });
});
