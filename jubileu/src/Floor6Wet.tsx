/**
 * Floor6Wet.tsx — the LOCKED rooms of the Suíte 612 (bathroom + kitchen) and
 * their doors, fully animated: the padlock pops and DROPS, the chain slides
 * off link by link, the tap pours a real stream, steam writes the dead man's
 * message into the mirror, the cistern lid glides off, the fridge swings
 * open into its own light, the stove burns a real blue ring and the ice
 * block visibly melts down to the relay.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f6 } from './f6Escape';
import { F6M, dndTex, truthTex, mirrorFog, puffTex, showerCurtainTex } from './Floor6Textures';
import { B, RB, ItemMesh, type F6Fx, since } from './Floor6Props';
import { playF6Thud } from './floor6Sfx';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const approach = (cur: number, target: number, dt: number, speed: number) =>
    cur + (target - cur) * Math.min(1, dt * speed);

/** truthTex for a plane that's been rotated 180° — repeat.x −1 un-mirrors it. */
const truthTexBack = (() => {
    const t = truthTex.clone();
    t.repeat.set(-1, 1);
    t.offset.set(1, 0);
    t.needsUpdate = true;
    return t;
})();

// ── steam / mist ──────────────────────────────────────────────────────────────
/** A loose column of rising puffs. `on` fades the column in/out. */
export const SteamColumn: React.FC<{
    p: [number, number, number]; on: () => boolean;
    rise?: number; size?: number; tint?: string; alpha?: number;
}> = ({ p, on, rise = 1.1, size = 0.34, tint = '#dfe8e6', alpha = 0.2 }) => {
    const g = useRef<THREE.Group>(null!);
    const power = useRef(0);
    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (!g.current) return;
        power.current = approach(power.current, on() ? 1 : 0, dt, 1.6);
        g.current.visible = power.current > 0.02;
        if (!g.current.visible) return;
        const t = clock.elapsedTime;
        g.current.children.forEach((c, i) => {
            const ph = (t * 0.22 + i * 0.27) % 1;
            c.position.set(
                Math.sin(t * 0.9 + i * 2.1) * 0.06 * (0.4 + ph),
                ph * rise,
                Math.cos(t * 0.7 + i * 1.7) * 0.05 * (0.4 + ph),
            );
            c.scale.setScalar(size * (0.5 + ph * 1.6));
            c.quaternion.copy(camera.quaternion);
            const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
            m.opacity = alpha * power.current * Math.sin(ph * Math.PI);
        });
    });
    return (
        <group ref={g} position={p} visible={false}>
            {[0, 1, 2, 3].map((i) => (
                <mesh key={i}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={puffTex} color={tint} transparent opacity={0}
                        depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

// ── the locked doors ──────────────────────────────────────────────────────────

/** Door frame (batente) around a partition gap at x=1.5, z∈[z0,z0+1.4]. */
export const DoorFrame: React.FC<{ z0: number }> = ({ z0 }) => (
    <group position={[1.5, 0, z0]}>
        <B a={[0.3, 2.24, 0.09]} p={[0, 1.12, -0.045]} m={F6M.woodDk} />
        <B a={[0.3, 2.24, 0.09]} p={[0, 1.12, 1.445]} m={F6M.woodDk} />
        <B a={[0.3, 0.1, 1.58]} p={[0, 2.25, 0.7]} m={F6M.woodDk} />
        {/* architrave lip */}
        <B a={[0.34, 0.06, 1.62]} p={[0, 2.31, 0.7]} m={F6M.woodDk} />
    </group>
);

/** Shared door slab (panelled, brass handle). Children ride the slab. */
const DoorSlab: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <>
        <B a={[0.08, 2.14, 1.36]} p={[0, 1.07, 0.7]} m={F6M.door} />
        {[-0.045, 0.045].map((x) => (
            <group key={x}>
                <B a={[0.012, 0.78, 0.94]} p={[x, 1.62, 0.7]} m={F6M.woodDk} />
                <B a={[0.012, 0.78, 0.94]} p={[x, 0.62, 0.7]} m={F6M.woodDk} />
            </group>
        ))}
        <mesh position={[-0.08, 1.02, 1.2]} rotation={[0, 0, Math.PI / 2]} material={F6M.brass}>
            <cylinderGeometry args={[0.018, 0.018, 0.07, 8]} />
        </mesh>
        <mesh position={[-0.11, 1.02, 1.2]} rotation={[Math.PI / 2, 0, 0]} material={F6M.brass}>
            <cylinderGeometry args={[0.028, 0.032, 0.12, 10]} />
        </mesh>
        {children}
    </>
);

/** Bathroom door: 4-digit padlock on a hasp. On unlock the shackle POPS,
 *  the lock drops to the carpet and the door creaks open. */
export const BathDoor: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const door = useRef<THREE.Group>(null!);
    const lock = useRef<THREE.Group>(null!);
    const shackle = useRef<THREE.Group>(null!);
    const dnd = useRef<THREE.Group>(null!);
    const fall = useRef({ y: 0, v: 0, rx: 0, done: false });
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const age = since(fx, 'unlock', now);
        if (door.current) {
            const target = f6.bathOpen && age > 0.8 ? 1.38 : 0;
            door.current.rotation.y = approach(door.current.rotation.y, target, dt, 2.6);
            // the DND sign sways with the swing
            if (dnd.current) {
                const vel = target - door.current.rotation.y;
                dnd.current.rotation.x = approach(dnd.current.rotation.x, vel * 0.5, dt, 6);
            }
        }
        if (lock.current && shackle.current) {
            if (!f6.bathOpen) {
                lock.current.visible = true;
            } else if (!fall.current.done) {
                // pop the shackle, then gravity
                shackle.current.rotation.z = approach(shackle.current.rotation.z, 0.9, dt, 14);
                if (age > 0.22) {
                    const f = fall.current;
                    f.v += 9.8 * dt;
                    f.y -= f.v * dt;
                    f.rx += dt * 5;
                    if (f.y <= -1.18) {       // carpet
                        f.y = -1.18;
                        if (f.v > 1.2) { f.v = -f.v * 0.28; playF6Thud(); }   // one soft bounce
                        else { f.v = 0; f.done = true; playF6Thud(0.4); }
                    }
                    lock.current.position.y = 1.32 + f.y;
                    lock.current.rotation.x = Math.min(f.rx, Math.PI / 2);
                }
            }
        }
    });
    return (
        <group position={[1.5, 0, -6.2]}>
            <group ref={door}>
                <DoorSlab>
                    {/* hasp staple stays on the door */}
                    <B a={[0.04, 0.08, 0.22]} p={[-0.07, 1.42, 1.2]} m={F6M.steelPlain} />
                    {/* NÃO PERTURBE on the handle */}
                    <group ref={dnd} position={[-0.11, 1.0, 1.2]}>
                        <mesh position={[0, -0.14, 0]} rotation={[0, -Math.PI / 2, 0]}>
                            <planeGeometry args={[0.14, 0.27]} />
                            <meshStandardMaterial map={dndTex} side={THREE.DoubleSide} roughness={0.9} />
                        </mesh>
                    </group>
                </DoorSlab>
            </group>
            {/* the padlock — hangs on the hasp, drops free of the door group */}
            <group ref={lock} position={[-0.07, 1.32, 1.22]}>
                <group ref={shackle} position={[0, 0.07, 0]}>
                    <mesh rotation={[0, Math.PI / 2, 0]} material={F6M.steelPlain}>
                        <torusGeometry args={[0.05, 0.014, 6, 12, Math.PI]} />
                    </mesh>
                </group>
                <B a={[0.06, 0.14, 0.12]} p={[0, -0.04, 0]} m={F6M.steel} />
                <mesh position={[0, -0.055, 0.062]} rotation={[Math.PI / 2, 0, 0]} material={F6M.dark}>
                    <cylinderGeometry args={[0.022, 0.022, 0.01, 10]} />
                </mesh>
            </group>
        </group>
    );
};

