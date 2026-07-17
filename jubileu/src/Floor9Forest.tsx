/**
 * Floor9Forest.tsx — O VIVEIRO em 3D: a floresta do esquecimento.
 *
 * Névoa verde-profunda, raios de deus pela copa, musgo-brilho que é a base da
 * cadeia alimentar, o fio vermelho costurado de galho em galho até a RAIZ, e
 * os bichos do f9Eco encarnados em corpos procedurais low-poly: saltitos que
 * pulam, cervos-lanterna com galhada acesa, vultos rente ao chão e o GUARDIÃO
 * de seis metros que não olha pra você. Quando a onda de apagamento passa, o
 * mundo branqueia e a floresta prende a respiração.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colorTex, rng } from './Floor6Textures';
import { f9, f9Tick, f9DrainEvents, F9_OCOS, F9_FIO, F9_RAIZ } from './f9Floresta';
import { f9eco, f9EcoTick, f9EcoDrainEvents, f9CycleFrac, F9_AVISO_AT, type F9Agent, type F9Species } from './f9Eco';

// ── texturas ─────────────────────────────────────────────────────────────────
const barkTex = colorTex(128, 256, (ctx) => {
    const r = rng(901);
    ctx.fillStyle = '#241d16'; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 26; i++) {
        const x = r() * 128;
        ctx.strokeStyle = `rgba(${10 + r() * 20},${8 + r() * 16},${6 + r() * 10},0.7)`;
        ctx.lineWidth = 1 + r() * 2.5;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (r() - 0.5) * 16, 90, x + (r() - 0.5) * 16, 170, x + (r() - 0.5) * 8, 256);
        ctx.stroke();
    }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(90,110,70,${0.04 + r() * 0.08})`; ctx.fillRect(r() * 128, r() * 256, 2 + r() * 5, 1 + r() * 3); }
});
const groundTex = colorTex(256, 256, (ctx) => {
    const r = rng(902);
    ctx.fillStyle = '#101a10'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
        const v = r();
        ctx.fillStyle = v < 0.6 ? `rgba(${16 + r() * 18},${28 + r() * 26},${14 + r() * 14},0.5)` : `rgba(${40 + r() * 26},${34 + r() * 20},${20 + r() * 12},0.35)`;
        ctx.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 3);
    }
    // raízes serpenteando
    for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = 'rgba(30,22,14,0.55)'; ctx.lineWidth = 2 + r() * 3;
        let x = r() * 256, y = r() * 256;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; ctx.lineTo(x, y); }
        ctx.stroke();
    }
}, 6, 6);

const M9 = {
    ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: '#c8d0a2' }),
    bark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, color: '#8a7a62' }),
    canopy: new THREE.MeshStandardMaterial({ color: '#254a26', roughness: 1, flatShading: true }),
    canopyHi: new THREE.MeshStandardMaterial({ color: '#3a7838', roughness: 1, flatShading: true, emissive: '#14401a', emissiveIntensity: 0.4 }),
    moss: new THREE.MeshStandardMaterial({ color: '#3a5a34', roughness: 1, emissive: '#6adf8a', emissiveIntensity: 0.4 }),
    thread: new THREE.MeshStandardMaterial({ color: '#b3232a', roughness: 0.6, emissive: '#8a1218', emissiveIntensity: 0.55 }),
    fur: new THREE.MeshStandardMaterial({ color: '#c9b28a', roughness: 0.95 }),
    furDark: new THREE.MeshStandardMaterial({ color: '#6a5a44', roughness: 0.95 }),
    cervo: new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.9 }),
    antler: new THREE.MeshStandardMaterial({ color: '#e8d9a0', roughness: 0.5, emissive: '#ffdf8a', emissiveIntensity: 0.9 }),
    vulto: new THREE.MeshStandardMaterial({ color: '#141018', roughness: 1 }),
    eye: new THREE.MeshBasicMaterial({ color: '#ffd76a' }),
    eyeRed: new THREE.MeshBasicMaterial({ color: '#ff5a4a' }),
    guardian: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1, color: '#5a6a4a' }),
    ocoGlow: new THREE.MeshBasicMaterial({ color: '#ffca7a' }),
};

const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);

// ── a floresta estática ──────────────────────────────────────────────────────
/** Árvores instanciadas: troncos + 2 blobs de copa cada. */
const Trees: React.FC = () => {
    const { trunks, blobsLo, blobsHi } = useMemo(() => {
        const r = rng(910);
        const spots: Array<[number, number, number]> = [];   // x, z, escala
        for (let i = 0; i < 90; i++) {
            const x = (r() * 2 - 1) * 33, z = -52 + r() * 57;
            // clareira de pouso + trilha do fio mais rala
            if (Math.hypot(x - 0, z + 2) < 5.5) continue;
            let nearFio = false;
            for (const [fx, fz] of F9_FIO) if (Math.hypot(x - fx, z - fz) < 2.6) { nearFio = true; break; }
            if (nearFio && r() < 0.7) continue;
            spots.push([x, z, 0.7 + r() * 1.5]);
        }
        const n = spots.length;
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 7, 7), M9.bark, n);
        const blobsLo = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), M9.canopy, n);
        const blobsHi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.1, 0), M9.canopyHi, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
        spots.forEach(([x, z, s], i) => {
            q.setFromEuler(new THREE.Euler(0, r() * Math.PI * 2, (r() - 0.5) * 0.08));
            pos.set(x, 3.5 * s, z); sc.set(s, s, s);
            m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4);
            pos.set(x + (r() - 0.5) * 0.8, 6.6 * s, z + (r() - 0.5) * 0.8); sc.set(s * (1 + r() * 0.5), s * (0.8 + r() * 0.4), s * (1 + r() * 0.5));
            m4.compose(pos, q, sc); blobsLo.setMatrixAt(i, m4);
            pos.set(x + (r() - 0.5) * 1.2, 7.6 * s, z + (r() - 0.5) * 1.2); sc.set(s * 0.9, s * 0.7, s * 0.9);
            m4.compose(pos, q, sc); blobsHi.setMatrixAt(i, m4);
        });
        trunks.instanceMatrix.needsUpdate = true;
        blobsLo.instanceMatrix.needsUpdate = true;
        blobsHi.instanceMatrix.needsUpdate = true;
        return { trunks, blobsLo, blobsHi };
    }, []);
    useEffect(() => () => { trunks.geometry.dispose(); blobsLo.geometry.dispose(); blobsHi.geometry.dispose(); }, [trunks, blobsLo, blobsHi]);
    return (<>
        <primitive object={trunks} />
        <primitive object={blobsLo} />
        <primitive object={blobsHi} />
    </>);
};

