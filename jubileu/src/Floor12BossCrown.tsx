import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bocaNoInstante, f12 } from './f12Boss';
import { F12_PALETTE as P } from './f12Presentation';

/** Architectural details in the head's local space: the concierge wears the
 * hotel itself. These follow the skull instead of floating independently. */
export function Floor12BossCrown() {
  const hand = useRef<THREE.Group>(null);
  const materials = useMemo(() => ({
    brass: new THREE.MeshStandardMaterial({ color: P.brass, metalness: .55, roughness: .42 }),
    dark: new THREE.MeshStandardMaterial({ color: P.hullDark, metalness: .3, roughness: .68 }),
    ivory: new THREE.MeshStandardMaterial({ color: P.ivory, metalness: .05, roughness: .86 }),
    light: new THREE.MeshBasicMaterial({ color: P.brass, toneMapped: false }),
  }), []);
  const warning = useMemo(() => new THREE.Color(P.danger), []);
  const warm = useMemo(() => new THREE.Color(P.brass), []);
  const ritual = useMemo(() => new THREE.Color(P.ritual), []);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);
  useFrame((_, dt) => {
    const mouth = bocaNoInstante(f12.bocaT);
    if (hand.current) hand.current.rotation.z = -.22 - mouth.abertura * Math.PI * 1.6;
    materials.light.color.lerp(mouth.estado === 'abrindo' ? warning : f12.passouDaVirada ? ritual : warm,
      1 - Math.exp(-Math.min(dt, .05) * 9));
  });
  return <group name="coroa-do-hotel">
    <mesh position={[0, 2.84, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.brass}>
      <torusGeometry args={[2.13, .15, 8, 36]} />
    </mesh>
    {[-2, -1, 0, 1, 2].map((column, i) => {
      const height = 1.10 + (2 - Math.abs(column)) * .42;
      return <group key={column} position={[column * .68, 3.05, -.10]}>
        <mesh position={[0, height / 2, 0]} material={materials.dark}>
          <boxGeometry args={[.58, height, .85]} />
        </mesh>
        <mesh position={[0, height + .05, 0]} material={materials.brass}>
          <boxGeometry args={[.69, .15, .99]} />
        </mesh>
        {[0, 1].map(row => <mesh key={row} position={[0, .30 + row * .44, .436]} material={materials.light}>
          <boxGeometry args={[.16, .24, .035]} />
        </mesh>)}
        {i === 2 && <mesh position={[0, height + .50, 0]} material={materials.brass}>
          <coneGeometry args={[.17, .84, 8]} />
        </mesh>}
      </group>;
    })}
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * 3.03, .38, .14]} rotation={[0, 0, Math.PI / 2]} material={materials.brass}>
        <cylinderGeometry args={[.61, .61, .54, 16]} />
      </mesh>
      <mesh position={[side * 3.32, .38, .14]} rotation={[0, Math.PI / 2, 0]} material={materials.dark}>
        <torusGeometry args={[.43, .10, 8, 24]} />
      </mesh>
      <mesh position={[side * 2.40, -.10, 2.19]} rotation={[0, side * .24, side * -.17]} material={materials.ivory}>
        <boxGeometry args={[.48, 1.38, .42]} />
      </mesh>
      <mesh position={[side * 2.55, .12, 2.42]} rotation={[0, side * .24, side * -.17]} material={materials.brass}>
        <boxGeometry args={[.09, 1.25, .055]} />
      </mesh>
    </group>)}
    <group position={[0, 2.0, 3.04]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.dark}>
        <cylinderGeometry args={[.53, .53, .16, 32]} />
      </mesh>
      <mesh position={[0, 0, .10]} material={materials.brass}>
        <torusGeometry args={[.52, .065, 8, 32]} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI / 6;
        return <mesh key={i} position={[Math.sin(angle) * .42, Math.cos(angle) * .42, .12]}
          rotation={[0, 0, -angle]} material={materials.ivory}>
          <boxGeometry args={[.028, i % 3 ? .055 : .10, .025]} />
        </mesh>;
      })}
      <group ref={hand} position={[0, 0, .15]}>
        <mesh position={[0, .13, 0]} material={materials.light}>
          <boxGeometry args={[.045, .31, .026]} />
        </mesh>
      </group>
      <mesh position={[0, 0, .16]} material={materials.brass}>
        <sphereGeometry args={[.063, 10, 8]} />
      </mesh>
    </group>
  </group>;
}
