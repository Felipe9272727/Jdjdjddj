/**
 * Floor8Room.tsx — a SALA DE INTERROGATÓRIO do Andar 8, o domínio do ARQUIVISTA.
 *
 * As paredes SÃO o arquivo: estantes de fichas do chão ao teto, o hotel inteiro
 * catalogado ("máquina não esquece"). No meio, uma mesa de aço cansado sob uma
 * lâmpada engaiolada — pastas, cinzeiro, a máquina de escrever com que ele
 * datilografa as fichas (a mesma do 612). Concreto manchado, espelho falso,
 * canos, grelha no chão. O player entra pelo sul e caminha até a mesa, onde o
 * Arquivista espera.
 *
 * Texturas procedurais reusam colorTex/dataTex/rng do Floor6Textures. Os atos
 * (falas, foto, mergulho) crescem nas fases seguintes, dirigidos por f8Arquivo.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colorTex, dataTex, rng } from './Floor6Textures';
import { f8, f8Subscribe, f8Tick, f8DrainEvents, F8_CEIL, F8_ARQUIVISTA_POS } from './f8Arquivo';
import { Arquivista } from './Floor8Arquivista';

// ── texturas procedurais ─────────────────────────────────────────────────────
const concreteTex = colorTex(256, 256, (ctx) => {
    const r = rng(801);
    ctx.fillStyle = '#3a352c'; ctx.fillRect(0, 0, 256, 256);
    // manchas de umidade / sujeira
    for (let i = 0; i < 90; i++) {
        const x = r() * 256, y = r() * 256, s = 4 + r() * 26;
        ctx.fillStyle = `rgba(${20 + r() * 20},${18 + r() * 18},${14 + r() * 14},${0.05 + r() * 0.12})`;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    }
    // escorridos verticais de água
    for (let i = 0; i < 10; i++) {
        const x = r() * 256; const g = ctx.createLinearGradient(x, 0, x, 256);
        g.addColorStop(0, 'rgba(24,22,18,0.28)'); g.addColorStop(1, 'rgba(24,22,18,0)');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + r() * 4, 90 + r() * 140);
    }
    // rachaduras finas
    ctx.strokeStyle = 'rgba(16,14,11,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath(); let x = r() * 256, y = r() * 256; ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); }
        ctx.stroke();
    }
}, 2, 2);
const concreteBump = dataTex(256, 256, (ctx) => {
    const r = rng(802);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
        const v = 96 + r() * 90;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
}, 2, 2);

// papelão de caixa de arquivo (com aba de etiqueta)
const boxTex = colorTex(128, 128, (ctx) => {
    const r = rng(803);
    ctx.fillStyle = '#a98a5f'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(90,66,38,${0.05 + r() * 0.08})`; ctx.fillRect(0, r() * 128, 128, 1); }
    // etiqueta manila
    ctx.fillStyle = '#e6dcc0'; ctx.fillRect(18, 40, 92, 44);
    ctx.strokeStyle = 'rgba(60,50,30,0.6)'; ctx.strokeRect(18, 40, 92, 44);
    // "escrita" datilografada (rabiscos)
    ctx.fillStyle = 'rgba(50,42,28,0.75)';
    for (let ln = 0; ln < 3; ln++) for (let c = 0; c < 10 + r() * 6; c++) ctx.fillRect(24 + c * 7, 50 + ln * 11, 4, 2);
});

// madeira escura das estantes
const woodTex = colorTex(128, 256, (ctx) => {
    const r = rng(804);
    ctx.fillStyle = '#2e241a'; ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = 'rgba(18,12,8,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) { const x = r() * 128; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + (r() - 0.5) * 12, 85, x + (r() - 0.5) * 12, 170, x, 256); ctx.stroke(); }
});

const M8 = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.04, roughness: 0.96, color: '#8a8272' }),
    floor: new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.05, roughness: 1, color: '#6f6858' }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, color: '#b7a892' }),
    box: new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.92 }),
    steel: new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.7 }),
    steelDk: new THREE.MeshStandardMaterial({ color: '#26262a', roughness: 0.6, metalness: 0.6 }),
    tableTop: new THREE.MeshStandardMaterial({ color: '#4a4034', roughness: 0.65, metalness: 0.15 }),
    shade: new THREE.MeshStandardMaterial({ color: '#1a1a17', roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    mirror: new THREE.MeshStandardMaterial({ color: '#10131a', roughness: 0.12, metalness: 0.85 }),
    paper: new THREE.MeshStandardMaterial({ color: '#d9cfb2', roughness: 0.95 }),
    felt: new THREE.MeshStandardMaterial({ color: '#221d16', roughness: 1 }),
};

const W = 8, D = 10, H = F8_CEIL;   // sala x∈[-4,4] z∈[-10,0]

/** Caixa simples (a=[w,h,d], p=[x,y,z]). */
const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (
        <mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>
    );

