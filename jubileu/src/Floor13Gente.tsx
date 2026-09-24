/**
 * Floor13Gente.tsx — os moradores de Vindhjem e as ovelhas fujonas.
 *
 * Os vikings são bonecos de blocos, da mesma família do avatar do jogador,
 * com o que diferencia cada um de longe: a cor da túnica, a barba, o elmo.
 * Eles "vivem": respiram, gesticulam enquanto falam, viram para o hóspede
 * quando ele chega perto, e cada ofício tem seu gesto (o ferreiro martela, o
 * pescador puxa a linha, a menina corre em volta do poço).
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FichaNpc } from './f13Lore';

export interface EstadoVisualNpc {
    /** Vira para este ponto (o jogador) quando perto. */
    olharPara: THREE.Vector3 | null;
    falando: boolean;
    /** 0 = normal; sobe para 1 enquanto a entidade o possui; `caido` o derruba. */
    possessao: number;
    caido: boolean;
}

const pele = '#e2b08a';

export const Viking: React.FC<{
    ficha: FichaNpc;
    x: number; y: number; z: number;
    ronda?: number;
    estado: React.MutableRefObject<EstadoVisualNpc>;
}> = ({ ficha, x, y, z, ronda, estado }) => {
    const raiz = useRef<THREE.Group>(null), corpo = useRef<THREE.Group>(null);
    const bracoE = useRef<THREE.Group>(null), bracoD = useRef<THREE.Group>(null);
    const pernaE = useRef<THREE.Group>(null), pernaD = useRef<THREE.Group>(null);
    const cabeca = useRef<THREE.Group>(null);
    const M = useMemo(() => ({
        tunica: new THREE.MeshStandardMaterial({ color: ficha.tunica, roughness: .85 }),
        calca: new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: .9 }),
        pele: new THREE.MeshStandardMaterial({ color: pele, roughness: .7 }),
        barba: new THREE.MeshStandardMaterial({ color: ficha.barba ?? '#6b4a2b', roughness: .9 }),
        elmo: new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: .7, roughness: .35 }),
        chifre: new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: .6 }),
        cinto: new THREE.MeshStandardMaterial({ color: '#2a1d14' }),
        olho: new THREE.MeshBasicMaterial({ color: '#1b1210' }),
    }), [ficha]);
    const crianca = ficha.id === 'eira';
    const escala = crianca ? .72 : 1;
    const giro = useRef(0);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useFrame(({ clock }, dt) => {
        const g = raiz.current; if (!g) return;
        const t = clock.elapsedTime, e = estado.current;
        const d = Math.min(dt, .05);
        // ── ONDE ELE ESTÁ ────────────────────────────────────────────────
        let px = x, pz = z, andando = false, direcao = giro.current;
        if (ronda && !e.falando && !e.olharPara) {
            const a = t * .45;
            px = x + Math.cos(a) * ronda; pz = z + Math.sin(a) * ronda;
            direcao = -a; andando = true;
        }
        g.position.set(px, y, pz);
        if (e.olharPara && !e.caido) {
            tmp.set(e.olharPara.x - px, 0, e.olharPara.z - pz);
            direcao = Math.atan2(tmp.x, tmp.z);
        }
        let dd = direcao - giro.current;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        giro.current += dd * Math.min(1, d * 6);
        g.rotation.y = giro.current;

        // ── O QUE O CORPO FAZ ────────────────────────────────────────────
        const set = (r: React.RefObject<THREE.Group | null>, v: number) => { if (r.current) r.current.rotation.x = v; };
        const c = corpo.current;
        if (e.caido) {
            // duro no chão: cai de costas, e fica
            g.rotation.x += (-Math.PI / 2 - g.rotation.x) * Math.min(1, d * 7);
            g.position.y = y + .25;
            set(bracoE, 0); set(bracoD, 0); set(pernaE, 0); set(pernaD, 0);
            return;
        }
        g.rotation.x = 0;
        if (e.possessao > 0) {
            // possuído: trava, treme em quadros duros, cabeça inclina
            const q = Math.floor(t * 14);
            if (c) c.position.x = ((q * 7919) % 5 - 2) * .02 * e.possessao;
            if (cabeca.current) cabeca.current.rotation.z = .35 * e.possessao;
            set(bracoE, 0); set(bracoD, 0);
            return;
        }
        if (c) { c.position.x = 0; c.position.y = Math.sin(t * 1.8 + x) * .02; }
        if (cabeca.current) cabeca.current.rotation.z = 0;
        if (andando) {
            const f = t * 7;
            set(pernaE, Math.sin(f) * .7); set(pernaD, -Math.sin(f) * .7);
            set(bracoE, -Math.sin(f) * .5); set(bracoD, Math.sin(f) * .5);
        } else if (e.falando) {
            set(pernaE, 0); set(pernaD, 0);
            set(bracoE, -.4 + Math.sin(t * 5) * .35); set(bracoD, -.2 + Math.sin(t * 4 + 1) * .25);
        } else {
            set(pernaE, 0); set(pernaD, 0);
            // o gesto do ofício
            if (ficha.id === 'brokk') { set(bracoD, -1.6 + Math.abs(Math.sin(t * 3)) * 1.3); set(bracoE, -.3); }
            else if (ficha.id === 'halvard') { set(bracoE, -1.1 + Math.sin(t * .8) * .15); set(bracoD, -1.1 + Math.sin(t * .8) * .15); }
            else if (ficha.id === 'ulfgar') { set(bracoD, -.6 + Math.sin(t * 1.3) * .4); set(bracoE, Math.sin(t * 1.8) * .05); }
            else { set(bracoE, Math.sin(t * 1.8 + x) * .06); set(bracoD, -Math.sin(t * 1.8 + x) * .06); }
        }
    });

    return <group ref={raiz} scale={escala}>
        <group ref={corpo}>
            {[[-.17, pernaE], [.17, pernaD]].map(([dx, r]) => (
                <group key={dx as number} ref={r as React.RefObject<THREE.Group>} position={[dx as number, .8, 0]}>
                    <mesh position={[0, -.38, 0]} material={M.calca}><boxGeometry args={[.25, .75, .27]} /></mesh>
                    <mesh position={[0, -.78, .06]} material={M.cinto}><boxGeometry args={[.27, .12, .38]} /></mesh>
                </group>
            ))}
            <mesh position={[0, 1.15, 0]} material={M.tunica}><boxGeometry args={[.66, .75, .4]} /></mesh>
            <mesh position={[0, .82, 0]} material={M.tunica}><boxGeometry args={[.74, .2, .44]} /></mesh>
            <mesh position={[0, .98, 0]} material={M.cinto}><boxGeometry args={[.68, .08, .42]} /></mesh>
            {[[-.43, bracoE], [.43, bracoD]].map(([dx, r]) => (
                <group key={dx as number} ref={r as React.RefObject<THREE.Group>} position={[dx as number, 1.45, 0]}>
                    <mesh position={[0, -.26, 0]} material={M.tunica}><boxGeometry args={[.2, .55, .22]} /></mesh>
                    <mesh position={[0, -.58, 0]} material={M.pele}><boxGeometry args={[.17, .15, .19]} /></mesh>
                </group>
            ))}
            <group ref={cabeca} position={[0, 1.55, 0]}>
                <mesh position={[0, .27, 0]} material={M.pele}><boxGeometry args={[.52, .5, .48]} /></mesh>
                <mesh position={[-.12, .3, .245]} material={M.olho}><boxGeometry args={[.07, .09, .01]} /></mesh>
                <mesh position={[.12, .3, .245]} material={M.olho}><boxGeometry args={[.07, .09, .01]} /></mesh>
                {ficha.barba && <mesh position={[0, .06, .22]} material={M.barba}><boxGeometry args={[.5, .38, .14]} /></mesh>}
                {!ficha.barba && !crianca && <mesh position={[0, .35, -.2]} material={M.barba}><boxGeometry args={[.5, .6, .14]} /></mesh>}
                {crianca && [-1, 1].map((l) => <mesh key={l} position={[l * .3, .25, -.05]} material={M.barba}><boxGeometry args={[.1, .45, .12]} /></mesh>)}
                {!crianca && <>
                    <mesh position={[0, .5, 0]} material={M.elmo}><sphereGeometry args={[.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
                    <mesh position={[0, .52, 0]} material={M.cinto}><torusGeometry args={[.29, .03, 6, 20]} /></mesh>
                    {ficha.id !== 'ragnhild' && ficha.id !== 'sigrun' && [-1, 1].map((l) => (
                        <mesh key={l} position={[l * .3, .62, 0]} rotation={[0, 0, -l * .9]} material={M.chifre}><coneGeometry args={[.06, .32, 8]} /></mesh>
                    ))}
                </>}
            </group>
            {ficha.id === 'brokk' && <group position={[.43, .85, .15]}>
                <mesh material={M.cinto}><boxGeometry args={[.06, .5, .06]} /></mesh>
            </group>}
        </group>
    </group>;
};

/** Ovelha fujona: fofa, balança, pula quando é achada. */
export const Ovelha: React.FC<{ x: number; y: number; z: number; achadaRef: React.MutableRefObject<boolean> }> = ({ x, y, z, achadaRef }) => {
    const g = useRef<THREE.Group>(null);
    const la = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 1 }), []);
    const pret = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2622' }), []);
    const sumiu = useRef(0);
    useFrame(({ clock }, dt) => {
        const o = g.current; if (!o) return;
        const t = clock.elapsedTime;
        if (achadaRef.current) {
            // pula e some de volta para a Sigrun
            sumiu.current = Math.min(1, sumiu.current + dt * 1.6);
            o.position.set(x, y + Math.sin(sumiu.current * Math.PI) * 2, z);
            o.scale.setScalar(Math.max(.001, 1 - sumiu.current));
            return;
        }
        o.position.set(x + Math.sin(t * .4 + x) * .3, y + Math.abs(Math.sin(t * 3 + z)) * .05, z);
        o.rotation.y = Math.sin(t * .3 + z) * 1.2;
    });
    return <group ref={g}>
        {[[0, .55, 0, .45], [.25, .6, .15, .32], [-.25, .6, -.12, .32], [0, .72, -.25, .3], [0, .7, .25, .3]].map(([a, b, c, r], i) => (
            <mesh key={i} position={[a, b, c]} material={la}><sphereGeometry args={[r, 10, 8]} /></mesh>
        ))}
        <mesh position={[0, .7, .55]} material={pret}><boxGeometry args={[.26, .28, .3]} /></mesh>
        {[[-.18, -.2], [.18, -.2], [-.18, .22], [.18, .22]].map(([a, c], i) => (
            <mesh key={i} position={[a, .18, c]} material={pret}><boxGeometry args={[.08, .36, .08]} /></mesh>
        ))}
    </group>;
};
