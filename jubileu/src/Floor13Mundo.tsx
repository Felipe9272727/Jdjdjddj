/**
 * Floor13Mundo.tsx — o que se vê em Vindhjem.
 *
 * Ilhas de pedra com tampo de grama, pontes de tábua e corda, casas compridas
 * vikings com proa de dragão, a forja, o templo do sino, a praça do mercado e,
 * em volta de tudo, barcos navegando o céu. Só desenho: onde se pisa e quem
 * está onde vêm de `f13Mundo.ts`.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import casaGlb from './assets/f13/casa.glb';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import nuvensAtlas from './assets/f13/nuvens.webp';
import { CASAS, CASA_CERTA } from './f13Lore';
import { ILHAS, PONTES, LUGAR_DAS_CASAS, SINO } from './f13Mundo';
import { pbr } from './f13Texturas';
import { fundirEstaticos } from './f13Fundir';

/** Funde o que está parado debaixo deste grupo depois de montado (ver f13Fundir). */
function useFundir(ref: React.RefObject<THREE.Object3D | null>, celula?: number) {
    useLayoutEffect(() => (ref.current ? fundirEstaticos(ref.current, celula) : undefined), [ref, celula]);
}

// ── PALETA ───────────────────────────────────────────────────────────────────
export const P13 = Object.freeze({
    ceuAlto: '#5f97d1', ceuBaixo: '#f3d6ae', sol: '#fff1c9',
    grama: '#6f9a4a', gramaEsc: '#4f7a36', pedra: '#7b7064', pedraEsc: '#4a4038',
    madeira: '#6b4a2e', madeiraEsc: '#3f2a1a', tabua: '#8a6440', corda: '#c9b186',
    telhado: '#5b3b25', turfa: '#6d8a3e', latao: '#e0b155', carvalho: '#3f2616',
    vela1: '#b33a2e', vela2: '#efe3c8', escudo: ['#b33a2e', '#2f5d62', '#c9a13a', '#efe3c8'],
});

const ruido = (x: number, y: number, z: number) =>
    Math.sin(x * 1.7 + z * 2.3) * .5 + Math.sin(x * 4.1 - y * 3.7 + z * 1.3) * .3 + Math.sin(y * 6.3 + x * 5.1) * .2;

/** A rocha de baixo de uma ilha: cone invertido, facetado e irregular. */
function geoRocha(r: number, semente: number): THREE.BufferGeometry {
    const g = new THREE.ConeGeometry(r * .98, r * 1.7, 14, 5, false);
    g.rotateX(Math.PI);
    g.translate(0, -r * .85 - .3, 0);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = ruido(x * .4 + semente, y * .4, z * .4 + semente);
        const k = y < -.4 ? 1 : 0;
        p.setXYZ(i, x * (1 + n * .18 * k), y + n * .6 * k, z * (1 + n * .18 * k));
    }
    g.computeVertexNormals();
    // UV cilíndrica para a textura de rocha: volta inteira em u, altura em v
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i), -p.getY(i) / (r * 1.8));
    const ng = g.toNonIndexed();
    // gradiente: lábio quente em cima, base fria e escura embaixo
    const q = ng.getAttribute('position'), cor = new Float32Array(q.count * 3);
    const topo = new THREE.Color('#e8dccb'), base = new THREE.Color('#77778a'), c = new THREE.Color();
    for (let k = 0; k < q.count; k++) {
        const h = Math.min(1, Math.max(0, -q.getY(k) / (r * 1.9)));
        c.copy(topo).lerp(base, Math.pow(h, .7));
        cor.set([c.r, c.g, c.b], k * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    return ng;
}

/** Direção do sol baixo da tarde (a mesma que a luz de sombra usa). */
export const DIRECAO_DO_SOL = new THREE.Vector3(-120, 72, -220).normalize();

/**
 * O céu é espalhamento atmosférico de verdade (modelo de Preetham, o `Sky`
 * do three): o azul, o alaranjado do horizonte e o brilho em volta do sol
 * saem da física, não de um degradê pintado. O mesmo céu vira a luz
 * ambiente (ver `Ambiente` em Floor13.tsx).
 */
export function novoCeu(): Sky {
    const ceu = new Sky();
    ceu.scale.setScalar(450);
    const u = ceu.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.5; u.mieCoefficient.value = .0025; u.mieDirectionalG.value = .78;
    u.sunPosition.value.copy(DIRECAO_DO_SOL);
    // o Preetham sai em radiância física, clara demais para esta cena: um
    // terço, para o céu ficar azul e o horizonte âmbar em vez de branco
    ceu.material.fragmentShader = ceu.material.fragmentShader
        .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * .42, 1.0 );')
        // o disco do sol vem 19000× mais forte que o céu: cegava a tela
        // inteira pelo bloom. Fica um disco quente, visível sem ofuscar
        .replace('vSunE * 19000.0 * Fex', 'vSunE * 700.0 * Fex');
    return ceu;
}
const Ceu: React.FC = () => {
    const ceu = useMemo(() => novoCeu(), []);
    return <primitive object={ceu} />;
};

