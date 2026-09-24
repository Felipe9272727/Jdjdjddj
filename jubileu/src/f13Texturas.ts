/**
 * f13Texturas.ts — texturas PBR de verdade para Vindhjem.
 *
 * Todas vêm do Poly Haven (CC0, domínio público): leafy_grass, rock_face_03,
 * brown_planks_05, oak_wood_planks e moss_wood, reduzidas para caber no
 * index.html único.
 */
import * as THREE from 'three';
import gramaD from './assets/f13/leafy_grass_Diffuse.jpg';
import gramaN from './assets/f13/leafy_grass_nor_gl.jpg';
import gramaR from './assets/f13/leafy_grass_Rough.jpg';
import rochaD from './assets/f13/rock_face_03_Diffuse.jpg';
import rochaN from './assets/f13/rock_face_03_nor_gl.jpg';
import rochaR from './assets/f13/rock_face_03_Rough.jpg';
import tabuaD from './assets/f13/brown_planks_05_Diffuse.jpg';
import tabuaN from './assets/f13/brown_planks_05_nor_gl.jpg';
import tabuaR from './assets/f13/brown_planks_05_Rough.jpg';
import carvalhoD from './assets/f13/oak_wood_planks_Diffuse.jpg';
import carvalhoN from './assets/f13/oak_wood_planks_nor_gl.jpg';
import carvalhoR from './assets/f13/oak_wood_planks_Rough.jpg';
import musgoD from './assets/f13/moss_wood_Diffuse.jpg';
import musgoN from './assets/f13/moss_wood_nor_gl.jpg';
import musgoR from './assets/f13/moss_wood_Rough.jpg';

const FONTES = {
    grama: [gramaD, gramaN, gramaR],
    rocha: [rochaD, rochaN, rochaR],
    tabua: [tabuaD, tabuaN, tabuaR],
    carvalho: [carvalhoD, carvalhoN, carvalhoR],
    musgo: [musgoD, musgoN, musgoR],
} as const;
export type Superficie = keyof typeof FONTES;

const carregador = new THREE.TextureLoader();
const base = new Map<string, THREE.Texture>();
function textura(url: string, cor: boolean): THREE.Texture {
    let t = base.get(url);
    if (!t) {
        t = carregador.load(url);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (cor) t.colorSpace = THREE.SRGBColorSpace;
        base.set(url, t);
    }
    return t;
}

export interface JogoPbr { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }
const jogos = new Map<string, JogoPbr>();
/** Mapas cor/normal/rugosidade de uma superfície, repetidos `rx`×`ry` vezes. */
export function pbr(s: Superficie, rx = 1, ry = rx): JogoPbr {
    const chave = `${s}:${rx}:${ry}`;
    let j = jogos.get(chave);
    if (!j) {
        const [d, n, r] = FONTES[s];
        const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
        j = { map: rep(textura(d, true)), normalMap: rep(textura(n, false)), roughnessMap: rep(textura(r, false)) };
        jogos.set(chave, j);
    }
    return j;
}

