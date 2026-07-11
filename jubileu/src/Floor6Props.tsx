/**
 * Floor6Props.tsx — the furniture and props of the Suíte 612, every piece
 * ANIMATED. Components read the f6 state directly and ease toward it in
 * their own useFrame (doors swing, drawers slide, lids glide, curtains drag,
 * flames breathe), and read one-shot timestamps from the shared fx map for
 * transient beats (the mattress tug, the padlock drop, the drain fishing).
 *
 * The fx map is plain mutable data: Floor6Suite drains f6 events each frame
 * and stamps `fx.t[event] = clock.elapsedTime`; props animate off elapsed
 * time since the stamp. No React state in the hot path.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { f6 } from './f6Escape';
import { F6M, blobMat, paintingTex, nineTex, tvScreen, windowFogTex } from './Floor6Textures';

export interface F6Fx { t: Record<string, number> }

/** Time since a one-shot event fired (Infinity if never). */
export const since = (fx: F6Fx, key: string, now: number): number =>
    fx.t[key] === undefined ? Infinity : now - fx.t[key];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smooth ease-out cubic. */
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
/** Exponential approach (frame-rate independent). */
const approach = (cur: number, target: number, dt: number, speed: number) =>
    cur + (target - cur) * Math.min(1, dt * speed);

export const B: React.FC<{
    a: [number, number, number]; p: [number, number, number];
    m: THREE.Material; r?: [number, number, number];
}> = ({ a, p, m, r }) => (
    <mesh position={p} rotation={r ?? [0, 0, 0]} material={m}>
        <boxGeometry args={a} />
    </mesh>
);

/** Rounded box — soft edges are what separates furniture from cardboard.
 *  Radius is clamped so thin slabs never invert. */
export const RB: React.FC<{
    a: [number, number, number]; p: [number, number, number];
    m: THREE.Material; r?: [number, number, number]; rad?: number;
}> = ({ a, p, m, r, rad = 0.035 }) => (
    <RoundedBox args={a} radius={Math.min(rad, Math.min(a[0], a[1], a[2]) / 2.2)}
        smoothness={2} position={p} rotation={r ?? [0, 0, 0]} material={m} />
);

/** Baked contact shadow under a piece of furniture — kills the floaty look. */
export const GroundBlob: React.FC<{ x: number; z: number; w: number; d: number }> =
    ({ x, z, w, d }) => (
        <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} material={blobMat}
            scale={[w * 0.78, d * 0.78, 1]} renderOrder={1}>
            <planeGeometry args={[2, 2]} />
        </mesh>
    );

// ── where each pickup flight starts (world coords) ────────────────────────────
export const F6_ITEM_SOURCE: Record<string, [number, number, number]> = {
    abridor: [-4.9, 0.85, -9.35],
    cabide: [-3.5, 1.55, 6.45],
    manivela: [-6.65, 0.72, 1.6],
    chave: [3.2, 0.97, -9.6],
    fusivel: [5.62, 1.1, -8.5],
    gelo: [5.5, 1.5, -1.85],
    fosforos: [4.5, 1.08, 6.45],
    rele: [5.55, 1.1, 0.6],
};
/** …and where each install flight lands (inside the dead cab). */
export const F6_INSTALL_TARGET: Record<string, [number, number, number]> = {
    fusivel: [-2.88, 1.35, -12.6],
    rele: [2.88, 1.4, -11.2],
    manivela: [0, 1.25, -15.62],
};

/** Small hero mesh for an item — used in-world, in flights and in sockets. */
export const ItemMesh: React.FC<{ kind: string }> = ({ kind }) => {
    switch (kind) {
        case 'abridor': return (
            <group rotation={[0, 0, Math.PI / 2]}>
                <B a={[0.03, 0.16, 0.012]} p={[0, 0.1, 0]} m={F6M.brass} />
                <B a={[0.022, 0.05, 0.022]} p={[0, 0, 0]} m={F6M.woodDk} />
            </group>
        );
        case 'cabide': return (
            <group>
                <B a={[0.4, 0.02, 0.02]} p={[0, -0.12, 0]} m={F6M.steelPlain} />
                <B a={[0.24, 0.02, 0.02]} p={[-0.1, -0.02, 0]} m={F6M.steelPlain} r={[0, 0, 0.55]} />
                <B a={[0.24, 0.02, 0.02]} p={[0.1, -0.02, 0]} m={F6M.steelPlain} r={[0, 0, -0.55]} />
                <mesh position={[0, 0.1, 0]} material={F6M.steelPlain}>
                    <torusGeometry args={[0.045, 0.008, 6, 10, Math.PI * 1.5]} />
                </mesh>
            </group>
        );
        case 'chave': return (
            <group>
                <mesh material={F6M.brass}><torusGeometry args={[0.035, 0.012, 6, 12]} /></mesh>
                <B a={[0.02, 0.1, 0.012]} p={[0, -0.08, 0]} m={F6M.brass} />
                <B a={[0.034, 0.016, 0.012]} p={[0.014, -0.12, 0]} m={F6M.brass} />
            </group>
        );
        case 'gelo': return (
            <group>
                <mesh material={F6M.ice}><boxGeometry args={[0.26, 0.2, 0.2]} /></mesh>
                <B a={[0.1, 0.06, 0.07]} p={[0, 0, 0]} m={F6M.dark} />
            </group>
        );
        case 'fosforos': return (
            <group>
                <B a={[0.12, 0.04, 0.08]} p={[0, 0, 0]} m={F6M.fabricDk} />
                <B a={[0.124, 0.012, 0.084]} p={[0, 0.022, 0]} m={F6M.paper} />
            </group>
        );
        case 'manivela': return (
            <group>
                <mesh material={F6M.steelPlain} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.022, 0.022, 0.3, 10]} />
                </mesh>
                <mesh material={F6M.steelPlain} position={[0.15, 0.1, 0]}>
                    <cylinderGeometry args={[0.022, 0.022, 0.2, 10]} />
                </mesh>
                <mesh material={F6M.woodDk} position={[0.15, 0.22, 0]}>
                    <cylinderGeometry args={[0.032, 0.032, 0.1, 10]} />
                </mesh>
                <B a={[0.05, 0.05, 0.05]} p={[-0.15, 0, 0]} m={F6M.dark} />
            </group>
        );
        case 'fusivel': return (
            <group rotation={[0, 0, Math.PI / 2]}>
                <mesh material={F6M.porcelain}><cylinderGeometry args={[0.035, 0.035, 0.16, 10]} /></mesh>
                <mesh material={F6M.brass} position={[0, 0.085, 0]}><cylinderGeometry args={[0.037, 0.037, 0.03, 10]} /></mesh>
                <mesh material={F6M.brass} position={[0, -0.085, 0]}><cylinderGeometry args={[0.037, 0.037, 0.03, 10]} /></mesh>
            </group>
        );
        case 'rele': return (
            <group>
                <B a={[0.11, 0.13, 0.09]} p={[0, 0, 0]} m={F6M.dark} />
                <B a={[0.09, 0.02, 0.07]} p={[0, 0.075, 0]} m={F6M.glass} />
                {[-0.03, 0, 0.03].map((x) => (
                    <B key={x} a={[0.012, 0.04, 0.012]} p={[x, -0.08, 0]} m={F6M.brass} />
                ))}
            </group>
        );
    }
    return null;
};

