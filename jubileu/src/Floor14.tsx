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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { alturaEm, regiaoEm, inclinacao, fbm, RAIO_DO_MUNDO } from './f14Terreno';

type Fase = 'chegada' | 'sufocando' | 'explorar' | 'fim';
interface Jog { x: number; y: number; z: number; andando: number; caido: number }

const FOLEGO_TOTAL = 30;
/** Obstáculos sólidos (pedras grandes, agulhas): preenchidos quando cada grupo é gerado. */
const SOLIDOS: { x: number; z: number; r: number }[] = [];
const CAPACETE = { x: 1.5, z: -7 };
const INICIO = { x: 0, z: 0 };

/** Onde a sombra aparece, em ordem. `foge` = distância em que ela some. */
const APARICOES: { x: number; z: number; foge: number; como: 'afunda' | 'poeira' | 'crista'; dica: string }[] = [
    { x: 6, z: -62, foge: 30, como: 'poeira', dica: 'Uma silhueta de pé nas dunas, ao norte.' },
    { x: 14, z: -128, foge: 34, como: 'crista', dica: 'Ela subiu a crista. As pegadas vão para o alto.' },
    { x: 150, z: -22, foge: 32, como: 'afunda', dica: 'Pegadas escuras descem para a bacia de sal, a leste.' },
    { x: -142, z: 34, foge: 36, como: 'poeira', dica: 'Lá em cima dos platôs, a oeste… ela está te esperando?' },
    { x: 20, z: 170, foge: 0, como: 'afunda', dica: 'As pegadas terminam na cratera ao sul.' },
];

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
function tocarSumico() {
    const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(48, t + 1.6);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .15); g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
    o.connect(g).connect(a.destination); o.start(); o.stop(t + 1.9);
}

// ── o chão ────────────────────────────────────────────────────────────────
const Terreno: React.FC = () => {
    const geo = useMemo(() => {
        const L = 640, N = 256, g = new THREE.PlaneGeometry(L, L, N, N);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position as THREE.BufferAttribute, cor = new Float32Array(p.count * 3);
        const c = new THREE.Color(), areia = new THREE.Color('#d08a4e'), ferrugem = new THREE.Color('#8f3f22'), sal = new THREE.Color('#ece5d6'),
            vidro = new THREE.Color('#5d4870'), rocha = new THREE.Color('#6e3626'), faixaA = new THREE.Color('#b8653a'), faixaB = new THREE.Color('#e0a565'), tmp = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i), h = alturaEm(x, z);
            p.setY(i, h);
            const r = regiaoEm(x, z), n = fbm(x * .05, z * .05, 3);
            c.copy(areia).lerp(ferrugem, Math.max(0, n - .4) * 1.6);
            if (r.platos > 0) c.lerp(tmp.copy(faixaA).lerp(faixaB, .5 + .5 * Math.sin(h * .55)), r.platos);
            const incl = inclinacao(x, z);
            c.lerp(rocha, Math.min(1, Math.max(r.crista * .7, incl * 1.1)));
            if (r.sal > 0) c.lerp(sal, r.sal * (.85 + n * .15));
            if (r.cratera > 0) c.lerp(vidro, r.cratera);
            cor[i * 3] = c.r; cor[i * 3 + 1] = c.g; cor[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
        g.computeVertexNormals();
        return g;
    }, []);
    return <mesh geometry={geo} receiveShadow><meshStandardMaterial vertexColors roughness={.95} metalness={0} /></mesh>;
};

/** Pedras e agulhas espalhadas (instanciadas), mais densas nas regiões rochosas. */
const Pedras: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const N = 420;
    useEffect(() => {
        const m = ref.current; if (!m) return;
        let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const o = new THREE.Object3D(); let k = 0;
        for (let i = 0; i < N * 3 && k < N; i++) {
            const a = rnd() * Math.PI * 2, r = 14 + Math.sqrt(rnd()) * (RAIO_DO_MUNDO - 40);
            const x = Math.cos(a) * r, z = Math.sin(a) * r, reg = regiaoEm(x, z);
            if (reg.sal > .3 || reg.cratera > .5) continue;
            if (rnd() > .25 + reg.crista + reg.platos) continue;
            const agulha = rnd() < .25 + reg.platos * .4;
            const esc = .6 + rnd() * (agulha ? 2.2 : 1.6);
            o.position.set(x, alturaEm(x, z) - .3, z);
            o.rotation.set(rnd() * .3, rnd() * 6.28, rnd() * .3);
            o.scale.set(esc, esc * (agulha ? 3.5 + rnd() * 3 : .7 + rnd() * .6), esc);
            if (esc > 1) SOLIDOS.push({ x, z, r: esc * .9 });
            o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
    }, []);
    return <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, N]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#7a3b26" roughness={.9} flatShading />
    </instancedMesh>;
};

