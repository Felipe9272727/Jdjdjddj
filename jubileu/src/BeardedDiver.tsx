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

// Two bubble layers — small dense layer + large sparse layer — give depth
// and make the underwater volume feel genuinely volumetric.
const BUBBLE_SMALL_COUNT = 60;
const BUBBLE_LARGE_COUNT = 22;

function makeBubbleLayer(count: number, spread: number, riseMin: number, riseMax: number) {
  const positions = new Float32Array(count * 3);
  const speeds    = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    positions[i * 3]     = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = r * 5.0;
    positions[i * 3 + 2] = DIVER_POS[2] + (Math.random() - 0.5) * spread;
    speeds[i * 3]        = (Math.random() - 0.5) * 0.022;
    speeds[i * 3 + 1]    = riseMin + Math.random() * (riseMax - riseMin);
    speeds[i * 3 + 2]    = (Math.random() - 0.5) * 0.022;
  }
  return { positions, speeds };
}

function BubbleParticles() {
  const smallRef = useRef<THREE.Points>(null);
  const largeRef = useRef<THREE.Points>(null);

  const { positions: posS, speeds: spdS } = useMemo(
    () => makeBubbleLayer(BUBBLE_SMALL_COUNT, 5.0, 0.14, 0.34), []);
  const { positions: posL, speeds: spdL } = useMemo(
    () => makeBubbleLayer(BUBBLE_LARGE_COUNT, 6.5, 0.06, 0.16), []);

  useFrame((_, dt) => {
    for (const [ref, count, speeds, spread] of [
      [smallRef, BUBBLE_SMALL_COUNT, spdS, 5.0] as const,
      [largeRef, BUBBLE_LARGE_COUNT, spdL, 6.5] as const,
    ]) {
      if (!ref.current) continue;
      const pos = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        pos[i * 3]     += speeds[i * 3]     * dt;
        pos[i * 3 + 1] += speeds[i * 3 + 1] * dt;
        pos[i * 3 + 2] += speeds[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] > 4.5) {
          pos[i * 3]     = (Math.random() - 0.5) * spread;
          pos[i * 3 + 1] = Math.random() * 0.3;
          pos[i * 3 + 2] = DIVER_POS[2] + (Math.random() - 0.5) * spread;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  }, 0);

  return (
    <>
      {/* Small dense bubbles — fill the volume */}
      <points ref={smallRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posS, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#A5F3FC" size={0.036} transparent opacity={0.55}
          depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      {/* Large sparse bubbles — slow-rising, give sense of depth */}
      <points ref={largeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posL, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#67E8F9" size={0.080} transparent opacity={0.28}
          depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </>
  );
}

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
/** Handover (mask-present) duration in seconds. Long enough for a proper
 *  anticipation → arc → overshoot → settle gesture. */
const HANDOVER_DURATION = 1.5;
/** Fade-out duration in seconds — just a turn + fade, no walking. */
const FADE_DURATION = 2.0;

/** Target height for the diver in world units (~human height in meters).
 *  We auto-scale the GLB to this so Tripo's arbitrary export scale
 *  doesn't end up tiny or huge. Used at clone time. */
const DIVER_TARGET_HEIGHT = 2.3;

export type DiverState = 'hidden' | 'spawn' | 'idle' | 'handover' | 'fading';

interface BeardedDiverProps {
  state: DiverState;
  /** Player position — used for facing on the XZ plane. */
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  /** Current dialogue beat index (-1 = no active beat). Drives per-line body language. */
  dialogueBeatRef?: React.MutableRefObject<number>;
}

export const BeardedDiver: React.FC<BeardedDiverProps> = ({
  state,
  playerPositionRef,
  dialogueBeatRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  const maskRef = useRef<THREE.Group>(null);
  const flashMatRef = useRef<THREE.SpriteMaterial>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const groundGlowMatRef = useRef<THREE.SpriteMaterial>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);
  const fillLightRef = useRef<THREE.PointLight>(null);
  const maskLightRef = useRef<THREE.PointLight>(null);
  // Spawn ring — 3D torus that expands outward when the diver bursts in
  const spawnRingRef = useRef<THREE.Mesh>(null);
  // Pre-allocated colors for smooth per-beat temperature shift
  const keyColorSmoothed = useRef(new THREE.Color('#FFE2A0'));
  const fillColorSmoothed = useRef(new THREE.Color('#FFD080'));
  const keyColorTarget   = useRef(new THREE.Color('#FFE2A0'));
  const fillColorTarget  = useRef(new THREE.Color('#FFD080'));

  // ─── Load + clone GLB (so multiple instances / fade ops are safe) ──
  const gltf = useGLTF(hotelConciergeModel) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  // Compute auto-scale + ground-offset by inspecting the GLB bbox.
  // We apply the scale directly to the clone object (not the parent group)
  // so that lights, mask, and sprites stay in true world-unit space and are
  // not distorted by the model's arbitrary export scale.
  const { autoScale, groundOffsetY } = useMemo(() => {
    const bbox = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const h = size.y > 0.0001 ? size.y : 1;
    const sc = DIVER_TARGET_HEIGHT / h;
    // groundOffsetY lifts the clone so its lowest vertex lands at y=0.
    // Because the clone itself carries scale=sc, the offset in parent space
    // is: -bbox.min.y * sc  (same value as before, but now interpreted
    // correctly since the parent group is always scale=1).
    const yOff = -bbox.min.y * sc;
    return { autoScale: sc, groundOffsetY: yOff };
  }, [gltf.scene]);

  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(gltf.scene);
    // Bake the normalising scale onto the clone so the parent group can stay
    // scale=1 (lights, mask, sprites live in world units).
    c.scale.setScalar(autoScale);
    // Keep Tripo's original PBR textures (baseColor, normal, metallicRoughness)
    // exactly like the Cashier does — no material swap, no envMapIntensity
    // hacks. The "PNG look" was actually the face-player rotation (below)
    // making the player see the same silhouette from every angle.
    c.traverse((child: any) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    });
    return c;
  }, [gltf.scene, autoScale]);
  const { actions, names } = useAnimations(gltf.animations, clone);

  // Phase progress timers — reset on state transitions.
  const stateRef = useRef(state);
  const tRef = useRef({
    popT: 0,
    armT: 0,
    fadeT: 0,
    fadeOpacity: 1,
    beatLean: 0,
    beatYaw:  0,
    spY: 0, svY: 0,
    spX: 0, svX: 0,
    spZ: 0, svZ: 0,
    spSY: 1.0, svSY: 0,
    nodT: 1,
    prevBeat: -1,
    gaze: 0,
    beatRoll: 0,
    weightPhase: 0,
    microT: 0,
    microBob: 0,
    driftZ: 0, driftVZ: 0,
    // Beat-triggered light pulse — brief intensity spike draws eye to character
    lightPulse: 0,
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
      tRef.current.spY = 0; tRef.current.svY = 0;
      tRef.current.spX = 0; tRef.current.svX = 0;
      tRef.current.spZ = 0; tRef.current.svZ = 0;
      tRef.current.spSY = 1; tRef.current.svSY = 0;
      tRef.current.nodT = 1; tRef.current.prevBeat = -1;
      tRef.current.gaze = 0; tRef.current.beatRoll = 0;
      tRef.current.weightPhase = 0; tRef.current.microT = 0;
      tRef.current.microBob = 0;
      tRef.current.driftZ = 0; tRef.current.driftVZ = 0;
      // Reset walked-away position so a respawn shows him at DIVER_POS again
      if (groupRef.current) {
        groupRef.current.position.set(DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]);
      }
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

    // Rotation is static (set on the JSX <group>) — same logic the Cashier
    // uses. Tracking the player every frame collapsed the silhouette to one
    // angle, which is what made the model read as a 2D billboard.

    const time = stateR3F.clock.elapsedTime;

    // ── SPAWN: pop scale + lurch ───────────────────────────────────
    // Scale is applied to bobRef (not groupRef) so that lights, sprites
    // and mask — which live in groupRef's unscaled world space — are
    // unaffected.  The clone already carries autoScale internally, so
    // bobRef.scale=1 produces the correct 1.85 m standing height.
    if (st === 'spawn') {
      t.popT = Math.min(1, t.popT + safeDt / POP_DURATION);
      const s = 2.5;  // stronger back-ease overshoot
      const tt = t.popT;
      // Spawn ring: expands outward and fades — ground-shockwave effect
      if (spawnRingRef.current) {
        const ringScale = THREE.MathUtils.clamp(tt * 2.8, 0, 4.0);
        spawnRingRef.current.scale.setScalar(ringScale);
        const ringMat = spawnRingRef.current.material as THREE.MeshBasicMaterial;
        ringMat.opacity = tt < 0.5
          ? THREE.MathUtils.smoothstep(tt, 0, 0.12) * 0.6
          : 0.6 * (1 - (tt - 0.5) / 0.5);
        spawnRingRef.current.visible = true;
      }
      const riseEase = 1 - Math.pow(1 - tt, 2.8);
      g.position.set(DIVER_POS[0], DIVER_POS[1] - 1.8 * (1 - riseEase), DIVER_POS[2]);
      const c = tt - 1;
      const ease = 1 + c * c * ((s + 1) * c + s);
      const sc = THREE.MathUtils.clamp(ease, 0.05, 1.45);  // bigger overshoot
      const sq = Math.sin(tt * Math.PI * 2) * 0.5 * 0.35;  // more pronounced squash/stretch
      const impactPhase = THREE.MathUtils.clamp((tt - 0.78) / 0.22, 0, 1);
      const impactSquash = Math.sin(impactPhase * Math.PI) * 0.20;  // harder land
      // Forward lurch at impact — body throws itself toward player
      const impactLurch = Math.sin(impactPhase * Math.PI) * 0.35;
      bob.scale.set(
        sc * (1 - sq * 0.6) * (1 + impactSquash * 0.35),
        sc * (1 + sq)       * (1 - impactSquash),
        sc * (1 - sq * 0.6) * (1 + impactSquash * 0.35),
      );
      bob.position.z = Math.max(0, (1 - tt) * 0.5) + impactLurch * 0.28;
      bob.position.y = Math.sin(tt * Math.PI) * 0.18 - impactSquash * 0.14;
      bob.rotation.x = (1 - tt) * -0.28 + impactLurch;  // lurch forward at impact
    } else if (st !== 'fading') {
      // Return to anchor — proximity drift applied below in idle/handover
      g.position.set(DIVER_POS[0], DIVER_POS[1], DIVER_POS[2] + t.driftZ);
      bob.scale.set(1, 1, 1);
      bob.position.z = 0;
      bob.rotation.x = 0;
      if (spawnRingRef.current) spawnRingRef.current.visible = false;
    } else {
      bob.scale.set(1, 1, 1);
      bob.position.z = 0;
      bob.rotation.x = 0;
      if (spawnRingRef.current) spawnRingRef.current.visible = false;
    }

    // ── IDLE / HANDOVER: procedural idle (no skeleton in GLB) ─────
    // The Tripo concierge GLB ships static — no idle animation. We
    // layer subtle motion via the bob group so he reads as alive:
    //   - chest breath (sin on Y, slow)
    //   - body sway (sin on Z, even slower)
    //   - subtle head-look toward player (twist on Y via tiny offset)
    //   - micro-bob from "shifting weight" (sin on rotation X)
    if (st === 'idle' || st === 'handover') {
      // ── Per-beat body language ─────────────────────────────────────
      const beat = dialogueBeatRef ? dialogueBeatRef.current : -1;
      if (beat !== t.prevBeat) {
        t.prevBeat = beat;
        t.nodT = 0;
        t.lightPulse = 1.0;  // brief intensity spike on beat change
      }
      t.lightPulse = Math.max(0, t.lightPulse - safeDt * 2.8);
      t.nodT = Math.min(1, t.nodT + safeDt / 0.40);
      // Nod: double-dip (two peaks) for expressiveness
      const nod = t.nodT < 1
        ? Math.sin(t.nodT * Math.PI) * (0.28 + Math.sin(t.nodT * Math.PI * 1.8) * 0.08)
        : 0;

      // Amplified beat poses — strong enough to read clearly at conversation distance
      const beatLeanTarget =
        beat === 0 ?  0.04 :   // curious attention forward
        beat === 1 ? -0.25 :   // lean back — genuinely lost in memory
        beat === 2 ?  0.22 :   // lean forward — intimate/earnest
        beat === 3 ?  0.10 :   // slight lean — gentle instruction
        beat === 4 ? -0.08 :   // plant feet — authority, direct
                     0.04;
      const beatYawTarget =
        beat === 0 ?  0.08 :   // slight turn — sizing the player up
        beat === 1 ?  0.50 :   // look well aside — truly reminiscing
        beat === 2 ? -0.10 :   // lean toward player center
        beat === 3 ?  0.18 :   // look at item being described
        beat === 4 ? -0.16 :   // square to player — locking eyes
                     0;
      const beatRollTarget =
        beat === 0 ?  0.04 :
        beat === 1 ?  0.12 :   // tilt right — introspective
        beat === 2 ? -0.10 :   // tilt left — empathetic
        beat === 3 ?  0.05 :
        beat === 4 ?  0.01 :   // level — authority
                     0.03;
      t.beatLean += (beatLeanTarget - t.beatLean) * Math.min(1, safeDt * 2.8);
      t.beatYaw  += (beatYawTarget  - t.beatYaw)  * Math.min(1, safeDt * 2.2);
      t.beatRoll += (beatRollTarget - t.beatRoll) * Math.min(1, safeDt * 2.8);

      // ── Proximity drift — diver steps into the player's space ─────
      // Beat 2 (caring): 0.8u forward; beat 4 (authority): 1.2u forward.
      // Handover: +1.4u so the mask is physically close when extended.
      // Spring k=1.2, d=1.8 → very smooth, takes ~1.5s to fully settle.
      const driftTarget = st === 'handover' ? 1.40 :
                          beat === 4 ? 1.20 :
                          beat === 2 ? 0.80 :
                          beat === 3 ? 0.50 :
                          beat === 1 ? 0.20 : 0;
      t.driftVZ += ((driftTarget - t.driftZ) * 1.2 - t.driftVZ * 1.8) * safeDt;
      t.driftZ  += t.driftVZ * safeDt;
      g.position.z = DIVER_POS[2] + t.driftZ;

      // ── Per-beat light temperature ─────────────────────────────────
      // beat 1 (memory): warm amber candlelight
      // beat 4 (authority): cooler, slightly blue-white — dramatic
      // handover: cooler still, the mask glow is the warm element
      const kc = st === 'handover' ? '#C8E8FF' :
                 beat === 1 ? '#FFBA50' :
                 beat === 4 ? '#C8DCFF' :
                              '#FFE2A0';
      const fc = st === 'handover' ? '#B0D4FF' :
                 beat === 1 ? '#FFAE40' :
                 beat === 4 ? '#D4E4FF' :
                              '#FFD080';
      keyColorTarget.current.set(kc);
      fillColorTarget.current.set(fc);
      keyColorSmoothed.current.lerp(keyColorTarget.current, safeDt * 1.4);
      fillColorSmoothed.current.lerp(fillColorTarget.current, safeDt * 1.4);
      if (keyLightRef.current)  keyLightRef.current.color.copy(keyColorSmoothed.current);
      if (fillLightRef.current) fillLightRef.current.color.copy(fillColorSmoothed.current);

      // ── Weight shift cycle (foot-to-foot) ─────────────────────────
      t.weightPhase += safeDt * 0.42;
      const weightX = Math.sin(t.weightPhase) * 0.038;
      const weightZ = Math.cos(t.weightPhase * 0.7) * 0.016;

      // ── Periodic micro-gesture: brief look-down + recover ──────────
      t.microT += safeDt;
      if (t.microT > 9.5) t.microT = 0;
      const microBobTarget = t.microT < 0.55
        ? Math.sin(t.microT / 0.55 * Math.PI) * 0.13
        : 0;
      t.microBob += (microBobTarget - t.microBob) * Math.min(1, safeDt * 8);

      // ── Spring-driven breathing + sway ────────────────────────────
      // Four-frequency breathing: primary + sigh + micro-jitter + slow belly
      const breathDepth = 1 + 0.40 * Math.sin(time * 0.19);
      const targetY = Math.sin(time * 1.45) * 0.085 * breathDepth
                    + Math.sin(time * 0.70 + 1.0) * 0.022
                    + Math.sin(time * 2.80 + 0.5) * 0.007  // micro-jitter
                    + Math.sin(time * 0.11 + 2.3) * 0.018; // slow belly swell
      const targetX = Math.sin(time * 0.37) * 0.060 + weightX;
      const targetZ = Math.sin(time * 0.37) * 0.082
                    + Math.sin(time * 0.26) * 0.028
                    + weightZ
                    + t.beatRoll;

      // Spring: k=15, d=3.6 → ~18% overshoot
      const ks = 15, kd = 3.6;
      t.svY += ((targetY - t.spY) * ks - t.svY * kd) * safeDt;
      t.spY += t.svY * safeDt;
      t.svX += ((targetX - t.spX) * ks - t.svX * kd) * safeDt;
      t.spX += t.svX * safeDt;
      t.svZ += ((targetZ - t.spZ) * ks - t.svZ * kd) * safeDt;
      t.spZ += t.svZ * safeDt;

      // ── Chest scale breath (spring-driven Y scale) ────────────────
      // Gives the model a subtle volume to its breathing — ribs expand.
      const breathScaleTarget = 1.0 + Math.sin(time * 1.45) * 0.013 * breathDepth;
      t.svSY += ((breathScaleTarget - t.spSY) * 10 - t.svSY * 3.0) * safeDt;
      t.spSY += t.svSY * safeDt;
      bob.scale.y = t.spSY;
      bob.scale.x = 1.0 / Math.sqrt(Math.max(0.90, t.spSY));
      bob.scale.z = bob.scale.x;

      bob.position.y = t.spY;
      bob.position.x = t.spX;
      bob.rotation.z = t.spZ;

      // ── Soft player gaze ──────────────────────────────────────────
      {
        const relX = playerPositionRef.current.x - DIVER_POS[0];
        const relZ = playerPositionRef.current.z - DIVER_POS[2];
        const rawGaze = Math.atan2(relX, Math.abs(relZ)) * 0.28;
        const gazeTarget = THREE.MathUtils.clamp(rawGaze, -0.32, 0.32);
        t.gaze += (gazeTarget - t.gaze) * Math.min(1, safeDt * 2.0);
      }
      // ── Irregular glance away cycle ────────────────────────────────
      const glancePhase = (time % 9.5) / 9.5;
      const beatGlance = glancePhase > 0.68
        ? Math.sin((glancePhase - 0.68) / 0.32 * Math.PI) * 0.34
        : 0;
      bob.rotation.y = Math.sin(time * 0.31 + 0.6) * (0.115 + beatGlance)
                     + Math.sin(time * 0.13 + 2.1) * 0.055
                     + t.beatYaw
                     + t.gaze;

      // ── Pitch (breathing lean + beat lean + nod + micro-gesture) ──
      bob.rotation.x = (st === 'handover')
        ? bob.rotation.x
        : Math.sin(time * 0.45) * 0.022 - t.spY * 0.30 + t.beatLean + nod + t.microBob;
    } else if (st !== 'spawn') {
      bob.position.y = 0;
      bob.position.x = 0;
      bob.rotation.z = 0;
      bob.rotation.y = 0;
    }

    // ── HANDOVER: presenting tilt + mask drifts forward ───────────
    if (st === 'handover') {
      t.armT = Math.min(1, t.armT + safeDt / HANDOVER_DURATION);
      const u = t.armT;

      // ── Phase 1 (0.00-0.10): glance DOWN at mask ──────────────────
      // He looks at the object he's about to give — establishes the mask
      // as important before the player's eye has even found it.
      const glanceDown = u < 0.10
        ? Math.sin((u / 0.10) * Math.PI) * 0.32
        : 0;
      const glanceYaw = u < 0.10
        ? Math.sin((u / 0.10) * Math.PI) * -0.20  // head turns toward mask (left)
        : 0;

      // ── Anticipation (0.00-0.18) ──────────────────────────────────
      const antic = u < 0.18 ? Math.sin((u / 0.18) * Math.PI) : 0;

      // ── Present (0.14 onwards) ────────────────────────────────────
      const pr = THREE.MathUtils.clamp((u - 0.14) / 0.86, 0, 1);
      const bk = 1.5;
      const pc = pr - 1;
      const present = pr <= 0 ? 0 : 1 + pc * pc * ((bk + 1) * pc + bk);

      // Gentle forward lean only — the mask is parented to the foot-pivoted
      // bob group, so a large torso rotation swings the extended mask up to
      // head height. A small +X lean (forward) keeps the mask presenting
      // cleanly out in front at chest level.
      const handoverBreath = Math.sin(time * 1.45) * 0.014;
      bob.rotation.x = glanceDown + present * 0.07 + handoverBreath;
      bob.rotation.z = present * -0.04;
      bob.rotation.y = (bob.rotation.y ?? 0) + glanceYaw;

      if (maskRef.current) {
        // Arc: rises modestly from chest height as it extends forward.
        const arcRise = Math.sin(THREE.MathUtils.clamp(present * 1.4, 0, 1) * Math.PI * 0.5);
        const lift = arcRise * 0.24;
        // At full extension: gentle breathing bob invites the player to take it
        const holdBob = u > 0.82 ? Math.sin(time * 2.8 + 0.7) * 0.040 : 0;
        const holdSway = u > 0.82 ? Math.sin(time * 1.9 + 1.1) * 0.016 : 0;
        // Mask tilts toward camera as it's extended — like genuinely offering it
        maskRef.current.rotation.x = present * -0.18;
        maskRef.current.rotation.z = present * 0.04;  // slight cant, natural
        maskRef.current.position.set(
          holdSway,
          1.04 - antic * 0.10 + lift,
          0.34 - antic * 0.10 + present * 0.62 + holdBob,
        );
        // Pulse scale very gently during full offer — breathing life into it
        const offerPulse = u > 0.82 ? 1 + Math.sin(time * 2.6) * 0.060 : 1;
        maskRef.current.scale.setScalar(offerPulse);
        maskRef.current.visible = true;
      }
    } else if (maskRef.current) {
      // Mask hidden during idle/spawn — the GLB character is the visual.
      // Only surface the procedural prop during handover when the diver
      // actively presents it to the player.
      maskRef.current.position.set(0, 1.05, 0.45);
      maskRef.current.rotation.x = 0;
      maskRef.current.scale.setScalar(1);
      maskRef.current.visible = false;
    }

    // ── FADING: walk-away ramp ─────────────────────────────────────
    // Sells "the diver leaves" instead of "the diver winks out". He walks
    // backwards (his -Z, which is +Z in world after the rotation) into the
    // dark cave, sinks a little (knees give as the suit gets heavier with
    // water), and only at the end of the walk fades to transparent.
    if (st === 'fading') {
      t.fadeT = Math.min(1, t.fadeT + safeDt / FADE_DURATION);
      const u = t.fadeT;
      // The dive blackout covers the screen by ~u=0.33, so the whole
      // farewell gesture is front-loaded into the visible window:
      //  0.00-0.04: settle  0.04-0.24: decisive 180° turn
      //  0.10-0.20: a glance back at the player mid-turn
      //  0.22-0.40: respectful head bow  0.50-1.00: fade out
      const turn = THREE.MathUtils.smoothstep(u, 0.04, 0.24);
      const settle = Math.sin(THREE.MathUtils.clamp((u - 0.02) / 0.10, 0, 1) * Math.PI)
                   * 0.09;
      // Glance back mid-turn — a last look at the player before he goes
      const lookback = Math.sin(
        THREE.MathUtils.clamp((u - 0.10) / 0.10, 0, 1) * Math.PI
      ) * 0.40;
      // Respectful bow as the turn settles
      const bow = Math.sin(
        THREE.MathUtils.clamp((u - 0.22) / 0.18, 0, 1) * Math.PI
      ) * 0.22;
      bob.rotation.y = turn * Math.PI + settle - lookback;
      bob.position.y = 0;
      bob.position.x = 0;
      bob.rotation.z = 0;
      bob.rotation.x = bow;
      bob.scale.set(1, 1, 1);
      // Fade out over the last 40%
      const o = u < 0.60 ? 1 : 1 - ((u - 0.60) / 0.40);
      t.fadeOpacity = o;
      g.traverse((child: any) => {
        if (child.material) {
          const m = child.material;
          const list = Array.isArray(m) ? m : [m];
          for (const mm of list) {
            mm.transparent = true;
            mm.opacity = o;
          }
        }
      });
      if (u >= 0.999) g.visible = false;
    } else if (t.fadeOpacity < 1) {
      // Restore opaque rendering after a fade
      t.fadeOpacity = 1;
      g.traverse((child: any) => {
        if (child.material) {
          const m = child.material;
          const list = Array.isArray(m) ? m : [m];
          for (const mm of list) {
            mm.transparent = false;
            mm.opacity = 1;
          }
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
    if (maskLightRef.current) {
      // Glow ramps up as mask extends, peaks bright at full extension
      const rampFactor = st === 'handover'
        ? THREE.MathUtils.smoothstep(t.armT, 0.30, 0.75)
        : 0;
      const pulse = 1 + Math.sin(time * 3.2) * 0.32;
      maskLightRef.current.intensity = rampFactor * pulse * 10.0;
    }
    // Goggle emissiveIntensity ramps as they "power up" — kept moderate so
    // the emissive reads as bright GREEN, not a blown-out white blob.
    matGoggles.emissiveIntensity = 3.5 + (
      st === 'handover'
        ? THREE.MathUtils.smoothstep(t.armT, 0.30, 0.80) * 5.5
        : 0
    );
    // During handover offer (armT > 0.55) dim the key by up to 40% and
    // fill by 50% so the glowing mask becomes the dominant practical light.
    const handoverDim = (st === 'handover' && t.armT > 0.55)
      ? THREE.MathUtils.smoothstep(t.armT, 0.55, 0.85) * 0.40
      : 0;
    if (keyLightRef.current) {
      const base = 8.5;
      const caustic = (st === 'idle' || st === 'handover')
        ? Math.sin(time * 2.3) * 1.4 + Math.sin(time * 5.1 + 1.3) * 0.8
        : 0;
      const spawnBoost = st === 'spawn' ? (1 - t.popT) * 6.0 : 0;
      const fadeMult = st === 'fading' ? (1 - t.fadeT) : 1;
      const beatBoost = 1 + t.lightPulse * 0.55;  // ~55% brighter on beat change
      keyLightRef.current.intensity = (base + caustic + spawnBoost) * (1 - handoverDim) * fadeMult * beatBoost;
    }
    if (fillLightRef.current) {
      const caustic = (st === 'idle' || st === 'handover')
        ? Math.sin(time * 1.9 + 2.0) * 0.70
        : 0;
      const fadeMult = st === 'fading' ? (1 - t.fadeT) : 1;
      const beatBoost = 1 + t.lightPulse * 0.40;
      fillLightRef.current.intensity = (4.5 + caustic) * (1 - handoverDim * 1.25) * fadeMult * beatBoost;
    }
  });

  // ─── Procedural mask + NV goggles (presented in his hands) ───────
  const matMaskFrame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E7490', roughness: 0.45, metalness: 0.55, transparent: true }), []);
  const matMaskGlass = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#A5F3FC', emissive: '#22D3EE', emissiveIntensity: 3.0,
    roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.90, toneMapped: false,
  }), []);
  const matMaskStrap = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.9, transparent: true }), []);
  const matGoggles = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#052e16', emissive: '#4ADE80', emissiveIntensity: 6.0,
    roughness: 0.2, toneMapped: false, transparent: true,
  }), []);

  return (
    <>
    <BubbleParticles />
    <group
      ref={groupRef}
      position={[DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]]}
      rotation={[0, 0, 0]}
      visible={false}
    >
      {/* Dedicated hemisphereLight scoped to the diver so the cave's
          dark fog doesn't swallow the GLB's PBR textures.  Sky = warm
          torch glow, ground = cool reflected cyan from the water.
          Adds a flat fill across every face of the model regardless
          of where the key light is hitting. */}
      <hemisphereLight color="#FFD080" groundColor="#4A6F8A" intensity={0.9} />

      {/* Three-point lighting — all positions relative to the diver's
          LOCAL space so they rotate with him and always light his face.
          +Z is toward the player (the direction the diver faces).

          Key  : high-front-right, warm, driven by refs (spawn boost etc.)
          Fill : low-front-left, softer warm, driven by refs
          Face : very close in front, soft kicker — guarantees the face
                 is always readable even from across the cave
          Rim  : behind the diver (-Z), cool cyan — silhouette pop
          Bounce: below, warm amber — light bouncing off cave floor */}
      <pointLight ref={keyLightRef}  position={[ 0.9, 2.4,  1.4]} intensity={0} distance={9}  decay={1.1} color="#FFE2A0" />
      <pointLight ref={fillLightRef} position={[-0.8, 1.3,  1.2]} intensity={0} distance={6}  decay={1.3} color="#FFD080" />
      <pointLight position={[ 0.0, 1.65, 0.9]} intensity={4.0} distance={3} decay={1.1} color="#FFF0CC" />
      <pointLight position={[ 0.0, 1.5, -1.5]} intensity={3.8} distance={5}  decay={1.2} color="#5AC8E0" />
      <pointLight position={[ 0.0, 0.1,  0.6]} intensity={2.0} distance={4}  decay={1.8} color="#D08850" />

      {/* Spawn ring — 3D torus ground shockwave that expands and fades during pop */}
      <mesh ref={spawnRingRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.9, 0.04, 8, 48]} />
        <meshBasicMaterial color="#22D3EE" transparent opacity={0} depthWrite={false}
          blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      {/* Ground glow — cold aqua puddle of bioluminescence */}
      <sprite position={[0, 0.05, 0]} scale={[4, 1.4, 1]}>
        <spriteMaterial ref={groundGlowMatRef} color="#1AD4B8" transparent opacity={0.32} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Halo — cold teal rim matching the cave lighting */}
      <sprite position={[0, 1.4, 0]} scale={[5, 5, 1]}>
        <spriteMaterial ref={haloMatRef} color="#38BDF8" transparent opacity={0.18} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Spawn flash — deep cyan burst, not white, fits underwater atmosphere */}
      <sprite position={[0, 1.4, 0]} scale={[10, 10, 1]}>
        <spriteMaterial
          ref={flashMatRef}
          color="#7FEFFF"
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
        <primitive object={clone} position={[0, groundOffsetY, 0]} rotation={[0, 0, 0]} />

        {/* MASK + NV goggles, presented in front of the diver's chest.
            Procedural so we don't depend on the GLB having a "RightHand"
            bone or carrying a mask asset. */}
        <group ref={maskRef} position={[0, 1.05, 0.45]}>
          {/* Mask point light — green glow casts onto the diver's face when extended */}
          <pointLight ref={maskLightRef} position={[0, 0.1, 0.2]} intensity={0} distance={3} decay={1.8} color="#4ADE80" />
          {/* Main mask body — tapered diving mask silhouette */}
          <mesh material={matMaskFrame}>
            <boxGeometry args={[0.42, 0.30, 0.20]} />
          </mesh>
          {/* Recessed cushion ring */}
          <mesh position={[0, 0, 0.005]} material={matMaskStrap}>
            <boxGeometry args={[0.38, 0.26, 0.06]} />
          </mesh>
          {/* Large viewport glass */}
          <mesh position={[0, 0, 0.112]} material={matMaskGlass}>
            <boxGeometry args={[0.30, 0.18, 0.02]} />
          </mesh>
          {/* Lens specular glint — two small bright spots */}
          <mesh position={[-0.07, 0.04, 0.126]}>
            <boxGeometry args={[0.06, 0.03, 0.003]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <mesh position={[ 0.07, -0.03, 0.126]}>
            <boxGeometry args={[0.03, 0.02, 0.003]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.55} toneMapped={false} />
          </mesh>
          {/* Strap anchors — tapered cylinders */}
          <mesh position={[-0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={matMaskStrap}>
            <cylinderGeometry args={[0.025, 0.018, 0.08, 8]} />
          </mesh>
          <mesh position={[ 0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={matMaskStrap}>
            <cylinderGeometry args={[0.025, 0.018, 0.08, 8]} />
          </mesh>
          {/* Purge valve / regulator nub at bottom */}
          <mesh position={[0.07, -0.19, 0.05]} material={matMaskFrame}>
            <cylinderGeometry args={[0.038, 0.028, 0.12, 10]} />
          </mesh>
          {/* NV goggle tubes — proper cylinders, read much better as optics */}
          <group position={[0, 0.19, 0.05]}>
            {/* Left tube housing */}
            <mesh position={[-0.115, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={matMaskFrame}>
              <cylinderGeometry args={[0.062, 0.055, 0.14, 16]} />
            </mesh>
            {/* Right tube housing */}
            <mesh position={[ 0.115, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={matMaskFrame}>
              <cylinderGeometry args={[0.062, 0.055, 0.14, 16]} />
            </mesh>
            {/* Left lens — circular glowing disc */}
            <mesh position={[-0.115, 0, 0.072]} material={matGoggles}>
              <circleGeometry args={[0.046, 20]} />
            </mesh>
            {/* Right lens */}
            <mesh position={[ 0.115, 0, 0.072]} material={matGoggles}>
              <circleGeometry args={[0.046, 20]} />
            </mesh>
            {/* Centre bridge between tubes */}
            <mesh position={[0, 0, 0]} material={matMaskFrame}>
              <boxGeometry args={[0.08, 0.032, 0.10]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
    </>
  );
};