/** Halo radial que some suave até a borda (a esfera translúcida tinha borda dura). */
let texHalo: THREE.CanvasTexture | null = null;
function texturaDeHalo(): THREE.CanvasTexture {
    if (texHalo) return texHalo;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(.25, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    texHalo = new THREE.CanvasTexture(c); return texHalo;
}

/** O mar de nuvens lá embaixo e alguns bancos soltos entre as ilhas. */
const Nuvens: React.FC = () => {
    // impostores: nuvens de volume renderizadas no Cycles (ver
    // tools/blender/f13_nuvens.py) num atlas 2×2; aqui viram cartões que
    // giram só em torno do eixo vertical — o fundo reto fica sempre reto — e
    // são tingidos pelo sol (topo quente, barriga lilás, como no céu)
    const { geo, mat, lista } = useMemo(() => {
        const g = new THREE.PlaneGeometry(1, 1); g.translate(0, .5, 0);
        const m = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, fog: true,
            uniforms: {
                ...THREE.UniformsLib.fog,
                mapa: { value: new THREE.TextureLoader().load(nuvensAtlas, (t) => { t.colorSpace = THREE.SRGBColorSpace; }) },
                sol: { value: new THREE.Color('#ffe2b8') }, sombra: { value: new THREE.Color('#8f86a8') },
            },
            vertexShader: `
                attribute float aCel;
                varying vec2 vUv; varying float vY;
                #include <fog_pars_vertex>
                void main() {
                    vec4 centro = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
                    vec3 escala = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.);
                    vec3 paraCam = cameraPosition - centro.xyz; paraCam.y = 0.; paraCam = normalize(paraCam);
                    vec3 lado = normalize(cross(vec3(0., 1., 0.), paraCam));
                    vec3 p = centro.xyz + lado * position.x * escala.x + vec3(0., 1., 0.) * position.y * escala.y;
                    vec4 mvPosition = viewMatrix * vec4(p, 1.);
                    gl_Position = projectionMatrix * mvPosition;
                    float cx = mod(aCel, 2.), cy = floor(aCel / 2.);
                    vUv = vec2((uv.x + cx) * .5, (uv.y + (1. - cy)) * .5);
                    vY = uv.y;
                    #include <fog_vertex>
                }`,
            fragmentShader: `
                uniform sampler2D mapa; uniform vec3 sol; uniform vec3 sombra;
                varying vec2 vUv; varying float vY;
                #include <fog_pars_fragment>
                void main() {
                    vec4 c = texture2D(mapa, vUv);
                    if (c.a < .01) discard;
                    float l = dot(c.rgb, vec3(.33));
                    vec3 cor = mix(sombra, sol, smoothstep(.35, .95, l + vY * .25)) * (.75 + l * .55);
                    gl_FragColor = vec4(cor, c.a);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    #include <fog_fragment>
                }`,
        });
        const l: { x: number; y: number; z: number; s: number; c: number }[] = [];
        let k = 7;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        // o mar de nuvens embaixo e alguns bancos soltos na altura das ilhas
        for (let i = 0; i < 150; i++) {
            const a = rnd() * Math.PI * 2, d = 18 + rnd() * 190;
            l.push({ x: Math.cos(a) * d, y: -24 - rnd() * 10, z: Math.sin(a) * d, s: 26 + rnd() * 30, c: Math.floor(rnd() * 4) });
        }
        for (let i = 0; i < 18; i++) {
            const a = rnd() * Math.PI * 2, d = 45 + rnd() * 70;
            l.push({ x: Math.cos(a) * d, y: 2 + rnd() * 16, z: Math.sin(a) * d, s: 12 + rnd() * 12, c: Math.floor(rnd() * 4) });
        }
        return { geo: g, mat: m, lista: l };
    }, []);
    const ref = useRef<THREE.InstancedMesh>(null);
    useEffect(() => {
        const m = ref.current; if (!m) return;
        const o = new THREE.Object3D();
        lista.forEach((c, i) => { o.position.set(c.x, c.y, c.z); o.scale.set(c.s, c.s * .5, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.instanceMatrix.needsUpdate = true;
        m.geometry.setAttribute('aCel', new THREE.InstancedBufferAttribute(new Float32Array(lista.map((c) => c.c)), 1));
    }, [lista]);
    useFrame(({ clock }) => {
        // deriva lenta: o mar de nuvens anda
        const m = ref.current; if (!m) return;
        m.position.x = Math.sin(clock.elapsedTime * .01) * 6;
    });
    return <instancedMesh ref={ref} args={[geo, mat, lista.length]} frustumCulled={false} renderOrder={-5} />;
};

/** Uma ilha: tampo de grama com borda de terra e a rocha pendurada. */
const IlhaVisual: React.FC<{ x: number; y: number; z: number; r: number; i: number }> = ({ x, y, z, r, i }) => {
    const rocha = useMemo(() => geoRocha(r, i * 3.1), [r, i]);
    // tampo com manchas: grama clara e escura misturadas por ruído, e terra
    // batida no miolo (onde se anda mais)
    const topo = useMemo(() => {
        const g = new THREE.CylinderGeometry(r, r * .97, .36, 48, 1, false).toNonIndexed();
        const p = g.getAttribute('position'), cor = new Float32Array(p.count * 3);
        // multiplicam a textura de grama: tons perto do branco
        const a = new THREE.Color('#9fd060'), b = new THREE.Color('#6f9a40'), terra = new THREE.Color('#c8b088'), c = new THREE.Color();
        for (let k = 0; k < p.count; k++) {
            const x = p.getX(k), z = p.getZ(k);
            const n = ruido(x * .7 + i, 0, z * .7) * .5 + .5;
            c.copy(a).lerp(b, n);
            const d = Math.hypot(x, z) / r;
            if (d < .35) c.lerp(terra, (1 - d / .35) * .45);
            cor.set([c.r, c.g, c.b], k * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
        g.computeVertexNormals();
        return g;
    }, [r, i]);
    return <group position={[x, y, z]}>
        <mesh position={[0, -.18, 0]} receiveShadow geometry={topo}><meshStandardMaterial vertexColors {...pbr('grama', Math.round(r / 1.6))} normalScale={new THREE.Vector2(.8, .8)} /></mesh>
        {/* a franja de grama que escorre pela borda */}
        <mesh position={[0, -.42, 0]}><cylinderGeometry args={[r * 1.01, r * .99, .22, 40, 1, true]} /><meshStandardMaterial color={P13.gramaEsc} {...pbr('grama', 8, 1)} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -.55, 0]}><cylinderGeometry args={[r * .97, r * .95, .4, 40]} /><meshStandardMaterial color="#8a6a4a" {...pbr('rocha', 6, .5)} /></mesh>
        <mesh geometry={rocha}><meshStandardMaterial vertexColors {...pbr('rocha', 3, 2)} /></mesh>
        {/* raízes e pedras soltas penduradas: o que diz "isto voa" */}
        {[0, 1, 2].map((k) => (
            <mesh key={k} position={[Math.cos(k * 2.1 + i) * r * .5, -r * 1.9 - k * .8, Math.sin(k * 2.1 + i) * r * .5]}>
                <dodecahedronGeometry args={[.5 + k * .2, 0]} /><meshStandardMaterial color={P13.pedraEsc} flatShading />
            </mesh>
        ))}
    </group>;
};

/** Ponte de tábuas com corrimão de corda, curvando levemente para baixo. */
const PonteVisual: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; largura: number }> = ({ a, b, largura }) => {
    const tabuas = useMemo(() => {
        const L = a.distanceTo(b), n = Math.floor(L / .55);
        return Array.from({ length: n }, (_, i) => {
            const t = (i + .5) / n;
            const p = a.clone().lerp(b, t);
            p.y += -Math.sin(t * Math.PI) * .35 - .08;
            return p;
        });
    }, [a, b]);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    return <group>
        {tabuas.map((p, i) => (
            <mesh key={i} position={p} rotation={[0, ang, (i % 3 - 1) * .02]}>
                <boxGeometry args={[largura, .09, .46]} /><meshStandardMaterial {...pbr('carvalho', .5, .25)} color={i % 4 ? '#ffffff' : '#d8c8b8'} />
            </mesh>
        ))}
        {[-1, 1].map((lado) => tabuas.filter((_, i) => i % 5 === 0).map((p, i) => (
            <mesh key={`${lado}${i}`} position={[p.x + Math.cos(ang) * lado * largura / 2, p.y + .55, p.z - Math.sin(ang) * lado * largura / 2]}>
                <cylinderGeometry args={[.05, .06, 1.1, 6]} /><meshStandardMaterial color={P13.madeiraEsc} />
            </mesh>
        )))}
        {[-1, 1].map((lado) => {
            const pts = tabuas.map((p) => new THREE.Vector3(p.x + Math.cos(ang) * lado * largura / 2, p.y + .95, p.z - Math.sin(ang) * lado * largura / 2));
            if (pts.length < 2) return null;
            return <mesh key={lado}><tubeGeometry args={[new THREE.CatmullRomCurve3(pts), pts.length * 2, .03, 5, false]} /><meshStandardMaterial color={P13.corda} /></mesh>;
        })}
    </group>;
};

/** Madeira: veios verticais escuros e nós, desenhados num canvas e repetidos. */
let texMadeira: THREE.CanvasTexture | null = null;
export function texturaDeMadeira(): THREE.CanvasTexture {
    if (texMadeira) return texMadeira;
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8a6440'; g.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x += 16) {
        g.fillStyle = 'rgba(40,24,12,.55)'; g.fillRect(x, 0, 2, 256);
        for (let k = 0; k < 40; k++) {
            g.fillStyle = `rgba(${Math.random() > .5 ? '60,38,20' : '170,130,90'},${.08 + Math.random() * .12})`;
            g.fillRect(x + 2 + Math.random() * 13, Math.random() * 256, 1, 20 + Math.random() * 60);
        }
        if (Math.random() > .4) { g.fillStyle = 'rgba(50,30,15,.5)'; g.beginPath(); g.ellipse(x + 8, Math.random() * 256, 3, 5, 0, 0, Math.PI * 2); g.fill(); }
    }
    texMadeira = new THREE.CanvasTexture(c);
    texMadeira.colorSpace = THREE.SRGBColorSpace; texMadeira.wrapS = texMadeira.wrapT = THREE.RepeatWrapping; texMadeira.repeat.set(2, 1);
    return texMadeira;
}

