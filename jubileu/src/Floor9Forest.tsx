/**
 * Floor9Forest.tsx — O VIVEIRO v3: a floresta-catedral do esquecimento,
 * agora ÚMIDA, OPPRESSIVA e BARULHENTA (overhaul "Rain World" — spec B).
 *
 * O que mudou do v2 (o "bosque fofo diurno" morreu):
 *  - COLOR SCRIPT DE 4 FASES (passe de arte D1, brief §1.1): estados-alvo
 *    completos {céu, fog near/far/cor, ambient, hemi, directional, ghost,
 *    névoa} com lerp atual→alvo — calmo (catedral afogada, o mais escuro) →
 *    aviso (bronze/contusão, acompanha a fração do ciclo) → onda (CORTE SECO
 *    pro branco-osso estourado) → renascer (ease-out ~2 s) → calmo (~6 s).
 *    O flash do relâmpago continua somando por cima.
 *  - PALETA SPLIT: sombra FRIA (teal — chão/copas/bordas afundam) × vida
 *    QUENTE/cyan (fio, cogumelos, vagalumes, ocos) — nunca um verde único.
 *  - PROFUNDIDADE EM 4 CAMADAS: L1 moldura escura de 1º plano (anel de
 *    samambaias gigantes quase-pretas + tocos, novo ForegroundFringe), L2
 *    miolo legível do gameplay (fog near 15), L3 dissolução no fog far 54,
 *    L4 ghost-forest (3º anel mais próximo) + teto de copa fechando a nave.
 *  - VERTICALIDADE: 6 troncos-coluna (h 22) somem no teto; ~45 cipós
 *    pendurados (alguns até y≈3) pro olhar subir e descer.
 *  - VIDA: vagalumes maiores perto de musgo/tocas, esporos com 20% de tint
 *    frio, névoa de chão com tint POR FASE, cogumelos em 3 tamanhos (âmbar
 *    só perto dos ocos/raiz — o caminho quente = santuário).
 *  - PÓS-PROCESSAMENTO (só quality 'high', padrão do Floor 3): Bloom +
 *    HueSaturation (−0.12; −0.16 no aviso — o mundo "morre" mais) + Noise
 *    (0.05, "filme úmido") + Vignette (0.30/0.72).
 *  - TEMPESTADE: chuva/splash/poças/relâmpago/parede moram em Floor9Storm;
 *    aqui ficam o VENTO (samambaias e copas balançam por instância) e o
 *    céu compartilhado (f9StormShare.skyMat) que o relâmpago clareia.
 *  - PROFUNDIDADE: anéis de floresta-fantasma além das paredes (silhuetas
 *    gigantes sem fog — na onda elas recortam contra o clarão) + colunas.
 *  - PARTÍCULAS: vagalumes individuais (morrem no aviso), esporos nas
 *    clareiras, névoa de chão em billboards.
 *  - PERF: cogumelos instanciados (de ~115 draws pra 3), fog com cores
 *    cacheadas (sem parse de string por frame), chão usa f9GroundHeight
 *    (fonte única em f9Ground.ts — a fauna pisa no mesmo relevo).
 *  - CONTRATO COM O MOTOR: o useFrame passa `noise` (0..1, da velocidade
 *    real do player) no hunt ctx e dirige o floor9Sfx por fase.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom, Vignette, Noise, HueSaturation } from '@react-three/postprocessing';
import { colorTex, rng } from './Floor6Textures';
import { f9, f9Tick, f9DrainEvents, f9Cacado, F9_OCOS, F9_FIO, F9_RAIZ } from './f9Floresta';
import { f9eco, f9EcoTick, f9EcoDrainEvents, f9CycleFrac, F9_AVISO_AT, F9_TREE_OBSTACLES, type F9CyclePhase } from './f9Eco';
import { Saltitos, Cervos, Vultos, Guardiao, DenMouths, BlobShadows } from './Floor9Fauna';
import { Floor9Storm, f9StormShare } from './Floor9Storm';
import { f9GroundHeight } from './f9Ground';
import { floor9SfxSetPhase, floor9SfxFloresta } from './floor9Sfx';

// ── texturas ─────────────────────────────────────────────────────────────────
const barkTex = colorTex(128, 256, (ctx) => {
    const r = rng(901);
    ctx.fillStyle = '#241d16'; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 26; i++) {
        const x = r() * 128;
        ctx.strokeStyle = `rgba(${10 + r() * 20},${8 + r() * 16},${6 + r() * 10},0.7)`;
        ctx.lineWidth = 1 + r() * 2.5;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (r() - 0.5) * 16, 90, x + (r() - 0.5) * 16, 170, x + (r() - 0.5) * 8, 256);
        ctx.stroke();
    }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(90,110,70,${0.04 + r() * 0.08})`; ctx.fillRect(r() * 128, r() * 256, 2 + r() * 5, 1 + r() * 3); }
});
// textura de chão CLARA (quase-branca com granulação): a COR vem dos vertex
// colors — mapa escuro × cor escura multiplicava pra preto.
const groundTex = colorTex(256, 256, (ctx) => {
    const r = rng(902);
    ctx.fillStyle = '#cfc8b8'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1100; i++) {
        const v = 150 + r() * 100;
        ctx.fillStyle = `rgba(${v},${v - 6 + r() * 12},${v - 14 + r() * 12},${0.4 + r() * 0.3})`;
        ctx.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 3);
    }
    for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = 'rgba(120,108,88,0.5)'; ctx.lineWidth = 1.5 + r() * 3;
        let x = r() * 256, y = r() * 256;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; ctx.lineTo(x, y); }
        ctx.stroke();
    }
}, 8, 8);

// samambaia: fronde pintada (recorte por alpha) — o sub-bosque inteiro usa ela
const fernTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 64, 64);
    const frond = (cx: number, lean: number, h: number, tone: string) => {
        x.strokeStyle = tone; x.lineWidth = 2;
        x.beginPath(); x.moveTo(cx, 64); x.quadraticCurveTo(cx + lean * 8, 64 - h * 0.55, cx + lean * 16, 64 - h);
        x.stroke();
        for (let i = 1; i < 7; i++) {
            const k = i / 7, px = cx + lean * 16 * k * k, py = 64 - h * k;
            const len = (1 - k) * 10 + 3;
            x.lineWidth = 1.4;
            x.beginPath(); x.moveTo(px, py); x.lineTo(px - len, py - len * 0.36); x.stroke();
            x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py - len * 0.3); x.stroke();
        }
    };
    // traços claros: a COR real vem do instanceColor (multiplicação)
    frond(20, -0.4, 52, '#a8c890');
    frond(32, 0.15, 60, '#c0dca4');
    frond(45, 0.5, 46, '#94b884');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
})();

// névoa de chão: mancha radial suave pintada em canvas (billboards aditivos)
const mistTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 32, 2, 64, 32, 62);
    g.addColorStop(0, 'rgba(220,235,210,0.55)');
    g.addColorStop(0.55, 'rgba(200,220,195,0.22)');
    g.addColorStop(1, 'rgba(200,220,195,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
})();

// halo redondo: o "farol" dos cogumelos-mãe (sprites aditivos — brief §3)
const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
})();

const M9 = {
    ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, vertexColors: true }),
    bark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, color: '#8a7a62' }),
    canopy: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    canopyDark: new THREE.MeshStandardMaterial({ color: '#0a140c', roughness: 1, flatShading: true }), // teto mais fechado (brief §1.3)
    moss: new THREE.MeshStandardMaterial({ color: '#3a5a34', roughness: 1, emissive: '#6adf8a', emissiveIntensity: 0.55 }), // tapete sagrado brilha mais (§3)
    thread: new THREE.MeshStandardMaterial({ color: '#c62b32', roughness: 0.6, emissive: '#a01218', emissiveIntensity: 0.7 }),
    fern: new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: '#ffffff' }),
    rock: new THREE.MeshStandardMaterial({ color: '#333c31', roughness: 1, flatShading: true }), // afunda, não compete com o player (§2.L2)
    shroomStem: new THREE.MeshStandardMaterial({ color: '#c8c0a8', roughness: 0.9 }),
    shroomCap: new THREE.MeshStandardMaterial({ color: '#2a8a94', roughness: 0.7, emissive: '#40e0d0', emissiveIntensity: 1.0 }),
    shroomCapAmber: new THREE.MeshStandardMaterial({ color: '#a87a32', roughness: 0.7, emissive: '#ffb84a', emissiveIntensity: 0.9 }),
    ocoGlow: new THREE.MeshBasicMaterial({ color: '#ffca7a' }),
    ghost: new THREE.MeshBasicMaterial({ color: '#121d16', fog: false }), // floresta-fantasma: silhueta além do fog (clareada p/ recortar no breu — brief §5.11; a cor é dirigida pela fase no color script)
};

// halos aditivos dos cogumelos-mãe (brief §3: faróis do escuro, op 0.10)
const haloMatCyan = new THREE.SpriteMaterial({ map: haloTex, color: '#40e0d0', transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending });
const haloMatAmber = new THREE.SpriteMaterial({ map: haloTex, color: '#ffb84a', transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending });

// o céu acima da copa: material ÚNICO, registrado pro relâmpago clarear.
// A COR é dirigida pelo color script de fase (calmo #7e9a82 — brief §1.1);
// o Storm escreve POR CIMA só durante o clarão (contrato f9StormShare).
const skyMat = new THREE.MeshBasicMaterial({ color: '#7e9a82', fog: false });
f9StormShare.skyMat = skyMat;

// ── COLOR SCRIPT DE 4 FASES (brief §1.1 — a tabela-mestra) ──────────────────
// 4 estados-alvo completos; a cena lerpa `atual → alvo` a dt*2.5. Transições:
// calmo→aviso SUAVE (o alvo mistura calmo×aviso pela fração do ciclo), aviso→
// onda CORTE SECO (snap quando a fase vira 'onda'), onda→renascer ease-out
// ~2 s (rate 1.4), renascer→calmo ease ~6 s (rate 0.55). O flash do relâmpago
// SOMA por cima. Isso remove o ajuste à mão de cada luz por fase.
interface F9Look {
    sky: THREE.Color; fog: THREE.Color; near: number; far: number;
    amb: THREE.Color; ambI: number;
    hemiSky: THREE.Color; hemiGnd: THREE.Color; hemiI: number;
    dir: THREE.Color; dirI: number;
    ghost: THREE.Color; mist: THREE.Color;
}
type F9LookSpec = { [K in keyof F9Look]: F9Look[K] extends THREE.Color ? string : number };
const mkLook = (o: F9LookSpec): F9Look => ({
    sky: new THREE.Color(o.sky), fog: new THREE.Color(o.fog), near: o.near, far: o.far,
    amb: new THREE.Color(o.amb), ambI: o.ambI,
    hemiSky: new THREE.Color(o.hemiSky), hemiGnd: new THREE.Color(o.hemiGnd), hemiI: o.hemiI,
    dir: new THREE.Color(o.dir), dirI: o.dirI,
    ghost: new THREE.Color(o.ghost), mist: new THREE.Color(o.mist),
});
const F9_LOOKS: Record<F9CyclePhase, F9Look> = {
    calmo: mkLook({ sky: '#7e9a82', fog: '#101d18', near: 15, far: 54, amb: '#5f7a66', ambI: 0.38, hemiSky: '#8aa88f', hemiGnd: '#1c2a20', hemiI: 0.5, dir: '#cfe0bd', dirI: 0.75, ghost: '#121d16', mist: '#a8c8b4' }),
    aviso: mkLook({ sky: '#a8a06a', fog: '#4a4630', near: 13, far: 40, amb: '#8a7a52', ambI: 0.42, hemiSky: '#a89a5e', hemiGnd: '#2a2416', hemiI: 0.5, dir: '#d8c88a', dirI: 0.6, ghost: '#1a2216', mist: '#b0a86a' }),
    onda: mkLook({ sky: '#eef4e4', fog: '#e6eee0', near: 9, far: 28, amb: '#c8d4c0', ambI: 1.05, hemiSky: '#e4ecd8', hemiGnd: '#8a9480', hemiI: 0.95, dir: '#f2f8ea', dirI: 1.1, ghost: '#1a2a20', mist: '#e6eee0' }),
    renascer: mkLook({ sky: '#cfe0c2', fog: '#b9c8b2', near: 15, far: 50, amb: '#9ab098', ambI: 0.5, hemiSky: '#b9cdae', hemiGnd: '#3a4434', hemiI: 0.6, dir: '#e8efd6', dirI: 0.7, ghost: '#22301f', mist: '#bcd0b6' }),
};
const cloneLook = (a: F9Look): F9Look => ({
    sky: a.sky.clone(), fog: a.fog.clone(), near: a.near, far: a.far,
    amb: a.amb.clone(), ambI: a.ambI,
    hemiSky: a.hemiSky.clone(), hemiGnd: a.hemiGnd.clone(), hemiI: a.hemiI,
    dir: a.dir.clone(), dirI: a.dirI,
    ghost: a.ghost.clone(), mist: a.mist.clone(),
});
const copyLook = (dst: F9Look, src: F9Look): void => {
    dst.sky.copy(src.sky); dst.fog.copy(src.fog); dst.near = src.near; dst.far = src.far;
    dst.amb.copy(src.amb); dst.ambI = src.ambI;
    dst.hemiSky.copy(src.hemiSky); dst.hemiGnd.copy(src.hemiGnd); dst.hemiI = src.hemiI;
    dst.dir.copy(src.dir); dst.dirI = src.dirI;
    dst.ghost.copy(src.ghost); dst.mist.copy(src.mist);
};
const mixLook = (dst: F9Look, a: F9Look, b: F9Look, w: number): void => {
    dst.sky.copy(a.sky).lerp(b.sky, w); dst.fog.copy(a.fog).lerp(b.fog, w);
    dst.near = a.near + (b.near - a.near) * w; dst.far = a.far + (b.far - a.far) * w;
    dst.amb.copy(a.amb).lerp(b.amb, w); dst.ambI = a.ambI + (b.ambI - a.ambI) * w;
    dst.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, w); dst.hemiGnd.copy(a.hemiGnd).lerp(b.hemiGnd, w);
    dst.hemiI = a.hemiI + (b.hemiI - a.hemiI) * w;
    dst.dir.copy(a.dir).lerp(b.dir, w); dst.dirI = a.dirI + (b.dirI - a.dirI) * w;
    dst.ghost.copy(a.ghost).lerp(b.ghost, w); dst.mist.copy(a.mist).lerp(b.mist, w);
};
const lerpLook = (dst: F9Look, target: F9Look, k: number): void => { mixLook(dst, dst, target, k); };

/** o color script escreve; a GroundMist lê (sem traversal de cena por frame). */
const f9ForestShare = { mistTint: new THREE.Color('#a8c8b4') };

