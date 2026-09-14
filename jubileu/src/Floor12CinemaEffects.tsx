import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { F12_CINEMA, cinemaEase, victoryBeat } from './f12Cinema';

type Clock = { current: number };

/** Bounded, deterministic debris: no particle allocation in the frame loop. */
export function Floor12CinemaEffects({ active, clock, position }: {
  active: boolean; clock: Clock; position: [number, number, number];
}) {
  const root = useRef<THREE.Group>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const shards = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!root.current) return;
    root.current.visible = active;
    if (!active) return;
    const t = clock.current;
    const b = victoryBeat(t);
    const impact = Math.max(0, t - F12_CINEMA.rupture);
    const intensity = t < F12_CINEMA.rupture
      ? b.tremor * (.65 + .35 * Math.sin(t * 27)) : Math.max(0, 1 - impact / 1.2);
    core.current.scale.setScalar(.2 + intensity * 2.6);
    (core.current.material as THREE.MeshBasicMaterial).opacity = intensity * .9;
    ring.current.visible = impact > 0 && impact < 2.2;
    ring.current.scale.setScalar(1 + impact * 12);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - impact / 2.2) * .8;
    shards.current.visible = impact > 0;
    shards.current.children.forEach((piece, i) => {
      const angle = i * 2.399963;
      const speed = 2.8 + (i % 5) * .65;
      piece.position.set(Math.cos(angle) * impact * speed,
        Math.sin(angle) * impact * speed - impact * impact * .7,
        impact * ((i % 3) - 1) * 1.4);
      piece.rotation.x = impact * (1 + i % 3);
      piece.rotation.z = impact * (i % 2 ? -2 : 2);
      piece.scale.setScalar((.18 + (i % 4) * .08) * (1 - cinemaEase((impact - 3) / 3)));
    });
  });
  return <group ref={root} position={position} visible={false}>
    <mesh ref={core}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#fff4ca" transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh ref={ring}>
      <torusGeometry args={[1, .055, 6, 64]} />
      <meshBasicMaterial color="#ffe9a0" transparent depthWrite={false} toneMapped={false} />
    </mesh>
    <group ref={shards}>
      {Array.from({ length: 24 }, (_, i) => <mesh key={i}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={i % 3 === 0 ? '#ffc45f' : '#ded6bd'}
          emissive="#ff7c23" emissiveIntensity={i % 3 === 0 ? 1.8 : .15}
          roughness={.55} metalness={.35} />
      </mesh>)}
    </group>
  </group>;
}
