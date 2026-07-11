import * as THREE from 'three';

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

/** Shared, texture-free materials: cheap to inline and deliberately matte on mobile. */
export function createFloor7V2Materials(): Floor7V2Materials {
    if (cache) return cache;
    const wood = (color: string, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    cache = {
        hull: wood('#4a2115', 0.9),
        darkWood: wood('#26130f', 0.96),
        deck: wood('#805334', 0.88),
        trim: wood('#a97542', 0.72),
        brass: new THREE.MeshStandardMaterial({ color: '#c58a32', roughness: 0.34, metalness: 0.72 }),
        iron: new THREE.MeshStandardMaterial({ color: '#20262a', roughness: 0.55, metalness: 0.75 }),
        sail: new THREE.MeshStandardMaterial({ color: '#7f3a36', roughness: 0.94, side: THREE.DoubleSide }),
        sailDark: new THREE.MeshStandardMaterial({ color: '#4f2628', roughness: 0.98, side: THREE.DoubleSide }),
        rope: wood('#5e4027', 1),
        glass: new THREE.MeshPhysicalMaterial({ color: '#74aeb2', roughness: 0.2, metalness: 0.05, transmission: 0.18, transparent: true, opacity: 0.82 }),
        skin: wood('#c68b67', 0.9),
        sleeve: wood('#18374c', 0.86),
        bristle: wood('#ded7bc', 1),
        water: new THREE.MeshPhysicalMaterial({ color: '#77b8ca', roughness: 0.18, metalness: 0, transparent: true, opacity: 0.88 }),
    };
    return cache;
}

export function disposeFloor7V2Materials(): void {
    if (!cache) return;
    Object.values(cache).forEach((m) => m.dispose());
    cache = undefined;
}
