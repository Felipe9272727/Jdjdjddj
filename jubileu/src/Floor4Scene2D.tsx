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
import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';
import { Floor4Elevator2D } from './Floor4Elevator';
import { f4, F4_POINTS, F4_LIGHT_PATTERN, f4RunnerDone, f4SkeletonRisen, f4Cam } from './f4Lore';
import { playF4Slam, playF4Lock, playF4Bones, playF4Strike, startF4Hum, stopF4Hum } from './floor4Sfx';

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
    // baked AO — the wall sinks into shadow toward the floor line
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 10; i++) px(ctx, 0, H - 2 - i * 2, W, 2 + i * 2, '#1d140f');
    ctx.globalAlpha = 1;
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

// The back door (porta de fundo): dark double door, ajar on void. The three
// BOARDS are separate sprites now (the puzzles tear them off one by one).
const backDoorTex = pixelTex(36, 60, (ctx) => {
    ctx.clearRect(0, 0, 36, 60);
    px(ctx, 0, 0, 36, 60, P.woodDk);                       // frame
    px(ctx, 2, 2, 15, 58, P.wood); px(ctx, 19, 2, 15, 58, P.wood);
    px(ctx, 16, 4, 4, 56, P.voidDk);                       // ajar gap, pure dark
    px(ctx, 5, 28, 2, 4, P.metalDk); px(ctx, 29, 28, 2, 4, P.metalDk);   // handles
    for (let y = 6; y < 58; y += 10) { px(ctx, 2, y, 15, 1, P.woodDk); px(ctx, 19, y, 15, 1, P.woodDk); }
    for (let i = 0; i < 4; i++) crackAt(ctx, 4 + rnd() * 28, 8 + rnd() * 40, 6, rnd() * Math.PI);
});
const boardTex = pixelTex(40, 8, (ctx) => {
    ctx.clearRect(0, 0, 40, 8);
    px(ctx, 0, 1, 40, 6, P.plank); px(ctx, 0, 1, 40, 1, '#b08a52'); px(ctx, 0, 6, 40, 1, P.woodDk);
    px(ctx, 4, 3, 2, 2, P.nail); px(ctx, 34, 3, 2, 2, P.nail);
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

// Distant ruined skyline (seen above the wall / through the ceiling gaps) —
// dark towers against the dusk, a few windows still weakly lit.
const skylineTex = pixelTex(180, 40, (ctx) => {
    ctx.clearRect(0, 0, 180, 40);
    let bx = 0;
    while (bx < 176) {
        const bw = 10 + Math.round(rnd() * 16), bh = 10 + Math.round(rnd() * 26);
        px(ctx, bx, 40 - bh, bw, bh, '#1d0e14');
        px(ctx, bx, 40 - bh, bw, 1, '#2a141d');                               // dusk rim light
        if (rnd() > 0.6) px(ctx, bx + Math.round(bw * 0.3), 40 - bh - 3, 2, 3, '#1d0e14');  // antenna
        for (let i = 0; i < 4; i++) if (rnd() > 0.62)
            px(ctx, bx + 2 + Math.round(rnd() * (bw - 5)), 43 - bh + Math.round(rnd() * (bh - 8)), 2, 2, rnd() > 0.5 ? '#4a2630' : '#6e3a44');
        bx += bw + 2 + Math.round(rnd() * 6);
    }
});

// Soft radial aura (the elevator's warmth on the wall behind it).
const auraTex = pixelTex(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,233,176,0.5)'); g.addColorStop(1, 'rgba(255,233,176,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
});

// Flattened light pool (the fluorescent's flicker hitting the tiles).
const poolTex = pixelTex(64, 16, (ctx) => {
    ctx.clearRect(0, 0, 64, 16);
    ctx.save(); ctx.translate(32, 8); ctx.scale(1, 0.25);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,233,176,0.5)'); g.addColorStop(1, 'rgba(255,233,176,0)');
    ctx.fillStyle = g; ctx.fillRect(-32, -32, 64, 64);
    ctx.restore();
});

// Gloom with a soft left edge (no more hard darkness wall).
const gloomTex = pixelTex(64, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 17, 0);
    g.addColorStop(0, 'rgba(5,3,10,0)'); g.addColorStop(1, 'rgba(5,3,10,1)');
    ctx.clearRect(0, 0, 64, 8);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 8);
});

// Foreground silhouettes (z in FRONT of the player, negative parallax).
const foreCableTex = pixelTex(2, 64, (ctx) => { ctx.clearRect(0, 0, 2, 64); px(ctx, 0, 0, 2, 64, '#0b0709'); });
const foreBeamTex = pixelTex(56, 8, (ctx) => {
    ctx.clearRect(0, 0, 56, 8);
    px(ctx, 0, 1, 56, 6, '#0d0709'); px(ctx, 0, 1, 56, 1, '#1a1014');
    px(ctx, 12, 0, 3, 8, '#0d0709'); px(ctx, 38, 0, 3, 8, '#0d0709');         // splinters
});

// ── Lore/puzzle props (FLOOR4_LORE.md) ────────────────────────────────────────

// Diary page on the ground (picked up via the interact layer).
const pageTex = pixelTex(12, 14, (ctx) => {
    ctx.clearRect(0, 0, 12, 14);
    px(ctx, 1, 1, 10, 12, P.paper);
    px(ctx, 1, 1, 10, 1, '#fff8e8'); px(ctx, 9, 11, 2, 2, '#cfc5ab');     // fold
    for (let y = 4; y < 11; y += 2) px(ctx, 3, y, 6, 1, '#8a816b');       // scrawled lines
});

// Reception bell, fallen beside the desk.
const bellTex = pixelTex(14, 12, (ctx) => {
    ctx.clearRect(0, 0, 14, 12);
    px(ctx, 3, 2, 8, 6, P.gold); px(ctx, 2, 4, 10, 3, P.gold);
    px(ctx, 3, 2, 8, 1, '#ffe9a0'); px(ctx, 2, 6, 10, 1, P.goldDk);
    px(ctx, 6, 0, 2, 2, P.goldDk);                                        // plunger
    px(ctx, 1, 8, 12, 2, P.metalDk);                                      // base
    px(ctx, 0, 10, 14, 2, P.voidDk);                                      // shadow
});

// Breaker box on the wall (closed → green LED variant when solved).
function breakerBox(solved: boolean): THREE.CanvasTexture {
    return pixelTex(20, 26, (ctx) => {
        px(ctx, 0, 0, 20, 26, P.metalDk);
        px(ctx, 1, 1, 18, 24, '#454c57');
        px(ctx, 1, 1, 18, 2, '#5c6571');
        for (let i = 0; i < 4; i++) px(ctx, 4 + i * 4, 8, 2, 9, '#22262d');   // lever slots
        px(ctx, 3, 20, 14, 3, P.gold); px(ctx, 3, 20, 7, 3, '#1d1f24');      // hazard stripe
        px(ctx, 15, 3, 3, 3, solved ? '#46e06a' : '#7d2424');                // status LED
    });
}
const breakerTexOff = breakerBox(false);
const breakerTexOn = breakerBox(true);

// Crooked picture (hides the safe) → fallen + open safe variant.
const safePicTex = pixelTex(26, 20, (ctx) => {
    ctx.clearRect(0, 0, 26, 20);
    px(ctx, 0, 0, 26, 20, P.goldDk); px(ctx, 2, 2, 22, 16, '#2a2418');
    px(ctx, 5, 5, 16, 8, '#3d3526'); crackAt(ctx, 8, 7, 9, 0.6);          // torn canvas
});
const safeOpenTex = pixelTex(26, 24, (ctx) => {
    ctx.clearRect(0, 0, 26, 24);
    px(ctx, 0, 0, 26, 24, P.metalDk);                                      // safe body
    px(ctx, 2, 2, 22, 20, '#0a0b10');                                      // open mouth, dark
    px(ctx, 3, 3, 4, 18, '#454c57'); px(ctx, 3, 3, 4, 2, '#5c6571');       // swung door
    px(ctx, 10, 14, 8, 6, P.paper);                                        // the photo inside
});

// Hidden mural (revealed by P1): the building, floor 4 crossed out.
const muralTex = pixelTex(64, 44, (ctx) => {
    ctx.clearRect(0, 0, 64, 44);
    ctx.globalAlpha = 0.85;
    px(ctx, 18, 2, 28, 40, P.crack);                                       // building outline
    px(ctx, 20, 4, 24, 36, P.wall);
    for (let f = 0; f < 5; f++) {
        px(ctx, 20, 4 + f * 7, 24, 1, P.crack);                            // floor lines
        ctx.fillStyle = P.crack; ctx.font = 'bold 5px monospace'; ctx.textAlign = 'left';
        ctx.fillText(String(5 - f), 14, 10 + f * 7);
    }
    // the 4th floor scratched out in dried blood
    px(ctx, 20, 11, 24, 6, P.bloodDk);
    ctx.strokeStyle = P.blood; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, 11); ctx.lineTo(44, 17); ctx.moveTo(44, 11); ctx.lineTo(20, 17); ctx.stroke();
    // arrow pointing below the building
    px(ctx, 31, 40, 2, 3, P.bloodDk);
    ctx.globalAlpha = 1;
});

// The PHOTO inside the safe: the original lobby, intact and warm (P3 payoff).
// Exported as a data URL — the interact layer shows it full-screen.
export const lobbyPhotoUrl: string = (() => {
    const t = pixelTex(192, 108, (ctx) => {
        px(ctx, 0, 0, 192, 108, '#e7dcc0');                                // clean wallpaper
        for (let x = 0; x < 192; x += 9) px(ctx, x, 0, 1, 108, '#dccfae');
        px(ctx, 0, 0, 192, 8, '#8a6a40');                                  // crown
        px(ctx, 0, 74, 192, 14, '#7d5835'); px(ctx, 0, 74, 192, 2, '#96704a'); // wainscot
        px(ctx, 0, 88, 192, 20, '#c9bc9c');                                // floor
        for (let x = 0; x < 192; x += 12) for (let y = 88; y < 108; y += 6)
            if (((x / 12 + (y - 88) / 6) % 2) === 0) px(ctx, x, y, 12, 6, '#a99c7e');
        // elevator (gold + silver), pristine
        px(ctx, 18, 22, 44, 66, '#2b3238'); px(ctx, 22, 30, 36, 58, '#B0BEC5');
        px(ctx, 39, 30, 2, 58, '#5b6770');
        px(ctx, 20, 24, 40, 5, '#141414');
        ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 4px monospace'; ctx.textAlign = 'center';
        ctx.fillText('THE NORMAL ELEVATOR', 40, 28);
        // straight SAGUÃO sign
        px(ctx, 86, 16, 40, 11, '#141414');
        ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 7px monospace'; ctx.fillText('SAGUÃO', 106, 24);
        // reception desk upright + bell
        px(ctx, 96, 62, 50, 26, '#7d5835'); px(ctx, 94, 58, 54, 6, '#96704a');
        px(ctx, 104, 66, 34, 5, '#141414');
        ctx.font = 'bold 4px monospace'; ctx.fillStyle = '#FFD54F'; ctx.fillText('RECEPÇÃO', 121, 70);
        px(ctx, 138, 54, 6, 4, '#FFD54F');
        // living plant
        px(ctx, 165, 70, 12, 10, '#b5532e'); px(ctx, 163, 68, 16, 3, '#7e3a20');
        px(ctx, 166, 56, 10, 12, '#4ea04b'); px(ctx, 169, 50, 4, 8, '#357a37');
        // warm ceiling lights
        for (const lx of [40, 106, 168]) { px(ctx, lx - 8, 8, 16, 3, '#fff3d6'); }
        ctx.globalAlpha = 0.1; px(ctx, 0, 8, 192, 50, '#ffdf9e'); ctx.globalAlpha = 1;
        // two guests (whose names are blurred now)
        const guy = (gx: number, shirt: string) => {
            px(ctx, gx, 70, 6, 8, shirt); px(ctx, gx + 1, 64, 4, 6, '#e8b48a');
            px(ctx, gx, 62, 6, 3, '#5a3315'); px(ctx, gx, 78, 6, 8, '#2c3550');
        };
        guy(76, '#3b6fb0'); guy(152, '#a04848');
        // photo border + age
        px(ctx, 0, 0, 192, 2, '#fff'); px(ctx, 0, 106, 192, 2, '#fff');
        px(ctx, 0, 0, 2, 108, '#fff'); px(ctx, 190, 0, 2, 108, '#fff');
        ctx.globalAlpha = 0.12; px(ctx, 0, 0, 192, 108, '#7a5230'); ctx.globalAlpha = 1;
    });
    return (t.image as HTMLCanvasElement).toDataURL();
})();