const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);

// util: geometria com jitter de vértice (copas/pedras orgânicas)
function jittered(geo: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
    const r = rng(seed);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i,
            pos.getX(i) + (r() - 0.5) * amt,
            pos.getY(i) + (r() - 0.5) * amt,
            pos.getZ(i) + (r() - 0.5) * amt);
    }
    geo.computeVertexNormals();
    return geo;
}

const dist2 = (ax: number, az: number, bx: number, bz: number) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

/** perto demais de trilha/clareira/oco? (pra flora não bloquear o jogo) */
function nearGameplay(x: number, z: number, margin: number): boolean {
    if (Math.hypot(x, z + 2) < 5 + margin) return true;
    for (const [fx, fz] of F9_FIO) if (dist2(x, z, fx, fz) < (1.7 + margin) ** 2) return true;
    for (const [ox, oz] of F9_OCOS) if (dist2(x, z, ox, oz) < (2.8 + margin) ** 2) return true;
    if (dist2(x, z, F9_RAIZ[0], F9_RAIZ[1] - 2.5) < (4.5 + margin) ** 2) return true;
    return false;
}

/**
 * Quality sem depender do SettingsProvider (o bench floor9-dev monta a cena
 * FORA dele): espelha o loadSettings de Settings.tsx — lê a mesma chave do
 * localStorage com o mesmo fallback (mobile → medium, desktop → high).
 */
type F9Quality = 'low' | 'medium' | 'high';
function f9Quality(): F9Quality {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jubileu_settings_v1') : null;
        if (raw) {
            const q = (JSON.parse(raw) as { quality?: string }).quality;
            if (q === 'low' || q === 'medium' || q === 'high') return q;
        }
    } catch { /* ignora */ }
    const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');
    return mobile ? 'medium' : 'high';
}

// ── o CHÃO vivo: heightfield com vertex colors (relevo vem de f9Ground.ts) ───
const Ground: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.PlaneGeometry(78, 66, 78, 56);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0, -23);
        const r = rng(905);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const colors = new Float32Array(pos.count * 3);
        // paleta encharcada e FRIA (brief §1.2): terra/musgo puxam pro teal,
        // bordas afundam em sombra fria — o contraste vem do chão, não só da luz
        const cDirt = new THREE.Color('#54483a');
        const cMoss = new THREE.Color('#2c4a32');
        const cTrail = new THREE.Color('#6b5f47');
        const cMossHot = new THREE.Color('#3f7a3c');
        const cEdge = new THREE.Color('#141d16');
        const col = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            // FONTE ÚNICA do relevo (a fauna/as poças pisam no mesmo chão)
            const h = f9GroundHeight(x, z);
            pos.setY(i, h);
            // corredor do fio (pra cor da trilha gasta — mesma margem do relevo)
            let trailK = 0;
            for (const [fx, fz] of F9_FIO) {
                const d = Math.hypot(x - fx, z - fz);
                if (d < 3.4) trailK = Math.max(trailK, 1 - d / 3.4);
            }
            const edge = Math.max(Math.max(0, Math.abs(x) - 27) / 7, Math.max(0, (z < -24 ? -46 - z : z + 2)) / 7);
            // cor: terra↔musgo por ruído; trilha gasta; musgo saturado nos patches
            const noise = 0.5 + 0.5 * Math.sin(x * 0.53 + z * 0.71 + Math.sin(x * 0.13) * 2);
            col.copy(cDirt).lerp(cMoss, noise * 0.85);
            if (trailK > 0) col.lerp(cTrail, Math.min(1, trailK * 1.15) * 0.8);
            for (const m of f9eco.moss) {
                const d = Math.hypot(x - m.x, z - m.z);
                if (d < 3.2) col.lerp(cMossHot, (1 - d / 3.2) * 0.7);
            }
            if (edge > 0.15) col.lerp(cEdge, Math.min(1, edge));
            // salpico
            const s = (r() - 0.5) * 0.06;
            colors[i * 3] = col.r + s; colors[i * 3 + 1] = col.g + s; colors[i * 3 + 2] = col.b + s;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.computeVertexNormals();
        return g;
    }, []);
    useEffect(() => () => geo.dispose(), [geo]);
    return <mesh geometry={geo} material={M9.ground} />;
};

