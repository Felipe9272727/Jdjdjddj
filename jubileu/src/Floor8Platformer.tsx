/**
 * Floor 8 — cinco dioramas jogáveis de crochê.
 *
 * A cena usa arte pintada apenas como plano distante. Tudo que importa para a
 * leitura e para o jogo (herói, pontos, rasgos, inimigos e boss) é geometria
 * leve com silhueta própria. Sem post-processing pesado e sem sombras reais.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    p8, p8Subscribe, p8Reset, stepPlayer, curMem, activeThreadTarget, p8Objective, P8,
    type EnemyKind, type EnemyState, type Memory,
} from './f8Platformer';
import { f8, f8Subscribe, f8Wake } from './f8Arquivo';
import { f8BossCombatSfx, f8BossIntroSfx, f8MusicStart, f8MusicStop, f8Sting } from './f8Music';
import bgQuintal from './assets/f8/quintal.jpg';
import bgEscola from './assets/f8/escola.jpg';
import bgTempestade from './assets/f8/tempestade.jpg';
import bgHotel from './assets/f8/hotel.jpg';
import bgQuintalMid from './assets/f8/quintal-mid-v1.webp';
import bgQuintalNear from './assets/f8/quintal-near-v1.webp';
import bgEscolaMid from './assets/f8/escola-mid-v1.webp';
import bgEscolaNear from './assets/f8/escola-near-v1.webp';
import bgTempestadeMid from './assets/f8/tempestade-mid-v1.webp';
import bgTempestadeNear from './assets/f8/tempestade-near-v1.webp';
import bgHotelMid from './assets/f8/hotel-mid-v1.webp';
import bgHotelNear from './assets/f8/hotel-near-v1.webp';
import bgYourselfFar from './assets/f8/yourself-parallax-far-v3.webp';
import bgYourselfMid from './assets/f8/yourself-parallax-mid-v3.webp';
import bgYourselfNear from './assets/f8/yourself-parallax-near-v3.webp';
import bgYourselfMemories from './assets/f8/yourself-parallax-memories-v4.webp';
import bgYourselfMechanisms from './assets/f8/yourself-parallax-mechanisms-v4.webp';
import bossCombatAtlas from './assets/f8/yourself-boss-combat-atlas-v4.webp';
import bossReactAtlas from './assets/f8/yourself-boss-react-atlas-v4.webp';
import bossRevealAtlas from './assets/f8/yourself-boss-reveal-atlas-v6.webp';
import travelerWalkAtlas from './assets/f8/traveler-walk-atlas-v6.webp';
import travelerActionAtlas from './assets/f8/traveler-action-atlas-v6.webp';
import travelerAirStitchAtlas from './assets/f8/traveler-air-stitch-atlas-v7.png';
import airStitchPlatformAtlas from './assets/f8/air-stitch-platform-atlas-v8.png';
import yourselfArenaFloor from './assets/f8/yourself-arena-floor-v6.webp';
import crochetVfxAtlas from './assets/f8/crochet-vfx-atlas-v5.webp';
import bossAttackVfxAtlas from './assets/f8/yourself-attack-vfx-atlas-v7.png';
import floorQuintal from './assets/f8/floor-quintal-v2.webp';
import floorEscola from './assets/f8/floor-escola-v2.webp';
import floorTempestade from './assets/f8/floor-tempestade-v2.webp';
import floorHotel from './assets/f8/floor-hotel-v2.webp';
import floorYourself from './assets/f8/floor-yourself-v2.webp';
import enemyKnotlingAtlas from './assets/f8/enemy-knotling-atlas-v1.png';
import enemyIntrusiveAtlas from './assets/f8/enemy-intrusive-atlas-v1.png';
import enemyEchoAtlas from './assets/f8/enemy-echo-atlas-v1.png';

const BOSS_INTRO_DURATION = 4.85;
const BOSS_REVEAL_START = 0.62;
const BOSS_REVEAL_FRAME_TIMES = [
    0, 0.18, 0.38, 0.58, 0.8, 1, 1.18, 1.36, 1.62,
    1.86, 2.02, 2.2, 2.54, 2.86, 3.08, 3.34, 3.72,
] as const;
const BOSS_REVEAL_END = BOSS_REVEAL_START + BOSS_REVEAL_FRAME_TIMES[BOSS_REVEAL_FRAME_TIMES.length - 1];
const BOSS_ROAR_START = BOSS_REVEAL_START + BOSS_REVEAL_FRAME_TIMES[11];
const BOSS_ROAR_END = BOSS_REVEAL_START + BOSS_REVEAL_FRAME_TIMES[14];
const BOSS_MASK_SNAP = BOSS_REVEAL_START + BOSS_REVEAL_FRAME_TIMES[10];
// A simulação guarda y na sola do personagem. Os dois tipos de plataforma
// terminam visualmente em ~.08, então este é o único chão usado pelos sprites.
const ACTOR_GROUND_LIFT = 0.082;
interface BossIntroState {
    active: boolean;
    seen: boolean;
    startedAt: number;
}

const BG_URLS: Record<string, string | undefined> = {
    quintal: bgQuintal, escola: bgEscola, tempestade: bgTempestade, hotel: bgHotel,
    yourself: bgYourselfFar,
};
const FLOOR_URLS: Record<string, string> = {
    quintal: floorQuintal,
    escola: floorEscola,
    tempestade: floorTempestade,
    hotel: floorHotel,
    yourself: floorYourself,
};
const MEMORY_PARALLAX_URLS: Record<string, readonly [string, string, string]> = {
    quintal: [bgQuintal, bgQuintalMid, bgQuintalNear],
    escola: [bgEscola, bgEscolaMid, bgEscolaNear],
    tempestade: [bgTempestade, bgTempestadeMid, bgTempestadeNear],
    hotel: [bgHotel, bgHotelMid, bgHotelNear],
};
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

function floorTex(url: string): THREE.Texture {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.repeat.set(2.2, 1);
    return t;
}

interface Kit {
    wool: THREE.MeshStandardMaterial; woolTop: THREE.MeshStandardMaterial;
    floor: THREE.MeshStandardMaterial;
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
        wool: new THREE.MeshStandardMaterial({ map: knitTex(m.pal.wool, m.pal.woolHi, m.pal.woolLo), roughness: 1 }),
        woolTop: new THREE.MeshStandardMaterial({ color: m.pal.woolHi, roughness: 1, emissive: m.pal.woolHi, emissiveIntensity: 0.04 }),
        floor: new THREE.MeshStandardMaterial({
            map: floorTex(FLOOR_URLS[m.key]), roughness: 0.93, metalness: 0,
            color: '#ffffff', emissive: m.pal.woolHi, emissiveIntensity: m.key === 'yourself' ? 0.075 : 0.025,
        }),
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
    const floorMat = useMemo(() => {
        const mat = kit.floor.clone();
        if (kit.floor.map) {
            const map = kit.floor.map.clone();
            map.repeat.set(Math.max(1, w / 4.2), 1.08);
            map.offset.set(((cx * 0.071) % 1 + 1) % 1, 0.02);
            map.needsUpdate = true;
            mat.map = map;
        }
        return mat;
    }, [kit.floor, w, cx]);
    useEffect(() => () => { floorMat.map?.dispose(); floorMat.dispose(); }, [floorMat]);
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
            <mesh position={[0, 0.015, 0.03]} material={floorMat}><boxGeometry args={[Math.max(0.2, w - 0.12), 0.13, 1.38]} /></mesh>
            <mesh position={[0, 0, 0.7]} material={floorMat}><shapeGeometry args={[face, 2]} /></mesh>
            {/* Pontas soltas fazem a silhueta parecer tecido, não um bloco. */}
            {[-1, 1].map((side) => <group key={side} position={[side * (w / 2 - 0.2), -0.72, 0.71]}>
                <mesh rotation={[0, 0, side * 0.22]} material={kit.woolTop}><cylinderGeometry args={[0.035, 0.035, 0.42, 5]} /></mesh>
                <mesh position={[side * 0.07, -0.22, 0]} rotation={[Math.PI / 2, 0, side * 0.6]} material={kit.thread}><torusGeometry args={[0.12, 0.028, 5, 10, Math.PI * 1.25]} /></mesh>
            </group>)}
        </group>
    );
};

/**
 * A arena final continua usando a mesma superfície lógica da simulação, mas a
 * leitura visual é um tear inteiro, não uma barra de lã esticada. O sprite
 * concentra o detalhe caro num draw call e as poucas pontas em geometria dão
 * movimento sem fazer o chão (e a colisão) oscilar.
 */
const YourselfArenaFloor: React.FC<{
    l: { x0: number; x1: number; y: number };
    kit: Kit;
}> = ({ l, kit }) => {
    const mirrorGlow = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const w = l.x1 - l.x0, cx = (l.x0 + l.x1) * 0.5;
    const surfaceMat = useMemo(() => {
        const mat = kit.floor.clone();
        if (kit.floor.map) {
            const map = kit.floor.map.clone();
            map.repeat.set(Math.max(2, w / 6.2), 1);
            map.offset.set(0.11, 0.03); map.needsUpdate = true;
            mat.map = map;
        }
        return mat;
    }, [kit.floor, w]);
    const texture = useMemo(() => {
        const t = new THREE.TextureLoader().load(yourselfArenaFloor);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        return t;
    }, []);
    useEffect(() => () => {
        texture.dispose(); surfaceMat.map?.dispose(); surfaceMat.dispose();
    }, [texture, surfaceMat]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (mirrorGlow.current) {
            const s = 1 + Math.sin(t * 1.18) * 0.045;
            mirrorGlow.current.scale.set(s * 3.4, s * 2.45, 1);
            mirrorGlow.current.material.opacity = 0.34 + Math.sin(t * 1.18) * 0.055;
        }
    });
    return (
        <group position={[cx, l.y, 0]} name="YOURSELF-loom-arena">
            <mesh ref={mirrorGlow} position={[0, -1.68, 0.08]} material={kit.glow}><planeGeometry args={[1, 1]} /></mesh>
            <mesh position={[0, -3.01, 0.32]} renderOrder={2}>
                <planeGeometry args={[w + 0.25, 6.2]} />
                <meshBasicMaterial map={texture} transparent alphaTest={0.025} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* A faixa jogável recebe uma tapeçaria própria: rachaduras de
                espelho, nós tensos e fios de ouro ancoram os pés no cenário. */}
            <mesh position={[0, -0.54, 0.37]} material={surfaceMat} renderOrder={3}>
                <planeGeometry args={[w - 0.18, 1.18]} />
            </mesh>
            {/* A colisão fica marcada por uma única borda reta; todo o detalhe
                pesado do tear vive abaixo dela e não compete com os pés. */}
            <mesh position={[0, -0.055, 0.12]} material={kit.bossDark}><boxGeometry args={[w - 0.14, 0.15, 0.78]} /></mesh>
            <mesh position={[0, 0.038, 0.19]} rotation={[0, 0, Math.PI / 2]} material={kit.thread}><cylinderGeometry args={[0.038, 0.038, w - 0.22, 7]} /></mesh>
            <mesh position={[0, -0.015, 0.23]} rotation={[0, 0, Math.PI / 2]} material={kit.metal}><cylinderGeometry args={[0.012, 0.012, w - 0.38, 6]} /></mesh>
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