// ── Animated bits ─────────────────────────────────────────────────────────────

/** The broken fluorescent. While the floor is DEAD it hangs dark and silent —
 *  nothing is energized, nothing blinks, nothing hums (Felipe: "quando está
 *  desligado, não tem nada ligado"). The breaker brings it BACK WRONG: it
 *  carries a CURTO — mains hum plus random shorts, each recovery sputtering a
 *  real fluorescent strike. */
const DyingLight: React.FC<{ x: number }> = ({ x }) => {
    const swing = useRef<THREE.Group>(null!);
    const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
    const sparkMat = useRef<THREE.MeshBasicMaterial>(null!);
    const poolMat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    const nextShort = useRef(1.5);      // when the next curto cuts the light
    const shortUntil = useRef(-1);      // …and until when it stays dark
    const strikeArmed = useRef(false);  // play the sputter once, on recovery
    React.useEffect(() => () => stopF4Hum(), []);   // leaving the lobby kills the hum
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        if (swing.current) swing.current.rotation.z = Math.sin(tt * 0.9) * 0.09;
        let f: number;
        let shorted = false;
        if (f4.powerOn) {
            startF4Hum();                                                  // energized — it hums (idempotent)
            if (tt >= nextShort.current) {                                 // the curto bites…
                shortUntil.current = tt + (Math.random() < 0.3 ? 0.5 : 0.14);
                nextShort.current = shortUntil.current + 2.2 + Math.random() * 4.5;
                strikeArmed.current = true;
            }
            shorted = tt < shortUntil.current;
            if (!shorted && strikeArmed.current) { strikeArmed.current = false; playF4Strike(); }
            f = shorted ? 0.07 : 0.62 + Math.sin(tt * 2.1) * 0.04;
        } else {
            f = 0.03;                                                      // dead floor, dead lamp
        }
        if (glowMat.current) glowMat.current.opacity = f;
        if (poolMat.current) poolMat.current.opacity = f * 0.42;           // the flicker lands on the tiles
        if (sparkMat.current) sparkMat.current.opacity = shorted && Math.sin(tt * 41) > 0 ? 0.9 : 0;
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
            {/* the light pool on the checkered floor, flickering in sync */}
            <mesh position={[0, -7.02, 0.02]}>
                <planeGeometry args={[3.8, 1.0]} />
                <meshBasicMaterial ref={poolMat} map={poolTex} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
            </mesh>
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

/** Manual parallax under the ortho camera: the wrapped layer chases a fraction
 *  of the camera's X. factor > 0 lags (reads as FAR), factor < 0 overshoots
 *  (reads as NEAR). The interactive wall/props stay at factor 0 — gameplay
 *  positions never move. */
const PARA_CX = (W0 + W1) / 2;
const Parallax: React.FC<{ factor: number; children: React.ReactNode }> = ({ factor, children }) => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ camera }) => {
        if (g.current) g.current.position.x = (camera.position.x - PARA_CX) * factor;
    });
    return <group ref={g}>{children}</group>;
};

/** Dust trickling down from the ceiling collapse gaps. */
const FallingDust: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    const seeds = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
        gx: [-2.2, 8.9, 14.6][i % 3] + (rnd() - 0.5) * 1.8,
        sp: 0.8 + rnd() * 1.2, ph: rnd() * 7,
    })), []);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        seeds.forEach((s, i) => {
            const m = refs.current[i];
            if (!m) return;
            const cyc = (t.current * s.sp + s.ph) % 7.4;
            m.position.y = 7.3 - cyc;
            m.position.x = s.gx + Math.sin((t.current + s.ph) * 2.4) * 0.07;
            (m.material as THREE.MeshBasicMaterial).opacity = cyc < 7.1 && m.position.y > 0.12 ? 0.45 : 0;
        });
    });
    return (
        <group>
            {seeds.map((s, i) => (
                <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[s.gx, 7.3, -2.5]}>
                    <planeGeometry args={[0.06, 0.1]} />
                    <meshBasicMaterial map={moteTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
};

/** A torn cable hanging INTO the frame, swinging slowly (foreground layer). */
const ForeCable: React.FC<{ x: number; len: number; ph: number }> = ({ x, len, ph }) => {
    const g = useRef<THREE.Group>(null!);
    const t = useRef(ph);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (g.current) g.current.rotation.z = Math.sin(t.current * 0.55) * 0.07;
    });
    return (
        <group ref={g} position={[x, 8.4, 0]}>
            <S tex={foreCableTex} w={0.1} h={len} x={0} y={-len / 2} z={0} transparent opacity={0.55} />
        </group>
    );
};

/** Foreground dressing — dark silhouettes IN FRONT of the player with negative
 *  parallax: cheap, huge depth. Kept high (y > 2.5) so the play lane stays clear. */
const Foreground: React.FC = () => (
    <Parallax factor={-0.22}>
        <group position={[0, 0, 3.4]}>
            <ForeCable x={-0.8} len={3.0} ph={2.1} />
            <ForeCable x={7.5} len={4.2} ph={5.6} />
            <S tex={foreBeamTex} w={4.6} h={0.55} x={12.9} y={5.9} z={0} transparent rot={-0.55} opacity={0.5} />
            <S tex={foreBeamTex} w={3.6} h={0.45} x={-3.2} y={6.4} z={0} transparent rot={0.35} flipX opacity={0.45} />
        </group>
    </Parallax>
);

/** The pristine elevator's warmth, breathing on the wall behind it. */
const ElevatorAura: React.FC = () => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (mat.current) mat.current.opacity = 0.13 + Math.sin(t.current * 1.3) * 0.05;
    });
    return (
        <mesh position={[FLOOR4_ELEVATOR_X, 2.3, -7.6]}>
            <planeGeometry args={[6.4, 7.2]} />
            <meshBasicMaterial ref={mat} map={auraTex} transparent opacity={0.13} depthWrite={false} toneMapped={false} />
        </mesh>
    );
};

/** A diary page on the ground, pulsing with a faint warm glow. */
const PageSprite: React.FC<{ x: number; y: number; z?: number; visible: boolean }> = ({ x, y, z = -2.2, visible }) => {
    const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(rnd() * 9);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (glowMat.current) glowMat.current.opacity = 0.28 + Math.sin(t.current * 2.6) * 0.16;
    });
    if (!visible) return null;
    return (
        <group position={[x, y, z]}>
            <mesh position={[0, 0.08, -0.01]}>
                <planeGeometry args={[1.5, 1.1]} />
                <meshBasicMaterial ref={glowMat} map={glowTex} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
            </mesh>
            <S tex={pageTex} w={0.62} h={0.72} x={0} y={0.05} z={0} transparent />
        </group>
    );
};

// ── GUIDANCE markers ("nada de puzzle que só o criador entende") ─────────────
// A bold gold "!" floats over whatever the player can ACT on right now, and a
// pale "?" over optional flavor examines. Both bob gently to catch the eye.

const drawExcl = (ctx: CanvasRenderingContext2D, ox: number, oy: number, c: string) => {
    px(ctx, 4 + ox, 1 + oy, 3, 9, c);       // bar
    px(ctx, 4 + ox, 12 + oy, 3, 3, c);      // dot
};
const exclTex = pixelTex(11, 17, (ctx) => {
    ctx.clearRect(0, 0, 11, 17);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawExcl(ctx, ox, oy, P.header);
    drawExcl(ctx, 0, 0, P.gold);
});
const drawQuest = (ctx: CanvasRenderingContext2D, ox: number, oy: number, c: string) => {
    px(ctx, 3 + ox, 1 + oy, 5, 2, c);       // top
    px(ctx, 2 + ox, 3 + oy, 2, 2, c);       // left shoulder
    px(ctx, 7 + ox, 3 + oy, 2, 3, c);       // right side
    px(ctx, 5 + ox, 6 + oy, 3, 2, c);       // curve in
    px(ctx, 5 + ox, 8 + oy, 2, 2, c);       // stem
    px(ctx, 5 + ox, 12 + oy, 2, 2, c);      // dot
};
const questTex = pixelTex(11, 16, (ctx) => {
    ctx.clearRect(0, 0, 11, 16);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawQuest(ctx, ox, oy, P.header);
    drawQuest(ctx, 0, 0, '#cfc3a5');
});

const Marker: React.FC<{ x: number; y: number; kind: 'must' | 'info' }> = ({ x, y, kind }) => {
    const ref = useRef<THREE.Group>(null!);
    const t = useRef(rnd() * 7);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (ref.current) ref.current.position.y = y + Math.sin(t.current * 3) * 0.09;
    });
    return (
        <group ref={ref} position={[x, y, 0.4]}>
            {kind === 'must' && (
                <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[1.1, 1.3]} />
                    <meshBasicMaterial map={glowTex} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
                </mesh>
            )}
            <S tex={kind === 'must' ? exclTex : questTex} w={kind === 'must' ? 0.46 : 0.4} h={kind === 'must' ? 0.7 : 0.58} x={0} y={0} z={0} transparent opacity={kind === 'must' ? 1 : 0.58} />
        </group>
    );
};

/** Where each marker floats (above its prop; defaults to head height). */
const MARKER_Y: Record<string, number> = {
    // lobby
    hole: 1.15, bell: 1.85, paper: 2.1, safe: 4.2, door: 4.15, door_unlock: 4.15, door_enter: 4.15,
    page1: 1.05, page3: 1.05, page4: 1.05,
    sign: 1.8, deadpanel: 3.5, plant: 1.95, light: 1.8, tally: 1.75, desk: 2.3, drag: 1.15, bones: 2.1, mural: 1.95,
    // basement
    climb: 2.5, page2: 1.05, pipes: 1.9, lamp: 2.7, generator: 2.9, genhum: 2.9, dark: 1.8,
    // beyond
    floorless: 1.5, keeper: 2.1, picture: 4.2, back: 4.15,
};

/** Computed every render (the parent re-renders the scene on lore changes). */
function markerList(): Array<{ id: string; x: number; y: number; kind: 'must' | 'info' }> {
    const out: Array<{ id: string; x: number; y: number; kind: 'must' | 'info' }> = [];
    for (const p of F4_POINTS) {
        if (p.room !== f4.room) continue;
        if (p.when && !p.when()) continue;
        if (p.id === 'elevator') continue;                       // a "?" there invites an accidental exit
        let kind: 'must' | 'info' = p.kind === 'examine' ? 'info' : 'must';
        if (p.kind === 'bell' && f4.bellSolved) continue;        // solved — still rings, no longer flagged
        if (p.id === 'door') kind = 'info';                      // locked — pushing only tells you it's locked
        if (p.kind === 'descend' && f4.powerOn) kind = 'info';   // chain moved on; hole stays browsable
        if (p.kind === 'climb' && !f4.powerOn) kind = 'info';    // first deal with the generator
        if (p.id === 'back') kind = 'info';                      // the move out here is the keeper
        if (p.kind === 'leave') {
            if (!f4.finished) continue;                          // no flag luring players out early
            kind = 'must';                                       // arc done — going home IS the move
        }
        out.push({ id: p.id, x: p.x, y: MARKER_Y[p.id] ?? 1.7, kind });
    }
    return out;
}

