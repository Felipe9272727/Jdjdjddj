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
import { f8RoomToneStart, f8RoomToneStop } from './f8Music';
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

// etiqueta datilografada das caixas (linhas + carimbo de índice) — substitui o
// plano branco puro que brilhava demais sob a lâmpada
const labelTex = colorTex(64, 32, (ctx) => {
    const r = rng(806);
    ctx.fillStyle = '#d9cfae'; ctx.fillRect(0, 0, 64, 32);
    ctx.strokeStyle = 'rgba(90,74,46,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, 62, 30);
    ctx.fillStyle = 'rgba(52,44,30,0.8)';
    for (let ln = 0; ln < 2; ln++) for (let c = 0; c < 5 + r() * 5; c++) ctx.fillRect(6 + c * 5, 9 + ln * 8, 3, 1.6);
    ctx.fillStyle = 'rgba(140,40,34,0.7)'; ctx.fillRect(44, 22, 14, 6);
});

// madeira escura das estantes
const woodTex = colorTex(128, 256, (ctx) => {
    const r = rng(804);
    ctx.fillStyle = '#2e241a'; ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = 'rgba(18,12,8,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) { const x = r() * 128; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + (r() - 0.5) * 12, 85, x + (r() - 0.5) * 12, 170, x, 256); ctx.stroke(); }
});

// frente de FICHÁRIO: grade de gavetinhas com puxador de latão e porta-etiqueta
const drawerGridTex = colorTex(128, 160, (ctx) => {
    const r = rng(809);
    ctx.fillStyle = '#3a2c1e'; ctx.fillRect(0, 0, 128, 160);
    const cols = 4, rows = 5, cw = 128 / cols, chh = 160 / rows;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const x = cx * cw + 2, y = cy * chh + 2, w = cw - 4, h = chh - 4;
        ctx.fillStyle = `rgb(${74 + r() * 14},${56 + r() * 12},${38 + r() * 8})`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(14,10,6,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
        // porta-etiqueta + etiqueta
        ctx.fillStyle = '#c9bd9a'; ctx.fillRect(x + w / 2 - 8, y + 4, 16, 7);
        ctx.strokeStyle = '#8a6f3a'; ctx.lineWidth = 1; ctx.strokeRect(x + w / 2 - 8, y + 4, 16, 7);
        // puxador de latão
        ctx.fillStyle = '#b08d45';
        ctx.beginPath(); ctx.arc(x + w / 2, y + h - 8, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(40,26,8,0.6)';
        ctx.beginPath(); ctx.arc(x + w / 2 + 1, y + h - 7, 1.3, 0, Math.PI * 2); ctx.fill();
    }
});
const drawerMat = new THREE.MeshStandardMaterial({ map: drawerGridTex, roughness: 0.8 });

// o TAPETE surrado sob a mesa (âncora de cor no centro da sala)
const rugTex = colorTex(256, 192, (ctx) => {
    const r = rng(810);
    ctx.fillStyle = '#4a2226'; ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = '#2a3438'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 236, 172);
    ctx.strokeStyle = '#6a3a30'; ctx.lineWidth = 3; ctx.strokeRect(22, 22, 212, 148);
    // losangos centrais desbotados
    ctx.strokeStyle = 'rgba(140,110,80,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        const cx = 78 + i * 50;
        ctx.beginPath(); ctx.moveTo(cx, 66); ctx.lineTo(cx + 24, 96); ctx.lineTo(cx, 126); ctx.lineTo(cx - 24, 96); ctx.closePath(); ctx.stroke();
    }
    // puimento/desgaste
    for (let i = 0; i < 700; i++) {
        ctx.fillStyle = `rgba(${20 + r() * 30},${14 + r() * 20},${10 + r() * 16},${0.06 + r() * 0.1})`;
        ctx.fillRect(r() * 256, r() * 192, 1 + r() * 3, 1 + r() * 2);
    }
    // a trilha gasta na frente da cadeira do interrogado
    const g = ctx.createRadialGradient(128, 150, 4, 128, 150, 60);
    g.addColorStop(0, 'rgba(120,100,80,0.28)'); g.addColorStop(1, 'rgba(120,100,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 192);
});
const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 });

