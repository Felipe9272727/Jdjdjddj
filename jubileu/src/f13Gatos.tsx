/**
 * f13Gatos.tsx — o estado dos gatos de rua da vila (andar 13).
 *
 * Aqui NÃO se desenha gato nenhum: os gatos de verdade são os GLB animados de
 * Floor13Vida.tsx (componente Gato13), que leem e escrevem neste módulo.
 * O que vive aqui é a cozinha da brincadeira:
 *
 *   - os peixes largados no chão (lista mutável, sem passar pelo React a cada quadro);
 *   - o caixote de peixes da vila, que dá peixe de graça a quem chegar perto;
 *   - as regras de personalidade (quem corre atrás de um peixe, e quando);
 *   - os contadores do HUD (alimentados, saciados, ultimoNome);
 *   - a API que o Floor13 aperta no botão: gatos.pegar() / gatos.oferecer().
 *
 * O Gato13 importa daqui peixeQueValeAPena(), RAIO_COME, VEL, TEMPO_COMIDA,
 * consumirPeixe(), marcarComeu(), peixeDisponivelPara() e ondeEstaOJogador().
 * A posição do jogador chega pelo `jog` de GatosDaVila (o mesmo ref que o resto
 * do andar usa) e fica em `posJogador`, para as regras acima.
 *
 * O que se desenha aqui é o caixote (madeira) e os peixes no chão — mais o
 * peixe que balança na mão do jogador.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { chaoEm } from './f13Mundo';

const TAU = Math.PI * 2;
export const RAIO_COME = 0.55;      // distância em que o gato alcança o peixe
const ALCANCE_PEGAR = 2.2;          // alcance do jogador para pegar um peixe do chão
const MAX_PEIXES = 10;              // anti-lixo de peixes esquecidos

/** O caixote de peixes da vila: dá peixes de graça para quem chegar perto. */
export const CESTO = new THREE.Vector3(-3, 0, -1);

export type Personalidade = 'fominha' | 'desconfiado' | 'pachorrento';

/** Velocidade de caminhada (m/s) e tempo de mastigação (s) de cada personalidade. */
export const VEL: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 2.2, pachorrento: 1.2 };
export const TEMPO_COMIDA: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 4.5, pachorrento: 8 };

/* ============================== peixes ================================ */

export type Peixe = { id: number; pos: THREE.Vector3; yaw: number; dono: number | null };

export const peixesNoChao: Peixe[] = [];
let versaoPeixes = 0;          // muda quando a lista muda (o React observa)
let proximoIdPeixe = 1;

/** Muda a cada peixe posto/tira do chão: é o gatilho de redesenho do React. */
export function versaoDosPeixes(): number { return versaoPeixes; }

/* ===================== posição do jogador (para a API) ================ */

const posJogador = new THREE.Vector3();
const jogFrente = new THREE.Vector3(0, 0, 1);

/** Onde o jogador está agora. Quem chama não deve mexer no vetor. */
export function ondeEstaOJogador(): THREE.Vector3 { return posJogador; }

/* ============================ estado global ============================ */

const jaComeu = new Set<number>();

