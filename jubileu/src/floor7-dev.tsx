/** floor7-dev.tsx — offline workbench for Andar 7 (open /floor7.html).
 *  Renders the REAL Floor7Environment with an OrbitControls camera so I can
 *  frame the ship + captain and iterate on the look. DEV-ONLY (not in build). */
import React, { useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Floor7Environment, useFloor7Handle } from './Floor7';

declare global { interface Window { __ready?: boolean; __orbit?: [number, number, number]; } }

function Dev() {
    const handle = useFloor7Handle();
    // a "player" parked near the captain's talk spot so the quest advances to GREET
    const playerRef = useRef(new THREE.Vector3(0, 0, 4.0));
    useEffect(() => {
        // Fast-forward the WASM brain past the intro (regardless of render fps) so
        // the elevator is gone and the captain is in place for a clean shot.
        const iv = setInterval(() => {
            const b = handle.current.brain;
            if (!b) return;
            for (let i = 0; i < 400; i++) b.tick(0.05, 0, 0, 4.0, false);
            window.__ready = true;
            clearInterval(iv);
        }, 100);
        return () => clearInterval(iv);
    }, [handle]);
    return (
        <>
            <Floor7Environment playerPositionRef={playerRef} handleRef={handle} />
            <OrbitControls target={[0, 1.4, 0]} />
        </>
    );
}

const cam = (window.__orbit ?? [9, 5, 11]);
createRoot(document.getElementById('root')!).render(
    <Canvas camera={{ position: cam, fov: 50 }} gl={{ antialias: true }}>
        <Dev />
    </Canvas>,
);
