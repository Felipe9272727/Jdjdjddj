import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF, Instances, Instance, useTexture } from '@react-three/drei';
import { ASSETS, COLORS, BARNEY_URL } from './constants';
import { TextureMaterial } from './Materials';

useTexture.preload(BARNEY_URL);
import { ElevatorFacade } from './Elevator';
import { Sofa, CoffeeTable, Bed, KitchenCounter, Barrel } from './Furniture';
import * as THREE from 'three';

export const DussekarCharacter = ({ position, rotation }: any) => {
  const [dialogue, setDialogue] = useState<string | null>(null);
  const { scene } = useGLTF("https://raw.githubusercontent.com/Felipe9272727/Vers-o-definitiva/main/blocky%20character%203d%20model.glb") as any;
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const group = useRef<any>(null);
  const timeRef = useRef(0);
  useFrame((state, dt) => { 
      timeRef.current += dt;
      if (group.current) group.current.position.y = position[1] + Math.sin(timeRef.current * 0.8) * 0.015; 
  });
  useEffect(() => {
      let active = true; let showTimer: any; let hideTimer: any;
      const lines = ["The geometry is leaking.", "I saw a color that doesn't exist.", "Do the buttons feel pain?", "I am vibrating at the wrong frequency.", "Someone stole the floor yesterday.", "The air is too thick to chew.", "I remember when this was all orange.", "My reflection blinked first.", "Static tastes like lemons.", "The elevator knows what you did.", "Gravity is just a suggestion.", "I am waiting for the Tuesday that never comes.", "Do not look at the corners."];
      const runCycle = () => {
          if (!active) return;
          showTimer = setTimeout(() => {
              if (!active) return;
              const text = lines[Math.floor(Math.random() * lines.length)];
              setDialogue(text);
              hideTimer = setTimeout(() => { if (active) { setDialogue(null); runCycle(); } }, 10000);
          }, 5000);
      };
      runCycle(); return () => { active = false; clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, []);
  return (
      <group ref={group} position={position} rotation={rotation}>
          <primitive object={clonedScene} scale={3} position={[0, 0, 0]} />
           {dialogue && (
              <Html position={[0, 1.0, 0]} center distanceFactor={10}>
                  <div className="pointer-events-none select-none whitespace-nowrap speech-bubble">
                      <div className="bg-white text-black px-4 py-2 rounded-xl border-2 border-black shadow-lg relative flex items-center justify-center transform -translate-y-full">
                          <p className="text-sm font-bold font-mono m-0">{dialogue}</p>
                      </div>
                  </div>
              </Html>
           )}
      </group>
  )
};

export const Shop = ({ position }: any) => {
  const LIGHT_COLOR = "#FFEB3B";
  return (
      <group position={position}>
           <mesh position={[2.0, 0.05, 0]}><boxGeometry args={[4.0, 0.1, 4.8]} /><meshStandardMaterial color="#212121" roughness={0.9} /></mesh>
           <mesh position={[2.0, 3.95, 0]}><boxGeometry args={[4.0, 0.1, 4.8]} /><meshStandardMaterial color="#3E2723" /></mesh>
           <mesh position={[2.0, 3.85, 0]}><boxGeometry args={[2.5, 0.1, 3.5]} /><meshStandardMaterial color={LIGHT_COLOR} emissive={LIGHT_COLOR} emissiveIntensity={4.0} toneMapped={false} /></mesh>
           <mesh position={[3.95, 2.0, 0]}><boxGeometry args={[0.1, 4.0, 4.8]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <mesh position={[2.0, 2.0, -2.4]}><boxGeometry args={[4.0, 4.0, 0.1]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <mesh position={[2.0, 2.0, 2.4]}><boxGeometry args={[4.0, 4.0, 0.1]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <group position={[3.6, 1.1, -1.2]}><mesh><boxGeometry args={[0.2, 2.2, 1.0]} /><meshStandardMaterial color="#EEEEEE" /></mesh></group>
           <Barrel position={[3.0, 0, 1.8]} />
           <group position={[0.6, 0, 0]}><mesh position={[0, 1.05, 0]}><boxGeometry args={[1.0, 0.1, 5.0]} /><meshStandardMaterial color="#EEEEEE" roughness={0.2} metalness={0.1} /></mesh><mesh position={[0.1, 0.5, 0]}><boxGeometry args={[0.8, 1.0, 5.0]} /><TextureMaterial url={ASSETS.wood} color="#3E2723" repeat={[1, 1]} rotation={Math.PI/2} /></mesh></group>
           <group position={[0.6, 1.1, 0]}><mesh position={[0, 0.1, -0.6]}><cylinderGeometry args={[0.12, 0.1, 0.25, 16]} /><meshStandardMaterial color="#1565C0" roughness={0.3} /></mesh><mesh position={[0, 0.1, 0.6]}><cylinderGeometry args={[0.12, 0.1, 0.25, 16]} /><meshStandardMaterial color="#C62828" roughness={0.3} /></mesh></group>
           <DussekarCharacter position={[2.2, 1.1, 0]} rotation={[0, Math.PI, 0]} />
      </group>
  );
};

export const House = React.memo(({ x, z, rot, doorOpen, doorOpenAmount }: any) => {
    const doorRef = useRef<any>(null);
    useFrame((state, delta) => { if (doorRef.current) { const target = doorOpenAmount !== undefined ? -2 * doorOpenAmount : (doorOpen ? -2 : 0); doorRef.current.rotation.y = THREE.MathUtils.lerp(doorRef.current.rotation.y, target, delta * 3); } });
    return (
        <group position={[x, 0, z]} rotation={[0, rot, 0]}>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[7.8, 7.8]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[4, 4]} roughness={0.5} /></mesh>
            <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 5.95, 0]}><planeGeometry args={[7.8, 7.8]} /><meshStandardMaterial color="#FFFFFF" roughness={0.9} /></mesh>
            <mesh position={[0, 3, -4]}><boxGeometry args={[8, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[-4, 3, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[4, 3, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[-2.35, 3, 4]}><boxGeometry args={[3.3, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[2.35, 3, 4]}><boxGeometry args={[3.3, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[0, 5.125, 4]}><boxGeometry args={[1.4, 1.75, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[-2, 3, 0]}><boxGeometry args={[4, 6, 0.2]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <mesh position={[0, 3, -2]}><boxGeometry args={[0.2, 6, 4]} /><meshStandardMaterial color={COLORS.houseWall} roughness={0.8} /></mesh>
            <Sofa x={-2.5} z={2.5} rot={Math.PI/4} /> <CoffeeTable x={-2.0} z={1.5} /> <KitchenCounter x={-3.0} z={-3.5} w={1.5} d={0.8} /> <KitchenCounter x={-1.0} z={-3.5} w={1.5} d={0.8} />
            <mesh position={[-3.2, 1.5, -0.5]}><boxGeometry args={[1.2, 3, 1]} /><meshStandardMaterial color="#ECEFF1" metalness={0.3} roughness={0.2} /></mesh>
            <Bed x={2.5} z={-2.5} rot={0} />
            <group position={[-0.7, 1.25, 4.0]} ref={doorRef}>
                <group position={[0.7, 0, 0]}>
                    <mesh><boxGeometry args={[1.4, 2.5, 0.1]} /><meshStandardMaterial color="#5D4037" /></mesh>
                    <mesh position={[0.5, 0, 0.06]}> <sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#FFD700" /></mesh>
                </group>
            </group>
            <mesh position={[0, 8, 0]} rotation={[0, Math.PI/4, 0]}><coneGeometry args={[7, 4, 4]} /><meshStandardMaterial color={COLORS.houseRoof} roughness={0.6} /></mesh>
            <mesh position={[-2.5, 3.5, 4.15]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#81D4FA" emissive="#000000" roughness={0.2} metalness={0.8} /></mesh>
            <mesh position={[2.5, 3.5, 4.15]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#81D4FA" emissive="#000000" roughness={0.2} metalness={0.8} /></mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.01, 7]}><planeGeometry args={[2, 6]} /> <meshStandardMaterial color="#9E9E9E" /></mesh>
            <pointLight position={[0, 5, 0]} intensity={3} distance={12} color="#FFD54F" />
        </group>
    )
});

export const BarneyActor = ({ gameState, barneyRef, barneyTargetRef, playerPosRef, houseDoorOpen }: any) => {
    const meshRef = useRef<any>(null);
    const groupRef = useRef<any>(null);
    const lightRef = useRef<any>(null);
    const materialRef = useRef<any>(null);
    const timeRef = useRef(0);
    const scaleRef = useRef(0);
    const texture = useTexture(BARNEY_URL);
    
    useEffect(() => {
        if (texture) {
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.anisotropy = 1;
            texture.needsUpdate = true;
        }
    }, [texture]);
    
    const isScary = gameState === 'chase' || gameState === 'indoor_night';
    const isVisible = gameState === 'barney_greet' || gameState === 'indoor_day' || gameState === 'indoor_night' || gameState === 'chase' || gameState === 'sleep_fade';

    useFrame((state, dt) => {
        if (!groupRef.current || !meshRef.current) return;
        timeRef.current += dt;
        
        const b = barneyRef.current;
        const p = playerPosRef.current;
        const target = barneyTargetRef?.current || { x: b.x, z: b.z, scale: 1 };
        
        if (gameState === 'chase' && p) {
            const dx = p.x - b.x, dz = p.z - b.z;
            const d = Math.sqrt(dx*dx + dz*dz);
            if (d > 0.01) {
                const spd = 3.3 * dt;
                b.x += (dx/d) * spd;
                b.z += (dz/d) * spd;
            }
        } else {
            b.x = THREE.MathUtils.lerp(b.x, target.x, Math.min(1, dt * 2.5));
            b.z = THREE.MathUtils.lerp(b.z, target.z, Math.min(1, dt * 2.5));
        }
        
        const targetScale = target.scale !== undefined ? target.scale : 1;
        if (isVisible) {
            scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, Math.min(1, dt * 3));
        }
        groupRef.current.position.set(b.x, 0, b.z);
        
        const isActive = gameState === 'chase';
        const bobSpeed = isActive ? 8 : 2.2;
        const bobAmp = isActive ? 0.15 : 0.1;
        const swaySpeed = isActive ? 4 : 1.5;
        const swayAmp = isActive ? 0.08 : 0.05;
        
        const bob = Math.abs(Math.sin(timeRef.current * bobSpeed)) * bobAmp;
        const sway = Math.sin(timeRef.current * swaySpeed) * swayAmp;
        const tilt = Math.sin(timeRef.current * swaySpeed * 1.3) * 0.04;
        
        meshRef.current.position.set(sway, 0.935 + bob, 0);
        meshRef.current.rotation.z = tilt;
        
        let breathe;
        if (isActive) {
            breathe = 1 + Math.sin(timeRef.current * 8) * 0.08;
        } else {
            breathe = 1 + Math.sin(timeRef.current * 2.5) * 0.04;
        }
        const effectiveScale = isVisible ? scaleRef.current : THREE.MathUtils.lerp(scaleRef.current, 0, Math.min(1, dt * 5));
        scaleRef.current = effectiveScale;
        const finalScale = 2.4 * effectiveScale * breathe;
        meshRef.current.scale.set(finalScale, finalScale, finalScale);
        
        const cx = state.camera.position.x;
        const cz = state.camera.position.z;
        const fdx = cx - b.x, fdz = cz - b.z;
        groupRef.current.rotation.y = Math.atan2(fdx, fdz);
        
        if (lightRef.current) {
            lightRef.current.position.set(b.x, 1.5, b.z);
        }
    });
    
    if (!isVisible && scaleRef.current < 0.01) return null;
    
    return (
        <>
            <group ref={groupRef}>
                <mesh ref={meshRef}>
                    <planeGeometry args={[1.5, 2.0]} />
                    <meshBasicMaterial 
                        map={texture} 
                        transparent={true} 
                        alphaTest={0.05}
                        side={THREE.DoubleSide} 
                        toneMapped={false}
                        color={isScary ? "#A86090" : "#ffffff"}
                        depthWrite={false}
                    />
                </mesh>
            </group>
            {isScary && <pointLight ref={lightRef} intensity={1.8} distance={6} color="#FF1744" decay={2} />}
        </>
    );
};

export const FlatMapEnvironment = React.memo(({ houseDoorOpen, nightMode, doorOpenAmount }: any) => (
    <group>
        <color attach="background" args={['#87CEEB']} />
        <fog attach="fog" args={['#C8E6F0', 25, 60]} />
        <ambientLight intensity={0.5} color="#E3F2FD" />
        <hemisphereLight intensity={0.4} color="#87CEEB" groundColor="#4CAF50" />
        <mesh position={[0, 24, 0]}><boxGeometry args={[60, 60, 60]} /><meshBasicMaterial color={COLORS.sky} side={THREE.BackSide} /></mesh>
        <mesh position={[-20, 30, -20]}><sphereGeometry args={[4, 32, 32]} /><meshBasicMaterial color="#FFD700" /></mesh>
        <pointLight position={[-20, 30, -20]} intensity={0.5} distance={80} color="#FFF9C4" />
        <directionalLight position={[-20, 30, -20]} intensity={1.8} shadow-mapSize={[2048, 2048]}></directionalLight>
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[50, 50]} /><TextureMaterial url={ASSETS.grass} color={COLORS.grass} repeat={[12, 12]} roughness={0.8} /></mesh>
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.015, -2]}><planeGeometry args={[2.5, 14]} /><meshStandardMaterial color="#9E9E9E" roughness={0.9} /></mesh>
        <House x={0} z={10} rot={Math.PI} doorOpen={houseDoorOpen} doorOpenAmount={doorOpenAmount} />
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
            <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
        </group>
        <Instances limit={50} range={50}>
            <cylinderGeometry args={[0.15, 0.2, 3, 6]} />
            <meshStandardMaterial color="#5D4037" roughness={0.9} />
            {[[13.06,0.55,0.91],[13.76,6.49,1.07],[-6.17,13.14,0.81],[-12.22,8.61,1.02],[-14.72,1.24,1.12],[-14.34,-5.65,1.08],[-7.28,-11.33,1.18],[13.59,-7.29,1.09],[19.92,0.29,1.09],[17.85,7.83,1.21],[11.2,15.02,1.25],[9.61,14.85,1.04],[2.96,17.45,0.95],[-5.66,18.04,1.08],[-11.8,13.1,1.03],[-18.5,4.1,1.2],[-19.02,2.52,0.98],[-18.8,-6.74,1.22],[-13.16,-13.78,1.32],[16.11,-11.22,1.06],[17.2,-5.9,1.36],[21.66,-0.45,1.15],[19.21,9.99,1.35],[10.05,19.57,1.13],[-0.54,22.27,1.05],[0.04,21.27,1.38],[-16.11,15.06,1.04],[-20.52,11.43,1.32],[-22.51,-5.4,1.01],[-19.25,-12.04,1.32],[-16.05,-15.91,1.07],[-5.63,-21.41,1.57],[8.68,-19.84,1.3],[11.42,-20.29,1.52],[19.27,-11.8,1.37],[-12.5,20.34,1.07],[10.03,18.71,0.8],[-6.33,15.14,1.26],[13.63,20.82,0.95],[-15.91,21.15,1.27],[-13.26,-20.06,0.93],[8.34,-18.94,0.95],[-0.79,-19.8,1.01]].map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 1.5*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[1.2, 2, 6]} />
            <meshStandardMaterial color="#2E7D32" roughness={0.85} />
            {[[13.06,0.55,0.91],[13.76,6.49,1.07],[-6.17,13.14,0.81],[-12.22,8.61,1.02],[-14.72,1.24,1.12],[-14.34,-5.65,1.08],[-7.28,-11.33,1.18],[13.59,-7.29,1.09],[19.92,0.29,1.09],[17.85,7.83,1.21],[11.2,15.02,1.25],[9.61,14.85,1.04],[2.96,17.45,0.95],[-5.66,18.04,1.08],[-11.8,13.1,1.03],[-18.5,4.1,1.2],[-19.02,2.52,0.98],[-18.8,-6.74,1.22],[-13.16,-13.78,1.32],[16.11,-11.22,1.06],[17.2,-5.9,1.36],[21.66,-0.45,1.15],[19.21,9.99,1.35],[10.05,19.57,1.13],[-0.54,22.27,1.05],[0.04,21.27,1.38],[-16.11,15.06,1.04],[-20.52,11.43,1.32],[-22.51,-5.4,1.01],[-19.25,-12.04,1.32],[-16.05,-15.91,1.07],[-5.63,-21.41,1.57],[8.68,-19.84,1.3],[11.42,-20.29,1.52],[19.27,-11.8,1.37],[-12.5,20.34,1.07],[10.03,18.71,0.8],[-6.33,15.14,1.26],[13.63,20.82,0.95],[-15.91,21.15,1.27],[-13.26,-20.06,0.93],[8.34,-18.94,0.95],[-0.79,-19.8,1.01]].map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 3.5*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[0.9, 1.6, 6]} />
            <meshStandardMaterial color="#388E3C" roughness={0.85} />
            {[[13.06,0.55,0.91],[13.76,6.49,1.07],[-6.17,13.14,0.81],[-12.22,8.61,1.02],[-14.72,1.24,1.12],[-14.34,-5.65,1.08],[-7.28,-11.33,1.18],[13.59,-7.29,1.09],[19.92,0.29,1.09],[17.85,7.83,1.21],[11.2,15.02,1.25],[9.61,14.85,1.04],[2.96,17.45,0.95],[-5.66,18.04,1.08],[-11.8,13.1,1.03],[-18.5,4.1,1.2],[-19.02,2.52,0.98],[-18.8,-6.74,1.22],[-13.16,-13.78,1.32],[16.11,-11.22,1.06],[17.2,-5.9,1.36],[21.66,-0.45,1.15],[19.21,9.99,1.35],[10.05,19.57,1.13],[-0.54,22.27,1.05],[0.04,21.27,1.38],[-16.11,15.06,1.04],[-20.52,11.43,1.32],[-22.51,-5.4,1.01],[-19.25,-12.04,1.32],[-16.05,-15.91,1.07],[-5.63,-21.41,1.57],[8.68,-19.84,1.3],[11.42,-20.29,1.52],[19.27,-11.8,1.37],[-12.5,20.34,1.07],[10.03,18.71,0.8],[-6.33,15.14,1.26],[13.63,20.82,0.95],[-15.91,21.15,1.27],[-13.26,-20.06,0.93],[8.34,-18.94,0.95],[-0.79,-19.8,1.01]].map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 4.3*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[0.6, 1.2, 6]} />
            <meshStandardMaterial color="#43A047" roughness={0.85} />
            {[[13.06,0.55,0.91],[13.76,6.49,1.07],[-6.17,13.14,0.81],[-12.22,8.61,1.02],[-14.72,1.24,1.12],[-14.34,-5.65,1.08],[-7.28,-11.33,1.18],[13.59,-7.29,1.09],[19.92,0.29,1.09],[17.85,7.83,1.21],[11.2,15.02,1.25],[9.61,14.85,1.04],[2.96,17.45,0.95],[-5.66,18.04,1.08],[-11.8,13.1,1.03],[-18.5,4.1,1.2],[-19.02,2.52,0.98],[-18.8,-6.74,1.22],[-13.16,-13.78,1.32],[16.11,-11.22,1.06],[17.2,-5.9,1.36],[21.66,-0.45,1.15],[19.21,9.99,1.35],[10.05,19.57,1.13],[-0.54,22.27,1.05],[0.04,21.27,1.38],[-16.11,15.06,1.04],[-20.52,11.43,1.32],[-22.51,-5.4,1.01],[-19.25,-12.04,1.32],[-16.05,-15.91,1.07],[-5.63,-21.41,1.57],[8.68,-19.84,1.3],[11.42,-20.29,1.52],[19.27,-11.8,1.37],[-12.5,20.34,1.07],[10.03,18.71,0.8],[-6.33,15.14,1.26],[13.63,20.82,0.95],[-15.91,21.15,1.27],[-13.26,-20.06,0.93],[8.34,-18.94,0.95],[-0.79,-19.8,1.01]].map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 4.9*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        {[[-15,22,10,3],[10,25,-5,4],[20,23,15,2.5],[-5,24,-15,3.5],[0,26,20,2]].map(([cx,cy,cz,cr],i) => (
            <mesh key={i} position={[cx,cy,cz]}><sphereGeometry args={[cr, 8, 8]} /><meshBasicMaterial color="#FFFFFF" transparent opacity={0.7} /></mesh>
        ))}
        {[[-6,5,-6,15],[6,5,6,15],[-6,15,6,15],[-6,5,-4.5,5],[4.5,5,6,5]].map(([x1,z1,x2,z2],i) => {
            const dx=x2-x1, dz=z2-z1, len=Math.sqrt(dx*dx+dz*dz), ang=Math.atan2(dx,dz);
            return (<group key={i}>
                <mesh position={[(x1+x2)/2, 0.4, (z1+z2)/2]} rotation={[0,ang,0]}><boxGeometry args={[0.04, 0.04, len]} /><meshStandardMaterial color="#8D6E63" roughness={0.8} /></mesh>
                <mesh position={[(x1+x2)/2, 0.7, (z1+z2)/2]} rotation={[0,ang,0]}><boxGeometry args={[0.04, 0.04, len]} /><meshStandardMaterial color="#8D6E63" roughness={0.8} /></mesh>
            </group>);
        })}
    </group>
));
