/**
 * Floor8Platformer.tsx — DENTRO DA PORTA 21: quatro fotografias da vida do
 * player, e ele acorda dentro de cada uma.
 *
 * A entrada de cada memória é um ritual: a FOTO emoldurada aparece (com a
 * legenda manuscrita), os olhos PISCAM (pálpebras fecham e abrem) — e você
 * está lá. Cada memória é uma cena pintada com parallax profundo (céu →
 * fundo → meio → primeiro plano), trilha sonora própria (f8Music) e a
 * história contada em batidas conforme você avança. Na ESCOLA, os valentões
 * patrulham — pule em cima pra desfazê-los em fio.
 *
 * Física em f8Platformer.ts (grapple + stomp). Arte 100% procedural em canvas.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    p8, p8Subscribe, p8Reset, stepPlayer, curMem, activeAnchor, p8Objective, P8, type Memory,
} from './f8Platformer';
import { f8, f8Subscribe, f8Wake } from './f8Arquivo';
import { f8MusicStart, f8MusicStop, f8Sting } from './f8Music';
import bgQuintal from './assets/f8/quintal.jpg';
import bgEscola from './assets/f8/escola.jpg';
import bgTempestade from './assets/f8/tempestade.jpg';
import bgHotel from './assets/f8/hotel.jpg';

// os cenários PINTADOS (dioramas de lã gerados) — um por memória
const BG_URLS: Record<string, string> = { quintal: bgQuintal, escola: bgEscola, tempestade: bgTempestade, hotel: bgHotel };
// recorte vertical (algumas placas têm a "borda da mesa" do diorama embaixo)
const BG_CROP: Record<string, number> = { quintal: 0.04, escola: 0.26, tempestade: 0.05, hotel: 0.04 };
const bgTexCache = new Map<string, THREE.Texture>();
function bgTex(key: string): THREE.Texture {
    const hit = bgTexCache.get(key); if (hit) return hit;
    const t = new THREE.TextureLoader().load(BG_URLS[key]);
    t.colorSpace = THREE.SRGBColorSpace;
    const crop = BG_CROP[key] ?? 0;
    t.repeat.set(1, 1 - crop); t.offset.set(0, crop);
    bgTexCache.set(key, t); return t;
}

// ── pintura das cenas (canvas grandes, cacheados por memória) ────────────────
function cvs(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
const seedRng = (seed: number) => { let s = seed || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

/** O PRIMEIRO PLANO (silhuetas passando rápido na frente — profundidade). */
function fgPaint(m: Memory): THREE.CanvasTexture {
    return cvs(1024, 128, (x) => {
        x.clearRect(0, 0, 1024, 128);
        const r = seedRng(29);
        const col = m.key === 'quintal' ? 'rgba(110,70,40,0.9)'
            : m.key === 'escola' ? 'rgba(70,84,100,0.9)'
            : m.key === 'tempestade' ? 'rgba(10,14,22,0.95)' : 'rgba(6,4,12,0.95)';
        x.fillStyle = col;
        x.fillRect(0, 96, 1024, 32);
        if (m.key === 'quintal') {
            // girassóis e capim
            for (let i = 0; i < 26; i++) {
                const gx = r() * 1024, gh = 26 + r() * 46;
                x.strokeStyle = col; x.lineWidth = 3;
                x.beginPath(); x.moveTo(gx, 104); x.quadraticCurveTo(gx + 4, 104 - gh / 2, gx + (r() - 0.5) * 10, 104 - gh); x.stroke();
                if (r() > 0.6) {
                    x.fillStyle = 'rgba(200,140,40,0.9)';
                    x.beginPath(); x.arc(gx + (r() - 0.5) * 10, 102 - gh, 7, 0, 7); x.fill();
                    x.fillStyle = col;
                    x.beginPath(); x.arc(gx + (r() - 0.5) * 10, 102 - gh, 3.4, 0, 7); x.fill();
                }
            }
        } else if (m.key === 'escola') {
            // cerca da escola
            for (let gx = 0; gx < 1024; gx += 26) { x.fillRect(gx, 56, 6, 48); x.beginPath(); x.arc(gx + 3, 56, 3, 0, 7); x.fill(); }
            x.fillRect(0, 66, 1024, 5); x.fillRect(0, 88, 1024, 5);
        } else if (m.key === 'tempestade') {
            // mato morto vergado pelo vento
            for (let i = 0; i < 30; i++) {
                const gx = r() * 1024, gh = 20 + r() * 40;
                x.strokeStyle = col; x.lineWidth = 2.5;
                x.beginPath(); x.moveTo(gx, 106); x.quadraticCurveTo(gx + gh * 0.5, 104 - gh * 0.5, gx + gh * 0.9, 104 - gh); x.stroke();
            }
        } else {
            // gradil de ferro do hotel
            for (let gx = 0; gx < 1024; gx += 34) {
                x.fillRect(gx, 40, 5, 64);
                x.beginPath(); x.moveTo(gx - 3, 44); x.lineTo(gx + 2.5, 30); x.lineTo(gx + 8, 44); x.closePath(); x.fill();
            }
            x.fillRect(0, 52, 1024, 4); x.fillRect(0, 92, 1024, 4);
        }
    });
}

