/**
 * Floor9Forest.tsx — O VIVEIRO em 3D.
 *
 * O espaço continua sistêmico (f9Eco), mas sua pele é pintada: o mural dá
 * profundidade ao antigo hotel engolido pela floresta, as superfícies usam as
 * quatro texturas geradas para o andar e todo animal nasce do atlas 4×4. A
 * pose escolhida vem diretamente do estado do agente, portanto animação e
 * comportamento nunca contam histórias diferentes.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colorTex, rng } from './Floor6Textures';
import {
    f9, f9Tick, f9DrainEvents, f9PredadorPegou, f9RelicCount,
    F9_OCOS, F9_FIO, F9_RAIZ, F9_RELICS, F9_RELIC_ALL, F9_TREES,
} from './f9Floresta';
import {
    f9eco, f9EcoTick, f9EcoDrainEvents, f9CycleFrac, F9_AVISO_AT,
    type F9Agent, type F9Species,
} from './f9Eco';
import muralUrl from './assets/f9/viveiro-depth-mural-v1.webp';
import barkUrl from './assets/f9/viveiro-bark-v1.webp';
import groundUrl from './assets/f9/viveiro-ground-v1.webp';
import canopyUrl from './assets/f9/viveiro-canopy-v1.webp';
import rootUrl from './assets/f9/viveiro-root-v1.webp';
import creaturesAtlasUrl from './assets/f9/viveiro-creatures-atlas-v1.png';
import relicsAtlasUrl from './assets/f9/viveiro-relics-atlas-v1.png';

function painted(url: string, rx = 1, ry = 1, repeat = true): THREE.Texture {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
    } else {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    return t;
}

const muralTex = painted(muralUrl, 1, 1, false);
const barkTex = painted(barkUrl, 2.5, 5.5);
const groundTex = painted(groundUrl, 7, 6);
const canopyTex = painted(canopyUrl, 5, 4);
const rootTex = painted(rootUrl, 2, 3.5);
const creatureAtlas = painted(creaturesAtlasUrl, 1, 1, false);
const relicAtlas = painted(relicsAtlasUrl, 1, 1, false);

const glowDotTex = colorTex(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,218,1)');
    g.addColorStop(0.18, 'rgba(198,255,159,.95)');
    g.addColorStop(0.55, 'rgba(94,214,116,.28)');
    g.addColorStop(1, 'rgba(40,120,70,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});
glowDotTex.wrapS = glowDotTex.wrapT = THREE.ClampToEdgeWrapping;

const leafTex = colorTex(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.65);
    const g = ctx.createLinearGradient(-18, 0, 18, 0);
    g.addColorStop(0, 'rgba(41,75,38,0)'); g.addColorStop(0.2, 'rgba(79,126,57,.9)');
    g.addColorStop(0.7, 'rgba(154,177,87,.9)'); g.addColorStop(1, 'rgba(78,118,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.quadraticCurveTo(0, -13, 22, 0); ctx.quadraticCurveTo(0, 13, -22, 0); ctx.fill();
    ctx.restore();
});
leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping;

const waveTex = colorTex(256, 256, (ctx, w, h) => {
    const r = rng(997);
    ctx.clearRect(0, 0, w, h);
    const wash = ctx.createLinearGradient(0, 0, w, 0);
    wash.addColorStop(0, 'rgba(207,224,199,0)');
    wash.addColorStop(0.35, 'rgba(222,235,215,.23)');
    wash.addColorStop(0.72, 'rgba(190,213,185,.52)');
    wash.addColorStop(1, 'rgba(218,231,210,.04)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
        const y = r() * h;
        ctx.strokeStyle = `rgba(236,244,229,${0.02 + r() * 0.08})`;
        ctx.lineWidth = 1 + r() * 7;
        ctx.beginPath(); ctx.moveTo(-20, y);
        ctx.bezierCurveTo(w * .25, y + (r() - .5) * 60, w * .7, y + (r() - .5) * 80, w + 20, y + (r() - .5) * 45);
        ctx.stroke();
    }
}, 2.2, 1.1);

const M9 = {
    ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: '#8e997d' }),
    bark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.98, color: '#a49c83' }),
    root: new THREE.MeshStandardMaterial({ map: rootTex, roughness: 0.96, color: '#a49b79' }),
    canopy: new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 1, color: '#50734c', flatShading: true }),
    canopyHi: new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 1, color: '#71965c', emissive: '#173c1c', emissiveIntensity: 0.32, flatShading: true }),
    moss: new THREE.MeshStandardMaterial({ color: '#3a5a34', roughness: 1, emissive: '#6adf8a', emissiveIntensity: 0.4 }),
    thread: new THREE.MeshStandardMaterial({ color: '#c52b34', roughness: 0.48, emissive: '#a41220', emissiveIntensity: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c5a356', metalness: 0.72, roughness: 0.3, emissive: '#76530e', emissiveIntensity: 0.35 }),
    ocoGlow: new THREE.MeshBasicMaterial({ color: '#ffca7a' }),
};

const B: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => <mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>;

/** Pintura de profundidade: hotel, floresta e fio continuam muito além do mapa. */
const ViveiroBackdrop: React.FC = () => (
    <group position={[0, 16.2, -51.55]}>
        <mesh renderOrder={-5}>
            <planeGeometry args={[74, 41.7]} />
            <meshBasicMaterial map={muralTex} color="#687764" fog={false} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, -15.7, 0.04]}>
            <planeGeometry args={[74, 10]} />
            <meshBasicMaterial color="#101a12" transparent opacity={0.58} fog={false} depthWrite={false} />
        </mesh>
    </group>
);

