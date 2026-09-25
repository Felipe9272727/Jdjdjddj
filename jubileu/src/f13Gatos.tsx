/**
 * f13Gatos.tsx — os gatos de rua da vila (andar 13).
 *
 * Três gatos feitos só com primitivas three (sem GLB): corpo, cabeça, orelhas
 * e rabo articulado animados por código. Cada um tem personalidade própria e
 * reage sozinho aos peixes que caem no chão.
 *
 * O estado compartilhado vive em `gatos` (objeto de módulo), no mesmo estilo
 * de `busca` em f13Busca.tsx: o Floor13 lê os contadores para o HUD e chama
 * gatos.pegar() / gatos.oferecer() quando o jogador aperta o botão.
 *   - gatos.pegar()    → pega um peixe do chão perto de você, ou do caixote.
 *   - gatos.oferecer() → larga o peixe ~1 m à sua frente; o gato que quiser vem.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { chaoEm } from './f13Mundo';

const TAU = Math.PI * 2;
const RAIO_COME = 0.55;      // distância em que o gato alcança o peixe
const ALCANCE_PEGAR = 2.2;   // alcance do jogador para pegar um peixe do chão
const MAX_PEIXES = 10;       // anti-lixo de peixes esquecidos

/** O caixote de peixes da vila: dá peixes de graça para quem chegar perto. */
export const CESTO = new THREE.Vector3(-6, 0, 6);

type Personalidade = 'fominha' | 'desconfiado' | 'pachorrento';
type EstadoGato = 'vagando' | 'indo' | 'comendo' | 'saciado';

/** Velocidade de caminhada (m/s) e tempo de mastigação (s) de cada um. */
const VEL: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 2.2, pachorrento: 1.2 };
const TEMPO_COMIDA: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 4.5, pachorrento: 8 };

type GatoCtx = {
    id: number;
    nome: string;
    tipo: Personalidade;
    cor: string;      // pelagem
    cor2: string;     // peito, focinho
    pos: THREE.Vector3;
    casa: THREE.Vector3;   // onde vagueia e onde senta depois de comer
    alvo: THREE.Vector3;   // destino atual (reusado, nunca realocado)
    estado: EstadoGato;
    peixeId: number | null;
    timer: number;
    yaw: number;
    t: number;        // relógio do gato (animações)
    passo: number;    // fase do andar
    vel: number;      // velocidade real (m/s) para a animação
    sentado: boolean;
};

const FICHAS: { nome: string; tipo: Personalidade; cor: string; cor2: string; x: number; z: number }[] = [
    { nome: 'Tico', tipo: 'fominha', cor: '#d98a3a', cor2: '#f3d9b0', x: -4, z: 4 },
    { nome: 'Cinza', tipo: 'desconfiado', cor: '#8d95a3', cor2: '#e2e5ea', x: 3, z: 1 },
    { nome: 'Soneca', tipo: 'pachorrento', cor: '#33363d', cor2: '#d8dbe0', x: 1, z: 3 },
];

/* ============================ peixes no chão ========================== */

type Peixe = { id: number; pos: THREE.Vector3; yaw: number; dono: number | null };

const peixesNoChao: Peixe[] = [];
let versaoPeixes = 0;          // muda quando a lista muda (o React observa)
let proximoIdPeixe = 1;

/** Larga um peixe no chão em (x, z). O dono é definido pelo 1º gato que chega. */
export function largarPeixe(x: number, z: number): THREE.Vector3 {
    const p: Peixe = { id: proximoIdPeixe++, pos: new THREE.Vector3(x, 0, z), yaw: Math.random() * TAU, dono: null };
    p.pos.y = (chaoEm(x, z) ?? 0) + 0.02;
    peixesNoChao.push(p);
    if (peixesNoChao.length > MAX_PEIXES) peixesNoChao.shift();
    gatos.peixeNaMao = false;
    versaoPeixes++;
    return p.pos;
}

/* ===================== posição do jogador (para a API) ================ */

const posJogador = new THREE.Vector3();
const jogFrente = new THREE.Vector3(0, 0, 1);

