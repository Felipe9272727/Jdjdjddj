/**
 * Floor6Suite.tsx — a SUÍTE 612, the escape room of "O Hóspede que Sabia
 * Demais". Runs in the MAIN canvas (first person, Player.tsx controls).
 *
 * Realistic-leaning look inside the engine's budget: procedural canvas
 * textures with the grime PAINTED IN (AO at the baseboards, dark grout,
 * worn carpet), warm practical lights (abajur, kitchen bulb) against a dim
 * base, and a cold flickering fluorescent for the bathroom. The elevator
 * panel sputters real sparks after the BANG.
 *
 * The director (useFrame) advances f6Escape's clock — the bang trigger,
 * mirror steam, ice melt, blackout→guest — and drains the event queue into
 * sound + light cues.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f6, f6Tick, f6DrainEvents, F6_CEIL, F6_FURNITURE } from './f6Escape';
import { Floor6Guest } from './Floor6Guest';
import {
    startF6RoomTone, stopF6RoomTone, playF6Spark, playF6Clank, playF6Unlock,
    playF6Chain, playF6Ding, startF6Tap, stopF6Tap, playF6Breath, playF6Static,
} from './floor6Sfx';

// ── canvas-texture helpers ────────────────────────────────────────────────────
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void,
    rx = 1, ry = 1): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
}
const rnd = (seed: { v: number }) => { seed.v = (seed.v * 16807) % 2147483647; return seed.v / 2147483647; };

/** Striped wallpaper, water-stained, dark near the floor line. */
const wallpaperTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#9b8d76'; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) { ctx.fillStyle = x % 32 ? '#94866f' : '#a2937c'; ctx.fillRect(x, 0, 8, 256); }
    const s = { v: 7 };
    for (let i = 0; i < 60; i++) {                                  // mottled age spots
        ctx.fillStyle = `rgba(60,48,34,${0.03 + rnd(s) * 0.05})`;
        const x = rnd(s) * 256, y = rnd(s) * 256, r = 4 + rnd(s) * 22;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createLinearGradient(0, 0, 0, 256);               // AO: ceiling + baseboard
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.18, 'rgba(0,0,0,0)');
    g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
}, 4, 1);

/** Worn hotel carpet — dark pattern, traffic lanes rubbed lighter. */
const carpetTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#5c4a3a'; ctx.fillRect(0, 0, 256, 256);
    const s = { v: 3 };
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
        ctx.strokeStyle = 'rgba(122,40,36,0.55)'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 6, y + 6, 20, 20);
        ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd(s) * 0.1})`;
        ctx.fillRect(x, y, 32, 32);
    }
    for (let i = 0; i < 300; i++) {                                 // fiber noise
        ctx.fillStyle = `rgba(255,240,220,${rnd(s) * 0.04})`;
        ctx.fillRect(rnd(s) * 256, rnd(s) * 256, 2, 2);
    }
}, 5, 5);

/** Bathroom tile, dark grout. */
const tileTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#23211e'; ctx.fillRect(0, 0, 256, 256);
    const s = { v: 11 };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const sh = 196 + rnd(s) * 26;
        ctx.fillStyle = `rgb(${sh},${sh + 4},${sh + 2})`;
        ctx.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
        ctx.fillStyle = `rgba(80,70,55,${rnd(s) * 0.18})`;          // grime per tile
        ctx.fillRect(x * 64 + 3, y * 64 + 40, 58, 21);
    }
}, 3, 3);

/** Kitchen vinyl — old checkerboard. */
const vinylTex = canvasTex(128, 128, (ctx) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#7b7568' : '#a8a094';
        ctx.fillRect(x * 64, y * 64, 64, 64);
    }
    ctx.fillStyle = 'rgba(40,34,26,0.25)';
    ctx.fillRect(0, 0, 128, 6); ctx.fillRect(0, 0, 6, 128);
}, 4, 5);

/** Dark wood for furniture. */
const woodTex = canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = '#4a3322'; ctx.fillRect(0, 0, 128, 128);
    const s = { v: 19 };
    for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = `rgba(20,12,6,${0.2 + rnd(s) * 0.25})`;
        ctx.lineWidth = 1 + rnd(s) * 2;
        ctx.beginPath();
        ctx.moveTo(0, rnd(s) * 128);
        ctx.bezierCurveTo(40, rnd(s) * 128, 90, rnd(s) * 128, 128, rnd(s) * 128);
        ctx.stroke();
    }
}, 1, 1);

/** Ceiling — flat off-white with stains. */
const ceilTex = canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = '#b5ada0'; ctx.fillRect(0, 0, 128, 128);
    const s = { v: 23 };
    for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(110,90,60,${0.04 + rnd(s) * 0.08})`;
        ctx.beginPath(); ctx.arc(rnd(s) * 128, rnd(s) * 128, 8 + rnd(s) * 26, 0, Math.PI * 2); ctx.fill();
    }
}, 4, 5);

