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
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Avatar64, useAvatarRefs } from './Floor5Player64';
import { CascoDoElevador } from './Floor12Avioes';
import { Floor13Mundo } from './Floor13Mundo';
import { Viking, Ovelha, type EstadoVisualNpc } from './Floor13Gente';
import {
    NPCS, PISTAS, BUSCAS, ENTIDADE, CONEXAO_ENCERRADA, LEGENDAS_DA_QUEDA, CASAS, type Fala, type IdNpc, type Pista,
} from './f13Lore';
import {
    chaoEm, INICIO, LUGAR_DOS_NPCS, LUGAR_DAS_CASAS, portaDaCasa, MARTELO, OVELHAS, SINO,
    novoEstado13, falarCom, pegarMartelo, acharOvelha, tocarSino as marcarSino, entidadeAcorda, baterNaCasa,
} from './f13Mundo';
import {
    tocarVento, pararVento, tocarMotorTossindo, tocarMotorMorrendo, tocarQueda, tocarSino, tocarDingDaCasa,
    tocarPegar, tocarBalido, tocarFala, tocarGlitch, tocarDesconexao,
} from './floor13Sfx';

type Fase = 'queda' | 'explorar' | 'dialogo' | 'elevador';
type Alvo =
    | { tipo: 'npc'; id: IdNpc }
    | { tipo: 'martelo' } | { tipo: 'ovelha'; i: number } | { tipo: 'sino' } | { tipo: 'casa'; i: number };
const chaveDoAlvo = (a: Alvo | null) => (a ? `${a.tipo}:${'id' in a ? a.id : 'i' in a ? a.i : ''}` : '');

export const DURACAO_DA_QUEDA = 11.6;

/** Estado de movimento do jogador (mutável, lido a cada quadro). */
interface Jog { x: number; y: number; z: number; ang: number; vy: number; seguro: { x: number; z: number }; levantando: number; andando: number }

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