const M8 = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.04, roughness: 0.96, color: '#8a8272' }),
    floor: new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.05, roughness: 1, color: '#6f6858' }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, color: '#b7a892' }),
    box: new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.92 }),
    // variações de papelão (idade/umidade diferentes) — quebra a repetição
    boxOld: new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.95, color: '#8f7a58' }),
    boxDark: new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.97, color: '#6f5f46' }),
    boxRed: new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.93, color: '#9a6a50' }),
    label: new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.96, side: THREE.DoubleSide }),
    brassPipe: new THREE.MeshStandardMaterial({ color: '#8a6d38', roughness: 0.38, metalness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: '#4a4a52', roughness: 0.5, metalness: 0.7 }),
    steelDk: new THREE.MeshStandardMaterial({ color: '#26262a', roughness: 0.6, metalness: 0.6 }),
    tableTop: new THREE.MeshStandardMaterial({ color: '#4a4034', roughness: 0.65, metalness: 0.15 }),
    shade: new THREE.MeshStandardMaterial({ color: '#1a1a17', roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    mirror: new THREE.MeshStandardMaterial({ color: '#10131a', roughness: 0.12, metalness: 0.85 }),
    paper: new THREE.MeshStandardMaterial({ color: '#d9cfb2', roughness: 0.95, side: THREE.DoubleSide }),
    felt: new THREE.MeshStandardMaterial({ color: '#221d16', roughness: 1 }),
};

const W = 8, D = 10, H = F8_CEIL;   // sala x∈[-4,4] z∈[-10,0]

/** Caixa simples (a=[w,h,d], p=[x,y,z]). */
const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (
        <mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>
    );

/** Um banco de estantes de arquivo encostado numa parede, cheio de caixas de
 *  ficha. Construído virado pra +z local; a rotação/posição encaixa na parede.
 *  v2: papelões de idades diferentes, caixas tombadas/empilhadas, pastas
 *  avulsas inclinadas nas folgas, etiquetas datilografadas (não mais brancas). */
const ShelfBank: React.FC<{ pos: [number, number, number]; rotY: number; length: number; seed: number }> =
    ({ pos, rotY, length, seed }) => {
        const r = useMemo(() => rng(seed), [seed]);
        const levels = [0.5, 1.12, 1.74, 2.36];   // alturas das prateleiras
        const cols = Math.max(1, Math.floor(length / 0.62));
        const step = length / cols;
        const mats = [M8.box, M8.box, M8.boxOld, M8.boxDark, M8.boxRed];
        const boxes: React.ReactNode[] = [];
        for (let li = 0; li < levels.length; li++) {
            const y = levels[li];
            // prateleira (tábua)
            boxes.push(<B key={`sh${li}`} a={[length, 0.04, 0.32]} p={[0, y - 0.02, 0]} m={M8.wood} />);
            for (let c = 0; c < cols; c++) {
                const x = -length / 2 + step * (c + 0.5);
                const roll = r();
                if (roll < 0.1) continue;                       // folga vazia
                if (roll < 0.2) {
                    // folga com PASTAS AVULSAS inclinadas (livros cansados)
                    const n = 2 + Math.floor(r() * 3);
                    for (let f = 0; f < n; f++) {
                        boxes.push(<B key={`f${li}-${c}-${f}`} a={[0.035, 0.3 + r() * 0.06, 0.24]}
                            p={[x - 0.1 + f * 0.055, y + 0.16, 0]} m={f % 2 ? M8.paper : M8.boxOld}
                            r={[0, 0, 0.24 + r() * 0.18]} />);
                    }
                    continue;
                }
                const m = mats[Math.floor(r() * mats.length)];
                if (roll < 0.28) {
                    // caixa TOMBADA de lado (deitada)
                    const bw = step * 0.8;
                    boxes.push(<B key={`t${li}-${c}`} a={[bw, 0.26, 0.3]} p={[x, y + 0.13, 0.01]} m={m} r={[0, (r() - 0.5) * 0.2, 0]} />);
                    continue;
                }
                const bh = 0.3 + r() * 0.1, bw = step * 0.82, bd = 0.26;
                boxes.push(<B key={`b${li}-${c}`} a={[bw, bh, bd]} p={[x, y + bh / 2, 0]} m={m} r={[0, 0, (r() - 0.5) * 0.05]} />);
                // caixinha extra EMPILHADA em cima, de vez em quando
                if (r() < 0.22 && bh < 0.36) {
                    boxes.push(<B key={`s${li}-${c}`} a={[bw * 0.7, 0.13, bd * 0.85]}
                        p={[x + (r() - 0.5) * 0.06, y + bh + 0.065, 0]} m={mats[Math.floor(r() * mats.length)]}
                        r={[0, (r() - 0.5) * 0.3, 0]} />);
                }
                // etiqueta datilografada na frente (+z), nem toda caixa tem
                if (r() < 0.78) {
                    boxes.push(
                        <mesh key={`l${li}-${c}`} position={[x, y + bh * 0.42, bd / 2 + 0.002]} material={M8.label}
                            rotation={[0, 0, (r() - 0.5) * 0.06]}>
                            <planeGeometry args={[bw * 0.5, bh * 0.3]} />
                        </mesh>,
                    );
                }
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

/** A escada de arquivo, encostada na estante — a silhueta que faltava. */
const ArchiveLadder: React.FC<{ pos: [number, number, number]; rotY: number }> = ({ pos, rotY }) => (
    <group position={pos} rotation={[0, rotY, 0]}>
        <group rotation={[0.24, 0, 0]}>
            {[-0.2, 0.2].map((x) => (
                <mesh key={x} position={[x, 1.25, 0]} material={M8.wood}><boxGeometry args={[0.05, 2.5, 0.07]} /></mesh>
            ))}
            {[0.3, 0.72, 1.14, 1.56, 1.98].map((y) => (
                <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} material={M8.wood}>
                    <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
                </mesh>
            ))}
        </group>
    </group>
);

/** Tralha de chão: uma caixa caída derramando fichas + um maço amarrado. */
const FloorClutter: React.FC = () => (
    <group>
        {/* a caixa caída, de boca aberta */}
        <group position={[2.7, 0, -7.7]} rotation={[0, -0.7, 0]}>
            <B a={[0.5, 0.34, 0.32]} p={[0, 0.17, 0]} m={M8.boxOld} r={[0, 0, -1.35]} />
            <B a={[0.5, 0.03, 0.32]} p={[-0.42, 0.02, 0.12]} m={M8.boxDark} r={[0, 0.5, 0]} />
            {/* fichas derramadas */}
            {[[-0.5, 0.22, 0.02], [-0.72, 0.1, 0.12], [-0.6, -0.14, -0.25], [-0.85, 0.3, 0.28], [-0.38, 0.42, 0.35]].map(([dx, dz, rz], i) => (
                <mesh key={i} position={[dx, 0.012 + i * 0.004, dz]} rotation={[-Math.PI / 2, 0, rz]} material={M8.paper}>
                    <planeGeometry args={[0.2, 0.28]} />
                </mesh>
            ))}
        </group>
        {/* maço de fichas amarrado com barbante, esperando arquivamento */}
        <group position={[-2.9, 0, -8.6]} rotation={[0, 0.4, 0]}>
            <B a={[0.34, 0.16, 0.26]} p={[0, 0.08, 0]} m={M8.paper} />
            <B a={[0.36, 0.012, 0.02]} p={[0, 0.09, 0]} m={M8.steelDk} />
            <B a={[0.02, 0.17, 0.27]} p={[0, 0.08, 0]} m={M8.steelDk} />
            <B a={[0.3, 0.1, 0.22]} p={[0.05, 0.21, 0.02]} m={M8.paper} r={[0, 0.3, 0]} />
        </group>
    </group>
);

/** FICHÁRIO de gavetinhas (card catalog) — o móvel que diz "arquivo". */
const CardCatalog: React.FC<{ pos: [number, number, number]; rotY?: number; w?: number; h?: number }> =
    ({ pos, rotY = 0, w = 0.78, h = 1.5 }) => (
        <group position={pos} rotation={[0, rotY, 0]}>
            <B a={[w, h, 0.44]} p={[0, h / 2 + 0.06, 0]} m={M8.wood} />
            <mesh position={[0, h / 2 + 0.06, 0.222]} material={drawerMat}>
                <planeGeometry args={[w - 0.05, h - 0.05]} />
            </mesh>
            <B a={[w + 0.06, 0.05, 0.5]} p={[0, h + 0.09, 0]} m={M8.wood} />
            {/* pezinhos */}
            <B a={[w - 0.1, 0.06, 0.36]} p={[0, 0.03, 0]} m={M8.steelDk} />
            {/* uma gaveta entreaberta com fichas espiando */}
            <B a={[w / 4 - 0.02, 0.06, 0.12]} p={[-w / 4 + w / 8, h * 0.62, 0.27]} m={M8.wood} />
            <B a={[w / 4 - 0.06, 0.04, 0.09]} p={[-w / 4 + w / 8, h * 0.62 + 0.045, 0.26]} m={M8.paper} />
        </group>
    );

/** O TUBO PNEUMÁTICO: por onde as fichas chegam ao arquivo. Um cano de latão
 *  desce do teto até um terminal com bandeja de cápsulas ao lado da mesa. */
const PneumaticTube: React.FC = () => (
    <group position={[1.62, 0, -0.55]}>
        {/* o cano desce do teto */}
        <mesh position={[0, (H + 1.32) / 2, 0]} material={M8.brassPipe}>
            <cylinderGeometry args={[0.05, 0.05, H - 1.32, 10]} />
        </mesh>
        {/* braçadeiras */}
        {[1.7, 2.5].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M8.steelDk}>
                <torusGeometry args={[0.055, 0.012, 6, 12]} />
            </mesh>
        ))}
        {/* o TERMINAL: caixa de latão com boca e alavanca */}
        <B a={[0.26, 0.34, 0.2]} p={[0, 1.16, 0]} m={M8.brassPipe} />
        <mesh position={[0, 1.02, 0.09]} rotation={[Math.PI / 2.6, 0, 0]} material={M8.steelDk}>
            <cylinderGeometry args={[0.055, 0.07, 0.12, 10, 1, true]} />
        </mesh>
        <B a={[0.03, 0.12, 0.03]} p={[0.16, 1.2, 0]} m={M8.steel} r={[0, 0, -0.5]} />
        {/* o pedestal */}
        <B a={[0.1, 1.0, 0.1]} p={[0, 0.5, 0]} m={M8.steelDk} />
        <B a={[0.3, 0.04, 0.3]} p={[0, 0.02, 0]} m={M8.steelDk} />
        {/* a bandeja com cápsulas que já chegaram */}
        <B a={[0.34, 0.03, 0.22]} p={[0.02, 0.86, 0.16]} m={M8.steelDk} />
        {[[-0.07, 0.4], [0.06, -0.3], [0.13, 1.2]].map(([dx, rz], i) => (
            <mesh key={i} position={[dx as number, 0.91, 0.16]} rotation={[Math.PI / 2, 0, rz as number]} material={M8.brassPipe}>
                <capsuleGeometry args={[0.028, 0.09, 4, 8]} />
            </mesh>
        ))}
    </group>
);