interface Kit {
    bg: THREE.MeshBasicMaterial; fg: THREE.MeshBasicMaterial;
    wool: THREE.MeshStandardMaterial; woolTop: THREE.MeshStandardMaterial;
    anchor: THREE.MeshStandardMaterial; anchorHot: THREE.MeshStandardMaterial;
    thread: THREE.MeshBasicMaterial; hazard: THREE.MeshStandardMaterial;
    spool: THREE.MeshStandardMaterial; glowSoft: THREE.MeshBasicMaterial;
    body: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial;
    hat: THREE.MeshStandardMaterial; hook: THREE.MeshStandardMaterial; button: THREE.MeshStandardMaterial;
    bully: THREE.MeshStandardMaterial; bullyDark: THREE.MeshStandardMaterial;
}

function knitTex(base: string, hi: string, lo: string): THREE.CanvasTexture {
    return cvs(84, 84, (x) => {
        x.fillStyle = base; x.fillRect(0, 0, 84, 84);
        const cols = 6, rows = 6, cw = 84 / cols, ch = 84 / rows;
        x.lineCap = 'round';
        for (let rr = -1; rr < rows + 1; rr++) for (let c = -1; c < cols + 1; c++) {
            const px = c * cw + (rr % 2 ? cw / 2 : 0), py = rr * ch;
            x.strokeStyle = lo; x.lineWidth = cw * 0.34;
            x.beginPath(); x.moveTo(px + cw * 0.15, py + ch * 0.06); x.lineTo(px + cw * 0.5, py + ch * 0.94); x.lineTo(px + cw * 0.85, py + ch * 0.06); x.stroke();
            x.strokeStyle = hi; x.lineWidth = cw * 0.15;
            x.beginPath(); x.moveTo(px + cw * 0.2, py + ch * 0.12); x.lineTo(px + cw * 0.5, py + ch * 0.86); x.lineTo(px + cw * 0.8, py + ch * 0.12); x.stroke();
        }
    });
}

function glowTex(): THREE.CanvasTexture {
    return cvs(128, 128, (x) => {
        const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
        g.addColorStop(0, 'rgba(255,230,170,0.85)'); g.addColorStop(1, 'rgba(255,230,170,0)');
        x.fillStyle = g; x.beginPath(); x.arc(64, 64, 63, 0, 7); x.fill();
    });
}

