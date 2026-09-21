import { useEffect, useMemo } from 'react';
import { createConciergeGeometry } from './f12ConciergeGeometry';

/** Sculpted porcelain shell; live eyes, jaw and mouth target stay in Floor12Cabeca. */
export function Floor12Facework() {
  const assets = useMemo(() => {
    return { sculpt: createConciergeGeometry() };
  }, []);
  useEffect(() => () => Object.values(assets).forEach(g => g.dispose()), [assets]);
  return <group name="mascara-do-concierge">
    <mesh name="concierge-blender-face" geometry={assets.sculpt}>
      <meshStandardMaterial color="#e9ddbd" roughness={.43} metalness={.08} />
    </mesh>
    {[-1, 1].map(side => <group key={side}>
      {/* Recessed almond sockets, with a single brass eyelid seam. */}
      <mesh position={[side * 1.55, 1.15, 3.04]} scale={[1.10, .75, .24]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#12313a" roughness={.5} />
      </mesh>
      <mesh position={[side * 1.55, 1.15, 3.20]} scale={[1.12, .75, 1]}>
        <torusGeometry args={[.82, .045, 6, 32]} />
        <meshStandardMaterial color="#bd934e" metalness={.8} roughness={.28} />
      </mesh>
      {/* Temple hinge and vent follow the same uniform/cap palette. */}
      <mesh position={[side * 3.04, -.48, 1.86]} rotation={[0, 0, side * -.10]}>
        <capsuleGeometry args={[.27, 1.42, 4, 12]} />
        <meshStandardMaterial color="#173e48" metalness={.55} roughness={.4} />
      </mesh>
      <mesh position={[side * 2.85, -1.22, 2.70]}>
        <sphereGeometry args={[.15, 12, 8]} />
        <meshStandardMaterial color="#d5aa56" metalness={.8} roughness={.3} />
      </mesh>
      {[0, 1, 2].map(i => <mesh key={i} position={[side * (2.79 - i * .04), -.1 - i * .28, 3.02]}
        rotation={[0, 0, side * -.22]}>
        <capsuleGeometry args={[.035, .30, 2, 6]} />
        <meshStandardMaterial color="#b9955d" metalness={.6} roughness={.4} />
      </mesh>)}
    </group>)}
  </group>;
}
