/**
 * Floor8Platformer.tsx — DENTRO DA PORTA 21: a memória em CROCHÊ (2.5D).
 *
 * O player empunha uma AGULHA GIGANTE de crochê com os dois braços; do bico corre
 * um FIO que ele fisga nas LAÇADAS penduradas no céu tecido e BALANÇA de vão em
 * vão. Quatro memórias (mini-fases) da vida dele, escurecendo a cada uma — cada
 * uma com sua paleta e seu humor.
 *
 * Câmera ortográfica seguindo o player (molde Floor8Image), física lida de
 * f8Platformer.ts. Arte procedural de crochê (pontos-baixos em canvas), paralaxe
 * de lã, névoa por memória. Leve de propósito: poucos meshes, texturas em cache.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    p8, p8Subscribe, p8Reset, stepPlayer, curMem, activeAnchor, p8Objective, MEMORIES, P8, type Palette,
} from './f8Platformer';
import { f8, f8Wake } from './f8Arquivo';

// ── texturas procedurais (cache por paleta) ──────────────────────────────────
function cvs(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, rep?: [number, number]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
}

/** Ponto-baixo de crochê: fileiras de laçadas em "V" com deslocamento. */
function crochetTex(base: string, hi: string, lo: string): THREE.CanvasTexture {
    return cvs(96, 96, (x) => {
        x.fillStyle = base; x.fillRect(0, 0, 96, 96);
        const cols = 6, rows = 6, cw = 96 / cols, ch = 96 / rows;
        x.lineCap = 'round';
        for (let r = -1; r < rows + 1; r++) {
            for (let c = -1; c < cols + 1; c++) {
                const px = c * cw + (r % 2 ? cw / 2 : 0), py = r * ch;
                x.strokeStyle = lo; x.lineWidth = cw * 0.36;
                x.beginPath(); x.moveTo(px + cw * 0.14, py + ch * 0.05); x.lineTo(px + cw * 0.5, py + ch * 0.95); x.lineTo(px + cw * 0.86, py + ch * 0.05); x.stroke();
                x.strokeStyle = hi; x.lineWidth = cw * 0.16;
                x.beginPath(); x.moveTo(px + cw * 0.2, py + ch * 0.12); x.lineTo(px + cw * 0.5, py + ch * 0.88); x.lineTo(px + cw * 0.8, py + ch * 0.12); x.stroke();
            }
        }
    });
}

/** Fundo em gradiente + laçadas fantasma (céu tecido da memória). */
function skyTex(hi: string, lo: string): THREE.CanvasTexture {
    return cvs(128, 128, (x) => {
        const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, hi); g.addColorStop(1, lo);
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        x.globalAlpha = 0.06; x.strokeStyle = '#ffffff'; x.lineWidth = 2;
        for (let yy = 8; yy < 128; yy += 16) for (let xx = 6; xx < 128; xx += 18) {
            x.beginPath(); x.arc(xx + (yy % 32 ? 9 : 0), yy, 5, 0, Math.PI, true); x.stroke();
        }
        x.globalAlpha = 1;
    });
}

