/**
 * f13Cabine.tsx — a cabine do biplano, vista pelos olhos do hóspede.
 *
 * A câmera da queda é a cabeça do piloto. Esta cabine é presa a ela (posição e
 * giro, quadro a quadro): o capô com a hélice à frente, o para-brisa curvo com
 * moldura de latão, a borda de couro, o painel de mogno com os relógios, as asas
 * com montantes e cabos nas laterais, e as MÃOS do hóspede no manche.
 *
 * ── TUDO AQUI É FUNÇÃO DE `t` ────────────────────────────────────────────────
 * A queda é gravada em vídeo, quadro a quadro, a partir desta cena. Nenhuma
 * peça pode depender de relógio de parede ou de delta: o mesmo `t` tem de dar
 * o mesmo quadro. A hélice, por exemplo, não soma `dt`: o ângulo dela é a
 * integral fechada da rotação (ver `anguloDaHelice`).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { texMostrador, texReflexoDoVidro } from './f13CabineTex';
import {
    CAPO, HELICE, MANCHE, PAINEL, PARABRISA, construirAsa, construirBorda, construirCabo, construirCapo, construirHelice, construirManche, construirMao,
    construirManga, construirMontante, construirParabrisa, construirPlaca, ligar, materiais,
} from './f13CabinePecas';

const liso = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A tossida do motor (0–1): pulsos de 1,4 Hz que crescem a partir de 2,6 s. A mesma que balança o casco. */
export const tosseDaQueda = (t: number) => t > 2.6 ? Math.max(0, Math.sin(t * 9)) * Math.min(1, (t - 2.6)) : 0;

// ═══ A HÉLICE, COMO FUNÇÃO DE t ══════════════════════════════════════════════
const W0 = 60;                                  // rad/s a todo vapor
/** Quanto do giro pleno a hélice ainda tem (1 até 5,0 s; morre linearmente em 1,5 s). Igual ao `helice` da cena. */
export const giroDaHelice = (t: number) => t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 1.5);
/** Ângulo (rad) da hélice: a integral exata de W0·giro(t), com a fase acertada para parar meio torta. */
export function anguloDaHelice(t: number): number {
    const fim = 1.5, total = W0 * (5 + fim / 2);                  // ∫ de 0 a 6,5 s
    const paraDe = .4;                                           // ângulo final (rad) de uma das pás em relação ao topo
    const fase = paraDe - (total % Math.PI);
    const x = Math.min(Math.max(0, t - 5), fim);
    return (t <= 5 ? W0 * t : W0 * (5 + x - x * x / (2 * fim))) + fase;
}

// ═══ O RELÓGIO ═══════════════════════════════════════════════════════════════
export const Relogio: React.FC<{ x: number; y?: number; r: number; rotulo: string; marcas: number; vermelho?: number; unidade?: string; agulha: React.RefObject<THREE.Group | null> }> = ({ x, y = 0, r, rotulo, marcas, vermelho, unidade, agulha }) => {
    const M = useMemo(() => materiais(), []);
    const reflexo = useMemo(() => texReflexoDoVidro(), []);
    return <group position={[x, y, .012]}>
        {/* a caixa do relógio, enterrada no painel */}
        <mesh position={[0, 0, -.012]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r * 1.04, r * 1.04, .03, 36]} /><meshStandardMaterial color="#1a1916" roughness={.6} metalness={.4} /></mesh>
        <mesh position={[0, 0, .004]}><circleGeometry args={[r, 48]} /><meshStandardMaterial map={texMostrador(rotulo, marcas, vermelho, unidade)} roughness={.55} metalness={0} /></mesh>
        {/* aro de latão e a flange de fixação com quatro parafusos */}
        <mesh position={[0, 0, .009]}><torusGeometry args={[r * 1.04, r * .13, 14, 56]} /><primitive object={M.latao} attach="material" /></mesh>
        <mesh position={[0, 0, .002]}><ringGeometry args={[r * 1.1, r * 1.36, 40]} /><primitive object={M.lataoVelho} attach="material" /></mesh>
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos(i * Math.PI / 2 + .785) * r * 1.24, Math.sin(i * Math.PI / 2 + .785) * r * 1.24, .0035]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r * .07, r * .07, .004, 10]} /><primitive object={M.acoEscuro} attach="material" /></mesh>)}
        <group ref={agulha} position={[0, 0, .0075]}>
            <mesh position={[0, r * .36, 0]}><boxGeometry args={[r * .065, r * .8, .0012]} /><meshStandardMaterial color="#f2e7cd" roughness={.5} /></mesh>
            <mesh position={[0, -r * .14, 0]}><boxGeometry args={[r * .07, r * .3, .0012]} /><meshStandardMaterial color="#f2e7cd" roughness={.5} /></mesh>
        </group>
        <mesh position={[0, 0, .0105]}><circleGeometry args={[r * .1, 16]} /><primitive object={M.latao} attach="material" /></mesh>
        {/* vidro abaulado: um brilho leve (céu) somado por cima */}
        <mesh position={[0, 0, .0125]} renderOrder={5}><circleGeometry args={[r * 1.0, 40]} /><meshBasicMaterial map={reflexo} transparent opacity={.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    </group>;
};

