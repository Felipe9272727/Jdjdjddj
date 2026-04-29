import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { WALKING_URL, IDLE_URL, PR, SPEED, wallsForState } from './constants';
import { resolveCollision } from './physics';

// ─────────────────────────────────────────────────────────────────────────────
// Bot redesign: each bot is an autonomous "player-like" avatar in the scene.
// It is NOT routed through Firestore (running multiple anonymous Firebase
// users from a single tab is a non-trivial workaround for limited gain) — it
// is rendered locally with the same GLB and label style as a remote player,
// so the human player sees a bot moving around just like another MP user.
//
// AI = simple steering behaviors (Reynolds 1999):
//   - wander: random direction with small per-frame jitter so paths feel
//             organic instead of teleporting to random points
//   - follow: arrive at a target offset from the human player
//   - tour:   scripted waypoints exercising lobby + elevator (one bot only)
//
// Collision: reuses `resolveCollision` from physics.ts so the bot is pushed
// out of walls exactly like the human player.
// ─────────────────────────────────────────────────────────────────────────────

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

export type BotBehavior = 'idle' | 'wander' | 'follow' | 'tour' | 'patrol' | 'orbit' | 'dance';

export interface BotState {
    id: string;
    pos: Vector3;
    rot: number;
    anim: 'idle' | 'walking';
    behavior: BotBehavior;
    // Steering scratch
    wanderTheta: number;        // current wander direction
    target: Vector3 | null;     // for seek/follow/tour
    tourIdx: number;            // for tour
    color: string;              // tint for the name label
}

const TOUR_WAYPOINTS: [number, number][] = [
    [5, 5],     // lobby NPC area
    [-5, 5],    // lobby left
    [-5, -5],   // lobby left back
    [5, -5],    // lobby right back
    [0, -8],    // near elevator entrance
    [0, 0],     // lobby center
];

const BOT_PROFILES = [
    { color: '#fbbf24', name: 'ECHO',    speed: 2.2, jitter: 1.5 },  // calm wanderer
    { color: '#a78bfa', name: 'GLITCH',  speed: 3.0, jitter: 2.5 },  // erratic fast
    { color: '#34d399', name: 'GHOST',   speed: 1.8, jitter: 0.8 },  // slow, smooth
    { color: '#f472b6', name: 'SPARK',   speed: 2.8, jitter: 2.0 },  // energetic
    { color: '#60a5fa', name: 'DRIFT',   speed: 2.0, jitter: 1.2 },  // chill follower
    { color: '#fb923c', name: 'BLAZE',   speed: 3.2, jitter: 3.0 },  // chaotic
];

const PATROL_WAYPOINTS: [number, number][] = [
    [-8, 8], [8, 8], [8, -8], [-8, -8],  // perimeter walk
];

const DANCE_ANGLES = [0, Math.PI/2, Math.PI, Math.PI*1.5]; // spin directions

const ARRIVE_DIST = 0.6;
const WANDER_JITTER = 2.0;

const randomLobbyPos = (): Vector3 => {
    // Spawn in the lobby quadrants, away from walls.
    const x = (Math.random() - 0.5) * 14;
    const z = (Math.random() - 0.5) * 14;
    return new Vector3(x, 0, z);
};

// ─────────────────────────────────────────────────────────────────────────────
// Bot avatar — same rig + animations as a remote MP player. Uses a cloned
// skeleton so multiple bots don't share animation state.
// ─────────────────────────────────────────────────────────────────────────────