// ── bedroom ───────────────────────────────────────────────────────────────────

export const Bed: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const flap = useRef<THREE.Group>(null!);
    const bulge = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        // the cut: flap peels open with a springy hinge
        if (flap.current) {
            const target = f6.camaCut ? -1.9 : 0;
            const cutAge = since(fx, 'cut', now);
            const k = cutAge < 1.2 ? 7 : 4;
            flap.current.rotation.x = approach(flap.current.rotation.x, target, dt, k);
        }
        // the locked tug: the whole mattress pad jolts
        if (bulge.current) {
            const tug = since(fx, 'tug', now);
            const amp = tug < 0.55 ? Math.sin(tug * 26) * 0.014 * (1 - tug / 0.55) : 0;
            bulge.current.position.y = amp;
            bulge.current.rotation.z = amp * 0.6;
        }
    });
    const manivelaVisible = f6.camaCut && !f6.inv.manivela && !f6.installed.manivela;
    return (
        <group position={[-7.0, 0, 2.5]}>
            {/* frame on turned legs + box spring + tall mattress */}
            {[[-0.85, -1.15], [0.85, -1.15], [-0.85, 1.15], [0.85, 1.15]].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.1, z]} material={F6M.woodDk}>
                    <cylinderGeometry args={[0.045, 0.06, 0.2, 8]} />
                </mesh>
            ))}
            <B a={[1.9, 0.16, 2.5]} p={[0, 0.26, 0]} m={F6M.woodDk} />
            <group ref={bulge}>
                {/* box spring + soft mattress with piping seam */}
                <RB a={[1.8, 0.14, 2.4]} p={[0, 0.4, 0]} m={F6M.pillow} rad={0.04} />
                <RB a={[1.78, 0.26, 2.38]} p={[0, 0.55, 0]} m={F6M.sheet} rad={0.07} />
                {/* blanket draped in three falls: top, fold ridge, side drop */}
                <RB a={[1.84, 0.06, 1.55]} p={[0, 0.69, -0.38]} m={F6M.fabric} r={[0.012, 0, 0.01]} rad={0.025} />
                <RB a={[1.84, 0.05, 0.34]} p={[0, 0.715, 0.34]} m={F6M.fabricDk} r={[0.1, 0, 0]} rad={0.022} />
                <RB a={[1.8, 0.05, 0.4]} p={[0, 0.69, -1.07]} m={F6M.fabric} r={[-0.5, 0, 0]} rad={0.022} />
                <RB a={[0.06, 0.4, 1.5]} p={[0.93, 0.49, -0.38]} m={F6M.fabric} rad={0.025} />
                <RB a={[0.06, 0.34, 1.4]} p={[-0.93, 0.52, -0.3]} m={F6M.fabric} r={[0, 0, -0.06]} rad={0.025} />
                {/* two pillows, slept on (squashed + askew) */}
                <RB a={[0.68, 0.18, 0.44]} p={[-0.42, 0.73, 0.92]} m={F6M.pillow} r={[0.06, 0.1, 0.02]} rad={0.07} />
                <RB a={[0.68, 0.16, 0.44]} p={[0.38, 0.72, 0.86]} m={F6M.pillow} r={[0.1, -0.24, -0.03]} rad={0.07} />
                {/* the diary on the blanket */}
                <RB a={[0.26, 0.05, 0.34]} p={[0.25, 0.73, 0.3]} m={F6M.fabricDk} r={[0, -0.3, 0]} rad={0.012} />
                {/* the mattress tear + flap (hinged at its far edge) */}
                <B a={[0.52, 0.012, 0.22]} p={[0.35, 0.652, -0.9]} m={F6M.dark} r={[0, 0.4, 0]} />
                <group position={[0.35, 0.66, -1.0]} rotation={[0, 0.4, 0]}>
                    <group ref={flap}>
                        <B a={[0.5, 0.05, 0.2]} p={[0, 0.025, 0.1]} m={F6M.sheet} />
                    </group>
                </group>
            </group>
            {manivelaVisible && (
                <group position={[0.35, 0.72, -0.9]} rotation={[0.3, 0.7, 0]}>
                    <ItemMesh kind="manivela" />
                </group>
            )}
            {/* tufted headboard between turned posts */}
            <B a={[1.94, 1.0, 0.1]} p={[0, 0.95, 1.28]} m={F6M.wood} />
            {[0.72, 1.18].map((y) => [-0.6, -0.2, 0.2, 0.6].map((x) => (
                <RB key={`${x}${y}`} a={[0.36, 0.42, 0.07]} p={[x, y, 1.22]} m={F6M.fabricDk} rad={0.05} />
            )))}
            <B a={[1.94, 0.1, 0.16]} p={[0, 1.46, 1.26]} m={F6M.woodDk} />
            {[-0.93, 0.93].map((x) => (
                <group key={x}>
                    <mesh position={[x, 0.9, 1.26]} material={F6M.woodDk}>
                        <cylinderGeometry args={[0.045, 0.055, 1.5, 10]} />
                    </mesh>
                    <mesh position={[x, 1.68, 1.26]} material={F6M.woodDk}>
                        <sphereGeometry args={[0.07, 10, 8]} />
                    </mesh>
                </group>
            ))}
            {/* slippers half under the bed */}
            <B a={[0.12, 0.05, 0.3]} p={[-0.6, 0.03, -1.35]} m={F6M.pillow} r={[0, 0.2, 0]} />
            <B a={[0.12, 0.05, 0.3]} p={[-0.4, 0.03, -1.42]} m={F6M.pillow} r={[0, -0.35, 0]} />
        </group>
    );
};

