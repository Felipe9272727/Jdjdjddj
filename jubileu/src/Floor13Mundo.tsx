/**
 * Floor13Mundo.tsx — o que se vê em Vindhjem.
 *
 * Ilhas de pedra com tampo de grama, pontes de tábua e corda, casas compridas
 * vikings com proa de dragão, a forja, o templo do sino, a praça do mercado e,
 * em volta de tudo, barcos navegando o céu. Só desenho: onde se pisa e quem
 * está onde vêm de `f13Mundo.ts`.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCloudGeometry } from './f12CloudGeometry';
import { CASAS, CASA_CERTA } from './f13Lore';
import { ILHAS, PONTES, LUGAR_DAS_CASAS, SINO } from './f13Mundo';

// ── PALETA ───────────────────────────────────────────────────────────────────
export const P13 = Object.freeze({
    ceuAlto: '#5f97d1', ceuBaixo: '#f3d6ae', sol: '#fff1c9',
    grama: '#6f9a4a', gramaEsc: '#4f7a36', pedra: '#7b7064', pedraEsc: '#4a4038',
    madeira: '#6b4a2e', madeiraEsc: '#3f2a1a', tabua: '#8a6440', corda: '#c9b186',
    telhado: '#5b3b25', turfa: '#6d8a3e', latao: '#e0b155', carvalho: '#5a3a22',
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
    const ng = g.toNonIndexed();
    // gradiente: lábio quente em cima, base fria e escura embaixo
    const q = ng.getAttribute('position'), cor = new Float32Array(q.count * 3);
    const topo = new THREE.Color('#9a8670'), base = new THREE.Color('#3b3a44'), c = new THREE.Color();
    for (let k = 0; k < q.count; k++) {
        const h = Math.min(1, Math.max(0, -q.getY(k) / (r * 1.9)));
        c.copy(topo).lerp(base, Math.pow(h, .7));
        cor.set([c.r, c.g, c.b], k * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    return ng;
}

/** Céu em degradê: uma esfera por dentro com shader barato. */
const Ceu: React.FC = () => {
    const mat = useMemo(() => new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { alto: { value: new THREE.Color(P13.ceuAlto) }, baixo: { value: new THREE.Color(P13.ceuBaixo) } },
        vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: 'uniform vec3 alto; uniform vec3 baixo; varying vec3 v; void main(){ float k = smoothstep(-.15, .55, v.y); gl_FragColor = vec4(mix(baixo, alto, k), 1.); }',
    }), []);
    return <>
        <mesh material={mat} renderOrder={-10}><sphereGeometry args={[400, 32, 16]} /></mesh>
        <mesh position={[-120, 70, -220]}>
            <sphereGeometry args={[12, 32, 16]} />
            <meshBasicMaterial color={new THREE.Color(P13.sol).multiplyScalar(1.6)} toneMapped={false} fog={false} />
        </mesh>
    </>;
};

