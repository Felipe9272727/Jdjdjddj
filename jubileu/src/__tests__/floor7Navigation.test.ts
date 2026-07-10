import { describe, expect, it } from 'vitest';
import { FLOOR7_SCALE, FLOOR7_SPAWN, wallsForState } from '../constants';
import { COLLISION_RADIUS, resolveCollision } from '../physics';

const S = FLOOR7_SCALE;
const walls = wallsForState(7, false, false);

const expectClear = (x: number, z: number) => {
    const [rx, rz] = resolveCollision(x, z, COLLISION_RADIUS, walls);
    expect(rx).toBeCloseTo(x, 4);
    expect(rz).toBeCloseTo(z, 4);
};

describe('Floor 7 navigation corridor', () => {
    it('spawns outside every collider', () => {
        expectClear(FLOOR7_SPAWN[0], FLOOR7_SPAWN[2]);
    });

    it('keeps a walkable starboard lane from spawn to bucket and aft deck', () => {
        // Samples the route the player naturally follows: around the foremast,
        // past the capstan, to the bucket and toward the companionway.
        for (const [lx, lz] of [
            [0.75, 4.3], [0.9, 3.5], [1.0, 2.7], [1.1, 1.5],
            [1.2, 0.2], [1.35, -1.8], [1.15, -2.5], [0.95, -3.1],
        ]) expectClear(lx * S, lz * S);
    });

    it('keeps the returned elevator doorway reachable', () => {
        for (const [lx, lz] of [[0.75, 4.3], [0.55, 4.7], [0.3, 5.0], [0, 5.2]]) {
            expectClear(lx * S, lz * S);
        }
    });
});
