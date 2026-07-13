import * as THREE from 'three';
import { F7_STATE } from '../Floor7Brain';

/** Shared visual contract for the quarterdeck helm. All values are ship-local. */
export const FLOOR7_HELM = Object.freeze({
    wheelX: -0.45,
    wheelY: 1.34,
    wheelZ: -4.08,
    captainX: -0.45,
    captainY: 0.56,
    captainZ: -3.52,
});

const BRAIN_TALK_Z = 2.2;
const BRAIN_HELM_Z = -5.3;

// The WASM still owns quest timing. This render path turns its straight-line
// progress into a collision-free blocking pass: open deck -> port stair ->
// quarterdeck -> wheel. The last point stays forward of the cabin wall.
const HELM_PATH = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.6, 0.02, 2.2),
    new THREE.Vector3(-0.2, 0.02, 0.2),
    new THREE.Vector3(-1.18, 0.02, -2.18),
    new THREE.Vector3(-1.35, 0.12, -2.58),
    new THREE.Vector3(-1.35, FLOOR7_HELM.captainY, -3.68),
    new THREE.Vector3(FLOOR7_HELM.captainX, FLOOR7_HELM.captainY, FLOOR7_HELM.captainZ),
], false, 'centripetal', 0.5);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function floor7HelmProgress(brainZ: number): number {
    return clamp01((BRAIN_TALK_Z - brainZ) / (BRAIN_TALK_Z - BRAIN_HELM_Z));
}

/**
 * Resolves the captain's rendered feet position and body yaw without changing
 * the WASM state machine. Returns a yaw for the GLB whose authored forward is +X.
 */
export function resolveFloor7CaptainRenderPose(
    state: number,
    captain: { x: number; z: number; face: number },
    outPosition: THREE.Vector3,
    outTangent: THREE.Vector3,
): number {
    if (state === F7_STATE.DONE) {
        const progress = floor7HelmProgress(captain.z);
        HELM_PATH.getPointAt(progress, outPosition);
        // Centripetal interpolation can undershoot the flat deck by fractions
        // of a millimetre; clamp the planted feet to the physical surfaces.
        outPosition.y = THREE.MathUtils.clamp(outPosition.y, 0, FLOOR7_HELM.captainY);
        HELM_PATH.getTangentAt(progress, outTangent).normalize();
        const pathYaw = Math.atan2(-outTangent.z, outTangent.x);
        // He arrives side-on from the stair, then plants his feet and turns to
        // face the wheel during the final fifth of the walk.
        const turnToWheel = smooth01((progress - 0.78) / 0.22);
        return lerpAngle(pathYaw, Math.PI / 2, turnToWheel);
    }

    if (state >= F7_STATE.SAIL) {
        outPosition.set(FLOOR7_HELM.captainX, FLOOR7_HELM.captainY, FLOOR7_HELM.captainZ);
        outTangent.set(0, 0, -1);
        if (state === F7_STATE.SAIL) return Math.PI / 2;
        // Once anchored he can turn back toward the player, while remaining at
        // the real helm station instead of snapping inside the cabin.
        return -captain.face - Math.PI / 2;
    }

    outPosition.set(captain.x, 0, captain.z);
    outTangent.set(Math.sin(captain.face), 0, Math.cos(captain.face));
    return -captain.face - Math.PI / 2;
}