/** Raios de deus: cones aditivos inclinados descendo da copa. */
const GodRays: React.FC = () => {
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#cfe8a0', transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), []);
    const group = useRef<THREE.Group>(null!);
    const spots = useMemo(() => {
        const r = rng(915);
        return Array.from({ length: 9 }, () => [(r() * 2 - 1) * 28, -48 + r() * 50, 0.7 + r() * 1.6, r() * Math.PI] as const);
    }, []);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (group.current) group.current.children.forEach((c, i) => {
            const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
            m.opacity = 0.035 + Math.sin(t * 0.3 + i * 2.1) * 0.02;
        });
    });
    return (
        <group ref={group}>
            {spots.map(([x, z, s, a], i) => (
                <mesh key={i} position={[x, 5.4, z]} rotation={[0.12, a, 0.16]} material={mat.clone()}>
                    <coneGeometry args={[2.4 * s, 11, 10, 1, true]} />
                </mesh>
            ))}
        </group>
    );
};

/** O fio vermelho costurado até a raiz + os nós de latão. */
const RedThread: React.FC = () => {
    const geo = useMemo(() => {
        const pts = F9_FIO.map(([x, z], i) => new THREE.Vector3(x, 0.5 + Math.sin(i * 1.7) * 0.28 + (i % 3 === 0 ? 0.9 : 0), z));
        const curve = new THREE.CatmullRomCurve3(pts);
        return new THREE.TubeGeometry(curve, 90, 0.035, 6);
    }, []);
    useEffect(() => () => geo.dispose(), [geo]);
    return (<>
        <mesh geometry={geo} material={M9.thread} />
        {F9_FIO.filter((_, i) => i % 2 === 1).map(([x, z], i) => (
            <mesh key={i} position={[x, 0.5, z]} material={M9.thread}><sphereGeometry args={[0.1, 6, 6]} /></mesh>
        ))}
    </>);
};