const kitCache = new Map<string, Kit>();
function makeKit(m: Memory): Kit {
    const hit = kitCache.get(m.key); if (hit) return hit;
    const kit: Kit = {
        bg: new THREE.MeshBasicMaterial({ map: bgTex(m.key) }),
        fg: new THREE.MeshBasicMaterial({ map: fgPaint(m), transparent: true, depthWrite: false }),
        wool: new THREE.MeshStandardMaterial({ map: knitTex(m.pal.wool, m.pal.woolHi, m.pal.woolLo), roughness: 1 }),
        woolTop: new THREE.MeshStandardMaterial({ color: m.pal.woolHi, roughness: 1 }),
        anchor: new THREE.MeshStandardMaterial({ color: m.pal.anchor, roughness: 0.85, emissive: m.pal.anchor, emissiveIntensity: 0.15 }),
        anchorHot: new THREE.MeshStandardMaterial({ color: m.pal.thread, roughness: 0.6, emissive: m.pal.thread, emissiveIntensity: 0.9 }),
        thread: new THREE.MeshBasicMaterial({ color: m.pal.thread }),
        hazard: new THREE.MeshStandardMaterial({ color: m.pal.hazard, roughness: 1, emissive: m.pal.hazard, emissiveIntensity: 0.2 }),
        spool: new THREE.MeshStandardMaterial({ color: m.pal.woolHi, roughness: 0.85, emissive: m.pal.thread, emissiveIntensity: 0.35 }),
        glowSoft: new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        body: new THREE.MeshStandardMaterial({ color: '#c88a5a', roughness: 1 }),
        head: new THREE.MeshStandardMaterial({ color: '#e6c49a', roughness: 1 }),
        hat: new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.95 }),
        hook: new THREE.MeshStandardMaterial({ color: '#e8c96a', roughness: 0.35, metalness: 0.6 }),
        button: new THREE.MeshStandardMaterial({ color: '#20140c', roughness: 0.5 }),
        bully: new THREE.MeshStandardMaterial({ map: knitTex('#5a6474', '#78849a', '#3e4654'), roughness: 1 }),
        bullyDark: new THREE.MeshStandardMaterial({ color: '#2c323e', roughness: 0.9 }),
    };
    kitCache.set(m.key, kit);
    return kit;
}

const Bx: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);

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
            <mesh position={[0, 1.6, -0.05]} material={kit.thread}><cylinderGeometry args={[0.03, 0.03, 3.2, 4]} /></mesh>
            <mesh ref={ring} material={kit.anchor}><torusGeometry args={[0.34, 0.11, 10, 20]} /></mesh>
        </group>
    );
};

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
            <mesh material={kit.glowSoft} scale={[1.3, 1.3, 1]}><planeGeometry args={[1, 1]} /></mesh>
        </group>
    );
};

/** O VALENTÃO de lã: maior que você, carranca de botão, patrulha pesada.
 *  Stomp → ele se desfaz (encolhe girando, sobra um novelo). */
const Bully: React.FC<{ i: number; kit: Kit }> = ({ i, kit }) => {
    const g = useRef<THREE.Group>(null!);
    const legL = useRef<THREE.Mesh>(null!);
    const legR = useRef<THREE.Mesh>(null!);
    const ball = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        const e = p8.enemies[i]; const gg = g.current;
        if (!e || !gg) { if (gg) gg.visible = false; return; }
        if (e.dead) {
            const k = Math.max(0, 1 - e.deadT * 1.4);
            gg.visible = k > 0;
            gg.scale.set(k, k, k);
            gg.rotation.z = e.deadT * 9;
            if (ball.current) { ball.current.visible = e.deadT < 3; ball.current.position.set(e.x, (curMem().enemies[i]?.y ?? 0) + 0.3, 0.2); }
            return;
        }
        gg.visible = true; gg.scale.set(e.dir < 0 ? -1 : 1, 1, 1); gg.rotation.z = 0;
        gg.position.set(e.x, curMem().enemies[i]?.y ?? 0, 0);
        const sw = Math.sin(clock.elapsedTime * 6 + i * 2) * 0.4;
        if (legL.current) legL.current.rotation.z = sw;
        if (legR.current) legR.current.rotation.z = -sw;
        if (ball.current) ball.current.visible = false;
    });
    return (
        <>
            <group ref={g}>
                <mesh ref={legL} position={[-0.16, 0.36, 0]} material={kit.bullyDark}><boxGeometry args={[0.2, 0.66, 0.24]} /></mesh>
                <mesh ref={legR} position={[0.16, 0.36, 0]} material={kit.bullyDark}><boxGeometry args={[0.2, 0.66, 0.24]} /></mesh>
                {/* tronco parrudo */}
                <mesh position={[0, 1.05, 0]} material={kit.bully}><boxGeometry args={[0.74, 0.8, 0.42]} /></mesh>
                {/* braços cruzados */}
                <mesh position={[0, 1.06, 0.24]} rotation={[0, 0, 0.5]} material={kit.bullyDark}><boxGeometry args={[0.56, 0.16, 0.16]} /></mesh>
                <mesh position={[0, 0.96, 0.26]} rotation={[0, 0, -0.5]} material={kit.bullyDark}><boxGeometry args={[0.56, 0.16, 0.16]} /></mesh>
                {/* cabeçorra + carranca */}
                <mesh position={[0, 1.72, 0]} material={kit.bully}><sphereGeometry args={[0.34, 14, 14]} /></mesh>
                <mesh position={[-0.12, 1.78, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 8]} /></mesh>
                <mesh position={[0.12, 1.78, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 8]} /></mesh>
                {/* sobrancelha fechada (a carranca) */}
                <mesh position={[0, 1.9, 0.3]} rotation={[0, 0, 0.16]} material={kit.button}><boxGeometry args={[0.34, 0.05, 0.03]} /></mesh>
                <mesh position={[0, 1.62, 0.32]} rotation={[0, 0, -0.2]} material={kit.button}><boxGeometry args={[0.2, 0.04, 0.03]} /></mesh>
            </group>
            {/* o novelo que sobra quando ele se desfaz */}
            <mesh ref={ball} visible={false} material={kit.spool}><sphereGeometry args={[0.22, 10, 10]} /></mesh>
        </>
    );
};

