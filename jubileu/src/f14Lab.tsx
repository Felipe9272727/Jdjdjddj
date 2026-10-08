/**
 * f14Lab.tsx — o LABORATÓRIO debaixo da cratera de Kessar-9.
 *
 * Fases: 'quem' (ela conta quem é) → 'receita' (o pedido) → 'bancada' (o puzzle) →
 * 'video' (cutscene pré-renderizada — Blender + Manim + Remotion, f14-portal.mp4: o béquer voa e se
 * quebra; o chão "esquece" e abre um portal; a despedida; o mergulho) → aoFim.
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
import { LAB_QUEM, LAB_RECEITA, LAB_REACOES } from './f14Lore';
import { ChegadaKessar } from './f14Chegada';
import { Vidraria, useAmbienteVidro, type Forma } from './f14Vidro';

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

type Fase = 'quem' | 'receita' | 'bancada' | 'video';

// ── som (sintetizado) ──
let ac: AudioContext | null = null;
function som(tipo: 'glub' | 'clique' | 'erro') {
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
/** Material com textura de verdade (Poly Haven CC0, public/kessar): cor + mapa normal, repetido. */
function texturado(base: string, rep: [number, number], extra: THREE.MeshStandardMaterialParameters) {
    const ld = new THREE.TextureLoader(), raiz = `${import.meta.env.BASE_URL}kessar/${base}`;
    const cor = ld.load(`${raiz}_diffuse.jpg`), nor = ld.load(`${raiz}_nor_gl.jpg`);
    for (const t of [cor, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; }
    cor.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: cor, normalMap: nor, ...extra });
}
const Sala: React.FC = () => {
    const env = useAmbienteVidro();
    const metal = useMemo(() => texturado('metal_plate', [1, 1], { color: '#8a8f98', roughness: .45, metalness: .75 }), []);
    const parede = useMemo(() => texturado('concrete_wall_006', [4, 2], { color: '#9a94a4', roughness: .9 }), []);
    const tampo = useMemo(() => texturado('metal_plate', [3, 1], { color: '#5a5e66', roughness: .35, metalness: .6 }), []);
    const piso = useMemo(() => texturado('metal_plate', [6, 6], { color: '#8a8890', roughness: .5, metalness: .55 }), []);
    const teto = useMemo(() => texturado('concrete_floor_worn_001', [4, 4], { color: '#5a5660', roughness: .95, side: THREE.DoubleSide }), []);
    useEffect(() => () => { for (const m of [metal, parede, tampo, piso, teto]) { m.map?.dispose(); m.normalMap?.dispose(); m.dispose(); } }, [metal, parede, tampo, piso, teto]);
    return <group>
        {/* chão de placas e paredes de rocha da cratera revestidas */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={piso}><planeGeometry args={[14, 14]} /></mesh>
        {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[-7 + i * 2.33, .002, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.02, 14]} /><meshBasicMaterial color="#0d0c10" /></mesh>)}
        <mesh position={[0, 3, -5]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[6, 3, 0]} rotation={[0, Math.PI / 2, 0]} material={parede}><boxGeometry args={[14, 6, .3]} /></mesh>
        <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} material={teto}><planeGeometry args={[14, 14]} /></mesh>
        {/* luminárias e fitas violeta */}
        {[-3, 0, 3].map((x) => <mesh key={x} position={[x, 5.9, -1]}><boxGeometry args={[1.6, .05, .25]} /><meshBasicMaterial color="#dfe8ff" /></mesh>)}
        {[-5.8, 5.8].map((x) => <mesh key={x} position={[x, 1.2, -1]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[9, .04, .04]} /><meshBasicMaterial color="#8a5cff" /></mesh>)}
        {/* bancada */}
        <mesh position={[0, .9, -1.2]} material={tampo} castShadow receiveShadow><boxGeometry args={[3.4, .08, 1.1]} /></mesh>
        {[[-1.6, -.7], [1.6, -.7], [-1.6, -1.7], [1.6, -1.7]].map(([x, z], i) => <mesh key={i} position={[x, .45, z]} material={metal}><boxGeometry args={[.06, .9, .06]} /></mesh>)}
        {/* estantes com vidraria no fundo, máquinas, tubos */}
        {[-3.8, 3.8].map((x) => <group key={x} position={[x, 0, -4.4]}>
            {[.8, 1.7, 2.6].map((y) => <mesh key={y} position={[0, y, 0]} material={metal}><boxGeometry args={[1.8, .05, .5]} /></mesh>)}
            {[.8, 1.7, 2.6].flatMap((y, j) => [-.65, -.3, .05, .38, .65].map((dx, k) => {
                const forma = (['bequer', 'erlen', 'balao', 'bequer', 'tubo'] as Forma[])[(k + j * 2) % 5];
                const [h, R] = { bequer: [.2, .065], erlen: [.24, .085], balao: [.26, .07], tubo: [.18, .02] }[forma];
                return <Vidraria key={`${y}${dx}`} env={env} forma={forma} h={h} R={R} position={[dx, y + .025, ((k * 37 + j * 11) % 7) / 50 - .06]}
                    cor={['#d8521f', '#3fbff2', '#9a5cff', '#66e65a', '#f2cc33'][(k + j) % 5]} nivel={.3 + ((k * 3 + j) % 5) / 10} />;
            }))}
        </group>)}
        <mesh position={[-2.5, 1.2, -4.5]} material={metal}><boxGeometry args={[1, 2.4, .8]} /></mesh>
        <mesh position={[-2.5, 1.7, -4.08]}><planeGeometry args={[.7, .4]} /><meshBasicMaterial color="#47ff9a" /></mesh>
        {[-4.8, -4.6, 4.6, 4.8].map((x) => <mesh key={x} position={[x, 3, -4.6]} material={metal}><cylinderGeometry args={[.06, .06, 6, 8]} /></mesh>)}
    </group>;
};

