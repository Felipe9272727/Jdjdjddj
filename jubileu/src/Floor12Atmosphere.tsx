import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCloudGeometry } from './f12CloudGeometry';

/** Framing landmarks: the flight corridor remains clear. Windows/clouds are instanced. */
export function Floor12Atmosphere() {
  const windows = useRef<THREE.InstancedMesh>(null!);
  const clouds = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cloudGeometry = useMemo(createCloudGeometry, []);
  useEffect(() => () => cloudGeometry.dispose(), [cloudGeometry]);
  useEffect(() => {
    let n = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 10; row++) for (let col = 0; col < 3; col++) {
      dummy.position.set(side * 39 + (col - 1) * 1.8, 3 + row * 1.7, -99.8);
      dummy.scale.set(.42, .84, .12); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); windows.current.setMatrixAt(n++, dummy.matrix);
    }
    windows.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);
  useFrame(({ clock }) => {
    for (let i = 0; i < 20; i++) {
      const side = i % 2 ? -1 : 1, layer = Math.floor(i / 2);
      dummy.position.set(side * (28 + layer * 4.4) + Math.sin(clock.elapsedTime * .025 + layer) * 2,
        -8 + Math.sin(layer * 2.1) * 2.4, -48 - layer * 13);
      dummy.scale.set(7 + layer * .45, 4.2 + layer * .18, 5.5);
      dummy.rotation.set(0, layer * .73, .08 * side);
      dummy.updateMatrix(); clouds.current.setMatrixAt(i, dummy.matrix);
    }
    clouds.current.instanceMatrix.needsUpdate = true;
  });
  return <group name="hoteis-do-horizonte">
    {[-1, 1].map(side => <group key={side} position={[side * 39, 0, -104]}>
      <mesh position={[0, 10, 0]}><boxGeometry args={[8.8, 24, 7.5]} />
        <meshStandardMaterial color="#284954" roughness={.88} /></mesh>
      {[0, 1, 2].map(i => <group key={i} position={[0, 22 + i * 1.6, 0]}>
        <mesh><boxGeometry args={[9 - i * 2.1, 1.4, 8 - i * 1.6]} />
          <meshStandardMaterial color="#315561" roughness={.7} /></mesh>
        <mesh position={[0, -.55, .1]}><boxGeometry args={[9.3 - i * 2.1, .15, 8.3 - i * 1.6]} />
          <meshStandardMaterial color="#b49867" metalness={.35} roughness={.55} /></mesh>
      </group>)}
      <mesh position={[0, 29, 0]}><coneGeometry args={[1.4, 5.8, 4]} />
        <meshStandardMaterial color="#c19a59" metalness={.6} roughness={.35} /></mesh>
      <mesh position={[0, -5, 0]} rotation={[0, .5, 0]} scale={[8, 5, 7]}>
        <octahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#18333f" roughness={1} /></mesh>
      {[-1, 1].map(edge => <mesh key={edge} position={[edge * 3.8, 9, 3.8]}>
        <boxGeometry args={[.26, 22, .26]} /><meshStandardMaterial color="#678081" roughness={.7} /></mesh>)}
    </group>)}
    <instancedMesh ref={windows} args={[undefined, undefined, 60]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#f5ce85" emissive="#e9a448" emissiveIntensity={.7} />
    </instancedMesh>
    <instancedMesh ref={clouds} args={[cloudGeometry, undefined, 20]} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={1} />
    </instancedMesh>
  </group>;
}