interface Kit {
    wool: THREE.MeshStandardMaterial; woolTop: THREE.MeshStandardMaterial;
    sky: THREE.MeshBasicMaterial; hills: THREE.MeshBasicMaterial;
    anchor: THREE.MeshStandardMaterial; anchorHot: THREE.MeshStandardMaterial;
    thread: THREE.MeshBasicMaterial; hazard: THREE.MeshStandardMaterial;
    spool: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial;
    body: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial;
    hat: THREE.MeshStandardMaterial; hook: THREE.MeshStandardMaterial; button: THREE.MeshStandardMaterial;
}
function makeKit(pal: Palette): Kit {
    const woolT = crochetTex(pal.wool, pal.woolHi, pal.woolLo);
    return {
        wool: new THREE.MeshStandardMaterial({ map: woolT, roughness: 1 }),
        woolTop: new THREE.MeshStandardMaterial({ color: pal.woolHi, roughness: 1 }),
        sky: new THREE.MeshBasicMaterial({ map: skyTex(pal.bgHi, pal.bgLo) }),
        hills: new THREE.MeshBasicMaterial({ color: pal.woolLo }),
        anchor: new THREE.MeshStandardMaterial({ color: pal.anchor, roughness: 0.85, emissive: pal.anchor, emissiveIntensity: 0.15 }),
        anchorHot: new THREE.MeshStandardMaterial({ color: pal.thread, roughness: 0.6, emissive: pal.thread, emissiveIntensity: 0.9 }),
        thread: new THREE.MeshBasicMaterial({ color: pal.thread }),
        hazard: new THREE.MeshStandardMaterial({ color: pal.hazard, roughness: 1, emissive: pal.hazard, emissiveIntensity: 0.2 }),
        spool: new THREE.MeshStandardMaterial({ color: pal.woolHi, roughness: 0.85, emissive: pal.thread, emissiveIntensity: 0.3 }),
        glow: new THREE.MeshBasicMaterial({ color: pal.light, transparent: true, opacity: 0.4, depthWrite: false }),
        body: new THREE.MeshStandardMaterial({ color: '#c88a5a', roughness: 1 }),
        head: new THREE.MeshStandardMaterial({ color: '#e6c49a', roughness: 1 }),
        hat: new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.95 }),
        hook: new THREE.MeshStandardMaterial({ color: '#e8c96a', roughness: 0.35, metalness: 0.6 }),
        button: new THREE.MeshStandardMaterial({ color: '#20140c', roughness: 0.5 }),
    };
}

const Bx: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);

/** Plataforma de crochê. */
const YarnLedge: React.FC<{ l: { x0: number; x1: number; y: number }; kit: Kit }> = ({ l, kit }) => {
    const w = l.x1 - l.x0, cx = (l.x0 + l.x1) / 2, depth = 1.4, thick = 0.9;
    return (
        <group position={[cx, l.y, 0]}>
            <mesh position={[0, -thick / 2, 0]} material={kit.wool}><boxGeometry args={[w, thick, depth]} /></mesh>
            <mesh position={[0, 0.02, 0]} material={kit.woolTop}><boxGeometry args={[w, 0.16, depth + 0.02]} /></mesh>
            <mesh position={[-w / 2, -thick / 2, depth / 2 - 0.1]} material={kit.wool}><sphereGeometry args={[thick * 0.55, 12, 10]} /></mesh>
            <mesh position={[w / 2, -thick / 2, depth / 2 - 0.1]} material={kit.wool}><sphereGeometry args={[thick * 0.55, 12, 10]} /></mesh>
        </group>
    );
};

/** Laçada de gancho pendurada — pulsa quente quando o player está no alcance. */
const Anchor: React.FC<{ a: { x: number; y: number }; kit: Kit }> = ({ a, kit }) => {
    const ring = useRef<THREE.Mesh>(null!);
    const near = useRef(false);
    useFrame(({ clock }) => {
        const d = Math.hypot(a.x - p8.x, a.y - p8.y);
        const hot = d < P8.GRAB_RANGE && a.y >= p8.y - 0.5;
        if (hot !== near.current && ring.current) { near.current = hot; ring.current.material = hot ? kit.anchorHot : kit.anchor; }
        if (ring.current) ring.current.rotation.z = Math.sin(clock.elapsedTime * 1.6 + a.x) * 0.14;
    });
    return (
        <group position={[a.x, a.y, 0.1]}>
            {/* fio subindo até o "céu" */}
            <mesh position={[0, 1.6, -0.05]} material={kit.thread}><cylinderGeometry args={[0.03, 0.03, 3.2, 4]} /></mesh>
            {/* a laçada */}
            <mesh ref={ring} material={kit.anchor}><torusGeometry args={[0.34, 0.11, 10, 20]} /></mesh>
        </group>
    );
};

/** Fio preto — o hazard. Um tufo emaranhado espinhoso. */
const BlackThread: React.FC<{ h: { x: number; y: number }; kit: Kit }> = ({ h, kit }) => {
    const spikes = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ rz: (i - 3) * 0.24, len: 0.7 + (i % 3) * 0.35 })), []);
    return (
        <group position={[h.x, h.y, 0.16]}>
            {spikes.map((s, i) => (
                <mesh key={i} position={[0, s.len / 2, 0]} rotation={[0, 0, s.rz]} material={kit.hazard}>
                    <coneGeometry args={[0.09, s.len, 5]} />
                </mesh>
            ))}
            <mesh material={kit.hazard}><sphereGeometry args={[0.24, 8, 8]} /></mesh>
        </group>
    );
};