/** Frasco clicável na bancada. */
const Frasco: React.FC<{ x: number; cor: string; ativo: boolean; aoTocar: () => void; pulso: number }> = ({ x, cor, ativo, aoTocar, pulso }) => {
    const env = useAmbienteVidro();
    const g = useRef<THREE.Group>(null), [sobre, setSobre] = useState(false);
    useFrame(() => { if (g.current) { const k = Math.max(0, 1 - (performance.now() - pulso) / 400); g.current.position.y = .94 + (sobre ? .05 : 0) + Math.sin(k * Math.PI) * .12; g.current.rotation.z = k * .9; } });
    return <group ref={g} position={[x, .94, -1.05]} onPointerOver={(e) => { e.stopPropagation(); if (ativo) setSobre(true); }} onPointerOut={() => setSobre(false)}
        onPointerDown={(e) => { e.stopPropagation(); if (ativo) aoTocar(); }}>
        <Vidraria env={env} forma="erlen" h={.42} R={.15} cor={cor} nivel={.42} brilho={sobre ? 1.1 : .45} />
        <mesh position={[0, .44, 0]}><cylinderGeometry args={[.052, .044, .07, 12]} /><meshStandardMaterial color="#5a4630" roughness={.8} /></mesh>
        <pointLight color={cor} intensity={sobre ? 1.2 : .5} distance={1.4} position={[0, .25, .1]} />
    </group>;
};

/** O béquer no aquecedor: o líquido sobe e mistura as cores; borrado quando pronto (a simulação não desenha). */
const Bequer: React.FC<{ b: Bancada }> = ({ b }) => {
    const env = useAmbienteVidro();
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
    });
    return <group ref={g} position={[0, .95, -1.05]}>
        <Vidraria env={env} forma="bequer" h={.44} R={.165} />
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

/** Câmera: em pé diante da bancada; arrastar gira um pouco; nas cutscenes, segue o roteiro. */
const Olhos: React.FC<{ fase: Fase; giro: React.MutableRefObject<{ x: number; y: number }> }> = ({ fase, giro }) => {
    const { camera } = useThree(), alvo = useMemo(() => new THREE.Vector3(), []), pos = useMemo(() => new THREE.Vector3(), []);
    const inicio = useRef(performance.now());
    useEffect(() => { inicio.current = performance.now(); }, [fase]);
    useFrame(() => {
        const t = (performance.now() - inicio.current) / 1000;
        if (fase === 'quem' || fase === 'receita') { pos.set(.2, 1.68, 1.6); alvo.set(-1.9, 1.9, -1.4); }
        else if (fase === 'bancada') { pos.set(0, 1.62, .55); alvo.set(giro.current.x * 1.6, .95 + giro.current.y * .8, -1.2); }
        else return;
        camera.position.lerp(pos, .08); camera.lookAt(alvo);
    });
    return null;
};

