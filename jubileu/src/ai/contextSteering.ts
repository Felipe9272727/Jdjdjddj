/**
 * ai/contextSteering.ts — Context-based steering ("context maps") + predictive
 * interception, the two navigation techniques that make the Floor 2 shark read
 * as a deliberate, thinking predator instead of a homing missile.
 *
 *  • CONTEXT STEERING (Andrew Fray, "Game AI Pro 2"). Instead of summing
 *    avoidance forces — which deadlocks when two obstacles push from opposite
 *    sides and produces jittery zero-vectors — we score a ring of candidate
 *    headings into two parallel maps: INTEREST (how much we want to go that
 *    way) and DANGER (how blocked that way is). We mask out the dangerous
 *    slots and pick the best surviving interest, blended with its neighbours
 *    for a smooth heading. The shark visibly *slides along walls and threads
 *    through the arches and rock bulges* rather than bonking into them — which
 *    is exactly what the newly-collidable organic deformations demand.
 *
 *  • PREDICTIVE INTERCEPTION. A closed-form quadratic solves for the moment the
 *    shark, swimming at constant speed, will meet a player moving at constant
 *    velocity — so it aims where you're *going*, cutting the corner, instead of
 *    chasing where you *were*. Feels like it read your mind.
 *
 * Pure math over fixed-size typed arrays — zero per-frame allocation.
 */

import * as THREE from 'three';

const N = 16;                       // steering ring resolution
const SLOT_X = new Float32Array(N);
const SLOT_Z = new Float32Array(N);
for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    SLOT_X[i] = Math.sin(a);
    SLOT_Z[i] = Math.cos(a);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class ContextSteer {
    private interest = new Float32Array(N);
    private danger   = new Float32Array(N);

    /** Clear both maps — call once at the top of each steering frame. */
    reset(): void {
        this.interest.fill(0);
        this.danger.fill(0);
    }

    /** Bias the ring toward a world-space XZ goal direction (a forward lobe). */
    addInterest(dx: number, dz: number, weight = 1): void {
        const l = Math.hypot(dx, dz);
        if (l < 1e-4) return;
        const nx = dx / l, nz = dz / l;
        for (let i = 0; i < N; i++) {
            const d = SLOT_X[i] * nx + SLOT_Z[i] * nz;   // -1..1
            if (d > 0) {
                const w = d * weight;
                if (w > this.interest[i]) this.interest[i] = w;
            }
        }
    }

    /**
     * Mark headings that point at an obstacle as dangerous. `ox,oz` is the
     * vector self→obstacle, `dist` its length, `er` the obstacle's effective
     * radius (collider r + agent r), `range` the look-ahead distance.
     */
    addDanger(ox: number, oz: number, dist: number, er: number, range: number): void {
        const gap = dist - er;
        if (gap > range || dist < 1e-4) return;
        const prox = clamp01((range - gap) / range);    // 1 = touching, 0 = at range
        const nx = ox / dist, nz = oz / dist;
        for (let i = 0; i < N; i++) {
            const a = SLOT_X[i] * nx + SLOT_Z[i] * nz;
            if (a > 0) {
                const dv = prox * a;
                if (dv > this.danger[i]) this.danger[i] = dv;   // take max, never sum
            }
        }
    }

    /**
     * Pick a collision-free heading into `out` (sets x,z; leaves y untouched).
     * Masks to the lowest-danger band, then blends the surviving slots by
     * (interest − danger) for a smooth result. Returns false if fully boxed in
     * (caller should fall back to its raw goal direction).
     */
    pick(out: THREE.Vector3): boolean {
        let minDanger = Infinity;
        for (let i = 0; i < N; i++) if (this.danger[i] < minDanger) minDanger = this.danger[i];
        const thresh = minDanger + 0.05;
        let sx = 0, sz = 0, any = false;
        for (let i = 0; i < N; i++) {
            if (this.danger[i] <= thresh) {
                const w = this.interest[i] - this.danger[i];
                if (w > 0) { sx += SLOT_X[i] * w; sz += SLOT_Z[i] * w; any = true; }
            }
        }
        if (!any) {
            // Boxed in by danger with no inviting slot — head for the single
            // least-dangerous direction so we at least keep moving / escape.
            let best = 0, bestD = Infinity;
            for (let i = 0; i < N; i++) if (this.danger[i] < bestD) { bestD = this.danger[i]; best = i; }
            out.x = SLOT_X[best]; out.z = SLOT_Z[best];
            return false;
        }
        const l = Math.hypot(sx, sz) || 1;
        out.x = sx / l; out.z = sz / l;
        return true;
    }
}

/**
 * Closed-form intercept time: the moment a chaser at `sx,sy,sz` moving at
 * constant `speed` meets a target at `px,py,pz` moving at constant velocity
 * `vx,vy,vz`. Solves (V·V − s²)t² + 2(R·V)t + (R·R) = 0 with R = P − S.
 * Returns the smallest positive root, or −1 when no real intercept exists
 * (caller should fall back to pure pursuit).
 */
export function interceptTime(
    sx: number, sy: number, sz: number,
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    speed: number,
): number {
    const rx = px - sx, ry = py - sy, rz = pz - sz;
    const a = vx * vx + vy * vy + vz * vz - speed * speed;
    const b = 2 * (rx * vx + ry * vy + rz * vz);
    const c = rx * rx + ry * ry + rz * rz;
    if (Math.abs(a) < 1e-3) {
        if (Math.abs(b) < 1e-6) return -1;
        const t = -c / b;
        return t > 0 ? t : -1;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const t1 = (-b + sq) / (2 * a);
    const t2 = (-b - sq) / (2 * a);
    // Smallest strictly-positive root.
    let t = -1;
    if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
    else if (t1 > 0) t = t1;
    else if (t2 > 0) t = t2;
    return t;
}

// Shared singleton — one shark, reused every frame, no allocation.
export const sharkSteer = new ContextSteer();
