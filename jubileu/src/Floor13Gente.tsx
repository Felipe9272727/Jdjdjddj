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
    /** Um tique de glitch antes da possessão (o aviso de que algo vem). */
    tique?: boolean;
    /** Se dado, é o JOGADOR: posição, direção e passo vêm daqui. */
    controle?: React.MutableRefObject<{ x: number; y: number; z: number; ang: number; andando: number; levantando: number }>;
    /** Marca flutuante: '!' tem pista, '?' tem conversa/busca. */
    marca?: string | null;
}> = ({ ficha, x, y, z, ronda, estado, tique, controle, marca }) => {
    const raiz = useRef<THREE.Group>(null), corpo = useRef<THREE.Group>(null);
    const bracoE = useRef<THREE.Group>(null), bracoD = useRef<THREE.Group>(null);
    const pernaE = useRef<THREE.Group>(null), pernaD = useRef<THREE.Group>(null);
    const cabeca = useRef<THREE.Group>(null);
    const M = useMemo(() => ({
        tunica: new THREE.MeshStandardMaterial({ color: ficha.tunica, roughness: .85 }),
        calca: new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: .9 }),
        pele: new THREE.MeshStandardMaterial({ color: pele, roughness: .7 }),
        barba: new THREE.MeshStandardMaterial({ color: ficha.barba ?? '#6b4a2b', roughness: .9 }),
        elmo: new THREE.MeshStandardMaterial({ color: '#7d828a', metalness: .55, roughness: .62 }),   // ferro batido, fosco: liso e espelhado lia como aquário
        chifre: new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: .6 }),
        cinto: new THREE.MeshStandardMaterial({ color: '#2a1d14' }),
        olho: new THREE.MeshBasicMaterial({ color: '#1b1210', toneMapped: false }),
        esclera: new THREE.MeshStandardMaterial({ color: '#f1ebe0', roughness: .4 }),
        boca: new THREE.MeshStandardMaterial({ color: '#5a2320', roughness: .6 }),
        faixa: new THREE.MeshStandardMaterial({ color: '#8a7a5c', roughness: 1 }),
        couro: new THREE.MeshStandardMaterial({ color: '#4a2f1d', roughness: .55 }),
        fivela: new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: .9, roughness: .3 }),
        pelica: new THREE.MeshStandardMaterial({ color: '#8f7a62', roughness: 1, flatShading: true }),
        capa: new THREE.MeshStandardMaterial({ color: new THREE.Color(ficha.tunica).multiplyScalar(.6), roughness: .9, side: THREE.DoubleSide }),
        cabelo: new THREE.MeshStandardMaterial({ color: ficha.id === 'eira' ? '#d9a44a' : ficha.id === 'ragnhild' ? '#b0452a' : '#c9a36a', roughness: .8 }),
    }), [ficha]);
    const G = useMemo(() => {
        const tronco = new THREE.CylinderGeometry(.24, .34, .78, 20, 3);
        const manto = new THREE.TorusGeometry(.26, .09, 8, 22); manto.rotateX(Math.PI / 2); manto.scale(1.1, 1, .85);
        return {
            tronco, manto,
            coxa: new THREE.CapsuleGeometry(.1, .22, 4, 10),
            canela: new THREE.CapsuleGeometry(.085, .2, 4, 10),
            bota: (() => { const g = new THREE.CapsuleGeometry(.09, .14, 4, 10); g.rotateX(Math.PI / 2); return g; })(),
            braco: new THREE.CapsuleGeometry(.085, .3, 4, 10),
        };
    }, []);
    const boca = useRef<THREE.Mesh>(null), sobrE = useRef<THREE.Mesh>(null), sobrD = useRef<THREE.Mesh>(null);
    const olhos = useRef<(THREE.Group | null)[]>([]);
    const marcaRef = useRef<THREE.Group>(null);
    const joelhos = useRef<(THREE.Group | null)[]>([]);
    const capa = useRef<THREE.Group>(null), luzVerde = useRef<THREE.PointLight>(null);
    const crianca = ficha.id === 'eira';
    const escala = crianca ? .72 : 1;
    const giro = useRef(0);
    const queda = useRef(0);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useFrame(({ clock, camera }, dt) => {
        const g = raiz.current; if (!g) return;
        const t = clock.elapsedTime, e = estado.current;
        // ── O ROSTO E O MANTO ────────────────────────────────────────────
        const falaAberta = e.falando ? Math.abs(Math.sin(t * 13)) * Math.abs(Math.sin(t * 5.3)) : 0;
        if (boca.current) boca.current.scale.set(e.possessao > 0 ? 1.4 : 1, e.possessao > 0 ? 3.5 : 1 + falaAberta * 3.2, 1);
        const sob = e.possessao > 0 ? -.03 : e.falando ? Math.sin(t * 3.1) * .015 + .01 : 0;
        if (sobrE.current) { sobrE.current.position.y = .31 + sob; sobrE.current.rotation.z = e.possessao > 0 ? -.4 : .08; }
        if (sobrD.current) { sobrD.current.position.y = .31 + sob; sobrD.current.rotation.z = e.possessao > 0 ? .4 : -.08; }
        if (capa.current) capa.current.rotation.x = .12 + Math.sin(t * 1.6 + x) * .06;
        // piscar: a cada ~4 s, um décimo de segundo
        const pisca = ((t + x * 1.7) % 4.2) < .12 ? .1 : 1;
        olhos.current.forEach((o) => { if (o) o.scale.y = pisca; });
        if (marcaRef.current) { marcaRef.current.position.y = 2.75 + Math.sin(t * 2.5) * .08; marcaRef.current.rotation.y = t * 1.5; }
        if (luzVerde.current) luzVerde.current.intensity = e.possessao > 0 ? .8 + Math.sin(t * 30) * .3 : 0;
        const d = Math.min(dt, .05);
        // ── ONDE ELE ESTÁ ────────────────────────────────────────────────
        let px = x, pz = z, andando = false, direcao = giro.current;
        const ctl = controle?.current;
        if (ctl) { px = ctl.x; pz = ctl.z; direcao = ctl.ang; andando = ctl.andando > .15; }
        if (ronda && !e.falando && !e.olharPara) {
            const a = t * .45;
            px = x + Math.cos(a) * ronda; pz = z + Math.sin(a) * ronda;
            direcao = -a; andando = true;
        }
        g.position.set(px, ctl ? ctl.y : y, pz);
        if (e.olharPara && !e.caido) {
            tmp.set(e.olharPara.x - px, 0, e.olharPara.z - pz);
            direcao = Math.atan2(tmp.x, tmp.z);
        }
        let dd = direcao - giro.current;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        giro.current += dd * Math.min(1, d * 6);
        g.rotation.y = ctl ? ctl.ang : giro.current;
        if (ctl) g.rotation.x = -ctl.levantando * 1.35;

        // ── O QUE O CORPO FAZ ────────────────────────────────────────────
        const set = (r: React.RefObject<THREE.Group | null>, v: number) => { if (r.current) r.current.rotation.x = v; };
        const c = corpo.current;
        if (e.caido) {
            // duro no chão: cai de costas, e fica
            // duro: fica rígido um instante, tomba de uma vez e quica
            queda.current += d;
            const q = queda.current, tomba = q < .15 ? 0 : Math.min(1, ((q - .15) / .35) ** 2);
            const quica = q > .5 ? Math.abs(Math.sin((q - .5) * 14)) * Math.exp(-(q - .5) * 7) * .12 : 0;
            g.rotation.x = -Math.PI / 2 * tomba + quica;
            g.position.y = y + .25 * tomba + quica * .5; g.scale.setScalar(escala);
            set(bracoE, 0); set(bracoD, 0); set(pernaE, 0); set(pernaD, 0);
            return;
        }
        if (!ctl) g.rotation.x = 0;
        // antes de ser tomado, um tique: um quadro em cada tanto ele "pula"
        // olhos da entidade acima de 1: o bloom pega e eles brilham
        if (e.possessao > 0) M.olho.color.setRGB(.5, 3, 1.2); else M.olho.color.set('#1b1210');
        if (e.possessao > 0) {
            // possuído: levita, trava, treme em quadros duros, olhos verdes
            const q = Math.floor(t * 14);
            g.position.y = y + .3 + Math.sin(t * 3) * .05;
            // o corpo inteiro trava de frente para a câmera: ele encara quem joga
            tmp.copy(camera.position).sub(g.position); g.rotation.y = Math.atan2(tmp.x, tmp.z);
            if (c) c.position.x = ((q * 7919) % 5 - 2) * .03 * e.possessao;
            g.scale.setScalar(escala * (1 + ((q * 31) % 3 - 1) * .02));
            if (cabeca.current) cabeca.current.rotation.z = .35 * e.possessao;
            set(bracoE, 0); set(bracoD, 0);
            return;
        }
        g.scale.setScalar(escala);
        if (!andando) joelhos.current.forEach((j) => { if (j) j.rotation.x *= .8; });
        if (c) { c.position.x = 0; c.position.y = Math.sin(t * 1.8 + x) * .02; c.rotation.y = 0; }
        if (tique && c && Math.floor(t * 10) % 37 === 0) c.position.x = .06;
        if (cabeca.current) cabeca.current.rotation.z = 0;
        if (andando) {
            // passo com peso: quadril sobe duas vezes por ciclo e o tronco
            // gira contra as pernas
            const f = t * (ctl ? 9 : 7);
            set(pernaE, Math.sin(f) * .75); set(pernaD, -Math.sin(f) * .75);
            set(bracoE, -Math.sin(f) * .55); set(bracoD, Math.sin(f) * .55);
            if (c) { c.position.y = Math.abs(Math.sin(f)) * .06; c.rotation.y = Math.sin(f) * .1; }
            // o joelho dobra na volta da perna (quando ela vai para a frente no ar)
            if (joelhos.current[0]) joelhos.current[0].rotation.x = Math.max(0, -Math.cos(f)) * .9;
            if (joelhos.current[1]) joelhos.current[1].rotation.x = Math.max(0, Math.cos(f)) * .9;
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
        {marca && !controle && <group ref={marcaRef} position={[0, 2.75, 0]}>
            <mesh><octahedronGeometry args={[.16, 0]} /><meshBasicMaterial color={marca === '!' ? new THREE.Color('#ffc34a').multiplyScalar(2) : new THREE.Color('#cfe3ff').multiplyScalar(1.6)} toneMapped={false} /></mesh>
        </group>}
        {/* a luz verde da entidade, só acesa na possessão */}
        <pointLight ref={luzVerde} position={[0, 1.9, 1.2]} color="#3dff8a" intensity={0} distance={4} />
        <group ref={corpo}>
            {/* pernas: calça de lã enfaixada até o joelho e bota de couro */}
            {[[-.15, pernaE], [.15, pernaD]].map(([dx, r]) => (
                <group key={dx as number} ref={r as React.RefObject<THREE.Group>} position={[dx as number, .82, 0]}>
                    <mesh position={[0, -.2, 0]} material={M.calca} geometry={G.coxa} />
                    {/* joelho: a canela dobra, o passo tem duas fases */}
                    <group position={[0, -.36, 0]} ref={(o) => { joelhos.current[(dx as number) < 0 ? 0 : 1] = o; }}>
                        <mesh position={[0, -.16, 0]} material={M.faixa} geometry={G.canela} />
                        <mesh position={[0, -.4, .05]} material={M.couro} geometry={G.bota} />
                    </group>
                </group>
            ))}
            {/* túnica que abre em saia, cinto com fivela, manto de pele nos ombros */}
            <mesh position={[0, 1.1, 0]} material={M.tunica} geometry={G.tronco} />
            <mesh position={[0, .98, 0]} material={M.cinto}><torusGeometry args={[.3, .045, 8, 28]} /></mesh>
            <mesh position={[0, .98, .3]} material={M.fivela}><boxGeometry args={[.1, .08, .03]} /></mesh>
            <mesh position={[0, 1.5, -.02]} material={M.pelica} geometry={G.manto} />
            <group ref={capa} position={[0, 1.48, -.2]}>
                <mesh position={[0, -.45, 0]} material={M.capa}><boxGeometry args={[.6, .95, .03]} /></mesh>
            </group>
            {/* braços com mão */}
            {[[-.36, bracoE], [.36, bracoD]].map(([dx, r]) => (
                <group key={dx as number} ref={r as React.RefObject<THREE.Group>} position={[dx as number, 1.42, 0]}>
                    <mesh position={[0, -.24, 0]} material={M.tunica} geometry={G.braco} />
                    <mesh position={[0, -.44, 0]} material={M.couro}><cylinderGeometry args={[.075, .07, .1, 12]} /></mesh>
                    <mesh position={[0, -.54, 0]} material={M.pele}><sphereGeometry args={[.075, 12, 10]} /></mesh>
                </group>
            ))}
            <group ref={cabeca} position={[0, 1.62, 0]} scale={1.28}>
                <mesh position={[0, .2, 0]} material={M.pele} scale={[1, 1.08, .95]}><sphereGeometry args={[.25, 24, 18]} /></mesh>
                {/* nariz, olhos com esclera e pupila, sobrancelhas, boca */}
                <mesh position={[0, .18, .24]} rotation={[Math.PI / 2 - .3, 0, 0]} material={M.pele}><coneGeometry args={[.045, .12, 10]} /></mesh>
                {[-1, 1].map((l) => <group key={l} ref={(o) => { olhos.current[l < 0 ? 0 : 1] = o; }} position={[l * .09, .25, .215]}>
                    <mesh material={M.esclera} scale={[1, .85, .5]}><sphereGeometry args={[.05, 12, 10]} /></mesh>
                    <mesh position={[0, 0, .022]} material={M.olho}><sphereGeometry args={[.027, 10, 8]} /></mesh>
                </group>)}
                <mesh ref={sobrE} position={[-.09, .31, .22]} material={M.barba}><boxGeometry args={[.09, .022, .03]} /></mesh>
                <mesh ref={sobrD} position={[.09, .31, .22]} material={M.barba}><boxGeometry args={[.09, .022, .03]} /></mesh>
                <mesh ref={boca} position={[0, .08, .225]} material={M.boca}><boxGeometry args={[.09, .025, .02]} /></mesh>
                {/* barba cheia com duas tranças, ou cabelo trançado */}
                {ficha.barba && <>
                    <mesh position={[0, .02, .14]} material={M.barba} scale={[1, 1.1, .7]}><sphereGeometry args={[.19, 16, 12, 0, Math.PI * 2, Math.PI * .35, Math.PI * .65]} /></mesh>
                    {[-1, 1].map((l) => <mesh key={l} position={[l * .06, -.14, .16]} material={M.barba}><cylinderGeometry args={[.03, .015, .22, 8]} /></mesh>)}
                    {[-1, 1].map((l) => <mesh key={l} position={[l * .06, -.23, .16]} material={M.fivela}><torusGeometry args={[.02, .008, 6, 10]} /></mesh>)}
                </>}
                {!crianca && !ficha.barba && <>
                    <mesh position={[0, .26, -.05]} material={M.cabelo} scale={[1.05, 1.08, 1]}><sphereGeometry args={[.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * .6]} /></mesh>
                    <mesh position={[0, -.05, -.2]} material={M.cabelo}><cylinderGeometry args={[.05, .025, .55, 8]} /></mesh>
                </>}
                {crianca && [-1, 1].map((l) => <mesh key={l} position={[l * .24, .12, -.02]} material={M.cabelo}><cylinderGeometry args={[.045, .025, .38, 8]} /></mesh>)}
                {crianca && <mesh position={[0, .3, -.04]} material={M.cabelo} scale={[1.05, 1.05, 1.02]}><sphereGeometry args={[.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * .55]} /></mesh>}
                {/* elmo de ferro com protetor de nariz (e chifres só para os que gostam) */}
                {!crianca && ficha.id !== 'ragnhild' && ficha.id !== 'sigrun' && (ficha.id as string) !== 'hospede' && <>
                    <mesh position={[0, .3, 0]} material={M.elmo}><sphereGeometry args={[.27, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
                    <mesh position={[0, .3, 0]} material={M.cinto}><torusGeometry args={[.27, .02, 6, 28]} /></mesh>
                    <mesh position={[0, .23, .27]} material={M.elmo}><boxGeometry args={[.035, .16, .02]} /></mesh>
                    {ficha.id !== 'halvard' && [-1, 1].map((l) => (
                        <mesh key={l} position={[l * .28, .42, 0]} rotation={[0, 0, -l * 1.05]} material={M.chifre}><coneGeometry args={[.045, .26, 10]} /></mesh>
                    ))}
                </>}
            </group>
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