const CrochetPlayer: React.FC<{ kit: Kit }> = ({ kit }) => {
    const g = useRef<THREE.Group>(null!);
    const legL = useRef<THREE.Mesh>(null!);
    const legR = useRef<THREE.Mesh>(null!);
    const needle = useRef<THREE.Group>(null!);
    const thread = useRef<THREE.Mesh>(null!);
    const hookTip = new THREE.Vector3();
    useFrame(() => {
        const gg = g.current; if (!gg) return;
        gg.position.set(p8.x, p8.y, 0);
        const anchor = activeAnchor();
        const swinging = anchor !== null;
        gg.scale.x = p8.facing < 0 ? -1 : 1;
        let bodyRot = 0;
        if (swinging && anchor) {
            const dx = anchor.x - p8.x, dy = anchor.y - p8.y;
            bodyRot = Math.atan2(dx, dy) * (gg.scale.x < 0 ? -1 : 1) * 0.55;
        }
        gg.rotation.z = THREE.MathUtils.lerp(gg.rotation.z, bodyRot, 0.35);
        const moving = p8.onGround && Math.abs(p8.vx) > 0.4;
        const sw = moving ? Math.sin(p8.runPhase * 3.4) * 0.5 : (swinging ? Math.sin(p8.t * 3) * 0.2 : 0);
        if (legL.current) legL.current.rotation.z = sw;
        if (legR.current) legR.current.rotation.z = -sw;
        if (needle.current) needle.current.rotation.z = swinging ? -0.15 : -0.5;
        if (thread.current) {
            if (swinging && anchor) {
                thread.current.visible = true;
                hookTip.set(p8.x + (gg.scale.x < 0 ? -0.5 : 0.5), p8.y + 2.0, 0.3);
                const mx = (hookTip.x + anchor.x) / 2, my = (hookTip.y + anchor.y) / 2;
                const dx = anchor.x - hookTip.x, dy = anchor.y - hookTip.y;
                thread.current.position.set(mx - p8.x, my - p8.y, 0.3);
                thread.current.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2 - gg.rotation.z);
                thread.current.scale.y = Math.hypot(dx, dy);
            } else thread.current.visible = false;
        }
    });
    return (
        <group ref={g}>
            <mesh ref={legL} position={[-0.12, 0.34, 0]} material={kit.body}><boxGeometry args={[0.16, 0.6, 0.2]} /></mesh>
            <mesh ref={legR} position={[0.12, 0.34, 0]} material={kit.body}><boxGeometry args={[0.16, 0.6, 0.2]} /></mesh>
            <mesh position={[-0.12, 0.06, 0.04]} material={kit.hat}><boxGeometry args={[0.2, 0.14, 0.26]} /></mesh>
            <mesh position={[0.12, 0.06, 0.04]} material={kit.hat}><boxGeometry args={[0.2, 0.14, 0.26]} /></mesh>
            <mesh position={[0, 0.92, 0]} material={kit.body}><boxGeometry args={[0.5, 0.66, 0.34]} /></mesh>
            <mesh position={[0, 1.5, 0]} material={kit.head}><sphereGeometry args={[0.32, 14, 14]} /></mesh>
            <mesh position={[-0.12, 1.55, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 10]} /></mesh>
            <mesh position={[0.12, 1.55, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={kit.button}><cylinderGeometry args={[0.06, 0.06, 0.04, 10]} /></mesh>
            <mesh position={[0, 1.78, 0]} material={kit.hat}><cylinderGeometry args={[0.26, 0.28, 0.22, 14]} /></mesh>
            <mesh position={[0, 1.68, 0]} rotation={[Math.PI / 2, 0, 0]} material={kit.hat}><ringGeometry args={[0.24, 0.42, 16]} /></mesh>
            {/* os DOIS braços erguidos segurando a agulha gigante */}
            <group position={[0, 1.12, 0.3]}>
                <mesh position={[-0.24, 0.28, 0]} rotation={[0, 0, -1.9]} material={kit.body}><boxGeometry args={[0.13, 0.5, 0.16]} /></mesh>
                <mesh position={[0.24, 0.28, 0]} rotation={[0, 0, -1.9]} material={kit.body}><boxGeometry args={[0.13, 0.5, 0.16]} /></mesh>
                <group ref={needle} position={[0.1, 0.7, 0.12]} rotation={[0, 0, -0.5]}>
                    <mesh position={[0, 0.7, 0]} material={kit.hook}><cylinderGeometry args={[0.07, 0.08, 1.9, 8]} /></mesh>
                    <mesh position={[0, 1.62, 0]} rotation={[Math.PI / 2, 0, 0]} material={kit.hook}><torusGeometry args={[0.12, 0.05, 8, 12, Math.PI * 1.4]} /></mesh>
                    {/* o NOVELO na parte de trás da agulha + fiapo pendendo */}
                    <mesh position={[0, -0.32, 0]} material={kit.spool}><sphereGeometry args={[0.16, 10, 10]} /></mesh>
                    <mesh position={[0, -0.56, 0.02]} rotation={[0, 0, 0.3]} material={kit.thread}><cylinderGeometry args={[0.02, 0.02, 0.4, 4]} /></mesh>
                </group>
            </group>
            <mesh ref={thread} material={kit.thread}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /></mesh>
        </group>
    );
};

/** Chuva (só na TEMPESTADE): pontos caindo em loop. */
const Rain: React.FC<{ endX: number }> = ({ endX }) => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = 260, arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = Math.random() * (endX + 20) - 6; arr[i * 3 + 1] = Math.random() * 12; arr[i * 3 + 2] = Math.random() * 4 - 2; }
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        return g;
    }, [endX]);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#9fb4d0', size: 0.06, transparent: true, opacity: 0.6, depthWrite: false }), []);
    useFrame((_, dt) => {
        const a = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i++) {
            let y = a.getY(i) - dt * 11;
            if (y < -1) y = 11;
            a.setY(i, y); a.setX(i, a.getX(i) - dt * 2.4);
        }
        a.needsUpdate = true;
    });
    return <points geometry={geo} material={mat} />;
};


