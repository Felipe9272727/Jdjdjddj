import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── findBone: Exhaustive skeleton bone search ───────────────────────────
// Tries every common naming convention for humanoid rigs:
//   - Mixamo: "mixamorig:RightArm", "mixamorig:RightForeArm"
//   - Unity:  "RightArm", "RightForeArm", "RightHand"
//   - Unreal: "upperarm_r", "lowerarm_r", "hand_r"
//   - Generic: "Arm_R", "ForeArm_R", "Hand_R"
//   - CamelCase variants, etc.
function findBone(root: THREE.Object3D, ...patterns: string[]): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((c) => {
    if (found) return;
    if ((c as any).isBone || c.type === 'Bone') {
      const name = c.name.toLowerCase();
      for (const p of patterns) {
        if (name.includes(p.toLowerCase())) {
          found = c as THREE.Bone;
          return;
        }
      }
    }
  });
  return found;
}

// ─── findAllBones: Find multiple bones matching any of the given patterns ─
function findAllBones(root: THREE.Object3D, patterns: string[]): THREE.Bone[] {
  const results: THREE.Bone[] = [];
  const seen = new Set<string>();
  root.traverse((c) => {
    if ((c as any).isBone || c.type === 'Bone') {
      const name = c.name.toLowerCase();
      for (const p of patterns) {
        if (name.includes(p.toLowerCase()) && !seen.has(c.name)) {
          results.push(c as THREE.Bone);
          seen.add(c.name);
          break;
        }
      }
    }
  });
  return results;
}

// ─── Arm naming patterns (comprehensive) ─────────────────────────────────
const RIGHT_ARM_PATTERNS = [
  'rightarm', 'right_arm', 'arm_r', 'upperarm_r', 'upperarmright',
  'r_upperarm', 'rupperarm', 'upperarm.r', 'bip01_r_upperarm',
  // Mixamo specific (the colon is stripped by includes)
  'mixamorig:rightarm',
];

const RIGHT_FOREARM_PATTERNS = [
  'rightforearm', 'right_forearm', 'forearm_r', 'lowerarm_r', 'lowerarmright',
  'r_forearm', 'rforearm', 'forearm.r', 'lowerarm.r', 'bip01_r_forearm',
  'mixamorig:rightforearm',
];

const RIGHT_HAND_PATTERNS = [
  'righthand', 'right_hand', 'hand_r', 'handright',
  'r_hand', 'rhand', 'hand.r', 'bip01_r_hand',
  'mixamorig:righthand',
];

// ─── PickupArmAnimator ───────────────────────────────────────────────────
// Two strategies:
//   1. BONE MODE: Find actual arm bones in the GLB skeleton and rotate them
//   2. PROCEDURAL MODE: If no bones found, render a procedural arm mesh
//      positioned in world space that animates forward

interface PickupArmAnimatorProps {
  /** Increment to trigger the pickup animation */
  trigger: number;
  /** The avatar's scene object (GLB) */
  avatarScene: THREE.Object3D | null;
  /** Camera theta for arm direction */
  cameraThetaRef: React.MutableRefObject<number>;
  /** Player world position (for procedural fallback) */
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  /** Callback when animation completes */
  onComplete?: () => void;
}

// Animation timing
const PHASE_EXTEND = 0.35;    // arm extends forward
const PHASE_HOLD = 0.5;       // grab hold
const PHASE_RETRACT = 0.35;   // arm returns
const TOTAL_DURATION = PHASE_EXTEND + PHASE_HOLD + PHASE_RETRACT;

