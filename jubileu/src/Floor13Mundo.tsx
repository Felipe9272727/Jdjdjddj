/**
 * Floor13Mundo.tsx — o que se vê em Vindhjem.
 *
 * Ilhas de pedra com tampo de grama, pontes de tábua e corda, casas compridas
 * vikings com proa de dragão, a forja, o templo do sino, a praça do mercado e,
 * em volta de tudo, barcos navegando o céu. Só desenho: onde se pisa e quem
 * está onde vêm de `f13Mundo.ts`.
 */
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import casaGlb from './assets/f13/casa.glb';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import nuvensAtlas from './assets/f13/nuvens.webp';
import { CASAS, CASA_CERTA } from './f13Lore';
import { FagulhasDaForja } from './f13Fagulhas';
import { BrasasDaFornalha } from './f13Brasas';
import { ILHAS, PONTES, LUGAR_DAS_CASAS, FORMA_DAS_CASAS, SINO, dentroDeCasa, portaNoMundo } from './f13Mundo';
import { pbr } from './f13Texturas';
import { FolhasDaPorta, EnfeitesDaPorta, ESTILO_DA_CASA, type EstiloDePorta } from './Floor13Portas';
import { fundirEstaticos } from './f13Fundir';
import { BANCO } from './f13Arni';
import { Viking } from './Floor13Povo';
import { NPCS } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Funde o que está parado debaixo deste grupo depois de montado (ver f13Fundir). */
function useFundir(ref: React.RefObject<THREE.Object3D | null>, celula?: number, versao = 0) {
    useLayoutEffect(() => (ref.current ? fundirEstaticos(ref.current, celula) : undefined), [ref, celula, versao]);
}
/**
 * As casas chegam depois (o GLB carrega em Suspense): cada uma avisa quando
 * montou, e o mundo refunde com elas dentro — as peças de mesmo material das
 * nove casas viram uma malha por quadra, não uma por casa.
 */
const CasaPronta = React.createContext<() => void>(() => {});
const TOTAL_DE_CASAS = 10;

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
    // ar limpo de altitude: pouca turbidez e o halo do sol apertado — o
    // espalhamento largo lavava o alto do céu de branco
    u.turbidity.value = 1.7; u.rayleigh.value = 2.7; u.mieCoefficient.value = .0009; u.mieDirectionalG.value = .93;
    u.sunPosition.value.copy(DIRECAO_DO_SOL);
    // o Preetham sai em radiância física, clara demais para esta cena: um
    // terço, para o céu ficar azul e o horizonte âmbar em vez de branco
    ceu.material.fragmentShader = ceu.material.fragmentShader
        .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * .36, 1.0 );')
        // o disco do sol vem 19000× mais forte que o céu: cegava a tela
        // inteira pelo bloom. Fica um disco quente, visível sem ofuscar
        .replace('vSunE * 19000.0 * Fex', 'vSunE * 900.0 * Fex');
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
                <dodecahedronGeometry args={[.5 + k * .2, 1]} /><meshStandardMaterial color={P13.pedraEsc} {...pbr('rocha', .8, .8)} />
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

/**
 * O que se vê pela porta certa: a cabine do elevador do hotel em perspectiva
 * — a mesma em que o hóspede aparece na saída (Floor13Saida): paredes de
 * madeira almofadadas com corrimão de latão, piso creme com o losango
 * dourado, teto escuro com a luminária e, no fundo, as portas de aço com o
 * mostrador.
 */
let texCabine: THREE.CanvasTexture | null = null;
function texturaDeCabine(): THREE.CanvasTexture {
    if (texCabine) return texCabine;
    const W = 128, H = 200, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const f = { x: 38, y: 46, w: 52, h: 96 };                     // a parede do fundo
    const quad = (pts: number[][], cor: string | CanvasGradient) => { g.fillStyle = cor; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    // paredes laterais de madeira (mais escuras no fundo)
    const madE = g.createLinearGradient(0, 0, f.x, 0); madE.addColorStop(0, '#8a5634'); madE.addColorStop(1, '#5a3620');
    const madD = g.createLinearGradient(W, 0, f.x + f.w, 0); madD.addColorStop(0, '#7a4a2c'); madD.addColorStop(1, '#4e2e1a');
    quad([[0, 0], [f.x, f.y], [f.x, f.y + f.h], [0, H]], madE);
    quad([[W, 0], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [W, H]], madD);
    // almofadas (frisos em perspectiva), rodapé e corrimão de latão
    for (const lado of [0, 1]) {
        const x0 = lado ? W : 0, x1 = lado ? f.x + f.w : f.x;
        for (let k = 1; k < 4; k++) {
            const t = k / 4, x = x0 + (x1 - x0) * t, y0 = f.y * t, y1 = H - (H - f.y - f.h) * t;
            g.strokeStyle = 'rgba(30,16,8,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y0 + 4); g.lineTo(x, y1 - 4); g.stroke();
        }
        const yr = (t: number) => 118 + (f.y + f.h * .58 - 118) * t;
        g.strokeStyle = '#d9ad55'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, yr(0)); g.lineTo(x1, yr(1)); g.stroke();
        g.strokeStyle = '#2c1c12'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, H - 6); g.lineTo(x1, f.y + f.h - 2); g.stroke();
    }
    // teto escuro com a luminária
    quad([[0, 0], [W, 0], [f.x + f.w, f.y], [f.x, f.y]], '#2c1c12');
    const luz = g.createRadialGradient(64, 20, 1, 64, 20, 18); luz.addColorStop(0, '#fff6dc'); luz.addColorStop(.5, '#ffe2a0'); luz.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = luz; g.beginPath(); g.ellipse(64, 20, 20, 8, 0, 0, Math.PI * 2); g.fill();
    // piso creme com o losango dourado
    quad([[0, H], [W, H], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]], '#d6c8ae');
    const cy = 172, cx = 64;
    quad([[cx, cy - 20], [cx + 34, cy], [cx, cy + 20], [cx - 34, cy]], '#c9973a');
    quad([[cx, cy - 16], [cx + 27, cy], [cx, cy + 16], [cx - 27, cy]], '#d6c8ae');
    quad([[cx, cy - 6], [cx + 10, cy], [cx, cy + 6], [cx - 10, cy]], '#c9973a');
    // o fundo: portas de aço fechadas, a fresta, o batente de latão e o mostrador
    const aco = g.createLinearGradient(f.x, 0, f.x + f.w, 0); aco.addColorStop(0, '#7d848b'); aco.addColorStop(.5, '#a9b0b6'); aco.addColorStop(1, '#6f767d');
    g.fillStyle = aco; g.fillRect(f.x, f.y, f.w, f.h);
    g.fillStyle = '#c9973a'; g.fillRect(f.x + 4, f.y + 16, f.w - 8, 2); g.fillRect(f.x + 4, f.y + 16, 2, f.h - 16); g.fillRect(f.x + f.w - 6, f.y + 16, 2, f.h - 16);
    g.fillStyle = '#1c1c1c'; g.fillRect(f.x + f.w / 2 - .5, f.y + 18, 1, f.h - 18);
    g.fillStyle = '#120d0a'; g.fillRect(f.x + 16, f.y + 4, 20, 9);
    g.fillStyle = '#ffc45a'; g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('▲13', f.x + 26, f.y + 9);
    // a botoeira na parede da direita
    g.fillStyle = '#3a3632'; g.fillRect(100, 84, 9, 30);
    for (let k = 0; k < 5; k++) { g.fillStyle = k === 1 ? '#ffe9a8' : '#c9a256'; g.beginPath(); g.arc(104.5, 89 + k * 5.5, 1.7, 0, 7); g.fill(); }
    texCabine = new THREE.CanvasTexture(c); texCabine.colorSpace = THREE.SRGBColorSpace;
    return texCabine;
}

