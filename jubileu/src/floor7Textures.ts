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
        // butt joints: staggered cross-seams where plank lengths meet (deep groove)
        const buttN = 2 + Math.floor(r() * 2);
        for (let bj = 0; bj < buttN; bj++) {
            const by = (r() * 0.9 + 0.05) * size;
            ctx.fillStyle = '#1c1206'; ctx.fillRect(x + 1, by, plankW - 2, 2.6);
            ctx.fillStyle = light; ctx.globalAlpha = 0.12; ctx.fillRect(x + 1, by + 2.6, plankW - 2, 1.4); ctx.globalAlpha = 1;
            rx.fillStyle = '#e0e0e0'; rx.fillRect(x + 1, by - 1.4, plankW - 2, 1.4);  // raised edge
            rx.fillStyle = '#101010'; rx.fillRect(x + 1, by, plankW - 2, 2.6);        // deep groove
        }
        // plank seam: a beveled caulk groove (bright raised edge + deep dark groove)
        // in both the colour and the bump (rough) map, so strakes catch grazing light
        ctx.fillStyle = '#1c1206'; ctx.fillRect(x - 1, 0, 3, size);
        ctx.fillStyle = light; ctx.globalAlpha = 0.2; ctx.fillRect(x + 2, 0, 2, size); ctx.globalAlpha = 1;
        rx.fillStyle = '#e2e2e2'; rx.fillRect(x - 2.5, 0, 1.6, size);  // raised plank edge (bright = proud)
        rx.fillStyle = '#0c0c0c'; rx.fillRect(x - 1, 0, 3, size);      // deep caulk groove (dark = recessed)
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

// an equirectangular sky image (sky->horizon->sea + a warm sun) for a PMREM
// environment map, so every PBR material gets real reflections. Self-contained.
export function makeSkyEquirect(w = 1024): THREE.CanvasTexture {
    const h = w / 2;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    // vertical gradient: zenith blue -> warm horizon -> deep sea
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, '#3b78c4');
    g.addColorStop(0.42, '#a9cde8');
    g.addColorStop(0.5, '#ffe6c0');   // horizon haze
    g.addColorStop(0.52, '#3f7e98');
    g.addColorStop(1.0, '#0c3142');   // sea
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // warm sun disk near the horizon
    const sx = w * 0.7, sy = h * 0.44;
    const sg = x.createRadialGradient(sx, sy, 0, sx, sy, w * 0.13);
    sg.addColorStop(0, 'rgba(255,250,235,1)');
    sg.addColorStop(0.18, 'rgba(255,238,200,0.95)');
    sg.addColorStop(0.5, 'rgba(255,210,150,0.3)');
    sg.addColorStop(1, 'rgba(255,200,150,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// a soft dark radial blob for fake AO contact shadows under deck props.
export function makeContactShadow(size = 128): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.3)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    return t;
}

// a warm soft radial glow (for the sun halo) — self-contained.
export function makeGlow(size = 256): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.12, 'rgba(255,236,190,0.95)');
    g.addColorStop(0.4, 'rgba(255,196,120,0.35)');
    g.addColorStop(1, 'rgba(255,180,110,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// a soft puffy cloud (alpha) drawn from overlapping radial blobs — self-contained.
export function makeCloud(seed = 1, size = 256): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = size; c.height = size / 2;
    const x = c.getContext('2d')!;
    const r = rnd(seed * 99 + 7);
    const cy = c.height * 0.62;
    const blobs = 9 + Math.floor(r() * 5);
    for (let i = 0; i < blobs; i++) {
        const bx = size * (0.12 + r() * 0.76);
        const by = cy - r() * c.height * 0.4;
        const rad = (0.10 + r() * 0.16) * size;
        const g = x.createRadialGradient(bx, by, 0, bx, by, rad);
        const a = 0.5 + r() * 0.4;
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.55, `rgba(252,250,245,${a * 0.5})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, rad, 0, 7); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// weathered sailcloth: warm canvas with vertical panel seams, horizontal
// reef-band stitching and faint stains — so the sails read as cloth, not card.
export function makeSailcloth(w = 512, h = 384): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
    const rx = rc.getContext('2d')!;
    const r = rnd(0x5A11);
    // base cream with a gentle vertical shade (top a touch brighter)
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#efe6d0'); g.addColorStop(0.5, '#e6dcc2'); g.addColorStop(1, '#d8ccae');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    rx.fillStyle = '#d2d2d2'; rx.fillRect(0, 0, w, h); // cloth is fairly rough/matte
    // woven texture (fine speckle)
    for (let i = 0; i < 9000; i++) {
        x.fillStyle = r() > 0.5 ? 'rgba(255,250,235,0.06)' : 'rgba(150,135,105,0.06)';
        x.fillRect(r() * w, r() * h, 1.4, 1.4);
    }
    // vertical panel seams (sails are sewn from cloth strips)
    const panelW = w / 7;
    for (let px = panelW; px < w; px += panelW) {
        x.strokeStyle = 'rgba(120,104,76,0.5)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke();
        x.strokeStyle = 'rgba(255,250,235,0.4)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(px + 1.5, 0); x.lineTo(px + 1.5, h); x.stroke();
        rx.strokeStyle = '#9a9a9a'; rx.lineWidth = 2; rx.beginPath(); rx.moveTo(px, 0); rx.lineTo(px, h); rx.stroke();
    }
    // horizontal reef bands (rows of stitch dashes)
    for (const by of [h * 0.34, h * 0.66]) {
        x.strokeStyle = 'rgba(110,94,68,0.45)'; x.lineWidth = 1.5; x.setLineDash([6, 5]);
        x.beginPath(); x.moveTo(0, by); x.lineTo(w, by); x.stroke(); x.setLineDash([]);
    }
    // a few faint weather stains
    for (let i = 0; i < 7; i++) {
        const sx = r() * w, sy = r() * h, sr = 24 + r() * 60;
        const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sg.addColorStop(0, 'rgba(150,130,95,0.10)'); sg.addColorStop(1, 'rgba(150,130,95,0)');
        x.fillStyle = sg; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const rough = new THREE.CanvasTexture(rc);
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