/** The guest's hand-drawn 20-floor truth map (pantry wall). */
const truthTex = canvasTex(256, 320, (ctx) => {
    ctx.fillStyle = '#d8cdb4'; ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = '#6a5c44'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 248, 312);
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    for (let i = 0; i < 20; i++) {
        const f = 20 - i, y = 22 + i * 14.6;
        ctx.strokeStyle = '#5a4c38'; ctx.lineWidth = 1;
        ctx.strokeRect(60, y - 9, 136, 12);
        ctx.fillStyle = f === 20 ? '#7a1d14' : '#3a3226';
        ctx.fillText(f === 20 ? 'ELE MORA NO ULTIMO' : (f >= 7 ? `${f} — ?` : `${f}`), 128, y);
    }
    // red string pins
    ctx.strokeStyle = 'rgba(170,30,24,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, 310); ctx.lineTo(196, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(196, 296); ctx.lineTo(64, 36); ctx.stroke();
});

/** Crooked painting — a faded landscape. */
const paintingTex = canvasTex(128, 96, (ctx) => {
    ctx.fillStyle = '#283a30'; ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = '#7d8d96'; ctx.fillRect(0, 0, 128, 40);
    ctx.fillStyle = '#46604c'; ctx.beginPath();
    ctx.moveTo(0, 50); ctx.lineTo(40, 26); ctx.lineTo(80, 52); ctx.lineTo(128, 30); ctx.lineTo(128, 96); ctx.lineTo(0, 96);
    ctx.fill();
    ctx.strokeStyle = '#8a6d34'; ctx.lineWidth = 8; ctx.strokeRect(0, 0, 128, 96);
});