// ── as ÁRVORES v3: copas orgânicas que BALANÇAM no vento, mães com raízes ────
const Trees: React.FC<{ sway: boolean }> = ({ sway }) => {
    const built = useMemo(() => {
        const r = rng(910);
        const spots: Array<[number, number, number]> = [];
        for (let i = 0; i < 400 && spots.length < 240; i++) {
            const x = (r() * 2 - 1) * 33, z = -52 + r() * 57;
            if (nearGameplay(x, z, 0.4) && r() < 0.85) continue;
            // adensa nas bordas (paredes de floresta)
            const edge = Math.max(Math.abs(x) / 33, (z < -24 ? (-z - 24) / 28 : (z + 2) / 6));
            if (edge < 0.55 && r() < 0.45) continue;
            spots.push([x, z, 0.62 + r() * 1.35]);
        }
        const n = spots.length;
        const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 7.6, 7);
        const canopyGeos = [
            jittered(new THREE.IcosahedronGeometry(1.55, 1), 0.55, 41),
            jittered(new THREE.IcosahedronGeometry(1.3, 1), 0.62, 42),
            jittered(new THREE.IcosahedronGeometry(1.1, 1), 0.5, 43),
        ];
        const trunks = new THREE.InstancedMesh(trunkGeo, M9.bark, n);
        const canopies = canopyGeos.map((gg) => {
            const cm = new THREE.InstancedMesh(gg, M9.canopy, n);
            cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            return cm;
        });
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        // copas como MASSA ESCURA recortando contra o céu doente (brief §1.3)
        const cA = new THREE.Color('#0d1a10'), cB = new THREE.Color('#1a3a24'), cC = new THREE.Color('#12302a'), mix = new THREE.Color();
        // base das copas (pro vento reescrever por frame sem guardar Matrix4)
        const basePos: THREE.Vector3[][] = [[], [], []];
        const baseSc: number[][] = [[], [], []];
        const baseRot: THREE.Euler[][] = [[], [], []];
        spots.forEach(([x, z, s], i) => {
            const lean = (r() - 0.5) * 0.12;
            eu.set(lean, r() * Math.PI * 2, (r() - 0.5) * 0.12); q.setFromEuler(eu);
            pos.set(x, 3.8 * s, z); sc.set(s * (0.85 + r() * 0.4), s, s * (0.85 + r() * 0.4));
            m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4);
            // 3 massas de copa desalinhadas por árvore, cores individuais
            mix.copy(cA).lerp(r() < 0.5 ? cB : cC, r());
            canopies.forEach((cm, ci) => {
                const off = 0.9 + ci * 0.7;
                const bp = new THREE.Vector3(x + (r() - 0.5) * 1.6 * s, (6.2 + ci * 1.05) * s, z + (r() - 0.5) * 1.6 * s);
                const bs = s * (off * 0.85 + r() * 0.5);
                const br = new THREE.Euler(r() * 0.6, r() * Math.PI * 2, r() * 0.6);
                basePos[ci].push(bp); baseSc[ci].push(bs); baseRot[ci].push(br);
                q.setFromEuler(br);
                m4.compose(bp, q, sc.setScalar(bs)); cm.setMatrixAt(i, m4);
                cm.setColorAt(i, mix.clone().offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.05));
            });
        });
        trunks.instanceMatrix.needsUpdate = true;
        canopies.forEach((cm) => { cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true; });
        return { trunks, canopies, basePos, baseSc, baseRot, n, all: [trunkGeo, ...canopyGeos] };
    }, []);
    useEffect(() => () => built.all.forEach((g) => g.dispose()), [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        if (!sway) return; // quality baixa: copas estáticas (720 matrizes poupadas)
        const t = clock.elapsedTime;
        const { canopies, basePos, baseSc, baseRot, n } = built;
        const { m4, q, e, s } = scratch;
        // vento: cresce no aviso e DESABA na onda
        const amp = 0.015 + (f9eco.phase === 'aviso' ? 0.035 : 0) + (f9eco.phase === 'onda' ? 0.06 : 0);
        if (amp < 0.02) return;
        for (let ci = 0; ci < canopies.length; ci++) {
            const cm = canopies[ci];
            for (let i = 0; i < n; i++) {
                const br = baseRot[ci][i];
                e.set(
                    br.x + Math.sin(t * 1.3 + i * 0.71 + ci * 2.1) * amp,
                    br.y,
                    br.z + Math.sin(t * 1.7 + i * 1.13 + ci) * amp,
                );
                q.setFromEuler(e);
                m4.compose(basePos[ci][i], q, s.setScalar(baseSc[ci][i]));
                cm.setMatrixAt(i, m4);
            }
            cm.instanceMatrix.needsUpdate = true;
        }
    });
    return (<>
        <primitive object={built.trunks} />
        {built.canopies.map((cm, i) => <primitive key={i} object={cm} />)}
        {/* as ÁRVORES-MÃE (as mesmas que a IA desvia): troncos grossos + raízes */}
        {F9_TREE_OBSTACLES.map(([x, z, rr], i) => (
            <group key={i} position={[x, 0, z]}>
                <mesh position={[0, 4.6, 0]} material={M9.bark}><cylinderGeometry args={[rr * 0.55, rr, 9.2, 9]} /></mesh>
                {[0, 1, 2, 3, 4].map((k) => {
                    const a = (k / 5) * Math.PI * 2 + i;
                    return <mesh key={k} position={[Math.cos(a) * rr * 1.15, 0.42, Math.sin(a) * rr * 1.15]} rotation={[0, -a, 1.05]} material={M9.bark}><cylinderGeometry args={[0.1, rr * 0.42, 1.7, 5]} /></mesh>;
                })}
                <mesh position={[0, 9.4, 0]} material={M9.canopyDark}><icosahedronGeometry args={[2.6 + (i % 3) * 0.5, 1]} /></mesh>
            </group>
        ))}
    </>);
};