/** Um banco de estantes de arquivo encostado numa parede, cheio de caixas de
 *  ficha. Construído virado pra +z local; a rotação/posição encaixa na parede. */
const ShelfBank: React.FC<{ pos: [number, number, number]; rotY: number; length: number; seed: number }> =
    ({ pos, rotY, length, seed }) => {
        const r = useMemo(() => rng(seed), [seed]);
        const levels = [0.5, 1.12, 1.74, 2.36];   // alturas das prateleiras
        const cols = Math.max(1, Math.floor(length / 0.62));
        const step = length / cols;
        const boxes: React.ReactNode[] = [];
        for (let li = 0; li < levels.length; li++) {
            const y = levels[li];
            // prateleira (tábua)
            boxes.push(<B key={`sh${li}`} a={[length, 0.04, 0.32]} p={[0, y - 0.02, 0]} m={M8.wood} />);
            for (let c = 0; c < cols; c++) {
                const x = -length / 2 + step * (c + 0.5);
                if (r() < 0.12) continue;                       // uma folga aqui e ali
                const bh = 0.34 + r() * 0.08, bw = step * 0.82, bd = 0.26;
                boxes.push(<B key={`b${li}-${c}`} a={[bw, bh, bd]} p={[x, y + bh / 2, 0]} m={M8.box} r={[0, 0, (r() - 0.5) * 0.05]} />);
                // etiqueta clara na frente (+z)
                boxes.push(
                    <mesh key={`l${li}-${c}`} position={[x, y + bh / 2, bd / 2 + 0.002]} material={M8.paper}>
                        <planeGeometry args={[bw * 0.6, bh * 0.32]} />
                    </mesh>,
                );
            }
        }
        // montantes verticais + topo
        const posts = Math.max(2, Math.round(length / 1.3) + 1);
        for (let i = 0; i < posts; i++) {
            const x = -length / 2 + (length / (posts - 1)) * i;
            boxes.push(<B key={`p${i}`} a={[0.06, H - 0.1, 0.36]} p={[x, (H - 0.1) / 2, -0.02]} m={M8.wood} />);
        }
        boxes.push(<B key="top" a={[length, 0.06, 0.36]} p={[0, H - 0.1, -0.02]} m={M8.wood} />);
        boxes.push(<B key="back" a={[length, H - 0.1, 0.03]} p={[0, (H - 0.1) / 2, -0.17]} m={M8.wood} />);
        return <group position={pos} rotation={[0, rotY, 0]}>{boxes}</group>;
    };