/** Right-side gloom — the dark half of the floor until the breaker is solved. */
const Gloom: React.FC = () => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame((_, dt) => {
        if (!mat.current) return;
        const target = f4.powerOn ? 0 : 0.58;
        mat.current.opacity += (target - mat.current.opacity) * Math.min(1, dt * 1.4);
    });
    return (
        <mesh position={[10.9, 1.5, 3]}>
            <planeGeometry args={[12.6, 30]} />
            <meshBasicMaterial ref={mat} map={gloomTex} transparent opacity={0.58} depthWrite={false} toneMapped={false} />
        </mesh>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// NEW STORY PROPS — the Zelador, the guest of 404, the bell stand, the rooms
// ════════════════════════════════════════════════════════════════════════════

// Heavy padlock + chain (the Zelador's work).
const padlockTex = pixelTex(14, 18, (ctx) => {
    ctx.clearRect(0, 0, 14, 18);
    px(ctx, 4, 1, 6, 2, P.metalDk); px(ctx, 3, 2, 2, 6, P.metalDk); px(ctx, 9, 2, 2, 6, P.metalDk);   // shackle
    px(ctx, 1, 8, 12, 9, '#8a8f99'); px(ctx, 1, 8, 12, 2, '#aab0bb'); px(ctx, 1, 15, 12, 2, '#5c6371');
    px(ctx, 6, 11, 2, 4, '#16181d');                                                                  // keyhole
});
const chainLinkTex = pixelTex(3, 20, (ctx) => {
    ctx.clearRect(0, 0, 3, 20);
    for (let y = 0; y < 20; y += 4) px(ctx, 0, y, 3, 3, P.metalDk);
});

// The ZELADOR — a smiling silhouette in a cap. Two run frames.
function zeladorFrame(stride: 0 | 1): THREE.CanvasTexture {
    return pixelTex(18, 30, (ctx) => {
        ctx.clearRect(0, 0, 18, 30);
        const C = '#0c0810';
        px(ctx, 4, 1, 10, 3, '#080509');                  // cap
        px(ctx, 12, 3, 5, 1, '#080509');                  // brim (faces right)
        px(ctx, 5, 4, 8, 6, C);                           // head
        px(ctx, 8, 8, 4, 1, '#d9a43c');                   // the smile. always the smile.
        px(ctx, 5, 10, 8, 10, C);                         // torso (lean)
        if (stride === 0) {
            px(ctx, 2, 11, 3, 6, C); px(ctx, 13, 13, 3, 6, C);                 // arms pumping
            px(ctx, 3, 20, 3, 8, C); px(ctx, 12, 20, 3, 8, C);                 // legs spread
            px(ctx, 2, 27, 4, 2, C); px(ctx, 12, 27, 4, 2, C);
        } else {
            px(ctx, 13, 11, 3, 6, C); px(ctx, 2, 13, 3, 6, C);
            px(ctx, 7, 20, 3, 8, C); px(ctx, 9, 19, 3, 7, C);                  // pass
            px(ctx, 7, 27, 4, 2, C);
        }
    });
}
const zelA = zeladorFrame(0), zelB = zeladorFrame(1);

// The GUEST OF 404 — a patient skeleton. armOut = offering the slip.
function skeletonFrame(armOut: boolean): THREE.CanvasTexture {
    return pixelTex(24, 34, (ctx) => {
        ctx.clearRect(0, 0, 24, 34);
        const B = '#ddd6c2', BD = '#b3ac96', K = '#14161c';
        px(ctx, 7, 1, 8, 7, B); px(ctx, 7, 1, 8, 1, '#efe9d6');               // skull
        px(ctx, 9, 3, 2, 2, K); px(ctx, 13, 3, 2, 2, K);                      // sockets
        px(ctx, 11, 5, 1, 2, K);                                              // nasal
        px(ctx, 8, 8, 6, 2, BD); px(ctx, 9, 8, 1, 2, K); px(ctx, 12, 8, 1, 2, K);   // jaw + teeth gaps
        px(ctx, 10, 10, 2, 2, BD);                                            // neck
        px(ctx, 10, 12, 2, 8, BD);                                            // spine
        for (let r = 0; r < 3; r++) {                                         // ribs
            px(ctx, 6, 12 + r * 3, 10, 1, B);
            px(ctx, 6, 12 + r * 3, 1, 2, BD); px(ctx, 15, 12 + r * 3, 1, 2, BD);
        }
        px(ctx, 7, 20, 8, 3, B); px(ctx, 9, 21, 1, 2, K); px(ctx, 12, 21, 1, 2, K);  // pelvis
        px(ctx, 8, 23, 2, 8, B); px(ctx, 12, 23, 2, 8, BD);                   // legs
        px(ctx, 6, 31, 4, 2, BD); px(ctx, 12, 31, 4, 2, BD);                  // feet
        px(ctx, 5, 12, 2, 9, BD); px(ctx, 5, 21, 2, 2, B);                    // left arm down
        if (armOut) {
            px(ctx, 16, 12, 6, 2, B); px(ctx, 21, 12, 2, 4, B);               // right arm OUT, hand up
        } else {
            px(ctx, 16, 12, 2, 9, BD); px(ctx, 16, 21, 2, 2, B);              // right arm down
        }
    });
}
const skelOffer = skeletonFrame(true), skelRest = skeletonFrame(false);
const slipTex = pixelTex(8, 10, (ctx) => {
    ctx.clearRect(0, 0, 8, 10);
    px(ctx, 0, 0, 8, 10, P.paper); px(ctx, 0, 0, 8, 1, '#fff8e8');
    px(ctx, 1, 3, 6, 1, '#8a816b'); px(ctx, 1, 5, 6, 1, '#8a816b'); px(ctx, 2, 7, 4, 1, P.bloodDk);
});

// Bell STAND (crate) — the guest's tally carved on its face: ||||  + a half 5th.
const crateTex = pixelTex(22, 18, (ctx) => {
    ctx.clearRect(0, 0, 22, 18);
    px(ctx, 0, 2, 22, 16, P.wood); px(ctx, 0, 2, 22, 2, P.plank);
    px(ctx, 0, 16, 22, 2, P.woodDk); px(ctx, 0, 2, 2, 16, P.woodDk); px(ctx, 20, 2, 2, 16, P.woodDk);
    for (let i = 0; i < 4; i++) px(ctx, 5 + i * 3, 7, 1, 7, P.crack);          // four tallies
    px(ctx, 17, 7, 1, 3, P.crack);                                             // the interrupted 5th
});

// ── BASEMENT (generator room) ─────────────────────────────────────────────────
const B_W0 = -8.5, B_W1 = 10.0, BSPAN = B_W1 - B_W0;
const B_CX = (B_W0 + B_W1) / 2;

const baseWallTex = pixelTex(BSPAN * PXU, 5.2 * PXU, (ctx) => {
    const W = BSPAN * PXU, H = 5.2 * PXU;
    px(ctx, 0, 0, W, H, '#241a1e');
    for (let y = 0; y < H; y += 5) {                                           // brick courses
        const off = (y / 5) % 2 === 0 ? 0 : 5;
        for (let x = -5; x < W; x += 10) {
            px(ctx, x + off, y, 9, 4, rnd() > 0.85 ? '#332227' : '#2e2024');
        }
    }
    ctx.globalAlpha = 0.3;                                                     // moisture creeping up
    for (let i = 0; i < 26; i++) px(ctx, Math.round(rnd() * W), H - 16 + Math.round(rnd() * 14), 3 + Math.round(rnd() * 8), 2 + Math.round(rnd() * 4), '#233026');
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) crackAt(ctx, rnd() * W, rnd() * H * 0.6, 12 + rnd() * 16, Math.PI / 2 + (rnd() - 0.5));
    scrawl(ctx, 'O RITMO', Math.round((3.0 - B_W0) * PXU), 26, 7, '#544238', -0.04);
    scrawl(ctx, '▽▽▽△', Math.round((3.0 - B_W0) * PXU), 38, 8, '#544238', -0.02);   // ▽▽▽△ scratched by the receptionist
});

const basePipesTex = pixelTex(BSPAN * PXU, 12, (ctx) => {
    const W = BSPAN * PXU;
    ctx.clearRect(0, 0, W, 12);
    px(ctx, 0, 1, W, 3, P.pipeDk); px(ctx, 0, 1, W, 1, P.pipe);
    px(ctx, 0, 7, W, 2, P.pipeDk);
    for (let x = 14; x < W; x += 48) { px(ctx, x, 0, 3, 6, P.pipe); px(ctx, x + 1, 5, 1, 7, P.pipeDk); }  // joints + drips
});

const baseFloorTex = pixelTex(BSPAN * PXU, 8, (ctx) => {
    const W = BSPAN * PXU;
    px(ctx, 0, 0, W, 8, P.concreteDk);
    px(ctx, 0, 0, W, 1, '#6e675c');
    for (let i = 0; i < 30; i++) px(ctx, Math.round(rnd() * W), 1 + Math.round(rnd() * 5), 2 + Math.round(rnd() * 5), 1, '#4a443c');
});

/** Generator body — levers mirror f4.levers LIVE in the world sprite. */
function generatorTex(levers: ReadonlyArray<0 | 1>, on: boolean): THREE.CanvasTexture {
    return pixelTex(46, 32, (ctx) => {
        ctx.clearRect(0, 0, 46, 32);
        px(ctx, 1, 6, 44, 24, '#3a4048'); px(ctx, 1, 6, 44, 3, '#4c545e'); px(ctx, 1, 28, 44, 2, '#23262c');
        for (let v = 0; v < 4; v++) px(ctx, 4, 12 + v * 4, 6, 1, '#23262c');   // side vents
        px(ctx, 36, 9, 7, 7, '#1d2126'); px(ctx, 38, 11, 3, 3, on ? '#46e06a' : '#7d2424');   // gauge
        for (let i = 0; i < 4; i++) {                                          // the four levers
            const lx = 13 + i * 6;
            px(ctx, lx, 11, 3, 12, '#15181d');
            px(ctx, lx - 1, levers[i] ? 11 : 19, 5, 4, levers[i] ? '#81C784' : '#FF5252');
        }
        px(ctx, 12, 26, 26, 1, P.gold); px(ctx, 12, 26, 13, 1, '#1d1f24');     // hazard stripe
        ctx.fillStyle = '#c9b88a'; ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center';
        ctx.fillText('GERADOR', 23, 5);
        px(ctx, 45, 14, 1, 10, P.cable);                                       // feed exiting right
    });
}

const emergLampTex = pixelTex(12, 14, (ctx) => {
    ctx.clearRect(0, 0, 12, 14);
    px(ctx, 4, 0, 4, 2, P.metalDk);                                            // mount
    px(ctx, 2, 2, 8, 9, '#3a3f46');                                            // housing
    px(ctx, 3, 3, 6, 7, '#ff8866');                                            // bulb
    for (let y = 3; y < 10; y += 2) px(ctx, 2, y, 8, 1, '#23262c');            // cage bars
});

const bulbStringTex = pixelTex(BSPAN * PXU, 8, (ctx) => {
    const W = BSPAN * PXU;
    ctx.clearRect(0, 0, W, 8);
    px(ctx, 0, 1, W, 1, P.cable);
    for (let x = 10; x < W; x += 26) { px(ctx, x, 2, 1, 2, P.cable); px(ctx, x - 1, 4, 3, 3, '#ffd98a'); }
});

/** Warm shaft of light falling through the hole from the lobby above. */
const shaftTex = pixelTex(24, 56, (ctx) => {
    ctx.clearRect(0, 0, 24, 56);
    const g = ctx.createLinearGradient(0, 0, 0, 56);
    g.addColorStop(0, 'rgba(255,225,170,0.4)'); g.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(17, 0); ctx.lineTo(24, 56); ctx.lineTo(0, 56); ctx.closePath(); ctx.fill();
});

// ── BEYOND (the breu) ─────────────────────────────────────────────────────────
const flameFrame = (k: number) => pixelTex(14, 18, (ctx) => {
    ctx.clearRect(0, 0, 14, 18);
    const lobes = [[4, 6, 6, 11], [3, 4, 8, 13], [5, 5, 5, 12]][k];
    px(ctx, lobes[0], lobes[1], lobes[2], lobes[3], '#ff7a2e');                // body
    px(ctx, lobes[0] + 1, lobes[1] + 3, lobes[2] - 2, lobes[3] - 5, '#ffb84d');// core
    px(ctx, 6, lobes[1] + 5, 2, 4, '#fff3c4');                                 // heart
    px(ctx, 5 + k, lobes[1] - 3, 2, 3, '#ff7a2e');                             // licking tip
});
const flameFrames = [flameFrame(0), flameFrame(1), flameFrame(2)];
const logsTex = pixelTex(18, 7, (ctx) => {
    ctx.clearRect(0, 0, 18, 7);
    px(ctx, 1, 3, 16, 3, '#3a2417'); px(ctx, 1, 3, 16, 1, '#54371d');
    px(ctx, 3, 1, 12, 3, '#2c1b10'); px(ctx, 3, 1, 12, 1, '#3f2a18');
    px(ctx, 8, 4, 3, 2, '#ff7a2e');                                            // embers in the stack
});

