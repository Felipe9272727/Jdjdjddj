// ─── Rapier (WASM) physics core ────────────────────────────────────────────
//
// A small, deterministic wrapper around @dimforge/rapier3d-compat (a Rust
// physics engine compiled to WebAssembly). This powers the *dynamic prop*
// layer only — knockable debris/crates the player can shove around. The
// character's own movement still uses the lightweight circle-vs-line resolver
// in physics.ts (proven + unit-tested), so adding this never touches how the
// player walks.
//
// Everything here is engine-only (no Three.js, no React) so it runs headless
// under vitest. Determinism comes from a fixed 1/60 timestep + an accumulator,
// so the same inputs always produce the same body transforms — which is what
// the unit tests assert.

// Static import: the `-compat` build embeds the WASM as base64 inside the JS,
// so a static import folds the whole engine into the MAIN bundle. That matters
// here — the game ships as a single inlined index.html, and inline-build.mjs
// only inlines the main chunk (a dynamic import() would split Rapier into a
// separate chunk that 404s in the standalone file). init() still defers the
// actual WASM compile until first use, so non-physics sessions don't pay it.
import * as RAPIER_MOD from '@dimforge/rapier3d-compat';
import type RAPIER_NS from '@dimforge/rapier3d-compat';

type Rapier = typeof RAPIER_NS;

let _rapier: Rapier | null = null;
let _initPromise: Promise<Rapier> | null = null;

/** Initialise the WASM module once. Safe to call many times. */
export async function initRapier(): Promise<Rapier> {
    if (_rapier) return _rapier;
    if (!_initPromise) {
        const R = ((RAPIER_MOD as { default?: Rapier }).default ?? RAPIER_MOD) as Rapier;
        _initPromise = R.init().then(() => {
            _rapier = R;
            return R;
        }).catch((err) => {
            _initPromise = null;      // permite tentar de novo sem recarregar a página
            throw err;
        });
    }
    return _initPromise;
}

/** True once initRapier() has resolved (lets render code skip a frame safely). */
export function rapierReady(): boolean {
    return _rapier !== null;
}

export interface Vec3 { x: number; y: number; z: number; }
export interface Quat { x: number; y: number; z: number; w: number; }
export interface BodyTransform { position: Vec3; quaternion: Quat; }

export interface DynamicBoxSpec {
    /** Half-extents of the box. */
    hx: number; hy: number; hz: number;
    /** Spawn position (center). */
    x: number; y: number; z: number;
    /** Optional kg; defaults to a density-derived mass. */
    density?: number;
    /** Linear/angular damping so debris settles instead of sliding forever. */
    linDamp?: number;
    angDamp?: number;
}

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4; // clamp so a long frame can't spiral into a freeze

/**
 * A self-contained physics world: a fixed ground plane, optional static walls,
 * a set of dynamic boxes, and one kinematic capsule that mirrors the player so
 * walking into debris nudges it. Step it with a wall-clock dt; it advances in
 * fixed sub-steps internally for stable, reproducible results.
 */
export class PropsWorld {
    readonly R: Rapier;
    readonly world: InstanceType<Rapier['World']>;
    private dynamicBodies: InstanceType<Rapier['RigidBody']>[] = [];
    private capsule: InstanceType<Rapier['RigidBody']> | null = null;
    private acc = 0;

    constructor(R: Rapier, gravityY = -9.81) {
        this.R = R;
        this.world = new R.World({ x: 0, y: gravityY, z: 0 });
        this.world.timestep = FIXED_DT;
    }

