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
    const geos = useMemo(() => [
        new THREE.DodecahedronGeometry(.35, 0),
        // touceira: nove lâminas finas e curvas saindo de um ponto, em leque
        // (era um cone de quatro faces: lia como um marcador verde no chão)
        (() => {
            const partes: THREE.BufferGeometry[] = [];
            for (let i = 0; i < 9; i++) {
                const g = new THREE.PlaneGeometry(.035, .5, 1, 4); g.translate(0, .25, 0);
                const gp = g.getAttribute('position');
                for (let v = 0; v < gp.count; v++) { const y = gp.getY(v); gp.setX(v, gp.getX(v) * (1 - y * 1.6)); gp.setZ(v, y * y * .5); }
                g.rotateX(-.15 - (i % 3) * .12); g.rotateY(i / 9 * Math.PI * 2 + (i % 2) * .3); g.scale(1, .7 + (i % 4) * .15, 1);
                partes.push(g.toNonIndexed());
            }
            const m = mergeGeometries(partes)!; m.deleteAttribute('uv'); m.computeVertexNormals(); return m;
        })(),
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
        // flor de verdade: haste, cinco pétalas e o miolo (cores por vértice)
        (() => {
            const cor = (g: THREE.BufferGeometry, c: string) => { const k = new THREE.Color(c), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
            const partes = [cor(new THREE.CylinderGeometry(.008, .01, .26, 5).translate(0, .13, 0), '#4f7a36')];
            for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; partes.push(cor(new THREE.SphereGeometry(.03, 6, 4).scale(1.3, .35, .8).translate(Math.cos(a) * .035, .265, Math.sin(a) * .035), '#c9a0d8')); }
            partes.push(cor(new THREE.SphereGeometry(.018, 6, 4).translate(0, .275, 0), '#f0c840'));
            return mergeGeometries(partes.map((g) => g.index ? g.toNonIndexed() : g))!;
        })(),
    ], []);
    const mats = useMemo(() => [
        new THREE.MeshStandardMaterial({ color: '#a89c8c', ...pbr('rocha', .5, .5) }),
        new THREE.MeshStandardMaterial({ color: P13.gramaEsc, side: THREE.DoubleSide, roughness: .8 }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 }),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }),
    ], []);
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const porTipo = useMemo(() => [0, 1, 2, 3].map((t) => itens.filter((i) => i.tipo === t)), [itens]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        porTipo.forEach((lista, tipo) => {
            const m = refs.current[tipo]; if (!m) return;
            // só os tufos balançam: o resto é posto uma vez
            if (tipo !== 1 && m.userData.posto) return;
            m.userData.posto = true;
            lista.forEach((it, i) => {
                tmp.position.set(it.x, it.y, it.z);
                tmp.rotation.set(tipo === 1 ? Math.sin(t * 2 + it.r) * .15 : 0, it.r, tipo === 1 ? Math.cos(t * 1.7 + it.r) * .12 : 0);
                tmp.scale.setScalar(it.s);
                tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
            });
            m.instanceMatrix.needsUpdate = true;
        });
    });
    return <>{porTipo.map((lista, tipo) => (
        <instancedMesh key={tipo} ref={(m) => { refs.current[tipo] = m; }} args={[geos[tipo], mats[tipo], lista.length]} frustumCulled={false} />
    ))}</>;
};

/** Asa de gaivota: trapézio afinando na ponta, cotovelo dobrado, ponta escura. */
