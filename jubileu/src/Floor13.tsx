/**
 * Floor13.tsx — Vindhjem, a cidade viking que voa.
 *
 * O ANDAR, EM ORDEM:
 *  1. A QUEDA (cena de abertura, ~11 s, pulável): o avião do andar 12 tosse,
 *     o TROCO-63 some do rádio, o motor morre e a câmera acompanha o mergulho
 *     num plano contínuo — por cima das nuvens, de lado no engasgo, por trás
 *     no mergulho revelando a cidade — até o baque no feno.
 *  2. EXPLORAR: terceira pessoa. Arrastar à esquerda anda, à direita gira a
 *     câmera (WASD/setas + arrastar o mouse no computador). Perto de alguém ou
 *     de algo aparece o botão de ação.
 *  3. As pistas vêm dos moradores; as buscas secundárias dão lore e reforçam.
 *  4. Com duas pistas, o pescador Halvard é tomado pela ENTIDADE — e cai duro.
 *  5. Bater na casa certa: a porta de latão abre como a de um elevador.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, HueSaturation, ChromaticAberration, Noise, Vignette, BrightnessContrast } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Avatar64, useAvatarRefs } from './Floor5Player64';
import { CascoDoElevador } from './Floor12Avioes';
import { Floor13Mundo } from './Floor13Mundo';
import { Viking, Ovelha, type EstadoVisualNpc } from './Floor13Gente';
import {
    NPCS, PISTAS, BUSCAS, ENTIDADE, CASA_CERTA, type FichaNpc, CONEXAO_ENCERRADA, LEGENDAS_DA_QUEDA, CASAS, type Fala, type IdNpc, type Pista,
} from './f13Lore';
import {
    ILHAS as ILHAS_R, chaoEm, INICIO, LUGAR_DOS_NPCS, LUGAR_DAS_CASAS, portaDaCasa, MARTELO, OVELHAS, SINO,
    novoEstado13, falarCom, pegarMartelo, acharOvelha, tocarSino as marcarSino, entidadeAcorda, baterNaCasa,
} from './f13Mundo';
import {
    tocarVento, pararVento, tocarMotorTossindo, tocarMotorMorrendo, tocarQueda, tocarSino, tocarDingDaCasa,
    tocarPegar, tocarBalido, tocarFala, tocarGlitch, tocarDesconexao, tocarAmbiente, pararAmbiente, tocarPasso, tocarCorpoCaindo,
} from './floor13Sfx';

type Fase = 'queda' | 'explorar' | 'dialogo' | 'elevador';
type Alvo =
    | { tipo: 'npc'; id: IdNpc }
    | { tipo: 'martelo' } | { tipo: 'ovelha'; i: number } | { tipo: 'sino' } | { tipo: 'casa'; i: number };
const chaveDoAlvo = (a: Alvo | null) => (a ? `${a.tipo}:${'id' in a ? a.id : 'i' in a ? a.i : ''}` : '');

export const DURACAO_DA_QUEDA = 12.6;
/** O hóspede, no mesmo desenho dos moradores: jaqueta azul, sem elmo. */
const HOSPEDE = { id: 'hospede', nome: 'Você', oficio: 'hóspede', tunica: '#3b6fb0', barba: null, primeira: [], depois: [] } as unknown as FichaNpc;
/** Bancada: `?f13t=5` congela a queda nesse instante (só em DEV). */
const tFixo: number | null = typeof location !== 'undefined' && new URLSearchParams(location.search).has('f13t')
    ? parseFloat(new URLSearchParams(location.search).get('f13t') ?? '0') : null;
/** A entidade em cena: a câmera fecha mais nela. */
const entidadeNaCena = { valor: false };

/** Estado de movimento do jogador (mutável, lido a cada quadro). */
interface Jog { x: number; y: number; z: number; ang: number; vy: number; seguro: { x: number; z: number }; levantando: number; andando: number }

const ICONE_DA_PISTA: Record<Pista, string> = { latao: '🚪', fumaca: '🏚', botao: '🔔' };

const t13: React.CSSProperties = {
    fontFamily: 'monospace', fontWeight: 900, color: '#FFE3A0', letterSpacing: 1.5,
    textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000', userSelect: 'none',
};

// ═══ A QUEDA ═════════════════════════════════════════════════════════════════
const CAMINHO = new THREE.CatmullRomCurve3([
    new THREE.Vector3(80, 34, 120), new THREE.Vector3(48, 29, 92), new THREE.Vector3(22, 24, 70),
    new THREE.Vector3(8, 16, 52), new THREE.Vector3(1, 6, 40), new THREE.Vector3(-2, 1.4, 33),
]);
/** Quanto do caminho já foi percorrido no instante t (acelera no mergulho). */
function progressoDaQueda(t: number): number {
    const planar = Math.min(t, 7.4) / 7.4 * .55;
    const mergulho = Math.max(0, Math.min(1, (t - 7.4) / 3));
    return Math.min(1, planar + mergulho * mergulho * .45);
}

/** Fumaça macia: um sprite com degradê radial (esferas liam como discos). */
let texFumaca: THREE.CanvasTexture | null = null;
const matsFumaca: THREE.SpriteMaterial[] = [];
function matFumaca(i: number): THREE.SpriteMaterial {
    if (!texFumaca) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        r.addColorStop(0, 'rgba(70,64,60,1)'); r.addColorStop(.5, 'rgba(70,64,60,.55)'); r.addColorStop(1, 'rgba(70,64,60,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        texFumaca = new THREE.CanvasTexture(c);
    }
    return (matsFumaca[i] ??= new THREE.SpriteMaterial({ map: texFumaca, transparent: true, depthWrite: false }));
}

const matsPoeira: THREE.SpriteMaterial[] = [];
let texPoeira: THREE.CanvasTexture | null = null;
function matPoeira(i: number): THREE.SpriteMaterial {
    if (!texPoeira) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        r.addColorStop(0, 'rgba(236,214,160,1)'); r.addColorStop(.6, 'rgba(236,214,160,.4)'); r.addColorStop(1, 'rgba(236,214,160,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        texPoeira = new THREE.CanvasTexture(c);
    }
    return (matsPoeira[i] ??= new THREE.SpriteMaterial({ map: texPoeira, transparent: true, depthWrite: false }));
}

// destroços no terço esquerdo, a cidade à direita
const HEROI = new THREE.Vector3(5, 4.3, 41.5);
const DESTROCOS = new THREE.Vector3(-1.6, 1.2, 31.5);
const smoother = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * c * (c * (c * 6 - 15) + 10); };

