/** f14Vitrine.tsx — só no dev (`/floor14.html?vitrine`): a entidade num chão plano, com a luz e a névoa
 *  do andar, para julgar o modelo. `&braco=1` estende o braço, `&tenso=1` faz encarar, `&cam=perto|longe|lado`. */
import React, { useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { FiguraDaEntidade, visualPadrao } from './f14Entidade';

export default function Vitrine() {
    const q = new URLSearchParams(location.search);
    const vis = useRef({ ...visualPadrao(), braco: +(q.get('braco') ?? 0), tenso: +(q.get('tenso') ?? 0), alturaBraco: +(q.get('altura') ?? 0) });
    const cam = ({ perto: [0, 2.2, 4.2], longe: [0, 1.8, 14], lado: [4.5, 2.2, 1.5] } as Record<string, number[]>)[q.get('cam') ?? 'perto'] ?? [0, 2.2, 4.2];
    return <Canvas style={{ position: 'fixed', inset: 0 }} camera={{ position: cam as [number, number, number], fov: 50 }}
        onCreated={({ camera }) => camera.lookAt(0, 1.7, 0)} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={['#d9a07c']} />
        <fogExp2 attach="fog" args={['#d49a6c', .012]} />
        <hemisphereLight args={['#b8a3d0', '#8a5434', .6]} />
        <directionalLight position={[6, 4, -8]} intensity={3} color="#ffd2a2" />
        <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#b9784c" roughness={1} /></mesh>
        <FiguraDaEntidade vis={vis} escala={1.25} />
    </Canvas>;
}
