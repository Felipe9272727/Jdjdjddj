/**
 * Floor13.tsx — Vindhjem, a cidade viking que voa.
 *
 * O ANDAR, EM ORDEM:
 *  1. A QUEDA (cena de abertura, ~11 s, pulável): o avião do andar 12 tosse,
 *     o TROCO-63 some do rádio, o motor morre e a câmera acompanha o mergulho
 *     num plano contínuo — por cima das nuvens, de lado no engasgo, por trás
 *     no mergulho revelando a cidade — até o baque no feno.
 *  2. EXPLORAR: terceira pessoa. Arrastar à esquerda anda, à direita gira a
 *     câmera (WASD/setas + arrastar o mouse no computador). Perto de alguém ou
 *     de algo aparece o botão de ação.
 *  3. As pistas vêm dos moradores; as buscas secundárias dão lore e reforçam.
 *  4. Com duas pistas, o pescador Halvard é tomado pela ENTIDADE — e cai duro.
 *  5. Bater na casa certa: a porta de latão abre como a de um elevador.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, HueSaturation, ChromaticAberration, Noise, Vignette, BrightnessContrast, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Avatar64, useAvatarRefs } from './Floor5Player64';
import { CascoDoElevador } from './Floor12Avioes';
import { Floor13Mundo, novoCeu, DIRECAO_DO_SOL, alcanceDaGrama, TOCHAS, batidasNasCasas, conversaAcabou } from './Floor13Mundo';
import { Ovelha, type EstadoVisualNpc } from './Floor13Gente';
import { Viking } from './Floor13Povo';
import { Floor13Vida } from './Floor13Vida';
import { pbr } from './f13Texturas';
import { EfeitoChuva } from './f13Chuva';
import { SaidaDoAndar, CabineDoElevador } from './Floor13Saida';
import {
    NPCS, PISTAS, BUSCAS, ENTIDADE, CASA_CERTA, type FichaNpc, CONEXAO_ENCERRADA, LEGENDAS_DA_QUEDA, CASAS, type Fala, type IdNpc, type Pista,
} from './f13Lore';
import {
    ILHAS as ILHAS_R, chaoEm, INICIO, LUGAR_DOS_NPCS, LUGAR_DAS_CASAS, portaNoMundo, foraDasCasas, MARTELO, OVELHAS, SINO,
    novoEstado13, falarCom, pegarMartelo, acharOvelha, tocarSino as marcarSino, entidadeAcorda, baterNaCasa,
} from './f13Mundo';
import {
    tocarVento, pararVento, tocarMotorTossindo, tocarMotorMorrendo, tocarQueda, tocarSino, tocarDingDaCasa,
    tocarPegar, tocarBalido, tocarFala, tocarGlitch, tocarDesconexao, tocarAmbiente, pararAmbiente, tocarPasso, tocarCorpoCaindo,
} from './floor13Sfx';

type Fase = 'queda' | 'explorar' | 'dialogo' | 'elevador';
type Alvo =
    | { tipo: 'npc'; id: IdNpc }
    | { tipo: 'martelo' } | { tipo: 'ovelha'; i: number } | { tipo: 'sino' } | { tipo: 'casa'; i: number };
const chaveDoAlvo = (a: Alvo | null) => (a ? `${a.tipo}:${'id' in a ? a.id : 'i' in a ? a.i : ''}` : '');

export const DURACAO_DA_QUEDA = 12.6;
/** O hóspede, no mesmo desenho dos moradores: jaqueta azul, sem elmo. */
const estadoDoPiloto = { current: { olharPara: null, falando: false, possessao: 0, caido: false } } as React.MutableRefObject<EstadoVisualNpc>;
const HOSPEDE = { id: 'hospede', nome: 'Você', oficio: 'hóspede', tunica: '#3b6fb0', barba: null, primeira: [], depois: [] } as unknown as FichaNpc;
/** Bancada: `?f13t=5` congela a queda nesse instante (só em DEV). */
const tFixo: number | null = typeof location !== 'undefined' && new URLSearchParams(location.search).has('f13t')
    ? parseFloat(new URLSearchParams(location.search).get('f13t') ?? '0') : null;
/** A entidade em cena: a câmera fecha mais nela. */
const entidadeNaCena = { valor: false, linha: 0 };

/** Estado de movimento do jogador (mutável, lido a cada quadro). */
interface Jog { x: number; y: number; z: number; ang: number; vy: number; seguro: { x: number; z: number }; levantando: number; andando: number }

const ICONE_DA_PISTA: Record<Pista, string> = { latao: '🚪', fumaca: '🏚', botao: '🔔' };

const t13: React.CSSProperties = {
    fontFamily: 'monospace', fontWeight: 900, color: '#FFE3A0', letterSpacing: 1.5,
    textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000', userSelect: 'none',
};

// ═══ A QUEDA ═════════════════════════════════════════════════════════════════
const CAMINHO = new THREE.CatmullRomCurve3([
    new THREE.Vector3(80, 34, 120), new THREE.Vector3(48, 29, 92), new THREE.Vector3(22, 24, 70),
    new THREE.Vector3(8, 16, 52), new THREE.Vector3(1, 6, 40), new THREE.Vector3(-2, 1.4, 33),
]);
/** Quanto do caminho já foi percorrido no instante t (acelera no mergulho). */
function progressoDaQueda(t: number): number {
    const planar = Math.min(t, 7.4) / 7.4 * .55;
    const mergulho = Math.max(0, Math.min(1, (t - 7.4) / 3));
    return Math.min(1, planar + mergulho * mergulho * .45);
}

/** Fumaça macia: um sprite com degradê radial (esferas liam como discos). */
let texFumaca: THREE.CanvasTexture | null = null;
const matsFumaca: THREE.SpriteMaterial[] = [];
function matFumaca(i: number): THREE.SpriteMaterial {
    if (!texFumaca) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        r.addColorStop(0, 'rgba(70,64,60,1)'); r.addColorStop(.5, 'rgba(70,64,60,.55)'); r.addColorStop(1, 'rgba(70,64,60,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        texFumaca = new THREE.CanvasTexture(c);
    }
    return (matsFumaca[i] ??= new THREE.SpriteMaterial({ map: texFumaca, transparent: true, depthWrite: false }));
}

const matsPoeira: THREE.SpriteMaterial[] = [];
let texPoeira: THREE.CanvasTexture | null = null;
function matPoeira(i: number): THREE.SpriteMaterial {
    if (!texPoeira) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        r.addColorStop(0, 'rgba(236,214,160,1)'); r.addColorStop(.6, 'rgba(236,214,160,.4)'); r.addColorStop(1, 'rgba(236,214,160,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        texPoeira = new THREE.CanvasTexture(c);
    }
    return (matsPoeira[i] ??= new THREE.SpriteMaterial({ map: texPoeira, transparent: true, depthWrite: false }));
}

// destroços no terço esquerdo, a cidade à direita
const HEROI = new THREE.Vector3(3.2, 5.6, 42.5);
const DESTROCOS = new THREE.Vector3(-1.6, 1.2, 31.5);
const smoother = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * c * (c * (c * 6 - 15) + 10); };

/** Sulco de terra com borda esfumada e torrões: nada de retângulo chapado. */
let texSulco: THREE.CanvasTexture | null = null;
function texturaDoSulco(): THREE.CanvasTexture {
    if (texSulco) return texSulco;
    const c = document.createElement('canvas'); c.width = 64; c.height = 192;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(90,65,40,0)'); gr.addColorStop(.3, 'rgba(90,65,40,.9)'); gr.addColorStop(.5, 'rgba(60,42,26,1)');
    gr.addColorStop(.7, 'rgba(90,65,40,.9)'); gr.addColorStop(1, 'rgba(90,65,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 192);
    g.globalCompositeOperation = 'destination-in';
    const gv = g.createLinearGradient(0, 0, 0, 192); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(.25, 'rgba(0,0,0,1)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gv; g.fillRect(0, 0, 64, 192);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${70 + Math.random() * 40},${50 + Math.random() * 30},30,.9)`; g.beginPath(); g.arc(8 + Math.random() * 48, 40 + Math.random() * 150, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    texSulco = new THREE.CanvasTexture(c); texSulco.colorSpace = THREE.SRGBColorSpace;
    return texSulco;
}

/** Mostrador de instrumento: fundo escuro, marcas e números em marfim. */
const mostradores = new Map<string, THREE.CanvasTexture>();
function texturaDeMostrador(rotulo: string, marcas: number, vermelho = 0): THREE.CanvasTexture {
    const chave = `${rotulo}:${marcas}:${vermelho}`;
    let t = mostradores.get(chave); if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 58, 6, 64, 64, 62); gr.addColorStop(0, '#2b2a26'); gr.addColorStop(1, '#0e0d0b');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    if (vermelho) { g.strokeStyle = '#c23a22'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 50, -Math.PI / 2 + Math.PI * 2 * (1 - vermelho), -Math.PI / 2 + Math.PI * 2 * .999); g.stroke(); }
    g.strokeStyle = '#efe3c8'; g.fillStyle = '#efe3c8'; g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < marcas * 5; i++) {
        const a = -Math.PI / 2 + i / (marcas * 5) * Math.PI * 2, grande = i % 5 === 0, r0 = grande ? 44 : 50;
        g.lineWidth = grande ? 3 : 1.2; g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * 57, 64 + Math.sin(a) * 57); g.stroke();
        if (grande) g.fillText(String(i / 5), 64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
    }
    g.font = 'bold 11px monospace'; g.fillStyle = '#d9b85a'; g.fillText(rotulo, 64, 86);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; mostradores.set(chave, t);
    return t;
}

/**
 * A cabine vista de dentro: painel de madeira com três relógios (altímetro
 * que desaba no mergulho, conta-giros que morre com o motor, óleo) e a
 * lâmpada de pane piscando; montantes de latão do para-brisa nas bordas.
 * Fica no espaço do casco (anda, rola e treme com ele).
 */
