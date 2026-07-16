/**
 * Floor 8 — cinco dioramas jogáveis de crochê.
 *
 * A cena usa arte pintada apenas como plano distante. Tudo que importa para a
 * leitura e para o jogo (herói, pontos, rasgos, inimigos e boss) é geometria
 * leve com silhueta própria. Sem post-processing pesado e sem sombras reais.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    p8, p8Subscribe, p8Reset, stepPlayer, curMem, activeThreadTarget, p8Objective, P8,
    type EnemyKind, type Memory,
} from './f8Platformer';
import { f8, f8Subscribe, f8Wake } from './f8Arquivo';
import { f8MusicStart, f8MusicStop, f8Sting } from './f8Music';
import bgQuintal from './assets/f8/quintal.jpg';
import bgEscola from './assets/f8/escola.jpg';
import bgTempestade from './assets/f8/tempestade.jpg';
import bgHotel from './assets/f8/hotel.jpg';
import bgYourself from './assets/f8/yourself-arena-v2.webp';

const BG_URLS: Record<string, string | undefined> = {
    quintal: bgQuintal, escola: bgEscola, tempestade: bgTempestade, hotel: bgHotel,
    yourself: bgYourself,
};
const BG_CROP: Record<string, number> = { quintal: 0.04, escola: 0.26, tempestade: 0.05, hotel: 0.04, yourself: 0 };
const BG_LIFT: Record<string, { color: string; opacity: number }> = {
    quintal: { color: '#f5b36b', opacity: 0.025 },
    escola: { color: '#8ec9e6', opacity: 0.04 },
    tempestade: { color: '#7189a6', opacity: 0.22 },
    hotel: { color: '#766a91', opacity: 0.18 },
    yourself: { color: '#b85b42', opacity: 0.045 },
};

function cvs(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
}
const seedRng = (seed: number) => { let s = seed || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

/** A quinta memória não é uma foto: é um autorretrato rasgado num tear. */
function yourselfBackdrop(): THREE.CanvasTexture {
    return cvs(1280, 540, (x) => {
        const g = x.createLinearGradient(0, 0, 1280, 540);
        g.addColorStop(0, '#24131c'); g.addColorStop(0.48, '#4b2834'); g.addColorStop(1, '#100b17');
        x.fillStyle = g; x.fillRect(0, 0, 1280, 540);
        const r = seedRng(821);
        x.globalAlpha = 0.2;
        for (let yy = 0; yy < 540; yy += 8) {
            x.strokeStyle = yy % 16 ? '#b56b72' : '#291821'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(0, yy);
            for (let xx = 0; xx <= 1280; xx += 32) x.lineTo(xx, yy + Math.sin(xx * 0.035 + yy) * 3);
            x.stroke();
        }
        x.globalAlpha = 1;
        // O contorno do player ocupa o tecido, mas está vazio por dentro.
        x.fillStyle = '#110b11';
        x.beginPath(); x.ellipse(655, 210, 105, 120, 0, 0, Math.PI * 2); x.fill();
        x.fillRect(585, 300, 140, 190);
        x.strokeStyle = '#d04f63'; x.lineWidth = 7; x.setLineDash([14, 11]);
        x.beginPath(); x.ellipse(655, 210, 122, 138, 0, 0, Math.PI * 2); x.stroke();
        x.strokeRect(568, 286, 174, 215); x.setLineDash([]);
        // Cinco costuras irradiando do retrato.
        const knots = [[130, 100], [280, 440], [1020, 95], [1140, 420], [655, 65]];
        for (const [kx, ky] of knots) {
            x.strokeStyle = '#e08475'; x.lineWidth = 3; x.beginPath(); x.moveTo(655, 285); x.quadraticCurveTo((kx + 655) / 2, ky + (r() - 0.5) * 100, kx, ky); x.stroke();
            x.fillStyle = '#d6a45e'; x.beginPath(); x.arc(kx, ky, 10, 0, Math.PI * 2); x.fill();
        }
        const vignette = x.createRadialGradient(640, 270, 120, 640, 270, 660);
        vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.7)');
        x.fillStyle = vignette; x.fillRect(0, 0, 1280, 540);
    });
}

const bgTexCache = new Map<string, THREE.Texture>();
function bgTex(key: string): THREE.Texture {
    const hit = bgTexCache.get(key); if (hit) return hit;
    const url = BG_URLS[key];
    const t = url ? new THREE.TextureLoader().load(url) : yourselfBackdrop();
    t.colorSpace = THREE.SRGBColorSpace;
    const crop = BG_CROP[key] ?? 0; t.repeat.set(1, 1 - crop); t.offset.set(0, crop);
    bgTexCache.set(key, t); return t;
}

function fgPaint(m: Memory): THREE.CanvasTexture {
    return cvs(1024, 128, (x) => {
        const r = seedRng(m.key.length * 37 + 11);
        const col = m.key === 'quintal' ? 'rgba(73,45,31,.74)'
            : m.key === 'escola' ? 'rgba(40,53,66,.78)'
            : m.key === 'tempestade' ? 'rgba(12,18,28,.8)'
            : m.key === 'yourself' ? 'rgba(17,8,15,.86)' : 'rgba(12,9,20,.82)';
        x.fillStyle = col; x.fillRect(0, 98, 1024, 30);
        if (m.key === 'quintal') {
            for (let i = 0; i < 22; i++) {
                const px = r() * 1024, hh = 24 + r() * 42;
                x.strokeStyle = col; x.lineWidth = 4; x.beginPath(); x.moveTo(px, 105); x.quadraticCurveTo(px + 5, 85, px + 8, 105 - hh); x.stroke();
                if (i % 3 === 0) { x.fillStyle = '#b77837'; x.beginPath(); x.arc(px + 8, 104 - hh, 7, 0, 7); x.fill(); }
            }
        } else if (m.key === 'escola') {
            for (let px = 0; px < 1024; px += 27) x.fillRect(px, 55, 5, 50);
            x.fillRect(0, 65, 1024, 5); x.fillRect(0, 90, 1024, 5);
        } else if (m.key === 'yourself') {
            for (let px = 0; px < 1024; px += 44) {
                x.strokeStyle = iColor(px); x.lineWidth = 3; x.beginPath(); x.moveTo(px, 110); x.bezierCurveTo(px - 18, 80, px + 20, 62, px - 6, 35); x.stroke();
            }
        } else {
            for (let i = 0; i < 26; i++) {
                const px = r() * 1024, hh = 18 + r() * 45;
                x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.moveTo(px, 106); x.quadraticCurveTo(px + hh * 0.5, 92, px + hh, 105 - hh); x.stroke();
            }
        }
        function iColor(px: number) { return px % 88 ? '#28101a' : '#8d3448'; }
    });
}

function knitTex(base: string, hi: string, lo: string): THREE.CanvasTexture {
    const t = cvs(96, 96, (x) => {
        x.fillStyle = base; x.fillRect(0, 0, 96, 96); x.lineCap = 'round';
        for (let rr = -1; rr < 8; rr++) for (let c = -1; c < 8; c++) {
            const px = c * 14 + (rr % 2 ? 7 : 0), py = rr * 14;
            x.strokeStyle = lo; x.lineWidth = 5; x.beginPath(); x.moveTo(px + 2, py + 1); x.lineTo(px + 7, py + 13); x.lineTo(px + 12, py + 1); x.stroke();
            x.strokeStyle = hi; x.lineWidth = 2; x.beginPath(); x.moveTo(px + 3, py + 2); x.lineTo(px + 7, py + 11); x.lineTo(px + 11, py + 2); x.stroke();
        }
    });
    // O tecido antigo era uma única estampa esticada até virar ondas enormes.
    // Repetir o ponto mantém a escala do crochê consistente em roupa, chão e
    // plataformas longas sem adicionar geometria nem draw calls.
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 1.35);
    return t;
}

