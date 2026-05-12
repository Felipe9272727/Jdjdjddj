import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame, createPortal } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL, SPEED, PR, EZ_START, HOUSE_DOOR_X, HOUSE_DOOR_Z, wallsForState, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, CASHIER_INTERACT_DIST, CASHIER_POS, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { resolveCollision as _resolve } from './physics';

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

export type PickupItemType = 'flashlight' | 'cookie' | null;

// ─── Bone patterns — exact match first, then substring fallback ────────
const ARM_BONE_EXACT = ['mixamorig:rightarm', 'rightarm', 'right_arm', 'arm_r', 'upperarm_r', 'r_upperarm', 'rupperarm'];
const ARM_BONE_SUBSTR = ['rightarm', 'upperarm.r', 'bip01_r_upperarm'];
const FOREARM_BONE_EXACT = ['mixamorig:rightforearm', 'rightforearm', 'right_forearm', 'forearm_r', 'lowerarm_r', 'r_forearm', 'rforearm'];
const FOREARM_BONE_SUBSTR = ['rightforearm', 'forearm.r', 'bip01_r_forearm'];
const HAND_BONE_EXACT = ['mixamorig:righthand', 'righthand', 'right_hand', 'hand_r', 'r_hand', 'rhand'];
const HAND_BONE_SUBSTR = ['righthand', 'hand.r', 'bip01_r_hand'];

function findArmBones(scene: THREE.Object3D) {
  let rightArm: THREE.Bone | null = null;
  let rightForeArm: THREE.Bone | null = null;
  let rightHand: THREE.Bone | null = null;
  scene.traverse((child: any) => {
    if (!child.isBone) return;
    const name = child.name.toLowerCase();
    // Exact match priority (avoids RightArmTwist, RightArmHelper, etc.)
    if (!rightArm && ARM_BONE_EXACT.includes(name)) { rightArm = child; return; }
    if (!rightForeArm && FOREARM_BONE_EXACT.includes(name)) { rightForeArm = child; return; }
    if (!rightHand && HAND_BONE_EXACT.includes(name)) { rightHand = child; return; }
    // Substring fallback
    if (!rightArm && ARM_BONE_SUBSTR.some(p => name.includes(p))) rightArm = child;
    if (!rightForeArm && FOREARM_BONE_SUBSTR.some(p => name.includes(p))) rightForeArm = child;
    if (!rightHand && HAND_BONE_SUBSTR.some(p => name.includes(p))) rightHand = child;
  });
  return { rightArm, rightForeArm, rightHand };
}

// ─── HeldItem: tiny 3D model that lives inside the RightHand bone ───────
// Scale is divided by the GLB's outer scale (30) so it renders at "world size".
const HAND_LOCAL_SCALE = 1 / 30;
const HeldFlashlight: React.FC<{ visible: boolean }> = ({ visible }) => (
  <group visible={visible} scale={HAND_LOCAL_SCALE} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
    <mesh position={[0, 0, 0]}>
      <cylinderGeometry args={[0.025, 0.025, 0.16, 10]} />
      <meshStandardMaterial color="#2a2a2e" metalness={0.85} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.1, 0]}>
      <cylinderGeometry args={[0.035, 0.028, 0.05, 10]} />
      <meshStandardMaterial color="#3a3a3e" metalness={0.7} roughness={0.25} />
    </mesh>
    <mesh position={[0, 0.13, 0]}>
      <circleGeometry args={[0.032, 12]} />
      <meshStandardMaterial color="#FFF9C4" emissive="#FFF9C4" emissiveIntensity={1.5} toneMapped={false} />
    </mesh>
  </group>
);
const HeldCookie: React.FC<{ visible: boolean }> = ({ visible }) => (
  <group visible={visible} scale={HAND_LOCAL_SCALE} position={[0, 0.04, 0]}>
    <mesh>
      <cylinderGeometry args={[0.05, 0.05, 0.018, 16]} />
      <meshStandardMaterial color="#D2A06B" roughness={0.85} />
    </mesh>
    {/* chocolate chips */}
    <mesh position={[0.022, 0.012, 0]}><sphereGeometry args={[0.008, 8, 6]} /><meshStandardMaterial color="#4A2310" roughness={0.7} /></mesh>
    <mesh position={[-0.018, 0.012, 0.018]}><sphereGeometry args={[0.007, 8, 6]} /><meshStandardMaterial color="#4A2310" roughness={0.7} /></mesh>
    <mesh position={[0.005, 0.012, -0.022]}><sphereGeometry args={[0.0075, 8, 6]} /><meshStandardMaterial color="#4A2310" roughness={0.7} /></mesh>
    <mesh position={[-0.025, 0.012, -0.01]}><sphereGeometry args={[0.006, 8, 6]} /><meshStandardMaterial color="#4A2310" roughness={0.7} /></mesh>
  </group>
);

