// Shared physics helpers used by Player and Bot.

export const COLLISION_RADIUS = 0.5;

/**
 * Build 4 wall segments forming the AABB of a rectangle rotated around Y.
 * Used to give furniture (desks, sofas, beds) collision without authoring
 * each corner by hand. (cx, cz) is the center, w is the local-X extent, d is
 * the local-Z extent, rot is a Y-axis rotation in radians (matches the
 * rotation={[0, rot, 0]} prop the visual <group> uses).
 *
 * Y-rotation in Three.js (looking down +Y): +X swings toward -Z. The rotation
 * matrix applied to a (lx, 0, lz) point is:
 *     world.x = cos(rot)*lx + sin(rot)*lz
 *     world.z = -sin(rot)*lx + cos(rot)*lz
 */
export const boxCollider = (cx: number, cz: number, w: number, d: number, rot: number = 0): number[][] => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2, hd = d / 2;
    const local: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    const world = local.map(([lx, lz]) => [cx + c * lx + s * lz, cz - s * lx + c * lz]);
    return [
        [world[0][0], world[0][1], world[1][0], world[1][1]],
        [world[1][0], world[1][1], world[2][0], world[2][1]],
        [world[2][0], world[2][1], world[3][0], world[3][1]],
        [world[3][0], world[3][1], world[0][0], world[0][1]],
    ];
};

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