/** Textura com uma runa branca pintada em madeira escura. */
/** Faixa de runas entalhadas numa pedra: fundo transparente, sulco escuro, ocre gasto. */
let texPedraRunica: THREE.CanvasTexture | null = null;
function texturaDePedraRunica(): THREE.CanvasTexture {
    if (texPedraRunica) return texPedraRunica;
    const c = document.createElement('canvas'); c.width = 64; c.height = 200;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(120,70,30,.75)'; g.lineWidth = 3; g.strokeRect(8, 6, 48, 188);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 26px serif';
    'ᚠᚢᚦᚨᚱᚲᚷ'.split('').forEach((r, i) => {
        g.fillStyle = 'rgba(25,18,12,.85)'; g.fillText(r, 32, 22 + i * 26 + 1.5);
        g.fillStyle = 'rgba(170,100,45,.8)'; g.fillText(r, 32, 22 + i * 26);
    });
    texPedraRunica = new THREE.CanvasTexture(c); texPedraRunica.colorSpace = THREE.SRGBColorSpace;
    return texPedraRunica;
}

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
        // borda esfumaçada: some onde a bola fica de lado para a câmera (antes,
        // alfa chapado e borda dura — lia como uma pilha de pratos)
        sh.vertexShader = 'attribute float aAlfa;\nvarying float vAlfa;\nvarying vec3 vNv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlfa = aAlfa;\nvNv = normalize(normalMatrix * normal);');
        sh.fragmentShader = 'varying float vAlfa;\nvarying vec3 vNv;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlfa * pow(clamp(abs(normalize(vNv).z), 0., 1.), 1.8);');
    };
    return m;
})();
const Fumaca: React.FC<{ y: number; fase?: number }> = ({ y, fase = 0 }) => {
    // o mesmo vento para todas, mas cada chaminé no seu ritmo (antes subiam em uníssono)
    const ritmo = .28 + ((fase * 7.31) % 1) * .14, desvio = ((fase * 3.17) % 1) * 6;
    const N = 14;
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
            const t = (clock.elapsedTime * ritmo + i / N + desvio) % 1;
            o.position.set(Math.sin(t * 5 + i + desvio) * .3 + t * 1.2, y + t * 5, Math.cos(t * 3 + desvio) * .2);
            o.scale.setScalar(.4 + t * 1.5); o.updateMatrix();
            malha.setMatrixAt(i, o.matrix); alfa.setX(i, .6 * Math.min(1, t * 6) * (1 - t));
        }
        malha.instanceMatrix.needsUpdate = true; alfa.needsUpdate = true;
    });
    useEffect(() => () => malha.geometry.dispose(), [malha]);
    return <primitive object={malha} />;
};

/** Casa comprida viking. A porta olha para +z local. */
/** Quando cada casa foi batida e quando a conversa acabou (performance.now); o Floor13 marca, a casa atende. */
export const batidasNasCasas: Record<number, number> = {};
export const conversaAcabou: Record<number, number> = {};
/** 0 fechada … 1 aberta: abre em 0,6 s e fica aberta enquanto o morador fala; fecha em 0,8 s depois. */
function aberturaDaPorta(i: number): number {
    const t0 = batidasNasCasas[i]; if (t0 === undefined) return 0;
    const agora = performance.now(), t = (agora - t0) / 1000;
    const abre = THREE.MathUtils.smoothstep(t, .5, 1.1);
    const fim = conversaAcabou[i];
    if (fim === undefined || fim < t0) return abre;
    return abre * (1 - THREE.MathUtils.smoothstep((agora - fim) / 1000, .4, 1.2));
}
/** Quem atende em cada casa: um corpo do elenco com a roupa da casa (a casa vazia, ᚷ, não tem ninguém). */
const MORADOR: ReadonlyArray<(typeof NPCS)[number] | null> = (() => {
    const de = (id: string, tunica: string) => { const n = NPCS.find((k) => k.id === id)!; return { ...n, tunica, id: n.id }; };
    return [de('torvald', '#6b5a3a'), de('ulfgar', '#4a5a6e'), de('ragnhild', '#5a4a5e'), null, de('brokk', '#7a4a2e'), de('sigrun', '#2a2622'), null];
})();
/**
 * As duas luzes da porta que atende: uma de dentro (lareira ou luz fria) e uma
 * de preenchimento na soleira. Sempre na cena, com intensidade 0 quando não há
 * porta aberta — uma luz que entra ou sai da cena muda o número de luzes e
 * recompila todos os shaders (a tela congelava quando o vizinho abria).
 */