/** Árvores instanciadas, com o trajeto do fio realmente aberto até a raiz. */
const Trees: React.FC = () => {
    const { trunks, crowns, crownsHi } = useMemo(() => {
        const n = F9_TREES.length;
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.44, 7.3, 8), M9.bark, n);
        const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.62, 1), M9.canopy, n);
        const crownsHi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.08, 1), M9.canopyHi, n);
        const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
        F9_TREES.forEach(({ x, z, scale: s, rotation, crownX, crownZ, crown2X, crown2Z }, i) => {
            q.setFromEuler(new THREE.Euler(0, rotation, ((i % 7) - 3) * .009));
            pos.set(x, 3.65 * s, z); sc.set(s, s, s); matrix.compose(pos, q, sc); trunks.setMatrixAt(i, matrix);
            pos.set(x + crownX, 6.7 * s, z + crownZ);
            const crownWide = 1.05 + (i % 6) * .065;
            sc.set(s * crownWide, s * (.84 + (i % 5) * .045), s * crownWide);
            matrix.compose(pos, q, sc); crowns.setMatrixAt(i, matrix);
            pos.set(x + crown2X, 7.7 * s, z + crown2Z);
            sc.set(s * .86, s * .66, s * .86); matrix.compose(pos, q, sc); crownsHi.setMatrixAt(i, matrix);
        });
        trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = crownsHi.instanceMatrix.needsUpdate = true;
        return { trunks, crowns, crownsHi };
    }, []);
    useEffect(() => () => { trunks.geometry.dispose(); crowns.geometry.dispose(); crownsHi.geometry.dispose(); }, [trunks, crowns, crownsHi]);
    return <><primitive object={trunks} /><primitive object={crowns} /><primitive object={crownsHi} /></>;
};

const GodRays: React.FC = () => {
    const group = useRef<THREE.Group>(null!);
    const spots = useMemo(() => {
        const r = rng(915);
        return Array.from({ length: 10 }, () => [(r() * 2 - 1) * 28, -48 + r() * 50, .65 + r() * 1.5, r() * Math.PI] as const);
    }, []);
    useFrame(({ clock }) => {
        group.current?.children.forEach((child, i) => {
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
            mat.opacity = .028 + Math.sin(clock.elapsedTime * .3 + i * 2.1) * .014;
        });
    });
    return <group ref={group}>{spots.map(([x, z, s, a], i) => (
        <mesh key={i} position={[x, 5.4, z]} rotation={[.12, a, .16]}>
            <coneGeometry args={[2.5 * s, 11, 12, 1, true]} />
            <meshBasicMaterial color="#d8ecad" transparent opacity={.04} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
    ))}</group>;
};

