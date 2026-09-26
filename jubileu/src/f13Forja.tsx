/** A forja do Brokk: fornalha, coifa, bigorna e telheiro. Separada do Floor13Mundo para o co-builder. */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ILHAS } from './f13Mundo';
import { pbr } from './f13Texturas';
import { P13 } from './Floor13Mundo';
import { FagulhasDaForja } from './f13Fagulhas';
import { BrasasDaFornalha } from './f13Brasas';

/** A forja: bigorna, fogo e um telheiro. */
export const Forja: React.FC = () => {
    const ilha = ILHAS.find((i) => i.id === 'forja')!;
    const fogo = useRef<THREE.PointLight>(null);
    useFrame(({ clock }) => { if (fogo.current) fogo.current.intensity = 6 + Math.sin(clock.elapsedTime * 13) * 1.5 + Math.sin(clock.elapsedTime * 7) * 1; });
    const ferro = <meshStandardMaterial color="#2e2e33" metalness={.8} roughness={.45} />;
    return <group position={[ilha.x, ilha.y, ilha.z - 1.5]}>
        {/* a fornalha: pedra de cantaria, boca em arco e a coifa afunilando até a chaminé */}
        <mesh position={[0, .5, 0]} castShadow><boxGeometry args={[1.6, 1, 1.2]} /><meshStandardMaterial color="#a89c8c" {...pbr('rocha', 1.2, .8)} /></mesh>
        <BrasasDaFornalha />
        <mesh position={[0, 1.6, -.2]} castShadow><cylinderGeometry args={[.28, .75, 1, 4, 1]} /><meshStandardMaterial color="#6a5f55" {...pbr('rocha', 2.4, 1.6)} flatShading /></mesh>
        <mesh position={[0, 3.2, -.2]} castShadow><boxGeometry args={[.38, 2.5, .38]} /><meshStandardMaterial color="#b3a898" {...pbr('rocha', .5, .8)} /></mesh>
        <pointLight ref={fogo} position={[0, 1.5, .5]} color="#ff8a3a" distance={9} intensity={6} />
        {/* a bigorna: corpo, cintura, mesa e o chifre, num cepo de tronco */}
        <group position={[1.7, 0, .9]} rotation={[0, -.4, 0]}>
            <mesh position={[0, .3, 0]} castShadow><cylinderGeometry args={[.26, .3, .6, 12]} /><meshStandardMaterial color="#6b4a2e" {...pbr('carvalho', .4, .4)} /></mesh>
            <mesh position={[0, .68, 0]} castShadow><boxGeometry args={[.22, .16, .18]} />{ferro}</mesh>
            <mesh position={[0, .81, 0]} castShadow><boxGeometry args={[.46, .1, .18]} />{ferro}</mesh>
            <mesh position={[.32, .82, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow><coneGeometry args={[.07, .2, 10]} />{ferro}</mesh>
            {/* cada martelada solta uma rajada de fagulhas da mesa (f13Fagulhas) */}
            <FagulhasDaForja posicao={[0, .87, 0]} />
        </group>
        {/* postes de tronco com mão-francesa e o telhado de duas águas em turfa */}
        {[[-1.4, -1], [1.4, -1], [-1.4, 1.6], [1.4, 1.6]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x, 0, z]}>
                <mesh position={[0, 1.35, 0]} castShadow><cylinderGeometry args={[.1, .13, 2.7, 8]} /><meshStandardMaterial color="#5a3d26" {...pbr('carvalho', .3, 1.5)} /></mesh>
                <mesh position={[-Math.sign(x) * .22, 2.45, 0]} rotation={[0, 0, Math.sign(x) * .8]}><boxGeometry args={[.07, .6, .07]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            </group>
        ))}
        {[-1, 1.6].map((z) => <mesh key={z} position={[0, 2.72, z]}><boxGeometry args={[3.1, .14, .16]} /><meshStandardMaterial color={P13.madeiraEsc} {...pbr('carvalho', .5, .3)} /></mesh>)}
        <mesh position={[0, 3.92, .3]}><boxGeometry args={[.16, .16, 3.8]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        {[-1, 1].map((l) => (
            <group key={l}>
                <mesh position={[l * .88, 3.12, .3]} rotation={[0, 0, -l * .78]} castShadow>
                    <boxGeometry args={[2.35, .14, 3.7]} /><meshStandardMaterial color={P13.turfa} {...pbr('grama', 2, .35)} />
                </mesh>
                {/* o forro de tábuas por baixo da turfa: de dentro da forja se vê madeira, não grama chapada */}
                <mesh position={[l * .88 - l * Math.sin(.78) * .08, 3.12 - Math.cos(.78) * .08, .3]} rotation={[0, 0, -l * .78]}>
                    <boxGeometry args={[2.3, .02, 3.65]} /><meshStandardMaterial color="#b08a62" {...pbr('tabua', 1.5, 2)} />
                </mesh>
                {/* caibros por baixo: de dentro da forja se vê a estrutura, não uma tampa */}
                {[-1.2, -.3, .6, 1.5].map((z) => <mesh key={z} position={[l * .82, 3.02, z]} rotation={[0, 0, -l * .78]}><boxGeometry args={[2.25, .09, .09]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
            </group>
        ))}
    </group>;
};
