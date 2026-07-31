/**
 * Floor5Track.tsx — the WORLD of Floor 5: a candy-bright N64 race course in
 * the sky. Two mirrored lanes (player BLUE, robot RED) behind a small plaza
 * where the elevator opens. Everything is flat-shaded primitives + tiny
 * NearestFilter canvas textures — pure 1996.
 *
 * All obstacle visuals are driven by the SAME f5.clock the collision math
 * uses (f5Race.ts), so what you see is exactly what hits you.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    f5, LANE_PLAYER, LANE_ROBOT, LANE_HALF, START_Z, FINISH_Z,
    SPINNERS, PUSHERS, PUSHER, GAP, HAMMER, BALLS, STEPS, STEP_PLATEAU_END, STEP_RAMP_END, ballsAt,
} from './f5Race';
import { mat64 } from './Floor5Player64';

// ── tiny textures ─────────────────────────────────────────────────────────────
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    return t;
}
const checker = (a: string, b: string) => canvasTex(2, 2, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 2, 2);
    g.fillStyle = b; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
});
const bannerTex = (text: string, bg: string, fg: string) => canvasTex(256, 64, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
    g.fillStyle = fg; g.font = 'bold 38px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
});
const checkerBannerTex = canvasTex(8, 2, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 2);
    g.fillStyle = '#111';
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) if ((x + y) % 2 === 0) g.fillRect(x, y, 1, 1);
});

function floorMat(a: string, b: string, rx: number, rz: number): THREE.MeshLambertMaterial {
    const t = checker(a, b);
    t.repeat.set(rx, rz);
    return new THREE.MeshLambertMaterial({ map: t, flatShading: true });
}

// shared mats
const MT = {
    rail: mat64('#f2e9d8'), railTop: mat64('#e8503a'), post: mat64('#6a7480'),
    danger: mat64('#ffd24d'), dangerDk: mat64('#e8503a'), metal: mat64('#8a93a0'),
    foam: mat64('#ff9ec8'), wood: mat64('#a8743f'), green: mat64('#58b84d'), greenDk: mat64('#3f9638'),
    cloud: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    gold: mat64('#FFD54F'), dark: mat64('#33383e'),
};

const Strip: React.FC<{ x: number; z0: number; z1: number; w: number; y?: number; mat: THREE.Material }> =
    ({ x, z0, z1, w, y = 0, mat }) => (
        <mesh position={[x, y - 0.25, (z0 + z1) / 2]} material={mat}>
            <boxGeometry args={[w, 0.5, z1 - z0]} />
        </mesh>
    );

// ── one LANE (floor + obstacles), mirrored for the player and the robot ──────
const Lane: React.FC<{ cx: number; tint: 'blue' | 'red' }> = ({ cx, tint }) => {
    const fm = useMemo(() => tint === 'blue'
        ? floorMat('#7fa8d8', '#5d88c0', 5, 26)
        : floorMat('#d88a7f', '#c0655d', 5, 26), [tint]);
    const padM = useMemo(() => tint === 'blue' ? mat64('#9fc2e8') : mat64('#e8a89f'), [tint]);
    const W = LANE_HALF * 2 + 1;

    // animated bits
    const spin = useRef<Array<THREE.Group | null>>([]);
    const push = useRef<Array<THREE.Group | null>>([]);
    const ham = useRef<THREE.Group | null>(null);
    const ballRefs = useRef<Array<THREE.Mesh | null>>([]);
    useFrame(() => {
        const t = f5.clock;
        SPINNERS.forEach((s, i) => { const g = spin.current[i]; if (g) g.rotation.y = -t * s.speed * s.dir; });
        PUSHERS.forEach((p, i) => { const g = push.current[i]; if (g) g.position.x = cx + Math.sin(t * PUSHER.w + p.phase) * PUSHER.amp; });
        if (ham.current) ham.current.rotation.z = Math.sin(t * HAMMER.w) * HAMMER.amp;
        const live = ballsAt(t);
        ballRefs.current.forEach((m, i) => {
            if (!m) return;
            const b = live[i];
            m.visible = !!b;
            if (b) { m.position.set(cx + b.x, BALLS.r, b.z); m.rotation.x = -t * BALLS.speed / BALLS.r; }
        });
    });

    return (
        <group>
            {/* floor sections (must mirror groundHeightAt exactly) */}
            <Strip x={cx} z0={START_Z} z1={GAP.z0} w={W} mat={fm} />
            {GAP.pads.map((p, i) => (
                <mesh key={i} position={[cx + p.dx, -0.25, p.z]} material={padM}>
                    <boxGeometry args={[GAP.halfW * 2, 0.5, GAP.halfD * 2]} />
                </mesh>
            ))}
            <Strip x={cx} z0={GAP.z0 - 0.5} z1={GAP.z1 + 0.5} w={W + 1} y={GAP.foamY} mat={MT.foam} />
            <Strip x={cx} z0={GAP.z1} z1={STEPS[0].z0} w={W} mat={fm} />
            {STEPS.map((s, i) => {
                const z1 = i < STEPS.length - 1 ? STEPS[i + 1].z0 : STEP_PLATEAU_END;
                return <mesh key={i} position={[cx, s.h / 2 - 0.25, (s.z0 + z1) / 2]} material={fm}>
                    <boxGeometry args={[W, s.h + 0.5, z1 - s.z0]} />
                </mesh>;
            })}
            {/* the slide back down (visual wedge matching the height ramp) */}
            <mesh position={[cx, STEPS[2].h / 2 - 0.26, (STEP_PLATEAU_END + STEP_RAMP_END) / 2]}
                rotation={[Math.atan2(-STEPS[2].h, STEP_RAMP_END - STEP_PLATEAU_END), 0, 0]} material={fm}>
                <boxGeometry args={[W, 0.5, Math.hypot(STEP_RAMP_END - STEP_PLATEAU_END, STEPS[2].h) + 0.4]} />
            </mesh>
            <Strip x={cx} z0={STEP_RAMP_END} z1={FINISH_Z + 14} w={W} mat={fm} />

            {/* SPINNERS — a sweeping bar on a post */}
            {SPINNERS.map((s, i) => (
                <group key={i} position={[cx, 0, s.z]}>
                    <mesh position={[0, 0.55, 0]} material={MT.post}><cylinderGeometry args={[0.22, 0.3, 1.1, 8]} /></mesh>
                    <group ref={(n) => { spin.current[i] = n; }} position={[0, 0.55, 0]}>
                        <mesh material={MT.dangerDk}><boxGeometry args={[s.len * 2, 0.3, 0.34]} /></mesh>
                        <mesh position={[s.len - 0.4, 0, 0]} material={MT.danger}><boxGeometry args={[0.8, 0.34, 0.4]} /></mesh>
                        <mesh position={[-s.len + 0.4, 0, 0]} material={MT.danger}><boxGeometry args={[0.8, 0.34, 0.4]} /></mesh>
                    </group>
                </group>
            ))}
            {/* PUSHERS — sliding blocks */}
            {PUSHERS.map((p, i) => (
                <group key={i}>
                    <mesh position={[cx, 0.02, p.z]} material={MT.dark}><boxGeometry args={[W - 0.6, 0.06, 0.5]} /></mesh>
                    <group ref={(n) => { push.current[i] = n; }} position={[cx, 0, p.z]}>
                        <mesh position={[0, PUSHER.height / 2, 0]} material={i % 2 ? MT.danger : MT.dangerDk}>
                            <boxGeometry args={[PUSHER.halfW * 2, PUSHER.height, PUSHER.halfD * 2]} />
                        </mesh>
                    </group>
                </group>
            ))}
            {/* THE HAMMER — swinging wrecking ball under a gantry */}
            <group position={[cx, 0, HAMMER.z]}>
                {[-1, 1].map((s) => (
                    <mesh key={s} position={[s * (LANE_HALF + 0.4), HAMMER.pivotY / 2, 0]} material={MT.post}>
                        <boxGeometry args={[0.35, HAMMER.pivotY, 0.35]} />
                    </mesh>
                ))}
                <mesh position={[0, HAMMER.pivotY, 0]} rotation={[0, 0, Math.PI / 2]} material={MT.metal}>
                    <cylinderGeometry args={[0.14, 0.14, (LANE_HALF + 0.4) * 2, 8]} />
                </mesh>
                <group ref={ham} position={[0, HAMMER.pivotY, 0]}>
                    <mesh position={[0, -HAMMER.armLen / 2, 0]} material={MT.metal}>
                        <cylinderGeometry args={[0.09, 0.09, HAMMER.armLen, 6]} />
                    </mesh>
                    <mesh position={[0, -HAMMER.armLen, 0]} material={MT.dangerDk}>
                        <sphereGeometry args={[HAMMER.headR, 10, 8]} />
                    </mesh>
                </group>
            </group>
            {/* ROLLING BALLS */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <mesh key={i} ref={(n) => { ballRefs.current[i] = n; }} visible={false} material={MT.danger}>
                    <sphereGeometry args={[BALLS.r, 10, 8]} />
                </mesh>
            ))}
        </group>
    );
};