// The FIRST RECEPTIONIST in the world: slumped by the fire / head up when near.
// Outfit matches the portrait: white shirt sleeves, dark vest, red tie, badge.
function keeperFrame(up: boolean): THREE.CanvasTexture {
    return pixelTex(22, 26, (ctx) => {
        ctx.clearRect(0, 0, 22, 26);
        const VEST = '#23252e', VESTD = '#16171d', SHIRT = '#cfc8b8', RIM = '#e8b070', SKIN = '#cfa178', HAIR = '#2e211a';
        // seated body (facing LEFT, toward the fire)
        px(ctx, 6, 10, 11, 10, VEST);                      // vest torso, slumped forward
        px(ctx, 6, 10, 2, 10, '#3a3d4d');                  // lit lapel edge
        px(ctx, 14, 10, 3, 10, VESTD);
        px(ctx, 8, 11, 2, 4, '#a3242c');                   // the tie, slipping out
        px(ctx, 12, 13, 3, 2, '#e8e2d4');                  // the badge, still pinned
        px(ctx, 5, 18, 13, 4, '#1a1c24');                  // folded legs (dark slacks)
        px(ctx, 3, 19, 5, 3, '#1a1c24');                   // knees toward the fire
        px(ctx, 2, 21, 3, 2, '#0e0f14');                   // shoes
        if (up) {
            px(ctx, 7, 2, 9, 8, SKIN);                     // head raised
            px(ctx, 7, 2, 2, 8, RIM);                      // firelight on the face
            px(ctx, 7, 0, 10, 3, HAIR);                    // dark messy hair
            px(ctx, 6, 2, 2, 4, HAIR); px(ctx, 15, 1, 3, 3, HAIR);
            px(ctx, 9, 5, 2, 2, '#6e3f22');                // the one eye, catching fire
            px(ctx, 12, 4, 5, 3, '#e9e0c6');               // the bandage over the other
            px(ctx, 14, 5, 1, 1, '#8a3a30');               // ...old stain
        } else {
            px(ctx, 8, 5, 9, 7, SKIN);                     // head bowed
            px(ctx, 8, 5, 2, 7, RIM);
            px(ctx, 8, 3, 10, 3, HAIR);                    // hair falling forward
            px(ctx, 7, 5, 2, 3, HAIR); px(ctx, 16, 4, 2, 3, HAIR);
            px(ctx, 13, 8, 5, 3, '#e9e0c6');               // bandage still visible
        }
        px(ctx, 5, 12, 2, 6, SHIRT); px(ctx, 5, 17, 3, 2, SKIN);   // shirt-sleeve arm resting on knee
    });
}
const keeperSit = keeperFrame(false), keeperUp = keeperFrame(true);

