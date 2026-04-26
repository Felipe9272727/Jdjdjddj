import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL, SPEED, PR, EZ_START, HOUSE_DOOR_X, HOUSE_DOOR_Z, ELEV_W, LOBBY_W, DOOR_SEAL, L1_BND, ELEV_BLD, HOUSE_EX, HOUSE_IN, HOUSE_DW } from './constants';
import { resolveCollision as _resolve } from './physics';

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

const Avatar = ({ animation, visible = true }: any) => {
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
           c.castShadow = true; c.receiveShadow = true;
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

export const Player = ({ moveInput, lookInput, isDesktop, onEnterElevator, doorsClosed, currentLevel, onInteractionUpdate, onNpcInteractionUpdate, houseDoorOpen, active, zoomLevel, npcPositionRef, dialogueTargetRef, dialogueOpen, sharedPositionRef, sharedRotationYRef, cameraThetaRef, cameraShakeRef, positionCmdRef, onElevatorZoneChange }: any) => {
  const { camera, size } = useThree();
  const pos = useRef(new Vector3(0, 0, 8)); const charRot = useRef(new Euler(0, Math.PI, 0)); const camAng = useRef({ theta: Math.PI, phi: 0.2 });
  const avRef = useRef<any>(null); const camLookRef = useRef(new Vector3());
  const [anim, setAnim] = useState('Idle');
  const elevTriggered = useRef(false); const HH = 1.6;
  const prevInsideElevatorRef = useRef(false);
  const _vRef = useRef<any>(null);
  if (_vRef.current === null) _vRef.current = Array.from({length:8}, () => new Vector3());
  const _v = _vRef;

  const timeRef = useRef(0);

  useEffect(() => { elevTriggered.current = false; }, [currentLevel]);

  useFrame((state, dt) => {
    if (!active) return;
    timeRef.current += dt;
    
    if (positionCmdRef && positionCmdRef.current) {
        pos.current.set(positionCmdRef.current.x, positionCmdRef.current.y, positionCmdRef.current.z);
        positionCmdRef.current = null;
    }
    
    const fp = zoomLevel < 0.5;
    if (sharedPositionRef) sharedPositionRef.current.copy(pos.current);
    if (sharedRotationYRef) sharedRotationYRef.current = charRot.current.y;
    // Bot reads this to map world deltas into camera-frame moveInput.
    if (cameraThetaRef) cameraThetaRef.current = camAng.current.theta;
    
    if (onElevatorZoneChange) {
        const inside = pos.current.z <= -10 && Math.abs(pos.current.x) <= 3.1;
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
        setAnim('Idle');
        if (avRef.current) { avRef.current.position.copy(pos.current); avRef.current.rotation.copy(charRot.current); }
        const nP = dialogueFocusRef.current; const pP = pos.current;
        const d2p = _v.current[0].subVectors(pP, nP).normalize(); if (d2p.lengthSq() < 1e-3) d2p.set(0,0,1);
        const tCam = _v.current[1].copy(nP).addScaledVector(d2p, 2.2); tCam.y += 1.75;
        const tLook = _v.current[2].copy(nP); tLook.y += 1.35;
        camera.position.lerp(tCam, 5*dt);
        if (camLookRef.current.distanceTo(tLook) > 10) { camLookRef.current.copy(pP); camLookRef.current.y += 1.6; }
        camLookRef.current.lerp(tLook, 5*dt);
        camera.lookAt(camLookRef.current);
        (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp((camera as THREE.PerspectiveCamera).fov, 40, 5*dt); camera.updateProjectionMatrix();
    } else {
        const sens = 0.003 * (fp ? 1.5 : 1.0);
        if (isDesktop) {
           if (lookInput.current.x || lookInput.current.y) { camAng.current.theta -= lookInput.current.x * sens * 500 * dt; camAng.current.phi += lookInput.current.y * sens * 500 * dt; lookInput.current.x = 0; lookInput.current.y = 0; }
        } else {
           if (lookInput.current.x || lookInput.current.y) { camAng.current.theta -= lookInput.current.x * (fp ? 1.5 : 1); camAng.current.phi += lookInput.current.y * (fp ? 1.5 : 1); lookInput.current.x = 0; lookInput.current.y = 0; }
        }
        camAng.current.phi = Math.max(fp ? -1.5 : -0.5, Math.min(fp ? 1.5 : 1.2, camAng.current.phi));

        const fwd = -moveInput.current.y; const strafe = moveInput.current.x; let moving = false;
        if (Math.abs(fwd) > 0.01 || Math.abs(strafe) > 0.01) {
            moving = true;
            const cd = _v.current[3].set(Math.sin(camAng.current.theta), 0, Math.cos(camAng.current.theta));
            const rd = _v.current[4].set(Math.sin(camAng.current.theta-Math.PI/2), 0, Math.cos(camAng.current.theta-Math.PI/2));
            const mv = _v.current[5].set(0,0,0).addScaledVector(cd, -fwd).addScaledVector(rd, -strafe).normalize().multiplyScalar(SPEED * dt);
            const nx = pos.current.x + mv.x, nz = pos.current.z + mv.z;

            let wl = [...ELEV_W];
            if (currentLevel === 0) { wl.push(...LOBBY_W); if (doorsClosed) wl.push(DOOR_SEAL); }
            else { wl.push(...L1_BND, ...ELEV_BLD, ...HOUSE_EX, ...HOUSE_IN); if (!houseDoorOpen) wl.push(HOUSE_DW); if (doorsClosed) wl.push(DOOR_SEAL); }
            const [rx, rz] = _resolve(nx, nz, PR, wl);
            pos.current.x = rx; pos.current.z = rz; pos.current.y = 0;

            if (fp) { charRot.current.y = camAng.current.theta + Math.PI; } else { const a = Math.atan2(mv.x, mv.z); let d = a - charRot.current.y; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; charRot.current.y += d*10*dt; }
            if (pos.current.z < EZ_START - 1 && !elevTriggered.current && currentLevel === 0) { elevTriggered.current = true; onEnterElevator(); }
        }
        if (currentLevel === 1) { const dx = pos.current.x-HOUSE_DOOR_X; const dz = pos.current.z-HOUSE_DOOR_Z; onInteractionUpdate(Math.sqrt(dx*dx+dz*dz) < 3); } else { onInteractionUpdate(false); }
        if (currentLevel === 0 && npcPositionRef?.current) { onNpcInteractionUpdate(pos.current.distanceTo(npcPositionRef.current) < 4); } else { onNpcInteractionUpdate(false); }
        setAnim(moving ? 'Walking' : 'Idle');
        if (avRef.current) { avRef.current.position.copy(pos.current); avRef.current.rotation.copy(charRot.current); }
        const ly = pos.current.y + HH;
        const nla = _v.current[6].set(pos.current.x, ly, pos.current.z);
        camLookRef.current.lerp(nla, 10*dt);
        if (fp) {
            camera.position.set(pos.current.x + shakeX, ly + shakeY, pos.current.z);
            const ld = 5; camera.lookAt(pos.current.x - Math.sin(camAng.current.theta)*ld*Math.cos(camAng.current.phi), ly - Math.sin(camAng.current.phi)*ld, pos.current.z - Math.cos(camAng.current.theta)*ld*Math.cos(camAng.current.phi));
            (camera as THREE.PerspectiveCamera).fov = 90; camera.updateProjectionMatrix();
        } else {
            const asp = size.width/size.height; const tFov = asp < 1 ? 90 : 75;
            if (Math.abs((camera as THREE.PerspectiveCamera).fov-tFov) > 0.1) { (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp((camera as THREE.PerspectiveCamera).fov, tFov, 5*dt); camera.updateProjectionMatrix(); }
            const cx = pos.current.x + Math.sin(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cz = pos.current.z + Math.cos(camAng.current.theta)*zoomLevel*Math.cos(camAng.current.phi);
            const cy = Math.max(ly + Math.sin(camAng.current.phi)*zoomLevel, 0.2);
            camera.position.lerp(_v.current[7].set(cx + shakeX, cy + shakeY, cz), 10*dt);
            camera.lookAt(pos.current.x, ly, pos.current.z);
        }
    }
  });
  return (<group ref={avRef} visible={!(zoomLevel < 0.5)}><Avatar animation={anim} visible={!dialogueOpen} /></group>);
};
