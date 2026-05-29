/**
 * Floor3Preview.tsx — DEV-ONLY isolated render of the Floor 3 scene.
 *
 * Mounted only when the URL contains `?f3preview` (see main.tsx). It renders
 * Floor3Environment plus the exact Floor-3 postprocessing stack with a fixed
 * camera roughly at player eye level, so the scene can be screenshotted and
 * tuned without booting the whole game (audio, networking, player GLB, etc.).
 * Has no gameplay and is never reached in production.
 */

import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, N8AO } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import Floor3Environment from './Floor3';

export default function Floor3Preview() {
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            <Canvas
                shadows
                camera={{ position: window.location.search.includes('close') ? [0, 2.2, 8] : [0, 1.6, -8], fov: 70, near: 0.1, far: 200 }}
                gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
            >
                <Suspense fallback={null}>
                    <Floor3Environment elevator={false} />
                </Suspense>
                <OrbitControls target={[0, 1.5, 4]} />
                {!window.location.search.includes('nopost') && (
                <EffectComposer multisampling={0} enableNormalPass={false}>
                    <N8AO
                        screenSpaceRadius
                        aoRadius={16}
                        distanceFalloff={0.5}
                        intensity={1.4}
                        quality="performance"
                        halfRes
                        color="#0a0e1a"
                    />
                    <Bloom intensity={0.55} luminanceThreshold={0.80} luminanceSmoothing={0.20} mipmapBlur kernelSize={KernelSize.MEDIUM} />
                    <Vignette eskil={false} offset={0.28} darkness={0.55} />
                </EffectComposer>
                )}
            </Canvas>
        </div>
    );
}