// ── THE FIRESIDE SCENE — the dialogue's full-screen cinematic (visual-novel
// style, per Felipe's reference: the breu as a rain-slick back alley of the
// hotel — the dead elevator under a red neon RECEPÇÃO, brick walls eaten by
// vines, one tired wall lamp, the campfire between the PLAYER and the FIRST
// RECEPTIONIST with his cup of coffee). Painted in three real passes:
//   1. ALBEDO   — every surface in its true color, no light baked in;
//   2. LIGHTING — a per-pixel light map (fire + neon + lamp + embers of
//                 ambient), ordered-dithered and quantized so the falloff
//                 bands like proper pixel art;
//   3. EMISSIVE + WET FLOOR — the things that GLOW painted on top, then the
//                 whole scene mirrored into the wet ground, row-jittered.
export const keeperSceneUrl: string = (() => {
    const W = 480, H = 270, FY = 196;                  // FY = where wall meets floor
    const t = pixelTex(W, H, (ctx) => {

        // ════ PASS 1 — ALBEDO (true surface colors, lit later) ════
        // brick wall, the hotel's bare bones
        px(ctx, 0, 0, W, FY, '#6e4a40');
        for (let y = 0; y < FY; y += 8) {
            const off = ((y / 8) % 2) * 8;
            for (let x = -8; x < W; x += 16) {
                const v = rnd();
                px(ctx, x + off, y, 15, 7, v > 0.82 ? '#7e564a' : v > 0.12 ? '#6e4a40' : '#5e3e38');
                if (rnd() > 0.86) px(ctx, x + off + 2, y + 2, 4, 2, '#86604f');   // chipped face
            }
        }
        // mortar shadow lines (subtle, the lighting will eat most of it)
        for (let y = 0; y < FY; y += 8) px(ctx, 0, y + 7, W, 1, '#54382f');
        // moss creeping where the wall sweats
        for (let i = 0; i < 60; i++) {
            const mx = Math.round(rnd() * W), my = Math.round(FY - 60 + rnd() * 58);
            if (rnd() > 0.5) px(ctx, mx, my, 2 + Math.round(rnd() * 3), 2, '#3f5230');
        }

        // THE DEAD ELEVATOR (left) — brushed steel doors, stone frame
        px(ctx, 30, 64, 78, FY - 64, '#4a4138');                       // frame
        px(ctx, 34, 64, 70, 4, '#5a5044');                             // lintel
        px(ctx, 38, 72, 62, FY - 72, '#7e858e');                       // doors
        px(ctx, 67, 72, 4, FY - 72, '#3a3f46');                        // center seam
        for (let y = 76; y < FY - 4; y += 14) {                        // brushed panels
            px(ctx, 41, y, 24, 1, '#8e959e'); px(ctx, 73, y, 24, 1, '#8e959e');
        }
        px(ctx, 38, 72, 2, FY - 72, '#5a6068'); px(ctx, 98, 72, 2, FY - 72, '#5a6068');
        px(ctx, 30, FY - 4, 78, 4, '#3a332c');                         // worn sill
        // the neon housing above it (dark box; the letters glow in pass 3)
        px(ctx, 26, 30, 86, 26, '#241c20'); px(ctx, 26, 30, 86, 2, '#382c30');
        px(ctx, 28, 54, 82, 3, '#1a1316');
        // conduit feeding it, stapled to the brick
        px(ctx, 110, 36, 3, FY - 80, '#3a3134');

        // emergency light box between door and fire
        px(ctx, 124, 84, 12, 8, '#3a3134'); px(ctx, 125, 85, 10, 6, '#241c20');

        // wall lamp (right, high) — iron bracket + dome; bulb glows in pass 3
        px(ctx, 412, 34, 26, 4, '#33302c'); px(ctx, 436, 30, 4, 14, '#33302c');
        px(ctx, 420, 38, 24, 10, '#42423c');                           // dome
        px(ctx, 424, 48, 16, 3, '#33302c');
        // "4º ANDAR" plate under it
        px(ctx, 440, 92, 36, 22, '#2c2e34'); px(ctx, 441, 93, 34, 20, '#1c1e24');

        // vines — off the broken gutter, over the neon, down the right wall
        const vine = (vx: number, vy0: number, len: number, lean: number) => {
            let x = vx;
            for (let y = vy0; y < vy0 + len; y += 2) {
                x += (rnd() - 0.5) * 2 + lean * 0.3;
                px(ctx, Math.round(x), y, 1, 2, '#33482a');
                if (rnd() > 0.45) px(ctx, Math.round(x) + (rnd() > 0.5 ? 1 : -2), y, 2, 2, rnd() > 0.3 ? '#41603a' : '#557a44');
            }
        };
        vine(18, 0, 74, 0.4); vine(118, 0, 46, -0.3); vine(132, 0, 30, 0.2);
        vine(404, 0, 60, -0.4); vine(452, 0, 96, 0.3); vine(470, 0, 70, -0.2);
        vine(446, 54, 40, 0.5);

        // wooden bench by the keeper (his waiting post)
        px(ctx, 368, 158, 100, 6, '#6e5232'); px(ctx, 368, 158, 100, 2, '#83653f');   // backrest
        px(ctx, 368, 172, 100, 7, '#75582f'); px(ctx, 368, 172, 100, 2, '#8a6a40');   // seat
        px(ctx, 372, 179, 5, FY - 179, '#54402a'); px(ctx, 458, 179, 5, FY - 179, '#4a3825');
        px(ctx, 368, 150, 4, 24, '#5e472c'); px(ctx, 464, 150, 4, 24, '#54402a');     // posts

        // FLOOR — big worn flagstones (wet; the mirror comes in pass 3)
        px(ctx, 0, FY, W, H - FY, '#46444c');
        for (let row = 0, y = FY; y < H; row++) {
            const rh = 9 + row * 3;                                    // fake perspective
            for (let x = -6 + (row % 2) * 9; x < W; x += 19 + row * 2) {
                const v = rnd();
                px(ctx, x, y, 17 + row * 2, rh - 1, v > 0.75 ? '#504d56' : v > 0.2 ? '#46444c' : '#3c3a42');
                if (rnd() > 0.8) px(ctx, x + 3, y + 2, 5, 2, '#585560');
            }
            px(ctx, 0, y + rh - 1, W, 1, '#302e36');                   // grout
            y += rh;
        }

        // CAMPFIRE base — stone ring + crossed logs (flames are emissive)
        const FCX = 238, FCY = 224;
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            px(ctx, Math.round(FCX + Math.cos(a) * 30) - 4, Math.round(FCY + 7 + Math.sin(a) * 8) - 2, 8, 5, i % 2 ? '#55504e' : '#615a56');
        }
        ctx.save(); ctx.translate(FCX, FCY + 3); ctx.rotate(0.28);
        px(ctx, -24, -4, 48, 8, '#6e4a28'); px(ctx, -24, -4, 48, 2, '#835c34');
        ctx.restore();
        ctx.save(); ctx.translate(FCX, FCY + 3); ctx.rotate(-0.34);
        px(ctx, -22, -4, 44, 8, '#5e3e22'); px(ctx, -22, -4, 44, 2, '#75502c');
        ctx.restore();

        // ════ THE PLAYER — seated left of the fire, back 3/4 to camera ════
        // (chibi like the reference: big head, hands on knees, soaking the heat)
        const PXx = 144, PFEET = 232;
        px(ctx, PXx - 10, PFEET - 26, 50, 10, '#5e472c');              // his log seat
        px(ctx, PXx - 10, PFEET - 26, 50, 3, '#75582f');
        px(ctx, PXx - 8, PFEET - 16, 6, 16, '#4a3825'); px(ctx, PXx + 32, PFEET - 16, 6, 16, '#42321f');
        // crossed legs in dark jeans, sneakers toward the fire
        px(ctx, PXx + 2, PFEET - 32, 30, 10, '#2c3550');
        px(ctx, PXx + 24, PFEET - 30, 12, 7, '#33405e');
        px(ctx, PXx + 32, PFEET - 27, 9, 6, '#23292f');                // shoe
        // blue hoodie torso, back 3/4 — fire catches his right edge
        px(ctx, PXx, PFEET - 58, 30, 28, '#33608f');
        px(ctx, PXx, PFEET - 58, 6, 28, '#264a72');                    // camera-side shade (albedo)
        px(ctx, PXx + 4, PFEET - 40, 24, 12, '#2c5482');               // hood bunched at his back
        px(ctx, PXx + 6, PFEET - 38, 20, 3, '#264a72');
        px(ctx, PXx - 5, PFEET - 52, 9, 20, '#33608f');                // near arm
        px(ctx, PXx + 26, PFEET - 52, 9, 18, '#3b6fa6');               // far arm to the knee
        px(ctx, PXx + 28, PFEET - 36, 7, 6, '#d8a87e');                // far hand
        // big head from behind: bacon hair, one warm cheek toward the keeper
        px(ctx, PXx + 1, PFEET - 84, 28, 28, '#8a5527');
        px(ctx, PXx + 1, PFEET - 84, 28, 6, '#9c6533');                // crown
        px(ctx, PXx + 4, PFEET - 58, 22, 4, '#7a4a20');                // nape
        px(ctx, PXx + 22, PFEET - 74, 7, 14, '#dca87a');               // cheek
        px(ctx, PXx + 25, PFEET - 80, 4, 6, '#9c6533');                // hair over the temple
        for (let i = 0; i < 5; i++) px(ctx, PXx + 2 + i * 5, PFEET - 87, 3, 4, '#8a5527');   // bacon tufts

        // ════ THE FIRST RECEPTIONIST — standing across the fire, coffee in hand ════
        // (reference pose: upright but easy; vest, tie, badge, the bandage —
        //  and the mug he refills for nobody. Albedo only: the fire lights him.)
        const KX = 318, KFEET = 228;
        // shoes, heels together — a man who still stands like it's a shift
        px(ctx, KX + 2, KFEET - 6, 15, 6, '#23201c'); px(ctx, KX + 2, KFEET - 6, 15, 1, '#3a342c');
        px(ctx, KX + 19, KFEET - 6, 15, 6, '#1f1c19');
        // pressed slacks
        px(ctx, KX + 4, KFEET - 34, 13, 28, '#33364a'); px(ctx, KX + 4, KFEET - 34, 3, 28, '#42465e');
        px(ctx, KX + 19, KFEET - 34, 13, 28, '#2c2f40'); px(ctx, KX + 19, KFEET - 34, 2, 28, '#383c50');
        px(ctx, KX + 6, KFEET - 20, 9, 1, '#42465e'); px(ctx, KX + 21, KFEET - 19, 9, 1, '#383c50');
        // torso: charcoal vest over white shirt
        px(ctx, KX + 2, KFEET - 66, 32, 32, '#3a3d4a');                // vest
        px(ctx, KX + 2, KFEET - 66, 4, 32, '#4a4e60');                 // lapel column
        px(ctx, KX + 29, KFEET - 66, 5, 32, '#2c2e3a');
        px(ctx, KX + 2, KFEET - 36, 32, 2, '#2c2e3a');                 // hem
        // shirt V + tie
        for (let i = 0; i < 9; i++) {
            const half = 7 - Math.floor(i * 0.7);
            px(ctx, KX + 17 - half, KFEET - 66 + i, half * 2 + 1, 1, '#ded8c8');
        }
        px(ctx, KX + 12, KFEET - 67, 11, 3, '#eae4d4');                // collar
        px(ctx, KX + 15, KFEET - 65, 6, 4, '#a3242c');                 // knot
        px(ctx, KX + 15, KFEET - 61, 5, 12, '#a3242c'); px(ctx, KX + 19, KFEET - 61, 1, 12, '#7e161c');
        px(ctx, KX + 16, KFEET - 49, 3, 2, '#8a1d24');                 // tip at the vest
        for (const by of [KFEET - 56, KFEET - 48, KFEET - 41]) px(ctx, KX + 16, by, 2, 2, '#c89a3c');   // brass
        px(ctx, KX + 24, KFEET - 60, 8, 5, '#ded8c8'); px(ctx, KX + 25, KFEET - 58, 6, 1, '#6e675c');   // the badge
        // far arm down the seam; NEAR ARM bent up with the MUG
        px(ctx, KX + 31, KFEET - 64, 6, 22, '#cfc8b6');                // far sleeve
        px(ctx, KX + 32, KFEET - 43, 5, 6, '#d8a87e');                 // far hand
        px(ctx, KX - 3, KFEET - 64, 7, 14, '#dcd6c4');                 // near shoulder/upper arm
        px(ctx, KX - 4, KFEET - 52, 9, 6, '#dcd6c4');                  // forearm coming forward
        px(ctx, KX - 6, KFEET - 54, 7, 7, '#e0ac80');                  // hand around the mug
        px(ctx, KX - 12, KFEET - 58, 9, 10, '#d8d2c2');                // the mug (cream enamel)
        px(ctx, KX - 12, KFEET - 58, 9, 2, '#eae4d4');
        px(ctx, KX - 14, KFEET - 56, 2, 6, '#c4bca8');                 // handle
        px(ctx, KX - 11, KFEET - 57, 7, 1, '#4a3220');                 // the coffee line
        // neck + BIG head, 3/4 toward the fire
        px(ctx, KX + 12, KFEET - 72, 12, 7, '#cf9c72');
        px(ctx, KX + 4, KFEET - 96, 28, 25, '#dca87a');                // face
        px(ctx, KX + 4, KFEET - 96, 5, 25, '#e8bc8c');                 // fire-side profile
        px(ctx, KX + 27, KFEET - 94, 5, 23, '#b8835c');                // far shade (albedo)
        px(ctx, KX + 2, KFEET - 88, 3, 6, '#e8bc8c');                  // nose toward the light
        px(ctx, KX + 2, KFEET - 83, 3, 2, '#b8835c');
        px(ctx, KX + 7, KFEET - 90, 6, 2, '#3a2a22');                  // brow
        px(ctx, KX + 7, KFEET - 87, 5, 3, '#f2ead8'); px(ctx, KX + 9, KFEET - 87, 2, 3, '#43301e');   // the good eye
        px(ctx, KX + 6, KFEET - 84, 7, 1, '#b8835c');                  // eyebag
        px(ctx, KX + 6, KFEET - 77, 8, 1, '#8a5a48'); px(ctx, KX + 13, KFEET - 78, 2, 1, '#a87a58');  // almost-smile
        // bandage over the far eye, around the skull
        px(ctx, KX + 14, KFEET - 90, 17, 6, '#e8e0c6'); px(ctx, KX + 14, KFEET - 90, 17, 1, '#f4eede');
        px(ctx, KX + 14, KFEET - 85, 17, 1, '#aaa288');
        px(ctx, KX + 28, KFEET - 96, 3, 12, '#dcd4ba');
        px(ctx, KX + 19, KFEET - 89, 4, 3, '#8a3a30');                 // the old stain
        // dark tidy-gone-messy hair
        px(ctx, KX + 2, KFEET - 106, 32, 12, '#33241a');
        px(ctx, KX + 2, KFEET - 106, 6, 12, '#4a3320');
        px(ctx, KX + 0, KFEET - 99, 4, 10, '#33241a'); px(ctx, KX + 31, KFEET - 98, 4, 9, '#291d14');
        px(ctx, KX + 6, KFEET - 109, 8, 4, '#33241a'); px(ctx, KX + 18, KFEET - 110, 9, 5, '#291d14');
        px(ctx, KX + 4, KFEET - 96, 9, 3, '#3a2a1e'); px(ctx, KX + 22, KFEET - 97, 9, 4, '#291d14');   // fringe

        // ════ PASS 2 — LIGHTING (per-pixel, dithered, quantized) ════
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        // light sources: x, y, radius, intensity, tint r/g/b
        const LIGHTS: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
            [FCX, FCY - 14, 92, 2.4, 1.00, 0.58, 0.28],                // the fire
            [69, 43, 54, 1.35, 1.00, 0.20, 0.26],                      // RECEPÇÃO neon
            [430, 44, 62, 1.3, 1.00, 0.78, 0.46],                      // wall lamp
            [69, 102, 48, 0.55, 1.00, 0.18, 0.24],                     // …its red wash down the doors
            [130, 88, 24, 0.6, 1.00, 0.16, 0.16],                      // emergency light
            [458, 103, 22, 0.45, 0.85, 0.92, 1.00],                    // andar plate glow
        ];
        const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let mr = 0.016, mg = 0.02, mb = 0.038;                 // the breu: near-black ambient
                for (const [lx, ly, rad, inten, tr, tg, tb] of LIGHTS) {
                    const dx = x - lx, dy = (y - ly) * 1.25;
                    // steeper than inverse-square: each light stays a POOL in the dark
                    const fall = inten * Math.pow(1 / (1 + (dx * dx + dy * dy) / (rad * rad)), 1.8);
                    mr += fall * tr; mg += fall * tg; mb += fall * tb;
                }
                // ordered dither + quantize → banded pixel-art falloff
                const dn = (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.10;
                const q = (m: number) => Math.round(Math.min(1.55, m + dn) * 13) / 13;
                const i = (y * W + x) * 4;
                d[i] = Math.min(255, d[i] * q(mr));
                d[i + 1] = Math.min(255, d[i + 1] * q(mg));
                d[i + 2] = Math.min(255, d[i + 2] * q(mb));
            }
        }
        ctx.putImageData(img, 0, 0);

        // ════ PASS 3 — EMISSIVES (they make their own light) ════
        // RECEPÇÃO — red neon, letter glow + halo
        const halo = (hx: number, hy: number, hr: number, c0: string, a: number) => {
            const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, hr);
            g.addColorStop(0, c0); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = a; ctx.fillStyle = g;
            ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); ctx.globalAlpha = 1;
        };
        halo(69, 43, 60, 'rgba(255,40,60,0.55)', 1);
        ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            ctx.globalAlpha = 0.45; ctx.fillStyle = '#e01a30'; ctx.fillText('RECEPÇÃO', 69 + ox, 44 + oy);
        }
        ctx.globalAlpha = 1; ctx.fillStyle = '#ff5a64'; ctx.fillText('RECEPÇÃO', 69, 44);
        ctx.fillStyle = '#ffc2c8'; ctx.globalAlpha = 0.65; ctx.fillText('RECEPÇÃO', 69, 44); ctx.globalAlpha = 1;
        // emergency light: a mean little red eye
        px(ctx, 127, 86, 4, 3, '#ff3038'); halo(129, 88, 16, 'rgba(255,40,50,0.5)', 0.8);
        // wall lamp: warm bulb + pooled cone
        px(ctx, 428, 46, 8, 5, '#ffe9b0'); px(ctx, 430, 47, 4, 3, '#fff8e0');
        halo(432, 50, 46, 'rgba(255,214,140,0.5)', 0.9);
        // 4º ANDAR plate
        ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#cfe2ee';
        ctx.fillText('4º', 458, 99); ctx.fillText('ANDAR', 458, 108);
        halo(458, 103, 17, 'rgba(190,220,255,0.35)', 0.8);
        // THE FIRE — layered tongues over its own halo
        halo(FCX, FCY - 16, 70, 'rgba(255,150,60,0.55)', 1);
        const flameRow = (yOff: number, half: number, c: string, jx = 0) => px(ctx, FCX - half + jx, FCY - yOff, half * 2, 2, c);
        for (let i = 0; i < 31; i++) {                                 // outer tongue — full at the base
            const k = i / 31;
            const half = Math.max(1, Math.round(23 * Math.pow(1 - k, 0.72) * (0.86 + rnd() * 0.35)));
            flameRow(2 + i * 2, half, '#ff7a2e', Math.round((rnd() - 0.5) * 8 * k));
        }
        for (let i = 0; i < 20; i++) {                                 // core
            const k = i / 20;
            const half = Math.max(1, Math.round(15 * Math.pow(1 - k, 0.8) * (0.88 + rnd() * 0.28)));
            flameRow(2 + i * 2, half, '#ffb84d', Math.round((rnd() - 0.5) * 5 * k));
        }
        for (let i = 0; i < 11; i++) flameRow(2 + i * 2, Math.max(1, Math.round(8 * Math.pow(1 - i / 11, 0.9))), '#fff3c4');
        px(ctx, FCX - 16, FCY - 46, 3, 8, '#ff7a2e'); px(ctx, FCX + 12, FCY - 54, 3, 9, '#ff7a2e');
        px(ctx, FCX + 13, FCY - 60, 2, 5, '#ffb84d');
        // embers drifting up
        for (const [ex, ey, c] of [[FCX - 15, FCY - 58, '#ffb84d'], [FCX + 11, FCY - 70, '#ff9a55'], [FCX - 4, FCY - 86, '#ffd98a'], [FCX + 22, FCY - 50, '#ff9a55'], [FCX - 26, FCY - 76, '#ffd98a'], [FCX + 5, FCY - 102, '#ff9a55'], [FCX + 30, FCY - 92, '#ffd98a']] as const) {
            px(ctx, ex, ey, 2, 2, c);
        }
        // smoke leaning into the dark + steam off the keeper's coffee
        ctx.globalAlpha = 0.2;
        px(ctx, FCX - 7, FCY - 118, 15, 9, '#3a2c30'); px(ctx, FCX + 3, FCY - 134, 19, 10, '#332629'); px(ctx, FCX - 13, FCY - 148, 17, 9, '#2c2124');
        ctx.globalAlpha = 0.5;
        px(ctx, KX - 10, KFEET - 64, 2, 3, '#cfd4dc'); px(ctx, KX - 8, KFEET - 69, 2, 3, '#bfc4cc'); px(ctx, KX - 11, KFEET - 74, 2, 3, '#aab0b8');
        ctx.globalAlpha = 1;

        // ════ WET FLOOR — mirror everything above into the flagstones ════
        const lit = ctx.getImageData(0, 0, W, H);
        const s = lit.data;
        const rowJit: number[] = [];
        for (let y = FY; y < H; y++) rowJit[y] = Math.round((rnd() - 0.5) * 3);
        for (let y = FY + 1; y < H; y++) {
            const depth = (y - FY) / (H - FY);
            const a = 0.46 * Math.pow(1 - depth, 1.4) + 0.08;          // fades with distance
            const sy = Math.max(0, FY - (y - FY) * 2 - 2);             // squashed mirror
            for (let x = 0; x < W; x++) {
                const sx = Math.min(W - 1, Math.max(0, x + rowJit[y] + (BAYER[y & 3][x & 3] > 9 ? 1 : 0)));
                const si = (sy * W + sx) * 4, di = (y * W + x) * 4;
                s[di] = s[di] * (1 - a) + s[si] * a;
                s[di + 1] = s[di + 1] * (1 - a) + s[si + 1] * a;
                s[di + 2] = s[di + 2] * (1 - a) + s[si + 2] * a;
            }
        }
        ctx.putImageData(lit, 0, 0);
        // grout lines re-cut through the shine (keeps it reading as stone)
        ctx.globalAlpha = 0.35;
        for (let row = 0, y = FY; y < H; row++) { const rh = 9 + row * 3; px(ctx, 0, y + rh - 1, W, 1, '#26242c'); y += rh; }
        ctx.globalAlpha = 1;

        // ── baked cinema vignette ──
        for (let i = 0; i < 30; i++) {
            ctx.globalAlpha = 0.055;
            px(ctx, 0, i, W, 1, '#000'); px(ctx, 0, H - 1 - i, W, 1, '#000');
            px(ctx, i, 0, 1, H, '#000'); px(ctx, W - 1 - i, 0, 1, H, '#000');
        }
        ctx.globalAlpha = 1;
    });
    return (t.image as HTMLCanvasElement).toDataURL();
})();
// (kept for reference panels — the close-up bust, no longer the dialogue art)
const _unusedKeeperPortrait = (() => {
    const t = pixelTex(144, 176, (ctx) => {
        /** Checkerboard dither — soft transitions between ramp tones. */
        const dith = (x: number, y: number, w: number, h: number, c: string) => {
            for (let yy = 0; yy < h; yy++) for (let xx = yy % 2; xx < w; xx += 2) px(ctx, x + xx, y + yy, 1, 1, c);
        };

        // ── backdrop: night bricks + the fire's breath from the left ──
        px(ctx, 0, 0, 144, 176, '#0b0708');
        ctx.globalAlpha = 0.5;
        for (let y = 4; y < 176; y += 12) {
            const off = ((y / 12) % 2) * 9;
            for (let x = -9; x < 144; x += 18) px(ctx, x + off, y, 16, 9, '#150d10');
        }
        ctx.globalAlpha = 1;
        for (let x = 0; x < 40; x++) {                       // warm glow, dithered falloff
            ctx.globalAlpha = 0.30 * (1 - x / 40);
            px(ctx, x, 0, 1, 176, '#6e3318');
        }
        ctx.globalAlpha = 1;
        dith(0, 120, 30, 56, '#8a4520');                     // fire flicker low-left

        // ── SHOULDERS & ARMS: white shirt sleeves ──
        // (bust cuts at the chest, arms relaxed — reference pose)
        px(ctx, 6, 118, 42, 58, '#cfc8b8');                  // near sleeve (lit)
        px(ctx, 6, 118, 8, 58, '#efe9da');
        dith(14, 118, 6, 58, '#efe9da');
        px(ctx, 96, 122, 42, 54, '#a8a18d');                 // far sleeve (shadow)
        px(ctx, 130, 122, 8, 54, '#857e6c');
        dith(124, 122, 6, 54, '#857e6c');
        // fabric folds (sleeves pull at the shoulder seam)
        for (const [fx, fy, fw] of [[10, 130, 14], [12, 144, 18], [9, 158, 15], [104, 136, 14], [108, 152, 12]] as const) {
            px(ctx, fx, fy, fw, 1, '#9a937f'); px(ctx, fx, fy + 1, fw - 3, 1, '#dcd4c2');
        }
        // shoulder seams
        px(ctx, 44, 118, 2, 58, '#9a937f'); px(ctx, 96, 122, 2, 54, '#6e6858');

        // ── VEST: charcoal, V-neck, brass buttons, welt pockets ──
        px(ctx, 44, 116, 54, 60, '#23252e');
        px(ctx, 44, 116, 5, 60, '#3a3d4d');                  // lit lapel edge
        dith(49, 116, 4, 60, '#3a3d4d');
        px(ctx, 92, 118, 6, 58, '#14151b');                  // shadow side
        dith(88, 118, 4, 58, '#14151b');
        // V opening (shirt shows through, tie down the middle)
        for (let i = 0; i < 14; i++) {                       // tapered V
            const half = 13 - i;
            px(ctx, 71 - half, 116 + i, half * 2 + 2, 1, '#e8e2d4');
        }
        px(ctx, 58, 116, 1, 8, '#b3ac9a'); px(ctx, 85, 116, 1, 8, '#b3ac9a');
        // vest edge stitching down the V
        for (let i = 0; i < 14; i++) { px(ctx, 70 - (13 - i) - 1, 116 + i, 1, 1, '#454a5e'); px(ctx, 73 + (13 - i), 116 + i, 1, 1, '#454a5e'); }
        // buttons (brass, specular dot)
        for (const by of [136, 150, 164]) {
            px(ctx, 69, by, 4, 4, '#b8862e'); px(ctx, 69, by, 2, 2, '#e8c050'); px(ctx, 71, by + 2, 2, 2, '#7e5a1d');
        }
        // welt pocket
        px(ctx, 50, 156, 16, 2, '#14151b'); px(ctx, 50, 158, 16, 1, '#3a3d4d');
        // vest fold shadows
        px(ctx, 54, 128, 1, 40, '#1b1d24'); px(ctx, 84, 132, 1, 36, '#101116');

        // ── COLLAR + the red TIE ──
        px(ctx, 54, 102, 14, 12, '#efe9da');                 // collar wing L (lit)
        px(ctx, 76, 102, 14, 12, '#dcd4c2');                 // collar wing R
        px(ctx, 54, 112, 14, 2, '#b3ac9a'); px(ctx, 76, 112, 14, 2, '#a39c89');
        px(ctx, 56, 104, 10, 1, '#fff8e8');                  // collar crease light
        // knot: trapezoid with sheen
        px(ctx, 66, 106, 12, 9, '#a3242c'); px(ctx, 66, 106, 12, 2, '#c43a40');
        px(ctx, 75, 108, 3, 7, '#6e161c'); px(ctx, 67, 107, 3, 2, '#d8555a');
        // tail down to the vest V, swinging slightly
        px(ctx, 67, 115, 10, 16, '#a3242c'); px(ctx, 74, 115, 3, 16, '#6e161c');
        px(ctx, 68, 115, 2, 14, '#c43a40');
        px(ctx, 68, 131, 8, 4, '#8a1d24'); px(ctx, 70, 135, 4, 2, '#6e161c');   // tip
        dith(67, 124, 9, 3, '#8a1d24');                      // fabric shimmer

        // ── BADGE (his left chest = viewer right) ──
        px(ctx, 100, 134, 24, 13, '#e8e2d4'); px(ctx, 100, 134, 24, 2, '#fff8e8');
        px(ctx, 100, 145, 24, 2, '#9a9176'); px(ctx, 99, 134, 1, 13, '#9a9176');
        px(ctx, 103, 138, 18, 2, '#6e675c'); px(ctx, 103, 142, 12, 1, '#8f8878');
        px(ctx, 110, 132, 4, 2, '#b8862e');                  // pin

        // ── NECK (turned 3/4, tendon hint) ──
        px(ctx, 62, 92, 20, 14, '#c79670');
        px(ctx, 62, 92, 4, 14, '#e8b88a'); px(ctx, 78, 92, 4, 14, '#a87a58');
        px(ctx, 70, 94, 1, 10, '#b98a64');                   // tendon
        px(ctx, 62, 104, 20, 3, '#9a7050');                  // collar cast shadow

        // ── HEAD: 4-tone face ramp, lit from viewer-left ──
        // skull block
        px(ctx, 46, 30, 52, 66, '#d9a87e');                  // base
        px(ctx, 46, 30, 8, 66, '#f2c79a');                   // lit plane
        dith(54, 34, 5, 60, '#f2c79a');
        px(ctx, 90, 30, 8, 66, '#8f6749');                   // shadow plane
        dith(85, 34, 5, 60, '#a87a58');
        // jaw taper (cut corners → a believable chin)
        px(ctx, 46, 88, 8, 8, '#0b0708'); px(ctx, 90, 86, 8, 10, '#0b0708');
        px(ctx, 52, 92, 8, 4, '#0b0708'); px(ctx, 84, 90, 8, 6, '#0b0708');
        px(ctx, 60, 92, 24, 4, '#c79670');                   // chin mass
        px(ctx, 60, 94, 24, 2, '#a87a58');
        // ear (viewer right, shadow side)
        px(ctx, 94, 56, 6, 12, '#b98a64'); px(ctx, 96, 59, 3, 6, '#8f6749');
        // brow ridge + tired crease
        px(ctx, 50, 48, 20, 2, '#3a2a22');                   // good brow
        px(ctx, 49, 45, 22, 1, '#b98a64');                   // crease above
        // cheekbone planes
        dith(52, 64, 10, 6, '#c79670'); dith(80, 64, 10, 7, '#a87a58');
        px(ctx, 54, 70, 8, 1, '#b98a64'); px(ctx, 82, 71, 8, 1, '#8f6749');     // hollow lines
        // ── the GOOD eye (viewer left): heavy lid, warm brown iris ──
        px(ctx, 52, 52, 16, 9, '#f4ecdc');                   // white
        px(ctx, 52, 52, 16, 3, '#a87a58');                   // lid half down (tired)
        px(ctx, 52, 51, 16, 1, '#5e463a');                   // lash line
        px(ctx, 57, 54, 7, 6, '#6e3f22');                    // iris
        px(ctx, 59, 55, 3, 4, '#1d130c');                    // pupil
        px(ctx, 57, 54, 2, 2, '#ffd9a8');                    // fire catchlight
        px(ctx, 63, 58, 1, 1, '#c4936a');                    // iris lower edge
        px(ctx, 52, 61, 16, 1, '#9a7050');                   // waterline
        px(ctx, 51, 63, 18, 2, '#b08260'); dith(52, 65, 16, 2, '#b08260');      // the eyebag
        // ── the LOST eye: bandage wrap with weave + cast shadow ──
        px(ctx, 74, 50, 26, 13, '#ece3c9');                  // main pad
        px(ctx, 74, 50, 26, 2, '#f8f2de');
        for (let y = 53; y < 62; y += 3) px(ctx, 75, y, 24, 1, '#d9cfb2');      // weave lines
        px(ctx, 74, 62, 26, 2, '#9a9176');                   // under-shadow
        px(ctx, 74, 64, 24, 2, '#8f6749');                   // cast shadow on cheek
        // diagonal band up across the forehead
        for (let i = 0; i < 7; i++) px(ctx, 64 - i * 2, 44 - i, 26, 2, i % 2 ? '#ece3c9' : '#e0d6ba');
        // wrap around the skull (shadow side)
        px(ctx, 96, 42, 6, 28, '#d9cfb2'); px(ctx, 96, 42, 1, 28, '#9a9176');
        // the old stain, dried dark at the socket
        px(ctx, 82, 54, 8, 6, '#8a3a30'); px(ctx, 85, 56, 4, 3, '#5e1f1a'); dith(81, 53, 10, 8, '#8a3a30');
        // loose knot tail
        px(ctx, 100, 66, 5, 10, '#d9cfb2'); px(ctx, 101, 74, 3, 4, '#b3a98c');
        // ── NOSE: bridge, tip, nostril shadow ──
        px(ctx, 68, 58, 5, 16, '#c79670'); px(ctx, 68, 58, 2, 16, '#e8b88a');
        px(ctx, 67, 72, 8, 3, '#b98a64'); px(ctx, 70, 74, 6, 2, '#8f6749');     // tip + base
        px(ctx, 74, 73, 2, 2, '#6e503c');                    // nostril
        px(ctx, 73, 70, 2, 4, '#a87a58');                    // side plane
        // smile line (the years at the desk)
        px(ctx, 62, 76, 1, 6, '#b98a64'); px(ctx, 80, 77, 1, 5, '#9a7050');
        // ── MOUTH: calm, tired, kind ──
        px(ctx, 60, 84, 22, 2, '#7e4a3a');                   // lip line
        px(ctx, 78, 83, 4, 2, '#8f5a45');                    // soft upturn corner
        px(ctx, 60, 86, 18, 1, '#c79670'); px(ctx, 62, 87, 14, 1, '#a87a58');   // lower lip + shadow
        px(ctx, 58, 83, 2, 3, '#9a7050');                    // corner crease
        // faint stubble (dithered, not an old man's beard)
        dith(58, 88, 28, 7, '#8a6248'); dith(54, 80, 6, 8, '#8a6248');

        // ── HAIR: dark brown, messy, drawn in directional strands ──
        const H1 = '#1f1610', H2 = '#33241a', H3 = '#4a3322', H4 = '#6e4c30';
        px(ctx, 42, 8, 60, 26, H2);                          // mass
        px(ctx, 38, 16, 10, 30, H2); px(ctx, 96, 14, 10, 26, H1);   // sides
        // strand clusters (each: dark base, mid, lit tip toward the fire)
        for (const [sx, sy, sw, sh] of [
            [44, 4, 12, 10], [56, 2, 14, 9], [70, 1, 13, 10], [84, 4, 12, 9],
            [40, 12, 10, 8], [94, 10, 10, 9],
        ] as const) {
            px(ctx, sx, sy, sw, sh, H2);
            px(ctx, sx + 1, sy + 1, sw - 4, sh - 3, H3);
            px(ctx, sx + 1, sy + 1, 3, sh - 4, H4);
        }
        // fringe falling over the forehead + brushing the bandage
        px(ctx, 46, 30, 14, 8, H2); px(ctx, 48, 30, 8, 6, H3);
        px(ctx, 60, 28, 12, 9, H2); px(ctx, 62, 30, 6, 5, H3);
        px(ctx, 74, 28, 16, 8, H1); px(ctx, 88, 30, 12, 10, H1);    // shadow-side fringe
        px(ctx, 92, 36, 8, 8, H1);
        // flyaway strands (the mess)
        px(ctx, 52, 1, 2, 4, H2); px(ctx, 66, 0, 2, 3, H2); px(ctx, 80, 1, 2, 4, H1);
        px(ctx, 38, 10, 2, 6, H2); px(ctx, 104, 12, 2, 6, H1);
        // fire rim along the lit silhouette
        px(ctx, 41, 10, 2, 22, '#9a5e32'); px(ctx, 44, 5, 2, 6, '#9a5e32');
        dith(43, 8, 3, 24, '#7e4a26');

        // ── atmosphere: embers drifting in the warm air ──
        ctx.globalAlpha = 0.8;
        for (const [ex, ey, c] of [[10, 30, '#ffb84d'], [6, 70, '#ff9a55'], [16, 104, '#ffd98a'], [22, 50, '#ff9a55'], [12, 140, '#ffd98a'], [30, 20, '#ffb84d']] as const) px(ctx, ex, ey, 1, 1, c);
        ctx.globalAlpha = 0.4;
        px(ctx, 11, 31, 1, 1, '#6e3318'); px(ctx, 17, 105, 1, 1, '#6e3318');
        ctx.globalAlpha = 1;
    });
    return (t.image as HTMLCanvasElement).toDataURL();
})();

