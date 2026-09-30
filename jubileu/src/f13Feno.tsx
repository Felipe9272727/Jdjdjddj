/**
 * f13Feno.tsx — o monte de feno da carroça onde o avião cai.
 *
 * Era uma esfera amassada com `flatShading`: de perto (a câmera cai quase em
 * cima dele) virava um domo amarelo de facetas. Agora:
 *
 *  - o MONTE é uma esfera achatada de muitos segmentos, SOLDADA (sem costura de
 *    normais), com deslocamento suave em três escalas (lóbulos, ondulação,
 *    grão), cor de palha por vértice e um ladrilho de colmos finos com relevo;
 *  - os COLMOS SOLTOS são instâncias de um fio curvo: uns deitados no monte, uns
 *    espetados para fora (é o que quebra a silhueta lisa), uns caídos pela
 *    borda da carroça e uns espalhados pelo chão em volta;
 *  - `PalhasDoBaque` joga colmos para o alto no instante do impacto.
 *
 * Tudo vem de `semente()`: o monte sai igual em qualquer carregamento.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm3, semente, texPalha } from './f13CabineTex';

/** Semieixos do monte (m) e a altura do centro dele sobre o chão, no espaço da carroça. */
const ESCALA = new THREE.Vector3(1.32, .68, .9);
const CENTRO_Y = 1.1;

/** Ponto do monte (antes da escala) na direção unitária `d`: lóbulos, ondulação e grão. */
function formaDoMonte(d: THREE.Vector3, alvo = new THREE.Vector3()): THREE.Vector3 {
    const n1 = fbm3(d.x * 1.3 + 3, d.y * 1.3, d.z * 1.3, 3, 11);
    const n2 = fbm3(d.x * 4.2, d.y * 4.2 + 7, d.z * 4.2, 3, 29);
    const n3 = fbm3(d.x * 13, d.y * 13, d.z * 13 + 3, 2, 41);
    // o topo é mais cheio que as beiradas: o feno foi jogado com forcado
    const r = 1 + n1 * .12 + n2 * .05 + n3 * .014 + .05 * Math.max(0, d.y);
    return alvo.copy(d).multiplyScalar(r);
}

function geometriaDoMonte(): THREE.BufferGeometry {
    let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 120, 76);
    // solda a costura e os polos: o deslocamento só depende da posição, então
    // pontos iguais andam juntos e as normais saem contínuas
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-4);
    const p = g.getAttribute('position') as THREE.BufferAttribute, n = p.count;
    const cor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const d = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
        d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        formaDoMonte(d, q);
        // embaixo a carroça esconde; achata para o monte não furar a tábua
        if (q.y < -.3) q.y = -.3 + (q.y + .3) * .25;
        p.setXYZ(i, q.x, q.y, q.z);
        // palha clara no alto, mais escura e dourada nos vãos e perto da tábua
        const c1 = fbm3(d.x * 2.2 + 9, d.y * 2.2, d.z * 2.2, 3, 5), c2 = fbm3(d.x * 9, d.y * 9 + 2, d.z * 9, 2, 17);
        const alto = Math.max(0, Math.min(1, (q.y + .25) / 1.0));
        const k = .68 + .3 * alto + .1 * c1 + .05 * c2;
        cor[i * 3] = k * (1 + .03 * c1); cor[i * 3 + 1] = k * (1 - .015 * c2); cor[i * 3 + 2] = k * (1 - .1 * c1 - .05 * alto);
        // projeção planta (x,z) com um pouco de y: os colmos escorrem pela encosta
        uv[i * 2] = (q.x * ESCALA.x + q.y * .35) / 3.2 + .5; uv[i * 2 + 1] = (q.z * ESCALA.z - q.y * .35) / 3.2 + .5;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
}

/** Um colmo: fio fino de 1 m de comprimento, levemente curvado (o eixo é y; a curva vai para +x). */
function geometriaDoColmo(): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(1, 1, 1, 3, 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) + .5;                       // 0 na base, 1 na ponta
        const r = 1 - .55 * t * t;                      // afina para a ponta
        p.setXYZ(i, p.getX(i) * r + .16 * t * t, p.getY(i), p.getZ(i) * r);
    }
    g.computeVertexNormals();
    return g;
}

const PALETA = ['#ecd595', '#dfc47c', '#d2b468', '#c4a055', '#b58f45', '#f2e2ae', '#e0c887'];

