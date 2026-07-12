/**
 * Floor6Textures.ts — the material library of the Suíte 612.
 *
 * Everything is PAINTED, 512px canvas textures with matching BUMP and
 * ROUGHNESS maps so light actually grips the surfaces: wallpaper stripes
 * with ridges, grout sunk below the tile, carpet pile noise, brushed steel
 * with dents. Combined with the scene's PMREM room environment this is what
 * pulls the suite out of flat-shaded PS2 land.
 *
 * All textures are built ONCE at module scope and shared.
 */
import * as THREE from 'three';
import carpetDiffUrl from './assets/f6/carpet-diff.jpg';
import carpetNorUrl from './assets/f6/carpet-nor.jpg';
import carpetRoughUrl from './assets/f6/carpet-rough.jpg';
import wallpaperDiffUrl from './assets/f6/wallpaper-diff.jpg';
import wallpaperNorUrl from './assets/f6/wallpaper-nor.jpg';
import wallpaperRoughUrl from './assets/f6/wallpaper-rough.jpg';
import tileDiffUrl from './assets/f6/tile-diff.jpg';
import tileNorUrl from './assets/f6/tile-nor.jpg';
import tileRoughUrl from './assets/f6/tile-rough.jpg';
import linoDiffUrl from './assets/f6/lino-diff.jpg';
import linoNorUrl from './assets/f6/lino-nor.jpg';
import linoRoughUrl from './assets/f6/lino-rough.jpg';
import woodDiffUrl from './assets/f6/wood-diff.jpg';
import woodNorUrl from './assets/f6/wood-nor.jpg';
import woodRoughUrl from './assets/f6/wood-rough.jpg';
import metalDiffUrl from './assets/f6/metal-diff.jpg';
import metalNorUrl from './assets/f6/metal-nor.jpg';
import metalRoughUrl from './assets/f6/metal-rough.jpg';
import leatherDiffUrl from './assets/f6/leather-diff.jpg';
import leatherNorUrl from './assets/f6/leather-nor.jpg';
import leatherRoughUrl from './assets/f6/leather-rough.jpg';

// ── REAL photo PBR maps (PolyHaven CC0, 1k, bundled as data-URIs) ────────────
const texLoader = new THREE.TextureLoader();
function photoTex(url: string, srgb: boolean, rx = 1, ry = 1): THREE.Texture {
    const t = texLoader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
}
/** diff+normal+rough triple with one repeat. */
function pbrMaps(diff: string, nor: string, rough: string, rx: number, ry: number) {
    return {
        map: photoTex(diff, true, rx, ry),
        normalMap: photoTex(nor, false, rx, ry),
        roughnessMap: photoTex(rough, false, rx, ry),
    };
}
export const PBR = {
    carpet: (rx = 4.75, ry = 8.5) => pbrMaps(carpetDiffUrl, carpetNorUrl, carpetRoughUrl, rx, ry),
    wallpaper: (rx = 1, ry = 1) => pbrMaps(wallpaperDiffUrl, wallpaperNorUrl, wallpaperRoughUrl, rx, ry),
    tile: (rx = 1, ry = 1) => pbrMaps(tileDiffUrl, tileNorUrl, tileRoughUrl, rx, ry),
    lino: (rx = 3, ry = 6.7) => pbrMaps(linoDiffUrl, linoNorUrl, linoRoughUrl, rx, ry),
    wood: (rx = 1.4, ry = 1) => pbrMaps(woodDiffUrl, woodNorUrl, woodRoughUrl, rx, ry),
    metal: (rx = 1.4, ry = 1.2) => pbrMaps(metalDiffUrl, metalNorUrl, metalRoughUrl, rx, ry),
    leather: (rx = 1.7, ry = 1.7) => pbrMaps(leatherDiffUrl, leatherNorUrl, leatherRoughUrl, rx, ry),
};
export { default as hdrUrl } from './assets/f6/hotel_room_1k.hdr';

/** Vertical AO strip (dark at ceiling line and baseboard) for wall faces —
 *  photo textures tile in Y, so the grounding shadow lives in this aoMap. */
export const wallAoTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.18, '#ffffff');
    g.addColorStop(0.8, '#ffffff'); g.addColorStop(1, '#787878');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
})();

// ── helpers ───────────────────────────────────────────────────────────────────
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function makeCanvas(w: number, h: number, draw: Draw): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    return c;
}

export function colorTex(w: number, h: number, draw: Draw, rx = 1, ry = 1): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(makeCanvas(w, h, draw));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
}

/** Linear-space data texture (bump / roughness). */
export function dataTex(w: number, h: number, draw: Draw, rx = 1, ry = 1): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(makeCanvas(w, h, draw));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
}

/** Deterministic PRNG so the grime never reshuffles between sessions. */
export const rng = (seed: number) => {
    let v = seed;
    return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
};