/** Telhas de turfa em escama: fileiras alternadas com borda escura. */
let texTelha: THREE.CanvasTexture | null = null;
function texturaDeTelha(): THREE.CanvasTexture {
    if (texTelha) return texTelha;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6d8a3e'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
        const cx = x * 16 + (y % 2 ? 8 : 0), cy = y * 16 + 12;
        g.fillStyle = `rgb(${90 + Math.random() * 30},${118 + Math.random() * 30},${50 + Math.random() * 20})`;
        g.beginPath(); g.ellipse(cx, cy, 8, 9, 0, 0, Math.PI); g.fill();
        g.strokeStyle = 'rgba(30,40,15,.6)'; g.lineWidth = 1.5; g.stroke();
    }
    texTelha = new THREE.CanvasTexture(c); texTelha.colorSpace = THREE.SRGBColorSpace;
    texTelha.wrapS = texTelha.wrapT = THREE.RepeatWrapping; texTelha.repeat.set(2, 3);
    return texTelha;
}

/** Latão escovado: riscos horizontais finos e uma fileira de rebites. */
let texEscovada: THREE.CanvasTexture | null = null;
function texturaEscovada(): THREE.CanvasTexture {
    if (texEscovada) return texEscovada;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y++) { g.fillStyle = `rgba(${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},.08)`; g.fillRect(0, y, 64, 1); }
    g.fillStyle = '#2a2a2a';
    for (const y of [8, 120]) for (let x = 6; x < 64; x += 13) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
    texEscovada = new THREE.CanvasTexture(c);
    return texEscovada;
}

/**
 * O que se vê pela porta certa: uma cabine de elevador em perspectiva —
 * paredes de latão almofadadas convergindo para uma luz no fundo, painel de
 * botões à direita e piso de tábuas escuras.
 */