function glowTex(): THREE.CanvasTexture {
    return cvs(128, 128, (x) => {
        const g = x.createRadialGradient(64, 64, 3, 64, 64, 62);
        g.addColorStop(0, 'rgba(255,235,180,.95)'); g.addColorStop(0.2, 'rgba(255,145,110,.48)'); g.addColorStop(1, 'rgba(255,120,90,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
}

interface Kit {
    bg: THREE.MeshBasicMaterial; fg: THREE.MeshBasicMaterial;
    wool: THREE.MeshStandardMaterial; woolTop: THREE.MeshStandardMaterial;
    anchor: THREE.MeshStandardMaterial; anchorHot: THREE.MeshStandardMaterial;
    thread: THREE.MeshBasicMaterial; hazard: THREE.MeshStandardMaterial;
    spool: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial;
    coat: THREE.MeshStandardMaterial; coatDark: THREE.MeshStandardMaterial;
    skin: THREE.MeshStandardMaterial; scarf: THREE.MeshStandardMaterial;
    ink: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial;
    knot: THREE.MeshStandardMaterial; knotDark: THREE.MeshStandardMaterial;
    core: THREE.MeshStandardMaterial; echo: THREE.MeshStandardMaterial;
    boss: THREE.MeshStandardMaterial; bossDark: THREE.MeshStandardMaterial;
}

const kitCache = new Map<string, Kit>();
function makeKit(m: Memory): Kit {
    const hit = kitCache.get(m.key); if (hit) return hit;
    const kit: Kit = {
        bg: new THREE.MeshBasicMaterial({ map: bgTex(m.key), toneMapped: false }),
        fg: new THREE.MeshBasicMaterial({ map: fgPaint(m), transparent: true, depthWrite: false, toneMapped: false }),
        wool: new THREE.MeshStandardMaterial({ map: knitTex(m.pal.wool, m.pal.woolHi, m.pal.woolLo), roughness: 1 }),
        woolTop: new THREE.MeshStandardMaterial({ color: m.pal.woolHi, roughness: 1, emissive: m.pal.woolHi, emissiveIntensity: 0.04 }),
        anchor: new THREE.MeshStandardMaterial({ color: m.pal.anchor, roughness: 0.7, emissive: m.pal.anchor, emissiveIntensity: 0.18 }),
        anchorHot: new THREE.MeshStandardMaterial({ color: m.pal.thread, roughness: 0.55, emissive: m.pal.thread, emissiveIntensity: 1.1 }),
        thread: new THREE.MeshBasicMaterial({ color: m.pal.thread, toneMapped: false }),
        hazard: new THREE.MeshStandardMaterial({ color: m.pal.hazard, roughness: 1, emissive: '#2a1020', emissiveIntensity: 0.16 }),
        spool: new THREE.MeshStandardMaterial({ color: m.pal.woolHi, roughness: 0.8, emissive: m.pal.thread, emissiveIntensity: 0.3 }),
        glow: new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        coat: new THREE.MeshStandardMaterial({ map: knitTex('#5b3c32', '#89604b', '#2b2426'), roughness: 1 }),
        coatDark: new THREE.MeshStandardMaterial({ color: '#26343a', roughness: 0.95 }),
        skin: new THREE.MeshStandardMaterial({ color: '#d5b08b', roughness: 0.92 }),
        scarf: new THREE.MeshStandardMaterial({ color: '#a54348', roughness: 1, emissive: '#4b121a', emissiveIntensity: 0.18 }),
        ink: new THREE.MeshStandardMaterial({ color: '#181519', roughness: 0.65 }),
        metal: new THREE.MeshStandardMaterial({ color: '#cda455', roughness: 0.28, metalness: 0.72, emissive: '#40230a', emissiveIntensity: 0.12 }),
        knot: new THREE.MeshStandardMaterial({ map: knitTex('#34464f', '#5c7279', '#17242b'), roughness: 1 }),
        knotDark: new THREE.MeshStandardMaterial({ color: '#172127', roughness: 1 }),
        core: new THREE.MeshStandardMaterial({ color: '#ffd3b0', emissive: '#ff4f55', emissiveIntensity: 2.4, roughness: 0.35 }),
        echo: new THREE.MeshStandardMaterial({ color: '#796f9c', emissive: '#332752', emissiveIntensity: 0.8, roughness: 0.9, transparent: true, opacity: 0.72 }),
        boss: new THREE.MeshStandardMaterial({ map: knitTex('#4c2636', '#8f455d', '#1a121b'), roughness: 1, emissive: '#3b0e1d', emissiveIntensity: 0.35 }),
        bossDark: new THREE.MeshStandardMaterial({ color: '#171119', roughness: 1, emissive: '#4a1023', emissiveIntensity: 0.38 }),
    };
    kitCache.set(m.key, kit); return kit;
}

const YarnLedge: React.FC<{ l: { x0: number; x1: number; y: number }; kit: Kit }> = ({ l, kit }) => {
    const w = l.x1 - l.x0, cx = (l.x0 + l.x1) / 2;
    const face = useMemo(() => {
        const s = new THREE.Shape(), half = w / 2;
        s.moveTo(-half + 0.12, 0.02); s.lineTo(half - 0.12, 0.02);
        s.quadraticCurveTo(half + 0.08, -0.08, half - 0.03, -0.28);
        const n = Math.max(4, Math.min(11, Math.ceil(w / 2.4)));
        for (let i = n; i >= 0; i--) {
            const x = -half + (w * i) / n;
            const y = -0.8 + Math.sin(i * 2.17 + cx * 0.31) * 0.075 + (i % 3 === 0 ? -0.045 : 0);
            s.lineTo(x, y);
        }
        s.quadraticCurveTo(-half - 0.08, -0.12, -half + 0.12, 0.02); s.closePath();
        return s;
    }, [w, cx]);
    return (
        <group position={[cx, l.y, 0]}>
            <mesh position={[0, -0.38, -0.08]} material={kit.wool}><boxGeometry args={[Math.max(0.2, w - 0.22), 0.67, 1.12]} /></mesh>
            <mesh position={[0, 0.015, 0.03]} material={kit.woolTop}><boxGeometry args={[Math.max(0.2, w - 0.12), 0.13, 1.38]} /></mesh>
            <mesh position={[0, 0, 0.7]} material={kit.wool}><shapeGeometry args={[face, 2]} /></mesh>
            {/* Pontas soltas fazem a silhueta parecer tecido, não um bloco. */}
            {[-1, 1].map((side) => <group key={side} position={[side * (w / 2 - 0.2), -0.72, 0.71]}>
                <mesh rotation={[0, 0, side * 0.22]} material={kit.woolTop}><cylinderGeometry args={[0.035, 0.035, 0.42, 5]} /></mesh>
                <mesh position={[side * 0.07, -0.22, 0]} rotation={[Math.PI / 2, 0, side * 0.6]} material={kit.thread}><torusGeometry args={[0.12, 0.028, 5, 10, Math.PI * 1.25]} /></mesh>
            </group>)}
        </group>
    );
};

const Anchor: React.FC<{ a: { x: number; y: number }; kit: Kit; i: number }> = ({ a, kit, i }) => {
    const ring = useRef<THREE.Mesh>(null!); const halo = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        const d = Math.hypot(a.x - p8.x, a.y - p8.y), hot = d < P8.GRAB_RANGE && a.y >= p8.y - 0.5;
        if (ring.current) { ring.current.material = hot ? kit.anchorHot : kit.anchor; ring.current.rotation.z = Math.sin(clock.elapsedTime * 1.45 + i) * 0.12; }
        if (halo.current) { halo.current.visible = hot; const s = 0.85 + Math.sin(clock.elapsedTime * 4 + i) * 0.08; halo.current.scale.setScalar(s); }
    });
    return (
        <group position={[a.x, a.y, 0.2]}>
            <mesh position={[0, 1.7, -0.05]} material={kit.thread}><cylinderGeometry args={[0.025, 0.025, 3.4, 5]} /></mesh>
            <mesh ref={ring} material={kit.anchor}><torusGeometry args={[0.36, 0.1, 9, 22]} /></mesh>
            <mesh ref={halo} material={kit.glow} scale={0.9}><planeGeometry args={[1.5, 1.5]} /></mesh>
        </group>
    );
};

const BlackThread: React.FC<{ h: { x: number; y: number }; kit: Kit }> = ({ h, kit }) => (
    <group position={[h.x, h.y, 0.18]}>
        {[-0.58, -0.36, -0.15, 0.08, 0.3, 0.53].map((r, i) => (
            <mesh key={i} position={[Math.sin(r) * 0.24, 0.48 + (i % 2) * 0.12, 0]} rotation={[0, 0, r]} material={kit.hazard}>
                <torusKnotGeometry args={[0.16 + (i % 2) * 0.04, 0.035, 18, 4, 2, 3]} />
            </mesh>
        ))}
        <mesh material={kit.hazard}><sphereGeometry args={[0.22, 8, 7]} /></mesh>
    </group>
);

const Spool: React.FC<{ s: { x: number; y: number }; i: number; kit: Kit }> = ({ s, i, kit }) => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        if (!g.current) return;
        g.current.visible = !p8.gotSpools[i]; g.current.position.y = s.y + Math.sin(clock.elapsedTime * 2 + i) * 0.12;
        g.current.rotation.z = clock.elapsedTime * 0.7;
    });
    return (
        <group ref={g} position={[s.x, s.y, 0.3]}>
            <mesh material={kit.spool}><sphereGeometry args={[0.3, 12, 10]} /></mesh>
            {[0, 0.65, -0.65].map((r, n) => <mesh key={n} rotation={[r, 0.2, r * 0.4]} material={kit.thread}><torusGeometry args={[0.3, 0.025, 5, 16]} /></mesh>)}
            <mesh material={kit.glow} scale={1.35}><planeGeometry args={[1.2, 1.2]} /></mesh>
        </group>
    );
};

const SeamGateActor: React.FC<{ i: number; kit: Kit }> = ({ i, kit }) => {
    const g = useRef<THREE.Group>(null!); const m = curMem(), def = m.gates[i];
    const flaps = useMemo(() => ([-1, 1] as const).map((side) => {
        const s = new THREE.Shape(), outer = side * 0.98;
        s.moveTo(outer, 2.15); s.lineTo(outer, -2.15); s.lineTo(side * 0.36, -2.15);
        for (let n = 0; n <= 9; n++) {
            const y = -2.15 + n * (4.3 / 9);
            const x = side * (0.29 + (n % 2 ? 0.17 : 0.02));
            s.lineTo(x, y);
        }
        s.closePath(); return s;
    }), []);
    useFrame(({ clock }) => {
        if (!g.current) return;
        const ratio = (p8.gateProgress[i] ?? 0) / def.needed;
        g.current.visible = ratio < 1; g.current.scale.x = 1 - ratio * 0.18;
        g.current.rotation.z = Math.sin(clock.elapsedTime * 2.2 + i) * 0.012;
    });
    return (
        <group ref={g} position={[def.x, def.y + 2.1, 0.15]}>
            <mesh position={[0, 0, -0.14]}><planeGeometry args={[1.86, 4.45]} /><meshBasicMaterial color="#08050b" transparent opacity={0.86} /></mesh>
            {flaps.map((shape, n) => <mesh key={n} position={[0, 0, 0.55]} material={kit.wool}><shapeGeometry args={[shape, 2]} /></mesh>)}
            {[-1.78, -1.3, -0.82, -0.34, 0.14, 0.62, 1.1, 1.58].map((y, n) => <mesh key={`fray-${n}`} position={[(n % 2 ? -1 : 1) * 0.31, y, 0.68]} rotation={[0, 0, n % 2 ? 0.28 : -0.28]} material={kit.hazard}><cylinderGeometry args={[0.025, 0.025, 0.34, 5]} /></mesh>)}
            {Array.from({ length: def.needed }, (_, n) => {
                const done = (p8.gateProgress[i] ?? 0) > n;
                const y = 1.25 - n * (2.5 / Math.max(1, def.needed - 1));
                const mat = done ? kit.thread : kit.hazard;
                return <group key={n} position={[0, y, 0.76]}>
                    <mesh rotation={[0, 0, -1.13]} material={mat}><cylinderGeometry args={[0.035, 0.035, 0.82, 5]} /></mesh>
                    <mesh rotation={[0, 0, 1.13]} material={mat}><cylinderGeometry args={[0.035, 0.035, 0.82, 5]} /></mesh>
                </group>;
            })}
        </group>
    );
};

const PatchActor: React.FC<{ kit: Kit }> = ({ kit }) => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        if (!g.current) return;
        const patch = p8.patch; g.current.visible = !!patch;
        if (patch) { g.current.position.set(patch.x, patch.y, 0.25); g.current.scale.y = 0.92 + Math.sin(clock.elapsedTime * 5) * 0.08; }
    });
    return (
        <group ref={g} visible={false}>
            {[-0.75, -0.38, 0, 0.38, 0.75].map((x, i) => <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={i % 2 ? kit.thread : kit.woolTop}><torusGeometry args={[0.32, 0.07, 6, 14, Math.PI]} /></mesh>)}
        </group>
    );
};