const RedThread: React.FC = () => {
    const geo = useMemo(() => {
        const pts = F9_FIO.map(([x, z], i) => new THREE.Vector3(x, .35 + Math.sin(i * 1.7) * .2 + (i % 3 === 0 ? .45 : 0), z));
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, .052, 7);
    }, []);
    useEffect(() => () => geo.dispose(), [geo]);
    return <>
        <mesh geometry={geo} material={M9.thread} />
        {F9_FIO.filter((_, i) => i % 2 === 1).map(([x, z], i) => (
            <group key={i} position={[x, .42, z]}>
                <mesh material={M9.brass}><torusGeometry args={[.12, .025, 5, 10]} /></mesh>
                <pointLight color="#d43a3e" intensity={.8} distance={1.8} decay={2} />
            </group>
        ))}
    </>;
};

/** Ramais do fio conduzem às três lembranças e acordam quando recuperados. */
const MemoryBranches: React.FC = () => {
    const branches = useMemo(() => F9_RELICS.map((relic, i) => {
        const [ax, az] = F9_FIO[relic.anchor];
        const midX = (ax + relic.x) * .5 + (i - 1) * .8;
        const midZ = (az + relic.z) * .5;
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(ax, .39, az),
            new THREE.Vector3(midX, .28 + i * .08, midZ),
            new THREE.Vector3(relic.x, .48, relic.z),
        ]);
        const geometry = new THREE.TubeGeometry(curve, 54, .045, 7);
        const material = M9.thread.clone();
        material.transparent = true;
        return { geometry, material };
    }), []);
    useEffect(() => () => branches.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); }), [branches]);
    useFrame(() => {
        branches.forEach(({ material }, i) => {
            const awake = (f9.reliquias & (1 << i)) !== 0;
            material.opacity = awake ? 1 : .44;
            material.emissiveIntensity = awake ? 1.65 : .35;
        });
    });
    return <>{branches.map(({ geometry, material }, i) => <mesh key={i} geometry={geometry} material={material} />)}</>;
};

const RelicSprite: React.FC<{ index: number }> = ({ index }) => {
    const relic = F9_RELICS[index];
    const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const geo = useMemo(() => new THREE.PlaneGeometry(3.4, 3.4), []);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({
        map: relicAtlas, transparent: true, alphaTest: .018, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
    }), []);
    const lastFrame = useRef(-1);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ camera }, rawDt) => {
        const m = mesh.current; if (!m) return;
        const collected = (f9.reliquias & (1 << index)) !== 0;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, collected ? 0 : 1, Math.min(1, rawDt * 4.8));
        m.visible = mat.opacity > .025;
        m.position.y = 1.65 + Math.sin(f9.t * 1.4 + index) * .08;
        m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
        const frame = Math.floor(f9.t * 1.7 + index) % 4;
        if (frame !== lastFrame.current) { lastFrame.current = frame; setAtlasFrame(geo, frame, relic.row); }
    });
    return <mesh ref={mesh} geometry={geo} material={mat} position={[0, 1.65, 0]} renderOrder={5} />;
};

const RelicShrines: React.FC = () => <>{F9_RELICS.map((relic, i) => (
    <group key={relic.title} position={[relic.x, 0, relic.z]} rotation={[0, i * 1.8 - .5, 0]}>
        <mesh position={[0, .07, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M9.root}>
            <circleGeometry args={[2.25, 24]} />
        </mesh>
        {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[k * .92, .42 + Math.abs(k) * .16, -.38]} rotation={[.12 * k, 0, -.16 * k]} material={M9.root}>
                <cylinderGeometry args={[.2, .38, 1.15 + (k === 0 ? .45 : 0), 7]} />
            </mesh>
        ))}
        <mesh position={[0, 1.3, -.28]} rotation={[Math.PI / 2, 0, 0]} material={M9.brass}>
            <torusGeometry args={[1.1, .08, 8, 24, Math.PI]} />
        </mesh>
        <RelicSprite index={i} />
        <pointLight position={[0, 1.25, .45]} color="#d8ff94" intensity={2.8} distance={6.5} decay={2} />
    </group>
))}</>;