const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallpaperTex }),
    tileWall: new THREE.MeshStandardMaterial({ map: tileTex }),
    carpet: new THREE.MeshStandardMaterial({ map: carpetTex }),
    tile: new THREE.MeshStandardMaterial({ map: tileTex }),
    vinyl: new THREE.MeshStandardMaterial({ map: vinylTex }),
    ceil: new THREE.MeshStandardMaterial({ map: ceilTex }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex }),
    woodDk: new THREE.MeshStandardMaterial({ color: '#352618' }),
    fabric: new THREE.MeshStandardMaterial({ color: '#8c2f2a' }),
    sheet: new THREE.MeshStandardMaterial({ color: '#cfc7b4' }),
    pillow: new THREE.MeshStandardMaterial({ color: '#ddd6c4' }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.25 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#b8bcc0', metalness: 0.85, roughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.45 }),
    appliance: new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1c1a17' }),
    door: new THREE.MeshStandardMaterial({ color: '#5b4630' }),
    brass: new THREE.MeshStandardMaterial({ color: '#9a7d3a', metalness: 0.8, roughness: 0.35 }),
    curtain: new THREE.MeshStandardMaterial({ color: '#6e5a4a', side: THREE.DoubleSide }),
    shower: new THREE.MeshStandardMaterial({ color: '#cfd6d2', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
};

const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => <mesh position={p} rotation={r ?? [0, 0, 0]} material={m}><boxGeometry args={a} /></mesh>;

/** A wall slab along a collision segment (x1,z1)→(x2,z2). */
const Wall: React.FC<{ seg: [number, number, number, number]; m?: THREE.Material; h?: number; y?: number; th?: number }> =
    ({ seg, m = M.wall, h = F6_CEIL, y = 0, th = 0.22 }) => {
        const [x1, z1, x2, z2] = seg;
        const len = Math.hypot(x2 - x1, z2 - z1);
        const ang = Math.atan2(x2 - x1, z2 - z1);
        return (
            <mesh position={[(x1 + x2) / 2, y + h / 2, (z1 + z2) / 2]} rotation={[0, ang, 0]} material={m}>
                <boxGeometry args={[th, h, len]} />
            </mesh>
        );
    };

// ── pieces ────────────────────────────────────────────────────────────────────

const Bed: React.FC = () => (
    <group position={[-7.0, 0, 2.5]}>
        <B a={[1.9, 0.32, 2.5]} p={[0, 0.3, 0]} m={M.woodDk} />
        <B a={[1.8, 0.26, 2.3]} p={[0, 0.56, 0]} m={M.sheet} />
        <B a={[1.8, 0.1, 1.3]} p={[0, 0.7, -0.4]} m={M.fabric} />
        <B a={[0.7, 0.14, 0.45]} p={[-0.35, 0.72, 0.85]} m={M.pillow} r={[0, 0.12, 0]} />
        <B a={[1.9, 0.9, 0.14]} p={[0, 0.85, 1.22]} m={M.wood} />
        {/* the mattress tear (manivela hiding place) */}
        <B a={[0.5, 0.04, 0.18]} p={[0.35, 0.7, -0.9]} m={M.dark} r={[0, 0.4, 0]} />
        {/* the diary on the blanket */}
        <B a={[0.26, 0.05, 0.34]} p={[0.25, 0.72, 0.42]} m={M.fabric} r={[0, -0.3, 0]} />
    </group>
);

const Nightstand: React.FC = () => (
    <group position={[-7.6, 0, 4.4]}>
        <B a={[0.72, 0.62, 0.72]} p={[0, 0.31, 0]} m={M.wood} />
        {/* abajur */}
        <mesh position={[0, 0.72, -0.12]} material={M.brass}><cylinderGeometry args={[0.03, 0.05, 0.22, 8]} /></mesh>
        <mesh position={[0, 0.9, -0.12]}>
            <cylinderGeometry args={[0.09, 0.16, 0.18, 10, 1, true]} />
            <meshStandardMaterial color="#e8d9b0" emissive="#ffd9a0" emissiveIntensity={0.85} side={THREE.DoubleSide} />
        </mesh>
        {/* telefone de disco */}
        <B a={[0.26, 0.1, 0.2]} p={[0.18, 0.68, 0.16]} m={M.dark} />
        <B a={[0.22, 0.06, 0.08]} p={[0.18, 0.76, 0.16]} m={M.dark} />
    </group>
);

const Wardrobe: React.FC<{ open: boolean }> = ({ open }) => (
    <group position={[-3.5, 0, 6.5]}>
        <B a={[1.7, 2.2, 0.85]} p={[0, 1.1, 0]} m={M.wood} />
        <B a={[0.04, 1.9, 0.6]} p={[-0.42, 1.05, open ? 0.6 : 0.44]} m={M.woodDk} r={[0, open ? -1.2 : 0, 0]} />
        <B a={[0.04, 1.9, 0.6]} p={[0.42, 1.05, 0.44]} m={M.woodDk} />
        <B a={[0.05, 0.18, 0.05]} p={[-0.18, 1.1, 0.46]} m={M.brass} />
        <B a={[0.05, 0.18, 0.05]} p={[0.18, 1.1, 0.46]} m={M.brass} />
    </group>
);

const Desk: React.FC = () => (
    <group position={[-5.5, 0, -9.5]}>
        <B a={[1.7, 0.07, 0.85]} p={[0, 0.78, 0]} m={M.wood} />
        {[-0.75, 0.75].map((x) => <B key={x} a={[0.09, 0.78, 0.7]} p={[x, 0.39, 0]} m={M.woodDk} />)}
        {/* typewriter + the half page */}
        <B a={[0.5, 0.2, 0.4]} p={[0, 0.92, 0]} m={M.dark} />
        <B a={[0.42, 0.06, 0.1]} p={[0, 1.05, -0.08]} m={M.steel} />
        <mesh position={[0, 1.16, -0.13]} rotation={[-0.5, 0, 0.02]}>
            <planeGeometry args={[0.3, 0.3]} />
            <meshStandardMaterial color="#e3dcc8" side={THREE.DoubleSide} />
        </mesh>
        {/* chair */}
        <B a={[0.5, 0.06, 0.5]} p={[0.1, 0.48, 0.75]} m={M.wood} />
        {[-0.11, 0.31].map((x) => [0.55, 0.95].map((z) => <B key={`${x}${z}`} a={[0.06, 0.48, 0.06]} p={[x, 0.24, z]} m={M.woodDk} />))}
        <B a={[0.5, 0.6, 0.06]} p={[0.1, 0.85, 0.98]} m={M.wood} />
    </group>
);

const TvRack: React.FC<{ on: boolean; staticMat: THREE.MeshStandardMaterial }> = ({ on, staticMat }) => (
    <group position={[1.15, 0, 1.2]} rotation={[0, -Math.PI / 2, 0]}>
        <B a={[1.35, 0.5, 0.62]} p={[0, 0.25, 0]} m={M.wood} />
        {/* CRT */}
        <B a={[0.78, 0.6, 0.6]} p={[0, 0.82, 0.02]} m={M.dark} />
        <mesh position={[0, 0.82, 0.33]} material={on ? staticMat : M.dark}>
            <planeGeometry args={[0.62, 0.46]} />
        </mesh>
    </group>
);

const CrookedPainting: React.FC = () => (
    <mesh position={[-2.5, 1.75, -9.86]} rotation={[0, 0, -0.09]}>
        <boxGeometry args={[1.1, 0.8, 0.06]} />
        <meshStandardMaterial map={paintingTex} />
    </mesh>
);

const Window612: React.FC = () => (
    <group position={[-7.88, 1.65, -2.0]} rotation={[0, Math.PI / 2, 0]}>
        <B a={[1.6, 1.4, 0.1]} p={[0, 0, -0.02]} m={M.woodDk} />
        <mesh position={[0, 0, 0.04]}>
            <planeGeometry args={[1.4, 1.2]} />
            <meshStandardMaterial color="#6f7d86" emissive="#56626c" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[-0.55, 0, 0.1]} rotation={[0, 0, 0.04]} material={M.curtain}>
            <planeGeometry args={[0.7, 1.5]} />
        </mesh>
        <mesh position={[0.62, 0, 0.1]} rotation={[0, 0, -0.03]} material={M.curtain}>
            <planeGeometry args={[0.5, 1.5]} />
        </mesh>
    </group>
);

/** Locked door (+padlock / chain). Swings open against the wall when unlocked. */
const SuiteDoor: React.FC<{ z: number; open: boolean; chain?: boolean }> = ({ z, open, chain }) => (
    <group position={[1.5, 0, z + 0.7]} rotation={[0, open ? 1.45 : 0, 0]}>
        <B a={[0.09, 2.2, 1.4]} p={[0, 1.1, -0.7]} m={M.door} />
        <B a={[0.05, 0.16, 0.05]} p={[-0.08, 1.05, -1.22]} m={M.brass} />
        {!open && !chain && (
            <group position={[-0.09, 1.05, -1.32]}>
                <B a={[0.05, 0.22, 0.16]} p={[0, 0, 0]} m={M.steel} />
                <mesh position={[0, 0.16, 0]} material={M.steel}>
                    <torusGeometry args={[0.06, 0.018, 6, 12]} />
                </mesh>
            </group>
        )}
        {!open && chain && (
            <B a={[0.06, 0.07, 1.5]} p={[-0.07, 1.3, -0.7]} m={M.steel} r={[0, 0, 0.06]} />
        )}
    </group>
);

const Bathroom: React.FC<{ fog01: number }> = ({ fog01 }) => (
    <group>
        {/* sink + mirror */}
        <group position={[3.2, 0, -9.6]}>
            <B a={[0.95, 0.12, 0.55]} p={[0, 0.82, 0]} m={M.porcelain} />
            <B a={[0.3, 0.78, 0.3]} p={[0, 0.4, 0]} m={M.porcelain} />
            <B a={[0.06, 0.12, 0.2]} p={[0, 0.95, -0.14]} m={M.chrome} />
            <mesh position={[0, 1.75, -0.22]}>
                <planeGeometry args={[0.85, 0.75]} />
                <meshStandardMaterial color="#aebfc6" metalness={0.9} roughness={0.12} />
            </mesh>
            {/* steam film: opacity follows fogT; the message is overlay-side */}
            <mesh position={[0, 1.75, -0.21]}>
                <planeGeometry args={[0.85, 0.75]} />
                <meshStandardMaterial color="#d9dfd9" transparent opacity={fog01 * 0.85} />
            </mesh>
        </group>
        {/* toilet (cisterna = the fusível) */}
        <group position={[5.6, 0, -8.5]}>
            <B a={[0.5, 0.36, 0.62]} p={[-0.12, 0.32, 0]} m={M.porcelain} />
            <B a={[0.24, 0.7, 0.55]} p={[0.18, 0.62, 0]} m={M.porcelain} />
        </group>
        {/* tub + curtain + the towel bundle */}
        <group position={[3.75, 0, -3.6]}>
            <B a={[1.85, 0.62, 0.9]} p={[0, 0.31, 0]} m={M.porcelain} />
            <B a={[0.5, 0.2, 0.35]} p={[0.3, 0.7, 0]} m={M.sheet} />
            <B a={[0.46, 0.05, 0.3]} p={[0.3, 0.81, 0]} m={M.fabric} />
            <mesh position={[0, 1.6, 0.48]} material={M.shower}>
                <planeGeometry args={[1.9, 1.7]} />
            </mesh>
            <B a={[1.95, 0.04, 0.04]} p={[0, 2.45, 0.48]} m={M.chrome} />
        </group>
        {/* bloody handprint */}
        <mesh position={[5.93, 1.4, -6]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.3, 0.36]} />
            <meshStandardMaterial color="#5a1410" transparent opacity={0.75} />
        </mesh>
    </group>
);