const LuzesDaPorta: React.FC = () => {
    const dentro = useRef<THREE.PointLight>(null), frente = useRef<THREE.PointLight>(null);
    useFrame(({ clock }) => {
        let melhor = -1, t0 = -Infinity;
        for (const k in batidasNasCasas) if (batidasNasCasas[k] > t0) { t0 = batidasNasCasas[k]; melhor = +k; }
        const a = melhor >= 0 ? aberturaDaPorta(melhor) : 0;
        if (dentro.current) dentro.current.intensity = 0;
        if (frente.current) frente.current.intensity = 0;
        if (a <= .01 || !dentro.current || !frente.current) return;
        const p = portaNoMundo(melhor), l = LUGAR_DAS_CASAS[melhor], fria = !CASAS[melhor].fumaca;
        dentro.current.position.set(p.x - p.fx * .9, l.y + .9, p.z - p.fz * .9);
        frente.current.position.set(p.x + p.fx * .9, l.y + 1.55, p.z + p.fz * .9);
        dentro.current.color.set(fria ? '#9ab4d8' : '#ffb060');
        dentro.current.intensity = a * (fria ? 1.2 : 6 + Math.sin(clock.elapsedTime * 11) * .9);
        frente.current.intensity = a * 1.8;
    });
    return <><pointLight ref={dentro} distance={4} intensity={0} /><pointLight ref={frente} color="#ffe2c0" distance={3} intensity={0} /></>;
};
const MAT_VULTO = new THREE.MeshStandardMaterial({ color: '#2a1d16', roughness: .9 });
/** O vão aceso e o morador parado nele, só enquanto a porta está aberta. */
const Atende: React.FC<{ indice: number; fria: boolean }> = ({ indice, fria }) => {
    const estadoMorador = useRef<EstadoVisualNpc>({ olharPara: null, falando: true, possessao: 0, caido: false });
    const g = useRef<THREE.Group>(null), vao = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
        const a = aberturaDaPorta(indice);
        // escala 0 e não 'invisível': assim entra na pré-compilação dos shaders
        if (g.current) g.current.scale.setScalar(a > .01 ? 1 : 1e-4);
        if (vao.current) { if (fria) vao.current.color.setRGB(.012 * a, .016 * a, .024 * a); else vao.current.color.setRGB(.75 * a, .32 * a, .1 * a); }
    });
    return <group ref={g} position={[0, .8, 2.7]} scale={1e-4} userData={{ vivo: true }}>
        {/* o fundo do vestíbulo: o brilho da lareira na parede (ou nada, na casa fria) */}
        <mesh position={[0, .05, -1.13]}><planeGeometry args={[1.4, 1.7]} /><meshBasicMaterial ref={vao} color="#000000" toneMapped={false} /></mesh>
        {/* quem mora: gente de verdade (o mesmo elenco da vila, com a roupa da casa), de frente para a porta, falando */}
        {/* o que se vê lá dentro: um banco, uma mesa com a vela, e a lareira no fundo (apagada na casa fria) */}
        <mesh position={[-.45, -.55, -.75]}><boxGeometry args={[.5, .45, .3]} /><meshStandardMaterial color="#4a3222" roughness={.9} /></mesh>
        <mesh position={[.42, -.42, -.85]}><boxGeometry args={[.4, .06, .4]} /><meshStandardMaterial color="#5a3d26" roughness={.8} /></mesh>
        {!fria && <mesh position={[.42, -.33, -.85]}><cylinderGeometry args={[.02, .02, .12, 8]} /><meshBasicMaterial color={new THREE.Color('#ffd28a').multiplyScalar(2)} toneMapped={false} /></mesh>}
        <mesh position={[0, -.45, -1.1]}><boxGeometry args={[.7, .5, .06]} /><meshStandardMaterial color={fria ? '#2a2a2e' : '#6a5a50'} roughness={.95} /></mesh>
        {MORADOR[indice] && <Viking ficha={MORADOR[indice]!} x={.12} y={-.8} z={-.12} estado={estadoMorador} semRecorte escalaExtra={.7} />}
        {/* as luzes da porta que atende são duas só, compartilhadas (LuzesDaPorta) */}
    </group>;
};
/** Altura da cumeeira no modelo (tools/blender/f13_casa.py: parede 1,9 + 1,65 de telhado). */
const CUMEEIRA_Y = 3.55;
/** Forro escuro por dentro das casas (fecha as frestas entre as tábuas). */
const FORRO = new THREE.MeshStandardMaterial({ color: '#1c140e', roughness: 1, side: THREE.DoubleSide });
/** A parede da frente por dentro, com o vão da porta (1,05 × 1,6 m a 0 do chão da casa). */
const FRENTE_COM_VAO = (() => {
    const f = new THREE.Shape(); f.moveTo(-1.57, 0); f.lineTo(1.57, 0); f.lineTo(1.57, 2.1); f.lineTo(-1.57, 2.1); f.closePath();
    const v = new THREE.Path(); v.moveTo(-.54, 0); v.lineTo(-.54, 1.62); v.lineTo(.54, 1.62); v.lineTo(.54, 0); v.closePath(); f.holes.push(v);
    return new THREE.ShapeGeometry(f);
})();
/** A empena por dentro: triângulo sob a cumeeira, na frente e no fundo. */
const EMPENA = (() => { const f = new THREE.Shape(); f.moveTo(-1.55, 0); f.lineTo(1.55, 0); f.lineTo(0, 1.25); f.closePath(); return new THREE.ShapeGeometry(f); })();
const CasaCompridaModelo: React.FC<{
    runa?: string; latao?: boolean; fumaca?: boolean; botao?: boolean; escala?: number;
    portaRef?: React.Ref<THREE.Group>;
    /** A porta de cada casa (Floor13Portas); as de cenário são tábuas simples. */
    estilo?: EstiloDePorta;
    /** índice em CASAS: a casa pode atender quando batem */
    indice?: number;
}> = ({ runa, fumaca = true, botao = false, escala = 1, portaRef, estilo = 'simples', indice }) => {
    const dobradica = useRef<THREE.Group>(null);
    useFrame(() => { if (dobradica.current && indice !== undefined) dobradica.current.rotation.y = -1.15 * aberturaDaPorta(indice); });
    const tex = useMemo(() => (runa ? texturaRuna(runa) : null), [runa]);
    // a casca (paredes de tábuas, vigas, telhado de turfa, empenas com
    // dragões, batente entalhado) é o modelo do Blender: tools/blender/f13_casa.py
    const { scene } = useGLTF(casaGlb);
    const casca = useMemo(() => {
        const c = scene.clone();
        // sem nome: ninguém procura as peças da casca, e a fusão só junta malhas anônimas
        c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.name = ''; } });
        return c;
    }, [scene]);
    const raiz = useRef<THREE.Group>(null);
    useFundir(raiz);
    const pronta = useContext(CasaPronta);
    useEffect(() => { pronta(); }, [pronta]);
    return <group ref={raiz} scale={escala}>
        <primitive object={casca} />
        {/* o forro por dentro: as tábuas do modelo têm fresta entre si, e o
            céu atrás da casa aparecia em riscos brancos pelas paredes e pela
            empena. Na casa do elevador a porta abre para a cabine: sem forro. */}
        {estilo !== 'elevador' && <group>
            {/* o forro vai até 1,1 m antes da frente: ali fica o vestíbulo que
                se vê quando a porta abre (piso, paredes, teto), e a parede da
                frente é forrada com o vão da porta aberto */}
            <mesh position={[0, 1.15, -.55]} material={FORRO}><boxGeometry args={[3.15, 1.9, 4.2]} /></mesh>
            <mesh position={[0, 0, 2.66]} material={FORRO} geometry={FRENTE_COM_VAO} />
            <mesh position={[0, .02, 2.1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.5, 1.1]} /><meshStandardMaterial color="#5a4030" {...pbr('tabua', .8, .6)} /></mesh>
            {[-1, 1].map((l) => <mesh key={l} position={[l * .75, 1.1, 2.1]} rotation={[0, -l * Math.PI / 2, 0]}><planeGeometry args={[1.1, 1.8]} /><meshStandardMaterial color="#6b4a33" {...pbr('tabua', .6, .8)} /></mesh>)}
            <mesh position={[0, 2.0, 2.1]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[1.5, 1.1]} /><meshStandardMaterial color="#3a281c" /></mesh>
            <mesh position={[0, 2.1, 2.65]} rotation={[0, Math.PI, 0]} material={FORRO} geometry={EMPENA} />
            <mesh position={[0, 2.1, -2.65]} material={FORRO} geometry={EMPENA} />
        </group>}
        {/* chaminé */}
        <mesh position={[.9, 3.2, -1.2]}><boxGeometry args={[.45, .8, .45]} /><meshStandardMaterial color="#b0a698" {...pbr('rocha', .5, .8)} /></mesh>
        {fumaca && <group position={[.9, 0, -1.2]}><Fumaca y={3.7} fase={indice ?? 0} /></group>}
        {/* chaminé fria: fuligem azulada e pingentes de gelo — lê de longe pelo contraste */}
        {!fumaca && <group position={[.9, 3.6, -1.2]}>
            <mesh><boxGeometry args={[.5, .08, .5]} /><meshStandardMaterial color="#b8d4e8" roughness={.3} /></mesh>
            {[-.18, 0, .18].map((x, i) => <mesh key={i} position={[x, -.14 - (i % 2) * .05, .25]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.035, .22 + (i % 2) * .1, 6]} /><meshStandardMaterial color="#dff0ff" roughness={.1} transparent opacity={.85} /></mesh>)}
        </group>}
        {/* a porta: cada casa com a sua (Floor13Portas) */}
        {/* quem mora atende: a folha abre na dobradiça, a luz da lareira
            sai pela fresta e um vulto fica no vão enquanto fala */}
        {indice !== undefined && estilo !== 'elevador' && <Atende indice={indice} fria={!fumaca} />}
        <group ref={portaRef} position={[0, .8, 2.82]} userData={{ vivo: !!portaRef || indice !== undefined }}>
            {indice !== undefined && estilo !== 'elevador'
                ? <group ref={dobradica} position={[-.525, 0, 0]}><group position={[.525, 0, 0]}><FolhasDaPorta estilo={estilo} /></group></group>
                : <FolhasDaPorta estilo={estilo} />}
            {estilo === 'elevador' && <>
                <pointLight position={[0, .2, .6]} color="#ffcf8a" intensity={0} distance={5} name="luzDeDentro" />
                {/* fundo escuro atrás da cabine: acima dela se via o avesso das tábuas */}
                <mesh position={[0, .3, -.04]}><planeGeometry args={[1.4, 2.6]} /><meshBasicMaterial color="#1c130b" /></mesh>
                <mesh position={[0, 0, -.01]}><planeGeometry args={[1, 1.55]} /><meshBasicMaterial map={texturaDeCabine()} color={new THREE.Color('#ffffff').multiplyScalar(1.05)} toneMapped={false} /></mesh>
            </>}
        </group>
        {/* a cumeeira: um rolo de turfa sobre a junta das duas águas (via-se o céu pela fresta) */}
        <mesh position={[0, CUMEEIRA_Y, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.17, .17, 6.1, 10]} /><meshStandardMaterial color={P13.turfa} {...pbr('grama', .6, 3)} /></mesh>
        {/* a verga: tábua de cabeceira entre o topo da folha e o lintel entalhado (sobrava uma fresta preta) */}
        <mesh position={[0, 1.66, 2.8]}><boxGeometry args={[1.2, .14, .08]} /><meshStandardMaterial color="#4a3222" {...pbr('carvalho', .4, .15)} /></mesh>
        <EnfeitesDaPorta estilo={estilo} botao={botao} />
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

