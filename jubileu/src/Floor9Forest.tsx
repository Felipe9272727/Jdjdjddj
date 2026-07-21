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
import { f9, f9Tick, f9DrainEvents, f9Cacado, F9_OCOS, F9_OCO_MOUTH, F9_RAIZ_MOUTH, F9_FIO, F9_RAIZ } from './f9Floresta';
import { f9eco, f9EcoTick, f9EcoDrainEvents, f9DropOffering, f9CycleFrac, F9_AVISO_AT, F9_TREE_OBSTACLES, freshOfferings, type F9CyclePhase } from './f9Eco';
import { Floor9Oferendas } from './Floor9Oferendas';
import { Saltitos, Cervos, Vultos, Guardiao, DenMouths, BlobShadows } from './Floor9Fauna';
import { Floor9Storm, f9StormShare } from './Floor9Storm';
import { f9GroundHeight } from './f9Ground';
import { floor9SfxSetPhase, floor9SfxFloresta } from './floor9Sfx';
import { f9Quality, f9IsLite, F9_SWAY_BUDGET_LITE, type F9Quality } from './f9Quality';

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

// ── PISO DE BRILHO (P0 mobile, quality ≠ 'high') ─────────────────────────────
// Sem o EffectComposer (que só liga no high) o grade escuro "Rain World" fica
// ESCURO DEMAIS no celular — o alvo é a legibilidade da versão anterior:
// floresta legível, Fiapo sempre visível. O high mantém o grade original;
// os tiers leves clareiam amb/hemi e levantam o fog (menos negro), mantendo
// a IDENTIDADE de cada fase (aviso bronze, onda estourada, renascer claro).
const LITE_LIFT = new THREE.Color('#86a488');   // verde-catedral claro (o "chá" do v2)
const LITE_FOG = new THREE.Color('#33493b');    // fog menos negro (nunca breu)
const LITE_GHOST = new THREE.Color('#22332a');  // ghost-forest legível sem composer
function brightenLookLite(l: F9Look): void {
    // luzes base mais fortes (piso + escala), com teto pra onda não estourar 2×
    l.ambI = Math.min(1.15, l.ambI * 1.5 + 0.22);
    l.hemiI = Math.min(1.25, l.hemiI * 1.45 + 0.28);
    l.dirI = Math.min(1.3, l.dirI + 0.18);
    // cores de luz levantadas (o hemiGnd quase-preto matava o chão)
    l.amb.lerp(LITE_LIFT, 0.35);
    l.hemiSky.lerp(LITE_LIFT, 0.3);
    l.hemiGnd.lerp(LITE_LIFT, 0.5);
    // fog menos negro e mais curto de perto, mais longe no fundo (a floresta LÊ)
    l.fog.lerp(LITE_FOG, 0.55);
    l.near += 2;
    l.far = Math.min(70, l.far * 1.25);
    // céu e ghost-forest acompanham (sem composer não há bloom pra separar)
    l.sky.lerp(LITE_LIFT, 0.22);
    l.ghost.lerp(LITE_GHOST, 0.5);
}

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
    // M18: raio maior — a flora não pode plantar no corredor da PORTA da câmara
    if (dist2(x, z, F9_RAIZ[0], F9_RAIZ[1] - 2.5) < (6.2 + margin) ** 2) return true;
    return false;
}

/** M18: dentro de um SANTUÁRIO (interior de oco / câmara da Raiz)? Bloqueio
 *  DURO — os scatters têm um roll de 15-30% que planta MESMO perto do gameplay
 *  (densidade), mas dentro dos pisos nivelados não pode nascer NADA. */
function inSanctuary(x: number, z: number): boolean {
    for (const [ox, oz] of F9_OCOS) if (dist2(x, z, ox, oz) < 3.2 * 3.2) return true;
    return dist2(x, z, F9_RAIZ[0], F9_RAIZ[1] - 2.5) < 6.4 * 6.4;
}

/* Quality vem de f9Quality.ts (fonte única — mesma chave do Settings, mesmo
 * fallback mobile→medium; o bench floor9-dev monta a cena FORA do
 * SettingsProvider). P0 mobile: os tiers leves recebem orçamentos menores e
 * o PISO DE BRILHO (o grade escuro "Rain World" fica só no high). */

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
            if (inSanctuary(x, z)) continue;
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
        // ── as ÁRVORES-MÃE (as mesmas que a IA desvia) INSTANCIADAS: eram
        //    12 × (tronco + 5 raízes + copa) = 84 draws; agora 3 ──
        const mtN = F9_TREE_OBSTACLES.length;
        const mtTrunkGeo = new THREE.CylinderGeometry(0.55, 1, 9.2, 9); // unit: escala xz = rr
        const mtRootGeo = new THREE.CylinderGeometry(0.238, 1, 1.7, 5);  // unit: escala xz = rr*0.42
        const mtCanopyGeo = jittered(new THREE.IcosahedronGeometry(1, 1), 0.34, 88);
        const mtTrunks = new THREE.InstancedMesh(mtTrunkGeo, M9.bark, mtN);
        const mtRoots = new THREE.InstancedMesh(mtRootGeo, M9.bark, mtN * 5);
        const mtCanopies = new THREE.InstancedMesh(mtCanopyGeo, M9.canopyDark, mtN);
        F9_TREE_OBSTACLES.forEach(([x, z, rr], i) => {
            eu.set(0, 0, 0); q.setFromEuler(eu);
            m4.compose(pos.set(x, 4.6, z), q, sc.set(rr, 1, rr));
            mtTrunks.setMatrixAt(i, m4);
            for (let k = 0; k < 5; k++) {
                const a = (k / 5) * Math.PI * 2 + i;
                eu.set(0, -a, 1.05); q.setFromEuler(eu);
                m4.compose(pos.set(x + Math.cos(a) * rr * 1.15, 0.42, z + Math.sin(a) * rr * 1.15), q, sc.setScalar(rr * 0.42));
                mtRoots.setMatrixAt(i * 5 + k, m4);
            }
            eu.set(0, i * 1.7, 0); q.setFromEuler(eu);
            m4.compose(pos.set(x, 9.4, z), q, sc.setScalar(2.6 + (i % 3) * 0.5));
            mtCanopies.setMatrixAt(i, m4);
        });
        mtTrunks.instanceMatrix.needsUpdate = true;
        mtRoots.instanceMatrix.needsUpdate = true;
        mtCanopies.instanceMatrix.needsUpdate = true;
        return { trunks, canopies, basePos, baseSc, baseRot, n, mtTrunks, mtRoots, mtCanopies, all: [trunkGeo, ...canopyGeos, mtTrunkGeo, mtRootGeo, mtCanopyGeo] };
    }, []);
    useEffect(() => () => built.all.forEach((g) => g.dispose()), [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        if (!sway) return; // fora do high: copas estáticas (720 matrizes poupadas)
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
        {/* as ÁRVORES-MÃE (as mesmas que a IA desvia): 3 draws instanciados */}
        <primitive object={built.mtTrunks} />
        <primitive object={built.mtRoots} />
        <primitive object={built.mtCanopies} />
    </>);
};

