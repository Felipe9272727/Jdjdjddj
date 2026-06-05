/**
 * floor4-dev.tsx — STANDALONE dev workbench for the Andar 4.
 *
 * Mounts ONLY the Floor 4 environment (no App.tsx, no other floors, no Firebase),
 * so Floor 4 can be built and screenshot-tested in isolation — without touching
 * the 2140-line App.tsx until the very end. Develop everything here (env, props,
 * entities, hazards, cutscenes), then do the small App.tsx wiring last
 * (see jubileu/FLOOR4.md §2).
 *
 * This file is DEV-ONLY: the production build (npm run build) inlines index.html
 * only, so floor4.html / this file never ship in the game's index.html. Vite's
 * dev server still serves it at /floor4.html.
 *
 * Run:    cd jubileu && npm run dev    →    http://localhost:3000/floor4.html
 * Shot:   node dev-shot.cjs floor4.html floor4   (needs the dev server up; see FLOOR4.md §4)
 *
 * Camera: OrbitControls — drag to orbit, scroll to zoom. The red capsule at the
 * origin is a ~1.8 m stand-in for the player (scale reference).
 *
 * As Floor 4 grows, drop new components into the marked slots and add window dev
 * hooks (e.g. cutscene scrubbing like Floor 3's __fallScrub) for deterministic shots.
 */
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Floor4Environment from './Floor4';

/** ~1.8 m capsule at the origin — where the player would stand (scale reference). */
const PlayerStandin: React.FC = () => (
    <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 1.1, 8, 16]} />
        <meshStandardMaterial color="#d05a3a" roughness={0.6} />
    </mesh>
);

const Floor4Dev: React.FC = () => (
    <Canvas shadows camera={{ position: [11, 8, 15], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
        <Suspense fallback={null}>
            {/* elevator={false}: its facade streams a texture from GitHub, which
                fails offline and would blank the render. The exit elevator isn't
                needed to build the floor; it's added back in the real App wiring. */}
            <Floor4Environment elevator={false} />
        </Suspense>

        {/* ── DEV STAND-INS (remove/replace as Floor 4 gets real content) ── */}
        <PlayerStandin />

        {/* Orbit camera + axes for inspecting the scene (X red / Y green / Z blue). */}
        <OrbitControls target={[0, 1, 0]} enableDamping />
        <axesHelper args={[3]} />
    </Canvas>
);

createRoot(document.getElementById('root')!).render(<Floor4Dev />);
// Signal for the Playwright screenshot tool that the app mounted.
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
