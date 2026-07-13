import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { F7_STATE } from '../Floor7Brain';
import { FLOOR7_HELM, resolveFloor7CaptainRenderPose } from '../floor7v2/helm';

const pos = new THREE.Vector3();
const tangent = new THREE.Vector3();

describe('Floor 7 — rota visual do capitão até o leme do navio clássico', () => {
    it('nunca entra no volume da cabine durante a caminhada', () => {
        for (let i = 0; i <= 100; i++) {
            const k = i / 100;
            const brainZ = THREE.MathUtils.lerp(2.2, -5.3, k);
            const yaw = resolveFloor7CaptainRenderPose(F7_STATE.DONE, { x: 0.6, z: brainZ, face: Math.PI }, pos, tangent);
            // The classic cabin starts at z=-5.25. The routed feet remain well
            // forward of it and inside the open deck envelope.
            expect(pos.z).toBeGreaterThan(-4.65);
            expect(pos.x).toBeGreaterThan(-0.45);
            expect(pos.x).toBeLessThan(1.2);
            expect(pos.y).toBeGreaterThanOrEqual(0);
            expect(pos.y).toBeLessThanOrEqual(0.08);
            expect(Number.isFinite(yaw)).toBe(true);
        }
    });

    it('contorna o mastro principal em vez de atravessá-lo', () => {
        const brainZBesideMast = 2.2 - 7.5 * 0.45;
        resolveFloor7CaptainRenderPose(F7_STATE.DONE, { x: 0.6, z: brainZBesideMast, face: Math.PI }, pos, tangent);
        expect(pos.x).toBeGreaterThan(0.8);
    });

    it('termina plantado diante do timão e permanece ali durante a viagem', () => {
        const yaw = resolveFloor7CaptainRenderPose(F7_STATE.SAIL, { x: -0.45, z: -5.3, face: Math.PI }, pos, tangent);
        expect(pos.toArray()).toEqual([FLOOR7_HELM.captainX, FLOOR7_HELM.captainY, FLOOR7_HELM.captainZ]);
        expect(FLOOR7_HELM.captainZ - FLOOR7_HELM.wheelZ).toBeGreaterThan(0.55);
        expect(FLOOR7_HELM.captainZ - FLOOR7_HELM.wheelZ).toBeLessThan(0.75);
        expect(yaw).toBeCloseTo(Math.PI / 2, 6);
    });
});
