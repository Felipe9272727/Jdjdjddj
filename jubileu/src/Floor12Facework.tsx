import * as THREE from 'three';

/** Shared sculpt geometry and fitted trim; the parent owns their lifetime. */
export function Floor12Facework({material, geometry, rims}: {
  material: THREE.Material; geometry: THREE.BufferGeometry; rims: THREE.BufferGeometry[];
}) {
  return <group name="mascara-do-concierge">
    <mesh name="concierge-blender-face" geometry={geometry} material={material} />
    {[-1,1].map((side,i)=><group key={side}>
      <mesh position={[side*1.55,1.15,2.62]} scale={[1.01,.71,.18]}>
        <sphereGeometry args={[1,24,16]} />
        <meshStandardMaterial color="#12313a" roughness={.5} />
      </mesh>
      <mesh geometry={rims[i]}>
        <meshStandardMaterial color="#bd934e" metalness={.8} roughness={.28} />
      </mesh>
      <mesh position={[side*2.95,-.48,1.68]} rotation={[0,0,side*-.10]}>
        <capsuleGeometry args={[.22,1.30,4,12]} />
        <meshStandardMaterial color="#173e48" metalness={.55} roughness={.4} />
      </mesh>
      <mesh position={[side*2.40,-1.32,1.80]} rotation={[0,Math.PI/2,0]}>
        <cylinderGeometry args={[.30,.30,.20,16]} />
        <meshStandardMaterial color="#d5aa56" metalness={.8} roughness={.3} />
      </mesh>
    </group>)}
  </group>;
}