// ── Story-beat components ─────────────────────────────────────────────────────

/** THE ZELADOR CINEMATIC: first steps out of the elevator → a smiling
 *  silhouette bursts across the lobby, SLAMS + padlocks the exit, then sprints
 *  back and dives into the floor hole. Steers the camera via f4Cam.override.
 *  Also owns the padlock sprite (it appears mid-cinematic and stays). */
const Runner: React.FC = () => {
    const t = useRef(0);
    const ref = useRef<THREE.Mesh>(null!);
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    const slammed = useRef(false);
    const clicked = useRef(false);
    const [lockOn, setLockOn] = useState(f4.runnerSeen);
    useFrame((_, dt) => {
        if (!f4.runnerActive) return;
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        let x = 1.6, y = 0.75, rot = 0, run = true, vis = true;
        if (tt < 0.35) {                                   // a beat: he's just THERE
            vis = tt > 0.12; run = false;
        } else if (tt < 1.75) {                            // sprint to the door
            x = THREE.MathUtils.lerp(1.6, 11.3, (tt - 0.35) / 1.4);
        } else if (tt < 2.75) {                            // slam + padlock
            x = 11.3; run = false;
            if (!slammed.current) { slammed.current = true; playF4Slam(); }
            if (tt > 2.25 && !clicked.current) { clicked.current = true; playF4Lock(); setLockOn(true); }
        } else if (tt < 3.85) {                            // sprint back to the hole
            x = THREE.MathUtils.lerp(11.3, 6.3, (tt - 2.75) / 1.1);
        } else if (tt < 4.35) {                            // dive
            x = 6.3; run = false;
            const k = (tt - 3.85) / 0.5;
            y = 0.75 - k * 1.9;
            rot = -k * 1.2;
        } else {
            vis = false;
            if (tt > 4.8) { f4RunnerDone(); return; }
        }
        f4Cam.override = x;
        if (ref.current) {
            ref.current.visible = vis;
            ref.current.position.set(x, y, 0.32);
            ref.current.rotation.z = rot;
            // face the move direction (sprite faces right)
            ref.current.scale.x = tt >= 2.75 && tt < 4.35 ? -1 : 1;
        }
        const tex = run ? (Math.floor(tt * 12) % 2 === 0 ? zelA : zelB) : zelA;
        if (matRef.current && matRef.current.map !== tex) { matRef.current.map = tex; matRef.current.needsUpdate = true; }
    });
    return (
        <>
            {f4.runnerActive && (
                <mesh ref={ref} position={[1.6, 0.75, 0.32]} visible={false}>
                    <planeGeometry args={[0.95, 1.55]} />
                    <meshBasicMaterial ref={matRef} map={zelA} transparent alphaTest={0.4} toneMapped={false} />
                </mesh>
            )}
            {(lockOn || f4.runnerSeen) && !f4.doorUnlocked && (
                <group>
                    <S tex={chainLinkTex} w={0.16} h={1.1} x={11.5} y={1.95} z={-7.72} transparent rot={1.35} />
                    <S tex={padlockTex} w={0.55} h={0.72} x={11.5} y={1.55} z={-7.7} transparent />
                </group>
            )}
        </>
    );
};

