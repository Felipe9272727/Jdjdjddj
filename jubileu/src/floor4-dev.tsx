/**
 * floor4-dev.tsx — isolated RUNNER for the REAL Floor 4.
 *
 * It mounts the SAME `Floor4` components that ship in the game (imported from
 * ./Floor4), just on their own — no App.tsx, no other floors, no Firebase — so
 * the floor can be built + screenshot-tested in isolation without re-reading the
 * 2140-line App.tsx. Edit Floor4.tsx (+ its helpers) and it both shows up here
 * AND ships in the game (App mounts it at level 4). Tiny App wiring is left for
 * the very end (see jubileu/FLOOR4.md §2).
 *
 * Only THIS runner (floor4.html / this file / dev-shot.cjs) is dev-only: the
 * production build inlines index.html, so the runner never ships — but the
 * Floor4.tsx it renders DOES. Vite's dev server serves it at /floor4.html.
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
