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
import { useGLTF } from '@react-three/drei';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import type { FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import ulfgar from './assets/f13/povo/ulfgar.glb';
import brokk from './assets/f13/povo/brokk.glb';
import torvald from './assets/f13/povo/torvald.glb';
import halvard from './assets/f13/povo/halvard.glb';
import ragnhild from './assets/f13/povo/ragnhild.glb';
import sigrun from './assets/f13/povo/sigrun.glb';
import astrid from './assets/f13/povo/astrid.glb';
import eira from './assets/f13/povo/eira.glb';
import hospede from './assets/f13/povo/hospede.glb';

const MODELOS: Record<string, string> = { ulfgar, brokk, torvald, halvard, ragnhild, sigrun, astrid, eira, hospede };
/** Os modelos saem do Blender com ~1,8 m; o mundo foi medido para ~2 m. */
const ESCALA = 1.1;

/** Como cada um fica parado quando não trabalha nem fala. */
const JEITO: Readonly<Record<string, 'cruzados' | 'cintura' | 'costas' | 'solto'>> = {
    sigrun: 'costas', torvald: 'costas',
};
const _mundo = new THREE.Vector3();
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
        this.osso.quaternion.copy(this.repouso).multiply(this.inv.clone().multiply(this.q).multiply(this.noModelo));
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
                    name: orig.name, map: orig.map, color: '#e4c3b0', roughness: .55, metalness: 0,
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
            if (me.name.startsWith('olhos') || n.includes('eye')) olhos = mat;
            // cabelo, barba, sobrancelhas e cílios do MakeHuman são cartões
            // com alfa: recorte e duas faces. O resto (pele inclusive) é
            // opaco e de uma face só — senão o avesso da cabeça aparece
            if (/^(cabelo|barba|bigode|sobrancelhas|cilios)/.test(me.name)) {
                mat.alphaTest = .4; mat.transparent = false; mat.side = THREE.DoubleSide; mat.depthWrite = true;
                // a textura da barba tem pixels cor de pele pintados entre os
                // fios: liam como lascas cor de carne no pescoço. Tingida de
                // castanho, a franja vira sombra de pelo; sem o brilho da pele.
                if (/^(barba|bigode)/.test(me.name)) { mat.color.set('#8a7462'); mat.roughness = .85; }
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
    const luzVerde = useRef<THREE.PointLight>(null);
    const giro = useRef(0);
    const quadro = useRef(0);
    const ultimo = useRef({ x: x + (ronda ?? 0), z });
    const queda = useRef(0);
    const cabeca = useRef({ x: 0, y: 0 });
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
            // a marca é para achar quem tem conversa de longe; de perto some
            const d = g.position.distanceTo(camera.position);
            marcaRef.current.visible = d > 5;
            marcaRef.current.scale.setScalar(Math.min(1, .5 + d / 30));
            marcaRef.current.position.y = 2.45 + Math.sin(t * 2.5) * .08; marcaRef.current.rotation.y = t * 1.5;
        }
        if (luzVerde.current) luzVerde.current.intensity = e.possessao > 0 ? 1.6 + Math.sin(t * 9) * .7 : 0;
        if (olhos) {
            olhos.emissive.setRGB(e.possessao > 0 ? .3 : 0, e.possessao > 0 ? 2.6 : 0, e.possessao > 0 ? 1 : 0);
        }
        // ── onde está e para onde olha ──────────────────────────────────
        let px = x, pz = z, andando = false, direcao = giro.current;
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
        if (e.olharPara && !e.caido) { tmp.set(e.olharPara.x - px, 0, e.olharPara.z - pz); direcao = Math.atan2(tmp.x, tmp.z); }
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
        _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_pv);
        _esfera.center.set(g.position.x, g.position.y + escala * .9, g.position.z); _esfera.radius = escala * 1.3;
        g.visible = !!sentado || !!semRecorte || (dist < DIST_MAX && (dist < 4 || _frustum.intersectsSphere(_esfera)));
        if (!g.visible) return;
        const perto = dist < DIST_DETALHE;
        for (const m of detalhes) m.visible = perto;
        // sombra de gente só de perto: de longe ninguém lê a silhueta no chão
        // (e cada malha com pele entrava de novo na passada de sombra)
        const sombraPerto = dist < 16;
        for (const m of sombreiam) m.castShadow = sombraPerto;
        if (dist > 28 && !ctl && (++quadro.current & 3)) return;

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
        j('spine_02', .02 + respira * .012, 0, tique_);
        j('spine_03', -.02 - respira * .018);
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
        j('spine_01', 0, 0, -peso * .03);
        j('thigh_l', 0, 0, .03 + Math.max(0, peso) * .04); j('thigh_r', 0, 0, -.03 + Math.min(0, peso) * .04);
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
        j('head', respira * .02 + giroCab.x * .6, giroCab.y * .65);
        maoSolta();
        // o gesto do ofício
        if (ficha.id === 'brokk') {
            const m = Math.abs(Math.sin(t * 3));
            j('upperarm_r', -2.2 + m * 1.6, 0, baixaD - .2); j('lowerarm_r', -.5 - (1 - m) * .6);
            j('upperarm_l', -.5, 0, baixaE + .2); j('lowerarm_l', -1.1);
        } else if (ficha.id === 'halvard') {
            // o pescador de nuvem puxa a linha, devagar
            const p = Math.sin(t * .8) * .15;
            // braços à frente do peito e cotovelos dobrados (o ombro aberto
            // de lado lia como pose em T de longe)
            j('upperarm_l', -.75 + p, 0, baixaE + .06); j('lowerarm_l', -1.05 - p * .5);
            j('upperarm_r', -.7 + p, 0, baixaD - .06); j('lowerarm_r', -1.1 - p * .5);
        } else if (ficha.id === 'ulfgar') {
            // gesticula contando histórias: o antebraço sobe e desce, o ombro fica baixo
            j('upperarm_r', -.35 + Math.sin(t * 1.3) * .15, 0, baixaD - .04); j('lowerarm_r', -1.1 + Math.sin(t * 1.3 + .6) * .3);
            j('upperarm_l', .05, 0, baixaE); j('lowerarm_l', -.2);
        } else {
            // cada um com o seu jeito de esperar
            const b = Math.sin(t * 1.7 + x) * .04;
            switch (JEITO[ficha.id as string] ?? 'solto') {
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
                    // antebraço quase no repouso do rig: a mão pende ao lado da coxa
                    j('upperarm_l', b, 0, baixaE); j('upperarm_r', -b, 0, baixaD);
                    j('lowerarm_l', -.6 + Math.max(0, peso) * .08); j('lowerarm_r', -.6 + Math.max(0, -peso) * .08);
            }
        }
    });

    return <group ref={raiz}>
        <primitive object={modelo} />
        {marca && !controle && <group ref={marcaRef} position={[0, 2.45, 0]}>
            <mesh><octahedronGeometry args={[.09, 0]} /><meshBasicMaterial color={marca === '!' ? new THREE.Color('#ffc34a').multiplyScalar(2) : new THREE.Color('#cfe3ff').multiplyScalar(1.6)} toneMapped={false} /></mesh>
        </group>}
        {!controle && <mesh position={[0, .02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={SOMBRA}><circleGeometry args={[.45, 20]} /></mesh>}
        {/* a luz verde da possessão: só quem é possuído a carrega (luz apagada
            ainda pesa em todo shader da cena) */}
        {ficha.id === 'halvard' && !controle && <pointLight ref={luzVerde} position={[0, 1.75, .9]} color="#3dff8a" intensity={0} distance={3.5} />}
    </group>;
};

/** O morador com o seu modelo; enquanto o GLB carrega, nada aparece. */
export const Viking: React.FC<Props> = (p) => <Suspense fallback={null}><Morador {...p} /></Suspense>;

Object.values(MODELOS).forEach((u) => useGLTF.preload(u));