const Spool: React.FC<{ s: { x: number; y: number }; i: number; kit: Kit }> = ({ s, i, kit }) => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        const gg = g.current; if (!gg) return;
        gg.visible = !p8.gotSpools[i];
        gg.position.y = s.y + Math.sin(clock.elapsedTime * 2 + i) * 0.12;
        gg.rotation.z = clock.elapsedTime * 0.8;
    });
    return (
        <group ref={g} position={[s.x, s.y, 0.25]}>
            <mesh material={kit.spool}><sphereGeometry args={[0.28, 12, 12]} /></mesh>
            <mesh rotation={[0.6, 0, 0]} material={kit.thread}><torusGeometry args={[0.28, 0.03, 6, 18]} /></mesh>
            <mesh material={kit.glow}><planeGeometry args={[1, 1]} /></mesh>
        </group>
    );
};

/** O player: bonequinho de crochê segurando a AGULHA GIGANTE com os DOIS braços;
 *  o gancho fica no bico, um novelo pendura na parte de TRÁS da agulha, e o FIO
 *  do gancho vai até a laçada presa. Ao balançar, o corpo pendura da agulha. */
const CrochetPlayer: React.FC<{ kit: Kit }> = ({ kit }) => {
    const g = useRef<THREE.Group>(null!);
    const armL = useRef<THREE.Mesh>(null!);
    const armR = useRef<THREE.Mesh>(null!);
    const legL = useRef<THREE.Mesh>(null!);
    const legR = useRef<THREE.Mesh>(null!);
    const tip = useRef<THREE.Object3D>(null!);        // marcador no BICO da agulha
    const tail = useRef<THREE.Group>(null!);          // fiapo atrás da agulha
    const thread = useRef<THREE.Mesh>(null!);         // fio do gancho (WORLD-space)
    const tipW = useMemo(() => new THREE.Vector3(), []);
    useFrame(({ clock }) => {
        const gg = g.current; if (!gg) return;
        gg.position.set(p8.x, p8.y, 0);
        const anchor = activeAnchor();
        const swinging = anchor !== null;
        gg.scale.x = p8.facing < 0 ? -1 : 1;

        // ao balançar, o corpo inclina apontando a agulha pro fio (pendura)
        let bodyRot = 0;
        if (swinging && anchor) {
            const dx = anchor.x - p8.x, dy = anchor.y - p8.y;
            bodyRot = Math.atan2(dx, dy) * (gg.scale.x < 0 ? -1 : 1) * 0.55;
        }
        gg.rotation.z = THREE.MathUtils.lerp(gg.rotation.z, bodyRot, 0.35);

        // braços: os dois agarram a haste (sobem mais quando balança)
        const raise = swinging ? -1.35 : -1.0;
        if (armL.current) armL.current.rotation.z = raise + Math.sin(p8.t * 2.2) * 0.03;
        if (armR.current) armR.current.rotation.z = raise - 0.22;

        // pernas balançam ao correr; penduradas no balanço
        const moving = p8.onGround && Math.abs(p8.vx) > 0.4;
        const sw = moving ? Math.sin(p8.runPhase * 3.4) * 0.5 : (swinging ? Math.sin(p8.t * 3) * 0.25 : 0);
        if (legL.current) legL.current.rotation.z = sw;
        if (legR.current) legR.current.rotation.z = -sw;

        // o fiapo atrás da agulha ondula
        if (tail.current) tail.current.rotation.z = Math.sin(clock.elapsedTime * 2.4) * 0.25 - 0.4;

        // o fio do gancho: do BICO REAL (world) até a laçada — sem gap
        if (thread.current) {
            if (swinging && anchor && tip.current) {
                thread.current.visible = true;
                tip.current.getWorldPosition(tipW);
                const dx = anchor.x - tipW.x, dy = anchor.y - tipW.y;
                thread.current.position.set((tipW.x + anchor.x) / 2, (tipW.y + anchor.y) / 2, 0.3);
                thread.current.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
                thread.current.scale.y = Math.max(0.05, Math.hypot(dx, dy));
            } else thread.current.visible = false;
        }
    });
    return (
        <>
            <group ref={g}>
                {/* pernas */}
                <mesh ref={legL} position={[-0.12, 0.34, 0]} material={kit.body}><boxGeometry args={[0.16, 0.6, 0.2]} /></mesh>
                <mesh ref={legR} position={[0.12, 0.34, 0]} material={kit.body}><boxGeometry args={[0.16, 0.6, 0.2]} /></mesh>
                <mesh position={[-0.12, 0.06, 0.04]} material={kit.hat}><boxGeometry args={[0.2, 0.14, 0.26]} /></mesh>
                <mesh position={[0.12, 0.06, 0.04]} material={kit.hat}><boxGeometry args={[0.2, 0.14, 0.26]} /></mesh>
                {/* tronco */}
                <mesh position={[0, 0.92, 0]} material={kit.body}><boxGeometry args={[0.5, 0.66, 0.34]} /></mesh>
                {/* cabeça + chapéu */}
                <mesh position={[0, 1.5, 0]} material={kit.head}><sphereGeometry args={[0.32, 14, 14]} /></mesh>
                <mesh position={[-0.12, 1.55, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 10]} /></mesh>
                <mesh position={[0.12, 1.55, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 10]} /></mesh>
                <mesh position={[0, 1.78, 0]} material={kit.hat}><cylinderGeometry args={[0.26, 0.28, 0.22, 14]} /></mesh>
                <mesh position={[0, 1.68, 0]} rotation={[Math.PI / 2, 0, 0]} material={kit.hat}><ringGeometry args={[0.24, 0.42, 16]} /></mesh>
                {/* DOIS braços agarrando a haste (pivô no ombro) */}
                <group position={[0, 1.12, 0.3]}>
                    <mesh ref={armL} position={[-0.2, 0.06, 0.06]} material={kit.body}><boxGeometry args={[0.13, 0.56, 0.16]} /></mesh>
                    <mesh ref={armR} position={[0.24, 0.02, 0.1]} material={kit.body}><boxGeometry args={[0.13, 0.52, 0.16]} /></mesh>
                    {/* A AGULHA GIGANTE, diagonal sobre o ombro */}
                    <group position={[0.08, 0.7, 0.14]} rotation={[0, 0, -0.5]}>
                        {/* haste afinando pro bico */}
                        <mesh position={[0, 0.55, 0]} material={kit.hook}><cylinderGeometry args={[0.055, 0.095, 2.5, 10]} /></mesh>
                        {/* punhos das mãos na haste */}
                        <mesh position={[0, -0.18, 0]} material={kit.body}><sphereGeometry args={[0.13, 8, 8]} /></mesh>
                        <mesh position={[0, 0.22, 0]} material={kit.body}><sphereGeometry args={[0.13, 8, 8]} /></mesh>
                        {/* O GANCHO no bico: curva aberta bem visível */}
                        <mesh position={[0.05, 1.86, 0]} rotation={[0, 0, 2.4]} material={kit.hook}><torusGeometry args={[0.17, 0.055, 8, 14, Math.PI * 1.35]} /></mesh>
                        <object3D ref={tip} position={[0.1, 1.95, 0]} />
                        {/* atrás da agulha: o NOVELO + fiapo pendurado */}
                        <mesh position={[0, -0.78, 0]} material={kit.spool}><sphereGeometry args={[0.2, 10, 10]} /></mesh>
                        <mesh position={[0, -0.78, 0]} rotation={[0.7, 0, 0.4]} material={kit.thread}><torusGeometry args={[0.2, 0.028, 6, 14]} /></mesh>
                        <group ref={tail} position={[0, -0.94, 0]}>
                            <mesh position={[0, -0.3, 0]} material={kit.thread}><cylinderGeometry args={[0.028, 0.028, 0.6, 4]} /></mesh>
                            <mesh position={[0.08, -0.62, 0]} rotation={[0, 0, 0.6]} material={kit.thread}><cylinderGeometry args={[0.024, 0.024, 0.3, 4]} /></mesh>
                        </group>
                    </group>
                </group>
            </group>
            {/* o fio do gancho — em WORLD space (irmão do grupo, sem herdar rotação) */}
            <mesh ref={thread} material={kit.thread}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /></mesh>
        </>
    );
};

