import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, useGLTF, useTexture } from '@react-three/drei';
import { TextureMaterial } from './Materials';
import { ASSETS, COLORS } from './constants';
import { CallPanel } from './BuildingBlocks';
import * as THREE from 'three';
import { cabineDecoModel, tetoSolTex, mostradorTex, pisoRosaTex, letreiroTex } from './assets/textureImports';

useGLTF.preload(cabineDecoModel);
for (const u of [tetoSolTex, mostradorTex, pisoRosaTex, letreiroTex]) useTexture.preload(u);
// Um material para todas as peças de cada tipo (e para toda montagem da cabine).
const LATAO = new THREE.MeshStandardMaterial({ color: '#d39a34', metalness: 0.35, roughness: 0.42 });
const VIDRO = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });

// ── A CABINE ART DÉCO ────────────────────────────────────────────────────────
// Era uma caixa de madeira com quatro bolachas de luz e um corrimão cinza de
// caixa. Agora é o elevador de hotel de 1930 que o jogo inteiro sugere:
//  · latão (corrimão dobrado, pilastras com capitel, moldura do mostrador,
//    luminária em degraus) modelado no Blender — tools/elevador/cabine.py;
//  · sol do teto, face do mostrador e rosa do piso desenhados no Manim —
//    tools/elevador/texturas.py (geometria exata, o que o Manim faz melhor);
//  · letreiro de lâmpadas em volta do mostrador animado no Remotion —
//    tools/elevador/remotion (atlas 2x2 de quatro quadros).
// O mostrador é o mesmo do lado de fora de um prédio velho: o ponteiro anda
// até o andar atual sempre que o nível muda.
/** Centro e raio do arco do mostrador (iguais aos de cabine.py). */
const MOSTRADOR = { y: 2.85, z: 2.86, r: 0.55, lampadas: 0.72 };
/** Ângulo do andar n no mostrador: 170° no 1, 10° no 13 (igual a texturas.py). */
export const anguloDoAndar = (n: number) => THREE.MathUtils.degToRad(170 - (THREE.MathUtils.clamp(n, 1, 13) - 1) * 160 / 12);

const Mostrador = ({ level, correndo }: { level: number; correndo: boolean }) => {
  const [face, atlas] = useTexture([mostradorTex, letreiroTex]);
  const faceTex = useMemo(() => {
    const t = face.clone(); t.colorSpace = THREE.SRGBColorSpace;
    // O semicírculo do PNG tem centro em (512, 793,6) e raio 499 px (1024²): o
    // CircleGeometry mapeia o quadrado em volta do centro, então só recorta.
    t.repeat.set(998 / 1024, 998 / 1024); t.offset.set(0.5 - 499 / 1024, (1 - 793.6 / 1024) - 499 / 1024);
    t.needsUpdate = true; return t;
  }, [face]);
  const atlasTex = useMemo(() => {
    const t = atlas.clone(); t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(0.5, 0.5);
    // sem mipmap: num atlas sem margem, o mip mistura lâmpadas do quadro vizinho
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true; return t;
  }, [atlas]);
  useEffect(() => () => { faceTex.dispose(); atlasTex.dispose(); }, [faceTex, atlasTex]);
  const ponteiro = useRef<THREE.Group>(null);
  const quadro = useRef(-1);
  // O ângulo inicial vai só na montagem: uma prop `rotation` seria reaplicada a
  // cada troca de andar e o ponteiro pularia em vez de andar.
  useLayoutEffect(() => { if (ponteiro.current) ponteiro.current.rotation.z = anguloDoAndar(level); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }, dtCru) => {
    const dt = Math.min(dtCru, 0.05); // um engasgo longo no celular não estoura a mola
    if (ponteiro.current) {
      const alvo = anguloDoAndar(level);
      // mola amortecida: chega com uma leve passada, como ponteiro de verdade
      const g = ponteiro.current as any;
      g.userData.v = ((g.userData.v ?? 0) + (alvo - g.rotation.z) * 40 * dt) * Math.exp(-7 * dt);
      g.rotation.z += g.userData.v * dt;
    }
    // parado: quadro 0 fixo; andando: o letreiro corre a 8 quadros por segundo
    const q = correndo ? Math.floor(clock.elapsedTime * 8) % 4 : 0;
    if (q !== quadro.current) { quadro.current = q; atlasTex.offset.set((q % 2) * 0.5, q < 2 ? 0.5 : 0); }
  });
  // O plano do letreiro: 512x288 px com o arco de raio 236 px centrado em (256, 272).
  const s = MOSTRADOR.lampadas / 236;
  return (
    <group position={[0, MOSTRADOR.y, MOSTRADOR.z]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0, 0.005]}>
        <circleGeometry args={[MOSTRADOR.r - 0.02, 40, 0, Math.PI]} />
        <meshBasicMaterial map={faceTex} toneMapped={false} />
      </mesh>
      <mesh position={[0, (144 - 272) * -s, 0.012]}>
        <planeGeometry args={[512 * s, 288 * s]} />
        <meshBasicMaterial map={atlasTex} transparent depthWrite={false} toneMapped={false} opacity={correndo ? 1 : 0.8} />
      </mesh>
      <group ref={ponteiro} position={[0, 0, 0.02]}>
        <mesh position={[0.21, 0, 0]}><boxGeometry args={[0.42, 0.022, 0.008]} /><meshStandardMaterial color="#141014" roughness={0.5} /></mesh>
        <mesh position={[0.43, 0, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.045, 0.045, 0.008]} /><meshStandardMaterial color="#141014" roughness={0.5} /></mesh>
      </group>
    </group>
  );
};