/** Kitchen door: chained shut. The key turns, the chain slides off and
 *  pools on the carpet, the door drifts open. */
export const KitchenDoor: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const door = useRef<THREE.Group>(null!);
    const chain = useRef<THREE.Group>(null!);
    const pile = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const age = since(fx, 'chain', now);
        if (door.current) {
            const target = f6.kitchenOpen && age > 1.0 ? 1.38 : 0;
            door.current.rotation.y = approach(door.current.rotation.y, target, dt, 2.4);
        }
        if (chain.current) {
            if (!f6.kitchenOpen) chain.current.visible = true;
            else if (age < 1.0) {
                // sliding off: drop + slither toward the free edge
                const k = clamp01(age / 0.85);
                chain.current.position.y = -k * k * 1.25;
                chain.current.position.z = k * 0.3;
                chain.current.rotation.x = 0.06 + k * 0.7;
            } else chain.current.visible = false;
        }
        if (pile.current) pile.current.visible = f6.kitchenOpen && age > 0.85;
    });
    return (
        <group position={[1.5, 0, 2.3]}>
            <group ref={door}>
                <DoorSlab />
            </group>
            {/* chain strung across the closed slab */}
            <group ref={chain}>
                <B a={[0.05, 0.06, 1.34]} p={[-0.07, 1.32, 0.7]} m={F6M.steel} r={[0.06, 0, 0]} />
                <B a={[0.05, 0.4, 0.06]} p={[-0.07, 1.1, 1.3]} m={F6M.steel} r={[0.15, 0, 0]} />
                <B a={[0.07, 0.16, 0.12]} p={[-0.08, 1.28, 0.66]} m={F6M.steel} />
            </group>
            {/* the fallen pile */}
            <mesh ref={pile} position={[-0.18, 0.035, 1.15]} visible={false} material={F6M.steel}>
                <cylinderGeometry args={[0.16, 0.2, 0.07, 10]} />
            </mesh>
        </group>
    );
};

// ── bathroom ──────────────────────────────────────────────────────────────────

/** Sink + mirror. The hot tap pours, the mirror fogs, the message writes
 *  itself into the steam, and the cabide hook fishes the drain. */
