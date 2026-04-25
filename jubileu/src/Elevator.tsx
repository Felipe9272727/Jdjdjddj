import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { TextureMaterial } from './Materials';
import { ASSETS, COLORS } from './constants';
import { CallPanel } from './BuildingBlocks';
import * as THREE from 'three';

export const ElevatorDoors = React.memo(({ closed }: any) => {
  const leftRef = useRef<any>(null); const rightRef = useRef<any>(null);
  useFrame((s, dt) => {
      const spd = 5.0 * dt;
      if (leftRef.current) leftRef.current.position.x = THREE.MathUtils.lerp(leftRef.current.position.x, closed ? -0.76 : -2.3, spd);
      if (rightRef.current) rightRef.current.position.x = THREE.MathUtils.lerp(rightRef.current.position.x, closed ? 0.76 : 2.3, spd);
  });
  return (
      <group position={[0, 2.0, 2.92]}>
          <group ref={leftRef} position={[-2.3, 0, 0]}><mesh><boxGeometry args={[1.52, 4.0, 0.05]} /><meshStandardMaterial color="#B0BEC5" metalness={0.2} roughness={0.3} /></mesh></group>
          <group ref={rightRef} position={[2.3, 0, 0]}><mesh><boxGeometry args={[1.52, 4.0, 0.05]} /><meshStandardMaterial color="#B0BEC5" metalness={0.2} roughness={0.3} /></mesh></group>
      </group>
  );
});

