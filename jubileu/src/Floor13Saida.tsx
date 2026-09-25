/**
 * Floor13Saida.tsx — a saída de Vindhjem.
 *
 * A porta de latão da casa certa abre (DING) e mostra a cabine. O hóspede
 * olha para trás, para a cidade que está deixando — e todo morador vira a
 * cabeça para ele ao mesmo tempo. Então a simulação desliga o andar: o mundo
 * vira chuva de runas azuis e some (f13Chuva). No escuro, a mesma chuva
 * materializa em volta dele a cabine do elevador do hotel, de portas
 * fechadas; o mostrador acende o 13, o ding toca e a viagem segue.
 *
 * Tudo aqui anda no relógio de parede (não no dt do quadro): a cena dura o
 * mesmo em qualquer aparelho, e a bancada a 2 qps a atravessa inteira.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pbr } from './f13Texturas';
import { chaoEm } from './f13Mundo';
import type { EfeitoChuva } from './f13Chuva';
import { tocarDesmaterializar, tocarMaterializar, tocarDingDoHotel, pararAmbiente } from './floor13Sfx';

/** Os marcos da cena, em segundos desde a batida na porta. */
export const LINHA_DA_SAIDA = Object.freeze({
    /** as portas abriram, o olho chegou à soleira: começa a virar */
    virar: 2.2,
    /** de costas para a porta, olhando a cidade (e a cidade olhando de volta) */
    olhar: 3.5,
    /** começa a chuva */
    chuva: 4.1,
    /** tudo apagado */
    escuro: 7.3,
    /** a cabine começa a se materializar */
    cabine: 7.4,
    /** a cabine inteira */
    inteira: 8.9,
    /** o elevador segue viagem (onExit) */
    fim: 11,
});

/** Onde a cabine fica (longe do mundo, que some antes dela aparecer). */
export const POS_CABINE = Object.freeze(new THREE.Vector3(0, -60, 0));
const CW = 2.3, CD = 2.1, CH = 2.55, VAO = 1.04, ALTO_PORTA = 2.1;

/** Bancada (só em DEV): `?f13saida=5` congela a saída nesse instante. */
const tFixo: number | null = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('f13saida')
    ? parseFloat(new URLSearchParams(location.search).get('f13saida') ?? '0') : null;

const suave = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const vaiVolta = (x: number) => .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

// ── AS TEXTURAS DA CABINE (canvas: nada vem de fora) ──────────────────────
let texMostrador: THREE.CanvasTexture | null = null;
/** O mostrador sobre a porta: vidro preto, "13" em âmbar e a seta de subida. */
function texturaDoMostrador(): THREE.CanvasTexture {
    if (texMostrador) return texMostrador;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d')!;
    const fundo = g.createLinearGradient(0, 0, 0, 96); fundo.addColorStop(0, '#1b1612'); fundo.addColorStop(1, '#070504');
    g.fillStyle = fundo; g.fillRect(0, 0, 256, 96);
    g.shadowColor = '#ffb13a'; g.shadowBlur = 14;
    g.fillStyle = '#ffc45a'; g.font = 'bold 68px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('13', 150, 52);
    g.beginPath(); g.moveTo(58, 24); g.lineTo(84, 64); g.lineTo(32, 64); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, 256, 30);
    texMostrador = new THREE.CanvasTexture(c); texMostrador.colorSpace = THREE.SRGBColorSpace;
    return texMostrador;
}

