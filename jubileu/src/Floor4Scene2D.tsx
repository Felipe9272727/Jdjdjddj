/**
 * Floor4Scene2D.tsx — Floor 4: the LOBBY, utterly DESTROYED — as a true 2D
 * side-scroller (orthographic, flat layered pixel sprites).
 *
 * The floor is a wrecked, chaotic (mildly gory) mirror of the ground-floor
 * lobby the player knows: same cream wallpaper + wood wainscot + checkered
 * tiles + gold "SAGUÃO" sign + reception desk + potted plant — but collapsed,
 * bloodstained and scrawled with lore. Cutaway view shows the FLOORS BELOW
 * through holes torn in the slab ("roubaram o chão" — Dussekar warned you).
 * A boarded BACK DOOR sits at the far right (content TBD — Felipe decides).
 * The only pristine thing here is the elevator. It is always pristine.
 *
 * Rendered under an OrthographicCamera — ZERO perspective, real 2D. All art is
 * procedural pixel CanvasTexture (NearestFilter, ~16px per world unit), no
 * external assets, so it renders offline in the workbench.
 *
 * World units: main floor TOP at y=0; +x right, +y up; layers stacked on z.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';
import { Floor4Elevator2D } from './Floor4Elevator';

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
    // dusk bleeding through the collapsed ceiling
    skyTop: '#160b10', skyMid: '#371420', skyLow: '#6e2b24', smoke: '#2a161c',
    // the lobby's surfaces, ruined
    wall: '#cfc3a5', wallDk: '#b8ab8c', stain: '#998a6a', crack: '#3a3128',
    wains: '#6b4a2e', wainsDk: '#4a3018', wainsLt: '#82603f',
    brick: '#5d3a30', brickDk: '#3c241e', voidDk: '#0c090b',
    tileA: '#b9ad92', tileB: '#8e8470', tileEdge: '#d6cbb0', grout: '#6e6754',
    concrete: '#8a8276', concreteDk: '#5f594e', rebar: '#4a3526',
    ceil: '#a99d83', ceilDk: '#7d7460',
    // the floors below (cutaway)
    low1: '#221a1e', low1Wall: '#33262e', low1Lt: '#473342', low1Door: '#120d11',
    low2: '#120d11', low2Arch: '#1d141a',
    pipe: '#565b63', pipeDk: '#34383e',
    // gore (kept dark/dried — "meio gore")
    blood: '#7e1416', bloodDk: '#54090e', bloodLt: '#9c1e1e',
    // props
    wood: '#7a5230', woodDk: '#54371d', plank: '#9a7644', nail: '#2e2620',
    gold: '#FFD54F', goldDk: '#bf9a2e', header: '#141414',
    metal: '#9aa3b0', metalDk: '#5c6371', cable: '#1c1c20',
    paper: '#e8dfc8', text: '#efe9d6', panel: '#11131a', red: '#ff4040',
    leafDead: '#7d7245', leafDeadDk: '#574e2c', pot: '#b5532e', potDk: '#7e3a20',
    glow: '#ffe9b0',
};

// Deterministic pseudo-random for the destruction details (stable art).
let _seed = 1337;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return _seed / 2147483647; };

// Flat unlit sprite plane with a pixel texture.
const S: React.FC<{ tex: THREE.Texture; w: number; h: number; x: number; y: number; z?: number; transparent?: boolean; rot?: number; flipX?: boolean; opacity?: number }> =
    ({ tex, w, h, x, y, z = 0, transparent, rot = 0, flipX, opacity }) => (
        <mesh position={[x, y, z]} rotation={[0, 0, rot]} scale={[flipX ? -1 : 1, 1, 1]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex} transparent={transparent || opacity !== undefined} alphaTest={transparent && opacity === undefined ? 0.5 : 0} opacity={opacity ?? 1} toneMapped={false} />
        </mesh>
    );

// ── Drawing helpers (all paint on the 16px-per-unit grid) ─────────────────────

/** Jagged hole (row-scan ellipse with jitter) revealing `fill`, ringed with brick. */
function holeAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, fill: string) {
    for (let dy = -ry; dy <= ry; dy++) {
        const t = Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry)));
        const w = rx * t * (0.75 + rnd() * 0.45);
        px(ctx, Math.round(cx - w), cy + dy, Math.round(w * 2), 1, fill);
    }
    for (let i = 0; i < 16; i++) {                       // exposed brick on the rim
        const a = rnd() * Math.PI * 2;
        const bx = cx + Math.cos(a) * rx * (0.8 + rnd() * 0.25);
        const by = cy + Math.sin(a) * ry * (0.8 + rnd() * 0.25);
        px(ctx, Math.round(bx), Math.round(by), 3 + Math.round(rnd() * 2), 2, rnd() > 0.5 ? P.brick : P.brickDk);
    }
}