let texCabine: THREE.CanvasTexture | null = null;
function texturaDeCabine(): THREE.CanvasTexture {
    if (texCabine) return texCabine;
    const c = document.createElement('canvas'); c.width = 128; c.height = 200;
    const g = c.getContext('2d')!;
    const fundo = { x: 40, y: 50, w: 48, h: 90 };
    const lat = (a: number) => `rgba(${200 + a},${150 + a * .6},${70},1)`;
    g.fillStyle = lat(0); g.beginPath(); g.moveTo(0, 0); g.lineTo(fundo.x, fundo.y); g.lineTo(fundo.x, fundo.y + fundo.h); g.lineTo(0, 200); g.fill();
    g.fillStyle = lat(-30); g.beginPath(); g.moveTo(128, 0); g.lineTo(fundo.x + fundo.w, fundo.y); g.lineTo(fundo.x + fundo.w, fundo.y + fundo.h); g.lineTo(128, 200); g.fill();
    g.fillStyle = '#f1e2c2'; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(fundo.x + fundo.w, fundo.y); g.lineTo(fundo.x, fundo.y); g.fill();
    // piso: tábuas escuras em perspectiva
    g.fillStyle = '#3a2618'; g.beginPath(); g.moveTo(0, 200); g.lineTo(128, 200); g.lineTo(fundo.x + fundo.w, fundo.y + fundo.h); g.lineTo(fundo.x, fundo.y + fundo.h); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
    for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(128 * j / 6, 200); g.lineTo(fundo.x + fundo.w * j / 6, fundo.y + fundo.h); g.stroke(); }
    // almofadas nas paredes: frisos verticais escuros e filete claro
    const friso = (x0: number, lado: 1 | -1) => {
        for (let k = 1; k < 4; k++) {
            const t = k / 4, xa = x0 + (lado > 0 ? fundo.x : -(128 - fundo.x - fundo.w)) * t;
            const ya = fundo.y * t, yb = 200 - (200 - fundo.y - fundo.h) * t;
            g.strokeStyle = 'rgba(70,40,10,.6)'; g.beginPath(); g.moveTo(xa, ya); g.lineTo(xa, yb); g.stroke();
            g.strokeStyle = 'rgba(255,235,170,.5)'; g.beginPath(); g.moveTo(xa + lado, ya); g.lineTo(xa + lado, yb); g.stroke();
        }
    };
    friso(0, 1); friso(128, -1);
    // painel de botões na parede direita
    g.fillStyle = '#5a3a14'; g.fillRect(100, 88, 10, 34);
    for (let k = 0; k < 4; k++) { g.fillStyle = k === 1 ? '#fff2b0' : '#e0b860'; g.beginPath(); g.arc(105, 93 + k * 8, 2.2, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(64, 95, 4, 64, 95, 40); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(1, '#ffd98a');
    g.fillStyle = gr; g.fillRect(fundo.x, fundo.y, fundo.w, fundo.h);
    texCabine = new THREE.CanvasTexture(c); texCabine.colorSpace = THREE.SRGBColorSpace;
    return texCabine;
}

/** Textura com uma runa branca pintada em madeira escura. */
function texturaRuna(runa: string): THREE.CanvasTexture {
    // placa de carvalho com veio, borda chanfrada e a runa entalhada (sulco
    // escuro com a luz pegando na aresta de cima), pintada de ocre gasto
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const fundo = g.createLinearGradient(0, 0, 128, 128); fundo.addColorStop(0, '#6e4a2c'); fundo.addColorStop(1, '#4e331d');
    g.fillStyle = fundo; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,18,8,${.08 + Math.random() * .12})`; g.lineWidth = 1 + Math.random(); g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); g.bezierCurveTo(40, y + 6, 80, y - 6, 128, y + Math.random() * 4); g.stroke(); }
    g.strokeStyle = 'rgba(20,12,6,.7)'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
    g.strokeStyle = 'rgba(200,160,110,.25)'; g.lineWidth = 2; g.strokeRect(9, 9, 110, 110);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 84px serif';
    g.fillStyle = 'rgba(240,210,160,.35)'; g.fillText(runa, 64, 66);
    g.fillStyle = '#2a170a'; g.fillText(runa, 64, 69);
    g.fillStyle = 'rgba(190,120,50,.55)'; g.fillText(runa, 64, 69);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Fumaça de chaminé: bolinhas que sobem, crescem e somem. */
/** Fumaça de chaminé: nove bolas numa malha instanciada só (uma chamada),
 *  cada uma com a própria transparência (atributo `aAlfa`). */
const geoFumaca = new THREE.SphereGeometry(1, 10, 8);
const matFumaca = (() => {
    const m = new THREE.MeshBasicMaterial({ color: '#d9d4cc', transparent: true, depthWrite: false });
    m.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float aAlfa;\nvarying float vAlfa;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlfa = aAlfa;');
        sh.fragmentShader = 'varying float vAlfa;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlfa;');
    };
    return m;
})();
const Fumaca: React.FC<{ y: number }> = ({ y }) => {
    const N = 9;
    const malha = useMemo(() => {
        const g = geoFumaca.clone();
        g.setAttribute('aAlfa', new THREE.InstancedBufferAttribute(new Float32Array(N), 1));
        const im = new THREE.InstancedMesh(g, matFumaca, N);
        im.frustumCulled = false; im.userData.vivo = true;
        return im;
    }, []);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(({ clock }) => {
        const alfa = malha.geometry.getAttribute('aAlfa') as THREE.InstancedBufferAttribute;
        for (let i = 0; i < N; i++) {
            const t = (clock.elapsedTime * .35 + i / N) % 1;
            o.position.set(Math.sin(t * 5 + i) * .3 + t * 1.2, y + t * 5, 0);
            o.scale.setScalar(.35 + t * 1.3); o.updateMatrix();
            malha.setMatrixAt(i, o.matrix); alfa.setX(i, .55 * (1 - t));
        }
        malha.instanceMatrix.needsUpdate = true; alfa.needsUpdate = true;
    });
    useEffect(() => () => malha.geometry.dispose(), [malha]);
    return <primitive object={malha} />;
};

/** Casa comprida viking. A porta olha para +z local. */
const CasaCompridaModelo: React.FC<{
    runa?: string; latao?: boolean; fumaca?: boolean; botao?: boolean; escala?: number;
    portaRef?: React.Ref<THREE.Group>;
}> = ({ runa, latao = false, fumaca = true, botao = false, escala = 1, portaRef }) => {
    const tex = useMemo(() => (runa ? texturaRuna(runa) : null), [runa]);
    // a casca (paredes de tábuas, vigas, telhado de turfa, empenas com
    // dragões, batente entalhado) é o modelo do Blender: tools/blender/f13_casa.py
    const { scene } = useGLTF(casaGlb);
    const casca = useMemo(() => {
        const c = scene.clone();
        c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        return c;
    }, [scene]);
    const raiz = useRef<THREE.Group>(null);
    useFundir(raiz);
    return <group ref={raiz} scale={escala}>
        <primitive object={casca} />
        {/* chaminé */}
        <mesh position={[.9, 3.2, -1.2]}><boxGeometry args={[.45, .8, .45]} /><meshStandardMaterial color={P13.pedra} flatShading /></mesh>
        {fumaca && <group position={[.9, 0, -1.2]}><Fumaca y={3.7} /></group>}
        {/* chaminé fria: fuligem azulada e pingentes de gelo — lê de longe pelo contraste */}
        {!fumaca && <group position={[.9, 3.6, -1.2]}>
            <mesh><boxGeometry args={[.5, .08, .5]} /><meshStandardMaterial color="#b8d4e8" roughness={.3} /></mesh>
            {[-.18, 0, .18].map((x, i) => <mesh key={i} position={[x, -.14 - (i % 2) * .05, .25]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.035, .22 + (i % 2) * .1, 6]} /><meshStandardMaterial color="#dff0ff" roughness={.1} transparent opacity={.85} /></mesh>)}
        </group>}
        {/* a porta */}
        <group ref={portaRef} position={[0, .8, 2.82]} userData={{ vivo: !!portaRef }}>
            {latao
                // latão em duas folhas, como porta de elevador (a casa certa as abre)
                ? [-1, 1].map((l) => <mesh key={l} name="folha" userData={{ lado: l }} position={[l * .2625, 0, 0]}>
                    <boxGeometry args={[.52, 1.6, .1]} />
                    <meshPhysicalMaterial color={P13.latao} metalness={1} roughness={.35} roughnessMap={texturaEscovada()} clearcoat={.8} clearcoatRoughness={.15} envMapIntensity={1.6} />
                </mesh>)
                : <mesh><boxGeometry args={[1.05, 1.6, .1]} /><meshStandardMaterial color={P13.carvalho} roughness={.8} /></mesh>}
            {latao && !fumaca && botao && <pointLight position={[0, .2, .6]} color="#ffcf8a" intensity={0} distance={5} name="luzDeDentro" />}
            {latao && <mesh position={[0, 0, -.01]}><planeGeometry args={[1, 1.55]} /><meshBasicMaterial map={texturaDeCabine()} color={new THREE.Color('#ffffff').multiplyScalar(1.4)} toneMapped={false} /></mesh>}
            {!latao && [-.3, 0, .3].map((x) => (
                <mesh key={x} position={[x, 0, .06]}><boxGeometry args={[.04, 1.5, .02]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            ))}
            {!latao && <mesh position={[.34, 0, .08]}><torusGeometry args={[.08, .02, 6, 14]} /><meshStandardMaterial color="#2a2a2a" metalness={.6} /></mesh>}
        </group>
        {botao && <mesh position={[.85, 1.05, 2.84]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[.07, .07, .05, 14]} /><meshStandardMaterial color="#ffd79a" emissive="#ffb347" emissiveIntensity={1.4} />
        </mesh>}
        {tex && <mesh position={[0, 2.35, 2.88]}><planeGeometry args={[.5, .5]} /><meshStandardMaterial map={tex} /></mesh>}
        {/* escudos pendurados na lateral */}
        {[-1.6, 0, 1.6].map((z, i) => (
            <mesh key={z} position={[1.98, 1.1, z]} rotation={[0, Math.PI / 2, 0]}>
                <cylinderGeometry args={[.38, .38, .06, 16]} /><meshStandardMaterial color={P13.escudo[i % 4]} />
            </mesh>
        ))}
    </group>;
};

/** Barco viking que navega o céu. A proa aponta para +z local. */
/** A casa só aparece quando o modelo carrega (sem travar o resto da cena). */
export const CasaComprida: React.FC<React.ComponentProps<typeof CasaCompridaModelo>> = (p) =>
    <React.Suspense fallback={null}><CasaCompridaModelo {...p} /></React.Suspense>;

/**
 * Casco de drakkar: seções em U ao longo do comprimento, afinando para as
 * pontas e subindo nelas (a linha de borda curva dos barcos vikings), com
 * UV corrido para as tábuas acompanharem o casco.
 */
function geoCasco(L = 8, W = 1.25, D = .9): THREE.BufferGeometry {
    const N = 28, M = 12, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N, u = t * 2 - 1;
        const w = W * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), .55);
        const topo = .35 + 1.1 * Math.pow(Math.abs(u), 5);
        const fundo = topo - D * (1 - .55 * u * u) - (1 - Math.abs(u)) * .05;
        for (let k = 0; k <= M; k++) {
            const s = k / M * 2 - 1;
            const y = topo - (topo - fundo) * Math.pow(1 - s * s, .6);
            pos.push(w * s, y, u * L / 2);
            uv.push(t * 5, k / M * 2);
        }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
        const a = i * (M + 1) + k, b = a + M + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}
/** Pescoço e cabeça de dragão da proa: um tubo que sobe e se curva. */
function geoDragao(): THREE.BufferGeometry {
    const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.35, 3.95), new THREE.Vector3(0, 2.1, 4.35), new THREE.Vector3(0, 2.75, 4.2), new THREE.Vector3(0, 2.95, 4.75),
    ]);
    return new THREE.TubeGeometry(c, 24, .13, 10, false);
}

export const Barco: React.FC<{ vela?: string; escala?: number }> = ({ vela = P13.vela1, escala = 1 }) => {
    const velaTex = useMemo(() => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d')!;
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? P13.vela2 : vela; g.fillRect(i * 16, 0, 16, 128); }
        // pano gasto: manchas e a borda mais escura
        for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(60,40,20,${Math.random() * .06})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }, [vela]);
    const casco = useMemo(() => geoCasco(), []);
    const dragao = useMemo(() => geoDragao(), []);
    const vela3d = useMemo(() => {
        // vela estufada pelo vento
        const g = new THREE.PlaneGeometry(3.6, 2.6, 12, 8);
        const p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 1.8, y = p.getY(i) / 1.3; p.setZ(i, (1 - x * x) * (1 - y * y * .6) * .55); }
        g.computeVertexNormals(); return g;
    }, []);
    const raiz = useRef<THREE.Group>(null);
    useFundir(raiz);
    return <group ref={raiz} scale={escala}>
        <mesh geometry={casco} castShadow><meshStandardMaterial {...pbr('carvalho', 1, 1)} color="#b89070" side={THREE.DoubleSide} /></mesh>
        {/* amurada: a faixa de tábua escura no topo do casco */}
        <mesh geometry={dragao} castShadow><meshStandardMaterial {...pbr('carvalho', .5, 2)} color="#8a6448" /></mesh>
        <mesh position={[0, 3.05, 4.85]} rotation={[.5, 0, 0]}><coneGeometry args={[.16, .5, 10]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
        <mesh position={[0, 1.45, -4.05]} rotation={[-.3, 0, 0]}><coneGeometry args={[.1, 1.1, 8]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
        <mesh position={[0, 2.3, 0]}><cylinderGeometry args={[.07, .1, 4.4, 10]} /><meshStandardMaterial {...pbr('carvalho', .3, 2)} /></mesh>
        <mesh position={[0, 4.35, .05]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.05, .05, 3.8, 8]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        <mesh geometry={vela3d} position={[0, 3.05, .1]} castShadow><meshStandardMaterial map={velaTex} side={THREE.DoubleSide} roughness={.9} /></mesh>
        {[-1, 1].map((lado) => [-2.6, -1.6, -.6, .4, 1.4, 2.4].map((z, i) => (
            <group key={`${lado}${z}`} position={[lado * 1.2, .42, z]} rotation={[0, 0, lado * Math.PI / 2]}>
                <mesh><cylinderGeometry args={[.36, .36, .05, 20]} /><meshStandardMaterial color={P13.escudo[(i + (lado > 0 ? 1 : 0)) % 4]} roughness={.7} /></mesh>
                <mesh position={[0, lado * .04, 0]}><sphereGeometry args={[.08, 10, 8]} /><meshStandardMaterial color="#9aa0a8" metalness={.85} roughness={.35} /></mesh>
            </group>
        )))}
        {/* remos */}
        {[-1, 1].map((lado) => [-2.1, -1.1, -.1, .9, 1.9].map((z) => (
            <mesh key={`r${lado}${z}`} position={[lado * 1.75, .05, z]} rotation={[0, 0, lado * 1.05]}>
                <cylinderGeometry args={[.035, .035, 2, 6]} /><meshStandardMaterial color={P13.tabua} />
            </mesh>
        )))}
    </group>;
};

/** Barcos em volta da cidade, em órbitas lentas e alturas diferentes. */
const Frota: React.FC = () => {
    const rotas = useMemo(() => [
        { r: 48, y: 8, v: .05, f: 0, vela: P13.vela1, e: 1 },
        { r: 62, y: -2, v: -.035, f: 2, vela: '#2f5d62', e: 1.3 },
        { r: 38, y: 16, v: .07, f: 4, vela: '#c9a13a', e: .8 },
        { r: 80, y: 22, v: -.025, f: 1, vela: P13.vela1, e: 1.6 },
    ], []);
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        rotas.forEach((r, i) => {
            const g = refs.current[i]; if (!g) return;
            const a = r.f + t * r.v;
            g.position.set(Math.cos(a) * r.r, r.y + Math.sin(t * .7 + i) * .6, Math.sin(a) * r.r);
            g.rotation.set(Math.sin(t * .5 + i) * .04, -a + (r.v > 0 ? Math.PI : 0), Math.sin(t * .8 + i) * .05);
        });
    });
    return <>{rotas.map((r, i) => <group key={i} ref={(g) => { refs.current[i] = g; }} userData={{ vivo: true }}><Barco vela={r.vela} escala={r.e} /></group>)}</>;
};

/** O templo do sino, na ilha do leste. */
export const Templo: React.FC<{ sinoRef?: React.Ref<THREE.Group> }> = ({ sinoRef }) => {
    const ilha = ILHAS.find((i) => i.id === 'templo')!;
    return <group position={[SINO.x, ilha.y, SINO.z]}>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x * .9, 2, z * .9]}><boxGeometry args={[.25, 4, .25]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        ))}
        <mesh position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[1.7, 1.4, 4]} /><meshStandardMaterial color={P13.telhado} flatShading /></mesh>
        <group ref={sinoRef} position={[0, 3.6, 0]} userData={{ vivo: true }}>
            <mesh position={[0, -.45, 0]}><cylinderGeometry args={[.25, .55, .8, 20, 1, true]} /><meshStandardMaterial color={P13.latao} metalness={.85} roughness={.3} side={THREE.DoubleSide} /></mesh>
        </group>
    </group>;
};

/** A forja: bigorna, fogo e um telheiro. */
const Forja: React.FC = () => {
    const ilha = ILHAS.find((i) => i.id === 'forja')!;
    const fogo = useRef<THREE.PointLight>(null);
    useFrame(({ clock }) => { if (fogo.current) fogo.current.intensity = 6 + Math.sin(clock.elapsedTime * 13) * 1.5 + Math.sin(clock.elapsedTime * 7) * 1; });
    return <group position={[ilha.x, ilha.y, ilha.z - 1.5]}>
        <mesh position={[0, .5, 0]}><boxGeometry args={[1.6, 1, 1.2]} /><meshStandardMaterial color={P13.pedra} flatShading /></mesh>
        <mesh position={[0, 1.05, 0]}><boxGeometry args={[1.1, .12, .8]} /><meshBasicMaterial color={new THREE.Color('#ff7a2a').multiplyScalar(2)} toneMapped={false} /></mesh>
        <pointLight ref={fogo} position={[0, 1.5, 0]} color="#ff8a3a" distance={9} intensity={6} />
        <mesh position={[1.8, .45, .8]}><boxGeometry args={[.6, .5, .3]} /><meshStandardMaterial color="#3a3a3e" metalness={.7} roughness={.4} /></mesh>
        {[[-1.4, -1], [1.4, -1], [-1.4, 1.6], [1.4, 1.6]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 1.4, z]}><boxGeometry args={[.18, 2.8, .18]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        ))}
        <mesh position={[0, 2.9, .3]} rotation={[.12, 0, 0]}><boxGeometry args={[3.4, .15, 3.2]} /><meshStandardMaterial color={P13.turfa} /></mesh>
    </group>;
};

/** Lona listrada do toldo: a cor da barraca alternando com linho cru. */
const toldos = new Map<string, THREE.CanvasTexture>();
function texturaDeToldo(cor: string): THREE.CanvasTexture {
    let t = toldos.get(cor);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8dcc0' : cor; g.fillRect(i * 16, 0, 16, 32); }
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(50,35,20,${Math.random() * .08})`; g.fillRect(Math.random() * 128, Math.random() * 32, 2, 2); }
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; toldos.set(cor, t);
    return t;
}