// ═══ A CABINE ════════════════════════════════════════════════════════════════
export const Cabine: React.FC<{
    tRef: React.MutableRefObject<number>;
    ajuste: React.MutableRefObject<(() => void) | null>;
    helice: React.MutableRefObject<number>;
}> = ({ tRef, ajuste, helice }) => {
    const M = useMemo(() => materiais(), []);
    const alt = useRef<THREE.Group>(null), rpm = useRef<THREE.Group>(null), oleo = useRef<THREE.Group>(null);
    const lampada = useRef<THREE.MeshStandardMaterial>(null);
    const raiz = useRef<THREE.Group>(null);
    const camera = useThree((st) => st.camera), size = useThree((st) => st.size);

    const pecas = useMemo(() => {
        const corpo = new THREE.Group();           // o que fica no eixo: capô, para-brisa, borda, hélice, montantes
        const capo = construirCapo(M), parabrisa = construirParabrisa(M), borda = construirBorda(M);
        const hel = construirHelice(M);
        corpo.add(capo, parabrisa, borda, hel.grupo);
        // asas: a estrutura inteira é espremida em x quando a tela é estreita
        const estrutura = new THREE.Group();
        const baixa = construirAsa(4.2, 1.6, -1.15, -.66, M, 'baixa');
        const alta = construirAsa(4.2, 1.6, -1.3, .62, M, 'alta');
        estrutura.add(baixa, alta);
        // montantes e cabos: posicionados quadro a quadro pelos extremos
        const barras: { m: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; rx: number; rz: number; sq: [boolean, boolean] }[] = [];
        const nova = (mat: 'montante' | 'cabo', a: [number, number, number], b: [number, number, number], rx: number, rz: number, sq: [boolean, boolean]) => {
            const m = mat === 'montante' ? construirMontante(M) : construirCabo(M);
            corpo.add(m);
            barras.push({ m, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), rx, rz, sq });
        };
        for (const s of [-1, 1]) {
            // montante da asa (fora, espremido): do topo da asa baixa ao fundo da alta
            nova('montante', [s * 1.25, -.56, -1.0], [s * 1.25, .58, -1.17], .014, .034, [true, true]);
            // montante da cabine (no eixo): do convés à asa alta, abrindo para cima
            nova('montante', [s * .2, -.14, -.97], [s * .36, .56, -1.26], .014, .034, [false, false]);
            // cabos de aço cruzados: do pé do montante de fora ao alto do da cabine, e do alto do de fora à base do da cabine
            nova('cabo', [s * 1.25, -.55, -1.0], [s * .36, .55, -1.26], .0032, .0032, [true, false]);
            nova('cabo', [s * 1.25, .55, -1.17], [s * .2, -.13, -.97], .0032, .0032, [true, false]);
        }
        // manche e mãos
        const manche = construirManche(M);
        const topo = manche.userData.topo as THREE.Group;
        const maos = ([-1, 1] as const).map((lado) => { const h = construirMao(M, lado); topo.add(h); return h; });
        const mangas = ([-1, 1] as const).map(() => construirManga(M));
        const fixos = new THREE.Group(); fixos.add(manche, ...mangas);
        corpo.add(fixos);
        return { corpo, estrutura, hel, barras, manche, topo, maos, mangas };
    }, [M]);

    useEffect(() => () => { pecas.corpo.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); pecas.estrutura.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [pecas]);

    const painel = useRef<THREE.Group>(null);
    const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), w: new THREE.Vector3(), e: new THREE.Vector3(), q: new THREE.Quaternion(), z: new THREE.Vector3(0, 0, 1) }), []);

    // chamado pela CenaDaQueda depois de pôr a câmera no quadro (um useFrame
    // próprio rodaria antes dela e a cabine tremeria um quadro atrasado)
    ajuste.current = () => {
        const g = raiz.current; if (!g) return;
        const t = tRef.current;
        g.position.copy(camera.position); g.quaternion.copy(camera.quaternion);
        // no baque a cabine cai para baixo e some (a cabeça tomba para fora dela)
        const sai = liso(10.45, 10.9, t);
        g.visible = sai < 1;
        // o painel: os relógios
        const tosse = t > 2.6 && t < 5 ? Math.sin(t * 23) * .35 : 0;
        const giro = t < 2.6 ? .72 : t < 5 ? .6 + tosse * .3 : Math.max(0, .6 * (1 - (t - 5) / 1.5));
        if (rpm.current) rpm.current.rotation.z = -giro * Math.PI * 2 * .8;
        // altímetro: gira para trás cada vez mais rápido no mergulho
        const altura = t < 7.4 ? 3.2 - t * .05 : Math.max(0, 2.83 - (t - 7.4) ** 2 * .3);
        if (alt.current) alt.current.rotation.z = -altura * Math.PI * 2;
        if (oleo.current) oleo.current.rotation.z = -(t < 2.6 ? .55 : Math.max(.05, .55 - (t - 2.6) * .12)) * Math.PI * 2 * .8;
        if (lampada.current) lampada.current.emissiveIntensity = t > 2.6 && t < 10.45 && Math.sin(t * 12) > 0 ? 4 : .15;

        // ── ENQUADRAMENTO: a tela em pé é estreita; em x, só a estrutura das asas é espremida
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 72;
        const asp = size.width / Math.max(1, size.height);
        void fov;
        const fx = Math.max(.3, Math.min(1, asp / (16 / 9)));
        pecas.estrutura.scale.x = fx;
        pecas.corpo.position.y = -sai * .9; pecas.estrutura.position.y = -sai * .9;
        pecas.corpo.rotation.z = sai * .25; pecas.estrutura.rotation.z = sai * .25;

        // hélice: ângulo em função de t, rastro que se fecha quando o motor morre
        const h = helice.current;
        const borrao = liso(.12, .55, h);                              // 1 a todo vapor, 0 quase parada
        const abertura = Math.PI * Math.pow(Math.min(1, h / .55), 1.5);
        pecas.hel.pose(anguloDaHelice(t), abertura, 1 - borrao, true);

        // ── O MANCHE E AS MÃOS ──────────────────────────────────────────
        const puxa = liso(7.4, 8.1, t);                                // no mergulho, puxa com força
        const esforco = puxa;
        const toss = tosseDaQueda(t);
        const choque = Math.max(0, 1 - Math.abs(t - 5.05) / .22);      // o motor morrendo dá um tranco
        const batida = Math.max(0, 1 - Math.abs(t - 10.45) / .3);
        // tremor fino das mãos o tempo todo; nas tossidas o manche dá tranco; no mergulho as mãos tremem forte
        const A = .0005 + .0042 * esforco;
        const tx = A * Math.sin(t * 53) + A * .6 * Math.sin(t * 31 + 1.3) + .007 * toss * Math.sin(t * 23) * .8 + .004 * toss * Math.sin(t * 41 + .7);
        const tz = A * .9 * Math.sin(t * 47 + .5) + A * .5 * Math.sin(t * 29 + 2.1) + .009 * toss * Math.sin(t * 23 + 1.2) - .028 * choque * Math.sin((t - 5.05) * 50) + .02 * batida;
        const ty = A * .7 * Math.sin(t * 61 + 2) + .004 * toss * Math.sin(t * 19);
        const inclina = mix(-.35, -.17, puxa) + .05 * toss * Math.sin(t * 23) + .05 * batida;
        const rola = .2 * esforco * Math.sin(t * 2.2 + .3) + .012 * toss * Math.sin(t * 17) + .025 * A * 160 * Math.sin(t * 33);
        const m = pecas.manche;
        m.position.set(MANCHE.pivo.x + tx, MANCHE.pivo.y + ty, MANCHE.pivo.z + tz - .04 * puxa);
        m.rotation.set(inclina, 0, rola);
        pecas.maos.forEach((mao, i) => {
            mao.rotation.x = -inclina - .12 - .05 * esforco;
            void i;
        });
        g.updateMatrixWorld(true);
        pecas.maos.forEach((mao, i) => {
            const lado = i ? 1 : -1;
            const punho = (mao.userData.punho as THREE.Object3D);
            punho.getWorldPosition(tmp.w); g.worldToLocal(tmp.w);
            // o cotovelo fica atrás e para fora; o antebraço aponta para ele
            tmp.e.set(lado * (.3 + .02 * esforco), -.4, .05);
            tmp.a.subVectors(tmp.e, tmp.w).normalize();
            const manga = pecas.mangas[i];
            manga.position.copy(tmp.w).addScaledVector(tmp.a, -.014);
            manga.quaternion.setFromUnitVectors(tmp.z, tmp.a);
        });

        // ── montantes e cabos: extremos em coordenadas de tela ──────────
        for (const b of pecas.barras) {
            tmp.a.copy(b.a); tmp.b.copy(b.b);
            if (b.sq[0]) tmp.a.x *= fx; if (b.sq[1]) tmp.b.x *= fx;
            ligar(b.m, tmp.a, tmp.b, b.rx, b.rz);
        }
        void painel; void PAINEL; void CAPO; void HELICE; void PARABRISA;
    };

    return <group ref={raiz}>
        <primitive object={pecas.corpo} />
        <primitive object={pecas.estrutura} />
        {/* o painel: mogno envernizado inclinado para o piloto; a origem do grupo é a borda de cima */}
        <group ref={painel} position={[0, PAINEL.yTopo, PAINEL.z]} rotation={[-.38, 0, 0]}>
            <mesh position={[0, -.15, 0]}><primitive object={useMemo(() => new RoundedBoxGeometry(PAINEL.meia * 2, .3, .036, 4, .014), [])} attach="geometry" /><primitive object={M.mogno} attach="material" /></mesh>
            {/* filete de latão em volta do painel */}
            <mesh position={[0, -.15, .0185]}><primitive object={useMemo(() => { const s = new THREE.Shape(), w = PAINEL.meia - .012, h = .15 - .012; s.moveTo(-w, -h); s.lineTo(w, -h); s.lineTo(w, h); s.lineTo(-w, h); s.closePath(); const f = new THREE.Path(); const w2 = w - .004, h2 = h - .004; f.moveTo(-w2, -h2); f.lineTo(-w2, h2); f.lineTo(w2, h2); f.lineTo(w2, -h2); f.closePath(); s.holes.push(f); return new THREE.ShapeGeometry(s); }, [])} attach="geometry" /><primitive object={M.latao} attach="material" /></mesh>
            <group position={[0, 0, .018]}>
                <Relogio x={-.135} y={-.085} r={.05} rotulo="ALT" marcas={10} unidade="×1000" agulha={alt} />
                <Relogio x={0} y={-.08} r={.06} rotulo="RPM" marcas={8} vermelho={.2} unidade="×100" agulha={rpm} />
                <Relogio x={.135} y={-.085} r={.047} rotulo="ÓLEO" marcas={4} vermelho={.25} agulha={oleo} />
                {/* a linha de baixo: lâmpada de pane e duas chaves de latão */}
                <mesh position={[.09, -.205, .004]}><sphereGeometry args={[.0115, 20, 14]} /><meshStandardMaterial ref={lampada} color="#5a1008" emissive="#ff2a10" emissiveIntensity={.15} roughness={.3} /></mesh>
                <mesh position={[.09, -.205, .001]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.0165, .0165, .006, 24]} /><primitive object={M.latao} attach="material" /></mesh>
                {[-.095, -.055].map((x) => <group key={x} position={[x, -.205, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.011, .011, .006, 18]} /><primitive object={M.latao} attach="material" /></mesh>
                    <mesh position={[0, .004, .009]} rotation={[-.5, 0, 0]}><cylinderGeometry args={[.0035, .0045, .024, 10]} /><primitive object={M.aco} attach="material" /></mesh>
                </group>)}
                {/* parafusos de latão nos cantos */}
                {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => <mesh key={i} position={[sx * (PAINEL.meia - .02), -.15 + sy * .128, .0005]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.0062, .0062, .004, 12]} /><primitive object={M.lataoVelho} attach="material" /></mesh>)}
            </group>
            <primitive object={useMemo(() => { const p = construirPlaca(M, 'Nº 12', 'ELEVADOR·AR'); p.position.set(0, -.032, .0195); return p; }, [M])} />
        </group>
    </group>;
};
