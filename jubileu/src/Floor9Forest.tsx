/**
 * Floor9Forest.tsx — O VIVEIRO v2: a floresta-catedral do esquecimento.
 *
 * Direção de arte (o que mata o "cenário de iniciante"):
 *  - DENSIDADE: 240 árvores com copas orgânicas (geometria com jitter de
 *    vértice, cor por instância), sub-bosque de samambaias/pedras/cogumelos/
 *    troncos caídos por toda parte — chão vazio não existe em floresta.
 *  - LUZ COM HISTÓRIA: teto de copa em massas escuras com CLAREIRAS, brilho
 *    de céu pálido vazando, feixes de deus e POÇAS DE LUZ SALPICADA andando
 *    devagar no chão (dappled light), pontos emissivos (musgo, cogumelos,
 *    fio, lanternas) guiando o olho no lusco-fusco.
 *  - CHÃO VIVO: heightfield com vertex colors — trilha gasta ao longo do fio,
 *    verde saturado ao redor do musgo, terra nas bordas que sobem em tigela.
 * Os CORPOS dos bichos (e o Fiapo do player) moram em Floor9Fauna.tsx.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colorTex, rng } from './Floor6Textures';
import { f9, f9Tick, f9DrainEvents, f9Cacado, F9_OCOS, F9_FIO, F9_RAIZ } from './f9Floresta';
import { f9eco, f9EcoTick, f9EcoDrainEvents, f9CycleFrac, F9_AVISO_AT, F9_TREE_OBSTACLES } from './f9Eco';
import { Saltitos, Cervos, Vultos, Guardiao } from './Floor9Fauna';

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

const M9 = {
    ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, vertexColors: true }),
    bark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, color: '#9a8a70' }),
    canopy: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    canopyDark: new THREE.MeshStandardMaterial({ color: '#101f12', roughness: 1, flatShading: true }),
    moss: new THREE.MeshStandardMaterial({ color: '#3a5a34', roughness: 1, emissive: '#6adf8a', emissiveIntensity: 0.4 }),
    thread: new THREE.MeshStandardMaterial({ color: '#c62b32', roughness: 0.6, emissive: '#a01218', emissiveIntensity: 0.7 }),
    fern: new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: '#ffffff' }),
    rock: new THREE.MeshStandardMaterial({ color: '#5a6152', roughness: 1, flatShading: true }),
    shroomStem: new THREE.MeshStandardMaterial({ color: '#d8d0b8', roughness: 0.9 }),
    shroomCap: new THREE.MeshStandardMaterial({ color: '#3aa0aa', roughness: 0.7, emissive: '#40e0d0', emissiveIntensity: 0.9 }),
    shroomCapAmber: new THREE.MeshStandardMaterial({ color: '#c08a3a', roughness: 0.7, emissive: '#ffb84a', emissiveIntensity: 0.8 }),
    ocoGlow: new THREE.MeshBasicMaterial({ color: '#ffca7a' }),
};

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

// ── o CHÃO vivo: heightfield com vertex colors ───────────────────────────────
const Ground: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.PlaneGeometry(78, 66, 78, 56);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0, -23);
        const r = rng(905);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const colors = new Float32Array(pos.count * 3);
        const cDirt = new THREE.Color('#96805a');
        const cMoss = new THREE.Color('#5c8a50');
        const cTrail = new THREE.Color('#b8a276');
        const cMossHot = new THREE.Color('#66b258');
        const cEdge = new THREE.Color('#3c4a30');
        const col = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            // relevo: tigela nas bordas + ondulação leve no miolo
            const ex = Math.max(0, Math.abs(x) - 27) / 7;
            const ez = Math.max(0, (z < -24 ? -46 - z : z - (-2))) / 7;
            const edge = Math.max(ex, ez);
            let h = edge * edge * 3.4;
            h += Math.sin(x * 0.31 + z * 0.17) * 0.14 + Math.sin(x * 0.11 - z * 0.23) * 0.12;
            // corredor do fio fica plano (os pés do player não flutuam)
            let trailK = 0;
            for (const [fx, fz] of F9_FIO) {
                const d = Math.hypot(x - fx, z - fz);
                if (d < 3.4) trailK = Math.max(trailK, 1 - d / 3.4);
            }
            const spawnK = Math.max(0, 1 - Math.hypot(x, z + 2) / 6.5);
            const flat = Math.max(trailK, spawnK);
            h *= (1 - flat * 0.9);
            pos.setY(i, h - 0.02);
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

// ── as ÁRVORES v2: copas orgânicas, cor por instância, mães com raízes ───────
const Trees: React.FC = () => {
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
        const canopies = canopyGeos.map((gg) => new THREE.InstancedMesh(gg, M9.canopy, n));
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        const cA = new THREE.Color('#1c3a1e'), cB = new THREE.Color('#3a6a30'), cC = new THREE.Color('#2a5a40'), mix = new THREE.Color();
        spots.forEach(([x, z, s], i) => {
            const lean = (r() - 0.5) * 0.12;
            eu.set(lean, r() * Math.PI * 2, (r() - 0.5) * 0.12); q.setFromEuler(eu);
            pos.set(x, 3.8 * s, z); sc.set(s * (0.85 + r() * 0.4), s, s * (0.85 + r() * 0.4));
            m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4);
            // 3 massas de copa desalinhadas por árvore, cores individuais
            mix.copy(cA).lerp(r() < 0.5 ? cB : cC, r());
            canopies.forEach((cm, ci) => {
                const off = 0.9 + ci * 0.7;
                pos.set(x + (r() - 0.5) * 1.6 * s, (6.2 + ci * 1.05) * s, z + (r() - 0.5) * 1.6 * s);
                sc.setScalar(s * (off * 0.85 + r() * 0.5));
                eu.set(r() * 0.6, r() * Math.PI * 2, r() * 0.6); q.setFromEuler(eu);
                m4.compose(pos, q, sc); cm.setMatrixAt(i, m4);
                cm.setColorAt(i, mix.clone().offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.05));
            });
        });
        trunks.instanceMatrix.needsUpdate = true;
        canopies.forEach((cm) => { cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true; });
        return { trunks, canopies, all: [trunkGeo, ...canopyGeos] };
    }, []);
    useEffect(() => () => built.all.forEach((g) => g.dispose()), [built]);
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

// ── SUB-BOSQUE: samambaias + pedras + cogumelos + troncos caídos ─────────────
const Undergrowth: React.FC = () => {
    const built = useMemo(() => {
        const r = rng(912);
        // samambaias (planos únicos, rotação aleatória — barato e denso)
        const fGeo = new THREE.PlaneGeometry(1.15, 1.05);
        fGeo.translate(0, 0.5, 0);
        const nF = 420;
        const ferns = new THREE.InstancedMesh(fGeo, M9.fern, nF);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        const fA = new THREE.Color('#7ab060'), fB = new THREE.Color('#548a4c'), fC = new THREE.Color('#9ec06a');
        let fi = 0;
        for (let i = 0; i < 1400 && fi < nF; i++) {
            const x = (r() * 2 - 1) * 32, z = -50 + r() * 54;
            if (nearGameplay(x, z, -0.4) && r() < 0.8) continue;
            eu.set((r() - 0.5) * 0.2, r() * Math.PI * 2, (r() - 0.5) * 0.15); q.setFromEuler(eu);
            pos.set(x, 0, z); sc.setScalar(0.55 + r() * 1.1);
            m4.compose(pos, q, sc); ferns.setMatrixAt(fi, m4);
            ferns.setColorAt(fi, (r() < 0.5 ? fA : r() < 0.5 ? fB : fC).clone().offsetHSL(0, 0, (r() - 0.5) * 0.08));
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
            pos.set(x, 0.1, z); sc.set(0.4 + r() * 1.3, 0.3 + r() * 0.7, 0.4 + r() * 1.3);
            m4.compose(pos, q, sc); rocks.setMatrixAt(ri, m4);
            ri++;
        }
        rocks.count = ri;
        ferns.instanceMatrix.needsUpdate = true; if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
        rocks.instanceMatrix.needsUpdate = true;
        // cogumelos (posição pros grupos JSX)
        const shrooms: Array<[number, number, number, boolean]> = [];
        for (let i = 0; i < 400 && shrooms.length < 46; i++) {
            const x = (r() * 2 - 1) * 31, z = -49 + r() * 52;
            if (nearGameplay(x, z, -0.6) && r() < 0.7) continue;
            shrooms.push([x, z, 0.5 + r() * 0.9, r() < 0.6]);
        }
        // troncos caídos
        const logs: Array<[number, number, number, number]> = [];
        for (let i = 0; i < 200 && logs.length < 7; i++) {
            const x = (r() * 2 - 1) * 28, z = -46 + r() * 46;
            if (nearGameplay(x, z, 1.6)) continue;
            logs.push([x, z, r() * Math.PI, 2.4 + r() * 2.2]);
        }
        return { ferns, rocks, shrooms, logs, geos: [fGeo, rGeo] };
    }, []);
    useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built]);
    return (<>
        <primitive object={built.ferns} />
        <primitive object={built.rocks} />
        {built.shrooms.map(([x, z, s, cyan], i) => (
            <group key={i} position={[x, 0, z]} scale={[s, s, s]}>
                <mesh position={[0, 0.16, 0]} material={M9.shroomStem}><cylinderGeometry args={[0.05, 0.08, 0.32, 6]} /></mesh>
                <mesh position={[0, 0.34, 0]} material={cyan ? M9.shroomCap : M9.shroomCapAmber}><sphereGeometry args={[0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55]} /></mesh>
                {i % 2 === 0 && <mesh position={[0.2, 0.1, 0.06]} material={cyan ? M9.shroomCap : M9.shroomCapAmber}><sphereGeometry args={[0.09, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55]} /></mesh>}
            </group>
        ))}
        {built.logs.map(([x, z, a, len], i) => (
            <group key={'l' + i} position={[x, 0.32, z]} rotation={[0, a, (i % 2 ? 0.04 : -0.05)]}>
                <mesh rotation={[0, 0, Math.PI / 2]} material={M9.bark}><cylinderGeometry args={[0.34, 0.4, len, 8]} /></mesh>
                <mesh position={[len * 0.2, 0.3, 0]} scale={[1, 0.4, 1]} material={M9.moss}><sphereGeometry args={[0.4, 7, 6]} /></mesh>
            </group>
        ))}
    </>);
};

// ── o TETO de copa com clareiras + brilho de céu + feixes + luz salpicada ────
const CanopyAndLight: React.FC = () => {
    const built = useMemo(() => {
        const r = rng(915);
        const geo = jittered(new THREE.IcosahedronGeometry(4.4, 1), 1.5, 55);
        const n = 54;
        const blobs = new THREE.InstancedMesh(geo, M9.canopyDark, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), eu = new THREE.Euler();
        // clareiras deliberadas (onde os feixes descem): perto do pouso, do meio e da raiz
        const gaps: Array<[number, number]> = [[0, -2], [-10, -18], [12, -26], [-4, -38], [7, -46]];
        let bi = 0;
        for (let i = 0; i < 240 && bi < n; i++) {
            const x = (r() * 2 - 1) * 36, z = -54 + r() * 62;
            let inGap = false;
            for (const [gx, gz] of gaps) if (dist2(x, z, gx, gz) < 30) { inGap = true; break; }
            if (inGap) continue;
            eu.set(r() * Math.PI, r() * Math.PI, 0); q.setFromEuler(eu);
            pos.set(x, 10.6 + r() * 1.4, z); sc.set(0.8 + r() * 0.9, 0.4 + r() * 0.35, 0.8 + r() * 0.9);
            m4.compose(pos, q, sc); blobs.setMatrixAt(bi, m4);
            bi++;
        }
        blobs.count = bi;
        blobs.instanceMatrix.needsUpdate = true;
        return { blobs, geo, gaps };
    }, []);
    useEffect(() => () => built.geo.dispose(), [built]);
    const rays = useRef<THREE.Group>(null!);
    const pools = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (rays.current) rays.current.children.forEach((c, i) => {
            const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
            m.opacity = 0.05 + Math.sin(t * 0.27 + i * 2.1) * 0.028;
        });
        pools.current.forEach((p, i) => {
            if (!p) return;
            p.position.x = built.gaps[i % built.gaps.length][0] + Math.sin(t * 0.11 + i * 2) * 1.6;
            p.position.z = built.gaps[i % built.gaps.length][1] + Math.cos(t * 0.09 + i * 3) * 1.4;
            (p.material as THREE.MeshBasicMaterial).opacity = 0.075 + Math.sin(t * 0.4 + i) * 0.03;
        });
    });
    return (<>
        {/* o céu pálido acima da copa (as clareiras brilham contra ele) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 13.4, -23]}>
            <planeGeometry args={[84, 70]} />
            <meshBasicMaterial color="#b9dba0" fog={false} />
        </mesh>
        <primitive object={built.blobs} />
        {/* feixes descendo das clareiras */}
        <group ref={rays}>
            {built.gaps.map(([x, z], i) => (
                <mesh key={i} position={[x, 5.6, z]} rotation={[0.1, i * 1.2, 0.14]}>
                    <coneGeometry args={[2.6 + (i % 2), 11.5, 10, 1, true]} />
                    <meshBasicMaterial color="#e4f4b2" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
        {/* POÇAS DE LUZ SALPICADA deslizando no chão */}
        {built.gaps.map(([x, z], i) => (
            <mesh key={'p' + i} ref={(el) => { pools.current[i] = el; }} position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[2.5 + (i % 3) * 0.8, 18]} />
                <meshBasicMaterial color="#e8f8bc" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
        ))}
        {/* cipós pendendo das bordas das clareiras */}
        {built.gaps.flatMap(([x, z], i) => [0, 1, 2].map((k) => {
            const a = i * 2 + k * 2.1;
            return (
                <mesh key={`v${i}-${k}`} position={[x + Math.cos(a) * 4.2, 8.2 - k * 0.4, z + Math.sin(a) * 4.2]} material={M9.moss}>
                    <cylinderGeometry args={[0.03, 0.015, 2.6 + k * 1.2, 4]} />
                </mesh>
            );
        }))}
    </>);
};

