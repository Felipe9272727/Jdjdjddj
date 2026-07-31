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
import Floor7IntroCutscene, { F7_DIALOGUE } from './Floor7IntroCutscene';
import Floor7IntroUI from './Floor7IntroUI';
import { configureFloor7Sfx, startFloor7Ambient, f7CutMusicStart, f7CutBeat, f7CutMusicStop, f7BootClomp, f7ElevatorVanish, f7CaptainLaugh, f7CaptainVoice } from './floor7Sfx';

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
    const poseRef = useRef(0);
    const hideSailsRef = useRef(0);
    const legsRef = useRef(0);
    const talkRef = useRef(0);
    const dimRef = useRef(0);
    const tRef = useRef(0);
    const [active, setActive] = useState(true);
    const [beat, setBeat] = useState(0);
    const [lineIdx, setLineIdx] = useState(-1);
    const beatRef = useRef(0);
    const lineRef = useRef(-1);
    const doneRef = useRef(false);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioLog = useRef<Array<[number, number]>>([]);

    // AUDIO RIG (harness-only) — a live AudioContext routed through an AnalyserNode so we
    // can measure RMS energy over cutscene-time and confirm every cue fires + roughly when.
    useEffect(() => {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new AC();
        const an = ctx.createAnalyser(); an.fftSize = 1024; an.connect(ctx.destination);
        analyserRef.current = an;
        configureFloor7Sfx(ctx, an);
        ctx.resume().catch(() => {});
        try { startFloor7Ambient(); } catch { /* ok */ }
        const buf = new Float32Array(an.fftSize);
        const poll = setInterval(() => {
            an.getFloatTimeDomainData(buf);
            let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
            const rms = Math.sqrt(s / buf.length);
            audioLog.current.push([+tRef.current.toFixed(2), +rms.toFixed(4)]);
            if (audioLog.current.length > 4000) audioLog.current.shift();
        }, 40);
        (window as unknown as { __audioLog?: () => Array<[number, number]> }).__audioLog = () => audioLog.current;
        (window as unknown as { __rms?: () => number }).__rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
        return () => { clearInterval(poll); f7CutMusicStop(); try { ctx.close(); } catch { /* ok */ } };
    }, []);

    // drive the score: start/stop with the cutscene, beat stinger on beat change, voice on line change
    useEffect(() => { if (active) { f7CutMusicStart(); return () => f7CutMusicStop(); } }, [active]);
    useEffect(() => { if (active) f7CutBeat(beat); }, [beat, active]);
    useEffect(() => { if (active && lineIdx >= 1 && lineIdx < F7_DIALOGUE.length) f7CaptainVoice(F7_DIALOGUE[lineIdx]); }, [lineIdx, active]);

    useEffect(() => {
        window.__beat = () => beatRef.current;
        window.__done = () => doneRef.current;
        (window as unknown as { __line?: () => number }).__line = () => lineRef.current;
        window.__restart = () => { doneRef.current = false; beatRef.current = 0; setBeat(0); setLineIdx(-1); audioLog.current = []; handle.current.brain?.reset(); setActive(false); setTimeout(() => setActive(true), 40); };
        (window as unknown as { __holdElev?: (f: number) => void }).__holdElev = (f) => { elevFadeRef.current = f; };
        (window as unknown as { __t?: () => number }).__t = () => tRef.current;
        (window as unknown as { __dim?: () => number }).__dim = () => dimRef.current;
        window.__ready = true;
    }, []);

    return (
        <>
            <Canvas camera={{ fov: 58, position: [0, EYE, 4.2 * FLOOR7_SCALE], near: 0.05, far: 400 }} gl={{ antialias: true }}>
                <Floor7Environment playerPositionRef={posRef} handleRef={handle} captainAnchorRef={capRef} introElevFadeRef={elevFadeRef} introLaughRef={laughRef} introPoseRef={poseRef} introTalkRef={talkRef} introHideSailsRef={hideSailsRef} introLegsRef={legsRef} />
                {active && (
                    <Floor7IntroCutscene
                        active={active}
                        captainAnchorRef={capRef}
                        playerPositionRef={posRef}
                        elevFadeRef={elevFadeRef}
                        laughRef={laughRef}
                        poseRef={poseRef}
                        talkRef={talkRef}
                        hideSailsRef={hideSailsRef}
                        legsRef={legsRef}
                        dimRef={dimRef}
                        tRef={tRef}
                        onBeat={(b) => { beatRef.current = b; setBeat(b); }}
                        onLine={(l) => { lineRef.current = l; setLineIdx(l); }}
                        onStep={f7BootClomp}
                        onElevatorVanish={f7ElevatorVanish}
                        onLaugh={f7CaptainLaugh}
                        onDone={() => { doneRef.current = true; setActive(false); }}
                    />
                )}
                {/* Probe mounted LAST so its free-cam useFrame overrides the cutscene when __cam is set */}
                <Probe posRef={posRef} capRef={capRef} onPause={(p) => setActive(!p)} />
            </Canvas>
            {active && <Floor7IntroUI beat={beat} line={lineIdx} dimRef={dimRef} onSkip={() => setActive(false)} />}
        </>
    );
};

createRoot(document.getElementById('root')!).render(<App />);