/** Wandering 1px crack. */
function crackAt(ctx: CanvasRenderingContext2D, x0: number, y0: number, len: number, dir: number) {
    let x = x0, y = y0;
    for (let i = 0; i < len; i++) {
        px(ctx, Math.round(x), Math.round(y), 1, 1, P.crack);
        x += Math.cos(dir); y += Math.sin(dir);
        dir += (rnd() - 0.5) * 0.9;
    }
}

/** Dried blood smear: blob + drips running down. */
function bloodAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, drips: number) {
    for (let dy = -r; dy <= r; dy++) {
        const t = Math.sqrt(Math.max(0, 1 - (dy / r) * (dy / r)));
        const w = r * t * (0.7 + rnd() * 0.5);
        px(ctx, Math.round(x - w), y + dy, Math.round(w * 2), 1, P.bloodDk);
    }
    px(ctx, x - Math.round(r * 0.4), y - Math.round(r * 0.3), Math.round(r * 0.8), Math.round(r * 0.5), P.blood);
    for (let i = 0; i < drips; i++) {
        const dx = x + Math.round((rnd() - 0.5) * r * 1.6);
        const dl = 4 + Math.round(rnd() * 14);
        px(ctx, dx, y, 1, dl, P.bloodDk);
        px(ctx, dx, y + dl, 1, 2, P.blood);
    }
}

/** Graffiti scrawl (slightly rotated text). */
function scrawl(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, size: number, col: string, rot = -0.04) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = col;
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 0);
    ctx.restore();
}

// ── World extents ─────────────────────────────────────────────────────────────
export const FLOOR4_WORLD = { left: -13, right: 15.2, groundY: 0 };
export const FLOOR4_ELEVATOR_X = -8;
const W0 = FLOOR4_WORLD.left, W1 = FLOOR4_WORLD.right + 1;   // wall span (1u of rubble past the clamp)
const SPAN = W1 - W0;                                        // 30 world units
const PXU = 16;                                              // texture px per world unit

// ── Big baked layers (module-level, built once) ───────────────────────────────

const skyTex = pixelTex(8, 96, (ctx) => {                    // dusk gradient
    for (let y = 0; y < 96; y++) {
        const t = y / 96;
        px(ctx, 0, y, 8, 1, t < 0.45 ? P.skyTop : t < 0.78 ? P.skyMid : P.skyLow);
    }
});

const smokeTex = pixelTex(32, 12, (ctx) => {
    ctx.clearRect(0, 0, 32, 12);
    px(ctx, 4, 4, 22, 5, P.smoke); px(ctx, 9, 1, 14, 4, P.smoke); px(ctx, 0, 6, 8, 4, P.smoke); px(ctx, 24, 6, 8, 3, P.smoke);
});