// Easing functions
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t: number) { return t * t * t; }

const Avatar = ({ animation, visible = true, pickupTrigger = 0, pickupItem = null }: {
  animation: 'Idle' | 'Walking';
  visible?: boolean;
  pickupTrigger?: number;
  pickupItem?: PickupItemType;
}) => {
  const { scene, animations: walkAnims } = useGLTF(WALKING_URL) as any;
  const { animations: idleAnims } = useGLTF(IDLE_URL) as any;
  const { actions } = useAnimations(useMemo(() => {
      const w = walkAnims.map((a: any) => a.clone(true)); const i = idleAnims.map((a: any) => a.clone(true));
      if (w[0]) w[0].name = "Walking"; if (i[0]) i[0].name = "Idle";
      return [...i, ...w];
  }, [walkAnims, idleAnims]), scene);
  const opRef = useRef(1.0);
  const meshesRef = useRef<any[]>([]);
  const [groundY, setGroundY] = useState(0);
  const [handBone, setHandBone] = useState<THREE.Bone | null>(null);
  const [showHandItem, setShowHandItem] = useState(false);

  // Pickup state — pre-allocated quaternions, zero GC pressure
  const pickupRef = useRef({
    active: false,
    elapsed: 0,
    armBone: null as THREE.Bone | null,
    foreArmBone: null as THREE.Bone | null,
    bonesFound: false,
    lastTrigger: 0,
    // Pre-allocated objects — reused every frame, never cloned
    armQuat: new THREE.Quaternion(),
    foreArmQuat: new THREE.Quaternion(),
    armDelta: new THREE.Quaternion(),
    foreArmDelta: new THREE.Quaternion(),
    armEuler: new THREE.Euler(),
    foreArmEuler: new THREE.Euler(),
  });

  // Find bones once when scene loads
  useEffect(() => {
    const { rightArm, rightForeArm, rightHand } = findArmBones(scene);
    if (rightArm && rightForeArm) {
      pickupRef.current.armBone = rightArm;
      pickupRef.current.foreArmBone = rightForeArm;
      pickupRef.current.bonesFound = true;
    } else {
      console.warn('[Avatar] Could not find arm bones. Found:', { rightArm: !!rightArm, rightForeArm: !!rightForeArm });
    }
    if (rightHand) setHandBone(rightHand);
  }, [scene]);

  // Detect pickupTrigger changes — ignore if already animating
  useEffect(() => {
    if (pickupTrigger > 0 && pickupTrigger !== pickupRef.current.lastTrigger) {
      pickupRef.current.lastTrigger = pickupTrigger;
      if (!pickupRef.current.active) {
        pickupRef.current.active = true;
        pickupRef.current.elapsed = 0;
        setShowHandItem(true);
      }
    }
  }, [pickupTrigger]);

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
     });
     meshesRef.current = meshes;
     try {
       scene.updateMatrixWorld(true);
       const box = new THREE.Box3().setFromObject(scene);
       if (Number.isFinite(box.min.y)) setGroundY(-box.min.y);
     } catch { /* ignored */ }
  }, [scene]);

  // Pickup arm animation — runs at priority 1 (after mixer at priority 0)
  // Reads the mixer's pose, applies rotation delta on top
  useFrame((_, dt) => {
    const p = pickupRef.current;
    if (!p.active || !p.bonesFound || !p.armBone || !p.foreArmBone) return;

    const safeDt = Math.min(dt, 0.05);
    p.elapsed += safeDt;

    const EXTEND_END = 0.3;
    const HOLD_END = 0.8;
    const RETRACT_END = 1.2;

    let progress: number;
    if (p.elapsed < EXTEND_END) {
      progress = easeOutCubic(p.elapsed / EXTEND_END);
    } else if (p.elapsed < HOLD_END) {
      progress = 1;
    } else if (p.elapsed < RETRACT_END) {
      progress = 1 - easeInCubic((p.elapsed - HOLD_END) / (RETRACT_END - HOLD_END));
    } else {
      p.active = false;
      progress = 0;
      setShowHandItem(false);
    }

    const maxAngle = -Math.PI * 0.44;
    const armAngle = maxAngle * progress;
    const foreArmAngle = maxAngle * 0.3 * progress;

    // Read mixer's current pose (set by useAnimations at priority 0)
    p.armQuat.copy(p.armBone.quaternion);
    p.foreArmQuat.copy(p.foreArmBone.quaternion);

    // Create rotation delta using pre-allocated objects
    p.armEuler.set(armAngle, 0, 0);
    p.foreArmEuler.set(foreArmAngle, 0, 0);
    p.armDelta.setFromEuler(p.armEuler);
    p.foreArmDelta.setFromEuler(p.foreArmEuler);

    // Post-multiply: mixer_pose × delta = local space rotation
    p.armBone.quaternion.copy(p.armQuat).multiply(p.armDelta);
    p.foreArmBone.quaternion.copy(p.foreArmQuat).multiply(p.foreArmDelta);
  }, 1); // Priority 1 = runs after animation mixer (priority 0)

  // Opacity fade animation (still needs useFrame for smooth lerp)
  useFrame((s, dt) => {
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

  return (
    <group>
      <primitive object={scene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
      {handBone && createPortal(
        <>
          <HeldFlashlight visible={showHandItem && pickupItem === 'flashlight'} />
          <HeldCookie visible={showHandItem && pickupItem === 'cookie'} />
        </>,
        handBone
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
  pickupTrigger?: number;
  pickupItem?: PickupItemType;
}

export const Player = ({ moveInput, lookInput, isDesktop, onEnterElevator, doorsClosed, currentLevel, onInteractionUpdate, onNpcInteractionUpdate, onCashierInteractionUpdate, houseDoorOpen, active, zoomLevel, npcPositionRef, dialogueTargetRef, dialogueOpen, sharedPositionRef, sharedRotationYRef, cameraThetaRef, cameraShakeRef, positionCmdRef, onElevatorZoneChange, pickupTrigger = 0, pickupItem = null }: PlayerProps) => {
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
  const camPosRef = useRef(new Vector3(0, 0, 8));
  const camInitRef = useRef(false);
  const walls = useMemo(() => wallsForState(currentLevel, doorsClosed, houseDoorOpen), [currentLevel, doorsClosed, houseDoorOpen]);

  useEffect(() => {
    elevTriggered.current = pos.current.z < EZ_START - 1;
  }, [currentLevel]);

  useFrame((state, dt) => {
    if (!active) return;
    const safeDt = Math.min(dt, 0.05);
    timeRef.current += safeDt;

    if (positionCmdRef && positionCmdRef.current) {
        pos.current.set(positionCmdRef.current.x, positionCmdRef.current.y, positionCmdRef.current.z);
        positionCmdRef.current = null;
        camInitRef.current = false;
        if (pos.current.z < EZ_START - 1) elevTriggered.current = true;
    }

    const fp = zoomLevel < 0.5;
    if (sharedPositionRef) sharedPositionRef.current.copy(pos.current);
    if (sharedRotationYRef) sharedRotationYRef.current = charRot.current.y;
    if (cameraThetaRef) cameraThetaRef.current = camAng.current.theta;

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
        const lookAlpha = Math.min(10 * safeDt, 0.5);
        camLookRef.current.lerp(nla, lookAlpha);
        if (fp) {
            camera.position.set(pos.current.x + shakeX, ly + shakeY, pos.current.z);
            const ld = 5; camera.lookAt(pos.current.x - Math.sin(camAng.current.theta)*ld*Math.cos(camAng.current.phi), ly - Math.sin(camAng.current.phi)*ld, pos.current.z - Math.cos(camAng.current.theta)*ld*Math.cos(camAng.current.phi));
            (camera as THREE.PerspectiveCamera).fov = 90; camera.updateProjectionMatrix();
            camPosRef.current.copy(camera.position);
        } else {
            const asp = size.width / size.height;
            const tFov = asp < 0.85 ? 90 : asp > 1.15 ? 75 : 90 - ((asp - 0.85) / 0.30) * 15;
            if (Math.abs((camera as THREE.PerspectiveCamera).fov-tFov) > 0.1) { (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp((camera as THREE.PerspectiveCamera).fov, tFov, Math.min(5*safeDt, 0.3)); camera.updateProjectionMatrix(); }
            const cx = pos.current.x + Math.sin(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cz = pos.current.z + Math.cos(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cy = Math.max(ly + Math.sin(camAng.current.phi)*zoomLevel, 0.2);
            const camAlpha = Math.min(10 * safeDt, 0.4);
            camPosRef.current.lerp(_v.current[7].set(cx + shakeX, cy + shakeY, cz), camAlpha);
            camera.position.copy(camPosRef.current);
            camera.lookAt(pos.current.x, ly, pos.current.z);
        }
    }
  });
  return (<group ref={avRef} visible={!(zoomLevel < 0.5)}><Avatar animation={anim} visible={!dialogueOpen} pickupTrigger={pickupTrigger} pickupItem={pickupItem} /></group>);
};