/** O mar de nuvens lá embaixo e alguns bancos soltos entre as ilhas. */
const Nuvens: React.FC = () => {
    const geo = useMemo(() => createCloudGeometry(), []);
    const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#6b7a8a', emissiveIntensity: .25 }), []);
    const ref = useRef<THREE.InstancedMesh>(null);
    const lista = useMemo(() => {
        const l: { x: number; y: number; z: number; s: number }[] = [];
        let k = 7;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        for (let i = 0; i < 120; i++) {
            const a = rnd() * Math.PI * 2, d = 20 + rnd() * 170;
            l.push({ x: Math.cos(a) * d, y: -16 - rnd() * 8, z: Math.sin(a) * d, s: 7 + rnd() * 9 });
        }
        for (let i = 0; i < 14; i++) {
            const a = rnd() * Math.PI * 2, d = 40 + rnd() * 50;
            l.push({ x: Math.cos(a) * d, y: 4 + rnd() * 14, z: Math.sin(a) * d, s: 3 + rnd() * 3 });
        }
        return l;
    }, []);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    useFrame(({ clock }) => {
        const m = ref.current; if (!m) return;
        const t = clock.elapsedTime;
        lista.forEach((c, i) => {
            tmp.position.set(c.x + Math.sin(t * .03 + i) * 2, c.y, c.z);
            tmp.scale.set(c.s * 1.5, c.s * .7, c.s);
            tmp.rotation.set(0, i, 0);
            tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={ref} args={[geo, mat, lista.length]} frustumCulled={false} />;
};

/** Uma ilha: tampo de grama com borda de terra e a rocha pendurada. */
const IlhaVisual: React.FC<{ x: number; y: number; z: number; r: number; i: number }> = ({ x, y, z, r, i }) => {
    const rocha = useMemo(() => geoRocha(r, i * 3.1), [r, i]);
    // tampo com manchas: grama clara e escura misturadas por ruído, e terra
    // batida no miolo (onde se anda mais)
    const topo = useMemo(() => {
        const g = new THREE.CylinderGeometry(r, r * .97, .36, 48, 1, false).toNonIndexed();
        const p = g.getAttribute('position'), cor = new Float32Array(p.count * 3);
        const a = new THREE.Color(P13.grama), b = new THREE.Color(P13.gramaEsc), terra = new THREE.Color('#9a8052'), c = new THREE.Color();
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
        <mesh position={[0, -.18, 0]} receiveShadow geometry={topo}><meshStandardMaterial vertexColors roughness={.95} /></mesh>
        {/* a franja de grama que escorre pela borda */}
        <mesh position={[0, -.42, 0]}><cylinderGeometry args={[r * 1.01, r * .99, .22, 40, 1, true]} /><meshStandardMaterial color={P13.gramaEsc} roughness={1} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -.55, 0]}><cylinderGeometry args={[r * .97, r * .95, .4, 40]} /><meshStandardMaterial color="#6b5238" roughness={1} /></mesh>
        <mesh geometry={rocha}><meshStandardMaterial vertexColors roughness={.9} flatShading /></mesh>
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
                <boxGeometry args={[largura, .09, .46]} /><meshStandardMaterial map={texturaDeMadeira()} color={i % 4 ? '#e0c8a8' : '#b89878'} roughness={.9} />
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

/** Textura com uma runa branca pintada em madeira escura. */
function texturaRuna(runa: string): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3f2a1a'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#efe3c8'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(runa, 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Fumaça de chaminé: bolinhas que sobem, crescem e somem. */
const Fumaca: React.FC<{ y: number }> = ({ y }) => {
    const ref = useRef<THREE.Group>(null);
    useFrame(({ clock }) => {
        const g = ref.current; if (!g) return;
        g.children.forEach((c, i) => {
            const t = (clock.elapsedTime * .35 + i / g.children.length) % 1;
            c.position.set(Math.sin(t * 5 + i) * .3 + t * 1.2, y + t * 5, 0);
            c.scale.setScalar(.35 + t * 1.3);
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .55 * (1 - t);
        });
    });
    return <group ref={ref}>
        {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color="#d9d4cc" transparent depthWrite={false} /></mesh>
        ))}
    </group>;
};

/** Casa comprida viking. A porta olha para +z local. */
export const CasaComprida: React.FC<{
    runa?: string; latao?: boolean; fumaca?: boolean; botao?: boolean; escala?: number;
    portaRef?: React.Ref<THREE.Group>;
}> = ({ runa, latao = false, fumaca = true, botao = false, escala = 1, portaRef }) => {
    const musgo = runa ? (runa.charCodeAt(0) % 5) / 5 : 0;
    const parede = useMemo(() => new RoundedBoxGeometry(3.4, 1.9, 5.6, 2, .08), []);
    const tex = useMemo(() => (runa ? texturaRuna(runa) : null), [runa]);
    return <group scale={escala}>
        <mesh geometry={parede} position={[0, .95, 0]} castShadow><meshStandardMaterial map={texturaDeMadeira()} color="#a07a58" roughness={.85} /></mesh>
        {/* vigas verticais nas paredes */}
        {[-1, 1].map((lado) => [-2.2, -1.1, 0, 1.1, 2.2].map((z) => (
            <mesh key={`${lado}${z}`} position={[lado * 1.72, .95, z]}><boxGeometry args={[.1, 1.95, .16]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        )))}
        {/* telhado em A coberto de turfa */}
        {[-1, 1].map((lado) => (
            <mesh key={lado} position={[lado * .98, 2.55, 0]} rotation={[0, 0, -lado * .78]} castShadow scale={[1, 1 + musgo * .5, 1]}>
                <boxGeometry args={[2.75, .2, 6.2]} /><meshStandardMaterial color={P13.turfa} roughness={1} />
            </mesh>
        ))}
        {/* as proas de dragão cruzadas na frente e atrás */}
        {[-1, 1].map((f) => [-1, 1].map((lado) => (
            <mesh key={`${f}${lado}`} position={[lado * .35, 3.55, f * 3.05]} rotation={[f * .35, 0, lado * .55]}>
                <coneGeometry args={[.1, 1.3, 6]} /><meshStandardMaterial color={P13.madeiraEsc} />
            </mesh>
        )))}
        {/* chaminé */}
        <mesh position={[.9, 3.2, -1.2]}><boxGeometry args={[.45, .8, .45]} /><meshStandardMaterial color={P13.pedra} flatShading /></mesh>
        {fumaca && <group position={[.9, 0, -1.2]}><Fumaca y={3.7} /></group>}
        {/* a porta */}
        <group ref={portaRef} position={[0, .8, 2.82]}>
            {latao
                // latão em duas folhas, como porta de elevador (a casa certa as abre)
                ? [-1, 1].map((l) => <mesh key={l} name="folha" userData={{ lado: l }} position={[l * .2625, 0, 0]}>
                    <boxGeometry args={[.52, 1.6, .1]} />
                    <meshStandardMaterial color={P13.latao} metalness={1} roughness={.3} emissive="#b8782a" emissiveIntensity={.35} />
                </mesh>)
                : <mesh><boxGeometry args={[1.05, 1.6, .1]} /><meshStandardMaterial color={P13.carvalho} roughness={.8} /></mesh>}
            {latao && <mesh position={[0, 0, -.045]}><planeGeometry args={[1, 1.55]} /><meshBasicMaterial color={new THREE.Color('#ffe2a8').multiplyScalar(2.2)} toneMapped={false} /></mesh>}
            {!latao && [-.3, 0, .3].map((x) => (
                <mesh key={x} position={[x, 0, .06]}><boxGeometry args={[.04, 1.5, .02]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            ))}
            <mesh position={[.34, 0, .08]}><torusGeometry args={[.08, .02, 6, 14]} /><meshStandardMaterial color={latao ? '#8a6a2a' : '#2a2a2a'} metalness={.6} /></mesh>
        </group>
        {botao && <mesh position={[.85, 1.05, 2.84]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[.07, .07, .05, 14]} /><meshStandardMaterial color="#ffd79a" emissive="#ffb347" emissiveIntensity={1.4} />
        </mesh>}
        {tex && <mesh position={[0, 1.95, 2.84]}><planeGeometry args={[.55, .55]} /><meshStandardMaterial map={tex} /></mesh>}
        {/* escudos pendurados na lateral */}
        {[-1.6, 0, 1.6].map((z, i) => (
            <mesh key={z} position={[1.8, 1.1, z]} rotation={[0, Math.PI / 2, 0]}>
                <cylinderGeometry args={[.38, .38, .06, 16]} /><meshStandardMaterial color={P13.escudo[i % 4]} />
            </mesh>
        ))}
    </group>;
};

/** Barco viking que navega o céu. A proa aponta para +z local. */
export const Barco: React.FC<{ vela?: string; escala?: number }> = ({ vela = P13.vela1, escala = 1 }) => {
    const velaTex = useMemo(() => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d')!;
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? P13.vela2 : vela; g.fillRect(i * 8, 0, 8, 64); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }, [vela]);
    return <group scale={escala}>
        {/* casco: meio tubo alongado */}
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, .55]}>
            <cylinderGeometry args={[1, 1, 7, 18, 1, true, Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color={P13.madeira} side={THREE.DoubleSide} roughness={.8} />
        </mesh>
        {[-1, 1].map((f) => (
            <mesh key={f} position={[0, .6, f * 3.8]} rotation={[-f * .5, 0, 0]}>
                <coneGeometry args={[.28, 1.8, 8]} /><meshStandardMaterial color={P13.madeiraEsc} />
            </mesh>
        ))}
        <mesh position={[0, 2, 0]}><cylinderGeometry args={[.08, .1, 4.4, 8]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        <mesh position={[0, 2.5, .1]}><planeGeometry args={[3.4, 2.4]} /><meshStandardMaterial map={velaTex} side={THREE.DoubleSide} /></mesh>
        {[-1, 1].map((lado) => [-2.4, -1.2, 0, 1.2, 2.4].map((z, i) => (
            <mesh key={`${lado}${z}`} position={[lado * .98, .15, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[.3, .3, .05, 12]} /><meshStandardMaterial color={P13.escudo[(i + (lado > 0 ? 1 : 0)) % 4]} />
            </mesh>
        )))}
        {/* remos batendo no ar */}
        {[-1, 1].map((lado) => [-1.8, -.6, .6, 1.8].map((z) => (
            <mesh key={`r${lado}${z}`} position={[lado * 1.5, -.2, z]} rotation={[0, 0, lado * .9]}>
                <boxGeometry args={[.06, 1.6, .12]} /><meshStandardMaterial color={P13.tabua} />
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
    return <>{rotas.map((r, i) => <group key={i} ref={(g) => { refs.current[i] = g; }}><Barco vela={r.vela} escala={r.e} /></group>)}</>;
};

/** O templo do sino, na ilha do leste. */
export const Templo: React.FC<{ sinoRef?: React.Ref<THREE.Group> }> = ({ sinoRef }) => {
    const ilha = ILHAS.find((i) => i.id === 'templo')!;
    return <group position={[SINO.x, ilha.y, SINO.z]}>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x * .9, 2, z * .9]}><boxGeometry args={[.25, 4, .25]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        ))}
        <mesh position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[1.7, 1.4, 4]} /><meshStandardMaterial color={P13.telhado} flatShading /></mesh>
        <group ref={sinoRef} position={[0, 3.6, 0]}>
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

/** Praça do mercado: barracas com toldo listrado e uma pedra rúnica. */
const Praca: React.FC = () => {
    const barracas = [[-6, 12, .4], [-3.2, 14, .1], [6, 11, -.4]];
    return <group>
        {barracas.map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
                <mesh position={[0, .45, 0]}><boxGeometry args={[1.8, .9, .9]} /><meshStandardMaterial color={P13.tabua} /></mesh>
                {[-.8, .8].map((dx) => <mesh key={dx} position={[dx, 1.1, -.35]}><boxGeometry args={[.08, 2.2, .08]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
                <mesh position={[0, 2.1, 0]} rotation={[-.35, 0, 0]}><boxGeometry args={[2, .05, 1.3]} /><meshStandardMaterial color={P13.escudo[i % 4]} /></mesh>
                {[-.5, 0, .5].map((dx, k) => <mesh key={dx} position={[dx, 1, .1]}><sphereGeometry args={[.13, 10, 8]} /><meshStandardMaterial color={['#c9442e', '#e0b155', '#6f9a4a'][k]} /></mesh>)}
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
    return <group ref={g}>
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
const Grama: React.FC = () => {
    const { geo, mat, n, mats } = useMemo(() => {
        const g = new THREE.PlaneGeometry(.06, .34, 1, 3); g.translate(0, .17, 0);
        const m = new THREE.MeshStandardMaterial({ color: '#7fae52', side: THREE.DoubleSide, roughness: .9 });
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uT = tempoGrama;
            sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.);
                float k = position.y / .34;
                transformed.x += sin(uT * 2.1 + wp.x * .7 + wp.z * .5) * .09 * k * k;
                transformed.z += cos(uT * 1.7 + wp.z * .6) * .05 * k * k;`);
        };
        let k = 23;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        const ms: THREE.Matrix4[] = [];
        const o = new THREE.Object3D();
        for (const il of ILHAS) {
            const qtd = Math.round(il.r * il.r * 9);
            for (let i = 0; i < qtd; i++) {
                const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * il.r * .97;
                if (d < il.r * .3 && rnd() < .8) continue;
                o.position.set(il.x + Math.cos(a) * d, il.y, il.z + Math.sin(a) * d);
                o.rotation.set(0, rnd() * Math.PI, (rnd() - .5) * .3);
                o.scale.set(1, .6 + rnd() * .9, 1);
                o.updateMatrix(); ms.push(o.matrix.clone());
            }
        }
        return { geo: g, mat: m, n: ms.length, mats: ms };
    }, []);
    const ref = useRef<THREE.InstancedMesh>(null);
    useEffect(() => { const m = ref.current; if (!m) return; mats.forEach((x, i) => m.setMatrixAt(i, x)); m.instanceMatrix.needsUpdate = true; }, [mats]);
    useFrame(({ clock }) => { tempoGrama.value = clock.elapsedTime; });
    return <instancedMesh ref={ref} args={[geo, mat, n]} frustumCulled={false} />;
};
/** Tochas nas bordas dos caminhos: chama em sprite, luz que tremula. */
const Tochas: React.FC = () => {
    const lugares = useMemo(() => [
        [3.5, 0, 17], [-3.5, 0, 17], [3, 0, -.5], [-3, 0, -.5], [2.6, 3, -12.8], [-2.6, 3, -12.8],
        [-15, 1, 6.5], [16, 2, 5], [0, 3, -18],
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
            <mesh ref={(m) => { chamas.current[i] = m; }} position={[0, 1.82, 0]}><coneGeometry args={[.09, .3, 8]} /><meshBasicMaterial color={new THREE.Color('#ffae45').multiplyScalar(2.2)} toneMapped={false} /></mesh>
            {i % 2 === 0 && <pointLight ref={(l) => { luzes.current[i] = l; }} position={[0, 1.9, 0]} color="#ff9a45" distance={6} intensity={2} />}
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
    return <group>
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