// The ruined lobby back wall — every bit of destruction baked into one texture.
const wallH = 7.5;
const wallTex = pixelTex(SPAN * PXU, wallH * PXU, (ctx) => {
    const W = SPAN * PXU, H = wallH * PXU;                  // 480 × 120; wall world y: 0..7.5 (tex y flipped)
    const wx = (worldX: number) => Math.round((worldX - W0) * PXU);
    px(ctx, 0, 0, W, H, P.wall);
    for (let x = 0; x < W; x += 9) px(ctx, x, 0, 1, H, P.wallDk);          // wallpaper stripes
    for (let x = 0; x < W; x += 64) px(ctx, x, 0, 2, H, P.stain);          // panel seams
    px(ctx, 0, 0, W, 4, P.wainsDk);                                        // crown line
    // wood wainscot (bottom 2.1u)
    const wainsY = H - 34;
    px(ctx, 0, wainsY, W, 34, P.wains);
    px(ctx, 0, wainsY, W, 3, P.wainsLt);
    for (let x = 0; x < W; x += 24) px(ctx, x, wainsY + 5, 1, 29, P.wainsDk);
    // grime blotches
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 110; i++) px(ctx, Math.round(rnd() * W), Math.round(rnd() * H), 2 + Math.round(rnd() * 9), 2 + Math.round(rnd() * 5), rnd() > 0.4 ? P.stain : P.crack);
    ctx.globalAlpha = 1;
    // structural cracks
    for (let i = 0; i < 9; i++) crackAt(ctx, rnd() * W, rnd() * (H * 0.4), 18 + rnd() * 30, Math.PI / 2 + (rnd() - 0.5));
    // holes torn to brick/void
    holeAt(ctx, wx(-10.6), 38, 16, 12, P.voidDk);
    holeAt(ctx, wx(1.0), 52, 30, 22, P.voidDk);
    holeAt(ctx, wx(8.6), 26, 20, 14, P.voidDk);
    holeAt(ctx, wx(14.2), 70, 14, 18, P.voidDk);
    // gore: smears, a handprint, a long drag swipe
    bloodAt(ctx, wx(-6.1), 58, 7, 4);
    bloodAt(ctx, wx(4.6), 44, 5, 3);
    bloodAt(ctx, wx(12.6), 62, 8, 5);
    // drag smear toward the floor hole — broken streaks, not one slab
    ctx.globalAlpha = 0.45; px(ctx, wx(4.0), 79, 34, 2, P.bloodDk);
    ctx.globalAlpha = 0.3;  px(ctx, wx(4.6), 82, 44, 2, P.bloodDk);
    ctx.globalAlpha = 0.5;  px(ctx, wx(5.4), 77, 18, 2, P.bloodDk);
    ctx.globalAlpha = 0.25; px(ctx, wx(5.0), 84, 26, 1, P.bloodDk);
    ctx.globalAlpha = 1;
    px(ctx, wx(5.9), 70, 5, 7, P.blood);                                   // handprint (palm)
    for (let f = 0; f < 4; f++) px(ctx, wx(5.9) + 1 + f, 66, 1, 4, P.blood);
    // graffiti — the floor's lore, scrawled by whoever was here before
    scrawl(ctx, 'ELE AINDA SOBE', wx(-12.4), 22, 8, P.crack, -0.06);
    scrawl(ctx, 'O ANDAR 4', wx(3.4), 26, 11, P.bloodDk, -0.03);
    scrawl(ctx, 'NÃO EXISTE', wx(3.6), 40, 11, P.bloodDk, 0.02);
    scrawl(ctx, 'NÃO DURMA.', wx(-1.2), 66, 7, P.crack, 0.05);
    scrawl(ctx, 'ROUBARAM O CHÃO', wx(4.4), 92, 9, P.bloodDk, -0.05);
    px(ctx, wx(6.7), 96, 2, 12, P.bloodDk); px(ctx, wx(6.7) - 2, 104, 6, 2, P.bloodDk);  // ↓ arrow to the hole
    scrawl(ctx, 'AS PARTES QUE SOBRAM', wx(7.6), 50, 7, P.crack, -0.02);
    ctx.globalAlpha = 0.55; px(ctx, wx(9.6), 44, 40, 10, P.wall); ctx.globalAlpha = 1;   // ...half smeared out
    // tally marks beside the back door
    for (let i = 0; i < 4; i++) px(ctx, wx(10.1) + i * 3, 40, 1, 9, P.crack);
    ctx.save(); ctx.translate(wx(10.1) + 5, 44); ctx.rotate(0.9); px(ctx, -7, 0, 14, 1, P.crack); ctx.restore();
    // crooked picture frame, canvas torn
    px(ctx, wx(-2.9), 24, 18, 14, P.goldDk); px(ctx, wx(-2.9) + 2, 26, 14, 10, P.voidDk);
    crackAt(ctx, wx(-2.9) + 4, 28, 8, 0.7);
});

// Ceiling strip — tile grid with collapsed gaps (transparent → dusk sky shows).
const ceilTex = pixelTex(SPAN * PXU, 20, (ctx) => {
    const W = SPAN * PXU;
    const wx = (worldX: number) => Math.round((worldX - W0) * PXU);
    px(ctx, 0, 0, W, 20, P.ceil);
    for (let x = 0; x < W; x += 16) px(ctx, x, 0, 1, 20, P.ceilDk);
    px(ctx, 0, 16, W, 4, P.ceilDk);
    const gap = (cx: number, cw: number) => {
        ctx.clearRect(cx, 0, cw, 20);
        for (let i = 0; i < cw; i += 3) px(ctx, cx + i, 0, 2, 2 + Math.round(rnd() * 6), P.ceilDk);  // broken edge teeth
    };
    gap(wx(-2.2), 62); gap(wx(8.9), 44); gap(wx(14.6), 30);
});

