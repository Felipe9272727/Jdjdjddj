/**
 * Floor3Hands.tsx — First-person cartoon gloves for the endless parkour.
 *
 * Loads the cartoon gloves GLB (public/cartoon_gloves.glb) and pins it to the
 * camera so it reads as the player's own hands — exactly like the reference.
 *
 * The GLB is a single flat mesh lying in XZ (palms facing +Y). A -90° X
 * rotation stands it upright so palms face –Z (toward the camera). The mesh is
 * then parented to a world group that tracks camera position + quaternion each
 * frame, so it always sits at screen-bottom center.
 *
 * All animation is PROCEDURAL:
 *   • idle   → slow breathing bob
 *   • walk   → figure-eight bob, driven by f3HandState.moving
 *   • jump   → hands swing up rising / reach down falling, from f3HandState.vy
 */

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { f3HandState } from './f3Parkour';

const GLOVES_URL = '/cartoon_gloves.glb';

// Camera-local resting pose.
// GLB is flat in XZ: palms face +Y, sleeve-tips at native +Z, glove-hand-tips at native -Z.
// Ry(π)×Rx(π/2) maps: native -Z (hands) → +Y camera (visible at bottom),
//                      native +Z (sleeves) → -Y camera (off screen below),
//                      native +Y (palms) → -Z camera (forward, player sees knuckle side).
const BASE_POS = new THREE.Vector3(0, -0.12, -0.55);
const BASE_ROT = new THREE.Euler(Math.PI / 2, Math.PI, 0);
const SCALE    = 0.55;

export default function FpHands() {
    const { camera } = useThree();
    const root  = useRef<THREE.Group>(null);
    const inner = useRef<THREE.Group>(null);
    const walk  = useRef(0);

    const { scene } = useGLTF(GLOVES_URL);
    // Clone once; keep the original GLB material/texture intact.
    const model = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
                const m = o as THREE.Mesh;
                m.castShadow = false;
                m.frustumCulled = false;
                m.renderOrder = 10;
            }
        });
        return c;
    }, [scene]);

    useFrame((s, dt) => {
        if (!root.current || !inner.current) return;
        const t = s.clock.elapsedTime;

        // Stick the rig to the camera.
        root.current.position.copy(camera.position);
        root.current.quaternion.copy(camera.quaternion);

        // Smooth walk flag.
        const target = f3HandState.moving && f3HandState.grounded ? 1 : 0;
        walk.current += (target - walk.current) * Math.min(1, dt * 10);
        const w = walk.current;

        // ── Procedural pose ──────────────────────────────────────────────
        const breath = Math.sin(t * 1.6) * 0.012;
        const bobY   = Math.sin(t * 12) * 0.025 * w;
        const bobX   = Math.sin(t * 6)  * 0.028 * w;
        const vy     = f3HandState.vy;
        const jumpY  = THREE.MathUtils.clamp(vy * 0.016, -0.10, 0.12);
        const jumpRX = THREE.MathUtils.clamp(-vy * 0.02, -0.18, 0.22);

        inner.current.position.set(
            BASE_POS.x + bobX,
            BASE_POS.y + breath + bobY + jumpY,
            BASE_POS.z + Math.abs(bobX) * 0.4,
        );
        inner.current.rotation.set(
            BASE_ROT.x + jumpRX + Math.sin(t * 12) * 0.02 * w,
            BASE_ROT.y + bobX * 0.5,
            BASE_ROT.z + Math.sin(t * 6) * 0.04 * w,
        );
    });

    return (
        <group ref={root}>
            <group ref={inner} scale={[SCALE, SCALE, SCALE]}>
                <primitive object={model} />
            </group>
        </group>
    );
}

useGLTF.preload(GLOVES_URL);
