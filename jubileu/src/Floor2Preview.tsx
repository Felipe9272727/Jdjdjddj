/**
 * Floor2Preview.tsx — DEV-ONLY isolated render of the Floor 2 well + water.
 *
 * Mounted only when the URL contains `?f2preview` (see main.tsx). Renders the
 * Floor2Environment with a static player ref parked at the rim looking down
 * into the well, so the water grading can be screenshotted and tuned without
 * booting the whole game. Never reached in production.
 */

import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3 } from 'three';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useRef } from 'react';
import { Floor2Environment } from './Floor2';

export default function Floor2Preview() {
    // Park the "player" above the water (y >= swim threshold) so DynamicFog
    // uses the dry cave grade, matching how the well looks from the rim.
    const playerPositionRef = useRef(new Vector3(0, 1.0, 9));
    const noShards = useRef(new Set<number>()).current;
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            <Canvas
                shadows
                camera={{ position: [0, 2.6, 10.5], fov: 70, near: 0.1, far: 200 }}
                gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
            >
                <Suspense fallback={null}>
                    <Floor2Environment
                        playerPositionRef={playerPositionRef}
                        collectedShards={noShards}
                        onCollectShard={() => {}}
                        reflective
                    />
                </Suspense>
                <OrbitControls target={[0, -1.5, 5]} />
            </Canvas>
        </div>
    );
}
