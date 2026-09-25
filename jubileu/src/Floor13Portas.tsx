/**
 * Floor13Portas.tsx — cada casa com a sua porta.
 *
 * A pista "a porta é de LATÃO" só funciona se latão parecer metal e se cada
 * porta tiver cara de gente morando atrás dela. Antes eram placas chapadas
 * amarelas, iguais nas três casas de latão. Agora:
 *
 *  - ᚨ (a casa certa): duas folhas de latão Art Déco — moldura, raios de sol,
 *    frisos, rebites —, a botoeira de latão com o botão aceso ao lado e o
 *    mostrador de andar em meia-lua em cima. É um elevador disfarçado.
 *  - ᚢ (Gunnar, "troquei com um mercador"): latão velho com manchas verdes,
 *    faixas rebitadas e uma argola grande de bater.
 *  - ᚲ (a casa de luto): latão canelado com o pano preto de luto caído por
 *    cima e uma guirlanda seca.
 *  - ᚠ (sopa): carvalho com dobradiças de ferro em flor-de-lis e argola.
 *  - ᚦ (a avó): tábuas pintadas de verde-água, descascando, sol entalhado; o
 *    botão de madeira com cordão que o neto fez ("faz ÉÉÉ").
 *  - ᚱ (Leif): carvalho cravejado; o botão de ferro acende a lanterna ao lado.
 *  - ᚷ (vazia): tábuas cinzentas, duas travessas pregadas em X e teia.
 *
 * Cor, relevo (bumpMap) e rugosidade são desenhados em canvas: uma caixa por
 * folha dá painéis, frisos, veios e rebites sem malha extra. O que sai da
 * porta (argola, pano, lanterna, botões) é malha de verdade.
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';

export type EstiloDePorta = 'elevador' | 'mercador' | 'luto' | 'ferragens' | 'avo' | 'lanterna' | 'abandonada' | 'simples';
/** Estilo de cada uma das sete casas (na ordem de CASAS em f13Lore). */
export const ESTILO_DA_CASA: ReadonlyArray<EstiloDePorta> = Object.freeze(['ferragens', 'mercador', 'avo', 'elevador', 'lanterna', 'luto', 'abandonada']);

/** Largura e altura do vão (as folhas), no espaço da casa. */
const LV = 1.05, AV = 1.6;

type Pincel = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;
interface Jogo { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }
const jogos = new Map<string, Jogo>();
function semente(k0: number): () => number { let k = k0; return () => { k = (k * 16807) % 2147483647; return k / 2147483647; }; }
function tela(w: number, h: number, pinta: Pincel, k: number, fundo: string): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = fundo; g.fillRect(0, 0, w, h);
    pinta(g, w, h, semente(k));
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
}
/** Cor, relevo e rugosidade de uma folha (cacheados pelo nome). */
function jogo(nome: string, w: number, h: number, cor: Pincel, relevo: Pincel, rug: Pincel, k = 7): Jogo {
    let j = jogos.get(nome);
    if (!j) {
        const map = tela(w, h, cor, k, '#808080'); map.colorSpace = THREE.SRGBColorSpace;
        j = { map, bumpMap: tela(w, h, relevo, k, '#808080'), roughnessMap: tela(w, h, rug, k, '#808080') };
        jogos.set(nome, j);
    }
    return j;
}