let texBotoeira: THREE.CanvasTexture | null = null;
/** A botoeira: placa de aço escovado, botões de latão de 1 a 14, o 13 aceso. */
function texturaDaBotoeira(): THREE.CanvasTexture {
    if (texBotoeira) return texBotoeira;
    const c = document.createElement('canvas'); c.width = 128; c.height = 288;
    const g = c.getContext('2d')!;
    const aco = g.createLinearGradient(0, 0, 128, 0); aco.addColorStop(0, '#5d6166'); aco.addColorStop(.5, '#8d9197'); aco.addColorStop(1, '#55595e');
    g.fillStyle = aco; g.fillRect(0, 0, 128, 288);
    for (let y = 0; y < 288; y += 2) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(0, y, 128, 1); }
    g.strokeStyle = 'rgba(20,20,20,.7)'; g.lineWidth = 3; g.strokeRect(4, 4, 120, 280);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 15px monospace';
    for (let n = 1; n <= 14; n++) {
        const i = n - 1, x = i % 2 ? 86 : 42, y = 244 - Math.floor(i / 2) * 30;
        const aceso = n === 13;
        g.fillStyle = '#2b2622'; g.beginPath(); g.arc(x, y, 12.5, 0, Math.PI * 2); g.fill();
        const b = g.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
        b.addColorStop(0, aceso ? '#fff4c8' : '#f0d58a'); b.addColorStop(1, aceso ? '#ffb02e' : '#9a7430');
        g.fillStyle = b; g.beginPath(); g.arc(x, y, 10.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = aceso ? '#5a2a00' : '#2a1d0e'; g.fillText(String(n), x, y + 1);
    }
    // alarme e abrir porta
    g.fillStyle = '#b8352a'; g.beginPath(); g.arc(42, 272, 8, 0, 7); g.fill();
    g.fillStyle = '#2f7a44'; g.beginPath(); g.arc(86, 272, 8, 0, 7); g.fill();
    g.fillStyle = '#1b1612'; g.fillRect(24, 12, 80, 26);
    g.fillStyle = '#ffc45a'; g.font = 'bold 18px monospace'; g.fillText('▲ 13', 64, 26);
    texBotoeira = new THREE.CanvasTexture(c); texBotoeira.colorSpace = THREE.SRGBColorSpace;
    return texBotoeira;
}

let texMarmore: THREE.CanvasTexture | null = null;
/** Mármore creme do piso: veios cinzentos finos, sem repetição visível. */
function texturaDeMarmore(): THREE.CanvasTexture {
    if (texMarmore) return texMarmore;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2ebdd'; g.fillRect(0, 0, 256, 256);
    let k = 11; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    for (let i = 0; i < 18; i++) {
        let x = r() * 256, y = r() * 256, a = r() * Math.PI * 2;
        g.strokeStyle = `rgba(120,110,95,${.08 + r() * .14})`; g.lineWidth = .6 + r() * 1.6;
        g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 30; j++) { a += (r() - .5) * .7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
        g.stroke();
    }
    texMarmore = new THREE.CanvasTexture(c); texMarmore.colorSpace = THREE.SRGBColorSpace;
    return texMarmore;
}

let texAco: THREE.CanvasTexture | null = null;
/** Aço escovado vertical das folhas da porta (rugosidade em riscos). */
function texturaDeAco(): THREE.CanvasTexture {
    if (texAco) return texAco;
    const c = document.createElement('canvas'); c.width = 128; c.height = 8;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 128; x++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 8); }
    texAco = new THREE.CanvasTexture(c); texAco.wrapS = texAco.wrapT = THREE.RepeatWrapping;
    return texAco;
}

/**
 * A cabine do elevador do hotel, na escala de Vindhjem: paredes de madeira
 * almofadadas com rodapé escuro e corrimão de latão, piso creme com o losango
 * dourado, teto com quatro luminárias, frente de aço com as portas fechadas,
 * o mostrador em cima e a botoeira ao lado.
 */