/** THE GUEST OF 404 rises from the rubble when the 5th ring lands — offering
 *  the reservation slip. After it's taken he rests, finally attended. */
const Skeleton: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    const t = useRef(0);
    const rattled = useRef(false);
    useFrame((_, dt) => {
        if (!f4.bellSolved || !g.current) return;
        t.current += Math.min(dt, 0.05);
        if (!f4.skeletonRisen) {
            if (!rattled.current) { rattled.current = true; playF4Bones(); }
            const k = Math.min(1, t.current / 2.3);
            const e = k * k * (3 - 2 * k);
            g.current.position.y = -1.5 + e * 1.5 + Math.sin(t.current * 22) * 0.03 * (1 - e);   // shudder up
            g.current.rotation.z = (1 - e) * -0.45;
            if (k >= 1) f4SkeletonRisen();
        } else {
            g.current.position.y = Math.sin(t.current * 1.1) * 0.02;          // the faintest sway
            g.current.rotation.z = 0;
        }
    });
    if (!f4.bellSolved) return null;
    return (
        <group position={[5.0, 0, 0]}>
            <group ref={g} position={[0, -1.5, 0]}>
                <S tex={f4.codeTaken ? skelRest : skelOffer} w={1.2} h={1.7} x={0} y={0.85} z={-2.4} transparent />
                {f4.skeletonRisen && !f4.codeTaken && (
                    <S tex={slipTex} w={0.34} h={0.42} x={0.62} y={1.32} z={-2.35} transparent />
                )}
            </group>
            {/* the mound he was under (in FRONT — he rises out of it) */}
            <S tex={rubbleTex} w={2.5} h={0.95} x={0} y={0.45} z={-2.0} transparent />
        </group>
    );
};

/** Emergency lamp blinking the START RHYTHM (basement clue). It runs on its
 *  own battery — the one thing alive on a dead floor — and blinks SILENTLY:
 *  the receptionist wired it to remember the generator's rhythm for him. */
const EmergencyLamp: React.FC<{ x: number; y: number }> = ({ x, y }) => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    const glow = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        let f: number;
        if (f4.powerOn) f = 0.25;                          // demoted once the mains hum
        else {
            const cyc = t.current % 3.1;                   // ▪ ▪ ▪ ▬ …pause
            const isLong = cyc >= 1.2 && cyc < 1.9;
            const on = cyc < 0.16 || (cyc >= 0.4 && cyc < 0.56) || (cyc >= 0.8 && cyc < 0.96) || isLong;
            f = on ? 0.9 : 0.06;
        }
        if (mat.current) mat.current.opacity = 0.35 + f * 0.65;
        if (glow.current) glow.current.opacity = f * 0.4;
    });
    return (
        <group position={[x, y, -7.2]}>
            <mesh><planeGeometry args={[0.65, 0.78]} /><meshBasicMaterial ref={mat} map={emergLampTex} transparent toneMapped={false} /></mesh>
            <mesh position={[0, -0.5, 0.02]}>
                <planeGeometry args={[3.4, 2.4]} />
                <meshBasicMaterial ref={glow} map={auraTex} color="#ff9a55" transparent opacity={0.2} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
};

/** The keeper's campfire — flickering frames, breathing glow, rising embers. */
const Campfire: React.FC<{ x: number }> = ({ x }) => {
    const flameMat = useRef<THREE.MeshBasicMaterial>(null!);
    const glowMat = useRef<THREE.MeshBasicMaterial>(null!);
    const poolMat = useRef<THREE.MeshBasicMaterial>(null!);
    const embers = useRef<(THREE.Mesh | null)[]>([]);
    const seeds = useMemo(() => Array.from({ length: 4 }, () => ({ sp: 0.5 + rnd() * 0.5, ph: rnd() * 6 })), []);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        const flick = 0.85 + Math.sin(tt * 9.7) * 0.08 + Math.sin(tt * 23.3) * 0.06;
        const tex = flameFrames[Math.floor(tt * 9) % 3];
        if (flameMat.current) {
            if (flameMat.current.map !== tex) { flameMat.current.map = tex; flameMat.current.needsUpdate = true; }
            flameMat.current.opacity = flick;
        }
        if (glowMat.current) glowMat.current.opacity = 0.4 * flick;
        if (poolMat.current) poolMat.current.opacity = 0.34 * flick;
        seeds.forEach((s, i) => {
            const m = embers.current[i];
            if (!m) return;
            const cyc = (tt * s.sp + s.ph) % 2.6;
            m.position.set(x + Math.sin((tt + s.ph) * 3) * 0.18, 0.5 + cyc * 1.1, -2.1);
            (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - cyc / 2.2);
        });
    });
    return (
        <group>
            <S tex={logsTex} w={1.1} h={0.42} x={x} y={0.2} z={-2.2} transparent />
            <mesh position={[x, 0.78, -2.21]}>
                <planeGeometry args={[0.85, 1.1]} />
                <meshBasicMaterial ref={flameMat} map={flameFrames[0]} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[x, 1.5, -2.5]}>
                <planeGeometry args={[9.5, 7.0]} />
                <meshBasicMaterial ref={glowMat} map={auraTex} color="#ff8a3c" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[x, 0.06, -2.1]}>
                <planeGeometry args={[6.0, 0.9]} />
                <meshBasicMaterial ref={poolMat} map={poolTex} color="#ff9a55" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
            </mesh>
            {seeds.map((_, i) => (
                <mesh key={i} ref={(el) => { embers.current[i] = el; }} position={[x, 0.6, -2.1]}>
                    <planeGeometry args={[0.05, 0.05]} />
                    <meshBasicMaterial color="#ffb84d" transparent opacity={0.8} depthWrite={false} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
};

/** The first receptionist in the world — slumped; raises his head when the
 *  player comes close (the "approach detail" beat before the dialogue). */
const KeeperFigure: React.FC<{ x: number; playerXRef?: React.MutableRefObject<number> }> = ({ x, playerXRef }) => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame(() => {
        const near = playerXRef ? Math.abs(playerXRef.current - x) < 2.8 : false;
        const tex = near || f4.metKeeper ? keeperUp : keeperSit;
        if (matRef.current && matRef.current.map !== tex) { matRef.current.map = tex; matRef.current.needsUpdate = true; }
    });
    return (
        <mesh position={[x, 0.68, -2.3]}>
            <planeGeometry args={[1.15, 1.35]} />
            <meshBasicMaterial ref={matRef} map={keeperSit} transparent alphaTest={0.4} toneMapped={false} />
        </mesh>
    );
};

// ── Scene ─────────────────────────────────────────────────────────────────────
const CX = (W0 + W1) / 2;   // wall/floor strips center
const PX_OF = (id: string) => F4_POINTS.find((p) => p.id === id)?.x ?? 0;

/** Full-lobby darkness until the generator runs (the floor arrives DEAD). */
const LobbyDark: React.FC = () => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame((_, dt) => {
        if (!mat.current) return;
        const target = f4.powerOn ? 0 : 0.46;
        mat.current.opacity += (target - mat.current.opacity) * Math.min(1, dt * 1.2);
    });
    return (
        <mesh position={[CX, 1.5, 2.9]}>
            <planeGeometry args={[SPAN + 8, 30]} />
            <meshBasicMaterial ref={mat} color="#05030a" transparent opacity={0.46} depthWrite={false} toneMapped={false} />
        </mesh>
    );
};

/** Spotlight beat on the bell once the power returns (THIS is next). */
const BellSpot: React.FC<{ x: number }> = ({ x }) => {
    const mat = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (mat.current) mat.current.opacity = f4.powerOn && !f4.bellSolved ? 0.34 + Math.sin(t.current * 2.2) * 0.08 : 0;
    });
    return (
        <mesh position={[x, 1.9, -2.15]}>
            <planeGeometry args={[2.6, 2.6]} />
            <meshBasicMaterial ref={mat} map={glowTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
    );
};

