/**
 * f14Lab.tsx — o LABORATÓRIO debaixo da cratera de Kessar-9.
 *
 * Fases: 'quem' (ela conta quem é) → 'receita' (o pedido) → 'bancada' (o puzzle) →
 * 'arremesso' (cutscene: o béquer voa e se quebra no chão; o chão "esquece" e abre um portal) →
 * 'despedida' (o pedido final) → 'mergulho' (a câmera entra no portal) → aoFim.
 *
 * O PUZZLE (mistura anti-simulação): três reagentes, cada dose soma às três barras da assinatura.
 *   Ferrugem Fria (2,0,1) · Sal de Eco (0,2,1) · Vidro Líquido (1,1,0). Alvo: (4,6,3).
 *   Única solução: 1 Ferrugem, 2 Sal, 2 Vidro (em qualquer ordem). Passou de alguma barra → instável:
 *   esvaziar e recomeçar. Depois, aquecer até a faixa violeta (70–80 °C; acima de 90 é "fogo comum") e agitar.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { FiguraDaEntidade, visualPadrao, type VisualEntidade } from './f14Entidade';
import { Dialogo } from './f14Dialogo';
import { LAB_QUEM, LAB_RECEITA, LAB_REACOES, DESPEDIDA } from './f14Lore';

export const REAGENTES = [
    { id: 'ferrugem', nome: 'Ferrugem Fria', cor: '#c4572e', soma: [2, 0, 1] },
    { id: 'sal', nome: 'Sal de Eco', cor: '#6fd3e8', soma: [0, 2, 1] },
    { id: 'vidro', nome: 'Vidro Líquido', cor: '#a77bff', soma: [1, 1, 0] },
] as const;
export const ALVO = [4, 6, 3] as const;
const FAIXA = [70, 80] as const, QUENTE = 90;
const CORES_BARRA = ['#ff8a5c', '#7fe0f0', '#c39bff'];

/** Estado da bancada (puro: fácil de testar). */
export interface Bancada { barras: number[]; doses: number[]; temp: number; agitado: boolean }
export const bancadaVazia = (): Bancada => ({ barras: [0, 0, 0], doses: [0, 0, 0], temp: 24, agitado: false });
export function despejar(b: Bancada, r: number): Bancada {
    const s = REAGENTES[r].soma;
    return { ...b, barras: b.barras.map((v, i) => v + s[i]), doses: b.doses.map((v, i) => v + (i === r ? 1 : 0)) };
}
export const passou = (b: Bancada) => b.barras.some((v, i) => v > ALVO[i]);
export const bateu = (b: Bancada) => b.barras.every((v, i) => v === ALVO[i]);
export const naFaixa = (b: Bancada) => b.temp >= FAIXA[0] && b.temp <= FAIXA[1];

type Fase = 'quem' | 'receita' | 'bancada' | 'arremesso' | 'despedida' | 'mergulho';

// ── som (sintetizado) ──
let ac: AudioContext | null = null;
function som(tipo: 'glub' | 'clique' | 'quebra' | 'portal' | 'erro') {
    try {
        ac = ac ?? new AudioContext(); const c = ac, t = c.currentTime, g = c.createGain(); g.connect(c.destination);
        if (tipo === 'glub' || tipo === 'clique' || tipo === 'erro') {
            const o = c.createOscillator(); o.type = tipo === 'erro' ? 'sawtooth' : 'sine';
            const f0 = tipo === 'glub' ? 380 : tipo === 'clique' ? 1400 : 160;
            o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(tipo === 'glub' ? 140 : f0 * .7, t + .18);
            g.gain.setValueAtTime(tipo === 'clique' ? .05 : .12, t); g.gain.exponentialRampToValueAtTime(.001, t + (tipo === 'erro' ? .5 : .22));
            o.connect(g); o.start(t); o.stop(t + .6);
        } else {
            const n = c.createBufferSource(), len = tipo === 'quebra' ? .5 : 3, b = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = b.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (tipo === 'quebra' ? Math.exp(-i / d.length * 9) : Math.sin(Math.PI * i / d.length));
            n.buffer = b; const f = c.createBiquadFilter(); f.type = tipo === 'quebra' ? 'highpass' : 'lowpass'; f.frequency.value = tipo === 'quebra' ? 2200 : 500;
            g.gain.value = tipo === 'quebra' ? .3 : .25; n.connect(f).connect(g); n.start(t);
            if (tipo === 'portal') { const o = c.createOscillator(); o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(220, t + 3); const g2 = c.createGain(); g2.gain.setValueAtTime(.0, t); g2.gain.linearRampToValueAtTime(.12, t + 1); g2.gain.linearRampToValueAtTime(0, t + 3); o.connect(g2).connect(c.destination); o.start(t); o.stop(t + 3.1); }
        }
    } catch { /* mudo */ }
}

