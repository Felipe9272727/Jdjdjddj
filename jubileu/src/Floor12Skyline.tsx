import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { F12_PALETTE as P } from './f12Presentation';
import { createCloudGeometry } from './f12CloudGeometry';
import { Floor12MarDeNuvens, Y_DO_PISO } from './Floor12MarDeNuvens';

type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number };

function ArchitectureInstances({ pieces, color, glow = false, tints }: {
  pieces: Piece[]; color: string; glow?: boolean;
  /** Uma cor por peça, sorteada da lista (a cor-base vira branco). */
  tints?: string[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    pieces.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix(); ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (tints) {
      const c = new THREE.Color();
      pieces.forEach((_, i) => {
        const r = Math.sin(i * 78.233) * 43758.5453;
        ref.current!.setColorAt(i, c.set(tints[Math.floor((r - Math.floor(r)) * tints.length)]));
      });
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
    ref.current.computeBoundingSphere();
  }, [pieces, tints]);
  return <instancedMesh ref={ref} args={[undefined, undefined, pieces.length]}>
    <boxGeometry args={[1, 1, 1]} />
    {glow ? <meshBasicMaterial color={color} toneMapped={false} /> :
      <meshStandardMaterial color={tints ? '#ffffff' : color} roughness={.83} metalness={.18} />}
  </instancedMesh>;
}

/** A real skyline behind the fight, with silhouettes at several depths.
 * Batched windows and masonry keep the hotel readable without hundreds of draws. */
const JANELAS = ['#8e7d55', '#a8894a', '#b39258', '#6d7f88', '#2e2a26', '#2e2a26', '#9a6a46'];

export function Floor12Skyline({ bossZ }: { bossZ: number }) {
  const architecture = useMemo(() => {
    const walls: Piece[] = [], brass: Piece[] = [], windows: Piece[] = [];
    const towers = [
      [-48, 30, -58, 7], [-30, 42, -72, 8], [-17, 24, -45, 6],
      [0, 49, -83, 12], [20, 35, -52, 7], [35, 44, -77, 9], [53, 26, -62, 7],
    ];
    towers.forEach(([x, height, zOffset, width], index) => {
      const z = bossZ + zOffset, bottom = -27, top = bottom + height;
      walls.push({ x, y: bottom + height / 2, z, sx: width, sy: height, sz: 7 });
      for (let tier = 0; tier < 3; tier++) {
        const w = width * (1 - tier * .21);
        walls.push({ x, y: top + tier * 1.35, z, sx: w, sy: 1.4, sz: 7 - tier * 1.2 });
        brass.push({ x, y: top + tier * 1.35 + .70, z: z + .05, sx: w + .2, sy: .13, sz: 7.15 - tier * 1.2 });
      }
      for (const side of [-1, 1]) brass.push({
        x: x + side * (width / 2 - .3), y: bottom + height / 2, z: z + 3.57,
        sx: .16, sy: height, sz: .15,
      });
      const rows = Math.floor((height - 3) / 2.7);
      for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
        if ((row * 7 + col * 3 + index) % 7 === 0) continue;
        windows.push({ x: x + (col - 1) * width * .245, y: bottom + 2.1 + row * 2.7,
          z: z + 3.54, sx: width * .11, sy: 1.30, sz: .07 });
      }
      // Suspended foundations and a narrow roof mast sell scale from below.
      walls.push({ x, y: bottom - 2.7, z, sx: width * .60, sy: 5.4, sz: 4 });
      brass.push({ x, y: top + 5.6, z, sx: .16, sy: 6, sz: .16 });
    });
    return { walls, brass, windows };
  }, [bossZ]);
  const clouds = useMemo(() => Array.from({ length: 64 }, (_, i) => {
    const seed = Math.sin(i * 127.1 + 31.7) * 43758.5453;
    const r = seed - Math.floor(seed), side = i % 2 ? -1 : 1;
    const layer = Math.floor(i / 16), cluster = Math.floor(i / 2) % 8;
    return { x: side * (22 + cluster * 6.5 + r * 3),
      // Os bancos laterais REPOUSAM sobre o mar de nuvens. Eles moravam em
      // y ~ -17, que fica ABAIXO do piso novo: sem isto viravam 64 bolhas
      // enterradas sob um plano opaco — invisíveis e ainda cobrando draw call.
      // A base de cada um (0,6 da altura abaixo do centro) afunda meia unidade
      // na superfície, e o resto sobe como parede de nuvem nas laterais.
      y: Y_DO_PISO - .5 + .6 * (3.3 + r * 3.2) - layer * .4,
      z: bossZ - 22 - layer * 32 - r * 14,
      sx: 5.5 + r * 4, sy: 3.3 + r * 3.2, sz: 5 + r * 4 };
  }), [bossZ]);
  const cloudRef = useRef<THREE.InstancedMesh>(null);
  const cloudGeometry = useMemo(createCloudGeometry, []);
  useEffect(() => () => cloudGeometry.dispose(), [cloudGeometry]);
  useLayoutEffect(() => {
    if (!cloudRef.current) return;
    const dummy = new THREE.Object3D();
    clouds.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z); dummy.scale.set(p.sx * .8, p.sy, p.sz);
      dummy.updateMatrix(); cloudRef.current!.setMatrixAt(i, dummy.matrix);
    });
    cloudRef.current.instanceMatrix.needsUpdate = true;
    cloudRef.current.computeBoundingSphere();
  }, [clouds]);
  return <group>
    <ArchitectureInstances pieces={architecture.walls} color={P.hullDark} />
    <ArchitectureInstances pieces={architecture.brass} color={P.brassDark} />
    {/* As janelas eram #f1c777 em material BÁSICO sem tone mapping, ou seja o
        pixel mais saturado e mais brilhante da tela inteira — e eram cenário.
        Elas disputavam a atenção com os projéteis e ganhavam. Continuam acesas,
        porque hotel à noite tem janela acesa, mas descem de protagonista a
        textura: o quente agora é reservado para o que machuca. */}
    {/* Janelas de cores diferentes — quarto aceso, abajur, TV, apagado. Todas
        iguais faziam das torres caixas de papelão; variadas, tem gente lá. */}
    <ArchitectureInstances pieces={architecture.windows} color="#8e7d55" tints={JANELAS} />
    {/* O chão inteiro, e não só as laterais: ver Floor12MarDeNuvens. */}
    <Floor12MarDeNuvens bossZ={bossZ} />
    <instancedMesh ref={cloudRef} args={[cloudGeometry, undefined, clouds.length]}>
      <meshStandardMaterial vertexColors roughness={1} />
    </instancedMesh>
  </group>;
}

export function Floor12Slipstream({ speed = 1 }: { speed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      dummy.position.set(side * (15 + (i % 5) * 2.7), -7 + (i % 7) * 3.4,
        16 - ((t * (18 + speed * 12) + i * 7.4) % 88));
      dummy.scale.set(.022, .022, 1.8 + speed * 1.4);
      dummy.updateMatrix(); ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 24]} frustumCulled={false}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial color="#a0dce2" transparent opacity={.24} depthWrite={false} />
  </instancedMesh>;
}