// ── arches, rails, plaza, scenery ─────────────────────────────────────────────
const Arch: React.FC<{ z: number; label: string; checkered?: boolean }> = ({ z, label, checkered }) => {
    const tex = useMemo(() => bannerTex(label, '#1c2433', '#FFD54F'), [label]);
    return (
        <group position={[0, 0, z]}>
            {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 11, 3.5, 0]} material={MT.rail}><boxGeometry args={[0.7, 7, 0.7]} /></mesh>
            ))}
            <mesh position={[0, 7.4, 0]}>
                <boxGeometry args={[22.7, 1.5, 0.5]} />
                <meshLambertMaterial map={tex} flatShading />
            </mesh>
            {checkered && (
                <mesh position={[0, 6.35, 0]}>
                    <boxGeometry args={[22.7, 0.65, 0.4]} />
                    <meshLambertMaterial map={checkerBannerTex} flatShading />
                </mesh>
            )}
        </group>
    );
};

/** Bouncing "!" + glow ring at the start line during the walk phase. */
const StartMarker: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    const tex = useMemo(() => bannerTex('!', '#00000000', '#FFD54F'), []);
    useFrame((state) => {
        if (!g.current) return;
        g.current.visible = f5.phase === 'walk';
        g.current.position.y = 2.3 + Math.sin(state.clock.elapsedTime * 3.2) * 0.25;
        g.current.rotation.y = state.clock.elapsedTime * 1.4;
    });
    return (
        <group>
            <group ref={g} position={[LANE_PLAYER, 2.3, -1]}>
                <mesh><planeGeometry args={[1.6, 1.6]} /><meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} /></mesh>
            </group>
        </group>
    );
};