export const PickupArmAnimator: React.FC<PickupArmAnimatorProps> = ({
  trigger,
  avatarScene,
  cameraThetaRef,
  playerPositionRef,
  onComplete,
}) => {
  // ── Bone refs (bone mode) ──
  const armBoneRef = useRef<THREE.Bone | null>(null);
  const forearmBoneRef = useRef<THREE.Bone | null>(null);
  const handBoneRef = useRef<THREE.Bone | null>(null);
  const bonesFoundRef = useRef(false);

  // Store original rotations to restore after animation
  const origArmRotRef = useRef(new THREE.Euler());
  const origForearmRotRef = useRef(new THREE.Euler());

  // ── Animation state ──
  const progressRef = useRef(-1); // -1 = idle, 0..1 = animating
  const lastTriggerRef = useRef(0);
  const timeRef = useRef(0);
  const completeCbRef = useRef(onComplete);
  completeCbRef.current = onComplete;

  // ── Procedural arm refs (fallback mode) ──
  const procGroupRef = useRef<THREE.Group>(null);
  const procExtensionRef = useRef(0); // 0 = rest, 1 = fully extended

  // Find arm bones when avatar scene changes
  useEffect(() => {
    if (!avatarScene) {
      bonesFoundRef.current = false;
      return;
    }

    const arm = findBone(avatarScene, ...RIGHT_ARM_PATTERNS);
    const forearm = findBone(avatarScene, ...RIGHT_FOREARM_PATTERNS);
    const hand = findBone(avatarScene, ...RIGHT_HAND_PATTERNS);

    if (arm) {
      armBoneRef.current = arm;
      origArmRotRef.current.copy(arm.rotation);
    }
    if (forearm) {
      forearmBoneRef.current = forearm;
      origForearmRotRef.current.copy(forearm.rotation);
    }
    handBoneRef.current = hand;
    bonesFoundRef.current = !!(arm || forearm);
  }, [avatarScene]);

  useFrame((_, dt) => {
    // Detect new trigger
    if (trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      progressRef.current = 0;
      timeRef.current = 0;
    }

    // Idle — nothing to do
    if (progressRef.current < 0) {
      // Ensure procedural arm is hidden when idle
      if (procGroupRef.current) procGroupRef.current.visible = false;
      return;
    }

    const safeDt = Math.min(dt, 0.05);
    timeRef.current += safeDt;
    const t = timeRef.current;

    // Calculate extension factor (0 = rest, 1 = fully extended)
    let extension = 0;
    if (t < PHASE_EXTEND) {
      // Ease-out extend
      const p = t / PHASE_EXTEND;
      extension = 1 - Math.pow(1 - p, 3);
    } else if (t < PHASE_EXTEND + PHASE_HOLD) {
      extension = 1;
    } else if (t < TOTAL_DURATION) {
      // Ease-in retract
      const p = (t - PHASE_EXTEND - PHASE_HOLD) / PHASE_RETRACT;
      extension = 1 - p * p; // ease-in quad for retract
    } else {
      // Animation complete
      extension = 0;
      progressRef.current = -1;
      // Restore bone rotations
      if (armBoneRef.current) {
        armBoneRef.current.rotation.copy(origArmRotRef.current);
      }
      if (forearmBoneRef.current) {
        forearmBoneRef.current.rotation.copy(origForearmRotRef.current);
      }
      // Hide procedural arm
      if (procGroupRef.current) procGroupRef.current.visible = false;
      procExtensionRef.current = 0;
      completeCbRef.current?.();
      return;
    }

    procExtensionRef.current = extension;

    // ── BONE MODE: manipulate GLB skeleton bones ──
    if (bonesFoundRef.current) {
      if (armBoneRef.current) {
        const orig = origArmRotRef.current;
        armBoneRef.current.rotation.x = orig.x - extension * 1.2;
        armBoneRef.current.rotation.z = orig.z - extension * 0.15;
      }
      if (forearmBoneRef.current) {
        const orig = origForearmRotRef.current;
        forearmBoneRef.current.rotation.x = orig.x - extension * 0.6;
      }
    }

    // ── PROCEDURAL MODE: position arm mesh in world space ──
    if (procGroupRef.current) {
      const g = procGroupRef.current;
      // Always show procedural arm when animating (even in bone mode it's
      // hidden since bonesFoundRef controls visibility)
      if (!bonesFoundRef.current) {
        g.visible = true;
      }

      const pp = playerPositionRef.current;
      const theta = cameraThetaRef.current;

      // Right shoulder position relative to player center
      const rightAngle = theta - Math.PI / 2;
      const shoulderX = pp.x + Math.sin(rightAngle) * 0.35;
      const shoulderZ = pp.z + Math.cos(rightAngle) * 0.35;
      const shoulderY = pp.y + 1.35; // shoulder height

      // Extend forward in the camera direction
      const fwdX = -Math.sin(theta);
      const fwdZ = -Math.cos(theta);

      g.position.set(
        shoulderX + fwdX * extension * 0.6,
        shoulderY - extension * 0.15, // slight downward reach
        shoulderZ + fwdZ * extension * 0.6,
      );

      // Face the reaching direction
      g.rotation.y = theta + Math.PI;
      // Tilt arm forward based on extension
      g.rotation.x = -extension * 0.8;
    }
  });

  // Render procedural arm (only visible during animation in fallback mode)
  return (
    <group ref={procGroupRef} visible={false}>
      {/* Upper arm */}
      <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.3, 8]} />
        <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
      </mesh>
      {/* Forearm */}
      <mesh position={[0, -0.02, 0.35]} rotation={[Math.PI / 2 + 0.15, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.04, 0.28, 8]} />
        <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
      </mesh>
      {/* Hand */}
      <mesh position={[0, -0.04, 0.5]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
      </mesh>
      {/* Fingers (simplified) */}
      {[0, 1, 2, 3].map(i => {
        const angle = (i - 1.5) * 0.2;
        return (
          <mesh key={i} position={[Math.sin(angle) * 0.03, -0.04, 0.56]} rotation={[0.3, 0, angle * 0.5]}>
            <cylinderGeometry args={[0.012, 0.01, 0.06, 6]} />
            <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
          </mesh>
        );
      })}
    </group>
  );
};