/** As JANELAS ALTAS gradeadas da parede norte: o arquivo continua além,
 *  numa luz fria — a segunda cor da sala. */
const Transom: React.FC<{ x: number }> = ({ x }) => (
    <group position={[x, 2.52, -0.08]}>
        {/* o vão escuro + o brilho frio lá dentro */}
        <mesh position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[1.0, 0.44]} />
            <meshStandardMaterial color="#0a1216" emissive="#5a92aa" emissiveIntensity={2.2} roughness={1} />
        </mesh>
        {/* silhuetas de estantes ao longe (planos escuros) */}
        {[-0.3, 0.05, 0.38].map((dx) => (
            <mesh key={dx} position={[dx, -0.04, -0.004]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[0.1, 0.36]} />
                <meshBasicMaterial color="#060a0c" />
            </mesh>
        ))}
        {/* moldura + grade */}
        <B a={[1.08, 0.05, 0.05]} p={[0, 0.245, -0.02]} m={M8.steelDk} />
        <B a={[1.08, 0.05, 0.05]} p={[0, -0.245, -0.02]} m={M8.steelDk} />
        <B a={[0.05, 0.54, 0.05]} p={[-0.54, 0, -0.02]} m={M8.steelDk} />
        <B a={[0.05, 0.54, 0.05]} p={[0.54, 0, -0.02]} m={M8.steelDk} />
        {[-0.27, 0, 0.27].map((dx) => (
            <mesh key={dx} position={[dx, 0, -0.035]} material={M8.steelDk}>
                <cylinderGeometry args={[0.014, 0.014, 0.5, 6]} />
            </mesh>
        ))}
    </group>
);

