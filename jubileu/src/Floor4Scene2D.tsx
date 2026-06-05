/**
 * Floor4Scene2D.tsx — Floor 4 as a TRUE 2D side-scroller (orthographic, flat
 * layered pixel sprites) — NOT a 3D scene with flat textures. Matches the
 * reference: an elevator ROOM on the left (dark interior, "ELEVADOR" sign, a
 * plant) opening onto an outdoor BASEPLATE on the right (blue sky + clouds +
 * grassy dirt ground). Side-view character.
 *
 * Rendered under an OrthographicCamera (see floor4-dev.tsx / the game's Floor-4
 * camera), so there is ZERO perspective — it reads as a real 2D game. All art is
 * procedural pixel CanvasTexture (NearestFilter), no external assets.
 *
 * World units: ground TOP at y=0; +x right, +y up; layers stacked on z.
 */
import React from 'react';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';

// ── Palette (from the reference) ──────────────────────────────────────────────
const P = {
    sky: '#6cb7e6', cloud: '#eaf4fb',
    grass: '#5fae57', grassDk: '#3f7d3e',
    dirt: '#7a5b43', dirtDk: '#5f4633', dirtLt: '#8d6c50', stone: '#6b5340',
    room: '#2a2f3a', roomDk: '#1b1f27', roomLt: '#3a4150', floorIn: '#23262f',
    metal: '#9aa3b0', metalDk: '#5c6371', metalLt: '#c2c9d4', door: '#7b8290',
    panel: '#11131a', text: '#f4f0e6', signWood: '#8a5a32', signWoodDk: '#5f3c20',
    pot: '#b5532e', potDk: '#7e3a20', leaf: '#4ea04b', leafDk: '#357a37',
    skin: '#e8b48a', hair: '#7a4a24', shirt: '#3b6fb0', pants: '#2c3550', shoe: '#23262f',
};

// Flat unlit sprite plane with a pixel texture.
const S: React.FC<{ tex: THREE.Texture; w: number; h: number; x: number; y: number; z?: number; transparent?: boolean }> =
    ({ tex, w, h, x, y, z = 0, transparent }) => (
        <mesh position={[x, y, z]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex} transparent={transparent} alphaTest={transparent ? 0.5 : 0} toneMapped={false} />
        </mesh>
    );

// Chunky pixel-ish label on a panel (canvas fillText + NearestFilter upscale).
function labelTex(text: string, bg: string, fg: string): THREE.CanvasTexture {
    const w = Math.max(40, text.length * 8 + 10), h = 16;
    return pixelTex(w, h, (ctx) => {
        px(ctx, 0, 0, w, h, bg);
        ctx.fillStyle = fg;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 1);
    });
}

// ── Texture builders (cached at module load) ──────────────────────────────────
const skyTex = pixelTex(8, 64, (ctx) => {            // soft vertical sky gradient
    for (let y = 0; y < 64; y++) { const t = y / 64; px(ctx, 0, y, 8, 1, t < 0.5 ? P.sky : '#88c6ee'); }
});
const cloudTex = pixelTex(24, 12, (ctx) => {
    ctx.clearRect(0, 0, 24, 12);
    px(ctx, 4, 5, 16, 5, P.cloud); px(ctx, 7, 2, 10, 4, P.cloud);
    px(ctx, 2, 7, 6, 3, P.cloud); px(ctx, 16, 6, 6, 3, P.cloud);
});
const groundTex = pixelTex(16, 32, (ctx) => {
    px(ctx, 0, 0, 16, 32, P.dirt);
    px(ctx, 0, 0, 16, 4, P.grass);                    // grass top
    px(ctx, 0, 4, 16, 1, P.grassDk);
    for (let i = 0; i < 16; i += 2) px(ctx, i, 1, 1, 2, P.grassDk); // grass blades
    // cobble speckle
    px(ctx, 3, 10, 3, 3, P.dirtDk); px(ctx, 9, 16, 4, 3, P.stone);
    px(ctx, 2, 22, 3, 2, P.dirtLt); px(ctx, 11, 26, 3, 3, P.dirtDk);
    px(ctx, 6, 7, 2, 2, P.dirtLt);
});
groundTex.wrapS = THREE.RepeatWrapping;

const roomTex = pixelTex(32, 48, (ctx) => {           // dark interior back wall
    px(ctx, 0, 0, 32, 48, P.room);
    for (let y = 4; y < 48; y += 8) px(ctx, 0, y, 32, 1, P.roomDk);  // panel lines
    for (let x = 6; x < 32; x += 10) px(ctx, x, 0, 1, 48, P.roomDk);
    px(ctx, 0, 0, 32, 2, P.roomLt);                   // top trim
});
const roomFloorTex = pixelTex(16, 8, (ctx) => {
    px(ctx, 0, 0, 16, 8, P.floorIn);
    px(ctx, 0, 0, 16, 1, P.roomLt);
    for (let x = 0; x < 16; x += 4) px(ctx, x, 0, 1, 8, P.roomDk);
});
roomFloorTex.wrapS = THREE.RepeatWrapping;

