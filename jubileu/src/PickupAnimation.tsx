/**
 * PickupAnimation.tsx — "Reach for the item" effect WITHOUT touching the
 * avatar's skeleton.
 *
 * The Mixamo skeleton is driven by AnimationMixer every frame. If you also
 * write to bone.rotation/position from your own code, the two fight for
 * the same data → matrix world goes NaN → skinning shader divides by zero
 * → WebGL aborts the draw → black screen / crash. That's the bug Felipe
 * hit when he tried to author a "reach" animation procedurally on the rig.
 *
 * This module sidesteps the problem entirely: the rig is left alone. The
 * illusion of "picking up" is created by the ITEM moving toward the
 * player's hand position in world space. While the animation plays, the
 * normal hand-held item (FlashlightModel3D) is hidden so there's no
 * double-render.
 *
 * Math:
 *   start = player + (forward * 1.5) + (up * 1.3)   — eye level, a step ahead
 *   end   = player + (right * 0.32)  + (up * 0.85)  — hip-high, right hand
 *   t     = (now - startedAt) / DURATION, clamped 0..1
 *   eased = 1 - (1 - t)^3                            — cubic ease-out
 *   pos   = lerp(start, end, eased)
 *   scale = lerp(0.4, 1.0, eased)
 *   spin  = t * TAU * 1.5                            — visual flair
 *
 * When t >= 1 the host nulls the pickupAnim state and FlashlightModel3D /
 * cookie iconography take over the visual.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface PickupAnimState {
  itemId: 'flashlight' | 'cookie';
  startedAt: number;
}

interface PickupAnimatorProps {
  pickup: PickupAnimState | null;
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  /** Called when the animation completes so the host can null the state. */
  onComplete: () => void;
}

const DURATION_MS = 1100;

export const PickupAnimator: React.FC<PickupAnimatorProps> = ({
  pickup,
  playerPositionRef,
  cameraThetaRef,
  onComplete,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const completedRef = useRef(false);
  const start = useMemo(() => new THREE.Vector3(), []);
  const end = useMemo(() => new THREE.Vector3(), []);
  const cur = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!pickup || !groupRef.current) return;
    const t = Math.min(1, (performance.now() - pickup.startedAt) / DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);

    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;
    // forward = direction the camera looks (matches Player movement code).
    const fx = -Math.sin(theta);
    const fz = -Math.cos(theta);
    // right = camera-relative right (theta - pi/2).
    const rx = Math.sin(theta - Math.PI / 2);
    const rz = Math.cos(theta - Math.PI / 2);

    // Start: a step ahead at eye level.
    start.set(pp.x + fx * 1.5, 1.3, pp.z + fz * 1.5);
    // End: at the player's right hand, hip-high.
    end.set(pp.x + rx * 0.32 + fx * 0.18, 0.85, pp.z + rz * 0.32 + fz * 0.18);

    cur.lerpVectors(start, end, eased);
    const g = groupRef.current;
    g.position.copy(cur);
    // Face the camera so the player sees the item from a flattering angle.
    g.rotation.y = theta + Math.PI;
    // Tilt + spin for visual flair (eases out so it settles by the end).
    const wobble = (1 - eased) * 0.6;
    g.rotation.x = Math.sin(t * 8) * wobble;
    g.rotation.z = t * Math.PI * 1.5;
    const s = THREE.MathUtils.lerp(0.4, 1.0, eased);
    g.scale.setScalar(s);

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  // Reset the completion guard whenever a new pickup starts.
  React.useEffect(() => {
    completedRef.current = false;
  }, [pickup?.startedAt]);

  if (!pickup) return null;

  return (
    <group ref={groupRef}>
      {pickup.itemId === 'flashlight' && <FlashlightPickupMesh />}
      {pickup.itemId === 'cookie' && <CookiePickupMesh />}
      {/* Soft warm glow around the floating item — pure visual flair. */}
      <pointLight color="#FFE082" intensity={1.6} distance={2.4} decay={2} />
    </group>
  );
};

// Slimmed-down versions of the item models — just the silhouette so the
// player recognises what they're picking up without us having to share
// geometry definitions with FlashlightLight.tsx.
const FlashlightPickupMesh: React.FC = () => (
  <group rotation={[Math.PI / 2, 0, 0]}>
    {/* Body */}
    <mesh>
      <cylinderGeometry args={[0.05, 0.05, 0.26, 12]} />
      <meshStandardMaterial color="#1a1a1e" metalness={0.7} roughness={0.25} />
    </mesh>
    {/* Trim ring */}
    <mesh position={[0, 0.12, 0]}>
      <cylinderGeometry args={[0.066, 0.066, 0.025, 16]} />
      <meshStandardMaterial color="#9aa0a6" metalness={0.85} roughness={0.2} />
    </mesh>
    {/* Lens / bulb — emissive so it reads as the "give away" beat */}
    <mesh position={[0, 0.16, 0]}>
      <coneGeometry args={[0.075, 0.05, 16]} />
      <meshStandardMaterial
        color="#FFF6D8"
        emissive="#FFF6D8"
        emissiveIntensity={3.2}
        toneMapped={false}
      />
    </mesh>
  </group>
);

const CookiePickupMesh: React.FC = () => (
  <group rotation={[Math.PI / 2, 0, 0]}>
    <mesh>
      <cylinderGeometry args={[0.12, 0.12, 0.04, 20]} />
      <meshStandardMaterial color="#A66B2D" roughness={0.95} />
    </mesh>
    {[
      [0.05, 0.022, 0.02],
      [-0.04, 0.022, 0.05],
      [0.02, 0.022, -0.05],
      [-0.05, 0.022, -0.02],
    ].map(([x, y, z], i) => (
      <mesh key={i} position={[x, y, z]}>
        <sphereGeometry args={[0.022, 6, 4]} />
        <meshStandardMaterial color="#2C1B12" roughness={0.7} />
      </mesh>
    ))}
  </group>
);