/** A LUMINÁRIA DE BANQUEIRO na mesa: a poça de luz verde (segunda cor quente).
 *  Coordenadas locais do grupo da mesa (mesa em z=-1.6 no mundo). */
const BankerLamp: React.FC = () => (
    <group position={[-0.42, 1.0, 0.3]} rotation={[0, 0.5, 0]}>
        <mesh material={M8.brassPipe}><cylinderGeometry args={[0.06, 0.075, 0.025, 12]} /></mesh>
        <mesh position={[0, 0.11, 0]} material={M8.brassPipe}><cylinderGeometry args={[0.012, 0.012, 0.2, 8]} /></mesh>
        {/* a cúpula de vidro verde (meia-cana) */}
        <mesh position={[0, 0.22, 0.02]} rotation={[0.15, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.085, 0.085, 0.26, 12, 1, true, 0, Math.PI]} />
            <meshStandardMaterial color="#1e4a30" emissive="#2f7a46" emissiveIntensity={0.55} roughness={0.3} metalness={0.2} side={THREE.DoubleSide} />
        </mesh>
        {/* o miolo aceso + a luz */}
        <mesh position={[0, 0.19, 0.03]}><sphereGeometry args={[0.03, 8, 8]} /><meshBasicMaterial color="#eaffd8" /></mesh>
        <pointLight position={[0, 0.16, 0.05]} distance={2.1} decay={2} color="#b8e8a0" intensity={4.5} />
    </group>
);

/** Vigas do teto + cabos pendurados em catenária + conduítes. */
const CeilingWork: React.FC = () => {
    const cables = useMemo(() => {
        const mk = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
            const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
            return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, 0.012, 5);
        };
        return [
            mk(new THREE.Vector3(-3.4, H - 0.16, -2.55), new THREE.Vector3(0.02, H - 0.62, -1.62), 0.35),
            mk(new THREE.Vector3(0.02, H - 0.62, -1.62), new THREE.Vector3(3.4, H - 0.16, -2.55), 0.3),
            mk(new THREE.Vector3(-3.4, H - 0.16, -7.45), new THREE.Vector3(1.5, H - 0.2, -7.5), 0.5),
        ];
    }, []);
    return (
        <group>
            {[-2.5, -5, -7.5].map((z) => (
                <B key={z} a={[W, 0.16, 0.2]} p={[0, H - 0.08, z]} m={M8.wood} />
            ))}
            {cables.map((g, i) => (
                <mesh key={i} geometry={g}>
                    <meshStandardMaterial color="#14120e" roughness={0.9} />
                </mesh>
            ))}
        </group>
    );
};

/** A TEIA DO FIO VERMELHO: sai do quadro de cortiça e cruza o teto até as
 *  estantes, com etiquetas de papel penduradas balançando de leve. */
const ThreadWeb: React.FC = () => {
    const geo = useMemo(() => {
        const pts: number[] = [];
        const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
        seg([-0.9, 2.2, -0.1], [-3.35, 2.7, -3.9]);
        seg([0.6, 2.25, -0.1], [3.35, 2.72, -4.6]);
        seg([0.05, 2.28, -0.1], [0.9, 2.86, -6.8]);
        seg([-0.4, 2.24, -0.1], [-3.3, 2.62, -6.6]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
        return g;
    }, []);
    const tags = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (tags.current) tags.current.children.forEach((tag, i) => { tag.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.12; tag.rotation.x = Math.sin(t * 0.6 + i) * 0.06; });
    });
    // pontos de pendura ao longo dos fios (interpolados à mão)
    const hang: [number, number, number][] = [
        [-2.1, 2.45, -2.0], [1.95, 2.48, -2.35], [0.5, 2.58, -3.6], [-1.9, 2.44, -3.5], [0.72, 2.74, -5.5],
    ];
    return (
        <group>
            <primitive object={new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#8a1c22' }))} />
            <group ref={tags}>
                {hang.map((p, i) => (
                    <group key={i} position={p}>
                        <mesh position={[0, -0.055, 0]} material={M8.steelDk}><cylinderGeometry args={[0.003, 0.003, 0.11, 4]} /></mesh>
                        <mesh position={[0, -0.16, 0]} rotation={[0, (i * 1.3) % 1.5 - 0.7, 0]} material={i % 2 ? M8.label : M8.paper}>
                            <planeGeometry args={[0.11, 0.15]} />
                        </mesh>
                    </group>
                ))}
            </group>
        </group>
    );
};