export const CabineDoElevador: React.FC = () => {
    const madeira = useMemo(() => pbr('carvalho', .9, .9), []);
    // dentro da cabine não há céu para refletir: reflexo de ambiente baixo
    const aco = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6a7078', metalness: .65, roughness: .58, roughnessMap: texturaDeAco(), envMapIntensity: .3 }), []);
    const latao = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9974a', metalness: .9, roughness: .3, envMapIntensity: .5 }), []);
    const escuro = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2c1c12', roughness: .7 }), []);
    const parede = useMemo(() => new THREE.MeshStandardMaterial({ ...madeira, color: '#a87450', roughness: .55 }), [madeira]);
    const almofada = useMemo(() => new THREE.MeshStandardMaterial({ ...madeira, color: '#8a5a3a', roughness: .5 }), [madeira]);
    const creme = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cdbfa6', roughness: .3, map: texturaDeMarmore(), envMapIntensity: .4 }), []);
    const ouro = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d4a336', metalness: .7, roughness: .3 }), []);
    const mostrador = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => { if (mostrador.current) mostrador.current.color.setScalar(.85 + Math.sin(clock.elapsedTime * 3) * .15); });

    // lados e fundo: três paredes, cada uma com duas almofadas e o corrimão
    const paredes: Array<{ pos: [number, number, number]; rot: number; larg: number }> = [
        { pos: [0, 0, -CD / 2], rot: 0, larg: CW },
        { pos: [-CW / 2, 0, 0], rot: Math.PI / 2, larg: CD },
        { pos: [CW / 2, 0, 0], rot: -Math.PI / 2, larg: CD },
    ];
    const lado = (CW - VAO) / 2;
    return <group position={POS_CABINE}>
        {/* piso creme com o losango dourado (o mesmo do saguão) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={creme}><planeGeometry args={[CW, CD]} /></mesh>
        {[[1.15, ouro], [.98, creme], [.36, ouro]].map(([s, m], i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, .002 + i * .001, 0]} material={m as THREE.Material}><planeGeometry args={[s as number, s as number]} /></mesh>
        ))}
        {paredes.map((p, i) => (
            <group key={i} position={p.pos} rotation={[0, p.rot, 0]}>
                <mesh position={[0, CH / 2, 0]} material={parede}><boxGeometry args={[p.larg, CH, .06]} /></mesh>
                {/* rodapé escuro e friso na altura do corrimão */}
                <mesh position={[0, .07, .035]} material={escuro}><boxGeometry args={[p.larg, .14, .02]} /></mesh>
                <mesh position={[0, .86, .035]} material={escuro}><boxGeometry args={[p.larg, .05, .02]} /></mesh>
                {/* almofadas: dois painéis em relevo acima do friso */}
                {[-1, 1].map((k) => <mesh key={k} position={[k * p.larg / 4.1, 1.62, .04]} material={almofada}><boxGeometry args={[p.larg / 2 - .22, 1.2, .025]} /></mesh>)}
                {[-1, 1].map((k) => <mesh key={`b${k}`} position={[k * p.larg / 4.1, .46, .04]} material={almofada}><boxGeometry args={[p.larg / 2 - .22, .5, .025]} /></mesh>)}
                {/* corrimão de latão com os dois suportes */}
                <mesh position={[0, .95, .1]} rotation={[0, 0, Math.PI / 2]} material={latao}><cylinderGeometry args={[.02, .02, p.larg - .3, 12]} /></mesh>
                {[-1, 1].map((k) => <mesh key={`s${k}`} position={[k * (p.larg / 2 - .25), .95, .065]} rotation={[Math.PI / 2, 0, 0]} material={latao}><cylinderGeometry args={[.012, .012, .07, 8]} /></mesh>)}
            </group>
        ))}
        {/* teto escuro com quatro luminárias redondas */}
        <mesh position={[0, CH, 0]} rotation={[Math.PI / 2, 0, 0]} material={escuro}><planeGeometry args={[CW, CD]} /></mesh>
        {[[-.55, -.5], [.55, -.5], [-.55, .5], [.55, .5]].map(([x, z]) => <group key={`${x}${z}`} position={[x, CH - .005, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[.13, 24]} /><meshBasicMaterial color={new THREE.Color('#fff4d6').multiplyScalar(1.6)} toneMapped={false} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, .001, 0]} material={latao}><ringGeometry args={[.13, .16, 24]} /></mesh>
        </group>)}
        <pointLight position={[0, CH - .12, -.35]} intensity={9} distance={8} decay={2} color="#ffe8cc" />
        {/* a frente: painéis de aço, o vão com as duas folhas fechadas */}
        <group position={[0, 0, CD / 2]}>
            {[-1, 1].map((k) => <mesh key={k} position={[k * (VAO / 2 + lado / 2), CH / 2, 0]} material={aco}><boxGeometry args={[lado, CH, .06]} /></mesh>)}
            <mesh position={[0, ALTO_PORTA + (CH - ALTO_PORTA) / 2, 0]} material={aco}><boxGeometry args={[VAO, CH - ALTO_PORTA, .06]} /></mesh>
            {/* batente de latão em volta do vão */}
            <mesh position={[0, ALTO_PORTA + .02, -.035]} material={latao}><boxGeometry args={[VAO + .08, .04, .03]} /></mesh>
            {[-1, 1].map((k) => <mesh key={`bt${k}`} position={[k * (VAO / 2 + .02), ALTO_PORTA / 2, -.035]} material={latao}><boxGeometry args={[.04, ALTO_PORTA, .03]} /></mesh>)}
            {/* as folhas, fechadas, com a fresta do meio */}
            {[-1, 1].map((k) => <mesh key={`f${k}`} position={[k * VAO / 4, ALTO_PORTA / 2, -.02]} material={aco}><boxGeometry args={[VAO / 2 - .006, ALTO_PORTA, .035]} /></mesh>)}
            <mesh position={[0, ALTO_PORTA / 2, -.04]}><boxGeometry args={[.006, ALTO_PORTA, .005]} /><meshBasicMaterial color="#0c0c0c" /></mesh>
            {/* o mostrador sobre a porta */}
            <mesh position={[0, ALTO_PORTA + .22, -.045]}><boxGeometry args={[.46, .19, .02]} /><meshStandardMaterial color="#1a1512" roughness={.2} metalness={.3} /></mesh>
            <mesh position={[0, ALTO_PORTA + .22, -.056]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[.42, .158]} /><meshBasicMaterial ref={mostrador} map={texturaDoMostrador()} toneMapped={false} />
            </mesh>
            {/* a botoeira, à direita de quem olha a porta */}
            <group position={[-(VAO / 2 + .26), 1.22, -.04]} rotation={[0, Math.PI, 0]}>
                <mesh position={[0, 0, -.006]}><boxGeometry args={[.2, .44, .012]} /><meshStandardMaterial color="#2a2622" metalness={.6} roughness={.4} /></mesh>
                <mesh position={[0, 0, .001]}><planeGeometry args={[.18, .405]} /><meshStandardMaterial map={texturaDaBotoeira()} metalness={.5} roughness={.4} emissive="#ffffff" emissiveMap={texturaDaBotoeira()} emissiveIntensity={.18} /></mesh>
            </group>
        </group>
    </group>;
};