export const ElevatorFacade = React.memo(({ z, height = 4.5, width = 10 }: any) => {
  const W = width; const H = height; const WH = 1.2;
  return (
      <group position={[0, 0, z]}>
          <group position={[-(W/4 + 1), H/2, 0]}>
              <mesh><boxGeometry args={[W/2 - 2, H, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[2, 1]} roughness={0.9} /></mesh>
              <mesh position={[-0.2, -H/2 + WH/2, 0.3]}><boxGeometry args={[W/2 - 2.5, WH, 0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[2, 1]} roughness={0.6} /></mesh>
          </group>
          <group position={[(W/4 + 1), H/2, 0]}>
              <mesh><boxGeometry args={[W/2 - 2, H, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[2, 1]} roughness={0.9} /></mesh>
              <mesh position={[0.2, -H/2 + WH/2, 0.3]}><boxGeometry args={[W/2 - 2.5, WH, 0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[2, 1]} roughness={0.6} /></mesh>
          </group>
          <mesh position={[0, H - (H-2.8)/2, 0]}><boxGeometry args={[4, H - 2.8, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[1, 0.5]} roughness={0.9} /></mesh>
          <group position={[0, H - 0.4, 0.3]}>
              <mesh><boxGeometry args={[3.5, 0.6, 0.06]} /><meshStandardMaterial color="#1a1a1a" roughness={0.2} /></mesh>
              <Text position={[0, 0, 0.04]} fontSize={0.18} color="#FFD54F" anchorX="center" anchorY="middle" letterSpacing={0.12}>THE NORMAL ELEVATOR</Text>
              <pointLight position={[0, -0.3, 0.5]} intensity={1} distance={4} color="#FFD54F" decay={2} />
          </group>
          <CallPanel x={2.3} z={0.05} rot={0} />
      </group>
  );
});

export const ElevatorInterior = React.memo(({ timer, doorsClosed, level }: any) => {
  const EW = 6.5; const ED = 6.0; const EH = 4.0; const EZ = -13.0; const OW = 3.0;
  const panelText = timer !== null ? String(Math.ceil(timer)).padStart(2, '0') : "--";
  const panelColor = timer !== null ? "#FF0000" : "#00FF00";
  const fi = level === 1 ? 1.5 : 3.5;
  return (
      <group position={[0, 0, EZ]}>
          <pointLight position={[0, 3.5, 0]} intensity={fi} distance={15} color="#FFF3E0" decay={1} />
          <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}><planeGeometry args={[EW, ED]} /><meshStandardMaterial color={COLORS.elevFloor} roughness={0.3} metalness={0.05} /></mesh>
          <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.023, 0]}>
              <planeGeometry args={[3.2, 3.2]} />
              <meshStandardMaterial color={COLORS.elevDiamond} roughness={0.4} metalness={0.1} />
          </mesh>
          <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.024, 0]}>
              <planeGeometry args={[2.7, 2.7]} />
              <meshStandardMaterial color={COLORS.elevFloor} roughness={0.3} metalness={0.05} />
          </mesh>
          <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.025, 0]}>
              <planeGeometry args={[0.8, 0.8]} />
              <meshStandardMaterial color={COLORS.elevDiamond} roughness={0.4} metalness={0.1} />
          </mesh>
          <mesh position={[-EW/2+0.15, 1.0, 0]}><boxGeometry args={[0.05, 0.05, ED-0.5]} /><meshStandardMaterial color="#9E9E9E" metalness={0.6} roughness={0.2} /></mesh>
          <mesh position={[EW/2-0.15, 1.0, 0]}><boxGeometry args={[0.05, 0.05, ED-0.5]} /><meshStandardMaterial color="#9E9E9E" metalness={0.6} roughness={0.2} /></mesh>
          <mesh position={[0, 1.0, -ED/2+0.15]}><boxGeometry args={[EW-0.5, 0.05, 0.05]} /><meshStandardMaterial color="#9E9E9E" metalness={0.6} roughness={0.2} /></mesh>
          <group position={[0, EH, 0]}>
              <mesh rotation={[Math.PI/2, 0, 0]}><planeGeometry args={[EW, ED]} /><TextureMaterial url={ASSETS.wood} color="#5D4037" repeat={[3, 3]} roughness={0.8} /></mesh>
              {[[-2,-2],[2,-2],[-2,2],[2,2]].map((p,i) => (
                  <mesh key={i} position={[p[0], -0.05, p[1]]} rotation={[Math.PI/2, 0, 0]}>
                      <circleGeometry args={[0.22, 16]} />
                      <meshBasicMaterial color="#FFF9C4" toneMapped={false} />
                  </mesh>
              ))}
          </group>
          <group position={[0, EH/2, -ED/2+0.05]}>
              <mesh><boxGeometry args={[EW, EH, 0.1]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[0, -EH/2+0.3, 0.05]}><boxGeometry args={[EW, 0.6, 0.05]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[-EW/2+0.05, EH/2, 0]}>
              <mesh><boxGeometry args={[0.1, EH, ED]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[0.05, -EH/2+0.3, 0]}><boxGeometry args={[0.05, 0.6, ED]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[EW/2-0.05, EH/2, 0]}>
              <mesh><boxGeometry args={[0.1, EH, ED]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[-0.05, -EH/2+0.3, 0]}><boxGeometry args={[0.05, 0.6, ED]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[1.8, 1.4, 2.7]} rotation={[0, Math.PI, 0]}>
              <mesh position={[0, 0, -0.1]}><boxGeometry args={[0.55, 1.15, 0.2]} /><meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.3} /></mesh>
              <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 1.1, 0.02]} /><meshStandardMaterial color="#37474F" metalness={0.4} roughness={0.35} /></mesh>
              <mesh position={[0, 0.5, 0.012]}><boxGeometry args={[0.48, 0.04, 0.005]} /><meshStandardMaterial color="#FFD54F" metalness={0.7} roughness={0.25} /></mesh>
              <group position={[0, 0.3, 0.02]}>
                  <mesh><planeGeometry args={[0.4, 0.18]} /><meshBasicMaterial color="#000000" /></mesh>
                  <Text position={[0, 0, 0.01]} fontSize={0.14} color={panelColor} anchorX="center" anchorY="middle" letterSpacing={0.1}>{panelText}</Text>
              </group>
              <group position={[0, -0.15, 0.015]}>
                  {[1,2,3,4].map((num,i) => {
                      const lit = num === 3;
                      return (
                          <group key={num} position={[((i%2)-0.5)*0.18, (1-Math.floor(i/2))*0.18, 0]}>
                              <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.05, 0.05, 0.02, 16]} /><meshStandardMaterial color={lit ? "#FFEB3B" : "#BDBDBD"} emissive={lit ? "#FFEB3B" : "#000000"} emissiveIntensity={lit ? 0.8 : 0} metalness={0.4} roughness={0.3} toneMapped={!lit} /></mesh>
                              <Text position={[0, 0, 0.013]} fontSize={0.045} color={lit ? "#1a1a1a" : "#424242"} anchorX="center" anchorY="middle">{num}</Text>
                          </group>
                      );
                  })}
              </group>
              <group position={[0, -0.45, 0.015]}>
                  <mesh position={[-0.1, 0, 0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.04, 0.04, 0.02, 12]} /><meshStandardMaterial color="#FF5252" emissive="#FF5252" emissiveIntensity={0.3} toneMapped={false} /></mesh>
                  <mesh position={[0.1, 0, 0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.04, 0.04, 0.02, 12]} /><meshStandardMaterial color="#81C784" /></mesh>
              </group>
          </group>
          <group position={[0, 0, ED/2]}>
              <mesh position={[-(EW+OW)/4, EH/2, 0]}><boxGeometry args={[(EW-OW)/2, EH, 0.2]} /><meshStandardMaterial color={COLORS.elevDoor} metalness={0.2} roughness={0.3} /></mesh>
              <mesh position={[(EW+OW)/4, EH/2, 0]}><boxGeometry args={[(EW-OW)/2, EH, 0.2]} /><meshStandardMaterial color={COLORS.elevDoor} metalness={0.2} roughness={0.3} /></mesh>
              <mesh position={[0, EH-(EH-2.6)/2, 0]}><boxGeometry args={[OW, EH-2.6, 0.2]} /><meshStandardMaterial color={COLORS.elevDoor} metalness={0.2} roughness={0.3} /></mesh>
          </group>
          <ElevatorDoors closed={doorsClosed} />
      </group>
  );
});
