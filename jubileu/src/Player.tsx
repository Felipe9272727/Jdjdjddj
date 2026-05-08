import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL, SPEED, PR, EZ_START, HOUSE_DOOR_X, HOUSE_DOOR_Z, wallsForState, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, CASHIER_INTERACT_DIST, CASHIER_POS, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { resolveCollision as _resolve } from './physics';

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

// ─── Arm bone naming patterns (comprehensive) ───────────────────────────
// Covers Mixamo, Unity, Unreal, and generic naming conventions
const RIGHT_ARM_PATTERNS = [
  'mixamorig:rightarm', 'rightarm', 'right_arm', 'arm_r', 'upperarm_r',
  'upperarmright', 'r_upperarm', 'rupperarm', 'upperarm.r', 'bip01_r_upperarm',
];
const RIGHT_FOREARM_PATTERNS = [
  'mixamorig:rightforearm', 'rightforearm', 'right_forearm', 'forearm_r',
  'lowerarm_r', 'lowerarmright', 'r_forearm', 'rforearm', 'forearm.r',
  'lowerarm.r', 'bip01_r_forearm',
];
const RIGHT_HAND_PATTERNS = [
  'mixamorig:righthand', 'righthand', 'right_hand', 'hand_r', 'handright',
  'r_hand', 'rhand', 'hand.r', 'bip01_r_hand',
];

function findBoneByPatterns(root: THREE.Object3D, patterns: string[]): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((c) => {
    if (found) return;
    if ((c as any).isBone || c.type === 'Bone') {
      const name = c.name.toLowerCase();
      for (const p of patterns) {
        if (name.includes(p)) { found = c as THREE.Bone; return; }
      }
    }
  });
  return found;
}

// Pickup animation timing (seconds)
const PICKUP_EXTEND = 0.3;
const PICKUP_HOLD = 0.5;   // 0.3 → 0.8
const PICKUP_RETRACT = 0.4; // 0.8 → 1.2
const PICKUP_TOTAL = PICKUP_EXTEND + PICKUP_HOLD + PICKUP_RETRACT;