interface AtlasBlendPose { frame: number; next: number; mix: number }

function lateAtlasRowPose(base: number, progress: number, loop = false): AtlasBlendPose {
    const x = loop
        ? ((progress % 1) + 1) % 1 * 4
        : THREE.MathUtils.clamp(progress, 0, 0.9999) * 4;
    const localFrame = Math.min(3, Math.floor(x));
    const local = x - localFrame;
    return {
        frame: base + localFrame,
        next: base + (loop ? (localFrame + 1) % 4 : Math.min(3, localFrame + 1)),
        mix: THREE.MathUtils.smoothstep(local, 0.7, 0.98),
    };
}

function airPatchVisualPose(age: number, remaining: number): AtlasBlendPose {
    if (remaining < 0.42) {
        const idle = [6, 4, 5][Math.floor(Math.max(0, age - 0.56) * 2.15) % 3];
        const fade = 1 - THREE.MathUtils.clamp(remaining / 0.42, 0, 1);
        return { frame: idle, next: 7, mix: THREE.MathUtils.smoothstep(fade, 0.08, 0.92) };
    }
    if (age < 0.56) {
        const x = THREE.MathUtils.clamp(age / 0.08, 0, 6.999);
        const frame = Math.min(6, Math.floor(x)), local = x - frame;
        return {
            frame,
            next: Math.min(6, frame + 1),
            mix: THREE.MathUtils.smoothstep(local, 0.7, 0.98),
        };
    }
    const x = Math.max(0, age - 0.56) * 2.15;
    const order = [6, 4, 5], i = Math.floor(x) % order.length, local = x - Math.floor(x);
    return { frame: order[i], next: order[(i + 1) % order.length], mix: THREE.MathUtils.smoothstep(local, 0.74, 0.98) };
}

