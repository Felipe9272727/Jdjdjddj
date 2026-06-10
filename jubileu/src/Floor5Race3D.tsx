/**
 * Floor5Race3D.tsx — the in-game FLOOR 5: "A CORRIDA" — a full-screen
 * overlay with its OWN low-res <Canvas> (true N64 look: half-res render
 * upscaled with pixelated sampling, fog, flat shading).
 *
 * ARRIVAL CHOREOGRAPHY (the 1st-person → 3rd-person hand-off): mounts in
 * FIRST PERSON inside a low-poly elevator. Ding, doors slide, and TROCO-64
 * hops in front of the doors, lights chasing, to pitch the race. On "BORA
 * CORRER!" the camera PULLS STRAIGHT OUT of the player's eyes — revealing
 * the brand-new N64 avatar from behind — and never goes back. From there:
 * walk to the start line → 3·2·1·JÁ → the two-lane Fall-Guys heat against
 * the robot → podium → rematch or ride home.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    f5, f5Reset, f5SetOnChange, f5Bump, makeRacer, type Racer,
    F5_TALK, F5_WIN_PLAYER_LINES, F5_WIN_ROBOT_LINES, F5_FAREWELL,
    LANE_PLAYER, LANE_ROBOT, FINISH_Z,
} from './f5Race';
import { Floor5Track } from './Floor5Track';
import { Floor5Player64 } from './Floor5Player64';
import { Floor5Robot64, makeRobotRacer } from './Floor5Robot64';
import {
    startF5Music, stopF5Music, playF5Ding, playF5CountBeep, playF5Cheer,
    playF5Win, playF5RobotBlip, playF5RobotTalk,
} from './floor5RaceSfx';

// ── directors (inside the Canvas) ─────────────────────────────────────────────

/** Mount beat: veil → ding → doors → the robot's pitch. */
const IntroDirector: React.FC<{ doorRef: React.MutableRefObject<number> }> = ({ doorRef }) => {
    const t = useRef(0);
    const dinged = useRef(false);
    useFrame((_, dt) => {
        if (f5.phase !== 'intro') return;
        t.current += Math.min(dt, 0.05);
        const tt = t.current;
        if (tt > 1.1 && !dinged.current) { dinged.current = true; playF5Ding(); }
        const k = THREE.MathUtils.clamp((tt - 1.4) / 1.3, 0, 1);
        doorRef.current = k * k * (3 - 2 * k);
        if (k >= 0.8) { f5.phase = 'talk'; playF5RobotTalk(); f5Bump(); }
    });
    return null;
};

/** Race clock + phase machine: walk→countdown→race→finish. */
const RaceDirector: React.FC<{
    player: React.MutableRefObject<Racer>;
    robot: React.MutableRefObject<Racer>;
    lockRef: React.MutableRefObject<boolean>;
    countShownRef: React.MutableRefObject<number>;
}> = ({ player, robot, lockRef, countShownRef }) => {
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        f5.clock += dt;                                            // the one hazard clock
        const p = player.current, r = robot.current;
        if (f5.phase === 'walk') {
            lockRef.current = false;
            if (p.z > -1.6) {                                      // reached the line
                f5.phase = 'countdown'; f5.countT = 0; countShownRef.current = 9;
                lockRef.current = true;
                f5Bump();
            }
        } else if (f5.phase === 'countdown') {
            f5.countT += dt;
            // slide the runner into his gate while the lights count
            p.x = THREE.MathUtils.lerp(p.x, LANE_PLAYER, dt * 4);
            p.z = THREE.MathUtils.lerp(p.z, -2.0, dt * 4);
            p.facing = 0;
            const n = f5.countT < 1 ? 3 : f5.countT < 2 ? 2 : f5.countT < 3 ? 1 : 0;
            if (n !== countShownRef.current) {
                countShownRef.current = n;
                playF5CountBeep(n === 0);
                if (n === 0) { f5.phase = 'race'; f5.raceT = 0; lockRef.current = false; playF5Cheer(); }
                f5Bump();
            }
        } else if (f5.phase === 'race') {
            f5.raceT += dt;
            const pDone = p.z >= FINISH_Z, rDone = r.z >= FINISH_Z;
            if (pDone || rDone) {
                f5.winner = pDone && (!rDone || p.z - FINISH_Z >= r.z - FINISH_Z) ? 'player' : 'robot';
                f5.wins[f5.winner]++;
                f5.phase = 'finish';
                lockRef.current = false;                           // free to bounce around the podium
                stopF5Music();
                playF5Cheer();
                if (f5.winner === 'player') playF5Win(); else playF5RobotTalk();
                f5Bump();
            }
        }
    });
    return null;
};