/** Praça do mercado: barracas com toldo listrado e uma pedra rúnica. */
const Praca: React.FC = () => {
    const barracas = [[-6, 12, .4], [-3.2, 14, .1], [6, 11, -.4]];
    return <group>
        {barracas.map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
                <mesh position={[0, .45, 0]}><boxGeometry args={[1.8, .9, .9]} /><meshStandardMaterial {...pbr('tabua', 1, .5)} color="#b58a5e" /></mesh>
                {/* quatro mourões: os de trás mais altos, o toldo desce para a frente
                    apoiado nos quatro (antes só dois o seguravam e a borda da
                    frente, subindo no ar, lia como uma vara vermelha solta) */}
                {[[-.84, -.4, 2.3], [.84, -.4, 2.3], [-.84, .5, 1.92], [.84, .5, 1.92]].map(([dx, dz, h]) => <mesh key={`${dx}${dz}`} position={[dx, h / 2, dz]}><boxGeometry args={[.08, h, .08]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
                <mesh position={[0, 2.13, .05]} rotation={[.33, 0, 0]}><boxGeometry args={[1.92, .03, 1.22]} /><meshStandardMaterial map={texturaDeToldo(P13.escudo[i % 3])} roughness={.95} /></mesh>
                {/* a sanefa: pano listrado caindo na frente do toldo */}
                <mesh position={[0, 1.8, .64]}><boxGeometry args={[1.92, .22, .02]} /><meshStandardMaterial map={texturaDeToldo(P13.escudo[i % 3])} roughness={.95} /></mesh>
                {[-.5, 0, .5].map((dx, k) => <mesh key={dx} position={[dx, 1, .1]}><sphereGeometry args={[.13, 10, 8]} /><meshStandardMaterial color={['#c9442e', '#e0b155', '#6f9a4a'][k]} roughness={.55} /></mesh>)}
            </group>
        ))}
        <mesh position={[4.2, 1.2, 1.5]} rotation={[0, .3, 0]}><boxGeometry args={[.9, 2.4, .4]} /><meshStandardMaterial color="#8a8478" flatShading /></mesh>
        <mesh position={[0, .25, 8]}><cylinderGeometry args={[1.2, 1.3, .5, 20]} /><meshStandardMaterial color={P13.pedra} flatShading /></mesh>
        <mesh position={[0, .52, 8]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1, 20]} /><meshStandardMaterial color="#3d6b8a" metalness={.3} roughness={.2} /></mesh>
    </group>;
};