// ── a sala ──
const Sala: React.FC = () => {
    const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: .55, metalness: .7 }), []);
    const parede = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4452', roughness: .85 }), []);
    const tampo = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: .3, metalness: .4 }), []);
    useEffect(() => () => { metal.dispose(); parede.dispose(); tampo.dispose(); }, [metal, parede, tampo]);
    return <group>
        {/* chão de placas e paredes de rocha da cratera revestidas */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[14, 14]} /><meshStandardMaterial color="#3a3840" roughness={.55} metalness={.3} /></mesh>
        {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[-7 + i * 2.33, .002, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.02, 14]} /><meshBasicMaterial color="#0d0c10" /></mesh>)}
        <mesh position={[0, 3, -5]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[6, 3, 0]} rotation={[0, Math.PI / 2, 0]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[14, 14]} /><meshStandardMaterial color="#141317" side={THREE.DoubleSide} /></mesh>
        {/* luminárias e fitas violeta */}
        {[-3, 0, 3].map((x) => <mesh key={x} position={[x, 5.9, -1]}><boxGeometry args={[1.6, .05, .25]} /><meshBasicMaterial color="#dfe8ff" /></mesh>)}
        {[-5.8, 5.8].map((x) => <mesh key={x} position={[x, 1.2, -1]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[9, .04, .04]} /><meshBasicMaterial color="#8a5cff" /></mesh>)}
        {/* bancada */}
        <mesh position={[0, .9, -1.2]} material={tampo} castShadow receiveShadow><boxGeometry args={[3.4, .08, 1.1]} /></mesh>
        {[[-1.6, -.7], [1.6, -.7], [-1.6, -1.7], [1.6, -1.7]].map(([x, z], i) => <mesh key={i} position={[x, .45, z]} material={metal}><boxGeometry args={[.06, .9, .06]} /></mesh>)}
        {/* estantes com vidraria no fundo, máquinas, tubos */}
        {[-3.8, 3.8].map((x) => <group key={x} position={[x, 0, -4.4]}>
            {[.8, 1.7, 2.6].map((y) => <mesh key={y} position={[0, y, 0]} material={metal}><boxGeometry args={[1.8, .05, .5]} /></mesh>)}
            {[.8, 1.7, 2.6].flatMap((y) => [-.6, -.2, .2, .6].map((dx) => <mesh key={`${y}${dx}`} position={[dx, y + .17, 0]}><cylinderGeometry args={[.07, .09, .3, 10]} /><meshStandardMaterial color={['#5fd3c4', '#c46b3a', '#9a7bff', '#d8d8d0'][Math.abs(Math.round(dx * 5 + y)) % 4]} transparent opacity={.75} roughness={.1} /></mesh>))}
        </group>)}
        <mesh position={[-2.5, 1.2, -4.5]} material={metal}><boxGeometry args={[1, 2.4, .8]} /></mesh>
        <mesh position={[-2.5, 1.7, -4.08]}><planeGeometry args={[.7, .4]} /><meshBasicMaterial color="#47ff9a" /></mesh>
        {[-4.8, -4.6, 4.6, 4.8].map((x) => <mesh key={x} position={[x, 3, -4.6]} material={metal}><cylinderGeometry args={[.06, .06, 6, 8]} /></mesh>)}
    </group>;
};

