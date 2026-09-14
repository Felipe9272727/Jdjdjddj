import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/** One continuous porcelain faceplate: the cheekbones flow into the brow. */
export function Floor12Facework() {
  const assets = useMemo(() => {
    const mask = new THREE.Shape();
    mask.moveTo(0, 3.55);
    mask.bezierCurveTo(1.8, 3.55, 3.18, 2.6, 3.13, 1.25);
    mask.bezierCurveTo(3.1, -.4, 2.8, -2.45, 2.45, -2.7);
    mask.lineTo(2.30, -.8); mask.quadraticCurveTo(1.2, -.5, 0, -.58);
    mask.quadraticCurveTo(-1.2, -.5, -2.30, -.8); mask.lineTo(-2.45, -2.7);
    mask.bezierCurveTo(-2.8, -2.45, -3.1, -.4, -3.13, 1.25);
    mask.bezierCurveTo(-3.18, 2.6, -1.8, 3.55, 0, 3.55);
    for (const side of [-1, 1]) {
      const eye = new THREE.Path();
      eye.absellipse(side * 1.55, 1.15, .95, .64, 0, Math.PI * 2, true, 0);
      mask.holes.push(eye);
    }
    const plate = new THREE.ExtrudeGeometry(mask, {
      depth: .20, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelSize: .09, bevelThickness: .11, curveSegments: 16,
    });
    // Sloping bridge and rounded tip, deliberately replacing the old cube nose.
    const nose = new THREE.BufferGeometry();
    nose.setAttribute('position', new THREE.Float32BufferAttribute([
      -.24, 1.58, 3.18, .24, 1.58, 3.18, -.45, -.12, 3.52,
      .24, 1.58, 3.18, .45, -.12, 3.52, -.45, -.12, 3.52,
      -.24, 1.58, 3.18, -.45, -.12, 3.52, 0, .03, 4.07,
      .24, 1.58, 3.18, 0, .03, 4.07, .45, -.12, 3.52,
      -.24, 1.58, 3.18, 0, .03, 4.07, .24, 1.58, 3.18,
      -.45, -.12, 3.52, .45, -.12, 3.52, 0, .03, 4.07,
    ], 3));
    nose.computeVertexNormals();
    const lip = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.4, -.76, 3.2), new THREE.Vector3(-1.2, -.60, 3.48),
      new THREE.Vector3(0, -.67, 3.59), new THREE.Vector3(1.2, -.60, 3.48),
      new THREE.Vector3(2.4, -.76, 3.2),
    ]), 28, .105, 6, false);
    return { plate, nose, lip };
  }, []);
  useEffect(() => () => Object.values(assets).forEach(g => g.dispose()), [assets]);
  return <group name="mascara-do-concierge">
    <mesh geometry={assets.plate} position={[0, 0, 2.97]}>
      <meshStandardMaterial color="#e9ddbd" roughness={.37} metalness={.12} />
    </mesh>
    <mesh geometry={assets.nose}>
      <meshStandardMaterial color="#e9ddbd" roughness={.4} metalness={.1} side={THREE.DoubleSide} />
    </mesh>
    <mesh geometry={assets.lip}>
      <meshStandardMaterial color="#a97738" roughness={.3} metalness={.75} />
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