/** Sulco de terra com borda esfumada e torrões: nada de retângulo chapado. */
let texSulco: THREE.CanvasTexture | null = null;
function texturaDoSulco(): THREE.CanvasTexture {
    if (texSulco) return texSulco;
    const c = document.createElement('canvas'); c.width = 64; c.height = 192;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(90,65,40,0)'); gr.addColorStop(.3, 'rgba(90,65,40,.9)'); gr.addColorStop(.5, 'rgba(60,42,26,1)');
    gr.addColorStop(.7, 'rgba(90,65,40,.9)'); gr.addColorStop(1, 'rgba(90,65,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 192);
    g.globalCompositeOperation = 'destination-in';
    const gv = g.createLinearGradient(0, 0, 0, 192); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(.25, 'rgba(0,0,0,1)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gv; g.fillRect(0, 0, 64, 192);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${70 + Math.random() * 40},${50 + Math.random() * 30},30,.9)`; g.beginPath(); g.arc(8 + Math.random() * 48, 40 + Math.random() * 150, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    texSulco = new THREE.CanvasTexture(c); texSulco.colorSpace = THREE.SRGBColorSpace;
    return texSulco;
}

const CenaDaQueda: React.FC<{ tRef: React.MutableRefObject<number> }> = ({ tRef }) => {
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const aviao = useRef<THREE.Group>(null), balanco = useRef<THREE.Group>(null);
    const abertura = useRef(1), helice = useRef(0);
    const refs = useAvatarRefs();
    const fumaca = useRef<THREE.Group>(null), poeira = useRef<THREE.Group>(null), lascas = useRef<THREE.Group>(null);
    const sulco = useRef<THREE.Mesh>(null);
    const puffs = useRef(Array.from({ length: 28 }, () => ({ p: new THREE.Vector3(), t: 99 })));
    const proximoPuff = useRef(0);
    const tmp = useMemo(() => ({ tan: new THREE.Vector3(), lado: new THREE.Vector3(), cam: new THREE.Vector3(), olho: new THREE.Vector3(), alvo: new THREE.Vector3() }), []);
    const olhar = useRef(new THREE.Vector3(0, 0, 0));

    const chamuscado = useRef(false);
    const domado = useRef(false);
    useFrame((_, dt) => {
        const t = tRef.current;
        // no impacto o casco apaga: sem o brilho de fábrica, com a tinta
        // escurecida — destroço, não vitrine (o bloom estourava as asas)
        // no voo o marfim das asas já estourava no bloom contra o céu claro:
        // fica um tom abaixo desde o primeiro quadro
        const escurece = (k: number, rough: number) => aviao.current?.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (!m || !('emissive' in m) || !(o as THREE.Mesh).isMesh) return;
            const c = m.clone(); c.emissiveIntensity = 0; c.color.multiplyScalar(k); c.roughness = Math.max(c.roughness, rough);
            (o as THREE.Mesh).material = c;
        });
        if (!domado.current && aviao.current) { domado.current = true; escurece(.82, .6); }
        if (t >= 10.45 && !chamuscado.current && aviao.current) { chamuscado.current = true; escurece(.75, .8); }
        const u = progressoDaQueda(t);
        const pos = CAMINHO.getPointAt(u);
        CAMINHO.getTangentAt(Math.min(.999, u), tmp.tan);
        const g = aviao.current;
        if (g) {
            if (t < 10.45) {
                g.position.copy(pos);
                tmp.alvo.copy(pos).add(tmp.tan);
                g.lookAt(tmp.alvo);
            } else {
                // os destroços: o avião fica de nariz enfiado no feno
                // derrapa 0,3 s e quica antes de assentar no feno
                const d = Math.min(1, (t - 10.45) / .3);
                const quique = Math.sin(d * Math.PI) * .45 * (1 - d);
                g.position.set(-2.2 + (1 - d) * 1.4, 1.05 + quique, 33.4 + (1 - d) * 1.2);   // afundado no feno
                g.rotation.set(-.55 * d, 1.9, .2 + (1 - d) * .5 + d * .26);   // asa de frente para a lente, não de fio
            }
        }
        // o motor tossindo: tranco na rolagem; morto: a hélice para
        const tosse = t > 2.6 ? Math.max(0, Math.sin(t * 9)) * Math.min(1, (t - 2.6)) : 0;
        if (balanco.current) {
            balanco.current.rotation.z = Math.sin(t * 1.3) * .08 + tosse * .18 * Math.sin(t * 23) + (t > 7.4 ? Math.sin(t * 2.2) * .35 : 0);
            balanco.current.rotation.x = t > 7.4 ? -.25 : tosse * .05;
        }
        helice.current = t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 1.5);
        if (refs.legL.current && refs.legL.current.rotation.x === 0) {
            if (refs.body.current) refs.body.current.rotation.y = Math.PI;
            for (const l of [refs.legL, refs.legR]) if (l.current) l.current.rotation.x = -1.5;
            if (refs.shadow.current) refs.shadow.current.visible = false;
        }
        for (const a of [refs.armL, refs.armR]) if (a.current) a.current.rotation.x = t > 7.4 ? -2.6 + Math.sin(t * 12) * .3 : -1.15;

        // fumaça saindo do motor depois do primeiro engasgo
        if (t > 10.5 && t > proximoPuff.current) {
            // os destroços continuam fumegando
            proximoPuff.current = t + .18;
            const livre = puffs.current.find((p) => p.t > 1.6) ?? puffs.current[0];
            livre.p.set(-1.6 + Math.random() * .4, 1.6, 33.2); livre.t = 0;
        }
        if (t > 2.6 && t < 10.4 && t > proximoPuff.current) {
            proximoPuff.current = t + (t > 5 ? .06 : .14);
            const livre = puffs.current.find((p) => p.t > 1.6) ?? puffs.current[0];
            livre.p.copy(pos); livre.t = 0;
        }
        puffs.current.forEach((p, i) => {
            p.t += dt;
            const m = fumaca.current?.children[i] as THREE.Sprite | undefined; if (!m) return;
            m.visible = p.t < 1.6;
            m.position.copy(p.p); m.position.y += p.t * .6;
            m.scale.setScalar(Math.min(2.5, .6 + p.t * 1.5));
            // some perto da lente em vez de sumir de uma vez
            const perto = THREE.MathUtils.smoothstep(m.position.distanceTo(camera.position), 1.5, 5);
            m.material.opacity = .6 * (1 - p.t / 1.6) * perto;
        });
        // a poeira do baque no feno
        const pq = Math.max(0, t - 10.4);
        if (poeira.current) {
            poeira.current.visible = pq > 0 && pq < 1.6;
            poeira.current.children.forEach((c, i) => {
                const a = i / poeira.current!.children.length * Math.PI * 2;
                c.position.set(-2 + Math.cos(a) * pq * 3, 1 + pq * (1 + (i % 3) * .4), 33 + Math.sin(a) * pq * 3);
                c.scale.setScalar(.5 + pq * 1.2);
                // perto da lente a poeira some (antes cobria o avião e estourava no bloom)
                (c as THREE.Sprite).material.opacity = .35 * Math.max(0, 1 - pq / 1.6) * THREE.MathUtils.smoothstep(c.position.distanceTo(camera.position), 2.5, 6);
            });
        }

        if (sulco.current) sulco.current.visible = t > 10.45;
        // lascas de madeira e feno voando no baque, com gravidade
        if (lascas.current) {
            lascas.current.visible = pq > 0 && pq < 2;
            lascas.current.children.forEach((c, i) => {
                const a = i * 2.4, v = 3 + (i % 5);
                c.position.set(-2.2 + Math.cos(a) * v * pq * .6, 1.4 + v * pq - 4.9 * pq * pq, 33.4 + Math.sin(a) * v * pq * .6);
                c.rotation.set(pq * (5 + i), pq * 3, i);
            });
        }
        // ── A CÂMERA: um plano só, que muda de lugar sem cortar ──────────
        tmp.lado.crossVectors(tmp.tan, THREE.Object3D.DEFAULT_UP).normalize();
        const k1 = THREE.MathUtils.smoothstep(t, 3.4, 4.8);   // perseguição → lado (e segura de lado ~1,5 s)
        const k2 = THREE.MathUtils.smoothstep(t, 6.0, 8.6);   // lado → atrás e alto (revela a cidade)
        // Em pé a lente é estreita: tudo mais longe, e uma órbita lenta no
        // começo para o plano não ficar parado.
        const rr = size.width < size.height ? 1.45 : 1;
        const orbita = Math.min(t, 3.6) * .1;
        const atras = tmp.tan.clone().multiplyScalar(-7 * rr).addScaledVector(tmp.lado, 3 * rr + Math.sin(orbita) * 4).add(new THREE.Vector3(0, 2 * rr, 0));
        const deLado = tmp.lado.clone().multiplyScalar(8.5 * rr).addScaledVector(tmp.tan, 1).add(new THREE.Vector3(0, .8, 0));
        // perto o bastante para o avião continuar sendo o assunto do plano
        const revela = tmp.tan.clone().multiplyScalar(-13 * rr).add(new THREE.Vector3(0, 6.5 * rr, 0));
        tmp.cam.copy(atras).lerp(deLado, k1).lerp(revela, k2).add(pos);
        // ── O POUSO: UM SÓ MOVIMENTO ATÉ O PLANO HERÓI ──────────────────
        // Da perseguição a câmera desce, numa curva só (smootherstep de 1,6 s),
        // até um três-quartos baixo dos destroços no feno. Sem dois alvos
        // encadeados e sem troca de lente brusca: era isso que lia como salto.
        // persegue até o impacto; no baque segura parado 0,3 s; depois um
        // empurrão lento de 1,5 s até o plano herói
        const pouso = t < 10.45 ? smoother((t - 9.4) / 1.05) * .55 : .55 + .45 * smoother((t - 10.75) / 1.5);
        tmp.cam.lerp(HEROI, pouso);
        // o motor morrendo e o baque tremem o quadro
        const tranco = Math.max(0, 1 - Math.abs(t - 5.05) / .18) + Math.max(0, 1 - Math.abs(t - 10.45) / .3) * 1.6;
        tmp.cam.x += Math.sin(t * 91) * tranco * .35; tmp.cam.y += Math.cos(t * 77) * tranco * .25;
        camera.position.lerp(tmp.cam, 1 - Math.exp(-dt * 3.2));
        // o olhar: o avião, e no mergulho metade do olhar vai para a cidade
        tmp.olho.copy(pos).lerp(new THREE.Vector3(0, 0, 8), k2 * .4 * (1 - pouso)).lerp(DESTROCOS, pouso);
        olhar.current.lerp(tmp.olho, 1 - Math.exp(-dt * 6));
        camera.lookAt(olhar.current);
        // durante o rádio: a câmera chega perto aos poucos e rola de leve
        if (t < 5.2) camera.rotateZ(Math.sin(t * .8) * .045 * THREE.MathUtils.smoothstep(t, .5, 2.5));
        // Rede de segurança do enquadramento: se o avião escapa para a borda
        // (a lente é estreita em pé), o olhar puxa de volta para ele.
        if (t < 10.45) {
            camera.updateMatrixWorld();
            const ndc = pos.clone().project(camera);
            const fuga = Math.max(0, Math.abs(ndc.x) - .4, Math.abs(ndc.y) - .6);
            if (fuga > 0 || ndc.z > 1) { olhar.current.lerp(pos, Math.min(1, fuga * 2 + (ndc.z > 1 ? 1 : 0))); camera.lookAt(olhar.current); }
        }
        if (import.meta.env.DEV) (window as unknown as { __f13cam?: unknown }).__f13cam = { cam: camera.position.toArray(), aviao: pos.toArray(), olhar: olhar.current.toArray(), t };
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = 56 - 5 * THREE.MathUtils.smoothstep(t, .5, 4.5) + 13 * THREE.MathUtils.smoothstep(t, 6.4, 8.4) - 6 * THREE.MathUtils.smoothstep(t, 7.6, 10.2) - 8 * smoother((t - 10.75) / 1.5);
            camera.updateProjectionMatrix();
        }
    });

    return <group>
        <group ref={aviao}>
            <group ref={balanco} rotation={[0, Math.PI, 0]}>
                <CascoDoElevador aberturaRef={abertura} heliceRef={helice} />
                <group position={[0, -.44, .25]} scale={.46}><Avatar64 refs={refs} /></group>
            </group>
        </group>
        <group ref={fumaca}>
            {puffs.current.map((_, i) => <sprite key={i} visible={false} material={matFumaca(i)} />)}
        </group>
        {/* o sulco que o avião abriu na grama */}
        <mesh ref={sulco} position={[.2, .03, 35.2]} rotation={[-Math.PI / 2, 0, .9]} visible={false}>
            <planeGeometry args={[1.6, 5]} /><meshStandardMaterial map={texturaDoSulco()} roughness={1} transparent depthWrite={false} />
        </mesh>
        <group ref={lascas} visible={false}>
            {Array.from({ length: 18 }, (_, i) => <mesh key={i}><boxGeometry args={[.08, .04, .35]} /><meshStandardMaterial color={i % 3 ? '#8a6440' : '#d9b85a'} /></mesh>)}
        </group>
        <group ref={poeira} visible={false}>
            {Array.from({ length: 16 }, (_, i) => <sprite key={i} material={matPoeira(i)} />)}
        </group>
    </group>;
};