const Kitchen: React.FC<{ melting: boolean }> = ({ melting }) => (
    <group>
        {/* counter w/ stove */}
        <group position={[5.55, 0, 1.2]}>
            <B a={[0.85, 0.9, 3.6]} p={[0, 0.45, 0]} m={M.appliance} />
            <B a={[0.87, 0.06, 3.62]} p={[0, 0.93, 0]} m={M.woodDk} />
            {/* stove top + pan */}
            <B a={[0.7, 0.04, 0.9]} p={[0, 0.97, -0.6]} m={M.dark} />
            <mesh position={[0, 1.0, -0.6]} material={M.steel}>
                <cylinderGeometry args={[0.21, 0.21, 0.1, 14]} />
            </mesh>
            {melting && (
                <mesh position={[0, 1.07, -0.6]}>
                    <cylinderGeometry args={[0.12, 0.12, 0.1, 10]} />
                    <meshStandardMaterial color="#cfe6ee" transparent opacity={0.8} />
                </mesh>
            )}
            {/* microwave */}
            <B a={[0.55, 0.35, 0.4]} p={[0, 1.13, 1.2]} m={M.dark} />
        </group>
        {/* fridge */}
        <group position={[5.55, 0, -1.9]}>
            <B a={[0.88, 1.85, 0.88]} p={[0, 0.93, 0]} m={M.appliance} />
            <B a={[0.05, 0.5, 0.06]} p={[-0.46, 1.1, 0.2]} m={M.steel} />
        </group>
        {/* pantry shelf + THE TRUTH WALL */}
        <group position={[3.75, 0, 6.6]}>
            <B a={[3.4, 0.06, 0.6]} p={[0, 1.0, 0]} m={M.wood} />
            <B a={[3.4, 0.06, 0.6]} p={[0, 1.7, 0]} m={M.wood} />
            {[-1.2, -0.4, 0.5, 1.3].map((x) => (
                <B key={x} a={[0.16, 0.24, 0.16]} p={[x, 1.14, 0]} m={x === 0.5 ? M.fabric : M.appliance} />
            ))}
        </group>
        <mesh position={[3.75, 1.7, 6.86]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[1.7, 2.1]} />
            <meshStandardMaterial map={truthTex} />
        </mesh>
    </group>
);

