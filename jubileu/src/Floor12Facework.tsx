import * as THREE from 'three';

/** Shared sculpt geometry and fitted trim; the parent owns their lifetime. */
export function Floor12Facework({material, geometry, rims}: {
  material: THREE.Material; geometry: THREE.BufferGeometry; rims: THREE.BufferGeometry[];
}) {
  return <group name="mascara-do-concierge">
    <mesh name="concierge-blender-face" geometry={geometry} material={material} />
    {[-1,1].map((side,i)=><group key={side}>
      <mesh position={[side*1.55,1.15,2.62]} scale={[1.01,.71,.18]}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color="#12313a" roughness={.5} />
      </mesh>
      <mesh geometry={rims[i]}>
        <meshStandardMaterial color="#bd934e" metalness={.8} roughness={.28} />
      </mesh>
      <mesh position={[side*2.95,-.48,1.68]} rotation={[0,0,side*-.10]}>
        <capsuleGeometry args={[.22,1.30,4,12]} />
        <meshStandardMaterial color="#173e48" metalness={.55} roughness={.4} />
      </mesh>
      {/* A articulação lateral fica diante do casco: a mandíbula lê como
          mecanismo independente ao abrir, sem mover o ponto de acerto. */}
      <mesh position={[side*2.36,-1.38,2.42]} rotation={[Math.PI/2,0,0]}>
        <cylinderGeometry args={[.37, .37, .15, 24]} />
        <meshStandardMaterial color="#102b33" metalness={.54} roughness={.4} />
      </mesh>
      <mesh position={[side*2.36,-1.38,2.53]}>
        <torusGeometry args={[.28, .055, 12, 32]} />
        <meshStandardMaterial color="#c39a5c" metalness={.78} roughness={.3} />
      </mesh>
      <mesh position={[side*2.36,-1.38,2.54]} scale={[.72,.72,.22]}>
        <sphereGeometry args={[.22, 24, 16]} />
        <meshStandardMaterial color="#416775" metalness={.6} roughness={.35} />
      </mesh>
    </group>)}
  </group>;
}