/** O céu: gradiente alienígena, dois sóis e um planeta anelado. */
const Ceu: React.FC = () => {
    const mat = useMemo(() => new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { sol: { value: new THREE.Vector3(.55, .22, -.8).normalize() } },
        vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `varying vec3 v; uniform vec3 sol;
            void main(){
              float h = clamp(v.y, -.1, 1.);
              vec3 horiz = vec3(.96,.66,.48), meio = vec3(.55,.30,.50), topo = vec3(.07,.05,.16);
              vec3 c = mix(horiz, meio, smoothstep(0., .25, h)); c = mix(c, topo, smoothstep(.25, .9, h));
              float s = max(0., dot(v, sol)); c += vec3(1.,.75,.45) * (pow(s, 700.) * 3. + pow(s, 12.) * .35);
              vec3 sol2 = normalize(vec3(-.3,.12,-.95)); float s2 = max(0., dot(v, sol2)); c += vec3(.6,.85,1.) * (pow(s2, 1800.) * 2.5 + pow(s2, 40.) * .18);
              vec3 q = floor(v * 420.); float hs = fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453);
              c += vec3(.9,.95,1.) * step(.9965, hs) * smoothstep(.3, .8, h);          // estrelas de dia, no alto
              c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) - .5) * .006;   // dither (sem faixas)
              gl_FragColor = vec4(c, 1.);
            }`,
    }), []);
    return <group>
        <mesh material={mat}><sphereGeometry args={[900, 32, 16]} /></mesh>
        {/* o planeta anelado no céu */}
        <group position={[-260, 330, -620]} rotation={[.35, 0, -.4]}>
            <mesh><sphereGeometry args={[70, 32, 16]} /><meshBasicMaterial color="#c9a6d6" fog={false} /></mesh>
            <mesh position={[-14, 6, 30]}><sphereGeometry args={[66, 32, 16]} /><meshBasicMaterial color="#5a4380" transparent opacity={.55} fog={false} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[95, 150, 64]} /><meshBasicMaterial color="#e9d4c0" side={THREE.DoubleSide} transparent opacity={.55} fog={false} /></mesh>
        </group>
    </group>;
};

/** O sol acompanha o hóspede: sombra nítida só perto dele (sem a caixa de sombra aparecendo no chão). */
const SolQueSegue: React.FC<{ jog: React.MutableRefObject<Jog> }> = ({ jog }) => {
    const luz = useRef<THREE.DirectionalLight>(null);
    useEffect(() => {
        const l = luz.current; if (!l) return;
        const c = l.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 500; c.updateProjectionMatrix();
        l.shadow.bias = -.0004; l.shadow.normalBias = .04;
    }, []);
    useFrame(() => {
        const l = luz.current; if (!l) return; const j = jog.current;
        const sx = Math.round(j.x / .5) * .5, sz = Math.round(j.z / .5) * .5;   // passo de texel: a sombra não treme
        l.position.set(sx + 180, j.y + 110, sz - 260); l.target.position.set(sx, j.y, sz); l.target.updateMatrixWorld();
    });
    return <directionalLight ref={luz} intensity={2.4} color="#ffd2a0" castShadow shadow-mapSize={[2048, 2048]} />;
};