// ── WALLPAPER — faded art-deco stripes, stained, AO baked top & bottom ───────
const drawWallpaper: Draw = (ctx, W, H) => {
    const r = rng(7);
    ctx.fillStyle = '#988a72'; ctx.fillRect(0, 0, W, H);
    // stripe pairs: broad warm band + thin olive pinstripes
    for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = '#a2937a'; ctx.fillRect(x, 0, 34, H);
        ctx.fillStyle = '#8d8069'; ctx.fillRect(x + 40, 0, 5, H);
        ctx.fillStyle = '#8d8069'; ctx.fillRect(x + 52, 0, 5, H);
    }
    // damask diamonds riding the broad bands
    ctx.strokeStyle = 'rgba(122,108,84,0.5)'; ctx.lineWidth = 1.6;
    for (let x = 17; x < W; x += 64) {
        for (let y = 24; y < H; y += 56) {
            ctx.beginPath();
            ctx.moveTo(x, y - 11); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y);
            ctx.closePath(); ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.stroke();
        }
    }
    // mottled age — large soft blotches + fine speckle
    for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(58,46,32,${0.02 + r() * 0.05})`;
        ctx.beginPath(); ctx.arc(r() * W, r() * H, 8 + r() * 46, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(40,32,22,${r() * 0.1})`;
        ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
    }
    // one long drip stain
    const dx = W * 0.62;
    const g2 = ctx.createLinearGradient(dx, 0, dx, H * 0.7);
    g2.addColorStop(0, 'rgba(70,54,34,0.22)'); g2.addColorStop(1, 'rgba(70,54,34,0)');
    ctx.fillStyle = g2; ctx.fillRect(dx - 9, 0, 18, H * 0.7);
    // AO: ceiling shadow + heavier baseboard grime
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.30)'); g.addColorStop(0.16, 'rgba(0,0,0,0)');
    g.addColorStop(0.80, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
};
const drawWallpaperBump: Draw = (ctx, W, H) => {
    const r = rng(8);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = '#8c8c8c'; ctx.fillRect(x, 0, 34, H);            // broad band raised
        ctx.fillStyle = '#6e6e6e'; ctx.fillRect(x + 40, 0, 5, H);        // pinstripes recessed
        ctx.fillStyle = '#6e6e6e'; ctx.fillRect(x + 52, 0, 5, H);
    }
    for (let i = 0; i < 900; i++) {                                      // paper tooth
        const v = 110 + r() * 40;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
    }
};
export const wallpaperTex = colorTex(512, 512, drawWallpaper, 1, 1);
export const wallpaperBump = dataTex(512, 512, drawWallpaperBump, 1, 1);

// ── CARPET — oxblood medallion pattern, crushed pile, fiber noise ────────────
const drawCarpet: Draw = (ctx, W, H) => {
    const r = rng(3);
    ctx.fillStyle = '#56423a'; ctx.fillRect(0, 0, W, H);
    const cell = 128;
    for (let cy = 0; cy < H; cy += cell) {
        for (let cx = 0; cx < W; cx += cell) {
            const x = cx + cell / 2, y = cy + cell / 2;
            // border frame
            ctx.strokeStyle = 'rgba(118,38,34,0.65)'; ctx.lineWidth = 5;
            ctx.strokeRect(cx + 14, cy + 14, cell - 28, cell - 28);
            ctx.strokeStyle = 'rgba(160,128,84,0.35)'; ctx.lineWidth = 2;
            ctx.strokeRect(cx + 24, cy + 24, cell - 48, cell - 48);
            // medallion
            ctx.strokeStyle = 'rgba(118,38,34,0.6)'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, y - 26); ctx.lineTo(x + 26, y); ctx.lineTo(x, y + 26); ctx.lineTo(x - 26, y);
            ctx.closePath(); ctx.stroke();
            ctx.strokeStyle = 'rgba(160,128,84,0.45)';
            ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
            // per-cell crush/shade variation
            ctx.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`;
            ctx.fillRect(cx, cy, cell, cell);
        }
    }
    // fiber noise — lots of it, both lit and shadowed strands
    for (let i = 0; i < 2600; i++) {
        const a = r();
        ctx.fillStyle = a > 0.5
            ? `rgba(232,210,184,${(a - 0.5) * 0.10})`
            : `rgba(16,10,8,${a * 0.12})`;
        ctx.fillRect(r() * W, r() * H, 2, 1 + r() * 2);
    }
};
const drawCarpetBump: Draw = (ctx, W, H) => {
    const r = rng(4);
    ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5200; i++) {
        const v = 80 + r() * 90;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(r() * W, r() * H, 2, 2);
    }
};
export const carpetTex = colorTex(512, 512, drawCarpet, 4.75, 8.5);
export const carpetBump = dataTex(256, 256, drawCarpetBump, 9.5, 17);

// ── BATHROOM TILE — 32cm porcelain, sunk dark grout, two cracked tiles ───────
const TILE_N = 4; // tiles per 512px edge
const drawTile: Draw = (ctx, W, H) => {
    const r = rng(11);
    const ts = W / TILE_N;
    ctx.fillStyle = '#6b675e'; ctx.fillRect(0, 0, W, H);   // grout
    for (let y = 0; y < TILE_N; y++) {
        for (let x = 0; x < TILE_N; x++) {
            const px = x * ts + 2, py = y * ts + 2, s = ts - 4;
            const sh = 198 + r() * 26;
            // subtle vertical sheen gradient per tile
            const g = ctx.createLinearGradient(px, py, px, py + s);
            g.addColorStop(0, `rgb(${sh + 8},${sh + 12},${sh + 9})`);
            g.addColorStop(1, `rgb(${sh - 10},${sh - 6},${sh - 8})`);
            ctx.fillStyle = g;
            ctx.fillRect(px, py, s, s);
            // grime creeping up from the grout line
            ctx.fillStyle = `rgba(82,70,52,${0.08 + r() * 0.14})`;
            ctx.fillRect(px, py + s - 16, s, 16);
            ctx.fillStyle = `rgba(82,70,52,${r() * 0.08})`;
            ctx.fillRect(px, py, s, 8);
        }
    }
    // two hairline cracks
    ctx.strokeStyle = 'rgba(70,64,56,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ts * 1.2, ts * 0.18);
    ctx.lineTo(ts * 1.55, ts * 0.55); ctx.lineTo(ts * 1.42, ts * 0.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ts * 3.1, ts * 3.2);
    ctx.lineTo(ts * 3.5, ts * 3.5); ctx.lineTo(ts * 3.35, ts * 3.9); ctx.stroke();
};
const drawTileBump: Draw = (ctx, W) => {
    const ts = W / TILE_N;
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(0, 0, W, W);   // grout sunk
    for (let y = 0; y < TILE_N; y++) {
        for (let x = 0; x < TILE_N; x++) {
            const px = x * ts + 2, py = y * ts + 2, s = ts - 4;
            // raised tile with beveled edge
            const g = ctx.createRadialGradient(px + s / 2, py + s / 2, s * 0.2, px + s / 2, py + s / 2, s * 0.72);
            g.addColorStop(0, '#cfcfcf'); g.addColorStop(0.85, '#c8c8c8'); g.addColorStop(1, '#9a9a9a');
            ctx.fillStyle = g;
            ctx.fillRect(px, py, s, s);
        }
    }
};
const drawTileRough: Draw = (ctx, W) => {
    const ts = W / TILE_N;
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, W, W);   // grout = rough
    const r = rng(13);
    for (let y = 0; y < TILE_N; y++) {
        for (let x = 0; x < TILE_N; x++) {
            const px = x * ts + 2, py = y * ts + 2, s = ts - 4;
            ctx.fillStyle = '#3c3c3c';                      // glazed tile = glossy
            ctx.fillRect(px, py, s, s);
            ctx.fillStyle = `rgba(190,190,190,${0.25 + r() * 0.3})`;   // worn grime = duller
            ctx.fillRect(px, py + s - 16, s, 16);
        }
    }
};
export const tileTex = colorTex(512, 512, drawTile, 3.5, 5.5);
export const tileBump = dataTex(512, 512, drawTileBump, 3.5, 5.5);
export const tileRough = dataTex(256, 256, drawTileRough, 3.5, 5.5);

// ── KITCHEN VINYL — checker, scuffed through in places ───────────────────────
const drawVinyl: Draw = (ctx, W, H) => {
    const r = rng(17);
    const s = W / 4;
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            ctx.fillStyle = (x + y) % 2 ? '#766f60' : '#a59c8c';
            ctx.fillRect(x * s, y * s, s, s);
            // tile speckle
            for (let i = 0; i < 26; i++) {
                ctx.fillStyle = `rgba(${(x + y) % 2 ? '200,190,170' : '60,52,40'},${r() * 0.16})`;
                ctx.fillRect(x * s + r() * s, y * s + r() * s, 2, 2);
            }
        }
    }
    // seam lines
    ctx.fillStyle = 'rgba(30,24,18,0.45)';
    for (let i = 0; i <= 4; i++) { ctx.fillRect(0, i * s - 1, W, 2); ctx.fillRect(i * s - 1, 0, 2, H); }
    // scuffs
    for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(48,40,30,${0.1 + r() * 0.15})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        const x0 = r() * W, y0 = r() * H;
        ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 30 - r() * 60, y0 + 20, x0 + 60 - r() * 120, y0 + 8 - r() * 16);
        ctx.stroke();
    }
};
export const vinylTex = colorTex(512, 512, drawVinyl, 2, 4.5);

// ── FURNITURE WOOD — warm walnut with knots ──────────────────────────────────
const drawWood: Draw = (ctx, W, H) => {
    const r = rng(19);
    ctx.fillStyle = '#4d3523'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 42; i++) {
        ctx.strokeStyle = `rgba(${24 + r() * 30},${14 + r() * 16},${6 + r() * 10},${0.25 + r() * 0.3})`;
        ctx.lineWidth = 1 + r() * 3;
        ctx.beginPath();
        const y0 = r() * H;
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(W * 0.3, y0 + 18 - r() * 36, W * 0.7, y0 + 18 - r() * 36, W, y0 + 8 - r() * 16);
        ctx.stroke();
    }
    // knots
    for (let i = 0; i < 3; i++) {
        const x = r() * W, y = r() * H;
        for (let k = 5; k > 0; k--) {
            ctx.strokeStyle = `rgba(22,12,6,${0.18 + k * 0.05})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.ellipse(x, y, k * 4.5, k * 2.6, 0.3, 0, Math.PI * 2); ctx.stroke();
        }
    }
    // varnish sheen band
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,226,170,0.05)'); g.addColorStop(0.5, 'rgba(255,226,170,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
};
export const woodTex = colorTex(256, 256, drawWood);