export const Nightstand: React.FC = () => (
    <group position={[-7.6, 0, 4.4]}>
        <B a={[0.72, 0.54, 0.72]} p={[0, 0.33, 0]} m={F6M.wood} />
        <RB a={[0.78, 0.05, 0.78]} p={[0, 0.625, 0]} m={F6M.woodDk} rad={0.02} />
        {[[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.04, z]} material={F6M.woodDk}>
                <sphereGeometry args={[0.05, 8, 6]} />
            </mesh>
        ))}
        <B a={[0.6, 0.14, 0.02]} p={[0, 0.45, 0.36]} m={F6M.woodDk} />
        <B a={[0.1, 0.03, 0.03]} p={[0, 0.45, 0.38]} m={F6M.brassOld} />
        {/* abajur: brass stem + warm shade with a visible bulb */}
        <mesh position={[0, 0.72, -0.12]} material={F6M.brass}><cylinderGeometry args={[0.03, 0.06, 0.22, 10]} /></mesh>
        <mesh position={[0, 0.86, -0.12]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color="#fff2cf" emissive="#ffd9a0" emissiveIntensity={2.2} />
        </mesh>
        <mesh position={[0, 0.9, -0.12]}>
            <cylinderGeometry args={[0.09, 0.17, 0.19, 12, 1, true]} />
            <meshStandardMaterial color="#e8d9b0" emissive="#ffd9a0" emissiveIntensity={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* telefone de disco */}
        <B a={[0.26, 0.1, 0.2]} p={[0.18, 0.68, 0.16]} m={F6M.dark} />
        <mesh position={[0.18, 0.71, 0.16]} rotation={[Math.PI / 2, 0, 0]} material={F6M.dark}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 14]} />
        </mesh>
        <PhoneHandset />
        {/* a water glass + the medicine bottle */}
        <mesh position={[-0.22, 0.68, 0.2]} material={F6M.glass}><cylinderGeometry args={[0.035, 0.03, 0.1, 10]} /></mesh>
        <B a={[0.05, 0.08, 0.05]} p={[-0.24, 0.67, 0.05]} m={F6M.brassOld} />
    </group>
);

/** Handset floats up off the cradle while the player examines the phone. */
const PhoneHandset: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (!g.current) return;
        const up = f6.inspecting === 'telefone';
        const t = clock.elapsedTime;
        g.current.position.y = approach(g.current.position.y, up ? 0.92 : 0.78, dt, up ? 5 : 7);
        g.current.rotation.z = approach(g.current.rotation.z, up ? 0.3 + Math.sin(t * 1.2) * 0.04 : 0, dt, 5);
    });
    return (
        <group ref={g} position={[0.18, 0.78, 0.16]}>
            <B a={[0.22, 0.05, 0.07]} p={[0, 0, 0]} m={F6M.dark} />
            <B a={[0.05, 0.05, 0.07]} p={[-0.09, -0.025, 0]} m={F6M.dark} />
            <B a={[0.05, 0.05, 0.07]} p={[0.09, -0.025, 0]} m={F6M.dark} />
        </group>
    );
};