const Cabine: React.FC<{ tRef: React.MutableRefObject<number>; ajuste: React.MutableRefObject<(() => void) | null> }> = ({ tRef, ajuste }) => {
    const alt = useRef<THREE.Group>(null), rpm = useRef<THREE.Group>(null), oleo = useRef<THREE.Group>(null);
    const lampada = useRef<THREE.MeshStandardMaterial>(null);
    useFrame(() => {
        const t = tRef.current;
        const tosse = t > 2.6 && t < 5 ? Math.sin(t * 23) * .35 : 0;
        const giro = t < 2.6 ? .72 : t < 5 ? .6 + tosse * .3 : Math.max(0, .6 * (1 - (t - 5) / 1.5));
        if (rpm.current) rpm.current.rotation.z = -giro * Math.PI * 2 * .8;
        // altímetro: gira para trás cada vez mais rápido no mergulho
        const altura = t < 7.4 ? 3.2 - t * .05 : Math.max(0, 2.83 - (t - 7.4) ** 2 * .3);
        if (alt.current) alt.current.rotation.z = -altura * Math.PI * 2;
        if (oleo.current) oleo.current.rotation.z = -(t < 2.6 ? .55 : Math.max(.05, .55 - (t - 2.6) * .12)) * Math.PI * 2 * .8;
        if (lampada.current) lampada.current.emissiveIntensity = t > 2.6 && t < 10.45 && Math.sin(t * 12) > 0 ? 4 : .15;
    });
    const Relogio: React.FC<{ x: number; r: number; rotulo: string; marcas: number; vermelho?: number; agulha: React.RefObject<THREE.Group | null> }> = ({ x, r, rotulo, marcas, vermelho, agulha }) => (
        <group position={[x, 0, .031]}>
            <mesh><circleGeometry args={[r, 28]} /><meshBasicMaterial map={texturaDeMostrador(rotulo, marcas, vermelho)} /></mesh>
            <mesh position={[0, 0, .004]}><torusGeometry args={[r, r * .12, 6, 28]} /><meshStandardMaterial color="#c9a13a" metalness={.9} roughness={.35} /></mesh>
            <group ref={agulha} position={[0, 0, .006]}>
                <mesh position={[0, r * .38, 0]}><boxGeometry args={[r * .07, r * .82, .002]} /><meshBasicMaterial color="#f4e8cc" /></mesh>
            </group>
            {/* vidro do mostrador: um reflexo leve */}
            <mesh position={[0, 0, .009]}><circleGeometry args={[r, 28]} /><meshStandardMaterial color="#ffffff" transparent opacity={.08} roughness={.05} metalness={.2} /></mesh>
        </group>
    );
    // presa à cabeça: o grupo segue a câmera (posição e giro) e o painel se
    // encaixa na largura da tela — em pé nenhum relógio sai pela borda
    const raiz = useRef<THREE.Group>(null), painel = useRef<THREE.Group>(null), lados = useRef<(THREE.Mesh | null)[]>([]), trave = useRef<THREE.Mesh>(null);
    const camera = useThree((st) => st.camera), size = useThree((st) => st.size);
    // chamado pela CenaDaQueda depois de pôr a câmera no quadro (um useFrame
    // próprio rodaria antes dela e o painel tremeria um quadro atrasado)
    ajuste.current = () => {
        const g = raiz.current; if (!g) return;
        const t = tRef.current;
        g.position.copy(camera.position); g.quaternion.copy(camera.quaternion);
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 72, D = .55;
        const meiaA = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * D, meiaL = meiaA * size.width / size.height;
        // no baque o painel some para baixo (a cabeça tomba para fora da cabine)
        const sai = THREE.MathUtils.smoothstep(t, 10.45, 10.9);
        g.visible = sai < 1;
        if (painel.current) {
            const k = Math.min(1, meiaL * .94 / .2);
            painel.current.scale.setScalar(k);
            // acima da faixa das legendas
            painel.current.position.set(0, -meiaA * .6 - sai * .4, -D);
        }
        lados.current.forEach((m, i) => { if (m) m.position.set((i ? 1 : -1) * meiaL * .9, 0, -D - .05); });
        if (trave.current) trave.current.position.set(0, meiaA * .93, -D - .08);
    };
    return <group ref={raiz}>
        {/* o painel: tampo de madeira inclinado para o piloto, forro escuro */}
        <group ref={painel}>
            <group rotation={[-.35, 0, 0]}>
                <mesh><boxGeometry args={[.8, .17, .06]} /><meshStandardMaterial {...pbr('carvalho', .6, .2)} color="#5a3a24" roughness={.7} /></mesh>
                <mesh position={[0, .095, .01]}><boxGeometry args={[.82, .025, .09]} /><meshStandardMaterial color="#2a1c12" roughness={.9} /></mesh>
                {/* o forro de couro abaixo do painel, até a borda da tela */}
                {/* desce até bem abaixo da borda da tela em pé (sobrava uma faixa preta
                    vazia): couro acolchoado com costura e o manche saindo dele */}
                <mesh position={[0, -.55, -.01]}><boxGeometry args={[.84, .94, .04]} /><meshStandardMaterial color="#4a2e1c" roughness={.55} metalness={0} /></mesh>
                {[-.26, -.46, -.66].map((y) => <mesh key={y} position={[0, y, .022]}><boxGeometry args={[.8, .012, .006]} /><meshStandardMaterial color="#c9a270" roughness={.8} /></mesh>)}
                <mesh position={[0, -.42, .06]} rotation={[.5, 0, 0]}><cylinderGeometry args={[.012, .016, .26, 10]} /><meshStandardMaterial color="#2a2622" metalness={.6} roughness={.4} /></mesh>
                <mesh position={[0, -.31, .12]}><sphereGeometry args={[.028, 12, 10]} /><meshStandardMaterial color="#4a3222" roughness={.6} /></mesh>
                <Relogio x={-.12} r={.045} rotulo="ALT" marcas={10} agulha={alt} />
                <Relogio x={0} r={.052} rotulo="RPM" marcas={8} vermelho={.2} agulha={rpm} />
                <Relogio x={.12} r={.04} rotulo="ÓLEO" marcas={4} vermelho={.25} agulha={oleo} />
                <mesh position={[.05, -.06, .035]}><sphereGeometry args={[.011, 12, 8]} /><meshStandardMaterial ref={lampada} color="#5a1008" emissive="#ff2a10" emissiveIntensity={.15} /></mesh>
                {[-.07, -.04].map((x) => <mesh key={x} position={[x, -.06, .04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.008, .008, .02, 10]} /><meshStandardMaterial color="#c9a13a" metalness={.9} roughness={.3} /></mesh>)}
            </group>
        </group>
        {/* montantes do para-brisa nas bordas e a travessa de cima */}
        {[0, 1].map((i) => <mesh key={i} ref={(m) => { lados.current[i] = m; }} rotation={[0, 0, (i ? -1 : 1) * .12]}><boxGeometry args={[.02, 1.2, .03]} /><meshStandardMaterial color="#8a6a2a" metalness={.8} roughness={.4} /></mesh>)}
        <mesh ref={trave}><boxGeometry args={[1.4, .025, .04]} /><meshStandardMaterial color="#8a6a2a" metalness={.8} roughness={.4} /></mesh>
    </group>;
};