/** Perfil de sino de bronze: ombro, cintura e a boca que abre em aba. */
const PERFIL_DO_SINO = [[0, 0], [.2, 0], [.26, -.06], [.28, -.2], [.31, -.4], [.4, -.58], [.52, -.7], [.55, -.76], [.5, -.78], [.42, -.72]].map(([r, y]) => new THREE.Vector2(r, y));
/** O templo do sino, na ilha do leste. */
/** O bronze dos três sinos, um material só: afinados, eles acendem juntos
 *  (só a cor emissiva muda — nada recompila). */
const bronzeDoSino = new THREE.MeshStandardMaterial({ color: P13.latao, metalness: .85, roughness: .3, side: THREE.DoubleSide, emissive: '#000000' });
const _brasaSino = new THREE.Color('#ffb04a');
export function brilhoDosSinos(v: number) { bronzeDoSino.emissive.copy(_brasaSino).multiplyScalar(v * .7); }

export const Templo: React.FC<{ sinoRef?: React.Ref<THREE.Group> }> = ({ sinoRef }) => {
    const ilha = ILHAS.find((i) => i.id === 'templo')!;
    const madeira = <meshStandardMaterial color="#5a3d26" {...pbr('carvalho', .3, 1.2)} />;
    return <group position={[SINO.x, ilha.y, SINO.z]}>
        {/* postes de tronco com mão-francesa até a travessa */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x * .9, 0, z * .9]}>
                <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[.12, .15, 4, 8]} />{madeira}</mesh>
                <mesh position={[-x * .2, 3.55, 0]} rotation={[0, 0, x * .75]}><boxGeometry args={[.08, .55, .08]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            </group>
        ))}
        {[-1, 1].map((z) => <mesh key={z} position={[0, 3.9, z * .9]}><boxGeometry args={[2.1, .18, .18]} />{madeira}</mesh>)}
        {/* a travessa de onde o sino pende, e o cepo que o prende */}
        <mesh position={[0, 3.9, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.1, .1, 2.1, 10]} />{madeira}</mesh>
        <mesh position={[0, 3.72, 0]} castShadow><boxGeometry args={[.36, .22, .3]} /><meshStandardMaterial color={P13.madeiraEsc} {...pbr('carvalho', .2, .2)} /></mesh>
        <mesh position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[1.7, 1.4, 4]} /><meshStandardMaterial color={P13.telhado} flatShading /></mesh>
        <group ref={sinoRef} position={[0, 3.6, 0]} userData={{ vivo: true }}>
            {/* a coroa (a alça por onde ele pende) e o corpo em perfil de sino */}
            <mesh position={[0, .03, 0]}><torusGeometry args={[.07, .025, 6, 12]} /><meshStandardMaterial color="#8a6a2e" metalness={.85} roughness={.35} /></mesh>
            <mesh castShadow material={bronzeDoSino}><latheGeometry args={[PERFIL_DO_SINO, 24]} /></mesh>
            {/* o badalo */}
            <mesh position={[0, -.4, 0]}><cylinderGeometry args={[.015, .015, .55, 5]} /><meshStandardMaterial color="#2e2a26" metalness={.6} /></mesh>
            <mesh position={[0, -.68, 0]}><sphereGeometry args={[.06, 10, 8]} /><meshStandardMaterial color="#2e2a26" metalness={.6} roughness={.5} /></mesh>
        </group>
        {/* o médio e o agudo (f13Sinos), sob as travessas laterais */}
        {([[-.9, .5], [.9, .38]] as const).map(([z, k]) => (
            <group key={z} position={[0, 3.8, z]} scale={k}>
                <mesh position={[0, .03, 0]}><torusGeometry args={[.07, .025, 6, 12]} /><meshStandardMaterial color="#8a6a2e" metalness={.85} roughness={.35} /></mesh>
                <mesh castShadow material={bronzeDoSino}><latheGeometry args={[PERFIL_DO_SINO, 24]} /></mesh>
                <mesh position={[0, -.68, 0]}><sphereGeometry args={[.06, 10, 8]} /><meshStandardMaterial color="#2e2a26" metalness={.6} roughness={.5} /></mesh>
            </group>
        ))}
    </group>;
};