// Main floor cross-section: checkered surface band + concrete slab, with the
// two stolen-floor HOLES cut clean through (the rooms below show through).
const floorTex = pixelTex(SPAN * PXU, 10, (ctx) => {
    const W = SPAN * PXU;
    const wx = (worldX: number) => Math.round((worldX - W0) * PXU);
    px(ctx, 0, 0, W, 10, P.concrete);
    px(ctx, 0, 8, W, 2, P.concreteDk);
    for (let x = 0; x < W; x += 8) px(ctx, x, 0, 8, 5, (x / 8) % 2 === 0 ? P.tileA : P.tileB);  // checker band
    px(ctx, 0, 0, W, 1, P.tileEdge);
    for (let x = 0; x < W; x += 8) px(ctx, x, 0, 1, 5, P.grout);
    // cracks + stains on the tiles
    for (let i = 0; i < 26; i++) px(ctx, Math.round(rnd() * W), Math.round(rnd() * 4), 2 + Math.round(rnd() * 6), 1, P.grout);
    ctx.globalAlpha = 0.6;
    px(ctx, wx(2.2), 0, 30, 4, P.bloodDk);                                   // pool by the desk
    px(ctx, wx(4.1), 1, 26, 2, P.bloodDk);                                   // drag trail → hole
    ctx.globalAlpha = 1;
    // the HOLES (clean through the slab) + bent rebar across them
    const hole = (cx: number, cw: number) => {
        ctx.clearRect(cx, 0, cw, 10);
        for (let i = 0; i < cw; i += 4) px(ctx, cx + i, 0, 2, 1 + Math.round(rnd() * 3), P.concreteDk); // ragged lip
        px(ctx, cx + 3, 4, Math.round(cw * 0.45), 1, P.rebar);
        px(ctx, cx + cw - 3 - Math.round(cw * 0.3), 6, Math.round(cw * 0.3), 1, P.rebar);
    };
    hole(wx(5.4), 26); hole(wx(-2.6), 16);
});

// Lower floor 1 (cutaway): a dark wrecked corridor under the slab.
const low1H = 3.6;
const low1Tex = pixelTex(SPAN * PXU, low1H * PXU, (ctx) => {
    const W = SPAN * PXU, H = low1H * PXU;
    const wx = (worldX: number) => Math.round((worldX - W0) * PXU);
    px(ctx, 0, 0, W, H, P.low1);
    for (let x = 20; x < W; x += 80) {                                       // support columns
        px(ctx, x, 0, 8, H, P.low1Wall); px(ctx, x, 0, 2, H, P.low1Lt);
    }
    px(ctx, 0, 2, W, 2, P.pipeDk); px(ctx, 0, 6, W, 1, P.pipe);              // pipes under the slab
    for (let x = 30; x < W; x += 110) px(ctx, x, 2, 1, 8, P.pipeDk);
    const door = (cx: number) => { px(ctx, cx, H - 40, 22, 40, P.low1Door); px(ctx, cx, H - 40, 22, 2, P.low1Lt); };
    door(wx(-9.4)); door(wx(0.2)); door(wx(11.2));                           // dark doorways
    for (let i = 0; i < 18; i++) {                                           // debris mounds
        const mx = Math.round(rnd() * W);
        px(ctx, mx, H - 5 - Math.round(rnd() * 4), 5 + Math.round(rnd() * 10), 6, rnd() > 0.5 ? P.low1Wall : P.low1Lt);
    }
    // blood dripped through the big hole above, running down the back wall
    px(ctx, wx(6.2), 0, 2, Math.round(H * 0.55), P.bloodDk);
    px(ctx, wx(6.2) - 1, Math.round(H * 0.55), 4, 3, P.blood);
});

// Lower floor 2: deeper, almost silhouette — arches fading into the dark.
const low2H = 3.0;
const low2Tex = pixelTex(SPAN * PXU, low2H * PXU, (ctx) => {
    const W = SPAN * PXU, H = low2H * PXU;
    px(ctx, 0, 0, W, H, P.low2);
    for (let x = 8; x < W; x += 56) {
        px(ctx, x, 8, 30, H - 8, P.low2Arch);
        px(ctx, x + 4, 14, 22, H - 14, P.low2);
    }
    ctx.globalAlpha = 0.5; px(ctx, 0, H - 10, W, 10, '#000'); ctx.globalAlpha = 1;   // fade to void
});