// ═══ O JOGADOR ═══════════════════════════════════════════════════════════════
/** Obstáculos redondos: casas, forja, templo, poço, barracas. */
const OBSTACULOS: ReadonlyArray<{ x: number; z: number; r: number }> = Object.freeze([
    ...LUGAR_DAS_CASAS.map((l) => ({ x: l.x, z: l.z, r: 2.6 })),
    { x: -7.5, z: 4, r: 2.4 }, { x: 7.8, z: 12.5, r: 2.4 },
    { x: 0, z: 8, r: 1.4 }, { x: 4.2, z: 1.5, r: .7 },
    { x: -6, z: 12, r: 1 }, { x: -3.2, z: 14, r: 1 }, { x: 6, z: 11, r: 1 },
    { x: -23, z: 4.5 - 1.5, r: 1.1 },
    { x: SINO.x, z: SINO.z, r: 1.3 }, { x: -2, z: 33, r: 1.3 },
]);

const Jogador: React.FC<{
    jog: React.MutableRefObject<Jog>;
    entrada: React.MutableRefObject<{ x: number; z: number }>;
    yaw: React.MutableRefObject<number>;
    ativo: boolean;
}> = ({ jog, entrada, yaw, ativo }) => {
    const refs = useAvatarRefs();
    const g = useRef<THREE.Group>(null);
    const ultimoPasso = useRef(false);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, .05), j = jog.current, t = clock.elapsedTime;
        const o = g.current; if (!o) return;
        let mx = 0, mz = 0;
        if (ativo && j.levantando <= 0) {
            const e = entrada.current, s = Math.sin(yaw.current), c = Math.cos(yaw.current);
            // direita da câmera = (cos, -sen); frente = (-sen, -cos); tela para baixo = para trás
            mx = e.x * c + e.z * s; mz = -e.x * s + e.z * c;
        }
        const n = Math.hypot(mx, mz);
        const vel = 4.2;
        if (n > .05) {
            const k = Math.min(1, n);
            let nx = j.x + mx / n * vel * k * dt, nz = j.z + mz / n * vel * k * dt;
            for (const ob of OBSTACULOS) {
                const dx = nx - ob.x, dz = nz - ob.z, d = Math.hypot(dx, dz), r = ob.r + .35;
                if (d < r && d > 1e-4) { nx = ob.x + dx / d * r; nz = ob.z + dz / d * r; }
            }
            j.x = nx; j.z = nz;
            let da = Math.atan2(mx, mz) - j.ang;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            j.ang += da * Math.min(1, dt * 12);
            j.andando = Math.min(1, j.andando + dt * 6);
            // um som por passo: a fase do ciclo cruzando zero
            const fase = Math.sin(t * 9);
            if ((fase > 0) !== ultimoPasso.current) {
                ultimoPasso.current = fase > 0;
                const naIlha = ILHAS_R.some((il) => Math.hypot(j.x - il.x, j.z - il.z) <= il.r);
                tocarPasso(!naIlha);
            }
        } else j.andando = Math.max(0, j.andando - dt * 6);
        // ── O CHÃO: ilha, ponte ou céu ───────────────────────────────────
        const chao = chaoEm(j.x, j.z);
        if (chao !== null && j.y <= chao + .6) {
            j.y += (chao - j.y) * Math.min(1, dt * 14); j.vy = 0;
            j.seguro = { x: j.x, z: j.z };
        } else {
            j.vy -= 22 * dt; j.y += j.vy * dt;
            if (j.y < -14) { j.x = j.seguro.x; j.z = j.seguro.z; j.y = (chaoEm(j.x, j.z) ?? 0) + 2; j.vy = 0; }
        }
        if (j.levantando > 0) j.levantando = Math.max(0, j.levantando - dt * .9);
        o.position.set(j.x, j.y, j.z);
        o.rotation.set(-j.levantando * 1.35, j.ang, 0);
        const f = t * 9, a = j.andando;
        const set = (r: React.MutableRefObject<THREE.Group | null>, v: number) => { if (r.current) r.current.rotation.x = v; };
        set(refs.legL, Math.sin(f) * .8 * a); set(refs.legR, -Math.sin(f) * .8 * a);
        set(refs.armL, -Math.sin(f) * .6 * a); set(refs.armR, Math.sin(f) * .6 * a);
        if (refs.body.current) refs.body.current.position.y = Math.abs(Math.sin(f)) * .06 * a;
    });
    return <group ref={g} visible={false}><Avatar64 refs={refs} /></group>;
};

