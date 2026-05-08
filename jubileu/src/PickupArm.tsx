import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── PickupArm: Procedural arm extension for item pickup ──────────────────
// Renders inside the Player's avatar group. When `trigger` increments, the
// arm extends forward (reaching animation), holds, then retracts.
// Does NOT interfere with existing GLB animations — it's a separate mesh
// layered on top of the avatar.

interface PickupArmProps {
  /** Increment this value to trigger the pickup animation */
  trigger: number;
  /** Camera theta for arm direction */
  cameraThetaRef: React.MutableRefObject<number>;
  /** Item type — controls hand color/pose */
  itemType?: 'flashlight' | 'cookie' | null;
}

// Animation phases:
// 0.0 - 0.3s  → extend arm forward
// 0.3 - 0.8s  → hold (grab item)
// 0.8 - 1.2s  → retract arm back
const PHASE_EXTEND_END = 0.3;
const PHASE_HOLD_END = 0.8;
const PHASE_RETRACT_END = 1.2;

export const PickupArm: React.FC<PickupArmProps> = ({ trigger, cameraThetaRef, itemType }) => {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const handRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(-1); // -1 = idle, 0..1 = animating
  const lastTriggerRef = useRef(0);
  const timeRef = useRef(0);

  // Hand color based on item type
  const handColor = itemType === 'cookie' ? '#D2A06B' : '#888';
  const handEmissive = itemType === 'cookie' ? '#6B3E1F' : '#444';

  useFrame((_, dt) => {
    const group = groupRef.current;
    const arm = armRef.current;
    const hand = handRef.current;
    if (!group || !arm || !hand) return;

    // Detect new trigger
    if (trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      progressRef.current = 0;
      timeRef.current = 0;
    }

    // Idle state — hide everything
    if (progressRef.current < 0) {
      group.visible = false;
      return;
    }

    group.visible = true;
    timeRef.current += dt;
    const t = timeRef.current;

    // Calculate arm extension (0 = rest, 1 = fully extended)
    let extension = 0;
    if (t < PHASE_EXTEND_END) {
      // Ease-out extend
      const p = t / PHASE_EXTEND_END;
      extension = 1 - Math.pow(1 - p, 3);
    } else if (t < PHASE_HOLD_END) {
      extension = 1;
    } else if (t < PHASE_RETRACT_END) {
      // Ease-in retract
      const p = (t - PHASE_HOLD_END) / (PHASE_RETRACT_END - PHASE_HOLD_END);
      extension = 1 - p;
    } else {
      // Animation complete
      progressRef.current = -1;
      group.visible = false;
      return;
    }

    // Arm extends forward relative to player facing direction
    // The arm pivot is at the right shoulder
    const reachDist = 0.6 * extension; // how far forward the hand reaches
    const reachUp = 0.15 * extension;  // slight upward reach
    const elbowBend = 0.3 * (1 - extension); // elbow bends when extending

    // Position the forearm + hand
    arm.position.set(0, 0, 0);
    arm.rotation.x = -extension * 0.8; // rotate arm forward
    arm.rotation.z = -0.15; // slight outward angle

    // Hand opens when extended, closes when retracting
    if (hand) {
      (hand.material as THREE.MeshStandardMaterial).emissiveIntensity =
        extension > 0.5 ? 1.5 : 0.3;
    }
  });

  return (
    // Positioned at right shoulder relative to player center
    <group ref={groupRef} position={[0.3, 1.2, 0]} visible={false}>
      {/* Upper arm (from shoulder) */}
      <group ref={armRef}>
        {/* Upper arm mesh */}
        <mesh position={[0, -0.12, -0.08]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.03, 0.25, 8]} />
          <meshStandardMaterial color="#E8B88A" roughness={0.9} metalness={0} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0, -0.05, -0.25]} rotation={[0.6, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.028, 0.22, 8]} />
          <meshStandardMaterial color="#E8B88A" roughness={0.9} metalness={0} />
        </mesh>
        {/* Hand */}
        <mesh ref={handRef} position={[0, 0.02, -0.4]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial
            color={handColor}
            emissive={handEmissive}
            emissiveIntensity={0.3}
            roughness={0.8}
          />
        </mesh>
        {/* Fingers (simplified as small cylinders) */}
        {[0, 1, 2, 3].map(i => (
          <mesh
            key={i}
            position={[
              (i - 1.5) * 0.015,
              0.02,
              -0.45
            ]}
            rotation={[0.4, 0, 0]}
          >
            <cylinderGeometry args={[0.008, 0.008, 0.04, 4]} />
            <meshStandardMaterial color="#E8B88A" roughness={0.9} metalness={0} />
          </mesh>
        ))}
      </group>
    </group>
  );
};