const slabTex = pixelTex(64, 8, (ctx) => {
    px(ctx, 0, 0, 64, 8, P.concrete);
    px(ctx, 0, 0, 64, 1, P.concreteDk); px(ctx, 0, 6, 64, 2, P.concreteDk);
    for (let i = 0; i < 9; i++) px(ctx, Math.round(rnd() * 60), 2 + Math.round(rnd() * 3), 3, 1, P.concreteDk);
});
slabTex.wrapS = THREE.RepeatWrapping;

// ── Prop sprites ──────────────────────────────────────────────────────────────

// The back door (porta de fundo): dark double door, ajar on void, boarded shut.
const backDoorTex = pixelTex(36, 60, (ctx) => {
    ctx.clearRect(0, 0, 36, 60);
    px(ctx, 0, 0, 36, 60, P.woodDk);                       // frame
    px(ctx, 2, 2, 15, 58, P.wood); px(ctx, 19, 2, 15, 58, P.wood);
    px(ctx, 16, 4, 4, 56, P.voidDk);                       // ajar gap, pure dark
    px(ctx, 5, 28, 2, 4, P.metalDk); px(ctx, 29, 28, 2, 4, P.metalDk);   // handles
    for (let y = 6; y < 58; y += 10) { px(ctx, 2, y, 15, 1, P.woodDk); px(ctx, 19, y, 15, 1, P.woodDk); }
    const board = (yy: number, rot: number) => {
        ctx.save(); ctx.translate(18, yy); ctx.rotate(rot);
        px(ctx, -19, -3, 38, 6, P.plank); px(ctx, -19, -3, 38, 1, '#b08a52');
        px(ctx, -15, -1, 2, 2, P.nail); px(ctx, 13, -1, 2, 2, P.nail);
        ctx.restore();
    };
    board(14, -0.22); board(30, 0.18); board(46, -0.12);
    for (let i = 0; i < 4; i++) crackAt(ctx, 4 + rnd() * 28, 8 + rnd() * 40, 6, rnd() * Math.PI);
});
const saidaTex = pixelTex(26, 10, (ctx) => {
    px(ctx, 0, 0, 26, 10, P.panel);
    ctx.fillStyle = P.red; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAÍDA', 13, 6);
});

// The lobby's reception desk, tipped over; gold plaque still on it.
const deskTex = pixelTex(64, 30, (ctx) => {
    ctx.clearRect(0, 0, 64, 30);
    ctx.save(); ctx.translate(30, 18); ctx.rotate(-0.21);
    px(ctx, -26, -10, 52, 20, P.wains);                    // body
    px(ctx, -28, -13, 56, 4, P.wainsLt);                   // counter top
    px(ctx, -20, -6, 12, 10, P.wainsDk);                   // drawer fallen open
    px(ctx, -2, -7, 22, 6, P.header);                      // plaque
    ctx.fillStyle = P.gold; ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RECEPÇÃO', 9, -4);
    ctx.restore();
    px(ctx, 4, 24, 10, 6, P.paper); px(ctx, 14, 26, 8, 4, P.paper);          // spilled papers
    px(ctx, 50, 25, 9, 5, P.paper); px(ctx, 52, 26, 4, 2, P.bloodDk);        // ...one stained
});

// The lobby plant, dead, pot cracked and tipped.
const deadPlantTex = pixelTex(22, 24, (ctx) => {
    ctx.clearRect(0, 0, 22, 24);
    ctx.save(); ctx.translate(11, 19); ctx.rotate(0.32);
    px(ctx, -5, -4, 10, 8, P.pot); px(ctx, -6, -5, 12, 3, P.potDk);
    crackAt(ctx, -2, -2, 5, 1.2);
    ctx.restore();
    px(ctx, 8, 2, 2, 12, P.leafDeadDk);                    // wilted stems
    px(ctx, 6, 4, 4, 2, P.leafDead); px(ctx, 11, 6, 5, 2, P.leafDead);
    px(ctx, 4, 8, 4, 2, P.leafDeadDk); px(ctx, 13, 9, 4, 2, P.leafDeadDk);
    px(ctx, 2, 20, 6, 2, P.leafDead);                      // fallen leaves
});