/** Nó central: as quatro poses da última linha mostram 0/3 → 3/3 memórias. */
const RootKnot: React.FC = () => {
    const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const light = useRef<THREE.PointLight>(null!);
    const geo = useMemo(() => new THREE.PlaneGeometry(3.6, 3.6), []);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({
        map: relicAtlas, transparent: true, alphaTest: .018, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide,
    }), []);
    const lastFrame = useRef(-1);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ camera }) => {
        const m = mesh.current; if (!m) return;
        const frame = Math.min(3, f9RelicCount());
        if (frame !== lastFrame.current) { lastFrame.current = frame; setAtlasFrame(geo, frame, 3); }
        m.lookAt(camera.position.x, m.position.y, camera.position.z);
        m.position.y = 1.7 + Math.sin(f9.t * 1.15) * .06;
        if (light.current) light.current.intensity = frame === 3 ? 5.2 : .75 + frame * .8;
    });
    return <group position={[F9_RAIZ[0], 0, F9_RAIZ[1] + 1.6]}>
        <mesh ref={mesh} geometry={geo} material={mat} position={[0, 1.7, 0]} renderOrder={5} />
        <pointLight ref={light} position={[0, 1.6, .4]} color="#e33a44" intensity={.75} distance={8} decay={2} />
    </group>;
};

const Ocos: React.FC = () => <>{F9_OCOS.map(([x, z, r], i) => (
    <group key={i} position={[x, 0, z]}>
        <mesh position={[0, 3.6, 0]} material={M9.bark}><cylinderGeometry args={[1.5, 2.1, 7.4, 10]} /></mesh>
        <mesh position={[0, 5.9, 0]} material={M9.canopy}><icosahedronGeometry args={[2.4, 1]} /></mesh>
        <mesh position={[0, 1.05, r * .62]} material={M9.ocoGlow}><circleGeometry args={[.78, 16]} /></mesh>
        <mesh position={[0, 1.05, r * .64 + .012]}><ringGeometry args={[.72, 1.03, 16]} /><meshStandardMaterial map={rootTex} color="#756748" roughness={1} /></mesh>
        <pointLight position={[0, 1.3, r * .42]} distance={5} decay={2} color="#ffca7a" intensity={3.1} />
    </group>
) )}</>;

const RootKey: React.FC = () => {
    const group = useRef<THREE.Group>(null!);
    useFrame(() => { if (group.current) group.current.visible = f9.reliquias === F9_RELIC_ALL; });
    return <group ref={group} visible={false}>
        <group rotation={[0, 0, -.16]}>
            <mesh material={M9.brass}><torusGeometry args={[.28, .07, 10, 28]} /></mesh>
            <mesh position={[0, -.63, 0]} material={M9.brass}><boxGeometry args={[.12, .82, .1]} /></mesh>
            <mesh position={[.13, -1.0, 0]} material={M9.brass}><boxGeometry args={[.38, .12, .1]} /></mesh>
            <mesh position={[.23, -.86, 0]} material={M9.brass}><boxGeometry args={[.12, .34, .1]} /></mesh>
            <mesh position={[0, -.38, -.03]}><circleGeometry args={[.82, 32]} /><meshBasicMaterial color="#f4c75c" transparent opacity={.1} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
        </group>
        <pointLight position={[0, -.15, .63]} distance={9} decay={2} color="#ffdf8a" intensity={5.2} />
    </group>;
};

const Raiz: React.FC = () => (
    <group position={[F9_RAIZ[0], 0, F9_RAIZ[1] - 2.5]}>
        <mesh position={[0, 5, 0]} material={M9.root}><cylinderGeometry args={[2.2, 4.4, 10, 14]} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 3.4, .7, Math.sin(a) * 3.4]} rotation={[0, -a, .9]} material={M9.root}><cylinderGeometry args={[.3, .86, 4.5, 7]} /></mesh>;
        })}
        <mesh position={[0, 11, 0]} material={M9.canopyHi}><icosahedronGeometry args={[5, 1]} /></mesh>
        {/* A chave do décimo só existe quando as três lembranças acordam o nó. */}
        <group position={[0, 2.65, 3.62]}><RootKey /></group>
    </group>
);