/** Os OCOS-abrigo: troncos gigantes com boca e brilho quente dentro. */
const Ocos: React.FC = () => (
    <>
        {F9_OCOS.map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]}>
                <mesh position={[0, 3.6, 0]} material={M9.bark}><cylinderGeometry args={[1.5, 2.1, 7.4, 9, 1]} /></mesh>
                <mesh position={[0, 5.9, 0]} material={M9.canopy}><icosahedronGeometry args={[2.4, 0]} /></mesh>
                {/* a boca (abertura) com brilho quente */}
                <mesh position={[0, 1.05, r * 0.62]} material={M9.ocoGlow}><circleGeometry args={[0.75, 12]} /></mesh>
                <pointLight position={[0, 1.3, r * 0.4]} distance={5} decay={2} color="#ffca7a" intensity={3.2} />
            </group>
        ))}
    </>
);

/** A RAIZ: a árvore-mãe no fundo do viveiro (o gancho do 10). */
const Raiz: React.FC = () => (
    <group position={[F9_RAIZ[0], 0, F9_RAIZ[1] - 2.5]}>
        <mesh position={[0, 5, 0]} material={M9.bark}><cylinderGeometry args={[2.2, 4.4, 10, 12, 1]} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 3.4, 0.7, Math.sin(a) * 3.4]} rotation={[0, -a, 0.9]} material={M9.bark}><cylinderGeometry args={[0.3, 0.85, 4.4, 6]} /></mesh>;
        })}
        <mesh position={[0, 11, 0]} material={M9.canopyHi}><icosahedronGeometry args={[5, 0]} /></mesh>
        {/* a chave do décimo, cravada e acesa */}
        <mesh position={[0, 2.2, 3.55]} rotation={[0.4, 0, 0]} material={M9.antler}><boxGeometry args={[0.14, 0.9, 0.08]} /></mesh>
        <pointLight position={[0, 2.4, 4.2]} distance={7} decay={2} color="#ffdf8a" intensity={4} />
    </group>
);

/** Musgo-brilho: a base da cadeia (a intensidade segue o estoque do eco). */
const MossPatches: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        f9eco.moss.forEach((m, i) => {
            const mesh = refs.current[i]; if (!mesh) return;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.12 + m.amount * 0.42 + Math.sin(t * 1.4 + i * 2) * 0.05 * m.amount;
            const s = 0.6 + m.amount * 0.55;
            mesh.scale.set(s, s * 0.28, s);   // preserva o achatamento do domo
        });
    });
    return (<>
        {f9eco.moss.map((m, i) => (
            <group key={i} position={[m.x, 0.02, m.z]}>
                {/* domo baixo e grumoso (não um disco chapado) — pega a luz com forma */}
                <mesh ref={(el) => { refs.current[i] = el; }} scale={[1, 0.28, 1]} material={M9.moss.clone()}>
                    <icosahedronGeometry args={[1.4, 1]} />
                </mesh>
                {/* tufos menores ao redor pra quebrar a silhueta */}
                {[0, 1, 2].map((k) => {
                    const a = (k / 3) * Math.PI * 2 + i;
                    return <mesh key={k} position={[Math.cos(a) * 1.1, 0.04, Math.sin(a) * 1.1]} scale={[1, 0.3, 1]} material={M9.moss.clone()}><icosahedronGeometry args={[0.4 + (k % 2) * 0.2, 0]} /></mesh>;
                })}
                {/* halo aditivo suave (barato — sem point light) */}
                <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[2.0, 12]} />
                    <meshBasicMaterial color="#4ade82" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
                </mesh>
            </group>
        ))}
    </>);
};