/** Câmera de terceira pessoa: atrás e acima, girando com o dedo direito. */
const CameraDeExplorar: React.FC<{
    jog: React.MutableRefObject<Jog>; yaw: React.MutableRefObject<number>; ativo: boolean;
    foco: React.MutableRefObject<THREE.Vector3 | null>;
    portaAlvo: React.MutableRefObject<THREE.Vector3 | null>;
    portaFrente: React.MutableRefObject<THREE.Vector3 | null>;
}> = ({ jog, yaw, ativo, foco, portaAlvo, portaFrente }) => {
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const alvo = useRef(new THREE.Vector3());
    const empurra = useRef(0);
    const empurraPorta = useRef(0);
    const olharPorta = useRef(new THREE.Vector3());
    useFrame((_, dt) => {
        if (!ativo) return;
        const j = jog.current;
        if (portaAlvo.current) {
            if (empurraPorta.current === 0) olharPorta.current.copy(alvo.current);
            // a porta abre: a câmera entra devagar, olhando para a luz de dentro
            const [porta, frente] = [portaAlvo.current, portaFrente.current!];
            // travada: 3 m à frente da porta, na altura do olho, e só então
            // um empurrão lento para dentro (nada de vir de onde estava e
            // atravessar telhado)
            empurraPorta.current = Math.min(1, empurraPorta.current + dt * .25);
            // desliza até a moldura da porta (0,8 s) em vez de saltar para ela
            // 4 m, na altura do olho, levemente de baixo: o beiral sai do quadro
            const quer = porta.clone().addScaledVector(frente, 4 - empurraPorta.current * 2).add(new THREE.Vector3(0, .7, 0));
            camera.position.lerp(quer, 1 - Math.exp(-dt * 5));
            olharPorta.current.lerp(porta, 1 - Math.exp(-dt * 6));
            camera.lookAt(olharPorta.current);
            return;
        }
        const retrato = size.width < size.height;
        const dist = retrato ? 9.5 : 7.5, alto = retrato ? 7.2 : 3.8;
        // câmera de ombro: o jogador fica um pouco à esquerda, o mundo no centro
        const ombro = foco.current ? 0 : .9;
        // mira 2 m à frente do jogador: ele desce para o terço de baixo e o caminho aparece
        const quer = new THREE.Vector3(j.x + Math.cos(yaw.current) * ombro - Math.sin(yaw.current) * (foco.current ? 0 : 2), j.y + 2.2, j.z - Math.sin(yaw.current) * ombro - Math.cos(yaw.current) * (foco.current ? 0 : 2));
        // Numa conversa, o olhar vai para o meio entre o jogador e quem fala, e
        // a câmera dá a volta para o lado: por trás do jogador, quem fala
        // ficava escondido atrás dele.
        if (foco.current) {
            quer.lerp(foco.current, entidadeNaCena.valor ? .85 : .5);
            let quero = Math.atan2(j.x - foco.current.x, j.z - foco.current.z) + (entidadeNaCena.valor ? 1.3 : .75);
            let d = quero - yaw.current;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            quero = yaw.current + d;
            yaw.current += (quero - yaw.current) * Math.min(1, dt * 2.5);
        }
        alvo.current.lerp(quer, 1 - Math.exp(-dt * 6));
        // na entidade, a câmera se aproxima devagar e entorta alguns graus
        empurra.current = entidadeNaCena.valor ? Math.min(1, empurra.current + dt * .12) : 0;
        const k = entidadeNaCena.valor ? .6 - empurra.current * .3 : 1;
        const pos = new THREE.Vector3(j.x + Math.sin(yaw.current) * dist * k + Math.cos(yaw.current) * ombro, j.y + alto * k, j.z + Math.cos(yaw.current) * dist * k - Math.sin(yaw.current) * ombro);
        camera.position.lerp(pos, 1 - Math.exp(-dt * 5));
        camera.lookAt(alvo.current);
        if (entidadeNaCena.valor) camera.rotateZ(.055 * Math.min(1, empurra.current * 3));
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += ((retrato ? 60 : 55) - camera.fov) * Math.min(1, dt * 3);
            camera.updateProjectionMatrix();
        }
    });
    return null;
};

/** Acha o que está ao alcance e avisa quando muda. */
const Radar: React.FC<{
    jog: React.MutableRefObject<Jog>; est: React.MutableRefObject<ReturnType<typeof novoEstado13>>;
    ativo: boolean; aoMudar: (a: Alvo | null) => void; aoEntidade: () => void;
}> = ({ jog, est, ativo, aoMudar, aoEntidade }) => {
    const ultimo = useRef('');
    useFrame(() => {
        if (!ativo) return;
        const j = jog.current, e = est.current;
        const perto = (x: number, z: number, r: number) => Math.hypot(j.x - x, j.z - z) < r;
        const hl = LUGAR_DOS_NPCS.halvard;
        let achou: Alvo | null = null, melhor = Infinity;
        const tenta = (a: Alvo, x: number, z: number, r: number) => {
            const d = Math.hypot(j.x - x, j.z - z);
            if (d < r && d < melhor) { melhor = d; achou = a; }
        };
        for (const [id, l] of Object.entries(LUGAR_DOS_NPCS) as [IdNpc, { x: number; z: number; ronda?: number }][]) {
            if (id === 'halvard' && e.entidade === 'caido') continue;
            if (l.ronda) {
                // a menina corre em volta do poço: acha pela posição de agora
                const a = performance.now() / 1000 * .45;
                tenta({ tipo: 'npc', id }, l.x + Math.cos(a) * l.ronda, l.z + Math.sin(a) * l.ronda, 2.4);
            } else tenta({ tipo: 'npc', id }, l.x, l.z, 2.3);
        }
        if (!e.temMartelo) tenta({ tipo: 'martelo' }, MARTELO.x, MARTELO.z, 1.8);
        OVELHAS.forEach((o, i) => { if (!e.ovelhas[i]) tenta({ tipo: 'ovelha', i }, o.x, o.z, 1.9); });
        tenta({ tipo: 'sino' }, SINO.x, SINO.z, 2.4);
        CASAS.forEach((_, i) => { const p = portaDaCasa(i); tenta({ tipo: 'casa', i }, p.x, p.z, 1.9); });
        const k = chaveDoAlvo(achou);
        if (k !== ultimo.current) { ultimo.current = k; aoMudar(achou); }
    });
    return null;
};