const Avatar = ({ animation, visible = true, onSceneReady, pickupTrigger = 0 }: {
  animation: 'Idle' | 'Walking';
  visible?: boolean;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  pickupTrigger?: number;
}) => {
  const { scene, animations: walkAnims } = useGLTF(WALKING_URL) as any;
  const { animations: idleAnims } = useGLTF(IDLE_URL) as any;
  const { actions } = useAnimations(useMemo(() => {
      const w = walkAnims.map((a: any) => a.clone(true)); const i = idleAnims.map((a: any) => a.clone(true));
      if (w[0]) w[0].name = "Walking"; if (i[0]) i[0].name = "Idle";
      return [...i, ...w];
  }, [walkAnims, idleAnims]), scene);
  const hipsRef = useRef<any>(null);
  const hipsBindRef = useRef<Vector3 | null>(null);
  const opRef = useRef(1.0);
  // Cache the meshes once on mount so the per-frame visibility/opacity update
  // doesn't traverse the whole skeleton tree. This was a measurable mobile cost.
  const meshesRef = useRef<any[]>([]);
  // Computed once from the scene bounding box: the Y offset (in primitive-local
  // units) that puts the model's lowest vertex on Y=0. Beats hardcoding 0.75
  // (which only worked for the original GLB; updated assets had different
  // origin offsets and made the avatar visibly float).
  const [groundY, setGroundY] = useState(0);

  // ─── Arm bone refs for procedural pickup animation ───────────────────
  const armBoneRef = useRef<THREE.Bone | null>(null);
  const forearmBoneRef = useRef<THREE.Bone | null>(null);
  const handBoneRef = useRef<THREE.Bone | null>(null);
  const armOrigRotRef = useRef(new Euler());
  const forearmOrigRotRef = useRef(new Euler());
  const [hasArmBones, setHasArmBones] = useState(false);

  // Pickup animation state
  const pickupTimeRef = useRef(-1); // -1 = idle, >=0 = animating
  const lastPickupTriggerRef = useRef(0);

  // Procedural arm ref (fallback when no arm bones found)
  const procArmRef = useRef<THREE.Group>(null);

  // Ref mirror of `visible` prop so useFrame always reads the latest value
  // without depending on the closure being fresh.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
     const meshes: any[] = [];
     const boneNames: string[] = [];
     scene.traverse((c: any) => {
       if (c.isMesh) {
           if (c.material) {
               c.material.transparent = true; c.material.depthWrite = true; c.material.alphaTest = 0;
               c.material.side = THREE.DoubleSide; c.material.metalness = 0; c.material.roughness = 1;
               c.material.needsUpdate = true;
           }
           meshes.push(c);
       }
       if ((c.isBone || c.type === 'Bone') && !hipsRef.current) {
           if (c.name.toLowerCase().includes('hips') || c.name.toLowerCase().includes('root')) {
               hipsRef.current = c;
               hipsBindRef.current = c.position.clone();
           }
       }
       if (c.isBone || c.type === 'Bone') {
           boneNames.push(c.name);
       }
     });
     meshesRef.current = meshes;
     console.log('[Avatar] All bones found:', boneNames);

     // Find right arm bones with comprehensive pattern matching
     const arm = findBoneByPatterns(scene, RIGHT_ARM_PATTERNS);
     const forearm = findBoneByPatterns(scene, RIGHT_FOREARM_PATTERNS);
     const hand = findBoneByPatterns(scene, RIGHT_HAND_PATTERNS);

     armBoneRef.current = arm;
     forearmBoneRef.current = forearm;
     handBoneRef.current = hand;
     const found = !!(arm || forearm);
     setHasArmBones(found);

     if (arm) { armOrigRotRef.current.copy(arm.rotation); console.log('[Avatar] Found upper arm bone:', arm.name); }
     if (forearm) { forearmOrigRotRef.current.copy(forearm.rotation); console.log('[Avatar] Found forearm bone:', forearm.name); }
     if (hand) console.log('[Avatar] Found hand bone:', hand.name);
     if (!found) console.warn('[Avatar] No arm bones found — will use procedural arm fallback');

     // Bounding box in scene-local space (before our scale={[30,30,30]} multiplier).
     // We want the lowest visible point at world Y=0, so the primitive lift in
     // primitive-local units = -bbox.min.y.
     try {
       scene.updateMatrixWorld(true);
       const box = new THREE.Box3().setFromObject(scene);
       if (Number.isFinite(box.min.y)) setGroundY(-box.min.y);
     } catch { /* ignored */ }
  }, [scene]);

  // Notify parent when scene is ready (for bone manipulation).
  // Use a ref for the callback so this effect only depends on [scene].
  // This prevents the effect from thrashing (set→null→set) if the callback
  // identity ever changes across re-renders — which was the original cause
  // of the avatar disappearing when buying items in the shop.
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;
  useEffect(() => {
    if (onSceneReadyRef.current && scene) onSceneReadyRef.current(scene);
    return () => { if (onSceneReadyRef.current) onSceneReadyRef.current(null); };
  }, [scene]);

  // ── Detect pickup trigger changes ──
  useEffect(() => {
    if (pickupTrigger !== lastPickupTriggerRef.current && pickupTrigger > 0) {
      lastPickupTriggerRef.current = pickupTrigger;
      pickupTimeRef.current = 0;
    }
  }, [pickupTrigger]);

  // ── Pickup bone animation: HIGH PRIORITY (runs AFTER AnimationMixer) ──
  // useFrame priority 1 ensures this runs after useAnimations' mixer.update()
  // which happens at default priority 0. This is critical — if we ran at the
  // same priority, the mixer would overwrite our bone rotations next frame.
  useFrame((_, dt) => {
    if (pickupTimeRef.current < 0) return;

    const safeDt = Math.min(dt, 0.05);
    pickupTimeRef.current += safeDt;
    const t = pickupTimeRef.current;

    if (t >= PICKUP_TOTAL) {
      // Animation complete — restore original rotations
      pickupTimeRef.current = -1;
      if (armBoneRef.current) {
        armBoneRef.current.rotation.copy(armOrigRotRef.current);
      }
      if (forearmBoneRef.current) {
        forearmBoneRef.current.rotation.copy(forearmOrigRotRef.current);
      }
      return;
    }

    // Calculate extension factor (0 = rest, 1 = fully extended)
    let ext = 0;
    if (t < PICKUP_EXTEND) {
      // Phase 1: Ease-out extend
      const p = t / PICKUP_EXTEND;
      ext = 1 - Math.pow(1 - p, 3);
    } else if (t < PICKUP_EXTEND + PICKUP_HOLD) {
      // Phase 2: Hold extended
      ext = 1;
    } else {
      // Phase 3: Ease-in retract
      const p = (t - PICKUP_EXTEND - PICKUP_HOLD) / PICKUP_RETRACT;
      ext = 1 - p * p;
    }

    // Apply bone rotations (override what the AnimationMixer set)
    if (armBoneRef.current) {
      const orig = armOrigRotRef.current;
      // Rotate upper arm forward (shoulder flexion)
      armBoneRef.current.rotation.x = orig.x - ext * 1.2;
      // Slight lateral rotation for natural look
      armBoneRef.current.rotation.z = orig.z - ext * 0.15;
    }
    if (forearmBoneRef.current) {
      const orig = forearmOrigRotRef.current;
      // Bend elbow
      forearmBoneRef.current.rotation.x = orig.x - ext * 0.6;
    }
  }, 1); // Priority 1: runs AFTER AnimationMixer at priority 0

  // ── Visibility / opacity + procedural arm fallback (priority 0) ──
  useFrame((s, dt) => {
      // Reset only X/Z of the hips bone — keep Y so the natural walking bob
      // (vertical motion baked into the animation) plays through. Zeroing Y
      // here was producing the visual "float" because the avatar's contact
      // with the floor depends on the bob's lowest point.
      if (hipsRef.current && hipsBindRef.current) {
          hipsRef.current.position.x = hipsBindRef.current.x;
          hipsRef.current.position.z = hipsBindRef.current.z;
      }
      const tgt = visibleRef.current ? 1 : 0; opRef.current = THREE.MathUtils.lerp(opRef.current, tgt, 8 * dt);
      const op = opRef.current;
      const visibleMesh = op > 0.01;
      const meshes = meshesRef.current;
      for (let i = 0; i < meshes.length; i++) {
          const m = meshes[i];
          if (m.material) m.material.opacity = op;
          m.visible = visibleMesh;
      }

      // ── Procedural arm fallback positioning ──
      if (!hasArmBones && procArmRef.current) {
        const g = procArmRef.current;
        const t = pickupTimeRef.current;
        if (t < 0) {
          g.visible = false;
        } else {
          g.visible = true;
          let ext = 0;
          if (t < PICKUP_EXTEND) {
            const p = t / PICKUP_EXTEND;
            ext = 1 - Math.pow(1 - p, 3);
          } else if (t < PICKUP_EXTEND + PICKUP_HOLD) {
            ext = 1;
          } else if (t < PICKUP_TOTAL) {
            const p = (t - PICKUP_EXTEND - PICKUP_HOLD) / PICKUP_RETRACT;
            ext = 1 - p * p;
          }
          // Position: the procedural arm lives in the avatar's group space.
          // The primitive is at scale [30,30,30], so we need to work in the
          // group-local coordinate system.
          g.position.set(0.35, 1.35, 0); // right shoulder offset
          // Tilt forward based on extension
          g.rotation.x = -ext * 0.8;
        }
      }
  });

  useEffect(() => {
     const a = actions[animation === 'Walking' ? 'Walking' : 'Idle']; const o = actions[animation === 'Walking' ? 'Idle' : 'Walking'];
     if (o) o.fadeOut(0.2); if (a) a.reset().fadeIn(0.2).play();
  }, [animation, actions]);
  // groundY comes from the scene bbox above: it's the local-units offset that
  // puts the lowest vertex on Y=0 after the scale multiplier is applied.
  return (
    <group>
      <primitive object={scene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
      {/* Procedural arm fallback — only rendered when no arm bones found */}
      {!hasArmBones && (
        <group ref={procArmRef} visible={false}>
          {/* Upper arm */}
          <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.3, 8]} />
            <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.02, 0.35]} rotation={[Math.PI / 2 + 0.15, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 0.28, 8]} />
            <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -0.04, 0.5]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
          </mesh>
          {/* Fingers (simplified) */}
          {[0, 1, 2, 3].map(i => {
            const angle = (i - 1.5) * 0.2;
            return (
              <mesh key={i} position={[Math.sin(angle) * 0.03, -0.04, 0.56]} rotation={[0.3, 0, angle * 0.5]}>
                <cylinderGeometry args={[0.012, 0.01, 0.06, 6]} />
                <meshStandardMaterial color="#D4A574" roughness={0.9} metalness={0} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};

interface PlayerProps {
  moveInput: React.MutableRefObject<{ x: number; y: number }>;
  lookInput: React.MutableRefObject<{ x: number; y: number }>;
  isDesktop: boolean;
  onEnterElevator: () => void;
  doorsClosed: boolean;
  currentLevel: number;
  onInteractionUpdate: (canInteract: boolean) => void;
  onNpcInteractionUpdate: (canInteract: boolean) => void;
  onCashierInteractionUpdate?: (canInteract: boolean) => void;
  houseDoorOpen: boolean;
  active: boolean;
  zoomLevel: number;
  npcPositionRef: React.MutableRefObject<Vector3>;
  dialogueTargetRef?: React.MutableRefObject<Vector3>;
  dialogueOpen: boolean;
  sharedPositionRef: React.MutableRefObject<Vector3>;
  sharedRotationYRef: React.MutableRefObject<number>;
  cameraThetaRef: React.MutableRefObject<number>;
  cameraShakeRef: React.MutableRefObject<boolean>;
  positionCmdRef: React.MutableRefObject<{ x: number; y: number; z: number } | null>;
  onElevatorZoneChange: (inside: boolean) => void;
  /** Called when avatar GLB scene is loaded, for bone manipulation */
  onAvatarScene?: (scene: THREE.Object3D | null) => void;
  /** Increment to trigger pickup arm animation */
  pickupTrigger?: number;
}

export const Player = ({ moveInput, lookInput, isDesktop, onEnterElevator, doorsClosed, currentLevel, onInteractionUpdate, onNpcInteractionUpdate, onCashierInteractionUpdate, houseDoorOpen, active, zoomLevel, npcPositionRef, dialogueTargetRef, dialogueOpen, sharedPositionRef, sharedRotationYRef, cameraThetaRef, cameraShakeRef, positionCmdRef, onElevatorZoneChange, onAvatarScene, pickupTrigger }: PlayerProps) => {
  const { camera, size } = useThree();
  const pos = useRef(new Vector3(0, 0, 8)); const charRot = useRef(new Euler(0, Math.PI, 0)); const camAng = useRef({ theta: Math.PI, phi: 0.2 });
  const avRef = useRef<any>(null); const camLookRef = useRef(new Vector3());
  const [anim, setAnim] = useState<'Idle' | 'Walking'>('Idle');
  const animRef = useRef<'Idle' | 'Walking'>('Idle');
  const elevTriggered = useRef(false); const HH = 1.6;
  const prevInsideElevatorRef = useRef(false);
  const _vRef = useRef<any>(null);
  if (_vRef.current === null) _vRef.current = Array.from({length:8}, () => new Vector3());
  const _v = _vRef;

  const timeRef = useRef(0);
  const camPosRef = useRef(new Vector3(0, 0, 8)); // smooth camera position
  const camInitRef = useRef(false); // sync camera to player pos on first frame
  const walls = useMemo(() => wallsForState(currentLevel, doorsClosed, houseDoorOpen), [currentLevel, doorsClosed, houseDoorOpen]);

  useEffect(() => {
    // When the level changes, only re-arm the elevator trigger if the
    // player will actually be OUTSIDE the elevator zone after the level
    // transition. Otherwise (e.g. caught/saved teleports the player to
    // z=-13 inside the elevator) we'd immediately fire onEnterElevator
    // and start a new countdown right after arrival. That manifested as
    // "level 2 auto-teleports back to lobby after 5s".
    elevTriggered.current = pos.current.z < EZ_START - 1;
  }, [currentLevel]);

  useFrame((state, dt) => {
    if (!active) return;
    // Clamp dt to prevent camera teleport on frame spikes (tab bg, GC, etc)
    const safeDt = Math.min(dt, 0.05);
    timeRef.current += safeDt;
    
    if (positionCmdRef && positionCmdRef.current) {
        pos.current.set(positionCmdRef.current.x, positionCmdRef.current.y, positionCmdRef.current.z);
        positionCmdRef.current = null;
        camInitRef.current = false; // force camera re-sync after teleport
        // If the teleport drops the player inside the elevator zone (e.g.
        // post-chase respawn), arm the trigger so the countdown only fires
        // when they LATER walk in on their own. Without this, the next
        // frame's z-check below would auto-start a ride to the lobby.
        if (pos.current.z < EZ_START - 1) elevTriggered.current = true;
    }
    
    const fp = zoomLevel < 0.5;
    if (sharedPositionRef) sharedPositionRef.current.copy(pos.current);
    if (sharedRotationYRef) sharedRotationYRef.current = charRot.current.y;
    // Bot reads this to map world deltas into camera-frame moveInput.
    if (cameraThetaRef) cameraThetaRef.current = camAng.current.theta;
    
    // Sync camera to player on first frame (prevents lerp from default pos)
    if (!camInitRef.current) {
        camInitRef.current = true;
        const ly = pos.current.y + HH;
        if (fp) {
            camera.position.set(pos.current.x, ly, pos.current.z);
        } else {
            const cx = pos.current.x + Math.sin(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cz = pos.current.z + Math.cos(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cy = Math.max(ly + Math.sin(camAng.current.phi)*zoomLevel, 0.2);
            camera.position.set(cx, cy, cz);
        }
        camera.lookAt(pos.current.x, ly, pos.current.z);
        camPosRef.current.copy(camera.position);
    }
    
    if (onElevatorZoneChange) {
        const inside = pos.current.z <= ELEVATOR_ZONE_Z && Math.abs(pos.current.x) <= ELEVATOR_ZONE_X;
        if (inside !== prevInsideElevatorRef.current) {
            prevInsideElevatorRef.current = inside;
            onElevatorZoneChange(inside);
        }
    }
    
    const shakeX = cameraShakeRef?.current ? (Math.sin(timeRef.current * 18) * 0.015 + Math.sin(timeRef.current * 31) * 0.008) : 0;
    const shakeY = cameraShakeRef?.current ? (Math.cos(timeRef.current * 22) * 0.012) : 0;

    // Camera focus during dialogue uses dialogueTargetRef (the actual NPC the player
    // is talking to: lobby NPC, Barney, etc.) and falls back to the lobby NPC ref so
    // existing call sites that don't pass a target still work.
    const dialogueFocusRef = dialogueTargetRef ?? npcPositionRef;
    if (dialogueOpen && dialogueFocusRef?.current) {
        if (animRef.current !== 'Idle') { animRef.current = 'Idle'; setAnim('Idle'); }
        if (avRef.current) { avRef.current.position.copy(pos.current); avRef.current.rotation.copy(charRot.current); }
        const nP = dialogueFocusRef.current; const pP = pos.current;
        const d2p = _v.current[0].subVectors(pP, nP).normalize(); if (d2p.lengthSq() < 1e-3) d2p.set(0,0,1);
        const tCam = _v.current[1].copy(nP).addScaledVector(d2p, 2.2); tCam.y += 1.75;
        const tLook = _v.current[2].copy(nP); tLook.y += 1.35;
        const dlgAlpha = Math.min(5 * safeDt, 0.4);
        camera.position.lerp(tCam, dlgAlpha);
        if (camLookRef.current.distanceTo(tLook) > 10) { camLookRef.current.copy(pP); camLookRef.current.y += 1.6; }
        camLookRef.current.lerp(tLook, dlgAlpha);
        camera.lookAt(camLookRef.current);
        (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp((camera as THREE.PerspectiveCamera).fov, 40, dlgAlpha); camera.updateProjectionMatrix();
        // Sync smooth refs for transition back to 3P
        camPosRef.current.copy(camera.position);
    } else {
        const sens = 0.003 * (fp ? 1.5 : 1.0);
        if (isDesktop) {
           if (lookInput.current.x || lookInput.current.y) { camAng.current.theta -= lookInput.current.x * sens * 500 * safeDt; camAng.current.phi += lookInput.current.y * sens * 500 * safeDt; lookInput.current.x = 0; lookInput.current.y = 0; }
        } else {
           if (lookInput.current.x || lookInput.current.y) { camAng.current.theta -= lookInput.current.x * (fp ? 1.5 : 1); camAng.current.phi += lookInput.current.y * (fp ? 1.5 : 1); lookInput.current.x = 0; lookInput.current.y = 0; }
        }
        camAng.current.phi = Math.max(fp ? -1.5 : -0.5, Math.min(fp ? 1.5 : 1.2, camAng.current.phi));

        const fwd = -moveInput.current.y; const strafe = moveInput.current.x; let moving = false;
        if (Math.abs(fwd) > 0.01 || Math.abs(strafe) > 0.01) {
            moving = true;
            const cd = _v.current[3].set(Math.sin(camAng.current.theta), 0, Math.cos(camAng.current.theta));
            const rd = _v.current[4].set(Math.sin(camAng.current.theta-Math.PI/2), 0, Math.cos(camAng.current.theta-Math.PI/2));
            const mv = _v.current[5].set(0,0,0).addScaledVector(cd, -fwd).addScaledVector(rd, -strafe).normalize().multiplyScalar(SPEED * safeDt);
            const nx = pos.current.x + mv.x, nz = pos.current.z + mv.z;

            const [rx, rz] = _resolve(nx, nz, PR, walls);
            pos.current.x = rx; pos.current.z = rz; pos.current.y = 0;

            if (fp) { charRot.current.y = camAng.current.theta + Math.PI; } else { const a = Math.atan2(mv.x, mv.z); let d = a - charRot.current.y; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; charRot.current.y += d*10*safeDt; }
            // Re-arm when player walks back out of the elevator zone, so a
            // later re-entry can fire onEnterElevator. Combined with the
            // teleport-aware setter at line ~152, the trigger only fires on
            // GENUINE walk-ins (never on respawn teleports).
            if (pos.current.z >= EZ_START - 1) elevTriggered.current = false;
            else if (!elevTriggered.current) { elevTriggered.current = true; onEnterElevator(); }
        }
        if (currentLevel === 1) { const dx = pos.current.x-HOUSE_DOOR_X; const dz = pos.current.z-HOUSE_DOOR_Z; onInteractionUpdate(Math.sqrt(dx*dx+dz*dz) < DOOR_INTERACT_DIST); } else { onInteractionUpdate(false); }
        if (currentLevel === 0 && npcPositionRef?.current) { onNpcInteractionUpdate(pos.current.distanceTo(npcPositionRef.current) < NPC_INTERACT_DIST); } else { onNpcInteractionUpdate(false); }
        if (currentLevel === 0 && onCashierInteractionUpdate) { const cdx = pos.current.x - CASHIER_POS.x; const cdz = pos.current.z - CASHIER_POS.z; onCashierInteractionUpdate(Math.sqrt(cdx*cdx + cdz*cdz) < CASHIER_INTERACT_DIST); } else if (onCashierInteractionUpdate) { onCashierInteractionUpdate(false); }
        const nextAnim = moving ? 'Walking' : 'Idle';
        if (nextAnim !== animRef.current) { animRef.current = nextAnim; setAnim(nextAnim); }
        if (avRef.current) { avRef.current.position.copy(pos.current); avRef.current.rotation.copy(charRot.current); }
        const ly = pos.current.y + HH;
        const nla = _v.current[6].set(pos.current.x, ly, pos.current.z);
        // Clamp lerp alpha to prevent overshoot on frame spikes (max 0.5 per frame)
        const lookAlpha = Math.min(10 * safeDt, 0.5);
        camLookRef.current.lerp(nla, lookAlpha);
        if (fp) {
            camera.position.set(pos.current.x + shakeX, ly + shakeY, pos.current.z);
            const ld = 5; camera.lookAt(pos.current.x - Math.sin(camAng.current.theta)*ld*Math.cos(camAng.current.phi), ly - Math.sin(camAng.current.phi)*ld, pos.current.z - Math.cos(camAng.current.theta)*ld*Math.cos(camAng.current.phi));
            (camera as THREE.PerspectiveCamera).fov = 90; camera.updateProjectionMatrix();
            // Sync smooth refs when in FP so transition back is instant
            camPosRef.current.copy(camera.position);
        } else {
            // Smooth FOV transition with hysteresis band around 1:1 aspect ratio.
            // Portrait (<0.85): 90° | Landscape (>1.15): 75° | Between: interpolated.
            // Avoids flicker when aspect hovers near 1:1 (foldables, tablets).
            const asp = size.width / size.height;
            const tFov = asp < 0.85 ? 90 : asp > 1.15 ? 75 : 90 - ((asp - 0.85) / 0.30) * 15;
            if (Math.abs((camera as THREE.PerspectiveCamera).fov-tFov) > 0.1) { (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp((camera as THREE.PerspectiveCamera).fov, tFov, Math.min(5*safeDt, 0.3)); camera.updateProjectionMatrix(); }
            const cx = pos.current.x + Math.sin(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cz = pos.current.z + Math.cos(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cy = Math.max(ly + Math.sin(camAng.current.phi)*zoomLevel, 0.2);
            // Clamp lerp alpha to prevent camera overshoot/oscillation on low FPS
            const camAlpha = Math.min(10 * safeDt, 0.4);
            camPosRef.current.lerp(_v.current[7].set(cx + shakeX, cy + shakeY, cz), camAlpha);
            camera.position.copy(camPosRef.current);
            // lookAt is instant — only camera POSITION is smoothed (original behavior)
            camera.lookAt(pos.current.x, ly, pos.current.z);
        }
    }
  });
  return (<group ref={avRef} visible={!(zoomLevel < 0.5)}><Avatar animation={anim} visible={!dialogueOpen} onSceneReady={onAvatarScene} pickupTrigger={pickupTrigger} /></group>);
};
