/**
 * Floor9Elevator.tsx — O ELEVADOR QUEBRADO do Andar 9 (O Viveiro).
 *
 * O cab enferrujado que trouxe o player, hoje tomado pela floresta: portas
 * emperradas meio-abertas, teto parcialmente desabado, vinhas subindo pelos
 * cantos e caindo na frente, musgo na base, e — no escuro do interior — uma
 * lâmpada quebrada ainda acesa (âmbar) e a botoeira morta piscando teal.
 *
 * Modelado à mão em Blender (bpy headless, no sandbox) e exportado como GLB
 * low-poly com vertex colors — NÃO é o <ElevatorInterior> genérico. Substitui
 * aquele SÓ no Andar 9. A colisão já é a caixa sólida em (0,-13) (constants.ts
 * `_WALLS_FLOOR9`, guardada por elevProbe.test.ts): o player vê o marco de
 * fora, não entra — o elevador está morto, você está preso no Viveiro.
 *
 * Orientação: modelado com a PORTA em +Y (Blender); o export yup manda a porta
 * pra -Z do glTF, então giramos 180° em Y pra ela encarar +Z (o lado por onde
 * o player chega, vindo do norte da clareira). Piso do modelo em y=0 (assenta
 * no chão). Escala 1 casa o footprint 6.5×6.0×4.0 do cab.
 */
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { elevadorQuebradoModel } from './assets/textureImports';

useGLTF.preload(elevadorQuebradoModel);

export const Floor9Elevator = React.memo(() => {
  const { scene } = useGLTF(elevadorQuebradoModel);
  const model = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false; // marco grande e fixo — nunca some de vista
      }
    });
    return s;
  }, [scene]);

  return (
    <group position={[0, 0, -13]} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
      {/* a lâmpada quebrada "vaza" luz quente pro interior e pela porta —
          a emissão do GLB por si só não ilumina os vizinhos sem bloom, então
          um pointLight âmbar fraco faz o brilho tocar as paredes e o musgo. */}
      <pointLight position={[0.4, 2.9, -0.4]} intensity={1.7} distance={8.5} color="#ffb060" decay={2} />
      {/* respingo teal fraco da botoeira morta */}
      <pointLight position={[2.2, 1.5, -2.6]} intensity={0.5} distance={3.2} color="#40e0d0" decay={2} />
    </group>
  );
});