/** Frasco clicável na bancada. */
const Frasco: React.FC<{ x: number; cor: string; ativo: boolean; aoTocar: () => void; pulso: number }> = ({ x, cor, ativo, aoTocar, pulso }) => {
    const g = useRef<THREE.Group>(null), [sobre, setSobre] = useState(false);
    useFrame(() => { if (g.current) { const k = Math.max(0, 1 - (performance.now() - pulso) / 400); g.current.position.y = .94 + (sobre ? .05 : 0) + Math.sin(k * Math.PI) * .12; g.current.rotation.z = k * .9; } });
    return <group ref={g} position={[x, .94, -1.05]} onPointerOver={(e) => { e.stopPropagation(); if (ativo) setSobre(true); }} onPointerOut={() => setSobre(false)}
        onPointerDown={(e) => { e.stopPropagation(); if (ativo) aoTocar(); }}>
        <mesh position={[0, .2, 0]}><cylinderGeometry args={[.12, .14, .4, 20]} /><meshPhysicalMaterial color="#e8f2ff" transparent opacity={.28} roughness={.05} clearcoat={1} /></mesh>
        <mesh position={[0, .14, 0]}><cylinderGeometry args={[.115, .135, .26, 20]} /><meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={sobre ? 1.2 : .55} roughness={.2} /></mesh>
        <mesh position={[0, .45, 0]}><cylinderGeometry args={[.04, .05, .12, 10]} /><meshStandardMaterial color="#5a4630" roughness={.8} /></mesh>
        <pointLight color={cor} intensity={sobre ? 1.2 : .5} distance={1.4} position={[0, .25, .1]} />
    </group>;
};

/** O béquer no aquecedor: o líquido sobe e mistura as cores; borrado quando pronto (a simulação não desenha). */
const Bequer: React.FC<{ b: Bancada; voando: number }> = ({ b, voando }) => {
    const g = useRef<THREE.Group>(null), liq = useRef<THREE.Mesh>(null), mat = useRef<THREE.MeshStandardMaterial>(null), halo = useRef<THREE.Mesh>(null);
    const total = b.doses.reduce((a, c) => a + c, 0);
    const cor = useMemo(() => {
        if (!total) return new THREE.Color('#222');
        if (bateu(b)) return new THREE.Color('#9b6cff');   // a assinatura certa: violeta profundo
        if (passou(b)) return new THREE.Color('#5a3a2a');  // instável: turvo
        const c = new THREE.Color(0, 0, 0);
        REAGENTES.forEach((r, i) => c.add(new THREE.Color(r.cor).multiplyScalar(b.doses[i] / total)));
        return c;
    }, [b, total]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (liq.current) { const h = Math.min(1, total / 6); liq.current.scale.set(1, Math.max(.01, h), 1); liq.current.position.y = .04 + .17 * h; }
        if (mat.current) { mat.current.color.copy(cor); mat.current.emissive.copy(cor); mat.current.emissiveIntensity = .4 + (b.temp - 24) / 80 + (b.agitado ? Math.sin(t * 9) * .4 + .6 : 0); }
        if (halo.current) { halo.current.visible = b.agitado; halo.current.scale.setScalar(1 + Math.sin(t * 13) * .08); (halo.current.material as THREE.MeshBasicMaterial).opacity = .25 + Math.sin(t * 7) * .1; }
        if (g.current && voando > 0) {   // o arremesso: arco até o chão à frente
            const k = Math.min(1, (performance.now() - voando) / 900);
            g.current.position.set(THREE.MathUtils.lerp(.0, .2, k), THREE.MathUtils.lerp(.95, 0, k) + Math.sin(k * Math.PI) * 1.1, THREE.MathUtils.lerp(-1.05, 1.6, k));
            g.current.rotation.set(k * 7, 0, k * 3); g.current.visible = k < 1;
        }
    });
    return <group ref={g} position={[0, .95, -1.05]}>
        <mesh position={[0, .22, 0]}><cylinderGeometry args={[.16, .16, .44, 24, 1, true]} /><meshPhysicalMaterial color="#eef6ff" transparent opacity={.22} roughness={.04} clearcoat={1} side={THREE.DoubleSide} /></mesh>
        <mesh ref={liq} position={[0, .04, 0]}><cylinderGeometry args={[.15, .15, .34, 24]} /><meshStandardMaterial ref={mat} color="#222" roughness={.15} transparent opacity={.92} /></mesh>
        <mesh ref={halo} position={[0, .25, 0]} visible={false}><sphereGeometry args={[.32, 20, 14]} /><meshBasicMaterial color="#b28cff" transparent opacity={.3} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    </group>;
};

/** O aquecedor sob o béquer (o anel acende conforme a temperatura). */
const Aquecedor: React.FC<{ temp: number }> = ({ temp }) => {
    const k = Math.min(1, Math.max(0, (temp - 24) / 80));
    return <group position={[0, .94, -1.05]}>
        <mesh><cylinderGeometry args={[.24, .26, .06, 24]} /><meshStandardMaterial color="#2c2e33" metalness={.8} roughness={.4} /></mesh>
        <mesh position={[0, .032, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.1, .2, 32]} /><meshBasicMaterial color={new THREE.Color('#301008').lerp(new THREE.Color('#ff6a20'), k)} /></mesh>
    </group>;
};