const MossPatches: React.FC = () => {
    const refs = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        f9eco.moss.forEach((m, i) => {
            const mesh = refs.current[i]; if (!mesh) return;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = .12 + m.amount * .42 + Math.sin(clock.elapsedTime * 1.4 + i * 2) * .05 * m.amount;
            const s = .6 + m.amount * .55; mesh.scale.set(s, s * .28, s);
        });
    });
    return <>{f9eco.moss.map((m, i) => (
        <group key={i} position={[m.x, .02, m.z]}>
            <mesh ref={(el) => { refs.current[i] = el; }} scale={[1, .28, 1]} material={M9.moss.clone()}><icosahedronGeometry args={[1.4, 1]} /></mesh>
            {[0, 1, 2].map((k) => {
                const a = k / 3 * Math.PI * 2 + i;
                return <mesh key={k} position={[Math.cos(a) * 1.1, .04, Math.sin(a) * 1.1]} scale={[1, .3, 1]} material={M9.moss.clone()}><icosahedronGeometry args={[.4 + (k % 2) * .2, 0]} /></mesh>;
            })}
            <mesh position={[0, .12, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2, 16]} /><meshBasicMaterial color="#4ade82" transparent opacity={.06} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
        </group>
    ))}</>;
};

const Fireflies: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 120, a = new Float32Array(n * 3), r = rng(919);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 32; a[i * 3 + 1] = .35 + r() * 4.2; a[i * 3 + 2] = -50 + r() * 54; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ map: glowDotTex, color: '#d8ffb0', size: .32, transparent: true, opacity: .85, alphaTest: .015, depthWrite: false, blending: THREE.AdditiveBlending }), []);
    const pts = useRef<THREE.Points>(null!);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ clock }) => {
        if (!pts.current) return;
        pts.current.position.y = Math.sin(clock.elapsedTime * .4) * .28;
        pts.current.position.x = Math.sin(clock.elapsedTime * .22) * .75;
        mat.opacity = .6 + Math.sin(clock.elapsedTime * 2.2) * .2;
    });
    return <points ref={pts} geometry={geo} material={mat} />;
};

const LeafDrift: React.FC = () => {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 78, a = new Float32Array(n * 3), r = rng(923);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 32; a[i * 3 + 1] = .3 + r() * 9.5; a[i * 3 + 2] = -50 + r() * 54; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ map: leafTex, color: '#8fab61', size: .42, transparent: true, opacity: .42, alphaTest: .025, depthWrite: false }), []);
    const pts = useRef<THREE.Points>(null!);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, .05), attr = geo.getAttribute('position') as THREE.BufferAttribute;
        const a = attr.array as Float32Array;
        for (let i = 0; i < a.length; i += 3) {
            a[i + 1] -= dt * (.08 + (i % 9) * .012);
            a[i] += Math.sin(clock.elapsedTime * .45 + i) * dt * .045;
            if (a[i + 1] < .12) a[i + 1] = 8.5 + (i % 13) * .15;
        }
        attr.needsUpdate = true;
        if (pts.current) pts.current.rotation.y = Math.sin(clock.elapsedTime * .08) * .04;
    });
    return <points ref={pts} geometry={geo} material={mat} />;
};

function setAtlasFrame(geo: THREE.PlaneGeometry, frame: number, row: number): void {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const col = frame % 4;
    for (let i = 0; i < uv.count; i++) {
        const x = i === 1 || i === 3 ? 1 : 0;
        const y = i < 2 ? 1 : 0;
        uv.setXY(i, (col + x) / 4, 1 - (row + 1 - y) / 4);
    }
    uv.needsUpdate = true;
}

const SPECIES_ROW: Record<F9Species, number> = { saltito: 0, cervo: 1, vulto: 2, guardiao: 3 };
const SPECIES_SIZE: Record<F9Species, readonly [number, number, number]> = {
    saltito: [1.45, 1.06, .5], cervo: [3.05, 2.65, 1.2], vulto: [2.65, 1.42, .7], guardiao: [5.7, 5.8, 2.9],
};
const POOL: Record<F9Species, number> = { saltito: 14, cervo: 5, vulto: 3, guardiao: 1 };

