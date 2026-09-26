/** Synchronous arbitration: the fifth pickup and a catch can arrive in one frame. */
export type Floor2Run = {
    phase: 'playing' | 'winning' | 'dying';
    collected: Set<number>;
    paused: boolean;
};
export const FLOOR2_SHARDS = 5;
export const FLOOR2_ENRAGE_AT = 3;
export const createFloor2Run = (): Floor2Run => ({ phase: 'playing', collected: new Set(), paused: false });

export function collectFloor2Shard(run: Floor2Run, index: number): boolean {
    if (run.paused || run.phase !== 'playing' || !Number.isInteger(index)
        || index < 0 || index >= FLOOR2_SHARDS || run.collected.has(index)) return false;
    run.collected = new Set(run.collected).add(index);
    if (run.collected.size === FLOOR2_SHARDS) run.phase = 'winning';
    return true;
}

export function catchFloor2Player(run: Floor2Run): boolean {
    if (run.paused || run.phase !== 'playing') return false;
    run.phase = 'dying';
    return true;
}
