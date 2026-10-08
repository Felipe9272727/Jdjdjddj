/** Vidraria do laboratório do Andar 14 — os mesmos perfis das cutscenes (tools/chegada14/final.py), sem o
 *  custo de transmissão de verdade: o vidro é uma casca dupla (parede de fora + de dentro = espessura), reflete
 *  um ambiente de estúdio (RoomEnvironment em PMREM, gerado uma vez) e fica mais opaco de raspão (Fresnel),
 *  como vidro real; a borda é um anel grosso; o líquido tem menisco subindo na parede. */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeElements } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Forma = 'bequer' | 'erlen' | 'balao' | 'tubo';
type P = [number, number][];   // (raio, altura)

export const PERFIS: Record<Forma, (h: number, R: number) => P> = {
    bequer: (h, R) => [[0, 0], [R * .9, 0], [R * .985, .006], [R, .02], [R, h]],
    erlen: (h, R) => [[0, 0], [R * .92, 0], [R, .012], [R * .97, h * .12], [R * .34, h * .74], [R * .3, h * .78], [R * .3, h]],
    balao: (h, R) => [[0, 0], ...[.35, .7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.7].map((a) => [R * Math.sin(a), R - R * Math.cos(a)] as [number, number]), [R * .28, R * 2 + .01], [R * .26, h]],
    tubo: (h, R) => [[0, 0], ...[.4, .8, 1.2, Math.PI / 2].map((a) => [R * Math.sin(a), R - R * Math.cos(a)] as [number, number]), [R, h]],
};

const raioEm = (p: P, z: number) => {
    for (let i = 0; i < p.length - 1; i++) {
        const [r0, z0] = p[i], [r1, z1] = p[i + 1];
        if (z0 <= z && z <= z1 && z1 > z0) return r0 + (r1 - r0) * (z - z0) / (z1 - z0);
    }
    return p[p.length - 1][0];
};
const torno = (p: P, seg = 28) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z)), seg);

let envCache: { tex: THREE.Texture; usos: number } | null = null;
/** O mapa de reflexo do vidro (um só para o laboratório inteiro). */
export function useAmbienteVidro() {
    const gl = useThree((s) => s.gl);
    const tex = useMemo(() => {
        if (!envCache) {
            const pm = new THREE.PMREMGenerator(gl), sala = new RoomEnvironment();
            envCache = { tex: pm.fromScene(sala, .04).texture, usos: 0 }; pm.dispose(); sala.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
        }
        envCache.usos++; return envCache.tex;
    }, [gl]);
    useEffect(() => () => { if (envCache && --envCache.usos <= 0) { envCache.tex.dispose(); envCache = null; } }, []);
    return tex;
}

function materialVidro(env: THREE.Texture, lado: THREE.Side) {
    const m = new THREE.MeshPhysicalMaterial({ color: '#f4f9ff', roughness: .03, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, ior: 1.5, specularIntensity: 1,
        envMap: env, envMapIntensity: 1.6, transparent: true, opacity: .1, depthWrite: false, side: lado });
    m.onBeforeCompile = (s) => {   // Fresnel: de frente quase invisível, de raspão (as bordas da silhueta) quase espelho
        s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
            'float e14fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);\ndiffuseColor.a = mix(diffuseColor.a, .85, e14fr);\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => 'e14vidro';
    return m;
}

/** Um frasco: casca dupla de vidro, borda grossa, e (opcional) líquido com menisco. Origem no fundo. */
export const Vidraria: React.FC<{ forma: Forma; h: number; R: number; cor?: string; nivel?: number; brilho?: number; env: THREE.Texture } & ThreeElements['group']> =
    ({ forma, h, R, cor, nivel = .5, brilho = .25, env, ...g }) => {
        const r = useMemo(() => {
            const p = PERFIS[forma](h, R), t = Math.max(.003, R * .06);
            const fora = torno(p), dentro = torno(p.map(([x, z]) => [Math.max(0, x - t), Math.max(z, t * (x < 1e-4 ? 1 : 0))] as [number, number]));
            const rTopo = p[p.length - 1][0];
            const borda = new THREE.TorusGeometry(rTopo - t / 2, t * .75, 8, 28); borda.rotateX(Math.PI / 2); borda.translate(0, h, 0);
            let liq: THREE.BufferGeometry | null = null;
            if (cor) {
                const zl = h * nivel, zs = [...new Set([t, ...p.map(([, z]) => z).filter((z) => z > t && z < zl)])].sort((a, b) => a - b);
                const rl = Math.max(.001, raioEm(p, zl) - t - .0008);
                const q: P = [[0, t], ...zs.map((z) => [Math.max(.001, raioEm(p, z) - t - .0008), z] as [number, number]), [rl, zl + .004], [rl * .93, zl + .0005], [rl * .6, zl], [0, zl]];
                liq = torno(q);
            }
            const mf = materialVidro(env, THREE.FrontSide), md = materialVidro(env, THREE.BackSide);
            const ml = cor ? new THREE.MeshPhysicalMaterial({ color: cor, emissive: cor, emissiveIntensity: brilho, roughness: .1, clearcoat: .6, envMap: env, envMapIntensity: .35, transparent: true, opacity: .9 }) : null;
            return { fora, dentro, borda, liq, mf, md, ml };
        }, [forma, h, R, cor, nivel, brilho, env]);
        useEffect(() => () => { for (const x of [r.fora, r.dentro, r.borda, r.liq, r.mf, r.md, r.ml]) x?.dispose(); }, [r]);
        return <group {...g}>
            {r.liq && r.ml && <mesh geometry={r.liq} material={r.ml} renderOrder={1} />}
            <mesh geometry={r.dentro} material={r.md} renderOrder={2} />
            <mesh geometry={r.fora} material={r.mf} renderOrder={3} />
            <mesh geometry={r.borda} material={r.mf} renderOrder={3} />
        </group>;
    };