const BotAvatar = ({ state }: { state: BotState }) => {
    const groupRef = useRef<any>(null);
    const hipsRef = useRef<any>(null);
    const hipsBindRef = useRef<Vector3 | null>(null);
    const { scene, animations: walkAnims } = useGLTF(WALKING_URL) as any;
    const { animations: idleAnims } = useGLTF(IDLE_URL) as any;

    const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    const anims = useMemo(() => {
        const w = walkAnims.map((a: any) => a.clone(true));
        const i = idleAnims.map((a: any) => a.clone(true));
        if (w[0]) w[0].name = 'Walking';
        if (i[0]) i[0].name = 'Idle';
        return [...i, ...w];
    }, [walkAnims, idleAnims]);
    const { actions } = useAnimations(anims, clonedScene);

    const [groundY, setGroundY] = useState(0);
    useEffect(() => {
        clonedScene.traverse((c: any) => {
            if (c.isMesh && c.material) {
                c.material = c.material.clone();
                c.material.side = THREE.DoubleSide;
                c.material.transparent = false;
                c.material.depthWrite = true;
                c.material.metalness = 0;
                c.material.roughness = 1;
                c.material.needsUpdate = true;
            }
            if ((c.isBone || c.type === 'Bone') && !hipsRef.current) {
                const n = c.name.toLowerCase();
                if (n.includes('hips') || n.includes('root')) {
                    hipsRef.current = c;
                    hipsBindRef.current = c.position.clone();
                }
            }
        });
        try {
            clonedScene.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(clonedScene);
            if (Number.isFinite(box.min.y)) setGroundY(-box.min.y);
        } catch { /* ignored */ }
    }, [clonedScene]);

    useEffect(() => {
        const walking = state.anim === 'walking';
        const a = actions[walking ? 'Walking' : 'Idle'];
        const o = actions[walking ? 'Idle' : 'Walking'];
        if (o) o.fadeOut(0.2);
        if (a) a.reset().fadeIn(0.2).play();
    }, [state.anim, actions]);

    // Initialize transform once on mount.
    useEffect(() => {
        if (groupRef.current) {
            groupRef.current.position.copy(state.pos);
            groupRef.current.rotation.y = state.rot;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, dt) => {
        if (!groupRef.current) return;
        // Lock hips X/Z to bind (kill lateral root drift, keep natural Y bob).
        if (hipsRef.current && hipsBindRef.current) {
            hipsRef.current.position.x = hipsBindRef.current.x;
            hipsRef.current.position.z = hipsBindRef.current.z;
        }
        // Smooth toward latest sim state.
        const k = Math.min(1, 10 * dt);
        groupRef.current.position.lerp(state.pos, k);
        let d = state.rot - groupRef.current.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        groupRef.current.rotation.y += d * k;
    });

    return (
        <group ref={groupRef}>
            {/* Glow ring under bot for visibility */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <ringGeometry args={[0.3, 0.5, 16]} />
                <meshBasicMaterial color={state.color} transparent opacity={0.3} toneMapped={false} />
            </mesh>
            <primitive object={clonedScene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
            <Html position={[0, 2.2, 0]} center distanceFactor={8}>
                <div className="pointer-events-none select-none whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                        <div
                            className="bg-black/80 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider ring-1 backdrop-blur-sm tabular-nums shadow-lg"
                            style={{ color: state.color, boxShadow: `0 0 0 1px ${state.color}40, 0 0 8px ${state.color}80` }}
                        >
                            {state.id.toUpperCase()}
                        </div>
                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: state.color, boxShadow: `0 0 6px ${state.color}` }} />
                    </div>
                </div>
            </Html>
        </group>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// useBots — the simulation hook. Returns the array of bot states (so App can
// render BotAvatars). Drives steering behaviors in useFrame; exposes a stable
// imperative API on window.__jubileuBot for hand-driving from devtools.
// ─────────────────────────────────────────────────────────────────────────────

interface BotSystemProps {
    playerPositionRef: React.MutableRefObject<Vector3>;
    currentLevel: number;
    doorsClosed: boolean;
    houseDoorOpen: boolean;
}

declare global {
    interface Window {
        __jubileuBot?: any;
    }
}

const makeBot = (i: number): BotState => {
    const profile = BOT_PROFILES[i % BOT_PROFILES.length];
    return {
        id: profile.name.toLowerCase() + '-' + Math.random().toString(36).slice(2, 4),
        pos: randomLobbyPos(),
        rot: Math.random() * Math.PI * 2,
        anim: 'walking',
        behavior: 'wander',
        wanderTheta: Math.random() * Math.PI * 2,
        target: null,
        tourIdx: 0,
        color: profile.color,
    };
};

// ─── Tiny external store ──────────────────────────────────────────────────────
// `useBots` runs inside <Canvas> (because of useFrame), but BotHud lives
// outside the Canvas. They communicate via this module-scoped store that
// either side can subscribe to without a full context provider.
interface BotsInfo { count: number; behaviors: string[]; log: string[] }
let _storeBots: BotState[] = [];
let _storeInfo: BotsInfo = { count: 0, behaviors: [], log: [] };
const _storeListeners = new Set<() => void>();
const _emit = () => _storeListeners.forEach((l) => l());

const subscribeStore = (l: () => void) => { _storeListeners.add(l); return () => { _storeListeners.delete(l); }; };

export const useBotStore = (): { bots: BotState[]; info: BotsInfo } => {
    const [, force] = useState(0);
    useEffect(() => subscribeStore(() => force((n) => n + 1)), []);
    return { bots: _storeBots, info: _storeInfo };
};

export const BotSystem = ({ playerPositionRef, currentLevel, doorsClosed, houseDoorOpen }: BotSystemProps) => {
    const [bots, setBots] = useState<BotState[]>([]);
    const botsRef = useRef<BotState[]>([]);
    botsRef.current = bots;
    const logRef = useRef<string[]>([]);
    const log = (msg: string) => {
        const line = `${new Date().toLocaleTimeString()} ${msg}`;
        logRef.current = [line, ...logRef.current].slice(0, 6);
        _storeInfo = { ..._storeInfo, log: logRef.current };
        _emit();
        // eslint-disable-next-line no-console
        console.log('[bot]', msg);
    };

    // Keep the external store in sync whenever bots changes.
    useEffect(() => {
        _storeBots = bots;
        _storeInfo = { ..._storeInfo, count: bots.length, behaviors: [...new Set(bots.map((b) => b.behavior))] };
        _emit();
    }, [bots]);

    // Auto-spawn one bot the first time the system mounts so the user sees
    // something happen. The component itself is unmounted when bot mode is
    // disabled (App.tsx mounts conditionally), so cleanup is handled there.
    useEffect(() => {
        if (bots.length === 0) {
            const first = makeBot(0);
            first.behavior = 'wander';
            setBots([first]);
            log('auto-spawned ECHO (wander)');
        }
        return () => {
            _storeBots = [];
            _storeInfo = { count: 0, behaviors: [], log: logRef.current };
            _emit();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Drive every bot every frame ───────────────────────────────────────
    useFrame((_, dtRaw) => {
        if (botsRef.current.length === 0) return;
        const dt = Math.min(0.05, dtRaw); // clamp big spikes (tab returning from background)
        const walls = wallsForState(currentLevel, doorsClosed, houseDoorOpen);
        const player = playerPositionRef.current;

        let mutated = false;
        for (const b of botsRef.current) {
            const prevX = b.pos.x, prevZ = b.pos.z;
            let desiredX = 0, desiredZ = 0;

            switch (b.behavior) {
                case 'idle':
                    desiredX = 0; desiredZ = 0;
                    break;
                case 'wander': {
                    // Wander = current heading + small random jitter to the angle.
                    b.wanderTheta += (Math.random() - 0.5) * WANDER_JITTER * dt;
                    desiredX = Math.sin(b.wanderTheta);
                    desiredZ = Math.cos(b.wanderTheta);
                    break;
                }
                case 'follow': {
                    // Stand a couple of meters to the right of the player; arrive
                    // (slow down on approach) so they don't oscillate on top of them.
                    const tx = player.x + 1.6;
                    const tz = player.z + 0.5;
                    const dx = tx - b.pos.x, dz = tz - b.pos.z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d > ARRIVE_DIST) {
                        const slow = Math.min(1, d / 2);
                        desiredX = (dx / d) * slow;
                        desiredZ = (dz / d) * slow;
                        // Aim heading at the desired direction so the avatar faces it.
                        b.wanderTheta = Math.atan2(desiredX, desiredZ);
                    }
                    break;
                }
                case 'tour': {
                    if (b.tourIdx >= TOUR_WAYPOINTS.length) b.tourIdx = 0;
                    const [tx, tz] = TOUR_WAYPOINTS[b.tourIdx];
                    const dx = tx - b.pos.x, dz = tz - b.pos.z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d < ARRIVE_DIST) { b.tourIdx += 1; } else {
                        desiredX = dx / d; desiredZ = dz / d;
                        b.wanderTheta = Math.atan2(desiredX, desiredZ);
                    }
                    break;
                }
                case 'patrol': {
                    if (b.tourIdx >= PATROL_WAYPOINTS.length) b.tourIdx = 0;
                    const [px, pz] = PATROL_WAYPOINTS[b.tourIdx];
                    const pdx = px - b.pos.x, pdz = pz - b.pos.z;
                    const pd = Math.sqrt(pdx * pdx + pdz * pdz);
                    if (pd < ARRIVE_DIST) { b.tourIdx += 1; } else {
                        desiredX = pdx / pd; desiredZ = pdz / pd;
                        b.wanderTheta = Math.atan2(desiredX, desiredZ);
                    }
                    break;
                }
                case 'orbit': {
                    // Circle around the lobby center at radius 5
                    const orbitR = 5.0;
                    const orbitSpeed = 0.8;
                    const angle = (Date.now() * 0.001 * orbitSpeed) + (b.id.charCodeAt(0) * 0.5);
                    const otx = Math.cos(angle) * orbitR;
                    const otz = Math.sin(angle) * orbitR;
                    const odx = otx - b.pos.x, odz = otz - b.pos.z;
                    const od = Math.sqrt(odx * odx + odz * odz);
                    if (od > 0.1) { desiredX = odx / od; desiredZ = odz / od; }
                    b.wanderTheta = Math.atan2(desiredX, desiredZ);
                    break;
                }
                case 'dance': {
                    // Spin in place with occasional direction changes
                    b.wanderTheta += 2.5 * dt;
                    desiredX = Math.sin(b.wanderTheta) * 0.3;
                    desiredZ = Math.cos(b.wanderTheta) * 0.3;
                    break;
                }
            }

            const moving = Math.abs(desiredX) + Math.abs(desiredZ) > 0.05;
            if (moving) {
                const nx = b.pos.x + desiredX * SPEED * dt;
                const nz = b.pos.z + desiredZ * SPEED * dt;
                const [rx, rz] = resolveCollision(nx, nz, PR, walls);

                // Stuck detection: if collision pushed us back to ~same place,
                // randomize wander angle so we can escape corners.
                const moved = Math.hypot(rx - prevX, rz - prevZ);
                if (moved < SPEED * dt * 0.2 && (b.behavior === 'wander' || b.behavior === 'patrol')) {
                    b.wanderTheta = Math.random() * Math.PI * 2;
                }

                b.pos.x = rx;
                b.pos.z = rz;
                // Smoothly face the wander direction.
                let dRot = b.wanderTheta - b.rot;
                while (dRot > Math.PI) dRot -= Math.PI * 2;
                while (dRot < -Math.PI) dRot += Math.PI * 2;
                b.rot += dRot * Math.min(1, 8 * dt);
            }
            const nextAnim = moving ? 'walking' : 'idle';
            if (nextAnim !== b.anim) {
                b.anim = nextAnim;
                mutated = true;
            }
        }
        if (mutated) setBots([...botsRef.current]); // trigger anim transitions
    });

    // ─── Imperative API on window.__jubileuBot ─────────────────────────────
    useEffect(() => {
        const api = {
            list: () => botsRef.current.map((b) => ({ id: b.id, behavior: b.behavior, pos: { x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2) } })),
            spawn: (n: number = 1) => {
                const start = botsRef.current.length;
                const next = [...botsRef.current];
                const behaviors: BotBehavior[] = ['wander', 'patrol', 'orbit'];
                for (let i = 0; i < n; i++) {
                    const bot = makeBot(start + i);
                    bot.behavior = behaviors[(start + i) % behaviors.length];
                    next.push(bot);
                }
                setBots(next);
                log(`spawned ${n} bot(s) — total ${next.length}`);
            },
            despawn: () => {
                setBots([]);
                log('despawned all bots');
            },
            wander: () => {
                setBots(botsRef.current.map((b) => ({ ...b, behavior: 'wander', target: null })));
                log('all bots → wander');
            },
            follow: () => {
                setBots(botsRef.current.map((b) => ({ ...b, behavior: 'follow', target: null })));
                log('all bots → follow player');
            },
            idle: () => {
                setBots(botsRef.current.map((b) => ({ ...b, behavior: 'idle', target: null })));
                log('all bots → idle');
            },
            tour: () => {
                if (botsRef.current.length === 0) {
                    setBots([{ ...makeBot(0), behavior: 'tour', tourIdx: 0 }]);
                } else {
                    setBots([{ ...botsRef.current[0], behavior: 'tour', tourIdx: 0 }, ...botsRef.current.slice(1)]);
                }
                log('first bot running tour waypoints');
            },
            patrol: () => {
                setBots(botsRef.current.map((b, i) => ({ ...b, behavior: 'patrol', tourIdx: 0 })));
                log('all bots → patrol perimeter');
            },
            orbit: () => {
                setBots(botsRef.current.map((b) => ({ ...b, behavior: 'orbit' })));
                log('all bots → orbit center');
            },
            dance: () => {
                setBots(botsRef.current.map((b) => ({ ...b, behavior: 'dance' })));
                log('all bots → dance mode');
            },
            help: () => {
                // eslint-disable-next-line no-console
                console.log(`%c🤖 jubileu bot api%c
spawn(n=1)   — add n bots to the lobby
despawn()    — remove all bots
wander()     — random organic movement
follow()     — flock toward the player
idle()       — all bots stop
tour()       — first bot runs lobby waypoints
patrol()     — walk the perimeter
orbit()      — circle around lobby center
dance()      — spin in place
list()       — array of {id, behavior, pos}
`, 'background:#a78bfa;color:#000;padding:4px 8px;border-radius:4px;font-weight:bold', '');
            },
        };
        window.__jubileuBot = api;
        log('bot API ready — window.__jubileuBot.help()');
        return () => { delete window.__jubileuBot; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <BotAvatars bots={bots} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────────────────────────────

export const BotAvatars = ({ bots }: { bots: BotState[] }) => (
    <>
        {bots.map((b) => (
            <BotAvatar key={b.id} state={b} />
        ))}
    </>
);

export const BotHud = ({ info }: { info: { count: number; behaviors: string[]; log: string[] } }) => {
    const summary = info.count === 0
        ? 'aguardando spawn'
        : `${info.count} bot${info.count > 1 ? 's' : ''} • ${[...new Set(info.behaviors)].join(', ')}`;
    const behaviorEmoji: Record<string, string> = {
        wander: '🌀', follow: '👣', tour: '🗺️', patrol: '🚶', orbit: '🔄', dance: '💃', idle: '😴',
    };
    return (
        <div
            className="fixed z-[90] pointer-events-none w-[180px] max-w-[calc(100vw-16px)] bg-black/80 ring-1 ring-fuchsia-500/30 rounded-xl backdrop-blur-md px-3 py-2.5 text-[10px] font-mono text-fuchsia-200 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
                left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
            }}
        >
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse shadow-[0_0_6px_rgba(232,121,249,0.6)]" />
                    <span className="font-bold tracking-widest uppercase text-fuchsia-300 text-xs">BOTS</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ${info.count > 0 ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-white/5 text-white/30 ring-white/10'}`}>
                    {info.count > 0 ? `${info.count} ON` : 'OFF'}
                </span>
            </div>
            <div className="text-fuchsia-100/80 mb-1.5 text-[10px] truncate">{summary}</div>
            {info.log.length > 0 && (
                <div className="border-t border-fuchsia-500/15 pt-1.5 space-y-0.5 max-h-[60px] overflow-hidden">
                    {info.log.slice(0, 3).map((l, i) => (
                        <div key={i} className="text-[10px] text-fuchsia-300/50 truncate flex items-center gap-1">
                            <span className="text-[10px]">›</span>{l}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Live debug overlay for viewport / safe-area / canvas dimensions. Mounted
// only when bot mode is on so it doesn't pollute the regular HUD. Useful to
// confirm visually that the layout system is doing the right thing on
// the actual device (no need to plug in DevTools).
export const ViewportDebug = () => {
    const [info, setInfo] = useState({
        innerW: 0, innerH: 0,
        dvh: 0, lvh: 0, svh: 0,
        sat: 0, sar: 0, sab: 0, sal: 0,
        dpr: 1,
        orient: '',
    });
    useEffect(() => {
        const probe = () => {
            const probeEl = document.createElement('div');
            probeEl.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;';
            probeEl.innerHTML = `
                <span data-k="dvh" style="height:100dvh;display:inline-block"></span>
                <span data-k="lvh" style="height:100lvh;display:inline-block"></span>
                <span data-k="svh" style="height:100svh;display:inline-block"></span>
                <span data-k="sat" style="height:env(safe-area-inset-top, 0px);display:inline-block"></span>
                <span data-k="sar" style="height:env(safe-area-inset-right, 0px);display:inline-block"></span>
                <span data-k="sab" style="height:env(safe-area-inset-bottom, 0px);display:inline-block"></span>
                <span data-k="sal" style="height:env(safe-area-inset-left, 0px);display:inline-block"></span>
            `;
            document.body.appendChild(probeEl);
            const get = (k: string) => Math.round((probeEl.querySelector(`[data-k="${k}"]`) as HTMLElement)?.getBoundingClientRect().height ?? 0);
            const orient = window.matchMedia('(orientation: landscape)').matches ? 'land' : 'portrait';
            setInfo({
                innerW: window.innerWidth,
                innerH: window.innerHeight,
                dvh: get('dvh'), lvh: get('lvh'), svh: get('svh'),
                sat: get('sat'), sar: get('sar'), sab: get('sab'), sal: get('sal'),
                dpr: window.devicePixelRatio || 1,
                orient,
            });
            document.body.removeChild(probeEl);
        };
        probe();
        window.addEventListener('resize', probe);
        window.addEventListener('orientationchange', probe);
        return () => {
            window.removeEventListener('resize', probe);
            window.removeEventListener('orientationchange', probe);
        };
    }, []);
    return (
        <div
            className="fixed z-[90] pointer-events-none px-2 py-1.5 rounded bg-black/80 ring-1 ring-cyan-500/40 text-cyan-200 text-[10px] font-mono tabular-nums leading-tight"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
                minWidth: '140px',
            }}
        >
            <div className="font-bold uppercase tracking-widest text-cyan-300 mb-1">viewport · {info.orient}</div>
            <div>inner {info.innerW}×{info.innerH}</div>
            <div>dvh {info.dvh}  lvh {info.lvh}  svh {info.svh}</div>
            <div>safe T{info.sat} R{info.sar} B{info.sab} L{info.sal}</div>
            <div>dpr {info.dpr.toFixed(2)}</div>
        </div>
    );
};
