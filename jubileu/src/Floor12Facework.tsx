import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bocaNoInstante, f12 } from './f12Boss';
import { F12_PALETTE as P } from './f12Presentation';

/** The concierge's porcelain mask is held together by the hotel's machinery. */
export function Floor12Facework() {
  const gears = useRef<THREE.Group>(null);
  const M = useMemo(() => ({
    ivory: new THREE.MeshStandardMaterial({ color: '#e1d5b5', roughness: .66, metalness: .15 }),
    brass: new THREE.MeshStandardMaterial({ color: P.brass, roughness: .32, metalness: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: '#152e38', roughness: .58, metalness: .48 }),
    light: new THREE.MeshBasicMaterial({ color: P.friendly, toneMapped: false }),
  }), []);
  const cheek = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(2.25, .50); s.lineTo(3.00, .14); s.lineTo(3.12, -.90);
    s.lineTo(2.70, -2.65); s.lineTo(2.45, -2.40); s.lineTo(2.55, -.46);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: .25, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .10, bevelThickness: .08 });
  }, []);
  useEffect(() => () => { cheek.dispose(); Object.values(M).forEach(m => m.dispose()); }, [cheek, M]);
  useFrame((_, dt) => {
    const b = bocaNoInstante(f12.bocaT);
    if (gears.current) gears.current.children.forEach((gear, i) => {
      gear.rotation.z += Math.min(dt, .05) * (i ? -1 : 1) * (.15 + b.abertura * 1.8);
    });
    M.light.color.set(b.estado === 'abrindo' ? P.danger : f12.passouDaVirada ? P.ritual : P.friendly);
  });
  return <group name="mascara-do-concierge">
    {[-1, 1].map(side => <group key={side}>
      <mesh geometry={cheek} material={M.ivory} position={[0, 0, 2.30]} scale={[side, 1, 1]} />
      <mesh material={M.dark} position={[side * 1.55, 1.15, 2.86]} scale={[1.12, .89, 1]}>
        <torusGeometry args={[.79, .16, 8, 24]} />
      </mesh>
      <mesh material={M.brass} position={[side * 1.55, 1.15, 2.94]} scale={[1.12, .89, 1]}>
        <torusGeometry args={[.91, .045, 6, 28]} />
      </mesh>
      {[0, 1, 2].map(i => <mesh key={i} material={M.brass} position={[side * (2.75 - i * .055), -.52 - i * .58, 2.68]}>
        <sphereGeometry args={[.09, 8, 6]} />
      </mesh>)}
      <mesh material={M.dark} position={[side * 3.03, -.5, .76]}>
        <boxGeometry args={[.38, 2.4, .72]} />
      </mesh>
      {[0, 1, 2, 3].map(i => <mesh key={i} material={M.brass} position={[side * 3.08, .25 - i * .42, 1.15]}>
        <boxGeometry args={[.46, .11, .09]} />
      </mesh>)}
      <mesh material={M.brass} position={[side * .72, -.30, 3.52]} rotation={[0, 0, side * .12]}>
        <torusGeometry args={[.64, .13, 8, 20, Math.PI * .86]} />
      </mesh>
    </group>)}
    <mesh material={M.brass} position={[0, -.62, 3.50]}>
      <boxGeometry args={[4.92, .18, .30]} />
    </mesh>
    <group ref={gears}>
      {[-1, 1].map(side => <group key={side} position={[side * 3.12, -.6, 1.58]}>
        <mesh material={M.dark} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.48, .48, .18, 16]} /></mesh>
        <mesh material={M.brass}><torusGeometry args={[.43, .09, 6, 20]} /></mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = i * Math.PI / 5;
          return <mesh key={i} material={M.brass} position={[Math.cos(a) * .49, Math.sin(a) * .49, 0]} rotation={[0, 0, a]}>
            <boxGeometry args={[.17, .12, .14]} />
          </mesh>;
        })}
        <mesh material={M.light}><sphereGeometry args={[.16, 10, 8]} /></mesh>
      </group>)}
    </group>
  </group>;
}
