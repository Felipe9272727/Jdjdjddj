/**
 * Floor7.tsx — Andar 7 "Constelação" (espaço, gravidade baixa).
 *
 * As portas abrem num pad flutuando no VAZIO: céu preto estrelado, um planeta
 * ao longe, e um caminho de ilhas neon subindo em zigue-zague. Gravidade
 * lunar (branch `currentLevel === 7` no Player.tsx, constantes em f7Space.ts):
 * pulo alto e flutuante. Colete as 7 ESTRELAS da constelação — cair no vazio
 * só te devolve pro último checkpoint. Com as 7, o App traz o elevador de
 * volta (fim da linha… por enquanto).
 *
 * Auto-contido no padrão Floor4/Floor6: App monta o componente, chama
 * useFloor7Audio (1 linha) e reage via setOnF7Progress. Tudo procedural —
 * zero asset externo, roda offline na bancada.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { F7_PLATFORMS, F7_STARS, f7State, f7StarTaken, f7TryCollectStar } from './f7Space';
import type { QualityProfile } from './Settings';
import { configureFloor7Sfx, clearFloor7Sfx, playF7Star, startF7Pad, stopF7Pad } from './floor7Sfx';
import { getMusicBus, setMusicActive } from './musicDirector';

// ── Ciclo de áudio do andar (App chama 1 linha) ──────────────────────────────
export function useFloor7Audio(
    active: boolean,
    audioCtx: AudioContext | null,
    busRef: React.MutableRefObject<AudioNode | null>,
): void {
    useEffect(() => {
        if (!active || !audioCtx) return;
        configureFloor7Sfx(audioCtx, busRef.current);
        const bus = getMusicBus('floor7', 65);
        if (bus) startF7Pad(audioCtx, bus);
        setMusicActive('floor7', true);
        return () => {
            setMusicActive('floor7', false);
            stopF7Pad();
            clearFloor7Sfx();
        };
    }, [active, audioCtx, busRef]);
}

// ── Tema ──────────────────────────────────────────────────────────────────────
const FLOOR7 = {
    sky:     '#05060f',
    body:    '#141a2e',    // corpo das ilhas
    edge:    '#36e0ff',    // neon das bordas
    star:    '#ffd54f',
    planet:  '#7a4fd0',
    starDim: '#cdd6ff',
};

// ── Fundo espacial (sem fog — profundidade vem do starfield) ─────────────────
const SpaceSky: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color(FLOOR7.sky);
        scene.fog = null;
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

// ── Campo de estrelas (Points; contagem e raio respeitam o perfil) ───────────
const StarField: React.FC<{ profile: QualityProfile }> = ({ profile }) => {
    const { positions, count } = useMemo(() => {
        const n = profile.atmosphere ? 1400 : 550;
        const radius = Math.min(profile.far * 0.85, 95);
        const pos = new Float32Array(n * 3);
        let seed = 20260703;
        const rng = () => { seed = (seed * 16807) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };
        for (let i = 0; i < n; i++) {
            // casca esférica em volta do percurso (centro ~z 20)
            const theta = rng() * Math.PI * 2;
            const phi = Math.acos(rng() * 2 - 1);
            const r = radius * (0.55 + rng() * 0.45);
            pos[i * 3]     = Math.sin(phi) * Math.cos(theta) * r;
            pos[i * 3 + 1] = Math.cos(phi) * r * 0.7 + 6;
            pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r + 20;
        }
        return { positions: pos, count: n };
    }, [profile]);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return g;
    }, [positions]);
    useEffect(() => () => geo.dispose(), [geo]);
    return (
        <points geometry={geo} frustumCulled={false}>
            <pointsMaterial size={0.28} sizeAttenuation color={FLOOR7.starDim} transparent opacity={0.9} depthWrite={false} />
        </points>
    );
};

// ── Planeta + "sol" decorativos (posição escala com o far do perfil) ─────────
const Planet: React.FC<{ profile: QualityProfile }> = ({ profile }) => {
    const ref = useRef<THREE.Mesh>(null!);
    const d = Math.min(profile.far * 0.6, 60);
    const r = d * 0.28;
    useFrame((_, dt) => { ref.current.rotation.y += dt * 0.02; });
    const tex = useMemo(() => {
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 32;
        const c = cv.getContext('2d')!;
        const grad = c.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0, '#9a6ff0'); grad.addColorStop(0.5, FLOOR7.planet); grad.addColorStop(1, '#3c2470');
        c.fillStyle = grad; c.fillRect(0, 0, 64, 32);
        c.globalAlpha = 0.25; c.fillStyle = '#c9b0ff';
        for (let i = 0; i < 5; i++) c.fillRect(0, 4 + i * 6, 64, 2);       // faixas de gás
        const t = new THREE.CanvasTexture(cv);
        return t;
    }, []);
    return (
        <group>
            <mesh ref={ref} position={[-d * 0.75, d * 0.42, d * 0.9]}>
                <sphereGeometry args={[r, 24, 18]} />
                <meshBasicMaterial map={tex} toneMapped={false} />
            </mesh>
            {/* “sol” distante — dá o key light das ilhas */}
            <mesh position={[d * 0.8, d * 0.55, -d * 0.4]}>
                <sphereGeometry args={[r * 0.22, 12, 10]} />
                <meshBasicMaterial color="#fff3d6" toneMapped={false} />
            </mesh>
            <directionalLight position={[d * 0.8, d * 0.55, -d * 0.4]} intensity={1.1} color="#fff3d6" />
        </group>
    );
};