export const Floor5Track: React.FC<{ doorRef: React.MutableRefObject<number> }> = ({ doorRef }) => {
    const plazaM = useMemo(() => floorMat('#cfc3a5', '#b8ab8c', 11, 8), []);
    const doorL = useRef<THREE.Mesh>(null!);
    const doorR = useRef<THREE.Mesh>(null!);
    useFrame(() => {
        const k = doorRef.current;
        if (doorL.current) doorL.current.position.x = -0.8 - k * 1.5;
        if (doorR.current) doorR.current.position.x = 0.8 + k * 1.5;
    });

    const clouds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
        x: -70 + (i * 37) % 140, y: 16 + (i * 7) % 14, z: -20 + (i * 53) % 200, s: 2.5 + (i * 13) % 4,
    })), []);
    const crowd = useMemo(() => {
        const cs = ['#e8503a', '#FFD54F', '#58b84d', '#3b6fb0', '#b06ad8', '#ff9ec8'];
        return Array.from({ length: 60 }, (_, i) => ({
            x: (i % 2 ? 14.2 : -14.2) + (i % 3) * 1.1 * (i % 2 ? 1 : -1),
            z: 14 + (i * 7.3) % 130,
            y: 0.9 + (i % 3) * 0.8,
            c: cs[i % cs.length],
        }));
    }, []);

    return (
        <group>
            {/* sky, sun, fog-friendly lights */}
            <ambientLight intensity={0.95} color="#dfeaff" />
            <directionalLight position={[30, 50, -20]} intensity={1.25} color="#fff4d8" />

            {/* plaza + the elevator CAB you arrive inside (1st person): door
                frame + sliding doors + interior shell. It pops off the moment
                the reveal pulls the camera back through it — which the player
                can never see, because the chase cam always faces the track. */}
            <Strip x={0} z0={-18.4} z1={START_Z} w={22} mat={plazaM} />
            <group visible={f5.phase === 'intro' || f5.phase === 'talk'}>
                <group position={[0, 0, -15.2]}>
                    {/* frame: jambs + lintel + the gold sign */}
                    <mesh position={[-2.0, 2.1, 0]} material={MT.dark}><boxGeometry args={[1.2, 4.2, 0.5]} /></mesh>
                    <mesh position={[2.0, 2.1, 0]} material={MT.dark}><boxGeometry args={[1.2, 4.2, 0.5]} /></mesh>
                    <mesh position={[0, 3.85, 0]} material={MT.dark}><boxGeometry args={[5.2, 0.9, 0.5]} /></mesh>
                    <mesh position={[0, 4.6, 0]} material={MT.gold}><boxGeometry args={[3.2, 0.6, 0.3]} /></mesh>
                    <mesh ref={doorL} position={[-0.8, 1.7, 0.05]} material={MT.metal}><boxGeometry args={[1.6, 3.4, 0.16]} /></mesh>
                    <mesh ref={doorR} position={[0.8, 1.7, 0.05]} material={MT.metal}><boxGeometry args={[1.6, 3.4, 0.16]} /></mesh>
                </group>
                {/* cab interior behind the doors */}
                <mesh position={[0, 2.1, -18.0]} material={MT.metal}><boxGeometry args={[4.4, 4.2, 0.3]} /></mesh>
                <mesh position={[-2.2, 2.1, -16.6]} material={MT.metal}><boxGeometry args={[0.3, 4.2, 3.0]} /></mesh>
                <mesh position={[2.2, 2.1, -16.6]} material={MT.metal}><boxGeometry args={[0.3, 4.2, 3.0]} /></mesh>
                <mesh position={[0, 4.2, -16.6]} material={MT.dark}><boxGeometry args={[4.4, 0.3, 3.0]} /></mesh>
            </group>

            {/* the two lanes + rails + divider */}
            <Lane cx={LANE_PLAYER} tint="blue" />
            <Lane cx={LANE_ROBOT} tint="red" />
            {[-10.2, 10.2].map((x) => (
                <group key={x}>
                    <Strip x={x} z0={START_Z} z1={FINISH_Z + 14} w={0.5} y={0.65} mat={MT.rail} />
                    <Strip x={x} z0={START_Z} z1={FINISH_Z + 14} w={0.54} y={0.95} mat={MT.railTop} />
                </group>
            ))}
            <Strip x={0} z0={START_Z} z1={FINISH_Z + 14} w={0.7} y={0.8} mat={MT.rail} />
            <Strip x={0} z0={START_Z} z1={FINISH_Z + 14} w={0.74} y={1.05} mat={MT.railTop} />

            <Arch z={START_Z} label="LARGADA" />
            <Arch z={FINISH_Z} label="CHEGADA" checkered />
            <StartMarker />

            {/* bleachers + the audience of little blocks */}
            {[-1, 1].map((s) => (
                <group key={s}>
                    <mesh position={[s * 14.6, 0.8, 76]} material={MT.wood}><boxGeometry args={[3.4, 1.6, 132]} /></mesh>
                    <mesh position={[s * 16, 1.6, 76]} material={MT.wood}><boxGeometry args={[2.0, 3.2, 132]} /></mesh>
                </group>
            ))}
            {crowd.map((c, i) => (
                <mesh key={i} position={[c.x, c.y + 0.9, c.z]} material={mat64(c.c)}>
                    <boxGeometry args={[0.55, 0.8, 0.55]} />
                </mesh>
            ))}

            {/* floating island edges + hills + clouds (it's the SKY floor) */}
            <mesh position={[0, -4.2, 75]} material={MT.greenDk}><boxGeometry args={[40, 7, 200]} /></mesh>
            <mesh position={[0, -2.2, -8]} material={MT.green}><boxGeometry args={[26, 4, 18]} /></mesh>
            {[[-30, 40], [34, 90], [-36, 120], [30, 20]].map(([x, z], i) => (
                <mesh key={i} position={[x, 2, z]} material={i % 2 ? MT.green : MT.greenDk}>
                    <coneGeometry args={[10, 14, 6]} />
                </mesh>
            ))}
            {clouds.map((c, i) => (
                <group key={i} position={[c.x, c.y, c.z]}>
                    <mesh material={MT.cloud}><boxGeometry args={[c.s, c.s * 0.4, c.s * 0.6]} /></mesh>
                    <mesh position={[c.s * 0.5, c.s * 0.16, 0]} material={MT.cloud}><boxGeometry args={[c.s * 0.6, c.s * 0.3, c.s * 0.5]} /></mesh>
                </group>
            ))}
        </group>
    );
};

export default Floor5Track;