export const gatos = {
    /** true quando o jogador está com um peixe na mão */
    peixeNaMao: false,
    /** peixes que os gatos já comeram */
    alimentados: 0,
    /** quantos gatos distintos já comeram (0..3) */
    saciados: 0,
    /** quantos gatos vivem na vila agora (quem sabe é o Floor13Vida) */
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

/** Zera peixes e contadores quando o andar carrega. */
export function reiniciarGatosDaVila() {
    peixesNoChao.length = 0;
    versaoPeixes++;
    jaComeu.clear();
    gatos.peixeNaMao = false;
    gatos.alimentados = 0;
    gatos.saciados = 0;
    gatos.ultimoNome = '';
}

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

/** O peixe ainda está no chão e ninguém (ou só o gato `id`) reivindicou ele? */
export function peixeDisponivelPara(p: Peixe, id: number): boolean {
    return peixesNoChao.indexOf(p) >= 0 && (p.dono === null || p.dono === id);
}

/** Tira o peixe do chão: conta para o HUD e libera a lista. */
export function consumirPeixe(p: Peixe): boolean {
    const i = peixesNoChao.indexOf(p);
    if (i < 0) return false;
    peixesNoChao.splice(i, 1);
    versaoPeixes++;
    gatos.alimentados++;
    return true;
}

/** Marca que o gato `id` já comeu (o HUD mostra "n de 3 gatos satisfeitos"). */
export function marcarComeu(id: number) {
    jaComeu.add(id);
    gatos.saciados = jaComeu.size;
}

/* ========================== comportamentos ============================ */

/** Regra de cada personalidade para decidir se vale a pena ir atrás do peixe. */
export function querPeixe(tipo: Personalidade, gx: number, gz: number, p: Peixe): boolean {
    switch (tipo) {
        case 'fominha': return true;                                                        // vem de qualquer lugar
        case 'desconfiado': return Math.hypot(posJogador.x - p.pos.x, posJogador.z - p.pos.z) > 4.5; // só sem plateia
        case 'pachorrento': return Math.hypot(gx - p.pos.x, gz - p.pos.z) < 3.5;            // só se cair no colo
        default: return false;
    }
}

/** Primeiro peixe sem dono que esse gato se digna a buscar. */
export function peixeQueValeAPena(tipo: Personalidade, gx: number, gz: number): Peixe | null {
    for (let i = 0; i < peixesNoChao.length; i++) {
        const p = peixesNoChao[i];
        if (p.dono !== null) continue;
        if (!querPeixe(tipo, gx, gz, p)) continue;
        return p;
    }
    return null;
}

/* ============================ API do jogador ========================== */

function pegarPeixe(): boolean {
    if (gatos.peixeNaMao) return false;
    // 1) peixe solto no chão, ao alcance
    for (let i = peixesNoChao.length - 1; i >= 0; i--) {
        const p = peixesNoChao[i];
        if (p.dono !== null) continue;   // já tem dono: o gato está comendo
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

/**
 * O caixote da vila: tábuas escuras, cantoneiras e aro claro — madeira de
 * tanoaria, a mesma família de cor do resto da vila. Três peixes em cima,
 * prontos para o jogador pegar.
 */
const CaixoteDePeixes: React.FC = () => {
    const y = useMemo(() => chaoEm(CESTO.x, CESTO.z) ?? 0, []);
    const m = useMemo(() => ({
        tabua: new THREE.MeshStandardMaterial({ color: '#7a5433', roughness: .93 }),
        tabuaClara: new THREE.MeshStandardMaterial({ color: '#8d643c', roughness: .9 }),
        canto: new THREE.MeshStandardMaterial({ color: '#54402c', roughness: .95 }),
    }), []);
    useEffect(() => () => { m.tabua.dispose(); m.tabuaClara.dispose(); m.canto.dispose(); }, [m]);

    const cantos: [number, number][] = [[-.39, .28], [.39, .28], [-.39, -.28], [.39, -.28]];

    return (
        <group position={[CESTO.x, y, CESTO.z]}>
            {/* corpo do caixote */}
            <mesh position={[0, .17, 0]} castShadow receiveShadow material={m.tabua}>
                <boxGeometry args={[.78, .34, .56]} />
            </mesh>
            {/* fundo, mais escuro: lê como a tábua de baixo */}
            <mesh position={[0, .055, 0]} material={m.canto}>
                <boxGeometry args={[.8, .06, .58]} />
            </mesh>
            {/* cantoneiras verticais */}
            {cantos.map(([cx, cz], i) => (
                <mesh key={i} position={[cx, .185, cz]} castShadow material={m.canto}>
                    <boxGeometry args={[.07, .40, .07]} />
                </mesh>
            ))}
            {/* aro do topo */}
            <mesh position={[0, .365, 0]} castShadow material={m.tabuaClara}>
                <boxGeometry args={[.86, .05, .64]} />
            </mesh>
            {/* peixes do dia */}
            <group position={[-0.18, 0.42, 0.02]}>
                <Peixe yaw={0.35} />
            </group>
            <group position={[0.06, 0.42, -0.08]}>
                <Peixe yaw={-0.5} />
            </group>
            <group position={[0.24, 0.42, 0.12]}>
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

/* ============================ componente raiz ========================== */

type Jog = React.MutableRefObject<{ x: number; y: number; z: number }>;

/**
 * Não tem mais gato aqui: só o caixote, os peixes caídos e o peixe na mão.
 * O useFrame existe para manter `posJogador` e `jogFrente` atualizados — é
 * disso que gatos.pegar()/oferecer() e as regras dos gatos dependem.
 */
export const GatosDaVila: React.FC<{ jog: Jog }> = ({ jog }) => {
    const camera = useThree((s) => s.camera);
    const [listaPeixes, setListaPeixes] = useState<Peixe[]>([]);
    const visto = useRef(-1);
    const dir = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        reiniciarGatosDaVila();
        return () => { gatos.peixeNaMao = false; };
    }, []);

    useFrame(() => {
        // a API de módulo (gatos.pegar/oferecer) precisa saber onde o jogador está
        posJogador.copy(jog.current);
        camera.getWorldDirection(dir);
        jogFrente.set(dir.x, 0, dir.z);
        if (jogFrente.lengthSq() < 1e-6) jogFrente.set(0, 0, 1);
        else jogFrente.normalize();

        // sincroniza os peixes desenhados só quando a lista muda (fora do loop quente)
        const v = versaoDosPeixes();
        if (visto.current !== v) {
            visto.current = v;
            setListaPeixes(peixesNoChao.slice());
        }
    });

    return (
        <group>
            <CaixoteDePeixes />
            {listaPeixes.map((p) => (
                <group key={p.id} position={p.pos}>
                    <Peixe yaw={p.yaw} />
                </group>
            ))}
            <PeixeNaMao camera={camera} />
        </group>
    );
};