// Rubble pile (reused at several spots, flipped/scaled).
const rubbleTex = pixelTex(40, 14, (ctx) => {
    ctx.clearRect(0, 0, 40, 14);
    for (let i = 0; i < 26; i++) {
        const bx = Math.round(rnd() * 34), by = 4 + Math.round(rnd() * 8);
        px(ctx, bx, by, 3 + Math.round(rnd() * 5), 3 + Math.round(rnd() * 3),
            [P.concrete, P.concreteDk, P.brick, P.woodDk][Math.floor(rnd() * 4)]);
    }
    px(ctx, 6, 2, 12, 2, P.rebar); px(ctx, 24, 5, 10, 2, P.woodDk);
});

// A ceiling tile leaning against the floor.
const shardTex = pixelTex(24, 20, (ctx) => {
    ctx.clearRect(0, 0, 24, 20);
    ctx.save(); ctx.translate(12, 10); ctx.rotate(0.5);
    px(ctx, -10, -7, 20, 14, P.ceil); px(ctx, -10, -7, 20, 2, P.ceilDk); px(ctx, -10, 5, 20, 2, P.ceilDk);
    ctx.restore();
});

// Hanging "SAGUÃO" sign (gold on dark, like downstairs) — one chain snapped.
const saguaoTex = pixelTex(56, 16, (ctx) => {
    px(ctx, 0, 0, 56, 16, P.header);
    px(ctx, 0, 0, 56, 1, P.goldDk); px(ctx, 0, 15, 56, 1, P.goldDk);
    ctx.fillStyle = P.gold; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAGUÃO', 28, 9);
    px(ctx, 30, 0, 14, 1, P.crack);                        // scorch where it tore
});
const chainTex = pixelTex(2, 24, (ctx) => { for (let y = 0; y < 24; y += 3) px(ctx, 0, y, 2, 2, P.metalDk); });

// Broken fluorescent fixture (hangs from its cable, still sputtering).
const fixtureTex = pixelTex(28, 8, (ctx) => {
    px(ctx, 0, 0, 28, 8, P.metalDk);
    px(ctx, 2, 2, 24, 4, P.glow); px(ctx, 2, 2, 24, 1, '#fff7dd');
    px(ctx, 18, 2, 6, 4, P.panel);                         // dead segment
});
const cableTex = pixelTex(2, 20, (ctx) => px(ctx, 0, 0, 2, 20, P.cable));
const glowTex = pixelTex(48, 32, (ctx) => {                // soft cone under the light
    const g = ctx.createRadialGradient(24, 4, 2, 24, 10, 26);
    g.addColorStop(0, 'rgba(255,233,176,0.55)'); g.addColorStop(1, 'rgba(255,233,176,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 48, 32);
});
const sparkTex = pixelTex(6, 6, (ctx) => { ctx.clearRect(0, 0, 6, 6); px(ctx, 2, 0, 2, 6, '#ffe9b0'); px(ctx, 0, 2, 6, 2, '#fff7dd'); });

const moteTex = pixelTex(2, 2, (ctx) => px(ctx, 0, 0, 2, 2, P.wall));
const arrowTex = pixelTex(16, 10, (ctx) => {
    ctx.clearRect(0, 0, 16, 10);
    px(ctx, 1, 4, 10, 2, P.text); px(ctx, 9, 2, 2, 6, P.text); px(ctx, 11, 3, 2, 4, P.text); px(ctx, 13, 4, 2, 2, P.text);
});

// ── Animated bits ─────────────────────────────────────────────────────────────

/** The broken fluorescent: sways on its cable, light sputters, cable sparks. */
const DyingLight: React.FC<{ x: number }> = ({ x }) => {
    const swing = useRef<THREE.Group>(null!);
    const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
    const sparkMat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(rnd() * 10);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        if (swing.current) swing.current.rotation.z = Math.sin(tt * 0.9) * 0.09;
        // sputter: mostly on, with random dropouts (deterministic-ish hash flicker)
        const f = Math.sin(tt * 13.7) * Math.sin(tt * 3.1) > -0.75 ? (0.55 + Math.sin(tt * 31) * 0.1) : 0.04;
        if (glowMat.current) glowMat.current.opacity = f;
        if (sparkMat.current) sparkMat.current.opacity = Math.sin(tt * 17.3) > 0.96 ? 0.9 : 0;
    });
    return (
        <group position={[x, 7.1, -2.8]}>
            <group ref={swing}>
                <S tex={cableTex} w={0.12} h={1.2} x={0} y={-0.6} z={0} />
                <S tex={fixtureTex} w={1.75} h={0.5} x={0} y={-1.3} z={0.02} />
                <mesh position={[0, -2.2, 0.01]}>
                    <planeGeometry args={[3.0, 2.0]} />
                    <meshBasicMaterial ref={glowMat} map={glowTex} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
                </mesh>
            </group>
            <mesh position={[0.05, -0.1, 0.03]}>
                <planeGeometry args={[0.38, 0.38]} />
                <meshBasicMaterial ref={sparkMat} map={sparkTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
};

/** The SAGUÃO sign dangling from its one good chain. */
const HangingSign: React.FC<{ x: number }> = ({ x }) => {
    const g = useRef<THREE.Group>(null!);
    const t = useRef(rnd() * 10);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (g.current) g.current.rotation.z = -0.22 + Math.sin(t.current * 0.7) * 0.05;
    });
    return (
        <group position={[x, 6.9, -6.5]}>
            <group ref={g}>
                <S tex={chainTex} w={0.12} h={1.4} x={1.2} y={-0.7} z={0} transparent />
                <S tex={saguaoTex} w={3.5} h={1.0} x={0} y={-1.8} z={0.02} />
            </group>
            {/* the snapped chain stub on the other side */}
            <S tex={chainTex} w={0.12} h={0.5} x={-1.3} y={-0.25} z={0} transparent rot={0.5} />
        </group>
    );
};