const CenaDaQueda: React.FC<{ tRef: React.MutableRefObject<number> }> = ({ tRef }) => {
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const aviao = useRef<THREE.Group>(null), balanco = useRef<THREE.Group>(null);
    const abertura = useRef(1), helice = useRef(0);
    const refs = useAvatarRefs();
    const fumaca = useRef<THREE.Group>(null), poeira = useRef<THREE.Group>(null), lascas = useRef<THREE.Group>(null);
    const sulco = useRef<THREE.Mesh>(null);
    const puffs = useRef(Array.from({ length: 28 }, () => ({ p: new THREE.Vector3(), t: 99 })));
    const proximoPuff = useRef(0);
    const tmp = useMemo(() => ({ tan: new THREE.Vector3(), lado: new THREE.Vector3(), cam: new THREE.Vector3(), olho: new THREE.Vector3(), alvo: new THREE.Vector3() }), []);
    const olhar = useRef(new THREE.Vector3(0, 0, 0));

    const ajusteCabine = useRef<(() => void) | null>(null);
    const chamuscado = useRef(false);
    const domado = useRef(false);
    useFrame(({ scene }, dt) => {
        const t = tRef.current;
        // no impacto o casco apaga: sem o brilho de fábrica, com a tinta
        // escurecida — destroço, não vitrine (o bloom estourava as asas)
        // no voo o marfim das asas já estourava no bloom contra o céu claro:
        // fica um tom abaixo desde o primeiro quadro
        const escurece = (k: number, rough: number) => aviao.current?.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (!m || !('emissive' in m) || !(o as THREE.Mesh).isMesh) return;
            const c = m.clone(); c.emissiveIntensity = 0; c.color.multiplyScalar(k); c.roughness = Math.max(c.roughness, rough);
            (o as THREE.Mesh).material = c;
        });
        if (!domado.current && aviao.current) { domado.current = true; escurece(.82, .6); }
        if (t >= 10.45 && !chamuscado.current && aviao.current) { chamuscado.current = true; escurece(.75, .8); }
        const u = progressoDaQueda(t);
        const pos = CAMINHO.getPointAt(u);
        CAMINHO.getTangentAt(Math.min(.999, u), tmp.tan);
        const g = aviao.current;
        if (g) {
            if (t < 10.45) {
                g.position.copy(pos);
                tmp.alvo.copy(pos).add(tmp.tan);
                g.lookAt(tmp.alvo);
            } else {
                // os destroços: o avião fica de nariz enfiado no feno
                // derrapa 0,3 s e quica antes de assentar no feno
                const d = Math.min(1, (t - 10.45) / .3);
                const quique = Math.sin(d * Math.PI) * .45 * (1 - d);
                g.position.set(-2.2 + (1 - d) * 1.4, 1.05 + quique, 33.4 + (1 - d) * 1.2);   // afundado no feno
                g.rotation.set(-.55 * d, 1.9, .2 + (1 - d) * .5 + d * .26);   // asa de frente para a lente, não de fio
            }
        }
        // o motor tossindo: tranco na rolagem; morto: a hélice para
        const tosse = t > 2.6 ? Math.max(0, Math.sin(t * 9)) * Math.min(1, (t - 2.6)) : 0;
        if (balanco.current) {
            balanco.current.rotation.z = Math.sin(t * 1.3) * .08 + tosse * .18 * Math.sin(t * 23) + (t > 7.4 ? Math.sin(t * 2.2) * .35 : 0);
            balanco.current.rotation.x = t > 7.4 ? -.25 : tosse * .05;
        }
        helice.current = t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 1.5);
        if (refs.legL.current && refs.legL.current.rotation.x === 0) {
            if (refs.body.current) refs.body.current.rotation.y = Math.PI;
            for (const l of [refs.legL, refs.legR]) if (l.current) l.current.rotation.x = -1.5;
            if (refs.shadow.current) refs.shadow.current.visible = false;
        }
        for (const a of [refs.armL, refs.armR]) if (a.current) a.current.rotation.x = t > 7.4 ? -2.6 + Math.sin(t * 12) * .3 : -1.15;

        // fumaça saindo do motor depois do primeiro engasgo
        if (t > 10.5 && t > proximoPuff.current) {
            // os destroços continuam fumegando
            proximoPuff.current = t + .18;
            const livre = puffs.current.find((p) => p.t > 1.6) ?? puffs.current[0];
            livre.p.set(-1.6 + Math.random() * .4, 1.6, 33.2); livre.t = 0;
        }
        if (t > 2.6 && t < 10.4 && t > proximoPuff.current) {
            proximoPuff.current = t + (t > 5 ? .06 : .14);
            const livre = puffs.current.find((p) => p.t > 1.6) ?? puffs.current[0];
            livre.p.copy(pos); livre.t = 0;
        }
        puffs.current.forEach((p, i) => {
            p.t += dt;
            const m = fumaca.current?.children[i] as THREE.Sprite | undefined; if (!m) return;
            m.visible = p.t < 1.6;
            m.position.copy(p.p); m.position.y += p.t * .6;
            m.scale.setScalar(Math.min(2.5, .6 + p.t * 1.5));
            // some perto da lente em vez de sumir de uma vez
            const perto = THREE.MathUtils.smoothstep(m.position.distanceTo(camera.position), 1.5, 5);
            m.material.opacity = .6 * (1 - p.t / 1.6) * perto;
        });
        // a poeira do baque no feno
        const pq = Math.max(0, t - 10.4);
        if (poeira.current) {
            poeira.current.visible = pq > 0 && pq < 1.6;
            poeira.current.children.forEach((c, i) => {
                const a = i / poeira.current!.children.length * Math.PI * 2;
                c.position.set(-2 + Math.cos(a) * pq * 3, 1 + pq * (1 + (i % 3) * .4), 33 + Math.sin(a) * pq * 3);
                c.scale.setScalar(.5 + pq * 1.2);
                // perto da lente a poeira some (antes cobria o avião e estourava no bloom)
                (c as THREE.Sprite).material.opacity = .35 * Math.max(0, 1 - pq / 1.6) * THREE.MathUtils.smoothstep(c.position.distanceTo(camera.position), 2.5, 6);
            });
        }

        if (sulco.current) sulco.current.visible = t > 10.45;
        // lascas de madeira e feno voando no baque, com gravidade
        if (lascas.current) {
            lascas.current.visible = pq > 0 && pq < 2;
            lascas.current.children.forEach((c, i) => {
                const a = i * 2.4, v = 3 + (i % 5);
                c.position.set(-2.2 + Math.cos(a) * v * pq * .6, 1.4 + v * pq - 4.9 * pq * pq, 33.4 + Math.sin(a) * v * pq * .6);
                c.rotation.set(pq * (5 + i), pq * 3, i);
            });
        }
        // ── A CÂMERA: um plano só, que muda de lugar sem cortar ──────────
        tmp.lado.crossVectors(tmp.tan, THREE.Object3D.DEFAULT_UP).normalize();
        const k1 = THREE.MathUtils.smoothstep(t, 3.4, 4.8);   // perseguição → lado (e segura de lado ~1,5 s)
        const k2 = THREE.MathUtils.smoothstep(t, 6.0, 8.6);   // lado → atrás e alto (revela a cidade)
        // Em pé a lente é estreita: tudo mais longe, e uma órbita lenta no
        // começo para o plano não ficar parado.
        const rr = size.width < size.height ? 1.45 : 1;
        const orbita = Math.min(t, 3.6) * .1;
        const atras = tmp.tan.clone().multiplyScalar(-7 * rr).addScaledVector(tmp.lado, 3 * rr + Math.sin(orbita) * 4).add(new THREE.Vector3(0, 2 * rr, 0));
        const deLado = tmp.lado.clone().multiplyScalar(8.5 * rr).addScaledVector(tmp.tan, 1).add(new THREE.Vector3(0, .8, 0));
        // perto o bastante para o avião continuar sendo o assunto do plano
        const revela = tmp.tan.clone().multiplyScalar(-13 * rr).add(new THREE.Vector3(0, 6.5 * rr, 0));
        tmp.cam.copy(atras).lerp(deLado, k1).lerp(revela, k2).add(pos);
        // ── O POUSO: UM SÓ MOVIMENTO ATÉ O PLANO HERÓI ──────────────────
        // Da perseguição a câmera desce, numa curva só (smootherstep de 1,6 s),
        // até um três-quartos baixo dos destroços no feno. Sem dois alvos
        // encadeados e sem troca de lente brusca: era isso que lia como salto.
        // persegue até o impacto; no baque segura parado 0,3 s; depois um
        // empurrão lento de 1,5 s até o plano herói
        const pouso = t < 10.45 ? smoother((t - 9.4) / 1.05) * .55 : .55 + .45 * smoother((t - 10.75) / 1.5);
        tmp.cam.lerp(HEROI, pouso);
        // o motor morrendo e o baque tremem o quadro
        const tranco = Math.max(0, 1 - Math.abs(t - 5.05) / .18) + Math.max(0, 1 - Math.abs(t - 10.45) / .3) * 1.6;
        tmp.cam.x += Math.sin(t * 91) * tranco * .35; tmp.cam.y += Math.cos(t * 77) * tranco * .25;
        camera.position.lerp(tmp.cam, 1 - Math.exp(-dt * 3.2));
        // o olhar: o avião, e no mergulho metade do olhar vai para a cidade
        tmp.olho.copy(pos).lerp(new THREE.Vector3(0, 0, 8), k2 * .4 * (1 - pouso)).lerp(DESTROCOS, pouso);
        olhar.current.lerp(tmp.olho, 1 - Math.exp(-dt * 6));
        camera.lookAt(olhar.current);
        // durante o rádio: a câmera chega perto aos poucos e rola de leve
        if (t < 5.2) camera.rotateZ(Math.sin(t * .8) * .045 * THREE.MathUtils.smoothstep(t, .5, 2.5));
        // Rede de segurança do enquadramento: se o avião escapa para a borda
        // (a lente é estreita em pé), o olhar puxa de volta para ele.
        if (t < 10.45) {
            camera.updateMatrixWorld();
            const ndc = pos.clone().project(camera);
            const fuga = Math.max(0, Math.abs(ndc.x) - .4, Math.abs(ndc.y) - .6);
            if (fuga > 0 || ndc.z > 1) { olhar.current.lerp(pos, Math.min(1, fuga * 2 + (ndc.z > 1 ? 1 : 0))); camera.lookAt(olhar.current); }
        }
        if (import.meta.env.DEV) (window as unknown as { __f13cam?: unknown }).__f13cam = { cam: camera.position.toArray(), aviao: pos.toArray(), olhar: olhar.current.toArray(), t };
        // ── PRIMEIRA PESSOA: o hóspede está na cabine ────────────────────
        // Tudo acima calcula o avião; a câmera, porém, é a cabeça do
        // piloto: ela anda com o casco (balanço, rolagem, tranco) e olha
        // pelo nariz. No mergulho a cabeça vira para a cidade que aparece
        // embaixo; no baque, sacode e fica caída de lado; depois ergue
        // devagar e encara Vindhjem.
        const b = balanco.current;
        if (b) {
            b.updateMatrixWorld(true);
            // olho alto o bastante para o nariz e a hélice ficarem abaixo da
            // linha do painel (antes eram um borrão escuro no meio da cidade)
            b.localToWorld(tmp.cam.set(0, 1.2, .62));
            // o olhar desce um pouco abaixo do horizonte: as ilhas no meio da
            // janela, não o céu estourado de branco em cima delas
            b.localToWorld(tmp.olho.set(0, -.6, -8));
            const cidade = new THREE.Vector3(0, 3, 0);
            const vira = THREE.MathUtils.smoothstep(t, 6.2, 8.4) * (1 - THREE.MathUtils.smoothstep(t, 9.2, 9.9)) * .55
                + THREE.MathUtils.smoothstep(t, 10.9, 12.2) * .85;
            tmp.olho.lerp(cidade, vira);
            const tranco = Math.max(0, 1 - Math.abs(t - 5.05) / .25) * .6 + Math.max(0, 1 - Math.abs(t - 10.45) / .5) * 1.5;
            tmp.cam.x += Math.sin(t * 91) * tranco * .06; tmp.cam.y += Math.cos(t * 77) * tranco * .05;
            // vento e motor: um tremor fino o tempo todo em voo
            const voo = t < 10.45 ? 1 : 0;
            tmp.cam.y += Math.sin(t * 43) * .004 * voo;
            camera.position.copy(tmp.cam);
            olhar.current.lerp(tmp.olho, 1 - Math.exp(-dt * (t > 10.4 ? 3 : 8)));
            camera.lookAt(olhar.current);
            // a cabeça rola com o avião; depois do baque, tomba e se endireita
            const tomba = t > 10.45 ? .35 * Math.max(0, 1 - (t - 10.6) / 1.4) : 0;
            camera.rotateZ(Math.sin(t * .9) * .03 * voo + tomba);
            // o baque sacode a cabeça de verdade (girando, não só deslocando)
            const baque = Math.max(0, 1 - Math.abs(t - 10.5) / .35);
            if (baque > 0) { camera.rotateX(Math.sin(t * 67) * .06 * baque); camera.rotateY(Math.cos(t * 59) * .05 * baque); }
        }
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = 72 - 6 * THREE.MathUtils.smoothstep(t, 10.9, 12.4);
            camera.updateProjectionMatrix();
        }
        ajusteCabine.current?.();
        // na queda a câmera está longe da cidade: a névoa do chão (feita para
        // quem anda) virava um lençol cinza na janela. Fina no voo, cheia ao pousar.
        if (scene.fog instanceof THREE.FogExp2) scene.fog.density = THREE.MathUtils.lerp(.0011, .0042, THREE.MathUtils.smoothstep(t, 10.4, 12.4));
    });

    return <group>
        <group ref={aviao}>
            <group ref={balanco} rotation={[0, Math.PI, 0]}>
                {/* o casco não é desenhado: a câmera é a cabeça do piloto e as peças
                    dele cortavam a borda de baixo do quadro */}
                <group visible={false}><CascoDoElevador aberturaRef={abertura} heliceRef={helice} /></group>
                {/* o piloto é o próprio hóspede, o mesmo modelo que se joga depois */}
                {/* o piloto é o hóspede — e a câmera é a cabeça dele, então o corpo não é desenhado */}
            </group>
        </group>
        <Cabine tRef={tRef} ajuste={ajusteCabine} />
        <group ref={fumaca}>
            {puffs.current.map((_, i) => <sprite key={i} visible={false} material={matFumaca(i)} />)}
        </group>
        {/* o sulco que o avião abriu na grama */}
        <mesh ref={sulco} position={[.2, .03, 35.2]} rotation={[-Math.PI / 2, 0, .9]} visible={false}>
            <planeGeometry args={[1.6, 5]} /><meshStandardMaterial map={texturaDoSulco()} roughness={1} transparent depthWrite={false} />
        </mesh>
        <group ref={lascas} visible={false}>
            {Array.from({ length: 30 }, (_, i) => <mesh key={i}><boxGeometry args={[.06 + (i % 3) * .03, .03, .2 + (i % 4) * .08]} /><meshStandardMaterial color={i % 3 ? '#8a6440' : '#d9b85a'} /></mesh>)}
        </group>
        <group ref={poeira} visible={false}>
            {Array.from({ length: 26 }, (_, i) => <sprite key={i} material={matPoeira(i)} />)}
        </group>
    </group>;
};

// ═══ O JOGADOR ═══════════════════════════════════════════════════════════════
/** Obstáculos redondos: casas, forja, templo, poço, barracas. */
const OBSTACULOS: ReadonlyArray<{ x: number; z: number; r: number; soProcura?: boolean }> = Object.freeze([
    // as casas colidem como retângulos (foraDasCasas); o círculo aqui só
    // serve a quem procura um lugar livre (a chegada pelo Modo Criador)
    ...LUGAR_DAS_CASAS.map((l) => ({ x: l.x, z: l.z, r: 2.6, soProcura: true })),
    { x: -7.5, z: 4, r: 2.4 }, { x: 7.8, z: 12.5, r: 2.4 },
    { x: 0, z: 8, r: 1.4 }, { x: 4.2, z: 1.5, r: .7 },
    // barracas: 1,9 × 1,3 m com o toldo — raio que cobre as pontas do balcão
    { x: -6, z: 12, r: 1.25 }, { x: -3.2, z: 14, r: 1.25 }, { x: 6, z: 11, r: 1.25 },
    { x: -23, z: 4.5 - 1.5, r: 1.1 },
    // o templo: os quatro mourões ficam a 1,27 m do sino — o raio os cobre
    { x: SINO.x, z: SINO.z, r: 1.75 }, { x: -2, z: 33, r: 1.3 },
    // mourões do telheiro da forja e as tochas: a câmera (primeira pessoa)
    // entrava neles e um poste enchia a tela
    ...[[-24.4, 3.5], [-21.6, 3.5], [-24.4, 6.1], [-21.6, 6.1]].map(([x, z]) => ({ x, z, r: .45 })),
    ...TOCHAS.map(([x, , z]) => ({ x, z, r: .4 })),
]);