/** A lâmpada de interrogatório: cúpula + bulbo + gaiola de arames. */
const CagedLamp: React.FC<{ lampRef: React.MutableRefObject<THREE.PointLight> }> = ({ lampRef }) => {
    const bars = [];
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        bars.push(
            <mesh key={i} position={[Math.sin(a) * 0.13, -0.12, Math.cos(a) * 0.13]} rotation={[0.5, a, 0]} material={M8.steelDk}>
                <cylinderGeometry args={[0.006, 0.006, 0.3, 4]} />
            </mesh>,
        );
    }
    return (
        <group position={[0, 2.0, -1.6]}>
            <B a={[0.03, 0.9, 0.03]} p={[0, 0.5, 0]} m={M8.steelDk} />
            <mesh position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]} material={M8.shade}>
                <coneGeometry args={[0.3, 0.26, 18, 1, true]} />
            </mesh>
            {bars}
            <mesh position={[0, -0.02, 0]}><sphereGeometry args={[0.05, 10, 10]} /><meshBasicMaterial color="#fff2cf" /></mesh>
            <pointLight ref={lampRef} position={[0, -0.02, 0]} distance={9.5} decay={1.5} color="#ffe6b8" intensity={44} />
            <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.13, 0.14, 6]} />
                <meshStandardMaterial color="#26262a" roughness={0.6} metalness={0.6} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};

/** Uma cadeira de metal simples. */
const Chair: React.FC<{ p: [number, number, number]; rotY: number }> = ({ p, rotY }) => (
    <group position={p} rotation={[0, rotY, 0]}>
        <B a={[0.42, 0.04, 0.42]} p={[0, 0.47, 0]} m={M8.steel} />
        <B a={[0.42, 0.5, 0.04]} p={[0, 0.72, -0.19]} m={M8.steel} />
        {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.235, z]} material={M8.steelDk}><cylinderGeometry args={[0.02, 0.02, 0.47, 6]} /></mesh>
        ))}
    </group>
);

/** A mesa do interrogatório com tralha em cima. */
const Desk: React.FC = () => (
    <group position={[0, 0, -1.6]}>
        {/* tampo + saia + pés */}
        <B a={[1.95, 0.07, 0.98]} p={[0, 0.95, 0]} m={M8.tableTop} />
        <B a={[1.8, 0.28, 0.06]} p={[0, 0.78, 0.44]} m={M8.steelDk} />
        <B a={[1.8, 0.28, 0.06]} p={[0, 0.78, -0.44]} m={M8.steelDk} />
        {[[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.46, z]} material={M8.steel}><boxGeometry args={[0.06, 0.92, 0.06]} /></mesh>
        ))}
        {/* pilhas de pastas */}
        <B a={[0.42, 0.09, 0.3]} p={[-0.62, 1.03, 0.16]} m={M8.box} r={[0, 0.2, 0]} />
        <B a={[0.42, 0.06, 0.3]} p={[-0.62, 1.11, 0.16]} m={M8.paper} r={[0, 0.12, 0]} />
        <B a={[0.4, 0.05, 0.28]} p={[-0.66, 1.16, 0.1]} m={M8.box} r={[0, -0.1, 0]} />
        {/* uma ficha aberta sob a luz */}
        <mesh position={[0.1, 1.0, 0.12]} rotation={[-Math.PI / 2, 0, 0.15]} material={M8.paper}><planeGeometry args={[0.34, 0.46]} /></mesh>
        {/* máquina de escrever (a do 612) — corpo + carro + teclas */}
        <group position={[0.66, 1.06, -0.02]}>
            <B a={[0.34, 0.14, 0.3]} p={[0, 0, 0]} m={M8.steelDk} />
            <B a={[0.36, 0.04, 0.08]} p={[0, 0.1, -0.12]} m={M8.steel} />
            <B a={[0.28, 0.05, 0.12]} p={[0, -0.02, 0.13]} m={M8.steel} />
        </group>
        {/* cinzeiro + caneca */}
        <mesh position={[-0.05, 1.0, -0.34]} material={M8.steel}><cylinderGeometry args={[0.08, 0.07, 0.03, 12]} /></mesh>
        <mesh position={[0.4, 1.02, 0.34]} material={M8.paper}><cylinderGeometry args={[0.05, 0.045, 0.09, 12]} /></mesh>
    </group>
);

