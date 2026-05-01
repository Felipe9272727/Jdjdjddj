import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { ASSETS, COLORS, NPC_WALK_URL, NPC_IDLE_URL } from './constants';
import { TextureMaterial } from './Materials';
import { Door, WallPanel, CeilingLight, Armchair, TallPlant, FloorLamp, ReceptionDesk, Cashier, Stool } from './BuildingBlocks';
import { ElevatorFacade } from './Elevator';
import { Shop } from './HouseEnv';
import * as THREE from 'three';
import { Vector3 } from 'three';

export const LobbyNPC = ({ positionRef, isPaused, playerPositionRef }: any) => {
  const group = useRef<any>(null);
  const { scene, animations: walkAnims } = useGLTF(NPC_WALK_URL) as any;
  const { animations: idleAnims } = useGLTF(NPC_IDLE_URL) as any;
  const { actions } = useAnimations(useMemo(() => {
      const w = walkAnims.map((a: any) => { const c = a.clone(true); c.name = "Walking"; return c; });
      const i = idleAnims.map((a: any) => { const c = a.clone(true); c.name = "Idle"; return c; });
      return [...i, ...w];
  }, [walkAnims, idleAnims]), group);
  const aiState = useRef({ state: 'Idle', target: new Vector3(0, 0, 0), timer: 2 + Math.random() * 3 });
  const _nDir = useRef(new Vector3());
  useEffect(() => {
      scene.traverse((child: any) => { if (child.isMesh) { if (child.material) { child.material.side = THREE.DoubleSide; child.material.transparent = false; child.material.alphaTest = 0.5; } } });
      if(actions['Idle']) actions['Idle'].play();
  }, [scene, actions]);
  useFrame((state, delta) => {
      if (!group.current) return;
      if (positionRef) positionRef.current.copy(group.current.position);
      if (isPaused) {
          if (aiState.current.state === 'Walking') {
              aiState.current.state = 'Idle';
              const walkAction = actions['Walking']; const idleAction = actions['Idle'];
              if (idleAction) { idleAction.reset().fadeIn(0.2).play(); walkAction?.fadeOut(0.2); }
          }
          if (playerPositionRef && playerPositionRef.current) {
              const playerPos = playerPositionRef.current; const npcPos = group.current.position;
              const dx = playerPos.x - npcPos.x; const dz = playerPos.z - npcPos.z;
              const targetRotation = Math.atan2(dx, dz); const currentRotation = group.current.rotation.y;
              let diff = targetRotation - currentRotation; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
              group.current.rotation.y += diff * 5 * delta;
          }
          return;
      }
      const ai = aiState.current; const pos = group.current.position;
      if (ai.state === 'Idle') {
          ai.timer -= delta;
          if (ai.timer <= 0) {
              const tx = (Math.random() - 0.5) * 14; const tz = -4 + Math.random() * 12; ai.target.set(tx, 0, tz);
              ai.state = 'Walking';
              const walkAction = actions['Walking']; const idleAction = actions['Idle'];
              if (walkAction) { walkAction.reset().fadeIn(0.5).play(); idleAction?.fadeOut(0.5); }
          }
      } else if (ai.state === 'Walking') {
          const direction = _nDir.current.subVectors(ai.target, pos); direction.y = 0; const dist = direction.length();
          if (dist < 0.5) {
              ai.state = 'Idle'; ai.timer = 2 + Math.random() * 4;
              const walkAction = actions['Walking']; const idleAction = actions['Idle'];
              if (idleAction) { idleAction.reset().fadeIn(0.5).play(); walkAction?.fadeOut(0.5); }
          } else {
              direction.normalize(); const moveSpeed = 2.0 * delta; pos.addScaledVector(direction, moveSpeed);
              const targetRotation = Math.atan2(direction.x, direction.z); const currentRotation = group.current.rotation.y;
              let diff = targetRotation - currentRotation; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
              group.current.rotation.y += diff * 5 * delta;
          }
      }
  });
  return (<group ref={group} position={[5, 0, 5]}><primitive object={scene} scale={[1, 1, 1]} /></group>);
};

