/**
 * Floor4Elevator.tsx — the elevator, recreated ENTIRELY in 2D pixel-art for the
 * 2D Floor 4 (no 3D ElevatorFacade here). Everything is flat planes textured with
 * procedurally-drawn pixel art (CanvasTexture + NearestFilter), so it reads as a
 * crisp retro sprite even though it lives in the first-person 3D camera.
 *
 * Self-contained (part of the Floor 4 "app"): uses only procedural canvas textures
 * — NO external/GitHub assets — so it renders offline in the dev workbench too.
 *
 * Layering (front→back along +Z): frame (transparent center) > doors > shaft.
 * `open` (0..1) slides the two doors apart; leave it undefined for a slow demo
 * open/close (handy in the workbench). In game, drive it from `doorsClosed`.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';

// ── Pixel palette (retro service elevator) ───────────────────────────────────
const C = {
    frame:   '#3b4150', frameLt: '#5b6275', frameDk: '#23262f',
    door:    '#6c7283', doorLt:  '#888fa3', doorDk:  '#494e5c', seam: '#2b2e37',
    shaft:   '#0c0d12', shaftLt: '#171a22',
    panel:   '#0e1016', num:     '#ffd24a', arrow:   '#7CFF6B', rivet: '#1c1f27',
};

// Plane helper with a pixel texture + alpha + unlit material (true flat 2D look).
const Sprite2D: React.FC<{
    tex: THREE.Texture; w: number; h: number;
    position?: [number, number, number]; transparent?: boolean;
}> = ({ tex, w, h, position = [0, 0, 0], transparent = false }) => (
    <mesh position={position}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent={transparent} alphaTest={transparent ? 0.5 : 0} toneMapped={false} />
    </mesh>
);

const FRAME_W = 64, FRAME_H = 96;   // pixel-art resolution of the frame
const DOOR_W = 24, DOOR_H = 80;     // each door panel

export const Floor4Elevator2D: React.FC<{ open?: number; position?: [number, number, number] }> = ({
    open, position = [0, 0, 0],
}) => {
    const leftRef = useRef<THREE.Group>(null!);
    const rightRef = useRef<THREE.Group>(null!);
    const demo = useRef(0);

    // ── Frame: a chunky beveled doorway with a TRANSPARENT center opening ──
    const frameTex = useMemo(() => pixelTex(FRAME_W, FRAME_H, (ctx) => {
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);                  // transparent
        px(ctx, 0, 0, FRAME_W, FRAME_H, C.frame);              // full slab
        // opening (cut out the center → transparent so doors show through)
        const ox = 10, oy = 8, ow = FRAME_W - 20, oh = FRAME_H - 14;
        ctx.clearRect(ox, oy, ow, oh);
        // bevel: light top/left, dark bottom/right (both outer + inner edges)
        px(ctx, 0, 0, FRAME_W, 2, C.frameLt); px(ctx, 0, 0, 2, FRAME_H, C.frameLt);
        px(ctx, 0, FRAME_H - 2, FRAME_W, 2, C.frameDk); px(ctx, FRAME_W - 2, 0, 2, FRAME_H, C.frameDk);
        px(ctx, ox - 2, oy - 2, ow + 4, 2, C.frameDk); px(ctx, ox - 2, oy - 2, 2, oh + 4, C.frameDk);
        px(ctx, ox - 2, oy + oh, ow + 4, 2, C.frameLt); px(ctx, ox + ow, oy - 2, 2, oh + 4, C.frameLt);
        // corner rivets
        for (const [rx, ry] of [[3, 3], [FRAME_W - 6, 3], [3, FRAME_H - 6], [FRAME_W - 6, FRAME_H - 6]])
            px(ctx, rx, ry, 3, 3, C.rivet);
        // indicator housing above the opening
        px(ctx, FRAME_W / 2 - 9, 2, 18, 5, C.panel);
    }), []);

    // ── Door panel: brushed metal with a center seam + panel grooves ──
    const doorTex = useMemo(() => pixelTex(DOOR_W, DOOR_H, (ctx) => {
        px(ctx, 0, 0, DOOR_W, DOOR_H, C.door);
        px(ctx, 0, 0, DOOR_W, 2, C.doorLt); px(ctx, 0, 0, 2, DOOR_H, C.doorLt);
        px(ctx, 0, DOOR_H - 2, DOOR_W, 2, C.doorDk); px(ctx, DOOR_W - 2, 0, 2, DOOR_H, C.doorDk);
        // recessed panel
        px(ctx, 4, 8, DOOR_W - 8, DOOR_H - 16, C.doorDk);
        px(ctx, 6, 10, DOOR_W - 12, DOOR_H - 20, C.door);
        // vertical highlight grooves
        for (let gx = 9; gx < DOOR_W - 8; gx += 5) px(ctx, gx, 12, 1, DOOR_H - 24, C.doorLt);
    }), []);

    // ── Dark shaft behind the doors ──
    const shaftTex = useMemo(() => pixelTex(48, 80, (ctx) => {
        px(ctx, 0, 0, 48, 80, C.shaft);
        for (let y = 4; y < 80; y += 10) px(ctx, 0, y, 48, 1, C.shaftLt);   // faint guide rails
        px(ctx, 22, 0, 4, 80, C.shaftLt);                                    // cable
    }), []);

    // ── Indicator: a lit floor "4" + up arrow ──
    const indTex = useMemo(() => pixelTex(40, 12, (ctx) => {
        px(ctx, 0, 0, 40, 12, C.panel);
        px(ctx, 1, 1, 38, 10, '#05060a');
        // up arrow (left)
        px(ctx, 7, 7, 6, 1, C.arrow); px(ctx, 8, 6, 4, 1, C.arrow); px(ctx, 9, 5, 2, 1, C.arrow); px(ctx, 9, 4, 2, 3, C.arrow);
        // "4" (right) — blocky
        px(ctx, 24, 3, 2, 4, C.num); px(ctx, 24, 6, 8, 2, C.num); px(ctx, 30, 3, 2, 6, C.num);
    }), []);

    const DOORW = 1.45, DOORH = 4.8, OPEN_X = 1.5;

    useFrame((_, dt) => {
        let o = open;
        if (o === undefined) { demo.current += dt; o = (Math.sin(demo.current * 0.7) * 0.5 + 0.5); }   // workbench demo
        const slide = THREE.MathUtils.clamp(o, 0, 1) * OPEN_X;
        if (leftRef.current) leftRef.current.position.x = -DOORW / 2 - slide;
        if (rightRef.current) rightRef.current.position.x = DOORW / 2 + slide;
    });

    return (
        <group position={position}>
            {/* dark shaft */}
            <Sprite2D tex={shaftTex} w={3.0} h={DOORH} position={[0, DOORH / 2 + 0.1, 0.0]} />
            {/* sliding doors (clipped to the opening width by the frame in front) */}
            <group ref={leftRef} position={[-DOORW / 2, DOORH / 2 + 0.1, 0.05]}>
                <Sprite2D tex={doorTex} w={DOORW} h={DOORH} />
            </group>
            <group ref={rightRef} position={[DOORW / 2, DOORH / 2 + 0.1, 0.05]}>
                <Sprite2D tex={doorTex} w={DOORW} h={DOORH} />
            </group>
            {/* frame (transparent center) in front */}
            <Sprite2D tex={frameTex} w={4.2} h={6.3} position={[0, 3.15, 0.12]} transparent />
            {/* floor indicator */}
            <Sprite2D tex={indTex} w={1.5} h={0.45} position={[0, 6.05, 0.18]} transparent />
        </group>
    );
};

export default Floor4Elevator2D;