/* ============================ estado global ============================ */

const comeu = [false, false, false];
function contarSaciados() {
    let n = 0;
    for (let i = 0; i < comeu.length; i++) if (comeu[i]) n++;
    return n;
}

function pegarPeixe(): boolean {
    if (gatos.peixeNaMao) return false;
    // 1) peixe solto no chão, ao alcance
    for (let i = peixesNoChao.length - 1; i >= 0; i--) {
        const p = peixesNoChao[i];
        if (p.dono !== null) continue;
        if (Math.hypot(p.pos.x - posJogador.x, p.pos.z - posJogador.z) > ALCANCE_PEGAR) continue;
        peixesNoChao.splice(i, 1);
        versaoPeixes++;
        gatos.peixeNaMao = true;
        return true;
    }
    // 2) caixote de peixes da vila (fonte infinita, precisa estar perto)
    if (Math.hypot(CESTO.x - posJogador.x, CESTO.z - posJogador.z) <= ALCANCE_PEGAR + 1) {
        gatos.peixeNaMao = true;
        return true;
    }
    return false;
}

function oferecerPeixe(): boolean {
    if (!gatos.peixeNaMao) return false;
    largarPeixe(posJogador.x + jogFrente.x * 0.95, posJogador.z + jogFrente.z * 0.95);
    return true;
}

export const gatos = {
    /** true quando o jogador está com um peixe na mão */
    peixeNaMao: false,
    /** peixes que os gatos já comeram */
    alimentados: 0,
    /** quantos gatos distintos já comeram (0..3) */
    saciados: 0,
    /** quantos gatos vivem na vila agora */
    gatosNaVila: 0,
    /** nome do último gato que recebeu um peixe (para o HUD) */
    ultimoNome: '',
    /** Floor13: botão "PEGAR PEIXE" */
    pegar: pegarPeixe,
    /** Floor13: botão "OFERECER PEIXE" */
    oferecer: oferecerPeixe,
    /** onde fica o caixote de peixes, para marcar no mapa */
    cesto: CESTO,
};

/* ============================ utilidades ============================== */

function plano2D(a: THREE.Vector3, x: number, z: number) {
    return Math.hypot(a.x - x, a.z - z);
}

function acharPeixe(id: number | null): Peixe | null {
    if (id === null) return null;
    for (let i = 0; i < peixesNoChao.length; i++) if (peixesNoChao[i].id === id) return peixesNoChao[i];
    return null;
}

/** Regra de cada personalidade para decidir se vale a pena ir atrás do peixe. */
function querPeixe(e: GatoCtx, p: Peixe, pjx: number, pjz: number): boolean {
    switch (e.tipo) {
        case 'fominha': return true;                                     // vem de qualquer lugar
        case 'desconfiado': return Math.hypot(pjx - p.pos.x, pjz - p.pos.z) > 4.5; // só sem plateia
        case 'pachorrento': return plano2D(e.pos, p.pos.x, p.pos.z) < 3.5;        // só se cair no colo
        default: return false;
    }
}

/** Move `e` em direção a `destino` (Vector3 reusado). Devolve a velocidade real (m/s). */
function moverPara(e: GatoCtx, vel: number, dt: number, destino: THREE.Vector3, parar: number): number {
    const dx = destino.x - e.pos.x;
    const dz = destino.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= parar || d < 1e-4) return 0;
    const ix = dx / d, iz = dz / d;
    // giro suave pelo caminho mais curto
    let dif = Math.atan2(ix, iz) - e.yaw;
    dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    e.yaw += dif * Math.min(1, 7 * dt);
    const passo = Math.min(vel * dt, d - parar);
    e.pos.x += ix * passo;
    e.pos.z += iz * passo;
    const cy = chaoEm(e.pos.x, e.pos.z);
    if (cy !== null) e.pos.y = cy;
    return passo / Math.max(dt, 1e-4);
}