export const Wardrobe: React.FC<{ fx: F6Fx }> = ({ fx }) => {
    const dl = useRef<THREE.Group>(null!);
    const dr = useRef<THREE.Group>(null!);
    const hangers = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        const open = f6.wardrobeOpen;
        const age = since(fx, 'wardrobe', now);
        if (dl.current) dl.current.rotation.y = approach(dl.current.rotation.y, open ? 1.9 : 0, dt, 4.5);
        if (dr.current) dr.current.rotation.y = approach(dr.current.rotation.y, open ? (age > 0.18 ? -1.55 : 0) : 0, dt, 3.6);
        if (hangers.current && open && age < 4) {
            hangers.current.rotation.x = Math.sin(now * 5.2) * 0.05 * Math.max(0, 1 - age / 4);
        }
    });
    return (
        <group position={[-3.5, 0, 6.5]} rotation={[0, Math.PI, 0]}>
            {/* carcaça OCA (laterais + topo + assoalho) — o antigo bloco maciço
                tapava o interior: portas abriam para uma parede de madeira */}
            <B a={[0.07, 2.2, 0.85]} p={[-0.815, 1.1, 0]} m={F6M.woodBig} />
            <B a={[0.07, 2.2, 0.85]} p={[0.815, 1.1, 0]} m={F6M.woodBig} />
            <B a={[1.7, 0.07, 0.85]} p={[0, 2.165, 0]} m={F6M.woodBig} />
            <B a={[1.56, 0.09, 0.78]} p={[0, 0.145, 0]} m={F6M.wood} />
            <B a={[1.76, 0.08, 0.9]} p={[0, 2.24, 0]} m={F6M.woodDk} />
            <B a={[1.76, 0.1, 0.9]} p={[0, 0.05, 0]} m={F6M.woodDk} />
            {/* interior back + teto interno escuro + rail */}
            <B a={[1.58, 1.9, 0.06]} p={[0, 1.12, -0.36]} m={F6M.dark} />
            <B a={[1.56, 0.03, 0.76]} p={[0, 2.115, 0]} m={F6M.dark} />
            <mesh position={[0, 1.78, -0.05]} rotation={[0, 0, Math.PI / 2]} material={F6M.brassOld}>
                <cylinderGeometry args={[0.015, 0.015, 1.5, 8]} />
            </mesh>
            {/* hangers + the organized man's clothes */}
            <group ref={hangers} position={[0, 1.78, -0.05]}>
                {[-0.55, -0.33, -0.11, 0.33].map((x, i) => (
                    <group key={x} position={[x, -0.16, 0]}>
                        <ItemMesh kind="cabide" />
                        {i < 3 && <B a={[0.36, 0.6, 0.06]} p={[0, -0.42, 0]} m={i === 2 ? F6M.dark : F6M.sheet} />}
                    </group>
                ))}
                {/* the spare wire hangers — one disappears when taken */}
                {!f6.cabideTaken && (
                    <group position={[0.55, -0.16, 0]}><ItemMesh kind="cabide" /></group>
                )}
            </group>
            {/* doors hinged at the outer edges */}
            <group ref={dl} position={[-0.84, 1.05, 0.43]}>
                <B a={[0.84, 1.9, 0.04]} p={[0.42, 0, 0]} m={F6M.woodDk} />
                <B a={[0.62, 0.74, 0.015]} p={[0.42, 0.5, 0.025]} m={F6M.wood} />
                <B a={[0.62, 0.74, 0.015]} p={[0.42, -0.52, 0.025]} m={F6M.wood} />
                <B a={[0.05, 0.18, 0.05]} p={[0.76, 0.05, 0.04]} m={F6M.brassOld} />
            </group>
            <group ref={dr} position={[0.84, 1.05, 0.43]}>
                <B a={[0.84, 1.9, 0.04]} p={[-0.42, 0, 0]} m={F6M.woodDk} />
                <B a={[0.62, 0.74, 0.015]} p={[-0.42, 0.5, 0.025]} m={F6M.wood} />
                <B a={[0.62, 0.74, 0.015]} p={[-0.42, -0.52, 0.025]} m={F6M.wood} />
                <B a={[0.05, 0.18, 0.05]} p={[-0.76, 0.05, 0.04]} m={F6M.brassOld} />
            </group>
            {[[-0.7, -0.32], [0.7, -0.32], [-0.7, 0.32], [0.7, 0.32]].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.05, z]} material={F6M.woodDk}>
                    <sphereGeometry args={[0.06, 8, 6]} />
                </mesh>
            ))}
        </group>
    );
};