/** The camera: first-person eyes → the pull-out reveal → N64 chase cam. */
const CameraRig: React.FC<{
    player: React.MutableRefObject<Racer>;
    hiddenNearCamRef: React.MutableRefObject<boolean>;
}> = ({ player, hiddenNearCamRef }) => {
    const camera = useThree((s) => s.camera);
    const revealT = useRef(0);
    const look = useRef(new THREE.Vector3(0.5, 1.5, -11.2));
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const p = player.current;
        const eye = new THREE.Vector3(p.x, p.y + 1.5, p.z + 0.2);
        const chase = new THREE.Vector3(p.x * 0.85, p.y * 0.6 + 4.7, p.z - 8.4);
        const chaseLook = new THREE.Vector3(p.x * 0.85, p.y * 0.6 + 1.3, p.z + 6);
        if (f5.phase === 'intro' || f5.phase === 'talk') {
            hiddenNearCamRef.current = true;
            camera.position.copy(eye);
            look.current.lerp(new THREE.Vector3(0.5, 1.35, -11.2), Math.min(1, dt * 3));
            camera.lookAt(look.current);
        } else if (f5.phase === 'reveal') {
            revealT.current = Math.min(1, revealT.current + dt / 2.3);
            const k = revealT.current;
            const e = k * k * (3 - 2 * k);                         // smoothstep
            camera.position.lerpVectors(eye, chase, e);
            look.current.lerpVectors(new THREE.Vector3(0.5, 1.35, -11.2), chaseLook, e);
            camera.lookAt(look.current);
            hiddenNearCamRef.current = e < 0.18;                   // the avatar fades into frame
            if (k >= 1) { f5.phase = 'walk'; f5Bump(); }
        } else {
            hiddenNearCamRef.current = false;
            camera.position.lerp(chase, Math.min(1, dt * 5.5));
            look.current.lerp(chaseLook, Math.min(1, dt * 6));
            camera.lookAt(look.current);
        }
    });
    return null;
};

// ── speech bubble with the robot's blip-voice typewriter ─────────────────────
const TypeText: React.FC<{ text: string; onDone: () => void; fastRef: React.MutableRefObject<boolean>; noBlip?: boolean }> =
    ({ text, onDone, fastRef, noBlip }) => {
        const [n, setN] = useState(0);
        useEffect(() => { setN(0); }, [text]);
        useEffect(() => {
            if (n >= text.length) { onDone(); return; }
            const id = setTimeout(() => {
                const step = fastRef.current ? text.length : 1;
                if (!fastRef.current && !noBlip && n % 3 === 0 && text[n] !== ' ') playF5RobotBlip();
                setN((v) => Math.min(text.length, v + step));
            }, fastRef.current ? 0 : 26);
            return () => clearTimeout(id);
        }, [n, text, onDone, fastRef, noBlip]);
        return <>{text.slice(0, n)}</>;
    };