    /** Infinite-ish ground at the given Y (top surface). */
    addGround(y = 0, halfExtent = 40): void {
        const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(0, y - 0.5, 0));
        this.world.createCollider(this.R.ColliderDesc.cuboid(halfExtent, 0.5, halfExtent), body);
    }

    /** A static box collider (use for furniture/walls debris should bounce off). */
    addStaticBox(x: number, y: number, z: number, hx: number, hy: number, hz: number): void {
        const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(x, y, z));
        this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz), body);
    }

    /**
     * Build static walls from the game's flat segment encoding [ax, az, bx, bz]
     * (the same lists wallsForState() produces). Each becomes a thin tall box so
     * debris can't tunnel out of the room.
     */
    addWallSegments(walls: number[][], height = 3, thickness = 0.2, baseY = 0): void {
        for (const w of walls) {
            const [ax, az, bx, bz] = w;
            const dx = bx - ax, dz = bz - az;
            const len = Math.hypot(dx, dz);
            if (len < 1e-3) continue;
            const cx = (ax + bx) / 2, cz = (az + bz) / 2;
            const angle = Math.atan2(dz, dx); // rotation about Y
            const body = this.world.createRigidBody(
                this.R.RigidBodyDesc.fixed()
                    .setTranslation(cx, baseY + height / 2, cz)
                    .setRotation(quatFromAxisY(angle)),
            );
            this.world.createCollider(this.R.ColliderDesc.cuboid(len / 2, height / 2, thickness / 2), body);
        }
    }

    /** Add a dynamic box; returns its index for reading transforms later. */
    addDynamicBox(spec: DynamicBoxSpec): number {
        const desc = this.R.RigidBodyDesc.dynamic()
            .setTranslation(spec.x, spec.y, spec.z)
            .setLinearDamping(spec.linDamp ?? 0.4)
            .setAngularDamping(spec.angDamp ?? 0.6)
            .setCcdEnabled(true); // continuous collision — small fast debris won't tunnel
        const body = this.world.createRigidBody(desc);
        const col = this.R.ColliderDesc.cuboid(spec.hx, spec.hy, spec.hz)
            .setDensity(spec.density ?? 0.6)
            .setFriction(0.8)
            .setRestitution(0.1);
        this.world.createCollider(col, body);
        this.dynamicBodies.push(body);
        return this.dynamicBodies.length - 1;
    }

    /** Create the player's kinematic capsule (position-controlled). */
    setCapsule(x: number, y: number, z: number, radius = 0.5, halfHeight = 0.6): void {
        const body = this.world.createRigidBody(
            this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + halfHeight + radius, z),
        );
        this.world.createCollider(this.R.ColliderDesc.capsule(halfHeight, radius), body);
        this.capsule = body;
        this._capsuleYOffset = halfHeight + radius;
    }
    private _capsuleYOffset = 1.1;

    /** Move the kinematic capsule to follow the player (call before step). */
    updateCapsule(x: number, y: number, z: number): void {
        if (!this.capsule) return;
        this.capsule.setNextKinematicTranslation({ x, y: y + this._capsuleYOffset, z });
    }

    /**
     * Advance the simulation by `dt` wall-clock seconds in fixed sub-steps.
     * Returns the number of sub-steps actually run (handy for tests).
     */
    step(dt: number): number {
        // Guard against NaN / huge tab-switch gaps.
        if (!(dt > 0)) return 0;
        this.acc += Math.min(dt, MAX_SUBSTEPS * FIXED_DT);
        let n = 0;
        while (this.acc >= FIXED_DT && n < MAX_SUBSTEPS) {
            this.world.step();
            this.acc -= FIXED_DT;
            n++;
        }
        return n;
    }

    /** Current transform of dynamic body `i`. */
    bodyTransform(i: number): BodyTransform {
        const b = this.dynamicBodies[i];
        const t = b.translation();
        const r = b.rotation();
        return { position: { x: t.x, y: t.y, z: t.z }, quaternion: { x: r.x, y: r.y, z: r.z, w: r.w } };
    }

    get dynamicCount(): number { return this.dynamicBodies.length; }

    /** Free the WASM-side world (call on unmount to avoid leaks). */
    dispose(): void {
        this.world.free();
        this.dynamicBodies = [];
        this.capsule = null;
    }
}

/** Quaternion for a rotation of `angle` radians about the +Y axis. */
export function quatFromAxisY(angle: number): Quat {
    const h = angle / 2;
    return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}