/** Vagalumes à deriva. */
const Fireflies: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 90, a = new Float32Array(n * 3), r = rng(919);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 32; a[i * 3 + 1] = 0.4 + r() * 3.4; a[i * 3 + 2] = -50 + r() * 54; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#d8ffb0', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    const pts = useRef<THREE.Points>(null!);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        if (pts.current) { pts.current.position.y = Math.sin(t * 0.4) * 0.3; pts.current.position.x = Math.sin(t * 0.22) * 0.8; mat.opacity = 0.55 + Math.sin(t * 2.2) * 0.3; }
    });
    return <points ref={pts} geometry={geo} material={mat} />;
};

// ── os bichos ────────────────────────────────────────────────────────────────
/** Encontra agentes vivos por espécie (pool estável por índice). */
function bySpecies(sp: F9Species): F9Agent[] { return f9eco.agents.filter((a) => a.sp === sp); }

const POOL: Record<F9Species, number> = { saltito: 14, cervo: 5, vulto: 3, guardiao: 1 };

const CreaturePool: React.FC<{ sp: F9Species; children: (i: number) => React.ReactNode }> = ({ sp, children }) => (
    <>{Array.from({ length: POOL[sp] }, (_, i) => children(i))}</>
);

/** aplica pose comum: posição, heading, esconder se morto/na toca/além do pool */
function poseFromAgent(g: THREE.Group | null, list: F9Agent[], i: number, dt: number): F9Agent | null {
    if (!g) return null;
    const ag = list[i];
    if (!ag || ag.state === 'denned') { g.visible = false; return null; }
    g.visible = true;
    g.position.x += (ag.x - g.position.x) * Math.min(1, dt * 10);
    g.position.z += (ag.z - g.position.z) * Math.min(1, dt * 10);
    let dh = ag.heading - g.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    g.rotation.y += dh * Math.min(1, dt * 8);
    if (ag.state === 'dead') {
        // apagar: afunda e some (vira floresta)
        g.position.y = -Math.min(0.9, ag.deadT * 0.2);
        g.scale.setScalar(Math.max(0.01, 1 - ag.deadT * 0.12));
        return ag;
    }
    g.scale.setScalar(1);
    return ag;
}

/** SALTITO: bolinha com orelhas que se locomove aos pulos. */
const Saltitos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const list = bySpecies('saltito');
        for (let i = 0; i < POOL.saltito; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            const hop = ag.speedNow > 0.2 ? Math.abs(Math.sin(ag.anim * 2.4)) * 0.34 : 0;
            g.position.y = hop;
            const sq = ag.speedNow > 0.2 ? 1 + Math.sin(ag.anim * 4.8) * 0.12 : 1;
            g.scale.set(1 / sq, sq, 1 / sq);
        }
    });
    return (
        <CreaturePool sp="saltito">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <mesh position={[0, 0.26, 0]} material={M9.fur}><sphereGeometry args={[0.26, 8, 7]} /></mesh>
                    <mesh position={[-0.09, 0.52, 0]} rotation={[0, 0, 0.3]} material={M9.furDark}><capsuleGeometry args={[0.045, 0.16, 3, 5]} /></mesh>
                    <mesh position={[0.09, 0.52, 0]} rotation={[0, 0, -0.3]} material={M9.furDark}><capsuleGeometry args={[0.045, 0.16, 3, 5]} /></mesh>
                    <mesh position={[-0.08, 0.3, 0.21]} material={M9.eye}><sphereGeometry args={[0.03, 5, 5]} /></mesh>
                    <mesh position={[0.08, 0.3, 0.21]} material={M9.eye}><sphereGeometry args={[0.03, 5, 5]} /></mesh>
                </group>
            )}
        </CreaturePool>
    );
};

