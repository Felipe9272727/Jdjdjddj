/**
 * BeardedDiver.tsx — Procedural hotel-uniformed NPC on Floor 2.
 *
 * Roblox R6 style (boxy, flat colors), but dressed as a bellhop / diver:
 *  - Brown beard + moustache
 *  - Bellhop hat (red, gold band)
 *  - Dark blue jacket with double row of brass buttons
 *  - White gloves holding a rebreather mask out toward the player
 *  - Black trousers + brown shoes
 *
 * Behavior:
 *  1. Appears with a "scare pop" when the elevator doors open on Floor 2
 *     (lights flicker once, scale-in from 0 → slight overshoot → settle).
 *  2. Idles with a slow breathing bob.
 *  3. Faces the player on the XZ plane.
 *  4. When the player walks within `INTERACT_DIST` units, fires
 *     `onHandover()` exactly once. Parent should add the rebreather +
 *     night-vision items + play the put-on overlay.
 *  5. After handover, the diver fades out and despawns.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - `useFrame` priority MUST be 0 (default). Never pass a non-zero priority.
 *  - No mesh attached to bones.
 *  - No SpotLight with distance={0} while alive.
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Anchor / interaction constants ────────────────────────────────────
// Elevator on Floor 2 lives at [0, 0, -10] (group). Doors are on the +Z
// face. The diver stands ~2 units past the doors so the player sees them
// as soon as the doors slide open.
/** Diver world position on Floor 2 — clear of the elevator door so the
 *  player can fully step out before the trigger fires. Visible from
 *  inside the elevator through the open doors. */
export const DIVER_POS: readonly [number, number, number] = [0, 0, -6];
/** Player must be within this radius (XZ) to trigger the handover. */
export const DIVER_INTERACT_DIST = 2.8;
/** Tiny grace beat after the doors open before the diver pops in (s). */
const SCARE_DELAY_S = 0.15;
/** Duration of the scare pop animation (s). */
const POP_DURATION = 0.55;

interface BeardedDiverProps {
  /** True when the player is on Floor 2 AND the elevator doors are open. */
  visible: boolean;
  /** Player position — used for facing + proximity check. */
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  /** Called once when the player walks close enough to receive the gear. */
  onHandover: () => void;
  /** Set by parent once handover has happened — diver fades out. */
  handedOver: boolean;
}