/** Carroça de feno na ilha do pouso — onde o avião cai. */
export const Carroca: React.FC = () => (
    <group position={[-2, 0, 33]} rotation={[0, .4, 0]}>
        <mesh position={[0, .55, 0]}><boxGeometry args={[2.2, .5, 1.4]} /><meshStandardMaterial color={P13.tabua} /></mesh>
        <mesh position={[0, 1.15, 0]} scale={[1.2, .6, .8]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color="#d9b85a" roughness={1} flatShading /></mesh>
        {[-.8, .8].map((x) => [-.75, .75].map((z) => (
            <mesh key={`${x}${z}`} position={[x, .3, z]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.3, .06, 6, 14]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        )))}
    </group>
);

/**
 * Vida entre os pontos de interesse: pedras, tufos de grama que balançam no
 * vento, barris e flores, espalhados perto da borda de cada ilha (o miolo fica
 * livre para caminhar). Tudo instanciado: quatro chamadas de desenho.
 */
const Decoracao: React.FC = () => {
    const itens = useMemo(() => {
        let k = 11;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        const l: { tipo: number; x: number; y: number; z: number; s: number; r: number }[] = [];
        for (const il of ILHAS) {
            const n = Math.round(il.r * 5);
            for (let i = 0; i < n; i++) {
                const a = rnd() * Math.PI * 2, d = il.r * (.72 + rnd() * .24);
                l.push({ tipo: i % 7 === 0 ? 2 : i % 3 === 0 ? 0 : i % 5 === 0 ? 3 : 1, x: il.x + Math.cos(a) * d, y: il.y, z: il.z + Math.sin(a) * d, s: .6 + rnd() * .8, r: rnd() * 6 });
            }
        }
        return l;
    }, []);
    const geos = useMemo(() => [
        new THREE.DodecahedronGeometry(.35, 0),
        (() => { const g = new THREE.ConeGeometry(.12, .5, 4); g.translate(0, .25, 0); return g; })(),
        (() => { const g = new THREE.CylinderGeometry(.28, .28, .6, 10); g.translate(0, .3, 0); return g; })(),
        new THREE.SphereGeometry(.09, 6, 4),
    ], []);
    const mats = useMemo(() => [
        new THREE.MeshStandardMaterial({ color: P13.pedra, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: P13.gramaEsc }),
        new THREE.MeshStandardMaterial({ color: P13.tabua }),
        new THREE.MeshStandardMaterial({ color: '#e8c8e0', emissive: '#6a3a5a', emissiveIntensity: .2 }),
    ], []);
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const porTipo = useMemo(() => [0, 1, 2, 3].map((t) => itens.filter((i) => i.tipo === t)), [itens]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        porTipo.forEach((lista, tipo) => {
            const m = refs.current[tipo]; if (!m) return;
            lista.forEach((it, i) => {
                tmp.position.set(it.x, it.y + (tipo === 3 ? .12 : 0), it.z);
                tmp.rotation.set(tipo === 1 ? Math.sin(t * 2 + it.r) * .15 : 0, it.r, tipo === 1 ? Math.cos(t * 1.7 + it.r) * .12 : 0);
                tmp.scale.setScalar(it.s);
                tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
            });
            m.instanceMatrix.needsUpdate = true;
        });
    });
    return <>{porTipo.map((lista, tipo) => (
        <instancedMesh key={tipo} ref={(m) => { refs.current[tipo] = m; }} args={[geos[tipo], mats[tipo], lista.length]} frustumCulled={false} />
    ))}</>;
};