// ── fio, ocos, raiz, musgo, vagalumes, onda (iguais em espírito, polidos) ────
const RedThread: React.FC = () => {
    const geo = useMemo(() => {
        const pts = F9_FIO.map(([x, z], i) => new THREE.Vector3(x, 0.5 + Math.sin(i * 1.7) * 0.28 + (i % 3 === 0 ? 0.9 : 0), z));
        const curve = new THREE.CatmullRomCurve3(pts);
        return new THREE.TubeGeometry(curve, 90, 0.035, 6);
    }, []);
    useEffect(() => () => geo.dispose(), [geo]);
    return (<>
        <mesh geometry={geo} material={M9.thread} />
        {F9_FIO.filter((_, i) => i % 2 === 1).map(([x, z], i) => (
            <mesh key={i} position={[x, 0.5, z]} material={M9.thread}><sphereGeometry args={[0.1, 6, 6]} /></mesh>
        ))}
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

const MossPatches: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        f9eco.moss.forEach((m, i) => {
            const mesh = refs.current[i]; if (!mesh) return;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.12 + m.amount * 0.42 + Math.sin(t * 1.4 + i * 2) * 0.05 * m.amount;
            const s = 0.6 + m.amount * 0.55;
            mesh.scale.set(s, s * 0.28, s);
        });
    });
    return (<>
        {f9eco.moss.map((m, i) => (
            <group key={i} position={[m.x, 0.02, m.z]}>
                <mesh ref={(el) => { refs.current[i] = el; }} scale={[1, 0.28, 1]} material={M9.moss.clone()}>
                    <icosahedronGeometry args={[1.4, 1]} />
                </mesh>
                {[0, 1, 2].map((k) => {
                    const a = (k / 3) * Math.PI * 2 + i;
                    return <mesh key={k} position={[Math.cos(a) * 1.1, 0.04, Math.sin(a) * 1.1]} scale={[1, 0.3, 1]} material={M9.moss.clone()}><icosahedronGeometry args={[0.4 + (k % 2) * 0.2, 0]} /></mesh>;
                })}
                <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[2.0, 12]} />
                    <meshBasicMaterial color="#4ade82" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
                </mesh>
            </group>
        ))}
    </>);
};

