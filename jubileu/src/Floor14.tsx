/**
 * Floor14.tsx — KESSAR-9, o planeta deserto.
 *
 * O ANDAR, EM ORDEM:
 *  1. CHEGADA (cutscene pré-renderizada, pulável): a casa-elevador de Vindhjem
 *     se abre num céu estranho; o hóspede cai na areia e não consegue respirar.
 *  2. SUFOCANDO: o fôlego acaba em ~30 s. A poucos metros, meio enterrado,
 *     um CAPACETE DE MADEIRA com escotilha de latão. Vestir = respirar.
 *  3. A CAÇA: a ENTIDADE aparece ao longe como uma SOMBRA de pé. Sempre que o
 *     hóspede chega perto, ela some — afunda na areia, vira poeira ou passa
 *     por trás de uma crista — e reaparece noutro canto do planeta, deixando
 *     pegadas escuras: a crista ao norte, a bacia de sal a leste, os platôs a
 *     oeste. Na CRATERA ao sul ela finalmente não tem para onde ir.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer, Bloom, Vignette, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { superficieEm as alturaEm, alturaEm as alturaBruta, regiaoEm, inclinacao, fbm, RAIO_DO_MUNDO, TAMANHO_TERRENO, SEGMENTOS_TERRENO } from './f14Terreno';
import { remendarRocha, oclusaoDoRelevo, ligarAtmosfera, ruidoLento } from './f14Visual';
import { CeuKessar, PoeiraKessar, CascalhoKessar, AmbienteDoCeu, SOL } from './f14Atmosfera';
import { useOptionalSettings } from './Settings';
import { ChegadaKessar } from './f14Chegada';

type Fase = 'chegada' | 'sufocando' | 'explorar' | 'fim';
interface Jog { x: number; y: number; z: number; andando: number; caido: number }

const FOLEGO_TOTAL = 30;
/** Obstáculos sólidos (pedras grandes, agulhas): preenchidos quando cada grupo é gerado. */
const SOLIDOS: { x: number; z: number; r: number }[] = [];
/** o tremor da câmera e o anel de areia de quando ela some */
const abalo = { v: 0 }, anel = { t: 9, x: 0, z: 0 };
const CAPACETE = { x: .4, z: -4.2 };
const INICIO = { x: 0, z: 0 };

/** Onde a sombra aparece, em ordem. `foge` = distância em que ela some. */
/** O ponto mais alto num raio (para a sombra e o monólito ficarem recortados contra o céu). */
function pontoAlto(x: number, z: number, raio: number): { x: number; z: number } {
    let mx = x, mz = z, mh = -1e9;
    for (let r = 0; r <= raio; r += 3) for (let a = 0; a < 6.283; a += r ? 3 / r : 7) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = alturaEm(px, pz);
        if (h > mh) { mh = h; mx = px; mz = pz; }
    }
    return { x: mx, z: mz };
}
const APARICOES_BASE: { x: number; z: number; foge: number; como: 'afunda' | 'poeira' | 'crista'; dica: string; alto?: number }[] = [
    { x: 6, z: -62, foge: 30, alto: 18, como: 'poeira', dica: 'Uma silhueta de pé nas dunas, ao norte.' },
    { x: 14, z: -140, foge: 34, alto: 30, como: 'crista', dica: 'Ela subiu a crista. As pegadas vão para o alto.' },
    { x: 150, z: -22, foge: 32, como: 'afunda', dica: 'Pegadas escuras descem para a bacia de sal, a leste.' },
    { x: -142, z: 34, foge: 36, alto: 30, como: 'poeira', dica: 'Lá em cima dos platôs, a oeste… ela está te esperando?' },
    { x: 20, z: 170, foge: 0, como: 'afunda', dica: 'As pegadas terminam na cratera ao sul.' },
];
const APARICOES = APARICOES_BASE.map((ap) => (ap.alto ? { ...ap, ...pontoAlto(ap.x, ap.z, ap.alto) } : ap));
const MONOLITO = pontoAlto(14, -165, 45);
/** Linha de visão livre do olho (1,7 m) até a cabeça da sombra (+6 m)? E o fundo atrás dela é céu? */
function visaoLivre(ox: number, oz: number, a: { x: number; z: number }): { livre: boolean; ceu: boolean } {
    const y0 = alturaEm(ox, oz) + 1.7, y1 = alturaEm(a.x, a.z) + 7;
    for (let k = 1; k < 30; k++) { const u = k / 30, x = ox + (a.x - ox) * u, z = oz + (a.z - oz) * u; if (alturaEm(x, z) > y0 + (y1 - y0) * u - .3) return { livre: false, ceu: false }; }
    const dx = a.x - ox, dz = a.z - oz, d = Math.hypot(dx, dz), sy = (y1 - y0) / d;
    for (let t = 5; t < 260; t += 8) { const x = a.x + dx / d * t, z = a.z + dz / d * t; if (alturaEm(x, z) > y1 + sy * t) return { livre: true, ceu: false }; }
    return { livre: true, ceu: true };
}
/** Há relevo a menos de 8 m num leque de 70° em volta do olhar? (a câmera ficaria olhando uma parede) */
function paredePerto(x: number, z: number, rumo: number): boolean {
    const olho = alturaEm(x, z) + 1.7;
    for (let k = -5; k <= 5; k++) { const a = rumo + k * (48 / 5) * Math.PI / 180;
        for (let d = 2; d <= 24; d += 2) if (alturaEm(x + Math.sin(a) * d, z + Math.cos(a) * d) > olho - .2) return true; }
    return false;
}
/** O ponto de chegada da trilha (a ~55 m da aparição): gira em passos de 15° a partir da direção de quem
 *  vem, até a visão ficar livre — de preferência com céu atrás dela. */
const CHEGADAS = APARICOES.map((a, i) => {
    if (i === 0) return null;
    const b = APARICOES[i - 1], base = Math.atan2(b.z - a.z, b.x - a.x);
    let melhor: { x: number; z: number } | null = null;
    for (const R of i === APARICOES.length - 1 ? [26, 32] : [75, 62, 90, 50]) for (let k = 0; k < 24; k++) {   // na cratera: já dentro, descendo a borda
        const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, x = a.x + Math.cos(ang) * R, z = a.z + Math.sin(ang) * R;
        if (Math.hypot(x, z) > RAIO_DO_MUNDO - 45) continue;
        if (i < APARICOES.length - 1 && (inclinacao(x, z) > .3 || paredePerto(x, z, Math.atan2(a.x - x, a.z - z)))) continue;
        const v = visaoLivre(x, z, a);
        if (v.livre && v.ceu) return { x, z };
        if (v.livre && !melhor) melhor = { x, z };
    }
    return melhor;
});