const CabineDeco = () => {
  const { scene } = useGLTF(cabineDecoModel);
  const modelo = useMemo(() => {
    const m = scene.clone(true);
    m.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      // troca os materiais do GLB pelos do jogo: latão quente e vidro que acende sem bloom
      // sem envMap, metal alto fica preto onde não reflete a lâmpada: o latão
      // daqui é meio metal, e o brilho vem da cor
      o.material = o.material.name === 'vidro' ? VIDRO : LATAO;
    });
    return m;
  }, [scene]);
  return <primitive object={modelo} />;
};

const PisoETeto = ({ EH }: { EH: number }) => {
  const [sol, rosa] = useTexture([tetoSolTex, pisoRosaTex]);
  useLayoutEffect(() => { for (const t of [sol, rosa]) if (t.colorSpace !== THREE.SRGBColorSpace) { t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; } }, [sol, rosa]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <circleGeometry args={[1.55, 48]} /><meshStandardMaterial map={rosa} roughness={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, EH - 0.01, 0]}>
        <circleGeometry args={[1.35, 48]} /><meshStandardMaterial map={sol} roughness={0.6} />
      </mesh>
    </>
  );
};

/** Bronze escovado: a porta de um elevador de 1930, não a chapa cinza de agora. */
const PORTA_BRONZE = '#9a7546';

export const ElevatorDoors = React.memo(({ closed }: { closed: boolean }) => {
  const leftRef = useRef<any>(null); const rightRef = useRef<any>(null);
  useFrame((s, dt) => {
      const spd = 5.0 * dt;
      if (leftRef.current) leftRef.current.position.x = THREE.MathUtils.lerp(leftRef.current.position.x, closed ? -0.76 : -2.3, spd);
      if (rightRef.current) rightRef.current.position.x = THREE.MathUtils.lerp(rightRef.current.position.x, closed ? 0.76 : 2.3, spd);
  });
  return (
      <group position={[0, 2.0, 2.92]}>
          <group ref={leftRef} position={[-2.3, 0, 0]}><mesh><boxGeometry args={[1.52, 4.0, 0.05]} /><meshStandardMaterial color={PORTA_BRONZE} metalness={0.4} roughness={0.38} /></mesh></group>
          <group ref={rightRef} position={[2.3, 0, 0]}><mesh><boxGeometry args={[1.52, 4.0, 0.05]} /><meshStandardMaterial color={PORTA_BRONZE} metalness={0.4} roughness={0.38} /></mesh></group>
      </group>
  );
});

