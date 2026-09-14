import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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
  const halo = useRef<THREE.Group>(null);
  const M = useMemo(() => ({
    charge: new THREE.MeshBasicMaterial({ color: '#71fff0', transparent: true, opacity: .85, depthWrite: false, toneMapped: false }),
    aura: new THREE.MeshBasicMaterial({ color: '#71fff0', transparent: true, opacity: .35, depthWrite: false, toneMapped: false }),
    shot: new THREE.MeshBasicMaterial({ color: '#f2ffef', toneMapped: false }),
  }), []);
  useEffect(() => () => Object.values(M).forEach(m => m.dispose()), [M]);
  useFrame(({ clock }) => {
    const n = nave.current, gun = arma.current;
    if (!root.current) return;
    root.current.visible = f12.fase === 'luta';
    root.current.position.set(n.x, n.y, 0);
    const ratio = Math.min(1, gun.charge / FLIGHT_WEAPON.chargeLimit);
    const full = ratio > .999;
    M.charge.color.set(full ? '#ffd575' : '#71fff0');
    M.aura.color.copy(M.charge.color);
    M.aura.opacity = .13 + ratio * .3 + (full ? Math.sin(clock.elapsedTime * 9) * .12 : 0);
    if (halo.current) {
      halo.current.visible = ratio > .03;
      halo.current.rotation.z = clock.elapsedTime * (full ? 2.5 : .65);
      halo.current.scale.setScalar(.72 + ratio * .35 + (full ? Math.sin(clock.elapsedTime * 9) * .035 : 0));
    }
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
    <group ref={halo} position={[0, -.25, .85]}>
      <mesh material={M.aura}><torusGeometry args={[1.1, .07, 8, 40]} /></mesh>
      <mesh material={M.aura} rotation={[.5, .2, 0]}><torusGeometry args={[.95, .025, 6, 32]} /></mesh>
      {Array.from({length: 6}, (_, i) => {
        const a = i * Math.PI / 3;
        return <mesh key={i} position={[Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0]} material={M.charge}>
          <octahedronGeometry args={[.075, 0]} />
        </mesh>;
      })}
    </group>
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

/** A compact meter outside the playfield center; it never captures touches. */
export function Floor12ChargeMeter({ arma }: { arma: MutableRefObject<FlightWeapon> }) {
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPercent(Math.min(100, Math.round(arma.current.charge / FLIGHT_WEAPON.chargeLimit * 100))), 100);
    return () => window.clearInterval(id);
  }, [arma]);
  if (percent < 2) return null;
  const full = percent === 100;
  return <div data-testid="f12-charge" role="progressbar" aria-label="Carga da rajada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 126px)', left: 12, width: 116, padding: '7px 9px', borderRadius: 8, background: '#09202bd9', border: '1px solid #53787d', color: full ? '#ffdc89' : '#96fff0', font: 'bold 11px monospace', pointerEvents: 'none', zIndex: 3 }}>
    {full ? 'MÍSSIL PRONTO' : 'RAJADA · ' + percent + '%'}
    <div style={{ marginTop: 5, height: 4, background: '#29434b', borderRadius: 3 }}>
      <div style={{ width: percent + '%', height: '100%', background: full ? '#ffd575' : '#71fff0', borderRadius: 3 }} />
    </div>
  </div>;
}
