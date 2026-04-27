// Shared physics helpers used by Player and Bot.

export const COLLISION_RADIUS = 0.5;

/**
 * Push a circle of radius `r` at (cx, cz) out of any wall segments it overlaps.
 * Walls are encoded as flat 4-tuples [ax, az, bx, bz] for the segment endpoints.
 * Iterates 3 passes so a corner doesn't trap the agent on a single edge.
 *
 * Same algorithm Player.tsx uses; extracted so the Bot can run identical
 * collision against the lobby walls without duplicating the function.
 */
export const resolveCollision = (cx: number, cz: number, r: number, walls: number[][]): [number, number] => {
    let x = cx, z = cz;
    for (let i = 0; i < 3; i++) {
        for (const w of walls) {
            const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz;
            if (l2 < 1e-4) continue;
            const t = Math.max(0, Math.min(1, ((x - w[0]) * dx + (z - w[1]) * dz) / l2));
            const px = w[0] + t * dx, pz = w[1] + t * dz, sx = x - px, sz = z - pz;
            const d = Math.sqrt(sx * sx + sz * sz);
            if (d < r && d > 1e-4) {
                const o = r - d;
                x += (sx / d) * o;
                z += (sz / d) * o;
            }
        }
    }
    return [x, z];
};
