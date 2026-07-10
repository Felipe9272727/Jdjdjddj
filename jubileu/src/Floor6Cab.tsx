/**
 * Floor6Cab.tsx — the DEAD ELEVATOR of the Suíte 612.
 *
 * At the bang the cab DROPS: the whole shell settles crooked (rolled ~2.6°,
 * pitched forward, sunk a few cm), the sliding doors slam and jam leaving a
 * crooked squeeze gap, one ceiling panel swings loose on its cables and an
 * orange emergency lamp is the only thing still breathing. The player walks
 * IN through the gap; each repair part has its own home — the fuse box on
 * the left wall, the blown command panel on the right, the emergency winch
 * shaft on the back wall — and the crank physically turns while the player
 * winds it, shaking dust off the whole cab.
 *
 * Geometry note: the VISUAL floor stays almost level (feet must touch it);
 * the crooked read comes from the shell — walls, ceiling, doors, fittings —
 * with a tall kick trim hiding the floor/wall seam.
 */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f6 } from './f6Escape';
import { F6M, puffTex, botoeiraTex, winchPlaqueTex } from './Floor6Textures';
import { B, ItemMesh, type F6Fx, since } from './Floor6Props';
import { playF6Spark, playF6Slam, playF6Creak, playF6Groan } from './floor6Sfx';

const approach = (cur: number, target: number, dt: number, speed: number) =>
    cur + (target - cur) * Math.min(1, dt * speed);

/** The sliding façade doors — slam crooked at the bang, grind open on repair. */
const FacadeDoors: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const L = useRef<THREE.Group>(null!);
    const R = useRef<THREE.Group>(null!);
    const slammed = useRef(false);
    const reopened = useRef(false);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const phase = f6.phase;
        const jammed = phase === 'explore';
        const open = phase !== 'explore';   // arrive = parked open; repaired = ground back open
        // targets: parked open / jammed crooked (gap x∈[-0.7,0.7] matches colliders)
        const lx = jammed ? -1.35 : -1.98;
        const rx = jammed ? 1.35 : 1.98;
        const bangAge = since(fx, 'bang', now);
        const k = jammed && bangAge < 1 ? 14 : 1.4;   // slam fast, grind slow
        if (L.current) {
            L.current.position.x = approach(L.current.position.x, lx, dt, k);
            L.current.rotation.z = approach(L.current.rotation.z, jammed ? 0.045 : 0, dt, k);
        }
        if (R.current) {
            R.current.position.x = approach(R.current.position.x, rx, dt, k);
            R.current.rotation.z = approach(R.current.rotation.z, jammed ? -0.1 : 0, dt, k);
            R.current.position.y = approach(R.current.position.y, jammed ? -0.07 : 0, dt, k);
        }
        // sound beats
        if (jammed && !slammed.current && bangAge > 0.16) { slammed.current = true; playF6Slam(); }
        if (!jammed && slammed.current && !reopened.current && (phase === 'blackout' || phase === 'guest')) {
            reopened.current = true; playF6Creak(0.8); playF6Groan(0.5);
        }
        void open;
    });
    return (
        <group position={[0, 0, -9.96]}>
            {/* track header */}
            <B a={[3.4, 0.16, 0.2]} p={[0, 2.52, 0]} m={F6M.steel} />
            <group ref={L} position={[-1.98, 0, 0]}>
                <B a={[1.32, 2.46, 0.09]} p={[0, 1.23, 0]} m={F6M.steel} />
                <B a={[0.07, 2.34, 0.1]} p={[0.62, 1.23, 0.01]} m={F6M.rubber} />
                {/* dent kicked into the slab */}
                <B a={[0.5, 0.4, 0.025]} p={[0.2, 0.7, 0.045]} m={F6M.steelPlain} r={[0, 0, 0.2]} />
            </group>
            <group ref={R} position={[1.98, 0, 0]}>
                <B a={[1.32, 2.46, 0.09]} p={[0, 1.23, 0]} m={F6M.steel} />
                <B a={[0.07, 2.34, 0.1]} p={[-0.62, 1.23, 0.01]} m={F6M.rubber} />
            </group>
        </group>
    );
};