export const ElevatorFacade = React.memo(({ z, height = 4.5, width = 10 }: { z: number; height?: number; width?: number }) => {
  const W = width; const H = height; const WH = 1.2;
  return (
      <group position={[0, 0, z]}>
          <group position={[-(W/4 + 1), H/2, 0]}>
              <mesh><boxGeometry args={[W/2 - 2, H, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[2, 1]} roughness={0.9} /></mesh>
              <mesh position={[-0.2, -H/2 + WH/2, 0.3]}><boxGeometry args={[W/2 - 2.5, WH, 0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[2, 1]} roughness={0.6} /></mesh>
          </group>
          <group position={[(W/4 + 1), H/2, 0]}>
              <mesh><boxGeometry args={[W/2 - 2, H, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[2, 1]} roughness={0.9} /></mesh>
              <mesh position={[0.2, -H/2 + WH/2, 0.3]}><boxGeometry args={[W/2 - 2.5, WH, 0.1]} /><TextureMaterial url={ASSETS.wallPanel} color="#ffffff" repeat={[2, 1]} roughness={0.6} /></mesh>
          </group>
          <mesh position={[0, H - (H-2.8)/2, 0]}><boxGeometry args={[4, H - 2.8, 0.5]} /><TextureMaterial url={ASSETS.wall} repeat={[1, 0.5]} roughness={0.9} /></mesh>
          <group position={[0, H - 0.4, 0.3]}>
              <mesh><boxGeometry args={[3.5, 0.6, 0.06]} /><meshStandardMaterial color="#1a1a1a" roughness={0.2} /></mesh>
              <Text position={[0, 0, 0.04]} fontSize={0.18} color="#FFD54F" anchorX="center" anchorY="middle" letterSpacing={0.12}>THE NORMAL ELEVATOR</Text>
              <pointLight position={[0, -0.3, 0.5]} intensity={1} distance={4} color="#FFD54F" decay={2} />
          </group>
          <CallPanel x={2.3} z={0.05} rot={0} />
      </group>
  );
});

export const ElevatorInterior = React.memo(({ timer, doorsClosed, level }: { timer: number | null; doorsClosed: boolean; level: number }) => {
  const EW = 6.5; const ED = 6.0; const EH = 4.0; const EZ = -13.0; const OW = 3.0;
  const panelText = timer !== null ? String(Math.ceil(timer)).padStart(2, '0') : "--";
  const panelColor = timer !== null ? "#FF0000" : "#00FF00";
  const fi = level === 1 ? 1.5 : 3.5;
  return (
      <group position={[0, 0, EZ]}>
          <pointLight position={[0, 3.5, 0]} intensity={fi} distance={15} color="#FFF3E0" decay={1} />
          <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}><planeGeometry args={[EW, ED]} /><meshStandardMaterial color={COLORS.elevFloor} roughness={0.3} metalness={0.05} /></mesh>
          {/* a decoração carrega sozinha: enquanto chega, a cabine continua de pé */}
          <Suspense fallback={null}>
              <PisoETeto EH={EH} />
              <CabineDeco />
              <Mostrador level={level} correndo={doorsClosed} />
          </Suspense>
          <group position={[0, EH, 0]}>
              <mesh rotation={[Math.PI/2, 0, 0]}><planeGeometry args={[EW, ED]} /><TextureMaterial url={ASSETS.wood} color="#5D4037" repeat={[3, 3]} roughness={0.8} /></mesh>
          </group>
          <group position={[0, EH/2, -ED/2+0.05]}>
              <mesh><boxGeometry args={[EW, EH, 0.1]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[0, -EH/2+0.3, 0.05]}><boxGeometry args={[EW, 0.6, 0.05]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[-EW/2+0.05, EH/2, 0]}>
              <mesh><boxGeometry args={[0.1, EH, ED]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[0.05, -EH/2+0.3, 0]}><boxGeometry args={[0.05, 0.6, ED]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[EW/2-0.05, EH/2, 0]}>
              <mesh><boxGeometry args={[0.1, EH, ED]} /><TextureMaterial url={ASSETS.wood} color={COLORS.wood} repeat={[2, 2]} rotation={Math.PI/2} roughness={0.8} /></mesh>
              <mesh position={[-0.05, -EH/2+0.3, 0]}><boxGeometry args={[0.05, 0.6, ED]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <group position={[1.8, 1.4, 2.7]} rotation={[0, Math.PI, 0]}>
              <mesh position={[0, 0, -0.1]}><boxGeometry args={[0.55, 1.15, 0.2]} /><meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.3} /></mesh>
              <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 1.1, 0.02]} /><meshStandardMaterial color="#37474F" metalness={0.4} roughness={0.35} /></mesh>
              <mesh position={[0, 0.5, 0.012]}><boxGeometry args={[0.48, 0.04, 0.005]} /><meshStandardMaterial color="#FFD54F" metalness={0.7} roughness={0.25} /></mesh>
              <group position={[0, 0.3, 0.02]}>
                  <mesh><planeGeometry args={[0.4, 0.18]} /><meshBasicMaterial color="#000000" /></mesh>
                  <Text position={[0, 0, 0.01]} fontSize={0.14} color={panelColor} anchorX="center" anchorY="middle" letterSpacing={0.1}>{panelText}</Text>
              </group>
              <group position={[0, -0.15, 0.015]}>
                  {[1,2,3,4].map((num,i) => {
                      const lit = num === 3;
                      return (
                          <group key={num} position={[((i%2)-0.5)*0.18, (1-Math.floor(i/2))*0.18, 0]}>
                              <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.05, 0.05, 0.02, 16]} /><meshStandardMaterial color={lit ? "#FFEB3B" : "#BDBDBD"} emissive={lit ? "#FFEB3B" : "#000000"} emissiveIntensity={lit ? 0.8 : 0} metalness={0.4} roughness={0.3} toneMapped={!lit} /></mesh>
                              <Text position={[0, 0, 0.013]} fontSize={0.045} color={lit ? "#1a1a1a" : "#424242"} anchorX="center" anchorY="middle">{num}</Text>
                          </group>
                      );
                  })}
              </group>
              <group position={[0, -0.45, 0.015]}>
                  <mesh position={[-0.1, 0, 0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.04, 0.04, 0.02, 12]} /><meshStandardMaterial color="#FF5252" emissive="#FF5252" emissiveIntensity={0.3} toneMapped={false} /></mesh>
                  <mesh position={[0.1, 0, 0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.04, 0.04, 0.02, 12]} /><meshStandardMaterial color="#81C784" /></mesh>
              </group>
          </group>
          <group position={[0, 0, ED/2]}>
              <mesh position={[-(EW+OW)/4, EH/2, 0]}><boxGeometry args={[(EW-OW)/2, EH, 0.2]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
              <mesh position={[(EW+OW)/4, EH/2, 0]}><boxGeometry args={[(EW-OW)/2, EH, 0.2]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
              <mesh position={[0, EH-(EH-2.6)/2, 0]}><boxGeometry args={[OW, EH-2.6, 0.2]} /><meshStandardMaterial color={COLORS.elevTrim} roughness={0.6} /></mesh>
          </group>
          <ElevatorDoors closed={doorsClosed} />
      </group>
  );
});
