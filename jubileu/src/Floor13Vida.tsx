/**
 * Floor13Vida.tsx — o que faz Vindhjem parecer habitada: crianças correndo
 * umas atrás das outras pela praça, cachorros soltos (um trota com elas,
 * outro cochila perto da forja, um terceiro fuça o pouso) e os três gatos
 * de rua da vila.
 *
 * Os gatos andam EXATAMENTE como o <Bicho> original: no estado 'vagando' o
 * gato cinza percorre o mesmo círculo (x, z, raio, vel, fase), com o mesmo
 * clipe Walk em setEffectiveTimeScale(vel/.9) e a mesma orientação
 * rotation.y = -a; os dois gatos de poleiro continuam parados, com y fixo e
 * os clipes Idle / Idle_2_HeadLow (com o a.time = fase*1.7 de antes).
 *
 * A única coisa acrescentada é farejar: quando aparece um peixe no chão que
 * valha a pena, o gato sai do círculo, come e volta andando (Walk) para o
 * ponto do círculo de AGORA — o ângulo continua a ser calculado pela mesma
 * fórmula, então ele retoma o passeio de onde estava, sem emenda. Peixes,
 * personalidades e contadores moram em f13Gatos.tsx.
 *
 * Comer precisa LER no celular (antes o gato virava um borrão parado em cima
 * do peixe): no estado 'comendo' o corpo agacha uns 4 cm e inclina a frente
 * para o peixe, a cabeça mastiga (clipe Eating quando o GLB tem, senão o osso
 * da cabeça/pescoço girado a cada quadro) e o rabo abana devagar; ao terminar,
 * o gato SENTA 1,5 s e lambe o bigode (clipe Lick / Idle_2_HeadLow) antes de
 * voltar a andar. Nada disso encosta no 'vagando' — que segue idêntico ao
 * passeio original — e a escala do bicho não muda em momento nenhum.
 */
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { Viking } from './Floor13Povo';
import type { FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { chaoEm, foraDasCasas } from './f13Mundo';
import {
    gatos, RAIO_COME, VEL, TEMPO_COMIDA, consumirPeixe, marcarComeu,
    ondeEstaOJogador, peixeDisponivelPara, peixeQueValeAPena,
    type Peixe, type Personalidade,
} from './f13Gatos';
import husky from './assets/f13/povo/cao_husky.glb';
import shiba from './assets/f13/povo/cao_shiba.glb';
import gato from './assets/f13/povo/gato.glb';

const livre = (): React.MutableRefObject<EstadoVisualNpc> => ({ current: { olharPara: null, falando: false, possessao: 0, caido: false } });
const crianca = (tunica: string) => ({ id: 'eira', nome: '', oficio: 'criança', tunica, barba: null, primeira: [], depois: [] } as unknown as FichaNpc);

/**
 * Pelagem fina: fios claros e escuros num canvas cinza-claro que multiplica a
 * cor de cada material (a cor vem do GLB) e serve de relevo. Sem ela o bicho
 * era plástico liso.
 */
let texPelo: THREE.CanvasTexture | null = null;
function texturaDePelo(): THREE.CanvasTexture {
    if (texPelo) return texPelo;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 128, 128);
    let k = 7; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    for (let i = 0; i < 2600; i++) {
        const x = r() * 128, y = r() * 128, l = 2 + r() * 5, a = .5 + (r() - .5) * .6, v = r() > .5 ? 255 : 120;
        g.strokeStyle = `rgba(${v},${v},${v},${.12 + r() * .2})`; g.lineWidth = .7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    texPelo = new THREE.CanvasTexture(c);
    texPelo.wrapS = texPelo.wrapT = THREE.RepeatWrapping; texPelo.repeat.set(5, 5); texPelo.colorSpace = THREE.SRGBColorSpace;
    return texPelo;
}

type Parado = 'Idle' | 'Eating' | 'Idle_2_HeadLow';
/** Pelagens de gato sobre o mesmo modelo: cor do corpo e da barriga. */
export const PELAGENS: Record<string, [string, string] | undefined> = {
    laranja: undefined, cinza: ['#5f5b57', '#d9d3c8'], preto: ['#1d1b1b', '#e9e5dc'],
};

/** Clona o GLB, pinta a pelagem e devolve os clipes. Cão e gato passam aqui. */
function useBicho(url: string, pelagem?: string) {
    const { scene, animations } = useGLTF(url);
    const modelo = useMemo(() => {
        const m = clonarComEsqueleto(scene);
        const p = pelagem ? PELAGENS[pelagem] : undefined;
        m.traverse((o) => {
            const me = o as THREE.Mesh; if (!me.isMesh) return;
            me.castShadow = true; me.receiveShadow = true;
            const mat = (me.material as THREE.MeshStandardMaterial).clone(); me.material = mat;
            if (/eye/i.test(mat.name)) return;
            if (p && mat.name === 'Main') mat.color.set(p[0]);
            if (p && mat.name === 'Main_Light') mat.color.set(p[1]);
            mat.map = texturaDePelo(); mat.bumpMap = texturaDePelo(); mat.bumpScale = 1.2; mat.roughness = .9;
        });
        return m;
    }, [scene, pelagem]);
    return { modelo, animations };
}

/* ============================ animação ================================ */

type Acoes = Record<string, THREE.AnimationAction | undefined>;

/**
 * Acha um clipe pelo nome, tolerando exportador que renomeia: primeiro nome
 * exato, depois começo do nome, depois pedaço do nome. A ordem de `nomes` é a
 * ordem de preferência (ex.: ['Eating', 'Idle_2_HeadLow', 'Idle']).
 */
function acharClipe(actions: Acoes, nomes: string[]): THREE.AnimationAction | null {
    for (const n of nomes) { const a = actions[n]; if (a) return a; }
    const chaves = Object.keys(actions);
    for (const n of nomes) {
        const alvo = n.toLowerCase();
        const k = chaves.find((c) => c.toLowerCase() === alvo)
            ?? chaves.find((c) => c.toLowerCase().startsWith(alvo))
            ?? chaves.find((c) => c.toLowerCase().includes(alvo));
        const a = k ? actions[k] : undefined;
        if (a) return a;
    }
    return null;
}

/**
 * Troca de clipe com crossFade curto (.25s). Se o clipe pedido já está
 * tocando, não faz nada — é o caso do Walk do 'vagando', que atravessa a ida
 * ao peixe sem emenda (só muda o ritmo).
 */
function tocarClipe(actions: Acoes, nomes: string[], atual: React.MutableRefObject<THREE.AnimationAction | null>): boolean {
    const a = acharClipe(actions, nomes);
    if (!a || a === atual.current) return false;
    const antigo = atual.current;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (antigo && antigo !== a) antigo.crossFadeTo(a, .25, false);
    atual.current = a;
    return true;
}

// listas fixas (nada de alocar array por quadro)
const CLIPES_PARADO = ['Idle'];
const CLIPES_DEITADO = ['Idle_2_HeadLow', 'Idle'];
const CLIPES_ANDANDO = ['Walk', 'Gallop'];
const CLIPES_CORRENDO = ['Gallop', 'Walk'];
const CLIPES_COMENDO = ['Eating', 'Idle_2_HeadLow', 'Idle'];
const CLIPES_LAMBENDO = ['Lick', 'Licking', 'Idle_2_HeadLow', 'Idle'];
/** nomes que denunciam um clipe de mastigar (muitos GLB não têm nenhum). */
const CLIPES_MASTIGAR = ['Eating', 'Eat', 'Chew', 'Mastig'];

/** Quanto tempo o gato senta lambendo o bigode depois de comer (segundos). */
const TEMPO_LAMBER = 1.5;

/* ------------------------- ossos (animação na mão) -------------------- */

// temporários de módulo: nada de alocar Quaternion/Vector no laço quente
const _eixoX = new THREE.Vector3(1, 0, 0);
const _qAux = new THREE.Quaternion();

/**
 * Primeiro osso cujo nome casa com uma das pistas. O exportador ora escreve
 * "Head"/"Neck"/"Tail", ora "Bone.014": a busca é por nome, com a ordem das
 * pistas valendo como preferência, e devolve null se não achar nenhum.
 */
function acharOsso(raiz: THREE.Object3D, pistas: RegExp[]): THREE.Bone | null {
    let achado: THREE.Bone | null = null;
    raiz.traverse((o) => {
        if (achado) return;
        const b = o as THREE.Bone;
        if (!b.isBone) return;
        for (let i = 0; i < pistas.length; i++) {
            if (pistas[i].test(b.name)) { achado = b; return; }
        }
    });
    return achado;
}

/* ======================== cachorros (só passeiam) ===================== */

/** Um bicho simples: anda em círculo (trote ou galope), ou fica parado. */
const Bicho: React.FC<{ url: string; x: number; z: number; raio?: number; vel?: number; fase?: number; parado?: Parado; pelagem?: string; y?: number }> =
    ({ url, x, z, raio = 0, vel = .5, fase = 0, parado, pelagem, y }) => {
        const { modelo, animations } = useBicho(url, pelagem);
        const g = useRef<THREE.Group>(null);
        const { actions } = useAnimations(animations, g);
        const acao = useRef<THREE.AnimationAction | null>(null);
        useEffect(() => () => { acao.current?.stop(); acao.current = null; }, []);
        useEffect(() => {
            // os clipes do GLB chamam-se Walk, Gallop, Idle… (o código antigo
            // pedia "Walk_AnimalArmature", que não existe: ninguém se mexia)
            const nome = parado ?? (vel > 1.6 ? 'Gallop' : 'Walk');
            tocarClipe(actions as unknown as Acoes, [nome], acao);
            const a = acao.current;
            if (a) {
                a.setEffectiveTimeScale(parado ? 1 : vel > 1.6 ? vel / 3.4 : vel / .9);
                a.time = fase * 1.7 % Math.max(.01, a.getClip().duration);
            }
        }, [actions, parado, vel, fase]);
        useFrame(({ clock }) => {
            const o = g.current; if (!o) return;
            const a = fase + clock.elapsedTime * vel / Math.max(raio, .1);
            const px = raio ? x + Math.cos(a) * raio : x, pz = raio ? z + Math.sin(a) * raio : z;
            o.position.set(px, y ?? chaoEm(px, pz) ?? 0, pz);
            // de frente para onde anda (tangente do círculo)
            o.rotation.y = raio ? -a : fase;
        });
        return <group ref={g}><primitive object={modelo} /></group>;
    };

/* ============================ os gatos ================================ */

type EstadoGato = 'vagando' | 'indo' | 'comendo' | 'lambendo' | 'voltando';

/**
 * Cada gato guarda exatamente o que o <Bicho> original recebia: x, z, raio,
 * vel, fase e (quando fica em cima de algo) o y e o clipe parado. É essa
 * ficha que mantém o passeio idêntico ao de antes.
 */
type FichaGato = {
    id: number;
    nome: string;
    tipo: Personalidade;
    pelagem?: string;                  // undefined = pelagem original do GLB (laranja)
    x: number; z: number;
    raio: number;                      // 0 = não passeia, fica no poleiro
    vel: number; fase: number;
    y?: number;                        // poleiro: altura fixa
    parado?: 'Idle' | 'Idle_2_HeadLow';
};

const GATOS: FichaGato[] = [
    // <Bicho url={gato} x={-3.5} z={6.5} raio={1} vel={.45} fase={1} pelagem="cinza" />
    { id: 0, nome: 'Cinza', tipo: 'desconfiado', pelagem: 'cinza', x: -3.5, z: 6.5, raio: 1, vel: .45, fase: 1 },
    // <Bicho ... x={-3.33} z={13.71} y={.9} parado="Idle" fase={1.67} pelagem="preto" /> (balcão da barraca)
    { id: 1, nome: 'Soneca', tipo: 'pachorrento', pelagem: 'preto', x: -3.33, z: 13.71, raio: 0, vel: .5, fase: 1.67, y: .9, parado: 'Idle' },
    // <Bicho ... x={1.1} z={8} y={.63} parado="Idle_2_HeadLow" fase={0} /> (borda do poço)
    { id: 2, nome: 'Tico', tipo: 'fominha', x: 1.1, z: 8, raio: 0, vel: .5, fase: 0, y: .63, parado: 'Idle_2_HeadLow' },
];

type Ctx = {
    pos: THREE.Vector3;    // posição real (x, y, z)
    estado: EstadoGato;
    peixe: Peixe | null;
    timer: number;
    yaw: number;
    vel: number;           // velocidade real medida → ritmo do clipe
    agachar: number;       // 0 = em pé (passeio), 1 = agachado em cima do peixe
};

/** Move o gato (x,z) em direção a um ponto. Devolve a velocidade real (m/s). */
function andarPara(e: Ctx, vel: number, dt: number, x: number, z: number, parar: number): number {
    const dx = x - e.pos.x, dz = z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= parar || d < 1e-4) return 0;
    const ix = dx / d, iz = dz / d;
    // giro suave pelo caminho mais curto — atan2(ix, iz) é o mesmo yaw do
    // <Bicho> original (lá, rotation.y = -a dá a tangente do círculo)
    let dif = Math.atan2(ix, iz) - e.yaw;
    dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    e.yaw += dif * Math.min(1, 7 * dt);
    const passo = Math.min(vel * dt, d - parar);
    // colisão: não atravessa parede de casa nem pisa no vazio da borda
    const f = foraDasCasas(e.pos.x + ix * passo, e.pos.z + iz * passo, .25);
    if (chaoEm(f.x, f.z) === null || chaoEm(f.x + ix * .3, f.z + iz * .3) === null) return 0;
    e.pos.x = f.x; e.pos.z = f.z;
    return passo / Math.max(dt, 1e-4);
}