// ── CEILING — off-white, stained rings near the wet corner ───────────────────
const drawCeil: Draw = (ctx, W, H) => {
    const r = rng(23);
    ctx.fillStyle = '#b2aa9d'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2400; i++) {                                    // stipple
        const v = r();
        ctx.fillStyle = v > 0.5 ? `rgba(255,250,240,${(v - 0.5) * 0.08})` : `rgba(60,52,40,${v * 0.07})`;
        ctx.fillRect(r() * W, r() * H, 2, 2);
    }
    // water infiltration stains — tide marks: one wobbly outline reused at
    // 3 scales (filled washes, NOT stroked rings), darkest at the rim like
    // real dried seepage. Nothing circular enough to read as a drawing.
    for (let i = 0; i < 3; i++) {
        const cx = W * (0.55 + r() * 0.4), cy = H * (0.1 + r() * 0.5);
        const mainRad = 22 + r() * 18;
        // one irregular contour, sampled once, reused scaled
        const wob: number[] = [];
        const N = 26;
        for (let k = 0; k < N; k++) wob.push(0.62 + r() * 0.55);
        // smooth the wobble so the edge meanders instead of jittering
        const sm = wob.map((_, k) => (wob[(k + N - 1) % N] + wob[k] * 2 + wob[(k + 1) % N]) / 4);
        const trace = (scale: number, ox: number, oy: number) => {
            ctx.beginPath();
            for (let k = 0; k <= N; k++) {
                const a = (k % N) / N * Math.PI * 2;
                const rad = mainRad * sm[k % N] * scale;
                const px = cx + ox + Math.cos(a) * rad * 1.15;
                const py = cy + oy + Math.sin(a) * rad * 0.85;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        };
        // outer halo wash (palest, widest)
        ctx.fillStyle = 'rgba(168,132,66,0.10)';
        trace(1.0, 0, 0); ctx.fill();
        // mid wash, slightly offset (water crept unevenly)
        ctx.fillStyle = 'rgba(158,118,52,0.14)';
        trace(0.72, 2 - r() * 4, 2 - r() * 4); ctx.fill();
        // core, brownest
        ctx.fillStyle = 'rgba(138,98,44,0.20)';
        trace(0.42, 3 - r() * 6, 3 - r() * 6); ctx.fill();
        // dark dried rim only on the OUTER contour, broken into arcs
        ctx.strokeStyle = 'rgba(120,86,40,0.16)';
        ctx.lineWidth = 1.6;
        for (let seg = 0; seg < 5; seg++) {
            if (r() < 0.3) continue;                     // gaps in the rim
            ctx.beginPath();
            const a0 = (seg / 5) * Math.PI * 2 + r() * 0.3;
            for (let s = 0; s <= 8; s++) {
                const a = a0 + (s / 8) * (Math.PI * 2 / 5) * 0.8;
                const k = Math.floor((a / (Math.PI * 2)) * N) % N;
                const rad = mainRad * sm[(k + N) % N];
                const px = cx + Math.cos(a) * rad * 1.15;
                const py = cy + Math.sin(a) * rad * 0.85;
                if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
    }
};
export const ceilTex = colorTex(512, 512, drawCeil, 3.5, 4.2);

// ── DEAD-CAB STEEL — brushed, dented, scorched near the panel ────────────────
const drawSteel: Draw = (ctx, W, H) => {
    const r = rng(31);
    ctx.fillStyle = '#5e6166'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 240; i++) {                                     // brush strokes
        const v = 84 + r() * 36;
        ctx.strokeStyle = `rgba(${v},${v + 3},${v + 6},0.35)`;
        ctx.lineWidth = 1;
        const y = r() * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 4 - r() * 8); ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {                                      // scuffs & dents
        ctx.fillStyle = `rgba(20,20,24,${0.06 + r() * 0.12})`;
        ctx.beginPath(); ctx.ellipse(r() * W, r() * H, 6 + r() * 30, 3 + r() * 10, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 12; i++) {                                      // bright scratches
        ctx.strokeStyle = `rgba(210,214,220,${0.12 + r() * 0.2})`;
        ctx.lineWidth = 1;
        const x0 = r() * W, y0 = r() * H;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 40 - r() * 80, y0 + 30 - r() * 60); ctx.stroke();
    }
};
const drawSteelBump: Draw = (ctx, W, H) => {
    const r = rng(32);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 20; i++) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
        const x = r() * W, y = r() * H;
        ctx.save(); ctx.translate(x, y);
        g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#808080');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 10 + r() * 26, 6 + r() * 12, r() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
};
export const steelTex = colorTex(512, 512, drawSteel);
export const steelBump = dataTex(256, 256, drawSteelBump);