// ── SUB-BOSQUE: samambaias (com vento) + pedras + cogumelos INSTANCIADOS ─────
// brief §2.L2: 560 frondes em 2 faixas de tamanho (a variedade de escala é o
// que vende "mundo grande"); quality low reduz pra ~300 e desliga o vento.
// P0 mobile: swayMode 'storm' (medium) = vento SÓ em aviso/onda e com passo
// (stride) pra nunca passar de ~150 plantas escritas por frame.
type F9SwayMode = 'full' | 'storm' | 'off';
const SWAY_FERNS_LITE = 150; // + 50 da moldura = teto de 200 plantas (P0)
const Undergrowth: React.FC<{ low: boolean; swayMode: F9SwayMode }> = ({ low, swayMode }) => {
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
            if (inSanctuary(x, z)) continue;
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
            if (inSanctuary(x, z)) continue;
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
        // os MAIORES viram farol (halo aditivo) — NUNCA na faixa do fio,
        // pra não confundir com o objetivo (brief §3: luz grande = marco).
        // P0: 8 sprites no high, 4 nos tiers leves (cada sprite = 1 draw).
        const halos = spots
            .filter(([x, z]) => !nearGameplay(x, z, 0))
            .sort((a, b) => b[2] - a[2])
            .slice(0, swayMode === 'full' ? 8 : 4)
            .map(([x, z, s, cyan]) => ({ x, z, y: f9GroundHeight(x, z) + 0.34 * s + 0.12, cyan }));
        // troncos caídos — INSTANCIADOS (eram 7 grupos × 2 meshes = 14 draws)
        const logs: Array<[number, number, number, number]> = [];
        for (let i = 0; i < 200 && logs.length < 7; i++) {
            const x = (r() * 2 - 1) * 28, z = -46 + r() * 46;
            if (nearGameplay(x, z, 1.6)) continue;
            logs.push([x, z, r() * Math.PI, 2.4 + r() * 2.2]);
        }
        const logGeo = new THREE.CylinderGeometry(0.34, 0.4, 1, 8); // altura 1: o comprimento vai na escala
        const logCapGeo = new THREE.SphereGeometry(0.4, 7, 6);
        const logMeshes = new THREE.InstancedMesh(logGeo, M9.bark, logs.length);
        const logCaps = new THREE.InstancedMesh(logCapGeo, M9.moss, logs.length);
        const qg = new THREE.Quaternion(), ql = new THREE.Quaternion(), off = new THREE.Vector3();
        logs.forEach(([x, z, a, len], i) => {
            const gy = f9GroundHeight(x, z) + 0.32;
            qg.setFromEuler(eu.set(0, a, (i % 2 ? 0.04 : -0.05)));
            ql.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
            m4.compose(pos.set(x, gy, z), qg.clone().multiply(ql), sc.set(1, len, 1));
            logMeshes.setMatrixAt(i, m4);
            off.set(len * 0.2, 0.3, 0).applyQuaternion(qg);
            m4.compose(pos.set(x + off.x, gy + off.y, z + off.z), qg, sc.set(1, 0.4, 1));
            logCaps.setMatrixAt(i, m4);
        });
        logMeshes.instanceMatrix.needsUpdate = true;
        logCaps.instanceMatrix.needsUpdate = true;
        return { ferns, fBase, rocks, stems, capsCyan, capsAmber, halos, logMeshes, logCaps, geos: [fGeo, rGeo, stemGeo, capGeo, logGeo, logCapGeo] };
    }, [low, swayMode]);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
    useFrame(({ clock }) => {
        if (swayMode === 'off') return; // quality baixa: sub-bosque estático (brief §7)
        // P0: no tier leve o vento SÓ sopra no aviso/onda (no calmo: zero matrizes)
        const stormOnly = swayMode === 'storm';
        if (stormOnly && f9eco.phase !== 'aviso' && f9eco.phase !== 'onda') return;
        // VENTO no sub-bosque: cada fronde balança defasada (sin(t*3+i))
        const t = clock.elapsedTime;
        const { ferns, fBase } = built;
        const { m4, q, e, p, s } = scratch;
        const amp = 0.04 + (f9eco.phase === 'aviso' ? 0.09 : 0) + (f9eco.phase === 'onda' ? 0.16 : 0);
        // P0: no tier leve, passo (stride) pra ≤ ~150 frondes/frame — espalhado
        // pelo mapa todo, o olho não percebe que nem toda fronde balança
        const stride = stormOnly ? Math.max(1, Math.ceil(fBase.length / SWAY_FERNS_LITE)) : 1;
        for (let i = 0; i < fBase.length; i += stride) {
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
        {/* os faróis: halo aditivo nos cogumelos-mãe (longe da faixa do fio) */}
        {built.halos.map((h, i) => (
            <sprite key={'h' + i} position={[h.x, h.y, h.z]} material={h.cyan ? haloMatCyan : haloMatAmber} scale={[1.6, 1.6, 1]} />
        ))}
        {/* troncos caídos: 2 draws no total (instanciados) */}
        <primitive object={built.logMeshes} />
        <primitive object={built.logCaps} />
    </>);
};

// ── L1 · PRIMEIRO PLANO (a moldura escura — brief §2): anel de samambaias
//    GIGANTES quase-pretas ao redor do spawn + "portais" flanqueando o fio +
//    tocos/raízes baixos. Rain World sempre tem uma silhueta escura recortando
//    a base do quadro: dá escala (o Fiapo é menor que uma fronde) e profundidade
//    imediata. NUNCA em cima do fio/ocos nem tapando o cone central da câmera. ──
const ForegroundFringe: React.FC<{ low: boolean; swayMode: F9SwayMode }> = ({ low, swayMode }) => {
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
            if (dist2(x, z, F9_RAIZ[0], F9_RAIZ[1] - 2.5) < 6.5 * 6.5) return true; // M18: porta livre
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
        if (swayMode === 'off') return; // quality baixa: moldura estática (brief §7)
        // P0: no tier leve a moldura SÓ balança no aviso/onda
        if (swayMode === 'storm' && f9eco.phase !== 'aviso' && f9eco.phase !== 'onda') return;
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
        // POÇAS DE LUZ SALPICADA instanciadas (eram 5 draws; agora 1)
        const poolGeo = new THREE.CircleGeometry(1, 18);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMat = new THREE.MeshBasicMaterial({ color: '#d2e8ae', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
        const poolsIM = new THREE.InstancedMesh(poolGeo, poolMat, CANOPY_GAPS.length);
        poolsIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        return { blobs, vines, geo, vineGeo, gaps: CANOPY_GAPS, poolsIM, poolGeo, poolMat };
    }, [low]);
    useEffect(() => () => { built.geo.dispose(); built.vineGeo.dispose(); built.poolGeo.dispose(); built.poolMat.dispose(); }, [built]);
    const rays = useRef<THREE.Group>(null!);
    const poolScratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() }), []);
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
        // poças de luz deslizando no chão (1 draw; a opacidade pulsa junto)
        const { m4, q, s, p } = poolScratch;
        q.identity();
        built.poolsIM.material.opacity = 0.14 + Math.sin(t * 0.4) * 0.03;
        for (let i = 0; i < built.gaps.length; i++) {
            const [gx, gz] = built.gaps[i];
            p.set(gx + Math.sin(t * 0.11 + i * 2) * 1.6, 0.045, gz + Math.cos(t * 0.09 + i * 3) * 1.4);
            s.setScalar(2.5 + (i % 3) * 0.8);
            m4.compose(p, q, s);
            built.poolsIM.setMatrixAt(i, m4);
        }
        built.poolsIM.instanceMatrix.needsUpdate = true;
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
        {/* POÇAS DE LUZ SALPICADA deslizando no chão (instanciadas) */}
        <primitive object={built.poolsIM} />
    </>);
};