// ── a cena ────────────────────────────────────────────────────────────────────
const Scene: React.FC<{
    moveRef: React.MutableRefObject<number>; vertRef: React.MutableRefObject<number>;
    jumpRef: React.MutableRefObject<boolean>; grappleRef: React.MutableRefObject<boolean>;
    introRef: React.MutableRefObject<boolean>;
}> = ({ moveRef, vertRef, jumpRef, grappleRef, introRef }) => {
    const cam = useThree((s) => s.camera);
    const scene = useThree((s) => s.scene);
    const sky = useRef<THREE.Group>(null!);
    const fg = useRef<THREE.Group>(null!);
    const flash = useRef<THREE.AmbientLight>(null!);
    const nextBolt = useRef(4);
    const mem = curMem();
    const kit = makeKit(mem);
    useEffect(() => {
        scene.fog = new THREE.Fog(mem.pal.fog, 18, 46);
        return () => { scene.fog = null; };
    }, [scene, mem.pal.fog]);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (f8.phase === 'platformer' && !introRef.current) {
            const ev = stepPlayer({ move: moveRef.current, vert: vertRef.current, jump: jumpRef.current, grapple: grappleRef.current }, dt);
            jumpRef.current = false;
            if (ev.stomped) f8Sting('stomp');
            if (ev.beat) f8Sting('beat');
            if (ev.won) { f8Sting('win'); f8MusicStop(2.4); }
        }
        const tx = Math.max(2, Math.min(mem.endX - 6, p8.x + 2.4));
        cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 4);
        const ty = 2.6 + Math.max(0, p8.y) * 0.4;
        cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 3);
        cam.position.z = 14; cam.rotation.set(0, 0, 0);
        cam.lookAt(cam.position.x, cam.position.y, 0);
        // parallax: o diorama pintado desliza devagar atrás; o 1º plano corre à frente
        if (sky.current) sky.current.position.set(cam.position.x * 0.92, cam.position.y * 0.28 + 2.2, -16);
        if (fg.current) fg.current.position.set(cam.position.x * -0.18, -1.1, 4.4);
        // relâmpago da tempestade
        if (mem.key === 'tempestade' && flash.current) {
            const t = clock.elapsedTime;
            if (t > nextBolt.current) {
                flash.current.intensity = 2.6;
                nextBolt.current = t + 5 + Math.random() * 9;
            }
            flash.current.intensity = Math.max(0, flash.current.intensity - dt * 5);
        }
    });

    return (
        <>
            <ambientLight color={mem.pal.ambient} intensity={0.85} />
            <hemisphereLight color={mem.pal.light} groundColor={mem.pal.bgLo} intensity={0.6} />
            <directionalLight position={[6, 12, 8]} intensity={0.7} color={mem.pal.light} />
            {mem.key === 'tempestade' && <ambientLight ref={flash} color="#cfe0ff" intensity={0} />}

            {/* as três camadas pintadas */}
            {/* o diorama pintado (2.37:1 do plate; alto o bastante pra cobrir o quadro) */}
            <group ref={sky}><mesh material={kit.bg}><planeGeometry args={[33.2, 14]} /></mesh></group>
            <group ref={fg}><mesh material={kit.fg}><planeGeometry args={[34, 4.25]} /></mesh></group>

            {mem.key === 'tempestade' && <Rain endX={mem.endX} />}

            {mem.ledges.map((l, i) => <YarnLedge key={mem.key + i} l={l} kit={kit} />)}
            {mem.anchors.map((a, i) => <Anchor key={mem.key + 'a' + i} a={a} kit={kit} />)}
            {mem.hazards.map((h, i) => <BlackThread key={mem.key + 'h' + i} h={h} kit={kit} />)}
            {mem.enemies.map((_, i) => <Bully key={mem.key + 'e' + i} i={i} kit={kit} />)}
            {mem.spools.map((s, i) => <Spool key={mem.key + 's' + i} s={s} i={i} kit={kit} />)}
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
    const introRef = useRef(true);
    const keys = useRef<Record<string, boolean>>({});
    const touchMove = useRef(0);
    const [introKey, setIntroKey] = useState(-1);
    const lastMem = useRef(-1);

    // OUVE OS DOIS estados: o gate `active` lê f8.phase; o resto lê p8.
    useEffect(() => {
        const bump = () => setV((x) => x + 1);
        const offF8 = f8Subscribe(bump);
        const offP8 = p8Subscribe(bump);
        return () => { offF8(); offP8(); };
    }, []);
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8plat = { p8, reset: p8Reset, introRef }; }, []);

    const activePhase = f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';

    // entrada de memória → o ritual FOTO → PISCADA (e a música da memória)
    useEffect(() => {
        if (!activePhase) { lastMem.current = -1; return; }
        if (p8.memIdx === lastMem.current) return;
        lastMem.current = p8.memIdx;
        introRef.current = true;
        setIntroKey(p8.memIdx);
        f8MusicStart(curMem().key);
    });
    // fim do platformer → silêncio
    useEffect(() => {
        if (!activePhase) return;
        return () => f8MusicStop(1.0);
    }, [activePhase]);

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

    if (!activePhase) return null;
    const won = p8.won || f8.phase === 'memoriaRecuperada';
    const mem = curMem();
    const pal = mem.pal;

    const hold = (fn: () => void, off: () => void) => ({
        onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); },
        onPointerUp: off, onPointerLeave: off, onPointerCancel: off,
    });

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 56, background: pal.bgLo, touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [2, 2.6, 14], zoom: 58, near: 0.1, far: 120 }} gl={{ antialias: true }}>
                <Scene moveRef={moveRef} vertRef={vertRef} jumpRef={jumpRef} grappleRef={grappleRef} introRef={introRef} />
            </Canvas>

            {/* tratamento de foto: vinheta + grão */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.5) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay', opacity: 0.05, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,#000 1px 2px)' }} />

            {/* O RITUAL: a foto emoldurada → a piscada → acordar dentro */}
            {introKey >= 0 && (
                <div key={introKey} style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
                    {/* a foto (some quando os olhos fecham) */}
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(8,6,10,0.94)', animation: 'f8photoHold 3.4s ease forwards',
                    }}>
                        <div style={{ background: '#f4eee0', padding: '14px 14px 44px', borderRadius: 3, boxShadow: '0 18px 60px rgba(0,0,0,0.8)', transform: 'rotate(-2deg)', maxWidth: 'min(74vw, 420px)' }}>
                            <div style={{
                                width: 'min(68vw, 392px)', height: 'min(40vw, 230px)', borderRadius: 2,
                                background: `linear-gradient(to bottom, ${pal.bgHi} 0%, ${pal.bgLo} 62%, ${pal.woolLo} 100%)`,
                                boxShadow: 'inset 0 0 30px rgba(60,40,20,0.45)', position: 'relative', overflow: 'hidden',
                            }}>
                                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, rgba(255,240,210,0.3) 0%, rgba(0,0,0,0) 55%)' }} />
                                <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.14, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,#000 1px 2px)' }} />
                                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center', fontFamily: 'Georgia, serif', fontSize: 13, letterSpacing: 4, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px #000' }}>{mem.title}</div>
                            </div>
                            <div style={{ marginTop: 12, textAlign: 'center', fontFamily: '"Segoe Script","Bradley Hand",cursive', fontSize: 14, lineHeight: 1.5, color: '#4a3c2a' }}>{mem.caption}</div>
                        </div>
                    </div>
                    {/* as pálpebras */}
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: '#000', transformOrigin: 'top', animation: 'f8blinkTop 5s ease-in-out forwards' }} />
                    <div onAnimationEnd={() => { introRef.current = false; }} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: '#000', transformOrigin: 'bottom', animation: 'f8blinkBot 5s ease-in-out forwards' }} />
                </div>
            )}

            {/* HUD */}
            {!won && (
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', left: 0, right: 0, textAlign: 'center', fontFamily: 'Georgia, serif', color: '#fff', textShadow: '0 2px 8px #000' }}>
                    <div style={{ fontSize: 15, letterSpacing: 3 }}>{p8Objective()}</div>
                    <div style={{ fontSize: 12, marginTop: 3, opacity: 0.85, fontFamily: 'monospace' }}>🧶 {p8.spools}</div>
                </div>
            )}

            {/* a batida de história (a narrativa em campo) */}
            {p8.beatText && !won && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 148, textAlign: 'center', padding: '0 34px', pointerEvents: 'none' }}>
                    <div style={{ display: 'inline-block', maxWidth: 640, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, lineHeight: 1.6, color: '#fff', textShadow: '0 2px 12px #000, 0 0 30px rgba(0,0,0,0.7)', animation: 'f8beatIn 0.6s ease' }}>{p8.beatText}</div>
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
                        segure FIO perto de uma laçada · solte pra voar<br />pule EM CIMA dos valentões
                    </div>
                </>
            )}

            {/* vitória */}
            {won && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,3,8,0.72)', animation: 'f8platwin 1.6s ease-out' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, letterSpacing: 4, color: '#dfe4ff', textShadow: '0 0 24px rgba(120,140,220,0.7)', marginBottom: 10 }}>VOCÊ SE LEMBROU</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#b8c0dc', marginBottom: 24 }}>🧶 {p8.spools} novelos</div>
                    <button onPointerDown={() => { f8Wake(); onDone?.(); }} style={{ ...btn, width: 'auto', height: 'auto', padding: '12px 30px', fontSize: 16, borderColor: '#a9b6f0', color: '#fff' }}>Acordar</button>
                </div>
            )}

            <style>{`
                @keyframes f8platwin { 0%{opacity:0} 100%{opacity:1} }
                @keyframes f8beatIn { 0%{opacity:0; transform:translateY(8px)} 100%{opacity:1; transform:translateY(0)} }
                @keyframes f8photoHold { 0%{opacity:0} 8%{opacity:1} 72%{opacity:1} 82%{opacity:0} 100%{opacity:0} }
                @keyframes f8blinkTop { 0%,64%{transform:scaleY(0)} 74%{transform:scaleY(1)} 82%{transform:scaleY(1)} 100%{transform:scaleY(0)} }
                @keyframes f8blinkBot { 0%,64%{transform:scaleY(0)} 74%{transform:scaleY(1)} 82%{transform:scaleY(1)} 100%{transform:scaleY(0)} }
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
