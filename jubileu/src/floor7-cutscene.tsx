/** floor7-cutscene.tsx — offline harness to PLAY + capture the captain's
 *  arrival cutscene (Floor7IntroCutscene + Floor7IntroUI) exactly as it runs
 *  in the game, but standalone (/floor7cutscene.html). The captain walks in
 *  naturally from the WASM brain (NO fast-forward) so the LEGS beat catches him
 *  mid-stride. Exposes window.__ready / __beat / __done / __restart / __geom. */
import React, { useRef, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Floor7Environment, useFloor7Handle } from './Floor7';
import { FLOOR7_SCALE } from './constants';
import Floor7IntroCutscene from './Floor7IntroCutscene';
import Floor7IntroUI from './Floor7IntroUI';

const EYE = 1.55;

declare global {
    interface Window {
        __ready?: boolean;
        __beat?: () => number;
        __done?: () => boolean;
        __restart?: () => void;
        __geom?: () => unknown;
    }
}

const Probe: React.FC<{ posRef: React.MutableRefObject<THREE.Vector3>; capRef: React.MutableRefObject<THREE.Vector3>; onPause: (p: boolean) => void; }> = ({ posRef, capRef, onPause }) => {
    const { camera, scene } = useThree();
    const camO = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null);
    useEffect(() => {
        (window as unknown as { __cam?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void }).__cam =
            (px, py, pz, tx, ty, tz) => { onPause(true); camO.current = { p: new THREE.Vector3(px, py, pz), t: new THREE.Vector3(tx, ty, tz) }; };
        (window as unknown as { __camOff?: () => void }).__camOff = () => { camO.current = null; onPause(false); };
        const findElev = () => {
            let r: number[] | null = null;
            scene.traverse((o) => {
                if (o.name === 'elevCab') { const w = new THREE.Vector3(); o.getWorldPosition(w); r = w.toArray().map(n => +n.toFixed(2)); }
            });
            return r;
        };
        window.__geom = () => ({
            player: posRef.current.toArray().map(n => +n.toFixed(2)),
            captain: capRef.current.toArray().map(n => +n.toFixed(2)),
            cam: camera.position.toArray().map(n => +n.toFixed(2)),
            elev: findElev(),
        });
    }, [camera, scene, posRef, capRef, onPause]);
    useFrame(() => { if (camO.current) { camera.position.copy(camO.current.p); camera.lookAt(camO.current.t); } });
    return null;
};

const App: React.FC = () => {
    const handle = useFloor7Handle();
    const posRef = useRef(new THREE.Vector3(0, 0, 4.2 * FLOOR7_SCALE));
    const capRef = useRef(new THREE.Vector3(0, 0, 0));
    const elevFadeRef = useRef<number | null>(null);
    const laughRef = useRef(0);
    const [active, setActive] = useState(true);
    const [beat, setBeat] = useState(0);
    const beatRef = useRef(0);
    const doneRef = useRef(false);

    useEffect(() => {
        window.__beat = () => beatRef.current;
        window.__done = () => doneRef.current;
        window.__restart = () => { doneRef.current = false; beatRef.current = 0; setBeat(0); handle.current.brain?.reset(); setActive(false); setTimeout(() => setActive(true), 40); };
        (window as unknown as { __holdElev?: (f: number) => void }).__holdElev = (f) => { elevFadeRef.current = f; };
        window.__ready = true;
    }, []);

    return (
        <>
            <Canvas camera={{ fov: 58, position: [0, EYE, 4.2 * FLOOR7_SCALE], near: 0.05, far: 400 }} gl={{ antialias: true }}>
                <Floor7Environment playerPositionRef={posRef} handleRef={handle} captainAnchorRef={capRef} introElevFadeRef={elevFadeRef} introLaughRef={laughRef} />
                {active && (
                    <Floor7IntroCutscene
                        active={active}
                        captainAnchorRef={capRef}
                        playerPositionRef={posRef}
                        elevFadeRef={elevFadeRef}
                        laughRef={laughRef}
                        onBeat={(b) => { beatRef.current = b; setBeat(b); }}
                        onLaugh={() => { /* headless: no audio ctx */ }}
                        onDone={() => { doneRef.current = true; setActive(false); }}
                    />
                )}
                {/* Probe mounted LAST so its free-cam useFrame overrides the cutscene when __cam is set */}
                <Probe posRef={posRef} capRef={capRef} onPause={(p) => setActive(!p)} />
            </Canvas>
            {active && <Floor7IntroUI beat={beat} onSkip={() => setActive(false)} />}
        </>
    );
};

createRoot(document.getElementById('root')!).render(<App />);