// ── DEAD-CAB FLOOR — the cream diamond floor, wrecked ────────────────────────
const drawCabFloor: Draw = (ctx, W, H) => {
    const r = rng(37);
    ctx.fillStyle = '#ded6c8'; ctx.fillRect(0, 0, W, H);
    // the diamond inlay
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = '#b89a4e'; ctx.lineWidth = 10;
    ctx.strokeRect(-W * 0.26, -H * 0.26, W * 0.52, H * 0.52);
    ctx.fillStyle = '#c9a85c';
    ctx.fillRect(-W * 0.06, -H * 0.06, W * 0.12, H * 0.12);
    ctx.restore();
    // scuff trails toward the door
    for (let i = 0; i < 36; i++) {
        ctx.strokeStyle = `rgba(40,34,28,${0.06 + r() * 0.14})`;
        ctx.lineWidth = 1 + r() * 3;
        const x0 = W * (0.3 + r() * 0.4);
        ctx.beginPath(); ctx.moveTo(x0, H * r());
        ctx.quadraticCurveTo(x0 + 20 - r() * 40, H * r(), x0 + 14 - r() * 28, H); ctx.stroke();
    }
    // dust & debris speckle
    for (let i = 0; i < 700; i++) {
        ctx.fillStyle = `rgba(70,60,48,${r() * 0.2})`;
        ctx.fillRect(r() * W, r() * H, 2, 2);
    }
    // big scorch by one corner
    const g = ctx.createRadialGradient(W * 0.82, H * 0.2, 4, W * 0.82, H * 0.2, W * 0.3);
    g.addColorStop(0, 'rgba(26,20,16,0.55)'); g.addColorStop(1, 'rgba(26,20,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
};
export const cabFloorTex = colorTex(512, 512, drawCabFloor);

// ── decals ────────────────────────────────────────────────────────────────────
/** The guest's hand-drawn 20-floor truth map (pantry wall). */
export const truthTex = colorTex(512, 640, (ctx) => {
    const r = rng(41);
    ctx.fillStyle = '#d6cab0'; ctx.fillRect(0, 0, 512, 640);
    // paper grain + creases
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(120,100,70,${r() * 0.07})`;
        ctx.fillRect(r() * 512, r() * 640, 2, 2);
    }
    for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = 'rgba(110,92,64,0.25)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(r() * 512, 0); ctx.lineTo(r() * 512, 640); ctx.stroke();
    }
    ctx.strokeStyle = '#6a5c44'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 624);
    // the 20 floors
    ctx.textAlign = 'center';
    for (let i = 0; i < 20; i++) {
        const f = 20 - i, y = 46 + i * 29;
        ctx.strokeStyle = '#564834'; ctx.lineWidth = 2;
        ctx.strokeRect(120, y - 18, 272, 24);
        ctx.font = f === 20 ? 'bold 19px monospace' : 'bold 15px monospace';
        ctx.fillStyle = f === 20 ? '#7a1d14' : '#393124';
        ctx.fillText(f === 20 ? 'ELE MORA NO ULTIMO' : (f >= 7 ? `${f} — ?` : `${f}`), 256, y);
        if (f === 20) {   // the tear-through scratch
            ctx.strokeStyle = '#7a1d14'; ctx.lineWidth = 3;
            for (let k = 0; k < 3; k++) {
                ctx.beginPath(); ctx.moveTo(126, y - 14 + k * 8); ctx.lineTo(386, y - 10 + k * 8); ctx.stroke();
            }
        }
    }
    // polaroids on floors 1..5
    const pol = ['#3a5a40', '#16323e', '#b08c30', '#4a3424', '#365a8c'];
    pol.forEach((c, i) => {
        const y = 46 + (19 - i) * 29 - 12;
        ctx.save();
        ctx.translate(70, y); ctx.rotate(-0.12 + r() * 0.24);
        ctx.fillStyle = '#e8e2d2'; ctx.fillRect(-20, -22, 40, 46);
        ctx.fillStyle = c; ctx.fillRect(-16, -18, 32, 30);
        ctx.restore();
    });
    // red string between pins
    ctx.strokeStyle = 'rgba(168,28,22,0.9)'; ctx.lineWidth = 2.4;
    const pins: Array<[number, number]> = [[70, 600], [392, 46], [120, 75], [392, 568], [70, 320]];
    for (let i = 0; i < pins.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(pins[i][0], pins[i][1]);
        const mx = (pins[i][0] + pins[i + 1][0]) / 2;
        ctx.quadraticCurveTo(mx, (pins[i][1] + pins[i + 1][1]) / 2 + 14, pins[i + 1][0], pins[i + 1][1]);
        ctx.stroke();
    }
    pins.forEach(([x, y]) => {
        ctx.fillStyle = '#8a2018'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.6, 0, Math.PI * 2); ctx.fill();
    });
});

/** Suite number plate — engraved brass. */
export const plate612Tex = colorTex(256, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#caa84e'); g.addColorStop(0.5, '#9a7d3a'); g.addColorStop(1, '#7c6228');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#5e4a1c'; ctx.lineWidth = 5; ctx.strokeRect(7, 7, 242, 114);
    ctx.fillStyle = '#3c2f10';
    ctx.font = 'bold 30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SUÍTE', 128, 42);
    ctx.font = 'bold 52px serif';
    ctx.fillText('612', 128, 90);
    // screws
    [[18, 18], [238, 18], [18, 110], [238, 110]].forEach(([x, y]) => {
        ctx.fillStyle = '#6a5420'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2e2408'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke();
    });
});

/** Suitcase leather tag with guest name "Aurélio Campos" — aged leather look. */
export const suitcaseTagTex = colorTex(128, 64, (ctx) => {
    // aged leather gradient background
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#8b6f47'); g.addColorStop(0.5, '#7a5c38'); g.addColorStop(1, '#6b4c28');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 64);
    // worn leather texture overlay
    ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * 128; const y = Math.random() * 64;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 6, y + Math.random() * 3); ctx.stroke();
    }
    // border stitching
    ctx.strokeStyle = '#4a2d10'; ctx.lineWidth = 1.2;
    ctx.strokeRect(2, 2, 124, 60);
    // guest name
    ctx.fillStyle = '#d4c5a9';
    ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Aurélio', 64, 28);
    ctx.font = 'bold 14px serif';
    ctx.fillText('Campos', 64, 45);
});

/** Crooked painting — a moody varnished landscape with craquelure. */
export const paintingTex = colorTex(256, 192, (ctx) => {
    const r = rng(43);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, 90);
    sky.addColorStop(0, '#8d9aa4'); sky.addColorStop(1, '#b8b2a0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 192);
    // far hills
    ctx.fillStyle = '#5c6e60';
    ctx.beginPath(); ctx.moveTo(0, 96);
    ctx.quadraticCurveTo(60, 64, 130, 92); ctx.quadraticCurveTo(190, 110, 256, 78);
    ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
    // dark treeline
    ctx.fillStyle = '#34463a';
    ctx.beginPath(); ctx.moveTo(0, 130);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, 124 + r() * 18);
    ctx.lineTo(256, 192); ctx.lineTo(0, 192); ctx.fill();
    // water
    const wat = ctx.createLinearGradient(0, 150, 0, 192);
    wat.addColorStop(0, '#46525a'); wat.addColorStop(1, '#2c343a');
    ctx.fillStyle = wat; ctx.fillRect(0, 150, 256, 42);
    for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = `rgba(190,196,188,${0.08 + r() * 0.12})`;
        ctx.lineWidth = 1;
        const y = 154 + r() * 34;
        ctx.beginPath(); ctx.moveTo(r() * 200, y); ctx.lineTo(r() * 200 + 56, y); ctx.stroke();
    }
    // a tiny dark building on the hill — twenty windows if you count
    ctx.fillStyle = '#22201c'; ctx.fillRect(96, 56, 18, 38);
    // craquelure + varnish
    ctx.strokeStyle = 'rgba(30,24,16,0.18)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 28; i++) {
        ctx.beginPath();
        let x = r() * 256, y = r() * 192;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += 14 - r() * 28; y += 14 - r() * 28; ctx.lineTo(x, y); }
        ctx.stroke();
    }
    const v = ctx.createRadialGradient(128, 86, 30, 128, 96, 190);
    v.addColorStop(0, 'rgba(255,240,200,0.07)'); v.addColorStop(1, 'rgba(20,14,8,0.34)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, 256, 192);
});

/** Window fog outside — cold, still mist with vignette. "A frozen photograph of mist." */
export const windowFogTex = colorTex(256, 192, (ctx) => {
    const r = rng(71);
    // base pale blue-grey
    const g = ctx.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, '#6a7880'); g.addColorStop(0.5, '#7a8a96'); g.addColorStop(1, '#6a7882');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 192);
    // soft subtle stipple — frozen mist particles
    for (let i = 0; i < 800; i++) {
        ctx.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
        ctx.fillRect(r() * 256, r() * 192, 1.5, 1.5);
    }
    // vignette: edges darker (depth sense)
    const vig = ctx.createRadialGradient(128, 96, 30, 128, 96, 180);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, 256, 192);
});
windowFogTex.wrapS = windowFogTex.wrapT = THREE.ClampToEdgeWrapping;

/** Winch authorization plate — dulled aluminum with weathered black text. */
export const winchPlaqueTex = colorTex(256, 96, (ctx) => {
    // dulled aluminum background
    const g = ctx.createLinearGradient(0, 0, 256, 96);
    g.addColorStop(0, '#a8b0b8'); g.addColorStop(0.5, '#8a9299'); g.addColorStop(1, '#7a8290');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 96);
    // border
    ctx.strokeStyle = '#5a6268'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 244, 84);
    // weathered grime spots
    const r = rng(67);
    for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(30,28,24,${r() * 0.15})`;
        ctx.fillRect(r() * 256, r() * 96, 3, 3);
    }
    // text: "SÓ PESSOAL AUTORIZADO" in weathered black
    ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1818';
    ctx.fillText('SÓ PESSOAL', 128, 32);
    ctx.fillText('AUTORIZADO', 128, 64);
    // tiny screws in corners
    [[12, 12], [244, 12], [12, 84], [244, 84]].forEach(([x, y]) => {
        ctx.fillStyle = '#6a7278'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
    });
});
winchPlaqueTex.wrapS = winchPlaqueTex.wrapT = THREE.ClampToEdgeWrapping;

