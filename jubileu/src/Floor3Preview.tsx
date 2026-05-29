/**
 * Floor3Preview.tsx — DEV-ONLY isolated render of the Floor 3 scene.
 *
 * Mounted only when the URL contains `?f3preview` (see main.tsx). It renders
 * Floor3Environment plus the exact Floor-3 postprocessing stack with a fixed
 * camera roughly at player eye level, so the scene can be screenshotted and
 * tuned without booting the whole game (audio, networking, player GLB, etc.).
 * Has no gameplay and is never reached in production.
 *
 * `?handsdebug` swaps the scene for the raw gloves GLB at the origin (identity
 * rotation, with an axes helper) so the model's native orientation can be read
 * directly and the first-person pose dialed in.
 */

import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, N8AO, HueSaturation } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { OrbitControls, useGLTF, Grid } from '@react-three/drei';
import { Suspense } from 'react';
import Floor3Environment from './Floor3';
import FpHands from './Floor3Hands';

function HandsDebug() {
    const { scene } = useGLTF('/cartoon_gloves.glb');
    return (
        <group>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 5, 4]} intensity={1.2} />
            <axesHelper args={[1]} />
            <Grid args={[4, 4]} cellSize={0.25} sectionSize={1} infiniteGrid fadeDistance={12} />
            <primitive object={scene} scale={2} />
        </group>
    );
}

// Renders the REAL first-person hands against a neutral backdrop so the
// camera-pinned pose can be tuned (via ?…&rx=&py=&s=… URL overrides) and
// screenshotted exactly as the player sees it.
function FpHandsPreview() {
    return (
        <group>
            <ambientLight intensity={0.9} />
            <directionalLight position={[2, 4, 3]} intensity={1.1} />
            <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#e9ecef" />
            </mesh>
            <FpHands />
        </group>
    );
}

export default function Floor3Preview() {
    const search = window.location.search;
    const debug = search.includes('handsdebug');
    const fphands = search.includes('fphands');
    const dbgCam: [number, number, number] = search.includes('top') ? [0, 3, 0.001]
        : search.includes('front') ? [0, 0.2, 3]
        : [1.6, 1.2, 1.6];
    const camPos: [number, number, number] = fphands ? [0, 0, 0]
        : debug ? dbgCam
        : search.includes('close') ? [0, 2.2, 8]
        : [0, 1.6, -8];
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            <Canvas
                shadows
                camera={{ position: camPos, fov: 70, near: 0.1, far: 200 }}
                gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
            >
                <Suspense fallback={null}>
                    {fphands ? <FpHandsPreview /> : debug ? <HandsDebug /> : <Floor3Environment elevator={false} />}
                </Suspense>
                {!fphands && <OrbitControls target={debug ? [0, 0, 0] : [0, 1.5, 4]} />}
                {!debug && !fphands && !search.includes('nopost') && (
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
                    <Bloom intensity={0.22} luminanceThreshold={0.95} luminanceSmoothing={0.20} mipmapBlur kernelSize={KernelSize.MEDIUM} />
                    <Vignette eskil={false} offset={0.32} darkness={0.28} />
                    <HueSaturation saturation={-1} />
                </EffectComposer>
                )}
            </Canvas>
        </div>
    );
}
