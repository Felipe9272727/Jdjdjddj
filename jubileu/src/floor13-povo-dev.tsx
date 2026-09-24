/**
 * floor13-povo-dev.tsx — bancada do elenco de Vindhjem (`?f13povo`).
 *
 * Os nove moradores lado a lado, com a mesma luz do andar, para julgar
 * modelo, material e pose sem depender de achar cada um no mapa. `&pose=`
 * troca o estado (fala, possessao, caido, anda) e `&perto=<id>` faz o close
 * do rosto de um só. DEV-ONLY, como o `?f13`.
 */
import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO, ToneMapping, Bloom } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Viking } from './Floor13Povo';
import { NPCS, type FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { novoCeu, DIRECAO_DO_SOL } from './Floor13Mundo';

const HOSPEDE = { id: 'hospede', nome: 'Você', oficio: 'hóspede', tunica: '#3b6fb0', barba: null, primeira: [], depois: [] } as unknown as FichaNpc;
const busca = new URLSearchParams(window.location.search);
const POSE = busca.get('pose') ?? '';
const PERTO = busca.get('perto');
/** De que lado a câmera olha: +1 = de +Z (a frente no jogo), -1 = de -Z. */
/** `&meio=1`: plano médio (cintura e mãos) do `perto`. */
const MEIO = busca.has('meio');
const LADO = busca.get('lado') === 'tras' ? -1 : 1;

const Um: React.FC<{ ficha: FichaNpc; x: number }> = ({ ficha, x }) => {
    const estado = useRef<EstadoVisualNpc>({ olharPara: null, falando: POSE === 'fala', possessao: POSE === 'possessao' ? 1 : 0, caido: POSE === 'caido' });
    const controle = useRef({ x, y: 0, z: 0, ang: 0, andando: POSE === 'anda' ? 1 : 0, levantando: 0 });
    return <Viking ficha={ficha} x={x} y={0} z={0} estado={estado} controle={POSE === 'anda' ? controle : undefined} />;
};

const Ceu: React.FC = () => { const c = useMemo(() => novoCeu(), []); return <primitive object={c} />; };

const Camera: React.FC<{ alvoX: number }> = ({ alvoX }) => {
    useFrame(({ camera }) => {
        if (PERTO && MEIO) { camera.position.set(alvoX + .4, 1.35, 2.7 * LADO); camera.lookAt(alvoX, 1.1, 0); }
        else if (PERTO) { const d = POSE === 'caido'; camera.position.set(alvoX + .15, d ? 2.2 : 1.85, (d ? 1.4 : 1.25) * LADO); camera.lookAt(alvoX, d ? .1 : 1.78, d ? -1 : 0); }
        else { camera.position.set(0, 1.5, 11.5 * LADO); camera.lookAt(0, 1.05, 0); }
    });
    return null;
};

const Floor13PovoDev: React.FC = () => {
    const todos = useMemo(() => [...NPCS, HOSPEDE], []);
    const idx = PERTO ? Math.max(0, todos.findIndex((f) => f.id === PERTO)) : 0;
    return <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
        <Canvas shadows="soft" dpr={1} camera={{ fov: 40, near: .05, far: 900 }}
            gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
            <Ceu />
            <hemisphereLight args={['#bcd4f0', '#5a4a36', .6]} />
            <directionalLight position={DIRECAO_DO_SOL.clone().multiplyScalar(-40).setY(30).toArray()} intensity={4.2} color="#ffd6a0" castShadow />
            <directionalLight position={[6, 10, 20 * LADO]} intensity={2.2} color="#fff1dc" />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[30, 48]} /><meshStandardMaterial color="#5f7a3e" roughness={.95} /></mesh>
            <Suspense fallback={null}>
                {todos.map((f, i) => <Um key={f.id} ficha={f} x={(i - (todos.length - 1) / 2) * 1.3} />)}
            </Suspense>
            <Camera alvoX={(idx - (todos.length - 1) / 2) * 1.3} />
            <EffectComposer multisampling={0}>
                <N8AO aoRadius={1} intensity={2} halfRes />
                <Bloom mipmapBlur intensity={.4} luminanceThreshold={.9} />
                <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
        </Canvas>
    </div>;
};
export default Floor13PovoDev;
