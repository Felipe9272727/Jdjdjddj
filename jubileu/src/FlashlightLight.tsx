import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ─── FlashlightLight: SpotLight that follows player + camera direction ────
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
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const intensityRef = useRef(0);

  const targetIntensity = active ? (nightMode ? 8 : 3) : 0;
  const targetDistance = active ? (nightMode ? 25 : 15) : 0;

  // Reuse vector objects to avoid GC
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _targetPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const spot = spotRef.current;
    const target = targetRef.current;
    if (!spot || !target) return;

    // Smooth intensity lerp
    const lerpSpeed = 5 * dt;
    intensityRef.current = THREE.MathUtils.lerp(intensityRef.current, targetIntensity, lerpSpeed);
    spot.intensity = intensityRef.current;

    // Smooth distance lerp
    spot.distance = THREE.MathUtils.lerp(spot.distance, targetDistance, lerpSpeed);

    // Position the spotlight at the player's head
    const pp = playerPositionRef.current;
    const headY = 1.6;
    spot.position.set(pp.x, headY, pp.z);

    // Target follows camera direction
    const theta = cameraThetaRef.current;
    const lookDist = 5;
    _dir.set(-Math.sin(theta), -0.15, -Math.cos(theta)).normalize();
    _targetPos.set(pp.x + _dir.x * lookDist, headY + _dir.y * lookDist, pp.z + _dir.z * lookDist);
    target.position.copy(_targetPos);
    spot.target = target;
  });

  return (
    <>
      <spotLight
        ref={spotRef}
        color="#FFF9C4"
        angle={0.45}
        penumbra={0.5}
        decay={2}
        distance={0}
        intensity={0}
        position={[0, 1.6, 0]}
      />
      <object3D ref={targetRef} position={[0, 1.6, -5]} />
    </>
  );
};

// ─── FlashlightModel3D: 3rd-person flashlight near player's hand ─────────
interface FlashlightModel3DProps {
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  cameraThetaRef: React.MutableRefObject<number>;
  active: boolean;
  zoomLevel: number;
}

export const FlashlightModel3D: React.FC<FlashlightModel3DProps> = ({
  playerPositionRef,
  cameraThetaRef,
  active,
  zoomLevel,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // Hand offset relative to player position (approximated right-hand position)
  const _offset = useMemo(() => new THREE.Vector3(), []);
  const _pos = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    // Hide in 1st person
    if (zoomLevel < 0.5) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const pp = playerPositionRef.current;
    const theta = cameraThetaRef.current;

    // Right-hand side offset: rotate offset by player's facing direction
    const rightAngle = theta - Math.PI / 2;
    const sideDist = 0.35;
    const fwdDist = 0.2;
    _offset.set(
      -Math.sin(theta) * fwdDist + Math.sin(rightAngle) * sideDist,
      0.75,
      -Math.cos(theta) * fwdDist + Math.cos(rightAngle) * sideDist,
    );
    _pos.copy(pp).add(_offset);
    g.position.copy(_pos);

    // Face the camera direction
    g.rotation.y = theta + Math.PI;
  });

  return (
    <group ref={groupRef}>
      {/* Flashlight body */}
      <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
        <meshStandardMaterial color="#2a2a2e" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Flashlight head (wider) */}
      <mesh position={[0, 0, -0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.028, 0.06, 8]} />
        <meshStandardMaterial color="#3a3a3e" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0, -0.215]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.032, 12]} />
        <meshStandardMaterial
          color={active ? '#FFF9C4' : '#333'}
          emissive={active ? '#FFF9C4' : '#000'}
          emissiveIntensity={active ? 2 : 0}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

// ─── FPFlashlightHand: 1st-person arm + flashlight ───────────────────────
interface FPFlashlightHandProps {
  walking: boolean;
  active: boolean;
}

export const FPFlashlightHand: React.FC<FPFlashlightHandProps> = ({ walking, active }) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    const g = groupRef.current;
    if (!g) return;

    if (walking) {
      const t = timeRef.current;
      g.position.x = 0.25 + Math.sin(t * 8) * 0.008;
      g.position.y = -0.3 + Math.abs(Math.sin(t * 8)) * 0.006;
    } else {
      // Smoothly return to default
      g.position.x = THREE.MathUtils.lerp(g.position.x, 0.25, 5 * dt);
      g.position.y = THREE.MathUtils.lerp(g.position.y, -0.3, 5 * dt);
    }
  });

  return (
    <group ref={groupRef} position={[0.25, -0.3, -0.5]} rotation={[0.2, -0.3, 0]}>
      {/* Arm */}
      <mesh position={[0, -0.08, 0.12]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.035, 0.32, 8]} />
        <meshStandardMaterial color="#E8B88A" roughness={0.9} metalness={0} />
      </mesh>
      {/* Hand */}
      <mesh position={[0, -0.04, -0.03]} rotation={[0.3, 0, 0]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#E8B88A" roughness={0.9} metalness={0} />
      </mesh>
      {/* Flashlight body */}
      <group position={[0, 0.01, -0.05]} rotation={[0.4, 0, 0]}>
        {/* Main body */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
          <meshStandardMaterial color="#2a2a2e" metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Grip ridges (3 thin rings) */}
        {[0.03, 0.05, 0.07].map((z, i) => (
          <mesh key={i} position={[0, 0, z]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.012, 8]} />
            <meshStandardMaterial color="#1a1a1e" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
        {/* Rubber grip section */}
        <mesh position={[0, 0, 0.055]}>
          <cylinderGeometry args={[0.024, 0.024, 0.06, 8]} />
          <meshStandardMaterial color="#1a1a1e" metalness={0.3} roughness={0.8} />
        </mesh>
        {/* Head / reflector */}
        <mesh position={[0, 0, -0.1]}>
          <cylinderGeometry args={[0.032, 0.024, 0.05, 8]} />
          <meshStandardMaterial color="#3a3a3e" metalness={0.75} roughness={0.2} />
        </mesh>
        {/* Switch button */}
        <mesh position={[0.024, 0, 0.02]}>
          <boxGeometry args={[0.01, 0.008, 0.025]} />
          <meshStandardMaterial color="#555" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Lens */}
        <mesh position={[0, 0, -0.128]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.03, 12]} />
          <meshStandardMaterial
            color={active ? '#FFF9C4' : '#555'}
            emissive={active ? '#FFF9C4' : '#000'}
            emissiveIntensity={active ? 3 : 0}
            toneMapped={false}
          />
        </mesh>
        {/* Glow ring around lens */}
        <mesh position={[0, 0, -0.126]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.028, 0.035, 12]} />
          <meshStandardMaterial
            color="#FFE082"
            emissive="#FFE082"
            emissiveIntensity={active ? 1 : 0}
            transparent
            opacity={active ? 0.6 : 0.2}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
};