const CenaDaQueda: React.FC<{ tRef: React.MutableRefObject<number> }> = ({ tRef }) => {
    const camera = useThree((s) => s.camera);
    const aviao = useRef<THREE.Group>(null), balanco = useRef<THREE.Group>(null);
    const abertura = useRef(1), helice = useRef(0);
    const refs = useAvatarRefs();
    const fumaca = useRef<THREE.Group>(null), poeira = useRef<THREE.Group>(null);
    const puffs = useRef(Array.from({ length: 28 }, () => ({ p: new THREE.Vector3(), t: 99 })));
    const proximoPuff = useRef(0);
    const tmp = useMemo(() => ({ tan: new THREE.Vector3(), lado: new THREE.Vector3(), cam: new THREE.Vector3(), olho: new THREE.Vector3(), alvo: new THREE.Vector3() }), []);
    const olhar = useRef(new THREE.Vector3(0, 0, 0));

    useFrame((_, dt) => {
        const t = tRef.current;
        const u = progressoDaQueda(t);
        const pos = CAMINHO.getPointAt(u);
        CAMINHO.getTangentAt(Math.min(.999, u), tmp.tan);
        const g = aviao.current;
        if (g) {
            g.visible = t < 10.45;
            g.position.copy(pos);
            tmp.alvo.copy(pos).add(tmp.tan);
            g.lookAt(tmp.alvo);
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
        if (t > 2.6 && t < 10.4 && t > proximoPuff.current) {
            proximoPuff.current = t + (t > 5 ? .06 : .14);
            const livre = puffs.current.find((p) => p.t > 1.6) ?? puffs.current[0];
            livre.p.copy(pos); livre.t = 0;
        }
        puffs.current.forEach((p, i) => {
            p.t += dt;
            const m = fumaca.current?.children[i] as THREE.Mesh | undefined; if (!m) return;
            m.visible = p.t < 1.6;
            m.position.copy(p.p); m.position.y += p.t * .6;
            m.scale.setScalar(.4 + p.t * 1.6);
            (m.material as THREE.MeshBasicMaterial).opacity = .55 * (1 - p.t / 1.6);
        });
        // a poeira do baque no feno
        const pq = Math.max(0, t - 10.4);
        if (poeira.current) {
            poeira.current.visible = pq > 0 && pq < 1.6;
            poeira.current.children.forEach((c, i) => {
                const a = i / poeira.current!.children.length * Math.PI * 2;
                c.position.set(-2 + Math.cos(a) * pq * 3, 1 + pq * (1 + (i % 3) * .4), 33 + Math.sin(a) * pq * 3);
                c.scale.setScalar(.5 + pq * 1.2);
                ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .7 * Math.max(0, 1 - pq / 1.6);
            });
        }

        // ── A CÂMERA: um plano só, que muda de lugar sem cortar ──────────
        tmp.lado.crossVectors(tmp.tan, THREE.Object3D.DEFAULT_UP).normalize();
        const k1 = THREE.MathUtils.smoothstep(t, 3.6, 5.2);   // perseguição → lado
        const k2 = THREE.MathUtils.smoothstep(t, 7.0, 8.4);   // lado → atrás e alto (revela a cidade)
        const atras = tmp.tan.clone().multiplyScalar(-7).addScaledVector(tmp.lado, 3).add(new THREE.Vector3(0, 2, 0));
        const deLado = tmp.lado.clone().multiplyScalar(8.5).addScaledVector(tmp.tan, 1).add(new THREE.Vector3(0, .8, 0));
        const revela = tmp.tan.clone().multiplyScalar(-11).add(new THREE.Vector3(0, 5.5, 0));
        tmp.cam.copy(atras).lerp(deLado, k1).lerp(revela, k2).add(pos);
        if (t > 10.2) tmp.cam.set(4, 4.5, 40);   // o baque, visto de fora
        camera.position.lerp(tmp.cam, 1 - Math.exp(-dt * (t > 10.2 ? 6 : 3.2)));
        // o olhar: o avião, e no mergulho metade do olhar vai para a cidade
        tmp.olho.copy(pos).lerp(new THREE.Vector3(0, 0, 8), k2 * .45);
        olhar.current.lerp(tmp.olho, 1 - Math.exp(-dt * 6));
        camera.lookAt(olhar.current);
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += ((t > 7.4 ? 64 : 52) - camera.fov) * Math.min(1, dt * 2);
            camera.updateProjectionMatrix();
        }
    });

    return <group>
        <group ref={aviao}>
            <group ref={balanco} rotation={[0, Math.PI, 0]}>
                <CascoDoElevador aberturaRef={abertura} heliceRef={helice} />
                <group position={[0, -.44, .25]} scale={.46}><Avatar64 refs={refs} /></group>
            </group>
        </group>
        <group ref={fumaca}>
            {puffs.current.map((_, i) => <mesh key={i} visible={false}><sphereGeometry args={[.5, 8, 6]} /><meshBasicMaterial color="#3a3634" transparent depthWrite={false} /></mesh>)}
        </group>
        <group ref={poeira} visible={false}>
            {Array.from({ length: 14 }, (_, i) => <mesh key={i}><sphereGeometry args={[.6, 8, 6]} /><meshBasicMaterial color="#e6d3a0" transparent depthWrite={false} /></mesh>)}
        </group>
    </group>;
};

// ═══ O JOGADOR ═══════════════════════════════════════════════════════════════
/** Obstáculos redondos: casas, forja, templo, poço, barracas. */
const OBSTACULOS: ReadonlyArray<{ x: number; z: number; r: number }> = Object.freeze([
    ...LUGAR_DAS_CASAS.map((l) => ({ x: l.x, z: l.z, r: 2.6 })),
    { x: -7.5, z: 4, r: 2.4 }, { x: 7.8, z: 12.5, r: 2.4 },
    { x: 0, z: 8, r: 1.4 }, { x: 0, z: 2, r: .7 },
    { x: -6, z: 12, r: 1 }, { x: -3.2, z: 14, r: 1 }, { x: 6, z: 11, r: 1 },
    { x: -23, z: 4.5 - 1.5, r: 1.1 },
    { x: SINO.x, z: SINO.z, r: 1.3 }, { x: -2, z: 33, r: 1.3 },
]);

