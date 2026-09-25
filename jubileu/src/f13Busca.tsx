/**
 * f13Busca.tsx — brincar de buscar o graveto com o shiba da ilha do pouso.
 *
 * Rascunho do comportamento pelo co-builder (DeepSeek), adaptado aqui: os
 * clipes do GLB são Idle / Walk / Gallop, o graveto é um galho modelado, e o
 * estado fica num objeto de módulo (`busca`) que o Floor13 lê para o botão e
 * para a recompensa.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { chaoEm } from './f13Mundo';
import shiba from './assets/f13/povo/cao_shiba.glb';

export type EstadoBusca = 'solto' | 'no_ar' | 'correndo' | 'voltando';
/** Estado compartilhado: onde o cão e o graveto estão, e quantas vezes ele trouxe. */
export const busca = {
    estado: 'solto' as EstadoBusca,
    entregas: 0,
    graveto: new THREE.Vector3(-3.1, 0, 26.2),
    /** o Floor13 chama ao apertar "JOGAR O GRAVETO" */
    arremessar: null as null | ((origem: THREE.Vector3, direcao: THREE.Vector3, forca: number) => void),
};

const G = 9.8, VEL = 5.2, PEGA = .7, SOLTA = 1.4, GIRO = 6, DT_MAX = 1 / 20;
const BOCA = new THREE.Vector3(0, .42, .42);
const INICIO = { x: -4, z: 27.6 };

export const CaoDaBusca: React.FC<{ jog: React.MutableRefObject<{ x: number; y: number; z: number }> }> = ({ jog }) => {
    const { scene, animations } = useGLTF(shiba);
    const modelo = useMemo(() => { const m = clonarComEsqueleto(scene); m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; } }); return m; }, [scene]);
    const cao = useRef<THREE.Group>(null), graveto = useRef<THREE.Group>(null);
    const { actions } = useAnimations(animations, cao);
    const clipe = useRef('');
    const tocar = (nome: 'Idle' | 'Walk' | 'Gallop') => {
        if (clipe.current === nome) return;
        const novo = actions[nome], velho = actions[clipe.current];
        if (!novo) return;
        novo.reset().fadeIn(.2).play(); velho?.fadeOut(.2);
        if (nome === 'Gallop') novo.setEffectiveTimeScale(1.4);
        clipe.current = nome;
    };
    const vel = useMemo(() => new THREE.Vector3(), []), tmp = useMemo(() => new THREE.Vector3(), []);
    const espera = useRef(0);

    useEffect(() => {
        busca.arremessar = (origem, direcao, forca) => {
            if (busca.estado !== 'solto' || !graveto.current) return;
            graveto.current.position.copy(origem);
            vel.copy(direcao).normalize().multiplyScalar(forca);
            busca.estado = 'no_ar';
        };
        return () => { busca.arremessar = null; };
    }, [vel]);
    useEffect(() => { const c = cao.current; if (c) c.position.set(INICIO.x, chaoEm(INICIO.x, INICIO.z) ?? 0, INICIO.z); tocar('Idle'); }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Anda até (x, z) virando suave; devolve a distância antes do passo. */
    const irPara = (c: THREE.Object3D, x: number, z: number, d: number) => {
        const dx = x - c.position.x, dz = z - c.position.z, dist = Math.hypot(dx, dz);
        if (dist > 1e-3) {
            const passo = Math.min(VEL * d, dist);
            c.position.x += dx / dist * passo; c.position.z += dz / dist * passo;
            let dif = Math.atan2(dx, dz) - c.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
            c.rotation.y += dif * Math.min(1, GIRO * d);
        }
        const ch = chaoEm(c.position.x, c.position.z); if (ch !== null) c.position.y = ch;
        c.updateMatrixWorld();
        return dist;
    };

    useFrame((_, dt) => {
        const c = cao.current, g = graveto.current; if (!c || !g) return;
        const d = Math.min(dt, DT_MAX), j = jog.current;
        switch (busca.estado) {
            case 'no_ar': {
                vel.y -= G * d; g.position.addScaledVector(vel, d);
                g.rotation.x += d * 9;
                const ch = chaoEm(g.position.x, g.position.z);
                // fora da ilha só conta quando já caiu abaixo dela (pode passar por cima de uma ponte)
                if (g.position.y < -8 || (ch === null && g.position.y < (jog.current.y - 3))) {
                    // caiu da ilha: o hóspede acha outro galho no chão
                    g.position.set(j.x + .8, (chaoEm(j.x + .8, j.z) ?? j.y), j.z); g.rotation.set(0, 0, Math.PI / 2);
                    busca.estado = 'solto';
                } else if (ch !== null && g.position.y <= ch + .03) {
                    g.position.y = ch + .03; g.rotation.set(0, Math.atan2(vel.x, vel.z), Math.PI / 2);
                    busca.estado = 'correndo';
                }
                tocar('Idle');
                break;
            }
            case 'correndo': {
                const dist = irPara(c, g.position.x, g.position.z, d);
                tocar(dist > 2 ? 'Gallop' : 'Walk');
                if (dist <= PEGA) busca.estado = 'voltando';
                break;
            }
            case 'voltando': {
                const dist = irPara(c, j.x, j.z, d);
                tmp.copy(BOCA).applyMatrix4(c.matrixWorld); g.position.copy(tmp);
                g.rotation.set(0, c.rotation.y + Math.PI / 2, Math.PI / 2);
                tocar(dist > 3 ? 'Gallop' : 'Walk');
                if (dist <= SOLTA) {
                    const ch = chaoEm(tmp.x, tmp.z); if (ch !== null) g.position.y = ch + .03;
                    busca.entregas++; busca.estado = 'solto'; espera.current = 1.2;
                }
                break;
            }
            default: {
                // solto: parado olhando o hóspede, abanando com o corpo todo
                espera.current -= d; tocar('Idle');
                const dx = j.x - c.position.x, dz = j.z - c.position.z;
                let dif = Math.atan2(dx, dz) - c.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
                c.rotation.y += dif * Math.min(1, 3 * d);
            }
        }
        busca.graveto.copy(g.position);
    });
    return <>
        <group ref={cao}><primitive object={modelo} /></group>
        {/* o galho: um pau torto com dois brotos */}
        <group ref={graveto} position={[-3.1, chaoEm(-3.1, 26.2) ?? 0, 26.2]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow><cylinderGeometry args={[.018, .026, .62, 6]} /><meshStandardMaterial color="#6b4a2e" roughness={.9} /></mesh>
            <mesh position={[.03, .12, 0]} rotation={[0, 0, -.7]}><cylinderGeometry args={[.01, .014, .16, 5]} /><meshStandardMaterial color="#6b4a2e" roughness={.9} /></mesh>
        </group>
    </>;
};