// ── SUB-BOSQUE: samambaias (com vento) + pedras + cogumelos INSTANCIADOS ─────
// brief §2.L2: 560 frondes em 2 faixas de tamanho (a variedade de escala é o
// que vende "mundo grande"); quality low reduz pra ~300 e desliga o vento.
const Undergrowth: React.FC<{ low: boolean; sway: boolean }> = ({ low, sway }) => {
    const built = useMemo(() => {
        const r = rng(912);
        // samambaias (planos únicos) — agora com base guardada pro vento
        const fGeo = new THREE.PlaneGeometry(1.15, 1.05);
        fGeo.translate(0, 0.5, 0);
        const nF = low ? 300 : 560;
        const ferns = new THREE.InstancedMesh(fGeo, M9.fern, nF);
        ferns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        const fA = new THREE.Color('#55804a'), fB = new THREE.Color('#3e6236'), fC = new THREE.Color('#719153');
        const fBase: Array<[number, number, number, number, number, number]> = []; // x,z,sc,rotY,tiltX,tiltZ
        let fi = 0;
        for (let i = 0; i < 2200 && fi < nF; i++) {
            const x = (r() * 2 - 1) * 32, z = -50 + r() * 54;
            if (nearGameplay(x, z, -0.4) && r() < 0.8) continue;
            const tx = (r() - 0.5) * 0.2, ry = r() * Math.PI * 2, tz = (r() - 0.5) * 0.15;
            // 2 faixas: 60% normal (0.55–1.1) · 40% "samambaia-mãe" (1.4–2.2)
            const s = r() < 0.4 ? 1.4 + r() * 0.8 : 0.55 + r() * 0.55;
            eu.set(tx, ry, tz); q.setFromEuler(eu);
            pos.set(x, f9GroundHeight(x, z), z); sc.setScalar(s);
            m4.compose(pos, q, sc); ferns.setMatrixAt(fi, m4);
            ferns.setColorAt(fi, (r() < 0.5 ? fA : r() < 0.5 ? fB : fC).clone().offsetHSL(0, 0, (r() - 0.5) * 0.08));
            fBase.push([x, z, s, ry, tx, tz]);
            fi++;
        }
        ferns.count = fi;
        // pedras
        const rGeo = jittered(new THREE.IcosahedronGeometry(0.5, 0), 0.22, 77);
        const nR = 60;
        const rocks = new THREE.InstancedMesh(rGeo, M9.rock, nR);
        let ri = 0;
        for (let i = 0; i < 300 && ri < nR; i++) {
            const x = (r() * 2 - 1) * 32, z = -50 + r() * 54;
            if (nearGameplay(x, z, 0)) continue;
            eu.set(r() * Math.PI, r() * Math.PI, 0); q.setFromEuler(eu);
            pos.set(x, f9GroundHeight(x, z) + 0.1, z); sc.set(0.4 + r() * 1.3, 0.3 + r() * 0.7, 0.4 + r() * 1.3);
            m4.compose(pos, q, sc); rocks.setMatrixAt(ri, m4);
            ri++;
        }
        rocks.count = ri;
        ferns.instanceMatrix.needsUpdate = true; if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
        rocks.instanceMatrix.needsUpdate = true;
        // ── COGUMELOS INSTANCIADOS: era 46 grupos × 2–3 meshes (~115 draws);
        //    agora caule (1) + chapéus cyan (1) + chapéus âmbar (1) = 3 draws ──
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.32, 6);
        stemGeo.translate(0, 0.16, 0);
        const capGeo = new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
        const spots: Array<[number, number, number, boolean, number]> = []; // x,z,s,cyan,rotY
        for (let i = 0; i < 600 && spots.length < 64; i++) {
            const x = (r() * 2 - 1) * 31, z = -49 + r() * 52;
            if (nearGameplay(x, z, -0.6) && r() < 0.7) continue;
            // 3 tamanhos (brief §3): ~85% normal 0.5–0.9 · ~15% "mãe" 1.2–1.8
            const s = r() < 0.15 ? 1.2 + r() * 0.6 : 0.5 + r() * 0.4;
            // o ÂMBAR é espacialmente significativo: só nasce perto dos ocos/
            // raiz (caminho quente = santuário); todo o resto é cyan
            let pertoSantuario = dist2(x, z, F9_RAIZ[0], F9_RAIZ[1]) < 36;
            if (!pertoSantuario) for (const [ox, oz] of F9_OCOS) { if (dist2(x, z, ox, oz) < 36) { pertoSantuario = true; break; } }
            spots.push([x, z, s, !(pertoSantuario && r() < 0.55), r() * Math.PI * 2]);
        }
        // contagem EXATA por cor (cada cogumelo: 1 chapéu; os pares +1 filhote)
        let nCyan = 0;
        spots.forEach((sp, i) => { if (sp[3]) nCyan += 1 + (i % 2 === 0 ? 1 : 0); });
        const nAmber = spots.length + spots.filter((_, i) => i % 2 === 0).length - nCyan;
        const stems = new THREE.InstancedMesh(stemGeo, M9.shroomStem, spots.length);
        const capsCyan = new THREE.InstancedMesh(capGeo, M9.shroomCap, nCyan);
        const capsAmber = new THREE.InstancedMesh(capGeo, M9.shroomCapAmber, nAmber);
        let ciC = 0, ciA = 0;
        spots.forEach(([x, z, s, cyan, ry], i) => {
            const gy = f9GroundHeight(x, z);
            eu.set(0, ry, 0); q.setFromEuler(eu);
            pos.set(x, gy, z); sc.setScalar(s);
            m4.compose(pos, q, sc); stems.setMatrixAt(i, m4);
            pos.set(x, gy + 0.34 * s, z);
            m4.compose(pos, q, sc);
            if (cyan) capsCyan.setMatrixAt(ciC++, m4); else capsAmber.setMatrixAt(ciA++, m4);
            if (i % 2 === 0) { // o filhotinho do lado (sem caule, como antes)
                const bx = x + (Math.cos(ry) * 0.2 + Math.sin(ry) * 0.06) * s;
                const bz = z + (-Math.sin(ry) * 0.2 + Math.cos(ry) * 0.06) * s;
                pos.set(bx, gy + 0.1 * s, bz); sc.setScalar(s * 0.55);
                m4.compose(pos, q, sc);
                if (cyan) capsCyan.setMatrixAt(ciC++, m4); else capsAmber.setMatrixAt(ciA++, m4);
                sc.setScalar(s);
            }
        });
        stems.instanceMatrix.needsUpdate = true;
        capsCyan.instanceMatrix.needsUpdate = true; capsAmber.instanceMatrix.needsUpdate = true;
        // os 8 MAIORES viram farol (halo aditivo) — NUNCA na faixa do fio,
        // pra não confundir com o objetivo (brief §3: luz grande = marco)
        const halos = spots
            .filter(([x, z]) => !nearGameplay(x, z, 0))
            .sort((a, b) => b[2] - a[2])
            .slice(0, 8)
            .map(([x, z, s, cyan]) => ({ x, z, y: f9GroundHeight(x, z) + 0.34 * s + 0.12, cyan }));
        // troncos caídos
        const logs: Array<[number, number, number, number]> = [];
        for (let i = 0; i < 200 && logs.length < 7; i++) {
            const x = (r() * 2 - 1) * 28, z = -46 + r() * 46;
            if (nearGameplay(x, z, 1.6)) continue;
            logs.push([x, z, r() * Math.PI, 2.4 + r() * 2.2]);
        }
        return { ferns, fBase, rocks, stems, capsCyan, capsAmber, halos, logs, geos: [fGeo, rGeo, stemGeo, capGeo] };
    }, [low]);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        if (!sway) return; // quality baixa: sub-bosque estático (brief §7)
        // VENTO no sub-bosque: cada fronde balança defasada (sin(t*3+i))
        const t = clock.elapsedTime;
        const { ferns, fBase } = built;
        const { m4, q, e, p, s } = scratch;
        const amp = 0.04 + (f9eco.phase === 'aviso' ? 0.09 : 0) + (f9eco.phase === 'onda' ? 0.16 : 0);
        for (let i = 0; i < fBase.length; i++) {
            const [x, z, sc0, ry, tx, tz] = fBase[i];
            e.set(tx + Math.sin(t * 3 + i * 1.31) * amp * 0.5, ry, tz + Math.sin(t * 3 + i * 1.7) * amp);
            q.setFromEuler(e);
            p.set(x, f9GroundHeight(x, z), z); s.setScalar(sc0);
            m4.compose(p, q, s);
            ferns.setMatrixAt(i, m4);
        }
        ferns.instanceMatrix.needsUpdate = true;
    });
    return (<>
        <primitive object={built.ferns} />
        <primitive object={built.rocks} />
        <primitive object={built.stems} />
        <primitive object={built.capsCyan} />
        <primitive object={built.capsAmber} />
        {/* os faróis: halo aditivo nos 8 cogumelos-mãe (longe da faixa do fio) */}
        {built.halos.map((h, i) => (
            <sprite key={'h' + i} position={[h.x, h.y, h.z]} material={h.cyan ? haloMatCyan : haloMatAmber} scale={[1.6, 1.6, 1]} />
        ))}
        {built.logs.map(([x, z, a, len], i) => (
            <group key={'l' + i} position={[x, f9GroundHeight(x, z) + 0.32, z]} rotation={[0, a, (i % 2 ? 0.04 : -0.05)]}>
                <mesh rotation={[0, 0, Math.PI / 2]} material={M9.bark}><cylinderGeometry args={[0.34, 0.4, len, 8]} /></mesh>
                <mesh position={[len * 0.2, 0.3, 0]} scale={[1, 0.4, 1]} material={M9.moss}><sphereGeometry args={[0.4, 7, 6]} /></mesh>
            </group>
        ))}
    </>);
};