/** CERVO-LANTERNA: alto, galhada acesa, pernas com passada. */
const Cervos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const list = bySpecies('cervo');
        for (let i = 0; i < POOL.cervo; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            g.position.y = 0;
            const legs = g.getObjectByName('legs') as THREE.Group | undefined;
            if (legs) legs.children.forEach((leg, li) => { leg.rotation.x = Math.sin(ag.anim * 1.6 + (li % 2) * Math.PI) * Math.min(0.55, ag.speedNow * 0.12); });
            const neck = g.getObjectByName('neck') as THREE.Group | undefined;
            if (neck) neck.rotation.x = ag.state === 'graze' ? 0.85 : -0.1 + Math.sin(ag.anim * 0.4) * 0.05;
        }
    });
    return (
        <CreaturePool sp="cervo">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]} material={M9.cervo}><capsuleGeometry args={[0.32, 0.9, 4, 8]} /></mesh>
                    <group name="legs">
                        {[[-0.18, 0.42], [0.18, 0.42], [-0.18, -0.42], [0.18, -0.42]].map(([x, z], li) => (
                            <group key={li} position={[x, 1.0, z]}>
                                <mesh position={[0, -0.5, 0]} material={M9.furDark}><cylinderGeometry args={[0.05, 0.04, 1.0, 5]} /></mesh>
                            </group>
                        ))}
                    </group>
                    <group name="neck" position={[0, 1.35, 0.5]}>
                        <mesh position={[0, 0.3, 0.08]} rotation={[0.35, 0, 0]} material={M9.cervo}><capsuleGeometry args={[0.11, 0.5, 4, 6]} /></mesh>
                        <group position={[0, 0.62, 0.2]}>
                            <mesh material={M9.cervo}><capsuleGeometry args={[0.11, 0.22, 4, 6]} /></mesh>
                            <mesh position={[0, 0.02, 0.2]} material={M9.furDark}><coneGeometry args={[0.05, 0.16, 5]} /></mesh>
                            {/* a galhada-lanterna */}
                            {[-0.09, 0.09].map((x, ai) => (
                                <group key={ai} position={[x, 0.16, -0.02]} rotation={[0, 0, x * 4]}>
                                    <mesh position={[0, 0.16, 0]} material={M9.antler}><cylinderGeometry args={[0.02, 0.03, 0.34, 4]} /></mesh>
                                    <mesh position={[x * 1.4, 0.3, 0]} rotation={[0, 0, x * 6]} material={M9.antler}><cylinderGeometry args={[0.015, 0.02, 0.22, 4]} /></mesh>
                                </group>
                            ))}
                            {/* brilho da galhada sem point light (uniform budget) */}
                            <mesh position={[0, 0.3, 0]}>
                                <sphereGeometry args={[0.34, 8, 6]} />
                                <meshBasicMaterial color="#ffdf8a" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
                            </mesh>
                        </group>
                    </group>
                </group>
            )}
        </CreaturePool>
    );
};