/** Shower curtain — opaque vinyl with baked vertical folds, water beading,
 *  mildew at the hem, and reinforced eyelets. The parallel multi-sin in the
 *  folds layer mimics the meshy crease pattern of actual plastic sheeting. */
export const showerCurtainTex = colorTex(256, 256, (ctx) => {
    const r = rng(79);
    // base vinyl: slightly warm off-white
    ctx.fillStyle = '#e0e5df'; ctx.fillRect(0, 0, 256, 256);

    // vertical fold shading — layered sines for realistic crease depth
    // primary folds (wide, deep) + secondary ripples (fine detail)
    for (let x = 0; x < 256; x++) {
        const t = x / 256;
        // primary folds: deep shadows in valleys
        const fold1 = Math.sin(t * Math.PI * 10 + 0.3) * 0.55;
        // secondary ripples: fine mesh-like texture
        const fold2 = Math.sin(t * Math.PI * 23 + 1.1) * 0.25;
        const fold3 = Math.sin(t * Math.PI * 6.5 + 0.7) * 0.35;
        const combined = fold1 + fold2 + fold3;
        const v = Math.round(combined * 18);
        // raised areas: brighten; valleys: darken
        ctx.fillStyle = v >= 0
            ? `rgba(255,255,255,${Math.min(1, v / 85)})`
            : `rgba(75,88,82,${Math.min(1, -v / 60)})`;
        ctx.fillRect(x, 0, 1, 256);
    }

    // water beads: scattered across surface, drying rings
    for (let i = 0; i < 48; i++) {
        const x = r() * 256, y = r() * 256;
        const size = 1.2 + r() * 3.8;
        // bead shadow (dark)
        ctx.fillStyle = `rgba(140,152,144,${0.08 + r() * 0.12})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        // bead shine (light halo inside)
        ctx.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
        ctx.beginPath(); ctx.arc(x - 0.4, y - 0.4, size * 0.4, 0, Math.PI * 2); ctx.fill();
    }

    // mineral deposits under the waterline (bottom third)
    for (let i = 0; i < 20; i++) {
        ctx.fillStyle = `rgba(165,155,130,${0.04 + r() * 0.08})`;
        ctx.beginPath();
        const cx = r() * 256, cy = 170 + r() * 86;
        ctx.arc(cx, cy, 2.5 + r() * 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // mildew grime creeping up from the hem (damp zone)
    const grimGrad = ctx.createLinearGradient(0, 180, 0, 256);
    grimGrad.addColorStop(0, 'rgba(95,102,85,0)');
    grimGrad.addColorStop(0.4, 'rgba(95,102,85,0.08)');
    grimGrad.addColorStop(1, 'rgba(75,82,68,0.28)');
    ctx.fillStyle = grimGrad; ctx.fillRect(0, 180, 256, 76);

    // reinforced top hem (pocket for the rod)
    ctx.fillStyle = 'rgba(200,205,200,0.95)'; ctx.fillRect(0, 0, 256, 12);
    // eyelet holes (cast shadows inside)
    for (let i = 0; i < 8; i++) {
        const ex = 16 + i * 32;
        // hole rim (recessed)
        ctx.fillStyle = 'rgba(60,65,58,0.6)';
        ctx.beginPath(); ctx.arc(ex, 6, 3.8, 0, Math.PI * 2); ctx.fill();
        // inner hole shadow
        ctx.fillStyle = 'rgba(40,45,40,0.4)';
        ctx.beginPath(); ctx.arc(ex, 6, 2.2, 0, Math.PI * 2); ctx.fill();
    }
});
showerCurtainTex.wrapS = showerCurtainTex.wrapT = THREE.ClampToEdgeWrapping;

/** Typed maintenance note taped by the junction box — aged paper, faded
 *  typewriter lines (mostly illegible), coffee ring, curl shadow. */
export const typedNoteTex = colorTex(128, 160, (ctx) => {
    const r = rng(73);
    ctx.fillStyle = '#d9d0b6'; ctx.fillRect(0, 0, 128, 160);          // aged paper
    for (let i = 0; i < 260; i++) {                                    // grain
        ctx.fillStyle = `rgba(120,100,70,${r() * 0.08})`;
        ctx.fillRect(r() * 128, r() * 160, 1.5, 1.5);
    }
    // typed header
    ctx.fillStyle = '#2e2a22';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('MANUTENÇÃO', 64, 26);
    ctx.font = '9px monospace';
    ctx.fillText('CAIXA DE JUNÇÃO — 612', 64, 42);
    // faded typed body lines (illegible ribbons of type)
    for (let li = 0; li < 7; li++) {
        const y = 62 + li * 13;
        const len = 88 - r() * 30;
        ctx.fillStyle = `rgba(52,46,38,${0.35 + r() * 0.3})`;
        for (let x = 20; x < 20 + len; x += 4) {
            if (r() > 0.12) ctx.fillRect(x, y, 3, 1.6 + r());
        }
    }
    // coffee ring
    ctx.strokeStyle = 'rgba(122,84,40,0.22)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(96, 128, 17, 0, Math.PI * 2); ctx.stroke();
    // bottom curl shadow
    const g = ctx.createLinearGradient(0, 120, 0, 160);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,48,30,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 120, 128, 40);
});
typedNoteTex.wrapS = typedNoteTex.wrapT = THREE.ClampToEdgeWrapping;

/** Brass scratch on the wall hidden behind the painting: « 9 ». */
export const nineTex = colorTex(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#2e241a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    // hand-scratched 9
    ctx.beginPath(); ctx.arc(60, 52, 24, -0.4, Math.PI * 1.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(82, 44); ctx.quadraticCurveTo(86, 84, 70, 108); ctx.stroke();
    // scratch burrs
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(38, 40); ctx.lineTo(30, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(76, 100); ctx.lineTo(83, 110); ctx.stroke();
});
nineTex.wrapS = nineTex.wrapT = THREE.ClampToEdgeWrapping;

/** The cab's button column plate: floors 1·2·3·▢·5·6·7 — the burnt hole
 *  where 4 should be IS the clue. Canvas so it never depends on a CDN font. */
export const botoeiraTex = colorTex(128, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#73787e'); g.addColorStop(0.5, '#8b9097'); g.addColorStop(1, '#6c7177');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 512);
    ctx.strokeStyle = '#4a4e54'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 116, 500);
    const r = rng(61);
    for (let i = 0; i < 160; i++) {                          // grime
        ctx.fillStyle = `rgba(30,28,24,${r() * 0.12})`;
        ctx.fillRect(r() * 128, r() * 512, 2, 2);
    }
    [7, 6, 5, 4, 3, 2, 1].forEach((n, i) => {
        const y = 60 + i * 66;
        if (n === 4) {
            // the hole — scorched ring, void center
            ctx.fillStyle = '#0a0908';
            ctx.beginPath(); ctx.arc(64, y, 21, 0, Math.PI * 2); ctx.fill();
            for (let k = 0; k < 14; k++) {
                ctx.strokeStyle = `rgba(22,16,10,${0.3 + r() * 0.3})`;
                ctx.lineWidth = 2;
                const a = r() * Math.PI * 2;
                ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 22, y + Math.sin(a) * 22);
                ctx.lineTo(64 + Math.cos(a) * (26 + r() * 8), y + Math.sin(a) * (26 + r() * 8)); ctx.stroke();
            }
            return;
        }
        // worn brass button
        const bg = ctx.createRadialGradient(60, y - 4, 3, 64, y, 20);
        bg.addColorStop(0, '#d9c489'); bg.addColorStop(0.7, '#a8893f'); bg.addColorStop(1, '#6e5a24');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(64, y, 19, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3c3010'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(64, y, 19, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#2c2414';
        ctx.font = 'bold 24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 64, y + 1);
    });
});
botoeiraTex.wrapS = botoeiraTex.wrapT = THREE.ClampToEdgeWrapping;

/** "NÃO PERTURBE" door hanger. */
export const dndTex = colorTex(96, 192, (ctx) => {
    ctx.fillStyle = '#a8332a'; ctx.fillRect(0, 0, 96, 192);
    ctx.strokeStyle = '#7c1f18'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 88, 184);
    ctx.fillStyle = '#16100c'; ctx.beginPath(); ctx.arc(48, 34, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a8332a'; ctx.beginPath(); ctx.arc(48, 34, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ecdfc8'; ctx.font = 'bold 17px serif'; ctx.textAlign = 'center';
    ctx.fillText('NÃO', 48, 92);
    ctx.fillText('PERTURBE', 48, 116);
    ctx.font = '10px serif';
    ctx.fillText('— a administração —', 48, 162);
});
dndTex.wrapS = dndTex.wrapT = THREE.ClampToEdgeWrapping;

// ── shared materials ──────────────────────────────────────────────────────────
export const F6M = {
    carpet: new THREE.MeshStandardMaterial({ ...PBR.carpet(), roughness: 1 }),
    tileFloor: new THREE.MeshStandardMaterial({ map: tileTex, bumpMap: tileBump, bumpScale: 0.15, roughnessMap: tileRough, roughness: 1.0, envMapIntensity: 0.7 }),
    vinyl: new THREE.MeshStandardMaterial({ ...PBR.lino(), roughness: 1, envMapIntensity: 0.5 }),
    ceil: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ ...PBR.wood(), roughness: 1, envMapIntensity: 0.6 }),
    woodBig: new THREE.MeshStandardMaterial({ ...PBR.wood(), roughness: 1, envMapIntensity: 0.6 }),
    woodDk: new THREE.MeshStandardMaterial({ color: '#33251a', roughness: 0.7, envMapIntensity: 0.3 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#7e2b26', roughness: 1 }),
    fabricDk: new THREE.MeshStandardMaterial({ color: '#5e1f1c', roughness: 1 }),
    sheet: new THREE.MeshStandardMaterial({ color: '#cfc7b4', roughness: 0.92 }),
    pillow: new THREE.MeshStandardMaterial({ color: '#ddd6c4', roughness: 0.92 }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#e9e7e0', roughness: 0.16, envMapIntensity: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#cdd2d6', metalness: 0.95, roughness: 0.18, envMapIntensity: 1.1 }),
    steel: new THREE.MeshStandardMaterial({ ...PBR.metal(), metalness: 0.85, roughness: 1, envMapIntensity: 0.9 }),
    steelPlain: new THREE.MeshStandardMaterial({ color: '#6e747a', metalness: 0.7, roughness: 0.45, envMapIntensity: 0.6 }),
    appliance: new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.38, envMapIntensity: 0.55 }),
    applianceDk: new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.5, envMapIntensity: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1c1a17', roughness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.95 }),
    door: new THREE.MeshStandardMaterial({ color: '#54402c', roughness: 0.58, envMapIntensity: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08f42', metalness: 0.9, roughness: 0.3, envMapIntensity: 1.1 }),
    brassOld: new THREE.MeshStandardMaterial({ color: '#7e6730', metalness: 0.85, roughness: 0.45, envMapIntensity: 0.8 }),
    curtain: new THREE.MeshStandardMaterial({ color: '#57493d', roughness: 1, side: THREE.DoubleSide }),
    shower: new THREE.MeshStandardMaterial({ color: '#d8dfd8', transparent: true, opacity: 0.55, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    glass: new THREE.MeshStandardMaterial({ color: '#aebfc4', metalness: 0.4, roughness: 0.05, transparent: true, opacity: 0.3, envMapIntensity: 1.4 }),
    paper: new THREE.MeshStandardMaterial({ color: '#ded6bd', roughness: 0.9 }),
    ice: new THREE.MeshPhysicalMaterial({ color: '#bfe2ec', transparent: true, opacity: 0.78, roughness: 0.12, transmission: 0, envMapIntensity: 1.3 }),
    cabWall: new THREE.MeshStandardMaterial({ ...PBR.metal(), metalness: 0.7, roughness: 1, color: '#d4dce2', envMapIntensity: 0.8 }),
    cabFloor: new THREE.MeshStandardMaterial({ map: cabFloorTex, color: '#7d776c', roughness: 0.6, envMapIntensity: 0.3 }),
    leather: new THREE.MeshStandardMaterial({ ...PBR.leather(), roughness: 1, envMapIntensity: 0.7 }),
    leatherDk: new THREE.MeshStandardMaterial({ ...PBR.leather(), color: '#8a6a60', roughness: 1, envMapIntensity: 0.5 }),
};

// ── contact-shadow blob (radial gradient, multiplied onto the floor) ─────────
export const blobTex = (() => {
    const t = new THREE.CanvasTexture(makeCanvas(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
        g.addColorStop(0, 'rgba(0,0,0,0.42)');
        g.addColorStop(0.65, 'rgba(0,0,0,0.2)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    }));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
})();
export const blobMat = new THREE.MeshBasicMaterial({
    map: blobTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1,
});

/** Soft white puff — steam, smoke, cold fridge air (tint via material color). */
export const puffTex = (() => {
    const t = new THREE.CanvasTexture(makeCanvas(64, 64, (ctx) => {
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.32)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    }));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
})();

// ── dynamic canvases ─────────────────────────────────────────────────────────

/** Bathroom-mirror steam film. fog01 drives opacity scene-side; once the
 *  message starts revealing, call drawMirror(reveal01) — the letters are
 *  wiped INTO the fog (destination-out), like a finger wrote them. */
export const mirrorFog = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 224;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = (reveal01: number) => {
        const ctx = c.getContext('2d')!;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, 256, 224);
        // condensation: dense soft droplets
        const r = rng(53);
        ctx.fillStyle = 'rgba(214,222,218,0.9)';
        ctx.fillRect(0, 0, 256, 224);
        for (let i = 0; i < 110; i++) {
            ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`;
            ctx.beginPath(); ctx.arc(r() * 256, r() * 224, 2 + r() * 9, 0, Math.PI * 2); ctx.fill();
        }
        // drips along the bottom edge
        for (let i = 0; i < 9; i++) {
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            const x = 12 + i * 28 + r() * 10;
            ctx.fillRect(x, 224 - 26 - r() * 30, 3, 30 + r() * 26);
        }
        if (reveal01 > 0) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.font = 'bold 25px cursive';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            const lines = ['ELES TRANCARAM', 'MINHA COMIDA.', 'A CHAVE DESCEU', 'PELO RALO.'];
            const totalChars = lines.reduce((a, l) => a + l.length, 0);
            let budget = Math.floor(totalChars * reveal01);
            lines.forEach((line, i) => {
                if (budget <= 0) return;
                const part = line.slice(0, budget);
                budget -= line.length;
                ctx.fillText(part, 128, 56 + i * 44);
            });
            ctx.globalCompositeOperation = 'source-over';
        }
        tex.needsUpdate = true;
    };
    draw(0);
    return { tex, draw };
})();