const TravelerShell: React.FC<{
    kit: Kit; corrupted?: boolean;
    legL?: React.RefObject<THREE.Group | null>; legR?: React.RefObject<THREE.Group | null>;
    needle?: React.RefObject<THREE.Group | null>;
}> = ({ kit, corrupted = false, legL, legR, needle }) => {
    const coat = corrupted ? kit.boss : kit.coat, dark = corrupted ? kit.bossDark : kit.coatDark;
    return (
        <group>
            <group ref={legL as React.RefObject<THREE.Group>} position={[-0.18, 0.42, 0]}>
                <mesh position={[0, -0.2, 0]} material={dark}><cylinderGeometry args={[0.11, 0.13, 0.58, 8]} /></mesh>
                <mesh position={[0.05, -0.53, 0.08]} scale={[1.25, 0.65, 1.45]} material={dark}><sphereGeometry args={[0.16, 9, 7]} /></mesh>
            </group>
            <group ref={legR as React.RefObject<THREE.Group>} position={[0.18, 0.42, 0]}>
                <mesh position={[0, -0.2, 0]} material={dark}><cylinderGeometry args={[0.11, 0.13, 0.58, 8]} /></mesh>
                <mesh position={[0.05, -0.53, 0.08]} scale={[1.25, 0.65, 1.45]} material={dark}><sphereGeometry args={[0.16, 9, 7]} /></mesh>
            </group>
            {/* casaco em camadas, sem corpo-caixa */}
            <mesh position={[0, 0.93, 0]} scale={[0.85, 1.1, 0.72]} material={coat}><sphereGeometry args={[0.48, 14, 11]} /></mesh>
            <mesh position={[0, 0.53, 0.04]} material={coat}><coneGeometry args={[0.47, 0.68, 12]} /></mesh>
            <mesh position={[0, 1.51, 0]} scale={[0.94, 1.06, 0.88]} material={corrupted ? kit.boss : kit.skin}><sphereGeometry args={[0.34, 14, 11]} /></mesh>
            {/* gorro e cachecol */}
            <mesh position={[0, 1.77, 0]} scale={[1, 0.72, 1]} material={dark}><sphereGeometry args={[0.34, 13, 9]} /></mesh>
            <mesh position={[0, 2.01, 0]} material={dark}><sphereGeometry args={[0.115, 9, 7]} /></mesh>
            <mesh position={[0, 1.25, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={kit.scarf}><torusGeometry args={[0.3, 0.09, 8, 18]} /></mesh>
            <mesh position={[-0.29, 0.9, -0.02]} rotation={[0, 0, 0.22]} material={kit.scarf}><boxGeometry args={[0.16, 0.68, 0.09]} /></mesh>
            {/* rosto — olhos grandes o bastante para celular */}
            <mesh position={[-0.12, 1.55, 0.31]} material={corrupted ? kit.core : kit.ink}><sphereGeometry args={[0.052, 8, 7]} /></mesh>
            <mesh position={[0.12, 1.55, 0.31]} material={corrupted ? kit.core : kit.ink}><sphereGeometry args={[0.052, 8, 7]} /></mesh>
            <mesh position={[0, 1.42, 0.325]} rotation={[Math.PI / 2, 0, 0]} material={kit.ink}><torusGeometry args={[0.085, 0.018, 5, 10, corrupted ? Math.PI : Math.PI * 0.65]} /></mesh>
            {/* mochila-novelo */}
            <group position={[-0.34, 1.02, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={corrupted ? kit.bossDark : kit.spool}><cylinderGeometry args={[0.27, 0.27, 0.42, 12]} /></mesh>
                {[-0.12, 0, 0.12].map((z, i) => <mesh key={i} position={[0, z, 0]} material={kit.thread}><torusGeometry args={[0.275, 0.022, 5, 16]} /></mesh>)}
            </group>
            {/* duas mãos realmente alcançam a empunhadura */}
            <group position={[0, 1.2, 0.2]}>
                <mesh position={[-0.27, 0.12, 0]} rotation={[0, 0, -1.05]} material={coat}><cylinderGeometry args={[0.09, 0.11, 0.52, 8]} /></mesh>
                <mesh position={[0.22, 0.3, 0]} rotation={[0, 0, -0.86]} material={coat}><cylinderGeometry args={[0.09, 0.11, 0.52, 8]} /></mesh>
                <mesh position={[-0.01, 0.35, 0.03]} material={corrupted ? kit.boss : kit.skin}><sphereGeometry args={[0.12, 9, 7]} /></mesh>
                <mesh position={[0.19, 0.58, 0.03]} material={corrupted ? kit.boss : kit.skin}><sphereGeometry args={[0.12, 9, 7]} /></mesh>
                <group ref={needle as React.RefObject<THREE.Group>} position={[0.18, 0.56, 0.08]} rotation={[0, 0, -0.64]}>
                    <mesh position={[0, 0.8, 0]} material={kit.metal}><cylinderGeometry args={[0.065, 0.085, 2.35, 10]} /></mesh>
                    <mesh position={[0.04, 1.96, 0]} rotation={[Math.PI / 2, 0, 0.1]} material={kit.metal}><torusGeometry args={[0.16, 0.058, 8, 16, Math.PI * 1.45]} /></mesh>
                    <mesh position={[0, -0.45, 0]} material={dark}><cylinderGeometry args={[0.105, 0.105, 0.45, 9]} /></mesh>
                </group>
            </group>
            {corrupted && (
                <>
                    {[-1.05, -0.72, 0.72, 1.05].map((a, i) => <mesh key={i} position={[Math.sin(a) * 0.65, 1.05 + Math.cos(a) * 0.18, -0.1]} rotation={[0, 0, a]} material={kit.bossDark}><cylinderGeometry args={[0.065, 0.09, 0.85, 7]} /></mesh>)}
                    <mesh position={[0, 1.07, -0.22]} scale={[1.22, 1.45, 1]} material={kit.glow}><planeGeometry args={[1.4, 2]} /></mesh>
                </>
            )}
        </group>
    );
};

const CrochetPlayer: React.FC<{ kit: Kit }> = ({ kit }) => {
    const g = useRef<THREE.Group>(null!); const legL = useRef<THREE.Group>(null); const legR = useRef<THREE.Group>(null); const needle = useRef<THREE.Group>(null);
    useFrame(() => {
        const gg = g.current; if (!gg) return;
        gg.position.set(p8.x, p8.y + 0.56, 0.32); gg.scale.x = p8.facing < 0 ? -1 : 1;
        const target = activeThreadTarget();
        let tilt = 0;
        if (target) tilt = Math.atan2(target.x - p8.x, target.y - p8.y) * (gg.scale.x < 0 ? -1 : 1) * 0.42;
        gg.rotation.z = THREE.MathUtils.lerp(gg.rotation.z, tilt, 0.3);
        const moving = p8.onGround && Math.abs(p8.vx) > 0.4;
        const sw = moving ? Math.sin(p8.runPhase * 3.4) * 0.48 : Math.sin(p8.t * 2.1) * 0.035;
        if (legL.current) legL.current.rotation.z = sw;
        if (legR.current) legR.current.rotation.z = -sw;
        if (needle.current) needle.current.rotation.z = -0.64 + (p8.stitchT > 0 ? Math.sin((p8.stitchT / 0.26) * Math.PI) * 0.95 : target ? 0.38 : 0);
        gg.visible = Math.floor(p8.invuln * 14) % 2 === 0;
    });
    return <group ref={g}><TravelerShell kit={kit} legL={legL} legR={legR} needle={needle} /></group>;
};

const LiveThread: React.FC<{ kit: Kit }> = ({ kit }) => {
    const line = useRef<THREE.Mesh>(null!); const glow = useRef<THREE.Mesh>(null!);
    useFrame(() => {
        const target = activeThreadTarget();
        if (!line.current || !glow.current || !target) { if (line.current) line.current.visible = false; if (glow.current) glow.current.visible = false; return; }
        const sx = p8.x + p8.facing * 0.55, sy = p8.y + 1.9;
        const dx = target.x - sx, dy = target.y - sy, len = Math.hypot(dx, dy);
        for (const mesh of [line.current, glow.current]) {
            mesh.visible = true; mesh.position.set((sx + target.x) / 2, (sy + target.y) / 2, 0.5);
            mesh.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2); mesh.scale.y = len;
        }
        glow.current.scale.x = 1 + p8.tension * 2.4;
    });
    return (
        <>
            <mesh ref={glow} material={kit.glow} visible={false}><planeGeometry args={[0.15, 1]} /></mesh>
            <mesh ref={line} material={kit.thread} visible={false}><cylinderGeometry args={[0.032, 0.032, 1, 5]} /></mesh>
        </>
    );
};

const EnemyActor: React.FC<{ i: number; kind: EnemyKind; kit: Kit }> = ({ i, kind, kit }) => {
    const g = useRef<THREE.Group>(null!); const wingL = useRef<THREE.Group>(null!); const wingR = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        const e = p8.enemies[i], gg = g.current; if (!e || !gg) return;
        if (e.dead) { const s = Math.max(0, 1 - e.deadT * 1.35); gg.visible = s > 0; gg.scale.setScalar(s); gg.rotation.z = e.deadT * 7; return; }
        gg.visible = true; gg.position.set(e.x, e.y + (kind === 'intrusive' ? 0 : 0.08), 0.34);
        const pulse = e.tethered ? 1.12 + Math.sin(clock.elapsedTime * 12) * 0.08 : 1;
        gg.scale.set(e.dir < 0 ? -pulse : pulse, pulse, pulse);
        gg.rotation.z = kind === 'intrusive' ? Math.sin(e.aiT * 2) * 0.18 : e.stunned > 0 ? Math.sin(clock.elapsedTime * 22) * 0.1 : 0;
        if (wingL.current) wingL.current.rotation.z = -0.42 + Math.sin(clock.elapsedTime * 10 + i) * 0.3;
        if (wingR.current) wingR.current.rotation.z = 0.42 - Math.sin(clock.elapsedTime * 10 + i) * 0.3;
    });

    const seams = p8.enemies[i]?.maxSeams ?? 1;
    if (kind === 'intrusive') return (
        <group ref={g}>
            <mesh material={kit.knot}><torusKnotGeometry args={[0.34, 0.105, 28, 6, 2, 3]} /></mesh>
            <mesh material={kit.core}><sphereGeometry args={[0.18, 12, 9]} /></mesh>
            <mesh material={kit.glow} scale={1.45}><planeGeometry args={[1.4, 1.4]} /></mesh>
            <group ref={wingL} position={[-0.35, 0.04, -0.04]} rotation={[0, 0, -0.45]}>
                <mesh scale={[1.2, 0.42, 0.22]} material={kit.boss}><sphereGeometry args={[0.5, 10, 7]} /></mesh>
                <mesh position={[-0.4, 0, 0]} rotation={[0, 0, -0.5]} scale={[0.75, 0.28, 0.16]} material={kit.bossDark}><sphereGeometry args={[0.45, 8, 6]} /></mesh>
            </group>
            <group ref={wingR} position={[0.35, 0.04, -0.04]} rotation={[0, 0, 0.45]}>
                <mesh scale={[1.2, 0.42, 0.22]} material={kit.boss}><sphereGeometry args={[0.5, 10, 7]} /></mesh>
                <mesh position={[0.4, 0, 0]} rotation={[0, 0, 0.5]} scale={[0.75, 0.28, 0.16]} material={kit.bossDark}><sphereGeometry args={[0.45, 8, 6]} /></mesh>
            </group>
            {[-0.45, 0, 0.45].map((x, n) => <mesh key={n} position={[x * 0.55, -0.42, 0]} rotation={[0, 0, x]} material={kit.knotDark}><torusGeometry args={[0.18, 0.035, 5, 12, Math.PI * 1.5]} /></mesh>)}
        </group>
    );
    if (kind === 'echo') return (
        <group ref={g}>
            <mesh position={[0, 0.93, 0]} scale={[0.78, 1.1, 0.58]} material={kit.echo}><sphereGeometry args={[0.47, 12, 9]} /></mesh>
            <mesh position={[0, 1.52, 0]} material={kit.echo}><sphereGeometry args={[0.32, 12, 9]} /></mesh>
            <mesh position={[-0.12, 1.55, 0.3]} material={kit.core}><sphereGeometry args={[0.045, 7, 6]} /></mesh>
            <mesh position={[0.12, 1.55, 0.3]} material={kit.core}><sphereGeometry args={[0.045, 7, 6]} /></mesh>
            <mesh position={[0.42, 1.3, 0]} rotation={[0, 0, -0.7]} material={kit.metal}><cylinderGeometry args={[0.045, 0.06, 1.8, 8]} /></mesh>
            <mesh position={[0, 0.2, -0.1]} scale={[1.4, 0.55, 1]} material={kit.glow}><planeGeometry args={[1.2, 1.2]} /></mesh>
            {Array.from({ length: seams }, (_, n) => <mesh key={n} position={[-0.28 + n * 0.28, 1.03, 0.44]} material={(p8.enemies[i]?.seams ?? 0) > n ? kit.core : kit.knotDark}><torusGeometry args={[0.09, 0.025, 5, 10]} /></mesh>)}
        </group>
    );
    return (
        <group ref={g}>
            <mesh position={[0, 0.78, 0]} material={kit.knot}><torusKnotGeometry args={[0.38, 0.13, 32, 7, 2, 3]} /></mesh>
            <mesh position={[-0.24, 0.2, 0]} material={kit.knotDark}><sphereGeometry args={[0.19, 9, 7]} /></mesh>
            <mesh position={[0.24, 0.2, 0]} material={kit.knotDark}><sphereGeometry args={[0.19, 9, 7]} /></mesh>
            <mesh position={[-0.16, 0.91, 0.36]} material={kit.core}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
            <mesh position={[0.16, 0.91, 0.36]} material={kit.core}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
            {Array.from({ length: seams }, (_, n) => <mesh key={n} position={[-0.28 + n * 0.28, 1.31, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={(p8.enemies[i]?.seams ?? 0) > n ? kit.thread : kit.knotDark}><torusGeometry args={[0.11, 0.035, 6, 12]} /></mesh>)}
        </group>
    );
};

const BossActor: React.FC<{ kit: Kit }> = ({ kit }) => {
    const g = useRef<THREE.Group>(null!); const warning = useRef<THREE.Group>(null!); const open = useRef<THREE.Group>(null!);
    const halo = useRef<THREE.Group>(null!); const head = useRef<THREE.Group>(null!); const needle = useRef<THREE.Group>(null!);
    const armUL = useRef<THREE.Group>(null!); const armUR = useRef<THREE.Group>(null!);
    const armLL = useRef<THREE.Group>(null!); const armLR = useRef<THREE.Group>(null!);
    const maskMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#120b12', roughness: 0.82, metalness: 0.08, flatShading: true, emissive: '#4d1028', emissiveIntensity: 0.38 }), []);
    const boneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d5b18d', roughness: 0.9, emissive: '#5a2630', emissiveIntensity: 0.22 }), []);
    const voidMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#050207', transparent: true, opacity: 0.78, depthWrite: false }), []);
    useEffect(() => () => { maskMat.dispose(); boneMat.dispose(); voidMat.dispose(); }, [maskMat, boneMat, voidMat]);
    useFrame(({ clock }) => {
        const b = p8.boss; if (!b || !g.current) { if (g.current) g.current.visible = false; return; }
        const t = clock.elapsedTime, attack = b.phase === 'attack' ? b.attack : null;
        g.current.visible = b.phase !== 'dormant'; g.current.position.set(b.x, b.y + 0.12, 0.42);
        const pulse = attack && attack !== 'cocoon' ? 1 + Math.sin(t * 14) * 0.025 : 1;
        const hurt = b.hurtT > 0 ? 1 - Math.sin(b.hurtT * 28) * 0.055 : 1;
        const fear = b.seams <= 1 ? 1 + Math.sin(t * 29) * 0.016 : 1;
        g.current.scale.set(-pulse * hurt * fear, pulse * hurt, pulse * hurt);
        g.current.rotation.z = b.phase === 'bound' ? Math.sin(t * 18) * 0.075 : Math.sin(t * 1.2) * 0.012;
        const setArm = (ref: React.RefObject<THREE.Group | null>, target: number) => {
            if (ref.current) ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, target, 0.14);
        };
        const slam = attack === 'slam', sweep = attack === 'sweep', throwing = attack === 'throw', cocoon = attack === 'cocoon';
        setArm(armUL, slam ? -2.58 : sweep ? -1.45 : throwing ? -2.05 : -0.92 + Math.sin(t * 1.4) * 0.05);
        setArm(armUR, slam ? 2.58 : sweep ? 1.45 : throwing ? 2.05 : 0.92 - Math.sin(t * 1.4) * 0.05);
        setArm(armLL, cocoon ? -2.2 : sweep ? -1.55 : throwing ? -0.25 : -0.48);
        setArm(armLR, cocoon ? 2.2 : sweep ? 1.55 : throwing ? 0.25 : 0.48);
        if (needle.current) {
            const target = slam ? -0.06 : sweep ? Math.PI / 2 : throwing ? -0.34 : cocoon ? -0.9 + Math.sin(t * 2) * 0.25 : -0.7;
            needle.current.rotation.z = THREE.MathUtils.lerp(needle.current.rotation.z, target, 0.16);
            needle.current.position.y = slam ? 1.55 : 1.18;
        }
        if (head.current) {
            head.current.rotation.z = b.seams <= 1 ? Math.sin(t * 31) * 0.035 : Math.sin(t * 0.9) * 0.015;
            head.current.position.x = b.seams <= 1 ? Math.sin(t * 47) * 0.025 : 0;
        }
        if (halo.current) {
            halo.current.rotation.z = t * (b.seams <= 1 ? -0.28 : 0.1);
            halo.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.035);
        }
        if (warning.current) {
            warning.current.visible = throwing; warning.current.rotation.z = t * 2.2;
            const s = 0.95 + Math.sin(t * 12) * 0.055; warning.current.scale.setScalar(s);
        }
        if (open.current) {
            open.current.visible = b.phase === 'exposed' || b.phase === 'bound';
            open.current.rotation.z = -t * 0.8;
        }
    });
    return (
        <group ref={g} visible={false}>
            {/* Uma ausência alta e assimétrica: não é mais só o player tingido. */}
            <mesh position={[0, 2.05, -0.5]} scale={[1.4, 2.4, 1]} material={voidMat}><circleGeometry args={[1.18, 32]} /></mesh>
            <group ref={warning} position={[0, 2.18, 0.52]} visible={false}>
                <mesh material={kit.core}><torusGeometry args={[1.38, 0.035, 6, 38]} /></mesh>
                <mesh rotation={[0, 0, Math.PI / 4]} material={kit.thread}><torusGeometry args={[1.05, 0.018, 5, 32]} /></mesh>
                {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => <mesh key={i} position={[Math.cos(a) * 1.38, Math.sin(a) * 1.38, 0]} rotation={[0, 0, a - Math.PI / 2]} material={kit.core}><coneGeometry args={[0.1, 0.34, 5]} /></mesh>)}
            </group>
            <group ref={open} position={[0, 2.05, 0.56]} visible={false}>
                <mesh material={kit.thread}><torusGeometry args={[1.22, 0.03, 5, 36]} /></mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} material={kit.thread}><torusGeometry args={[1.55, 0.018, 5, 38, Math.PI]} /></mesh>
                {[[-0.48, -0.2], [0, 0.1], [0.48, -0.2]].map(([x, y], i) => <mesh key={i} position={[x, y, 0.04]} rotation={[0, 0, i % 2 ? 0 : Math.PI / 2]} material={kit.metal}><torusKnotGeometry args={[0.095, 0.025, 20, 4, 2, 3]} /></mesh>)}
            </group>

            {/* pernas longas, enroladas em fio como articulações remendadas */}
            {[-0.34, 0.34].map((x, i) => <group key={'leg' + i} position={[x, 0.62, 0]} rotation={[0, 0, i ? -0.07 : 0.07]}>
                <mesh position={[0, -0.15, 0]} material={kit.bossDark}><cylinderGeometry args={[0.13, 0.17, 0.9, 7]} /></mesh>
                <mesh position={[i ? 0.09 : -0.09, -0.62, 0.1]} scale={[1.7, 0.55, 1]} material={maskMat}><sphereGeometry args={[0.2, 9, 6]} /></mesh>
                <mesh position={[0, -0.18, 0.18]} rotation={[Math.PI / 2, 0, 0]} material={kit.thread}><torusGeometry args={[0.18, 0.023, 5, 12]} /></mesh>
            </group>)}

            {/* manto invertido: ombros largos, barra que se desfaz em tiras */}
            <mesh position={[0, 1.52, 0]} rotation={[0, 0, Math.PI]} material={kit.boss}><coneGeometry args={[1.05, 2.2, 11]} /></mesh>
            <mesh position={[0, 2.28, 0.02]} scale={[1.32, 0.47, 0.72]} material={kit.bossDark}><sphereGeometry args={[0.84, 14, 9]} /></mesh>
            {[-0.66, -0.23, 0.23, 0.66].map((x, i) => <mesh key={'fray' + i} position={[x, 0.34 - (i % 2) * 0.11, -0.02]} rotation={[0, 0, (i - 1.5) * 0.08]} material={i % 2 ? kit.boss : kit.bossDark}><coneGeometry args={[0.19, 0.94 + (i % 2) * 0.16, 5]} /></mesh>)}
            <mesh position={[0, 1.75, 0.42]} scale={[0.7, 1.2, 0.25]} material={maskMat}><icosahedronGeometry args={[0.7, 1]} /></mesh>
            {/* a costura no peito abre como uma cicatriz de luz */}
            {[-0.36, 0, 0.36].map((y, i) => <group key={'chest' + i} position={[0, 1.58 + y, 0.72]}>
                <mesh position={[-0.11, 0, 0]} rotation={[0, 0, -0.9]} material={kit.core}><cylinderGeometry args={[0.022, 0.022, 0.3, 5]} /></mesh>
                <mesh position={[0.11, 0, 0]} rotation={[0, 0, 0.9]} material={kit.core}><cylinderGeometry args={[0.022, 0.022, 0.3, 5]} /></mesh>
            </group>)}

            {/* quatro braços: a mente imita movimentos que um corpo não consegue fazer */}
            <group ref={armUL} position={[-0.72, 2.3, 0.08]} rotation={[0, 0, -0.92]}>
                <mesh position={[0, -0.58, 0]} material={kit.boss}><cylinderGeometry args={[0.12, 0.17, 1.18, 7]} /></mesh><mesh position={[0, -1.16, 0.08]} material={boneMat}><sphereGeometry args={[0.15, 8, 6]} /></mesh>
            </group>
            <group ref={armUR} position={[0.72, 2.3, 0.08]} rotation={[0, 0, 0.92]}>
                <mesh position={[0, -0.58, 0]} material={kit.boss}><cylinderGeometry args={[0.12, 0.17, 1.18, 7]} /></mesh><mesh position={[0, -1.16, 0.08]} material={boneMat}><sphereGeometry args={[0.15, 8, 6]} /></mesh>
            </group>
            <group ref={armLL} position={[-0.62, 1.8, -0.03]} rotation={[0, 0, -0.48]}>
                <mesh position={[0, -0.5, 0]} material={kit.bossDark}><cylinderGeometry args={[0.095, 0.14, 1.02, 7]} /></mesh><mesh position={[0, -1.01, 0.08]} material={boneMat}><sphereGeometry args={[0.13, 8, 6]} /></mesh>
            </group>
            <group ref={armLR} position={[0.62, 1.8, -0.03]} rotation={[0, 0, 0.48]}>
                <mesh position={[0, -0.5, 0]} material={kit.bossDark}><cylinderGeometry args={[0.095, 0.14, 1.02, 7]} /></mesh><mesh position={[0, -1.01, 0.08]} material={boneMat}><sphereGeometry args={[0.13, 8, 6]} /></mesh>
            </group>

            {/* a mesma agulha do player, transformada em instrumento de tear */}
            <group ref={needle} position={[0, 1.18, 0.56]} rotation={[0, 0, -0.7]}>
                <mesh position={[0, 1.65, 0]} material={kit.metal}><cylinderGeometry args={[0.055, 0.11, 3.75, 10]} /></mesh>
                <mesh position={[0.03, 3.5, 0]} rotation={[Math.PI / 2, 0, 0.05]} material={kit.metal}><torusGeometry args={[0.21, 0.06, 8, 18, Math.PI * 1.5]} /></mesh>
                <mesh position={[0, -0.27, 0]} material={kit.bossDark}><cylinderGeometry args={[0.16, 0.16, 0.58, 9]} /></mesh>
                <mesh position={[0.08, 3.53, -0.03]} rotation={[0, 0, 0.35]} material={kit.thread}><torusGeometry args={[0.33, 0.025, 5, 18, Math.PI * 1.4]} /></mesh>
            </group>

            {/* máscara quebrada em duas metades e um único olhar horizontal */}
            <group ref={head} position={[0, 3.18, 0.1]}>
                <mesh scale={[0.76, 0.98, 0.56]} material={maskMat}><icosahedronGeometry args={[0.62, 1]} /></mesh>
                <mesh position={[-0.22, 0.01, 0.49]} scale={[0.42, 0.85, 0.12]} material={kit.boss}><sphereGeometry args={[0.54, 10, 8]} /></mesh>
                <mesh position={[0.05, 0, 0.61]} rotation={[0, 0, 0.09]} material={kit.core}><boxGeometry args={[0.54, 0.055, 0.045]} /></mesh>
                <mesh position={[0.29, -0.02, 0.62]} material={kit.thread}><sphereGeometry args={[0.06, 8, 6]} /></mesh>
                <mesh position={[0, -0.02, 0.64]} rotation={[0, 0, 0.04]} material={kit.glow} scale={[1.2, 0.35, 1]}><planeGeometry args={[1.2, 1.2]} /></mesh>
                {[-0.2, 0.2].map((y, i) => <mesh key={i} position={[0.02, y, 0.58]} rotation={[0, 0, i ? 0.55 : -0.55]} material={kit.metal}><cylinderGeometry args={[0.018, 0.018, 0.3, 5]} /></mesh>)}
            </group>

            {/* cinco problemas orbitam como feridas, não como barra de vida */}
            <group ref={halo} position={[0, 3.2, 0.22]}>
                <mesh rotation={[0, 0, Math.PI / 5]} material={kit.bossDark}><torusGeometry args={[1.28, 0.035, 6, 42]} /></mesh>
                {Array.from({ length: 5 }, (_, i) => {
                    const a = -Math.PI * 0.92 + i * (Math.PI * 0.46), alive = (p8.boss?.seams ?? 0) > i;
                    return <group key={i} position={[Math.sin(a) * 1.28, Math.cos(a) * 1.28, 0.38]} rotation={[0, 0, -a]}>
                        <mesh material={alive ? kit.core : kit.knotDark}><torusKnotGeometry args={[0.14, 0.042, 20, 5, 2, 3]} /></mesh>
                        <mesh position={[0, -0.42, -0.03]} material={alive ? kit.thread : kit.knotDark}><cylinderGeometry args={[0.018, 0.018, 0.72, 5]} /></mesh>
                        {alive && <mesh material={kit.glow} scale={0.82}><planeGeometry args={[1, 1]} /></mesh>}
                    </group>;
                })}
            </group>
        </group>
    );
};

