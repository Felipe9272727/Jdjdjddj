import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
  // Quinas chanfradas: a caixa pura tem aresta de faca e não pega luz; o
  // chanfro acende um fio de brilho em cada quina, e o prédio deixa de ser bloco.
  const geo = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, .045), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <instancedMesh ref={ref} args={[geo, undefined, pieces.length]}>
    {glow ? <meshBasicMaterial color={color} toneMapped={false} /> :
      <meshStandardMaterial color={tints ? '#ffffff' : color} roughness={.83} metalness={.18} />}
  </instancedMesh>;
}

/** A real skyline behind the fight, with silhouettes at several depths.
 * Batched windows and masonry keep the hotel readable without hundreds of draws. */
const JANELAS = ['#b89c62', '#d2a650', '#e0b86a', '#7f98a6', '#2e2a26', '#2e2a26', '#c58150'];

export function Floor12Skyline({ bossZ }: { bossZ: number }) {
  // ── A CIDADE EM BAIRROS ─────────────────────────────────────────────────
  // Eram sete torres soltas, sorteadas: lia como cenário de papelão. Agora a
  // cidade tem PLANTA — dois condomínios em ilhas flutuantes (jardim, poste,
  // passarela entre prédios) e o GRANDE HOTEL ao fundo, com as avenidas do
  // trânsito passando entre eles. Cada prédio ganhou coroa escalonada, sacada
  // por andar, grade de janelas, caixa d'água, antena e luz de aviação.
  const architecture = useMemo(() => {
    const walls: Piece[] = [], brass: Piece[] = [], windows: Piece[] = [];
    const stone: Piece[] = [], green: Piece[] = [], lights: Piece[] = [], signs: Piece[] = [], sunlit: Piece[] = [];
    const bottom = -27;
    let seed = 7;
    const rnd = () => { const v = Math.sin(seed++ * 91.345) * 43758.5453; return v - Math.floor(v); };

    const predio = (x: number, z: number, height: number, width: number, depth: number, index: number, neon = false) => {
      const top = bottom + height;
      walls.push({ x, y: bottom + height / 2, z, sx: width, sy: height, sz: depth });
      // coroa escalonada com friso de latão
      for (let tier = 0; tier < 3; tier++) {
        const w = width * (1 - tier * .2), d = depth * (1 - tier * .2);
        sunlit.push({ x, y: top + tier * 1.35, z, sx: w, sy: 1.4, sz: d });   // a coroa pega o sol do poente
        brass.push({ x, y: top + tier * 1.35 + .7, z: z + .05, sx: w + .2, sy: .13, sz: d + .15 });
      }
      // pilastras de latão nas quinas da fachada
      for (const side of [-1, 1]) brass.push({ x: x + side * (width / 2 - .25), y: bottom + height / 2,
        z: z + depth / 2 + .07, sx: .16, sy: height, sz: .15 });
      // andares: sacada contínua + grade de 4 janelas
      const floors = Math.floor((height - 3) / 2.7);
      for (let row = 0; row < floors; row++) {
        const y = bottom + 2.1 + row * 2.7;
        if (y < -9) continue;                    // abaixo do mar de nuvens: ninguém vê
        stone.push({ x, y: y - .85, z: z + depth / 2 + .18, sx: width + .3, sy: .16, sz: .45 });
        for (let col = 0; col < 4; col++) {
          if ((row * 5 + col * 3 + index) % 9 === 0) continue;
          windows.push({ x: x + (col - 1.5) * width * .21, y, z: z + depth / 2 + .04,
            sx: width * .12, sy: 1.25, sz: .07 });
        }
      }
      // telhado: caixa d'água, antena, luz de aviação
      const roof = top + 3 * 1.35;
      walls.push({ x: x - width * .2, y: roof + .7, z, sx: 1.4, sy: 1.4, sz: 1.4 });
      brass.push({ x: x - width * .2, y: roof + 1.5, z, sx: 1.6, sy: .12, sz: 1.6 });
      brass.push({ x: x + width * .22, y: roof + 3, z, sx: .14, sy: 6, sz: .14 });
      lights.push({ x: x + width * .22, y: roof + 6.1, z, sx: .45, sy: .45, sz: .45 });
      if (neon) signs.push({ x, y: top - 3.5, z: z + depth / 2 + .3, sx: width * .7, sy: 1.6, sz: .12 });
    };

    // um condomínio: ilha flutuante, prédios em fileira, passarelas, jardim, postes
    const condominio = (cx: number, cz: number, alturas: number[], largura: number, neonEm: number) => {
      const n = alturas.length, vao = largura + 3.2, span = (n - 1) * vao;
      const baseY = -8.6;                         // a laje encosta no mar de nuvens
      stone.push({ x: cx, y: baseY, z: cz, sx: span + largura + 6, sy: 1.1, sz: 16 });
      brass.push({ x: cx, y: baseY + .6, z: cz + 8.05, sx: span + largura + 6.2, sy: .18, sz: .12 });
      walls.push({ x: cx, y: baseY - 3.2, z: cz, sx: (span + largura) * .7, sy: 5.4, sz: 10 });   // raiz da ilha
      alturas.forEach((h, k) => {
        const x = cx - span / 2 + k * vao;
        predio(x, cz - 2, h, largura, 7, k * 3 + Math.round(cx), k === neonEm);
        if (k < n - 1) {
          // passarela de vidro entre este prédio e o próximo
          const yb = bottom + Math.min(h, alturas[k + 1]) * .62;
          stone.push({ x: x + vao / 2, y: yb, z: cz - 2, sx: vao - largura + .4, sy: .9, sz: 2 });
          windows.push({ x: x + vao / 2, y: yb, z: cz - .98, sx: vao - largura - .4, sy: .45, sz: .06 });
        }
      });
      // jardim e postes na frente da laje
      for (let k = 0; k < n * 2; k++) {
        const x = cx - span / 2 - largura / 2 + (k + .5) * (span + largura) / (n * 2);
        green.push({ x, y: baseY + .9, z: cz + 5.5, sx: 1.6 + rnd(), sy: .9 + rnd() * .6, sz: 1.6 });
        if (k % 2) {
          brass.push({ x: x + 1.2, y: baseY + 1.6, z: cz + 6.8, sx: .1, sy: 2.4, sz: .1 });
          lights.push({ x: x + 1.2, y: baseY + 2.9, z: cz + 6.8, sx: .32, sy: .32, sz: .32 });
        }
      }
    };

    condominio(-44, bossZ - 76, [36, 44, 39, 31], 7, 1);
    condominio(44, bossZ - 76, [33, 40, 46, 37], 7, 2);
    // O GRANDE HOTEL, ao fundo, no eixo: torre central + duas alas
    predio(0, bossZ - 104, 56, 13, 9, 11, true);
    predio(-15, bossZ - 102, 40, 9, 8, 12);
    predio(15, bossZ - 102, 40, 9, 8, 13);
    stone.push({ x: 0, y: -8.6, z: bossZ - 101, sx: 46, sy: 1.1, sz: 16 });
    brass.push({ x: 0, y: -8, z: bossZ - 93, sx: 46.2, sy: .18, sz: .12 });
    // a cidade de trás: silhuetas sem detalhe, só para dar profundidade
    for (let k = 0; k < 9; k++) {
      const x = -84 + k * 21 + (rnd() - .5) * 6, h = 30 + rnd() * 26;
      walls.push({ x, y: bottom + h / 2, z: bossZ - 140 - rnd() * 20, sx: 8 + rnd() * 5, sy: h, sz: 8 });
    }
    return { walls, brass, windows, stone, green, lights, signs, sunlit };
  }, [bossZ]);
  // 96 bancos (eram 64): as laterais viram paredes de nuvem, não fileiras.
  const clouds = useMemo(() => Array.from({ length: 96 }, (_, i) => {
    const seed = Math.sin(i * 127.1 + 31.7) * 43758.5453;
    const r = seed - Math.floor(seed), side = i % 2 ? -1 : 1;
    const layer = Math.floor(i / 16), cluster = Math.floor(i / 2) % 8;   // 6 camadas de profundidade
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
  // ── NUVEM É VAPOR, NÃO MASSINHA ───────────────────────────────────────
  // Luz "envolvente": o lado escuro não termina num corte seco; parte da cor
  // própria da nuvem volta como brilho (a luz que atravessa o vapor). É o
  // truque barato de subsurface dos jogos estilizados.
  const nuvemMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.32;');
    };
    m.customProgramCacheKey = () => 'f12-nuvem-vapor';
    return m;
  }, []);
  useEffect(() => () => nuvemMat.dispose(), [nuvemMat]);
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
    <ArchitectureInstances pieces={architecture.stone} color="#46545b" />
    {/* Coroas alaranjadas: de pé, as torres atrás da cabeça eram lajes cinza; o sol
        batendo no topo é o que diz "poente" e separa prédio de névoa. */}
    <ArchitectureInstances pieces={architecture.sunlit} color="#b8764c" />
    <ArchitectureInstances pieces={architecture.green} color="#3e5a3c" />
    <ArchitectureInstances pieces={architecture.lights} color="#ff5040" glow />
    <LetreirosNeon pieces={architecture.signs} />
    {/* O chão inteiro, e não só as laterais: ver Floor12MarDeNuvens. */}
    <Floor12MarDeNuvens bossZ={bossZ} />
    <instancedMesh ref={cloudRef} args={[cloudGeometry, nuvemMat, clouds.length]}>
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

/**
 * OS LETREIROS: painéis de néon nas fachadas, cada um numa cor, piscando fora
 * de fase como letreiro de verdade (uma letra queimada de vez em quando). Um
 * material por cor para piscar barato; são poucos.
 */
function LetreirosNeon({ pieces }: { pieces: Piece[] }) {
  const cores = ['#ff4fa3', '#4fe3ff', '#ffb347'];
  const mats = useMemo(() => cores.map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false })), []);
  const base = useMemo(() => mats.map(m => m.color.clone()), [mats]);
  useEffect(() => () => mats.forEach(m => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.forEach((m, i) => {
      // pulsa devagar e, de vez em quando, "falha" por um instante
      const falha = Math.sin(t * 13 + i * 5) > .96 ? .25 : 1;
      m.color.copy(base[i]).multiplyScalar((.75 + .25 * Math.sin(t * 2 + i * 2.1)) * falha);
    });
  });
  return <group>{pieces.map((p, i) => <group key={i} position={[p.x, p.y, p.z]}>
    <mesh material={mats[i % mats.length]} scale={[p.sx, p.sy, p.sz]}><boxGeometry args={[1, 1, 1]} /></mesh>
    <mesh position={[0, 0, -.08]} scale={[p.sx + .4, p.sy + .4, .1]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#1b1f24" /></mesh>
  </group>)}</group>;
}
