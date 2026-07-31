/**
 * Floor4Elevator.tsx — the elevator in 2D pixel-art, restyled to match the real
 * 3D one (Elevator.tsx): SILVER double doors (#B0BEC5), a dark header with the
 * GOLD "THE NORMAL ELEVATOR" sign, gold trim, a call panel with red/green LEDs,
 * and — behind the doors — the LIT CAB INTERIOR (the same cab the player rode
 * up in, in 2D: silver panelled walls, glowing ceiling light bar, handrail,
 * button panel, dark floor), plus warm light spilling out as the doors open.
 * Flat planes + procedural CanvasTexture (NearestFilter) — no external assets.
 *
 * `open` (0..1) slides the doors apart (default 0 = closed). `openRef` does the
 * same but is read per-frame (no re-render) — used by the arrival intro, where
 * the doors slide open after the pixel-resolve. Layering front→back:
 * frame (transparent center) > side casings (hide the door overshoot) > doors >
 * light spill > cab interior.
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
    header: '#141414',
    // lit cab interior (warm, like the ride up)
    cab: '#8e96a3', cabLt: '#aab2bf', cabDk: '#6a7280', cabFloor: '#3a3f48',
    cabCeil: '#565d68', lamp: '#fff3d6', lampCore: '#ffffff', rail: '#d4d9e0',
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

export const Floor4Elevator2D: React.FC<{ open?: number; openRef?: React.MutableRefObject<number>; position?: [number, number, number]; scale?: number }> = ({
    open = 0, openRef, position = [0, 0, 0], scale = 1,
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

    // ── LIT CAB INTERIOR (seen when the doors open — you arrived in this) ──
    const cabTex = useMemo(() => pixelTex(48, 80, (ctx) => {
        px(ctx, 0, 0, 48, 80, C.cab);                                     // back wall
        for (let x = 0; x < 48; x += 12) px(ctx, x, 0, 1, 80, C.cabDk);   // wall panels
        px(ctx, 2, 10, 44, 1, C.cabLt);                                   // panel top trim
        // ceiling + glowing light bar
        px(ctx, 0, 0, 48, 8, C.cabCeil);
        px(ctx, 8, 2, 32, 4, C.lamp); px(ctx, 12, 3, 24, 2, C.lampCore);
        // warm light wash falling on the upper wall
        for (let y = 8; y < 26; y++) {
            const a = 0.22 * (1 - (y - 8) / 18);
            ctx.globalAlpha = a; px(ctx, 4, y, 40, 1, C.lamp);
        }
        ctx.globalAlpha = 1;
        // handrail across the back wall
        px(ctx, 3, 42, 42, 3, C.rail); px(ctx, 3, 45, 42, 1, C.cabDk);
        px(ctx, 5, 45, 2, 3, C.cabDk); px(ctx, 41, 45, 2, 3, C.cabDk);    // rail mounts
        // cab button panel (right wall edge)
        px(ctx, 41, 22, 6, 18, C.panel);
        px(ctx, 43, 24, 2, 2, C.green); px(ctx, 43, 28, 2, 2, C.red);
        px(ctx, 43, 32, 2, 2, C.white); px(ctx, 43, 36, 2, 2, C.white);
        // floor (dark, with the gold diamond inlay like the 3D cab)
        px(ctx, 0, 70, 48, 10, C.cabFloor);
        px(ctx, 0, 70, 48, 1, C.cabDk);
        px(ctx, 20, 72, 8, 5, C.goldDk); px(ctx, 22, 73, 4, 3, C.cabFloor);
        // baseboard
        px(ctx, 0, 67, 48, 3, C.cabDk);
    }), []);

    // Warm light spilling out of the open cab onto the floor outside.
    const spillTex = useMemo(() => pixelTex(48, 32, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 32);
        g.addColorStop(0, 'rgba(255,243,214,0.34)');
        g.addColorStop(1, 'rgba(255,243,214,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(38, 0); ctx.lineTo(48, 32); ctx.lineTo(0, 32);
        ctx.closePath(); ctx.fill();
    }), []);

    // Dark side casings flanking the doorway — they hide the door panels as
    // they slide past the frame (the 2D version of the door pockets).
    const casingTex = useMemo(() => pixelTex(20, 100, (ctx) => {
        px(ctx, 0, 0, 20, 100, C.frame);
        px(ctx, 0, 0, 3, 100, C.frameLt); px(ctx, 17, 0, 3, 100, C.frameDk);
        for (let y = 12; y < 100; y += 22) px(ctx, 4, y, 12, 1, C.frameDk);
    }), []);

    const DOORW = 1.55, DOORH = 4.0, OPEN_X = 1.45;
    const spillMat = useRef<THREE.MeshBasicMaterial>(null!);

    useFrame(() => {
        const o = THREE.MathUtils.clamp(openRef ? openRef.current : open, 0, 1);
        const slide = o * OPEN_X;
        if (leftRef.current) leftRef.current.position.x = -DOORW / 2 - slide;
        if (rightRef.current) rightRef.current.position.x = DOORW / 2 + slide;
        if (spillMat.current) spillMat.current.opacity = o * 0.85;   // light leaks as the doors part
    });

    return (
        <group position={position} scale={[scale, scale, scale]}>
            {/* lit cab interior (the player arrives standing in here) */}
            <Sprite tex={cabTex} w={3.1} h={DOORH} position={[0, DOORH / 2 + 0.2, 0]} />
            <group ref={leftRef} position={[-DOORW / 2, DOORH / 2 + 0.2, 0.05]}><Sprite tex={doorTex} w={DOORW} h={DOORH} /></group>
            <group ref={rightRef} position={[DOORW / 2, DOORH / 2 + 0.2, 0.05]}><Sprite tex={doorTex} w={DOORW} h={DOORH} /></group>
            {/* side casings — the door panels slide behind these, not into thin air */}
            <Sprite tex={casingTex} w={1.25} h={6.2} position={[-2.575, 3.1, 0.1]} />
            <Sprite tex={casingTex} w={1.25} h={6.2} position={[2.575, 3.1, 0.1]} />
            <Sprite tex={frameTex} w={4.0} h={6.2} position={[0, 3.1, 0.12]} transparent />
            {/* warm light spilling out the open doorway onto the floor outside */}
            <mesh position={[0, 0.45, 0.14]}>
                <planeGeometry args={[3.6, 1.3]} />
                <meshBasicMaterial ref={spillMat} map={spillTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
};

export default Floor4Elevator2D;
