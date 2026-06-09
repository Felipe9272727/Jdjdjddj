/**
 * Floor4Player2D.tsx — the controllable side-view player for the 2D Floor 4.
 * Walks left/right, flips to face its direction, and the ORTHOGRAPHIC camera
 * follows its X (clamped to the world).
 *
 * SPRITE: the game's "bacon hair" avatar reimagined as side-view pixel art —
 * 20×30 px per frame, auto dark OUTLINE, shaded hair/skin/shirt/pants,
 * 2-frame breathing idle + 4-frame walk cycle with arm swing and head bob.
 * (Still procedural; swappable for Felipe's sheet per FLOOR4.md §8 — only
 * FRAMES/IDLE_FRAMES change, movement stays.)
 *
 * ARRIVAL: spawns INSIDE the elevator (tucked between the 2D cab and its
 * doors) and stays locked while `lockRef` is true — the intro director flips it
 * once the doors finish sliding open, and the player steps out. Walking back
 * left into the elevator (after having actually left it) fires onExit.
 */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';
import { FLOOR4_WORLD, FLOOR4_ELEVATOR_X } from './Floor4Scene2D';

const PC = {
    hair: '#7a4a24', hairDk: '#5a3315', hairLt: '#94613a',
    skin: '#e8b48a', skinDk: '#c99770',
    shirt: '#3b6fb0', shirtDk: '#2c5489', shirtLt: '#4f83c4',
    pants: '#3d6b35', pantsDk: '#2b4d24',
    shoe: '#2a2118', shoeLt: '#473a2b',
    eye: '#11131c', outline: '#14161c',
};

