/**
 * Floor13Vida.tsx — o que faz Vindhjem parecer habitada: crianças correndo
 * umas atrás das outras pela praça e cachorros soltos (um trota com elas,
 * outro cochila perto da forja, um terceiro fuça o pouso).
 *
 * Os cachorros são o Husky e o Shiba do pacote "Ultimate Animated Animals"
 * da Quaternius (CC0), suavizados no Blender (tools: /tmp/som/cao2.py →
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

const livre = (): React.MutableRefObject<EstadoVisualNpc> => ({ current: { olharPara: null, falando: false, possessao: 0, caido: false } });
const crianca = (tunica: string) => ({ id: 'eira', nome: '', oficio: 'criança', tunica, barba: null, primeira: [], depois: [] } as unknown as FichaNpc);

/** Um cachorro: anda em círculo (trote ou galope), ou fica parado comendo. */
const Cao: React.FC<{ url: string; x: number; z: number; raio?: number; vel?: number; fase?: number; parado?: 'Idle' | 'Eating' | 'Idle_2_HeadLow' }> = ({ url, x, z, raio = 0, vel = .5, fase = 0, parado }) => {
    const { scene, animations } = useGLTF(url);
    const modelo = useMemo(() => clonarComEsqueleto(scene), [scene]);
    const g = useRef<THREE.Group>(null);
    const { actions } = useAnimations(animations, g);
    useEffect(() => {
        const nome = parado ? `${parado}_AnimalArmature` : vel > .7 ? 'Gallop_AnimalArmature' : 'Walk_AnimalArmature';
        const a = actions[nome]; a?.reset().play(); a?.setEffectiveTimeScale(parado ? 1 : vel > .7 ? 1 : 1.2);
        modelo.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    }, [actions, parado, vel, modelo]);
    useFrame(({ clock }) => {
        const o = g.current; if (!o) return;
        const a = fase + clock.elapsedTime * vel / Math.max(raio, .1);
        const px = raio ? x + Math.cos(a) * raio : x, pz = raio ? z + Math.sin(a) * raio : z;
        o.position.set(px, chaoEm(px, pz) ?? 0, pz);
        // de frente para onde anda (tangente do círculo)
        if (raio) o.rotation.y = -a;
    });
    return <group ref={g}><primitive object={modelo} /></group>;
};

export const Floor13Vida: React.FC = () => {
    const estados = useMemo(() => [livre(), livre(), livre()], []);
    return <Suspense fallback={null}>
        {/* pega-pega: três crianças no mesmo círculo, meia volta atrás uma da outra */}
        <Viking ficha={crianca('#b0452a')} x={-2.5} y={0} z={3} ronda={2.6} rondaVel={1.3} estado={estados[0]} />
        <Viking ficha={crianca('#2f5d62')} x={-2.5} y={0} z={3} ronda={2.6} rondaVel={1.3} rondaFase={2.2} estado={estados[1]} />
        <Viking ficha={crianca('#6f9a4a')} x={5.5} y={0} z={6.5} ronda={1.8} rondaVel={1.1} rondaFase={.7} estado={estados[2]} />
        <Cao url={husky} x={-2.5} z={3} raio={2.6} vel={3.4} fase={3.6} />
        <Cao url={shiba} x={-21} z={9} parado="Idle_2_HeadLow" />
        <Cao url={shiba} x={2.5} z={27} raio={2.2} vel={.6} />
        <Cao url={husky} x={16} z={-18} parado="Eating" />
    </Suspense>;
};
useGLTF.preload(husky); useGLTF.preload(shiba);