const PatchActor: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    const primary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const secondary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const maps = useMemo(() => [
        atlasTexture(airStitchPlatformAtlas, 4, 2),
        atlasTexture(airStitchPlatformAtlas, 4, 2),
    ] as const, []);
    const lastFrames = useRef([-1, -1]);
    useEffect(() => () => maps.forEach((map) => map.dispose()), [maps]);
    useFrame(({ clock }) => {
        if (!g.current || !primary.current || !secondary.current) return;
        const patch = p8.patch; g.current.visible = !!patch;
        if (patch) {
            const age = Math.max(0, p8.t - patch.born);
            const pose = airPatchVisualPose(age, patch.t);
            if (lastFrames.current[0] !== pose.frame) {
                lastFrames.current[0] = pose.frame; setAtlasFrame(maps[0], pose.frame, 4, 2);
            }
            if (lastFrames.current[1] !== pose.next) {
                lastFrames.current[1] = pose.next; setAtlasFrame(maps[1], pose.next, 4, 2);
            }
            const fading = THREE.MathUtils.smoothstep(patch.t, 0.035, 0.18);
            primary.current.material.opacity = fading * (1 - pose.mix);
            secondary.current.material.opacity = fading * pose.mix;
            secondary.current.visible = pose.next !== pose.frame && pose.mix > 0.002;
            g.current.position.set(patch.x, patch.y - 0.5, 0.66);
            const breathe = 1 + Math.sin(clock.elapsedTime * 3.4) * 0.006;
            g.current.scale.set(breathe, breathe, 1);
            g.current.rotation.z = Math.sin(age * 7) * 0.006 * Math.max(0, 1 - age / 0.56);
        }
    });
    return (
        <group ref={g} visible={false} name="air-stitch-image-sprite">
            <mesh ref={primary} renderOrder={8}>
                <planeGeometry args={[3.55, 3.55]} />
                <meshBasicMaterial map={maps[0]} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={secondary} visible={false} position={[0, 0, 0.008]} renderOrder={9}>
                <planeGeometry args={[3.55, 3.55]} />
                <meshBasicMaterial map={maps[1]} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
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

const PLAYER_PLANE = 2.88;
const PLAYER_BASELINE = 235 / 256;
const WALK_FRAMES = 8;

function atlasTexture(url: string, cols: number, rows: number): THREE.Texture {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.repeat.set(1 / cols - 0.002, 1 / rows - 0.002);
    return t;
}

function setAtlasFrame(t: THREE.Texture, frame: number, cols: number, rows: number): void {
    const col = frame % cols, row = Math.floor(frame / cols);
    t.offset.set(col / cols + 0.001, 1 - (row + 1) / rows + 0.001);
}

/**
 * Dois atlases com funções separadas: oito passos simétricos e doze poses de
 * transição/ação. Cada frame é ancorado pela linha real dos pés; assim a margem
 * interna gerada pela arte nunca vira um falso mancar ou um salto de corpo.
 */
const CrochetPlayerSprite: React.FC<{
    kit: Kit;
    bossIntroRef: React.MutableRefObject<BossIntroState>;
}> = ({ kit, bossIntroRef }) => {
    const root = useRef<THREE.Group>(null!);
    const sprite = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const lastVisual = useRef('');
    const wasGrounded = useRef(p8.onGround);
    const landingT = useRef(0);
    const walkAtlas = useMemo(() => atlasTexture(travelerWalkAtlas, 4, 2), []);
    const actionAtlas = useMemo(() => atlasTexture(travelerActionAtlas, 4, 3), []);
    const airStitchAtlas = useMemo(() => atlasTexture(travelerAirStitchAtlas, 4, 2), []);
    useEffect(() => () => {
        walkAtlas.dispose(); actionAtlas.dispose(); airStitchAtlas.dispose();
    }, [walkAtlas, actionAtlas, airStitchAtlas]);

    const showFrame = (map: THREE.Texture, frame: number, rows: number, key: string) => {
        const visual = `${key}:${frame}`;
        if (visual === lastVisual.current) return;
        lastVisual.current = visual;
        const col = frame % 4, row = Math.floor(frame / 4);
        map.offset.set(col * 0.25 + 0.001, 1 - (row + 1) / rows + 0.001);
        map.needsUpdate = true;
        if (sprite.current) {
            sprite.current.material.map = map;
            sprite.current.material.needsUpdate = true;
        }
    };

    useFrame(({ clock }, rawDt) => {
        const g = root.current; if (!g) return;
        const dt = Math.min(rawDt, 0.05);
        const cinematic = bossIntroRef.current;
        const target = activeThreadTarget();
        const moving = p8.onGround && Math.abs(p8.vx) > 0.42;
        const patchAge = p8.patch ? p8.t - p8.patch.born : Infinity;
        const weavingAir = patchAge >= 0 && patchAge < 0.56;
        if (!wasGrounded.current && p8.onGround) landingT.current = 0.17;
        wasGrounded.current = p8.onGround;
        landingT.current = Math.max(0, landingT.current - dt);

        let frame = Math.floor(clock.elapsedTime * 1.55) % 2;
        let map = actionAtlas, rows = 3, key = 'action';
        const baseline = PLAYER_BASELINE;
        let stridePhase = 0;
        if (cinematic.active) {
            const e = Math.max(0, performance.now() / 1000 - cinematic.startedAt);
            frame = e < 0.38 ? 1 : e < 0.82 ? 2 : 3;
        } else if (weavingAir) {
            map = airStitchAtlas; rows = 2; key = 'air-stitch';
            frame = Math.min(7, Math.floor(patchAge / 0.07));
        } else if (p8.stitchT > 0.02) {
            const progress = THREE.MathUtils.clamp(1 - p8.stitchT / 0.26, 0, 0.999);
            frame = 8 + Math.floor(progress * 4);
        } else if (target) {
            frame = p8.tension > 0.48 ? 2 : 1;
        } else if (!p8.onGround) {
            frame = p8.vy > 3.2 ? 4 : p8.vy > 0.55 ? 5 : p8.vy > -2.5 ? 6 : 7;
        } else if (landingT.current > 0) {
            frame = landingT.current > 0.085 ? 11 : 0;
        } else if (moving) {
            const visualClock = p8.runPhase * 1.25;
            frame = Math.floor(visualClock) % WALK_FRAMES;
            stridePhase = (visualClock % WALK_FRAMES) / WALK_FRAMES;
            map = walkAtlas; rows = 2; key = 'walk';
        }
        showFrame(map, frame, rows, key);

        // A raiz está no chão. Mover o plano pelo baseline faz a sola continuar
        // imóvel mesmo durante o squash procedural e ao alternar os atlas.
        const localFoot = PLAYER_PLANE * 0.5 - baseline * PLAYER_PLANE;
        if (sprite.current) sprite.current.position.y = -localFoot;
        const contactWave = moving ? Math.cos(stridePhase * Math.PI * 4) : 0;
        const stretchY = moving ? 1 - contactWave * 0.012 : 1;
        const stretchX = moving ? 1 + contactWave * 0.006 : 1;
        g.position.set(p8.x, p8.y + ACTOR_GROUND_LIFT, 0.58);
        g.scale.set((p8.facing < 0 ? -1 : 1) * stretchX, stretchY, 1);
        const aimTilt = target ? Math.atan2(target.y - (p8.y + 1), target.x - p8.x) * 0.055 : 0;
        const breathing = cinematic.active ? 0 : Math.sin(clock.elapsedTime * 2.15) * 0.008;
        const strideLean = moving ? Math.sin(stridePhase * Math.PI * 4) * 0.006 : 0;
        g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, aimTilt + breathing + strideLean, 0.22);
        g.visible = Math.floor(p8.invuln * 14) % 2 === 0;
        if (sprite.current) sprite.current.material.opacity = cinematic.active ? 1 : 0.985;
    });

    return (
        <group ref={root} name="traveler-image-sprite">
            <mesh position={[0, 0.012, -0.04]} scale={[1.1, 0.2, 1]} material={kit.glow}><planeGeometry args={[1.4, 1]} /></mesh>
            <mesh ref={sprite} renderOrder={6}>
                <planeGeometry args={[PLAYER_PLANE, PLAYER_PLANE]} />
                <meshBasicMaterial map={actionAtlas} transparent alphaTest={0.035} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};

/** Um único sprite reaproveitado para pouso e impacto da agulha. */
const PlayerTransitionFX: React.FC = () => {
    const root = useRef<THREE.Group>(null!);
    const sprite = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const lastFrame = useRef(-1);
    const wasGrounded = useRef(p8.onGround);
    const previousStitch = useRef(p8.stitchT);
    const active = useRef<{ kind: 'land' | 'stitch'; start: number; x: number; y: number; facing: number } | null>(null);
    const atlas = useMemo(() => atlasTexture(crochetVfxAtlas, 4, 2), []);
    useEffect(() => () => atlas.dispose(), [atlas]);
    useFrame(({ clock }) => {
        const now = clock.elapsedTime;
        if (previousStitch.current <= 0.02 && p8.stitchT > 0.2) {
            const patchAge = p8.patch ? p8.t - p8.patch.born : Infinity;
            // O novo atlas mostra corpo, agulha, fio e ponto nascendo. Não
            // empilhe o antigo impacto por cima ou o player aparece duplicado.
            if (patchAge > 0.1) active.current = { kind: 'stitch', start: now, x: p8.x + p8.facing * 1.25, y: p8.y + 1.15, facing: p8.facing };
        } else if (!wasGrounded.current && p8.onGround && Math.abs(p8.vy) < 0.1) {
            active.current = { kind: 'land', start: now, x: p8.x, y: p8.y + 0.12, facing: p8.facing };
        }
        previousStitch.current = p8.stitchT; wasGrounded.current = p8.onGround;
        const fx = active.current, g = root.current;
        if (!fx || !g) { if (g) g.visible = false; return; }
        const age = now - fx.start, frameInStrip = Math.floor(age / 0.075);
        if (frameInStrip > 3) { g.visible = false; active.current = null; return; }
        const frame = (fx.kind === 'stitch' ? 4 : 0) + frameInStrip;
        if (frame !== lastFrame.current) {
            lastFrame.current = frame;
            const col = frame % 4, row = Math.floor(frame / 4);
            atlas.offset.set(col * 0.25 + 0.001, 1 - (row + 1) * 0.5 + 0.001);
            atlas.needsUpdate = true;
        }
        g.visible = true; g.position.set(fx.x, fx.y, 0.72);
        const s = fx.kind === 'stitch' ? 1.75 : 1.32;
        g.scale.set(fx.facing * s, s, 1);
        if (sprite.current) sprite.current.material.opacity = Math.min(1, (0.31 - age) * 7.5);
    });
    return <group ref={root} visible={false} name="traveler-transition-vfx">
        <mesh ref={sprite} renderOrder={8}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={atlas} transparent alphaTest={0.025} depthWrite={false} toneMapped={false} />
        </mesh>
    </group>;
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

const ENEMY_ATLAS_URL: Record<EnemyKind, string> = {
    knotling: enemyKnotlingAtlas,
    intrusive: enemyIntrusiveAtlas,
    echo: enemyEchoAtlas,
};
const ENEMY_PLANE: Record<EnemyKind, number> = { knotling: 2.62, intrusive: 2.5, echo: 3.42 };
const ENEMY_BASELINE = 244 / 256;
interface EnemyVisualPose { frame: number; next: number; mix: number }

function enemyStrip(base: number, x: number, loop = true): EnemyVisualPose {
    const safe = Math.max(0, x), whole = Math.floor(safe), local = safe - whole;
    const idx = loop ? whole % 4 : Math.min(3, whole);
    const next = loop ? (idx + 1) % 4 : Math.min(3, idx + 1);
    return { frame: base + idx, next: base + next, mix: THREE.MathUtils.smoothstep(local, 0.7, 0.98) };
}

function enemyShortStrip(base: number, count: number, x: number, loop: boolean): EnemyVisualPose {
    const safe = Math.max(0, x), whole = Math.floor(safe), local = safe - whole;
    const idx = loop ? whole % count : Math.min(count - 1, whole);
    const next = loop ? (idx + 1) % count : Math.min(count - 1, idx + 1);
    return { frame: base + idx, next: base + next, mix: THREE.MathUtils.smoothstep(local, 0.7, 0.98) };
}

function enemyPose(kind: EnemyKind, enemy: EnemyState, now: number): EnemyVisualPose {
    if (enemy.dead) return enemyStrip(12, Math.min(3.999, enemy.deadT / 0.19), false);
    if (enemy.tethered) return enemyShortStrip(9, 3, Math.min(2.999, p8.tension * 3), false);
    if (enemy.stunned > 0.02) return enemyShortStrip(10, 2, now * 6.4, true);
    const distance = Math.abs(enemy.x - p8.x);
    if (kind === 'intrusive' && enemy.attackT <= 0) return enemyStrip(4, Math.min(3.999, (-enemy.attackT / 0.65) * 4), false);
    if (kind === 'echo' && distance < 4.4) return enemyStrip(4, now * 4.8 + enemy.aiT * 0.35, true);
    if (kind === 'knotling' && distance < 3.1) return enemyStrip(4, now * 5.3 + enemy.aiT * 0.25, true);
    return enemyStrip(0, enemy.aiT * (kind === 'intrusive' ? 4.6 : kind === 'echo' ? 3.25 : 4.1), true);
}

/**
 * Cada criatura usa uma prancha 4x4 própria. A troca de pose acontece só nos
 * últimos 30% do quadro e os dois planos cruzam opacidade por poucos frames:
 * conserva o desenho do Image, mas dá o mesmo fluxo que tornou o boss limpo.
 */
const EnemyActor: React.FC<{ i: number; kind: EnemyKind; kit: Kit }> = ({ i, kind, kit }) => {
    const root = useRef<THREE.Group>(null!);
    const primary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const secondary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const lastPrimary = useRef(-1), lastSecondary = useRef(-1);
    const atlasPair = useMemo(() => [atlasTexture(ENEMY_ATLAS_URL[kind], 4, 4), atlasTexture(ENEMY_ATLAS_URL[kind], 4, 4)] as const, [kind]);
    useEffect(() => () => atlasPair.forEach((t) => t.dispose()), [atlasPair]);
    const plane = ENEMY_PLANE[kind];
    const spriteY = kind === 'intrusive' ? 0 : -(plane * 0.5 - ENEMY_BASELINE * plane);

    const setFrame = (map: THREE.Texture, frame: number, last: React.MutableRefObject<number>) => {
        if (last.current === frame) return;
        last.current = frame;
        const col = frame % 4, row = Math.floor(frame / 4);
        map.offset.set(col * 0.25 + 0.001, 1 - (row + 1) * 0.25 + 0.001);
        map.needsUpdate = true;
    };

    useFrame(({ clock }) => {
        const e = p8.enemies[i], g = root.current;
        if (!e || !g || !primary.current || !secondary.current) { if (g) g.visible = false; return; }
        if (e.dead && e.deadT > 0.92) { g.visible = false; return; }
        g.visible = true;
        const pose = enemyPose(kind, e, clock.elapsedTime);
        setFrame(atlasPair[0], pose.frame, lastPrimary);
        setFrame(atlasPair[1], pose.next, lastSecondary);
        const fade = e.dead ? THREE.MathUtils.clamp((0.92 - e.deadT) / 0.2, 0, 1) : 1;
        const blending = pose.next !== pose.frame && pose.mix > 0.002;
        primary.current.material.opacity = fade * (blending ? 1 - pose.mix : 1);
        secondary.current.visible = blending;
        secondary.current.material.opacity = fade * (blending ? pose.mix : 0);

        const attacking = (kind === 'intrusive' && e.attackT <= 0)
            || (kind !== 'intrusive' && Math.abs(e.x - p8.x) < (kind === 'echo' ? 4.4 : 3.1));
        const tetherPulse = e.tethered ? 1 + Math.sin(clock.elapsedTime * 13) * 0.045 : 1;
        const anticipation = attacking ? Math.sin(Math.min(1, kind === 'intrusive' ? Math.max(0, -e.attackT / 0.65) : 0.6) * Math.PI) : 0;
        const squashY = tetherPulse * (1 - anticipation * 0.045);
        const squashX = tetherPulse * (1 + anticipation * 0.035);
        g.position.set(e.x, e.y + (kind === 'intrusive' ? 0 : ACTOR_GROUND_LIFT), 0.46);
        g.scale.set((e.dir < 0 ? -1 : 1) * squashX, squashY, 1);
        g.rotation.z = kind === 'intrusive'
            ? Math.sin(e.aiT * 2.15) * 0.075 + (attacking ? e.dir * -0.12 : 0)
            : e.stunned > 0 ? Math.sin(clock.elapsedTime * 25) * 0.035 : e.dir * anticipation * -0.025;
    });

    const seams = p8.enemies[i]?.maxSeams ?? 1;
    const seamY = kind === 'intrusive' ? plane * 0.43 : plane * 0.96;
    return <group ref={root} name={`enemy-${kind}-image-sprite`} visible={false}>
        {kind !== 'intrusive' && <mesh position={[0, 0.08, -0.08]} scale={[kind === 'echo' ? 1.45 : 1.1, 0.2, 1]} renderOrder={4}>
            <circleGeometry args={[0.62, 24]} />
            <meshBasicMaterial color="#09070d" transparent opacity={0.34} depthWrite={false} toneMapped={false} />
        </mesh>}
        <mesh ref={primary} position={[0, spriteY, 0]} renderOrder={6}>
            <planeGeometry args={[plane, plane]} />
            <meshBasicMaterial map={atlasPair[0]} transparent alphaTest={0.012} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={secondary} position={[0, spriteY, 0.012]} renderOrder={7} visible={false}>
            <planeGeometry args={[plane, plane]} />
            <meshBasicMaterial map={atlasPair[1]} transparent alphaTest={0.012} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <group position={[0, seamY, 0.08]}>
            {Array.from({ length: seams }, (_, n) => <mesh key={n} position={[(n - (seams - 1) / 2) * 0.24, 0, 0]} material={(p8.enemies[i]?.seams ?? 0) > n ? kit.thread : kit.knotDark} renderOrder={8}>
                <torusGeometry args={[0.075, 0.021, 5, 10]} />
            </mesh>)}
        </group>
    </group>;
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

// Os três atlas foram recompostos em células 314x314 com uma linha de sola
// única. A textura muda de pose, mas a raiz do ator nunca abandona o chão.
const BOSS_BASELINE = 302 / 314;
const BOSS_PLANE = 6;
type BossAtlasKind = 'reveal' | 'combat' | 'react';
interface BossVisualPose { kind: BossAtlasKind; frame: number; next: number; mix: number }

function revealVisualPose(elapsed: number): BossVisualPose {
    const t = Math.max(0, elapsed - BOSS_REVEAL_START);
    for (let i = 0; i < BOSS_REVEAL_FRAME_TIMES.length - 1; i++) {
        const a = BOSS_REVEAL_FRAME_TIMES[i], b = BOSS_REVEAL_FRAME_TIMES[i + 1];
        if (t < b) {
            const local = THREE.MathUtils.clamp((t - a) / Math.max(0.001, b - a), 0, 1);
            return { kind: 'reveal', frame: i, next: Math.min(15, i + 1), mix: THREE.MathUtils.smoothstep(local, 0.68, 0.98) };
        }
    }
    return { kind: 'reveal', frame: 15, next: 15, mix: 0 };
}

function rowVisualPose(kind: Exclude<BossAtlasKind, 'reveal'>, base: number, progress: number): BossVisualPose {
    const x = THREE.MathUtils.clamp(progress, 0, 0.9999) * 4;
    const localFrame = Math.min(3, Math.floor(x)), local = x - localFrame;
    return {
        kind, frame: base + localFrame, next: base + Math.min(3, localFrame + 1),
        mix: THREE.MathUtils.smoothstep(local, 0.7, 0.98),
    };
}

function loopVisualPose(t: number): BossVisualPose {
    const x = (t * 3.25) % 4, frame = Math.floor(x), local = x - frame;
    return { kind: 'combat', frame, next: (frame + 1) % 4, mix: THREE.MathUtils.smoothstep(local, 0.72, 0.98) };
}

/**
 * YOURSELF usa três atlas 4x4: manifestação, golpes e reações. O código escolhe
 * poses-chave com duração desigual, cruza apenas o fim de cada pose e acrescenta
 * squash/overshoot muito leve. Assim a arte continua nítida, mas deixa de parecer
 * uma apresentação de slides.
 */
const BossSpriteActor: React.FC<{
    kit: Kit;
    bossIntroRef: React.MutableRefObject<BossIntroState>;
}> = ({ kit, bossIntroRef }) => {
    const root = useRef<THREE.Group>(null!);
    const sprite = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const spriteBlend = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const halo = useRef<THREE.Group>(null!);
    const bossGlow = useRef<THREE.Mesh>(null!);
    const lastPrimary = useRef('');
    const lastSecondary = useRef('');
    const phaseClock = useRef({ key: '', startedAt: 0 });
    const combatAtlas = useMemo(() => atlasTexture(bossCombatAtlas, 4, 4), []);
    const combatAtlasNext = useMemo(() => atlasTexture(bossCombatAtlas, 4, 4), []);
    const reactAtlas = useMemo(() => atlasTexture(bossReactAtlas, 4, 4), []);
    const reactAtlasNext = useMemo(() => atlasTexture(bossReactAtlas, 4, 4), []);
    const revealAtlas = useMemo(() => atlasTexture(bossRevealAtlas, 4, 4), []);
    const revealAtlasNext = useMemo(() => atlasTexture(bossRevealAtlas, 4, 4), []);
    useEffect(() => () => {
        combatAtlas.dispose(); combatAtlasNext.dispose(); reactAtlas.dispose(); reactAtlasNext.dispose();
        revealAtlas.dispose(); revealAtlasNext.dispose();
    }, [combatAtlas, combatAtlasNext, reactAtlas, reactAtlasNext, revealAtlas, revealAtlasNext]);

    const showFrame = (
        target: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
        map: THREE.Texture, frame: number, rows: number, key: string,
        cache: React.MutableRefObject<string>,
    ) => {
        const visual = `${key}:${frame}`;
        if (visual === cache.current) return;
        cache.current = visual;
        const col = frame % 4, row = Math.floor(frame / 4);
        map.offset.set(col * 0.25 + 0.001, 1 - (row + 1) / rows + 0.001);
        map.needsUpdate = true;
        target.material.map = map; target.material.needsUpdate = true;
    };

    useFrame(({ clock }) => {
        const b = p8.boss, g = root.current, primary = sprite.current, secondary = spriteBlend.current;
        if (!b || !g || !primary || !secondary) { if (g) g.visible = false; return; }
        const cinematic = bossIntroRef.current;
        g.visible = b.phase !== 'dormant' || cinematic.active;
        if (!g.visible) return;

        const t = clock.elapsedTime, attack = b.phase === 'attack' ? b.attack : null;
        const introElapsed = cinematic.active ? Math.max(0, performance.now() / 1000 - cinematic.startedAt) : 0;
        const phaseKey = `${b.phase}:${b.attack ?? 'none'}:${b.slamN}:${b.sweepN}`;
        if (phaseClock.current.key !== phaseKey) phaseClock.current = { key: phaseKey, startedAt: t };
        const phaseAge = t - phaseClock.current.startedAt;
        let pose: BossVisualPose;
        if (cinematic.active) {
            pose = revealVisualPose(introElapsed);
        } else if (b.hurtT > 0.02) {
            pose = rowVisualPose('react', 4, 1 - b.hurtT / 0.6);
        } else if (b.phase === 'bound') {
            pose = rowVisualPose('react', 12, Math.min(0.999, phaseAge / 0.82));
        } else if (b.phase === 'exposed') {
            pose = rowVisualPose('react', 8, Math.min(0.999, phaseAge / 0.78));
        } else if (attack === 'cocoon' || b.shield) {
            pose = rowVisualPose('react', 0, Math.min(0.999, b.atkT / 0.82));
        } else if (attack === 'slam') {
            const tele = b.seams <= 1 ? 0.55 : 0.9;
            const p = b.atkT < tele
                ? (b.atkT / tele) * 0.49
                : 0.5 + THREE.MathUtils.clamp((b.atkT - tele) / 0.34, 0, 1) * 0.499;
            pose = rowVisualPose('combat', 4, p);
        } else if (attack === 'sweep') {
            const p = b.atkT < 0.7
                ? (b.atkT / 0.7) * 0.49
                : 0.5 + THREE.MathUtils.clamp((b.atkT - 0.7) / 0.32, 0, 1) * 0.499;
            pose = rowVisualPose('combat', 8, p);
        } else if (attack === 'throw') {
            const gap = b.seams <= 1 ? 0.6 : 0.8;
            pose = rowVisualPose('combat', 12, (b.atkT % gap) / gap);
        } else {
            pose = loopVisualPose(t);
        }

        const atlasPair = pose.kind === 'reveal' ? [revealAtlas, revealAtlasNext]
            : pose.kind === 'react' ? [reactAtlas, reactAtlasNext]
                : [combatAtlas, combatAtlasNext];
        showFrame(primary, atlasPair[0], pose.frame, 4, `${pose.kind}-a`, lastPrimary);
        showFrame(secondary, atlasPair[1], pose.next, 4, `${pose.kind}-b`, lastSecondary);
        const localFoot = BOSS_PLANE * 0.5 - BOSS_BASELINE * BOSS_PLANE;
        primary.position.y = secondary.position.y = -localFoot;
        const blending = pose.next !== pose.frame && pose.mix > 0.002;
        const hurtOpacity = b.hurtT > 0 && Math.sin(t * 28) > 0.2 ? 0.62 : 1;
        primary.material.opacity = hurtOpacity * (blending ? 1 - pose.mix : 1);
        secondary.material.opacity = hurtOpacity * pose.mix;
        secondary.visible = blending;

        // A raiz é a sola do boss. Cada plano se desloca pelo próprio baseline,
        // portanto nem as poses ajoelhadas nem a massa inicial podem flutuar.
        g.position.set(b.x, b.y + ACTOR_GROUND_LIFT, 0.48);
        const roarIn = THREE.MathUtils.smoothstep(introElapsed, BOSS_ROAR_START, BOSS_ROAR_START + 0.12);
        const roarOut = 1 - THREE.MathUtils.smoothstep(introElapsed, BOSS_ROAR_END - 0.18, BOSS_ROAR_END);
        const roar = cinematic.active ? roarIn * roarOut : 0;
        const attackPulse = attack && !cinematic.active ? 1 + Math.sin(t * 13) * 0.012 : 1;
        const hurtPulse = b.hurtT > 0 ? 1 - Math.sin(b.hurtT * 30) * 0.055 : 1;
        const panic = b.seams <= 1 ? 1 + Math.sin(t * 31) * 0.012 : 1;
        const telegraph = attack === 'slam' || attack === 'sweep'
            ? Math.sin(THREE.MathUtils.clamp(b.atkT / (attack === 'slam' ? (b.seams <= 1 ? 0.55 : 0.9) : 0.7), 0, 1) * Math.PI)
            : 0;
        const sx = attackPulse * hurtPulse * panic * (1 + roar * 0.035 + telegraph * 0.018);
        const sy = attackPulse * hurtPulse * (1 + roar * 0.065 - telegraph * 0.024);
        g.scale.set(sx, sy, 1);
        g.rotation.z = cinematic.active ? Math.sin(introElapsed * 31) * roar * 0.012
            : b.phase === 'bound' ? Math.sin(t * 19) * 0.035 : Math.sin(t * 1.1) * 0.004;
        if (halo.current) {
            halo.current.visible = !cinematic.active || introElapsed > BOSS_ROAR_END;
            halo.current.rotation.z = t * (b.seams <= 1 ? -0.32 : 0.11);
            halo.current.scale.setScalar(1 + Math.sin(t * 2.25) * 0.035);
        }
        if (bossGlow.current) {
            bossGlow.current.visible = !cinematic.active || introElapsed > BOSS_REVEAL_START + 1.05;
            (bossGlow.current.material as THREE.MeshBasicMaterial).opacity = 0.38 + roar * 0.34;
        }
    });

    return (
        <group ref={root} visible={false} name="YOURSELF-sprite">
            <mesh ref={bossGlow} position={[0, 2.82, -0.08]} scale={[4.9, 5.9, 1]} material={kit.glow}><planeGeometry args={[1, 1]} /></mesh>
            <mesh ref={sprite} renderOrder={4}>
                <planeGeometry args={[BOSS_PLANE, BOSS_PLANE]} />
                <meshBasicMaterial map={combatAtlas} transparent alphaTest={0.025} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={spriteBlend} visible={false} position={[0, 0, 0.008]} renderOrder={5}>
                <planeGeometry args={[BOSS_PLANE, BOSS_PLANE]} />
                <meshBasicMaterial map={revealAtlasNext} transparent alphaTest={0.035} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {/* cinco nós legíveis continuam sendo a vida diegética, não uma barra genérica */}
            <group ref={halo} position={[0, 2.97, -0.02]}>
                <mesh material={kit.bossDark}><torusGeometry args={[2.46, 0.025, 5, 48]} /></mesh>
                {Array.from({ length: 5 }, (_, i) => {
                    const a = -Math.PI * 0.82 + i * (Math.PI * 0.41), alive = (p8.boss?.seams ?? 0) > i;
                    return <group key={i} position={[Math.sin(a) * 2.46, Math.cos(a) * 2.46, 0.04]}>
                        <mesh material={alive ? kit.core : kit.knotDark}><torusKnotGeometry args={[0.13, 0.04, 18, 4, 2, 3]} /></mesh>
                        {alive && <mesh material={kit.glow} scale={0.72}><planeGeometry args={[1, 1]} /></mesh>}
                    </group>;
                })}
            </group>
        </group>
    );
};

/**
 * Os quatro golpes vivem somente no atlas pintado. Dois planos cruzam apenas
 * no fim de cada pose, como no corpo do boss; colisões continuam exatas no
 * motor, mas nenhum anel, caixa, cilindro ou casulo procedural cobre a arte.
 */
const BossFX: React.FC<{ kit: Kit }> = ({ kit }) => {
    const attackRoot = useRef<THREE.Group>(null!);
    const attackPrimary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const attackSecondary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const projs = useRef<THREE.Group[]>([]);
    const projPrimary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]>([]);
    const projSecondary = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]>([]);
    const hearts = useRef<THREE.Group[]>([]);
    const attackAtlas = useMemo(() => atlasTexture(bossAttackVfxAtlas, 4, 4), []);
    const attackAtlasNext = useMemo(() => { const t = attackAtlas.clone(); t.needsUpdate = true; return t; }, [attackAtlas]);
    const projectileAtlases = useMemo(() => Array.from({ length: 6 }, () => {
        const a = attackAtlas.clone(), b = attackAtlas.clone();
        a.needsUpdate = true; b.needsUpdate = true;
        return [a, b] as const;
    }), [attackAtlas]);
    const attackLastFrames = useRef([-1, -1]);
    const projectileLastFrames = useRef(Array.from({ length: 6 }, () => [-1, -1]));
    useEffect(() => () => {
        attackAtlas.dispose(); attackAtlasNext.dispose();
        projectileAtlases.forEach((pair) => pair.forEach((t) => t.dispose()));
    }, [attackAtlas, attackAtlasNext, projectileAtlases]);
    useFrame(({ clock }) => {
        const b = p8.boss, t = clock.elapsedTime;
        const medo = (b?.seams ?? 5) <= 1;
        const attackA = attackPrimary.current, attackB = attackSecondary.current;
        if (attackRoot.current && attackA && attackB) {
            const root = attackRoot.current;
            let visible = !!b && b.phase === 'attack' && !!b.attack;
            let pose: AtlasBlendPose = { frame: 0, next: 0, mix: 0 };
            if (visible && b) {
                if (b.attack === 'slam') {
                    const tele = medo ? 0.55 : 0.9;
                    const progress = b.atkT < tele
                        ? (b.atkT / tele) * 0.49
                        : 0.5 + THREE.MathUtils.clamp((b.atkT - tele) / 0.34, 0, 1) * 0.499;
                    pose = lateAtlasRowPose(0, progress);
                    root.position.set(b.slamX, 1.52, 0.78);
                    const pulse = 4.7 + Math.sin(t * 18) * 0.12;
                    root.scale.set(pulse, pulse, 1); root.rotation.z = 0;
                } else if (b.attack === 'sweep') {
                    const progress = b.atkT < 0.7
                        ? (b.atkT / 0.7) * 0.49
                        : 0.5 + THREE.MathUtils.clamp((b.atkT - 0.7) / 0.32, 0, 1) * 0.499;
                    pose = lateAtlasRowPose(4, progress);
                    root.position.set(b.atkT < 0.7 ? 27 : b.sweepX, b.sweepY + 1.02, 0.78);
                    root.scale.set(b.sweepDir * 5.15, 3.35, 1); root.rotation.z = 0;
                } else if (b.attack === 'throw') {
                    const gap = medo ? 0.6 : 0.8;
                    pose = lateAtlasRowPose(8, (b.atkT % gap) / gap);
                    root.position.set(b.x, b.y + 2.05, 0.78);
                    root.scale.set(3.85, 3.85, 1); root.rotation.z = Math.sin(t * 7) * 0.035;
                } else if (b.attack === 'cocoon') {
                    pose = b.atkT < 0.62
                        ? lateAtlasRowPose(12, (b.atkT / 0.62) * 0.749)
                        : { frame: 14, next: 14, mix: 0 };
                    root.position.set(b.x, b.y + 2.0, 0.78);
                    const breathe = 5.1 + Math.sin(t * 2.7) * 0.14;
                    root.scale.set(breathe, breathe, 1); root.rotation.z = Math.sin(t * 0.8) * 0.018;
                } else visible = false;
            }
            root.visible = visible;
            if (visible) {
                if (attackLastFrames.current[0] !== pose.frame) {
                    attackLastFrames.current[0] = pose.frame; setAtlasFrame(attackAtlas, pose.frame, 4, 4);
                }
                if (attackLastFrames.current[1] !== pose.next) {
                    attackLastFrames.current[1] = pose.next; setAtlasFrame(attackAtlasNext, pose.next, 4, 4);
                }
                attackA.material.opacity = 1 - pose.mix;
                attackB.material.opacity = pose.mix;
                attackB.visible = pose.next !== pose.frame && pose.mix > 0.002;
            }
        }

        // Os novelos também são exclusivamente sprites. O branco oscila entre
        // carga e voo; ao ser refletido fixa na pose dourada do mesmo atlas.
        const list = b?.projectiles ?? [];
        let pi = 0;
        for (const pr of list) {
            if (pr.dead || pi >= projs.current.length) continue;
            const slot = pi++, m = projs.current[slot]; if (!m) continue;
            m.visible = true; m.position.set(pr.x, pr.y, 0.68);
            m.rotation.z = Math.atan2(pr.vy, pr.vx);
            const pulse = 1 + Math.sin(t * 13 + slot) * 0.045; m.scale.setScalar(pulse);
            const pa = projPrimary.current[slot], pb = projSecondary.current[slot];
            if (pa && pb) {
                const x = (pr.t * 5.2 + slot * 0.31) % 2;
                const frame = pr.reflected ? 11 : 8 + Math.floor(x);
                const next = pr.reflected ? 11 : 8 + ((Math.floor(x) + 1) % 2);
                const mix = pr.reflected ? 0 : THREE.MathUtils.smoothstep(x - Math.floor(x), 0.72, 0.98);
                const cache = projectileLastFrames.current[slot];
                if (cache[0] !== frame) { cache[0] = frame; setAtlasFrame(projectileAtlases[slot][0], frame, 4, 4); }
                if (cache[1] !== next) { cache[1] = next; setAtlasFrame(projectileAtlases[slot][1], next, 4, 4); }
                const color = pr.reflected ? '#ffe49a' : '#ffffff';
                pa.material.color.set(color); pb.material.color.set(color);
                pa.material.opacity = 1 - mix; pb.material.opacity = mix;
                pb.visible = next !== frame && mix > 0.002;
            }
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
            <group ref={attackRoot} visible={false} name="YOURSELF-painted-attack-vfx">
                <mesh ref={attackPrimary} renderOrder={9}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={attackAtlas} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
                <mesh ref={attackSecondary} visible={false} position={[0, 0, 0.008]} renderOrder={10}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={attackAtlasNext} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
            </group>
            {/* pool de novelos pintados; nenhum volume procedural por baixo */}
            {Array.from({ length: 6 }, (_, i) => (
                <group key={'pr' + i} ref={(el) => { if (el) projs.current[i] = el; }} visible={false}>
                    <mesh
                        ref={(el) => { if (el) projPrimary.current[i] = el as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; }}
                        renderOrder={10}
                    >
                        <planeGeometry args={[1.82, 1.82]} />
                        <meshBasicMaterial map={projectileAtlases[i][0]} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh
                        ref={(el) => { if (el) projSecondary.current[i] = el as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; }}
                        visible={false} position={[0, 0, 0.008]} renderOrder={11}
                    >
                        <planeGeometry args={[1.82, 1.82]} />
                        <meshBasicMaterial map={projectileAtlases[i][1]} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                    </mesh>
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

/**
 * Três planos pintados para cada lembrança. A câmera atualiza primeiro (-2) e
 * estes planos depois (-1); todos compartilham exatamente a mesma âncora Y.
 * Assim o salto não sacode o cenário, enquanto a diferença apenas em X cria
 * profundidade estável mesmo quando um frame demora mais no celular.
 */
const MemoryParallax: React.FC<{ memory: Memory }> = ({ memory }) => {
    const cam = useThree((s) => s.camera);
    const far = useRef<THREE.Mesh>(null!);
    const mid = useRef<THREE.Mesh>(null!);
    const near = useRef<THREE.Mesh>(null!);
    const tint = useRef<THREE.Mesh>(null!);
    const urls = MEMORY_PARALLAX_URLS[memory.key];
    const textures = useMemo(() => urls.map((url, i) => {
        const t = new THREE.TextureLoader().load(url);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
        if (i > 0) t.generateMipmaps = false;
        return t;
    }), [urls]);
    useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05), t = clock.elapsedTime, y = cam.position.y;
        const move = (mesh: THREE.Object3D | null, xFactor: number, lambda: number, yy: number, z: number) => {
            if (!mesh) return;
            mesh.position.x = THREE.MathUtils.damp(mesh.position.x, cam.position.x * xFactor, lambda, dt);
            mesh.position.y = yy; mesh.position.z = z;
        };
        move(far.current, 0.985, 15, y, -17);
        move(tint.current, 0.985, 15, y, -16.9);
        move(mid.current, 0.925, 12.5, y + Math.sin(t * 0.15) * 0.025, -10.5);
        move(near.current, 0.805, 10, y - 0.08 + Math.sin(t * 0.19) * 0.04, 4.5);
        if (mid.current) mid.current.rotation.z = Math.sin(t * 0.09) * 0.0018;
        if (near.current) near.current.rotation.z = Math.sin(t * 0.075) * 0.0024;
    }, -1);
    const lift = BG_LIFT[memory.key] ?? BG_LIFT.hotel;
    return <>
        <mesh ref={far} name={`parallax-${memory.key}-far`} renderOrder={-30}>
            <planeGeometry args={[38, 16.03]} />
            <meshBasicMaterial map={textures[0]} depthWrite={false} fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={mid} name={`parallax-${memory.key}-mid`} renderOrder={-20}>
            <planeGeometry args={[42, 17.72]} />
            <meshBasicMaterial map={textures[1]} transparent opacity={0.84} alphaTest={0.012} depthWrite={false} fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={near} name={`parallax-${memory.key}-near`} renderOrder={5}>
            <planeGeometry args={[52, 21.94]} />
            <meshBasicMaterial map={textures[2]} transparent opacity={0.78} alphaTest={0.012} depthWrite={false} depthTest={false} fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={tint} renderOrder={-19}>
            <planeGeometry args={[42, 17.72]} />
            <meshBasicMaterial color={lift.color} transparent opacity={lift.opacity} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false} />
        </mesh>
    </>;
};

/**
 * Parallax ortográfico real: distância Z não altera escala numa câmera
 * ortográfica, portanto cada pintura acompanha X/Y da câmera por uma fração
 * própria. O fundo quase acompanha; as bordas próximas ficam para trás e
 * atravessam o quadro mais depressa.
 */
const YourselfParallax: React.FC<{
    bossIntroRef: React.MutableRefObject<BossIntroState>;
}> = ({ bossIntroRef }) => {
    const cam = useThree((s) => s.camera);
    const far = useRef<THREE.Mesh>(null!); const mid = useRef<THREE.Mesh>(null!); const near = useRef<THREE.Mesh>(null!);
    const memories = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const mechanisms = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const motes = useRef<THREE.Points>(null!);
    const textures = useMemo(() => [bgYourselfFar, bgYourselfMid, bgYourselfMemories, bgYourselfNear, bgYourselfMechanisms].map((url, i) => {
        const t = new THREE.TextureLoader().load(url);
        t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
        if (i > 0) t.generateMipmaps = false;
        return t;
    }), []);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 78, a = new Float32Array(n * 3), r = seedRng(8021);
        for (let i = 0; i < n; i++) {
            a[i * 3] = r() * 62 - 4; a[i * 3 + 1] = r() * 13 - 2; a[i * 3 + 2] = -2 - r() * 8;
        }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#edc79a', size: 0.05, transparent: true, opacity: 0.52, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    useEffect(() => () => { geo.dispose(); mat.dispose(); textures.forEach((t) => t.dispose()); }, [geo, mat, textures]);
    useFrame(({ clock }, rawDt) => {
        const t = clock.elapsedTime;
        const dt = Math.min(rawDt, 0.05);
        const intro = bossIntroRef.current;
        const introT = intro.active ? Math.max(0, performance.now() / 1000 - intro.startedAt) : 0;
        const pulse = intro.active ? THREE.MathUtils.smoothstep(introT, 0.4, 4.9) : 0;
        // Todas as camadas compartilham a âncora vertical da câmera. O salto
        // move o cenário como uma unidade, sem alterar a distância relativa
        // entre planos; apenas X conserva profundidade de parallax.
        const y = cam.position.y;
        const dampX = (mesh: THREE.Object3D, target: number, lambda: number) => {
            mesh.position.x = THREE.MathUtils.damp(mesh.position.x, target, lambda, dt);
        };
        if (far.current) {
            dampX(far.current, cam.position.x * 0.985, 15);
            far.current.position.y = y; far.current.position.z = -17;
        }
        if (memories.current) {
            dampX(memories.current, cam.position.x * 0.962, 13);
            memories.current.position.y = y - 0.02 + Math.sin(t * 0.16) * 0.07;
            memories.current.position.z = -13.3;
            memories.current.rotation.z = Math.sin(t * 0.1) * 0.0028;
            memories.current.material.opacity = 0.49 + pulse * 0.32 + Math.sin(t * 0.22) * 0.035;
            const breathe = 1 + pulse * 0.018 + Math.sin(t * 0.12) * 0.004;
            memories.current.scale.set(breathe, breathe, 1);
        }
        if (mid.current) {
            dampX(mid.current, cam.position.x * 0.93, 12);
            mid.current.position.y = y - 0.085 + Math.sin(t * 0.18) * 0.06;
            mid.current.position.z = -10.5;
            mid.current.rotation.z = Math.sin(t * 0.13) * 0.0025;
        }
        if (near.current) {
            dampX(near.current, cam.position.x * 0.83, 10.5);
            near.current.position.y = y - 0.226 + Math.sin(t * 0.24) * 0.08;
            near.current.position.z = 4.7;
            near.current.rotation.z = Math.sin(t * 0.1) * 0.0035;
        }
        if (mechanisms.current) {
            dampX(mechanisms.current, cam.position.x * 0.73, 9);
            mechanisms.current.position.y = y - 0.25 + Math.sin(t * 0.31) * 0.12;
            mechanisms.current.position.z = 6.1;
            mechanisms.current.rotation.z = Math.sin(t * 0.17) * (0.004 + pulse * 0.005);
            mechanisms.current.material.opacity = 0.62 + pulse * 0.2;
        }
        if (motes.current) {
            dampX(motes.current, cam.position.x * 0.88, 11);
            motes.current.position.y = y + Math.sin(t * 0.16) * 0.35;
            motes.current.rotation.z = Math.sin(t * 0.09) * 0.008;
        }
    }, -1);
    return (
        <>
            <mesh ref={far} name="parallax-far" renderOrder={-30}>
                <planeGeometry args={[36.5, 20.54]} />
                <meshBasicMaterial map={textures[0]} depthWrite={false} fog={false} />
            </mesh>
            <mesh ref={memories} name="parallax-memories" renderOrder={-25}>
                <planeGeometry args={[40, 22.5]} />
                <meshBasicMaterial map={textures[2]} transparent opacity={0.52} alphaTest={0.012} depthWrite={false} fog={false} />
            </mesh>
            <mesh ref={mid} name="parallax-mid" renderOrder={-20}>
                <planeGeometry args={[42.5, 23.91]} />
                <meshBasicMaterial map={textures[1]} transparent alphaTest={0.018} depthWrite={false} fog={false} />
            </mesh>
            <points ref={motes} geometry={geo} material={mat} />
            <mesh ref={near} name="parallax-near" renderOrder={20}>
                <planeGeometry args={[52, 29.25]} />
                <meshBasicMaterial map={textures[3]} transparent alphaTest={0.018} depthWrite={false} depthTest={false} fog={false} />
            </mesh>
            <mesh ref={mechanisms} name="parallax-mechanisms" renderOrder={2}>
                <planeGeometry args={[56, 31.5]} />
                <meshBasicMaterial map={textures[4]} transparent opacity={0.64} alphaTest={0.012} depthWrite={false} depthTest={false} fog={false} />
            </mesh>
        </>
    );
};

const Scene: React.FC<{
    moveRef: React.MutableRefObject<number>; vertRef: React.MutableRefObject<number>;
    jumpRef: React.MutableRefObject<boolean>; grappleRef: React.MutableRefObject<boolean>;
    stitchRef: React.MutableRefObject<boolean>; introRef: React.MutableRefObject<boolean>;
    bossIntroRef: React.MutableRefObject<BossIntroState>; onBossIntro: () => void;
}> = ({ moveRef, vertRef, jumpRef, grappleRef, stitchRef, introRef, bossIntroRef, onBossIntro }) => {
    const cam = useThree((s) => s.camera), scene = useThree((s) => s.scene), size = useThree((s) => s.size), setDpr = useThree((s) => s.setDpr);
    const flash = useRef<THREE.AmbientLight>(null!); const nextBolt = useRef(4);
    const bossLight = useRef<THREE.PointLight>(null!);
    const bossAudio = useRef<{ attack: string | null; slamN: number; sweepN: number; throwN: number }>({ attack: null, slamN: 0, sweepN: 0, throwN: 0 });
    const quality = useRef({ sum: 0, frames: 0, dpr: 0.68 });
    const mem = curMem(), kit = makeKit(mem);
    useEffect(() => {
        scene.fog = new THREE.Fog(mem.pal.fog, mem.key === 'yourself' ? 26 : 22, 58);
        return () => { scene.fog = null; };
    }, [scene, mem.key, mem.pal.fog]);
    useEffect(() => {
        const cap = mem.key === 'yourself' ? 0.68 : 0.95;
        quality.current = { sum: 0, frames: 0, dpr: Math.min(window.devicePixelRatio || 1, cap) };
        setDpr(quality.current.dpr);
    }, [mem.key, setDpr]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const q = quality.current; q.sum += rawDt; q.frames++;
        if (q.sum >= 1.35 && q.frames >= 18) {
            const avg = q.sum / q.frames;
            const minDpr = mem.key === 'yourself' ? 0.48 : 0.6;
            const maxDpr = mem.key === 'yourself' ? 0.68 : 0.95;
            if (avg > 1 / 34 && q.dpr > minDpr) { q.dpr = Math.max(minDpr, q.dpr - 0.055); setDpr(q.dpr); }
            else if (avg < 1 / 52 && q.dpr < maxDpr) { q.dpr = Math.min(maxDpr, q.dpr + 0.035); setDpr(q.dpr); }
            q.sum = 0; q.frames = 0;
        }
        if (f8.phase === 'platformer' && !introRef.current && !bossIntroRef.current.active) {
            const ev = stepPlayer({ move: moveRef.current, vert: vertRef.current, jump: jumpRef.current, grapple: grappleRef.current, stitch: stitchRef.current }, dt);
            jumpRef.current = false; stitchRef.current = false;
            if (ev.stomped || ev.unravelled) f8Sting('stomp');
            const awakened = mem.key === 'yourself' && p8.boss?.phase === 'mirror' && p8.boss.introSeen && !bossIntroRef.current.seen;
            if (awakened) onBossIntro();
            else if (ev.beat || ev.bossSeam) f8Sting('beat');
            if (ev.won) { f8Sting('win'); f8MusicStop(2.4); }
        }
        const cinematic = bossIntroRef.current;
        if (mem.key === 'yourself' && !cinematic.active && p8.boss) {
            const b = p8.boss, audio = bossAudio.current;
            const attackNow = b.phase === 'attack' ? b.attack : null;
            if (attackNow !== audio.attack) {
                audio.attack = attackNow;
                if (attackNow) f8BossCombatSfx(attackNow);
            }
            if (b.slamN > audio.slamN) f8BossCombatSfx('impact');
            if (b.sweepN > audio.sweepN) f8BossCombatSfx('sweep');
            if (b.throwN > audio.throwN) f8BossCombatSfx('throw');
            audio.slamN = b.slamN; audio.sweepN = b.sweepN; audio.throwN = b.throwN;
        }
        const ortho = cam as THREE.OrthographicCamera;
        let tx: number, ty: number, wantedZoom: number;
        if (cinematic.active && p8.boss) {
            const e = Math.max(0, performance.now() / 1000 - cinematic.startedAt);
            const playerX = p8.x + 1.2, bossX = p8.boss.x - 0.8;
            const closeZoom = THREE.MathUtils.clamp(size.width / 12.8, 38, 68);
            const wideZoom = THREE.MathUtils.clamp(size.width / 35.5, 20, 48);
            if (e < 0.22) {
                tx = playerX; ty = p8.y + 2.0; wantedZoom = closeZoom;
            } else if (e < BOSS_REVEAL_START) {
                const k0 = THREE.MathUtils.clamp((e - 0.22) / (BOSS_REVEAL_START - 0.22), 0, 1), k = k0 * k0 * (3 - 2 * k0);
                tx = THREE.MathUtils.lerp(playerX, bossX, k); ty = THREE.MathUtils.lerp(p8.y + 2.0, p8.boss.y + 2.7, k);
                wantedZoom = closeZoom;
            } else if (e < BOSS_REVEAL_END - 0.18) {
                // A câmera já chegou antes do primeiro quadro de manifestação.
                tx = bossX; ty = p8.boss.y + 2.55; wantedZoom = closeZoom;
            } else {
                const returnStart = BOSS_REVEAL_END - 0.18;
                const returnDuration = Math.max(0.2, BOSS_INTRO_DURATION - returnStart);
                const k0 = THREE.MathUtils.clamp((e - returnStart) / returnDuration, 0, 1), k = k0 * k0 * (3 - 2 * k0);
                tx = THREE.MathUtils.lerp(bossX, (p8.x + p8.boss.x) * 0.5, k);
                ty = THREE.MathUtils.lerp(p8.boss.y + 2.7, 2.6, k);
                wantedZoom = THREE.MathUtils.lerp(closeZoom, wideZoom, k);
            }
            // O encaixe da máscara dá um pequeno tranco de câmera, sem pós-processamento caro.
            const snap = Math.max(0, 1 - Math.abs(e - BOSS_MASK_SNAP) / 0.34);
            tx += Math.sin(e * 82) * 0.18 * snap; ty += Math.cos(e * 67) * 0.11 * snap;
        } else {
            const bossFocus = mem.key === 'yourself' && p8.x > 15 ? 1.5 : 2.8;
            tx = Math.max(2, Math.min(mem.endX - 6, p8.x + bossFocus));
            const baseY = 2.75 + Math.max(0, p8.y) * 0.36;
            const nearbyFlyingY = p8.enemies.reduce((highest, e, i) => {
                const flying = mem.enemies[i]?.kind === 'intrusive' && !e.dead && Math.abs(e.x - p8.x) < 8.5;
                return flying ? Math.max(highest, e.y) : highest;
            }, -Infinity);
            ty = Number.isFinite(nearbyFlyingY) ? Math.max(baseY, Math.min(4.1, nearbyFlyingY - 2.3)) : baseY;
            wantedZoom = 58;
        }
        // THREE.damp é independente do FPS. A câmera roda antes do parallax
        // (prioridades -2/-1), então nenhuma camada herda a posição anterior
        // durante um salto ou queda de desempenho.
        cam.position.x = THREE.MathUtils.damp(cam.position.x, tx, cinematic.active ? 7.4 : 4.3, dt);
        cam.position.y = THREE.MathUtils.damp(cam.position.y, ty, cinematic.active ? 6.8 : 3.4, dt);
        ortho.zoom = THREE.MathUtils.damp(ortho.zoom, wantedZoom, cinematic.active ? 6.4 : 4.8, dt); ortho.updateProjectionMatrix();
        cam.position.z = 14; cam.rotation.set(0, 0, 0); cam.lookAt(cam.position.x, cam.position.y, 0);
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
    }, -2);
    return (
        <>
            <ambientLight color={mem.pal.ambient} intensity={mem.key === 'hotel' || mem.key === 'tempestade' ? 1.18 : mem.key === 'yourself' ? 1.04 : 0.88} />
            <hemisphereLight color={mem.pal.light} groundColor={mem.pal.bgLo} intensity={0.82} />
            <directionalLight position={[6, 10, 8]} intensity={mem.key === 'yourself' ? 1.08 : 0.92} color={mem.pal.light} />
            <pointLight position={[p8.x, p8.y + 3, 5]} intensity={0.7} distance={12} color={mem.pal.thread} />
            {mem.key === 'yourself' && <pointLight ref={bossLight} position={[43, 2.4, 5]} intensity={1.18} distance={15} decay={1.45} color="#e16672" />}
            {mem.key === 'tempestade' && <ambientLight ref={flash} color="#dceaff" intensity={0} />}
            {mem.key !== 'yourself' && <MemoryParallax memory={mem} />}
            {mem.key === 'tempestade' && <Rain endX={mem.endX} />}
            {mem.key === 'yourself' && <YourselfParallax bossIntroRef={bossIntroRef} />}
            {mem.key === 'yourself' && mem.ledges[0]
                ? <YourselfArenaFloor l={mem.ledges[0]} kit={kit} />
                : mem.ledges.map((l, i) => <YarnLedge key={`${mem.key}-l${i}`} l={l} kit={kit} />)}
            {mem.anchors.map((a, i) => <Anchor key={`${mem.key}-a${i}`} a={a} i={i} kit={kit} />)}
            {mem.hazards.map((h, i) => <BlackThread key={`${mem.key}-h${i}`} h={h} kit={kit} />)}
            {mem.gates.map((_, i) => <SeamGateActor key={`${mem.key}-g${i}`} i={i} kit={kit} />)}
            {mem.enemies.map((e, i) => <EnemyActor key={`${mem.key}-e${i}`} i={i} kind={e.kind ?? 'knotling'} kit={kit} />)}
            {mem.spools.map((s, i) => <Spool key={`${mem.key}-s${i}`} s={s} i={i} kit={kit} />)}
            <PatchActor />
            <BossSpriteActor kit={kit} bossIntroRef={bossIntroRef} />
            {mem.boss && <BossFX kit={kit} />}
            <CrochetPlayerSprite kit={kit} bossIntroRef={bossIntroRef} />
            <PlayerTransitionFX />
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
    const bossIntroRef = useRef<BossIntroState>({ active: false, seen: false, startedAt: 0 });
    const [bossIntroKey, setBossIntroKey] = useState(0);
    const beginBossIntro = useCallback(() => {
        const s = bossIntroRef.current; if (s.active || s.seen) return;
        s.active = true; s.seen = true; s.startedAt = performance.now() / 1000;
        p8.vx = 0; p8.vy = 0; p8.y = 0; p8.onGround = true; p8.lastGroundX = p8.x; p8.lastGroundY = 0;
        jumpRef.current = false; grappleRef.current = false; stitchRef.current = false;
        f8BossIntroSfx(); setBossIntroKey(Date.now());
    }, []);
    const finishBossIntro = useCallback(() => {
        const s = bossIntroRef.current; s.active = false;
        if (p8.boss?.phase === 'mirror') p8.boss.timer = Math.max(p8.boss.timer, 1.8);
        setBossIntroKey(0); setV((v) => v + 1);
    }, []);
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
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8plat = { p8, reset: p8Reset, introRef, bossIntroRef, beginBossIntro, finishBossIntro }; }, [beginBossIntro, finishBossIntro]);
    const activePhase = f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
    useEffect(() => {
        if (!activePhase) { lastMem.current = -1; return; }
        if (p8.memIdx === lastMem.current) return;
        lastMem.current = p8.memIdx; introRef.current = true; setIntroKey(p8.memIdx);
        bossIntroRef.current = { active: false, seen: false, startedAt: 0 }; setBossIntroKey(0);
        f8MusicStart(curMem().key);
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
    const bossIntroActive = bossIntroKey > 0;
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
            <Canvas orthographic dpr={mem.key === 'yourself' ? [0.55, 0.68] : [0.75, 1.2]} camera={{ position: [2, 2.75, 14], zoom: 58, near: 0.1, far: 120 }} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}>
                <Scene moveRef={moveRef} vertRef={vertRef} jumpRef={jumpRef} grappleRef={grappleRef} stitchRef={stitchRef} introRef={introRef} bossIntroRef={bossIntroRef} onBossIntro={beginBossIntro} />
            </Canvas>
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%,transparent 58%,rgba(3,2,7,.28) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'soft-light', opacity: 0.028, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0 1px,#000 1px 3px)' }} />
            {bossIntroActive && (
                <div data-f8-boss-cutscene key={bossIntroKey} style={{ position: 'absolute', inset: 0, zIndex: 18, pointerEvents: 'none', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 72% 48%,rgba(177,31,63,.16),transparent 32%),linear-gradient(90deg,rgba(0,0,0,.25),transparent 32%,transparent 67%,rgba(0,0,0,.45))', animation: `f8BossGrade ${BOSS_INTRO_DURATION}s ease both` }} />
                    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ position: 'absolute', left: `${10 + i * 13.2}%`, top: '-18%', width: 1 + (i % 3), height: '136%', background: i % 2 ? 'rgba(242,174,153,.24)' : 'rgba(179,32,68,.34)', boxShadow: '0 0 12px rgba(222,49,83,.35)', transformOrigin: 'top', animation: `f8BossThread ${1.02 + i * 0.08}s ${0.1 + i * 0.055}s cubic-bezier(.2,.8,.2,1) both` }} />)}
                    <div style={{ position: 'absolute', inset: '-30%', background: 'radial-gradient(circle,rgba(255,225,196,.82) 0,rgba(230,54,85,.26) 9%,transparent 25%)', opacity: 0, animation: `f8BossSnap ${BOSS_INTRO_DURATION}s linear both` }} />
                    <div data-f8-boss-roar style={{ position: 'absolute', inset: '-8%', opacity: 0, background: 'repeating-conic-gradient(from 7deg at 72% 48%,transparent 0 8deg,rgba(255,92,112,.18) 9deg,transparent 11deg 18deg)', mixBlendMode: 'screen', animation: `f8BossRoar ${BOSS_INTRO_DURATION}s cubic-bezier(.2,.85,.2,1) both` }} />
                    <div style={{ position: 'absolute', left: '7%', right: '7%', bottom: '21%', textAlign: 'center', color: '#e6c8c0', font: 'italic clamp(13px,2.4vw,19px)/1.4 Georgia,serif', letterSpacing: 1.2, textShadow: '0 3px 14px #000', animation: `f8BossLineOne ${BOSS_INTRO_DURATION}s ease both` }}>O fio à frente se move sem mãos.</div>
                    <div style={{ position: 'absolute', left: '7%', right: '7%', bottom: '21%', textAlign: 'center', color: '#f0d4cb', font: 'italic clamp(13px,2.4vw,19px)/1.4 Georgia,serif', letterSpacing: 1.2, textShadow: '0 3px 14px #000', animation: `f8BossLineTwo ${BOSS_INTRO_DURATION}s ease both` }}>Não era algo esperando no fim.</div>
                    <div style={{ position: 'absolute', left: '7%', right: '7%', bottom: '18%', textAlign: 'center', color: '#e4b6b3', font: 'italic clamp(12px,2.2vw,18px)/1.4 Georgia,serif', letterSpacing: 1.1, textShadow: '0 3px 14px #000', animation: `f8BossLineThree ${BOSS_INTRO_DURATION}s ease both` }}>Era o que continuou se costurando quando você desviou o olhar.</div>
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', textAlign: 'center', animation: `f8BossTitle ${BOSS_INTRO_DURATION}s cubic-bezier(.2,.8,.2,1) both` }}>
                        <div style={{ color: '#a97b80', font: '9px/1.2 monospace', letterSpacing: 'clamp(3px,1.2vw,9px)', marginBottom: 10 }}>A QUINTA LEMBRANÇA NÃO TEM SAÍDA</div>
                        <div style={{ color: '#f4d3cc', font: '600 clamp(48px,13vw,126px)/.82 Georgia,serif', letterSpacing: 'clamp(5px,2vw,22px)', textShadow: '0 0 8px #fff2da,0 0 28px #d52f55,0 0 90px #6f102d' }}>YOURSELF</div>
                        <div style={{ color: '#d9aeb0', font: '10px/1.2 monospace', letterSpacing: 'clamp(2px,.8vw,6px)', marginTop: 20 }}>VOCÊ NÃO ENTROU NA ARENA · ELA LEMBROU DE VOCÊ</div>
                    </div>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '12.5%', background: 'linear-gradient(#000 70%,rgba(0,0,0,.92))', boxShadow: '0 8px 30px #000', animation: `f8BossBarTop ${BOSS_INTRO_DURATION}s ease both` }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '12.5%', background: 'linear-gradient(rgba(0,0,0,.92),#000 30%)', boxShadow: '0 -8px 30px #000', animation: `f8BossBarBot ${BOSS_INTRO_DURATION}s ease both` }} />
                    <div onAnimationEnd={finishBossIntro} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, animation: `f8BossTimer ${BOSS_INTRO_DURATION}s linear both` }} />
                </div>
            )}
            {!bossIntroActive && bossActive && bossCue && <div data-f8-attack-vignette style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: `inset 0 0 150px ${bossCue.soft}`, transition: 'box-shadow .24s ease' }} />}

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

            {!won && !bossIntroActive && (
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

            {bossCue && !won && !bossIntroActive && <div style={{ position: 'absolute', top: 88, left: 12, right: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
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

            {!won && !bossIntroActive && (
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
                @keyframes f8BossTimer{from{transform:translateX(0)}to{transform:translateX(1px)}}
                @keyframes f8BossGrade{0%{opacity:0;filter:saturate(.65)}7%,92%{opacity:1;filter:saturate(1)}100%{opacity:0;filter:saturate(.8)}}
                @keyframes f8BossThread{0%{transform:translateY(-100%) scaleY(.2);opacity:0}30%{opacity:.85}72%{transform:translateY(0) scaleY(1);opacity:.56}100%{transform:translateY(13%) scaleY(1.08);opacity:0}}
                @keyframes f8BossSnap{0%,52%{opacity:0;transform:scale(.55)}55%{opacity:.94;transform:scale(1)}60%,100%{opacity:0;transform:scale(1.35)}}
                @keyframes f8BossRoar{0%,57%{opacity:0;transform:scale(.82) rotate(-1deg)}60%{opacity:.82;transform:scale(1)}69%{opacity:.34;transform:scale(1.08) rotate(.5deg)}76%,100%{opacity:0;transform:scale(1.18)}}
                @keyframes f8BossLineOne{0%,3%{opacity:0;transform:translateY(7px);filter:blur(3px)}6%,13%{opacity:1;transform:none;filter:blur(0)}17%,100%{opacity:0;transform:translateY(-4px);filter:blur(1.5px)}}
                @keyframes f8BossLineTwo{0%,14%{opacity:0;transform:translateY(7px);filter:blur(3px)}18%,26%{opacity:1;transform:none;filter:blur(0)}30%,100%{opacity:0;transform:translateY(-4px);filter:blur(1.5px)}}
                @keyframes f8BossLineThree{0%,28%{opacity:0;transform:translateY(7px);filter:blur(3px)}33%,47%{opacity:1;transform:none;filter:blur(0)}52%,100%{opacity:0;transform:translateY(-4px);filter:blur(1.5px)}}
                @keyframes f8BossTitle{0%,67%{opacity:0;transform:scale(1.09);filter:blur(10px)}72%{opacity:1;transform:scale(1);filter:blur(0)}92%{opacity:1;transform:scale(1.008);filter:blur(0)}100%{opacity:0;transform:scale(1.025);filter:blur(2px)}}
                @keyframes f8BossBarTop{0%{transform:translateY(-105%)}6%,94%{transform:none}100%{transform:translateY(-105%)}}
                @keyframes f8BossBarBot{0%{transform:translateY(105%)}6%,94%{transform:none}100%{transform:translateY(105%)}}
                @media(max-width:520px){button{user-select:none;-webkit-user-select:none}.f8-help{display:none}}
            `}</style>
        </div>
    );
};

export default Floor8Platformer;
