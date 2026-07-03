/**
 * floor7-dev.tsx — RUNNER isolado do Andar 7 REAL (Constelação).
 * Monta o MESMO Floor7Environment que o jogo usa, num Canvas próprio com
 * OrbitControls + cápsula de escala no pad inicial. Dev-only; o Floor7.tsx
 * renderizado aqui SHIP no jogo.
 *
 * Rodar:  cd jubileu && npm run dev  →  http://localhost:3000/floor7.html
 * Shot:   node dev-shot.cjs floor7.html floor7
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Floor7Environment } from './Floor7';
import { QUALITY_PROFILES } from './Settings';

const playerRef = { current: new THREE.Vector3(0, 0, -5) };

createRoot(document.getElementById('root')!).render(
    <Canvas camera={{ position: [16, 12, -14], fov: 55 }} shadows={false}>
        <Floor7Environment playerPositionRef={playerRef} profile={QUALITY_PROFILES.high} />
        {/* cápsula de escala no pad inicial */}
        <mesh position={[0, 0.9, -5]}>
            <capsuleGeometry args={[0.35, 0.9, 4, 10]} />
            <meshStandardMaterial color="#e39a45" />
        </mesh>
        <OrbitControls target={[0, 5, 20]} />
    </Canvas>,
);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 400);