/** Os EFEITOS da luta: o anel vermelho do slam, a varredura de fio, os novelos
 *  arremessados (brancos = aparáveis; dourados = refletidos), o casulo do
 *  isolamento e os novelos-coração de cura. Tudo em pools fixos, sem alocação. */
const BossFX: React.FC<{ kit: Kit }> = ({ kit }) => {
    const ring = useRef<THREE.Group>(null!);
    const sweep = useRef<THREE.Group>(null!);
    const sweepTele = useRef<THREE.Group>(null!);
    const shield = useRef<THREE.Group>(null!);
    const projs = useRef<THREE.Group[]>([]);
    const hearts = useRef<THREE.Group[]>([]);
    const projMatW = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f0e8', emissive: '#d8d0c0', emissiveIntensity: 0.7, roughness: 0.7 }), []);
    const projMatG = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffe49a', emissive: '#e3a53c', emissiveIntensity: 1.55, roughness: 0.42 }), []);
    useEffect(() => () => { projMatW.dispose(); projMatG.dispose(); }, [projMatW, projMatG]);
    useFrame(({ clock }) => {
        const b = p8.boss, t = clock.elapsedTime;
        const medo = (b?.seams ?? 5) <= 1;
        // anel do SLAM
        if (ring.current) {
            const on = !!b && b.phase === 'attack' && b.attack === 'slam' && b.atkT < (medo ? 0.55 : 0.9) + 0.34;
            ring.current.visible = on;
            if (on && b) {
                const tele = medo ? 0.55 : 0.9, lock = Math.min(1, b.atkT / tele);
                ring.current.position.set(b.slamX, 0.11, 0.54);
                const k = 1.85 + lock * 0.45 + Math.sin(t * (medo ? 24 : 16)) * 0.08;
                ring.current.scale.set(k, k, 1);
                ring.current.rotation.z = Math.sin(t * 4) * 0.025;
            }
        }
        // varredura do CONTROLE
        const sweeping = !!b && b.phase === 'attack' && b.attack === 'sweep';
        if (sweep.current) {
            sweep.current.visible = sweeping && b!.atkT >= 0.7;
            if (sweep.current.visible && b) {
                sweep.current.position.set(b.sweepX, b.sweepY + 0.38, 0.62);
                sweep.current.scale.x = b.sweepDir;
                sweep.current.rotation.z = Math.sin(t * 18) * 0.035;
            }
        }
        if (sweepTele.current) {
            sweepTele.current.visible = sweeping && b!.atkT < 0.7;
            if (sweepTele.current.visible && b) {
                sweepTele.current.position.set(27, (b.sweepN === 0 ? 0.55 : 2.0) + 0.38, 0.5);
                sweepTele.current.scale.y = 0.92 + Math.sin(t * 20) * 0.08;
            }
        }
        // casulo do ISOLAMENTO
        if (shield.current) {
            shield.current.visible = !!b && b.shield;
            if (shield.current.visible && b) {
                shield.current.position.set(b.x, b.y + 2.0, 0.57);
                shield.current.rotation.y = t * 0.34; shield.current.rotation.z = t * 0.16;
                const breathe = 1 + Math.sin(t * 2.4) * 0.045; shield.current.scale.set(breathe, breathe * 1.12, breathe);
            }
        }
        // projéteis
        const list = b?.projectiles ?? [];
        let pi = 0;
        for (const pr of list) {
            if (pr.dead || pi >= projs.current.length) continue;
            const m = projs.current[pi++]; if (!m) continue;
            m.visible = true; m.position.set(pr.x, pr.y, 0.68);
            m.rotation.z = Math.atan2(pr.vy, pr.vx);
            const pulse = 1 + Math.sin(t * 13 + pi) * 0.06; m.scale.setScalar(pulse);
            const signalMat = pr.reflected ? projMatG : projMatW;
            for (const child of m.children) if (child.name === 'signal' && (child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = signalMat;
        }
        for (; pi < projs.current.length; pi++) if (projs.current[pi]) projs.current[pi].visible = false;
        // corações
        let hi = 0;
        for (const pk of p8.pickups) {
            if (hi >= hearts.current.length) break;
            const h = hearts.current[hi++];
            if (!h) continue;
            h.visible = true;
            h.position.set(pk.x, pk.y + Math.sin(t * 3 + pk.x) * 0.08, 0.4);
            h.rotation.z = Math.sin(t * 2) * 0.2;
            const blink = pk.t > 9 ? (Math.sin(t * 14) > 0 ? 1 : 0.25) : 1;
            h.scale.setScalar(blink);
        }
        for (; hi < hearts.current.length; hi++) if (hearts.current[hi]) hearts.current[hi].visible = false;
    });
    return (
        <>
            {/* o anel de alerta no chão (VERGONHA/MEDO) */}
            <group ref={ring} visible={false}>
                <mesh scale={[1, 0.2, 1]}><ringGeometry args={[0.72, 1, 36]} /><meshBasicMaterial color="#ff334f" transparent opacity={0.78} depthWrite={false} toneMapped={false} /></mesh>
                <mesh scale={[1, 0.2, 1]}><circleGeometry args={[0.7, 32]} /><meshBasicMaterial color="#ff183d" transparent opacity={0.2} depthWrite={false} /></mesh>
                <mesh scale={[1.25, 0.025, 1]}><boxGeometry args={[2, 1, 0.02]} /><meshBasicMaterial color="#ff8c94" transparent opacity={0.72} depthWrite={false} /></mesh>
                <mesh scale={[0.025, 0.5, 1]}><boxGeometry args={[2, 1, 0.02]} /><meshBasicMaterial color="#ff8c94" transparent opacity={0.72} depthWrite={false} /></mesh>
                {[0.7, 1.25, 1.8].map((y, i) => <mesh key={i} position={[0, y, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.16 + i * 0.025, 0.36, 5]} /><meshBasicMaterial color={i === 2 ? '#fff0cf' : '#ff4b62'} transparent opacity={0.9 - i * 0.14} toneMapped={false} /></mesh>)}
            </group>
            {/* CONTROLE: uma agulha de tear conduz uma faixa, não uma caixa solta */}
            <group ref={sweep} visible={false}>
                <mesh name="signal" material={kit.thread}><boxGeometry args={[0.14, 1.7, 0.22]} /></mesh>
                <mesh position={[-0.46, 0, -0.02]} rotation={[0, 0, Math.PI / 2]} material={kit.metal}><cylinderGeometry args={[0.045, 0.08, 1.12, 8]} /></mesh>
                <mesh position={[-0.98, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={kit.metal}><torusGeometry args={[0.15, 0.045, 7, 14, Math.PI * 1.5]} /></mesh>
                {[-0.56, -0.28, 0, 0.28, 0.56].map((y, i) => <mesh key={i} position={[-0.7 - i * 0.18, y, -0.08]} rotation={[0, 0, Math.PI / 2 + y * 0.12]} material={kit.thread}><cylinderGeometry args={[0.022, 0.04, 1.7 + i * 0.25, 5]} /></mesh>)}
                <mesh position={[-1.25, 0, -0.16]} scale={[2.8, 1.12, 1]}><planeGeometry args={[1, 1]} /><meshBasicMaterial color="#f05a72" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
            </group>
            <group ref={sweepTele} visible={false}>
                <mesh><planeGeometry args={[30, 1.12]} /><meshBasicMaterial color="#ffb6bd" transparent opacity={0.105} depthWrite={false} /></mesh>
                {[-12, -8, -4, 0, 4, 8, 12].map((x, i) => <group key={i} position={[x, 0, 0.03]}>
                    <mesh rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.12, 0.3, 4]} /><meshBasicMaterial color={i % 2 ? '#f05a72' : '#f7e8d6'} transparent opacity={0.72} toneMapped={false} /></mesh>
                    <mesh position={[0, i % 2 ? 0.42 : -0.42, 0]}><boxGeometry args={[1.7, 0.025, 0.02]} /><meshBasicMaterial color="#fff0db" transparent opacity={0.35} /></mesh>
                </group>)}
            </group>
            {/* o casulo blindado */}
            <group ref={shield} visible={false}>
                <mesh scale={[1, 1.32, 1]}><sphereGeometry args={[1.75, 16, 12]} /><meshStandardMaterial color="#21131f" transparent opacity={0.58} roughness={0.95} emissive="#641a37" emissiveIntensity={0.48} wireframe /></mesh>
                {[0.72, 1.04, 1.34].map((s, i) => <mesh key={i} scale={[s, s * 1.34, s]} rotation={[0, 0, i * 0.7]} material={i === 2 ? kit.thread : kit.boss}><torusGeometry args={[1.2, 0.035 + i * 0.008, 6, 38]} /></mesh>)}
                {[-1.3, -0.88, -0.45, 0, 0.45, 0.88, 1.3].map((x, i) => <mesh key={'bar' + i} position={[x, 0, 0.12]} rotation={[0, 0, x * -0.24]} material={i % 2 ? kit.boss : kit.thread}><cylinderGeometry args={[0.018, 0.035, 4.6 - Math.abs(x) * 0.5, 5]} /></mesh>)}
                <mesh material={kit.glow} scale={[3.4, 4.1, 1]}><planeGeometry args={[1, 1]} /></mesh>
            </group>
            {/* pool de projéteis */}
            {Array.from({ length: 6 }, (_, i) => (
                <group key={'pr' + i} ref={(el) => { if (el) projs.current[i] = el; }} visible={false}>
                    <mesh name="signal" material={projMatW}><icosahedronGeometry args={[0.36, 1]} /></mesh>
                    {[0, Math.PI / 3, Math.PI * 0.68].map((r, n) => <mesh name="signal" key={n} rotation={[r, r * 0.5, r]} material={projMatW}><torusGeometry args={[0.37, 0.027, 5, 18]} /></mesh>)}
                    <mesh name="signal" position={[-0.58, 0, -0.04]} rotation={[0, 0, Math.PI / 2]} material={projMatW}><cylinderGeometry args={[0.018, 0.045, 1.05, 5]} /></mesh>
                    <mesh name="signal" scale={1.55} material={projMatW}><torusGeometry args={[0.47, 0.018, 5, 24]} /></mesh>
                    <mesh scale={1.5} material={kit.glow}><planeGeometry args={[1.25, 1.25]} /></mesh>
                </group>
            ))}
            {/* pool de novelos-coração */}
            {Array.from({ length: 4 }, (_, i) => (
                <group key={'hp' + i} ref={(el) => { if (el) hearts.current[i] = el; }} visible={false}>
                    <mesh material={kit.core}><sphereGeometry args={[0.28, 12, 10]} /></mesh>
                    <mesh rotation={[0.5, 0, 0]} material={kit.thread}><torusGeometry args={[0.29, 0.035, 6, 16]} /></mesh>
                    <mesh material={kit.glow} scale={1.4}><planeGeometry args={[1, 1]} /></mesh>
                </group>
            ))}
        </>
    );
};

const Rain: React.FC<{ endX: number }> = ({ endX }) => {
    const points = useRef<THREE.Points>(null!);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 88, arr = new Float32Array(n * 3), r = seedRng(717);
        for (let i = 0; i < n; i++) { arr[i * 3] = r() * (endX + 18) - 6; arr[i * 3 + 1] = r() * 15 - 2; arr[i * 3 + 2] = r() * 3 - 1.5; }
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g;
    }, [endX]);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#d0def0', size: 0.075, transparent: true, opacity: 0.66, depthWrite: false }), []);
    useFrame((_, dt) => { if (points.current) { points.current.position.y -= dt * 6.5; points.current.position.x -= dt * 1.2; if (points.current.position.y < -14) points.current.position.set(2.4, 14, 0); } });
    return <points ref={points} geometry={geo} material={mat} />;
};