const Fireflies: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 110, a = new Float32Array(n * 3), r = rng(919);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 32; a[i * 3 + 1] = 0.4 + r() * 3.8; a[i * 3 + 2] = -50 + r() * 54; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#d8ffb0', size: 0.1, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    const pts = useRef<THREE.Points>(null!);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (pts.current) { pts.current.position.y = Math.sin(t * 0.4) * 0.3; pts.current.position.x = Math.sin(t * 0.22) * 0.8; mat.opacity = 0.55 + Math.sin(t * 2.2) * 0.3; }
    });
    return <points ref={pts} geometry={geo} material={mat} />;
};

const Wave: React.FC = () => {
    const wall = useRef<THREE.Mesh>(null!);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#eef4e8', transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
    useFrame(() => {
        if (!wall.current) return;
        if (f9eco.phase === 'onda') {
            wall.current.visible = true;
            const k = Math.min(1, f9eco.waveT / 10);
            wall.current.position.z = 6 - k * 62;
            mat.opacity = 0.9;
        } else if (f9eco.phase === 'aviso') {
            wall.current.visible = true;
            wall.current.position.z = 8;
            mat.opacity = 0.25 + Math.sin(f9eco.t * 3) * 0.1;
        } else { wall.current.visible = false; mat.opacity = 0; }
    });
    return (
        <mesh ref={wall} visible={false} material={mat} position={[0, 6, 8]}>
            <boxGeometry args={[76, 17, 3]} />
        </mesh>
    );
};

