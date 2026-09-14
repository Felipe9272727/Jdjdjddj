import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f12, type Nave } from './f12Boss';
import { type FlightWeapon, FLIGHT_WEAPON } from './f12FlightWeapon';

export function Floor12FlightFeedback({ nave, arma }: {
  nave: MutableRefObject<Nave>;
  arma: MutableRefObject<FlightWeapon>;
}) {
  const root = useRef<THREE.Group>(null);
  const ticks = useRef<THREE.Group>(null);
  const flashes = useRef<THREE.Group>(null);
  const M = useMemo(() => ({
    charge: new THREE.MeshBasicMaterial({ color: '#71fff0', transparent: true, opacity: .85, depthWrite: false, toneMapped: false }),
    shot: new THREE.MeshBasicMaterial({ color: '#f2ffef', toneMapped: false }),
  }), []);
  useEffect(() => () => Object.values(M).forEach(m => m.dispose()), [M]);
  useFrame(({ clock }) => {
    const n = nave.current, gun = arma.current;
    if (!root.current) return;
    root.current.visible = f12.fase === 'luta';
    root.current.position.set(n.x, n.y, 0);
    if (ticks.current) {
      ticks.current.visible = gun.charge >= .25 || gun.remaining > 0;
      const count = Math.floor(gun.charge * FLIGHT_WEAPON.roundsPerSecond) + gun.remaining;
      ticks.current.children.forEach((tick, i) => { tick.visible = i < count; });
      ticks.current.rotation.z = Math.sin(clock.elapsedTime * 2) * .045;
    }
    if (flashes.current) {
      flashes.current.visible = gun.active && gun.flash > .05;
      flashes.current.children.forEach((flash, i) => {
        flash.scale.setScalar((.35 + gun.flash) * (i === Math.floor(clock.elapsedTime * 22) % 2 ? 1 : .4));
      });
    }
  });
  return <group ref={root}>
    <group ref={ticks} position={[0, -.42, 1.0]}>
      {Array.from({ length: 16 }, (_, i) => {
        const a = Math.PI * .15 + i * Math.PI * 1.7 / 15;
        return <mesh key={i} position={[Math.cos(a) * .75, Math.sin(a) * .75, 0]} rotation={[0, 0, a]} material={M.charge}>
          <boxGeometry args={[.16, .065, .035]} />
        </mesh>;
      })}
    </group>
    <group ref={flashes}>
      {[-1, 1].map(side => <mesh key={side} position={[side * 1.35, 0, -1.05]} material={M.shot}>
        <octahedronGeometry args={[.23, 0]} />
      </mesh>)}
    </group>
  </group>;
}
