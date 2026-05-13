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

// ─── 3rd-person flashlight model (right-hand area, offset-based) ──────────
interface FlashlightModel3DProps {
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  active: boolean;
  owned: boolean;
  zoomLevel: number;
}

export const FlashlightModel3D: React.FC<FlashlightModel3DProps> = ({
  playerPositionRef,
  cameraThetaRef,
  active,
  owned,
  zoomLevel,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!owned || zoomLevel < 0.5) { g.visible = false; return; }
    g.visible = true;

    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;
    // Right-hand offset: player facing direction + side offset
    const rightAngle = theta - Math.PI / 2;
    const sideDist = 0.32;
    const fwdDist = 0.18;
    g.position.set(
      pp.x + (-Math.sin(theta) * fwdDist) + Math.sin(rightAngle) * sideDist,
      pp.y + 1.05,
      pp.z + (-Math.cos(theta) * fwdDist) + Math.cos(rightAngle) * sideDist,
    );
    g.rotation.y = theta + Math.PI;
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Body */}
      <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.17, 10]} />
        <meshStandardMaterial color="#2a2a2e" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.028, 0.05, 10]} />
        <meshStandardMaterial color="#3a3a3e" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0, -0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.032, 16]} />
        <meshStandardMaterial
          color={active ? '#FFF3CC' : '#222'}
          emissive={active ? '#FFF3CC' : '#000'}
          emissiveIntensity={active ? 1.6 : 0}
          toneMapped={false}
        />
      </mesh>
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