// ── som (WebAudio mínimo, sem arquivos) ───────────────────────────────────
let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
function ruidoBuf(seg: number) {
    const a = audio(), b = a.createBuffer(1, a.sampleRate * seg, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
}
let vento: { parar: () => void } | null = null;
function tocarVento() {
    if (vento) return;
    const a = audio(), s = a.createBufferSource(); s.buffer = ruidoBuf(4); s.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = .7;
    const g = a.createGain(); g.gain.value = .12;
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .13; lg.gain.value = 220; lfo.connect(lg).connect(f.frequency); lfo.start();
    s.connect(f).connect(g).connect(a.destination); s.start();
    vento = { parar: () => { s.stop(); lfo.stop(); vento = null; } };
}
function tocarArfar(forca: number) {
    const a = audio(), s = a.createBufferSource(); s.buffer = ruidoBuf(.6);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 400; f.Q.value = 1.4;
    const g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25 * forca, t + .08); g.gain.exponentialRampToValueAtTime(.001, t + .5);
    s.connect(f).connect(g).connect(a.destination); s.start();
}
function tocarCapacete() {
    const a = audio(), t = a.currentTime;
    for (const [fr, at] of [[180, 0], [120, .09]] as const) {
        const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = fr;
        g.gain.setValueAtTime(.4, t + at); g.gain.exponentialRampToValueAtTime(.001, t + at + .25);
        o.connect(g).connect(a.destination); o.start(t + at); o.stop(t + at + .3);
    }
    // o primeiro fôlego dentro do capacete
    window.setTimeout(() => { const s = a.createBufferSource(); s.buffer = ruidoBuf(1.4); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
        const g = a.createGain(), t2 = a.currentTime; g.gain.setValueAtTime(0, t2); g.gain.linearRampToValueAtTime(.35, t2 + .5); g.gain.linearRampToValueAtTime(0, t2 + 1.3);
        s.connect(f).connect(g).connect(a.destination); s.start(); }, 350);
}
function tocarOlhar() {   // um grave que cresce enquanto ela te encara
    const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(42, t); o.frequency.linearRampToValueAtTime(58, t + 1.5);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + 1.45); g.gain.exponentialRampToValueAtTime(.0001, t + 1.7);
    o.connect(f).connect(g).connect(a.destination); o.start(); o.stop(t + 1.8);
}
function tocarSumico() {
    const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(48, t + 1.6);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .15); g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
    o.connect(g).connect(a.destination); o.start(); o.stop(t + 1.9);
}

// ── o chão ────────────────────────────────────────────────────────────────
const Terreno: React.FC<{ reduzida: boolean }> = ({ reduzida }) => {
    const geo = useMemo(() => {
        const L = TAMANHO_TERRENO, N = SEGMENTOS_TERRENO, g = new THREE.PlaneGeometry(L, L, N, N);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position as THREE.BufferAttribute, cor = new Float32Array(p.count * 3), alt = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) { const h = alturaBruta(p.getX(i), p.getZ(i)); p.setY(i, h); alt[i] = h; }
        g.computeVertexNormals();
        // a grade do PlaneGeometry corre em x e depois em z: a mesma ordem da grade de alturas
        g.setAttribute('ao', new THREE.BufferAttribute(oclusaoDoRelevo(alt, N, L / N), 1));
        const c = new THREE.Color(), areia = new THREE.Color('#c88d59'), ferrugem = new THREE.Color('#9a5432'), sal = new THREE.Color('#efe7da'),
            vidro = new THREE.Color('#4a3a5c'), serra = new THREE.Color('#9b6243'), faixaA = new THREE.Color('#b06e45'), faixaB = new THREE.Color('#dca46c'), tmp = new THREE.Color();
        const nrm = g.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i), h = alt[i];
            const r = regiaoEm(x, z), n = fbm(x * .05, z * .05, 3);
            c.copy(areia).lerp(ferrugem, Math.max(0, n - .42) * 1.5);
            if (r.platos > 0) c.lerp(tmp.copy(faixaA).lerp(faixaB, .5 + .5 * Math.sin(h * .55)), r.platos * .8);
            if (r.crista > 0) c.lerp(serra, r.crista * .6);
            // vale sombreado puxa para o vermelho; topo plano clareia (poeira fina)
            c.multiplyScalar(.92 + .14 * Math.min(1, Math.max(0, nrm.getY(i))));
            if (r.sal > 0) c.lerp(sal, r.sal * (.85 + n * .15));
            if (r.cratera > 0) c.lerp(vidro, r.cratera);
            cor[i * 3] = c.r; cor[i * 3 + 1] = c.g; cor[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
        const pesoSal = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) pesoSal[i] = regiaoEm(p.getX(i), p.getZ(i)).sal;
        g.setAttribute('sal', new THREE.BufferAttribute(pesoSal, 1));
        // os dois ruídos lentos do shader, calculados aqui uma vez (antes: 8 oitavas por pixel, todo quadro)
        g.setAttribute('lento', new THREE.BufferAttribute(ruidoLento(p, new THREE.Matrix4()), 2));
        return g;
    }, []);
    const mat = useMemo(() => remendarRocha(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 }),
        { terreno: true, oclusao: true, baixa: reduzida, conjunto: 'serra', escala: 16, tom: '#ffe2c8' }), [reduzida]);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    return <mesh geometry={geo} material={mat} receiveShadow />;
};

/** Pedras e agulhas espalhadas (instanciadas), mais densas nas regiões rochosas. */
const Pedras: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const N = 420;
    const geo = useMemo(() => {
        const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const r = 1 + .13 * Math.sin(x * 9 + z * 4) * Math.cos(y * 7) + .08 * Math.sin(z * 13 + y * 5);
            p.setXYZ(i, x * r, y * r * .85, z * r);
        }
        g.computeVertexNormals(); return g;
    }, []);
    useEffect(() => {
        const m = ref.current; if (!m) return;
        let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const o = new THREE.Object3D(), tint = new THREE.Color(), colliders: typeof SOLIDOS = []; let k = 0;
        for (let i = 0; i < N * 3 && k < N; i++) {
            const a = rnd() * Math.PI * 2, r = 14 + Math.sqrt(rnd()) * (RAIO_DO_MUNDO - 40);
            const x = Math.cos(a) * r, z = Math.sin(a) * r, reg = regiaoEm(x, z);
            if (reg.sal > .3 || reg.cratera > .5) continue;
            if (rnd() > .25 + reg.crista + reg.platos) continue;
            if (APARICOES.some((ap) => Math.hypot(ap.x - x, ap.z - z) < 8) || CHEGADAS.some((c) => c && Math.hypot(c.x - x, c.z - z) < 14) || Math.hypot(x - CAPACETE.x, z - CAPACETE.z) < 8) continue;
            const agulha = false;
            const esc = .4 + rnd() * 1.1;
            o.position.set(x, alturaEm(x, z) - .3, z);
            o.rotation.set(rnd() * .3, rnd() * 6.28, rnd() * .3);
            o.scale.set(esc, esc * (agulha ? 3.5 + rnd() * 3 : .7 + rnd() * .6), esc);
            if (esc > 1) colliders.push({ x, z, r: esc * .9 });
            tint.set('#766252').multiplyScalar(.75 + rnd() * .45); m.setColorAt(k, tint);
            o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
        SOLIDOS.push(...colliders);
        return () => { for (const ob of colliders) { const i = SOLIDOS.indexOf(ob); if (i >= 0) SOLIDOS.splice(i, 1); } };
    }, []);
    const mat = useMemo(() => remendarRocha(new THREE.MeshStandardMaterial({ roughness: .94 }), { conjunto: 'pedra', escala: 3 }), []);
    return <instancedMesh ref={ref} frustumCulled={false} args={[geo, mat, N]} castShadow receiveShadow />;
};

/** O sol acompanha o hóspede: sombra nítida só perto dele (sem a caixa de sombra aparecendo no chão). */
const SolQueSegue: React.FC<{ jog: React.MutableRefObject<Jog>; reduzida: boolean }> = ({ jog, reduzida }) => {
    const luz = useRef<THREE.DirectionalLight>(null);
    useEffect(() => {
        const l = luz.current; if (!l) return;
        const c = l.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 160; c.updateProjectionMatrix();
        l.shadow.bias = -.0004; l.shadow.normalBias = .04;
    }, []);
    const ultimo = useRef(''), quadros = useRef(0);
    useFrame(({ gl }) => {
        const l = luz.current; if (!l) return; const j = jog.current;
        const sx = Math.round(j.x / .5) * .5, sz = Math.round(j.z / .5) * .5;   // passo de texel: a sombra não treme
        // tudo que projeta sombra aqui é parado: o mapa só é refeito quando o sol anda junto com o hóspede
        const chave = `${sx},${sz},${Math.round(j.y * 4)}`;
        gl.shadowMap.autoUpdate = false;
        if (chave !== ultimo.current || quadros.current++ < 60) { ultimo.current = chave; gl.shadowMap.needsUpdate = true; }   // e nos 1ºs quadros (instâncias chegando)
        l.position.set(sx + SOL.x * 80, j.y + SOL.y * 80, sz + SOL.z * 80);   // só sombras de perto: colunas a 150 m jogavam faixas enormes no chão à frente l.target.position.set(sx, j.y, sz); l.target.updateMatrixWorld();
    });
    return <directionalLight ref={luz} intensity={3.3} color="#ffd2a2" castShadow shadow-mapSize={reduzida ? [1024, 1024] : [2048, 2048]} />;
};