/** O martelo no chão da ilha do pouso, brilhando de leve. */
const Martelo: React.FC<{ visivel: boolean }> = ({ visivel }) => {
    const g = useRef<THREE.Group>(null);
    useFrame(({ clock }) => { if (g.current) { g.current.rotation.y = clock.elapsedTime; g.current.position.y = .35 + Math.sin(clock.elapsedTime * 2) * .08; } });
    if (!visivel) return null;
    return <group position={[MARTELO.x, 0, MARTELO.z]}>
        <group ref={g}>
            <mesh rotation={[0, 0, .3]}><boxGeometry args={[.08, .7, .08]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
            <mesh position={[-.1, .33, 0]} rotation={[0, 0, .3]}><boxGeometry args={[.36, .16, .18]} /><meshStandardMaterial color="#8a8f98" metalness={.8} roughness={.3} emissive="#ffcf7a" emissiveIntensity={.25} /></mesh>
        </group>
    </group>;
};

/** O que acontece a cada quadro no mundo, fora do React: olhares, sino, porta. */
const Vivo: React.FC<{
    jog: React.MutableRefObject<Jog>; npcVis: Record<IdNpc, React.MutableRefObject<EstadoVisualNpc>>;
    sinoRef: React.RefObject<THREE.Group | null>; balanco: React.MutableRefObject<number>;
    portaCerta: React.RefObject<THREE.Group | null>; abrindo: boolean;
}> = ({ jog, npcVis, sinoRef, balanco, portaCerta, abrindo }) => {
    const p = useMemo(() => new THREE.Vector3(), []);
    const tempoPorta = useRef(0);
    useFrame(({ clock }, dt) => {
        const j = jog.current;
        p.set(j.x, j.y, j.z);
        for (const n of NPCS) {
            const l = LUGAR_DOS_NPCS[n.id];
            npcVis[n.id].current.olharPara = Math.hypot(j.x - l.x, j.z - l.z) < 5 ? p : null;
        }
        if (sinoRef.current) {
            balanco.current = Math.max(0, balanco.current - dt * .35);
            sinoRef.current.rotation.x = Math.sin(clock.elapsedTime * 5.5) * .5 * balanco.current;
        }
        // a porta de latão se abre ao meio, como a de um elevador
        if (portaCerta.current && abrindo) {
            const luz = portaCerta.current.getObjectByName('luzDeDentro') as THREE.PointLight | undefined;
            if (luz) luz.intensity = Math.min(6, luz.intensity + dt * 3);
        }
        if (portaCerta.current && abrindo) portaCerta.current.children.forEach((c) => {
            if (c.name !== 'folha') return;
            // 0,4 s com a porta fechada (o ding), depois as folhas abrem em ~1,2 s
            tempoPorta.current += dt / 2;   // (o forEach roda duas folhas por quadro)
            if (tempoPorta.current < .4) return;
            const alvo = (c.userData.lado as number) * .78;
            c.position.x += (alvo - c.position.x) * Math.min(1, dt * 2.4);
        });
    });
    return null;
};

/**
 * O sol que faz sombra. Um mapa de 2048 cobrindo só 36 unidades em volta do
 * jogador, que anda junto com ele: sombra nítida onde se olha, custo fixo.
 */
const Sol: React.FC<{ jog: React.MutableRefObject<Jog> }> = ({ jog }) => {
    const luz = useRef<THREE.DirectionalLight>(null);
    const scene = useThree((s) => s.scene);
    const feito = useRef(0);
    useFrame((_, dt) => {
        const l = luz.current; if (!l) return;
        const j = jog.current;
        l.position.set(j.x - 30, j.y + 40, j.z - 20);
        l.target.position.set(j.x, j.y, j.z); l.target.updateMatrixWorld();
        // uma vez, depois que tudo montou: todo mundo projeta e recebe sombra
        feito.current += dt;
        if (feito.current > .5 && feito.current < 10) {
            scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (!m.isMesh || 'isInstancedMesh' in m || m.material instanceof THREE.ShaderMaterial || m.material instanceof THREE.MeshBasicMaterial) return;
                m.castShadow = true; m.receiveShadow = true;
            });
            feito.current = 10;
        }
    });
    return <directionalLight ref={luz} intensity={2.8} color="#ffd9a0" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-.0004}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18}
        shadow-camera-near={1} shadow-camera-far={120} />;
};

/**
 * Reflexo de ambiente: o céu de Vindhjem (azul em cima, âmbar no horizonte,
 * terra embaixo) vira um mapa PMREM. Sem ele todo metal refletia preto e o
 * elmo de ferro lia como um aquário de vidro.
 */
const Ambiente: React.FC = () => {
    const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene);
    useEffect(() => {
        const cena = new THREE.Scene();
        const geo = new THREE.SphereGeometry(10, 32, 16);
        const cor = new Float32Array(geo.getAttribute('position').count * 3);
        const alto = new THREE.Color('#8fb6e0'), meio = new THREE.Color('#f3d6ae'), baixo = new THREE.Color('#5a4a38'), c = new THREE.Color();
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
            const y = p.getY(i) / 10;
            if (y > 0) c.copy(meio).lerp(alto, Math.min(1, y * 1.6)); else c.copy(meio).lerp(baixo, Math.min(1, -y * 2.5));
            cor.set([c.r, c.g, c.b], i * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
        cena.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
        const pm = new THREE.PMREMGenerator(gl);
        const alvo = pm.fromScene(cena, .04);
        const antes = scene.environment;
        scene.environment = alvo.texture; scene.environmentIntensity = .7;
        pm.dispose(); geo.dispose();
        return () => { scene.environment = antes; alvo.dispose(); };
    }, [gl, scene]);
    return null;
};