// o stencil pintado na parede norte: ARQUIVO GERAL
const stencilTex = colorTex(512, 96, (ctx) => {
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = 'rgba(58,48,34,0.85)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('A R Q U I V O   G E R A L', 256, 34);
    ctx.font = '22px monospace';
    ctx.fillStyle = 'rgba(58,48,34,0.6)';
    ctx.fillText('— nada aqui se esquece —', 256, 72);
});
const stencilMat = new THREE.MeshStandardMaterial({ map: stencilTex, transparent: true, roughness: 0.95 });

/** O relógio de parede PARADO (21 minutos — o tempo que o player ficou lá dentro). */
const ArchiveClock: React.FC = () => (
    <group position={[-1.62, 2.5, -0.07]}>
        {/* aro/corpo, eixo virado pra parede */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M8.steelDk}><cylinderGeometry args={[0.22, 0.22, 0.05, 20]} /></mesh>
        {/* mostrador encarando a sala (sul) */}
        <mesh position={[0, 0, -0.028]} rotation={[0, Math.PI, 0]} material={M8.paper}><circleGeometry args={[0.185, 20]} /></mesh>
        {/* ponteiros parados em 4:21 */}
        <mesh position={[0.02, 0.035, -0.034]} rotation={[0, 0, 0.9]} material={M8.steelDk}><boxGeometry args={[0.015, 0.11, 0.006]} /></mesh>
        <mesh position={[-0.035, -0.045, -0.034]} rotation={[0, 0, 2.42]} material={M8.steelDk}><boxGeometry args={[0.012, 0.17, 0.006]} /></mesh>
        <mesh position={[0, 0, -0.036]} material={M8.steel}><sphereGeometry args={[0.014, 8, 8]} /></mesh>
    </group>
);

/** Direção de cena do interrogatório (sem re-render; lê f8 por frame):
 *  a IMAGEM sobre a mesa DESLIZA do lado dele pro lado do player na última
 *  fala (a mão do Arquivista empurra — o canal 'slide' do ator casa com isso)
 *  e acende/pulsa quando vira o alvo (entregaImagem). A FOTOGRAFIA das vinte
 *  portas agora é prop na MÃO do ator (Floor8Arquivista). */
const InterroDirector: React.FC = () => {
    const img = useRef<THREE.Mesh>(null!);
    const imgLight = useRef<THREE.PointLight>(null!);
    const slide = useRef(0);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        // o deslize: última fala do interrogatório em diante
        const ph = f8.phase;
        const want = (ph === 'interrogatorio' && f8.line >= 8) || ph === 'entregaImagem' || ph === 'mergulho' ? 1 : 0;
        slide.current += (want - slide.current) * Math.min(1, dt * 1.6);
        const k = slide.current;
        const ix = -0.15 + k * 0.25, iz = -1.2 - k * 0.72;
        if (img.current) {
            img.current.position.set(ix, 1.0, iz);
            img.current.rotation.z = -0.12 + k * 0.24;
            const m = img.current.material as THREE.MeshStandardMaterial;
            const hot = ph === 'entregaImagem';
            m.emissiveIntensity = hot ? 0.85 + Math.sin(t * 2.6) * 0.35 : 0.06 + k * 0.3;
        }
        if (imgLight.current) {
            imgLight.current.position.set(ix, 1.35, iz);
            imgLight.current.intensity = ph === 'entregaImagem' ? 2.6 + Math.sin(t * 2.6) * 1.1 : k * 1.1;
        }
    });
    return (
        <>
            {/* a imagem sobre a mesa, virada pro player (o alvo do E) */}
            <mesh ref={img} position={[-0.15, 1.0, -1.2]} rotation={[-Math.PI / 2, 0, -0.12]}>
                <planeGeometry args={[0.46, 0.36]} />
                <meshStandardMaterial color="#c9a25a" emissive="#ffb861" emissiveIntensity={0.06} roughness={0.6} />
            </mesh>
            <pointLight ref={imgLight} position={[-0.15, 1.35, -1.2]} distance={2.6} decay={2} color="#ffc478" intensity={0} />
        </>
    );
};

