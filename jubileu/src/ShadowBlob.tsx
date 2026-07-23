import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ShadowBlob — a flat dark circle that follows the player on the ground.
 *
 * Not a real shadow (no shadow map cost). It's a single transparent disc
 * with depthWrite=false and additive alpha. Sits at Y=0.005 with depthTest
 * still enabled so the floor renders correctly on top.
 *
 * Lifesaver for grounding characters visually without paying the cost of
 * `castShadow={true}` on every mesh + a shadow map pass per light.
 *
 * Each blob is cheap (~32 triangles), so spawning one per remote player
 * and bot is still trivial.
 */
interface ShadowBlobProps {
  /** World-space position to follow. Reads .x and .z; Y is forced to 0.005. */
  positionRef: React.MutableRefObject<THREE.Vector3>;
  /** Radius in world units. Default 0.45 — feet-sized. */
  radius?: number;
  /** Opacity ceiling. Lower for distant / less-important entities. */
  opacity?: number;
  /** When far from the camera, hide entirely. Squared distance threshold. */
  cullDistSq?: number;
}

export const ShadowBlob: React.FC<ShadowBlobProps> = ({
  positionRef,
  radius = 0.45,
  opacity = 0.45,
  cullDistSq = 900, // 30m
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const geometry = useMemo(() => new THREE.CircleGeometry(radius, 16), [radius]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
  }), [opacity]);

  useFrame(() => {
    const m = meshRef.current;
    const p = positionRef.current;
    if (!m || !p) return;

    const dx = p.x - camera.position.x;
    const dz = p.z - camera.position.z;
    if (dx * dx + dz * dz > cullDistSq) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(p.x, 0.005, p.z);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={1}
    />
  );
};