function criarGatos(): GatoCtx[] {
    return FICHAS.map((f, i) => {
        const pos = new THREE.Vector3(f.x, chaoEm(f.x, f.z) ?? 0, f.z);
        return {
            id: i,
            nome: f.nome,
            tipo: f.tipo,
            cor: f.cor,
            cor2: f.cor2,
            pos,
            casa: pos.clone(),
            alvo: pos.clone(),
            estado: 'vagando' as EstadoGato,
            peixeId: null,
            timer: 1 + Math.random() * 3,
            yaw: Math.random() * TAU,
            t: Math.random() * 10,
            passo: Math.random() * TAU,
            vel: 0,
            sentado: false,
        };
    });
}

/* =============================== peixe =============================== */

const Peixe: React.FC<{ yaw?: number }> = React.memo(({ yaw = 0 }) => (
    <group rotation={[0, yaw, 0]}>
        {/* corpo achatado */}
        <mesh scale={[0.6, 0.42, 1]} castShadow>
            <sphereGeometry args={[0.16, 12, 8]} />
            <meshStandardMaterial color="#b7c1c8" roughness={0.32} metalness={0.55} />
        </mesh>
        {/* cauda triangular */}
        <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.09, 0.17, 3]} />
            <meshStandardMaterial color="#98a5ad" roughness={0.45} metalness={0.5} />
        </mesh>
        {/* barbatana dorsal */}
        <mesh position={[0, 0.07, -0.02]} castShadow>
            <coneGeometry args={[0.05, 0.12, 3]} />
            <meshStandardMaterial color="#98a5ad" roughness={0.45} metalness={0.5} />
        </mesh>
        {/* olhos */}
        <mesh position={[0.075, 0.05, 0.1]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshStandardMaterial color="#15181a" roughness={0.3} />
        </mesh>
        <mesh position={[-0.075, 0.05, 0.1]}>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshStandardMaterial color="#15181a" roughness={0.3} />
        </mesh>
    </group>
));
Peixe.displayName = 'Peixe';

/** O caixote da vila: madeira + 3 peixes em cima, prontos para o jogador pegar. */
const CestoDePeixes: React.FC = () => {
    const y = useMemo(() => chaoEm(CESTO.x, CESTO.z) ?? 0, []);
    return (
        <group position={[CESTO.x, y, CESTO.z]}>
            <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.74, 0.32, 0.54]} />
                <meshStandardMaterial color="#6b4a2e" roughness={0.92} />
            </mesh>
            <mesh position={[0, 0.25, 0]} castShadow>
                <boxGeometry args={[0.8, 0.06, 0.6]} />
                <meshStandardMaterial color="#7d5836" roughness={0.9} />
            </mesh>
            <group position={[-0.18, 0.34, 0.02]}>
                <Peixe yaw={0.35} />
            </group>
            <group position={[0.06, 0.34, -0.08]}>
                <Peixe yaw={-0.5} />
            </group>
            <group position={[0.24, 0.34, 0.12]}>
                <Peixe yaw={1.1} />
            </group>
        </group>
    );
};

/** O peixe balança na frente da câmera enquanto está na mão do jogador. */
const PeixeNaMao: React.FC<{ camera: THREE.Camera }> = ({ camera }) => {
    const ref = useRef<THREE.Group>(null!);
    const tmp = useMemo(() => new THREE.Vector3(), []);
    useFrame((state) => {
        const g = ref.current;
        const visivel = gatos.peixeNaMao;
        g.visible = visivel;
        if (!visivel) return;
        tmp.set(0.17, -0.24, -0.42).applyQuaternion(camera.quaternion).add(camera.position);
        g.position.copy(tmp);
        g.quaternion.copy(camera.quaternion);
        g.rotateZ(Math.sin(state.clock.elapsedTime * 2.2) * 0.35);
        g.rotateX(Math.sin(state.clock.elapsedTime * 1.3) * 0.2);
    });
    return (
        <group ref={ref} visible={false}>
            <Peixe />
        </group>
    );
};

/* ============================== um gato =============================== */

type Jog = React.MutableRefObject<{ x: number; y: number; z: number }>;