const elevatorTex = pixelTex(40, 64, (ctx) => {       // side-scroller elevator cabin
    px(ctx, 0, 0, 40, 64, P.metalDk);                 // frame
    px(ctx, 0, 0, 40, 2, P.metalLt); px(ctx, 0, 0, 2, 64, P.metalLt);
    px(ctx, 0, 62, 40, 2, P.roomDk); px(ctx, 38, 0, 2, 64, P.roomDk);
    px(ctx, 4, 4, 32, 56, P.metal);                   // door area
    px(ctx, 19, 4, 2, 56, P.metalDk);                 // door seam
    for (const dx of [9, 27]) { px(ctx, dx, 8, 4, 48, P.door); px(ctx, dx, 8, 1, 48, P.metalLt); }
    // call panel
    px(ctx, 33, 26, 4, 10, P.panel); px(ctx, 34, 28, 2, 2, '#ffd24a'); px(ctx, 34, 32, 2, 2, '#7CFF6B');
});
const potTex = pixelTex(20, 24, (ctx) => {
    ctx.clearRect(0, 0, 20, 24);
    // leaves
    px(ctx, 6, 2, 8, 8, P.leaf); px(ctx, 3, 5, 6, 6, P.leaf); px(ctx, 11, 5, 6, 6, P.leaf);
    px(ctx, 7, 0, 4, 6, P.leafDk); px(ctx, 4, 6, 3, 3, P.leafDk); px(ctx, 13, 6, 3, 3, P.leafDk);
    // pot
    px(ctx, 5, 14, 10, 9, P.pot); px(ctx, 4, 13, 12, 3, P.potDk); px(ctx, 5, 14, 10, 1, '#d06a40');
});
const signTexB = labelTex('BASEPLATE', P.panel, P.text);
const signTexE = labelTex('ELEVADOR', P.panel, '#7CFF6B');
const postTex = pixelTex(4, 16, (ctx) => { px(ctx, 0, 0, 4, 16, P.signWood); px(ctx, 0, 0, 1, 16, P.signWoodDk); });

// Placeholder side-view character (replaced by Felipe's sprite later).
const heroTex = pixelTex(16, 24, (ctx) => {
    ctx.clearRect(0, 0, 16, 24);
    px(ctx, 4, 1, 8, 6, P.hair);                       // hair
    px(ctx, 5, 4, 7, 5, P.skin);                       // face
    px(ctx, 10, 5, 2, 2, P.panel);                     // eye (facing right)
    px(ctx, 4, 9, 8, 7, P.shirt);                      // torso
    px(ctx, 4, 16, 3, 5, P.pants); px(ctx, 9, 16, 3, 5, P.pants);  // legs
    px(ctx, 4, 21, 4, 2, P.shoe); px(ctx, 9, 21, 4, 2, P.shoe);    // shoes
});
// "go right" hint arrow.
const arrowTex = pixelTex(16, 10, (ctx) => {
    ctx.clearRect(0, 0, 16, 10);
    px(ctx, 1, 4, 10, 2, P.text); px(ctx, 9, 2, 2, 6, P.text); px(ctx, 11, 3, 2, 4, P.text); px(ctx, 13, 4, 2, 2, P.text);
});

// ── Scene ─────────────────────────────────────────────────────────────────────
const ROOM_X0 = -11, ROOM_X1 = -2.5;   // elevator room spans this; opens to the right

export const Floor4Scene2D: React.FC = () => {
    const ground = React.useMemo(() => { const t = groundTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(14, 1); return t; }, []);
    const roomFloor = React.useMemo(() => { const t = roomFloorTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1); return t; }, []);
    const ROOM_W = ROOM_X1 - ROOM_X0, ROOM_CX = (ROOM_X0 + ROOM_X1) / 2;
    return (
        <group>
            {/* SKY (far back) */}
            <S tex={skyTex} w={30} h={20} x={0} y={6} z={-10} />
            <S tex={cloudTex} w={4} h={2} x={3} y={6.5} z={-9} transparent />
            <S tex={cloudTex} w={3} h={1.5} x={8} y={5} z={-9} transparent />
            <S tex={cloudTex} w={5} h={2.5} x={-1} y={7.5} z={-9} transparent />

            {/* GROUND (full width) — grassy dirt, fills to the bottom of the view */}
            <S tex={ground} w={30} h={9} x={0} y={-4.5} z={-2} />

            {/* ELEVATOR ROOM (left): dark interior back wall (from ground up) */}
            <S tex={roomTex} w={ROOM_W} h={8} x={ROOM_CX} y={4} z={-3} />
            {/* dark interior floor (hides the grass inside the room) */}
            <S tex={roomFloor} w={ROOM_W + 0.5} h={1.2} x={ROOM_CX} y={-0.4} z={-1.6} />
            {/* room right-edge pillar = the doorway out */}
            <S tex={roomTex} w={0.5} h={8} x={ROOM_X1} y={4} z={-1} />

            {/* ELEVATOR + sign */}
            <S tex={elevatorTex} w={2.6} h={4.2} x={-8} y={2.1} z={-1} />
            <S tex={signTexE} w={2.4} h={0.7} x={-8} y={4.6} z={-1} transparent />

            {/* PLANT (room, near the doorway) */}
            <S tex={potTex} w={1.0} h={1.2} x={-3.6} y={0.6} z={0} transparent />

            {/* OUTSIDE: BASEPLATE sign on a post */}
            <S tex={postTex} w={0.25} h={1.6} x={4} y={0.8} z={-0.6} />
            <S tex={signTexB} w={2.6} h={0.7} x={4} y={1.9} z={-0.5} transparent />

            {/* PLAYER placeholder (side view) + go-right hint */}
            <S tex={heroTex} w={1.0} h={1.5} x={-2.8} y={0.75} z={0.2} transparent />
            <S tex={arrowTex} w={1.0} h={0.6} x={-1.4} y={1.1} z={0.2} transparent />
        </group>
    );
};

export default Floor4Scene2D;
