import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/** A concierge's peaked cap gives the silhouette a single recognisable identity. */
export function Floor12BossCrown() {
  const visor = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-3.15, 0); s.quadraticCurveTo(0, -1.25, 3.15, 0);
    s.quadraticCurveTo(0, .65, -3.15, 0);
    return new THREE.ExtrudeGeometry(s, { depth: .18, bevelEnabled: true,
      bevelThickness: .06, bevelSize: .06, bevelSegments: 2, curveSegments: 20 });
  }, []);
  useEffect(() => () => visor.dispose(), [visor]);
  return <group name="quepe-do-concierge" position={[0, 3.06, 0]}>
    <mesh position={[0, .60, -.05]} scale={[1, 1, .81]}>
      <cylinderGeometry args={[3.08, 3.38, 1.40, 48]} />
      <meshStandardMaterial color="#173b45" metalness={.30} roughness={.48} />
    </mesh>
    <mesh position={[0, .04, .02]} scale={[1, 1, .84]}>
      <cylinderGeometry args={[3.38, 3.31, .28, 48]} />
      <meshStandardMaterial color="#be924d" metalness={.78} roughness={.30} />
    </mesh>
    <mesh geometry={visor} position={[0, -.07, 2.3]} rotation={[-Math.PI / 2 + .12, 0, 0]}>
      <meshStandardMaterial color="#102830" metalness={.45} roughness={.26} />
    </mesh>
    <group position={[0, .56, 2.65]}>
      <mesh scale={[.75, .9, .18]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[.9, .9, .9]} />
        <meshStandardMaterial color="#d5aa56" metalness={.72} roughness={.26} />
      </mesh>
      <mesh position={[0, .06, .16]}>
        <torusGeometry args={[.15, .045, 6, 16]} />
        <meshStandardMaterial color="#173b45" />
      </mesh>
      <mesh position={[0, -.17, .16]}>
        <boxGeometry args={[.07, .28, .05]} />
        <meshStandardMaterial color="#173b45" />
      </mesh>
      <mesh position={[.075, -.27, .16]}>
        <boxGeometry args={[.16, .07, .05]} />
        <meshStandardMaterial color="#173b45" />
      </mesh>
    </group>
    {[-1, 1].map(side => <mesh key={side} position={[side * 2.73, .42, 1.85]}>
      <sphereGeometry args={[.15, 12, 8]} />
      <meshStandardMaterial color="#d5aa56" metalness={.75} roughness={.28} />
    </mesh>)}
  </group>;
}