export const Desk: React.FC = () => {
    const drawer = useRef<THREE.Group>(null!);
    const carriage = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const now = clock.elapsedTime;
        if (drawer.current) {
            drawer.current.position.z = approach(drawer.current.position.z, f6.drawerOpen ? 0.34 : 0, dt, 5);
        }
        // typewriter carriage nudges while the player reads the page
        if (carriage.current) {
            const insp = f6.inspecting === 'maquina';
            carriage.current.position.x = approach(
                carriage.current.position.x, insp ? Math.sin(now * 2.1) * 0.03 : 0, dt, 4);
        }
    });
    return (
        <group position={[-5.5, 0, -9.5]}>
            <RB a={[1.7, 0.07, 0.85]} p={[0, 0.78, 0]} m={F6M.wood} rad={0.02} />
            <B a={[1.6, 0.1, 0.75]} p={[0, 0.7, 0]} m={F6M.woodDk} />
            {[-0.75, 0.75].map((x) => [-0.32, 0.32].map((z) => (
                <group key={`${x}${z}`}>
                    <mesh position={[x, 0.38, z]} material={F6M.woodDk}>
                        <cylinderGeometry args={[0.032, 0.045, 0.66, 10]} />
                    </mesh>
                    <mesh position={[x, 0.6, z]} material={F6M.woodDk}>
                        <sphereGeometry args={[0.05, 8, 6]} />
                    </mesh>
                </group>
            )))}
            <B a={[1.55, 0.04, 0.06]} p={[0, 0.16, 0.32]} m={F6M.woodDk} />
            <B a={[1.55, 0.04, 0.06]} p={[0, 0.16, -0.32]} m={F6M.woodDk} />
            {/* typewriter + the half page */}
            <group position={[-0.3, 0, 0]}>
                <B a={[0.5, 0.18, 0.4]} p={[0, 0.91, 0]} m={F6M.dark} />
                <B a={[0.44, 0.05, 0.3]} p={[0, 0.99, 0.03]} m={F6M.rubber} />
                {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
                    <mesh key={`${r}${c}`} position={[-0.16 + c * 0.064, 1.0 + r * 0.012, 0.14 - r * 0.05]} material={F6M.porcelain}>
                        <cylinderGeometry args={[0.014, 0.014, 0.012, 6]} />
                    </mesh>
                )))}
                <group ref={carriage}>
                    <B a={[0.46, 0.06, 0.1]} p={[0, 1.06, -0.1]} m={F6M.steelPlain} />
                    <mesh position={[0, 1.18, -0.15]} rotation={[-0.5, 0, 0.02]}>
                        <planeGeometry args={[0.3, 0.3]} />
                        <meshStandardMaterial color="#e3dcc8" roughness={0.9} side={THREE.DoubleSide} />
                    </mesh>
                </group>
            </group>
            {/* the drawer (right side) — abridor inside until taken */}
            <group position={[0.55, 0.62, 0]}>
                <group ref={drawer}>
                    <B a={[0.56, 0.12, 0.64]} p={[0, 0, 0]} m={F6M.wood} />
                    <B a={[0.5, 0.1, 0.58]} p={[0, 0.025, 0]} m={F6M.dark} />
                    <B a={[0.1, 0.03, 0.03]} p={[0, -0.01, 0.33]} m={F6M.brassOld} />
                    {/* paper + ink bottle inside */}
                    <B a={[0.3, 0.015, 0.4]} p={[-0.06, 0.04, 0]} m={F6M.paper} r={[0, 0.08, 0]} />
                    <mesh position={[0.16, 0.07, -0.12]} material={F6M.dark}>
                        <cylinderGeometry args={[0.03, 0.035, 0.06, 8]} />
                    </mesh>
                </group>
            </group>
            {/* chair, pushed back in a hurry */}
            <group position={[0.1, 0, 0.78]} rotation={[0, -0.35, 0]}>
                <B a={[0.5, 0.06, 0.5]} p={[0, 0.48, 0]} m={F6M.wood} />
                {[-0.2, 0.2].map((x) => [-0.2, 0.2].map((z) => (
                    <mesh key={`${x}${z}`} position={[x, 0.24, z]} material={F6M.woodDk}>
                        <cylinderGeometry args={[0.025, 0.03, 0.48, 8]} />
                    </mesh>
                )))}
                <B a={[0.5, 0.55, 0.05]} p={[0, 0.85, 0.23]} m={F6M.wood} />
                <B a={[0.5, 0.07, 0.06]} p={[0, 1.1, 0.23]} m={F6M.woodDk} />
            </group>
        </group>
    );
};

/** The abridor sitting in the open drawer (until picked up). */
export const DrawerAbridor: React.FC = () => {
    if (!f6.drawerOpen || f6.inv.abridor || f6.camaCut) return null;
    return (
        <group position={[-4.95, 0.74, -9.16]} rotation={[0, 0.5, 0]} scale={1.1}>
            <ItemMesh kind="abridor" />
        </group>
    );
};