// ── L1 · PRIMEIRO PLANO (a moldura escura — brief §2): anel de samambaias
//    GIGANTES quase-pretas ao redor do spawn + "portais" flanqueando o fio +
//    tocos/raízes baixos. Rain World sempre tem uma silhueta escura recortando
//    a base do quadro: dá escala (o Fiapo é menor que uma fronde) e profundidade
//    imediata. NUNCA em cima do fio/ocos nem tapando o cone central da câmera. ──
const ForegroundFringe: React.FC<{ low: boolean; sway: boolean }> = ({ low, sway }) => {
    const built = useMemo(() => {
        const r = rng(918);
        const fGeo = new THREE.PlaneGeometry(1.15, 1.05);
        fGeo.translate(0, 0.5, 0);
        const nF = low ? 24 : 50;
        const ferns = new THREE.InstancedMesh(fGeo, M9.fern, nF);
        ferns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        const dark = new THREE.Color('#0a120c');
        // bloqueia só fio/ocos/raiz — o ANEL do spawn é querido (o brief manda
        // moldar o spawn), mas a trilha e os marcos de gameplay ficam livres
        const blocked = (x: number, z: number): boolean => {
            for (const [fx, fz] of F9_FIO) if (dist2(x, z, fx, fz) < 2.1 * 2.1) return true;
            for (const [ox, oz] of F9_OCOS) if (dist2(x, z, ox, oz) < 3.4 * 3.4) return true;
            if (dist2(x, z, F9_RAIZ[0], F9_RAIZ[1] - 2.5) < 5 * 5) return true;
            return false;
        };
        const fBase: Array<[number, number, number, number, number, number]> = []; // x,z,sc,rotY,tiltX,tiltZ
        let fi = 0, guard = 0;
        const putFern = (x: number, z: number): void => {
            const tx = (r() - 0.5) * 0.16, ry = r() * Math.PI * 2, tz = (r() - 0.5) * 0.12;
            const s = 1.6 + r() * 0.8; // 1.6–2.4× a normal: o Fiapo é MENOR que uma fronde
            eu.set(tx, ry, tz); q.setFromEuler(eu);
            pos.set(x, f9GroundHeight(x, z), z); sc.setScalar(s);
            m4.compose(pos, q, sc); ferns.setMatrixAt(fi, m4);
            ferns.setColorAt(fi, dark);
            fBase.push([x, z, s, ry, tx, tz]);
            fi++;
        };
        // ~60% em anel de raio 3.5–8 ao redor do spawn [0,-1.5]
        while (fi < Math.ceil(nF * 0.6) && guard++ < 400) {
            const a = r() * Math.PI * 2, rr = 3.5 + r() * 4.5;
            const x = Math.cos(a) * rr, z = -1.5 + Math.sin(a) * rr;
            if (blocked(x, z)) continue;
            putFern(x, z);
        }
        // ~40% em "portais" flanqueando o fio (±2.2–3.1 na perpendicular do segmento)
        guard = 0;
        while (fi < nF && guard++ < 400) {
            const idx = 1 + Math.floor(r() * (F9_FIO.length - 2));
            const [fx, fz] = F9_FIO[idx];
            const [nx, nz] = F9_FIO[idx + 1];
            const dx = nx - fx, dz = nz - fz, dl = Math.hypot(dx, dz) || 1;
            const side = r() < 0.5 ? 1 : -1, off = 2.2 + r() * 0.9;
            const x = fx + (dz / dl) * off * side + (r() - 0.5) * 1.4;
            const z = fz - (dx / dl) * off * side + (r() - 0.5) * 1.4;
            if (blocked(x, z)) continue;
            putFern(x, z);
        }
        ferns.count = fi;
        // tocos/raízes baixos (~20): a moldura também vem de baixo
        const sGeo = new THREE.CylinderGeometry(0.16, 0.36, 0.9, 7);
        const nS = low ? 10 : 20;
        const stumps = new THREE.InstancedMesh(sGeo, M9.bark, nS);
        const sDark = new THREE.Color('#0d0f0a');
        let si = 0; guard = 0;
        while (si < nS && guard++ < 300) {
            const a = r() * Math.PI * 2, rr = 3.2 + r() * 4.6;
            const x = Math.cos(a) * rr, z = -1.5 + Math.sin(a) * rr;
            if (blocked(x, z)) continue;
            eu.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3); q.setFromEuler(eu);
            pos.set(x, f9GroundHeight(x, z) + 0.3, z); sc.set(0.7 + r() * 0.7, 0.7 + r() * 0.9, 0.7 + r() * 0.7);
            m4.compose(pos, q, sc); stumps.setMatrixAt(si, m4);
            stumps.setColorAt(si, sDark);
            si++;
        }
        stumps.count = si;
        ferns.instanceMatrix.needsUpdate = true; if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
        stumps.instanceMatrix.needsUpdate = true; if (stumps.instanceColor) stumps.instanceColor.needsUpdate = true;
        return { ferns, fBase, stumps, geos: [fGeo, sGeo] };
    }, [low]);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        if (!sway) return; // quality baixa: moldura estática (brief §7)
        const t = clock.elapsedTime;
        const { ferns, fBase } = built;
        const { m4, q, e, p, s } = scratch;
        // vento contido (perto da câmera, gesto grande distrai): 60% do sub-bosque
        const amp = (0.04 + (f9eco.phase === 'aviso' ? 0.09 : 0) + (f9eco.phase === 'onda' ? 0.16 : 0)) * 0.6;
        for (let i = 0; i < fBase.length; i++) {
            const [x, z, sc0, ry, tx, tz] = fBase[i];
            e.set(tx + Math.sin(t * 2.6 + i * 1.31) * amp * 0.5, ry, tz + Math.sin(t * 2.6 + i * 1.7) * amp);
            q.setFromEuler(e);
            p.set(x, f9GroundHeight(x, z), z); s.setScalar(sc0);
            m4.compose(p, q, s);
            ferns.setMatrixAt(i, m4);
        }
        ferns.instanceMatrix.needsUpdate = true;
    });
    return (<>
        <primitive object={built.ferns} />
        <primitive object={built.stumps} />
    </>);
};

// clareiras deliberadas do teto de copa (os feixes descem nelas; os esporos
// se concentram nelas) — module-scope pra Spores ler sem prop drilling.
const CANOPY_GAPS: ReadonlyArray<readonly [number, number]> = [[0, -2], [-10, -18], [12, -26], [-4, -38], [7, -46]];

// ── o TETO de copa com clareiras + brilho de céu + feixes + luz salpicada ────
// brief §2.L4: o teto fecha a "nave da catedral" — 72 blobs a y≈9.6, com
// PAREDES de copa descendo até y≈7 nas bordas (|x|>27); as 5 clareiras ficam
// abertas (a luz precisa vazar). Cipós instanciados (~45) descem do teto —
// alguns quase tocam o chão (verticalidade: o olhar sobe e desce).
const CanopyAndLight: React.FC<{ low: boolean }> = ({ low }) => {
    const built = useMemo(() => {
        const r = rng(915);
        const geo = jittered(new THREE.IcosahedronGeometry(4.4, 1), 1.5, 55);
        const n = 72;
        const blobs = new THREE.InstancedMesh(geo, M9.canopyDark, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        let bi = 0;
        for (let i = 0; i < 360 && bi < n; i++) {
            const x = (r() * 2 - 1) * 36, z = -54 + r() * 62;
            let inGap = false;
            for (const [gx, gz] of CANOPY_GAPS) if (dist2(x, z, gx, gz) < 30) { inGap = true; break; }
            if (inGap) continue;
            const edge = Math.abs(x) > 27; // parede da catedral: a copa DESCE nas laterais
            eu.set(r() * Math.PI, r() * Math.PI, 0); q.setFromEuler(eu);
            pos.set(x, edge ? 7 + r() * 1.6 : 9.6 + r() * 1.4, z);
            sc.set(0.8 + r() * 0.9, edge ? 0.7 + r() * 0.6 : 0.4 + r() * 0.35, 0.8 + r() * 0.9);
            m4.compose(pos, q, sc); blobs.setMatrixAt(bi, m4);
            bi++;
        }
        blobs.count = bi;
        blobs.instanceMatrix.needsUpdate = true;
        // ── cipós INSTANCIADOS (era 15 meshes soltos): pendurados nas bordas
        //    das clareiras; ~1/3 é comprido e desce até y≈3 ──
        const nV = low ? 15 : 45;
        const vineGeo = new THREE.CylinderGeometry(0.03, 0.015, 1, 4);
        vineGeo.translate(0, -0.5, 0); // origem no TOPO: pos.y = onde pendura, escala y = comprimento
        const vines = new THREE.InstancedMesh(vineGeo, M9.moss, nV);
        let vi = 0;
        for (let g = 0; g < CANOPY_GAPS.length && vi < nV; g++) {
            const [gx, gz] = CANOPY_GAPS[g];
            const per = Math.ceil(nV / CANOPY_GAPS.length);
            for (let k = 0; k < per && vi < nV; k++) {
                const a = g * 2 + k * (Math.PI * 2 / per) + (r() - 0.5) * 0.7;
                const rr = 3.0 + r() * 2.2;
                const topY = 8.6 + r() * 1.2;
                const len = r() < 0.33 ? 4.8 + r() * 1.8 : 2.2 + r() * 2.3; // alguns quase tocam o chão (y≈3)
                eu.set((r() - 0.5) * 0.14, 0, (r() - 0.5) * 0.14); q.setFromEuler(eu);
                pos.set(gx + Math.cos(a) * rr, topY, gz + Math.sin(a) * rr);
                sc.set(0.8 + r() * 0.6, len, 0.8 + r() * 0.6);
                m4.compose(pos, q, sc); vines.setMatrixAt(vi, m4);
                vi++;
            }
        }
        vines.count = vi;
        vines.instanceMatrix.needsUpdate = true;
        return { blobs, vines, geo, vineGeo, gaps: CANOPY_GAPS };
    }, [low]);
    useEffect(() => () => { built.geo.dispose(); built.vineGeo.dispose(); }, [built]);
    const rays = useRef<THREE.Group>(null!);
    const pools = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock, camera }) => {
        const t = clock.elapsedTime;
        if (rays.current) rays.current.children.forEach((c, i) => {
            const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
            // dentro do cone (a câmera está NA clareira) o feixe apaga — senão
            // ele lava a tela inteira de branco (visto de fora: luz que CAI)
            const gx = built.gaps[i][0], gz = built.gaps[i][1];
            const dCam = Math.hypot(camera.position.x - gx, camera.position.z - gz);
            const inside = Math.min(1, Math.max(0, (dCam - 2.4) / 2.6));
            m.opacity = (0.13 + Math.sin(t * 0.27 + i * 2.1) * 0.04) * (0.12 + 0.88 * inside); // a luz CAI e se lê (brief §5.10)
        });
        pools.current.forEach((p, i) => {
            if (!p) return;
            p.position.x = built.gaps[i % built.gaps.length][0] + Math.sin(t * 0.11 + i * 2) * 1.6;
            p.position.z = built.gaps[i % built.gaps.length][1] + Math.cos(t * 0.09 + i * 3) * 1.4;
            (p.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 0.4 + i) * 0.035;
        });
    });
    return (<>
        {/* o céu doente acima da copa (era verde-claro alegre) — o relâmpago
            clareia ESTE material via f9StormShare.skyMat */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 13.4, -23]} material={skyMat}>
            <planeGeometry args={[84, 70]} />
        </mesh>
        <primitive object={built.blobs} />
        <primitive object={built.vines} />
        {/* feixes descendo das clareiras */}
        <group ref={rays}>
            {built.gaps.map(([x, z], i) => (
                <mesh key={i} position={[x, 5.6, z]} rotation={[0.1, i * 1.2, 0.14]}>
                    <coneGeometry args={[2.6 + (i % 2), 11.5, 10, 1, true]} />
                    <meshBasicMaterial color="#cfe6b0" transparent opacity={0.13} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
        {/* POÇAS DE LUZ SALPICADA deslizando no chão */}
        {built.gaps.map(([x, z], i) => (
            <mesh key={'p' + i} ref={(el) => { pools.current[i] = el; }} position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[2.5 + (i % 3) * 0.8, 18]} />
                <meshBasicMaterial color="#d2e8ae" transparent opacity={0.14} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
        ))}
    </>);
};

