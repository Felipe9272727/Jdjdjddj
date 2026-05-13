/**
 * FlashlightLight.tsx — Spotlight + 3rd-person 3D model + first-person hand.
 *
 * IMPORTANT NON-NEGOTIABLES (learned from the black-screen regressions):
 *
 *  1. NEVER use SpotLight with `distance={0}` while the light is alive — Three.js
 *     treats 0 as "infinite range" and the GPU drops nearby fragments to black.
 *     We use `distance={owned && active ? 18 : 0.1}` so even when the player
 *     owns the flashlight but has it off, the light has a 10cm range.
 *
 *  2. NEVER attach the model to a skeleton bone (createPortal / bone.add).
 *     Skinned mesh hierarchies don't like sibling meshes mounted at runtime.
 *     The 3D model follows the player via plain offset math.
 *
 *  3. NEVER use `useFrame(..., priority != 0)` anywhere. R3F v9 disables the
 *     canvas auto-render when any priority is non-zero.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── SpotLight ─────────────────────────────────────────────────────────────
interface FlashlightLightProps {
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  active: boolean;
  owned: boolean;
}

export const FlashlightLight: React.FC<FlashlightLightProps> = ({
  playerPositionRef,
  cameraThetaRef,
  active,
  owned,
}) => {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useFrame(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;

    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;

    // Light origin near the player's head/hand, pointing where the camera looks.
    light.position.set(pp.x, pp.y + 1.45, pp.z);
    // theta is camera azimuth; player faces away from camera (+Math.PI elsewhere)
    const fwdX = -Math.sin(theta);
    const fwdZ = -Math.cos(theta);
    target.position.set(pp.x + fwdX * 5, pp.y + 1.0, pp.z + fwdZ * 5);
    target.updateMatrixWorld();
  });

  if (!owned) return null;

  return (
    <>
      <spotLight
        ref={lightRef}
        intensity={active ? 5 : 0}
        angle={Math.PI / 6}
        penumbra={0.55}
        distance={active ? 18 : 0.1}  // never 0 — see file header
        decay={1.4}
        color="#FFF3CC"
        castShadow={false}
        target={targetRef.current ?? undefined}
      />
      <object3D ref={targetRef} />
    </>
  );
};

// ─── 3rd-person flashlight model — follows the RightHand bone ─────────────
// When the bone is provided, the model copies bone.matrixWorld so it sticks
// to the hand even while the pickup animation rotates the arm. Falls back to
// math offset when the bone isn't ready yet (first frame after avatar mount).
//
// IMPORTANT: the model is a sibling of the GLB in the React tree — NEVER a
// child of the bone. Attaching to the skeleton hierarchy reproduces the
// historical black-screen bug.
interface FlashlightModel3DProps {
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  rightHandBoneRef?: React.MutableRefObject<THREE.Bone | null>;
  active: boolean;
  owned: boolean;
  zoomLevel: number;
}

export const FlashlightModel3D: React.FC<FlashlightModel3DProps> = ({
  playerPositionRef,
  cameraThetaRef,
  rightHandBoneRef,
  active,
  owned,
  zoomLevel,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  // Pre-allocated decompose targets — zero GC per frame.
  const _pos = useRef(new THREE.Vector3());
  const _quat = useRef(new THREE.Quaternion());
  const _scl = useRef(new THREE.Vector3());

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!owned || zoomLevel < 0.5) { g.visible = false; return; }
    g.visible = true;

    const handBone = rightHandBoneRef?.current ?? null;
    if (handBone) {
      // Follow the right-hand bone. matrixWorld is already in world space
      // (the GLB's scale={[30,30,30]} is baked in), so decompose and copy.
      handBone.updateMatrixWorld(true);
      handBone.matrixWorld.decompose(_pos.current, _quat.current, _scl.current);
      g.position.copy(_pos.current);
      g.quaternion.copy(_quat.current);
      // The bone is scaled with the GLB. Cancel that so our model renders at
      // its mesh-level dimensions (radii of 4cm etc., not 30× of them).
      g.scale.set(1, 1, 1);
      return;
    }

    // Fallback: math offset from player position + camera azimuth.
    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;
    const fwdX = -Math.sin(theta);
    const fwdZ = -Math.cos(theta);
    const rightX = -Math.cos(theta);
    const rightZ =  Math.sin(theta);
    const sideDist = 0.30;
    const fwdDist = active ? 0.55 : 0.22;
    const yOffset = active ? 1.35 : 1.20;
    g.position.set(
      pp.x + fwdX * fwdDist + rightX * sideDist,
      pp.y + yOffset,
      pp.z + fwdZ * fwdDist + rightZ * sideDist,
    );
    g.rotation.set(0, Math.atan2(fwdX, fwdZ), 0);
    g.scale.set(1, 1, 1);
  });

  // The Mixamo RightHand bone's local Y points along the hand toward the
  // fingers. When we follow the bone via matrixWorld, the inner group's
  // +Y becomes "out of the palm". We rotate the model so its flashlight
  // axis aligns with that direction (and offset it slightly into the palm
  // so it visually sits ON the hand, not floating).
  return (
    <group ref={groupRef} visible={false}>
      <group position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {/* Body — cylinder along +Z after the parent rotation maps it to
            the hand's +Y direction. */}
        <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.22, 12]} />
          <meshStandardMaterial color="#1a1a1e" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.20]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.04, 0.07, 12]} />
          <meshStandardMaterial color="#2a2a2e" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.235]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial
            color={active ? '#FFF3CC' : '#888'}
            emissive={active ? '#FFF3CC' : '#222'}
            emissiveIntensity={active ? 2.0 : 0.15}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.236]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.05, 0.058, 16]} />
          <meshStandardMaterial color="#444" metalness={0.9} roughness={0.2} />
        </mesh>
        {active && (
          <pointLight position={[0, 0, 0.27]} intensity={0.2} distance={0.4} color="#FFF3CC" />
        )}
      </group>
    </group>
  );
};

// ─── First-person handheld view ────────────────────────────────────────────
interface FPFlashlightHandProps {
  active: boolean;
  owned: boolean;
  zoomLevel: number;
}

export const FPFlashlightHand: React.FC<FPFlashlightHandProps> = ({ active, owned, zoomLevel }) => {
  if (!owned || zoomLevel >= 0.5) return null;
  return (
    <div
      className="fixed bottom-0 right-[10%] z-[40] pointer-events-none select-none"
      style={{
        width: 130,
        height: 200,
      }}
    >
      <svg viewBox="0 0 130 200" width="100%" height="100%">
        {/* Hand */}
        <rect x="38" y="100" width="54" height="100" rx="14" fill="#C99A78" />
        <rect x="42" y="95" width="46" height="20" rx="6" fill="#B3825F" />
        {/* Flashlight body, angled slightly */}
        <g transform="translate(40,40) rotate(-10)">
          <rect x="14" y="0" width="22" height="64" rx="4" fill="#2a2a2e" />
          <rect x="10" y="-8" width="30" height="16" rx="4" fill="#3a3a3e" />
          <ellipse cx="25" cy="-8" rx="14" ry="5" fill={active ? '#FFF3CC' : '#222'}
                   style={{ filter: active ? 'drop-shadow(0 0 8px #FFE082)' : 'none' }} />
        </g>
        {active && (
          <ellipse cx="65" cy="20" rx="38" ry="10" fill="#FFE082" opacity="0.18">
            <animate attributeName="opacity" values="0.15;0.22;0.15" dur="1.8s" repeatCount="indefinite" />
          </ellipse>
        )}
      </svg>
    </div>
  );
};