// fita zebrada amarela/preta (barricada de manutenção)
const tapeTex = colorTex(128, 32, (ctx) => {
    ctx.fillStyle = '#d8b13a'; ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#17150f';
    for (let x = -32; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 32); ctx.fill(); }
}, 3, 1);
const signTex = colorTex(256, 128, (ctx) => {
    ctx.fillStyle = '#cfc4a4'; ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 244, 116);
    ctx.fillStyle = '#3a3226'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Georgia, serif'; ctx.fillText('EM MANUTENÇÃO', 128, 46);
    ctx.font = '20px monospace'; ctx.fillText('— A GERÊNCIA —', 128, 88);
});
const M8b = {
    plank: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9, color: '#8a7a60' }),
    tape: new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.8, side: THREE.DoubleSide }),
    sign: new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85 }),
};

/** O tapume do elevador: quando o player desperta, o vão do sul está LACRADO —
 *  tábuas tortas, fita zebrada em X e a placa. O elevador simplesmente não está
 *  mais lá. Monta nas fases do despertar em diante (f8Subscribe). */
const ElevatorGone: React.FC = () => {
    const [, setV] = useState(0);
    useEffect(() => f8Subscribe(() => setV((v) => v + 1)), []);
    const on = f8.phase === 'despertar' || f8.phase === 'elevadorSumiu' || f8.phase === 'arremesso' || f8.phase === 'leave';
    if (!on) return null;
    return (
        <group position={[0, 0, -9.92]}>
            {/* fundo cego atrás das tábuas (nada de poço — o elevador SUMIU) */}
            <B a={[2.6, H, 0.06]} p={[0, H / 2, -0.06]} m={M8.concrete} />
            {/* tábuas horizontais tortas */}
            <B a={[2.9, 0.3, 0.05]} p={[0, 0.6, 0.02]} m={M8b.plank} r={[0, 0, 0.06]} />
            <B a={[2.9, 0.3, 0.05]} p={[0, 1.35, 0.02]} m={M8b.plank} r={[0, 0, -0.05]} />
            <B a={[2.9, 0.3, 0.05]} p={[0, 2.1, 0.02]} m={M8b.plank} r={[0, 0, 0.04]} />
            {/* fita zebrada em X */}
            <mesh position={[0, 1.4, 0.08]} rotation={[0, 0, 0.6]} material={M8b.tape}><planeGeometry args={[3.2, 0.16]} /></mesh>
            <mesh position={[0, 1.4, 0.09]} rotation={[0, 0, -0.6]} material={M8b.tape}><planeGeometry args={[3.2, 0.16]} /></mesh>
            {/* a placa */}
            <mesh position={[0, 1.75, 0.12]} rotation={[0, 0, -0.03]} material={M8b.sign}><planeGeometry args={[1.1, 0.55]} /></mesh>
            {/* luz fraca de serviço em cima do vão */}
            <mesh position={[0, 2.7, 0.1]}><sphereGeometry args={[0.05, 8, 8]} /><meshBasicMaterial color="#c9b16a" /></mesh>
            <pointLight position={[0, 2.6, 0.4]} distance={3.5} decay={2} color="#c9a95a" intensity={5} />
        </group>
    );
};