function frameFor(ag: F9Agent): number {
    if (ag.state === 'dead') return 3;
    if (ag.sp === 'saltito') return ag.speedNow > .2 ? 1 + Math.floor(ag.anim * 1.8) % 2 : 0;
    if (ag.sp === 'cervo') return ag.state === 'graze' ? 2 : ag.speedNow > .2 ? 1 + Math.floor(ag.anim * .85) % 3 : 0;
    if (ag.sp === 'vulto') return ag.state === 'stalk' ? 0 : ag.speedNow > .2 ? 1 + Math.floor(ag.anim * 1.1) % 3 : 0;
    return Math.floor(ag.anim * .32) % 4;
}

const CreatureSprite: React.FC<{ sp: F9Species; index: number }> = ({ sp, index }) => {
    const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: creatureAtlas, transparent: true, alphaTest: .028, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
    const lastFrame = useRef(-1);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
    useFrame(({ camera }, rawDt) => {
        const m = mesh.current; if (!m) return;
        const list = f9eco.agents.filter((a) => a.sp === sp);
        const ag = list[index];
        if (!ag || ag.state === 'denned' || (ag.state === 'dead' && ag.deadT > 7.5)) { m.visible = false; return; }
        m.visible = true;
        const dt = Math.min(rawDt, .05), [w, h, baseY] = SPECIES_SIZE[sp];
        m.position.x += (ag.x - m.position.x) * Math.min(1, dt * 9);
        m.position.z += (ag.z - m.position.z) * Math.min(1, dt * 9);
        const moving = ag.speedNow > .2;
        const bob = sp === 'saltito' && moving ? Math.abs(Math.sin(ag.anim * 2.4)) * .28
            : moving ? Math.sin(ag.anim * 1.35) * .045 : Math.sin(ag.anim * .3) * .018;
        const fade = ag.state === 'dead' ? Math.max(.02, 1 - ag.deadT * .12) : 1;
        m.position.y = baseY + bob - (ag.state === 'dead' ? Math.min(.65, ag.deadT * .09) : 0);
        m.scale.set(w * fade, h * fade, 1);
        m.lookAt(camera.position.x, m.position.y, camera.position.z);
        mat.opacity = fade;
        const frame = frameFor(ag);
        if (lastFrame.current !== frame) { lastFrame.current = frame; setAtlasFrame(geo, frame, SPECIES_ROW[sp]); }
    });
    return <mesh ref={mesh} geometry={geo} material={mat} visible={false} position={[0, 30, 0]} renderOrder={4} />;
};

const CreatureSprites: React.FC = () => <>{(['saltito', 'cervo', 'vulto', 'guardiao'] as F9Species[]).flatMap((sp) =>
    Array.from({ length: POOL[sp] }, (_, i) => <CreatureSprite key={`${sp}-${i}`} sp={sp} index={i} />),
)}</>;

/** Onda translúcida e irregular: presença atmosférica, nunca parede branca. */
const Wave: React.FC = () => {
    const root = useRef<THREE.Group>(null!);
    const matA = useMemo(() => new THREE.MeshBasicMaterial({ map: waveTex, color: '#d7e4cf', transparent: true, opacity: 0, depthWrite: false, fog: true, side: THREE.DoubleSide }), []);
    const matB = useMemo(() => matA.clone(), [matA]);
    useEffect(() => () => { matA.dispose(); matB.dispose(); }, [matA, matB]);
    useFrame(() => {
        const g = root.current; if (!g) return;
        if (f9eco.phase === 'onda') {
            const k = Math.min(1, f9eco.waveT / 10);
            g.visible = true; g.position.z = 7 - k * 62; g.position.x = Math.sin(f9eco.t * .7) * 1.2;
            matA.opacity = .34 + Math.sin(f9eco.t * 1.7) * .05; matB.opacity = .18;
        } else if (f9eco.phase === 'aviso') {
            g.visible = true; g.position.z = 8; g.position.x = 0;
            matA.opacity = .08 + Math.sin(f9eco.t * 2.4) * .03; matB.opacity = .04;
        } else { g.visible = false; matA.opacity = matB.opacity = 0; }
    });
    return <group ref={root} visible={false} position={[0, 6, 8]}>
        <mesh material={matA} rotation={[0, .035, 0]}><planeGeometry args={[75, 18, 8, 4]} /></mesh>
        <mesh material={matB} position={[0, -.5, 1.1]} rotation={[0, -.055, .02]} scale={[1.08, .86, 1]}><planeGeometry args={[75, 18, 8, 4]} /></mesh>
    </group>;
};