/** Cristais de quartzo azul-petróleo brotando da areia (o primeiro sinal de "isto não é a Terra"). */
const Cristais: React.FC = () => {
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
                const x = cx + (rnd() - .5) * 5, z = cz + (rnd() - .5) * 5, e = .8 + rnd() * 1.6;
                o.position.set(x, alturaEm(x, z) - .1, z); o.rotation.set((rnd() - .5) * .9, rnd() * 6.28, (rnd() - .5) * .9);
                o.scale.set(e, e * (2 + rnd() * 3), e); o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
            }
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
    }, []);
    return <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, N]} castShadow>
        <octahedronGeometry args={[.5, 0]} /><meshStandardMaterial color="#2fe0b0" emissive="#0fff80" emissiveIntensity={.75} roughness={.15} metalness={.1} transparent opacity={.9} flatShading />
    </instancedMesh>;
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
    const base = useMemo(() => ({ duna: new THREE.Color('#e3a07a'), sal: new THREE.Color('#efe2d2'), crat: new THREE.Color('#7d5a8e'), crista: new THREE.Color('#c27a68'), alvo: new THREE.Color() }), []);
    useFrame((_, dt) => {
        const f = scene.fog as THREE.Fog | null; if (!f) return; const j = jog.current, r = regiaoEm(j.x, j.z);
        base.alvo.copy(base.duna).lerp(base.crista, r.crista * .7).lerp(base.sal, r.sal).lerp(base.crat, r.cratera);
        f.color.lerp(base.alvo, 1 - Math.exp(-dt * 1.5));
        f.far += ((r.cratera > .3 ? 220 : 380) - f.far) * (1 - Math.exp(-dt));
    });
    return null;
};

/** Agulhas de basalto (12–20 m) nas regiões rochosas: dão escala e silhueta. */
const Agulhas: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null); const N = 70;
    useEffect(() => {
        const m = ref.current; if (!m) return;
        let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const o = new THREE.Object3D(), ps: [number, number][] = []; let k = 0;
        for (let t = 0; t < 4000 && k < N; t++) {
            const x = (rnd() - .5) * 2 * (RAIO_DO_MUNDO - 50), z = (rnd() - .5) * 2 * (RAIO_DO_MUNDO - 50), r = regiaoEm(x, z);
            if (Math.hypot(x, z) < 35 || r.sal > .2 || r.cratera > .2) continue;
            if (rnd() > .08 + r.platos * .6 + r.crista * .5) continue;
            if (ps.some(([px, pz]) => Math.hypot(px - x, pz - z) < 14)) continue;   // disco de Poisson
            ps.push([x, z]);
            const h = 12 + rnd() * 9, b = 2.2 + rnd() * 1.5;
            o.position.set(x, alturaEm(x, z) + h / 2 - 1, z); o.rotation.set((rnd() - .5) * .12, rnd() * 6.28, (rnd() - .5) * .12);
            SOLIDOS.push({ x, z, r: b * .45 });
            o.scale.set(b, h, b); o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
        }
        m.count = k; m.instanceMatrix.needsUpdate = true;
    }, []);
    return <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, N]} castShadow receiveShadow>
        <coneGeometry args={[.5, 1, 6, 3]} /><meshStandardMaterial color="#3a2026" roughness={.85} flatShading />
    </instancedMesh>;
};

