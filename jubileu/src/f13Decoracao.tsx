/** Decoração das ilhas (pedras soltas, tufos, barris, flores). Separada do Floor13Mundo para o co-builder. */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ILHAS, dentroDeCasa } from './f13Mundo';
import { pbr } from './f13Texturas';
import { P13, distTrilha } from './Floor13Mundo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Vida entre os pontos de interesse: pedras, tufos de grama que balançam no
 * vento, barris e flores, espalhados perto da borda de cada ilha (o miolo fica
 * livre para caminhar). Tudo instanciado: quatro chamadas de desenho.
 *
 * Grama e flores foram refeitas: em vez de polígonos chapados e fora de escala,
 * cada tufo é um leque aberto de lâminas finas e curvas (fitas que afinam na
 * ponta), com normais suaves (nada de flatShading) e cor por vértice — raiz
 * escura, ponta clara — mais um leve tom de verde por instância. As posições, o
 * vento e os outros itens (pedras, barris) continuam como estavam.
 */

/** Ruído estável a partir do `r` que a instância já tem: varia o tom sem mexer no sorteio do espalhamento. */
function ruido(n: number, sal: number): number {
    const x = Math.sin(n * 12.9898 + sal * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * Lâmina de grama: fita fina, vergando em curva e afinando até quase zero na
 * ponta. Fica indexada de propósito — assim as normais correm suaves ao longo da
 * curva, sem as facetas chapadas do low-poly antigo — e leva cor por vértice, da
 * raiz escura à ponta clara.
 */
function lamina(alt: number, larg: number, verga: number, raiz: THREE.Color, ponta: THREE.Color, seg = 5): THREE.BufferGeometry {
    const pos = new Float32Array((seg + 1) * 6);
    const nor = new Float32Array((seg + 1) * 6);
    const cor = new Float32Array((seg + 1) * 6);
    const idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const y = alt * t, z = verga * t * t;            // a lâmina só verga no alto
        const meia = larg * .5 * (1 - t * .88);          // afina até a ponta
        const dz = 2 * verga * t / Math.max(alt, 1e-4);  // dz/dy: inclinação da curva
        const nz = 1 / Math.sqrt(1 + dz * dz);
        c.copy(raiz).lerp(ponta, Math.pow(t, .7));       // cor por vértice
        for (let k = 0; k < 2; k++) {
            const o = (i * 2 + k) * 3;
            pos[o] = k ? meia : -meia; pos[o + 1] = y; pos[o + 2] = z;
            nor[o] = 0; nor[o + 1] = -dz * nz; nor[o + 2] = nz;
            cor[o] = c.r; cor[o + 1] = c.g; cor[o + 2] = c.b;
        }
        if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    g.setIndex(idx);
    return g;
}

/** Tufo: quinze lâminas finas abertas em leque, na altura de um punho de mão (≈0,30 a 0,47 m). */
function tufo(raiz: THREE.Color, ponta: THREE.Color): THREE.BufferGeometry {
    const partes: THREE.BufferGeometry[] = [];
    const N = 15, BASE = .38;
    for (let i = 0; i < N; i++) {
        const giro = i / N * Math.PI * 2 + (i % 3) * .23;
        const abre = .16 + (i % 4) * .24 + (i % 2) * .1;   // de quase ereta a bem deitada: leque aberto
        const alt = BASE * (.78 + (i % 5) * .075);         // 0,30 a 0,42 m na escala 1
        const larg = .011 + (i % 3) * .0045;               // fitas finas
        const g = lamina(alt, larg, alt * (.16 + (i % 3) * .12), raiz, ponta);
        g.rotateX(abre);                                   // tomba do centro para fora
        g.rotateY(giro);                                   // gira em volta do tufo
        g.translate(-Math.sin(giro) * .014, 0, -Math.cos(giro) * .014); // pé com um tico de folga
        partes.push(g);
    }
    return mergeGeometries(partes)!;
}

/** Moitinha florida: haste com duas folhas, cinco pétalas pequenas, miolo e três lâminas de grama no pé. */
function flor(raiz: THREE.Color, ponta: THREE.Color): THREE.BufferGeometry {
    const pinta = (g: THREE.BufferGeometry, hex: string) => {
        const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
        g.deleteAttribute('uv');
        return g;
    };
    const partes: THREE.BufferGeometry[] = [];
    // haste: escura na raiz, clara no alto (cor por vértice)
    const haste = new THREE.CylinderGeometry(.007, .012, .3, 5, 2).translate(0, .15, 0);
    {
        const p = haste.getAttribute('position'), a = new Float32Array(p.count * 3), c = new THREE.Color();
        const clara = new THREE.Color('#8fae55');
        for (let i = 0; i < p.count; i++) {
            c.copy(raiz).lerp(clara, Math.min(1, p.getY(i) / .3));
            a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
        }
        haste.setAttribute('color', new THREE.BufferAttribute(a, 3));
        haste.deleteAttribute('uv');
    }
    partes.push(haste);
    // duas folhinhas saindo da haste
    for (let i = 0; i < 2; i++) {
        partes.push(lamina(.11, .012, .03, raiz, ponta, 3).rotateZ(i ? .9 : -.9).rotateY(i * 2.1).translate(0, .09 + i * .05, 0));
    }
    // cinco pétalas pequenas em volta do miolo
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        partes.push(pinta(new THREE.SphereGeometry(.026, 6, 4).scale(1.25, .3, .75)
            .translate(Math.cos(a) * .032, .3, Math.sin(a) * .032), i % 2 ? '#c9a0d8' : '#dcb4e2'));
    }
    partes.push(pinta(new THREE.SphereGeometry(.016, 6, 4).translate(0, .305, 0), '#f2cc48'));
    // moitinha: três lâminas curtas em volta do pé da flor
    for (let i = 0; i < 3; i++) {
        const giro = i / 3 * Math.PI * 2 + .5;
        partes.push(lamina(.17, .013, .05, raiz, ponta, 4).rotateX(.35 + i * .14).rotateY(giro));
    }
    return mergeGeometries(partes)!;
}

/**
 * Vida entre os pontos de interesse: pedras, tufos de grama que balançam no
 * vento, barris e flores, espalhados perto da borda de cada ilha (o miolo fica
 * livre para caminhar). Tudo instanciado: quatro chamadas de desenho.
 */
export const Decoracao: React.FC = () => {
    const itens = useMemo(() => {
        let k = 11;
        const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
        const l: { tipo: number; x: number; y: number; z: number; s: number; r: number }[] = [];
        for (const il of ILHAS) {
            const n = Math.round(il.r * 5);
            for (let i = 0; i < n; i++) {
                const a = rnd() * Math.PI * 2, d = il.r * (.72 + rnd() * .24);
                if (dentroDeCasa(il.x + Math.cos(a) * d, il.z + Math.sin(a) * d, .6) || distTrilha(il.x + Math.cos(a) * d, il.z + Math.sin(a) * d) < 1.1) continue;
                l.push({ tipo: i % 7 === 0 ? 2 : i % 3 === 0 ? 0 : i % 5 === 0 ? 3 : 1, x: il.x + Math.cos(a) * d, y: il.y, z: il.z + Math.sin(a) * d, s: .6 + rnd() * .8, r: rnd() * 6 });
            }
        }
        return l;
    }, []);
    const geos = useMemo(() => {
        // verde do capim: raiz escura e ponta clara, tirados do verde do chão
        // (aqui, no runtime, longe da ordem de importação com o mundo)
        const raiz = new THREE.Color(P13.gramaEsc).multiplyScalar(.5);
        const ponta = new THREE.Color(P13.gramaEsc).lerp(new THREE.Color('#e6eaa8'), .62);
        return [
            new THREE.DodecahedronGeometry(.35, 0),
            tufo(raiz, ponta),
            // barril de aduelas: bojudo no meio, com dois aros escuros (cor por vértice)
            (() => {
                const pts: THREE.Vector2[] = [];
                for (let i = 0; i <= 12; i++) { const y = i / 12; pts.push(new THREE.Vector2(.24 + Math.sin(y * Math.PI) * .05, y * .62)); }
                const g = new THREE.LatheGeometry(pts, 16);
                const gp = g.getAttribute('position'), cor = new Float32Array(gp.count * 3);
                const madeira = new THREE.Color('#9a7048'), aro = new THREE.Color('#2e2a26');
                for (let v = 0; v < gp.count; v++) {
                    const y = gp.getY(v) / .62, a = Math.atan2(gp.getZ(v), gp.getX(v));
                    const c = Math.abs(y - .18) < .04 || Math.abs(y - .82) < .04 ? aro : madeira;
                    const veio = .85 + .15 * Math.abs(Math.sin(a * 8));
                    cor.set([c.r * veio, c.g * veio, c.b * veio], v * 3);
                }
                g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
                const tampa = new THREE.CircleGeometry(.24, 16).rotateX(-Math.PI / 2).translate(0, .6, 0);
                const tc = new Float32Array(tampa.getAttribute('position').count * 3).map((_, i) => [.45, .32, .2][i % 3]);
                tampa.setAttribute('color', new THREE.BufferAttribute(tc, 3));
                const m = mergeGeometries([g.toNonIndexed(), tampa.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }))!;
                m.computeVertexNormals(); return m;
            })(),
            flor(raiz, ponta),
        ];
    }, []);
    const mats = useMemo(() => [
        new THREE.MeshStandardMaterial({ color: '#a89c8c', ...pbr('rocha', .5, .5) }),
        // grama: normais suaves (flatShading desligado) e o verde vindo do vértice
        new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .85, flatShading: false }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }),
    ], []);
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const corTmp = useMemo(() => new THREE.Color(), []);
    const porTipo = useMemo(() => [0, 1, 2, 3].map((t) => itens.filter((i) => i.tipo === t)), [itens]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        for (let tipo = 0; tipo < 4; tipo++) {
            const m = refs.current[tipo]; if (!m) continue;
            const lista = porTipo[tipo];
            // tom por instância: calculado uma vez, nunca a cada quadro
            if (!m.userData.tom) {
                m.userData.tom = true;
                if (tipo === 1 || tipo === 3) {
                    for (let i = 0; i < lista.length; i++) {
                        const it = lista[i];
                        if (tipo === 1) {
                            // leve variação de verde: o miolo do tom vem do `r` da instância
                            const v = .80 + .32 * ruido(it.r, 1);
                            corTmp.setRGB(v * (.86 + .10 * ruido(it.r, 2)), v * (1 + .05 * ruido(it.r, 3)), v * (.76 + .12 * ruido(it.r, 4)));
                        } else {
                            corTmp.setRGB(.92 + .18 * ruido(it.r, 5), .90 + .18 * ruido(it.r, 6), .95 + .22 * ruido(it.r, 7));
                        }
                        m.setColorAt(i, corTmp);
                    }
                    if (m.instanceColor) m.instanceColor.needsUpdate = true;
                }
            }
            // só os tufos balançam: o resto é posto uma vez
            if (tipo !== 1 && m.userData.posto) continue;
            m.userData.posto = true;
            for (let i = 0; i < lista.length; i++) {
                const it = lista[i];
                // tufo: a escala da instância entra atenuada, mantendo o tufo entre ≈0,30 e 0,47 m
                const esc = tipo === 1 ? .52 + it.s * .45 : it.s;
                tmp.position.set(it.x, it.y, it.z);
                tmp.rotation.set(tipo === 1 ? Math.sin(t * 2 + it.r) * .15 : 0, it.r, tipo === 1 ? Math.cos(t * 1.7 + it.r) * .12 : 0);
                tmp.scale.setScalar(esc);
                tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
            }
            m.instanceMatrix.needsUpdate = true;
        }
    });
    return <>{porTipo.map((lista, tipo) => (
        <instancedMesh key={tipo} ref={(m) => { refs.current[tipo] = m; }} args={[geos[tipo], mats[tipo], lista.length]} frustumCulled={false} />
    ))}</>;
};
