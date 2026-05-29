/**
 * Floor3Hands.tsx — First-person cartoon gloves for the endless parkour.
 *
 * Loads the white "cartoon gloves" GLB (public/cartoon_gloves.glb, a single
 * Tripo mesh with NO baked clips) and pins it to the camera so it reads as the
 * player's own hands reaching forward — exactly like the reference.
 *
 * Because the GLB has no animations, everything is PROCEDURAL (what the user
 * asked for):
 *   • idle   → slow breathing bob + tiny sway
 *   • walk   → faster figure-eight bob, driven by f3HandState.moving
 *   • jump   → hands swing up while rising, reach down while falling, from
 *              f3HandState.vy (the player's vertical velocity)
 *
 * The glove material is overridden to the same white 2-band toon used by the
 * platforms, so it sits in the rubber-hose black-&-white world (and the Floor-3
 * grayscale pass keeps it monochrome regardless of the GLB's original texture).
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { createToonMaterial } from './cartoonToon';
import { f3HandState } from './f3Parkour';

const GLOVES_URL = '/cartoon_gloves.glb';

// Resting pose in CAMERA-LOCAL space (camera looks down -Z, so -Z is "forward").
const BASE_POS = new THREE.Vector3(0, -0.30, -0.52);
const BASE_ROT = new THREE.Euler(1.25, Math.PI, 0);   // pitch forward so the gloves reach away from the camera (backs up)
const SCALE    = 0.82;

const GLOVE_MAT = createToonMaterial({ color: '#ffffff', shadow: '#b6bcc6', bands: 2, rimStrength: 0.3, specThreshold: 0.95 });

export default function FpHands() {
    const { camera } = useThree();
    const root  = useRef<THREE.Group>(null);
    const inner = useRef<THREE.Group>(null);
    const walk  = useRef(0);   // smoothed 0..1 "is walking"

    const { scene } = useGLTF(GLOVES_URL);
    // Clone once and repaint every mesh with the white toon material.
    const model = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
                const m = o as THREE.Mesh;
                m.material = GLOVE_MAT;
                m.castShadow = false;
                m.frustumCulled = false;   // never pop out at screen edges
                m.renderOrder = 10;
            }
        });
        return c;
    }, [scene]);

    useFrame((s, dt) => {
        if (!root.current || !inner.current) return;
        const t = s.clock.elapsedTime;

        // Stick the rig to the camera (position + orientation).
        root.current.position.copy(camera.position);
        root.current.quaternion.copy(camera.quaternion);

        // Smooth the walk flag so starts/stops ease in.
        const target = f3HandState.moving && f3HandState.grounded ? 1 : 0;
        walk.current += (target - walk.current) * Math.min(1, dt * 10);
        const w = walk.current;

        // ── Procedural pose ──────────────────────────────────────────────
        const breath = Math.sin(t * 1.6) * 0.012;                 // idle
        const bobY   = Math.sin(t * 12) * 0.025 * w;              // walk vertical
        const bobX   = Math.sin(t * 6)  * 0.03  * w;              // walk side sway
        const vy     = f3HandState.vy;
        const jumpY  = THREE.MathUtils.clamp(vy * 0.016, -0.10, 0.12);  // up rising / down falling
        const jumpRX = THREE.MathUtils.clamp(-vy * 0.02, -0.18, 0.22);  // tilt with motion

        inner.current.position.set(
            BASE_POS.x + bobX,
            BASE_POS.y + breath + bobY + jumpY,
            BASE_POS.z + Math.abs(bobX) * 0.4,
        );
        inner.current.rotation.set(
            BASE_ROT.x + jumpRX + Math.sin(t * 12) * 0.02 * w,
            BASE_ROT.y + bobX * 0.6,
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