/** O portal: um disco no chão onde o chão "esquece" — anéis violeta girando e, no fundo, a luz quente do elevador. */
const Portal: React.FC<{ desde: number }> = ({ desde }) => {
    const g = useRef<THREE.Group>(null);
    const mat = useMemo(() => new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { t: { value: 0 }, abre: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: `varying vec2 vUv; uniform float t, abre;
        void main(){ vec2 p = vUv - .5; float r = length(p) * 2., a = atan(p.y, p.x);
          float espiral = sin(a * 5. + r * 14. - t * 4.) * .5 + .5;
          vec3 fundo = mix(vec3(1., .78, .42), vec3(.35, .18, .7), smoothstep(.0, .75, r));   // a luz do elevador no centro
          vec3 c = mix(fundo, vec3(.62, .4, 1.), espiral * smoothstep(.2, .9, r) * .7);
          float borda = smoothstep(abre, abre - .08, r);
          c += vec3(.8, .6, 1.) * smoothstep(.06, 0., abs(r - abre + .03)) * 1.5;
          gl_FragColor = vec4(c, borda); }`,
    }), []);
    useEffect(() => () => mat.dispose(), [mat]);
    useFrame(({ clock }) => { mat.uniforms.t.value = clock.elapsedTime; mat.uniforms.abre.value = Math.min(1, Math.max(0, (performance.now() - desde) / 2200)); if (g.current) g.current.visible = desde > 0; });
    return <group ref={g} position={[.2, .01, 1.6]} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}><circleGeometry args={[1.4, 64]} /></mesh>
        <pointLight color="#c9a0ff" intensity={6} distance={6} position={[0, .4, 0]} />
    </group>;
};

/** Câmera: em pé diante da bancada; arrastar gira um pouco; nas cutscenes, segue o roteiro. */
const Olhos: React.FC<{ fase: Fase; arremesso: number; giro: React.MutableRefObject<{ x: number; y: number }> }> = ({ fase, arremesso, giro }) => {
    const { camera } = useThree(), alvo = useMemo(() => new THREE.Vector3(), []), pos = useMemo(() => new THREE.Vector3(), []);
    const inicio = useRef(performance.now());
    useEffect(() => { inicio.current = performance.now(); }, [fase]);
    useFrame(() => {
        const t = (performance.now() - inicio.current) / 1000;
        if (fase === 'quem' || fase === 'receita') { pos.set(.2, 1.68, 1.6); alvo.set(-1.9, 1.9, -1.4); }
        else if (fase === 'bancada') { pos.set(0, 1.62, .55); alvo.set(giro.current.x * 1.6, .95 + giro.current.y * .8, -1.2); }
        else if (fase === 'arremesso' || fase === 'despedida') { const k = Math.min(1, (performance.now() - arremesso) / 1400); pos.set(0, 1.62, .55).lerp(new THREE.Vector3(-.4, 1.75, .2), k); alvo.set(.2, .1, 1.6).lerp(new THREE.Vector3(-1, 1.2, .9), fase === 'despedida' ? Math.min(1, t / 2) : 0); }
        else { const k = Math.min(1, t / 2.4); pos.set(-.4, 1.75, .2).lerp(new THREE.Vector3(.2, .3, 1.6), k * k); alvo.set(.2, -2, 1.61); }
        camera.position.lerp(pos, .08); camera.lookAt(alvo);
    });
    return null;
};