/** Camadas leves que ligam a pintura do GPT Images ao espaço jogável. A arte
 *  dá a arquitetura; estes fios, poeira e o arco do tear dão paralaxe e pulso
 *  sem adicionar pós-processamento pesado. */
const YourselfAtmosphere: React.FC = () => {
    const loom = useRef<THREE.Group>(null!); const motes = useRef<THREE.Points>(null!);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 96, a = new Float32Array(n * 3), r = seedRng(8021);
        for (let i = 0; i < n; i++) {
            a[i * 3] = r() * 58 - 2; a[i * 3 + 1] = r() * 12 - 1.5; a[i * 3 + 2] = -2 - r() * 6;
        }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#edc79a', size: 0.055, transparent: true, opacity: 0.58, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (loom.current) loom.current.rotation.z = Math.sin(t * 0.18) * 0.006;
        if (motes.current) { motes.current.position.y = Math.sin(t * 0.16) * 0.35; motes.current.rotation.z = Math.sin(t * 0.09) * 0.008; }
    });
    return (
        <>
            <points ref={motes} geometry={geo} material={mat} />
            <group ref={loom} position={[28, -3.3, -8]}>
                {[-10, -6, -2, 2, 6, 10].map((x, i) => <group key={i} position={[x, 7.2 - (i % 3) * 0.55, 0.2]}>
                    <mesh rotation={[0, 0, (i % 2 ? 1 : -1) * 0.025]}><cylinderGeometry args={[0.014, 0.028, 8.5 + (i % 2) * 1.2, 4]} /><meshBasicMaterial color={i % 3 === 0 ? '#d0a45d' : '#8d2940'} transparent opacity={0.62} depthWrite={false} /></mesh>
                    {i % 3 === 0 && <mesh position={[0, -3.4, 0.05]}><torusGeometry args={[0.24, 0.035, 5, 15]} /><meshBasicMaterial color="#d2a966" transparent opacity={0.72} /></mesh>}
                </group>)}
            </group>
        </>
    );
};

