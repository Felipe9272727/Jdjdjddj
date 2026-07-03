/**
 * floor6-dev.tsx — RUNNER isolado do Andar 6 REAL (Labirinto Amarelo).
 * Monta o MESMO Floor6Environment que o jogo usa, num Canvas próprio com
 * OrbitControls e um "player fake" que anda pelo corredor (pra Entidade ter
 * o que caçar). Dev-only; o Floor6.tsx renderizado aqui SHIP no jogo.
 *
 * Rodar:  cd jubileu && npm run dev  →  http://localhost:3000/floor6.html
 * Shot:   node dev-shot.cjs floor6.html floor6
 */
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Floor6Environment } from './Floor6';
import { QUALITY_PROFILES } from './Settings';

const playerRef = { current: new THREE.Vector3(0, 0, -4) };

// player fake: vai e volta pelo corredor de entrada (dá alvo pra Entidade)
const FakePlayer: React.FC = () => {
    const mesh = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        playerRef.current.set(0, 0, -4 + Math.sin(t * 0.4) * 5 + 5);
        mesh.current.position.set(playerRef.current.x, 0.9, playerRef.current.z);
    });
    return (
        <mesh ref={mesh}>
            <capsuleGeometry args={[0.35, 0.9, 4, 10]} />
            <meshStandardMaterial color="#e39a45" />
        </mesh>
    );
};

createRoot(document.getElementById('root')!).render(
    <Canvas camera={{ position: [0, 1.6, -8.5], fov: 75 }} shadows={false}>
        <Floor6Environment
            playerPositionRef={playerRef}
            onPlayerCaught={() => console.log('[floor6 dev] CAUGHT!')}
            profile={QUALITY_PROFILES.high}
        />
        <FakePlayer />
        <OrbitControls target={[0, 1.3, 4]} />
    </Canvas>,
);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 400);
