import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { WALKING_URL, IDLE_URL, LOBBY_W, ELEV_W, HOUSE_DW, L1_BND, ELEV_BLD, HOUSE_EX, HOUSE_IN, DOOR_SEAL, PR } from './constants';
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

export type BotBehavior = 'idle' | 'wander' | 'follow' | 'tour';

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

const COLORS = ['#fbbf24', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c'];

const SPEED = 2.4;          // slightly slower than human player so bots feel different
const WANDER_JITTER = 1.8;  // radians/sec maximum direction noise
const ARRIVE_DIST = 0.6;

const randomLobbyPos = (): Vector3 => {
    // Spawn in the lobby quadrants, away from walls.
    const x = (Math.random() - 0.5) * 14;
    const z = (Math.random() - 0.5) * 14;
    return new Vector3(x, 0, z);
};

// Walls used for bot collision: lobby + elevator entrance + (in level 1) the
// outdoor/indoor sets so a bot doing a tour doesn't clip through walls.
const wallsForLevel = (level: number, doorsClosed: boolean, houseDoorOpen: boolean): number[][] => {
    if (level === 0) {
        const w = [...ELEV_W, ...LOBBY_W];
        if (doorsClosed) w.push(DOOR_SEAL);
        return w;
    }
    const w = [...ELEV_W, ...L1_BND, ...ELEV_BLD, ...HOUSE_EX, ...HOUSE_IN];
    if (!houseDoorOpen) w.push(HOUSE_DW);
    if (doorsClosed) w.push(DOOR_SEAL);
    return w;
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
            <primitive object={clonedScene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
            <Html position={[0, 2.2, 0]} center distanceFactor={8}>
                <div className="pointer-events-none select-none whitespace-nowrap">
                    <div
                        className="bg-black/75 px-2 py-0.5 rounded text-xs font-mono ring-1 ring-white/20 backdrop-blur-sm tabular-nums"
                        style={{ color: state.color, textShadow: '0 0 6px rgba(0,0,0,0.9)' }}
                    >
                        {('BOT-' + state.id).slice(0, 8).toUpperCase()}
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

const makeBot = (i: number): BotState => ({
    id: Math.random().toString(36).slice(2, 6),
    pos: randomLobbyPos(),
    rot: Math.random() * Math.PI * 2,
    anim: 'walking',
    behavior: 'wander',
    wanderTheta: Math.random() * Math.PI * 2,
    target: null,
    tourIdx: 0,
    color: COLORS[i % COLORS.length],
});

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
            setBots([makeBot(0)]);
            log('auto-spawned 1 bot (wander)');
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
        const walls = wallsForLevel(currentLevel, doorsClosed, houseDoorOpen);
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
                    if (b.tourIdx >= TOUR_WAYPOINTS.length) {
                        b.tourIdx = 0;
                    }
                    const [tx, tz] = TOUR_WAYPOINTS[b.tourIdx];
                    const dx = tx - b.pos.x, dz = tz - b.pos.z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d < ARRIVE_DIST) {
                        b.tourIdx += 1;
                    } else {
                        desiredX = dx / d;
                        desiredZ = dz / d;
                        b.wanderTheta = Math.atan2(desiredX, desiredZ);
                    }
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
                if (moved < SPEED * dt * 0.2 && b.behavior === 'wander') {
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
                for (let i = 0; i < n; i++) next.push(makeBot(start + i));
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
            help: () => {
                // eslint-disable-next-line no-console
                console.log(`%cjubileu bot api%c
spawn(n=1)   — adds n bots into the lobby
despawn()    — removes all bots
wander()     — all bots resume autonomous wandering
follow()     — all bots flock toward the human player
idle()       — all bots stop
tour()       — first bot runs the lobby waypoint tour
list()       — array of {id, behavior, pos}
`, 'background:#fbbf24;color:#000;padding:2px 6px;border-radius:3px', '');
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
    return (
        <div
            className="fixed z-[90] pointer-events-none w-[220px] max-w-[calc(100vw-24px)] bg-black/75 ring-1 ring-fuchsia-500/40 rounded-lg backdrop-blur-sm px-3 py-2 text-[10px] font-mono text-fuchsia-200 shadow-[0_4px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
            }}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold tracking-widest uppercase text-fuchsia-300">BOT</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] ring-1 ${info.count > 0 ? 'bg-green-500/30 text-green-200 ring-green-500/40' : 'bg-gray-500/30 text-gray-300 ring-gray-500/40'}`}>
                    {info.count > 0 ? 'ativo' : 'idle'}
                </span>
            </div>
            <div className="text-fuchsia-100/90 mb-1 truncate">{summary}</div>
            <div className="border-t border-fuchsia-500/20 mt-1 pt-1 max-h-[80px] overflow-hidden">
                {info.log.map((l, i) => (
                    <div key={i} className="text-[9px] text-fuchsia-200/70 truncate">{l}</div>
                ))}
            </div>
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
            className="fixed z-[90] pointer-events-none px-2 py-1.5 rounded bg-black/80 ring-1 ring-cyan-500/40 text-cyan-200 text-[9px] font-mono tabular-nums leading-tight"
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
