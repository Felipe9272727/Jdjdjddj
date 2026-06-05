/**
 * Floor4Elevator.tsx — the elevator in 2D pixel-art, restyled to match the real
 * 3D one (Elevator.tsx): SILVER double doors (#B0BEC5), a dark header with the
 * GOLD "THE NORMAL ELEVATOR" sign, gold trim, a call panel with red/green LEDs,
 * and a dark shaft behind the doors. Flat planes + procedural CanvasTexture
 * (NearestFilter) — no external assets, renders offline.
 *
 * `open` (0..1) slides the doors apart (default 0 = closed). Layering front→back:
 * frame (transparent center) > doors > shaft.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';

// Palette mirrored from the 3D elevator.
const C = {
    door: '#B0BEC5', doorLt: '#cfd8dc', doorDk: '#78909c', seam: '#5b6770',
    frame: '#2b3238', frameLt: '#48606b', frameDk: '#161b1f',
    gold: '#FFD54F', goldDk: '#bf9a2e',
    header: '#141414', shaft: '#0a0b0f', shaftLt: '#1b1f27',
    panel: '#0e1016', red: '#FF5252', green: '#81C784', white: '#f4f0e6',
};

const Sprite: React.FC<{ tex: THREE.Texture; w: number; h: number; position?: [number, number, number]; transparent?: boolean }> =
    ({ tex, w, h, position = [0, 0, 0], transparent }) => (
        <mesh position={position}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex} transparent={transparent} alphaTest={transparent ? 0.5 : 0} toneMapped={false} />
        </mesh>
    );

const FW = 72, FH = 112;   // frame texture res

export const Floor4Elevator2D: React.FC<{ open?: number; position?: [number, number, number]; scale?: number }> = ({
    open = 0, position = [0, 0, 0], scale = 1,
}) => {
    const leftRef = useRef<THREE.Group>(null!);
    const rightRef = useRef<THREE.Group>(null!);

    // ── Frame: dark metal surround + GOLD trim, TRANSPARENT door opening ──
    const frameTex = useMemo(() => pixelTex(FW, FH, (ctx) => {
        ctx.clearRect(0, 0, FW, FH);
        px(ctx, 0, 0, FW, FH, C.frame);
        // door opening cut-out
        const ox = 10, oy = 18, ow = FW - 20, oh = FH - 26;
        ctx.clearRect(ox, oy, ow, oh);
        // outer bevel
        px(ctx, 0, 0, FW, 3, C.frameLt); px(ctx, 0, 0, 3, FH, C.frameLt);
        px(ctx, 0, FH - 3, FW, 3, C.frameDk); px(ctx, FW - 3, 0, 3, FH, C.frameDk);
        // GOLD trim ringing the opening
        px(ctx, ox - 3, oy - 3, ow + 6, 2, C.gold); px(ctx, ox - 3, oy - 3, 2, oh + 6, C.goldDk);
        px(ctx, ox - 3, oy + oh + 1, ow + 6, 2, C.goldDk); px(ctx, ox + ow + 1, oy - 3, 2, oh + 6, C.gold);
        // header bar (dark) with the GOLD sign
        px(ctx, 4, 3, FW - 8, 12, C.header);
        px(ctx, 4, 3, FW - 8, 1, C.goldDk); px(ctx, 4, 14, FW - 8, 1, C.goldDk);
        ctx.fillStyle = C.gold; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('THE NORMAL ELEVATOR', FW / 2, 9);
        // call panel (right of the opening) — LEDs + floor "4"
        px(ctx, FW - 8, oy + 8, 6, 22, C.panel);
        px(ctx, FW - 6, oy + 11, 2, 2, C.red); px(ctx, FW - 6, oy + 15, 2, 2, C.green);
        px(ctx, FW - 7, oy + 20, 4, 6, '#05060a'); // tiny floor display
        ctx.fillStyle = C.green; ctx.font = 'bold 5px monospace'; ctx.fillText('4', FW - 5, oy + 23.5);
    }), []);

    // ── Silver door panel ──
    const doorTex = useMemo(() => pixelTex(28, 88, (ctx) => {
        px(ctx, 0, 0, 28, 88, C.door);
        px(ctx, 0, 0, 28, 2, C.doorLt); px(ctx, 0, 0, 2, 88, C.doorLt);
        px(ctx, 0, 86, 28, 2, C.doorDk); px(ctx, 26, 0, 2, 88, C.doorDk);
        px(ctx, 5, 6, 18, 76, C.doorDk); px(ctx, 7, 8, 14, 72, C.door);   // recessed panel
        for (let gx = 9; gx < 20; gx += 4) px(ctx, gx, 12, 1, 64, C.doorLt);  // grooves
        px(ctx, 4, 40, 20, 2, C.seam);                                    // mid handle line
    }), []);

    // ── Dark shaft (seen when doors open) ──
    const shaftTex = useMemo(() => pixelTex(48, 80, (ctx) => {
        px(ctx, 0, 0, 48, 80, C.shaft);
        for (let y = 4; y < 80; y += 9) px(ctx, 0, y, 48, 1, C.shaftLt);
        px(ctx, 22, 0, 4, 80, C.shaftLt);   // cable
    }), []);

    const DOORW = 1.55, DOORH = 4.0, OPEN_X = 1.45, OPEN = THREE.MathUtils.clamp(open, 0, 1);

    useFrame(() => {
        const slide = OPEN * OPEN_X;
        if (leftRef.current) leftRef.current.position.x = -DOORW / 2 - slide;
        if (rightRef.current) rightRef.current.position.x = DOORW / 2 + slide;
    });

    return (
        <group position={position} scale={[scale, scale, scale]}>
            <Sprite tex={shaftTex} w={3.1} h={DOORH} position={[0, DOORH / 2 + 0.2, 0]} />
            <group ref={leftRef} position={[-DOORW / 2, DOORH / 2 + 0.2, 0.05]}><Sprite tex={doorTex} w={DOORW} h={DOORH} /></group>
            <group ref={rightRef} position={[DOORW / 2, DOORH / 2 + 0.2, 0.05]}><Sprite tex={doorTex} w={DOORW} h={DOORH} /></group>
            <Sprite tex={frameTex} w={4.0} h={6.2} position={[0, 3.1, 0.12]} transparent />
        </group>
    );
};

export default Floor4Elevator2D;