/** Pés no chão. Descer do poleiro é um pulo rápido (caída), não um planar lento. */
function pousar(e: Ctx, dt: number) {
    const chao = chaoEm(e.pos.x, e.pos.z) ?? e.pos.y;
    if (e.pos.y > chao + .02) e.pos.y = Math.max(chao, e.pos.y - 5 * dt);
    else e.pos.y = chao;
}

const Gato13: React.FC<{ f: FichaGato }> = ({ f }) => {
    const { modelo, animations } = useBicho(gato, f.pelagem);
    const raiz = useRef<THREE.Group>(null!);
    // grupo interno: é nele que o agachar/inclinar para o peixe acontece,
    // sem mexer no position/rotation.y que o passeio original usa
    const corpo = useRef<THREE.Group>(null!);
    const { actions } = useAnimations(animations, raiz);
    const acao = useRef<THREE.AnimationAction | null>(null);
    useEffect(() => () => { acao.current?.stop(); acao.current = null; }, []);

    /* Ossos que o clipe não dá conta: cabeça/pescoço (mastigar) e rabo (abanar).
       Procura pelo nome; guarda a pose de repouso para devolver o osso depois. */
    const ossos = useMemo(() => {
        const cabeca = acharOsso(modelo, [/head/i, /cabec/i, /pesco/i, /neck/i, /coluna/i, /spine/i]);
        const rabo = acharOsso(modelo, [/tail/i, /rabo/i, /cauda/i]);
        return {
            cabeca,
            rabo,
            qCabeca: cabeca ? cabeca.quaternion.clone() : null,
            qRabo: rabo ? rabo.quaternion.clone() : null,
        };
    }, [modelo]);

    // o GLB traz um clipe de mastigar? (Eating / Eat / Chew…) Se não trouxer,
    // é o osso da cabeça que mastiga, girado a cada quadro.
    const temClipeMastigar = useMemo(
        () => !!acharClipe(actions as unknown as Acoes, CLIPES_MASTIGAR),
        [actions],
    );

    // marcas de "eu mexi neste osso no quadro anterior" (para devolvê-lo ao repouso)
    const tocouCabeca = useRef(false);
    const tocouRabo = useRef(false);

    const e = useMemo<Ctx>(() => {
        // começa onde o círculo o põe em t=0 (o useFrame corrige no 1º quadro)
        const a0 = f.fase;
        const px = f.raio > 0 ? f.x + Math.cos(a0) * f.raio : f.x;
        const pz = f.raio > 0 ? f.z + Math.sin(a0) * f.raio : f.z;
        return {
            pos: new THREE.Vector3(px, f.parado ? (f.y ?? 0) : 0, pz),
            estado: 'vagando',
            peixe: null,
            timer: 0,
            yaw: f.raio > 0 ? -a0 : f.fase,
            vel: f.raio > 0 ? f.vel : 0,
            agachar: 0,
        };
    }, [f]);

    useFrame(({ clock }, delta) => {
        const o = raiz.current; if (!o) return;
        const dt = Math.min(delta, .05);
        const t = clock.elapsedTime;
        const pj = ondeEstaOJogador();
        const pjx = pj.x, pjz = pj.z;
        if (import.meta.env.DEV) ((window as unknown as { __gatos?: Ctx[] }).__gatos ??= [])[f.id] = e;

        switch (e.estado) {

            /* ------------------------------------------------------- vagando
               EXATAMENTE o <Bicho> original: mesmo círculo, mesmo Walk em
               vel/.9, mesma orientação rotation.y = -a. Gato de poleiro fica
               com y fixo, rotation.y = fase e clipe Idle/Idle_2_HeadLow. */
            case 'vagando': {
                if (f.raio > 0) {
                    const a = f.fase + t * f.vel / Math.max(f.raio, .1);
                    const px = f.x + Math.cos(a) * f.raio;
                    const pz = f.z + Math.sin(a) * f.raio;
                    e.pos.set(px, chaoEm(px, pz) ?? 0, pz);
                    e.yaw = -a;
                    e.vel = f.vel;
                } else {
                    e.pos.set(f.x, f.y ?? 0, f.z);
                    e.yaw = f.fase;
                    e.vel = 0;
                }
                // só isto é novo: fareja um peixe largado no chão
                const p = peixeQueValeAPena(f.tipo, e.pos.x, e.pos.z);
                if (p) { e.peixe = p; e.estado = 'indo'; }
                break;
            }

            /* --------------------------------------------------- indo ao peixe */
            case 'indo': {
                const p = e.peixe;
                if (!p || !peixeDisponivelPara(p, f.id)) {   // sumiu, ou outro chegou primeiro
                    e.peixe = null; e.estado = 'voltando';
                    break;
                }
                // o desconfiado não come com plateia
                if (f.tipo === 'desconfiado' && Math.hypot(pjx - p.pos.x, pjz - p.pos.z) < 3.2) {
                    e.peixe = null; e.estado = 'voltando';
                    break;
                }
                if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < RAIO_COME) {
                    p.dono = f.id;                       // reivindica o peixe
                    e.estado = 'comendo';
                    e.timer = TEMPO_COMIDA[f.tipo];
                    e.vel = 0;
                    gatos.ultimoNome = f.nome;           // o HUD mostra quem ganhou
                    break;
                }
                const v = andarPara(e, VEL[f.tipo] * 1.35, dt, p.pos.x, p.pos.z, RAIO_COME * .7);
                e.vel += (v - e.vel) * Math.min(1, 10 * dt);
                // quem desce do poleiro desce com jeito
                pousar(e, dt);
                break;
            }

            /* ------------------------------------------------------- comendo
               Aqui o gato tem de LER: agacha (o grupo desce), inclina a frente
               para o peixe, mastiga e abana o rabo devagar. O agachar é suave
               (e.agachar) para não dar tranco. */
            case 'comendo': {
                e.vel += (0 - e.vel) * Math.min(1, 12 * dt);
                const p = e.peixe;
                if (!p || !peixeDisponivelPara(p, f.id)) {
                    e.peixe = null; e.estado = 'voltando';
                    break;
                }
                // cabeça baixa encarando o peixe
                let dif = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) - e.yaw;
                dif = Math.atan2(Math.sin(dif), Math.cos(dif));
                e.yaw += dif * Math.min(1, 4 * dt);
                pousar(e, dt);
                // o desconfiado larga o peixe e foge se o jogador chega perto
                if (f.tipo === 'desconfiado' && Math.hypot(e.pos.x - pjx, e.pos.z - pjz) < 2.4) {
                    p.dono = null; e.peixe = null; e.estado = 'voltando';
                    break;
                }
                e.timer -= dt;
                if (e.timer <= 0) {
                    consumirPeixe(p);        // sai do chão, conta alimentados
                    marcarComeu(f.id);       // conta os gatos distintos satisfeitos
                    e.peixe = null;
                    // saciado: senta 1,5 s e lambe o bigode antes de voltar a andar
                    e.estado = 'lambendo';
                    e.timer = TEMPO_LAMBER;
                }
                break;
            }

            /* ------------------------------------------------------ lambendo
               Os 1,5 s de gato satisfeito: parado no lugar, clipe de língua
               (Lick / Idle_2_HeadLow) e o rabo ainda abanando. Só depois é que
               ele volta a andar (Walk) até o círculo. */
            case 'lambendo': {
                e.vel += (0 - e.vel) * Math.min(1, 12 * dt);
                pousar(e, dt);
                e.timer -= dt;
                if (e.timer <= 0) e.estado = 'voltando';
                break;
            }

            /* ------------------------------------------------------ voltando
               anda (Walk) até o ponto do círculo de AGORA e retoma o original.
               O ângulo continua sendo fase + t*vel/raio, então o passeio
               recomeça exatamente de onde tinha de estar. */
            case 'voltando': {
                const vPasso = Math.min(VEL[f.tipo] * .9, 1.15);   // passo de caminhada

                if (f.raio > 0) {
                    // mira onde o círculo vai estar quando eu chegar; sem isso o
                    // ponto "foge" na tangente e o gato nunca encosta nele
                    const v = Math.max(vPasso, .3);
                    let tc = Math.hypot(f.x - e.pos.x, f.z - e.pos.z) / v;
                    for (let i = 0; i < 2; i++) {
                        const an = f.fase + (t + tc) * f.vel / Math.max(f.raio, .1);
                        tc = Math.hypot(f.x + Math.cos(an) * f.raio - e.pos.x, f.z + Math.sin(an) * f.raio - e.pos.z) / v;
                    }
                    const an = f.fase + (t + tc) * f.vel / Math.max(f.raio, .1);
                    const ax = f.x + Math.cos(an) * f.raio;
                    const az = f.z + Math.sin(an) * f.raio;
                    const d = Math.hypot(e.pos.x - ax, e.pos.z - az);

                    if (d < .3) {                      // encostou: volta ao <Bicho>
                        e.estado = 'vagando'; e.vel = f.vel; e.yaw = -an;
                        break;
                    }
                    const vv = andarPara(e, v, dt, ax, az, .15);
                    e.vel += (vv - e.vel) * Math.min(1, 10 * dt);
                    // já vai alinhando o corpo com a tangente do círculo
                    if (d < 1.2) {
                        let dif = (-an) - e.yaw;
                        dif = Math.atan2(Math.sin(dif), Math.cos(dif));
                        e.yaw += dif * Math.min(1, 3 * dt);
                    }
                    pousar(e, dt);

                } else {
                    // quem mora no poleiro volta para o poleiro (y fixo de novo)
                    const d = Math.hypot(e.pos.x - f.x, e.pos.z - f.z);
                    if (d < .2) {
                        e.pos.set(f.x, f.y ?? 0, f.z);
                        e.yaw = f.fase;
                        e.vel = 0;
                        e.estado = 'vagando';
                        break;
                    }
                    const vv = andarPara(e, vPasso, dt, f.x, f.z, .12);
                    e.vel += (vv - e.vel) * Math.min(1, 10 * dt);
                    // sobe para o poleiro só no finzinho (não flutua pela praça)
                    // no último meio metro, um pulo curto de volta ao poleiro
                    if (d < .5) e.pos.y = THREE.MathUtils.lerp(f.y ?? 0, chaoEm(e.pos.x, e.pos.z) ?? 0, d / .5) + Math.sin((1 - d / .5) * Math.PI) * .25;
                    else pousar(e, dt);
                }
                break;
            }
        }

        /* ---------------- clipe e ritmo: as mesmas contas de antes --------- */
        let clipes: string[]; let ritmo = 1;
        switch (e.estado) {
            case 'comendo':
                clipes = CLIPES_COMENDO;
                break;
            case 'lambendo':
                clipes = CLIPES_LAMBENDO;      // lambe o bigode no ritmo do clipe
                break;
            case 'vagando':
                if (f.parado) {
                    clipes = f.parado === 'Idle_2_HeadLow' ? CLIPES_DEITADO : CLIPES_PARADO;
                } else {
                    const correndo = f.vel > 1.6;
                    clipes = correndo ? CLIPES_CORRENDO : CLIPES_ANDANDO;
                    ritmo = correndo ? f.vel / 3.4 : f.vel / .9;   // ← o de sempre
                }
                break;
            case 'indo': {
                const correndo = e.vel > 1.6;
                clipes = correndo ? CLIPES_CORRENDO : CLIPES_ANDANDO;
                ritmo = correndo ? e.vel / 3.4 : e.vel / .9;
                break;
            }
            default:   // voltando: sempre andando (Walk)
                clipes = CLIPES_ANDANDO;
                ritmo = Math.max(e.vel, .3) / .9;
                break;
        }

        const antes = acao.current;
        const trocou = tocarClipe(actions as unknown as Acoes, clipes, acao);
        const a = acao.current;
        if (a) {
            a.setEffectiveTimeScale(THREE.MathUtils.clamp(ritmo, .25, 2.4));
            // como no <Bicho>, o clipe parado do poleiro entra neste ponto do ciclo
            if (trocou && antes !== a && f.parado && e.estado === 'vagando') {
                a.time = f.fase * 1.7 % Math.max(.01, a.getClip().duration);
            }
        }

        /* ---------------- mastigar, abanar o rabo e agachar ----------------
           Só com o gato no peixe. Fora daí nada é tocado, então o 'vagando'
           continua idêntico ao passeio original. Roda depois do mixer (o
           useAnimations assina o useFrame antes deste), então o que se escreve
           no osso vale para o quadro. Sem alocação: só os temporários de cima. */
        const noPeixe = e.estado === 'comendo' || e.estado === 'lambendo';
        const mastigando = e.estado === 'comendo' && !temClipeMastigar;

        if (ossos.cabeca && ossos.qCabeca) {
            if (mastigando) {
                // bob curto e rápido do queixo (o clipe Idle_2_HeadLow/Idle não mastiga)
                _qAux.setFromAxisAngle(_eixoX, Math.sin(t * 26) * .10 + .05);
                ossos.cabeca.quaternion.copy(ossos.qCabeca).multiply(_qAux);
                tocouCabeca.current = true;
            } else if (tocouCabeca.current) {
                ossos.cabeca.quaternion.copy(ossos.qCabeca);   // devolve o osso aos clipes
                tocouCabeca.current = false;
            }
        }
        if (ossos.rabo && ossos.qRabo) {
            if (noPeixe) {
                // rabo balança devagar, de gato contente
                _qAux.setFromAxisAngle(_eixoX, Math.sin(t * 2.1) * .22);
                ossos.rabo.quaternion.copy(ossos.qRabo).multiply(_qAux);
                tocouRabo.current = true;
            } else if (tocouRabo.current) {
                ossos.rabo.quaternion.copy(ossos.qRabo);
                tocouRabo.current = false;
            }
        }

        // agacha ~4 cm e inclina a frente para o peixe (some sozinho no passeio)
        const alvoAgachar = e.estado === 'comendo' ? 1 : e.estado === 'lambendo' ? .6 : 0;
        e.agachar += (alvoAgachar - e.agachar) * Math.min(1, 7 * dt);
        const c = corpo.current;
        if (c) {
            c.position.y = -.04 * e.agachar;   // o corpo desce
            c.rotation.x = .24 * e.agachar;    // o focinho desce para o peixe
        }

        o.position.copy(e.pos);
        o.rotation.y = e.yaw;
    });

    return (
        <group ref={raiz} position={[f.x, f.y ?? 0, f.z]}>
            <group ref={corpo}>
                <primitive object={modelo} />
            </group>
        </group>
    );
};