// ── FLORESTA-FANTASMA: anéis de silhueta ALÉM das paredes (profundidade) ─────
// Sem fog (fog:false): no calmo são manchas mais escuras que o breu; na onda
// (fog claro) elas RECORTAM como uma muralha de gigantes. 2 draw calls.
const GhostForest: React.FC = () => {
    const built = useMemo(() => {
        const r = rng(917);
        const trunkGeo = new THREE.CylinderGeometry(0.7, 2.0, 24, 7);
        trunkGeo.translate(0, 12, 0);
        const canopyGeo = jittered(new THREE.IcosahedronGeometry(5.2, 1), 1.6, 66);
        const spots: Array<[number, number, number]> = []; // x,z,escala
        // 3º anel (z≈-58, brief §5.11): mais próximo — a muralha lê MESMO com o fog far curto
        for (let i = 0; i < 10; i++) spots.push([-52 + i * 11.5 + (r() - 0.5) * 6, -58 + (r() - 0.5) * 6, 0.7 + r() * 0.3]);
        // anel 1 (z≈-70) e anel 2 (z≈-105), mais altos que o teto
        for (let i = 0; i < 17; i++) spots.push([-78 + i * 9.8 + (r() - 0.5) * 5, -70 + (r() - 0.5) * 8, 0.9 + r() * 0.6]);
        for (let i = 0; i < 13; i++) spots.push([-88 + i * 14.5 + (r() - 0.5) * 7, -105 + (r() - 0.5) * 10, 1.3 + r() * 0.8]);
        // flancos: olhar pros lados também tem parede de gigantes
        for (let i = 0; i < 5; i++) spots.push([-46 - r() * 10, -52 + i * 13, 0.9 + r() * 0.5]);
        for (let i = 0; i < 5; i++) spots.push([46 + r() * 10, -52 + i * 13, 0.9 + r() * 0.5]);
        const n = spots.length;
        const trunks = new THREE.InstancedMesh(trunkGeo, M9.ghost, n);
        const canopies = new THREE.InstancedMesh(canopyGeo, M9.ghost, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        spots.forEach(([x, z, s], i) => {
            eu.set((r() - 0.5) * 0.06, r() * Math.PI * 2, (r() - 0.5) * 0.06); q.setFromEuler(eu);
            pos.set(x, 0, z); sc.set(s * (0.8 + r() * 0.4), s, s * (0.8 + r() * 0.4));
            m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4);
            pos.set(x + (r() - 0.5) * 4, 23 * s + r() * 3, z + (r() - 0.5) * 4); sc.setScalar(s * (1 + r() * 0.5));
            m4.compose(pos, q, sc); canopies.setMatrixAt(i, m4);
        });
        trunks.instanceMatrix.needsUpdate = true;
        canopies.instanceMatrix.needsUpdate = true;
        return { trunks, canopies, geos: [trunkGeo, canopyGeo] };
    }, []);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    return (<>
        <primitive object={built.trunks} />
        <primitive object={built.canopies} />
        {/* troncos-coluna gigantes (brief §2: colunas de catedral que SOMEM
            no teto — 3→6, h 18→22, raio base 2.1→2.6) */}
        {([[-31.5, -12], [31.5, -30], [-30.5, -48], [31.5, -8], [-31.5, -30], [12, -50]] as const).map(([x, z], i) => (
            <mesh key={i} position={[x, 8, z]} material={M9.bark}>
                <cylinderGeometry args={[1.3, 2.6, 22, 9]} />
            </mesh>
        ))}
    </>);
};

const MossPatches: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        f9eco.moss.forEach((m, i) => {
            const mesh = refs.current[i]; if (!mesh) return;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.18 + m.amount * 0.55 + Math.sin(t * 1.4 + i * 2) * 0.06 * m.amount; // tapete sagrado, base mais alta (brief §3)
            const s = 0.6 + m.amount * 0.55;
            mesh.scale.set(s, s * 0.28, s);
        });
    });
    return (<>
        {f9eco.moss.map((m, i) => (
            <group key={i} position={[m.x, f9GroundHeight(m.x, m.z) + 0.02, m.z]}>
                <mesh ref={(el) => { refs.current[i] = el; }} scale={[1, 0.28, 1]} material={M9.moss.clone()}>
                    <icosahedronGeometry args={[1.4, 1]} />
                </mesh>
                {[0, 1, 2].map((k) => {
                    const a = (k / 3) * Math.PI * 2 + i;
                    return <mesh key={k} position={[Math.cos(a) * 1.1, 0.04, Math.sin(a) * 1.1]} scale={[1, 0.3, 1]} material={M9.moss.clone()}><icosahedronGeometry args={[0.4 + (k % 2) * 0.2, 0]} /></mesh>;
                })}
                <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[2.0, 12]} />
                    <meshBasicMaterial color="#4ade82" transparent opacity={0.09} depthWrite={false} blending={THREE.AdditiveBlending} />
                </mesh>
            </group>
        ))}
    </>);
};

// ── VAGALUMES v3: movimento INDIVIDUAL (senos defasados nos 3 eixos),
//    twinkle individual por vertex color; MORREM no aviso, voltam no renascer ──
const Fireflies: React.FC<{ low: boolean }> = ({ low }) => {
    const built = useMemo(() => {
        const n = low ? 60 : 110, r = rng(919);
        const base = new Float32Array(n * 3), phase = new Float32Array(n * 8);
        for (let i = 0; i < n; i++) {
            // brief §3: 60% perto de musgo/tocas — vida perto de vida
            if (r() < 0.6 && (f9eco.moss.length + f9eco.dens.length) > 0) {
                const nearMoss = r() < 0.5;
                const src = nearMoss ? f9eco.moss : f9eco.dens;
                const p0 = src[Math.floor(r() * src.length)];
                const a = r() * Math.PI * 2, rr = 0.8 + r() * 3.2;
                base[i * 3] = p0.x + Math.cos(a) * rr;
                base[i * 3 + 1] = 0.4 + r() * 3.2;
                base[i * 3 + 2] = p0.z + Math.sin(a) * rr;
            } else {
                base[i * 3] = (r() * 2 - 1) * 32; base[i * 3 + 1] = 0.4 + r() * 3.8; base[i * 3 + 2] = -50 + r() * 54;
            }
            for (let k = 0; k < 8; k++) phase[i * 8 + k] = r() * Math.PI * 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const mat = new THREE.PointsMaterial({
            size: 0.13, vertexColors: true, transparent: true, opacity: 1,
            map: haloTex, // brilho redondo e macio (não quadradinho)
            depthWrite: false, blending: THREE.AdditiveBlending, color: '#d8ffb0',
        });
        return { g, mat, n, base, phase };
    }, [low]);
    useEffect(() => () => { built.g.dispose(); built.mat.dispose(); }, [built]);
    const fade = useRef(1);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const { g, mat, n, base, phase } = built;
        // o presságio: os vagalumes somem quando o ar clareia (aviso/onda)
        const target = f9eco.phase === 'aviso' || f9eco.phase === 'onda' ? 0 : 1;
        fade.current += (target - fade.current) * Math.min(1, dt * 1.1);
        if (fade.current < 0.01) { mat.opacity = 0; return; }
        mat.opacity = fade.current;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const col = g.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < n; i++) {
            const p8 = i * 8;
            pos.setXYZ(i,
                base[i * 3] + Math.sin(t * (0.32 + 0.1 * Math.sin(phase[p8])) + phase[p8]) * 1.3,
                base[i * 3 + 1] + Math.sin(t * 0.45 + phase[p8 + 1]) * 0.55,
                base[i * 3 + 2] + Math.cos(t * 0.28 + phase[p8 + 2]) * 1.3);
            // twinkle individual: pulso estreito (pisca de vaga-lume, não luz fixa)
            const tw = Math.max(0, Math.sin(t * (1.6 + phase[p8 + 3] * 0.2) + phase[p8 + 4]));
            const b = (0.12 + Math.pow(tw, 3) * 0.88) * fade.current;
            col.setXYZ(i, b, b, b * 0.82);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
    });
    return <points geometry={built.g} material={built.mat} frustumCulled={false} />;
};