/** CRT screen — per-channel garbage, canal 2 is the pure-static one with the
 *  burned « 2 ». Call drawTv(channel, time) at ~12fps while the set is on. */
export const tvScreen = (() => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 72;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const draw = (channel: number, t: number) => {
        const ctx = c.getContext('2d')!;
        if (channel === 2) {
            // pure white-noise static
            const img = ctx.createImageData(96, 72);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.random() * 255;
                img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            // burned-in « 2 », faint, always there once you know
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
            ctx.fillText('2', 82, 64);
        } else if (channel % 3 === 0) {
            // dead color bars, rolling
            const bars = ['#b8b8b8', '#b8b800', '#00b8b8', '#00b800', '#b800b8', '#b80000', '#0000b8'];
            const roll = Math.floor(t * 40) % 72;
            bars.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(i * 14, 0, 14, 72); });
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, roll, 96, 8);
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`;
                ctx.fillRect(Math.random() * 96, Math.random() * 72, 2, 1);
            }
        } else {
            // grey garbage with tearing bands
            const img = ctx.createImageData(96, 72);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = 30 + Math.random() * 90;
                img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            const y = Math.floor((t * 60 + channel * 13) % 72);
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, y, 96, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, (y + 30) % 72, 96, 5);
        }
        // channel number, top-left, like a real 80s set
        ctx.fillStyle = 'rgba(120,255,120,0.85)';
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`CH ${channel}`, 4, 12);
        tex.needsUpdate = true;
    };
    return { tex, draw };
})();
