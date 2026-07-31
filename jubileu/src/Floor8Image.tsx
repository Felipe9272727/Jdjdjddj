/**
 * Floor8Image.tsx — DENTRO DA IMAGEM: o corredor de vinte portas + a porta 21.
 *
 * Quando o player mergulha na imagem que o Arquivista estende (fase corredor20),
 * este overlay 2.5D lateral assume a tela: um corredor de hotel que se perde na
 * penumbra, vinte portas numeradas, arandelas mornas recuando. O player anda com
 * a lanterna na mão revelando o mundo — e no fim, a PORTA 21, que não pertence a
 * andar nenhum: a memória apagada dele mesmo, entreaberta e brilhando, com fios
 * de lã escapando (o prenúncio do tricô do M4).
 *
 * Câmera ortográfica (2.5D, molde Floor4Canvas2D) + névoa pra profundidade +
 * tratamento "foto" (vinheta quente + grão). Ao alcançar a 21, o prompt chama
 * f8EnterDoor21 → o platformer (M4).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f8, f8Subscribe, f8ReachDoor21, f8EnterDoor21, f8Objective, F8_DOORS } from './f8Arquivo';

const DOOR0 = 3;
const DOOR_GAP = 2.4;
const DOOR21_X = DOOR0 + F8_DOORS * DOOR_GAP + 1.6;
const END_X = DOOR21_X + 2.5;

// ── texturas procedurais ─────────────────────────────────────────────────────
function cvs(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, rep?: [number, number]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
}
const rnd = () => Math.random();

const numCache = new Map<string, THREE.CanvasTexture>();
function numTex(label: string, warm = false): THREE.CanvasTexture {
    const key = label + (warm ? 'w' : '');
    const hit = numCache.get(key); if (hit) return hit;
    const t = cvs(72, 96, (x) => {
        x.fillStyle = warm ? '#3a2a12' : '#171310'; x.fillRect(0, 0, 72, 96);
        const g = x.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
        x.fillStyle = g; x.fillRect(0, 0, 72, 96);
        x.strokeStyle = warm ? '#a9822f' : '#5a4c34'; x.lineWidth = 4; x.strokeRect(4, 4, 64, 88);
        x.fillStyle = warm ? '#ffe6a8' : '#c9b481';
        x.font = 'bold 46px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(label, 36, 50);
    });
    numCache.set(key, t); return t;
}

const wallpaperTex = cvs(128, 256, (x) => {
    x.fillStyle = '#3b3226'; x.fillRect(0, 0, 128, 256);
    // faixas verticais suaves (papel de parede listrado)
    for (let i = 0; i < 128; i += 16) { x.fillStyle = i % 32 === 0 ? 'rgba(90,74,48,0.22)' : 'rgba(20,16,10,0.18)'; x.fillRect(i, 0, 8, 256); }
    // damasco pontilhado
    for (let yy = 12; yy < 256; yy += 34) for (let xx = 8; xx < 128; xx += 32) {
        x.strokeStyle = 'rgba(120,96,58,0.20)'; x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(xx + (yy % 68 ? 16 : 0), yy, 6, 10, 0, 0, 7); x.stroke();
    }
    // manchas de água descendo
    for (let i = 0; i < 6; i++) { const xx = rnd() * 128; const g = x.createLinearGradient(xx, 0, xx, 256); g.addColorStop(0, 'rgba(16,12,8,0.3)'); g.addColorStop(1, 'rgba(16,12,8,0)'); x.fillStyle = g; x.fillRect(xx, 0, 3 + rnd() * 4, 256); }
}, [Math.ceil(END_X / 2.5), 1]);

const runnerTex = cvs(64, 256, (x) => {
    x.fillStyle = '#2a2a2e'; x.fillRect(0, 0, 64, 256);
    x.fillStyle = '#6b1f22'; x.fillRect(8, 0, 48, 256);           // passadeira vermelha
    x.strokeStyle = '#b8923f'; x.lineWidth = 2; x.strokeRect(11, 0, 42, 256);
    for (let yy = 8; yy < 256; yy += 26) { x.strokeStyle = 'rgba(184,146,63,0.5)'; x.beginPath(); x.moveTo(16, yy); x.lineTo(48, yy + 8); x.lineTo(16, yy + 16); x.stroke(); }
    for (let i = 0; i < 180; i++) { x.fillStyle = `rgba(10,6,6,${rnd() * 0.3})`; x.fillRect(rnd() * 64, rnd() * 256, 2, 2); }
}, [1, Math.ceil(END_X / 3)]);

const woodTex = cvs(64, 128, (x) => {
    x.fillStyle = '#4a3626'; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 18; i++) { x.strokeStyle = `rgba(${30 + rnd() * 20},${20 + rnd() * 12},12,0.5)`; x.lineWidth = 1; const xx = rnd() * 64; x.beginPath(); x.moveTo(xx, 0); x.bezierCurveTo(xx + (rnd() - 0.5) * 8, 42, xx + (rnd() - 0.5) * 8, 85, xx, 128); x.stroke(); }
});

/** Halo radial suave (luz sem custo) — substitui os quads chapados. */
function haloTex(inner: string, outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
    return cvs(128, 128, (x) => {
        const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
        g.addColorStop(0, inner); g.addColorStop(1, outer);
        x.fillStyle = g; x.beginPath(); x.arc(64, 64, 63, 0, 7); x.fill();
    });
}
const warmHalo = haloTex('rgba(255,196,110,0.85)');
const doorHalo = haloTex('rgba(255,178,90,0.9)');
const shadowBlob = haloTex('rgba(0,0,0,0.55)');