// ── ESPOROS: pó de memória à deriva, concentrado nas clareiras ───────────────
const Spores: React.FC<{ low: boolean }> = ({ low }) => {
    const built = useMemo(() => {
        const n = low ? 200 : 400, r = rng(921);
        const base = new Float32Array(n * 3), ph = new Float32Array(n * 2);
        const warm = new THREE.Color('#e8f4d8'), cold = new THREE.Color('#cfe0ff'); // 80% quente / 20% frio (brief §5.21)
        for (let i = 0; i < n; i++) {
            if (r() < 0.85) { // nas clareiras (o teto vaza luz, o ar vaza esporo)
                const g = CANOPY_GAPS[Math.floor(r() * CANOPY_GAPS.length)];
                const a = r() * Math.PI * 2, rr = r() * 4.5;
                base[i * 3] = g[0] + Math.cos(a) * rr;
                base[i * 3 + 2] = g[1] + Math.sin(a) * rr;
            } else {
                base[i * 3] = (r() * 2 - 1) * 32; base[i * 3 + 2] = -50 + r() * 54;
            }
            base[i * 3 + 1] = 0.3 + r() * 4.6;
            ph[i * 2] = r() * Math.PI * 2; ph[i * 2 + 1] = 0.5 + r();
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const colAttr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const c = r() < 0.8 ? warm : cold;
            colAttr[i * 3] = c.r; colAttr[i * 3 + 1] = c.g; colAttr[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
        const mat = new THREE.PointsMaterial({
            color: '#ffffff', size: 0.05, transparent: true, opacity: 0.5, vertexColors: true,
            map: haloTex, // pontos REDONDOS e macios (pó, não confete quadrado)
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        return { g, mat, n, base, ph };
    }, [low]);
    useEffect(() => () => { built.g.dispose(); built.mat.dispose(); }, [built]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const { g, n, base, ph } = built;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < n; i++) {
            pos.setXYZ(i,
                base[i * 3] + Math.sin(t * 0.11 * ph[i * 2 + 1] + ph[i * 2]) * 1.5,
                base[i * 3 + 1] + Math.sin(t * 0.2 * ph[i * 2 + 1] + ph[i * 2] * 2) * 0.5,
                base[i * 3 + 2] + Math.cos(t * 0.09 * ph[i * 2 + 1] + ph[i * 2]) * 1.5);
        }
        pos.needsUpdate = true;
    });
    return <points geometry={built.g} material={built.mat} frustumCulled={false} />;
};

// ── NÉVOA DE CHÃO: billboards largos e rasteiros deslizando na altura do
//    joelho; o TINT segue a fase (brief §1.1) via f9ForestShare.mistTint ──
const GroundMist: React.FC = () => {
    const mats = useMemo(() => Array.from({ length: 14 }, () => new THREE.SpriteMaterial({
        map: mistTex, transparent: true, opacity: 0.07, depthWrite: false,
        blending: THREE.AdditiveBlending, color: '#a8c8b4',
    })), []);
    const refs = useRef<(THREE.Sprite | null)[]>([]);
    const seeds = useMemo(() => { const r = rng(923); return Array.from({ length: 14 }, () => ({ x: (r() * 2 - 1) * 28, z: -48 + r() * 50, p: r() * Math.PI * 2, s: 0.5 + r() })); }, []);
    useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const tint = f9ForestShare.mistTint;
        refs.current.forEach((sp, i) => {
            if (!sp) return;
            const sd = seeds[i];
            sp.position.x = sd.x + Math.sin(t * 0.07 * sd.s + sd.p) * 5;
            sp.position.z = sd.z + Math.cos(t * 0.05 * sd.s + sd.p * 2) * 4;
            sp.position.y = f9GroundHeight(sp.position.x, sp.position.z) + 0.55;
            mats[i].opacity = 0.055 + (0.5 + 0.5 * Math.sin(t * 0.3 * sd.s + sd.p)) * 0.03;
            mats[i].color.copy(tint);
        });
    });
    return (<>
        {mats.map((m, i) => (
            <sprite key={i} ref={(el) => { refs.current[i] = el; }} material={m} scale={[16, 5, 1]} />
        ))}
    </>);
};

// ── o FIO VERMELHO com PULSO VIAJANTE (guiando o olho até a raiz) ────────────
const RedThread: React.FC = () => {
    const built = useMemo(() => {
        const pts = F9_FIO.map(([x, z], i) => new THREE.Vector3(x, 0.5 + Math.sin(i * 1.7) * 0.28 + (i % 3 === 0 ? 0.9 : 0), z));
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 90, 0.035, 6);
        // o pulso: 4 contas de brasa que viajam o tubo (u = t·vel + i/4)
        const beadGeo = new THREE.SphereGeometry(0.07, 8, 6);
        const beadMat = new THREE.MeshBasicMaterial({
            color: '#ff7a5a', transparent: true, opacity: 0.9,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const beads = new THREE.InstancedMesh(beadGeo, beadMat, 4);
        beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        beads.frustumCulled = false;
        return { curve, tube, beads, beadGeo, beadMat };
    }, []);
    useEffect(() => () => { built.tube.dispose(); built.beadGeo.dispose(); built.beadMat.dispose(); }, [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        M9.thread.emissiveIntensity = 0.7 + Math.sin(t * 1.8) * 0.15;
        const { curve, beads } = built;
        const { m4, p, q, s } = scratch;
        for (let i = 0; i < 4; i++) {
            const u = (t * 0.055 + i / 4) % 1;
            curve.getPointAt(u, p);
            // cabeça brilhante com cauda de escala (o pulso "viaja")
            s.setScalar(0.8 + 0.45 * Math.sin(t * 5 - i * 1.4));
            m4.compose(p, q, s);
            beads.setMatrixAt(i, m4);
        }
        beads.instanceMatrix.needsUpdate = true;
    });
    return (<>
        <mesh geometry={built.tube} material={M9.thread} />
        {F9_FIO.filter((_, i) => i % 2 === 1).map(([x, z], i) => (
            <mesh key={i} position={[x, 0.5, z]} material={M9.thread}><sphereGeometry args={[0.1, 6, 6]} /></mesh>
        ))}
        <primitive object={built.beads} />
    </>);
};

const Ocos: React.FC = () => (
    <>
        {F9_OCOS.map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]}>
                <mesh position={[0, 3.6, 0]} material={M9.bark}><cylinderGeometry args={[1.5, 2.3, 7.4, 9, 1]} /></mesh>
                <mesh position={[0, 6.4, 0]} material={M9.canopyDark}><icosahedronGeometry args={[2.5, 1]} /></mesh>
                {[0, 1, 2].map((k) => {
                    const a = (k / 3) * Math.PI * 2 + i * 1.3;
                    return <mesh key={k} position={[Math.cos(a) * 2.0, 0.4, Math.sin(a) * 2.0]} rotation={[0, -a, 1.1]} material={M9.bark}><cylinderGeometry args={[0.09, 0.6, 1.5, 5]} /></mesh>;
                })}
                <mesh position={[0, 1.05, r * 0.62]} material={M9.ocoGlow}><circleGeometry args={[0.75, 12]} /></mesh>
                <mesh position={[0, 1.05, r * 0.6]}><circleGeometry args={[1.35, 12]} /><meshBasicMaterial color="#ffca7a" transparent opacity={0.14} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
                <pointLight position={[0, 1.3, r * 0.4]} distance={5.5} decay={2} color="#ffca7a" intensity={3.4} />
            </group>
        ))}
    </>
);

const Raiz: React.FC = () => (
    <group position={[F9_RAIZ[0], 0, F9_RAIZ[1] - 2.5]}>
        <mesh position={[0, 5, 0]} material={M9.bark}><cylinderGeometry args={[2.2, 4.6, 10, 12, 1]} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 3.6, 0.7, Math.sin(a) * 3.6]} rotation={[0, -a, 0.95]} material={M9.bark}><cylinderGeometry args={[0.28, 0.95, 4.6, 6]} /></mesh>;
        })}
        <mesh position={[0, 11.4, 0]} material={M9.canopyDark}><icosahedronGeometry args={[5.4, 1]} /></mesh>
        <mesh position={[0, 2.2, 3.6]} rotation={[0.4, 0, 0]} material={M9.shroomCapAmber}><boxGeometry args={[0.14, 0.9, 0.08]} /></mesh>
        <pointLight position={[0, 2.4, 4.3]} distance={7} decay={2} color="#ffdf8a" intensity={4} />
    </group>
);

