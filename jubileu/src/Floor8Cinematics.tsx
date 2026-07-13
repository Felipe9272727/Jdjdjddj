/** Camera director for the 3D interrogation beats. Mount AFTER Player. */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f8 } from './f8Arquivo';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const Floor8Cinematics: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const look = useRef(v(0, 1.05, -0.65));
    const pos = useRef(v(0.8, 1.5, -3.25));

    useFrame((_, rawDt) => {
        const active = f8.phase === 'interrogatorio' || f8.phase === 'entregaImagem' || f8.phase === 'leave';
        if (!active) return;
        const dt = Math.min(rawDt, 0.05);
        let wantP = v(1.12, 1.48, -3.18);
        let wantL = v(0, 1.03, -0.63);
        if (f8.phase === 'interrogatorio') {
            if (f8.line === 2 || f8.line >= 8) { wantP = v(1.18, 1.34, -2.76); wantL = v(-0.05, 1.02, -1.1); }
            else if (f8.line === 3 || f8.line === 4) { wantP = v(-0.62, 1.46, -3.0); wantL = v(0, 1.04, -0.68); }
            else if (f8.line >= 5) { wantP = v(1.02, 1.42, -2.82); wantL = v(0, 1.08, -0.62); }
        } else if (f8.phase === 'entregaImagem') {
            wantP = v(1.15, 2.05, -2.95); wantL = v(0.02, 0.98, -1.48);
        } else {
            wantP = v(-0.55, 1.5, -2.82); wantL = v(0, 1.05, -0.62);
        }
        const k = 1 - Math.exp(-dt * 3.2);
        pos.current.lerp(wantP, k); look.current.lerp(wantL, k);
        camera.position.copy(pos.current);
        camera.lookAt(look.current);
        if ('fov' in camera) {
            const c = camera as THREE.PerspectiveCamera;
            const targetFov = f8.phase === 'entregaImagem' ? 48 : 55;
            c.fov += (targetFov - c.fov) * k; c.updateProjectionMatrix();
        }
    });
    return null;
};

export default Floor8Cinematics;