/** The blown elevator panel beside the doorway (after the bang). */
const BlownPanel: React.FC<{ blown: boolean; sparkRef: React.MutableRefObject<number> }> = ({ blown, sparkRef }) => {
    const light = useRef<THREE.PointLight>(null!);
    const plate = useRef<THREE.MeshStandardMaterial>(null!);
    useFrame(({ clock }) => {
        const sparking = sparkRef.current > 0;
        if (light.current) {
            light.current.intensity = sparking ? (Math.random() < 0.5 ? 38 : 3) : 0;
        }
        if (plate.current) {
            plate.current.emissiveIntensity = sparking ? 0.7 + Math.sin(clock.elapsedTime * 60) * 0.5 : 0;
        }
    });
    return (
        <group position={[2.05, 1.25, -9.83]}>
            <mesh rotation={[0, 0, blown ? -0.34 : 0]} position={blown ? [0.05, -0.07, 0.04] : [0, 0, 0]}>
                <boxGeometry args={[0.5, 0.7, 0.08]} />
                <meshStandardMaterial ref={plate} color="#6a7076" metalness={0.6} roughness={0.5} emissive="#ff8c3a" emissiveIntensity={0} />
            </mesh>
            {blown && (
                <>
                    {/* three empty sockets */}
                    {[0.18, 0, -0.18].map((y) => (
                        <mesh key={y} position={[0, y, 0.06]} material={M.dark}>
                            <boxGeometry args={[0.3, 0.12, 0.05]} />
                        </mesh>
                    ))}
                    {/* the damp note */}
                    <mesh position={[-0.02, 0.02, 0.1]} rotation={[0, 0, 0.06]}>
                        <planeGeometry args={[0.3, 0.34]} />
                        <meshStandardMaterial color="#ded6bd" />
                    </mesh>
                    {/* hanging cable */}
                    <mesh position={[0.3, -0.42, 0.05]} rotation={[0, 0, 0.5]} material={M.dark}>
                        <cylinderGeometry args={[0.015, 0.015, 0.5, 5]} />
                    </mesh>
                    <pointLight ref={light} position={[0.2, -0.2, 0.4]} color="#ffb066" distance={5} decay={2} intensity={0} />
                </>
            )}
        </group>
    );
};