/** Junction box beside the doorway — blows at the bang and keeps sputtering. */
const JunctionBox: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const light = useRef<THREE.PointLight>(null!);
    const plate = useRef<THREE.MeshStandardMaterial>(null!);
    const sparkLeft = useRef(0);
    const nextSputter = useRef(4);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const blown = f6.phase !== 'arrive';
        const bangAge = since(fx, 'bang', now);
        if (bangAge < 0.05 && bangAge >= 0) sparkLeft.current = 2.2;
        if (f6.phase === 'explore') {
            nextSputter.current -= dt;
            if (nextSputter.current <= 0) {
                sparkLeft.current = 0.4 + Math.random() * 0.7;
                nextSputter.current = 5 + Math.random() * 9;
                playF6Spark(0.35);
            }
        }
        sparkLeft.current = Math.max(0, sparkLeft.current - dt);
        const sparking = sparkLeft.current > 0;
        if (light.current) light.current.intensity = sparking ? (Math.random() < 0.5 ? 18 : 2) : 0;
        if (plate.current) plate.current.emissiveIntensity = sparking ? 0.7 + Math.sin(now * 60) * 0.5 : 0;
        void blown;
    });
    const blown = f6.phase !== 'arrive';
    return (
        <group position={[-1.85, 1.3, -9.83]}>
            <mesh rotation={[0, 0, blown ? -0.3 : 0]} position={blown ? [0.04, -0.06, 0.03] : [0, 0, 0]}>
                <boxGeometry args={[0.42, 0.6, 0.09]} />
                <meshStandardMaterial ref={plate} color="#6a7076" metalness={0.6} roughness={0.5}
                    emissive="#ff8c3a" emissiveIntensity={0} />
            </mesh>
            {blown && (
                <>
                    {/* scorch on the wall behind */}
                    <mesh position={[0, 0.05, -0.035]}>
                        <planeGeometry args={[0.9, 1.1]} />
                        <meshStandardMaterial color="#16110c" transparent opacity={0.55} roughness={1} />
                    </mesh>
                    {/* hanging cables */}
                    <mesh position={[0.26, -0.42, 0.04]} rotation={[0, 0, 0.5]} material={F6M.rubber}>
                        <cylinderGeometry args={[0.014, 0.014, 0.5, 5]} />
                    </mesh>
                    <mesh position={[0.1, -0.5, 0.05]} rotation={[0, 0, -0.2]} material={F6M.rubber}>
                        <cylinderGeometry args={[0.01, 0.01, 0.4, 5]} />
                    </mesh>
                    <pointLight ref={light} position={[0.2, -0.2, 0.4]} color="#ffb066"
                        distance={5} decay={2} intensity={0} />
                </>
            )}
            {/* the typed note taped beside the box */}
            <mesh position={[0.42, -0.05, 0.02]} rotation={[0, 0, 0.06]}>
                <planeGeometry args={[0.26, 0.32]} />
                <meshStandardMaterial color="#ded6bd" roughness={0.95} />
            </mesh>
        </group>
    );
};

/** Fuse box on the cab's left wall. */
const FuseBox: React.FC = () => {
    const hatch = useRef<THREE.Group>(null!);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (hatch.current) {
            // hangs open while the socket is empty; eases shut once installed
            hatch.current.rotation.y = approach(
                hatch.current.rotation.y, f6.installed.fusivel ? -0.25 : -2.3, dt, 3);
        }
    });
    return (
        <group position={[-3.05, 1.35, 0.35]} rotation={[0, Math.PI / 2, 0]}>
            <B a={[0.4, 0.5, 0.12]} p={[0, 0, -0.03]} m={F6M.steel} />
            <B a={[0.32, 0.42, 0.06]} p={[0, 0, 0.0]} m={F6M.dark} />
            {/* clamps */}
            <B a={[0.05, 0.08, 0.06]} p={[-0.1, 0.06, 0.04]} m={F6M.brass} />
            <B a={[0.05, 0.08, 0.06]} p={[0.1, 0.06, 0.04]} m={F6M.brass} />
            {/* charred old fuse bits at the bottom */}
            <B a={[0.1, 0.04, 0.05]} p={[-0.05, -0.14, 0.04]} m={F6M.rubber} r={[0, 0, 0.4]} />
            <B a={[0.07, 0.03, 0.04]} p={[0.08, -0.15, 0.04]} m={F6M.rubber} r={[0, 0, -0.2]} />
            {/* the new fuse, once seated */}
            {f6.installed.fusivel && (
                <group position={[0, 0.06, 0.05]}>
                    <ItemMesh kind="fusivel" />
                </group>
            )}
            {/* hatch */}
            <group ref={hatch} position={[-0.2, 0, 0.03]} rotation={[0, -2.3, 0]}>
                <B a={[0.4, 0.5, 0.025]} p={[0.2, 0, 0]} m={F6M.steel} />
                <B a={[0.05, 0.1, 0.03]} p={[0.36, 0, 0.02]} m={F6M.steelPlain} />
            </group>
            {/* stencil label */}
            <B a={[0.3, 0.07, 0.005]} p={[0, 0.31, 0.03]} m={F6M.paper} />
        </group>
    );
};