const Scene: React.FC<{
    moveRef: React.MutableRefObject<number>; vertRef: React.MutableRefObject<number>;
    jumpRef: React.MutableRefObject<boolean>; grappleRef: React.MutableRefObject<boolean>;
    stitchRef: React.MutableRefObject<boolean>; introRef: React.MutableRefObject<boolean>;
}> = ({ moveRef, vertRef, jumpRef, grappleRef, stitchRef, introRef }) => {
    const cam = useThree((s) => s.camera), scene = useThree((s) => s.scene);
    const sky = useRef<THREE.Group>(null!); const fg = useRef<THREE.Group>(null!); const flash = useRef<THREE.AmbientLight>(null!); const nextBolt = useRef(4);
    const bossLight = useRef<THREE.PointLight>(null!);
    const mem = curMem(), kit = makeKit(mem), lift = BG_LIFT[mem.key] ?? BG_LIFT.hotel;
    useEffect(() => {
        scene.fog = new THREE.Fog(mem.pal.fog, mem.key === 'yourself' ? 26 : 22, 58);
        return () => { scene.fog = null; };
    }, [scene, mem.key, mem.pal.fog]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (f8.phase === 'platformer' && !introRef.current) {
            const ev = stepPlayer({ move: moveRef.current, vert: vertRef.current, jump: jumpRef.current, grapple: grappleRef.current, stitch: stitchRef.current }, dt);
            jumpRef.current = false; stitchRef.current = false;
            if (ev.stomped || ev.unravelled) f8Sting('stomp');
            if (ev.beat || ev.bossSeam) f8Sting('beat');
            if (ev.won) { f8Sting('win'); f8MusicStop(2.4); }
        }
        const bossFocus = mem.key === 'yourself' && p8.x > 15 ? 1.5 : 2.8;
        const tx = Math.max(2, Math.min(mem.endX - 6, p8.x + bossFocus));
        cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 4.3);
        const ty = 2.75 + Math.max(0, p8.y) * 0.36;
        cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 3.4);
        cam.position.z = 14; cam.rotation.set(0, 0, 0); cam.lookAt(cam.position.x, cam.position.y, 0);
        if (sky.current) sky.current.position.set(cam.position.x * 0.925, cam.position.y * 0.24 + 2.25, -16);
        if (fg.current) fg.current.position.set(cam.position.x * -0.13, -1.15, 4.6);
        if (mem.key === 'tempestade' && flash.current) {
            if (clock.elapsedTime > nextBolt.current) { flash.current.intensity = 1.8; nextBolt.current = clock.elapsedTime + 6 + Math.random() * 8; }
            flash.current.intensity = Math.max(0, flash.current.intensity - dt * 4.2);
        }
        if (mem.key === 'yourself' && bossLight.current) {
            const b = p8.boss, attack = b?.phase === 'attack' ? b.attack : null;
            bossLight.current.position.set(b?.x ?? 43, (b?.y ?? 0) + 2.4, 5);
            bossLight.current.color.set(attack === 'slam' ? '#ff294d' : attack === 'sweep' ? '#ffbf92' : attack === 'throw' ? '#fff0c9' : attack === 'cocoon' ? '#bc3f76' : '#e16672');
            const hit = (b?.hurtT ?? 0) > 0 ? 1.8 : 0;
            bossLight.current.intensity += ((attack ? 2.05 : 1.18) + hit - bossLight.current.intensity) * Math.min(1, dt * 7);
        }
    });
    return (
        <>
            <ambientLight color={mem.pal.ambient} intensity={mem.key === 'hotel' || mem.key === 'tempestade' ? 1.18 : mem.key === 'yourself' ? 1.04 : 0.88} />
            <hemisphereLight color={mem.pal.light} groundColor={mem.pal.bgLo} intensity={0.82} />
            <directionalLight position={[6, 10, 8]} intensity={mem.key === 'yourself' ? 1.08 : 0.92} color={mem.pal.light} />
            <pointLight position={[p8.x, p8.y + 3, 5]} intensity={0.7} distance={12} color={mem.pal.thread} />
            {mem.key === 'yourself' && <pointLight ref={bossLight} position={[43, 2.4, 5]} intensity={1.18} distance={15} decay={1.45} color="#e16672" />}
            {mem.key === 'tempestade' && <ambientLight ref={flash} color="#dceaff" intensity={0} />}
            <group ref={sky}>
                <mesh material={kit.bg}><planeGeometry args={[33.2, 16]} /></mesh>
                <mesh position={[0, 0, 0.02]}><planeGeometry args={[33.2, 16]} /><meshBasicMaterial color={lift.color} transparent opacity={lift.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            </group>
            <group ref={fg}><mesh material={kit.fg}><planeGeometry args={[36, 4.5]} /></mesh></group>
            {mem.key === 'tempestade' && <Rain endX={mem.endX} />}
            {mem.key === 'yourself' && <YourselfAtmosphere />}
            {mem.ledges.map((l, i) => <YarnLedge key={`${mem.key}-l${i}`} l={l} kit={kit} />)}
            {mem.anchors.map((a, i) => <Anchor key={`${mem.key}-a${i}`} a={a} i={i} kit={kit} />)}
            {mem.hazards.map((h, i) => <BlackThread key={`${mem.key}-h${i}`} h={h} kit={kit} />)}
            {mem.gates.map((_, i) => <SeamGateActor key={`${mem.key}-g${i}`} i={i} kit={kit} />)}
            {mem.enemies.map((e, i) => <EnemyActor key={`${mem.key}-e${i}`} i={i} kind={e.kind ?? 'knotling'} kit={kit} />)}
            {mem.spools.map((s, i) => <Spool key={`${mem.key}-s${i}`} s={s} i={i} kit={kit} />)}
            <PatchActor kit={kit} />
            <BossActor kit={kit} />
            {mem.boss && <BossFX kit={kit} />}
            <CrochetPlayer kit={kit} />
            <LiveThread kit={kit} />
        </>
    );
};