// ── FLORESTA-FANTASMA: anéis de silhueta ALÉM das paredes (profundidade) ─────
// Sem fog (fog:false): no calmo são manchas mais escuras que o breu; na onda
// (fog claro) elas RECORTAM como uma muralha de gigantes. 2 draw calls.
const GhostForest: React.FC<{ low: boolean }> = ({ low }) => {
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
        // troncos-coluna gigantes INSTANCIADOS (brief §2: colunas de catedral
        // que SOMEM no teto — eram 6 draws soltos; agora 1)
        const colGeo = new THREE.CylinderGeometry(1.3, 2.6, 22, 9);
        const cols = new THREE.InstancedMesh(colGeo, M9.bark, 6);
        ([[-31.5, -12], [31.5, -30], [-30.5, -48], [31.5, -8], [-31.5, -30], [12, -50]] as const).forEach(([x, z], i) => {
            m4.compose(pos.set(x, 8, z), q.identity(), sc.set(1, 1, 1));
            cols.setMatrixAt(i, m4);
        });
        cols.instanceMatrix.needsUpdate = true;
        return { trunks, canopies, cols, geos: [trunkGeo, canopyGeo, colGeo] };
    }, []);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    return (<>
        {/* os ANÉIS de gigantes somem no low (P0: "sem ghost forest extra");
            as colunas da nave ficam em todos os tiers */}
        {!low && <primitive object={built.trunks} />}
        {!low && <primitive object={built.canopies} />}
        <primitive object={built.cols} />
    </>);
};

const MossPatches: React.FC = () => {
    // TUDO instanciado: coração (9), pedrinhas (9×3) e discos (9) = 3 draws no
    // total (eram 45). O amount de cada patch vira escala por instância (o
    // emissive pulsa no material compartilhado — lê junto, a variação por
    // patch fica na ESCALA, que é o que a fauna segue).
    const built = useMemo(() => {
        const n = f9eco.moss.length;
        const heartGeo = new THREE.IcosahedronGeometry(1.4, 1);
        const pebGeo = new THREE.IcosahedronGeometry(1, 0);
        const discGeo = new THREE.CircleGeometry(2.0, 12);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({ color: '#4ade82', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending });
        const hearts = new THREE.InstancedMesh(heartGeo, M9.moss, n);
        hearts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const pebbles = new THREE.InstancedMesh(pebGeo, M9.moss, n * 3);
        const discs = new THREE.InstancedMesh(discGeo, discMat, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        f9eco.moss.forEach((m, i) => {
            const gy = f9GroundHeight(m.x, m.z) + 0.02;
            eu.set(0, i * 1.7, 0); q.setFromEuler(eu);
            m4.compose(pos.set(m.x, gy, m.z), q, sc.set(1, 0.28, 1));
            hearts.setMatrixAt(i, m4);
            for (let k = 0; k < 3; k++) {
                const a = (k / 3) * Math.PI * 2 + i;
                const s = 0.4 + (k % 2) * 0.2;
                eu.set(0, a, 0); q.setFromEuler(eu);
                m4.compose(pos.set(m.x + Math.cos(a) * 1.1, gy + 0.04, m.z + Math.sin(a) * 1.1), q, sc.set(s, s * 0.3, s));
                pebbles.setMatrixAt(i * 3 + k, m4);
            }
            eu.set(0, 0, 0); q.setFromEuler(eu);
            m4.compose(pos.set(m.x, gy + 0.12, m.z), q, sc.set(1, 1, 1));
            discs.setMatrixAt(i, m4);
        });
        hearts.instanceMatrix.needsUpdate = true;
        pebbles.instanceMatrix.needsUpdate = true;
        discs.instanceMatrix.needsUpdate = true;
        return { hearts, pebbles, discs, all: [heartGeo, pebGeo, discGeo], discMat };
    }, []);
    useEffect(() => () => { built.all.forEach((g) => g.dispose()); built.discMat.dispose(); }, [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), pos: new THREE.Vector3(), eu: new THREE.Euler() }), []);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const { m4, q, sc, pos, eu } = scratch;
        // o brilho do tapete sagrado pulsa junto (material único) — e o amount
        // de cada patch dirige a ESCALA da instância (musgo comido encolhe)
        M9.moss.emissiveIntensity = 0.55 + Math.sin(t * 1.4) * 0.06;
        f9eco.moss.forEach((m, i) => {
            const s = 0.6 + m.amount * 0.55;
            eu.set(0, i * 1.7, 0); q.setFromEuler(eu);
            pos.set(m.x, f9GroundHeight(m.x, m.z) + 0.02, m.z);
            m4.compose(pos, q, sc.set(s, s * 0.28, s));
            built.hearts.setMatrixAt(i, m4);
        });
        built.hearts.instanceMatrix.needsUpdate = true;
    });
    return (<>
        <primitive object={built.hearts} />
        <primitive object={built.pebbles} />
        <primitive object={built.discs} />
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
/** O FAROL DO OBJETIVO: pilar de luz na RAIZ (landmark da árvore-mãe, sobre a
 *  copa) + um NÓ-GUIA flutuante que segue o MESMO passo do HUD das oferendas —
 *  achar o fruto mais próximo (dourado) → carregando, a Raiz (dourado) →
 *  passagem aberta, o portal (âmbar) → e vira ÂMBAR pro oco mais próximo durante
 *  aviso/onda (sobreviver primeiro). */
const ObjectiveBeacon: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const marker = useRef<THREE.Group>(null!);
    const pillar = useRef<THREE.Mesh>(null!);
    const markerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff4a52', transparent: true, opacity: 0.95, depthWrite: false }), []);
    const haloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff4a52', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const p = playerPositionRef.current;
        const emergency = f9eco.phase === 'aviso' || f9eco.phase === 'onda';
        // pilar da raiz respira; some quando você chega
        if (pillar.current) {
            pillar.current.visible = f9.phase === 'explorar' || f9.phase === 'chegada';
            (pillar.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 1.1) * 0.035;
        }
        if (!marker.current) return;
        marker.current.visible = f9.phase === 'explorar';
        if (!marker.current.visible) return;
        let tx: number, tz: number;
        if (emergency) {
            // sobreviver primeiro: aponta o OCO mais próximo (âmbar)
            let bx = F9_OCOS[0][0], bz = F9_OCOS[0][1], bd = Infinity;
            for (const [ox, oz] of F9_OCOS) {
                const d = (p.x - ox) ** 2 + (p.z - oz) ** 2;
                if (d < bd) { bd = d; bx = ox; bz = oz; }
            }
            tx = bx; tz = bz;
            markerMat.color.setStyle('#ffca7a'); haloMat.color.setStyle('#ffca7a');
        } else if (f9eco.rootState === 'desabrochada') {
            // a passagem abriu: o PORTAL à frente da Raiz (âmbar forte)
            tx = F9_RAIZ[0]; tz = F9_RAIZ[1] + 2.5;
            markerMat.color.setStyle('#ffca4a'); haloMat.color.setStyle('#ffca4a');
        } else if (f9eco.offerings.some((o) => o.state === 'carregada')) {
            // carregando: leve a oferenda à RAIZ (dourado)
            tx = F9_RAIZ[0]; tz = F9_RAIZ[1];
            markerMat.color.setStyle('#ffd97a'); haloMat.color.setStyle('#ffd97a');
        } else {
            // padrão: o FRUTO (no chão) mais próximo — o próximo passo (dourado)
            let bx = F9_RAIZ[0], bz = F9_RAIZ[1], bd = Infinity;
            for (const o of f9eco.offerings) {
                if (o.state !== 'noChao') continue;
                const d = (p.x - o.x) ** 2 + (p.z - o.z) ** 2;
                if (d < bd) { bd = d; bx = o.x; bz = o.z; }
            }
            tx = bx; tz = bz;
            markerMat.color.setStyle('#ffd97a'); haloMat.color.setStyle('#ffd97a');
        }
        marker.current.position.x += (tx - marker.current.position.x) * 0.08;
        marker.current.position.z += (tz - marker.current.position.z) * 0.08;
        marker.current.position.y = f9GroundHeight(tx, tz) + 2.1 + Math.sin(t * 2.2) * 0.25;
        marker.current.rotation.y = t * 1.4;
        const pulse = 1 + Math.sin(t * 3.1) * 0.12;
        marker.current.scale.setScalar(pulse);
    });
    return (<>
        {/* o pilar da RAIZ atravessando a copa */}
        <mesh ref={pillar} position={[F9_RAIZ[0], 9, F9_RAIZ[1] - 2.5]}>
            <cylinderGeometry args={[0.7, 1.6, 20, 12, 1, true]} />
            <meshBasicMaterial color="#ffd98a" transparent opacity={0.11} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} fog={false} />
        </mesh>
        {/* o nó-guia flutuante */}
        <group ref={marker} visible={false}>
            <mesh material={markerMat}><torusKnotGeometry args={[0.22, 0.07, 48, 6]} /></mesh>
            <mesh material={haloMat}><sphereGeometry args={[0.55, 10, 8]} /></mesh>
            {/* a setinha caída apontando pro chão */}
            <mesh position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]} material={markerMat}><coneGeometry args={[0.12, 0.3, 5]} /></mesh>
        </group>
    </>);
};