export const TvSet: React.FC = () => {
    const screen = useRef<THREE.MeshStandardMaterial>(null!);
    const knob = useRef<THREE.Group>(null!);
    const accum = useRef(0);
    const powerT = useRef(0);
    const scr = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (f6.tvOn) {
            powerT.current = Math.min(1, powerT.current + dt * 3.2);
            accum.current += dt;
            if (accum.current > 1 / 12) {
                accum.current = 0;
                tvScreen.draw(f6.tvChannel, clock.elapsedTime);
            }
        } else powerT.current = Math.max(0, powerT.current - dt * 6);
        // CRT power-on: a line that swells vertically
        if (scr.current) {
            const p = powerT.current;
            scr.current.scale.y = Math.max(0.02, easeOut(p));
            scr.current.visible = p > 0.01;
        }
        if (screen.current) screen.current.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 47) * 0.08;
        if (knob.current) {
            knob.current.rotation.z = approach(knob.current.rotation.z, -f6.tvChannel * (Math.PI / 5), dt, 9);
        }
    });
    return (
        <group position={[1.15, 0, 1.2]} rotation={[0, -Math.PI / 2, 0]}>
            <RB a={[1.35, 0.5, 0.62]} p={[0, 0.25, 0]} m={F6M.wood} rad={0.025} />
            <B a={[1.35, 0.04, 0.62]} p={[0, 0.49, 0]} m={F6M.woodDk} />
            {/* CRT body, wood-grain era */}
            <RB a={[0.82, 0.62, 0.6]} p={[0, 0.83, 0]} m={F6M.wood} rad={0.05} />
            <RB a={[0.74, 0.54, 0.05]} p={[0, 0.83, 0.295]} m={F6M.dark} rad={0.04} />
            {/* feet */}
            {[-0.3, 0.3].map((x) => (
                <mesh key={x} position={[x, 0.51, 0.2]} material={F6M.dark}>
                    <cylinderGeometry args={[0.02, 0.03, 0.05, 8]} />
                </mesh>
            ))}
            {/* the tube — slightly curved feel via inset frame */}
            <mesh ref={scr} position={[0, 0.84, 0.325]}>
                <planeGeometry args={[0.56, 0.42]} />
                <meshStandardMaterial ref={screen} map={tvScreen.tex} emissive="#bcc8cc"
                    emissiveMap={tvScreen.tex} emissiveIntensity={0.9} roughness={0.2} />
            </mesh>
            {/* dead glass when off */}
            <mesh position={[0, 0.84, 0.322]}>
                <planeGeometry args={[0.56, 0.42]} />
                <meshStandardMaterial color="#0c1012" metalness={0.5} roughness={0.08} envMapIntensity={1.2} />
            </mesh>
            {/* channel knob + volume knob */}
            <group ref={knob} position={[0.33, 0.95, 0.315]}>
                <mesh rotation={[Math.PI / 2, 0, 0]} material={F6M.appliance}>
                    <cylinderGeometry args={[0.045, 0.05, 0.03, 12]} />
                </mesh>
                <B a={[0.012, 0.06, 0.032]} p={[0, 0, 0.002]} m={F6M.dark} />
            </group>
            <mesh position={[0.33, 0.72, 0.315]} rotation={[Math.PI / 2, 0, 0]} material={F6M.appliance}>
                <cylinderGeometry args={[0.035, 0.04, 0.03, 12]} />
            </mesh>
            {/* rabbit ears, one bent */}
            <mesh position={[-0.2, 1.2, -0.1]} rotation={[0, 0, 0.5]} material={F6M.chrome}>
                <cylinderGeometry args={[0.005, 0.005, 0.5, 6]} />
            </mesh>
            <mesh position={[0.1, 1.22, -0.1]} rotation={[0.3, 0, -0.9]} material={F6M.chrome}>
                <cylinderGeometry args={[0.005, 0.005, 0.42, 6]} />
            </mesh>
        </group>
    );
};

export const CrookedPainting: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        if (!g.current) return;
        // swings further aside (and stays) once examined
        const target = f6.quadroMoved ? -0.62 : -0.09;
        g.current.rotation.z = approach(g.current.rotation.z, target, dt, 3.2);
    });
    return (
        <group position={[-2.5, 1.75, -9.86]}>
            {/* the « 9 » scratched into the plaster behind it */}
            <mesh position={[0.1, -0.05, -0.02]}>
                <planeGeometry args={[0.5, 0.5]} />
                <meshStandardMaterial map={nineTex} transparent roughness={1} />
            </mesh>
            {/* nail + wire */}
            <mesh position={[0, 0.42, -0.01]} material={F6M.brassOld}>
                <cylinderGeometry args={[0.012, 0.012, 0.05, 6]} />
            </mesh>
            <group ref={g} position={[0, 0.4, 0]} rotation={[0, 0, -0.09]}>
                <group position={[0, -0.4, 0]}>
                    <mesh>
                        <boxGeometry args={[1.1, 0.8, 0.05]} />
                        <meshStandardMaterial map={paintingTex} roughness={0.45} envMapIntensity={0.5} />
                    </mesh>
                    {/* ornate frame */}
                    <B a={[1.18, 0.07, 0.07]} p={[0, 0.42, 0]} m={F6M.brassOld} />
                    <B a={[1.18, 0.07, 0.07]} p={[0, -0.42, 0]} m={F6M.brassOld} />
                    <B a={[0.07, 0.9, 0.07]} p={[-0.575, 0, 0]} m={F6M.brassOld} />
                    <B a={[0.07, 0.9, 0.07]} p={[0.575, 0, 0]} m={F6M.brassOld} />
                </group>
            </group>
        </group>
    );
};

export const Window612: React.FC = () => {
    const curtainL = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        // the dust-heavy curtain barely breathes while inspected — wrong, it
        // NEVER moves. The horror is stillness; only the player's light shifts.
        if (curtainL.current) curtainL.current.rotation.z = 0.015;
        void clock;
    });
    return (
        <group position={[-7.88, 1.65, -2.0]} rotation={[0, Math.PI / 2, 0]}>
            {/* recessed jamb */}
            <B a={[1.9, 1.7, 0.08]} p={[0, 0, -0.08]} m={F6M.woodDk} />
            <B a={[1.7, 0.08, 0.26]} p={[0, 0.78, 0]} m={F6M.woodDk} />
            <B a={[0.08, 1.6, 0.26]} p={[-0.82, 0, 0]} m={F6M.woodDk} />
            <B a={[0.08, 1.6, 0.26]} p={[0.82, 0, 0]} m={F6M.woodDk} />
            {/* the dead fog outside — frozen mist photograph; faint cold
                emissive so it reads as exterior light, not a grey board */}
            <mesh position={[0, 0, -0.045]}>
                <planeGeometry args={[1.56, 1.5]} />
                <meshStandardMaterial map={windowFogTex} roughness={0.95}
                    emissive="#9fb4be" emissiveMap={windowFogTex} emissiveIntensity={0.55} />
            </mesh>
            {/* glass with subtle reflections + faint vignette */}
            <mesh position={[0, 0, 0.02]}>
                <planeGeometry args={[1.5, 1.4]} />
                <meshStandardMaterial color="#8db0c8" metalness={0.15} roughness={0.08} transparent opacity={0.25} envMapIntensity={0.6} />
            </mesh>
            {/* sash bars */}
            <B a={[0.05, 1.45, 0.05]} p={[0, 0, 0.04]} m={F6M.woodDk} />
            <B a={[1.55, 0.05, 0.05]} p={[0, 0, 0.04]} m={F6M.woodDk} />
            {/* sill with dust line */}
            <B a={[1.95, 0.07, 0.3]} p={[0, -0.78, 0.1]} m={F6M.wood} />
            {/* curtains with body, gathered at the sides */}
            <mesh ref={curtainL} position={[-0.72, 0.05, 0.16]} material={F6M.curtain}>
                <boxGeometry args={[0.42, 1.66, 0.09]} />
            </mesh>
            <B a={[0.3, 1.66, 0.09]} p={[0.78, 0.05, 0.16]} m={F6M.curtain} r={[0, 0, -0.012]} />
            <mesh position={[0, 0.92, 0.16]} rotation={[0, 0, Math.PI / 2]} material={F6M.brassOld}>
                <cylinderGeometry args={[0.015, 0.015, 1.95, 8]} />
            </mesh>
            {[-0.9, -0.55, 0.62, 0.92].map((x) => (
                <mesh key={x} position={[x, 0.9, 0.16]} material={F6M.brassOld}>
                    <torusGeometry args={[0.03, 0.008, 6, 10]} />
                </mesh>
            ))}
        </group>
    );
};