const Jogador: React.FC<{
    jog: React.MutableRefObject<Jog>;
    entrada: React.MutableRefObject<{ x: number; z: number }>;
    yaw: React.MutableRefObject<number>;
    ativo: boolean;
}> = ({ jog, entrada, yaw, ativo }) => {
    const refs = useAvatarRefs();
    const g = useRef<THREE.Group>(null);
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
                const dx = nx - ob.x, dz = nz - ob.z, d = Math.hypot(dx, dz), r = ob.r + .35;
                if (d < r && d > 1e-4) { nx = ob.x + dx / d * r; nz = ob.z + dz / d * r; }
            }
            j.x = nx; j.z = nz;
            let da = Math.atan2(mx, mz) - j.ang;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            j.ang += da * Math.min(1, dt * 12);
            j.andando = Math.min(1, j.andando + dt * 6);
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
    return <group ref={g}><Avatar64 refs={refs} /></group>;
};

/** Câmera de terceira pessoa: atrás e acima, girando com o dedo direito. */
const CameraDeExplorar: React.FC<{
    jog: React.MutableRefObject<Jog>; yaw: React.MutableRefObject<number>; ativo: boolean;
    foco: React.MutableRefObject<THREE.Vector3 | null>;
}> = ({ jog, yaw, ativo, foco }) => {
    const camera = useThree((s) => s.camera), size = useThree((s) => s.size);
    const alvo = useRef(new THREE.Vector3());
    useFrame((_, dt) => {
        if (!ativo) return;
        const j = jog.current;
        const retrato = size.width < size.height;
        const dist = retrato ? 8.5 : 7, alto = retrato ? 4.2 : 3.4;
        const quer = new THREE.Vector3(j.x, j.y + 1.3, j.z);
        // numa conversa, o olhar vai para o meio entre o jogador e quem fala
        if (foco.current) quer.lerp(foco.current, .5);
        alvo.current.lerp(quer, 1 - Math.exp(-dt * 6));
        const pos = new THREE.Vector3(j.x + Math.sin(yaw.current) * dist, j.y + alto, j.z + Math.cos(yaw.current) * dist);
        camera.position.lerp(pos, 1 - Math.exp(-dt * 5));
        camera.lookAt(alvo.current);
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += ((retrato ? 66 : 55) - camera.fov) * Math.min(1, dt * 3);
            camera.updateProjectionMatrix();
        }
    });
    return null;
};