// patas dianteiras e traseiras: [x, z]
const PATAS: [number, number][] = [[-0.13, 0.2], [0.13, 0.2], [-0.13, -0.2], [0.13, -0.2]];

const Gato: React.FC<{ e: GatoCtx; jog: Jog }> = ({ e, jog }) => {
    const raiz = useRef<THREE.Group>(null!);
    const corpo = useRef<THREE.Group>(null!);
    const cabeca = useRef<THREE.Group>(null!);
    const orelhaE = useRef<THREE.Group>(null!);
    const orelhaD = useRef<THREE.Group>(null!);
    const rabo0 = useRef<THREE.Group>(null!);
    const rabo1 = useRef<THREE.Group>(null!);
    const rabo2 = useRef<THREE.Group>(null!);
    const pata0 = useRef<THREE.Group>(null!);
    const pata1 = useRef<THREE.Group>(null!);
    const pata2 = useRef<THREE.Group>(null!);
    const pata3 = useRef<THREE.Group>(null!);

    const mats = useMemo(() => ({
        pelo: new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.9 }),
        barriga: new THREE.MeshStandardMaterial({ color: e.cor2, roughness: 0.95 }),
        olho: new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.25, emissive: '#3a2c07' }),
        pupila: new THREE.MeshStandardMaterial({ color: '#0e1013', roughness: 0.3 }),
        nariz: new THREE.MeshStandardMaterial({ color: '#e08a8a', roughness: 0.5 }),
    }), [e.cor, e.cor2]);

    useEffect(() => () => {
        mats.pelo.dispose();
        mats.barriga.dispose();
        mats.olho.dispose();
        mats.pupila.dispose();
        mats.nariz.dispose();
    }, [mats]);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        e.t += dt;
        const pjx = jog.current.x;
        const pjz = jog.current.z;

        switch (e.estado) {
            /* ------------------------------------------------ vagando */
            case 'vagando': {
                // o desconfiado recua se o jogador colar nele
                if (e.tipo === 'desconfiado') {
                    const d = Math.hypot(e.pos.x - pjx, e.pos.z - pjz);
                    if (d < 2.6) {
                        const ix = (e.pos.x - pjx) / (d || 1);
                        const iz = (e.pos.z - pjz) / (d || 1);
                        e.alvo.set(e.pos.x + ix * 2.5, e.pos.y, e.pos.z + iz * 2.5);
                        e.timer = 1.6;
                    }
                }
                e.timer -= dt;
                if (e.timer <= 0 || plano2D(e.pos, e.alvo.x, e.alvo.z) < 0.6) {
                    const a = Math.random() * TAU;
                    const r = 1.2 + Math.random() * 4;
                    e.alvo.set(e.casa.x + Math.cos(a) * r, e.pos.y, e.casa.z + Math.sin(a) * r);
                    e.timer = e.tipo === 'pachorrento' ? 9 + Math.random() * 8 : 4 + Math.random() * 5;
                }
                const v = moverPara(e, VEL[e.tipo] * (e.tipo === 'pachorrento' ? 0.5 : 0.6), dt, e.alvo, 0.4);
                e.vel += (v - e.vel) * Math.min(1, 10 * dt);

                // fareja peixes sem dono
                for (let i = 0; i < peixesNoChao.length; i++) {
                    const p = peixesNoChao[i];
                    if (p.dono !== null) continue;
                    if (!querPeixe(e, p, pjx, pjz)) continue;
                    e.estado = 'indo';
                    e.peixeId = p.id;
                    break;
                }
                break;
            }

            /* ------------------------------------------------ indo ao peixe */
            case 'indo': {
                const p = acharPeixe(e.peixeId);
                if (!p || p.dono !== null) {          // outro gato chegou primeiro
                    e.estado = 'vagando';
                    e.peixeId = null;
                    break;
                }
                const d = plano2D(e.pos, p.pos.x, p.pos.z);
                if (d < RAIO_COME) {
                    p.dono = e.id;                    // reivindica o peixe
                    e.estado = 'comendo';
                    e.timer = TEMPO_COMIDA[e.tipo];
                    e.vel = 0;
                    gatos.ultimoNome = e.nome;
                    break;
                }
                // desconfiado desiste se o jogador chegar perto do peixe
                if (e.tipo === 'desconfiado' && Math.hypot(pjx - p.pos.x, pjz - p.pos.z) < 3.2) {
                    e.estado = 'vagando';
                    e.peixeId = null;
                    break;
                }
                const v = moverPara(e, VEL[e.tipo], dt, p.pos, RAIO_COME * 0.7);
                e.vel += (v - e.vel) * Math.min(1, 10 * dt);
                break;
            }

            /* ------------------------------------------------ comendo */
            case 'comendo': {
                e.vel += (0 - e.vel) * Math.min(1, 12 * dt);
                const p = acharPeixe(e.peixeId);
                if (!p) {
                    e.estado = 'vagando';
                    e.peixeId = null;
                    break;
                }
                // encara o peixe
                let dif = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) - e.yaw;
                dif = Math.atan2(Math.sin(dif), Math.cos(dif));
                e.yaw += dif * Math.min(1, 4 * dt);

                // o desconfiado larga o peixe e foge se o jogador chega perto
                if (e.tipo === 'desconfiado' && Math.hypot(e.pos.x - pjx, e.pos.z - pjz) < 2.4) {
                    p.dono = null;
                    e.peixeId = null;
                    e.estado = 'vagando';
                    e.timer = 0;
                    break;
                }

                e.timer -= dt;
                if (e.timer <= 0) {
                    const i = peixesNoChao.indexOf(p);
                    if (i >= 0) { peixesNoChao.splice(i, 1); versaoPeixes++; }
                    e.peixeId = null;
                    e.estado = 'saciado';
                    e.timer = 0;
                    comeu[e.id] = true;
                    gatos.alimentados++;
                    gatos.saciados = contarSaciados();
                    break;
                }
                break;
            }

            /* ------------------------------------------------ saciado */
            case 'saciado': {
                if (e.sentado) {
                    e.timer -= dt;
                    e.vel += (0 - e.vel) * Math.min(1, 10 * dt);
                    if (e.timer <= 0) { e.sentado = false; e.estado = 'vagando'; e.timer = 0; }
                    break;
                }
                if (plano2D(e.pos, e.casa.x, e.casa.z) < 0.7) {
                    e.sentado = true;
                    e.vel = 0;
                    e.timer = e.tipo === 'fominha' ? 9 : e.tipo === 'pachorrento' ? 35 : 18;
                    break;
                }
                const v = moverPara(e, VEL[e.tipo] * 0.7, dt, e.casa, 0.5);
                e.vel += (v - e.vel) * Math.min(1, 10 * dt);
                break;
            }
        }

        /* ---------- pose: tudo procedural, zero alocação por quadro ---------- */
        const gc = Math.min(1, e.vel / VEL[e.tipo]);
        e.passo += e.vel * dt * 5.5;
        const dormindo = e.sentado;

        const r = raiz.current;
        r.position.copy(e.pos);
        r.rotation.y = e.yaw;

        const c = corpo.current;
        c.position.y = Math.abs(Math.sin(e.passo)) * 0.03 * gc - (dormindo ? 0.08 : 0);
        c.rotation.z = Math.sin(e.passo) * 0.05 * gc;
        c.rotation.x = dormindo ? 0.06 : -0.035 * gc;

        const amp = 0.6 * gc;
        pata0.current.rotation.x = dormindo ? 0.85 : Math.sin(e.passo) * amp;
        pata1.current.rotation.x = dormindo ? 0.85 : Math.sin(e.passo + Math.PI) * amp;
        pata2.current.rotation.x = dormindo ? 1.25 : Math.sin(e.passo + Math.PI) * amp * 0.85;
        pata3.current.rotation.x = dormindo ? 1.25 : Math.sin(e.passo) * amp * 0.85;

        const sw = Math.sin(e.t * 2.4 + e.id * 2.1);
        const humor = e.estado === 'comendo' ? 1.35 : e.estado === 'saciado' ? 0.5 : 1;
        rabo0.current.rotation.x = dormindo ? 0.08 : 0.22 + 0.4 * humor + Math.sin(e.t * 1.6) * 0.05;
        rabo0.current.rotation.y = sw * (0.2 + 0.4 * (1 - gc));
        rabo1.current.rotation.y = sw * 0.45 * (1 - gc * 0.5);
        rabo1.current.rotation.x = Math.sin(e.t * 2.4 + 0.4) * 0.12;
        rabo2.current.rotation.y = sw * 0.5 * (1 - gc * 0.5);
        rabo2.current.rotation.x = Math.sin(e.t * 2.4 + 0.9) * 0.14;

        const cb = cabeca.current;
        cb.rotation.x = dormindo ? 0.55 : e.estado === 'comendo' ? 0.45 : -0.06 * gc;
        cb.rotation.z = Math.sin(e.t * 0.9) * 0.05;

        const medroso = e.tipo === 'desconfiado' && Math.hypot(e.pos.x - pjx, e.pos.z - pjz) < 3;
        const orel = 0.3 + (medroso ? 0.5 : 0) + Math.sin(e.t * 3.1) * 0.03;
        orelhaE.current.rotation.z = orel;
        orelhaD.current.rotation.z = -orel - Math.sin(e.t * 3.1 + 0.5) * 0.03;
    });

    return (
        <group ref={raiz} position={e.pos}>
            <group ref={corpo}>
                {/* tronco */}
                <mesh position={[0, 0.3, 0]} scale={[1, 0.85, 1.5]} castShadow material={mats.pelo}>
                    <sphereGeometry args={[0.24, 14, 10]} />
                </mesh>
                {/* peito claro */}
                <mesh position={[0, 0.23, 0.14]} scale={[0.8, 0.62, 0.95]} castShadow material={mats.barriga}>
                    <sphereGeometry args={[0.18, 12, 8]} />
                </mesh>

                {/* cabeça */}
                <group ref={cabeca} position={[0, 0.44, 0.33]}>
                    <mesh castShadow material={mats.pelo}>
                        <sphereGeometry args={[0.15, 12, 10]} />
                    </mesh>
                    <mesh position={[0, -0.035, 0.1]} scale={[1, 0.72, 0.85]} material={mats.barriga}>
                        <sphereGeometry args={[0.085, 10, 8]} />
                    </mesh>
                    <mesh position={[0, -0.005, 0.175]} material={mats.nariz}>
                        <sphereGeometry args={[0.024, 8, 6]} />
                    </mesh>
                    <mesh position={[-0.062, 0.03, 0.118]} material={mats.olho}>
                        <sphereGeometry args={[0.03, 8, 6]} />
                    </mesh>
                    <mesh position={[-0.066, 0.03, 0.14]} material={mats.pupila}>
                        <sphereGeometry args={[0.013, 6, 6]} />
                    </mesh>
                    <mesh position={[0.062, 0.03, 0.118]} material={mats.olho}>
                        <sphereGeometry args={[0.03, 8, 6]} />
                    </mesh>
                    <mesh position={[0.066, 0.03, 0.14]} material={mats.pupila}>
                        <sphereGeometry args={[0.013, 6, 6]} />
                    </mesh>
                    <group ref={orelhaE} position={[-0.085, 0.115, -0.005]}>
                        <mesh position={[0, 0.05, 0]} castShadow material={mats.pelo}>
                            <coneGeometry args={[0.055, 0.11, 4]} />
                        </mesh>
                    </group>
                    <group ref={orelhaD} position={[0.085, 0.115, -0.005]}>
                        <mesh position={[0, 0.05, 0]} castShadow material={mats.pelo}>
                            <coneGeometry args={[0.055, 0.11, 4]} />
                        </mesh>
                    </group>
                </group>

                {/* rabo articulado (3 juntas) */}
                <group ref={rabo0} position={[0, 0.4, -0.3]}>
                    <mesh position={[0, 0, -0.085]} rotation={[-Math.PI / 2, 0, 0]} castShadow material={mats.pelo}>
                        <cylinderGeometry args={[0.037, 0.03, 0.17, 6]} />
                    </mesh>
                    <group ref={rabo1} position={[0, 0, -0.17]}>
                        <mesh position={[0, 0, -0.075]} rotation={[-Math.PI / 2, 0, 0]} castShadow material={mats.pelo}>
                            <cylinderGeometry args={[0.03, 0.024, 0.15, 6]} />
                        </mesh>
                        <group ref={rabo2} position={[0, 0, -0.15]}>
                            <mesh position={[0, 0, -0.065]} rotation={[-Math.PI / 2, 0, 0]} castShadow material={mats.pelo}>
                                <cylinderGeometry args={[0.024, 0.012, 0.13, 6]} />
                            </mesh>
                        </group>
                    </group>
                </group>

                {/* patas (pivô no ombro/quadril) */}
                <group ref={pata0} position={[PATAS[0][0], 0.2, PATAS[0][1]]}>
                    <mesh position={[0, -0.1, 0]} castShadow material={mats.pelo}>
                        <capsuleGeometry args={[0.045, 0.11, 3, 8]} />
                    </mesh>
                </group>
                <group ref={pata1} position={[PATAS[1][0], 0.2, PATAS[1][1]]}>
                    <mesh position={[0, -0.1, 0]} castShadow material={mats.pelo}>
                        <capsuleGeometry args={[0.045, 0.11, 3, 8]} />
                    </mesh>
                </group>
                <group ref={pata2} position={[PATAS[2][0], 0.2, PATAS[2][1]]}>
                    <mesh position={[0, -0.1, 0]} castShadow material={mats.pelo}>
                        <capsuleGeometry args={[0.045, 0.11, 3, 8]} />
                    </mesh>
                </group>
                <group ref={pata3} position={[PATAS[3][0], 0.2, PATAS[3][1]]}>
                    <mesh position={[0, -0.1, 0]} castShadow material={mats.pelo}>
                        <capsuleGeometry args={[0.045, 0.11, 3, 8]} />
                    </mesh>
                </group>
            </group>
        </group>
    );
};