/** Red SAÍDA sign over the back door — buzzing, half dead. */
const ExitSign: React.FC<{ x: number; y: number }> = ({ x, y }) => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (mat.current) mat.current.opacity = Math.sin(t.current * 9.1) * Math.sin(t.current * 2.3) > -0.6 ? 0.95 : 0.25;
    });
    return (
        <mesh position={[x, y, -7.7]}>
            <planeGeometry args={[1.6, 0.62]} />
            <meshBasicMaterial ref={mat} map={saidaTex} transparent opacity={0.95} toneMapped={false} />
        </mesh>
    );
};

/** Dust motes drifting in the ruin (a touch of life). */
const DustMotes: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    const seeds = useMemo(() => Array.from({ length: 8 }, () => ({
        x: W0 + 2 + rnd() * (SPAN - 4), y: 1 + rnd() * 5, sp: 0.3 + rnd() * 0.5, ph: rnd() * 9, amp: 0.4 + rnd() * 0.5,
    })), []);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        seeds.forEach((s, i) => {
            const m = refs.current[i];
            if (!m) return;
            m.position.x = s.x + Math.sin(t.current * s.sp + s.ph) * s.amp;
            m.position.y = s.y + Math.sin(t.current * s.sp * 0.7 + s.ph * 2) * s.amp * 0.6;
            (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t.current * 1.3 + s.ph) * 0.2;
        });
    });
    return (
        <group>
            {seeds.map((s, i) => (
                <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[s.x, s.y, -0.5]}>
                    <planeGeometry args={[0.07, 0.07]} />
                    <meshBasicMaterial map={moteTex} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
};

/** Smoke crawling out of the ceiling collapse. */
const SmokeWisps: React.FC = () => {
    const a = useRef<THREE.Mesh>(null!), b = useRef<THREE.Mesh>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        if (a.current) { a.current.position.x = -1.5 + ((tt * 0.25) % 4); (a.current.material as THREE.MeshBasicMaterial).opacity = 0.22 - (((tt * 0.25) % 4) / 4) * 0.18; }
        if (b.current) { b.current.position.x = 9.5 + ((tt * 0.18 + 2) % 3.4); (b.current.material as THREE.MeshBasicMaterial).opacity = 0.2 - (((tt * 0.18 + 2) % 3.4) / 3.4) * 0.16; }
    });
    return (
        <group>
            <mesh ref={a} position={[-1.5, 7.6, -7.4]}><planeGeometry args={[2.4, 0.9]} /><meshBasicMaterial map={smokeTex} transparent opacity={0.2} depthWrite={false} toneMapped={false} /></mesh>
            <mesh ref={b} position={[9.5, 7.8, -7.4]}><planeGeometry args={[1.9, 0.7]} /><meshBasicMaterial map={smokeTex} transparent opacity={0.18} depthWrite={false} toneMapped={false} /></mesh>
        </group>
    );
};