const btn: React.CSSProperties = {
    pointerEvents: 'auto', width: 72, height: 72, borderRadius: 38, fontSize: 20,
    background: 'linear-gradient(145deg,rgba(28,20,29,.82),rgba(8,7,12,.72))',
    border: '1px solid rgba(255,255,255,.38)', color: '#fff', touchAction: 'none',
    fontFamily: 'monospace', boxShadow: 'inset 0 1px rgba(255,255,255,.12),0 5px 18px rgba(0,0,0,.32)',
};

export const Floor8Platformer: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
    const [, setV] = useState(0);
    const moveRef = useRef(0), vertRef = useRef(0); const jumpRef = useRef(false), grappleRef = useRef(false), stitchRef = useRef(false);
    const introRef = useRef(true), keys = useRef<Record<string, boolean>>({}), touchMove = useRef(0);
    const [introKey, setIntroKey] = useState(-1); const lastMem = useRef(-1);
    // a MORTE na luta: quando p8.deaths sobe, a tela se desfia e a batalha recomeça
    const lastDeaths = useRef(p8.deaths);
    const [deathKey, setDeathKey] = useState(0);
    useEffect(() => {
        if (p8.deaths !== lastDeaths.current) { lastDeaths.current = p8.deaths; setDeathKey(Date.now()); }
    });
    useEffect(() => {
        const bump = () => setV((v) => v + 1), offF8 = f8Subscribe(bump), offP8 = p8Subscribe(bump);
        return () => { offF8(); offP8(); };
    }, []);
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8plat = { p8, reset: p8Reset, introRef }; }, []);
    const activePhase = f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
    useEffect(() => {
        if (!activePhase) { lastMem.current = -1; return; }
        if (p8.memIdx === lastMem.current) return;
        lastMem.current = p8.memIdx; introRef.current = true; setIntroKey(p8.memIdx); f8MusicStart(curMem().key);
    });
    useEffect(() => { if (activePhase) return () => f8MusicStop(1); }, [activePhase]);
    useEffect(() => {
        const jump = (k: string) => k === ' ' || k === 'w';
        const grab = (k: string) => k === 'j' || k === 'shift' || k === 'e';
        const stitch = (k: string) => k === 'k' || k === 'q' || k === 'f';
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase(); keys.current[k] = true;
            if (jump(k)) { e.preventDefault(); if (!e.repeat) jumpRef.current = true; }
            if (grab(k)) { e.preventDefault(); grappleRef.current = true; }
            if (stitch(k)) { e.preventDefault(); if (!e.repeat) stitchRef.current = true; }
        };
        const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); keys.current[k] = false; if (grab(k)) grappleRef.current = false; };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, []);
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const k = keys.current;
            moveRef.current = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + touchMove.current;
            vertRef.current = (k.arrowup ? 1 : 0) - (k.arrowdown ? 1 : 0);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
    }, []);
    if (!activePhase) return null;
    const won = p8.won || f8.phase === 'memoriaRecuperada', mem = curMem(), pal = mem.pal, photo = BG_URLS[mem.key];
    const hold = (fn: () => void, off: () => void) => ({
        onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); },
        onPointerUp: off, onPointerLeave: off, onPointerCancel: off,
    });
    const bossActive = !!p8.boss && p8.boss.phase !== 'dormant';
    const seamNames = ['VERGONHA', 'CONTROLE', 'RUMINAÇÃO', 'ISOLAMENTO', 'MEDO'];
    const bz = p8.boss;
    const bossCue: { name: string; action: string; response: string; color: string; soft: string } | null = bz?.phase === 'attack' ? (
        bz.attack === 'slam' ? { name: bz.seams <= 1 ? 'MEDO · QUEDA DUPLA' : 'VERGONHA · MARCA', action: 'O alvo vermelho fechou no seu chão.', response: 'CORRA PARA FORA DO CÍRCULO', color: '#ff4963', soft: 'rgba(255,45,77,.17)' }
        : bz.attack === 'sweep' ? (bz.sweepN === 0
            ? { name: 'CONTROLE · VARREDURA BAIXA', action: 'O tear vai cortar a faixa dos seus pés.', response: 'PULE POR CIMA', color: '#ffb07c', soft: 'rgba(255,156,105,.16)' }
            : { name: 'CONTROLE · VARREDURA ALTA', action: 'O tear vai cortar acima do chão.', response: 'FIQUE ABAIXO', color: '#ffcf9f', soft: 'rgba(255,190,120,.14)' })
        : bz.attack === 'throw' ? { name: bz.seams <= 1 ? 'MEDO · ECO DUPLO' : 'RUMINAÇÃO · CONTRA-PONTO', action: 'O novelo branco repete a direção até você.', response: 'TOQUE FIO QUANDO ELE CHEGAR', color: '#fff0c6', soft: 'rgba(255,236,190,.13)' }
        : bz.attack === 'cocoon' ? { name: 'ISOLAMENTO · CASULO', action: 'A parede só existe enquanto os pensamentos voam.', response: 'DESFAÇA OS DOIS INTRUSIVOS', color: '#d77aa1', soft: 'rgba(190,48,110,.18)' }
        : null)
        : bz?.phase === 'exposed' ? { name: 'A COSTURA ABRIU', action: 'O padrão falhou por alguns segundos.', response: 'FISGUE A LUZ DOURADA', color: '#ffd77f', soft: 'rgba(255,198,82,.16)' }
        : bz?.phase === 'bound' ? { name: 'VOCÊ O ALCANÇOU', action: 'Não deixe o fio ceder.', response: 'MANTENHA FIO · CRAVE AGULHA', color: '#ffe9a6', soft: 'rgba(255,224,128,.16)' }
        : null;
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 56, background: pal.bgLo, touchAction: 'none', overflow: 'hidden' }}>
            <Canvas orthographic dpr={[0.75, 1.2]} camera={{ position: [2, 2.75, 14], zoom: 58, near: 0.1, far: 120 }} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}>
                <Scene moveRef={moveRef} vertRef={vertRef} jumpRef={jumpRef} grappleRef={grappleRef} stitchRef={stitchRef} introRef={introRef} />
            </Canvas>
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%,transparent 58%,rgba(3,2,7,.28) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'soft-light', opacity: 0.028, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,#000 1px 3px)' }} />
            {bossActive && bossCue && <div data-f8-attack-vignette style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: `inset 0 0 150px ${bossCue.soft}`, transition: 'box-shadow .24s ease' }} />}

            {introKey >= 0 && (
                <div data-f8-intro key={introKey} style={{ position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(7,5,10,.96)', animation: 'f8photoHold 3.5s ease forwards' }}>
                        {mem.key === 'yourself' ? (
                            <div data-f8-boss-intro style={{ width: 'min(88vw,760px)', padding: '42px 28px 34px', textAlign: 'center', border: '1px solid rgba(240,90,114,.34)', background: 'radial-gradient(circle at 50% 42%,rgba(129,43,67,.42),rgba(10,5,12,.92) 62%)', boxShadow: '0 0 90px rgba(215,61,93,.24),inset 0 0 70px #000', clipPath: 'polygon(3% 0,97% 2%,100% 91%,94% 100%,4% 97%,0 8%)' }}>
                                <div style={{ color: '#a78183', font: '10px/1.3 monospace', letterSpacing: 5 }}>ETAPA V · NÃO HÁ INIMIGO DO OUTRO LADO</div>
                                <div style={{ margin: '17px 0 8px', color: '#f3c8c9', font: '600 clamp(38px,10vw,82px)/.94 Georgia,serif', letterSpacing: 'min(2vw,14px)', textShadow: '0 0 12px #ff496d,0 0 45px #7c1835', animation: 'f8bossName 1.25s ease-in-out infinite alternate' }}>YOURSELF</div>
                                <div style={{ color: '#e9c6b8', font: 'italic 15px/1.5 Georgia,serif' }}>Não destrua o corpo. Leia o ataque, devolva o fio e recosture o que foi aberto.</div>
                                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 7, marginTop: 20 }}>
                                    {seamNames.map((name, i) => <span key={name} style={{ padding: '5px 9px', border: '1px dashed #bd5365', color: '#d89aa2', font: '9px monospace', transform: `rotate(${i % 2 ? 2 : -2}deg)` }}>{name}</span>)}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#eee5d4', padding: '11px 11px 36px', width: 'min(78vw,480px)', transform: 'rotate(-1.2deg)', boxShadow: '0 22px 70px #000' }}>
                                <div style={{ height: 'min(42vw,250px)', position: 'relative', overflow: 'hidden', backgroundImage: `linear-gradient(rgba(0,0,0,.04),rgba(0,0,0,.18)),url(${photo})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                    <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 35px rgba(0,0,0,.55)' }} />
                                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, textAlign: 'center', color: '#fff', fontFamily: 'Georgia,serif', letterSpacing: 4, fontSize: 14, textShadow: '0 2px 8px #000' }}>{mem.title}</div>
                                </div>
                                <div style={{ padding: '12px 10px 0', color: '#3d3127', font: 'italic 14px/1.45 Georgia,serif', textAlign: 'center' }}>{mem.caption}</div>
                            </div>
                        )}
                    </div>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: '#000', transformOrigin: 'top', animation: 'f8blinkTop 5s ease-in-out forwards' }} />
                    <div onAnimationEnd={() => { introRef.current = false; setIntroKey(-1); }} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: '#000', transformOrigin: 'bottom', animation: 'f8blinkBot 5s ease-in-out forwards' }} />
                </div>
            )}

            {!won && (
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, right: 12, color: '#fff', textAlign: 'center', textShadow: '0 2px 10px #000', pointerEvents: 'none' }}>
                    <div style={{ font: '600 13px/1.2 Georgia,serif', letterSpacing: bossActive ? 2 : 2.4 }}>{p8Objective()}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 7, font: '10px monospace' }}>
                        <span style={{ color: '#efb8a5' }}>{'◆'.repeat(p8.integrity)}<span style={{ opacity: 0.22 }}>{'◆'.repeat(3 - p8.integrity)}</span></span>
                        <span>🧶 {p8.spools}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>FIO <i style={{ display: 'inline-block', width: 64, height: 5, border: '1px solid rgba(255,255,255,.45)', borderRadius: 4, overflow: 'hidden' }}><b style={{ display: 'block', width: `${p8.threadCharge * 100}%`, height: '100%', background: pal.thread, boxShadow: `0 0 7px ${pal.thread}` }} /></i></span>
                    </div>
                    {bossActive && <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        {seamNames.map((name, i) => <span key={name} style={{ padding: '2px 5px', border: '1px solid rgba(240,90,114,.42)', color: i < (p8.boss?.seams ?? 0) ? '#f0a3af' : '#75606a', opacity: i < (p8.boss?.seams ?? 0) ? 1 : 0.42, font: '8px monospace', textDecoration: i < (p8.boss?.seams ?? 0) ? 'none' : 'line-through' }}>{name}</span>)}
                    </div>}
                    {(p8.tetherEnemy !== null || p8.bossTether) && <div style={{ width: 160, height: 4, margin: '6px auto 0', background: 'rgba(0,0,0,.45)', borderRadius: 4 }}><div style={{ width: `${p8.tension * 100}%`, height: '100%', background: p8.tension > 0.68 ? '#fff1a8' : pal.thread, transition: 'width .08s linear' }} /></div>}
                </div>
            )}

            {bossCue && !won && <div style={{ position: 'absolute', top: 88, left: 12, right: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ minWidth: 'min(92vw,340px)', maxWidth: 520, padding: '8px 16px 9px', textAlign: 'center', color: bossCue.color, borderStyle: 'solid', borderColor: `${bossCue.color}88`, borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 4, borderRightWidth: 4, background: 'linear-gradient(90deg,rgba(8,4,9,.52),rgba(14,7,13,.9),rgba(8,4,9,.52))', boxShadow: `0 0 32px ${bossCue.soft},inset 0 0 22px ${bossCue.soft}`, clipPath: 'polygon(10px 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,10px 100%,0 50%)' }}>
                    <div style={{ font: '700 10px/1.1 monospace', letterSpacing: 2.2 }}>{bossCue.name}</div>
                    <div style={{ marginTop: 3, color: '#ead9d3', font: 'italic 12px/1.2 Georgia,serif' }}>{bossCue.action}</div>
                    <div style={{ marginTop: 4, color: '#fff9e8', font: '700 9px/1 monospace', letterSpacing: 1.5 }}>{bossCue.response}</div>
                </div>
            </div>}

            {/* A MORTE: você se desfez — a batalha recomeça do zero */}
            {deathKey > 0 && !won && (
                <div key={deathKey} onAnimationEnd={() => setDeathKey(0)} style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 50%, rgba(120,20,40,.5), rgba(4,2,6,.94) 70%)', animation: 'f8death 2.6s ease forwards' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#ff8fa0', font: '600 clamp(30px,8vw,56px)/1 Georgia,serif', textShadow: '0 0 22px #a01c38', animation: 'f8deathTxt 2.6s ease forwards' }}>VOCÊ SE DESFEZ</div>
                        <div style={{ marginTop: 12, color: '#d8a7ae', font: '11px monospace', letterSpacing: 3 }}>O FIO LEMBRA O CAMINHO · TENTATIVA {p8.deaths + 1}</div>
                    </div>
                </div>
            )}

            {p8.beatText && !won && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 148, padding: '0 28px', textAlign: 'center', pointerEvents: 'none' }}><span style={{ display: 'inline-block', maxWidth: 680, padding: '8px 14px', borderRadius: 3, background: 'linear-gradient(90deg,transparent,rgba(8,5,12,.58),transparent)', color: '#fff', font: 'italic 16px/1.5 Georgia,serif', textShadow: '0 2px 12px #000', animation: 'f8beatIn .45s ease' }}>{p8.beatText}</span></div>}

            {!won && (
                <>
                    <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 20px)', left: 16, display: 'flex', gap: 9 }}>
                        <button aria-label="Mover para esquerda" {...hold(() => { touchMove.current = -1; }, () => { touchMove.current = 0; })} style={btn}>◀</button>
                        <button aria-label="Mover para direita" {...hold(() => { touchMove.current = 1; }, () => { touchMove.current = 0; })} style={btn}>▶</button>
                    </div>
                    <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 18px)', right: 14, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <button aria-label="Usar fio" {...hold(() => { grappleRef.current = true; }, () => { grappleRef.current = false; })} style={{ ...btn, width: 68, height: 68, fontSize: 11, letterSpacing: 1.2, borderColor: pal.thread, color: '#ffd9df' }}>FIO</button>
                        <button aria-label="Usar agulha" onPointerDown={(e) => { e.preventDefault(); stitchRef.current = true; }} style={{ ...btn, width: 78, height: 78, fontSize: 10, lineHeight: 1.15, borderColor: '#d4ac5b', color: '#ffe5a2' }}>AGULHA</button>
                        <button aria-label="Pular" onPointerDown={(e) => { e.preventDefault(); jumpRef.current = true; }} style={{ ...btn, width: 68, height: 68, fontSize: 11 }}>PULAR</button>
                    </div>
                    <div style={{ position: 'absolute', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 104px)', color: 'rgba(255,255,255,.64)', font: '9px/1.45 monospace', textAlign: 'right', pointerEvents: 'none', maxWidth: 240 }}>
                        FIO fisga e tensiona · AGULHA desfaz nós e repara rasgos<br />sem alvo, AGULHA no ar cria um ponto temporário
                    </div>
                </>
            )}

            {won && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle,rgba(74,35,53,.76),rgba(5,3,8,.96))', animation: 'f8platwin 2s ease-out' }}>
                    <div style={{ textAlign: 'center', padding: 28 }}>
                        <div style={{ color: '#f4d9ce', font: '600 clamp(22px,5vw,38px)/1.2 Georgia,serif', letterSpacing: 4, textShadow: '0 0 28px #a13e58' }}>VOCÊ NÃO SE DERROTOU.</div>
                        <div style={{ color: '#e9b8bf', font: 'italic 18px/1.5 Georgia,serif', margin: '12px 0 7px' }}>Você se refez.</div>
                        <div style={{ color: '#bda9b4', font: '11px monospace', marginBottom: 26 }}>🧶 {p8.spools} pontas recuperadas</div>
                        <button onPointerDown={() => { f8Wake(); onDone?.(); }} style={{ ...btn, width: 'auto', height: 'auto', padding: '13px 34px', borderColor: '#dc8b9b', fontSize: 14, letterSpacing: 2 }}>ACORDAR</button>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes f8platwin{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:blur(0)}}
                @keyframes f8beatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
                @keyframes f8death{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}
                @keyframes f8deathTxt{0%{letter-spacing:2px;filter:blur(8px)}40%{letter-spacing:10px;filter:blur(0)}100%{letter-spacing:12px}}
                @keyframes f8photoHold{0%{opacity:0;transform:scale(1.04)}8%,70%{opacity:1;transform:scale(1)}82%,100%{opacity:0}}
                @keyframes f8bossName{from{filter:blur(0);transform:scale(1)}to{filter:blur(.45px);transform:scale(1.018)}}
                @keyframes f8blinkTop{0%,64%{transform:scaleY(0)}74%,82%{transform:scaleY(1)}100%{transform:scaleY(0)}}
                @keyframes f8blinkBot{0%,64%{transform:scaleY(0)}74%,82%{transform:scaleY(1)}100%{transform:scaleY(0)}}
                @media(max-width:520px){button{user-select:none;-webkit-user-select:none}.f8-help{display:none}}
            `}</style>
        </div>
    );
};

export default Floor8Platformer;
