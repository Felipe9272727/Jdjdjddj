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
  const coneRef = useRef<THREE.Mesh>(null);
  // Memoize geometry/material for the volumetric cone — recreating these
  // each render would churn GPU resources.
  const coneGeo = useMemo(() => {
    // ConeGeometry has its apex at +Y/2 and base at -Y/2 by default.
    // We want the apex pointing forward (-Z after rotation in JSX).
    return new THREE.ConeGeometry(1.4, 6, 24, 1, true);
  }, []);
  const coneMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xFFE9A8,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  useFrame(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    const cone = coneRef.current;
    if (!light || !target) return;

    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;

    // Light origin near the player's head/hand, pointing where the camera looks.
    light.position.set(pp.x, pp.y + 1.45, pp.z);
    const fwdX = -Math.sin(theta);
    const fwdZ = -Math.cos(theta);
    target.position.set(pp.x + fwdX * 5, pp.y + 1.0, pp.z + fwdZ * 5);
    target.updateMatrixWorld();

    // Position the volumetric cone: apex at the light origin, axis along
    // the same direction as the spotlight.
    if (cone) {
      cone.visible = active;
      if (active) {
        cone.position.set(pp.x + fwdX * 3, pp.y + 1.2, pp.z + fwdZ * 3);
        // Point the cone's local -Y (base→apex direction) toward (-fwd).
        // lookAt orients local -Z toward the target, so we look "away from"
        // the light and then add a 90° pitch to align local axes.
        cone.lookAt(pp.x + fwdX * 6, pp.y + 0.5, pp.z + fwdZ * 6);
        cone.rotateX(Math.PI / 2);
      }
    }
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
      {/* Volumetric cone — additive translucent mesh that fakes the
          "dust in the air" beam without a real volumetric shader. */}
      <mesh ref={coneRef} geometry={coneGeo} material={coneMat} visible={false} renderOrder={500} />
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
  /** The avatar's body rotation Y (charRot.y in Player.tsx). In third person
   *  this lerps toward movement direction, NOT the camera azimuth. Used as
   *  fallback when no handAnchor is wired. */
  playerRotationYRef?: React.MutableRefObject<number>;
  /** Object3D anchor attached as a child of the RightHand bone inside the
   *  avatar's skeleton. Its matrixWorld gives us position + rotation in one
   *  shot — perfectly tracks the hand even during the pickup arm rotation. */
  rightHandAnchorRef?: React.MutableRefObject<THREE.Object3D | null>;
  active: boolean;
  owned: boolean;
  zoomLevel: number;
}