const SinkMirror: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const tapHandle = useRef<THREE.Group>(null!);
    const stream = useRef<THREE.Mesh>(null!);
    const film = useRef<THREE.MeshStandardMaterial>(null!);
    const hook = useRef<THREE.Group>(null!);
    const reveal = useRef(0);
    const lastDraw = useRef(-1);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const fog01 = f6.fogDone ? 1 : Math.min(1, f6.fogT / 6);
        if (tapHandle.current) {
            tapHandle.current.rotation.y = approach(tapHandle.current.rotation.y, f6.tapOn ? 1.8 : 0, dt, 6);
        }
        if (stream.current) {
            stream.current.visible = f6.tapOn;
            if (f6.tapOn) {
                stream.current.scale.x = 0.9 + Math.sin(now * 31) * 0.12;
                stream.current.scale.z = 0.9 + Math.cos(now * 27) * 0.12;
            }
        }
        if (film.current) {
            film.current.opacity = fog01 * 0.88;
            // write the message into the steam once it's fully fogged
            if (f6.fogDone && reveal.current < 1) {
                reveal.current = Math.min(1, reveal.current + dt / 2.6);
                if (now - lastDraw.current > 0.07) {
                    lastDraw.current = now;
                    mirrorFog.draw(reveal.current);
                }
            }
        }
        if (hook.current) {
            const age = since(fx, 'fish', now);
            hook.current.visible = age < 1.45;
            if (hook.current.visible) {
                // dip in, jiggle, pull out
                const ph = clamp01(age / 1.4);
                const dip = ph < 0.4 ? ph / 0.4 : ph > 0.75 ? (1 - ph) / 0.25 : 1;
                hook.current.position.y = 0.97 + 0.16 - dip * 0.22;
                hook.current.rotation.z = Math.sin(now * 18) * 0.08 * dip;
            }
        }
    });
    return (
        <group position={[3.2, 0, -9.6]}>
            {/* pedestal basin: rolled-rim bowl on a waisted column */}
            <mesh position={[0, 0.84, 0.02]} scale={[1.5, 1, 1]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.3, 0.18, 0.16, 20, 1, true]} />
            </mesh>
            <mesh position={[0, 0.92, 0.02]} scale={[1.5, 1, 1]} rotation={[-Math.PI / 2, 0, 0]}
                material={F6M.porcelain}>
                <torusGeometry args={[0.295, 0.035, 10, 20]} />
            </mesh>
            <mesh position={[0, 0.77, 0.02]} scale={[1.35, 1, 0.9]} rotation={[-Math.PI / 2, 0, 0]}
                material={F6M.porcelain}>
                <circleGeometry args={[0.22, 18]} />
            </mesh>
            <mesh position={[0, 0.42, 0]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.09, 0.13, 0.72, 14]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.13, 0.17, 0.12, 14]} />
            </mesh>
            <mesh position={[0, 0.78, 0]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.14, 0.09, 0.08, 14]} />
            </mesh>
            {/* drain dot */}
            <mesh position={[0, 0.78, 0.02]} rotation={[-Math.PI / 2, 0, 0]} material={F6M.dark}>
                <circleGeometry args={[0.035, 10]} />
            </mesh>
            {/* taps: cold + the HOT one that matters */}
            <B a={[0.06, 0.1, 0.18]} p={[-0.18, 0.94, -0.16]} m={F6M.chrome} />
            <group position={[0.18, 0.99, -0.16]}>
                <B a={[0.06, 0.1, 0.18]} p={[0, -0.05, 0]} m={F6M.chrome} />
                <group ref={tapHandle} position={[0, 0.03, 0]}>
                    <B a={[0.14, 0.025, 0.025]} p={[0, 0, 0]} m={F6M.chrome} />
                    <B a={[0.025, 0.025, 0.14]} p={[0, 0, 0]} m={F6M.chrome} />
                </group>
                {/* spout */}
                <mesh position={[0, -0.02, 0.1]} rotation={[Math.PI / 2.6, 0, 0]} material={F6M.chrome}>
                    <cylinderGeometry args={[0.018, 0.022, 0.16, 8]} />
                </mesh>
            </group>
            {/* the hot stream */}
            <mesh ref={stream} position={[0.18, 0.9, -0.04]} visible={false}>
                <cylinderGeometry args={[0.012, 0.018, 0.16, 6]} />
                <meshStandardMaterial color="#cfe2e8" transparent opacity={0.55} roughness={0.05} />
            </mesh>
            {/* the cabide hook, fishing */}
            <group ref={hook} position={[0, 1.13, 0.02]} visible={false}>
                <mesh material={F6M.steelPlain}>
                    <cylinderGeometry args={[0.006, 0.006, 0.42, 6]} />
                </mesh>
                <mesh position={[0, -0.21, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={F6M.steelPlain}>
                    <torusGeometry args={[0.02, 0.006, 5, 8, Math.PI * 1.4]} />
                </mesh>
            </group>
            {/* mirror: wood frame, real reflective glass, steam film on top */}
            <B a={[0.93, 0.83, 0.05]} p={[0, 1.75, -0.245]} m={F6M.woodDk} />
            <mesh position={[0, 1.75, -0.215]}>
                <planeGeometry args={[0.85, 0.75]} />
                <meshStandardMaterial color="#b8c2c8" metalness={1} roughness={0.06} envMapIntensity={1.6} />
            </mesh>
            <mesh position={[0, 1.75, -0.208]} renderOrder={2}>
                <planeGeometry args={[0.85, 0.75]} />
                <meshStandardMaterial ref={film} map={mirrorFog.tex} transparent opacity={0}
                    roughness={0.9} depthWrite={false} />
            </mesh>
            {/* toiletries he left lined up */}
            <mesh position={[-0.32, 0.93, -0.18]} material={F6M.glass}>
                <cylinderGeometry args={[0.025, 0.025, 0.09, 8]} />
            </mesh>
            <B a={[0.05, 0.07, 0.03]} p={[-0.4, 0.93, -0.16]} m={F6M.appliance} />
            <B a={[0.07, 0.02, 0.05]} p={[0.34, 0.91, -0.14]} m={F6M.pillow} />
            {/* steam column off the basin */}
            <SteamColumn p={[0.1, 1.0, 0]} on={() => f6.tapOn} />
        </group>
    );
};