// ── Scene ─────────────────────────────────────────────────────────────────────
const CX = (W0 + W1) / 2;   // wall/floor strips center

export const Floor4Scene2D: React.FC<{ doorOpenRef?: React.MutableRefObject<number> }> = ({ doorOpenRef }) => {
    const slab2 = React.useMemo(() => { const t = slabTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(SPAN / 4, 1); return t; }, []);
    return (
        <group>
            {/* DUSK SKY — bleeds in through the collapsed ceiling */}
            <S tex={skyTex} w={SPAN + 6} h={24} x={CX} y={8} z={-12} />

            {/* RUINED LOBBY BACK WALL (all destruction + graffiti baked in) */}
            <S tex={wallTex} w={SPAN} h={wallH} x={CX} y={wallH / 2} z={-8} transparent />

            {/* CEILING strip with collapse gaps; smoke drifts out of them */}
            <S tex={ceilTex} w={SPAN} h={1.25} x={CX} y={7.5 + 0.625 - 0.55} z={-7.5} transparent />
            <SmokeWisps />

            {/* BACK DOOR (porta de fundo) — boarded shut, ajar on darkness */}
            <S tex={backDoorTex} w={2.25} h={3.75} x={11.5} y={1.875} z={-7.8} transparent />
            <ExitSign x={11.5} y={4.35} />

            {/* MAIN FLOOR cross-section (checker band + slab) with the torn HOLES */}
            <S tex={floorTex} w={SPAN} h={0.625} x={CX} y={-0.3125} z={-2} transparent />

            {/* THE FLOORS BELOW (cutaway): wrecked corridor, then near-silhouette */}
            <S tex={low1Tex} w={SPAN} h={3.6} x={CX} y={-0.625 - 1.8} z={-5} />
            <S tex={slab2} w={SPAN} h={0.5} x={CX} y={-4.475} z={-4.6} />
            <S tex={low2Tex} w={SPAN} h={3.0} x={CX} y={-4.725 - 1.5} z={-5} />
            <mesh position={[CX, -9.7, -4.5]}><planeGeometry args={[SPAN + 6, 5]} /><meshBasicMaterial color={'#060406'} toneMapped={false} /></mesh>

            {/* WRECKAGE on the main floor */}
            <S tex={deskTex} w={4} h={1.875} x={3.1} y={0.9} z={-3} transparent />
            <S tex={shardTex} w={1.5} h={1.25} x={0.6} y={0.6} z={-2.6} transparent />
            <S tex={shardTex} w={1.2} h={1.0} x={9.8} y={0.5} z={-2.6} transparent flipX />
            <S tex={rubbleTex} w={2.5} h={0.875} x={-4.7} y={0.42} z={-1.8} transparent />
            <S tex={rubbleTex} w={3.2} h={1.1} x={7.9} y={0.53} z={-1.8} transparent flipX />
            <S tex={rubbleTex} w={2.0} h={0.7} x={13.4} y={0.34} z={-1.8} transparent />
            {/* collapsed rubble MOUND sealing the world's right end (stacked piles) */}
            <S tex={rubbleTex} w={4.6} h={1.6} x={15.1} y={0.78} z={-1.7} transparent />
            <S tex={rubbleTex} w={3.6} h={1.35} x={15.4} y={1.85} z={-1.7} transparent flipX />
            <S tex={rubbleTex} w={2.6} h={1.0} x={15.6} y={2.7} z={-1.7} transparent />
            <S tex={shardTex} w={1.6} h={1.35} x={14.3} y={0.65} z={-1.6} transparent flipX />
            <S tex={deadPlantTex} w={1.35} h={1.5} x={-3.5} y={0.75} z={-2.4} transparent />

            {/* dangling SAGUÃO sign + the dying fluorescent light */}
            <HangingSign x={-5.1} />
            <DyingLight x={0.4} />
            <DustMotes />

            {/* THE ELEVATOR — untouched. Always untouched. */}
            <Floor4Elevator2D position={[FLOOR4_ELEVATOR_X, 0, -1]} openRef={doorOpenRef} />

            {/* go-right hint by the doorway */}
            <S tex={arrowTex} w={1.0} h={0.6} x={-5.9} y={1.15} z={0.1} transparent />
        </group>
    );
};

export default Floor4Scene2D;