/** Cenário próprio de cada memória (meio-fundo, barato: materiais compartilhados). */
const MemoryProps: React.FC<{ memKey: string; kit: Kit; endX: number }> = ({ memKey, kit, endX }) => {
    const sun = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => { if (sun.current) sun.current.rotation.z = clock.elapsedTime * 0.1; });
    if (memKey === 'infancia') {
        return (
            <>
                {/* um sol de tricô girando devagar */}
                <group ref={sun} position={[14, 9.5, -6]}>
                    <mesh material={kit.spool}><circleGeometry args={[1.4, 20]} /></mesh>
                    {Array.from({ length: 8 }, (_, i) => (
                        <mesh key={i} position={[Math.cos(i * Math.PI / 4) * 2, Math.sin(i * Math.PI / 4) * 2, 0]} rotation={[0, 0, i * Math.PI / 4 - Math.PI / 2]} material={kit.spool}>
                            <coneGeometry args={[0.22, 0.9, 5]} />
                        </mesh>
                    ))}
                </group>
                {/* cortinas quadradas de vovó flutuando */}
                {[8, 22, 34].map((x, i) => (
                    <mesh key={i} position={[x, 5 + (i % 2) * 1.6, -5]} rotation={[0, 0, 0.2 + i * 0.3]} material={kit.glow}><planeGeometry args={[1.6, 1.6]} /></mesh>
                ))}
            </>
        );
    }
    if (memKey === 'lar') {
        return (
            <group position={[30, 0, -6]}>
                {/* a casa de lã — telhado, corpo, e UMA janela acesa */}
                <mesh position={[0, 2.2, 0]} material={kit.hills}><boxGeometry args={[7, 4.4, 0.5]} /></mesh>
                <mesh position={[0, 5.2, 0]} rotation={[0, 0, Math.PI / 4]} material={kit.wool}><boxGeometry args={[5.1, 5.1, 0.45]} /></mesh>
                <mesh position={[1.4, 2.6, 0.3]} material={kit.glow}><planeGeometry args={[1.1, 1.3]} /></mesh>
                {/* a porta que se fechou (escura) */}
                <mesh position={[-1.5, 1.2, 0.3]} material={kit.hazard}><planeGeometry args={[1.2, 2.4]} /></mesh>
            </group>
        );
    }
    if (memKey === 'rasgado') {
        return (
            <>
                {/* fios rasgados pendendo do alto, tortos */}
                {[6, 14, 22, 33, 44, 55].map((x, i) => (
                    <group key={i} position={[x, 10.5, -4]} rotation={[0, 0, (i % 3 - 1) * 0.22]}>
                        <mesh position={[0, -1.6 - (i % 3), 0]} material={kit.hazard}><cylinderGeometry args={[0.05, 0.02, 3.2 + (i % 3) * 2, 4]} /></mesh>
                    </group>
                ))}
                {/* um retrato rasgado caído */}
                <mesh position={[40, 1.8, -5]} rotation={[0, 0, -0.35]} material={kit.glow}><planeGeometry args={[1.8, 2.2]} /></mesh>
            </>
        );
    }
    // obscuro: olhos-botão brilhando na escuridão, observando
    return (
        <>
            {[[10, 6.5], [26, 4.2], [41, 7.4], [58, 5.0], [endX - 8, 8.6]].map(([x, y], i) => (
                <group key={i} position={[x, y, -7]}>
                    <mesh position={[-0.28, 0, 0]} material={kit.anchorHot}><circleGeometry args={[0.12, 8]} /></mesh>
                    <mesh position={[0.28, 0, 0]} material={kit.anchorHot}><circleGeometry args={[0.12, 8]} /></mesh>
                </group>
            ))}
        </>
    );
};

