import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { F7_STATE } from '../Floor7Brain';
import { FLOOR7_HELM, resolveFloor7CaptainRenderPose } from '../floor7v2/helm';

const pos = new THREE.Vector3();
const tangent = new THREE.Vector3();

describe('Floor 7 V2 — rota visual do capitão até o leme', () => {
    it('nunca entra no volume da cabine durante a caminhada', () => {
        for (let i = 0; i <= 100; i++) {
            const k = i / 100;
            const brainZ = THREE.MathUtils.lerp(2.2, -5.3, k);
            const yaw = resolveFloor7CaptainRenderPose(F7_STATE.DONE, { x: 0.6, z: brainZ, face: Math.PI }, pos, tangent);
            // The V2 cabin starts at z=-4.375. The routed feet remain safely
            // forward of it, inside the open stair/quarterdeck envelope.
            expect(pos.z).toBeGreaterThan(-4.0);
            expect(pos.x).toBeGreaterThan(-1.55);
            expect(pos.x).toBeLessThan(0.75);
            expect(pos.y).toBeGreaterThanOrEqual(0);
            expect(pos.y).toBeLessThanOrEqual(0.62);
            expect(Number.isFinite(yaw)).toBe(true);
        }
    });

    it('usa a escada lateral antes de cruzar para o timão', () => {
        const brainZAtStair = 2.2 - 7.5 * 0.7;
        resolveFloor7CaptainRenderPose(F7_STATE.DONE, { x: 0.6, z: brainZAtStair, face: Math.PI }, pos, tangent);
        expect(pos.x).toBeLessThan(-1.1);
        expect(pos.y).toBeGreaterThan(0.08);
    });

    it('termina plantado diante do timão e permanece ali durante a viagem', () => {
        const yaw = resolveFloor7CaptainRenderPose(F7_STATE.SAIL, { x: -0.45, z: -5.3, face: Math.PI }, pos, tangent);
        expect(pos.toArray()).toEqual([FLOOR7_HELM.captainX, FLOOR7_HELM.captainY, FLOOR7_HELM.captainZ]);
        expect(FLOOR7_HELM.captainZ - FLOOR7_HELM.wheelZ).toBeGreaterThan(0.45);
        expect(FLOOR7_HELM.captainZ - FLOOR7_HELM.wheelZ).toBeLessThan(0.7);
        expect(yaw).toBeCloseTo(Math.PI / 2, 6);
    });
});
