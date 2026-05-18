/**
 * BeardedDiver.tsx — Hotel concierge GLB NPC on Floor 2.
 *
 * Uses the `hotel-concierge.glb` model delivered by Felipe (committed
 * to the repo and imported via Vite as a base64 asset). The GLB is
 * cloned with SkeletonUtils.clone so future multiplayer / multi-instance
 * use works correctly; animations (if any) get wired through
 * `useAnimations` and start on idle.
 *
 * State machine — DRIVEN BY THE PARENT (App.tsx):
 *  - 'hidden'   — completely invisible, no lights, skip work
 *  - 'spawn'    — JUMPSCARE pop (scale 0 → 1.30 → 1 in ~450ms, big flash)
 *  - 'idle'     — breathing bob + faces the player on XZ
 *  - 'handover' — slight forward presenting tilt + procedural mask drifts
 *                 toward the camera in front of the diver
 *  - 'fading'   — fade out and despawn
 *
 * The handover mask is procedural — we don't rely on the GLB having a
 * specific bone named "RightHand". It sits in front of the diver and
 * gets pushed forward during handover. Cleanly fades out at the end.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - `useFrame` priority MUST be 0.
 *  - No mesh attached to bones (`bone.add(mesh)` / `createPortal`).
 *  - No `SpotLight` with `distance={0}` while alive.
 *  - <primitive> rotation/position MUST be passed as props, not set via
 *    side-effect (R3F's reconciler overwrites side-effect transforms).
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { hotelConciergeModel } from './assets/textureImports';

// Preload at module level so the model is ready by the time the player
// even reaches Floor 2.
useGLTF.preload(hotelConciergeModel);

// ─── Anchor / interaction constants ────────────────────────────────────
// Elevator on Floor 2 lives at [0, 0, -10] (group), doors facing +Z. The
// diver waits 4u past the doors so the player walks out, crosses the
// trigger distance, then the parent fires the jumpscare.
export const DIVER_POS: readonly [number, number, number] = [0, 0, -6];

/** Proximity (XZ) at which the parent should fire the jumpscare. */
export const DIVER_SCARE_DIST = 5.2;
/** Pop animation duration in seconds. */
const POP_DURATION = 0.45;
/** Handover (mask-present) duration in seconds. */
const HANDOVER_DURATION = 0.7;
/** Fade-out duration in seconds. */
const FADE_DURATION = 0.9;

/** GLB scale tweak — adjust if the model is too big/small after import.
 *  Hotel concierge from typical 3D model sites comes ~1.7-2m tall, so
 *  scale 1 usually works. We expose this so it's easy to tune. */
const DIVER_SCALE = 1.05;

export type DiverState = 'hidden' | 'spawn' | 'idle' | 'handover' | 'fading';

interface BeardedDiverProps {
  state: DiverState;
  /** Player position — used for facing on the XZ plane. */
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
}