export const LobbyEnvironment = React.memo(({ npcPositionRef, isPaused, playerPositionRef }: any) => {
    const W = 20; const L = 20; const H = 4.5; const WH = 1.2;
    return (
        <group>
            <color attach="background" args={['#1a1410']} />
            <fog attach="fog" args={['#1a1410', 8, 28]} />
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[W, L]} /><TextureMaterial url={ASSETS.lobbyFloor} repeat={[8, 8]} roughness={0.4} metalness={0.05} /></mesh>
            <mesh rotation={[Math.PI/2, 0, 0]} position={[0, H, 0]}><planeGeometry args={[W, L]} /><TextureMaterial url={ASSETS.ceiling} repeat={[6, 6]} roughness={0.9} /></mesh>
            <ambientLight intensity={0.45} color="#FFE0B2" />
            {/* Main lobby light handled by FluorescentFlicker in App.tsx (flicker effect) */}
            <pointLight position={[0, 3, -6]} intensity={1.5} distance={12} color="#FFF8E1" decay={2} />
            <group position={[0, H/2, L/2]}><mesh><boxGeometry args={[W, H, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[4, 1]} roughness={0.9} /></mesh><mesh position={[0, -H/2+WH/2, -0.3]}><boxGeometry args={[W-0.6, WH, 0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[12, 1]} roughness={0.6} /></mesh></group>
            <group position={[-W/2, H/2, 0]}><mesh><boxGeometry args={[0.5, H, L]} /><TextureMaterial url={ASSETS.wall} repeat={[4, 1]} roughness={0.9} /></mesh><mesh position={[0.3, -H/2+WH/2, 0]}><boxGeometry args={[0.1, WH, L-0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[12, 1]} roughness={0.6} /></mesh></group>
            <group position={[W/2, 0, 0]}>
               <mesh position={[0, H/2, -6.25]}><boxGeometry args={[0.5, H, 7.5]} /><TextureMaterial url={ASSETS.wall} repeat={[1.5, 1]} roughness={0.9} /></mesh>
               <mesh position={[-0.3, WH/2, -6.25]}><boxGeometry args={[0.1, WH, 7.5]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[12, 1]} roughness={0.6} /></mesh>
               <mesh position={[0, H/2, 6.25]}><boxGeometry args={[0.5, H, 7.5]} /><TextureMaterial url={ASSETS.wall} repeat={[1.5, 1]} roughness={0.9} /></mesh>
               <mesh position={[-0.3, WH/2, 6.25]}><boxGeometry args={[0.1, WH, 7.5]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[12, 1]} roughness={0.6} /></mesh>
               <mesh position={[0, 4.15, 0]}><boxGeometry args={[0.5, 0.7, 5]} /><TextureMaterial url={ASSETS.wall} repeat={[1, 0.2]} roughness={0.9} /></mesh>
               <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 1.0, 5]} /><TextureMaterial url={ASSETS.wall} repeat={[1, 0.3]} roughness={0.9} /></mesh>
               <mesh position={[-0.3, 0.5, 0]}><boxGeometry args={[0.1, 1.0, 5]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[12, 1]} roughness={0.6} /></mesh>
               <Shop position={[0, 0, 0]} />
            </group>
            <ElevatorFacade z={-L/2} width={W} />
            <Door x={-W/2+0.35} z={-5} rot={Math.PI/2} /> <Door x={-W/2+0.35} z={5} rot={Math.PI/2} /> <Door x={W/2-0.35} z={-5} rot={-Math.PI/2} /> <WallPanel x={-W/2+0.3} z={0} rot={Math.PI/2} />
            <CeilingLight x={-5} z={-3} /> <CeilingLight x={-5} z={3} /> <CeilingLight x={5} z={-3} /> <CeilingLight x={5} z={3} />
            <ReceptionDesk x={7} z={-7.5} rot={-Math.PI/2} />
            <Cashier position={[8.0, 0, -7.5]} />
            <Stool position={[8.0, 0, -7.5]} />
            <Armchair x={-8.7} z={2} rot={Math.PI/2} color="#4E342E" />
            <Armchair x={-8.7} z={3.5} rot={Math.PI/2} color="#4E342E" />
            <Armchair x={-8.7} z={-2} rot={Math.PI/2} color="#5D4037" />
            <Armchair x={-8.7} z={-3.5} rot={Math.PI/2} color="#5D4037" />
            <Armchair x={-4} z={8.8} rot={Math.PI} color="#4E342E" />
            <Armchair x={-2.5} z={8.8} rot={Math.PI} color="#4E342E" />
            <Armchair x={2.5} z={8.8} rot={Math.PI} color="#4E342E" />
            <Armchair x={4} z={8.8} rot={Math.PI} color="#4E342E" />
            <TallPlant x={-9.2} z={9.2} variant={0} />
            <TallPlant x={9.2} z={9.2} variant={1} />
            <TallPlant x={-9.2} z={-9.2} variant={2} />
            <TallPlant x={-6} z={-9.2} variant={0} />
            <TallPlant x={6} z={-9.2} variant={1} />
            <FloorLamp x={-4} z={-8.8} />
            <FloorLamp x={4} z={-8.8} />
            <FloorLamp x={-7} z={0} />
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.012, -2]}><planeGeometry args={[3.5, 14]} /><meshStandardMaterial color="#6A1B9A" roughness={0.95} opacity={0.6} transparent /></mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.013, -2]}><planeGeometry args={[2.8, 13.4]} /><meshStandardMaterial color="#4A148C" roughness={0.95} opacity={0.4} transparent /></mesh>
            <LobbyNPC positionRef={npcPositionRef} isPaused={isPaused} playerPositionRef={playerPositionRef} />
        </group>
    );
});
