/**
 * floor4-pixels.ts — shared pixel-art helpers for the 100%-2D Floor 4. Draw onto
 * a small canvas and get a crisp (NearestFilter) CanvasTexture — no external assets,
 * so everything renders offline in the dev workbench too.
 */
import * as THREE from 'three';

/** Build a CanvasTexture of pixel art. `draw` paints on a w×h grid; NearestFilter
 *  keeps it crisp/pixelated at any scale. */
export function pixelTex(
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    return t;
}

/** Fill one pixel rect. */
export const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
};
