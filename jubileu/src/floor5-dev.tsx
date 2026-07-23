/** floor5-dev.tsx — offline workbench for Andar 5 (open /floor5.html). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Floor5Environment from './Floor5';

createRoot(document.getElementById('root')!).render(
    <Canvas camera={{ position: [12, 7, 16], fov: 55 }}>
        <Floor5Environment />
        <OrbitControls target={[2, 1.5, -4]} />
    </Canvas>,
);