// ── O FIO VERMELHO foi REMOVIDO (pedido do Felipe): era muleta de UI e não
//    combina com o Viveiro — Rain World não te dá linha, te faz LER o mundo. A
//    navegação virou diegética: a RAIZ como farol (pilar de luz sobre a copa) +
//    as colunas douradas das oferendas + o nó-guia. F9_FIO segue só como layout
//    INVISÍVEL (as árvores-mãe abrem uma clareira até a Raiz, sem thread). ──

// ── OCOS REAIS (M18): tronco em C com BOCA de verdade no ângulo da colisão
//    (F9_OCO_MOUTH — mesma fonte de constants), interior com chão de musgo,
//    fungos-prateleira e raízes penduradas, e a entrada emoldurada por
//    cogumelos + a luz de dentro VAZANDO pela boca (o farol natural — sem
//    seta). As 4 point lights são as MESMAS de antes, só mudaram pra dentro. ──
const OCO_GAP_HALF = 0.62; // rad — vão visual do tronco (colisão usa 0.72)
const Oco: React.FC<{ i: number; lite: boolean }> = ({ i, lite }) => {
    const [x, z] = F9_OCOS[i];
    const mouth = F9_OCO_MOUTH[i];
    const gy = f9GroundHeight(x, z);
    const built = useMemo(() => {
        // cilindro: x = r·sinθ, z = r·cosθ ⇒ θ = π/2 − a (a = ângulo mundo)
        const thetaC = Math.PI / 2 - mouth;
        const trunkGeo = new THREE.CylinderGeometry(1.6, 2.15, 6.8, 12, 1, true, thetaC + OCO_GAP_HALF, Math.PI * 2 - OCO_GAP_HALF * 2);
        // DoubleSide + madeira de MIOLO (mais clara que a casca) + emissive:
        // o interior é legível mesmo no breu — cerne exposto, não breu vazio
        const barkIn = M9.bark.clone(); barkIn.side = THREE.DoubleSide;
        barkIn.color = new THREE.Color('#a89070');
        barkIn.emissive = new THREE.Color('#4a3418'); barkIn.emissiveIntensity = 0.3;
        const canopyGeo = jittered(new THREE.IcosahedronGeometry(2.5, 1), 0.5, 91 + i);
        const floorMat = new THREE.MeshStandardMaterial({ color: '#31402a', roughness: 1, emissive: '#ff9a4a', emissiveIntensity: 0.1 });
        const haloMat = new THREE.MeshBasicMaterial({ color: '#ffca7a', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
        return { trunkGeo, barkIn, canopyGeo, floorMat, haloMat };
    }, [i, mouth]);
    useEffect(() => () => { built.trunkGeo.dispose(); built.barkIn.dispose(); built.canopyGeo.dispose(); built.floorMat.dispose(); built.haloMat.dispose(); }, [built]);
    const mx = Math.cos(mouth), mz = Math.sin(mouth);            // direção da boca
    const px_ = -mz, pz_ = mx;                                   // perpendicular
    const lipR = 2.0;                                            // raio das ombreiras
    const chord = Math.sin(OCO_GAP_HALF) * lipR;                 // meia-largura da boca
    const padY = (d: number) => f9GroundHeight(x + mx * d, z + mz * d);
    return (
        <group>
            {/* o tronco em C (DoubleSide: o interior existe de verdade) */}
            <mesh position={[x, gy + 3.0, z]} geometry={built.trunkGeo} material={built.barkIn} />
            <mesh position={[x, gy + 6.2, z]} geometry={built.canopyGeo} material={M9.canopyDark} />
            {/* chão interno de musgo morno + a luz do santuário (a MESMA de antes) */}
            <mesh position={[x, gy + 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} material={built.floorMat}>
                <circleGeometry args={[1.95, 14]} />
            </mesh>
            <pointLight position={[x, gy + 2.2, z]} distance={7} decay={2} color="#ffca7a" intensity={4.2} />
            {/* OMBREIRAS + VERGA: a boca é uma moldura intencional, não um corte */}
            {[-1, 1].map((s) => (
                <mesh key={s} position={[x + mx * lipR * Math.cos(OCO_GAP_HALF) + px_ * chord * s, gy + 1.5, z + mz * lipR * Math.cos(OCO_GAP_HALF) + pz_ * chord * s]}
                    rotation={[0.1 * s, Math.PI / 2 - mouth, 0.14 * -s]} material={M9.bark}>
                    <cylinderGeometry args={[0.17, 0.24, 3.2, 6]} />
                </mesh>
            ))}
            <mesh position={[x + mx * lipR * 0.92, gy + 3.05, z + mz * lipR * 0.92]}
                rotation={[0, Math.PI / 2 - mouth, Math.PI / 2]} material={M9.bark}>
                <cylinderGeometry args={[0.15, 0.15, chord * 2 + 0.7, 6]} />
            </mesh>
            {/* fungos emoldurando a entrada (teal fora, âmbar na verga) */}
            {[-1, 1].flatMap((s) => [0, 1].map((k) => (
                <mesh key={`${s}:${k}`} position={[x + mx * (lipR + 0.25) + px_ * (chord + 0.15) * s, gy + 0.16 + k * 0.34, z + mz * (lipR + 0.25) + pz_ * (chord + 0.15) * s]} material={M9.shroomCap}>
                    <coneGeometry args={[0.16 - k * 0.05, 0.2, 6]} />
                </mesh>
            )))}
            <mesh position={[x + mx * lipR * 0.95, gy + 3.3, z + mz * lipR * 0.95]} material={M9.shroomCapAmber}>
                <coneGeometry args={[0.15, 0.2, 6]} />
            </mesh>
            {/* dentro: prateleira de fungos + raízes penduradas (somem no lite) */}
            {!lite && [0, 1, 2].map((k) => {
                const a = mouth + Math.PI + (k - 1) * 0.8;
                const wr = 2.02 - (0.9 + k * 0.5) * 0.08; // encostados NA parede (raio segue o afunilamento)
                return (
                    <mesh key={k} position={[x + Math.cos(a) * wr, gy + 0.9 + k * 0.5, z + Math.sin(a) * wr]} material={M9.shroomCapAmber}>
                        <coneGeometry args={[0.13, 0.18, 6]} />
                    </mesh>
                );
            })}
            {!lite && [0, 1].map((k) => {
                const a = mouth + Math.PI + (k === 0 ? -0.5 : 0.6);
                return (
                    <mesh key={k} position={[x + Math.cos(a) * 1.0, gy + 3.4, z + Math.sin(a) * 1.0]} material={M9.bark}>
                        <cylinderGeometry args={[0.03, 0.06, 1.6, 4]} />
                    </mesh>
                );
            })}
            {/* raízes-contraforte EXTERNAS (recuadas da boca) */}
            {[0.95, Math.PI, -0.95].map((off, k) => {
                const a = mouth + off;
                return (
                    <mesh key={k} position={[x + Math.cos(a) * 2.0, gy + 0.4, z + Math.sin(a) * 2.0]} rotation={[0, -a, 1.1]} material={M9.bark}>
                        <cylinderGeometry args={[0.09, 0.6, 1.5, 5]} />
                    </mesh>
                );
            })}
            {/* o TAPETE DE LUZ: dois discos no chão saindo da boca (trilha) */}
            <mesh position={[x + mx * 2.9, padY(2.9) + 0.05, z + mz * 2.9]} rotation={[-Math.PI / 2, 0, 0]} material={M9.ocoGlow}>
                <circleGeometry args={[0.75, 12]} />
            </mesh>
            <mesh position={[x + mx * 3.1, padY(3.1) + 0.045, z + mz * 3.1]} rotation={[-Math.PI / 2, 0, 0]} material={built.haloMat}>
                <circleGeometry args={[1.35, 12]} />
            </mesh>
        </group>
    );
};
const Ocos: React.FC = () => {
    const lite = f9IsLite(useMemo(f9Quality, []));
    return (<>{F9_OCOS.map((_, i) => <Oco key={i} i={i} lite={lite} />)}</>);
};

// ── V4: A RAIZ DORMENTE → DESABROCHADA ───────────────────────────────────────
// 3 corações-vagens no tronco ACENDEM por rootWake (emissive — SEM luz nova:
// a point light EXISTENTE da Raiz só ganha intensidade por estágio, é o farol
// do objetivo). God rays intensificam + veias de raiz brilhantes se espalham
// no chão (instanciadas, instanceColor por estágio). Desabrochada: tudo no máx.
const RAIZ_VEINS = 12; // 4 veias por estágio
const Raiz: React.FC = () => {
    const quality = useMemo(f9Quality, []);
    // as 6 raízes INSTANCIADAS (eram 6 draws; agora 1)
    const roots = useMemo(() => {
        const geo = new THREE.CylinderGeometry(0.28, 0.95, 4.6, 6);
        const im = new THREE.InstancedMesh(geo, M9.bark, 6);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), eu = new THREE.Euler();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            eu.set(0, -a, 0.95); q.setFromEuler(eu);
            m4.compose(pos.set(Math.cos(a) * 3.6, 0.7, Math.sin(a) * 3.6), q, sc);
            im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        return im;
    }, []);
    // corações + raios + veias (materiais próprios pra animar por estágio)
    const v4 = useMemo(() => {
        const hearts = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: '#4a3210', emissive: '#ffca4a', emissiveIntensity: 0.12, roughness: 0.4 }));
        const rays = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        const veinGeo = new THREE.BoxGeometry(0.16, 0.05, 1);
        const veinMat = new THREE.MeshStandardMaterial({ color: '#241a08', emissive: '#ffca4a', emissiveIntensity: 0.9, roughness: 0.7 });
        const veins = new THREE.InstancedMesh(veinGeo, veinMat, RAIZ_VEINS);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        const dark = new THREE.Color('#241a08'), lit = new THREE.Color('#ffca4a');
        const veinGeoPos: Array<[number, number, number, number]> = []; // x, z, ang, len
        for (let k = 0; k < RAIZ_VEINS; k++) {
            const a = (k / RAIZ_VEINS) * Math.PI * 2 + (k % 3) * 0.22;
            const len = 2.6 + (k % 4) * 1.1;
            const dist = 2.8 + len / 2;
            const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
            eu.set(0, -a + Math.PI / 2, 0); q.setFromEuler(eu);
            m4.compose(pos.set(x, 0.045, z), q, sc.set(1, 1, len));
            veins.setMatrixAt(k, m4);
            veins.setColorAt(k, dark);
            veinGeoPos.push([x, z, a, len]);
        }
        veins.instanceMatrix.needsUpdate = true;
        if (veins.instanceColor) veins.instanceColor.needsUpdate = true;
        return { hearts, rays, veins, dark, lit, veinGeo, veinMat };
    }, []);
    // M18 — a CÂMARA: tronco em C (boca +z, mesma da colisão F9_RAIZ_MOUTH),
    // verga fechando o alto da porta, chão com os ANÉIS-corredor (lore), o
    // CORAÇÃO pendurado (alvo visível da entrega) e o feixe de luz interno.
    const m18 = useMemo(() => {
        const thetaC = Math.PI / 2 - F9_RAIZ_MOUTH; // = 0 (boca em +z)
        const trunkGeo = new THREE.CylinderGeometry(2.4, 4.3, 10, 16, 1, true, thetaC + 0.34, Math.PI * 2 - 0.68);
        const lintelGeo = new THREE.CylinderGeometry(2.4, 3.42, 5.4, 6, 1, true, thetaC - 0.34, 0.68);
        const barkIn = M9.bark.clone(); barkIn.side = THREE.DoubleSide;
        barkIn.color = new THREE.Color('#9a8262');
        barkIn.emissive = new THREE.Color('#3e2c12'); barkIn.emissiveIntensity = 0.32;
        const floorMat = new THREE.MeshStandardMaterial({ color: '#2e3a26', roughness: 1, emissive: '#242010', emissiveIntensity: 0.3 });
        const ringMat = new THREE.MeshStandardMaterial({ color: '#241a08', emissive: '#ffca4a', emissiveIntensity: 0.15, roughness: 0.8 });
        const heartMat = new THREE.MeshStandardMaterial({ color: '#4a1410', emissive: '#ff7a4a', emissiveIntensity: 0.5, roughness: 0.5 });
        const shaftMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.04, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        return { trunkGeo, lintelGeo, barkIn, floorMat, ringMat, heartMat, shaftMat };
    }, []);
    const heartRefs = useRef<Array<THREE.Mesh | null>>([null, null, null]);
    const rayRefs = useRef<Array<THREE.Mesh | null>>([null, null, null]);
    const heartBigRef = useRef<THREE.Mesh>(null!);
    const lightRef = useRef<THREE.PointLight>(null!);
    const lastWake = useRef(-1);
    useEffect(() => () => {
        roots.geometry.dispose(); v4.veinGeo.dispose(); v4.veinMat.dispose();
        v4.hearts.forEach((m) => m.dispose()); v4.rays.forEach((m) => m.dispose());
        m18.trunkGeo.dispose(); m18.lintelGeo.dispose(); m18.barkIn.dispose();
        m18.floorMat.dispose(); m18.ringMat.dispose(); m18.heartMat.dispose(); m18.shaftMat.dispose();
    }, [roots, v4, m18]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const wake = f9eco.rootWake;
        const bloom = f9eco.rootState === 'desabrochada';
        // corações: wake > i aceso (pulsa como coração); desabrochada = todos vivos
        for (let i = 0; i < 3; i++) {
            const m = heartRefs.current[i]; if (!m) continue;
            const on = bloom || wake > i;
            const mat = m.material as THREE.MeshStandardMaterial;
            const beat = on ? 0.5 + Math.abs(Math.sin(t * 2.4 + i * 1.9)) * 1.6 : 0.12;
            mat.emissiveIntensity += (beat - mat.emissiveIntensity) * 0.12;
            const s = on ? 1 + Math.sin(t * 2.4 + i * 1.9) * 0.09 : 0.85;
            m.scale.setScalar(s);
        }
        // god rays sobre a copa: opacidade por estágio
        for (let i = 0; i < 3; i++) {
            const m = rayRefs.current[i]; if (!m) continue;
            const mat = m.material as THREE.MeshBasicMaterial;
            const target = bloom ? 0.3 : wake * 0.055 + Math.sin(t * 0.5 + i * 2.1) * 0.012;
            mat.opacity += (Math.max(0, target) - mat.opacity) * 0.1;
        }
        // veias: acendem 4 por estágio (instanceColor — 1 draw só)
        if (wake !== lastWake.current || bloom) {
            lastWake.current = wake;
            const litN = bloom ? RAIZ_VEINS : wake * 4;
            for (let k = 0; k < RAIZ_VEINS; k++) v4.veins.setColorAt(k, k < litN ? v4.lit : v4.dark);
            if (v4.veins.instanceColor) v4.veins.instanceColor.needsUpdate = true;
        }
        // a point light EXISTENTE vira o farol do objetivo (sem luz nova — P0)
        if (lightRef.current) lightRef.current.intensity = bloom ? 8 : 2.5 + wake * 2.2 + Math.sin(t * 2.4) * (wake > 0 ? 0.4 : 0);
        // M18 — o CORAÇÃO bate mais forte a cada entrega; anéis e feixe acordam
        m18.heartMat.emissiveIntensity = (bloom ? 2.0 : 0.45 + wake * 0.5) + Math.abs(Math.sin(t * 2.2)) * (0.3 + wake * 0.25);
        if (bloom) m18.heartMat.emissive.setStyle('#ffca4a');
        if (heartBigRef.current) heartBigRef.current.scale.setScalar(1 + Math.sin(t * 2.2) * (0.05 + wake * 0.03));
        m18.ringMat.emissiveIntensity = (bloom ? 1.3 : 0.12 + wake * 0.32) + Math.sin(t * 1.4) * 0.05;
        m18.shaftMat.opacity += ((bloom ? 0.2 : 0.03 + wake * 0.04) - m18.shaftMat.opacity) * 0.08;
    });
    return (
        <group position={[F9_RAIZ[0], 0, F9_RAIZ[1] - 2.5]}>
            {/* M18: o tronco em C (a PORTA existe) + a verga fechando o alto */}
            <mesh position={[0, 5, 0]} geometry={m18.trunkGeo} material={m18.barkIn} />
            <mesh position={[0, 7.3, 0]} geometry={m18.lintelGeo} material={m18.barkIn} />
            <primitive object={roots} />
            <mesh position={[0, 11.4, 0]} material={M9.canopyDark}><icosahedronGeometry args={[5.4, 1]} /></mesh>
            {/* ombreiras da porta: duas raízes-batente + fungos teal na base */}
            {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 1.62, 2.2, 3.95]} rotation={[0.12, 0, -s * 0.1]} material={M9.bark}>
                    <cylinderGeometry args={[0.2, 0.34, 4.6, 6]} />
                </mesh>
            ))}
            {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 1.95, 0.22, 4.05]} material={M9.shroomCap}>
                    <coneGeometry args={[0.18, 0.26, 6]} />
                </mesh>
            ))}
            {/* o INTERIOR: chão + os ANÉIS-corredor (cada anel, um andar lembrado) */}
            <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m18.floorMat}>
                <circleGeometry args={[3.95, 18]} />
            </mesh>
            {[1.15, 2.05, 2.95].map((r, k) => (
                <mesh key={k} position={[0, 0.075 + k * 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m18.ringMat}>
                    <ringGeometry args={[r - 0.055, r + 0.055, 26]} />
                </mesh>
            ))}
            {/* o CORAÇÃO pendurado (o alvo da entrega — visível da porta) */}
            <mesh position={[0, 5.9, 1.6]} rotation={[0.32, 0, 0]} material={M9.bark}>
                <cylinderGeometry args={[0.05, 0.09, 4.6, 5]} />
            </mesh>
            <mesh ref={heartBigRef} position={[0, 3.45, 2.4]} material={m18.heartMat}>
                <icosahedronGeometry args={[0.56, 1]} />
            </mesh>
            {/* costelas internas acompanhando a parede + fungos de prateleira */}
            {[1.05, 1.95, Math.PI, -1.95, -1.05].map((off, k) => {
                const a = Math.PI / 2 + off;
                return (
                    <group key={k} rotation={[0, -a, 0]}>
                        <mesh position={[3.55, 4.6, 0]} rotation={[0, 0, 0.19]} material={M9.bark}>
                            <cylinderGeometry args={[0.13, 0.3, 8.4, 5]} />
                        </mesh>
                    </group>
                );
            })}
            {[[-2.4, 0.5], [2.5, 0.9], [-1.2, 1.4]].map(([fx, fy], k) => (
                <mesh key={k} position={[fx, fy, -2.4]} material={M9.shroomCapAmber}>
                    <coneGeometry args={[0.14, 0.2, 6]} />
                </mesh>
            ))}
            {/* o FEIXE: luz descendo do olho da copa até o coração */}
            <mesh position={[0, 5.2, 1.2]} material={m18.shaftMat}>
                <coneGeometry args={[2.0, 8.2, 10, 1, true]} />
            </mesh>
            {/* os 3 CORAÇÕES-VAGENS na parede EXTERNA, ladeando a porta */}
            {[[2.7, 2.3, 2.75], [-2.7, 3.3, 2.7], [0, 5.6, 3.1]].map(([hx, hy, hz], i) => (
                <mesh key={i} ref={(el) => { heartRefs.current[i] = el; }} position={[hx, hy, hz]} material={v4.hearts[i]}>
                    <sphereGeometry args={[0.34, 10, 9]} />
                </mesh>
            ))}
            {/* god rays descendo sobre a Raiz (intensificam por estágio) —
                somem no low (P0: o finale já tem corações+veias+portal) */}
            {quality !== 'low' && [[-2.2, 7.5, 1.2, 0.16], [1.8, 7.8, 0.4, -0.12], [0.2, 8.2, 2.4, 0.06]].map(([rx, ry, rz, tilt], i) => (
                <mesh key={i} ref={(el) => { rayRefs.current[i] = el; }} position={[rx, ry, rz]} rotation={[tilt, i * 1.1, tilt * 0.7]} material={v4.rays[i]}>
                    <coneGeometry args={[1.5 + i * 0.4, 9, 8, 1, true]} />
                </mesh>
            ))}
            {/* veias de raiz brilhantes se espalhando no chão */}
            <primitive object={v4.veins} />
            {/* a luz mora DENTRO agora — vaza pela porta (a entrada se anuncia) */}
            <pointLight ref={lightRef} position={[0, 2.6, 2.4]} distance={8} decay={2} color="#ffdf8a" intensity={4} />
        </group>
    );
};