export const BeardedDiver: React.FC<BeardedDiverProps> = ({
  state,
  playerPositionRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  const maskRef = useRef<THREE.Group>(null);
  const flashMatRef = useRef<THREE.SpriteMaterial>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const groundGlowMatRef = useRef<THREE.SpriteMaterial>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);
  const fillLightRef = useRef<THREE.PointLight>(null);

  // ─── Load + clone GLB (so multiple instances / fade ops are safe) ──
  const gltf = useGLTF(hotelConciergeModel) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(gltf.scene);
    // Tag every material as transparency-ready so the fade-out works
    // uniformly. We don't toggle transparency on/off mid-run; we just
    // set opacity to 1 in idle and ramp down in fading.
    c.traverse((child: any) => {
      if (child.material) {
        const m = child.material;
        const list = Array.isArray(m) ? m : [m];
        for (const mm of list) {
          mm.transparent = true;
          mm.opacity = 1;
          // Many GLBs ship with double-sided unset; make sure we cast
          // shadows-ish lighting correctly without z-fight artifacts.
          if (mm.side === undefined) mm.side = THREE.FrontSide;
        }
      }
    });
    return c;
  }, [gltf.scene]);
  const { actions, names } = useAnimations(gltf.animations, clone);

  // Phase progress timers — reset on state transitions.
  const stateRef = useRef(state);
  const tRef = useRef({
    popT: 0,
    armT: 0,
    fadeT: 0,
    fadeOpacity: 1,
  });

  // Reset timers on state transitions + drive idle animation.
  useEffect(() => {
    if (stateRef.current === state) return;
    stateRef.current = state;
    if (state === 'spawn')    tRef.current.popT  = 0;
    if (state === 'handover') tRef.current.armT  = 0;
    if (state === 'fading')   tRef.current.fadeT = 0;
    if (state === 'hidden') {
      tRef.current.popT = 0;
      tRef.current.armT = 0;
      tRef.current.fadeT = 0;
      tRef.current.fadeOpacity = 1;
    }
  }, [state]);

  // Kick off the first animation track on mount, if the GLB ships any.
  // Most hotel/concierge GLBs include an idle pose — using it makes the
  // NPC feel alive instead of T-posing.
  useEffect(() => {
    if (!names || names.length === 0) return;
    const first = actions[names[0]];
    if (first) {
      first.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
    }
    return () => {
      if (first) first.fadeOut(0.2);
    };
  }, [actions, names]);

  useFrame((stateR3F, dt) => {
    const safeDt = Math.min(dt, 0.033);
    const g = groupRef.current;
    const bob = bobRef.current;
    if (!g || !bob) return;
    const t = tRef.current;
    const st = stateRef.current;

    if (st === 'hidden') {
      g.visible = false;
      return;
    }
    g.visible = true;

    // ── Face the player on XZ ──────────────────────────────────────
    const pp = playerPositionRef.current;
    const dx = pp.x - DIVER_POS[0];
    const dz = pp.z - DIVER_POS[2];
    if (dx * dx + dz * dz > 1e-3) {
      const targetY = Math.atan2(dx, dz);
      let cur = g.rotation.y;
      let d2 = targetY - cur;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      g.rotation.y = cur + d2 * Math.min(1, 6 * safeDt);
    }

    const time = stateR3F.clock.elapsedTime;

    // ── SPAWN: pop scale + lurch ───────────────────────────────────
    if (st === 'spawn') {
      t.popT = Math.min(1, t.popT + safeDt / POP_DURATION);
      const s = 2.0;
      const tt = t.popT;
      const c = tt - 1;
      const ease = 1 + c * c * ((s + 1) * c + s);
      const sc = THREE.MathUtils.clamp(ease, 0.05, 1.30) * DIVER_SCALE;
      g.scale.setScalar(sc);
      bob.position.z = Math.max(0, (1 - tt) * 0.5);
      bob.rotation.x = (1 - tt) * -0.18;
    } else {
      g.scale.setScalar(DIVER_SCALE);
      bob.position.z = 0;
      bob.rotation.x = 0;
    }

    // ── IDLE: breathing bob + sway ────────────────────────────────
    if (st === 'idle') {
      const breath = Math.sin(time * 1.6) * 0.045;
      bob.position.y = breath;
      bob.rotation.z = Math.sin(time * 0.65) * 0.025;
    } else if (st !== 'spawn') {
      bob.position.y = 0;
      bob.rotation.z = 0;
    }

    // ── HANDOVER: presenting tilt + mask drifts forward ───────────
    if (st === 'handover') {
      t.armT = Math.min(1, t.armT + safeDt / HANDOVER_DURATION);
      const u = t.armT;
      const easeArm = u * u * (3 - 2 * u);
      bob.rotation.x = easeArm * -0.10;
      if (maskRef.current) {
        // Mask starts in the diver's hand zone, drifts forward + up.
        maskRef.current.position.set(0, 1.05 + easeArm * 0.10, 0.45 + easeArm * 0.85);
        maskRef.current.scale.setScalar(1);
        maskRef.current.visible = true;
      }
    } else if (maskRef.current) {
      // Default mask position — held in front of the diver at chest height.
      maskRef.current.position.set(0, 1.05, 0.45);
      maskRef.current.scale.setScalar(1);
      maskRef.current.visible = st === 'idle' || st === 'spawn';
    }

    // ── FADING: opacity ramp ───────────────────────────────────────
    if (st === 'fading') {
      t.fadeT = Math.min(1, t.fadeT + safeDt / FADE_DURATION);
      const u = t.fadeT;
      const o = 1 - u * u;
      t.fadeOpacity = o;
      g.scale.setScalar(DIVER_SCALE * (1 - u * 0.15));
      g.traverse((child: any) => {
        if (child.material) {
          const m = child.material;
          if (Array.isArray(m)) for (const mm of m) mm.opacity = o;
          else m.opacity = o;
        }
      });
      if (u >= 0.999) g.visible = false;
    } else if (t.fadeOpacity < 1) {
      t.fadeOpacity = 1;
      g.traverse((child: any) => {
        if (child.material) {
          const m = child.material;
          if (Array.isArray(m)) for (const mm of m) mm.opacity = 1;
          else m.opacity = 1;
        }
      });
    }

    // ── Visual sprites + lights ───────────────────────────────────
    if (flashMatRef.current) {
      const k = st === 'spawn' ? (1 - t.popT) : 0;
      flashMatRef.current.opacity = k * 1.4;
    }
    if (haloMatRef.current) {
      let target = 0.18;
      if (st === 'spawn')    target = 0.18 + (1 - t.popT) * 0.55;
      if (st === 'handover') target = 0.28;
      if (st === 'fading')   target = 0.18 * (1 - t.fadeT);
      haloMatRef.current.opacity = target;
    }
    if (groundGlowMatRef.current) {
      const pulse = 0.32 + Math.sin(time * 2.0) * 0.06;
      groundGlowMatRef.current.opacity = st === 'fading' ? pulse * (1 - t.fadeT) : pulse;
    }
    if (keyLightRef.current) {
      const base = 3.4;
      const spawnBoost = st === 'spawn' ? (1 - t.popT) * 4.0 : 0;
      const fadeMult = st === 'fading' ? (1 - t.fadeT) : 1;
      keyLightRef.current.intensity = (base + spawnBoost) * fadeMult;
    }
    if (fillLightRef.current) {
      const fadeMult = st === 'fading' ? (1 - t.fadeT) : 1;
      fillLightRef.current.intensity = 2.0 * fadeMult;
    }
  });

  // ─── Procedural mask + NV goggles (presented in his hands) ───────
  const matMaskFrame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E7490', roughness: 0.55, metalness: 0.4, transparent: true }), []);
  const matMaskGlass = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#67E8F9', emissive: '#0e7490', emissiveIntensity: 0.6,
    roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85, toneMapped: false,
  }), []);
  const matMaskStrap = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85, transparent: true }), []);
  const matGoggles = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a3a2a', emissive: '#10B981', emissiveIntensity: 0.7,
    roughness: 0.3, toneMapped: false, transparent: true,
  }), []);

  return (
    <group ref={groupRef} position={[DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]]} visible={false}>
      {/* Key + fill lights — driven via refs each frame */}
      <pointLight ref={keyLightRef} position={[0, 1.8, 0]} intensity={0} distance={9} decay={1.2} color="#FFE9A8" />
      <pointLight ref={fillLightRef} position={[0, 0.6, 0]} intensity={0} distance={4.2} decay={1.6} color="#FFD080" />

      {/* Ground glow */}
      <sprite position={[0, 0.05, 0]} scale={[4, 1.4, 1]}>
        <spriteMaterial ref={groundGlowMatRef} color="#FFE9A8" transparent opacity={0.32} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Halo */}
      <sprite position={[0, 1.4, 0]} scale={[5, 5, 1]}>
        <spriteMaterial ref={haloMatRef} color="#FFC880" transparent opacity={0.18} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Spawn flash */}
      <sprite position={[0, 1.4, 0]} scale={[10, 10, 1]}>
        <spriteMaterial
          ref={flashMatRef}
          color="#FFFFFF"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* Body bob group — wraps the GLB so we can lift/rotate without
          fighting R3F's <primitive> prop ownership of the GLB itself. */}
      <group ref={bobRef}>
        <primitive object={clone} position={[0, 0, 0]} rotation={[0, 0, 0]} />

        {/* MASK + NV goggles, presented in front of the diver's chest.
            Procedural so we don't depend on the GLB having a "RightHand"
            bone or carrying a mask asset. */}
        <group ref={maskRef} position={[0, 1.05, 0.45]}>
          <mesh material={matMaskFrame}>
            <boxGeometry args={[0.38, 0.26, 0.18]} />
          </mesh>
          <mesh position={[0, 0, 0.10]} material={matMaskGlass}>
            <boxGeometry args={[0.30, 0.18, 0.02]} />
          </mesh>
          <mesh position={[-0.06, 0.04, 0.115]}>
            <boxGeometry args={[0.08, 0.04, 0.005]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.7} toneMapped={false} />
          </mesh>
          <mesh position={[-0.21, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          <mesh position={[ 0.21, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          <mesh position={[0.06, -0.16, 0.02]} material={matMaskFrame}>
            <boxGeometry args={[0.08, 0.10, 0.06]} />
          </mesh>
          {/* NV goggles clipped on top */}
          <group position={[0, 0.14, 0.06]}>
            <mesh position={[-0.10, 0, 0]} material={matMaskFrame}>
              <boxGeometry args={[0.10, 0.10, 0.10]} />
            </mesh>
            <mesh position={[ 0.10, 0, 0]} material={matMaskFrame}>
              <boxGeometry args={[0.10, 0.10, 0.10]} />
            </mesh>
            <mesh position={[-0.10, 0, 0.055]} material={matGoggles}>
              <boxGeometry args={[0.07, 0.07, 0.02]} />
            </mesh>
            <mesh position={[ 0.10, 0, 0.055]} material={matGoggles}>
              <boxGeometry args={[0.07, 0.07, 0.02]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