/** VULTO: predador rente ao chão, olhos acesos; espreita abaixado. */
const Vultos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const list = bySpecies('vulto');
        for (let i = 0; i < POOL.vulto; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            const crouch = ag.state === 'stalk' ? 0.55 : 1;
            g.position.y = 0;
            g.scale.y = crouch;
            const body = g.getObjectByName('vbody') as THREE.Mesh | undefined;
            if (body) body.rotation.z = Math.sin(ag.anim * 2.2) * Math.min(0.12, ag.speedNow * 0.03);
        }
    });
    return (
        <CreaturePool sp="vulto">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <mesh name="vbody" position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} material={M9.vulto}><capsuleGeometry args={[0.24, 1.1, 4, 7]} /></mesh>
                    {[[-0.16, 0.45], [0.16, 0.45], [-0.16, -0.45], [0.16, -0.45]].map(([x, z], li) => (
                        <mesh key={li} position={[x, 0.24, z]} material={M9.vulto}><cylinderGeometry args={[0.045, 0.03, 0.5, 4]} /></mesh>
                    ))}
                    <mesh position={[0, 0.62, 0.72]} material={M9.vulto}><sphereGeometry args={[0.18, 7, 6]} /></mesh>
                    <mesh position={[-0.07, 0.66, 0.86]} material={M9.eyeRed}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                    <mesh position={[0.07, 0.66, 0.86]} material={M9.eyeRed}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                    <mesh position={[0, 0.55, -0.85]} rotation={[0.5, 0, 0]} material={M9.vulto}><coneGeometry args={[0.09, 0.7, 5]} /></mesh>
                </group>
            )}
        </CreaturePool>
    );
};

/** O GUARDIÃO: a árvore-que-anda. Seis metros. Não olha pra você. */
const Guardiao: React.FC = () => {
    const ref = useRef<THREE.Group>(null!);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const list = bySpecies('guardiao');
        const ag = poseFromAgent(ref.current, list, 0, dt);
        if (!ref.current || !ag) return;
        const sway = Math.sin(ag.anim * 0.5);
        ref.current.rotation.z = sway * 0.03;
        ref.current.position.y = Math.abs(Math.sin(ag.anim * 0.5)) * 0.18;
        const legs = ref.current.getObjectByName('glegs') as THREE.Group | undefined;
        if (legs) legs.children.forEach((leg, li) => { leg.rotation.x = Math.sin(ag.anim * 0.5 + li * Math.PI) * 0.34; });
    });
    return (
        <group ref={ref} visible={false}>
            <group name="glegs">
                {[[-0.7, 0.3], [0.7, -0.3]].map(([x, z], i) => (
                    <group key={i} position={[x, 3.2, z]}>
                        <mesh position={[0, -1.6, 0]} material={M9.guardian}><cylinderGeometry args={[0.28, 0.5, 3.2, 7]} /></mesh>
                    </group>
                ))}
            </group>
            <mesh position={[0, 4.3, 0]} material={M9.guardian}><cylinderGeometry args={[0.75, 1.05, 2.8, 8]} /></mesh>
            <mesh position={[0, 6.3, 0]} material={M9.canopy}><icosahedronGeometry args={[1.7, 0]} /></mesh>
            <mesh position={[0, 7.1, 0]} material={M9.canopyHi}><icosahedronGeometry args={[1.0, 0]} /></mesh>
            {/* vinhas pendendo */}
            {[-0.5, 0.1, 0.6].map((x, i) => (
                <mesh key={i} position={[x, 5.1, 0.5]} material={M9.moss}><cylinderGeometry args={[0.03, 0.02, 1.6, 4]} /></mesh>
            ))}
            {/* musgo nas costas */}
            <mesh position={[0, 5.2, -0.6]} rotation={[0.7, 0, 0]} material={M9.moss}><sphereGeometry args={[0.55, 6, 5]} /></mesh>
        </group>
    );
};

/** A ONDA DE APAGAMENTO: parede de branco que varre o viveiro + luz que morre. */
const Wave: React.FC = () => {
    const wall = useRef<THREE.Mesh>(null!);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#eef4e8', transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
    useFrame(() => {
        if (!wall.current) return;
        if (f9eco.phase === 'onda') {
            wall.current.visible = true;
            const k = Math.min(1, f9eco.waveT / 10);
            wall.current.position.z = 6 - k * 62;
            mat.opacity = 0.9;
        } else if (f9eco.phase === 'aviso') {
            wall.current.visible = true;
            wall.current.position.z = 8;
            mat.opacity = 0.25 + Math.sin(f9eco.t * 3) * 0.1;
        } else { wall.current.visible = false; mat.opacity = 0; }
    });
    return (
        <mesh ref={wall} visible={false} material={mat} position={[0, 6, 8]}>
            <boxGeometry args={[72, 16, 3]} />
        </mesh>
    );
};