// ── RELÍQUIAS (M18 — a IDENTIDADE em cena): cada spot de oferenda guarda o
//    OBJETO da memória que o fruto é — o hotel enterrou, a floresta engoliu.
//    A moldura da FOTO (6º), o SINO do navio (7º), a LUMINÁRIA do
//    interrogatório (8º). Estáticas, ~20 draws, todas as qualities. ──
const Reliquias: React.FC = () => {
    const mats = useMemo(() => ({
        wood: new THREE.MeshStandardMaterial({ color: '#3a2e20', roughness: 0.9 }),
        photo: new THREE.MeshStandardMaterial({ color: '#cfc8b0', roughness: 0.8, emissive: '#d8d0b8', emissiveIntensity: 0.2, side: THREE.DoubleSide }),
        bronze: new THREE.MeshStandardMaterial({ color: '#4a6a5e', roughness: 0.5, metalness: 0.55, emissive: '#40e0d0', emissiveIntensity: 0.08 }),
        metal: new THREE.MeshStandardMaterial({ color: '#2e3234', roughness: 0.6, metalness: 0.5 }),
        shade: new THREE.MeshStandardMaterial({ color: '#2a4a34', roughness: 0.5, emissive: '#e8e4c0', emissiveIntensity: 0.22 }),
        vine: new THREE.MeshStandardMaterial({ color: '#2e4a2a', roughness: 1 }),
    }), []);
    useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); }, [mats]);
    const spots = useMemo(() => freshOfferings(), []);
    const gy = (x: number, z: number) => f9GroundHeight(x, z);
    const foto = spots.find((o) => o.spot === 'guardiao')!;   // a FOTO (6º)
    const navio = spots.find((o) => o.spot === 'oco')!;       // o NAVIO (7º)
    const inter = spots.find((o) => o.spot === 'vulto')!;     // o INTERROGATÓRIO (8º)
    return (<>
        {/* A MOLDURA DA FOTO — meio engolida, vidro rachado, vinhas por cima */}
        <group position={[foto.x + 1.7, gy(foto.x + 1.7, foto.z - 1.0) - 0.12, foto.z - 1.0]} rotation={[-0.12, -0.55, 0.05]} scale={[0.82, 0.82, 0.82]}>
            {[[0, 1.06, 1.7, 0.12], [0, -1.06, 1.7, 0.12], [-0.79, 0, 0.12, 2.0], [0.79, 0, 0.12, 2.0]].map(([bx, by, w, h], k) => (
                <mesh key={k} position={[bx, by + 1.05, 0]} material={mats.wood}><boxGeometry args={[w, h, 0.14]} /></mesh>
            ))}
            <mesh position={[0, 1.05, -0.02]} material={mats.photo}><planeGeometry args={[1.46, 1.96]} /></mesh>
            <mesh position={[0.22, 1.2, 0.02]} rotation={[0, 0, 0.6]} material={mats.wood}><boxGeometry args={[0.02, 1.4, 0.02]} /></mesh>
            <mesh position={[-0.3, 0.6, 0.09]} rotation={[0, 0, 1.2]} material={mats.vine}><cylinderGeometry args={[0.035, 0.05, 1.9, 5]} /></mesh>
            <mesh position={[0.4, 1.5, 0.09]} rotation={[0, 0, -0.9]} material={mats.vine}><cylinderGeometry args={[0.03, 0.045, 1.5, 5]} /></mesh>
        </group>
        {/* O SINO DO NAVIO — pendurado numa raiz-forca, âncora meio enterrada */}
        <group position={[navio.x - 1.4, gy(navio.x - 1.4, navio.z + 1.1), navio.z + 1.1]} rotation={[0, -0.6, 0]}>
            <mesh position={[0, 1.25, 0]} rotation={[0, 0, 0.14]} material={M9.bark}><cylinderGeometry args={[0.09, 0.14, 2.5, 5]} /></mesh>
            <mesh position={[0.42, 2.34, 0]} rotation={[0, 0, 1.45]} material={M9.bark}><cylinderGeometry args={[0.06, 0.09, 0.9, 5]} /></mesh>
            <mesh position={[0.74, 2.06, 0]} material={mats.bronze}><coneGeometry args={[0.3, 0.46, 10, 1, true]} /></mesh>
            <mesh position={[0.74, 1.8, 0]} material={mats.metal}><sphereGeometry args={[0.07, 6, 6]} /></mesh>
            <mesh position={[-0.5, 0.16, 0.5]} rotation={[Math.PI / 2 - 0.3, 0, 0.4]} material={mats.bronze}>
                <torusGeometry args={[0.42, 0.08, 6, 10, Math.PI]} />
            </mesh>
            <mesh position={[-0.5, 0.55, 0.42]} rotation={[0.24, 0, 0]} material={mats.bronze}><cylinderGeometry args={[0.06, 0.06, 1.0, 6]} /></mesh>
        </group>
        {/* A LUMINÁRIA DO INTERROGATÓRIO — mesa afundada, abajur ainda aceso */}
        <group position={[inter.x + 1.5, gy(inter.x + 1.5, inter.z + 1.0), inter.z + 1.0]} rotation={[0, 0.9, 0]}>
            <mesh position={[0, 0.52, 0]} rotation={[0.16, 0, -0.1]} material={mats.wood}><boxGeometry args={[1.6, 0.09, 0.9]} /></mesh>
            <mesh position={[-0.62, 0.2, 0.3]} rotation={[0, 0, 0.12]} material={mats.wood}><boxGeometry args={[0.09, 0.55, 0.09]} /></mesh>
            <mesh position={[0.66, 0.24, -0.28]} material={mats.wood}><boxGeometry args={[0.09, 0.62, 0.09]} /></mesh>
            <mesh position={[0.3, 0.82, 0.1]} rotation={[0.16, 0, 0.3]} material={mats.metal}><cylinderGeometry args={[0.035, 0.05, 0.55, 6]} /></mesh>
            <mesh position={[0.44, 1.05, 0.14]} rotation={[0.5, 0, 0.7]} material={mats.shade}><coneGeometry args={[0.24, 0.3, 10, 1, true]} /></mesh>
            <mesh position={[-0.9, 0.34, -0.7]} rotation={[-1.4, 0.3, 0.5]} material={mats.wood}><boxGeometry args={[0.45, 0.8, 0.06]} /></mesh>
            <mesh position={[-1.0, 0.2, -0.5]} rotation={[-1.35, 0.3, 0.5]} material={mats.wood}><boxGeometry args={[0.42, 0.5, 0.05]} /></mesh>
        </group>
    </>);
};

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
        const lite = f9IsLite(quality); // P0: tier leve = brightness floor + orçamentos
        // o color script: o estado CORRENTE (nasce no calmo, já com o piso de
        // brilho se for tier leve) + a última fase
        const look = useMemo(() => {
            const l = cloneLook(F9_LOOKS.calmo);
            if (f9IsLite(quality)) brightenLookLite(l);
            return l;
        }, [quality]);
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
            // V4: carregar oferenda = lento e BARULHENTO — ruído com piso 0.7
            // (os vultos te ouvem) + hunt.carry (o motor caça a ×1.6 de alcance)
            const carrying = f9eco.offerings.some((o) => o.state === 'carregada');
            f9EcoTick(dt, p.x, p.z, 24, {
                huntable: f9.phase === 'explorar',
                safeInOco: f9.abrigo >= 0,
                stillT: still.current.t,
                noise: carrying ? Math.max(0.7, noiseRef.current.v) : noiseRef.current.v,
                carry: carrying,
            });
            f9Tick(dt, p.x, p.z);
            for (const e of f9DrainEvents()) {
                floor9SfxFloresta(e);
                // V4: morreu carregando (onda OU vulto) → a oferenda volta pro spot
                if (e === 'apagado') f9DropOffering();
                // SOFTLOCK FIX (P0): no replantio o player ACORDA na boca do
                // oco mais próximo (padrão do bench floor9-dev). Sem isso ele
                // renascia no MESMO lugar onde foi pego → pego de novo no
                // frame seguinte → loop infinito de morte. Acordar na boca do
                // oco = abrigo imediato (safeInOco) tanto pra onda quanto pro
                // vulto. O noiseRef acompanha o teleporte: senão o salto vira
                // "ruído" gigante e atrai o predador de volta ao abrigo.
                if (e === 'replantado') {
                    let best = F9_OCOS[0], bd = Infinity;
                    for (const o of F9_OCOS) {
                        const d = (p.x - o[0]) ** 2 + (p.z - o[1]) ** 2;
                        if (d < bd) { bd = d; best = o; }
                    }
                    // DENTRO do raio do oco (safeInOco): a boca (z+r+0.7) fica
                    // FORA do raio — se a onda ainda estiver ativa o player
                    // seria pego no tick seguinte (o loop do vídeo do Felipe)
                    p.set(best[0], 0, best[1] + best[2] * 0.35);
                    noiseRef.current.lx = p.x; noiseRef.current.lz = p.z; noiseRef.current.v = 0;
                }
            }
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
            // PISO DE BRILHO do tier leve (P0 mobile): o grade escuro "Rain
            // World" fica só no high — sem composer, amb/hemi sobem e o fog
            // clareia (floresta legível, Fiapo sempre visível)
            if (lite) brightenLookLite(lookTarget);
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

                {/* P0 mobile — orçamentos por tier:
                    high:   sway pleno (copas + 560 frondes + moldura) + névoa +
                            ghost-forest + 8 faróis + composer.
                    medium: copas ESTÁTICAS, vento SÓ em aviso/onda (≤150 frondes
                            + ≤50 da moldura = ≤200 plantas), sem névoa de chão,
                            ghost-forest ligada, 4 faróis, fireflies 60, esporos 200.
                    low:    sem vento nenhum, sem ghost-forest extra (os anéis —
                            as colunas ficam), sem névoa, 4 faróis, flora reduzida. */}
                <Trees sway={quality === 'high'} />
                <Undergrowth low={quality === 'low'} swayMode={quality === 'high' ? 'full' : quality === 'medium' ? 'storm' : 'off'} />
                <ForegroundFringe low={quality === 'low'} swayMode={quality === 'high' ? 'full' : quality === 'medium' ? 'storm' : 'off'} />
                <CanopyAndLight low={quality === 'low'} />
                <GhostForest low={quality === 'low'} />
                <MossPatches />
                <Fireflies low={quality !== 'high'} />
                <Spores low={quality !== 'high'} />
                {quality === 'high' && <GroundMist />}
                <ObjectiveBeacon playerPositionRef={playerPositionRef} />
                <Ocos />
                <Reliquias />
                <Raiz />
                {/* V4: as 3 oferendas + portal (objetivo do andar) */}
                <Floor9Oferendas playerPositionRef={playerPositionRef} />

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
