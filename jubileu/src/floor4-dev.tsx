/**
 * floor4-dev.tsx — isolated RUNNER for the REAL Floor 4 (the 2D side-scroller).
 *
 * Mounts the SAME Floor 4 scene that ships in the game — under an ORTHOGRAPHIC
 * camera, so it's a TRUE 2D view (zero perspective), not a 3D scene with flat
 * textures. No App.tsx / other floors / Firebase. Edit Floor4Scene2D.tsx → it
 * shows here AND ships. Only this runner (floor4.html / this file / dev-shot.cjs)
 * is dev-only; the Floor 4 scene it renders DOES ship.
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor4.html
 * Shot: node dev-shot.cjs floor4.html floor4
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import Floor4Scene2D from './Floor4Scene2D';

const Floor4Dev: React.FC = () => (
    <Canvas
        orthographic
        camera={{ position: [0, 3, 10], zoom: 48, near: 0.1, far: 100 }}
        gl={{ preserveDrawingBuffer: true }}
    >
        <Floor4Scene2D />
    </Canvas>
);

createRoot(document.getElementById('root')!).render(<Floor4Dev />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