/** Arcos de erosão na borda da bacia de sal. */
const Arcos: React.FC = () => <group>
    {[[0.4, 64, 13], [1.6, 60, 9], [2.9, 66, 11], [4.4, 62, 15]].map(([a, r, e], i) => {
        const x = 150 + Math.cos(a) * r, z = -20 + Math.sin(a) * r;
        return <mesh key={i} position={[x, alturaEm(x, z) - 1, z]} rotation={[0, a + Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[e, e * .22, 8, 20, Math.PI]} /><meshStandardMaterial color="#9c4a2c" roughness={.9} flatShading /></mesh>;
    })}
</group>;

/** Um monólito negro no alto da crista: dá escala e aponta o caminho. */
const Monolito: React.FC = () => {
    const x = 14, z = -150, y = alturaEm(x, z);
    return <mesh position={[x, y + 8, z]} rotation={[0, .4, .05]} castShadow><boxGeometry args={[3, 18, 1.2]} /><meshStandardMaterial color="#1a1018" roughness={.35} metalness={.6} /></mesh>;
};

// ── o capacete de madeira ─────────────────────────────────────────────────
function texturaTabuas(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8b5a2b'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#7a4c22' : '#9a6634'; g.fillRect(i * 32, 0, 30, 128);
        g.strokeStyle = 'rgba(40,20,8,.6)'; g.lineWidth = 2; g.strokeRect(i * 32, 0, 32, 128);
        for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(60,30,10,.35)'; g.beginPath(); g.moveTo(i * 32 + 4 + k * 4, 0); g.bezierCurveTo(i * 32 + 10 + k * 3, 40, i * 32 + k * 4, 90, i * 32 + 6 + k * 4, 128); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const Capacete: React.FC<{ visivel: boolean }> = ({ visivel }) => {
    const tab = useMemo(texturaTabuas, []);
    const g = useRef<THREE.Group>(null);
    useFrame(({ clock }) => { if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * .4) * .15 + .6; });
    const y = alturaEm(CAPACETE.x, CAPACETE.z);
    return <group ref={g} position={[CAPACETE.x, y + .28, CAPACETE.z]} rotation={[0, .6, .25]} visible={visivel}>
        <mesh castShadow><sphereGeometry args={[.36, 24, 16, 0, Math.PI * 2, 0, Math.PI * .62]} /><meshStandardMaterial map={tab} roughness={.8} /></mesh>
        <mesh position={[0, -.1, 0]} castShadow><cylinderGeometry args={[.33, .35, .22, 24, 1, true]} /><meshStandardMaterial map={tab} roughness={.8} side={THREE.DoubleSide} /></mesh>
        {/* a escotilha de latão com vidro */}
        <mesh position={[0, -.02, .33]}><torusGeometry args={[.15, .03, 10, 28]} /><meshStandardMaterial color="#c9a043" metalness={.85} roughness={.3} /></mesh>
        <mesh position={[0, -.02, .325]}><circleGeometry args={[.15, 28]} /><meshStandardMaterial color="#9fd8d0" transparent opacity={.55} metalness={.2} roughness={.05} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[Math.cos(i * 1.047) * .15, -.02 + Math.sin(i * 1.047) * .15, .36]}><sphereGeometry args={[.018, 8, 6]} /><meshStandardMaterial color="#e0c060" metalness={.9} roughness={.3} /></mesh>)}
        {/* a mangueira de ar, de couro, enterrada na areia */}
        <mesh position={[.3, -.25, -.1]} rotation={[0, 0, 1.2]}><torusGeometry args={[.22, .035, 8, 20, Math.PI]} /><meshStandardMaterial color="#3a2a1c" roughness={.9} /></mesh>
        <pointLight position={[0, .5, .4]} color="#ffcf80" intensity={visivel ? 1.2 : 0} distance={3} />
    </group>;
};