// ── o QUADRO DE CORTIÇA: fichas e fotos ligadas por FIO VERMELHO ─────────────
// (o mesmo fio que aparece amarrado no corrimão do elevador, no final)
const corkTex = colorTex(512, 256, (ctx) => {
    const r = rng(807);
    ctx.fillStyle = '#7c603f'; ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) {
        const v = r();
        ctx.fillStyle = v < 0.5 ? `rgba(60,42,24,${0.08 + r() * 0.1})` : `rgba(150,120,80,${0.06 + r() * 0.08})`;
        ctx.fillRect(r() * 512, r() * 256, 1 + r() * 3, 1 + r() * 3);
    }
    // moldura
    ctx.strokeStyle = '#3a2c1a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 246);
    // fotos/fichas pregadas (com a FICHA EM BRANCO no centro)
    const pins: [number, number][] = [];
    const card = (cx: number, cy: number, w: number, h: number, rot: number, kind: 'photo' | 'ficha' | 'blank') => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
        ctx.fillStyle = kind === 'blank' ? '#efe7d2' : kind === 'ficha' ? '#ddd2b0' : '#c9c2b2';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (kind === 'photo') {
            ctx.fillStyle = '#241c12'; ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 14);
            ctx.fillStyle = `rgba(${170 + r() * 60},${140 + r() * 50},${90 + r() * 40},0.55)`;
            ctx.fillRect(-w / 2 + 6, -h / 2 + 8, (w - 12) * (0.3 + r() * 0.6), h - 22);
        } else if (kind === 'ficha') {
            ctx.fillStyle = 'rgba(50,42,28,0.7)';
            for (let ln = 0; ln < Math.floor(h / 9) - 1; ln++)
                for (let c = 0; c < 3 + r() * 5; c++) ctx.fillRect(-w / 2 + 5 + c * 7, -h / 2 + 8 + ln * 9, 4 + r() * 2, 2);
        } else {
            // a ficha em branco — só um "?" datilografado no meio
            ctx.fillStyle = 'rgba(90,74,48,0.8)'; ctx.font = 'bold 26px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 2);
        }
        ctx.restore();
        pins.push([cx, cy - h / 2 + 6]);
    };
    card(70, 60, 58, 44, -0.08, 'photo');
    card(160, 100, 46, 60, 0.06, 'ficha');
    card(80, 170, 50, 40, 0.1, 'photo');
    card(256, 120, 62, 78, -0.02, 'blank');      // A FICHA EM BRANCO — a do player
    card(360, 62, 54, 42, 0.07, 'photo');
    card(438, 110, 46, 58, -0.09, 'ficha');
    card(372, 186, 56, 44, 0.05, 'photo');
    card(196, 200, 44, 40, -0.06, 'ficha');
    // o FIO VERMELHO: tudo converge na ficha em branco
    ctx.strokeStyle = '#b3232a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const hub: [number, number] = [256, 86];
    for (const [px, py] of pins) {
        if (Math.abs(px - hub[0]) < 4 && Math.abs(py - hub[1]) < 12) continue;
        ctx.beginPath(); ctx.moveTo(px, py);
        const mx = (px + hub[0]) / 2 + (r() - 0.5) * 30, my = (py + hub[1]) / 2 + 14 + r() * 18;
        ctx.quadraticCurveTo(mx, my, hub[0], hub[1]);
        ctx.stroke();
    }
    // percevejos de latão
    for (const [px, py] of pins) {
        ctx.fillStyle = '#c9a145'; ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(70,50,16,0.8)'; ctx.beginPath(); ctx.arc(px + 1, py + 1, 1.4, 0, Math.PI * 2); ctx.fill();
    }
});
const corkMat = new THREE.MeshStandardMaterial({ map: corkTex, roughness: 0.95 });

// sprite circular macio pros pontos de poeira (senão viram quadrados)
const dustSprite = (() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,240,210,1)'); g.addColorStop(0.4, 'rgba(255,240,210,0.55)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    return tex;
})();

/** MARIPOSAS na lâmpada: 3 pontinhos escuros orbitando o bulbo, erráticos.
 *  Coordenadas locais do grupo interno da lâmpada (bulbo em y≈-0.02). */
const Moths: React.FC = () => {
    const refs = useRef<THREE.Mesh[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        refs.current.forEach((m, i) => {
            if (!m) return;
            // órbita nervosa: raio e altura oscilam em frequências dessincronizadas
            const sp = 2.6 + i * 0.9;
            const rad = 0.14 + Math.sin(t * (1.1 + i * 0.53) + i * 9) * 0.08 + Math.sin(t * 4.7 + i) * 0.025;
            const a = t * sp + i * 2.6 + Math.sin(t * 3.1 + i * 4) * 0.55;
            m.position.set(
                Math.cos(a) * rad,
                -0.02 + Math.sin(t * (2.3 + i * 0.7) + i) * 0.09 + Math.sin(t * 7.7 + i * 2) * 0.018,
                Math.sin(a) * rad,
            );
        });
    });
    return (
        <group>
            {[0, 1, 2].map((i) => (
                <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}>
                    <sphereGeometry args={[0.0085, 5, 4]} />
                    <meshBasicMaterial color="#141008" />
                </mesh>
            ))}
        </group>
    );
};