export default function LabKessar({ aoFim, reduzida }: { aoFim: () => void; reduzida: boolean }) {
    const [fase, setFase] = useState<Fase>('quem');
    const [b, setB] = useState<Bancada>(bancadaVazia);
    const [msg, setMsg] = useState<string | null>(null);
    const [pulsos, setPulsos] = useState([0, 0, 0]);
    const [arremesso, setArremesso] = useState(0), [portal, setPortal] = useState(0), [branco, setBranco] = useState(0);
    const vis = useRef<VisualEntidade>(visualPadrao()), giro = useRef({ x: 0, y: 0 });
    const toque = useRef<{ x: number; y: number } | null>(null);

    // quente demais, ela esfria sozinha devagar (até a faixa); dentro da faixa, o calor se mantém
    useEffect(() => {
        if (fase !== 'bancada') return;
        const id = window.setInterval(() => setB((v) => (v.temp > QUENTE && !v.agitado ? { ...v, temp: Math.max(FAIXA[1], v.temp - 2) } : v)), 500);   // só esfria se passou do ponto
        return () => window.clearInterval(id);
    }, [fase]);
    // a entidade mexe o braço quando aponta a bancada e quando o portal abre
    useEffect(() => { vis.current.braco = fase === 'receita' ? .8 : fase === 'despedida' ? .5 : 0; vis.current.alturaBraco = fase === 'receita' ? -.4 : 0; }, [fase]);

    const despeja = (r: number) => {
        if (b.agitado) return;
        if (passou(b)) { setMsg(LAB_REACOES.passou); som('erro'); return; }
        const n = despejar(b, r); setB(n); som('glub');
        setPulsos((p) => p.map((v, i) => (i === r ? performance.now() : v)));
        if (passou(n)) { setMsg(LAB_REACOES.passou); som('erro'); } else if (bateu(n)) setMsg(LAB_REACOES.bateu); else setMsg(null);
    };
    const esvazia = () => { setB(bancadaVazia()); setMsg(null); som('clique'); };
    const aquece = (d: number) => {
        if (!bateu(b) || b.agitado) return;
        const t = Math.max(24, Math.min(110, b.temp + d)); setB({ ...b, temp: t }); som('clique');
        setMsg(t > QUENTE ? LAB_REACOES.quente : t >= FAIXA[0] && t <= FAIXA[1] ? LAB_REACOES.pronto : null);
    };
    const agita = () => {
        if (!bateu(b) || !naFaixa(b) || b.agitado) return;
        setB({ ...b, agitado: true }); setMsg(LAB_REACOES.agitado); som('glub');
        window.setTimeout(() => { setMsg(null); setFase('arremesso'); setArremesso(performance.now()); }, 2600);
    };
    // o arremesso: o béquer voa, quebra, o portal abre; depois a despedida; por fim o mergulho e o branco
    useEffect(() => {
        if (fase !== 'arremesso') return;
        const a = window.setTimeout(() => { som('quebra'); setPortal(performance.now()); som('portal'); }, 900);
        const c = window.setTimeout(() => setFase('despedida'), 3600);
        return () => { window.clearTimeout(a); window.clearTimeout(c); };
    }, [fase]);
    useEffect(() => {
        if (fase !== 'mergulho') return;
        let raf = 0; const t0 = performance.now();
        const f = (agora: number) => { const k = Math.min(1, (agora - t0) / 2600); setBranco(Math.max(0, (k - .45) / .55)); if (k < 1) raf = requestAnimationFrame(f); else aoFim(); };
        raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
    }, [fase, aoFim]);

    const pronta = bateu(b), instavel = passou(b);
    const botao: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 15, padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(180,150,255,.5)', background: 'rgba(20,12,34,.85)', color: '#ece4ff', cursor: 'pointer', minWidth: 44 };
    return <div style={{ position: 'absolute', inset: 0, background: '#000', touchAction: 'none' }}
        onPointerDown={(e) => { toque.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={() => { toque.current = null; }}
        onPointerMove={(e) => { if (!toque.current || fase !== 'bancada') return; giro.current.x = Math.max(-1, Math.min(1, giro.current.x + (e.clientX - toque.current.x) * .004)); giro.current.y = Math.max(-.6, Math.min(.8, giro.current.y - (e.clientY - toque.current.y) * .004)); toque.current = { x: e.clientX, y: e.clientY }; }}>
        <Canvas shadows dpr={reduzida ? 1 : [1, 1.5]} camera={{ fov: 62, near: .05, far: 60, position: [.2, 1.68, 1.6] }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
            <color attach="background" args={['#07060a']} />
            <fog attach="fog" args={['#0b0910', 10, 26]} />
            <ambientLight intensity={.9} color="#a9a3c4" />
            <hemisphereLight args={['#cfd8ff', '#2a2230', .6]} />
            <directionalLight position={[2, 5.5, 2]} intensity={1.6} color="#e6ecff" castShadow shadow-mapSize={[1024, 1024]} />
            <pointLight position={[0, 2.4, -1.1]} intensity={10} distance={7} color="#ffe6c8" />
            <pointLight position={[-2.2, 2.6, -2]} intensity={6} distance={6} color="#9a7bff" />
            <Sala />
            <Aquecedor temp={b.temp} />
            <Bequer b={b} voando={arremesso} />
            {REAGENTES.map((r, i) => <Frasco key={r.id} x={[-1.2, -.7, .75][i]} cor={r.cor} ativo={fase === 'bancada'} aoTocar={() => despeja(i)} pulso={pulsos[i]} />)}
            <Portal desde={portal} />
            <group position={[-1.9, 0, -1.5]} rotation={[0, .6, 0]}><FiguraDaEntidade vis={vis} escala={1.05} /></group>
            <Olhos fase={fase} arremesso={arremesso} giro={giro} />
        </Canvas>

        {fase === 'quem' && <Dialogo falas={LAB_QUEM} aoFim={() => setFase('receita')} />}
        {fase === 'receita' && <Dialogo falas={LAB_RECEITA} aoFim={() => setFase('bancada')} />}
        {fase === 'despedida' && <Dialogo falas={DESPEDIDA} aoFim={() => setFase('mergulho')} />}

        {fase === 'bancada' && <>
            {/* a tela da assinatura: alvo (traço) e o que está no béquer (barra) */}
            <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 12, right: 12, width: 'min(300px, 46vw)', padding: '10px 12px', borderRadius: 10, background: 'rgba(6,14,12,.86)', border: `1px solid ${instavel ? '#ff5a4a' : pronta ? '#b28cff' : '#2fbf86'}`, color: '#c9ffe8', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                <div style={{ letterSpacing: 2, marginBottom: 6, color: instavel ? '#ff8a7a' : '#7dffc4' }}>ASSINATURA {instavel ? '· INSTÁVEL' : pronta ? '· ESTÁVEL' : ''}</div>
                {ALVO.map((a, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0' }}>
                    <div style={{ position: 'relative', flex: 1, height: 12, background: '#0c1b17', borderRadius: 3 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(1, b.barras[i] / 8) * 100}%`, background: b.barras[i] > a ? '#ff5a4a' : CORES_BARRA[i], borderRadius: 3 }} />
                        <div style={{ position: 'absolute', left: `${a / 8 * 100}%`, top: -3, bottom: -3, width: 2, background: '#fff' }} />
                    </div>
                    <span style={{ width: 34, textAlign: 'right' }}>{b.barras[i]}/{a}</span>
                </div>)}
                <div style={{ marginTop: 6 }}>CALOR {Math.round(b.temp)} °C <span style={{ color: '#c39bff' }}>(faixa {FAIXA[0]}–{FAIXA[1]})</span></div>
            </div>
            {/* os rótulos dos frascos e as ações */}
            <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, bottom: 'max(14px, env(safe-area-inset-bottom))', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '0 10px' }}>
                {REAGENTES.map((r, i) => <button key={r.id} style={{ ...botao, borderColor: r.cor }} onClick={() => despeja(i)}>
                    <span style={{ color: r.cor }}>●</span> {r.nome} <span style={{ opacity: .75, fontSize: 12 }}>({r.soma.map((v, k) => <span key={k} style={{ color: CORES_BARRA[k] }}>+{v} </span>)})</span> ×{b.doses[i]}
                </button>)}
                <button style={botao} onClick={esvazia}>Esvaziar</button>
                <button style={{ ...botao, opacity: pronta ? 1 : .4 }} onClick={() => aquece(-10)}>− calor</button>
                <button style={{ ...botao, opacity: pronta ? 1 : .4 }} onClick={() => aquece(10)}>+ calor</button>
                <button style={{ ...botao, opacity: pronta && naFaixa(b) ? 1 : .4, borderColor: '#b28cff' }} onClick={agita}>Agitar</button>
            </div>
            {msg && <div style={{ position: 'absolute', top: 14, left: 14, right: 'min(330px, 50vw)', color: '#ece4ff', fontFamily: 'Georgia, serif', fontSize: 'clamp(14px, 2.2vw, 18px)',
                textShadow: '0 2px 8px #000, 0 0 14px rgba(110,60,220,.6)', pointerEvents: 'none' }}><span style={{ color: '#b49cff', fontSize: 11, letterSpacing: 3 }}>A SOMBRA</span><br />{msg}</div>}
        </>}
        <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: branco, pointerEvents: 'none' }} />
    </div>;
}