// ═══ O ANDAR ═════════════════════════════════════════════════════════════════
export const Floor13: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const est = useRef(novoEstado13());
    const [, bump] = useReducer((x: number) => x + 1, 0);
    const [fase, setFase] = useState<Fase>('queda');
    const tQueda = useRef(0);
    const [legenda, setLegenda] = useState(LEGENDAS_DA_QUEDA[0].texto);
    const [flash, setFlash] = useState(0);
    const jog = useRef<Jog>({ x: INICIO.x, y: 0, z: INICIO.z, ang: Math.PI, vy: 0, seguro: { ...INICIO }, levantando: 1, andando: 0 });
    const entrada = useRef({ x: 0, z: 0 });
    const yaw = useRef(0);
    const foco = useRef<THREE.Vector3 | null>(null);
    const portaAlvo = useRef<THREE.Vector3 | null>(null);
    const portaFrente = useRef<THREE.Vector3 | null>(null);
    const [alvo, setAlvo] = useState<Alvo | null>(null);
    const [falas, setFalas] = useState<Fala[] | null>(null);
    const [linha, setLinha] = useState(0);
    const [digitado, setDigitado] = useState(0);
    const [glitch, setGlitch] = useState(false);
    const [conexao, setConexao] = useState(false);
    const aoFimDoDialogo = useRef<(() => void) | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const achadas = useMemo(() => OVELHAS.map(() => ({ current: false })), []);
    const npcVis = useMemo(() => Object.fromEntries(NPCS.map((n) => [n.id, { current: { olharPara: null, falando: false, possessao: 0, caido: false } as EstadoVisualNpc }])) as Record<IdNpc, React.MutableRefObject<EstadoVisualNpc>>, []);
    const sinoRef = useRef<THREE.Group>(null), portaCerta = useRef<THREE.Group>(null);
    const balancoDoSino = useRef(0);
    const falando = useRef<IdNpc | null>(null);
    const estadoDoHospede = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });

    // Bancada (só em DEV): `window.__f13` teleporta, dá pistas e lê o estado.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as unknown as { __f13?: unknown }).__f13 = {
            ir: (x: number, z: number, ang = 0, yawCam = ang) => { const j = jog.current; j.x = x; j.z = z; j.y = chaoEm(x, z) ?? 0; j.ang = ang; yaw.current = yawCam; j.levantando = 0; },
            estado: () => est.current,
            pistas: (...p: Pista[]) => { p.forEach((x) => est.current.pistas.add(x)); bump(); },
            pular: () => { tQueda.current = DURACAO_DA_QUEDA; },
            casaCerta: () => { const p = portaDaCasa(CASA_CERTA), l = LUGAR_DAS_CASAS[CASA_CERTA]; const j = jog.current; j.x = p.x; j.z = p.z; j.y = chaoEm(p.x, p.z) ?? 3; j.ang = l.angulo + Math.PI; yaw.current = l.angulo; j.levantando = 0; },
        };
    }, []);

    // ── A QUEDA: relógio, legendas, sons e o pulo ────────────────────────
    useEffect(() => {
        tocarVento();
        let raf = 0, antes = performance.now();
        const marcos = { tosse: false, morre: false, baque: false };
        const passo = () => {
            const agora = performance.now();
            tQueda.current += Math.min(.1, (agora - antes) / 1000); antes = agora;
            if (import.meta.env.DEV && tFixo !== null) tQueda.current = tFixo;
            const t = tQueda.current;
            setLegenda(LEGENDAS_DA_QUEDA.find((l) => t < l.ate)!.texto);
            if (t > 2.6 && !marcos.tosse) { marcos.tosse = true; tocarMotorTossindo(); }
            if (t > 5.0 && !marcos.morre) { marcos.morre = true; tocarMotorMorrendo(); }
            if (t > 10.4 && !marcos.baque) { marcos.baque = true; tocarQueda(); }
            setFlash(t > 10.4 ? Math.max(0, .35 - (t - 10.4) / .25) : 0);
            if (t >= DURACAO_DA_QUEDA) { setFase('explorar'); setFlash(0); tocarAmbiente(); return; }
            raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
        const pular = () => { if (tQueda.current > .5 && tQueda.current < 10.3) tQueda.current = 10.3; };
        window.addEventListener('pointerdown', pular); window.addEventListener('keydown', pular);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('pointerdown', pular); window.removeEventListener('keydown', pular); pararVento(); pararAmbiente(); };
    }, []);

    // ── DIÁLOGO ──────────────────────────────────────────────────────────
    const abrirDialogo = useCallback((f: Fala[], quem: IdNpc | null, fim?: () => void) => {
        if (!f.length) { fim?.(); return; }
        setFalas(f); setLinha(0); setDigitado(0); setFase('dialogo');
        falando.current = quem;
        if (quem) {
            const l = LUGAR_DOS_NPCS[quem];
            foco.current = new THREE.Vector3(l.x, (chaoEm(l.x, l.z) ?? 0) + 1.6, l.z);
            npcVis[quem].current.falando = true;
        }
        aoFimDoDialogo.current = fim ?? null;
        tocarFala(f[0].quem);
    }, [npcVis]);

    const fecharDialogo = useCallback(() => {
        if (falando.current) npcVis[falando.current].current.falando = false;
        falando.current = null; foco.current = null;
        setFalas(null); setGlitch(false);
        setFase((f) => (f === 'dialogo' ? 'explorar' : f));
        const fim = aoFimDoDialogo.current; aoFimDoDialogo.current = null;
        fim?.();
        bump();
    }, [npcVis]);

    // o texto aparece letra a letra
    useEffect(() => {
        if (!falas) return;
        const total = falas[linha].texto.length;
        if (digitado >= total) return;
        const id = window.setTimeout(() => setDigitado((d) => Math.min(total, d + 2)), glitch ? 22 : 16);
        return () => window.clearTimeout(id);
    }, [falas, linha, digitado, glitch]);

    const avancar = useCallback(() => {
        if (!falas) return;
        const total = falas[linha].texto.length;
        if (digitado < total) { setDigitado(total); return; }
        if (glitch && linha === falas.length - 1) return;   // a entidade não deixa pular o corte
        if (linha < falas.length - 1) {
            setLinha(linha + 1); setDigitado(0);
            if (glitch) tocarGlitch(); else tocarFala(falas[linha + 1].quem);
        } else fecharDialogo();
    }, [falas, linha, digitado, glitch, fecharDialogo]);

    // a última fala da entidade: quando termina de digitar, a conexão cai
    useEffect(() => {
        if (!glitch || !falas || linha !== falas.length - 1) return;
        if (digitado < falas[linha].texto.length) return;
        const id = window.setTimeout(() => {
            tocarDesconexao(); setConexao(true); pararAmbiente(); window.setTimeout(() => tocarAmbiente(), 4200);
            const h = npcVis.halvard.current;
            h.possessao = 0; h.caido = true;
            window.setTimeout(() => tocarCorpoCaindo(), 820);
            est.current.entidade = 'caido';
            // o preto dura pouco: a queda dele TEM de ser vista
            window.setTimeout(() => setConexao(false), 800);
            window.setTimeout(() => { entidadeNaCena.valor = false; fecharDialogo(); setAviso('Halvard caiu duro. Ninguém em volta parece notar.'); }, 3800);
        }, 350);
        return () => window.clearTimeout(id);
    }, [glitch, falas, linha, digitado, npcVis, fecharDialogo]);

    const comecarEntidade = useCallback(() => {
        if (est.current.entidade !== 'nao') return;
        est.current.entidade = 'falando';
        npcVis.halvard.current.possessao = 1;
        entidadeNaCena.valor = true;
        tocarGlitch();
        setGlitch(true);
        abrirDialogo([...ENTIDADE], 'halvard');
    }, [npcVis, abrirDialogo]);

    // ── AÇÃO ─────────────────────────────────────────────────────────────
    const agir = useCallback(() => {
        const a = alvo, e = est.current;
        if (!a || fase !== 'explorar') return;
        const antes = new Set(e.pistas);
        const avisarPista = () => {
            const nova = [...e.pistas].find((p) => !antes.has(p));
            if (nova) setAviso(`PISTA: ${PISTAS[nova].nome}`);
        };
        if (a.tipo === 'npc') {
            // Halvard, com duas pistas já ditas, não é mais Halvard.
            if (a.id === 'halvard' && entidadeAcorda(e)) { comecarEntidade(); return; }
            abrirDialogo(falarCom(e, a.id), a.id, avisarPista);
        } else if (a.tipo === 'martelo') {
            pegarMartelo(e); tocarPegar(); setAviso('Você pegou o martelo de Brokk.'); setAlvo(null);
        } else if (a.tipo === 'ovelha') {
            acharOvelha(e, a.i); achadas[a.i].current = true; tocarBalido();
            setAviso(`Ovelha achada (${e.ovelhas.filter(Boolean).length}/3). Ela volta sozinha para a Sigrun.`); setAlvo(null);
        } else if (a.tipo === 'sino') {
            marcarSino(e); tocarSino(); balancoDoSino.current = 1; setAviso('O sino ecoa por Vindhjem.');
        } else if (a.tipo === 'casa') {
            const r = baterNaCasa(e, a.i);
            if (r.certa) {
                tocarDingDaCasa(); setFase('elevador'); setAviso(null);
                {
                    // a porta (no centro da folha) e a direção para fora dela
                    // a posição REAL da porta no mundo (as casas têm torção e escala próprias)
                    const pc = portaCerta.current;
                    if (pc) {
                        pc.updateWorldMatrix(true, false);
                        portaAlvo.current = pc.getWorldPosition(new THREE.Vector3());
                        portaFrente.current = pc.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
                    } else {
                        const l = LUGAR_DAS_CASAS[a.i];
                        portaFrente.current = new THREE.Vector3(Math.sin(l.angulo), 0, Math.cos(l.angulo));
                        portaAlvo.current = new THREE.Vector3(l.x, l.y + .8, l.z).addScaledVector(portaFrente.current, 2.85);
                    }
                }
                window.setTimeout(() => onExit?.(), 6500);
            } else abrirDialogo(r.falas, null);
        }
        bump();
    }, [alvo, fase, abrirDialogo, achadas, onExit, comecarEntidade]);

    useEffect(() => { if (!aviso) return; const id = window.setTimeout(() => setAviso(null), 3200); return () => window.clearTimeout(id); }, [aviso]);

    // ── ENTRADA: teclado, joystick à esquerda, câmera à direita ──────────
    useEffect(() => {
        const teclas = new Set<string>();
        const atualizar = () => {
            if (toque.current.id !== null) return;
            const x = (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
            const z = (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0) - (teclas.has('w') || teclas.has('arrowup') ? 1 : 0);
            entrada.current = { x, z };
        };
        const down = (ev: KeyboardEvent) => {
            const k = ev.key.toLowerCase(); teclas.add(k); atualizar();
            if (k === 'e' || k === ' ' || k === 'enter') { ev.preventDefault(); acao.current(); }
            if (k === 'q') yaw.current += .3;
        };
        const up = (ev: KeyboardEvent) => { teclas.delete(ev.key.toLowerCase()); atualizar(); };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);
    const acao = useRef<() => void>(() => { });
    acao.current = () => { if (fase === 'dialogo') avancar(); else agir(); };

    const toque = useRef<{ id: number | null; ox: number; oy: number; cam: number | null; cx: number }>({ id: null, ox: 0, oy: 0, cam: null, cx: 0 });
    const [jaAndou, setJaAndou] = useState(false);
    useEffect(() => { if (fase !== 'explorar') return; const id = window.setTimeout(() => setJaAndou(true), 6000); return () => window.clearTimeout(id); }, [fase]);
    const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
    const onDown = (ev: React.PointerEvent) => {
        if (fase !== 'explorar') return;
        const w = window.innerWidth;
        if (ev.clientX < w * .55 && toque.current.id === null) {
            toque.current.id = ev.pointerId; toque.current.ox = ev.clientX; toque.current.oy = ev.clientY;
            setStick({ ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 });
        } else if (toque.current.cam === null) { toque.current.cam = ev.pointerId; toque.current.cx = ev.clientX; }
    };
    const onMove = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) {
            let dx = ev.clientX - t.ox, dy = ev.clientY - t.oy;
            const d = Math.hypot(dx, dy), R = 60;
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            entrada.current = { x: dx / R, z: dy / R };
            if (!jaAndou && d > 20) setJaAndou(true);
            setStick({ ox: t.ox, oy: t.oy, x: dx, y: dy });
        } else if (ev.pointerId === t.cam) {
            yaw.current -= (ev.clientX - t.cx) * .008; t.cx = ev.clientX;
        }
    };
    const onUp = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) { t.id = null; entrada.current = { x: 0, z: 0 }; setStick(null); }
        if (ev.pointerId === t.cam) t.cam = null;
    };

    const e = est.current;
    const retrato = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    const rotuloDoAlvo = (a: Alvo) => a.tipo === 'npc' ? `FALAR · ${NPCS.find((n) => n.id === a.id)!.nome.toUpperCase()}`
        : a.tipo === 'martelo' ? 'PEGAR MARTELO' : a.tipo === 'ovelha' ? 'CHAMAR OVELHA' : a.tipo === 'sino' ? 'TOCAR O SINO'
        : `BATER · CASA ${CASAS[a.i].runa}`;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#5f97d1', touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <Canvas style={{ position: 'absolute', inset: 0 }} dpr={[1, 1.25]} shadows
                camera={{ fov: 52, near: .1, far: 900, position: [90, 38, 135] }}
                onCreated={({ scene }) => { scene.fog = new THREE.Fog('#e9d2b0', 70, 330); }}>
                <hemisphereLight args={['#dfe9f5', '#6b5a44', .7]} />
                {/* contraluz fria: separa as silhuetas do chão verde */}
                <directionalLight position={[40, 18, 70]} intensity={.5} color="#a9c8ff" />
                <Sol jog={jog} />
                <directionalLight position={[40, 20, 60]} intensity={.3} color="#9ec3ff" />
                <Ambiente />
                <Floor13Mundo portaCertaRef={portaCerta} sinoRef={sinoRef} />
                {NPCS.map((n) => {
                    const l = LUGAR_DOS_NPCS[n.id];
                    if (glitch && n.id !== 'halvard' && Math.hypot(jog.current.x - l.x, jog.current.z - l.z) < 7) return null;
                    return <Viking key={n.id} ficha={n} x={l.x} y={chaoEm(l.x, l.z) ?? 0} z={l.z} ronda={l.ronda} estado={npcVis[n.id]} tique={n.id === 'halvard' && e.entidade === 'nao' && entidadeAcorda(e)}
                        marca={!e.conversou.has(n.id) && n.id !== 'halvard' ? (['ragnhild', 'ulfgar', 'eira'].includes(n.id) ? '!' : '?') : null} />;
                })}
                {OVELHAS.map((o, i) => <Ovelha key={i} x={o.x} y={chaoEm(o.x, o.z) ?? 0} z={o.z} achadaRef={achadas[i]} />)}
                <Martelo visivel={!e.temMartelo} />
                {fase === 'queda'
                    ? <CenaDaQueda tRef={tQueda} />
                    : <>
                        <Jogador jog={jog} entrada={entrada} yaw={yaw} ativo={fase === 'explorar'} />
                        {fase !== 'elevador' && <Viking ficha={HOSPEDE} x={0} y={0} z={0} estado={estadoDoHospede} controle={jog} />}
                    </>}
                <CameraDeExplorar jog={jog} yaw={yaw} ativo={fase !== 'queda'} foco={foco} portaAlvo={portaAlvo} portaFrente={portaFrente} />
                <Radar jog={jog} est={est} ativo={fase === 'explorar'} aoMudar={setAlvo} aoEntidade={comecarEntidade} />
                <Vivo jog={jog} npcVis={npcVis} sinoRef={sinoRef} balanco={balancoDoSino} portaCerta={portaCerta} abrindo={fase === 'elevador'} />
                <EffectComposer multisampling={0}>
                    <Bloom mipmapBlur intensity={.7} luminanceThreshold={1.3} luminanceSmoothing={.2} />
                    {/* a entidade drena a cor do mundo e suja a imagem */}
                    <HueSaturation saturation={glitch ? -.65 : 0} />
                    <ChromaticAberration offset={glitch ? new THREE.Vector2(.004, .002) : new THREE.Vector2(0, 0)} />
                    <Noise opacity={glitch ? .06 : 0} />
                    <Vignette eskil={false} offset={.3} darkness={glitch ? .75 : .45} />
                    <BrightnessContrast brightness={-.02} contrast={.12} />
                </EffectComposer>
            </Canvas>

            {/* ── A QUEDA: legenda e o clarão do baque ── */}
            {fase === 'queda' && <div style={{ ...t13, ...(legenda.startsWith('TROCO') ? {} : { fontFamily: 'Georgia, serif', letterSpacing: 3 }), position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 12px calc(env(safe-area-inset-bottom) + 14px)', textAlign: 'center', fontSize: 'clamp(14px, 2.6vh, 19px)', background: 'linear-gradient(0deg, rgba(8,16,22,.7), rgba(8,16,22,0))', pointerEvents: 'none' }}>
                {legenda}
                {tQueda.current < 2.5 && <div style={{ fontSize: '.7em', opacity: .8, marginTop: 4 }}>toque para pular</div>}
            </div>}
            {flash > 0 && <div style={{ position: 'absolute', inset: 0, background: '#fffaf0', opacity: flash, pointerEvents: 'none' }} />}

            {/* ── HUD: pistas e buscas ── */}
            {fase !== 'queda' && fase !== 'elevador' && !glitch && <div style={{ ...t13, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', left: 10, fontSize: 14, fontFamily: 'Georgia, serif', color: '#2a1d14', textShadow: 'none', background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 10, padding: '6px 10px', boxShadow: '0 4px 12px rgba(0,0,0,.35)', pointerEvents: 'none', maxWidth: retrato ? '62vw' : 300 }}>
                <div style={{ color: '#7a2f1f', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>ᚨ A CASA CERTA</div>
                {e.pistas.size === 0 ? <div style={{ opacity: .7 }}>0/3 pistas — pergunte aos moradores</div> : (Object.keys(PISTAS) as Pista[]).map((p) => (
                    <div key={p} style={{ opacity: e.pistas.has(p) ? 1 : .5 }}>{ICONE_DA_PISTA[p]} {e.pistas.has(p) ? PISTAS[p].nome : 'uma pista a descobrir'}</div>
                ))}
                {BUSCAS.some((b) => e.buscas[b.id] !== 'nova') && <div style={{ color: '#7a2f1f', fontWeight: 700, letterSpacing: 1, margin: '6px 0 2px' }}>ᛒ BUSCAS</div>}
                {BUSCAS.filter((b) => e.buscas[b.id] !== 'nova').map((b) => (
                    <div key={b.id} style={{ opacity: e.buscas[b.id] === 'feita' ? .5 : 1, textDecoration: e.buscas[b.id] === 'feita' ? 'line-through' : 'none' }}>
                        {e.buscas[b.id] === 'pronta' ? '★' : '·'} {b.titulo}{b.id === 'ovelhas' && e.buscas[b.id] === 'ativa' ? ` (${e.ovelhas.filter(Boolean).length}/3)` : ''}
                    </div>
                ))}
            </div>}

            {aviso && <div style={{ ...t13, position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)', fontSize: 15, background: 'rgba(20,14,10,.78)', border: '2px solid #b8893a', borderRadius: 10, padding: '8px 14px', textAlign: 'center', maxWidth: '86vw', pointerEvents: 'none' }}>{aviso}</div>}

            {/* ── O BOTÃO DE AÇÃO ── */}
            {fase === 'explorar' && alvo && <button onPointerDown={(ev) => { ev.stopPropagation(); agir(); }}
                style={{ ...t13, position: 'absolute', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 26px)', fontSize: 15, color: '#fff', background: 'linear-gradient(180deg,#b8893a,#7a5520)', border: '3px solid #2a1d14', borderRadius: 14, padding: '12px 18px', cursor: 'pointer' }}>
                {rotuloDoAlvo(alvo)}
            </button>}

            {/* ── O JOYSTICK ── */}
            {stick && <div style={{ position: 'absolute', left: stick.ox - 60, top: stick.oy - 60, width: 120, height: 120, borderRadius: '50%', border: '3px solid rgba(255,227,160,.6)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 60 + stick.x - 24, top: 60 + stick.y - 24, width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,227,160,.55)' }} />
            </div>}
            {fase === 'explorar' && !jaAndou && !alvo && <div style={{ fontFamily: 'Georgia, serif', color: '#2a1d14', letterSpacing: .5, position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 14px)', textAlign: 'center', fontSize: 14, background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 999, padding: '6px 16px', whiteSpace: 'nowrap', opacity: .9, pointerEvents: 'none' }}>
                ◀ LADO ESQUERDO: ANDAR{retrato ? <br /> : ' · '}LADO DIREITO: GIRAR ▶
            </div>}

            {/* a faixa de baixo do cinemascope vem antes da caixa: fica por trás dela */}
            {glitch && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '9vh', background: '#000', pointerEvents: 'none', animation: 'f13barra .8s ease-out' }} />}
            {/* ── A CAIXA DE DIÁLOGO ── */}
            {falas && <div onPointerDown={(ev) => { ev.stopPropagation(); avancar(); }}
                style={{
                    position: 'absolute', left: 10, right: 10, bottom: 'calc(env(safe-area-inset-bottom) + 12px)', minHeight: 96,
                    background: glitch ? 'rgba(4,14,8,.93)' : 'linear-gradient(180deg,#efe0bf,#d9c399)', border: `3px solid ${glitch ? '#3dff8a' : '#6b4a2e'}`,
                    boxShadow: glitch ? '0 0 18px rgba(61,255,138,.35)' : '0 6px 18px rgba(0,0,0,.45), inset 0 0 24px rgba(107,74,46,.35)',
                    borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                    animation: glitch ? 'f13treme .18s steps(2) infinite' : undefined,
                }}>
                <div style={glitch ? { ...t13, fontSize: 13, color: '#3dff8a', marginBottom: 4 } : { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 15, color: '#7a2f1f', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>ᚱ {falas[linha].quem}</div>
                <div style={{ fontFamily: glitch ? 'monospace' : 'Georgia, serif', fontSize: 17, lineHeight: 1.4, color: glitch ? '#b8ffd2' : '#2a1d14' }}>
                    {falas[linha].texto.slice(0, digitado)}{glitch && linha === falas.length - 1 && digitado >= falas[linha].texto.length ? '█' : ''}
                </div>
                {!(glitch && linha === falas.length - 1) && <div style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 14, color: glitch ? '#3dff8a' : '#6b4a2e' }}>▶</div>}
            </div>}
            {glitch && <>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '9vh', background: '#000', pointerEvents: 'none', animation: 'f13barra .8s ease-out' }} />
                <style>{'@keyframes f13barra{from{height:0}}'}</style>
            </>}
            {glitch && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: .5,
                background: 'repeating-linear-gradient(0deg, rgba(61,255,138,.10) 0 2px, transparent 2px 4px)', animation: 'f13treme .3s steps(3) infinite' }}>
                <style>{'@keyframes f13treme{0%{transform:translate(0,0)}33%{transform:translate(-2px,1px)}66%{transform:translate(2px,-1px)}100%{transform:translate(0,0)}}'}</style>
            </div>}
            {conexao && <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontFamily: 'monospace', color: '#3dff8a', fontSize: 18, letterSpacing: 3 }}>{CONEXAO_ENCERRADA}</div>
            </div>}

            {/* ── A CASA CERTA: as portas abrem como as de um elevador ── */}
            {fase === 'elevador' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: 'f13branco 6.5s ease-in forwards', background: '#fff7e6' }}>
                <style>{'@keyframes f13branco{0%{opacity:0}85%{opacity:0}100%{opacity:1}}'}</style>
                <div style={{ ...t13, position: 'absolute', top: '44%', width: '100%', textAlign: 'center', fontSize: 20, color: '#7a5520', textShadow: 'none' }}>DING.</div>
            </div>}
        </div>
    );
};

export default Floor13;
