import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL, SPEED, PR, EZ_START, HOUSE_DOOR_X, HOUSE_DOOR_Z, wallsForState, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, CASHIER_INTERACT_DIST, CASHIER_POS, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { resolveCollision as _resolve } from './physics';

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

// ─── Bone patterns for the right arm (Mixamo + common conventions) ────────
const ARM_EXACT = ['mixamorig:rightarm', 'rightarm', 'right_arm', 'arm_r', 'upperarm_r', 'r_upperarm'];
const ARM_SUBSTR = ['rightarm', 'upperarm.r'];
const FOREARM_EXACT = ['mixamorig:rightforearm', 'rightforearm', 'right_forearm', 'forearm_r', 'lowerarm_r', 'r_forearm'];
const FOREARM_SUBSTR = ['rightforearm', 'forearm.r'];
const HAND_EXACT = ['mixamorig:righthand', 'righthand', 'right_hand', 'hand_r', 'r_hand'];
const HAND_SUBSTR = ['righthand', 'hand.r'];

function findArmBones(scene: THREE.Object3D): { arm: THREE.Bone | null; forearm: THREE.Bone | null; hand: THREE.Bone | null } {
  let arm: THREE.Bone | null = null;
  let forearm: THREE.Bone | null = null;
  let hand: THREE.Bone | null = null;
  scene.traverse((c: any) => {
    if (!c.isBone && c.type !== 'Bone') return;
    const n = c.name.toLowerCase();
    if (!arm && ARM_EXACT.includes(n)) { arm = c; return; }
    if (!forearm && FOREARM_EXACT.includes(n)) { forearm = c; return; }
    if (!hand && HAND_EXACT.includes(n)) { hand = c; return; }
    if (!arm && ARM_SUBSTR.some(p => n.includes(p))) arm = c;
    if (!forearm && FOREARM_SUBSTR.some(p => n.includes(p))) forearm = c;
    if (!hand && HAND_SUBSTR.some(p => n.includes(p))) hand = c;
  });
  return { arm, forearm, hand };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

const Avatar = ({ animation, visible = true, pickupTrigger = 0, armExtended = false, onHandBone }: { animation: 'Idle' | 'Walking'; visible?: boolean; pickupTrigger?: number; armExtended?: boolean; onHandBone?: (b: THREE.Bone | null) => void }) => {
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
  useEffect(() => {
     const meshes: any[] = [];
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
     });
     meshesRef.current = meshes;
     // Bounding box in scene-local space (before our scale={[30,30,30]} multiplier).
     // We want the lowest visible point at world Y=0, so the primitive lift in
     // primitive-local units = -bbox.min.y.
     try {
       scene.updateMatrixWorld(true);
       const box = new THREE.Box3().setFromObject(scene);
       if (Number.isFinite(box.min.y)) setGroundY(-box.min.y);
     } catch { /* ignored */ }
  }, [scene]);

  // ─── Pickup arm animation ────────────────────────────────────────────────
  // Runs at priority 0 (default). useAnimations is called BEFORE this hook in
  // the same component, so its internal mixer useFrame is registered first
  // and runs first within the same priority queue. That guarantees:
  //   [mixer.update()] writes the idle/walking pose to the bone quaternions
  //   [our useFrame]   reads that pose and post-multiplies a rotation delta
  //
  // NEVER use priority != 0 here — it disables R3F v9's auto-render and
  // produces the historical black-screen bug.
  // Two independent states:
  //  - timed:     the 1.2s pickup animation (extend → hold → retract). Driven
  //               by pickupTrigger ticks.
  //  - sustained: held at full extension while a prop wants it (armExtended).
  //               When armExtended flips false, we jump the timed animation
  //               directly into the retract phase so the arm comes down smooth.
  const pickupRef = useRef({
    timed: { active: false, elapsed: 0, lastTrigger: 0 },
    sustained: false,
    arm: null as THREE.Bone | null,
    forearm: null as THREE.Bone | null,
    found: false,
    armQuat: new THREE.Quaternion(),
    forearmQuat: new THREE.Quaternion(),
    armDelta: new THREE.Quaternion(),
    forearmDelta: new THREE.Quaternion(),
    armEuler: new THREE.Euler(),
    forearmEuler: new THREE.Euler(),
  });

  useEffect(() => {
    const { arm, forearm, hand } = findArmBones(scene);
    pickupRef.current.arm = arm;
    pickupRef.current.forearm = forearm;
    pickupRef.current.found = !!(arm && forearm);
    if (!pickupRef.current.found) {
      console.warn('[Avatar] Right arm bones not found — pickup animation disabled.', { arm: !!arm, forearm: !!forearm });
    }
    if (onHandBone) onHandBone(hand);
  }, [scene, onHandBone]);

  // Drive the TIMED animation from the trigger prop
  useEffect(() => {
    if (pickupTrigger > 0 && pickupTrigger !== pickupRef.current.timed.lastTrigger) {
      pickupRef.current.timed.lastTrigger = pickupTrigger;
      pickupRef.current.timed.active = true;
      pickupRef.current.timed.elapsed = 0;
    }
  }, [pickupTrigger]);

  // React to armExtended changes: rising edge → just set sustained=true.
  // Falling edge → start retract phase of the timed animation so the arm
  // returns smoothly instead of snapping or looping.
  useEffect(() => {
    if (armExtended) {
      pickupRef.current.sustained = true;
    } else if (pickupRef.current.sustained) {
      pickupRef.current.sustained = false;
      // Skip the timed animation forward to the start of the retract phase
      pickupRef.current.timed.active = true;
      pickupRef.current.timed.elapsed = 0.8;  // HOLD ends here, RETRACT starts
    }
  }, [armExtended]);

  useFrame((_, dt) => {
    const p = pickupRef.current;
    if (!p.found || !p.arm || !p.forearm) return;

    let progress: number;
    if (p.sustained) {
      // Held fully extended — no timing.
      progress = 1;
    } else if (p.timed.active) {
      const safeDt = Math.min(dt, 0.05);
      p.timed.elapsed += safeDt;
      const EXTEND = 0.3, HOLD = 0.8, RETRACT = 1.2;
      if (p.timed.elapsed < EXTEND) progress = easeOutCubic(p.timed.elapsed / EXTEND);
      else if (p.timed.elapsed < HOLD) progress = 1;
      else if (p.timed.elapsed < RETRACT) progress = 1 - easeInCubic((p.timed.elapsed - HOLD) / (RETRACT - HOLD));
      else { p.timed.active = false; return; }
    } else {
      return;  // no animation, no sustained extend
    }

    const maxAngle = -Math.PI * 0.44;
    const armAngle = maxAngle * progress;
    const forearmAngle = maxAngle * 0.3 * progress;

    // Read mixer's pose (written at priority 0, earlier in this frame)
    p.armQuat.copy(p.arm.quaternion);
    p.forearmQuat.copy(p.forearm.quaternion);
    // Build delta on pre-allocated objects — zero GC
    p.armEuler.set(armAngle, 0, 0);
    p.forearmEuler.set(forearmAngle, 0, 0);
    p.armDelta.setFromEuler(p.armEuler);
    p.forearmDelta.setFromEuler(p.forearmEuler);
    // Post-multiply mixer_pose × delta = rotation in bone-local space
    p.arm.quaternion.copy(p.armQuat).multiply(p.armDelta);
    p.forearm.quaternion.copy(p.forearmQuat).multiply(p.forearmDelta);
  });

  useFrame((s, dt) => {
      // Reset only X/Z of the hips bone — keep Y so the natural walking bob
      // (vertical motion baked into the animation) plays through. Zeroing Y
      // here was producing the visual "float" because the avatar's contact
      // with the floor depends on the bob's lowest point.
      if (hipsRef.current && hipsBindRef.current) {
          hipsRef.current.position.x = hipsBindRef.current.x;
          hipsRef.current.position.z = hipsBindRef.current.z;
      }
      const tgt = visible ? 1 : 0; opRef.current = THREE.MathUtils.lerp(opRef.current, tgt, 8 * dt);
      const op = opRef.current;
      const visibleMesh = op > 0.01;
      const meshes = meshesRef.current;
      for (let i = 0; i < meshes.length; i++) {
          const m = meshes[i];
          if (m.material) m.material.opacity = op;
          m.visible = visibleMesh;
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
  pickupTrigger?: number;
  armExtended?: boolean;
  onRightHandBone?: (b: THREE.Bone | null) => void;
}

export const Player = ({ moveInput, lookInput, isDesktop, onEnterElevator, doorsClosed, currentLevel, onInteractionUpdate, onNpcInteractionUpdate, onCashierInteractionUpdate, houseDoorOpen, active, zoomLevel, npcPositionRef, dialogueTargetRef, dialogueOpen, sharedPositionRef, sharedRotationYRef, cameraThetaRef, cameraShakeRef, positionCmdRef, onElevatorZoneChange, pickupTrigger = 0, armExtended = false, onRightHandBone }: PlayerProps) => {
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
  return (<group ref={avRef} visible={!(zoomLevel < 0.5)}><Avatar animation={anim} visible={!dialogueOpen} pickupTrigger={pickupTrigger} armExtended={armExtended} onHandBone={onRightHandBone} /></group>);
};

// ─── FPArmModel: first-person viewmodel — simple 3D arm in camera space ──
//
// The GLB-clone approach didn't work: collapsing non-right-arm bones via
// scale shrinks ancestors of the right-arm too (RightShoulder is descended
// from Hips → Spine), so the right arm vanished as well. Worse, the head
// and torso meshes (regular Meshes attached to bones) kept rendering since
// scale-collapse only affects skinned vertices.
//
// This implementation draws a simple arm with primitives anchored to the
// camera. Two cylinders (upper + lower arm), a sphere (hand), and the
// flashlight body integrated on the hand. Animation is local: idle bob
// when at rest, sustain-extend while armExtended, and a 1.2s pickup
// retract/extend timed by pickupTrigger.
//
// Still uses useFrame priority 0 (never != 0 — black screen).

interface FPArmModelProps {
  zoomLevel: number;
  armExtended: boolean;
  pickupTrigger: number;
  active: boolean;
  flashlightActive: boolean;
  flashlightOwned: boolean;
}

export const FPArmModel: React.FC<FPArmModelProps> = ({ zoomLevel, armExtended, pickupTrigger, active, flashlightActive, flashlightOwned }) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const armPivotRef = useRef<THREE.Group>(null);
  const flashlightRef = useRef<THREE.Group>(null);

  // Pickup state — same timed/sustained split as Avatar
  const state = useRef({
    timed: { active: false, elapsed: 0, lastTrigger: 0 },
    sustained: false,
    timeSec: 0,
  });

  useEffect(() => {
    if (pickupTrigger > 0 && pickupTrigger !== state.current.timed.lastTrigger) {
      state.current.timed.lastTrigger = pickupTrigger;
      state.current.timed.active = true;
      state.current.timed.elapsed = 0;
    }
  }, [pickupTrigger]);

  useEffect(() => {
    if (armExtended) {
      state.current.sustained = true;
    } else if (state.current.sustained) {
      state.current.sustained = false;
      state.current.timed.active = true;
      state.current.timed.elapsed = 0.8;  // jump into retract phase
    }
  }, [armExtended]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    const pivot = armPivotRef.current;
    if (!g || !pivot) return;

    const fpView = zoomLevel < 0.5;
    g.visible = active && fpView;
    if (!g.visible) return;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    const s = state.current;
    s.timeSec += dt;

    // Progress: 0 = arm relaxed at side, 1 = fully extended forward
    let progress: number;
    if (s.sustained) {
      progress = 1;
    } else if (s.timed.active) {
      const safeDt = Math.min(dt, 0.05);
      s.timed.elapsed += safeDt;
      const EXTEND = 0.3, HOLD = 0.8, RETRACT = 1.2;
      if (s.timed.elapsed < EXTEND) progress = easeOutCubic(s.timed.elapsed / EXTEND);
      else if (s.timed.elapsed < HOLD) progress = 1;
      else if (s.timed.elapsed < RETRACT) progress = 1 - easeInCubic((s.timed.elapsed - HOLD) / (RETRACT - HOLD));
      else { s.timed.active = false; progress = 0; }
    } else {
      progress = 0;
    }

    // Idle bob (subtle vertical motion + slight side sway, feels alive)
    const bob = Math.sin(s.timeSec * 1.8) * 0.012;
    const sway = Math.cos(s.timeSec * 1.3) * 0.008;

    // Rotate the arm pivot. The "shoulder" is at the pivot origin; arm parts
    // hang along -Y (default cylinder axis). To point forward, we pitch the
    // pivot ~+90° (rotation.x → Math.PI/2 maps -Y to -Z = camera forward).
    //   relaxed (progress 0): arm is angled down-forward, visible at bottom-right
    //   extended (progress 1): arm fully forward, hand reaches toward center
    const restX = 1.10;   // ~63°: pointing forward & slightly down
    const extX  = 1.55;   // ~89°: nearly straight forward
    pivot.rotation.x = restX + (extX - restX) * progress;
    pivot.rotation.z = sway * 0.5;
    pivot.position.y = -0.02 + bob;

    // Flashlight: NOT a child of the pivot. It sits in the anchor space with
    // a fixed forward-pointing rotation. We interpolate its position to follow
    // where the hand should be (computed from the same progress curve).
    const fl = flashlightRef.current;
    if (fl && flashlightOwned) {
      // Hand offset in pivot-local: (0, -0.60, 0). After R_x(rotX):
      //   x' = 0
      //   y' = cos(rotX)*(-0.60) - sin(rotX)*0 = -0.60 * cos(rotX)
      //   z' = sin(rotX)*(-0.60) + cos(rotX)*0 = -0.60 * sin(rotX)
      // With rotX ∈ [1.10, 1.55], sin(rotX) > 0, so handZ < 0 (forward camera).
      const rotX = pivot.rotation.x;
      const handY = -0.60 * Math.cos(rotX);
      const handZ = -0.60 * Math.sin(rotX);
      // Then add anchor offset. Anchor is at [0.28, -0.20, -0.30] in groupRef.
      fl.position.set(0.28, -0.20 + handY + bob, -0.30 + handZ);
    }
  });

  // Skin tone + flashlight colors
  const SKIN = '#D9B58F';
  const SLEEVE = '#3a2e26';

  // depthTest=false on every material → the FP arm always renders over the
  // scene, like a classic FPS viewmodel. renderOrder=999 enforces draw order.
  return (
    <group ref={groupRef} visible={false} renderOrder={999}>
      {/* Anchor a bit to the right of the camera, below center, and pushed
          into the scene by 30cm so the arm sticks out from behind the
          camera frustum's near plane (default ~0.1). */}
      <group position={[0.28, -0.20, -0.30]}>
        <group ref={armPivotRef}>
          {/* Upper arm */}
          <mesh position={[0, -0.13, 0]} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.050, 0.045, 0.26, 14]} />
            <meshStandardMaterial color={SLEEVE} roughness={0.85} depthTest={false} />
          </mesh>
          {/* Elbow */}
          <mesh position={[0, -0.26, 0]} renderOrder={999} frustumCulled={false}>
            <sphereGeometry args={[0.050, 14, 10]} />
            <meshStandardMaterial color={SLEEVE} roughness={0.85} depthTest={false} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.39, 0]} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.045, 0.042, 0.24, 14]} />
            <meshStandardMaterial color={SKIN} roughness={0.95} depthTest={false} />
          </mesh>
          {/* Wrist */}
          <mesh position={[0, -0.51, 0]} renderOrder={999} frustumCulled={false}>
            <sphereGeometry args={[0.045, 12, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.95} depthTest={false} />
          </mesh>
          {/* Hand (palm) */}
          <mesh position={[0, -0.57, 0]} renderOrder={999} frustumCulled={false}>
            <boxGeometry args={[0.085, 0.10, 0.06]} />
            <meshStandardMaterial color={SKIN} roughness={0.95} depthTest={false} />
          </mesh>

        </group>
      </group>

      {/* Flashlight: SIBLING of the anchor (lives in groupRef-local =
          camera-local). Position is driven by useFrame from the same arm
          progress. Rotation is FIXED so the lens always points forward
          (-Z camera-local). Pulling it out of the arm pivot avoids the
          dual-rotation bug where the body ended up pointing 180° off. */}
      {flashlightOwned && (
        <group ref={flashlightRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
          <mesh position={[0, 0.10, 0]} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.035, 0.035, 0.20, 14]} />
            <meshStandardMaterial color="#1a1a1e" metalness={0.85} roughness={0.25} depthTest={false} />
          </mesh>
          <mesh position={[0, 0.225, 0]} renderOrder={999} frustumCulled={false}>
            <cylinderGeometry args={[0.050, 0.038, 0.06, 14]} />
            <meshStandardMaterial color="#2a2a2e" metalness={0.75} roughness={0.3} depthTest={false} />
          </mesh>
          <mesh position={[0, 0.260, 0]} renderOrder={999} frustumCulled={false}>
            <circleGeometry args={[0.045, 16]} />
            <meshStandardMaterial
              color={flashlightActive ? '#FFF3CC' : '#888'}
              emissive={flashlightActive ? '#FFF3CC' : '#222'}
              emissiveIntensity={flashlightActive ? 2.4 : 0.15}
              toneMapped={false}
              depthTest={false}
            />
          </mesh>
          {flashlightActive && (
            <pointLight position={[0, 0.30, 0]} intensity={0.15} distance={0.4} color="#FFF3CC" />
          )}
        </group>
      )}
    </group>
  );
};