// ── PÓS-PROCESSAMENTO (só quality 'high' — padrão do Floor 3) ────────────────
// Bloom: musgo/cogumelos/galhadas/brasas/ocos/vagalumes cantam no escuro.
// Noise: "filme úmido". HueSaturation −0.12: o mundo dessatura pro doente —
// no AVISO cai pra −0.16 (o mundo "morre" mais — brief §5.23). Vignette fecha
// a moldura (0.30/0.72).
const F9PostEffects: React.FC = () => {
    const [sat, setSat] = useState(-0.12);
    const lastSat = useRef(-0.12);
    useFrame(() => {
        const target = f9eco.phase === 'aviso' ? -0.16 : -0.12;
        if (target !== lastSat.current) { lastSat.current = target; setSat(target); }
    });
    return (
        <EffectComposer multisampling={0} enableNormalPass={false}>
            <Bloom intensity={0.55} luminanceThreshold={0.7} luminanceSmoothing={0.18} mipmapBlur />
            <HueSaturation saturation={sat} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.30} darkness={0.72} />
        </EffectComposer>
    );
};

// clarão do relâmpago SOMANDO por cima do fog da fase (cor cacheada — sem parse por frame)
const FOG_FLASH = new THREE.Color('#e4f2da');

// ── a cena ───────────────────────────────────────────────────────────────────
export const Floor9Forest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> =
    ({ playerPositionRef }) => {
        const scene = useThree((s) => s.scene);
        const amb = useRef<THREE.AmbientLight>(null!);
        const hemi = useRef<THREE.HemisphereLight>(null!);
        const dir = useRef<THREE.DirectionalLight>(null!);
        const still = useRef({ x: 0, z: 0, t: 0 });
        const noiseRef = useRef({ lx: 0, lz: 0, v: -1 }); // barulho do player (0..1; -1 = âncora o 1º frame)
        const fogScratch = useMemo(() => new THREE.Color(), []);
        const quality = useMemo(f9Quality, []);
        // o color script: o estado CORRENTE (nasce no calmo) + a última fase
        const look = useMemo(() => cloneLook(F9_LOOKS.calmo), []);
        const lookTarget = useMemo(() => cloneLook(F9_LOOKS.calmo), []);
        const lastPhase = useRef<F9CyclePhase>('calmo');

        useEffect(() => {
            const oldFog = scene.fog, oldBg = scene.background;
            scene.fog = new THREE.Fog('#101d18', 15, 54); // o fog NÃO neblina mais a faixa de gameplay (brief §5.2)
            scene.background = new THREE.Color('#101d18');
            return () => { scene.fog = oldFog; scene.background = oldBg; };
        }, [scene]);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            const p = playerPositionRef.current;
            // quanto tempo o player está parado (a curiosidade dos saltitos lê)
            const moved = Math.hypot(p.x - still.current.x, p.z - still.current.z);
            if (moved > 0.25) { still.current.x = p.x; still.current.z = p.z; still.current.t = 0; }
            else still.current.t += dt;
            // BARULHO do player (0 parado · ~0.5 andando · 1 correndo) — o motor
            // usa pra audição (passos atraem; parado/agachado é quase invisível)
            if (noiseRef.current.v < 0 && noiseRef.current.lx === 0) { // 1º frame: ancora sem spike
                noiseRef.current.lx = p.x; noiseRef.current.lz = p.z; noiseRef.current.v = 0;
            }
            const spd = Math.hypot(p.x - noiseRef.current.lx, p.z - noiseRef.current.lz) / Math.max(dt, 1e-4);
            noiseRef.current.lx = p.x; noiseRef.current.lz = p.z;
            noiseRef.current.v += (Math.min(1, spd / 8) - noiseRef.current.v) * Math.min(1, dt * 6);
            f9EcoTick(dt, p.x, p.z, 24, {
                huntable: f9.phase === 'explorar',
                safeInOco: f9.abrigo >= 0,
                stillT: still.current.t,
                noise: noiseRef.current.v,
            });
            f9Tick(dt, p.x, p.z);
            for (const e of f9DrainEvents()) floor9SfxFloresta(e);
            for (const e of f9EcoDrainEvents()) if (e === 'cacaPlayer') f9Cacado();
            // o som do mundo, dirigido pela fase (a cama cala no aviso)
            const frac = f9CycleFrac();
            floor9SfxSetPhase(f9eco.phase, frac);
            // ── COLOR SCRIPT de 4 fases (brief §1.1): o estado lerpa pro alvo ──
            const phase = f9eco.phase;
            if (phase !== lastPhase.current) {
                // aviso→onda é CORTE SECO: o apagamento não pede licença
                if (phase === 'onda') copyLook(look, F9_LOOKS.onda);
                lastPhase.current = phase;
            }
            copyLook(lookTarget, F9_LOOKS[phase]);
            if (phase === 'aviso') {
                // o ar "bronzeia" aos poucos — a mistura acompanha a fração do ciclo
                const w = Math.min(1, Math.max(0, (frac - F9_AVISO_AT) / (1 - F9_AVISO_AT)));
                mixLook(lookTarget, F9_LOOKS.calmo, F9_LOOKS.aviso, w);
            }
            // renascer entra em ease-out ~2 s; a volta renascer→calmo leva ~6 s
            const rate = phase === 'renascer' ? 1.4 : phase === 'calmo' ? 0.55 : 2.5;
            lerpLook(look, lookTarget, Math.min(1, dt * rate));
            // o flash do relâmpago continua SOMANDO por cima do estado da fase
            const flash = f9StormShare.flash;
            if (amb.current) { amb.current.intensity = look.ambI + flash * 0.3; amb.current.color.copy(look.amb); }
            if (hemi.current) {
                hemi.current.intensity = look.hemiI + flash * 0.4;
                hemi.current.color.copy(look.hemiSky);
                hemi.current.groundColor.copy(look.hemiGnd);
            }
            if (dir.current) { dir.current.intensity = look.dirI + flash * 0.8; dir.current.color.copy(look.dir); }
            const fog = scene.fog as THREE.Fog | null;
            if (fog) {
                fog.near = look.near;
                fog.far = look.far;
                fogScratch.copy(look.fog).lerp(FOG_FLASH, flash * 0.5);
                fog.color.copy(fogScratch);
                if (scene.background instanceof THREE.Color) scene.background.copy(fog.color);
            }
            // o céu segue a fase; durante o clarão quem escreve o céu é o Lightning (Floor9Storm)
            if (f9StormShare.skyMat && f9StormShare.flash <= 0) f9StormShare.skyMat.color.copy(look.sky);
            // ghost-forest e névoa de chão também obedecem ao color script
            M9.ghost.color.copy(look.ghost);
            f9ForestShare.mistTint.copy(look.mist);
        });

        return (
            <group>
                <Ground />
                {/* as 3 luzes base nascem no CALMO (brief §1.1); o color script
                    reescreve cor+intensidade por fase a cada frame */}
                <ambientLight ref={amb} color="#5f7a66" intensity={0.38} />
                <hemisphereLight ref={hemi} color="#8aa88f" groundColor="#1c2a20" intensity={0.5} />
                <directionalLight ref={dir} position={[8, 14, -6]} intensity={0.75} color="#cfe0bd" />

                <Trees sway={quality !== 'low'} />
                <Undergrowth low={quality === 'low'} sway={quality !== 'low'} />
                <ForegroundFringe low={quality === 'low'} sway={quality !== 'low'} />
                <CanopyAndLight low={quality === 'low'} />
                <GhostForest />
                <MossPatches />
                <Fireflies low={quality === 'low'} />
                <Spores low={quality === 'low'} />
                <GroundMist />
                <RedThread />
                <Ocos />
                <Raiz />

                <DenMouths />
                <Saltitos playerRef={playerPositionRef} />
                <Cervos />
                <Vultos playerRef={playerPositionRef} />
                <Guardiao />
                <BlobShadows />
                <Floor9Storm />

                {/* a moldura enferrujada do elevador que a floresta engoliu */}
                <group position={[2.5, 0, 1.5]} rotation={[0.12, 0.5, 0.06]}>
                    <B a={[1.6, 0.18, 0.12]} p={[0, 0.1, 0]} m={M9.bark} />
                    <B a={[0.14, 2.2, 0.12]} p={[-0.75, 1.1, 0]} m={M9.bark} r={[0, 0, 0.08]} />
                    <B a={[0.14, 1.7, 0.12]} p={[0.78, 0.85, 0]} m={M9.bark} r={[0, 0, -0.12]} />
                    <mesh position={[0.1, 0.9, 0.02]} material={M9.moss}><sphereGeometry args={[0.35, 6, 5]} /></mesh>
                </group>

                {quality === 'high' && <F9PostEffects />}
            </group>
        );
    };

export default Floor9Forest;