/** Quadrinho de parede: paisagem borrada numa moldura (procedural, com seed). */
const paintCache = new Map<number, THREE.CanvasTexture>();
function paintingTex(seed: number): THREE.CanvasTexture {
    const hit = paintCache.get(seed); if (hit) return hit;
    const t = cvs(64, 80, (x) => {
        const r = (() => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
        const hues = [['#5a4a33', '#8a7550'], ['#3d4a42', '#6a7a60'], ['#4a3a45', '#7a5a68']][seed % 3];
        const g = x.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, hues[1]); g.addColorStop(1, hues[0]);
        x.fillStyle = g; x.fillRect(0, 0, 64, 80);
        for (let i = 0; i < 7; i++) {
            x.fillStyle = `rgba(${20 + r() * 60},${18 + r() * 45},${14 + r() * 30},0.5)`;
            x.beginPath(); x.ellipse(r() * 64, 26 + r() * 48, 6 + r() * 16, 3 + r() * 8, r(), 0, 7); x.fill();
        }
        // "céu" e um traço de horizonte
        x.fillStyle = 'rgba(220,200,150,0.25)'; x.fillRect(0, 0, 64, 18);
        x.strokeStyle = 'rgba(16,12,8,0.65)'; x.lineWidth = 5; x.strokeRect(2, 2, 60, 76);
    });
    paintCache.set(seed, t); return t;
}

const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallpaperTex, roughness: 1 }),
    runner: new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ color: '#1c150f', roughness: 1 }),
    ceil: new THREE.MeshStandardMaterial({ color: '#0e0b08', roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: '#26190f', roughness: 0.85 }),
    frame: new THREE.MeshStandardMaterial({ color: '#3a2718', roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, color: '#a98a63' }),
    panel: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75, color: '#6e553b' }),
    brass: new THREE.MeshStandardMaterial({ color: '#c69a4a', roughness: 0.35, metalness: 0.85 }),
    kick: new THREE.MeshStandardMaterial({ color: '#7a6a4a', roughness: 0.4, metalness: 0.7 }),
    door21: new THREE.MeshStandardMaterial({ color: '#caa25a', emissive: '#8a5a1a', emissiveIntensity: 0.8, roughness: 0.5 }),
    yarn: new THREE.MeshStandardMaterial({ color: '#c0432f', emissive: '#6a1e12', emissiveIntensity: 0.5, roughness: 1 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffcf8a' }),
    warmGlow: new THREE.MeshBasicMaterial({ color: '#ffb45e', transparent: true, opacity: 0.5 }),
    sconce: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.6, metalness: 0.4 }),
    skin: new THREE.MeshStandardMaterial({ color: '#b89575', roughness: 0.7 }),
    hat: new THREE.MeshStandardMaterial({ color: '#1a1712', roughness: 0.9 }),
    coat: new THREE.MeshStandardMaterial({ color: '#2b2620', roughness: 0.95 }),
    lantern: new THREE.MeshStandardMaterial({ color: '#3a3026', roughness: 0.5, metalness: 0.5 }),
};