// ── a cena ───────────────────────────────────────────────────────────────────
export const Floor9Forest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> =
    ({ playerPositionRef }) => {
        const scene = useThree((s) => s.scene);
        const amb = useRef<THREE.AmbientLight>(null!);
        const hemi = useRef<THREE.HemisphereLight>(null!);
        const still = useRef({ x: 0, z: 0, t: 0 });

        useEffect(() => {
            const oldFog = scene.fog, oldBg = scene.background;
            scene.fog = new THREE.Fog('#1a3020', 11, 58);
            scene.background = new THREE.Color('#16281c');
            return () => { scene.fog = oldFog; scene.background = oldBg; };
        }, [scene]);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            const p = playerPositionRef.current;
            // quanto tempo o player está parado (a curiosidade dos saltitos lê)
            const moved = Math.hypot(p.x - still.current.x, p.z - still.current.z);
            if (moved > 0.25) { still.current.x = p.x; still.current.z = p.z; still.current.t = 0; }
            else still.current.t += dt;
            f9EcoTick(dt, p.x, p.z, 24, {
                huntable: f9.phase === 'explorar',
                safeInOco: f9.abrigo >= 0,
                stillT: still.current.t,
            });
            f9Tick(dt, p.x, p.z);
            f9DrainEvents();
            for (const e of f9EcoDrainEvents()) if (e === 'cacaPlayer') f9Cacado();
            // a luz responde ao ciclo
            const frac = f9CycleFrac();
            const warn = f9eco.phase === 'aviso' ? (frac - F9_AVISO_AT) / (1 - F9_AVISO_AT) : 0;
            const wave = f9eco.phase === 'onda' ? 1 : 0;
            if (amb.current) amb.current.intensity = 1.0 + warn * 0.4 + wave * 1.2;
            if (hemi.current) hemi.current.intensity = 1.12 + warn * 0.3 + wave * 0.6;
            const fog = scene.fog as THREE.Fog | null;
            if (fog) {
                fog.far = 58 - warn * 18 - wave * 32;
                fog.color.setStyle(wave ? '#e8efe2' : warn > 0 ? '#4a5a44' : '#1a3020');
                if (scene.background instanceof THREE.Color) scene.background.copy(fog.color);
            }
        });

        return (
            <group>
                <Ground />
                <ambientLight ref={amb} color="#7a9a6c" intensity={1.0} />
                <hemisphereLight ref={hemi} color="#bce0b0" groundColor="#34482c" intensity={1.12} />
                <directionalLight position={[8, 14, -6]} intensity={0.85} color="#e8f8c4" />

                <Trees />
                <Undergrowth />
                <CanopyAndLight />
                <MossPatches />
                <Fireflies />
                <RedThread />
                <Ocos />
                <Raiz />

                <Saltitos />
                <Cervos />
                <Vultos />
                <Guardiao />
                <Wave />

                {/* a moldura enferrujada do elevador que a floresta engoliu */}
                <group position={[2.5, 0, 1.5]} rotation={[0.12, 0.5, 0.06]}>
                    <B a={[1.6, 0.18, 0.12]} p={[0, 0.1, 0]} m={M9.bark} />
                    <B a={[0.14, 2.2, 0.12]} p={[-0.75, 1.1, 0]} m={M9.bark} r={[0, 0, 0.08]} />
                    <B a={[0.14, 1.7, 0.12]} p={[0.78, 0.85, 0]} m={M9.bark} r={[0, 0, -0.12]} />
                    <mesh position={[0.1, 0.9, 0.02]} material={M9.moss}><sphereGeometry args={[0.35, 6, 5]} /></mesh>
                </group>
            </group>
        );
    };

export default Floor9Forest;
