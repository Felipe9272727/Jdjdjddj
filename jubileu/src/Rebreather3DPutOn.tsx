/**
 * Rebreather3DPutOn.tsx — 3D cinematic of the player putting on the
 * rebreather + NV goggles. Mounts inside the Canvas, attached to the
 * camera.
 *
 * Animation (~2.0s total):
 *  0.00-0.30: Mask appears in front of camera (drift in from below,
 *             rotate slightly).
 *  0.30-1.10: Mask floats forward to camera face. Two procedural arm
 *             cylinders rise from the bottom of the frame and grip the
 *             strap loops.
 *  1.10-1.55: Mask "clicks" into place — slight scale wobble + brief
 *             white flash on the lens. Arms slide back down.
 *  1.55-2.00: Mask shrinks to 0 (player is "wearing" it now — actual
 *             NV vision is handled by NightVisionFx).
 *
 * Calls `onDone` when the cinematic completes. The parent uses this to
 * unfreeze the player and tick the night-vision-on state.
 *
 * NON-NEGOTIABLES:
 *  - `useFrame` priority MUST be 0.
 *  - Render order high + depthTest off so the mask draws over everything.
 *  - No mesh attached to bones, no SpotLight distance=0.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Rebreather3DPutOnProps {
  active: boolean;
  onDone: () => void;
}

export const Rebreather3DPutOn: React.FC<Rebreather3DPutOnProps> = ({
  active,
  onDone,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const maskRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const lensLeftMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const lensRightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashMatRef = useRef<THREE.SpriteMaterial>(null);

  const tRef = useRef({ t: 0, done: false });  // max 2.4s
  const { camera } = useThree();

  // Reset when active flips true
  useEffect(() => {
    if (active) {
      tRef.current.t = 0;
      tRef.current.done = false;
    }
  }, [active]);

  useFrame((_state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (!active) { g.visible = false; return; }
    g.visible = true;

    const safeDt = Math.min(dt, 0.033);
    const ts = tRef.current;
    ts.t = Math.min(2.4, ts.t + safeDt);
    const t = ts.t;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    // ── Mask — held at comfortable arm's-length, brought to face ────
    // Redesigned to feel like the character is actually putting it on:
    //  0.00-0.45: mask rises from below at arm's length (z=-0.65, scale 0.60)
    //  0.45-1.40: slowly floats toward face (z=-0.50→-0.42, scale 0.60→0.70)
    //  1.40-1.80: snaps onto face — scale bump + flash
    //  1.80-2.40: shrinks away (player is wearing it)
    const mask = maskRef.current;
    if (mask) {
      let z = -0.65, y = -0.20, scale = 0, rotX = 0, rotZ = 0;

      if (t < 0.45) {
        const u = t / 0.45;
        const e = u * u * (3 - 2 * u);
        scale = e * 0.62;
        y = -0.45 + e * 0.25;
        z = -0.70 + e * 0.08;
        rotX = (1 - e) * 0.30;
      } else if (t < 1.40) {
        const u = (t - 0.45) / 0.95;
        const e = u * u * (3 - 2 * u);
        scale = 0.62 + e * 0.10;
        y = -0.20 + e * 0.08;
        z = -0.62 + e * 0.20;   // moves from -0.62 to -0.42
        rotX = -e * 0.06;
      } else if (t < 1.80) {
        const u = (t - 1.40) / 0.40;
        const wobble = Math.sin(u * Math.PI * 2.5) * 0.035 * (1 - u);
        scale = 0.72 + wobble;
        y = -0.12;
        z = -0.42;
        rotZ = Math.sin(u * Math.PI * 3) * 0.018 * (1 - u);
      } else {
        const u = (t - 1.80) / 0.60;
        const e = u * u * (3 - 2 * u);
        scale = 0.72 * (1 - e);
        y = -0.12;
        z = -0.42;
      }

      mask.position.set(0, y, z);
      mask.scale.setScalar(Math.max(0, scale));
      mask.rotation.x = rotX;
      mask.rotation.z = rotZ;
    }

    // ── Arms — rise naturally from sides to hold the mask ──────────
    const armPose = (ref: React.MutableRefObject<THREE.Group | null>, isLeft: boolean) => {
      const arm = ref.current;
      if (!arm) return;
      let visible = t >= 0.30;
      let yLift = -0.85, zLift = -0.50, pitch = -0.35;

      if (t >= 0.30 && t < 0.70) {
        const u = (t - 0.30) / 0.40;
        const e = u * u * (3 - 2 * u);
        yLift = -0.85 + e * 0.58;
        zLift = -0.50 + e * 0.12;
        pitch = -0.35 + e * 0.50;
      } else if (t >= 0.70 && t < 1.40) {
        // Hold mask steady with slight breathing micro-movement
        const u = (t - 0.70) / 0.70;
        yLift = -0.27 + Math.sin(u * Math.PI * 2) * 0.012;
        zLift = -0.38;
        pitch = 0.15;
      } else if (t >= 1.40 && t < 1.80) {
        // Tighten straps
        const u = (t - 1.40) / 0.40;
        yLift = -0.27 - u * 0.04;
        zLift = -0.38 + u * 0.03;
        pitch = 0.15 - u * 0.04;
      } else if (t >= 1.80) {
        // Slide back off screen
        const u = (t - 1.80) / 0.45;
        const e = u * u * (3 - 2 * u);
        yLift = -0.31 - e * 0.55;
        zLift = -0.35 - e * 0.08;
        pitch = 0.11 - e * 0.46;
      }

      arm.visible = visible;
      arm.position.set(isLeft ? -0.18 : 0.18, yLift, zLift);
      arm.rotation.set(pitch, 0, isLeft ? 0.12 : -0.12);
    };
    armPose(armLRef, true);
    armPose(armRRef, false);

    // ── Flash on snap ─────────────────────────────────────────────
    if (flashMatRef.current) {
      let op = 0;
      if (t >= 1.40 && t < 1.72) {
        const u = (t - 1.40) / 0.32;
        op = (1 - u) * 0.85;
      }
      flashMatRef.current.opacity = op;
    }

    // ── Goggles light up when they snap on ───────────────────────
    if (lensLeftMatRef.current && lensRightMatRef.current) {
      let emI = 0.5;
      if (t >= 1.40) {
        const u = THREE.MathUtils.clamp((t - 1.40) / 0.30, 0, 1);
        emI = 0.5 + u * 1.8;
      }
      lensLeftMatRef.current.emissiveIntensity = emI;
      lensRightMatRef.current.emissiveIntensity = emI;
    }

    if (t >= 2.4 && !ts.done) {
      ts.done = true;
      onDone();
    }
  });

  // ─── Materials ──────────────────────────────────────────────────────
  // depthTest=false + renderOrder=999 + frustumCulled=false keeps the
  // mask drawing over the whole scene like a viewmodel.
  const matFrame = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0E7490', roughness: 0.45, metalness: 0.55,
    depthTest: false, transparent: true,
  }), []);
  const matGlass = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#67E8F9', emissive: '#0e7490', emissiveIntensity: 0.6,
    roughness: 0.15, metalness: 0.2,
    transparent: true, opacity: 0.85, toneMapped: false,
    depthTest: false,
  }), []);
  const matStrap = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1a1a', roughness: 0.85, depthTest: false, transparent: true,
  }), []);
  const matGoggleHousing = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0E7490', roughness: 0.5, metalness: 0.45,
    depthTest: false, transparent: true,
  }), []);
  const matLensLeft = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a3a2a', emissive: '#10B981', emissiveIntensity: 0.7,
    roughness: 0.25, toneMapped: false,
    depthTest: false, transparent: true,
  }), []);
  const matLensRight = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a3a2a', emissive: '#10B981', emissiveIntensity: 0.7,
    roughness: 0.25, toneMapped: false,
    depthTest: false, transparent: true,
  }), []);
  const matSkin = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#C99A78', roughness: 0.75,
    depthTest: false, transparent: true,
  }), []);
  const matSleeve = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1a1a', roughness: 0.8,
    depthTest: false, transparent: true,
  }), []);

  return (
    <group ref={groupRef} visible={false} renderOrder={999} frustumCulled={false}>
      {/* MASK — children render in front of camera. The whole group is
          parented to the camera each frame via copy. */}
      <group ref={maskRef} renderOrder={999}>
        {/* Frame body */}
        <mesh material={matFrame} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.42, 0.30, 0.22]} />
        </mesh>
        {/* Soft inner cushion ring (faux) */}
        <mesh position={[0, 0, 0.005]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.40, 0.28, 0.04]} />
        </mesh>
        {/* Big glass viewport */}
        <mesh position={[0, 0, 0.115]} material={matGlass} renderOrder={1000} frustumCulled={false}>
          <boxGeometry args={[0.34, 0.22, 0.02]} />
        </mesh>
        {/* Highlight on glass */}
        <mesh position={[-0.06, 0.05, 0.13]} renderOrder={1001} frustumCulled={false}>
          <boxGeometry args={[0.08, 0.04, 0.005]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} toneMapped={false} depthTest={false} />
        </mesh>
        {/* Strap loops */}
        <mesh position={[-0.23, 0, 0]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.04, 0.12, 0.05]} />
        </mesh>
        <mesh position={[ 0.23, 0, 0]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.04, 0.12, 0.05]} />
        </mesh>
        {/* Breathing tube exit */}
        <mesh position={[0.05, -0.18, 0.03]} material={matFrame} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.09, 0.10, 0.07]} />
        </mesh>
        {/* NV goggles clipped on top */}
        <group position={[0, 0.18, 0.06]}>
          <mesh position={[-0.11, 0, 0]} material={matGoggleHousing} renderOrder={999} frustumCulled={false}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
          </mesh>
          <mesh position={[ 0.11, 0, 0]} material={matGoggleHousing} renderOrder={999} frustumCulled={false}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
          </mesh>
          <mesh position={[-0.11, 0, 0.064]} renderOrder={1000} frustumCulled={false}>
            <boxGeometry args={[0.085, 0.085, 0.02]} />
            <primitive object={matLensLeft} attach="material" ref={lensLeftMatRef} />
          </mesh>
          <mesh position={[ 0.11, 0, 0.064]} renderOrder={1000} frustumCulled={false}>
            <boxGeometry args={[0.085, 0.085, 0.02]} />
            <primitive object={matLensRight} attach="material" ref={lensRightMatRef} />
          </mesh>
        </group>
        {/* Click flash sprite */}
        <sprite position={[0, 0, 0.20]} scale={[1.2, 1.2, 1]} renderOrder={1002} frustumCulled={false}>
          <spriteMaterial
            ref={flashMatRef}
            color="#A7F3D0"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>

      {/* ARMS — procedural blocky forearms + gloved hands rise from below.
          Built along +Y by default; rotated via parent group `armPose`. */}
      <group ref={armLRef} visible={false} renderOrder={998}>
        {/* Forearm sleeve */}
        <mesh position={[0, -0.05, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.038, 0.045, 0.22, 12]} />
        </mesh>
        {/* Hand (glove) */}
        <mesh position={[0, 0.10, 0]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <boxGeometry args={[0.06, 0.10, 0.08]} />
        </mesh>
      </group>
      <group ref={armRRef} visible={false} renderOrder={998}>
        <mesh position={[0, -0.05, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.038, 0.045, 0.22, 12]} />
        </mesh>
        <mesh position={[0, 0.10, 0]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <boxGeometry args={[0.06, 0.10, 0.08]} />
        </mesh>
      </group>
    </group>
  );
};