export const Floor9Forest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const scene = useThree((s) => s.scene);
    const amb = useRef<THREE.AmbientLight>(null!);
    const hemi = useRef<THREE.HemisphereLight>(null!);

    useEffect(() => {
        const oldFog = scene.fog, oldBg = scene.background;
        scene.fog = new THREE.Fog('#14251a', 13, 69);
        scene.background = new THREE.Color('#0e1812');
        return () => { scene.fog = oldFog; scene.background = oldBg; };
    }, [scene]);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, .05), p = playerPositionRef.current;
        f9EcoTick(dt, p.x, p.z); f9Tick(dt, p.x, p.z);
        const ecoEvents = f9EcoDrainEvents();
        if (ecoEvents.includes('playerCaught')) f9PredadorPegou(p.x, p.z);
        f9DrainEvents();
        const frac = f9CycleFrac();
        const warn = f9eco.phase === 'aviso' ? (frac - F9_AVISO_AT) / (1 - F9_AVISO_AT) : 0;
        const wave = f9eco.phase === 'onda' ? 1 : 0;
        if (amb.current) amb.current.intensity = .82 + warn * .22 + wave * .45;
        if (hemi.current) hemi.current.intensity = 1.02 + warn * .18 + wave * .28;
        const fog = scene.fog as THREE.Fog | null;
        if (fog) {
            fog.far = 69 - warn * 16 - wave * 35;
            fog.near = 13 - warn * 2 - wave * 5;
            fog.color.setStyle(wave ? '#879681' : warn > 0 ? '#394a39' : '#14251a');
            if (scene.background instanceof THREE.Color) scene.background.copy(fog.color).multiplyScalar(wave ? .72 : .58);
        }
    });

    return <group>
        <ViveiroBackdrop />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -24]} material={M9.ground}><planeGeometry args={[76, 64]} /></mesh>
        {[[-35, -24, .2], [35, -24, -.2]].map(([x, z, rz], i) => (
            <mesh key={i} position={[x, 2, z]} rotation={[0, 0, rz]} material={M9.root}><boxGeometry args={[6, 8, 60]} /></mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10.5, -24]} material={M9.canopy}><planeGeometry args={[80, 66]} /></mesh>

        <ambientLight ref={amb} color="#71876c" intensity={.82} />
        <hemisphereLight ref={hemi} color="#bdd6aa" groundColor="#263527" intensity={1.02} />
        <directionalLight position={[8, 14, -6]} intensity={.72} color="#d9edbc" />

        <Trees />
        <GodRays />
        <MossPatches />
        <Fireflies />
        <LeafDrift />
        <RedThread />
        <MemoryBranches />
        <RelicShrines />
        <Ocos />
        <Raiz />
        <RootKnot />
        <CreatureSprites />
        <Wave />

        {/* A única lembrança do elevador: uma moldura caída e enraizada. */}
        <group position={[2.5, 0, 1.5]} rotation={[.12, .5, .06]}>
            <B a={[1.6, .18, .12]} p={[0, .1, 0]} m={M9.root} />
            <B a={[.14, 2.2, .12]} p={[-.75, 1.1, 0]} m={M9.root} r={[0, 0, .08]} />
            <B a={[.14, 1.7, .12]} p={ [.78, .85, 0]} m={M9.root} r={[0, 0, -.12]} />
            <mesh position={[.1, .9, .02]} material={M9.moss}><sphereGeometry args={[.35, 7, 6]} /></mesh>
        </group>
    </group>;
};

export default Floor9Forest;
