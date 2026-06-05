/**
 * Floor4Player2D.tsx — the controllable side-view player for the 2D Floor 4.
 * Walks left/right on the flat baseplate, flips to face its direction, a 2-frame
 * walk cycle, and the ORTHOGRAPHIC camera follows its X (clamped to the world).
 * Walking left into the elevator fires onExit (ride back down).
 *
 * Placeholder pixel sprite for now — swap FRAMES for Felipe's side-view sheet
 * (FLOOR4.md §8) when it arrives; the movement/flip/follow stays the same.
 */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTex, px } from './floor4-pixels';
import { FLOOR4_WORLD, FLOOR4_ELEVATOR_X } from './Floor4Scene2D';

const PC = { skin: '#e8b48a', hair: '#7a4a24', shirt: '#3b6fb0', pants: '#2c3550', shoe: '#23262f', eye: '#11131a' };

// Side-view, facing RIGHT. `step` shifts the legs for the walk cycle.
function heroFrame(step: 0 | 1): THREE.CanvasTexture {
    return pixelTex(16, 24, (ctx) => {
        ctx.clearRect(0, 0, 16, 24);
        px(ctx, 4, 1, 8, 6, PC.hair);
        px(ctx, 5, 4, 7, 5, PC.skin);
        px(ctx, 10, 5, 2, 2, PC.eye);          // eye on the right (facing right)
        px(ctx, 4, 9, 8, 7, PC.shirt);
        const a = step;                          // legs alternate
        px(ctx, 4 + a, 16, 3, 5, PC.pants); px(ctx, 9 - a, 16, 3, 5, PC.pants);
        px(ctx, 3 + a, 21, 4, 2, PC.shoe);  px(ctx, 9 - a, 21, 4, 2, PC.shoe);
    });
}
const FRAMES = [heroFrame(0), heroFrame(1)];
const SPEED = 5;

export const Floor4Player2D: React.FC<{ dirRef: React.MutableRefObject<number>; onExit?: () => void }> = ({ dirRef, onExit }) => {
    const { camera, size } = useThree();
    const ref = useRef<THREE.Mesh>(null!);
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    const x = useRef(-3);
    const facing = useRef(1);
    const walkT = useRef(0);
    const exited = useRef(false);

    useFrame((_, dt) => {
        const sdt = Math.min(dt, 0.05);
        const d = dirRef.current;
        if (d !== 0) { facing.current = d; x.current += d * SPEED * sdt; walkT.current += sdt; }
        x.current = THREE.MathUtils.clamp(x.current, FLOOR4_ELEVATOR_X, FLOOR4_WORLD.right - 0.5);

        // walk-cycle frame
        const frame = d !== 0 ? (Math.floor(walkT.current * 8) % 2) : 0;
        if (matRef.current && matRef.current.map !== FRAMES[frame]) { matRef.current.map = FRAMES[frame]; matRef.current.needsUpdate = true; }

        if (ref.current) {
            ref.current.position.x = x.current;
            ref.current.position.y = FLOOR4_WORLD.groundY + 0.75 + (d !== 0 ? Math.abs(Math.sin(walkT.current * 10)) * 0.04 : 0);
            ref.current.scale.x = facing.current;     // flip to face the move direction
        }

        // camera follows X, clamped so it never shows past the world edges
        const oc = camera as THREE.OrthographicCamera;
        const half = (size.width / 2) / oc.zoom;
        const minX = FLOOR4_WORLD.left + half, maxX = FLOOR4_WORLD.right - half;
        camera.position.x = minX <= maxX ? THREE.MathUtils.clamp(x.current, minX, maxX) : (FLOOR4_WORLD.left + FLOOR4_WORLD.right) / 2;

        // walk left into the elevator → leave the floor
        if (!exited.current && x.current <= FLOOR4_ELEVATOR_X + 0.3 && d < 0) { exited.current = true; onExit?.(); }
    });

    return (
        <mesh ref={ref} position={[-3, 0.75, 0.3]}>
            <planeGeometry args={[1.0, 1.5]} />
            <meshBasicMaterial ref={matRef} map={FRAMES[0]} transparent alphaTest={0.5} toneMapped={false} />
        </mesh>
    );
};

export default Floor4Player2D;