/* ============================ componente raiz ========================== */

export const GatosDaVila: React.FC<{ jog: Jog }> = ({ jog }) => {
    const camera = useThree((s) => s.camera);
    const registros = useMemo(() => criarGatos(), []);
    const [listaPeixes, setListaPeixes] = useState<Peixe[]>([]);
    const visto = useRef(-1);
    const dir = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        peixesNoChao.length = 0;
        versaoPeixes++;
        gatos.peixeNaMao = false;
        gatos.alimentados = 0;
        gatos.saciados = 0;
        gatos.ultimoNome = '';
        gatos.gatosNaVila = registros.length;
        for (let i = 0; i < comeu.length; i++) comeu[i] = false;
        return () => {
            gatos.peixeNaMao = false;
            gatos.gatosNaVila = 0;
        };
    }, [registros]);

    useFrame(() => {
        // a API de módulo (gatos.pegar/oferecer) precisa saber onde o jogador está
        posJogador.copy(jog.current);
        camera.getWorldDirection(dir);
        jogFrente.set(dir.x, 0, dir.z);
        if (jogFrente.lengthSq() < 1e-6) jogFrente.set(0, 0, 1);
        else jogFrente.normalize();

        // sincroniza os peixes desenhados só quando a lista muda (fora do loop quente)
        if (visto.current !== versaoPeixes) {
            visto.current = versaoPeixes;
            setListaPeixes(peixesNoChao.slice());
        }
    });

    return (
        <group>
            {registros.map((e) => (
                <Gato key={e.id} e={e} jog={jog} />
            ))}
            <CestoDePeixes />
            {listaPeixes.map((p) => (
                <group key={p.id} position={p.pos}>
                    <Peixe yaw={p.yaw} />
                </group>
            ))}
            <PeixeNaMao camera={camera} />
        </group>
    );
};