export const BeardedDiver: React.FC<BeardedDiverProps> = ({
  visible,
  playerPositionRef,
  onHandover,
  handedOver,
}) => {
  // groupRef = whole NPC. innerRef = body inside, used for bob.
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const maskRef = useRef<THREE.Group>(null);
  // Spawn flash — additive sprite that pulses out over the pop duration.
  // Mounted in the JSX as a billboard. Updated each frame via its material.
  const flashMatRef = useRef<THREE.SpriteMaterial>(null);

  // ─── Local animation state ──────────────────────────────────────────
  // 0 = not started, 1 = scare popping, 2 = idle, 3 = handing over, 4 = fading
  // popT = scare pop progress 0..1
  // visT = overall visibility 0..1 (for fade out after handover)
  // armT = arm-extend progress 0..1 (extends just before handover)
  const animRef = useRef({
    phase: 0 as 0 | 1 | 2 | 3 | 4,
    popT: 0,
    visT: 0,
    armT: 0,
    delayLeft: 0,
    handoverFired: false,
  });
  const visibleRef = useRef(visible);
  const handedOverRef = useRef(handedOver);
  visibleRef.current = visible;
  handedOverRef.current = handedOver;

  // Reset state when visibility drops to false (player left Floor 2)
  useEffect(() => {
    if (!visible) {
      animRef.current = {
        phase: 0,
        popT: 0,
        visT: 0,
        armT: 0,
        delayLeft: 0,
        handoverFired: false,
      };
    } else {
      // Visible: start the pop IMMEDIATELY. No delay gate — the player
      // sees the diver appear with the overshoot scale animation as soon
      // as the doors are open. We learned earlier that a delay gate can
      // hide the NPC entirely if the useEffect / useFrame order isn't
      // what we expect.
      animRef.current.phase = 1;
      animRef.current.popT = 0;
      animRef.current.visT = 1;
      animRef.current.armT = 0;
      animRef.current.handoverFired = false;
    }
  }, [visible]);

  useFrame((state, dt) => {
    const safeDt = Math.min(dt, 0.033);
    const a = animRef.current;
    const g = groupRef.current;
    const inner = innerRef.current;
    if (!g || !inner) return;

    // ── Visibility cleanup ──────────────────────────────────────────
    if (!visibleRef.current) {
      g.visible = false;
      return;
    }

    // Always force-visible + scale=1 while phases 0..3 run. Belt-and-
    // braces: if anything in the React tree ever resets the scale or
    // visibility prop, we re-assert it every frame. The pop overlay below
    // adds the "scare" feel via an additive sprite on top, without
    // touching the diver's own transform.
    if (a.phase >= 0 && a.phase < 4) {
      g.visible = true;
      g.scale.setScalar(1);
      inner.position.z = 0;
      inner.rotation.x = 0;
    }

    // ── Phase 1 progress (drives the spawn flash sprite) ──
    if (a.phase === 1) {
      a.popT = Math.min(1, a.popT + safeDt / POP_DURATION);
      a.visT = Math.min(1, a.visT + safeDt * 6);
      if (a.popT >= 1) a.phase = 2;
    }
    // Spawn flash opacity follows pop progress. Starts bright at popT=0,
    // fades to 0 by popT=1. Continues fading to 0 once we're past phase 1.
    if (flashMatRef.current) {
      const k = a.phase === 1 ? (1 - a.popT) : 0;
      flashMatRef.current.opacity = k * 1.1;
    }

    // ── Common: face the player on XZ ──────────────────────────────
    const pp = playerPositionRef.current;
    const dx = pp.x - DIVER_POS[0];
    const dz = pp.z - DIVER_POS[2];
    if (dx * dx + dz * dz > 1e-3) {
      // Atan2 returns the angle of (dx, dz) in the XZ plane.
      // We want the diver's local +Z to point at the player. Mesh default
      // forward is +Z (after the body's own rotation = 0).
      const targetY = Math.atan2(dx, dz);
      // Smooth turn
      let cur = g.rotation.y;
      let d2 = targetY - cur;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      g.rotation.y = cur + d2 * Math.min(1, 6 * safeDt);
    }

    // ── Phase 2: idle ──────────────────────────────────────────────
    if (a.phase === 2) {
      const t = state.clock.elapsedTime;
      // Breathing bob — chest rises, head bobs slightly
      const breath = Math.sin(t * 1.6) * 0.04;
      inner.position.y = breath;
      // Subtle sway
      inner.rotation.z = Math.sin(t * 0.7) * 0.025;

      // Check proximity → start handover
      if (!a.handoverFired) {
        const dxp = pp.x - DIVER_POS[0];
        const dzp = pp.z - DIVER_POS[2];
        if (dxp * dxp + dzp * dzp < DIVER_INTERACT_DIST * DIVER_INTERACT_DIST) {
          a.handoverFired = true;
          a.phase = 3;
          a.armT = 0;
          onHandover();
        }
      }
    }

    // ── Phase 3: handover — arms extend ──────────────────────────────
    if (a.phase === 3) {
      a.armT = Math.min(1, a.armT + safeDt * 2.0);
      // Arms rotate forward (around X, in local space). Right arm goes
      // first, then left arm follows the mask presentation.
      if (armRRef.current) {
        const k = a.armT;
        armRRef.current.rotation.x = -1.1 * k;
      }
      if (armLRef.current) {
        const k = THREE.MathUtils.clamp(a.armT - 0.15, 0, 1);
        armLRef.current.rotation.x = -1.05 * k;
      }
      if (maskRef.current) {
        // Mask drifts forward in the diver's hands toward the player
        const k = a.armT;
        maskRef.current.position.set(0, 1.32 - 0.1 * k, 0.55 + 0.5 * k);
      }
      // After 1.4s, start fading out (the put-on overlay covers the player view)
      if (handedOverRef.current && a.armT >= 1) {
        a.phase = 4;
      }
    }

    // ── Phase 4: fade out and despawn ───────────────────────────────
    if (a.phase === 4) {
      a.visT = Math.max(0, a.visT - safeDt * 0.6);
      const v = a.visT;
      g.scale.setScalar(0.85 + v * 0.15);
      // Apply opacity to all materials by traversing once
      g.traverse((child: any) => {
        if (child.material) {
          // Mark transparent if not already, set opacity
          const m = child.material;
          if (Array.isArray(m)) {
            for (const mm of m) {
              mm.transparent = true;
              mm.opacity = v;
            }
          } else {
            m.transparent = true;
            m.opacity = v;
          }
        }
      });
      if (v <= 0.01) {
        g.visible = false;
      }
    }
  });

  // ─── Materials (memoized) ──────────────────────────────────────────
  const matSkin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D9A074', roughness: 0.8 }), []);
  const matBeard = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a241a', roughness: 0.9 }), []);
  const matHair = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.95 }), []);
  const matJacket = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a2a4a', roughness: 0.75 }), []);
  const matJacketTrim = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a1010', roughness: 0.7 }), []);
  const matBrass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D4AF37', metalness: 0.85, roughness: 0.25 }), []);
  const matGlove = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F0EBE0', roughness: 0.65 }), []);
  const matTrousers = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0a14', roughness: 0.85 }), []);
  const matShoe = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.5 }), []);
  const matHatRed = useMemo(() => new THREE.MeshStandardMaterial({ color: '#A02020', roughness: 0.7 }), []);
  const matEyeWhite = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 }), []);
  const matEyePupil = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.4 }), []);
  const matMaskGlass = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#67E8F9',
    emissive: '#0e7490',
    emissiveIntensity: 0.6,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  }), []);
  const matMaskFrame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E7490', roughness: 0.55, metalness: 0.4 }), []);
  const matMaskStrap = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 }), []);
  const matGoggles = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a3a2a',
    emissive: '#10B981',
    emissiveIntensity: 0.7,
    roughness: 0.3,
    toneMapped: false,
  }), []);

  // Roblox R6 proportions — height ~5.0 units total
  // Studs reference: legs 1.0, torso 2.0, head 1.0 (with hat ~1.5)
  // We scale down to ~1.8 m world units for game scale.
  // Stand position so feet touch Y=0.
  //
  // Layout per part (local Y):
  //   shoes:   0.10
  //   legs:    0.50
  //   torso:   1.10
  //   shoulders/arms: 1.20
  //   head:    1.75
  //   hat:     2.05

  return (
    <group ref={groupRef} position={[DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]]} visible={false}>
      {/* Bright key light right ON the diver — pulls him out of the cave
          gloom. Two stacked point lights give a warm "hotel lantern" wash
          that reads from far away. Distance is finite (never 0). */}
      <pointLight position={[0, 1.8, 0]} intensity={3.4} distance={8} decay={1.2} color="#FFE9A8" />
      <pointLight position={[0, 0.6, 0]} intensity={2.0} distance={4} decay={1.6} color="#FFD080" />
      {/* Atmospheric ground glow — sells him as a beacon */}
      <sprite position={[0, 0.05, 0]} scale={[4, 1.4, 1]}>
        <spriteMaterial color="#FFE9A8" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Soft halo behind the diver — billboard, additive */}
      <sprite position={[0, 1.4, 0]} scale={[5, 5, 1]}>
        <spriteMaterial color="#FFC880" transparent opacity={0.18} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* Spawn flash — fires bright at appearance, fades out over POP_DURATION.
          Material opacity is driven by useFrame via flashMatRef. */}
      <sprite position={[0, 1.4, 0]} scale={[9, 9, 1]}>
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

      <group ref={innerRef}>
        {/* ── SHOES ── */}
        <mesh position={[-0.18, 0.07, 0.12]} material={matShoe}>
          <boxGeometry args={[0.30, 0.14, 0.36]} />
        </mesh>
        <mesh position={[ 0.18, 0.07, 0.12]} material={matShoe}>
          <boxGeometry args={[0.30, 0.14, 0.36]} />
        </mesh>

        {/* ── LEGS ── */}
        <mesh position={[-0.18, 0.45, 0]} material={matTrousers}>
          <boxGeometry args={[0.30, 0.62, 0.30]} />
        </mesh>
        <mesh position={[ 0.18, 0.45, 0]} material={matTrousers}>
          <boxGeometry args={[0.30, 0.62, 0.30]} />
        </mesh>
        {/* Belt */}
        <mesh position={[0, 0.79, 0]} material={matJacketTrim}>
          <boxGeometry args={[0.66, 0.10, 0.36]} />
        </mesh>
        <mesh position={[0, 0.79, 0.19]} material={matBrass}>
          <boxGeometry args={[0.10, 0.08, 0.02]} />
        </mesh>

        {/* ── TORSO ── jacket */}
        <mesh position={[0, 1.20, 0]} material={matJacket}>
          <boxGeometry args={[0.78, 0.78, 0.40]} />
        </mesh>
        {/* Lapels — red trim */}
        <mesh position={[-0.20, 1.40, 0.205]} rotation={[0, 0, 0.12]} material={matJacketTrim}>
          <boxGeometry args={[0.14, 0.42, 0.02]} />
        </mesh>
        <mesh position={[ 0.20, 1.40, 0.205]} rotation={[0, 0, -0.12]} material={matJacketTrim}>
          <boxGeometry args={[0.14, 0.42, 0.02]} />
        </mesh>
        {/* Brass buttons — double row */}
        {[-0.10, 0.10].map((bx, bi) => (
          <React.Fragment key={`btnrow-${bi}`}>
            {[1.50, 1.32, 1.14, 0.96].map((by, yi) => (
              <mesh key={yi} position={[bx, by, 0.215]} material={matBrass}>
                <sphereGeometry args={[0.035, 8, 6]} />
              </mesh>
            ))}
          </React.Fragment>
        ))}
        {/* Bowtie under the chin */}
        <mesh position={[0, 1.58, 0.22]} material={matJacketTrim}>
          <boxGeometry args={[0.18, 0.08, 0.04]} />
        </mesh>
        <mesh position={[0, 1.58, 0.225]} material={matBrass}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
        </mesh>

        {/* ── ARMS ── pivot at shoulder, hangs to the side ── */}
        <group ref={armLRef} position={[-0.50, 1.50, 0]}>
          <mesh position={[0, -0.32, 0]} material={matJacket}>
            <boxGeometry args={[0.26, 0.64, 0.26]} />
          </mesh>
          {/* Cuff trim */}
          <mesh position={[0, -0.62, 0]} material={matJacketTrim}>
            <boxGeometry args={[0.272, 0.06, 0.272]} />
          </mesh>
          {/* Glove (hand) */}
          <mesh position={[0, -0.74, 0.05]} material={matGlove}>
            <boxGeometry args={[0.24, 0.18, 0.30]} />
          </mesh>
        </group>

        <group ref={armRRef} position={[ 0.50, 1.50, 0]}>
          <mesh position={[0, -0.32, 0]} material={matJacket}>
            <boxGeometry args={[0.26, 0.64, 0.26]} />
          </mesh>
          <mesh position={[0, -0.62, 0]} material={matJacketTrim}>
            <boxGeometry args={[0.272, 0.06, 0.272]} />
          </mesh>
          <mesh position={[0, -0.74, 0.05]} material={matGlove}>
            <boxGeometry args={[0.24, 0.18, 0.30]} />
          </mesh>
        </group>

        {/* ── HEAD ── */}
        <mesh position={[0, 1.80, 0]} material={matSkin}>
          <boxGeometry args={[0.50, 0.50, 0.50]} />
        </mesh>
        {/* Eyes — recessed slightly forward */}
        <mesh position={[-0.10, 1.84, 0.255]} material={matEyeWhite}>
          <boxGeometry args={[0.10, 0.10, 0.02]} />
        </mesh>
        <mesh position={[ 0.10, 1.84, 0.255]} material={matEyeWhite}>
          <boxGeometry args={[0.10, 0.10, 0.02]} />
        </mesh>
        <mesh position={[-0.10, 1.84, 0.27]} material={matEyePupil}>
          <boxGeometry args={[0.05, 0.06, 0.02]} />
        </mesh>
        <mesh position={[ 0.10, 1.84, 0.27]} material={matEyePupil}>
          <boxGeometry args={[0.05, 0.06, 0.02]} />
        </mesh>

        {/* ── BEARD ── boxy, covers lower half of head */}
        <mesh position={[0, 1.66, 0.13]} material={matBeard}>
          <boxGeometry args={[0.48, 0.30, 0.30]} />
        </mesh>
        {/* Moustache */}
        <mesh position={[0, 1.74, 0.255]} material={matBeard}>
          <boxGeometry args={[0.36, 0.07, 0.04]} />
        </mesh>
        {/* Sideburns (subtle) */}
        <mesh position={[-0.245, 1.74, 0.05]} material={matBeard}>
          <boxGeometry args={[0.02, 0.20, 0.32]} />
        </mesh>
        <mesh position={[ 0.245, 1.74, 0.05]} material={matBeard}>
          <boxGeometry args={[0.02, 0.20, 0.32]} />
        </mesh>

        {/* ── HAT ── bellhop pillbox, red with gold band */}
        {/* Hair fringe visible under the hat */}
        <mesh position={[0, 2.04, 0.04]} material={matHair}>
          <boxGeometry args={[0.46, 0.06, 0.36]} />
        </mesh>
        {/* Crown */}
        <mesh position={[0, 2.18, 0]} material={matHatRed}>
          <cylinderGeometry args={[0.24, 0.26, 0.26, 12]} />
        </mesh>
        {/* Brim */}
        <mesh position={[0, 2.06, 0]} material={matHatRed}>
          <cylinderGeometry args={[0.28, 0.28, 0.05, 16]} />
        </mesh>
        {/* Gold band */}
        <mesh position={[0, 2.10, 0]} material={matBrass}>
          <cylinderGeometry args={[0.262, 0.262, 0.03, 16]} />
        </mesh>
        {/* Hat badge front */}
        <mesh position={[0, 2.18, 0.245]} material={matBrass}>
          <boxGeometry args={[0.12, 0.10, 0.02]} />
        </mesh>

        {/* ── MASK / REBREATHER held in hands ── */}
        <group ref={maskRef} position={[0, 1.32, 0.55]}>
          {/* Rounded mask body */}
          <mesh material={matMaskFrame}>
            <boxGeometry args={[0.38, 0.26, 0.18]} />
          </mesh>
          {/* Glass viewport */}
          <mesh position={[0, 0, 0.10]} material={matMaskGlass}>
            <boxGeometry args={[0.30, 0.18, 0.02]} />
          </mesh>
          {/* Highlight on glass */}
          <mesh position={[-0.06, 0.04, 0.115]}>
            <boxGeometry args={[0.08, 0.04, 0.005]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.7} toneMapped={false} />
          </mesh>
          {/* Strap loops */}
          <mesh position={[-0.21, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          <mesh position={[ 0.21, 0, 0]} material={matMaskStrap}>
            <boxGeometry args={[0.04, 0.10, 0.04]} />
          </mesh>
          {/* Breathing tube exit (bottom) */}
          <mesh position={[0.06, -0.16, 0.02]} material={matMaskFrame}>
            <boxGeometry args={[0.08, 0.10, 0.06]} />
          </mesh>
          {/* Small NV goggles clipped to the top of the mask */}
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

// ─── Hook: triggers handover exactly once + tracks visibility ──────────
/**
 * useDiverHandover — coordinates the diver lifecycle from the parent:
 *  visible:    true on Floor 2 while gear hasn't been given yet
 *  onHandover: invoked once by the diver when the player approaches
 *  handedOver: latched once handover starts, drives the fade
 *
 * Usage:
 *   const diver = useDiverHandover(currentLevel === 2 && doorOpenAmount > 0.6, () => {
 *     // give items, play put-on overlay, etc.
 *   });
 *   <BeardedDiver visible={diver.visible} handedOver={diver.handedOver}
 *       onHandover={diver.handleHandover} playerPositionRef={ppRef} />
 */
export function useDiverHandover(allowVisible: boolean, onHandoverImpl: () => void) {
  const [handedOver, setHandedOver] = useState(false);

  // Reset latch when the player leaves Floor 2 so a future return spawns
  // a fresh diver. allowVisible becomes false → reset.
  useEffect(() => {
    if (!allowVisible) {
      setHandedOver(false);
    }
  }, [allowVisible]);

  const handleHandover = useCallback(() => {
    setHandedOver(true);
    onHandoverImpl();
  }, [onHandoverImpl]);

  return {
    visible: allowVisible && true,
    handedOver,
    handleHandover,
  };
}
