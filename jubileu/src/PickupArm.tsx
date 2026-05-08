import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── findBone: Search skeleton for a bone by partial name match ──────────
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

// ─── PickupArmAnimator: Procedural arm bone manipulation ─────────────────
// Finds the right arm bones in the GLB skeleton and rotates them to create
// a reaching/grabbing animation when `trigger` increments.
// Does NOT replace existing animations — it overrides bone transforms
// AFTER the animation system runs via useFrame ordering.

interface PickupArmAnimatorProps {
  /** Increment to trigger the pickup animation */
  trigger: number;
  /** The avatar's scene object (GLB) */
  avatarScene: THREE.Object3D | null;
  /** Camera theta for arm direction */
  cameraThetaRef: React.MutableRefObject<number>;
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
  onComplete,
}) => {
  const armBoneRef = useRef<THREE.Bone | null>(null);
  const forearmBoneRef = useRef<THREE.Bone | null>(null);
  const handBoneRef = useRef<THREE.Bone | null>(null);
  const bonesFoundRef = useRef(false);

  // Store original rotations to restore after animation
  const origArmRotRef = useRef(new THREE.Euler());
  const origForearmRotRef = useRef(new THREE.Euler());

  const progressRef = useRef(-1); // -1 = idle, 0..1 = animating
  const lastTriggerRef = useRef(0);
  const timeRef = useRef(0);
  const completeCbRef = useRef(onComplete);
  completeCbRef.current = onComplete;

  // Find arm bones when avatar scene changes
  useEffect(() => {
    if (!avatarScene) return;
    // Try common bone naming conventions
    const arm = findBone(avatarScene, 'rightarm', 'right_arm', 'arm_r', 'upperarm_r', 'upperarmr');
    const forearm = findBone(avatarScene, 'rightforearm', 'right_forearm', 'forearm_r', 'lowerarm_r', 'lowerarmr');
    const hand = findBone(avatarScene, 'righthand', 'right_hand', 'hand_r', 'handr');

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

  useFrame(() => {
    // Detect new trigger
    if (trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      progressRef.current = 0;
      timeRef.current = 0;
    }

    // Idle — nothing to do
    if (progressRef.current < 0) return;

    timeRef.current += 1 / 60; // approximate dt for consistency
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
      extension = 1 - p;
    } else {
      // Animation complete — restore original rotations
      extension = 0;
      progressRef.current = -1;
      if (armBoneRef.current) {
        armBoneRef.current.rotation.copy(origArmRotRef.current);
      }
      if (forearmBoneRef.current) {
        forearmBoneRef.current.rotation.copy(origForearmRotRef.current);
      }
      completeCbRef.current?.();
      return;
    }

    // Apply procedural rotation to arm bones
    // Shoulder: rotate forward (negative X in most rigs = forward bend)
    if (armBoneRef.current) {
      const orig = origArmRotRef.current;
      armBoneRef.current.rotation.x = orig.x - extension * 1.2; // reach forward
      armBoneRef.current.rotation.z = orig.z - extension * 0.15; // slight outward
    }

    // Elbow: bend slightly when extending
    if (forearmBoneRef.current) {
      const orig = origForearmRotRef.current;
      forearmBoneRef.current.rotation.x = orig.x - extension * 0.6;
    }
  });

  // This component doesn't render anything — it just manipulates bones
  return null;
};