// ── a ENTIDADE: uma sombra de pé ──────────────────────────────────────────
interface EstadoSombra { i: number; fugindo: number; visto: boolean }
const Sombra: React.FC<{ estado: React.MutableRefObject<EstadoSombra>; jog: React.MutableRefObject<Jog>; ativa: boolean; aoFugir: (i: number) => void; aoAlcancar: () => void }> = ({ estado, jog, ativa, aoFugir, aoAlcancar }) => {
    const g = useRef<THREE.Group>(null), corpo = useRef<THREE.MeshBasicMaterial>(null);
    const fiapos = useRef<THREE.InstancedMesh>(null);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(({ clock, camera }, dt) => {
        const s = estado.current, a = APARICOES[s.i], gr = g.current; if (!gr) return;
        const t = clock.elapsedTime;
        const j = jog.current, d = Math.hypot(j.x - a.x, j.z - a.z);
        let x = a.x, z = a.z, y = alturaEm(a.x, a.z), opac = 1, esc = 1;
        if (ativa && s.fugindo === 0) {
            if (a.foge > 0 && d < a.foge) { s.fugindo = .0001; tocarSumico(); }
            else if (a.foge === 0 && d < 5) aoAlcancar();
        }
        if (s.fugindo > 0) {
            s.fugindo += dt;
            const k = Math.min(1, s.fugindo / 1.6);
            const dx = a.x - j.x, dz = a.z - j.z, dn = Math.hypot(dx, dz) || 1;
            if (a.como === 'afunda') y -= k * k * 3.2;
            else if (a.como === 'crista') { x += dx / dn * k * 14; z += dz / dn * k * 14; y = alturaEm(x, z) + k * 2; opac = 1 - k; }
            else { opac = 1 - k; esc = 1 + k * .6; }
            if (s.fugindo > 1.7) { const anterior = s.i; s.i = Math.min(APARICOES.length - 1, s.i + 1); s.fugindo = 0; aoFugir(anterior); }
        }
        gr.position.set(x, y, z);
        // vira-se para o hóspede (só o corpo, sem rosto)
        gr.rotation.y = Math.atan2(j.x - x, j.z - z);
        gr.scale.setScalar(esc * 1.8);
        gr.visible = ativa;
        if (corpo.current) corpo.current.opacity = opac * (.88 + Math.sin(t * 13) * .04 + (Math.random() < .02 ? -.4 : 0));
        // fiapos de fumaça escura subindo do contorno
        const f = fiapos.current;
        if (f) {
            for (let i = 0; i < 24; i++) {
                const u = (t * .35 + i / 24) % 1, an = i * 2.4;
                o.position.set(Math.cos(an) * .35 * (1 + u), u * 3.2, Math.sin(an) * .2 * (1 + u));
                o.scale.setScalar((.18 + u * .25) * (1 - u) * opac * esc); o.updateMatrix(); f.setMatrixAt(i, o.matrix);
            }
            f.instanceMatrix.needsUpdate = true;
        }
        s.visto = new THREE.Vector3(x, y + 1.5, z).project(camera).z < 1;
    });
    return <group ref={g}>
        {/* silhueta alta e magra: tronco, ombros caídos, cabeça sem rosto */}
        <mesh position={[0, 1.15, 0]}><capsuleGeometry args={[.28, 1.4, 4, 10]} /><meshBasicMaterial ref={corpo} color="#050307" transparent depthWrite={false} /></mesh>
        <mesh position={[0, 2.25, 0]}><sphereGeometry args={[.22, 14, 10]} /><meshBasicMaterial color="#050307" /></mesh>
        <mesh position={[-.42, 1.3, 0]} rotation={[0, 0, .12]}><capsuleGeometry args={[.07, 1.1, 3, 6]} /><meshBasicMaterial color="#050307" /></mesh>
        <mesh position={[.42, 1.3, 0]} rotation={[0, 0, -.12]}><capsuleGeometry args={[.07, 1.1, 3, 6]} /><meshBasicMaterial color="#050307" /></mesh>
        {/* a sombra no chão, comprida, apontando para longe do sol */}
        <mesh position={[-1.6, .05, 1.6]} rotation={[-Math.PI / 2, 0, -.8]}><planeGeometry args={[.7, 4.5]} /><meshBasicMaterial color="#000" transparent opacity={.35} depthWrite={false} /></mesh>
        <instancedMesh ref={fiapos} frustumCulled={false} args={[undefined, undefined, 24]}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#0a0610" transparent opacity={.5} depthWrite={false} /></instancedMesh>
    </group>;
};

/** Pegadas escuras da aparição anterior até a próxima (a trilha da caça). */
const Pegadas: React.FC<{ ate: number }> = ({ ate }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const pontos = useMemo(() => {
        const ps: [number, number, number][] = [];
        for (let i = 0; i < ate && i < APARICOES.length - 1; i++) {
            const a = APARICOES[i], b = APARICOES[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(L / 3.2), ang = Math.atan2(b.x - a.x, b.z - a.z);
            for (let k = 1; k < n; k++) {
                const u = k / n, lado = k % 2 ? .25 : -.25, x = a.x + (b.x - a.x) * u + Math.cos(ang) * lado, z = a.z + (b.z - a.z) * u - Math.sin(ang) * lado;
                ps.push([x, z, ang]);
            }
        }
        return ps;
    }, [ate]);
    useEffect(() => {
        const m = ref.current; if (!m) return; const o = new THREE.Object3D();
        pontos.forEach(([x, z, a], i) => { o.position.set(x, alturaEm(x, z) + .04, z); o.rotation.set(-Math.PI / 2, 0, a); o.scale.set(1, 1, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.count = pontos.length; m.instanceMatrix.needsUpdate = true;
    }, [pontos]);
    return <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, 600]}><circleGeometry args={[.16, 8]} /><meshBasicMaterial color="#120a10" transparent opacity={.7} depthWrite={false} /></instancedMesh>;
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
        j.y += (alturaEm(j.x, j.z) - j.y) * Math.min(1, dt * 12);
        if (j.caido > 0) j.caido = Math.max(0, j.caido - dt * .5);
        passo.current += dt * j.andando * (fase === 'sufocando' ? 5 : 8);
        const bob = Math.sin(passo.current) * .05 * j.andando;
        const cambaleio = fase === 'sufocando' ? Math.sin(performance.now() * .0017) * .05 * (1 - folego.current / FOLEGO_TOTAL) : 0;
        const altura = 1.68 - j.caido * 1.3;
        camera.position.set(j.x, j.y + altura + bob, j.z);
        camera.rotation.set(0, 0, 0, 'YXZ');
        camera.rotation.y = yaw.current; camera.rotation.x = pitch.current - j.caido * .6; camera.rotation.z = cambaleio + Math.cos(passo.current * .5) * .012 * j.andando;
    });
    return null;
};

