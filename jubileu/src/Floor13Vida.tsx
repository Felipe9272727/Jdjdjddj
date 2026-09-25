/**
 * Floor13Vida.tsx — o que faz Vindhjem parecer habitada: crianças correndo
 * umas atrás das outras pela praça e cachorros soltos (um trota com elas,
 * outro cochila perto da forja, um terceiro fuça o pouso).
 *
 * Os gatos são a Raposa do mesmo pacote, remodelada (tools/blender/f13_bichos.py).
 * Os cachorros são o Husky e o Shiba do pacote "Ultimate Animated Animals"
 * da Quaternius (CC0), suavizados no Blender (tools/blender/f13_bichos.py →
 * subdivisão, sombreamento liso) e com os clipes originais de andar,
 * galopar, parar e comer.
 */
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { Viking } from './Floor13Povo';
import type { FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { chaoEm } from './f13Mundo';
import husky from './assets/f13/povo/cao_husky.glb';
import shiba from './assets/f13/povo/cao_shiba.glb';
import gato from './assets/f13/povo/gato.glb';

const livre = (): React.MutableRefObject<EstadoVisualNpc> => ({ current: { olharPara: null, falando: false, possessao: 0, caido: false } });
const crianca = (tunica: string) => ({ id: 'eira', nome: '', oficio: 'criança', tunica, barba: null, primeira: [], depois: [] } as unknown as FichaNpc);

/**
 * Pelagem fina: fios claros e escuros num canvas cinza-claro que multiplica a
 * cor de cada material (a cor vem do GLB) e serve de relevo. Sem ela o bicho
 * era plástico liso.
 */
let texPelo: THREE.CanvasTexture | null = null;
function texturaDePelo(): THREE.CanvasTexture {
    if (texPelo) return texPelo;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 128, 128);
    let k = 7; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    for (let i = 0; i < 2600; i++) {
        const x = r() * 128, y = r() * 128, l = 2 + r() * 5, a = .5 + (r() - .5) * .6, v = r() > .5 ? 255 : 120;
        g.strokeStyle = `rgba(${v},${v},${v},${.12 + r() * .2})`; g.lineWidth = .7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    texPelo = new THREE.CanvasTexture(c);
    texPelo.wrapS = texPelo.wrapT = THREE.RepeatWrapping; texPelo.repeat.set(5, 5); texPelo.colorSpace = THREE.SRGBColorSpace;
    return texPelo;
}

type Parado = 'Idle' | 'Eating' | 'Idle_2_HeadLow';
/** Pelagens de gato sobre o mesmo modelo: cor do corpo e da barriga. */
export const PELAGENS: Record<string, [string, string] | undefined> = {
    laranja: undefined, cinza: ['#5f5b57', '#d9d3c8'], preto: ['#1d1b1b', '#e9e5dc'],
};

/** Um bicho: anda em círculo (trote ou galope), ou fica parado (comendo, cochilando). */
const Bicho: React.FC<{ url: string; x: number; z: number; raio?: number; vel?: number; fase?: number; parado?: Parado; pelagem?: string; y?: number }> = ({ url, x, z, raio = 0, vel = .5, fase = 0, parado, pelagem, y }) => {
    const { scene, animations } = useGLTF(url);
    const modelo = useMemo(() => {
        const m = clonarComEsqueleto(scene);
        const p = pelagem ? PELAGENS[pelagem] : undefined;
        m.traverse((o) => {
            const me = o as THREE.Mesh; if (!me.isMesh) return;
            me.castShadow = true; me.receiveShadow = true;
            const mat = (me.material as THREE.MeshStandardMaterial).clone(); me.material = mat;
            if (/eye/i.test(mat.name)) return;
            if (p && mat.name === 'Main') mat.color.set(p[0]);
            if (p && mat.name === 'Main_Light') mat.color.set(p[1]);
            mat.map = texturaDePelo(); mat.bumpMap = texturaDePelo(); mat.bumpScale = 1.2; mat.roughness = .9;
        });
        return m;
    }, [scene, pelagem]);
    const g = useRef<THREE.Group>(null);
    const { actions } = useAnimations(animations, g);
    useEffect(() => {
        // os clipes do GLB chamam-se Walk, Gallop, Idle… (o código antigo
        // pedia "Walk_AnimalArmature", que não existe: ninguém se mexia)
        const nome = parado ?? (vel > 1.6 ? 'Gallop' : 'Walk');
        const a = actions[nome]; if (!a) return;
        a.reset().setEffectiveTimeScale(parado ? 1 : vel > 1.6 ? vel / 3.4 : vel / .9).play();
        a.time = fase * 1.7 % Math.max(.01, a.getClip().duration);
        return () => { a.stop(); };
    }, [actions, parado, vel, fase]);
    useFrame(({ clock }) => {
        const o = g.current; if (!o) return;
        const a = fase + clock.elapsedTime * vel / Math.max(raio, .1);
        const px = raio ? x + Math.cos(a) * raio : x, pz = raio ? z + Math.sin(a) * raio : z;
        o.position.set(px, y ?? chaoEm(px, pz) ?? 0, pz);
        // de frente para onde anda (tangente do círculo)
        o.rotation.y = raio ? -a : fase;
    });
    return <group ref={g}><primitive object={modelo} /></group>;
};

export const Floor13Vida: React.FC = () => {
    const estados = useMemo(() => [livre(), livre(), livre()], []);
    return <Suspense fallback={null}>
        {/* pega-pega: duas crianças no mesmo círculo, meia volta atrás uma da outra —
            longe da Sigrun, do Halvard e da pedra rúnica (antes a roda passava por dentro da Sigrun),
            e fora da linha do poço (de quem chega pela praça, a menina de vermelho
            parecia em pé na borda dele) */}
        <Viking ficha={crianca('#b0452a')} x={-3.2} y={0} z={5} ronda={1.6} rondaVel={1.3} estado={estados[0]} />
        <Viking ficha={crianca('#2f5d62')} x={-3.2} y={0} z={5} ronda={1.6} rondaVel={1.3} rondaFase={2.2} estado={estados[1]} />
        <Viking ficha={crianca('#6f9a4a')} x={5.5} y={0} z={6.5} ronda={1.8} rondaVel={1.1} rondaFase={.7} estado={estados[2]} />
        <Bicho url={husky} x={-3.2} z={5} raio={1.6} vel={3.4} fase={3.6} />
        <Bicho url={shiba} x={-21} z={9} parado="Idle_2_HeadLow" fase={2.4} />
        {/* o shiba da ilha do pouso brinca de buscar o graveto: ver f13Busca */}
        <Bicho url={husky} x={2.6} z={-20.2} parado="Eating" fase={-.8} />
        {/* gatos: a raposa da Quaternius remodelada (tools/blender/f13_bichos.py) */}
        <Bicho url={gato} x={-3.5} z={6.5} raio={1} vel={.45} fase={1} pelagem="cinza" />
        {/* em cima do balcão da barraca do meio, atrás das frutas */}
        <Bicho url={gato} x={-3.33} z={13.71} y={.9} parado="Idle" fase={1.67} pelagem="preto" />
        {/* enrolado na borda do poço */}
        <Bicho url={gato} x={1.1} z={8} y={.63} parado="Idle_2_HeadLow" fase={0} />
    </Suspense>;
};
useGLTF.preload(husky); useGLTF.preload(shiba); useGLTF.preload(gato);
