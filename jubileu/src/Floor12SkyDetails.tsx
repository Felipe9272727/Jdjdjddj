import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Quiet hotel traffic far behind the combat plane, never used as an enemy cue. */
export function Floor12SkyDetails() {
  const ships = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ships.current?.children.forEach((ship, i) => {
      // quatro rotas: dois dirigíveis pairando perto e dois cruzando o céu devagar
      const cruza = i >= 2;
      ship.position.x = cruza
        ? ((clock.elapsedTime * (i === 2 ? 2.2 : -1.7) + i * 60) % 220 + 220) % 220 - 110
        : (i ? 31 : -33) + Math.sin(clock.elapsedTime * .035 + i * 2) * 8;
      ship.position.y = [8, 15, 27, 22][i] + Math.sin(clock.elapsedTime * .24 + i) * .6;
      ship.rotation.y = cruza && i === 3 ? Math.PI : 0;
      ship.rotation.z = Math.sin(clock.elapsedTime * .16 + i) * .025;
    });
  });
  return <group name="rotas-do-hotel">
    <Passaros />
    <group ref={ships}>
      {[0, 1, 2, 3].map(i => <group key={i} position={[i ? 31 : -33, 8, [-105, -128, -150, -170][i]]}>
        <mesh scale={[5.5, 1.45, 1.6]}><sphereGeometry args={[1, 20, 12]} /><meshLambertMaterial color="#b6b394" /></mesh>
        <mesh position={[0, -2.1, 0]}><boxGeometry args={[3.3, .8, 1.2]} /><meshLambertMaterial color="#233e47" /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <mesh position={[side * 1.2, -1.45, 0]}><boxGeometry args={[.12, 1.4, .12]} /><meshLambertMaterial color="#9f8352" /></mesh>
          <mesh position={[side * .85, -2.05, .63]}><boxGeometry args={[.7, .22, .035]} /><meshBasicMaterial color="#b2a477" /></mesh>
        </group>)}
        <mesh position={[-4.5, .35, 0]} rotation={[0, 0, -.3]}><boxGeometry args={[1.5, 2.4, .14]} /><meshLambertMaterial color="#536c70" /></mesh>
      </group>)}
    </group>
    {[-1, 1].map(side => <group key={side} position={[side * 25, -7, -114]} rotation={[0, side * .3, 0]}>
      <mesh><boxGeometry args={[24, .35, 1.2]} /><meshLambertMaterial color="#9e8b5b" /></mesh>
      {[-10, -6, -2, 2, 6, 10].map(x => <mesh key={x} position={[x, 1.2, 0]}>
        <boxGeometry args={[.2, 2.4, .2]} /><meshLambertMaterial color="#52666a" />
      </mesh>)}
      <mesh position={[0, 2.4, 0]}><boxGeometry args={[24, .15, .15]} /><meshLambertMaterial color="#9e8b5b" /></mesh>
    </group>)}
  </group>;
}

/**
 * UM BANDO DE PÁSSAROS: gaivotas do hotel, em V, cruzando longe e batendo asa.
 * Duas asas por pássaro num instancedMesh só; a batida é escala no Y do pivô.
 */
function Passaros() {
  const N = 14;
  const asa = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .9, .18, -.12, .9, .18, .12], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = ref.current; if (!m) return;
    const t = clock.elapsedTime;
    for (let b = 0; b < N; b++) {
      // formação em V que atravessa o céu e reaparece do outro lado
      const fila = Math.floor((b + 1) / 2), lado = b % 2 ? 1 : -1;
      const x = ((t * 3.2) % 180) - 90 - fila * 1.6;
      const y = 17 + fila * .45 + Math.sin(t * .7) * 1.2;
      const z = -118 + lado * fila * 1.3;
      const bate = Math.sin(t * 9 + b * .7);
      for (const s of [0, 1]) {
        tmp.position.set(x, y, z);
        tmp.rotation.set(0, s ? Math.PI : 0, bate * .55 * (s ? 1 : -1));
        tmp.scale.setScalar(1.3);
        tmp.updateMatrix();
        m.setMatrixAt(b * 2 + s, tmp.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[asa, undefined, N * 2]} frustumCulled={false}>
    <meshBasicMaterial color="#2a2530" side={THREE.DoubleSide} />
  </instancedMesh>;
}