const Jogador: React.FC<{
    jog: React.MutableRefObject<Jog>;
    entrada: React.MutableRefObject<{ x: number; z: number }>;
    yaw: React.MutableRefObject<number>;
    ativo: boolean;
}> = ({ jog, entrada, yaw, ativo }) => {
    const refs = useAvatarRefs();
    const g = useRef<THREE.Group>(null);
    const ultimoPasso = useRef(false);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, .05), j = jog.current, t = clock.elapsedTime;
        const o = g.current; if (!o) return;
        let mx = 0, mz = 0;
        if (ativo && j.levantando <= 0) {
            const e = entrada.current, s = Math.sin(yaw.current), c = Math.cos(yaw.current);
            // direita da câmera = (cos, -sen); frente = (-sen, -cos); tela para baixo = para trás
            mx = e.x * c + e.z * s; mz = -e.x * s + e.z * c;
        }
        const n = Math.hypot(mx, mz);
        const vel = 4.2;
        if (n > .05) {
            const k = Math.min(1, n);
            let nx = j.x + mx / n * vel * k * dt, nz = j.z + mz / n * vel * k * dt;
            for (const ob of OBSTACULOS) {
                if (ob.soProcura) continue;
                const dx = nx - ob.x, dz = nz - ob.z, d = Math.hypot(dx, dz), r = ob.r + .35;
                if (d < r && d > 1e-4) { nx = ob.x + dx / d * r; nz = ob.z + dz / d * r; }
            }
            // as casas são retângulos compridos (com a escala de cada uma)
            const fora = foraDasCasas(nx, nz, .38);
            j.x = fora.x; j.z = fora.z;
            let da = Math.atan2(mx, mz) - j.ang;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            j.ang += da * Math.min(1, dt * 12);
            j.andando = Math.min(1, j.andando + dt * 6);
            // um som por passo: a fase do ciclo cruzando zero
            const fase = Math.sin(t * 9);
            if ((fase > 0) !== ultimoPasso.current) {
                ultimoPasso.current = fase > 0;
                const naIlha = ILHAS_R.some((il) => Math.hypot(j.x - il.x, j.z - il.z) <= il.r);
                tocarPasso(!naIlha);
            }
        } else j.andando = Math.max(0, j.andando - dt * 6);
        // ── O CHÃO: ilha, ponte ou céu ───────────────────────────────────
        const chao = chaoEm(j.x, j.z);
        if (chao !== null && j.y <= chao + .6) {
            j.y += (chao - j.y) * Math.min(1, dt * 14); j.vy = 0;
            j.seguro = { x: j.x, z: j.z };
        } else {
            j.vy -= 22 * dt; j.y += j.vy * dt;
            if (j.y < -14) { j.x = j.seguro.x; j.z = j.seguro.z; j.y = (chaoEm(j.x, j.z) ?? 0) + 2; j.vy = 0; }
        }
        if (j.levantando > 0) j.levantando = Math.max(0, j.levantando - dt * .9);
        o.position.set(j.x, j.y, j.z);
        o.rotation.set(-j.levantando * 1.35, j.ang, 0);
        const f = t * 9, a = j.andando;
        const set = (r: React.MutableRefObject<THREE.Group | null>, v: number) => { if (r.current) r.current.rotation.x = v; };
        set(refs.legL, Math.sin(f) * .8 * a); set(refs.legR, -Math.sin(f) * .8 * a);
        set(refs.armL, -Math.sin(f) * .6 * a); set(refs.armR, Math.sin(f) * .6 * a);
        if (refs.body.current) refs.body.current.position.y = Math.abs(Math.sin(f)) * .06 * a;
    });
    return <group ref={g} visible={false}><Avatar64 refs={refs} /></group>;
};

/** Câmera de terceira pessoa: atrás e acima, girando com o dedo direito. */
const CameraDeExplorar: React.FC<{
    jog: React.MutableRefObject<Jog>; yaw: React.MutableRefObject<number>; pitch: React.MutableRefObject<number>; ativo: boolean;
    foco: React.MutableRefObject<THREE.Vector3 | null>;
    portaAlvo: React.MutableRefObject<THREE.Vector3 | null>;
}> = ({ jog, yaw, pitch, ativo, foco, portaAlvo }) => {
    const passo = useRef(0);
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const alvo = useRef(new THREE.Vector3());
    const empurra = useRef(0);
    useFrame((_, dt) => {
        // na saída (a porta certa aberta) quem conduz a câmera é a SaidaDoAndar
        if (!ativo || portaAlvo.current) return;
        const j = jog.current;
        const retrato = size.width < size.height;
        // ── PRIMEIRA PESSOA ─────────────────────────────────────────────
        // os olhos do hóspede: 1,72 m acima do pé, com o balanço do passo
        passo.current += dt * (j.andando > .1 ? 9 : 0);
        const bob = Math.sin(passo.current) * .045 * j.andando, lado = Math.cos(passo.current * .5) * .03 * j.andando;
        const ent = entidadeNaCena.valor;
        const olho = new THREE.Vector3(j.x + Math.cos(yaw.current) * lado, j.y + 1.72 + bob - j.levantando * 1.2, j.z - Math.sin(yaw.current) * lado);
        if (ent && foco.current) {
            // a entidade: o olho recua 1,3 m (suave) para caber mão e rosto
            const dx0 = foco.current.x - j.x, dz0 = foco.current.z - j.z, d0 = Math.hypot(dx0, dz0) || 1, k = 1;
            olho.x -= dx0 / d0 * .9 * k; olho.z -= dz0 / d0 * .9 * k; olho.y += .1 * k;
            // olho na altura do rosto dele (ele levita e às vezes está num
            // degrau acima): de baixo, a câmera via o queixo e o céu
            const chaoE = chaoEm(foco.current.x, foco.current.z) ?? j.y;
            olho.y = Math.max(olho.y, chaoE + 1.95);
        }
        camera.position.lerp(olho, 1 - Math.exp(-dt * 18));
        if (foco.current) {
            // conversa: o olhar vai sozinho para o rosto de quem fala
            const f = foco.current, chaoF = chaoEm(f.x, f.z) ?? j.y;
            empurra.current = ent ? Math.min(1, empurra.current + dt * .12) : 0;
            // a entidade: um passo atrás (recuo suave da câmera) e o olhar puxa
            // para o lado do braço erguido — mão e rosto inteiros, acima da caixa
            // de fala (antes a mão saía cortada pela borda)
            let ax = f.x, az = f.z;
            if (ent) {
                const dx0 = f.x - j.x, dz0 = f.z - j.z, d0 = Math.hypot(dx0, dz0) || 1;
                const k = Math.min(1, empurra.current * 4);
                ax += dz0 / d0 * .05 * k; az += -dx0 / d0 * .05 * k;
            }
            alvo.current.lerp(new THREE.Vector3(ax, chaoF + (ent ? 1.95 : 1.78), az), 1 - Math.exp(-dt * 4));
            const dx = alvo.current.x - camera.position.x, dz = alvo.current.z - camera.position.z;
            yaw.current = Math.atan2(-dx, -dz);
            pitch.current = Math.atan2(alvo.current.y - camera.position.y, Math.hypot(dx, dz));
            camera.lookAt(alvo.current);
            if (ent) camera.rotateZ((.05 + entidadeNaCena.linha * .045) * Math.min(1, empurra.current * 3) * (entidadeNaCena.linha % 2 ? -1 : 1));
        } else {
            empurra.current = 0;
            const cp = Math.cos(pitch.current);
            alvo.current.set(camera.position.x - Math.sin(yaw.current) * cp, camera.position.y + Math.sin(pitch.current), camera.position.z - Math.cos(yaw.current) * cp);
            camera.lookAt(alvo.current);
            camera.rotateZ(-lado * .15);
        }
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += ((retrato ? 78 : 68) - (ent ? 3 + entidadeNaCena.linha * 3 : 0) - camera.fov) * Math.min(1, dt * 3);
            camera.updateProjectionMatrix();
        }
    });
    return null;
};

/**
 * Compila todos os shaders do andar ANTES do primeiro quadro, em paralelo
 * (KHR_parallel_shader_compile): eram ~100 programas compilados de uma vez
 * no primeiro render, travando a entrada por segundos. Enquanto isso o
 * Canvas não desenha (frameloop 'never') e a tela fica no escuro da chegada.
 */
const PreCompila: React.FC<{ aoTerminar: () => void }> = ({ aoTerminar }) => {
    const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene), camera = useThree((s) => s.camera);
    useEffect(() => {
        let vivo = true;
        // espera um tique para o mundo montar (Suspense dos GLB) e compila tudo
        const id = window.setTimeout(() => {
            const fim = () => { if (vivo) aoTerminar(); };
            (gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera))).then(fim, fim);
        }, 50);
        return () => { vivo = false; window.clearTimeout(id); };
    }, [gl, scene, camera, aoTerminar]);
    return null;
};

/** Acha o que está ao alcance e avisa quando muda. */
const Radar: React.FC<{
    jog: React.MutableRefObject<Jog>; est: React.MutableRefObject<ReturnType<typeof novoEstado13>>;
    ativo: boolean; aoMudar: (a: Alvo | null) => void; aoEntidade: () => void; yaw: React.MutableRefObject<number>;
    onde: Record<IdNpc, React.MutableRefObject<{ x: number; z: number }>>;
}> = ({ jog, est, ativo, aoMudar, aoEntidade, yaw, onde }) => {
    const ultimo = useRef('');
    // fora da exploração (diálogo, saída) o alvo antigo não vale mais: ao
    // voltar, o radar anuncia de novo o que estiver à frente, do zero
    useEffect(() => { if (!ativo) { ultimo.current = ''; aoMudar(null); } }, [ativo, aoMudar]);
    useFrame(({ clock }) => {
        if (!ativo) return;
        const j = jog.current, e = est.current;
        const perto = (x: number, z: number, r: number) => Math.hypot(j.x - x, j.z - z) < r;
        const hl = LUGAR_DOS_NPCS.halvard;
        let achou: Alvo | null = null, melhor = Infinity;
        const tenta = (a: Alvo, x: number, z: number, r: number, angMax = 1.05, colado = 1) => {
            // só o que está à frente do olhar (primeira pessoa), e o mais
            // centrado vence: o de trás ou fora da tela não ganha o botão
            const d = Math.hypot(j.x - x, j.z - z);
            if (d >= r) return;
            let ang = Math.atan2(-(x - j.x), -(z - j.z)) - yaw.current;
            while (ang > Math.PI) ang -= Math.PI * 2;
            while (ang < -Math.PI) ang += Math.PI * 2;
            if (d > colado && Math.abs(ang) > angMax) return;
            const nota = d * (1 + Math.abs(ang) * 1.5);
            if (nota < melhor) { melhor = nota; achou = a; }
        };
        for (const [id, l] of Object.entries(LUGAR_DOS_NPCS) as [IdNpc, { x: number; z: number; ronda?: number }][]) {
            if (id === 'halvard' && e.entidade === 'caido') continue;
            // quem faz ronda (a menina em volta do poço) é achado onde está agora
            const o = onde[id].current;
            tenta({ tipo: 'npc', id }, o.x, o.z, l.ronda ? 2.4 : 2.3);
        }
        if (!e.temMartelo) tenta({ tipo: 'martelo' }, MARTELO.x, MARTELO.z, 1.8);
        OVELHAS.forEach((o, i) => { if (!e.ovelhas[i]) tenta({ tipo: 'ovelha', i }, o.x, o.z, 1.9); });
        tenta({ tipo: 'sino' }, SINO.x, SINO.z, 2.4);
        // bater: só com a PORTA à frente do olho (±43°) e o hóspede diante
        // dela — de lado, de costas ou olhando o céu não aparece o botão
        CASAS.forEach((_, i) => {
            const p = portaNoMundo(i);
            if ((j.x - p.x) * p.fx + (j.z - p.z) * p.fz < .5) return;
            tenta({ tipo: 'casa', i }, p.x, p.z, 3.8, .75, 0);
        });
        const k = chaveDoAlvo(achou);
        if (k !== ultimo.current) { ultimo.current = k; aoMudar(achou); }
    });
    return null;
};

