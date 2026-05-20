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
  // Spring state for snap-scale overshoot
  const scaleSpring = useRef({ pos: 0, vel: 0, kicked: false });
  // Camera shake: decaying sinusoidal offset applied after camera.position copy
  const shakeRef = useRef({ x: 0, y: 0 });
  const { camera } = useThree();

  // Reset when active flips true
  useEffect(() => {
    if (active) {
      tRef.current.t = 0;
      tRef.current.done = false;
      scaleSpring.current.pos = 0;
      scaleSpring.current.vel = 0;
      scaleSpring.current.kicked = false;
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
    // Apply decaying camera shake after copy (world-space offset reads as screen shake)
    {
      const shakeAge = t - 1.40;
      if (shakeAge >= 0 && shakeAge < 0.50) {
        const decay = Math.exp(-shakeAge * 11.0);
        shakeRef.current.x = Math.sin(shakeAge * 28.0) * 0.009 * decay;
        shakeRef.current.y = Math.sin(shakeAge * 21.0 + 1.4) * 0.006 * decay;
      } else {
        shakeRef.current.x = 0;
        shakeRef.current.y = 0;
      }
      g.position.x += shakeRef.current.x;
      g.position.y += shakeRef.current.y;
    }

    // ── Mask — held at comfortable arm's-length, brought to face ────
    //  0.00-0.45: pendulum swing up from below (x oscillation + rotZ damping)
    //  0.45-1.40: micro-tremor hold at arm's length (multi-freq noise)
    //  1.40-1.55: SNAP — spring scale punch from 0.72 → 0.90 → settle
    //  1.55-1.80: hold on face, goggles glow settles
    //  1.80-2.40: shrinks away (player wearing it now)
    const mask = maskRef.current;
    if (mask) {
      let z = -0.65, y = -0.20, scale = 0, rotX = 0, rotZ = 0, rotY = 0, xPos = 0;

      if (t < 0.45) {
        const u = t / 0.45;
        const e = u * u * (3 - 2 * u);
        // Pendulum: x-swing damps to zero as it rises
        const swing = Math.sin(u * Math.PI * 1.6) * (1 - u) * 0.10;
        scale = e * 0.62;
        y = -0.48 + e * 0.28;
        z = -0.70 + e * 0.08;
        rotX = (1 - e) * 0.35;
        rotZ = swing * 1.4;
        rotY = swing * 0.5;
        xPos = swing;
      } else if (t < 1.40) {
        const u = (t - 0.45) / 0.95;
        const e = u * u * (3 - 2 * u);
        // Multi-frequency micro-tremor — nervous hands
        const trX = Math.sin(t * 17.3) * 0.0030 + Math.sin(t * 11.1) * 0.0018;
        const trY = Math.sin(t * 13.7 + 1.2) * 0.0025 + Math.sin(t * 8.3 + 2.1) * 0.0014;
        const trZ = Math.sin(t * 9.4) * 0.0040;
        scale = 0.62 + e * 0.10;
        y = -0.20 + e * 0.08 + trY;
        z = -0.62 + e * 0.20;
        rotX = -e * 0.06;
        rotZ = trZ;
        xPos = trX;
      } else if (t < 1.80) {
        // Spring-based scale punch on snap
        const age = t - 1.40;
        if (!scaleSpring.current.kicked) {
          // Impulse: kick velocity up hard, exactly once, at the snap
          scaleSpring.current.kicked = true;
          scaleSpring.current.pos = 0.72;
          scaleSpring.current.vel = 9.0;
        }
        // Tight spring k=55, d=7 → sharp pop + settle
        scaleSpring.current.vel += ((0.72 - scaleSpring.current.pos) * 55 - scaleSpring.current.vel * 7) * safeDt;
        scaleSpring.current.pos += scaleSpring.current.vel * safeDt;
        scale = THREE.MathUtils.clamp(scaleSpring.current.pos, 0.40, 1.00);
        y = -0.12;
        z = -0.42;
        rotZ = Math.sin(age * Math.PI * 4) * 0.015 * Math.exp(-age * 8);
      } else {
        const u = (t - 1.80) / 0.60;
        const e = u * u * (3 - 2 * u);
        scale = 0.72 * (1 - e);
        y = -0.12;
        z = -0.42;
      }

      mask.position.set(xPos, y, z);
      mask.scale.setScalar(Math.max(0, scale));
      mask.rotation.set(rotX, rotY, rotZ);
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
        // Hold with multi-freq tremor matching the mask's nervous hands
        const micro = Math.sin(t * 16.5) * 0.0040 + Math.sin(t * 9.8 + 1.6) * 0.0025;
        yLift = -0.27 + Math.sin((t - 0.70) * Math.PI * 2 / 0.70) * 0.010 + micro;
        zLift = -0.38;
        pitch = 0.15 + micro * 0.4;
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

    // ── Flash on snap — bright instant pop then fast fade ────────
    if (flashMatRef.current) {
      let op = 0;
      if (t >= 1.40 && t < 1.75) {
        const age = t - 1.40;
        // Instant peak at t=1.40, exponential decay
        op = Math.exp(-age * 9.0) * 1.10;
      }
      flashMatRef.current.opacity = op;
    }

    // ── Goggles light up: big burst then settle ───────────────────
    if (lensLeftMatRef.current && lensRightMatRef.current) {
      let emI = 0.5;
      if (t >= 1.40) {
        const age = t - 1.40;
        // Spike to 14.0 immediately, decay to 3.0 settle over 0.60s
        const burst = Math.exp(-age * 7.0) * 11.0;
        const settle = THREE.MathUtils.clamp(age / 0.55, 0, 1) * 3.0;
        emI = 0.5 + burst + settle;
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
          <boxGeometry args={[0.44, 0.32, 0.22]} />
        </mesh>
        {/* Recessed cushion ring */}
        <mesh position={[0, 0, 0.005]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <boxGeometry args={[0.41, 0.29, 0.05]} />
        </mesh>
        {/* Big glass viewport */}
        <mesh position={[0, 0, 0.118]} material={matGlass} renderOrder={1000} frustumCulled={false}>
          <boxGeometry args={[0.32, 0.20, 0.022]} />
        </mesh>
        {/* Primary highlight on glass */}
        <mesh position={[-0.07, 0.055, 0.134]} renderOrder={1001} frustumCulled={false}>
          <boxGeometry args={[0.08, 0.035, 0.004]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.80} toneMapped={false} depthTest={false} />
        </mesh>
        {/* Secondary glint */}
        <mesh position={[ 0.06, -0.03, 0.134]} renderOrder={1001} frustumCulled={false}>
          <boxGeometry args={[0.04, 0.02, 0.003]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.45} toneMapped={false} depthTest={false} />
        </mesh>
        {/* Tapered strap anchors */}
        <mesh position={[-0.245, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <cylinderGeometry args={[0.028, 0.020, 0.09, 10]} />
        </mesh>
        <mesh position={[ 0.245, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={matStrap} renderOrder={999} frustumCulled={false}>
          <cylinderGeometry args={[0.028, 0.020, 0.09, 10]} />
        </mesh>
        {/* Purge valve cylinder */}
        <mesh position={[0.06, -0.195, 0.04]} material={matFrame} renderOrder={999} frustumCulled={false}>
          <cylinderGeometry args={[0.040, 0.030, 0.13, 10]} />
        </mesh>
        {/* NV goggle tubes — cylinders pointing forward */}
        <group position={[0, 0.19, 0.06]}>
          {/* Left tube */}
          <mesh position={[-0.115, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={matGoggleHousing} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.065, 0.058, 0.15, 18]} />
          </mesh>
          {/* Right tube */}
          <mesh position={[ 0.115, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={matGoggleHousing} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.065, 0.058, 0.15, 18]} />
          </mesh>
          {/* Left lens — circular emissive disc */}
          <mesh position={[-0.115, 0, 0.077]} renderOrder={1000} frustumCulled={false}>
            <circleGeometry args={[0.049, 22]} />
            <primitive object={matLensLeft} attach="material" ref={lensLeftMatRef} />
          </mesh>
          {/* Right lens */}
          <mesh position={[ 0.115, 0, 0.077]} renderOrder={1000} frustumCulled={false}>
            <circleGeometry args={[0.049, 22]} />
            <primitive object={matLensRight} attach="material" ref={lensRightMatRef} />
          </mesh>
          {/* Centre bridge */}
          <mesh material={matGoggleHousing} renderOrder={999} frustumCulled={false}>
            <boxGeometry args={[0.09, 0.034, 0.11]} />
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

      {/* ARMS — forearms + gloved hands rise from below frame. */}
      <group ref={armLRef} visible={false} renderOrder={998}>
        {/* Forearm — thicker, tapered cylinder */}
        <mesh position={[0, -0.06, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.042, 0.052, 0.28, 14]} />
        </mesh>
        {/* Wrist cuff ridge */}
        <mesh position={[0, 0.045, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.048, 0.048, 0.025, 14]} />
        </mesh>
        {/* Palm */}
        <mesh position={[0, 0.11, 0]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <boxGeometry args={[0.068, 0.095, 0.048]} />
        </mesh>
        {/* Thumb nub */}
        <mesh position={[-0.044, 0.095, 0.005]} rotation={[0, 0, -0.5]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <capsuleGeometry args={[0.014, 0.028, 4, 8]} />
        </mesh>
      </group>
      <group ref={armRRef} visible={false} renderOrder={998}>
        <mesh position={[0, -0.06, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.042, 0.052, 0.28, 14]} />
        </mesh>
        <mesh position={[0, 0.045, 0]} material={matSleeve} renderOrder={998} frustumCulled={false}>
          <cylinderGeometry args={[0.048, 0.048, 0.025, 14]} />
        </mesh>
        <mesh position={[0, 0.11, 0]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <boxGeometry args={[0.068, 0.095, 0.048]} />
        </mesh>
        {/* Thumb nub (mirrored) */}
        <mesh position={[ 0.044, 0.095, 0.005]} rotation={[0, 0, 0.5]} material={matSkin} renderOrder={998} frustumCulled={false}>
          <capsuleGeometry args={[0.014, 0.028, 4, 8]} />
        </mesh>
      </group>
    </group>
  );
};