/** The blown command panel on the cab's right wall (relay socket). */
const CommandPanel: React.FC = () => {
    const plate = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (plate.current) {
            // the dangling plate sways on its last screw until the relay goes in
            const target = f6.installed.rele ? 0 : -0.45 + Math.sin(clock.elapsedTime * 0.9) * 0.03;
            plate.current.rotation.z = approach(plate.current.rotation.z, target, dt, 2);
        }
    });
    return (
        <group position={[3.05, 1.4, 1.75]} rotation={[0, -Math.PI / 2, 0]}>
            {/* cavity */}
            <B a={[0.5, 0.9, 0.1]} p={[0, 0, -0.04]} m={F6M.dark} />
            {/* melted copper guts */}
            <B a={[0.08, 0.3, 0.04]} p={[-0.12, 0.18, 0.0]} m={F6M.brassOld} r={[0, 0, 0.3]} />
            <B a={[0.06, 0.22, 0.04]} p={[0.1, 0.1, 0.0]} m={F6M.rubber} r={[0, 0, -0.2]} />
            {/* octal socket */}
            <mesh position={[0, -0.18, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.07, 0.07, 0.04, 8]} />
            </mesh>
            {f6.installed.rele
                ? <group position={[0, -0.1, 0.05]}><ItemMesh kind="rele" /></group>
                : Array.from({ length: 8 }).map((_, i) => {
                    const a = (i / 8) * Math.PI * 2;
                    return (
                        <mesh key={i} position={[Math.cos(a) * 0.04, -0.18, 0.045 + Math.sin(a) * 0]}
                            material={F6M.dark}>
                            <cylinderGeometry args={[0.005, 0.005, 0.02, 4]} />
                        </mesh>
                    );
                })}
            {/* dead floor buttons column */}
            {[0.32, 0.2].map((y) => (
                <mesh key={y} position={[0.16, y, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={F6M.dark}>
                    <cylinderGeometry args={[0.025, 0.025, 0.02, 8]} />
                </mesh>
            ))}
            {/* the plate hanging from one screw */}
            <group ref={plate} position={[-0.24, 0.42, 0.05]} rotation={[0, 0, -0.45]}>
                <B a={[0.5, 0.9, 0.02]} p={[0.25, -0.45, 0]} m={F6M.steel} />
            </group>
        </group>
    );
};

/** The button column beside the command panel. Floors 1·2·3·5·6·7 — and a
 *  burnt empty socket where the 4 should be. The diary points here. */
const Botoeira: React.FC = () => (
    <group position={[3.04, 1.5, 2.3]} rotation={[0, -Math.PI / 2, 0]}>
        <B a={[0.22, 1.08, 0.03]} p={[0, 0, 0]} m={F6M.steel} />
        <mesh position={[0, 0, 0.017]}>
            <planeGeometry args={[0.19, 1.0]} />
            <meshStandardMaterial map={botoeiraTex} roughness={0.55} metalness={0.3} envMapIntensity={0.6} />
        </mesh>
        {/* the 4's socket, recessed for real */}
        <mesh position={[0, 0.002, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={F6M.rubber}>
            <cylinderGeometry args={[0.036, 0.036, 0.02, 12]} />
        </mesh>
    </group>
);

/** The emergency winch on the back wall — shaft, plaque, and the crank that
 *  REALLY turns while the player winds it. */
const Winch: React.FC = () => {
    const crank = useRef<THREE.Group>(null!);
    const lastT = useRef(0);
    useFrame(({ clock }) => {
        if (!crank.current) return;
        // 7 full turns across the wind; idle keeps last angle
        crank.current.rotation.z = -f6.crankT * Math.PI * 14;
        // tiny ratchet shiver while actively winding
        if (f6.crankT !== lastT.current && f6.crankT > 0 && f6.crankT < 1) {
            crank.current.rotation.z += Math.sin(clock.elapsedTime * 40) * 0.02;
        }
        lastT.current = f6.crankT;
    });
    return (
        <group position={[0, 1.25, -2.86]}>
            {/* plaque — "SÓ PESSOAL AUTORIZADO", dulled by years */}
            <mesh position={[0, 0.55, 0.01]}>
                <planeGeometry args={[0.7, 0.18]} />
                <meshStandardMaterial map={winchPlaqueTex} roughness={0.45} metalness={0.2} envMapIntensity={0.4} />
            </mesh>
            <B a={[0.66, 0.14, 0.02]} p={[0, 0.55, 0.02]} m={F6M.applianceDk} />
            {/* gearbox housing + square shaft stub */}
            <B a={[0.36, 0.36, 0.14]} p={[0, 0, 0.02]} m={F6M.steel} />
            {[-0.14, 0.14].map((x) => (
                <mesh key={x} position={[x, -0.21, 0.04]} material={F6M.rubber}>
                    <cylinderGeometry args={[0.02, 0.02, 0.1, 6]} />
                </mesh>
            ))}
            <B a={[0.05, 0.05, 0.12]} p={[0, 0, 0.14]} m={F6M.steelPlain} />
            {/* the crank itself, once installed */}
            {f6.installed.manivela && (
                <group ref={crank} position={[0, 0, 0.2]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]} material={F6M.steelPlain}>
                        <cylinderGeometry args={[0.028, 0.028, 0.1, 8]} />
                    </mesh>
                    <B a={[0.05, 0.34, 0.04]} p={[0, 0.15, 0.02]} m={F6M.steelPlain} />
                    <mesh position={[0, 0.3, 0.09]} rotation={[Math.PI / 2, 0, 0]} material={F6M.woodDk}>
                        <cylinderGeometry args={[0.032, 0.032, 0.12, 10]} />
                    </mesh>
                </group>
            )}
        </group>
    );
};

/** One loose ceiling panel hanging into the cab on its cables. */
const HangingPanel: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        if (g.current) {
            const t = clock.elapsedTime;
            g.current.rotation.x = 1.15 + Math.sin(t * 0.7) * 0.05;
            g.current.rotation.z = Math.sin(t * 0.43) * 0.03;
        }
    });
    return (
        <group position={[0.9, 2.58, 0.6]}>
            <group ref={g} rotation={[1.15, 0, 0]}>
                <B a={[0.9, 0.04, 0.9]} p={[0, 0, 0.45]} m={F6M.steelPlain} />
            </group>
            {/* the cables it hangs from */}
            <mesh position={[-0.3, -0.25, 0.1]} rotation={[0.3, 0, 0.2]} material={F6M.rubber}>
                <cylinderGeometry args={[0.008, 0.008, 0.6, 4]} />
            </mesh>
            <mesh position={[0.35, -0.3, 0.15]} rotation={[0.4, 0, -0.15]} material={F6M.rubber}>
                <cylinderGeometry args={[0.008, 0.008, 0.7, 4]} />
            </mesh>
        </group>
    );
};