/** O martelo no chão da ilha do pouso, brilhando de leve. */
const Martelo: React.FC<{ visivel: boolean }> = ({ visivel }) => {
    const g = useRef<THREE.Group>(null);
    useFrame(({ clock }) => { if (g.current) { g.current.rotation.y = clock.elapsedTime; g.current.position.y = .35 + Math.sin(clock.elapsedTime * 2) * .08; } });
    if (!visivel) return null;
    return <group position={[MARTELO.x, 0, MARTELO.z]}>
        <group ref={g}>
            <mesh rotation={[0, 0, .3]}><boxGeometry args={[.08, .7, .08]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
            <mesh position={[-.1, .33, 0]} rotation={[0, 0, .3]}><boxGeometry args={[.36, .16, .18]} /><meshStandardMaterial color="#8a8f98" metalness={.8} roughness={.3} emissive="#ffcf7a" emissiveIntensity={.25} /></mesh>
        </group>
    </group>;
};

/** O que acontece a cada quadro no mundo, fora do React: olhares, sino, porta. */
const Vivo: React.FC<{
    jog: React.MutableRefObject<Jog>; npcVis: Record<IdNpc, React.MutableRefObject<EstadoVisualNpc>>;
    sinoRef: React.RefObject<THREE.Group | null>; balanco: React.MutableRefObject<number>;
    portaCerta: React.RefObject<THREE.Group | null>; abrindo: boolean;
    onde: Record<IdNpc, React.MutableRefObject<{ x: number; z: number }>>;
}> = ({ jog, npcVis, sinoRef, balanco, portaCerta, abrindo, onde }) => {
    const p = useMemo(() => new THREE.Vector3(), []);
    const tempoPorta = useRef(0);
    useFrame(({ clock }, dt) => {
        const j = jog.current;
        p.set(j.x, j.y, j.z);
        for (const n of NPCS) {
            // pela posição de agora: a menina da ronda só para quando o hóspede
            // chega perto DELA, não do centro da volta
            const o = onde[n.id].current, parar = LUGAR_DOS_NPCS[n.id].ronda ? 3.2 : 5;
            // na saída a cidade inteira vira a cabeça para o hóspede, calada
            npcVis[n.id].current.olharPara = abrindo || Math.hypot(j.x - o.x, j.z - o.z) < parar ? p : null;
        }
        if (sinoRef.current) {
            balanco.current = Math.max(0, balanco.current - dt * .35);
            sinoRef.current.rotation.x = Math.sin(clock.elapsedTime * 5.5) * .5 * balanco.current;
        }
        // a porta de latão se abre ao meio, como a de um elevador
        if (portaCerta.current && abrindo) {
            const luz = portaCerta.current.getObjectByName('luzDeDentro') as THREE.PointLight | undefined;
            if (luz) luz.intensity = Math.min(6, luz.intensity + dt * 3);
        }
        if (portaCerta.current && abrindo) portaCerta.current.children.forEach((c) => {
            if (c.name !== 'folha') return;
            // 0,4 s com a porta fechada (o ding), depois as folhas abrem em ~1,2 s
            tempoPorta.current += dt / 2;   // (o forEach roda duas folhas por quadro)
            if (tempoPorta.current < .4) return;
            // as folhas correm para dentro da parede (atrás das tábuas, z<0),
            // como porta de elevador embutida — nada sobra para fora do batente
            const alvo = (c.userData.lado as number) * .8;
            c.position.x += (alvo - c.position.x) * Math.min(1, dt * 2.4);
            c.position.z += (-.14 - c.position.z) * Math.min(1, dt * 6);
        });
    });
    return null;
};

/**
 * O sol que faz sombra. Um mapa de 2048 cobrindo só 36 unidades em volta do
 * jogador, que anda junto com ele: sombra nítida onde se olha, custo fixo.
 */
/**
 * Luz de preenchimento que sai da câmera: com o sol baixo atrás das ilhas,
 * quem fala virava silhueta preta. Fraca e fria, sem sombra — só devolve
 * o rosto e a roupa, como o rebatedor de um set.
 */
/** Bancada (só em DEV): chamadas de desenho, triângulos e luzes do quadro. */
const Sonda: React.FC = () => {
    useFrame(({ gl, scene }) => {
        if (!import.meta.env.DEV) return;
        let luzes = 0, pele = 0;
        scene.traverseVisible((o) => { if ((o as THREE.PointLight).isPointLight) luzes++; if ((o as THREE.SkinnedMesh).isSkinnedMesh) pele++; });
        // o compositor chama render várias vezes: soma o quadro inteiro
        (window as unknown as { __f13cena?: unknown }).__f13cena = scene;
        gl.info.autoReset = false;
        (window as unknown as { __f13gl?: unknown }).__f13gl = { ...gl.info.render, luzes, pele, programas: gl.info.programs?.length ?? 0, px: gl.getDrawingBufferSize(new THREE.Vector2()).toArray() };
        gl.info.reset();
    });
    return null;
};

const LuzDaCamera: React.FC<{ intensidade?: number }> = ({ intensidade = .9 }) => {
    const luz = useRef<THREE.DirectionalLight>(null);
    useFrame(({ camera }) => {
        const l = luz.current; if (!l) return;
        l.position.copy(camera.position);
        camera.getWorldDirection(l.target.position); l.target.position.multiplyScalar(10).add(camera.position);
        l.target.updateMatrixWorld();
    });
    return <directionalLight ref={luz} intensity={intensidade} color="#d8e2ff" />;
};

const escalaTmp = new THREE.Vector3();
const Sol: React.FC<{ jog: React.MutableRefObject<Jog>; mapa: number }> = ({ jog, mapa }) => {
    const luz = useRef<THREE.DirectionalLight>(null);
    const scene = useThree((s) => s.scene);
    const feito = useRef(0);
    // troca de nível: o mapa de sombra muda de tamanho (refeito no próximo quadro)
    useEffect(() => {
        const l = luz.current; if (!l) return;
        l.shadow.mapSize.set(mapa, mapa);
        l.shadow.map?.dispose(); l.shadow.map = null;
    }, [mapa]);
    useFrame((_, dt) => {
        const l = luz.current; if (!l) return;
        const j = jog.current;
        l.position.set(j.x + DIRECAO_DO_SOL.x * 60, j.y + DIRECAO_DO_SOL.y * 60, j.z + DIRECAO_DO_SOL.z * 60);
        l.target.position.set(j.x, j.y, j.z); l.target.updateMatrixWorld();
        // uma vez, depois que tudo montou: todo mundo projeta e recebe sombra
        feito.current += dt;
        if (feito.current > .5 && feito.current < 10) {
            scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (!m.isMesh || 'isInstancedMesh' in m || m.material instanceof THREE.ShaderMaterial || m.material instanceof THREE.MeshBasicMaterial) return;
                m.receiveShadow = true;
                // miudezas (pregos, argolas, frutas) não projetam: a sombra
                // delas some no filtro e cada uma custava uma chamada a mais
                if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
                m.getWorldScale(escalaTmp);
                const r = m.geometry.boundingSphere!.radius * Math.max(escalaTmp.x, escalaTmp.y, escalaTmp.z);
                m.castShadow = !m.userData.semSombra && r > .18;
            });
            feito.current = 10;
        }
    });
    return <directionalLight ref={luz} intensity={4.2} color="#ffd6a0" castShadow shadow-radius={4}
        shadow-bias={-.0004}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18}
        shadow-camera-near={1} shadow-camera-far={140} shadow-normalBias={.03} />;
};

/**
 * Reflexo de ambiente: o céu de Vindhjem (azul em cima, âmbar no horizonte,
 * terra embaixo) vira um mapa PMREM. Sem ele todo metal refletia preto e o
 * elmo de ferro lia como um aquário de vidro.
 */
const Ambiente: React.FC = () => {
    const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene);
    useEffect(() => {
        const cena = new THREE.Scene();
        const ceu = novoCeu(); cena.add(ceu);
        const pm = new THREE.PMREMGenerator(gl);
        const alvo = pm.fromScene(cena, .04);
        const antes = scene.environment;
        scene.environment = alvo.texture; scene.environmentIntensity = .85;
        pm.dispose(); ceu.geometry.dispose(); ceu.material.dispose();
        return () => { scene.environment = antes; alvo.dispose(); };
    }, [gl, scene]);
    return null;
};

// ═══ O ANDAR ═════════════════════════════════════════════════════════════════
/** Os três níveis de qualidade: o monitor desce um degrau se não segura ~40 qps. */
const QUALIDADE = [
    { dpr: 1 as number | [number, number], msaa: 0, ao: false, sombra: 1024, grama: 20 },
    { dpr: [1, 1.25] as [number, number], msaa: 2, ao: true, sombra: 1024, grama: 30 },
    { dpr: [1, 1.5] as [number, number], msaa: 4, ao: true, sombra: 2048, grama: 40 },
] as const;

// ── DESTINOS DO MODO CRIADOR ────────────────────────────────────────────
/** Onde o Modo Criador pode largar o hóspede dentro de Vindhjem. */
export type Inicio13 = 'explorar' | 'casaCerta' | 'entidade' | 'martelo' | 'sino' | 'ovelha' | IdNpc;
/** Ponto a 2,2 m do alvo, do lado do centro da ilha, e o giro para encará-lo. */
function pertoDe(x: number, z: number): { x: number; z: number; yaw: number } {
    const il = ILHAS_R.reduce((a, b) => Math.hypot(x - b.x, z - b.z) < Math.hypot(x - a.x, z - a.z) ? b : a);
    let dx = il.x - x, dz = il.z - z; const d = Math.hypot(dx, dz);
    if (d < .5) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
    const px = x + dx * 3, pz = z + dz * 3;
    return { x: px, z: pz, yaw: Math.atan2(-(x - px), -(z - pz)) };
}