const Bx: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);
const Pl: React.FC<{ a: [number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><planeGeometry args={a} /></mesh>);

const haloMat = new THREE.MeshBasicMaterial({ map: warmHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const doorHaloMat = new THREE.MeshBasicMaterial({ map: doorHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowBlob, transparent: true, depthWrite: false });

/** Arandela de parede — copo + bulbo + HALO radial suave (nada de quad chapado). */
const Sconce: React.FC<{ x: number }> = ({ x }) => (
    <group position={[x, 2.55, -0.3]}>
        <Bx a={[0.06, 0.28, 0.06]} p={[0, -0.16, 0]} m={M.sconce} />
        <mesh position={[0, 0, 0.02]} material={M.sconce}><coneGeometry args={[0.12, 0.22, 10, 1, true]} /></mesh>
        <mesh position={[0, 0.02, 0.04]}><sphereGeometry args={[0.06, 8, 8]} /><meshBasicMaterial color="#ffce87" /></mesh>
        <Pl a={[1.5, 1.5]} p={[0, 0.05, 0.09]} m={haloMat} />
        {/* poça de luz que a arandela joga na parede, alongada */}
        <mesh position={[0, -0.5, 0.06]} scale={[0.6, 1.6, 1]} material={haloMat}><planeGeometry args={[1, 1]} /></mesh>
    </group>
);

/** Quadro entre portas (moldura + paisagem procedural, levemente torto). */
const Painting: React.FC<{ x: number; seed: number }> = ({ x, seed }) => (
    <group position={[x, 1.78, -0.36]} rotation={[0, 0, (seed % 5 - 2) * 0.015]}>
        <Bx a={[0.5, 0.62, 0.04]} p={[0, 0, 0]} m={M.frame} />
        <mesh position={[0, 0, 0.025]}><planeGeometry args={[0.42, 0.54]} /><meshStandardMaterial map={paintingTex(seed)} roughness={0.9} /></mesh>
    </group>
);

/** Mesinha-console com vaso e flores secas (a cada tantas portas). */
const Console: React.FC<{ x: number }> = ({ x }) => (
    <group position={[x, 0, -0.28]}>
        <Bx a={[0.7, 0.05, 0.26]} p={[0, 0.78, 0]} m={M.frame} />
        {[-0.28, 0.28].map((dx, i) => (
            <mesh key={i} position={[dx, 0.39, 0]} material={M.frame}><cylinderGeometry args={[0.03, 0.04, 0.78, 6]} /></mesh>
        ))}
        <mesh position={[0.12, 0.92, 0]} material={M.sconce}><cylinderGeometry args={[0.05, 0.08, 0.22, 8]} /></mesh>
        {/* hastes secas no vaso */}
        {[-0.12, 0, 0.14].map((rz, i) => (
            <mesh key={'h' + i} position={[0.12, 1.14, 0]} rotation={[0, 0, rz]} material={M.trim}><cylinderGeometry args={[0.008, 0.008, 0.3, 4]} /></mesh>
        ))}
        {/* livro esquecido */}
        <Bx a={[0.2, 0.04, 0.14]} p={[-0.18, 0.83, 0.02]} m={M.door21} r={[0, 0.3, 0]} />
    </group>
);

/** Poeira suspensa — pontos derivando devagar na luz. */
const Motes: React.FC = () => {
    const pts = useRef<THREE.Points>(null!);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = 90, arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = Math.random() * END_X; arr[i * 3 + 1] = 0.4 + Math.random() * 3; arr[i * 3 + 2] = Math.random() * 1.4 - 0.3; }
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#d8c49a', size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }), []);
    useFrame(({ clock }) => {
        const a = geo.attributes.position as THREE.BufferAttribute;
        const t = clock.elapsedTime;
        for (let i = 0; i < a.count; i++) {
            a.setY(i, 0.4 + ((a.getY(i) - 0.4 + 0.0016 + Math.sin(t * 0.4 + i) * 0.0006 + 3) % 3));
        }
        a.needsUpdate = true;
    });
    return <points ref={pts} geometry={geo} material={mat} />;
};

/** Porta de hotel numerada: moldura, almofadas, maçaneta de latão, chapa de
 *  chute, bandeira e plaqueta. */
const HotelDoor: React.FC<{ x: number; n: number }> = ({ x, n }) => (
    <group position={[x, 0, -0.42]}>
        <Bx a={[1.28, 2.66, 0.16]} p={[0, 1.34, 0]} m={M.frame} />
        <Bx a={[1.0, 2.4, 0.1]} p={[0, 1.24, 0.06]} m={M.door} />
        {/* almofadas rebaixadas */}
        <Bx a={[0.72, 0.92, 0.03]} p={[0, 1.66, 0.09]} m={M.panel} />
        <Bx a={[0.72, 0.82, 0.03]} p={[0, 0.66, 0.09]} m={M.panel} />
        {/* bandeira (transom) */}
        <Bx a={[1.0, 0.16, 0.06]} p={[0, 2.5, 0.05]} m={M.frame} />
        {/* maçaneta + espelho */}
        <mesh position={[0.36, 1.16, 0.13]} material={M.brass}><sphereGeometry args={[0.055, 10, 10]} /></mesh>
        <Bx a={[0.05, 0.16, 0.02]} p={[0.36, 1.16, 0.11]} m={M.brass} />
        {/* chapa de chute */}
        <Bx a={[0.94, 0.18, 0.02]} p={[0, 0.14, 0.1]} m={M.kick} />
        {/* plaqueta com o número */}
        <mesh position={[0, 2.06, 0.12]}><planeGeometry args={[0.3, 0.4]} /><meshStandardMaterial map={numTex(String(n))} roughness={0.55} /></mesh>
    </group>
);

/** A porta 21 — a memória do player. Entreaberta, brilho morno, fios de lã. */
const Door21: React.FC = () => {
    const glow = useRef<THREE.PointLight>(null!);
    useFrame(({ clock }) => { if (glow.current) glow.current.intensity = 7 + Math.sin(clock.elapsedTime * 2.1) * 1.8; });
    const yarns = useMemo(() => Array.from({ length: 13 }, (_, i) => ({ x: -0.6 + i * 0.1, len: 0.4 + (i % 4) * 0.22, rot: (i - 6) * 0.09 })), []);
    return (
        <group position={[DOOR21_X, 0, -0.42]}>
            <Bx a={[1.5, 2.9, 0.18]} p={[0, 1.46, 0]} m={M.frame} />
            {/* vão de luz atrás (a porta está entreaberta) */}
            <Pl a={[1.1, 2.5]} p={[0, 1.3, 0.02]} m={M.glow} />
            {/* a folha entreaberta, girada */}
            <group position={[-0.55, 0, 0.08]} rotation={[0, 0.5, 0]}>
                <Bx a={[1.06, 2.5, 0.1]} p={[0.53, 1.3, 0]} m={M.door21} />
            </group>
            {/* fios de lã escapando por baixo */}
            {yarns.map((y, i) => (
                <mesh key={i} position={[y.x, 0.04, 0.14]} rotation={[0, 0, y.rot]} material={M.yarn}>
                    <cylinderGeometry args={[0.02, 0.02, y.len, 5]} />
                </mesh>
            ))}
            {/* novelo caído no umbral */}
            <mesh position={[0.2, 0.14, 0.2]} material={M.yarn}><sphereGeometry args={[0.13, 10, 10]} /></mesh>
            <mesh position={[0, 2.2, 0.12]}><planeGeometry args={[0.34, 0.46]} /><meshStandardMaterial map={numTex('21', true)} roughness={0.5} /></mesh>
            <Pl a={[4.4, 5.2]} p={[0, 1.4, 0.5]} m={doorHaloMat} />
            <pointLight ref={glow} position={[0, 1.3, 1.0]} distance={8} decay={1.5} color="#ffb861" intensity={7} />
        </group>
    );
};

/** Avatar do player: chapéu e sobretudo, lanterna na mão que TREMULA, braços
 *  balançando no passo, aba do casaco com inércia e sombra no tapete. */
const Walker: React.FC<{ xRef: React.MutableRefObject<number>; movingRef: React.MutableRefObject<number> }> = ({ xRef, movingRef }) => {
    const g = useRef<THREE.Group>(null!);
    const legL = useRef<THREE.Mesh>(null!);
    const legR = useRef<THREE.Mesh>(null!);
    const armB = useRef<THREE.Mesh>(null!);          // braço de trás (balança)
    const armF = useRef<THREE.Group>(null!);         // braço da lanterna
    const coat = useRef<THREE.Mesh>(null!);          // aba do sobretudo
    const lamp = useRef<THREE.PointLight>(null!);
    const bulb = useRef<THREE.Mesh>(null!);
    const shadow = useRef<THREE.Mesh>(null!);
    const ph = useRef(0);
    useFrame(({ clock }, dt) => {
        const g0 = g.current; if (!g0) return;
        g0.position.x = xRef.current;
        const mv = movingRef.current;
        if (mv !== 0) { ph.current += dt * 8; g0.scale.x = mv < 0 ? -1 : 1; }
        const sw = mv !== 0 ? Math.sin(ph.current) * 0.42 : 0;
        if (legL.current) legL.current.rotation.z = sw;
        if (legR.current) legR.current.rotation.z = -sw;
        // braços: o de trás balança oposto às pernas; o da lanterna sobe um tico
        if (armB.current) armB.current.rotation.z = -sw * 0.8 + 0.12;
        if (armF.current) armF.current.rotation.z = (mv !== 0 ? Math.sin(ph.current) * 0.1 : Math.sin(clock.elapsedTime * 1.1) * 0.05) - 0.14;
        // aba do casaco abre com o passo (inércia fake)
        if (coat.current) { const open = mv !== 0 ? 0.16 + Math.abs(Math.sin(ph.current)) * 0.12 : 0.05; coat.current.rotation.x = -open; }
        g0.position.y = mv !== 0 ? Math.abs(Math.sin(ph.current)) * 0.05 : 0;
        // lanterna tremula (chama viva) e acompanha a mão
        const t = clock.elapsedTime;
        const flick = 8.5 + Math.sin(t * 11) * 0.9 + Math.sin(t * 23 + 1.7) * 0.55;
        if (lamp.current) { lamp.current.position.x = xRef.current + (g0.scale.x < 0 ? -0.5 : 0.5); lamp.current.intensity = flick; }
        if (bulb.current) { const s = 1 + Math.sin(t * 17) * 0.12; bulb.current.scale.setScalar(s); }
        if (shadow.current) { shadow.current.position.x = xRef.current; const sc = 1 - g0.position.y * 2; shadow.current.scale.set(0.9 * sc, 0.35 * sc, 1); }
    });
    return (
        <>
            <group ref={g}>
                {/* pernas */}
                <mesh ref={legL} position={[-0.11, 0.52, 0.5]} material={M.coat}><boxGeometry args={[0.15, 0.62, 0.16]} /></mesh>
                <mesh ref={legR} position={[0.11, 0.52, 0.5]} material={M.coat}><boxGeometry args={[0.15, 0.62, 0.16]} /></mesh>
                {/* sobretudo (tronco) + aba inferior articulada */}
                <mesh position={[0, 1.05, 0.5]} material={M.coat}><boxGeometry args={[0.44, 0.72, 0.26]} /></mesh>
                <mesh ref={coat} position={[0, 0.78, 0.5]} material={M.coat}><boxGeometry args={[0.5, 0.34, 0.28]} /></mesh>
                {/* gola levantada */}
                <mesh position={[0, 1.42, 0.5]} material={M.coat}><boxGeometry args={[0.4, 0.12, 0.3]} /></mesh>
                {/* braço de trás balançando */}
                <mesh ref={armB} position={[-0.27, 1.16, 0.46]} material={M.coat}><boxGeometry args={[0.12, 0.52, 0.14]} /></mesh>
                {/* braço da frente + lanterna */}
                <group ref={armF} position={[0.27, 1.2, 0.52]}>
                    <mesh position={[0.02, -0.2, 0.03]} material={M.coat}><boxGeometry args={[0.12, 0.5, 0.14]} /></mesh>
                    <mesh position={[0.14, -0.4, 0.1]} material={M.lantern}><boxGeometry args={[0.12, 0.18, 0.1]} /></mesh>
                    <mesh position={[0.14, -0.3, 0.1]} material={M.lantern}><torusGeometry args={[0.05, 0.014, 6, 10]} /></mesh>
                    <mesh ref={bulb} position={[0.14, -0.4, 0.16]}><sphereGeometry args={[0.05, 8, 8]} /><meshBasicMaterial color="#fff0cf" /></mesh>
                </group>
                {/* cabeça + chapéu */}
                <mesh position={[0, 1.55, 0.5]} material={M.skin}><sphereGeometry args={[0.15, 12, 12]} /></mesh>
                <mesh position={[0, 1.66, 0.5]} material={M.hat}><cylinderGeometry args={[0.15, 0.16, 0.14, 12]} /></mesh>
                <mesh position={[0, 1.6, 0.5]} rotation={[-Math.PI / 2, 0, 0]} material={M.hat}><ringGeometry args={[0.14, 0.26, 16]} /></mesh>
            </group>
            {/* sombra macia no tapete */}
            <mesh ref={shadow} position={[0, 0.035, 0.55]} rotation={[-Math.PI / 2, 0, 0]} material={shadowMat}><planeGeometry args={[1, 1]} /></mesh>
            {/* a luz da lanterna (baixa, à frente — revela o corredor, não a cabeça) */}
            <pointLight ref={lamp} position={[0.5, 0.9, 1.3]} distance={8} decay={1.4} color="#ffe4bd" intensity={9} />
        </>
    );
};

const CorridorScene: React.FC<{ xRef: React.MutableRefObject<number>; movingRef: React.MutableRefObject<number>; keys: React.MutableRefObject<Record<string, boolean>>; touchRef: React.MutableRefObject<number> }> =
    ({ xRef, movingRef, keys, touchRef }) => {
        const cam = useThree((s) => s.camera);
        const scene = useThree((s) => s.scene);
        const [, force] = useState(0);
        const verSeen = useRef(f8.version);
        useEffect(() => { scene.fog = new THREE.Fog('#080606', 6, 20); return () => { scene.fog = null; }; }, [scene]);
        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            if (f8.phase === 'corredor20') {
                const dir = (keys.current['d'] || keys.current['arrowright'] ? 1 : 0) - (keys.current['a'] || keys.current['arrowleft'] ? 1 : 0) + touchRef.current;
                movingRef.current = dir;
                if (dir !== 0) xRef.current = Math.max(0, Math.min(END_X, xRef.current + dir * 4 * dt));
                if (xRef.current >= DOOR21_X - 1.0) f8ReachDoor21();
            } else if (f8.phase === 'porta21') {
                movingRef.current = xRef.current < DOOR21_X - 0.05 ? 1 : 0;
                xRef.current = Math.min(DOOR21_X, xRef.current + 4 * dt);
            } else movingRef.current = 0;
            cam.position.x += (xRef.current + 1.6 - cam.position.x) * Math.min(1, dt * 4);
            cam.position.y = 2.0; cam.position.z = 10; cam.rotation.set(0, 0, 0); cam.lookAt(cam.position.x, 2.0, 0);
            if (f8.version !== verSeen.current) { verSeen.current = f8.version; force((v) => v + 1); }
        });
        const doors = [], sconces = [], paintings = [], consoles = [], beams = [];
        for (let i = 1; i <= F8_DOORS; i++) doors.push(<HotelDoor key={i} x={DOOR0 + (i - 1) * DOOR_GAP} n={i} />);
        for (let i = 0; i <= F8_DOORS; i++) {
            const gx = DOOR0 - DOOR_GAP / 2 + i * DOOR_GAP;
            sconces.push(<Sconce key={i} x={gx} />);
            // entre as portas: quadros (maioria) e mesinhas (a cada 5)
            if (i > 0 && i < F8_DOORS) {
                if (i % 5 === 2) consoles.push(<Console key={'c' + i} x={gx} />);
                else paintings.push(<Painting key={'p' + i} x={gx} seed={i * 7 + 3} />);
            }
            // vigas do teto marcando o ritmo do corredor
            beams.push(<Bx key={'b' + i} a={[0.24, 0.18, 3.4]} p={[gx, 4.16, 0.2]} m={M.trim} />);
        }
        return (
            <>
                <ambientLight color="#33291c" intensity={0.5} />
                <hemisphereLight color="#4a3a28" groundColor="#0a0806" intensity={0.35} />
                {/* casca */}
                <Pl a={[END_X + 12, 4.6]} p={[END_X / 2, 1.2, -0.6]} m={M.wall} />
                <mesh position={[END_X / 2, 0, 1]} rotation={[-Math.PI / 2, 0, 0]} material={M.floor}><planeGeometry args={[END_X + 12, 4]} /></mesh>
                <mesh position={[END_X / 2, 0.02, 0.9]} rotation={[-Math.PI / 2, 0, 0]} material={M.runner}><planeGeometry args={[END_X + 12, 1.5]} /></mesh>
                <Bx a={[END_X + 12, 0.35, 4]} p={[END_X / 2, 4.3, 0]} m={M.ceil} />
                {/* rodapé + friso do lambri + sanca */}
                <Bx a={[END_X + 12, 0.26, 0.12]} p={[END_X / 2, 0.13, -0.32]} m={M.trim} />
                <Bx a={[END_X + 12, 0.07, 0.1]} p={[END_X / 2, 1.06, -0.33]} m={M.trim} />
                <Bx a={[END_X + 12, 0.16, 0.12]} p={[END_X / 2, 2.72, -0.32]} m={M.trim} />
                {beams}
                {sconces}
                {paintings}
                {consoles}
                {doors}
                <Door21 />
                <Bx a={[0.5, 4.6, 3]} p={[END_X + 1.4, 2, 0]} m={M.frame} />
                <Motes />
                <Walker xRef={xRef} movingRef={movingRef} />
            </>
        );
    };