// ── a cena ────────────────────────────────────────────────────────────────────
const Scene: React.FC<{ moveRef: React.MutableRefObject<number>; vertRef: React.MutableRefObject<number>; jumpRef: React.MutableRefObject<boolean>; grappleRef: React.MutableRefObject<boolean> }> =
    ({ moveRef, vertRef, jumpRef, grappleRef }) => {
        const cam = useThree((s) => s.camera);
        const scene = useThree((s) => s.scene);
        const bg1 = useRef<THREE.Group>(null!);
        const bg2 = useRef<THREE.Group>(null!);
        const mem = curMem();
        const kit = useMemo(() => makeKit(mem.pal), [mem.pal]);
        useEffect(() => {
            scene.fog = new THREE.Fog(mem.pal.fog, 16, 40);
            return () => { scene.fog = null; };
        }, [scene, mem.pal.fog]);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            if (f8.phase === 'platformer') {
                stepPlayer({ move: moveRef.current, vert: vertRef.current, jump: jumpRef.current, grapple: grappleRef.current }, dt);
                jumpRef.current = false;
            }
            const tx = Math.max(2, Math.min(mem.endX - 6, p8.x + 2.4));
            cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 4);
            const ty = 2.6 + Math.max(0, p8.y) * 0.4;
            cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 3);
            cam.position.z = 14; cam.rotation.set(0, 0, 0);
            cam.lookAt(cam.position.x, cam.position.y, 0);
            if (bg1.current) bg1.current.position.set(cam.position.x * 0.5, cam.position.y * 0.5 + 3, -18);
            if (bg2.current) bg2.current.position.set(cam.position.x * 0.72, cam.position.y * 0.6 + 1, -11);
        });

        return (
            <>
                <ambientLight color={mem.pal.ambient} intensity={0.85} />
                <hemisphereLight color={mem.pal.light} groundColor={mem.pal.bgLo} intensity={0.6} />
                <directionalLight position={[6, 12, 8]} intensity={0.7} color={mem.pal.light} />

                <group ref={bg1}><mesh material={kit.sky}><planeGeometry args={[90, 52]} /></mesh></group>
                <group ref={bg2}>
                    {[-24, -8, 8, 24, 40].map((hx, i) => (
                        <mesh key={i} position={[hx, -14 + (i % 2) * 2, 0]} material={kit.hills}><circleGeometry args={[11 + (i % 3) * 3, 22]} /></mesh>
                    ))}
                </group>

                <MemoryProps memKey={mem.key} kit={kit} endX={mem.endX} />
                {mem.ledges.map((l, i) => <YarnLedge key={i} l={l} kit={kit} />)}
                {mem.anchors.map((a, i) => <Anchor key={i} a={a} kit={kit} />)}
                {mem.hazards.map((h, i) => <BlackThread key={i} h={h} kit={kit} />)}
                {mem.spools.map((s, i) => <Spool key={i} s={s} i={i} kit={kit} />)}
                <CrochetPlayer kit={kit} />
            </>
        );
    };