export default function LabKessar({ aoFim, reduzida, volume = 1 }: { aoFim: () => void; reduzida: boolean; volume?: number }) {
    const [fase, setFase] = useState<Fase>('quem');
    const [b, setB] = useState<Bancada>(bancadaVazia);
    const [msg, setMsg] = useState<string | null>(null);
    const [pulsos, setPulsos] = useState([0, 0, 0]);
    const vis = useRef<VisualEntidade>(visualPadrao()), giro = useRef({ x: 0, y: 0 });
    const toque = useRef<{ x: number; y: number } | null>(null);

    // quente demais, ela esfria sozinha devagar (até a faixa); dentro da faixa, o calor se mantém
    useEffect(() => {
        if (fase !== 'bancada') return;
        const id = window.setInterval(() => setB((v) => (v.temp > QUENTE && !v.agitado ? { ...v, temp: Math.max(FAIXA[1], v.temp - 2) } : v)), 500);   // só esfria se passou do ponto
        return () => window.clearInterval(id);
    }, [fase]);
    // a entidade estende o braço quando aponta a bancada
    useEffect(() => { vis.current.braco = fase === 'receita' ? .8 : 0; vis.current.alturaBraco = fase === 'receita' ? -.4 : 0; }, [fase]);

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
        window.setTimeout(() => { setMsg(null); setFase('video'); }, 2600);
    };
    const pronta = bateu(b), instavel = passou(b);
    const botao: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 15, padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(180,150,255,.5)', background: 'rgba(20,12,34,.85)', color: '#ece4ff', cursor: 'pointer', minWidth: 44 };
    return <div style={{ position: 'absolute', inset: 0, background: '#000', touchAction: 'none' }}
        onPointerDown={(e) => { toque.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={() => { toque.current = null; }}
        onPointerMove={(e) => { if (!toque.current || fase !== 'bancada') return; giro.current.x = Math.max(-1, Math.min(1, giro.current.x + (e.clientX - toque.current.x) * .004)); giro.current.y = Math.max(-.6, Math.min(.8, giro.current.y - (e.clientY - toque.current.y) * .004)); toque.current = { x: e.clientX, y: e.clientY }; }}>
        <Canvas frameloop={fase === 'video' ? 'never' : 'always'} shadows dpr={reduzida ? 1 : [1, 1.5]} camera={{ fov: 62, near: .05, far: 60, position: [.2, 1.68, 1.6] }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
            <color attach="background" args={['#07060a']} />
            <fog attach="fog" args={['#0b0910', 10, 26]} />
            <ambientLight intensity={.9} color="#a9a3c4" />
            <hemisphereLight args={['#cfd8ff', '#2a2230', .6]} />
            <directionalLight position={[2, 5.5, 2]} intensity={1.6} color="#e6ecff" castShadow shadow-mapSize={[1024, 1024]} />
            <pointLight position={[0, 2.4, -1.1]} intensity={10} distance={7} color="#ffe6c8" />
            <pointLight position={[-2.2, 2.6, -2]} intensity={6} distance={6} color="#9a7bff" />
            <Sala />
            <Aquecedor temp={b.temp} />
            <Bequer b={b} />
            {REAGENTES.map((r, i) => <Frasco key={r.id} x={[-1.2, -.7, .75][i]} cor={r.cor} ativo={fase === 'bancada'} aoTocar={() => despeja(i)} pulso={pulsos[i]} />)}
            <group position={[-1.9, 0, -1.5]} rotation={[0, .6, 0]}><FiguraDaEntidade vis={vis} escala={1.05} /></group>
            <Olhos fase={fase} giro={giro} />
        </Canvas>

        {fase === 'quem' && <Dialogo falas={LAB_QUEM} aoFim={() => setFase('receita')} />}
        {fase === 'receita' && <Dialogo falas={LAB_RECEITA} aoFim={() => setFase('bancada')} />}
        {fase === 'video' && <ChegadaKessar src="f14-portal.mp4" titulo="ANTI-SIMULAÇÃO" volume={volume} onFinish={aoFim} />}

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
    </div>;
}