/** Thin smoke crawling out of the door gap after the bang. */
const CrackSmoke: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock, camera }) => {
        if (!g.current) return;
        const on = f6.phase === 'explore';
        g.current.visible = on;
        if (!on) return;
        const t = clock.elapsedTime;
        g.current.children.forEach((c, i) => {
            const ph = (t * 0.16 + i * 0.31) % 1;
            c.position.set(Math.sin(t * 0.5 + i) * 0.1, 0.3 + ph * 2.1, ph * 0.25);
            c.scale.setScalar(0.4 + ph * 1.3);
            c.quaternion.copy(camera.quaternion);
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.12 * Math.sin(ph * Math.PI);
        });
    });
    return (
        <group ref={g} position={[-1.0, 0, -9.85]} visible={false}>
            {[0, 1, 2].map((i) => (
                <mesh key={i}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={puffTex} color="#8d8780" transparent opacity={0}
                        depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

/** The whole dead cab. */
export const DeadCab: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const shell = useRef<THREE.Group>(null!);
    const emergency = useRef<THREE.PointLight>(null!);
    const settled = useRef(false);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        if (!shell.current) return;
        const dead = f6.phase !== 'arrive';
        const bangAge = since(fx, 'bang', now);
        // the DROP: tilt + sink land with a decaying bounce just after the bang
        const target = dead ? 1 : 0;
        let amt = shell.current.userData.amt ?? 0;
        amt = approach(amt, target, dt, bangAge < 1.5 ? 9 : 2);
        shell.current.userData.amt = amt;
        const bounce = bangAge < 1.1 ? Math.sin(bangAge * 22) * Math.exp(-bangAge * 4.5) * 0.02 : 0;
        shell.current.rotation.z = (0.046 + bounce * 0.4) * amt;
        shell.current.rotation.x = 0.016 * amt;
        shell.current.position.y = (-0.05 + bounce) * amt;
        if (dead && bangAge > 0.5 && !settled.current) { settled.current = true; playF6Groan(0.8); }
        // cranking shakes the whole cab
        if (f6.crankT > 0 && f6.crankT < 1) {
            shell.current.position.x = Math.sin(now * 37) * 0.006;
            shell.current.rotation.z += Math.sin(now * 29) * 0.0012;
        } else shell.current.position.x = 0;
        // emergency lamp: alive only in the dead cab, tired flicker
        if (emergency.current) {
            const on = f6.phase === 'explore';
            emergency.current.intensity = on
                ? (Math.sin(now * 7.3) > -0.92 ? 7.5 + Math.sin(now * 1.7) * 1.0 : 1.2)
                : 0;
        }
    });
    const dead = f6.phase !== 'arrive';
    return (
        <group>
            <FacadeDoors fx={fx} />
            <JunctionBox fx={fx} />
            <CrackSmoke />
            {/* everything below only exists once the cab is dead — during
                'arrive' the global ElevatorInterior is the live cab */}
            {dead && (
                <>
                    {/* the level-ish floor (feet stay planted) + debris */}
                    <group position={[0, 0, -12.95]}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} material={F6M.cabFloor}>
                            <planeGeometry args={[6.3, 5.9]} />
                        </mesh>
                        {/* fallen ceiling panel + screws + the old burnt fuse */}
                        <B a={[0.8, 0.03, 0.7]} p={[-1.2, 0.04, 0.6]} m={F6M.steelPlain} r={[0, 0.5, 0.03]} />
                        <B a={[0.1, 0.05, 0.08]} p={[0.8, 0.04, -0.9]} m={F6M.rubber} r={[0, 0.3, 0]} />
                        {[[-0.4, 1.2], [0.3, 0.9], [-0.9, -0.5]].map(([x, z], i) => (
                            <mesh key={i} position={[x, 0.03, z]} material={F6M.brassOld}>
                                <cylinderGeometry args={[0.012, 0.012, 0.03, 6]} />
                            </mesh>
                        ))}
                        {/* dust drifts */}
                        <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[1.1, 0.02, 1.6]}>
                            <planeGeometry args={[1.4, 0.8]} />
                            <meshStandardMaterial color="#8d8478" transparent opacity={0.07} roughness={1} depthWrite={false} />
                        </mesh>
                    </group>
                    {/* the crooked shell */}
                    <group ref={shell} position={[0, 0, -12.95]}>
                        {/* side walls */}
                        <B a={[0.1, 2.7, 5.9]} p={[-3.12, 1.35, 0]} m={F6M.cabWall} />
                        <B a={[0.1, 2.7, 5.9]} p={[3.12, 1.35, 0]} m={F6M.cabWall} />
                        {/* back wall */}
                        <B a={[6.34, 2.7, 0.1]} p={[0, 1.35, -2.92]} m={F6M.cabWall} />
                        {/* front wall around the doorway */}
                        <B a={[1.8, 2.7, 0.1]} p={[-2.27, 1.35, 2.92]} m={F6M.cabWall} />
                        <B a={[1.8, 2.7, 0.1]} p={[2.27, 1.35, 2.92]} m={F6M.cabWall} />
                        <B a={[2.8, 0.32, 0.1]} p={[0, 2.56, 2.92]} m={F6M.cabWall} />
                        {/* dropped ceiling: grid + dead fluoro */}
                        <B a={[6.34, 0.06, 5.9]} p={[0, 2.62, 0]} m={F6M.dark} />
                        {[-1.05, 1.05].map((x) => (
                            <B key={x} a={[0.16, 0.05, 4.6]} p={[x, 2.59, 0]} m={F6M.steelPlain} />
                        ))}
                        {/* the dead fluoro — matte, lightless, a corpse of a lamp */}
                        <mesh position={[0, 2.56, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[1.6, 0.5]} />
                            <meshStandardMaterial color="#15171a" roughness={0.95} envMapIntensity={0.1} />
                        </mesh>
                        <HangingPanel />
                        {/* kick trim hides the floor seam under the tilt */}
                        <B a={[0.16, 0.38, 5.9]} p={[-3.08, 0.12, 0]} m={F6M.rubber} />
                        <B a={[0.16, 0.38, 5.9]} p={[3.08, 0.12, 0]} m={F6M.rubber} />
                        <B a={[6.3, 0.38, 0.16]} p={[0, 0.12, -2.88]} m={F6M.rubber} />
                        <B a={[1.84, 0.38, 0.16]} p={[-2.25, 0.12, 2.88]} m={F6M.rubber} />
                        <B a={[1.84, 0.38, 0.16]} p={[2.25, 0.12, 2.88]} m={F6M.rubber} />
                        {/* handrails — the right one took the hit */}
                        <mesh position={[-3.02, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={F6M.steelPlain}>
                            <cylinderGeometry args={[0.025, 0.025, 5.2, 8]} />
                        </mesh>
                        <mesh position={[0, 1.05, -2.82]} rotation={[0, 0, Math.PI / 2]} material={F6M.steelPlain}>
                            <cylinderGeometry args={[0.025, 0.025, 5.6, 8]} />
                        </mesh>
                        <mesh position={[3.02, 1.1, -1.4]} rotation={[Math.PI / 2, 0, 0]} material={F6M.steelPlain}>
                            <cylinderGeometry args={[0.025, 0.025, 2.6, 8]} />
                        </mesh>
                        <mesh position={[3.0, 0.78, 0.2]} rotation={[Math.PI / 2 + 0.45, 0, 0]} material={F6M.steelPlain}>
                            <cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />
                        </mesh>
                        {/* emergency lamp, back-right corner */}
                        <group position={[2.6, 2.35, -2.8]}>
                            <B a={[0.2, 0.12, 0.1]} p={[0, 0, 0]} m={F6M.steelPlain} />
                            <mesh position={[0, -0.02, 0.08]}>
                                <sphereGeometry args={[0.06, 8, 6]} />
                                <meshStandardMaterial color="#ffb066" emissive="#ff9a4a" emissiveIntensity={2} />
                            </mesh>
                        </group>
                        <pointLight ref={emergency} position={[2.3, 2.1, -2.3]} color="#ff9a4a"
                            intensity={0} distance={10} decay={2} />
                        {/* fill light: cold faint light inside dead cab */}
                        <pointLight position={[-0.5, 1.8, -2.5]} color="#6a7585" intensity={2.5} distance={8} decay={2} />
                        {/* the part homes */}
                        <FuseBox />
                        <CommandPanel />
                        <Botoeira />
                        <Winch />
                        {/* cables spilling from the ceiling near the panel */}
                        <mesh position={[2.9, 2.1, 1.2]} rotation={[0.4, 0, 0.3]} material={F6M.rubber}>
                            <cylinderGeometry args={[0.012, 0.012, 0.9, 5]} />
                        </mesh>
                    </group>
                </>
            )}
        </group>
    );
};

export default DeadCab;