export const Floor13: React.FC<{ onExit?: () => void; inicio?: string }> = ({ onExit, inicio }) => {
    const est = useRef(novoEstado13());
    const [, bump] = useReducer((x: number) => x + 1, 0);
    const [fase, setFase] = useState<Fase>('queda');
    // qualidade adaptativa: começa bonita; se o aparelho não segura ~45 qps,
    // baixa a resolução e depois desliga a oclusão ambiente — nesta ordem,
    // porque a resolução custa menos ao olho do que perder o AO
    // no celular (toque) já começa no nível do meio: a tela tem 3× a
    // densidade de pixels e a GPU uma fração da de um computador
    const [nivel, setNivel] = useState(() => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 1 : 2));
    const Q = QUALIDADE[nivel];
    useEffect(() => { alcanceDaGrama.valor = Q.grama; }, [Q]);
    const tQueda = useRef(0);
    const [legenda, setLegenda] = useState(LEGENDAS_DA_QUEDA[0].texto);
    const [flash, setFlash] = useState(0);
    const [apagao, setApagao] = useState(0);
    const jog = useRef<Jog>({ x: INICIO.x, y: 0, z: INICIO.z, ang: Math.PI, vy: 0, seguro: { ...INICIO }, levantando: 1, andando: 0 });
    const entrada = useRef({ x: 0, z: 0 });
    const yaw = useRef(0);
    const pitch = useRef(-.08);
    const foco = useRef<THREE.Vector3 | null>(null);
    const portaAlvo = useRef<THREE.Vector3 | null>(null);
    const portaFrente = useRef<THREE.Vector3 | null>(null);
    // ── A SAÍDA: a porta certa aberta, a cidade vira chuva, a cabine aparece
    const saidaT0 = useRef<number | null>(null);
    const [naCabine, setNaCabine] = useState(false);
    const efeitoChuva = useMemo(() => new EfeitoChuva(), []);
    const [alvo, setAlvo] = useState<Alvo | null>(null);
    const alvoAtual = useRef<Alvo | null>(null); alvoAtual.current = alvo;
    const [falas, setFalas] = useState<Fala[] | null>(null);
    const [linha, setLinha] = useState(0);
    const [digitado, setDigitado] = useState(0);
    const [glitch, setGlitch] = useState(false);
    // a entidade escala a cada fala: sobe mais, contorce mais, a câmera inclina mais
    useEffect(() => {
        entidadeNaCena.linha = glitch ? linha : 0;
        if (glitch) npcVis.halvard.current.possessao = Math.min(2.2, 1 + linha * .4);
    }, [glitch, linha]);
    const [conexao, setConexao] = useState(false);
    const aoFimDoDialogo = useRef<(() => void) | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const achadas = useMemo(() => OVELHAS.map(() => ({ current: false })), []);
    const npcOnde = useMemo(() => Object.fromEntries(NPCS.map((n) => [n.id, { current: { x: LUGAR_DOS_NPCS[n.id].x, z: LUGAR_DOS_NPCS[n.id].z } }])) as Record<IdNpc, React.MutableRefObject<{ x: number; z: number }>>, []);
    const erradas = useRef(0);
    const [compilado, setCompilado] = useState(false);
    const npcVis = useMemo(() => Object.fromEntries(NPCS.map((n) => [n.id, { current: { olharPara: null, falando: false, possessao: 0, caido: false } as EstadoVisualNpc }])) as Record<IdNpc, React.MutableRefObject<EstadoVisualNpc>>, []);
    const sinoRef = useRef<THREE.Group>(null), portaCerta = useRef<THREE.Group>(null);
    const balancoDoSino = useRef(0);
    const falando = useRef<IdNpc | null>(null);
    const estadoDoHospede = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });

    // Bancada (só em DEV): `window.__f13` teleporta, dá pistas e lê o estado.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as unknown as { __f13?: unknown }).__f13 = {
            ir: (x: number, z: number, ang = 0, yawCam = ang) => { const j = jog.current; j.x = x; j.z = z; j.y = chaoEm(x, z) ?? 0; j.ang = ang; yaw.current = yawCam; j.levantando = 0; },
            estado: () => est.current,
            onde: () => Object.fromEntries(Object.entries(npcOnde).map(([k, v]) => [k, { ...v.current }])),
            pistas: (...p: Pista[]) => { p.forEach((x) => est.current.pistas.add(x)); bump(); },
            pular: () => { tQueda.current = DURACAO_DA_QUEDA; },
            // o mesmo que o botão de ação (a bancada a 2 qps erra o clique)
            agir: () => acao.current(),
            porta: (i: number) => portaNoMundo(i),
            alvo: () => chaveDoAlvo(alvoAtual.current),
            casaCerta: () => { (['latao', 'fumaca', 'botao'] as Pista[]).forEach((x) => est.current.pistas.add(x)); bump(); const d = portaNoMundo(CASA_CERTA), p = { x: d.x + d.fx * 3.2, z: d.z + d.fz * 3.2 }, a = Math.atan2(d.fx, d.fz); const j = jog.current; j.x = p.x; j.z = p.z; j.y = chaoEm(p.x, p.z) ?? 3; j.ang = a + Math.PI; yaw.current = a; j.levantando = 0; },
        };
    }, []);

    // ── CHEGADA PELO MODO CRIADOR ────────────────────────────────────────
    // `inicio` pula a queda e larga o hóspede num ponto do andar, já
    // encarando o alvo. 'entidade' dá as duas pistas que acordam a entidade
    // e põe o hóspede diante de Halvard.
    useEffect(() => {
        if (!inicio) return;
        tQueda.current = DURACAO_DA_QUEDA;
        const id = window.setTimeout(() => {
            const j = jog.current;
            const por = (x: number, z: number) => { const p = pertoDe(x, z); j.x = p.x; j.z = p.z; j.y = chaoEm(p.x, p.z) ?? 0; j.ang = p.yaw + Math.PI; yaw.current = p.yaw; j.levantando = 0; };
            const npc = LUGAR_DOS_NPCS[inicio as IdNpc];
            if (inicio === 'casaCerta') {
                // de frente para a porta, fora do beiral (na soleira a câmera
                // em primeira pessoa ficava dentro do telhado)
                const d = portaNoMundo(CASA_CERTA), p = { x: d.x + d.fx * 3.2, z: d.z + d.fz * 3.2 }, a = Math.atan2(d.fx, d.fz);
                (['latao', 'fumaca', 'botao'] as Pista[]).forEach((x) => est.current.pistas.add(x)); bump();
                j.x = p.x; j.z = p.z; j.y = chaoEm(p.x, p.z) ?? 3; j.ang = a + Math.PI; yaw.current = a; j.levantando = 0;
            } else if (inicio === 'entidade') {
                (['latao', 'fumaca'] as Pista[]).forEach((x) => est.current.pistas.add(x)); bump();
                por(LUGAR_DOS_NPCS.halvard.x, LUGAR_DOS_NPCS.halvard.z);
            } else if (inicio === 'martelo') por(MARTELO.x, MARTELO.z);
            else if (inicio === 'sino') por(SINO.x, SINO.z);
            else if (inicio === 'ovelha') por(OVELHAS[0].x, OVELHAS[0].z);
            // quem faz ronda: chega onde a pessoa está agora, não no centro da volta
            else if (npc?.ronda) {
                // quem faz ronda (a menina em volta do poço): chega por fora da
                // volta, a 2,6 m de onde ela está agora, de frente para ela (no
                // centro da volta está o poço); ela para quando o hóspede chega
                const o = npcOnde[inicio as IdNpc].current;
                let dx = o.x - npc.x, dz = o.z - npc.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
                // o ponto de chegada gira em volta dela até achar um lugar com
                // folga: a 1,2 m de uma barraca o olho ficava dentro do toldo
                // (uma listra de lona enchia um terço da tela)
                const a0 = Math.atan2(dx, dz);
                let qx = o.x + dx * 2.6, qz = o.z + dz * 2.6;
                for (let k = 0; k < 24; k++) {
                    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12;
                    const cx = o.x + Math.sin(a) * 2.6, cz = o.z + Math.cos(a) * 2.6;
                    const folga = OBSTACULOS.every((ob) => Math.hypot(cx - ob.x, cz - ob.z) >= ob.r + 1.4);
                    if (folga && chaoEm(cx, cz) !== null && Math.hypot(cx - npc.x, cz - npc.z) >= npc.ronda + .8) { qx = cx; qz = cz; break; }
                }
                for (const ob of OBSTACULOS) {
                    const ddx = qx - ob.x, ddz = qz - ob.z, dd = Math.hypot(ddx, ddz), r = ob.r + .45;
                    if (dd < r && dd > 1e-4) { qx = ob.x + ddx / dd * r; qz = ob.z + ddz / dd * r; }
                }
                const yq = Math.atan2(-(o.x - qx), -(o.z - qz));
                j.x = qx; j.z = qz; j.y = chaoEm(qx, qz) ?? 0; j.ang = yq + Math.PI; yaw.current = yq; j.levantando = 0;
                // ela para já no próximo quadro (a quadro lento ela ainda corria um
                // quarto da volta antes de notar o hóspede e saía do quadro)
                npcVis[inicio as IdNpc].current.olharPara = new THREE.Vector3(qx, j.y, qz);
            } else if (npc) por(npc.x, npc.z);
        }, 400);
        return () => window.clearTimeout(id);
    }, [inicio]);

    // ── A QUEDA: relógio, legendas, sons e o pulo ────────────────────────
    // (só começa quando os shaders do andar já compilaram — ver PreCompila)
    useEffect(() => {
        if (!compilado) return;
        tocarVento();
        let raf = 0, antes = performance.now();
        const marcos = { tosse: false, morre: false, baque: false };
        const passo = () => {
            const agora = performance.now();
            tQueda.current += Math.min(.1, (agora - antes) / 1000); antes = agora;
            if (import.meta.env.DEV && tFixo !== null) tQueda.current = tFixo;
            const t = tQueda.current;
            setLegenda(LEGENDAS_DA_QUEDA.find((l) => t < l.ate)!.texto);
            if (t > 2.6 && !marcos.tosse) { marcos.tosse = true; tocarMotorTossindo(); }
            if (t > 5.0 && !marcos.morre) { marcos.morre = true; tocarMotorMorrendo(); }
            if (t > 10.4 && !marcos.baque) { marcos.baque = true; tocarQueda(); }
            // o baque: clarão curto, depois tudo apaga (o hóspede apaga) e os
            // olhos se reabrem devagar, de cima e de baixo, como pálpebras
            setFlash(t > 10.4 ? Math.max(0, .55 - (t - 10.4) / .12) : 0);
            setApagao(t < 10.5 ? 0 : t < 10.62 ? (t - 10.5) / .12 : t < 11.1 ? 1 : Math.max(0, 1 - (t - 11.1) / .9));
            if (t >= DURACAO_DA_QUEDA) { setFase('explorar'); setFlash(0); setApagao(0); tocarAmbiente(); return; }
            raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
        const pular = () => { if (tQueda.current > .5 && tQueda.current < 10.3) tQueda.current = 10.3; };
        window.addEventListener('pointerdown', pular); window.addEventListener('keydown', pular);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('pointerdown', pular); window.removeEventListener('keydown', pular); pararVento(); pararAmbiente(); };
    }, [compilado]);

    // ── DIÁLOGO ──────────────────────────────────────────────────────────
    const abrirDialogo = useCallback((f: Fala[], quem: IdNpc | null, fim?: () => void) => {
        if (!f.length) { fim?.(); return; }
        setFalas(f); setLinha(0); setDigitado(0); setFase('dialogo');
        falando.current = quem;
        if (quem) {
            const o = npcOnde[quem].current;
            foco.current = new THREE.Vector3(o.x, (chaoEm(o.x, o.z) ?? 0) + 1.6, o.z);
            npcVis[quem].current.falando = true;
        }
        aoFimDoDialogo.current = fim ?? null;
        tocarFala(f[0].quem);
    }, [npcVis]);

    const fecharDialogo = useCallback(() => {
        if (falando.current) npcVis[falando.current].current.falando = false;
        falando.current = null; foco.current = null;
        setFalas(null); setGlitch(false);
        setFase((f) => (f === 'dialogo' ? 'explorar' : f));
        const fim = aoFimDoDialogo.current; aoFimDoDialogo.current = null;
        fim?.();
        bump();
    }, [npcVis]);

    // o texto aparece letra a letra
    useEffect(() => {
        if (!falas) return;
        const total = falas[linha].texto.length;
        if (digitado >= total) return;
        const id = window.setTimeout(() => setDigitado((d) => Math.min(total, d + 2)), glitch ? 22 : 16);
        return () => window.clearTimeout(id);
    }, [falas, linha, digitado, glitch]);

    const avancar = useCallback(() => {
        if (!falas) return;
        const total = falas[linha].texto.length;
        if (digitado < total) { setDigitado(total); return; }
        if (glitch && linha === falas.length - 1) return;   // a entidade não deixa pular o corte
        if (linha < falas.length - 1) {
            setLinha(linha + 1); setDigitado(0);
            if (glitch) tocarGlitch(); else tocarFala(falas[linha + 1].quem);
        } else fecharDialogo();
    }, [falas, linha, digitado, glitch, fecharDialogo]);

    // a última fala da entidade: quando termina de digitar, a conexão cai
    useEffect(() => {
        if (!glitch || !falas || linha !== falas.length - 1) return;
        if (digitado < falas[linha].texto.length) return;
        const id = window.setTimeout(() => {
            tocarDesconexao(); setConexao(true); pararAmbiente(); window.setTimeout(() => tocarAmbiente(), 4200);
            const h = npcVis.halvard.current;
            h.possessao = 0; h.caido = true;
            window.setTimeout(() => tocarCorpoCaindo(), 820);
            est.current.entidade = 'caido';
            // o preto dura pouco: a queda dele TEM de ser vista
            window.setTimeout(() => setConexao(false), 800);
            window.setTimeout(() => { entidadeNaCena.valor = false; fecharDialogo(); setAviso('Halvard caiu duro. Ninguém em volta parece notar.'); }, 3800);
        }, 350);
        return () => window.clearTimeout(id);
    }, [glitch, falas, linha, digitado, npcVis, fecharDialogo]);

    const comecarEntidade = useCallback(() => {
        if (est.current.entidade !== 'nao') return;
        est.current.entidade = 'falando';
        npcVis.halvard.current.possessao = 1;
        entidadeNaCena.valor = true;
        tocarGlitch();
        setGlitch(true);
        abrirDialogo([...ENTIDADE], 'halvard');
    }, [npcVis, abrirDialogo]);

    // ── AÇÃO ─────────────────────────────────────────────────────────────
    const agir = useCallback(() => {
        const a = alvo, e = est.current;
        if (!a || fase !== 'explorar') return;
        const antes = new Set(e.pistas);
        const avisarPista = () => {
            const nova = [...e.pistas].find((p) => !antes.has(p));
            if (nova) setAviso(`PISTA: ${PISTAS[nova].nome}`);
        };
        if (a.tipo === 'npc') {
            // Halvard, com duas pistas já ditas, não é mais Halvard.
            if (a.id === 'halvard' && entidadeAcorda(e)) { comecarEntidade(); return; }
            abrirDialogo(falarCom(e, a.id), a.id, avisarPista);
        } else if (a.tipo === 'martelo') {
            pegarMartelo(e); tocarPegar(); setAviso('Você pegou o martelo de Brokk.'); setAlvo(null);
        } else if (a.tipo === 'ovelha') {
            acharOvelha(e, a.i); achadas[a.i].current = true; tocarBalido();
            setAviso(`Ovelha achada (${e.ovelhas.filter(Boolean).length}/3). Ela volta sozinha para a Sigrun.`); setAlvo(null);
        } else if (a.tipo === 'sino') {
            marcarSino(e); tocarSino(); balancoDoSino.current = 1; setAviso('O sino ecoa por Vindhjem.');
        } else if (a.tipo === 'casa') {
            const primeiraVez = !e.casasBatidas.has(a.i);
            const r = baterNaCasa(e, a.i);
            if (r.certa) {
                tocarDingDaCasa(); setFase('elevador'); setAviso(null);
                {
                    // a porta (no centro da folha) e a direção para fora dela
                    // a posição REAL da porta no mundo (as casas têm torção e escala próprias)
                    const pc = portaCerta.current;
                    if (pc) {
                        pc.updateWorldMatrix(true, false);
                        portaAlvo.current = pc.getWorldPosition(new THREE.Vector3());
                        portaFrente.current = pc.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
                    } else {
                        const l = LUGAR_DAS_CASAS[a.i];
                        portaFrente.current = new THREE.Vector3(Math.sin(l.angulo), 0, Math.cos(l.angulo));
                        portaAlvo.current = new THREE.Vector3(l.x, l.y + .8, l.z).addScaledVector(portaFrente.current, 2.85);
                    }
                }
                // daqui em diante a SaidaDoAndar conduz: olhar para trás, a
                // chuva de runas, a cabine do elevador — e só então onExit
                saidaT0.current = performance.now();
            } else {
                // quem mora atende: a porta entreabre (a trancada da casa certa não)
                if (a.i !== CASA_CERTA) batidasNasCasas[a.i] = performance.now();
                const casa = a.i;
                abrirDialogo(r.falas, null, () => { conversaAcabou[casa] = performance.now(); });
                // porta errada: a vila repara. Na terceira, todo mundo para o
                // que está fazendo e encara o forasteiro, em silêncio
                // conta porta errada diferente: bater de novo na mesma não é suspeito
                if (a.i !== CASA_CERTA && primeiraVez) {
                    const n = ++erradas.current;
                    const recado = n === 1 ? 'Uma cortina se mexe na casa vizinha.' : n === 2 ? 'Alguém na praça parou de falar.' : 'Vindhjem inteira parou para te olhar.';
                    window.setTimeout(() => setAviso(recado), 1600);
                    if (n >= 3) window.setTimeout(() => {
                        tocarGlitch();
                        const j = jog.current, olho = new THREE.Vector3(j.x, j.y + 1.6, j.z);
                        for (const v of Object.values(npcVis)) if (!v.current.falando && !v.current.caido) v.current.olharPara = olho;
                        window.setTimeout(() => { for (const v of Object.values(npcVis)) if (v.current.olharPara === olho) v.current.olharPara = null; }, 6500);
                    }, 1600);
                }
            }
        }
        bump();
    }, [alvo, fase, abrirDialogo, achadas, onExit, comecarEntidade]);

    useEffect(() => { if (!aviso) return; const id = window.setTimeout(() => setAviso(null), 3200); return () => window.clearTimeout(id); }, [aviso]);

    // ── ENTRADA: teclado, joystick à esquerda, câmera à direita ──────────
    useEffect(() => {
        const teclas = new Set<string>();
        const atualizar = () => {
            if (toque.current.id !== null) return;
            const x = (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
            const z = (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0) - (teclas.has('w') || teclas.has('arrowup') ? 1 : 0);
            entrada.current = { x, z };
        };
        const down = (ev: KeyboardEvent) => {
            const k = ev.key.toLowerCase(); teclas.add(k); atualizar();
            if (k === 'e' || k === ' ' || k === 'enter') { ev.preventDefault(); acao.current(); }
            if (k === 'q') yaw.current += .3;
        };
        const up = (ev: KeyboardEvent) => { teclas.delete(ev.key.toLowerCase()); atualizar(); };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);
    const acao = useRef<() => void>(() => { });
    acao.current = () => { if (fase === 'dialogo') avancar(); else agir(); };

    const toque = useRef<{ id: number | null; ox: number; oy: number; cam: number | null; cx: number; cy: number }>({ id: null, ox: 0, oy: 0, cam: null, cx: 0, cy: 0 });
    const [jaAndou, setJaAndou] = useState(false);
    useEffect(() => { if (fase !== 'explorar') return; const id = window.setTimeout(() => setJaAndou(true), 6000); return () => window.clearTimeout(id); }, [fase]);
    const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
    const onDown = (ev: React.PointerEvent) => {
        if (fase !== 'explorar') return;
        const w = window.innerWidth;
        if (ev.clientX < w * .55 && toque.current.id === null) {
            toque.current.id = ev.pointerId; toque.current.ox = ev.clientX; toque.current.oy = ev.clientY;
            setStick({ ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 });
        } else if (toque.current.cam === null) { toque.current.cam = ev.pointerId; toque.current.cx = ev.clientX; toque.current.cy = ev.clientY; }
    };
    const onMove = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) {
            let dx = ev.clientX - t.ox, dy = ev.clientY - t.oy;
            const d = Math.hypot(dx, dy), R = 60;
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            entrada.current = { x: dx / R, z: dy / R };
            if (!jaAndou && d > 20) setJaAndou(true);
            setStick({ ox: t.ox, oy: t.oy, x: dx, y: dy });
        } else if (ev.pointerId === t.cam) {
            yaw.current -= (ev.clientX - t.cx) * .006; t.cx = ev.clientX;
            pitch.current = THREE.MathUtils.clamp(pitch.current - (ev.clientY - t.cy) * .005, -1.1, 1.1); t.cy = ev.clientY;
        }
    };
    const onUp = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) { t.id = null; entrada.current = { x: 0, z: 0 }; setStick(null); }
        if (ev.pointerId === t.cam) t.cam = null;
    };

    const e = est.current;
    const retrato = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    const rotuloDoAlvo = (a: Alvo) => a.tipo === 'npc' ? `FALAR · ${NPCS.find((n) => n.id === a.id)!.nome.toUpperCase()}`
        : a.tipo === 'martelo' ? 'PEGAR MARTELO' : a.tipo === 'ovelha' ? 'CHAMAR OVELHA' : a.tipo === 'sino' ? 'TOCAR O SINO'
        : `BATER · CASA ${CASAS[a.i].runa}`;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#5f97d1', touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <Canvas style={{ position: 'absolute', inset: 0 }} dpr={Q.dpr} shadows="percentage" frameloop={compilado ? 'always' : 'never'}
                gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: .62 }}
                camera={{ fov: 52, near: .1, far: 900, position: [90, 38, 135] }}
                onCreated={({ scene }) => { scene.fog = new THREE.FogExp2('#d9c4a8', .0042); }}>
                {!compilado && <PreCompila aoTerminar={() => setCompilado(true)} />}
                <hemisphereLight args={['#bcd4f0', '#6a5a42', naCabine ? .22 : .9]} />
                <PerformanceMonitor bounds={() => [40, 58]} flipflops={3} onDecline={() => setNivel((n) => Math.max(0, n - 1))} />
                <LuzDaCamera intensidade={naCabine ? .2 : .9} />
                {import.meta.env.DEV && <Sonda />}
                <Ambiente />
                {/* o mundo inteiro: some quando a simulação o desliga (a saída) */}
                <group visible={!naCabine}>
                {/* contraluz fria: separa as silhuetas do chão verde */}
                <directionalLight position={[40, 18, 70]} intensity={.35} color="#a9c8ff" />
                <Floor13Vida />
                <Sol jog={jog} mapa={Q.sombra} />
                <Floor13Mundo portaCertaRef={portaCerta} sinoRef={sinoRef} />
                {NPCS.map((n) => {
                    const l = LUGAR_DOS_NPCS[n.id];
                    if (glitch && n.id !== 'halvard' && Math.hypot(jog.current.x - l.x, jog.current.z - l.z) < 7) return null;
                    return <Viking key={n.id} ficha={n} x={l.x} y={chaoEm(l.x, l.z) ?? 0} z={l.z} ronda={l.ronda} estado={npcVis[n.id]} onde={npcOnde[n.id]} tique={n.id === 'halvard' && e.entidade === 'nao' && entidadeAcorda(e)}
                        marca={!e.conversou.has(n.id) && n.id !== 'halvard' ? (['ragnhild', 'ulfgar', 'eira'].includes(n.id) ? '!' : '?') : null} />;
                })}
                {OVELHAS.map((o, i) => <Ovelha key={i} x={o.x} y={chaoEm(o.x, o.z) ?? 0} z={o.z} achadaRef={achadas[i]} />)}
                <Martelo visivel={!e.temMartelo} />
                {fase === 'queda'
                    ? <CenaDaQueda tRef={tQueda} />
                    : <>
                        <Jogador jog={jog} entrada={entrada} yaw={yaw} ativo={fase === 'explorar'} />
                        {/* primeira pessoa: o corpo do hóspede não é desenhado */}
                    </>}
                </group>
                {/* a saída: olhar para trás, a chuva de runas, a cabine do elevador */}
                {fase === 'elevador' && <SaidaDoAndar t0={saidaT0} porta={portaAlvo} frente={portaFrente} efeito={efeitoChuva}
                    aoEntrarNaCabine={() => setNaCabine(true)} aoFim={() => onExit?.()} />}
                {naCabine && <CabineDoElevador />}
                <CameraDeExplorar jog={jog} yaw={yaw} pitch={pitch} ativo={fase !== 'queda'} foco={foco} portaAlvo={portaAlvo} />
                <Radar jog={jog} est={est} ativo={fase === 'explorar'} aoMudar={setAlvo} aoEntidade={comecarEntidade} yaw={yaw} onde={npcOnde} />
                <Vivo jog={jog} npcVis={npcVis} sinoRef={sinoRef} balanco={balancoDoSino} portaCerta={portaCerta} abrindo={fase === 'elevador'} onde={npcOnde} />
                <EffectComposer multisampling={Q.msaa}>
                    {/* oclusão ambiente: o que encosta no chão ganha sombra de contato */}
                    {Q.ao && <N8AO aoRadius={1.4} intensity={1.5} distanceFalloff={.6} halfRes quality="performance" />}
                    <Bloom mipmapBlur intensity={.35} luminanceThreshold={1} luminanceSmoothing={.25} />
                    {/* a entidade drena a cor do mundo e suja a imagem */}
                    <HueSaturation saturation={glitch ? -.65 : .14} />
                    <ChromaticAberration offset={glitch ? new THREE.Vector2(.0016, .0008) : new THREE.Vector2(0, 0)} />
                    <Noise opacity={glitch ? .06 : 0} />
                    <Vignette eskil={false} offset={.3} darkness={glitch ? .75 : .45} />
                    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                    <BrightnessContrast brightness={0} contrast={.06} />
                    {/* a simulação desligando o andar (só na saída) */}
                    {fase === 'elevador' ? <primitive object={efeitoChuva} dispose={null} /> : <></>}
                </EffectComposer>
            </Canvas>

            {/* ── A QUEDA: legenda e o clarão do baque ── */}
            {fase === 'queda' && <div style={{ ...t13, ...(legenda.startsWith('TROCO') ? {} : { fontFamily: 'Georgia, serif', letterSpacing: 3 }), position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 30vh)', padding: '10px 12px', textAlign: 'center', fontSize: 'clamp(14px, 2.6vh, 19px)', background: 'rgba(8,16,22,.55)', pointerEvents: 'none' }}>
                {legenda}
                {tQueda.current < 2.5 && <div style={{ fontSize: '.7em', opacity: .8, marginTop: 4 }}>toque para pular</div>}
            </div>}
            {/* o andar 12 acaba e o 13 começa no mesmo avião: a imagem sai do preto */}
            {fase === 'queda' && !inicio && <div style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', animation: 'f13entra 1.1s ease-out forwards' }}>
                <style>{'@keyframes f13entra{from{opacity:1}to{opacity:0}}'}</style>
            </div>}
            {flash > 0 && <div style={{ position: 'absolute', inset: 0, background: '#fffaf0', opacity: flash, pointerEvents: 'none' }} />}
            {apagao > 0 && fase === 'queda' && <div style={{
                // pálpebras macias: uma elipse de visão que se fecha até o preto,
                // com borda esfumada e grão (nada de recorte duro)
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse ${Math.max(0, 1 - apagao) * 120 + 1}% ${Math.max(0, 1 - apagao) * 70 + 1}% at 50% 50%, rgba(5,3,2,0) 0%, rgba(5,3,2,${Math.min(1, apagao * 1.4)}) 100%)`,
            }}>
                <div style={{ position: 'absolute', inset: 0, background: '#050302', opacity: Math.max(0, apagao * 1.2 - .25) }} />
                <div style={{ position: 'absolute', inset: 0, opacity: .12 * apagao, backgroundImage: 'repeating-radial-gradient(circle at 37% 61%, rgba(255,255,255,.5) 0 1px, transparent 1px 3px)', mixBlendMode: 'overlay' }} />
            </div>}

            {/* ── HUD: pistas e buscas ── */}
            {fase !== 'queda' && fase !== 'elevador' && !glitch && <div style={{ ...t13, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', left: 10, fontSize: 14, fontFamily: 'Georgia, serif', color: '#2a1d14', textShadow: 'none', background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 10, padding: '6px 10px', boxShadow: '0 4px 12px rgba(0,0,0,.35)', pointerEvents: 'none', maxWidth: retrato ? '62vw' : 300 }}>
                <div style={{ color: '#7a2f1f', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>{e.pistas.size >= 3 ? 'ᚨ' : '?'} A CASA CERTA</div>
                {e.pistas.size === 0 ? <div style={{ opacity: .7 }}>0/3 pistas — pergunte aos moradores</div> : (Object.keys(PISTAS) as Pista[]).map((p) => (
                    <div key={p} style={{ opacity: e.pistas.has(p) ? 1 : .5 }}>{ICONE_DA_PISTA[p]} {e.pistas.has(p) ? PISTAS[p].nome : 'uma pista a descobrir'}</div>
                ))}
                {BUSCAS.some((b) => e.buscas[b.id] !== 'nova') && <div style={{ color: '#7a2f1f', fontWeight: 700, letterSpacing: 1, margin: '6px 0 2px' }}>ᛒ BUSCAS</div>}
                {BUSCAS.filter((b) => e.buscas[b.id] !== 'nova').map((b) => (
                    <div key={b.id} style={{ opacity: e.buscas[b.id] === 'feita' ? .5 : 1, textDecoration: e.buscas[b.id] === 'feita' ? 'line-through' : 'none' }}>
                        {e.buscas[b.id] === 'pronta' ? '★' : '·'} {b.titulo}{b.id === 'ovelhas' && e.buscas[b.id] === 'ativa' ? ` (${e.ovelhas.filter(Boolean).length}/3)` : ''}
                    </div>
                ))}
            </div>}

            {aviso && <div style={{ ...t13, position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)', fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 700, color: '#2a1d14', textShadow: 'none', letterSpacing: .5, background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 10, padding: '8px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.35)', textAlign: 'center', maxWidth: '86vw', pointerEvents: 'none' }}>{aviso}</div>}

            {/* ── O BOTÃO DE AÇÃO ── */}
            {fase === 'explorar' && alvo && <button onPointerDown={(ev) => { ev.stopPropagation(); agir(); }}
                // o mesmo pergaminho da dica e do HUD (antes era um botão marrom de outro jogo)
                style={{ fontFamily: 'Georgia, serif', fontWeight: 700, letterSpacing: 1, position: 'absolute', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 22px)', fontSize: 15, color: '#2a1d14', background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 999, padding: '12px 20px', boxShadow: '0 4px 12px rgba(0,0,0,.35)', cursor: 'pointer', userSelect: 'none' }}>
                {rotuloDoAlvo(alvo)}
            </button>}

            {/* ── O JOYSTICK ── */}
            {stick && <div style={{ position: 'absolute', left: stick.ox - 60, top: stick.oy - 60, width: 120, height: 120, borderRadius: '50%', border: '3px solid rgba(255,227,160,.6)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 60 + stick.x - 24, top: 60 + stick.y - 24, width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,227,160,.55)' }} />
            </div>}
            {fase === 'explorar' && !jaAndou && !alvo && <div style={{ fontFamily: 'Georgia, serif', color: '#2a1d14', letterSpacing: .5, position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 14px)', textAlign: 'center', fontSize: 14, background: 'linear-gradient(180deg,#efe0bf,#d9c399)', border: '2px solid #6b4a2e', borderRadius: 999, padding: '6px 16px', whiteSpace: 'nowrap', opacity: .9, pointerEvents: 'none' }}>
                ◀ LADO ESQUERDO: ANDAR{retrato ? <br /> : ' · '}LADO DIREITO: OLHAR ▶
            </div>}

            {/* a faixa de baixo do cinemascope vem antes da caixa: fica por trás dela */}
            {glitch && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '9vh', background: '#000', pointerEvents: 'none', animation: 'f13barra .8s ease-out' }} />}
            {/* ── A CAIXA DE DIÁLOGO ── */}
            {falas && <div onPointerDown={(ev) => { ev.stopPropagation(); avancar(); }}
                style={{
                    // na entidade a caixa sobe acima da faixa preta de baixo: o cinemascope fica simétrico
                    position: 'absolute', left: 10, right: 10, bottom: glitch ? 'calc(9vh + 8px)' : 'calc(env(safe-area-inset-bottom) + 12px)', minHeight: 96,
                    background: glitch ? 'rgba(4,14,8,.93)' : 'linear-gradient(180deg,#efe0bf,#d9c399)', border: `3px solid ${glitch ? '#3dff8a' : '#6b4a2e'}`,
                    boxShadow: glitch ? '0 0 18px rgba(61,255,138,.35)' : '0 6px 18px rgba(0,0,0,.45), inset 0 0 24px rgba(107,74,46,.35)',
                    borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                    animation: glitch ? 'f13treme .18s steps(2) infinite' : undefined,
                }}>
                <div style={glitch ? { ...t13, fontSize: 13, color: '#3dff8a', marginBottom: 4 } : { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 15, color: '#7a2f1f', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>{falas[linha].quem}</div>
                <div style={{ fontFamily: glitch ? 'monospace' : 'Georgia, serif', fontSize: 17, lineHeight: 1.4, color: glitch ? '#b8ffd2' : '#2a1d14' }}>
                    {falas[linha].texto.slice(0, digitado)}{glitch && linha === falas.length - 1 && digitado >= falas[linha].texto.length ? '█' : ''}
                </div>
                {!(glitch && linha === falas.length - 1) && <div style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 14, color: glitch ? '#3dff8a' : '#6b4a2e' }}>▶</div>}
            </div>}
            {glitch && <>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '9vh', background: '#000', pointerEvents: 'none', animation: 'f13barra .8s ease-out' }} />
                <style>{'@keyframes f13barra{from{height:0}}'}</style>
            </>}
            {glitch && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: .5,
                background: 'repeating-linear-gradient(0deg, rgba(61,255,138,.10) 0 2px, transparent 2px 4px)', animation: 'f13treme .3s steps(3) infinite' }}>
                <style>{'@keyframes f13treme{0%{transform:translate(0,0)}33%{transform:translate(-2px,1px)}66%{transform:translate(2px,-1px)}100%{transform:translate(0,0)}}'}</style>
            </div>}
            {conexao && <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontFamily: 'monospace', color: '#3dff8a', fontSize: 18, letterSpacing: 3 }}>{CONEXAO_ENCERRADA}</div>
            </div>}

        </div>
    );
};

export default Floor13;