// ── Ilhas: DOIS instancedMesh (corpos + 4 fitas neon por ilha), estáticos ────
const Islands: React.FC = () => {
    const bodyRef = useRef<THREE.InstancedMesh>(null!);
    const stripRef = useRef<THREE.InstancedMesh>(null!);
    const n = F7_PLATFORMS.length;
    useEffect(() => {
        const m = new THREE.Matrix4();
        F7_PLATFORMS.forEach((p, i) => {
            m.makeScale(p.hw * 2, 0.6, p.hd * 2);
            m.setPosition(p.cx, p.topY - 0.3, p.cz);
            bodyRef.current.setMatrixAt(i, m);
            // 4 fitas neon nas bordas do topo
            const t = 0.09;
            const y = p.topY - 0.02;
            const strips: [number, number, number, number, number][] = [
                [p.cx, y, p.cz - p.hd + t / 2, p.hw * 2, t],
                [p.cx, y, p.cz + p.hd - t / 2, p.hw * 2, t],
                [p.cx - p.hw + t / 2, y, p.cz, t, p.hd * 2],
                [p.cx + p.hw - t / 2, y, p.cz, t, p.hd * 2],
            ];
            strips.forEach((st, k) => {
                m.makeScale(st[3], 0.1, st[4]);
                m.setPosition(st[0], st[1], st[2]);
                stripRef.current.setMatrixAt(i * 4 + k, m);
            });
        });
        bodyRef.current.instanceMatrix.needsUpdate = true;
        stripRef.current.instanceMatrix.needsUpdate = true;
    }, []);
    return (
        <group>
            <instancedMesh ref={bodyRef} args={[undefined, undefined, n]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={FLOOR7.body} roughness={0.65} metalness={0.25} />
            </instancedMesh>
            <instancedMesh ref={stripRef} args={[undefined, undefined, n * 4]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color={FLOOR7.edge} toneMapped={false} />
            </instancedMesh>
        </group>
    );
};

// ── Estrela coletável (octaedro dourado girando + halo aditivo) ──────────────
const StarPickup: React.FC<{ id: number; x: number; y: number; z: number }> = ({ id, x, y, z }) => {
    const groupRef = useRef<THREE.Group>(null!);
    const coreRef = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        const taken = f7StarTaken(id);
        groupRef.current.visible = !taken;
        if (taken) return;
        const t = clock.getElapsedTime();
        coreRef.current.rotation.y = t * 1.8;
        groupRef.current.position.y = y + Math.sin(t * 1.6 + id * 1.3) * 0.12;
    });
    return (
        <group ref={groupRef} position={[x, y, z]}>
            <mesh ref={coreRef}>
                <octahedronGeometry args={[0.42, 0]} />
                <meshBasicMaterial color={FLOOR7.star} toneMapped={false} />
            </mesh>
            <mesh scale={1.7}>
                <octahedronGeometry args={[0.42, 0]} />
                <meshBasicMaterial color={FLOOR7.star} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
        </group>
    );
};

// ── Farol do mirante (coluna de luz; acende forte quando a constelação fecha) ─
const Beacon: React.FC = () => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    const last = F7_PLATFORMS[F7_PLATFORMS.length - 1];
    useFrame(() => {
        if (matRef.current) matRef.current.opacity = f7State.won ? 0.5 : 0.12;
    });
    return (
        <mesh position={[last.cx, last.topY + 6, last.cz]}>
            <cylinderGeometry args={[0.5, 0.9, 12, 12, 1, true]} />
            <meshBasicMaterial ref={matRef} color={FLOOR7.edge} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
    );
};

// ── Ambiente completo ─────────────────────────────────────────────────────────
interface Floor7EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    profile: QualityProfile;
}

export const Floor7Environment: React.FC<Floor7EnvironmentProps> = ({ playerPositionRef, profile }) => {
    // coleta de estrelas por proximidade (10Hz)
    const nextCheckAt = useRef(0);
    useFrame(() => {
        const now = performance.now();
        if (now < nextCheckAt.current) return;
        nextCheckAt.current = now + 100;
        const p = playerPositionRef.current;
        const got = f7TryCollectStar(p.x, p.y, p.z);
        if (got >= 0) playF7Star(f7State.stars);
    });

    return (
        <group>
            <SpaceSky />
            <ambientLight intensity={0.22} color="#8a97d6" />
            <StarField profile={profile} />
            <Planet profile={profile} />
            <Islands />
            {F7_STARS.map((st) => <StarPickup key={st.id} id={st.id} x={st.x} y={st.y} z={st.z} />)}
            <Beacon />
        </group>
    );
};

// ── Prefetch ESPECULATIVO (DeepSpec) ─────────────────────────────────────────
// O App monta isto assim que o Andar 7 vira um destino PROVÁVEL — ex.: o 3º
// fusível do Andar 6 arma o elevador pro 7 SEGUNDOS antes de o player sequer
// embarcar. Shaders compilam e a geometria sobe pra GPU fora da tela; se o
// player nunca embarcar, o rascunho é descartado sem custo.
export const Floor7Prefetch: React.FC = () => (
    <group position={[0, -60, 0]} scale={0.01}>
        <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={FLOOR7.body} roughness={0.65} metalness={0.25} /></mesh>
        <mesh position={[2, 0, 0]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={FLOOR7.edge} toneMapped={false} /></mesh>
        <mesh position={[4, 0, 0]}><octahedronGeometry args={[0.4, 0]} /><meshBasicMaterial color={FLOOR7.star} toneMapped={false} /></mesh>
        <mesh position={[6, 0, 0]}>
            <octahedronGeometry args={[0.4, 0]} />
            <meshBasicMaterial color={FLOOR7.star} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
    </group>
);

export default Floor7Environment;