/** Toilet — the cistern lid glides off and leans against the wall. */
const Toilet: React.FC = () => {
    const lid = useRef<THREE.Group>(null!);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (!lid.current) return;
        const off = f6.lidOff;
        lid.current.position.x = approach(lid.current.position.x, off ? 0.24 : 0, dt, 3.2);
        lid.current.position.y = approach(lid.current.position.y, off ? -0.18 : 0, dt, 2.6);
        lid.current.position.z = approach(lid.current.position.z, off ? 0.42 : 0, dt, 3.2);
        lid.current.rotation.x = approach(lid.current.rotation.x, off ? -0.5 : 0, dt, 3);
        lid.current.rotation.z = approach(lid.current.rotation.z, off ? 0.12 : 0, dt, 3);
    });
    const fuseVisible = f6.lidOff && !f6.inv.fusivel && !f6.installed.fusivel;
    return (
        <group position={[5.6, 0, -8.5]}>
            {/* oval bowl on a waisted pedestal + seat + raised lid against the tank */}
            <mesh position={[-0.16, 0.14, 0]} scale={[1, 1, 0.85]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.13, 0.17, 0.28, 16]} />
            </mesh>
            <mesh position={[-0.16, 0.38, 0]} scale={[1.15, 1, 0.9]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.2, 0.12, 0.22, 18]} />
            </mesh>
            <mesh position={[-0.16, 0.5, 0]} scale={[1.15, 1, 0.9]} rotation={[-Math.PI / 2, 0, 0]}
                material={F6M.porcelain}>
                <torusGeometry args={[0.185, 0.045, 10, 18]} />
            </mesh>
            <mesh position={[-0.16, 0.49, 0]} scale={[1.1, 1, 0.85]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.15, 16]} />
                <meshStandardMaterial color="#23282c" roughness={0.4} />
            </mesh>
            {/* seat lid leaning up against the cistern */}
            <mesh position={[0.02, 0.62, 0]} scale={[1.15, 1, 0.9]} rotation={[0, 0, Math.PI / 2 - 0.35]}
                material={F6M.porcelain}>
                <cylinderGeometry args={[0.21, 0.21, 0.025, 18]} />
            </mesh>
            {/* cistern, open at the top */}
            <RB a={[0.24, 0.66, 0.55]} p={[0.18, 0.62, 0]} m={F6M.porcelain} rad={0.03} />
            <B a={[0.02, 0.1, 0.5]} p={[0.08, 0.93, 0]} m={F6M.porcelain} />
            {/* still water inside */}
            <mesh position={[0.18, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.2, 0.5]} />
                <meshStandardMaterial color="#3e4a4e" roughness={0.1} metalness={0.3} />
            </mesh>
            {/* the fusível taped above the water line */}
            {fuseVisible && (
                <group position={[0.18, 0.98, 0.12]} rotation={[0, 0.3, 0]}>
                    <ItemMesh kind="fusivel" />
                    <B a={[0.04, 0.1, 0.02]} p={[0, 0.02, 0.04]} m={F6M.dark} />
                </group>
            )}
            {/* the lid */}
            <group ref={lid}>
                <RB a={[0.3, 0.05, 0.62]} p={[0.18, 1.0, 0]} m={F6M.porcelain} rad={0.02} />
            </group>
            {/* flush handle + paper holder */}
            <B a={[0.04, 0.03, 0.1]} p={[0.05, 0.84, 0.24]} m={F6M.chrome} />
            <group position={[0.0, 0.55, -0.42]}>
                <B a={[0.16, 0.03, 0.03]} p={[0, 0, 0]} m={F6M.chrome} />
                <mesh position={[0, 0, 0.0]} rotation={[0, 0, Math.PI / 2]} material={F6M.pillow}>
                    <cylinderGeometry args={[0.05, 0.05, 0.11, 10]} />
                </mesh>
            </group>
        </group>
    );
};

/** Curtain material: milky plastic with baked folds — module-level single. */
const showerMat = new THREE.MeshStandardMaterial({
    map: showerCurtainTex, transparent: true, opacity: 0.82, roughness: 0.42,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.5,
});

/** Tub — curtain drags aside on its squealing rings. */
const Tub: React.FC = () => {
    const curtain = useRef<THREE.Mesh>(null!);
    const rings = useRef<THREE.Group>(null!);
    // wavy plastic: real sine folds in the geometry so light breaks on it
    const curtainGeo = useMemo(() => {
        const g = new THREE.PlaneGeometry(1.9, 1.74, 32, 1);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            pos.setZ(i, Math.sin(x * 10.5) * 0.045 + Math.sin(x * 4.2 + 1.7) * 0.025);
        }
        g.computeVertexNormals();
        return g;
    }, []);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const open = f6.curtainOpen;
        if (curtain.current) {
            curtain.current.position.x = approach(curtain.current.position.x, open ? -0.72 : 0, dt, 3.4);
            curtain.current.scale.x = approach(curtain.current.scale.x, open ? 0.28 : 1, dt, 3.4);
        }
        if (rings.current) rings.current.position.x = approach(rings.current.position.x, open ? -0.7 : 0, dt, 3.4);
    });
    return (
        <group position={[3.75, 0, -3.6]}>
            {/* clawfoot tub: elliptical shell, rolled rim, shadowed bowl */}
            <mesh position={[0, 0.38, 0]} scale={[2.0, 1, 0.93]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.45, 0.36, 0.52, 28, 1, true]} />
            </mesh>
            <mesh position={[0, 0.64, 0]} scale={[2.0, 1, 0.93]} rotation={[-Math.PI / 2, 0, 0]}
                material={F6M.porcelain}>
                <torusGeometry args={[0.44, 0.05, 10, 28]} />
            </mesh>
            {/* inner wall + waterline grime ring + floor of the bowl */}
            <mesh position={[0, 0.42, 0]} scale={[1.86, 1, 0.82]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.44, 0.34, 0.44, 28, 1, true]} />
            </mesh>
            <mesh position={[0, 0.21, 0]} scale={[1.7, 1, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.36, 24]} />
                <meshStandardMaterial color="#d9d6cc" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.56, 0]} scale={[1.88, 1, 0.83]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.4, 0.44, 28]} />
                <meshStandardMaterial color="#9a917e" transparent opacity={0.4} roughness={1} />
            </mesh>
            {/* skirt under the shell so the belly doesn't float */}
            <mesh position={[0, 0.13, 0]} scale={[1.9, 1, 0.86]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.37, 0.41, 0.1, 28, 1, true]} />
            </mesh>
            {[[-0.72, -0.3], [0.72, -0.3], [-0.72, 0.3], [0.72, 0.3]].map(([x, z], i) => (
                <group key={i} position={[x, 0, z]}>
                    <mesh position={[0, 0.07, 0]} material={F6M.brassOld}>
                        <sphereGeometry args={[0.065, 10, 8]} />
                    </mesh>
                    <mesh position={[0, 0.015, 0]} material={F6M.brassOld}>
                        <cylinderGeometry args={[0.045, 0.06, 0.03, 10]} />
                    </mesh>
                </group>
            ))}
            {/* the towel bundle — "PARTE QUE SOBRA" */}
            <group position={[0.35, 0.24, 0]} rotation={[0, 0.25, 0]}>
                <B a={[0.5, 0.2, 0.35]} p={[0, 0.1, 0]} m={F6M.sheet} />
                <B a={[0.52, 0.06, 0.1]} p={[0, 0.12, 0]} m={F6M.fabricDk} />
                <B a={[0.1, 0.06, 0.37]} p={[0.08, 0.12, 0]} m={F6M.fabricDk} />
                <B a={[0.12, 0.015, 0.08]} p={[-0.14, 0.21, 0.1]} m={F6M.paper} r={[0, 0.3, 0]} />
            </group>
            {/* tub taps */}
            <B a={[0.05, 0.16, 0.05]} p={[-0.8, 0.74, -0.3]} m={F6M.chrome} />
            <B a={[0.05, 0.16, 0.05]} p={[-0.8, 0.74, 0.3]} m={F6M.chrome} />
            <mesh position={[-0.8, 0.78, 0]} rotation={[Math.PI / 2, 0, 0]} material={F6M.chrome}>
                <cylinderGeometry args={[0.025, 0.03, 0.2, 8]} />
            </mesh>
            {/* curtain rod + rings + curtain */}
            <mesh position={[0, 2.45, 0.48]} rotation={[0, 0, Math.PI / 2]} material={F6M.chrome}>
                <cylinderGeometry args={[0.018, 0.018, 2.0, 8]} />
            </mesh>
            <group ref={rings}>
                {[-0.85, -0.6, -0.35, -0.1, 0.15, 0.4, 0.65, 0.9].map((x) => (
                    <mesh key={x} position={[x, 2.43, 0.48]} rotation={[0, 0, 0.2]} material={F6M.chrome}>
                        <torusGeometry args={[0.035, 0.007, 5, 10]} />
                    </mesh>
                ))}
            </group>
            <mesh ref={curtain} position={[0, 1.55, 0.48]} material={F6M.shower}>
                <planeGeometry args={[1.9, 1.74, 8, 1]} />
            </mesh>
            {/* bath mat */}
            <mesh position={[0, 0.015, 0.85]} rotation={[-Math.PI / 2, 0, 0]} material={F6M.pillow}>
                <planeGeometry args={[1.0, 0.5]} />
            </mesh>
        </group>
    );
};