// ── O CONDUTOR DA CENA ───────────────────────────────────────────────────
const _dir = new THREE.Vector3(), _alvo = new THREE.Vector3(), _pos = new THREE.Vector3();

/** Direção de olhar a partir de um giro (y) e de uma inclinação (x). */
function direcao(yaw: number, pitch: number, v: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(pitch);
    return v.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
}

/**
 * Conduz a saída: a câmera, o estado da chuva, os sons e a troca do mundo
 * pela cabine. `t0` é o instante (performance.now) da batida na porta certa.
 */
export const SaidaDoAndar: React.FC<{
    t0: React.MutableRefObject<number | null>;
    porta: React.MutableRefObject<THREE.Vector3 | null>;
    frente: React.MutableRefObject<THREE.Vector3 | null>;
    efeito: EfeitoChuva;
    aoEntrarNaCabine: () => void;
    aoFim: () => void;
}> = ({ t0, porta, frente, efeito, aoEntrarNaCabine, aoFim }) => {
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const inicio = useRef<{ pos: THREE.Vector3; olhar: THREE.Vector3 } | null>(null);
    const marcos = useRef({ chuva: false, cabine: false, materializa: false, ding: false, fim: false });
    useFrame(() => {
        const t00 = t0.current, P = porta.current, F = frente.current;
        if (t00 === null || !P || !F) return;
        const ts = tFixo ?? (performance.now() - t00) / 1000, L = LINHA_DA_SAIDA, m = marcos.current;
        const retrato = size.width < size.height;
        if (!inicio.current) {
            camera.getWorldDirection(_dir);
            inicio.current = { pos: camera.position.clone(), olhar: camera.position.clone().addScaledVector(_dir, 4) };
        }
        // ── a chuva (0 = mundo, 1 = apagado) ─────────────────────────────
        let s = 0;
        if (ts >= L.chuva && ts < L.escuro) s = vaiVolta((ts - L.chuva) / (L.escuro - L.chuva));
        else if (ts >= L.escuro && ts < L.cabine) s = 1;
        else if (ts >= L.cabine && ts < L.inteira) s = 1 - vaiVolta((ts - L.cabine) / (L.inteira - L.cabine));
        efeito.estado = s;
        if (ts >= L.chuva && !m.chuva) { m.chuva = true; tocarDesmaterializar(); pararAmbiente(); }
        if (ts >= (L.escuro + L.cabine) / 2 && !m.cabine) { m.cabine = true; aoEntrarNaCabine(); }
        if (ts >= L.cabine && !m.materializa) { m.materializa = true; tocarMaterializar(); }
        if (ts >= L.inteira + .3 && !m.ding) { m.ding = true; tocarDingDoHotel(); }
        if (ts >= L.fim && !m.fim) { m.fim = true; aoFim(); }

        const cam = camera as THREE.PerspectiveCamera;
        if (m.cabine) {
            // ── dentro da cabine: encostado no fundo, de frente para as
            // portas fechadas e um pouco de lado (cabem o losango do piso, a
            // parede com o corrimão e a botoeira); o corpo "assenta" ─────────
            const assenta = 1 - suave((ts - L.cabine) / 1.6);
            _pos.set(POS_CABINE.x + .42, POS_CABINE.y + 1.6 + assenta * .05, POS_CABINE.z - .88);
            _alvo.set(POS_CABINE.x - .3, POS_CABINE.y + 1.25 + assenta * .1, POS_CABINE.z + CD / 2);
            camera.position.copy(_pos); camera.lookAt(_alvo);
            camera.rotateZ(Math.sin(ts * .7) * .006 + assenta * .03);
            cam.fov = retrato ? 80 : 66; cam.updateProjectionMatrix();
            return;
        }
        // ── na porta: aproxima, a porta abre, olha a cabine, vira para trás ─
        const chao = chaoEm(P.x + F.x * 2, P.z + F.z * 2) ?? P.y - .8;
        const olho = chao + 1.62;
        const yawPorta = Math.atan2(-F.x, -F.z);
        // de frente para a porta (0) até de costas para ela (π), virando para a esquerda
        const giro = Math.PI * vaiVolta((ts - L.virar) / (L.olhar - L.virar));
        const recuo = ts < L.virar ? 3 - 1.1 * suave((ts - .8) / (L.virar - .8)) : 1.9 - .35 * suave((ts - L.virar) / (L.olhar - L.virar));
        // olhando a porta, a cabeça abaixa um pouco (a porta é baixa); virada, olha a cidade lá embaixo
        const pitch = THREE.MathUtils.lerp(-.1, -.07, suave((ts - L.virar) / (L.olhar - L.virar)));
        _pos.set(P.x + F.x * recuo, olho, P.z + F.z * recuo);
        if (ts >= L.olhar) {
            // de costas para a porta, um passo lento para a frente e uma leve oscilação
            const k = ts - L.olhar;
            _pos.addScaledVector(F, k * .06);
            _pos.y += Math.sin(k * 1.3) * .01;
        }
        direcao(yawPorta + giro, pitch + Math.sin(giro) * .05, _dir);
        _alvo.copy(_pos).addScaledVector(_dir, 5);
        // no começo, sai de onde a câmera estava
        const k = suave(ts / 1.2), ini = inicio.current;
        camera.position.lerpVectors(ini.pos, _pos, k);
        _alvo.lerpVectors(ini.olhar, _alvo, k);
        camera.lookAt(_alvo);
        if (ts >= L.chuva) camera.rotateZ(Math.sin((ts - L.chuva) * .8) * .012);
        cam.fov = retrato ? 76 : 64; cam.updateProjectionMatrix();
    });
    return null;
};