/** A forja: bigorna, fogo e um telheiro. */
const Forja: React.FC = () => {
    const ilha = ILHAS.find((i) => i.id === 'forja')!;
    const fogo = useRef<THREE.PointLight>(null);
    useFrame(({ clock }) => { if (fogo.current) fogo.current.intensity = 6 + Math.sin(clock.elapsedTime * 13) * 1.5 + Math.sin(clock.elapsedTime * 7) * 1; });
    const ferro = <meshStandardMaterial color="#2e2e33" metalness={.8} roughness={.45} />;
    return <group position={[ilha.x, ilha.y, ilha.z - 1.5]}>
        {/* a fornalha: pedra de cantaria, boca em arco e a coifa afunilando até a chaminé */}
        <mesh position={[0, .5, 0]} castShadow><boxGeometry args={[1.6, 1, 1.2]} /><meshStandardMaterial color="#a89c8c" {...pbr('rocha', 1.2, .8)} /></mesh>
        <BrasasDaFornalha />
        <mesh position={[0, 1.6, -.2]} castShadow><cylinderGeometry args={[.28, .75, 1, 4, 1]} /><meshStandardMaterial color="#8f8478" {...pbr('rocha', .8, .6)} flatShading /></mesh>
        <mesh position={[0, 3.2, -.2]} castShadow><boxGeometry args={[.38, 2.5, .38]} /><meshStandardMaterial color="#b3a898" {...pbr('rocha', .5, .8)} /></mesh>
        <pointLight ref={fogo} position={[0, 1.5, .5]} color="#ff8a3a" distance={9} intensity={6} />
        {/* a bigorna: corpo, cintura, mesa e o chifre, num cepo de tronco */}
        <group position={[1.7, 0, .9]} rotation={[0, -.4, 0]}>
            <mesh position={[0, .3, 0]} castShadow><cylinderGeometry args={[.26, .3, .6, 12]} /><meshStandardMaterial color="#6b4a2e" {...pbr('carvalho', .4, .4)} /></mesh>
            <mesh position={[0, .68, 0]} castShadow><boxGeometry args={[.22, .16, .18]} />{ferro}</mesh>
            <mesh position={[0, .81, 0]} castShadow><boxGeometry args={[.46, .1, .18]} />{ferro}</mesh>
            <mesh position={[.32, .82, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow><coneGeometry args={[.07, .2, 10]} />{ferro}</mesh>
            {/* cada martelada solta uma rajada de fagulhas da mesa (f13Fagulhas) */}
            <FagulhasDaForja posicao={[0, .87, 0]} />
        </group>
        {/* postes de tronco com mão-francesa e o telhado de duas águas em turfa */}
        {[[-1.4, -1], [1.4, -1], [-1.4, 1.6], [1.4, 1.6]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x, 0, z]}>
                <mesh position={[0, 1.35, 0]} castShadow><cylinderGeometry args={[.1, .13, 2.7, 8]} /><meshStandardMaterial color="#5a3d26" {...pbr('carvalho', .3, 1.5)} /></mesh>
                <mesh position={[-Math.sign(x) * .22, 2.45, 0]} rotation={[0, 0, Math.sign(x) * .8]}><boxGeometry args={[.07, .6, .07]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            </group>
        ))}
        {[-1, 1.6].map((z) => <mesh key={z} position={[0, 2.72, z]}><boxGeometry args={[3.1, .14, .16]} /><meshStandardMaterial color={P13.madeiraEsc} {...pbr('carvalho', .5, .3)} /></mesh>)}
        <mesh position={[0, 3.92, .3]}><boxGeometry args={[.16, .16, 3.8]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        {[-1, 1].map((l) => (
            <group key={l}>
                <mesh position={[l * .88, 3.12, .3]} rotation={[0, 0, -l * .78]} castShadow>
                    <boxGeometry args={[2.35, .14, 3.7]} /><meshStandardMaterial color={P13.turfa} {...pbr('grama', 2, .35)} />
                </mesh>
                {/* o forro de tábuas por baixo da turfa: de dentro da forja se vê madeira, não grama chapada */}
                <mesh position={[l * .88 - l * Math.sin(.78) * .08, 3.12 - Math.cos(.78) * .08, .3]} rotation={[0, 0, -l * .78]}>
                    <boxGeometry args={[2.3, .02, 3.65]} /><meshStandardMaterial color="#b08a62" {...pbr('tabua', 1.5, 2)} />
                </mesh>
                {/* caibros por baixo: de dentro da forja se vê a estrutura, não uma tampa */}
                {[-1.2, -.3, .6, 1.5].map((z) => <mesh key={z} position={[l * .82, 3.02, z]} rotation={[0, 0, -l * .78]}><boxGeometry args={[2.25, .09, .09]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
            </group>
        ))}
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
                <mesh position={[0, 1.82, .63]}><boxGeometry args={[1.92, .26, .02]} /><meshStandardMaterial map={texturaDeToldo(P13.escudo[i % 3])} roughness={.95} /></mesh>
                {/* cestos de vime no balcão, cada um com um montinho de fruta */}
                {[-.55, 0, .55].map((dx, k) => <group key={dx} position={[dx, .9, .14]}>
                    <mesh position={[0, .05, 0]}><cylinderGeometry args={[.19, .14, .1, 14, 1, true]} /><meshStandardMaterial {...pbr('tabua', .5, .2)} color="#c9a46a" side={THREE.DoubleSide} /></mesh>
                    <mesh position={[0, .02, 0]}><cylinderGeometry args={[.14, .14, .02, 14]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
                    {[[0, 0], [.07, .05], [-.07, .04], [.03, -.07], [-.05, -.05], [0, .01]].map(([fx, fz], f) => (
                        <mesh key={f} position={[fx, f === 5 ? .14 : .08, fz]}><sphereGeometry args={[.055, 10, 8]} /><meshStandardMaterial color={['#c9442e', '#e0b155', '#6f9a4a'][k]} roughness={.5} /></mesh>
                    ))}
                </group>)}
            </group>
        ))}
        {/* pedra rúnica: rocha de verdade com a faixa de runas pintada de ocre */}
        <mesh position={[4.2, 1.2, 1.5]} rotation={[0, .3, 0]}><boxGeometry args={[.9, 2.4, .4]} /><meshStandardMaterial color="#9a9082" {...pbr('rocha', .6, 1.4)} /></mesh>
        <mesh position={[4.2 + Math.sin(.3) * .205, 1.3, 1.5 + Math.cos(.3) * .205]} rotation={[0, .3, 0]}><planeGeometry args={[.6, 1.9]} /><meshStandardMaterial map={texturaDePedraRunica()} transparent depthWrite={false} roughness={.9} polygonOffset polygonOffsetFactor={-2} /></mesh>
        {/* o poço: parede de pedra aberta (por fora e por dentro), a borda
            onde o gato cochila, a água escura lá embaixo; em cima o sarilho
            com corda e balde e um telhadinho de tábua */}
        <group position={[0, 0, 8]}>
            <mesh position={[0, .25, 0]} castShadow><cylinderGeometry args={[1.2, 1.3, .5, 24, 1, true]} /><meshStandardMaterial color="#a89c8c" {...pbr('rocha', 3, .5)} /></mesh>
            <mesh position={[0, .1, 0]}><cylinderGeometry args={[1, 1, .8, 24, 1, true]} /><meshStandardMaterial color="#5e564c" {...pbr('rocha', 2, .5)} side={THREE.BackSide} /></mesh>
            <mesh position={[0, .52, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[1.1, .13, 8, 28]} /><meshStandardMaterial color={P13.pedra} {...pbr('rocha', 2, .3)} /></mesh>
            <mesh position={[0, -.2, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1, 24]} /><meshStandardMaterial color="#16303c" metalness={0} roughness={.08} envMapIntensity={.8} /></mesh>
            {[-1, 1].map((l) => <mesh key={l} position={[l * 1.12, 1.25, 0]} castShadow><cylinderGeometry args={[.07, .09, 1.6, 8]} /><meshStandardMaterial color="#5a3d26" {...pbr('carvalho', .3, 1)} /></mesh>)}
            <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.07, .07, 2.3, 10]} /><meshStandardMaterial color="#6b4a2e" {...pbr('carvalho', .3, .5)} /></mesh>
            <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.1, .1, .5, 12]} /><meshStandardMaterial color={P13.corda} roughness={.9} /></mesh>
            <mesh position={[1.3, 1.45, 0]} rotation={[0, 0, .3]}><boxGeometry args={[.05, .3, .05]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            <mesh position={[.05, 1.05, 0]}><cylinderGeometry args={[.012, .012, .9, 5]} /><meshStandardMaterial color={P13.corda} /></mesh>
            <mesh position={[.05, .5, 0]} castShadow><cylinderGeometry args={[.16, .12, .26, 12]} /><meshStandardMaterial color="#7a5a3a" {...pbr('carvalho', .3, .3)} /></mesh>
            <mesh position={[.05, .62, 0]} rotation={[0, 0, 0]}><torusGeometry args={[.16, .012, 5, 14, Math.PI]} /><meshStandardMaterial color="#2e2a26" metalness={.6} roughness={.5} /></mesh>
            {[-1, 1].map((l) => <mesh key={`t${l}`} position={[0, 2.18, l * .38]} rotation={[l * .72, 0, 0]} castShadow><boxGeometry args={[2.7, .06, .95]} /><meshStandardMaterial color="#b08a62" {...pbr('carvalho', 1, .4)} emissive="#2a1c10" /></mesh>)}
            <mesh position={[0, 2.12, 0]}><boxGeometry args={[2.5, .1, .1]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            {[-1, 1].map((l) => <mesh key={`c${l}`} position={[l * 1.12, 2.0, 0]}><boxGeometry args={[.1, .3, .1]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
        </group>
    </group>;
};

/** O monte de feno: esfera amassada (lisa, estourava no sol como um domo amarelo). */
const geoFeno = (() => {
    const g = new THREE.SphereGeometry(1, 22, 14), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const f = 1 + ruido(p.getX(i) * 4, p.getY(i) * 4, p.getZ(i) * 4) * .16; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
    g.computeVertexNormals(); return g;
})();
/** Carroça de feno na ilha do pouso — onde o avião cai. */
export const Carroca: React.FC = () => (
    <group position={[-2, 0, 33]} rotation={[0, .4, 0]}>
        <mesh position={[0, .55, 0]}><boxGeometry args={[2.2, .5, 1.4]} /><meshStandardMaterial color={P13.tabua} /></mesh>
        <mesh position={[0, 1.15, 0]} scale={[1.2, .6, .8]} geometry={geoFeno}><meshStandardMaterial color="#a8883e" roughness={1} flatShading /></mesh>
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
                if (dentroDeCasa(il.x + Math.cos(a) * d, il.z + Math.sin(a) * d, .6) || distTrilha(il.x + Math.cos(a) * d, il.z + Math.sin(a) * d) < 1.1) continue;
                l.push({ tipo: i % 7 === 0 ? 2 : i % 3 === 0 ? 0 : i % 5 === 0 ? 3 : 1, x: il.x + Math.cos(a) * d, y: il.y, z: il.z + Math.sin(a) * d, s: .6 + rnd() * .8, r: rnd() * 6 });
            }
        }
        return l;
    }, []);
    const geos = useMemo(() => [
        new THREE.DodecahedronGeometry(.35, 0),
        // touceira: nove lâminas finas e curvas saindo de um ponto, em leque
        // (era um cone de quatro faces: lia como um marcador verde no chão)
        (() => {
            const partes: THREE.BufferGeometry[] = [];
            for (let i = 0; i < 9; i++) {
                const g = new THREE.PlaneGeometry(.035, .5, 1, 4); g.translate(0, .25, 0);
                const gp = g.getAttribute('position');
                for (let v = 0; v < gp.count; v++) { const y = gp.getY(v); gp.setX(v, gp.getX(v) * (1 - y * 1.6)); gp.setZ(v, y * y * .5); }
                g.rotateX(-.15 - (i % 3) * .12); g.rotateY(i / 9 * Math.PI * 2 + (i % 2) * .3); g.scale(1, .7 + (i % 4) * .15, 1);
                partes.push(g.toNonIndexed());
            }
            const m = mergeGeometries(partes)!; m.deleteAttribute('uv'); m.computeVertexNormals(); return m;
        })(),
        // barril de aduelas: bojudo no meio, com dois aros escuros (cor por vértice)
        (() => {
            const pts: THREE.Vector2[] = [];
            for (let i = 0; i <= 12; i++) { const y = i / 12; pts.push(new THREE.Vector2(.24 + Math.sin(y * Math.PI) * .05, y * .62)); }
            const g = new THREE.LatheGeometry(pts, 16);
            const gp = g.getAttribute('position'), cor = new Float32Array(gp.count * 3);
            const madeira = new THREE.Color('#9a7048'), aro = new THREE.Color('#2e2a26');
            for (let v = 0; v < gp.count; v++) {
                const y = gp.getY(v) / .62, a = Math.atan2(gp.getZ(v), gp.getX(v));
                const c = Math.abs(y - .18) < .04 || Math.abs(y - .82) < .04 ? aro : madeira;
                const veio = .85 + .15 * Math.abs(Math.sin(a * 8));
                cor.set([c.r * veio, c.g * veio, c.b * veio], v * 3);
            }
            g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
            const tampa = new THREE.CircleGeometry(.24, 16).rotateX(-Math.PI / 2).translate(0, .6, 0);
            const tc = new Float32Array(tampa.getAttribute('position').count * 3).map((_, i) => [.45, .32, .2][i % 3]);
            tampa.setAttribute('color', new THREE.BufferAttribute(tc, 3));
            const m = mergeGeometries([g.toNonIndexed(), tampa.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }))!;
            m.computeVertexNormals(); return m;
        })(),
        // flor de verdade: haste, cinco pétalas e o miolo (cores por vértice)
        (() => {
            const cor = (g: THREE.BufferGeometry, c: string) => { const k = new THREE.Color(c), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
            const partes = [cor(new THREE.CylinderGeometry(.008, .01, .26, 5).translate(0, .13, 0), '#4f7a36')];
            for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; partes.push(cor(new THREE.SphereGeometry(.03, 6, 4).scale(1.3, .35, .8).translate(Math.cos(a) * .035, .265, Math.sin(a) * .035), '#c9a0d8')); }
            partes.push(cor(new THREE.SphereGeometry(.018, 6, 4).translate(0, .275, 0), '#f0c840'));
            return mergeGeometries(partes.map((g) => g.index ? g.toNonIndexed() : g))!;
        })(),
    ], []);
    const mats = useMemo(() => [
        new THREE.MeshStandardMaterial({ color: '#a89c8c', ...pbr('rocha', .5, .5) }),
        new THREE.MeshStandardMaterial({ color: P13.gramaEsc, side: THREE.DoubleSide, roughness: .8 }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }),
    ], []);
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const porTipo = useMemo(() => [0, 1, 2, 3].map((t) => itens.filter((i) => i.tipo === t)), [itens]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        porTipo.forEach((lista, tipo) => {
            const m = refs.current[tipo]; if (!m) return;
            // só os tufos balançam: o resto é posto uma vez
            if (tipo !== 1 && m.userData.posto) return;
            m.userData.posto = true;
            lista.forEach((it, i) => {
                tmp.position.set(it.x, it.y, it.z);
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

/** Asa de gaivota: trapézio afinando na ponta, cotovelo dobrado, ponta escura. */
const ASA = (() => {
    const g = new THREE.BufferGeometry();
    // base no corpo (x=0), cotovelo, ponta; z para trás
    const v = [0, 0, -.12, 0, 0, .14, .32, .03, -.06, .32, .03, .12, .62, -.02, .02];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const c = [.9, .9, .88, .9, .9, .88, .75, .76, .78, .75, .76, .78, .12, .12, .14];
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
})();
const MAT_ASA = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const MAT_CORPO = new THREE.MeshLambertMaterial({ color: '#e8e6e0' });
/** Gaivotas em bando, dando voltas altas sobre a cidade, cada uma no seu bater de asas. */
const Passaros: React.FC = () => {
    const g = useRef<THREE.Group>(null);
    const asas = useRef<(THREE.Object3D | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime, o = g.current; if (!o) return;
        o.position.set(Math.cos(t * .12) * 30, 18 + Math.sin(t * .3) * 2, Math.sin(t * .12) * 30);
        o.rotation.y = -t * .12 + Math.PI / 2;
        asas.current.forEach((a, i) => {
            if (!a) return;
            const ave = i >> 1, lado = i & 1 ? -1 : 1;
            // bate em rajadas e plana: o seno passa por um limiar
            const ciclo = Math.sin(t * .7 + ave * 1.9), bate = ciclo > 0 ? Math.sin(t * 11 + ave) * .7 : .12;
            a.rotation.z = lado * bate;
        });
    });
    return <group ref={g} userData={{ vivo: true }}>
        {[[0, 0], [-1.3, 1.1], [1.3, 1.2], [-2.5, 2.3], [2.6, 2.1]].map(([x, z], i) => (
            <group key={i} position={[x, (i % 3) * .3, z]} rotation={[0, Math.PI, (i % 2 ? .08 : -.08)]} scale={1.4}>
                <mesh material={MAT_CORPO} scale={[.07, .06, .26]}><sphereGeometry args={[1, 8, 6]} /></mesh>
                {[1, -1].map((l) => <group key={l} ref={(m) => { asas.current[i * 2 + (l > 0 ? 0 : 1)] = m; }} scale={[l, 1, 1]}>
                    <mesh geometry={ASA} material={MAT_ASA} />
                </group>)}
            </group>
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
                // perto do olho a lâmina encolhe (em primeira pessoa elas enchiam
                // meia tela, serrilhadas): some de 0,6 m e está inteira a 2,6 m
                float perto = smoothstep(.6, 2.6, distance(cameraPosition.xz, (modelMatrix * wp).xz));
                transformed *= mix(.12, 1., perto);
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
                    if (distTrilha(x, z) < 1) continue;
                    // o banco do Árni: grama baixa em volta, a vista dele é o gramado das crianças
                    if (Math.hypot(x - BANCO.x, z - BANCO.z) < 2.2) continue;
                    // nem dentro da casa nem na soleira: a lâmina atravessava o
                    // vão da porta de latão aberta (entrava no elevador)
                    if (dentroDeCasa(x, z, .1) || LUGAR_DAS_CASAS.some((_, i) => { const p = portaNoMundo(i); return Math.hypot(x - p.x - p.fx * .5, z - p.z - p.fz * .5) < 1.2; })) continue;
                    o.position.set(x, il.y, z);
                    o.rotation.set((rnd() - .5) * .35, rnd() * Math.PI * 2, (rnd() - .5) * .35);
                    const e = Math.min(1.1, alta * (.6 + rnd() * .6));
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
/** Trilhas de pedra: do centro de cada ilha até a cabeceira de cada ponte. */
const TRILHAS: ReadonlyArray<{ a: THREE.Vector2; b: THREE.Vector2; y: number }> = PONTES.flatMap((p) => {
    const A = ILHAS.find((i) => i.id === p.de)!, B = ILHAS.find((i) => i.id === p.para)!;
    const d = new THREE.Vector2(B.x - A.x, B.z - A.z).normalize();
    return [
        { a: new THREE.Vector2(A.x, A.z).addScaledVector(d, A.r * .22), b: new THREE.Vector2(A.x, A.z).addScaledVector(d, A.r - .5), y: A.y },
        { a: new THREE.Vector2(B.x, B.z).addScaledVector(d, -B.r * .22), b: new THREE.Vector2(B.x, B.z).addScaledVector(d, -(B.r - .5)), y: B.y },
    ];
});
const _pt = new THREE.Vector2();
/** Distância (m) até a trilha mais próxima. */
function distTrilha(x: number, z: number): number {
    let m = Infinity;
    for (const t of TRILHAS) {
        const ab = _pt.copy(t.b).sub(t.a), L2 = ab.lengthSq();
        const k = Math.max(0, Math.min(1, ((x - t.a.x) * ab.x + (z - t.a.y) * ab.y) / L2));
        m = Math.min(m, Math.hypot(x - (t.a.x + ab.x * k), z - (t.a.y + ab.y * k)));
    }
    return m;
}
/** As lajes das trilhas: pedras chatas instanciadas, duas por passo, desencontradas. */
const Trilhas: React.FC = () => {
    const malha = useMemo(() => {
        const g = new THREE.DodecahedronGeometry(1, 1);
        const gp = g.getAttribute('position');
        for (let i = 0; i < gp.count; i++) { const f = 1 + ruido(gp.getX(i) * 2.3, 0, gp.getZ(i) * 2.3) * .45; const y = gp.getY(i); gp.setXYZ(i, gp.getX(i) * f, y > 0 ? y * (.9 + ruido(gp.getX(i) * 3, 1, gp.getZ(i) * 3) * .15) : y, gp.getZ(i) * f); }
        g.scale(.17, .045, .14); g.computeVertexNormals();
        const m = new THREE.MeshStandardMaterial({ ...pbr('rocha', .25, .6), map: null, color: '#9d978c', roughness: .85 });
        const cores: THREE.Color[] = [];
        const ms: THREE.Matrix4[] = [];
        const o = new THREE.Object3D();
        let k = 3; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        for (const t of TRILHAS) {
            const L = t.a.distanceTo(t.b), n = Math.floor(L / .44);
            const d = _pt.copy(t.b).sub(t.a).normalize().clone(), lado = new THREE.Vector2(-d.y, d.x);
            for (let i = 0; i <= n; i++) for (const l of [-1, 1]) {
                const s = i * .44 + (l > 0 ? .22 : 0);
                if (s > L) continue;
                const x = t.a.x + d.x * s + lado.x * l * (.2 + r() * .1), z = t.a.y + d.y * s + lado.y * l * (.2 + r() * .1);
                // assentadas: a borda aparece um pouco acima da grama baixa
                o.position.set(x, t.y + .004, z); o.rotation.set((r() - .5) * .06, r() * 3, (r() - .5) * .06);
                const e = .7 + r() * .5; o.scale.set(e, .8 + r() * .3, e * (.7 + r() * .4)); o.updateMatrix(); ms.push(o.matrix.clone());
                // cada laje com o seu tom: musgo, ferrugem, cinza de rio
                cores.push(new THREE.Color().setHSL(.08 + r() * .1, .04 + r() * .06, .9 + r() * .1));
            }
        }
        const im = new THREE.InstancedMesh(g, m, ms.length);
        ms.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cores[i]); });
        im.receiveShadow = true; im.castShadow = true; im.computeBoundingSphere();
        // o anel de terra batida sob cada laje: o que a assenta no chão (sem ele lia como mancha solta)
        const gt = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2).scale(.2, 1, .17);
        const terra = new THREE.InstancedMesh(gt, new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), ms.length);
        const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Vector3(), _m = new THREE.Matrix4();
        ms.forEach((mm, i) => { mm.decompose(_p, _q, _e); _p.y += .001; _e.set(_e.x * 1.25, 1, _e.z * 1.25); terra.setMatrixAt(i, _m.compose(_p, _q, _e)); });
        terra.receiveShadow = true; terra.computeBoundingSphere();
        const grupo = new THREE.Group(); grupo.add(terra, im);
        return grupo;
    }, []);
    return <primitive object={malha} />;
};

/**
 * A borda das ilhas: pedras meio enterradas e arbustos correndo pela beira,
 * com vãos nas cabeceiras das pontes. Sem isso o chão acabava num corte reto
 * contra o céu (instanciado: duas chamadas).
 */
const Borda: React.FC = () => {
    const [pedras, moitas] = useMemo(() => {
        let k = 17; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        const o = new THREE.Object3D(), mp: THREE.Matrix4[] = [], mm: THREE.Matrix4[] = [];
        for (const il of ILHAS) {
            const n = Math.round(il.r * 2 * Math.PI / 1.1);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2 + r() * .3, d = il.r * (.9 + r() * .08);
                const x = il.x + Math.cos(a) * d, z = il.z + Math.sin(a) * d;
                if (distTrilha(x, z) < 1.8) continue;   // cabeceira de ponte livre
                if (dentroDeCasa(x, z, .5)) continue;   // nada atravessando a parede do fundo
                if (r() < .55) {
                    const e = .22 + r() * .4;
                    o.position.set(x, il.y - e * .25, z); o.rotation.set(r() * 3, r() * 3, r() * 3); o.scale.set(e * (1 + r() * .5), e * .7, e);
                    o.updateMatrix(); mp.push(o.matrix.clone());
                } else {
                    const e = .3 + r() * .35;
                    o.position.set(x, il.y + e * .25, z); o.rotation.set(0, r() * 3, 0); o.scale.set(e * 1.3, e * .8, e);
                    o.updateMatrix(); mm.push(o.matrix.clone());
                }
            }
        }
        const gp = new THREE.DodecahedronGeometry(1, 1);
        const pp = gp.getAttribute('position');
        for (let i = 0; i < pp.count; i++) { const f = 1 + ruido(pp.getX(i) * 2, pp.getY(i) * 2, pp.getZ(i) * 2) * .18; pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * f, pp.getZ(i) * f); }
        gp.computeVertexNormals();
        const ip = new THREE.InstancedMesh(gp, new THREE.MeshStandardMaterial({ color: '#9a8f80', ...pbr('rocha', .6, .6) }), mp.length);
        mp.forEach((m, i) => ip.setMatrixAt(i, m));
        // moita: bolas de folhagem fundidas numa geometria só
        const partes = [[0, 0, 0, 1], [.6, -.1, .2, .7], [-.55, -.1, -.1, .75], [.1, .25, -.3, .65]].map(([x, y, z, e]) => new THREE.IcosahedronGeometry(e, 2).translate(x, y, z));
        const gm = mergeGeometries(partes)!;
        const pm = gm.getAttribute('position');
        for (let i = 0; i < pm.count; i++) { const f = 1 + ruido(pm.getX(i) * 3, pm.getY(i) * 3, pm.getZ(i) * 3) * .22 + ruido(pm.getX(i) * 11, pm.getY(i) * 11, pm.getZ(i) * 11) * .07; pm.setXYZ(i, pm.getX(i) * f, pm.getY(i) * f, pm.getZ(i) * f); }
        gm.computeVertexNormals();
        // suave (facetada destoava da grama e da madeira texturizadas) e cada moita no seu verde
        const im = new THREE.InstancedMesh(gm, new THREE.MeshStandardMaterial({ color: '#5a7a36', roughness: .9, ...pbr('grama', 2, .5), map: null }), mm.length);
        const cor = new THREE.Color();
        mm.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cor.setHSL(.22 + r() * .07, .35 + r() * .2, .32 + r() * .14)); });
        for (const x of [ip, im]) { x.castShadow = true; x.receiveShadow = true; x.computeBoundingSphere(); }
        return [ip, im];
    }, []);
    return <><primitive object={pedras} /><primitive object={moitas} /></>;
};