/** Pássaros em bando, dando voltas altas sobre a cidade. */
const Passaros: React.FC = () => {
    const g = useRef<THREE.Group>(null);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime, o = g.current; if (!o) return;
        o.position.set(Math.cos(t * .12) * 30, 18 + Math.sin(t * .3) * 2, Math.sin(t * .12) * 30);
        o.rotation.y = -t * .12;
        o.children.forEach((c, i) => { c.rotation.z = Math.sin(t * 9 + i) * .6; });
    });
    return <group ref={g} userData={{ vivo: true }}>
        {[[0, 0], [-1.2, 1], [1.2, 1], [-2.4, 2], [2.4, 2]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0, z]}><boxGeometry args={[.9, .04, .2]} /><meshBasicMaterial color="#2a2622" /></mesh>
        ))}
    </group>;
};

/**
 * Grama de verdade: milhares de lâminas instanciadas por ilha, balançando com
 * o vento num vertex shader (a ponta anda, a base fica). O miolo pisado de
 * cada ilha fica mais ralo.
 */
const tempoGrama = { value: 0 };
/** Até onde a grama é desenhada (m); o Floor13 encurta nos níveis baixos. */
export const alcanceDaGrama = { valor: 40 };
const Grama: React.FC = () => {
    // campo de lâminas: cada lâmina é uma fita afinada e curvada (5 gomos),
    // instanciada às dezenas de milhares. A cor vai da raiz sombria à ponta
    // dourada, cada touceira puxa um verde diferente, e o vento chega em
    // rajadas que atravessam a ilha — não um balanço uniforme.
    const { geo, mat, mats, tons } = useMemo(() => {
        const G = 4, A = .3, L = .05;
        const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
        for (let i = 0; i <= G; i++) {
            const t = i / G, w = L * (1 - t * t * .92), curva = t * t * .18;
            pos.push(-w / 2, t * A, curva, w / 2, t * A, curva);
            uvs.push(0, t, 1, t);
            if (i < G) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .7, color: '#ffffff' });
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uT = tempoGrama;
            sh.vertexShader = 'uniform float uT;\nattribute vec3 aTom;\nvarying vec3 vTom;\nvarying float vAlt;\n' + sh.vertexShader
                .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(0., 1., .6));')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.);
                float k = uv.y;
                float rajada = sin(wp.x * .18 + uT * 1.3) * .5 + .5;
                rajada = rajada * rajada;
                float balanco = sin(uT * 2.6 + wp.x * 1.3 + wp.z * .9) * .08 + rajada * .32;
                transformed.z += balanco * k * k;
                transformed.y -= balanco * balanco * k * k * .35;
                vTom = aTom; vAlt = k;`);
            sh.fragmentShader = 'varying vec3 vTom;\nvarying float vAlt;\n' + sh.fragmentShader
                .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize((viewMatrix * vec4(0., 1., .25, 0.)).xyz);')
                .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 raiz = vec3(.11, .19, .06), meio = vTom, ponta = mix(vTom, vec3(.78, .8, .38), .3);
                diffuseColor.rgb = vAlt < .5 ? mix(raiz, meio, smoothstep(0., .5, vAlt)) : mix(meio, ponta, smoothstep(.5, 1., vAlt));`)
                // translucidez: a lâmina contra o sol brilha por dentro
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                totalEmissiveRadiance += vTom * .05 * vAlt;`);
        };
        let k = 23;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        const ms: THREE.Matrix4[] = [];
        const cores: number[] = [];
        const o = new THREE.Object3D();
        const c = new THREE.Color();
        for (const il of ILHAS) {
            // em touceiras: um centro sorteado e ~14 lâminas em volta dele
            const touceiras = Math.round(il.r * il.r * 6.5);
            for (let t = 0; t < touceiras; t++) {
                const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * il.r * .97;
                if (d < il.r * .26 && rnd() < .6) continue;
                const cx = il.x + Math.cos(a) * d, cz = il.z + Math.sin(a) * d;
                c.setHSL(.24 + (rnd() - .5) * .07, .55 + rnd() * .2, .17 + rnd() * .08);
                const alta = .7 + rnd() * .8;
                for (let l = 0; l < 11; l++) {
                    const ra = rnd() * Math.PI * 2, rd = Math.sqrt(rnd()) * .35;
                    const x = cx + Math.cos(ra) * rd, z = cz + Math.sin(ra) * rd;
                    if (Math.hypot(x - il.x, z - il.z) > il.r * .985) continue;
                    o.position.set(x, il.y, z);
                    o.rotation.set((rnd() - .5) * .35, rnd() * Math.PI * 2, (rnd() - .5) * .35);
                    const e = alta * (.6 + rnd() * .6);
                    o.scale.set(1 + rnd() * .5, e, 1);
                    o.updateMatrix(); ms.push(o.matrix.clone());
                    cores.push(c.r * (.85 + rnd() * .3), c.g * (.85 + rnd() * .3), c.b);
                }
            }
        }
        return { geo: g, mat: m, mats: ms, tons: new Float32Array(cores) };
    }, []);
    // em blocos de 9 m: cada bloco é um InstancedMesh com a própria esfera
    // envolvente, então o que está fora da tela nem vai para a GPU, e o que
    // está longe (onde uma lâmina tem menos de um pixel) some
    const blocos = useMemo(() => {
        const porBloco = new Map<string, number[]>();
        const p = new THREE.Vector3();
        mats.forEach((m, i) => {
            p.setFromMatrixPosition(m);
            const k = `${Math.floor(p.x / 9)}:${Math.floor(p.z / 9)}`;
            let l = porBloco.get(k); if (!l) porBloco.set(k, l = []); l.push(i);
        });
        return [...porBloco.values()].map((ids) => {
            const g = geo.clone();
            const im = new THREE.InstancedMesh(g, mat, ids.length);
            const cor = new Float32Array(ids.length * 3);
            ids.forEach((id, i) => { im.setMatrixAt(i, mats[id]); cor.set(tons.subarray(id * 3, id * 3 + 3), i * 3); });
            g.setAttribute('aTom', new THREE.InstancedBufferAttribute(cor, 3));
            im.instanceMatrix.needsUpdate = true;
            im.computeBoundingSphere();
            im.receiveShadow = true;
            return im;
        });
    }, [geo, mat, mats, tons]);
    const centro = useMemo(() => new THREE.Vector3(), []);
    useFrame(({ clock, camera }) => {
        tempoGrama.value = clock.elapsedTime;
        for (const b of blocos) {
            centro.copy(b.boundingSphere!.center);
            b.visible = centro.distanceTo(camera.position) < alcanceDaGrama.valor + b.boundingSphere!.radius;
        }
    });
    return <>{blocos.map((b, i) => <primitive key={i} object={b} />)}</>;
};
/** Tochas nas bordas dos caminhos: chama em sprite, luz que tremula. */
const Tochas: React.FC = () => {
    const lugares = useMemo(() => [
        [3.5, 0, 17], [-3.5, 0, 17], [3, 0, -.5], [-3, 0, -.5], [3.6, 3, -12.3], [-3.6, 3, -12.3],
        [-15, 1, 6.5], [16, 2, 5], [-5, 3, -30],
    ] as const, []);
    const luzes = useRef<(THREE.PointLight | null)[]>([]);
    const chamas = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        lugares.forEach((_, i) => {
            const f = .75 + Math.sin(t * 11 + i * 3) * .15 + Math.sin(t * 23 + i) * .1;
            if (luzes.current[i]) luzes.current[i]!.intensity = 2.2 * f;
            if (chamas.current[i]) chamas.current[i]!.scale.set(1, f * 1.2, 1);
        });
    });
    return <>{lugares.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
            <mesh position={[0, .8, 0]}><cylinderGeometry args={[.05, .07, 1.6, 6]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            <mesh position={[0, 1.62, 0]}><cylinderGeometry args={[.1, .07, .14, 8]} /><meshStandardMaterial color="#3a3a3e" metalness={.6} roughness={.5} /></mesh>
            <mesh ref={(m) => { chamas.current[i] = m; }} position={[0, 1.82, 0]} userData={{ vivo: true }}><coneGeometry args={[.09, .3, 8]} /><meshBasicMaterial color={new THREE.Color('#ffae45').multiplyScalar(2.2)} toneMapped={false} /></mesh>
            {/* duas tochas acesas de verdade bastam: cada luz a mais pesa em todo shader */}
            {(i === 0 || i === 3) && <pointLight ref={(l) => { luzes.current[i] = l; }} position={[0, 1.9, 0]} color="#ff9a45" distance={6} intensity={2} />}
        </group>
    ))}</>;
};

export const Floor13Mundo: React.FC<{
    portaCertaRef?: React.Ref<THREE.Group>;
    sinoRef?: React.Ref<THREE.Group>;
}> = ({ portaCertaRef, sinoRef }) => {
    const pontes = useMemo(() => PONTES.map((p) => {
        const a = ILHAS.find((i) => i.id === p.de)!, b = ILHAS.find((i) => i.id === p.para)!;
        const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
        return {
            a: new THREE.Vector3(a.x + dir.x * (a.r - .4), a.y, a.z + dir.z * (a.r - .4)),
            b: new THREE.Vector3(b.x - dir.x * (b.r - .4), b.y, b.z - dir.z * (b.r - .4)),
            largura: p.largura,
        };
    }), []);
    const raiz = useRef<THREE.Group>(null);
    useFundir(raiz, 18);
    return <group ref={raiz}>
        <Ceu />
        <Nuvens />
        <Frota />
        <Decoracao />
        <Grama />
        <Tochas />
        <Passaros />
        {ILHAS.map((i, k) => <IlhaVisual key={i.id} {...i} i={k} />)}
        {pontes.map((p, k) => <PonteVisual key={k} {...p} />)}
        {CASAS.map((c, i) => {
            const l = LUGAR_DAS_CASAS[i];
            // cada casa com seu jeito: comprimento, torção e escala próprios
            return <group key={i} position={[l.x, l.y, l.z]} rotation={[0, l.angulo + ((i * 37) % 7 - 3) * .03, 0]} scale={[1 + (i % 3 - 1) * .08, 1 + ((i * 5) % 3 - 1) * .1, 1 + ((i * 3) % 4) * .09]}>
                <CasaComprida runa={c.runa} latao={c.portaDeLatao} fumaca={c.fumaca} botao={c.botao}
                    portaRef={i === CASA_CERTA ? portaCertaRef : undefined} />
            </group>;
        })}
        {/* duas casas de moradores na praça, só de cenário */}
        <group position={[-7.5, 0, 4]} rotation={[0, 1.1, 0]}><CasaComprida escala={.9} /></group>
        <group position={[7.8, 0, 12.5]} rotation={[0, -2.2, 0]}><CasaComprida escala={.9} /></group>
        <Praca />
        <Forja />
        <Templo sinoRef={sinoRef} />
        <Carroca />
    </group>;
};