/** The guest's suitcase, open on a folding luggage rack. */
export const Suitcase: React.FC = () => (
    <group position={[-2.0, 0, 5.9]}>
        {/* rack: crossed legs + straps */}
        {[-0.3, 0.3].map((x) => (
            <group key={x}>
                <B a={[0.03, 0.55, 0.03]} p={[x, 0.26, -0.14]} m={F6M.woodDk} r={[0.5, 0, 0]} />
                <B a={[0.03, 0.55, 0.03]} p={[x, 0.26, 0.14]} m={F6M.woodDk} r={[-0.5, 0, 0]} />
            </group>
        ))}
        <B a={[0.75, 0.025, 0.42]} p={[0, 0.49, 0]} m={F6M.fabricDk} />
        {/* case bottom + raised lid */}
        <B a={[0.85, 0.16, 0.5]} p={[0, 0.58, 0]} m={F6M.door} />
        <group position={[0, 0.66, -0.25]} rotation={[1.2, 0, 0]}>
            <B a={[0.85, 0.14, 0.5]} p={[0, 0.07, -0.25]} m={F6M.door} />
        </group>
        {/* folded shirts + the state map */}
        <B a={[0.34, 0.07, 0.36]} p={[-0.18, 0.69, 0]} m={F6M.sheet} />
        <B a={[0.3, 0.05, 0.34]} p={[0.18, 0.68, 0.02]} m={F6M.pillow} r={[0, 0.1, 0]} />
        <B a={[0.2, 0.012, 0.28]} p={[0.16, 0.71, 0.03]} m={F6M.paper} r={[0, -0.2, 0]} />
        {/* leather straps + brass latches */}
        <B a={[0.04, 0.17, 0.51]} p={[-0.25, 0.58, 0]} m={F6M.fabricDk} />
        <B a={[0.04, 0.17, 0.51]} p={[0.25, 0.58, 0]} m={F6M.fabricDk} />
        <B a={[0.06, 0.04, 0.03]} p={[-0.25, 0.62, 0.26]} m={F6M.brassOld} />
        <B a={[0.06, 0.04, 0.03]} p={[0.25, 0.62, 0.26]} m={F6M.brassOld} />
    </group>
);

/** Sitting area: a worn wingback armchair facing the TV, ottoman, side
 *  table with his cold coffee, and a fringed floor lamp. Fills the middle
 *  of the room so the suite stops feeling like an empty warehouse. */