// ── PINCÉIS ─────────────────────────────────────────────────────────────────
/** Latão escovado com pátina nas bordas e sujeira no pé; `velho` põe azinhavre. */
const latao = (velho: number): Pincel => (g, w, h, r) => {
    g.fillStyle = velho ? '#a8803f' : '#bf9448'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) { g.fillStyle = `rgba(${r() > .5 ? '255,235,190' : '60,40,10'},${.04 + r() * .07})`; g.fillRect(x, 0, 1, h); }
    const borda = g.createLinearGradient(0, 0, w, 0);
    borda.addColorStop(0, 'rgba(50,32,10,.45)'); borda.addColorStop(.12, 'rgba(50,32,10,0)'); borda.addColorStop(.88, 'rgba(50,32,10,0)'); borda.addColorStop(1, 'rgba(50,32,10,.45)');
    g.fillStyle = borda; g.fillRect(0, 0, w, h);
    const pe = g.createLinearGradient(0, h, 0, h * .7); pe.addColorStop(0, 'rgba(40,26,10,.55)'); pe.addColorStop(1, 'rgba(40,26,10,0)');
    g.fillStyle = pe; g.fillRect(0, h * .7, w, h * .3);
    for (let i = 0; i < velho * 26; i++) {
        const x = r() * w, y = r() * h, s = 4 + r() * 16;
        const m = g.createRadialGradient(x, y, 0, x, y, s); m.addColorStop(0, 'rgba(70,120,95,.35)'); m.addColorStop(1, 'rgba(70,120,95,0)');
        g.fillStyle = m; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
};
/** Tábuas verticais de madeira com veio (tom e número de tábuas variam). */
const tabuas = (base: [number, number, number], n: number, gasto = 0): Pincel => (g, w, h, r) => {
    const lw = w / n;
    for (let i = 0; i < n; i++) {
        const k = .85 + r() * .3;
        g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; g.fillRect(i * lw, 0, lw, h);
        for (let v = 0; v < 14; v++) {
            const x = i * lw + r() * lw; g.strokeStyle = `rgba(20,10,4,${.1 + r() * .18})`; g.lineWidth = .6 + r() * 1.2;
            g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - .5) * 6, h * .3, x + (r() - .5) * 6, h * .7, x + (r() - .5) * 4, h); g.stroke();
        }
        if (r() < .7) { const y = r() * h; g.fillStyle = 'rgba(25,12,5,.55)'; g.beginPath(); g.ellipse(i * lw + lw / 2, y, 3 + r() * 3, 6 + r() * 5, 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(12,6,2,.8)'; g.fillRect(i * lw, 0, 2, h);
    }
    if (gasto) { g.fillStyle = `rgba(150,150,150,${gasto})`; g.fillRect(0, 0, w, h); }
};
const tabuasRelevo = (n: number): Pincel => (g, w, h) => {
    const lw = w / n;
    for (let i = 0; i < n; i++) {
        const gr = g.createLinearGradient(i * lw, 0, (i + 1) * lw, 0);
        gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(.15, '#9a9a9a'); gr.addColorStop(.85, '#9a9a9a'); gr.addColorStop(1, '#5a5a5a');
        g.fillStyle = gr; g.fillRect(i * lw, 0, lw, h);
        g.fillStyle = '#202020'; g.fillRect(i * lw, 0, 2, h);
    }
};
const rebites = (g: CanvasRenderingContext2D, pts: Array<[number, number]>, r: number, cor: string) => {
    for (const [x, y] of pts) { g.fillStyle = cor; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
};
/** Dobradiça de ferro em flor-de-lis, da borda esquerda até 70% da folha. */
const dobradica = (g: CanvasRenderingContext2D, w: number, y: number, cor: string) => {
    g.fillStyle = cor; g.fillRect(0, y - 7, w * .66, 14);
    g.beginPath(); g.moveTo(w * .66, y - 14); g.quadraticCurveTo(w * .76, y, w * .66, y + 14); g.quadraticCurveTo(w * .72, y, w * .66, y - 14); g.fill();
    g.beginPath(); g.arc(w * .74, y, 6, 0, 7); g.fill();
};

function jogoDoEstilo(e: EstiloDePorta): Jogo {
    switch (e) {
        case 'elevador': return jogo('elevador', 128, 384, (g, w, h, r) => {
            latao(0)(g, w, h, r);
            g.fillStyle = 'rgba(40,24,6,.35)'; g.fillRect(20, 232, w - 40, 128);           // painel de baixo, afundado
            g.strokeStyle = 'rgba(40,24,6,.5)'; g.lineWidth = 3; g.strokeRect(15, 15, w - 30, h - 30);
            for (const y of [180, 193, 206]) { g.fillStyle = 'rgba(255,236,190,.35)'; g.fillRect(18, y, w - 36, 4); }
        }, (g, w, h) => {
            g.strokeStyle = '#e6e6e6'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
            g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; g.strokeRect(15, 15, w - 30, h - 30);
            // raios de sol no painel de cima, nascendo do friso
            g.strokeStyle = '#d6d6d6'; g.lineWidth = 4;
            for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI; g.beginPath(); g.moveTo(w / 2, 158); g.lineTo(w / 2 + Math.cos(a) * 58, 158 + Math.sin(a) * 125); g.stroke(); }
            g.fillStyle = '#e0e0e0'; g.beginPath(); g.arc(w / 2, 158, 16, Math.PI, 0); g.fill();
            for (const y of [180, 193, 206]) { g.fillStyle = '#f0f0f0'; g.fillRect(18, y, w - 36, 5); }
            g.fillStyle = '#5c5c5c'; g.fillRect(20, 232, w - 40, 128);
            g.fillStyle = '#a8a8a8'; g.fillRect(32, 244, w - 64, 104);
            const pts: Array<[number, number]> = [];
            for (let y = 24; y < h - 16; y += 26) pts.push([10, y], [w - 10, y]);
            rebites(g, pts, 3, '#ffffff');
        }, (g, w, h) => { g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4a4a'; g.fillRect(8, 8, w - 16, 20); });
        case 'mercador': return jogo('mercador', 256, 384, (g, w, h, r) => {
            latao(1)(g, w, h, r);
            for (const y of [60, 190, 320]) { g.fillStyle = 'rgba(40,24,6,.4)'; g.fillRect(0, y - 16, w, 3); g.fillRect(0, y + 14, w, 3); }
        }, (g, w, h) => {
            g.strokeStyle = '#d0d0d0'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
            for (const y of [60, 190, 320]) {
                g.fillStyle = '#e8e8e8'; g.fillRect(0, y - 14, w, 28);
                const pts: Array<[number, number]> = []; for (let x = 14; x < w; x += 24) pts.push([x, y]);
                rebites(g, pts, 5, '#ffffff');
            }
        }, (g, w, h) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h); }, 13);
        case 'luto': return jogo('luto', 256, 384, (g, w, h, r) => {
            latao(.5)(g, w, h, r);
            for (let i = 1; i < 8; i++) { g.fillStyle = 'rgba(40,24,6,.4)'; g.fillRect(i * w / 8 - 3, 30, 6, h - 60); }
        }, (g, w, h) => {
            g.strokeStyle = '#d8d8d8'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
            for (let i = 1; i < 8; i++) {
                const x = i * w / 8, gr = g.createLinearGradient(x - 10, 0, x + 10, 0);
                gr.addColorStop(0, '#808080'); gr.addColorStop(.5, '#303030'); gr.addColorStop(1, '#808080');
                g.fillStyle = gr; g.fillRect(x - 10, 30, 20, h - 60);
            }
        }, (g, w, h) => { g.fillStyle = '#707070'; g.fillRect(0, 0, w, h); }, 17);
        case 'ferragens': return jogo('ferragens', 256, 384, (g, w, h, r) => {
            tabuas([112, 72, 42], 5)(g, w, h, r);
            for (const y of [84, 300]) dobradica(g, w, y, '#262422');
            const pts: Array<[number, number]> = []; for (const y of [84, 300]) for (let x = 16; x < w * .64; x += 30) pts.push([x, y]);
            rebites(g, pts, 3, '#55524e');
        }, (g, w, h, r) => {
            tabuasRelevo(5)(g, w, h, r);
            for (const y of [84, 300]) dobradica(g, w, y, '#e4e4e4');
        }, (g, w, h) => { g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h); for (const y of [84, 300]) dobradica(g, w, y, '#707070'); }, 23);
        case 'avo': return jogo('avo', 256, 384, (g, w, h, r) => {
            tabuas([120, 80, 48], 6)(g, w, h, r);
            // tinta verde-água descascando: manchas grandes, com a madeira aparecendo
            g.fillStyle = '#5d8a7c'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${130 + r() * 30},${86 + r() * 20},${50},.9)`; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 9, 1 + r() * 4, r() * 3, 0, 7); g.fill(); }
            for (let i = 1; i < 6; i++) { g.fillStyle = 'rgba(20,30,26,.6)'; g.fillRect(i * w / 6, 0, 2, h); }
            g.strokeStyle = '#efe6cf'; g.lineWidth = 7; g.strokeRect(10, 10, w - 20, h - 20);
            // sol entalhado e pintado de amarelo
            g.fillStyle = '#d9b44a'; g.beginPath(); g.arc(w / 2, 120, 26, 0, 7); g.fill();
            g.strokeStyle = '#d9b44a'; g.lineWidth = 5;
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 32, 120 + Math.sin(a) * 32); g.lineTo(w / 2 + Math.cos(a) * 48, 120 + Math.sin(a) * 48); g.stroke(); }
        }, (g, w, h, r) => {
            tabuasRelevo(6)(g, w, h, r);
            g.fillStyle = '#b0b0b0'; g.beginPath(); g.arc(w / 2, 120, 26, 0, 7); g.fill();
            g.strokeStyle = '#303030'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, 120, 26, 0, 7); g.stroke();
        }, (g, w, h) => { g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h); }, 29);
        case 'lanterna': return jogo('lanterna', 256, 384, (g, w, h, r) => {
            tabuas([96, 60, 36], 4)(g, w, h, r);
            const pts: Array<[number, number]> = []; for (let y = 40; y < h; y += 50) for (let x = 32; x < w; x += 64) pts.push([x, y]);
            rebites(g, pts, 6, '#2a2826'); rebites(g, pts.map(([x, y]) => [x - 1.5, y - 1.5]), 2, '#6a6560');
            g.fillStyle = '#262422'; g.fillRect(0, 150, w, 12); g.fillRect(0, 250, w, 12);
        }, (g, w, h, r) => {
            tabuasRelevo(4)(g, w, h, r);
            const pts: Array<[number, number]> = []; for (let y = 40; y < h; y += 50) for (let x = 32; x < w; x += 64) pts.push([x, y]);
            rebites(g, pts, 6, '#ffffff'); g.fillStyle = '#e0e0e0'; g.fillRect(0, 150, w, 12); g.fillRect(0, 250, w, 12);
        }, (g, w, h) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h); }, 31);
        case 'abandonada': return jogo('abandonada', 256, 384, (g, w, h, r) => {
            tabuas([122, 116, 108], 5, .18)(g, w, h, r);
            for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,36,30,${.1 + r() * .2})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 8 + r() * 30); }
            // uma tábua rachada deixa ver o escuro de dentro
            g.fillStyle = '#0c0a08'; g.beginPath(); g.moveTo(w * .42, h * .58); g.lineTo(w * .47, h * .52); g.lineTo(w * .5, h * .7); g.lineTo(w * .44, h * .78); g.fill();
        }, (g, w, h, r) => { tabuasRelevo(5)(g, w, h, r); g.fillStyle = '#101010'; g.beginPath(); g.moveTo(w * .42, h * .58); g.lineTo(w * .47, h * .52); g.lineTo(w * .5, h * .7); g.lineTo(w * .44, h * .78); g.fill(); },
            (g, w, h) => { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h); }, 37);
        default: return jogo('simples', 256, 384, tabuas([106, 70, 44], 5), tabuasRelevo(5), (g, w, h) => { g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, w, h); }, 41);
    }
}

const ehLatao = (e: EstiloDePorta) => e === 'elevador' || e === 'mercador' || e === 'luto';

/** Material de uma folha: latão é metal de verdade; madeira é madeira. */
function materialDaFolha(e: EstiloDePorta): THREE.Material {
    const j = jogoDoEstilo(e);
    if (ehLatao(e)) return new THREE.MeshPhysicalMaterial({
        map: j.map, bumpMap: j.bumpMap, bumpScale: 2.2, roughnessMap: j.roughnessMap,
        // a rugosidade vem do mapa (escovado, frisos mais lisos)
        // as três de latão brilham parecido: a do elevador (polida, Art Déco)
        // saltava do caminho como a única dourada e resolvia o enigma de longe
        metalness: 1, roughness: 1, clearcoat: .15, clearcoatRoughness: .4, envMapIntensity: e === 'elevador' ? .85 : 1.35,
        color: e === 'elevador' ? '#c9c0b0' : '#ffffff',
    });
    return new THREE.MeshStandardMaterial({ map: j.map, bumpMap: j.bumpMap, bumpScale: 3, roughnessMap: j.roughnessMap, roughness: 1, metalness: 0 });
}
const matsDaFolha = new Map<EstiloDePorta, THREE.Material>();
const matFolha = (e: EstiloDePorta) => { let m = matsDaFolha.get(e); if (!m) matsDaFolha.set(e, m = materialDaFolha(e)); return m; };

const ferro = new THREE.MeshStandardMaterial({ color: '#2c2a28', metalness: .7, roughness: .55 });
const lataoMacico = new THREE.MeshStandardMaterial({ color: '#c89a4c', metalness: 1, roughness: .3, envMapIntensity: 1.2 });
/** Pano de luto: lã preta com dobras verticais (cor e relevo), para ler como tecido e não como buraco. */
const panoPreto = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 128; x++) { const d = .5 + .5 * Math.sin(x / 128 * Math.PI * 2 * 7) * Math.sin(x / 128 * Math.PI * 2 * 2.3 + 1); const v = Math.round(22 + d * 38); g.fillStyle = `rgb(${v},${v - 3},${v - 4})`; g.fillRect(x, 0, 1, 32); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const b = new THREE.CanvasTexture(c);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 4, roughness: .9, side: THREE.DoubleSide });
})();
const madeiraClara = new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: .85 });
const madeiraVelha = new THREE.MeshStandardMaterial({ color: '#6e5a44', roughness: .95 });

/** O pano de luto: caído em curva de uma ponta à outra do batente. */
function geoPano(): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(LV + .12, .34, 16, 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / ((LV + .12) / 2), v = p.getY(i);
        const sag = (1 - u * u) * .16;
        p.setY(i, v - sag + Math.sin(u * 9) * .012);
        p.setZ(i, (1 - u * u) * .05 + (v < 0 ? .02 : 0));
    }
    g.computeVertexNormals();
    return g;
}
let _pano: THREE.BufferGeometry | null = null;

/** Teia num canto: fios radiais e espirais num canvas transparente. */
let texTeia: THREE.CanvasTexture | null = null;
function texturaDeTeia(): THREE.CanvasTexture {
    if (texTeia) return texTeia;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(235,235,230,.75)'; g.lineWidth = 1;
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 128, Math.sin(a) * 128); g.stroke(); }
    for (let r = 14; r < 128; r += 13) { g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2, rr = r + Math.sin(i * 3) * 3; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    texTeia = new THREE.CanvasTexture(c); return texTeia;
}

/**
 * As folhas da porta, dentro do grupo da porta (centro do vão, y de -0,8 a
 * 0,8). As do elevador são dois grupos "folha" (a casa certa as abre).
 */
export const FolhasDaPorta: React.FC<{ estilo: EstiloDePorta }> = ({ estilo }) => {
    const m = matFolha(estilo);
    if (estilo === 'elevador') {
        return <>{[-1, 1].map((l) => <group key={l} name="folha" userData={{ lado: l }} position={[l * LV / 4, 0, 0]}>
            <mesh material={m} scale={[l, 1, 1]}><boxGeometry args={[LV / 2 - .004, AV, .07]} /></mesh>
            {/* puxador vertical de latão maciço junto à fresta */}
            <mesh position={[-l * (LV / 4 - .05), .02, .06]} material={lataoMacico}><cylinderGeometry args={[.013, .013, .42, 10]} /></mesh>
            {[-1, 1].map((k) => <mesh key={k} position={[-l * (LV / 4 - .05), .02 + k * .19, .045]} rotation={[Math.PI / 2, 0, 0]} material={lataoMacico}><cylinderGeometry args={[.009, .009, .04, 8]} /></mesh>)}
        </group>)}</>;
    }
    return <>
        <mesh material={m}><boxGeometry args={[LV, AV, .08]} /></mesh>
        {estilo === 'mercador' && <group position={[0, .05, .07]}>
            {/* a argola grande de bater, pendendo de uma cabeça de latão */}
            <mesh material={lataoMacico}><sphereGeometry args={[.045, 16, 12]} /></mesh>
            <mesh position={[0, -.1, .012]} material={lataoMacico}><torusGeometry args={[.1, .016, 10, 28]} /></mesh>
        </group>}
        {estilo === 'luto' && <>
            <mesh position={[0, AV / 2 - .12, .07]} material={panoPreto} geometry={_pano ??= geoPano()} />
            {/* as duas abas do pano descem pelas folhas até perto do chão: de longe a
                porta lê como coberta de preto, com só uma fresta de latão no meio */}
            <mesh position={[0, AV / 2 - .72, .075]} material={panoPreto}><planeGeometry args={[LV + .04, 1.5]} /></mesh>
            {/* guirlanda seca no meio do pano */}
            <mesh position={[0, AV / 2 - .38, .12]}><torusGeometry args={[.1, .03, 8, 20]} /><meshStandardMaterial color="#4a4a2e" roughness={1} /></mesh>
        </>}
        {estilo === 'ferragens' && <mesh position={[.28, .02, .07]} rotation={[0, 0, 0]} material={ferro}><torusGeometry args={[.065, .012, 8, 20]} /></mesh>}
        {estilo === 'lanterna' && <mesh position={[.3, .05, .06]} material={ferro}><torusGeometry args={[.055, .011, 8, 18]} /></mesh>}
        {estilo === 'avo' && <mesh position={[.34, 0, .06]} material={madeiraClara}><sphereGeometry args={[.04, 12, 10]} /></mesh>}
        {estilo === 'abandonada' && <>
            {[-1, 1].map((k) => <mesh key={k} position={[0, 0, .07]} rotation={[0, 0, k * .95]} material={madeiraVelha}><boxGeometry args={[1.62, .13, .04]} /></mesh>)}
            <mesh position={[-LV / 2 + .2, AV / 2 - .2, .1]}><planeGeometry args={[.4, .4]} /><meshBasicMaterial map={texturaDeTeia()} transparent depthWrite={false} opacity={.8} /></mesh>
        </>}
    </>;
};

let texMostrador: THREE.CanvasTexture | null = null;
/** Mostrador de andar em meia-lua: números de latão e o ponteiro no 13. */
function texturaDoMostradorDeAndar(): THREE.CanvasTexture {
    if (texMostrador) return texMostrador;
    // quadrado: o centro do disco (uv 0,5) cai no centro do canvas; só a
    // metade de cima é usada pela meia-lua
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d')!;
    const f = g.createRadialGradient(128, 128, 10, 128, 128, 128); f.addColorStop(0, '#3a2a14'); f.addColorStop(1, '#1c140a');
    g.fillStyle = f; g.beginPath(); g.arc(128, 128, 124, Math.PI, 0); g.fill();
    g.strokeStyle = '#d8ae5a'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 120, Math.PI, 0); g.stroke();
    g.fillStyle = '#e8c878'; g.font = 'bold 18px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 13; n += 2) { const a = Math.PI + (n - 1) / 12 * Math.PI; g.fillText(String(n), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); }
    texMostrador = new THREE.CanvasTexture(c); texMostrador.colorSpace = THREE.SRGBColorSpace;
    return texMostrador;
}

/**
 * O que fica na parede em volta da porta, no espaço da casa (a frente da
 * parede de tábuas está em z ≈ 2,835): os botões — cada casa que tem um tem o
 * seu —, a lanterna de Leif e o mostrador de andar da casa certa.
 */
export const EnfeitesDaPorta: React.FC<{ estilo: EstiloDePorta; botao: boolean }> = ({ estilo, botao }) => {
    const z = 2.84;
    const setaTex = useMemo(() => {
        if (estilo !== 'elevador') return null;
        const c = document.createElement('canvas'); c.width = 64; c.height = 128;
        const g = c.getContext('2d')!;
        g.fillStyle = '#b8893e'; g.fillRect(0, 0, 64, 128);
        g.strokeStyle = '#6a4818'; g.lineWidth = 4; g.strokeRect(4, 4, 56, 120);
        g.fillStyle = '#5a3a10'; g.beginPath(); g.moveTo(32, 16); g.lineTo(46, 36); g.lineTo(18, 36); g.fill();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }, [estilo]);
    return <>
        {botao && estilo === 'elevador' && <group position={[.86, 1.05, z]}>
            {/* botoeira de latão rente à parede, botão âmbar aceso por dentro */}
            <mesh position={[0, 0, .008]}><boxGeometry args={[.13, .25, .016]} /><meshStandardMaterial map={setaTex!} metalness={1} roughness={.35} envMapIntensity={1.2} /></mesh>
            <mesh position={[0, -.035, .02]} rotation={[Math.PI / 2, 0, 0]} material={lataoMacico}><cylinderGeometry args={[.04, .04, .012, 20]} /></mesh>
            <mesh position={[0, -.035, .027]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.028, .028, .01, 20]} /><meshStandardMaterial color="#ffcf8a" emissive="#ff9a2a" emissiveIntensity={.9} roughness={.3} /></mesh>
        </group>}
        {botao && estilo === 'avo' && <group position={[.84, 1.05, z]}>
            {/* a campainha que o neto fez: um toco de madeira com cordão */}
            <mesh position={[0, 0, .012]} material={madeiraClara}><boxGeometry args={[.1, .14, .024]} /></mesh>
            <mesh position={[0, .015, .034]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.028, .032, .03, 12]} /><meshStandardMaterial color="#d8c8a0" roughness={.7} /></mesh>
            <mesh position={[.03, -.16, .03]}><cylinderGeometry args={[.004, .004, .26, 5]} /><meshStandardMaterial color="#c9b186" /></mesh>
            <mesh position={[.03, -.3, .03]}><sphereGeometry args={[.018, 8, 6]} /><meshStandardMaterial color="#a2402a" /></mesh>
        </group>}
        {botao && estilo === 'lanterna' && <group position={[.84, 1.05, z]}>
            <mesh position={[0, 0, .01]} material={ferro}><boxGeometry args={[.08, .11, .02]} /></mesh>
            <mesh position={[0, 0, .026]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.022, .022, .02, 12]} /><meshStandardMaterial color="#b08a4a" metalness={.9} roughness={.4} /></mesh>
        </group>}
        {estilo === 'lanterna' && <group position={[-.9, 1.5, z]}>
            {/* a lanterna de Leif: braço de ferro, gaiola e vidro aceso */}
            <mesh position={[0, .12, .09]} material={ferro}><boxGeometry args={[.025, .025, .18]} /></mesh>
            <mesh position={[0, 0, .18]} material={ferro}><boxGeometry args={[.13, .02, .13]} /></mesh>
            <mesh position={[0, -.16, .18]} material={ferro}><boxGeometry args={[.13, .02, .13]} /></mesh>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => <mesh key={`${a}${b}`} position={[a * .055, -.08, .18 + b * .055]} material={ferro}><boxGeometry args={[.012, .16, .012]} /></mesh>)}
            <mesh position={[0, -.08, .18]}><boxGeometry args={[.1, .14, .1]} /><meshStandardMaterial color="#ffd08a" emissive="#ff9a3a" emissiveIntensity={1.6} transparent opacity={.9} /></mesh>
            <mesh position={[0, .06, .18]} material={ferro}><coneGeometry args={[.09, .08, 4]} /></mesh>
        </group>}
        {estilo === 'elevador' && <group position={[0, 1.905, z + .13]}>
            {/* mostrador de andar em meia-lua em cima da verga (abaixo da placa
                da runa), ponteiro no 13 */}
            <mesh><circleGeometry args={[.15, 32, 0, Math.PI]} /><meshStandardMaterial map={texturaDoMostradorDeAndar()} metalness={.4} roughness={.5} /></mesh>
            <mesh position={[.056, .005, .008]} rotation={[0, 0, .08]} material={lataoMacico}><boxGeometry args={[.11, .01, .005]} /></mesh>
            <mesh position={[0, 0, .01]} rotation={[Math.PI / 2, 0, 0]} material={lataoMacico}><cylinderGeometry args={[.015, .015, .01, 12]} /></mesh>
        </group>}
    </>;
};