const LobbyScene: React.FC<{ doorOpenRef?: React.MutableRefObject<number> }> = ({ doorOpenRef }) => {
    const slab2 = React.useMemo(() => { const t = slabTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(SPAN / 4, 1); return t; }, []);
    return (
        <group>
            {/* DUSK SKY + ruined skyline — parallax: the far world lags the camera */}
            <Parallax factor={0.5}>
                <S tex={skyTex} w={SPAN + 18} h={24} x={CX} y={8} z={-12} />
            </Parallax>
            <Parallax factor={0.32}>
                <S tex={skylineTex} w={SPAN + 14} h={2.6} x={CX} y={7.95} z={-11.5} transparent />
            </Parallax>

            {/* RUINED LOBBY BACK WALL (all destruction + graffiti baked in) */}
            <S tex={wallTex} w={SPAN} h={wallH} x={CX} y={wallH / 2} z={-8} transparent />

            {/* the elevator's warmth on the wall — only IT is remembered */}
            <ElevatorAura />

            {/* CEILING strip with collapse gaps; smoke drifts out of them */}
            <S tex={ceilTex} w={SPAN} h={1.25} x={CX} y={7.5 + 0.625 - 0.55} z={-7.5} transparent />
            <SmokeWisps />

            {/* THE EXIT DOOR — the Zelador padlocks it in the opening cinematic;
                the master key (safe) unlocks it; entering leads into the breu. */}
            <S tex={backDoorTex} w={2.25} h={3.75} x={11.5} y={1.875} z={-7.8} transparent />
            {f4.doorUnlocked && <mesh position={[11.5, 1.8, -7.78]}><planeGeometry args={[0.62, 3.4]} /><meshBasicMaterial color="#040305" toneMapped={false} /></mesh>}
            <ExitSign x={11.5} y={4.35} />

            {/* LORE PROPS — dead power panel, the BELL on its stand, the safe picture */}
            <S tex={f4.powerOn ? breakerTexOn : breakerTexOff} w={1.25} h={1.6} x={-4.4} y={2.3} z={-7.7} transparent />
            <S tex={crateTex} w={1.3} h={1.05} x={PX_OF('bell')} y={0.53} z={-2.25} transparent />
            <S tex={bellTex} w={0.95} h={0.8} x={PX_OF('bell')} y={1.42} z={-2.2} transparent />
            <BellSpot x={PX_OF('bell')} />
            {!f4.safeSolved
                ? <S tex={safePicTex} w={1.6} h={1.25} x={PX_OF('safe')} y={3.1} z={-7.7} transparent rot={-0.14} />
                : <>
                    <S tex={safeOpenTex} w={1.6} h={1.5} x={PX_OF('safe')} y={3.1} z={-7.7} transparent />
                    <S tex={safePicTex} w={1.6} h={1.25} x={PX_OF('safe') + 0.7} y={0.4} z={-2.3} transparent rot={1.35} />
                </>}

            {/* hidden MURAL (revealed when the lights come back): the building,
                floor 4 scratched out in blood, an arrow pointing further down */}
            {f4.powerOn && <S tex={muralTex} w={3.8} h={2.6} x={14.7} y={4.5} z={-7.68} transparent />}

            {/* the receptionist's diary pages */}
            <PageSprite x={PX_OF('page1')} y={0.12} visible={!f4.pages[0]} />
            <PageSprite x={PX_OF('page3')} y={0.12} visible={f4.powerOn && !f4.pages[2]} />
            <PageSprite x={PX_OF('page4')} y={0.12} visible={f4.safeSolved && !f4.pages[3]} />

            {/* THE GUEST OF 404 (rises by the desk once the 5th ring lands) */}
            <Skeleton />

            {/* whole-lobby darkness until the power, plus the deeper right side */}
            <LobbyDark />
            <Gloom />

            {/* MAIN FLOOR cross-section (checker band + slab) with the torn HOLES */}
            <S tex={floorTex} w={SPAN} h={0.625} x={CX} y={-0.3125} z={-2} transparent />

            {/* THE FLOORS BELOW (cutaway): wrecked corridor, then near-silhouette */}
            <S tex={low1Tex} w={SPAN} h={3.6} x={CX} y={-0.625 - 1.8} z={-5} />
            <S tex={slab2} w={SPAN} h={0.5} x={CX} y={-4.475} z={-4.6} />
            <S tex={low2Tex} w={SPAN} h={3.0} x={CX} y={-4.725 - 1.5} z={-5} />
            <mesh position={[CX, -9.7, -4.5]}><planeGeometry args={[SPAN + 6, 5]} /><meshBasicMaterial color={'#060406'} toneMapped={false} /></mesh>

            {/* WRECKAGE on the main floor */}
            <S tex={deskTex} w={4} h={1.875} x={3.6} y={0.9} z={-3} transparent />
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
            <FallingDust />

            {/* foreground silhouettes (negative parallax — depth in FRONT) */}
            <Foreground />

            {/* THE ELEVATOR — untouched. Always untouched. */}
            <Floor4Elevator2D position={[FLOOR4_ELEVATOR_X, 0, -1]} openRef={doorOpenRef} />

            {/* go-right hint by the doorway */}
            <S tex={arrowTex} w={1.0} h={0.6} x={-5.9} y={1.15} z={0.1} transparent />

            {/* THE ZELADOR (cinematic) + his padlock */}
            <Runner />

            {/* GUIDANCE — "!" floats over what the player can act on, "?" over flavor */}
            {markerList().map((m) => <Marker key={m.id} x={m.x} y={m.y} kind={m.kind} />)}
        </group>
    );
};

/** BASEMENT — the generator room. Near-black until the levers find the rhythm. */
const BasementScene: React.FC = () => {
    const darkMat = useRef<THREE.MeshBasicMaterial>(null!);
    const genGlow = useRef<THREE.MeshBasicMaterial>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (darkMat.current) {
            const target = f4.powerOn ? 0.1 : 0.58;
            darkMat.current.opacity += (target - darkMat.current.opacity) * Math.min(1, dt * 1.4);
        }
        if (genGlow.current) genGlow.current.opacity = f4.powerOn ? 0.3 + Math.sin(t.current * 3.1) * 0.06 : 0.05;
    });
    const genTex = useMemo(() => generatorTex(f4.levers, f4.powerOn), [f4.version]);   // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <group>
            {/* brick walls / pipes / slab ceiling with the hole you fell through */}
            <S tex={baseWallTex} w={BSPAN} h={5.2} x={B_CX} y={2.6} z={-8} />
            <S tex={basePipesTex} w={BSPAN} h={0.75} x={B_CX} y={4.55} z={-7.4} transparent />
            <S tex={slabTex} w={(-3.9) - B_W0} h={0.5} x={(B_W0 + (-3.9)) / 2} y={5.0} z={-7.3} />
            <S tex={slabTex} w={B_W1 - (-2.5)} h={0.5} x={((-2.5) + B_W1) / 2} y={5.0} z={-7.3} />
            <S tex={baseFloorTex} w={BSPAN} h={0.5} x={B_CX} y={-0.25} z={-2} />
            <mesh position={[B_CX, -3.4, -4.5]}><planeGeometry args={[BSPAN + 6, 6]} /><meshBasicMaterial color="#060406" toneMapped={false} /></mesh>
            <mesh position={[B_CX, 8.4, -7.2]}><planeGeometry args={[BSPAN + 6, 6]} /><meshBasicMaterial color="#0a0709" toneMapped={false} /></mesh>

            {/* the light shaft falling through the hole + the rubble you ride up */}
            <S tex={shaftTex} w={2.0} h={4.4} x={-3.2} y={2.7} z={-6.5} transparent opacity={0.7} />
            <S tex={rubbleTex} w={2.6} h={1.1} x={-3.2} y={0.5} z={-1.9} transparent />
            <S tex={rubbleTex} w={1.9} h={0.85} x={-3.0} y={1.2} z={-2.0} transparent flipX />
            <S tex={arrowTex} w={0.9} h={0.55} x={-3.2} y={2.2} z={0.1} transparent rot={1.57} />

            {/* THE GENERATOR (levers mirror the panel live) + emergency lamp */}
            <S tex={genTex} w={2.9} h={2.0} x={5.2} y={1.0} z={-7.0} transparent />
            <mesh position={[5.2, 1.3, -6.9]}>
                <planeGeometry args={[4.2, 3.2]} />
                <meshBasicMaterial ref={genGlow} map={auraTex} color="#7fe09a" transparent opacity={0.05} depthWrite={false} toneMapped={false} />
            </mesh>
            <EmergencyLamp x={3.4} y={3.4} />

            {/* string bulbs wake with the power */}
            {f4.powerOn && <S tex={bulbStringTex} w={BSPAN} h={0.5} x={B_CX} y={4.1} z={-6.8} transparent />}

            {/* page 2 — the rhythm, in the receptionist's hand */}
            <PageSprite x={1.0} y={0.12} visible={!f4.pages[1]} />

            {/* scattered storage junk */}
            <S tex={rubbleTex} w={1.8} h={0.7} x={0.0} y={0.34} z={-1.8} transparent flipX />
            <S tex={shardTex} w={1.2} h={1.0} x={6.9} y={0.5} z={-2.6} transparent />
            <S tex={deadPlantTex} w={1.1} h={1.25} x={2.2} y={0.62} z={-2.4} transparent flipX />

            {/* basement darkness (lifts when the generator hums) */}
            <mesh position={[B_CX, 1.5, 3.2]}>
                <planeGeometry args={[BSPAN + 8, 22]} />
                <meshBasicMaterial ref={darkMat} color="#04030a" transparent opacity={0.58} depthWrite={false} toneMapped={false} />
            </mesh>

            <DustMotes />
            {markerList().map((m) => <Marker key={m.id} x={m.x} y={m.y} kind={m.kind} />)}
        </group>
    );
};

/** BEYOND THE DOOR — the breu. Black, broken, one small fire, one old man. */
const BeyondScene: React.FC<{ playerXRef?: React.MutableRefObject<number> }> = ({ playerXRef }) => (
    <group>
        {/* the void */}
        <mesh position={[5, 2, -12]}><planeGeometry args={[40, 30]} /><meshBasicMaterial color="#050304" toneMapped={false} /></mesh>
        {/* the door you came through, barely there behind you */}
        <S tex={backDoorTex} w={2.25} h={3.75} x={-0.4} y={1.875} z={-7.8} transparent opacity={0.4} />
        <ExitSign x={-0.4} y={4.35} />
        {/* what's left of the floor — silhouettes against deeper black */}
        <mesh position={[5, -0.18, -2]}><planeGeometry args={[26, 0.36]} /><meshBasicMaterial color="#0a0708" toneMapped={false} /></mesh>
        <S tex={rubbleTex} w={3.0} h={1.1} x={1.4} y={0.5} z={-2.6} transparent opacity={0.55} />
        <S tex={shardTex} w={1.6} h={1.3} x={4.6} y={0.62} z={-2.7} transparent opacity={0.45} />
        <S tex={rubbleTex} w={2.4} h={0.9} x={6.3} y={0.42} z={-2.6} transparent opacity={0.5} flipX />
        {/* fallen column silhouettes */}
        <mesh position={[3.2, 2.6, -6]} rotation={[0, 0, 0.35]}><planeGeometry args={[0.7, 5.5]} /><meshBasicMaterial color="#0b0709" toneMapped={false} /></mesh>
        <mesh position={[10.6, 2.2, -6]} rotation={[0, 0, -0.2]}><planeGeometry args={[0.8, 5]} /><meshBasicMaterial color="#0b0709" toneMapped={false} /></mesh>
        {/* the wall sealing the far end */}
        <S tex={rubbleTex} w={4.0} h={1.5} x={11.0} y={0.7} z={-1.8} transparent opacity={0.6} />
        <S tex={rubbleTex} w={3.0} h={1.2} x={11.3} y={1.7} z={-1.8} transparent opacity={0.55} flipX />

        {/* the fire and the man who kept the floor */}
        <Campfire x={8.0} />
        <KeeperFigure x={8.85} playerXRef={playerXRef} />

        {markerList().map((m) => <Marker key={m.id} x={m.x} y={m.y} kind={m.kind} />)}
    </group>
);

export const Floor4Scene2D: React.FC<{
    doorOpenRef?: React.MutableRefObject<number>;
    playerXRef?: React.MutableRefObject<number>;
    loreVersion?: number;
}> = ({ doorOpenRef, playerXRef }) => {
    if (f4.room === 'basement') return <BasementScene />;
    if (f4.room === 'beyond') return <BeyondScene playerXRef={playerXRef} />;
    return <LobbyScene doorOpenRef={doorOpenRef} />;
};

export default Floor4Scene2D;