/** Poeira dançando no cone da lâmpada (CPU, ~80 pontos — barato). */
const DustMotes: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = 80;
        const pos = new Float32Array(n * 3);
        const r = rng(808);
        for (let i = 0; i < n; i++) {
            const h = r();                              // 0 no bulbo, 1 no chão
            const rad = 0.08 + h * 1.05;
            const a = r() * Math.PI * 2;
            pos[i * 3] = Math.cos(a) * rad * r();
            pos[i * 3 + 1] = -0.05 - h * 1.85;
            pos[i * 3 + 2] = Math.sin(a) * rad * r();
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return g;
    }, []);
    const pts = useRef<THREE.Points>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const attr = geo.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] -= dt * 0.045;                    // cai devagar
            arr[i] += Math.sin(t * 0.6 + i) * dt * 0.02; // deriva lateral
            if (arr[i + 1] < -1.95) { arr[i + 1] = -0.06; arr[i] *= 0.15; arr[i + 2] *= 0.15; }
        }
        attr.needsUpdate = true;
        if (pts.current) (pts.current.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 1.3) * 0.14;
    });
    return (
        <points ref={pts} geometry={geo}>
            <pointsMaterial map={dustSprite} size={0.02} color="#ffe9c0" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
        </points>
    );
};

/** A fumaça do cigarro esquecido no cinzeiro: 5 fiapos subindo em loop. */
const CigaretteSmoke: React.FC = () => {
    const wisps = useRef<THREE.Mesh[]>([]);
    useFrame(({ clock, camera }) => {
        const t = clock.elapsedTime;
        wisps.current.forEach((w, i) => {
            if (!w) return;
            const k = (t * 0.16 + i / 5) % 1;
            w.position.set(Math.sin(k * 7 + i * 2) * 0.045 * k, 0.04 + k * 0.6, Math.cos(k * 5 + i) * 0.03 * k);
            const s = 0.35 + k * 1.3;
            w.scale.set(s, s, s);
            (w.material as THREE.MeshBasicMaterial).opacity = 0.16 * (1 - k) * Math.min(1, k * 6);
            w.quaternion.copy(camera.quaternion);
        });
    });
    return (
        <group>
            {/* o cigarro apoiado na borda + brasa */}
            <mesh position={[0.05, 0.035, 0]} rotation={[0, 0.4, 0.22]} material={M8.paper}>
                <cylinderGeometry args={[0.006, 0.006, 0.09, 6]} />
            </mesh>
            <mesh position={[0.085, 0.048, 0.016]}>
                <sphereGeometry args={[0.007, 6, 6]} />
                <meshBasicMaterial color="#ff7a30" />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} ref={(m) => { if (m) wisps.current[i] = m; }} position={[0, 0.1, 0]}>
                    <planeGeometry args={[0.085, 0.085]} />
                    <meshBasicMaterial color="#b9b4a8" transparent opacity={0} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
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
    const swing = useRef<THREE.Group>(null!);
    const cone = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        // pêndulo lento e assimétrico — as sombras da sala respiram
        if (swing.current) {
            swing.current.rotation.z = Math.sin(t * 0.62) * 0.055 + Math.sin(t * 0.23 + 1.3) * 0.02;
            swing.current.rotation.x = Math.sin(t * 0.41 + 0.7) * 0.035;
        }
        // o cone de luz respira com a lâmpada (e falha de vez em quando)
        if (cone.current) {
            const drop = Math.sin(t * 7.3) > 0.994 ? 0.4 : 1;
            (cone.current.material as THREE.MeshBasicMaterial).opacity = (0.05 + Math.sin(t * 0.9) * 0.008) * drop;
        }
    });
    return (
        <group position={[0, 2.95, -1.6]}>
            {/* pivô no TETO: o conjunto todo pende e balança daqui */}
            <group ref={swing}>
                <B a={[0.03, 0.9, 0.03]} p={[0, -0.45, 0]} m={M8.steelDk} />
                <group position={[0, -0.95, 0]}>
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
                    {/* o CONE DE LUZ (volumétrico falso) + a poeira dançando dentro */}
                    <mesh ref={cone} position={[0, -0.99, 0]}>
                        <coneGeometry args={[1.15, 1.94, 20, 1, true]} />
                        <meshBasicMaterial color="#ffdc9a" transparent opacity={0.05} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
                    </mesh>
                    <DustMotes />
                    <Moths />
                </group>
            </group>
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
        {/* máquina de escrever (a do 612) — corpo + carro + teclas + a FICHA no rolo */}
        <group position={[0.66, 1.06, -0.02]}>
            <B a={[0.34, 0.14, 0.3]} p={[0, 0, 0]} m={M8.steel} />
            <B a={[0.36, 0.04, 0.08]} p={[0, 0.1, -0.12]} m={M8.steel} />
            <B a={[0.28, 0.05, 0.12]} p={[0, -0.02, 0.13]} m={M8.steel} />
            {/* a folha meio datilografada, curvada pra trás do rolo */}
            <mesh position={[0, 0.19, -0.14]} rotation={[-0.34, 0, 0.02]} material={M8.paper}>
                <planeGeometry args={[0.24, 0.2]} />
            </mesh>
        </group>
        {/* cinzeiro + o cigarro esquecido fumegando + caneca */}
        <mesh position={[-0.05, 1.0, -0.34]} material={M8.steel}><cylinderGeometry args={[0.08, 0.07, 0.03, 12]} /></mesh>
        <group position={[-0.05, 1.01, -0.34]}><CigaretteSmoke /></group>
        <mesh position={[0.4, 1.02, 0.34]} material={M8.paper}><cylinderGeometry args={[0.05, 0.045, 0.09, 12]} /></mesh>
        {/* a luminária de banqueiro (a poça verde sobre a ficha) */}
        <BankerLamp />
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
        const mirrorM = useRef<THREE.MeshStandardMaterial>(null!);

        // o tom-de-sala (drone + baques do tubo + datilografia ao longe):
        // liga enquanto a sala 3D está montada, pausa dentro da imagem.
        useEffect(() => {
            const sync = () => {
                const inImg = f8.phase === 'corredor20' || f8.phase === 'porta21'
                    || f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
                if (inImg) f8RoomToneStop(); else f8RoomToneStart();
            };
            sync();
            const un = f8Subscribe(sync);
            return () => { un(); f8RoomToneStop(); };
        }, []);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            f8Tick(dt, playerPositionRef.current.z);
            const t = performance.now();
            if (lamp.current) lamp.current.intensity = 44 + Math.sin(t * 0.004) * 3;
            // o espelho falso respira uma luz fria — tem alguém do outro lado
            if (mirrorM.current) mirrorM.current.emissiveIntensity = 0.07 + Math.sin(t * 0.00042) * 0.055;
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
                {/* a escada do arquivo, a caixa caída, o maço amarrado */}
                <ArchiveLadder pos={[-3.32, 0, -6.4]} rotY={Math.PI / 2} />
                <FloorClutter />
                {/* o stencil na parede norte + o relógio parado */}
                <mesh position={[0, 2.62, -0.06]} rotation={[0, Math.PI, 0]} material={stencilMat}>
                    <planeGeometry args={[2.6, 0.48]} />
                </mesh>
                <ArchiveClock />

                {/* ── a segunda camada do set ─────────────────────────────── */}
                {/* lambri de madeira na base da parede norte + rodapés */}
                <B a={[W - 0.2, 0.85, 0.05]} p={[0, 0.425, -0.08]} m={M8.wood} />
                <B a={[W - 0.2, 0.05, 0.07]} p={[0, 0.87, -0.08]} m={M8.steelDk} />
                {/* o tapete surrado sob a mesa do interrogatório */}
                <mesh position={[0, 0.012, -1.85]} rotation={[-Math.PI / 2, 0, 0]} material={rugMat}>
                    <planeGeometry args={[3.1, 2.5]} />
                </mesh>
                {/* fichários de gavetinhas: flanqueando a cena + um baixo no fundo */}
                <CardCatalog pos={[-3.35, 0, -1.05]} rotY={Math.PI / 2} />
                <CardCatalog pos={[3.35, 0, -1.2]} rotY={-Math.PI / 2} h={1.15} />
                <CardCatalog pos={[-2.0, 0, -9.55]} w={1.1} h={0.9} />
                {/* o tubo pneumático por onde as fichas chegam */}
                <PneumaticTube />
                {/* as janelas altas do arquivo-além (a luz FRIA da sala) */}
                <Transom x={-2.35} />
                <Transom x={2.6} />
                <pointLight position={[0, 2.55, -0.9]} distance={3.4} decay={2} color="#6f98a8" intensity={2.2} />
                {/* vigas + cabos + a teia do fio vermelho */}
                <CeilingWork />
                <ThreadWeb />
                {/* mancha úmida ao redor do dreno */}
                <mesh position={[0, 0.008, -5.2]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[0.62, 18]} />
                    <meshStandardMaterial color="#3a3529" roughness={1} transparent opacity={0.55} />
                </mesh>
                {/* atrás do Arquivista: dois arquivos de gaveta + o espelho falso */}
                <group position={[-2.4, 0, -0.28]}>
                    <B a={[0.9, 1.4, 0.5]} p={[0, 0.7, 0]} m={M8.steelDk} />
                    {[0.35, 0.72, 1.09].map((y, i) => (<B key={i} a={[0.7, 0.28, 0.03]} p={[0, y, 0.26]} m={M8.steel} />))}
                    {[0.35, 0.72, 1.09].map((y, i) => (<mesh key={'h' + i} position={[0, y, 0.28]} material={M8.steelDk}><boxGeometry args={[0.16, 0.03, 0.03]} /></mesh>))}
                </group>
                <mesh position={[2.2, 1.45, -0.24]}>
                    <boxGeometry args={[1.7, 1.1, 0.05]} />
                    <meshStandardMaterial ref={mirrorM} color="#10131a" roughness={0.12} metalness={0.85} emissive="#3a5866" emissiveIntensity={0.16} />
                </mesh>
                <B a={[1.84, 0.06, 0.07]} p={[2.2, 2.03, -0.22]} m={M8.steelDk} />
                <B a={[1.84, 0.06, 0.07]} p={[2.2, 0.87, -0.22]} m={M8.steelDk} />
                {/* o QUADRO DE CORTIÇA atrás dele: fichas ligadas por fio vermelho,
                    todas convergindo na FICHA EM BRANCO (a do player) */}
                <mesh position={[0, 1.68, -0.055]} rotation={[0, Math.PI, 0]} material={corkMat}>
                    <planeGeometry args={[2.3, 1.18]} />
                </mesh>
                <B a={[2.42, 0.07, 0.06]} p={[0, 2.3, -0.05]} m={M8.wood} />
                <B a={[2.42, 0.07, 0.06]} p={[0, 1.06, -0.05]} m={M8.wood} />

                {/* a mesa + a lâmpada engaiolada + cadeiras */}
                <Desk />
                <CagedLamp lampRef={lamp} />
                <InterroDirector />
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
