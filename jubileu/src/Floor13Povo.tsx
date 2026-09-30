/**
 * Floor13Povo.tsx — os moradores de Vindhjem em carne e osso.
 *
 * Cada morador é um modelo gerado no Blender (tools/blender/f13_humano.py):
 * corpo, pele, olhos e cabelo do MakeHuman (CC0) com esqueleto de jogo, e as
 * peças vikings — túnica, cinto, capa com gola de pele, elmo, barba — por
 * cima. Aqui só se ANIMA: o esqueleto é movido por código, com as mesmas
 * regras que os bonecos antigos seguiam (respirar, gesticular ao falar, o
 * gesto de cada ofício, andar, virar para o hóspede, a possessão e a queda
 * dura). Não há clipes de animação: a cena manda em cada osso.
 */
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { congelaIdle } from './f13Atencao';
import { noite } from './f13Noite';
import { useGLTF } from '@react-three/drei';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { MARCA_ALTURA, fadeDaMarca, materialDaMarca } from './f13Marca';
import type { FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import ulfgar from './assets/f13/povo/ulfgar.glb';
import { forja } from './f13Fagulhas';
import brokk from './assets/f13/povo/brokk.glb';
import torvald from './assets/f13/povo/torvald.glb';
import halvard from './assets/f13/povo/halvard.glb';
import ragnhild from './assets/f13/povo/ragnhild.glb';
import sigrun from './assets/f13/povo/sigrun.glb';
import astrid from './assets/f13/povo/astrid.glb';
import eira from './assets/f13/povo/eira.glb';
import hospede from './assets/f13/povo/hospede.glb';
import arni from './assets/f13/povo/arni.glb';

const MODELOS: Record<string, string> = { ulfgar, brokk, torvald, halvard, ragnhild, sigrun, astrid, eira, hospede, arni };
/** Os modelos saem do Blender com ~1,8 m; o mundo foi medido para ~2 m. */
const ESCALA = 1.1;

/** Como cada um fica parado quando não trabalha nem fala. */
const JEITO: Readonly<Record<string, 'cruzados' | 'cintura' | 'costas' | 'solto'>> = {
    sigrun: 'costas', torvald: 'costas',
};
/** Degrau suave 0→1 entre a e b. */
const suave = (v: number, a: number, b: number) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
/** Janela 0→1→0 na fase u do ciclo: sobe em [a,b], segura, desce em [c,d]. */
const jan = (u: number, a: number, b: number, c: number, d: number) => suave(u, a, b) * (1 - suave(u, c, d));
/** O jeito de cada corpo parado: respiração, abertura das pernas, inclinação, ombros. */
interface Persona { resp: number; amp: number; abre: number; incl: number; tomba: number; ombro: number; }
const PERSONA_PADRAO: Persona = { resp: 1, amp: 1, abre: .03, incl: 0, tomba: 0, ombro: 0 };
const PERSONA: Readonly<Record<string, Persona>> = {
    brokk: { resp: .8, amp: 1.8, abre: .1, incl: .03, tomba: 0, ombro: .05 },      // peito largo, pernas firmes
    sigrun: { resp: 1.1, amp: .9, abre: .02, incl: .02, tomba: .06, ombro: 0 },    // leve, cabeça pendida
    ragnhild: { resp: 1.2, amp: 1, abre: .02, incl: -.02, tomba: -.05, ombro: 0 }, // quadril de lado, cesto
    torvald: { resp: .7, amp: 1.2, abre: .07, incl: -.05, tomba: 0, ombro: .04 },  // capitão: peito para fora
    halvard: { resp: .9, amp: .8, abre: .05, incl: .08, tomba: .04, ombro: -.02 }, // curvado sobre a vara
    ulfgar: { resp: .9, amp: 1.4, abre: .04, incl: -.02, tomba: -.04, ombro: 0 },  // escaldo: cabeça alta
    astrid: { resp: .85, amp: 1, abre: .11, incl: -.04, tomba: 0, ombro: .03 },    // guarda: pés afastados
};
/**
 * O tom de pele de cada um (multiplica o difuso do MakeHuman): antes todos
 * saíam com o mesmo '#e4c3b0' e pareciam irmãos. Quem vive no mar e na forja
 * é curtido e avermelhado; a pastora, sardenta e clara; o velho, pálido e fino.
 */
const PELE: Record<string, string> = {
    brokk: '#d9a488', torvald: '#d8ae92', halvard: '#dcb49c', ulfgar: '#ecd2c2', ragnhild: '#e9c4ae',
    sigrun: '#f3d9c9', astrid: '#d7b39a', eira: '#f0cdb8', arni: '#eed8cc', hospede: '#e4c3b0',
};
/** A cor do cabelo de quem não usa o do modelo. */
const PELO = /^(cabelo|barba|bigode|sobrancelhas|cilios|short|long|bob|braid|ponytail|afro|moustache|beard|goatee|eyebrow|eyelash)/i;
const CABELO: Record<string, string> = { arni: '#e9e6df', ulfgar: '#d9d4c7', brokk: '#8a3a22', sigrun: '#c9a063', astrid: '#3a2a20' };
const _mundo = new THREE.Vector3();

// ── O OFÍCIO NO CORPO ───────────────────────────────────────────────────────
// Todos saíram do mesmo corpo do MakeHuman: o que separa as silhuetas de longe
// é o porte (largura, altura) e o que cada um carrega. As peças vão presas a
// um osso, posicionadas no espaço do modelo em repouso (y para cima, z para a
// frente) e com a rotação e a escala do osso desfeitas.
const PORTE: Record<string, [number, number]> = {
    brokk: [1.14, .97], ulfgar: [.93, .98], torvald: [1.07, 1.03], astrid: [1.02, 1.04],
    sigrun: [.95, 1], ragnhild: [1.04, .97], halvard: [.97, 1.02],
};
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function prender(modelo: THREE.Object3D, nomeOsso: string, pecaCrua: THREE.Object3D, onde: [number, number, number]) {
    const osso = modelo.getObjectByName(nomeOsso); if (!osso) return;
    // embrulhada: a rotação própria da peça sobrevive à do osso desfeita
    const peca = new THREE.Group(); peca.add(pecaCrua);
    modelo.updateMatrixWorld(true);
    _m4.copy(modelo.matrixWorld).invert().multiply(osso.matrixWorld).decompose(_p, _q, _s);
    const inv = new THREE.Matrix4().compose(_p, _q, _s).invert();
    peca.position.set(...onde).applyMatrix4(inv);
    peca.quaternion.copy(_q).invert();
    peca.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);
    osso.add(peca);
}
const mat = (cor: string, r = .85, metal = 0) => new THREE.MeshStandardMaterial({ color: cor, roughness: r, metalness: metal });
/** Onde um osso repousa, no espaço do modelo (para prender peças na mão). */
const _v3 = new THREE.Vector3();
function posOsso(modelo: THREE.Object3D, nome: string): [number, number, number] {
    const osso = modelo.getObjectByName(nome); if (!osso) return [0, 0, 0];
    modelo.updateMatrixWorld(true);
    _v3.setFromMatrixPosition(osso.matrixWorld); modelo.worldToLocal(_v3);
    return [_v3.x, _v3.y, _v3.z];
}
/** Prende a peça na mão/antebraço: `d` é o desvio a partir do osso e `r` o giro (espaço do modelo em repouso). */
function naMao(modelo: THREE.Object3D, osso: string, pecaCrua: THREE.Object3D, d: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
    const p = posOsso(modelo, osso);
    pecaCrua.rotation.set(r[0], r[1], r[2]);
    prender(modelo, osso, pecaCrua, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
}
/** Para onde cada trabalhador olha enquanto trabalha (rad, 0 = +z): o ferreiro para a bigorna, o pescador para o vazio ao norte da praça. */
const TRABALHO: Readonly<Record<string, number>> = { brokk: 0, halvard: Math.PI };
/** Braços do pescador segurando a vara com as duas mãos (ajustados medindo). */
const HALVARD = { urx: -.5, urz: .05, lrx: -1.1, ulx: -1.25, ulz: -.6, llx: -.7 };
/** Postura do braço do martelo no instante em que a cabeça toca a mesa (ajustada medindo). */
const BROKK = { braco: -1.15, cotovelo: -.85, pulso: .5 };
// gestos: parâmetros da mão de cada ofício (ajustados olhando o resultado)
const V3 = (x: number, y: number, z: number) => [x, y, z] as [number, number, number];
const MAO = {
    // cabo na mão, cabeça além do punho e virada para a frente do golpe
    martelo: { d: V3(0, -.06, .02), r: V3(Math.PI, Math.PI / 2, 0) },
    // cajado em pé: a mão pega o meio, a ponta toca o chão
    cajado: { d: V3(0, -.3, .04), r: V3(.3, 0, -.55) },
    // tubo ao longo do antebraço, a lente grande à frente do punho
    luneta: { d: V3(0, -.1, .02), r: V3(Math.PI, 0, -1.1) },
    // vara para a frente e para fora, o cabo na palma
    vara: { d: V3(0, -.05, .03), r: V3(Math.PI / 2 + .1, 0, .2) },
    // lira no colo do braço, com a face para fora
    lira: { d: V3(-.06, -.02, .06), r: V3(0, 0, 0) },
    // escudo deitado no lado de fora do antebraço
    escudo: { d: V3(.1, -.12, 0), r: V3(0, Math.PI / 2, 0) },
    // cesto pendurado pela asa no antebraço
    cesto: { d: V3(0, -.2, .04), r: V3(0, 0, 0) },
};
function vestirOficio(m: THREE.Object3D, id: string) {
    const p = PORTE[id]; if (p) m.scale.set(p[0], p[1], p[0]);
    const peca = (g: THREE.BufferGeometry, cor: string, r?: number, metal?: number) => { const me = new THREE.Mesh(g, mat(cor, r, metal)); me.castShadow = true; return me; };
    if (id === 'brokk') {
        // avental de couro do peito aos joelhos, com a alça no pescoço
        const av = peca(new THREE.BoxGeometry(.4, .62, .015), '#5a3a22', .7); prender(m, 'spine_01', av, [0, 1.0, .115]);
        const alca = peca(new THREE.TorusGeometry(.1, .012, 6, 16, Math.PI), '#3a2616'); prender(m, 'spine_03', alca, [0, 1.42, .09]);
        // o martelo de forja na mão direita: cabo de freixo, cabeça de ferro com
        // face quadrada de um lado e pena estreita do outro (não um bloco: de
        // longe a cabeça lia como uma segunda bigorna)
        const g = new THREE.Group();
        const cabo = peca(new THREE.CylinderGeometry(.02, .026, .5, 8), '#6a4a2a'); cabo.position.y = .16; g.add(cabo);
        const cab = new THREE.Group(); cab.name = 'cabeca-martelo'; cab.position.y = .4;
        const corpo = peca(new THREE.BoxGeometry(.1, .085, .085), '#4a4a50', .45, .8); cab.add(corpo);
        const face = peca(new THREE.CylinderGeometry(.05, .046, .06, 8), '#5c5c64', .35, .85); face.rotation.z = Math.PI / 2; face.position.x = .08; cab.add(face);
        const pena = peca(new THREE.ConeGeometry(.038, .09, 6), '#44444a', .45, .8); pena.rotation.z = Math.PI / 2; pena.position.x = -.09; cab.add(pena);
        g.add(cab); g.name = 'martelo-do-brokk';
        naMao(m, 'hand_r', g, MAO.martelo.d, MAO.martelo.r);
    } else if (id === 'sigrun') {
        // cajado de pastora com o gancho em cima, na mão direita
        const g = new THREE.Group();
        g.add(peca(new THREE.CylinderGeometry(.016, .02, 1.7, 8), '#7a5a3a'));
        const gancho = peca(new THREE.TorusGeometry(.07, .016, 6, 14, Math.PI * 1.3), '#7a5a3a'); gancho.position.set(.07, .85, 0); g.add(gancho);
        naMao(m, 'hand_r', g, MAO.cajado.d, MAO.cajado.r);
    } else if (id === 'astrid') {
        // escudo redondo pintado, preso ao antebraço esquerdo, com umbo de ferro
        const g = new THREE.Group();
        const d = peca(new THREE.CylinderGeometry(.27, .27, .03, 24), '#8a2e2e', .6); d.rotation.x = Math.PI / 2; g.add(d);
        const aro = peca(new THREE.TorusGeometry(.27, .014, 6, 24), '#5a5a5e', .4, .8); g.add(aro);
        const u = peca(new THREE.SphereGeometry(.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#8a8a8a', .4, .8); u.rotation.x = Math.PI / 2; u.position.z = .02; g.add(u);
        naMao(m, 'lowerarm_l', g, MAO.escudo.d, MAO.escudo.r);
    } else if (id === 'ragnhild') {
        // cesto de vime no antebraço esquerdo
        const c = peca(new THREE.CylinderGeometry(.14, .11, .18, 14, 1, true), '#a8804a', .9); (c.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        const g = new THREE.Group(); g.add(c);
        const asa = peca(new THREE.TorusGeometry(.13, .01, 5, 14, Math.PI), '#8a6a3a', .9); asa.position.y = .09; g.add(asa);
        naMao(m, 'hand_l', g, MAO.cesto.d, MAO.cesto.r);
    } else if (id === 'torvald') {
        // o capitão leva a luneta de latão na mão direita
        const g = new THREE.Group();
        const tubo = peca(new THREE.CylinderGeometry(.022, .03, .34, 10), '#b08a4a', .35, .85); g.add(tubo);
        const aro = peca(new THREE.CylinderGeometry(.034, .034, .03, 10), '#6b5230', .5, .6); aro.position.y = .15; g.add(aro);
        naMao(m, 'hand_r', g, MAO.luneta.d, MAO.luneta.r);
    } else if (id === 'halvard') {
        // a vara de pescar nuvem, nas duas mãos (presa à direita), com a linha caindo
        const g = new THREE.Group();
        const v = peca(new THREE.CylinderGeometry(.01, .018, 1.9, 6), '#5a4a32'); v.name = 'vara'; v.position.y = .7; g.add(v);
        const linha = peca(new THREE.CylinderGeometry(.002, .002, 1.2, 3), '#d8d8cc', 1); linha.position.set(0, 1.0, .0); g.add(linha);
        naMao(m, 'hand_r', g, MAO.vara.d, MAO.vara.r);
    } else if (id === 'ulfgar') {
        // a lira do escaldo, apoiada no antebraço esquerdo
        const g = new THREE.Group();
        const aro = peca(new THREE.TorusGeometry(.11, .018, 6, 16, Math.PI * 1.5), '#8a6040'); aro.rotation.z = Math.PI * .75; g.add(aro);
        const trav = peca(new THREE.BoxGeometry(.24, .02, .02), '#6a4a30'); trav.position.y = .09; g.add(trav);
        for (let i = 0; i < 4; i++) { const c = peca(new THREE.CylinderGeometry(.002, .002, .2, 3), '#e8e0c0', 1); c.position.set(-.07 + i * .047, 0, 0); g.add(c); }
        naMao(m, 'hand_l', g, MAO.lira.d, MAO.lira.r);
    }
}
const SOMBRA = (() => {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!c) return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    c.width = c.height = 64; const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(20,16,10,.5)'); r.addColorStop(1, 'rgba(20,16,10,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();

/**
 * Um osso que se gira no espaço do PERSONAGEM (x = inclinar para a frente,
 * y = virar, z = tombar de lado), seja qual for o eixo local que o rig deu a
 * ele. Guarda a pose de repouso e a orientação de repouso no espaço do
 * modelo; cada quadro recompõe a partir do repouso.
 */
const _qJunta = new THREE.Quaternion(); // rascunho: girar() rodava ~450×/quadro e alocava 1 Quaternion por chamada
class Junta {
    private repouso: THREE.Quaternion;
    private noModelo: THREE.Quaternion;
    private inv: THREE.Quaternion;
    private q = new THREE.Quaternion();
    private e = new THREE.Euler();
    constructor(public osso: THREE.Bone, raiz: THREE.Object3D) {
        this.repouso = osso.quaternion.clone();
        const qr = new THREE.Quaternion(); raiz.getWorldQuaternion(qr);
        this.noModelo = new THREE.Quaternion(); osso.getWorldQuaternion(this.noModelo);
        this.noModelo.premultiply(qr.invert());
        this.inv = this.noModelo.clone().invert();
    }
    girar(x: number, y = 0, z = 0) {
        this.e.set(x, y, z, 'XYZ');
        this.q.setFromEuler(this.e);
        // repouso · (R⁻¹ · giro · R): o giro acontece em eixos do personagem
        this.osso.quaternion.copy(this.repouso).multiply(_qJunta.copy(this.inv).multiply(this.q).multiply(this.noModelo));
    }
    /** Dobra no eixo x do PRÓPRIO osso (o dedo fecha para a palma). */
    dobrar(a: number) {
        this.q.setFromAxisAngle(_eixoX, a);
        this.osso.quaternion.copy(this.repouso).multiply(this.q);
    }
}
const _eixoX = new THREE.Vector3(1, 0, 0);

type Juntas = Record<string, Junta>;
const OSSOS = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
    'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
    'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'] as const;
const DEDOS = ['index', 'middle', 'ring', 'pinky'];
/** Peças que projetam sombra (o resto só recebe). */
const SOMBREIA = /^(corpo|tunica|saia|capa|cabelo|barba|elmo|chifres|capuz)/;
/** Miudezas que somem de longe (a mais de DIST_DETALHE m ninguém vê um cílio). */
const DETALHE = /^(cilios|sobrancelhas|fivela|bigode)/;
const DIST_DETALHE = 11;
/** Quanto a roupa (molde adulto) aperta na cintura da criança. */
const AJUSTE_CRIANCA = .62;
/** Além disto o morador não é desenhado (a névoa já o apagou quase todo). */
const DIST_MAX = 48;
let _quadroFrustum = -1;
const _esfera = new THREE.Sphere(), _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4();

interface Props {
    ficha: FichaNpc;
    x: number; y: number; z: number;
    ronda?: number;
    estado: React.MutableRefObject<EstadoVisualNpc>;
    tique?: boolean;
    controle?: React.MutableRefObject<{ x: number; y: number; z: number; ang: number; andando: number; levantando: number }>;
    marca?: string | null;
    /** Sentado (o piloto na cabine), numa escala própria. */
    sentado?: boolean;
    /** Velocidade angular da ronda (rad/s) e fase inicial. */
    rondaVel?: number; rondaFase?: number;
    escalaExtra?: number;
    /** Dentro de outro objeto (o morador no vão da porta): sem recorte por distância/tela, que conta em espaço do mundo. */
    semRecorte?: boolean;
    /** Onde o morador está agora (a ronda anda): quem o procura lê daqui. */
    onde?: React.MutableRefObject<{ x: number; z: number }>;
}

const Morador: React.FC<Props> = ({ ficha, x, y, z, ronda, estado, tique, controle, marca, sentado, escalaExtra = 1, rondaVel = .45, rondaFase = 0, onde, semRecorte }) => {
    const url = MODELOS[ficha.id] ?? MODELOS.torvald;
    const { scene } = useGLTF(url);
    // cada morador tem o próprio esqueleto e os próprios materiais (tingidos)
    const { modelo, olhos, vestido, detalhes, sombreiam } = useMemo(() => {
        const m = clonarComEsqueleto(scene) as THREE.Object3D;
        let olhos: THREE.MeshStandardMaterial | null = null;
        const detalhes: THREE.Mesh[] = [];
        const sombreiam: THREE.Mesh[] = [];
        const tunica = new THREE.Color(ficha.tunica);
        m.traverse((o) => {
            const me = o as THREE.Mesh;
            if (!me.isMesh) return;
            // a gola de pele ainda lê como um prato em volta do pescoço: fora
            // até ser refeita como pele caída sobre os ombros
            if (me.name.startsWith('gola')) { me.visible = false; return; }
            // sombra só das peças grandes: cílio, fivela, calça sob a túnica
            // e bota não mudam a silhueta no chão e dobravam as chamadas
            me.castShadow = SOMBREIA.test(me.name); me.receiveShadow = true;
            me.userData.semSombra = !me.castShadow;
            if (me.castShadow) sombreiam.push(me);
            if (DETALHE.test(me.name)) detalhes.push(me);
            me.frustumCulled = false;
            let mat = (me.material as THREE.MeshStandardMaterial).clone();
            if (me.name.startsWith('corpo')) {
                // pele: o difuso do MakeHuman sob o sol lia como gesso (mão e
                // rosto chapados, quase brancos). Tom mais quente e fundo, e um
                // brilho aveludado avermelhado na borda — o sangue sob a pele
                const orig = mat;
                mat = new THREE.MeshPhysicalMaterial({
                    name: orig.name, map: orig.map, color: PELE[ficha.id as string] ?? '#e4c3b0', roughness: (ficha.id as string) === 'arni' ? .7 : .55, metalness: 0,
                    sheen: .3, sheenColor: new THREE.Color('#c8604a'), sheenRoughness: .45,
                    specularIntensity: .35, envMapIntensity: .6,
                });
                orig.dispose();
            }
            me.material = mat;
            const n = mat.name;
            if (n === 'tunica') mat.color.copy(tunica).multiplyScalar(1.15);
            else if (n === 'capa') mat.color.copy(tunica).multiplyScalar(.55);
            else if (n === 'calca') {
                mat.color.set('#6a5a48');
                // o cano da bota varava a calça no joelho (a mancha vermelha): a
                // calça ganha um empurrãozinho de profundidade e cobre o cano
                mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -8;
            }
            else if (n === 'bota') mat.color.set('#4e3826');
            else if (n === 'couro') mat.color.set('#8a6448');
            else if (n === 'pelo') mat.color.set('#b59a7c');
            else if (n === 'metal') mat.color.set('#9aa0a8');
            else if (n === 'capuz') mat.color.set('#7a8fb0');
            const tintePelo = CABELO[ficha.id as string];
            if (PELO.test(me.name) && !/^(barba|cilios|eyelash)/.test(me.name) && tintePelo) {
                mat.color.set(tintePelo);
                // a textura do cabelo é escura: multiplicar por branco não
                // clareia. Um pouco de emissivo levanta os fios claros.
                const c = new THREE.Color(tintePelo);
                if (c.getHSL({ h: 0, s: 0, l: 0 }).l > .7) mat.emissive = c.clone().multiplyScalar(.42);
            }
            if (me.name.startsWith('olhos') || n.includes('eye')) olhos = mat;
            // cabelo, barba, sobrancelhas e cílios do MakeHuman são cartões
            // com alfa: recorte e duas faces. O resto (pele inclusive) é
            // opaco e de uma face só — senão o avesso da cabeça aparece
            if (PELO.test(me.name)) {
                mat.alphaTest = .4; mat.transparent = false; mat.side = THREE.DoubleSide; mat.depthWrite = true;
                // a textura da barba tem pixels cor de pele pintados entre os
                // fios: liam como lascas cor de carne no pescoço. Tingida de
                // castanho, a franja vira sombra de pelo; sem o brilho da pele.
                if (/^(barba|bigode|moustache|beard)/i.test(me.name) && !tintePelo) { mat.color.set('#8a7462'); mat.roughness = .85; }
            } else {
                // opaco sempre; duas faces porque a malha do MakeHuman tem
                // faces com o enrolamento trocado (com uma face só, o rosto
                // abria buracos e mostrava a boca por dentro)
                mat.transparent = false; mat.alphaTest = 0; mat.depthWrite = true; mat.side = THREE.DoubleSide;
                // sombra só das costas: com as duas faces projetando, a pele
                // se auto-sombreava em listras (acne de sombra)
                mat.shadowSide = THREE.BackSide;
            }
        });
        // vestido longo (a barra abaixo do joelho): a calça por baixo não
        // aparece nunca — sai da cena — e o passo fica curto para as pernas
        // não varar o pano
        m.updateMatrixWorld(true);
        const saia = m.getObjectByName('saia') as THREE.Mesh | undefined;
        const alto = new THREE.Box3().setFromObject(m);
        let vestido = false;
        if (saia) {
            const b = new THREE.Box3().setFromObject(saia);
            vestido = (b.min.y - alto.min.y) / Math.max(.01, alto.max.y - alto.min.y) < .3;
        }
        // a saia da criança saía em sino (a barra no dobro da largura do
        // quadril) e o cinto rígido ficava boiando em volta do pano: afina a
        // barra na geometria de repouso, mais quanto mais baixo
        if (saia && ficha.id === 'eira') {
            const g = saia.geometry = saia.geometry.clone();
            // o GLB vem quantizado (inteiros normalizados): mexe numa cópia em float
            const q = g.getAttribute('position') as THREE.BufferAttribute, f = new Float32Array(q.count * 3);
            for (let i = 0; i < q.count; i++) { f[i * 3] = q.getX(i); f[i * 3 + 1] = q.getY(i); f[i * 3 + 2] = q.getZ(i); }
            g.setAttribute('position', new THREE.BufferAttribute(f, 3)); g.deleteAttribute('normal');
            g.computeBoundingBox();
            const bb = g.boundingBox!, pos = g.getAttribute('position') as THREE.BufferAttribute;
            const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, alto = bb.max.y - bb.min.y;
            for (let i = 0; i < pos.count; i++) {
                // a roupa foi cortada no molde adulto: na cintura fecha para ~60%
                // e a barra abre só um pouco
                const t = (bb.max.y - pos.getY(i)) / alto, k = AJUSTE_CRIANCA * (1 + .18 * t);
                pos.setX(i, cx + (pos.getX(i) - cx) * k); pos.setZ(i, cz + (pos.getZ(i) - cz) * k);
            }
            pos.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
        }
        // cinto e fivela são rígidos, presos ao osso da pelve, no tamanho
        // adulto: na criança boiavam em volta do pano. Ela anda sem cinto.
        // (e sai da lista de miudezas: o recorte por distância a religava — o
        // quadrado preto boiando no vestido)
        if (ficha.id === 'eira') for (const nome of ['cinto', 'fivela']) { const me = m.getObjectByName(nome); if (me) { me.visible = false; const i = detalhes.indexOf(me as THREE.Mesh); if (i >= 0) detalhes.splice(i, 1); } }
        if (vestido) m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && (me.material as THREE.Material).name === 'calca') me.visible = false; });
        // o nasal do elmo foi feito para o rosto-base: com os rostos esculpidos
        // ele boiava na testa como uma barra preta
        m.getObjectByName('elmo_nasal')?.removeFromParent();
        if (!semRecorte) vestirOficio(m, ficha.id as string);
        // o cinto do MakeHuman fica flutuando sobre o suéter do Árni
        if ((ficha.id as string) === 'arni') m.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm && mm.name === 'couro') o.visible = false; });
        return { modelo: m, olhos: olhos as THREE.MeshStandardMaterial | null, vestido, detalhes, sombreiam };
    }, [scene, ficha.tunica]);

    const juntas = useRef<Juntas>({});
    const dedos = useRef<Junta[]>([]);
    const raiz = useRef<THREE.Group>(null);
    useEffect(() => {
        if (!raiz.current) return;
        raiz.current.updateMatrixWorld(true);
        const j: Juntas = {};
        const d: Junta[] = [];
        modelo.traverse((o) => {
            const b = o as THREE.Bone;
            if (!b.isBone) return;
            if ((OSSOS as readonly string[]).includes(b.name)) j[b.name] = new Junta(b, raiz.current!);
            if (DEDOS.some((k) => b.name.startsWith(k))) d.push(new Junta(b, raiz.current!));
        });
        // as mãos do MakeHuman saem grandes para estes corpos
        for (const n of ['hand_l', 'hand_r']) j[n]?.osso.scale.setScalar(.9);
                juntas.current = j; dedos.current = d;
    }, [modelo]);

    const marcaRef = useRef<THREE.Group>(null);
    const matMarca = useMemo(() => materialDaMarca(marca ?? '!'), [marca]);
    const luzVerde = useRef<THREE.PointLight>(null);
    const martelo = useRef<THREE.Object3D | null>(null);
    const giro = useRef(TRABALHO[ficha.id] ?? 0);
    const quadro = useRef(0);
    const ultimo = useRef({ x: x + (ronda ?? 0), z });
    const queda = useRef(0);
    const cabeca = useRef({ x: 0, y: 0 });
    const ultimoGolpe = useRef(-1);
    const tmp = useMemo(() => new THREE.Vector3(), []);
    const crianca = ficha.id === 'eira';
    const escala = ESCALA * (crianca ? .95 : 1) * escalaExtra;

    useFrame(({ clock, camera }, dt) => {
        const g = raiz.current, J = juntas.current; if (!g || !J.pelvis) return;
        const t = clock.elapsedTime, e = estado.current, d = Math.min(dt, .05);
        // o rig do MakeHuman repousa com o cotovelo dobrado ~0,65 rad: os
        // números de antebraço abaixo contam a partir do braço reto
        const j = (n: string, ax: number, ay = 0, az = 0) => J[n]?.girar(n.startsWith('lowerarm') ? ax + .65 : ax, ay, az);
        if (marcaRef.current) {
            // a marca fica sempre bem acima da cabeça (também de perto) e some
            // de longe: cheia até 25 m, encolhe até 0 aos 33 m
            const d = g.position.distanceTo(camera.position);
            const fade = fadeDaMarca(d);
            marcaRef.current.visible = fade > .02;
            marcaRef.current.scale.setScalar(Math.min(1, .6 + d / 20) * fade / (g.scale.x || 1));
            marcaRef.current.position.y = MARCA_ALTURA + Math.sin(t * 2.5) * .04;
        }
        if (luzVerde.current && raiz.current) {
            const lz = luzVerde.current, r = raiz.current;
            // segue o peito dele: 1,75 m de altura, 0,9 m à frente
            lz.position.set(r.position.x + Math.sin(r.rotation.y) * .9 * r.scale.x, r.position.y + 1.75 * r.scale.y, r.position.z + Math.cos(r.rotation.y) * .9 * r.scale.x);
            lz.intensity = e.possessao > 0 ? 1.6 + Math.sin(t * 9) * .7 : 0;
        }
        if (olhos) {
            olhos.emissive.setRGB(e.possessao > 0 ? .3 : 0, e.possessao > 0 ? 2.6 : 0, e.possessao > 0 ? 1 : 0);
        }
        // ── onde está e para onde olha ──────────────────────────────────
        let px = x, pz = z, andando = false, direcao = TRABALHO[ficha.id] ?? giro.current;
        const ctl = controle?.current;
        if (ctl) { px = ctl.x; pz = ctl.z; direcao = ctl.ang; andando = ctl.andando > .15; }
        if (ronda && !e.falando && !e.olharPara) {
            const a = t * rondaVel + rondaFase;
            px = x + Math.cos(a) * ronda; pz = z + Math.sin(a) * ronda;
            direcao = -a; andando = true;
            ultimo.current.x = px; ultimo.current.z = pz;
        } else if (ronda) {
            // parada para conversar: fica onde estava (antes voltava ao
            // centro da ronda — a Eira aparecia dentro do poço)
            px = ultimo.current.x; pz = ultimo.current.z;
        }
        g.position.set(px, ctl ? ctl.y : y, pz);
        if (onde) { onde.current.x = px; onde.current.z = pz; }
        // o ferreiro não larga a bigorna para olhar quem passa: só se vira quando fala com o hóspede
        if (e.olharPara && !e.caido && (!(ficha.id in TRABALHO) || e.falando)) { tmp.set(e.olharPara.x - px, 0, e.olharPara.z - pz); direcao = Math.atan2(tmp.x, tmp.z); }
        let dd = direcao - giro.current;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        giro.current += dd * Math.min(1, d * 6);
        g.rotation.set(ctl ? -ctl.levantando * 1.35 : 0, ctl ? ctl.ang : giro.current, 0);
        g.scale.setScalar(escala);
        // longe da câmera ninguém nota o esqueleto: além de 28 m só se move
        // a cada 4 quadros, além de 70 m nem é desenhado
        const dist = semRecorte ? g.getWorldPosition(_mundo).distanceTo(camera.position) : g.position.distanceTo(camera.position);
        // fora do quadro não se desenha nem se anima (a sombra de quem está
        // colado atrás da câmera ainda conta: perto, fica visível)
        // o frustum da câmera é o mesmo para todos os moradores no quadro: calcula uma vez
        if (_quadroFrustum !== t) { _quadroFrustum = t; _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pv); }
        _esfera.center.set(g.position.x, g.position.y + escala * .9, g.position.z); _esfera.radius = escala * 1.3;
        g.visible = (!(noite.v > .5) || !!ctl) && (!!sentado || !!semRecorte || (dist < DIST_MAX && (dist < 4 || _frustum.intersectsSphere(_esfera))));
        if (!g.visible) return;
        const perto = dist < DIST_DETALHE;
        for (const m of detalhes) m.visible = perto;
        // sombra de gente só de perto: de longe ninguém lê a silhueta no chão
        // (e cada malha com pele entrava de novo na passada de sombra)
        const sombraPerto = dist < 16;
        for (const m of sombreiam) m.castShadow = sombraPerto;
        if (dist > 28 && !ctl && (++quadro.current & 3)) return;
        // Olhos da Vila (>= 35): o parado de alguém congela por um instante
        if (!ctl && !e.falando && !e.caido && e.possessao <= 0 && !sentado && congelaIdle(ficha.id, t)) return;

        // braços caídos ao lado do corpo (o rig vem em pose de A), dedos
        // meio fechados: mão relaxada, não espalmada
        // (0,92 passava da vertical: os braços iam para trás das costas e as
        // mãos varavam a saia na frente — os "dedos soltos" na cintura)
        const baixaE = -.74, baixaD = .74;
        // dedos dobrando para a palma (eixo x), não abrindo de lado: mão
        // relaxada em vez de garra
        // no eixo do próprio osso: girando no eixo do personagem, com a mão
        // pendendo de lado, o indicador abria para fora (mão em garra torta)
        dedos.current.forEach((f) => { const n = f.osso.name; f.dobrar(e.caido ? .1 : n.includes('_01') ? .3 : n.includes('_02') ? .55 : .4); });
        // punho alinhado ao antebraço, palma virada para a coxa
        const maoSolta = () => { J.hand_l?.girar(0, .5, 0); J.hand_r?.girar(0, -.5, 0); };
        const respira = Math.sin(t * 1.7 + x);
        if (sentado) {
            // na cabine: coxas para a frente, canelas para baixo, mãos no manche
            g.rotation.set(0, 0, 0); g.position.set(x, y, z);
            j('pelvis', 0); j('spine_01', -.1); j('spine_02', .05); j('spine_03', .05, 0, respira * .01);
            j('thigh_l', -1.45, 0, .08); j('thigh_r', -1.45, 0, -.08); j('calf_l', 1.35); j('calf_r', 1.35);
            if ((ficha.id as string) === 'arni') {
                // no banco: meio curvado, mãos largadas nos joelhos, a cabeça
                // quase parada, só acompanhando devagar o que passa
                j('spine_01', .12); j('spine_02', .1); j('spine_03', .06, 0, respira * .012);
                j('upperarm_l', -.35, 0, baixaE + .12); j('upperarm_r', -.35, 0, baixaD - .12);
                j('lowerarm_l', -.75); j('lowerarm_r', -.75); maoSolta();
                j('head', .12 + respira * .015, Math.sin(t * .31) * .18);
                return;
            }
            j('upperarm_l', -.7, 0, baixaE + .35); j('upperarm_r', -.7, 0, baixaD - .35);
            j('lowerarm_l', -.9); j('lowerarm_r', -.9);
            j('head', Math.sin(t * 7) * .04, Math.sin(t * 2.3) * .15);
            return;
        }

        if (e.caido) {
            // duro: rígido um instante, tomba de costas de uma vez e quica;
            // no baque os braços se abrem e um joelho dobra
            queda.current += d;
            const q = queda.current, tomba = q < .15 ? 0 : Math.min(1, ((q - .15) / .35) ** 2);
            const quica = q > .5 ? Math.abs(Math.sin((q - .5) * 14)) * Math.exp(-(q - .5) * 7) * .12 : 0;
            const baque = q > .5 ? Math.min(1, (q - .5) / .25) : 0;
            g.rotation.x = -Math.PI / 2 * tomba + quica;
            g.rotation.z = .2 * baque;
            g.position.y = y + .12 * tomba + quica * .4;
            j('pelvis', 0); j('spine_01', 0); j('spine_02', 0); j('spine_03', 0); j('neck_01', 0); j('head', -.2 * baque, .3 * baque);
            // braços no chão, abertos com o baque — nada apontando para o céu
            j('upperarm_l', 0, 0, baixaE + .35 * baque); j('upperarm_r', 0, 0, baixaD - .25 * baque);
            j('lowerarm_l', .05); j('lowerarm_r', .05); j('hand_l', 0); j('hand_r', 0);
            j('clavicle_l', 0); j('clavicle_r', 0); j('foot_l', .3); j('foot_r', .3);
            j('thigh_l', 0); j('thigh_r', -.4 * baque); j('calf_l', 0); j('calf_r', .8 * baque);
            return;
        }
        queda.current = 0;

        if (e.possessao > 0) {
            // possuído: levita, trava de frente para a câmera, treme em
            // quadros duros; marionete torta — um fio puxa o braço esquerdo,
            // o direito pende, a cabeça tomba e o queixo sobe
            const q = Math.floor(t * 14);
            g.position.y = y + .3 + Math.sin(t * 3) * .05;
            tmp.copy(camera.position).sub(g.position); g.rotation.y = Math.atan2(tmp.x, tmp.z);
            const tr = ((q * 7919) % 5 - 2) * .02 * e.possessao;
            j('pelvis', 0, 0, tr); j('spine_01', .05); j('spine_02', -.1); j('spine_03', -.08, 0, -tr);
            j('neck_01', -.04, 0, .16 * e.possessao); j('head', -.1 + ((q * 11) % 3 - 1) * .06, 0, .28 * e.possessao);
            j('clavicle_l', 0, 0, -.2);
            // o fio puxa aos trancos: o braço sobe e cai, o punho gira, os dedos arranham
            const puxa = Math.sin(t * 1.3) * .35 + (((q * 13) % 5) - 2) * .06;
            j('upperarm_l', -2.1 + puxa, 0, baixaE + .5); j('lowerarm_l', -.4 - Math.max(0, -puxa) * .8); j('hand_l', .6 + Math.sin(t * 5) * .3);
            // e o corpo inclina para o hóspede em solavancos
            g.position.y += Math.max(0, Math.sin(t * .9)) * .08;
            j('upperarm_r', -.3 - ((q * 7) % 3) * .08 + Math.sin(t * 2.1) * .2, 0, baixaD - .15); j('lowerarm_r', -.5 - Math.abs(Math.sin(t * 3.3)) * .5); j('hand_r', .9);
            j('thigh_l', .05); j('thigh_r', -.1); j('calf_l', .15); j('calf_r', .45); j('foot_l', .6); j('foot_r', .7);
            return;
        }

        // ── vivo: respira, balança, anda, fala, trabalha ────────────────
        let tique_ = 0;
        if (tique && Math.floor(t * 10) % 37 === 0) tique_ = .12;
        const P = PERSONA[ficha.id as string] ?? PERSONA_PADRAO;
        const resp = Math.sin(t * 1.7 * P.resp + x);
        j('spine_02', .02 + resp * .012 * P.amp, 0, tique_);
        j('spine_03', -.02 - resp * .018 * P.amp);
        j('neck_01', 0);
        j('foot_l', 0); j('foot_r', 0); j('clavicle_l', 0); j('clavicle_r', 0);
        if (andando) {
            const f = t * (ctl ? 9 : rondaVel > .9 ? 12 : 7);
            const s = Math.sin(f);
            g.position.y += Math.abs(Math.cos(f)) * .035;
            j('pelvis', 0, s * .07, s * .03);
            // torção pequena contra a pelve: o cinto é rígido na pelve e saltava da túnica
            j('spine_01', .04, -s * .04);
            const passo = vestido ? .3 : .6, dobra = vestido ? .45 : .95;
            j('thigh_l', -s * passo); j('thigh_r', s * passo);
            j('calf_l', Math.max(0, -Math.cos(f)) * dobra + .05); j('calf_r', Math.max(0, Math.cos(f)) * dobra + .05);
            j('foot_l', s * .2); j('foot_r', -s * .2);
            j('upperarm_l', s * .45, 0, baixaE); j('upperarm_r', -s * .45, 0, baixaD);
            j('lowerarm_l', -.35 - Math.max(0, s) * .3); j('lowerarm_r', -.35 - Math.max(0, -s) * .3);
            j('head', -.04, s * .05);
            maoSolta();
            return;
        }
        // troca de peso: a cada ~9 s o corpo passa de uma perna para a outra
        // (quadril sobe do lado do apoio, o outro joelho dobra); cada um no
        // seu ritmo, para a praça não respirar em coro
        const ritmo = 9 + (x * 7.3 % 4 + 4) % 4, fasePeso = Math.sin((t + x * 3.1) / ritmo * Math.PI * 2);
        const peso = Math.max(-1, Math.min(1, fasePeso * 2.2));
        j('pelvis', 0, peso * .04, peso * .05 + Math.sin(t * .6 + x) * .012);
        j('spine_01', P.incl, 0, -peso * .03);
        j('thigh_l', 0, 0, P.abre + Math.max(0, peso) * .04); j('thigh_r', 0, 0, -P.abre + Math.min(0, peso) * .04);
        j('calf_l', .04 + Math.max(0, -peso) * .18); j('calf_r', .04 + Math.max(0, peso) * .18);
        j('foot_l', -Math.max(0, -peso) * .12); j('foot_r', -Math.max(0, peso) * .12);
        if (e.falando) {
            // fala com o corpo: a cabeça acompanha as frases, as mãos desenham
            j('head', Math.sin(t * 3.1) * .06, Math.sin(t * 1.7) * .1, Math.sin(t * 2.3) * .04);
            j('upperarm_l', -.35 + Math.sin(t * 5) * .25, 0, baixaE + .25); j('lowerarm_l', -.9 + Math.sin(t * 4.3) * .3);
            j('upperarm_r', -.15 + Math.sin(t * 4 + 1) * .18, 0, baixaD - .1); j('lowerarm_r', -.6 + Math.sin(t * 3.7 + 2) * .25);
            j('hand_l', Math.sin(t * 6) * .2); j('hand_r', 0);
            return;
        }
        // o olhar passeia: fixa um ponto uns segundos e vira de uma vez (quem
        // gira a cabeça em seno contínuo parece um ventilador)
        const janela = Math.floor((t + x * 5) / 3.2), sorteio = ((janela * 9301 + 49297) % 233280) / 233280;
        const olharY = (sorteio - .5) * .9, olharX = (((janela * 7) % 5) - 2) * .04;
        const giroCab = cabeca.current; giroCab.y += (olharY - giroCab.y) * Math.min(1, d * 5); giroCab.x += (olharX - giroCab.x) * Math.min(1, d * 4);
        j('neck_01', giroCab.x * .4, giroCab.y * .35);
        j('head', resp * .02 * P.amp + giroCab.x * .6, giroCab.y * .65, P.tomba);
        maoSolta();
        // o gesto do ofício: cada um tem o seu laço, com pausas
        const tw = (import.meta.env.DEV && (window as unknown as { __npcT?: number }).__npcT != null) ? (window as unknown as { __npcT: number }).__npcT : t;
        const id = ficha.id as string;
        // sem o martelo (a busca dele), o Brokk não martela o ar: fica de braços
        // cruzados, emburrado; o martelo na mão só aparece quando volta
        if (id === 'brokk') { const mt = martelo.current ??= modelo.getObjectByName('martelo-do-brokk') ?? null; if (mt) mt.visible = oficio.brokkComMartelo; }
        if (id === 'brokk' && !oficio.brokkComMartelo) {
            j('upperarm_l', -.35, 0, baixaE + .55); j('upperarm_r', -.35, 0, baixaD - .55);
            j('lowerarm_l', -1.9, .4); j('lowerarm_r', -1.9, -.4);
        } else if (id === 'brokk') {
            // martela no ritmo: ergue devagar, desce de golpe, quica; a cada 6ª
            // pancada para e enxuga a testa
            const per = 1.5, k = Math.floor(tw / per), u = (tw % per) / per;
            const pausa = k % 6 === 5;
            // ergue devagar (0 a .55), segura, desce de golpe (.6 a .66) e ENCOSTA na
            // mesa em u = .66; recua um palmo (rebote) e volta a repousar
            const ergue = pausa ? 0 : suave(u, 0, .55) * (1 - suave(u, .6, .66));
            const rebote = pausa ? 0 : jan(u, .66, .7, .72, .84);
            const golpe = pausa ? 0 : jan(u, .6, .66, .7, .9);
            const testa = pausa ? jan(u, .1, .3, .7, .9) : 0;
            forja.ferreiro = true;
            const BK = (import.meta.env.DEV && (window as unknown as { __BROKK?: typeof BROKK }).__BROKK) || BROKK;
            if (!pausa && u >= .66 && u < .9 && ultimoGolpe.current !== k) { ultimoGolpe.current = k; forja.pedido++; }
            const alto = ergue + rebote * .22;
            j('upperarm_r', BK.braco - alto * 1.5 - testa * .5, 0, baixaD - .2 - Math.sqrt(Math.max(0, alto)) * .8 - testa * .1);
            j('lowerarm_r', BK.cotovelo - alto * .7 - testa * 1.3);
            j('hand_r', BK.pulso + golpe * .2 - alto * .3 - Math.sqrt(Math.max(0, alto)) * .9);
            j('upperarm_l', -.95, 0, baixaE - .05); j('lowerarm_l', -.9);
            j('spine_01', P.incl + .1 + golpe * .1 - ergue * .1, 0, 0);
            j('pelvis', golpe * .03, peso * .04, peso * .05);
            j('thigh_l', -golpe * .1, 0, P.abre); j('thigh_r', -golpe * .1, 0, -P.abre);
            j('calf_l', .04 + golpe * .2); j('calf_r', .04 + golpe * .2);
            j('neck_01', .05 + golpe * .05, giroCab.y * .1); j('head', .18 + golpe * .06 - testa * .1, giroCab.y * .3);
        } else if (id === 'halvard') {
            // o pescador de nuvem: vara na frente, olha a linha; de tempos em
            // tempos o peixe fisga — puxão para trás e molinete
            const u = (tw % 9) / 9;
            const puxa = jan(u, .62, .66, .7, .78), roda = jan(u, .74, .8, .92, .97);
            const p = Math.sin(tw * .8) * .06;
            const H = { ...HALVARD, ...((import.meta.env.DEV && (window as unknown as { __HAL?: Partial<typeof HALVARD> }).__HAL) || {}) };
            j('upperarm_r', H.urx - puxa * .35 + p, 0, baixaD + H.urz); j('lowerarm_r', H.lrx - puxa * .3 + Math.sin(tw * 8) * .22 * roda);
            j('hand_r', Math.sin(tw * 8) * .3 * roda);
            j('upperarm_l', H.ulx - puxa * .3 + p, 0, baixaE + H.ulz); j('lowerarm_l', H.llx - puxa * .2);
            j('spine_01', P.incl - puxa * .18, 0, 0);
            j('head', .1 - puxa * .25 + roda * .08, giroCab.y * .3, P.tomba);
        } else if (id === 'ulfgar') {
            // escaldo: dedilha a lira por uns segundos (batendo o pé), depois
            // conta a história gesticulando
            const u = (tw % 12) / 12, toca = jan(u, 0, .05, .58, .64);
            const dedilha = Math.sin(tw * 7.5) * toca;
            j('upperarm_l', -.7, 0, baixaE - .05); j('lowerarm_l', -1.45 - toca * .1);
            j('upperarm_r', -.4 - toca * .35 + (1 - toca) * Math.sin(tw * 1.3) * .15, 0, baixaD + .05 - toca * .05);
            j('lowerarm_r', -1.0 - toca * .5 + dedilha * .22 + (1 - toca) * Math.sin(tw * 1.3 + .6) * .3);
            j('hand_r', dedilha * .5);
            j('spine_01', P.incl, 0, Math.sin(tw * 2.5) * .04 * toca);
            j('foot_r', Math.max(0, Math.sin(tw * 3.75)) * .3 * toca);
            j('head', Math.sin(tw * 2.5) * .05 * toca + resp * .02, giroCab.y * .65 * (1 - toca), P.tomba + Math.sin(tw * 2.5) * .06 * toca);
        } else if (id === 'sigrun') {
            // pastora: apoiada no cajado, de vez em quando faz sombra com a
            // mão e vasculha o pasto atrás das ovelhas
            const u = (tw % 13) / 13, olha = jan(u, .55, .62, .78, .86);
            const vento = Math.sin(tw * .7) * .04;
            j('upperarm_r', -.3 + vento, 0, baixaD - .05); j('lowerarm_r', -.75);
            j('upperarm_l', -.1 - olha * 1.5, 0, baixaE - .02 * (1 - olha) - olha * .1); j('lowerarm_l', -.4 - olha * 1.3);
            j('hand_l', olha * .2);
            j('neck_01', giroCab.x * .4, giroCab.y * .35 + Math.sin(tw * .9) * .5 * olha);
            j('head', -olha * .08, giroCab.y * .65 + Math.sin(tw * .9) * .8 * olha, P.tomba);
        } else if (id === 'ragnhild') {
            // feirante: cesto no braço, mexe nas frutas, ergue uma para ver
            const u = (tw % 10) / 10, ve = jan(u, .1, .2, .3, .38), ergue = jan(u, .3, .4, .62, .72);
            j('upperarm_l', -.15, 0, baixaE - .05); j('lowerarm_l', -1.3);
            j('upperarm_r', -.1 - ve * .45 - ergue * .5, 0, baixaD + ve * .1 + ergue * .05);
            j('lowerarm_r', -.4 - ve * .8 - ergue * 1.0);
            j('hand_r', ve * .3 + ergue * .5);
            j('head', .04 + ve * .16 + ergue * .05, giroCab.y * .65 * (1 - ve), P.tomba);
        } else if (id === 'torvald') {
            // capitão: mão esquerda atrás das costas; de tempos em tempos
            // ergue a luneta, varre o horizonte devagar e a baixa
            const u = (tw % 15) / 15, sobe = jan(u, .25, .33, .62, .7);
            const varre = Math.sin((u - .3) * Math.PI * 2 * 1.6) * sobe;
            j('upperarm_l', .38, 0, baixaE + .12); j('lowerarm_l', -.95);
            j('upperarm_r', -.15 - sobe * .85, 0, baixaD + .02 + sobe * .12); j('lowerarm_r', -.45 - sobe * 1.25);
            j('hand_r', sobe * .3);
            j('spine_02', .02, varre * .18, 0);
            j('neck_01', -sobe * .04, varre * .1 + giroCab.y * .35 * (1 - sobe));
            j('head', -sobe * .1 + resp * .02, varre * .25 + giroCab.y * .65 * (1 - sobe), P.tomba);
        } else if (id === 'astrid') {
            // guarda: escudo no braço, mão no quadril; vigia, erguendo o
            // escudo e virando o rosto para o lado
            const u = (tw % 11) / 11, vigia = jan(u, .45, .53, .75, .83);
            j('upperarm_l', -.45 - vigia * .45, 0, baixaE - .05); j('lowerarm_l', -1.45 - vigia * .25);
            j('upperarm_r', .1, 0, baixaD - .5); j('lowerarm_r', -1.35);
            j('spine_02', .02, -vigia * .2, 0);
            j('head', resp * .02, giroCab.y * .65 * (1 - vigia) - vigia * .55, P.tomba);
        } else {
            // cada um com o seu jeito de esperar
            const b = Math.sin(t * 1.7 + x) * .04;
            switch (JEITO[id] ?? 'solto') {
                case 'cruzados':
                    j('clavicle_l', 0, 0, .08); j('clavicle_r', 0, 0, -.08);
                    j('upperarm_l', -.7 + b, .25, baixaE + .1); j('lowerarm_l', -1.7);
                    j('upperarm_r', -.65 - b, -.25, baixaD - .1); j('lowerarm_r', -1.75);
                    J.hand_l?.girar(0, .2, 0); J.hand_r?.girar(0, -.2, 0);
                    break;
                case 'cintura':
                    j('upperarm_l', .1 + b, -.2, baixaE + .5); j('lowerarm_l', -1.35);
                    j('upperarm_r', -b * .5, 0, baixaD); j('lowerarm_r', -.55);
                    J.hand_l?.girar(-.3, .6, 0);
                    break;
                case 'costas':
                    j('upperarm_l', .38 + b, 0, baixaE + .12); j('lowerarm_l', -.95);
                    j('upperarm_r', .38 - b, 0, baixaD - .12); j('lowerarm_r', -.95);
                    j('spine_03', -.06 - respira * .018);
                    break;
                default:
                    // braços soltos, cotovelo levemente dobrado; acompanham o peso
                    j('upperarm_l', -.06 + b, 0, baixaE + peso * .02); j('upperarm_r', -.06 - b, 0, baixaD + peso * .02);
                    j('lowerarm_l', -.32 + Math.max(0, peso) * .08 - resp * .02); j('lowerarm_r', -.32 + Math.max(0, -peso) * .08 - resp * .02);
            }
        }
    });

    return <><group ref={raiz}>
        <primitive object={modelo} />
        {marca && !controle && <group ref={marcaRef} position={[0, MARCA_ALTURA, 0]} frustumCulled={false}>
            <sprite scale={[.55, .55, 1]} material={matMarca} renderOrder={20} />
        </group>}
        {!controle && <mesh position={[0, .02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={SOMBRA}><circleGeometry args={[.45, 20]} /></mesh>}
    </group>
        {/* a luz verde da possessão: só quem é possuído a carrega (luz apagada
            ainda pesa em todo shader da cena). Fica FORA do grupo do morador:
            ele some pela distância, e luz que some muda a contagem de luzes e
            recompila todos os shaders do jogo (uma travada a cada vez) */}
        {ficha.id === 'halvard' && !controle && <pointLight ref={luzVerde} color="#3dff8a" intensity={0} distance={3.5} />}
    </>;
};

/** O morador com o seu modelo; enquanto o GLB carrega, nada aparece. */
/** Estado do ofício visível (o Floor13 liga quando a busca é entregue). */
export const oficio = { brokkComMartelo: false };

export const Viking: React.FC<Props> = (p) => <Suspense fallback={null}><Morador {...p} /></Suspense>;

Object.values(MODELOS).forEach((u) => useGLTF.preload(u));
