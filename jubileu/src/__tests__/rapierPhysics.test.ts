import { describe, it, expect, beforeAll } from 'vitest';
import { initRapier, PropsWorld, quatFromAxisY } from '../rapierPhysics';
import type RAPIER_NS from '@dimforge/rapier3d-compat';

let R: typeof RAPIER_NS;

beforeAll(async () => {
    R = await initRapier();
}, 30000);

describe('rapierPhysics — WASM core', () => {
    it('initialises the WASM module', () => {
        expect(R).toBeTruthy();
        expect(typeof R.World).toBe('function');
    });

    it('a dropped box falls and comes to rest on the ground', () => {
        const w = new PropsWorld(R);
        w.addGround(0);
        const i = w.addDynamicBox({ hx: 0.5, hy: 0.5, hz: 0.5, x: 0, y: 5, z: 0 });
        for (let k = 0; k < 240; k++) w.step(1 / 60);
        const { position } = w.bodyTransform(i);
        // half-extent 0.5 resting on a ground whose top is y=0 → center ≈ 0.5
        expect(position.y).toBeGreaterThan(0.4);
        expect(position.y).toBeLessThan(0.65);
        w.dispose();
    });

    it('is deterministic — identical setups produce identical transforms', () => {
        const run = () => {
            const w = new PropsWorld(R);
            w.addGround(0);
            const i = w.addDynamicBox({ hx: 0.3, hy: 0.3, hz: 0.3, x: 0.2, y: 4, z: -0.1 });
            for (let k = 0; k < 200; k++) w.step(1 / 60);
            const t = w.bodyTransform(i);
            w.dispose();
            return t;
        };
        const a = run();
        const b = run();
        expect(a.position.x).toBeCloseTo(b.position.x, 10);
        expect(a.position.y).toBeCloseTo(b.position.y, 10);
        expect(a.position.z).toBeCloseTo(b.position.z, 10);
        expect(a.quaternion.w).toBeCloseTo(b.quaternion.w, 10);
    });

    it('two boxes spawned overlapping push apart (no interpenetration)', () => {
        const w = new PropsWorld(R);
        w.addGround(0);
        const a = w.addDynamicBox({ hx: 0.5, hy: 0.5, hz: 0.5, x: -0.1, y: 0.5, z: 0 });
        const b = w.addDynamicBox({ hx: 0.5, hy: 0.5, hz: 0.5, x: 0.1, y: 0.5, z: 0 });
        for (let k = 0; k < 120; k++) w.step(1 / 60);
        const ta = w.bodyTransform(a).position;
        const tb = w.bodyTransform(b).position;
        // centers of two unit cubes can't be closer than ~1 on the spread axis
        expect(Math.abs(ta.x - tb.x)).toBeGreaterThan(0.85);
        w.dispose();
    });

    it('the kinematic capsule shoves a box out of the way', () => {
        const w = new PropsWorld(R);
        w.addGround(0);
        const box = w.addDynamicBox({ hx: 0.4, hy: 0.4, hz: 0.4, x: 0, y: 0.4, z: 0 });
        w.setCapsule(0, 0, -3, 0.5, 0.6);
        // settle the box first
        for (let k = 0; k < 30; k++) w.step(1 / 60);
        const startZ = w.bodyTransform(box).position.z;
        // drive the capsule forward through the box's resting spot
        for (let k = 0; k < 180; k++) {
            const z = -3 + (k / 180) * 4; // walk from z=-3 to z=+1
            w.updateCapsule(0, 0, z);
            w.step(1 / 60);
        }
        const endZ = w.bodyTransform(box).position.z;
        // the box should have been pushed forward (+Z) noticeably
        expect(endZ - startZ).toBeGreaterThan(0.4);
        w.dispose();
    });

    it('static wall segments contain a box (no tunneling)', () => {
        const w = new PropsWorld(R);
        w.addGround(0);
        // a wall at x≈2 running along Z
        w.addWallSegments([[2, -3, 2, 3]], 3, 0.2, 0);
        const box = w.addDynamicBox({ hx: 0.4, hy: 0.4, hz: 0.4, x: 1, y: 0.5, z: 0 });
        // shove it hard toward the wall every step via gravity-free nudge:
        const body = (w as unknown as { dynamicBodies: { setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void }[] }).dynamicBodies?.[0];
        for (let k = 0; k < 120; k++) {
            if (body) body.setLinvel({ x: 5, y: 0, z: 0 }, true);
            w.step(1 / 60);
        }
        const x = w.bodyTransform(box).position.x;
        // box center can't pass the wall face at x≈1.9 (wall at 2, half-thickness 0.1, box half 0.4)
        expect(x).toBeLessThan(1.6);
        w.dispose();
    });

    it('quatFromAxisY matches a known 90° rotation', () => {
        const q = quatFromAxisY(Math.PI / 2);
        expect(q.y).toBeCloseTo(Math.SQRT1_2, 6);
        expect(q.w).toBeCloseTo(Math.SQRT1_2, 6);
        expect(q.x).toBe(0);
        expect(q.z).toBe(0);
    });

    it('step clamps a huge dt instead of spiralling', () => {
        const w = new PropsWorld(R);
        w.addGround(0);
        w.addDynamicBox({ hx: 0.5, hy: 0.5, hz: 0.5, x: 0, y: 2, z: 0 });
        const n = w.step(100); // 100 seconds in one frame
        expect(n).toBeLessThanOrEqual(4); // MAX_SUBSTEPS
        w.dispose();
    });
});