export const SittingArea: React.FC = () => (
    <group>
        {/* armchair at (-4.6, 1.6), facing the TV (+x) */}
        <group position={[-4.6, 0, 1.6]} rotation={[0, -Math.PI / 2 + 0.18, 0]}>
            {/* seat base + soft cushion */}
            <RB a={[0.8, 0.3, 0.75]} p={[0, 0.3, 0]} m={F6M.leatherDk} rad={0.05} />
            <RB a={[0.72, 0.17, 0.66]} p={[0, 0.52, 0.02]} m={F6M.leather} r={[0.03, 0, 0]} rad={0.07} />
            {/* backrest with a lumbar pillow, leaning */}
            <RB a={[0.8, 0.85, 0.24]} p={[0, 0.82, -0.42]} m={F6M.leather} r={[-0.13, 0, 0]} rad={0.08} />
            <RB a={[0.66, 0.32, 0.16]} p={[0, 0.66, -0.3]} m={F6M.leatherDk} r={[-0.13, 0, 0]} rad={0.07} />
            {/* wings + arm rolls */}
            {[-0.44, 0.44].map((x) => (
                <group key={x}>
                    <RB a={[0.15, 0.48, 0.7]} p={[x, 0.5, -0.03]} m={F6M.leather} rad={0.05} />
                    <mesh position={[x, 0.76, -0.03]} rotation={[Math.PI / 2, 0, 0]} material={F6M.leatherDk}>
                        <cylinderGeometry args={[0.085, 0.085, 0.72, 12]} />
                    </mesh>
                    <mesh position={[x, 0.76, 0.33]} material={F6M.leatherDk}>
                        <sphereGeometry args={[0.085, 12, 8]} />
                    </mesh>
                    <RB a={[0.13, 0.5, 0.2]} p={[x, 1.0, -0.44]} m={F6M.leather} r={[-0.1, 0, 0]} rad={0.06} />
                </group>
            ))}
            {/* turned wood feet */}
            {[[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.3], [0.34, 0.3]].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.08, z]} material={F6M.woodDk}>
                    <cylinderGeometry args={[0.035, 0.05, 0.16, 8]} />
                </mesh>
            ))}
            {/* the worn throw over one arm */}
            <B a={[0.2, 0.04, 0.5]} p={[-0.44, 0.81, 0]} m={F6M.sheet} r={[0, 0.1, 0.06]} />
        </group>
        {/* ottoman between chair and TV */}
        <group position={[-3.5, 0, 1.45]} rotation={[0, 0.3, 0]}>
            <RB a={[0.55, 0.18, 0.45]} p={[0, 0.26, 0]} m={F6M.leather} rad={0.05} />
            <RB a={[0.5, 0.12, 0.4]} p={[0, 0.41, 0]} m={F6M.leatherDk} rad={0.055} />
            {[[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.09, z]} material={F6M.woodDk}>
                    <cylinderGeometry args={[0.03, 0.04, 0.18, 8]} />
                </mesh>
            ))}
        </group>
        {/* side table with the cold coffee + ashtray */}
        <group position={[-4.6, 0, 2.85]}>
            <mesh position={[0, 0.52, 0]} material={F6M.wood}>
                <cylinderGeometry args={[0.26, 0.26, 0.04, 14]} />
            </mesh>
            <mesh position={[0, 0.26, 0]} material={F6M.woodDk}>
                <cylinderGeometry args={[0.04, 0.05, 0.5, 8]} />
            </mesh>
            <mesh position={[0, 0.03, 0]} material={F6M.woodDk}>
                <cylinderGeometry args={[0.18, 0.2, 0.05, 10]} />
            </mesh>
            <mesh position={[0.08, 0.58, 0.04]} material={F6M.porcelain}>
                <cylinderGeometry args={[0.045, 0.035, 0.08, 10]} />
            </mesh>
            <B a={[0.05, 0.012, 0.014]} p={[0.14, 0.58, 0.04]} m={F6M.porcelain} />
            <mesh position={[-0.09, 0.555, -0.05]} material={F6M.glass}>
                <cylinderGeometry args={[0.05, 0.06, 0.025, 10]} />
            </mesh>
        </group>
        {/* floor lamp behind the chair — its shade glows with the room */}
        <group position={[-5.5, 0, 0.7]}>
            <mesh position={[0, 0.04, 0]} material={F6M.brassOld}>
                <cylinderGeometry args={[0.16, 0.18, 0.05, 12]} />
            </mesh>
            <mesh position={[0, 0.8, 0]} material={F6M.brassOld}>
                <cylinderGeometry args={[0.018, 0.022, 1.5, 8]} />
            </mesh>
            <mesh position={[0, 1.6, 0]}>
                <cylinderGeometry args={[0.11, 0.16, 0.24, 12, 1, true]} />
                <meshStandardMaterial color="#cdb288" emissive="#ffd9a0" emissiveIntensity={0.5}
                    side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 1.58, 0]}>
                <sphereGeometry args={[0.04, 8, 6]} />
                <meshStandardMaterial color="#fff2cf" emissive="#ffd9a0" emissiveIntensity={2} />
            </mesh>
        </group>
    </group>
);

/** Wall sconce — emissive shade only (no extra pointLight). */
export const Sconce: React.FC<{ p: [number, number, number]; ry?: number }> = ({ p, ry = 0 }) => (
    <group position={p} rotation={[0, ry, 0]}>
        {/* wall bracket support */}
        <B a={[0.14, 0.08, 0.12]} p={[0, 0.02, 0]} m={F6M.brassOld} />
        <B a={[0.08, 0.24, 0.06]} p={[0, 0.08, 0.03]} m={F6M.brassOld} />
        {/* top rim + glow bowl */}
        <B a={[0.1, 0.22, 0.04]} p={[0, 0, 0]} m={F6M.brassOld} />
        <mesh position={[0, 0.1, 0.07]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.05, 0.14, 10, 1, true]} />
            <meshStandardMaterial color="#e8d9b0" emissive="#ffd9a0" emissiveIntensity={1.1} side={THREE.DoubleSide} />
        </mesh>
    </group>
);

/** Smoke detector with the slow red blink — ceilings need life too. */
export const SmokeDetector: React.FC<{ x: number; z: number }> = ({ x, z }) => {
    const led = useRef<THREE.MeshStandardMaterial>(null!);
    useFrame(({ clock }) => {
        if (led.current) {
            const ph = clock.elapsedTime % 3.4;
            led.current.emissiveIntensity = ph < 0.09 ? 3 : 0.02;
        }
    });
    return (
        <group position={[x, 2.985, z]}>
            <mesh material={F6M.appliance}><cylinderGeometry args={[0.09, 0.11, 0.04, 12]} /></mesh>
            <mesh position={[0.05, -0.022, 0]}>
                <sphereGeometry args={[0.012, 6, 5]} />
                <meshStandardMaterial ref={led} color="#3a0a08" emissive="#ff2418" emissiveIntensity={0.02} />
            </mesh>
        </group>
    );
};