// ── the suite ─────────────────────────────────────────────────────────────────
export const Floor6Suite: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const sparkRef = useRef(0);          // seconds of live sparking left
    const nextSputter = useRef(4);
    const bathFlicker = useRef(0);
    const bathLight = useRef<THREE.PointLight>(null!);
    const tvLight = useRef<THREE.PointLight>(null!);
    const tapLoop = useRef(false);
    const breathTimer = useRef(0);
    const [, force] = React.useReducer((v: number) => v + 1, 0);
    const versionSeen = useRef(f6.version);

    // animated TV static
    const staticMat = useMemo(() => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 48;
        const t = new THREE.CanvasTexture(c);
        const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#aab4b8', emissiveMap: t, emissiveIntensity: 0.9 });
        (m as THREE.MeshStandardMaterial & { __cv?: HTMLCanvasElement; __tx?: THREE.CanvasTexture }).__cv = c;
        (m as THREE.MeshStandardMaterial & { __cv?: HTMLCanvasElement; __tx?: THREE.CanvasTexture }).__tx = t;
        return m;
    }, []);
    const staticAccum = useRef(0);

    React.useEffect(() => {
        startF6RoomTone();
        return () => { stopF6RoomTone(); stopF6Tap(); };
    }, []);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        f6Tick(dt, playerPositionRef.current.z);

        // re-render on state version changes (door swings, melting pan, …)
        if (f6.version !== versionSeen.current) { versionSeen.current = f6.version; force(); }

        // drain the event queue → sound & light
        for (const ev of f6DrainEvents()) {
            if (ev === 'bang') { sparkRef.current = 2.2; playF6Spark(1); }
            else if (ev === 'install') playF6Clank();
            else if (ev === 'unlock') { playF6Unlock(); bathFlicker.current = 1.3; }
            else if (ev === 'chain') playF6Chain();
            else if (ev === 'repaired') playF6Ding();
            else if (ev === 'guestAppear') playF6Breath();
            else if (ev === 'melted') playF6Clank(0.5);
        }

        // panel keeps sputtering until repaired
        const broken = f6.phase === 'explore';
        if (broken) {
            nextSputter.current -= dt;
            if (nextSputter.current <= 0) {
                sparkRef.current = 0.5 + Math.random() * 0.8;
                nextSputter.current = 5 + Math.random() * 9;
                playF6Spark(0.35);
            }
        }
        sparkRef.current = Math.max(0, sparkRef.current - dt);

        // bathroom fluorescent: flickers to life right after the unlock
        if (bathLight.current) {
            bathFlicker.current = Math.max(0, bathFlicker.current - dt);
            const on = f6.bathOpen;
            bathLight.current.intensity = !on ? 0
                : bathFlicker.current > 0 ? (Math.random() < 0.6 ? 24 : 1.5)
                : 24;
        }

        // tap loop follows the state
        if (f6.tapOn && !tapLoop.current) { tapLoop.current = true; startF6Tap(); }
        if (!f6.tapOn && tapLoop.current) { tapLoop.current = false; stopF6Tap(); }

        // TV static texture (12fps) + its glow
        if (f6.tvOn) {
            staticAccum.current += dt;
            if (staticAccum.current > 1 / 12) {
                staticAccum.current = 0;
                const mm = staticMat as THREE.MeshStandardMaterial & { __cv?: HTMLCanvasElement; __tx?: THREE.CanvasTexture };
                const cv = mm.__cv, tx = mm.__tx;
                if (cv && tx) {
                    const cx = cv.getContext('2d')!;
                    const img = cx.createImageData(64, 48);
                    for (let i = 0; i < img.data.length; i += 4) {
                        const v = Math.random() * 255;
                        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
                    }
                    cx.putImageData(img, 0, 0);
                    tx.needsUpdate = true;
                }
            }
            if (tvLight.current) tvLight.current.intensity = 5 + Math.random() * 4;
        } else if (tvLight.current) tvLight.current.intensity = 0;

        // the guest breathes nearby every few seconds
        if (f6.phase === 'guest' || f6.phase === 'guestIdle') {
            breathTimer.current -= dt;
            if (breathTimer.current <= 0) { breathTimer.current = 4.5 + Math.random() * 3; playF6Breath(0.5); }
        }
        void state;
    });

    const lightsOut = f6.phase === 'blackout';
    const fog01 = Math.min(1, f6.fogT / 6);

    return (
        <group>
            {/* ── shell ── */}
            {/* floors */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.25, 0.001, -1.5]} material={M.carpet}>
                <planeGeometry args={[9.5, 17]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.75, 0.001, -6.5]} material={M.tile}>
                <planeGeometry args={[4.5, 7]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.75, 0.001, 2]} material={M.vinyl}>
                <planeGeometry args={[4.5, 10]} />
            </mesh>
            {/* ceiling */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[-1, F6_CEIL, -1.5]} material={M.ceil}>
                <planeGeometry args={[14, 17]} />
            </mesh>
            {/* walls (match F6_STATIC_WALLS) */}
            <Wall seg={[-8, -10, -8, 7]} />
            <Wall seg={[6, -10, 6, -3]} m={M.tileWall} />
            <Wall seg={[6, -3, 6, 7]} />
            <Wall seg={[-8, 7, 6, 7]} />
            <Wall seg={[-8, -10, -1.3, -10]} />
            <Wall seg={[1.3, -10, 6, -10]} m={M.wall} />
            <Wall seg={[1.5, -10, 1.5, -6.2]} m={M.tileWall} />
            <Wall seg={[1.5, -4.8, 1.5, 2.3]} />
            <Wall seg={[1.5, 3.7, 1.5, 7]} />
            <Wall seg={[1.5, -3, 6, -3]} m={M.tileWall} />
            {/* lintels over the two doorways */}
            <Wall seg={[1.5, -6.2, 1.5, -4.8]} h={F6_CEIL - 2.2} y={2.2} />
            <Wall seg={[1.5, 2.3, 1.5, 3.7]} h={F6_CEIL - 2.2} y={2.2} />
            {/* header over the elevator doorway */}
            <Wall seg={[-1.3, -10, 1.3, -10]} h={F6_CEIL - 2.4} y={2.4} />

            {/* ── bedroom ── */}
            <Bed />
            <Nightstand />
            <Wardrobe open={f6.inv.cabide || f6.inv.chave} />
            <Desk />
            <TvRack on={f6.tvOn} staticMat={staticMat} />
            <CrookedPainting />
            <Window612 />
            {/* room number plate beside the elevator */}
            <mesh position={[-2.2, 2.1, -9.86]}>
                <boxGeometry args={[0.5, 0.2, 0.04]} />
                <meshStandardMaterial color="#2b2b2b" />
            </mesh>

            {/* ── doors ── */}
            <SuiteDoor z={-6.2} open={f6.bathOpen} />
            <SuiteDoor z={2.3} open={f6.kitchenOpen} chain />

            {/* ── locked rooms ── */}
            <Bathroom fog01={fog01} />
            <Kitchen melting={f6.melting} />

            {/* ── the panel ── */}
            <BlownPanel blown={f6.phase !== 'arrive'} sparkRef={sparkRef} />

            {/* ── light rig (three r184: physical units — pointLights in candela) ── */}
            {!lightsOut && (
                <>
                    <hemisphereLight args={['#9a948a', '#4a423a', 0.85]} />
                    {/* abajur warmth */}
                    <pointLight position={[-7.5, 1.15, 4.3]} color="#ffc580" intensity={26} distance={11} decay={2} />
                    {/* dim bedroom ceiling bulb */}
                    <pointLight position={[-3, 2.7, -1]} color="#e8d9b8" intensity={20} distance={16} decay={2} />
                    {/* bathroom fluorescent (flickers alive on unlock) */}
                    <pointLight ref={bathLight} position={[3.75, 2.7, -6.5]} color="#cfe4e8" intensity={0} distance={10} decay={2} />
                    {/* kitchen bulb */}
                    {f6.kitchenOpen && <pointLight position={[3.75, 2.7, 2.5]} color="#f4e2b8" intensity={18} distance={11} decay={2} />}
                    {/* TV glow */}
                    <pointLight ref={tvLight} position={[0.4, 1.1, 1.2]} color="#bcd2da" intensity={0} distance={5} decay={2} />
                </>
            )}
            {lightsOut && <hemisphereLight args={['#1a1a20', '#050507', 0.3]} />}

            {/* ── the guest ── */}
            {(f6.phase === 'guest' || f6.phase === 'guestIdle') && (
                <Floor6Guest playerPositionRef={playerPositionRef} />
            )}
        </group>
    );
};

export default Floor6Suite;
