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

const BUBBLE_COUNT = 70;

function BubbleParticles() {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(BUBBLE_COUNT * 3);
    const speeds = new Float32Array(BUBBLE_COUNT * 3);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const r = Math.random();
      positions[i * 3]     = (Math.random() - 0.5) * 5.0;
      positions[i * 3 + 1] = r * 5.0;
      positions[i * 3 + 2] = DIVER_POS[2] + (Math.random() - 0.5) * 5.0;
      speeds[i * 3]        = (Math.random() - 0.5) * 0.025;
      speeds[i * 3 + 1]    = 0.18 + Math.random() * 0.30;
      speeds[i * 3 + 2]    = (Math.random() - 0.5) * 0.025;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const pos = (ref.current.geometry.attributes.position.array as Float32Array);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      pos[i * 3]     += speeds[i * 3]     * dt;
      pos[i * 3 + 1] += speeds[i * 3 + 1] * dt;
      pos[i * 3 + 2] += speeds[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] > 4.5) {
        pos[i * 3]     = (Math.random() - 0.5) * 5.0;
        pos[i * 3 + 1] = Math.random() * 0.3;
        pos[i * 3 + 2] = DIVER_POS[2] + (Math.random() - 0.5) * 5.0;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  }, 0);

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#A5F3FC"
        size={0.040}
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
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
    beatLean: 0,    // smoothed X-lean driven by dialogue beat index
    beatYaw:  0,    // smoothed Y-yaw offset driven by dialogue beat index
    // Spring state — gives breathing/sway inertia so motion feels weighted
    // rather than mechanically sinusoidal. Under-damped so it overshoots slightly.
    spY: 0, svY: 0,   // spring Y (breathing bob)
    spX: 0, svX: 0,   // spring X (weight shift)
    spZ: 0, svZ: 0,   // spring Z (body roll)
    // Beat-triggered head nod: fires when dialogue beat advances.
    nodT: 1,          // nod phase (1 = done/idle, 0 = just started)
    prevBeat: -1,     // last seen beat index to detect changes
    // Soft player gaze: the diver's body subtly orients toward the player's
    // X offset. 25% blend so it feels like awareness, not billboard rotation.
    gaze: 0,
    // Per-beat body roll (Z-tilt) — each dialogue register gets a head-tilt
    beatRoll: 0,
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
      tRef.current.nodT = 1; tRef.current.prevBeat = -1;
      tRef.current.gaze = 0; tRef.current.beatRoll = 0;
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
      const s = 2.0;
      const tt = t.popT;
      // Rise from 1.8m below the floor, accelerating upward. The flash
      // covers the first ~80% of the rise so the diver bursts INTO view.
      const riseEase = 1 - Math.pow(1 - tt, 2.8);
      g.position.set(DIVER_POS[0], DIVER_POS[1] - 1.8 * (1 - riseEase), DIVER_POS[2]);
      const c = tt - 1;
      const ease = 1 + c * c * ((s + 1) * c + s);
      const sc = THREE.MathUtils.clamp(ease, 0.05, 1.30);
      const sq = Math.sin(tt * Math.PI * 2) * 0.5 * 0.30;
      // Landing impact: when the rise finishes (tt > 0.82), compress body
      // downward then rebound — sells the weight of bursting out of the floor.
      const impactPhase = THREE.MathUtils.clamp((tt - 0.82) / 0.18, 0, 1);
      const impactSquash = Math.sin(impactPhase * Math.PI) * 0.14;  // compress then release
      bob.scale.set(
        sc * (1 - sq * 0.5) * (1 + impactSquash * 0.3),
        sc * (1 + sq)       * (1 - impactSquash),
        sc * (1 - sq * 0.5) * (1 + impactSquash * 0.3),
      );
      bob.position.z = Math.max(0, (1 - tt) * 0.5);
      bob.position.y = Math.sin(tt * Math.PI) * 0.16 - impactSquash * 0.12;
      bob.rotation.x = (1 - tt) * -0.22;
    } else if (st !== 'fading') {
      // Return to anchor whenever we're not in spawn or fading
      g.position.set(DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]);
      bob.scale.setScalar(1);
      bob.position.z = 0;
      bob.rotation.x = 0;
    } else {
      bob.scale.setScalar(1);
      bob.position.z = 0;
      bob.rotation.x = 0;
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
      // Detect beat change → trigger a head nod
      if (beat !== t.prevBeat) {
        t.prevBeat = beat;
        t.nodT = 0;
      }
      t.nodT = Math.min(1, t.nodT + safeDt / 0.45);
      // Nod: quick dip-and-recover in X. Peaks at ~30% into the gesture.
      const nod = t.nodT < 1
        ? Math.sin(t.nodT * Math.PI) * Math.sin(t.nodT * Math.PI * 0.5) * 0.26
        : 0;

      // Wider beat lean/yaw/roll — character moments need to READ clearly
      const beatLeanTarget =
        beat === 1 ? -0.16 :   // lean back — lost in memory
        beat === 2 ?  0.18 :   // lean forward — caring/earnest
        beat === 4 ? -0.05 :   // upright — authoritative
                     0.06;
      const beatYawTarget =
        beat === 1 ?  0.38 :   // look well aside — truly reminiscing
        beat === 4 ? -0.12 :   // square to player — direct eye contact
                     0;
      const beatRollTarget =
        beat === 1 ?  0.08 :   // tilt right — introspective
        beat === 2 ? -0.07 :   // tilt left — empathetic
        beat === 4 ?  0.01 :   // level — authority
                     0.03;
      t.beatLean += (beatLeanTarget - t.beatLean) * Math.min(1, safeDt * 2.5);
      t.beatYaw  += (beatYawTarget  - t.beatYaw)  * Math.min(1, safeDt * 2.0);
      t.beatRoll += (beatRollTarget - t.beatRoll) * Math.min(1, safeDt * 2.5);

      // ── Spring-driven breathing + sway ────────────────────────────
      // Raw sine targets — the spring chases these with inertia so the
      // body overshoots and settles, giving mass to every movement.
      const breathDepth = 1 + 0.45 * Math.sin(time * 0.21);
      const targetY = Math.sin(time * 1.45) * 0.082 * breathDepth
                    + Math.sin(time * 0.70 + 1.0) * 0.022;
      const targetX = Math.sin(time * 0.37) * 0.065;
      const targetZ = Math.sin(time * 0.37) * 0.080
                    + Math.sin(time * 0.26) * 0.026
                    + t.beatRoll;

      // Spring: F = (target - pos) * stiffness − velocity * damping
      // k=15, d=3.6 → ~18% overshoot — more elastic, reads as alive.
      const ks = 15, kd = 3.6;
      t.svY += ((targetY - t.spY) * ks - t.svY * kd) * safeDt;
      t.spY += t.svY * safeDt;
      t.svX += ((targetX - t.spX) * ks - t.svX * kd) * safeDt;
      t.spX += t.svX * safeDt;
      t.svZ += ((targetZ - t.spZ) * ks - t.svZ * kd) * safeDt;
      t.spZ += t.svZ * safeDt;

      bob.position.y = t.spY;
      bob.position.x = t.spX;
      bob.rotation.z = t.spZ;

      // ── Soft player gaze ──────────────────────────────────────────
      // The diver's body subtly orients toward the player's X position.
      // atan2(relX, relZ) gives the signed angle; we blend 25% of it so
      // it reads as "awareness" rather than billboard tracking.
      {
        const relX = playerPositionRef.current.x - DIVER_POS[0];
        const relZ = playerPositionRef.current.z - DIVER_POS[2];
        const rawGaze = Math.atan2(relX, Math.abs(relZ)) * 0.25;
        const gazeTarget = THREE.MathUtils.clamp(rawGaze, -0.28, 0.28);
        t.gaze += (gazeTarget - t.gaze) * Math.min(1, safeDt * 1.8);
      }
      // ── Glance ────────────────────────────────────────────────────
      const beatProgress = (time % 7.0) / 7.0;
      const beatGlance = beatProgress > 0.72
        ? Math.sin((beatProgress - 0.72) / 0.28 * Math.PI) * 0.30
        : 0;
      bob.rotation.y = Math.sin(time * 0.31 + 0.6) * (0.110 + beatGlance)
                     + Math.sin(time * 0.13 + 2.1) * 0.050
                     + t.beatYaw
                     + t.gaze;

      // ── Pitch (breathing lean + beat lean + nod impulse) ──────────
      bob.rotation.x = (st === 'handover')
        ? bob.rotation.x
        : Math.sin(time * 0.45) * 0.020 - t.spY * 0.28 + t.beatLean + nod;
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
      // ── Anticipation ──────────────────────────────────────────────
      // First ~16%: he settles back a touch and draws the mask in
      // toward his chest before committing to the offer.
      const antic = u < 0.16 ? Math.sin((u / 0.16) * Math.PI) : 0;
      // ── Present ───────────────────────────────────────────────────
      const pr = THREE.MathUtils.clamp((u - 0.12) / 0.88, 0, 1);
      const bk = 1.5;
      const pc = pr - 1;
      const present = pr <= 0 ? 0 : 1 + pc * pc * ((bk + 1) * pc + bk);
      // Torso bows forward on the offer — visible lean sells the intention.
      // Keep a faint breath component so he doesn't freeze entirely.
      const handoverBreath = Math.sin(time * 1.45) * 0.016;
      bob.rotation.x = antic * 0.14 - present * 0.42 + handoverBreath;
      bob.rotation.z = present * -0.11;  // lean right shoulder well forward
      if (maskRef.current) {
        // Mask rises on an arc from low in (anticipation pull-back) to
        // high-and-forward (full extension toward the player).
        const lift = Math.sin(THREE.MathUtils.clamp(present, 0, 1) * Math.PI * 0.5) * 0.32;
        // When fully extended: a slow breathe-in/out invites the player to take it.
        const holdBob = u > 0.85 ? Math.sin(time * 2.5 + 0.7) * 0.045 : 0;
        // Also tilt the mask slightly toward the player as it extends.
        maskRef.current.rotation.x = present * -0.15;
        maskRef.current.position.set(
          0,
          1.04 - antic * 0.15 + lift,
          0.40 - antic * 0.14 + present * 0.95 + holdBob,
        );
        const offerPulse = u > 0.85 ? 1 + Math.sin(time * 3.0) * 0.07 : 1;
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
      // He stays in place — no walking, just turns his back.
      // Brief inhale beat → smooth 180° turn → look-back → hold → fade.
      const turn = THREE.MathUtils.smoothstep(u, 0.05, 0.38);
      const settle = Math.sin(THREE.MathUtils.clamp((u - 0.30) / 0.18, 0, 1) * Math.PI)
                   * 0.08;
      const lookback = Math.sin(
        THREE.MathUtils.clamp((u - 0.42) / 0.14, 0, 1) * Math.PI
      ) * 0.38;
      bob.rotation.y = turn * Math.PI + settle - lookback;
      bob.position.y = 0;
      bob.position.x = 0;
      bob.rotation.z = 0;
      bob.rotation.x = 0;
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
      const lit = st === 'handover' && t.armT > 0.5;
      // Stronger glow + larger distance now that we dim the key during offer.
      const pulse = lit ? 1 + Math.sin(time * 3.0) * 0.28 : 0;
      maskLightRef.current.intensity = pulse * 9.0;
    }
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
      keyLightRef.current.intensity = (base + caustic + spawnBoost) * (1 - handoverDim) * fadeMult;
    }
    if (fillLightRef.current) {
      const caustic = (st === 'idle' || st === 'handover')
        ? Math.sin(time * 1.9 + 2.0) * 0.70
        : 0;
      const fadeMult = st === 'fading' ? (1 - t.fadeT) : 1;
      fillLightRef.current.intensity = (4.5 + caustic) * (1 - handoverDim * 1.25) * fadeMult;
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
          <mesh material={matMaskFrame}>
            <boxGeometry args={[0.40, 0.28, 0.18]} />
          </mesh>
          <mesh position={[0, 0, 0.10]} material={matMaskGlass}>
            <boxGeometry args={[0.32, 0.20, 0.02]} />
          </mesh>
          {/* Lens glint */}
          <mesh position={[-0.06, 0.04, 0.115]}>
            <boxGeometry args={[0.08, 0.04, 0.004]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} toneMapped={false} />
          </mesh>
          <mesh position={[-0.23, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          <mesh position={[ 0.23, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          <mesh position={[0.07, -0.18, 0.02]} material={matMaskFrame}>
            <boxGeometry args={[0.09, 0.10, 0.06]} />
          </mesh>
          {/* NV goggles — vivid green glow, clearly readable from 5m */}
          <group position={[0, 0.16, 0.06]}>
            <mesh position={[-0.11, 0, 0]} material={matMaskFrame}>
              <boxGeometry args={[0.11, 0.11, 0.11]} />
            </mesh>
            <mesh position={[ 0.11, 0, 0]} material={matMaskFrame}>
              <boxGeometry args={[0.11, 0.11, 0.11]} />
            </mesh>
            <mesh position={[-0.11, 0, 0.06]} material={matGoggles}>
              <boxGeometry args={[0.08, 0.08, 0.022]} />
            </mesh>
            <mesh position={[ 0.11, 0, 0.06]} material={matGoggles}>
              <boxGeometry args={[0.08, 0.08, 0.022]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
    </>
  );
};