/** Onde ficam as tochas (x, y, z): o Floor13 também as usa como obstáculo. */
export const TOCHAS = [
    [3.5, 0, 17], [-3.5, 0, 17], [3, 0, -.5], [-3, 0, -.5], [3.6, 3, -12.3], [-3.6, 3, -12.3],
    [-15, 1, 6.5], [17.4, 2, 1.2], [-5, 3, -30],
] as const;
/** Halo das chamas: um degradê radial feito uma vez, somado à cena. */
const texHaloTocha = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,190,110,.9)'); gr.addColorStop(.35, 'rgba(255,140,60,.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
/** A chama: um plano sempre de frente para a câmera, desenhado em shader —
 *  gota que ondula com ruído no tempo, miolo branco-amarelo, borda laranja
 *  que some em alfa. De perto não vira cone nem bola. */
const tempoChama = { value: 0 };
const matChama = new THREE.ShaderMaterial({
    uniforms: { uT: tempoChama },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
        uniform float uT; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float r(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
            vec2 p = vUv - vec2(.5, .12);
            float sobe = uT * 2.6;
            float n = r(vec2(p.x * 5., p.y * 4. - sobe)) * .6 + r(vec2(p.x * 11., p.y * 9. - sobe * 1.7)) * .4;
            // gota: larga embaixo, fina em cima, a borda comida pelo ruído
            float larg = .30 * (1. - smoothstep(0., .85, p.y)) * (.75 + .5 * n) + .02;
            float x = abs(p.x + (n - .5) * .12 * p.y);
            float forma = smoothstep(larg, larg * .35, x) * smoothstep(-.1, .05, p.y) * (1. - smoothstep(.55, .9, p.y + n * .15));
            if (forma < .01) discard;
            float miolo = smoothstep(larg * .7, 0., x) * (1. - smoothstep(.1, .5, p.y));
            vec3 cor = mix(vec3(1., .32, .06), vec3(1., .72, .25), forma);
            cor = mix(cor, vec3(1., .96, .8), miolo);
            gl_FragColor = vec4(cor * 1.6, forma * .95);
        }`,
});
const geoChama = new THREE.PlaneGeometry(.26, .5).translate(0, .2, 0);
const matHalo = new THREE.SpriteMaterial({ map: texHaloTocha, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8 });

/** Tochas nas bordas dos caminhos: chama em duas camadas com halo, luz que tremula. */
const Tochas: React.FC = () => {
    const lugares = TOCHAS;
    const luzes = useRef<(THREE.PointLight | null)[]>([]);
    const chamas = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock, camera }) => {
        const t = clock.elapsedTime;
        tempoChama.value = t;
        lugares.forEach((_, i) => {
            const f = .75 + Math.sin(t * 11 + i * 3) * .15 + Math.sin(t * 23 + i) * .1;
            if (luzes.current[i]) luzes.current[i]!.intensity = 2.2 * f;
            const ch = chamas.current[i];
            // a chama olha sempre para a câmera (só gira em torno do eixo vertical) e respira
            if (ch) { ch.rotation.set(0, Math.atan2(camera.position.x - (ch.parent?.position.x ?? 0), camera.position.z - (ch.parent?.position.z ?? 0)), 0); ch.scale.set(1, .9 + f * .25, 1); }
        });
    });
    return <>{lugares.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
            <mesh position={[0, .8, 0]}><cylinderGeometry args={[.05, .07, 1.6, 6]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            <mesh position={[0, 1.62, 0]}><cylinderGeometry args={[.1, .07, .14, 8]} /><meshStandardMaterial color="#3a3a3e" metalness={.6} roughness={.5} /></mesh>
            <group ref={(m) => { chamas.current[i] = m as unknown as THREE.Mesh; }} position={[0, 1.7, 0]} userData={{ vivo: true }}>
                <mesh geometry={geoChama} material={matChama} renderOrder={2} />
            </group>
            <sprite position={[0, 1.84, 0]} scale={[.6, .6, 1]} material={matHalo} />
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
    const [prontas, setProntas] = useState(0);
    const avisa = useCallback(() => setProntas((n) => n + 1), []);
    useFundir(raiz, 18, prontas >= TOTAL_DE_CASAS ? 1 : 0);
    return <CasaPronta.Provider value={avisa}><group ref={raiz}>
        <LuzesDaPorta />
        <Ceu />
        <Nuvens />
        <Frota />
        <Decoracao />
        <Grama />
        <Trilhas />
        <Borda />
        <Tochas />
        <Passaros />
        {ILHAS.map((i, k) => <IlhaVisual key={i.id} {...i} i={k} />)}
        {pontes.map((p, k) => <PonteVisual key={k} {...p} />)}
        {CASAS.map((c, i) => {
            const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
            // cada casa com seu jeito: comprimento, torção e escala próprios
            return <group key={i} position={[l.x, l.y, l.z]} rotation={[0, f.giro, 0]} scale={f.escala as [number, number, number]}>
                <CasaComprida runa={c.runa} latao={c.portaDeLatao} fumaca={c.fumaca} botao={c.botao} estilo={ESTILO_DA_CASA[i]}
                    portaRef={i === CASA_CERTA ? portaCertaRef : undefined} indice={i} />
            </group>;
        })}
        {/* a casa do Árni, no fundo do mirante, com a porta para o banco */}
        <group position={[-19.6, -.4, 24.4]} rotation={[0, Math.atan2(-15.2 - -19.6, 20.2 - 24.4), 0]}><CasaComprida escala={.72} /></group>
        {/* duas casas de moradores na praça, só de cenário */}
        <group position={[-7.5, 0, 4]} rotation={[0, 1.1, 0]}><CasaComprida escala={.9} /></group>
        <group position={[7.8, 0, 12.5]} rotation={[0, -2.2, 0]}><CasaComprida escala={.9} /></group>
        <Praca />
        <Forja />
        <Templo sinoRef={sinoRef} />
        <Carroca />
    </group></CasaPronta.Provider>;
};