/** Cristais de quartzo azul-petróleo brotando da areia (o primeiro sinal de "isto não é a Terra"). */
/** Quartzo sem `transmission`: a transmissão de verdade renderiza a cena INTEIRA de novo a cada quadro
 *  (era 2,7× o custo do andar). Aqui: translúcido, verniz, reflexo do céu e o miolo verde mais denso
 *  no centro de cada face (onde o vidro é mais grosso), mais claro nas bordas — o mesmo olhar, um passe só. */
function cristalFalso() {
    const m = new THREE.MeshPhysicalMaterial({ color: '#8ff0d4', emissive: '#18c290', emissiveIntensity: .55, roughness: .08, metalness: 0, ior: 1.54,
        clearcoat: 1, clearcoatRoughness: .1, transparent: true, opacity: .84, envMapIntensity: 1.5 });
    m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float frente = abs(dot(normalize(vViewPosition), normal)); totalEmissiveRadiance *= .45 + 1.25 * frente * frente; }`);
    };
    m.customProgramCacheKey = () => 'k14cristal';
    return m;
}

const Cristais: React.FC<{ reduzida: boolean }> = ({ reduzida }) => {
    const ref = useRef<THREE.InstancedMesh>(null); const N = 160;
    useEffect(() => {
        const m = ref.current; if (!m) return;
        let s = 777; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const o = new THREE.Object3D(); let k = 0;
        for (let t = 0; t < 60 && k < N; t++) {            // aglomerados
            const a = rnd() * 6.28, r = t < 6 ? 10 + t * 5 : 20 + rnd() * 200, cx = Math.cos(a) * r, cz = Math.sin(a) * r;   // os primeiros perto do pouso
            if (regiaoEm(cx, cz).cratera > .3) continue;
            const n = 2 + Math.floor(rnd() * 5);
            for (let i = 0; i < n && k < N; i++) {
                const x = cx + (rnd() - .5) * 5, z = cz + (rnd() - .5) * 5, e = (.4 + rnd() * 1.4) * (t < 6 ? .6 : 1);
                o.position.set(x, alturaEm(x, z) - .1, z); o.rotation.set((rnd() - .5) * .9, rnd() * 6.28, (rnd() - .5) * .9);
                o.scale.set(e, e * (2 + rnd() * 3), e); o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
            }
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
    }, []);
    // prisma hexagonal com ponta (quartzo de verdade, não pirâmide), facetado; brilho verde por dentro
    const geo = useMemo(() => {
        const corpo = new THREE.CylinderGeometry(.22, .25, .75, 6, 1, true).translate(0, .375, 0);
        const ponta = new THREE.ConeGeometry(.22, .32, 6, 1).translate(0, .91, 0);
        const g = mergeGeometries([corpo.toNonIndexed(), ponta.toNonIndexed()])!; g.computeVertexNormals(); corpo.dispose(); ponta.dispose(); return g;
    }, []);
    const mat = useMemo(() => reduzida
        ? new THREE.MeshStandardMaterial({ color: '#7fe6c8', emissive: '#1ec99a', emissiveIntensity: .45, roughness: .18, metalness: .05 })
        : cristalFalso(), [reduzida]);
    return <instancedMesh ref={ref} frustumCulled={false} args={[geo, mat, N]} castShadow />;
};

/** A ossada de um bicho enorme meio enterrada (costelas em arco) — marco entre o pouso e a crista. */
const Ossada: React.FC = () => {
    const x0 = -18, z0 = -40, y0 = alturaEm(x0, z0);
    return <group position={[x0, y0 - .6, z0]} rotation={[0, .5, 0]}>
        {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[0, 0, i * 1.6 - 6]} rotation={[0, 0, 0]} castShadow>
            <torusGeometry args={[3.2 - Math.abs(i - 4) * .22, .16, 6, 18, Math.PI * .92]} /><meshStandardMaterial color="#e8dcc4" roughness={.7} /></mesh>)}
        <mesh position={[0, -.1, -.4]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.22, .3, 15, 8]} /><meshStandardMaterial color="#d9cbb0" roughness={.8} /></mesh>
        <mesh position={[0, .6, 8.2]} castShadow><sphereGeometry args={[1.4, 10, 8]} /><meshStandardMaterial color="#e8dcc4" roughness={.7} /></mesh>
    </group>;
};

/** A névoa muda com o lugar: poeira laranja nas dunas, branca no sal, violeta na cratera. */
const NevoaPorRegiao: React.FC<{ jog: React.MutableRefObject<Jog> }> = ({ jog }) => {
    const scene = useThree((s) => s.scene);
    const base = useMemo(() => ({ duna: new THREE.Color('#d49a6c'), sal: new THREE.Color('#f0e2d0'), crat: new THREE.Color('#6f5088'), crista: new THREE.Color('#b9806a'), alvo: new THREE.Color() }), []);
    useFrame((_, dt) => {
        const f = scene.fog as THREE.FogExp2 | null; if (!f || !('density' in f)) return; const j = jog.current, r = regiaoEm(j.x, j.z);
        base.alvo.copy(base.duna).lerp(base.crista, r.crista * .7).lerp(base.sal, r.sal).lerp(base.crat, r.cratera);
        f.color.lerp(base.alvo, 1 - Math.exp(-dt * 1.5));
        f.density += ((r.cratera > .3 ? .0075 : r.sal > .3 ? .003 : .0036) - f.density) * (1 - Math.exp(-dt));
    });
    return null;
};

/** Agulhas de basalto (12–20 m) nas regiões rochosas: dão escala e silhueta. */
const Agulhas: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null); const N = 260;
    const geo = useMemo(() => {   // prisma hexagonal com o topo mais claro (aresta de basalto)
        const g = new THREE.CylinderGeometry(.48, .5, 1, 6, 1).toNonIndexed(); g.computeVertexNormals(); const p = g.attributes.position, cor = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { const topo = p.getY(i) > .49; const c = new THREE.Color(topo ? '#4a3a36' : '#2a1f22'); cor.set([c.r, c.g, c.b], i * 3); }
        g.setAttribute('color', new THREE.BufferAttribute(cor, 3)); return g;
    }, []);
    useEffect(() => {
        const m = ref.current; if (!m) return;
        let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const o = new THREE.Object3D(), ps: [number, number][] = [], colliders: typeof SOLIDOS = []; let k = 0;
        for (let t = 0; t < 4000 && k < N - 7; t++) {
            const x = (rnd() - .5) * 2 * (RAIO_DO_MUNDO - 50), z = (rnd() - .5) * 2 * (RAIO_DO_MUNDO - 50), r = regiaoEm(x, z);
            if (Math.hypot(x, z) < 35 || r.sal > .2 || r.cratera > .2) continue;
            if (APARICOES.some((a) => Math.hypot(a.x - x, a.z - z) < 24) || CHEGADAS.some((c) => c && Math.hypot(c.x - x, c.z - z) < 16)) continue;
            if (rnd() > .08 + r.platos * .6 + r.crista * .5) continue;
            if (ps.some(([px, pz]) => Math.hypot(px - x, pz - z) < 14)) continue;   // disco de Poisson
            ps.push([x, z]);
            const n = 3 + Math.floor(rnd() * 5), alt = 8 + rnd() * 12;          // um grupo de 3–7 colunas
            for (let c = 0; c < n; c++) {
                const cx = x + (rnd() - .5) * 3.5, cz = z + (rnd() - .5) * 3.5, h = alt * (.55 + rnd() * .45), b = 1.4 + rnd() * .8;
                colliders.push({ x: cx, z: cz, r: b * .5 });
                o.position.set(cx, alturaEm(cx, cz) + h / 2 - 1, cz); o.rotation.set((rnd() - .5) * .06, rnd() * 6.28, (rnd() - .5) * .06);
                o.scale.set(b, h, b); o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
            }
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
        SOLIDOS.push(...colliders);
        return () => { for (const ob of colliders) { const i = SOLIDOS.indexOf(ob); if (i >= 0) SOLIDOS.splice(i, 1); } };
    }, []);
    const mat = useMemo(() => remendarRocha(new THREE.MeshStandardMaterial({ roughness: .9 }), { conjunto: 'basalto', escala: 4 }), []);
    return <instancedMesh ref={ref} frustumCulled={false} args={[geo, mat, N]} castShadow receiveShadow />;
};

/** Arcos de erosão na borda da bacia de sal. */
const Arcos: React.FC = () => {
    const geo = useMemo(() => [1, .6].map((volta) => {   // tubo que engrossa nas pernas (base 1,6×), com volta inteira ou quebrada
        const pts = Array.from({ length: 24 }, (_, k) => { const a = Math.PI * volta * k / 23; return new THREE.Vector3(Math.cos(a), Math.pow(Math.sin(a), .78) * 1.15, Math.sin(a * 2) * .08); });
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .2, 10, false), p = g.attributes.position, cor = new Float32Array(p.count * 3), c = new THREE.Color();
        for (let k = 0; k < p.count; k++) {
            const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
            const ruido = fbm(x * 9 + 5, y * 9 + z * 3, 3) - .4;
            const base = 1 + Math.max(0, .6 - y) * .9;
            p.setXYZ(k, x * (1 + (base - 1) * .16) + ruido * .10, y + ruido * .09, z * base + ruido * .12);
            const estrato = .5 + .5 * Math.sin(y * 55 + Math.sin(x * 9) * .7);
            c.set('#ac8d6f').lerp(new THREE.Color('#736052'), estrato * .22).multiplyScalar(.9 + ruido * .3);
            cor.set([c.r, c.g, c.b], k * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cor, 3)); g.computeVertexNormals(); return g;
    }), []);
    const matArco = useMemo(() => remendarRocha(new THREE.MeshStandardMaterial({ roughness: .92 }), { conjunto: 'serra', escala: 5, tom: '#ffd8b6' }), []);
    return <group>
        {[[0.4, 64, 16, 0, 0], [1.6, 60, 12, 0, .12], [2.9, 66, 14, 1, 0], [4.4, 62, 18, 0, -.1], [3.6, 58, 10, 0, .18]].map(([a, r, e, quebrado, torto], i) => {
            const x = 150 + Math.cos(a) * r, z = -20 + Math.sin(a) * r;
            if (CHEGADAS.some((c) => c && Math.hypot(c.x - x, c.z - z) < e + 12)) return null;   // não tampa a vista de quem chega
            return <mesh key={i} geometry={geo[quebrado]} material={matArco} position={[x, alturaEm(x, z) - e * .12, z]} rotation={[0, a + Math.PI / 2, torto]} scale={[e, e, e]} castShadow receiveShadow />;
        })}
    </group>;
};

/** Um monólito negro no alto da crista: dá escala e aponta o caminho. */
const Monolito: React.FC = () => {
    const { x, z } = MONOLITO, y = alturaEm(x, z);
    // sem sombra: com o sol baixo, a sombra de 40 m chegava a 165 m e cobria a tela no pouso
    return <mesh position={[x, y + 19, z]} rotation={[0, .4, .03]}><boxGeometry args={[5, 40, 2]} /><meshStandardMaterial color="#120c12" roughness={.3} metalness={.7} emissive="#5a2a10" emissiveIntensity={.25} /></mesh>;
};

/** Um pilar de luz violeta subindo da cratera: o fim do caminho, visível desde o pouso. */
const ColunaDaCratera: React.FC = () => {
    const m = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock, camera }) => { if (m.current) m.current.opacity = (.16 + Math.sin(clock.elapsedTime * .7) * .05) * Math.min(1, Math.max(0, (Math.hypot(camera.position.x - 20, camera.position.z - 170) - 45) / 60)); });   // some quando você chega
    return <mesh position={[20, 60, 170]}><cylinderGeometry args={[6, 14, 160, 24, 1, true]} /><meshBasicMaterial ref={m} color="#b07cff" transparent opacity={.18} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>;
};

/** O visor do capacete NÃO atrapalha a visão: ao vestir, a borda de latão aparece por um instante
 *  (para dizer "você está dentro do capacete") e some em 2,5 s. Depois fica só uma vinheta leve nas
 *  bordas e, de vez em quando, um bafo fraquíssimo embaixo. O centro da tela nunca é coberto. */
const Escotilha: React.FC = () => <>
    <style>{'@keyframes f14bafo{0%,70%,100%{opacity:0}84%{opacity:.05}}@keyframes f14aro{0%,35%{opacity:1}100%{opacity:0}}'}</style>
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', animation: 'f14aro 2.5s ease-out forwards' }} aria-hidden="true">
        <defs><linearGradient id="f14latao" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9cf93" /><stop offset=".45" stopColor="#8a6a3c" /><stop offset="1" stopColor="#3b2a17" /></linearGradient></defs>
        <ellipse cx="500" cy="500" rx="700" ry="680" fill="none" stroke="url(#f14latao)" strokeWidth="14" />
    </svg>
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 72%, rgba(13,10,7,.28) 100%)' }} />
    <div style={{ position: 'absolute', left: '20%', right: '20%', bottom: 0, height: '22%', pointerEvents: 'none', borderRadius: '50% 50% 0 0', background: 'radial-gradient(ellipse at 50% 100%, #dfe8e4, transparent 70%)', animation: 'f14bafo 6s ease-in-out infinite' }} />
</>;

// ── o capacete de madeira ─────────────────────────────────────────────────
const Capacete: React.FC<{ visivel: boolean }> = ({ visivel }) => {
    const g = useRef<THREE.Group>(null);
    const luzBeacon = useRef<THREE.PointLight>(null), halo = useRef<THREE.Sprite>(null);
    const brilho = useMemo(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(.35, 'rgba(255,170,80,.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }, []);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime, pulso = .5 + .5 * Math.sin(t * Math.PI * 1.6);   // farol a 0,8 Hz: dá para achar a 30 m
        // O capacete tem peso: permanece enterrado; apenas o reflexo pulsa.
        if (luzBeacon.current) luzBeacon.current.intensity = visivel ? 2 + pulso * 3 : 0;
        if (halo.current) { halo.current.scale.setScalar(1.6 + pulso * 1.4); (halo.current.material as THREE.SpriteMaterial).opacity = visivel ? .16 + pulso * .20 : 0; }
    });
    // casco torneado (aduelas de carvalho escuro com textura de verdade), aros e escotilha de latão com vidro
    const pecas = useMemo(() => {
        const perfil = [[.0, .54], [.12, .53], [.22, .49], [.29, .41], [.33, .3], [.345, .18], [.345, .06], [.33, 0]].map(([r, z]) => new THREE.Vector2(r, z));
        const casco = new THREE.LatheGeometry(perfil, 40);
        const ld = new THREE.TextureLoader(), base = `${import.meta.env.BASE_URL}kessar/`;
        const cor = ld.load(base + 'dark_wood_diffuse.jpg'); cor.colorSpace = THREE.SRGBColorSpace;
        const nor = ld.load(base + 'dark_wood_nor_gl.jpg');
        for (const t of [cor, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.center.set(.5, .5); t.rotation = Math.PI / 2; t.repeat.set(1.2, 4); t.anisotropy = 8; }
        const madeira = new THREE.MeshStandardMaterial({ map: cor, normalMap: nor, normalScale: new THREE.Vector2(.8, .8), color: '#c99a7a', roughness: .62, side: THREE.DoubleSide });
        const latao = new THREE.MeshStandardMaterial({ color: '#c9a043', metalness: .9, roughness: .28 });
        return { casco, madeira, latao };
    }, []);
    useEffect(() => () => { pecas.casco.dispose(); pecas.madeira.map?.dispose(); pecas.madeira.normalMap?.dispose(); pecas.madeira.dispose(); pecas.latao.dispose(); }, [pecas]);
    const y = alturaEm(CAPACETE.x, CAPACETE.z);
    return <group ref={g} position={[CAPACETE.x, y - .05, CAPACETE.z]} rotation={[.12, .6, .2]} visible={visivel}>
        <mesh geometry={pecas.casco} material={pecas.madeira} castShadow receiveShadow />
        {[[.02, .345], [.3, .335]].map(([z, r], i) => <mesh key={i} position={[0, z, 0]} rotation={[Math.PI / 2, 0, 0]} material={pecas.latao} castShadow><torusGeometry args={[r, .018, 8, 40]} /></mesh>)}
        {/* a escotilha: aro, vidro esverdeado e oito rebites */}
        <mesh position={[0, .22, .335]} material={pecas.latao}><torusGeometry args={[.13, .026, 10, 32]} /></mesh>
        <mesh position={[0, .22, .33]}><circleGeometry args={[.125, 32]} /><meshStandardMaterial color="#5f8f86" transparent opacity={.72} metalness={.4} roughness={.04} envMapIntensity={1.6} /></mesh>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.cos(i * .785) * .13, .22 + Math.sin(i * .785) * .13, .362]} material={pecas.latao}><sphereGeometry args={[.012, 8, 6]} /></mesh>)}
        {/* a mangueira de ar, de couro, enterrada na areia */}
        <mesh position={[.32, .06, -.12]} rotation={[0, .4, 1.25]}><torusGeometry args={[.22, .035, 8, 20, Math.PI]} /><meshStandardMaterial color="#3a2a1c" roughness={.9} /></mesh>
        <pointLight ref={luzBeacon} position={[0, .75, .45]} color="#ffb347" intensity={visivel ? 3 : 0} distance={9} decay={2} />
        <sprite ref={halo} scale={[2.2, 2.2, 1]} position={[0, .3, 0]}><spriteMaterial map={brilho} color="#ffb347" transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={.6} /></sprite>
    </group>;
};

// ── a ENTIDADE: uma sombra de pé ──────────────────────────────────────────
interface EstadoSombra { i: number; fugindo: number; visto: boolean; percebeu: number }
const Sombra: React.FC<{ estado: React.MutableRefObject<EstadoSombra>; jog: React.MutableRefObject<Jog>; ativa: boolean; aoFugir: (i: number) => void; aoAlcancar: () => void }> = ({ estado, jog, ativa, aoFugir, aoAlcancar }) => {
    const g = useRef<THREE.Group>(null);
    const corpo = useMemo(() => new THREE.MeshBasicMaterial({color: '#050307', transparent: true, depthWrite: false, fog: true}), []);
    const fumaca = useMemo(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const c = canvas.getContext('2d')!, grad = c.createRadialGradient(16,16,0,16,16,16);
        grad.addColorStop(0,'rgba(255,255,255,.65)'); grad.addColorStop(1,'rgba(255,255,255,0)');
        c.fillStyle=grad;c.fillRect(0,0,32,32);
        const texture=new THREE.CanvasTexture(canvas), geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24*3),3));
        const mat=new THREE.PointsMaterial({color:'#0a0610',map:texture,transparent:true,depthWrite:false,size:.65,opacity:.24});
        return {texture,geo,mat};
    }, []);
    const fuma = fumaca.mat;
    const sombraGeo = useMemo(() => new THREE.PlaneGeometry(1, 1, 2, 16), []);
    const sombraMesh = useRef<THREE.Mesh>(null);
    const sombraMat = useMemo(() => new THREE.MeshBasicMaterial({color: '#000', map: fumaca.texture, transparent: true, opacity: .25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}), [fumaca.texture]);
    const dir = useMemo(() => new THREE.Vector3(), []), alvo = useMemo(() => new THREE.Vector3(), []);
    useEffect(() => () => {corpo.dispose(); fuma.dispose(); sombraMat.dispose(); fumaca.geo.dispose(); fumaca.texture.dispose(); sombraGeo.dispose();}, [corpo, fuma, sombraMat]);

    useFrame(({ clock, camera }, dt) => {
        const s = estado.current, a = APARICOES[s.i], gr = g.current; if (!gr) return;
        const t = clock.elapsedTime;
        const j = jog.current, d = Math.hypot(j.x - a.x, j.z - a.z);
        let x = a.x, z = a.z, y = alturaEm(a.x, a.z), opac = 1, esc = 1;
        if (ativa && s.fugindo === 0) {
            // ela PERCEBE quando o hóspede olha para ela (a < 60 m, mirando a menos de 12°) ou chega a 25 m:
            // fica 1,5 s parada, encarando, e só então some
            const olhando = (() => { camera.getWorldDirection(dir); alvo.set(a.x - camera.position.x, y + 3 - camera.position.y, a.z - camera.position.z).normalize(); return dir.dot(alvo) > Math.cos(12 * Math.PI / 180); })();
            if (a.foge > 0 && s.percebeu === 0 && (d < 18 || (d < 30 && olhando))) s.percebeu = .0001;
            if (s.percebeu > 0) { if (s.percebeu === .0001) tocarOlhar(); s.percebeu += dt; if (s.percebeu > 1.5) { s.fugindo = .0001; s.percebeu = 0; tocarSumico(); abalo.v = .6; anel.t = 0; anel.x = a.x; anel.z = a.z; } }
            else if (a.foge === 0 && d < 5) aoAlcancar();
        }
        if (s.fugindo > 0) {
            s.fugindo += dt;
            const k = Math.min(1, s.fugindo / 1.6);
            const dx = a.x - j.x, dz = a.z - j.z, dn = Math.hypot(dx, dz) || 1;
            if (a.como === 'afunda') { y -= k * k * 11; opac = 1 - THREE.MathUtils.smoothstep(k, .45, 1); }
            else if (a.como === 'crista') { x += dx / dn * k * 14; z += dz / dn * k * 14; y = alturaEm(x, z) + k * 2; opac = 1 - k; }
            else { opac = 1 - k; esc = 1 + k * .6; }
            if (s.fugindo > 1.7) { const anterior = s.i; s.i = Math.min(APARICOES.length - 1, s.i + 1); s.fugindo = 0; aoFugir(anterior); }
        }
        const tenso = Math.min(1, s.percebeu / 1.5);
        gr.position.set(x, y, z);
        // vira-se para o hóspede (só o corpo, sem rosto)
        gr.rotation.y = Math.atan2(j.x - x, j.z - z); gr.rotation.z = tenso * .26;   // inclina a cabeça
        const tremor = 1 + Math.sin(t * 50) * (.02 + tenso * .06);          // tremor de calor a 8 Hz, que cresce quando ela te encara
        gr.scale.set(1.5 * esc * tremor, 4.2 * esc, 1.5 * esc);   // alta e magra demais: errada
        gr.visible = ativa;
        // Projeção em coordenadas mundo: nunca gira com o corpo e acompanha cada triângulo.
        if (sombraMesh.current) sombraMesh.current.visible = ativa;
        const shadowPos = sombraGeo.attributes.position as THREE.BufferAttribute;
        const sunLength = Math.hypot(SOL.x, SOL.z), dx = -SOL.x / sunLength, dz = -SOL.z / sunLength;
        for (let i = 0; i < shadowPos.count; i++) {
            const u = (i % 3) / 2 - .5, v = Math.floor(i / 3) / 16;
            const px = x + dx * v * 17 + dz * u * 1.5, pz = z + dz * v * 17 - dx * u * 1.5;
            shadowPos.setXYZ(i, px, alturaEm(px,pz)+.045, pz);
        }
        shadowPos.needsUpdate = true;
        corpo.opacity = opac * (.91 + Math.sin(t * 13) * .025); fuma.opacity = opac * .24; sombraMat.opacity = opac * .25;
        // fiapos de fumaça escura subindo do contorno
        const fp = fumaca.geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 24; i++) {
            const u = (t * (.22 + tenso * .4) + i / 24) % 1, an = i * 2.4;
            fp.setXYZ(i, Math.cos(an) * (.24 + u * .18), .25 + u * 2.2, Math.sin(an) * .17);
        }
        fp.needsUpdate = true;
        s.visto = alvo.set(x, y + 1.5, z).project(camera).z < 1;
    });
    return <><mesh ref={sombraMesh} geometry={sombraGeo} material={sombraMat} frustumCulled={false} /><group ref={g}>
        {/* silhueta alta e magra: tronco, ombros caídos, cabeça sem rosto */}
        <mesh position={[0, 1.15, 0]}><capsuleGeometry args={[.28, 1.4, 4, 10]} /><primitive object={corpo} attach="material" /></mesh>
        <mesh position={[0, 2.25, 0]}><sphereGeometry args={[.22, 14, 10]} /><primitive object={corpo} attach="material" /></mesh>
        <mesh position={[-.42, 1.3, 0]} rotation={[0, 0, .12]}><capsuleGeometry args={[.07, 1.1, 3, 6]} /><primitive object={corpo} attach="material" /></mesh>
        <mesh position={[.42, 1.3, 0]} rotation={[0, 0, -.12]}><capsuleGeometry args={[.07, 1.1, 3, 6]} /><primitive object={corpo} attach="material" /></mesh>
        <points geometry={fumaca.geo} material={fuma} frustumCulled={false} />
    </group></>;
};

/** Quando ela some: uma pluma de areia que se abre num anel. */
const AnelDeAreia: React.FC = () => {
    const g = useRef<THREE.Group>(null), m1 = useRef<THREE.MeshBasicMaterial>(null), m2 = useRef<THREE.MeshBasicMaterial>(null);
    useFrame((_, dt) => {
        anel.t += dt; const k = anel.t / .9, gr = g.current; if (!gr) return;
        gr.visible = k < 1; if (k >= 1) return;
        gr.position.set(anel.x, alturaEm(anel.x, anel.z) + .2, anel.z);
        const r = .5 + k * 4; (gr.children[0] as THREE.Mesh).scale.set(r, r, 1); (gr.children[1] as THREE.Mesh).scale.set(1 + k * 2, .3 + k * 3, 1 + k * 2);
        if (m1.current) m1.current.opacity = .8 * (1 - k); if (m2.current) m2.current.opacity = .6 * (1 - k);
    });
    return <group ref={g} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.7, 1, 32]} /><meshBasicMaterial ref={m1} color="#e8b98a" transparent depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 1.2, 0]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial ref={m2} color="#d9a47a" transparent depthWrite={false} /></mesh>
    </group>;
};

/** Pegadas escuras da aparição anterior até a próxima (a trilha da caça). */
const Pegadas: React.FC<{ ate: number }> = ({ ate }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const pontos = useMemo(() => {
        const ps: [number, number, number][] = [];
        for (let i = 0; i < ate && i < APARICOES.length - 1; i++) {
            const c = CHEGADAS[i + 1], trechos: [{ x: number; z: number }, { x: number; z: number }][] = c ? [[APARICOES[i], c], [c, APARICOES[i + 1]]] : [[APARICOES[i], APARICOES[i + 1]]];
            for (const [a, b] of trechos) {
                const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(L / 1.6), ang = Math.atan2(b.x - a.x, b.z - a.z);
                for (let k = 1; k < n; k++) {
                    const u = k / n, lado = k % 2 ? .3 : -.3, x = a.x + (b.x - a.x) * u + Math.cos(ang) * lado, z = a.z + (b.z - a.z) * u - Math.sin(ang) * lado;
                    ps.push([x, z, ang]);
                }
            }
        }
        return ps;
    }, [ate]);
    useEffect(() => {
        const m = ref.current; if (!m) return; const o = new THREE.Object3D();
        pontos.forEach(([x, z, a], i) => { o.position.set(x, alturaEm(x, z) + .04, z); o.rotation.set(-Math.PI / 2, 0, a); o.scale.set(1, 1, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.count = pontos.length; m.instanceMatrix.needsUpdate = true;
    }, [pontos]);
    return <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, 1400]}><circleGeometry args={[.16, 8]} /><meshBasicMaterial color="#120a10" transparent opacity={.7} depthWrite={false} /></instancedMesh>;
};

// ── o hóspede (primeira pessoa) ───────────────────────────────────────────
const Corpo: React.FC<{ jog: React.MutableRefObject<Jog>; entrada: React.MutableRefObject<{ x: number; z: number }>; yaw: React.MutableRefObject<number>; pitch: React.MutableRefObject<number>; fase: Fase; folego: React.MutableRefObject<number> }> = ({ jog, entrada, yaw, pitch, fase, folego }) => {
    const camera = useThree((s) => s.camera);
    const passo = useRef(0);
    useFrame((_, raw) => {
        const dt = Math.min(raw, .05), j = jog.current;
        const pode = fase === 'sufocando' || fase === 'explorar';
        const e = entrada.current, s = Math.sin(yaw.current), c = Math.cos(yaw.current);
        let mx = 0, mz = 0;
        if (pode && j.caido <= 0) { mx = e.x * c + e.z * s; mz = -e.x * s + e.z * c; }
        const n = Math.hypot(mx, mz);
        // sem ar, ele se arrasta; com o capacete, anda bem (e corre nas descidas)
        const vel = fase === 'sufocando' ? 1.6 + 1.4 * (folego.current / FOLEGO_TOTAL) : 6.5;
        if (n > .05) {
            const k = Math.min(1, n); let nx = j.x + mx / n * vel * k * dt, nz = j.z + mz / n * vel * k * dt;
            for (const ob of SOLIDOS) { const dx = nx - ob.x, dz = nz - ob.z, d = Math.hypot(dx, dz), r = ob.r + .4; if (d < r && d > 1e-4) { nx = ob.x + dx / d * r; nz = ob.z + dz / d * r; } }
            const sobe = alturaEm(nx, nz) - alturaEm(j.x, j.z);
            const dentro = Math.hypot(nx, nz) < RAIO_DO_MUNDO - 35;
            if (dentro && sobe < vel * dt * 1.4) { j.x = nx; j.z = nz; }          // paredes íngremes demais seguram
            else if (dentro) { j.x += (nx - j.x) * .25; j.z += (nz - j.z) * .25; } // escorrega de lado
            j.andando = Math.min(1, j.andando + dt * 5);
        } else j.andando = Math.max(0, j.andando - dt * 5);
        j.y = alturaEm(j.x, j.z);
        if (j.caido > 0) j.caido = Math.max(0, j.caido - dt * .5);
        passo.current += dt * j.andando * (fase === 'sufocando' ? 5 : 8);
        const bob = Math.sin(passo.current) * .05 * j.andando;
        const cambaleio = fase === 'sufocando' ? Math.sin(performance.now() * .0017) * .05 * (1 - folego.current / FOLEGO_TOTAL) : 0;
        const altura = 1.68 - j.caido * 1.3;
        camera.position.set(j.x, j.y + altura + bob, j.z);
        camera.rotation.set(0, 0, 0, 'YXZ');
        if (abalo.v > 0) { abalo.v = Math.max(0, abalo.v - dt); camera.position.x += (Math.random() - .5) * .15 * abalo.v; camera.position.y += (Math.random() - .5) * .15 * abalo.v; }
        camera.rotation.y = yaw.current; camera.rotation.x = pitch.current + j.caido * .04; camera.rotation.z = cambaleio + Math.cos(passo.current * .5) * .012 * j.andando;
    });
    return null;
};

/** chaves de medição (só no dev): ?x<efeito> desliga um efeito para medir quanto ele custa */
const xdev = (k: string) => import.meta.env.DEV && location.search.includes('x' + k);

const MundoPronto: React.FC<{pronto: (v: boolean) => void}> = ({pronto}) => {
    const frames = useRef(0);
    // durante o vídeo da chegada o Canvas fica parado (frameloop "demand"): compila TODOS os shaders
    // de uma vez (nada de engasgo depois, quando um cristal ou arco entra na tela) e desenha alguns
    // quadros espaçados para aquecer sombra e pós-processamento, sem disputar a GPU com o vídeo
    const { gl, scene, camera, invalidate } = useThree();
    useEffect(() => {
        let vivo = true;
        gl.compileAsync(scene, camera).catch(() => undefined).finally(() => {
            for (let i = 0; i < 4; i++) setTimeout(() => { if (vivo) invalidate(); }, 300 * i);
        });
        return () => { vivo = false; };
    }, [gl, scene, camera, invalidate]);
    useFrame(({ gl }) => {
        if (import.meta.env.DEV) {   // estatística do quadro inteiro (sombra + cena + pós), não só do último passe
            (window as unknown as { __f14gl: unknown }).__f14gl = { ...gl.info.render, programas: gl.info.programs?.length, tex: gl.info.memory.textures };
            gl.info.autoReset = false; gl.info.reset();
        }if (++frames.current === 3) pronto(true);});
    return null;
};

export default function Floor14({ onExit }: { onExit: () => void }) {
    const settings = useOptionalSettings();
    const reduzida = settings.quality === 'low';
    useLayoutEffect(() => ligarAtmosfera(), []);   // névoa com altura e sol, só enquanto o andar existe
    useEffect(() => { abalo.v = 0; anel.t = 9; }, []);
    const [fase, setFase] = useState<Fase>('chegada');
    const jog = useRef<Jog>({ x: INICIO.x, y: alturaEm(0, 0), z: INICIO.z, andando: 0, caido: 1 });
    const entrada = useRef({ x: 0, z: 0 }), yaw = useRef(0), pitch = useRef(-.10);
    const folego = useRef(FOLEGO_TOTAL);
    const [folegoUi, setFolegoUi] = useState(FOLEGO_TOTAL);
    const [perto, setPerto] = useState(false);
    const [dica, setDica] = useState<string | null>(null);
    const [vistas, setVistas] = useState(0);
    const [desmaios, setDesmaios] = useState(0);
    const sombra = useRef<EstadoSombra>({ i: 0, fugindo: 0, visto: false, percebeu: 0 });
    const [fim, setFim] = useState(0);
    const [mundoPronto, setMundoPronto] = useState(false);
    // resolução adaptativa: começa no máximo da qualidade escolhida e só desce (até 1×, nunca abaixo
    // da tela) se o aparelho não sustentar o quadro; volta a subir quando sobra folga
    const dprMax = reduzida ? 1 : settings.quality === 'high' ? 1.5 : 1.25;
    const [dpr, setDpr] = useState(() => Math.min(dprMax, window.devicePixelRatio || 1));
    const [chegadaTerminou, setChegadaTerminou] = useState(false);
    useEffect(() => {
        if (chegadaTerminou && mundoPronto) { jog.current.caido = 0; setFase('explorar'); }   // a cutscene termina com o capacete na cabeça: o jogo começa já com ele
    }, [chegadaTerminou, mundoPronto]);

    // ── o fôlego acabando ──
    useEffect(() => {
        if (fase !== 'sufocando') return;
        tocarVento();
        let ultimo = performance.now(), proxArfar = 0, raf = 0, proximaUi = 0;
        const tick = (agora: number) => {
            const dt = Math.min(.1, (agora - ultimo) / 1000); ultimo = agora;
            folego.current = Math.max(0, folego.current - (document.hidden ? 0 : dt));
            const j = jog.current;
            if (agora >= proximaUi) { setFolegoUi(folego.current); setPerto(Math.hypot(j.x - CAPACETE.x, j.z - CAPACETE.z) < 2.6); proximaUi = agora + 100; }
            proxArfar -= dt;
            if (proxArfar <= 0) { tocarArfar(1 - folego.current / FOLEGO_TOTAL * .6); proxArfar = .5 + folego.current / FOLEGO_TOTAL * 1.6; }
            if (folego.current <= 0) {
                // desmaia e acorda de novo, um pouco mais perto do capacete
                j.caido = 1; folego.current = FOLEGO_TOTAL * .8; setDesmaios((n) => n + 1);
                j.x = CAPACETE.x - 2.5; j.z = CAPACETE.z + 3;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [fase]);

    const vestir = () => {
        if (fase !== 'sufocando' || !perto) return;
        tocarCapacete(); setFase('explorar'); setPerto(false);
        window.setTimeout(() => setDica(APARICOES[0].dica), 1800);
    };

    const aoFugir = (i: number) => {
        setVistas(i + 1);
        setDica(i === 0 ? 'Ela sumiu. Ficaram pegadas na areia.' : 'Sumiu de novo…');
        window.setTimeout(() => setDica(APARICOES[Math.min(APARICOES.length - 1, i + 1)].dica), 2600);
    };
    const aoAlcancar = () => { if (fase !== 'explorar') return; setFase('fim'); tocarSumico(); };
    useEffect(() => {
        if (fase !== 'fim') return;
        let raf = 0; const t0 = performance.now();
        const tick = (agora: number) => { const k = Math.min(1, (agora - t0) / 3500); setFim(k); if (k < 1) raf = requestAnimationFrame(tick); else { vento?.parar(); onExit(); } };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [fase, onExit]);
    useEffect(() => () => vento?.parar(), []);
    useEffect(() => { if (!dica) return; const id = window.setTimeout(() => setDica(null), 6000); return () => window.clearTimeout(id); }, [dica]);

    // ── entrada: teclado, joystick à esquerda, câmera à direita ──
    useEffect(() => {
        const teclas = new Set<string>();
        const atualizar = () => {
            const x = (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
            const z = (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0) - (teclas.has('w') || teclas.has('arrowup') ? 1 : 0);
            entrada.current = { x, z };
        };
        const down = (ev: KeyboardEvent) => { const k = ev.key.toLowerCase(); teclas.add(k); atualizar(); if (k === 'e' || k === 'enter') acaoRef.current(); if (k === 'q') yaw.current += .3; };
        const up = (ev: KeyboardEvent) => { teclas.delete(ev.key.toLowerCase()); atualizar(); };
        const clear = () => { teclas.clear(); atualizar(); };
        window.addEventListener('blur', clear); window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('blur', clear); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);
    const acaoRef = useRef(vestir); acaoRef.current = vestir;
    // bancada: mexer no hóspede e na fase pelo console / Playwright
    if (import.meta.env.DEV) (window as unknown as { __f14: unknown }).__f14 = { jog, yaw, pitch, sombra, entrada, solidos: SOLIDOS, folego, vestir: () => { tocarCapacete(); setFase('explorar');  }, fase,
        // a vista de quem chega pela trilha: 70 m antes da aparição, vindo da anterior
        aparicaoXZ: (i: number) => APARICOES[i],
        aparicao: (i: number) => { const a = APARICOES[i], c = CHEGADAS[i] ?? { x: 0, z: 0 };
            const ya = Math.atan2(-(a.x - c.x), -(a.z - c.z)), d = Math.hypot(a.x - c.x, a.z - c.z), alt = alturaEm(a.x, a.z) + 4 - (alturaEm(c.x, c.z) + 1.7);
            return [c.x, c.z, ya, Math.atan2(alt, d)]; } };
    const toque = useRef<{ id: number | null; ox: number; oy: number; cam: number | null; cx: number; cy: number }>({ id: null, ox: 0, oy: 0, cam: null, cx: 0, cy: 0 });
    const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
    const onDown = (ev: React.PointerEvent) => {
        if (fase === 'chegada' || fase === 'fim') return;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        if (ev.clientX < window.innerWidth * .5 && toque.current.id === null) { toque.current = { ...toque.current, id: ev.pointerId, ox: ev.clientX, oy: ev.clientY }; setStick({ ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 }); }
        else if (toque.current.cam === null) toque.current = { ...toque.current, cam: ev.pointerId, cx: ev.clientX, cy: ev.clientY };
    };
    const onMove = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) {
            let dx = ev.clientX - t.ox, dy = ev.clientY - t.oy; const d = Math.hypot(dx, dy), R = 60;
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            entrada.current = { x: dx / R, z: dy / R }; setStick({ ox: t.ox, oy: t.oy, x: dx, y: dy });
        } else if (ev.pointerId === t.cam) {
            yaw.current -= (ev.clientX - t.cx) * .006; t.cx = ev.clientX;
            pitch.current = THREE.MathUtils.clamp(pitch.current - (ev.clientY - t.cy) * .005, -1.2, 1.1); t.cy = ev.clientY;
        }
    };
    const onUp = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) { t.id = null; entrada.current = { x: 0, z: 0 }; setStick(null); }
        if (ev.pointerId === t.cam) t.cam = null;
    };

    const falta = 1 - folegoUi / FOLEGO_TOTAL;
    const comCapacete = fase === 'explorar' || fase === 'fim';
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#120a14', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <Canvas style={{ position: 'absolute', inset: 0, filter: fase === 'sufocando' ? `blur(${falta * 2.5}px) saturate(${1 - falta * .5})` : undefined }}
                dpr={dpr} frameloop={fase === 'chegada' ? 'demand' : 'always'} shadows={!xdev('sombra')} camera={{ fov: 68, near: .08, far: 2000 }} gl={{ antialias: settings.quality === 'high', toneMapping: THREE.ACESFilmicToneMapping }}>
                <fogExp2 attach="fog" args={['#d49a6c', .0036]} />
                {!xdev('amb') && <AmbienteDoCeu intensidade={.6} />}
                <NevoaPorRegiao jog={jog} />
                <hemisphereLight args={['#b8a3d0', '#8a5434', .5]} />
                <SolQueSegue jog={jog} reduzida={reduzida} />
                <directionalLight position={[-120, 50, -400]} intensity={.35} color="#9ad0ff" />
                {!xdev('ceu') && <CeuKessar />}
                {!xdev('poeira') && <PoeiraKessar reduzida={reduzida} />}
                <Terreno reduzida={reduzida || xdev('terreno')} />
                {!xdev('pedra') && <Pedras />}
                {!xdev('cascalho') && <CascalhoKessar reduzida={reduzida} />}
                {!xdev('cristal') && <Cristais reduzida={reduzida} />}
                <Ossada />
                <Monolito />
                <ColunaDaCratera />
                <Agulhas />
                <Arcos />
                <Capacete visivel={!comCapacete} />
                <Pegadas ate={vistas} />
                <AnelDeAreia />
                <Sombra estado={sombra} jog={jog} ativa={comCapacete} aoFugir={aoFugir} aoAlcancar={aoAlcancar} />
                {!reduzida && !(import.meta.env.DEV && location.search.includes('sempos')) && <EffectComposer multisampling={0}>
                    <Bloom intensity={.18} luminanceThreshold={1.1} luminanceSmoothing={.2} mipmapBlur />
                    <Vignette offset={.35} darkness={.4} />
                    <HueSaturation saturation={-.07} />
                    <BrightnessContrast contrast={.035} />
                    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                </EffectComposer>}
                <MundoPronto pronto={setMundoPronto} />
                <PerformanceMonitor bounds={() => [50, 58]} flipflops={4}
                    onDecline={({ fps }) => setDpr((d) => Math.max(fps < 30 ? .8 : 1, +(d - .25).toFixed(2)))}   // abaixo de 1× só se ainda engasgar
                    onIncline={() => setDpr((d) => Math.min(dprMax, window.devicePixelRatio || 1, +(d + .25).toFixed(2)))} />
                <Corpo jog={jog} entrada={entrada} yaw={yaw} pitch={pitch} fase={fase} folego={folego} />
            </Canvas>

            {/* sufocando: as bordas escurecem e pulsam em vermelho */}
            {fase === 'sufocando' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse at center, transparent ${55 - falta * 35}%, rgba(90,0,10,${.35 + falta * .5}) 100%)`,
                opacity: .8 + Math.sin(performance.now() * .006) * .2 }} />}
            {/* com o capacete: a escotilha de latão e a borda de madeira */}
            {comCapacete && <Escotilha />}

            {/* HUD */}
            {fase === 'sufocando' && <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', color: '#ffe6d0', fontFamily: 'Georgia, serif', textShadow: '0 2px 6px #000', pointerEvents: 'none' }}>
                <div style={{ fontSize: 15, letterSpacing: 2 }}>NÃO HÁ AR</div>
                <div style={{ width: 220, height: 10, marginTop: 6, border: '2px solid #ffe6d0', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(folegoUi / FOLEGO_TOTAL) * 100}%`, height: '100%', background: folegoUi < 8 ? '#e2412e' : '#f2c46a' }} />
                </div>
                <div style={{ fontSize: 13, marginTop: 6, opacity: .85 }}>{desmaios ? 'Você apagou… Ali, meio enterrado: um capacete.' : 'Algo brilha na areia, logo à frente.'}</div>
            </div>}
            {perto && fase === 'sufocando' && <button onPointerDown={(e) => e.stopPropagation()} onClick={vestir}
                style={{ position: 'absolute', bottom: 40, right: 40, padding: '16px 26px', fontSize: 18, fontFamily: 'Georgia, serif', background: '#f2c46a', color: '#2a1408', border: '3px solid #2a1408', borderRadius: 14 }}>
                VESTIR O CAPACETE (E)
            </button>}
            {dica && <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', maxWidth: '80vw', padding: '10px 18px', background: 'rgba(20,10,16,.72)', color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 16, borderRadius: 10, pointerEvents: 'none' }}>{dica}</div>}
            {comCapacete && <div style={{ position: 'absolute', top: 14, right: 18, color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 14, textShadow: '0 1px 4px #000', pointerEvents: 'none' }}>A sombra · {vistas}/{APARICOES.length - 1} rastros</div>}
            {stick && <div style={{ position: 'absolute', left: stick.ox - 60, top: stick.oy - 60, width: 120, height: 120, borderRadius: '50%', border: '2px solid rgba(255,240,220,.5)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 44 + stick.x, top: 44 + stick.y, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,240,220,.6)' }} /></div>}

            {/* a chegada: vídeo pré-renderizado (Blender + Manim + Remotion) */}
            {fase === 'chegada' && !chegadaTerminou && <ChegadaKessar onFinish={() => setChegadaTerminou(true)} volume={settings.masterVolume} />}
            {fase === 'chegada' && chegadaTerminou && <div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',background:'#080b10',color:'#d9c6aa',fontFamily:'Georgia,serif'}}>Preparando o deserto…</div>}
            {fase === 'fim' && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fim, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 22, opacity: Math.min(1, fim * 2) }}>Ela se vira. Não tem rosto. E agora não foge mais.</div></div>}
        </div>
    );
}