export const Floor8Image: React.FC<{ onEnterPlatformer?: () => void }> = ({ onEnterPlatformer }) => {
    const [, setV] = useState(0);
    const xRef = useRef(0);
    const movingRef = useRef(0);
    const keys = useRef<Record<string, boolean>>({});
    const touchRef = useRef(0);

    useEffect(() => f8Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8img = { xRef }; }, []);
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = true;
            if ((e.key.toLowerCase() === 'e' || e.key === 'Enter') && f8.phase === 'porta21') { f8EnterDoor21(); onEnterPlatformer?.(); }
        };
        const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, [onEnterPlatformer]);

    const active = f8.phase === 'corredor20' || f8.phase === 'porta21';
    if (!active) return null;
    const objective = f8Objective();
    const atDoor = f8.phase === 'porta21';

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 55, background: '#070506', touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [1.6, 2, 10], zoom: 82, near: 0.1, far: 100 }} gl={{ antialias: true }}>
                <CorridorScene xRef={xRef} movingRef={movingRef} keys={keys} touchRef={touchRef} />
            </Canvas>

            {/* tratamento "foto": tinta quente + vinheta + grão sutil */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%, rgba(60,40,20,0.08) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay', opacity: 0.06, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,#000 1px 2px)' }} />

            {objective && (
                <div style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top) + 20px)', left: 0, right: 0, textAlign: 'center',
                    fontFamily: 'monospace', fontSize: 14, letterSpacing: 1, color: '#e8dcc0', textShadow: '0 2px 6px #000',
                }}>{objective}</div>
            )}

            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 24px', pointerEvents: 'none' }}>
                {(['◀', '▶'] as const).map((s, i) => (
                    <button key={s}
                        onPointerDown={() => { touchRef.current = i === 0 ? -1 : 1; }}
                        onPointerUp={() => { touchRef.current = 0; }}
                        onPointerLeave={() => { touchRef.current = 0; }}
                        style={{
                            pointerEvents: 'auto', width: 76, height: 76, borderRadius: 40, fontSize: 26,
                            background: 'rgba(20,16,12,0.6)', border: '1px solid rgba(232,220,192,0.4)', color: '#e8dcc0', touchAction: 'none',
                        }}>{s}</button>
                ))}
            </div>

            {atDoor && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 130, textAlign: 'center' }}>
                    <button onPointerDown={() => { f8EnterDoor21(); onEnterPlatformer?.(); }} style={{
                        pointerEvents: 'auto', fontFamily: 'monospace', fontSize: 16, padding: '12px 26px',
                        background: 'rgba(122,74,18,0.75)', border: '1px solid #f0d89a', borderRadius: 12, color: '#fff4dc', cursor: 'pointer',
                        boxShadow: '0 0 28px rgba(255,184,97,0.5)',
                    }}><span style={{ color: '#ffd98a' }}>[E]</span> Entrar</button>
                </div>
            )}
        </div>
    );
};

export default Floor8Image;