// ── a cena ───────────────────────────────────────────────────────────────────
export const Floor9Forest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> =
    ({ playerPositionRef }) => {
        const scene = useThree((s) => s.scene);
        const amb = useRef<THREE.AmbientLight>(null!);
        const hemi = useRef<THREE.HemisphereLight>(null!);

        useEffect(() => {
            const oldFog = scene.fog, oldBg = scene.background;
            scene.fog = new THREE.Fog('#1a3020', 11, 62);
            scene.background = new THREE.Color('#16281c');
            return () => { scene.fog = oldFog; scene.background = oldBg; };
        }, [scene]);

        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            const p = playerPositionRef.current;
            f9EcoTick(dt, p.x, p.z);
            f9Tick(dt, p.x, p.z);
            f9DrainEvents(); f9EcoDrainEvents();
            // a luz responde ao ciclo: clareia doentio no aviso, estoura na onda
            const frac = f9CycleFrac();
            const warn = f9eco.phase === 'aviso' ? (frac - F9_AVISO_AT) / (1 - F9_AVISO_AT) : 0;
            const wave = f9eco.phase === 'onda' ? 1 : 0;
            if (amb.current) amb.current.intensity = 1.05 + warn * 0.4 + wave * 1.2;
            if (hemi.current) hemi.current.intensity = 1.15 + warn * 0.3 + wave * 0.6;
            const fog = scene.fog as THREE.Fog | null;
            if (fog) {
                fog.far = 62 - warn * 20 - wave * 34;
                fog.color.setStyle(wave ? '#e8efe2' : warn > 0 ? '#4a5a44' : '#1a3020');
                if (scene.background instanceof THREE.Color) scene.background.copy(fog.color);
            }
        });

        return (
            <group>
                {/* chão + bordas erguidas (o viveiro é uma tigela) */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -24]} material={M9.ground}>
                    <planeGeometry args={[76, 64]} />
                </mesh>
                {[[-35, -24, 0.2], [35, -24, -0.2]].map(([x, z, rz], i) => (
                    <mesh key={i} position={[x, 2, z]} rotation={[0, 0, rz]} material={M9.ground}>
                        <boxGeometry args={[6, 8, 60]} />
                    </mesh>
                ))}
                {/* a copa-teto (escuridão viva lá em cima) */}
                <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10.5, -24]} material={M9.canopy}>
                    <planeGeometry args={[80, 66]} />
                </mesh>

                <ambientLight ref={amb} color="#7a9a6c" intensity={1.05} />
                <hemisphereLight ref={hemi} color="#bce0b0" groundColor="#34482c" intensity={1.15} />
                <directionalLight position={[8, 14, -6]} intensity={0.85} color="#e8f8c4" />

                <Trees />
                <GodRays />
                <MossPatches />
                <Fireflies />
                <RedThread />
                <Ocos />
                <Raiz />

                <Saltitos />
                <Cervos />
                <Vultos />
                <Guardiao />
                <Wave />

                {/* o vão do elevador NÃO existe aqui — só a moldura enferrujada
                    caída perto do pouso, engolida pela floresta */}
                <group position={[2.5, 0, 1.5]} rotation={[0.12, 0.5, 0.06]}>
                    <B a={[1.6, 0.18, 0.12]} p={[0, 0.1, 0]} m={M9.bark} />
                    <B a={[0.14, 2.2, 0.12]} p={[-0.75, 1.1, 0]} m={M9.bark} r={[0, 0, 0.08]} />
                    <B a={[0.14, 1.7, 0.12]} p={[0.78, 0.85, 0]} m={M9.bark} r={[0, 0, -0.12]} />
                    <mesh position={[0.1, 0.9, 0.02]} material={M9.moss}><sphereGeometry args={[0.35, 6, 5]} /></mesh>
                </group>
            </group>
        );
    };

export default Floor9Forest;