/* ============================ componente raiz ========================== */

export const Floor13Vida: React.FC = () => {
    const estados = useMemo(() => [livre(), livre(), livre()], []);

    // os gatos passaram a morar aqui: o HUD do Floor13 lê este número
    useEffect(() => {
        gatos.gatosNaVila = GATOS.length;
        return () => { gatos.gatosNaVila = 0; };
    }, []);

    return <Suspense fallback={null}>
        {/* pega-pega: duas crianças no mesmo círculo, meia volta atrás uma da outra —
            longe da Sigrun, do Halvard e da pedra rúnica (antes a roda passava por dentro da Sigrun),
            e fora da linha do poço (de quem chega pela praça, a menina de vermelho
            parecia em pé na borda dele) */}
        <Viking ficha={crianca('#b0452a')} x={-3.2} y={0} z={5} ronda={1.6} rondaVel={1.3} estado={estados[0]} />
        <Viking ficha={crianca('#2f5d62')} x={-3.2} y={0} z={5} ronda={1.6} rondaVel={1.3} rondaFase={2.2} estado={estados[1]} />
        <Viking ficha={crianca('#6f9a4a')} x={5.5} y={0} z={6.5} ronda={1.8} rondaVel={1.1} rondaFase={.7} estado={estados[2]} />
        <Bicho url={husky} x={-3.2} z={5} raio={1.6} vel={3.4} fase={3.6} />
        <Bicho url={shiba} x={-21} z={9} parado="Idle_2_HeadLow" fase={2.4} />
        {/* o shiba da ilha do pouso brinca de buscar o graveto: ver f13Busca */}
        <Bicho url={husky} x={2.6} z={-20.2} parado="Eating" fase={-.8} />
        {/* gatos: a raposa da Quaternius remodelada (tools/blender/f13_bichos.py),
            com o MESMO caminho de antes — agora movidos a peixe */}
        {GATOS.map((f) => <Gato13 key={f.id} f={f} />)}
    </Suspense>;
};
useGLTF.preload(husky); useGLTF.preload(shiba); useGLTF.preload(gato);
