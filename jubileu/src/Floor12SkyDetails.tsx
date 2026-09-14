import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Quiet hotel traffic far behind the combat plane, never used as an enemy cue. */
export function Floor12SkyDetails() {
  const ships = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ships.current?.children.forEach((ship, i) => {
      ship.position.x = (i ? 31 : -33) + Math.sin(clock.elapsedTime * .035 + i * 2) * 8;
      ship.position.y = (i ? 15 : 8) + Math.sin(clock.elapsedTime * .24 + i) * .6;
      ship.rotation.z = Math.sin(clock.elapsedTime * .16 + i) * .025;
    });
  });
  return <group name="rotas-do-hotel">
    <group ref={ships}>
      {[0, 1].map(i => <group key={i} position={[i ? 31 : -33, i ? 15 : 8, i ? -128 : -105]}>
        <mesh scale={[5.5, 1.45, 1.6]}><sphereGeometry args={[1, 20, 12]} /><meshLambertMaterial color="#b6b394" /></mesh>
        <mesh position={[0, -2.1, 0]}><boxGeometry args={[3.3, .8, 1.2]} /><meshLambertMaterial color="#233e47" /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <mesh position={[side * 1.2, -1.45, 0]}><boxGeometry args={[.12, 1.4, .12]} /><meshLambertMaterial color="#9f8352" /></mesh>
          <mesh position={[side * .85, -2.05, .63]}><boxGeometry args={[.7, .22, .035]} /><meshBasicMaterial color="#b2a477" /></mesh>
        </group>)}
        <mesh position={[-4.5, .35, 0]} rotation={[0, 0, -.3]}><boxGeometry args={[1.5, 2.4, .14]} /><meshLambertMaterial color="#536c70" /></mesh>
      </group>)}
    </group>
    {[-1, 1].map(side => <group key={side} position={[side * 25, -7, -114]} rotation={[0, side * .3, 0]}>
      <mesh><boxGeometry args={[24, .35, 1.2]} /><meshLambertMaterial color="#9e8b5b" /></mesh>
      {[-10, -6, -2, 2, 6, 10].map(x => <mesh key={x} position={[x, 1.2, 0]}>
        <boxGeometry args={[.2, 2.4, .2]} /><meshLambertMaterial color="#52666a" />
      </mesh>)}
      <mesh position={[0, 2.4, 0]}><boxGeometry args={[24, .15, .15]} /><meshLambertMaterial color="#9e8b5b" /></mesh>
    </group>)}
  </group>;
}