interface Colmo { p: THREE.Vector3; dir: THREE.Vector3; comp: number; larg: number; cor: THREE.Color; giro: number }

/** Sorteia os colmos soltos: no monte, pendurados na borda e no chão. */
function sortearColmos(): Colmo[] {
    const rnd = semente(20260930), out: Colmo[] = [];
    const cor = () => new THREE.Color(PALETA[Math.floor(rnd() * PALETA.length)]).multiplyScalar(.9 + rnd() * .2);
    const d = new THREE.Vector3(), P = new THREE.Vector3(), N = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
    // no monte
    for (let i = 0; i < 1700; i++) {
        do { d.set(rnd() * 2 - 1, rnd() * 1.15 - .15, rnd() * 2 - 1); } while (d.lengthSq() > 1 || d.lengthSq() < .01);
        d.normalize();
        formaDoMonte(d, P); P.multiply(ESCALA); P.y += CENTRO_Y;
        N.set(d.x / ESCALA.x, d.y / ESCALA.y, d.z / ESCALA.z).normalize();
        T.crossVectors(N, Math.abs(N.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
        B.crossVectors(N, T);
        const az = rnd() * Math.PI * 2;
        const tang = T.clone().multiplyScalar(Math.cos(az)).addScaledVector(B, Math.sin(az));
        // a maioria deitada; uma parte espetada para fora
        const tilt = rnd() < .58 ? rnd() * .25 : .25 + rnd() * 1.0;
        const dir = tang.multiplyScalar(Math.cos(tilt)).addScaledVector(N, Math.sin(tilt)).normalize();
        out.push({ p: P.clone().addScaledVector(N, -.03), dir, comp: .22 + rnd() * .42, larg: .0042 + rnd() * .0035, cor: cor(), giro: rnd() * Math.PI * 2 });
    }
    // pendurados pela borda da carroça (o feno passa da tábua e escorre)
    for (let i = 0; i < 180; i++) {
        const lado = Math.floor(rnd() * 4), t = rnd() * 2 - 1;
        const fora = lado < 2 ? new THREE.Vector3(0, 0, lado ? 1 : -1) : new THREE.Vector3(lado === 2 ? -1 : 1, 0, 0);
        const p = lado < 2 ? new THREE.Vector3(t * 1.12, .84 + rnd() * .12, fora.z * .74) : new THREE.Vector3(fora.x * 1.14, .84 + rnd() * .12, t * .72);
        const dir = fora.clone().multiplyScalar(.25 + rnd() * .45).add(new THREE.Vector3((rnd() - .5) * .3, -(.55 + rnd() * .6), (rnd() - .5) * .3)).normalize();
        out.push({ p, dir, comp: .25 + rnd() * .4, larg: .0045 + rnd() * .003, cor: cor(), giro: rnd() * Math.PI * 2 });
    }
    // no chão, em volta
    for (let i = 0; i < 300; i++) {
        const a = rnd() * Math.PI * 2, r = 1.0 + Math.pow(rnd(), 1.4) * 2.4, az = rnd() * Math.PI * 2;
        out.push({ p: new THREE.Vector3(Math.cos(a) * r * 1.25, .02 + rnd() * .03, Math.sin(a) * r), dir: new THREE.Vector3(Math.cos(az), .05 + rnd() * .12, Math.sin(az)).normalize(), comp: .2 + rnd() * .32, larg: .0045 + rnd() * .003, cor: cor(), giro: rnd() * Math.PI * 2 });
    }
    return out;
}

const Y = new THREE.Vector3(0, 1, 0);

export const MonteDeFeno: React.FC = () => {
    const monte = useMemo(() => geometriaDoMonte(), []);
    const colmo = useMemo(() => geometriaDoColmo(), []);
    const palha = useMemo(() => texPalha(), []);
    const colmos = useMemo(() => sortearColmos(), []);
    const material = useMemo(() => {
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: .5, bumpScale: 2.6 });
        const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(1.15, 1.15); c.needsUpdate = true; return c; };
        m.map = rep(palha.map); m.bumpMap = rep(palha.bumpMap!);
        return m;
    }, [palha]);
    const fios = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, metalness: 0, envMapIntensity: .4 }), []);
    const inst = useRef<THREE.InstancedMesh>(null);
    useEffect(() => {
        const im = inst.current; if (!im) return;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qg = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3();
        colmos.forEach((c, i) => {
            q.setFromUnitVectors(Y, c.dir); qg.setFromAxisAngle(Y, c.giro); q.multiply(qg);
            pos.copy(c.p).addScaledVector(c.dir, c.comp * .5); esc.set(c.larg, c.comp, c.larg);
            m.compose(pos, q, esc); im.setMatrixAt(i, m); im.setColorAt(i, c.cor);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
    }, [colmos]);
    useEffect(() => () => { monte.dispose(); colmo.dispose(); material.dispose(); fios.dispose(); }, [monte, colmo, material, fios]);
    // `vivo`: o fundidor de malhas do mundo (f13Fundir) deixa este grupo em paz
    return <group userData={{ vivo: true }}>
        <mesh geometry={monte} material={material} position={[0, CENTRO_Y, 0]} scale={ESCALA} castShadow receiveShadow />
        <instancedMesh ref={inst} args={[colmo, fios, colmos.length]} receiveShadow />
    </group>;
};

// ═══ O FENO QUE VOA NO BAQUE ═════════════════════════════════════════════════
const N_VOO = 240;
/** Colmos jogados para o alto no impacto: função de t, com arrasto (a palha é leve) e queda lenta. */
export const PalhasDoBaque: React.FC<{ tRef: React.MutableRefObject<number>; origem?: [number, number, number] }> = ({ tRef, origem = [-2.0, 1.75, 33.2] }) => {
    const colmo = useMemo(() => geometriaDoColmo(), []);
    const fios = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, metalness: 0, envMapIntensity: .4 }), []);
    const inst = useRef<THREE.InstancedMesh>(null);
    const dados = useMemo(() => {
        const rnd = semente(777);
        return Array.from({ length: N_VOO }, () => {
            const a = rnd() * Math.PI * 2, h = Math.sqrt(rnd()), v = 1.2 + rnd() * 4.2;
            return {
                o: new THREE.Vector3((rnd() - .5) * 2.2, (rnd() - .3) * .5, (rnd() - .5) * 1.6),
                v: new THREE.Vector3(Math.cos(a) * h * v, 2.4 + rnd() * 5.2, Math.sin(a) * h * v),
                eixo: new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), w: (rnd() - .5) * 16, fase: rnd() * 6.28,
                comp: .2 + rnd() * .34, larg: .005 + rnd() * .004, vida: 1.6 + rnd() * 1.6, cor: new THREE.Color(PALETA[Math.floor(rnd() * PALETA.length)]).multiplyScalar(.9 + rnd() * .2),
            };
        });
    }, []);
    useEffect(() => {
        const im = inst.current; if (!im) return;
        dados.forEach((d, i) => im.setColorAt(i, d.cor));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }, [dados]);
    useEffect(() => () => { colmo.dispose(); fios.dispose(); }, [colmo, fios]);
    const m = useMemo(() => new THREE.Matrix4(), []), q = useMemo(() => new THREE.Quaternion(), []), qa = useMemo(() => new THREE.Quaternion(), []),
        pos = useMemo(() => new THREE.Vector3(), []), esc = useMemo(() => new THREE.Vector3(), []);
    useFrame(() => {
        const im = inst.current; if (!im) return;
        const pq = tRef.current - 10.45;
        im.visible = pq > 0 && pq < 3.4;
        if (!im.visible) return;
        const K = 1.15, G = 5.2;                      // arrasto e gravidade de palha
        dados.forEach((d, i) => {
            const f = (1 - Math.exp(-K * pq)) / K;
            pos.set(origem[0] + d.o.x + d.v.x * f, origem[1] + d.o.y + (d.v.y + G / K) * f - G * pq / K, origem[2] + d.o.z + d.v.z * f);
            q.setFromUnitVectors(Y, d.eixo); qa.setFromAxisAngle(d.eixo, d.fase + d.w * pq * Math.exp(-.35 * pq)); q.premultiply(qa);
            // some encolhendo no fim da vida; antes do impacto não existe
            const vivo = Math.max(0, Math.min(1, (d.vida - pq) / .5));
            esc.set(d.larg * vivo, d.comp * vivo, d.larg * vivo);
            m.compose(pos, q, esc); im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={inst} args={[colmo, fios, N_VOO]} frustumCulled={false} visible={false} />;
};