// ── the overlay ───────────────────────────────────────────────────────────────
export const Floor5Race3D: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const player = useRef<Racer>(makeRacer(LANE_PLAYER, 0, -16.3));
    const robot = useRef<Racer>(makeRobotRacer());
    const inputRef = useRef({ x: 0, z: 0 });
    const jumpRef = useRef(false);
    const lockRef = useRef(true);
    const hiddenNearCamRef = useRef(true);
    const doorRef = useRef(0);
    const countShownRef = useRef(9);
    const talkingRef = useRef(false);
    const fastRef = useRef(false);
    const [v, setV] = useState(0);
    const [flash, setFlash] = useState(true);
    const [typed, setTyped] = useState(false);
    const posRef = useRef<HTMLDivElement>(null);
    const dotP = useRef<HTMLDivElement>(null);
    const dotR = useRef<HTMLDivElement>(null);

    useEffect(() => {
        f5Reset();
        player.current = makeRacer(LANE_PLAYER, 0, -16.3);
        robot.current = makeRobotRacer();
        f5SetOnChange(() => setV((x) => x + 1));
        const id = setTimeout(() => setFlash(false), 60);
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f5dbg = { f5, player, robot };
        return () => { clearTimeout(id); f5SetOnChange(null); stopF5Music(); };
    }, []);

    // race music from the moment the world is yours
    useEffect(() => {
        if (f5.phase === 'reveal') startF5Music();
    }, [v]);   // eslint-disable-line react-hooks/exhaustive-deps

    // 1º/2º + progress dots — light DOM pokes, no re-renders
    useEffect(() => {
        const id = setInterval(() => {
            if (f5.phase !== 'race') return;
            const p = player.current.z, r = robot.current.z;
            if (posRef.current) {
                const first = p >= r;
                posRef.current.textContent = first ? '1º' : '2º';
                posRef.current.style.color = first ? '#FFD54F' : '#ff8a7a';
            }
            const pct = (z: number) => `${Math.min(100, Math.max(0, (z / FINISH_Z) * 100)).toFixed(1)}%`;
            if (dotP.current) dotP.current.style.left = pct(p);
            if (dotR.current) dotR.current.style.left = pct(r);
        }, 120);
        return () => clearInterval(id);
    }, []);

    // keyboard: WASD/arrows + Space
    useEffect(() => {
        const keys = { l: false, r: false, u: false, d: false };
        const upd = () => { inputRef.current = { x: (keys.r ? 1 : 0) - (keys.l ? 1 : 0), z: (keys.u ? 1 : 0) - (keys.d ? 1 : 0) }; };
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'arrowleft' || k === 'a') { keys.l = true; upd(); }
            if (k === 'arrowright' || k === 'd') { keys.r = true; upd(); }
            if (k === 'arrowup' || k === 'w') { keys.u = true; upd(); }
            if (k === 'arrowdown' || k === 's') { keys.d = true; upd(); }
            if (k === ' ' && !e.repeat) { e.preventDefault(); jumpRef.current = true; }
        };
        const ku = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'arrowleft' || k === 'a') { keys.l = false; upd(); }
            if (k === 'arrowright' || k === 'd') { keys.r = false; upd(); }
            if (k === 'arrowup' || k === 'w') { keys.u = false; upd(); }
            if (k === 'arrowdown' || k === 's') { keys.d = false; upd(); }
        };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, []);

    // virtual joystick
    const padRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const padPointer = useRef<number | null>(null);
    const padHandlers = {
        onPointerDown: (e: React.PointerEvent) => { padPointer.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); padMove(e); },
        onPointerMove: (e: React.PointerEvent) => { if (padPointer.current === e.pointerId) padMove(e); },
        onPointerUp: (e: React.PointerEvent) => {
            if (padPointer.current === e.pointerId) {
                padPointer.current = null; inputRef.current = { x: 0, z: 0 };
                if (knobRef.current) knobRef.current.style.transform = 'translate(0px,0px)';
            }
        },
    };
    const padMove = (e: React.PointerEvent) => {
        const el = padRef.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        let dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        let dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        inputRef.current = { x: dx, z: -dy };
        if (knobRef.current) knobRef.current.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
    };

    // dialogue flow
    const phase = f5.phase;
    const finishLines = f5.winner === 'player' ? F5_WIN_PLAYER_LINES : F5_WIN_ROBOT_LINES;
    const talkSpeaker: 'robot' | 'player' = phase === 'farewell'
        ? (F5_FAREWELL[f5.subLine]?.speaker ?? 'robot')
        : 'robot';
    const talkText = phase === 'talk' ? F5_TALK[f5.talkLine]
        : phase === 'finish' ? (finishLines[f5.subLine] ?? null)
        : phase === 'farewell' ? (F5_FAREWELL[f5.subLine]?.text ?? null)
        : null;
    talkingRef.current = talkText !== null && !typed && talkSpeaker === 'robot';
    useEffect(() => { setTyped(false); fastRef.current = false; }, [talkText]);
    const advanceTalk = () => {
        if (!typed) { fastRef.current = true; return; }            // first tap: reveal all
        if (phase === 'talk') {
            if (f5.talkLine < F5_TALK.length - 1) { f5.talkLine++; playF5RobotTalk(); f5Bump(); }
            else { f5.phase = 'reveal'; f5Bump(); }
        } else if (phase === 'finish') {
            if (f5.subLine < finishLines.length - 1) {
                f5.subLine++;
                playF5RobotTalk();
                f5Bump();
            }
        } else if (phase === 'farewell') {
            if (f5.subLine < F5_FAREWELL.length - 1) {
                f5.subLine++;
                if (F5_FAREWELL[f5.subLine]?.speaker === 'robot') playF5RobotTalk();
                f5Bump();
            }
        }
    };
    const rematch = () => {
        player.current.x = LANE_PLAYER; player.current.y = 0; player.current.z = -2.0;
        player.current.vx = player.current.vy = player.current.vz = 0; player.current.stun = 0; player.current.facing = 0;
        robot.current.x = LANE_ROBOT; robot.current.y = 0; robot.current.z = -2.2;
        robot.current.vx = robot.current.vy = robot.current.vz = 0; robot.current.stun = 0; robot.current.facing = 0;
        f5.winner = null; f5.phase = 'countdown'; f5.countT = 0; f5.subLine = 0; countShownRef.current = 9;
        lockRef.current = true;
        startF5Music();
        f5Bump();
    };

    // N64 chunky text helper
    const t64: React.CSSProperties = {
        fontFamily: 'monospace', fontWeight: 900, color: '#FFD54F', letterSpacing: 2,
        textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 0 #000',
        userSelect: 'none',
    };
    const btn64: React.CSSProperties = {
        ...t64, fontSize: 17, background: 'linear-gradient(180deg,#3b6fb0,#27508a)', color: '#fff',
        border: '3px solid #11131a', borderRadius: 12, padding: '10px 22px', cursor: 'pointer',
        boxShadow: '0 4px 0 #11131a',
    };
    const countN = phase === 'countdown' ? countShownRef.current : null;
    const showPads = phase === 'walk' || phase === 'countdown' || phase === 'race' || phase === 'finish';
    const isLastFinishLine = phase === 'finish' && f5.subLine === finishLines.length - 1;
    const isLastFarewellLine = phase === 'farewell' && f5.subLine === F5_FAREWELL.length - 1;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#7ec0ef', touchAction: 'none' }}>
            <Canvas
                dpr={0.5}
                camera={{ fov: 60, near: 0.1, far: 400, position: [0, 1.5, -16.1] }}
                gl={{ antialias: false }}
                onCreated={({ gl }) => { gl.domElement.style.imageRendering = 'pixelated'; }}
            >
                <color attach="background" args={['#7ec0ef']} />
                <fog attach="fog" args={['#a8d8f8', 46, 150]} />
                <IntroDirector doorRef={doorRef} />
                <RaceDirector player={player} robot={robot} lockRef={lockRef} countShownRef={countShownRef} />
                <CameraRig player={player} hiddenNearCamRef={hiddenNearCamRef} />
                <Floor5Track doorRef={doorRef} />
                <Floor5Player64 racer={player} inputRef={inputRef} jumpRef={jumpRef} lockRef={lockRef} hiddenNearCamRef={hiddenNearCamRef} />
                <Floor5Robot64 racer={robot} playerRacer={player} talkingRef={talkingRef} />
            </Canvas>

            {/* ── HUD ── */}
            {phase === 'walk' && (
                <div style={{ ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 18px)', left: 0, right: 0, textAlign: 'center', fontSize: 22, animation: 'f5pulse 1.2s infinite' }}>
                    VÁ ATÉ A LARGADA! ➜
                </div>
            )}
            {countN !== null && countN <= 3 && (
                <div style={{ ...t64, position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', fontSize: countN === 0 ? 64 : 96, color: countN === 0 ? '#58ff7a' : '#FFD54F' }}>
                    {countN === 0 ? 'JÁ!!' : countN}
                </div>
            )}
            {phase === 'race' && (
                <>
                    <div ref={posRef} style={{ ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 0, right: 0, textAlign: 'center', fontSize: 44 }}>1º</div>
                    <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 70px)', left: '18%', right: '18%', height: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 5, border: '2px solid #11131a' }}>
                        <div ref={dotP} style={{ position: 'absolute', top: -7, left: 0, width: 16, height: 16, borderRadius: 9, background: '#3b6fb0', border: '3px solid #fff', transform: 'translateX(-8px)' }} />
                        <div ref={dotR} style={{ position: 'absolute', top: -7, left: 0, width: 16, height: 16, borderRadius: 9, background: '#e8503a', border: '3px solid #fff', transform: 'translateX(-8px)' }} />
                    </div>
                </>
            )}

            {/* ── speech bubble (talk + podium + farewell) ── */}
            {talkText !== null && (
                <div onPointerDown={advanceTalk}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 14px calc(env(safe-area-inset-bottom) + 16px)', cursor: 'pointer' }}>
                    <div style={{
                        maxWidth: 660, margin: '0 auto', background: '#fffef2',
                        border: `4px solid ${talkSpeaker === 'player' ? '#3b6fb0' : '#11131a'}`,
                        borderRadius: 16, boxShadow: '0 6px 0 rgba(0,0,0,0.45)', padding: '12px 16px 14px',
                    }}>
                        <div style={{ ...t64, fontSize: 13, color: talkSpeaker === 'player' ? '#3b6fb0' : '#e8503a', textShadow: 'none', marginBottom: 4 }}>
                            {talkSpeaker === 'player' ? '▶ VOCÊ' : '● TROCO-64'}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 17, lineHeight: 1.45, color: '#1c2433', minHeight: 50 }}>
                            <TypeText text={talkText} onDone={() => setTyped(true)} fastRef={fastRef} noBlip={talkSpeaker === 'player'} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                            {phase === 'talk' && typed && f5.talkLine < F5_TALK.length - 1 && (
                                <button style={btn64} onPointerDown={(e) => { e.stopPropagation(); advanceTalk(); }}>▶</button>
                            )}
                            {phase === 'talk' && typed && f5.talkLine === F5_TALK.length - 1 && (
                                <button style={{ ...btn64, background: 'linear-gradient(180deg,#58b84d,#3f9638)' }}
                                    onPointerDown={(e) => { e.stopPropagation(); advanceTalk(); }}>BORA CORRER! 🏁</button>
                            )}
                            {phase === 'finish' && typed && !isLastFinishLine && (
                                <button style={btn64} onPointerDown={(e) => { e.stopPropagation(); advanceTalk(); }}>▶</button>
                            )}
                            {phase === 'finish' && typed && isLastFinishLine && (
                                <>
                                    <button style={{ ...btn64, background: 'linear-gradient(180deg,#e8503a,#b03426)' }} onPointerDown={(e) => { e.stopPropagation(); rematch(); }}>REVANCHE!</button>
                                    <button style={btn64} onPointerDown={(e) => {
                                        e.stopPropagation();
                                        f5.phase = 'farewell'; f5.subLine = 0; playF5RobotTalk(); f5Bump();
                                    }}>ELEVADOR ⬆</button>
                                </>
                            )}
                            {phase === 'farewell' && typed && !isLastFarewellLine && (
                                <button style={btn64} onPointerDown={(e) => { e.stopPropagation(); advanceTalk(); }}>▶</button>
                            )}
                            {phase === 'farewell' && typed && isLastFarewellLine && (
                                <button style={{ ...btn64, background: 'linear-gradient(180deg,#555,#333)', color: '#aaa' }}
                                    onPointerDown={(e) => { e.stopPropagation(); onExit?.(); }}>PARTIR...</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {phase === 'finish' && (
                <div style={{ ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', left: 0, right: 0, textAlign: 'center', fontSize: 30, color: f5.winner === 'player' ? '#58ff7a' : '#ff8a7a' }}>
                    {f5.winner === 'player' ? '🏆 VOCÊ VENCEU!' : 'TROCO-64 VENCEU'}
                    <div style={{ fontSize: 15, marginTop: 4 }}>VOCÊ {f5.wins.player} × {f5.wins.robot} ROBÔ</div>
                </div>
            )}

            {/* ── controls ── */}
            {showPads && (
                <>
                    <div ref={padRef} {...padHandlers} style={{
                        position: 'absolute', left: 'calc(env(safe-area-inset-left) + 24px)', bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                        width: 116, height: 116, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.85)',
                        background: 'rgba(17,19,26,0.4)', touchAction: 'none',
                    }}>
                        <div ref={knobRef} style={{
                            position: 'absolute', left: 34, top: 34, width: 42, height: 42, borderRadius: '50%',
                            background: 'linear-gradient(180deg,#f2e9d8,#cabfa8)', border: '3px solid #11131a', pointerEvents: 'none',
                        }} />
                    </div>
                    <div onPointerDown={(e) => { e.preventDefault(); jumpRef.current = true; }} style={{
                        position: 'absolute', right: 'calc(env(safe-area-inset-right) + 24px)', bottom: 'calc(env(safe-area-inset-bottom) + 28px)',
                        width: 84, height: 84, borderRadius: '50%', border: '3px solid #11131a',
                        background: 'linear-gradient(180deg,#58b84d,#3f9638)', color: '#fff',
                        fontSize: 34, lineHeight: '78px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 900,
                        userSelect: 'none', touchAction: 'none', boxShadow: '0 5px 0 #11131a',
                    }}>▲</div>
                </>
            )}

            <style>{'@keyframes f5pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }'}</style>

            {/* entry veil */}
            <div style={{
                position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none',
                opacity: flash ? 1 : 0, transition: 'opacity 0.8s ease-out',
            }} />
        </div>
    );
};

export default Floor5Race3D;
