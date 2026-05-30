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

// Camera-local resting pose. The GLB holds BOTH hands fused in one mesh, so we
// render it once. Rx(π/2) stands it so the white gloves point up with fingers
// curling toward the player (backs of hands to camera) while the black sleeves
// drop diagonally out the bottom corners — the reference \  / framing.
const BASE_POS = new THREE.Vector3(0, -0.32, -0.45);
const BASE_ROT = new THREE.Euler(Math.PI / 2, 0, 0);
const SCALE    = 1.42;

// Dev-only pose override via URL (?…&rx=&ry=&rz=&px=&py=&pz=&s=). Lets the
// first-person pose be dialed in from the preview without a rebuild; no params
// in production → falls back to the constants above.
function poseFromURL() {
    const q = new URLSearchParams(window.location.search);
    const n = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
    return {
        rot: new THREE.Euler(n('rx', BASE_ROT.x), n('ry', BASE_ROT.y), n('rz', BASE_ROT.z)),
        pos: new THREE.Vector3(n('px', BASE_POS.x), n('py', BASE_POS.y), n('pz', BASE_POS.z)),
        scale: n('s', SCALE),
    };
}

export default function FpHands() {
    const { camera } = useThree();
    const root  = useRef<THREE.Group>(null);
    const inner = useRef<THREE.Group>(null);
    const walk  = useRef(0);

    const pose = useMemo(poseFromURL, []);

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
            pose.pos.x + bobX,
            pose.pos.y + breath + bobY + jumpY,
            pose.pos.z + Math.abs(bobX) * 0.4,
        );
        inner.current.rotation.set(
            pose.rot.x + jumpRX + Math.sin(t * 12) * 0.02 * w,
            pose.rot.y + bobX * 0.5,
            pose.rot.z + Math.sin(t * 6) * 0.04 * w,
        );
    });

    return (
        <group ref={root}>
            <group ref={inner} scale={[pose.scale, pose.scale, pose.scale]}>
                <primitive object={model} />
            </group>
        </group>
    );
}

useGLTF.preload(GLOVES_URL);