export default function Floor14({ onExit }: { onExit: () => void }) {
    const [fase, setFase] = useState<Fase>('chegada');
    const jog = useRef<Jog>({ x: INICIO.x, y: alturaEm(0, 0), z: INICIO.z, andando: 0, caido: 1 });
    const entrada = useRef({ x: 0, z: 0 }), yaw = useRef(0), pitch = useRef(-.18);
    const folego = useRef(FOLEGO_TOTAL);
    const [folegoUi, setFolegoUi] = useState(FOLEGO_TOTAL);
    const [perto, setPerto] = useState(false);
    const [dica, setDica] = useState<string | null>(null);
    const [vistas, setVistas] = useState(0);
    const [desmaios, setDesmaios] = useState(0);
    const sombra = useRef<EstadoSombra>({ i: 0, fugindo: 0, visto: false });
    const [fim, setFim] = useState(0);
    const video = useRef<HTMLVideoElement>(null);

    // ── chegada: o vídeo (se existir), pulável; senão vai direto ──
    useEffect(() => {
        if (fase !== 'chegada') return;
        const v = video.current;
        const seguir = () => { setFase('sufocando'); jog.current.caido = 1; };
        if (!v) { seguir(); return; }
        v.play().catch(() => seguir());
        v.onended = seguir; v.onerror = seguir;
        const pular = (ev: Event) => { if (ev instanceof KeyboardEvent && !['Escape', ' ', 'Enter'].includes(ev.key)) return; seguir(); };
        window.addEventListener('keydown', pular); v.addEventListener('pointerdown', pular);
        return () => { window.removeEventListener('keydown', pular); v.removeEventListener('pointerdown', pular); };
    }, [fase]);

    // ── o fôlego acabando ──
    useEffect(() => {
        if (fase !== 'sufocando') return;
        tocarVento();
        let ultimo = performance.now(), proxArfar = 0, raf = 0;
        const tick = (agora: number) => {
            const dt = Math.min(.1, (agora - ultimo) / 1000); ultimo = agora;
            folego.current = Math.max(0, folego.current - dt);
            setFolegoUi(folego.current);
            const j = jog.current;
            setPerto(Math.hypot(j.x - CAPACETE.x, j.z - CAPACETE.z) < 2.6);
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
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);
    const acaoRef = useRef(vestir); acaoRef.current = vestir;
    // bancada: mexer no hóspede e na fase pelo console / Playwright
    if (import.meta.env.DEV) (window as unknown as { __f14: unknown }).__f14 = { jog, yaw, pitch, sombra, vestir: () => { tocarCapacete(); setFase('explorar'); }, fase };
    const toque = useRef<{ id: number | null; ox: number; oy: number; cam: number | null; cx: number; cy: number }>({ id: null, ox: 0, oy: 0, cam: null, cx: 0, cy: 0 });
    const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
    const onDown = (ev: React.PointerEvent) => {
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
                dpr={[1, 1.5]} shadows camera={{ fov: 72, near: .1, far: 2000 }} gl={{ antialias: true }}>
                <fog attach="fog" args={['#e3a07a', 45, 380]} />
                <NevoaPorRegiao jog={jog} />
                <hemisphereLight args={['#e7c2ea', '#6a3557', 1.5]} />
                <SolQueSegue jog={jog} />
                <directionalLight position={[-120, 50, -400]} intensity={.35} color="#9ad0ff" />
                <Ceu />
                <Terreno />
                <Pedras />
                <Cristais />
                <Ossada />
                <Monolito />
                <Agulhas />
                <Arcos />
                <Capacete visivel={!comCapacete} />
                <Pegadas ate={vistas} />
                <Sombra estado={sombra} jog={jog} ativa={comCapacete} aoFugir={aoFugir} aoAlcancar={aoAlcancar} />
                <Corpo jog={jog} entrada={entrada} yaw={yaw} pitch={pitch} fase={fase} folego={folego} />
            </Canvas>

            {/* sufocando: as bordas escurecem e pulsam em vermelho */}
            {fase === 'sufocando' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse at center, transparent ${55 - falta * 35}%, rgba(90,0,10,${.35 + falta * .5}) 100%)`,
                opacity: .8 + Math.sin(performance.now() * .006) * .2 }} />}
            {/* com o capacete: a escotilha de latão e a borda de madeira */}
            {comCapacete && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 70% 78% at center, transparent 90%, #e3bd62 91.2%, #8a5d22 92.6%, #3a2210 94.5%, #140a04 100%)' }} />}
            {comCapacete && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(120deg, rgba(255,255,255,.07) 0%, transparent 30%, transparent 70%, rgba(255,255,255,.04) 100%)' }} />}

            {/* HUD */}
            {fase === 'sufocando' && <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', color: '#ffe6d0', fontFamily: 'Georgia, serif', textShadow: '0 2px 6px #000', pointerEvents: 'none' }}>
                <div style={{ fontSize: 15, letterSpacing: 2 }}>NÃO HÁ AR</div>
                <div style={{ width: 220, height: 10, marginTop: 6, border: '2px solid #ffe6d0', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(folegoUi / FOLEGO_TOTAL) * 100}%`, height: '100%', background: folegoUi < 8 ? '#e2412e' : '#f2c46a' }} />
                </div>
                <div style={{ fontSize: 13, marginTop: 6, opacity: .85 }}>{desmaios ? 'Você apagou… Ali, meio enterrado: um capacete.' : 'Algo brilha na areia, logo à frente.'}</div>
            </div>}
            {perto && fase === 'sufocando' && <button onPointerDown={(e) => { e.stopPropagation(); vestir(); }}
                style={{ position: 'absolute', bottom: 40, right: 40, padding: '16px 26px', fontSize: 18, fontFamily: 'Georgia, serif', background: '#f2c46a', color: '#2a1408', border: '3px solid #2a1408', borderRadius: 14 }}>
                VESTIR O CAPACETE (E)
            </button>}
            {dica && <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', maxWidth: '80vw', padding: '10px 18px', background: 'rgba(20,10,16,.72)', color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 16, borderRadius: 10, pointerEvents: 'none' }}>{dica}</div>}
            {comCapacete && <div style={{ position: 'absolute', top: 14, right: 18, color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 14, textShadow: '0 1px 4px #000', pointerEvents: 'none' }}>A sombra · {vistas}/{APARICOES.length - 1} rastros</div>}
            {stick && <div style={{ position: 'absolute', left: stick.ox - 60, top: stick.oy - 60, width: 120, height: 120, borderRadius: '50%', border: '2px solid rgba(255,240,220,.5)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 44 + stick.x, top: 44 + stick.y, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,240,220,.6)' }} /></div>}

            {/* a chegada: vídeo pré-renderizado (Blender + Manim + Remotion) */}
            {fase === 'chegada' && <video ref={video} src="/chegada-14.mp4" playsInline muted={false} preload="auto"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />}
            {fase === 'fim' && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fim, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#f6e2cc', fontFamily: 'Georgia, serif', fontSize: 22, opacity: Math.min(1, fim * 2) }}>Ela se vira. Não tem rosto. E agora não foge mais.</div></div>}
        </div>
    );
}