// ── overlay ───────────────────────────────────────────────────────────────────
export const Floor8Platformer: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
    const [, setV] = useState(0);
    const moveRef = useRef(0);
    const vertRef = useRef(0);
    const jumpRef = useRef(false);
    const grappleRef = useRef(false);
    const keys = useRef<Record<string, boolean>>({});
    const touchMove = useRef(0);
    const [caption, setCaption] = useState<string | null>(null);
    const lastMem = useRef(-1);

    useEffect(() => p8Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8plat = { p8, reset: p8Reset }; }, []);

    // legenda da memória ao entrar
    useEffect(() => {
        if (p8.memIdx === lastMem.current) return;
        lastMem.current = p8.memIdx;
        setCaption(curMem().caption);
        const id = setTimeout(() => setCaption(null), 5200);
        return () => clearTimeout(id);
    });

    useEffect(() => {
        const isJump = (k: string) => k === ' ' || k === 'w';
        const isGrab = (k: string) => k === 'j' || k === 'shift' || k === 'e';
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            keys.current[k] = true;
            if (isJump(k)) { e.preventDefault(); if (!e.repeat) jumpRef.current = true; }
            if (isGrab(k)) { e.preventDefault(); grappleRef.current = true; }
        };
        const ku = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            keys.current[k] = false;
            if (isGrab(k)) grappleRef.current = false;
        };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, []);

    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const k = keys.current;
            moveRef.current = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0) + touchMove.current;
            vertRef.current = (k['arrowup'] ? 1 : 0) - (k['arrowdown'] ? 1 : 0);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    const active = f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
    if (!active) return null;
    const won = p8.won || f8.phase === 'memoriaRecuperada';
    const pal = curMem().pal;

    const hold = (fn: () => void, off: () => void) => ({
        onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); },
        onPointerUp: off, onPointerLeave: off, onPointerCancel: off,
    });

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 56, background: pal.bgLo, touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [2, 2.6, 14], zoom: 58, near: 0.1, far: 120 }} gl={{ antialias: true }}>
                <Scene moveRef={moveRef} vertRef={vertRef} jumpRef={jumpRef} grappleRef={grappleRef} />
            </Canvas>

            {/* vinheta suave */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%)' }} />
            {/* fade de transição entre memórias */}
            {p8.transition > 0 && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: pal.bgLo, opacity: p8.transition }} />}

            {/* HUD */}
            {!won && (
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', left: 0, right: 0, textAlign: 'center', fontFamily: 'Georgia, serif', color: '#fff', textShadow: '0 2px 8px #000' }}>
                    <div style={{ fontSize: 15, letterSpacing: 3 }}>{p8Objective()}</div>
                    <div style={{ fontSize: 12, marginTop: 3, opacity: 0.85, fontFamily: 'monospace' }}>🧶 {p8.spools}</div>
                </div>
            )}

            {/* legenda da memória */}
            {caption && !won && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', textAlign: 'center', padding: '0 32px', pointerEvents: 'none' }}>
                    <div style={{ display: 'inline-block', maxWidth: 620, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 18, lineHeight: 1.6, color: '#fff', textShadow: '0 2px 12px #000', animation: 'f8cap 5.2s ease-in-out' }}>{caption}</div>
                </div>
            )}

            {/* controles touch */}
            {!won && (
                <>
                    <div style={{ position: 'absolute', bottom: 26, left: 20, display: 'flex', gap: 12 }}>
                        <button {...hold(() => { touchMove.current = -1; }, () => { touchMove.current = 0; })} style={btn}>◀</button>
                        <button {...hold(() => { touchMove.current = 1; }, () => { touchMove.current = 0; })} style={btn}>▶</button>
                    </div>
                    <div style={{ position: 'absolute', bottom: 26, right: 20, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                        <button {...hold(() => { grappleRef.current = true; }, () => { grappleRef.current = false; })} style={{ ...btn, width: 86, height: 86, fontSize: 13, letterSpacing: 1, borderColor: pal.thread, color: pal.thread }}>FIO</button>
                        <button {...hold(() => { jumpRef.current = true; }, () => { })} style={{ ...btn, width: 86, height: 86, fontSize: 14 }}>PULAR</button>
                    </div>
                    <div style={{ position: 'absolute', bottom: 120, right: 20, fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'right', pointerEvents: 'none' }}>
                        segure FIO perto de uma laçada<br />solte pra ser arremessado
                    </div>
                </>
            )}

            {/* vitória (transição pro despertar é o M5) */}
            {won && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,3,8,0.72)', animation: 'f8platwin 1.6s ease-out' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, letterSpacing: 4, color: '#dfe4ff', textShadow: '0 0 24px rgba(120,140,220,0.7)', marginBottom: 10 }}>VOCÊ SE LEMBROU</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#b8c0dc', marginBottom: 24 }}>🧶 {p8.spools} novelos</div>
                    <button onPointerDown={() => { f8Wake(); onDone?.(); }} style={{ ...btn, width: 'auto', height: 'auto', padding: '12px 30px', fontSize: 16, borderColor: '#a9b6f0', color: '#fff' }}>Acordar</button>
                </div>
            )}

            <style>{`
                @keyframes f8platwin { 0%{opacity:0} 100%{opacity:1} }
                @keyframes f8cap { 0%{opacity:0} 15%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
            `}</style>
        </div>
    );
};

const btn: React.CSSProperties = {
    pointerEvents: 'auto', width: 74, height: 74, borderRadius: 40, fontSize: 24,
    background: 'rgba(10,8,16,0.55)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', touchAction: 'none',
    fontFamily: 'monospace',
};

export default Floor8Platformer;
