import * as THREE from 'three';
import deckWoodUrl from '../assets/floor7v2/deck-wood.webp';
import forgedIronUrl from '../assets/floor7v2/forged-iron.webp';
import hempRopeUrl from '../assets/floor7v2/hemp-rope.webp';
import hullWoodUrl from '../assets/floor7v2/hull-wood.webp';
import sailclothUrl from '../assets/floor7v2/sailcloth.webp';
import skinUrl from '../assets/floor7v2/skin.webp';
import sleeveClothUrl from '../assets/floor7v2/sleeve-cloth.webp';

export interface Floor7V2Materials {
    hull: THREE.MeshStandardMaterial;
    darkWood: THREE.MeshStandardMaterial;
    deck: THREE.MeshStandardMaterial;
    trim: THREE.MeshStandardMaterial;
    brass: THREE.MeshStandardMaterial;
    iron: THREE.MeshStandardMaterial;
    sail: THREE.MeshStandardMaterial;
    sailDark: THREE.MeshStandardMaterial;
    rope: THREE.MeshStandardMaterial;
    glass: THREE.MeshPhysicalMaterial;
    skin: THREE.MeshStandardMaterial;
    sleeve: THREE.MeshStandardMaterial;
    bristle: THREE.MeshStandardMaterial;
    water: THREE.MeshPhysicalMaterial;
}

let cache: Floor7V2Materials | undefined;
let texturePool: THREE.Texture[] = [];
const sourceCache = new Map<string, THREE.Texture>();

type Repeat = readonly [number, number];

function getSource(url: string): THREE.Texture {
    const existing = sourceCache.get(url);
    if (existing) return existing;
    const source = new THREE.TextureLoader().load(url);
    source.colorSpace = THREE.SRGBColorSpace;
    sourceCache.set(url, source);
    texturePool.push(source);
    return source;
}

function loadSurface(url: string, repeat: Repeat): { map: THREE.Texture; bumpMap: THREE.Texture } {
    // Clones share one decoded Source per URL while retaining independent UV
    // transforms for hull, mast, trim and viewmodel usage.
    const map = getSource(url).clone();
    map.name = `floor7-v2-albedo:${url.slice(-28)}`;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat[0], repeat[1]);
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.anisotropy = 4;

    // Reuse the decoded pixels as a subtle height map. The clone shares the
    // image source, so this adds surface response without another downloaded
    // asset or a second base64 payload in the standalone build.
    const bumpMap = map.clone();
    bumpMap.name = `floor7-v2-height:${url.slice(-28)}`;
    bumpMap.colorSpace = THREE.NoColorSpace;
    bumpMap.needsUpdate = true;
    texturePool.push(map, bumpMap);
    return { map, bumpMap };
}

function texturedWood(url: string, repeat: Repeat, color: string, roughness: number, bumpScale: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        ...loadSurface(url, repeat), color, roughness, metalness: 0, bumpScale,
    });
}

/** Shared mobile materials backed by compact GPT-Image-authored WebP maps. */
export function createFloor7V2Materials(): Floor7V2Materials {
    if (cache) return cache;
    const hull = loadSurface(hullWoodUrl, [1, 1]);
    const iron = loadSurface(forgedIronUrl, [2, 2]);
    const sail = loadSurface(sailclothUrl, [1, 1]);

    cache = {
        hull: new THREE.MeshStandardMaterial({ ...hull, color: '#d8c3b8', roughness: 0.88, metalness: 0, bumpScale: 0.026 }),
        darkWood: texturedWood(hullWoodUrl, [1, 3], '#806b60', 0.93, 0.018),
        deck: texturedWood(deckWoodUrl, [1, 1], '#d9c5a8', 0.86, 0.022),
        trim: texturedWood(deckWoodUrl, [1, 2], '#c49b6a', 0.72, 0.014),
        brass: new THREE.MeshStandardMaterial({ color: '#d4a445', roughness: 0.34, metalness: 0.76, bumpMap: iron.bumpMap, bumpScale: 0.012 }),
        iron: new THREE.MeshStandardMaterial({ ...iron, color: '#a9afb2', roughness: 0.53, metalness: 0.72, bumpScale: 0.018 }),
        sail: new THREE.MeshStandardMaterial({ ...sail, color: '#c8b0ad', roughness: 0.92, metalness: 0, bumpScale: 0.016, side: THREE.DoubleSide }),
        sailDark: texturedWood(sailclothUrl, [1, 1], '#765357', 0.96, 0.013),
        rope: texturedWood(hempRopeUrl, [2, 5], '#b49970', 0.97, 0.021),
        glass: new THREE.MeshPhysicalMaterial({ color: '#74aeb2', roughness: 0.16, metalness: 0.05, transmission: 0.2, transparent: true, opacity: 0.84 }),
        skin: texturedWood(skinUrl, [2, 2], '#d5c0b4', 0.84, 0.005),
        sleeve: texturedWood(sleeveClothUrl, [2, 3], '#a7b0bf', 0.91, 0.012),
        bristle: new THREE.MeshStandardMaterial({ color: '#ded7bc', roughness: 1, metalness: 0 }),
        water: new THREE.MeshPhysicalMaterial({ color: '#77b8ca', roughness: 0.18, metalness: 0, transparent: true, opacity: 0.88 }),
    };
    cache.sailDark.side = THREE.DoubleSide;
    return cache;
}

export function disposeFloor7V2Materials(): void {
    if (!cache) return;
    Object.values(cache).forEach((m) => m.dispose());
    texturePool.forEach((t) => t.dispose());
    texturePool = [];
    sourceCache.clear();
    cache = undefined;
}