export const Bathroom: React.FC<{ fx: F6Fx }> = ({ fx }) => (
    <group>
        <SinkMirror fx={fx} />
        <Toilet />
        <Tub />
        {/* towel rack on the back wall */}
        <group position={[4.6, 1.5, -9.85]}>
            <mesh rotation={[0, 0, Math.PI / 2]} material={F6M.chrome}>
                <cylinderGeometry args={[0.015, 0.015, 0.8, 8]} />
            </mesh>
            <B a={[0.34, 0.5, 0.03]} p={[-0.18, -0.22, 0.03]} m={F6M.pillow} />
            <B a={[0.3, 0.34, 0.03]} p={[0.2, -0.14, 0.03]} m={F6M.sheet} r={[0, 0, 0.04]} />
        </group>
        {/* bloody handprint */}
        <mesh position={[5.93, 1.4, -6]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.3, 0.36]} />
            <meshStandardMaterial color="#54120d" transparent opacity={0.7} roughness={1} />
        </mesh>
    </group>
);

// ── kitchen ───────────────────────────────────────────────────────────────────

/** Counter + stove. A real blue ring of flame, the pan, the shrinking ice. */
const Stove: React.FC = () => {
    const flame = useRef<THREE.Group>(null!);
    const flameLight = useRef<THREE.PointLight>(null!);
    const ice = useRef<THREE.Group>(null!);
    const water = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const lit = f6.stoveLit;
        if (flame.current) {
            flame.current.visible = lit;
            if (lit) {
                flame.current.children.forEach((c, i) => {
                    c.scale.y = 1 + Math.sin(t * 17 + i * 1.3) * 0.25;
                });
            }
        }
        if (flameLight.current) {
            flameLight.current.intensity = lit ? 1.4 + Math.sin(t * 23) * 0.25 : 0;
        }
        const melt01 = f6.melting ? Math.min(1, f6.meltT / 9) : (f6.panRele || (!f6.inv.gelo && f6.geloTaken && !f6.melting && (f6.inv.rele || f6.installed.rele))) ? 1 : 0;
        if (ice.current) {
            const show = f6.melting;
            ice.current.visible = show;
            if (show) {
                const s = 1 - melt01 * 0.92;
                ice.current.scale.set(s, s * (1 - melt01 * 0.3), s);
                ice.current.position.y = 1.04 - melt01 * 0.025;
            }
        }
        if (water.current) {
            const w = f6.melting ? melt01 : (f6.panRele || melt01 >= 1) ? 1 : 0;
            water.current.visible = w > 0.05;
            water.current.scale.setScalar(0.3 + w * 0.7);
        }
        void dt;
    });
    return (
        <group position={[5.55, 0, 1.2]}>
            {/* cabinet + stone-look counter top with a drip edge */}
            <B a={[0.85, 0.82, 3.6]} p={[0, 0.41, 0]} m={F6M.appliance} />
            <RB a={[0.92, 0.07, 3.68]} p={[-0.01, 0.895, 0]} m={F6M.woodDk} rad={0.02} />
            <B a={[0.85, 0.1, 3.6]} p={[0, 0.05, 0]} m={F6M.applianceDk} />
            {/* backsplash */}
            <B a={[0.06, 0.3, 3.6]} p={[0.41, 1.07, 0]} m={F6M.woodDk} />
            {/* panelled doors with real gaps + brass knobs */}
            {[-1.2, -0.4, 1.2].map((z) => (
                <group key={z}>
                    <RB a={[0.035, 0.58, 0.66]} p={[-0.435, 0.45, z]} m={F6M.applianceDk} rad={0.012} />
                    <B a={[0.012, 0.42, 0.5]} p={[-0.45, 0.45, z]} m={F6M.appliance} />
                    <mesh position={[-0.465, 0.45, z + 0.24]} material={F6M.brassOld}>
                        <sphereGeometry args={[0.022, 6, 5]} />
                    </mesh>
                </group>
            ))}
            {/* the oven under the stove: window + steel handle */}
            <group position={[-0.435, 0.45, 0.4]}>
                <RB a={[0.035, 0.58, 0.66]} p={[0, 0, 0]} m={F6M.applianceDk} rad={0.012} />
                <B a={[0.014, 0.3, 0.46]} p={[-0.015, 0.02, 0]} m={F6M.dark} />
                <mesh position={[-0.03, 0.24, 0]} rotation={[Math.PI / 2, 0, 0]} material={F6M.chrome}>
                    <cylinderGeometry args={[0.014, 0.014, 0.5, 8]} />
                </mesh>
            </group>
            {/* inox sink sunk into the counter + gooseneck faucet */}
            <group position={[0, 0.93, -1.3]}>
                <B a={[0.56, 0.02, 0.5]} p={[0, 0.005, 0]} m={F6M.steelPlain} />
                <B a={[0.46, 0.16, 0.4]} p={[0, -0.08, 0]} m={F6M.steelPlain} />
                <mesh position={[0, 0.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.44, 0.38]} />
                    <meshStandardMaterial color="#43484c" metalness={0.8} roughness={0.35} />
                </mesh>
                <mesh position={[0.2, 0.1, 0]} material={F6M.chrome}>
                    <cylinderGeometry args={[0.018, 0.022, 0.2, 8]} />
                </mesh>
                <mesh position={[0.13, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={F6M.chrome}>
                    <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
                </mesh>
                <mesh position={[0.05, 0.15, 0]} material={F6M.chrome}>
                    <cylinderGeometry args={[0.013, 0.013, 0.12, 8]} />
                </mesh>
            </group>
            {/* stove recess: black top, burner ring, grate */}
            <B a={[0.72, 0.045, 0.92]} p={[0, 0.945, -0.6]} m={F6M.dark} />
            <mesh position={[0, 0.97, -0.6]} material={F6M.rubber}>
                <cylinderGeometry args={[0.16, 0.16, 0.012, 16]} />
            </mesh>
            {[0, 1, 2, 3].map((i) => (
                <B key={i} a={[0.34, 0.012, 0.025]} p={[0, 0.985, -0.6]} m={F6M.dark}
                    r={[0, (i * Math.PI) / 4, 0]} />
            ))}
            {/* the flame ring */}
            <group ref={flame} position={[0, 0.99, -0.6]} visible={false}>
                {Array.from({ length: 10 }).map((_, i) => {
                    const a = (i / 10) * Math.PI * 2;
                    return (
                        <mesh key={i} position={[Math.cos(a) * 0.1, 0.012, Math.sin(a) * 0.1]}>
                            <coneGeometry args={[0.014, 0.05, 5]} />
                            <meshStandardMaterial color="#7ab2ff" emissive="#4f8cff" emissiveIntensity={3.2}
                                transparent opacity={0.85} />
                        </mesh>
                    );
                })}
            </group>
            <pointLight ref={flameLight} position={[0, 1.15, -0.6]} color="#7aa8ff" intensity={0}
                distance={2.2} decay={2} />
            {/* the pan */}
            <mesh position={[0, 1.02, -0.6]} material={F6M.steel}>
                <cylinderGeometry args={[0.21, 0.18, 0.09, 16, 1, true]} />
            </mesh>
            <mesh position={[0, 0.985, -0.6]} rotation={[-Math.PI / 2, 0, 0]} material={F6M.steel}>
                <circleGeometry args={[0.18, 16]} />
            </mesh>
            <mesh position={[-0.3, 1.04, -0.6]} rotation={[0, 0, 0.1]} material={F6M.dark}>
                <cylinderGeometry args={[0.015, 0.02, 0.22, 6]} />
            </mesh>
            {/* melt water + the ice + the relay */}
            <mesh ref={water} position={[0, 1.0, -0.6]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <circleGeometry args={[0.165, 16]} />
                <meshStandardMaterial color="#9fc4cc" transparent opacity={0.7} roughness={0.05} />
            </mesh>
            <group ref={ice} position={[0, 1.04, -0.6]} visible={false}>
                <ItemMesh kind="gelo" />
            </group>
            {f6.panRele && (
                <group position={[0, 1.03, -0.6]} rotation={[0, 0.6, 0]} scale={0.9}>
                    <ItemMesh kind="rele" />
                </group>
            )}
            {/* steam while it melts */}
            <SteamColumn p={[0, 1.1, -0.6]} on={() => f6.melting} size={0.26} rise={0.9} />
            {/* kettle parked on the back burner + drying rack */}
            <group position={[0, 0.95, -0.05]}>
                <mesh position={[0, 0.1, 0]} material={F6M.appliance}>
                    <cylinderGeometry args={[0.11, 0.14, 0.18, 12]} />
                </mesh>
                <mesh position={[0.13, 0.13, 0]} rotation={[0, 0, -0.7]} material={F6M.appliance}>
                    <cylinderGeometry args={[0.02, 0.03, 0.12, 6]} />
                </mesh>
                <mesh position={[0, 0.22, 0]} material={F6M.brassOld}>
                    <sphereGeometry args={[0.025, 6, 5]} />
                </mesh>
            </group>
            <group position={[0, 0.94, 0.7]}>
                <B a={[0.5, 0.04, 0.36]} p={[0, 0, 0]} m={F6M.steelPlain} />
                {[-0.15, 0, 0.15].map((z) => (
                    <mesh key={z} position={[0, 0.12, z]} rotation={[0.25, 0, 0]} material={F6M.porcelain}>
                        <cylinderGeometry args={[0.09, 0.09, 0.014, 12]} />
                    </mesh>
                ))}
            </group>
            {/* microwave */}
            <group position={[0, 1.12, 1.25]}>
                <B a={[0.55, 0.35, 0.42]} p={[0, 0, 0]} m={F6M.dark} />
                <B a={[0.02, 0.28, 0.26]} p={[-0.28, 0, -0.04]} m={F6M.rubber} />
            </group>
        </group>
    );
};

/** Fridge — swings open into its own light; the ice block waits up top. */
const Fridge: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const door = useRef<THREE.Group>(null!);
    const lightPanel = useRef<THREE.MeshStandardMaterial>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        if (door.current) {
            door.current.rotation.y = approach(door.current.rotation.y, f6.fridgeOpen ? 1.75 : 0, dt, 3.4);
        }
        if (lightPanel.current) {
            const age = since(fx, 'fridge', now);
            // the bulb sputters before it commits
            const on = f6.fridgeOpen ? (age < 0.5 ? (Math.sin(now * 60) > -0.2 ? 1 : 0.1) : 1) : 0;
            lightPanel.current.emissiveIntensity = on * 1.8;
        }
    });
    return (
        <group position={[5.55, 0, -1.9]}>
            {/* body, opening toward -x — rounded like a 60s Kelvinator */}
            <RB a={[0.82, 1.85, 0.88]} p={[0.03, 0.93, 0]} m={F6M.appliance} rad={0.07} />
            {/* interior cavity */}
            <B a={[0.6, 1.6, 0.74]} p={[-0.05, 0.95, 0]} m={F6M.applianceDk} />
            {/* interior light panel */}
            <mesh position={[-0.34, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[0.5, 0.2]} />
                <meshStandardMaterial ref={lightPanel} color="#f4f2ea" emissive="#fff6da" emissiveIntensity={0} />
            </mesh>
            {/* shelves + the labelled marmitas */}
            {[0.6, 0.95, 1.28].map((y) => (
                <B key={y} a={[0.56, 0.02, 0.7]} p={[-0.06, y, 0]} m={F6M.glass} />
            ))}
            {[[0.66, -0.18], [0.66, 0.12], [1.0, -0.05], [1.0, 0.22], [1.34, 0.05]].map(([y, z], i) => (
                <group key={i} position={[-0.1, y, z]}>
                    <B a={[0.2, 0.08, 0.22]} p={[0, 0, 0]} m={F6M.pillow} />
                    <B a={[0.14, 0.012, 0.05]} p={[0, 0.045, 0.0]} m={F6M.paper} />
                </group>
            ))}
            {/* freezer shelf + the ice block */}
            <B a={[0.56, 0.02, 0.7]} p={[-0.06, 1.42, 0]} m={F6M.applianceDk} />
            {f6.fridgeOpen && !f6.geloTaken && (
                <group position={[-0.06, 1.52, 0.05]} rotation={[0, 0.4, 0]}>
                    <ItemMesh kind="gelo" />
                </group>
            )}
            {/* the door (hinge on the +z edge) */}
            <group ref={door} position={[-0.38, 0, 0.44]}>
                <RB a={[0.12, 1.85, 0.88]} p={[0.04, 0.93, -0.44]} m={F6M.appliance} rad={0.06} />
                {/* freezer seam + rubber gasket lines on the face */}
                <B a={[0.012, 0.035, 0.86]} p={[-0.012, 1.36, -0.44]} m={F6M.applianceDk} />
                <B a={[0.012, 1.78, 0.03]} p={[-0.012, 0.93, -0.86]} m={F6M.applianceDk} />
                {/* long chrome handle */}
                <B a={[0.04, 0.5, 0.05]} p={[-0.05, 1.06, -0.8]} m={F6M.chrome} />
                <B a={[0.05, 0.04, 0.04]} p={[-0.025, 1.28, -0.8]} m={F6M.chrome} />
                <B a={[0.05, 0.04, 0.04]} p={[-0.025, 0.84, -0.8]} m={F6M.chrome} />
                {/* his last note, under a magnet */}
                <B a={[0.005, 0.14, 0.11]} p={[-0.014, 1.6, -0.3]} m={F6M.paper} r={[0.06, 0, 0]} />
                <mesh position={[-0.02, 1.66, -0.3]} rotation={[0, 0, Math.PI / 2]} material={F6M.fabricDk}>
                    <cylinderGeometry args={[0.018, 0.018, 0.012, 8]} />
                </mesh>
                {/* door shelves */}
                <B a={[0.06, 0.04, 0.7]} p={[0.1, 0.7, -0.44]} m={F6M.applianceDk} />
                <B a={[0.06, 0.04, 0.7]} p={[0.1, 1.2, -0.44]} m={F6M.applianceDk} />
            </group>
            {/* kick vent */}
            <B a={[0.04, 0.1, 0.8]} p={[-0.36, 0.07, 0]} m={F6M.applianceDk} />
            {/* cold mist rolling out right after it opens */}
            <SteamColumn p={[-0.5, 1.3, 0]} on={() => f6.fridgeOpen} tint="#cfe6ee" alpha={0.12}
                rise={-0.5} size={0.3} />
        </group>
    );
};

