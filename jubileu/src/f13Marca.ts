import * as THREE from 'three';

/** Distância (m) até onde a marca fica cheia; some por completo 8 m depois. */
export const MARCA_CHEIA = 25;
export const MARCA_ALTURA = 2.1;
export const fadeDaMarca = (d: number) => Math.max(0, Math.min(1, (MARCA_CHEIA + 8 - d) / 8));

const cache = new Map<string, THREE.CanvasTexture>();
/** Um "!" (ou "?") negrito num medalhão de pergaminho com borda dourada. */
export function texturaDaMarca(simbolo: string): THREE.CanvasTexture {
    const k = simbolo === '!' ? '!' : '?';
    let t = cache.get(k); if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 58, 6, 64, 64, 58);
    grad.addColorStop(0, '#f6e7c1'); grad.addColorStop(1, '#d6b779');
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = grad; g.fill();
    g.lineWidth = 7; g.strokeStyle = k === '!' ? '#b8841c' : '#4f6f9c'; g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#5a3a1a'; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.stroke();
    g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,240,200,.9)'; g.strokeText(k, 64, 70);
    g.fillStyle = k === '!' ? '#7a2f1f' : '#2c4670'; g.fillText(k, 64, 70);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    cache.set(k, t); return t;
}

export function materialDaMarca(simbolo: string): THREE.SpriteMaterial {
    return new THREE.SpriteMaterial({ map: texturaDaMarca(simbolo), transparent: true, depthWrite: false, toneMapped: false, fog: false });
}
