import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Flashlight Light System ─────────────────────────────────────────────
// Renders a SpotLight that follows the player and camera direction.
// Also renders a small 3D flashlight model on the player's "hand"
// in third-person view. In first-person, only the light beam is visible.

interface FlashlightLightProps {
  active: boolean;
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  zoomLevel: number;
  nightMode: boolean;
}

export const FlashlightLight: React.FC<FlashlightLightProps> = ({
  active,
  playerPositionRef,
  cameraThetaRef,
  zoomLevel,
  nightMode,
}) => {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const flashlightGroupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Intensity depends on ambient light level: brighter in dark scenes
  const intensity = active ? (nightMode ? 8 : 3) : 0;
  const fp = zoomLevel < 0.5;

  useFrame(() => {
    if (!lightRef.current || !targetRef.current || !flashlightGroupRef.current) return;
    if (!active) {
      lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.15);
      flashlightGroupRef.current.visible = false;
      return;
    }

    lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, intensity, 0.12);
    flashlightGroupRef.current.visible = true;

    // Position the light at player head height
    const p = playerPositionRef.current;
    const headY = p.y + 1.5;
    lightRef.current.position.set(p.x, headY, p.z);

    // Point in camera direction
    const theta = cameraThetaRef.current;
    const dist = 5;
    targetRef.current.position.set(
      p.x - Math.sin(theta) * dist,
      headY - 0.5,
      p.z - Math.cos(theta) * dist
    );

    // Position the 3D flashlight model relative to the player
    // In third-person: show it in the player's hand
    // In first-person: don't show the model (the light beam is enough)
    if (!fp) {
      const handOffsetX = -Math.sin(theta + 0.5) * 0.5;
      const handOffsetZ = -Math.cos(theta + 0.5) * 0.5;
      flashlightGroupRef.current.position.set(
        p.x + handOffsetX,
        headY - 0.4,
        p.z + handOffsetZ
      );
      flashlightGroupRef.current.rotation.y = theta + Math.PI;
    } else {
      flashlightGroupRef.current.visible = false;
    }
  });

  return (
    <>
      <spotLight
        ref={lightRef}
        angle={0.45}
        penumbra={0.5}
        decay={2}
        distance={nightMode ? 25 : 15}
        color="#FFF9C4"
        intensity={0}
        castShadow={false}
        target={targetRef.current || undefined}
      />
      <object3D ref={targetRef} />
      {/* 3D Flashlight model in player's hand (3rd person) */}
      <group ref={flashlightGroupRef} visible={false}>
        {/* Handle */}
        <mesh position={[0.15, -0.05, 0.1]}>
          <cylinderGeometry args={[0.03, 0.035, 0.2, 8]} />
          <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Head */}
        <mesh position={[0.15, 0.08, 0.1]}>
          <cylinderGeometry args={[0.05, 0.03, 0.08, 8]} />
          <meshStandardMaterial color="#444444" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Lens glow */}
        {active && (
          <mesh position={[0.15, 0.12, 0.1]}>
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial color="#FFF9C4" toneMapped={false} />
          </mesh>
        )}
      </group>
    </>
  );
};

// ─── First-Person Hand + Item ────────────────────────────────────────────
// Renders a procedural arm holding the flashlight in front of the camera
// for first-person view. The arm bobs when walking.

interface FPHandProps {
  active: boolean;
  walking: boolean;
  item: 'flashlight' | 'cookie' | null;
}

export const FPHand: React.FC<FPHandProps> = ({ active, walking, item }) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const { camera } = useThree();

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    if (!active || !item) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    timeRef.current += dt;

    // Position relative to camera
    const cam = camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // Offset: slightly right and down from center of view
    const right = new THREE.Vector3();
    right.crossVectors(dir, cam.up).normalize();

    const offset = new THREE.Vector3()
      .copy(cam.position)
      .addScaledVector(dir, 0.5)  // 0.5 units forward
      .addScaledVector(right, 0.25) // slightly right
      .add(new THREE.Vector3(0, -0.3, 0)); // slightly down

    // Walking bob
    const bobX = walking ? Math.sin(timeRef.current * 8) * 0.008 : 0;
    const bobY = walking ? Math.abs(Math.sin(timeRef.current * 8)) * 0.006 : 0;

    groupRef.current.position.copy(offset).add(new THREE.Vector3(bobX, bobY, 0));

    // Rotate to face camera direction
    groupRef.current.quaternion.copy(cam.quaternion);
    // Tilt the hand slightly for natural pose
    groupRef.current.rotateX(-0.3);
    groupRef.current.rotateY(0.2);
  });

  return (
    <group ref={groupRef} visible={false}>
      {item === 'flashlight' && (
        <>
          {/* Arm */}
          <mesh position={[0, -0.08, -0.12]}>
            <cylinderGeometry args={[0.025, 0.03, 0.25, 8]} />
            <meshStandardMaterial color="#FFCCAA" roughness={0.8} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, 0.02, -0.02]}>
            <boxGeometry args={[0.06, 0.04, 0.08]} />
            <meshStandardMaterial color="#FFCCAA" roughness={0.8} />
          </mesh>
          {/* Flashlight body */}
          <mesh position={[0, 0.02, 0.06]}>
            <cylinderGeometry args={[0.025, 0.03, 0.18, 8]} />
            <meshStandardMaterial color="#333333" roughness={0.3} metalness={0.8} />
          </mesh>
          {/* Flashlight head */}
          <mesh position={[0, 0.02, 0.16]}>
            <cylinderGeometry args={[0.04, 0.025, 0.06, 8]} />
            <meshStandardMaterial color="#444444" roughness={0.2} metalness={0.9} />
          </mesh>
          {/* Lens glow */}
          {active && (
            <mesh position={[0, 0.02, 0.19]}>
              <circleGeometry args={[0.035, 16]} />
              <meshBasicMaterial color="#FFF9C4" toneMapped={false} />
            </mesh>
          )}
        </>
      )}
      {item === 'cookie' && (
        <>
          {/* Arm */}
          <mesh position={[0, -0.08, -0.12]}>
            <cylinderGeometry args={[0.025, 0.03, 0.25, 8]} />
            <meshStandardMaterial color="#FFCCAA" roughness={0.8} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, 0.02, -0.02]}>
            <boxGeometry args={[0.06, 0.04, 0.08]} />
            <meshStandardMaterial color="#FFCCAA" roughness={0.8} />
          </mesh>
          {/* Cookie */}
          <mesh position={[0, 0.04, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.012, 16]} />
            <meshStandardMaterial color="#C68B59" roughness={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
};