export const FlashlightModel3D: React.FC<FlashlightModel3DProps> = ({
  playerPositionRef,
  cameraThetaRef,
  playerRotationYRef,
  rightHandAnchorRef,
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

    const anchor = rightHandAnchorRef?.current ?? null;
    if (anchor) {
      // Anchor is an Object3D living inside the RightHand bone. Its
      // matrixWorld already encodes the full transform: position (where
      // the hand is in world) + rotation (how the hand is oriented).
      // updateWorldMatrix walks UP through the bone chain → avatar → player
      // group, so the matrix reflects this frame's animation + pickup.
      anchor.updateWorldMatrix(true, false);
      anchor.matrixWorld.decompose(_pos.current, _quat.current, _scl.current);
      g.position.copy(_pos.current);
      g.quaternion.copy(_quat.current);
      // Bone scale (the GLB primitive uses scale 30) is encoded too. The
      // flashlight model is sized in real-world meters, so cancel the
      // inherited scale.
      g.scale.set(1, 1, 1);
      return;
    }

    // Fallback path — only when the anchor hasn't been wired yet (first
    // frames after avatar mount). Uses player rotation if available.
    let facing: number;
    if (playerRotationYRef && Number.isFinite(playerRotationYRef.current)) {
      facing = playerRotationYRef.current;
    } else {
      const theta = cameraThetaRef.current;
      facing = Math.atan2(-Math.sin(theta), -Math.cos(theta));
    }

    // Fallback: math offset from player position + facing direction.
    const pp = playerPositionRef.current;
    const fwdX = -Math.sin(facing);
    const fwdZ = -Math.cos(facing);
    const rightX = -Math.cos(facing);
    const rightZ =  Math.sin(facing);
    const sideDist = 0.30;
    const fwdDist = active ? 0.55 : 0.22;
    const yOffset = active ? 1.35 : 1.20;
    g.position.set(
      pp.x + fwdX * fwdDist + rightX * sideDist,
      pp.y + yOffset,
      pp.z + fwdZ * fwdDist + rightZ * sideDist,
    );
    // Same +π as the bone path — lens points forward instead of backward.
    g.rotation.set(0, facing + Math.PI, 0);
    g.scale.set(1, 1, 1);
  });

  // The outer group is positioned at the hand and rotated so its +Z points
  // in the player's facing direction. We just need to lay the model along
  // that axis. Cylinders default to lying along +Y, so each gets a 90°
  // pitch rotation. A tiny right/up offset (in player-local space) places
  // the model on top of the hand instead of inside the wrist.
  // Model is built along +Y axis (cylinder default). With the handAnchor
  // path, the group inherits the bone's orientation — Mixamo RightHand
  // bone's +Y points toward the fingertips, so cylinder Y aligns with
  // finger direction. The body extends from the grip (y≈0, in the palm)
  // toward the lens (y≈+0.30, past the fingertips).
  //
  // Detailing (matches the project's liminal/horror tone):
  //  - Matte black grip (knurled look via a darker ring)
  //  - Brushed metal head (slightly wider, brighter)
  //  - Glass lens with strong emissive when on, slight ambient sheen when off
  //  - Halo sprite when on, for that "dust catching the beam" feel
  return (
    <group ref={groupRef} visible={false}>
      {/* Grip — slightly tapered, darker rubbery feel */}
      <mesh position={[0, 0.10, 0]}>
        <cylinderGeometry args={[0.038, 0.042, 0.18, 16]} />
        <meshStandardMaterial color="#15151a" metalness={0.25} roughness={0.85} />
      </mesh>
      {/* Knurl ring — visual texture without UVs */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.0425, 0.0425, 0.015, 24]} />
        <meshStandardMaterial color="#000" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.043, 0.043, 0.015, 24]} />
        <meshStandardMaterial color="#000" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Body — brushed steel section, slightly wider */}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.046, 0.044, 0.06, 16]} />
        <meshStandardMaterial color="#2a2a2e" metalness={0.85} roughness={0.30} />
      </mesh>
      {/* Head bezel — widest part, satin */}
      <mesh position={[0, 0.265, 0]}>
        <cylinderGeometry args={[0.060, 0.048, 0.04, 18]} />
        <meshStandardMaterial color="#3a3a3e" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Lens — the bright disc */}
      <mesh position={[0, 0.286, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.054, 24]} />
        <meshStandardMaterial
          color={active ? '#FFF3CC' : '#3a3a3a'}
          emissive={active ? '#FFF3CC' : '#1a1a1a'}
          emissiveIntensity={active ? 2.5 : 0.10}
          toneMapped={false}
        />
      </mesh>
      {/* Outer rim ring — gives the lens a finished bezel */}
      <mesh position={[0, 0.287, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.054, 0.062, 24]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.95} roughness={0.18} />
      </mesh>
      {/* Halo billboard — soft glow that catches the camera */}
      {active && (
        <sprite position={[0, 0.30, 0]} scale={[0.4, 0.4, 1]}>
          <spriteMaterial
            color="#FFE9A8"
            transparent
            opacity={0.55}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      )}
      {active && (
        <pointLight position={[0, 0.34, 0]} intensity={0.25} distance={0.5} color="#FFF3CC" />
      )}
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