/** Trace a 1px dark outline around every opaque region (two-pass over pixels). */
function outline(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const img = ctx.getImageData(0, 0, w, h);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
    ctx.fillStyle = PC.outline;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (a(x, y) > 0) continue;
            if (a(x - 1, y) > 120 || a(x + 1, y) > 120 || a(x, y - 1) > 120 || a(x, y + 1) > 120) {
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
}

type Pose = { legs: 0 | 1 | 2 | 3; arm: number; bob: number };

/** Side view, facing RIGHT. `legs`: 0 stride / 1 pass / 2 stride(mirror) / 3 pass.
 *  `arm`: front-arm swing −1(back)..1(forward). `bob`: body lowered N px. */
function heroFrame({ legs, arm, bob }: Pose): THREE.CanvasTexture {
    return pixelTex(20, 30, (ctx) => {
        ctx.clearRect(0, 0, 20, 30);
        const b = bob;

        // ── back arm (behind the torso, darker) ──
        const bax = Math.round(-arm * 2);                 // swings opposite the front arm
        px(ctx, 7 + bax, 12 + b, 2, 6, PC.shirtDk);
        px(ctx, 7 + bax, 18 + b, 2, 2, PC.skinDk);        // hand

        // ── legs ──
        if (legs === 0) {           // stride: front leg forward, back leg back
            px(ctx, 10, 20, 3, 6, PC.pants); px(ctx, 11, 24, 3, 2, PC.pants);
            px(ctx, 6, 20, 3, 6, PC.pantsDk); px(ctx, 5, 24, 3, 2, PC.pantsDk);
            px(ctx, 12, 26, 4, 2, PC.shoe); px(ctx, 4, 26, 4, 2, PC.shoe);
            px(ctx, 13, 26, 2, 1, PC.shoeLt);
        } else if (legs === 2) {    // stride mirrored
            px(ctx, 6, 20, 3, 6, PC.pants); px(ctx, 5, 24, 3, 2, PC.pants);
            px(ctx, 10, 20, 3, 6, PC.pantsDk); px(ctx, 11, 24, 3, 2, PC.pantsDk);
            px(ctx, 4, 26, 4, 2, PC.shoe); px(ctx, 12, 26, 4, 2, PC.shoe);
            px(ctx, 5, 26, 2, 1, PC.shoeLt);
        } else {                    // passing: legs together, one knee lifted
            const lift = legs === 1 ? 1 : 0;
            px(ctx, 8, 20, 3, 7 - lift, PC.pants);
            px(ctx, 7, 20, 2, 6, PC.pantsDk);
            px(ctx, 8, 27 - lift, 4, 2, PC.shoe);
            px(ctx, 6, 26, 3, 2, PC.shoe);
            px(ctx, 9, 27 - lift, 2, 1, PC.shoeLt);
        }

        // ── torso (shirt) ──
        px(ctx, 6, 11 + b, 9, 9, PC.shirt);
        px(ctx, 6, 11 + b, 2, 9, PC.shirtDk);             // back shading
        px(ctx, 13, 11 + b, 2, 9, PC.shirtLt);            // chest light
        px(ctx, 6, 19 + b, 9, 1, PC.shirtDk);             // hem

        // ── front arm (sleeve + hand), swings with the walk ──
        const fax = Math.round(arm * 2);
        px(ctx, 11 + fax, 12 + b, 3, 5, PC.shirt);
        px(ctx, 11 + fax, 12 + b, 1, 5, PC.shirtDk);
        px(ctx, 11 + fax, 17 + b, 3, 3, PC.skin);         // hand
        px(ctx, 11 + fax, 19 + b, 3, 1, PC.skinDk);

        // ── head ──
        px(ctx, 6, 3 + b, 9, 7, PC.skin);                 // face block
        px(ctx, 6, 8 + b, 9, 2, PC.skinDk);               // jaw shadow
        px(ctx, 14, 6 + b, 1, 2, PC.skinDk);              // nose hint
        px(ctx, 11, 5 + b, 2, 2, '#ffffff');              // eye
        px(ctx, 12, 5 + b, 1, 2, PC.eye);
        // bacon hair: swept top + back
        px(ctx, 5, 1 + b, 10, 3, PC.hair);
        px(ctx, 5, 3 + b, 3, 5, PC.hair);                 // back of head
        px(ctx, 5, 1 + b, 10, 1, PC.hairLt);              // shine
        px(ctx, 12, 3 + b, 3, 1, PC.hair);                // fringe over the brow
        px(ctx, 5, 6 + b, 2, 2, PC.hairDk);               // nape shadow
        // neck
        px(ctx, 9, 10 + b, 4, 1, PC.skinDk);

        outline(ctx, 20, 30);
    });
}

// walk: stride → pass → stride(mirror) → pass; arms swing opposite the legs
const FRAMES = [
    heroFrame({ legs: 0, arm: 1, bob: 0 }),
    heroFrame({ legs: 1, arm: 0, bob: 1 }),
    heroFrame({ legs: 2, arm: -1, bob: 0 }),
    heroFrame({ legs: 3, arm: 0, bob: 1 }),
];
const IDLE_FRAMES = [
    heroFrame({ legs: 3, arm: 0.2, bob: 0 }),
    heroFrame({ legs: 3, arm: 0.2, bob: 1 }),     // breathing
];
const SPEED = 5;
// While locked inside, sit between the 2D elevator's cab (z=-1.0) and its
// doors (z=-0.95) so the doors visually reveal the player as they slide open.
const Z_INSIDE = -0.975, Z_OUT = 0.3;

export const Floor4Player2D: React.FC<{
    dirRef: React.MutableRefObject<number>;
    lockRef?: React.MutableRefObject<boolean>;
    /** Frozen while a lore panel is open (Floor4Interact). */
    uiLockRef?: React.MutableRefObject<boolean>;
    /** Written every frame — the interact layer reads the player's x. */
    playerXRef?: React.MutableRefObject<number>;
    onExit?: () => void;
}> = ({ dirRef, lockRef, uiLockRef, playerXRef, onExit }) => {
    const { camera, size } = useThree();
    const ref = useRef<THREE.Mesh>(null!);
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    const x = useRef(FLOOR4_ELEVATOR_X);    // arrives inside the elevator
    const facing = useRef(1);
    const walkT = useRef(0);
    const idleT = useRef(0);
    const wasOut = useRef(false);           // must actually LEAVE before re-entering exits
    const exited = useRef(false);

    useFrame((_, dt) => {
        const sdt = Math.min(dt, 0.05);
        const locked = (lockRef?.current ?? false) || (uiLockRef?.current ?? false);
        const d = locked ? 0 : dirRef.current;
        if (d !== 0) { facing.current = d; x.current += d * SPEED * sdt; walkT.current += sdt; idleT.current = 0; }
        else idleT.current += sdt;
        x.current = THREE.MathUtils.clamp(x.current, FLOOR4_ELEVATOR_X, FLOOR4_WORLD.right - 0.5);
        if (playerXRef) playerXRef.current = x.current;
        if (x.current > FLOOR4_ELEVATOR_X + 1.2) wasOut.current = true;

        // animation frame: 4-frame walk cycle / 2-frame breathing idle
        const tex = d !== 0
            ? FRAMES[Math.floor(walkT.current * 9) % 4]
            : IDLE_FRAMES[Math.floor(idleT.current * 1.6) % 2];
        if (matRef.current && matRef.current.map !== tex) { matRef.current.map = tex; matRef.current.needsUpdate = true; }

        if (ref.current) {
            ref.current.position.x = x.current;
            ref.current.position.y = FLOOR4_WORLD.groundY + 0.75 + (d !== 0 ? Math.abs(Math.sin(walkT.current * 10)) * 0.04 : 0);
            ref.current.position.z = locked ? Z_INSIDE : Z_OUT;
            ref.current.scale.x = facing.current;     // flip to face the move direction
        }

        // camera follows X, clamped so it never shows past the world edges
        const oc = camera as THREE.OrthographicCamera;
        const half = (size.width / 2) / oc.zoom;
        const minX = FLOOR4_WORLD.left + half, maxX = FLOOR4_WORLD.right - half;
        camera.position.x = minX <= maxX ? THREE.MathUtils.clamp(x.current, minX, maxX) : (FLOOR4_WORLD.left + FLOOR4_WORLD.right) / 2;

        // walk left back into the elevator → leave the floor
        if (!exited.current && !locked && wasOut.current && x.current <= FLOOR4_ELEVATOR_X + 0.3 && d < 0) {
            exited.current = true; onExit?.();
        }
    });

    return (
        <mesh ref={ref} position={[FLOOR4_ELEVATOR_X, 0.75, Z_INSIDE]}>
            <planeGeometry args={[1.0, 1.5]} />
            <meshBasicMaterial ref={matRef} map={FRAMES[0]} transparent alphaTest={0.5} toneMapped={false} />
        </mesh>
    );
};

export default Floor4Player2D;
