// floor7Textures.ts — procedural wood for the pirate ship (canvas-generated, no
// external files, so it inlines into the single-file build). Returns a colour
// map + a matching roughness map so the deck/hull read as real weathered planks
// under the PBR lighting instead of flat brown boxes.
import * as THREE from 'three';

interface WoodOpts {
    base?: string; dark?: string; light?: string;
    plankW?: number;     // px between plank seams
    knots?: number;
    size?: number;
}

function rnd(seed: number) { let s = seed >>> 0; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000) / 1000; }; }

export function makeWood(opts: WoodOpts = {}): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
    const size = opts.size ?? 512;
    const plankW = opts.plankW ?? 96;
    const base = opts.base ?? '#8a6334';
    const dark = opts.dark ?? '#5d4022';
    const light = opts.light ?? '#a87f48';
    const r = rnd(0xA17 + plankW);

    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const rc = document.createElement('canvas'); rc.width = rc.height = size;
    const rx = rc.getContext('2d')!;

    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    rx.fillStyle = '#b8b8b8'; rx.fillRect(0, 0, size, size); // fairly rough by default

    // per-plank tint + grain
    for (let x = 0; x < size; x += plankW) {
        const tint = r();
        ctx.fillStyle = tint > 0.5 ? light : dark;
        ctx.globalAlpha = 0.06 + tint * 0.10;
        ctx.fillRect(x, 0, plankW, size);
        ctx.globalAlpha = 1;
        // grain streaks down the plank
        for (let g = 0; g < 26; g++) {
            const gx = x + 4 + r() * (plankW - 8);
            ctx.strokeStyle = r() > 0.5 ? dark : light;
            ctx.globalAlpha = 0.04 + r() * 0.10;
            ctx.lineWidth = 0.6 + r() * 1.4;
            ctx.beginPath();
            let yy = 0; ctx.moveTo(gx, 0);
            while (yy < size) { yy += 14 + r() * 22; ctx.lineTo(gx + (r() - 0.5) * 5, yy); }
            ctx.stroke();
            // roughness streaks
            rx.strokeStyle = r() > 0.5 ? '#888' : '#d8d8d8';
            rx.globalAlpha = 0.18; rx.lineWidth = ctx.lineWidth;
            rx.stroke();
        }
        ctx.globalAlpha = 1; rx.globalAlpha = 1;
        // plank seam (dark groove) + a highlight bevel
        ctx.fillStyle = '#2c1d0f'; ctx.fillRect(x, 0, 2, size);
        ctx.fillStyle = light; ctx.globalAlpha = 0.12; ctx.fillRect(x + 2, 0, 2, size); ctx.globalAlpha = 1;
        rx.fillStyle = '#5a5a5a'; rx.fillRect(x, 0, 2, size); // grooves are smoother/darker
    }

    // a few knots
    const nk = opts.knots ?? 5;
    for (let k = 0; k < nk; k++) {
        const kx = r() * size, ky = r() * size, kr = 4 + r() * 9;
        for (let ring = kr; ring > 0; ring -= 1.6) {
            ctx.strokeStyle = ring % 3 < 1.5 ? dark : base;
            ctx.globalAlpha = 0.5; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.ellipse(kx, ky, ring, ring * 0.7, r() * 6, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    map.colorSpace = THREE.SRGBColorSpace;
    const rough = new THREE.CanvasTexture(rc);
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    return { map, rough };
}

// black Jolly Roger: white skull + crossed bones on black, drawn procedurally.
export function makeJollyRoger(size = 256): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.fillStyle = '#0c0c0d'; x.fillRect(0, 0, size, size);
    const cx = size * 0.5, cy = size * 0.44, s = size / 256;
    x.fillStyle = '#ececec';
    // crossbones
    x.save(); x.translate(cx, cy + 34 * s);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
        x.save(); x.rotate(a);
        x.fillRect(-70 * s, -7 * s, 140 * s, 14 * s);
        for (const e of [-70, 70]) { x.beginPath(); x.arc(e * s, -7 * s, 9 * s, 0, 7); x.arc(e * s, 7 * s, 9 * s, 0, 7); x.fill(); }
        x.restore();
    }
    x.restore();
    // skull
    x.beginPath(); x.ellipse(cx, cy, 46 * s, 50 * s, 0, 0, 7); x.fill();
    x.fillRect(cx - 26 * s, cy + 38 * s, 52 * s, 26 * s); // jaw
    // eyes + nose (cut out black)
    x.fillStyle = '#0c0c0d';
    x.beginPath(); x.ellipse(cx - 18 * s, cy - 4 * s, 13 * s, 16 * s, 0.2, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx + 18 * s, cy - 4 * s, 13 * s, 16 * s, -0.2, 0, 7); x.fill();
    x.beginPath(); x.moveTo(cx, cy + 8 * s); x.lineTo(cx - 7 * s, cy + 24 * s); x.lineTo(cx + 7 * s, cy + 24 * s); x.fill();
    // teeth gaps
    for (let i = -2; i <= 2; i++) x.fillRect(cx + i * 9 * s - 1.5 * s, cy + 40 * s, 3 * s, 22 * s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
}