export const Floor8Room: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> =
    ({ playerPositionRef }) => {
        const lamp = useRef<THREE.PointLight>(null!);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            f8Tick(dt, playerPositionRef.current.z);
            if (lamp.current) lamp.current.intensity = 44 + Math.sin(performance.now() * 0.004) * 3;
            f8DrainEvents();
        });

        const [ax, az] = F8_ARQUIVISTA_POS;

        return (
            <group>
                {/* casca de concreto */}
                <B a={[W, 0.1, D]} p={[0, -0.05, -5]} m={M8.floor} />
                <B a={[W, 0.1, D]} p={[0, H, -5]} m={M8.concrete} />
                <B a={[0.1, H, D]} p={[-4, H / 2, -5]} m={M8.concrete} />
                <B a={[0.1, H, D]} p={[4, H / 2, -5]} m={M8.concrete} />
                <B a={[W, H, 0.1]} p={[0, H / 2, 0]} m={M8.concrete} />
                {/* parede sul com o vão do elevador (x∈[-1.3,1.3]) */}
                <B a={[2.7, H, 0.1]} p={[-2.65, H / 2, -10]} m={M8.concrete} />
                <B a={[2.7, H, 0.1]} p={[2.65, H / 2, -10]} m={M8.concrete} />
                {/* depois do despertar, o vão está lacrado: o elevador sumiu */}
                <ElevatorGone />

                {/* O ARQUIVO — estantes de fichas do chão ao teto nas paredes laterais */}
                <ShelfBank pos={[-3.62, 0, -5]} rotY={Math.PI / 2} length={8.6} seed={11} />
                <ShelfBank pos={[3.62, 0, -5]} rotY={-Math.PI / 2} length={8.6} seed={23} />
                {/* atrás do Arquivista: dois arquivos de gaveta + o espelho falso */}
                <group position={[-2.4, 0, -0.28]}>
                    <B a={[0.9, 1.4, 0.5]} p={[0, 0.7, 0]} m={M8.steelDk} />
                    {[0.35, 0.72, 1.09].map((y, i) => (<B key={i} a={[0.7, 0.28, 0.03]} p={[0, y, 0.26]} m={M8.steel} />))}
                    {[0.35, 0.72, 1.09].map((y, i) => (<mesh key={'h' + i} position={[0, y, 0.28]} material={M8.steelDk}><boxGeometry args={[0.16, 0.03, 0.03]} /></mesh>))}
                </group>
                <mesh position={[2.2, 1.45, -0.24]} material={M8.mirror}><boxGeometry args={[1.7, 1.1, 0.05]} /></mesh>
                <B a={[1.84, 0.06, 0.07]} p={[2.2, 2.03, -0.22]} m={M8.steelDk} />
                <B a={[1.84, 0.06, 0.07]} p={[2.2, 0.87, -0.22]} m={M8.steelDk} />

                {/* a mesa + a lâmpada engaiolada + cadeiras */}
                <Desk />
                <CagedLamp lampRef={lamp} />
                <Chair p={[0, 0, -3.0]} rotY={0} />
                <Chair p={[0, 0, -0.35]} rotY={Math.PI} />

                {/* teto: canos + duto + uma luz de serviço fraca */}
                <mesh position={[-1.5, H - 0.12, -5]} rotation={[Math.PI / 2, 0, 0]} material={M8.steel}><cylinderGeometry args={[0.06, 0.06, D - 0.5, 10]} /></mesh>
                <mesh position={[-1.2, H - 0.2, -5]} rotation={[Math.PI / 2, 0, 0]} material={M8.steelDk}><cylinderGeometry args={[0.04, 0.04, D - 0.5, 8]} /></mesh>
                <B a={[0.7, 0.18, 0.7]} p={[2.4, H - 0.12, -7.5]} m={M8.steel} />

                {/* grelha de dreno no chão */}
                <mesh position={[0, 0.011, -5.2]} rotation={[-Math.PI / 2, 0, 0]} material={M8.steelDk}><circleGeometry args={[0.34, 20]} /></mesh>
                {[-0.2, -0.07, 0.07, 0.2].map((x, i) => (<B key={i} a={[0.03, 0.008, 0.56]} p={[x, 0.016, -5.2]} m={M8.steel} />))}

                {/* preenchimento fraco e frio */}
                <ambientLight color="#1c1e28" intensity={0.14} />
                <pointLight position={[0, 2.6, -8]} distance={6} decay={2} color="#3a4258" intensity={4} />

                {/* o ARQUIVISTA, atrás da mesa */}
                <group position={[ax, 0, az]}>
                    <Arquivista
                        playerPositionRef={playerPositionRef}
                        bounds={[-1.3, 1.3, -0.35, 0.4]}
                        pois={[
                            { x: 0, z: 0.1, kind: 'observar' },
                            { x: -0.7, z: -0.2, kind: 'ler' },
                            { x: 0.7, z: -0.2, kind: 'vaguear' },
                        ]}
                    />
                </group>
            </group>
        );
    };

export default Floor8Room;