/** Acha o que está ao alcance e avisa quando muda. */
const Radar: React.FC<{
    jog: React.MutableRefObject<Jog>; est: React.MutableRefObject<ReturnType<typeof novoEstado13>>;
    ativo: boolean; aoMudar: (a: Alvo | null) => void; aoEntidade: () => void;
}> = ({ jog, est, ativo, aoMudar, aoEntidade }) => {
    const ultimo = useRef('');
    useFrame(() => {
        if (!ativo) return;
        const j = jog.current, e = est.current;
        const perto = (x: number, z: number, r: number) => Math.hypot(j.x - x, j.z - z) < r;
        const hl = LUGAR_DOS_NPCS.halvard;
        if (entidadeAcorda(e) && perto(hl.x, hl.z, 3.2)) { aoEntidade(); return; }
        let achou: Alvo | null = null, melhor = Infinity;
        const tenta = (a: Alvo, x: number, z: number, r: number) => {
            const d = Math.hypot(j.x - x, j.z - z);
            if (d < r && d < melhor) { melhor = d; achou = a; }
        };
        for (const [id, l] of Object.entries(LUGAR_DOS_NPCS) as [IdNpc, { x: number; z: number; ronda?: number }][]) {
            if (id === 'halvard' && e.entidade === 'caido') continue;
            if (l.ronda) {
                // a menina corre em volta do poço: acha pela posição de agora
                const a = performance.now() / 1000 * .45;
                tenta({ tipo: 'npc', id }, l.x + Math.cos(a) * l.ronda, l.z + Math.sin(a) * l.ronda, 2.4);
            } else tenta({ tipo: 'npc', id }, l.x, l.z, 2.3);
        }
        if (!e.temMartelo) tenta({ tipo: 'martelo' }, MARTELO.x, MARTELO.z, 1.8);
        OVELHAS.forEach((o, i) => { if (!e.ovelhas[i]) tenta({ tipo: 'ovelha', i }, o.x, o.z, 1.9); });
        tenta({ tipo: 'sino' }, SINO.x, SINO.z, 2.4);
        CASAS.forEach((_, i) => { const p = portaDaCasa(i); tenta({ tipo: 'casa', i }, p.x, p.z, 1.9); });
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
}> = ({ jog, npcVis, sinoRef, balanco, portaCerta, abrindo }) => {
    const p = useMemo(() => new THREE.Vector3(), []);
    useFrame(({ clock }, dt) => {
        const j = jog.current;
        p.set(j.x, j.y, j.z);
        for (const n of NPCS) {
            const l = LUGAR_DOS_NPCS[n.id];
            npcVis[n.id].current.olharPara = Math.hypot(j.x - l.x, j.z - l.z) < 5 ? p : null;
        }
        if (sinoRef.current) {
            balanco.current = Math.max(0, balanco.current - dt * .35);
            sinoRef.current.rotation.x = Math.sin(clock.elapsedTime * 5.5) * .5 * balanco.current;
        }
        // a porta de latão se abre ao meio, como a de um elevador
        if (portaCerta.current && abrindo) portaCerta.current.scale.x = Math.max(.02, portaCerta.current.scale.x - dt * .9);
    });
    return null;
};

// ═══ O ANDAR ═════════════════════════════════════════════════════════════════
export const Floor13: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const est = useRef(novoEstado13());
    const [, bump] = useReducer((x: number) => x + 1, 0);
    const [fase, setFase] = useState<Fase>('queda');
    const tQueda = useRef(0);
    const [legenda, setLegenda] = useState(LEGENDAS_DA_QUEDA[0].texto);
    const [flash, setFlash] = useState(0);
    const jog = useRef<Jog>({ x: INICIO.x, y: 0, z: INICIO.z, ang: Math.PI, vy: 0, seguro: { ...INICIO }, levantando: 1, andando: 0 });
    const entrada = useRef({ x: 0, z: 0 });
    const yaw = useRef(0);
    const foco = useRef<THREE.Vector3 | null>(null);
    const [alvo, setAlvo] = useState<Alvo | null>(null);
    const [falas, setFalas] = useState<Fala[] | null>(null);
    const [linha, setLinha] = useState(0);
    const [digitado, setDigitado] = useState(0);
    const [glitch, setGlitch] = useState(false);
    const [conexao, setConexao] = useState(false);
    const aoFimDoDialogo = useRef<(() => void) | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const achadas = useMemo(() => OVELHAS.map(() => ({ current: false })), []);
    const npcVis = useMemo(() => Object.fromEntries(NPCS.map((n) => [n.id, { current: { olharPara: null, falando: false, possessao: 0, caido: false } as EstadoVisualNpc }])) as Record<IdNpc, React.MutableRefObject<EstadoVisualNpc>>, []);
    const sinoRef = useRef<THREE.Group>(null), portaCerta = useRef<THREE.Group>(null);
    const balancoDoSino = useRef(0);
    const falando = useRef<IdNpc | null>(null);

    // Bancada (só em DEV): `window.__f13` teleporta, dá pistas e lê o estado.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as unknown as { __f13?: unknown }).__f13 = {
            ir: (x: number, z: number, ang = 0, yawCam = ang) => { const j = jog.current; j.x = x; j.z = z; j.y = chaoEm(x, z) ?? 0; j.ang = ang; yaw.current = yawCam; j.levantando = 0; },
            estado: () => est.current,
            pistas: (...p: Pista[]) => { p.forEach((x) => est.current.pistas.add(x)); bump(); },
            pular: () => { tQueda.current = DURACAO_DA_QUEDA; },
        };
    }, []);

    // ── A QUEDA: relógio, legendas, sons e o pulo ────────────────────────
    useEffect(() => {
        tocarVento();
        let raf = 0, antes = performance.now();
        const marcos = { tosse: false, morre: false, baque: false };
        const passo = () => {
            const agora = performance.now();
            tQueda.current += Math.min(.1, (agora - antes) / 1000); antes = agora;
            const t = tQueda.current;
            setLegenda(LEGENDAS_DA_QUEDA.find((l) => t < l.ate)!.texto);
            if (t > 2.6 && !marcos.tosse) { marcos.tosse = true; tocarMotorTossindo(); }
            if (t > 5.0 && !marcos.morre) { marcos.morre = true; tocarMotorMorrendo(); }
            if (t > 10.4 && !marcos.baque) { marcos.baque = true; tocarQueda(); }
            setFlash(t > 10.4 ? Math.max(0, 1 - (t - 10.4) / 1.2) : 0);
            if (t >= DURACAO_DA_QUEDA) { setFase('explorar'); setFlash(0); return; }
            raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
        const pular = () => { if (tQueda.current > .5 && tQueda.current < 10.3) tQueda.current = 10.3; };
        window.addEventListener('pointerdown', pular); window.addEventListener('keydown', pular);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('pointerdown', pular); window.removeEventListener('keydown', pular); pararVento(); };
    }, []);

    // ── DIÁLOGO ──────────────────────────────────────────────────────────
    const abrirDialogo = useCallback((f: Fala[], quem: IdNpc | null, fim?: () => void) => {
        if (!f.length) { fim?.(); return; }
        setFalas(f); setLinha(0); setDigitado(0); setFase('dialogo');
        falando.current = quem;
        if (quem) {
            const l = LUGAR_DOS_NPCS[quem];
            foco.current = new THREE.Vector3(l.x, (chaoEm(l.x, l.z) ?? 0) + 1.6, l.z);
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
            tocarDesconexao(); setConexao(true);
            const h = npcVis.halvard.current;
            h.possessao = 0; h.caido = true;
            est.current.entidade = 'caido';
            window.setTimeout(() => { setConexao(false); fecharDialogo(); setAviso('Halvard caiu duro. Ninguém em volta parece notar.'); }, 1600);
        }, 350);
        return () => window.clearTimeout(id);
    }, [glitch, falas, linha, digitado, npcVis, fecharDialogo]);

    const comecarEntidade = useCallback(() => {
        if (est.current.entidade !== 'nao') return;
        est.current.entidade = 'falando';
        npcVis.halvard.current.possessao = 1;
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
            abrirDialogo(falarCom(e, a.id), a.id, avisarPista);
        } else if (a.tipo === 'martelo') {
            pegarMartelo(e); tocarPegar(); setAviso('Você pegou o martelo de Brokk.'); setAlvo(null);
        } else if (a.tipo === 'ovelha') {
            acharOvelha(e, a.i); achadas[a.i].current = true; tocarBalido();
            setAviso(`Ovelha achada (${e.ovelhas.filter(Boolean).length}/3). Ela volta sozinha para a Sigrun.`); setAlvo(null);
        } else if (a.tipo === 'sino') {
            marcarSino(e); tocarSino(); balancoDoSino.current = 1; setAviso('O sino ecoa por Vindhjem.');
        } else if (a.tipo === 'casa') {
            const r = baterNaCasa(e, a.i);
            if (r.certa) {
                tocarDingDaCasa(); setFase('elevador'); setAviso(null);
                window.setTimeout(() => onExit?.(), 3200);
            } else abrirDialogo(r.falas, null);
        }
        bump();
    }, [alvo, fase, abrirDialogo, achadas, onExit]);

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

    const toque = useRef<{ id: number | null; ox: number; oy: number; cam: number | null; cx: number }>({ id: null, ox: 0, oy: 0, cam: null, cx: 0 });
    const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
    const onDown = (ev: React.PointerEvent) => {
        if (fase !== 'explorar') return;
        const w = window.innerWidth;
        if (ev.clientX < w * .55 && toque.current.id === null) {
            toque.current.id = ev.pointerId; toque.current.ox = ev.clientX; toque.current.oy = ev.clientY;
            setStick({ ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 });
        } else if (toque.current.cam === null) { toque.current.cam = ev.pointerId; toque.current.cx = ev.clientX; }
    };
    const onMove = (ev: React.PointerEvent) => {
        const t = toque.current;
        if (ev.pointerId === t.id) {
            let dx = ev.clientX - t.ox, dy = ev.clientY - t.oy;
            const d = Math.hypot(dx, dy), R = 60;
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            entrada.current = { x: dx / R, z: dy / R };
            setStick({ ox: t.ox, oy: t.oy, x: dx, y: dy });
        } else if (ev.pointerId === t.cam) {
            yaw.current -= (ev.clientX - t.cx) * .008; t.cx = ev.clientX;
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
            <Canvas style={{ position: 'absolute', inset: 0 }} dpr={[1, 1.25]} shadows={false}
                camera={{ fov: 52, near: .1, far: 900, position: [90, 38, 135] }}
                onCreated={({ scene }) => { scene.fog = new THREE.Fog('#e9d2b0', 70, 330); }}>
                <hemisphereLight args={['#dfe9f5', '#6b5a44', 1.1]} />
                <directionalLight position={[-60, 80, -40]} intensity={2.4} color="#fff0d2" />
                <directionalLight position={[40, 20, 60]} intensity={.6} color="#9ec3ff" />
                <Floor13Mundo portaCertaRef={portaCerta} sinoRef={sinoRef} />
                {NPCS.map((n) => {
                    const l = LUGAR_DOS_NPCS[n.id];
                    return <Viking key={n.id} ficha={n} x={l.x} y={chaoEm(l.x, l.z) ?? 0} z={l.z} ronda={l.ronda} estado={npcVis[n.id]} />;
                })}
                {OVELHAS.map((o, i) => <Ovelha key={i} x={o.x} y={chaoEm(o.x, o.z) ?? 0} z={o.z} achadaRef={achadas[i]} />)}
                <Martelo visivel={!e.temMartelo} />
                {fase === 'queda'
                    ? <CenaDaQueda tRef={tQueda} />
                    : <Jogador jog={jog} entrada={entrada} yaw={yaw} ativo={fase === 'explorar'} />}
                <CameraDeExplorar jog={jog} yaw={yaw} ativo={fase !== 'queda'} foco={foco} />
                <Radar jog={jog} est={est} ativo={fase === 'explorar'} aoMudar={setAlvo} aoEntidade={comecarEntidade} />
                <Vivo jog={jog} npcVis={npcVis} sinoRef={sinoRef} balanco={balancoDoSino} portaCerta={portaCerta} abrindo={fase === 'elevador'} />
                <EffectComposer multisampling={0}>
                    <Bloom mipmapBlur intensity={.6} luminanceThreshold={.85} />
                </EffectComposer>
            </Canvas>

            {/* ── A QUEDA: legenda e o clarão do baque ── */}
            {fase === 'queda' && <div style={{ ...t13, position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 12px calc(env(safe-area-inset-bottom) + 14px)', textAlign: 'center', fontSize: 'clamp(14px, 2.6vh, 19px)', background: 'linear-gradient(0deg, rgba(8,16,22,.7), rgba(8,16,22,0))', pointerEvents: 'none' }}>
                {legenda}
                <div style={{ fontSize: '.7em', opacity: .8, marginTop: 4 }}>toque para pular</div>
            </div>}
            {flash > 0 && <div style={{ position: 'absolute', inset: 0, background: '#fffaf0', opacity: flash, pointerEvents: 'none' }} />}

            {/* ── HUD: pistas e buscas ── */}
            {fase !== 'queda' && <div style={{ ...t13, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', left: 10, fontSize: 12, background: 'rgba(20,14,10,.66)', border: '2px solid #b8893a', borderRadius: 10, padding: '6px 9px', pointerEvents: 'none', maxWidth: retrato ? '62vw' : 300 }}>
                <div style={{ color: '#ffd07a', marginBottom: 3 }}>A CASA CERTA</div>
                {(Object.keys(PISTAS) as Pista[]).map((p) => (
                    <div key={p} style={{ opacity: e.pistas.has(p) ? 1 : .45 }}>{e.pistas.has(p) ? '◆' : '◇'} {e.pistas.has(p) ? PISTAS[p].nome : '???'}</div>
                ))}
                {BUSCAS.some((b) => e.buscas[b.id] !== 'nova') && <div style={{ color: '#ffd07a', margin: '5px 0 2px' }}>BUSCAS</div>}
                {BUSCAS.filter((b) => e.buscas[b.id] !== 'nova').map((b) => (
                    <div key={b.id} style={{ opacity: e.buscas[b.id] === 'feita' ? .5 : 1, textDecoration: e.buscas[b.id] === 'feita' ? 'line-through' : 'none' }}>
                        {e.buscas[b.id] === 'pronta' ? '★' : '·'} {b.titulo}{b.id === 'ovelhas' && e.buscas[b.id] === 'ativa' ? ` (${e.ovelhas.filter(Boolean).length}/3)` : ''}
                    </div>
                ))}
            </div>}

            {aviso && <div style={{ ...t13, position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)', fontSize: 15, background: 'rgba(20,14,10,.78)', border: '2px solid #b8893a', borderRadius: 10, padding: '8px 14px', textAlign: 'center', maxWidth: '86vw', pointerEvents: 'none' }}>{aviso}</div>}

            {/* ── O BOTÃO DE AÇÃO ── */}
            {fase === 'explorar' && alvo && <button onPointerDown={(ev) => { ev.stopPropagation(); agir(); }}
                style={{ ...t13, position: 'absolute', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 26px)', fontSize: 15, color: '#fff', background: 'linear-gradient(180deg,#b8893a,#7a5520)', border: '3px solid #2a1d14', borderRadius: 14, padding: '12px 18px', cursor: 'pointer' }}>
                {rotuloDoAlvo(alvo)}
            </button>}

            {/* ── O JOYSTICK ── */}
            {stick && <div style={{ position: 'absolute', left: stick.ox - 60, top: stick.oy - 60, width: 120, height: 120, borderRadius: '50%', border: '3px solid rgba(255,227,160,.6)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 60 + stick.x - 24, top: 60 + stick.y - 24, width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,227,160,.55)' }} />
            </div>}
            {fase === 'explorar' && !e.conversou.size && <div style={{ ...t13, position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 90px)', textAlign: 'center', fontSize: 12, opacity: .9, pointerEvents: 'none' }}>
                ARRASTE À ESQUERDA: ANDAR · À DIREITA: GIRAR
            </div>}

            {/* ── A CAIXA DE DIÁLOGO ── */}
            {falas && <div onPointerDown={(ev) => { ev.stopPropagation(); avancar(); }}
                style={{
                    position: 'absolute', left: 10, right: 10, bottom: 'calc(env(safe-area-inset-bottom) + 12px)', minHeight: 96,
                    background: glitch ? 'rgba(4,14,8,.93)' : 'rgba(28,18,12,.92)', border: `3px solid ${glitch ? '#3dff8a' : '#b8893a'}`,
                    borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                    transform: glitch ? `translate(${(Math.random() - .5) * 4}px, ${(Math.random() - .5) * 3}px)` : undefined,
                }}>
                <div style={{ ...t13, fontSize: 13, color: glitch ? '#3dff8a' : '#ffd07a', marginBottom: 4 }}>{falas[linha].quem}</div>
                <div style={{ fontFamily: glitch ? 'monospace' : 'Georgia, serif', fontSize: 16, lineHeight: 1.35, color: glitch ? '#b8ffd2' : '#f3e7c8' }}>
                    {falas[linha].texto.slice(0, digitado)}{glitch && linha === falas.length - 1 && digitado >= falas[linha].texto.length ? '█' : ''}
                </div>
                {!(glitch && linha === falas.length - 1) && <div style={{ ...t13, position: 'absolute', right: 12, bottom: 8, fontSize: 12 }}>▶</div>}
            </div>}
            {conexao && <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontFamily: 'monospace', color: '#3dff8a', fontSize: 18, letterSpacing: 3 }}>{CONEXAO_ENCERRADA}</div>
            </div>}

            {/* ── A CASA CERTA: as portas abrem como as de um elevador ── */}
            {fase === 'elevador' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: 'f13branco 3.2s ease-in forwards', background: '#fff7e6' }}>
                <style>{'@keyframes f13branco{0%{opacity:0}60%{opacity:0}100%{opacity:1}}'}</style>
                <div style={{ ...t13, position: 'absolute', top: '44%', width: '100%', textAlign: 'center', fontSize: 20, color: '#7a5520', textShadow: 'none' }}>DING.</div>
            </div>}
        </div>
    );
};

export default Floor13;