/** Pantry — double doors open on the truth wall; the matches sit on a shelf. */
const Pantry: React.FC = () => {
    const dl = useRef<THREE.Group>(null!);
    const dr = useRef<THREE.Group>(null!);
    const bulb = useRef<THREE.MeshStandardMaterial>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const open = f6.despensaOpen;
        if (dl.current) dl.current.rotation.y = approach(dl.current.rotation.y, open ? 2.95 : 0, dt, 3.2);
        // the right door can only swing ~110° before the east wall stops it
        if (dr.current) dr.current.rotation.y = approach(dr.current.rotation.y, open ? -1.95 : 0, dt, 2.7);
        if (bulb.current) {
            bulb.current.emissiveIntensity = open
                ? 1.2 + Math.sin(clock.elapsedTime * 9.3) * 0.25
                : 0;
        }
    });
    return (
        <group position={[3.75, 0, 6.52]}>
            {/* cabinet carcass — front (room side) is local -z and OPEN */}
            <B a={[3.4, 2.3, 0.07]} p={[0, 1.15, 0.275]} m={F6M.woodBig} />
            <B a={[0.07, 2.3, 0.62]} p={[-1.665, 1.15, 0]} m={F6M.woodBig} />
            <B a={[0.07, 2.3, 0.62]} p={[1.665, 1.15, 0]} m={F6M.woodBig} />
            <B a={[3.4, 0.09, 0.62]} p={[0, 2.26, 0]} m={F6M.woodBig} />
            <B a={[3.4, 0.09, 0.66]} p={[0, 0.05, -0.02]} m={F6M.woodBig} />
            {/* cornice */}
            <B a={[3.52, 0.08, 0.7]} p={[0, 2.33, -0.02]} m={F6M.woodDk} />
            {/* shelves with his supplies — lower half only; the truth gets the top */}
            <B a={[3.2, 0.05, 0.5]} p={[0, 0.62, 0.02]} m={F6M.wood} />
            <B a={[3.2, 0.05, 0.5]} p={[0, 0.95, 0.02]} m={F6M.wood} />
            {[-1.25, -0.8, -0.3, 0.9, 1.3].map((x, i) => (
                <B key={x} a={[0.18, 0.26, 0.18]} p={[x, 0.78 + (i % 2) * 0.02, 0.02]}
                    m={i % 2 ? F6M.appliance : F6M.fabricDk} />
            ))}
            {[-1.1, -0.5, 0.3, 1.05].map((x, i) => (
                <mesh key={x} position={[x, 1.07, 0.02]} material={i % 2 ? F6M.appliance : F6M.paper}>
                    <cylinderGeometry args={[0.06, 0.06, 0.18, 8]} />
                </mesh>
            ))}
            {/* THE TRUTH — pinned to the back panel, lit by the naked bulb.
                The plane faces -z (the room); the mirrored texture clone
                un-mirrors the writing. */}
            <mesh position={[0, 1.62, 0.232]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[1.62, 1.28]} />
                <meshStandardMaterial map={truthTexBack} roughness={0.92} />
            </mesh>
            {[[-0.76, 0.6], [0.76, 0.6], [-0.76, -0.58], [0.76, -0.58]].map(([x, y], i) => (
                <B key={i} a={[0.09, 0.05, 0.004]} p={[x, 1.62 + y, 0.228]} m={F6M.paper}
                    r={[0, 0, i % 2 ? 0.3 : -0.3]} />
            ))}
            {/* the matches */}
            {f6.despensaOpen && !f6.inv.fosforos && (
                <group position={[0.75, 1.0, -0.05]} rotation={[0, -0.3, 0]}>
                    <ItemMesh kind="fosforos" />
                </group>
            )}
            {/* naked bulb inside — with a REAL light once the doors open */}
            <mesh position={[0, 2.0, 0]}>
                <sphereGeometry args={[0.045, 8, 6]} />
                <meshStandardMaterial ref={bulb} color="#fff2cf" emissive="#ffe2a8" emissiveIntensity={0} />
            </mesh>
            <mesh position={[0, 2.08, 0]} material={F6M.rubber}>
                <cylinderGeometry args={[0.012, 0.012, 0.14, 5]} />
            </mesh>
            {f6.despensaOpen && (
                <pointLight position={[0, 1.9, -0.15]} color="#ffe2a8" intensity={2.2}
                    distance={3.2} decay={2} />
            )}
            {/* the doors — hinged on the room face, swing out and fold aside */}
            {[-1, 1].map((side) => (
                <group key={side} ref={side === -1 ? dl : dr} position={[1.68 * side, 1.15, -0.31]}>
                    <B a={[1.66, 2.26, 0.05]} p={[-0.84 * side, 0, 0]} m={F6M.woodBig} />
                    <B a={[1.4, 0.9, 0.015]} p={[-0.84 * side, 0.6, -0.03]} m={F6M.woodDk} />
                    <B a={[1.4, 0.9, 0.015]} p={[-0.84 * side, -0.6, -0.03]} m={F6M.woodDk} />
                    <B a={[0.04, 0.2, 0.05]} p={[-1.56 * side, 0, -0.05]} m={F6M.brassOld} />
                </group>
            ))}
        </group>
    );
};

export const Kitchen: React.FC<{ fx: F6Fx }> = ({ fx }) => (
    <group>
        <Stove />
        <Fridge fx={fx} />
        <Pantry />
        {/* hanging utensils over the counter */}
        <group position={[5.88, 1.7, 0.2]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={F6M.steelPlain}>
                <cylinderGeometry args={[0.012, 0.012, 1.2, 6]} />
            </mesh>
            {[-0.4, -0.1, 0.2, 0.5].map((z, i) => (
                <group key={z} position={[0, -0.1, z]}>
                    <B a={[0.02, 0.16, 0.02]} p={[0, 0, 0]} m={F6M.steelPlain} />
                    <B a={[i % 2 ? 0.07 : 0.05, 0.1, 0.02]} p={[0, -0.12, 0]} m={F6M.steelPlain} />
                </group>
            ))}
        </group>
    </group>
);
